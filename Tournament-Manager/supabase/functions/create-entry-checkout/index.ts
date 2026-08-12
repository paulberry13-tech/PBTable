// Tournament Manager — create-entry-checkout
// Creates ONE Stripe Checkout session covering one or more of the caller's outstanding
// entry fees. A player who entered three events pays once, not three times.
//
// Amounts are NEVER taken from the client: the caller sends entry ids only, and every
// amount is read from that player's own entry_payments rows. A tampered request cannot
// change a price, and cannot reach anybody else's fee (rows are filtered by account_id).
//
// The session id is stamped on each row before redirect, so the webhook can settle the
// whole basket by session without relying on metadata size limits.
//
// Secrets required (Edge Functions -> Secrets): STRIPE_SECRET_KEY
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically.)

import Stripe from "npm:stripe@^17.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function db(path: string, url: string, key: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      "Content-Type": "application/json", ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripeKey   = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const missing: string[] = [];
    if (!stripeKey)   missing.push("STRIPE_SECRET_KEY");
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!serviceKey)  missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length) {
      return json({ error: `Card payment is not switched on for this tournament yet ` +
                           `(missing ${missing.join(", ")}). Pay the organiser directly for now.` }, 503);
    }

    const body = await req.json();
    // accept a single entryId (older callers) or a list
    const entryIds: string[] = Array.isArray(body.entryIds) && body.entryIds.length
      ? body.entryIds : (body.entryId ? [body.entryId] : []);
    const returnUrl = body.returnUrl;
    if (!entryIds.length) return json({ error: "No entries were given to pay for." }, 400);
    if (entryIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return json({ error: "Bad entry reference." }, 400);
    }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in before paying." }, 401);
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey!, Authorization: `Bearer ${jwt}` },
    });
    if (!userRes.ok) return json({ error: "Your session has expired — sign in again." }, 401);
    const user = await userRes.json();

    // The payment rows ARE the price list. Scoped to this caller and to fees still due.
    const inList = entryIds.map((i) => `"${i}"`).join(",");
    const rows = await db(
      `entry_payments?entry_id=in.(${inList})&account_id=eq.${user.id}` +
      `&status=in.("pending","failed")&select=id,amount_pence,currency,entry_id`,
      supabaseUrl!, serviceKey!);
    const due = (rows ?? []).filter((r: any) => r.amount_pence > 0);
    if (!due.length) return json({ error: "You have nothing outstanding on those entries." }, 409);

    // Name each line from the DB so the receipt reads properly.
    const ctx = await db(
      `entries?id=in.(${inList})&select=id,events(name,tournaments(name,currency))`,
      supabaseUrl!, serviceKey!);
    const nameOf = new Map<string, string>();
    let tournName = "";
    for (const e of ctx ?? []) {
      nameOf.set(e.id, e.events?.name ?? "Tournament entry");
      tournName = e.events?.tournaments?.name ?? tournName;
    }

    const stripe = new Stripe(stripeKey!, { httpClient: Stripe.createFetchHttpClient() });
    const base = typeof returnUrl === "string" && returnUrl.startsWith("http")
      ? returnUrl : "https://pbtable.com/";
    const sep = base.includes("?") ? "&" : "?";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: due.map((r: any) => ({
        quantity: 1,
        price_data: {
          currency: r.currency ?? "gbp",
          unit_amount: r.amount_pence,
          product_data: {
            name: nameOf.get(r.entry_id) ?? "Tournament entry",
            description: `Entry fee (your share)${tournName ? " — " + tournName : ""}`,
          },
        },
      })),
      metadata: { account_id: user.id, fee_count: String(due.length) },
      success_url: `${base}${sep}paid=1`,
      cancel_url: `${base}${sep}paid=0`,
    });

    // Stamp the session on every row in the basket — the webhook settles by session, so
    // this works however many fees were bundled.
    for (const r of due) {
      await db(`entry_payments?id=eq.${r.id}`, supabaseUrl!, serviceKey!, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ stripe_session_id: session.id }),
      });
    }

    return json({
      url: session.url,
      sessionId: session.id,
      count: due.length,
      total: due.reduce((a: number, r: any) => a + r.amount_pence, 0),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
