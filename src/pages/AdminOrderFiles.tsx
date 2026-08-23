import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, File, Loader2, Package, Search, Upload, X } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";

interface OrderOption {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  submitted_at: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeFilename(filename: string) {
  return filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bestand";
}

export default function AdminOrderFiles() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orderId, setOrderId] = useState(searchParams.get("order") || "");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const loadOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,order_number,customer_name,customer_email,status,submitted_at")
        .order("submitted_at", { ascending: false });

      if (error) {
        toast({ title: "Bestellingen laden mislukt", description: error.message, variant: "destructive" });
      } else {
        const loaded = (data || []) as OrderOption[];
        setOrders(loaded);
        const requestedOrder = searchParams.get("order");
        if (requestedOrder && loaded.some((order) => order.id === requestedOrder)) setOrderId(requestedOrder);
      }
      setLoading(false);
    };

    void loadOrders();
  }, [authLoading, isAdmin, searchParams, toast]);

  const matchingOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((order) =>
      [order.order_number, order.customer_name, order.customer_email].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [orders, search]);

  const selectedOrder = orders.find((order) => order.id === orderId);

  const addFiles = (incoming: File[]) => {
    const tooLarge = incoming.filter((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge.length) {
      toast({
        title: "Bestand te groot",
        description: `${tooLarge.map((file) => file.name).join(", ")} is groter dan 100 MB.`,
        variant: "destructive",
      });
    }
    const allowed = incoming.filter((file) => file.size <= MAX_FILE_SIZE);
    setSelectedFiles((current) => {
      const known = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...allowed.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  };

  const uploadFiles = async () => {
    if (!selectedOrder || !selectedFiles.length) return;
    setUploading(true);
    let uploadedCount = 0;

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const sourceFile = selectedFiles[index];
        setUploadProgress(`${index + 1} van ${selectedFiles.length}: ${sourceFile.name}`);
        const path = `${selectedOrder.order_number}/files/admin-${crypto.randomUUID()}-${safeFilename(sourceFile.name)}`;
        const uploaded = await uploadFileWithHeicConversion("orders", path, sourceFile, { upsert: false });
        if (uploaded.error) throw uploaded.error;

        const { error: rowError } = await supabase.from("order_files").insert({
          order_id: selectedOrder.id,
          storage_path: uploaded.path,
          original_filename: uploaded.file.name,
          file_size: uploaded.file.size,
          mime_type: uploaded.file.type || "application/octet-stream",
        });

        if (rowError) {
          await supabase.storage.from("orders").remove([uploaded.path]);
          throw rowError;
        }
        uploadedCount += 1;
      }

      toast({
        title: `${uploadedCount} bestand${uploadedCount === 1 ? "" : "en"} toegevoegd`,
        description: `De bestanden staan nu bij ${selectedOrder.order_number} en zijn zichtbaar in de bestelling.`,
      });
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende uploadfout";
      toast({
        title: "Upload niet volledig voltooid",
        description: `${uploadedCount} bestand${uploadedCount === 1 ? "" : "en"} geüpload. ${message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  };

  if (authLoading || loading) {
    return <div className="min-h-screen bg-neutral-100"><Navbar /><main className="flex min-h-[65vh] items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin" /></main><Footer /></div>;
  }

  if (!isAdmin) {
    return <div className="min-h-screen"><Navbar /><main className="flex min-h-[65vh] items-center justify-center pt-20"><div className="text-center"><h1 className="text-2xl font-bold">Geen toegang</h1><p className="mt-2 text-muted-foreground">Je hebt geen adminrechten.</p></div></main><Footer /></div>;
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <Navbar />
      <main className="min-h-screen pb-20 pt-20">
        <div className="container mx-auto max-w-5xl px-4 py-8 lg:py-10">
          <Link to="/admin" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" /> Terug naar dashboard</Link>
          <header className="mb-6 overflow-hidden rounded-2xl bg-black px-6 py-8 text-white md:px-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">Bestellingen & klanten</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Bestanden uploaden</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Koppel modellen, 3MF-bestanden, foto’s en andere documenten direct aan een bestaande bestelling.</p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-black/10 bg-white p-5 md:p-7">
              <div className="mb-6">
                <Label htmlFor="order-search">Zoek een bestelling</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                  <Input id="order-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bestelnummer, klant of e-mailadres" className="pl-10" />
                </div>
              </div>

              <div className="mb-6">
                <Label>Kies de bestelling</Label>
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Selecteer een bestelling" /></SelectTrigger>
                  <SelectContent>
                    {matchingOrders.map((order) => <SelectItem key={order.id} value={order.id}>{order.order_number} — {order.customer_name || order.customer_email}</SelectItem>)}
                  </SelectContent>
                </Select>
                {search && matchingOrders.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Geen bestellingen gevonden.</p>}
              </div>

              <div
                className="rounded-2xl border-2 border-dashed border-black/15 bg-neutral-50 p-8 text-center transition-colors hover:border-black/35"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }}
              >
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-black text-white"><Upload className="h-5 w-5" /></div>
                <h2 className="font-semibold">Sleep bestanden hierheen</h2>
                <p className="mt-1 text-sm text-muted-foreground">Of kies meerdere bestanden tegelijk. Maximaal 100 MB per bestand.</p>
                <Button type="button" variant="outline" className="mt-5" onClick={() => fileInputRef.current?.click()} disabled={uploading}>Bestanden kiezen</Button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => addFiles(Array.from(event.target.files || []))} />
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-6 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3">
                      <File className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{readableSize(file.size)}</p></div>
                      <Button type="button" variant="ghost" size="icon" disabled={uploading} onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`${file.name} verwijderen`}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}

              <Button className="mt-6 w-full" size="lg" disabled={!selectedOrder || selectedFiles.length === 0 || uploading} onClick={uploadFiles}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? uploadProgress : `${selectedFiles.length || ""} bestand${selectedFiles.length === 1 ? "" : "en"} uploaden`}
              </Button>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-black/10 bg-white p-5">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white"><Package className="h-4 w-4" /></div>
                <h2 className="font-semibold">Gekozen bestelling</h2>
                {selectedOrder ? <div className="mt-3 text-sm"><p className="font-bold">{selectedOrder.order_number}</p><p className="mt-1">{selectedOrder.customer_name || "Naam onbekend"}</p><p className="break-all text-muted-foreground">{selectedOrder.customer_email}</p><p className="mt-3 inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold">{selectedOrder.status}</p></div> : <p className="mt-2 text-sm text-muted-foreground">Selecteer eerst een bestelling.</p>}
              </section>
              <section className="rounded-2xl bg-black p-5 text-white">
                <CheckCircle2 className="mb-4 h-5 w-5" />
                <h2 className="font-semibold">Direct gekoppeld</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">Na het uploaden staat het bestand meteen in de adminbestelling en in de bestelling van de gekoppelde klant.</p>
                {selectedOrder && <Link to={`/admin/order/${selectedOrder.id}`}><Button variant="outline" className="mt-4 w-full border-white/20 bg-transparent text-white hover:bg-white hover:text-black">Bestelling bekijken</Button></Link>}
              </section>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
