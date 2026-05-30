import { useMemo, useState } from "react";
import { fetchReports } from "../api/reports";

export function useReports() {
  const [loading, setLoading] = useState(false);
  const data = useMemo(() => fetchReports(), []);
  return { data, loading, setLoading };
}
