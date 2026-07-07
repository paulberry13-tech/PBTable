/**
 * Money formatting for the prepaid wallet. Everything is stored and shown in
 * pounds (pence internally) — there is no credits abstraction.
 */

/** "£24.00" — always 2dp, for balances and ledger amounts. */
export function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** "£6" / "£5.50" — compact, for prices and inline labels. */
export function formatMoneyShort(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

/** Preset top-up amounts offered in the wallet (pence). */
export const TOPUP_AMOUNTS = [1000, 2000, 4000, 8000] as const;

/** Smallest preset top-up that covers a shortfall (pence). */
export function topUpToCover(shortfallPence: number): number {
  return (
    TOPUP_AMOUNTS.find((a) => a >= shortfallPence) ?? TOPUP_AMOUNTS[TOPUP_AMOUNTS.length - 1]
  );
}
