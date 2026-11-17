import { useCallback, useEffect, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2, Palette, RefreshCw, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMaterials } from "@/hooks/useMaterials";

type InventoryRow = Database["public"]["Tables"]["filament_inventory"]["Row"] & {
  filament_colors: { name: string; material: string; hex: string } | null;
  printers: { name: string } | null;
};

export function AdminFilamentInventory() {
  const { toast } = useToast();
  const materials = useMaterials(true);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftWeights, setDraftWeights] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<InventoryRow | null>(null);
  const [promoteForm, setPromoteForm] = useState({ name: "", material: "PLA", hex: "#808080", description: "", active: true });
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async (showConfirmation = false) => {
    const { data, error } = await supabase
      .from("filament_inventory")
      .select("*,filament_colors(name,material,hex),printers(name)")
      .order("last_seen_at", { ascending: false });
    if (error) {
      toast({ title: "Filamentvoorraad laden mislukt", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as InventoryRow[]);
      setDraftWeights(Object.fromEntries((data || []).map((row) => [row.id, row.manual_weight_grams == null ? "" : String(row.manual_weight_grams)])));
      if (showConfirmation) toast({ title: "Filamentvoorraad bijgewerkt", description: "De nieuwste AMS-metingen zijn ingeladen." });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-filament-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "filament_inventory" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const saveManualWeight = async (row: InventoryRow, clear = false) => {
    const raw = clear ? "" : (draftWeights[row.id] || "").trim();
    const value = raw === "" ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      toast({ title: "Ongeldig gewicht", description: "Vul een gewicht van nul gram of meer in.", variant: "destructive" });
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase.from("filament_inventory").update({ manual_weight_grams: value }).eq("id", row.id);
    setSavingId(null);
    if (error) toast({ title: "Gewicht opslaan mislukt", description: error.message, variant: "destructive" });
    else {
      toast({ title: value == null ? "Handmatige correctie verwijderd" : "Filamentgewicht opgeslagen", description: value == null ? "De AMS-meting of ‘gewicht onbekend’ wordt weer gebruikt." : `${value.toFixed(0)} gram is als handmatige correctie opgeslagen.` });
      void load();
    }
  };

  const openPromote = (row: InventoryRow) => {
    setPromoteTarget(row);
    setPromoteForm({
      name: row.color_name?.trim() || "Nieuwe filamentkleur",
      material: row.material?.trim().toUpperCase() || materials[0]?.id || "PLA",
      hex: /^#[0-9a-f]{6}$/i.test(row.color_hex || "") ? String(row.color_hex).toUpperCase() : "#808080",
      description: "Toegevoegd vanuit de AMS-filamentvoorraad.",
      active: true,
    });
  };

  const promoteToColor = async () => {
    if (!promoteTarget) return;
    if (!promoteForm.name.trim()) {
      toast({ title: "Vul een kleurnaam in", variant: "destructive" });
      return;
    }
    if (!/^#[0-9a-f]{6}$/i.test(promoteForm.hex.trim())) {
      toast({ title: "Ongeldige kleurcode", description: "Gebruik een hexcode zoals #1A2B3C.", variant: "destructive" });
      return;
    }
    setPromoting(true);
    const { error } = await supabase.rpc("promote_inventory_to_filament_color", {
      p_inventory_id: promoteTarget.id,
      p_name: promoteForm.name.trim(),
      p_material: promoteForm.material,
      p_hex: promoteForm.hex.toUpperCase(),
      p_description: promoteForm.description.trim(),
      p_active: promoteForm.active,
    });
    if (error) {
      setPromoting(false);
      toast({ title: "Kleur toevoegen mislukt", description: error.message, variant: "destructive" });
      return;
    }

    setPromoting(false);
    setPromoteTarget(null);
    await load();
    toast({ title: "Nieuwe kleur toegevoegd", description: "De AMS-voorraad, het gemeten gewicht en passende producten zijn aan de nieuwe kleur gekoppeld." });
  };

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Boxes className="h-4 w-4" /></div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Filamentvoorraad</h2><span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Alleen admin</span></div>
          <p className="mt-1 text-sm text-black/50">Live gewicht uit de AMS. Een nieuwe rol vervangt het totaalgewicht van dezelfde kleur; beschikbaarheid wordt nooit automatisch gewijzigd.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Vernieuwen
        </Button>
      </div>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-neutral-50 p-6 text-sm text-black/50">Nog geen herkende AMS-rol gemeten. De voorraad verschijnt na het volgende printerbericht.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const automaticWeight = row.total_weight_grams == null ? null : Number(row.total_weight_grams);
            const manualWeight = row.manual_weight_grams == null ? null : Number(row.manual_weight_grams);
            const weight = manualWeight ?? automaticWeight;
            const percent = weight == null ? null : manualWeight == null && row.remaining_percent != null
              ? Number(row.remaining_percent)
              : Math.min(100, weight / Number(row.spool_capacity_grams) * 100);
            const name = row.filament_colors?.name || row.color_name || "Onbekende AMS-rol";
            const material = row.filament_colors?.material || row.material || "—";
            const colorHex = row.filament_colors?.hex || row.color_hex || "#808080";
            return <article key={row.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: colorHex }} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{name}</p><p className="text-xs text-black/45">{material} · {weight == null ? "gewicht onbekend" : `${weight.toFixed(0)} g van ${Number(row.spool_capacity_grams).toFixed(0)} g`}</p></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${manualWeight != null ? "bg-amber-100 text-amber-900" : automaticWeight != null ? "bg-emerald-100 text-emerald-900" : "bg-neutral-100 text-black/50"}`}>{manualWeight != null ? "Handmatig" : automaticWeight != null ? "AMS" : "Onbekend"}</span>
              </div>
              {percent != null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-black" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>}
              <p className="mt-3 text-[11px] text-black/40">{row.source_printer_id ? `${row.printers?.name || "Printer"} · AMS ${(row.source_ams_unit ?? 0) + 1}, vak ${row.source_slot_number ?? "—"} · ${new Date(row.last_seen_at).toLocaleString("nl-NL")}` : "Nog niet in de AMS gezien"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
                <Input className="h-9 min-w-[150px] flex-1" type="number" min={0} step={1} value={draftWeights[row.id] ?? ""} onChange={(event) => setDraftWeights((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Handmatig gewicht (g)" aria-label={`Handmatig gewicht voor ${name}`} />
                <Button type="button" size="sm" onClick={() => void saveManualWeight(row)} disabled={savingId === row.id}>{savingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Opslaan</Button>
                {manualWeight != null && <Button type="button" size="sm" variant="outline" onClick={() => void saveManualWeight(row, true)} disabled={savingId === row.id}><RotateCcw className="h-4 w-4" /> Automatisch</Button>}
                {!row.filament_color_id && <Button type="button" size="sm" variant="outline" onClick={() => openPromote(row)}><Palette className="h-4 w-4" /> Als nieuwe kleur</Button>}
              </div>
            </article>;
          })}
        </div>
      )}
      <Dialog open={Boolean(promoteTarget)} onOpenChange={(open) => { if (!open && !promoting) setPromoteTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AMS-rol als nieuwe kleur instellen</DialogTitle>
            <DialogDescription>De huidige voorraadmeting blijft behouden. De kleur wordt aan producten met hetzelfde materiaal toegevoegd.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5"><Label htmlFor="inventory-color-name">Naam</Label><Input id="inventory-color-name" value={promoteForm.name} onChange={(event) => setPromoteForm((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Materiaal</Label><Select value={promoteForm.material} onValueChange={(material) => setPromoteForm((current) => ({ ...current, material }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{materials.map((material) => <SelectItem key={material.id} value={material.id}>{material.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label htmlFor="inventory-color-hex">Kleurcode</Label><div className="flex gap-2"><Input className="h-10 w-14 p-1" type="color" value={promoteForm.hex} onChange={(event) => setPromoteForm((current) => ({ ...current, hex: event.target.value.toUpperCase() }))} aria-label="Kleur kiezen" /><Input id="inventory-color-hex" value={promoteForm.hex} onChange={(event) => setPromoteForm((current) => ({ ...current, hex: event.target.value }))} /></div></div>
            <div className="grid gap-1.5"><Label htmlFor="inventory-color-description">Omschrijving</Label><Textarea id="inventory-color-description" value={promoteForm.description} onChange={(event) => setPromoteForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><div><Label htmlFor="inventory-color-active">Direct beschikbaar</Label><p className="text-xs text-black/45">Uitgeschakeld blijft de kleur tijdelijk onbeschikbaar.</p></div><Switch id="inventory-color-active" checked={promoteForm.active} onCheckedChange={(active) => setPromoteForm((current) => ({ ...current, active }))} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setPromoteTarget(null)} disabled={promoting}>Annuleren</Button><Button type="button" onClick={() => void promoteToColor()} disabled={promoting}>{promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />} Nieuwe kleur aanmaken</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
