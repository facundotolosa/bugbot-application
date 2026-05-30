import type { FC } from "react";

export interface CategoryPillProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const CategoryPill: FC<CategoryPillProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-categorypill ledger-categorypill--${variant}`}>
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

export default CategoryPill;