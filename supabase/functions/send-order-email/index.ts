import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const mailFrom = "Overweel3D <bestellingen@overweel3d.gijsoverweel.nl>";
const adminEmail = "gijsoverweel@gmail.com";

interface EmailOrder {
  id: string;
  user_id: string | null;
  order_number: string;
  customer_order_token: string;
  customer_email: string;
  customer_name: string;
  material: string | null;
  color: string | null;
  quantity: number | null;
  instant_quote_price: number | null;
  final_price: number | null;
  billing_address: string | null;
  shipping_address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  phone: string | null;
  total_products: number | null;
  total_plates: number | null;
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, orderId, note, customerOrderToken } = await req.json();
    if (!type) return jsonResponse({ error: "Type is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData } = accessToken
      ? await supabase.auth.getUser(accessToken)
      : { data: { user: null } };
    const user = authData.user;
    const { data: hasAdminRole } = user
      ? await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
      : { data: false };
    const isAdmin = hasAdminRole === true;

    if (type === "test_email") {
      if (!isAdmin) return jsonResponse({ error: "Admin authorization required" }, 403);

      const { error: mailError } = await resend.emails.send({
        from: mailFrom,
        to: [adminEmail],
        subject: "Overweel3D testmail",
        html: buildTestEmail(user?.email || "onbekende admin"),
      });
      if (mailError) throw new Error(mailError.message);
      return jsonResponse({ success: true, recipient: adminEmail });
    }

    if (!orderId) return jsonResponse({ error: "OrderId is required" }, 400);

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    const isOwner = Boolean(user && order.user_id && user.id === order.user_id);
    const hasValidGuestToken = Boolean(
      !order.user_id &&
      typeof customerOrderToken === "string" &&
      customerOrderToken.length >= 32 &&
      customerOrderToken === order.customer_order_token
    );
    if (type === "admin_order_created" && !isAdmin) {
      return jsonResponse({ error: "Admin authorization required" }, 403);
    }
    if (type === "order_confirmation" && !isOwner && !isAdmin && !hasValidGuestToken) {
      return jsonResponse({ error: "Not allowed to confirm this order" }, 403);
    }
    if (!["order_confirmation", "admin_order_created"].includes(type) && !isAdmin) {
      return jsonResponse({ error: "Admin authorization required" }, 403);
    }

    const orderLink = `https://overweel3d.gijsoverweel.nl/order/${order.customer_order_token}`;

    if (type === "order_confirmation" || type === "admin_order_created") {
      const { data: claimed, error: claimError } = await supabase.rpc(
        "claim_order_confirmation",
        { p_order_id: order.id },
      );
      if (claimError) throw claimError;

      if (!claimed) {
        const { data: currentOrder } = await supabase
          .from("orders")
          .select("confirmation_email_sent_at")
          .eq("id", order.id)
          .single();
        return jsonResponse({
          success: true,
          alreadySent: Boolean(currentOrder?.confirmation_email_sent_at),
          alreadyProcessing: !currentOrder?.confirmation_email_sent_at,
        });
      }

      try {
        const customerEmail = type === "admin_order_created"
          ? buildAdminCreatedConfirmationEmail(order, orderLink)
          : buildConfirmationEmail(order, orderLink);
        const { error: customerMailError } = await resend.emails.send({
          from: mailFrom,
          to: [order.customer_email],
          subject: `Bedankt voor uw bestelling! ${order.order_number}`,
          html: customerEmail,
        }, { idempotencyKey: `order-confirmation-customer-${order.id}` });
        if (customerMailError) throw new Error(customerMailError.message);

        // Keep the existing owner-order admin notification. A manually created
        // admin order only needs the one customer thank-you email.
        if (type === "order_confirmation") {
          const { error: adminMailError } = await resend.emails.send({
            from: mailFrom,
            to: [adminEmail],
            subject: `🖨️ Nieuwe bestelling ${order.order_number} van ${order.customer_name}`,
            html: buildAdminNotificationEmail(order),
          }, { idempotencyKey: `order-confirmation-admin-${order.id}` });
          if (adminMailError) throw new Error(adminMailError.message);
        }

        const sentAt = new Date().toISOString();
        const { error: markSentError } = await supabase.from("orders").update({
          confirmation_email_sent_at: sentAt,
          confirmation_email_claimed_at: null,
        }).eq("id", order.id);
        if (markSentError) throw markSentError;

        await supabase.from("order_events").insert({
          order_id: order.id,
          event_type: "order_submitted",
          event_description: "Bestelling is aangemaakt en de bedankmail is verzonden.",
          visible_to_customer: true,
        });
      } catch (confirmationError) {
        await supabase.from("orders").update({
          confirmation_email_claimed_at: null,
        }).eq("id", order.id).is("confirmation_email_sent_at", null);
        throw confirmationError;
      }
    } else if (type === "order_updated") {
      const { error: mailError } = await resend.emails.send({
        from: mailFrom,
        to: [order.customer_email],
        subject: `📋 Update voor bestelling ${order.order_number}`,
        html: buildUpdateEmail(order, orderLink),
      });
      if (mailError) throw new Error(mailError.message);

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "order_updated",
        event_description: "Bestelling is bijgewerkt. De klant is per e-mail geïnformeerd.",
        visible_to_customer: true,
      });
    } else if (type === "customer_upload_request") {
      const { error: mailError } = await resend.emails.send({
        from: mailFrom,
        to: [order.customer_email],
        subject: `📤 Upload-verzoek voor bestelling ${order.order_number}`,
        html: buildUploadRequestEmail(order, orderLink, note || ""),
      });
      if (mailError) throw new Error(mailError.message);
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "customer_upload_request",
        event_description: "De admin heeft u gevraagd bestanden te uploaden.",
        visible_to_customer: true,
      });
    } else {
      return jsonResponse({ error: "Unsupported email type" }, 400);
    }

    return jsonResponse({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.error("Error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildTestEmail(requestedBy: string): string {
  return `<!DOCTYPE html><html><body style="font-family:'Segoe UI',sans-serif;color:#1B365D;max-width:600px;margin:0 auto;line-height:1.6">
    <div style="background:#1B365D;color:white;padding:28px;text-align:center"><h1 style="margin:0">Overweel3D testmail</h1></div>
    <div style="padding:28px;background:#f8fafc">
      <p>De e-mailconfiguratie werkt correct.</p>
      <p>Deze test is aangevraagd door <strong>${escapeHtml(requestedBy)}</strong> op ${escapeHtml(new Date().toLocaleString("nl-NL"))}.</p>
      <p>Provider, API-sleutel en afzender zijn dezelfde als voor bestelbevestigingen.</p>
    </div>
  </body></html>`;
}

function buildAdminCreatedConfirmationEmail(order: EmailOrder, orderLink: string): string {
  const price = order.final_price == null
    ? ""
    : `<p><strong>Definitieve prijs:</strong> €${Number(order.final_price).toFixed(2)}</p>`;
  return `<!DOCTYPE html><html><body style="font-family:'Segoe UI',sans-serif;color:#1B365D;max-width:600px;margin:0 auto;line-height:1.6">
    <div style="background:#1B365D;color:white;padding:30px;text-align:center"><h1 style="margin:0">Bedankt voor uw bestelling!</h1></div>
    <div style="padding:30px;background:#f8fafc">
      <p>Beste ${escapeHtml(order.customer_name)},</p>
      <p>Bedankt voor uw bestelling bij Overweel3D. Uw bestelling is definitief aangemaakt en bij ons bekend.</p>
      <div style="background:white;border-radius:12px;padding:20px;margin:20px 0">
        <p><strong>Bestelnummer:</strong> ${escapeHtml(order.order_number)}</p>
        ${order.material ? `<p><strong>Materiaal:</strong> ${escapeHtml(order.material)}</p>` : ""}
        ${order.color ? `<p><strong>Kleur:</strong> ${escapeHtml(order.color)}</p>` : ""}
        <p><strong>Totaal producten:</strong> ${escapeHtml(order.total_products ?? order.quantity ?? 0)}</p>
        <p><strong>Aantal platen:</strong> ${escapeHtml(order.total_plates ?? 0)}</p>
        ${price}
      </div>
      <p style="text-align:center;margin:28px 0"><a href="${escapeHtml(orderLink)}" style="display:inline-block;background:#00b4d8;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">Bekijk uw bestelling</a></p>
      <p>Heeft u al een Overweel3D-account of maakt u er een aan met <strong>${escapeHtml(order.customer_email)}</strong>? Open dan de bestellink terwijl u bent ingelogd en kies <strong>Aan mijn account koppelen</strong>. Daarna staat de bestelling blijvend in uw dashboard. Een bestelling kan maar aan één account worden gekoppeld.</p>
      <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
    </div>
  </body></html>`;
}

function buildConfirmationEmail(order: EmailOrder, orderLink: string): string {
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
      <p>Beste ${escapeHtml(order.customer_name)},</p>
      <p>Bedankt voor uw bestelling bij Overweel3D! We hebben uw aanvraag ontvangen en gaan er direct mee aan de slag.</p>

      <div class="section">
        <h2>📦 Bestelgegevens</h2>
        <p><strong>Bestelnummer:</strong> ${escapeHtml(order.order_number)}</p>
        <p><strong>Materiaal:</strong> ${escapeHtml(order.material)}</p>
        <p><strong>Kleur:</strong> ${escapeHtml(order.color)}</p>
        <p><strong>Aantal:</strong> ${escapeHtml(order.quantity)}</p>
        <p><strong>Indicatieprijs:</strong> €${Number(order.instant_quote_price).toFixed(2)}</p>
      </div>

      <div class="warning">
        ⚠️ <strong>Belangrijk:</strong> De indicatieprijs is slechts een schatting en is nooit de definitieve prijs. De definitieve prijs wordt na controle door ons vastgesteld en aan u gecommuniceerd.
      </div>

      <div class="section">
        <h2>📍 Bezorgadres</h2>
        <p>${escapeHtml(order.customer_name)}<br>${escapeHtml(order.shipping_address || order.billing_address)}<br>${escapeHtml(order.postal_code)} ${escapeHtml(order.city)}<br>${escapeHtml(order.country)}</p>
      </div>

      ${order.notes ? `<div class="section"><h2>📝 Uw opmerkingen</h2><p>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p></div>` : ""}

      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(orderLink)}" class="btn">📋 Bekijk uw bestelling</a>
      </div>

      <p>Bewaar bovenstaande link om uw bestelling te volgen. U kunt hier ook de definitieve offerte bekijken en accepteren of afwijzen.</p>
      <p>Als deze bestelling nog niet in uw dashboard staat, kunt u haar via deze link eenmalig koppelen aan een account met hetzelfde e-mailadres.</p>

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

function buildAdminNotificationEmail(order: EmailOrder): string {
  return `<!DOCTYPE html><html><body style="font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto;">
    <h2>🖨️ Nieuwe bestelling: ${escapeHtml(order.order_number)}</h2>
    <p><strong>Klant:</strong> ${escapeHtml(order.customer_name)} (${escapeHtml(order.customer_email)})</p>
    <p><strong>Materiaal:</strong> ${escapeHtml(order.material)}</p>
    <p><strong>Kleur:</strong> ${escapeHtml(order.color)}</p>
    <p><strong>Aantal:</strong> ${escapeHtml(order.quantity)}</p>
    <p><strong>Indicatieprijs:</strong> €${Number(order.instant_quote_price).toFixed(2)}</p>
    <p><strong>Adres:</strong> ${escapeHtml(order.billing_address)}, ${escapeHtml(order.postal_code)} ${escapeHtml(order.city)}</p>
    ${order.notes ? `<p><strong>Opmerkingen:</strong> ${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}
    <p><strong>Telefoon:</strong> ${escapeHtml(order.phone || "—")}</p>
    <hr>
    <p>Bekijk de bestelling in het admin dashboard.</p>
  </body></html>`;
}

function buildUpdateEmail(order: EmailOrder, orderLink: string): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1B365D, #2d4a7c); padding: 30px; text-align: center; color: white; }
    .content { padding: 30px; background: #f8fafc; }
    .btn { display: inline-block; background: #00b4d8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
  </style></head><body>
    <div class="header"><h1>📋 Update voor uw bestelling</h1></div>
    <div class="content">
      <p>Beste ${escapeHtml(order.customer_name)},</p>
      <p>Er is nieuwe informatie beschikbaar voor uw bestelling <strong>${escapeHtml(order.order_number)}</strong>.</p>
      ${order.final_price ? `<p>De definitieve prijs is vastgesteld op: <strong style="font-size: 24px; color: #00b4d8;">€${Number(order.final_price).toFixed(2)}</strong></p>` : ""}
      <p>Bekijk uw bestelling voor alle details en om de offerte te accepteren of af te wijzen.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(orderLink)}" class="btn">Bekijk uw bestelling</a>
      </div>
    </div>
    <div class="footer">
      <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
    </div>
  </body></html>`;
}

function buildUploadRequestEmail(order: EmailOrder, orderLink: string, note: string): string {
  return `<!DOCTYPE html><html><head><style>
    body { font-family: 'Segoe UI', sans-serif; color: #1B365D; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .header { background: linear-gradient(135deg, #1B365D, #2d4a7c); padding: 30px; text-align: center; color: white; }
    .content { padding: 30px; background: #f8fafc; }
    .note { background: white; border-left: 4px solid #00b4d8; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
    .btn { display: inline-block; background: #00b4d8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
  </style></head><body>
    <div class="header"><h1>📤 Wij hebben uw bestand(en) nodig</h1></div>
    <div class="content">
      <p>Beste ${escapeHtml(order.customer_name)},</p>
      <p>Voor uw bestelling <strong>${escapeHtml(order.order_number)}</strong> hebben wij aanvullende bestanden van u nodig.</p>
      ${note ? `<div class="note"><p style="margin:0;"><strong>Notitie:</strong><br>${escapeHtml(note).replace(/\n/g, "<br>")}</p></div>` : ""}
      <p>Open uw bestelling en gebruik de upload-knop om de bestanden te delen.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${escapeHtml(orderLink)}" class="btn">Bestelling openen & uploaden</a>
      </div>
    </div>
    <div class="footer">
      <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
    </div>
  </body></html>`;
}
