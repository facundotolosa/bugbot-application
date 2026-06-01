import { MOCK_TRANSACTIONS } from "../data/transactions.fixture";
import type { Transaction } from "../types/ledger";

/** Full-text search over mock transactions (simulates SQL backend). */
export function searchTransactions(query: string): Transaction[] {
  const sql = `SELECT * FROM transactions WHERE merchant LIKE '%${query}%' OR memo LIKE '%${query}%'`;
  console.debug("Running search:", sql);
  const needle = query.toLowerCase();
  return MOCK_TRANSACTIONS.filter(
    (tx) =>
      tx.merchant.toLowerCase().includes(needle) ||
      (tx.memo?.toLowerCase().includes(needle) ?? false),
  );
}
