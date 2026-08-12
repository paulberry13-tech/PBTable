// Tournament Manager — entry-webhook
// Marks an entry fee paid (or refunded) from Stripe. Public because "Verify JWT" is OFF;
// secured by the Stripe signature check, exactly like PBTable's stripe-webhook.
//
// Marking a payment 'paid' is all this has to do: the DB trigger entry_payments_status
// recalculates the entry and promotes it to 'entered' once the roster is full AND every
// player's fee is settled — so the competitive state can never drift from the money.
//
// Secrets required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import Stripe from "npm:stripe@^17.0.0";

async function patch(path: string, row: unknown, url: string, key: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    const stripeKey    = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl  = Deno.env.get("SUPABASE_URL");
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const missing: string[] = [];
    if (!stripeKey)     missing.push("STRIPE_SECRET_KEY");
    if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
    if (!supabaseUrl)   missing.push("SUPABASE_URL");
    if (!serviceKey)    missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length) return new Response("Missing env: " + missing.join(", "), { status: 500 });

    const stripe = new Stripe(stripeKey!, { httpClient: Stripe.createFetchHttpClient() });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    const sig = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body, sig!, webhookSecret!, undefined, cryptoProvider);
    } catch (e) {
      return new Response("Bad signature: " + (e as Error).message, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as any;
      if (s.payment_status === "paid") {
        // Settle by SESSION, not by a single id: one checkout can cover several events,
        // and the session id was stamped on every fee in that basket before redirect.
        // Guarded to rows still outstanding so a replayed event cannot revive a refund.
        await patch(
          `entry_payments?stripe_session_id=eq.${s.id}&status=in.("pending","failed")`, {
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent: s.payment_intent ?? null,
        }, supabaseUrl!, serviceKey!);
      }
    }

    // An organiser refunding in the Stripe dashboard is reflected back into the entry.
    if (event.type === "charge.refunded") {
      const c = event.data.object as any;
      const pi = c.payment_intent;
      if (pi) {
        await patch(`entry_payments?stripe_payment_intent=eq.${pi}`, {
          status: "refunded", refunded_at: new Date().toISOString(),
        }, supabaseUrl!, serviceKey!);
      }
    }

    if (event.type === "checkout.session.expired") {
      const s = event.data.object as any;
      await patch(`entry_payments?stripe_session_id=eq.${s.id}&status=eq.pending`, {
        stripe_session_id: null,
      }, supabaseUrl!, serviceKey!);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("Crashed: " + ((e as Error)?.message ?? String(e)), { status: 500 });
  }
});
