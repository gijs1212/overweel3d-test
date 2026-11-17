import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orderId, description, bankAccount, kvkNumber, btwId } = await req.json();
    if (!orderId) throw new Error("orderId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (error || !order) throw new Error("Bestelling niet gevonden");

    const invoiceNumber = `F-${order.order_number}`;
    const invoiceDate = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const productPrice = Number(order.final_price || order.instant_quote_price || 0);
    const shippingCost = Number(order.shipping_cost || 0);
    const subtotal = productPrice + shippingCost;
    const btwRate = 0.21;
    const btwAmount = subtotal * btwRate;
    const total = subtotal + btwAmount;

    // Generate HTML invoice for PDF conversion
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 14px; line-height: 1.5; }
  .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #6C63FF; padding-bottom: 20px; }
  .logo { font-size: 28px; font-weight: 800; color: #6C63FF; }
  .logo-sub { font-size: 12px; color: #666; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 32px; color: #1a1a2e; font-weight: 300; letter-spacing: 2px; }
  .invoice-title p { font-size: 12px; color: #666; margin-top: 4px; }
  .details { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .details-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .details-block p { font-size: 13px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background: #f5f5ff; color: #6C63FF; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; padding: 12px 16px; text-align: left; border-bottom: 2px solid #6C63FF; }
  th:last-child { text-align: right; }
  td { padding: 14px 16px; border-bottom: 1px solid #eee; font-size: 13px; }
  td:last-child { text-align: right; font-weight: 500; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
  .totals .row.total { border-top: 2px solid #6C63FF; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 700; color: #6C63FF; }
  .footer { margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 11px; color: #999; text-align: center; }
  .payment-info { background: #f5f5ff; border-radius: 8px; padding: 16px; margin-top: 30px; font-size: 12px; }
  .payment-info h3 { font-size: 13px; color: #6C63FF; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div>
      <div class="logo">Overweel3D</div>
      <div class="logo-sub">3D Print Service</div>
    </div>
    <div class="invoice-title">
      <h1>FACTUUR</h1>
      <p>${invoiceNumber}</p>
      <p>${invoiceDate}</p>
    </div>
  </div>

  <div class="details">
    <div class="details-block">
      <h3>Factuur aan</h3>
      <p><strong>${order.customer_name}</strong></p>
      ${order.company_name ? `<p>${order.company_name}</p>` : ""}
      <p>${order.billing_address || order.shipping_address || ""}</p>
      <p>${order.postal_code || ""} ${order.city || ""}</p>
      <p>${order.country || "Nederland"}</p>
      <p>${order.customer_email}</p>
      ${order.vat_number ? `<p>BTW-nr: ${order.vat_number}</p>` : ""}
    </div>
    <div class="details-block" style="text-align: right;">
      <h3>Van</h3>
      <p><strong>Overweel3D</strong></p>
      <p>gijsoverweel@gmail.com</p>
      ${bankAccount ? `<p>IBAN: ${bankAccount}</p>` : ""}
      ${kvkNumber ? `<p>KVK: ${kvkNumber}</p>` : ""}
      ${btwId ? `<p>BTW-ID: ${btwId}</p>` : ""}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Omschrijving</th>
        <th>Aantal</th>
        <th>Bedrag</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${description || `3D Print bestelling ${order.order_number}`}${order.material ? `<br><span style="color:#999;font-size:11px">${order.material}${order.color ? ` - ${order.color}` : ""}</span>` : ""}</td>
        <td>${order.quantity || 1}</td>
        <td>€${productPrice.toFixed(2)}</td>
      </tr>
      ${shippingCost > 0 ? `
      <tr>
        <td>Verzendkosten${order.shipping_carrier ? ` (${order.shipping_carrier})` : ""}</td>
        <td>1</td>
        <td>€${shippingCost.toFixed(2)}</td>
      </tr>` : ""}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotaal (excl. BTW)</span><span>€${subtotal.toFixed(2)}</span></div>
    <div class="row"><span>BTW (21%)</span><span>€${btwAmount.toFixed(2)}</span></div>
    <div class="row total"><span>Totaal</span><span>€${total.toFixed(2)}</span></div>
  </div>

  ${bankAccount ? `
  <div class="payment-info">
    <h3>Betaalinformatie</h3>
    <p>Gelieve het totaalbedrag over te maken naar:</p>
    <p><strong>IBAN:</strong> ${bankAccount}</p>
    <p><strong>T.n.v.:</strong> Overweel3D</p>
    <p><strong>O.v.v.:</strong> ${invoiceNumber}</p>
  </div>` : ""}

  <div class="footer">
    <p>Overweel3D — 3D Print Service — gijsoverweel@gmail.com</p>
    <p>Bedankt voor uw bestelling!</p>
  </div>
</div>
</body>
</html>`;

    return new Response(JSON.stringify({ html, invoiceNumber }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
