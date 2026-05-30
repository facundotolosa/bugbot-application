import type { Account } from "../types/ledger";

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-checking-01",
    name: "Everyday Checking",
    type: "checking",
    currency: "USD",
    balance: 4820.55,
    institution: "Mock National Bank",
    mask: "4521",
    openedAt: "2019-03-12T00:00:00.000Z",
  },
  {
    id: "acc-savings-01",
    name: "Emergency Fund",
    type: "savings",
    currency: "USD",
    balance: 12500.0,
    institution: "Mock National Bank",
    mask: "8832",
    openedAt: "2019-03-12T00:00:00.000Z",
  },
  {
    id: "acc-credit-01",
    name: "Rewards Card",
    type: "credit",
    currency: "USD",
    balance: -1342.18,
    institution: "Mock Card Co",
    mask: "9910",
    openedAt: "2021-07-01T00:00:00.000Z",
  },
  {
    id: "acc-invest-01",
    name: "Brokerage",
    type: "investment",
    currency: "USD",
    balance: 28450.32,
    institution: "Mock Invest",
    mask: "2201",
    openedAt: "2020-01-15T00:00:00.000Z",
  },
  {
    id: "acc-checking-eur",
    name: "Travel EUR",
    type: "checking",
    currency: "EUR",
    balance: 890.12,
    institution: "Mock EU Bank",
    mask: "7744",
    openedAt: "2023-06-20T00:00:00.000Z",
  },
];

export function getAccountById(id: string): Account | undefined {
  return MOCK_ACCOUNTS.find((a) => a.id === id);
}
