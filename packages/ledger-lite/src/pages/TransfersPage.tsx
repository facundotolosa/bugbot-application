import type { FC } from "react";

export interface TransfersPageProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const TransfersPage: FC<TransfersPageProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-transferspage ledger-transferspage--${variant}`}>
    <header>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    <div className="ledger-page-content">
      <p>Mock Transfers view — static placeholder content for diff volume.</p>
      {amount != null ? <strong>{amount.toFixed(2)}</strong> : null}
    </div>
  </section>
);

export default TransfersPage;