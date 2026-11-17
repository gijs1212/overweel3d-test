import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { Resend } from "resend";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !serviceKey || !resendKey) return json({ error: "Service niet geconfigureerd" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: printers, error } = await admin.from("printers")
    .select("id,name,model,device_serial,status,last_seen_at,created_at,offline_since,offline_alert_sent_at")
    .neq("status", "maintenance");
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  const threshold = now - 60 * 60 * 1000;
  const resend = new Resend(resendKey);
  let sentCount = 0;

  for (const printer of printers || []) {
    const offlineStart = printer.status === "offline"
      ? printer.offline_since || printer.last_seen_at || printer.created_at
      : printer.last_seen_at || printer.created_at;
    const offlineStartMs = new Date(offlineStart).getTime();
    if (!Number.isFinite(offlineStartMs) || offlineStartMs > threshold) continue;
    const notifiedMs = printer.offline_alert_sent_at ? new Date(printer.offline_alert_sent_at).getTime() : 0;
    if (notifiedMs >= offlineStartMs) continue;

    const idempotencyKey = `printer-offline-${printer.id}-${offlineStartMs}`;
    const result = await resend.emails.send({
      from: "Overweel3D printers <printers@overweel3d.gijsoverweel.nl>",
      to: ["gijsoverweel@gmail.com"],
      subject: `Printer ${printer.name} is langer dan één uur offline`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111"><h1>Printer offline</h1><p><strong>${escapeHtml(printer.name)}</strong> (${escapeHtml(printer.model)}, serienummer ${escapeHtml(printer.device_serial)}) is sinds ${new Date(offlineStartMs).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })} niet meer online gezien.</p><p>Controleer de printer en de lokale Bambu-bridge.</p></div>`,
    }, { idempotencyKey });
    if (result.error) {
      console.error(`Offline-waarschuwing voor ${printer.id} mislukt:`, result.error);
      continue;
    }
    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin.from("printers")
      .update({ offline_alert_sent_at: sentAt })
      .eq("id", printer.id)
      .or(`offline_alert_sent_at.is.null,offline_alert_sent_at.lt.${new Date(offlineStartMs).toISOString()}`);
    if (!updateError) sentCount += 1;
  }

  return json({ success: true, checkedCount: printers?.length || 0, sentCount });
});


