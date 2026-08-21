import { describe, expect, it } from "vitest";
import { isHeicFile, jpegNameForHeic, jpegPathForHeic } from "./imageUploads";

describe("HEIC upload helpers", () => {
  it("detects HEIC and HEIF by extension or MIME type", () => {
    expect(isHeicFile({ name: "foto.HEIC", type: "" })).toBe(true);
    expect(isHeicFile({ name: "foto", type: "image/heif" })).toBe(true);
    expect(isHeicFile({ name: "foto.jpg", type: "image/jpeg" })).toBe(false);
  });

  it("creates jpg names and storage paths", () => {
    expect(jpegNameForHeic("IMG_1234.heic")).toBe("IMG_1234.jpg");
    expect(jpegNameForHeic("upload")).toBe("upload.jpg");
    expect(jpegPathForHeic("products/IMG_1234.HEIF")).toBe("products/IMG_1234.jpg");
  });
});
