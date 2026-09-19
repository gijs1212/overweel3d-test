import { describe, expect, it } from "vitest";
import { amsSlotsForPrinter, dedupeAmsSlots } from "./amsSlots";

const printers = [
  { id: "printer-current", device_serial: "01P00C590102306" },
  { id: "printer-old", device_serial: "01P00C590102306" },
  { id: "printer-other", device_serial: "OTHER" },
];

describe("AMS-vakken", () => {
  it("toont aliassen van dezelfde fysieke printer en hetzelfde vak maar eenmaal", () => {
    const slots = dedupeAmsSlots([
      { id: "old", printer_id: "printer-old", ams_unit: 0, slot_number: 1, updated_at: "2026-01-01", color_name: null },
      { id: "new", printer_id: "printer-current", ams_unit: 0, slot_number: 1, updated_at: "2026-01-02", color_name: "Zwart" },
      { id: "duplicate", printer_id: "printer-current", ams_unit: 0, slot_number: 1, updated_at: "2026-01-03", color_name: null },
    ], printers);
    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe("new");
  });

  it("houdt hetzelfde vak van twee verschillende printers apart", () => {
    const slots = dedupeAmsSlots([
      { id: "main", printer_id: "printer-current", ams_unit: 0, slot_number: 1 },
      { id: "other", printer_id: "printer-other", ams_unit: 0, slot_number: 1 },
    ], printers);
    expect(slots).toHaveLength(2);
  });

  it("vindt AMS-vakken ook via een oud printerrecord met hetzelfde serienummer", () => {
    const slots = amsSlotsForPrinter([
      { id: "slot", printer_id: "printer-old", ams_unit: 0, slot_number: 1 },
    ], printers, "printer-current");
    expect(slots.map((slot) => slot.id)).toEqual(["slot"]);
  });

  it("voegt verweesde historische rijen samen wanneer er maar één printer bestaat", () => {
    const onlyPrinter = [{ id: "current", device_serial: "SERIAL-1" }];
    const slots = dedupeAmsSlots([
      { id: "orphan-a", printer_id: "deleted-a", ams_unit: 0, slot_number: 1, color_name: "Rood" },
      { id: "orphan-b", printer_id: "deleted-b", ams_unit: 0, slot_number: 1, color_name: "Rood" },
      { id: "current", printer_id: "current", ams_unit: 0, slot_number: 1, color_name: "Rood", material: "PLA" },
    ], onlyPrinter);
    expect(slots).toHaveLength(1);
    expect(amsSlotsForPrinter(slots, onlyPrinter, "current")).toHaveLength(1);
  });
});
