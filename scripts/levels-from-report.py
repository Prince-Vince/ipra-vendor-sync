# Seeds data/levels.json (company name -> tier) from a GrowthZone membership-level export.
# Tier is REAL GrowthZone data (from this export), not a hardcoded guess. Re-run whenever
# you re-export the report after members change level.
#
# Run: python scripts/levels-from-report.py "C:\path\to\Membership Report.xlsx"
import sys, zipfile, re, json
from pathlib import Path
import xml.etree.ElementTree as ET

REPORT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\VinceDavis\Downloads\Membership Report (8).xlsx")
OUT = Path(__file__).resolve().parent.parent / "data" / "levels.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

LEVEL_MAP = {"Elite Package": "elite", "Premium Package": "premium", "Basic Package": "basic"}

def lname(tag): return tag.split('}')[-1]
def col_idx(ref):
    m = re.match(r'([A-Z]+)', ref or 'A'); letters = m.group(1) if m else 'A'
    idx = 0
    for ch in letters: idx = idx*26 + (ord(ch)-64)
    return idx-1

z = zipfile.ZipFile(REPORT)
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root:
        shared.append(''.join(t.text or '' for t in si.iter() if lname(t.tag) == 't'))

root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
rows = []
for el in root.iter():
    if lname(el.tag) != 'row': continue
    cells, maxc = {}, -1
    for c in el:
        if lname(c.tag) != 'c': continue
        ci = col_idx(c.get('r', 'A')); t = c.get('t'); vtext = istext = None
        for child in c:
            k = lname(child.tag)
            if k == 'v': vtext = child.text
            elif k == 'is': istext = ''.join(tt.text or '' for tt in child.iter() if lname(tt.tag) == 't')
        val = shared[int(vtext)] if (t == 's' and vtext is not None) else (istext if t == 'inlineStr' else vtext)
        cells[ci] = val; maxc = max(maxc, ci)
    rows.append([cells.get(i) for i in range(maxc + 1)])

levels = {}
unmapped = set()
for r in rows[1:]:  # skip header
    if not r or not r[0]: continue
    name = str(r[0]).strip()
    if name.startswith('Generated ') or name.lower().startswith('count'):
        continue  # report footer / totals artifacts
    lvl = (str(r[1]).strip() if len(r) > 1 and r[1] else '')
    if not lvl:
        continue  # blank level == Basic; handled as the default in sync.mjs, so we don't emit it
    tier = LEVEL_MAP.get(lvl)
    if tier:
        levels[name] = tier
    else:
        unmapped.add(lvl)

levels = dict(sorted(levels.items(), key=lambda kv: kv[0].lower()))
OUT.write_text(json.dumps(levels, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
from collections import Counter
print(f"Wrote {len(levels)} non-basic-or-explicit members -> {OUT}  (everyone else defaults to 'basic')")
for tier, n in Counter(levels.values()).most_common():
    print(f"  {n:3d}  {tier}")
if unmapped:
    print("WARNING — unmapped membership levels (these defaulted to basic):", sorted(unmapped))
