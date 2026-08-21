import { describe, expect, it } from "vitest";

import {
  availableFilamentColorsForMaterial,
  availableMaterialsForProduct,
  buildProductOptionAnswers,
  colorMatchesMaterial,
  normalizeMaterialId,
  orderedProductImages,
  validateCatalogColorSelection,
  type CatalogProduct,
} from "@/lib/productCatalog";

describe("productCatalog", () => {
  it("gebruikt alleen actieve Supabase-kleuren voor het gekozen materiaal", () => {
    const colors = [
      { id: "2", name: "Later", material: "PLA", hex: "#222222", photos: [], description: "", sort_order: 20, active: true },
      { id: "1", name: "Eerst", material: "pla", hex: "#111111", photos: [], description: "", sort_order: 10, active: true },
      { id: "3", name: "Uit", material: "PLA", hex: "#333333", photos: [], description: "", sort_order: 0, active: false },
      { id: "4", name: "PETG", material: "PETG", hex: "#444444", photos: [], description: "", sort_order: 0, active: true },
    ];
    expect(availableFilamentColorsForMaterial(colors, "pla").map((color) => color.id)).toEqual(["1", "2"]);
  });

  it("normaliseert materiaal-id's en databasenamen hetzelfde", () => {
    expect(normalizeMaterialId("PLA")).toBe("pla");
    expect(normalizeMaterialId(" petg ")).toBe("petg");
    expect(colorMatchesMaterial({ material: "TPU" } as never, "tpu")).toBe(true);
  });

  it("respecteert fixed, selected en all materiaalmodi", () => {
    const base = { materials: ["pla"], material_mode: "fixed" } as unknown as CatalogProduct;
    expect(availableMaterialsForProduct(base).map((item) => item.id)).toEqual(["pla"]);
    expect(availableMaterialsForProduct({ ...base, material_mode: "selected", materials: ["pla", "petg"] }).map((item) => item.id)).toEqual(["pla", "petg"]);
    expect(availableMaterialsForProduct({ ...base, material_mode: "all", materials: [] })).toHaveLength(3);
  });

  it("zet de expliciete hoofdfoto vooraan en ondersteunt legacy foto-arrays", () => {
    const normalized = orderedProductImages({
      photos: ["legacy.jpg"],
      product_images: [
        { id: "a", product_id: "p", storage_path: "a.jpg", alt_text: "", sort_order: 0, is_primary: false },
        { id: "b", product_id: "p", storage_path: "b.jpg", alt_text: "", sort_order: 5, is_primary: true },
      ],
    });
    expect(normalized.map((item) => item.storage_path)).toEqual(["b.jpg", "a.jpg"]);
    expect(orderedProductImages({ photos: ["first.jpg", "second.jpg"] })[0]).toMatchObject({ storage_path: "first.jpg", is_primary: true });
  });

  it("valideert optionele, verplichte en echte multicolorselecties", () => {
    expect(validateCatalogColorSelection({ color_required: false, color_selection_mode: "single", max_colors: 1 }, [], ["red"])).toBeNull();
    expect(validateCatalogColorSelection({ color_required: true, color_selection_mode: "single", max_colors: 1 }, [], ["red"])).toContain("minimaal");
    expect(validateCatalogColorSelection({ color_required: true, color_selection_mode: "multiple", max_colors: 2 }, ["red", "blue"], ["red", "blue"])).toBeNull();
    expect(validateCatalogColorSelection({ color_required: true, color_selection_mode: "multiple", max_colors: 2 }, ["red", "blue", "green"], ["red", "blue", "green"])).toContain("maximaal 2");
    expect(validateCatalogColorSelection({ color_required: false, color_selection_mode: "multiple", max_colors: 2 }, ["hidden"], ["red"])).toContain("niet beschikbaar");
  });

  it("bouwt gelabelde momentopnames van meerdere dynamische antwoorden", () => {
    const options = [
      { id: "front", type: "text", label: "Tekst voorkant" },
      { id: "size", type: "select", label: "Formaat" },
      { id: "gift", type: "checkbox", label: "Cadeauverpakking" },
      { id: "photo", type: "photo", label: "Foto" },
    ] as never;
    expect(buildProductOptionAnswers(options, { front: "  Welkom  ", size: "Groot", gift: true })).toEqual([
      { optionId: "front", label: "Tekst voorkant", type: "text", value: "Welkom" },
      { optionId: "size", label: "Formaat", type: "select", value: "Groot" },
      { optionId: "gift", label: "Cadeauverpakking", type: "checkbox", value: true },
    ]);
  });
});
