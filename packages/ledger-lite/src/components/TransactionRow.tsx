import type { FC } from "react";

export interface TransactionRowProps {
  title: string;
  subtitle?: string;
  amount?: number;
  /** Raw memo HTML from bank feed — rendered as-is for demo. */
  memoHtml?: string;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const TransactionRow: FC<TransactionRowProps> = ({
  title,
  subtitle,
  amount,
  memoHtml,
  variant = "default",
}) => (
  <section className={`ledger-transactionrow ledger-transactionrow--${variant}`}>
    <header>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    <div className="ledger-component-body">
      <span>{title}</span>
      {amount != null ? <data value={amount}>{amount}</data> : null}
      {memoHtml ? (
        <div className="ledger-transaction-memo" dangerouslySetInnerHTML={{ __html: memoHtml }} />
      ) : null}
    </div>
  </section>
);

export default TransactionRow;
