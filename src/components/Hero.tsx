import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Upload, ArrowRight, Sparkles, Check } from "lucide-react";

const badges = [
  "Persoonlijke service",
  "Professionele kwaliteit",
  "Maatwerk",
  "Heldere communicatie",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-navy-deep text-white pt-32 pb-24">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_50%_0%,hsl(var(--navy-mid))_0%,transparent_70%)] opacity-70 pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-navy-mid text-navy-accent text-xs font-bold uppercase tracking-widest mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Overweel3D Premium Service
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="font-display text-5xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-8"
          >
            Van idee naar <span className="text-navy-accent">hoogwaardige</span> 3D-print.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="text-navy-ice/90 text-lg lg:text-xl font-medium leading-relaxed mb-10 max-w-2xl"
          >
            Laat uw ontwerp professioneel produceren met moderne 3D-printtechnologie.
            Van prototypes en reserveonderdelen tot uniek maatwerk voor particulieren en bedrijven.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="flex flex-wrap gap-4"
          >
            <Link to="/bestellen">
              <Button size="xl" className="bg-navy-accent hover:bg-navy-accent/90 text-white font-semibold rounded-xl shadow-lg shadow-navy-accent/30">
                <Upload className="w-5 h-5" />
                Upload ontwerp
              </Button>
            </Link>
            <Link to="/opdrachten">
              <Button size="xl" variant="outline" className="border-2 border-navy-mid text-white hover:bg-navy-mid hover:text-white rounded-xl">
                Bekijk projecten
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-10 mt-10 border-t border-navy-mid text-navy-ice/70 text-sm font-medium"
          >
            {badges.map((b) => (
              <div key={b} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald" />
                <span>{b}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
