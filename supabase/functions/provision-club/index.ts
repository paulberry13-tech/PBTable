// PBTable — provision-club
// Provisions a club end-to-end after payment. Called by stripe-webhook (and invokable
// directly for testing). Public endpoint ("Verify JWT" OFF) gated by a shared secret.
//
// Steps:
//   1. public.provision_club(sid)  — DB work (slug, club, link sub, admin user, club_admins). Idempotent.
//   2. Netlify API                 — add <slug>.pbtable.com as a domain alias (so it gets SSL).
//   3. Brevo API                   — send the branded welcome email ONCE (gated on subscriptions.onboarded_at).
//
// Secrets: PROVISION_SECRET (gate). Optional: BREVO_API_KEY, NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID
// (each step degrades gracefully + reports if its secret is absent, so the DB layer can be
// tested before the others are wired). SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-provided.

const APEX = "pbtable.com";

async function ensureNetlifyAlias(siteId: string, token: string, domain: string): Promise<string> {
  const h = { Authorization: `Bearer ${token}` };
  const siteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers: h });
  if (!siteRes.ok) return `error get-site ${siteRes.status}`;
  const site = await siteRes.json();
  const aliases: string[] = site.domain_aliases ?? [];
  if (aliases.includes(domain)) return "present";
  const patch = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: "PATCH",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ domain_aliases: [...aliases, domain] }),
  });
  return patch.ok ? "added" : `error patch ${patch.status}`;
}

async function sendWelcome(apiKey: string, toEmail: string, toName: string, clubName: string, clubUrl: string): Promise<string> {
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:540px;margin:0 auto;color:#1B2B4B">
      <h2 style="color:#1B2B4B">Your PBTable club is live 🎉</h2>
      <p>Hi ${toName || "there"},</p>
      <p><strong>${clubName}</strong> is now set up on PBTable. Your league board lives here:</p>
      <p style="margin:24px 0">
        <a href="${clubUrl}" style="background:#C2410C;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;display:inline-block">Open your dashboard</a>
      </p>
      <p><strong>To manage it:</strong> open your dashboard, click <em>Admin</em>, and enter this email
      (<strong>${toEmail}</strong>). We'll email you a one-time 6-digit code to sign in — no password needed.</p>
      <p style="color:#64748b;font-size:13px">Your address: <a href="${clubUrl}">${clubUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#94a3b8;font-size:12px">Powered by PBTable · RDR</p>
    </div>`;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", "accept": "application/json" },
    body: JSON.stringify({
      sender: { name: "PBTable", email: "noreply@pbtable.co.uk" },
      to: [{ email: toEmail, name: toName || undefined }],
      subject: `Your PBTable club is live — ${clubName}`,
      htmlContent: html,
    }),
  });
  return res.ok ? "sent" : `error ${res.status}`;
}

Deno.serve(async (req) => {
  try {
    const gate = Deno.env.get("PROVISION_SECRET");
    if (!gate || req.headers.get("x-provision-secret") !== gate) {
      return new Response("Forbidden", { status: 403 });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const sid = body.stripe_subscription_id;
    if (!sid) return new Response("Missing stripe_subscription_id", { status: 400 });

    // 1. DB provisioning (idempotent)
    const rpc = await fetch(`${url}/rest/v1/rpc/provision_club`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_stripe_subscription_id: sid }),
    });
    const prov = await rpc.json();
    if (!rpc.ok || !prov?.ok) {
      return new Response(JSON.stringify({ ok: false, step: "provision_club", detail: prov }), { status: 500 });
    }
    const slug: string = prov.slug;
    const domain = `${slug}.${APEX}`;
    const clubUrl = `https://${domain}`;

    // 2. Netlify subdomain alias (optional)
    let netlify = "skipped (no NETLIFY secrets)";
    const ntoken = Deno.env.get("NETLIFY_AUTH_TOKEN");
    const nsite = Deno.env.get("NETLIFY_SITE_ID");
    if (ntoken && nsite) {
      try { netlify = await ensureNetlifyAlias(nsite, ntoken, domain); }
      catch (e) { netlify = "error " + (e as Error).message; }
    }

    // 3. Welcome email — exactly once (optional)
    let email = "skipped (no BREVO_API_KEY)";
    const brevo = Deno.env.get("BREVO_API_KEY");
    if (brevo && prov.admin_email) {
      if (prov.onboarded_at) {
        email = "skipped (already onboarded)";
      } else {
        try { email = await sendWelcome(brevo, prov.admin_email, prov.admin_name, prov.club_name, clubUrl); }
        catch (e) { email = "error " + (e as Error).message; }
        if (email === "sent") {
          await fetch(`${url}/rest/v1/subscriptions?stripe_subscription_id=eq.${encodeURIComponent(sid)}`, {
            method: "PATCH",
            headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ ...prov, club_url: clubUrl, netlify, email }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response("Crashed: " + ((e as Error)?.message ?? String(e)), { status: 500 });
  }
});
