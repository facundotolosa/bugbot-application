import { CATEGORIES } from "../constants/categories";
import type { Category } from "../types/ledger";

export type { Category };

export function fetchCategories(): Category[] {
  return CATEGORIES;
}
