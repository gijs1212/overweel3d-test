import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ArrowLeft, FileText, Download, Send, Trash2, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_STATUSES, OrderStatus } from "@/lib/constants";

interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_email: string;
  customer_name: string;
  phone: string;
  company_name: string;
  billing_address: string;
  shipping_address: string;
  postal_code: string;
  city: string;
  country: string;
  vat_number: string;
  material: string;
  color: string;
  quantity: number;
  notes: string;
  print_preferences: string;
  instant_quote_price: number;
  final_price: number | null;
  tikkie_link: string | null;
  status: OrderStatus;
  customer_order_token: string;
  customer_visible_notes: string;
  internal_notes: string;
  submitted_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderFile {
  id: string;
  storage_path: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
}

export default function AdminOrderEdit() {
  const { orderId } = useParams<{ orderId: string }>();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Editable fields
  const [finalPrice, setFinalPrice] = useState("");
  const [tikkieLink, setTikkieLink] = useState("");
  const [status, setStatus] = useState<OrderStatus>("submitted");
  const [customerNotes, setCustomerNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    if (!orderId) return;
    const fetch = async () => {
      const { data: orderData } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (orderData) {
        const o = orderData as Order;
        setOrder(o);
        setFinalPrice(o.final_price?.toString() || "");
        setTikkieLink(o.tikkie_link || "");
        setStatus(o.status);
        setCustomerNotes(o.customer_visible_notes || "");
        setInternalNotes(o.internal_notes || "");
      }
      const { data: filesData } = await supabase.from("order_files").select("*").eq("order_id", orderId);
      setFiles((filesData as OrderFile[]) || []);
      setLoading(false);
    };
    fetch();
  }, [orderId]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Geen toegang.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          final_price: finalPrice ? parseFloat(finalPrice) : null,
          tikkie_link: tikkieLink || null,
          status,
          customer_visible_notes: customerNotes,
          internal_notes: internalNotes,
        })
        .eq("id", order.id);

      if (error) throw error;

      // Log event
      await supabase.from("order_events").insert({
        order_id: order.id,
        event_type: "admin_update",
        event_description: `Bestelling bijgewerkt door admin. Status: ${ORDER_STATUSES[status].label}`,
        visible_to_customer: true,
      });

      toast({ title: "Bestelling opgeslagen!" });
      setOrder({ ...order, final_price: finalPrice ? parseFloat(finalPrice) : null, tikkie_link: tikkieLink || null, status, customer_visible_notes: customerNotes, internal_notes: internalNotes });
    } catch (error: any) {
      toast({ title: "Fout bij opslaan", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyCustomer = async () => {
    if (!order) return;
    setNotifying(true);
    try {
      await supabase.functions.invoke("send-order-email", {
        body: { type: "order_updated", orderId: order.id },
      });
      toast({ title: "Klant is op de hoogte gebracht!" });
    } catch (error) {
      toast({ title: "E-mail verzenden mislukt", variant: "destructive" });
    } finally {
      setNotifying(false);
    }
  };

  const downloadFile = async (storagePath: string, filename: string) => {
    const { data, error } = await supabase.storage.from("orders").download(storagePath);
    if (error) {
      toast({ title: "Download mislukt", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteFile = async (fileId: string, storagePath: string) => {
    if (!confirm("Weet u zeker dat u dit bestand wilt verwijderen? De klant ziet dan een melding dat het bestand is verplaatst.")) return;
    try {
      await supabase.storage.from("orders").remove([storagePath]);
      await supabase.from("order_files").delete().eq("id", fileId);
      setFiles(files.filter((f) => f.id !== fileId));
      toast({ title: "Bestand verwijderd" });
    } catch (error: any) {
      toast({ title: "Fout bij verwijderen", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    if (!confirm(`Weet u zeker dat u bestelling ${order.order_number} volledig wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setDeleting(true);
    try {
      // 1. Delete storage files
      if (files.length > 0) {
        const paths = files.map((f) => f.storage_path);
        await supabase.storage.from("orders").remove(paths);
      }
      // 2. Delete order_files records
      await supabase.from("order_files").delete().eq("order_id", order.id);
      // 3. Delete order_events records
      await supabase.from("order_events").delete().eq("order_id", order.id);
      // 4. Delete the order itself
      const { error } = await supabase.from("orders").delete().eq("id", order.id);
      if (error) throw error;

      toast({ title: "Bestelling verwijderd" });
      navigate("/admin");
    } catch (error: any) {
      toast({ title: "Fout bij verwijderen", description: error.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
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

  if (!order) return null;

  const statusInfo = ORDER_STATUSES[order.status];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-4 h-4" /> Terug
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-primary">{order.order_number}</h1>
              <p className="text-sm text-muted-foreground">{order.customer_name} · {order.customer_email}</p>
            </div>
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer Info */}
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

            {/* Order details */}
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Besteldetails</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Materiaal</span><span>{order.material}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kleur</span><span>{order.color}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Aantal</span><span>{order.quantity}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Indicatieprijs</span><span>€{Number(order.instant_quote_price || 0).toFixed(2)}</span></div>
                {order.notes && <div className="pt-2 border-t border-border"><p className="text-muted-foreground text-xs mb-1">Opmerkingen klant:</p><p>{order.notes}</p></div>}
                {order.print_preferences && <div><p className="text-muted-foreground text-xs mb-1">Print voorkeuren:</p><p>{order.print_preferences}</p></div>}
              </div>
            </div>

            {/* Files */}
            <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
              <h3 className="font-bold text-primary mb-4">Bestanden ({files.length})</h3>
              <div className="space-y-2">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-accent" />
                      <div>
                        <span className="text-sm">{file.original_filename}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({(file.file_size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => downloadFile(file.storage_path, file.original_filename)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteFile(file.id, file.storage_path)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
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
                </div>
                <div>
                  <Label>Definitieve prijs (€)</Label>
                  <Input type="number" step="0.01" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder="0.00" />
                </div>
                <div className="md:col-span-2">
                  <Label>Tikkie betaallink</Label>
                  <Input value={tikkieLink} onChange={(e) => setTikkieLink(e.target.value)} placeholder="https://tikkie.me/..." />
                </div>
                <div className="md:col-span-2">
                  <Label>Notities voor klant (zichtbaar)</Label>
                  <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} placeholder="Deze notitie is zichtbaar voor de klant." />
                </div>
                <div className="md:col-span-2">
                  <Label>Interne notities (niet zichtbaar voor klant)</Label>
                  <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} placeholder="Alleen zichtbaar voor admin." />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Opslaan
                </Button>
                <Button variant="outline" onClick={handleNotifyCustomer} disabled={notifying}>
                  {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Klant op de hoogte brengen
                </Button>
                <div className="sm:ml-auto">
                  <Button variant="destructive" onClick={handleDeleteOrder} disabled={deleting}>
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Bestelling verwijderen
                  </Button>
                </div>
              </div>
            </div>

            {/* Order link */}
            <div className="lg:col-span-2 bg-muted/50 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                📎 Klant order link:{" "}
                <a
                  href={`${window.location.origin}/order/${order.customer_order_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline break-all"
                >
                  {window.location.origin}/order/{order.customer_order_token}
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
