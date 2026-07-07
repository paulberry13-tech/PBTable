import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// PBTable Bookings — wallet top-up webhook. SEPARATE from the subscription
// `stripe-webhook`. On checkout.session.completed it credits the member's wallet
// via wallet_topup, idempotent on the checkout session id. Uses the raw body +
// the Deno SubtleCrypto provider for signature verification (a Deno requirement).
//
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET. Deploy with verify_jwt = false (Stripe sends no JWT).
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as { id: string; metadata?: Record<string, string> };
    const memberId = s.metadata?.member_id;
    const amount = parseInt(s.metadata?.amount_pennies ?? '0', 10);
    if (memberId && amount > 0) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: existing } = await admin
        .from('credits_ledger')
        .select('id')
        .eq('stripe_checkout_session_id', s.id)
        .maybeSingle();
      if (!existing) {
        await admin.rpc('wallet_topup', { p_member: memberId, p_amount: amount, p_ref: s.id });
      }
    }
  }
  return new Response('ok', { status: 200 });
});
