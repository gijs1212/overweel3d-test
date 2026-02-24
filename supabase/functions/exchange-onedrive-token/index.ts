import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TENANT_ID = Deno.env.get("ONEDRIVE_TENANT_ID") || "ee379395-a204-487f-ac45-88e971655363";
const CLIENT_ID = Deno.env.get("ONEDRIVE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("ONEDRIVE_CLIENT_SECRET")!;
const REDIRECT_URI = "https://overweel3d.gijsoverweel.nl/auth/callback";
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, codeVerifier } = await req.json();

    if (!code || !codeVerifier) {
      return new Response(
        JSON.stringify({ error: "Missing code or codeVerifier" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Exchanging authorization code for tokens...");

    // Exchange auth code for tokens using PKCE + client secret
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", JSON.stringify(tokenData));
      return new Response(
        JSON.stringify({
          error: `Token exchange failed: ${tokenData.error_description || tokenData.error || "Unknown error"}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Token exchange successful, storing tokens...");

    // Store tokens in Supabase using service_role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Upsert: delete old tokens and insert new one
    await supabaseAdmin.from("onedrive_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { error: insertError } = await supabaseAdmin.from("onedrive_tokens").insert({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Failed to store tokens:", insertError);
      return new Response(
        JSON.stringify({ error: `Failed to store tokens: ${insertError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Tokens stored successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in exchange-onedrive-token:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
