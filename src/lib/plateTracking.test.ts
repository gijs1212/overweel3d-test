import { describe, expect, it } from "vitest";
import {
  createPlateTrackingUpdate,
  detectBambuPlateCount,
  normalizePlatePrintQuantities,
  normalizePlateStatuses,
} from "./plateTracking";

describe("Bambu plate detection", () => {
  it("counts unique plates and ignores object/model entries", () => {
    expect(detectBambuPlateCount([
      "3D/Objects/object_1.model",
      "3D/Objects/object_2.model",
      "Metadata/plate_1.png",
      "Metadata/plate_1.gcode",
      "Metadata/plate_2.png",
      "Metadata/plate_3.json",
    ])).toBe(3);
  });

  it("uses slicer plate metadata without adding duplicate documents together", () => {
    expect(detectBambuPlateCount(
      ["3D/3dmodel.model"],
      ["<config><plate/><plate/></config>", "<config><plate/><plate/></config>"],
    )).toBe(2);
  });

  it("treats a valid metadata-free 3MF as one plate", () => {
    expect(detectBambuPlateCount(["3D/3dmodel.model"])).toBe(1);
  });
});

describe("plate tracking normalization", () => {
  it("preserves existing statuses and pads new plates as not printed", () => {
    expect(normalizePlateStatuses([true, false], 4)).toEqual([true, false, false, false]);
  });

  it("removes statuses for plates that no longer exist", () => {
    expect(normalizePlateStatuses([true, false, true], 2)).toEqual([true, false]);
  });

  it("normalizes invalid plate totals to an empty status list", () => {
    expect(normalizePlateStatuses([true], Number.POSITIVE_INFINITY)).toEqual([]);
    expect(normalizePlateStatuses([true], -3)).toEqual([]);
  });

  it("keeps a print quantity per plate and defaults invalid values to one", () => {
    expect(normalizePlatePrintQuantities([3, "2", 0, -1, 1.5], 6)).toEqual([3, 2, 1, 1, 1, 1]);
    expect(normalizePlatePrintQuantities([4, 2], 1)).toEqual([4]);
  });

  it("keeps product totals separate from plate completion", () => {
    const oneProduct = createPlateTrackingUpdate(1, 3, [true, false, true], [2, 4, 1]);
    const hundredProducts = createPlateTrackingUpdate(100, 3, [true, false, true], [2, 4, 1]);

    expect(oneProduct.totalProducts).toBe(1);
    expect(hundredProducts.totalProducts).toBe(100);
    expect(oneProduct.totalPlates).toBe(3);
    expect(hundredProducts.totalPlates).toBe(3);
    expect(oneProduct.platePrintStatuses).toEqual(hundredProducts.platePrintStatuses);
    expect(oneProduct.platePrintQuantities).toEqual([2, 4, 1]);
    expect(oneProduct.platesCompleted).toBe(2);
    expect(hundredProducts.platesCompleted).toBe(2);
  });
});
