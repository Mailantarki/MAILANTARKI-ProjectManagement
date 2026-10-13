import "server-only";
import { getAdminClient } from "../supabase/admin";

// Signed URLs are reused for 30 minutes so browsers can cache the images they point to;
// each URL is signed for 1 hour, so a reused URL is always valid for at least 30 more minutes.
const SIGN_SECONDS = 60 * 60;
const REUSE_MS = 30 * 60 * 1000;
const cache = new Map<string, { url: string; reuseUntil: number }>();

export const isStoragePath = (value: string | null | undefined): value is string =>
  !!value && !/^https?:\/\//.test(value);

/** Signs only paths the caller has already authorized. One Storage request for all cache misses. */
export async function signStorageUrls(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = cache.get(`${bucket}/${path}`);
    if (hit && hit.reuseUntil > now) result.set(path, hit.url);
    else missing.push(path);
  }
  if (missing.length) {
    const { data, error } = await getAdminClient().storage.from(bucket).createSignedUrls(missing, SIGN_SECONDS);
    if (!error) for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) continue;
      result.set(item.path, item.signedUrl);
      cache.set(`${bucket}/${item.path}`, { url: item.signedUrl, reuseUntil: now + REUSE_MS });
    }
  }
  if (cache.size > 2000) for (const [key, value] of cache) if (value.reuseUntil <= now) cache.delete(key);
  return result;
}
