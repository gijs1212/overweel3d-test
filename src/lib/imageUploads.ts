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

export async function prepareImageFileForUpload(file: File, quality = 0.9): Promise<File> {
  if (!isHeicFile(file)) return file;

  // Load the browser-only decoder only when a HEIC file actually needs it.
  // This also keeps ordinary uploads and server-side tests free of Worker/canvas setup.
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  if (!jpegBlob) throw new Error(`HEIC-conversie leverde geen afbeelding op voor ${file.name}.`);

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
  const file = await prepareImageFileForUpload(sourceFile);
  const path = wasHeic ? jpegPathForHeic(requestedPath) : requestedPath;
  const result = await supabase.storage.from(bucket).upload(path, file, {
    ...options,
    contentType: file.type || options.contentType,
    upsert: options.upsert ?? false,
  });

  return { ...result, file, path, converted: wasHeic };
}
