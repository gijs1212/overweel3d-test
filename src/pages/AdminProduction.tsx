import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Cpu, Download, FileArchive, KeyRound, Loader2, Plus, Printer, RefreshCw, Save, ShieldCheck, TriangleAlert, Trash2, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Footer } from "@/components/Footer";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { ModelViewer } from "@/components/ModelViewer";
import { Navbar } from "@/components/Navbar";
import { PrinterQueueManager } from "@/components/PrinterQueueManager";
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
  if (!printer.last_seen_at || Date.now() - new Date(printer.last_seen_at).getTime() > 5 * 60_000) return "offline";
  return printer.status;
};

const hostPcStatus = (printer: PrinterRow) => {
  if (printer.host_pc_status === "on") return { label: "Pc aan", dot: "bg-emerald-500", text: "text-emerald-700" };
  if (printer.host_pc_status === "off") return { label: "Pc uit", dot: "bg-neutral-400", text: "text-black/55" };
  return { label: "Pc nog niet gecontroleerd", dot: "bg-amber-400", text: "text-amber-700" };
};

const vmStatus = (printer: PrinterRow) => {
  const raw = printer.raw_status && typeof printer.raw_status === "object" && !Array.isArray(printer.raw_status)
    ? printer.raw_status as Record<string, unknown>
    : {};
  if (raw.vm_status === "on") return { label: "VM aan", dot: "bg-emerald-500", text: "text-emerald-700", checkedAt: String(raw.vm_checked_at || "") };
  if (raw.vm_status === "off") return { label: "VM uit", dot: "bg-neutral-400", text: "text-black/55", checkedAt: String(raw.vm_checked_at || "") };
  return { label: "VM nog niet gecontroleerd", dot: "bg-amber-400", text: "text-amber-700", checkedAt: "" };
};

const copyTextToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
};

export default function AdminProduction() {
  const { isAdmin, loading: authLoading } = useAuth(); const { toast } = useToast(); const navigate = useNavigate();
  const [printers, setPrinters] = useState<PrinterRow[]>([]); const [jobs, setJobs] = useState<JobRow[]>([]); const [slots, setSlots] = useState<SlotRow[]>([]); const [orders, setOrders] = useState<OrderChoice[]>([]); const [loading, setLoading] = useState(true);
  const [printerForm, setPrinterForm] = useState({ name: "P1S", serial: "" });
  const [pairingForm, setPairingForm] = useState({ printerId: "", host: "", accessCode: "", ftpsUsername: "bblp", ftpsPort: "990" });
  const [creatingPairingCode, setCreatingPairingCode] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [requestingLoginCode, setRequestingLoginCode] = useState<string | null>(null);
  const [bridgeConfig, setBridgeConfig] = useState("");
  const [deletePrinter, setDeletePrinter] = useState<PrinterRow | null>(null);
  const [approveJob, setApproveJob] = useState<JobRow | null>(null);
  const [manualPlateNumbers, setManualPlateNumbers] = useState<Record<string, string>>({});
  const [checkingJobId, setCheckingJobId] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState({ orderId: "", printerId: "", plate: 1, runs: 1, expectedFile: "", duration: "", grams: "", scheduledAt: "" });
  const [threeMf, setThreeMf] = useState<File | null>(null); const [inspection, setInspection] = useState<ThreeMfInspection | null>(null); const [inspecting, setInspecting] = useState(false); const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [printerResult, jobResult, slotResult, orderResult] = await Promise.all([
      supabase.from("printers").select("*").order("name"),
      supabase.from("print_jobs").select("*").eq("active", true).order("created_at", { ascending: false }),
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
  useEffect(() => { if (!pairingForm.printerId && printers[0]) setPairingForm((current) => ({ ...current, printerId: printers[0].id })); }, [pairingForm.printerId, printers]);
  useEffect(() => {
    if (!isAdmin || !pairingForm.printerId) return;
    let cancelled = false;
    void supabase.functions.invoke("printer-pair", { body: { action: "get_connection", printer_id: pairingForm.printerId } }).then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setPairingForm((current) => current.printerId !== pairingForm.printerId ? current : ({
        ...current,
        host: String(data.bambu_host || ""),
        accessCode: String(data.bambu_access_code || ""),
        ftpsUsername: String(data.ftps_username || "bblp"),
        ftpsPort: String(data.ftps_port || 990),
      }));
    });
    return () => { cancelled = true; };
  }, [isAdmin, pairingForm.printerId]);

  const selectedOrder = orders.find(order => order.id === jobForm.orderId);
  const selectedPrinter = printers.find(printer => printer.id === jobForm.printerId);
  const currentMatch = selectedPrinter && jobForm.expectedFile ? printFileMatch(jobForm.expectedFile, selectedPrinter.current_file || "") : false;
  const suggestions = useMemo(() => jobs.filter((job) => isVisiblePlateRequest(job, orders, printers)).sort((a, b) => String(a.suggested_at || a.created_at).localeCompare(String(b.suggested_at || b.created_at))), [jobs, orders, printers]);
  const approvalPlate = (job: JobRow) => {
    const manualPlate = Number(manualPlateNumbers[job.id]);
    if (Number.isInteger(manualPlate) && manualPlate > 0) return manualPlate;
    const reportedPlate = findPlateRequestPrinter(job, printers)?.current_plate;
    if (reportedPlate == null) return null;
    return jobs.find((candidate) => candidate.order_id === job.order_id && candidate.source_plate_number === reportedPlate)?.plate_number ?? null;
  };
  const adminPlateLabel = (job: JobRow | undefined) => job
    ? `Plaat ${job.plate_number}${job.source_plate_number != null ? ` (${job.source_plate_number} in bestand)` : ""}`
    : "Plaat onbekend";

  const createPairingCode = async (printerId: string, host = "", accessCode = "", ftpsUsername = "bblp", ftpsPort = "990") => {
    setCreatingPairingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("printer-pair", { body: {
        action: "create", printer_id: printerId, bambu_host: host.trim(), bambu_access_code: accessCode.trim(),
        ftps_username: ftpsUsername.trim() || "bblp", ftps_port: Number(ftpsPort) || 990,
      } });
      if (error || !data?.code) {
        toast({ title: "Koppelcode maken mislukt", description: data?.error || error?.message || "Onbekende fout", variant: "destructive" });
        return false;
      }
      const copied = await copyTextToClipboard(String(data.code));
      setBridgeConfig(`${data.code}\n\nDeze code blijft geldig en kan na een herstart of herinstallatie opnieuw worden gebruikt.`);
      toast({ title: "Website-koppelcode gemaakt", description: copied ? "De code staat op het klembord. Plak hem in de Home Assistant-app en start die opnieuw." : "Kopiëren naar het klembord werd door de browser geblokkeerd; kopieer de zichtbare code handmatig." });
      return true;
    } catch (error) {
      toast({ title: "Koppelcode maken mislukt", description: error instanceof Error ? error.message : "De koppeling kon niet worden voorbereid.", variant: "destructive" });
      return false;
    } finally {
      setCreatingPairingCode(false);
    }
  };

  const addPrinter = async () => {
    if (!printerForm.serial.trim()) {
      toast({ title: "Gegevens ontbreken", description: "Vul het serienummer van de printer in.", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("printers").insert({ name: printerForm.name.trim(), device_serial: printerForm.serial.trim(), connection_mode: "bambu_connect" }).select("id").single();
    if (error) { toast({ title: "Printer toevoegen mislukt", description: error.message, variant: "destructive" }); return; }
    setPairingForm((current) => ({ ...current, printerId: data.id }));
    await createPairingCode(data.id, pairingForm.host, pairingForm.accessCode, pairingForm.ftpsUsername, pairingForm.ftpsPort);
    setPrinterForm({ name: "P1S", serial: "" }); void load();
  };

  const renewBridgeToken = async (printer: PrinterRow) => {
    setPairingForm((current) => ({ ...current, printerId: printer.id }));
    await createPairingCode(printer.id, pairingForm.host, pairingForm.accessCode, pairingForm.ftpsUsername, pairingForm.ftpsPort);
  };

  const saveConnectionSettings = async () => {
    if (!pairingForm.printerId) return;
    setSavingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke("printer-pair", { body: {
        action: "update_connection",
        printer_id: pairingForm.printerId,
        bambu_host: pairingForm.host.trim(),
        bambu_access_code: pairingForm.accessCode.trim(),
        ftps_username: pairingForm.ftpsUsername.trim() || "bblp",
        ftps_port: Number(pairingForm.ftpsPort) || 990,
      } });
      if (error || !data?.success) throw error || new Error(data?.error || "Opslaan mislukt");
      toast({ title: "Printerverbinding opgeslagen", description: "De actieve add-on neemt de nieuwe gegevens automatisch over; opnieuw koppelen is niet nodig." });
    } catch (error) {
      toast({ title: "Printerverbinding opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setSavingConnection(false);
    }
  };

  const requestBambuLoginCode = async (printer: PrinterRow) => {
    setRequestingLoginCode(printer.id);
    try {
      const { data, error } = await supabase.rpc("request_bambu_login_code", { p_printer_id: printer.id });
      if (error) throw error;
      toast({
        title: "Nieuwe Bambu-code aangevraagd",
        description: `De bridge verwerkt verzoek #${data}. Vul de ontvangen e-mailcode daarna in bij de add-onconfiguratie en herstart de add-on.`,
      });
    } catch (error) {
      toast({ title: "Inlogcode aanvragen mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setRequestingLoginCode(null);
    }
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
    const targetJob = jobs.find((item) => item.order_id === job.order_id && item.plate_number === selectedPlate);
    if (!targetJob) { toast({ title: "Plaatkoppeling ontbreekt", description: `Voor plaat ${selectedPlate} is nog geen koppeling uit de geüploade 3MF aangemaakt.`, variant: "destructive" }); return; }
    if (targetJob.status === "completed" || targetJob.runs_completed >= targetJob.runs_required) { toast({ title: "Plaat al geprint", description: `Plaat ${selectedPlate} is al volledig geprint. Er is niets gewijzigd.` }); setApproveJob(null); return; }
    if (printer?.current_plate != null && printer.current_plate !== targetJob.source_plate_number) { toast({ title: "Andere plaat actief", description: `De printer meldt plaat ${printer.current_plate} in het bestand, maar ${adminPlateLabel(targetJob)} is gekoppeld.`, variant: "destructive" }); return; }
    if (job.status !== "suggested" || job.printer_id !== printer?.id) {
      const { error: restoreError } = await supabase.from("print_jobs").update({ status: "suggested", printer_id: printer?.id || null }).eq("id", job.id).in("status", ["suggested", "approved", "printing", "paused"]);
      if (restoreError) { toast({ title: "Oud plaatverzoek herstellen mislukt", description: restoreError.message, variant: "destructive" }); return; }
    }
    const { data, error } = await supabase.rpc("approve_and_count_print_job_run", { p_suggestion_job_id: job.id, p_plate_number: selectedPlate });
    const result = data as { counted?: boolean; completed?: boolean; remainingRuns?: number; runNumber?: number; runsRequired?: number; reason?: string } | null;
    setApproveJob(null);
    if (error || !result?.counted) {
      const alreadyComplete = result?.reason === "already_fully_printed";
      toast({ title: alreadyComplete ? "Plaat al geprint" : "Goedkeuren mislukt", description: error?.message || (alreadyComplete ? `Plaat ${selectedPlate} is al volledig geprint. Er is niets gewijzigd.` : `De printrun kon niet worden geteld (${result?.reason || "onbekende reden"}).`), variant: alreadyComplete ? "default" : "destructive" });
    }
    else { setManualPlateNumbers((current) => { const next = { ...current }; delete next[job.id]; return next; }); toast({ title: result.completed ? "Plaat volledig geprint" : "Printrun geteld", description: result.completed ? `Plaat ${selectedPlate} is volledig geprint.` : `Run ${result.runNumber} van ${result.runsRequired} is geteld; nog ${result.remainingRuns} te printen.` }); void load(); }
  };

  const recheckSuggestion = async (request: JobRow) => {
    const plate = approvalPlate(request);
    const order = orders.find((item) => item.id === request.order_id);
    const maximum = Math.max(1, order?.total_plates || 1);
    if (!order || plate == null || plate > maximum) {
      toast({ title: "Kies eerst een plaat", description: `Kies een plaat tussen 1 en ${maximum}.`, variant: "destructive" });
      return;
    }
    setCheckingJobId(request.id);
    const refreshResult = await supabase.rpc("refresh_order_plate_data", { p_order_id: request.order_id });
    const [printerResult, jobResult, slotResult, orderResult] = await Promise.all([
      supabase.from("printers").select("*").order("name"),
      supabase.from("print_jobs").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("printer_ams_slots").select("*").order("ams_unit").order("slot_number"),
      supabase.from("orders").select("id,order_number,customer_name,total_plates,plate_runs_required_per_plate").not("status", "in", "(completed,cancelled)").order("submitted_at", { ascending: false }),
    ]);
    setCheckingJobId(null);
    const error = refreshResult.error || jobResult.error || printerResult.error || slotResult.error || orderResult.error;
    if (error) {
      toast({ title: "Opnieuw controleren mislukt", description: error.message, variant: "destructive" });
      return;
    }
    const freshJobs = jobResult.data || [];
    const freshPrinters = printerResult.data || [];
    const freshSlots = slotResult.data || [];
    const freshOrders = orderResult.data || [];
    setJobs(freshJobs);
    setPrinters(freshPrinters);
    setSlots(freshSlots);
    setOrders(freshOrders);
    const freshRequest = freshJobs.find((job) => job.id === request.id) || request;
    const freshOrder = freshOrders.find((item) => item.id === request.order_id);
    const printer = findPlateRequestPrinter(freshRequest, freshPrinters);
    const target = freshJobs.find((job) => job.order_id === request.order_id && job.plate_number === plate);
    if (!target) {
      toast({ title: "Plaatkoppeling ontbreekt", description: `Plaat ${plate} staat niet in de 3MF-koppelingen van deze bestelling.`, variant: "destructive" });
    } else if (target.status === "completed" || target.runs_completed >= target.runs_required) {
      toast({ title: "Plaat al geprint", description: `Alle plaat-, bestelling-, printer- en AMS-gegevens zijn vernieuwd. Plaat ${plate} is al volledig geprint; er is niets gewijzigd.` });
    } else if (!printer || !printFileMatch(freshRequest.expected_file_name, printer.current_file || freshRequest.observed_file_name || "")) {
      toast({ title: "Controle wijkt af", description: "Het actieve printerbestand komt niet overeen met deze bestelling. Er is niets gewijzigd.", variant: "destructive" });
    } else {
      const remaining = Math.max(target.runs_required - target.runs_completed, 0);
      toast({ title: "Alle gegevens vernieuwd", description: `${freshOrder?.order_number || order.order_number} · plaat ${plate} heeft nog ${remaining} printrun${remaining === 1 ? "" : "s"} nodig. Plaat-, bestelling-, printer- en AMS-gegevens zijn opnieuw geladen.` });
    }
  };

  if (authLoading || loading) return <div className="min-h-screen"><Navbar /><main className="pt-24 flex justify-center"><Loader2 className="animate-spin" /></main></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="pt-24 text-center">Geen toegang.</main></div>;

  return <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16"><div className="container mx-auto px-4 py-8 max-w-7xl">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-8"><div className="flex items-center gap-3"><Button variant="ghost" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button><div><h1 className="text-2xl font-bold text-primary">Printproductie</h1><p className="text-muted-foreground">P1S-status, AMS-voorraad, 3MF-controle en plaatkoppelingen.</p></div></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="w-4 h-4" /> Vernieuwen</Button></div>

    <div className="grid lg:grid-cols-3 gap-6 mb-8"><section className="lg:col-span-2 rounded-2xl border bg-card p-5"><h2 className="font-bold mb-4 flex items-center gap-2"><Printer className="w-5 h-5 text-accent" /> Printers</h2><div className="grid md:grid-cols-2 gap-4">{printers.map(printer => { const pc = hostPcStatus(printer); const vm = vmStatus(printer); return <div key={printer.id} className="rounded-xl border p-4"><div className="flex justify-between"><div><h3 className="font-bold">{printer.name}</h3><p className="text-xs text-muted-foreground">{printer.model} · {livePrinterStatus(printer)}</p><p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${pc.text}`}><span className={`h-2 w-2 rounded-full ${pc.dot}`} />{pc.label}</p><p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${vm.text}`}><span className={`h-2 w-2 rounded-full ${vm.dot}`} />{vm.label}</p>{vm.checkedAt && <p className="mt-0.5 text-[10px] text-muted-foreground">VM gecontroleerd: {new Date(vm.checkedAt).toLocaleString("nl-NL")}</p>}{printer.host_pc_checked_at && <p className="mt-0.5 text-[10px] text-muted-foreground">Pc gecontroleerd: {new Date(printer.host_pc_checked_at).toLocaleString("nl-NL")}</p>}</div><span className={`w-3 h-3 rounded-full ${livePrinterStatus(printer) === "printing" ? "bg-blue-500 animate-pulse" : livePrinterStatus(printer) === "idle" ? "bg-emerald-500" : livePrinterStatus(printer) === "error" ? "bg-destructive" : "bg-muted-foreground"}`} /></div><div className="mt-3 text-sm space-y-1"><p className="truncate">Bestand: {printer.current_file || "—"}</p><p>Plaat: {printer.current_plate ?? "—"} · voortgang: {Number(printer.progress).toFixed(0)}% · laag {printer.current_layer || 0}/{printer.total_layers || 0}</p><p>Resterend: {printer.remaining_minutes ?? "—"} min · nozzle {printer.nozzle_temperature ?? "—"}°C</p><p className="text-xs text-muted-foreground">Laatst gezien: {printer.last_seen_at ? new Date(printer.last_seen_at).toLocaleString("nl-NL") : "nooit"}</p></div><div className="flex flex-wrap gap-2 mt-3"><Button size="sm" variant="outline" onClick={() => supabase.from("printers").update({ status: printer.status === "maintenance" ? "idle" : "maintenance" }).eq("id", printer.id).then(() => void load())}><Wrench className="w-3 h-3" /> {printer.status === "maintenance" ? "Vrijgeven" : "Onderhoud"}</Button><Button size="sm" variant="outline" onClick={() => void renewBridgeToken(printer)}><KeyRound className="w-3 h-3" /> Nieuwe koppelcode</Button><Button size="sm" variant="outline" onClick={() => setDeletePrinter(printer)}><Trash2 className="w-3 h-3 text-destructive" /> Verwijderen</Button></div></div>})}</div>{!printers.length && <p className="text-sm text-muted-foreground">Voeg hieronder uw P1S toe.</p>}</section>
      <section className="rounded-2xl border bg-card p-5"><h2 className="font-bold mb-4">AMS-filament</h2><div className="space-y-3">{slots.map(slot => <div key={slot.id} className="flex items-center gap-3"><span className="w-7 h-7 rounded-full border" style={{ backgroundColor: slot.color_hex || "#808080" }} /><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">AMS {slot.ams_unit + 1} · vak {slot.slot_number}: {slot.color_name || "Onbekend"}</p><p className="text-xs text-muted-foreground">{slot.material || "—"} · {slot.remaining_grams != null ? `${Number(slot.remaining_grams).toFixed(0)} g` : slot.remaining_percent != null ? `${Number(slot.remaining_percent).toFixed(0)}%` : "voorraad onbekend"}</p></div></div>)}{!slots.length && <p className="text-sm text-muted-foreground">AMS-data verschijnt bij een LAN-bridge. Bambu Connect geeft deze livegegevens niet vrij aan websites.</p>}</div></section></div>

    <section className="rounded-2xl border bg-card p-5 mb-8">
      <h2 className="font-bold mb-3">Printer koppelen</h2>
      <p className="text-sm text-muted-foreground mb-4">Vul IP-adres en lokale toegangscode in om de SD-kaart automatisch uit te lezen terwijl de printer in cloudmodus blijft. Zonder deze gegevens blijven cloudstatus en handmatige 3MF-registratie werken.</p>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div><Label>Naam</Label><Input value={printerForm.name} onChange={event => setPrinterForm({ ...printerForm, name: event.target.value })} /></div>
        <div><Label>Serienummer</Label><Input value={printerForm.serial} onChange={event => setPrinterForm({ ...printerForm, serial: event.target.value })} required /></div>
        <div><Label>Lokaal IP-adres (voor automatisch uitlezen)</Label><Input value={pairingForm.host} onChange={event => setPairingForm({ ...pairingForm, host: event.target.value })} placeholder="192.168.1.50" /></div>
        <div><Label>Lokale toegangscode (voor automatisch uitlezen)</Label><Input type="password" value={pairingForm.accessCode} onChange={event => setPairingForm({ ...pairingForm, accessCode: event.target.value })} autoComplete="off" /></div>
        <div><Label>FTPS-gebruikersnaam</Label><Input value={pairingForm.ftpsUsername} onChange={event => setPairingForm({ ...pairingForm, ftpsUsername: event.target.value })} placeholder="bblp" /></div>
        <div><Label>FTPS-poort</Label><Input type="number" min={1} max={65535} value={pairingForm.ftpsPort} onChange={event => setPairingForm({ ...pairingForm, ftpsPort: event.target.value })} placeholder="990" /></div>
      </div>
      <Button className="mt-3" variant="outline" disabled={!pairingForm.printerId || savingConnection} onClick={() => void saveConnectionSettings()}>{savingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Verbindingsgegevens opslaan</Button>
      <Button className="mt-4" onClick={addPrinter}><Cpu className="w-4 h-4" /> Printer toevoegen en koppelen</Button>
      <div className="mt-5 border-t pt-5">
        <h3 className="font-semibold mb-1">Website-koppelcode maken</h3>
        <p className="text-sm text-muted-foreground mb-4">Voor een bestaande printer kunt u zonder certificaatbestanden een blijvend geldige koppelcode maken.</p>
        <div className="grid md:grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div><Label>Printer</Label><Select value={pairingForm.printerId} onValueChange={printerId => setPairingForm({ ...pairingForm, printerId })}><SelectTrigger><SelectValue placeholder="Kies printer" /></SelectTrigger><SelectContent>{printers.map(printer => <SelectItem key={printer.id} value={printer.id}>{printer.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end"><Button variant="outline" disabled={!pairingForm.printerId || creatingPairingCode} onClick={() => void createPairingCode(pairingForm.printerId, pairingForm.host, pairingForm.accessCode, pairingForm.ftpsUsername, pairingForm.ftpsPort)}>{creatingPairingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Toegangs- en hersteltoken vervangen</Button></div>
        </div>
        <Button className="mt-3" variant="outline" disabled={!pairingForm.printerId || requestingLoginCode === pairingForm.printerId} onClick={() => { const printer = printers.find((item) => item.id === pairingForm.printerId); if (printer) void requestBambuLoginCode(printer); }}>
          {requestingLoginCode === pairingForm.printerId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Nieuwe Bambu-inlogcode aanvragen
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">De add-on gebruikt FTPS met TLS-sessiehergebruik en de lokale toegangscode. Er zijn geen slicercertificaten nodig; de Bambu-cloudverbinding blijft actief.</p>
      {bridgeConfig && <div className="mt-4 rounded-xl bg-slate-950 text-slate-100 p-4"><p className="text-xs mb-2"><ShieldCheck className="inline w-4 h-4" /> Blijvend geldige website-koppelcode:</p><pre className="text-lg font-bold tracking-wider whitespace-pre-wrap">{bridgeConfig}</pre></div>}
    </section>

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
            const targetJob = jobs.find((item) => item.order_id === job.order_id && item.plate_number === selectedPlate);
            const targetComplete = Boolean(targetJob && (targetJob.status === "completed" || targetJob.runs_completed >= targetJob.runs_required));
            const selectedPlateValid = selectedPlate != null && selectedPlate <= Math.max(1, order?.total_plates || 0);
            const canApprove = match && selectedPlateValid;
            const remainingPlates = jobs.filter((item) => item.order_id === job.order_id && item.runs_completed < item.runs_required).map((item) => item.plate_number).sort((a, b) => a - b);
            return (
              <article key={job.id} className="rounded-2xl border bg-card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ring-2 ring-accent">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{order?.order_number || "Bestelling"} · {plateKnown ? `plaat ${printer.current_plate}` : "plaat onbekend"}</h3>
                    <span className="text-xs rounded-full bg-muted px-2 py-1">Wacht op admin-goedkeuring</span>
                    {printer?.current_file && <span className={`rounded-full px-2 py-1 text-xs ${canApprove ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>{!match ? "ander bestand actief" : targetComplete ? `plaat ${selectedPlate} is voltooid` : targetJob ? `plaat ${selectedPlate} moet nog ${Math.max(targetJob.runs_required - targetJob.runs_completed, 0)}× geprint worden` : selectedPlate ? `plaat ${selectedPlate} mist een 3MF-koppeling` : plateKnown ? `printer meldt plaat ${printer.current_plate}; controle nodig` : "actieve plaat onbekend"}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{job.expected_file_name} · {printer?.name || "wacht op printermatch"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Controleer de bestelling en plaat; pas na goedkeuring wordt één printuitvoering geteld.</p>
                  <p className="mt-2 text-xs font-semibold">Nog te printen platen: {remainingPlates.join(", ") || "geen"}</p>
                  <div className="mt-3 max-w-xs">
                    <Label htmlFor={`manual-plate-${job.id}`}>{plateKnown ? "Plaat controleren of aanpassen" : "Plaat kiezen"}</Label>
                    <Select value={selectedPlate == null ? "" : String(selectedPlate)} onValueChange={(value) => setManualPlateNumbers((current) => ({ ...current, [job.id]: value }))}>
                      <SelectTrigger id={`manual-plate-${job.id}`}><SelectValue placeholder="Kies een plaat" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: Math.max(1, order?.total_plates || 1) }, (_, index) => index + 1).map((plateNumber) => {
                          const optionJob = jobs.find((item) => item.order_id === job.order_id && item.plate_number === plateNumber);
                          const optionComplete = Boolean(optionJob && (optionJob.status === "completed" || optionJob.runs_completed >= optionJob.runs_required));
                          const remaining = optionJob ? Math.max(optionJob.runs_required - optionJob.runs_completed, 0) : null;
                          return <SelectItem key={plateNumber} value={String(plateNumber)}>{adminPlateLabel(optionJob)}{optionComplete ? " · voltooid" : remaining != null ? ` · moet nog ${remaining}× geprint worden` : " · geen 3MF-koppeling"}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void recheckSuggestion(job)} disabled={!selectedPlateValid || checkingJobId === job.id}>{checkingJobId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Alles opnieuw checken</Button>
                  <Button onClick={() => targetComplete ? toast({ title: "Plaat al geprint", description: `Plaat ${selectedPlate} is al volledig geprint. Er is niets gewijzigd.` }) : setApproveJob(job)} disabled={!canApprove}><CheckCircle2 className="w-4 h-4" /> Goedkeuren voor ‘geprint’</Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    )}
    <PrinterQueueManager printers={printers} slots={slots} />
  </div></main><Footer /><ConfirmActionDialog open={approveJob !== null} onOpenChange={(open) => !open && setApproveJob(null)} title="Mag deze print als geprint worden geteld?" description={approveJob ? `${orders.find(order => order.id === approveJob.order_id)?.order_number || "Bestelling"} · plaat ${approvalPlate(approveJob) ?? "onbekend"}. Printerbestand: ${findPlateRequestPrinter(approveJob, printers)?.current_file || "onbekend"}. Bevestig alleen wanneer u zelf hebt gecontroleerd dat dit de juiste bestelling en plaat is. De teller wordt direct met één bijgewerkt.` : ""} confirmLabel="Goedkeuren en printrun tellen" onConfirm={() => approveJob ? approve(approveJob) : undefined} /><ConfirmActionDialog open={deletePrinter !== null} onOpenChange={(open) => !open && setDeletePrinter(null)} title="Printer verwijderen?" description={`“${deletePrinter?.name || "Deze printer"}” en de bijbehorende AMS-gegevens worden verwijderd. Bestaande printtaken blijven bewaard zonder printer.`} confirmLabel="Printer verwijderen" destructive onConfirm={removePrinter} /></div>;
}
