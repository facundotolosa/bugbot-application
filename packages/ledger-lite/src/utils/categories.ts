import type { Category, Transaction } from "../types/ledger";

export function categoryPath(
  categoryId: string,
  categories: Category[],
): string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const parts: string[] = [];
  let current = byId.get(categoryId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(" › ") || categoryId;
}

export function groupSpendByCategory(
  transactions: Transaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const spent = Math.abs(tx.amount);
    out[tx.categoryId] = (out[tx.categoryId] ?? 0) + spent;
  }
  return out;
}

export function topCategories(
  transactions: Transaction[],
  limit = 5,
): Array<{ categoryId: string; total: number }> {
  const grouped = groupSpendByCategory(transactions);
  return Object.entries(grouped)
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
