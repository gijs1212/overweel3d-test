import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
});
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const normalizeCode = (value: unknown) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const createCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const value = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `OW3D-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Ongeldige JSON" }, 400); }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const action = String(body.action || "");

  if (action === "create") {
    const authorization = req.headers.get("authorization") || "";
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Log eerst in als admin" }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Ongeldige adminsessie" }, 401);
    const { data: role } = await admin.from("user_roles").select("role")
      .eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Alleen admins kunnen een koppelcode maken" }, 403);

    const printerId = String(body.printer_id || "");
    const { data: printer, error: printerError } = await admin.from("printers").select("id").eq("id", printerId).maybeSingle();
    if (printerError) return json({ error: printerError.message }, 500);
    if (!printer) return json({ error: "Printer niet gevonden" }, 404);

    const bambuHost = String(body.bambu_host || "").trim();
    const bambuAccessCode = String(body.bambu_access_code || "").trim();
    const ftpsUsername = String(body.ftps_username || "bblp").trim();
    const ftpsPort = Number(body.ftps_port ?? 990);
    if (!ftpsUsername || ftpsUsername.length > 64) return json({ error: "Ongeldige FTPS-gebruikersnaam" }, 400);
    if (!Number.isInteger(ftpsPort) || ftpsPort < 1 || ftpsPort > 65535) return json({ error: "Ongeldige FTPS-poort" }, 400);
    const code = createCode();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await admin.from("printer_pairing_codes").delete().eq("printer_id", printerId).is("redeemed_at", null);
    const { error } = await admin.from("printer_pairing_codes").insert({
      printer_id: printerId,
      code_hash: await hash(normalizeCode(code)),
      bambu_host: bambuHost || null,
      bambu_access_code: bambuAccessCode || null,
      ftps_username: ftpsUsername,
      ftps_port: ftpsPort,
      expires_at: expiresAt,
      created_by: authData.user.id,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ code, expires_at: expiresAt });
  }

  if (action === "exchange") {
    const canonicalCode = normalizeCode(body.code);
    if (!/^OW3D[A-Z2-9]{12}$/.test(canonicalCode)) return json({ error: "Ongeldige website-koppelcode" }, 400);
    const accessToken = randomHex();
    const refreshToken = randomHex();
    const { data, error } = await admin.rpc("redeem_printer_pairing_code", {
      p_code_hash: await hash(canonicalCode),
      p_access_hash: await hash(accessToken),
      p_refresh_hash: await hash(refreshToken),
    });
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Koppelcode is ongeldig, verlopen of al gebruikt" }, 403);
    const safeData = { ...(data as Record<string, unknown>) };
    return json({ ...safeData, bridge_token: accessToken, bridge_refresh_token: refreshToken });
  }

  return json({ error: "Onbekende actie" }, 400);
});


