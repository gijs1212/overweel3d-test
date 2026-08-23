import { describe, expect, it } from "vitest";

import { plateCandidatesFromArchiveFiles, printFileMatch } from "./threeMfInspector";

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
});
