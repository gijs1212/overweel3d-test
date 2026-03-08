import { useState, useCallback, useEffect } from "react";
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
import { Upload, Check, Loader2, AlertCircle, Trash2, FileText, Plus, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MATERIALS, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants";
import { parse3DFile, estimatePrintWeight } from "@/lib/stlParser";

interface UploadedFile {
  file: File;
  material: string;
  color: string;
  quantity: number;
  volumeCm3?: number;
  estimatedGrams?: number;
  dimensions?: { width: number; height: number; depth: number };
  parsing?: boolean;
}

export default function NewOrder() {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Files
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

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

  // Auto-fill when profile loads
  useState(() => {
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
  });

  const ALLOWED_EXTENSIONS = [".stl", ".obj", ".3mf", ".step", ".stp"];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    const validExt = files.filter((f) => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf("."));
      return ALLOWED_EXTENSIONS.includes(ext);
    });
    const invalidExt = files.filter((f) => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf("."));
      return !ALLOWED_EXTENSIONS.includes(ext);
    });
    if (invalidExt.length > 0) {
      toast({
        title: "Ongeldig bestandstype",
        description: `Alleen STL, OBJ, 3MF en STEP bestanden zijn toegestaan. ${invalidExt.map((f) => f.name).join(", ")} is overgeslagen.`,
        variant: "destructive",
      });
    }

    const newFiles: UploadedFile[] = validExt
      .filter((f) => f.size <= MAX_FILE_SIZE)
      .map((file) => ({ file, material: "", color: "", quantity: 1, parsing: true }));

    const tooLarge = validExt.filter((f) => f.size > MAX_FILE_SIZE);
    if (tooLarge.length > 0) {
      toast({
        title: "Bestand(en) te groot (max 10MB)",
        description: `${tooLarge.map((f) => f.name).join(", ")} — stuur grotere bestanden via e-mail naar gijsoverweel@gmail.com`,
        variant: "destructive",
      });
    }
    
    const startIndex = uploadedFiles.length;
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    
    // Parse volumes in background
    for (let i = 0; i < newFiles.length; i++) {
      const uf = newFiles[i];
      parse3DFile(uf.file).then((result) => {
        setUploadedFiles((prev) => {
          const updated = [...prev];
          const idx = startIndex + i;
          if (updated[idx]) {
            if (result) {
              const grams = estimatePrintWeight(result.volumeCm3);
              updated[idx] = {
                ...updated[idx],
                volumeCm3: result.volumeCm3,
                estimatedGrams: grams,
                dimensions: result.boundingBox,
                parsing: false,
              };
            } else {
              // Fallback: file-size based estimate
              updated[idx] = {
                ...updated[idx],
                estimatedGrams: Math.max(10, Math.round(uf.file.size / 1024)),
                parsing: false,
              };
            }
          }
          return updated;
        });
      });
    }
    
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const updateFile = (index: number, field: keyof UploadedFile, value: any) => {
    const updated = [...uploadedFiles];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "material") updated[index].color = "";
    setUploadedFiles(updated);
  };

  const getColorsForMaterial = (materialId: string) => {
    return MATERIALS.find((m) => m.id === materialId)?.colors || [];
  };

  // Estimate calculator - now volume-based
  const calculateEstimate = () => {
    let total = 0;
    for (const uf of uploadedFiles) {
      const mat = MATERIALS.find((m) => m.id === uf.material);
      if (mat && uf.estimatedGrams) {
        total += uf.estimatedGrams * mat.pricePerGram * uf.quantity;
      }
    }
    return Math.max(total, uploadedFiles.length > 0 ? 5 : 0); // Minimum €5
  };

  const estimatedPrice = calculateEstimate();
  const isParsing = uploadedFiles.some((f) => f.parsing);
  const allFilesConfigured = uploadedFiles.length > 0 && uploadedFiles.every((f) => f.material && f.color);
  const canProceed = allFilesConfigured;
  const canSubmit = formData.name && formData.email && formData.billing_address && formData.city && formData.postal_code && formData.agreeTerms && canProceed;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    try {
      // 1. Generate order number
      const { data: orderNumData, error: orderNumError } = await supabase.rpc("generate_order_number");
      if (orderNumError) throw orderNumError;
      const orderNumber = orderNumData as string;

      // 2. Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
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
          
          material: uploadedFiles.map((f) => MATERIALS.find((m) => m.id === f.material)?.name).join(", "),
          color: uploadedFiles.map((f) => getColorsForMaterial(f.material).find((c) => c.id === f.color)?.name).join(", "),
          quantity: uploadedFiles.reduce((sum, f) => sum + f.quantity, 0),
          notes: formData.notes,
          print_preferences: formData.print_preferences,
          instant_quote_price: estimatedPrice,
          status: "submitted",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 3. Upload files to storage and create records
      for (const uf of uploadedFiles) {
        const storagePath = `${orderNumber}/files/${uf.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("orders")
          .upload(storagePath, uf.file, { upsert: true });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        await supabase.from("order_files").insert({
          order_id: order.id,
          storage_path: storagePath,
          original_filename: uf.file.name,
          file_size: uf.file.size,
          mime_type: uf.file.type || "application/octet-stream",
        });
      }

      // 4. Send confirmation email
      await supabase.functions.invoke("send-order-email", {
        body: {
          type: "order_confirmation",
          orderId: order.id,
        },
      });

      // 5. Navigate to success
      navigate(`/order/${order.customer_order_token}?success=true`);
    } catch (error: any) {
      console.error("Order error:", error);
      toast({ title: "Er ging iets mis", description: error.message || "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">Upload uw bestand</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload uw 3D-bestanden, configureer uw print en ontvang direct een indicatieprijs.
            </p>
          </motion.div>

          {/* Disclaimer */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Belangrijk:</strong> De indicatieprijs is slechts een schatting en is nooit de definitieve prijs. De definitieve prijs wordt na controle door de admin vastgesteld. Minimum bestelling is €5,-.
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
                    {/* File Upload */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-3">
                        <Upload className="w-6 h-6 text-accent" />
                        Upload 3D-bestanden
                      </h2>

                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-accent/50 transition-colors">
                        <input
                          type="file"
                          accept={ACCEPTED_FILE_TYPES}
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                          id="file-upload"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer">
                          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="font-medium text-primary">Sleep bestanden hierheen of klik om te uploaden</p>
                          <p className="text-sm text-muted-foreground mt-2">STL, OBJ, 3MF, STEP (max 10MB per bestand)</p>
                          <p className="text-xs text-muted-foreground mt-1">Groter dan 10MB? Stuur het bestand via e-mail naar <a href="mailto:gijsoverweel@gmail.com" className="text-accent underline">gijsoverweel@gmail.com</a></p>
                        </label>
                      </div>

                      {/* File List */}
                      {uploadedFiles.length > 0 && (
                        <div className="mt-6 space-y-4">
                          {uploadedFiles.map((uf, index) => (
                            <div key={index} className="border border-border rounded-xl p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-5 h-5 text-accent" />
                                  <span className="font-medium text-sm truncate max-w-[200px]">{uf.file.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({(uf.file.size / 1024 / 1024).toFixed(1)} MB)
                                  </span>
                                  {uf.parsing && <Loader2 className="w-3 h-3 animate-spin text-accent" />}
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                              {/* Volume & weight info */}
                              {!uf.parsing && uf.estimatedGrams && (
                                <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  {uf.volumeCm3 != null && (
                                    <span>📐 Volume: {uf.volumeCm3.toFixed(1)} cm³</span>
                                  )}
                                  <span>⚖️ ~{uf.estimatedGrams.toFixed(0)}g (20% infill)</span>
                                  {uf.dimensions && (
                                    <span>📏 {uf.dimensions.width.toFixed(0)}×{uf.dimensions.height.toFixed(0)}×{uf.dimensions.depth.toFixed(0)} mm</span>
                                  )}
                                </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">Materiaal</Label>
                                  <Select value={uf.material} onValueChange={(v) => updateFile(index, "material", v)}>
                                    <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                                    <SelectContent>
                                      {MATERIALS.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Kleur</Label>
                                  <Select value={uf.color} onValueChange={(v) => updateFile(index, "color", v)} disabled={!uf.material}>
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
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Aantal</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={uf.quantity}
                                    onChange={(e) => updateFile(index, "quantity", parseInt(e.target.value) || 1)}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
                      <h2 className="text-xl font-bold mb-4">Extra informatie</h2>
                      <div className="space-y-4">
                        <div>
                          <Label>Opmerkingen</Label>
                          <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Speciale wensen, instructies, etc."
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label>Print voorkeuren</Label>
                          <Textarea
                            value={formData.print_preferences}
                            onChange={(e) => setFormData({ ...formData, print_preferences: e.target.value })}
                            placeholder="Infill percentage, layer hoogte, etc. (optioneel)"
                            rows={2}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={() => setStep(2)} disabled={!canProceed} size="lg">
                        Verder naar gegevens
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="bg-card rounded-2xl p-8 shadow-overweel-card space-y-6">
                      <h2 className="text-xl font-bold flex items-center gap-3">
                        <Info className="w-6 h-6 text-accent" />
                        Uw gegevens
                      </h2>

                      {!user && (
                        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 text-sm">
                          <p className="text-primary">
                            💡 <a href="/login" className="text-accent underline font-medium">Log in</a> of{" "}
                            <a href="/register" className="text-accent underline font-medium">maak een account</a> om uw gegevens automatisch in te vullen bij toekomstige bestellingen.
                          </p>
                        </div>
                      )}

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

                      <div className="flex items-start gap-2 pt-4">
                        <Checkbox
                          id="terms"
                          checked={formData.agreeTerms}
                          onCheckedChange={(checked) => setFormData({ ...formData, agreeTerms: checked === true })}
                        />
                        <label htmlFor="terms" className="text-sm text-muted-foreground">
                          Ik ga akkoord met de{" "}
                          <a href="/voorwaarden" target="_blank" className="text-accent underline">
                            algemene voorwaarden
                          </a>
                        </label>
                      </div>

                      <div className="flex justify-between pt-4">
                        <Button variant="outline" onClick={() => setStep(1)}>Terug</Button>
                        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} size="lg">
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Bestelling plaatsen...</>
                          ) : (
                            "Bestelling plaatsen"
                          )}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sidebar - Quote */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                  <h3 className="font-bold text-primary mb-4">Overzicht</h3>

                  {uploadedFiles.length === 0 ? (
                   <p className="text-sm text-muted-foreground">Upload bestanden om een indicatieprijs te zien.</p>
                  ) : (
                    <div className="space-y-3">
                      {uploadedFiles.map((uf, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-border pb-2">
                          <div>
                            <p className="font-medium truncate max-w-[150px]">{uf.file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {MATERIALS.find((m) => m.id === uf.material)?.name || "—"} · {uf.quantity}x
                            </p>
                          </div>
                        </div>
                      ))}

                      <div className="border-t border-border pt-3">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-primary">Indicatieprijs</span>
                          <span className="text-xl font-bold text-accent">
                            €{estimatedPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      ⚠️ Deze indicatieprijs is slechts een schatting en is nooit de definitieve prijs. Minimum bestelling is €5,-.
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
  );
}
