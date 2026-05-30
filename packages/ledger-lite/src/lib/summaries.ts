import type { Account, Budget, Transaction } from "../types/ledger";
import { formatMonthKey } from "../utils/dates";
import { sumAmounts } from "../utils/currency";

export interface AccountSummary {
  accountId: string;
  name: string;
  balance: number;
  transactionCount: number;
  lastPostedAt: string | null;
}

export interface BudgetStatus {
  budgetId: string;
  categoryId: string;
  limit: number;
  spent: number;
  remaining: number;
  overBudget: boolean;
}

export function summarizeAccounts(
  accounts: Account[],
  transactions: Transaction[],
): AccountSummary[] {
  return accounts.map((account) => {
    const forAccount = transactions.filter((t) => t.accountId === account.id);
    const sorted = [...forAccount].sort((a, b) =>
      b.postedAt.localeCompare(a.postedAt),
    );
    return {
      accountId: account.id,
      name: account.name,
      balance: account.balance,
      transactionCount: forAccount.length,
      lastPostedAt: sorted[0]?.postedAt ?? null,
    };
  });
}

export function summarizeBudgets(budgets: Budget[]): BudgetStatus[] {
  return budgets.map((b) => {
    const remaining = b.limit - b.spent;
    return {
      budgetId: b.id,
      categoryId: b.categoryId,
      limit: b.limit,
      spent: b.spent,
      remaining,
      overBudget: remaining < 0,
    };
  });
}

export function monthlyCashflow(transactions: Transaction[], monthKey: string) {
  const inMonth = transactions.filter(
    (t) => formatMonthKey(t.postedAt) === monthKey,
  );
  const income = sumAmounts(inMonth.filter((t) => t.amount > 0).map((t) => t.amount));
  const expenses = sumAmounts(
    inMonth.filter((t) => t.amount < 0).map((t) => Math.abs(t.amount)),
  );
  return { monthKey, income, expenses, net: income - expenses };
}

export function pendingTransactionTotal(transactions: Transaction[]): number {
  return sumAmounts(
    transactions.filter((t) => t.pending).map((t) => t.amount),
  );
}
