import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Upload, Scroll } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-24 bg-hero-gradient relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-overweel-light/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
            Klaar om je idee werkelijkheid te maken?
          </h2>
          <p className="text-lg text-white/70 mb-10">
            Van een simpel gadget tot een complex prototype – 
            wij maken het voor je. Upload nu je model en ontvang direct een prijsindicatie.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link to="/bestellen">
              <Button variant="hero" size="xl">
                <Upload className="w-5 h-5" />
                Start je bestelling
              </Button>
            </Link>
          </div>

          {/* Fun teaser */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 text-white/50 text-sm"
          >
            <Scroll className="w-4 h-4" />
            <span>
              Onze voorwaarden zijn episch – lees de{" "}
              <Link to="/voorwaarden" className="text-accent underline hover:text-accent/80">
                Heilige Scroll der Plastische Precisie
              </Link>
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
