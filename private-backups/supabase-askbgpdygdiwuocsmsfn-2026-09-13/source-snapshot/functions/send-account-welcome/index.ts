import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const mailFrom = "Overweel3D <info@overweel3d.gijsoverweel.nl>";

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
    return jsonResponse({ error: "De e-mailservice is niet geconfigureerd." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resend = new Resend(resendApiKey);

  try {
    const { userId } = await req.json() as { userId?: string };
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return jsonResponse({ error: "Ongeldige accountaanvraag." }, 400);
    }

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
    if (targetError || !targetData.user?.email) {
      return jsonResponse({ error: "Account niet gevonden." }, 404);
    }

    const target = targetData.user;
    const createdAt = new Date(target.created_at).getTime();
    const accountAge = Date.now() - createdAt;
    const isNewAccount = Number.isFinite(createdAt) && accountAge >= 0 && accountAge < 10 * 60 * 1000;
    if (!isNewAccount) {
      return jsonResponse({ error: "Een welkomstmail kan alleen direct na registratie worden verstuurd." }, 403);
    }

    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_account_welcome",
      { p_user_id: target.id },
    );
    if (claimError) throw claimError;
    if (!claimed) return jsonResponse({ success: true, alreadySentOrProcessing: true });

    try {
      const fullName = String(target.user_metadata?.full_name || "").trim();
      const { error: mailError } = await resend.emails.send({
        from: mailFrom,
        to: [target.email],
        subject: "Welkom bij Overweel3D",
        html: buildAccountWelcomeEmail(fullName),
      }, { idempotencyKey: `account-welcome-${target.id}` });
      if (mailError) throw new Error(mailError.message);

      const { error: markError } = await admin
        .from("profiles")
        .update({
          account_welcome_email_sent_at: new Date().toISOString(),
          account_welcome_email_claimed_at: null,
        })
        .eq("user_id", target.id);
      if (markError) throw markError;
    } catch (mailError) {
      await admin
        .from("profiles")
        .update({ account_welcome_email_claimed_at: null })
        .eq("user_id", target.id)
        .is("account_welcome_email_sent_at", null);
      throw mailError;
    }

    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende welkomstmailfout";
    console.error("send-account-welcome:", message);
    return jsonResponse({ error: message }, 500);
  }
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildAccountWelcomeEmail(fullName: string) {
  const greeting = fullName ? `Beste ${escapeHtml(fullName)},` : "Beste klant,";
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#1B365D">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px">
      <div style="background:#1B365D;color:#fff;padding:30px;border-radius:16px 16px 0 0;text-align:center">
        <h1 style="margin:0;font-size:28px">Welkom bij Overweel3D</h1>
      </div>
      <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;line-height:1.65">
        <p>${greeting}</p>
        <p>Bedankt voor het aanmaken van uw account. Vanuit uw dashboard kunt u bestellingen plaatsen, volgen en aan uw account koppelen.</p>
        <p style="text-align:center;margin:28px 0"><a href="https://overweel3d.gijsoverweel.nl/dashboard" style="display:inline-block;background:#00b4d8;color:#fff;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700">Naar mijn dashboard</a></p>
        <p>Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p>
      </div>
    </div>
  </body></html>`;
}
