import { describe, expect, it } from "vitest";
import { isVersionAtLeast } from "./compatibleVersion";

describe("isVersionAtLeast", () => {
  it("accepts the minimum and newer releases", () => {
    expect(isVersionAtLeast("1.15.0", "1.15.0")).toBe(true);
    expect(isVersionAtLeast("1.16.0", "1.15.0")).toBe(true);
    expect(isVersionAtLeast("2.5.0", "2.4.0")).toBe(true);
    expect(isVersionAtLeast("2.10.0", "2.9.0")).toBe(true);
  });

  it("rejects old or invalid versions", () => {
    expect(isVersionAtLeast("1.14.9", "1.15.0")).toBe(false);
    expect(isVersionAtLeast("2.3.9", "2.4.0")).toBe(false);
    expect(isVersionAtLeast("", "1.15.0")).toBe(false);
    expect(isVersionAtLeast(undefined, "1.15.0")).toBe(false);
  });
});
