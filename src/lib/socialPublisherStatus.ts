export interface SocialPublisherStatusLike {
  publisher_connected?: unknown;
  publisher_last_seen_at?: unknown;
}

export function parsePocketBaseTimestamp(value: unknown): number {
  const text = String(value || "").trim();
  if (!text) return Number.NaN;
  const direct = Date.parse(text);
  if (Number.isFinite(direct)) return direct;
  return Date.parse(text.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T"));
}

export function isSocialPublisherConnected(
  status: SocialPublisherStatusLike,
  now = Date.now(),
  maximumAgeMs = 90_000,
): boolean {
  if (typeof status.publisher_connected === "boolean") return status.publisher_connected;
  const lastSeen = parsePocketBaseTimestamp(status.publisher_last_seen_at);
  if (!Number.isFinite(lastSeen)) return false;
  return Math.max(0, now - lastSeen) <= maximumAgeMs;
}
