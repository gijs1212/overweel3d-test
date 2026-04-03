import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2, FileText, Download, ExternalLink, AlertCircle, PartyPopper, Send, MessageCircle, Calendar, Clock, Truck, Package } from "lucide-react";
import { CustomPhotosSection } from "@/components/CustomPhotosSection";
import { PrintProgress } from "@/components/PrintProgress";
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
  parts_total: number;
  parts_per_plate: number;
  plates_completed: number;
  shipping_carrier?: string;
  tracking_code?: string;
  shipping_cost?: number;
}

interface OrderFile { id: string; storage_path: string; original_filename: string; file_size: number; }
interface OrderEvent { id: string; event_type: string; event_description: string; visible_to_customer: boolean; created_at: string; }
interface Message { id: string; sender_type: string; message: string; created_at: string; read: boolean; }
interface Appointment { id: string; proposed_date: string; proposed_time_slot: string; status: string; proposed_by: string; customer_notes: string; admin_notes: string; created_at: string; }

export default function OrderDetail() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";
  const { toast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [proposingDelivery, setProposingDelivery] = useState(false);

  const fetchOrder = async () => {
    if (!token) return;
    const { data, error } = await supabase.functions.invoke("get-order-by-token", { body: { token } });
    if (error || !data?.order) {
      toast({ title: "Bestelling niet gevonden", variant: "destructive" });
      setLoading(false);
      return;
    }
    setOrder(data.order);
    setFiles(data.files || []);
    setEvents(data.events || []);
    setMessages(data.messages || []);
    setAppointments(data.appointments || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrder(); }, [token]);

  const handleAccept = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("update-order-status", { body: { token, action: "accept" } });
      toast({ title: "Bestelling geaccepteerd! 🎉" });
      await fetchOrder();
    } catch { toast({ title: "Er ging iets mis", variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await supabase.functions.invoke("update-order-status", { body: { token, action: "reject" } });
      toast({ title: "Bestelling afgewezen" });
      await fetchOrder();
    } catch { toast({ title: "Er ging iets mis", variant: "destructive" }); }
    finally { setActionLoading(false); }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage.from("orders").download(storagePath);
    if (error) {
      toast({ title: "Bestand niet beschikbaar", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !token) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("get-order-by-token", {
        body: { token, action: "send_message", message: newMessage.trim() },
      });
      if (error) throw error;
      setNewMessage("");
      toast({ title: "Bericht verzonden ✅" });
      await fetchOrder();
    } catch (e: any) {
      toast({ title: "Verzenden mislukt", variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleProposeDelivery = async () => {
    if (!deliveryDate || !token) return;
    setProposingDelivery(true);
    try {
      await supabase.functions.invoke("get-order-by-token", {
        body: { token, action: "propose_delivery", appointmentData: { date: deliveryDate, timeSlot: deliveryTime, notes: deliveryNotes } },
      });
      toast({ title: "Bezorgvoorstel ingediend ✅" });
      setShowDeliveryForm(false);
      setDeliveryDate(""); setDeliveryTime(""); setDeliveryNotes("");
      await fetchOrder();
    } catch {
      toast({ title: "Fout", variant: "destructive" });
    } finally { setProposingDelivery(false); }
  };

  if (loading) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-accent" /></main><Footer /></div>);
  }

  if (!order) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container mx-auto px-4 py-16 text-center"><AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" /><h1 className="text-2xl font-bold text-primary mb-2">Bestelling niet gevonden</h1><p className="text-muted-foreground">Controleer of de link correct is.</p></div></main><Footer /></div>);
  }

  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.submitted;
  const showAcceptReject = order.status === "waiting_for_approval" && order.final_price;
  const isAccepted = order.status === "approved_by_customer" || order.status === "waiting_for_payment" || order.status === "in_production";
  const isRejected = order.status === "rejected_by_customer";
  const totalPrice = (order.final_price || 0) + (order.shipping_cost || 0);

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const statusLabels: Record<string, string> = { pending: "In afwachting", confirmed: "Bevestigd", cancelled: "Geannuleerd" };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {isSuccess && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-8 text-center">
              <PartyPopper className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-green-800 dark:text-green-200 mb-2">Bestelling succesvol geplaatst! 🎉</h2>
              <p className="text-green-700 dark:text-green-300 text-sm">
                U ontvangt een bevestigingsmail op <strong>{order.customer_email}</strong>. Bewaar deze link om uw bestelling te volgen.
              </p>
              <p className="text-green-600 dark:text-green-400 text-xs mt-2">
                📧 Als u geen email ontvangt, kijk dan in uw spam/ongewenste berichten.
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

            {/* Productie voortgang - always show when in_production or parts_total > 0 */}
            <div className="mb-6">
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
                <h3 className="font-bold text-primary mb-4">🏭 Productie</h3>
                {order.parts_total > 0 ? (
                  <PrintProgress partsTotal={order.parts_total} partsPerPlate={order.parts_per_plate} platesCompleted={order.plates_completed} />
                ) : (
                  <p className="text-sm text-muted-foreground">Productie-informatie wordt bijgewerkt zodra de productie start.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pricing */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Prijsinformatie</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Indicatieprijs</span>
                    <span className="font-medium">€{Number(order.instant_quote_price || 0).toFixed(2)}</span>
                  </div>
                  {order.final_price != null && order.final_price > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Definitieve prijs</span>
                      <span className="font-semibold text-accent">€{Number(order.final_price).toFixed(2)}</span>
                    </div>
                  )}
                  {(order.shipping_cost || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Verzendkosten ({order.shipping_carrier || "Verzending"})</span>
                      <span className="font-medium">€{Number(order.shipping_cost).toFixed(2)}</span>
                    </div>
                  )}
                  {order.final_price != null && order.final_price > 0 && (
                    <div className="flex justify-between border-t border-border pt-3">
                      <span className="font-semibold text-primary">Totaal</span>
                      <span className="text-xl font-bold text-accent">€{totalPrice.toFixed(2)}</span>
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
                    ⚠️ De indicatieprijs is slechts een schatting. Minimale bestelwaarde is €5,- totaal.
                  </p>
                </div>
              </div>

              {/* Order details */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Besteldetails</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Materiaal</span><span>{order.material || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kleur</span><span>{order.color || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Aantal</span><span>{order.quantity}</span></div>
                  {order.notes && <div className="pt-2 border-t border-border"><span className="text-muted-foreground block mb-1">Opmerkingen</span><p>{order.notes}</p></div>}
                </div>
              </div>

              {/* Shipping / Track & Trace */}
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4 flex items-center gap-2"><Truck className="w-5 h-5" /> Verzending</h3>
                {order.shipping_carrier && order.tracking_code ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vervoerder</span>
                      <span className="font-medium">{order.shipping_carrier}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Track & Trace</span>
                      <a
                        href={order.shipping_carrier.toLowerCase().includes("postnl")
                          ? `https://postnl.nl/tracktrace/?B=${order.tracking_code}`
                          : order.shipping_carrier.toLowerCase().includes("dhl")
                          ? `https://www.dhl.nl/nl/particulier/pakket-ontvangen/verzending-volgen.html?tracking-id=${order.tracking_code}`
                          : `#`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-accent hover:underline font-medium"
                      >
                        {order.tracking_code}
                      </a>
                    </div>
                    {(order.shipping_cost || 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Verzendkosten</span>
                        <span>€{Number(order.shipping_cost).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Verzendgegevens worden bijgewerkt zodra het pakket is verzonden.</p>
                )}
              </div>

              {/* Files/Links/Custom */}
              {order.order_method === "custom" ? (
                <CustomPhotosSection fileLinks={order.file_links} />
              ) : order.order_method === "link" ? (
                <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                  <h3 className="font-bold text-primary mb-4">Links</h3>
                  <div className="space-y-2">
                    {order.file_links?.split("\n").filter(Boolean).map((link, i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg">
                        <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:underline break-all">
                          <ExternalLink className="w-4 h-4 flex-shrink-0" /> {link}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                  <h3 className="font-bold text-primary mb-4">Bestanden ({files.length})</h3>
                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div key={file.id} className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-accent" />
                            <span className="text-sm truncate max-w-[200px]">{file.original_filename}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => downloadFile(file.storage_path, file.original_filename)}>
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Geen bestanden geüpload.</p>
                  )}
                </div>
              )}

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
                <p className="text-muted-foreground mb-4">Bekijk het aanbod en kies om te accepteren of af te wijzen.</p>
                <p className="text-3xl font-bold text-accent mb-6">€{totalPrice.toFixed(2)}</p>
                {(order.shipping_cost || 0) > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">incl. €{Number(order.shipping_cost).toFixed(2)} verzendkosten</p>
                )}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={handleAccept} disabled={actionLoading} size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accepteren
                  </Button>
                  <Button onClick={handleReject} disabled={actionLoading} variant="destructive" size="lg">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Afwijzen
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

            {isRejected && (
              <div className="mt-8 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
                <X className="w-12 h-12 text-red-600 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-red-800 dark:text-red-200 mb-2">Offerte afgewezen</h3>
                <p className="text-red-700 dark:text-red-300">
                  Jammer dat u geweigerd heeft. Stuur uw vragen naar{" "}
                  <a href="mailto:gijsoverweel@gmail.com" className="underline font-semibold">Gijsoverweel@gmail.com</a>.
                </p>
              </div>
            )}

            {/* Bezorgafspraken */}
            <div className="mt-6">
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
                <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-accent" /> Bezorgafspraken
                </h3>

                {appointments.length > 0 ? (
                  <div className="space-y-3 mb-4">
                    {appointments.map((apt) => (
                      <div key={apt.id} className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {new Date(apt.proposed_date).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
                              {apt.proposed_time_slot && ` — ${apt.proposed_time_slot}`}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[apt.status] || ""}`}>
                            {statusLabels[apt.status] || apt.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Voorgesteld door {apt.proposed_by === "admin" ? "Overweel3D" : "u"}
                        </p>
                        {apt.customer_notes && <p className="text-sm mt-1">U: {apt.customer_notes}</p>}
                        {apt.admin_notes && <p className="text-sm mt-1">Overweel3D: {apt.admin_notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">Nog geen bezorgafspraken. Doe hieronder een voorstel.</p>
                )}

                {showDeliveryForm ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <div>
                      <Label>Datum</Label>
                      <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
                    </div>
                    <div>
                      <Label>Tijdvak (optioneel)</Label>
                      <Input value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} placeholder="bijv. 's ochtends, 14:00-16:00" />
                    </div>
                    <div>
                      <Label>Opmerking (optioneel)</Label>
                      <Textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} rows={2} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleProposeDelivery} disabled={proposingDelivery || !deliveryDate} size="sm">
                        {proposingDelivery ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                        Voorstel indienen
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowDeliveryForm(false)}>Annuleren</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowDeliveryForm(true)}>
                    <Calendar className="w-4 h-4" /> Bezorgmoment voorstellen
                  </Button>
                )}
              </div>
            </div>

            {/* Chat */}
            <div className="mt-6">
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
                <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-accent" /> Berichten — {order.order_number}
                </h3>

                <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nog geen berichten. Stel hier uw vragen.</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.sender_type === "customer" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          msg.sender_type === "customer"
                            ? "bg-accent text-accent-foreground rounded-br-md"
                            : "bg-muted text-foreground rounded-bl-md"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${msg.sender_type === "customer" ? "text-accent-foreground/60" : "text-muted-foreground"}`}>
                            {msg.sender_type === "admin" ? "Overweel3D" : "U"} · {new Date(msg.created_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Textarea
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Typ een bericht..."
                    rows={2}
                    className="resize-none"
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  />
                  <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} size="sm" className="self-end">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Event timeline */}
            <div className="mt-8 bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Tijdlijn</h3>
              {events.length > 0 ? (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm">{event.event_description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("nl-NL")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nog geen updates beschikbaar.</p>
              )}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
