import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Box, ChevronLeft, ChevronRight, Loader2, Palette } from "lucide-react";

import { ModelViewer } from "@/components/ModelViewer";
import { Button } from "@/components/ui/button";
import {
  disposeThreeMfInspection,
  inspectThreeMf,
  type ThreeMfInspection,
} from "@/lib/threeMfInspector";

interface ThreeMfOrderPreviewProps {
  file: File;
}

export function ThreeMfOrderPreview({ file }: ThreeMfOrderPreviewProps) {
  const [inspection, setInspection] = useState<ThreeMfInspection | null>(null);
  const [plateIndex, setPlateIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [interactiveRequested, setInteractiveRequested] = useState(false);
  const [mobileMode] = useState(() => typeof window !== "undefined" && (
    window.matchMedia?.("(max-width: 767px), (pointer: coarse)").matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  ));

  useEffect(() => {
    let cancelled = false;
    let createdInspection: ThreeMfInspection | null = null;

    setInspection(null);
    setPlateIndex(0);
    setError(null);
    setInteractiveRequested(false);
    void inspectThreeMf(file, { lightweight: mobileMode })
      .then((result) => {
        if (cancelled) {
          disposeThreeMfInspection(result);
          return;
        }
        createdInspection = result;
        setInspection(result);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Het 3MF-bestand kon niet worden geanalyseerd.");
        }
      });

    return () => {
      cancelled = true;
      disposeThreeMfInspection(createdInspection);
    };
  }, [file, mobileMode]);

  const plate = useMemo(
    () => inspection?.plates[plateIndex] || inspection?.plates[0],
    [inspection, plateIndex],
  );

  const selectPlate = (offset: number) => {
    if (!inspection?.plates.length) return;
    setPlateIndex((current) => (current + offset + inspection.plates.length) % inspection.plates.length);
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        3MF-informatie laden mislukt: {error}
      </div>
    );
  }

  if (!inspection || !plate) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 rounded-xl border bg-background/60 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 3MF-bestand analyseren…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-background p-4">
      <div>
        <h4 className="font-semibold text-primary">3MF-informatie</h4>
        {inspection.modelDetailsAvailable ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {inspection.meshCount} modellen · {inspection.triangleCount.toLocaleString("nl-NL")} driehoeken ·{" "}
            {inspection.dimensions.width.toFixed(1)} × {inspection.dimensions.depth.toFixed(1)} × {inspection.dimensions.height.toFixed(1)} mm
          </p>
        ) : <p className="mt-1 text-xs text-muted-foreground">Mobiele, geheugenzuinige plaatweergave</p>}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Palette className="h-4 w-4 text-accent" /> Kleuren in dit bestand
        </p>
        {inspection.colors.length ? (
          <div className="flex flex-wrap gap-2">
            {inspection.colors.map((color) => (
              <span key={`${color.name}-${color.hex}`} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs">
                <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: color.hex }} />
                <span>{color.name}</span>
                <span className="text-muted-foreground">{color.hex}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">In dit bestand zijn geen afzonderlijke filamentkleuren gevonden.</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="icon" onClick={() => selectPlate(-1)} disabled={inspection.plates.length < 2} aria-label="Vorige plaat">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="font-medium">{plate.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            Plaat {plateIndex + 1} van {inspection.plates.length} · {plate.fileName}
          </p>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => selectPlate(1)} disabled={inspection.plates.length < 2} aria-label="Volgende plaat">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {plate.previewUrl ? (
        <img
          src={plate.previewUrl}
          alt={`Kleurenvoorbeeld van ${plate.name}`}
          className="max-h-[480px] w-full rounded-xl bg-slate-950 object-contain"
        />
      ) : mobileMode && !interactiveRequested ? (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border bg-muted/30 p-5 text-center">
          <Box className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Voor deze plaat is geen afbeelding opgeslagen.</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">Laad de interactieve 3D-weergave alleen wanneer u die nodig hebt. Dit kan bij grote 3MF-bestanden even duren.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => setInteractiveRequested(true)}>Interactieve 3D-weergave laden</Button>
        </div>
      ) : (
        <ModelViewer file={file} filename={file.name} height={mobileMode ? 240 : 320} />
      )}
    </div>
  );
}
