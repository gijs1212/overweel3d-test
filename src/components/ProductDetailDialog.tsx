import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, X } from "lucide-react";
import { MATERIALS } from "@/lib/constants";
import { getProductPhotoUrls } from "@/lib/productPhotos";

export type CustomFieldDef = {
  id: string;
  type: "text" | "textarea" | "photo";
  label: string;
  help?: string;
  required?: boolean;
  maxLength?: number;
};

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
  customer_photo_required?: boolean;
  material_fixed?: boolean;
  multicolor_allowed?: boolean;
  custom_fields?: CustomFieldDef[] | null;
}

export interface PrebuiltOptions {
  material: string;
  color: string;
  quantity: number;
  customText?: string;
  fieldTexts: { label: string; value: string }[];
  fieldPhotos: File[];
}

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: Product, options: PrebuiltOptions) => void;
}

export function ProductDetailDialog({ product, open, onOpenChange, onAdd }: ProductDetailDialogProps) {
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [customText, setCustomText] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});
  const [error, setError] = useState<string | null>(null);

  const fields: CustomFieldDef[] = Array.isArray(product?.custom_fields) ? (product!.custom_fields as CustomFieldDef[]) : [];

  useEffect(() => {
    if (product) {
      const onlyMaterial = product.material_fixed && product.materials.length > 0 ? product.materials[0] : "";
      setMaterial(onlyMaterial);
      setColor("");
      setQuantity(1);
      setCustomText("");
      setActivePhoto(0);
      setFieldValues({});
      setFieldFiles({});
      setError(null);
      getProductPhotoUrls(product.photos).then(setPhotoUrls);
    }
  }, [product]);

  if (!product) return null;

  const availableMaterials = MATERIALS.filter(m => product.materials.length === 0 || product.materials.includes(m.id));
  const availableColors = material
    ? MATERIALS.find(m => m.id === material)?.colors.filter(c => product.colors.length === 0 || product.colors.includes(c.id)) || []
    : [];
  const materialLocked = !!product.material_fixed && product.materials.length > 0;

  const addFiles = (fieldId: string, files: File[]) => {
    const images = files.filter(f => f.type.startsWith("image/"));
    setFieldFiles(prev => ({ ...prev, [fieldId]: [...(prev[fieldId] || []), ...images].slice(0, 5) }));
  };

  const handleAdd = () => {
    if (!material || !color) return;
    for (const f of fields) {
      if (!f.required) continue;
      if (f.type === "photo" && !(fieldFiles[f.id]?.length)) {
        setError(`"${f.label}" is verplicht: upload minimaal 1 foto.`);
        return;
      }
      if (f.type !== "photo" && !(fieldValues[f.id] || "").trim()) {
        setError(`"${f.label}" is verplicht.`);
        return;
      }
    }
    if (product.customer_photo_required && !Object.values(fieldFiles).some(a => a.length)) {
      setError("Voor dit product moet u minimaal 1 foto meesturen.");
      return;
    }
    const matName = MATERIALS.find(m => m.id === material)?.name || material;
    const colorName = color === "multicolor"
      ? "Multicolor (meerdere kleuren)"
      : availableColors.find(c => c.id === color)?.name || color;

    const fieldTexts = fields
      .filter(f => f.type !== "photo" && (fieldValues[f.id] || "").trim())
      .map(f => ({ label: f.label, value: (fieldValues[f.id] || "").trim() }));
    const fieldPhotos = Object.values(fieldFiles).flat();

    onAdd(product, {
      material: matName,
      color: colorName,
      quantity,
      customText: product.custom_text_enabled ? customText : undefined,
      fieldTexts,
      fieldPhotos,
    });
    onOpenChange(false);
  };

  const photoFieldDefs: CustomFieldDef[] = product.customer_photo_required && !fields.some(f => f.type === "photo")
    ? [...fields, { id: "__photo", type: "photo", label: "Uw foto", required: true, help: "Deze foto wordt bij uw bestelling opgeslagen." }]
    : fields;

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
              {materialLocked ? (
                <p className="text-sm font-medium text-primary mt-1">
                  {MATERIALS.find(m => m.id === product.materials[0])?.name || product.materials[0]}
                  <span className="text-xs text-muted-foreground font-normal"> (vast materiaal voor dit product)</span>
                </p>
              ) : (
                <Select value={material} onValueChange={v => { setMaterial(v); setColor(""); }}>
                  <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                  <SelectContent>
                    {availableMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
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
                  {product.multicolor_allowed !== false && (
                    <SelectItem value="multicolor">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full border" style={{ background: "conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#a855f7,#ef4444)" }} />
                        Multicolor (meerdere kleuren)
                      </div>
                    </SelectItem>
                  )}
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

            {/* Admin-configured extra options */}
            {photoFieldDefs.map((f) => (
              <div key={f.id}>
                <Label className="text-xs">
                  {f.label}{f.required ? " *" : ""}
                </Label>
                {f.type === "photo" ? (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(fieldFiles[f.id] || []).map((file, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border">
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setFieldFiles(prev => ({ ...prev, [f.id]: prev[f.id].filter((_, idx) => idx !== i) }))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 rounded-md border-2 border-dashed border-border hover:border-accent/50 flex items-center justify-center cursor-pointer">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { addFiles(f.id, Array.from(e.target.files || [])); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                ) : f.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    maxLength={f.maxLength || undefined}
                    value={fieldValues[f.id] || ""}
                    onChange={(e) => setFieldValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                  />
                ) : (
                  <Input
                    maxLength={f.maxLength || undefined}
                    value={fieldValues[f.id] || ""}
                    onChange={(e) => setFieldValues(prev => ({ ...prev, [f.id]: e.target.value }))}
                  />
                )}
                {f.help && <p className="text-[10px] text-muted-foreground mt-0.5">{f.help}</p>}
              </div>
            ))}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button onClick={handleAdd} disabled={!material || !color} className="w-full" size="lg">
              <Plus className="w-4 h-4" /> Toevoegen aan winkelwagen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
