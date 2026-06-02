import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Returns a signed URL for a product photo stored in the private "orders" bucket.
 * Falls back to the raw path on error so the UI keeps rendering something.
 */
export async function getProductPhotoUrl(path: string): Promise<string> {
  if (!path) return "";
  const now = Date.now();
  const cached = cache.get(path);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from("orders")
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error || !data?.signedUrl) return "";
  cache.set(path, { url: data.signedUrl, expiresAt: now + 60 * 60 * 1000 });
  return data.signedUrl;
}

export async function getProductPhotoUrls(paths: string[]): Promise<string[]> {
  return Promise.all(paths.map(getProductPhotoUrl));
}