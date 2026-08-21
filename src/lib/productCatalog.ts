import { MATERIALS } from "@/lib/constants";

export type MaterialMode = "fixed" | "selected" | "all";
export type ColorSelectionMode = "single" | "multiple";
export type ProductOptionType = "text" | "textarea" | "select" | "radio" | "checkbox" | "photo";

export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  active: boolean;
}

export interface ProductImage {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductOption {
  id: string;
  product_id: string;
  type: ProductOptionType;
  label: string;
  description: string;
  required: boolean;
  choices: string[];
  max_length: number | null;
  sort_order: number;
  active: boolean;
}

export interface FilamentColor {
  id: string;
  name: string;
  material: string;
  hex: string;
  photos: string[];
  description: string;
  sort_order: number;
  active: boolean;
}

export interface ProductColorAvailability {
  product_id: string;
  color_id: string;
  available: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category_id: string | null;
  materials: string[];
  colors: string[];
  photos: string[];
  material_mode: MaterialMode;
  material_fixed: boolean;
  color_selection_mode: ColorSelectionMode;
  color_required: boolean;
  colors_configured: boolean;
  max_colors: number;
  multicolor_allowed: boolean;
  custom_text_enabled: boolean;
  custom_text_label: string;
  custom_text_max_length: number;
  customer_photo_required: boolean;
  active: boolean;
  product_categories?: ProductCategory | null;
  product_images?: ProductImage[];
  product_options?: ProductOption[];
}

export interface ProductOptionAnswer {
  optionId: string;
  label: string;
  type: ProductOptionType | "legacy_text";
  value: string | boolean;
  files?: string[];
}

export interface CatalogOrderItem {
  productId: string;
  productName: string;
  material: string;
  colors: Array<{ id: string; name: string; hex?: string }>;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  answers: ProductOptionAnswer[];
}

export const normalizeMaterialId = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return MATERIALS.find((material) =>
    material.id.toLowerCase() === normalized || material.name.toLowerCase() === normalized
  )?.id || normalized;
};

export const materialLabel = (value: string) =>
  MATERIALS.find((material) => material.id === normalizeMaterialId(value))?.name || value;

export const colorMatchesMaterial = (color: FilamentColor, materialId: string) =>
  normalizeMaterialId(color.material) === normalizeMaterialId(materialId);

export const availableFilamentColorsForMaterial = (
  colors: readonly FilamentColor[],
  materialId: string,
) => colors
  .filter((color) => color.active && colorMatchesMaterial(color, materialId))
  .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

export const orderedProductImages = (product: Pick<CatalogProduct, "product_images" | "photos">) => {
  const normalized = [...(product.product_images || [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  if (normalized.length) return normalized;
  return (product.photos || []).map((storage_path, index) => ({
    id: `legacy-${index}`,
    product_id: "",
    storage_path,
    alt_text: "",
    sort_order: index,
    is_primary: index === 0,
  }));
};

export const availableMaterialsForProduct = (product: CatalogProduct) => {
  if (product.material_mode === "all") return MATERIALS;
  const allowed = new Set((product.materials || []).map(normalizeMaterialId));
  return MATERIALS.filter((material) => allowed.has(material.id));
};

export const validateCatalogColorSelection = (
  product: Pick<CatalogProduct, "color_required" | "color_selection_mode" | "max_colors">,
  selectedIds: string[],
  availableIds: string[],
) => {
  if (product.color_required && selectedIds.length === 0) return "Kies minimaal één kleur.";
  if (selectedIds.some((id) => !availableIds.includes(id))) return "Een gekozen kleur is niet beschikbaar voor dit materiaal.";
  if (product.color_selection_mode === "single" && selectedIds.length > 1) return "Kies één kleur.";
  if (product.color_selection_mode === "multiple" && selectedIds.length > product.max_colors) return `Kies maximaal ${product.max_colors} kleuren.`;
  return null;
};

export const buildProductOptionAnswers = (
  options: ProductOption[],
  values: Record<string, string | boolean>,
): ProductOptionAnswer[] => options
  .filter((option) => option.type !== "photo")
  .filter((option) => option.type === "checkbox" || String(values[option.id] || "").trim())
  .map((option) => ({
    optionId: option.id,
    label: option.label,
    type: option.id === "legacy-custom-text" ? "legacy_text" : option.type,
    value: option.type === "checkbox" ? values[option.id] === true : String(values[option.id] || "").trim(),
  }));
