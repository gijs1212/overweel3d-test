import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, orderId } = await req.json();
    if (!type || !orderId) throw new Error("Type and orderId are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    const orderLink = `https://overweel3d.gijsoverweel.nl/order/${order.customer_order_token}`;

    if (type === "order_confirmation") {
      // Confirmation email to customer
      await resend.emails.send({
        from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
        to: [order.customer_email],
       subject: `✅ Bevestiging bestelling ${order.order_number}`,
        html: buildConfirmationEmail(order, orderLink),
      });

      // Notification to admin
      await resend.emails.send({
        from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
        to: ["gijsoverweel@gmail.com"],
        subject: `🖨️ Nieuwe bestelling ${order.order_number} van ${order.customer_name}`,
        html: buildAdminNotificationEmail(order),
      });

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "order_submitted",
        event_description: "Bestelling is ingediend en bevestigingsmail is verzonden.",
        visible_to_customer: true,
      });
    } else if (type === "order_updated") {
      await resend.emails.send({
        from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
        to: [order.customer_email],
       subject: `📋 Update voor bestelling ${order.order_number}`,
        html: buildUpdateEmail(order, orderLink),
      });

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "order_updated",
        event_description: "Bestelling is bijgewerkt. De klant is per e-mail geïnformeerd.",
        visible_to_customer: true,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildConfirmationEmail(order: any, orderLink: string): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1B365D, #2d4a7c); padding: 30px; text-align: center; color: white; }
    .content { padding: 30px; background: #f8fafc; }
    .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .section h2 { color: #1B365D; margin-top: 0; font-size: 18px; border-bottom: 2px solid #00b4d8; padding-bottom: 10px; }
    .btn { display: inline-block; background: #00b4d8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
  </style></head><body>
    <div class="header"><h1>Bedankt voor uw bestelling! 🎉</h1></div>
    <div class="content">
      <p>Beste ${order.customer_name},</p>
      <p>Bedankt voor uw bestelling bij Overweel3D! We hebben uw aanvraag ontvangen en gaan er direct mee aan de slag.</p>

      <div class="section">
        <h2>📦 Bestelgegevens</h2>
        <p><strong>Bestelnummer:</strong> ${order.order_number}</p>
        <p><strong>Materiaal:</strong> ${order.material}</p>
        <p><strong>Kleur:</strong> ${order.color}</p>
        <p><strong>Aantal:</strong> ${order.quantity}</p>
        <p><strong>Indicatieprijs:</strong> €${Number(order.instant_quote_price).toFixed(2)}</p>
      </div>

      <div class="warning">
        ⚠️ <strong>Belangrijk:</strong> De indicatieprijs is slechts een schatting en is nooit de definitieve prijs. De definitieve prijs wordt na controle door ons vastgesteld en aan u gecommuniceerd.
      </div>

      <div class="section">
        <h2>📍 Bezorgadres</h2>
        <p>${order.customer_name}<br>${order.shipping_address || order.billing_address}<br>${order.postal_code} ${order.city}<br>${order.country}</p>
      </div>

      ${order.notes ? `<div class="section"><h2>📝 Uw opmerkingen</h2><p>${order.notes}</p></div>` : ""}

      <div style="text-align: center; margin: 24px 0;">
        <a href="${orderLink}" class="btn">📋 Bekijk uw bestelling</a>
      </div>

      <p>Bewaar bovenstaande link om uw bestelling te volgen. U kunt hier ook de definitieve offerte bekijken en accepteren of afwijzen.</p>

      <div class="section">
        <h2>❓ Vragen?</h2>
        <p>Neem gerust contact met ons op via <a href="mailto:gijsoverweel@gmail.com" style="color: #00b4d8;">gijsoverweel@gmail.com</a>.</p>
      </div>
    </div>
    <div class="footer">
      <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
      <p>Overweel3D — Vorm. Functie. Filament.</p>
    </div>
  </body></html>`;
}

function buildAdminNotificationEmail(order: any): string {
  return `<!DOCTYPE html><html><body style="font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto;">
    <h2>🖨️ Nieuwe bestelling: ${order.order_number}</h2>
    <p><strong>Klant:</strong> ${order.customer_name} (${order.customer_email})</p>
    <p><strong>Materiaal:</strong> ${order.material}</p>
    <p><strong>Kleur:</strong> ${order.color}</p>
    <p><strong>Aantal:</strong> ${order.quantity}</p>
    <p><strong>Indicatieprijs:</strong> €${Number(order.instant_quote_price).toFixed(2)}</p>
    <p><strong>Adres:</strong> ${order.billing_address}, ${order.postal_code} ${order.city}</p>
    ${order.notes ? `<p><strong>Opmerkingen:</strong> ${order.notes}</p>` : ""}
    <p><strong>Telefoon:</strong> ${order.phone || "—"}</p>
    <hr>
    <p>Bekijk de bestelling in het admin dashboard.</p>
  </body></html>`;
}

function buildUpdateEmail(order: any, orderLink: string): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1B365D, #2d4a7c); padding: 30px; text-align: center; color: white; }
    .content { padding: 30px; background: #f8fafc; }
    .btn { display: inline-block; background: #00b4d8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
  </style></head><body>
    <div class="header"><h1>📋 Update voor je bestelling</h1></div>
    <div class="content">
      <p>Beste ${order.customer_name},</p>
      <p>Er is nieuwe informatie beschikbaar voor je bestelling <strong>${order.order_number}</strong>.</p>
      ${order.final_price ? `<p>De definitieve prijs is vastgesteld op: <strong style="font-size: 24px; color: #00b4d8;">€${Number(order.final_price).toFixed(2)}</strong></p>` : ""}
      <p>Bekijk je bestelling voor alle details en om de offerte te accepteren of af te wijzen.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${orderLink}" class="btn">Bekijk uw bestelling</a>
      </div>
    </div>
    <div class="footer">
      <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
    </div>
  </body></html>`;
}
