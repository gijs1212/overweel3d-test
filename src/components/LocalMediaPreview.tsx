import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { isHeicFile } from "@/lib/imageUploads";
import { classifyMediaFile, type MediaFileKind } from "@/lib/mediaFiles";

interface LocalMediaPreviewProps {
  file: File;
  kind?: MediaFileKind;
  alt?: string;
  className?: string;
}

/** Creates exactly one object URL per file and always releases it. */
export function LocalMediaPreview({ file, kind = classifyMediaFile(file) || "image", alt = "Voorbeeld", className = "" }: LocalMediaPreviewProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    // Never decode HEIC or large camera images during selection. A 12 MP image
    // can require tens or hundreds of MB once decoded and mobile Safari then
    // reloads the entire tab. HEIC conversion happens in the upload pipeline;
    // after saving, the normal server image is shown.
    if (isHeicFile(file) || (kind === "image" && file.size > 2 * 1024 * 1024)) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, kind]);

  if (!url) return <div className={`flex flex-col items-center justify-center bg-muted text-center text-[10px] text-muted-foreground ${className}`}><ImageIcon className="mb-1 h-5 w-5" /><span className="max-w-full truncate px-1">{isHeicFile(file) ? "HEIC · wordt JPG" : "Geselecteerd"}</span></div>;
  return kind === "video"
    ? <video src={url} aria-label={alt} muted playsInline preload="metadata" className={className} />
    : <img src={url} alt={alt} className={className} />;
}
