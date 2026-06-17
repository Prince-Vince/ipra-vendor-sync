import sys, zipfile, re
from pathlib import Path
import xml.etree.ElementTree as ET

p = Path(r"C:\Users\VinceDavis\Downloads\Membership Report (8).xlsx")

def ln(tag): return tag.split('}')[-1]

def col_idx(ref):
    m = re.match(r'([A-Z]+)', ref or 'A')
    letters = m.group(1) if m else 'A'
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1

z = zipfile.ZipFile(p)
shared = []
if 'xl/sharedStrings.xml' in z.namelist():
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root:
        shared.append(''.join(t.text or '' for t in si.iter() if ln(t.tag) == 't'))

def read_sheet(name):
    root = ET.fromstring(z.read(name))
    rows = []
    for el in root.iter():
        if ln(el.tag) != 'row':
            continue
        cells, maxc = {}, -1
        for c in el:
            if ln(c.tag) != 'c':
                continue
            ci = col_idx(c.get('r', 'A'))
            t = c.get('t')
            vtext = istext = None
            for child in c:
                k = ln(child.tag)
                if k == 'v':
                    vtext = child.text
                elif k == 'is':
                    istext = ''.join(tt.text or '' for tt in child.iter() if ln(tt.tag) == 't')
            if t == 's' and vtext is not None:
                val = shared[int(vtext)]
            elif t == 'inlineStr':
                val = istext
            else:
                val = vtext
            cells[ci] = val
            maxc = max(maxc, ci)
        rows.append([cells.get(i) for i in range(maxc + 1)])
    return rows

for sf in sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)):
    rows = read_sheet(sf)
    print(f"=== {sf}  ({len(rows)} rows) ===")
    for i, r in enumerate(rows[:14]):
        rr = list(r)
        while rr and rr[-1] in (None, ''):
            rr.pop()
        print(f"[{i}]", rr)
    print(f"... total rows: {len(rows)}")
