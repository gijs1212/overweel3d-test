import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientId } from "./clientId";

afterEach(() => vi.unstubAllGlobals());

describe("createClientId", () => {
  it("gebruikt randomUUID wanneer beschikbaar", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "bestaande-uuid" });
    expect(createClientId()).toBe("bestaande-uuid");
  });

  it("werkt ook zonder randomUUID via getRandomValues", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: bytes.length }, (_, index) => index));
        return bytes;
      },
    });
    expect(createClientId()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
