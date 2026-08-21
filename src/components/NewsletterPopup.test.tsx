import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import NewsletterPopup from "./NewsletterPopup";
import { COOKIE_CONSENT_NAME, setCookieConsent } from "@/lib/cookieConsent";
import { NEWSLETTER_PROMPT_STORAGE_KEY } from "@/lib/newsletter";

function clearConsentCookie() {
  document.cookie = `${COOKIE_CONSENT_NAME}=; Max-Age=0; Path=/`;
}

describe("NewsletterPopup", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearConsentCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearConsentCookie();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const renderPopup = () => {
    act(() => root.render(<NewsletterPopup />));
  };

  it("waits until the visitor has made a cookie choice", () => {
    renderPopup();

    expect(document.body.textContent).not.toContain("Blijf op de hoogte");
    expect(window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY)).toBeNull();
  });

  it("shows once after either cookie choice is known", () => {
    renderPopup();

    act(() => setCookieConsent("declined"));

    expect(document.body.textContent).toContain("Blijf op de hoogte");
    expect(window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY)).toBe("shown");
  });

  it("makes declining permanent for the current prompt version", () => {
    setCookieConsent("accepted");
    renderPopup();

    const declineButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Nee, bedankt",
    );
    expect(declineButton).toBeDefined();

    act(() => declineButton?.click());

    expect(document.body.textContent).not.toContain("Blijf op de hoogte");
    expect(window.localStorage.getItem(NEWSLETTER_PROMPT_STORAGE_KEY)).toBe("dismissed");

    act(() => root.unmount());
    root = createRoot(container);
    renderPopup();

    expect(document.body.textContent).not.toContain("Blijf op de hoogte");
  });
});
