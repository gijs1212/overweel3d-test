import { Link } from "react-router-dom";
import { Mail, MapPin, Clock } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="mb-4">
              <Logo size="lg" forceDark />
              <span className="text-sm text-primary-foreground/70 tracking-wide mt-2 block">
                Print. Creëer. Innoveer.
              </span>
            </div>
            <p className="text-primary-foreground/70 max-w-md mt-4">
              Breng je ideeën tot leven met onze professionele 3D-printservice. 
              Van prototype tot eindproduct, wij printen het voor je.
            </p>
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
                  Voorwaarden
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-primary-foreground/70 hover:text-accent transition-colors">
                  FAQ
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
                <span>overweel3d@hotmail.com</span>
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
        <div className="border-t border-primary-foreground/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-primary-foreground/50 text-sm">
            © 2024 Overweel3D. Alle rechten voorbehouden.
          </p>
          <p className="text-primary-foreground/50 text-sm">
            PS: Het geheime codewoord is <span className="text-accent font-mono">PLAFTASTIC</span> 🤫
          </p>
        </div>
      </div>
    </footer>
  );
}
