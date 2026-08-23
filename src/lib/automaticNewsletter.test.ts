import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendAutomaticNewsletters } from "./automaticNewsletter";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

describe("automatic newsletters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends every catalog event through the standard marketing templates", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, sentCount: 3 }, error: null });
    const events = [
      { templateKind: "color" as const, changeType: "removed" as const, itemName: "Blauw" },
      { templateKind: "material" as const, changeType: "removed" as const, itemName: "PLA" },
    ];

    const result = await sendAutomaticNewsletters(events);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "send-marketing-email", { body: events[0] });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "send-marketing-email", { body: events[1] });
    expect(result).toEqual({ campaignsSent: 2, recipientsReached: 6, skipped: false, errors: [] });
  });

  it("passes temporary color unavailability to the email template", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, sentCount: 1 }, error: null });
    const event = {
      templateKind: "color" as const,
      changeType: "removed" as const,
      itemName: "Jadewit",
      details: "Deze kleur komt waarschijnlijk later weer terug.",
      temporarilyUnavailable: true,
    };

    const result = await sendAutomaticNewsletters([event]);

    expect(mocks.invoke).toHaveBeenCalledWith("send-marketing-email", { body: event });
    expect(result).toEqual({ campaignsSent: 1, recipientsReached: 1, skipped: false, errors: [] });
  });

  it("verstuurd openbare kortingscodes via het kortingscodesjabloon", async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, sentCount: 4 }, error: null });
    const event = {
      templateKind: "discount" as const,
      changeType: "new" as const,
      itemName: "ZOMER10",
      details: "Gebruik code ZOMER10 voor 10% korting.",
    };

    const result = await sendAutomaticNewsletters([event]);

    expect(mocks.invoke).toHaveBeenCalledWith("send-marketing-email", { body: event });
    expect(result).toEqual({ campaignsSent: 1, recipientsReached: 4, skipped: false, errors: [] });
  });
});
