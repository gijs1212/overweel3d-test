import { describe, expect, it } from "vitest";
import { calculateAutomaticPrice, DEFAULT_AUTO_PRICING_CONFIG, estimateModelForSlicer } from "./autoPriceCalculator";

describe("calculateAutomaticPrice", () => {
  it("berekent uitsluitend filament, uitvalbuffer en marge", () => {
    const result = calculateAutomaticPrice({ material: "PLA", filamentGrams: 100 }, DEFAULT_AUTO_PRICING_CONFIG);

    expect(result.materialCost).toBeCloseTo(2.4);
    expect(result.failureBuffer).toBeCloseTo(0.24);
    expect(result.marginAmount).toBeCloseTo(1.1314, 4);
    expect(result.recommendedPrice).toBeCloseTo(3.7714, 4);
    expect(result).not.toHaveProperty("machineCost");
    expect(result).not.toHaveProperty("laborCost");
    expect(result).not.toHaveProperty("energyCost");
    expect(result).not.toHaveProperty("vat");
  });

  it("begrensd een ongeldige marge zodat de uitkomst eindig blijft", () => {
    const result = calculateAutomaticPrice(
      { material: "PLA", filamentGrams: 10 },
      { ...DEFAULT_AUTO_PRICING_CONFIG, margin_percent: 100 },
    );

    expect(Number.isFinite(result.recommendedPrice)).toBe(true);
  });

  it("past de modelschatting aan op het gekozen slicerprofiel", () => {
    const standard = estimateModelForSlicer(100, "PLA", DEFAULT_AUTO_PRICING_CONFIG.slicer);
    const fineWithSupport = estimateModelForSlicer(100, "PLA", {
      ...DEFAULT_AUTO_PRICING_CONFIG.slicer,
      layer_height_mm: 0.12, infill_percent: 30, infill_pattern: "gyroid", wall_loops: 4,
      top_layers: 6, bottom_layers: 6, print_speed_mm_s: 80, first_layer_speed_mm_s: 30,
      supports_enabled: true,
      support_density_percent: 25,
      brim_width_mm: 5,
    });

    expect(fineWithSupport.filamentGrams).toBeGreaterThan(standard.filamentGrams);
    expect(fineWithSupport.printHours).toBeGreaterThan(standard.printHours);
  });

  it("rekent een hogere printsnelheid alleen door in tijd, niet rechtstreeks in prijs", () => {
    const slow = estimateModelForSlicer(100, "PLA", { ...DEFAULT_AUTO_PRICING_CONFIG.slicer, print_speed_mm_s: 60 });
    const fast = estimateModelForSlicer(100, "PLA", { ...DEFAULT_AUTO_PRICING_CONFIG.slicer, print_speed_mm_s: 240 });
    expect(fast.printHours).toBeLessThan(slow.printHours);
    expect(fast.filamentGrams).toBeCloseTo(slow.filamentGrams);
    expect(calculateAutomaticPrice({ material: "PLA", filamentGrams: fast.filamentGrams }, DEFAULT_AUTO_PRICING_CONFIG).recommendedPrice)
      .toBeCloseTo(calculateAutomaticPrice({ material: "PLA", filamentGrams: slow.filamentGrams }, DEFAULT_AUTO_PRICING_CONFIG).recommendedPrice);
  });
});
