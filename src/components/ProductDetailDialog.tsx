import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { MATERIALS } from "@/lib/constants";
import { getProductPhotoUrls } from "@/lib/productPhotos";

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  materials: string[];
  colors: string[];
  photos: string[];
  custom_text_enabled: boolean;
  custom_text_label: string;
  custom_text_max_length: number;
}

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: Product, material: string, color: string, quantity: number, customText?: string) => void;
}

export function ProductDetailDialog({ product, open, onOpenChange, onAdd }: ProductDetailDialogProps) {
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customText, setCustomText] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    if (product) {
      setMaterial("");
      setColor("");
      setQuantity(1);
      setCustomText("");
      setActivePhoto(0);
      getProductPhotoUrls(product.photos).then(setPhotoUrls);
    }
  }, [product]);

  if (!product) return null;

  const availableMaterials = MATERIALS.filter(m => product.materials.length === 0 || product.materials.includes(m.id));
  const availableColors = material
    ? MATERIALS.find(m => m.id === material)?.colors.filter(c => product.colors.length === 0 || product.colors.includes(c.id)) || []
    : [];

  const handleAdd = () => {
    if (!material || !color) return;
    const matName = MATERIALS.find(m => m.id === material)?.name || material;
    const colorName = availableColors.find(c => c.id === color)?.name || color;
    onAdd(product, matName, colorName, quantity, product.custom_text_enabled ? customText : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Photo gallery */}
          <div>
            <div className="aspect-square bg-muted rounded-lg overflow-hidden">
              {photoUrls[activePhoto] ? (
                <img src={photoUrls[activePhoto]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Geen foto</div>
              )}
            </div>
            {photoUrls.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {photoUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={`w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0 ${i === activePhoto ? "border-accent" : "border-border"}`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div className="text-2xl font-bold text-accent">€{Number(product.price).toFixed(2)}</div>
            {product.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>
            )}

            <div>
              <Label className="text-xs">Materiaal</Label>
              <Select value={material} onValueChange={v => { setMaterial(v); setColor(""); }}>
                <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                <SelectContent>
                  {availableMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Kleur</Label>
              <Select value={color} onValueChange={setColor} disabled={!material}>
                <SelectTrigger><SelectValue placeholder="Kies kleur" /></SelectTrigger>
                <SelectContent>
                  {availableColors.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="multicolor">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border" style={{ background: "conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#a855f7,#ef4444)" }} />
                      Multicolor (meerdere kleuren)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Aantal</Label>
              <Input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} />
            </div>

            {product.custom_text_enabled && (
              <div>
                <Label className="text-xs">{product.custom_text_label}</Label>
                <Input
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  maxLength={product.custom_text_max_length}
                  placeholder={product.custom_text_label}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {customText.length}/{product.custom_text_max_length}
                </p>
              </div>
            )}

            <Button onClick={handleAdd} disabled={!material || !color} className="w-full" size="lg">
              <Plus className="w-4 h-4" /> Toevoegen aan winkelwagen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}