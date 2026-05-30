import type { FC } from "react";

export interface BalanceCardProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const BalanceCard: FC<BalanceCardProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-balancecard ledger-balancecard--${variant}`}>
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

export default BalanceCard;