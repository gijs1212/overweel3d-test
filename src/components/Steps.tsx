import { motion } from "framer-motion";
import { Upload, Search, FileText, Cog, Truck } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload ontwerp", description: "Deel uw 3D-bestand of beschrijving via het bestelportaal." },
  { icon: Search, title: "Controle", description: "Wij beoordelen printbaarheid, maat en materiaalkeuze." },
  { icon: FileText, title: "Vrijblijvende offerte", description: "U ontvangt een helder voorstel, zonder verrassingen." },
  { icon: Cog, title: "Productie", description: "Professionele fabricage met modern machinepark." },
  { icon: Truck, title: "Levering of afhalen", description: "Zorgvuldig verpakt en snel bij u — of persoonlijk opgehaald." },
];

export function Steps() {
  return (
    <section className="py-24 bg-navy-mid/20 text-white">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 max-w-2xl mx-auto"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">Hoe het werkt</h2>
          <div className="w-16 h-1 bg-emerald mx-auto rounded-full" />
          <p className="text-navy-ice/70 mt-6">Vijf stappen van idee naar fysiek product.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="relative bg-navy-mid/60 border border-navy-accent/20 rounded-3xl p-6 hover:-translate-y-1 hover:border-navy-accent/50 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm border-4 border-navy-deep ${index === steps.length - 1 ? "bg-emerald text-white" : "bg-navy-accent text-white"}`}>
                  {index + 1}
                </div>
                <step.icon className="w-5 h-5 text-navy-accent" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-navy-ice/70 leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
