import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inspectThreeMf, disposeThreeMfInspection } = vi.hoisted(() => ({
  inspectThreeMf: vi.fn(),
  disposeThreeMfInspection: vi.fn(),
}));

vi.mock("@/lib/threeMfInspector", () => ({
  inspectThreeMf,
  disposeThreeMfInspection,
}));

vi.mock("@/components/ModelViewer", () => ({
  ModelViewer: () => <div>Interactief 3D-model</div>,
}));

import { ThreeMfOrderPreview } from "./ThreeMfOrderPreview";

describe("ThreeMfOrderPreview", () => {
  beforeEach(() => {
    inspectThreeMf.mockReset();
    disposeThreeMfInspection.mockReset();
    inspectThreeMf.mockResolvedValue({
      fileName: "voorbeeld.3mf",
      fileSize: 1200,
      signature: "abc",
      meshCount: 2,
      triangleCount: 456,
      dimensions: { width: 10, depth: 20, height: 30 },
      colors: [
        { name: "PLA rood", hex: "#FF0000" },
        { name: "PLA wit", hex: "#FFFFFF" },
      ],
      plates: [
        { number: 1, name: "Plaat 1", fileName: "plate_1.gcode" },
        { number: 2, name: "Plaat 2", fileName: "plate_2.gcode" },
      ],
      archiveFiles: [],
      modelDetailsAvailable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toont kleuren en laat de klant tussen 3MF-platen bladeren", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ThreeMfOrderPreview file={new File(["3mf"], "voorbeeld.3mf")} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("PLA rood");
    expect(container.textContent).toContain("#FFFFFF");
    expect(container.textContent).toContain("Plaat 1 van 2");

    const nextButton = container.querySelector<HTMLButtonElement>('button[aria-label="Volgende plaat"]');
    expect(nextButton).not.toBeNull();
    act(() => nextButton?.click());

    expect(container.textContent).toContain("Plaat 2 van 2");
    expect(container.textContent).toContain("Interactief 3D-model");

    act(() => root.unmount());
    container.remove();
  });

  it("laadt op telefoon eerst de lichte plaatweergave en 3D alleen op verzoek", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<ThreeMfOrderPreview file={new File(["3mf"], "mobiel.3mf")} />);
      await Promise.resolve();
    });

    expect(inspectThreeMf).toHaveBeenCalledWith(expect.any(File), { lightweight: true });
    expect(container.textContent).toContain("Interactieve 3D-weergave laden");
    expect(container.textContent).not.toContain("Interactief 3D-model");

    const load3dButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Interactieve 3D-weergave laden"));
    act(() => load3dButton?.click());
    expect(container.textContent).toContain("Interactief 3D-model");

    act(() => root.unmount());
    container.remove();
  });
});
