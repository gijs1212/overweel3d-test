import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlateTrackerProps {
  partsTotal: number;
  partsPerPlate: number;
  plateRunsRequired: number;
  plateRunsCompleted: number[]; // array tracking how many times each plate was completed
  onUpdate: (data: {
    partsTotal: number;
    partsPerPlate: number;
    plateRunsRequired: number;
    plateRunsCompleted: number[];
    platesCompleted: number;
  }) => void;
}

/**
 * Parse a 3MF file locally (ZIP containing XML) to extract part count info.
 * 3MF is a ZIP with model/3dmodel.model XML - we count <object> elements and <item> elements.
 */
async function parse3MFForPlateInfo(file: File): Promise<{ objectCount: number; itemCount: number } | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Simple ZIP parser to find 3dmodel.model
    const xmlContent = await extractXMLFrom3MF(bytes);
    if (!xmlContent) return null;

    // Count <object> tags (unique parts) and <item> tags (instances on plate)
    const objectMatches = xmlContent.match(/<object\s/gi);
    const itemMatches = xmlContent.match(/<item\s/gi);
    const objectCount = objectMatches?.length || 0;
    const itemCount = itemMatches?.length || 0;

    return { objectCount, itemCount: itemCount || objectCount };
  } catch (e) {
    console.error("3MF parse error:", e);
    return null;
  }
}

async function extractXMLFrom3MF(bytes: Uint8Array): Promise<string | null> {
  // ZIP local file header signature: PK\x03\x04
  const textDecoder = new TextDecoder();
  let offset = 0;
  
  while (offset < bytes.length - 4) {
    if (bytes[offset] === 0x50 && bytes[offset+1] === 0x4b && bytes[offset+2] === 0x03 && bytes[offset+3] === 0x04) {
      const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
      const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
      const compressionMethod = bytes[offset + 8] | (bytes[offset + 9] << 8);
      const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
      const fileName = textDecoder.decode(nameBytes);
      
      const dataStart = offset + 30 + nameLen + extraLen;
      
      if (fileName.toLowerCase().includes("3dmodel.model")) {
        const fileData = bytes.slice(dataStart, dataStart + compressedSize);
        
        if (compressionMethod === 0) {
          // Stored (no compression)
          return textDecoder.decode(fileData);
        } else if (compressionMethod === 8) {
          // Deflate - use DecompressionStream
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
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }
  return null;
}

export function PlateTracker({ partsTotal, partsPerPlate, plateRunsRequired, plateRunsCompleted, onUpdate }: PlateTrackerProps) {
  const { toast } = useToast();
  const [localPartsTotal, setLocalPartsTotal] = useState(String(partsTotal));
  const [localPartsPerPlate, setLocalPartsPerPlate] = useState(String(partsPerPlate));
  const [localRunsRequired, setLocalRunsRequired] = useState(String(plateRunsRequired));
  const [localCompleted, setLocalCompleted] = useState<number[]>(plateRunsCompleted);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    setLocalPartsTotal(String(partsTotal));
    setLocalPartsPerPlate(String(partsPerPlate));
    setLocalRunsRequired(String(plateRunsRequired));
    setLocalCompleted(plateRunsCompleted);
  }, [partsTotal, partsPerPlate, plateRunsRequired, plateRunsCompleted]);

  const totalPlates = Math.ceil((parseInt(localPartsTotal) || 0) / (parseInt(localPartsPerPlate) || 1));
  const runsReq = parseInt(localRunsRequired) || 1;

  // Ensure completed array matches plate count
  useEffect(() => {
    if (localCompleted.length !== totalPlates) {
      const newCompleted = Array.from({ length: totalPlates }, (_, i) => localCompleted[i] || 0);
      setLocalCompleted(newCompleted);
    }
  }, [totalPlates]);

  const handle3MFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const result = await parse3MFForPlateInfo(file);
      if (result) {
        setLocalPartsPerPlate(String(result.itemCount));
        toast({ title: `3MF verwerkt: ${result.itemCount} onderdelen per plaat, ${result.objectCount} unieke objecten` });
      } else {
        toast({ title: "Kon 3MF niet verwerken", description: "Voer de waarden handmatig in.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fout bij verwerken 3MF", variant: "destructive" });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const togglePlateRun = (plateIndex: number) => {
    const newCompleted = [...localCompleted];
    if (newCompleted[plateIndex] < runsReq) {
      newCompleted[plateIndex] = (newCompleted[plateIndex] || 0) + 1;
    } else {
      newCompleted[plateIndex] = 0; // Reset
    }
    setLocalCompleted(newCompleted);
  };

  const totalCompletedRuns = localCompleted.reduce((s, c) => s + c, 0);
  const totalRequiredRuns = totalPlates * runsReq;
  const totalPartsCompleted = localCompleted.reduce((sum, runs, i) => {
    const ppp = parseInt(localPartsPerPlate) || 1;
    return sum + Math.min(runs, runsReq) * ppp;
  }, 0);
  const actualPartsCompleted = Math.min(totalPartsCompleted, parseInt(localPartsTotal) || 0);
  const fullyCompletedPlates = localCompleted.filter(c => c >= runsReq).length;

  const handleApply = () => {
    onUpdate({
      partsTotal: parseInt(localPartsTotal) || 0,
      partsPerPlate: parseInt(localPartsPerPlate) || 1,
      plateRunsRequired: runsReq,
      plateRunsCompleted: localCompleted,
      platesCompleted: fullyCompletedPlates,
    });
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
          <Label className="text-xs">Runs per plaat</Label>
          <Input type="number" value={localRunsRequired} onChange={e => setLocalRunsRequired(e.target.value)} min="1" />
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
              const isComplete = runs >= runsReq;
              return (
                <button
                  key={i}
                  onClick={() => togglePlateRun(i)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    isComplete
                      ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                      : runs > 0
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Plaat {i + 1}</span>
                    {isComplete && <Check className="w-4 h-4" />}
                  </div>
                  <div className="text-xs mt-1">
                    {runs}/{runsReq} runs
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
