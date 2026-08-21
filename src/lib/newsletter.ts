import { supabase } from "@/integrations/supabase/client";

export const NEWSLETTER_PROMPT_VERSION = "2026-08-21-v1";
export const NEWSLETTER_PROMPT_STORAGE_KEY = `overweel3d:newsletter-prompt:${NEWSLETTER_PROMPT_VERSION}`;

export type NewsletterPromptResult = "shown" | "dismissed" | "subscribed";
export type NewsletterSignupSource = "popup" | "footer";

// Kept deliberately conservative for immediate feedback. The database repeats
// validation so callers cannot bypass it by invoking the API directly.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNewsletterEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidNewsletterEmail(email: string) {
  const normalized = normalizeNewsletterEmail(email);
  return normalized.length >= 3 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function hasSeenNewsletterPrompt() {
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY) !== null;
  } catch {
    // Storage can be unavailable in privacy modes. Failing closed avoids
    // repeatedly interrupting the visitor on every render.
    return true;
  }
}

export function rememberNewsletterPrompt(result: NewsletterPromptResult) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(NEWSLETTER_PROMPT_STORAGE_KEY, result);
  } catch {
    // Newsletter signup must remain usable even when storage is unavailable.
  }
}

export async function subscribeToNewsletter(email: string, source: NewsletterSignupSource) {
  const normalizedEmail = normalizeNewsletterEmail(email);

  if (!isValidNewsletterEmail(normalizedEmail)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  const { error } = await supabase.rpc("subscribe_to_newsletter", {
    _email: normalizedEmail,
    _source: source,
  });

  if (error) {
    throw new Error("Aanmelden is nu niet gelukt. Probeer het later opnieuw.");
  }
}
