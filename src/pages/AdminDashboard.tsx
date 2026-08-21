import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Package, Eye, Plus, FileText, Megaphone, ShoppingBag, Tag, MailPlus, Mail, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";
import { getFunctionErrorMessage } from "@/lib/functionErrors";

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
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>(() => searchParams.get("customer")?.trim().toLowerCase() || "all");
  const [sendingTestMail, setSendingTestMail] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_email, status, instant_quote_price, final_price, submitted_at, material, link_first_viewed_at, link_last_viewed_at, link_view_count")
        .order("submitted_at", { ascending: false });
      if (error) {
        toast({ title: "Bestellingen laden mislukt", description: error.message, variant: "destructive" });
        setOrders([]);
      } else {
        setOrders((data as AdminOrder[]) || []);
      }
      setLoading(false);
    };

    void fetchOrders();
  }, [authLoading, isAdmin, toast]);

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

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-primary">🔒 Admin Dashboard</h1>
              <p className="text-muted-foreground">{orders.length} bestellingen totaal</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleSendTestMail} disabled={sendingTestMail}>
                {sendingTestMail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Testmail sturen
              </Button>
              <Link to="/admin/blog">
                <Button variant="outline"><FileText className="w-4 h-4" /> Blog</Button>
              </Link>
              <Link to="/admin/products">
                <Button variant="outline"><ShoppingBag className="w-4 h-4" /> Producten</Button>
              </Link>
              <Link to="/admin/content">
                <Button variant="outline"><Megaphone className="w-4 h-4" /> Content</Button>
              </Link>
              <Link to="/admin/discounts">
                <Button variant="outline"><Tag className="w-4 h-4" /> Kortingscodes</Button>
              </Link>
              <Link to="/admin/colors">
                <Button variant="outline">🎨 Kleuren</Button>
              </Link>
              <Link to="/admin/newsletter">
                <Button variant="outline"><MailPlus className="w-4 h-4" /> Nieuwsbrief</Button>
              </Link>
              <Link to="/admin/customers">
                <Button variant="outline"><Users className="w-4 h-4" /> Klanten</Button>
              </Link>
              <Link to="/admin/new-order">
                <Button><Plus className="w-4 h-4" /> Bestelling aanmaken</Button>
              </Link>
            </div>
          </div>

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
            <div className="bg-card rounded-2xl shadow-overweel-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
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
                        <tr key={order.id} className="border-b border-border hover:bg-muted/30 transition-colors">
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
                                <span className="text-green-700 dark:text-green-300 font-medium">Bezocht</span>
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
                          <td className="p-4 font-semibold text-accent">
                            {order.final_price ? `€${Number(order.final_price).toFixed(2)}` : "—"}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {new Date(order.submitted_at).toLocaleDateString("nl-NL")}
                          </td>
                          <td className="p-4 text-right">
                            <Link to={`/admin/order/${order.id}`}>
                              <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /> Bekijken</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
