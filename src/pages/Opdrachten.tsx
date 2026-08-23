import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import roosOpen from "@/assets/opdrachten/roos-open.jpeg";
import roosKnop from "@/assets/opdrachten/roos-knop.jpeg";
import bakjeMooist from "@/assets/opdrachten/bakje-studio-mooist.jpeg";
import bakjeZijkant from "@/assets/opdrachten/bakje-zijkant.jpeg";
import bakjeBoven from "@/assets/opdrachten/bakje-boven.jpeg";

interface Product {
  id: string;
  title: string;
  description: string;
  media: { url: string; mimeType: string }[];
  coverIndex: number;
}

const fallbackProducts: Product[] = [
  {
    id: "roos",
    title: "Roos",
    description: "",
    media: [roosKnop, roosOpen].map((url) => ({ url, mimeType: "image/jpeg" })),
    coverIndex: 0,
  },
  {
    id: "bakje",
    title: "Bakje",
    description: "",
    media: [bakjeMooist, bakjeZijkant, bakjeBoven].map((url) => ({ url, mimeType: "image/jpeg" })),
    coverIndex: 0,
  },
];

export default function Opdrachten() {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const loadProjects = async () => {
      const { data, error } = await supabase
        .from("portfolio_projects" as never)
        .select("id,title,description,portfolio_project_media(storage_path,mime_type,is_cover,sort_order)")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (error || !data?.length) return;
      const loaded = (data as unknown as Array<{ id: string; title: string; description: string; portfolio_project_media: Array<{ storage_path: string; mime_type: string; is_cover: boolean; sort_order: number }> }>).map((project) => {
        const sorted = [...project.portfolio_project_media].sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: project.id,
          title: project.title,
          description: project.description,
          media: sorted.map((item) => ({ url: supabase.storage.from("orders").getPublicUrl(item.storage_path).data.publicUrl, mimeType: item.mime_type })),
          coverIndex: Math.max(0, sorted.findIndex((item) => item.is_cover)),
        };
      }).filter((project) => project.media.length > 0);
      if (loaded.length) setProducts(loaded);
    };
    void loadProjects();
  }, []);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentImage(0);
  };

  const nextImage = () => {
    if (!selectedProduct) return;
    setCurrentImage((prev) => (prev + 1) % selectedProduct.media.length);
  };

  const prevImage = () => {
    if (!selectedProduct) return;
    setCurrentImage((prev) => (prev - 1 + selectedProduct.media.length) % selectedProduct.media.length);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Opdrachten</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Uitgeleverde producten aan klanten.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {products.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => openProduct(product)}
                className="cursor-pointer group overflow-hidden rounded-xl border border-border bg-card shadow-overweel-sm hover:shadow-overweel-md transition-all duration-300"
              >
                <div className="aspect-square overflow-hidden">
                  {product.media[product.coverIndex].mimeType.startsWith("video/") ? <video src={product.media[product.coverIndex].url} muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <img src={product.media[product.coverIndex].url} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                </div>
                <div className="p-4"><h2 className="font-semibold">{product.title}</h2>{product.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedProduct(null)}
          >
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-50"
            >
              <X className="w-8 h-8" />
            </button>

            {selectedProduct.media.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prevImage(); }}
                  className="absolute left-4 text-white/80 hover:text-white z-50"
                >
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); nextImage(); }}
                  className="absolute right-4 text-white/80 hover:text-white z-50"
                >
                  <ChevronRight className="w-10 h-10" />
                </button>
              </>
            )}

            {selectedProduct.media[currentImage].mimeType.startsWith("video/") ? <motion.video key={currentImage} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} src={selectedProduct.media[currentImage].url} controls autoPlay playsInline className="max-w-full max-h-[85vh] rounded-lg" onClick={(e) => e.stopPropagation()} /> : <motion.img key={currentImage} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} src={selectedProduct.media[currentImage].url} alt={selectedProduct.title} className="max-w-full max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />}

            {selectedProduct.media.length > 1 && (
              <div className="absolute bottom-6 flex gap-2">
                {selectedProduct.media.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => { e.stopPropagation(); setCurrentImage(idx); }}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      idx === currentImage ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
