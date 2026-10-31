import { isHeicFile } from "@/lib/imageUploads";

export type MediaFileKind = "image" | "video";

export interface AcceptedMediaFile {
  file: File;
  kind: MediaFileKind;
}

export interface MediaSelectionOptions {
  allowVideos?: boolean;
  maxImageBytes?: number;
  maxVideoBytes?: number;
  maxFiles?: number;
}

export function classifyMediaFile(file: Pick<File, "name" | "type">): MediaFileKind | null {
  if (isHeicFile(file) || file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif)$/i.test(file.name)) return "image";
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) return "video";
  return null;
}

export function validateMediaSelection(files: File[], options: MediaSelectionOptions = {}) {
  const maxImageBytes = options.maxImageBytes ?? 12 * 1024 * 1024;
  const maxVideoBytes = options.maxVideoBytes ?? 50 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 20;
  const accepted: AcceptedMediaFile[] = [];
  const errors: string[] = [];

  for (const file of files.slice(0, maxFiles)) {
    const kind = classifyMediaFile(file);
    if (!kind || (kind === "video" && !options.allowVideos)) {
      errors.push(`${file.name}: niet-ondersteund bestandstype`);
      continue;
    }
    if (file.size <= 0) {
      errors.push(`${file.name}: bestand is leeg`);
      continue;
    }
    const limit = kind === "video" ? maxVideoBytes : maxImageBytes;
    if (file.size > limit) {
      errors.push(`${file.name}: groter dan ${Math.round(limit / 1024 / 1024)} MB`);
      continue;
    }
    accepted.push({ file, kind });
  }
  if (files.length > maxFiles) errors.push(`Maximaal ${maxFiles} bestanden per keer; ${files.length - maxFiles} overgeslagen.`);
  return { accepted, errors };
}
