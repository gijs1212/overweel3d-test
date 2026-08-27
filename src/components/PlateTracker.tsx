import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Eye, FileArchive, GripVertical, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoredThreeMfViewerDialog } from "@/components/StoredThreeMfViewerDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createPlateTrackingUpdate,
  detectBambuPlateCount,
  normalizePlatePrintQuantities,
  normalizePlateCompletedRuns,
  normalizePlateStatuses,
} from "@/lib/plateTracking";
import { disposeThreeMfInspection, inspectThreeMf, type ThreeMfInspection } from "@/lib/threeMfInspector";
import { mappingLabel, movePlateMapping, withLogicalPlateNumbers, type ThreeMfPlateMapping } from "@/lib/threeMfPlateMappings";

interface PlateTrackerProps {
  orderId: string;
  orderNumber: string;
  totalProducts: number;
  totalPlates: number;
  platePrintStatuses: boolean[];
  platePrintQuantities: number[];
  plateRunsCompleted: number[];
  onRunRecorded?: (data: {
    platePrintStatuses: boolean[];
    platePrintQuantities: number[];
    plateRunsCompleted: number[];
    platesCompleted: number;
  }) => void;
  onUpdate: (data: {
    totalProducts: number;
    totalPlates: number;
    platePrintStatuses: boolean[];
    platePrintQuantities: number[];
    platesCompleted: number;
  }) => void | Promise<void>;
}

interface Parse3MFResult {
  plateCount: number;
  details: string;
}

interface StoredThreeMf {
  id: string;
  storagePath: string;
  filename: string;
}

type ProductionThreeMf = StoredThreeMf;

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let eocdOffset = -1;

  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return entries;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length) break;
    if (
      bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x01 || bytes[offset + 3] !== 0x02
    ) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function extractFileContent(bytes: Uint8Array, entry: ZipEntry): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const fileData = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return new TextDecoder().decode(fileData);
  if (entry.compressionMethod !== 8) return null;

  try {
    const stream = new DecompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const writeComplete = writer.write(fileData).then(() => writer.close());

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    await writeComplete;

    const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let position = 0;
    for (const chunk of chunks) {
      output.set(chunk, position);
      position += chunk.length;
    }
    return new TextDecoder().decode(output);
  } catch (error) {
    console.error(`Kon ${entry.name} niet uitpakken`, error);
    return null;
  }
}

/**
 * Read only Bambu build-plate metadata from a 3MF archive.
 * Product/object counts are deliberately ignored: they are independent order data
 * and must never be used to derive either the number or status of build plates.
 */
async function parse3MFForPlateInfo(
  file: File,
): Promise<Parse3MFResult | { error: string }> {
  try {
    if (!file.name.toLowerCase().endsWith(".3mf")) {
      return { error: "Selecteer een bestand met de extensie .3mf." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return { error: "Dit is geen geldig 3MF/ZIP-bestand." };
    }

    const entries = listZipEntries(bytes);
    if (entries.length === 0) {
      return { error: "Het 3MF-archief bevat geen leesbare bestanden." };
    }

    const metadataEntries = entries.filter((entry) => {
      const lowerName = entry.name.toLowerCase();
      return lowerName.includes("model_settings.config") || lowerName.includes("slice_info.config");
    });

    const metadataDocuments: string[] = [];
    for (const entry of metadataEntries) {
      const content = await extractFileContent(bytes, entry);
      if (content) metadataDocuments.push(content);
    }

    const plateCount = detectBambuPlateCount(entries.map((entry) => entry.name), metadataDocuments);
    return {
      plateCount,
      details: `${plateCount} ${plateCount === 1 ? "plaat" : "platen"} gedetecteerd. Het totale aantal producten blijft ongewijzigd.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    return { error: `Fout bij verwerken van 3MF: ${message}` };
  }
}

export function PlateTracker({
  orderId,
  orderNumber,
  totalProducts,
  totalPlates,
  platePrintStatuses,
  platePrintQuantities,
  plateRunsCompleted,
  onRunRecorded,
  onUpdate,
}: PlateTrackerProps) {
  const { toast } = useToast();
  const [localTotalProducts, setLocalTotalProducts] = useState(String(totalProducts));
  const [localTotalPlates, setLocalTotalPlates] = useState(String(totalPlates));
  const [localStatuses, setLocalStatuses] = useState<boolean[]>(
    normalizePlateStatuses(platePrintStatuses, totalPlates),
  );
  const [localQuantities, setLocalQuantities] = useState<number[]>(
    normalizePlatePrintQuantities(platePrintQuantities, totalPlates),
  );
  const [localCompletedRuns, setLocalCompletedRuns] = useState<number[]>(
    normalizePlateCompletedRuns(plateRunsCompleted, totalPlates, platePrintQuantities),
  );
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [storedThreeMf, setStoredThreeMf] = useState<StoredThreeMf | null>(null);
  const [productionFiles, setProductionFiles] = useState<ProductionThreeMf[]>([]);
  const [plateMappings, setPlateMappings] = useState<ThreeMfPlateMapping[]>([]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingInspection, setPendingInspection] = useState<ThreeMfInspection | null>(null);
  const [editingOrderFile, setEditingOrderFile] = useState<ProductionThreeMf | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [savingSelection, setSavingSelection] = useState(false);
  const [draggedMapping, setDraggedMapping] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [countingPlate, setCountingPlate] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);

  useEffect(() => {
    setLocalTotalProducts(String(totalProducts));
    setLocalTotalPlates(String(totalPlates));
    setLocalStatuses(normalizePlateStatuses(platePrintStatuses, totalPlates));
    setLocalQuantities(normalizePlatePrintQuantities(platePrintQuantities, totalPlates));
    setLocalCompletedRuns(normalizePlateCompletedRuns(plateRunsCompleted, totalPlates, platePrintQuantities));
  }, [platePrintQuantities, platePrintStatuses, plateRunsCompleted, totalPlates, totalProducts]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from("order_files")
        .select("id,storage_path,original_filename,file_purpose")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("print_jobs")
        .select("three_mf_storage_path")
        .eq("order_id", orderId)
        .not("three_mf_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("order_3mf_plate_mappings")
        .select("id,order_file_id,source_plate_number,logical_plate_number,source_file_name,preview_storage_path,colors,runs_required,runs_completed")
        .eq("order_id", orderId)
        .eq("active", true)
        .order("logical_plate_number"),
    ]).then(([fileResult, jobResult, mappingResult]) => {
        if (cancelled) return;
        const threeMfFiles = (fileResult.data || [])
          .filter((item) => item.original_filename.toLowerCase().endsWith(".3mf"))
          .map((item) => ({ id: item.id, storagePath: item.storage_path, filename: item.original_filename }));
        setProductionFiles(threeMfFiles);
        const latest = threeMfFiles[0];
        const legacyPath = jobResult.data?.[0]?.three_mf_storage_path;
        setStoredThreeMf(latest
          ? latest
          : legacyPath ? { id: "legacy", storagePath: legacyPath, filename: legacyPath.split("/").pop() || "model.3mf" } : null);
        setPlateMappings(withLogicalPlateNumbers((mappingResult.data || []).map((mapping) => ({
          id: mapping.id,
          orderFileId: mapping.order_file_id,
          sourcePlateNumber: mapping.source_plate_number,
          logicalPlateNumber: mapping.logical_plate_number || undefined,
          sourceFileName: mapping.source_file_name,
          previewStoragePath: mapping.preview_storage_path,
          colors: Array.isArray(mapping.colors) ? mapping.colors as Array<{ name: string; hex: string }> : [],
          runsRequired: mapping.runs_required,
          runsCompleted: mapping.runs_completed,
        }))));
      });
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => () => disposeThreeMfInspection(pendingInspection), [pendingInspection]);

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
  }, []);

  const parsedPlateTotal = Math.max(0, Number.parseInt(localTotalPlates, 10) || 0);

  useEffect(() => {
    setLocalStatuses((current) => normalizePlateStatuses(current, parsedPlateTotal));
    setLocalQuantities((current) => normalizePlatePrintQuantities(current, parsedPlateTotal));
  }, [parsedPlateTotal]);

  useEffect(() => {
    setLocalCompletedRuns((current) => normalizePlateCompletedRuns(current, parsedPlateTotal, localQuantities));
  }, [localQuantities, parsedPlateTotal]);

  const [editingKnownMappings, setEditingKnownMappings] = useState<ThreeMfPlateMapping[]>([]);

  const inspectForSelection = async (file: File, editing: ProductionThreeMf | null) => {
    setParsing(true);
    setParseError(null);
    try {
      const inspection = await inspectThreeMf(file, { lightweight: true });
      disposeThreeMfInspection(pendingInspection);
      setPendingFile(file);
      setPendingInspection(inspection);
      setEditingOrderFile(editing);
      if (editing) {
        const { data, error } = await supabase.from("order_3mf_plate_mappings")
          .select("id,order_file_id,source_plate_number,logical_plate_number,source_file_name,preview_storage_path,colors,runs_required,runs_completed,active")
          .eq("order_file_id", editing.id);
        if (error) throw error;
        const known = (data || []).map((mapping) => ({
          id: mapping.id,
          orderFileId: mapping.order_file_id,
          sourcePlateNumber: mapping.source_plate_number,
          logicalPlateNumber: mapping.logical_plate_number || undefined,
          sourceFileName: mapping.source_file_name,
          previewStoragePath: mapping.preview_storage_path,
          colors: Array.isArray(mapping.colors) ? mapping.colors as Array<{ name: string; hex: string }> : [],
          runsRequired: mapping.runs_required,
          runsCompleted: mapping.runs_completed,
        }));
        setEditingKnownMappings(known);
        setSelectedSources(new Set((data || []).filter((item) => item.active).map((item) => item.source_plate_number)));
      } else {
        setEditingKnownMappings([]);
        setSelectedSources(new Set());
      }
      setSelectionOpen(true);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Het 3MF-bestand kon niet worden geanalyseerd.";
      setParseError(description);
      toast({ title: "3MF verwerken mislukt", description, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handle3MFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await inspectForSelection(file, null);
  };

  const editProductionFile = async (productionFile: ProductionThreeMf) => {
    setParsing(true);
    const { data, error } = await supabase.storage.from("orders").download(productionFile.storagePath);
    setParsing(false);
    if (error || !data) {
      toast({ title: "3MF openen mislukt", description: error?.message || "Bestand niet gevonden.", variant: "destructive" });
      return;
    }
    await inspectForSelection(new File([data], productionFile.filename, { type: data.type || "model/3mf" }), productionFile);
  };

  const applyMappingResult = (data: unknown) => {
    const result = data as {
      totalPlates: number;
      platePrintStatuses: boolean[];
      plateRunsCompleted: unknown[];
      plateRunsRequired: unknown[];
      platesCompleted: number;
      mappings: ThreeMfPlateMapping[];
    };
    const quantities = normalizePlatePrintQuantities(result.plateRunsRequired, result.totalPlates);
    const completed = normalizePlateCompletedRuns(result.plateRunsCompleted, result.totalPlates, quantities);
    const statuses = normalizePlateStatuses(result.platePrintStatuses, result.totalPlates);
    setLocalTotalPlates(String(result.totalPlates));
    setLocalQuantities(quantities);
    setLocalCompletedRuns(completed);
    setLocalStatuses(statuses);
    setPlateMappings(withLogicalPlateNumbers(result.mappings || []));
    onRunRecorded?.({
      platePrintStatuses: statuses,
      platePrintQuantities: quantities,
      plateRunsCompleted: completed,
      platesCompleted: result.platesCompleted,
    });
  };

  const persistMappings = async (mappings: ThreeMfPlateMapping[]) => {
    const ordered = withLogicalPlateNumbers(mappings);
    const { data, error } = await supabase.rpc("save_order_3mf_plate_selection", {
      p_order_id: orderId,
      p_mappings: ordered.map((mapping) => ({
        orderFileId: mapping.orderFileId,
        sourcePlateNumber: mapping.sourcePlateNumber,
        sourceFileName: mapping.sourceFileName,
        previewStoragePath: mapping.previewStoragePath || null,
        colors: mapping.colors,
        runsRequired: mapping.runsRequired,
      })),
    });
    if (error) throw error;
    applyMappingResult(data);
  };

  const savePlateSelection = async () => {
    const hasSelectedPlatesInOtherFiles = Boolean(editingOrderFile && plateMappings.some((mapping) => mapping.orderFileId !== editingOrderFile.id));
    if (!pendingFile || !pendingInspection || (selectedSources.size === 0 && !hasSelectedPlatesInOtherFiles)) {
      toast({ title: "Selecteer minimaal één plaat", variant: "destructive" });
      return;
    }
    setSavingSelection(true);
    let orderFile = editingOrderFile;
    let uploadedOriginalPath: string | null = null;
    let createdOrderFileId: string | null = null;
    const uploadedPreviewPaths: string[] = [];
    try {
      if (!orderFile) {
        const safeName = pendingFile.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
        uploadedOriginalPath = `${orderNumber}/production/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("orders").upload(uploadedOriginalPath, pendingFile, { upsert: false });
        if (uploadError) throw uploadError;
        const { data, error } = await supabase.from("order_files").insert({
          order_id: orderId,
          storage_path: uploadedOriginalPath,
          original_filename: pendingFile.name,
          file_size: pendingFile.size,
          mime_type: pendingFile.type || "model/3mf",
          customer_visible: false,
          file_purpose: "production_3mf",
        }).select("id,storage_path,original_filename").single();
        if (error) throw error;
        orderFile = { id: data.id, storagePath: data.storage_path, filename: data.original_filename };
        createdOrderFileId = data.id;
      }

      const existingForFile = new Map(editingKnownMappings.map((mapping) => [mapping.sourcePlateNumber, mapping]));
      const selectedForFile: ThreeMfPlateMapping[] = [];
      for (const plate of pendingInspection.plates.filter((item) => selectedSources.has(item.number))) {
        const existing = existingForFile.get(plate.number);
        let previewStoragePath = existing?.previewStoragePath || null;
        if (!previewStoragePath && plate.previewUrl) {
          const previewResponse = await fetch(plate.previewUrl);
          if (previewResponse.ok) {
            const blob = await previewResponse.blob();
            previewStoragePath = `${orderNumber}/selected-plate-previews/${orderFile.id}-plate-${plate.number}-${crypto.randomUUID()}.png`;
            const { error } = await supabase.storage.from("orders").upload(previewStoragePath, blob, { contentType: "image/png", upsert: false });
            if (error) throw error;
            uploadedPreviewPaths.push(previewStoragePath);
          }
        }
        selectedForFile.push({
          ...existing,
          orderFileId: orderFile.id,
          sourcePlateNumber: plate.number,
          sourceFileName: orderFile.filename,
          previewStoragePath,
          colors: pendingInspection.colors,
          runsRequired: Math.max(existing?.runsRequired || 1, existing?.runsCompleted || 0, 1),
          runsCompleted: existing?.runsCompleted || 0,
        });
      }

      const remaining = plateMappings.filter((mapping) => mapping.orderFileId !== orderFile!.id);
      const oldPositions = plateMappings.map((mapping) => mapping.orderFileId);
      const insertionIndex = oldPositions.indexOf(orderFile.id);
      const combined = [...remaining];
      combined.splice(insertionIndex >= 0 ? Math.min(insertionIndex, combined.length) : combined.length, 0, ...selectedForFile);
      await persistMappings(combined);
      setPreviewFile(pendingFile);
      setStoredThreeMf(orderFile);
      setProductionFiles((current) => current.some((file) => file.id === orderFile!.id) ? current : [orderFile!, ...current]);
      setSelectionOpen(false);
      toast({ title: "3MF-platen opgeslagen", description: "Alleen de geselecteerde platen tellen mee voor productie en klantpreview." });
    } catch (error) {
      if (uploadedPreviewPaths.length) await supabase.storage.from("orders").remove(uploadedPreviewPaths);
      if (createdOrderFileId) await supabase.from("order_files").delete().eq("id", createdOrderFileId);
      if (uploadedOriginalPath && !editingOrderFile) await supabase.storage.from("orders").remove([uploadedOriginalPath]);
      toast({ title: "Plaatselectie opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setSavingSelection(false);
    }
  };

  const reorderMappings = async (from: number, to: number) => {
    const next = movePlateMapping(plateMappings, from, to);
    setPlateMappings(next);
    try {
      await persistMappings(next);
    } catch (error) {
      setPlateMappings(plateMappings);
      toast({ title: "Volgorde opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    }
  };

  const recordPlateRun = async (plateIndex: number) => {
    if (countingPlate !== null) return;
    if (localStatuses[plateIndex]) {
      toast({ title: "Plaat al geprint", description: "Deze plaat is volledig geprint; er is niets veranderd." });
      return;
    }

    setCountingPlate(plateIndex);
    try {
      const { data, error } = await supabase.rpc("record_manual_order_plate_run" as never, {
        p_order_id: orderId,
        p_plate_number: plateIndex + 1,
      } as never);
      if (error) throw error;
      const result = data as unknown as {
        counted: boolean;
        reason?: string;
        runsCompleted: number;
        runsRequired: number;
        remaining: number;
        completed: boolean;
        platesCompleted?: number;
        plateRunsCompleted: unknown[];
        platePrintStatuses: boolean[];
        plateRunsRequired: unknown[];
      };
      const nextQuantities = normalizePlatePrintQuantities(result.plateRunsRequired, parsedPlateTotal);
      const nextCompleted = normalizePlateCompletedRuns(result.plateRunsCompleted, parsedPlateTotal, nextQuantities);
      const nextStatuses = normalizePlateStatuses(result.platePrintStatuses, parsedPlateTotal);
      setLocalQuantities(nextQuantities);
      setLocalCompletedRuns(nextCompleted);
      setLocalStatuses(nextStatuses);
      setPlateMappings((current) => current.map((mapping, index) => index === plateIndex
        ? { ...mapping, runsRequired: nextQuantities[index], runsCompleted: nextCompleted[index] }
        : mapping));
      onRunRecorded?.({
        platePrintStatuses: nextStatuses,
        platePrintQuantities: nextQuantities,
        plateRunsCompleted: nextCompleted,
        platesCompleted: nextStatuses.filter(Boolean).length,
      });
      toast(result.counted ? {
        title: `Plaat ${plateIndex + 1}: print geregistreerd`,
        description: result.completed
          ? `Uitvoering ${result.runsCompleted}/${result.runsRequired}. De plaat is volledig geprint.`
          : `Uitvoering ${result.runsCompleted}/${result.runsRequired}. Nog ${result.remaining}× printen.`,
      } : {
        title: "Plaat al geprint",
        description: "Deze plaat is volledig geprint; er is niets veranderd.",
      });
    } catch (error) {
      toast({ title: "Printrun registreren mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setCountingPlate(null);
    }
  };

  const decrementPlateRun = async (plateIndex: number) => {
    if (countingPlate !== null) return;
    setCountingPlate(plateIndex);
    try {
      const { data, error } = await supabase.rpc("decrement_manual_order_plate_run", {
        p_order_id: orderId,
        p_plate_number: plateIndex + 1,
      });
      if (error) throw error;
      const result = data as unknown as {
        decremented: boolean;
        runsCompleted: number;
        runsRequired: number;
        remaining: number;
        platesCompleted?: number;
        plateRunsCompleted: unknown[];
        platePrintStatuses: boolean[];
        plateRunsRequired: unknown[];
      };
      const nextQuantities = normalizePlatePrintQuantities(result.plateRunsRequired, parsedPlateTotal);
      const nextCompleted = normalizePlateCompletedRuns(result.plateRunsCompleted, parsedPlateTotal, nextQuantities);
      const nextStatuses = normalizePlateStatuses(result.platePrintStatuses, parsedPlateTotal);
      setLocalQuantities(nextQuantities);
      setLocalCompletedRuns(nextCompleted);
      setLocalStatuses(nextStatuses);
      setPlateMappings((current) => current.map((mapping, index) => index === plateIndex
        ? { ...mapping, runsRequired: nextQuantities[index], runsCompleted: nextCompleted[index] }
        : mapping));
      onRunRecorded?.({
        platePrintStatuses: nextStatuses,
        platePrintQuantities: nextQuantities,
        plateRunsCompleted: nextCompleted,
        platesCompleted: nextStatuses.filter(Boolean).length,
      });
      toast(result.decremented ? {
        title: `Plaat ${plateIndex + 1}: correctie opgeslagen`,
        description: `Geprint ${result.runsCompleted}/${result.runsRequired}. Nog ${result.remaining}× printen.`,
      } : {
        title: "Geen printrun om af te trekken",
        description: "De teller stond al op nul; er is niets gewijzigd.",
      });
    } catch (error) {
      toast({ title: "Printrun corrigeren mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setCountingPlate(null);
    }
  };

  const startPlateLongPress = (plateIndex: number, pointerType: string) => {
    if (pointerType !== "touch" || countingPlate !== null) return;
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTriggered.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      longPressTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(30);
      void decrementPlateRun(plateIndex);
    }, 650);
  };

  const cancelPlateLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const updateQuantity = (plateIndex: number, value: string) => {
    const quantity = Number(value);
    setLocalQuantities((current) => current.map((item, index) => (
      index === plateIndex && Number.isInteger(quantity) && quantity >= 1 ? quantity : item
    )));
  };

  const handleApply = async () => {
    const products = Number(localTotalProducts);
    const plates = plateMappings.length || Number(localTotalPlates);
    if (!Number.isInteger(products) || products < 0 || !Number.isInteger(plates) || plates < 0) {
      toast({
        title: "Controleer de aantallen",
        description: "Aantal platen en totaal producten moeten gehele, niet-negatieve getallen zijn.",
        variant: "destructive",
      });
      return;
    }

    const update = createPlateTrackingUpdate(products, plates, localStatuses, localQuantities);
    setApplying(true);
    try {
      if (plateMappings.length) {
        await persistMappings(plateMappings.map((mapping, index) => ({
          ...mapping,
          runsRequired: Math.max(localQuantities[index] || 1, mapping.runsCompleted, 1),
        })));
      }
      await onUpdate(update);
      // The database trigger atomically synchronizes these order-level choices
      // to every print job, including runs_completed and completed status.
    } finally {
      setApplying(false);
    }
  };

  const completedPlates = localStatuses.filter(Boolean).length;
  const totalPrintRuns = localQuantities.reduce((sum, quantity) => sum + quantity, 0);
  const progress = parsedPlateTotal > 0 ? (completedPlates / parsedPlateTotal) * 100 : 0;

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold text-primary mb-3">🏭 Productietracking</h4>

      <div className="mb-4">
        <label className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors text-sm">
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          3MF toevoegen en platen kiezen
          <input type="file" accept=".3mf" onChange={handle3MFUpload} className="hidden" disabled={parsing} />
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Platen, kleuren en voorbeelden worden direct lokaal uitgelezen; productaantallen worden nooit uit objecten op een plaat afgeleid.
        </p>
        {parseError && (
          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
        {(storedThreeMf || previewFile) && <Button type="button" variant="outline" className="mt-3" onClick={() => setViewerOpen(true)}><Eye className="w-4 h-4" /> Volledige 3MF-viewer (admin)</Button>}

        {productionFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {productionFiles.map((file) => (
              <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <FileArchive className="h-4 w-4 shrink-0" />
                  <span className="truncate">{file.filename}</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => void editProductionFile(file)} disabled={parsing}>
                  Selectie wijzigen
                </Button>
              </div>
            ))}
          </div>
        )}

        {plateMappings.length > 0 && (
          <div className="mt-4 rounded-xl border p-3">
            <p className="mb-2 text-xs text-muted-foreground">Sleep de geselecteerde platen in de gewenste productievolgorde. Op mobiel gebruikt u de pijlen.</p>
            <div className="space-y-2">
              {plateMappings.map((mapping, index) => (
                <div
                  key={`${mapping.orderFileId}-${mapping.sourcePlateNumber}`}
                  draggable
                  onDragStart={() => setDraggedMapping(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedMapping !== null) void reorderMappings(draggedMapping, index);
                    setDraggedMapping(null);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-muted/60 p-2"
                >
                  <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{mappingLabel(mapping, true)}</p>
                    <p className="truncate text-xs text-muted-foreground">{mapping.sourceFileName} · geprint {mapping.runsCompleted}/{mapping.runsRequired}</p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => void reorderMappings(index, index - 1)} aria-label="Plaat omhoog">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={index === plateMappings.length - 1} onClick={() => void reorderMappings(index, index + 1)} aria-label="Plaat omlaag">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <StoredThreeMfViewerDialog open={viewerOpen} onOpenChange={setViewerOpen} storagePath={storedThreeMf?.storagePath} filename={storedThreeMf?.filename} localFile={previewFile} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Label className="text-xs">Totaal producten</Label>
          <Input
            type="number"
            value={localTotalProducts}
            onChange={(event) => setLocalTotalProducts(event.target.value)}
            min="0"
            step="1"
          />
        </div>
        <div>
          <Label className="text-xs">Aantal platen</Label>
          <Input
            type="number"
            value={localTotalPlates}
            onChange={(event) => setLocalTotalPlates(event.target.value)}
            min="0"
            step="1"
            disabled={plateMappings.length > 0}
          />
          {plateMappings.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Bepaald door de geselecteerde 3MF-platen.</p>}
        </div>
        <div className="flex items-end">
          <Button onClick={handleApply} size="sm" className="w-full" disabled={applying}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Toepassen / opslaan
          </Button>
        </div>
      </div>

      {parsedPlateTotal > 0 ? (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {localTotalProducts || 0} producten totaal · {completedPlates}/{parsedPlateTotal} platen geprint · {totalPrintRuns} printruns nodig
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {localStatuses.map((printed, plateIndex) => (
              <div
                key={plateIndex}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                  printed
                    ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                    : "border-border hover:border-accent/60"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={printed}
                  onPointerDown={(event) => startPlateLongPress(plateIndex, event.pointerType)}
                  onPointerUp={cancelPlateLongPress}
                  onPointerCancel={cancelPlateLongPress}
                  onPointerLeave={cancelPlateLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={(event) => {
                    if (longPressTriggered.current) {
                      longPressTriggered.current = false;
                      event.preventDefault();
                      return;
                    }
                    void (event.ctrlKey ? decrementPlateRun(plateIndex) : recordPlateRun(plateIndex));
                  }}
                  disabled={countingPlate !== null}
                  className="w-full select-none touch-manipulation text-left"
                  title="Klik om één printrun toe te voegen. Ctrl + klik of lang indrukken om één printrun af te trekken."
                >
                  <span className="flex items-center justify-between">
                    Plaat {plateIndex + 1}
                    {countingPlate === plateIndex ? <Loader2 className="w-4 h-4 animate-spin" /> : printed && <Check className="w-4 h-4" />}
                  </span>
                  <span className="block text-xs mt-1">
                    Geprint {localCompletedRuns[plateIndex] ?? 0}/{localQuantities[plateIndex] ?? 1}
                    {printed ? " · Voltooid" : ` · nog ${Math.max(0, (localQuantities[plateIndex] ?? 1) - (localCompletedRuns[plateIndex] ?? 0))}×`}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">Ctrl + klik of lang indrukken: 1 aftrekken</span>
                </button>
                <Label htmlFor={`plate-quantity-${plateIndex}`} className="block text-xs mt-3 mb-1">
                  Hoe vaak printen
                </Label>
                <Input
                  id={`plate-quantity-${plateIndex}`}
                  type="number"
                  min="1"
                  step="1"
                  value={localQuantities[plateIndex] ?? 1}
                  onChange={(event) => updateQuantity(plateIndex, event.target.value)}
                  className="h-8"
                  aria-label={`Aantal keer plaat ${plateIndex + 1} printen`}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Vul het aantal platen in om platen af te vinken.</p>
      )}

      <Dialog open={selectionOpen} onOpenChange={(open) => {
        if (savingSelection) return;
        setSelectionOpen(open);
        if (!open) {
          disposeThreeMfInspection(pendingInspection);
          setPendingInspection(null);
          setPendingFile(null);
          setEditingOrderFile(null);
        }
      }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Selecteer productieplaten</DialogTitle>
            <DialogDescription>
              Alleen aangevinkte platen tellen mee. Klanten zien uitsluitend de previews van deze platen en nooit het oorspronkelijke 3MF-bestand.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingInspection?.plates.map((plate) => {
              const selected = selectedSources.has(plate.number);
              return (
                <button
                  type="button"
                  key={plate.number}
                  onClick={() => setSelectedSources((current) => {
                    const next = new Set(current);
                    if (next.has(plate.number)) next.delete(plate.number); else next.add(plate.number);
                    return next;
                  })}
                  className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                >
                  <div className="aspect-video bg-muted">
                    {plate.previewUrl
                      ? <img src={plate.previewUrl} alt={`Preview plaat ${plate.number}`} className="h-full w-full object-contain" />
                      : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Geen preview in 3MF</div>}
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div>
                      <p className="font-semibold">Plaat {plate.number} in bestand</p>
                      <p className="truncate text-xs text-muted-foreground">{plate.fileName}</p>
                    </div>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <p className="mr-auto self-center text-sm text-muted-foreground">{selectedSources.size} plaat/platen geselecteerd</p>
            <Button type="button" variant="outline" onClick={() => setSelectionOpen(false)} disabled={savingSelection}><X className="h-4 w-4" /> Annuleren</Button>
            <Button type="button" onClick={() => void savePlateSelection()} disabled={savingSelection || (selectedSources.size === 0 && !(editingOrderFile && plateMappings.some((mapping) => mapping.orderFileId !== editingOrderFile.id)))}>
              {savingSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Selectie opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
