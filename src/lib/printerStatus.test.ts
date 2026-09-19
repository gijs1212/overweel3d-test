import { describe, expect, it } from "vitest";
import { displayedPrinterStatus } from "./printerStatus";

describe("printerstatus", () => {
  it("maakt een handmatig ververste printer niet offline op basis van een oude datum", () => {
    expect(displayedPrinterStatus({ status: "printing", last_seen_at: "2020-01-01T00:00:00Z" })).toBe("printing");
  });

  it("toont offline alleen wanneer de bridge offline meldt", () => {
    expect(displayedPrinterStatus({ status: "offline", last_seen_at: new Date().toISOString() })).toBe("offline");
  });
});
