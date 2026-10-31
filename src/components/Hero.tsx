import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Upload, ArrowRight, Check } from "lucide-react";

const badges = [
  "Persoonlijke service",
  "Professionele kwaliteit",
  "Maatwerk",
  "Heldere communicatie",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-black pb-16 pt-28 text-white sm:pb-20 sm:pt-32 md:pb-28 md:pt-40">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="container relative z-10 mx-auto px-5 sm:px-6">
        <div className="grid items-end gap-14 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="max-w-4xl">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8 inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/55"
          >
            <span className="h-px w-10 bg-white/40" />
            Precisie in iedere laag
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mb-7 font-display text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] sm:mb-8 sm:text-6xl sm:tracking-[-0.055em] lg:text-[88px]"
          >
            Uw ontwerp.<br /><span className="text-white/45">Perfect uitgevoerd.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mb-10 max-w-2xl text-base font-medium leading-8 text-white/60 lg:text-lg"
          >
            Laat uw ontwerp professioneel produceren met moderne 3D-printtechnologie.
            Van prototypes en reserveonderdelen tot uniek maatwerk voor particulieren en bedrijven.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4 [&_a]:w-full sm:[&_a]:w-auto [&_button]:w-full sm:[&_button]:w-auto"
          >
            <Link to="/bestellen">
              <Button size="xl" variant="hero">
                <Upload className="w-5 h-5" />
                Upload ontwerp
              </Button>
            </Link>
            <Link to="/opdrachten">
              <Button size="xl" variant="outline" className="border-white/25 bg-transparent text-white hover:border-white hover:bg-white hover:text-black">
                Bekijk projecten
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/15 pt-8 text-sm font-medium text-white/55"
          >
            {badges.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-white" />
                <span>{b}</span>
              </div>
            ))}
          </motion.div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden border-l border-white/15 pl-8 lg:block"
          >
            <p className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-white/35">Atelier standaard</p>
            {[['01', 'Bestand gecontroleerd'], ['02', 'Materiaal afgestemd'], ['03', 'Persoonlijk opgevolgd']].map(([number, label]) => (
              <div key={number} className="flex items-center gap-5 border-t border-white/15 py-5">
                <span className="font-mono text-xs text-white/35">{number}</span>
                <span className="text-sm font-semibold">{label}</span>
              </div>
            ))}
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
