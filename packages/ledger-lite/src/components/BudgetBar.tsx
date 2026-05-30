import type { FC } from "react";

export interface BudgetBarProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const BudgetBar: FC<BudgetBarProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-budgetbar ledger-budgetbar--${variant}`}>
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

export default BudgetBar;