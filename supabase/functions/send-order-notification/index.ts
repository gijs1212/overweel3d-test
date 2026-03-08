import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LinkFile {
  name: string;
  quantity: number;
  material: string;
  color: string;
}

interface OrderLink {
  url: string;
  files: LinkFile[];
}

interface PrebuiltItem {
  name: string;
  type: "prebuilt";
  quantity: number;
  price: string;
  stemText?: string;
  color?: string;
}

interface OrderDetails {
  links: OrderLink[];
  prebuiltItems: PrebuiltItem[];
  prebuiltTotal: string;
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

function buildLinksHtml(links: OrderLink[]): string {
  if (!links || links.length === 0) return "";
  return links.map((link, i) => `
    <div style="margin-bottom: 16px; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #00b4d8;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #1B365D;">🔗 Link ${i + 1}:</p>
      <p style="margin: 0 0 8px 0; word-break: break-all;"><a href="${link.url}" style="color: #00b4d8;">${link.url}</a></p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #e2e8f0;">
          <th style="text-align: left; padding: 6px 8px; font-size: 12px;">Bestand</th>
          <th style="text-align: center; padding: 6px 8px; font-size: 12px;">Aantal</th>
          <th style="text-align: left; padding: 6px 8px; font-size: 12px;">Materiaal</th>
          <th style="text-align: left; padding: 6px 8px; font-size: 12px;">Kleur</th>
        </tr>
        ${link.files.map(f => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 8px; font-size: 13px;">${f.name}</td>
            <td style="padding: 6px 8px; font-size: 13px; text-align: center;">${f.quantity}x</td>
            <td style="padding: 6px 8px; font-size: 13px;">${f.material}</td>
            <td style="padding: 6px 8px; font-size: 13px;">${f.color}</td>
          </tr>
        `).join("")}
      </table>
    </div>
  `).join("");
}

function buildPrebuiltHtml(items: PrebuiltItem[]): string {
  if (!items || items.length === 0) return "";
  return items.map(item => `
    <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee;">
      <div>
        <span style="font-weight: 600; color: #1B365D;">${item.name}</span>
        ${item.color ? `<br><span style="color: #64748b; font-size: 12px;">Kleur: ${item.color}</span>` : ""}
        ${item.stemText ? `<br><span style="color: #64748b; font-size: 12px;">Tekst op stam: "${item.stemText}"</span>` : ""}
        <br><span style="color: #64748b; font-size: 12px;">${item.quantity}x</span>
      </div>
      <span style="font-weight: 600; color: #00b4d8;">€${item.price}</span>
    </div>
  `).join("");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderDetails, customer }: OrderRequest = await req.json();

    if (!customer.name || !customer.email || !customer.address) {
      throw new Error("Missing required customer fields");
    }

    const orderDate = new Date().toLocaleString("nl-NL", { dateStyle: "full", timeStyle: "short" });
    const linksHtml = buildLinksHtml(orderDetails.links);
    const prebuiltHtml = buildPrebuiltHtml(orderDetails.prebuiltItems);
    const hasPrebuilt = orderDetails.prebuiltItems && orderDetails.prebuiltItems.length > 0;
    const hasLinks = orderDetails.links && orderDetails.links.length > 0;

    const sharedStyle = `
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
      .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
      .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin: 16px 0; }
      .info { background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 8px; padding: 12px; margin: 16px 0; font-size: 14px; }
    `;

    const customerSection = `
      <div class="section">
        <h2>👤 Klantgegevens</h2>
        <div class="row"><span class="label">Naam</span><span class="value">${customer.name}</span></div>
        <div class="row"><span class="label">E-mail</span><span class="value">${customer.email}</span></div>
        ${customer.phone ? `<div class="row"><span class="label">Telefoon</span><span class="value">${customer.phone}</span></div>` : ""}
        <div class="row"><span class="label">Adres</span><span class="value">${customer.address}, ${customer.postalCode} ${customer.city}</span></div>
        ${customer.notes ? `<div class="row"><span class="label">Opmerkingen</span><span class="value">${customer.notes}</span></div>` : ""}
      </div>
    `;

    // Admin email
    await resend.emails.send({
      from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
      to: ["gijsoverweel@gmail.com"],
      subject: `🖨️ Nieuwe bestelling van ${customer.name}`,
      html: `<!DOCTYPE html><html><head><style>${sharedStyle}</style></head><body>
        <div class="header"><h1>🖨️ Nieuwe Bestelling!</h1></div>
        <div class="content">
          ${hasLinks ? `<div class="section"><h2>🔗 Links & Bestanden</h2>${linksHtml}</div>` : ""}
          ${hasPrebuilt ? `<div class="section"><h2>⭐ Kant-en-klare modellen</h2>${prebuiltHtml}</div><div style="font-size: 24px; color: #00b4d8; font-weight: bold; text-align: center; padding: 20px;">Kant-en-klaar totaal: €${orderDetails.prebuiltTotal}</div>` : ""}
          ${hasLinks ? `<div class="warning">⚠️ <strong>Let op:</strong> Custom prints moeten nog geprijsd worden. Neem contact op met de klant.</div>` : ""}
          ${customerSection}
          <div class="section" style="text-align: center;"><p style="margin: 0;">⏰ Bestelling geplaatst op</p><p style="margin: 5px 0; font-weight: bold;">${orderDate}</p></div>
        </div>
        <div class="footer"><p>Dit bericht is automatisch gegenereerd door Overweel3D</p></div>
      </body></html>`,
    });

    // Customer confirmation email
    await resend.emails.send({
      from: "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>",
      to: [customer.email],
      subject: `✅ Bevestiging van je bestelling bij Overweel3D`,
      html: `<!DOCTYPE html><html><head><style>${sharedStyle}</style></head><body>
        <div class="header"><h1>Bedankt voor je bestelling! 🎉</h1></div>
        <div class="content">
          <p>Beste ${customer.name},</p>
          <p>Bedankt voor uw bestelling bij Overweel3D! We hebben uw aanvraag ontvangen en gaan er direct mee aan de slag.</p>
          ${hasLinks ? `<div class="section"><h2>🔗 Uw links & bestanden</h2>${linksHtml}</div>` : ""}
          ${hasPrebuilt ? `<div class="section"><h2>⭐ Kant-en-klare modellen</h2>${prebuiltHtml}</div><div style="font-size: 24px; color: #00b4d8; font-weight: bold; text-align: center; padding: 20px;">Kant-en-klaar totaal: €${orderDetails.prebuiltTotal}</div>` : ""}
          ${hasLinks ? `<div class="warning">⚠️ <strong>Let op:</strong> De prijs voor custom prints wordt na controle gecommuniceerd. We nemen contact met u op.</div>` : ""}
          <div class="info">ℹ️ Op de kant-en-klare modellen na worden onderdelen niet in elkaar gezet geleverd.</div>
          <div class="section">
            <h2>📍 Bezorgadres</h2>
            <p style="margin: 0;">${customer.name}<br>${customer.address}<br>${customer.postalCode} ${customer.city}</p>
          </div>
          ${customer.notes ? `<div class="section"><h2>📝 Uw opmerkingen</h2><p>${customer.notes}</p></div>` : ""}
          <div class="section">
            <h2>❓ Vragen?</h2>
            <p>Heb je vragen over je bestelling? Neem gerust contact met ons op via <a href="mailto:gijsoverweel@gmail.com" style="color: #00b4d8;">gijsoverweel@gmail.com</a>.</p>
          </div>
        </div>
        <div class="footer">
          <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
          <p style="margin-top: 20px;">Overweel3D - Vorm. Functie. Filament.</p>
        </div>
      </body></html>`,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-order-notification function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
