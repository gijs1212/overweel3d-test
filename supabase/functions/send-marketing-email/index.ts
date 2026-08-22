import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const mailFrom = "Overweel3D <info@overweel3d.gijsoverweel.nl>";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pageSize = 1_000;

type TemplateKind = "color" | "material" | "article" | "custom";
type ChangeType = "new" | "removed";
type Audience = "newsletter" | "all_customers";

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
    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = accessToken
      ? await admin.auth.getUser(accessToken)
      : { data: { user: null }, error: null };
    const user = authData.user;
    if (authError || !user) return jsonResponse({ error: "Log opnieuw in als admin." }, 401);

    const { data: hasAdminRole, error: roleError } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError || hasAdminRole !== true) return jsonResponse({ error: "Adminrechten vereist." }, 403);

    const body = await req.json() as {
      templateKind?: TemplateKind;
      changeType?: ChangeType;
      itemName?: string;
      details?: string;
      itemUrl?: string;
      temporarilyUnavailable?: boolean;
      audience?: Audience;
      subject?: string;
      message?: string;
    };
    const templateKind = body.templateKind;
    if (!templateKind || !["color", "material", "article", "custom"].includes(templateKind)) {
      return jsonResponse({ error: "Kies een geldig e-mailsjabloon." }, 400);
    }

    let audience: Audience = "newsletter";
    let changeType: ChangeType | null = null;
    let subject = "";
    let html = "";
    let storedBody = "";

    if (templateKind === "custom") {
      audience = body.audience === "all_customers" ? "all_customers" : "newsletter";
      subject = String(body.subject || "").trim();
      storedBody = String(body.message || "").trim();
      if (subject.length < 3 || subject.length > 160) {
        return jsonResponse({ error: "Het onderwerp moet tussen 3 en 160 tekens bevatten." }, 400);
      }
      if (storedBody.length < 3 || storedBody.length > 20_000) {
        return jsonResponse({ error: "Het bericht moet tussen 3 en 20.000 tekens bevatten." }, 400);
      }
      html = buildEmailShell(subject, textToHtml(storedBody));
    } else {
      changeType = body.changeType === "removed" ? "removed" : "new";
      const itemName = String(body.itemName || "").trim();
      const details = String(body.details || "").trim();
      const itemUrl = normalizeOptionalUrl(body.itemUrl);
      if (itemName.length < 1 || itemName.length > 160) {
        return jsonResponse({ error: "Vul de naam van de kleur, het materiaal of het artikel in." }, 400);
      }
      if (details.length > 5_000) return jsonResponse({ error: "De toelichting is te lang." }, 400);
      const standard = buildStandardTemplate(
        templateKind,
        changeType,
        itemName,
        details,
        itemUrl,
        templateKind === "color" && changeType === "removed" && body.temporarilyUnavailable === true,
      );
      subject = standard.subject;
      storedBody = standard.plainText;
      html = standard.html;
      audience = "newsletter";
    }

    const recipients = audience === "newsletter"
      ? await fetchNewsletterRecipients(admin)
      : await fetchCustomerRecipients(admin);
    if (recipients.length === 0) return jsonResponse({ error: "Er zijn geen ontvangers voor deze selectie." }, 400);
    if (recipients.length > 5_000) return jsonResponse({ error: "De selectie bevat meer dan 5.000 ontvangers." }, 400);

    const { data: campaign, error: campaignError } = await admin
      .from("email_campaigns")
      .insert({
        created_by: user.id,
        template_kind: templateKind,
        change_type: changeType,
        audience,
        subject,
        body: storedBody,
        recipient_count: recipients.length,
      })
      .select("id")
      .single();
    if (campaignError || !campaign) throw campaignError || new Error("Campagne kon niet worden opgeslagen.");

    let sentCount = 0;
    const failures: string[] = [];
    for (let offset = 0; offset < recipients.length; offset += 10) {
      const chunk = recipients.slice(offset, offset + 10);
      const results = await Promise.allSettled(chunk.map(async (email) => {
        const recipientKey = await sha256(email);
        const { error } = await resend.emails.send({
          from: mailFrom,
          to: [email],
          subject,
          html,
        }, { idempotencyKey: `campaign-${campaign.id}-${recipientKey}` });
        if (error) throw new Error(error.message);
      }));
      for (const result of results) {
        if (result.status === "fulfilled") sentCount += 1;
        else failures.push(result.reason instanceof Error ? result.reason.message : "Onbekende providerfout");
      }
    }

    const failedCount = recipients.length - sentCount;
    const status = sentCount === recipients.length ? "sent" : sentCount === 0 ? "failed" : "partial";
    const { error: updateError } = await admin
      .from("email_campaigns")
      .update({
        status,
        sent_count: sentCount,
        failed_count: failedCount,
        error_message: failures[0] || null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    if (updateError) console.error("Campaign audit update failed:", updateError.message);

    return jsonResponse({
      success: failedCount === 0,
      campaignId: campaign.id,
      recipientCount: recipients.length,
      sentCount,
      failedCount,
      error: failures[0] || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende mailfout";
    console.error("send-marketing-email:", message);
    return jsonResponse({ error: message }, 500);
  }
});

async function fetchNewsletterRecipients(admin: ReturnType<typeof createClient>) {
  const emails: string[] = [];
  for (let from = 0;; from += pageSize) {
    const { data, error } = await admin
      .from("newsletter_subscriptions")
      .select("email")
      .eq("active", true)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    emails.push(...(data || []).map((row) => row.email));
    if (!data || data.length < pageSize) break;
  }
  return uniqueValidEmails(emails);
}

async function fetchCustomerRecipients(admin: ReturnType<typeof createClient>) {
  const emails: string[] = [];
  const adminUserIds = new Set<string>();
  const { data: adminRoles, error: rolesError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (rolesError) throw rolesError;
  for (const role of adminRoles || []) adminUserIds.add(role.user_id);

  for (let from = 0;; from += pageSize) {
    const { data, error } = await admin
      .from("profiles")
      .select("user_id,email")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    emails.push(...(data || []).filter((row) => !adminUserIds.has(row.user_id)).map((row) => row.email));
    if (!data || data.length < pageSize) break;
  }
  for (let from = 0;; from += pageSize) {
    const { data, error } = await admin
      .from("orders")
      .select("customer_email")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    emails.push(...(data || []).map((row) => row.customer_email));
    if (!data || data.length < pageSize) break;
  }
  return uniqueValidEmails(emails);
}

function uniqueValidEmails(emails: string[]) {
  return [...new Set(emails.map((email) => String(email).trim().toLowerCase()))]
    .filter((email) => emailPattern.test(email) && email.length <= 254);
}

function normalizeOptionalUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function buildStandardTemplate(
  kind: Exclude<TemplateKind, "custom">,
  change: ChangeType,
  itemName: string,
  details: string,
  itemUrl: string,
  temporarilyUnavailable = false,
) {
  const labels = { color: "kleur", material: "materiaal", article: "artikel" } as const;
  const label = labels[kind];
  const isNew = change === "new";
  const isTemporary = kind === "color" && change === "removed" && temporarilyUnavailable;
  const subject = isTemporary
    ? `Kleur tijdelijk niet beschikbaar: ${itemName}`
    : isNew
      ? `Nieuw ${label} bij Overweel3D: ${itemName}`
      : `${capitalize(label)} niet meer beschikbaar: ${itemName}`;
  const intro = isTemporary
    ? `${itemName} is tijdelijk niet beschikbaar. Deze kleur komt waarschijnlijk later weer terug in ons aanbod.`
    : isNew
      ? `Goed nieuws: ${itemName} is nieuw toegevoegd aan ons aanbod.`
      : `${itemName} verdwijnt uit ons aanbod en is niet langer beschikbaar.`;
  const detailHtml = details ? `<p>${textToHtml(details)}</p>` : "";
  const linkHtml = itemUrl
    ? `<p style="text-align:center;margin:28px 0"><a href="${escapeHtml(itemUrl)}" style="display:inline-block;background:#00b4d8;color:#fff;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700">Bekijk op de website</a></p>`
    : "";
  return {
    subject,
    plainText: [intro, details, itemUrl].filter(Boolean).join("\n\n"),
    html: buildEmailShell(subject, `<p>${escapeHtml(intro)}</p>${detailHtml}${linkHtml}`),
  };
}

function buildEmailShell(title: string, content: string) {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#1B365D">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px">
      <div style="background:#1B365D;color:#fff;padding:30px;border-radius:16px 16px 0 0;text-align:center"><h1 style="margin:0;font-size:26px">${escapeHtml(title)}</h1></div>
      <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;line-height:1.65">${content}<p style="margin-top:28px">Met vriendelijke groet,<br><strong>Team Overweel3D</strong></p></div>
    </div>
  </body></html>`;
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
