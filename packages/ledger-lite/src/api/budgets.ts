import { MOCK_BUDGETS } from "../data/budgets.fixture";
import type { Budget } from "../types/ledger";

export type { Budget };

export function fetchBudgets(): Budget[] {
  return MOCK_BUDGETS;
}
