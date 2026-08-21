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
    expect(result).toEqual({ campaignsSent: 2, recipientsReached: 6, errors: [] });
  });
});
