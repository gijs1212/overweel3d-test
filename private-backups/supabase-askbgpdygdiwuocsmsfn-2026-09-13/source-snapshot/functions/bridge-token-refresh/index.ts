import { createClient } from "@supabase/supabase-js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const printerId = req.headers.get("x-printer-id") || "";
  const refreshToken = req.headers.get("x-bridge-refresh-token") || "";
  if (!printerId || !refreshToken) return json({ error: "Herstelgegevens ontbreken" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: printer } = await supabase
    .from("printers")
    .select("id,bridge_refresh_token_hash")
    .eq("id", printerId)
    .maybeSingle();
  if (!printer?.bridge_refresh_token_hash || printer.bridge_refresh_token_hash !== await hash(refreshToken)) {
    return json({ error: "Ongeldig bridge-herstel-token" }, 403);
  }

  const accessBytes = crypto.getRandomValues(new Uint8Array(32));
  const accessToken = [...accessBytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  const refreshedAt = new Date().toISOString();
  const { error } = await supabase.from("printers").update({
    bridge_token_hash: await hash(accessToken),
    bridge_token_refreshed_at: refreshedAt,
  }).eq("id", printerId);
  if (error) return json({ error: error.message }, 500);
  return json({ access_token: accessToken, refreshed_at: refreshedAt });
});
