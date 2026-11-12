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
  catalogProductPriceLabel,
  buildProductOptionAnswers,
  CatalogProduct,
  colorMatchesMaterial,
  FilamentColor,
  materialLabel,
  isVideoProductMedia,
  orderedProductImages,
  productColorSlotTitle,
  ProductOption,
  ProductOptionAnswer,
  validateCatalogColorSelection,
} from "@/lib/productCatalog";
import { isHeicFile } from "@/lib/imageUploads";
import { getProductPhotoUrl } from "@/lib/productPhotos";
import { ProductReviews } from "@/components/ProductReviews";
import { LocalMediaPreview } from "@/components/LocalMediaPreview";
import { useMaterials } from "@/hooks/useMaterials";

export interface PrebuiltOptions {
  materialId: string;
  material: string;
  colors: Array<{ id: string; name: string; hex: string; slotIndex?: number; slotLabel?: string }>;
  quantity: number;
  optionAnswers: ProductOptionAnswer[];
  optionFiles: Array<{ optionId: string; label: string; files: File[] }>;
  variantId: string | null;
  variantName: string | null;
  unitPrice: number;
}

interface ProductDetailDialogProps {
  product: CatalogProduct | null;
  colors: FilamentColor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: CatalogProduct, options: PrebuiltOptions) => void;
}

export function ProductDetailDialog({ product, colors, open, onOpenChange, onAdd }: ProductDetailDialogProps) {
  const databaseMaterials = useMaterials();
  const [material, setMaterial] = useState("");
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const [mediaItems, setMediaItems] = useState<Array<{ path: string; mediaType: "image" | "video"; url: string }>>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [addonEnabled, setAddonEnabled] = useState<Record<string, boolean>>({});
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});
  const [addonColors, setAddonColors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    if (!product) return [];
    const activeOptions = [...(product.product_options || [])].filter((option) => option.active).sort((a, b) => a.sort_order - b.sort_order);
    if (product.custom_text_enabled && !activeOptions.some((option) => option.id === "legacy-custom-text")) {
      activeOptions.unshift({
        id: "legacy-custom-text", product_id: product.id, type: "text", label: product.custom_text_label,
        description: "", required: false, choices: [], max_length: product.custom_text_max_length, sort_order: -1, active: true,
        is_addon: false, price_adjustment: 0, color_slots: 0, color_slot_labels: [],
      });
    }
    if (product.customer_photo_required && !activeOptions.some((option) => option.type === "photo")) {
      activeOptions.push({
        id: "required-customer-photo", product_id: product.id, type: "photo", label: "Foto voor dit product",
        description: "Upload minimaal één foto die we voor deze bestelling nodig hebben.", required: true,
        choices: [], max_length: null, sort_order: activeOptions.length, active: true,
        is_addon: false, price_adjustment: 0, color_slots: 0, color_slot_labels: [],
      });
    }
    return activeOptions;
  }, [product]);

  const materials = useMemo(() => product ? availableMaterialsForProduct(product, databaseMaterials) : [], [product, databaseMaterials]);
  const variants = useMemo(() => [...(product?.product_variants || [])].filter((variant) => variant.active).sort((a, b) => a.sort_order - b.sort_order), [product]);
  const selectedVariant = variants.find((variant) => variant.id === variantId) || null;
  const priceOnRequest = Number(product?.price || 0) <= 0;
  const unitPrice = Number(product?.price || 0) + Number(selectedVariant?.price_adjustment || 0)
    + options.filter((option) => option.is_addon && addonEnabled[option.id]).reduce((total, option) => total + Number(option.price_adjustment || 0) * (addonCounts[option.id] || 1), 0);
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
    const available = availableMaterialsForProduct(product, databaseMaterials);
    const initialMaterial = product.material_mode === "fixed" || available.length === 1 ? available[0]?.id || "" : "";
    setMaterial(initialMaterial);
    setSelectedColorIds([]);
    setQuantity(1);
    setVariantId("");
    setActivePhoto(0);
    setValues({});
    setFiles({});
    setAddonEnabled({});
    setAddonCounts({});
    setAddonColors({});
    setError(null);
    const productMedia = orderedProductImages(product);
    Promise.all(productMedia.map(async (media) => ({
      path: media.storage_path,
      mediaType: isVideoProductMedia(media.storage_path, media.media_type) ? "video" as const : "image" as const,
      url: await getProductPhotoUrl(media.storage_path),
    }))).then(setMediaItems);
  }, [product, databaseMaterials]);

  useEffect(() => {
    if (!selectedVariant?.material_id) return;
    setMaterial(selectedVariant.material_id);
  }, [selectedVariant]);

  useEffect(() => {
    setSelectedColorIds([]);
  }, [material]);

  if (!product) return null;

  const setColorSlot = (index: number, colorId: string) => {
    setError(null);
    setSelectedColorIds((current) => {
      const next = Array.from({ length: product.max_colors }, (_, slotIndex) => current[slotIndex] || "");
      next[index] = colorId;
      return next;
    });
  };

  const addFiles = (optionId: string, incoming: File[]) => {
    const images = incoming.filter((file) => (file.type.startsWith("image/") || isHeicFile(file)) && file.size <= 12 * 1024 * 1024);
    if (images.length !== incoming.length) setError("Alleen afbeeldingen tot 12 MB worden geaccepteerd.");
    setFiles((current) => ({ ...current, [optionId]: [...(current[optionId] || []), ...images].slice(0, 5) }));
  };

  const validate = () => {
    if (variants.length > 0 && !selectedVariant) return "Kies een productvariant.";
    if (!material) return "Kies een materiaal.";
    const chosenColorIds = selectedColorIds.filter(Boolean);
    if (product.color_selection_mode === "multiple" && product.color_required) {
      const missingIndex = Array.from({ length: product.max_colors }).findIndex((_, index) => !selectedColorIds[index]);
      if (missingIndex >= 0) return `${productColorSlotTitle(product, missingIndex)} is verplicht.`;
    }
    const colorError = validateCatalogColorSelection(product, chosenColorIds, materialColors.map((color) => color.id));
    if (colorError) return colorError;
    for (const option of options) {
      if (option.is_addon && !addonEnabled[option.id]) continue;
      if (option.is_addon) {
        const chosen = addonColors[option.id] || [];
        if (Array.from({ length: option.color_slots }).some((_, index) => !chosen[index])) return `Vul elk kleurvak van “${option.label}” in.`;
      }
      if (!option.required || (option.is_addon && option.type === "checkbox")) continue;
      if (option.type === "photo" && !(files[option.id]?.length)) return `Upload minimaal één foto bij “${option.label}”.`;
      if (option.type === "checkbox" && values[option.id] !== true) return `Bevestig “${option.label}”.`;
      if (option.type !== "photo" && option.type !== "checkbox" && !String(values[option.id] || "").trim()) return `Vul “${option.label}” in.`;
    }
    return null;
  };

  const handleAdd = () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    const selectedColors = selectedColorIds.flatMap((id, index) => {
      const color = materialColors.find((item) => item.id === id);
      return color ? [{
        id: color.id,
        name: color.name,
        hex: color.hex,
        slotIndex: index,
        slotLabel: product.color_selection_mode === "multiple" ? productColorSlotTitle(product, index) : undefined,
      }] : [];
    });
    const optionAnswers = buildProductOptionAnswers(options.filter((option) => !option.is_addon || (addonEnabled[option.id] && option.type !== "checkbox")), values);
    options.filter((option) => option.is_addon && addonEnabled[option.id]).forEach((option) => {
      optionAnswers.push({ optionId: option.id, label: option.label, type: option.type, value: "Ja", addonQuantity: addonCounts[option.id] || 1 });
      (addonColors[option.id] || []).forEach((colorId, index) => {
        const color = materialColors.find((item) => item.id === colorId);
        if (color) optionAnswers.push({ optionId: `${option.id}:color:${index}`, label: option.color_slot_labels[index] || `Kleur ${index + 1}`, type: "select", value: color.name });
      });
    });
    onAdd(product, {
      materialId: material,
      material: materials.find((item) => item.id === material)?.name || materialLabel(material),
      colors: selectedColors,
      quantity: Math.max(1, Math.floor(quantity)),
      optionAnswers,
      optionFiles: options.filter((option) => option.type === "photo" && (!option.is_addon || addonEnabled[option.id]) && files[option.id]?.length).map((option) => ({ optionId: option.id, label: option.label, files: files[option.id] })),
      variantId: selectedVariant?.id || null,
      variantName: selectedVariant?.name || null,
      unitPrice,
    });
    onOpenChange(false);
  };

  const renderOption = (option: ProductOption) => {
    if (option.type === "photo") return <div className="flex flex-wrap gap-2 mt-1">
      {(files[option.id] || []).map((file, index) => <div key={`${file.name}-${index}`} className="relative w-16 h-16 rounded-md overflow-hidden border"><LocalMediaPreview file={file} alt="Uploadvoorbeeld" className="h-full w-full object-cover" /><button type="button" onClick={() => setFiles((current) => ({ ...current, [option.id]: current[option.id].filter((_, fileIndex) => fileIndex !== index) }))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"><X className="w-3 h-3" /></button></div>)}
      <label className="relative w-16 h-16 overflow-hidden rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer"><Upload className="w-4 h-4 text-muted-foreground" /><input type="file" accept="image/*" multiple className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={(event) => { addFiles(option.id, Array.from(event.target.files || [])); }} /></label>
    </div>;
    if (option.type === "textarea") return <Textarea rows={3} maxLength={option.max_length || undefined} value={String(values[option.id] || "")} onChange={(event) => setValues((current) => ({ ...current, [option.id]: event.target.value }))} />;
    if (option.type === "select") return <Select value={String(values[option.id] || "")} onValueChange={(value) => setValues((current) => ({ ...current, [option.id]: value }))}><SelectTrigger><SelectValue placeholder="Maak een keuze" /></SelectTrigger><SelectContent>{option.choices.map((choice) => <SelectItem key={choice} value={choice}>{choice}</SelectItem>)}</SelectContent></Select>;
    if (option.type === "radio") return <div className="flex flex-wrap gap-2">{option.choices.map((choice) => <button type="button" key={choice} onClick={() => setValues((current) => ({ ...current, [option.id]: choice }))} className={`px-3 py-2 rounded-lg text-sm border ${values[option.id] === choice ? "border-accent bg-accent/10" : ""}`}>{values[option.id] === choice && <Check className="w-3 h-3 inline mr-1" />}{choice}</button>)}</div>;
    if (option.type === "checkbox") return <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer"><Checkbox checked={values[option.id] === true} onCheckedChange={(checked) => setValues((current) => ({ ...current, [option.id]: checked === true }))} /><span className="text-sm">Ja, dit is van toepassing</span></label>;
    return <Input maxLength={option.max_length || undefined} value={String(values[option.id] || "")} onChange={(event) => setValues((current) => ({ ...current, [option.id]: event.target.value }))} />;
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">{product.name}</DialogTitle></DialogHeader>
    <div className="grid md:grid-cols-2 gap-6">
      <div><div className="aspect-square bg-muted rounded-lg overflow-hidden">{mediaItems[activePhoto]?.url ? mediaItems[activePhoto].mediaType === "video" ? <video src={mediaItems[activePhoto].url} aria-label={product.name} controls playsInline preload="metadata" className="w-full h-full object-contain" /> : <img src={mediaItems[activePhoto].url} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Geen media</div>}</div>{mediaItems.length > 1 && <div className="flex gap-2 mt-2 overflow-x-auto">{mediaItems.map((media, index) => <button type="button" key={media.path} onClick={() => setActivePhoto(index)} className={`relative w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 ${index === activePhoto ? "border-accent" : "border-border"}`}>{media.mediaType === "video" ? <video src={media.url} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : <img src={media.url} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />}</button>)}</div>}</div>
      <div className="space-y-4"><div className="text-2xl font-bold text-accent">{priceOnRequest ? "Op aanvraag" : selectedVariant || variants.length === 0 ? `€${unitPrice.toFixed(2)}` : catalogProductPriceLabel(product)}</div>{product.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>}
        {variants.length > 0 && <div><Label>Variant *</Label><Select value={variantId} onValueChange={setVariantId}><SelectTrigger><SelectValue placeholder="Kies formaat of uitvoering" /></SelectTrigger><SelectContent>{variants.map((variant) => <SelectItem key={variant.id} value={variant.id}>{variant.name}{priceOnRequest ? " (op aanvraag)" : ` (€${(Number(product.price) + Number(variant.price_adjustment || 0)).toFixed(2)})`}</SelectItem>)}</SelectContent></Select></div>}
        <div><Label>Materiaal *</Label>{product.material_mode === "fixed" ? <div className="mt-1 rounded-lg border bg-muted/40 p-3"><p className="font-medium">{materialLabel(material)}</p><p className="text-xs text-muted-foreground">Vast materiaal voor dit product</p></div> : <Select value={material} onValueChange={setMaterial}><SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger><SelectContent>{materials.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}</div>
        <div><Label>{product.color_selection_mode === "multiple" ? "Kleuren per onderdeel" : "Kleur"}{product.color_required ? " *" : ""}</Label>{!material ? <p className="text-xs text-muted-foreground mt-1">Kies eerst een materiaal.</p> : materialColors.length === 0 ? <p className="text-xs text-destructive mt-1">Voor dit materiaal zijn momenteel geen kleuren beschikbaar.</p> : product.color_selection_mode === "single" ? <Select value={selectedColorIds[0] || ""} onValueChange={(value) => setSelectedColorIds([value])}><SelectTrigger><SelectValue placeholder={product.color_required ? "Kies een kleur" : "Geen kleur gekozen"} /></SelectTrigger><SelectContent>{materialColors.map((color) => <SelectItem key={color.id} value={color.id}><span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }} />{color.name}</span></SelectItem>)}</SelectContent></Select> : <div className="space-y-3 mt-2">{Array.from({ length: product.max_colors }, (_, index) => {
          const noneValue = `none-${index}`;
          const required = product.color_required;
          return <div key={index}><Label className="text-xs">{productColorSlotTitle(product, index)}{required ? " *" : ""}</Label><Select value={selectedColorIds[index] || noneValue} onValueChange={(value) => setColorSlot(index, value === noneValue ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{!required && <SelectItem value={noneValue}>Geen kleur</SelectItem>}{materialColors.map((color) => <SelectItem key={color.id} value={color.id}><span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }} />{color.name}</span></SelectItem>)}</SelectContent></Select></div>;
        })}</div>}</div>
        <div><Label>Aantal</Label><Input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></div>
        {options.map((option) => option.is_addon ? <div key={option.id} className="rounded-xl border-2 border-accent/30 p-4 space-y-3"><div><Label>{option.label}{option.price_adjustment ? ` (+€${Number(option.price_adjustment).toFixed(2)})` : ""}</Label>{option.description && <p className="text-xs text-muted-foreground">{option.description}</p>}</div><div className="grid grid-cols-2 gap-2"><Button type="button" variant={addonEnabled[option.id] ? "default" : "outline"} onClick={() => setAddonEnabled((current) => ({ ...current, [option.id]: true }))}>Ja, toevoegen</Button><Button type="button" variant={!addonEnabled[option.id] ? "default" : "outline"} onClick={() => setAddonEnabled((current) => ({ ...current, [option.id]: false }))}>Nee</Button></div>{addonEnabled[option.id] && <div className="space-y-3"><label>Aantal per product<Input type="number" min={1} max={999} value={addonCounts[option.id] ?? 1} onChange={(event) => setAddonCounts({ ...addonCounts, [option.id]: Math.min(999, Math.max(1, Math.floor(Number(event.target.value) || 1))) })} /></label>{Array.from({ length: option.color_slots }, (_, index) => <div key={index}><Label className="text-xs">{option.color_slot_labels[index] || `Kleur ${index + 1}`} *</Label><Select value={addonColors[option.id]?.[index] || ""} onValueChange={(value) => setAddonColors((current) => { const selected = [...(current[option.id] || [])]; selected[index] = value; return { ...current, [option.id]: selected }; })}><SelectTrigger><SelectValue placeholder="Kies een kleur" /></SelectTrigger><SelectContent>{materialColors.map((color) => <SelectItem key={color.id} value={color.id}><span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }} />{color.name}</span></SelectItem>)}</SelectContent></Select></div>)}{option.type !== "checkbox" && renderOption(option)}</div>}</div> : <div key={option.id}><Label>{option.label}{option.required ? " *" : ""}</Label>{option.description && <p className="text-xs text-muted-foreground mb-1">{option.description}</p>}{renderOption(option)}{option.max_length && ["text", "textarea"].includes(option.type) && <p className="text-[10px] text-muted-foreground mt-1">{String(values[option.id] || "").length}/{option.max_length} tekens</p>}</div>)}
        {error && <p role="alert" className="text-sm text-destructive rounded-lg bg-destructive/10 p-3">{error}</p>}
        <Button onClick={handleAdd} disabled={(variants.length > 0 && !variantId) || !material || (product.color_required && !selectedColorIds[0])} className="w-full" size="lg"><Plus className="w-4 h-4" /> Toevoegen aan winkelwagen</Button>
      </div>
    </div>
    <ProductReviews productId={product.id} />
  </DialogContent></Dialog>;
}
