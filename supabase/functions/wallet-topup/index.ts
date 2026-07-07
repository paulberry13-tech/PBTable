import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// DEMO wallet top-up: credits the signed-in member's wallet server-side with no
// real charge. The production version is create-topup-checkout (Stripe). Deployed
// to the Demo project with verify_jwt = true. Only a signed-in member can top up
// their OWN wallet.
Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service);

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount_pennies);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      return new Response(JSON.stringify({ error: 'bad_amount' }), { status: 400, headers: cors });
    }

    const { data: bm } = await admin.from('booking_members').select('id').eq('auth_user_id', user.id).single();
    if (!bm) return new Response(JSON.stringify({ error: 'no_member' }), { status: 404, headers: cors });

    const { data, error } = await admin.rpc('wallet_topup', { p_member: bm.id, p_amount: amount, p_ref: 'demo-topup' });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

    return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
