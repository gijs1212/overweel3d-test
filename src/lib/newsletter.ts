import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/functionErrors";

export const NEWSLETTER_PROMPT_VERSION = "2026-08-21-v1";
export const NEWSLETTER_PROMPT_STORAGE_KEY = `overweel3d:newsletter-prompt:${NEWSLETTER_PROMPT_VERSION}`;

export type NewsletterPromptResult = "shown" | "dismissed" | "subscribed";
export type NewsletterSignupSource = "popup" | "footer";

let inMemoryPromptResult: NewsletterPromptResult | null = null;

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
    if (window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY) !== null) return true;
  } catch {
    // Continue with session and in-memory fallbacks below.
  }

  try {
    if (window.sessionStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY) !== null) return true;
  } catch {
    // The in-memory marker still prevents repeats during this page visit.
  }

  return inMemoryPromptResult !== null;
}

export function rememberNewsletterPrompt(result: NewsletterPromptResult) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(NEWSLETTER_PROMPT_STORAGE_KEY, result);
    return;
  } catch {
    // Fall back to storage with a shorter lifetime when localStorage is blocked.
  }

  try {
    window.sessionStorage.setItem(NEWSLETTER_PROMPT_STORAGE_KEY, result);
    return;
  } catch {
    // Newsletter signup must remain usable even when all browser storage fails.
  }

  inMemoryPromptResult = result;
}

export async function subscribeToNewsletter(email: string, source: NewsletterSignupSource) {
  const normalizedEmail = normalizeNewsletterEmail(email);

  if (!isValidNewsletterEmail(normalizedEmail)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  const { data, error } = await supabase.functions.invoke("manage-newsletter", {
    body: {
      action: "subscribe",
      email: normalizedEmail,
      source,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Aanmelden is nu niet gelukt. Probeer het later opnieuw."));
  }
  if (!data?.success) throw new Error(data?.error || "Aanmelden is nu niet gelukt. Probeer het later opnieuw.");
}
