import { Link } from "react-router-dom";
import { Mail, MapPin, Clock } from "lucide-react";
import { Logo } from "./Logo";
import { openCookieSettings } from "@/lib/cookieConsent";
import { NewsletterSignupForm } from "./NewsletterSignupForm";

export function Footer() {
  return (
    <footer className="bg-navy-deep text-white border-t border-navy-mid">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <Logo size="xl" />
              <span className="text-sm text-primary-foreground/70 tracking-wide mt-2 block">
                Print. Creëer. Innoveer.
              </span>
            </div>
            <p className="text-primary-foreground/70 max-w-md mt-4">
              Breng uw ideeën tot leven met onze professionele 3D-printservice.
              Van prototype tot eindproduct, wij printen het voor u.
            </p>
            <div className="mt-7 max-w-xl">
              <h4 className="mb-1 text-lg font-semibold">Overweel3D-nieuws in uw inbox</h4>
              <p className="mb-3 text-sm leading-6 text-primary-foreground/70">
                Ontvang updates over nieuwe materialen, producten, kleuren en kortingsacties.
              </p>
              <NewsletterSignupForm
                inputClassName="border-white/20 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-emerald"
                source="footer"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Navigatie</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/bestellen" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Bestellen
                </Link>
              </li>
              <li>
                <Link to="/voorwaarden" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Algemene voorwaarden
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/blog" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <Mail className="w-4 h-4 text-accent" />
                <span>gijsoverweel@gmail.com</span>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <MapPin className="w-4 h-4 text-accent" />
                <span>Nederland</span>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <Clock className="w-4 h-4 text-accent" />
                <span>Ma-Vr: 9:00 - 17:00</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-navy-mid mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-navy-ice/60 text-sm">
            © 2026 Overweel3D. Alle rechten voorbehouden.
          </p>
          <div className="flex flex-col items-center gap-2 text-sm sm:flex-row sm:gap-4">
            <button
              type="button"
              onClick={openCookieSettings}
              className="text-navy-ice/60 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-navy-deep"
            >
              Cookie-instellingen
            </button>
            <p className="text-navy-ice/60">
              Vragen? <a href="mailto:gijsoverweel@gmail.com" className="text-emerald hover:underline">gijsoverweel@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
