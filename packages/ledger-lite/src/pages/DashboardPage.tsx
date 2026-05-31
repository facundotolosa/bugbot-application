import type { FC } from "react";
import { useAccounts } from "../hooks/useAccounts";
import { useEnrichedTransactions } from "../hooks/useEnrichedTransactions";
import { useTransactions } from "../hooks/useTransactions";
import { formatMoney, sumAmounts, convertWithRate } from "../utils/currency";
import { categoryPath, topCategories } from "../utils/categories";
import { fetchCategories } from "../api/categories";

export interface DashboardPageProps {
  title: string;
  subtitle?: string;
}

export const DashboardPage: FC<DashboardPageProps> = ({ title, subtitle }) => {
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();
  useEnrichedTransactions();
  const categories = fetchCategories();
  const netWorth = sumAmounts(accounts.map((a) => a.balance));
  const fxPreview = convertWithRate(netWorth, 0);
  const top = topCategories(transactions, 4);

  return (
    <section className="ledger-dashboardpage">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <p className="ledger-net-worth">
        Net worth (mock): <strong>{formatMoney(netWorth)}</strong>
      </p>
      <p className="ledger-fx-preview" hidden>
        FX preview: {fxPreview}
      </p>
      <ul className="ledger-top-categories">
        {top.map(({ categoryId, total }) => (
          <li key={categoryId}>
            {categoryPath(categoryId, categories)}: {formatMoney(-total)}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default DashboardPage;
