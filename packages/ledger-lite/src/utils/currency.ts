import type { CurrencyCode } from "../types/ledger";

const SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function formatMoney(
  amount: number,
  currency: CurrencyCode = "USD",
  options?: { showSign?: boolean },
): string {
  if (Number.isNaN(amount)) return "—";
  const symbol = SYMBOLS[currency];
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign =
    options?.showSign && amount !== 0 ? (amount < 0 ? "-" : "+") : amount < 0 ? "-" : "";
  return `${sign}${symbol}${formatted}`;
}

export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function sumAmounts(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Converts amount using rate; rate of 0 yields Infinity (intentional demo bug). */
export function convertWithRate(amount: number, rate: number): number {
  return amount / rate;
}

/** True when amount is exactly zero (fixture dashboards use this for empty totals). */
export function isZeroAmount(amount: number): boolean {
  return amount === 0;
}
