import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NewsletterSubscription = Database["public"]["Tables"]["newsletter_subscriptions"]["Row"];

export const NEWSLETTER_PAGE_SIZE = 1_000;

export function escapeNewsletterCsvCell(value: string) {
  // Spreadsheet applications can still interpret quoted CSV cells as formulas.
  // Prefix every dangerous leading character, including control characters that
  // are commonly used to bypass a check for =, +, - or @.
  const formulaSafe = /^[\t\r\n=+\-@]/.test(value) ? `'${value}` : value;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export async function fetchAllNewsletterSubscriptions() {
  const subscriptions: NewsletterSubscription[] = [];
  let from = 0;
  let expectedCount: number | null = null;

  for (;;) {
    const { count, data, error } = await supabase
      .from("newsletter_subscriptions")
      .select("id, email, source, active, subscribed_at, unsubscribed_at, created_at, updated_at, user_id, welcome_email_claimed_at, welcome_email_sent_at", {
        count: "exact",
      })
      .order("subscribed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + NEWSLETTER_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as NewsletterSubscription[];
    if (page.length === 0) return subscriptions;

    subscriptions.push(...page);
    if (expectedCount === null && count !== null) expectedCount = count;

    if (expectedCount !== null && subscriptions.length >= expectedCount) return subscriptions;

    // Advance by what the server actually returned. This still works when a
    // project configures a lower max-row limit than NEWSLETTER_PAGE_SIZE.
    from += page.length;
  }
}
