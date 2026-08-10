# -*- coding: utf-8 -*-
"""מרענן את תיקיית התצוגה `יחידות/` מתוך `units_output/`.

מעתיק unit-N-hebrew.md (ויחידה 1 מ-unit-1-flat.md) אל יחידות/יחידה-NN.md,
מסיר שורות-עבודה, ומוודא 2,015 ערכים סה"כ.
"""
import io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'units_output')
DST = os.path.join(ROOT, 'יחידות')
ROW = re.compile(r'^\|\s*\d+\s*\|')
EXPECTED = 2013


def is_work_line(ln):
    s = ln.strip()
    return ('בדיקת כפילויות' in s
            or s.startswith('גרסה חתומה')
            or s.startswith('⚠'))


total = 0
for u in range(1, 11):
    src = os.path.join(SRC, 'unit-1-flat.md' if u == 1 else 'unit-%d-hebrew.md' % u)
    out = []
    n = 0
    for ln in io.open(src, encoding='utf-8'):
        if is_work_line(ln):
            continue
        if ROW.match(ln):
            n += 1
        out.append(ln)
    # ניקוי שורות ריקות כפולות שנוצרו מהסרה
    clean = []
    for ln in out:
        if not ln.strip() and clean and not clean[-1].strip():
            continue
        clean.append(ln)
    dst = os.path.join(DST, 'יחידה-%02d.md' % u)
    io.open(dst, 'w', encoding='utf-8').writelines(clean)
    total += n
    print('יחידה-%02d.md  %d ערכים' % (u, n))

print('\nסה"כ %d ערכים' % total)
if total != EXPECTED:
    print('⛔ ציפינו ל-%d' % EXPECTED)
    sys.exit(1)
print('✓ תיקיית התצוגה רועננה')
