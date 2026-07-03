import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Upload, MessageSquare } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-24 bg-navy-deep">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-5xl mx-auto bg-gradient-to-br from-navy-mid to-navy-deep rounded-[2.5rem] p-12 md:p-16 text-center border border-navy-accent/40 relative overflow-hidden"
        >
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-navy-accent opacity-20 blur-[100px] rounded-full" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald opacity-10 blur-[100px] rounded-full" />
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6 relative">
            Klaar om te printen?
          </h2>
          <p className="text-navy-ice/80 mb-10 text-lg max-w-xl mx-auto relative">
            Heeft u een specifiek bestand of een vraag over de mogelijkheden?
            Wij staan voor u klaar en denken graag met u mee.
          </p>
          <div className="flex flex-wrap justify-center gap-4 relative">
            <Link to="/bestellen">
              <Button size="xl" className="bg-emerald hover:bg-emerald/90 text-white font-bold rounded-2xl shadow-xl shadow-emerald/20">
                <Upload className="w-5 h-5" />
                Start uw aanvraag
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="xl" variant="outline" className="bg-white/5 hover:bg-white/10 text-white border-white/10 rounded-2xl backdrop-blur-md">
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
