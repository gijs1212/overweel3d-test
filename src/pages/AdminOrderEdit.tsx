import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ArrowLeft, FileText, Download, Send, Trash2, CheckCircle, Link2, Truck } from "lucide-react";
import { CustomPhotosSection } from "@/components/CustomPhotosSection";
import { OrderChat } from "@/components/OrderChat";
import { DeliveryScheduler } from "@/components/DeliveryScheduler";
import { PlateTracker } from "@/components/PlateTracker";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";

interface Order {
  id: string; order_number: string; user_id: string | null; customer_email: string;
  customer_name: string; phone: string; company_name: string; billing_address: string;
  shipping_address: string; postal_code: string; city: string; country: string;
  vat_number: string; material: string; color: string; quantity: number; notes: string;
  print_preferences: string; instant_quote_price: number; final_price: number | null;
  tikkie_link: string | null; status: OrderStatus; customer_order_token: string;
  customer_visible_notes: string; internal_notes: string; file_links: string;
  order_method: string; submitted_at: string; approved_at: string | null;
  rejected_at: string | null; created_at: string; updated_at: string;
  parts_total: number; parts_per_plate: number; plates_completed: number;
  delivery_email: string;
  shipping_carrier: string; tracking_code: string; shipping_cost: number;
  plate_runs_required: number; plate_runs_completed: any;
}

interface OrderFile { id: string; storage_path: string; original_filename: string; file_size: number; mime_type: string; }
interface Appointment { id: string; proposed_date: string; proposed_time_slot: string; status: string; proposed_by: string; customer_notes: string; admin_notes: string; created_at: string; }

export default function AdminOrderEdit() {
  const { orderId } = useParams<{ orderId: string }>();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [finalPrice, setFinalPrice] = useState("");
  const [tikkieLink, setTikkieLink] = useState("");
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [partsTotal, setPartsTotal] = useState(0);
  const [partsPerPlate, setPartsPerPlate] = useState(1);
  const [platesCompleted, setPlatesCompleted] = useState(0);
  const [plateRunsRequired, setPlateRunsRequired] = useState(1);
  const [plateRunsCompleted, setPlateRunsCompleted] = useState<number[]>([]);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [originalFinalPrice, setOriginalFinalPrice] = useState<number | null>(null);

  const fetchAppointments = async () => {
    if (!orderId) return;
    const { data } = await supabase.from("delivery_appointments").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
    setAppointments((data as Appointment[]) || []);
  };

  useEffect(() => {
    if (!orderId) return;
    const load = async () => {
      const { data: orderData } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (orderData) {
        const o = orderData as unknown as Order;
        setOrder(o);
        setFinalPrice(o.final_price?.toString() || "");
        setTikkieLink(o.tikkie_link || "");
        setStatus(o.status);
        setCustomerNotes(o.customer_visible_notes || "");
        setInternalNotes(o.internal_notes || "");
        setPartsTotal(o.parts_total || 0);
        setPartsPerPlate(o.parts_per_plate || 1);
        setPlatesCompleted(o.plates_completed || 0);
        setPlateRunsRequired(o.plate_runs_required || 1);
        setPlateRunsCompleted(Array.isArray(o.plate_runs_completed) ? o.plate_runs_completed : []);
        setDeliveryEmail(o.delivery_email || "");
        setShippingCarrier(o.shipping_carrier || "");
        setTrackingCode(o.tracking_code || "");
        setShippingCost(o.shipping_cost?.toString() || "");
        setOriginalFinalPrice(o.final_price);
      }
      const { data: filesData } = await supabase.from("order_files").select("*").eq("order_id", orderId);
      setFiles((filesData as OrderFile[]) || []);
      setLoading(false);
    };
    load();
    fetchAppointments();
  }, [orderId]);

  if (!isAdmin) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Geen toegang.</p></main><Footer /></div>);
  }

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const newFinalPrice = finalPrice ? parseFloat(finalPrice) : null;
      const priceChanged = newFinalPrice !== originalFinalPrice && newFinalPrice !== null;
      const effectiveStatus = priceChanged ? "waiting_for_approval" as OrderStatus : status;

      const { error } = await supabase.from("orders").update({
        final_price: newFinalPrice,
        tikkie_link: tikkieLink || null,
        status: effectiveStatus,
        customer_visible_notes: customerNotes,
        internal_notes: internalNotes,
        parts_total: partsTotal,
        parts_per_plate: partsPerPlate,
        plates_completed: platesCompleted,
        plate_runs_required: plateRunsRequired,
        plate_runs_completed: plateRunsCompleted,
        delivery_email: deliveryEmail,
        shipping_carrier: shippingCarrier,
        tracking_code: trackingCode,
        shipping_cost: shippingCost ? parseFloat(shippingCost) : 0,
        saved: false,
      }).eq("id", order.id);
      if (error) throw error;

      await supabase.from("order_events").insert({
        order_id: order.id, event_type: "admin_update",
        event_description: priceChanged
          ? `Definitieve prijs ingesteld op €${newFinalPrice!.toFixed(2)}. Status: Wacht op goedkeuring klant.`
          : `Bestelling bijgewerkt door admin. Status: ${ORDER_STATUSES[effectiveStatus].label}`,
        visible_to_customer: true,
      });

      const isAdminOrder = order.customer_email === "admin@overweel3d.nl";
      if (!isAdminOrder) {
        await supabase.functions.invoke("send-order-email", { body: { type: "order_updated", orderId: order.id } });
      }

      toast({ title: isAdminOrder ? "Opgeslagen! ✅" : "Opgeslagen! Klant op de hoogte gebracht. ✉️" });
      setOriginalFinalPrice(newFinalPrice);
      setStatus(effectiveStatus);
      setOrder({ ...order, final_price: newFinalPrice, tikkie_link: tikkieLink || null, status: effectiveStatus, customer_visible_notes: customerNotes, internal_notes: internalNotes, parts_total: partsTotal, parts_per_plate: partsPerPlate, plates_completed: platesCompleted, delivery_email: deliveryEmail, shipping_carrier: shippingCarrier, tracking_code: trackingCode, shipping_cost: parseFloat(shippingCost) || 0, plate_runs_required: plateRunsRequired, plate_runs_completed: plateRunsCompleted });
    } catch (error: any) {
      toast({ title: "Fout bij opslaan", description: error.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleNotifyCustomer = async () => {
    if (!order) return;
    setNotifying(true);
    try {
      await supabase.functions.invoke("send-order-email", { body: { type: "order_updated", orderId: order.id } });
      toast({ title: "Klant is op de hoogte gebracht!" });
    } catch { toast({ title: "E-mail verzenden mislukt", variant: "destructive" }); }
    finally { setNotifying(false); }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage.from("orders").download(storagePath);
    if (error) { toast({ title: "Download mislukt", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteFile = async (fileId: string, storagePath: string) => {
    if (!confirm("Bestand verwijderen?")) return;
    try {
      await supabase.storage.from("orders").remove([storagePath]);
      await supabase.from("order_files").delete().eq("id", fileId);
      setFiles(files.filter((f) => f.id !== fileId));
      toast({ title: "Bestand verwijderd" });
    } catch (error: any) { toast({ title: "Fout", description: error.message, variant: "destructive" }); }
  };

  const handleCompleteOrder = async () => {
    if (!order || !confirm(`Bestelling ${order.order_number} voltooien?`)) return;
    setCompleting(true);
    try {
      const { error } = await supabase.functions.invoke("complete-order", { body: { order_id: order.id } });
      if (error) throw error;
      toast({ title: "Bestelling voltooid! ✅" });
      setOrder({ ...order, status: "completed" as OrderStatus });
      setStatus("completed" as OrderStatus);
    } catch (error: any) { toast({ title: "Fout", description: error.message, variant: "destructive" }); }
    finally { setCompleting(false); }
  };

  const handleDeleteOrder = async () => {
    if (!order || !confirm(`Bestelling ${order.order_number} VERWIJDEREN? Dit kan niet ongedaan worden.`)) return;
    setDeleting(true);
    try {
      if (files.length > 0) await supabase.storage.from("orders").remove(files.map((f) => f.storage_path));
      await supabase.from("order_files").delete().eq("order_id", order.id);
      await supabase.from("order_events").delete().eq("order_id", order.id);
      await supabase.from("order_messages").delete().eq("order_id", order.id);
      await supabase.from("delivery_appointments").delete().eq("order_id", order.id);
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;
      toast({ title: "Bestelling verwijderd" });
      navigate("/admin");
    } catch (error: any) { toast({ title: "Fout", description: error.message, variant: "destructive" }); }
    finally { setDeleting(false); }
  };

  if (loading) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-accent" /></main><Footer /></div>);
  }
  if (!order) return null;

  const statusInfo = ORDER_STATUSES[order.status];
  const isAdminOrder = order.customer_email === "admin@overweel3d.nl";
  const fileLinksArray = order.file_links ? order.file_links.split("\n").filter(Boolean) : [];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-primary">{order.order_number}</h1>
              <p className="text-sm text-muted-foreground">
                {order.customer_name} · {order.customer_email}
                {isAdminOrder && <span className="ml-2 text-accent font-medium">(Admin bestelling)</span>}
              </p>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer Info */}
            {!isAdminOrder && (
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4">Klantgegevens</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Naam</span><span>{order.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">E-mail</span><span>{order.customer_email}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Telefoon</span><span>{order.phone || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bedrijf</span><span>{order.company_name || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Adres</span><span>{order.billing_address}, {order.postal_code} {order.city}</span></div>
                  {order.vat_number && <div className="flex justify-between"><span className="text-muted-foreground">BTW</span><span>{order.vat_number}</span></div>}
                </div>
              </div>
            )}

            {/* Order details */}
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Besteldetails</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Materiaal</span><span>{order.material}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kleur</span><span>{order.color}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Aantal</span><span>{order.quantity}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Indicatieprijs</span><span>€{Number(order.instant_quote_price || 0).toFixed(2)}</span></div>
                {order.notes && <div className="pt-2 border-t border-border"><p className="text-muted-foreground text-xs mb-1">Opmerkingen klant:</p><p>{order.notes}</p></div>}
              </div>
            </div>

            {/* File links / custom photos */}
            {order.order_method === "custom" ? (
              <CustomPhotosSection fileLinks={order.file_links} />
            ) : fileLinksArray.length > 0 && (
              <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
                <h3 className="font-bold text-primary mb-4 flex items-center gap-2"><Link2 className="w-5 h-5" /> Links ({fileLinksArray.length})</h3>
                <div className="space-y-2">
                  {fileLinksArray.map((link, i) => (
                    <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="block p-3 bg-muted/50 rounded-lg text-sm text-accent underline break-all hover:bg-muted transition-colors">{link}</a>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Bestanden ({files.length})</h3>
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-accent" />
                      <span className="text-sm">{file.original_filename}</span>
                      <span className="text-xs text-muted-foreground">({(file.file_size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => downloadFile(file.storage_path, file.original_filename)}><Download className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteFile(file.id, file.storage_path)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
                {files.length === 0 && <p className="text-sm text-muted-foreground">Geen bestanden geüpload.</p>}
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Tijdstempels</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Ingediend</span><span>{new Date(order.submitted_at).toLocaleString("nl-NL")}</span></div>
                {order.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Geaccepteerd</span><span>{new Date(order.approved_at).toLocaleString("nl-NL")}</span></div>}
                {order.rejected_at && <div className="flex justify-between"><span className="text-muted-foreground">Afgewezen</span><span>{new Date(order.rejected_at).toLocaleString("nl-NL")}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Laatst bijgewerkt</span><span>{new Date(order.updated_at).toLocaleString("nl-NL")}</span></div>
              </div>
            </div>

            {/* Admin edit section */}
            <div className="lg:col-span-2 bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-6">✏️ Bestelling bewerken</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {finalPrice && parseFloat(finalPrice) !== originalFinalPrice && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ Prijs gewijzigd — status wordt automatisch naar "Wacht op goedkeuring" gezet.</p>
                  )}
                </div>
                <div>
                  <Label>Definitieve prijs (€)</Label>
                  <Input type="number" step="0.01" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div className="md:col-span-2">
                  <Label>Tikkie betaallink</Label>
                  <Input value={tikkieLink} onChange={(e) => setTikkieLink(e.target.value)} placeholder="https://tikkie.me/..." />
                </div>

                {/* Shipping */}
                <div className="md:col-span-2 border-t border-border pt-4">
                  <h4 className="font-semibold text-primary mb-3 flex items-center gap-2"><Truck className="w-4 h-4" /> Verzending</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Vervoerder</Label>
                      <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                        <SelectTrigger><SelectValue placeholder="Kies vervoerder" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Geen</SelectItem>
                          <SelectItem value="PostNL">PostNL</SelectItem>
                          <SelectItem value="DHL">DHL</SelectItem>
                          <SelectItem value="Bezorgen">Zelf bezorgen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Track & Trace code</Label>
                      <Input value={trackingCode} onChange={e => setTrackingCode(e.target.value)} placeholder="3SXXXX..." />
                    </div>
                    <div>
                      <Label>Verzendkosten (€)</Label>
                      <Input type="number" step="0.01" value={shippingCost} onChange={e => setShippingCost(e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                  {shippingCost && parseFloat(shippingCost) > 0 && finalPrice && (
                    <p className="text-sm text-muted-foreground mt-2">
                      💰 Totaal voor klant: €{(parseFloat(finalPrice) + parseFloat(shippingCost)).toFixed(2)} (product + verzending)
                    </p>
                  )}
                </div>

                {/* Plate tracking */}
                <div className="md:col-span-2">
                  <PlateTracker
                    partsTotal={partsTotal}
                    partsPerPlate={partsPerPlate}
                    plateRunsRequired={plateRunsRequired}
                    plateRunsCompleted={plateRunsCompleted}
                    onUpdate={(data) => {
                      setPartsTotal(data.partsTotal);
                      setPartsPerPlate(data.partsPerPlate);
                      setPlateRunsRequired(data.plateRunsRequired);
                      setPlateRunsCompleted(data.plateRunsCompleted);
                      setPlatesCompleted(data.platesCompleted);
                    }}
                  />
                </div>

                {/* Delivery email for admin orders */}
                {isAdminOrder && (
                  <div className="md:col-span-2">
                    <Label>Bezorg e-mail (voor melding wanneer klaar)</Label>
                    <Input type="email" value={deliveryEmail} onChange={(e) => setDeliveryEmail(e.target.value)} placeholder="klant@email.nl" />
                  </div>
                )}

                <div className="md:col-span-2">
                  <Label>Notities voor klant (zichtbaar)</Label>
                  <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} placeholder="Zichtbaar voor de klant." />
                </div>
                <div className="md:col-span-2">
                  <Label>Interne notities</Label>
                  <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} placeholder="Alleen voor admin." />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6 flex-wrap">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Opslaan
                </Button>
                {!isAdminOrder && (
                  <Button variant="outline" onClick={handleNotifyCustomer} disabled={notifying}>
                    {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Klant notificeren
                  </Button>
                )}
                {(order.status === "approved_by_customer" || order.status === "waiting_for_payment" || order.status === "in_production") && (
                  <Button onClick={handleCompleteOrder} disabled={completing} className="bg-green-600 hover:bg-green-700 text-white">
                    {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Voltooi bestelling
                  </Button>
                )}
                <Button variant="outline" onClick={async () => {
                  try { await supabase.from("orders").update({ saved: false }).eq("id", order.id); toast({ title: "Backup status gereset ✅" }); }
                  catch (e: any) { toast({ title: "Fout", description: e.message, variant: "destructive" }); }
                }}>🔄 Reset backup</Button>
                <div className="sm:ml-auto">
                  <Button variant="destructive" onClick={handleDeleteOrder} disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Verwijderen
                  </Button>
                </div>
              </div>
            </div>

            {/* Delivery Appointments */}
            <div className="lg:col-span-2">
              <DeliveryScheduler orderId={order.id} appointments={appointments} isAdmin onUpdate={fetchAppointments} />
            </div>

            {/* Chat */}
            <div className="lg:col-span-2">
              <OrderChat orderId={order.id} senderType="admin" orderNumber={order.order_number} />
            </div>

            {/* Order link */}
            {!isAdminOrder && (
              <div className="lg:col-span-2 bg-muted/50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">
                  📎 Klant order link:{" "}
                  <a href={`${window.location.origin}/order/${order.customer_order_token}`} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
                    {window.location.origin}/order/{order.customer_order_token}
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
