import { describe, expect, it } from "vitest";

import { buildDiscountNewsletterDetails, calculateDiscount, discountValidationError, eligibleDiscountSubtotal, type ApplicableDiscount } from "./discounts";

const code: ApplicableDiscount = {
  code: "TEST10", discount_type: "percentage", discount_value: 10, active: true,
  expires_at: null, max_uses: null, times_used: 0, assigned_to_email: null,
};

describe("discounts", () => {
  it("berekent procentuele en vaste korting zonder onder nul te gaan", () => {
    expect(calculateDiscount(100, code)).toEqual({ discountAmount: 10, total: 90 });
    expect(calculateDiscount(25, { discount_type: "fixed", discount_value: 40 })).toEqual({ discountAmount: 25, total: 0 });
  });

  it("berekent een artikelkorting alleen over regels van dat artikel", () => {
    const subtotal = eligibleDiscountSubtotal([
      { amount: 30, productId: "roos" },
      { amount: 20, productId: "vaas" },
      { amount: 15, productId: "roos" },
      { amount: 40, productId: null },
    ], "roos");

    expect(subtotal).toBe(45);
    expect(calculateDiscount(subtotal, code)).toEqual({ discountAmount: 4.5, total: 40.5 });
  });

  it("kan korting beperken tot een productcategorie", () => {
    const subtotal = eligibleDiscountSubtotal([
      { amount: 30, productId: "roos", categoryId: "decoratie" },
      { amount: 20, productId: "bakje", categoryId: "opbergen" },
      { amount: 15, productId: "vaas", categoryId: "decoratie" },
    ], null, "decoratie");
    expect(subtotal).toBe(45);
  });

  it("controleert verloop, gebruikslimiet en persoonlijk e-mailadres", () => {
    expect(discountValidationError(code, "klant@example.nl")).toBeNull();
    expect(discountValidationError({ ...code, max_uses: 1, times_used: 1 }, "klant@example.nl")).toContain("maximaal");
    expect(discountValidationError({ ...code, assigned_to_email: "ander@example.nl" }, "klant@example.nl")).toContain("ander e-mailadres");
    expect(discountValidationError({ ...code, expires_at: "2020-01-01T00:00:00Z" }, "klant@example.nl")).toContain("verlopen");
  });

  it("vermeldt alle gegevens van een openbare artikelkorting in de nieuwsbrief", () => {
    const details = buildDiscountNewsletterDetails({
      code: "ROOS20",
      discountType: "percentage",
      discountValue: 20,
      expiresAt: "2030-06-30T12:00:00Z",
      maxUses: 50,
      productName: "Roos",
    });

    expect(details).toContain("Code: ROOS20");
    expect(details).toContain("Korting: 20%");
    expect(details).toContain("30-6-2030");
    expect(details).toContain("Maximaal 50 keer");
    expect(details).toContain("alleen voor het artikel Roos");
  });

  it("maakt onbeperkt gebruik en geen vervaldatum expliciet", () => {
    const details = buildDiscountNewsletterDetails({
      code: "ALTIJD5",
      discountType: "fixed",
      discountValue: 5,
      expiresAt: null,
      maxUses: null,
    });

    expect(details).toContain("€5.00");
    expect(details).toContain("Geen vervaldatum");
    expect(details).toContain("Onbeperkt te gebruiken");
  });
});
