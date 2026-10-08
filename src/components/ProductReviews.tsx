import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientId } from "@/lib/clientId";
import { Camera, Loader2, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { isHeicFile, uploadFileWithHeicConversion } from "@/lib/imageUploads";

interface Review { id: string; rating: number; title: string; body: string; photos: Json; verified: boolean; created_at: string }
interface ReviewOrder { id: string; order_number: string; catalog_items: Json }

export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orders, setOrders] = useState<ReviewOrder[]>([]);
  const [rating, setRating] = useState(5);
  const [orderId, setOrderId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const reviewResult = await supabase.from("product_reviews").select("id,rating,title,body,photos,verified,created_at").eq("product_id", productId).eq("status", "approved").order("created_at", { ascending: false });
    setReviews((reviewResult.data || []) as Review[]);
    if (user) {
      const orderResult = await supabase.from("orders").select("id,order_number,catalog_items").eq("user_id", user.id).eq("status", "completed");
      setOrders(((orderResult.data || []) as ReviewOrder[]).filter(order => Array.isArray(order.catalog_items) && order.catalog_items.some(item => typeof item === "object" && item !== null && "productId" in item && item.productId === productId)));
    }
  }, [productId, user]);
  useEffect(() => { void load(); }, [load]);

  const average = useMemo(() => reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0, [reviews]);
  const photoUrl = (path: string) => supabase.storage.from("orders").getPublicUrl(path).data.publicUrl;

  const submit = async () => {
    if (!user || !orderId || body.trim().length < 5) return;
    setSaving(true);
    try {
      const paths: string[] = [];
      for (const file of photos) {
        const path = `reviews/${user.id}/${createClientId()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const uploaded = await uploadFileWithHeicConversion("orders", path, file, { upsert: false });
        if (uploaded.error) throw uploaded.error;
        paths.push(uploaded.path);
      }
      const { error } = await supabase.from("product_reviews").insert({ product_id: productId, order_id: orderId, user_id: user.id, rating, title: title.trim(), body: body.trim(), photos: paths });
      if (error) throw error;
      toast({ title: "Review ingestuurd", description: "Na goedkeuring wordt de beoordeling bij het product getoond." });
      setTitle(""); setBody(""); setPhotos([]); setOrderId("");
    } catch (error) {
      toast({ title: "Review opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <section className="border-t pt-6 mt-6"><div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="font-bold text-lg">Klantbeoordelingen</h3><p className="text-sm text-muted-foreground">{reviews.length ? `${average.toFixed(1)} van 5 · ${reviews.length} review${reviews.length === 1 ? "" : "s"}` : "Nog geen beoordelingen"}</p></div><div className="flex">{[1,2,3,4,5].map(value => <Star key={value} className={`w-4 h-4 ${value <= Math.round(average) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />)}</div></div>
    <div className="space-y-3">{reviews.map(review => <article key={review.id} className="rounded-xl bg-muted/40 p-4"><div className="flex items-center gap-2"><div className="flex">{[1,2,3,4,5].map(value => <Star key={value} className={`w-3.5 h-3.5 ${value <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />)}</div>{review.verified && <span className="text-xs text-emerald-700">Geverifieerde aankoop</span>}</div>{review.title && <h4 className="font-semibold mt-2">{review.title}</h4>}<p className="text-sm text-muted-foreground mt-1">{review.body}</p>{Array.isArray(review.photos) && <div className="flex gap-2 mt-3">{review.photos.map(path => typeof path === "string" ? <img key={path} src={photoUrl(path)} alt="Foto bij review" className="w-16 h-16 object-cover rounded-lg border" /> : null)}</div>}</article>)}</div>
    {user && orders.length > 0 && <div className="rounded-xl border p-4 mt-5 space-y-3"><h4 className="font-semibold">Schrijf een review</h4><div><Label>Voltooide bestelling</Label><select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Kies een bestelling</option>{orders.map(order => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></div><div><Label>Score</Label><div className="flex gap-1">{[1,2,3,4,5].map(value => <button type="button" key={value} onClick={() => setRating(value)}><Star className={`w-6 h-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} /></button>)}</div></div><div><Label>Titel</Label><Input value={title} onChange={event => setTitle(event.target.value)} /></div><div><Label>Ervaring *</Label><Textarea value={body} onChange={event => setBody(event.target.value)} /></div><div className="flex flex-wrap gap-2">{photos.map((file, index) => <div key={`${file.name}-${index}`} className="relative"><img src={URL.createObjectURL(file)} alt="Reviewvoorbeeld" className="w-16 h-16 object-cover rounded-lg" /><button type="button" className="absolute -top-1 -right-1 rounded-full bg-destructive text-white" onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X className="w-4 h-4" /></button></div>)}<label className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer"><Camera className="w-5 h-5" /><input type="file" className="hidden" accept="image/*,.heic,.heif" multiple onChange={event => { const incoming = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/") || isHeicFile(file)); setPhotos(current => [...current, ...incoming].slice(0, 3)); event.target.value = ""; }} /></label></div><Button onClick={submit} disabled={saving || !orderId || body.trim().length < 5}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Review insturen</Button></div>}
  </section>;
}
