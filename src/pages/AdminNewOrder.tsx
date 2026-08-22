import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ArrowLeft, Tag, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus, MATERIALS } from "@/lib/constants";
import { normalizePlatePrintQuantities } from "@/lib/plateTracking";
import { availableFilamentColorsForMaterial, FilamentColor } from "@/lib/productCatalog";
import { calculateDiscount, discountValidationError, type ApplicableDiscount } from "@/lib/discounts";

export default function AdminNewOrder() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [totalProducts, setTotalProducts] = useState("1");
  const [totalPlates, setTotalPlates] = useState("0");
  const [platePrintQuantities, setPlatePrintQuantities] = useState<number[]>([]);
  const [filenames, setFilenames] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [internalNotes, setInternalNotes] = useState("");
  const [filamentColors, setFilamentColors] = useState<FilamentColor[]>([]);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<ApplicableDiscount | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);

  const baseFinalPrice = Number(finalPrice);
  const discountPricing = calculateDiscount(baseFinalPrice, appliedDiscount);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    supabase
      .from("filament_colors")
      .select("*")
      .eq("active", true)
      .order("material")
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) {
          toast({ title: "Kleuren laden mislukt", description: error.message, variant: "destructive" });
          return;
        }
        setFilamentColors((data || []) as unknown as FilamentColor[]);
      });
  }, [authLoading, isAdmin, toast]);

  if (authLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Geen toegang.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const getColorsForMaterial = (materialId: string) => {
    return availableFilamentColorsForMaterial(filamentColors, materialId);
  };

  const handleTotalPlatesChange = (value: string) => {
    setTotalPlates(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 0) {
      setPlatePrintQuantities((current) => normalizePlatePrintQuantities(current, count));
    }
  };

  const setPlatePrintQuantity = (plateIndex: number, value: string) => {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setPlatePrintQuantities((current) => current.map((item, index) => (
      index === plateIndex ? quantity : item
    )));
  };

  const applyDiscountCode = async () => {
    if (!discountCode.trim()) return;
    if (!Number.isFinite(baseFinalPrice) || baseFinalPrice <= 0) {
      toast({ title: "Vul eerst een definitieve prijs in", variant: "destructive" });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(customerEmail.trim())) {
      toast({ title: "Vul eerst een geldig e-mailadres van de klant in", variant: "destructive" });
      return;
    }
    setCheckingDiscount(true);
    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("code,discount_type,discount_value,active,expires_at,max_uses,times_used,assigned_to_email,is_referral")
        .eq("code", discountCode.toUpperCase().trim())
        .maybeSingle();
      if (error) throw error;
      const candidate = data as ApplicableDiscount | null;
      const validationError = discountValidationError(candidate, customerEmail);
      if (validationError) {
        setAppliedDiscount(null);
        toast({ title: validationError, variant: "destructive" });
        return;
      }
      setAppliedDiscount(candidate);
      setDiscountCode(candidate!.code);
      toast({ title: `Kortingscode ${candidate!.code} toegepast` });
    } catch (error) {
      toast({ title: "Kortingscode controleren mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setCheckingDiscount(false);
    }
  };

  const handleSave = async () => {
    if (!customerName.trim() || !customerEmail.trim()) {
      toast({ title: "Naam en e-mail van klant zijn verplicht", variant: "destructive" });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(customerEmail.trim())) {
      toast({ title: "Vul een geldig e-mailadres in", variant: "destructive" });
      return;
    }

    const parsedProducts = Number(totalProducts);
    const parsedPlates = Number(totalPlates);
    if (!Number.isInteger(parsedProducts) || parsedProducts < 0 || !Number.isInteger(parsedPlates) || parsedPlates < 0) {
      toast({ title: "Controleer het aantal producten en platen", variant: "destructive" });
      return;
    }
    const normalizedPrintQuantities = normalizePlatePrintQuantities(platePrintQuantities, parsedPlates);
    setSaving(true);
    try {
      let verifiedDiscount: ApplicableDiscount | null = null;
      if (appliedDiscount) {
        const { data, error: discountError } = await supabase
          .from("discount_codes")
          .select("code,discount_type,discount_value,active,expires_at,max_uses,times_used,assigned_to_email,is_referral")
          .eq("code", appliedDiscount.code)
          .maybeSingle();
        if (discountError) throw discountError;
        verifiedDiscount = data as ApplicableDiscount | null;
        const validationError = discountValidationError(verifiedDiscount, customerEmail);
        if (validationError) throw new Error(validationError);
      }
      const parsedFinalPrice = finalPrice ? Number(finalPrice) : null;
      if (parsedFinalPrice !== null && (!Number.isFinite(parsedFinalPrice) || parsedFinalPrice < 0)) throw new Error("Vul een geldige definitieve prijs in.");
      if (verifiedDiscount && (!parsedFinalPrice || parsedFinalPrice <= 0)) throw new Error("Een kortingscode kan alleen op een prijs groter dan €0 worden toegepast.");
      const finalPricing = calculateDiscount(parsedFinalPrice || 0, verifiedDiscount);

      const { data: orderNumData, error: orderNumError } = await supabase.rpc("generate_order_number");
      if (orderNumError) throw orderNumError;
      const orderNumber = orderNumData as string;

      const materialName = MATERIALS.find((m) => m.id === material)?.name || material;
      const colorName = color === "multicolor"
        ? "Multicolor (meerdere kleuren)"
        : getColorsForMaterial(material).find((c) => c.id === color)?.name || color;

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          user_id: null,
          customer_email: customerEmail.trim(),
          customer_name: customerName.trim(),
          material: materialName,
          color: colorName,
          quantity: parsedProducts,
          total_products: parsedProducts,
          total_plates: parsedPlates,
          plate_print_statuses: Array.from({ length: parsedPlates }, () => false),
          plate_runs_required_per_plate: normalizedPrintQuantities,
          notes: filenames ? `Bestandsnamen: ${filenames}` : "",
          final_price: parsedFinalPrice === null ? null : finalPricing.total,
          applied_discount_code: verifiedDiscount?.code || null,
          instant_quote_price: 0,
          status,
          internal_notes: internalNotes,
        })
        .select()
        .single();

      if (error) throw error;

      let discountUsageWarning = "";
      if (verifiedDiscount) {
        const { error: usageError } = await supabase.rpc("increment_discount_usage", { code_text: verifiedDiscount.code });
        if (usageError) discountUsageWarning = ` Het gebruik van kortingscode ${verifiedDiscount.code} kon niet worden bijgewerkt.`;
        if (verifiedDiscount.is_referral) {
          const { error: referralError } = await supabase.functions.invoke("process-referral-reward", {
            body: { order_id: order.id, discount_code: verifiedDiscount.code },
          });
          if (referralError) discountUsageWarning += " De referralbeloning kon niet automatisch worden verwerkt.";
        }
      }

      const { data: mailData, error: mailError } = await supabase.functions.invoke("send-order-email", {
        body: { type: "admin_order_created", orderId: order.id },
      });

      if (mailError || !mailData?.success) {
        toast({
          title: `Bestelling ${orderNumber} is aangemaakt`,
          description: `De bedankmail kon niet worden verzonden: ${mailError?.message || mailData?.error || "onbekende e-mailfout"}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: `Bestelling ${orderNumber} aangemaakt`,
          description: `De klant heeft één bedankmail ontvangen.${discountUsageWarning}`,
        });
      }
      navigate(`/admin/order/${order.id}`);
    } catch (error: unknown) {
      const description = error instanceof Error ? error.message : "Onbekende fout";
      toast({ title: "Fout bij aanmaken", description, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-4 h-4" /> Terug
            </Button>
            <h1 className="text-2xl font-bold text-primary">Nieuwe bestelling aanmaken</h1>
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card space-y-6">
              <p className="text-sm text-muted-foreground">
                Vul naam en e-mail van de klant in. De klant ontvangt updates op dit e-mailadres.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Naam klant *</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Voor- en achternaam" />
                </div>
                <div>
                  <Label>E-mail klant *</Label>
                  <Input type="email" value={customerEmail} onChange={(e) => { setCustomerEmail(e.target.value); setAppliedDiscount(null); }} placeholder="klant@email.nl" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Materiaal</Label>
                  <Select value={material} onValueChange={(v) => { setMaterial(v); setColor(""); }}>
                    <SelectTrigger><SelectValue placeholder="Kies materiaal" /></SelectTrigger>
                    <SelectContent>
                      {MATERIALS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kleur</Label>
                  <Select value={color} onValueChange={setColor} disabled={!material}>
                    <SelectTrigger><SelectValue placeholder="Kies kleur" /></SelectTrigger>
                    <SelectContent>
                      {getColorsForMaterial(material).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: c.hex }} />
                            {c.name}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="multicolor">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border" style={{ background: "conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#a855f7,#ef4444)" }} />
                          Multicolor (meerdere kleuren)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Totaal producten</Label>
                  <Input type="number" min={0} step={1} value={totalProducts} onChange={(e) => setTotalProducts(e.target.value)} />
                </div>
                <div>
                  <Label>Aantal platen</Label>
                  <Input type="number" min={0} step={1} value={totalPlates} onChange={(e) => handleTotalPlatesChange(e.target.value)} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {platePrintQuantities.length > 0 && (
                <div>
                  <Label>Hoe vaak moet elke plaat worden geprint?</Label>
                  <p className="text-xs text-muted-foreground mb-2">Standaard staat iedere plaat op 1 keer.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {platePrintQuantities.map((quantity, plateIndex) => (
                      <div key={plateIndex}>
                        <Label htmlFor={`new-order-plate-${plateIndex}`} className="text-xs">
                          Plaat {plateIndex + 1}
                        </Label>
                        <Input
                          id={`new-order-plate-${plateIndex}`}
                          type="number"
                          min={1}
                          step={1}
                          value={quantity}
                          onChange={(event) => setPlatePrintQuantity(plateIndex, event.target.value)}
                          aria-label={`Aantal keer plaat ${plateIndex + 1} printen`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Bestandsnamen</Label>
                <Textarea
                  value={filenames}
                  onChange={(e) => setFilenames(e.target.value)}
                  placeholder="bijv. onderdeel_a.stl, behuizing.step (één per regel of komma-gescheiden)"
                  rows={3}
                />
              </div>

              <div>
                <Label>Definitieve prijs (€)</Label>
                <Input type="number" step="0.01" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="0.00" />
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <Label className="flex items-center gap-2"><Tag className="w-4 h-4" /> Kortingscode klant</Label>
                {appliedDiscount ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald/10 p-3">
                    <div className="text-sm">
                      <strong>{appliedDiscount.code}</strong> · {appliedDiscount.discount_type === "percentage" ? `${Number(appliedDiscount.discount_value)}%` : `€${Number(appliedDiscount.discount_value).toFixed(2)}`} korting
                      <p className="text-muted-foreground mt-1">Korting: €{discountPricing.discountAmount.toFixed(2)} · Nieuwe prijs: €{discountPricing.total.toFixed(2)}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setAppliedDiscount(null); setDiscountCode(""); }}><X className="w-4 h-4" /> Verwijderen</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={discountCode} onChange={(event) => setDiscountCode(event.target.value.toUpperCase())} placeholder="Voer kortingscode in" />
                    <Button type="button" variant="outline" onClick={applyDiscountCode} disabled={checkingDiscount || !discountCode.trim()}>
                      {checkingDiscount ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toepassen"}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label>Interne notities</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} placeholder="Alleen zichtbaar voor admin." />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Bestelling aanmaken
              </Button>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
