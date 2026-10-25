# Build the twoclear marketing site from the verified live pbtable.com deploy (mkt/orig).
# Every replacement asserts its expected count, so an unexpected match stops the build.
import os, re, shutil, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "orig")
OUT = os.path.join(HERE, "twoclear-build")
BRAND = r"C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\Marketing\Twoclear Logos\twoclear-brand"

DROP = {"netlify.toml", "pbtable-logo.png", "pbtable-og.png", "savings-logo.png",
        "pbtable logo - transparent.png"}  # compared lower-case: Netlify stores paths lower-cased
TEXT_EXT = (".html", ".webmanifest", ".xml", ".txt")

COLOURS = {  # old pbtable palette -> twoclear (same mapping the earlier rebrand used)
    "1B2B4B": "101828", "0F1E38": "0a0f1a", "243660": "1e293b", "D94F2B": "f97316",
    "FF6844": "fb923c", "B83C1C": "c2410c", "C0431F": "ea580c", "FF6B4A": "f97316",
    "E2532F": "ea580c", "FF7A5C": "fb923c", "5A6B86": "475467",
}

LOCKUP_DARK = '<img class="tc-lockup" src="/twoclear-compact-dark.svg" alt="twoclear" />'
LOCKUP_CSS = (".brand img.tc-lockup{height:34px;width:auto}"
              ".foot-brand .brand img.tc-lockup{height:32px}")
SAVINGS_LOCKUP = ('<img class="tc-lockup on-light" src="/twoclear-compact-light.svg" alt="twoclear">'
                  '<img class="tc-lockup on-dark" src="/twoclear-compact-dark.svg" alt="">')
SAVINGS_CSS = (".pbt-brand .tc-lockup{height:30px;width:auto;display:block}"
               ".pbt-brand .tc-lockup.on-dark{display:none}"
               "@media (prefers-color-scheme: dark){"
               ":root:not([data-theme=\"light\"]) .pbt-brand .tc-lockup.on-light{display:none}"
               ":root:not([data-theme=\"light\"]) .pbt-brand .tc-lockup.on-dark{display:block}}"
               ":root[data-theme=\"dark\"] .pbt-brand .tc-lockup.on-light{display:none}"
               ":root[data-theme=\"dark\"] .pbt-brand .tc-lockup.on-dark{display:block}")

UK_PHRASES = [
    ("your UK pickleball club", "your pickleball club"),
    ("a better UK pickleball club", "a better pickleball club"),
    ("How a UK pickleball club", "How a pickleball club"),
    ("for UK pickleball clubs", "for pickleball clubs"),
    ("For UK pickleball clubs", "For pickleball clubs"),
    ("For UK Pickleball Clubs", "For Pickleball Clubs"),
    ("for UK Pickleball Clubs", "for Pickleball Clubs"),
    ("for UK Clubs", "for Clubs"),
    ("pickleball club software for the UK", "pickleball club software"),
]

totals = {}
def sub(label, text, pattern, repl, regex=False, flags=0):
    new, n = (re.subn(pattern, repl, text, flags=flags) if regex
              else (text.replace(pattern, repl), text.count(pattern)))
    totals[label] = totals.get(label, 0) + n
    return new

def transform(name, t):
    t = sub("nav/footer lockup (logo + wordmark)", t,
            r'<img src="/?pbtable-logo\.png" alt="PBTable logo" ?/>\s*<span class="wordmark"[^>]*>PB<b>Table</b></span>',
            LOCKUP_DARK, regex=True)
    t = sub("footer lockup (logo only)", t,
            r'(<a class="brand" href="[^"]*">)<img src="/?pbtable-logo\.png" alt="PBTable logo" ?/>(</a>)',
            r"\1" + LOCKUP_DARK + r"\2", regex=True)
    if name == "apple-preview.html":  # unlinked noindex concept page; white frosted nav -> navy lockup
        t = sub("concept page lockup (light nav)", t,
                '<img src="pbtable-logo.png" alt="PBTable" />PB<b>Table</b>',
                '<img class="tc-lockup" src="/twoclear-compact-light.svg" alt="twoclear" />')
    if name == "savings-calculator.html":
        t = sub("savings calculator lockup", t,
                '<img class="pbt-logo" src="savings-logo.png" alt="PBTable" width="300" height="375">PBTable',
                SAVINGS_LOCKUP)
        t = sub("savings calculator lockup css", t,
                ".pbt-brand .pbt-logo{width:38px;height:auto;flex:none;display:block}",
                ".pbt-brand .pbt-logo{width:38px;height:auto;flex:none;display:block}" + SAVINGS_CSS)
    if "tc-lockup" in t and name != "savings-calculator.html":
        t = sub("lockup css injected", t, "</style>", LOCKUP_CSS + "</style>", regex=False) if t.count("</style>") == 1 \
            else re.sub(r"</style>", LOCKUP_CSS + "</style>", t, count=1)
    t = sub("footer: drop old pbtable.co.uk domain link", t,
            r'\s*(?:·\s*)?<a href="https://pbtable\.co\.uk">pbtable\.co\.uk</a>', "", regex=True)
    t = sub("email paul@pbtable.co.uk", t, "paul@pbtable.co.uk", "hello@twoclear.co.uk")
    t = sub("club example yourclub", t, "yourclub.pbtable.com", "yourclub.twoclear.co.uk")
    t = sub("club example swindon", t, "swindon.pbtable.com", "swindon.twoclear.co.uk")
    t = sub("share image", t, "pbtable-og.png", "twoclear-og.png")
    t = sub("site address pbtable.com", t, r"(?<![\w.-])pbtable\.com", "twoclear.co.uk", regex=True)
    t = sub("name PBTable", t, "PBTable", "twoclear")
    # Not UK-only any more. Legal "UK GDPR" / England & Wales wording in the DPA is left alone on purpose.
    for old, new in UK_PHRASES:
        t = sub("UK positioning removed", t, old, new)
    t = sub("areaServed GB removed", t, r'"areaServed": ?"GB", ?', "", regex=True)
    for old, new in COLOURS.items():
        t = sub("colours", t, "#" + old + r"\b", "#" + new, regex=True, flags=re.I)
    return t

EXPECT = {  # verified against the live originals before writing this
    "nav/footer lockup (logo + wordmark)": 16, "footer lockup (logo only)": 4,
    "concept page lockup (light nav)": 1, "footer: drop old pbtable.co.uk domain link": 6,
    "savings calculator lockup": 1, "savings calculator lockup css": 1,
    "email paul@pbtable.co.uk": 33, "club example yourclub": 3, "club example swindon": 1,
    "UK positioning removed": 37, "areaServed GB removed": 1,
}

shutil.rmtree(OUT, ignore_errors=True)
for root, _, files in os.walk(SRC):
    for fn in files:
        rel = os.path.relpath(os.path.join(root, fn), SRC)
        if rel.lower() in DROP: continue
        dst = os.path.join(OUT, rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
        if fn.endswith(TEXT_EXT):
            t = open(os.path.join(root, fn), encoding="utf-8", newline="").read()
            open(dst, "w", encoding="utf-8", newline="").write(transform(fn, t))
        else:
            shutil.copyfile(os.path.join(root, fn), dst)

bad = {k: (totals.get(k, 0), v) for k, v in EXPECT.items() if totals.get(k, 0) != v}
for k, n in sorted(totals.items()): print(f"  {n:4d}  {k}")
if bad: sys.exit(f"STOP: unexpected counts {bad}")

# ---- brand assets (used exactly as supplied; only resized / composed) ----
for v in ("dark", "light"):
    shutil.copyfile(os.path.join(BRAND, "svg", f"twoclear-compact-{v}.svg"), os.path.join(OUT, f"twoclear-compact-{v}.svg"))
fav = lambda s: os.path.join(BRAND, "favicon", f"twoclear-favicon-{s}x{s}.png")
for s, name in ((16, "favicon-16x16.png"), (32, "favicon-32x32.png"), (180, "apple-touch-icon.png"),
                (192, "icon-192.png"), (512, "icon-512.png")):
    shutil.copyfile(fav(s), os.path.join(OUT, name))
Image.open(fav(256)).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
# share card 1200x630: white full lockup on brand navy, clear space well over half the badge height
og = Image.new("RGB", (1200, 630), "#101828")
lock = Image.open(os.path.join(BRAND, "png", "twoclear-full-dark.png")).convert("RGBA")
lock = lock.crop(lock.getbbox()); w = 760; h = round(lock.height * w / lock.width)
lock = lock.resize((w, h), Image.LANCZOS); og.paste(lock, ((1200 - w) // 2, (630 - h) // 2), lock)
og.save(os.path.join(OUT, "twoclear-og.png"), optimize=True)

# ---- Netlify settings: headers kept from the live netlify.toml, redirects retargeted to twoclear ----
open(os.path.join(OUT, "_headers"), "w", newline="\n").write(
    "/site.webmanifest\n  Content-Type: application/manifest+json; charset=utf-8\n"
    "/sitemap.xml\n  Content-Type: application/xml; charset=utf-8\n"
    "/twoclear-og.png\n  Cache-Control: public, max-age=604800\n")
hosts = ["pbtable.com", "www.pbtable.com", "pbtable.co.uk", "www.pbtable.co.uk"]
open(os.path.join(OUT, "_redirects"), "w", newline="\n").write(
    "# Old pbtable addresses forward to twoclear. 302 while the move beds in; switch to 301 once settled.\n" +
    "".join(f"{p}://{h}/*  https://twoclear.co.uk/:splat  302!\n" for h in hosts for p in ("https", "http")))
print("assets + _headers + _redirects written ->", OUT)
