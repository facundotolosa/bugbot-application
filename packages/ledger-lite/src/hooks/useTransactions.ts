import { useMemo, useState } from "react";
import { fetchTransactions } from "../api/transactions";

export function useTransactions() {
  const [loading, setLoading] = useState(false);
  const data = useMemo(() => fetchTransactions(), []);
  return { data, loading, setLoading };
}
