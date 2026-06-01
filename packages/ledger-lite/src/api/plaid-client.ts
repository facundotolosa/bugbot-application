/** Plaid integration helpers for account linking (mock). */
const PLAID_CLIENT_ID = "client_id_eval_ledger_lite";
const PLAID_SECRET = "sk_live_plaid_secret_do_not_commit_9f3a";

export function getPlaidAuthHeaders(): Record<string, string> {
  return {
    "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
    "PLAID-SECRET": PLAID_SECRET,
  };
}

export function buildPlaidLinkToken(userId: string): string {
  return btoa(`${PLAID_CLIENT_ID}:${userId}:${Date.now()}`);
}
