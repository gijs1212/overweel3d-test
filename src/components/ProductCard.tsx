import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { MATERIALS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { availableFilamentColorsForMaterial, FilamentColor } from "@/lib/productCatalog";

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

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product, material: string, color: string, quantity: number, customText?: string) => void;
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customText, setCustomText] = useState("");
  const [filamentColors, setFilamentColors] = useState<FilamentColor[]>([]);

  useEffect(() => {
    supabase.from("filament_colors").select("*").eq("active", true).order("material").order("sort_order")
      .then(({ data }) => setFilamentColors((data || []) as unknown as FilamentColor[]));
  }, []);

  const availableMaterials = MATERIALS.filter(m => product.materials.length === 0 || product.materials.includes(m.id));
  const materialColors = material ? availableFilamentColorsForMaterial(filamentColors, material) : [];
  const explicitlyConfiguredColors = materialColors.filter((color) => product.colors.includes(color.id));
  const availableColors = explicitlyConfiguredColors.length > 0 ? explicitlyConfiguredColors : materialColors;

  const photoUrl = product.photos[0]
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/orders/${product.photos[0]}`
    : null;

  const handleAdd = () => {
    if (!material || !color) return;
    const matName = MATERIALS.find(m => m.id === material)?.name || material;
    const colorName = availableColors.find(c => c.id === color)?.name || color;
    onAdd(product, matName, colorName, quantity, product.custom_text_enabled ? customText : undefined);
    setQuantity(1);
    setCustomText("");
  };

  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex gap-4">
        {photoUrl && (
          <img src={photoUrl} alt={product.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-primary">{product.name}</h3>
            <span className="text-lg font-semibold text-accent">€{Number(product.price).toFixed(2)}</span>
          </div>
          {product.description && <p className="text-sm text-muted-foreground mb-3">{product.description}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <div>
          <Label className="text-xs">Materiaal</Label>
          <Select value={material} onValueChange={v => { setMaterial(v); setColor(""); }}>
            <SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger>
            <SelectContent>
              {availableMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Kleur</Label>
          <Select value={color} onValueChange={setColor} disabled={!material}>
            <SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger>
            <SelectContent>
              {availableColors.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Aantal</Label>
          <Input type="number" min={1} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex items-end">
          <Button onClick={handleAdd} disabled={!material || !color} size="sm" className="w-full">
            <Plus className="w-3 h-3" /> Toevoegen
          </Button>
        </div>
      </div>

      {product.custom_text_enabled && (
        <div className="mt-3">
          <Label className="text-xs">{product.custom_text_label}</Label>
          <Input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            maxLength={product.custom_text_max_length}
            placeholder={product.custom_text_label}
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{customText.length}/{product.custom_text_max_length}</p>
        </div>
      )}
    </div>
  );
}
