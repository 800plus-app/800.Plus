# -*- coding: utf-8 -*-
"""דגימות "לפני ⟵ אחרי" — 5 לכל יחידה, מתוך הפירושים ששוכתבו בפועל
(אחרי סבב ההפרכה). נבחרות הדגימות שבהן השינוי מהותי ביותר."""
import io, os, re, sys, difflib

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 5

old = {}
for ln in io.open(os.path.join(HERE, 'old-glosses.tsv'), encoding='utf-8'):
    c = ln.rstrip('\n').split('\t')
    if len(c) >= 4:
        old[(int(c[0]), int(c[1]))] = c[3]

for u in range(1, 11):
    path = os.path.join(UNITS, 'unit-1-flat.md' if u == 1 else 'unit-%d-hebrew.md' % u)
    cands = []
    i = 0
    for ln in io.open(path, encoding='utf-8'):
        m = ROW.match(ln.rstrip('\n'))
        if not m or not m.group(1).isdigit():
            continue
        i += 1
        cur = m.group(3).strip()
        prev = old.get((u, i))
        if prev is None or prev == cur:
            continue
        ratio = difflib.SequenceMatcher(None, prev, cur).ratio()
        cands.append((ratio, i, m.group(2).strip(), prev, cur))
    cands.sort()
    print('### יחידה %d' % u)
    for _, i, w, prev, cur in cands[:PER]:
        print('%d. %s' % (i, w))
        print('   לפני:  %s' % prev)
        print('   אחרי:  %s' % cur)
    print()
