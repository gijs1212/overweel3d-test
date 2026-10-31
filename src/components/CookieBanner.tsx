import { useEffect, useId, useRef, useState } from "react";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COOKIE_SETTINGS_EVENT,
  getCookieConsent,
  setCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookieConsent";

export default function CookieBanner() {
  const [bannerState, setBannerState] = useState(() => {
    const choice = getCookieConsent();
    return { choice, isVisible: choice === null };
  });
  const [storageError, setStorageError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const { choice, isVisible } = bannerState;

  useEffect(() => {
    const showCookieSettings = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setStorageError("");
      setBannerState({ choice: getCookieConsent(), isVisible: true });
    };

    window.addEventListener(COOKIE_SETTINGS_EVENT, showCookieSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, showCookieSettings);
  }, []);

  useEffect(() => {
    if (isVisible) titleRef.current?.focus();
  }, [isVisible]);

  const closeBanner = (nextChoice: CookieConsentChoice) => {
    setBannerState({ choice: nextChoice, isVisible: false });
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  };

  const saveChoice = (nextChoice: CookieConsentChoice) => {
    if (!setCookieConsent(nextChoice)) {
      setStorageError(
        "Uw cookievoorkeur kon niet worden opgeslagen. Sta functionele cookies toe in uw browser en probeer opnieuw.",
      );
      return;
    }

    setStorageError("");
    closeBanner(nextChoice);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6">
      <section
        aria-describedby={`${descriptionId}${storageError ? ` ${errorId}` : ""}`}
        aria-labelledby={titleId}
        aria-modal="false"
        className="relative mx-auto max-w-4xl rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-overweel-lg sm:p-6"
        role="dialog"
      >
        {choice !== null && (
          <button
            aria-label="Cookie-instellingen sluiten"
            className="absolute right-3 top-3 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => closeBanner(choice)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <div
              aria-hidden="true"
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent sm:flex"
            >
              <Cookie className="h-5 w-5" />
            </div>
            <div>
              <h2 ref={titleRef} id={titleId} className="text-lg font-semibold outline-none" tabIndex={-1}>
                Uw cookievoorkeur
              </h2>
              <p id={descriptionId} className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                We gebruiken noodzakelijke cookies om de website goed te laten werken. Met uw toestemming mogen we
                ook marketingcookies gebruiken, waaronder de Meta Pixel voor paginabezoeken en advertentiemeting. U kunt uw keuze later via de
                cookie-instellingen in de footer aanpassen.
              </p>
              {choice !== null && (
                <p className="mt-2 text-xs font-semibold text-primary">
                  Huidige keuze: {choice === "accepted" ? "alles toegestaan" : "alleen noodzakelijke cookies"}
                </p>
              )}
              {storageError && (
                <p className="mt-2 text-sm font-medium text-destructive" id={errorId} role="alert">
                  {storageError}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => saveChoice("declined")}>
              Alleen noodzakelijk
            </Button>
            <Button type="button" onClick={() => saveChoice("accepted")}>
              Alles toestaan
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
