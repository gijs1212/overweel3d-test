import { motion } from "framer-motion";
import { Check, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const materials = [
  {
    name: "PLA",
    description: "Biologisch afbreekbaar, makkelijk te printen",
    pros: ["Milieuvriendelijk", "Geen warping", "Mooie afwerking"],
    price: "vanaf €0,03/gram",
    popular: true,
    colors: ["#FFFFFF", "#000000", "#0066FF", "#00CC00", "#228B22", "#FF0000", "#FFDD00", "#808080"],
    colorNames: ["Wit", "Zwart", "Blauw", "Groen", "Bladgroen", "Rood", "Geel", "Grijs"],
  },
  {
    name: "PETG",
    description: "Sterk en hittebestendig, ideaal voor functionele onderdelen",
    pros: ["Waterbestendig", "Hittebestendig", "Flexibel"],
    price: "vanaf €0,04/gram",
    popular: false,
    colors: ["#FFFFFF", "#000000", "#FF0000"],
    colorNames: ["Wit", "Zwart", "Rood"],
  },
  {
    name: "TPU",
    description: "Flexibel rubber-achtig materiaal",
    pros: ["Flexibel", "Schokabsorberend", "Duurzaam"],
    price: "vanaf €0,04/gram",
    popular: false,
    colors: ["#000000"],
    colorNames: ["Zwart"],
  },
];

export function Materials() {
  return (
    <section className="py-24 bg-secondary/50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            Kies je materiaal
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Van standaard PLA tot flexibele TPU – wij hebben het materiaal dat 
            bij jouw project past.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {materials.map((material, index) => (
            <motion.div
              key={material.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative bg-card rounded-2xl p-6 shadow-overweel-card hover:shadow-overweel-lg transition-all duration-300 group"
            >
              {/* Popular badge */}
              {material.popular && (
                <div className="absolute -top-3 left-4 px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full">
                  Populair
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-primary">{material.name}</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{material.description}</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                {material.description}
              </p>

              {/* Pros */}
              <ul className="space-y-2 mb-6">
                {material.pros.map((pro) => (
                  <li key={pro} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>

              {/* Colors */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Beschikbare kleuren:</p>
                <div className="flex flex-wrap gap-2">
                  {material.colors.map((color, idx) => (
                    <Tooltip key={color}>
                      <TooltipTrigger>
                        <div
                          className="w-6 h-6 rounded-full border-2 border-border shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{material.colorNames[idx]}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div className="pt-4 border-t border-border">
                <p className="text-lg font-bold text-accent">{material.price}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
