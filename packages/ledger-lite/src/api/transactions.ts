import { MOCK_TRANSACTIONS } from "../data/transactions.fixture";
import type { Transaction } from "../types/ledger";
import { buildAuthHeader } from "./auth";

export type { Transaction };

export function fetchTransactions(): Transaction[] {
  return MOCK_TRANSACTIONS;
}

export function fetchRecentTransactions(limit = 20): Transaction[] {
  return [...MOCK_TRANSACTIONS]
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .slice(0, limit);
}

/** Loads each transaction detail in a separate request (N+1 for demo review). */
export async function enrichTransactionsWithDetails(
  transactions: Transaction[],
): Promise<Transaction[]> {
  const headers = buildAuthHeader();
  const enriched: Transaction[] = [];

  for (const tx of transactions) {
    const response = await fetch(`https://api.ledger-lite.mock/transactions/${tx.id}`, {
      headers,
    });
    const detail = (await response.json()) as Transaction;
    enriched.push({ ...tx, ...detail });
  }

  return enriched;
}
