"""Sync generated bits of the live pages from data.json WITHOUT touching anything else.

Use this (not tools/build.py, which is an older full-page template that would strip
the stats beacon, AI-friendly robots.txt and the newer alert dialog).

Updates: camps.embedded.js, filter form + chips, ItemList JSON-LD, deadlines list,
free list, Cobb dialog (copied from home), counts/dates in footer, Cobb lede,
llms.txt and sitemap lastmod.
"""
import json, html, os, re
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(f"{R}/data.json")); C = D["camps"]; V = D["meta"]["verified_date"]
BASE = "https://atlantakidscamps.com"
INTERESTS = D["meta"]["interest_tags"]; COUNTY = D["meta"]["county_codes"]
e = lambda s: html.escape(str(s if s is not None else ""), quote=True)

open(f"{R}/camps.embedded.js", "w").write("window.CAMPS=" + json.dumps(C, ensure_ascii=False) + ";")

ORDER = ["tennis","farm","horse","nature","garden","survival","trades","unusual","art","theatre","dance","swim","sports","gym","stem","day","break","after","library","free"]
def filters(home):
    opts = '<option value="all">All interests</option>' + "".join(f'<option value="{k}">{e(INTERESTS[k] if k!="free" else "Free programs")}</option>' for k in ORDER)
    ages = '<option value="">Any age</option><option value="0">Under 1</option>' + "".join(f'<option value="{i}">{i}</option>' for i in range(1, 19))
    area = ('<label>Area<select id="area"><option value="all">All metro Atlanta</option>' + "".join(f'<option value="{k}">{e(v)}</option>' for k, v in COUNTY.items() if k != "metro") + '</select></label>') if home else ""
    chips = [("tennis","Tennis"),("farm","Farm & animals"),("horse","Horses"),("nature","Nature"),("unusual","Unusual & offbeat"),("art","Art"),("swim","Swim"),("dance","Dance"),("stem","LEGO / STEM"),("free","Free")]
    return ('<form class="filters" id="filters" role="search" aria-label="Filter programs" onsubmit="return false"><label>Search<input id="q" type="search" placeholder="Tennis, farm, swim, Smyrna…"></label>\n'
            f'<label>Interest<select id="cat">{opts}</select></label>\n<label>Child’s age<select id="age">{ages}</select></label>\n{area}'
            '<label>Sort<select id="sort"><option value="name">Name A–Z</option><option value="price">Lowest listed price</option></select></label>\n'
            '<label class="chk"><input id="low" type="checkbox"> Free / low-cost / aid only</label><button type="button" id="reset" class="btn ghost">Reset</button></form>\n'
            '<div class="chips" role="group" aria-label="Popular interests">' + "".join(f'<button type="button" class="chip" data-cat="{k}">{e(l)}</button>' for k, l in chips) + '</div>\n')

def itemlist(name, items):
    return json.dumps({"@context": "https://schema.org", "@type": "ItemList", "name": name, "numberOfItems": len(items),
        "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": c["name"], "url": c["source_url"]} for i, c in enumerate(items)]}, ensure_ascii=False)

def sub_once(pat, repl, s, flags=re.S):
    n = re.subn(pat, lambda m: repl, s, count=1, flags=flags)
    assert n[1] == 1, pat[:60]
    return n[0]

home_items = C; cobb_items = [c for c in C if c["county"] in ("cobb", "metro")]
DEADLINE_SKIP = {"Cobb Library “The Basics” Storytime","Cobb Library Family Storytime (Vinings)","Cobb Library Prek Bilingual Storytime (Sibley)","Cobb Library Baby Storytime (Mountain View)","Salvation Army of Cobb Summer Day Camp","Salvation Army of Cobb After School Program","Cobb County School District After School Program (ASP)","Girls Inc. of Greater Atlanta Break Camp","Bricks 4 Kidz Marietta–Smyrna LEGO Robotics STEAM Camps","Snapology of Kennesaw STEM & Robotics Camps","Cobb PARKS Creative Art Camps","Cobb PARKS Performing Arts Camps (Jennie T. Anderson Theatre)","Cobb PARKS Tennis Camps","Cobb PARKS Unlimited Gymnastics Camp","Cobb PARKS Nature Camps (Green Meadows)","YMCA of Metro Atlanta Swim Lessons","Smyrna Parks & Recreation Youth Classes","Cobb Library LEGO Club (Sewell Mill)","Cobb Library LEGO Club (Powder Springs)","Gwinnett Parks RNB Tennis","Sandy Springs Racquet Center Junior Tennis Summer Camp","AYTEF Community Summer Tennis Camp (Fair Oaks Tennis Center)","Camp Autrey Mill (nature, history & live animals)","Chastain Horse Park Horseback Basics Summer Camp","Camp Kingfisher Survival & Grow Specialty Camps"}
deadlines = '<ul class="deadlines">' + "".join(f'<li><strong>{e(c["name"])}</strong><span>{e(c["registration"])}</span></li>' for c in C if c["name"] not in DEADLINE_SKIP) + '</ul>'
free = '<ul class="freelist">' + "".join(f'<li><a href="{e(c["source_url"])}" rel="noopener" target="_blank">{e(c["name"])}</a> <span class="small">{e(c["price_week"])}</span></li>' for c in C if c["free_low_cost"] or c["price_low"] == 0) + '</ul>'

# ---- home
p = f"{R}/index.html"; s = open(p).read()
s = sub_once(r'<form class="filters" id="filters".*?</div>\n(?=<div id="act-alert")', filters(True), s)
s = sub_once(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "ItemList".*?</script>', '<script type="application/ld+json">' + itemlist("Atlanta kids' camps, classes and free programs", home_items) + '</script>', s)
s = sub_once(r'<ul class="deadlines">.*?</ul>', deadlines, s)
s = sub_once(r'<ul class="freelist">.*?</ul>', free, s)
s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {V})', s)
if 'data-interest="unusual"' not in s:
    s = s.replace('<p class="small">Now covering <a href="cobb/">Cobb County</a> · more metro counties coming as we verify them.</p>',
                  '<p class="small">Cobb County first, plus North Fulton, Atlanta/DeKalb and Gwinnett · <a href="?interest=unusual#camps" data-interest="unusual">Farm, horse &amp; offbeat camps</a> · <a href="?interest=tennis#camps" data-interest="tennis">Tennis</a> · <a href="?interest=swim#camps" data-interest="swim">Swim lessons</a></p>')
open(p, "w").write(s)
dialog = re.search(r'<dialog id="alert-dlg".*?</dialog>', s, re.S).group(0)

# ---- cobb
p = f"{R}/cobb/index.html"; s = open(p).read()
s = sub_once(r'<form class="filters" id="filters".*?</div>\n(?=<div id="act-alert")', filters(False), s)
s = sub_once(r'<script type="application/ld\+json">\{"@context": "https://schema.org", "@type": "ItemList".*?</script>', '<script type="application/ld+json">' + itemlist("Cobb County kids' camps, classes and free programs", cobb_items) + '</script>', s)
s = re.sub(r'— \d+ programs, each linked to its source\.', f'— {len(cobb_items)} programs, each linked to its source.', s)
s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {V})', s)
s = sub_once(r'<dialog id="alert-dlg".*?</dialog>', dialog.replace('href="privacy/', 'href="../privacy/'), s)
open(p, "w").write(s)

for f in ["featured/index.html", "privacy/index.html"]:
    p = f"{R}/{f}"; s = open(p).read(); s = re.sub(r'\(latest check \d{4}-\d{2}-\d{2}\)', f'(latest check {V})', s); open(p, "w").write(s)

p = f"{R}/llms.txt"; s = open(p).read()
s = re.sub(r'Last verified listings: .*', f'Last verified listings: {V}', s)
s = re.sub(r'Listing count: .*', f'Listing count: {len(C)} programs (camps, classes, swim lessons, tennis, farm/nature and free library programs)', s)
s = re.sub(r'Coverage today: .*', 'Coverage today: Cobb County first (Marietta, East Cobb, Smyrna, Kennesaw, Acworth, Powder Springs), plus North Fulton, Atlanta/DeKalb and Gwinnett programs that publish public pages.', s)
s = s.replace('filters by type, age, price;', 'filters by interest (tennis, farm & animals, horses, nature, art, swim, dance, STEM, free…), child’s age, area and price; shareable filter URLs like /?interest=farm&age=8&area=cobb;')
open(p, "w").write(s)
p = f"{R}/sitemap.xml"; s = open(p).read(); s = re.sub(r'<lastmod>[^<]+</lastmod>', f'<lastmod>{V}</lastmod>', s); open(p, "w").write(s)
print("synced", len(C), "camps;", len(cobb_items), "on Cobb page")
