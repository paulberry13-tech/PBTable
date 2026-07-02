// TODO: swap for Stripe. Fake payment service — every charge succeeds after a
// short delay. The mock payment sheet collects card fields for realism but
// nothing is validated or stored.

export interface ChargeRequest {
  amountPence: number;
  description: string;
  /** Fake card fields — accepted verbatim, never validated or stored. */
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
  nameOnCard?: string;
}

export interface ChargeResult {
  success: true;
  receiptId: string;
  amountPence: number;
}

let receiptSeq = 5000;

export async function charge(request: ChargeRequest): Promise<ChargeResult> {
  await new Promise((resolve) => setTimeout(resolve, 900)); // "contacting your bank…"
  return { success: true, receiptId: `rcpt_${receiptSeq++}`, amountPence: request.amountPence };
}

export async function refund(amountPence: number): Promise<ChargeResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { success: true, receiptId: `rfnd_${receiptSeq++}`, amountPence };
}

export function formatPence(pence: number): string {
  if (pence === 0) return 'Free';
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}
