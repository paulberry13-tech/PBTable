// twoclear — create-checkout-session
// Creates a Stripe embedded Checkout session for a club subscription that starts with a 30-day trial.
// Public endpoint (auth: 'none'); only the allowlisted prices are accepted.
// Secret required: STRIPE_SECRET_KEY  (set under Edge Functions -> Secrets)
//
// THE TRIAL (decided 1 Oct 2026, built 24 Oct 2026): every plan starts with 30 free days, a card is
// taken up front, and the first charge is on day 30. Stripe sends its own "trial ending" email 7 days
// before (Settings -> Billing -> Subscriptions and emails) and the webhook marks the row 'trialing'
// until then. Cancelling inside the trial means nothing is ever charged.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "npm:stripe@^17.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const TRIAL_DAYS = 30;

// Only these prices may ever be purchased (stops anyone tampering with amounts).
const ALLOWED: Record<string, { plan: string; billing: string }> = {
  // twoclear catalogue. Founding clubs pay £19/£190 on Club via promotion codes, not separate prices.
  "price_1UL2ru1uDFkhZnppv4rnx9a7": { plan: "social",     billing: "monthly" }, // £12
  "price_1UL2tY1uDFkhZnpphNnMA06u": { plan: "social",     billing: "annual"  }, // £120
  "price_1UL2uV1uDFkhZnppMXyCE4xy": { plan: "club",       billing: "monthly" }, // £29
  "price_1UL2vI1uDFkhZnppC71P0DcV": { plan: "club",       billing: "annual"  }, // £290
  "price_1UL2wA1uDFkhZnppRCjgogHj": { plan: "membership", billing: "monthly" }, // £39
  "price_1UL2wu1uDFkhZnppqGT9e0lc": { plan: "membership", billing: "annual"  }, // £390
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export default {
  fetch: withSupabase({ auth: "none" }, async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      const { priceId, name, email, club, termsVersion } = await req.json();
      const meta = ALLOWED[priceId];
      if (!meta) return json({ error: "Invalid plan selected." }, 400);
      if (!name || !email || !club) return json({ error: "Please add your name, email and club." }, 400);
      if (typeof termsVersion !== "string" || !termsVersion) {
        return json({ error: "Please accept the Terms of Service and Data Processing Agreement." }, 400);
      }
      // Record of acceptance: which Terms version the club ticked, and when.
      const terms = { terms_version: termsVersion.slice(0, 20), terms_accepted_at: new Date().toISOString() };

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        allow_promotion_codes: true,         // shows an "Add promotion code" field at checkout
        payment_method_collection: "always", // the trial takes a card up front, so day 30 just works
        subscription_data: {
          trial_period_days: TRIAL_DAYS,
          // A card is always collected above; if one were ever missing at day 30, cancel rather than
          // leave a half-live club.
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          metadata: { club, contact_name: name, plan: meta.plan, billing: meta.billing, ...terms },
        },
        metadata: {
          club, contact_name: name, contact_email: email,
          plan: meta.plan, billing: meta.billing, price_id: priceId, ...terms,
        },
        return_url: "https://twoclear.co.uk/?checkout=complete&session_id={CHECKOUT_SESSION_ID}#trial",
      });

      return json({ clientSecret: session.client_secret });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }),
};
