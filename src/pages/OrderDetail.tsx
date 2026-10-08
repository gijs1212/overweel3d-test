import { useCallback, useState, useEffect, useRef } from "react";
import { createClientId } from "@/lib/clientId";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2, FileText, Download, ExternalLink, AlertCircle, PartyPopper, Send, MessageCircle, Calendar, Clock, Truck, Package, Upload, Eye, Link2, LogIn, Repeat2 } from "lucide-react";
import { CustomPhotosSection } from "@/components/CustomPhotosSection";
import { PrintProgress } from "@/components/PrintProgress";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { ModelViewer } from "@/components/ModelViewer";
import { ThreeMfOrderPreview } from "@/components/ThreeMfOrderPreview";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { CustomerSelectedPlatePreview, type CustomerPlatePreview } from "@/components/CustomerSelectedPlatePreview";

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
  applied_discount_code: string | null;
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
  total_products: number;
  total_plates: number;
  plate_print_statuses: boolean[];
  plate_runs_required_per_plate: number[];
  plate_runs_completed: number[];
  shipping_carrier?: string;
  tracking_code?: string;
  shipping_cost?: number;
  customer_upload_requested?: boolean;
  customer_upload_request_note?: string | null;
  linked_to_account: boolean;
  linked_to_current_user: boolean;
}

interface OrderFile { id: string; storage_path: string; original_filename: string; file_size: number; }
interface OrderEvent { id: string; event_type: string; event_description: string; visible_to_customer: boolean; created_at: string; }
interface Message { id: string; sender_type: string; message: string; created_at: string; read: boolean; }
interface Appointment { id: string; proposed_date: string; proposed_time_slot: string; status: string; proposed_by: string; customer_notes: string; admin_notes: string; created_at: string; }

export default function OrderDetail() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "true";
  const { toast } = useToast();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [selectedPlates, setSelectedPlates] = useState<CustomerPlatePreview[]>([]);
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
  const [uploadingCustomer, setUploadingCustomer] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<Record<string, File>>({});
  const [fileLoadingId, setFileLoadingId] = useState<string | null>(null);
  const [claimingOrder, setClaimingOrder] = useState(false);
  const [repeatConfirmationOpen, setRepeatConfirmationOpen] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({ shipping_address: "", postal_code: "", city: "", country: "Nederland" });
  const addressInitializedOrderId = useRef<string | null>(null);
  const fetchOrder = useCallback(async (registerVisit = true, silent = false) => {
    if (!token) return;
    const { data, error } = await supabase.functions.invoke("get-order-by-token", {
      body: { token, registerVisit },
    });
    if (error || !data?.order) {
      if (!silent) toast({ title: "Bestelling niet gevonden", variant: "destructive" });
      setLoading(false);
      return;
    }
    setOrder(data.order);
    if (addressInitializedOrderId.current !== data.order.id) {
      setAddressForm({
        shipping_address: data.order.shipping_address || data.order.billing_address || "",
        postal_code: data.order.postal_code || "",
        city: data.order.city || "",
        country: data.order.country || "Nederland",
      });
      addressInitializedOrderId.current = data.order.id;
    }
    setFiles(data.files || []);
    setSelectedPlates(data.selectedPlates || []);
    setEvents(data.events || []);
    setMessages(data.messages || []);
    setAppointments(data.appointments || []);
    setLoading(false);
  }, [toast, token]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);

  useEffect(() => {
    const refresh = () => void fetchOrder(false, true);
    const timer = window.setInterval(refresh, 15_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchOrder]);

  const handleAccept = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-order-status", { body: { token, action: "accept" } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Accepteren mislukt");
      toast({ title: "Bestelling geaccepteerd! 🎉" });
      await fetchOrder(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Probeer het opnieuw.";
      toast({ title: "Accepteren mislukt", description, variant: "destructive" });
    }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-order-status", { body: { token, action: "reject" } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Afwijzen mislukt");
      toast({ title: "Bestelling afgewezen" });
      await fetchOrder(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Probeer het opnieuw.";
      toast({ title: "Afwijzen mislukt", description, variant: "destructive" });
    }
    finally { setActionLoading(false); }
  };

  const requestFileUrl = async (fileId: string, download: boolean) => {
    if (!token) throw new Error("Ongeldige bestellink");
    const { data, error } = await supabase.functions.invoke("get-order-by-token", {
      body: { token, action: "get_file_url", fileId, download },
    });
    if (error) throw error;
    if (!data?.signedUrl) throw new Error(data?.error || "Bestand niet beschikbaar");
    return data.signedUrl as string;
  };

  const saveMissingAddress = async () => {
    if (!token || !addressForm.shipping_address.trim() || !addressForm.postal_code.trim() || !addressForm.city.trim()) {
      toast({ title: "Vul het volledige verzendadres in", variant: "destructive" });
      return;
    }
    setSavingAddress(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-order-by-token", {
        body: { token, action: "update_shipping_address", addressData: addressForm },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Adres opslaan mislukt");
      await fetchOrder(false);
      toast({ title: "Verzendadres opgeslagen" });
    } catch (error) {
      toast({ title: "Adres opslaan mislukt", description: error instanceof Error ? error.message : "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setSavingAddress(false);
    }
  };

  const downloadFile = async (file: OrderFile) => {
    setFileLoadingId(file.id);
    try {
      const signedUrl = await requestFileUrl(file.id, true);
      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.download = file.original_filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      toast({
        title: "Bestand niet beschikbaar",
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setFileLoadingId(null);
    }
  };

  const togglePreview = async (file: OrderFile) => {
    if (previewFileId === file.id) {
      setPreviewFileId(null);
      return;
    }
    if (previewFiles[file.id]) {
      setPreviewFileId(file.id);
      return;
    }
    setFileLoadingId(file.id);
    try {
      const signedUrl = await requestFileUrl(file.id, false);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error("Previewbestand downloaden mislukt");
      const blob = await response.blob();
      const previewFile = new File([blob], file.original_filename, { type: blob.type });
      setPreviewFiles((current) => ({ ...current, [file.id]: previewFile }));
      setPreviewFileId(file.id);
    } catch (error) {
      toast({
        title: "Preview niet beschikbaar",
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setFileLoadingId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !token) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-order-by-token", {
        body: { token, action: "send_message", message: newMessage.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Bericht verzenden mislukt");
      setNewMessage("");
      toast({ title: "Bericht verzonden ✅" });
      await fetchOrder(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Probeer het opnieuw.";
      toast({ title: "Verzenden mislukt", description, variant: "destructive" });
    } finally { setSending(false); }
  };

  const handleProposeDelivery = async () => {
    if (!deliveryDate || !token) return;
    setProposingDelivery(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-order-by-token", {
        body: { token, action: "propose_delivery", appointmentData: { date: deliveryDate, timeSlot: deliveryTime, notes: deliveryNotes } },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Bezorgvoorstel indienen mislukt");
      toast({ title: "Bezorgvoorstel ingediend ✅" });
      setShowDeliveryForm(false);
      setDeliveryDate(""); setDeliveryTime(""); setDeliveryNotes("");
      await fetchOrder(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Probeer het opnieuw.";
      toast({ title: "Bezorgvoorstel mislukt", description, variant: "destructive" });
    } finally { setProposingDelivery(false); }
  };

  const handleClaimOrder = async () => {
    if (!token || !user) return;
    setClaimingOrder(true);
    try {
      const { data, error } = await supabase.rpc("claim_order_to_account", { p_token: token });
      if (error) throw error;
      if (!data) throw new Error("De bestelling kon niet worden gekoppeld.");
      toast({ title: "Bestelling gekoppeld", description: "Deze bestelling staat nu in uw dashboard." });
      await fetchOrder(false);
    } catch (error) {
      toast({
        title: "Koppelen mislukt",
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setClaimingOrder(false);
    }
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
            {!order.linked_to_current_user && (
              <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-5">
                <div className="flex items-start gap-3">
                  <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="flex-1">
                    <h2 className="font-semibold text-primary">Koppel deze bestelling aan uw account</h2>
                    {!user ? (
                      <>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Log in of maak een account aan. Met deze persoonlijke bestellink kunt u de bestelling daarna aan dat account koppelen.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button asChild size="sm"><Link to="/login"><LogIn className="h-4 w-4" />Inloggen</Link></Button>
                          <Button asChild size="sm" variant="outline"><Link to="/register">Account aanmaken</Link></Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {order.linked_to_account
                            ? "Deze bestelling is nu aan een ander account gekoppeld. Met de persoonlijke bestellink kunt u haar naar uw huidige account overzetten."
                            : "Koppel deze bestelling aan uw huidige account. Het e-mailadres van uw account mag afwijken van het e-mailadres op de bestelling."}
                        </p>
                        <Button className="mt-4" disabled={claimingOrder} onClick={() => void handleClaimOrder()} size="sm">
                          {claimingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                          Aan mijn account koppelen
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {order.linked_to_current_user && (
              <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                Deze bestelling is gekoppeld aan uw account en staat in <Link className="font-semibold underline" to="/dashboard">Mijn bestellingen</Link>.
              </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-primary">Bestelling {order.order_number}</h1>
                <p className="text-sm text-muted-foreground">
                  Geplaatst op {new Date(order.submitted_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0">
                {order.linked_to_current_user && (
                  <Button variant="outline" onClick={() => setRepeatConfirmationOpen(true)}>
                    <Repeat2 className="h-4 w-4" /> Opnieuw bestellen
                  </Button>
                )}
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>

            {/* Productievoortgang uses independent product and plate totals. */}
            <div className="mb-6">
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
                <h3 className="font-bold text-primary mb-4">🏭 Productie</h3>
                {order.total_products > 0 || order.total_plates > 0 ? (
                  <PrintProgress
                    totalProducts={order.total_products || 0}
                    totalPlates={order.total_plates || 0}
                    platePrintStatuses={Array.isArray(order.plate_print_statuses) ? order.plate_print_statuses : []}
                    platePrintQuantities={Array.isArray(order.plate_runs_required_per_plate) ? order.plate_runs_required_per_plate : []}
                    plateRunsCompleted={Array.isArray(order.plate_runs_completed) ? order.plate_runs_completed : []}
                  />
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
                  {order.applied_discount_code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kortingscode</span>
                      <span className="font-mono font-semibold">{order.applied_discount_code}</span>
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
                    ⚠️ De indicatieprijs is slechts een schatting.
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
              <CustomerSelectedPlatePreview plates={selectedPlates} />
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

                  {order.customer_upload_requested && user && order.user_id === user.id && (
                    <div className="mb-4 p-4 rounded-lg border-2 border-dashed border-accent/50 bg-accent/5">
                      <p className="text-sm font-medium text-primary mb-1">📤 Upload-verzoek van Overweel3D</p>
                      {order.customer_upload_request_note && (
                        <p className="text-xs text-muted-foreground mb-3 whitespace-pre-wrap">{order.customer_upload_request_note}</p>
                      )}
                      <label className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-md text-sm cursor-pointer hover:opacity-90">
                        {uploadingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Bestand(en) uploaden
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={uploadingCustomer}
                          onChange={async (e) => {
                            const fs = Array.from(e.target.files || []);
                            if (!fs.length) return;
                            setUploadingCustomer(true);
                            try {
                              for (const f of fs) {
                                const safeName = f.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
                                const path = `${order.order_number}/files/customer-${createClientId()}-${safeName}`;
                                const uploaded = await uploadFileWithHeicConversion("orders", path, f, { upsert: false });
                                const { error: upErr } = uploaded;
                                if (upErr) throw upErr;
                                const { error: insErr } = await supabase.from("order_files").insert({
                                  order_id: order.id,
                                  storage_path: uploaded.path,
                                  original_filename: uploaded.file.name,
                                  file_size: uploaded.file.size,
                                  mime_type: uploaded.file.type || "application/octet-stream",
                                });
                                if (insErr) {
                                  await supabase.storage.from("orders").remove([uploaded.path]);
                                  throw insErr;
                                }
                              }
                              toast({ title: `${fs.length} bestand(en) geüpload ✅` });
                              await fetchOrder(false);
                            } catch (error) {
                              const description = error instanceof Error ? error.message : "Probeer het opnieuw.";
                              toast({ title: "Upload mislukt", description, variant: "destructive" });
                            } finally {
                              setUploadingCustomer(false);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}

                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div key={file.id} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                              <span className="text-sm truncate">{file.original_filename}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/\.(stl|obj|3mf)$/i.test(file.original_filename) && (
                                <Button variant="ghost" size="sm" onClick={() => void togglePreview(file)} disabled={fileLoadingId === file.id} aria-label={`Preview van ${file.original_filename}`}>
                                  {fileLoadingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => void downloadFile(file)} disabled={fileLoadingId === file.id} aria-label={`${file.original_filename} downloaden`}>
                                {fileLoadingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                          {previewFileId === file.id && (
                            <div className="mt-3">
                              {/\.3mf$/i.test(file.original_filename) ? (
                                <ThreeMfOrderPreview file={previewFiles[file.id]} />
                              ) : (
                                <ModelViewer file={previewFiles[file.id]} filename={file.original_filename} height={240} />
                              )}
                            </div>
                          )}
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
                {(order.shipping_address || order.billing_address) && order.postal_code && order.city ? (
                  <p className="text-sm text-muted-foreground">
                    {order.customer_name}<br />
                    {order.shipping_address || order.billing_address}<br />
                    {order.postal_code} {order.city}<br />
                    {order.country}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">De admin heeft nog geen volledig adres ingevuld. Vul hier uw verzendadres aan.</p>
                    <div><Label htmlFor="customer-shipping-address">Straat en huisnummer *</Label><Input id="customer-shipping-address" value={addressForm.shipping_address} onChange={(event) => setAddressForm((current) => ({ ...current, shipping_address: event.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="customer-postal-code">Postcode *</Label><Input id="customer-postal-code" value={addressForm.postal_code} onChange={(event) => setAddressForm((current) => ({ ...current, postal_code: event.target.value }))} /></div><div><Label htmlFor="customer-city">Plaats *</Label><Input id="customer-city" value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} /></div></div>
                    <div><Label htmlFor="customer-country">Land</Label><Input id="customer-country" value={addressForm.country} onChange={(event) => setAddressForm((current) => ({ ...current, country: event.target.value }))} /></div>
                    <Button type="button" onClick={() => void saveMissingAddress()} disabled={savingAddress}>{savingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Verzendadres opslaan</Button>
                  </div>
                )}
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

            {/* Bezorgafspraken - alleen bij zelf bezorgen */}
            {order.shipping_carrier === "Bezorgen" && (
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
            )}

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
      <ConfirmActionDialog
        open={repeatConfirmationOpen}
        onOpenChange={setRepeatConfirmationOpen}
        title="Deze bestelling opnieuw bestellen?"
        description="Prijs kan veranderen, u zal hierover geïnformeerd worden. Alleen nog beschikbare kant-en-klare artikelen worden overgenomen."
        confirmLabel="Opnieuw bestellen"
        onConfirm={() => navigate(`/bestellen?repeat=${order.id}`)}
      />
    </div>
  );
}
