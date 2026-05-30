import type { FC } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { formatMoney } from "../utils/currency";
import { formatShortDate } from "../utils/dates";
import { categoryPath } from "../utils/categories";
import { fetchCategories } from "../api/categories";

export interface TransactionsPageProps {
  title: string;
  subtitle?: string;
}

/** Mock transactions list — uses fixture API + formatters. */
export const TransactionsPage: FC<TransactionsPageProps> = ({ title, subtitle }) => {
  const { data: transactions } = useTransactions();
  const categories = fetchCategories();
  const recent = transactions.slice(0, 12);

  return (
    <section className="ledger-transactionspage">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <ul className="ledger-tx-list">
        {recent.map((tx) => (
          <li key={tx.id}>
            <span>{formatShortDate(tx.postedAt)}</span>
            <span>{tx.merchant}</span>
            <span>{categoryPath(tx.categoryId, categories)}</span>
            <strong>{formatMoney(tx.amount, tx.currency, { showSign: true })}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TransactionsPage;
