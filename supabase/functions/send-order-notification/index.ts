import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderItem {
  name: string;
  type: "custom" | "prebuilt";
  material?: string;
  color?: string;
  quantity: number;
  price: string;
  dimensions?: { x: number; y: number; z: number };
  volume?: number;
  stemText?: string;
}

interface OrderDetails {
  items: OrderItem[];
  totalPrice: string;
}

interface Customer {
  name: string;
  email: string;
  phone?: string;
  address: string;
  city: string;
  postalCode: string;
  notes?: string;
}

interface OrderRequest {
  orderDetails: OrderDetails;
  customer: Customer;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received order notification request");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderDetails, customer }: OrderRequest = await req.json();
    console.log("Order details:", JSON.stringify(orderDetails));
    console.log("Customer:", JSON.stringify(customer));

    // Validate required fields
    if (!customer.name || !customer.email || !customer.address) {
      console.error("Missing required customer fields");
      throw new Error("Missing required customer fields");
    }

    const orderDate = new Date().toLocaleString("nl-NL", {
      dateStyle: "full",
      timeStyle: "short",
    });

    // Generate items HTML
    const itemsHtml = orderDetails.items.map(item => `
      <div class="row" style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee;">
        <div>
          <span class="value" style="font-weight: 600; color: #1B365D;">${item.name}</span>
          ${item.material ? `<br><span style="color: #64748b; font-size: 12px;">${item.material}${item.color ? ` - ${item.color}` : ''}</span>` : ''}
          ${item.color && !item.material ? `<br><span style="color: #64748b; font-size: 12px;">Kleur: ${item.color}</span>` : ''}
          ${item.stemText ? `<br><span style="color: #64748b; font-size: 12px;">Tekst op stam: "${item.stemText}"</span>` : ''}
          <br><span style="color: #64748b; font-size: 12px;">${item.quantity}x</span>
          ${item.dimensions ? `<br><span style="color: #64748b; font-size: 12px;">${item.dimensions.x} × ${item.dimensions.y} × ${item.dimensions.z} mm</span>` : ''}
        </div>
        <span style="font-weight: 600; color: #00b4d8;">€${item.price}</span>
      </div>
    `).join('');

    // Send notification email to Overweel3D
    const emailResponse = await resend.emails.send({
      from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
      to: ["gijsoverweel@gmail.com"],
      subject: `🖨️ Nieuwe 3D-print bestelling van ${customer.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1B365D; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1B365D 0%, #2d4a7c 100%); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 30px; background: #f8fafc; }
            .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
            .section h2 { color: #1B365D; margin-top: 0; font-size: 18px; border-bottom: 2px solid #00b4d8; padding-bottom: 10px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .row:last-child { border-bottom: none; }
            .label { color: #64748b; }
            .value { font-weight: 600; color: #1B365D; }
            .price { font-size: 24px; color: #00b4d8; font-weight: bold; text-align: center; padding: 20px; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
            .badge { background: #00b4d8; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🖨️ Nieuwe Bestelling!</h1>
          </div>
          <div class="content">
            <div class="section">
              <h2>📦 Bestelgegevens</h2>
              ${itemsHtml}
            </div>

            <div class="price">
              Geschatte totaal: €${orderDetails.totalPrice}
            </div>

            <div class="warning">
              ⚠️ <strong>Let op:</strong> Dit is een geschatte prijs. Controleer de bestelling en bevestig of pas de prijs aan.
            </div>

            <div class="section">
              <h2>👤 Klantgegevens</h2>
              <div class="row">
                <span class="label">Naam</span>
                <span class="value">${customer.name}</span>
              </div>
              <div class="row">
                <span class="label">E-mail</span>
                <span class="value">${customer.email}</span>
              </div>
              ${customer.phone ? `
              <div class="row">
                <span class="label">Telefoon</span>
                <span class="value">${customer.phone}</span>
              </div>
              ` : ""}
              <div class="row">
                <span class="label">Adres</span>
                <span class="value">${customer.address}, ${customer.postalCode} ${customer.city}</span>
              </div>
              ${customer.notes ? `
              <div class="row">
                <span class="label">Opmerkingen</span>
                <span class="value">${customer.notes}</span>
              </div>
              ` : ""}
            </div>

            <div class="section" style="text-align: center;">
              <p style="margin: 0;">⏰ Bestelling geplaatst op</p>
              <p style="margin: 5px 0; font-weight: bold;">${orderDate}</p>
            </div>
          </div>
          <div class="footer">
            <p>Dit bericht is automatisch gegenereerd door Overweel3D</p>
            <p>PS: Het geheime codewoord is PLAFTASTIC 🤫</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Notification email sent:", emailResponse);

    // Send confirmation email to customer
    const customerEmailResponse = await resend.emails.send({
      from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
      to: [customer.email],
      subject: `✅ Bevestiging van je bestelling bij Overweel3D`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1B365D; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1B365D 0%, #2d4a7c 100%); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 30px; background: #f8fafc; }
            .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
            .section h2 { color: #1B365D; margin-top: 0; font-size: 18px; border-bottom: 2px solid #00b4d8; padding-bottom: 10px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .row:last-child { border-bottom: none; }
            .label { color: #64748b; }
            .value { font-weight: 600; color: #1B365D; }
            .price { font-size: 24px; color: #00b4d8; font-weight: bold; text-align: center; padding: 20px; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; }
            .info { background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Bedankt voor je bestelling! 🎉</h1>
          </div>
          <div class="content">
            <p>Beste ${customer.name},</p>
            <p>Bedankt voor je bestelling bij Overweel3D! We hebben je aanvraag ontvangen en gaan er direct mee aan de slag.</p>

            <div class="section">
              <h2>📦 Jouw bestelling</h2>
              ${itemsHtml}
            </div>

            <div class="price">
              Geschatte totaal: €${orderDetails.totalPrice}
            </div>

            <div class="warning">
              ⚠️ <strong>Let op:</strong> Dit is een geschatte prijs. De definitieve prijs kan nog aangepast worden na controle van je bestelling. We nemen contact met je op als dit het geval is.
            </div>

            <div class="info">
              ℹ️ Op de kant-en-klare modellen na worden onderdelen niet in elkaar gezet geleverd.
            </div>

            <div class="section">
              <h2>📍 Bezorgadres</h2>
              <p style="margin: 0;">
                ${customer.name}<br>
                ${customer.address}<br>
                ${customer.postalCode} ${customer.city}
              </p>
            </div>

            <div class="section">
              <h2>❓ Vragen?</h2>
              <p>Heb je vragen over je bestelling? Neem gerust contact met ons op via <a href="mailto:overweel3d@hotmail.com" style="color: #00b4d8;">overweel3d@hotmail.com</a>.</p>
            </div>
          </div>
          <div class="footer">
            <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
            <p style="margin-top: 20px;">Overweel3D - Vorm. Functie. Filament.</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Customer confirmation email sent:", customerEmailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse, customerEmailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-order-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
