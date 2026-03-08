import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Check, Package, Loader2, AlertCircle, ShoppingCart, Trash2, Star, Plus, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const materials = [
  { 
    id: "pla", 
    name: "PLA", 
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
    id: "petg", 
    name: "PETG", 
    colors: [
      { id: "white", name: "Wit", hex: "#FFFFFF" },
      { id: "black", name: "Zwart", hex: "#000000" },
      { id: "red", name: "Rood", hex: "#FF0000" },
    ]
  },
  { 
    id: "tpu", 
    name: "TPU", 
    colors: [
      { id: "black", name: "Zwart", hex: "#000000" },
    ]
  },
];

const plaColors = [
  { id: "white", name: "Wit", hex: "#FFFFFF" },
  { id: "black", name: "Zwart", hex: "#000000" },
  { id: "blue", name: "Blauw", hex: "#0066FF" },
  { id: "green", name: "Groen", hex: "#00CC00" },
  { id: "leafgreen", name: "Bladgroen", hex: "#228B22" },
  { id: "red", name: "Rood", hex: "#FF0000" },
  { id: "yellow", name: "Geel", hex: "#FFDD00" },
  { id: "grey", name: "Grijs", hex: "#808080" },
];

const prebuiltModels = [
  {
    id: "roos",
    name: "Roos",
    price: 4.00,
    image: "🌹",
    hasTextInput: true,
    textLabel: "Tekst op rozenstam",
    textMaxLength: 25,
    hasColorChoice: false,
  },
  {
    id: "waxinelicht-houder",
    name: "Waxinelicht houder",
    price: 5.00,
    image: "🕯️",
    hasTextInput: false,
    hasColorChoice: true,
  },
];

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
  prebuiltId: string;
  stemText?: string;
  color?: string;
  colorName?: string;
}

export default function Bestellen() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  // Links state
  const [orderLinks, setOrderLinks] = useState<OrderLink[]>([
    { id: `link-${Date.now()}`, url: "", files: [{ name: "", quantity: 1, material: "", color: "" }] }
  ]);

  // Prebuilt cart
  const [prebuiltCart, setPrebuiltCart] = useState<PrebuiltCartItem[]>([]);
  const [prebuiltStemTexts, setPrebuiltStemTexts] = useState<Record<string, string>>({});
  const [prebuiltColors, setPrebuiltColors] = useState<Record<string, string>>({});
  const [prebuiltQuantities, setPrebuiltQuantities] = useState<Record<string, number>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    notes: "",
    agreeTerms: false,
    
  });

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
      // Reset color when material changes
      if (field === "material") {
        newFiles[fileIndex].color = "";
      }
      return { ...l, files: newFiles };
    }));
  };

  const getColorsForMaterial = (materialId: string) => {
    return materials.find(m => m.id === materialId)?.colors || [];
  };

  const addPrebuiltToCart = (model: typeof prebuiltModels[0]) => {
    if (model.hasColorChoice && !prebuiltColors[model.id]) {
      toast({ title: "Kies een kleur", description: "Selecteer een kleur voordat u dit product toevoegt.", variant: "destructive" });
      return;
    }
    const selectedColorObj = model.hasColorChoice ? plaColors.find(c => c.id === prebuiltColors[model.id]) : undefined;
    const qty = prebuiltQuantities[model.id] || 1;
    const newItem: PrebuiltCartItem = {
      id: `prebuilt-${Date.now()}`,
      name: model.name,
      quantity: qty,
      price: model.price * qty,
      prebuiltId: model.id,
      stemText: model.hasTextInput ? (prebuiltStemTexts[model.id] || "") : undefined,
      color: selectedColorObj?.id,
      colorName: selectedColorObj?.name,
    };
    setPrebuiltCart([...prebuiltCart, newItem]);
    toast({ title: "Toegevoegd", description: `${model.name} is toegevoegd.` });
  };

  const removePrebuilt = (itemId: string) => {
    setPrebuiltCart(prebuiltCart.filter(item => item.id !== itemId));
  };

  const prebuiltTotal = prebuiltCart.reduce((t, i) => t + i.price, 0);

  // Validation
  const hasValidLinks = orderLinks.some(l => l.url.trim() !== "" && l.files.some(f => f.name.trim() !== "" && f.material && f.color));
  const hasPrebuiltItems = prebuiltCart.length > 0;
  const canProceedToStep2 = hasValidLinks || hasPrebuiltItems;
  const canSubmit = formData.name && formData.email && formData.address && formData.city && formData.postalCode && formData.agreeTerms && canProceedToStep2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      // Build link items for email
      const linkItems = orderLinks
        .filter(l => l.url.trim() !== "")
        .map(l => ({
          url: l.url,
          files: l.files.filter(f => f.name.trim() !== "").map(f => ({
            name: f.name,
            quantity: f.quantity,
            material: materials.find(m => m.id === f.material)?.name || f.material,
            color: getColorsForMaterial(f.material).find(c => c.id === f.color)?.name || f.color,
          })),
        }));

      const prebuiltItems = prebuiltCart.map(item => ({
        name: item.name,
        type: "prebuilt" as const,
        quantity: item.quantity,
        price: item.price.toFixed(2),
        stemText: item.stemText,
        color: item.colorName,
      }));

      const customerData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        postalCode: formData.postalCode,
        notes: formData.notes,
      };

      const { error } = await supabase.functions.invoke("send-order-notification", {
        body: {
          orderDetails: {
            links: linkItems,
            prebuiltItems,
            prebuiltTotal: prebuiltTotal.toFixed(2),
          },
          customer: customerData,
        },
      });

      if (error) throw error;

      setOrderComplete(true);
      toast({ title: "Bestelling geplaatst!", description: "U ontvangt binnenkort een bevestigingsmail." });
    } catch (error) {
      console.error("Order error:", error);
      toast({ title: "Er ging iets mis", description: "Probeer het opnieuw of neem contact met ons op.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
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
                Je bestelling vliegt nu digitaal naar ons toe. We gaan direct aan de slag 
                en je ontvangt een bevestigingsmail met alle details op {formData.email}.
              </p>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-card rounded-2xl p-6 shadow-overweel-card text-left">
                <h3 className="font-semibold mb-4">Samenvatting</h3>
                <div className="space-y-3">
                  {orderLinks.filter(l => l.url.trim()).map((link, i) => (
                    <div key={link.id} className="border-b border-border pb-3">
                      <p className="text-sm font-medium text-accent break-all">🔗 {link.url}</p>
                      {link.files.filter(f => f.name.trim()).map((f, fi) => (
                        <p key={fi} className="text-xs text-muted-foreground ml-4">
                          {f.name} — {f.quantity}x — {materials.find(m => m.id === f.material)?.name} — {getColorsForMaterial(f.material).find(c => c.id === f.color)?.name}
                        </p>
                      ))}
                    </div>
                  ))}
                  {prebuiltCart.map(item => (
                    <div key={item.id} className="flex justify-between text-sm border-b border-border pb-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-muted-foreground text-xs">{item.quantity}x</p>
                      </div>
                      <span className="font-medium">€{item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  {prebuiltCart.length > 0 && (
                    <p className="text-lg font-bold text-accent pt-2">Kant-en-klaar totaal: €{prebuiltTotal.toFixed(2)}</p>
                  )}
                </div>
              </motion.div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6 text-left">
                <p className="text-sm text-amber-800">
                  ⚠️ <strong>Let op:</strong> De prijs voor custom prints wordt na de controle bepaald en aan u doorgegeven.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 text-left">
                <p className="text-sm text-blue-800">
                  📧 Als u geen bevestigingsmail ontvangt, kijk dan ook in uw spam/ongewenste berichten.
                </p>
              </div>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Plaats uw bestelling</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Deel de link naar je gewenste 3D-bestanden, geef per bestand de details op en wij printen het voor je.
            </p>
          </motion.div>

          {/* Disclaimers */}
          <div className="max-w-4xl mx-auto mb-8 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                ⚠️ <strong>Belangrijk:</strong> De prijs voor custom prints wordt na de controle bepaald en aan je doorgegeven.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>Links:</strong> Alleen links met gratis te downloaden bestanden worden geaccepteerd. Zijn de bestanden betaald? Stuur ze dan via <a href="https://wetransfer.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">WeTransfer</a> en plak de WeTransfer-link hieronder.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>Let op:</strong> Op de kant-en-klare modellen na worden onderdelen niet in elkaar gezet geleverd.
              </p>
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

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
                    {/* Pre-built Models */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                        <Star className="w-6 h-6 text-accent" />
                        Kant-en-klare modellen
                      </h2>
                      <p className="text-sm text-muted-foreground mb-6">
                        Direct leverbaar tegen vaste prijs. Deze worden volledig afgemonteerd geleverd.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {prebuiltModels.map((model) => (
                          <div key={model.id} className="p-6 rounded-xl border-2 border-border hover:border-accent/50 transition-all">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="text-4xl">{model.image}</div>
                              <div>
                                <p className="font-semibold">{model.name}</p>
                                <p className="text-accent font-bold">€{model.price.toFixed(2)}</p>
                              </div>
                            </div>

                            {model.hasTextInput && (
                              <div className="mb-4">
                                <Label className="text-sm mb-1 block">{model.textLabel}</Label>
                                <Input
                                  maxLength={model.textMaxLength}
                                  value={prebuiltStemTexts[model.id] || ""}
                                  onChange={(e) => setPrebuiltStemTexts({ ...prebuiltStemTexts, [model.id]: e.target.value })}
                                  placeholder="Typ hier je tekst (max 25 tekens)"
                                />
                                <p className="text-xs text-muted-foreground mt-1">{(prebuiltStemTexts[model.id] || "").length}/{model.textMaxLength} tekens</p>
                              </div>
                            )}

                            {model.hasColorChoice && (
                              <div className="mb-4">
                                <Label className="text-sm mb-2 block">Kies een kleur (verplicht)</Label>
                                <div className="flex flex-wrap gap-2">
                                  {plaColors.map((color) => (
                                    <button
                                      key={color.id}
                                      onClick={() => setPrebuiltColors({ ...prebuiltColors, [model.id]: color.id })}
                                      className={`w-8 h-8 rounded-full border-3 transition-all ${prebuiltColors[model.id] === color.id ? "border-accent scale-110 ring-2 ring-accent" : "border-border hover:scale-105"}`}
                                      style={{ backgroundColor: color.hex }}
                                      title={color.name}
                                    >
                                      {prebuiltColors[model.id] === color.id && (
                                        <Check className={`w-4 h-4 mx-auto ${color.hex === "#FFFFFF" || color.hex === "#FFDD00" ? "text-primary" : "text-white"}`} />
                                      )}
                                    </button>
                                  ))}
                                </div>
                                {prebuiltColors[model.id] && <p className="text-xs text-muted-foreground mt-1">Gekozen: {plaColors.find(c => c.id === prebuiltColors[model.id])?.name}</p>}
                              </div>
                            )}

                            <div className="mb-4">
                              <Label className="text-sm mb-1 block">Aantal</Label>
                              <Input
                                type="number"
                                min={1}
                                value={prebuiltQuantities[model.id] || 1}
                                onChange={(e) => setPrebuiltQuantities({ ...prebuiltQuantities, [model.id]: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-24"
                              />
                            </div>

                            <Button variant="outline" size="sm" onClick={() => addPrebuiltToCart(model)} className="w-full">
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Toevoegen (€{((prebuiltQuantities[model.id] || 1) * model.price).toFixed(2)})
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links Section */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                        <Link2 className="w-6 h-6 text-accent" />
                        Bestanden via link
                      </h2>
                      <p className="text-sm text-muted-foreground mb-6">
                        Plak een downloadlink (bijv. Thingiverse, Printables, WeTransfer) en geef per bestand aan wat je wilt. 
                        Als je alle bestanden van een link wilt printen, vul dan "Alle bestanden" in als bestandsnaam.
                      </p>

                      <div className="space-y-8">
                        {orderLinks.map((link, linkIndex) => (
                          <div key={link.id} className="border-2 border-border rounded-xl p-6 relative">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-semibold text-sm text-muted-foreground">Link {linkIndex + 1}</h3>
                              {orderLinks.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => removeLink(link.id)} className="text-destructive hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>

                            <div className="mb-4">
                              <Label className="text-sm mb-1 block">Download-link *</Label>
                              <Input
                                value={link.url}
                                onChange={(e) => updateLinkUrl(link.id, e.target.value)}
                                placeholder="https://www.thingiverse.com/thing/... of WeTransfer-link"
                              />
                            </div>

                            <div className="space-y-4">
                              <Label className="text-sm font-medium block">Bestanden uit deze link:</Label>
                              {link.files.map((file, fileIndex) => (
                                <div key={fileIndex} className="bg-muted/50 rounded-lg p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">Bestand {fileIndex + 1}</span>
                                    {link.files.length > 1 && (
                                      <Button variant="ghost" size="sm" onClick={() => removeFileFromLink(link.id, fileIndex)} className="h-6 w-6 p-0 text-destructive">
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs">Bestandsnaam *</Label>
                                      <Input
                                        value={file.name}
                                        onChange={(e) => updateFile(link.id, fileIndex, "name", e.target.value)}
                                        placeholder="bijv. houder.stl of Alle bestanden"
                                        className="text-sm"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Aantal *</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={file.quantity}
                                        onChange={(e) => updateFile(link.id, fileIndex, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                                        className="text-sm"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs">Materiaal *</Label>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {materials.map((m) => (
                                          <button
                                            key={m.id}
                                            onClick={() => updateFile(link.id, fileIndex, "material", m.id)}
                                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${file.material === m.id ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-accent/50"}`}
                                          >
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
                                            <button
                                              key={color.id}
                                              onClick={() => updateFile(link.id, fileIndex, "color", color.id)}
                                              className={`w-7 h-7 rounded-full border-2 transition-all ${file.color === color.id ? "border-accent scale-110 ring-2 ring-accent" : "border-border hover:scale-105"}`}
                                              style={{ backgroundColor: color.hex }}
                                              title={color.name}
                                            >
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

                    {/* Proceed */}
                    <div className="flex justify-end">
                      <Button variant="hero" onClick={() => setStep(2)} disabled={!canProceedToStep2}>
                        Verder naar gegevens
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="bg-card rounded-2xl p-8 shadow-overweel-card">
                    <h2 className="text-xl font-bold mb-6">Jouw gegevens</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <Label htmlFor="name">Naam *</Label>
                        <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Je volledige naam" />
                      </div>
                      <div>
                        <Label htmlFor="email">E-mail *</Label>
                        <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="je@email.nl" />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefoon</Label>
                        <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="06-12345678" />
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postcode *</Label>
                        <Input id="postalCode" value={formData.postalCode} onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })} placeholder="1234 AB" />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="address">Adres *</Label>
                        <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Straat en huisnummer" />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="city">Plaats *</Label>
                        <Input id="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Woonplaats" />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="notes">Opmerkingen / speciale instructies</Label>
                        <Textarea id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Bijv. specifieke bestanden uit een link, infill-percentage, etc." rows={3} />
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="flex items-start gap-3">
                        <Checkbox id="terms" checked={formData.agreeTerms} onCheckedChange={(checked) => setFormData({ ...formData, agreeTerms: checked as boolean })} />
                        <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
                          Ik ga akkoord met de{" "}
                          <a href="/voorwaarden" className="text-accent underline" target="_blank">algemene voorwaarden</a>
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
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Overzicht
                  </h3>

                  {(hasValidLinks || hasPrebuiltItems) ? (
                    <div className="space-y-4">
                      {/* Links summary */}
                      {orderLinks.filter(l => l.url.trim()).map((link, i) => (
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

                      {/* Prebuilt summary */}
                      {prebuiltCart.map((item) => (
                        <div key={item.id} className="flex justify-between items-start border-b border-border pb-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.name}</p>
                            {item.colorName && <p className="text-xs text-muted-foreground">Kleur: {item.colorName}</p>}
                            {item.stemText && <p className="text-xs text-muted-foreground">Tekst: "{item.stemText}"</p>}
                            <p className="text-xs text-muted-foreground">{item.quantity}x</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">€{item.price.toFixed(2)}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePrebuilt(item.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {prebuiltCart.length > 0 && (
                        <div className="border-t border-border pt-3">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-sm">Kant-en-klaar totaal</span>
                            <span className="text-xl font-bold text-accent">€{prebuiltTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {hasValidLinks && (
                        <p className="text-xs text-muted-foreground">
                          * Prijs voor custom prints wordt na controle gecommuniceerd.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">Voeg links of producten toe</p>
                    </div>
                  )}
                </motion.div>

                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-accent" />
                    <span>Prijsgarantie na bevestiging</span>
                  </div>
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
