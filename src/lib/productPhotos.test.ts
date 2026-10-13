import { afterEach, describe, expect, it, vi } from "vitest";

const { signedUrl } = vi.hoisted(() => ({ signedUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signedUrl }) } },
}));
vi.mock("@/integrations/pocketbase/client", () => ({
  POCKETBASE_URL: "https://api.example.test",
  pocketbase: { authStore: { token: "" } },
}));

import { getProductPhotoUrl } from "./productPhotos";

afterEach(() => {
  vi.unstubAllGlobals();
  signedUrl.mockClear();
});

describe("publieke productmedia", () => {
  it("toont een actieve productfoto zonder account of bestandstoken", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://api.example.test/api/files/pbc_storage/file123/photo.jpg",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);

    const url = await getProductPhotoUrl("products/product123/photo.jpg");
    expect(url).toBe("https://api.example.test/api/files/pbc_storage/file123/photo.jpg");
    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/api/overweel3d/catalog/media?path=products%2Fproduct123%2Fphoto.jpg&resolve=1");
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it("weigert een media-URL van een andere host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "https://example.org/api/files/storage/file/photo.jpg",
    }), { status: 200 })));
    expect(await getProductPhotoUrl("products/product123/untrusted.jpg")).toBe("");
  });

  it("vraagt zonder account geen privé-bestandstoken op", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getProductPhotoUrl("orders/private.3mf")).toBe("");
    expect(signedUrl).not.toHaveBeenCalled();
  });
});
