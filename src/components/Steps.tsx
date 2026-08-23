import { motion } from "framer-motion";
import { Upload, Search, FileText, Cog, Truck } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload ontwerp", description: "Deel uw 3D-bestand of beschrijving via het bestelportaal." },
  { icon: Search, title: "Controle", description: "Wij beoordelen printbaarheid, maat en materiaalkeuze." },
  { icon: FileText, title: "Vrijblijvende offerte", description: "U ontvangt een helder voorstel, zonder verrassingen." },
  { icon: Cog, title: "Productie", description: "Professionele fabricage met modern machinepark." },
  { icon: Truck, title: "Levering of afhalen", description: "Zorgvuldig verpakt voor verzending — of persoonlijk opgehaald." },
];

export function Steps() {
  return (
    <section className="border-y border-black/10 bg-white py-24 text-foreground">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 max-w-2xl mx-auto"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Hoe het werkt</h2>
          <div className="mx-auto h-px w-16 bg-black" />
          <p className="mt-6 text-muted-foreground">Vijf heldere stappen van idee naar fysiek product.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="relative rounded-2xl border border-black/10 bg-background p-6 transition-all hover:-translate-y-1 hover:border-black/30 hover:shadow-overweel-md"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-sm font-bold text-white">
                  {index + 1}
                </div>
                <step.icon className="w-5 h-5 text-black/45" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
