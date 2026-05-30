import type { Budget } from "../types/ledger";

export const MOCK_BUDGETS: Budget[] = [
  { id: "bud-01", categoryId: "food-groceries", limit: 600, spent: 412.33, period: "monthly", month: "2026-01" },
  { id: "bud-02", categoryId: "food-dining", limit: 250, spent: 198.5, period: "monthly", month: "2026-01" },
  { id: "bud-03", categoryId: "transport-fuel", limit: 180, spent: 142.0, period: "monthly", month: "2026-01" },
  { id: "bud-04", categoryId: "entertainment", limit: 120, spent: 89.99, period: "monthly", month: "2026-01" },
  { id: "bud-05", categoryId: "shopping", limit: 300, spent: 310.12, period: "monthly", month: "2026-01" },
];
