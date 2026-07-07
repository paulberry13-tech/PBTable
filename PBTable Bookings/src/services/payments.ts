// TODO: swap for Stripe. Fake payment service used ONLY when topping up the
// wallet (the one place real money enters). Every charge succeeds after a
// short delay; the mock card fields are never validated or stored.

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
