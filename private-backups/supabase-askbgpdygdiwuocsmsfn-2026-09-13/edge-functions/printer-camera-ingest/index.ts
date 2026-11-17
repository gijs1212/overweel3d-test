import { createClient } from "@supabase/supabase-js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const printerId = req.headers.get("x-printer-id") || "";
  const token = req.headers.get("x-bridge-token") || "";
  if (!printerId || !token) return json({ error: "Bridgegegevens ontbreken" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: printer } = await supabase.from("printers").select("id,bridge_token_hash").eq("id", printerId).maybeSingle();
  const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  if (!printer?.bridge_token_hash || printer.bridge_token_hash !== tokenHash) return json({ error: "Ongeldige bridge-token" }, 403);

  const contentType = (req.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!['image/jpeg', 'image/png'].includes(contentType)) return json({ error: "Alleen JPEG- of PNG-beelden zijn toegestaan" }, 415);
  const image = await req.arrayBuffer();
  if (!image.byteLength || image.byteLength > 5 * 1024 * 1024) return json({ error: "Camerabeeld is leeg of te groot" }, 413);
  const path = `${printerId}/latest`;
  const { error: uploadError } = await supabase.storage.from("printer-camera").upload(path, image, {
    contentType,
    cacheControl: "1",
    upsert: true,
  });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const reportedPlateStatus = req.headers.get("x-plate-check-status") || "unknown";
  const plateCheckStatus = ["correct", "attention", "unknown"].includes(reportedPlateStatus) ? reportedPlateStatus : "unknown";
  const capturedAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("printers").update({
    camera_status: "available",
    camera_last_seen_at: capturedAt,
    plate_check_status: plateCheckStatus,
  }).eq("id", printerId);
  if (updateError) return json({ error: updateError.message }, 500);
  return json({ success: true, path, captured_at: capturedAt, plate_check_status: plateCheckStatus });
});


