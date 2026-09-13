import { supabase } from "@/integrations/supabase/client";

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/x-heic",
  "image/x-heif",
]);

export function isHeicFile(file: Pick<File, "name" | "type">): boolean {
  return /\.hei[cf]$/i.test(file.name) || HEIC_MIME_TYPES.has(file.type.toLowerCase());
}

export function jpegNameForHeic(name: string): string {
  return /\.hei[cf]$/i.test(name) ? name.replace(/\.hei[cf]$/i, ".jpg") : `${name}.jpg`;
}

export function jpegPathForHeic(path: string): string {
  return /\.hei[cf]$/i.test(path) ? path.replace(/\.hei[cf]$/i, ".jpg") : `${path}.jpg`;
}

function isAppleWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(userAgent);
}

function nativeBrowserJpeg(file: File, quality: number): Promise<Blob> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return Promise.reject(new Error("Native afbeeldingsconversie is niet beschikbaar."));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    image.onerror = () => { cleanup(); reject(new Error("Safari kon het HEIC-bestand niet openen.")); };
    image.onload = () => {
      try {
        const maxSide = 6000;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Afbeeldingscanvas kon niet worden gestart.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (blob) resolve(blob);
          else reject(new Error("Safari kon geen JPG van het HEIC-bestand maken."));
        }, "image/jpeg", quality);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.src = url;
  });
}

async function libraryJpeg(file: File, quality: number): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  if (!jpegBlob) throw new Error("De HEIC-decoder leverde geen afbeelding op.");
  return jpegBlob;
}

export async function prepareImageFileForUpload(file: File, quality = 0.9): Promise<File> {
  if (!isHeicFile(file)) return file;

  // Safari/iPadOS already contains a native HEIC decoder. Using that first avoids
  // the WebAssembly/Worker failures and high memory use of heic2any on iPads.
  // Other browsers use heic2any first and retain the native route as a fallback.
  const converters = isAppleWebKit()
    ? [nativeBrowserJpeg, libraryJpeg]
    : [libraryJpeg, nativeBrowserJpeg];
  let jpegBlob: Blob | null = null;
  let lastError: unknown = null;
  for (const converter of converters) {
    try {
      jpegBlob = await converter(file, quality);
      if (jpegBlob) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!jpegBlob) {
    const reason = lastError instanceof Error ? lastError.message : "onbekende decoderfout";
    throw new Error(`HEIC-conversie mislukt voor ${file.name}: ${reason}`);
  }

  return new File([jpegBlob], jpegNameForHeic(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

interface StorageUploadOptions {
  cacheControl?: string;
  upsert?: boolean;
  contentType?: string;
}

export async function uploadFileWithHeicConversion(
  bucket: string,
  requestedPath: string,
  sourceFile: File,
  options: StorageUploadOptions = {},
) {
  const wasHeic = isHeicFile(sourceFile);
  if (!wasHeic) {
    const result = await supabase.storage.from(bucket).upload(requestedPath, sourceFile, {
      ...options,
      contentType: sourceFile.type || options.contentType,
      upsert: options.upsert ?? false,
    });
    return { ...result, file: sourceFile, path: requestedPath, converted: false };
  }

  // Mobile Safari may suspend or lose a selected photo while expensive HEIC
  // decoding is still running. Persist the source first, then convert it.
  const stagedPath = /\.hei[cf]$/i.test(requestedPath)
    ? requestedPath
    : `${requestedPath}.source.heic`;
  const staged = await supabase.storage.from(bucket).upload(stagedPath, sourceFile, {
    ...options,
    contentType: sourceFile.type || "image/heic",
    upsert: options.upsert ?? false,
  });
  if (staged.error) return { ...staged, file: sourceFile, path: stagedPath, converted: false };

  try {
    const file = await prepareImageFileForUpload(sourceFile);
    const path = /\.jpe?g$/i.test(requestedPath) ? requestedPath : jpegPathForHeic(requestedPath);
    const result = await supabase.storage.from(bucket).upload(path, file, {
      ...options,
      contentType: "image/jpeg",
      upsert: options.upsert ?? false,
    });
    if (result.error) {
      await supabase.storage.from(bucket).remove([stagedPath]);
      return { ...result, file, path, converted: true };
    }
    const cleanup = await supabase.storage.from(bucket).remove([stagedPath]);
    if (cleanup.error) console.warn(`Tijdelijk HEIC-bestand kon niet worden verwijderd: ${stagedPath}`, cleanup.error);
    return { ...result, file, path, converted: true };
  } catch (error) {
    await supabase.storage.from(bucket).remove([stagedPath]);
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
      file: sourceFile,
      path: stagedPath,
      converted: false,
    };
  }
}
