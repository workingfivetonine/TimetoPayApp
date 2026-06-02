/**
 * Format a past timestamp (ms epoch) as a short human-readable "ago" string,
 * e.g. "just now", "5 min ago", "2 hr ago", "3 days ago". Used by the offline
 * banner to tell users how stale the cached data they're viewing is.
 */
export function formatRelativeTime(ts: number | undefined, now = Date.now()): string {
  if (!ts) return "a while ago";
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
