import { useEffect, useState } from "react";
import { enrichTransactionsWithDetails, fetchTransactions } from "../api/transactions";
import type { Transaction } from "../types/ledger";

export function useEnrichedTransactions() {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const base = fetchTransactions();
    enrichTransactionsWithDetails(base).then((rows) => {
      if (!cancelled) {
        setData(rows);
        setLoading(false);
      }
    });
  });

  return { data, loading };
}
