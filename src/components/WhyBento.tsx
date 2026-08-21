import { motion } from "framer-motion";
import { Clock, ShieldCheck, Cpu, Layers } from "lucide-react";

export function WhyBento() {
  return (
    <section className="py-24 bg-navy-deep text-white">
      <div className="container mx-auto px-6 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 max-w-2xl"
        >
          <span className="inline-block px-3 py-1 rounded-full bg-navy-mid text-navy-accent text-xs font-bold uppercase tracking-widest mb-4">
            Waarom Overweel3D
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Precisie, service en persoonlijke aandacht.
          </h2>
          <p className="text-navy-ice/70">
            Wij combineren technische expertise met heldere communicatie voor elk detail van uw printopdracht.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">
          <div className="md:col-span-2 lg:col-span-3 bg-navy-mid p-8 rounded-3xl border border-navy-accent/20 flex flex-col justify-between">
            <div>
              <h3 className="font-display text-2xl font-bold mb-3">Persoonlijke begeleiding</h3>
              <p className="text-navy-ice/80 leading-relaxed mb-8">
                U krijgt direct contact met de printer zelf. Wij denken met u mee — van bestand tot afwerking.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-navy-deep rounded-lg text-navy-accent"><Clock className="w-5 h-5" /></div>
                <span className="text-sm font-semibold">Snelle reactie</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-navy-deep rounded-lg text-emerald"><ShieldCheck className="w-5 h-5" /></div>
                <span className="text-sm font-semibold">Kwaliteitscontrole</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-3 bg-navy-mid p-8 rounded-3xl border border-navy-accent/20 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="p-3 bg-navy-accent w-fit rounded-2xl mb-6 shadow-lg shadow-navy-accent/30">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-2">Prototypes & productie</h3>
              <p className="text-navy-ice/70">Van functionele testmodellen tot kleine series. Wij schalen mee met uw behoefte.</p>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-navy-accent/10 rounded-full blur-3xl group-hover:bg-navy-accent/20 transition-colors" />
          </div>

          <div className="md:col-span-2 lg:col-span-2 bg-navy-deep p-8 rounded-3xl border border-navy-mid flex flex-col justify-center">
            <h4 className="text-navy-accent font-bold text-xs uppercase tracking-widest mb-4">Beschikbare materialen</h4>
            <div className="space-y-4">
              {[["PLA", "Ecologisch"], ["PETG", "Sterk"], ["TPU", "Flexibel"]].map(([m, t]) => (
                <div key={m} className="flex items-center justify-between">
                  <span className="font-semibold">{m}</span>
                  <span className="text-[10px] px-2 py-1 rounded bg-navy-mid text-navy-ice">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4 bg-navy-mid p-8 rounded-3xl border border-navy-accent/20 flex items-center gap-8">
            <div className="hidden sm:flex w-1/3 aspect-video bg-navy-deep rounded-2xl border border-navy-accent/20 items-center justify-center">
              <Layers className="w-10 h-10 text-navy-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-2xl font-bold mb-3">Uniek maatwerk</h3>
              <p className="text-navy-ice/70">
                Heeft u een specifiek idee of een onderdeel dat niet meer verkrijgbaar is? Wij printen het precies op maat.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}