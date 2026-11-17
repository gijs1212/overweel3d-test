import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };
const OPEN_ORDER_FILTER = "(completed,cancelled)";
const ORDER_STATUSES = new Set([
  "draft", "submitted", "under_review", "waiting_for_approval",
  "approved_by_customer", "rejected_by_customer", "waiting_for_payment",
  "in_production", "completed", "cancelled",
]);

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizePrintName(value: string) {
  return value.toLowerCase().replace(/\\/g, "/").split("/").pop()!
    .replace(/\.(gcode|3mf)$/i, "").replace(/[_\s-]*(plate|plaat)[_\s-]*\d+$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "Gebruik POST met een JSON-actie." }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (token.length < 32 || token.length > 256) return reply({ error: "Ongeldige Home Assistant-sleutel." }, 401);
    const tokenHash = await sha256(token);
    const { data: apiToken, error: tokenError } = await admin.from("home_assistant_tokens")
      .select("id").eq("token_hash", tokenHash).eq("active", true).maybeSingle();
    if (tokenError || !apiToken) return reply({ error: "Ongeldige of ingetrokken Home Assistant-sleutel." }, 401);
    await admin.from("home_assistant_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", apiToken.id);

    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "list_orders") {
      const { data, error } = await admin.from("orders")
        .select("id,order_number,customer_name,customer_email,status,final_price,instant_quote_price,total_plates,plate_print_statuses,plate_runs_required_per_plate,plate_runs_completed,submitted_at")
        .not("status", "in", OPEN_ORDER_FILTER).order("submitted_at", { ascending: false });
      if (error) throw error;
      return reply({ orders: data || [] });
    }

    if (action === "get_order") {
      const orderId = requireUuid(body.orderId, "orderId");
      const { data: order, error } = await admin.from("orders").select("*").eq("id", orderId)
        .not("status", "in", OPEN_ORDER_FILTER).maybeSingle();
      if (error) throw error;
      if (!order) return reply({ error: "Actieve bestelling niet gevonden." }, 404);
      const [messages, jobs, files] = await Promise.all([
        admin.from("order_messages").select("id,sender_type,message,read,created_at").eq("order_id", orderId).order("created_at"),
        admin.from("print_jobs").select("*").eq("order_id", orderId).order("plate_number"),
        admin.from("order_files").select("id,original_filename,file_size,mime_type,created_at").eq("order_id", orderId).order("created_at"),
      ]);
      const relatedError = messages.error || jobs.error || files.error;
      if (relatedError) throw relatedError;
      return reply({ order, messages: messages.data || [], printJobs: jobs.data || [], files: files.data || [] });
    }

    if (action === "set_status") {
      const orderId = requireUuid(body.orderId, "orderId");
      const status = String(body.status || "");
      if (!ORDER_STATUSES.has(status)) return reply({ error: "Ongeldige bestelstatus." }, 400);
      const order = await getOpenOrder(admin, orderId);
      const { error } = await admin.from("orders").update({ status }).eq("id", order.id);
      if (error) throw error;
      await admin.from("order_events").insert({ order_id: order.id, event_type: "status_changed", event_description: `Status gewijzigd naar ${status} via Home Assistant.`, visible_to_customer: true });
      return reply({ success: true, orderId, status });
    }

    if (action === "set_price") {
      const orderId = requireUuid(body.orderId, "orderId");
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return reply({ error: "Prijs moet een geldig positief bedrag zijn." }, 400);
      const order = await getOpenOrder(admin, orderId);
      const { error } = await admin.from("orders").update({ final_price: Math.round(price * 100) / 100 }).eq("id", order.id);
      if (error) throw error;
      await admin.from("order_events").insert({ order_id: order.id, event_type: "price_changed", event_description: `Prijs ingesteld op €${price.toFixed(2)} via Home Assistant.`, visible_to_customer: true });
      return reply({ success: true, orderId, price: Math.round(price * 100) / 100 });
    }

    if (action === "send_message") {
      const orderId = requireUuid(body.orderId, "orderId");
      const message = String(body.message || "").trim();
      if (!message || message.length > 4_000) return reply({ error: "Bericht moet tussen 1 en 4000 tekens zijn." }, 400);
      await getOpenOrder(admin, orderId);
      const { error } = await admin.from("order_messages").insert({ order_id: orderId, sender_type: "admin", sender_id: null, message });
      if (error) throw error;
      return reply({ success: true });
    }

    if (action === "list_printers") {
      const [printers, suggestions] = await Promise.all([
        admin.from("printers").select("id,name,model,status,current_file,current_plate,progress,remaining_minutes,last_seen_at").eq("active", true).order("name"),
        admin.from("print_jobs").select("id,order_id,printer_id,plate_number,plate_name,expected_file_name,runs_required,runs_completed,status,observed_file_name,suggested_at").eq("status", "suggested").order("suggested_at"),
      ]);
      if (printers.error || suggestions.error) throw printers.error || suggestions.error;
      return reply({ printers: printers.data || [], suggestions: suggestions.data || [] });
    }

    if (action === "approve_plate_match") {
      const orderId = requireUuid(body.orderId, "orderId");
      const printerId = requireUuid(body.printerId, "printerId");
      const plateNumber = positiveInteger(body.plateNumber, "plateNumber");
      await getOpenOrder(admin, orderId);
      const { data: printer, error: printerError } = await admin.from("printers").select("id,current_file,current_plate,status").eq("id", printerId).maybeSingle();
      if (printerError) throw printerError;
      if (!printer || !["printing", "paused"].includes(printer.status) || !printer.current_file) return reply({ error: "Printer heeft geen actieve print." }, 409);
      const { data: job, error: jobError } = await admin.from("print_jobs").select("*").eq("order_id", orderId).eq("plate_number", plateNumber).maybeSingle();
      if (jobError) throw jobError;
      if (!job || ["completed", "cancelled"].includes(job.status)) return reply({ error: "Actieve plaatkoppeling niet gevonden." }, 404);
      const expected = normalizePrintName(job.expected_file_name || "");
      const observed = normalizePrintName(printer.current_file);
      if (!expected || !observed || !(expected.includes(observed) || observed.includes(expected))) return reply({ error: "Actief printerbestand komt niet overeen met deze 3MF/plaat." }, 409);
      await admin.from("print_jobs").update({ status: "queued", printer_id: null, suggested_at: null })
        .eq("printer_id", printerId).eq("status", "suggested").neq("id", job.id);
      const approvedAt = new Date().toISOString();
      const { error } = await admin.from("print_jobs").update({
        printer_id: printerId, status: "approved", approved_at: approvedAt, approved_by: null,
        approved_via: "home_assistant", observed_file_name: printer.current_file,
        comparison: { match: true, approvedAt, source: "home_assistant", reportedPlate: printer.current_plate, chosenPlate: plateNumber },
      }).eq("id", job.id);
      if (error) throw error;
      return reply({ success: true, jobId: job.id, orderId, plateNumber, runNumber: Number(job.runs_completed || 0) + 1 });
    }

    if (action === "mark_plate_printed") {
      const orderId = requireUuid(body.orderId, "orderId");
      const plateNumber = positiveInteger(body.plateNumber, "plateNumber");
      await getOpenOrder(admin, orderId);
      const { data: job, error: jobError } = await admin.from("print_jobs").select("id,runs_completed,runs_required,status").eq("order_id", orderId).eq("plate_number", plateNumber).maybeSingle();
      if (jobError) throw jobError;
      if (!job) return reply({ error: "Plaat niet gevonden." }, 404);
      if (job.status === "cancelled" || Number(job.runs_completed) >= Number(job.runs_required)) return reply({ error: "Deze plaat is al het vereiste aantal keer geprint." }, 409);
      const { data, error } = await admin.rpc("mark_print_job_run_from_integration", { p_job_id: job.id });
      if (error) throw error;
      return reply({ success: true, result: data });
    }

    return reply({ error: "Onbekende actie." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende Home Assistant-fout";
    return reply({ error: message }, message.includes("niet gevonden") ? 404 : 500);
  }
});

function requireUuid(value: unknown, field: string) {
  const text = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(`${field} is ongeldig.`);
  return text;
}

function positiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10_000) throw new Error(`${field} is ongeldig.`);
  return number;
}

async function getOpenOrder(client: ReturnType<typeof createClient>, orderId: string) {
  const { data, error } = await client.from("orders").select("id,status").eq("id", orderId).not("status", "in", OPEN_ORDER_FILTER).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Actieve bestelling niet gevonden.");
  return data;
}


