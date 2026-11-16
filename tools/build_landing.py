#!/usr/bin/env python3
"""Build the search-matching landing pages from data.json (run by tools/sync_pages.py).

Each page = a parent search ("tennis camps atlanta") -> the listings in data.json that
match it, rendered as static HTML cards (readable by crawlers / AI assistants without JS),
with Breadcrumb + ItemList JSON-LD, canonical, the stats beacon, the alert sign-up CTA,
and links to the filtered directory view and the Planner.

Facts come only from data.json. Anything a provider hasn't published shows as
"not announced yet". Re-run after any data change:  python3 tools/sync_pages.py
Also updates sitemap.xml, llms.txt and the homepage "Popular searches" block.
"""
import json, html, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://atlantakidscamps.com"
D = json.load(open(f"{R}/data.json")); C = D["camps"]
COUNTY = D["meta"]["county_codes"]; LAB = dict(D["meta"]["interest_tags"]); LAB["free"] = "Free programs"
CAT_KEY_ORDER = ["tennis", "horse", "farm", "survival", "outdoor", "nature", "ninja", "theatre", "music", "art", "stem", "day", "break", "library", "free"]
e = lambda s: html.escape(str(s if s is not None else ""), quote=True)
NA = "not announced yet"

def tags(c): return c.get("interests", [])
def t(v):  # "09:00" -> "9am", "16:30" -> "4:30pm"
    h, m = map(int, v.split(":")); ap = "am" if h < 12 else "pm"; h = h % 12 or 12
    return f"{h}{'' if m == 0 else ':%02d' % m}{ap}"
def mins(v): h, m = map(int, v.split(":")); return h * 60 + m
def newest(items): return max(c["last_checked"] for c in items)

def hours_line(c):
    if not (c.get("hours_start") and c.get("hours_end")):
        return f"Hours: {NA}"
    s = f"Camp day {t(c['hours_start'])}–{t(c['hours_end'])}"
    ext = []
    if c.get("before_care"): ext.append(f"before-care from {t(c['before_care'])}")
    if c.get("after_care"): ext.append(f"after-care to {t(c['after_care'])}")
    s += ("; " + ", ".join(ext)) if ext else "; before/after-care not listed"
    y = c.get("hours_year")
    if y and y < 2027: s += f" (published {y} hours; 2027 hours {NA})"
    elif y: s += f" ({y} hours)"
    return s

SPRING = re.compile(r"Spring(?: [Bb]reak)?:? (Apr(?:il)?\.? \d{1,2}[–-]\d{1,2})(?:,? (20\d\d))?")
def spring_line(c):
    m = SPRING.search(c["dates"])
    if m:
        yr = m.group(2) or ("2027" if "2027" in c["dates"] else "")
        return f"Spring break 2027: {m.group(1)}, {yr} (provider page)" if yr else f"Spring break: {m.group(1)}"
    return f"Spring break 2027 dates: {NA}"

MONTH = re.compile(r"\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.? \d", re.I)
def season_line(c):
    """Flag camps whose 2027 dates the provider hasn't published (ongoing / school-year programs excluded)."""
    if c.get("sessions"): return None
    d = c["dates"].lower(); txt = (c["dates"] + " " + c["registration"]).lower()
    if "ongoing" in d or "school year" in d or "tuesdays" in d: return None
    label = "Summer 2027 dates" if (c.get("summer") or "summer 2027" in d) else "2027 dates"
    if re.search(r"summer 2027:|2027 weekly|2027: ", txt) and "not yet" not in txt: return None
    if "not yet" in txt or "tba" in txt or "opening soon" in txt or (c.get("summer") and "2026" in txt) or not MONTH.search(c["dates"]):
        return f"{label}: {NA}"
    return None

def card(c, extra=None):
    tg = [k for k in tags(c) if k not in ("free", "unusual")][:4]
    price = "Price: see site" if c["price_low"] is None else ("Free" if c["price_low"] == 0 else f"From ${c['price_low']}")
    b = f'<span class="badge price">{e(price)}</span><span class="badge">Ages {e(c["ages"])}</span>'
    if c["free_low_cost"]: b += '<span class="badge ok">Free/low-cost/aid</span>'
    if "unusual" in tags(c): b += '<span class="badge odd">Unusual</span>'
    cn = f' · <strong>{e(COUNTY.get(c["county"], ""))}</strong>' if c["county"] in COUNTY else ""
    tgs = ('<p class="tags">' + "".join(f'<span class="tag">{e(LAB.get(k, k))}</span>' for k in tg) + '</p>') if tg else ""
    flag = f'<p class="flag">{e(c["status_flag"])}</p>' if c.get("status_flag") else ""
    notes = [x for x in (extra(c) if extra else []) if x]
    sl = season_line(c)
    if sl and sl not in notes: notes.append(sl)
    nt = "".join(f'<p class="lp-note">{e(n)}</p>' for n in notes)
    ck = next((k for k in CAT_KEY_ORDER if k in tags(c)), (tags(c) or [""])[0])
    area = COUNTY[c["county"]] if c["county"] in COUNTY and c["county"] not in ("metro", "day-trip") else ""
    return (f'<article class="card"><div class="badges">{b}</div><h3>{e(c["name"])}</h3><p class="meta">{e(c["category"])} · {e(c["area"])}{cn}</p>{tgs}{flag}{nt}'
            f'<dl><dt>Price</dt><dd>{e(c["price_week"])}' + (f' <span class="small">{e(c["price_note"])}</span>' if c["price_note"] else "") +
            f'</dd><dt>Dates</dt><dd>{e(c["dates"])}</dd><dt>Sign-up</dt><dd>{e(c["registration"])}</dd></dl>'
            f'<p class="src"><a href="{e(c["source_url"])}" target="_blank" rel="noopener">Provider page ↗</a> <span class="small">checked {e(c["last_checked"])}</span></p>'
            f'<div class="card-actions"><button type="button" class="btn ghost sm alert-open" data-camp="{e(c["name"])}" data-activity="{e(c["category"])}" data-cat="{e(ck)}" data-area="{e(area)}">🔔 Email me when sign-ups open</button><button type="button" class="btn ghost sm save-camp" data-camp="{e(c["name"])}" aria-label="Save {e(c["name"])} to my camp calendar">☆ Save</button></div></article>')

# ---------------------------------------------------------------- page definitions
def has(*ks): return lambda c: bool(set(tags(c)) & set(ks))
def in_cobb(c): return c["county"] in ("cobb", "metro")
def spring_ok(c):
    """Cobb/metro camps that run school-break camps (tagged 'break', or 'school break(s)' / a spring break week in the dates)."""
    txt = c["dates"].lower()
    camp_like = "break" in tags(c) or "school break" in txt or bool(SPRING.search(c["dates"]))
    return in_cobb(c) and camp_like and "after" not in tags(c) and "fall break)" not in txt
def full_day(c):
    if not (c.get("hours_start") and c.get("hours_end")): return False
    return mins(c["hours_start"]) <= 9 * 60 and mins(c["hours_end"]) >= 16 * 60
def art_ok(c):
    """Visual-art camps: 'art' tag, minus filmmaking, blacksmithing and general day camps that merely include crafts."""
    cat = c["category"].lower()
    return "art" in tags(c) and not any(w in (cat + " " + c["name"].lower()) for w in ("film", "blacksmith", "special effects", "day camp")) and "trades" not in tags(c)
def free_ok(c): return c["price_low"] == 0 or "free" in tags(c) or "library" in tags(c)

PAGES = [
  dict(slug="spring-break-camps-cobb", search="spring break camps Marietta / Cobb County",
       title="Spring Break Camps in Cobb County & Marietta (2027) — Atlanta Kids Camps",
       h1="Spring break camps in Cobb County & Marietta",
       desc="Cobb County and Marietta spring break camps for kids, with each provider's published 2027 spring break dates (or 'not announced yet'), prices, ages and sign-up details.",
       intro=("Cobb County schools' 2027 spring break is April 5–9 (per the district's 2026–27 calendar). These Cobb and metro-wide programs run school-break camps. "
              "Where a provider has posted its 2027 spring break week we show it; everyone else is marked “not announced yet”, so you know whom to watch."),
       intro_link=("Cobb schools 2026–27 calendar (PDF)", "https://media.cobbk12.org/media/WWWCobb/medialib/2026-27-year-at-a-glance.59da33112275.pdf"),
       filter=spring_ok, sort=lambda c: (0 if SPRING.search(c["dates"]) else 1, c["name"]), extra=lambda c: [spring_line(c)],
       directory="cobb/?interest=break#camps", cta=dict(activity="Spring break camps", cat="break", area="Cobb", seasons="Spring break")),
  dict(slug="horse-farm-camps-atlanta", search="horse camps / farm camps near Atlanta and Cobb",
       title="Horse & Farm Camps near Atlanta and Cobb County — Atlanta Kids Camps",
       h1="Horse and farm camps near Atlanta",
       desc="Horseback riding, barn and farm-animal summer camps around Atlanta, East Cobb, Marietta and North Fulton, with published prices, ages, hours and 2027 status.",
       intro=("Riding lessons, barn chores, goats and chickens: these are the horse and farm camps we've verified around metro Atlanta, including two in East Cobb and Marietta. "
              "Small barns fill early and many haven't posted 2027 dates yet, so they're marked “not announced yet”. Set an alert to hear when they open."),
       filter=has("horse", "farm"), sort=lambda c: (0 if c["county"] == "cobb" else 1, c["name"]), extra=lambda c: [hours_line(c)],
       directory="?interest=farm#camps", cta=dict(activity="Horse and farm camps", cat="horse", area="", seasons="Summer")),
  dict(slug="free-kids-programs-cobb", search="free kids activities / free programs Cobb County (libraries, community centers)",
       title="Free Kids' Programs in Cobb County: Library Storytimes, LEGO Clubs & More",
       h1="Free kids’ programs in Cobb County",
       desc="Free storytimes, LEGO clubs and community after-school programs for kids in Cobb County, with dates and times from Cobb Library and provider pages.",
       intro=("Free things to do with kids in Cobb: library storytimes for babies through preschoolers, after-school LEGO clubs and a free community after-school program. "
              "Dates and times come straight from the county events calendar and provider pages. Below them are low-cost camps that list financial aid or CAPS."),
       filter=free_ok, sort=lambda c: c["name"], extra=lambda c: [],
       second=dict(h2="Low-cost camps and programs with financial aid",
                   filter=lambda c: c["free_low_cost"] and not free_ok(c) and in_cobb(c)),
       directory="?interest=free#camps", cta=dict(activity="Free library and community programs", cat="free", area="Cobb", seasons="")),
  dict(slug="full-day-camps-working-parents", search="full-day summer camps for working parents (before- and after-care)",
       title="Full-Day Summer Camps with Before & After Care (Atlanta & Cobb) — Atlanta Kids Camps",
       h1="Full-day camps for working parents",
       desc="Atlanta and Cobb day camps whose published hours run at least 9am–4pm, with before-care and after-care times where the provider lists them.",
       intro=("Every camp here publishes a camp day that starts by 9am and runs to at least 4pm. Camps that also list before-care and after-care come first, with the exact times. "
              "When the published hours are from 2026, we say so and mark 2027 hours “not announced yet”. Use the Planner to check which weeks each one covers."),
       filter=full_day, sort=lambda c: (0 if (c.get("before_care") and c.get("after_care")) else 1 if (c.get("before_care") or c.get("after_care")) else 2, c["name"]),
       extra=lambda c: [hours_line(c)],
       directory="?interest=day#camps", cta=dict(activity="Full-day camps", cat="day", area="", seasons="Summer")),
  dict(slug="outdoor-survival-camps-atlanta", search="outdoor / survival / wilderness camps near Atlanta",
       title="Outdoor, Survival & Wilderness Camps near Atlanta — Atlanta Kids Camps",
       h1="Outdoor and survival camps near Atlanta",
       desc="Bushcraft, survival-skills, paddling, climbing, archery and scout camps around Atlanta and north Georgia, with published 2027 dates, prices and ages.",
       intro=("Shelter building, fire safety, paddling the Chattahoochee, climbing, archery and overnight wilderness weeks: these outdoor and survival camps are verified against each provider's page. "
              "Several have posted 2027 sessions already. The rest are marked “not announced yet”."),
       filter=has("survival", "outdoor"), sort=lambda c: (0 if "survival" in tags(c) else 1, c["name"]), extra=lambda c: [hours_line(c) if c.get("hours_start") else None],
       directory="?interest=outdoor#camps", cta=dict(activity="Outdoor and survival camps", cat="survival", area="", seasons="Summer")),
  dict(slug="tennis-camps-atlanta", search="tennis camps for kids in Atlanta",
       title="Kids' Tennis Camps & Junior Leagues in Atlanta — Atlanta Kids Camps",
       h1="Kids’ tennis camps in Atlanta",
       desc="Junior tennis camps and leagues around Atlanta, Cobb, Sandy Springs and Gwinnett, with published prices, ages, 2027 dates and the ALTA spring 2027 roster window.",
       intro=("Summer tennis camps for beginners and junior league play around Atlanta, from Cobb's Fair Oaks courts to Sandy Springs and Gwinnett. "
              "ALTA has published its spring 2027 junior league calendar. Camp providers that haven't posted 2027 dates are marked “not announced yet”."),
       filter=has("tennis"), sort=lambda c: c["name"], extra=lambda c: [hours_line(c) if c.get("hours_start") else None],
       directory="?interest=tennis#camps", cta=dict(activity="Tennis camps", cat="tennis", area="", seasons="Summer")),
  dict(slug="theater-camps-atlanta", search="theater / musical theater / acting camps for kids in Atlanta, Marietta and East Cobb",
       title="Kids' Theater, Musical Theater & Acting Camps in Atlanta & Cobb — Atlanta Kids Camps",
       h1="Theater and acting camps for kids in Atlanta and Cobb",
       desc="Drama, musical theater and acting camps in Midtown, Marietta, East Cobb and Smyrna, with the Alliance Theatre's 2027 dates and on-sale day, prices, ages and hours.",
       intro=("Drama games, musical theater, acting and a showcase at the end of the week. The Alliance Theatre has published its 2027 spring break week (April 5–9) and its January 13, 2027 on-sale date; "
              "other theaters' 2027 summer camps are marked “not announced yet” until they post them."),
       filter=has("theatre"), sort=lambda c: (0 if c["county"] == "cobb" else 1, c["name"]), extra=lambda c: [hours_line(c) if c.get("hours_start") else None],
       directory="?interest=theatre#camps", cta=dict(activity="Theater and acting camps", cat="theatre", area="", seasons="Summer")),
  dict(slug="art-camps-atlanta", search="art camps for kids in Atlanta, Marietta and Smyrna",
       title="Kids' Art Camps in Atlanta, Marietta & Smyrna (Summer & School Breaks) — Atlanta Kids Camps",
       h1="Art camps for kids in Atlanta, Marietta and Smyrna",
       desc="Painting, drawing, clay and mixed-media camps at art centers and museums around Atlanta and Cobb, with published prices, ages, hours and 2027 status.",
       intro=("Painting, drawing, clay and craft camps at community art centers and museums in Cobb, Smyrna, Dunwoody and Buckhead. "
              "Several run school-break camps this winter. Summer 2027 weeks that haven't been posted are marked “not announced yet”, and 2026 prices or hours are labeled as last year's."),
       filter=art_ok, sort=lambda c: (0 if c["county"] == "cobb" else 1, c["name"]), extra=lambda c: [hours_line(c) if c.get("hours_start") else None],
       directory="?interest=art#camps", cta=dict(activity="Art camps", cat="art", area="", seasons="Summer")),
]

def itemlist(name, url, items):
    return {"@type": "ItemList", "name": name, "url": url, "numberOfItems": len(items),
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": c["name"], "url": c["source_url"]} for i, c in enumerate(items)]}

def page_html(p, items, items2, dialog):
    url = f"{BASE}/{p['slug']}/"; V = newest(items + items2)
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Atlanta Kids Camps", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": p["h1"].replace("’", "'"), "item": url}]},
        itemlist(p["h1"].replace("’", "'"), url, items + items2)]}
    cta = p["cta"]
    ctab = (f'<button type="button" class="btn alert-open" data-activity="{e(cta["activity"])}" data-cat="{e(cta["cat"])}" data-area="{e(cta["area"])}" data-seasons="{e(cta["seasons"])}">'
            f'🔔 Email me when {e(cta["activity"].lower())} sign-ups open</button>')
    intro_link = f' <a href="{e(p["intro_link"][1])}" target="_blank" rel="noopener">{e(p["intro_link"][0])} ↗</a>' if p.get("intro_link") else ""
    grid2 = ""
    if items2:
        grid2 = (f'<div class="sec-head lp-sub"><h2>{e(p["second"]["h2"])}</h2><p>{len(items2)} programs</p></div>'
                 '<div class="grid lp-grid">' + "".join(card(c, p["extra"]) for c in items2) + '</div>')
    others = "".join(f'<a class="chip" href="../{q["slug"]}/">{e(q["h1"])}</a>' for q in PAGES if q["slug"] != p["slug"])
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(p["title"])}</title><meta name="description" content="{e(p["desc"])}"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:title" content="{e(p["title"])}"><meta property="og:description" content="{e(p["desc"])}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}/og.svg"><meta name="twitter:card" content="summary">
<link rel="icon" href="../og.svg"><link rel="stylesheet" href="../styles.css"><script src="../config.js"></script><script>window.MOGUL_STATS={{endpoint:(window.SITE_CONFIG&&window.SITE_CONFIG.statsEndpoint)||"",site:(window.SITE_CONFIG&&window.SITE_CONFIG.statsSite)||"kids-camps"}};</script><script src="../stats.js" defer></script><script src="../app.js" defer></script><script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script></head><body><a class="skip" href="#main">Skip to content</a><header class="top"><div class="wrap nav"><a class="brand" href="../"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#f2a541"/><path d="M5 19 L11 10 L15 15 L18 11 L23 19Z" fill="#1f5f5b"/></svg><span>Atlanta Kids Camps</span></a>
<nav aria-label="Main"><a href="../#camps">Camps</a><a href="../planner/" class="nav-hot">Summer planner</a><a href="../account/">My calendar</a><a href="../#deadlines">Deadlines</a><a href="../#free">Free &amp; low-cost</a><a href="../cobb/">Cobb</a><a href="../featured/">For camps</a></nav></div></header><main id="main">
<nav class="wrap crumbs" aria-label="Breadcrumb"><a href="../">Home</a> › <span aria-current="page">{e(p["h1"])}</span></nav>
<section class="hero slim"><div class="wrap"><p class="eyebrow">Popular search</p><h1>{e(p["h1"])}</h1><p class="lede">{e(p["intro"])}{intro_link}</p>
<p class="lp-actions"><a class="btn ghost" href="../{p["directory"]}">See these in the full directory</a> <a class="btn ghost" href="../planner/">Plan summer weeks in the Planner</a></p></div></section>
<section id="lp-list" class="wrap section"><div class="sec-head"><h2>{len(items)} programs</h2><p>Each card links to the provider’s own page; facts as of the checked date shown.</p></div>
<div class="act-alert lp-cta"><p><strong>Don’t miss sign-ups.</strong> Get one email when matching registration opens. Change preferences or unsubscribe any time.</p>{ctab}</div>
<div class="grid lp-grid">{"".join(card(c, p["extra"]) for c in items)}</div>{grid2}
<div class="lp-more"><h2>More popular searches</h2><div class="chips">{others}</div></div></section></main><footer class="foot"><div class="wrap"><p><strong>Affiliate disclosure:</strong> some links may earn us a commission at no extra cost to you, and “Featured” listings are paid placements that are always labeled. Neither affects the facts we publish. <a href="../privacy/">Privacy &amp; disclosures</a></p>
<p>Facts come from each provider’s public page on the last-checked date (latest check {V}). Prices and dates change — always confirm with the provider. We have not inspected, licensed, or safety-vetted any program.</p><p>© 2026 Atlanta Kids Camps · <a href="../featured/">List or feature your camp</a> · <a href="../sitemap.xml">Sitemap</a></p></div></footer>{dialog}</body></html>
'''

def cnt(i, i2): return f"{len(i)} verified listings" + (f" + {len(i2)} low-cost/aid" if i2 else "")

def build():
    home = open(f"{R}/index.html").read()
    dialog = re.search(r'<dialog id="alert-dlg".*?</dialog>', home, re.S).group(0).replace('href="privacy/', 'href="../privacy/')
    built = []
    for p in PAGES:
        items = sorted([c for c in C if p["filter"](c)], key=p["sort"])
        items2 = sorted([c for c in C if p.get("second") and p["second"]["filter"](c)], key=lambda c: c["name"]) if p.get("second") else []
        assert items, p["slug"]
        os.makedirs(f"{R}/{p['slug']}", exist_ok=True)
        open(f"{R}/{p['slug']}/index.html", "w").write(page_html(p, items, items2, dialog))
        built.append((p, items, items2))
    # homepage "Popular searches"
    block = ('<!--popular--><section id="popular" class="wrap section"><div class="sec-head"><h2>Popular searches</h2><p>Quick lists built from the same verified listings.</p></div><ul class="popular">'
             + "".join(f'<li><a href="{p["slug"]}/">{e(p["h1"])}</a> <span class="small">{e(cnt(i, i2))}</span></li>' for p, i, i2 in built)
             + '</ul></section><!--/popular-->')
    if "<!--popular-->" in home: home = re.sub(r"<!--popular-->.*?<!--/popular-->", lambda m: block, home, flags=re.S)
    else: home = home.replace('<section id="deadlines"', block + '<section id="deadlines"', 1)
    open(f"{R}/index.html", "w").write(home)
    # sitemap
    sp = f"{R}/sitemap.xml"; s = open(sp).read()
    s = re.sub(r'<url><loc>' + re.escape(BASE) + r'/(?:' + "|".join(re.escape(p["slug"]) for p in PAGES) + r')/</loc><lastmod>[^<]*</lastmod></url>', "", s)
    s = s.replace("</urlset>", "".join(f'<url><loc>{BASE}/{p["slug"]}/</loc><lastmod>{newest(i + i2)}</lastmod></url>' for p, i, i2 in built) + "</urlset>")
    open(sp, "w").write(s)
    # llms.txt
    lp = f"{R}/llms.txt"; s = open(lp).read()
    sec = ("## Popular searches (static landing pages)\n" + "".join(
        f'- [{p["h1"].replace("’", "\'")}]({BASE}/{p["slug"]}/): {cnt(i, i2)} for "{p["search"]}".\n' for p, i, i2 in built) + "\n")
    if "## Popular searches" in s: s = re.sub(r"## Popular searches.*?\n\n", lambda m: sec, s, flags=re.S)
    else: s = s.replace("## Interest tags", sec + "## Interest tags", 1)
    open(lp, "w").write(s)
    for p, i, i2 in built: print(f'  /{p["slug"]}/  {len(i)}{" + " + str(len(i2)) if i2 else ""} listings  ({p["search"]})')
    return built

if __name__ == "__main__":
    build()
