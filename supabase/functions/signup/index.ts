import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public member sign-up (verify_jwt = false). Creates a CONFIRMED auth user via
// the Admin API (Demo has email confirmation on with no mail delivery), then
// creates their booking_members row and links it to a matching player if one
// exists. The app then signs in with the same password. Always returns HTTP 200
// with { ok } or { ok:false, error } so the client reads the message directly.
Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown) =>
    new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, service);

    const { email, password, display_name, club_slug } = await req.json().catch(() => ({}));
    if (!email || !password || String(password).length < 6) {
      return json({ ok: false, error: 'Enter an email and a password of at least 6 characters.' });
    }

    const { data: club } = await admin.from('clubs').select('id').eq('slug', club_slug || 'swindon').single();
    if (!club) return json({ ok: false, error: 'Club not found.' });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name ?? '' },
    });
    if (cErr || !created.user) {
      const already =
        cErr?.message?.toLowerCase().includes('already') ||
        cErr?.message?.toLowerCase().includes('registered');
      return json({
        ok: false,
        error: already ? 'That email already has an account — sign in instead.' : (cErr?.message ?? 'Sign-up failed.'),
      });
    }

    let playerId: string | null = null;
    if (display_name) {
      const { data: pl } = await admin
        .from('players')
        .select('id')
        .eq('club_id', club.id)
        .ilike('name', display_name)
        .limit(1)
        .maybeSingle();
      playerId = pl?.id ?? null;
    }

    const { error: bmErr } = await admin.from('booking_members').insert({
      club_id: club.id,
      auth_user_id: created.user.id,
      email,
      display_name: display_name || email,
      player_id: playerId,
    });
    if (bmErr) return json({ ok: false, error: bmErr.message });

    return json({ ok: true, linked_player: !!playerId });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
