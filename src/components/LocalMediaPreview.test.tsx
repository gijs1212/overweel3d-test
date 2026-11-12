import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalMediaPreview } from "./LocalMediaPreview";

describe("LocalMediaPreview", () => {
  const createObjectURL = vi.fn(() => "blob:preview");

  beforeEach(() => {
    createObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it("decodeert een grote JPG niet tijdens bestandsselectie", () => {
    const file = new File([new Uint8Array(3 * 1024 * 1024)], "camera.jpg", { type: "image/jpeg" });

    render(<LocalMediaPreview file={file} />);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText("Geselecteerd")).toBeInTheDocument();
  });

  it("decodeert HEIC niet voor de uploadstap", () => {
    const file = new File(["heic"], "camera.heic", { type: "image/heic" });

    render(<LocalMediaPreview file={file} />);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText("HEIC · wordt JPG")).toBeInTheDocument();
  });
  it("toont ook voor een grote video direct een afspeelbare preview", () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024)], "product.mp4", { type: "video/mp4" });

    render(<LocalMediaPreview file={file} kind="video" alt="Productvideo" />);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByLabelText("Productvideo").tagName).toBe("VIDEO");
  });
});
