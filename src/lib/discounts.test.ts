import { describe, expect, it } from "vitest";

import { calculateDiscount, discountValidationError, type ApplicableDiscount } from "./discounts";

const code: ApplicableDiscount = {
  code: "TEST10", discount_type: "percentage", discount_value: 10, active: true,
  expires_at: null, max_uses: null, times_used: 0, assigned_to_email: null,
};

describe("discounts", () => {
  it("berekent procentuele en vaste korting zonder onder nul te gaan", () => {
    expect(calculateDiscount(100, code)).toEqual({ discountAmount: 10, total: 90 });
    expect(calculateDiscount(25, { discount_type: "fixed", discount_value: 40 })).toEqual({ discountAmount: 25, total: 0 });
  });

  it("controleert verloop, gebruikslimiet en persoonlijk e-mailadres", () => {
    expect(discountValidationError(code, "klant@example.nl")).toBeNull();
    expect(discountValidationError({ ...code, max_uses: 1, times_used: 1 }, "klant@example.nl")).toContain("maximaal");
    expect(discountValidationError({ ...code, assigned_to_email: "ander@example.nl" }, "klant@example.nl")).toContain("ander e-mailadres");
    expect(discountValidationError({ ...code, expires_at: "2020-01-01T00:00:00Z" }, "klant@example.nl")).toContain("verlopen");
  });
});
