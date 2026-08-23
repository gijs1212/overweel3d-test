import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import { inspectThreeMf, plateCandidatesFromArchiveFiles, printFileMatch } from "./threeMfInspector";

describe("threeMfInspector", () => {
  it("herkent Bambu-platen in een 3MF-archief", () => {
    expect(plateCandidatesFromArchiveFiles([
      "Metadata/plate_2.png",
      "Metadata/plate_1.gcode",
      "Metadata/plate_2.gcode",
    ])).toEqual([
      { number: 1, name: "Plaat 1", fileName: "plate_1.gcode" },
      { number: 2, name: "Plaat 2", fileName: "plate_2.gcode" },
    ]);
  });

  it("vergelijkt printernamen zonder pad en extensie", () => {
    expect(printFileMatch("OW3D-1042-P03.gcode.3mf", "/cache/OW3D_1042_P03.gcode")).toBe(true);
    expect(printFileMatch("OW3D-1042-P03.3mf", "andere-plaat.gcode")).toBe(false);
  });

  it("leest op mobiel alleen de benodigde plaat- en kleurmetadata", async () => {
    const archive = zipSync({
      "Metadata/plate_1.gcode": new Uint8Array([1, 2, 3]),
      "Metadata/plate_2.gcode": new Uint8Array([4, 5, 6]),
      "Metadata/project_settings.config": strToU8('<config><filament color="#FF0000" type="PLA rood"/><filament color="#FFFFFF" type="PLA wit"/></config>'),
    });
    const file = {
      name: "mobiel.3mf",
      size: archive.byteLength,
      arrayBuffer: async () => archive.slice().buffer as ArrayBuffer,
    } as File;

    const result = await inspectThreeMf(file, { lightweight: true });

    expect(result.modelDetailsAvailable).toBe(false);
    expect(result.signature).toBe("");
    expect(result.plates.map((plate) => plate.number)).toEqual([1, 2]);
    expect(result.colors).toEqual([
      { name: "PLA rood", hex: "#FF0000" },
      { name: "PLA wit", hex: "#FFFFFF" },
    ]);
  });
});
