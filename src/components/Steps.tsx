import { motion } from "framer-motion";
import { Upload, Palette, CreditCard, Package } from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "Upload uw bestand",
    description: "Plak een link naar uw 3D-bestanden (bijv. Thingiverse, Printables of WeTransfer). Wij downloaden en controleren alles voor u.",
    color: "bg-blue-500",
  },
  {
    icon: Palette,
    title: "Kies materiaal & kleur",
    description: "Van PLA tot PETG, en van klassiek zwart tot felgeel. U bepaalt hoe uw print eruitziet.",
    color: "bg-purple-500",
  },
  {
    icon: CreditCard,
    title: "Ontvang prijs & bestel",
    description: "Direct een eerlijke prijs op basis van volume en materiaal. Geen verrassingen.",
    color: "bg-green-500",
  },
  {
    icon: Package,
    title: "Wij printen & versturen",
    description: "Onze printers gaan aan de slag en u hebt zo snel mogelijk uw creatie in handen!",
    color: "bg-accent",
  },
];

export function Steps() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-overweel-ice to-transparent opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            Zo simpel werkt het
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            In vier stappen van idee naar fysiek product. Geen gedoe, gewoon printen.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative group"
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-border to-transparent" />
              )}

              <div className="bg-card rounded-2xl p-6 shadow-overweel-card hover:shadow-overweel-lg transition-all duration-300 hover:-translate-y-1">
                {/* Step number */}
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-accent text-accent-foreground text-sm font-bold flex items-center justify-center shadow-overweel-sm">
                  {index + 1}
                </div>

                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl ${step.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <step.icon className="w-7 h-7 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-primary mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
