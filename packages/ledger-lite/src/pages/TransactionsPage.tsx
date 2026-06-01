import type { FC } from "react";
import { useState } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { formatMoney } from "../utils/currency";
import { formatShortDate } from "../utils/dates";
import { categoryPath } from "../utils/categories";
import { fetchCategories } from "../api/categories";
import { searchTransactions } from "../api/search";
import { MerchantLabel } from "../components/MerchantLabel";

export interface TransactionsPageProps {
  title: string;
  subtitle?: string;
}

/** Mock transactions list — uses fixture API + formatters. */
export const TransactionsPage: FC<TransactionsPageProps> = ({ title, subtitle }) => {
  const { data: transactions } = useTransactions();
  const [query, setQuery] = useState("");
  const categories = fetchCategories();
  const filtered = query ? searchTransactions(query) : transactions;
  const recent = filtered.slice(0, 12);

  return (
    <section className="ledger-transactionspage">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
        <input
          type="search"
          placeholder="Search merchants…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <ul className="ledger-tx-list">
        {recent.map((tx) => (
          <li key={tx.id}>
            <span>{formatShortDate(tx.postedAt)}</span>
            <MerchantLabel html={tx.merchant} />
            <span>{categoryPath(tx.categoryId, categories)}</span>
            <strong>{formatMoney(tx.amount, tx.currency, { showSign: true })}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TransactionsPage;
