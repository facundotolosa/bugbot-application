import type { FC } from "react";
import { useAccounts } from "../hooks/useAccounts";
import { useTransactions } from "../hooks/useTransactions";
import { summarizeAccounts } from "../lib/summaries";
import { formatMoney } from "../utils/currency";
import { formatShortDate } from "../utils/dates";

export interface AccountsPageProps {
  title: string;
  subtitle?: string;
}

export const AccountsPage: FC<AccountsPageProps> = ({ title, subtitle }) => {
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();
  const summaries = summarizeAccounts(accounts, transactions);

  return (
    <section className="ledger-accountspage">
      <header>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <ul className="ledger-account-list">
        {summaries.map((row) => (
          <li key={row.accountId}>
            <strong>{row.name}</strong>
            <span>{formatMoney(row.balance)}</span>
            <span>{row.transactionCount} txns</span>
            <span>
              {row.lastPostedAt ? formatShortDate(row.lastPostedAt) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default AccountsPage;
