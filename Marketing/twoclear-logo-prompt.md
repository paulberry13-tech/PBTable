# Twoclear — logo asset generation prompt

*For an AI tool that outputs real SVG/vector code — Claude, or another coding-capable model —
not a text-to-image generator like Midjourney, DALL-E or Gemini's image mode. Those rasterise
the wordmark and garble the letters, which is exactly what went wrong with the first attempt.
Paste everything below into a tool that can write SVG, or hand it to a designer as a written
brief.*

---

## The brand

- **Name:** twoclear — always lowercase in the wordmark.
- **Concept:** **"+2"** — win by two clear points is the rule that ends every racket-sport game
  (tennis, padel, pickleball, badminton), so it's the one idea that's actually built into the
  name and works across every sport the product serves.
- **Tagline:** BOOK · PLAY · SCORE · RANK — small caps, wide tracking, centred dot separators.
- **Colours** (exact hex, never approximated):
  - Navy `#101828` — primary colour, the wordmark, the badge fill.
  - Orange `#F97316` — a single accent, reserved for the "+2" only. Never used elsewhere.
  - Muted grey `#64748B` — tagline and secondary text.
  - White `#FFFFFF` — the light surface everything sits on.
- **Typography:** a geometric/humanist sans, weight 700–800, tight negative letter-spacing on
  the wordmark, wide positive letter-spacing on the tagline. Reference: Inter or Söhne. Font
  stack: `Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

## What this is not

- Not a ball, racket, or trophy icon. Not a row of small stock icons.
- No gradients, no drop shadows, no 3D bevels, no glossy highlights.
- Not a rounded, bubbly, consumer-app typeface — this sits in the Stripe / Monzo / Curve
  register, not a kids'-app register. The first attempt (Gemini) failed on exactly this: soft
  rounded letterforms that read as a toy, not a tool a treasurer trusts with subscription
  payments.
- The badge and the wordmark must not compete at equal visual weight — the wordmark is primary,
  the badge is its companion mark, not a rival.
- The "+2" must read as **one considered mark**, not two default characters placed side by side.
  Tighten the kerning between the plus and the numeral until they feel drawn together, not typed.

## The constraint that decides everything

**The brand is never the hero.** It appears at 16–20px as a small "Brought to you by twoclear"
byline in the footer of someone else's website — a club's own branded site, sitting beside the
club's own logo. It must also survive: a browser favicon, a circular avatar crop for a WhatsApp
group, a single-colour mono print on a paper court slip, and a home-screen app icon. Check every
deliverable at those real sizes, not only at hero scale — that's the test the first attempt never
faced.

## Deliverables — produce each as its own clean, valid SVG

1. **Primary lockup** — badge + wordmark + tagline. The full brand mark for a marketing site or
   letterhead.
2. **Compact lockup** — badge + wordmark only, no tagline. This is the one that actually ships,
   in a club's footer.
3. **Icon alone** — the badge and its "+2", nothing else. For the favicon and the app icon. Must
   read clearly at 16×16px.
4. **Mono version** — navy ink only, no orange. For a single-colour print on a paper court slip.
5. **Small-scale proof** — the compact lockup rendered at true ~16–18px, sitting beside a
   placeholder club name in an unrelated typeface and colour (e.g. "Swindon Pickleball Club"),
   to prove the mark stays legible and doesn't fight the club's own branding. This is the
   deliverable that actually matters most — build it, don't skip it.

## Technical requirements

- Real `<text>` elements, correctly spelled — never approximate or garble letterforms.
- Exact hex values as given above.
- No gradients, shadows, bevels or glossy effects anywhere.
- Every element must sit fully inside its viewBox with no clipping or unintended overlap.
- Match the structure, proportions and hierarchy of the reference implementation below rather
  than starting from a blank page — the spacing and weight relationships in it are the agreed
  result of two design passes, not a rough draft.

## Reference implementation — match this structure

```svg
<svg width="100%" viewBox="0 0 680 318" role="img">
<title>Twoclear logo concept</title>
<desc>A navy badge with an orange "+2" mark, the wordmark "twoclear" in a tight geometric sans, and the tagline Book, Play, Score, Rank beneath. A second panel shows the mark at true byline scale beside a placeholder club name.</desc>
<rect x="40" y="24" width="600" height="176" rx="16" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1"/>
<rect x="64" y="48" width="96" height="96" rx="20" fill="#101828"/>
<text x="112" y="112" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="46" font-weight="800" letter-spacing="-2" fill="#F97316" text-anchor="middle">+2</text>
<text x="184" y="112" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="54" font-weight="700" letter-spacing="-1.5" fill="#101828" text-anchor="start">twoclear</text>
<text x="248" y="178" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="3" fill="#64748B" text-anchor="middle">BOOK &#183; PLAY &#183; SCORE &#183; RANK</text>
<rect x="40" y="224" width="600" height="70" rx="10" fill="#F4F5F7" stroke="#E5E7EB" stroke-width="1"/>
<text x="64" y="266" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#374151" text-anchor="start">Swindon Pickleball Club</text>
<rect x="404" y="246" width="26" height="26" rx="6" fill="#101828"/>
<text x="417" y="263" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="800" letter-spacing="-1" fill="#F97316" text-anchor="middle">+2</text>
<text x="438" y="263" font-family="Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" text-anchor="start"><tspan fill="#64748B" font-weight="400">Brought to you by </tspan><tspan fill="#101828" font-weight="700">twoclear</tspan></text>
</svg>
```

Use this as the primary lockup and the small-scale proof (deliverables 1 and 5) directly, then
derive 2, 3 and 4 from the same badge and wordmark geometry — same corner radius, same kerning,
same proportions — so all five feel like one family rather than five separate attempts.

## Instruction to the AI tool executing this

Before producing anything, confirm you understand the constraint above about the brand never
being the hero, and that you're outputting real SVG code, not a description of one. Produce the
five deliverables in order. For each one, state the exact pixel size you've checked it at.
