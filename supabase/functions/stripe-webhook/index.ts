// twoclear — stripe-webhook  (robust + self-diagnosing)
// Public because "Verify JWT" is OFF; secured by the Stripe signature check.
// Writes to the DB via the REST API directly (no extra libraries to load).
// Secrets required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// Optional (for a branded trial-ending email; Stripe's own reminder covers it until this is set):
//   RESEND_API_KEY   — enables the trial_will_end email (no-op if unset)
//   TRIAL_CONVERT_URL — where the "keep my club" button points (default the Stripe billing portal)
//   TRIAL_FROM       — from address (default "twoclear <noreply@pbtable.co.uk>")
//
// THE TRIAL (24 Oct 2026): checkout now starts every subscription with 30 free days, so the row's
// status comes from the subscription itself ('trialing', then 'active' when the first payment lands,
// 'past_due' / 'canceled' if it does not) rather than being hard-coded 'active' at checkout.

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

// Branded email via Resend. No-op until RESEND_API_KEY is set, so it's safe to ship early.
async function sendEmail(to: string | null, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("TRIAL_FROM") ?? "twoclear <noreply@pbtable.co.uk>",
      to: [to],
      subject,
      html,
    }),
  });
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
      // The subscription knows whether it is trialing and when the trial ends; the session does not.
      let sub: any = null;
      if (s.subscription) {
        try { sub = await stripe.subscriptions.retrieve(s.subscription); } catch { /* fall back below */ }
      }
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
        terms_version: m.terms_version ?? null,
        terms_accepted_at: m.terms_accepted_at ?? (m.terms_version ? new Date().toISOString() : null),
        status: sub?.status ?? "trialing",          // every checkout now starts a 30-day trial
        current_period_end: periodEnd(sub),          // during a trial this is the trial's end
        updated_at: new Date().toISOString(),
      }, supabaseUrl!, serviceKey!);
    }

    // A trial subscription created outside checkout (API/dashboard). Checkout trials also raise this
    // event, and the upsert on stripe_subscription_id makes the two paths agree.
    if (event.type === "customer.subscription.created" && (event.data.object as any).status === "trialing") {
      const sub = event.data.object as any;
      const m = sub.metadata ?? {};
      await dbWrite("POST", "subscriptions?on_conflict=stripe_subscription_id",
        "resolution=merge-duplicates,return=minimal", {
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        contact_name: m.contact_name ?? null,
        contact_email: m.contact_email ?? null,
        club_name: m.club ?? null,
        plan: m.plan ?? null,
        billing: m.billing ?? null,
        price_id: sub.items?.data?.[0]?.price?.id ?? m.price_id ?? null,
        terms_version: m.terms_version ?? null,
        terms_accepted_at: m.terms_accepted_at ?? (m.terms_version ? new Date().toISOString() : null),
        status: sub.status,               // "trialing"
        current_period_end: periodEnd(sub),
        updated_at: new Date().toISOString(),
      }, supabaseUrl!, serviceKey!);
    }

    // ~7 days before the trial ends (Stripe's default), the branded reminder, if Resend is configured.
    if (event.type === "customer.subscription.trial_will_end") {
      const sub = event.data.object as any;
      let email: string | null = sub.metadata?.contact_email ?? null;
      let name: string = sub.metadata?.contact_name ?? "there";
      if (!email && sub.customer) {
        try {
          const c = await stripe.customers.retrieve(sub.customer) as any;
          email = c?.email ?? null;
          if ((!sub.metadata?.contact_name) && c?.name) name = c.name;
        } catch { /* ignore */ }
      }
      const endsOn = sub.trial_end
        ? new Date(sub.trial_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
        : "soon";
      const link = Deno.env.get("TRIAL_CONVERT_URL") ?? "https://billing.stripe.com/p/login/5kQ9ALgYieik9YG7q9fEk00";
      await sendEmail(email, `Your twoclear free trial ends ${endsOn}`, `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#101828;max-width:520px;line-height:1.55">
          <h2 style="color:#101828;margin:0 0 12px">Your free trial ends ${endsOn}</h2>
          <p>Hi ${name}, we hope your club has been enjoying twoclear.</p>
          <p>Nothing to do if you'd like to carry on: your first payment is taken on ${endsOn} using the card you added, and your club keeps running exactly as it is.</p>
          <p>Not for you? Cancel any time before then from your billing page and you won't be charged.</p>
          <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:10px">Open my billing page</a></p>
          <p style="color:#475467;font-size:13px">Questions? Reply to this email and a person will answer.</p>
          <p style="color:#8a97ad;font-size:12px;margin-top:20px">twoclear is made by Nexlane</p>
        </div>
      `);
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      await dbWrite("PATCH", "subscriptions?stripe_subscription_id=eq." + sub.id,
        "return=minimal", {
        status: sub.status,
        price_id: sub.items?.data?.[0]?.price?.id ?? undefined,   // a plan change shows up here
        current_period_end: periodEnd(sub),
        updated_at: new Date().toISOString(),
      }, supabaseUrl!, serviceKey!);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("Crashed: " + ((e as Error)?.message ?? String(e)), { status: 500 });
  }
});
