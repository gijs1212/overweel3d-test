import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Package, Eye, Plus, FileText, Megaphone, ShoppingBag, Tag, MailPlus, Mail, Users, Printer, BarChart3, Star, Gift, Palette, ChevronRight, Euro, Layers3, Boxes, Calculator, Upload, ImagePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";
import { getFunctionErrorMessage } from "@/lib/functionErrors";
import { Switch } from "@/components/ui/switch";
import { PlateApprovalRequests } from "@/components/PlateApprovalRequests";

interface AdminOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  instant_quote_price: number;
  final_price: number | null;
  submitted_at: string;
  material: string;
  link_first_viewed_at: string | null;
  link_last_viewed_at: string | null;
  link_view_count: number;
}

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>(() => searchParams.get("customer")?.trim().toLowerCase() || "all");
  const [sendingTestMail, setSendingTestMail] = useState(false);
  const [newsletterEnabled, setNewsletterEnabled] = useState(true);
  const [savingNewsletter, setSavingNewsletter] = useState(false);
  const [printerSummary, setPrinterSummary] = useState({ total: 0, active: 0 });
  const [loyaltySettings, setLoyaltySettings] = useState({ pointsPerEuro: 1, eurosPerPoint: 0.05 });
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      const [{ data, error }, settingResult, loyaltyResult, printersResult] = await Promise.all([
        supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_email, status, instant_quote_price, final_price, submitted_at, material, link_first_viewed_at, link_last_viewed_at, link_view_count")
        .order("submitted_at", { ascending: false }),
        supabase.from("app_settings").select("value").eq("key", "newsletter_enabled").maybeSingle(),
        supabase.from("app_settings").select("key,value").in("key", ["loyalty_points_per_euro", "loyalty_euros_per_point"]),
        supabase.from("printers").select("status"),
      ]);
      if (error) {
        toast({ title: "Bestellingen laden mislukt", description: error.message, variant: "destructive" });
        setOrders([]);
      } else {
        setOrders((data as AdminOrder[]) || []);
      }
      setNewsletterEnabled(settingResult.data?.value !== false);
      const loyaltyValues = new Map((loyaltyResult.data || []).map((setting) => [setting.key, Number(setting.value)]));
      setLoyaltySettings({
        pointsPerEuro: loyaltyValues.get("loyalty_points_per_euro") ?? 1,
        eurosPerPoint: loyaltyValues.get("loyalty_euros_per_point") ?? 0.05,
      });
      setPrinterSummary({
        total: printersResult.data?.length || 0,
        active: printersResult.data?.filter((printer) => printer.status === "printing").length || 0,
      });
      setLoading(false);
    };

    void fetchOrders();
  }, [authLoading, isAdmin, toast]);

  const saveLoyaltySettings = async () => {
    if (!Number.isFinite(loyaltySettings.pointsPerEuro) || loyaltySettings.pointsPerEuro < 0 || !Number.isFinite(loyaltySettings.eurosPerPoint) || loyaltySettings.eurosPerPoint <= 0) {
      toast({ title: "Vul geldige loyaliteitswaarden in", description: "Punten per euro mag nul zijn; euro korting per punt moet groter zijn dan nul.", variant: "destructive" });
      return;
    }
    setSavingLoyalty(true);
    const { error } = await supabase.from("app_settings").upsert([
      { key: "loyalty_points_per_euro", value: loyaltySettings.pointsPerEuro, description: "Aantal loyaliteitspunten per uitgegeven euro.", updated_by: user?.id || null },
      { key: "loyalty_euros_per_point", value: loyaltySettings.eurosPerPoint, description: "Aantal euro korting per ingewisseld loyaliteitspunt.", updated_by: user?.id || null },
    ]);
    setSavingLoyalty(false);
    if (error) toast({ title: "Puntenregeling opslaan mislukt", description: error.message, variant: "destructive" });
    else toast({ title: "Puntenregeling opgeslagen", description: `Klanten ontvangen ${loyaltySettings.pointsPerEuro} punt(en) per euro; één punt is €${loyaltySettings.eurosPerPoint.toFixed(3)} korting.` });
  };

  const toggleNewsletter = async (enabled: boolean) => {
    setSavingNewsletter(true);
    const previous = newsletterEnabled;
    setNewsletterEnabled(enabled);
    const { error } = await supabase.from("app_settings").update({ value: enabled }).eq("key", "newsletter_enabled");
    if (error) {
      setNewsletterEnabled(previous);
      toast({ title: "Instelling opslaan mislukt", description: error.message, variant: "destructive" });
    } else {
      toast({ title: enabled ? "Nieuwsbrief ingeschakeld" : "Nieuwsbrief tijdelijk uitgeschakeld", description: enabled ? "Automatische en handmatige nieuwsbrieven worden weer verzonden." : "Nieuwe nieuwsbriefcampagnes worden centraal tegengehouden." });
    }
    setSavingNewsletter(false);
  };

  const handleSendTestMail = async () => {
    setSendingTestMail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: { type: "test_email" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Onbekende e-mailfout");
      toast({
        title: "Testmail verzonden",
        description: "De testmail is verzonden naar gijsoverweel@gmail.com.",
      });
    } catch (error) {
      const message = await getFunctionErrorMessage(error, "Probeer het later opnieuw.");
      toast({ title: "Testmail verzenden mislukt", description: message, variant: "destructive" });
    } finally {
      setSendingTestMail(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-primary mb-2">Geen toegang</h1>
            <p className="text-muted-foreground">Je hebt geen admin rechten.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const filtered = orders.filter((o) => {
    const matchSearch =
      search === "" ||
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchCustomer = customerFilter === "all" || o.customer_email.trim().toLowerCase() === customerFilter;
    return matchSearch && matchStatus && matchCustomer;
  });

  const customerOptions = Array.from(
    new Map(
      orders
        .filter((order) => order.customer_email?.trim())
        .map((order) => [order.customer_email.trim().toLowerCase(), {
          email: order.customer_email.trim().toLowerCase(),
          name: order.customer_name || order.customer_email,
        }]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const totalOrderValue = orders.reduce((sum, order) => sum + Number(order.final_price ?? order.instant_quote_price ?? 0), 0);
  const openOrderCount = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="min-h-screen bg-neutral-100 pb-20 pt-20">
        <div className="container mx-auto px-4 py-8 lg:py-10">
          <header className="relative mb-6 overflow-hidden rounded-2xl bg-black px-6 py-8 text-white md:px-10 md:py-10">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:56px_56px]" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">Overweel3D beheeromgeving</p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">Goed overzicht.<br /><span className="text-white/45">Direct handelen.</span></h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">Beheer bestellingen, productie, klanten en marketing vanuit één rustige werkruimte.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white hover:text-black" onClick={handleSendTestMail} disabled={sendingTestMail}>{sendingTestMail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Testmail</Button>
              <Link to="/admin/new-order"><Button variant="hero"><Plus className="w-4 h-4" /> Nieuwe bestelling</Button></Link>
            </div>
            </div>
          </header>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [Package, "Open orders", openOrderCount.toString()],
              [Euro, "Totale orderwaarde", `€${totalOrderValue.toFixed(2)}`],
              [Printer, "Printers actief", `${printerSummary.active} / ${printerSummary.total}`],
            ].map(([Icon, label, value]) => <div key={label as string} className="rounded-2xl border border-black/10 bg-white p-5"><div className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Icon className="h-4 w-4" /></div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label as string}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value as string}</p></div>)}
            <div className="rounded-2xl border border-black/10 bg-white p-5"><div className="mb-5 flex items-start justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><MailPlus className="h-4 w-4" /></div><Switch checked={newsletterEnabled} onCheckedChange={toggleNewsletter} disabled={savingNewsletter} aria-label="Nieuwsbrief in- of uitschakelen" /></div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Nieuwsbrief</p><p className="mt-1 text-lg font-semibold">{newsletterEnabled ? "Actief" : "Gepauzeerd"}</p></div>
          </div>

          <PlateApprovalRequests />

          <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-2xl border border-black/10 bg-white p-6">
            <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Beheer</p><h2 className="mt-1 text-xl font-semibold">Alle onderdelen</h2></div>
            <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Printer", [["Printers & plaatkoppeling", "/admin/production", Printer], ["Filamentvoorraad", "/admin/filament-inventory", Boxes], ["Automatische prijsberekening", "/admin/price-calculator", Calculator], ["Kostenrapportage", "/admin/reports", BarChart3]]],
              ["Producten & kleuren", [["Opdrachten", "/admin/assignments", ImagePlus], ["Producten & varianten", "/admin/products", ShoppingBag], ["Materialen", "/admin/materials", Layers3], ["Kleuren", "/admin/colors", Palette], ["Reviews", "/admin/reviews", Star]]],
              ["Klanten", [["Klantenoverzicht", "/admin/customers", Users], ["Nieuwe bestelling", "/admin/new-order", Plus], ["Bestanden uploaden", "/admin/order-files", Upload]]],
              ["Marketing", [["Nieuwsbrief", "/admin/newsletter", MailPlus], ["Kortingscodes", "/admin/discounts", Tag], ["Cadeaubonnen", "/admin/gift-cards", Gift], ["Loyaliteitsprogramma", "/admin#loyaliteitsprogramma", Gift], ["Blog & content", "/admin/blog", FileText], ["Websitecontent", "/admin/content", Megaphone]]],
            ].map(([title, items]) => <section key={title as string} className="rounded-xl border border-black/10 bg-neutral-50 p-4"><h3 className="mb-2 text-sm font-bold">{title as string}</h3><div className="space-y-1">{(items as [string,string,typeof Package][]).map(([label,to,Icon]) => <Link key={to} to={to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-black/65 transition-colors hover:bg-black hover:text-white"><Icon className="w-4 h-4"/><span className="flex-1">{label}</span><ChevronRight className="w-4 h-4 opacity-40"/></Link>)}</div></section>)}
            </div>
          </section>

          <section id="loyaliteitsprogramma" className="scroll-mt-28 rounded-2xl border border-black/10 bg-white p-6">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1"><div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Gift className="w-4 h-4" /></div><h2 className="font-semibold">Loyaliteitsprogramma</h2><p className="mt-1 text-sm text-muted-foreground">Instellingen voor nieuwe voltooide bestellingen.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:w-[430px] xl:w-full xl:grid-cols-1"><div><label className="text-sm font-medium">Punten per euro</label><Input type="number" min={0} step="0.1" value={loyaltySettings.pointsPerEuro} onChange={(event) => setLoyaltySettings((current) => ({ ...current, pointsPerEuro: Number(event.target.value) }))} /></div><div><label className="text-sm font-medium">Euro korting per punt</label><Input type="number" min={0.0001} step="0.001" value={loyaltySettings.eurosPerPoint} onChange={(event) => setLoyaltySettings((current) => ({ ...current, eurosPerPoint: Number(event.target.value) }))} /></div><Button onClick={saveLoyaltySettings} disabled={savingLoyalty}>{savingLoyalty ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Instellingen opslaan</Button></div>
            </div>
          </section>
          </div>

          <section className="rounded-2xl border border-black/10 bg-white p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Orderbeheer</p><h2 className="mt-1 text-xl font-bold">Bestellingen</h2><p className="text-sm text-muted-foreground">Zoek en filter alle binnengekomen orders.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{filtered.length} zichtbaar</span></div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op bestelnummer, naam of e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filter op status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-full md:w-[260px]">
                <SelectValue placeholder="Filter op klant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle klanten</SelectItem>
                {customerOptions.map((customer) => (
                  <SelectItem key={customer.email} value={customer.email}>
                    {customer.name} — {customer.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Geen bestellingen gevonden.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-black/10 bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-4 font-medium text-muted-foreground">Bekijken</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Bestelling</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Klant</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Klantlink</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Indicatie</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Definitief</th>
                      <th className="text-left p-4 font-medium text-muted-foreground">Datum</th>
                      <th className="text-right p-4 font-medium text-muted-foreground">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order) => {
                      const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.submitted;
                      const isAdminOrder = order.customer_email === "admin@overweel3d.nl";
                      return (
                        <tr key={order.id} className="border-b border-border transition-colors hover:bg-neutral-50">
                          <td className="p-4">
                            <Link to={`/admin/order/${order.id}`}>
                              <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /> Bekijken</Button>
                            </Link>
                          </td>
                          <td className="p-4 font-medium">
                            {order.order_number}
                            {isAdminOrder && <span className="ml-1 text-xs text-accent">(admin)</span>}
                          </td>
                          <td className="p-4">
                            <div>{order.customer_name}</div>
                            {!isAdminOrder && <div className="text-xs text-muted-foreground">{order.customer_email}</div>}
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="p-4">
                            {order.link_first_viewed_at ? (
                              <div>
                                <span className="font-medium text-black">Bezocht</span>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  Eerste: {new Date(order.link_first_viewed_at).toLocaleString("nl-NL", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {` · ${order.link_view_count}×`}
                                </div>
                                {order.link_last_viewed_at && order.link_last_viewed_at !== order.link_first_viewed_at && (
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    Laatste: {new Date(order.link_last_viewed_at).toLocaleString("nl-NL", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Niet bezocht</span>
                            )}
                          </td>
                          <td className="p-4">€{Number(order.instant_quote_price || 0).toFixed(2)}</td>
                          <td className="p-4 font-semibold text-foreground">
                            {order.final_price ? `€${Number(order.final_price).toFixed(2)}` : "—"}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {new Date(order.submitted_at).toLocaleDateString("nl-NL")}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link to={`/admin/order-files?order=${order.id}`}>
                                <Button variant="ghost" size="sm"><Upload className="w-4 h-4" /> Uploaden</Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
