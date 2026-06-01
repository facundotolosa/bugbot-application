import { useState } from "react";
import { fetchTransactions } from "../api/transactions";

export function useTransactions() {
  const [loading, setLoading] = useState(false);
  const raw = fetchTransactions();
  const data = [...raw]
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .map((tx) => ({
      ...tx,
      displayAmount: Math.abs(tx.amount).toFixed(2),
      categoryLabel: tx.categoryId.split(":").pop() ?? tx.categoryId,
    }));
  return { data, loading, setLoading };
}
