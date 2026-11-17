import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { Resend } from "resend";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!url || !serviceKey || !resendKey) return json({ error: "Service niet geconfigureerd" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: settings, error: settingsError } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["abandoned_cart_enabled", "abandoned_cart_hours"]);
  if (settingsError) return json({ error: settingsError.message }, 500);
  const setting = new Map((settings || []).map((row) => [row.key, row.value]));
  if (setting.get("abandoned_cart_enabled") === false) return json({ success: true, skipped: true, sentCount: 0 });

  const hours = Math.max(1, Math.min(168, Number(setting.get("abandoned_cart_hours") || 24)));
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data: carts, error } = await admin
    .from("saved_carts")
    .select("id,email,items,subtotal")
    .eq("status", "active")
    .eq("reminder_count", 0)
    .lt("updated_at", cutoff)
    .neq("email", "")
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  const resend = new Resend(resendKey);
  let sentCount = 0;
  for (const cart of carts || []) {
    if (!Array.isArray(cart.items) || cart.items.length === 0) continue;
    const result = await resend.emails.send({
      from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
      to: [cart.email],
      subject: "Je winkelmandje bij Overweel3D staat nog klaar",
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#14213d"><h1>Je ontwerp staat nog klaar</h1><p>Je had ${cart.items.length} ${cart.items.length === 1 ? "artikel" : "artikelen"} in je winkelmandje met een waarde van <strong>€${Number(cart.subtotal).toFixed(2)}</strong>.</p><p>Je kunt verdergaan waar je gebleven was.</p><p><a href="https://overweel3d.gijsoverweel.nl/bestellen" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Winkelmandje openen</a></p><p style="font-size:12px;color:#64748b">Deze herinnering wordt maar één keer verstuurd.</p></div>`,
    }, { idempotencyKey: `abandoned-cart-${cart.id}` });
    if (!result.error) {
      sentCount += 1;
      await admin.from("saved_carts").update({
        status: "abandoned",
        reminder_count: 1,
        reminder_sent_at: new Date().toISOString(),
      }).eq("id", cart.id).eq("reminder_count", 0);
    }
  }
  return json({ success: true, selectedCount: carts?.length || 0, sentCount });
});
