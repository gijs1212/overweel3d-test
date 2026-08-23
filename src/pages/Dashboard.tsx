import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Package, Plus, Loader2, User, AlertCircle, Gift, Repeat2, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

interface OrderSummary {
  id: string;
  order_number: string;
  status: OrderStatus;
  instant_quote_price: number;
  final_price: number | null;
  customer_order_token: string;
  submitted_at: string;
  material: string;
}

interface LoyaltyCode { id: string; code: string; discount_value: number; times_used: number; max_uses: number | null }

export default function Dashboard() {
  const { user, profile, isAdmin, loading: authLoading, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileDismissed, setProfileDismissed] = useState(false);
  const [convertingPoints, setConvertingPoints] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState({ pointsPerEuro: 1, eurosPerPoint: 0.05 });
  const [loyaltyCodes, setLoyaltyCodes] = useState<LoyaltyCode[]>([]);
  const [loyaltyRefresh, setLoyaltyRefresh] = useState(0);
  const [repeatOrder, setRepeatOrder] = useState<OrderSummary | null>(null);

  const isProfileIncomplete = profile && (!profile.billing_address || !profile.city || !profile.postal_code || !profile.phone);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, instant_quote_price, final_price, customer_order_token, submitted_at, material")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });
      if (error) {
        toast({ title: "Bestellingen laden mislukt", description: error.message, variant: "destructive" });
        setOrders([]);
      } else {
        setOrders((data as OrderSummary[]) || []);
      }
      setLoading(false);
    };
    void fetchOrders();
  }, [authLoading, toast, user]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("app_settings").select("key,value").in("key", ["loyalty_points_per_euro", "loyalty_euros_per_point"]),
      supabase.from("discount_codes").select("id,code,discount_value,times_used,max_uses").like("code", "LOYAL-%").eq("active", true).order("created_at", { ascending: false }),
    ]).then(([settingsResult, codesResult]) => {
      const values = new Map((settingsResult.data || []).map((setting) => [setting.key, Number(setting.value)]));
      setLoyaltySettings({ pointsPerEuro: values.get("loyalty_points_per_euro") ?? 1, eurosPerPoint: values.get("loyalty_euros_per_point") ?? 0.05 });
      setLoyaltyCodes(((codesResult.data || []) as LoyaltyCode[]).filter((code) => code.max_uses === null || code.times_used < code.max_uses));
    });
  }, [loyaltyRefresh, user]);

  if (authLoading) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent" /></main><Footer /></div>);
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-bold text-primary">Log in voor uw dashboard</h1>
            <p className="mb-5 text-muted-foreground">Uw bestellingen zijn alleen zichtbaar wanneer u bent ingelogd.</p>
            <Button asChild><Link to="/login">Inloggen</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-primary">
                Welkom{profile?.full_name ? `, ${profile.full_name}` : ""}!
              </h1>
              <p className="text-muted-foreground">Bekijk en beheer uw bestellingen.</p>
            </div>
            <div className="flex gap-3 mt-4 md:mt-0">
              <Link to="/profiel">
                <Button variant="outline"><User className="w-4 h-4" /> Profiel</Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline">🔒 Admin</Button>
                </Link>
              )}
              <Link to="/bestellen">
                <Button><Plus className="w-4 h-4" /> Start uw bestelling</Button>
              </Link>
            </div>
          </div>

          {/* Profile completion prompt */}
          {isProfileIncomplete && !profileDismissed && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Vul uw gegevens aan</h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Vul uw profiel volledig in zodat uw gegevens bij elke bestelling automatisch ingevuld worden.
                    </p>
                    <div className="flex gap-3">
                      <Link to="/profiel">
                        <Button size="sm">Profiel aanvullen</Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setProfileDismissed(true)}
                      >
                        Overslaan
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Dismissed message */}
          {isProfileIncomplete && profileDismissed && (
            <div className="mb-6 bg-muted/50 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                💡 Ga in dashboard naar <Link to="/profiel" className="text-accent underline font-medium">Profiel</Link> om je gegevens in te vullen zodat het bij elke bestelling automatisch ingevuld zal worden.
              </p>
            </div>
          )}

          <section className="mb-6 rounded-2xl border bg-gradient-to-r from-accent/10 via-card to-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground flex items-center gap-2"><Gift className="w-4 h-4 text-accent" /> Loyaliteitsprogramma</p><p className="text-2xl font-bold text-primary">{profile?.loyalty_points || 0} punten</p><p className="text-xs text-muted-foreground">U ontvangt {loyaltySettings.pointsPerEuro} punt(en) per uitgegeven euro. 100 punten is €{(100 * loyaltySettings.eurosPerPoint).toFixed(2)} korting.</p></div><Button disabled={convertingPoints || (profile?.loyalty_points || 0) < 100} onClick={async () => { setConvertingPoints(true); const redeemable = Math.floor((profile?.loyalty_points || 0) / 100) * 100; const { data, error } = await supabase.rpc("convert_loyalty_points", { points_to_redeem: redeemable }); setConvertingPoints(false); if (error) toast({ title: "Inwisselen mislukt", description: error.message, variant: "destructive" }); else { await refreshProfile(); setLoyaltyRefresh((value) => value + 1); toast({ title: "Punten ingewisseld", description: `Uw eenmalige privécode is ${data}. De code blijft hieronder staan tot hij gebruikt is.` }); } }}>{convertingPoints ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Punten inwisselen</Button></div>
            {loyaltyCodes.length > 0 && <div className="mt-4 border-t pt-4"><p className="text-xs font-medium text-muted-foreground mb-2">Beschikbare privécodes</p><div className="flex flex-wrap gap-2">{loyaltyCodes.map((code) => <span key={code.id} className="rounded-lg border bg-background px-3 py-2 text-sm"><strong className="font-mono">{code.code}</strong> · €{Number(code.discount_value).toFixed(2)} korting</span>)}</div></div>}
          </section>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : orders.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-bold text-primary mb-2">Nog geen bestellingen</h2>
              <p className="text-muted-foreground mb-6">Plaats uw eerste bestelling om te beginnen.</p>
              <Link to="/bestellen">
                <Button><Plus className="w-4 h-4" /> Start uw bestelling</Button>
              </Link>
            </motion.div>
          ) : (
            <div className="grid gap-4">
              {orders.map((order, i) => {
                const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.submitted;
                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                      <div className="bg-card rounded-xl p-6 shadow-overweel-card hover:shadow-overweel-md transition-shadow border border-border">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="font-bold text-primary">{order.order_number}</h3>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {new Date(order.submitted_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}
                              {order.material && ` · ${order.material}`}
                            </p>
                          </div>
                          <div className="text-right space-y-2">
                            {order.final_price ? (
                              <p className="text-lg font-bold text-accent">€{Number(order.final_price).toFixed(2)}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Indicatie: €{Number(order.instant_quote_price).toFixed(2)}
                              </p>
                            )}
                            <div className="flex gap-2 justify-end"><Button size="sm" variant="outline" asChild><Link to={`/order/${order.customer_order_token}`}><Eye className="w-4 h-4" /> Bekijken</Link></Button><Button size="sm" onClick={() => setRepeatOrder(order)}><Repeat2 className="w-4 h-4" /> Opnieuw bestellen</Button></div>
                          </div>
                        </div>
                      </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
      <ConfirmActionDialog open={repeatOrder !== null} onOpenChange={(open) => !open && setRepeatOrder(null)} title="Bestelling opnieuw bestellen?" description="Prijs kan veranderen, u zal hierover geïnformeerd worden." confirmLabel="Opnieuw bestellen" onConfirm={() => { if (repeatOrder) navigate(`/bestellen?repeat=${repeatOrder.id}`); setRepeatOrder(null); }} />
    </div>
  );
}
