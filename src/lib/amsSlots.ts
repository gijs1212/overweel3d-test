export type AmsPrinterIdentity = {
  id: string;
  device_serial?: string | null;
};

export type AmsSlotIdentity = {
  id: string;
  printer_id: string;
  ams_unit: number;
  slot_number: number;
  updated_at?: string | null;
  material?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  tray_uuid?: string | null;
  remaining_grams?: number | null;
  remaining_percent?: number | null;
};

const printerIdentityMap = (printers: AmsPrinterIdentity[]) => new Map(
  printers.map((printer) => [
    printer.id,
    String(printer.device_serial || printer.id).trim().toUpperCase(),
  ]),
);

const physicalPrinterIdentities = (printers: AmsPrinterIdentity[]) => [
  ...new Set(printers.map((printer) => String(printer.device_serial || printer.id).trim().toUpperCase())),
];

const slotPrinterIdentity = (printerId: string, identities: Map<string, string>, physicalIdentities: string[]) => {
  const known = identities.get(printerId);
  if (known) return known;
  // Migrated PocketBase data can still contain AMS rows that reference an old
  // printer record. If the website has exactly one physical printer, those
  // orphan rows can only belong to that printer and must not create duplicate
  // UI buttons.
  if (physicalIdentities.length === 1) return physicalIdentities[0];
  return printerId;
};

const normalNumber = (value: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
};

const informationScore = (slot: AmsSlotIdentity) => [
  slot.tray_uuid,
  slot.material,
  slot.color_name,
  slot.color_hex,
  slot.remaining_grams,
  slot.remaining_percent,
].filter((value) => value !== null && value !== undefined && value !== "").length;

const preferSlot = <T extends AmsSlotIdentity>(current: T, candidate: T) => {
  const currentScore = informationScore(current);
  const candidateScore = informationScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  const currentTime = Date.parse(current.updated_at || "") || 0;
  const candidateTime = Date.parse(candidate.updated_at || "") || 0;
  return candidateTime > currentTime ? candidate : current;
};

/**
 * PocketBase can temporarily contain old AMS rows that point at duplicate
 * printer records with the same serial. Collapse those aliases so one physical
 * AMS unit/slot always produces exactly one UI option.
 */
export const dedupeAmsSlots = <T extends AmsSlotIdentity>(rows: T[], printers: AmsPrinterIdentity[]) => {
  const identities = printerIdentityMap(printers);
  const physicalIdentities = physicalPrinterIdentities(printers);
  const unique = new Map<string, T>();
  for (const source of rows) {
    const row = {
      ...source,
      ams_unit: normalNumber(source.ams_unit),
      slot_number: normalNumber(source.slot_number),
    } as T;
    const printerKey = slotPrinterIdentity(row.printer_id, identities, physicalIdentities);
    const key = `${printerKey}:${row.ams_unit}:${row.slot_number}`;
    const current = unique.get(key);
    unique.set(key, current ? preferSlot(current, row) : row);
  }
  return [...unique.values()].sort((left, right) => left.ams_unit - right.ams_unit || left.slot_number - right.slot_number);
};

export const amsSlotsForPrinter = <T extends AmsSlotIdentity>(rows: T[], printers: AmsPrinterIdentity[], printerId: string) => {
  const identities = printerIdentityMap(printers);
  const physicalIdentities = physicalPrinterIdentities(printers);
  const selectedIdentity = identities.get(printerId) || printerId;
  return dedupeAmsSlots(rows, printers).filter((slot) => slotPrinterIdentity(slot.printer_id, identities, physicalIdentities) === selectedIdentity);
};
