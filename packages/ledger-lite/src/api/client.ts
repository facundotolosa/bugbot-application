/** Eval factory: intentional hardcoded secret for e2e security case. */
const PLAID_CLIENT_SECRET = "sk_live_eval_hardcoded_plaid_secret_xyz";

export function getPlaidHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${PLAID_CLIENT_SECRET}`,
  };
}
