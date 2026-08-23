export type InfillPattern = "grid" | "gyroid" | "cubic" | "lines";

export interface SlicerSettings {
  layer_height_mm: number;
  nozzle_diameter_mm: number;
  line_width_mm: number;
  infill_percent: number;
  infill_pattern: InfillPattern;
  wall_loops: number;
  top_layers: number;
  bottom_layers: number;
  print_speed_mm_s: number;
  first_layer_speed_mm_s: number;
  supports_enabled: boolean;
  support_density_percent: number;
  brim_width_mm: number;
}

export interface AutoPricingConfig {
  filament_price_per_kg: Record<string, number>;
  margin_percent: number;
  failure_buffer_percent: number;
  slicer: SlicerSettings;
}

export interface AutoPricingInput {
  material: string;
  filamentGrams: number;
}

export interface ModelSlicerEstimate {
  filamentGrams: number;
  printHours: number;
}

export const DEFAULT_SLICER_SETTINGS: SlicerSettings = {
  layer_height_mm: 0.2,
  nozzle_diameter_mm: 0.4,
  line_width_mm: 0.42,
  infill_percent: 20,
  infill_pattern: "grid",
  wall_loops: 3,
  top_layers: 5,
  bottom_layers: 4,
  print_speed_mm_s: 150,
  first_layer_speed_mm_s: 50,
  supports_enabled: false,
  support_density_percent: 15,
  brim_width_mm: 0,
};

export const DEFAULT_AUTO_PRICING_CONFIG: AutoPricingConfig = {
  filament_price_per_kg: { PLA: 24, PETG: 27, TPU: 35 },
  margin_percent: 30,
  failure_buffer_percent: 10,
  slicer: DEFAULT_SLICER_SETTINGS,
};

const safe = (value: number, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;

export function calculateAutomaticPrice(input: AutoPricingInput, config: AutoPricingConfig) {
  const filamentPricePerKg = safe(config.filament_price_per_kg[input.material] ?? 0);
  const materialCost = safe(input.filamentGrams) * filamentPricePerKg / 1000;
  const failureBuffer = materialCost * safe(config.failure_buffer_percent) / 100;
  const costWithRisk = materialCost + failureBuffer;
  const marginRate = Math.min(safe(config.margin_percent), 95) / 100;
  const recommendedPrice = costWithRisk / (1 - marginRate);
  const marginAmount = recommendedPrice - costWithRisk;

  return { filamentPricePerKg, materialCost, failureBuffer, costWithRisk, marginAmount, recommendedPrice };
}

export function estimateModelForSlicer(
  volumeCm3: number,
  material: string,
  slicer: SlicerSettings,
): ModelSlicerEstimate {
  const densities: Record<string, number> = { PLA: 1.24, PETG: 1.27, TPU: 1.21, ABS: 1.04, ASA: 1.07 };
  const density = densities[material.toUpperCase()] ?? 1.24;
  const nozzle = Math.max(0.2, safe(slicer.nozzle_diameter_mm, 0.4));
  const lineWidth = Math.max(nozzle * 0.75, safe(slicer.line_width_mm, nozzle * 1.05));
  const wallFraction = Math.min(0.72, Math.max(0.12, 0.12 + safe(slicer.wall_loops, 3) * lineWidth * 0.1));
  const solidLayerFraction = Math.min(0.18, (safe(slicer.top_layers, 5) + safe(slicer.bottom_layers, 4)) * 0.008);
  const patternFactor: Record<InfillPattern, number> = { grid: 1, gyroid: 1.08, cubic: 1.05, lines: 0.92 };
  const infill = Math.min(100, safe(slicer.infill_percent, 20)) / 100 * patternFactor[slicer.infill_pattern];
  const supportMaterialFactor = slicer.supports_enabled ? 1 + Math.min(100, safe(slicer.support_density_percent, 15)) / 100 * 0.45 : 1;
  const brimFactor = 1 + Math.min(30, safe(slicer.brim_width_mm)) * 0.006;
  const fillFraction = Math.min(1, wallFraction + solidLayerFraction + (1 - wallFraction - solidLayerFraction) * infill);
  const filamentGrams = safe(volumeCm3) * density * fillFraction * supportMaterialFactor * brimFactor;

  const layerHeight = Math.max(0.04, safe(slicer.layer_height_mm, 0.2));
  const printSpeed = Math.max(10, safe(slicer.print_speed_mm_s, 150));
  const firstLayerSpeed = Math.max(5, safe(slicer.first_layer_speed_mm_s, 50));
  const layerFactor = Math.pow(0.2 / layerHeight, 0.72);
  const speedFactor = 150 / printSpeed;
  const extrusionFactor = 0.42 / lineWidth;
  const firstLayerFactor = 1 + Math.max(0, printSpeed / firstLayerSpeed - 1) * 0.035;
  const supportTimeFactor = slicer.supports_enabled ? 1.08 + Math.min(100, safe(slicer.support_density_percent, 15)) / 100 * 0.25 : 1;
  const printHours = Math.max(0.1, filamentGrams / 12 * layerFactor * speedFactor * extrusionFactor * firstLayerFactor * supportTimeFactor);
  return { filamentGrams, printHours };
}
