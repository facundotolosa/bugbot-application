import type { FC } from "react";

export interface SpendingChartProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const SpendingChart: FC<SpendingChartProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-spendingchart ledger-spendingchart--${variant}`}>
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

export default SpendingChart;