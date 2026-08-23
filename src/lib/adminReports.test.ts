import { describe, expect, it } from "vitest";
import { buildAdminReport } from "./adminReports";

describe("buildAdminReport", () => {
  it("sluit geannuleerde orders uit en telt producten", () => {
    const report = buildAdminReport([
      { status: "completed", final_price: 30, instant_quote_price: 30, material_cost: 5, filament_used_g: 80, catalog_items: [{ productName: "Roos", quantity: 2, unitPrice: 15 }] },
      { status: "cancelled", final_price: 99, instant_quote_price: 99 },
    ]);
    expect(report.revenue).toBe(30);
    expect(report.estimatedProfit).toBe(25);
    expect(report.topProducts[0].quantity).toBe(2);
  });
});
