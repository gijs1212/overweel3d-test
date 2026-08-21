import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { getProductPhotoUrl } from "@/lib/productPhotos";
import { Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface FilamentColor {
  id: string;
  name: string;
  material: string;
  hex: string;
  photos: string[];
  description: string;
  sort_order: number;
  active: boolean;
}

export default function Kleuren() {
  const [colors, setColors] = useState<FilamentColor[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("filament_colors")
        .select("*")
        .order("material", { ascending: true })
        .order("sort_order", { ascending: true });
      const list = (data as FilamentColor[]) || [];
      setColors(list);

      const urlMap: Record<string, string> = {};
      await Promise.all(
        list.flatMap((c) =>
          c.photos.map(async (p) => {
            if (!p) return;
            urlMap[p] = await getProductPhotoUrl(p);
          })
        )
      );
      setPhotoUrls(urlMap);
      setLoading(false);
    })();
  }, []);

  const byMaterial = colors.reduce<Record<string, FilamentColor[]>>((acc, c) => {
    (acc[c.material] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16">
        <section className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-accent/10 text-accent mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Filament palet
            </span>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-primary mb-4">
              Beschikbare kleuren
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Hieronder ziet u alle kleuren die wij standaard op voorraad hebben, per materiaal.
              Iedere kleur wordt getoond met daadwerkelijke printfoto's en het weergavekleur zoals
              deze op onze website verschijnt.
            </p>
          </motion.div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 mb-10 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div>
              <p className="font-semibold text-primary">Speciale kleur nodig?</p>
              <p className="text-sm text-muted-foreground">
                Voor speciale aanvragen kunnen wij vaak nieuwe kleuren bestellen. Neem gerust contact
                op — wij kijken graag met u mee.
              </p>
            </div>
            <Link to="/contact">
              <Button variant="outline">Contact opnemen</Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : colors.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">
              Er zijn nog geen kleuren toegevoegd.
            </p>
          ) : (
            <div className="space-y-12">
              {Object.entries(byMaterial).map(([material, list]) => (
                <div key={material}>
                  <h2 className="text-2xl font-display font-bold text-primary mb-5">{material}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {list.map((c) => {
                      const first = c.photos[0] ? photoUrls[c.photos[0]] : "";
                      return (
                        <motion.div
                          key={c.id}
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4 }}
                          className={`rounded-3xl border border-border/60 bg-card overflow-hidden group ${!c.active ? "opacity-70" : ""}`}
                        >
                          <div className="aspect-square bg-muted relative overflow-hidden">
                            {first ? (
                              <img
                                src={first}
                                alt={c.name}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div
                                className="w-full h-full"
                                style={{ backgroundColor: c.hex }}
                              />
                            )}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className="w-6 h-6 rounded-full border border-border shrink-0"
                                style={{ backgroundColor: c.hex }}
                                title={`Weergavekleur ${c.hex}`}
                              />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-primary leading-tight">{c.name}</span>
                                  {!c.active && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                      Tijdelijk onbeschikbaar
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">{c.material} · {c.hex.toUpperCase()}</div>
                              </div>
                            </div>
                            {c.description && (
                              <p className="text-sm text-muted-foreground">{c.description}</p>
                            )}
                            {c.photos.length > 1 && (
                              <div className="mt-3 flex gap-2">
                                {c.photos.slice(1, 5).map((p) => (
                                  <div key={p} className="w-12 h-12 rounded-lg overflow-hidden border border-border/60 bg-muted">
                                    {photoUrls[p] && (
                                      <img src={photoUrls[p]} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
