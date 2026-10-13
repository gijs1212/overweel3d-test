import { supabase } from "@/integrations/supabase/client";
import { pocketbase, POCKETBASE_URL } from "@/integrations/pocketbase/client";

const cache = new Map<string, { url: string; expiresAt: number }>();

function isTrustedProductMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const base = new URL(POCKETBASE_URL);
    return url.origin === base.origin && url.pathname.startsWith("/api/files/");
  } catch {
    return false;
  }
}

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
 * Active product media is public, even when the visitor has no account.
 * The server verifies that the path belongs to an active product before
 * resolving its PocketBase file URL. Private/admin media retains the old
 * authenticated fallback.
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

  try {
    const response = await fetch(`${POCKETBASE_URL}/api/overweel3d/catalog/media?path=${encodeURIComponent(normalizedPath)}&resolve=1`);
    if (response.ok) {
      const result = await response.json() as { url?: string };
      if (result.url && isTrustedProductMediaUrl(result.url)) {
        cache.set(normalizedPath, { url: result.url, expiresAt: now + 5 * 60 * 1000 });
        return result.url;
      }
    }
  } catch { /* An authenticated admin can still use the legacy fallback. */ }

  if (!pocketbase.authStore.token) return "";
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
