# PBTable.com — Website Build Reference

> **Document purpose:** Complete record of the pbtable.com marketing website — what was built, every design and content decision made, the iteration history, technical architecture, Stripe integration status, and what to do next. Use this as the handoff document for any future Claude Code rebuild or developer handoff.

---

## 1. Project Overview

**Product:** PBTable — a live league ratings and leaderboard SaaS for UK pickleball clubs
**Website purpose:** Marketing and conversion — explain the product, build trust, and take direct orders
**Deployment:** Single self-contained HTML file on Netlify (drag-and-drop)
**Live URL:** pbtable.com (primary) / pbtable.co.uk (redirects to .com via IONOS 301)
**File:** `pbtable-website.html`
**Current file size:** ~70KB (no external assets, no build step required)

---

## 2. Build History — Iteration Log

The site went through six major iterations in a single session. Each is documented below.

### v1 — Initial build from prompt
Built from a detailed specification prompt that referenced the SPC dashboard aesthetic, business card designs, and the overall brand system. Included: nav, hero with SVG leaderboard mockup, stats bar, features, how it works, demo, pricing (3 cards), testimonial, FAQ, CTA banner, footer.

**Issues identified:** Logo was a 400KB base64 PNG embedded inline — rendered badly at small sizes and bloated the file. Real SPC player names visible in the demo table. Excessive section padding creating dead space. The `coming soon` Tournament Module card on pricing.

### v2 — Clean rebuild
Replaced the base64 logo with an inline SVG paddle icon. Replaced all real SPC player names with fictitious names. Tightened spacing throughout. Rebuilt the hero leaderboard mockup as a proper SVG illustration inside a browser chrome frame. Reduced file from 413KB to 51KB.

### v3 — Stripe integration + Order Now section
Added: Stripe Payment Element embedded in the page (not a redirect), Order Now section with two-column layout (plan selector + payment form), annual billing toggle, order summary card, removed all free trial language, removed the Coming Soon pricing card, reduced to two pricing cards (Founder + Club). Font changed to Ubuntu via Google Fonts.

### v4 — Cinematic hero redesign + engagement uplift
Complete hero overhaul inspired by world-class sports SaaS sites (Hudl, Linear, Stripe aesthetic):
- Animated mesh grid background (20s scroll loop)
- Three floating glowing orbs with independent float animations
- Scanline overlay for premium feel
- Hero headline draws an underline on page load
- Three floating stat cards orbiting the leaderboard (glassmorphism treatment)
- Leaderboard card with backdrop-filter blur and LIVE pulse badge
- Animated counters (count up from zero on scroll into view)
- Feature bento grid replacing plain card grid
- SVG rating chart that draws itself in on load
- Gradient timeline connector line with flowing animation
- Annual pricing (£190/year Founder, £290/year Club) added throughout

### v5 — Font change to Barlow
Ubuntu replaced with Barlow (body) + Barlow Condensed (headings, titles, numbers). Gives the site a bold, athletic, sports-forward feel. Barlow Condensed 800 used for all display elements.

### v6 — Headline change
Hero headline updated from *"The leaderboard your players can't stop checking"* to *"Give every player a rating worth fighting for"* — emotional, player-first, taps into competitive pride.

### Ongoing — RDR terminology
All references to `4DR` replaced with `RDR` (Rally Doubles Rating) throughout: meta description, hero copy, features, how it works, demo table header, FAQ.

---

## 3. Brand System

### Colour palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--navy` | `#1B2B4B` | Primary background, header, text on light |
| `--navy-deep` | `#0f1e38` | Hero background base, footer |
| `--navy-mid` | `#243660` | Gradient midpoints |
| `--coral` | `#D94F2B` | Primary CTA, accents, "Table" in wordmark, HOT badge |
| `--coral-light` | `#ff6844` | Gradient highlights |
| `--amber` | `#E8A020` | Star motif, stat numbers, #1 badge, annual note highlights |
| `--cream` | `#FAF7F2` | Light section backgrounds, card backs, Founder pricing card |
| `--mid` | `#F0F2F5` | Alternate light sections, Order section background |
| `--border` | `#E2E8F0` | Card borders, form inputs |
| `--green` | `#16a34a` | Upward position changes, success states |
| `--red` | `#dc2626` | Downward position changes, form errors |

### Typography

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| Display headlines | Barlow Condensed | 800 | Hero h1, section titles, counter numbers, pricing amounts |
| Eyebrows / labels | Barlow Condensed | 700 | Uppercase tracked caps throughout |
| Body copy | Barlow | 300–400 | Feature descriptions, FAQ answers, general prose |
| UI labels | Barlow | 500–600 | Nav links, button text, form labels |
| Wordmark | Barlow Condensed | 800 | "PB" white + "Table" coral |

Google Fonts load string:
```
https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400&family=Barlow+Condensed:wght@600;700;800&display=swap
```

### Wordmark treatment
"PB" always in white (on dark) or navy (on light). "Table" always in coral `#D94F2B`. Never rendered as a single colour. This split appears in the nav, footer, and any brand lockup.

### Logo
Inline SVG paddle icon — 34×34px, 7px corner radius, navy background. Inside: white paddle outline, navy fill, ascending coral bar chart (4 bars), coral rising arrow with arrowhead, amber 5-pointed star top-left, dark grip with diagonal texture lines. Used at 34px in nav and 30px in footer.

---

## 4. Page Structure

### Sections in order

| Section | Background | Purpose |
|---------|-----------|---------|
| Nav | Navy deep, glassmorphism blur | Fixed navigation, scrolled state adds coral border |
| Hero | Radial gradient dark navy | Headline, strapline, copy, CTAs, animated leaderboard visual |
| Counters | Cream | Animated stat strip (80+, 500+, 20 min, £29) |
| Features | Navy deep | 6-cell bento grid with inline SVG icons |
| How It Works | Dark navy gradient | 3-step timeline with animated connector |
| Demo | Cream | Live browser mockup with HTML leaderboard table |
| Pricing | White | 2 cards: Founder (£19/mo, £190/yr) + Club (£29/mo, £290/yr) |
| Testimonial | Navy gradient | Pull quote from SPC club admin |
| Order Now | Mid grey | Plan selector, annual toggle, order summary, Stripe payment form |
| FAQ | Cream | 7 accordion questions |
| Footer | Navy deep | Brand, tagline, nav links, copyright, domain links |

### Navigation links
Features · How It Works · Pricing · **Order Now** (coral CTA button)

---

## 5. Hero Section Detail

### Headline
> Give every player a rating **worth fighting for**

"worth fighting for" receives the coral colour treatment with an animated underline that draws from left to right on page load.

### Strapline
> *Ratings your players trust — and your club owns.*

This is perfect copy — do not change it. It answers both the player question ("can I trust this?") and the club admin question ("do I own this?").

### Body copy
> PBTable gives every player a live RDR rating, personal stats, and a leaderboard your whole club is invested in. Real data. Weekly engagement. Set up in under 20 minutes.

### CTAs
- Primary: **Order now** → `#order` (coral gradient button with box shadow)
- Secondary: **See live demo →** → `https://swindonpb.netlify.app` (ghost outline button)

### Hero visual — animated leaderboard card
A glassmorphism leaderboard card showing 6 fictitious players with:
- Gold/silver/bronze position circles for top 3
- Navy rounded-square badges for positions 4–6
- RDR ratings (4.812 down to 3.876)
- Up/down change arrows in green/red
- HOT badge on player 1 (K. Ashworth)
- LIVE pulse badge in the header
- Three floating stat cards: Club avg rating, Top mover (R. Nkemdirim ▲5), Sessions (52)

### Background animations
| Element | Animation | Duration |
|---------|-----------|----------|
| Grid mesh | `gridShift` — scrolls upward | 20s loop |
| Orb 1 (coral, top-right) | `orbFloat` — vertical float | 8s, delay 0s |
| Orb 2 (amber, bottom-left) | `orbFloat` | 8s, delay -3s |
| Orb 3 (blue, centre-right) | `orbFloat` | 8s, delay -5s |
| Floating stat card 1 | `floatCard` | 6s, delay 0s |
| Floating stat card 2 | `floatCard` | 6s, delay -2s |
| Floating stat card 3 | `floatCard` | 6s, delay -4s |
| Hero badge pulse dot | `pulse` | 2s loop |
| Headline underline | `lineGrow` (scaleX 0→1) | 0.8s, delay 0.8s |
| Hero content | `fadeSlideUp` stagger | 0.7s, delays 0–0.55s |
| Hero visual | `fadeSlideLeft` | 0.8s, delay 0.2s |

All animations respect `prefers-reduced-motion` — disabled entirely for users who have this set.

---

## 6. Features Section — Bento Grid

Six feature cells in a bento layout (tall left card spanning 2 rows, 2×2 grid right):

| Feature | Icon colour | Notes |
|---------|-------------|-------|
| Live RDR Ratings | Coral | Tall card with SVG line chart that draws itself in on load |
| Player Profiles | White/coral | Person icon with check |
| HOT Streak Badges | Amber/coral | Flame shape |
| Session Upload in Seconds | Coral | Upload arrow — spans 2 columns (wide card) |
| Live Club Leaderboard | Amber/coral | Bar chart |
| Admin Dashboard | White/coral | File/shield icon |

Cards have a `::before` radial gradient reveal on hover, plus `translateY(-3px)` lift and coral border colour transition.

---

## 7. Pricing Section

### Founder plan
- **Monthly:** £19/month
- **Annual:** £190/year (save 2 months)
- Tag: "LIMITED" ribbon (coral, rotated)
- For first 20 clubs only — grandfathered pricing forever
- CTA: "Order — Founder rate" → scrolls to `#order` and selects Founder plan

### Club plan (featured)
- **Monthly:** £29/month
- **Annual:** £290/year (save 2 months = save £58)
- Navy background, featured treatment
- CTA: "Order — Club plan" → scrolls to `#order` and selects Club plan

### Contact line (below cards)
> Have more than 150 players, multiple divisions, or other requirements? [Contact us](mailto:paul@pbtable.com) and we'll sort something out.

---

## 8. Order Now Section — Stripe Integration

### Architecture
The Order Now section is a two-column layout: plan selector + payment form. The Stripe Payment Element is embedded directly in the page — the card form lives on pbtable.com, not on a Stripe-hosted page.

### Current status
**The Stripe integration is scaffolded but not yet live.** The front-end is complete. To activate real payments, three things need to be done:

### Step 1 — Add your Stripe publishable key
In the JavaScript at the bottom of the file, find:
```javascript
const STRIPE_KEY = 'pk_test_REPLACE_WITH_YOUR_STRIPE_PUBLISHABLE_KEY';
```
Replace with your actual key from [dashboard.stripe.com](https://dashboard.stripe.com/apikeys). Use `pk_test_` for testing, `pk_live_` for production.

### Step 2 — Create products in Stripe Dashboard
Create four subscription products in Stripe and add the Price IDs:
```javascript
const PLANS = {
  founder: {
    monthly: { label:'Founder Rate',          amount:'£19',  priceId:'price_FOUNDER_MONTHLY_ID' },
    annual:  { label:'Founder Rate — Annual', amount:'£190', priceId:'price_FOUNDER_ANNUAL_ID' }
  },
  club: {
    monthly: { label:'Club Plan',             amount:'£29',  priceId:'price_CLUB_MONTHLY_ID' },
    annual:  { label:'Club Plan — Annual',    amount:'£290', priceId:'price_CLUB_ANNUAL_ID' }
  }
};
```
Price IDs start with `price_` and are found in Stripe Dashboard → Products.

### Step 3 — Create a Netlify Function backend
The front-end collects the card and creates a `paymentMethod` object via Stripe.js. It **cannot** create the subscription itself — that must happen server-side (to keep the Stripe secret key secure). Create a Netlify Function at `netlify/functions/create-subscription.js`:

```javascript
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const { paymentMethodId, priceId, email, name, club } = JSON.parse(event.body);
  
  try {
    // Create or retrieve customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email, name,
        metadata: { club },
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId }
      });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const clientSecret = subscription.latest_invoice.payment_intent?.client_secret;
    return {
      statusCode: 200,
      body: JSON.stringify({ clientSecret, subscriptionId: subscription.id })
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
```

Then in `netlify.toml`:
```toml
[build]
  functions = "netlify/functions"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
```

Set `STRIPE_SECRET_KEY` as an environment variable in the Netlify dashboard (never in the HTML source).

### Step 4 — Handle 3D Secure (SCA)
Uncomment the `confirmCardPayment` call in the JavaScript for European card compliance:
```javascript
if (data.clientSecret) {
  const result = await stripe.confirmCardPayment(data.clientSecret);
  if (result.error) throw new Error(result.error.message);
}
```

### What works right now (without the backend)
The form collects name, email, club name, and card details. Stripe validates the card via Stripe.js. On submit, the form shows the success state and a "We'll be in touch" message. **No charge is made.** This is useful for taking expressions of interest before the backend is connected.

### Plan selector behaviour
- Clicking either pricing card CTA scrolls to `#order` and pre-selects that plan
- The annual toggle shows/hides the "Save £58" / "Save £38" badge
- Order summary updates in real time (plan name, billing period, total)
- Pay button text updates to show the correct amount
- Founder plan disables the annual toggle (can be enabled — remove the opacity check in `selectPlan()`)

---

## 9. Demo Table — Fictitious Players

All names in the demo leaderboard are entirely fictitious. The same set is used in both the hero SVG mockup and the demo section HTML table:

| Position | Name | RDR | Change |
|----------|------|-----|--------|
| 1 🔥 HOT | K. Ashworth | 4.812 | ▲ 2 |
| 2 | M. Oduya | 4.634 | ▼ 1 |
| 3 | S. Fletcher | 4.391 | ▲ 1 |
| 4 | R. Nkemdirim | 4.203 | ▲ 3 |
| 5 | T. Balogun | 4.047 | — 0 |
| 6 | P. Callahan | 3.876 | ▲ 2 |
| 7 | G. Whitmore | 3.711 | ▼ 2 |
| 8 | C. Mbeki | 3.558 | — 0 |

The real SPC dashboard (swindonpb.netlify.app) is linked from both the "See live demo" hero CTA and the demo section. The demo caption reads: *"All names are fictitious. Based on the real PBTable engine, live at Swindon Pickleball Club."*

---

## 10. FAQ Questions

1. How do I upload match results?
2. What is the RDR rating?
3. Do my players need accounts?
4. Can I cancel my subscription?
5. We have more than 150 players — can you help?
6. Can I use this for a padel club?
7. Is my data secure?

Question 5 is the "Contact us" entry — directs large clubs and special requirements to paul@pbtable.com.

---

## 11. Technical Architecture

### Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| HTML | HTML5 single file | Self-contained, no build step |
| CSS | Vanilla CSS with custom properties | No Tailwind in v4 — all hand-written |
| JavaScript | Vanilla ES2020 | No frameworks |
| Fonts | Google Fonts (Barlow + Barlow Condensed) | Preconnect for performance |
| Payments | Stripe.js v3 | Loaded from `js.stripe.com/v3/` |
| Animations | CSS keyframes + IntersectionObserver | No animation library |
| Hosting | Netlify (static) | Drag-and-drop deployment |

### JavaScript modules
| Function | Purpose |
|----------|---------|
| `initStripe()` | Mounts Stripe Card Element, handles focus/blur/change events |
| `selectPlan(p)` | Updates active plan, scrolls to order section |
| `toggleAnnual()` | Switches monthly/annual billing state |
| `updateAnnualUI()` | Updates toggle switch visual and save badge |
| `updateSummary()` | Syncs order summary and pay button with current plan/billing selection |
| `handlePayment()` | Validates form, calls `stripe.createPaymentMethod()`, handles response |
| `hl(id)` | Highlights a form field in red briefly (validation feedback) |
| `showSuccess()` | Hides form, shows success state |
| `toggleMenu()` | Mobile hamburger menu |
| `toggleFaq(btn)` | FAQ accordion — opens one, closes others |
| `animateCounter(el)` | Eased counter animation from 0 to target |
| `initStripe()` | Called on DOMContentLoaded |
| `updateSummary()` | Called on DOMContentLoaded |

### CSS animation keyframes
| Name | Effect |
|------|--------|
| `gridShift` | Moves background grid upward |
| `orbFloat` | Vertical float with scale variation |
| `floatCard` | Floating stat card bob |
| `pulse` | Opacity/scale pulse for live dots |
| `lineGrow` | scaleX 0→1 for headline underline |
| `fadeSlideUp` | Opacity + translateY for hero content stagger |
| `fadeSlideLeft` | Opacity + translateX for hero visual |
| `drawLine` | stroke-dashoffset for SVG chart line draw |
| `fadeIn` | Opacity for SVG chart endpoint dot |
| `lineAnim` | background-position for timeline gradient flow |
| `spin` | Rotation for payment processing spinner |

### Responsive breakpoints
| Breakpoint | Changes |
|-----------|---------|
| `≤1024px` | Feature grid 2-col, footer 2-col, floating cards hidden |
| `≤768px` | Hero single col, timeline stacks vertically, stats 2×2, features 1-col, pricing 1-col, order form 1-col, mobile nav |
| `≤480px` | Smaller h1, CTAs stack vertically |

---

## 12. Domain & Hosting Configuration

### Domains (registered on IONOS)
- **pbtable.com** — primary domain, configured via IONOS DNS → Netlify
- **pbtable.co.uk** — 301 permanent redirect → pbtable.com

### DNS records on IONOS for pbtable.com
| Type | Host | Value | Purpose |
|------|------|-------|---------|
| A | @ | 75.2.60.5 | Netlify load balancer |
| CNAME | www | [site].netlify.app | Netlify www |
| MX | @ | mx00.ionos.co.uk (priority 10) | Email |
| MX | @ | mx01.ionos.co.uk (priority 20) | Email fallback |

### DNS records on IONOS for pbtable.co.uk
| Type | Host | Value | Purpose |
|------|------|-------|---------|
| URL Redirect 301 | @ | https://www.pbtable.com | .co.uk → .com |
| URL Redirect 301 | www | https://www.pbtable.com | www.co.uk → .com |

### Email
- paul@pbtable.com set up via IONOS Mail Basic
- MX records confirmed working after initial DNS propagation issue (missing MX records — resolved by adding manually)
- SPF, DKIM, DMARC not yet configured — **required before sending bulk outreach** to avoid spam filtering

### Netlify setup checklist
- [ ] Add pbtable.com as custom domain in Netlify site settings
- [ ] Add www.pbtable.com as well
- [ ] SSL certificate will auto-provision via Let's Encrypt
- [ ] Set `STRIPE_SECRET_KEY` environment variable for Netlify Functions (when backend is built)
- [ ] Add `netlify/functions/create-subscription.js` for live Stripe processing

---

## 13. Content Decisions Log

| Decision | What was chosen | Why |
|----------|----------------|-----|
| Hero headline v1 | "Your club deserves a leaderboard worth checking" | Benefit-led, club admin focus |
| Hero headline v2 | "The leaderboard your players can't stop checking" | Product-behaviour focus |
| Hero headline v3 (current) | "Give every player a rating worth fighting for" | Emotional, player-first, competitive pride |
| Strapline | "Ratings your players trust — and your club owns." | Perfect — answers both the player and admin question simultaneously |
| Font v1 | Arial/Georgia | Default — replaced |
| Font v2 | Ubuntu | Clean but generic SaaS feel |
| Font v3 (current) | Barlow + Barlow Condensed | Bold, athletic, sports-forward |
| Pricing model | £19 Founder / £29 Club | £29 sits below "treasurer approval threshold" and 3× pickleballranker |
| Annual pricing | £190/year (Founder) / £290/year (Club) | Save 2 months — standard SaaS annual incentive |
| Rating name | RDR (Rally Doubles Rating) | Changed from 4DR throughout |
| Demo names | Fictitious (Ashworth, Oduya, Fletcher etc.) | Legal clarity, no real player data |
| Payment flow | Embedded Stripe Element | Keeps user on pbtable.com rather than redirecting |
| Free trial | Removed entirely | Cleaner — direct to purchase |
| Coming Soon card | Removed | Reduces pricing decision noise |
| Contact us | Added below pricing + in FAQ + in Order section | Handles large clubs / special requirements |

---

## 14. Copy Reference

### Key phrases to preserve
These are considered locked — do not rewrite:

- **"Ratings your players trust — and your club owns."** — strapline
- **"Give every player a rating worth fighting for"** — hero headline
- **"Contact us"** link → paul@pbtable.com for >150 players or special requirements
- **"Powered by Nexlane"** — footer attribution

### Tone guidelines
- British English throughout (colour, organisation, customise, licence)
- Benefits-first, not feature-first
- Written for club secretaries and committee members — not developers
- Confident but not corporate
- Never mention "SaaS" or "platform" in outreach copy

---

## 15. What Needs Doing Next

### Immediate (before first outreach email)
- [ ] Replace `pk_test_REPLACE_WITH_YOUR_STRIPE_PUBLISHABLE_KEY` with real Stripe publishable key
- [ ] Create 4 Stripe products (Founder monthly, Founder annual, Club monthly, Club annual)
- [ ] Replace `price_XXXX_ID` placeholders with real Stripe Price IDs
- [ ] Build Netlify Function backend (`create-subscription.js`)
- [ ] Set `STRIPE_SECRET_KEY` in Netlify environment variables
- [ ] Test full payment flow with a Stripe test card (`4242 4242 4242 4242`)
- [ ] Set up SPF/DKIM/DMARC on paul@pbtable.com (required for Brevo deliverability)

### Short term
- [ ] Build `demo.pbtable.com` — a read-only version of the live dashboard with plausible fictitious data for outreach links
- [ ] Record a 5-minute Loom setup walkthrough for onboarding
- [ ] Write the 4-email Brevo cold outreach sequence
- [ ] Add Google Analytics or Plausible for traffic tracking

### Longer term (Claude Code v2)
When rebuilding as a proper Next.js app, the following would be significantly better:
- Framer Motion for scroll-linked parallax and physics animations
- shadcn/ui component library
- Proper Stripe webhook handling (subscription lifecycle events)
- Multi-tenant architecture for per-club deployments
- Self-serve onboarding flow (Typeform → Zapier → Airtable/Supabase base creation)

---

## 16. File Checklist Before Deployment

- [ ] Stripe publishable key replaced (currently placeholder)
- [ ] All 4 Stripe Price IDs replaced (currently placeholders)
- [ ] Review all email addresses point to paul@pbtable.com ✓
- [ ] pbtable.com and pbtable.co.uk both referenced in footer ✓
- [ ] No real SPC player names in demo table ✓
- [ ] RDR used throughout (not 4DR) ✓
- [ ] British English throughout ✓
- [ ] "Powered by Nexlane" in footer ✓
- [ ] `prefers-reduced-motion` respected ✓
- [ ] Mobile responsive down to 375px ✓
- [ ] All CTAs scroll to correct sections ✓
