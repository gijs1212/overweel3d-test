import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Package, Plus, Loader2, User, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";

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

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileDismissed, setProfileDismissed] = useState(false);

  const isProfileIncomplete = profile && (!profile.billing_address || !profile.city || !profile.postal_code || !profile.phone);

  useEffect(() => {
    if (!user) return;
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, status, instant_quote_price, final_price, customer_order_token, submitted_at, material")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });
      setOrders((data as OrderSummary[]) || []);
      setLoading(false);
    };
    fetchOrders();
  }, [user]);

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
                <Button><Plus className="w-4 h-4" /> Upload uw bestand</Button>
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
                    <Link to={`/order/${order.customer_order_token}`}>
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
                          <div className="text-right">
                            {order.final_price ? (
                              <p className="text-lg font-bold text-accent">€{Number(order.final_price).toFixed(2)}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Indicatie: €{Number(order.instant_quote_price).toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
