import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, FileText, Download, ExternalLink, AlertCircle, PartyPopper } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  material: string;
  color: string;
  quantity: number;
  notes: string;
  instant_quote_price: number;
  final_price: number | null;
  tikkie_link: string | null;
  status: OrderStatus;
  customer_visible_notes: string;
  customer_order_token: string;
  submitted_at: string;
  order_method?: string;
  file_links?: string;
  approved_at: string | null;
  rejected_at: string | null;
  billing_address: string;
  shipping_address: string;
  postal_code: string;
  city: string;
  country: string;
}

interface OrderFile {
  id: string;
  storage_path: string;
  original_filename: string;
  file_size: number;
}

interface OrderEvent {
  id: string;
  event_type: string;
  event_description: string;
  visible_to_customer: boolean;
  created_at: string;
}

export default function OrderDetail() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrder = async () => {
    if (!token) return;

    // Try fetching via edge function for token-based access
    const { data, error } = await supabase.functions.invoke("get-order-by-token", {
      body: { token },
    });

    if (error || !data?.order) {
      toast({ title: "Bestelling niet gevonden", variant: "destructive" });
      setLoading(false);
      return;
    }

    setOrder(data.order);
    setFiles(data.files || []);
    setEvents(data.events || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();
  }, [token]);

  const handleAccept = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("update-order-status", {
        body: { token, action: "accept" },
      });
      toast({ title: "Bestelling geaccepteerd! 🎉" });
      await fetchOrder();
    } catch (error) {
      toast({ title: "Er ging iets mis", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("update-order-status", {
        body: { token, action: "reject" },
      });
      toast({ title: "Bestelling afgewezen" });
      await fetchOrder();
    } catch (error) {
      toast({ title: "Er ging iets mis", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage.from("orders").download(storagePath);
    if (error) {
      toast({
        title: "Bestand niet beschikbaar",
        description: "Dit bestand is verplaatst. Neem contact op met gijsoverweel@gmail.com als u een kopie van dit bestand wilt.",
        variant: "destructive",
      });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFileUrl = (storagePath: string) => {
    const { data } = supabase.storage.from("orders").getPublicUrl(storagePath);
    return data?.publicUrl;
  };

  if (loading) {
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

  if (!order) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-primary mb-2">Bestelling niet gevonden</h1>
            <p className="text-muted-foreground">Controleer of de link correct is.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.submitted;
  const showAcceptReject = order.status === "waiting_for_approval" && order.final_price;
  const isAccepted = order.status === "approved_by_customer" || order.status === "waiting_for_payment" || order.status === "in_production";
  const isRejected = order.status === "rejected_by_customer";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {isSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-8 text-center"
            >
              <PartyPopper className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-green-800 dark:text-green-200 mb-2">Bestelling succesvol geplaatst! 🎉</h2>
              <p className="text-green-700 dark:text-green-300 text-sm">
                U ontvangt een bevestigingsmail op <strong>{order.customer_email}</strong>. Bewaar deze link om uw bestelling te volgen.
              </p>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-primary">Bestelling {order.order_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Geplaatst op {new Date(order.submitted_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}
                </p>
              </div>
              <span className={`inline-block mt-2 md:mt-0 px-4 py-2 rounded-full text-sm font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pricing */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Prijsinformatie</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Indicatieprijs</span>
                    <span className="font-medium">€{Number(order.instant_quote_price).toFixed(2)}</span>
                  </div>
                  {order.final_price && (
                    <div className="flex justify-between border-t border-border pt-3">
                      <span className="font-semibold text-primary">Definitieve prijs</span>
                      <span className="text-xl font-bold text-accent">€{Number(order.final_price).toFixed(2)}</span>
                    </div>
                  )}
                  {order.tikkie_link && (
                    <div className="border-t border-border pt-3">
                      <a href={order.tikkie_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-accent hover:underline font-medium">
                        <ExternalLink className="w-4 h-4" /> Betalen via Tikkie
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    ⚠️ De indicatieprijs is slechts een schatting en is nooit de definitieve prijs. Minimum bestelling is €5,-.
                  </p>
                </div>
              </div>

              {/* Order details */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Besteldetails</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Materiaal</span><span>{order.material}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kleur</span><span>{order.color}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aantal</span><span>{order.quantity}</span></div>
                  {order.notes && <div className="pt-2 border-t border-border"><span className="text-muted-foreground block mb-1">Opmerkingen</span><p>{order.notes}</p></div>}
                </div>
              </div>

              {/* Files */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Bestanden ({files.length})</h3>
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file.id} className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-accent" />
                          <span className="text-sm truncate max-w-[200px]">{file.original_filename}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => downloadFile(file.storage_path, file.original_filename)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Address */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Verzendadres</h3>
                <p className="text-sm text-muted-foreground">
                  {order.customer_name}<br />
                  {order.shipping_address || order.billing_address}<br />
                  {order.postal_code} {order.city}<br />
                  {order.country}
                </p>
              </div>
            </div>

            {/* Customer visible notes */}
            {order.customer_visible_notes && (
              <div className="mt-6 bg-accent/10 border border-accent/30 rounded-2xl p-6">
                <h3 className="font-bold text-primary mb-2">📋 Bericht van Overweel3D</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap">{order.customer_visible_notes}</p>
              </div>
            )}

            {/* Accept / Reject */}
            {showAcceptReject && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-card rounded-2xl p-8 shadow-overweel-card text-center">
                <h3 className="text-xl font-bold text-primary mb-2">Uw definitieve offerte is klaar</h3>
                <p className="text-muted-foreground mb-4">
                  Wij hebben uw definitieve prijs vastgesteld. Bekijk het aanbod en kies om te accepteren of af te wijzen.
                </p>
                <p className="text-3xl font-bold text-accent mb-6">€{Number(order.final_price).toFixed(2)}</p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={handleAccept} disabled={actionLoading} size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Accepteren
                  </Button>
                  <Button onClick={handleReject} disabled={actionLoading} variant="destructive" size="lg">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Afwijzen
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Accepted state */}
            {isAccepted && (
              <div className="mt-8 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-2xl p-8 text-center">
                <Check className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-green-800 dark:text-green-200 mb-2">Geaccepteerd! 🎉</h3>
                <p className="text-green-700 dark:text-green-300 mb-4">
                  Binnenkort zal de betalingslink toegevoegd worden. Na betaling zal de productie beginnen.
                </p>
                {order.tikkie_link && (
                  <Button asChild size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                    <a href={order.tikkie_link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" /> Betalen via Tikkie
                    </a>
                  </Button>
                )}
              </div>
            )}

            {/* Rejected state */}
            {isRejected && (
              <div className="mt-8 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
                <X className="w-12 h-12 text-red-600 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-2">Offerte afgewezen</h3>
                <p className="text-red-700 dark:text-red-300">
                  Jammer dat u geweigerd heeft. Vindt u de prijs te hoog of heeft u nog andere vragen? 
                  Stuur ze dan naar{" "}
                  <a href="mailto:gijsoverweel@gmail.com" className="underline font-semibold">Gijsoverweel@gmail.com</a>.
                </p>
              </div>
            )}

            {/* Event timeline */}
            {events.length > 0 && (
              <div className="mt-8 bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Tijdlijn</h3>
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm">{event.event_description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleString("nl-NL")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
