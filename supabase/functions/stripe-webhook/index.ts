// PBTable — stripe-webhook  (robust + self-diagnosing)
// Public because "Verify JWT" is OFF; secured by the Stripe signature check.
// Writes to the DB via the REST API directly (no extra libraries to load).
// Secrets required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import Stripe from "npm:stripe@^17.0.0";

const periodEnd = (sub: any): string | null => {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
};

async function dbWrite(method: string, path: string, prefer: string, row: unknown, url: string, key: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": prefer,
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const missing: string[] = [];
    if (!stripeKey) missing.push("STRIPE_SECRET_KEY");
    if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length) return new Response("Missing env: " + missing.join(", "), { status: 500 });

    const stripe = new Stripe(stripeKey!, { httpClient: Stripe.createFetchHttpClient() });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();

    const sig = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret!, undefined, cryptoProvider);
    } catch (e) {
      return new Response("Bad signature: " + (e as Error).message, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as any;
      const m = s.metadata ?? {};
      await dbWrite("POST", "subscriptions?on_conflict=stripe_subscription_id",
        "resolution=merge-duplicates,return=minimal", {
        stripe_subscription_id: s.subscription,
        stripe_customer_id: s.customer,
        contact_name: m.contact_name ?? null,
        contact_email: m.contact_email ?? s.customer_details?.email ?? null,
        club_name: m.club ?? null,
        plan: m.plan ?? null,
        billing: m.billing ?? null,
        price_id: m.price_id ?? null,
        status: "active",
        updated_at: new Date().toISOString(),
      }, supabaseUrl!, serviceKey!);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      await dbWrite("PATCH", "subscriptions?stripe_subscription_id=eq." + sub.id,
        "return=minimal", {
        status: sub.status,
        current_period_end: periodEnd(sub),
        updated_at: new Date().toISOString(),
      }, supabaseUrl!, serviceKey!);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("Crashed: " + ((e as Error)?.message ?? String(e)), { status: 500 });
  }
});
