import type { FC } from "react";

export interface SettingsPageProps {
  title: string;
  subtitle?: string;
  amount?: number;
  variant?: "default" | "muted" | "danger";
}

/** Presentational shell — no real product behavior. */
export const SettingsPage: FC<SettingsPageProps> = ({ title, subtitle, amount, variant = "default" }) => (
  <section className={`ledger-settingspage ledger-settingspage--${variant}`}>
    <header>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
    <div className="ledger-page-content">
      <p>Mock Settings view — static placeholder content for diff volume.</p>
      {amount != null ? <strong>{amount.toFixed(2)}</strong> : null}
    </div>
  </section>
);

export default SettingsPage;