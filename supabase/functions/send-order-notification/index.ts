import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderDetails {
  fileName: string;
  material: string;
  color: string;
  quantity: number;
  estimatedPrice: string;
  dimensions?: { x: number; y: number; z: number };
  volume?: number;
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

    // Send notification email to Overweel3D
    const emailResponse = await resend.emails.send({
      from: "Overweel3D <onboarding@resend.dev>",
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
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🖨️ Nieuwe Bestelling!</h1>
          </div>
          <div class="content">
            <div class="section">
              <h2>📦 Bestelgegevens</h2>
              <div class="row">
                <span class="label">Bestand</span>
                <span class="value">${orderDetails.fileName}</span>
              </div>
              <div class="row">
                <span class="label">Materiaal</span>
                <span class="value">${orderDetails.material}</span>
              </div>
              <div class="row">
                <span class="label">Kleur</span>
                <span class="value">${orderDetails.color}</span>
              </div>
              <div class="row">
                <span class="label">Aantal</span>
                <span class="value">${orderDetails.quantity}x</span>
              </div>
              ${orderDetails.dimensions ? `
              <div class="row">
                <span class="label">Afmetingen</span>
                <span class="value">${orderDetails.dimensions.x} × ${orderDetails.dimensions.y} × ${orderDetails.dimensions.z} mm</span>
              </div>
              ` : ""}
              ${orderDetails.volume ? `
              <div class="row">
                <span class="label">Volume</span>
                <span class="value">~${orderDetails.volume} cm³</span>
              </div>
              ` : ""}
            </div>

            <div class="price">
              Geschatte prijs: €${orderDetails.estimatedPrice}
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

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
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
