import { motion } from "framer-motion";
import { Clock, ShieldCheck, Cpu, Layers } from "lucide-react";

export function WhyBento() {
  return (
    <section className="overflow-hidden bg-background py-16 text-foreground sm:py-24">
      <div className="container mx-auto max-w-7xl px-5 sm:px-6">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 max-w-2xl"
        >
          <span className="mb-5 inline-block text-xs font-bold uppercase tracking-[0.2em] text-black/45">
            Waarom Overweel3D
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Precisie, service en persoonlijke aandacht.
          </h2>
          <p className="text-black/55">
            Wij combineren technische expertise met heldere communicatie voor elk detail van uw printopdracht.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">
          <div className="flex flex-col justify-between rounded-2xl border border-black/10 bg-white p-6 shadow-overweel-card sm:p-8 md:col-span-2 lg:col-span-3">
            <div>
              <h3 className="font-display text-2xl font-bold mb-3">Persoonlijke begeleiding</h3>
              <p className="mb-8 leading-relaxed text-black/55">
                U krijgt direct contact met de printer zelf. Wij denken met u mee — van bestand tot afwerking.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-black p-2 text-white"><Clock className="w-5 h-5" /></div>
                <span className="text-sm font-semibold">Snelle reactie</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-black p-2 text-white"><ShieldCheck className="w-5 h-5" /></div>
                <span className="text-sm font-semibold">Kwaliteitscontrole</span>
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl bg-black p-6 text-white sm:p-8 md:col-span-2 lg:col-span-3">
            <div className="relative z-10">
              <div className="mb-6 w-fit rounded-xl border border-white/15 p-3">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-2">Prototypes & productie</h3>
              <p className="text-white/55">Van functionele testmodellen tot kleine series. Wij schalen mee met uw behoefte.</p>
            </div>
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-navy-accent/10 rounded-full blur-3xl group-hover:bg-navy-accent/20 transition-colors" />
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-black/10 bg-neutral-100 p-8 md:col-span-2 lg:col-span-2">
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-black/45">Beschikbare materialen</h4>
            <div className="space-y-4">
              {[["PLA", "Ecologisch"], ["PETG", "Sterk"], ["TPU", "Flexibel"]].map(([m, t]) => (
                <div key={m} className="flex items-center justify-between">
                  <span className="font-semibold">{m}</span>
                  <span className="rounded bg-white px-2 py-1 text-[10px] text-black/50">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 rounded-2xl border border-black/10 bg-white p-8 md:col-span-2 lg:col-span-4">
            <div className="hidden aspect-video w-1/3 items-center justify-center rounded-xl bg-black sm:flex">
              <Layers className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-display text-2xl font-bold mb-3">Uniek maatwerk</h3>
              <p className="text-black/55">
                Heeft u een specifiek idee of een onderdeel dat niet meer verkrijgbaar is? Wij printen het precies op maat.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
