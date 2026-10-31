import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getCookieConsent } from "@/lib/cookieConsent";
import { revokeMetaPixelConsent, subscribeToMetaPixelConsent, trackMetaPageView } from "@/lib/metaPixel";

export function MetaPixel() {
  const location = useLocation();

  useEffect(() => {
    if (getCookieConsent() === "accepted") trackMetaPageView();
  }, [location.pathname, location.search]);

  useEffect(() => subscribeToMetaPixelConsent((choice) => {
    if (choice === "accepted") trackMetaPageView();
    else revokeMetaPixelConsent();
  }), []);

  return null;
}

