/** Date helpers for mock ledger views (no timezone library in fixture). */

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonthKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function isInMonth(iso: string, monthKey: string): boolean {
  return formatMonthKey(iso) === monthKey;
}

export function startOfMonth(monthKey: string): string {
  return `${monthKey}-01T00:00:00.000Z`;
}
