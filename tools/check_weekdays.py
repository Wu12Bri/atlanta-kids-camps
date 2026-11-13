#!/usr/bin/env python3
"""Validate every weekday label in data.json against the real calendar.

Matches "Mon Nov 10, 2026", "Tue., Jan 5, 2027", "Saturday, March 6" and "06 Mar Sat".
When a label has no year, the year is taken from the nearest 4-digit year in the same
field (falling back to: Aug-Dec -> 2026, Jan-Jul -> 2027, the current listing season).
Exit code 1 if any label is wrong.  Run: python3 tools/check_weekdays.py
"""
import json, re, sys, datetime, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MON = {m: i for i, m in enumerate(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], 1)}
DAYS = ['mon','tue','wed','thu','fri','sat','sun']
WD = r'(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day|sday|nesday|rsday|urday)?\.?,?'
MO = r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?'
P1 = re.compile(WD + r'\s+' + MO + r'\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?', re.I)
P2 = re.compile(r'(\d{1,2})\s+' + MO + r'\s+' + WD + r'(?:,?\s+(\d{4}))?', re.I)

def year_for(text, pos, month):
    ys = [(abs(m.start() - pos), int(m.group())) for m in re.finditer(r'20\d\d', text)]
    if ys: return min(ys)[1]
    return 2026 if month >= 8 else 2027

def scan(text):
    out = []
    for m in P1.finditer(text):
        wd, mo, dd, yy = m.group(1), m.group(2), int(m.group(3)), m.group(4)
        out.append((m.group(0), wd, mo, dd, yy, m.start()))
    for m in P2.finditer(text):
        dd, mo, wd, yy = int(m.group(1)), m.group(2), m.group(3), m.group(4)
        out.append((m.group(0), wd, mo, dd, yy, m.start()))
    return out

def check(data):
    bad, n = [], 0
    for i, c in enumerate(data['camps']):
        for k, v in c.items():
            if not isinstance(v, str): continue
            for label, wd, mo, dd, yy, pos in scan(v):
                month = MON[mo[:3].lower()]
                year = int(yy) if yy else year_for(v, pos, month)
                try: real = DAYS[datetime.date(year, month, dd).weekday()]
                except ValueError: bad.append((i, c['name'], k, label, 'invalid date')); continue
                n += 1
                if wd[:3].lower() != real:
                    bad.append((i, c['name'], k, label, f'{year}-{month:02d}-{dd:02d} is a {real.title()}'))
    return n, bad

if __name__ == '__main__':
    n, bad = check(json.load(open(f'{R}/data.json')))
    print(f'{n} weekday labels checked, {len(bad)} wrong')
    for b in bad: print('  WRONG', b)
    sys.exit(1 if bad else 0)
