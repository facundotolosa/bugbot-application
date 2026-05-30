import { groupSpendByCategory } from "../utils/categories";
import type { MonthlyReport } from "../types/ledger";
import { MOCK_TRANSACTIONS } from "./transactions.fixture";

export const MOCK_MONTHLY_REPORTS: MonthlyReport[] = [
  { month: "2025-11", income: 5200, expenses: 3890.12, net: 1309.88, byCategory: {} },
  { month: "2025-12", income: 5200, expenses: 4102.44, net: 1097.56, byCategory: {} },
  { month: "2026-01", income: 5200, expenses: 2450.0, net: 2750.0, byCategory: {} },
];

export function reportForMonth(month: string): MonthlyReport {
  const txs = MOCK_TRANSACTIONS.filter((t) => t.postedAt.startsWith(month));
  const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = txs
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  return {
    month,
    income,
    expenses,
    net: income - expenses,
    byCategory: groupSpendByCategory(txs),
  };
}
