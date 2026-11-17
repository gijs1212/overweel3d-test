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
    const { token, action } = await req.json();
    if (!token || !action) throw new Error("Token and action are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_order_token", token)
      .single();

    if (error || !order) throw new Error("Order not found");

    const now = new Date().toISOString();
    const orderLink = `https://overweel3d.gijsoverweel.nl/order/${token}`;

    if (action === "accept") {
      await supabase
        .from("orders")
        .update({ status: "approved_by_customer", approved_at: now })
        .eq("id", order.id);

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "customer_accepted",
        event_description: "Klant heeft de offerte geaccepteerd.",
        visible_to_customer: true,
      });

      // Email to customer
      await resend.emails.send({
        from: "Overweel3D <info@overweel3d.gijsoverweel.nl>",
        to: [order.customer_email],
       subject: `✅ Bestelling ${order.order_number} geaccepteerd`,
        html: buildAcceptEmailCustomer(order, orderLink),
      });

      // Email to admin
      await resend.emails.send({
        from: "Overweel3D <info@overweel3d.gijsoverweel.nl>",
        to: ["gijsoverweel@gmail.com"],
        subject: `✅ ${order.customer_name} heeft bestelling ${order.order_number} geaccepteerd`,
        html: buildAcceptEmailAdmin(order),
      });
    } else if (action === "reject") {
      await supabase
        .from("orders")
        .update({ status: "rejected_by_customer", rejected_at: now })
        .eq("id", order.id);

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "customer_rejected",
        event_description: "Klant heeft de offerte afgewezen.",
        visible_to_customer: true,
      });

      await resend.emails.send({
        from: "Overweel3D <info@overweel3d.gijsoverweel.nl>",
        to: [order.customer_email],
        subject: `Bestelling ${order.order_number} afgewezen`,
        html: `<h2>Bestelling afgewezen</h2><p>Beste ${order.customer_name},</p><p>Uw bestelling <strong>${order.order_number}</strong> heeft nu de status <strong>Afgewezen</strong>.</p><p>U kunt de bestelling en eventuele berichten bekijken via <a href="${orderLink}">uw persoonlijke bestellink</a>.</p>`,
      });

      // Email to admin
      await resend.emails.send({
        from: "Overweel3D <info@overweel3d.gijsoverweel.nl>",
        to: ["gijsoverweel@gmail.com"],
        subject: `❌ ${order.customer_name} heeft bestelling ${order.order_number} afgewezen`,
        html: `<h2>Bestelling afgewezen</h2><p><strong>${order.customer_name}</strong> (${order.customer_email}) heeft bestelling <strong>${order.order_number}</strong> afgewezen.</p><p>Definitieve prijs was: €${order.final_price}</p>`,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildAcceptEmailCustomer(order: any, orderLink: string): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #1B365D, #2d4a7c); padding: 30px; text-align: center; color: white; }
    .content { padding: 30px; background: #f8fafc; }
    .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .btn { display: inline-block; background: #00b4d8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style></head><body>
    <div class="header"><h1>Bestelling geaccepteerd! ✅</h1></div>
    <div class="content">
      <p>Beste ${order.customer_name},</p>
      <p>U hebt bestelling <strong>${order.order_number}</strong> geaccepteerd. We zullen zo snel mogelijk contact met u opnemen voor het afronden van deze opdracht.</p>
      <div class="section">
        <p><strong>Bestelnummer:</strong> ${order.order_number}</p>
        <p><strong>Definitieve prijs:</strong> €${Number(order.final_price).toFixed(2)}</p>
        ${order.tikkie_link ? `<p><a href="${order.tikkie_link}" class="btn">💰 Betalen via Tikkie</a></p>` : ""}
      </div>
      <p><a href="${orderLink}" class="btn">Bekijk uw bestelling</a></p>
    </div>
  </body></html>`;
}

function buildAcceptEmailAdmin(order: any): string {
  return `<h2>✅ Bestelling geaccepteerd</h2>
    <p><strong>${order.customer_name}</strong> (${order.customer_email}) heeft bestelling <strong>${order.order_number}</strong> geaccepteerd.</p>
    <p>Definitieve prijs: €${Number(order.final_price).toFixed(2)}</p>`;
}
