import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/functionErrors";

export type AutomaticNewsletterKind = "color" | "material" | "article" | "discount";
export type AutomaticNewsletterChange = "new" | "removed";

export interface AutomaticNewsletterEvent {
  templateKind: AutomaticNewsletterKind;
  changeType: AutomaticNewsletterChange;
  itemName: string;
  details?: string;
  itemUrl?: string;
  temporarilyUnavailable?: boolean;
}

export interface AutomaticNewsletterResult {
  campaignsSent: number;
  recipientsReached: number;
  skipped: boolean;
  errors: string[];
}

export async function sendAutomaticNewsletters(
  events: readonly AutomaticNewsletterEvent[],
): Promise<AutomaticNewsletterResult> {
  const result: AutomaticNewsletterResult = { campaignsSent: 0, recipientsReached: 0, skipped: false, errors: [] };

  for (const event of events) {
    try {
      const { data, error } = await supabase.functions.invoke("send-marketing-email", { body: event });
      if (error) throw new Error(await getFunctionErrorMessage(error, "De automatische nieuwsbrief kon niet worden verzonden."));
      if (data?.skipped) {
        result.skipped = true;
        continue;
      }
      if (!data?.success) throw new Error(data?.error || `${data?.failedCount || 0} e-mails konden niet worden verzonden.`);
      result.campaignsSent += 1;
      result.recipientsReached += Number(data.sentCount || 0);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Onbekende nieuwsbrief-fout");
    }
  }

  return result;
}
