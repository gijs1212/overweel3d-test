import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Material = Database["public"]["Tables"]["materials"]["Row"];
const blank = { id: "", name: "", price_per_gram: 0, sort_order: 0, active: true };

export default function AdminMaterials() {
  const { isAdmin, loading: authLoading } = useAuth(); const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]); const [form, setForm] = useState(blank); const [editing, setEditing] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { const { data, error } = await supabase.from("materials").select("*").order("sort_order").order("name"); if (error) toast({ title: "Materialen laden mislukt", description: error.message, variant: "destructive" }); setMaterials(data || []); }, [toast]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true); const id = editing || form.id.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = { id, name: form.name.trim(), price_per_gram: Number(form.price_per_gram) || 0, sort_order: Number(form.sort_order) || 0, active: form.active };
    const result = editing ? await supabase.from("materials").update(payload).eq("id", editing) : await supabase.from("materials").insert(payload);
    setSaving(false); if (result.error) toast({ title: "Materiaal opslaan mislukt", description: result.error.message, variant: "destructive" }); else { toast({ title: "Materiaal opgeslagen" }); setForm(blank); setEditing(null); void load(); }
  };
  const remove = async (material: Material) => { const { error } = await supabase.from("materials").delete().eq("id", material.id); if (error) toast({ title: "Verwijderen mislukt", description: "Zet het materiaal inactief als het al door producten wordt gebruikt.", variant: "destructive" }); else void load(); };
  if (authLoading) return <div className="pt-24 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return <div className="pt-24 text-center">Geen toegang.</div>;
  return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container max-w-4xl mx-auto px-4 py-8"><div className="flex items-center gap-3 mb-8"><Button asChild variant="ghost"><Link to="/admin"><ArrowLeft className="w-4 h-4" /> Terug</Link></Button><div><h1 className="text-2xl font-bold">Materialen</h1><p className="text-sm text-muted-foreground">Deze materialen worden overal in de catalogus gebruikt.</p></div></div><section className="rounded-2xl border bg-card p-5 mb-6 grid md:grid-cols-5 gap-3"><div><Label>Code *</Label><Input disabled={!!editing} value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder="asa" /></div><div><Label>Naam *</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="ASA" /></div><div><Label>Prijs per gram</Label><Input type="number" min={0} step="0.001" value={form.price_per_gram} onChange={(event) => setForm({ ...form, price_per_gram: Number(event.target.value) })} /></div><div><Label>Volgorde</Label><Input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} /></div><div className="flex items-end gap-2"><Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /><Label>Actief</Label></div><Button className="md:col-span-5" onClick={save} disabled={saving || !form.name.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{editing ? "Bijwerken" : "Toevoegen"}</Button></section><div className="space-y-2">{materials.map((material) => <div key={material.id} className={`rounded-xl border bg-card p-4 flex items-center gap-3 ${material.active ? "" : "opacity-60"}`}><div className="flex-1"><p className="font-semibold">{material.name} <span className="text-xs text-muted-foreground">({material.id})</span></p><p className="text-xs text-muted-foreground">€{Number(material.price_per_gram).toFixed(3)} per gram</p></div><Button variant="ghost" size="sm" onClick={() => { setEditing(material.id); setForm(material); }}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => void remove(material)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>)}</div></div></main><Footer /></div>;
}
