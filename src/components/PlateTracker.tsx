import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  createPlateTrackingUpdate,
  detectBambuPlateCount,
  normalizePlatePrintQuantities,
  normalizePlateStatuses,
} from "@/lib/plateTracking";

interface PlateTrackerProps {
  totalProducts: number;
  totalPlates: number;
  platePrintStatuses: boolean[];
  platePrintQuantities: number[];
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
  totalProducts,
  totalPlates,
  platePrintStatuses,
  platePrintQuantities,
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
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setLocalTotalProducts(String(totalProducts));
    setLocalTotalPlates(String(totalPlates));
    setLocalStatuses(normalizePlateStatuses(platePrintStatuses, totalPlates));
    setLocalQuantities(normalizePlatePrintQuantities(platePrintQuantities, totalPlates));
  }, [platePrintQuantities, platePrintStatuses, totalPlates, totalProducts]);

  const parsedPlateTotal = Math.max(0, Number.parseInt(localTotalPlates, 10) || 0);

  useEffect(() => {
    setLocalStatuses((current) => normalizePlateStatuses(current, parsedPlateTotal));
    setLocalQuantities((current) => normalizePlatePrintQuantities(current, parsedPlateTotal));
  }, [parsedPlateTotal]);

  const handle3MFUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);

    const result = await parse3MFForPlateInfo(file);
    if ("error" in result) {
      setParseError(result.error);
      toast({ title: "3MF verwerken mislukt", description: result.error, variant: "destructive" });
    } else {
      setLocalTotalPlates(String(result.plateCount));
      toast({ title: "3MF verwerkt", description: result.details });
    }

    setParsing(false);
    event.target.value = "";
  };

  const togglePlate = (plateIndex: number) => {
    setLocalStatuses((current) =>
      current.map((printed, index) => index === plateIndex ? !printed : printed),
    );
  };

  const updateQuantity = (plateIndex: number, value: string) => {
    const quantity = Number(value);
    setLocalQuantities((current) => current.map((item, index) => (
      index === plateIndex && Number.isInteger(quantity) && quantity >= 1 ? quantity : item
    )));
  };

  const handleApply = async () => {
    const products = Number(localTotalProducts);
    const plates = Number(localTotalPlates);
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
      await onUpdate(update);
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
          3MF inladen (Bambu Studio)
          <input type="file" accept=".3mf" onChange={handle3MFUpload} className="hidden" disabled={parsing} />
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Alleen het aantal Bambu-platen wordt lokaal gelezen; productaantallen worden nooit uit objecten op een plaat afgeleid.
        </p>
        {parseError && (
          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{parseError}</p>
          </div>
        )}
      </div>

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
          />
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
                  onClick={() => togglePlate(plateIndex)}
                  className="w-full text-left"
                >
                  <span className="flex items-center justify-between">
                    Plaat {plateIndex + 1}
                    {printed && <Check className="w-4 h-4" />}
                  </span>
                  <span className="block text-xs mt-1">{printed ? "Volledig geprint" : "Nog niet klaar"}</span>
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
    </div>
  );
}
