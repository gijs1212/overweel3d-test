import { COOKIE_CONSENT_CHANGE_EVENT, getCookieConsent, type CookieConsentChoice } from "@/lib/cookieConsent";

const META_PIXEL_ID = "1103579539139258";
const META_PIXEL_SCRIPT_ID = "overweel3d-meta-pixel";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initialized = false;

function createFbq(): Fbq {
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  return fbq;
}

export function enableMetaPixel() {
  if (typeof window === "undefined" || typeof document === "undefined" || getCookieConsent() !== "accepted") return false;

  const fbq = window.fbq || createFbq();
  window.fbq = fbq;
  window._fbq ||= fbq;

  if (!document.getElementById(META_PIXEL_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  if (!initialized) {
    fbq("consent", "grant");
    fbq("init", META_PIXEL_ID);
    initialized = true;
  }
  return true;
}

export function trackMetaPageView() {
  if (!enableMetaPixel()) return;
  window.fbq?.("track", "PageView");
}

export function revokeMetaPixelConsent() {
  window.fbq?.("consent", "revoke");
}

export function subscribeToMetaPixelConsent(onChoice: (choice: CookieConsentChoice) => void) {
  const listener = (event: Event) => onChoice((event as CustomEvent<CookieConsentChoice>).detail);
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, listener);
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, listener);
}

