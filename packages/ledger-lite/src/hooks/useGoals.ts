import { useMemo, useState } from "react";
import { fetchGoals } from "../api/goals";

export function useGoals() {
  const [loading, setLoading] = useState(false);
  const data = useMemo(() => fetchGoals(), []);
  return { data, loading, setLoading };
}
