import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Search, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildAdminCustomers, type AdminCustomer, type CustomerOrderRow, type CustomerProfileRow } from "@/lib/adminCustomers";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export default function AdminCustomers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const loadCustomers = async () => {
      const [profilesResult, ordersResult] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,email,billing_address,shipping_address,postal_code,city,country").order("full_name"),
        supabase.from("orders").select("user_id,customer_email,final_price,shipping_cost,status"),
      ]);

      if (profilesResult.error || ordersResult.error) {
        toast({
          title: "Klanten laden mislukt",
          description: profilesResult.error?.message || ordersResult.error?.message,
          variant: "destructive",
        });
        setCustomers([]);
      } else {
        setCustomers(buildAdminCustomers(
          (profilesResult.data || []) as CustomerProfileRow[],
          (ordersResult.data || []) as CustomerOrderRow[],
        ));
      }
      setLoading(false);
    };

    void loadCustomers();
  }, [authLoading, isAdmin, toast]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.firstName, customer.lastName, customer.email, customer.address]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [customers, search]);

  if (authLoading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></main></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center"><h1 className="text-2xl font-bold">Geen toegang</h1><p className="text-muted-foreground">Je hebt geen adminrechten.</p></main><Footer /></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button asChild size="icon" variant="ghost"><Link to="/admin" aria-label="Terug naar admin"><ArrowLeft className="w-4 h-4" /></Link></Button>
              <div><h1 className="text-2xl font-bold text-primary">Klanten</h1><p className="text-muted-foreground">{customers.length} personen met een account</p></div>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="Zoek op naam, e-mail of adres..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          {loading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div> : filtered.length === 0 ? (
            <div className="text-center py-16"><Users className="w-14 h-14 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">Geen klanten gevonden.</p></div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-muted/60 text-left"><tr><th className="p-4">Voornaam</th><th className="p-4">Achternaam</th><th className="p-4">E-mail</th><th className="p-4">Adres</th><th className="p-4 text-center">Bestellingen</th><th className="p-4 text-right">Totaal uitgegeven</th><th className="p-4 text-right">Actie</th></tr></thead>
                <tbody className="divide-y">
                  {filtered.map((customer) => <tr key={customer.userId} className="hover:bg-muted/30"><td className="p-4 font-medium">{customer.firstName}</td><td className="p-4">{customer.lastName}</td><td className="p-4"><a className="text-accent hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a></td><td className="p-4 max-w-xs">{customer.address}</td><td className="p-4 text-center">{customer.orderCount}</td><td className="p-4 text-right font-semibold text-primary">{euro.format(customer.totalSpent)}</td><td className="p-4 text-right"><Button asChild size="sm" variant="outline"><Link to={`/admin?customer=${encodeURIComponent(customer.email.trim().toLowerCase())}`}>Bestellingen bekijken</Link></Button></td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
