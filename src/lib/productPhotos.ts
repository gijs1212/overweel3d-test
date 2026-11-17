import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

export function normalizeProductStoragePath(path: string): string | null {
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return null;
  if (path.startsWith("/") && !path.startsWith("/storage/")) return null;
  let decodedPath = path;
  try { decodedPath = decodeURIComponent(path); } catch { /* Preserve malformed legacy paths. */ }
  return decodedPath
    .replace(/^\/storage\/v1\/object\/(?:public|sign)\/orders\//, "")
    .replace(/^orders\//, "")
    .replace(/^\/+/, "");
}

function isPublicMedia(path: string) {
  return ["products/", "portfolio/", "colors/", "reviews/", "social/"]
    .some((prefix) => path.startsWith(prefix));
}

/** Resolve catalogue media through the anonymous Appwrite public bucket. */
export async function getProductPhotoUrl(path: string): Promise<string> {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith("/") && !path.startsWith("/storage/")) return path;

  let normalizedPath = normalizeProductStoragePath(path);
  if (!normalizedPath) return path;
  const cached = cache.get(normalizedPath);
  if (cached) return cached;

  if (!normalizedPath.includes("/")) normalizedPath = `products/${normalizedPath}`;
  if (isPublicMedia(normalizedPath)) {
    const { data } = supabase.storage.from("orders").getPublicUrl(normalizedPath);
    const url = String(data?.publicUrl || "");
    if (url) cache.set(normalizedPath, url);
    return url;
  }

  const { data, error } = await supabase.storage.from("orders").createSignedUrl(normalizedPath, 60 * 60);
  if (error || !data?.signedUrl) return "";
  cache.set(normalizedPath, data.signedUrl);
  return data.signedUrl;
}

export async function getProductPhotoUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(getProductPhotoUrl));
}
