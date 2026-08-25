import { describe, expect, it } from "vitest";
import { mappingLabel, movePlateMapping, withLogicalPlateNumbers } from "./threeMfPlateMappings";

const mappings = [
  { orderFileId: "a", sourcePlateNumber: 4, sourceFileName: "a.3mf", colors: [], runsRequired: 2, runsCompleted: 1 },
  { orderFileId: "a", sourcePlateNumber: 5, sourceFileName: "a.3mf", colors: [], runsRequired: 1, runsCompleted: 0 },
];

describe("3MF plate mappings", () => {
  it("maps source plates 4 and 5 to logical plates 1 and 2", () => {
    const numbered = withLogicalPlateNumbers(mappings);
    expect(mappingLabel(numbered[0], true)).toBe("Plaat 1 (4 in bestand)");
    expect(mappingLabel(numbered[0], false)).toBe("Plaat 1");
    expect(numbered[1].logicalPlateNumber).toBe(2);
  });

  it("reorders without losing source identity or progress", () => {
    const reordered = movePlateMapping(withLogicalPlateNumbers(mappings), 1, 0);
    expect(reordered.map((item) => item.sourcePlateNumber)).toEqual([5, 4]);
    expect(reordered[1].runsCompleted).toBe(1);
    expect(reordered.map((item) => item.logicalPlateNumber)).toEqual([1, 2]);
  });
});
