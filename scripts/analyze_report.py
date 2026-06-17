import zipfile, re, json
from pathlib import Path
from collections import Counter
import xml.etree.ElementTree as ET

REPORT = Path(r"C:\Users\VinceDavis\Downloads\Membership Report (8).xlsx")
VENDORS = Path(__file__).resolve().parent.parent / "vendors.json"

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
        shared.append(''.join(t.text or '' for t in si.iter() if lname(t.tag)=='t'))

def read_sheet(name):
    root = ET.fromstring(z.read(name)); rows = []
    for el in root.iter():
        if lname(el.tag) != 'row': continue
        cells, maxc = {}, -1
        for c in el:
            if lname(c.tag) != 'c': continue
            ci = col_idx(c.get('r','A')); t = c.get('t'); vtext = istext = None
            for child in c:
                k = lname(child.tag)
                if k=='v': vtext = child.text
                elif k=='is': istext = ''.join(tt.text or '' for tt in child.iter() if lname(tt.tag)=='t')
            val = shared[int(vtext)] if (t=='s' and vtext is not None) else (istext if t=='inlineStr' else vtext)
            cells[ci]=val; maxc=max(maxc,ci)
        rows.append([cells.get(i) for i in range(maxc+1)])
    return rows

rows = read_sheet('xl/worksheets/sheet1.xml')[1:]  # skip header
report = [(r[0].strip(), (r[1].strip() if len(r) > 1 and r[1] else '')) for r in rows if r and r[0] and str(r[0]).strip()]

def key(s):
    s = (s or '').lower(); s = re.sub(r"[.,&']", '', s); s = re.sub(r'\s+', ' ', s).strip(); return s

print(f"ACTIVE COMMERCIAL MEMBERS IN REPORT: {len(report)}\n")
print("LEVEL DISTRIBUTION:")
for lvl, n in Counter(l for _, l in report).most_common():
    print(f"  {n:3d}  {lvl or '(blank)'}")

vobj = json.loads(VENDORS.read_text(encoding='utf-8'))
scrape_keys = {key(v['n']): v['n'] for v in vobj['vendors']}
report_keys = {key(n): n for n, _ in report}

hidden = [n for n, _ in report if key(n) not in scrape_keys]
extra = [v['n'] for v in vobj['vendors'] if key(v['n']) not in report_keys]

print(f"\nIN REPORT but NOT on public directory ({len(hidden)})  <-- web-hidden / not displayed:")
for n in sorted(hidden): print(f"  - {n}")
print(f"\nON public directory but NOT in report ({len(extra)})  <-- renamed / mismatched / lapsed-but-shown:")
for n in sorted(extra): print(f"  - {n}")

print("\nMEMBERS WITH A NON-BLANK LEVEL:")
for n, l in sorted(report, key=lambda x: x[0].lower()):
    if l: print(f"  [{l}]  {n}")
