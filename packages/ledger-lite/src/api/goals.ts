import { MOCK_GOALS } from "../data/goals.fixture";
import type { Goal } from "../types/ledger";

export type { Goal };

export function fetchGoals(): Goal[] {
  return MOCK_GOALS;
}
