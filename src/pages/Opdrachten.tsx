import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

import roosOpen from "@/assets/opdrachten/roos-open.jpeg";
import roosKnop from "@/assets/opdrachten/roos-knop.jpeg";
import bakjeMooist from "@/assets/opdrachten/bakje-studio-mooist.jpeg";
import bakjeZijkant from "@/assets/opdrachten/bakje-zijkant.jpeg";
import bakjeBoven from "@/assets/opdrachten/bakje-boven.jpeg";

interface Product {
  id: string;
  images: string[];
  coverIndex: number;
}

const products: Product[] = [
  {
    id: "roos",
    images: [roosKnop, roosOpen],
    coverIndex: 0,
  },
  {
    id: "bakje",
    images: [bakjeMooist, bakjeZijkant, bakjeBoven],
    coverIndex: 0,
  },
];

export default function Opdrachten() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImage, setCurrentImage] = useState(0);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentImage(0);
  };

  const nextImage = () => {
    if (!selectedProduct) return;
    setCurrentImage((prev) => (prev + 1) % selectedProduct.images.length);
  };

  const prevImage = () => {
    if (!selectedProduct) return;
    setCurrentImage((prev) => (prev - 1 + selectedProduct.images.length) % selectedProduct.images.length);
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
                  <img
                    src={product.images[product.coverIndex]}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
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

            {selectedProduct.images.length > 1 && (
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

            <motion.img
              key={currentImage}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              src={selectedProduct.images[currentImage]}
              alt=""
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {selectedProduct.images.length > 1 && (
              <div className="absolute bottom-6 flex gap-2">
                {selectedProduct.images.map((_, idx) => (
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
