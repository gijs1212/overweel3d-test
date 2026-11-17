import { Link } from "react-router-dom";
import { Mail, MapPin, Clock, Facebook, Instagram } from "lucide-react";
import { Logo } from "./Logo";
import { openCookieSettings } from "@/lib/cookieConsent";
import { FACEBOOK_URL, INSTAGRAM_URL } from "./SocialFollowPopup";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black text-white">
      <div className="container mx-auto px-5 py-14 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <Logo size="xl" surface="dark" />
              <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                Digitaal ontworpen. Tastbaar gemaakt.
              </span>
            </div>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/60">
              Breng uw ideeën tot leven met onze professionele 3D-printservice.
              Van prototype tot eindproduct, wij printen het voor u.
            </p>
            <div className="mt-7 max-w-xl">
              <h4 className="mb-1 text-base font-semibold">Volg Overweel3D</h4>
              <p className="mb-4 text-sm leading-6 text-white/55">Nieuwe prints, kleuren en producten delen we via onze sociale kanalen.</p>
              <div className="flex flex-wrap gap-3">
                <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/75 transition hover:border-white hover:text-white"><Facebook className="h-4 w-4" /> Facebook</a>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/75 transition hover:border-white hover:text-white"><Instagram className="h-4 w-4" /> Instagram</a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Navigatie</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-white/65 transition-colors hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/bestellen" className="text-white/65 transition-colors hover:text-white">
                  Bestellen
                </Link>
              </li>
              <li>
                <Link to="/voorwaarden" className="text-white/65 transition-colors hover:text-white">
                  Algemene voorwaarden
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-white/65 transition-colors hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/blog" className="text-white/65 transition-colors hover:text-white">
                  Blog
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-white/65 transition-colors hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Contact</h4>
            <ul className="space-y-3">
              <li className="flex min-w-0 items-center gap-3 text-white/65">
                <Mail className="h-4 w-4 shrink-0 text-white/40" />
                <a className="min-w-0 break-all transition-colors hover:text-white" href="mailto:gijsoverweel@gmail.com">gijsoverweel@gmail.com</a>
              </li>
              <li className="flex items-center gap-3 text-white/65">
                <MapPin className="w-4 h-4 text-white/40" />
                <span>Nederland</span>
              </li>
              <li className="flex items-center gap-3 text-white/65">
                <Clock className="w-4 h-4 text-white/40" />
                <span>Ma-Vr: 9:00 - 17:00</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 lg:flex-row">
          <p className="text-sm text-white/40">
            © 2026 Overweel3D. Alle rechten voorbehouden.
          </p>
          <div className="flex flex-col items-center gap-2 text-sm sm:flex-row sm:gap-4">
            <button
              type="button"
              onClick={openCookieSettings}
              className="text-white/40 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Cookie-instellingen
            </button>
            <p className="text-white/40">
              Vragen? <a href="mailto:gijsoverweel@gmail.com" className="text-white hover:underline">gijsoverweel@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
