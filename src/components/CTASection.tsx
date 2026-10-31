import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Upload, MessageSquare } from "lucide-react";

export function CTASection() {
  return (
    <section className="bg-background py-24">
      <div className="container mx-auto px-6">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-black p-12 text-center md:p-16"
        >
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:64px_64px]" />
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6 relative">
            Klaar om te printen?
          </h2>
          <p className="relative mx-auto mb-10 max-w-xl text-lg text-white/55">
            Heeft u een specifiek bestand of een vraag over de mogelijkheden?
            Wij staan voor u klaar en denken graag met u mee.
          </p>
          <div className="flex flex-wrap justify-center gap-4 relative">
            <Link to="/bestellen">
              <Button size="xl" variant="hero">
                <Upload className="w-5 h-5" />
                Start uw aanvraag
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="xl" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white hover:text-black">
                <MessageSquare className="w-5 h-5" />
                Contact opnemen
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
