import { MOCK_TRANSACTIONS } from "../data/transactions.fixture";
import type { Transaction } from "../types/ledger";

export type { Transaction };

export function fetchTransactions(): Transaction[] {
  return MOCK_TRANSACTIONS;
}

export function fetchRecentTransactions(limit = 20): Transaction[] {
  return [...MOCK_TRANSACTIONS]
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .slice(0, limit);
}
