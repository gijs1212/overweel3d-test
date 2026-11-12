import { useEffect, useState } from "react";
import { getProductPhotoUrl } from "@/lib/productPhotos";
import { catalogProductPriceLabel, CatalogProduct, isVideoProductMedia, orderedProductImages } from "@/lib/productCatalog";

interface ProductTileProps {
  product: CatalogProduct;
  onClick: () => void;
}

export function ProductTile({ product, onClick }: ProductTileProps) {
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const primaryMedia = orderedProductImages(product)[0];
  const primaryPath = primaryMedia?.storage_path || "";

  useEffect(() => {
    let active = true;
    if (primaryPath) {
      getProductPhotoUrl(primaryPath).then((url) => {
        if (active) setPhotoUrl(url);
      });
    } else {
      setPhotoUrl("");
    }
    return () => { active = false; };
  }, [primaryPath]);

  return (
    <div className="group flex flex-col items-center text-center">
      <button
        onClick={onClick}
        className="relative w-full aspect-square overflow-hidden rounded-lg bg-white border border-border hover:shadow-overweel-card transition-all duration-200"
        aria-label={`Bekijk ${product.name}`}
      >
        {photoUrl ? (
          isVideoProductMedia(primaryPath, primaryMedia?.media_type) ? <video
            src={photoUrl}
            aria-label={product.name}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          /> : <img src={photoUrl} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Geen media
          </div>
        )}
        <span className="absolute left-1/2 -translate-x-1/2 bottom-3 px-4 py-1.5 bg-white/95 backdrop-blur text-[11px] font-semibold tracking-widest text-primary rounded shadow-sm opacity-90 group-hover:opacity-100 group-hover:bg-white transition">
          BEKIJK
        </span>
      </button>
      <h3 className="mt-3 text-sm font-medium text-primary line-clamp-1">{product.name}</h3>
      {product.product_categories?.name && (
        <span className="text-[11px] text-muted-foreground mt-0.5">{product.product_categories.name}</span>
      )}
      <span className="text-sm text-muted-foreground mt-0.5">{catalogProductPriceLabel(product)}</span>
    </div>
  );
}
