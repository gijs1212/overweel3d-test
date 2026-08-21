/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0 SPA flow.
 * Used for Microsoft Entra ID / Azure AD authentication.
 */

const TENANT_ID = "ee379395-a204-487f-ac45-88e971655363";
const CLIENT_ID = "f0dca68f-86d3-4049-a768-c706a1b94193";
const REDIRECT_URI = "https://overweel3d.gijsoverweel.nl/auth/callback";
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;

/**
 * Generate a cryptographically random code verifier (43-128 chars).
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate a code challenge from a code verifier using SHA-256.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode (no padding, URL-safe chars).
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let str = "";
  for (const byte of buffer) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a random state parameter for CSRF protection.
 */
function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Initiate the Microsoft OAuth PKCE flow.
 * Stores code_verifier and state in sessionStorage, then redirects.
 * 
 * @param scopes - OAuth scopes to request (default: minimal login scopes)
 */
export async function startOneDriveAuth(
  scopes: string[] = ["openid", "profile", "email", "User.Read", "Files.ReadWrite", "offline_access"]
): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store for callback verification
  sessionStorage.setItem("pkce_code_verifier", codeVerifier);
  sessionStorage.setItem("pkce_state", state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: scopes.join(" "),
    response_mode: "query",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Extract the authorization code and state from the callback URL.
 */
export function extractCallbackParams(): { code: string | null; state: string | null; error: string | null; errorDescription: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get("code"),
    state: params.get("state"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
  };
}

/**
 * Validate the state parameter matches what we stored.
 */
export function validateState(receivedState: string): boolean {
  const storedState = sessionStorage.getItem("pkce_state");
  return storedState === receivedState;
}

/**
 * Get the stored code verifier for token exchange.
 */
export function getCodeVerifier(): string | null {
  return sessionStorage.getItem("pkce_code_verifier");
}

/**
 * Clean up PKCE session data.
 */
export function clearPkceSession(): void {
  sessionStorage.removeItem("pkce_code_verifier");
  sessionStorage.removeItem("pkce_state");
}
