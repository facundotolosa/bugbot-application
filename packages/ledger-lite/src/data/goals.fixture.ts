import type { Goal } from "../types/ledger";

export const MOCK_GOALS: Goal[] = [
  {
    id: "goal-emergency",
    name: "Emergency fund",
    targetAmount: 15000,
    currentAmount: 12500,
    dueDate: "2026-12-31T00:00:00.000Z",
  },
  {
    id: "goal-vacation",
    name: "Summer vacation",
    targetAmount: 4000,
    currentAmount: 1850,
    dueDate: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "goal-laptop",
    name: "New laptop",
    targetAmount: 2200,
    currentAmount: 900,
    dueDate: "2026-09-15T00:00:00.000Z",
  },
];
