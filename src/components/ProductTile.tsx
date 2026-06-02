import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getProductPhotoUrl } from "@/lib/productPhotos";

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  photos: string[];
}

interface ProductTileProps {
  product: Product;
  onClick: () => void;
}

export function ProductTile({ product, onClick }: ProductTileProps) {
  const [photoUrl, setPhotoUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    if (product.photos[0]) {
      getProductPhotoUrl(product.photos[0]).then((url) => {
        if (active) setPhotoUrl(url);
      });
    } else {
      setPhotoUrl("");
    }
    return () => { active = false; };
  }, [product.photos]);

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer overflow-hidden border-border hover:border-accent/50 hover:shadow-overweel-card transition-all duration-200"
    >
      <div className="aspect-square bg-muted overflow-hidden">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            Geen foto
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex justify-between items-start gap-2">
          <h3 className="font-semibold text-primary text-sm leading-tight line-clamp-2">{product.name}</h3>
          <span className="text-sm font-bold text-accent whitespace-nowrap">€{Number(product.price).toFixed(2)}</span>
        </div>
        {product.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
        )}
      </div>
    </Card>
  );
}