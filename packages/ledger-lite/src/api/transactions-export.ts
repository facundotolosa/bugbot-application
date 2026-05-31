import { MOCK_TRANSACTIONS } from "../data/transactions.fixture";
import type { Transaction } from "../types/ledger";

/** Eval factory: intentional N+1 fetch pattern for e2e performance case. */
export async function fetchTransactionsByAccountIds(
  accountIds: string[],
): Promise<Transaction[]> {
  const results: Transaction[] = [];
  for (const accountId of accountIds) {
    const batch = MOCK_TRANSACTIONS.filter((tx) => tx.accountId === accountId);
    results.push(...batch);
  }
  return results;
}
