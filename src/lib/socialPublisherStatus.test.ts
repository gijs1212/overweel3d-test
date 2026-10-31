import { describe, expect, it } from "vitest";
import { isSocialPublisherConnected, parsePocketBaseTimestamp } from "./socialPublisherStatus";

describe("social publisher status", () => {
  it("parses PocketBase timestamps containing a space", () => {
    expect(parsePocketBaseTimestamp("2026-10-31 10:32:10.555Z")).toBe(Date.parse("2026-10-31T10:32:10.555Z"));
  });

  it("prefers the connection status calculated by the server", () => {
    expect(isSocialPublisherConnected({ publisher_connected: true }, 0)).toBe(true);
    expect(isSocialPublisherConnected({ publisher_connected: false, publisher_last_seen_at: "2099-01-01T00:00:00Z" }, 0)).toBe(false);
  });

  it("falls back to the heartbeat for older PocketBase hooks", () => {
    const now = Date.parse("2026-10-31T10:33:00Z");
    expect(isSocialPublisherConnected({ publisher_last_seen_at: "2026-10-31 10:32:10.555Z" }, now)).toBe(true);
  });
});
