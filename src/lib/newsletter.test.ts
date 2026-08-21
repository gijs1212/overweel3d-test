import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEWSLETTER_PROMPT_STORAGE_KEY,
  hasSeenNewsletterPrompt,
  isValidNewsletterEmail,
  normalizeNewsletterEmail,
  rememberNewsletterPrompt,
} from "./newsletter";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

describe("newsletter helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("normalizes an email address before storage", () => {
    expect(normalizeNewsletterEmail("  Klant@Voorbeeld.NL ")).toBe("klant@voorbeeld.nl");
  });

  it.each([
    "klant@voorbeeld.nl",
    "voornaam.achternaam+nieuws@sub.voorbeeld.nl",
  ])("accepts a valid address: %s", (email) => {
    expect(isValidNewsletterEmail(email)).toBe(true);
  });

  it.each([
    "",
    "geen-apenstaartje.nl",
    "klant@",
    "@voorbeeld.nl",
    "klant @voorbeeld.nl",
  ])("rejects an invalid address: %s", (email) => {
    expect(isValidNewsletterEmail(email)).toBe(false);
  });

  it("remembers that this version of the popup has been shown", () => {
    expect(hasSeenNewsletterPrompt()).toBe(false);

    rememberNewsletterPrompt("dismissed");

    expect(window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY)).toBe("dismissed");
    expect(hasSeenNewsletterPrompt()).toBe(true);
  });

  it("falls back to session storage when local storage is blocked", () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    try {
      expect(hasSeenNewsletterPrompt()).toBe(false);

      rememberNewsletterPrompt("shown");

      expect(window.sessionStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY)).toBe("shown");
      expect(hasSeenNewsletterPrompt()).toBe(true);
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, "localStorage", localStorageDescriptor);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
    }
  });

  it("falls back to memory when both browser storage mechanisms are blocked", async () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    Object.defineProperty(window, "localStorage", { configurable: true, value: blockedStorage });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: blockedStorage });

    try {
      vi.resetModules();
      const freshNewsletterModule = await import("./newsletter");

      expect(freshNewsletterModule.hasSeenNewsletterPrompt()).toBe(false);

      freshNewsletterModule.rememberNewsletterPrompt("shown");

      expect(freshNewsletterModule.hasSeenNewsletterPrompt()).toBe(true);
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, "localStorage", localStorageDescriptor);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
      if (sessionStorageDescriptor) {
        Object.defineProperty(window, "sessionStorage", sessionStorageDescriptor);
      } else {
        Reflect.deleteProperty(window, "sessionStorage");
      }
    }
  });
});
