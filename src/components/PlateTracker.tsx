import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Upload } from "lucide-react";
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
  }) => void;
}

async function parse3MFForPlateInfo(file: File): Promise<{ objectCount: number; itemCount: number; error?: string } | { error: string }> {
  try {
    if (!file.name.toLowerCase().endsWith(".3mf")) {
      return { error: "Bestand is geen .3mf bestand" };
    }
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 22) {
      return { error: "Bestand is te klein om een geldig 3MF (ZIP) te zijn" };
    }
    const bytes = new Uint8Array(buffer);
    
    // Check ZIP magic bytes
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return { error: "Bestand is geen geldig ZIP/3MF bestand (verkeerde magic bytes)" };
    }
    
    const xmlContent = await extractXMLFrom3MF(bytes);
    if (!xmlContent) {
      return { error: "Kon 3dmodel.model niet vinden in het 3MF bestand. Mogelijk is het bestand beschadigd of bevat het geen 3D-model." };
    }
    const objectMatches = xmlContent.match(/<object\s/gi);
    const itemMatches = xmlContent.match(/<item\s/gi);
    const objectCount = objectMatches?.length || 0;
    const itemCount = itemMatches?.length || 0;
    if (objectCount === 0 && itemCount === 0) {
      return { error: "Geen objecten gevonden in het 3MF model. Het bestand bevat mogelijk geen mesh data." };
    }
    return { objectCount, itemCount: itemCount || objectCount };
  } catch (e: any) {
    console.error("3MF parse error:", e);
    return { error: `Fout bij verwerken: ${e?.message || "Onbekende fout"}` };
  }
}

async function extractXMLFrom3MF(bytes: Uint8Array): Promise<string | null> {
  const textDecoder = new TextDecoder();
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) return null;
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
    const fileName = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));
    if (fileName.toLowerCase().includes("3dmodel.model")) {
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const fileData = bytes.slice(dataStart, dataStart + compressedSize);
      if (compressionMethod === 0) {
        return textDecoder.decode(fileData);
      } else if (compressionMethod === 8) {
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
        } catch {
          return null;
        }
      }
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function PlateTracker({ partsTotal, partsPerPlate, defaultRunsRequired, runsRequiredPerPlate, plateRunsCompleted, onUpdate }: PlateTrackerProps) {
  const { toast } = useToast();
  const [localPartsTotal, setLocalPartsTotal] = useState(String(partsTotal));
  const [localPartsPerPlate, setLocalPartsPerPlate] = useState(String(partsPerPlate));
  const [localDefaultRuns, setLocalDefaultRuns] = useState(String(defaultRunsRequired));
  const [localRunsPerPlate, setLocalRunsPerPlate] = useState<number[]>(runsRequiredPerPlate);
  const [localCompleted, setLocalCompleted] = useState<number[]>(plateRunsCompleted);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    setLocalPartsTotal(String(partsTotal));
    setLocalPartsPerPlate(String(partsPerPlate));
    setLocalDefaultRuns(String(defaultRunsRequired));
    setLocalRunsPerPlate(runsRequiredPerPlate);
    setLocalCompleted(plateRunsCompleted);
  }, [partsTotal, partsPerPlate, defaultRunsRequired, runsRequiredPerPlate, plateRunsCompleted]);

  const totalPlates = Math.ceil((parseInt(localPartsTotal) || 0) / (parseInt(localPartsPerPlate) || 1));
  const defaultRuns = parseInt(localDefaultRuns) || 1;

  // Get required runs for a specific plate
  const getRunsRequired = (plateIndex: number) => {
    return localRunsPerPlate[plateIndex] || defaultRuns;
  };

  // Ensure arrays match plate count
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
    try {
      const result = await parse3MFForPlateInfo(file);
      if ('itemCount' in result) {
        setLocalPartsPerPlate(String(result.itemCount));
        toast({ title: `3MF verwerkt: ${result.itemCount} onderdelen per plaat, ${result.objectCount} unieke objecten` });
      } else {
        toast({ title: "3MF fout", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Fout bij verwerken 3MF", description: err?.message || "Onbekende fout", variant: "destructive" });
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
    const ppp = parseInt(localPartsPerPlate) || 1;
    const req = getRunsRequired(i);
    return sum + Math.min(runs, req) * ppp;
  }, 0);
  const actualPartsCompleted = Math.min(totalPartsCompleted, parseInt(localPartsTotal) || 0);
  const fullyCompletedPlates = localCompleted.filter((c, i) => c >= getRunsRequired(i)).length;

  const handleApply = () => {
    onUpdate({
      partsTotal: parseInt(localPartsTotal) || 0,
      partsPerPlate: parseInt(localPartsPerPlate) || 1,
      defaultRunsRequired: defaultRuns,
      runsRequiredPerPlate: localRunsPerPlate,
      plateRunsCompleted: localCompleted,
      platesCompleted: fullyCompletedPlates,
    });
  };

  // Apply default to all plates
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
          3MF inladen voor plaatinfo
          <input type="file" accept=".3mf" onChange={handle3MFUpload} className="hidden" />
        </label>
        <p className="text-xs text-muted-foreground mt-1">Het 3MF bestand wordt lokaal verwerkt en niet geüpload.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div>
          <Label className="text-xs">Totaal onderdelen</Label>
          <Input type="number" value={localPartsTotal} onChange={e => setLocalPartsTotal(e.target.value)} min="0" />
        </div>
        <div>
          <Label className="text-xs">Per plaat</Label>
          <Input type="number" value={localPartsPerPlate} onChange={e => setLocalPartsPerPlate(e.target.value)} min="1" />
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
          <Button onClick={handleApply} size="sm" className="w-full">Toepassen</Button>
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
