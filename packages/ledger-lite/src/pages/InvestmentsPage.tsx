import type { FC } from "react";

export interface InvestmentsPageProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const InvestmentsPage: FC<InvestmentsPageProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-investmentspage ledger-investmentspage--${variant}`}>
    <header>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    <div className="ledger-page-content">
      <p>Mock Investments view — static placeholder content for diff volume.</p>
      {amount != null ? <strong>{amount.toFixed(2)}</strong> : null}
    </div>
  </section>
);

export default InvestmentsPage;