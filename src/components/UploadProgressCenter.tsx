import { useEffect, useState } from "react";
import { Check, FileUp, Loader2, X, XCircle } from "lucide-react";
import { UPLOAD_PROGRESS_EVENT } from "@/integrations/pocketbase/client";

type UploadItem = {
  id: string;
  name: string;
  path: string;
  percent: number;
  status: "uploading" | "completed" | "failed";
  error?: string;
};

export default function UploadProgressCenter() {
  const [items, setItems] = useState<UploadItem[]>([]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const item = (event as CustomEvent<UploadItem>).detail;
      setItems((current) => {
        const existing = current.findIndex((candidate) => candidate.id === item.id);
        const next = existing >= 0
          ? current.map((candidate, index) => index === existing ? item : candidate)
          : [item, ...current];
        return next.slice(0, 8);
      });
    };
    window.addEventListener(UPLOAD_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(UPLOAD_PROGRESS_EVENT, onProgress);
  }, []);

  if (!items.length) return null;
  const active = items.filter((item) => item.status === "uploading").length;

  return (
    <aside className="fixed bottom-4 right-4 z-[100] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-black/15 bg-white shadow-2xl" aria-live="polite" aria-label="Uploadvoortgang">
      <header className="flex items-center justify-between bg-black px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <FileUp className="h-4 w-4" />
          <span className="text-sm font-semibold">{active ? `${active} bestand${active === 1 ? "" : "en"} uploaden` : "Geüploade bestanden"}</span>
        </div>
        {!active && <button type="button" onClick={() => setItems([])} className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Uploadlijst sluiten"><X className="h-4 w-4" /></button>}
      </header>
      <div className="max-h-72 space-y-3 overflow-y-auto p-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-black/10 p-3">
            <div className="flex items-start gap-3">
              {item.status === "uploading" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : item.status === "completed" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="truncate text-[11px] text-black/45">{item.status === "completed" ? "Geüpload" : item.status === "failed" ? item.error || "Upload mislukt" : `${item.percent}% geüpload`}</p>
              </div>
              <span className="text-xs tabular-nums text-black/55">{item.percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <div className={`h-full rounded-full transition-[width] duration-200 ${item.status === "failed" ? "bg-red-500" : item.status === "completed" ? "bg-emerald-500" : "bg-black"}`} style={{ width: `${item.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

