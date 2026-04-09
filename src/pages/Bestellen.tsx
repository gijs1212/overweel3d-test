import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link2, Check, Package, Loader2, AlertCircle, ShoppingCart, Trash2, Star, Plus, Info, Camera, Pencil, Upload, X, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const materials = [
  { 
    id: "pla", name: "PLA",
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "blue", name: "Blauw", hex: "#0066FF" },
      { id: "green", name: "Groen", hex: "#00CC00" },
      { id: "leafgreen", name: "Bladgroen", hex: "#228B22" },
      { id: "red", name: "Rood", hex: "#FF0000" },
      { id: "yellow", name: "Geel", hex: "#FFDD00" },
      { id: "grey", name: "Grijs", hex: "#808080" },
    ]
  },
  { 
    id: "petg", name: "PETG",
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "red", name: "Rood", hex: "#FF0000" },
    ]
  },
  { 
    id: "tpu", name: "TPU",
    colors: [
      { id: "black", name: "Zwart", hex: "#000000" },
    ]
  },
];

interface DBProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  materials: string[];
  colors: string[];
  photos: string[];
  custom_text_enabled: boolean;
  custom_text_label: string;
  custom_text_max_length: number;
  customer_photo_required: boolean;
  active: boolean;
}

interface LinkFile {
  name: string;
  quantity: number;
  material: string;
  color: string;
}

interface OrderLink {
  id: string;
  url: string;
  files: LinkFile[];
}

interface PrebuiltCartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  productId: string;
  customText?: string;
  color?: string;
  colorName?: string;
  customerPhoto?: File;
}

export default function Bestellen() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [activeSection, setActiveSection] = useState<"prebuilt" | "link" | "custom" | null>(null);

  // DB products
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<DBProduct | null>(null);

  // Discount code
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ type: string; value: number; code: string } | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);

  useEffect(() => {
    supabase.from("products").select("*").eq("active", true).then(({ data }) => {
      setDbProducts((data as any as DBProduct[]) || []);
      setLoadingProducts(false);
    });
  }, []);

  // Links state
  const [orderLinks, setOrderLinks] = useState<OrderLink[]>([
    { id: `link-${Date.now()}`, url: "", files: [{ name: "", quantity: 1, material: "", color: "" }] }
  ]);

  // Prebuilt cart
  const [prebuiltCart, setPrebuiltCart] = useState<PrebuiltCartItem[]>([]);
  const [prebuiltTexts, setPrebuiltTexts] = useState<Record<string, string>>({});
  const [prebuiltColors, setPrebuiltColors] = useState<Record<string, string>>({});
  const [prebuiltQuantities, setPrebuiltQuantities] = useState<Record<string, number>>({});
  const [prebuiltPhotos, setPrebuiltPhotos] = useState<Record<string, File | null>>({});

  // Custom order state
  const [customPhotos, setCustomPhotos] = useState<File[]>([]);
  const [customDescription, setCustomDescription] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    name: "", email: "", phone: "", address: "", city: "", postalCode: "", notes: "", agreeTerms: false,
  });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Link management
  const addLink = () => {
    setOrderLinks([...orderLinks, { id: `link-${Date.now()}`, url: "", files: [{ name: "", quantity: 1, material: "", color: "" }] }]);
  };
  const removeLink = (linkId: string) => {
    if (orderLinks.length <= 1) return;
    setOrderLinks(orderLinks.filter(l => l.id !== linkId));
  };
  const updateLinkUrl = (linkId: string, url: string) => {
    setOrderLinks(orderLinks.map(l => l.id === linkId ? { ...l, url } : l));
  };
  const addFileToLink = (linkId: string) => {
    setOrderLinks(orderLinks.map(l => l.id === linkId ? { ...l, files: [...l.files, { name: "", quantity: 1, material: "", color: "" }] } : l));
  };
  const removeFileFromLink = (linkId: string, fileIndex: number) => {
    setOrderLinks(orderLinks.map(l => {
      if (l.id !== linkId || l.files.length <= 1) return l;
      return { ...l, files: l.files.filter((_, i) => i !== fileIndex) };
    }));
  };
  const updateFile = (linkId: string, fileIndex: number, field: keyof LinkFile, value: string | number) => {
    setOrderLinks(orderLinks.map(l => {
      if (l.id !== linkId) return l;
      const newFiles = [...l.files];
      newFiles[fileIndex] = { ...newFiles[fileIndex], [field]: value };
      if (field === "material") newFiles[fileIndex].color = "";
      return { ...l, files: newFiles };
    }));
  };
  const getColorsForMaterial = (materialId: string) => {
    return materials.find(m => m.id === materialId)?.colors || [];
  };

  // Product color list based on DB product
  const getProductColors = (product: DBProduct) => {
    const allColors = materials.flatMap(m => m.colors);
    return product.colors.map(cId => allColors.find(c => c.id === cId)).filter(Boolean) as { id: string; name: string; hex: string }[];
  };

  const addPrebuiltToCart = (product: DBProduct) => {
    const productColors = getProductColors(product);
    if (productColors.length > 0 && !prebuiltColors[product.id]) {
      toast({ title: "Kies een kleur", variant: "destructive" });
      return;
    }
    if (product.customer_photo_required && !prebuiltPhotos[product.id]) {
      toast({ title: "Upload een foto", description: "Dit product vereist een foto.", variant: "destructive" });
      return;
    }
    const selectedColorObj = productColors.find(c => c.id === prebuiltColors[product.id]);
    const qty = prebuiltQuantities[product.id] || 1;
    const newItem: PrebuiltCartItem = {
      id: `prebuilt-${Date.now()}`,
      name: product.name,
      quantity: qty,
      price: product.price * qty,
      productId: product.id,
      customText: product.custom_text_enabled ? (prebuiltTexts[product.id] || "") : undefined,
      color: selectedColorObj?.id,
      colorName: selectedColorObj?.name,
      customerPhoto: prebuiltPhotos[product.id] || undefined,
    };
    setPrebuiltCart([...prebuiltCart, newItem]);
    setSelectedProduct(null);
    toast({ title: "Toegevoegd", description: `${product.name} is toegevoegd.` });
  };

  const removePrebuilt = (itemId: string) => {
    setPrebuiltCart(prebuiltCart.filter(item => item.id !== itemId));
  };

  const prebuiltTotal = prebuiltCart.reduce((t, i) => t + i.price, 0);

  const getDiscountedTotal = () => {
    if (!discountApplied) return prebuiltTotal;
    if (discountApplied.type === "percentage") {
      return prebuiltTotal * (1 - discountApplied.value / 100);
    }
    return Math.max(0, prebuiltTotal - discountApplied.value);
  };

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

      if (error || !data) {
        toast({ title: "Ongeldige kortingscode", variant: "destructive" });
        setCheckingDiscount(false);
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast({ title: "Deze kortingscode is verlopen", variant: "destructive" });
        setCheckingDiscount(false);
        return;
      }
      if (data.max_uses !== null && data.times_used >= data.max_uses) {
        toast({ title: "Deze kortingscode is al maximaal gebruikt", variant: "destructive" });
        setCheckingDiscount(false);
        return;
      }

      setDiscountApplied({ type: data.discount_type, value: Number(data.discount_value), code: data.code });
      toast({ title: `Kortingscode "${data.code}" toegepast! 🎉` });
    } catch {
      toast({ title: "Fout bij controleren code", variant: "destructive" });
    } finally { setCheckingDiscount(false); }
  };

  // Custom photo helpers
  const handleCustomPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const remaining = 3 - customPhotos.length;
    const toAdd = imageFiles.slice(0, remaining);
    if (toAdd.length < imageFiles.length) {
      toast({ title: "Maximaal 3 foto's", variant: "destructive" });
    }
    setCustomPhotos(prev => [...prev, ...toAdd]);
    e.target.value = "";
  };
  const removeCustomPhoto = (index: number) => setCustomPhotos(prev => prev.filter((_, i) => i !== index));

  const hasCustomOrder = customPhotos.length > 0 && customDescription.trim().length > 0;
  const hasValidLinks = orderLinks.some(l => l.url.trim() !== "" && l.files.some(f => f.name.trim() !== "" && f.material && f.color));
  const hasPrebuiltItems = prebuiltCart.length > 0;
  const canProceedToStep2 = hasValidLinks || hasPrebuiltItems || hasCustomOrder;
  const canSubmit = formData.name && formData.email && formData.address && formData.city && formData.postalCode && formData.agreeTerms && canProceedToStep2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const linkItems = orderLinks
        .filter(l => l.url.trim() !== "")
        .map(l => ({
          url: l.url,
          files: l.files.filter(f => f.name.trim() !== "").map(f => ({
            name: f.name, quantity: f.quantity,
            material: materials.find(m => m.id === f.material)?.name || f.material,
            color: getColorsForMaterial(f.material).find(c => c.id === f.color)?.name || f.color,
          })),
        }));

      const prebuiltItems = [];
      for (const item of prebuiltCart) {
        let customerPhotoPath: string | undefined;
        if (item.customerPhoto) {
          const ts = Date.now();
          const path = `customer-photos/${ts}/${item.customerPhoto.name}`;
          await supabase.storage.from("orders").upload(path, item.customerPhoto, { upsert: true });
          customerPhotoPath = path;
        }
        prebuiltItems.push({
          name: item.name, type: "prebuilt" as const, quantity: item.quantity,
          price: item.price.toFixed(2), customText: item.customText, color: item.colorName,
          customerPhoto: customerPhotoPath,
        });
      }

      let customPhotoUrls: string[] = [];
      if (hasCustomOrder) {
        const timestamp = Date.now();
        for (const photo of customPhotos) {
          const storagePath = `custom-orders/${timestamp}/${photo.name}`;
          const { error: uploadError } = await supabase.storage.from("orders").upload(storagePath, photo, { upsert: true });
          if (!uploadError) customPhotoUrls.push(storagePath);
        }
      }

      // Increment discount code usage if applied
      if (discountApplied) {
        try {
          await supabase.rpc("increment_discount_usage", { code_text: discountApplied.code });
        } catch {}
      }

      const { error } = await supabase.functions.invoke("send-order-notification", {
        body: {
          orderDetails: {
            links: linkItems, prebuiltItems, prebuiltTotal: prebuiltTotal.toFixed(2),
            discountCode: discountApplied?.code,
            discountedTotal: discountApplied ? getDiscountedTotal().toFixed(2) : undefined,
            customOrder: hasCustomOrder ? { description: customDescription, photoCount: customPhotos.length, photoPaths: customPhotoUrls } : null,
          },
          customer: { name: formData.name, email: formData.email, phone: formData.phone, address: formData.address, city: formData.city, postalCode: formData.postalCode, notes: formData.notes },
        },
      });
      if (error) throw error;
      setOrderComplete(true);
      toast({ title: "Bestelling geplaatst!" });
    } catch (error) {
      console.error("Order error:", error);
      toast({ title: "Er ging iets mis", description: "Probeer het opnieuw of neem contact met ons op.", variant: "destructive" });
    } finally { setIsSubmitting(false); }
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-16">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-lg mx-auto text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }} className="w-24 h-24 mx-auto mb-8 rounded-full bg-accent flex items-center justify-center">
                <Check className="w-12 h-12 text-accent-foreground" />
              </motion.div>
              <h1 className="text-3xl font-bold text-primary mb-4">Bestelling geplaatst! 🎉</h1>
              <p className="text-muted-foreground mb-8">
                Uw bestelling vliegt nu digitaal naar ons toe. We gaan direct aan de slag 
                en u ontvangt een bevestigingsmail met alle details op {formData.email}.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6 text-left">
                <p className="text-sm text-amber-800">⚠️ <strong>Let op:</strong> De prijs voor custom prints wordt na de controle bepaald en aan u doorgegeven.</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 text-left">
                <p className="text-sm text-blue-800">📧 Als u geen bevestigingsmail ontvangt, kijk dan ook in uw spam/ongewenste berichten.</p>
              </div>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const getProductImageUrl = (photoPath: string) => {
    return `${supabaseUrl}/storage/v1/object/public/orders/${photoPath}`;
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Start uw bestelling</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Deel de link naar uw gewenste 3D-bestanden, geef per bestand de details op en wij printen het voor u.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto mb-8 space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">⚠️ <strong>Belangrijk:</strong> De prijs voor custom prints wordt na de controle bepaald en aan u doorgegeven. Minimale bestelwaarde is €5,- totaal.</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">ℹ️ <strong>Links:</strong> Services zoals <strong>Thingiverse, Printables en 3DGo</strong> worden ondersteund, mits het bestand gratis te downloaden is. Zijn de bestanden betaald? Stuur ze dan via <a href="https://wetransfer.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">WeTransfer</a> en plak de WeTransfer-link hieronder.</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">ℹ️ <strong>Let op:</strong> Op de kant-en-klare modellen na worden onderdelen niet in elkaar gezet geleverd.</p>
            </div>
          </div>

          {/* Progress Steps */}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <button onClick={() => setActiveSection(activeSection === "prebuilt" ? null : "prebuilt")}
                         className={`p-6 rounded-2xl border-2 transition-all text-left ${activeSection === "prebuilt" ? "border-accent bg-accent/5 shadow-lg" : "border-border bg-card hover:border-accent/50"}`}>
                         <Star className={`w-8 h-8 mb-3 ${activeSection === "prebuilt" ? "text-accent" : "text-muted-foreground"}`} />
                         <h3 className="font-bold text-sm">Kant-en-klare modellen</h3>
                         <p className="text-xs text-muted-foreground mt-1">Direct leverbaar tegen vaste prijs</p>
                       </button>
                       <button onClick={() => setActiveSection(activeSection === "link" ? null : "link")}
                         className={`p-6 rounded-2xl border-2 transition-all text-left ${activeSection === "link" ? "border-accent bg-accent/5 shadow-lg" : "border-border bg-card hover:border-accent/50"}`}>
                         <Link2 className={`w-8 h-8 mb-3 ${activeSection === "link" ? "text-accent" : "text-muted-foreground"}`} />
                         <h3 className="font-bold text-sm">Bestanden via link</h3>
                         <p className="text-xs text-muted-foreground mt-1">Thingiverse, Printables, WeTransfer, etc.</p>
                       </button>
                       <button onClick={() => setActiveSection(activeSection === "custom" ? null : "custom")}
                         className={`p-6 rounded-2xl border-2 transition-all text-left ${activeSection === "custom" ? "border-accent bg-accent/5 shadow-lg" : "border-border bg-card hover:border-accent/50"}`}>
                         <Pencil className={`w-8 h-8 mb-3 ${activeSection === "custom" ? "text-accent" : "text-muted-foreground"}`} />
                         <h3 className="font-bold text-sm">Custom opdracht</h3>
                         <p className="text-xs text-muted-foreground mt-1">Wij ontwerpen het voor u</p>
                       </button>
                     </div>

                     {/* Pre-built Models - Card Grid */}
                     <AnimatePresence>
                     {activeSection === "prebuilt" && (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                     <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                       <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                         <Star className="w-6 h-6 text-accent" /> Kant-en-klare modellen
                       </h2>
                       <p className="text-sm text-muted-foreground mb-6">Klik op een product voor meer info en om te bestellen.</p>

                       {loadingProducts ? (
                         <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
                       ) : dbProducts.length === 0 ? (
                         <p className="text-muted-foreground text-center py-4">Momenteel geen producten beschikbaar.</p>
                       ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                           {dbProducts.map((product) => (
                             <button
                               key={product.id}
                               onClick={() => setSelectedProduct(product)}
                               className="group text-left rounded-xl border-2 border-border hover:border-accent/50 transition-all overflow-hidden bg-background hover:shadow-lg"
                             >
                               {/* Large product photo */}
                               <div className="aspect-square w-full bg-muted relative overflow-hidden">
                                 {product.photos.length > 0 ? (
                                   <img
                                     src={getProductImageUrl(product.photos[0])}
                                     alt={product.name}
                                     className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                     loading="lazy"
                                     onError={(e) => {
                                       (e.target as HTMLImageElement).style.display = 'none';
                                     }}
                                   />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center">
                                     <Package className="w-16 h-16 text-muted-foreground/30" />
                                   </div>
                                 )}
                               </div>
                               {/* Product info below photo */}
                               <div className="p-4">
                                 <h3 className="font-bold text-primary text-lg">{product.name}</h3>
                                 <p className="text-accent font-bold text-xl mt-1">€{product.price.toFixed(2)}</p>
                                 {product.description && (
                                   <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{product.description}</p>
                                 )}
                                 <div className="flex flex-wrap gap-1 mt-3">
                                   {product.custom_text_enabled && <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full">✏️ Tekst</span>}
                                   {product.customer_photo_required && <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full">📷 Foto</span>}
                                 </div>
                               </div>
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                     </motion.div>
                     )}
                     </AnimatePresence>

                     {/* Product Detail Modal */}
                     <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
                       <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                         {selectedProduct && (() => {
                           const product = selectedProduct;
                           const productColors = getProductColors(product);
                           const qty = prebuiltQuantities[product.id] || 1;
                           return (
                             <>
                               <DialogHeader>
                                 <DialogTitle className="text-xl">{product.name}</DialogTitle>
                               </DialogHeader>

                               {/* Photo gallery */}
                               {product.photos.length > 0 && (
                                 <div className="space-y-2">
                                   <img
                                     src={getProductImageUrl(product.photos[0])}
                                     alt={product.name}
                                     className="w-full rounded-lg object-cover max-h-72"
                                     loading="lazy"
                                   />
                                   {product.photos.length > 1 && (
                                     <div className="flex gap-2 overflow-x-auto">
                                       {product.photos.slice(1).map((photo, i) => (
                                         <img
                                           key={i}
                                           src={getProductImageUrl(photo)}
                                           alt={`${product.name} ${i + 2}`}
                                           className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border"
                                           loading="lazy"
                                         />
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               )}

                               <p className="text-2xl font-bold text-accent">€{product.price.toFixed(2)}</p>
                               {product.description && <p className="text-muted-foreground">{product.description}</p>}

                               {/* Custom text */}
                               {product.custom_text_enabled && (
                                 <div>
                                   <Label className="text-sm mb-1 block">{product.custom_text_label}</Label>
                                   <Input
                                     maxLength={product.custom_text_max_length}
                                     value={prebuiltTexts[product.id] || ""}
                                     onChange={(e) => setPrebuiltTexts({ ...prebuiltTexts, [product.id]: e.target.value })}
                                     placeholder={`Max ${product.custom_text_max_length} tekens`}
                                   />
                                   <p className="text-xs text-muted-foreground mt-1">{(prebuiltTexts[product.id] || "").length}/{product.custom_text_max_length} tekens</p>
                                 </div>
                               )}

                               {/* Color choice */}
                               {productColors.length > 0 && (
                                 <div>
                                   <Label className="text-sm mb-2 block">Kies een kleur (verplicht)</Label>
                                   <div className="flex flex-wrap gap-2">
                                     {productColors.map((color) => (
                                       <button key={color.id}
                                         onClick={() => setPrebuiltColors({ ...prebuiltColors, [product.id]: color.id })}
                                         className={`w-10 h-10 rounded-full border-3 transition-all ${prebuiltColors[product.id] === color.id ? "border-accent scale-110 ring-2 ring-accent" : "border-border hover:scale-105"}`}
                                         style={{ backgroundColor: color.hex }} title={color.name}>
                                         {prebuiltColors[product.id] === color.id && (
                                           <Check className={`w-4 h-4 mx-auto ${color.hex === "#FFFFFF" || color.hex === "#FFDD00" ? "text-primary" : "text-white"}`} />
                                         )}
                                       </button>
                                     ))}
                                   </div>
                                   {prebuiltColors[product.id] && <p className="text-xs text-muted-foreground mt-1">Gekozen: {productColors.find(c => c.id === prebuiltColors[product.id])?.name}</p>}
                                 </div>
                               )}

                               {/* Customer photo upload */}
                               {product.customer_photo_required && (
                                 <div>
                                   <Label className="text-sm mb-2 block">Foto uploaden (verplicht) 📷</Label>
                                   {prebuiltPhotos[product.id] ? (
                                     <div className="flex items-center gap-3">
                                       <img src={URL.createObjectURL(prebuiltPhotos[product.id]!)} alt="Klantfoto" className="w-20 h-20 rounded-lg object-cover border" />
                                       <Button variant="ghost" size="sm" onClick={() => setPrebuiltPhotos({ ...prebuiltPhotos, [product.id]: null })}>
                                         <Trash2 className="w-4 h-4 text-destructive" />
                                       </Button>
                                     </div>
                                   ) : (
                                     <label className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors text-sm">
                                       <Upload className="w-4 h-4" /> Kies een foto
                                       <input type="file" accept="image/*" className="hidden" onChange={e => {
                                         const f = e.target.files?.[0];
                                         if (f) setPrebuiltPhotos({ ...prebuiltPhotos, [product.id]: f });
                                         e.target.value = "";
                                       }} />
                                     </label>
                                   )}
                                 </div>
                               )}

                               {/* Quantity + add */}
                               <div className="flex items-end gap-4">
                                 <div>
                                   <Label className="text-sm mb-1 block">Aantal</Label>
                                   <Input type="number" min={1} value={qty}
                                     onChange={(e) => setPrebuiltQuantities({ ...prebuiltQuantities, [product.id]: Math.max(1, parseInt(e.target.value) || 1) })}
                                     className="w-24" />
                                 </div>
                                 <Button variant="hero" onClick={() => addPrebuiltToCart(product)} className="flex-1">
                                   <ShoppingCart className="w-4 h-4 mr-2" />
                                   Toevoegen (€{(qty * product.price).toFixed(2)})
                                 </Button>
                               </div>
                             </>
                           );
                         })()}
                       </DialogContent>
                     </Dialog>

                     {/* Links Section */}
                     <AnimatePresence>
                     {activeSection === "link" && (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                     <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                       <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                         <Link2 className="w-6 h-6 text-accent" /> Bestanden via link
                       </h2>
                       <p className="text-sm text-muted-foreground mb-6">
                         Plak een downloadlink (bijv. Thingiverse, Printables, WeTransfer) en geef per bestand aan wat u wilt.
                         Als u alle bestanden van een link wilt printen, vul dan "Alle bestanden" in als bestandsnaam.
                       </p>
                       <div className="space-y-8">
                         {orderLinks.map((link, linkIndex) => (
                           <div key={link.id} className="border-2 border-border rounded-xl p-6 relative">
                             <div className="flex items-center justify-between mb-4">
                               <h3 className="font-semibold text-sm text-muted-foreground">Link {linkIndex + 1}</h3>
                               {orderLinks.length > 1 && (
                                 <Button variant="ghost" size="sm" onClick={() => removeLink(link.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                               )}
                             </div>
                             <div className="mb-4">
                               <Label className="text-sm mb-1 block">Download-link *</Label>
                               <Input value={link.url} onChange={(e) => updateLinkUrl(link.id, e.target.value)} placeholder="https://www.thingiverse.com/thing/... of WeTransfer-link" />
                             </div>
                             <div className="space-y-4">
                               <Label className="text-sm font-medium block">Bestanden uit deze link:</Label>
                               {link.files.map((file, fileIndex) => (
                                 <div key={fileIndex} className="bg-muted/50 rounded-lg p-4 space-y-3">
                                   <div className="flex items-center justify-between">
                                     <span className="text-xs font-medium text-muted-foreground">Bestand {fileIndex + 1}</span>
                                     {link.files.length > 1 && (
                                       <Button variant="ghost" size="sm" onClick={() => removeFileFromLink(link.id, fileIndex)} className="h-6 w-6 p-0 text-destructive"><Trash2 className="w-3 h-3" /></Button>
                                     )}
                                   </div>
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     <div>
                                       <Label className="text-xs">Bestandsnaam *</Label>
                                       <Input value={file.name} onChange={(e) => updateFile(link.id, fileIndex, "name", e.target.value)} placeholder="bijv. houder.stl of Alle bestanden" className="text-sm" />
                                     </div>
                                     <div>
                                       <Label className="text-xs">Aantal *</Label>
                                       <Input type="number" min={1} value={file.quantity} onChange={(e) => updateFile(link.id, fileIndex, "quantity", Math.max(1, parseInt(e.target.value) || 1))} className="text-sm" />
                                     </div>
                                     <div>
                                       <Label className="text-xs">Materiaal *</Label>
                                       <div className="flex flex-wrap gap-2 mt-1">
                                         {materials.map((m) => (
                                           <button key={m.id} onClick={() => updateFile(link.id, fileIndex, "material", m.id)}
                                             className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${file.material === m.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-accent/50"}`}>
                                             {m.name}
                                           </button>
                                         ))}
                                       </div>
                                     </div>
                                     {file.material && (
                                       <div>
                                         <Label className="text-xs">Kleur *</Label>
                                         <div className="flex flex-wrap gap-2 mt-1">
                                           {getColorsForMaterial(file.material).map((color) => (
                                             <button key={color.id} onClick={() => updateFile(link.id, fileIndex, "color", color.id)}
                                               className={`w-7 h-7 rounded-full border-2 transition-all ${file.color === color.id ? "border-accent scale-110 ring-2 ring-accent" : "border-border hover:scale-105"}`}
                                               style={{ backgroundColor: color.hex }} title={color.name}>
                                               {file.color === color.id && <Check className={`w-3 h-3 mx-auto ${color.hex === "#FFFFFF" || color.hex === "#FFDD00" ? "text-primary" : "text-white"}`} />}
                                             </button>
                                           ))}
                                         </div>
                                         {file.color && <p className="text-xs text-muted-foreground mt-1">{getColorsForMaterial(file.material).find(c => c.id === file.color)?.name}</p>}
                                       </div>
                                     )}
                                   </div>
                                 </div>
                               ))}
                               <Button variant="outline" size="sm" onClick={() => addFileToLink(link.id)}>
                                 <Plus className="w-3 h-3 mr-1" /> Bestand toevoegen
                               </Button>
                             </div>
                           </div>
                         ))}
                       </div>
                       <Button variant="outline" onClick={addLink} className="mt-4 w-full">
                         <Plus className="w-4 h-4 mr-2" /> Nog een link toevoegen
                       </Button>
                     </div>
                     </motion.div>
                     )}
                     </AnimatePresence>

                     {/* Custom Opdracht */}
                     <AnimatePresence>
                     {activeSection === "custom" && (
                     <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                     <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                       <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                         <Pencil className="w-6 h-6 text-accent" /> Custom opdracht
                       </h2>
                       <p className="text-sm text-muted-foreground mb-4">
                         Heeft u een idee maar nog geen 3D-bestand? Upload foto's van uw idee en beschrijf wat u wilt. Wij ontwerpen het voor u!
                       </p>
                       <div className="space-y-2 mb-6">
                         <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                           <p className="text-xs text-amber-800 dark:text-amber-200">⚠️ <strong>Ontwerpkosten:</strong> Er zijn ontwerpkosten van toepassing. Ook als u besluit om niet te printen, zullen de ontwerpkosten betaald moeten worden.</p>
                         </div>
                         <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                           <p className="text-xs text-amber-800 dark:text-amber-200">⏳ <strong>Doorlooptijd:</strong> Het ontwerpen kan lang duren. Houd hier rekening mee bij uw bestelling.</p>
                         </div>
                         <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                           <p className="text-xs text-amber-800 dark:text-amber-200">❌ <strong>Afwijzing:</strong> Het is mogelijk dat uw opdracht afgewezen wordt wegens een te ingewikkeld ontwerp.</p>
                         </div>
                       </div>
                       <div className="mb-4">
                         <Label className="text-sm mb-2 block">Foto's (1-3) *</Label>
                         <div className="flex flex-wrap gap-3 mb-3">
                           {customPhotos.map((photo, index) => (
                             <div key={index} className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-border group">
                               <img src={URL.createObjectURL(photo)} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                               <button onClick={() => removeCustomPhoto(index)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                 <Trash2 className="w-3 h-3" />
                               </button>
                             </div>
                           ))}
                           {customPhotos.length < 3 && (
                             <label className="w-24 h-24 rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                               <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                               <span className="text-xs text-muted-foreground">Foto</span>
                               <input type="file" accept="image/*" onChange={handleCustomPhotoUpload} className="hidden" multiple />
                             </label>
                           )}
                         </div>
                         <p className="text-xs text-muted-foreground">{customPhotos.length}/3 foto's geüpload</p>
                       </div>
                       <div>
                         <Label className="text-sm mb-1 block">Beschrijving van uw idee *</Label>
                         <Textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)}
                           placeholder="Beschrijf zo gedetailleerd mogelijk wat u wilt laten ontwerpen en printen. Denk aan afmetingen, vorm, functionaliteit, etc."
                           rows={4} maxLength={2000} />
                         <p className="text-xs text-muted-foreground mt-1">{customDescription.length}/2000 tekens</p>
                       </div>
                     </div>
                     </motion.div>
                     )}
                     </AnimatePresence>

                    <div className="flex justify-end">
                      <Button variant="hero" onClick={() => setStep(2)} disabled={!canProceedToStep2}>Verder naar gegevens</Button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-card rounded-2xl p-8 shadow-overweel-card">
                    <h2 className="text-xl font-bold mb-6">Uw gegevens</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div><Label htmlFor="name">Naam *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Uw volledige naam" /></div>
                      <div><Label htmlFor="email">E-mail *</Label><Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="u@email.nl" /></div>
                      <div><Label htmlFor="phone">Telefoon</Label><Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="06-12345678" /></div>
                      <div><Label htmlFor="postalCode">Postcode *</Label><Input id="postalCode" value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} placeholder="1234 AB" /></div>
                      <div className="md:col-span-2"><Label htmlFor="address">Adres *</Label><Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Straat en huisnummer" /></div>
                      <div className="md:col-span-2"><Label htmlFor="city">Plaats *</Label><Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Woonplaats" /></div>
                      <div className="md:col-span-2"><Label htmlFor="notes">Opmerkingen / speciale instructies</Label><Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Bijv. specifieke bestanden uit een link, infill-percentage, etc." rows={3} /></div>
                    </div>

                    {/* Discount code */}
                    {hasPrebuiltItems && (
                      <div className="mb-6 p-4 border border-border rounded-xl">
                        <Label className="text-sm mb-2 block flex items-center gap-2"><Tag className="w-4 h-4" /> Kortingscode</Label>
                        {discountApplied ? (
                          <div className="flex items-center justify-between bg-accent/10 rounded-lg p-3">
                            <span className="text-sm font-medium text-accent">
                              ✅ {discountApplied.code} — {discountApplied.type === "percentage" ? `${discountApplied.value}%` : `€${discountApplied.value.toFixed(2)}`} korting
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => { setDiscountApplied(null); setDiscountCode(""); }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              value={discountCode}
                              onChange={e => setDiscountCode(e.target.value)}
                              placeholder="Voer kortingscode in"
                              className="uppercase"
                              onKeyDown={e => e.key === "Enter" && applyDiscountCode()}
                            />
                            <Button variant="outline" onClick={applyDiscountCode} disabled={checkingDiscount || !discountCode.trim()}>
                              {checkingDiscount ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toepassen"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-4 mb-8">
                      <div className="flex items-start gap-3">
                        <Checkbox id="terms" checked={formData.agreeTerms} onCheckedChange={(checked) => setFormData({ ...formData, agreeTerms: checked as boolean })} />
                        <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                          Ik ga akkoord met de <a href="/voorwaarden" className="text-accent underline" target="_blank">algemene voorwaarden</a>
                        </Label>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setStep(1)}>Terug</Button>
                      <Button variant="hero" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
                        {isSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Bestelling plaatsen...</>) : "Bestelling plaatsen"}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Side - Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-6 shadow-overweel-card">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Overzicht</h3>

                  {(hasValidLinks || hasPrebuiltItems || hasCustomOrder) ? (
                    <div className="space-y-4">
                      {orderLinks.filter(l => l.url.trim()).map((link) => (
                        <div key={link.id} className="border-b border-border pb-3">
                          <p className="text-xs font-medium text-accent break-all truncate">🔗 {link.url}</p>
                          {link.files.filter(f => f.name.trim()).map((f, fi) => (
                            <p key={fi} className="text-xs text-muted-foreground ml-2">
                              {f.name} — {f.quantity}x
                              {f.material && ` — ${materials.find(m => m.id === f.material)?.name}`}
                              {f.color && ` — ${getColorsForMaterial(f.material).find(c => c.id === f.color)?.name}`}
                            </p>
                          ))}
                        </div>
                      ))}
                      {prebuiltCart.map((item) => (
                        <div key={item.id} className="flex justify-between items-start border-b border-border pb-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.colorName && <p className="text-xs text-muted-foreground">Kleur: {item.colorName}</p>}
                            {item.customText && <p className="text-xs text-muted-foreground">Tekst: "{item.customText}"</p>}
                            {item.customerPhoto && <p className="text-xs text-muted-foreground">📷 Foto bijgevoegd</p>}
                            <p className="text-xs text-muted-foreground">{item.quantity}x</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">€{item.price.toFixed(2)}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePrebuilt(item.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ))}
                      {hasCustomOrder && (
                        <div className="border-b border-border pb-3">
                          <p className="text-xs font-medium flex items-center gap-1"><Pencil className="w-3 h-3 text-accent" /> Custom opdracht</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{customDescription}</p>
                          <p className="text-xs text-muted-foreground">{customPhotos.length} foto('s)</p>
                        </div>
                      )}
                      {prebuiltCart.length > 0 && (
                        <div className="border-t border-border pt-3 space-y-1">
                          {discountApplied && (
                            <>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Subtotaal</span>
                                <span>€{prebuiltTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm text-accent">
                                <span>Korting ({discountApplied.code})</span>
                                <span>-€{(prebuiltTotal - getDiscountedTotal()).toFixed(2)}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-sm">Totaal</span>
                            <span className="text-xl font-bold text-accent">€{getDiscountedTotal().toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      {(hasValidLinks || hasCustomOrder) && (
                        <p className="text-xs text-muted-foreground">* Prijs voor custom prints wordt na controle gecommuniceerd.</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">Voeg links, producten of een custom opdracht toe</p>
                    </div>
                  )}
                </motion.div>
                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-accent" /><span>Prijsgarantie na bevestiging</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
