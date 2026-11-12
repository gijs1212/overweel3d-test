import { describe, expect, it } from "vitest";
import { classifyMediaFile, validateMediaSelection } from "./mediaFiles";

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

describe("veilige mediaselectie", () => {
  it("herkent HEIC ook zonder bruikbaar MIME-type", () => {
    expect(classifyMediaFile(file("iphone.HEIC", ""))).toBe("image");
  });

  it("weigert video's wanneer alleen foto's zijn toegestaan", () => {
    const result = validateMediaSelection([file("clip.mov", "video/quicktime")], { allowVideos: false });
    expect(result.accepted).toHaveLength(0);
    expect(result.errors[0]).toContain("niet-ondersteund");
  });

  it("begrenst bestandsgrootte en aantal vóór preview of upload", () => {
    const result = validateMediaSelection([
      file("groot.jpg", "image/jpeg", 101),
      file("goed.jpg", "image/jpeg", 50),
      file("extra.jpg", "image/jpeg", 50),
    ], { maxImageBytes: 100, maxFiles: 2 });
    expect(result.accepted.map(({ file: accepted }) => accepted.name)).toEqual(["goed.jpg"]);
    expect(result.errors).toHaveLength(2);
  });

  it("accepteert video's tot 250 MB en weigert grotere bestanden", () => {
    const accepted = file("product.mp4", "video/mp4");
    const tooLarge = file("te-groot.mp4", "video/mp4");
    Object.defineProperty(accepted, "size", { value: 250 * 1024 * 1024 });
    Object.defineProperty(tooLarge, "size", { value: 250 * 1024 * 1024 + 1 });

    const result = validateMediaSelection([accepted, tooLarge], { allowVideos: true });

    expect(result.accepted.map(({ file: video }) => video.name)).toEqual(["product.mp4"]);
    expect(result.errors[0]).toContain("groter dan 250 MB");
  });

  it("accepteert meerdere foto's en video's samen in één selectie", () => {
    const selected = validateMediaSelection([
      file("voorkant.jpg", "image/jpeg"),
      file("demonstratie.mp4", "video/mp4"),
      file("achterkant.png", "image/png"),
      file("draaiend.webm", "video/webm"),
    ], { allowVideos: true, maxFiles: 20 });

    expect(selected.errors).toEqual([]);
    expect(selected.accepted.map(({ file: media }) => media.name)).toEqual([
      "voorkant.jpg",
      "demonstratie.mp4",
      "achterkant.png",
      "draaiend.webm",
    ]);
  });
});
