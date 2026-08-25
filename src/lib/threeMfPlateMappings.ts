export interface ThreeMfPlateMapping {
  id?: string;
  orderFileId: string;
  sourcePlateNumber: number;
  logicalPlateNumber?: number;
  sourceFileName: string;
  previewStoragePath?: string | null;
  colors: Array<{ name: string; hex: string }>;
  runsRequired: number;
  runsCompleted: number;
}

export function withLogicalPlateNumbers(
  mappings: readonly ThreeMfPlateMapping[],
): ThreeMfPlateMapping[] {
  return mappings.map((mapping, index) => ({
    ...mapping,
    logicalPlateNumber: index + 1,
  }));
}

export function movePlateMapping(
  mappings: readonly ThreeMfPlateMapping[],
  fromIndex: number,
  toIndex: number,
): ThreeMfPlateMapping[] {
  if (
    fromIndex < 0 || fromIndex >= mappings.length
    || toIndex < 0 || toIndex >= mappings.length
    || fromIndex === toIndex
  ) return withLogicalPlateNumbers(mappings);
  const next = [...mappings];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return withLogicalPlateNumbers(next);
}

export function mappingLabel(mapping: ThreeMfPlateMapping, admin: boolean): string {
  const logical = mapping.logicalPlateNumber || 1;
  return admin
    ? `Plaat ${logical} (${mapping.sourcePlateNumber} in bestand)`
    : `Plaat ${logical}`;
}
