import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ChevronLeft, Euro, Loader2, Package, Scale, TrendingUp } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildAdminReport, ReportOrder } from "@/lib/adminReports";

const periods: Record<string, number | null> = { "30": 30, "90": 90, "365": 365, all: null };

export default function AdminReports() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState("30");
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    setLoading(true);
    let query = supabase.from("orders").select("status,final_price,instant_quote_price,material_cost,filament_used_g,catalog_items,submitted_at");
    const days = periods[period];
    if (days) query = query.gte("submitted_at", new Date(Date.now() - days * 86_400_000).toISOString());
    void query.then(({ data }) => {
      setOrders((data || []) as ReportOrder[]);
      setLoading(false);
    });
  }, [authLoading, isAdmin, period]);

  const report = useMemo(() => buildAdminReport(orders), [orders]);
  if (authLoading || loading) return <><Navbar /><main className="min-h-[70vh] pt-28 flex justify-center"><Loader2 className="animate-spin" /></main><Footer /></>;
  if (!isAdmin) return <><Navbar /><main className="min-h-[70vh] pt-28 text-center">Geen toegang.</main><Footer /></>;
  const cards = [
    ["Omzet", `€${report.revenue.toFixed(2)}`, Euro],
    ["Geschatte winst", `€${report.estimatedProfit.toFixed(2)}`, TrendingUp],
    ["Materiaal", `${report.filamentGrams.toFixed(0)} g`, Scale],
    ["Bestellingen", String(report.orderCount), Package],
  ] as const;
  return <div className="min-h-screen bg-muted/20"><Navbar /><main className="pt-20 pb-16"><div className="container mx-auto px-4 py-8 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Link to="/admin" className="text-sm text-muted-foreground inline-flex items-center"><ChevronLeft className="w-4 h-4" /> Admin</Link><h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 /> Kosten & omzet</h1></div><Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Laatste 30 dagen</SelectItem><SelectItem value="90">Laatste 90 dagen</SelectItem><SelectItem value="365">Laatste jaar</SelectItem><SelectItem value="all">Alles</SelectItem></SelectContent></Select></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label,value,Icon]) => <div key={label} className="rounded-2xl bg-card border p-5"><Icon className="text-accent mb-3"/><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}</div>
    <div className="grid lg:grid-cols-2 gap-6"><section className="rounded-2xl bg-card border p-6"><h2 className="font-semibold text-lg mb-4">Kostenoverzicht</h2><dl className="space-y-3"><div className="flex justify-between"><dt>Gemiddelde orderwaarde</dt><dd>€{report.averageOrder.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Geregistreerde materiaalkosten</dt><dd>€{report.materialCost.toFixed(2)}</dd></div><div className="flex justify-between font-semibold border-t pt-3"><dt>Omzet minus materiaal</dt><dd>€{report.estimatedProfit.toFixed(2)}</dd></div></dl><p className="text-xs text-muted-foreground mt-4">Winst is een schatting vóór stroom, arbeid, verzending en overige bedrijfskosten.</p></section><section className="rounded-2xl bg-card border p-6"><h2 className="font-semibold text-lg mb-4">Populairste producten</h2>{report.topProducts.length ? <div className="space-y-3">{report.topProducts.map((product, index) => <div key={product.name} className="flex justify-between gap-3"><span>{index + 1}. {product.name}</span><span className="font-medium">{product.quantity}× · €{product.revenue.toFixed(2)}</span></div>)}</div> : <p className="text-muted-foreground">Nog geen productgegevens in deze periode.</p>}</section></div>
    <Link to="/admin"><Button variant="outline">Terug naar dashboard</Button></Link>
  </div></main><Footer /></div>;
}
