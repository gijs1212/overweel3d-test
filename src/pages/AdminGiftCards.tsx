import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gift, Loader2, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type GiftCard = Database["public"]["Tables"]["gift_cards"]["Row"];

export default function AdminGiftCards() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", balance: 25, email: "", expiresAt: "" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("gift_cards").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Cadeaubonnen laden mislukt", description: error.message, variant: "destructive" });
    setCards(data || []); setLoading(false);
  }, [toast]);

  useEffect(() => { if (!authLoading && isAdmin) void load(); else if (!authLoading) setLoading(false); }, [authLoading, isAdmin, load]);

  const create = async () => {
    if (!form.code.trim() || form.balance <= 0) return;
    setSaving(true);
    const { error } = await supabase.from("gift_cards").insert({
      code: form.code.trim().toUpperCase(), initial_balance: form.balance, current_balance: form.balance,
      assigned_to_email: form.email.trim().toLowerCase() || null, expires_at: form.expiresAt || null, created_by: user?.id || null,
    });
    setSaving(false);
    if (error) toast({ title: "Aanmaken mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Cadeaubon aangemaakt" }); setForm({ code: "", balance: 25, email: "", expiresAt: "" }); void load(); }
  };

  if (authLoading || loading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="animate-spin" /></main></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center">Geen toegang.</main></div>;

  return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container max-w-5xl mx-auto px-4 py-8">
    <div className="flex items-center gap-3 mb-8"><Button variant="ghost" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button><div><h1 className="text-2xl font-bold text-primary">Cadeaubonnen</h1><p className="text-sm text-muted-foreground">Unieke codes met een aflopend tegoed.</p></div></div>
    <section className="rounded-2xl border bg-card p-6 mb-8"><h2 className="font-bold mb-4 flex items-center gap-2"><Gift className="w-5 h-5 text-accent" /> Nieuwe cadeaubon</h2><div className="grid md:grid-cols-4 gap-4"><div><Label>Code</Label><Input className="uppercase" value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} placeholder="CADEAU25" /></div><div><Label>Beginsaldo (€)</Label><Input type="number" min={1} step="0.01" value={form.balance} onChange={event => setForm({ ...form, balance: Number(event.target.value) || 0 })} /></div><div><Label>E-mail (optioneel)</Label><Input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></div><div><Label>Vervalt (optioneel)</Label><Input type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} /></div></div><Button className="mt-4" onClick={create} disabled={saving || !form.code.trim()}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Aanmaken</Button></section>
    <div className="space-y-3">{cards.map(card => <div key={card.id} className={`rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3 ${card.active ? "" : "opacity-60"}`}><div><div className="font-mono font-bold">{card.code}</div><div className="text-sm text-muted-foreground">€{Number(card.current_balance).toFixed(2)} resterend van €{Number(card.initial_balance).toFixed(2)}{card.assigned_to_email ? ` · ${card.assigned_to_email}` : ""}{card.expires_at ? ` · vervalt ${new Date(card.expires_at).toLocaleDateString("nl-NL")}` : ""}</div></div><Button variant="ghost" onClick={async () => { await supabase.from("gift_cards").update({ active: !card.active }).eq("id", card.id); void load(); }}>{card.active ? <ToggleRight className="text-accent" /> : <ToggleLeft />}</Button></div>)}</div>
  </div></main><Footer /></div>;
}
