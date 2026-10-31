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
});
