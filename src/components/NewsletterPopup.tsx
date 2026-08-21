import { useEffect, useState } from "react";
import { Gift, MailCheck, Palette, Sparkles, Tag } from "lucide-react";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COOKIE_CONSENT_CHANGE_EVENT, getCookieConsent } from "@/lib/cookieConsent";
import {
  hasSeenNewsletterPrompt,
  rememberNewsletterPrompt,
} from "@/lib/newsletter";

const newsletterBenefits = [
  { icon: Sparkles, label: "Nieuwe materialen" },
  { icon: Gift, label: "Nieuwe producten" },
  { icon: Palette, label: "Nieuwe kleuren" },
  { icon: Tag, label: "Kortingscodes en acties" },
];

export default function NewsletterPopup() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const showOnceConsentIsKnown = () => {
      if (getCookieConsent() === null || hasSeenNewsletterPrompt()) return;

      // Remember at the moment it is shown. Closing with Escape, the close icon
      // or the explicit decline button therefore all remain one-time actions.
      rememberNewsletterPrompt("shown");
      setIsOpen(true);
    };

    showOnceConsentIsKnown();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, showOnceConsentIsKnown);

    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, showOnceConsentIsKnown);
  }, []);

  const dismiss = () => {
    rememberNewsletterPrompt("dismissed");
    setIsOpen(false);
  };

  const subscribed = () => {
    rememberNewsletterPrompt("subscribed");
    setIsOpen(false);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      open={isOpen}
    >
      <DialogContent className="overflow-hidden border-primary/15 p-0 sm:max-w-xl">
        <div className="bg-gradient-to-br from-primary via-primary to-navy-mid px-6 py-7 text-primary-foreground">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
            <MailCheck aria-hidden="true" className="h-6 w-6 text-accent" />
          </div>
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl text-white">Blijf op de hoogte</DialogTitle>
            <DialogDescription className="leading-6 text-primary-foreground/80">
              Ontvang af en toe relevant nieuws van Overweel3D. Geen overvolle inbox, wel als eerste weten wat er nieuw is.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 pb-6">
          <ul className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {newsletterBenefits.map(({ icon: Icon, label }) => (
              <li className="flex items-center gap-2 text-foreground" key={label}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>

          <NewsletterSignupForm buttonLabel="Ja, houd mij op de hoogte" onSubscribed={subscribed} source="popup" />

          <DialogFooter className="sm:justify-center">
            <Button className="w-full sm:w-auto" onClick={dismiss} type="button" variant="ghost">
              Nee, bedankt
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
