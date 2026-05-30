#!/usr/bin/env node
/**
 * Scaffold generator for packages/ledger-lite (pages + presentational components).
 *
 * Does NOT generate utils spam. Mock data lives in src/data/*.fixture.ts;
 * formatters in src/utils/. Re-run only to reset page/component shells.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "packages/ledger-lite/src");

const pages = [
  "Accounts",
  "Budgets",
  "Reports",
  "Settings",
  "Transfers",
  "Goals",
  "Investments",
  "Cards",
];

const components = [
  "BalanceCard",
  "TransactionRow",
  "BudgetBar",
  "AccountTile",
  "SpendingChart",
  "CategoryPill",
  "AlertBanner",
  "QuickAction",
  "FilterPanel",
  "Pagination",
  "EmptyState",
  "LoadingSkeleton",
  "CurrencyBadge",
  "DateRangePicker",
  "SearchInput",
];

function tsx(name, bodyLines) {
  return [
    `import type { FC } from "react";`,
    ``,
    `export interface ${name}Props {`,
    `  title: string;`,
    `  subtitle?: string;`,
    `  amount?: number;`,
    `  variant?: "default" | "muted" | "danger";`,
    `}`,
    ``,
    `/** Presentational shell — no real product behavior. */`,
    `export const ${name}: FC<${name}Props> = ({ title, subtitle, amount, variant = "default" }) => (`,
    `  <section className={\`ledger-${name.toLowerCase()} ledger-${name.toLowerCase()}--\${variant}\`}>`,
    `    <header>`,
    `      <h2>{title}</h2>`,
    `      {subtitle ? <p>{subtitle}</p> : null}`,
    `    </header>`,
    ...bodyLines,
    `  </section>`,
    `);`,
    ``,
    `export default ${name};`,
  ].join("\n");
}

mkdirSync(join(root, "pages"), { recursive: true });
mkdirSync(join(root, "components"), { recursive: true });

for (const p of pages) {
  const path = join(root, "pages", `${p}Page.tsx`);
  if (p === "Dashboard" || p === "Transactions") continue;
  writeFileSync(
    path,
    tsx(`${p}Page`, [
      `    <div className="ledger-page-content">`,
      `      <p>Mock ${p} view — static placeholder.</p>`,
      `      {amount != null ? <strong>{amount.toFixed(2)}</strong> : null}`,
      `    </div>`,
    ]),
  );
}

for (const c of components) {
  writeFileSync(
    join(root, "components", `${c}.tsx`),
    tsx(c, [
      `    <div className="ledger-component-body">`,
      `      <span>{title}</span>`,
      `      {amount != null ? <data value={amount}>{amount}</data> : null}`,
      `    </div>`,
    ]),
  );
}

console.log("Scaffolded ledger-lite pages/components (skipped Dashboard/Transactions).");
