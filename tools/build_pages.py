#!/usr/bin/env python3
"""Build one static page per listing (/camps/<slug>/) and the town landing pages from data.json.

Run by tools/sync_pages.py after every data change (nightly scan included), so pages stay current.
Facts come only from data.json (each copied from the provider's own page). Anything not published
shows as "not announced yet" -- nothing is guessed. Also refreshes sitemap.xml, llms.txt and the
homepage "Browse by town" block. Listings removed from data.json lose their page on the next run.
"""
import datetime, html, json, os, re, shutil, sys, importlib.util
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
_sp = importlib.util.spec_from_file_location("build_landing", f"{R}/tools/build_landing.py")
bl = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(bl)
BASE = bl.BASE; D = bl.D; C = bl.C; COUNTY = bl.COUNTY; LAB = bl.LAB; NA = bl.NA
e = bl.e
assert all(c.get("slug") for c in C), "run tools/sync_pages.py (it assigns slugs)"

OG = (f'<meta property="og:image" content="{BASE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
      '<meta property="og:image:alt" content="Atlanta Kids Camps: summer camps 2027 in Atlanta and Cobb"><meta name="twitter:card" content="summary_large_image">')
NAV = ('<nav aria-label="Main"><a href="/#camps">Camps</a><a href="/classes/">Classes</a><a href="/planner/" class="nav-hot">Summer planner</a>'
       '<a href="/account/">My calendar</a><a href="/#deadlines">Deadlines</a><a href="/#free">Free &amp; low-cost</a><a href="/cobb/">Cobb</a><a href="/featured/">For camps</a></nav>')
BRAND = ('<a class="brand" href="/"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#f2a541"/>'
         '<path d="M5 19 L11 10 L15 15 L18 11 L23 19Z" fill="#1f5f5b"/></svg><span>Atlanta Kids Camps</span></a>')

def head(title, desc, url, ld, og_type="website"):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
            f'<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="{og_type}"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">{OG}\n'
            '<link rel="icon" href="/og.svg"><link rel="stylesheet" href="/styles.css"><script src="/config.js"></script>'
            '<script>window.MOGUL_STATS={endpoint:(window.SITE_CONFIG&&window.SITE_CONFIG.statsEndpoint)||"",site:(window.SITE_CONFIG&&window.SITE_CONFIG.statsSite)||"kids-camps"};</script>'
            '<script src="/stats.js" defer></script><script src="/app.js" defer></script>'
            f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script></head>'
            f'<body><a class="skip" href="#main">Skip to content</a><header class="top"><div class="wrap nav">{BRAND}\n{NAV}</div></header><main id="main">\n')

def foot(V, dialog):
    return ('</main><footer class="foot"><div class="wrap"><p><strong>Affiliate disclosure:</strong> some links may earn us a commission at no extra cost to you, and “Featured” listings are paid placements that are always labeled. Neither affects the facts we publish. <a href="/privacy/">Privacy &amp; disclosures</a></p>\n'
            f'<p>Facts come from each provider’s public page on the last-checked date (latest check {V}). Prices and dates change — always confirm with the provider. We have not inspected, licensed, or safety-vetted any program.</p>'
            f'<p>© 2026 Atlanta Kids Camps · <a href="/featured/">List or feature your camp</a> · <a href="/sitemap.xml">Sitemap</a></p></div></footer>{dialog}</body></html>\n')

# ------------------------------------------------------------------ towns
def area_txt(c):
    # ignore bus-stop lists ("free bus from Roswell/East Cobb…") — they are pickup points, not camp locations
    return re.split(r"[;,]?\s*(?:free\s+|camp\s+)?bus(?:es)?\s+(?:from|stops?)", c["area"], flags=re.I)[0]
ROSWELL = re.compile(r"(?<!Lower )\bRoswell\b(?!\s+(?:Rd|Road|St|Street)\b)")
TOWNS = [
 dict(slug="marietta-summer-camps", town="Marietta", rx=re.compile(r"\bMarietta\b"),
      blurb="Marietta camps and kids’ classes, from the Square to West Marietta and the Marietta-address parts of East Cobb."),
 dict(slug="east-cobb-summer-camps", town="East Cobb", rx=re.compile(r"East Cobb|\b3006[2678]\b"),
      blurb="East Cobb camps and classes along Johnson Ferry, Lower Roswell, Sandy Plains and Roswell Road."),
 dict(slug="smyrna-summer-camps", town="Smyrna & Vinings", rx=re.compile(r"\b(?:Smyrna|Vinings)\b"),
      blurb="Smyrna and Vinings camps and kids’ classes."),
 dict(slug="kennesaw-acworth-summer-camps", town="Kennesaw & Acworth", rx=re.compile(r"\b(?:Kennesaw|Acworth)\b"),
      blurb="Kennesaw and Acworth camps and classes, including Lake Allatoona and Lake Acworth programs."),
 dict(slug="roswell-summer-camps", town="Roswell", rx=ROSWELL,
      blurb="Roswell camps on and around the Chattahoochee, just across the river from East Cobb."),
]
def town_items(t):
    return sorted([c for c in C if t["rx"].search(area_txt(c)) or (t["town"] == "East Cobb" and "East Cobb" in c["name"])],
                  key=lambda c: (c.get("type") == "class", c["name"]))
def towns_for(c): return [t for t in TOWNS if c in t["_items"]]

# ------------------------------------------------------------------ camp page helpers
def fmt_range(a, b):
    x, y = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
    if x == y: return f"{x:%a %b} {x.day}, {x.year}"
    if x.month == y.month: return f"{x:%b} {x.day}–{y.day}, {y.year}"
    return f"{x:%b} {x.day} – {y:%b} {y.day}, {y.year}"
def gcal(c, r):
    d = datetime.date.fromisoformat(r["date"]); d2 = d + datetime.timedelta(days=1)
    from urllib.parse import quote
    return ("https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + quote(f'{c["name"]}: {r["label"]}') +
            f"&dates={d:%Y%m%d}/{d2:%Y%m%d}&details=" + quote(f'{c["registration"]}\nOfficial page: {c["source_url"]}\nWe don’t hold spots; register with the camp.'))
def camp_ld(c, url, crumbs):
    graph = [{"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]},
             {"@type": "WebPage", "@id": url, "url": url, "name": c["name"], "dateModified": c["last_checked"], "isPartOf": {"@type": "WebSite", "name": "Atlanta Kids Camps", "url": BASE + "/"}}]
    for s in c.get("sessions") or []:
        ev = {"@type": "Event", "name": c["name"], "startDate": s["start"], "endDate": s["end"],
              "eventStatus": "https://schema.org/EventScheduled", "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
              "location": {"@type": "Place", "name": c["area"], "address": c["area"]},
              "organizer": {"@type": "Organization", "name": c["provider"], "url": c["source_url"]},
              "url": c["source_url"], "description": f'{c["category"]}. {bl.ages_label(c)}.'}
        if c.get("age_min") is not None and c.get("age_max") is not None: ev["typicalAgeRange"] = f'{c["age_min"]}-{c["age_max"]}'
        if isinstance(c.get("price_low"), (int, float)):
            ev["offers"] = {"@type": "Offer", "price": c["price_low"], "priceCurrency": "USD", "url": c["source_url"], "description": c["price_week"]}
        graph.append(ev)
    return {"@context": "https://schema.org", "@graph": graph}

def desc_for(c):
    bits = [bl.ages_label(c), c["price_week"]]
    if c.get("sessions"): bits.append("2027 sessions " + ", ".join(fmt_range(s["start"], s["end"]).replace(", 2027", "") for s in c["sessions"][:3]) + ("…" if len(c["sessions"]) > 3 else ""))
    d = f'{c["name"]} ({c["area"].split(",")[0].split("(")[0].strip()}): ' + "; ".join(b for b in bits if b) + f'. Sign-up: {c["registration"]}'
    return d if len(d) <= 158 else d[:155].rsplit(" ", 1)[0] + "…"

def related(c, n=6):
    ks = [k for k in c.get("interests", []) if k not in ("free", "unusual", "day", "break", "after")] or c.get("interests", [])
    pool = [x for x in C if x is not c and set(ks) & set(x.get("interests", []))]
    pool.sort(key=lambda x: (x["county"] != c["county"], x.get("type") != c.get("type"), -len(set(ks) & set(x.get("interests", []))), x["name"]))
    return pool[:n]

def camp_page(c, dialog):
    url = f'{BASE}/camps/{c["slug"]}/'
    crumbs = [("Atlanta Kids Camps", BASE + "/"), ("Camps" if c.get("type") != "class" else "Classes", BASE + ("/#camps" if c.get("type") != "class" else "/classes/")), (c["name"], url)]
    cl = COUNTY.get(c["county"], "")
    rows = [("Provider", e(c["provider"])),
            ("Where", e(c["area"]) + (f' · <strong>{e(cl)}</strong>' if cl else "")),
            ("Ages", e(bl.ages_label(c)) + ('' if c.get("age_min") is None else f' <span class="small">(ages {c["age_min"]}–{c["age_max"]} for filters)</span>')),
            ("Price", e(c["price_week"]) + (f'<br><span class="small">{e(c["price_note"])}</span>' if c.get("price_note") else "")),
            ("Dates", e(c["dates"]))]
    if c.get("sessions"):
        rows.append(("2027 sessions", '<ul class="sessions">' + "".join(f'<li>{e(fmt_range(s["start"], s["end"]))}</li>' for s in c["sessions"]) + "</ul>"))
    elif c.get("summer"):
        rows.append(("2027 sessions", f"Week-by-week 2027 dates {NA}"))
    rows.append(("Hours", e(bl.hours_line(c))))
    reg = e(c["registration"])
    if c.get("reg_dates"):
        reg += '<ul class="sessions">' + "".join(
            f'<li><strong>{e(fmt_range(r["date"], r["date"]))}</strong>: {e(r["label"])} · <a href="{e(gcal(c, r))}" target="_blank" rel="noopener">Add to Google Calendar</a></li>'
            for r in c["reg_dates"]) + "</ul>"
    rows.append(("Sign-up", reg))
    rows.append(("Official page", f'<a href="{e(c["source_url"])}" target="_blank" rel="noopener">{e(re.sub(r"^https?://(www\\.)?", "", c["source_url"]).split("/")[0])} ↗</a>'))
    rows.append(("Last verified", f'<time datetime="{e(c["last_checked"])}">{e(c["last_checked"])}</time> against the official page'))
    facts = '<dl class="camp-facts">' + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in rows) + "</dl>"
    tags = [k for k in c.get("interests", []) if k in LAB]
    tg = ('<p class="tags">' + "".join(f'<a class="tag" href="/?interest={k}#camps">{e(LAB[k])}</a>' for k in tags) + "</p>") if tags else ""
    ck = next((k for k in bl.CAT_KEY_ORDER if k in tags), (tags or [""])[0])
    area_lbl = cl if c["county"] not in ("metro", "day-trip") else ""
    actions = (f'<div class="card-actions"><button type="button" class="btn alert-open" data-camp="{e(c["name"])}" data-activity="{e(c["category"])}" data-cat="{e(ck)}" data-area="{e(area_lbl)}">🔔 Email me when sign-ups open</button>'
               f'<button type="button" class="btn ghost save-camp" data-camp="{e(c["name"])}" aria-label="Save {e(c["name"])} to my camp calendar">☆ Save</button></div>')
    tw = towns_for(c)
    side = ['<aside class="camp-side"><h2>Plan around it</h2><ul>',
            '<li><a href="/planner/">Summer Planner</a>: see which 2027 weeks are still open</li>',
            f'<li><a href="/?interest={e(ck)}#camps">More {e(LAB.get(ck, "similar").lower())} programs</a> in the directory</li>' if ck else "",
            *[f'<li><a href="/{t["slug"]}/">{e(t["town"])} camps &amp; classes</a></li>' for t in tw],
            '<li><a href="/cobb/">All Cobb County programs</a></li>' if c["county"] in ("cobb", "metro") else "",
            '<li><a href="/#deadlines">All sign-up deadlines</a></li></ul>',
            '<p class="small">Spot a wrong date or price? The camp’s own page is always the final word; we recheck listings regularly.</p></aside>']
    rel = related(c)
    relh = ('<section class="section" style="padding-left:0;padding-right:0"><h2>Similar programs</h2><ul class="related">' +
            "".join(f'<li><a href="/camps/{e(x["slug"])}/">{e(x["name"])}</a><span>{e(bl.ages_label(x))} · {e(x["price_week"])}</span></li>' for x in rel) + "</ul></section>") if rel else ""
    body = (f'<nav class="wrap crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="{crumbs[1][1].replace(BASE, "")}">{crumbs[1][0]}</a> › <span aria-current="page">{e(c["name"])}</span></nav>\n'
            f'<section class="hero slim"><div class="wrap"><p class="eyebrow">{e(c["category"])}</p><h1>{e(c["name"])}</h1>'
            f'<p class="lede">{e(c["provider"])} · {e(c["area"])}</p>{tg}{bl.flag_html(c)}{actions}</div></section>\n'
            f'<section class="wrap section"><div class="camp-grid"><div>{facts}'
            '<p class="notice">We don’t hold spots — register with the camp itself. Facts are copied from the official page on the date shown; anything the camp hasn’t published is marked “not announced yet”. Always confirm before you register.</p>'
            f'<p><a class="btn" href="{e(c["source_url"])}" target="_blank" rel="noopener">Go to the official page ↗</a> <a class="btn ghost" href="/#camps">Back to all camps</a></p>'
            f'{relh}</div>{"".join(side)}</div></section>\n')
    title = f'{c["name"]} — 2027 Dates, Prices & Sign-up | Atlanta Kids Camps'
    return head(title, desc_for(c), url, camp_ld(c, url, crumbs), og_type="article") + body + foot(c["last_checked"], dialog)

def town_page(t, items, dialog):
    url = f'{BASE}/{t["slug"]}/'; town = t["town"]
    camps = [c for c in items if c.get("type") != "class"]; classes = [c for c in items if c.get("type") == "class"]
    dated = sum(1 for c in camps if c.get("sessions"))
    V = max(c["last_checked"] for c in items)
    title = f"{town} Summer Camps 2027 & Kids’ Classes — Prices, Dates & Deadlines"
    desc = (f"{len(camps)} {town} kids’ camps" + (f" and {len(classes)} classes" if classes else "") +
            " with published prices, ages, 2027 session dates and sign-up deadlines, each linked to the camp’s own page.")
    honest = ""
    if len(items) < 10:
        honest = (f'<p class="notice">We list {len(items)} {town} program{"s" if len(items) != 1 else ""} so far — only ones whose own website publishes the details. '
                  'More nearby options are on the <a href="/cobb/">Cobb County page</a> and in the <a href="/#camps">full directory</a>.</p>')
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Atlanta Kids Camps", "item": BASE + "/"},
                                                         {"@type": "ListItem", "position": 2, "name": f"{town} camps", "item": url}]},
        {"@type": "ItemList", "name": f"{town} kids' camps and classes", "url": url, "numberOfItems": len(items),
         "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": c["name"], "url": f'{BASE}/camps/{c["slug"]}/'} for i, c in enumerate(items)]}]}
    others = "".join(f'<a class="chip" href="/{o["slug"]}/">{e(o["town"])}</a>' for o in TOWNS if o["slug"] != t["slug"] and o["_items"])
    grid = lambda xs: '<div class="grid lp-grid">' + "".join(bl.card(c) for c in xs) + "</div>"
    body = (f'<nav class="wrap crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span aria-current="page">{e(town)} camps</span></nav>\n'
            f'<section class="hero slim"><div class="wrap"><p class="eyebrow">Summer 2027 · {e(town)}</p><h1>{e(town)} summer camps 2027 &amp; kids’ classes</h1>'
            f'<p class="lede">{e(t["blurb"])} {len(camps)} camp listing{"s" if len(camps) != 1 else ""}' + (f" and {len(classes)} class listing{'s' if len(classes) != 1 else ''}" if classes else "") +
            f', {dated} with published 2027 session weeks. Facts come from each provider’s own page; anything not published yet is marked “not announced yet”.</p>'
            '<p class="lp-actions"><a class="btn" href="/planner/">Plan your summer weeks</a> <a class="btn ghost" href="/#deadlines">Sign-up deadlines</a></p></div></section>\n'
            f'<section class="wrap section">{honest}<div class="sec-head"><h2>{len(camps)} camps in {e(town)}</h2><p>Click a name for the full page; “Provider page” goes to the camp’s own site.</p></div>'
            f'<div class="act-alert lp-cta"><p><strong>Don’t miss sign-ups.</strong> Get one email when matching registration opens. Change preferences or unsubscribe any time.</p>'
            f'<button type="button" class="btn alert-open" data-activity="{e(town)} camps" data-area="Cobb" data-seasons="Summer">🔔 Email me when {e(town)} sign-ups open</button></div>'
            f'{grid(camps)}' + (f'<div class="sec-head lp-sub"><h2>{len(classes)} kids’ classes in {e(town)}</h2><p>Year-round and recurring programs.</p></div>{grid(classes)}' if classes else "") +
            f'<div class="lp-more"><h2>Other towns</h2><div class="chips">{others}<a class="chip" href="/cobb/">All of Cobb County</a></div></div></section>\n')
    if t["slug"] == "roswell-summer-camps": body = body.replace('data-area="Cobb"', 'data-area="North Fulton"')
    return head(title, desc, url, ld) + body + foot(V, dialog)

def build():
    home = open(f"{R}/index.html").read()
    dialog = re.search(r'<dialog id="alert-dlg".*?</dialog>', home, re.S).group(0).replace('href="privacy/', 'href="/privacy/')
    for t in TOWNS: t["_items"] = town_items(t)
    # camp pages (wipe + rebuild so removed listings lose their page)
    if os.path.isdir(f"{R}/camps"): shutil.rmtree(f"{R}/camps")
    for c in C:
        os.makedirs(f'{R}/camps/{c["slug"]}', exist_ok=True)
        open(f'{R}/camps/{c["slug"]}/index.html', "w").write(camp_page(c, dialog))
    built = []
    for t in TOWNS:
        d = f'{R}/{t["slug"]}'
        if not t["_items"]:
            if os.path.isdir(d): shutil.rmtree(d)
            continue
        os.makedirs(d, exist_ok=True); open(f"{d}/index.html", "w").write(town_page(t, t["_items"], dialog)); built.append(t)
    # homepage "Browse by town"
    block = ('<!--towns--><section id="towns" class="wrap section"><div class="sec-head"><h2>Browse by town</h2><p>Camps and classes by where they meet.</p></div><div class="towns">' +
             "".join(f'<a class="tchip" href="{t["slug"]}/">{e(t["town"])} <span class="small">({len(t["_items"])})</span></a>' for t in built) +
             '<a class="tchip" href="cobb/">All of Cobb County</a></div></section><!--/towns-->')
    if "<!--towns-->" in home: home = re.sub(r"<!--towns-->.*?<!--/towns-->", lambda m: block, home, flags=re.S)
    else: home = home.replace("<!--popular-->", block + "<!--popular-->", 1)
    open(f"{R}/index.html", "w").write(home)
    # sitemap: drop old camp/town entries, add current ones
    sp = f"{R}/sitemap.xml"; s = open(sp).read()
    s = re.sub(r'<url><loc>' + re.escape(BASE) + r'/camps/[^<]*</loc><lastmod>[^<]*</lastmod></url>', "", s)
    s = re.sub(r'<url><loc>' + re.escape(BASE) + r'/(?:' + "|".join(re.escape(t["slug"]) for t in TOWNS) + r')/</loc><lastmod>[^<]*</lastmod></url>', "", s)
    s = s.replace("</urlset>", "".join(f'<url><loc>{BASE}/{t["slug"]}/</loc><lastmod>{max(c["last_checked"] for c in t["_items"])}</lastmod></url>' for t in built) +
                  "".join(f'<url><loc>{BASE}/camps/{c["slug"]}/</loc><lastmod>{c["last_checked"]}</lastmod></url>' for c in sorted(C, key=lambda c: c["slug"])) + "</urlset>")
    open(sp, "w").write(s)
    # llms.txt
    lp = f"{R}/llms.txt"; s = open(lp).read()
    sec = ("## Town pages\n" + "".join(f'- [{t["town"]} summer camps 2027 & kids’ classes]({BASE}/{t["slug"]}/): {len(t["_items"])} listings.\n' for t in built) +
           f"\n## Per-program pages\nEvery listing has its own page at {BASE}/camps/<slug>/ ({len(C)} pages; slug is the `slug` field in data.json) with ages, price, dates, 2027 sessions, hours, sign-up dates, the official link and the last-verified date, plus schema.org Event markup for announced 2027 sessions.\n\n")
    if "## Town pages" in s: s = re.sub(r"## Town pages.*?\n\n## Per-program pages.*?\n\n", lambda m: sec, s, flags=re.S)
    else: s = s.replace("## Popular searches", sec + "## Popular searches", 1)
    open(lp, "w").write(s)
    print(f"camp pages: {len(C)}; town pages: " + ", ".join(f'/{t["slug"]}/ ({len(t["_items"])})' for t in built))
    return built

if __name__ == "__main__":
    build()
