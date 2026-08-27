import { describe, expect, it } from "vitest";
import { getPlateRunProgress } from "@/lib/plateRunProgress";

describe("PrintProgress", () => {
  it("berekent het resterende aantal in plaats van het vereiste totaal", () => {
    expect(getPlateRunProgress(2, 1, false)).toEqual({ required: 2, completed: 1, remaining: 1 });
  });
});
