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
    // Rendering the original HEIC in an <img> can exhaust Safari's tab memory.
    // The upload pipeline converts it to JPEG later, so show a safe placeholder.
    if (isHeicFile(file)) {
      setUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  if (!url) return <div className={`flex flex-col items-center justify-center bg-muted text-center text-[10px] text-muted-foreground ${className}`}><ImageIcon className="mb-1 h-5 w-5" /><span className="max-w-full truncate px-1">HEIC · preview na upload</span></div>;
  return kind === "video"
    ? <video src={url} aria-label={alt} muted playsInline preload="metadata" className={className} />
    : <img src={url} alt={alt} className={className} />;
}
