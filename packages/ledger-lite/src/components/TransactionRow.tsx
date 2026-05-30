import type { FC } from "react";

export interface TransactionRowProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const TransactionRow: FC<TransactionRowProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-transactionrow ledger-transactionrow--${variant}`}>
    <header>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    <div className="ledger-component-body">
      <span>{title}</span>
      {amount != null ? <data value={amount}>{amount}</data> : null}
    </div>
  </section>
);

export default TransactionRow;