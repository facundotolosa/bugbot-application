import type { FC } from "react";

export interface MerchantLabelProps {
  /** Raw merchant label — may include user-supplied HTML from imports. */
  html: string;
}

/** Renders merchant name with optional rich formatting from bank feed. */
export const MerchantLabel: FC<MerchantLabelProps> = ({ html }) => (
  <span
    className="ledger-merchant-label"
    dangerouslySetInnerHTML={{ __html: html }}
  />
);

export default MerchantLabel;
