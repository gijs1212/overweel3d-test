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
    <section id="materialen" className="bg-background py-24 text-foreground">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mb-16"
        >
          <span className="mb-5 inline-block text-xs font-bold uppercase tracking-[0.2em] text-black/45">
            Materialen
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            De juiste keuze voor elke toepassing.
          </h2>
          <p className="text-muted-foreground">
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
              className="rounded-2xl border border-black/10 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-black/30 hover:shadow-overweel-md"
            >
              <div className="flex justify-between items-start mb-6">
                <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-bold text-black/55">
                  {material.tag}
                </span>
                <div className="font-display text-3xl font-bold text-black">
                  {material.name}
                </div>
              </div>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                {material.description}
              </p>
              <ul className="space-y-3 text-sm">
                {material.pros.map((pro) => (
                  <li key={pro} className="flex items-center gap-2 text-black/75">
                    <Check className="w-4 h-4 flex-shrink-0 text-black" />
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
          className="mx-auto mt-12 max-w-2xl text-center text-muted-foreground"
        >
          Iedere opdracht is uniek. Daarom ontvangt u altijd vrijblijvend een offerte
          op basis van onder andere materiaal, printtijd, afwerking en eventuele nabewerking.
        </motion.p>
      </div>
    </section>
  );
}
