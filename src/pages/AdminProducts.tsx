import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, Save, Trash2, Loader2, Upload, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MATERIALS } from "@/lib/constants";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  materials: string[];
  colors: string[];
  photos: string[];
  custom_text_enabled: boolean;
  custom_text_label: string;
  custom_text_max_length: number;
  customer_photo_required: boolean;
  active: boolean;
}

export default function AdminProducts() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  const emptyProduct: Omit<Product, "id"> = {
    name: "", description: "", price: 0, materials: [], colors: [],
    photos: [], custom_text_enabled: false, custom_text_label: "Aangepaste tekst",
    custom_text_max_length: 50, customer_photo_required: false, active: true,
  };

  const [form, setForm] = useState<Omit<Product, "id">>(emptyProduct);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  const allColors = MATERIALS.flatMap(m => m.colors.map(c => ({ ...c, material: m.name })));
  const uniqueColors = allColors.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setPhotoFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const uploadPhotos = async (): Promise<string[]> => {
    const urls: string[] = [...form.photos];
    for (const file of photoFiles) {
      const path = `products/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("orders").upload(path, file, { upsert: true });
      if (!error) urls.push(path);
    }
    return urls;
  };

  const handleSave = async () => {
    if (!form.name || form.price <= 0) {
      toast({ title: "Vul naam en prijs in", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const photos = await uploadPhotos();
      const payload = { ...form, photos };

      if (editing) {
        await supabase.from("products").update(payload).eq("id", editing.id);
        toast({ title: "Product bijgewerkt ✅" });
      } else {
        await supabase.from("products").insert(payload);
        toast({ title: "Product aangemaakt ✅" });
      }
      setEditing(null);
      setForm(emptyProduct);
      setPhotoFiles([]);
      fetchProducts();
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description, price: p.price, materials: p.materials, colors: p.colors, photos: p.photos, custom_text_enabled: p.custom_text_enabled, custom_text_label: p.custom_text_label, custom_text_max_length: p.custom_text_max_length, customer_photo_required: p.customer_photo_required ?? false, active: p.active });
    setPhotoFiles([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Product verwijderen?")) return;
    await supabase.from("products").delete().eq("id", id);
    toast({ title: "Product verwijderd" });
    fetchProducts();
  };

  const toggleActive = async (p: Product) => {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    fetchProducts();
  };

  const removeExistingPhoto = (index: number) => {
    setForm(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  const toggleMaterial = (matId: string) => {
    setForm(prev => ({
      ...prev,
      materials: prev.materials.includes(matId)
        ? prev.materials.filter(m => m !== matId)
        : [...prev.materials, matId],
    }));
  };

  const toggleColor = (colorId: string) => {
    setForm(prev => ({
      ...prev,
      colors: prev.colors.includes(colorId)
        ? prev.colors.filter(c => c !== colorId)
        : [...prev.colors, colorId],
    }));
  };

  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center"><p>Geen toegang.</p></main><Footer /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button>
            <h1 className="text-2xl font-bold text-primary">🛍️ Kant-en-klare artikelen</h1>
          </div>

          {/* Form */}
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
            <h3 className="font-bold text-primary mb-4">{editing ? "Product bewerken" : "Nieuw product"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Naam *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="bijv. Roos" />
              </div>
              <div>
                <Label>Prijs (€) *</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="md:col-span-2">
                <Label>Beschrijving</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>

              {/* Photos */}
              <div className="md:col-span-2">
                <Label>Foto's</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {form.photos.map((p, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
                      <img src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/orders/${p}`} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeExistingPhoto(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs">×</button>
                    </div>
                  ))}
                  {photoFiles.map((f, i) => (
                    <div key={`new-${i}`} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setPhotoFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs">×</button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Foto</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" multiple />
                  </label>
                </div>
              </div>

              {/* Materials */}
              <div>
                <Label>Materialen</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {MATERIALS.map(m => (
                    <button key={m.id} onClick={() => toggleMaterial(m.id)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${form.materials.includes(m.id) ? "bg-accent text-accent-foreground border-accent" : "border-border hover:border-accent/50"}`}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colors */}
              <div>
                <Label>Kleuren</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {uniqueColors.map(c => (
                    <button key={c.id} onClick={() => toggleColor(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${form.colors.includes(c.id) ? "bg-accent text-accent-foreground border-accent" : "border-border hover:border-accent/50"}`}>
                      <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom text */}
              <div className="md:col-span-2 border-t border-border pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox checked={form.custom_text_enabled} onCheckedChange={v => setForm({ ...form, custom_text_enabled: v === true })} />
                  <Label>Aangepaste tekst toestaan</Label>
                </div>
                {form.custom_text_enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Label voor tekstveld</Label>
                      <Input value={form.custom_text_label} onChange={e => setForm({ ...form, custom_text_label: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Max tekens</Label>
                      <Input type="number" value={form.custom_text_max_length} onChange={e => setForm({ ...form, custom_text_max_length: parseInt(e.target.value) || 50 })} />
                    </div>
                  </div>
                )}
              </div>

              {/* Customer photo required */}
              <div className="md:col-span-2 border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  <Checkbox checked={form.customer_photo_required} onCheckedChange={v => setForm({ ...form, customer_photo_required: v === true })} />
                  <Label>Klant moet een foto uploaden bij bestelling</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-7">De klant moet minimaal 1 foto uploaden voordat dit product besteld kan worden.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? "Bijwerken" : "Aanmaken"}
              </Button>
              {editing && (
                <Button variant="ghost" onClick={() => { setEditing(null); setForm(emptyProduct); setPhotoFiles([]); }}>Annuleren</Button>
              )}
            </div>
          </div>

          {/* Product list */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : products.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nog geen producten. Maak er een hierboven.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map(p => (
                <div key={p.id} className={`bg-card rounded-2xl p-4 shadow-sm border transition-opacity ${!p.active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-bold text-primary">{p.name}</h4>
                      <p className="text-lg font-semibold text-accent">€{Number(p.price).toFixed(2)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(p)} title={p.active ? "Deactiveren" : "Activeren"}>
                        {p.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>✏️</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground mb-2">{p.description}</p>}
                  <div className="flex flex-wrap gap-1 text-xs">
                    {p.materials.map(m => <span key={m} className="px-2 py-0.5 bg-muted rounded-full">{m}</span>)}
                    {p.custom_text_enabled && <span className="px-2 py-0.5 bg-accent/20 text-accent rounded-full">✏️ Tekst</span>}
                    {p.customer_photo_required && <span className="px-2 py-0.5 bg-accent/20 text-accent rounded-full">📷 Foto verplicht</span>}
                  </div>
                  {p.photos.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {p.photos.slice(0, 3).map((ph, i) => (
                        <img key={i} src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/orders/${ph}`} alt="" className="w-12 h-12 rounded object-cover" />
                      ))}
                    </div>
                  )}
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
