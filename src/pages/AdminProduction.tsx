import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Cpu, Download, FileArchive, KeyRound, Loader2, Plus, Printer, RefreshCw, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Footer } from "@/components/Footer";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { ModelViewer } from "@/components/ModelViewer";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { disposeThreeMfInspection, inspectThreeMf, printFileMatch, type ThreeMfInspection } from "@/lib/threeMfInspector";
import { findPlateRequestPrinter, isVisiblePlateRequest } from "@/lib/plateRequests";

type PrinterRow = Database["public"]["Tables"]["printers"]["Row"];
type JobRow = Database["public"]["Tables"]["print_jobs"]["Row"];
type SlotRow = Database["public"]["Tables"]["printer_ams_slots"]["Row"];
type OrderChoice = Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "order_number" | "customer_name" | "total_plates" | "plate_runs_required_per_plate">;

const livePrinterStatus = (printer: PrinterRow) => {
  if (printer.status === "maintenance") return "maintenance";
  if (!printer.last_seen_at || Date.now() - new Date(printer.last_seen_at).getTime() > 60_000) return "offline";
  return printer.status;
};

export default function AdminProduction() {
  const { isAdmin, loading: authLoading } = useAuth(); const { toast } = useToast(); const navigate = useNavigate();
  const [printers, setPrinters] = useState<PrinterRow[]>([]); const [jobs, setJobs] = useState<JobRow[]>([]); const [slots, setSlots] = useState<SlotRow[]>([]); const [orders, setOrders] = useState<OrderChoice[]>([]); const [loading, setLoading] = useState(true);
  const [printerForm, setPrinterForm] = useState({ name: "P1S", serial: "", account: "", connectionMode: "bambu_connect" }); const [bridgeConfig, setBridgeConfig] = useState("");
  const [deletePrinter, setDeletePrinter] = useState<PrinterRow | null>(null);
  const [approveJob, setApproveJob] = useState<JobRow | null>(null);
  const [manualPlateNumbers, setManualPlateNumbers] = useState<Record<string, string>>({});
  const [jobForm, setJobForm] = useState({ orderId: "", printerId: "", plate: 1, runs: 1, expectedFile: "", duration: "", grams: "", scheduledAt: "" });
  const [threeMf, setThreeMf] = useState<File | null>(null); const [inspection, setInspection] = useState<ThreeMfInspection | null>(null); const [inspecting, setInspecting] = useState(false); const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [printerResult, jobResult, slotResult, orderResult] = await Promise.all([
      supabase.from("printers").select("*").order("name"),
      supabase.from("print_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("printer_ams_slots").select("*").order("ams_unit").order("slot_number"),
      supabase.from("orders").select("id,order_number,customer_name,total_plates,plate_runs_required_per_plate").not("status", "in", "(completed,cancelled)").order("submitted_at", { ascending: false }),
    ]);
    const error = printerResult.error || jobResult.error || slotResult.error || orderResult.error;
    if (error) toast({ title: "Productiegegevens laden mislukt", description: error.message, variant: "destructive" });
    setPrinters(printerResult.data || []); setJobs(jobResult.data || []); setSlots(slotResult.data || []); setOrders(orderResult.data || []); setLoading(false);
  }, [toast]);

  useEffect(() => { if (!authLoading && isAdmin) void load(); else if (!authLoading) setLoading(false); }, [authLoading, isAdmin, load]);
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase.channel("admin-production")
      .on("postgres_changes", { event: "*", schema: "public", table: "printers" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "printer_ams_slots" }, () => void load()).subscribe();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [isAdmin, load]);
  useEffect(() => () => disposeThreeMfInspection(inspection), [inspection]);

  const selectedOrder = orders.find(order => order.id === jobForm.orderId);
  const selectedPrinter = printers.find(printer => printer.id === jobForm.printerId);
  const currentMatch = selectedPrinter && jobForm.expectedFile ? printFileMatch(jobForm.expectedFile, selectedPrinter.current_file || "") : false;
  const suggestions = useMemo(() => jobs.filter((job) => isVisiblePlateRequest(job, orders, printers)).sort((a, b) => String(a.suggested_at || a.created_at).localeCompare(String(b.suggested_at || b.created_at))), [jobs, orders, printers]);
  const approvalPlate = (job: JobRow) => {
    const reportedPlate = findPlateRequestPrinter(job, printers)?.current_plate;
    if (reportedPlate != null) return reportedPlate;
    const manualPlate = Number(manualPlateNumbers[job.id]);
    return Number.isInteger(manualPlate) && manualPlate > 0 ? manualPlate : null;
  };

  const createBridgeToken = async () => {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map(value => value.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    return { token, hash };
  };

  const addPrinter = async () => {
    if (!printerForm.serial.trim() || (printerForm.connectionMode === "bambu_connect" && !printerForm.account.trim())) {
      toast({ title: "Gegevens ontbreken", description: "Vul het serienummer en voor de accountverbinding ook het Bambu-e-mailadres in.", variant: "destructive" });
      return;
    }
    const { token, hash } = await createBridgeToken();
    const { data, error } = await supabase.from("printers").insert({ name: printerForm.name.trim(), device_serial: printerForm.serial.trim(), bridge_token_hash: hash, connection_mode: printerForm.connectionMode }).select("id").single();
    if (error) { toast({ title: "Printer toevoegen mislukt", description: error.message, variant: "destructive" }); return; }
    setBridgeConfig(printerForm.connectionMode === "lan_bridge"
      ? `OVERWEEL_PRINTER_ID=${data.id}\nOVERWEEL_BRIDGE_TOKEN=${token}\nBAMBU_SERIAL=${printerForm.serial.trim()}`
      : `Vervang de vaste waarden bovenaan bambu_cloud_bridge.py:\n\nBAMBU_ACCOUNT = "${printerForm.account.trim()}"\nBAMBU_SERIAL = "${printerForm.serial.trim()}"\nSUPABASE_URL = "${import.meta.env.VITE_SUPABASE_URL}"\nPRINTER_ID = "${data.id}"\nBRIDGE_TOKEN = "${token}"\n\nEr is geen .env-bestand nodig.\nGa naar /mnt/data/supervisor/share/overweel3d.\nBouwen: docker compose build\nEenmalig aanmelden: docker compose run --rm bambu-bridge python /app/bambu_cloud_bridge.py --login-only\nDaarna starten: docker compose up -d`);
    setPrinterForm({ name: "P1S", serial: "", account: "", connectionMode: "bambu_connect" }); void load();
  };

  const renewBridgeToken = async (printer: PrinterRow) => {
    const { token, hash } = await createBridgeToken();
    const { error } = await supabase.from("printers").update({ bridge_token_hash: hash }).eq("id", printer.id);
    if (error) {
      toast({ title: "Nieuw bridge-token maken mislukt", description: error.message, variant: "destructive" });
      return;
    }
    setBridgeConfig(`Vervang bovenaan bambu_cloud_bridge.py:\n\nBRIDGE_TOKEN = "${token}"\n\nBouw en herstart daarna de container:\ndocker compose build --no-cache\ndocker compose up -d --force-recreate`);
    toast({ title: "Nieuw bridge-token gemaakt", description: "Het oude token is direct ongeldig. Kopieer het nieuwe token nu; het wordt maar één keer getoond." });
    void load();
  };

  const inspectFile = async (file: File) => {
    setThreeMf(file); setInspecting(true);
    try { const result = await inspectThreeMf(file); setInspection(result); setJobForm(current => ({ ...current, plate: result.plates[0]?.number || 1, expectedFile: result.plates[0]?.fileName || file.name })); }
    catch (error) { toast({ title: "3MF openen mislukt", description: error instanceof Error ? error.message : "Ongeldig bestand", variant: "destructive" }); setInspection(null); }
    finally { setInspecting(false); }
  };

  const selectPlate = (offset: number) => {
    if (!inspection) return;
    const currentIndex = Math.max(0, inspection.plates.findIndex((plate) => plate.number === jobForm.plate));
    const plate = inspection.plates[(currentIndex + offset + inspection.plates.length) % inspection.plates.length];
    setJobForm((current) => ({ ...current, plate: plate.number, expectedFile: plate.fileName || current.expectedFile }));
  };

  const removePrinter = async () => {
    if (!deletePrinter) return;
    const { error } = await supabase.from("printers").delete().eq("id", deletePrinter.id);
    if (error) toast({ title: "Printer verwijderen mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Printer verwijderd" }); setDeletePrinter(null); void load(); }
  };

  const addJob = async () => {
    if (!selectedOrder || !jobForm.printerId || !jobForm.expectedFile.trim()) return;
    setSaving(true);
    try {
      let storagePath: string | null = null;
      if (threeMf) {
        storagePath = `production/${selectedOrder.order_number}/${crypto.randomUUID()}-${threeMf.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error } = await supabase.storage.from("orders").upload(storagePath, threeMf, { upsert: false }); if (error) throw error;
      }
      const { error } = await supabase.from("print_jobs").insert({
        order_id: selectedOrder.id, printer_id: jobForm.printerId, plate_number: jobForm.plate,
        plate_name: inspection?.plates.find(plate => plate.number === jobForm.plate)?.name || `Plaat ${jobForm.plate}`,
        expected_file_name: jobForm.expectedFile.trim(), three_mf_storage_path: storagePath, three_mf_signature: inspection?.signature || null,
        colors: inspection?.colors || [], estimated_duration_minutes: jobForm.duration ? Number(jobForm.duration) : null,
        estimated_filament_grams: jobForm.grams ? Number(jobForm.grams) : null, runs_required: jobForm.runs,
        scheduled_at: jobForm.scheduledAt || null,
        comparison: { inspectedFile: inspection?.fileName, currentPrinterFile: selectedPrinter?.current_file, match: currentMatch },
      });
      if (error) throw error;
      toast({ title: "Plaatkoppeling opgeslagen" }); setThreeMf(null); setInspection(null); setJobForm({ orderId: "", printerId: "", plate: 1, runs: 1, expectedFile: "", duration: "", grams: "", scheduledAt: "" }); void load();
    } catch (error) { toast({ title: "Printtaak opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const approve = async (job: JobRow) => {
    const printer = findPlateRequestPrinter(job, printers); const match = printFileMatch(job.expected_file_name, printer?.current_file || "");
    if (!["suggested", "approved", "printing", "paused"].includes(job.status)) { toast({ title: "Nog geen koppelvoorstel", description: "Wacht tot de Cloudbridge deze actieve print aan een bestelling en plaat heeft voorgesteld.", variant: "destructive" }); return; }
    if (!match) { toast({ title: "3MF komt niet overeen", description: "De bestandsnaam op de printer wijkt af van de toegewezen plaat.", variant: "destructive" }); return; }
    const selectedPlate = approvalPlate(job);
    const order = orders.find((item) => item.id === job.order_id);
    if (!order) { toast({ title: "Bestelling is niet meer actief", description: "Voltooide of geannuleerde bestellingen worden niet meer aan printerplaten gekoppeld.", variant: "destructive" }); setApproveJob(null); return; }
    if (selectedPlate == null || !Number.isInteger(selectedPlate) || selectedPlate < 1 || selectedPlate > Math.max(1, order?.total_plates || 0)) { toast({ title: "Vul het juiste plaatnummer in", description: `Kies een plaat tussen 1 en ${Math.max(1, order?.total_plates || 1)}.`, variant: "destructive" }); return; }
    const targetJob = jobs.find((item) => item.order_id === job.order_id && item.plate_number === selectedPlate && !["completed", "cancelled"].includes(item.status));
    if (!targetJob) { toast({ title: "Plaatkoppeling ontbreekt", description: `Voor plaat ${selectedPlate} is nog geen koppeling uit de geüploade 3MF aangemaakt.`, variant: "destructive" }); return; }
    if (printer?.current_plate != null && printer.current_plate !== targetJob.plate_number) { toast({ title: "Andere plaat actief", description: `De printer meldt plaat ${printer.current_plate}, maar deze taak is voor plaat ${targetJob.plate_number}.`, variant: "destructive" }); return; }
    if (job.status !== "suggested" || job.printer_id !== printer?.id) {
      const { error: restoreError } = await supabase.from("print_jobs").update({ status: "suggested", printer_id: printer?.id || null }).eq("id", job.id).in("status", ["suggested", "approved", "printing", "paused"]);
      if (restoreError) { toast({ title: "Oud plaatverzoek herstellen mislukt", description: restoreError.message, variant: "destructive" }); return; }
    }
    const { data, error } = await supabase.rpc("approve_and_count_print_job_run", { p_suggestion_job_id: job.id, p_plate_number: selectedPlate });
    const result = data as { counted?: boolean; completed?: boolean; remainingRuns?: number; runNumber?: number; runsRequired?: number; reason?: string } | null;
    setApproveJob(null);
    if (error || !result?.counted) toast({ title: "Goedkeuren mislukt", description: error?.message || `De printrun kon niet worden geteld (${result?.reason || "onbekende reden"}).`, variant: "destructive" });
    else { setManualPlateNumbers((current) => { const next = { ...current }; delete next[job.id]; return next; }); toast({ title: result.completed ? "Plaat volledig geprint" : "Printrun geteld", description: result.completed ? `Plaat ${selectedPlate} is volledig geprint.` : `Run ${result.runNumber} van ${result.runsRequired} is geteld; nog ${result.remainingRuns} te printen.` }); void load(); }
  };

  if (authLoading || loading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="animate-spin" /></main></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center">Geen toegang.</main></div>;

  return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container mx-auto px-4 py-8 max-w-7xl">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-8"><div className="flex items-center gap-3"><Button variant="ghost" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button><div><h1 className="text-2xl font-bold text-primary">Printproductie</h1><p className="text-muted-foreground">P1S-status, AMS-voorraad, 3MF-controle en plaatkoppelingen.</p></div></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="w-4 h-4" /> Vernieuwen</Button></div>

    <div className="grid lg:grid-cols-3 gap-6 mb-8"><section className="lg:col-span-2 rounded-2xl border bg-card p-5"><h2 className="font-bold mb-4 flex items-center gap-2"><Printer className="w-5 h-5 text-accent" /> Printers</h2><div className="grid md:grid-cols-2 gap-4">{printers.map(printer => <div key={printer.id} className="rounded-xl border p-4"><div className="flex justify-between"><div><h3 className="font-bold">{printer.name}</h3><p className="text-xs text-muted-foreground">{printer.model} · {livePrinterStatus(printer)}</p></div><span className={`w-3 h-3 rounded-full ${livePrinterStatus(printer) === "printing" ? "bg-blue-500 animate-pulse" : livePrinterStatus(printer) === "idle" ? "bg-emerald-500" : livePrinterStatus(printer) === "error" ? "bg-destructive" : "bg-muted-foreground"}`} /></div><div className="mt-3 text-sm space-y-1"><p className="truncate">Bestand: {printer.current_file || "—"}</p><p>Plaat: {printer.current_plate ?? "—"} · voortgang: {Number(printer.progress).toFixed(0)}% · laag {printer.current_layer || 0}/{printer.total_layers || 0}</p><p>Resterend: {printer.remaining_minutes ?? "—"} min · nozzle {printer.nozzle_temperature ?? "—"}°C</p><p className="text-xs text-muted-foreground">Laatst gezien: {printer.last_seen_at ? new Date(printer.last_seen_at).toLocaleString("nl-NL") : "nooit"}</p></div><div className="flex flex-wrap gap-2 mt-3"><Button size="sm" variant="outline" onClick={() => supabase.from("printers").update({ status: printer.status === "maintenance" ? "idle" : "maintenance" }).eq("id", printer.id).then(() => void load())}><Wrench className="w-3 h-3" /> {printer.status === "maintenance" ? "Vrijgeven" : "Onderhoud"}</Button><Button size="sm" variant="outline" onClick={() => void renewBridgeToken(printer)}><KeyRound className="w-3 h-3" /> Nieuw bridge-token</Button><Button size="sm" variant="outline" onClick={() => setDeletePrinter(printer)}><Trash2 className="w-3 h-3 text-destructive" /> Verwijderen</Button></div></div>)}</div>{!printers.length && <p className="text-sm text-muted-foreground">Voeg hieronder uw P1S toe.</p>}</section>
      <section className="rounded-2xl border bg-card p-5"><h2 className="font-bold mb-4">AMS-filament</h2><div className="space-y-3">{slots.map(slot => <div key={slot.id} className="flex items-center gap-3"><span className="w-7 h-7 rounded-full border" style={{ backgroundColor: slot.color_hex || "#808080" }} /><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">AMS {slot.ams_unit + 1} · vak {slot.slot_number}: {slot.color_name || "Onbekend"}</p><p className="text-xs text-muted-foreground">{slot.material || "—"} · {slot.remaining_grams != null ? `${Number(slot.remaining_grams).toFixed(0)} g` : slot.remaining_percent != null ? `${Number(slot.remaining_percent).toFixed(0)}%` : "voorraad onbekend"}</p></div></div>)}{!slots.length && <p className="text-sm text-muted-foreground">AMS-data verschijnt bij een LAN-bridge. Bambu Connect geeft deze livegegevens niet vrij aan websites.</p>}</div></section></div>

    <section className="rounded-2xl border bg-card p-5 mb-8"><h2 className="font-bold mb-3">Printer koppelen</h2><div className="grid md:grid-cols-5 gap-3"><div><Label>Naam</Label><Input value={printerForm.name} onChange={event => setPrinterForm({ ...printerForm, name: event.target.value })} /></div><div><Label>Serienummer</Label><Input value={printerForm.serial} onChange={event => setPrinterForm({ ...printerForm, serial: event.target.value })} /></div>{printerForm.connectionMode === "bambu_connect" && <div><Label>Bambu-account</Label><Input type="email" value={printerForm.account} onChange={event => setPrinterForm({ ...printerForm, account: event.target.value })} placeholder="naam@email.nl" /></div>}<div><Label>Verbinding</Label><Select value={printerForm.connectionMode} onValueChange={connectionMode => setPrinterForm({ ...printerForm, connectionMode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bambu_connect">Bambu-account (geen Developer Mode)</SelectItem><SelectItem value="lan_bridge">LAN live-status (Developer Mode)</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button onClick={addPrinter}><Cpu className="w-4 h-4" /> Printer toevoegen</Button></div></div><p className="text-xs text-muted-foreground mt-3">Bij de accountverbinding logt u lokaal in met een eenmalige Bambu-e-mailcode. De lokale cloudbridge leest daarna printnaam, actieve plaat en AMS-status; uw Bambu-token wordt niet naar de website gestuurd.</p>{bridgeConfig && <div className="mt-4 rounded-xl bg-slate-950 text-slate-100 p-4"><p className="text-xs mb-2"><ShieldCheck className="inline w-4 h-4" /> Koppelgegevens voor de lokale bridge:</p><pre className="text-xs whitespace-pre-wrap">{bridgeConfig}</pre></div>}</section>

    {inspection && <section className="rounded-2xl border bg-card p-5 mb-8"><div className="flex items-center justify-between gap-3 mb-3"><Button variant="outline" size="icon" onClick={() => selectPlate(-1)} disabled={inspection.plates.length < 2} aria-label="Vorige plaat"><ChevronLeft className="w-4 h-4" /></Button><div className="text-center"><h2 className="font-bold">{inspection.plates.find((plate) => plate.number === jobForm.plate)?.name || `Plaat ${jobForm.plate}`}</h2><p className="text-xs text-muted-foreground">{inspection.plates.findIndex((plate) => plate.number === jobForm.plate) + 1} van {inspection.plates.length}</p></div><Button variant="outline" size="icon" onClick={() => selectPlate(1)} disabled={inspection.plates.length < 2} aria-label="Volgende plaat"><ChevronRight className="w-4 h-4" /></Button></div>{inspection.plates.find((plate) => plate.number === jobForm.plate)?.previewUrl ? <img src={inspection.plates.find((plate) => plate.number === jobForm.plate)?.previewUrl} alt={`Kleurenvoorbeeld van plaat ${jobForm.plate}`} className="w-full max-h-[520px] object-contain rounded-xl bg-slate-950" /> : <ModelViewer file={threeMf} height={420} />}{threeMf && <Button className="mt-3 w-full" variant="outline" asChild><a href={URL.createObjectURL(threeMf)} download={threeMf.name}><Download className="w-4 h-4" /> Download voor Bambu Connect</a></Button>}</section>}

    <section className="rounded-2xl border bg-card p-5 mb-8"><h2 className="font-bold mb-4 flex items-center gap-2"><FileArchive className="w-5 h-5 text-accent" /> 3MF testen en aan een plaat koppelen</h2><div className="grid lg:grid-cols-2 gap-6"><div className="space-y-4"><div><Label>Open een Bambu 3MF</Label><Input type="file" accept=".3mf" onChange={event => { const file = event.target.files?.[0]; if (file) void inspectFile(file); }} /></div>{inspecting && <p className="text-sm"><Loader2 className="w-4 h-4 inline animate-spin" /> Bestand analyseren…</p>}{inspection && <div className="rounded-xl bg-muted/50 p-4 text-sm space-y-1"><p><strong>{inspection.fileName}</strong></p><p>{inspection.meshCount} modellen · {inspection.triangleCount.toLocaleString("nl-NL")} driehoeken</p><p>{inspection.dimensions.width.toFixed(1)} × {inspection.dimensions.depth.toFixed(1)} × {inspection.dimensions.height.toFixed(1)} mm</p><div className="flex flex-wrap gap-2 pt-2">{inspection.colors.map(color => <span key={color.hex} className="text-xs rounded-full border px-2 py-1 flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: color.hex }} />{color.name} {color.hex}</span>)}</div></div>}<ModelViewer file={threeMf} height={320} /></div><div className="grid sm:grid-cols-2 gap-3 content-start"><div className="sm:col-span-2"><Label>Bestelling</Label><Select value={jobForm.orderId} onValueChange={orderId => setJobForm({ ...jobForm, orderId })}><SelectTrigger><SelectValue placeholder="Kies bestelling" /></SelectTrigger><SelectContent>{orders.map(order => <SelectItem key={order.id} value={order.id}>{order.order_number} · {order.customer_name}</SelectItem>)}</SelectContent></Select></div><div><Label>Printer</Label><Select value={jobForm.printerId} onValueChange={printerId => setJobForm({ ...jobForm, printerId })}><SelectTrigger><SelectValue placeholder="Kies printer" /></SelectTrigger><SelectContent>{printers.map(printer => <SelectItem key={printer.id} value={printer.id}>{printer.name} · {printer.status}</SelectItem>)}</SelectContent></Select></div><div><Label>Plaatnummer</Label><Input type="number" min={1} value={jobForm.plate} onChange={event => setJobForm({ ...jobForm, plate: Number(event.target.value) || 1 })} /></div><div><Label>Hoe vaak printen</Label><Input type="number" min={1} value={jobForm.runs} onChange={event => setJobForm({ ...jobForm, runs: Number(event.target.value) || 1 })} /></div><div><Label>Planning</Label><Input type="datetime-local" value={jobForm.scheduledAt} onChange={event => setJobForm({ ...jobForm, scheduledAt: event.target.value })} /></div><div><Label>Geschatte minuten</Label><Input type="number" min={0} value={jobForm.duration} onChange={event => setJobForm({ ...jobForm, duration: event.target.value })} /></div><div><Label>Geschatte filamentgrammen</Label><Input type="number" min={0} value={jobForm.grams} onChange={event => setJobForm({ ...jobForm, grams: event.target.value })} /></div><div className="sm:col-span-2"><Label>Verwachte printbestandsnaam</Label><Input value={jobForm.expectedFile} onChange={event => setJobForm({ ...jobForm, expectedFile: event.target.value })} />{selectedPrinter?.current_file && <p className={`text-xs mt-1 ${currentMatch ? "text-emerald-700" : "text-destructive"}`}>Printer: {selectedPrinter.current_file} · {currentMatch ? "komt overeen" : "wijkt af"}</p>}</div><div className="sm:col-span-2"><Button className="w-full" onClick={addJob} disabled={saving || !jobForm.orderId || !jobForm.printerId || !jobForm.expectedFile}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Plaatkoppeling opslaan</Button></div></div></div></section>

    {suggestions.length > 0 && (
      <section>
        <h2 className="font-bold text-xl mb-4 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Printende platen controleren</h2>
        <div className="space-y-3">
          {suggestions.map((job) => {
            const order = orders.find((item) => item.id === job.order_id);
            const printer = findPlateRequestPrinter(job, printers);
            const match = printFileMatch(job.expected_file_name, printer?.current_file || "");
            const plateKnown = printer?.current_plate != null;
            const selectedPlate = approvalPlate(job);
            const plateMatch = plateKnown && printer.current_plate === job.plate_number;
            const manualPlateValid = !plateKnown && selectedPlate != null && selectedPlate <= Math.max(1, order?.total_plates || 0);
            const canApprove = match && (plateMatch || manualPlateValid);
            return (
              <article key={job.id} className="rounded-2xl border bg-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ring-2 ring-accent">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{order?.order_number || "Bestelling"} · {plateKnown ? `plaat ${printer.current_plate}` : "plaat onbekend"}</h3>
                    <span className="text-xs rounded-full bg-muted px-2 py-1">Wacht op admin-goedkeuring</span>
                    {printer?.current_file && <span className={`text-xs rounded-full px-2 py-1 ${match && (plateMatch || manualPlateValid) ? "bg-emerald-100 text-emerald-800" : "bg-destructive/10 text-destructive"}`}>{!match ? "ander bestand actief" : plateKnown ? (plateMatch ? "bestand en plaat komen overeen" : `printer meldt plaat ${printer.current_plate}`) : manualPlateValid ? `handmatig plaat ${selectedPlate}` : "actieve plaat onbekend"}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{job.expected_file_name} · {printer?.name || "wacht op printermatch"}</p>
                  <p className="text-sm mt-2 text-accent">Dit bestand wordt nu geprint. Controleer de bestelling en plaat; pas na goedkeuring mag de voltooide print als geprint worden geteld.</p>
                  {!plateKnown && (
                    <div className="mt-3 max-w-xs">
                      <Label htmlFor={`manual-plate-${job.id}`}>Plaatnummer handmatig invullen</Label>
                      <Input id={`manual-plate-${job.id}`} type="number" min={1} max={Math.max(1, order?.total_plates || 1)} value={manualPlateNumbers[job.id] || ""} onChange={(event) => setManualPlateNumbers((current) => ({ ...current, [job.id]: event.target.value }))} placeholder={`1 t/m ${Math.max(1, order?.total_plates || 1)}`} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setApproveJob(job)} disabled={!canApprove}><CheckCircle2 className="w-4 h-4" /> Goedkeuren voor ‘geprint’</Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    )}
  </div></main><Footer /><ConfirmActionDialog open={approveJob !== null} onOpenChange={(open) => !open && setApproveJob(null)} title="Mag deze print als geprint worden geteld?" description={approveJob ? `${orders.find(order => order.id === approveJob.order_id)?.order_number || "Bestelling"} · plaat ${approvalPlate(approveJob) ?? "onbekend"}. Printerbestand: ${findPlateRequestPrinter(approveJob, printers)?.current_file || "onbekend"}. Bevestig alleen wanneer u zelf hebt gecontroleerd dat dit de juiste bestelling en plaat is. De teller wordt direct met één bijgewerkt.` : ""} confirmLabel="Goedkeuren en printrun tellen" onConfirm={() => approveJob ? approve(approveJob) : undefined} /><ConfirmActionDialog open={deletePrinter !== null} onOpenChange={(open) => !open && setDeletePrinter(null)} title="Printer verwijderen?" description={`“${deletePrinter?.name || "Deze printer"}” en de bijbehorende AMS-gegevens worden verwijderd. Bestaande printtaken blijven bewaard zonder printer.`} confirmLabel="Printer verwijderen" destructive onConfirm={removePrinter} /></div>;
}
