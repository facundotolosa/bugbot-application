/** Domain types for the ledger-lite fixture (mock personal finance). */

export type CurrencyCode = "USD" | "EUR" | "GBP";

export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "loan";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  balance: number;
  institution: string;
  mask: string;
  openedAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string;
  amount: number;
  currency: CurrencyCode;
  merchant: string;
  postedAt: string;
  memo?: string;
  pending: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  limit: number;
  spent: number;
  period: "monthly" | "weekly";
  month: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  dueDate: string;
}

export interface MonthlyReport {
  month: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: Record<string, number>;
}
