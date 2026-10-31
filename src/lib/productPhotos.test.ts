import { afterEach, describe, expect, it, vi } from "vitest";

const { signedUrl, publicRecord } = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  publicRecord: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signedUrl }) } },
}));
vi.mock("@/integrations/pocketbase/client", () => ({
  POCKETBASE_URL: "https://api.example.test",
  pocketbase: {
    authStore: { token: "" },
    filter: vi.fn(() => "public-filter"),
    collection: vi.fn(() => ({ getFirstListItem: publicRecord })),
    files: { getURL: (record: { id: string; file: string }) => `https://api.example.test/api/files/storage/${record.id}/${record.file}` },
  },
}));

import { getProductPhotoUrl } from "./productPhotos";

afterEach(() => {
  vi.unstubAllGlobals();
  signedUrl.mockClear();
  publicRecord.mockReset();
});

describe("publieke productmedia", () => {
  it("toont een actieve productfoto zonder account of bestandstoken", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const url = await getProductPhotoUrl("products/product123/photo.jpg");
    expect(url).toBe("https://api.example.test/api/overweel3d/catalog/media?path=products%2Fproduct123%2Fphoto.jpg");
    expect(fetcher).not.toHaveBeenCalled();
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it.each(["portfolio/project/photo.jpg", "colors/blue.jpg", "reviews/user/photo.jpg"])(
    "toont openbare media zonder account voor %s",
    async (path) => {
      const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
      vi.stubGlobal("fetch", fetcher);
      publicRecord.mockResolvedValue({ id: "public-record", file: "photo.jpg" });
      expect(await getProductPhotoUrl(path)).toBe(
        "https://api.example.test/api/files/storage/public-record/photo.jpg",
      );
      expect(fetcher).toHaveBeenCalledOnce();
      expect(signedUrl).not.toHaveBeenCalled();
    },
  );

  it("weigert voor oudere mediapaden een media-URL van een andere host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://example.org/api/files/storage/file/photo.jpg",
    }), { status: 200 })));
    expect(await getProductPhotoUrl("catalog-assets/untrusted.jpg")).toBe("");
  });

  it("vraagt zonder account geen privé-bestandstoken op", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getProductPhotoUrl("orders/private.3mf")).toBe("");
    expect(signedUrl).not.toHaveBeenCalled();
  });
});
