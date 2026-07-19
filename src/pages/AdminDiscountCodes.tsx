import { useState, useEffect } from "react";
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
  owner_email?: string | null;
  owner_name?: string | null;
  reward_percentage?: number | null;
  assigned_to_email?: string | null;
  parent_code_id?: string | null;
}

export default function AdminDiscountCodes() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: 10,
    max_uses: "" as string,
    expires_at: "",
    is_referral: false,
    owner_email: "",
    owner_name: "",
    reward_percentage: 10,
  });

  useEffect(() => { fetchCodes(); }, []);

  const fetchCodes = async () => {
    const { data } = await supabase.from("discount_codes").select("*").order("created_at", { ascending: false });
    setCodes((data as DiscountCode[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: "Vul een code in", variant: "destructive" });
      return;
    }
    if (form.is_referral && !form.owner_email.trim()) {
      toast({ title: "Vul een e-mail van de eigenaar in", variant: "destructive" });
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
        owner_email: form.is_referral ? form.owner_email.trim().toLowerCase() : null,
        owner_name: form.is_referral ? form.owner_name.trim() || null : null,
        reward_percentage: form.is_referral ? form.reward_percentage : null,
      };
      await supabase.from("discount_codes").insert(payload);
      toast({ title: "Kortingscode aangemaakt ✅" });
      setForm({ code: "", discount_type: "percentage", discount_value: 10, max_uses: "", expires_at: "", is_referral: false, owner_email: "", owner_name: "", reward_percentage: 10 });
      fetchCodes();
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (c: DiscountCode) => {
    await supabase.from("discount_codes").update({ active: !c.active }).eq("id", c.id);
    fetchCodes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Kortingscode verwijderen?")) return;
    await supabase.from("discount_codes").delete().eq("id", id);
    toast({ title: "Verwijderd" });
    fetchCodes();
  };

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
                <Label>Verloopt op (leeg = nooit)</Label>
                <Input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
              </div>
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
                        {c.assigned_to_email && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">Persoonlijk: {c.assigned_to_email}</span>
                        )}
                        {isExpired && <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">Verlopen</span>}
                        {isMaxed && <span className="text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded">Max bereikt</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                        <span>Gebruikt: {c.times_used}{c.max_uses !== null ? `/${c.max_uses}` : "x"}</span>
                        {c.expires_at && <span>Verloopt: {new Date(c.expires_at).toLocaleDateString("nl-NL")}</span>}
                        {c.is_referral && c.owner_email && <span>Eigenaar: {c.owner_email}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(c)} title={c.active ? "Deactiveren" : "Activeren"}>
                        {c.active ? <ToggleRight className="w-5 h-5 text-accent" /> : <ToggleLeft className="w-5 h-5" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
