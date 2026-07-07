/**
 * Credits are a DISPLAY LAYER over the pence balance — money is the source
 * of truth (Member.balancePence). One credit is worth a fixed amount; the
 * club sells credits in whole numbers, but because sessions can be priced at
 * any amount (£5, £7…) a balance won't always be a whole number of credits,
 * so we format to at most one decimal place.
 */

export const CREDIT_PENCE = 200; // 1 credit = £2.00

export const creditsFromPence = (pence: number): number => pence / CREDIT_PENCE;
export const penceFromCredits = (credits: number): number => Math.round(credits * CREDIT_PENCE);

/** "12 credits" / "9.5 credits" / "1 credit". */
export function formatCredits(pence: number): string {
  const credits = creditsFromPence(pence);
  const rounded = Math.round(credits * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${rounded === 1 ? 'credit' : 'credits'}`;
}

/** "£24.00" — plain money, always 2dp for a wallet balance. */
export function formatMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** Whole-credit top-up bundles offered in the top-up sheet. */
export const TOPUP_BUNDLES = [5, 10, 20, 40] as const;

/** Smallest whole-credit top-up that covers a shortfall (in pence). */
export function bundleToCover(shortfallPence: number): number {
  const credits = Math.max(1, Math.ceil(shortfallPence / CREDIT_PENCE));
  return penceFromCredits(credits);
}
