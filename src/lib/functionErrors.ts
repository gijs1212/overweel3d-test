import { FunctionsHttpError } from "@supabase/supabase-js";

export async function getFunctionErrorMessage(
  error: unknown,
  fallback = "De serveraanvraag is mislukt.",
) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.clone().json() as { error?: string; message?: string };
      return payload.error || payload.message || error.message || fallback;
    } catch {
      try {
        const message = await error.context.clone().text();
        if (message.trim()) return message;
      } catch {
        // Use the regular error message below.
      }
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}
