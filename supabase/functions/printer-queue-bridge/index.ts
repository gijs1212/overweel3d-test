import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

type SdFile = {
  path: string;
  display_name: string;
  size_bytes?: number | null;
  modified_at?: string | null;
  plates?: Array<{ number: number; name?: string; path?: string; detected_filaments?: Array<{ material?: string | null; color_name?: string | null; color_hex?: string | null }> }>;
  detected_material?: string | null;
  detected_color_name?: string | null;
  detected_filaments?: Array<{ material?: string | null; color_name?: string | null; color_hex?: string | null }>;
};

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
  const { data: printer, error: printerError } = await supabase
    .from("printers")
    .select("id,name,device_serial,bridge_token_hash,status,ftps_scan_paths,ftps_scan_requested_at,ftps_folder_scan_requested_at,ftps_scan_request_id,ftps_folder_scan_request_id,ftps_scan_completed_request_id,ftps_folder_scan_completed_request_id,print_start_request_id,print_start_completed_request_id")
    .eq("id", printerId)
    .maybeSingle();
  if (printerError) return json({ error: printerError.message }, 500);
  if (!printer?.bridge_token_hash || printer.bridge_token_hash !== await hash(token)) return json({ error: "Ongeldige bridge-token" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige JSON" }, 400); }
  const action = String(body.action || "");

  if (action === "notify_manual_intervention") {
    const itemId = String(body.item_id || "");
    const detail = String(body.error || "De automatische printstart kon niet worden afgerond.").slice(0, 2000);
    const alertId = String(body.alert_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!itemId) return json({ error: "Wachtrij-item ontbreekt" }, 400);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "E-mailservice niet geconfigureerd" }, 500);
    const { data: item, error: itemError } = await supabase.from("printer_queue_items")
      .select("id,file_name,plate_number,status")
      .eq("id", itemId).eq("printer_id", printerId).maybeSingle();
    if (itemError) return json({ error: itemError.message }, 500);
    if (!item) return json({ error: "Wachtrij-item niet gevonden" }, 404);
    const result = await new Resend(resendKey).emails.send({
      from: "Overweel3D printers <printers@overweel3d.gijsoverweel.nl>",
      to: ["gijsoverweel@gmail.com"],
      subject: `Handmatig ingrijpen nodig: ${item.file_name} · plaat ${item.plate_number}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111"><h1>Handmatig ingrijpen nodig</h1><p>De automatische printstart kan niet zelfstandig verder.</p><p><strong>Printer:</strong> ${escapeHtml(printer.name)} (${escapeHtml(printer.device_serial)})<br><strong>Bestand:</strong> ${escapeHtml(item.file_name)}<br><strong>Plaat:</strong> ${escapeHtml(item.plate_number)}<br><strong>Status:</strong> ${escapeHtml(item.status)}</p><p><strong>Melding:</strong><br>${escapeHtml(detail)}</p><p>Open het admin-dashboard en controleer Bambu Connect, de AMS-toewijzing en de printer.</p></div>`,
    }, { idempotencyKey: `printer-intervention-${itemId}-${alertId}` });
    if (result.error) return json({ error: result.error.message }, 502);
    return json({ success: true });
  }

  if (action === "scan_config") {
    const { data: metadataCandidates } = await supabase.from("printer_sd_files")
      .select("id,path,size_bytes,plates,metadata_request_id,metadata_completed_request_id,metadata_requested_plate_number")
      .eq("printer_id", printerId).eq("available", true).gt("metadata_request_id", 0)
      .order("updated_at").limit(25);
    const metadataRequest = (metadataCandidates || []).find((file) => Number(file.metadata_request_id) > Number(file.metadata_completed_request_id));
    return json({
      scan_paths: Array.isArray(printer.ftps_scan_paths) ? printer.ftps_scan_paths : ["/", "/cache"],
      scan_requested_at: printer.ftps_scan_requested_at,
      folder_scan_requested_at: printer.ftps_folder_scan_requested_at,
      scan_request_id: printer.ftps_scan_request_id,
      folder_scan_request_id: printer.ftps_folder_scan_request_id,
      scan_completed_request_id: printer.ftps_scan_completed_request_id,
      folder_scan_completed_request_id: printer.ftps_folder_scan_completed_request_id,
      metadata_request: metadataRequest || null,
      print_start_request_id: printer.print_start_request_id,
      print_start_completed_request_id: printer.print_start_completed_request_id,
    });
  }

  if (action === "ack_print_start") {
    const requestId = Number(body.request_id || 0);
    if (requestId <= 0) return json({ error: "Ongeldig startverzoek" }, 400);
    const { error } = await supabase.from("printers").update({ print_start_completed_request_id: requestId }).eq("id", printerId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "sync_host_pc_status") {
    const status = String(body.status || "");
    if (!['on', 'off'].includes(status)) return json({ error: "Ongeldige pc-status" }, 400);
    const uptime = Number(body.uptime_seconds);
    const { error } = await supabase.from("printers").update({
      host_pc_status: status,
      host_pc_checked_at: new Date().toISOString(),
      host_pc_uptime_seconds: status === "on" && Number.isFinite(uptime) ? Math.max(0, uptime) : null,
    }).eq("id", printerId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "sync_file_metadata") {
    const fileId = String(body.file_id || "");
    const requestId = Number(body.request_id || 0);
    const filaments = Array.isArray(body.detected_filaments) ? body.detected_filaments.slice(0, 32) : [];
    const incomingPlates = Array.isArray(body.plates) ? body.plates.slice(0, 100) : [];
    const { data: existingFile } = await supabase.from("printer_sd_files").select("path,plates").eq("id", fileId).eq("printer_id", printerId).maybeSingle();
    let plates = incomingPlates;
    if (String(existingFile?.path || "").startsWith("gcode-group:") && Array.isArray(existingFile?.plates)) {
      const replacements = new Map(incomingPlates.map((plate) => [Number(plate?.number), plate]));
      plates = existingFile.plates.map((plate: Record<string, unknown>) => {
        const replacement = replacements.get(Number(plate?.number));
        return replacement ? { ...plate, ...replacement, path: plate.path } : plate;
      });
    }
    const { error } = await supabase.from("printer_sd_files").update({
      detected_filaments: filaments,
      detected_material: filaments[0]?.material || null,
      detected_color_name: filaments[0]?.color_name || null,
      ...(plates.length ? { plates } : {}),
      metadata_completed_request_id: requestId,
      metadata_last_error: body.error ? String(body.error).slice(0, 2000) : null,
    }).eq("id", fileId).eq("printer_id", printerId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  if (action === "sync_files") {
    const files = Array.isArray(body.files) ? body.files as SdFile[] : [];
    if (files.length > 1000) return json({ error: "Te veel SD-kaartbestanden" }, 413);
    const now = new Date().toISOString();
    const { data: existingFiles } = await supabase.from("printer_sd_files")
      .select("path,plates,detected_filaments,detected_material,detected_color_name,metadata_completed_request_id")
      .eq("printer_id", printerId);
    const existingByPath = new Map((existingFiles || []).map((file) => [file.path, file]));
    const normalized = files
      .filter((file) => typeof file?.path === "string" && file.path.trim() && typeof file.display_name === "string" && file.display_name.trim())
      .map((file) => {
        const existing = existingByPath.get(file.path.trim());
        const keepParsed = Number(existing?.metadata_completed_request_id || 0) > 0;
        return ({
        printer_id: printerId,
        path: file.path.trim().slice(0, 1000),
        display_name: file.display_name.trim().slice(0, 255),
        size_bytes: Number.isFinite(Number(file.size_bytes)) ? Math.max(0, Number(file.size_bytes)) : null,
        modified_at: file.modified_at || null,
        plates: keepParsed ? existing.plates : Array.isArray(file.plates) ? file.plates.filter((plate) => Number.isInteger(Number(plate.number)) && Number(plate.number) > 0).slice(0, 100) : [],
        detected_material: keepParsed ? existing.detected_material : file.detected_material ? String(file.detected_material).slice(0, 80) : null,
        detected_color_name: keepParsed ? existing.detected_color_name : file.detected_color_name ? String(file.detected_color_name).slice(0, 120) : null,
        detected_filaments: keepParsed ? existing.detected_filaments : Array.isArray(file.detected_filaments) ? file.detected_filaments.slice(0, 32).map((item) => ({
          material: item?.material ? String(item.material).slice(0, 80) : null,
          color_name: item?.color_name ? String(item.color_name).slice(0, 120) : null,
          color_hex: item?.color_hex && /^#[0-9a-f]{6}$/i.test(String(item.color_hex)) ? String(item.color_hex).toUpperCase() : null,
        })) : [],
        available: true,
        last_seen_at: now,
      });
      });
    const { error: staleError } = await supabase.from("printer_sd_files").update({ available: false }).eq("printer_id", printerId);
    if (staleError) return json({ error: staleError.message }, 500);
    if (normalized.length) {
      const { error } = await supabase.from("printer_sd_files").upsert(normalized, { onConflict: "printer_id,path" });
      if (error) return json({ error: error.message }, 500);
    }
    const listing = Array.isArray(body.directory_listing) ? body.directory_listing.slice(0, 5000) : [];
    await supabase.from("printers").update({
      sd_card_last_seen_at: now,
      ftps_directory_listing: listing,
      ftps_last_error: null,
      ftps_scan_completed_request_id: Number(body.request_id || 0),
    }).eq("id", printerId);
    return json({ success: true, files: normalized.length });
  }

  if (action === "sync_directories") {
    const listing = Array.isArray(body.directory_listing) ? body.directory_listing.slice(0, 5000) : [];
    await supabase.from("printers").update({
      ftps_directory_listing: listing,
      ftps_last_error: null,
      sd_card_last_seen_at: new Date().toISOString(),
      ftps_folder_scan_completed_request_id: Number(body.request_id || 0),
    }).eq("id", printerId);
    return json({ success: true, directories: listing.filter((entry) => entry?.type === "directory").length });
  }

  if (action === "scan_error") {
    await supabase.from("printers").update({
      ftps_last_error: String(body.error || "Onbekende FTPS-fout").slice(0, 2000),
    }).eq("id", printerId);
    return json({ success: true });
  }

  if (action === "next") {
    const manualTrigger = body.manual_trigger === true;
    if (!manualTrigger) return json({ command: null, reason: "manual_trigger_required" });
    if (printer.status !== "idle") return json({ command: null, reason: "printer_not_idle" });
    await supabase.from("printer_queue_items").update({ status: "queued", command_claimed_at: null, bridge_error: "Oude onbevestigde start is automatisch vrijgegeven." })
      .eq("printer_id", printerId).eq("status", "starting").lt("command_claimed_at", new Date(Date.now() - 5 * 60_000).toISOString());
    const { data, error } = await supabase.rpc("claim_next_printer_queue_item", { p_printer_id: printerId });
    if (error) return json({ error: error.message }, 500);
    return json({ command: data || null });
  }

  if (action === "active") {
    const { data, error } = await supabase.from("printer_queue_items").select("id,status,file_name,command_claimed_at")
      .eq("printer_id", printerId).in("status", ["starting", "printing"]).order("command_claimed_at").limit(1).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ item: data || null });
  }

  if (action === "ack") {
    const itemId = String(body.item_id || "");
    const status = String(body.status || "");
    if (!itemId || !["printing", "completed", "failed", "paused", "queued"].includes(status)) return json({ error: "Ongeldige bevestiging" }, 400);
    const patch: Record<string, unknown> = { status, bridge_error: body.error ? String(body.error).slice(0, 1000) : null };
    if (status === "printing") patch.started_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    if (status === "queued") { patch.command_claimed_at = null; patch.blocked_reason = null; }
    const { error } = await supabase.from("printer_queue_items").update(patch).eq("id", itemId).eq("printer_id", printerId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  return json({ error: "Onbekende actie" }, 400);
});
