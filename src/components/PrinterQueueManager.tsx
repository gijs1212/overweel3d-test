import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, Eye, FileUp, FlaskConical, FolderOpen, HardDriveDownload, ListOrdered, Loader2, Play, Plus, RefreshCw, Terminal, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { disposeThreeMfInspection, inspectThreeMf, type ThreeMfInspection } from "@/lib/threeMfInspector";
import { amsSlotsForPrinter } from "@/lib/amsSlots";

type DirectoryEntry = { path: string; type: "directory" | "file"; size_bytes?: number | null };
type Printer = { id: string; name: string; device_serial?: string | null; status?: string | null; plate_check_status?: string; ftps_scan_paths?: unknown; ftps_directory_listing?: unknown; ftps_last_error?: string | null; ftps_scan_requested_at?: string | null; ftps_folder_scan_requested_at?: string | null; sd_card_last_seen_at?: string | null };
type Slot = { id: string; printer_id: string; ams_unit: number; slot_number: number; material: string | null; color_name: string | null; color_hex: string | null };
type Inventory = { id: string; material: string | null; color_name: string | null; color_hex: string | null };
type DetectedFilament = { material?: string | null; color_name?: string | null; color_hex?: string | null };
type SdPlate = { number: number; name?: string; path?: string; size_bytes?: number | null; detected_filaments?: DetectedFilament[]; preview_data_url?: string; printable?: boolean };
type SdFile = { id: string; printer_id: string; path: string; display_name: string; available?: boolean; plates: SdPlate[] | null; detected_material?: string | null; detected_color_name?: string | null; detected_filaments?: DetectedFilament[] | null; metadata_request_id?: number; metadata_completed_request_id?: number; metadata_last_error?: string | null; metadata_requested_plate_number?: number | null };
type RequiredColor = { inventory_id: string; name: string; material: string; color_hex: string; ams_unit?: number; slot_number?: number };
type QueueItem = { id: string; printer_id: string; file_name: string; plate_number: number; position: number; required_colors: RequiredColor[]; status: string; blocked_reason: string | null; bridge_error?: string | null; calibration_enabled: boolean };
type ColorDraft = { key: string; inventoryId: string; slotId: string; materialLock?: string };

const labels: Record<string, string> = { queued: "In wachtrij", blocked: "Wacht op filament", starting: "Startopdracht verzonden", printing: "Bezig", paused: "Gepauzeerd", failed: "Mislukt" };
const db = supabase;

function metadataDownloadProgress(value?: string | null) {
  const match = /^DOWNLOAD_(PROGRESS|COMPLETE):(\d+):(\d+)(?::(\d+))?$/.exec(value || "");
  if (!match) return null;
  const downloaded = Number(match[2]);
  const total = Number(match[3]);
  return { status: match[1].toLowerCase() as "progress" | "complete", downloaded, total, percent: total > 0 ? Math.min(100, Math.round(downloaded * 100 / total)) : 0, cacheExpiresAt: Number(match[4] || 0) };
}

const exactBytes = (value: number) => `${Math.max(0, value).toLocaleString("nl-NL")} bytes`;
const hasActiveDownloadCache = (file: SdFile) => {
  const progress = metadataDownloadProgress(file.metadata_last_error);
  return progress?.status === "complete" && Number(progress.cacheExpiresAt || 0) * 1000 > Date.now();
};

export function PrinterQueueManager({ printers, slots }: { printers: Printer[]; slots: Slot[] }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<SdFile[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [printerId, setPrinterId] = useState("");
  const [fileId, setFileId] = useState("");
  const [plate, setPlate] = useState(1);
  const [colors, setColors] = useState<ColorDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [catalogPath, setCatalogPath] = useState("");
  const [catalogInspection, setCatalogInspection] = useState<ThreeMfInspection | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [scanPaths, setScanPaths] = useState<string[]>(["/", "/cache"]);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [showFtpsOutput, setShowFtpsOutput] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [matchesApproved, setMatchesApproved] = useState(false);
  const [bedLeveling, setBedLeveling] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [metadataWatch, setMetadataWatch] = useState<{ fileId: string; requestId: number } | null>(null);
  const [dryRunConfirmationOpen, setDryRunConfirmationOpen] = useState(false);
  const [cachedFileView, setCachedFileView] = useState<SdFile | null>(null);
  const loadErrorShown = useRef(false);

  const load = useCallback(async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const [fileResult, queueResult, inventoryResult] = await Promise.all([
          supabase.from("printer_sd_files").select("*").order("display_name"),
          supabase.from("printer_queue_items").select("*").in("status", ["queued", "blocked", "starting", "printing", "paused", "failed"]).order("position"),
          supabase.from("filament_inventory").select("id,material,color_name,color_hex").order("color_name"),
        ]);
        const error = fileResult.error || queueResult.error || inventoryResult.error;
        if (error) throw error;
        setFiles((fileResult.data || []) as unknown as SdFile[]);
        setQueue((queueResult.data || []) as unknown as QueueItem[]);
        setInventory(inventoryResult.data || []);
        loadErrorShown.current = false;
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
      }
    }
    if (!loadErrorShown.current) {
      loadErrorShown.current = true;
      toast({ title: "Printerwachtrij tijdelijk niet bereikbaar", description: `${lastError instanceof Error ? lastError.message : "Verbinding mislukt"}. Laatst geladen gegevens blijven zichtbaar; opnieuw verbinden gebeurt automatisch.`, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("printer-queue-manager")
      .on("postgres_changes", { event: "*", schema: "public", table: "printer_queue_items" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "printer_sd_files" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  useEffect(() => {
    const hasActiveDownload = files.some((file) => Number(file.metadata_request_id || 0) > Number(file.metadata_completed_request_id || 0));
    if (!hasActiveDownload && !metadataWatch) return;
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [files, load, metadataWatch]);

  useEffect(() => {
    if (!metadataWatch) return;
    const watchedFile = files.find((file) => file.id === metadataWatch.fileId);
    if (!watchedFile || Number(watchedFile.metadata_completed_request_id || 0) < metadataWatch.requestId) return;
    setMetadataWatch(null);
    setFileId(watchedFile.id);
    const refreshedPlate = watchedFile.plates?.some((item) => item.number === plate)
      ? plate
      : watchedFile.plates?.[0]?.number || 1;
    setPlate(refreshedPlate);
    applyDetectedMatches(watchedFile, refreshedPlate);
    const completed = metadataDownloadProgress(watchedFile.metadata_last_error);
    if (completed?.status === "complete") {
      toast({
        title: "Download opgeslagen en opnieuw verwerkt",
        description: `${watchedFile.plates?.length || 0} printbare plaat${watchedFile.plates?.length === 1 ? "" : "en"} gevonden. Het bestand blijft 48 uur beschikbaar.`,
      });
    }
  // applyDetectedMatches intentionally follows the freshly loaded record only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, metadataWatch]);
  useEffect(() => { if (!printerId && printers[0]) setPrinterId(printers[0].id); }, [printerId, printers]);
  useEffect(() => {
    const value = printers.find((printer) => printer.id === printerId)?.ftps_scan_paths;
    if (Array.isArray(value) && value.every((path) => typeof path === "string")) setScanPaths(value as string[]);
  }, [printerId, printers]);
  useEffect(() => () => disposeThreeMfInspection(catalogInspection), [catalogInspection]);

  const printerFiles = files.filter((file) => file.printer_id === printerId && (file.available !== false || hasActiveDownloadCache(file)));
  const filteredPrinterFiles = printerFiles.filter((file) => `${file.display_name} ${file.path} ${file.detected_material || ""} ${file.detected_color_name || ""} ${(file.plates || []).map((item) => item.name).join(" ")}`.toLowerCase().includes(fileSearch.trim().toLowerCase()));
  const scannerPrinter = printers.find((printer) => printer.id === printerId);
  const directoryListing = Array.isArray(scannerPrinter?.ftps_directory_listing)
    ? scannerPrinter.ftps_directory_listing.filter((entry): entry is DirectoryEntry => Boolean(entry && typeof entry === "object" && "path" in entry && "type" in entry))
    : [];
  const availableDirectories = [...new Set(["/", ...scanPaths, ...directoryListing.filter((entry) => entry.type === "directory").map((entry) => entry.path)])].sort();
  const selectedFile = files.find((file) => file.id === fileId);
  const downloadProgress = metadataDownloadProgress(selectedFile?.metadata_last_error);
  const downloadPending = Boolean(selectedFile && Number(selectedFile.metadata_request_id || 0) > Number(selectedFile.metadata_completed_request_id || 0));
  const selectedPlates = selectedFile?.plates?.length ? selectedFile.plates : [{ number: 1, name: "Plaat 1" }];
  const printerSlots = useMemo(() => amsSlotsForPrinter(slots, printers, printerId), [slots, printers, printerId]);
  const selectedPlate = selectedPlates.find((item) => item.number === plate);
  const cachedDownloads = useMemo(() => files.filter((file) => file.printer_id === printerId).map((file) => ({ file, progress: metadataDownloadProgress(file.metadata_last_error) }))
    .filter((entry) => entry.progress?.status === "complete" && Number(entry.progress.cacheExpiresAt || 0) * 1000 > Date.now())
    .sort((left, right) => Number(right.progress?.cacheExpiresAt || 0) - Number(left.progress?.cacheExpiresAt || 0)), [files]);
  const movable = queue.filter((item) => item.printer_id === printerId && ["queued", "blocked", "paused"].includes(item.status));
  const visibleQueue = queue.filter((item) => item.printer_id === printerId);
  const colorOptions = useMemo(() => {
    const combined = [...inventory];
    for (const slot of printerSlots) {
      if (slot.color_hex && !combined.some((item) => item.color_hex?.toLowerCase() === slot.color_hex?.toLowerCase() && item.material?.toLowerCase() === slot.material?.toLowerCase())) {
        combined.push({ id: "slot:" + slot.id, material: slot.material, color_name: slot.color_name, color_hex: slot.color_hex });
      }
    }
    return combined;
  }, [inventory, printerSlots]);

  const applyDetectedMatches = (file: SdFile, selectedPlate: number) => {
    const plateData = file.plates?.find((item) => item.number === selectedPlate);
    const detected = plateData?.detected_filaments?.length ? plateData.detected_filaments
      : file.detected_filaments?.length ? file.detected_filaments
      : file.detected_material ? [{ material: file.detected_material, color_name: file.detected_color_name }] : [];
    const normalize = (value?: string | null) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    setColors(detected.map((filament) => {
      const material = normalize(filament.material);
      const wantedColor = normalize(filament.color_name);
      const candidates = colorOptions.filter((item) => normalize(item.material) === material);
      const best = candidates.find((item) => filament.color_hex && item.color_hex?.toLowerCase() === filament.color_hex.toLowerCase())
        || candidates.find((item) => wantedColor && normalize(item.color_name) === wantedColor)
        || candidates.find((item) => wantedColor && (normalize(item.color_name).includes(wantedColor) || wantedColor.includes(normalize(item.color_name))))
        || candidates[0];
      const matchingSlot = best && printerSlots.find((slot) => normalize(slot.material) === normalize(best.material) && (normalize(slot.color_name) === normalize(best.color_name) || (!!slot.color_hex && slot.color_hex.toLowerCase() === best.color_hex?.toLowerCase())));
      return { key: crypto.randomUUID(), inventoryId: best?.id || "", slotId: matchingSlot?.id || "auto", materialLock: filament.material || undefined };
    }));
    setMatchesApproved(false);
  };

  const selectSdFile = (value: string) => {
    setFileId(value);
    const file = files.find((candidate) => candidate.id === value);
    const firstPlate = file?.plates?.[0]?.number || 1;
    setPlate(firstPlate);
    if (file) applyDetectedMatches(file, firstPlate);
  };

  const selectCachedFileForPrint = (file: SdFile) => {
    setCachedFileView(null);
    setFileSearch("");
    selectSdFile(file.id);
    window.requestAnimationFrame(() => document.getElementById("printer-file-selection")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    toast({
      title: "Gedownload bestand gekozen",
      description: `${file.display_name} staat klaar. Kies eventueel een andere plaat, keur de filamentmatches goed en stuur het bestand naar de wachtrij of printer.`,
    });
  };

  const prepareSelectedFile = async () => {
    const selectedPlatePath = selectedFile?.plates?.find((item) => item.number === plate)?.path || selectedFile?.path || "";
    if (!selectedFile || !/\.(?:gcode|3mf)$/i.test(selectedPlatePath)) return;
    setPreparing(true);
    setMatchesApproved(false);
    const { data: requestId, error } = await supabase.rpc("request_printer_file_metadata", { p_file_id: selectedFile.id, p_plate_number: plate });
    setPreparing(false);
    if (error) toast({ title: "Printbestand voorbereiden mislukt", description: error.message, variant: "destructive" });
    else {
      const numericRequestId = Number(requestId || 0);
      setMetadataWatch({ fileId: selectedFile.id, requestId: numericRequestId });
      toast({ title: "Printbestand wordt tijdelijk voorbereid", description: `Aanvraag #${numericRequestId}: de add-on downloadt het hele bestand, bewaart het 48 uur en bepaalt daarna opnieuw alle platen.` });
      await load();
    }
  };

  const cancelSelectedFilePreparation = async () => {
    if (!selectedFile) return;
    const { data: requestId, error } = await supabase.rpc("cancel_printer_file_metadata", { p_file_id: selectedFile.id });
    if (error) {
      toast({ title: "Download annuleren mislukt", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Download geannuleerd", description: `Aanvraag #${requestId} wordt door de add-on afgebroken en het tijdelijke bestand wordt verwijderd.` });
    setMetadataWatch(null);
    void load();
  };

  const selectPlate = (value: number) => {
    setPlate(value);
    if (selectedFile) applyDetectedMatches(selectedFile, value);
  };

  useEffect(() => {
    if (selectedFile && Number(selectedFile.metadata_completed_request_id || 0) > 0) {
      const parsedPlate = selectedFile.plates?.some((item) => item.number === plate)
        ? plate
        : selectedFile.plates?.[0]?.number || 1;
      setPlate(parsedPlate);
      applyDetectedMatches(selectedFile, parsedPlate);
    }
    // Re-run only when newly scanned metadata for the selected file arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile?.metadata_completed_request_id]);

  const enqueue = async (printNow = false, dryRun = false) => {
    if (!selectedFile) return;
    if (!matchesApproved) {
      toast({ title: "Bevestiging nodig", description: "Controleer en keur eerst de voorgestelde filamentmatches goed.", variant: "destructive" });
      return;
    }
    if (colors.some((color) => !color.inventoryId)) {
      toast({ title: "Kleur ontbreekt", description: "Kies voor ieder kleurvak een filamentkleur.", variant: "destructive" });
      return;
    }
    if (printNow || dryRun) {
      const unavailable = colors.some((draft) => {
        const choice = colorOptions.find((option) => option.id === draft.inventoryId);
        const candidateSlots = draft.slotId === "auto" ? printerSlots : printerSlots.filter((slot) => slot.id === draft.slotId);
        return !choice || !candidateSlots.some((slot) =>
          (choice.material || "").toLowerCase() === (slot.material || "").toLowerCase()
          && ((choice.color_hex && slot.color_hex && choice.color_hex.slice(0, 7).toLowerCase() === slot.color_hex.slice(0, 7).toLowerCase())
            || (choice.color_name || "").toLowerCase() === (slot.color_name || "").toLowerCase())
        );
      });
      if (unavailable) {
        toast({ title: "Print kan nog niet starten", description: "Niet alle goedgekeurde kleuren zitten in de gekozen AMS-vakken.", variant: "destructive" });
        return;
      }
    }
    const requiredColors = colors.map((draft) => {
      const choice = colorOptions.find((option) => option.id === draft.inventoryId)!;
      const slot = printerSlots.find((option) => option.id === draft.slotId);
      return {
        inventory_id: choice.id, name: choice.color_name || "Onbekende kleur",
        material: choice.material || "", color_hex: choice.color_hex || "",
        ...(slot ? { ams_unit: slot.ams_unit, slot_number: slot.slot_number } : {}),
      };
    });
    const positions = queue.filter((item) => item.printer_id === printerId).map((item) => Number(item.position));
    const nextPosition = printNow || dryRun ? Math.min(0, ...positions) - 1000 : Math.max(0, ...positions) + 1000;
    setSaving(true);
    const { error } = await supabase.from("printer_queue_items").insert({
      printer_id: printerId, sd_file_id: selectedFile.id,
      sd_file_path: selectedPlates.find((item) => item.number === plate)?.path || selectedFile.path,
      file_name: selectedFile.display_name, plate_number: plate, position: nextPosition,
      required_colors: requiredColors, status: "queued", calibration_enabled: bedLeveling,
      bridge_error: dryRun ? "DRY_RUN_PENDING" : null,
    });
    if (error) {
      setSaving(false);
      toast({ title: dryRun ? "Wachtrijtest starten mislukt" : printNow ? "Print starten mislukt" : "Aan wachtrij toevoegen mislukt", description: error.message, variant: "destructive" });
    }
    else {
      if (printNow || dryRun) {
        const { data: requestId, error: startError } = await supabase.rpc("request_printer_queue_start", { p_printer_id: printerId });
        if (startError) {
          toast({ title: "Startverzoek mislukt", description: startError.message, variant: "destructive" });
        } else {
          toast({
            title: dryRun ? "Veilige wachtrijtest gestart" : "Adminmelding: print wordt gestart",
            description: dryRun
              ? `${selectedFile.display_name} · plaat ${plate} · testverzoek #${requestId}. Pc en VM starten en Bambu Connect wordt volledig voorbereid, maar de printknop wordt niet uitgevoerd.`
              : `${selectedFile.display_name} · plaat ${plate} · startverzoek #${requestId}. De goedgekeurde AMS-kleuren worden gebruikt.`,
          });
          setColors([]);
          setMatchesApproved(false);
        }
      } else {
        setColors([]);
        setMatchesApproved(false);
        toast({ title: "In wachtrij", description: "De print is met de goedgekeurde kleur- en AMS-koppelingen aan de wachtrij toegevoegd." });
      }
      setSaving(false);
      void load();
    }
  };

  const inspectCatalogFile = async (file: File) => {
    disposeThreeMfInspection(catalogInspection);
    setCatalogFile(file);
    setCatalogPath(file.name);
    setCatalogBusy(true);
    try {
      setCatalogInspection(await inspectThreeMf(file, { lightweight: true }));
    } catch (error) {
      setCatalogInspection(null);
      toast({ title: "3MF lezen mislukt", description: error instanceof Error ? error.message : "Ongeldig bestand", variant: "destructive" });
    } finally {
      setCatalogBusy(false);
    }
  };

  const registerCatalogFile = async () => {
    if (!printerId || !catalogFile || !catalogInspection || !catalogPath.trim()) return;
    setCatalogBusy(true);
    const path = catalogPath.trim().replace(/^\/+/, "");
    const { data, error } = await supabase.from("printer_sd_files").upsert({
      printer_id: printerId,
      path,
      display_name: catalogFile.name,
      size_bytes: catalogFile.size,
      plates: catalogInspection.plates.map(({ number, name }) => ({ number, name })),
      available: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "printer_id,path" }).select("id").single();
    setCatalogBusy(false);
    if (error) {
      toast({ title: "Bestand registreren mislukt", description: error.message, variant: "destructive" });
      return;
    }
    setFileId(data.id);
    setPlate(catalogInspection.plates[0]?.number || 1);
    toast({ title: "3MF geregistreerd", description: "De platen zijn ingelezen. Zorg dat dit bestand met exact hetzelfde pad op de printer-SD-kaart staat." });
    void load();
  };

  const reorder = async (item: QueueItem, direction: -1 | 1) => {
    const index = movable.findIndex((candidate) => candidate.id === item.id);
    const other = index + direction;
    if (index < 0 || other < 0 || other >= movable.length) return;
    const ordered = movable.map((candidate) => candidate.id);
    [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
    const { error } = await supabase.rpc("reorder_printer_queue", { p_printer_id: printerId, p_item_ids: ordered });
    if (error) toast({ title: "Volgorde wijzigen mislukt", description: error.message, variant: "destructive" });
    else void load();
  };

  const requestFullRefresh = async () => {
    if (!printerId || !scanPaths.length) return;
    setRefreshBusy(true);
    const { data, error } = await supabase.rpc("request_printer_full_refresh", {
      p_printer_id: printerId, p_scan_paths: scanPaths,
    });
    setRefreshBusy(false);
    if (error) {
      toast({ title: "Volledig verversen mislukt", description: error.message, variant: "destructive" });
      return;
    }
    const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    toast({
      title: "Volledige printerrefresh gestart",
      description: `De add-on ververst eerst printer en AMS, daarna mappen (#${result.folder_request_id || "—"}) en vervolgens alle printbestanden (#${result.file_request_id || "—"}).`,
    });
  };

  const startNextPrint = async () => {
    if (!printerId || saving) return;
    if ((scannerPrinter?.status || "").toLowerCase() !== "idle") {
      toast({ title: "Printer is niet vrij", description: "De volgende print kan alleen worden gestart als de printer de status idle heeft.", variant: "destructive" });
      return;
    }
    if (!visibleQueue.some((item) => item.status === "queued")) {
      toast({ title: "Geen beschikbare print", description: "Er staat geen startklare print in de wachtrij. Geblokkeerde prints wachten op het juiste filament.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: requestId, error } = await supabase.rpc("request_printer_queue_start", { p_printer_id: printerId });
    setSaving(false);
    if (error) toast({ title: "Volgende print starten mislukt", description: error.message, variant: "destructive" });
    else toast({ title: "Startopdracht verzonden", description: `Verzoek #${requestId} is naar de add-on gestuurd. De status verandert naar Bezig zodra de printer RUNNING bevestigt.` });
  };

  return <section className="rounded-2xl border bg-card p-5 mb-8">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><h2 className="font-bold flex items-center gap-2"><ListOrdered className="w-5 h-5" /> Printwachtrij</h2><p className="text-sm text-muted-foreground">SD-kaartprints op volgorde; kies per print of het printbed eerst wordt geleveld.</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void startNextPrint()} disabled={saving || !printerId || (scannerPrinter?.status || "").toLowerCase() !== "idle" || !visibleQueue.some((item) => item.status === "queued")}><Play className="w-4 h-4" /> Volgende print starten</Button><Button variant="outline" size="sm" onClick={() => void requestFullRefresh()} disabled={refreshBusy || !printerId || !scanPaths.length}>{refreshBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Alles verversen</Button></div>
    </div>
    <div className="grid lg:grid-cols-2 gap-6">
      <div id="printer-file-selection" className="scroll-mt-28 space-y-3 rounded-xl border p-4">
        <div><Label>Printer</Label><Select value={printerId} onValueChange={(value) => { setPrinterId(value); setFileId(""); }}><SelectTrigger><SelectValue placeholder="Kies printer" /></SelectTrigger><SelectContent>{printers.map((printer) => <SelectItem key={printer.id} value={printer.id}>{printer.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="rounded-xl border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold flex items-center gap-2"><FolderOpen className="w-4 h-4" /> FTPS-mappen</h3><p className="text-xs text-muted-foreground">Kies één of meerdere mappen met printbestanden.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setShowFtpsOutput((value) => !value)}><Terminal className="w-4 h-4" /> {showFtpsOutput ? "Output sluiten" : "FTPS-output openen"}</Button></div>
          <div className="max-h-44 overflow-auto rounded-lg bg-muted/40 p-2 space-y-1">{availableDirectories.map((path) => <label key={path} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-background cursor-pointer"><input type="checkbox" checked={scanPaths.includes(path)} onChange={(event) => setScanPaths((current) => event.target.checked ? [...new Set([...current, path])] : current.filter((item) => item !== path))} /><span className="font-mono text-xs">{path}</span></label>)}</div>
          <p className="text-xs text-muted-foreground">Gebruik bovenaan “Alles verversen”. De add-on ververst uitsluitend na deze klik eerst printer en AMS, scant daarna nieuwe mappen en vernieuwt vervolgens alle printbestanden in de aangevinkte mappen.</p>
          {showFtpsOutput && <div className="rounded-lg bg-slate-950 text-slate-100 p-3 text-xs"><p className="mb-2 text-slate-300">Laatste scan: {scannerPrinter?.sd_card_last_seen_at ? new Date(scannerPrinter.sd_card_last_seen_at).toLocaleString("nl-NL") : "nog niet uitgevoerd"}</p>{scannerPrinter?.ftps_last_error && <p className="mb-2 text-red-300">Fout: {scannerPrinter.ftps_last_error}</p>}<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{directoryListing.length ? directoryListing.map((entry) => `${entry.type === "directory" ? "[MAP]" : "[BESTAND]"} ${entry.path}${entry.size_bytes != null ? ` (${entry.size_bytes} bytes)` : ""}`).join("\n") : "Nog geen FTPS-output ontvangen."}</pre></div>}
               </div>
        <div className="rounded-xl border border-dashed p-3 space-y-3">
          <div><Label htmlFor="queue-3mf">3MF handmatig registreren</Label><Input id="queue-3mf" type="file" accept=".3mf,.gcode.3mf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectCatalogFile(file); }} /></div>
          {catalogFile && <div><Label htmlFor="queue-sd-path">Exact pad op SD-kaart</Label><Input id="queue-sd-path" value={catalogPath} onChange={(event) => setCatalogPath(event.target.value)} placeholder="bijvoorbeeld cache/model.gcode.3mf" /><p className="mt-1 text-xs text-muted-foreground">Gebruik de exacte bestandsnaam of het pad dat u in Bambu Studio/Handy naar de printer hebt gestuurd.</p></div>}
          {catalogInspection && <p className="text-xs text-muted-foreground">Gevonden platen: {catalogInspection.plates.map((item) => item.number).join(", ")}</p>}
          <Button type="button" variant="outline" onClick={() => void registerCatalogFile()} disabled={!catalogInspection || !catalogPath.trim() || catalogBusy || !printerId}>{catalogBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} Registreren voor wachtrij</Button>
        </div>
        <div><Label htmlFor="ftps-file-search">Zoeken in printbestanden</Label><Input id="ftps-file-search" type="search" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="Zoek op naam of map…" /></div>
        <div><Label>Bestand op FTPS-opslag</Label><Select value={fileId} onValueChange={selectSdFile}><SelectTrigger><SelectValue placeholder={printerFiles.length ? "Kies bestand" : "Nog geen bestanden gevonden"} /></SelectTrigger><SelectContent>{filteredPrinterFiles.map((file) => <SelectItem key={file.id} value={file.id}>{file.display_name}{file.plates?.length ? ` · ${file.plates.length} plaat${file.plates.length === 1 ? "" : "en"}` : ""}</SelectItem>)}</SelectContent></Select>{fileSearch && !filteredPrinterFiles.length && <p className="mt-1 text-xs text-muted-foreground">Geen printbestanden gevonden voor “{fileSearch}”.</p>}</div>
        {selectedFile && <div className="rounded-xl border p-3 space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void prepareSelectedFile()} disabled={preparing || downloadPending || !/\.(?:gcode|3mf)$/i.test(selectedPlates.find((item) => item.number === plate)?.path || selectedFile.path)}>{preparing || downloadPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />} Bestand tijdelijk downloaden en voorbereiden</Button>{downloadPending && <Button type="button" variant="destructive" onClick={() => void cancelSelectedFilePreparation()}><XCircle className="w-4 h-4" /> Download annuleren</Button>}</div>{downloadPending && !downloadProgress && <div className="space-y-1.5" aria-label="Wachten op add-on"><div className="flex justify-between text-xs font-medium"><span>Wachten tot de add-on de aanvraag ontvangt…</span><Loader2 className="h-3.5 w-3.5 animate-spin" /></div><Progress value={0} className="h-2" /></div>}{downloadProgress && <div className="space-y-1.5" aria-label="Voortgang tijdelijke download"><div className="flex justify-between text-xs font-medium"><span>Bestand downloaden</span><span>{downloadProgress.total > 0 ? `${downloadProgress.percent}%` : `${(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} MB`}</span></div><Progress value={downloadProgress.percent} className="h-2" /><p className="text-[11px] text-muted-foreground">{(downloadProgress.downloaded / 1024 / 1024).toFixed(1)} van {downloadProgress.total > 0 ? `${(downloadProgress.total / 1024 / 1024).toFixed(1)} MB` : "onbekende bestandsgrootte"}</p></div>}{selectedFile.metadata_last_error && !downloadProgress && !downloadPending && <p className="text-xs text-destructive">Voorbereiden: {selectedFile.metadata_last_error}</p>}<div><Label>Plaat uit bestand</Label><Select value={String(plate)} onValueChange={(value) => selectPlate(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedPlates.map((item) => <SelectItem key={item.number} value={String(item.number)}>Plaat {item.number}{item.name && item.name !== "Plaat " + item.number ? " · " + item.name : ""}</SelectItem>)}</SelectContent></Select></div>{selectedPlates.find((item) => item.number === plate)?.preview_data_url && <div className="overflow-hidden rounded-xl border bg-black"><img src={selectedPlates.find((item) => item.number === plate)?.preview_data_url} alt={`Preview van ${selectedPlates.find((item) => item.number === plate)?.name || `plaat ${plate}`}`} className="aspect-square w-full max-h-80 object-contain" /></div>}<div className="text-sm"><p className="font-semibold">{selectedPlates.length} printbare platen gevonden · plaat {plate} · {selectedPlates.find((item) => item.number === plate)?.name || `Plaat ${plate}`}</p><p className="text-muted-foreground">{colors.length} {colors.length === 1 ? "kleur" : "kleuren"} daadwerkelijk gebruikt · beste filamentmatches voorgeselecteerd</p></div></div>}
        {selectedFile && downloadProgress && <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs"><p className="font-semibold">{downloadProgress.status === "complete" ? "Download voltooid en tijdelijk bewaard" : "Download actief"}: {exactBytes(downloadProgress.downloaded)} van {downloadProgress.total > 0 ? exactBytes(downloadProgress.total) : "onbekend"} ({downloadProgress.percent}%)</p>{downloadProgress.status === "complete" && downloadProgress.cacheExpiresAt > 0 && <p className="mt-1 text-muted-foreground">Beschikbaar in de bridgecache tot {new Date(downloadProgress.cacheExpiresAt * 1000).toLocaleString("nl-NL")}.</p>}</div>}
        {colors.map((draft, index) => <div key={draft.key} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end rounded-lg bg-muted/40 p-3">
          <div><Label>Kleur {index + 1}{draft.materialLock ? ` (${draft.materialLock})` : ""}</Label><Select value={draft.inventoryId} onValueChange={(value) => { setMatchesApproved(false); setColors((current) => current.map((item) => item.key === draft.key ? { ...item, inventoryId: value } : item)); }}><SelectTrigger><SelectValue placeholder="Kies kleur" /></SelectTrigger><SelectContent>{colorOptions.filter((item) => !draft.materialLock || (item.material || "").toLowerCase() === draft.materialLock.toLowerCase()).map((item) => <SelectItem key={item.id} value={item.id}>{item.color_name || "Onbekend"} · {item.material || "—"}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>AMS-plaats</Label><Select value={draft.slotId} onValueChange={(value) => { setMatchesApproved(false); setColors((current) => current.map((item) => item.key === draft.key ? { ...item, slotId: value } : item)); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Automatisch zodra aanwezig</SelectItem>{printerSlots.map((slot) => <SelectItem key={slot.id} value={slot.id}>AMS {slot.ams_unit + 1} · vak {slot.slot_number} ({slot.color_name || "onbekend"})</SelectItem>)}</SelectContent></Select></div>
          <Button variant="ghost" size="icon" onClick={() => { setMatchesApproved(false); setColors((current) => current.filter((item) => item.key !== draft.key)); }} aria-label={"Kleur " + (index + 1) + " verwijderen"}><Trash2 className="w-4 h-4" /></Button>
        </div>)}
        <label className="flex items-center justify-between gap-4 rounded-xl border p-3 cursor-pointer"><span><span className="block text-sm font-medium">Printbed vooraf levelen</span><span className="block text-xs text-muted-foreground">Alleen bed-leveling; flow- en vibratiekalibratie blijven uit.</span></span><Switch checked={bedLeveling} onCheckedChange={setBedLeveling} aria-label="Printbed vooraf levelen" /></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setMatchesApproved(false); setColors((current) => [...current, { key: crypto.randomUUID(), inventoryId: "", slotId: "auto" }]); }}><Plus className="w-4 h-4" /> Kleur toevoegen</Button><Button type="button" variant={matchesApproved ? "secondary" : "outline"} disabled={!selectedFile || !colors.length || colors.some((color) => !color.inventoryId)} onClick={() => setMatchesApproved(true)}>{matchesApproved ? "Matches goedgekeurd" : "Filamentmatches goedkeuren"}</Button><Button onClick={() => void enqueue(false)} disabled={!selectedFile || !matchesApproved || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} In wachtrij</Button><Button variant="outline" onClick={() => setDryRunConfirmationOpen(true)} disabled={!selectedFile || !matchesApproved || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Volledige keten testen</Button><Button onClick={() => void enqueue(true)} disabled={!selectedFile || !matchesApproved || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Nu printen</Button></div>
        <p className="text-xs text-muted-foreground">De ketentest start indien nodig de pc en VM, opent het echte bestand in Bambu Connect en stelt plaat, kleuren en leveling in. De definitieve printknop wordt nooit uitgevoerd.</p>
        <p className="text-xs text-muted-foreground">Ontbreekt een gekozen kleur in de AMS, dan blijft de print tijdelijk geblokkeerd en wordt de volgende geschikte print gebruikt.</p>
      </div>
      <div className="space-y-2">
        {visibleQueue.map((item) => <article key={item.id} className="rounded-xl border p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="font-medium truncate">{item.file_name} · plaat {item.plate_number}</p><p className="text-xs text-muted-foreground">{item.bridge_error === "DRY_RUN_COMPLETE" ? "Test voltooid · niets naar de printer verzonden" : item.bridge_error?.startsWith("DRY_RUN_PENDING") ? "Veilige ketentest" : labels[item.status] || item.status}{item.blocked_reason ? " · " + item.blocked_reason : ""} · {item.calibration_enabled ? "bed-leveling aan" : "bed-leveling uit"}</p><div className="flex flex-wrap gap-1 mt-1">{(item.required_colors || []).map((color, index) => <span key={color.color_hex + index} className="text-[11px] border rounded-full px-2 py-0.5 inline-flex gap-1 items-center"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color.color_hex || "#888" }} />{color.name}</span>)}</div></div>
          <div className="flex"><Button variant="ghost" size="icon" onClick={() => void reorder(item, -1)} disabled={!movable.some((candidate) => candidate.id === item.id)} aria-label="Omhoog"><ArrowUp className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => void reorder(item, 1)} disabled={!movable.some((candidate) => candidate.id === item.id)} aria-label="Omlaag"><ArrowDown className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => void db.from("printer_queue_items").delete().eq("id", item.id).then(load)} disabled={["starting", "printing"].includes(item.status)} aria-label="Verwijderen"><Trash2 className="w-4 h-4" /></Button></div>
        </article>)}
        {!visibleQueue.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">De wachtrij is leeg.</div>}
      </div>
    </div>
    <div className="mt-6 rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 font-semibold"><HardDriveDownload className="h-4 w-4" /> Tijdelijke downloads</h3><p className="text-xs text-muted-foreground">Bestanden blijven 48 uur in de beveiligde add-oncache. De opgeslagen plaatnamen, kleuren en previews zijn na vernieuwen en op andere apparaten zichtbaar.</p></div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{cachedDownloads.length} bewaard</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cachedDownloads.map(({ file, progress }) => <article key={file.id} className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{file.display_name}</p><p className="truncate text-[11px] text-muted-foreground">{file.path}</p></div><div className="flex shrink-0 flex-wrap justify-end gap-1.5"><Button type="button" size="sm" variant="outline" onClick={() => setCachedFileView(file)}><Eye className="h-3.5 w-3.5" /> Bekijken</Button><Button type="button" size="sm" onClick={() => selectCachedFileForPrint(file)}><Play className="h-3.5 w-3.5" /> Kiezen voor print</Button></div></div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span>{file.plates?.length || 0} plaat{file.plates?.length === 1 ? "" : "en"}</span><span>·</span><span>{progress ? exactBytes(progress.downloaded) : "grootte onbekend"}</span></div>
          {progress && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Beschikbaar tot {new Date(progress.cacheExpiresAt * 1000).toLocaleString("nl-NL")}</p>}
        </article>)}
        {!cachedDownloads.length && <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Nog geen tijdelijke downloads. Kies een printbestand en gebruik “Bestand tijdelijk downloaden en voorbereiden”.</div>}
      </div>
    </div>
    <Dialog open={cachedFileView !== null} onOpenChange={(open) => !open && setCachedFileView(null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{cachedFileView?.display_name || "Tijdelijke download"}</DialogTitle><DialogDescription>Deze analyse komt uit PocketBase en blijft daardoor ook na een pagina-refresh en op een ander apparaat beschikbaar zolang de 48-uurscache geldig is.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {(cachedFileView?.plates || []).map((cachedPlate) => <article key={`${cachedFileView?.id}-${cachedPlate.number}`} className="overflow-hidden rounded-xl border">
            {cachedPlate.preview_data_url ? <div className="bg-black"><img src={cachedPlate.preview_data_url} alt={`Preview ${cachedPlate.name || `plaat ${cachedPlate.number}`}`} className="aspect-square max-h-80 w-full object-contain" /></div> : <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">Geen coverpreview opgeslagen</div>}
            <div className="space-y-2 p-3"><p className="font-semibold">Plaat {cachedPlate.number}{cachedPlate.name ? ` · ${cachedPlate.name}` : ""}</p><p className="break-all text-xs text-muted-foreground">{cachedPlate.path || cachedFileView?.path}</p><div className="flex flex-wrap gap-1.5">{(cachedPlate.detected_filaments || cachedFileView?.detected_filaments || []).map((filament, index) => <span key={`${cachedPlate.number}-${index}-${filament.color_hex || filament.color_name}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"><span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: filament.color_hex || "#888" }} />{filament.color_name || "Onbekende kleur"} · {filament.material || "materiaal onbekend"}</span>)}</div></div>
          </article>)}
          {cachedFileView && !(cachedFileView.plates || []).length && <p className="text-sm text-muted-foreground sm:col-span-2">Voor dit bestand zijn nog geen platen opgeslagen.</p>}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={dryRunConfirmationOpen} onOpenChange={(open) => !saving && setDryRunConfirmationOpen(open)}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Volledige printketen veilig testen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-left">
              <p>Controleer hieronder exact wat de test gaat doen. Er wordt geen printopdracht naar de printer verzonden.</p>
              <div className="rounded-xl border bg-muted/30 p-3 text-sm text-foreground">
                <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="font-semibold">Printer</dt><dd>{scannerPrinter?.name || "Onbekend"}</dd>
                  <dt className="font-semibold">Bestand</dt><dd className="break-all">{selectedFile?.display_name || "Onbekend"}<span className="block text-xs text-muted-foreground">{selectedPlate?.path || selectedFile?.path || "Geen SD-pad"}</span></dd>
                  <dt className="font-semibold">Plaat</dt><dd>{plate} · {selectedPlate?.name || `Plaat ${plate}`}</dd>
                  <dt className="font-semibold">Bed-leveling</dt><dd>{bedLeveling ? "Wordt aangezet" : "Blijft uit"}</dd>
                  <dt className="font-semibold">Filament</dt><dd>{colors.map((draft, index) => { const filament = colorOptions.find((item) => item.id === draft.inventoryId); const slot = printerSlots.find((item) => item.id === draft.slotId); return <span key={draft.key} className="block">Kleur {index + 1}: {filament?.color_name || "Onbekend"} · {filament?.material || "materiaal onbekend"} · {slot ? `AMS ${slot.ams_unit + 1}, vak ${slot.slot_number}` : "automatische AMS-match"}</span>; })}</dd>
                </dl>
              </div>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>De add-on pingt de host-pc en start deze indien nodig.</li>
                <li>De VM wordt gestart wanneer de VM-agent nog niet bereikbaar is.</li>
                <li>Het gekozen bestand wordt via FTPS vanaf de printer gedownload.</li>
                <li>Bambu Connect opent het bestand en stelt printer, AMS-kleuren en leveling in.</li>
                <li>De test stopt vóór Verzenden/Printen; ook een bevestigingsknop wordt niet ingedrukt.</li>
                <li>Het wachtrij-item krijgt “Test voltooid” en de ingestelde VM-/pc-afsluitstroom wordt uitgevoerd.</li>
              </ol>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-900">Veilige modus: er wordt niets naar de printer verzonden en er wordt geen printrun geteld.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annuleren</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={() => { setDryRunConfirmationOpen(false); void enqueue(false, true); }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Bevestigen en test starten
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
