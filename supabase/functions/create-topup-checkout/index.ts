// PRODUCTION wallet top-up via Stripe Connect Checkout (test mode to start).
// This is the real path that replaces the `wallet-topup` demo function.
//
// To activate on the Demo project:
//   1. Set a Stripe secret in Supabase → Edge Functions → Secrets:
//        STRIPE_SECRET_KEY = sk_test_...        (test mode)
//        STRIPE_WEBHOOK_SECRET = whsec_...      (from the webhook you create)
//   2. Deploy this function (verify_jwt = true) and a `stripe-webhook` function.
//   3. In Stripe (test mode) add a webhook to
//        https://<ref>.supabase.co/functions/v1/stripe-webhook
//      for `checkout.session.completed`.
//
// Flow: app calls this → we create a Checkout Session for the £ amount, storing
// the member_id in metadata → app opens the returned URL → member pays with a
// test card (4242 4242 4242 4242) → Stripe fires checkout.session.completed →
// the webhook calls wallet_topup(member_id, amount, session_id) with the service
// role. The client never credits its own wallet.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      httpClient: Stripe.createFetchHttpClient(),
    });
    const admin = createClient(url, service);

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

    const { amount_pennies, success_url, cancel_url } = await req.json();
    const amount = Number(amount_pennies);
    if (!Number.isInteger(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'bad_amount' }), { status: 400, headers: cors });
    }

    const { data: bm } = await admin
      .from('booking_members')
      .select('id, club_id, clubs(stripe_account_id)')
      .eq('auth_user_id', user.id)
      .single();
    if (!bm) return new Response(JSON.stringify({ error: 'no_member' }), { status: 404, headers: cors });

    const connectedAccount = (bm as { clubs?: { stripe_account_id?: string } }).clubs?.stripe_account_id;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: { name: 'PBTable wallet top-up' },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        // Credited to the member's wallet by the webhook on completion.
        metadata: { member_id: bm.id, amount_pennies: String(amount), kind: 'wallet_topup' },
        payment_intent_data: { metadata: { member_id: bm.id, amount_pennies: String(amount) } },
        success_url: success_url ?? 'https://demo.pbtable.com/wallet?topup=success',
        cancel_url: cancel_url ?? 'https://demo.pbtable.com/wallet?topup=cancelled',
      },
      // Route the charge to the club's connected account (Stripe Connect).
      connectedAccount ? { stripeAccount: connectedAccount } : undefined
    );

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
