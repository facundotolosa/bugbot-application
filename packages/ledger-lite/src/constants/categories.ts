import type { Category } from "../types/ledger";

/** Static category tree for mock data. */
export const CATEGORIES: Category[] = [
  { id: "income", name: "Income", parentId: null, color: "#22c55e", icon: "wallet" },
  { id: "income-salary", name: "Salary", parentId: "income", color: "#16a34a", icon: "briefcase" },
  { id: "income-freelance", name: "Freelance", parentId: "income", color: "#15803d", icon: "laptop" },
  { id: "housing", name: "Housing", parentId: null, color: "#6366f1", icon: "home" },
  { id: "housing-rent", name: "Rent", parentId: "housing", color: "#4f46e5", icon: "key" },
  { id: "housing-utilities", name: "Utilities", parentId: "housing", color: "#4338ca", icon: "zap" },
  { id: "food", name: "Food", parentId: null, color: "#f97316", icon: "utensils" },
  { id: "food-groceries", name: "Groceries", parentId: "food", color: "#ea580c", icon: "cart" },
  { id: "food-dining", name: "Dining out", parentId: "food", color: "#c2410c", icon: "coffee" },
  { id: "transport", name: "Transport", parentId: null, color: "#0ea5e9", icon: "car" },
  { id: "transport-fuel", name: "Fuel", parentId: "transport", color: "#0284c7", icon: "fuel" },
  { id: "transport-transit", name: "Transit", parentId: "transport", color: "#0369a1", icon: "train" },
  { id: "shopping", name: "Shopping", parentId: null, color: "#ec4899", icon: "bag" },
  { id: "health", name: "Health", parentId: null, color: "#14b8a6", icon: "heart" },
  { id: "entertainment", name: "Entertainment", parentId: null, color: "#a855f7", icon: "film" },
  { id: "transfer", name: "Transfers", parentId: null, color: "#64748b", icon: "arrow" },
];

export const EXPENSE_CATEGORY_IDS = CATEGORIES.filter(
  (c) => c.id !== "income" && !c.id.startsWith("income-") && c.id !== "transfer",
).map((c) => c.id);
