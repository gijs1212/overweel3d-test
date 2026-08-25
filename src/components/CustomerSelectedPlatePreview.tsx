import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CustomerPlatePreview {
  logicalPlateNumber: number;
  previewUrl: string | null;
  colors: Array<{ name: string; hex: string }>;
}

export function CustomerSelectedPlatePreview({ plates }: { plates: CustomerPlatePreview[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex((current) => Math.min(current, Math.max(plates.length - 1, 0))), [plates.length]);
  if (!plates.length) return null;
  const plate = plates[index];

  return (
    <section className="rounded-2xl bg-card p-4 shadow-overweel-card sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-primary">3MF-platen</h3>
          <p className="text-xs text-muted-foreground">Alleen de platen die voor uw bestelling worden gebruikt.</p>
        </div>
        <span className="text-sm font-semibold">Plaat {plate.logicalPlateNumber}</span>
      </div>
      <div className="relative flex aspect-video max-h-[60dvh] items-center justify-center overflow-hidden rounded-xl bg-muted">
        {plate.previewUrl
          ? <img src={plate.previewUrl} alt={`Preview plaat ${plate.logicalPlateNumber}`} className="h-full w-full object-contain" />
          : <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageOff className="h-7 w-7" />Geen preview beschikbaar</div>}
        {plates.length > 1 && (
          <>
            <Button type="button" size="icon" variant="secondary" className="absolute left-2 h-10 w-10 rounded-full" onClick={() => setIndex((index - 1 + plates.length) % plates.length)} aria-label="Vorige plaat">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button type="button" size="icon" variant="secondary" className="absolute right-2 h-10 w-10 rounded-full" onClick={() => setIndex((index + 1) % plates.length)} aria-label="Volgende plaat">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
      {plate.colors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {plate.colors.map((color, colorIndex) => (
            <span key={`${color.hex}-${colorIndex}`} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
              <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: color.hex }} />{color.name}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted-foreground">{index + 1} van {plates.length}</p>
    </section>
  );
}
