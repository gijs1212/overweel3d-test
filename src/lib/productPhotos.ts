import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expiresAt: number }>();

export function normalizeProductStoragePath(path: string): string | null {
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return null;
  if (path.startsWith("/") && !path.startsWith("/storage/")) return null;
  let decodedPath = path;
  try { decodedPath = decodeURIComponent(path); } catch { /* Keep a malformed legacy path unchanged. */ }
  return decodedPath
    .replace(/^\/storage\/v1\/object\/(?:public|sign)\/orders\//, "")
    .replace(/^orders\//, "")
    .replace(/^\/+/, "");
}

/**
 * Returns a signed URL for a product photo stored in the private "orders" bucket.
 * Falls back to the raw path on error so the UI keeps rendering something.
 */
export async function getProductPhotoUrl(path: string): Promise<string> {
  if (!path) return "";
  // Already-renderable URLs are sometimes present in older product records.
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith("/") && !path.startsWith("/storage/")) return path;

  const normalizedPath = normalizeProductStoragePath(path);
  if (!normalizedPath) return path;
  const now = Date.now();
  const cached = cache.get(normalizedPath);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  let { data, error } = await supabase.storage.from("orders").createSignedUrl(normalizedPath, 60 * 60);

  // Very old rows occasionally contain only a filename instead of products/<filename>.
  if ((error || !data?.signedUrl) && !normalizedPath.includes("/")) {
    ({ data, error } = await supabase.storage.from("orders").createSignedUrl(`products/${normalizedPath}`, 60 * 60));
  }

  if (error || !data?.signedUrl) return "";
  cache.set(normalizedPath, { url: data.signedUrl, expiresAt: now + 60 * 60 * 1000 });
  return data.signedUrl;
}

export async function getProductPhotoUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(getProductPhotoUrl));
}
