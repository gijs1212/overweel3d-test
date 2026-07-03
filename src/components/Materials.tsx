import { motion } from "framer-motion";
import { Check } from "lucide-react";

const materials = [
  {
    name: "PLA",
    tag: "Ecologisch",
    description:
      "Biologisch afbreekbaar en ideaal voor gedetailleerde prototypes, decoratieve modellen en visuele weergaves.",
    pros: ["Breed kleurenpalet", "Zeer maatvast", "Prettig te printen"],
  },
  {
    name: "PETG",
    tag: "Sterk",
    description:
      "De balans tussen kracht en flexibiliteit. Chemisch resistent, slagvast en geschikt voor functionele onderdelen — ook buiten.",
    pros: ["Slagvast", "Waterbestendig", "UV-bestendig"],
  },
  {
    name: "TPU",
    tag: "Flexibel",
    description:
      "Rubberachtig materiaal voor schokabsorptie, pakkingen en onderdelen die moeten meebewegen.",
    pros: ["Hoge elasticiteit", "Slijtvast", "Schokabsorberend"],
  },
];

export function Materials() {
  return (
    <section id="materialen" className="py-24 bg-navy-deep text-white">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mb-16"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-navy-mid text-navy-accent text-xs font-bold uppercase tracking-widest mb-4">
            Materialen
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            De juiste keuze voor elke toepassing.
          </h2>
          <p className="text-navy-ice/80">
            Wij werken met PLA, PETG en TPU. Twijfelt u welke het beste past?
            Wij adviseren u graag op basis van uw toepassing.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {materials.map((material, index) => (
            <motion.div
              key={material.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="p-8 bg-navy-mid rounded-3xl border border-navy-accent/20 hover:border-navy-accent/50 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-6">
                <span className="px-3 py-1 bg-navy-accent/25 text-navy-ice text-xs font-bold rounded-full">
                  {material.tag}
                </span>
                <div className="font-display font-bold text-3xl text-emerald">
                  {material.name}
                </div>
              </div>
              <p className="text-sm text-navy-ice/75 mb-6 leading-relaxed">
                {material.description}
              </p>
              <ul className="space-y-3 text-sm">
                {material.pros.map((pro) => (
                  <li key={pro} className="flex items-center gap-2 text-navy-ice/90">
                    <Check className="w-4 h-4 text-emerald flex-shrink-0" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-12 text-center text-navy-ice/70 max-w-2xl mx-auto"
        >
          Iedere opdracht is uniek. Daarom ontvangt u altijd vrijblijvend een offerte
          op basis van onder andere materiaal, printtijd, afwerking en eventuele nabewerking.
        </motion.p>
      </div>
    </section>
  );
}
