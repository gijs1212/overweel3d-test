import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import CookieBanner from "./CookieBanner";
import {
  COOKIE_CONSENT_NAME,
  getCookieConsent,
  openCookieSettings,
  setCookieConsent,
} from "@/lib/cookieConsent";

function clearConsentCookie() {
  document.cookie = `${COOKIE_CONSENT_NAME}=; Max-Age=0; Path=/`;
}

describe("CookieBanner", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearConsentCookie();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearConsentCookie();
  });

  const renderBanner = () => {
    act(() => root.render(<CookieBanner />));
  };

  const getButton = (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === label || candidate.getAttribute("aria-label") === label,
    );

    if (!button) throw new Error(`Button "${label}" was not found`);
    return button;
  };

  it("asks for permission when no choice has been saved", () => {
    renderBanner();

    const dialog = container.querySelector('[role="dialog"]');
    const titleId = dialog?.getAttribute("aria-labelledby");

    expect(dialog).not.toBeNull();
    const title = document.getElementById(titleId ?? "");

    expect(title?.textContent).toBe("Uw cookievoorkeur");
    expect(document.activeElement).toBe(title);
  });

  it("saves accepted consent and closes the banner", () => {
    renderBanner();

    act(() => getButton("Alles toestaan").click());

    expect(getCookieConsent()).toBe("accepted");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("saves declined consent and does not ask again", () => {
    renderBanner();

    act(() => getButton("Alleen noodzakelijk").click());
    expect(getCookieConsent()).toBe("declined");

    act(() => root.render(<CookieBanner />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("recognizes a declined choice on a later visit", () => {
    setCookieConsent("declined");
    renderBanner();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("can be opened again so an existing choice can be changed", () => {
    setCookieConsent("declined");
    renderBanner();

    act(() => openCookieSettings());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Huidige keuze: alleen noodzakelijke cookies");

    act(() => getButton("Alles toestaan").click());
    expect(getCookieConsent()).toBe("accepted");
  });

  it("can close reopened settings without changing the saved choice", () => {
    const settingsButton = document.createElement("button");
    settingsButton.textContent = "Open settings";
    document.body.appendChild(settingsButton);
    setCookieConsent("accepted");
    renderBanner();
    settingsButton.focus();

    act(() => openCookieSettings());
    act(() => getButton("Cookie-instellingen sluiten").click());

    expect(getCookieConsent()).toBe("accepted");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(settingsButton);
    settingsButton.remove();
  });
});
