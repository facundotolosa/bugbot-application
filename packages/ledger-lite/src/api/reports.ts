import { MOCK_MONTHLY_REPORTS, reportForMonth } from "../data/reports.fixture";
import type { MonthlyReport } from "../types/ledger";

export type { MonthlyReport };

export function fetchReports(): MonthlyReport[] {
  return MOCK_MONTHLY_REPORTS.map((r) =>
    r.byCategory && Object.keys(r.byCategory).length > 0 ? r : reportForMonth(r.month),
  );
}
