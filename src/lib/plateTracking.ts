export interface PlateTrackingUpdate {
  totalProducts: number;
  totalPlates: number;
  platePrintStatuses: boolean[];
  platePrintQuantities: number[];
  platesCompleted: number;
}

/**
 * Detect Bambu build plates from archive entry names and slicer metadata.
 * Object/model filenames are intentionally ignored: product totals are separate
 * order data and must never influence the detected plate count.
 */
export function detectBambuPlateCount(
  entryNames: readonly string[],
  metadataDocuments: readonly string[] = [],
): number {
  const plateNumbers = new Set<number>();
  for (const entryName of entryNames) {
    const match = entryName.match(/metadata\/plate_(\d+)(?:_small)?\.(?:gcode|json|png)$/i);
    if (match) plateNumbers.add(Number(match[1]));
  }

  const metadataPlateCount = metadataDocuments.reduce(
    (highest, document) => Math.max(highest, document.match(/<plate\b/gi)?.length ?? 0),
    0,
  );

  // Generic single-plate 3MF files often omit Bambu's numbered previews.
  return Math.max(1, plateNumbers.size, metadataPlateCount);
}

export function normalizePlateStatuses(
  statuses: readonly boolean[],
  totalPlates: number,
): boolean[] {
  const safePlateTotal = Number.isFinite(totalPlates)
    ? Math.max(0, Math.trunc(totalPlates))
    : 0;
  return Array.from(
    { length: safePlateTotal },
    (_, index) => statuses[index] === true,
  );
}

export function normalizePlatePrintQuantities(
  quantities: readonly unknown[],
  totalPlates: number,
): number[] {
  const safePlateTotal = Number.isFinite(totalPlates)
    ? Math.max(0, Math.trunc(totalPlates))
    : 0;

  return Array.from({ length: safePlateTotal }, (_, index) => {
    const quantity = Number(quantities[index]);
    return Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
  });
}

/**
 * Build the persistence payload while deliberately keeping total products and
 * plates independent. No products-per-plate value is calculated or stored.
 */
export function createPlateTrackingUpdate(
  totalProducts: number,
  totalPlates: number,
  statuses: readonly boolean[],
  quantities: readonly unknown[] = [],
): PlateTrackingUpdate {
  const platePrintStatuses = normalizePlateStatuses(statuses, totalPlates);
  return {
    totalProducts,
    totalPlates,
    platePrintStatuses,
    platePrintQuantities: normalizePlatePrintQuantities(quantities, totalPlates),
    platesCompleted: platePrintStatuses.filter(Boolean).length,
  };
}
