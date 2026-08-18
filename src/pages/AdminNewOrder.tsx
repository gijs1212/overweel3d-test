import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus, MATERIALS } from "@/lib/constants";

export default function AdminNewOrder() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [filenames, setFilenames] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [internalNotes, setInternalNotes] = useState("");

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
    return MATERIALS.find((m) => m.id === materialId)?.colors || [];
  };

  const handleSave = async () => {
    if (!customerName.trim() || !customerEmail.trim()) {
      toast({ title: "Naam en e-mail van klant zijn verplicht", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
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
          quantity: parseInt(quantity) || 1,
          notes: filenames ? `Bestandsnamen: ${filenames}` : "",
          final_price: finalPrice ? parseFloat(finalPrice) : null,
          instant_quote_price: 0,
          status,
          internal_notes: internalNotes,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: `Bestelling ${orderNumber} aangemaakt! ✅` });
      navigate(`/admin/order/${order.id}`);
    } catch (error: any) {
      toast({ title: "Fout bij aanmaken", description: error.message, variant: "destructive" });
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
                  <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="klant@email.nl" />
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
                  <Label>Aantal</Label>
                  <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
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
