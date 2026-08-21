import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Check, Loader2, AlertCircle, Trash2, FileText, Plus, Info, Link2, Pencil, Camera, ShoppingBag, Tag, ShoppingCart, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { MATERIALS, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants";
import { isHeicFile, prepareImageFileForUpload, uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { parse3DFile, estimatePrintWeight } from "@/lib/stlParser";
import { ProductTile } from "@/components/ProductTile";
import { PrebuiltOptions, ProductDetailDialog } from "@/components/ProductDetailDialog";
import { OrderAuthGate } from "@/components/OrderAuthGate";
import { ModelViewer } from "@/components/ModelViewer";
import {
  availableFilamentColorsForMaterial,
  CatalogOrderItem,
  CatalogProduct,
  FilamentColor,
  ProductOptionAnswer,
} from "@/lib/productCatalog";
import { createOrderConfirmationRequest } from "@/lib/orderConfirmation";

type ProductItem = CatalogProduct;

type FileLine = {
  kind: "file";
  id: string;
  file: File;
  material: string;
  color: string;
  quantity: number;
  estimatedGrams?: number;
  volumeCm3?: number;
  dimensions?: { width: number; height: number; depth: number };
  parsing?: boolean;
};

type LinkLine = {
  kind: "link";
  id: string;
  url: string;
  material: string;
  color: string;
  quantity: number;
};

type PrebuiltLine = {
  kind: "prebuilt";
  id: string;
  productId: string;
  name: string;
  materialId: string;
  material: string;
  color: string;
  colors: Array<{ id: string; name: string; hex: string }>;
  quantity: number;
  price: number; // total for this line
  unitPrice: number;
  optionAnswers: ProductOptionAnswer[];
  optionFiles: Array<{ optionId: string; label: string; files: File[] }>;
};

type CustomLine = {
  kind: "custom";
  id: string;
  description: string;
  photos: File[];
};

type CartLine = FileLine | LinkLine | PrebuiltLine | CustomLine;

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function NewOrder() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [catalogColors, setCatalogColors] = useState<FilamentColor[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [activeTab, setActiveTab] = useState<"link" | "file" | "prebuilt" | "custom">("link");

  // Unified cart
  const [cart, setCart] = useState<CartLine[]>([]);

  // Draft inputs per tab (before adding to cart)
  const [draftLink, setDraftLink] = useState<{ url: string; material: string; color: string; quantity: number }>({
    url: "", material: "", color: "", quantity: 1,
  });
  const [draftFiles, setDraftFiles] = useState<FileLine[]>([]);
  const [draftCustom, setDraftCustom] = useState<{ description: string; photos: File[] }>({
    description: "", photos: [],
  });

  // Discount
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ type: string; value: number; code: string } | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    name: profile?.full_name || "",
    email: profile?.email || user?.email || "",
    phone: profile?.phone || "",
    company_name: profile?.company_name || "",
    billing_address: profile?.billing_address || "",
    shipping_address: profile?.shipping_address || "",
    postal_code: profile?.postal_code || "",
    city: profile?.city || "",
    country: profile?.country || "Nederland",
    notes: "",
    print_preferences: "",
    agreeTerms: false,
  });

  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        name: profile.full_name || prev.name,
        email: profile.email || prev.email,
        phone: profile.phone || prev.phone,
        company_name: profile.company_name || prev.company_name,
        billing_address: profile.billing_address || prev.billing_address,
        shipping_address: profile.shipping_address || prev.shipping_address,
        postal_code: profile.postal_code || prev.postal_code,
        city: profile.city || prev.city,
        country: profile.country || prev.country,
      }));
    }
  }, [profile]);

  useEffect(() => {
    Promise.all([
      supabase.from("products").select("*, product_categories(*), product_images(*), product_options(*)").eq("active", true),
      supabase.from("filament_colors").select("*").eq("active", true).order("material").order("sort_order"),
      supabase.from("product_color_availability").select("product_id,color_id,available"),
    ]).then(([productResult, colorResult, availabilityResult]) => {
      const availability = availabilityResult.data || [];
      setProducts(((productResult.data || []) as unknown as ProductItem[]).map((product) => {
        const productAvailability = availability.filter((row) => row.product_id === product.id);
        return {
          ...product,
          product_images: [...(product.product_images || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order),
          product_options: [...(product.product_options || [])].sort((a, b) => a.sort_order - b.sort_order),
          colors: productAvailability.length ? productAvailability.filter((row) => row.available).map((row) => row.color_id) : product.colors,
        };
      }));
      setCatalogColors((colorResult.data || []) as unknown as FilamentColor[]);
      const error = productResult.error || colorResult.error || availabilityResult.error;
      if (error) toast({ title: "Productcatalogus laden mislukt", description: error.message, variant: "destructive" });
    });
  }, [toast]);

  const getColorsForMaterial = (materialId: string) =>
    availableFilamentColorsForMaterial(catalogColors, materialId);

  const MULTICOLOR_ID = "multicolor";
  const MULTICOLOR_LABEL = "Multicolor (meerdere kleuren)";
  const colorLabel = (materialId: string, colorId: string) =>
    colorId === MULTICOLOR_ID
      ? MULTICOLOR_LABEL
      : getColorsForMaterial(materialId).find((c) => c.id === colorId)?.name || colorId;

  const MulticolorOption = () => (
    <SelectItem value={MULTICOLOR_ID}>
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full border"
          style={{ background: "conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#a855f7,#ef4444)" }}
        />
        {MULTICOLOR_LABEL}
      </div>
    </SelectItem>
  );

  // ===== File draft handling =====
  const ALLOWED_EXTENSIONS = [".stl", ".obj", ".3mf", ".step", ".stp"];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validExt = files.filter((f) => ALLOWED_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf("."))));
    const invalidExt = files.filter((f) => !ALLOWED_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf("."))));
    if (invalidExt.length) {
      toast({
        title: "Ongeldig bestandstype",
        description: `Alleen STL, OBJ, 3MF, STEP. ${invalidExt.map((f) => f.name).join(", ")} overgeslagen.`,
        variant: "destructive",
      });
    }
    const tooLarge = validExt.filter((f) => f.size > MAX_FILE_SIZE);
    if (tooLarge.length) {
      toast({
        title: "Bestand(en) te groot (max 10MB)",
        description: `${tooLarge.map((f) => f.name).join(", ")} — stuur deze via e-mail naar gijsoverweel@gmail.com`,
        variant: "destructive",
      });
    }
    const acceptable = validExt.filter((f) => f.size <= MAX_FILE_SIZE);
    const newLines: FileLine[] = acceptable.map((file) => ({
      kind: "file", id: uid(), file, material: "", color: "", quantity: 1, parsing: true,
    }));
    setDraftFiles((prev) => [...prev, ...newLines]);
    newLines.forEach((nl) => {
      parse3DFile(nl.file).then((result) => {
        setDraftFiles((prev) => prev.map((d) =>
          d.id !== nl.id ? d : result
            ? { ...d, volumeCm3: result.volumeCm3, estimatedGrams: estimatePrintWeight(result.volumeCm3), dimensions: result.boundingBox, parsing: false }
            : { ...d, estimatedGrams: Math.max(10, Math.round(nl.file.size / 1024)), parsing: false }
        ));
      }).catch(() => {
        setDraftFiles((prev) => prev.map((d) => d.id === nl.id ? { ...d, parsing: false, estimatedGrams: Math.max(10, Math.round(nl.file.size / 1024)) } : d));
      });
    });
    e.target.value = "";
  };

  const updateDraftFile = <K extends keyof FileLine>(id: string, field: K, value: FileLine[K]) => {
    setDraftFiles((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, [field]: value } as FileLine;
      if (field === "material") next.color = "";
      return next;
    }));
  };

  const removeDraftFile = (id: string) => setDraftFiles((prev) => prev.filter((d) => d.id !== id));

  const addDraftFilesToCart = () => {
    const ready = draftFiles.filter((f) => f.material && f.color && !f.parsing);
    const notReady = draftFiles.filter((f) => !ready.includes(f));
    if (ready.length === 0) {
      toast({ title: "Vul materiaal en kleur in", variant: "destructive" });
      return;
    }
    setCart((c) => [...c, ...ready]);
    setDraftFiles(notReady);
    toast({ title: `${ready.length} bestand(en) toegevoegd aan winkelmandje` });
  };

  // ===== Link draft =====
  const addDraftLinkToCart = () => {
    if (!draftLink.url || !draftLink.material || !draftLink.color) {
      toast({ title: "Vul URL, materiaal en kleur in", variant: "destructive" });
      return;
    }
    setCart((c) => [...c, { kind: "link", id: uid(), ...draftLink }]);
    setDraftLink({ url: "", material: "", color: "", quantity: 1 });
    toast({ title: "Downloadlink toegevoegd aan winkelmandje" });
  };

  // ===== Prebuilt =====
  const addPrebuiltToCart = (product: ProductItem, options: PrebuiltOptions) => {
    const color = options.colors.length ? options.colors.map((item) => item.name).join(" + ") : "Geen kleurkeuze";
    setCart((c) => [...c, {
      kind: "prebuilt", id: uid(), productId: product.id, name: product.name,
      materialId: options.materialId, material: options.material, color, colors: options.colors,
      quantity: options.quantity, unitPrice: product.price, price: product.price * options.quantity,
      optionAnswers: options.optionAnswers, optionFiles: options.optionFiles,
    }]);
    toast({ title: `${product.name} toegevoegd` });
    setSelectedProduct(null);
  };

  // ===== Custom draft =====
  const handleCustomPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []).filter((file) => file.type.startsWith("image/") || isHeicFile(file));
    e.target.value = "";
    try {
      const files = await Promise.all(incoming.map((file) => prepareImageFileForUpload(file)));
      setDraftCustom((p) => ({ ...p, photos: [...p.photos, ...files].slice(0, 5) }));
    } catch (error) {
      toast({ title: "HEIC-conversie mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    }
  };

  const addCustomToCart = () => {
    if (!draftCustom.description.trim()) {
      toast({ title: "Beschrijving is verplicht", variant: "destructive" });
      return;
    }
    setCart((c) => [...c, { kind: "custom", id: uid(), description: draftCustom.description, photos: draftCustom.photos }]);
    setDraftCustom({ description: "", photos: [] });
    toast({ title: "Custom opdracht toegevoegd" });
  };

  const removeCartLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  // ===== Totals =====
  const calcFilePrice = (f: FileLine) => {
    const mat = MATERIALS.find((m) => m.id === f.material);
    if (!mat || !f.estimatedGrams) return 0;
    return f.estimatedGrams * mat.pricePerGram * f.quantity;
  };

  const estimatedSubtotal = cart.reduce((sum, line) => {
    if (line.kind === "file") return sum + calcFilePrice(line);
    if (line.kind === "prebuilt") return sum + line.price;
    return sum; // link & custom: op offerte
  }, 0);

  const discountAmount = (() => {
    if (!discountApplied) return 0;
    if (discountApplied.type === "percentage") return estimatedSubtotal * (discountApplied.value / 100);
    return Math.min(estimatedSubtotal, discountApplied.value);
  })();

  const estimatedTotal = Math.max(0, estimatedSubtotal - discountAmount);
  const hasOnlyQuoteItems = cart.length > 0 && cart.every((l) => l.kind === "link" || l.kind === "custom");

  const applyDiscountCode = async () => {
    if (!discountCode.trim()) return;
    setCheckingDiscount(true);
    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("code", discountCode.toUpperCase().trim())
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) { toast({ title: "Ongeldige kortingscode", variant: "destructive" }); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { toast({ title: "Kortingscode is verlopen", variant: "destructive" }); return; }
      if (data.max_uses !== null && data.times_used >= data.max_uses) { toast({ title: "Kortingscode al maximaal gebruikt", variant: "destructive" }); return; }
      if (data.assigned_to_email && data.assigned_to_email.toLowerCase() !== (formData.email || "").toLowerCase()) {
        toast({ title: "Deze code is persoonlijk", description: "Deze kortingscode is niet geldig voor dit e-mailadres.", variant: "destructive" });
        return;
      }
      setDiscountApplied({ type: data.discount_type, value: Number(data.discount_value), code: data.code });
      toast({ title: `Kortingscode "${data.code}" toegepast! 🎉` });
    } catch {
      toast({ title: "Fout bij controleren code", variant: "destructive" });
    } finally { setCheckingDiscount(false); }
  };

  // ===== Submit =====
  const canProceed = cart.length > 0;
  const canSubmit = canProceed && formData.name && formData.email && formData.billing_address && formData.city && formData.postal_code && formData.agreeTerms;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const stagedStoragePaths: string[] = [];
    let orderCreated = false;
    try {
      const { data: orderNumData, error: orderNumError } = await supabase.rpc("generate_order_number");
      if (orderNumError) throw orderNumError;
      const orderNumber = orderNumData as string;

      // Build textual summary into file_links + notes
      const linkLines = cart.filter((l): l is LinkLine => l.kind === "link");
      const fileLines = cart.filter((l): l is FileLine => l.kind === "file");
      const prebuiltLines = cart.filter((l): l is PrebuiltLine => l.kind === "prebuilt");
      const customLines = cart.filter((l): l is CustomLine => l.kind === "custom");

      // Upload custom photos to storage
      const customSections: string[] = [];
      for (const cl of customLines) {
        const urls: string[] = [];
        for (const photo of cl.photos) {
          const safeName = photo.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
          const storagePath = `custom-orders/${orderNumber}/${cl.id}-${crypto.randomUUID()}-${safeName}`;
          const uploaded = await uploadFileWithHeicConversion("orders", storagePath, photo, { upsert: false });
          const { error } = uploaded;
          if (error) throw new Error(`Upload van ${photo.name} mislukt: ${error.message}`);
          urls.push(uploaded.path);
          stagedStoragePaths.push(uploaded.path);
        }
        customSections.push(`CUSTOM OPDRACHT\nBeschrijving: ${cl.description}${urls.length ? `\nFoto's: ${urls.join(", ")}` : ""}`);
      }

      // Persist a complete snapshot of configured ready-made products and answers.
      // Photo answers are uploaded first and their storage paths become part of the order snapshot.
      const catalogItems: CatalogOrderItem[] = [];
      for (const line of prebuiltLines) {
        const answers: ProductOptionAnswer[] = line.optionAnswers.map((answer) => ({ ...answer }));
        for (const upload of line.optionFiles) {
          const storagePaths: string[] = [];
          for (const file of upload.files) {
            const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
            const storagePath = `custom-orders/${orderNumber}/products/${line.id}/${crypto.randomUUID()}-${safeName}`;
            const uploaded = await uploadFileWithHeicConversion("orders", storagePath, file, { upsert: false });
            const { error } = uploaded;
            if (error) throw new Error(`Upload bij “${upload.label}” mislukt: ${error.message}`);
            storagePaths.push(uploaded.path);
            stagedStoragePaths.push(uploaded.path);
          }
          answers.push({
            optionId: upload.optionId,
            label: upload.label,
            type: "photo",
            value: `${storagePaths.length} foto${storagePaths.length === 1 ? "" : "'s"}`,
            files: storagePaths,
          });
        }
        catalogItems.push({
          productId: line.productId,
          productName: line.name,
          material: line.material,
          colors: line.colors,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          totalPrice: line.price,
          answers,
        });
      }

      const sections: string[] = [];
      if (linkLines.length) {
        sections.push("DOWNLOADLINKS:\n" + linkLines.map((l) => {
          const mat = MATERIALS.find((m) => m.id === l.material)?.name || l.material;
          const col = colorLabel(l.material, l.color);
          return `- ${l.url} (${mat} ${col} x${l.quantity})`;
        }).join("\n"));
      }
      if (prebuiltLines.length) {
        sections.push("KANT-EN-KLARE ARTIKELEN:\n" + prebuiltLines.map((p) =>
          `- ${p.name} x${p.quantity} – ${p.material} ${p.color} – €${p.price.toFixed(2)}${p.optionAnswers.length ? `\n  ${p.optionAnswers.map((answer) => `${answer.label}: ${String(answer.value)}`).join(" · ")}` : ""}`
        ).join("\n"));
      }
      if (customSections.length) sections.push(customSections.join("\n\n"));
      if (discountApplied) sections.push(`KORTING: ${discountApplied.code} (${discountApplied.type === "percentage" ? `${discountApplied.value}%` : `€${discountApplied.value.toFixed(2)}`})`);

      // Aggregated material / color / quantity for legacy columns
      const materialNames = cart.map((l) => {
        if (l.kind === "file" || l.kind === "link") return MATERIALS.find((m) => m.id === l.material)?.name || l.material;
        if (l.kind === "prebuilt") return l.material;
        return "Custom";
      }).filter(Boolean).join(", ");
      const colorNames = cart.map((l) => {
        if (l.kind === "file" || l.kind === "link") return colorLabel(l.material, l.color);
        if (l.kind === "prebuilt") return l.color;
        return "—";
      }).filter(Boolean).join(", ");
      const totalQuantity = cart.reduce((sum, line) => sum + (line.kind === "custom" ? 1 : line.quantity), 0);

      const orderMethod = cart.length === 1 ? cart[0].kind : "mixed";

      const orderPayload = {
        order_number: orderNumber,
        user_id: user?.id || null,
        customer_email: formData.email,
        customer_name: formData.name,
        phone: formData.phone,
        company_name: formData.company_name,
        billing_address: formData.billing_address,
        shipping_address: formData.shipping_address || formData.billing_address,
        postal_code: formData.postal_code,
        city: formData.city,
        country: formData.country,
        material: materialNames || "—",
        color: colorNames || "—",
        quantity: totalQuantity,
        notes: formData.notes,
        print_preferences: formData.print_preferences,
        instant_quote_price: estimatedTotal,
        file_links: sections.join("\n\n"),
        catalog_items: catalogItems,
        order_method: orderMethod,
        status: "submitted" as const,
      };

      let order: { id: string; customer_order_token: string };
      if (user) {
        const { data, error } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select("id, customer_order_token")
          .single();
        if (error) throw error;
        order = data;
      } else {
        // Guest RETURNING previously depended on an unsafe anon SELECT policy.
        // The SECURITY DEFINER RPC accepts a strict allow-list and returns only
        // the id plus high-entropy customer token.
        const { data, error } = await supabase.rpc("create_guest_order", {
          p_order: orderPayload as unknown as Json,
        });
        if (error) throw error;
        const guestOrder = data?.[0];
        if (!guestOrder) throw new Error("De bestelling kon niet worden aangemaakt.");
        order = guestOrder;
      }
      orderCreated = true;

      // Upload file lines
      const failedFiles: string[] = [];
      for (const fl of fileLines) {
        const safeName = fl.file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
        const storagePath = `${orderNumber}/files/${crypto.randomUUID()}-${safeName}`;
        const uploaded = await uploadFileWithHeicConversion("orders", storagePath, fl.file, { upsert: false });
        const { error: upErr } = uploaded;
        if (upErr) { failedFiles.push(fl.file.name); continue; }
        const { error: fileRowError } = await supabase.from("order_files").insert({
          order_id: order.id,
          storage_path: uploaded.path,
          original_filename: uploaded.file.name,
          file_size: uploaded.file.size,
          mime_type: uploaded.file.type || "application/octet-stream",
        });
        if (fileRowError) {
          await supabase.storage.from("orders").remove([uploaded.path]);
          failedFiles.push(fl.file.name);
        }
      }
      if (failedFiles.length) {
        toast({
          title: "Sommige bestanden konden niet worden geüpload",
          description: `${failedFiles.join(", ")} — stuur deze via e-mail naar gijsoverweel@gmail.com`,
          variant: "destructive",
        });
      }

      if (discountApplied) {
        const { error: usageError } = await supabase.rpc("increment_discount_usage", { code_text: discountApplied.code });
        if (usageError) console.error("Kortingsgebruik bijwerken mislukt:", usageError.message);
        try {
          const { error: referralError } = await supabase.functions.invoke("process-referral-reward", {
            body: { order_id: order.id, discount_code: discountApplied.code },
          });
          if (referralError) console.error("Referralverwerking mislukt:", referralError.message);
        } catch { /* Referral processing is best-effort after order creation. */ }
      }
      const { data: confirmationData, error: confirmationError } = await supabase.functions.invoke("send-order-email", {
        body: createOrderConfirmationRequest(order),
      });
      if (confirmationError || !confirmationData?.success) {
        toast({
          title: "Bestelling geplaatst, e-mail niet verzonden",
          description: confirmationError?.message || confirmationData?.error || "Neem contact op als u geen bevestiging ontvangt.",
          variant: "destructive",
        });
      }

      navigate(`/order/${order.customer_order_token}?success=true`);
    } catch (error: unknown) {
      if (!orderCreated && stagedStoragePaths.length) await supabase.storage.from("orders").remove(stagedStoragePaths);
      toast({ title: "Er ging iets mis", description: error instanceof Error ? error.message : "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===== Render helpers for cart sidebar =====
  const cartLineLabel = (line: CartLine) => {
    if (line.kind === "file") return line.file.name;
    if (line.kind === "link") return `Link: ${line.url.slice(0, 30)}${line.url.length > 30 ? "…" : ""}`;
    if (line.kind === "prebuilt") return line.name;
    return "Custom opdracht";
  };

  const cartLinePrice = (line: CartLine): string => {
    if (line.kind === "prebuilt") return `€${line.price.toFixed(2)}`;
    if (line.kind === "file") {
      const p = calcFilePrice(line);
      return p > 0 ? `~€${p.toFixed(2)}` : "op offerte";
    }
    return "op offerte";
  };

  return (
    <OrderAuthGate>
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-8">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Start uw bestelling</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Combineer downloadlinks, bestanden, kant-en-klare artikelen en custom opdrachten in één bestelling.
              </p>
            </motion.div>

            <div className="max-w-4xl mx-auto mb-8">
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Belangrijk:</strong> De indicatieprijs is slechts een schatting en nooit de definitieve prijs. De definitieve prijs wordt na controle vastgesteld. Minimale bestelwaarde is €5,- totaal.
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex justify-center mb-12">
              <div className="flex items-center gap-4">
                {[1, 2].map((s) => (
                  <div key={s} className="flex items-center">
                    <motion.div
                      animate={{ backgroundColor: step >= s ? "hsl(var(--accent))" : "hsl(var(--muted))", scale: step === s ? 1.1 : 1 }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ color: step >= s ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))" }}
                    >
                      {step > s ? <Check className="w-5 h-5" /> : s}
                    </motion.div>
                    {s < 2 && <div className={`w-16 md:w-24 h-1 mx-2 rounded-full transition-colors ${step > s ? "bg-accent" : "bg-muted"}`} />}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              <div className="lg:col-span-2">
                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                      <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                        <h2 className="text-lg font-bold mb-1">Voeg items toe aan uw bestelling</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                          U kunt items uit verschillende categorieën combineren in één winkelmandje.
                        </p>
                        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
                            <TabsTrigger value="link"><Link2 className="w-4 h-4 mr-1" /> Link</TabsTrigger>
                            <TabsTrigger value="file"><Upload className="w-4 h-4 mr-1" /> Bestand</TabsTrigger>
                            <TabsTrigger value="prebuilt"><ShoppingBag className="w-4 h-4 mr-1" /> Kant-en-klaar</TabsTrigger>
                            <TabsTrigger value="custom"><Pencil className="w-4 h-4 mr-1" /> Custom</TabsTrigger>
                          </TabsList>

                          {/* LINK TAB */}
                          <TabsContent value="link" className="mt-6 space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200">
                              Onze voorkeur: een <strong>openbare downloadlink</strong> (Google Drive, WeTransfer, Dropbox, Printables, 3DGo). Ondersteund: STL, OBJ, 3MF, STEP.
                            </div>
                            <div className="space-y-3">
                              <div>
                                <Label className="text-xs">Downloadlink *</Label>
                                <Input value={draftLink.url} onChange={(e) => setDraftLink({ ...draftLink, url: e.target.value })} placeholder="https://..." />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">Materiaal</Label>
                                  <Select value={draftLink.material} onValueChange={(v) => setDraftLink({ ...draftLink, material: v, color: "" })}>
                                    <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                                    <SelectContent>{MATERIALS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Kleur</Label>
                                  <Select value={draftLink.color} onValueChange={(v) => setDraftLink({ ...draftLink, color: v })} disabled={!draftLink.material}>
                                    <SelectTrigger><SelectValue placeholder="Kies kleur" /></SelectTrigger>
                                    <SelectContent>
                                      {getColorsForMaterial(draftLink.material).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                          <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: c.hex }} />
                                            {c.name}
                                          </div>
                                        </SelectItem>
                                      ))}
                                      <MulticolorOption />
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Aantal</Label>
                                  <Input type="number" min={1} value={draftLink.quantity} onChange={(e) => setDraftLink({ ...draftLink, quantity: parseInt(e.target.value) || 1 })} />
                                </div>
                              </div>
                              <Button onClick={addDraftLinkToCart} className="w-full"><Plus className="w-4 h-4" /> Toevoegen aan winkelmandje</Button>
                            </div>
                          </TabsContent>

                          {/* FILE TAB */}
                          <TabsContent value="file" className="mt-6 space-y-4">
                            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent/50 transition-colors">
                              <input type="file" accept={ACCEPTED_FILE_TYPES} multiple onChange={handleFileUpload} className="hidden" id="file-upload" />
                              <label htmlFor="file-upload" className="cursor-pointer">
                                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                                <p className="font-medium text-primary">Sleep bestanden hierheen of klik om te uploaden</p>
                                <p className="text-xs text-muted-foreground mt-1">STL, OBJ, 3MF, STEP — max 10MB per bestand</p>
                              </label>
                            </div>
                            {draftFiles.length > 0 && (
                              <div className="space-y-4">
                                {draftFiles.map((uf) => (
                                  <div key={uf.id} className="border border-border rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="w-5 h-5 text-accent flex-shrink-0" />
                                        <span className="font-medium text-sm truncate">{uf.file.name}</span>
                                        <span className="text-xs text-muted-foreground flex-shrink-0">({(uf.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                                        {uf.parsing && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
                                      </div>
                                      <Button variant="ghost" size="sm" onClick={() => removeDraftFile(uf.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                      <ModelViewer file={uf.file} height={180} />
                                      <div className="space-y-2 text-xs text-muted-foreground">
                                        {uf.volumeCm3 != null && <div>📐 Volume: {uf.volumeCm3.toFixed(1)} cm³</div>}
                                        {uf.estimatedGrams && <div>⚖️ ~{uf.estimatedGrams.toFixed(0)}g (20% infill)</div>}
                                        {uf.dimensions && <div>📏 {uf.dimensions.width.toFixed(0)}×{uf.dimensions.height.toFixed(0)}×{uf.dimensions.depth.toFixed(0)} mm</div>}
                                        {uf.material && uf.estimatedGrams && (
                                          <div className="text-accent font-medium">💰 €{calcFilePrice(uf).toFixed(2)} totaal</div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <Label className="text-xs">Materiaal</Label>
                                        <Select value={uf.material} onValueChange={(v) => updateDraftFile(uf.id, "material", v)}>
                                          <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                                          <SelectContent>{MATERIALS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Kleur</Label>
                                        <Select value={uf.color} onValueChange={(v) => updateDraftFile(uf.id, "color", v)} disabled={!uf.material}>
                                          <SelectTrigger><SelectValue placeholder="Kies kleur" /></SelectTrigger>
                                          <SelectContent>
                                            {getColorsForMaterial(uf.material).map((c) => (
                                              <SelectItem key={c.id} value={c.id}>
                                                <div className="flex items-center gap-2">
                                                  <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: c.hex }} />
                                                  {c.name}
                                                </div>
                                              </SelectItem>
                                            ))}
                                            <MulticolorOption />
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Aantal</Label>
                                        <Input type="number" min={1} value={uf.quantity} onChange={(e) => updateDraftFile(uf.id, "quantity", parseInt(e.target.value) || 1)} />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <Button onClick={addDraftFilesToCart} className="w-full"><Plus className="w-4 h-4" /> Bestanden toevoegen aan winkelmandje</Button>
                              </div>
                            )}
                          </TabsContent>

                          {/* PREBUILT TAB */}
                          <TabsContent value="prebuilt" className="mt-6">
                            {products.length === 0 ? (
                              <p className="text-muted-foreground text-sm">Er zijn momenteel geen kant-en-klare artikelen beschikbaar.</p>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {products.map((p) => (
                                  <ProductTile key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
                                ))}
                              </div>
                            )}
                            <ProductDetailDialog
                              product={selectedProduct}
                              colors={catalogColors}
                              open={!!selectedProduct}
                              onOpenChange={(o) => !o && setSelectedProduct(null)}
                              onAdd={addPrebuiltToCart}
                            />
                          </TabsContent>

                          {/* CUSTOM TAB */}
                          <TabsContent value="custom" className="mt-6 space-y-4">
                            <div className="space-y-2">
                              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
                                ⚠️ <strong>Ontwerpkosten:</strong> Ook bij niet-printen worden ontwerpkosten in rekening gebracht. Doorlooptijd kan langer zijn.
                              </div>
                              <div>
                                <Label className="text-sm mb-2 block">Foto's (optioneel)</Label>
                                <div className="flex flex-wrap gap-3 mb-2">
                                  {draftCustom.photos.map((photo, index) => (
                                    <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                                      <img src={URL.createObjectURL(photo)} alt="" className="w-full h-full object-cover" />
                                      <button
                                        onClick={() => setDraftCustom((p) => ({ ...p, photos: p.photos.filter((_, i) => i !== index) }))}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                                    <Camera className="w-5 h-5 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground mt-1">Foto</span>
                                    <input type="file" accept="image/*,.heic,.heif" onChange={handleCustomPhotoUpload} className="hidden" multiple />
                                  </label>
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm mb-1 block">Beschrijving *</Label>
                                <Textarea
                                  value={draftCustom.description}
                                  onChange={(e) => setDraftCustom((p) => ({ ...p, description: e.target.value }))}
                                  placeholder="Beschrijf zo gedetailleerd mogelijk wat u wilt laten ontwerpen en printen."
                                  rows={5}
                                />
                              </div>
                              <Button onClick={addCustomToCart} className="w-full"><Plus className="w-4 h-4" /> Toevoegen aan winkelmandje</Button>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={() => setStep(2)} disabled={!canProceed} size="lg">
                          Verder naar gegevens
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                      <div className="bg-card rounded-2xl p-8 shadow-overweel-card space-y-6">
                        <h2 className="text-xl font-bold flex items-center gap-3">
                          <Info className="w-6 h-6 text-accent" />
                          Uw gegevens
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Naam *</Label>
                            <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                          </div>
                          <div>
                            <Label>E-mail *</Label>
                            <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                          </div>
                          <div>
                            <Label>Telefoon</Label>
                            <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                          </div>
                          <div>
                            <Label>Bedrijfsnaam</Label>
                            <Input value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Factuuradres *</Label>
                            <Input value={formData.billing_address} onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })} required />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Verzendadres</Label>
                            <Input value={formData.shipping_address} onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })} placeholder="Laat leeg als gelijk aan factuuradres" />
                          </div>
                          <div>
                            <Label>Postcode *</Label>
                            <Input value={formData.postal_code} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })} required />
                          </div>
                          <div>
                            <Label>Stad *</Label>
                            <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} required />
                          </div>
                          <div>
                            <Label>Land</Label>
                            <Input value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} />
                          </div>
                        </div>

                        <div>
                          <Label>Opmerkingen</Label>
                          <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Speciale wensen, instructies, etc." />
                        </div>
                        <div>
                          <Label>Print voorkeuren</Label>
                          <Textarea value={formData.print_preferences} onChange={(e) => setFormData({ ...formData, print_preferences: e.target.value })} rows={2} placeholder="Infill, layer hoogte, etc." />
                        </div>

                        {/* Discount code */}
                        <div className="border-t border-border pt-4">
                          <Label className="flex items-center gap-2 mb-2"><Tag className="w-4 h-4" /> Kortingscode</Label>
                          {discountApplied ? (
                            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                              <p className="text-sm text-green-800 dark:text-green-200">
                                ✅ <strong>{discountApplied.code}</strong> — {discountApplied.type === "percentage" ? `${discountApplied.value}%` : `€${discountApplied.value.toFixed(2)}`} korting
                              </p>
                              <Button size="sm" variant="ghost" onClick={() => { setDiscountApplied(null); setDiscountCode(""); }}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="Voer kortingscode in" />
                              <Button variant="outline" onClick={applyDiscountCode} disabled={checkingDiscount || !discountCode.trim()}>
                                {checkingDiscount ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toepassen"}
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-start gap-2 pt-2">
                          <Checkbox id="terms" checked={formData.agreeTerms} onCheckedChange={(c) => setFormData({ ...formData, agreeTerms: c === true })} />
                          <label htmlFor="terms" className="text-sm text-muted-foreground">
                            Ik ga akkoord met de <a href="/voorwaarden" target="_blank" className="text-accent underline">algemene voorwaarden</a>
                          </label>
                        </div>

                        <div className="flex justify-between pt-4">
                          <Button variant="outline" onClick={() => setStep(1)}>Terug</Button>
                          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} size="lg">
                            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Bestelling plaatsen...</> : "Bestelling plaatsen"}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sidebar — unified cart */}
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                    <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" /> Winkelmandje ({cart.length})
                    </h3>
                    {cart.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Uw winkelmandje is leeg. Voeg items toe via de tabs.</p>
                    ) : (
                      <div className="space-y-3">
                        {cart.map((line) => (
                          <div key={line.id} className="border-b border-border pb-2 last:border-b-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{cartLineLabel(line)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {line.kind === "file" && `${(line as FileLine).quantity}× · ${MATERIALS.find(m => m.id === (line as FileLine).material)?.name || ""}`}
                                  {line.kind === "link" && `${(line as LinkLine).quantity}× · ${MATERIALS.find(m => m.id === (line as LinkLine).material)?.name || ""}`}
                                  {line.kind === "prebuilt" && `${(line as PrebuiltLine).quantity}× · ${(line as PrebuiltLine).material} ${(line as PrebuiltLine).color}`}
                                  {line.kind === "custom" && `${(line as CustomLine).photos.length} foto('s)`}
                                </p>
                                {line.kind === "prebuilt" && (line.optionAnswers.length > 0 || line.optionFiles.length > 0) && (
                                  <div className="mt-1 space-y-0.5">
                                    {line.optionAnswers.map((answer) => (
                                      <p key={answer.optionId} className="text-[11px] text-muted-foreground truncate">{answer.label}: {typeof answer.value === "boolean" ? (answer.value ? "Ja" : "Nee") : answer.value}</p>
                                    ))}
                                    {line.optionFiles.map((upload) => (
                                      <p key={upload.optionId} className="text-[11px] text-muted-foreground">{upload.label}: {upload.files.length} foto{upload.files.length === 1 ? "" : "'s"}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-sm font-semibold text-accent">{cartLinePrice(line)}</span>
                                <Button variant="ghost" size="sm" onClick={() => removeCartLine(line.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="border-t border-border pt-3 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotaal</span>
                            <span className="font-medium">€{estimatedSubtotal.toFixed(2)}</span>
                          </div>
                          {discountApplied && (
                            <div className="flex justify-between text-sm text-green-700">
                              <span>Korting ({discountApplied.code})</span>
                              <span>−€{discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-1">
                            <span className="font-semibold text-primary">{hasOnlyQuoteItems ? "Op offerte" : "Indicatie"}</span>
                            <span className="text-xl font-bold text-accent">€{estimatedTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="mt-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        ⚠️ Indicatie is een schatting. Definitieve prijs wordt na controle vastgesteld. Min. €5,-.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </OrderAuthGate>
  );
}
