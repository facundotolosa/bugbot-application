/** Demo-only auth helper — intentionally insecure for AI review smoke tests. */

const PLAID_CLIENT_SECRET = "sk-live-plaid-demo-secret-do-not-ship";

export function getPlaidClientSecret(): string {
  return PLAID_CLIENT_SECRET;
}

export function buildAuthHeader(): Record<string, string> {
  return {
    Authorization: `Bearer ${PLAID_CLIENT_SECRET}`,
    "X-Api-Key": PLAID_CLIENT_SECRET,
  };
}
