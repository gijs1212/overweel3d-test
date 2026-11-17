import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const mailFrom = "Overweel3D <info@overweel3d.gijsoverweel.nl>";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Methode niet toegestaan" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    console.error("Missing Supabase or Resend configuration");
    return jsonResponse({ error: "De e-mailservice is niet geconfigureerd." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resend = new Resend(resendApiKey);

  try {
    const body = await req.json() as {
      action?: "subscribe" | "set_preference";
      email?: string;
      source?: "popup" | "footer" | "website" | "profile";
      active?: boolean;
    };
    if (!body.action || !["subscribe", "set_preference"].includes(body.action)) {
      return jsonResponse({ error: "Ongeldige nieuwsbriefactie." }, 400);
    }

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData } = accessToken
      ? await admin.auth.getUser(accessToken)
      : { data: { user: null } };
    const user = authData.user;

    let email = String(body.email || "").trim().toLowerCase();
    const active = body.action === "subscribe" ? true : body.active === true;
    let source = body.source || (body.action === "set_preference" ? "profile" : "website");
    let userId: string | null = null;

    if (body.action === "set_preference") {
      if (!user?.id || !user.email) {
        return jsonResponse({ error: "Log in om uw nieuwsbriefvoorkeur te wijzigen." }, 401);
      }
      email = user.email.trim().toLowerCase();
      source = "profile";
      userId = user.id;
    } else if (user?.id && user.email?.trim().toLowerCase() === email) {
      userId = user.id;
    }

    if (!emailPattern.test(email) || email.length > 254) {
      return jsonResponse({ error: "Vul een geldig e-mailadres in." }, 400);
    }

    const { data: subscriptionRows, error: subscriptionError } = await admin.rpc(
      "set_newsletter_subscription",
      {
        p_email: email,
        p_source: source,
        p_active: active,
        p_user_id: userId,
      },
    );
    if (subscriptionError) throw subscriptionError;

    const subscription = Array.isArray(subscriptionRows) ? subscriptionRows[0] : subscriptionRows;
    if (!subscription?.subscription_id) throw new Error("De inschrijving kon niet worden opgeslagen.");

    if (userId) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ newsletter_subscribed: active })
        .eq("user_id", userId);
      if (profileError) throw profileError;
    }

    let welcomeSent = false;
    if (active && subscription.welcome_needed) {
      const { data: claimed, error: claimError } = await admin.rpc(
        "claim_newsletter_welcome",
        { p_subscription_id: subscription.subscription_id },
      );
      if (claimError) throw claimError;

      if (claimed) {
        try {
          const { error: mailError } = await resend.emails.send({
            from: mailFrom,
            to: [email],
            subject: "Bedankt voor uw aanmelding bij Overweel3D",
            html: buildNewsletterWelcomeEmail(),
          }, { idempotencyKey: `newsletter-welcome-${subscription.subscription_id}` });
          if (mailError) throw new Error(mailError.message);

          const { error: markError } = await admin
            .from("newsletter_subscriptions")
            .update({
              welcome_email_sent_at: new Date().toISOString(),
              welcome_email_claimed_at: null,
            })
            .eq("id", subscription.subscription_id);
          if (markError) throw markError;
          welcomeSent = true;
        } catch (mailError) {
          await admin
            .from("newsletter_subscriptions")
            .update({ welcome_email_claimed_at: null })
            .eq("id", subscription.subscription_id)
            .is("welcome_email_sent_at", null);
          throw mailError;
        }
      }
    }

    return jsonResponse({ success: true, active, welcomeSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende nieuwsbrieffout";
    console.error("manage-newsletter:", message);
    return jsonResponse({ error: message }, 500);
  }
});

function buildNewsletterWelcomeEmail() {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#1B365D">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px">
      <div style="background:#1B365D;color:#fff;padding:30px;border-radius:16px 16px 0 0;text-align:center">
        <h1 style="margin:0;font-size:26px">Welkom bij de Overweel3D-nieuwsbrief</h1>
      </div>
      <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;line-height:1.65">
        <p>Bedankt voor uw aanmelding!</p>
        <p>U ontvangt voortaan nieuws over nieuwe kleuren, materialen, artikelen en belangrijke wijzigingen in ons assortiment.</p>
        <p>Uw voorkeur kunt u op ieder moment aanpassen via uw profiel.</p>
        <p style="margin-top:28px">Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
      </div>
    </div>
  </body></html>`;
}

