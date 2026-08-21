import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapeNewsletterCsvCell,
  fetchAllNewsletterSubscriptions,
  NEWSLETTER_PAGE_SIZE,
  type NewsletterSubscription,
} from "./newsletterAdmin";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: supabaseMocks.from },
}));

function makeSubscription(index: number): NewsletterSubscription {
  const timestamp = new Date(2026, 0, 1, 0, 0, index).toISOString();
  return {
    active: true,
    created_at: timestamp,
    email: `klant-${index}@voorbeeld.nl`,
    id: `subscription-${index}`,
    source: "website",
    subscribed_at: timestamp,
    unsubscribed_at: null,
    updated_at: timestamp,
    user_id: null,
    welcome_email_claimed_at: null,
    welcome_email_sent_at: null,
  };
}

describe("newsletter admin helpers", () => {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    supabaseMocks.from.mockReturnValue(query);
  });

  it("loads every page instead of stopping at Supabase's default row limit", async () => {
    const firstPage = Array.from({ length: NEWSLETTER_PAGE_SIZE }, (_, index) => makeSubscription(index));
    const lastPage = [makeSubscription(NEWSLETTER_PAGE_SIZE)];
    query.range
      .mockResolvedValueOnce({ count: NEWSLETTER_PAGE_SIZE + 1, data: firstPage, error: null })
      .mockResolvedValueOnce({ count: NEWSLETTER_PAGE_SIZE + 1, data: lastPage, error: null });

    const result = await fetchAllNewsletterSubscriptions();

    expect(result).toHaveLength(NEWSLETTER_PAGE_SIZE + 1);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, NEWSLETTER_PAGE_SIZE - 1);
    expect(query.range).toHaveBeenNthCalledWith(
      2,
      NEWSLETTER_PAGE_SIZE,
      NEWSLETTER_PAGE_SIZE * 2 - 1,
    );
    expect(query.order).toHaveBeenCalledWith("subscribed_at", { ascending: false });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("advances by the actual row count when the server has a lower page cap", async () => {
    query.range
      .mockResolvedValueOnce({ count: 3, data: [makeSubscription(0), makeSubscription(1)], error: null })
      .mockResolvedValueOnce({ count: 3, data: [makeSubscription(2)], error: null });

    const result = await fetchAllNewsletterSubscriptions();

    expect(result).toHaveLength(3);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, NEWSLETTER_PAGE_SIZE - 1);
    expect(query.range).toHaveBeenNthCalledWith(2, 2, NEWSLETTER_PAGE_SIZE + 1);
  });

  it("does not return a partial list when a later page fails", async () => {
    const firstPage = Array.from({ length: NEWSLETTER_PAGE_SIZE }, (_, index) => makeSubscription(index));
    const databaseError = new Error("database unavailable");
    query.range
      .mockResolvedValueOnce({ count: NEWSLETTER_PAGE_SIZE + 1, data: firstPage, error: null })
      .mockResolvedValueOnce({ count: NEWSLETTER_PAGE_SIZE + 1, data: null, error: databaseError });

    await expect(fetchAllNewsletterSubscriptions()).rejects.toBe(databaseError);
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1", "\n=1+1"])(
    "neutralizes a dangerous CSV cell starting with %j",
    (value) => {
      expect(escapeNewsletterCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("escapes quotes in ordinary CSV values", () => {
    expect(escapeNewsletterCsvCell('bron "website"')).toBe('"bron ""website"""');
  });
});
