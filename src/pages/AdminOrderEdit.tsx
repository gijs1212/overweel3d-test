import { useCallback, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ArrowLeft, FileText, Download, Send, Trash2, CheckCircle, Link2, Truck, Receipt, Upload, MailQuestion, XCircle, Eye } from "lucide-react";
import { CustomPhotosSection } from "@/components/CustomPhotosSection";
import { OrderChat } from "@/components/OrderChat";
import { DeliveryScheduler } from "@/components/DeliveryScheduler";
import { PlateTracker } from "@/components/PlateTracker";
import { ModelViewer } from "@/components/ModelViewer";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { CatalogOrderItems } from "@/components/CatalogOrderItems";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";

interface Order {
  id: string; order_number: string; user_id: string | null; customer_email: string;
  customer_name: string; phone: string; company_name: string; billing_address: string;
  shipping_address: string; postal_code: string; city: string; country: string;
  vat_number: string; material: string; color: string; quantity: number; notes: string;
  print_preferences: string; instant_quote_price: number; final_price: number | null;
  applied_discount_code: string | null;
  tikkie_link: string | null; status: OrderStatus; customer_order_token: string;
  customer_visible_notes: string; internal_notes: string; file_links: string;
  order_method: string; submitted_at: string; approved_at: string | null;
  rejected_at: string | null; created_at: string; updated_at: string;
  parts_total: number; parts_per_plate: number; plates_completed: number;
  total_products: number; total_plates: number; plate_print_statuses: boolean[];
  plate_runs_required_per_plate: unknown;
  link_first_viewed_at: string | null; link_last_viewed_at: string | null; link_view_count: number;
  delivery_email: string;
  shipping_carrier: string; tracking_code: string; shipping_cost: number;
  plate_runs_required: number; plate_runs_completed: unknown;
  customer_upload_requested?: boolean;
  customer_upload_request_note?: string | null;
  customer_upload_requested_at?: string | null;
  filament_weight_g?: number | null;
  filament_price_per_kg?: number | null;
  catalog_items?: unknown;
}

interface OrderFile { id: string; storage_path: string; original_filename: string; file_size: number; mime_type: string; }
interface Appointment { id: string; proposed_date: string; proposed_time_slot: string; status: string; proposed_by: string; customer_notes: string; admin_notes: string; created_at: string; }

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Onbekende fout";
}

export default function AdminOrderEdit() {
  const { orderId } = useParams<{ orderId: string }>();
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingBackup, setResettingBackup] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceDesc, setInvoiceDesc] = useState("");
  const [invoiceBank, setInvoiceBank] = useState("");
  const [invoiceKvk, setInvoiceKvk] = useState("");
  const [invoiceBtw, setInvoiceBtw] = useState("");
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showRequestUpload, setShowRequestUpload] = useState(false);
  const [uploadRequestNote, setUploadRequestNote] = useState("");
  const [savingUploadRequest, setSavingUploadRequest] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [filePendingDelete, setFilePendingDelete] = useState<OrderFile | null>(null);
  const [showCompleteConfirmation, setShowCompleteConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const [finalPrice, setFinalPrice] = useState("");
  const [tikkieLink, setTikkieLink] = useState("");
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPlates, setTotalPlates] = useState(0);
  const [platePrintStatuses, setPlatePrintStatuses] = useState<boolean[]>([]);
  const [platePrintQuantities, setPlatePrintQuantities] = useState<number[]>([]);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("none");
  const [trackingCode, setTrackingCode] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [originalFinalPrice, setOriginalFinalPrice] = useState<number | null>(null);
  const [filamentWeightG, setFilamentWeightG] = useState("");
  const [filamentPricePerKg, setFilamentPricePerKg] = useState("");
  const [filamentMarginPct, setFilamentMarginPct] = useState("50");

  const fetchAppointments = useCallback(async () => {
    if (!orderId) return;
    const { data, error } = await supabase.from("delivery_appointments").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Bezorgafspraken laden mislukt", description: error.message, variant: "destructive" });
      return;
    }
    setAppointments((data as Appointment[]) || []);
  }, [orderId, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin || !orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      const { data: orderData, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (orderError) {
        toast({ title: "Bestelling laden mislukt", description: orderError.message, variant: "destructive" });
      }
      if (orderData) {
        const o = orderData as unknown as Order;
        setOrder(o);
        setFinalPrice(o.final_price?.toString() || "");
        setTikkieLink(o.tikkie_link || "");
        setStatus(o.status);
        setCustomerNotes(o.customer_visible_notes || "");
        setInternalNotes(o.internal_notes || "");
        const legacyPlateCount = o.parts_per_plate > 0 && o.parts_total > 0
          ? Math.ceil(o.parts_total / o.parts_per_plate)
          : Math.max(0, o.plates_completed || 0);
        const loadedTotalPlates = Math.max(0, o.total_plates ?? legacyPlateCount);
        const storedPlateStatuses = Array.isArray(o.plate_print_statuses)
          ? o.plate_print_statuses.map((printed) => printed === true)
          : [];
        const storedPlateQuantities = Array.isArray(o.plate_runs_required_per_plate)
          ? o.plate_runs_required_per_plate
          : [];
        setTotalProducts(Math.max(0, o.total_products ?? o.parts_total ?? o.quantity ?? 0));
        setTotalPlates(loadedTotalPlates);
        setPlatePrintStatuses(Array.from(
          { length: loadedTotalPlates },
          (_, index) => storedPlateStatuses[index] ?? index < (o.plates_completed || 0),
        ));
        setPlatePrintQuantities(Array.from(
          { length: loadedTotalPlates },
          (_, index) => {
            const quantity = Number(storedPlateQuantities[index]);
            return Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
          },
        ));
        setDeliveryEmail(o.delivery_email || "");
        setShippingCarrier(o.shipping_carrier || "none");
        setTrackingCode(o.tracking_code || "");
        setShippingCost(o.shipping_cost?.toString() || "");
        setOriginalFinalPrice(o.final_price);
        setUploadRequestNote(o.customer_upload_request_note || "");
        setFilamentWeightG((o.filament_weight_g ?? "").toString());
        setFilamentPricePerKg((o.filament_price_per_kg ?? "").toString());
      }
      const { data: filesData, error: filesError } = await supabase.from("order_files").select("*").eq("order_id", orderId);
      if (filesError) toast({ title: "Bestanden laden mislukt", description: filesError.message, variant: "destructive" });
      setFiles((filesData as OrderFile[]) || []);
      setLoading(false);
    };
    void load();
    void fetchAppointments();
  }, [authLoading, fetchAppointments, isAdmin, orderId, toast]);

  if (authLoading) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-accent" /></main><Footer /></div>);
  }
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
        delivery_email: deliveryEmail,
        shipping_carrier: shippingCarrier === "none" ? null : shippingCarrier,
        tracking_code: trackingCode,
        shipping_cost: shippingCost ? parseFloat(shippingCost) : 0,
        filament_weight_g: filamentWeightG ? parseFloat(filamentWeightG) : null,
        filament_price_per_kg: filamentPricePerKg ? parseFloat(filamentPricePerKg) : null,
        saved: false,
      }).eq("id", order.id).select("id").single();
      if (error) throw error;

      await supabase.from("order_events").insert({
        order_id: order.id, event_type: "admin_update",
        event_description: priceChanged
          ? `Definitieve prijs ingesteld op €${newFinalPrice!.toFixed(2)}. Status: Wacht op goedkeuring klant.`
          : `Bestelling bijgewerkt door admin. Status: ${ORDER_STATUSES[effectiveStatus].label}`,
        visible_to_customer: true,
      });

      toast({
        title: "Bestelling opgeslagen",
        description: "De wijzigingen zijn opgeslagen. Er is geen e-mail verzonden.",
      });
      setOriginalFinalPrice(newFinalPrice);
      setStatus(effectiveStatus);
      setOrder({ ...order, final_price: newFinalPrice, tikkie_link: tikkieLink || null, status: effectiveStatus, customer_visible_notes: customerNotes, internal_notes: internalNotes, delivery_email: deliveryEmail, shipping_carrier: shippingCarrier, tracking_code: trackingCode, shipping_cost: parseFloat(shippingCost) || 0 });
    } catch (error: unknown) {
      toast({ title: "Fout bij opslaan", description: getErrorMessage(error), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const savePlateProgress = async (data: {
    totalProducts: number;
    totalPlates: number;
    platePrintStatuses: boolean[];
    platePrintQuantities: number[];
    platesCompleted: number;
  }) => {
    if (!order) return;
    try {
      const { error } = await supabase.from("orders").update({
        total_products: data.totalProducts,
        total_plates: data.totalPlates,
        plate_print_statuses: data.platePrintStatuses,
        plate_runs_required_per_plate: data.platePrintQuantities,
        // Retain the legacy completed count for older exports only. New logic
        // never derives plates or products from the legacy per-plate fields.
        plates_completed: data.platesCompleted,
      }).eq("id", order.id).select("id").single();
      if (error) throw error;

      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "production_progress",
        event_description: `Printstatus opgeslagen: ${data.platesCompleted}/${data.totalPlates} platen geprint, ${data.platePrintQuantities.reduce((sum, quantity) => sum + quantity, 0)} printruns nodig (${data.totalProducts} producten totaal).`,
        visible_to_customer: true,
      });

      setTotalProducts(data.totalProducts);
      setTotalPlates(data.totalPlates);
      setPlatePrintStatuses(data.platePrintStatuses);
      setPlatePrintQuantities(data.platePrintQuantities);
      setOrder({
        ...order,
        total_products: data.totalProducts,
        total_plates: data.totalPlates,
        plate_print_statuses: data.platePrintStatuses,
        plate_runs_required_per_plate: data.platePrintQuantities,
        plates_completed: data.platesCompleted,
      });

      toast({ title: "Printstatus opgeslagen", description: "De plaatstatussen zijn opgeslagen. Er is geen e-mail verzonden." });
    } catch (error: unknown) {
      toast({ title: "Opslaan mislukt", description: getErrorMessage(error), variant: "destructive" });
      throw error;
    }
  };
  const handleNotifyCustomer = async () => {
    if (!order) return;
    setNotifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-order-email", {
        body: { type: "order_updated", orderId: order.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Onbekende e-mailfout");
      toast({ title: "Klant is op de hoogte gebracht!" });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Probeer het later opnieuw.";
      toast({ title: "E-mail verzenden mislukt", description, variant: "destructive" });
    }
    finally { setNotifying(false); }
  };

  const handleResetBackup = async () => {
    if (!order) return;
    setResettingBackup(true);
    try {
      const { error } = await supabase.from("orders").update({ saved: false }).eq("id", order.id).select("id").single();
      if (error) throw error;
      toast({ title: "Backupstatus gereset" });
    } catch (error: unknown) {
      toast({ title: "Resetten mislukt", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setResettingBackup(false);
    }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage.from("orders").download(storagePath);
    if (error) { toast({ title: "Download mislukt", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteFile = async (fileId: string, storagePath: string) => {
    try {
      const { error: rowError } = await supabase.from("order_files").delete().eq("id", fileId).select("id").single();
      if (rowError) throw rowError;
      setFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId));
      const { error: storageError } = await supabase.storage.from("orders").remove([storagePath]);
      if (storageError) {
        toast({ title: "Bestand verwijderd", description: "De database is bijgewerkt, maar het opslagbestand kon niet worden opgeschoond.", variant: "destructive" });
        return;
      }
      toast({ title: "Bestand verwijderd" });
    } catch (error: unknown) { toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" }); }
  };

  const handleCompleteOrder = async () => {
    if (!order) return;
    setCompleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-order", { body: { order_id: order.id } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Bestelling voltooien mislukt");
      toast({ title: "Bestelling voltooid! ✅" });
      setOrder({ ...order, status: "completed" as OrderStatus });
      setStatus("completed" as OrderStatus);
    } catch (error: unknown) { toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" }); }
    finally { setCompleting(false); }
  };




  const handleGenerateInvoice = async () => {
    if (!order) return;
    setGeneratingInvoice(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { orderId: order.id, description: invoiceDesc, bankAccount: invoiceBank, kvkNumber: invoiceKvk, btwId: invoiceBtw },
      });
      if (error) throw error;
      // Open HTML in new window for printing/saving as PDF
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(data.html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
      toast({ title: `Factuur ${data.invoiceNumber} gegenereerd ✅` });
      setShowInvoice(false);
    } catch (error: unknown) {
      toast({ title: "Fout bij genereren factuur", description: getErrorMessage(error), variant: "destructive" });
    } finally { setGeneratingInvoice(false); }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    setDeleting(true);
    try {
      if (files.length > 0) {
        const { error: storageError } = await supabase.storage.from("orders").remove(files.map((file) => file.storage_path));
        if (storageError) throw storageError;
      }
      // Related database rows use ON DELETE CASCADE.
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;
      toast({ title: "Bestelling verwijderd" });
      navigate("/admin");
    } catch (error: unknown) { toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" }); }
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

            <CatalogOrderItems items={order.catalog_items} />

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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-primary">Bestanden ({files.length})</h3>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent text-accent-foreground rounded-md text-sm cursor-pointer hover:opacity-90">
                    {uploadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload bestand(en)
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={uploadingFiles}
                      onChange={async (e) => {
                        const filesIn = Array.from(e.target.files || []);
                        if (!filesIn.length) return;
                        setUploadingFiles(true);
                        try {
                          for (const f of filesIn) {
                            const safeName = f.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
                            const path = `${order.order_number}/files/admin-${crypto.randomUUID()}-${safeName}`;
                            const uploaded = await uploadFileWithHeicConversion("orders", path, f, { upsert: false });
                            const { error: upErr } = uploaded;
                            if (upErr) throw upErr;
                            const { data: row, error: insErr } = await supabase.from("order_files").insert({
                              order_id: order.id,
                              storage_path: uploaded.path,
                              original_filename: uploaded.file.name,
                              file_size: uploaded.file.size,
                              mime_type: uploaded.file.type || "application/octet-stream",
                            }).select().single();
                            if (insErr) {
                              await supabase.storage.from("orders").remove([uploaded.path]);
                              throw insErr;
                            }
                            setFiles((prev) => [...prev, row as OrderFile]);
                          }
                          toast({ title: `${filesIn.length} bestand(en) geüpload ✅` });
                        } catch (error: unknown) {
                          toast({ title: "Upload mislukt", description: getErrorMessage(error), variant: "destructive" });
                        } finally {
                          setUploadingFiles(false);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Customer upload request */}
              <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                {order.customer_upload_requested ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm">
                      <p className="font-medium text-primary flex items-center gap-2"><MailQuestion className="w-4 h-4" /> Upload-verzoek actief</p>
                      {order.customer_upload_request_note && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{order.customer_upload_request_note}</p>
                      )}
                    </div>
                    <Button
                      size="sm" variant="outline"
                      disabled={savingUploadRequest}
                      onClick={async () => {
                        setSavingUploadRequest(true);
                        try {
                          const { error } = await supabase.from("orders").update({
                            customer_upload_requested: false,
                            customer_upload_request_note: null,
                            customer_upload_requested_at: null,
                          }).eq("id", order.id);
                          if (error) throw error;
                          setOrder({ ...order, customer_upload_requested: false, customer_upload_request_note: null });
                          toast({ title: "Verzoek geannuleerd" });
                        } catch (error: unknown) {
                          toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" });
                        } finally { setSavingUploadRequest(false); }
                      }}
                    >
                      <XCircle className="w-4 h-4" /> Verzoek annuleren
                    </Button>
                  </div>
                ) : showRequestUpload ? (
                  <div className="space-y-2">
                    <Label className="text-sm">Notitie aan klant (optioneel)</Label>
                    <Textarea value={uploadRequestNote} onChange={(e) => setUploadRequestNote(e.target.value)} rows={2} placeholder="Bijv. 'Upload aub uw STL-bestand zodat we kunnen starten.'" />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={savingUploadRequest}
                        onClick={async () => {
                          setSavingUploadRequest(true);
                          try {
                            const { error } = await supabase.from("orders").update({
                              customer_upload_requested: true,
                              customer_upload_request_note: uploadRequestNote || null,
                              customer_upload_requested_at: new Date().toISOString(),
                            }).eq("id", order.id);
                            if (error) throw error;
                            setOrder({ ...order, customer_upload_requested: true, customer_upload_request_note: uploadRequestNote || null });
                            setShowRequestUpload(false);
                            const { data: mailData, error: mailError } = await supabase.functions.invoke("send-order-email", {
                              body: { type: "customer_upload_request", orderId: order.id, note: uploadRequestNote },
                            });
                            if (mailError) throw mailError;
                            if (!mailData?.success) throw new Error(mailData?.error || "Upload-verzoekmail verzenden mislukt");
                            toast({ title: "Verzoek verstuurd ✅" });
                          } catch (error: unknown) {
                            toast({ title: "Fout", description: getErrorMessage(error), variant: "destructive" });
                          } finally { setSavingUploadRequest(false); }
                        }}
                      >
                        {savingUploadRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Versturen
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowRequestUpload(false)}>Annuleren</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setShowRequestUpload(true)}>
                    <MailQuestion className="w-4 h-4" /> Vraag klant om bestanden te uploaden
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                        <span className="text-sm truncate">{file.original_filename}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">({(file.file_size / 1024 / 1024).toFixed(1)} MB)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/\.(stl|obj)$/i.test(file.original_filename) && (
                          <Button variant="ghost" size="sm" onClick={() => setPreviewFileId(previewFileId === file.id ? null : file.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => downloadFile(file.storage_path, file.original_filename)}><Download className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setFilePendingDelete(file)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    {previewFileId === file.id && (
                      <div className="mt-3">
                        <ModelViewer storagePath={file.storage_path} filename={file.original_filename} height={260} />
                      </div>
                    )}
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
                  {order.applied_discount_code && <p className="text-xs text-muted-foreground mt-1">Toegepaste kortingscode: <span className="font-mono font-semibold">{order.applied_discount_code}</span></p>}
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
                    totalProducts={totalProducts}
                    totalPlates={totalPlates}
                    platePrintStatuses={platePrintStatuses}
                    platePrintQuantities={platePrintQuantities}
                    onUpdate={savePlateProgress}
                  />
                </div>

                {/* Delivery email for admin orders */}
                {isAdminOrder && (
                  <div className="md:col-span-2">
                    <Label>Bezorg e-mail (voor melding wanneer klaar)</Label>
                    <Input type="email" value={deliveryEmail} onChange={(e) => setDeliveryEmail(e.target.value)} placeholder="klant@email.nl" />
                  </div>
                )}

                {/* Filament calculator (admin-only, niet zichtbaar voor klant) */}
                <div className="md:col-span-2 border-t border-border pt-4">
                  <h4 className="font-semibold text-primary mb-1 flex items-center gap-2">🧮 Filament prijsberekening</h4>
                  <p className="text-xs text-muted-foreground mb-3">Intern — niet zichtbaar voor de klant. Hulpmiddel om een prijs te bepalen.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Gewicht (gram)</Label>
                      <Input type="number" step="0.1" value={filamentWeightG} onChange={(e) => setFilamentWeightG(e.target.value)} placeholder="bijv. 120" />
                    </div>
                    <div>
                      <Label>Prijs filament (€/kg)</Label>
                      <Input type="number" step="0.01" value={filamentPricePerKg} onChange={(e) => setFilamentPricePerKg(e.target.value)} placeholder="bijv. 22.50" />
                    </div>
                    <div>
                      <Label>Marge (%)</Label>
                      <Input type="number" step="1" value={filamentMarginPct} onChange={(e) => setFilamentMarginPct(e.target.value)} placeholder="bijv. 50" />
                    </div>
                    <div className="md:col-span-3">
                      {filamentWeightG && filamentPricePerKg ? (
                        (() => {
                          const cost = (parseFloat(filamentWeightG) / 1000) * parseFloat(filamentPricePerKg);
                          const margin = parseFloat(filamentMarginPct || "0") || 0;
                          const withMargin = cost * (1 + margin / 100);
                          return (
                            <div className="w-full p-3 rounded-md bg-muted text-sm space-y-1">
                              <div>💰 Filamentkosten: <strong>€{cost.toFixed(2)}</strong></div>
                              <div>🏷️ Verkoopprijs incl. {margin}% marge: <strong>€{withMargin.toFixed(2)}</strong></div>
                            </div>
                          );
                        })()
                      ) : (
                        <p className="text-xs text-muted-foreground">Vul gewicht en prijs in voor berekening.</p>
                      )}
                    </div>
                  </div>
                </div>

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
                  <Button onClick={() => setShowCompleteConfirmation(true)} disabled={completing} className="bg-green-600 hover:bg-green-700 text-white">
                    {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Voltooi bestelling
                  </Button>
                )}
                <Button variant="outline" onClick={handleResetBackup} disabled={resettingBackup}>
                  {resettingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : "🔄"} Reset backup
                </Button>
                <Button variant="outline" onClick={() => setShowInvoice(true)}>
                  <Receipt className="w-4 h-4" /> Factuur
                </Button>
                <div className="sm:ml-auto">
                  <Button variant="destructive" onClick={() => setShowDeleteConfirmation(true)} disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Verwijderen
                  </Button>
                </div>
              </div>

              {/* Invoice Modal */}
              {showInvoice && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInvoice(false)}>
                  <div className="bg-card rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2"><Receipt className="w-5 h-5" /> Factuur genereren</h3>
                    <div className="space-y-3">
                      <div>
                        <Label>Omschrijving</Label>
                        <Textarea value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)} placeholder={`3D Print bestelling ${order.order_number}`} rows={2} />
                      </div>
                      <div>
                        <Label>IBAN rekeningnummer</Label>
                        <Input value={invoiceBank} onChange={e => setInvoiceBank(e.target.value)} placeholder="NL00 BANK 0000 0000 00" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>KVK-nummer</Label>
                          <Input value={invoiceKvk} onChange={e => setInvoiceKvk(e.target.value)} placeholder="12345678" />
                        </div>
                        <div>
                          <Label>BTW-ID</Label>
                          <Input value={invoiceBtw} onChange={e => setInvoiceBtw(e.target.value)} placeholder="NL000000000B01" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-6">
                      <Button onClick={handleGenerateInvoice} disabled={generatingInvoice}>
                        {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Genereren & Printen
                      </Button>
                      <Button variant="ghost" onClick={() => setShowInvoice(false)}>Annuleren</Button>
                    </div>
                  </div>
                </div>
              )}
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
                <p className="text-sm text-muted-foreground mb-3">
                  📎 Klant order link:{" "}
                  <a href={`${window.location.origin}/order/${order.customer_order_token}`} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
                    {window.location.origin}/order/{order.customer_order_token}
                  </a>
                </p>
                {order.link_first_viewed_at ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm border-t border-border pt-3">
                    <div>
                      <span className="block text-xs text-muted-foreground">Eerste bezoek</span>
                      <span className="font-medium">{new Date(order.link_first_viewed_at).toLocaleString("nl-NL")}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Meest recente bezoek</span>
                      <span className="font-medium">{new Date(order.link_last_viewed_at || order.link_first_viewed_at).toLocaleString("nl-NL")}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-muted-foreground">Aantal bezoeken</span>
                      <span className="font-medium">{order.link_view_count}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground border-t border-border pt-3">De klant heeft deze link nog niet bezocht.</p>
                )}
              </div>
            )}

            <ConfirmActionDialog
              open={filePendingDelete !== null}
              onOpenChange={(open) => { if (!open) setFilePendingDelete(null); }}
              title="Bestand verwijderen?"
              description={`Weet u zeker dat u ${filePendingDelete?.original_filename || "dit bestand"} permanent wilt verwijderen?`}
              confirmLabel="Bestand verwijderen"
              destructive
              onConfirm={async () => {
                if (filePendingDelete) await deleteFile(filePendingDelete.id, filePendingDelete.storage_path);
              }}
            />
            <ConfirmActionDialog
              open={showCompleteConfirmation}
              onOpenChange={setShowCompleteConfirmation}
              title="Bestelling voltooien?"
              description={`Bestelling ${order.order_number} wordt als voltooid gemarkeerd.`}
              confirmLabel="Voltooien"
              onConfirm={handleCompleteOrder}
            />
            <ConfirmActionDialog
              open={showDeleteConfirmation}
              onOpenChange={setShowDeleteConfirmation}
              title="Bestelling permanent verwijderen?"
              description={`Bestelling ${order.order_number} en alle gekoppelde gegevens worden verwijderd. Dit kan niet ongedaan worden gemaakt.`}
              confirmLabel="Bestelling verwijderen"
              destructive
              onConfirm={handleDeleteOrder}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
