import { MOCK_ACCOUNTS } from "../data/accounts.fixture";
import type { Account } from "../types/ledger";

export type { Account };

export function fetchAccounts(): Account[] {
  return MOCK_ACCOUNTS;
}

export function fetchAccountById(id: string): Account | undefined {
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}
