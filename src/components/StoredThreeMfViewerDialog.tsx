import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { ThreeMfOrderPreview } from "@/components/ThreeMfOrderPreview";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface StoredThreeMfViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storagePath?: string | null;
  filename?: string | null;
  localFile?: File | null;
}

export function StoredThreeMfViewerDialog({
  open,
  onOpenChange,
  storagePath,
  filename,
  localFile,
}: StoredThreeMfViewerDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (localFile) {
      setFile(localFile);
      setError(null);
      setLoading(false);
      return;
    }
    if (!storagePath) {
      setFile(null);
      setError("Er is geen opgeslagen 3MF-bestand gekoppeld.");
      return;
    }

    let cancelled = false;
    setFile(null);
    setError(null);
    setLoading(true);
    void supabase.storage.from("orders").download(storagePath).then(({ data, error: downloadError }) => {
      if (cancelled) return;
      if (downloadError || !data) {
        setError(downloadError?.message || "Het opgeslagen 3MF-bestand kon niet worden geladen.");
      } else {
        const fallbackName = storagePath.split("/").pop() || "model.3mf";
        const requestedName = filename || fallbackName;
        const viewerName = requestedName.toLowerCase().endsWith(".3mf")
          ? requestedName
          : fallbackName.toLowerCase().endsWith(".3mf") ? fallbackName : `${requestedName}.3mf`;
        setFile(new File([data], viewerName, { type: data.type || "model/3mf" }));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filename, localFile, open, storagePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-2 left-2 right-2 top-2 h-[calc(100dvh-1rem)] w-auto max-w-none translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-xl p-3 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-auto sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-6">
        <DialogHeader>
          <DialogTitle>3MF-viewer</DialogTitle>
          <DialogDescription>{filename || localFile?.name || "Opgeslagen 3MF-bestand"}</DialogDescription>
        </DialogHeader>
        {loading && <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-accent" /></div>}
        {error && <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        {file && <ThreeMfOrderPreview file={file} />}
      </DialogContent>
    </Dialog>
  );
}
