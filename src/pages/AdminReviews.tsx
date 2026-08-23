import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Star, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ReviewRow = { id: string; rating: number; title: string; body: string; photos: string[]; status: string; verified: boolean; created_at: string; products: { name: string } | null; orders: { order_number: string; customer_name: string } | null };

export default function AdminReviews() {
  const { isAdmin, loading: authLoading } = useAuth(); const { toast } = useToast(); const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewRow[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data, error } = await supabase.from("product_reviews").select("id,rating,title,body,photos,status,verified,created_at,products(name),orders(order_number,customer_name)").order("created_at", { ascending: false }); if (error) toast({ title: "Reviews laden mislukt", description: error.message, variant: "destructive" }); setReviews((data || []) as unknown as ReviewRow[]); setLoading(false); }, [toast]);
  useEffect(() => { if (!authLoading && isAdmin) void load(); else if (!authLoading) setLoading(false); }, [authLoading, isAdmin, load]);
  const setStatus = async (id: string, status: "approved" | "rejected") => { const { error } = await supabase.from("product_reviews").update({ status }).eq("id", id); if (error) toast({ title: "Bijwerken mislukt", description: error.message, variant: "destructive" }); else void load(); };
  if (authLoading || loading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="animate-spin" /></main></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center">Geen toegang.</main></div>;
  return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container max-w-5xl mx-auto px-4 py-8"><div className="flex items-center gap-3 mb-8"><Button variant="ghost" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button><div><h1 className="text-2xl font-bold">Productreviews</h1><p className="text-muted-foreground">Controleer geverifieerde klantbeoordelingen.</p></div></div><div className="space-y-4">{reviews.map(review => <article key={review.id} className="rounded-2xl border bg-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><div className="flex gap-1">{[1,2,3,4,5].map(value => <Star key={value} className={`w-4 h-4 ${value <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />)}</div><h2 className="font-bold mt-2">{review.products?.name || "Product"} · {review.title || "Review"}</h2><p className="text-xs text-muted-foreground">{review.orders?.customer_name} · {review.orders?.order_number} · {review.status}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => setStatus(review.id, "approved")}><Check className="w-4 h-4" /> Goedkeuren</Button><Button size="sm" variant="outline" onClick={() => setStatus(review.id, "rejected")}><X className="w-4 h-4" /> Afwijzen</Button></div></div><p className="text-sm mt-3">{review.body}</p>{review.photos?.length > 0 && <div className="flex gap-2 mt-4 overflow-x-auto">{review.photos.map(path => <img key={path} src={supabase.storage.from("orders").getPublicUrl(path).data.publicUrl} alt="Reviewfoto" className="w-28 h-28 rounded-xl object-cover border" />)}</div>}</article>)}</div></div></main><Footer /></div>;
}
