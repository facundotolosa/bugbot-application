import { EXPENSE_CATEGORY_IDS } from "../constants/categories";
import { MERCHANTS } from "../constants/merchants";
import type { CurrencyCode, Transaction } from "../types/ledger";
import { MOCK_ACCOUNTS } from "./accounts.fixture";

const ACCOUNT_IDS = MOCK_ACCOUNTS.map((a) => a.id);

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

function isoDay(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}T14:30:00.000Z`;
}

/** Build a varied transaction list for fixture diffs (single module, no copy-paste files). */
function buildRoutineTransactions(count: number): Transaction[] {
  const rows: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const accountId = pick(ACCOUNT_IDS, i);
    const account = MOCK_ACCOUNTS.find((a) => a.id === accountId)!;
    const isIncome = i % 17 === 0;
    const categoryId = isIncome
      ? i % 2 === 0
        ? "income-salary"
        : "income-freelance"
      : pick(EXPENSE_CATEGORY_IDS, i + 3);
    const base = isIncome ? 1800 + (i % 5) * 120 : -(12 + (i % 40) * 3.27);
    const currency: CurrencyCode = account.currency;
    const month = 1 + (i % 12);
    const day = 1 + (i % 28);
    rows.push({
      id: `tx-${String(i + 1).padStart(4, "0")}`,
      accountId,
      categoryId,
      amount: Math.round(base * 100) / 100,
      currency,
      merchant: pick(MERCHANTS, i + 7),
      postedAt: isoDay(2025, month, day),
      memo: i % 9 === 0 ? "Auto-generated fixture row" : undefined,
      pending: i % 23 === 0,
    });
  }
  return rows;
}

/** Hand-picked rows for demos and smoke tests. */
const HIGHLIGHTS: Transaction[] = [
  {
    id: "tx-rent-jan",
    accountId: "acc-checking-01",
    categoryId: "housing-rent",
    amount: -2100,
    currency: "USD",
    merchant: "Landlord LLC",
    postedAt: "2026-01-02T09:00:00.000Z",
    memo: "January rent",
    pending: false,
  },
  {
    id: "tx-payroll-jan",
    accountId: "acc-checking-01",
    categoryId: "income-salary",
    amount: 5200,
    currency: "USD",
    merchant: "Payroll — Acme Corp",
    postedAt: "2026-01-15T08:00:00.000Z",
    pending: false,
  },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  ...HIGHLIGHTS,
  ...buildRoutineTransactions(160),
];

export function transactionsForAccount(accountId: string): Transaction[] {
  return MOCK_TRANSACTIONS.filter((t) => t.accountId === accountId);
}

export function transactionsForMonth(monthKey: string): Transaction[] {
  return MOCK_TRANSACTIONS.filter((t) => t.postedAt.startsWith(monthKey));
}
