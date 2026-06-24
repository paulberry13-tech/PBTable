// PBTable — create-checkout-session
// Creates a Stripe embedded Checkout session for a subscription.
// Public endpoint (auth: 'none'); only the 4 allowlisted prices are accepted.
// Secret required: STRIPE_SECRET_KEY  (set under Edge Functions -> Secrets)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "npm:stripe@^17.0.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

// Only these prices may ever be purchased (stops anyone tampering with amounts).
const ALLOWED: Record<string, { plan: string; billing: string }> = {
  "price_1TlW2x1uDFkhZnpp0khvPajy": { plan: "founder", billing: "monthly" }, // £19
  "price_1TlW2s1uDFkhZnppmc05X2hW": { plan: "founder", billing: "annual"  }, // £190
  "price_1TlW2v1uDFkhZnppHJvcXiSi": { plan: "club",    billing: "monthly" }, // £29
  "price_1TlW2o1uDFkhZnpp2kWsWrsD": { plan: "club",    billing: "annual"  }, // £290
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
      const { priceId, name, email, club } = await req.json();
      const meta = ALLOWED[priceId];
      if (!meta) return json({ error: "Invalid plan selected." }, 400);
      if (!name || !email || !club) return json({ error: "Please add your name, email and club." }, 400);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        allow_promotion_codes: true,              // shows an "Add promotion code" field at checkout
        payment_method_collection: "if_required", // a 100%-off (£0) checkout won't even ask for a card
        subscription_data: {
          metadata: { club, contact_name: name, plan: meta.plan, billing: meta.billing },
        },
        metadata: {
          club, contact_name: name, contact_email: email,
          plan: meta.plan, billing: meta.billing, price_id: priceId,
        },
        return_url: "https://pbtable.com/?checkout=complete&session_id={CHECKOUT_SESSION_ID}#order",
      });

      return json({ clientSecret: session.client_secret });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }),
};
