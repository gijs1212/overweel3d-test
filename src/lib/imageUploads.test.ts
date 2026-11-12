import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => storage } },
}));

vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));

vi.mock("heic-to/csp", () => ({
  heicTo: vi.fn(async () => new Blob(["modern-jpeg"], { type: "image/jpeg" })),
}));

import { isHeicFile, jpegNameForHeic, jpegPathForHeic, uploadFileWithHeicConversion } from "./imageUploads";

describe("HEIC upload helpers", () => {
  beforeEach(() => {
    storage.upload.mockReset();
    storage.remove.mockReset();
  });

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

  it("uploads HEIC first, converts it, uploads JPG and removes the temporary source", async () => {
    storage.upload
      .mockResolvedValueOnce({ data: { path: "products/foto.heic" }, error: null })
      .mockResolvedValueOnce({ data: { path: "products/foto.jpg" }, error: null });
    storage.remove.mockResolvedValue({ data: ["products/foto.heic"], error: null });
    const source = new File(["heic"], "foto.heic", { type: "image/heic" });

    const result = await uploadFileWithHeicConversion("orders", "products/foto.heic", source);

    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(storage.upload.mock.calls[0][0]).toBe("products/foto.heic");
    expect(storage.upload.mock.calls[0][1]).toBe(source);
    expect(storage.upload.mock.calls[1][0]).toBe("products/foto.jpg");
    expect(storage.upload.mock.calls[1][1]).toMatchObject({ name: "foto.jpg", type: "image/jpeg" });
    expect(storage.remove).toHaveBeenCalledWith(["products/foto.heic"]);
    expect(result).toMatchObject({ error: null, path: "products/foto.jpg", converted: true });
  });
});
