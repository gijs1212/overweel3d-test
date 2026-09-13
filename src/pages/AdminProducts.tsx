import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ImagePlus, Loader2, Pencil, Plus, Save, Star, Trash2, Video, X } from "lucide-react";

import { Footer } from "@/components/Footer";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { isHeicFile, uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials } from "@/hooks/useMaterials";
import { sendAutomaticNewsletters } from "@/lib/automaticNewsletter";
import {
  CatalogProduct,
  colorMatchesMaterial,
  FilamentColor,
  MaterialMode,
  isVideoProductMedia,
  orderedProductImages,
  ProductCategory,
  ProductImage,
  ProductOption,
  ProductOptionType,
  ProductVariant,
} from "@/lib/productCatalog";
import { getProductPhotoUrl, normalizeProductStoragePath } from "@/lib/productPhotos";

type ProductForm = Omit<CatalogProduct, "id" | "product_categories" | "product_images" | "product_options" | "product_variants">;
type PendingImage = { key: string; file: File; previewUrl: string; media_type: "image" | "video" };
type DeleteTarget = { type: "product"; value: CatalogProduct } | { type: "category"; value: ProductCategory };

const optionTypes: Array<{ value: ProductOptionType; label: string }> = [
  { value: "text", label: "Kort tekstveld" },
  { value: "textarea", label: "Lang tekstveld" },
  { value: "select", label: "Keuzelijst" },
  { value: "radio", label: "Zichtbare keuzes" },
  { value: "checkbox", label: "Ja/nee-keuze" },
  { value: "photo", label: "Foto-upload" },
];

const emptyForm: ProductForm = {
  name: "", description: "", price: 0, category_id: null, materials: [], colors: [], photos: [],
  material_mode: "selected", material_fixed: false, color_selection_mode: "single", color_required: true, colors_configured: false,
  max_colors: 1, color_slot_labels: [], multicolor_allowed: false, custom_text_enabled: false, custom_text_label: "Aangepaste tekst",
  custom_text_max_length: 50, customer_photo_required: false, active: true,
};

function SignedMedia({ path, alt, mediaType, className }: { path: string; alt: string; mediaType?: "image" | "video"; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let current = true;
    getProductPhotoUrl(path).then((nextUrl) => current && setUrl(nextUrl));
    return () => { current = false; };
  }, [path]);
  if (!url) return <div className={`${className || ""} bg-muted animate-pulse`} />;
  return isVideoProductMedia(path, mediaType)
    ? <video src={url} aria-label={alt} muted playsInline preload="metadata" className={className} />
    : <img src={url} alt={alt} className={className} />;
}

const sanitizeFilename = (name: string) => name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

export default function AdminProducts() {
  const MATERIALS = useMaterials(true);
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [colors, setColors] = useState<FilamentColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm });
  const [images, setImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [primaryKey, setPrimaryKey] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedColorIds, setSelectedColorIds] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState(0);
  const [categoryActive, setCategoryActive] = useState(true);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    const [productResult, categoryResult, colorResult, availabilityResult] = await Promise.all([
      supabase.from("products").select("*, product_categories(*), product_images(*), product_options(*), product_variants(*)").order("created_at", { ascending: false }),
      supabase.from("product_categories").select("*").order("sort_order").order("name"),
      supabase.from("filament_colors").select("*").order("material").order("sort_order").order("name"),
      supabase.from("product_color_availability").select("product_id,color_id,available"),
    ]);
    const error = productResult.error || categoryResult.error || colorResult.error || availabilityResult.error;
    if (error) toast({ title: "Catalogus laden mislukt", description: error.message, variant: "destructive" });
    const availability = availabilityResult.data || [];
    setProducts(((productResult.data || []) as unknown as CatalogProduct[]).map((product) => {
      const productAvailability = availability.filter((row) => row.product_id === product.id);
      return {
        ...product,
        product_images: orderedProductImages(product),
        product_options: [...(product.product_options || [])].sort((a, b) => a.sort_order - b.sort_order),
        product_variants: [...(product.product_variants || [])].sort((a, b) => a.sort_order - b.sort_order),
        colors: productAvailability.length
          ? productAvailability.filter((row) => row.available).map((row) => row.color_id)
          : product.colors,
      };
    }));
    setCategories((categoryResult.data || []) as unknown as ProductCategory[]);
    setColors((colorResult.data || []) as unknown as FilamentColor[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) fetchCatalog();
  }, [authLoading, fetchCatalog, isAdmin]);

  const resetEditor = () => {
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setEditingId(null); setForm({ ...emptyForm, materials: [], colors: [], photos: [] }); setImages([]);
    setPendingImages([]); setRemovedPaths([]); setPrimaryKey(""); setOptions([]); setVariants([]); setSelectedColorIds([]); setMediaError(""); setShowEditor(false);
  };
  const openNew = () => { resetEditor(); setShowEditor(true); };
  const openEdit = (product: CatalogProduct) => {
    pendingImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    const productImages = orderedProductImages(product);
    setEditingId(product.id);
    setForm({
      ...emptyForm, ...product,
      material_mode: product.material_mode || (product.material_fixed ? "fixed" : product.materials.length ? "selected" : "all"),
      color_selection_mode: product.color_selection_mode || (product.multicolor_allowed ? "multiple" : "single"),
      max_colors: Math.max(1, product.max_colors || (product.multicolor_allowed ? 2 : 1)),
      color_slot_labels: product.color_slot_labels || [],
      product_categories: undefined, product_images: undefined, product_options: undefined, product_variants: undefined,
    } as ProductForm);
    setImages(productImages); setPendingImages([]); setRemovedPaths([]);
    setPrimaryKey(productImages.find((image) => image.is_primary)?.id || productImages[0]?.id || "");
    setOptions([...(product.product_options || [])]); setVariants([...(product.product_variants || [])]); setSelectedColorIds([...(product.colors || [])]); setShowEditor(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const availableColors = useMemo(() => form.material_mode === "all"
    ? colors.filter((color) => color.active)
    : colors.filter((color) => color.active && form.materials.some((material) => colorMatchesMaterial(color, material))),
  [colors, form.material_mode, form.materials]);

  useEffect(() => {
    const compatibleIds = new Set(availableColors.map((color) => color.id));
    setSelectedColorIds((current) => current.filter((id) => compatibleIds.has(id)));
  }, [availableColors]);

  const setMaterialMode = (mode: MaterialMode) => setForm((current) => ({
    ...current, material_mode: mode, material_fixed: mode === "fixed",
    materials: mode === "all" ? [] : mode === "fixed" ? current.materials.slice(0, 1) : current.materials,
  }));
  const toggleMaterial = (materialId: string) => setForm((current) => ({
    ...current,
    materials: current.material_mode === "fixed" ? [materialId] : current.materials.includes(materialId)
      ? current.materials.filter((id) => id !== materialId) : [...current.materials, materialId],
  }));
  const toggleColor = (colorId: string) => setSelectedColorIds((current) => current.includes(colorId)
    ? current.filter((id) => id !== colorId) : [...current, colorId]);

  const handleImageInput = async (files: File[]) => {
    if (!files.length) return;
    setProcessingMedia(true);
    setMediaError("");
    const converted: File[] = [];
    try {
      for (const file of files) {
        const isHeic = isHeicFile(file);
        const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
        if (!isHeic && !file.type.startsWith("image/") && !isVideo) { toast({ title: `${file.name} is geen afbeelding of video`, variant: "destructive" }); continue; }
        const maxBytes = isVideo ? 50 * 1024 * 1024 : 12 * 1024 * 1024;
        if (file.size > maxBytes) { toast({ title: `${file.name} is te groot`, description: isVideo ? "Maximaal 50 MB per video." : "Maximaal 12 MB per afbeelding.", variant: "destructive" }); continue; }
        converted.push(file);
      }
      const additions = converted.map((file) => ({
        key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file),
        media_type: file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? "video" as const : "image" as const,
      }));
      setPendingImages((current) => [...current, ...additions]);
      setPrimaryKey((current) => current || additions[0]?.key || "");
      if (additions.length) toast({
        title: `${additions.length} mediabestand${additions.length === 1 ? "" : "en"} geselecteerd`,
        description: "De preview staat klaar. Klik op product opslaan om de upload te starten.",
      });
      if (!additions.length) setMediaError("Geen van de gekozen bestanden kon worden toegevoegd. Kies een JPG, PNG, HEIC of ondersteunde video binnen de maximale bestandsgrootte.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout bij het openen van het bestand.";
      setMediaError(message);
      toast({ title: "Mediabestand openen mislukt", description: message, variant: "destructive" });
    } finally {
      setProcessingMedia(false);
    }
  };
  const removeExistingImage = (image: ProductImage) => {
    const remaining = images.filter((item) => item.id !== image.id);
    setImages(remaining); setRemovedPaths((current) => [...new Set([...current, image.storage_path])]);
    if (primaryKey === image.id) setPrimaryKey(remaining[0]?.id || pendingImages[0]?.key || "");
  };
  const removePendingImage = (key: string) => {
    const target = pendingImages.find((image) => image.key === key); if (target) URL.revokeObjectURL(target.previewUrl);
    const remaining = pendingImages.filter((image) => image.key !== key); setPendingImages(remaining);
    if (primaryKey === key) setPrimaryKey(images[0]?.id || remaining[0]?.key || "");
  };

  const addOption = () => setOptions((current) => [...current, {
    id: crypto.randomUUID(), product_id: editingId || "", type: "text", label: "", description: "", required: false,
    choices: [], max_length: 100, sort_order: current.length, active: true,
    is_addon: false, price_adjustment: 0, color_slots: 0, color_slot_labels: [],
  }]);
  const addAddon = () => setOptions((current) => [...current, {
    id: crypto.randomUUID(), product_id: editingId || "", type: "text", label: "Nieuwe add-on", description: "", required: false,
    choices: [], max_length: 100, sort_order: current.length, active: true, is_addon: true, price_adjustment: 0, color_slots: 1, color_slot_labels: ["Kleur add-on"],
  }]);
  const updateOption = (id: string, patch: Partial<ProductOption>) => setOptions((current) => current.map((option) => option.id === id ? { ...option, ...patch } : option));
  const addVariant = () => setVariants((current) => [...current, {
    id: crypto.randomUUID(), product_id: editingId || "", name: "", sku: null, size_label: null,
    material_id: null, price_adjustment: 0, active: true, sort_order: current.length,
  }]);
  const updateVariant = (id: string, patch: Partial<ProductVariant>) => setVariants((current) => current.map((variant) => variant.id === id ? { ...variant, ...patch } : variant));

  const validateProduct = () => {
    if (!form.name.trim()) return "Vul een productnaam in.";
    if (!Number.isFinite(form.price) || form.price <= 0) return "Vul een geldige prijs groter dan €0 in.";
    if (form.material_mode !== "all" && form.materials.length === 0) return "Selecteer minimaal één materiaal.";
    if (form.material_mode === "fixed" && form.materials.length !== 1) return "Kies precies één vast materiaal.";
    if (form.color_required && selectedColorIds.length === 0) return "Selecteer minimaal één beschikbare kleur.";
    if (selectedColorIds.some((id) => !availableColors.some((color) => color.id === id))) return "Een geselecteerde kleur past niet bij de gekozen materialen.";
    if (form.color_selection_mode === "multiple" && (form.max_colors < 2 || form.max_colors > 12)) return "Het maximum aantal kleuren moet tussen 2 en 12 liggen.";
    for (const option of options) {
      if (!option.label.trim()) return "Iedere extra optie heeft een label nodig.";
      if (["select", "radio"].includes(option.type) && option.choices.filter((choice) => choice.trim()).length < 2) return `Voeg minimaal twee keuzes toe bij “${option.label}”.`;
      if (["text", "textarea"].includes(option.type) && option.max_length !== null && (!Number.isInteger(option.max_length) || option.max_length < 1 || option.max_length > 5000)) return `Kies bij “${option.label}” een tekstlimiet tussen 1 en 5000.`;
      if (option.is_addon && Array.from({ length: option.color_slots }).some((_, index) => !option.color_slot_labels[index]?.trim())) return `Geef ieder kleurvak van add-on “${option.label}” een naam.`;
    }
    if (variants.some((variant) => !variant.name.trim())) return "Iedere productvariant heeft een naam nodig.";
    if (new Set(variants.map((variant) => variant.name.trim().toLowerCase())).size !== variants.length) return "Variantnamen moeten uniek zijn.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validateProduct();
    if (validationError) { toast({ title: "Product nog niet compleet", description: validationError, variant: "destructive" }); return; }
    setSaving(true);
    setMediaError("");
    setSaveStatus("Productgegevens opslaan…");
    let productId = editingId; let createdProduct = false; let imagesCommitted = false; const uploadedPaths: string[] = [];
    try {
      const payload = {
        name: form.name.trim(), description: form.description.trim(), price: form.price, category_id: form.category_id,
        materials: form.material_mode === "all" ? [] : form.materials, colors: selectedColorIds,
        material_mode: form.material_mode, material_fixed: form.material_mode === "fixed",
        color_selection_mode: form.color_selection_mode, color_required: form.color_required,
        colors_configured: true,
        max_colors: form.color_selection_mode === "single" ? 1 : form.max_colors,
        color_slot_labels: form.color_selection_mode === "multiple"
          ? Array.from({ length: form.max_colors }, (_, index) => (form.color_slot_labels[index] || "").trim())
          : [],
        multicolor_allowed: form.color_selection_mode === "multiple", custom_text_enabled: form.custom_text_enabled,
        custom_text_label: form.custom_text_label, custom_text_max_length: form.custom_text_max_length,
        customer_photo_required: form.customer_photo_required, active: form.active,
      };
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId); if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single(); if (error) throw error;
        productId = data.id; createdProduct = true;
      }
      const uploaded: Array<{ key: string; path: string; media_type: "image" | "video" }> = [];
      for (let mediaIndex = 0; mediaIndex < pendingImages.length; mediaIndex += 1) {
        const pending = pendingImages[mediaIndex];
        setSaveStatus(`${pending.file.name} uploaden (${mediaIndex + 1}/${pendingImages.length})…`);
        const path = `products/${productId}/${crypto.randomUUID()}-${sanitizeFilename(pending.file.name)}`;
        const uploadedFile = await uploadFileWithHeicConversion("orders", path, pending.file, { cacheControl: "3600", upsert: false });
        const { error } = uploadedFile;
        if (error) throw new Error(`Upload van ${pending.file.name} mislukt: ${error.message}`);
        uploadedPaths.push(uploadedFile.path); uploaded.push({ key: pending.key, path: uploadedFile.path, media_type: pending.media_type });
      }
      setSaveStatus("Productmedia koppelen…");
      const allImageRows = [
        ...images.map((image) => ({ key: image.id, path: image.storage_path, alt: image.alt_text, media_type: image.media_type || (isVideoProductMedia(image.storage_path) ? "video" as const : "image" as const) })),
        ...uploaded.map((image) => ({ key: image.key, path: image.path, alt: form.name.trim(), media_type: image.media_type })),
      ];
      const effectivePrimary = allImageRows.some((image) => image.key === primaryKey) ? primaryKey : allImageRows[0]?.key;
      const { error: deleteImagesError } = await supabase.from("product_images").delete().eq("product_id", productId); if (deleteImagesError) throw deleteImagesError;
      if (allImageRows.length) {
        const { error } = await supabase.from("product_images").insert(allImageRows.map((image, index) => ({ product_id: productId!, storage_path: image.path, alt_text: image.alt || form.name.trim(), media_type: image.media_type, sort_order: index, is_primary: image.key === effectivePrimary })));
        if (error) throw error;
      }
      imagesCommitted = true;
      const orderedPaths = [...allImageRows.filter((image) => image.key === effectivePrimary), ...allImageRows.filter((image) => image.key !== effectivePrimary)].map((image) => image.path);
      const { error: legacyPhotoError } = await supabase.from("products").update({ photos: orderedPaths }).eq("id", productId); if (legacyPhotoError) throw legacyPhotoError;
      const { error: deleteOptionsError } = await supabase.from("product_options").delete().eq("product_id", productId); if (deleteOptionsError) throw deleteOptionsError;
      if (options.length) {
        const { error } = await supabase.from("product_options").insert(options.map((option, index) => ({
          product_id: productId!, type: option.type, label: option.label.trim(), description: option.description.trim(), required: option.required,
          choices: option.choices.map((choice) => choice.trim()).filter(Boolean), max_length: ["text", "textarea"].includes(option.type) ? option.max_length : null, sort_order: index, active: true,
          is_addon: option.is_addon, price_adjustment: Number(option.price_adjustment) || 0, color_slots: option.is_addon ? option.color_slots : 0, color_slot_labels: option.is_addon ? option.color_slot_labels : [],
        })));
        if (error) throw error;
      }
      const { error: deleteVariantsError } = await supabase.from("product_variants").delete().eq("product_id", productId); if (deleteVariantsError) throw deleteVariantsError;
      if (variants.length) {
        const { error } = await supabase.from("product_variants").insert(variants.map((variant, index) => ({
          product_id: productId!, name: variant.name.trim(), sku: variant.sku?.trim() || null,
          size_label: variant.size_label?.trim() || null, material_id: variant.material_id || null,
          price_adjustment: Number(variant.price_adjustment) || 0, active: variant.active, sort_order: index,
        })));
        if (error) throw error;
      }
      const { error: deleteAvailabilityError } = await supabase.from("product_color_availability").delete().eq("product_id", productId); if (deleteAvailabilityError) throw deleteAvailabilityError;
      if (selectedColorIds.length) {
        const { error } = await supabase.from("product_color_availability").insert(selectedColorIds.map((colorId) => ({ product_id: productId!, color_id: colorId, available: true })));
        if (error) throw error;
      }
      const managedRemovedPaths = removedPaths.map(normalizeProductStoragePath).filter(Boolean) as string[];
      if (managedRemovedPaths.length) {
        const { error } = await supabase.storage.from("orders").remove(managedRemovedPaths);
        if (error) throw new Error(`Product opgeslagen, maar oude afbeeldingen verwijderen mislukte: ${error.message}`);
      }
      const previousProduct = products.find((product) => product.id === editingId);
      const availabilityChanged = previousProduct && previousProduct.active !== form.active;
      if ((createdProduct && form.active) || availabilityChanged) {
        const newsletter = await sendAutomaticNewsletters([{ templateKind: "article", changeType: form.active ? "new" : "removed", itemName: form.name.trim(), details: form.description.trim(), itemUrl: `${window.location.origin}/opdrachten` }]);
        if (newsletter.errors.length) toast({ title: "Product opgeslagen, nieuwsbrief mislukt", description: newsletter.errors[0], variant: "destructive" });
      }
      toast({ title: editingId ? "Product bijgewerkt" : "Product aangemaakt", description: "Alle productinstellingen zijn opgeslagen." });
      resetEditor(); await fetchCatalog();
    } catch (error) {
      if (uploadedPaths.length && (createdProduct || !imagesCommitted)) await supabase.storage.from("orders").remove(uploadedPaths);
      if (createdProduct && productId) await supabase.from("products").delete().eq("id", productId);
      const message = error instanceof Error ? error.message : "Onbekende databasefout.";
      setMediaError(message);
      toast({ title: "Opslaan mislukt", description: message, variant: "destructive" });
    } finally { setSaving(false); setSaveStatus(""); }
  };

  const handleDeleteProduct = async (product: CatalogProduct) => {
    const paths = orderedProductImages(product).map((image) => normalizeProductStoragePath(image.storage_path)).filter(Boolean) as string[];
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) { toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" }); return; }
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from("orders").remove(paths);
      if (storageError) toast({ title: "Product verwijderd", description: "Enkele opslagbestanden konden niet worden verwijderd.", variant: "destructive" });
      else toast({ title: "Product en afbeeldingen verwijderd" });
    } else toast({ title: "Product verwijderd" });
    const newsletter = await sendAutomaticNewsletters([{ templateKind: "article", changeType: "removed", itemName: product.name, details: product.description, itemUrl: `${window.location.origin}/opdrachten` }]);
    if (newsletter.errors.length) toast({ title: "Product verwijderd, nieuwsbrief mislukt", description: newsletter.errors[0], variant: "destructive" });
    fetchCatalog();
  };
  const toggleProductActive = async (product: CatalogProduct) => {
    const { error } = await supabase.from("products").update({ active: !product.active }).eq("id", product.id);
    if (error) toast({ title: "Wijzigen mislukt", description: error.message, variant: "destructive" });
    else {
      const newsletter = await sendAutomaticNewsletters([{ templateKind: "article", changeType: product.active ? "removed" : "new", itemName: product.name, details: product.description, itemUrl: `${window.location.origin}/opdrachten` }]);
      if (newsletter.errors.length) toast({ title: "Product gewijzigd, nieuwsbrief mislukt", description: newsletter.errors[0], variant: "destructive" });
      toast({ title: product.active ? "Product verborgen" : "Product zichtbaar gemaakt" }); fetchCatalog();
    }
  };

  const resetCategoryForm = () => { setEditingCategoryId(null); setCategoryName(""); setCategoryDescription(""); setCategorySortOrder(0); setCategoryActive(true); };
  const handleSaveCategory = async () => {
    if (!categoryName.trim()) { toast({ title: "Vul een categorienaam in", variant: "destructive" }); return; }
    if (categories.some((category) => category.id !== editingCategoryId && category.name.toLowerCase() === categoryName.trim().toLowerCase())) {
      toast({ title: "Deze categorie bestaat al", variant: "destructive" });
      return;
    }
    setSavingCategory(true);
    const payload = { name: categoryName.trim(), description: categoryDescription.trim(), sort_order: categorySortOrder, active: categoryActive };
    const result = editingCategoryId ? await supabase.from("product_categories").update(payload).eq("id", editingCategoryId) : await supabase.from("product_categories").insert(payload);
    setSavingCategory(false);
    if (result.error) { toast({ title: "Categorie opslaan mislukt", description: result.error.message, variant: "destructive" }); return; }
    toast({ title: editingCategoryId ? "Categorie bijgewerkt" : "Categorie aangemaakt" }); resetCategoryForm(); fetchCatalog();
  };
  const editCategory = (category: ProductCategory) => { setEditingCategoryId(category.id); setCategoryName(category.name); setCategoryDescription(category.description || ""); setCategorySortOrder(category.sort_order); setCategoryActive(category.active); };
  const deleteCategory = async (category: ProductCategory) => {
    const { error } = await supabase.from("product_categories").delete().eq("id", category.id);
    if (error) toast({ title: "Categorie verwijderen mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Categorie verwijderd" }); if (editingCategoryId === category.id) resetCategoryForm(); fetchCatalog(); }
  };

  if (authLoading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin" /></main><Footer /></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center">Geen toegang.</main><Footer /></div>;

  return (
    <div className="min-h-screen"><Navbar /><main className="pt-24 pb-16"><div className="container mx-auto px-4 max-w-6xl">
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button>
        <h1 className="text-2xl font-bold text-primary">Kant-en-klare producten</h1>
        <Button className="ml-auto" onClick={openNew}><Plus className="w-4 h-4" /> Nieuw product</Button>
      </div>

      <section className="bg-card rounded-2xl border border-border/60 p-5 mb-8">
        <h2 className="font-bold text-primary mb-1">Categorieën</h2><p className="text-sm text-muted-foreground mb-4">Beheer de dynamische indeling die klanten in de productcatalogus zien.</p>
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="grid sm:grid-cols-[1fr_110px] gap-3"><div><Label>Naam *</Label><Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Bijv. Decoratie" /></div><div><Label>Volgorde</Label><Input type="number" value={categorySortOrder} onChange={(event) => setCategorySortOrder(Number(event.target.value) || 0)} /></div></div>
            <div><Label>Omschrijving</Label><Input value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="Korte uitleg voor deze categorie" /></div>
            <div className="flex items-center gap-2"><Switch checked={categoryActive} onCheckedChange={setCategoryActive} /><Label>Actief</Label></div>
            <div className="flex gap-2"><Button size="sm" onClick={handleSaveCategory} disabled={savingCategory}>{savingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editingCategoryId ? "Bijwerken" : "Categorie toevoegen"}</Button>{editingCategoryId && <Button size="sm" variant="outline" onClick={resetCategoryForm}>Annuleren</Button>}</div>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {categories.length === 0 && <p className="text-sm text-muted-foreground">Nog geen categorieën.</p>}
            {categories.map((category) => <div key={category.id} className={`flex items-center gap-2 rounded-xl border p-3 ${category.active ? "" : "opacity-60"}`}><div className="min-w-0 flex-1"><p className="font-medium truncate">{category.name}</p><p className="text-xs text-muted-foreground truncate">{category.description || `Volgorde ${category.sort_order}`}</p></div><Button variant="ghost" size="sm" onClick={() => editCategory(category)} aria-label={`${category.name} bewerken`}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: "category", value: category })} aria-label={`${category.name} verwijderen`}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>)}
          </div>
        </div>
      </section>

      {showEditor && <section className="bg-card rounded-2xl border border-border/60 p-6 mb-8 space-y-7">
        <div className="flex items-center justify-between"><h2 className="font-bold text-primary">{editingId ? "Product bewerken" : "Nieuw product"}</h2><Button variant="ghost" size="sm" onClick={resetEditor}><X className="w-4 h-4" /> Sluiten</Button></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div><Label>Naam *</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div><Label>Prijs (€) *</Label><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></div>
          <div className="md:col-span-2"><Label>Beschrijving</Label><Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          <div><Label>Categorie</Label><Select value={form.category_id || "none"} onValueChange={(value) => setForm({ ...form, category_id: value === "none" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Geen categorie</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}{!category.active ? " (inactief)" : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end gap-2 pb-2"><Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /><Label>Zichtbaar voor klanten</Label></div>
        </div>

        <div><Label>Productmedia</Label><p className="text-xs text-muted-foreground mb-3">Kies afbeeldingen of video's. Ze worden geüpload wanneer u het product opslaat; klik op de ster om de hoofdmedia te kiezen.</p><div className="flex flex-wrap gap-3">
          {images.map((image) => <div key={image.id} className={`relative w-28 h-28 rounded-xl overflow-hidden border-2 ${primaryKey === image.id ? "border-accent" : "border-border"}`}><SignedMedia path={image.storage_path} mediaType={image.media_type} alt={form.name} className="w-full h-full object-cover" /><button type="button" onClick={() => setPrimaryKey(image.id)} className="absolute left-1 top-1 rounded-full bg-card/95 p-1" aria-label="Instellen als hoofdmedia"><Star className={`w-4 h-4 ${primaryKey === image.id ? "fill-accent text-accent" : ""}`} /></button><button type="button" onClick={() => removeExistingImage(image)} className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground" aria-label="Media verwijderen"><X className="w-4 h-4" /></button>{isVideoProductMedia(image.storage_path, image.media_type) && <Video className="absolute bottom-1 left-1 w-4 h-4 text-white drop-shadow" />}</div>)}
          {pendingImages.map((image) => <div key={image.key} className={`relative w-28 overflow-hidden rounded-xl border-2 bg-card ${primaryKey === image.key ? "border-accent" : "border-border"}`}><div className="relative h-24 overflow-hidden">{image.media_type === "video" ? <video src={image.previewUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : <img src={image.previewUrl} alt={image.file.name} className="w-full h-full object-cover" />}<button type="button" onClick={() => setPrimaryKey(image.key)} className="absolute left-1 top-1 rounded-full bg-card/95 p-1" aria-label="Instellen als hoofdmedia"><Star className={`w-4 h-4 ${primaryKey === image.key ? "fill-accent text-accent" : ""}`} /></button><button type="button" onClick={() => removePendingImage(image.key)} className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground" aria-label="Media verwijderen"><X className="w-4 h-4" /></button>{image.media_type === "video" && <Video className="absolute bottom-1 left-1 w-4 h-4 text-white drop-shadow" />}</div><p className="truncate px-2 py-1 text-[10px]" title={image.file.name}>{image.file.name}</p></div>)}
          <label className={`relative w-28 h-28 overflow-hidden rounded-xl border-2 border-dashed flex flex-col items-center justify-center hover:border-accent/60 ${processingMedia ? "cursor-wait opacity-60" : "cursor-pointer"}`}><ImagePlus className="w-5 h-5" /><span className="text-xs mt-1">{processingMedia ? "Verwerken…" : "Media kiezen"}</span><input type="file" multiple disabled={processingMedia || saving} accept="image/*,video/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Productmedia kiezen" onClick={(event) => { event.currentTarget.value = ""; }} onChange={async (event) => { const selected = Array.from(event.currentTarget.files || []); await handleImageInput(selected); }} /></label>
        </div>{mediaError && <div role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><p className="font-semibold">Media verwerken of uploaden mislukt</p><p className="mt-1 break-words">{mediaError}</p></div>}</div>

        <div className="grid lg:grid-cols-2 gap-6 border-t pt-6">
          <div><Label>Materiaalkeuze</Label><Select value={form.material_mode} onValueChange={(value) => setMaterialMode(value as MaterialMode)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Vast materiaal</SelectItem><SelectItem value="selected">Klant kiest uit geselecteerde materialen</SelectItem><SelectItem value="all">Klant kiest uit alle materialen</SelectItem></SelectContent></Select>{form.material_mode !== "all" && <div className="flex flex-wrap gap-2 mt-3">{MATERIALS.map((material) => <button type="button" key={material.id} onClick={() => toggleMaterial(material.id)} className={`px-3 py-1.5 text-sm rounded-full border ${form.materials.includes(material.id) ? "bg-accent text-accent-foreground border-accent" : ""}`}>{material.name}</button>)}</div>}{form.material_mode === "fixed" && <p className="text-xs text-muted-foreground mt-2">De klant ziet het gekozen materiaal, maar kan dit niet aanpassen.</p>}</div>
          <div>
            <div className="flex items-center gap-2"><Switch checked={form.color_required} onCheckedChange={(color_required) => setForm({ ...form, color_required })} /><Label>Elk ingesteld kleurvak verplicht</Label></div>
            <div className="mt-3"><Label>Kleurkeuze</Label><Select value={form.color_selection_mode} onValueChange={(value) => setForm({ ...form, color_selection_mode: value as "single" | "multiple", max_colors: value === "single" ? 1 : Math.max(2, form.max_colors) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Eén kleur</SelectItem><SelectItem value="multiple">Meerdere kleuren (multicolor)</SelectItem></SelectContent></Select></div>
            {form.color_selection_mode === "multiple" && <div className="mt-3 space-y-3">
              <div><Label>Aantal kleurposities</Label><Input type="number" min={2} max={12} value={form.max_colors} onChange={(event) => setForm({ ...form, max_colors: Math.min(12, Math.max(2, Number(event.target.value) || 2)) })} /></div>
              <div>
                <Label>Waarvoor is iedere kleur?</Label>
                <p className="text-xs text-muted-foreground mb-2">Deze labels ziet de klant bij het kiezen en later in de bestelling.</p>
                <div className="space-y-2">
                  {Array.from({ length: form.max_colors }, (_, index) => <div key={index} className="grid grid-cols-[5rem_1fr] items-center gap-2">
                    <span className="text-sm font-medium">Kleur {index + 1}</span>
                    <Input value={form.color_slot_labels[index] || ""} onChange={(event) => setForm((current) => {
                      const color_slot_labels = [...current.color_slot_labels];
                      color_slot_labels[index] = event.target.value;
                      return { ...current, color_slot_labels };
                    })} placeholder={index === 0 ? "Bijv. bloemblaadjes" : index === 1 ? "Bijv. steel" : "Bijv. details"} />
                  </div>)}
                </div>
              </div>
            </div>}
          </div>
        </div>

        <div><Label>Beschikbare kleuren *</Label><p className="text-xs text-muted-foreground mb-3">Kleuren komen uit Kleurenbeheer en worden per product opgeslagen.</p>{availableColors.length === 0 ? <p className="text-sm text-destructive">Geen actieve kleuren beschikbaar voor de gekozen materialen. Voeg eerst kleuren toe via Kleurenbeheer.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">{availableColors.map((color) => <label key={color.id} className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer"><Checkbox checked={selectedColorIds.includes(color.id)} onCheckedChange={() => toggleColor(color.id)} /><span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }} /><span className="text-sm truncate">{color.name} <span className="text-muted-foreground">({color.material})</span></span></label>)}</div>}</div>

        <div className="border-t pt-6"><div className="flex flex-wrap items-center gap-3 mb-3"><div><Label>Productvarianten</Label><p className="text-xs text-muted-foreground">Formaten, uitvoeringen, materiaal en prijsverschil per variant.</p></div><Button type="button" variant="outline" size="sm" className="ml-auto" onClick={addVariant}><Plus className="w-4 h-4" /> Variant toevoegen</Button></div><div className="space-y-3">
          {variants.map((variant, index) => <div key={variant.id} className="rounded-xl border p-4 grid md:grid-cols-5 gap-3"><div><Label>Naam *</Label><Input value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} placeholder="Bijv. Groot" /></div><div><Label>Formaat</Label><Input value={variant.size_label || ""} onChange={(event) => updateVariant(variant.id, { size_label: event.target.value })} placeholder="20 × 20 cm" /></div><div><Label>Materiaal</Label><Select value={variant.material_id || "default"} onValueChange={(value) => updateVariant(variant.id, { material_id: value === "default" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Productkeuze</SelectItem>{MATERIALS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Prijsverschil (€)</Label><Input type="number" step="0.01" value={variant.price_adjustment} onChange={(event) => updateVariant(variant.id, { price_adjustment: Number(event.target.value) || 0 })} /></div><div className="flex items-end gap-2"><Switch checked={variant.active} onCheckedChange={(active) => updateVariant(variant.id, { active })} /><Label>Actief</Label><Button type="button" variant="ghost" size="sm" onClick={() => setVariants((current) => current.filter((item) => item.id !== variant.id))}><Trash2 className="w-4 h-4 text-destructive" /></Button></div><div className="md:col-span-5 text-xs text-muted-foreground">Variant {index + 1}</div></div>)}
          {variants.length === 0 && <p className="text-sm text-muted-foreground">Geen varianten: het product gebruikt de standaardprijs.</p>}
        </div></div>

        <div className="border-t pt-6"><div className="flex flex-wrap items-center gap-3 mb-3"><div><Label>Extra keuzes, personalisatie en add-ons</Label><p className="text-xs text-muted-foreground">Een add-on begint voor de klant altijd met een directe ja/nee-keuze.</p></div><div className="ml-auto flex gap-2"><Button type="button" variant="outline" size="sm" onClick={addOption}><Plus className="w-4 h-4" /> Optie</Button><Button type="button" size="sm" onClick={addAddon}><Plus className="w-4 h-4" /> Add-on</Button></div></div><div className="space-y-4">
          {options.filter((option) => option.is_addon).map((option) => <div key={`addon-${option.id}`} className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4 grid md:grid-cols-3 gap-3"><div><Label>Add-onprijs (€)</Label><Input type="number" min={0} step="0.01" value={option.price_adjustment} onChange={(event) => updateOption(option.id, { price_adjustment: Number(event.target.value) || 0 })} /></div><div><Label>Verplichte kleurvakken</Label><Input type="number" min={0} max={12} value={option.color_slots} onChange={(event) => { const color_slots = Math.min(12, Math.max(0, Number(event.target.value) || 0)); updateOption(option.id, { color_slots, color_slot_labels: Array.from({ length: color_slots }, (_, index) => option.color_slot_labels[index] || `Kleur ${index + 1}`) }); }} /></div><div className="md:col-span-3 grid sm:grid-cols-2 gap-2">{Array.from({ length: option.color_slots }, (_, index) => <div key={index}><Label>Naam kleurvak {index + 1} *</Label><Input value={option.color_slot_labels[index] || ""} onChange={(event) => { const color_slot_labels = [...option.color_slot_labels]; color_slot_labels[index] = event.target.value; updateOption(option.id, { color_slot_labels }); }} /></div>)}</div></div>)}
          {options.map((option, index) => <div key={option.id} className="rounded-xl border p-4 grid md:grid-cols-2 gap-3"><div><Label>Type</Label><Select value={option.type} onValueChange={(type) => updateOption(option.id, { type: type as ProductOptionType, choices: ["select", "radio"].includes(type) ? option.choices : [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{optionTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Label *</Label><Input value={option.label} onChange={(event) => updateOption(option.id, { label: event.target.value })} placeholder="Bijv. Tekst op voorkant" /></div><div className="md:col-span-2"><Label>Uitleg voor de klant</Label><Input value={option.description} onChange={(event) => updateOption(option.id, { description: event.target.value })} placeholder="Bijv. Welke tekst moet op de voorkant?" /></div>{["select", "radio"].includes(option.type) && <div className="md:col-span-2"><Label>Keuzes (één per regel)</Label><Textarea rows={3} value={option.choices.join("\n")} onChange={(event) => updateOption(option.id, { choices: event.target.value.split("\n") })} placeholder={"Klein\nMiddel\nGroot"} /></div>}{["text", "textarea"].includes(option.type) && <div><Label>Maximaal tekens</Label><Input type="number" min={1} max={5000} value={option.max_length || ""} onChange={(event) => updateOption(option.id, { max_length: Number(event.target.value) || null })} /></div>}<div className="flex items-end gap-2"><Switch checked={option.required} onCheckedChange={(required) => updateOption(option.id, { required })} /><Label>Verplicht</Label></div><div className="md:col-span-2 flex justify-between items-center"><span className="text-xs text-muted-foreground">Optie {index + 1}</span><Button type="button" variant="ghost" size="sm" onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))}><Trash2 className="w-4 h-4 text-destructive" /> Verwijderen</Button></div></div>)}
          {options.length === 0 && <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4">Geen extra opties. Klanten kiezen alleen materiaal, kleur en aantal.</p>}
        </div></div>
        <div className="flex items-center gap-2"><Switch checked={form.customer_photo_required} onCheckedChange={(customer_photo_required) => setForm({ ...form, customer_photo_required })} /><Label>Altijd minimaal één klantfoto verplichten</Label></div>
        <div><div className="flex gap-3"><Button onClick={handleSave} disabled={saving || processingMedia}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editingId ? "Product bijwerken" : "Product aanmaken"}</Button><Button variant="outline" onClick={resetEditor} disabled={saving || processingMedia}>Annuleren</Button></div>{saveStatus && <p className="mt-2 text-sm text-muted-foreground" role="status">{saveStatus}</p>}</div>
      </section>}

      {loading ? <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin" /></div> : products.length === 0 ? <p className="text-center text-muted-foreground py-12">Nog geen producten.</p> : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{products.map((product) => { const mainImage = orderedProductImages(product)[0]; return <article key={product.id} className={`bg-card rounded-2xl border overflow-hidden ${product.active ? "" : "opacity-60"}`}><div className="aspect-[4/3] bg-muted">{mainImage ? <SignedMedia path={mainImage.storage_path} mediaType={mainImage.media_type} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">Geen media</div>}</div><div className="p-4"><div className="flex gap-2 items-start"><div className="min-w-0 flex-1"><h3 className="font-bold text-primary truncate">{product.name}</h3><p className="text-accent font-semibold">€{Number(product.price).toFixed(2)}</p></div><Button variant="ghost" size="sm" onClick={() => toggleProductActive(product)} aria-label={product.active ? "Verbergen" : "Tonen"}>{product.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</Button></div><p className="text-xs text-muted-foreground mt-2">{product.product_categories?.name || "Zonder categorie"} · {product.product_options?.length || 0} extra opties · {product.colors.length} kleuren</p><div className="flex gap-2 mt-4"><Button size="sm" variant="outline" onClick={() => openEdit(product)}><Pencil className="w-4 h-4" /> Bewerken</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ type: "product", value: product })}><Trash2 className="w-4 h-4 text-destructive" /></Button></div></div></article>; })}</div>}
    </div></main><Footer />
      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.type === "product" ? "Product verwijderen?" : "Categorie verwijderen?"}
        description={deleteTarget?.type === "product"
          ? `“${deleteTarget.value.name}” en de bijbehorende productfoto's worden definitief verwijderd.`
          : `“${deleteTarget?.value.name || "Deze categorie"}” wordt verwijderd. Producten blijven bestaan zonder categorie.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={async () => {
          if (deleteTarget?.type === "product") await handleDeleteProduct(deleteTarget.value);
          if (deleteTarget?.type === "category") await deleteCategory(deleteTarget.value);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
