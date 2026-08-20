import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Upload, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlateTrackerProps {
  partsTotal: number;
  partsPerPlate: number;
  defaultRunsRequired: number;
  runsRequiredPerPlate: number[];
  plateRunsCompleted: number[];
  onUpdate: (data: {
    partsTotal: number;
    partsPerPlate: number;
    defaultRunsRequired: number;
    runsRequiredPerPlate: number[];
    plateRunsCompleted: number[];
    platesCompleted: number;
  }) => void | Promise<void>;
}

interface Parse3MFResult {
  objectCount: number;
  itemCount: number;
  plateCount: number;
  details: string;
}

/**
 * Parse Bambu Studio 3MF files.
 * Bambu Studio stores plate/build-plate info in Metadata/plate_N.gcode or
 * in the 3dmodel.model XML. It also has a project settings file.
 * The key insight: Bambu uses <object> for unique meshes and <item> for instances on the plate.
 * Multiple plates are stored as separate model files or via Metadata/model_settings.config
 */
async function parse3MFForPlateInfo(file: File): Promise<Parse3MFResult | { error: string }> {
  try {
    if (!file.name.toLowerCase().endsWith(".3mf")) {
      return { error: "Bestand is geen .3mf bestand. Selecteer een bestand met de extensie .3mf." };
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 22) {
      return { error: `Bestand is te klein (${buffer.byteLength} bytes) om een geldig 3MF/ZIP te zijn. Minimaal 22 bytes nodig.` };
    }

    const bytes = new Uint8Array(buffer);

    // Check ZIP magic bytes
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      const got = `0x${bytes[0].toString(16).padStart(2, '0')} 0x${bytes[1].toString(16).padStart(2, '0')}`;
      return { error: `Bestand is geen geldig ZIP/3MF (verwacht 0x50 0x4b, kreeg ${got}). Mogelijk is het bestand beschadigd of geen 3MF.` };
    }

    const allFiles = await listZipEntries(bytes);
    const fileNames = allFiles.map(f => f.name);

    // Try to find Bambu Studio model_settings.config for plate info
    let plateCount = 1;
    let bambuDetails = "";

    const modelSettingsEntry = allFiles.find(f =>
      f.name.toLowerCase().includes("model_settings.config") ||
      f.name.toLowerCase().includes("metadata/model_settings")
    );

    if (modelSettingsEntry) {
      const content = await extractFileContent(bytes, modelSettingsEntry);
      if (content) {
        // Count plates from Bambu model_settings
        const plateMatches = content.match(/<plate\s/gi);
        if (plateMatches && plateMatches.length > 0) {
          plateCount = plateMatches.length;
          bambuDetails += `Bambu Studio project: ${plateCount} plaat/platen gevonden in model_settings.config. `;
        }

        // Count objects assigned to plates
        const objectMatches = content.match(/<object\s/gi);
        if (objectMatches) {
          bambuDetails += `${objectMatches.length} objecten in project. `;
        }
      }
    }

    // Bambu slice_info.config also lists one <plate> per build plate
    const sliceInfoEntry = allFiles.find(f => f.name.toLowerCase().includes("slice_info.config"));
    if (sliceInfoEntry) {
      const content = await extractFileContent(bytes, sliceInfoEntry);
      const matches = content?.match(/<plate>/gi);
      if (matches && matches.length > plateCount) {
        plateCount = matches.length;
        bambuDetails += `${matches.length} platen in slice_info.config. `;
      }
    }

    // Also check for plate gcode/thumbnail files (Bambu pattern: Metadata/plate_1.gcode)
    const plateGcodeFiles = fileNames.filter(f =>
      /metadata\/plate_(\d+)\.(gcode|json|png)$/i.test(f)
    );
    if (plateGcodeFiles.length > 0 && plateGcodeFiles.length > plateCount) {
      plateCount = plateGcodeFiles.length;
      bambuDetails += `${plateGcodeFiles.length} plate gcode bestanden gevonden. `;
    }

    // Parse the main 3D model XML
    const modelEntry = allFiles.find(f =>
      f.name.toLowerCase().includes("3dmodel.model") ||
      f.name.toLowerCase() === "3d/3dmodel.model"
    );

    if (!modelEntry) {
      // List available files for debugging
      const availableFiles = fileNames.slice(0, 10).join(", ");
      return {
        error: `Kon 3dmodel.model niet vinden in het 3MF bestand. Gevonden bestanden: ${availableFiles}${fileNames.length > 10 ? ` (en ${fileNames.length - 10} meer)` : ""}. Mogelijk is het bestand beschadigd.`
      };
    }

    const xmlContent = await extractFileContent(bytes, modelEntry);
    if (!xmlContent) {
      return { error: "Kon de inhoud van 3dmodel.model niet lezen. Het bestand is mogelijk beschadigd of gebruikt een niet-ondersteunde compressie." };
    }

    const objectMatches = xmlContent.match(/<object\s/gi);
    const itemMatches = xmlContent.match(/<item\s/gi);
    const objectCount = objectMatches?.length || 0;
    const itemCount = itemMatches?.length || 0;

    if (objectCount === 0 && itemCount === 0) {
      return { error: "Geen 3D-objecten gevonden in het model. Het bestand bevat mogelijk geen mesh data. Controleer of het bestand correct is opgeslagen vanuit Bambu Studio." };
    }

    const details = `${bambuDetails}${plateCount} plaat/platen gedetecteerd · ${objectCount} unieke objecten, ${itemCount || objectCount} items.`;

    return {
      objectCount,
      itemCount: itemCount || objectCount,
      plateCount,
      details,
    };
  } catch (e: any) {
    console.error("3MF parse error:", e);
    return { error: `Fout bij verwerken van 3MF: ${e?.message || "Onbekende fout"}. Probeer het bestand opnieuw op te slaan vanuit Bambu Studio.` };
  }
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const textDecoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  // Find End of Central Directory
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return entries;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 10, true);

  let offset = cdOffset;
  for (let e = 0; e < cdEntries; e++) {
    if (offset + 46 > bytes.length) break;
    if (bytes[offset] !== 0x50 || bytes[offset+1] !== 0x4b || bytes[offset+2] !== 0x01 || bytes[offset+3] !== 0x02) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));

    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extractFileContent(bytes: Uint8Array, entry: ZipEntry): Promise<string | null> {
  const textDecoder = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const localNameLen = view.getUint16(entry.localHeaderOffset + 26, true);
  const localExtraLen = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + localNameLen + localExtraLen;
  const fileData = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return textDecoder.decode(fileData);
  } else if (entry.compressionMethod === 8) {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      writer.write(fileData);
      writer.close();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const result = new Uint8Array(totalLen);
      let pos = 0;
      for (const chunk of chunks) {
        result.set(chunk, pos);
        pos += chunk.length;
      }
      return textDecoder.decode(result);
    } catch (e) {
      console.error("Decompression error for", entry.name, e);
      return null;
    }
  }
  return null;
}

export function PlateTracker({ partsTotal, partsPerPlate, defaultRunsRequired, runsRequiredPerPlate, plateRunsCompleted, onUpdate }: PlateTrackerProps) {
  const { toast } = useToast();
  const [localPartsTotal, setLocalPartsTotal] = useState(String(partsTotal));
  const [localPlateCount, setLocalPlateCount] = useState(
    String(Math.max(1, partsPerPlate > 0 ? Math.ceil((partsTotal || 0) / partsPerPlate) : 1))
  );
  const [localDefaultRuns, setLocalDefaultRuns] = useState(String(defaultRunsRequired));
  const [localRunsPerPlate, setLocalRunsPerPlate] = useState<number[]>(runsRequiredPerPlate);
  const [localCompleted, setLocalCompleted] = useState<number[]>(plateRunsCompleted);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setLocalPartsTotal(String(partsTotal));
    setLocalPlateCount(String(Math.max(1, partsPerPlate > 0 ? Math.ceil((partsTotal || 0) / partsPerPlate) : 1)));
    setLocalDefaultRuns(String(defaultRunsRequired));
    setLocalRunsPerPlate(runsRequiredPerPlate);
    setLocalCompleted(plateRunsCompleted);
  }, [partsTotal, partsPerPlate, defaultRunsRequired, runsRequiredPerPlate, plateRunsCompleted]);

  const totalPlates = Math.max(0, parseInt(localPlateCount) || 0);
  const partsPerPlateDerived = totalPlates > 0 ? Math.ceil((parseInt(localPartsTotal) || 0) / totalPlates) : 1;
  const defaultRuns = parseInt(localDefaultRuns) || 1;

  const getRunsRequired = (plateIndex: number) => {
    return localRunsPerPlate[plateIndex] || defaultRuns;
  };

  useEffect(() => {
    if (localCompleted.length !== totalPlates) {
      setLocalCompleted(Array.from({ length: totalPlates }, (_, i) => localCompleted[i] || 0));
    }
    if (localRunsPerPlate.length !== totalPlates) {
      setLocalRunsPerPlate(Array.from({ length: totalPlates }, (_, i) => localRunsPerPlate[i] || defaultRuns));
    }
  }, [totalPlates]);

  const handle3MFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await parse3MFForPlateInfo(file);
      if ('error' in result) {
        setParseError(result.error);
        toast({ title: "3MF fout", description: result.error, variant: "destructive" });
      } else {
        setLocalPlateCount(String(Math.max(1, result.plateCount)));
        setParseError(null);
        toast({
          title: `3MF verwerkt ✅`,
          description: result.details,
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Onbekende fout";
      setParseError(msg);
      toast({ title: "Fout bij verwerken 3MF", description: msg, variant: "destructive" });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const togglePlateRun = (plateIndex: number) => {
    const newCompleted = [...localCompleted];
    const req = getRunsRequired(plateIndex);
    if (newCompleted[plateIndex] < req) {
      newCompleted[plateIndex] = (newCompleted[plateIndex] || 0) + 1;
    } else {
      newCompleted[plateIndex] = 0;
    }
    setLocalCompleted(newCompleted);
  };

  const updatePlateRunsRequired = (plateIndex: number, value: number) => {
    const newRuns = [...localRunsPerPlate];
    newRuns[plateIndex] = Math.max(1, value);
    setLocalRunsPerPlate(newRuns);
  };

  const totalCompletedRuns = localCompleted.reduce((s, c) => s + c, 0);
  const totalRequiredRuns = Array.from({ length: totalPlates }, (_, i) => getRunsRequired(i)).reduce((s, r) => s + r, 0);
  const totalPartsCompleted = localCompleted.reduce((sum, runs, i) => {
    const ppp = partsPerPlateDerived;
    const req = getRunsRequired(i);
    return sum + Math.min(runs, req) * ppp;
  }, 0);
  const actualPartsCompleted = Math.min(totalPartsCompleted, parseInt(localPartsTotal) || 0);
  const fullyCompletedPlates = localCompleted.filter((c, i) => c >= getRunsRequired(i)).length;

  const handleApply = async () => {
    setApplying(true);
    try {
      await onUpdate({
        partsTotal: parseInt(localPartsTotal) || 0,
        partsPerPlate: partsPerPlateDerived,
        defaultRunsRequired: defaultRuns,
        runsRequiredPerPlate: localRunsPerPlate,
        plateRunsCompleted: localCompleted,
        platesCompleted: fullyCompletedPlates,
      });
    } finally {
      setApplying(false);
    }
  };

  const applyDefaultToAll = () => {
    setLocalRunsPerPlate(Array.from({ length: totalPlates }, () => defaultRuns));
  };

  return (
    <div className="border-t border-border pt-4">
      <h4 className="font-semibold text-primary mb-3">🏭 Productie tracking</h4>
      
      {/* 3MF upload */}
      <div className="mb-4">
        <label className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors text-sm">
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          3MF inladen (Bambu Studio)
          <input type="file" accept=".3mf" onChange={handle3MFUpload} className="hidden" />
        </label>
        <p className="text-xs text-muted-foreground mt-1">Het 3MF bestand wordt lokaal verwerkt en niet geüpload. Ondersteunt Bambu Studio projectbestanden.</p>
        
        {parseError && (
          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <Label className="text-xs">Totaal onderdelen</Label>
          <Input type="number" value={localPartsTotal} onChange={e => setLocalPartsTotal(e.target.value)} min="0" />
        </div>
        <div>
          <Label className="text-xs">Aantal platen</Label>
          <Input type="number" value={localPlateCount} onChange={e => setLocalPlateCount(e.target.value)} min="1" />
          <p className="text-[10px] text-muted-foreground mt-1">≈ {partsPerPlateDerived} onderdelen per plaat</p>
        </div>
        <div>
          <Label className="text-xs">Standaard runs per plaat</Label>
          <div className="flex gap-1">
            <Input type="number" value={localDefaultRuns} onChange={e => setLocalDefaultRuns(e.target.value)} min="1" />
            <Button onClick={applyDefaultToAll} size="sm" variant="outline" className="whitespace-nowrap text-xs" title="Pas standaard toe op alle platen">
              Alles
            </Button>
          </div>
        </div>
        <div className="flex items-end">
          <Button onClick={handleApply} size="sm" className="w-full" disabled={applying}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Toepassen
          </Button>
        </div>
      </div>

      {/* Plate overview */}
      {totalPlates > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground mb-2">
            📊 {actualPartsCompleted}/{localPartsTotal} onderdelen · {totalCompletedRuns}/{totalRequiredRuns} runs · {fullyCompletedPlates}/{totalPlates} platen klaar
          </div>

          <div className="w-full bg-muted rounded-full h-3 overflow-hidden mb-3">
            <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${(actualPartsCompleted / (parseInt(localPartsTotal) || 1)) * 100}%` }} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {Array.from({ length: totalPlates }, (_, i) => {
              const runs = localCompleted[i] || 0;
              const req = getRunsRequired(i);
              const isComplete = runs >= req;
              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    isComplete
                      ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                      : runs > 0
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span>Plaat {i + 1}</span>
                    {isComplete && <Check className="w-4 h-4" />}
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Nodig:</Label>
                    <Input
                      type="number"
                      value={req}
                      onChange={e => updatePlateRunsRequired(i, parseInt(e.target.value) || 1)}
                      min="1"
                      className="h-6 text-xs px-1 w-14"
                    />
                  </div>
                  <button
                    onClick={() => togglePlateRun(i)}
                    className="w-full text-xs mt-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                  >
                    {runs}/{req} runs ✓
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
