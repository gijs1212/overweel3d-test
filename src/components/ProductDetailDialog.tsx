import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  availableMaterialsForProduct,
  buildProductOptionAnswers,
  CatalogProduct,
  colorMatchesMaterial,
  FilamentColor,
  materialLabel,
  orderedProductImages,
  ProductOption,
  ProductOptionAnswer,
  validateCatalogColorSelection,
} from "@/lib/productCatalog";
import { isHeicFile, prepareImageFileForUpload } from "@/lib/imageUploads";
import { getProductPhotoUrls } from "@/lib/productPhotos";

export interface PrebuiltOptions {
  materialId: string;
  material: string;
  colors: Array<{ id: string; name: string; hex: string }>;
  quantity: number;
  optionAnswers: ProductOptionAnswer[];
  optionFiles: Array<{ optionId: string; label: string; files: File[] }>;
}

interface ProductDetailDialogProps {
  product: CatalogProduct | null;
  colors: FilamentColor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: CatalogProduct, options: PrebuiltOptions) => void;
}

export function ProductDetailDialog({ product, colors, open, onOpenChange, onAdd }: ProductDetailDialogProps) {
  const [material, setMaterial] = useState("");
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    if (!product) return [];
    const activeOptions = [...(product.product_options || [])].filter((option) => option.active).sort((a, b) => a.sort_order - b.sort_order);
    if (product.custom_text_enabled && !activeOptions.some((option) => option.id === "legacy-custom-text")) {
      activeOptions.unshift({
        id: "legacy-custom-text", product_id: product.id, type: "text", label: product.custom_text_label,
        description: "", required: false, choices: [], max_length: product.custom_text_max_length, sort_order: -1, active: true,
      });
    }
    if (product.customer_photo_required && !activeOptions.some((option) => option.type === "photo")) {
      activeOptions.push({
        id: "required-customer-photo", product_id: product.id, type: "photo", label: "Foto voor dit product",
        description: "Upload minimaal één foto die we voor deze bestelling nodig hebben.", required: true,
        choices: [], max_length: null, sort_order: activeOptions.length, active: true,
      });
    }
    return activeOptions;
  }, [product]);

  const materials = useMemo(() => product ? availableMaterialsForProduct(product) : [], [product]);
  const materialColors = useMemo(() => {
    if (!product || !material) return [];
    const explicitlyAllowed = new Set(product.colors || []);
    const matchingMaterial = colors.filter((color) => color.active && colorMatchesMaterial(color, material));
    const explicitMatches = matchingMaterial.filter((color) => explicitlyAllowed.has(color.id));
    // Legacy products stored slugs such as "red" rather than filament UUIDs.
    // If none resolve, retain a usable catalogue by offering the material's active colors.
    return (product.colors_configured
      ? explicitMatches
      : explicitlyAllowed.size > 0 && explicitMatches.length > 0 ? explicitMatches : matchingMaterial)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [colors, material, product]);

  useEffect(() => {
    if (!product) return;
    const available = availableMaterialsForProduct(product);
    const initialMaterial = product.material_mode === "fixed" || available.length === 1 ? available[0]?.id || "" : "";
    setMaterial(initialMaterial);
    setSelectedColorIds([]);
    setQuantity(1);
    setActivePhoto(0);
    setValues({});
    setFiles({});
    setError(null);
    getProductPhotoUrls(orderedProductImages(product).map((image) => image.storage_path)).then(setPhotoUrls);
  }, [product]);

  useEffect(() => {
    setSelectedColorIds([]);
  }, [material]);

  if (!product) return null;

  const toggleColor = (colorId: string) => {
    setError(null);
    if (product.color_selection_mode !== "multiple") {
      setSelectedColorIds([colorId]);
      return;
    }
    setSelectedColorIds((current) => {
      if (current.includes(colorId)) return current.filter((id) => id !== colorId);
      if (current.length >= product.max_colors) {
        setError(`U kunt maximaal ${product.max_colors} kleuren kiezen.`);
        return current;
      }
      return [...current, colorId];
    });
  };

  const addFiles = async (optionId: string, incoming: File[]) => {
    const images = incoming.filter((file) => (file.type.startsWith("image/") || isHeicFile(file)) && file.size <= 12 * 1024 * 1024);
    if (images.length !== incoming.length) setError("Alleen afbeeldingen tot 12 MB worden geaccepteerd.");
    try {
      const prepared = await Promise.all(images.map((file) => prepareImageFileForUpload(file)));
      setFiles((current) => ({ ...current, [optionId]: [...(current[optionId] || []), ...prepared].slice(0, 5) }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "HEIC-conversie mislukt.");
    }
  };

  const validate = () => {
    if (!material) return "Kies een materiaal.";
    const colorError = validateCatalogColorSelection(product, selectedColorIds, materialColors.map((color) => color.id));
    if (colorError) return colorError;
    for (const option of options) {
      if (!option.required) continue;
      if (option.type === "photo" && !(files[option.id]?.length)) return `Upload minimaal één foto bij “${option.label}”.`;
      if (option.type === "checkbox" && values[option.id] !== true) return `Bevestig “${option.label}”.`;
      if (option.type !== "photo" && option.type !== "checkbox" && !String(values[option.id] || "").trim()) return `Vul “${option.label}” in.`;
    }
    return null;
  };

  const handleAdd = () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    const selectedColors = selectedColorIds.map((id) => materialColors.find((color) => color.id === id)).filter(Boolean) as FilamentColor[];
    const optionAnswers = buildProductOptionAnswers(options, values);
    onAdd(product, {
      materialId: material,
      material: materialLabel(material),
      colors: selectedColors.map((color) => ({ id: color.id, name: color.name, hex: color.hex })),
      quantity: Math.max(1, Math.floor(quantity)),
      optionAnswers,
      optionFiles: options.filter((option) => option.type === "photo" && files[option.id]?.length).map((option) => ({ optionId: option.id, label: option.label, files: files[option.id] })),
    });
    onOpenChange(false);
  };

  const renderOption = (option: ProductOption) => {
    if (option.type === "photo") return <div className="flex flex-wrap gap-2 mt-1">
      {(files[option.id] || []).map((file, index) => <div key={`${file.name}-${index}`} className="relative w-16 h-16 rounded-md overflow-hidden border"><img src={URL.createObjectURL(file)} alt="Uploadvoorbeeld" className="w-full h-full object-cover" /><button type="button" onClick={() => setFiles((current) => ({ ...current, [option.id]: current[option.id].filter((_, fileIndex) => fileIndex !== index) }))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"><X className="w-3 h-3" /></button></div>)}
      <label className="w-16 h-16 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer"><Upload className="w-4 h-4 text-muted-foreground" /><input type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(event) => { void addFiles(option.id, Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
    </div>;
    if (option.type === "textarea") return <Textarea rows={3} maxLength={option.max_length || undefined} value={String(values[option.id] || "")} onChange={(event) => setValues((current) => ({ ...current, [option.id]: event.target.value }))} />;
    if (option.type === "select") return <Select value={String(values[option.id] || "")} onValueChange={(value) => setValues((current) => ({ ...current, [option.id]: value }))}><SelectTrigger><SelectValue placeholder="Maak een keuze" /></SelectTrigger><SelectContent>{option.choices.map((choice) => <SelectItem key={choice} value={choice}>{choice}</SelectItem>)}</SelectContent></Select>;
    if (option.type === "radio") return <div className="flex flex-wrap gap-2">{option.choices.map((choice) => <button type="button" key={choice} onClick={() => setValues((current) => ({ ...current, [option.id]: choice }))} className={`px-3 py-2 rounded-lg text-sm border ${values[option.id] === choice ? "border-accent bg-accent/10" : ""}`}>{values[option.id] === choice && <Check className="w-3 h-3 inline mr-1" />}{choice}</button>)}</div>;
    if (option.type === "checkbox") return <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer"><Checkbox checked={values[option.id] === true} onCheckedChange={(checked) => setValues((current) => ({ ...current, [option.id]: checked === true }))} /><span className="text-sm">Ja, dit is van toepassing</span></label>;
    return <Input maxLength={option.max_length || undefined} value={String(values[option.id] || "")} onChange={(event) => setValues((current) => ({ ...current, [option.id]: event.target.value }))} />;
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">{product.name}</DialogTitle></DialogHeader>
    <div className="grid md:grid-cols-2 gap-6">
      <div><div className="aspect-square bg-muted rounded-lg overflow-hidden">{photoUrls[activePhoto] ? <img src={photoUrls[activePhoto]} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Geen foto</div>}</div>{photoUrls.length > 1 && <div className="flex gap-2 mt-2 overflow-x-auto">{photoUrls.map((url, index) => <button type="button" key={url} onClick={() => setActivePhoto(index)} className={`w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 ${index === activePhoto ? "border-accent" : "border-border"}`}><img src={url} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" /></button>)}</div>}</div>
      <div className="space-y-4"><div className="text-2xl font-bold text-accent">€{Number(product.price).toFixed(2)}</div>{product.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>}
        <div><Label>Materiaal *</Label>{product.material_mode === "fixed" ? <div className="mt-1 rounded-lg border bg-muted/40 p-3"><p className="font-medium">{materialLabel(material)}</p><p className="text-xs text-muted-foreground">Vast materiaal voor dit product</p></div> : <Select value={material} onValueChange={setMaterial}><SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger><SelectContent>{materials.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}</div>
        <div><Label>{product.color_selection_mode === "multiple" ? `Kleuren (max. ${product.max_colors})` : "Kleur"}{product.color_required ? " *" : ""}</Label>{!material ? <p className="text-xs text-muted-foreground mt-1">Kies eerst een materiaal.</p> : materialColors.length === 0 ? <p className="text-xs text-destructive mt-1">Voor dit materiaal zijn momenteel geen kleuren beschikbaar.</p> : product.color_selection_mode === "single" ? <Select value={selectedColorIds[0] || ""} onValueChange={(value) => setSelectedColorIds([value])}><SelectTrigger><SelectValue placeholder={product.color_required ? "Kies een kleur" : "Geen kleur gekozen"} /></SelectTrigger><SelectContent>{materialColors.map((color) => <SelectItem key={color.id} value={color.id}><span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }} />{color.name}</span></SelectItem>)}</SelectContent></Select> : <div className="grid grid-cols-2 gap-2 mt-1">{materialColors.map((color) => { const selected = selectedColorIds.includes(color.id); return <button type="button" key={color.id} onClick={() => toggleColor(color.id)} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${selected ? "border-accent bg-accent/10" : ""}`}><span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: color.hex }} />{color.name}{selected && <Check className="w-4 h-4 ml-auto text-accent" />}</button>; })}</div>}</div>
        <div><Label>Aantal</Label><Input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></div>
        {options.map((option) => <div key={option.id}><Label>{option.label}{option.required ? " *" : ""}</Label>{option.description && <p className="text-xs text-muted-foreground mb-1">{option.description}</p>}{renderOption(option)}{option.max_length && ["text", "textarea"].includes(option.type) && <p className="text-[10px] text-muted-foreground mt-1">{String(values[option.id] || "").length}/{option.max_length} tekens</p>}</div>)}
        {error && <p role="alert" className="text-sm text-destructive rounded-lg bg-destructive/10 p-3">{error}</p>}
        <Button onClick={handleAdd} disabled={!material || (product.color_required && selectedColorIds.length === 0)} className="w-full" size="lg"><Plus className="w-4 h-4" /> Toevoegen aan winkelwagen</Button>
      </div>
    </div>
  </DialogContent></Dialog>;
}
