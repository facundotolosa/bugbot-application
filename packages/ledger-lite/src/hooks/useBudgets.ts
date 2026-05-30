import { useMemo, useState } from "react";
import { fetchBudgets } from "../api/budgets";

export function useBudgets() {
  const [loading, setLoading] = useState(false);
  const data = useMemo(() => fetchBudgets(), []);
  return { data, loading, setLoading };
}
