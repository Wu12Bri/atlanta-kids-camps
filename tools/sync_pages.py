"""Sync generated bits of the live pages from data.json WITHOUT touching anything else.

Use this (not tools/build.py, which is an older full-page template that would strip
the stats beacon, AI-friendly robots.txt and the newer alert dialog).

Also runs tools/build_landing.py (search landing pages). Updates: camps.embedded.js, filter form + chips, ItemList JSON-LD, deadlines list,
free list, Cobb dialog (copied from home), counts/dates in footer, Cobb lede,
llms.txt and sitemap lastmod.
"""
import json, html, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(f"{R}/data.json")); C = D["camps"]
# "Latest check" is computed from the listings themselves (newest last_checked), never hardcoded.
V = max(c["last_checked"] for c in C)
if D["meta"].get("verified_date") != V:
    D["meta"]["verified_date"] = V
    open(f"{R}/data.json", "w").write(json.dumps(D, ensure_ascii=False, indent=1))
import subprocess, sys
import importlib.util; sys.dont_write_bytecode = True
def _load(name):
    sp = importlib.util.spec_from_file_location(name, f"{R}/tools/{name}.py"); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
# Stable per-camp page slugs (/camps/<slug>/): assigned once, kept even if a name is edited later.
_bl0 = _load("build_landing")
_used = {c["slug"] for c in C if c.get("slug")}; _chg = False
for c in C:
    if not c.get("slug"):
        base = _bl0.slugify(c["name"]) or "camp"; sl = base; n = 2
        while sl in _used: sl = f"{base}-{n}"; n += 1
        c["slug"] = sl; _used.add(sl); _chg = True
assert len({c["slug"] for c in C}) == len(C), "duplicate camp slugs in data.json"
if _chg: open(f"{R}/data.json", "w").write(json.dumps(D, ensure_ascii=False, indent=1))
ages_label, flag_html, camp_url = _bl0.ages_label, _bl0.flag_html, _bl0.camp_url
if subprocess.run([sys.executable, f"{R}/tools/check_weekdays.py"]).returncode:
    sys.exit("weekday labels in data.json are wrong; fix them before syncing")
BASE = "https://atlantakidscamps.com"
INTERESTS = D["meta"]["interest_tags"]; COUNTY = D["meta"]["county_codes"]
e = lambda s: html.escape(str(s if s is not None else ""), quote=True)

open(f"{R}/camps.embedded.js", "w").write("window.CAMPS=" + json.dumps(C, ensure_ascii=False) + ";")

ORDER = ["outdoor","ninja","tennis","farm","horse","nature","garden","survival","trades","unusual","art","theatre","music","dance","swim","sports","gym","stem","day","break","after","library","free"]
def filters(home, page="home"):
    opts = '<option value="all">All interests</option>' + "".join(f'<option value="{k}">{e(INTERESTS[k] if k!="free" else "Free programs")}</option>' for k in ORDER)
    ages = '<option value="">Any age</option><option value="0">Under 1</option>' + "".join(f'<option value="{i}">{i}</option>' for i in range(1, 19))
    area = ('<label>Area<select id="area"><option value="all">All areas</option>' + "".join(f'<option value="{k}">{e(v)}</option>' for k, v in COUNTY.items() if k != "metro") + '</select></label>') if home else ""
    typ = "" if page == "classes" else '<label>Type<select id="type"><option value="all">Camps &amp; classes</option><option value="camp">Camps</option><option value="class">Classes</option></select></label>\n'
    chips = [("outdoor","Outdoor & adventure"),("tennis","Tennis"),("farm","Farm & animals"),("horse","Horses"),("nature","Nature"),("unusual","Unusual & offbeat"),("ninja","Ninja & parkour"),("theatre","Theater"),("art","Art"),("music","Rock band"),("swim","Swim"),("dance","Dance"),("stem","LEGO / STEM"),("free","Free")]
    return ('<form class="filters" id="filters" role="search" aria-label="Filter programs" onsubmit="return false"><label>Search<input id="q" type="search" placeholder="Tennis, farm, swim, Smyrna…"></label>\n'
            f'{typ}<label>Interest<select id="cat">{opts}</select></label>\n<label>Child’s age<select id="age">{ages}</select></label>\n{area}'
            '<label>Sort<select id="sort"><option value="name">Name A–Z</option><option value="price">Lowest listed price</option></select></label>\n'
            '<label class="chk"><input id="low" type="checkbox"> Free / low-cost / aid only</label><button type="button" id="reset" class="btn ghost">Reset</button></form>\n'
            '<div class="chips" role="group" aria-label="Popular interests">' + "".join(f'<button type="button" class="chip" data-cat="{k}">{e(l)}</button>' for k, l in chips) + '</div>\n')

def itemlist(name, items):
    return json.dumps({"@context": "https://schema.org", "@type": "ItemList", "name": name, "numberOfItems": len(items),
        "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": c["name"], "url": BASE + camp_url(c) if c.get("slug") else c["source_url"]} for i, c in enumerate(items)]}, ensure_ascii=False)

def sub_once(pat, repl, s, flags=re.S):
    n = re.subn(pat, lambda m: repl, s, count=1, flags=flags)
    assert n[1] == 1, pat[:60]
    return n[0]


def add_classes_nav(s, prefix):
    """Insert a Classes nav link after Camps if it is not already there."""
    if re.search(r'href="[^"]*classes/"[^>]*>Classes</a>', s):
        return s
    s2, n = re.subn(r'(<nav aria-label="Main"><a href="(?:\.\./)?#camps">Camps</a>)',
                    rf'\1<a href="{prefix}classes/">Classes</a>', s, count=1)
    return s2 if n else s

home_items = C; cobb_items = [c for c in C if c["county"] in ("cobb", "metro")]
DEADLINE_SKIP = {"Cobb Library “The Basics” Storytime","Cobb Library Family Storytime (Vinings)","Cobb Library Prek Bilingual Storytime (Sibley)","Cobb Library Baby Storytime (Mountain View)","Salvation Army of Cobb Summer Day Camp","Salvation Army of Cobb After School Program","Cobb County School District After School Program (ASP)","Girls Inc. of Greater Atlanta Break Camp","Bricks 4 Kidz Marietta–Smyrna LEGO Robotics STEAM Camps","Snapology of Kennesaw STEM & Robotics Camps","Cobb PARKS Creative Art Camps","Cobb PARKS Performing Arts Camps (Jennie T. Anderson Theatre)","Cobb PARKS Tennis Camps","Cobb PARKS Unlimited Gymnastics Camp","Cobb PARKS Nature Camps (Green Meadows)","YMCA of Metro Atlanta Swim Lessons","Smyrna Parks & Recreation Youth Classes","Cobb Library LEGO Club (Sewell Mill)","Cobb Library LEGO Club (Powder Springs)","Sandy Springs Racquet Center Junior Tennis Summer Camp","AYTEF Community Summer Tennis Camp (Fair Oaks Tennis Center)","Camp Autrey Mill (nature, history & live animals)","Chastain Horse Park Horseback Basics Summer Camp","Camp Kingfisher Survival & Grow Specialty Camps","Camp Flix Filmmaking Camp (Emory)","Camp Flix Junior (animation filmmaking)","Atlanta Archery Club “Way of the Bow” Summer Camp","NOC Chattahoochee River Explorer Youth Day Camp (Roswell)","NOC Teen River Camps (Chattahoochee & Southeastern River Explorer)","Flour Power East Cobb Cooking Camps","Cherokee Outdoor YMCA Specialty Camps (Mountain Biking, Fishing, Water Sports)","Club SciKidz Special Effects & Filmmaking Camps","Central Rock Gym Climbing Day Camps (Kennesaw & Atlanta)","The Art Place at Mountain View Arts Classes","Mable House Arts Center Youth Classes","The Art Station – Big Shanty Youth & Teen Art Classes","Marietta Cobb Museum of Art Studio & Youth Classes","Vinings School of Art Children’s Classes (Smyrna)","Cobb PARKS Youth Tennis Lessons & Clinics","Cobb PARKS Recreation Center Youth & Homeschool Classes","School of Rock East Cobb Music Programs","Code Ninjas East Cobb Year-Round Coding Programs","Marietta Custer Park Youth Sports Classes & Leagues","Johnson Ferry Introductory Golf Camp","Johnson Ferry Dance Camps (Preschool & Elementary)","Johnson Ferry Rising Stars Basketball Camp","Johnson Ferry Flag Football Camp","Johnson Ferry Soccer Camp"}
deadlines = '<ul class="deadlines">' + "".join(f'<li><strong>{e(c["name"])}</strong><span>{e(c["registration"])}</span></li>' for c in C if c["name"] not in DEADLINE_SKIP) + '</ul>'
free = '<ul class="freelist">' + "".join(f'<li><a href="{e(c["source_url"])}" rel="noopener" target="_blank">{e(c["name"])}</a> <span class="small">{e(c["price_week"])}</span></li>' for c in C if c["free_low_cost"] or c["price_low"] == 0) + '</ul>'

LAB = dict(INTERESTS); LAB["free"] = "Free programs"
def card(c, show_county=True):
    tg = [k for k in c.get("interests", []) if k not in ("free", "unusual")][:4]
    price = "Price: see site" if c["price_low"] is None else ("Free" if c["price_low"] == 0 else f"From ${c['price_low']}")
    b = f'<span class="badge price">{e(price)}</span><span class="badge">{e(ages_label(c))}</span>'
    if c.get("type") == "class": b += '<span class="badge kind">Class</span>'
    if c["free_low_cost"]: b += '<span class="badge ok">Free/low-cost/aid</span>'
    if "unusual" in c.get("interests", []): b += '<span class="badge odd">Unusual</span>'
    cn = f' · <strong>{e(COUNTY.get(c["county"], ""))}</strong>' if show_county and c["county"] in COUNTY else ""
    tags = ('<p class="tags">' + "".join(f'<span class="tag">{e(LAB.get(k, k))}</span>' for k in tg) + '</p>') if tg else ""
    flag = flag_html(c)
    return (f'<article class="card"><div class="badges">{b}</div><h3><a href="{e(camp_url(c))}">{e(c["name"])}</a></h3><p class="meta">{e(c["category"])} · {e(c["area"])}{cn}</p>{tags}{flag}'
            f'<dl><dt>Price</dt><dd>{e(c["price_week"])}' + (f' <span class="small">{e(c["price_note"])}</span>' if c["price_note"] else "") +
            f'</dd><dt>Dates</dt><dd>{e(c["dates"])}</dd><dt>Sign-up</dt><dd>{e(c["registration"])}</dd></dl>'
            f'<p class="src"><a href="{e(camp_url(c))}">Full details</a> · <a href="{e(c["source_url"])}" target="_blank" rel="noopener">Provider page ↗</a> <span class="small">checked {e(c["last_checked"])}</span></p></article>')
def static_grid(items, show_county=True):
    # Server-rendered copy of every listing so crawlers/AI and no-JS readers get full facts; app.js re-renders it with filters.
    return '<div id="grid" class="grid">' + "".join(card(c, show_county) for c in sorted(items, key=lambda c: c["name"])) + '</div>'
GRID_RE = r'<div id="grid" class="grid">.*?</div>(?=<div id="aff-slot">)'

# ---- "Next sign-up dates" strip (top of homepage): the next 5 announced reg_dates, one per camp.
import datetime
TODAY = datetime.date.today().isoformat()
def next_deadlines(n=5):
    rows = sorted((r["date"], c["name"], r["label"], c) for c in C for r in (c.get("reg_dates") or []) if r["date"] >= TODAY)
    out, seen = [], set()
    for d, name, label, c in rows:
        if name in seen: continue
        seen.add(name); out.append((d, label, c))
        if len(out) == n: break
    return out
def nd_strip():
    items = next_deadlines()
    if not items: return '<!--nextdl--><!--/nextdl-->'
    li = "".join(
        f'<li data-date="{d}"><time datetime="{d}">{datetime.date.fromisoformat(d).strftime("%a %b ")}{datetime.date.fromisoformat(d).day}</time>'
        f'<a href="{e(camp_url(c))}">{e(c["name"])}</a><span>{e(label)}</span></li>' for d, label, c in items)
    return ('<!--nextdl--><section class="wrap nextdl" aria-labelledby="nd-h"><div class="nd-head"><h2 id="nd-h">Next sign-up dates</h2>'
            '<a href="#deadlines">All deadlines</a></div><ol class="nd-list">' + li + '</ol>'
            '<p class="small">Dates as published by each camp. We don’t hold spots; register with the camp.</p></section><!--/nextdl-->')

HOME_TITLE = "Summer Camps 2027 in Atlanta & Cobb County — Prices, Ages & Deadlines"
HOME_DESC = ("Compare 2027 summer camps in Atlanta and Cobb County (Marietta, East Cobb, Smyrna, Kennesaw, Acworth, Roswell): "
             "published prices, ages, session weeks and registration dates, each linked to the camp’s own page.")

# ---- home
p = f"{R}/index.html"; s = open(p).read()
s = re.sub(r'<title>[^<]*</title>', f'<title>{e(HOME_TITLE)}</title>', s, count=1)
s = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + e(HOME_DESC) + m.group(2), s, count=1)
s = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + e(HOME_TITLE) + m.group(2), s, count=1)
s = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + e(HOME_DESC) + m.group(2), s, count=1)
s = s.replace('<h1>Find Atlanta kids’ camps by price, age &amp; deadline</h1>', '<h1>Atlanta &amp; Cobb summer camps 2027: compare price, age &amp; deadline</h1>')
if "<!--nextdl-->" in s: s = re.sub(r"<!--nextdl-->.*?<!--/nextdl-->", lambda m: nd_strip(), s, flags=re.S)
else: s = s.replace('<section class="wrap planner-promo"', nd_strip() + '<section class="wrap planner-promo"', 1)
s = sub_once(r'<form class="filters" id="filters".*?</div>\n(?=<div id="act-alert")', filters(True), s)
s = sub_once(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "ItemList".*?</script>', '<script type="application/ld+json">' + itemlist("Atlanta kids' camps, classes and free programs", home_items) + '</script>', s)
s = sub_once(r'<ul class="deadlines">.*?</ul>', deadlines, s)
s = sub_once(GRID_RE, static_grid(home_items), s)
s = re.sub(r'<p id="count" aria-live="polite">[^<]*</p>', f'<p id="count" aria-live="polite">{len(home_items)} programs</p>', s)
s = sub_once(r'<ul class="freelist">.*?</ul>', free, s)
s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {V})', s)
if 'data-interest="unusual"' not in s:
    s = s.replace('<p class="small">Now covering <a href="cobb/">Cobb County</a> · more metro counties coming as we verify them.</p>',
                  '<p class="small">Cobb County first, plus North Fulton and Atlanta/DeKalb · <a href="?interest=unusual#camps" data-interest="unusual">Farm, horse &amp; offbeat camps</a> · <a href="?interest=tennis#camps" data-interest="tennis">Tennis</a> · <a href="?interest=swim#camps" data-interest="swim">Swim lessons</a></p>')
open(p, "w").write(s)
dialog = re.search(r'<dialog id="alert-dlg".*?</dialog>', s, re.S).group(0)

# ---- classes
class_items = [c for c in C if c.get("type") == "class"]
p = f"{R}/classes/index.html"
if os.path.exists(p):
    s = open(p).read()
    s = sub_once(r'<form class="filters" id="filters".*?</div>\n(?=<div id="act-alert")', filters(True, page="classes"), s)
    s = sub_once(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "ItemList".*?</script>', '<script type="application/ld+json">' + itemlist("Atlanta-area kids' classes and year-round programs", class_items) + '</script>', s)
    s = sub_once(GRID_RE, static_grid(class_items), s)
    s = re.sub(r'<p id="count" aria-live="polite">[^<]*</p>', f'<p id="count" aria-live="polite">{len(class_items)} programs</p>', s)
    s = re.sub(r'— \d+ (?:classes|programs), each linked to its source\.', f'— {len(class_items)} classes, each linked to its source.', s)
    VL = max(c["last_checked"] for c in class_items)
    s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {VL})', s)
    s = sub_once(r'<dialog id="alert-dlg".*?</dialog>', dialog.replace('href="privacy/', 'href="../privacy/'), s)
    open(p, "w").write(s)


# ---- cobb
p = f"{R}/cobb/index.html"; s = open(p).read()
s = sub_once(r'<form class="filters" id="filters".*?</div>\n(?=<div id="act-alert")', filters(False), s)
s = sub_once(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "ItemList".*?</script>', '<script type="application/ld+json">' + itemlist("Cobb County kids' camps, classes and free programs", cobb_items) + '</script>', s)
s = sub_once(GRID_RE, static_grid(cobb_items, False), s)
s = re.sub(r'<p id="count" aria-live="polite">[^<]*</p>', f'<p id="count" aria-live="polite">{len(cobb_items)} programs</p>', s)
s = re.sub(r'— \d+ programs, each linked to its source\.', f'— {len(cobb_items)} programs, each linked to its source.', s)
VC = max(c["last_checked"] for c in cobb_items)
s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {VC})', s)
s = sub_once(r'<dialog id="alert-dlg".*?</dialog>', dialog.replace('href="privacy/', 'href="../privacy/'), s)
open(p, "w").write(s)

p = f"{R}/planner/index.html"
if os.path.exists(p):
    s = open(p).read(); s = sub_once(r'<dialog id="alert-dlg".*?</dialog>', dialog.replace('href="privacy/', 'href="../privacy/'), s); open(p, "w").write(s)

for f in ["featured/index.html", "privacy/index.html", "planner/index.html", "preferences/index.html"]:
    p = f"{R}/{f}"
    if not os.path.exists(p): continue
    s = open(p).read(); s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {V})', s); open(p, "w").write(s)

p = f"{R}/llms.txt"; s = open(p).read()
s = re.sub(r'Last verified listings: .*', f'Last verified listings: {V}', s)
s = re.sub(r'Listing count: .*', f'Listing count: {len(C)} programs (' + str(sum(1 for c in C if c.get("type","camp")!="class")) + ' camps, ' + str(sum(1 for c in C if c.get("type")=="class")) + ' classes; incl. outdoor & adventure, swim lessons, tennis, farm/nature, filmmaking, cooking and free library programs)', s)
s = re.sub(r'Coverage today: .*', 'Coverage today: Cobb County first (Marietta, East Cobb, Smyrna, Kennesaw, Acworth, Powder Springs), plus North Fulton and Atlanta/DeKalb programs that publish public pages, and a few north Georgia overnight / day-trip outdoor camps.', s)
s = s.replace('filters by type, age, price;', 'filters by interest (tennis, farm & animals, horses, nature, art, swim, dance, STEM, free…), child’s age, area and price; shareable filter URLs like /?interest=farm&age=8&area=cobb;')
open(p, "w").write(s)
p = f"{R}/sitemap.xml"; s = open(p).read()
if "/planner/" not in s: s = s.replace(f"<url><loc>{BASE}/cobb/</loc>", f"<url><loc>{BASE}/planner/</loc><lastmod>{V}</lastmod></url><url><loc>{BASE}/cobb/</loc>")
if "/classes/" not in s: s = s.replace(f"<url><loc>{BASE}/cobb/</loc>", f"<url><loc>{BASE}/classes/</loc><lastmod>{V}</lastmod></url><url><loc>{BASE}/cobb/</loc>")
s = re.sub(r'<lastmod>[^<]+</lastmod>', f'<lastmod>{V}</lastmod>', s); open(p, "w").write(s)
print("synced", len(C), "camps;", len(cobb_items), "on Cobb page")


# ---- Classes nav link (home + subpages)
p = f"{R}/index.html"; s = open(p).read(); open(p, "w").write(add_classes_nav(s, ""))
for f in ["cobb/index.html", "classes/index.html", "featured/index.html", "privacy/index.html", "planner/index.html", "preferences/index.html", "account/index.html"]:
    p = f"{R}/{f}"
    if os.path.exists(p):
        s = open(p).read(); open(p, "w").write(add_classes_nav(s, "../"))

# ---- every static page: real PNG share image (Facebook/iMessage don't render SVG)
OG = ('<meta property="og:image" content="https://atlantakidscamps.com/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
      '<meta property="og:image:alt" content="Atlanta Kids Camps: summer camps 2027 in Atlanta and Cobb"><meta name="twitter:card" content="summary_large_image">')
for root, dirs, files in os.walk(R):
    dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("tools", "shots", "camps")]
    for f in files:
        if not f.endswith(".html"): continue
        p = os.path.join(root, f); s0 = open(p).read(); s1 = s0
        s1 = re.sub(r'<meta property="og:image" content="[^"]*og\.svg">(?:<meta property="og:image:[a-z]+" content="[^"]*">)*(?:<meta name="twitter:card" content="summary(?:_large_image)?">)?', lambda m: OG, s1)
        if s1 != s0: open(p, "w").write(s1)

# ---- search-matching landing pages (+ sitemap, llms.txt, homepage "Popular searches")
_bl = _load("build_landing")
print("landing pages:"); _bl.build()

# ---- per-camp pages (/camps/<slug>/) and town pages (+ sitemap, llms.txt)
_bp = _load("build_pages")
_bp.build()
