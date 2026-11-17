import { afterEach, describe, expect, it, vi } from "vitest";

const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://appwrite.example/v1/storage/public/${encodeURIComponent(path)}` } }));
const createSignedUrl = vi.fn(async (path: string) => ({ data: { signedUrl: `https://appwrite.example/v1/storage/private/${encodeURIComponent(path)}` }, error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: vi.fn(() => ({ getPublicUrl, createSignedUrl })) } },
}));

import { getProductPhotoUrl, normalizeProductStoragePath } from "./productPhotos";

afterEach(() => {
  getPublicUrl.mockClear();
  createSignedUrl.mockClear();
});

describe("Appwrite-productmedia", () => {
  it("toont een productfoto zonder account via de publieke bucket", async () => {
    const url = await getProductPhotoUrl("products/product123/photo.jpg");
    expect(url).toContain("/storage/public/products%2Fproduct123%2Fphoto.jpg");
    expect(getPublicUrl).toHaveBeenCalledWith("products/product123/photo.jpg");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["portfolio/project/photo.jpg", "colors/blue.jpg", "reviews/user/photo.jpg", "social/manual/post.jpg"])(
    "toont openbare media zonder account voor %s",
    async (path) => {
      expect(await getProductPhotoUrl(path)).toContain(`/storage/public/${encodeURIComponent(path)}`);
      expect(createSignedUrl).not.toHaveBeenCalled();
    },
  );

  it("normaliseert oude Supabase-opslagpaden", () => {
    expect(normalizeProductStoragePath("/storage/v1/object/public/orders/products/a.jpg")).toBe("products/a.jpg");
  });

  it("gebruikt alleen voor niet-openbare media de opslagresolver", async () => {
    expect(await getProductPhotoUrl("private/order.3mf")).toContain("/storage/private/private%2Forder.3mf");
    expect(createSignedUrl).toHaveBeenCalledWith("private/order.3mf", 3600);
  });

  it("laat reeds bruikbare HTTPS-URLs ongewijzigd", async () => {
    expect(await getProductPhotoUrl("https://cdn.example/photo.jpg")).toBe("https://cdn.example/photo.jpg");
  });
});
