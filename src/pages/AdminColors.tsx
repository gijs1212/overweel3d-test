import { useCallback, useEffect, useState } from "react";
import { createClientId } from "@/lib/clientId";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Save, Trash2, Loader2, Upload, X, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials } from "@/hooks/useMaterials";
import { getProductPhotoUrl, normalizeProductStoragePath } from "@/lib/productPhotos";
import { materialLabel, normalizeMaterialId } from "@/lib/productCatalog";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { LocalMediaPreview } from "@/components/LocalMediaPreview";
import { validateMediaSelection } from "@/lib/mediaFiles";
import { sendAutomaticNewsletters, type AutomaticNewsletterEvent } from "@/lib/automaticNewsletter";

function SignedImg({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    getProductPhotoUrl(path).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div aria-hidden="true" className={`${className || ""} animate-pulse bg-muted`} />;
  return <img src={url} alt="" className={className} />;
}

interface FilamentColor {
  id: string;
  name: string;
  material: string;
  hex: string;
  photos: string[];
  description: string;
  sort_order: number;
  active: boolean;
}

interface Product { id: string; name: string; materials: string[]; active: boolean; }
interface Availability { product_id: string; color_id: string; available: boolean; }
interface BambuColorProposal { id: string; inventory_key: string; color_name: string | null; material: string | null; color_hex: string | null; last_seen_at: string; }

const emptyForm = {
  name: "",
  material: "PLA",
  hex: "#808080",
  description: "",
  sort_order: 0,
  active: true,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Onbekende databasefout.";
}

export default function AdminColors() {
  const MATERIALS = useMaterials(true);
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [colors, setColors] = useState<FilamentColor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [bambuProposals, setBambuProposals] = useState<BambuColorProposal[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<FilamentColor | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [removedPhotoPaths, setRemovedPhotoPaths] = useState<string[]>([]);
  const [productAvail, setProductAvail] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FilamentColor | null>(null);
  const [proposalTarget, setProposalTarget] = useState<BambuColorProposal | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cRes, pRes, aRes, proposalRes] = await Promise.all([
      supabase.from("filament_colors").select("*").order("material").order("sort_order"),
      supabase.from("products").select("id,name,materials,active"),
      supabase.from("product_color_availability").select("*"),
      supabase.from("filament_inventory").select("id,inventory_key,color_name,material,color_hex,last_seen_at,filament_color_id").is("filament_color_id", null).order("last_seen_at", { ascending: false }),
    ]);
    const error = cRes.error || pRes.error || aRes.error || proposalRes.error;
    if (error) toast({ title: "Kleuren laden mislukt", description: error.message, variant: "destructive" });
    setColors((cRes.data as FilamentColor[]) || []);
    setProducts((pRes.data as Product[]) || []);
    setAvailability((aRes.data as Availability[]) || []);
    setBambuProposals(((proposalRes.data || []) as BambuColorProposal[]).filter((item) => item.inventory_key.startsWith("bambu-catalog:")));
    setLoading(false);
  }, [toast]);

  const setTemporaryAvailability = async (color: FilamentColor, active: boolean) => {
    const { error } = await supabase.from("filament_colors").update({ active }).eq("id", color.id);
    if (error) {
      toast({ title: "Beschikbaarheid wijzigen mislukt", description: error.message, variant: "destructive" });
      return;
    }
    setColors((current) => current.map((item) => item.id === color.id ? { ...item, active } : item));
    const materialHasOtherActiveColor = colors.some((item) => item.id !== color.id && item.active
      && normalizeMaterialId(item.material) === normalizeMaterialId(color.material));
    const newsletterEvents: AutomaticNewsletterEvent[] = [{
      templateKind: "color", changeType: active ? "new" : "removed", itemName: color.name,
      details: `${materialLabel(color.material)} · ${active ? "weer beschikbaar" : "tijdelijk niet beschikbaar; deze kleur komt waarschijnlijk later weer terug"}`,
      itemUrl: `${window.location.origin}/kleuren`,
      temporarilyUnavailable: !active,
    }];
    if (active && !materialHasOtherActiveColor) newsletterEvents.push({
      templateKind: "material", changeType: "new", itemName: materialLabel(color.material),
      details: "Dit materiaal is weer beschikbaar.",
      itemUrl: `${window.location.origin}/kleuren`,
    });
    const newsletter = await sendAutomaticNewsletters(newsletterEvents);
    if (newsletter.errors.length) toast({ title: "Beschikbaarheid gewijzigd, nieuwsbrief deels mislukt", description: newsletter.errors[0], variant: "destructive" });
    toast({
      title: active ? `${color.name} is weer beschikbaar` : `${color.name} is tijdelijk onbeschikbaar`,
      description: active ? "De kleur staat weer in alle kleurkeuzes." : "De kleur is direct uit alle klant- en adminbestelkeuzes gehaald.",
    });
  };

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    void fetchAll();
    const channel = supabase.channel("admin-color-proposals")
      .on("postgres_changes", { event: "*", schema: "public", table: "filament_inventory" }, () => void fetchAll())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authLoading, fetchAll, isAdmin]);

  const openNew = () => {
    setShowForm(true);
    setEditing(null);
    setForm({ ...emptyForm });
    setExistingPhotos([]);
    setNewPhotoFiles([]);
    setRemovedPhotoPaths([]);
    setProductAvail({});
    setProposalTarget(null);
  };

  const openProposal = (proposal: BambuColorProposal) => {
    setShowForm(true);
    setEditing(null);
    setProposalTarget(proposal);
    setForm({
      ...emptyForm,
      name: proposal.color_name?.trim() || "Nieuwe Bambu-kleur",
      material: proposal.material?.trim().toUpperCase() || "PLA",
      hex: /^#[0-9a-f]{6}$/i.test(proposal.color_hex || "") ? String(proposal.color_hex).toUpperCase() : "#808080",
      description: "Voorgesteld vanuit de officiële Bambu Lab-kleurcatalogus.",
    });
    setExistingPhotos([]);
    setNewPhotoFiles([]);
    setRemovedPhotoPaths([]);
    setProductAvail({});
  };

  const openEdit = (c: FilamentColor) => {
    setShowForm(true);
    setEditing(c);
    setForm({
      name: c.name,
      material: materialLabel(c.material),
      hex: c.hex,
      description: c.description,
      sort_order: c.sort_order,
      active: c.active,
    });
    setExistingPhotos([...c.photos]);
    setNewPhotoFiles([]);
    setRemovedPhotoPaths([]);
    setProposalTarget(null);
    const map: Record<string, boolean> = {};
    availability
      .filter((a) => a.color_id === c.id)
      .forEach((a) => { map[a.product_id] = a.available; });
    setProductAvail(map);
  };

  const cancel = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ ...emptyForm });
    setExistingPhotos([]);
    setNewPhotoFiles([]);
    setRemovedPhotoPaths([]);
    setProductAvail({});
    setProposalTarget(null);
  };

  const relevantProducts = products.filter((p) => {
    const productMaterials = (p.materials || []).map(normalizeMaterialId);
    return productMaterials.length === 0 || productMaterials.includes(normalizeMaterialId(form.material));
  });

  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const selection = validateMediaSelection(files, { allowVideos: false, maxFiles: 12 });
    if (selection.accepted.length) setNewPhotoFiles((prev) => [...prev, ...selection.accepted.map(({ file }) => file)].slice(0, 12));
    if (selection.errors.length) toast({ title: "Enkele foto's zijn overgeslagen", description: selection.errors[0], variant: "destructive" });
  };

  const uploadPhotos = async (uploadedPaths: string[]): Promise<string[]> => {
    const paths: string[] = [...existingPhotos];
    for (const file of newPhotoFiles) {
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `colors/${createClientId()}-${safeName}`;
      const uploaded = await uploadFileWithHeicConversion("orders", path, file, { upsert: false });
      if (uploaded.error) throw new Error(`Upload van ${file.name} mislukt: ${uploaded.error.message}`);
      uploadedPaths.push(uploaded.path);
      paths.push(uploaded.path);
    }
    return paths;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Vul een naam in", variant: "destructive" }); return; }
    if (!/^#[0-9a-f]{6}$/i.test(form.hex.trim())) {
      toast({ title: "Ongeldige kleurcode", description: "Gebruik een hexcode zoals #1A2B3C.", variant: "destructive" });
      return;
    }
    const duplicate = colors.some((color) => color.id !== editing?.id
      && color.name.trim().toLowerCase() === form.name.trim().toLowerCase()
      && normalizeMaterialId(color.material) === normalizeMaterialId(form.material));
    if (duplicate) {
      toast({ title: "Deze kleur bestaat al", description: `Er is al een kleur met deze naam voor ${form.material}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    const uploadedPaths: string[] = [];
    let photosCommitted = false;
    try {
      const photos = await uploadPhotos(uploadedPaths);
      const payload = { ...form, name: form.name.trim(), description: form.description.trim(), hex: form.hex.toUpperCase(), photos };

      let colorId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("filament_colors").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("filament_colors").insert(payload).select().single();
        if (error) throw error;
        colorId = data.id;
      }
      photosCommitted = true;

      if (colorId) {
        const { error: clearError } = await supabase.from("product_color_availability").delete().eq("color_id", colorId);
        if (clearError) throw clearError;
        if (relevantProducts.length) {
          const { error: availabilityError } = await supabase.from("product_color_availability").insert(
            relevantProducts.map((product) => ({
              product_id: product.id,
              color_id: colorId!,
              available: productAvail[product.id] ?? !editing,
            })),
          );
          if (availabilityError) throw availabilityError;
        }
        if (proposalTarget) {
          const { error: proposalError } = await supabase.from("filament_inventory").update({
            filament_color_id: colorId,
            inventory_key: `palette:${colorId}`,
          }).eq("id", proposalTarget.id);
          if (proposalError) throw proposalError;
        }
      }

      const managedRemovedPaths = removedPhotoPaths.map(normalizeProductStoragePath).filter(Boolean) as string[];
      if (managedRemovedPaths.length) {
        const { error } = await supabase.storage.from("orders").remove(managedRemovedPaths);
        if (error) throw new Error(`Kleur opgeslagen, maar oude foto's verwijderen mislukte: ${error.message}`);
      }

      const availabilityChanged = editing && editing.active !== payload.active;
      if (!editing || availabilityChanged) {
        const changeType = !editing || payload.active ? "new" : "removed";
        const materialHasOtherActiveColor = colors.some((item) => item.id !== editing?.id && item.active
          && normalizeMaterialId(item.material) === normalizeMaterialId(payload.material));
        const newsletterEvents: AutomaticNewsletterEvent[] = [{
          templateKind: "color", changeType, itemName: payload.name,
          details: payload.active
            ? `${materialLabel(payload.material)}${payload.description ? ` · ${payload.description}` : ""}`
            : `${materialLabel(payload.material)} · tijdelijk niet beschikbaar; deze kleur komt waarschijnlijk later weer terug`,
          itemUrl: `${window.location.origin}/kleuren`,
          temporarilyUnavailable: !payload.active,
        }];
        if (payload.active && !materialHasOtherActiveColor) newsletterEvents.push({
          templateKind: "material", changeType: "new", itemName: materialLabel(payload.material),
          details: "Dit materiaal is toegevoegd aan het beschikbare assortiment.", itemUrl: `${window.location.origin}/kleuren`,
        });
        const newsletter = await sendAutomaticNewsletters(newsletterEvents);
        if (newsletter.errors.length) toast({ title: "Kleur opgeslagen, nieuwsbrief deels mislukt", description: newsletter.errors[0], variant: "destructive" });
        else toast({
          title: "Nieuwsbrief verstuurd ✅",
          description: `${newsletter.campaignsSent} melding${newsletter.campaignsSent === 1 ? "" : "en"} verstuurd naar ${newsletter.recipientsReached} ontvanger${newsletter.recipientsReached === 1 ? "" : "s"}.`,
        });
      }
      toast({ title: editing ? "Kleur bijgewerkt ✅" : "Kleur toegevoegd ✅" });
      cancel();
      fetchAll();
    } catch (error: unknown) {
      if (uploadedPaths.length && !photosCommitted) {
        await supabase.storage.from("orders").remove(uploadedPaths);
      }
      toast({ title: "Opslaan mislukt", description: getErrorMessage(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const color = colors.find((item) => item.id === id);
    const { error } = await supabase.from("filament_colors").delete().eq("id", id);
    if (error) { toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" }); return; }
    const managedPhotoPaths = (color?.photos || []).map(normalizeProductStoragePath).filter(Boolean) as string[];
    if (managedPhotoPaths.length) {
      const { error: storageError } = await supabase.storage.from("orders").remove(managedPhotoPaths);
      if (storageError) toast({ title: "Kleur verwijderd", description: "Enkele foto's konden niet uit storage worden verwijderd.", variant: "destructive" });
      else toast({ title: "Kleur en foto's verwijderd" });
    } else toast({ title: "Kleur verwijderd" });
    if (color) {
      const materialHasOtherActiveColor = colors.some((item) => item.id !== color.id && item.active
        && normalizeMaterialId(item.material) === normalizeMaterialId(color.material));
      const newsletterEvents: AutomaticNewsletterEvent[] = [{ templateKind: "color", changeType: "removed", itemName: color.name, details: materialLabel(color.material), itemUrl: `${window.location.origin}/kleuren` }];
      if (color.active && !materialHasOtherActiveColor) newsletterEvents.push({ templateKind: "material", changeType: "removed", itemName: materialLabel(color.material), details: "Dit materiaal is niet langer beschikbaar.", itemUrl: `${window.location.origin}/kleuren` });
      const newsletter = await sendAutomaticNewsletters(newsletterEvents);
      if (newsletter.errors.length) toast({ title: "Kleur verwijderd, nieuwsbrief deels mislukt", description: newsletter.errors[0], variant: "destructive" });
    }
    fetchAll();
  };

  if (authLoading) return (
    <div className="min-h-screen"><Navbar /><main className="pt-24 pb-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin" /></main><Footer /></div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen"><Navbar /><main className="pt-24 pb-16 flex items-center justify-center"><p>Geen toegang.</p></main><Footer /></div>
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-4 h-4" /> Terug
            </Button>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Palette className="w-6 h-6" /> Kleuren beheren
            </h1>
            <div className="ml-auto">
              {!showForm && <Button onClick={openNew}><Plus className="w-4 h-4" /> Nieuwe kleur</Button>}
            </div>
          </div>

          {!showForm && bambuProposals.length > 0 && (
            <section className="mb-8 rounded-2xl border border-black/10 bg-neutral-50 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-primary">Bambu Lab-kleurvoorstellen</h2>
                  <p className="mt-1 text-sm text-muted-foreground">De add-on vergelijkt ieder uur de officiële BambuStudio-kleurcatalogus met de kleuren op de website. Voorstellen worden nooit automatisch gepubliceerd.</p>
                </div>
                <span className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">{bambuProposals.length} nieuw</span>
              </div>
              <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {bambuProposals.map((proposal) => (
                  <article key={proposal.id} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-3">
                    <span className="h-9 w-9 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: proposal.color_hex || "#808080" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{proposal.color_name || "Onbekende Bambu-kleur"}</p>
                      <p className="text-xs text-muted-foreground">{proposal.material || "Materiaal onbekend"} · {proposal.color_hex || "geen hexcode"}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => openProposal(proposal)}><Plus className="h-4 w-4" /> Gebruiken</Button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Form */}
          {showForm && (
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
              <h3 className="font-bold text-primary mb-4">{editing ? "Kleur bewerken" : proposalTarget ? "Bambu-kleurvoorstel controleren" : "Nieuwe kleur"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Naam *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="bijv. Zeeblauw" />
                </div>
                <div>
                  <Label>Materiaal *</Label>
                  <Select value={form.material} onValueChange={(v) => setForm({ ...form, material: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERIALS.map((m) => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Weergavekleur (hex)</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} className="w-16 p-1 h-10" />
                    <Input value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} placeholder="#RRGGBB" />
                  </div>
                </div>
                <div>
                  <Label>Sorteervolgorde</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-2">
                  <Label>Beschrijving</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="md:col-span-2 flex items-center gap-3">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  <div>
                    <Label>{form.active ? "Beschikbaar" : "Tijdelijk onbeschikbaar"}</Label>
                    <p className="text-xs text-muted-foreground">Onbeschikbare kleuren blijven bewaard, maar verdwijnen uit alle bestelkeuzes.</p>
                  </div>
                </div>
              </div>

              {/* Photos */}
              <div className="mt-6">
                <Label>Foto's van geprinte kleur</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {existingPhotos.map((p, i) => (
                    <div key={p} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border">
                      <SignedImg path={p} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setExistingPhotos((prev) => prev.filter((_, idx) => idx !== i));
                          setRemovedPhotoPaths((prev) => [...new Set([...prev, p])]);
                        }}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {newPhotoFiles.map((f, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border bg-muted">
                      <LocalMediaPreview file={f} alt={f.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="relative w-24 h-24 overflow-hidden rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <input type="file" multiple accept="image/*" onChange={handlePhotoInput} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                </div>
              </div>

              {/* Product availability */}
              <div className="mt-6">
                <Label>Beschikbaarheid per product ({form.material})</Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Alle producten die {form.material} gebruiken. Zet uit om deze kleur voor dat product te blokkeren.
                </p>
                {relevantProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Geen producten met dit materiaal.</p>
                ) : (
                  <div className="space-y-2">
                    {relevantProducts.map((p) => {
                      const val = productAvail[p.id] ?? !editing;
                      return (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                          <span className="text-sm font-medium">{p.name}{!p.active ? " (verborgen)" : ""}</span>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={val}
                              onCheckedChange={(v) => setProductAvail((prev) => ({ ...prev, [p.id]: v }))}
                            />
                            <span className={`text-xs ${val ? "text-emerald-600" : "text-muted-foreground"}`}>
                              {val ? "Beschikbaar" : "Niet beschikbaar"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Opslaan
                </Button>
                <Button variant="outline" onClick={cancel}>Annuleren</Button>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : colors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nog geen kleuren. Klik op "Nieuwe kleur" om te beginnen.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {colors.map((c) => (
                <div key={c.id} className={`bg-card rounded-2xl p-4 border border-border/50 flex gap-4 ${!c.active ? "opacity-60" : ""}`}>
                  <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 bg-muted relative">
                    {c.photos[0] ? (
                      <SignedImg path={c.photos[0]} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: c.hex }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border border-border shrink-0" style={{ backgroundColor: c.hex }} />
                      <span className="font-semibold text-primary truncate">{c.name}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">{c.material}</span>
                      {!c.active && <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded">Tijdelijk onbeschikbaar</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{c.photos.length} foto('s)</div>
                    <div className="flex items-center gap-2 mt-2">
                      <Switch
                        checked={c.active}
                        onCheckedChange={(active) => void setTemporaryAvailability(c, active)}
                        aria-label={`${c.name} beschikbaarheid`}
                      />
                      <span className="text-xs">{c.active ? "Beschikbaar" : "Tijdelijk onbeschikbaar"}</span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>Bewerken</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Kleur verwijderen?"
        description={`“${deleteTarget?.name || "Deze kleur"}” en de bijbehorende foto's worden definitief verwijderd.`}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
