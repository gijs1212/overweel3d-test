import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orderId, message, senderType } = await req.json();
    if (!orderId || !message || !senderType) throw new Error("Missing required fields");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order } = await supabase
      .from("orders")
      .select("order_number, customer_email, customer_name")
      .eq("id", orderId)
      .single();

    if (!order) throw new Error("Order not found");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);

    if (senderType === "customer") {
      // Notify admin
      await resend.emails.send({
        from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
        to: ["gijsoverweel@gmail.com"],
        subject: `💬 Nieuw bericht bij ${order.order_number}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>💬 Nieuw bericht van ${order.customer_name}</h2>
          <p><strong>Bestelling:</strong> ${order.order_number}</p>
          <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin:0; white-space: pre-wrap;">${message}</p>
          </div>
          <p>Bekijk en reageer in het admin dashboard.</p>
        </div>`,
      });
    } else {
      // Notify customer
      const orderLink = `https://overweel3d.gijsoverweel.nl/order/${orderId}`;
      await resend.emails.send({
        from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
        to: [order.customer_email],
        subject: `💬 Nieuw bericht bij bestelling ${order.order_number}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>💬 Nieuw bericht bij uw bestelling</h2>
          <p>Beste ${order.customer_name},</p>
          <p>Er is een nieuw bericht bij uw bestelling <strong>${order.order_number}</strong>.</p>
          <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin:0; white-space: pre-wrap;">${message}</p>
          </div>
          <p><a href="${orderLink}" style="color: #00b4d8;">Bekijk uw bestelling</a></p>
          <p>Met vriendelijke groet,<br>Team Overweel3D</p>
        </div>`,
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
