# twoclear migration: handoff to the production session

From the parallel session that set up twoclear.co.uk (26 Sep 2026). Go-live for clubs is
**Friday 2 October**. Both brands run side by side from one bundle until pbtable is switched off.

---

## 1. Needs pushing: link previews for twoclear links

**Not on GitHub yet.** It exists only as a patch:

`C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\Marketing\twoclear-link-previews.patch`

One commit, two new files, nothing existing touched:

- `netlify/edge-functions/twoclear-preview.js`: the repo's first edge function
- `site/brand/twoclear/og.png`: 600px preview image (white badge on navy #101828)

**Why:** WhatsApp, iMessage and Facebook build link cards from `<head>` without running the page's
JavaScript, so a shared twoclear link still previews as "PBTable: your club's pickleball hub" with
the PBTable logo. Clubs will share twoclear links to announce the move, so this needs to be live
**before** they do (WhatsApp caches a link's card once fetched).

**What it does:** for `<slug>.twoclear.co.uk` only, it rewrites `<title>`, description, og:site_name,
og:title/image and twitter:title/image to "Swindon Pickleball Club · twoclear" + the twoclear image.
The club name comes from `clubs?select=name&slug=eq.<slug>` with the publishable key, and the lookup
is abandoned after 1.5s. www/demo/unknown slugs get "twoclear: your club's pickleball hub". Every other
host (pbtable included) returns immediately and is never touched. Any failure serves the page unchanged.
Path config is in the file (`['/', '/index.html']`), so no `netlify.toml` change.

**Tested:** 18/18 checks against the real page HTML: club names, pbtable passthrough, rest of the page
byte-identical, database down, database hanging, `&` / quotes / `$` in a club name, error and non-HTML
responses untouched. Proven to apply cleanly on top of `53f5cae`.

**To apply** (in the PBTable-Production folder, on an up-to-date main):

```
git fetch origin && git checkout main && git pull --ff-only
git am "C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\Marketing\twoclear-link-previews.patch"
node tools/checkjsx.cjs site/index.html
```

**After pushing, verify as a crawler sees it** (should show the club name, "twoclear" and the og.png URL):

```
curl -s -A "WhatsApp/2.23" https://swindon.twoclear.co.uk/ | grep -E "og:title|og:image|<title>"
curl -s -A "WhatsApp/2.23" https://swindon.pbtable.com/ | grep -E "og:title|<title>"
```

The second should still say PBTable. Also load `https://swindon.twoclear.co.uk` in a browser to
confirm the dashboard still works.

---

## 2. Already live on main (from this session), for context

| Commit | What |
|---|---|
| `dc883c6` | Club resolver accepts `*.twoclear.co.uk` (regex `\.(?:pbtable\.com\|twoclear\.co\.uk)$`, a two-part TLD), `demo.twoclear.co.uk` goes to demo. nexorally removed. |
| `f315cbb` | Host-based brand switch in `site/index.html` + `site/permissions.html`, assets in `site/brand/twoclear/`. |
| `872f16a` | Sign-in wording "Enter your email…" patched straight into the built /app bundle (you then renamed it to `entry-d10471dc…` in `29ff7c6`, thanks). |

Live and verified: `glos` and `swindon` on twoclear show twoclear branding, pbtable is unchanged.

---

## 3. Conventions to keep, or twoclear will quietly show PBTable

- **`BRAND` global** (defined in the head `<script>` right after `PB`): `BRAND.key` (`'twoclear'` or
  `'pbtable'`), `BRAND.name` (`'twoclear'` / `'PBTable'`), `BRAND.email`, `BRAND.apex`.
  **Any new user-facing copy that names the platform must use `BRAND.name`, never a literal "PBTable".**
  The same goes for contact emails (`BRAND.email`) and example addresses (`yourclub.${BRAND.apex}`).
  (The name is lowercase "twoclear" in running text; Paul's call.)
- **Logos:** `PBLogo` (navy header fallback) and `PBMark` (footer / stamp / side panel, `onDark` prop)
  both switch to `<BrandBadge>` on twoclear. The twoclear badge is **never cropped to a circle** (brand
  rules). `variant="auto"` renders both badges and CSS (`.tc-badge`, `[data-theme="midnight-court"]`)
  shows the right one, including on a live dark-mode toggle.
- **Club colour themes are deliberately unchanged** on twoclear (Paul's call).
- **`site/permissions.html` has its own two resolvers** (access gate + club lookup). Both accept
  twoclear, and branding there uses `BRAND_NAME` / `BRAND_EMAIL` / `.brand-name` spans.
- **Pre-push hook:** a fresh clone doesn't run `.githooks/pre-push` until
  `git config core.hooksPath .githooks`. This session's earlier pushes skipped it unknowingly;
  checkjsx was run afterwards on live main and passed.

---

## 4. Uncommitted source change in the main PBTable repo

`PBTable Bookings/src/components/SignIn.tsx` has the "Enter your email" wording (sign-in text, empty-box
error, doc comment) so the next real /app build keeps what is live. It sits **uncommitted alongside
other in-flight edits in that file** (the `getClubSlug()` native-club changes, not from this session).
That Bookings tree has ~15 uncommitted files in total, which is why the /app wording was patched into
the built bundle rather than rebuilt.

---

## 5. Still to do before Friday (not started)

1. **/app favicon and fallback logo:** still PBTable (`Header.tsx` / `SignIn.tsx` fall back to
   `pbtable-logo.png` when a club has no logo). Needs a proper /app release.
2. **`site/rdr-guide.html`:** a generated self-contained doc with the PBTable logo embedded. Regenerate
   it with twoclear branding.
3. **Melksham:** `melkshamds.twoclear.co.uk` alias not added (Paul skipped it so far). The code already
   supports it; it's just the Netlify alias. Paul to decide if Melksham moves on Friday.
4. **Marketing site:** `twoclear.co.uk` apex is not attached to the marketing project yet (its DNS zone
   has no website record). The marketing copy/logo rebrand to twoclear is also outstanding.
5. **Email:** `hello@twoclear.co.uk` is live (M365 shared mailbox, DKIM on). `noreply@twoclear.co.uk`
   via Brevo is not set up. Plan: set it up, test on demo first, then switch Supabase Auth and
   `provision-club` senders. The DNS for twoclear.co.uk is in **Netlify**, not IONOS, and has ONE SPF
   record: add Brevo's `include:` to it rather than adding a second SPF record.
6. **New clubs:** `provision-club` still uses `APEX = 'pbtable.com'`, so a club created now gets a pbtable
   address. Switch it (and the Netlify-alias step) to twoclear.co.uk at go-live.
7. **After go-live:** 302 then 301 `<slug>.pbtable.com` → `<slug>.twoclear.co.uk` (keep the subdomain
   and path). Members will need to sign in once more on twoclear (sessions are per-address).
