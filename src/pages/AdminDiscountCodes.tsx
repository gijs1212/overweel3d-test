import { useCallback, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Save, Trash2, Loader2, Tag, ToggleLeft, ToggleRight, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { sendAutomaticNewsletters } from "@/lib/automaticNewsletter";
import { buildDiscountNewsletterDetails } from "@/lib/discounts";

interface DiscountProduct {
  id: string;
  name: string;
}
interface DiscountCategory { id: string; name: string }

interface DiscountCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  times_used: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
  is_referral?: boolean;
  is_public: boolean;
  owner_email?: string | null;
  owner_name?: string | null;
  reward_percentage?: number | null;
  assigned_to_email?: string | null;
  parent_code_id?: string | null;
  product_id: string | null;
  category_id: string | null;
  minimum_order_amount: number;
  stackable: boolean;
  per_customer_limit: number | null;
  starts_at: string | null;
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Onbekende fout";

export default function AdminDiscountCodes() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [products, setProducts] = useState<DiscountProduct[]>([]);
  const [categories, setCategories] = useState<DiscountCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteCodeId, setDeleteCodeId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: 10,
    max_uses: "" as string,
    expires_at: "",
    is_referral: false,
    is_public: false,
    owner_email: "",
    owner_name: "",
    reward_percentage: 10,
    product_id: "",
    category_id: "",
    minimum_order_amount: 0,
    per_customer_limit: "1",
    starts_at: "",
    stackable: false,
  });

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    const [codeResult, productResult, categoryResult] = await Promise.all([
      supabase.from("discount_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,name").eq("active", true).order("name"),
      supabase.from("product_categories").select("id,name").eq("active", true).order("name"),
    ]);
    const error = codeResult.error || productResult.error || categoryResult.error;
    if (error) {
      toast({ title: "Kortingscodes laden mislukt", description: error.message, variant: "destructive" });
    } else {
      setCodes((codeResult.data as DiscountCode[]) || []);
      setProducts((productResult.data as DiscountProduct[]) || []);
      setCategories((categoryResult.data as DiscountCategory[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) void fetchCodes();
    if (!authLoading && !isAdmin) setLoading(false);
  }, [authLoading, fetchCodes, isAdmin]);

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: "Vul een code in", variant: "destructive" });
      return;
    }
    if (form.is_referral && !form.owner_email.trim()) {
      toast({ title: "Vul een e-mail van de eigenaar in", variant: "destructive" });
      return;
    }
    if (form.discount_value <= 0 || (form.discount_type === "percentage" && form.discount_value > 100)) {
      toast({ title: "Vul een geldige kortingswaarde in", description: "Een percentage moet tussen 0 en 100 liggen.", variant: "destructive" });
      return;
    }
    if (form.max_uses && parseInt(form.max_uses) < 1) {
      toast({ title: "Maximaal gebruik moet minimaal 1 zijn", variant: "destructive" });
      return;
    }
    if (form.product_id && !form.expires_at) {
      toast({ title: "Kies een vervaldatum", description: "Een artikelkorting moet tijdelijk zijn.", variant: "destructive" });
      return;
    }
    if (form.starts_at && form.expires_at && new Date(form.starts_at) >= new Date(form.expires_at)) {
      toast({ title: "De einddatum moet na de startdatum liggen", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.toUpperCase().trim(),
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        expires_at: form.expires_at || null,
        is_referral: form.is_referral,
        is_public: form.product_id ? true : form.is_public,
        owner_email: form.is_referral ? form.owner_email.trim().toLowerCase() : null,
        owner_name: form.is_referral ? form.owner_name.trim() || null : null,
        reward_percentage: form.is_referral ? form.reward_percentage : null,
        product_id: form.product_id || null,
        category_id: form.category_id || null,
        minimum_order_amount: Math.max(0, Number(form.minimum_order_amount) || 0),
        per_customer_limit: form.per_customer_limit ? Math.max(1, Number(form.per_customer_limit)) : null,
        starts_at: form.starts_at || null,
        stackable: form.stackable,
      };
      const { data: createdCode, error } = await supabase.from("discount_codes").insert(payload).select("code,discount_type,discount_value,expires_at,max_uses,is_public,product_id,category_id,minimum_order_amount,starts_at,per_customer_limit").single();
      if (error) throw error;
      let newsletterError = "";
      if (createdCode.is_public) {
        const productName = products.find((product) => product.id === createdCode.product_id)?.name || null;
        const categoryName = categories.find((category) => category.id === createdCode.category_id)?.name || null;
        const ruleDetails = [
          createdCode.starts_at ? `Start op ${new Date(createdCode.starts_at).toLocaleString("nl-NL")}.` : "Direct geldig.",
          createdCode.minimum_order_amount > 0 ? `Minimale bestelwaarde €${Number(createdCode.minimum_order_amount).toFixed(2)}.` : "",
          createdCode.per_customer_limit ? `Maximaal ${createdCode.per_customer_limit} keer per klant.` : "",
          categoryName ? `Alleen voor categorie ${categoryName}.` : "",
        ].filter(Boolean).join(" ");
        const newsletter = await sendAutomaticNewsletters([{
          templateKind: "discount",
          changeType: "new",
          itemName: createdCode.code,
          details: `${buildDiscountNewsletterDetails({
            code: createdCode.code,
            discountType: createdCode.discount_type,
            discountValue: Number(createdCode.discount_value),
            expiresAt: createdCode.expires_at,
            maxUses: createdCode.max_uses,
            productName,
          })} ${ruleDetails}`,
          itemUrl: `${window.location.origin}/bestellen`,
        }]);
        newsletterError = newsletter.errors[0] || "";
      }
      toast({
        title: newsletterError ? "Kortingscode aangemaakt, nieuwsbrief mislukt" : "Kortingscode aangemaakt ✅",
        description: newsletterError || (createdCode.is_public ? "De kortingscode is naar de nieuwsbriefabonnees gestuurd." : "Privécode: er is geen nieuwsbrief verstuurd."),
        variant: newsletterError ? "destructive" : "default",
      });
      setForm({ code: "", discount_type: "percentage", discount_value: 10, max_uses: "", expires_at: "", is_referral: false, is_public: false, owner_email: "", owner_name: "", reward_percentage: 10, product_id: "", category_id: "", minimum_order_amount: 0, per_customer_limit: "1", starts_at: "", stackable: false });
      await fetchCodes();
    } catch (error: unknown) {
      toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (c: DiscountCode) => {
    setActionId(c.id);
    const { error } = await supabase.from("discount_codes").update({ active: !c.active }).eq("id", c.id);
    if (error) toast({ title: "Bijwerken mislukt", description: error.message, variant: "destructive" });
    else {
      toast({ title: c.active ? "Kortingscode gedeactiveerd" : "Kortingscode geactiveerd" });
      await fetchCodes();
    }
    setActionId(null);
  };

  const handleDelete = async () => {
    if (!deleteCodeId) return;
    const { error } = await supabase.from("discount_codes").delete().eq("id", deleteCodeId);
    if (error) toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Kortingscode verwijderd" }); await fetchCodes(); }
    setDeleteCodeId(null);
  };

  if (authLoading) return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><Loader2 aria-label="Toegang controleren" className="w-8 h-8 animate-spin text-accent" /></main><Footer /></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center"><p>Geen toegang.</p></main><Footer /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button>
            <h1 className="text-2xl font-bold text-primary">🏷️ Kortingscodes</h1>
          </div>

          {/* Create form */}
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
            <h3 className="font-bold text-primary mb-4">Nieuwe kortingscode</h3>
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-muted/50">
              <Switch id="is_referral" checked={form.is_referral} onCheckedChange={(v) => setForm({ ...form, is_referral: v })} />
              <Label htmlFor="is_referral" className="cursor-pointer flex items-center gap-2">
                <Users className="w-4 h-4" /> Referral code (eigenaar ontvangt beloning per gebruik)
              </Label>
            </div>
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl border">
              <Switch id="is_public" checked={form.is_public || Boolean(form.product_id)} disabled={Boolean(form.product_id)} onCheckedChange={(is_public) => setForm({ ...form, is_public })} />
              <Label htmlFor="is_public" className="cursor-pointer">
                {form.product_id
                  ? "Artikelkorting – automatisch openbaar en direct versturen naar de nieuwsbrief"
                  : form.is_public ? "Openbaar – direct versturen naar de nieuwsbrief" : "Privé – geen nieuwsbrief versturen"}
              </Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Code *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="bijv. ZOMER2026" className="uppercase" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.discount_type} onValueChange={v => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Vast bedrag (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Waarde {form.discount_type === "percentage" ? "(%)" : "(€)"}</Label>
                <Input type="number" step="0.01" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Max gebruik (leeg = onbeperkt)</Label>
                <Input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} placeholder="Onbeperkt" />
              </div>
              <div>
                <Label>Geldig vanaf (leeg = direct)</Label>
                <Input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
              </div>
              <div>
                <Label>Verloopt op (leeg = nooit)</Label>
                <Input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
              </div>
              <div>
                <Label>Geldig voor</Label>
                <Select value={form.product_id ? `product:${form.product_id}` : form.category_id ? `category:${form.category_id}` : "all"} onValueChange={scope => {
                  const [kind, id] = scope.split(":");
                  setForm({ ...form, product_id: kind === "product" ? id : "", category_id: kind === "category" ? id : "", is_public: kind === "product" ? true : form.is_public });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Volledige bestelling</SelectItem>
                    {categories.map(category => <SelectItem key={category.id} value={`category:${category.id}`}>Categorie: {category.name}</SelectItem>)}
                    {products.map(product => <SelectItem key={product.id} value={`product:${product.id}`}>Artikel: {product.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.product_id && <p className="text-xs text-muted-foreground mt-1">Artikelkorting: een vervaldatum is verplicht.</p>}
              </div>
              <div><Label>Minimale bestelwaarde (€)</Label><Input type="number" min={0} step="0.01" value={form.minimum_order_amount} onChange={e => setForm({ ...form, minimum_order_amount: Number(e.target.value) || 0 })} /></div>
              <div><Label>Maximaal per klant (leeg = onbeperkt)</Label><Input type="number" min={1} value={form.per_customer_limit} onChange={e => setForm({ ...form, per_customer_limit: e.target.value })} /></div>
              <div className="flex items-end gap-3 rounded-lg border p-3"><Switch id="stackable" checked={form.stackable} onCheckedChange={stackable => setForm({ ...form, stackable })} /><Label htmlFor="stackable">Combineerbaar met cadeaubon</Label></div>
              <div className="flex items-end">
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Aanmaken
                </Button>
              </div>
            </div>
            {form.is_referral && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
                <div>
                  <Label>E-mail eigenaar *</Label>
                  <Input type="email" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="naam@voorbeeld.nl" />
                </div>
                <div>
                  <Label>Naam eigenaar (optioneel)</Label>
                  <Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="Voor de mail-aanhef" />
                </div>
                <div>
                  <Label>Beloningspercentage (%)</Label>
                  <Input type="number" step="0.1" value={form.reward_percentage} onChange={e => setForm({ ...form, reward_percentage: parseFloat(e.target.value) || 0 })} />
                  <p className="text-xs text-muted-foreground mt-1">Eigenaar krijgt dit % van het bestelbedrag als kortingscode per e-mail.</p>
                </div>
              </div>
            )}
          </div>

          {/* Codes list */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : codes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nog geen kortingscodes.</p>
          ) : (
            <div className="space-y-3">
              {codes.map(c => {
                const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                const isMaxed = c.max_uses !== null && c.times_used >= c.max_uses;
                return (
                  <div key={c.id} className={`bg-card rounded-xl p-4 border flex items-center justify-between gap-4 ${!c.active || isExpired || isMaxed ? "opacity-60" : ""}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Tag className="w-4 h-4 text-accent" />
                        <span className="font-mono font-bold text-lg">{c.code}</span>
                        <span className="text-sm bg-muted px-2 py-0.5 rounded">
                          {c.discount_type === "percentage" ? `${c.discount_value}%` : `€${Number(c.discount_value).toFixed(2)}`}
                        </span>
                        {c.is_referral && (
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded flex items-center gap-1">
                            <Users className="w-3 h-3" /> Referral · {c.reward_percentage}%
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${c.is_public ? "bg-emerald/10 text-emerald" : "bg-muted text-muted-foreground"}`}>
                          {c.is_public ? "Openbaar" : "Privé"}
                        </span>
                        {c.assigned_to_email && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">Persoonlijk: {c.assigned_to_email}</span>
                        )}
                        {c.product_id && (
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">
                            Alleen {products.find(product => product.id === c.product_id)?.name || "geselecteerd artikel"}
                          </span>
                        )}
                        {c.category_id && <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">Categorie {categories.find(category => category.id === c.category_id)?.name || "onbekend"}</span>}
                        {isExpired && <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">Verlopen</span>}
                        {isMaxed && <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">Max bereikt</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                        <span>Gebruikt: {c.times_used}{c.max_uses !== null ? `/${c.max_uses}` : "x"}</span>
                        {c.expires_at && <span>Verloopt: {new Date(c.expires_at).toLocaleDateString("nl-NL")}</span>}
                        {c.starts_at && <span>Start: {new Date(c.starts_at).toLocaleDateString("nl-NL")}</span>}
                        {c.minimum_order_amount > 0 && <span>Vanaf €{Number(c.minimum_order_amount).toFixed(2)}</span>}
                        {c.per_customer_limit && <span>Max. {c.per_customer_limit}× per klant</span>}
                        {c.is_referral && c.owner_email && <span>Eigenaar: {c.owner_email}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(c)} disabled={actionId === c.id} title={c.active ? "Deactiveren" : "Activeren"}>
                        {actionId === c.id ? <Loader2 className="w-5 h-5 animate-spin" /> : c.active ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteCodeId(c.id)} disabled={actionId === c.id}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ConfirmActionDialog
            open={deleteCodeId !== null}
            onOpenChange={(open) => !open && setDeleteCodeId(null)}
            title="Kortingscode verwijderen?"
            description="De kortingscode kan daarna niet meer worden gebruikt. Deze actie kan niet ongedaan worden gemaakt."
            confirmLabel="Kortingscode verwijderen"
            destructive
            onConfirm={handleDelete}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
