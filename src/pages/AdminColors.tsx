import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
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
import { MATERIALS } from "@/lib/constants";
import { getProductPhotoUrl } from "@/lib/productPhotos";
import heic2any from "heic2any";

function SignedImg({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    getProductPhotoUrl(path).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [path]);
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

interface Product { id: string; name: string; materials: string[]; }
interface Availability { product_id: string; color_id: string; available: boolean; }

const emptyForm = {
  name: "",
  material: MATERIALS[0]?.name || "PLA",
  hex: "#808080",
  description: "",
  sort_order: 0,
  active: true,
};

export default function AdminColors() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [colors, setColors] = useState<FilamentColor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<FilamentColor | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [productAvail, setProductAvail] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [cRes, pRes, aRes] = await Promise.all([
      supabase.from("filament_colors").select("*").order("material").order("sort_order"),
      supabase.from("products").select("id,name,materials").eq("active", true),
      supabase.from("product_color_availability").select("*"),
    ]);
    setColors((cRes.data as FilamentColor[]) || []);
    setProducts((pRes.data as Product[]) || []);
    setAvailability((aRes.data as Availability[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setShowForm(true);
    setEditing(null);
    setForm({ ...emptyForm });
    setExistingPhotos([]);
    setNewPhotoFiles([]);
    setProductAvail({});
  };

  const openEdit = (c: FilamentColor) => {
    setShowForm(true);
    setEditing(c);
    setForm({
      name: c.name,
      material: c.material,
      hex: c.hex,
      description: c.description,
      sort_order: c.sort_order,
      active: c.active,
    });
    setExistingPhotos([...c.photos]);
    setNewPhotoFiles([]);
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
    setProductAvail({});
  };

  const relevantProducts = products.filter((p) => (p.materials || []).includes(form.material));

  const handlePhotoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const converted: File[] = [];
    for (const f of files) {
      const isHeic = f.type === "image/heic" || f.type === "image/heif" || /\.hei[cf]$/i.test(f.name);
      if (isHeic) {
        try {
          const blob = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.85 });
          const b = Array.isArray(blob) ? blob[0] : blob;
          converted.push(new File([b], f.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" }));
        } catch {
          toast({ title: `HEIC conversie mislukt voor ${f.name}`, variant: "destructive" });
        }
      } else if (f.type.startsWith("image/")) {
        converted.push(f);
      } else {
        toast({ title: `${f.name} overgeslagen`, description: "Alleen afbeeldingen.", variant: "destructive" });
      }
    }
    if (converted.length) setNewPhotoFiles((prev) => [...prev, ...converted]);
    e.target.value = "";
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const paths: string[] = [...existingPhotos];
    for (const file of newPhotoFiles) {
      const path = `colors/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("orders").upload(path, file, { upsert: true });
      if (!error) paths.push(path);
    }
    return paths;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Vul een naam in", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const photos = await uploadPhotos();
      const payload = { ...form, name: form.name.trim(), photos };

      let colorId = editing?.id;
      if (editing) {
        await supabase.from("filament_colors").update(payload).eq("id", editing.id);
      } else {
        const { data, error } = await supabase.from("filament_colors").insert(payload).select().single();
        if (error) throw error;
        colorId = (data as any).id;
      }

      if (colorId) {
        // Sync availability rows for products with this material
        const productIds = relevantProducts.map((p) => p.id);
        // Remove availability for products no longer relevant (material changed)
        await supabase
          .from("product_color_availability")
          .delete()
          .eq("color_id", colorId)
          .not("product_id", "in", `(${productIds.length ? productIds.map((i) => `"${i}"`).join(",") : '""'})`);

        for (const p of relevantProducts) {
          const available = productAvail[p.id] ?? true;
          await supabase
            .from("product_color_availability")
            .upsert(
              { product_id: p.id, color_id: colorId, available },
              { onConflict: "product_id,color_id" }
            );
        }
      }

      toast({ title: editing ? "Kleur bijgewerkt ✅" : "Kleur toegevoegd ✅" });
      cancel();
      fetchAll();
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Kleur verwijderen?")) return;
    await supabase.from("filament_colors").delete().eq("id", id);
    toast({ title: "Verwijderd" });
    fetchAll();
  };

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

          {/* Form */}
          {showForm && (
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
              <h3 className="font-bold text-primary mb-4">{editing ? "Kleur bewerken" : "Nieuwe kleur"}</h3>
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
                  <Label>Actief (zichtbaar op de website)</Label>
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
                        onClick={() => setExistingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {newPhotoFiles.map((f, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewPhotoFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <input type="file" multiple accept="image/*,.heic,.heif" onChange={handlePhotoInput} className="hidden" />
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
                      const val = productAvail[p.id] ?? true;
                      return (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                          <span className="text-sm font-medium">{p.name}</span>
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
                      {!c.active && <span className="text-xs bg-muted px-2 py-0.5 rounded">Verborgen</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{c.photos.length} foto('s)</div>
                    <div className="flex gap-1 mt-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>Bewerken</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
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
    </div>
  );
}