import { useMemo, useState } from "react";
import { fetchAccounts } from "../api/accounts";

export function useAccounts() {
  const [loading, setLoading] = useState(false);
  const data = useMemo(() => fetchAccounts(), []);
  return { data, loading, setLoading };
}
