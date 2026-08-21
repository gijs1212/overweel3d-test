export const COOKIE_CONSENT_NAME = "cookieConsent";
export const COOKIE_SETTINGS_EVENT = "cookie-settings:open";
export const COOKIE_CONSENT_CHANGE_EVENT = "cookie-consent:change";

export type CookieConsentChoice = "accepted" | "declined";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function getCookieConsent(): CookieConsentChoice | null {
  if (typeof document === "undefined") return null;

  const consentCookie = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE_CONSENT_NAME}=`));

  const value = consentCookie?.slice(COOKIE_CONSENT_NAME.length + 1);
  return value === "accepted" || value === "declined" ? value : null;
}

export function setCookieConsent(choice: CookieConsentChoice) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;

  const attributes = [
    `${COOKIE_CONSENT_NAME}=${choice}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
  ];

  if (window.location.protocol === "https:") attributes.push("Secure");

  try {
    document.cookie = attributes.join("; ");
  } catch {
    return false;
  }

  const wasSaved = getCookieConsent() === choice;
  if (wasSaved) {
    window.dispatchEvent(new CustomEvent<CookieConsentChoice>(COOKIE_CONSENT_CHANGE_EVENT, { detail: choice }));
  }

  return wasSaved;
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
