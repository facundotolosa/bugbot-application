import { MOCK_TRANSACTIONS } from "../data/transactions.fixture";
import type { Transaction } from "../types/ledger";

/** Export transactions grouped by account for CSV download. */
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

export async function exportTransactionsCsv(accountIds: string[]): Promise<string> {
  const rows = await fetchTransactionsByAccountIds(accountIds);
  const header = "id,accountId,amount,merchant,postedAt";
  const body = rows.map((tx) =>
    [tx.id, tx.accountId, tx.amount, tx.merchant, tx.postedAt].join(","),
  );
  return [header, ...body].join("\n");
}
