import { useEffect, useMemo, useState } from "react";
import { Box, Calculator, FlaskConical, Loader2, Save, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AutoPricingConfig, calculateAutomaticPrice, DEFAULT_AUTO_PRICING_CONFIG, estimateModelForSlicer, type InfillPattern, type SlicerSettings } from "@/lib/autoPriceCalculator";
import { parse3DFile, ParseResult } from "@/lib/stlParser";

const numberValue = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function AdminPriceCalculator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<AutoPricingConfig>(DEFAULT_AUTO_PRICING_CONFIG);
  const [materials, setMaterials] = useState<string[]>(Object.keys(DEFAULT_AUTO_PRICING_CONFIG.filament_price_per_kg));
  const [material, setMaterial] = useState("PLA");
  const [filamentGrams, setFilamentGrams] = useState(100);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelResult, setModelResult] = useState<ParseResult | null>(null);
  const [parsingModel, setParsingModel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      supabase.from("app_settings").select("value").eq("key", "auto_pricing_test_config").maybeSingle(),
      supabase.from("materials").select("id").order("sort_order").order("name"),
    ]).then(([settingResult, materialsResult]) => {
      if (settingResult.data?.value && typeof settingResult.data.value === "object" && !Array.isArray(settingResult.data.value)) {
        const saved = settingResult.data.value as unknown as Partial<AutoPricingConfig>;
        setConfig({
          filament_price_per_kg: { ...DEFAULT_AUTO_PRICING_CONFIG.filament_price_per_kg, ...(saved.filament_price_per_kg || {}) },
          margin_percent: saved.margin_percent ?? DEFAULT_AUTO_PRICING_CONFIG.margin_percent,
          failure_buffer_percent: saved.failure_buffer_percent ?? DEFAULT_AUTO_PRICING_CONFIG.failure_buffer_percent,
          slicer: { ...DEFAULT_AUTO_PRICING_CONFIG.slicer, ...(saved.slicer || {}) },
        });
      }
      if (materialsResult.data?.length) {
        const ids = materialsResult.data.map((item) => item.id.toUpperCase());
        setMaterials(ids);
        setMaterial(ids[0]);
        setConfig((current) => ({ ...current, filament_price_per_kg: Object.fromEntries(ids.map((id) => [id, current.filament_price_per_kg[id] ?? 25])) }));
      }
      setLoading(false);
    });
  }, []);

  const modelEstimate = useMemo(() => modelResult ? estimateModelForSlicer(modelResult.volumeCm3, material, config.slicer) : null, [config.slicer, material, modelResult]);
  const effectiveFilamentGrams = modelEstimate?.filamentGrams ?? filamentGrams;
  const result = useMemo(() => calculateAutomaticPrice({ material, filamentGrams: effectiveFilamentGrams }, config), [config, effectiveFilamentGrams, material]);
  const setNumber = (key: keyof AutoPricingConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }));
  type NumericSlicerKey = Exclude<keyof SlicerSettings, "supports_enabled" | "infill_pattern">;
  const setSlicerNumber = (key: NumericSlicerKey, value: number) => setConfig((current) => ({ ...current, slicer: { ...current.slicer, [key]: value } }));

  const loadModel = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(stl|obj|3mf)$/i.test(file.name)) {
      toast({ title: "Model niet ondersteund", description: "Upload een STL-, OBJ- of 3MF-bestand.", variant: "destructive" });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "Model is te groot", description: "De testcalculator accepteert bestanden tot 100 MB.", variant: "destructive" });
      return;
    }
    setParsingModel(true);
    setModelFile(file);
    setModelResult(null);
    const parsed = await parse3DFile(file);
    setParsingModel(false);
    if (!parsed || parsed.volumeCm3 <= 0) {
      setModelFile(null);
      toast({ title: "Model kon niet worden berekend", description: "Het bestand bevat geen gesloten, leesbare mesh met een bruikbaar volume.", variant: "destructive" });
      return;
    }
    setModelResult(parsed);
    toast({ title: "Model ingelezen", description: "Gewicht, printtijd en prijs worden nu opnieuw berekend met het gekozen slicerprofiel." });
  };

  const save = async () => {
    if (config.margin_percent < 0 || config.margin_percent >= 100) {
      toast({ title: "Ongeldige marge", description: "Gebruik een marge van minimaal 0 en minder dan 100 procent.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "auto_pricing_test_config",
      value: config as unknown as Json,
      description: "Afgeschermde testinstellingen voor de automatische prijsberekening in het admin dashboard.",
      updated_by: user?.id || null,
    });
    setSaving(false);
    if (error) toast({ title: "Prijsinstellingen opslaan mislukt", description: error.message, variant: "destructive" });
    else toast({ title: "Testinstellingen opgeslagen", description: "Dit wijzigt nog geen prijzen op de openbare website." });
  };

  if (loading) return <section className="rounded-2xl border border-black/10 bg-white p-8"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></section>;

  const moneyRows = [
    ["Filament", result.materialCost], ["Uitvalbuffer", result.failureBuffer], ["Marge", result.marginAmount],
  ] as const;

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Calculator className="h-4 w-4" /></div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">Automatische prijsberekening</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">Admintest</span></div><p className="mt-1 max-w-2xl text-sm text-black/50">Test met de filament- en tijdschatting uit de slicer. Opslaan verandert alleen deze afgeschermde testconfiguratie.</p></div>
        <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Testinstellingen opslaan</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_320px]">
        <div className="space-y-4 rounded-xl bg-neutral-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4" /> Testsituatie</h3>
          <div><Label>Materiaal</Label><Select value={material} onValueChange={setMaterial}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{materials.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent></Select></div>
          <div>
            <Label>Model voor prijsberekening</Label>
            {!modelResult && !parsingModel ? <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-white px-4 py-5 text-sm font-semibold transition-colors hover:border-black hover:bg-neutral-100"><Upload className="h-4 w-4" /> Upload STL, OBJ of 3MF<input type="file" accept=".stl,.obj,.3mf" className="sr-only" onChange={(event) => { void loadModel(event.target.files?.[0]); event.target.value = ""; }} /></label> : parsingModel ? <div className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white p-5 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Model analyseren…</div> : modelResult && <div className="mt-1 rounded-xl border border-black/10 bg-white p-4"><div className="flex items-start gap-3"><Box className="mt-0.5 h-5 w-5" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{modelFile?.name}</p><p className="mt-1 text-xs text-black/45">{modelResult.volumeCm3.toFixed(2)} cm³ · {modelResult.boundingBox.width.toFixed(1)} × {modelResult.boundingBox.depth.toFixed(1)} × {modelResult.boundingBox.height.toFixed(1)} mm</p><p className="mt-2 text-xs font-semibold">Schatting: {effectiveFilamentGrams.toFixed(1)} g · {modelEstimate?.printHours.toFixed(2)} uur</p></div><Button type="button" variant="ghost" size="sm" onClick={() => { setModelFile(null); setModelResult(null); }} aria-label="Model verwijderen"><X className="h-4 w-4" /></Button></div></div>}
          </div>
          <div><Label>Filament (g)</Label><Input type="number" min={0} value={modelEstimate ? Number(effectiveFilamentGrams.toFixed(2)) : filamentGrams} disabled={Boolean(modelEstimate)} onChange={(event) => setFilamentGrams(numberValue(event.target.value))} /></div>
          <div className="space-y-3 border-t border-black/10 pt-4"><h4 className="text-sm font-semibold">Filamentprijs per kg</h4>{materials.map((id) => <div key={id} className="flex items-center gap-3"><Label className="w-16">{id}</Label><div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-black/40">€</span><Input className="pl-7" type="number" min={0} step={0.5} value={config.filament_price_per_kg[id] ?? 0} onChange={(event) => setConfig((current) => ({ ...current, filament_price_per_kg: { ...current.filament_price_per_kg, [id]: numberValue(event.target.value) } }))} /></div></div>)}</div>
        </div>

        <div className="space-y-4 rounded-xl bg-neutral-50 p-4">
          <h3 className="font-semibold">Prijs en slicerprofiel</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Marge (%)</Label><Input type="number" min={0} max={95} value={config.margin_percent} onChange={(event) => setNumber("margin_percent", numberValue(event.target.value))} /></div>
            <div><Label>Uitvalbuffer (%)</Label><Input type="number" min={0} value={config.failure_buffer_percent} onChange={(event) => setNumber("failure_buffer_percent", numberValue(event.target.value))} /></div>
          </div>
          <div className="space-y-3 border-t border-black/10 pt-4"><h4 className="text-sm font-semibold">Slicerprofiel</h4><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div><Label>Laaghoogte (mm)</Label><Input type="number" min={0.04} step={0.02} value={config.slicer.layer_height_mm} onChange={(event) => setSlicerNumber("layer_height_mm", numberValue(event.target.value))} /></div>
            <div><Label>Nozzle (mm)</Label><Input type="number" min={0.2} step={0.1} value={config.slicer.nozzle_diameter_mm} onChange={(event) => setSlicerNumber("nozzle_diameter_mm", numberValue(event.target.value))} /></div>
            <div><Label>Lijnbreedte (mm)</Label><Input type="number" min={0.2} step={0.01} value={config.slicer.line_width_mm} onChange={(event) => setSlicerNumber("line_width_mm", numberValue(event.target.value))} /></div>
            <div><Label>Infill (%)</Label><Input type="number" min={0} max={100} value={config.slicer.infill_percent} onChange={(event) => setSlicerNumber("infill_percent", numberValue(event.target.value))} /></div>
            <div><Label>Infillpatroon</Label><Select value={config.slicer.infill_pattern} onValueChange={(infill_pattern: InfillPattern) => setConfig((current) => ({ ...current, slicer: { ...current.slicer, infill_pattern } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="grid">Raster</SelectItem><SelectItem value="gyroid">Gyroid</SelectItem><SelectItem value="cubic">Kubisch</SelectItem><SelectItem value="lines">Lijnen</SelectItem></SelectContent></Select></div>
            <div><Label>Wandlijnen</Label><Input type="number" min={1} step={1} value={config.slicer.wall_loops} onChange={(event) => setSlicerNumber("wall_loops", numberValue(event.target.value))} /></div>
            <div><Label>Bovenlagen</Label><Input type="number" min={0} step={1} value={config.slicer.top_layers} onChange={(event) => setSlicerNumber("top_layers", numberValue(event.target.value))} /></div>
            <div><Label>Onderlagen</Label><Input type="number" min={0} step={1} value={config.slicer.bottom_layers} onChange={(event) => setSlicerNumber("bottom_layers", numberValue(event.target.value))} /></div>
            <div><Label>Printsnelheid (mm/s)</Label><Input type="number" min={10} step={5} value={config.slicer.print_speed_mm_s} onChange={(event) => setSlicerNumber("print_speed_mm_s", numberValue(event.target.value))} /></div>
            <div><Label>Eerste laag (mm/s)</Label><Input type="number" min={5} step={5} value={config.slicer.first_layer_speed_mm_s} onChange={(event) => setSlicerNumber("first_layer_speed_mm_s", numberValue(event.target.value))} /></div>
            <div><Label>Supportdichtheid (%)</Label><Input type="number" min={0} max={100} disabled={!config.slicer.supports_enabled} value={config.slicer.support_density_percent} onChange={(event) => setSlicerNumber("support_density_percent", numberValue(event.target.value))} /></div>
            <div><Label>Brim-breedte (mm)</Label><Input type="number" min={0} step={0.5} value={config.slicer.brim_width_mm} onChange={(event) => setSlicerNumber("brim_width_mm", numberValue(event.target.value))} /></div>
          </div><div className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-3"><Label>Supports gebruiken</Label><Switch checked={config.slicer.supports_enabled} onCheckedChange={(supports_enabled) => setConfig((current) => ({ ...current, slicer: { ...current.slicer, supports_enabled } }))} /></div><p className="text-xs text-black/45">Deze instellingen veranderen de schatting van filament en printtijd. Alleen het berekende filamentgewicht telt mee voor de prijs.</p></div>
        </div>

        <aside className="rounded-xl bg-black p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Testuitkomst</p><p className="mt-2 text-4xl font-semibold tracking-tight">€{result.recommendedPrice.toFixed(2)}</p><p className="mt-1 text-xs text-white/45">adviesprijs zonder btw-berekening</p>
          <div className="mt-6 space-y-2 border-t border-white/15 pt-4">{moneyRows.map(([label, amount]) => <div key={label} className="flex justify-between gap-4 text-sm"><span className="text-white/55">{label}</span><span>€{amount.toFixed(2)}</span></div>)}</div>
          <div className="mt-5 rounded-lg bg-white/10 p-3 text-xs leading-5 text-white/65">Kostprijs incl. uitval: €{result.costWithRisk.toFixed(2)}<br />Marge: {config.margin_percent}% · filament: €{result.filamentPricePerKg.toFixed(2)}/kg</div>
        </aside>
      </div>
    </section>
  );
}
