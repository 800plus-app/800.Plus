# -*- coding: utf-8 -*-
"""שער הסגירה המלא — כל עשר היחידות בבת אחת.

בדיקות:
1. מילים: ייחודיות גלובלית אחרי נרמול (אפס כפילויות).
2. שורשים: שורש המופיע ביותר ממילה אחת חייב להיות ב-root-exceptions.txt.
3. גדלים: מספרי שורות רציפים בכל TSV; סכימה מדווחת.
4. TSV ↔ MD: אותו מספר שורות, ואותה מילה בכל שורה (בקיפול כתיב).
5. פירושים: אפס פירושים ריקים ב-MD.
שימוש: python check_all.py
"""
import collections, glob, io, os, re, sys, unicodedata
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
NIQ = re.compile(r'[֑-ׇ]')
FIN = str.maketrans('ךםןףץ', 'כמנפצ')

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('־', '-').replace('‐', '-').replace('‑', '-')  # מקף לפני ניקוד — ־ בתוך טווח הניקוד
    s = NIQ.sub('', s)
    return ' '.join(s.split()).strip()

def ident(s):
    """זהות ערך — מקף ורווח הם אותו דבר. ⛔ בלי זה `בֶּן-דְּמוּתוֹ` ו-`בן דמותו`
    נחשבים שני ערכים, ושלוש כפילויות כאלה כמעט נכנסו למאגר בתוספת מילות הפער."""
    return ' '.join(norm(s).replace('-', ' ').split())


def fold(s):
    out = []
    s = norm(s).replace('-', ' ').replace('"', '').replace("'", '').replace('׳', '').replace('״', '')
    for w in s.split():
        w = w.translate(FIN)
        w = re.sub(r'וו+', 'ו', w); w = re.sub(r'יי+', 'י', w)
        if len(w) > 2:
            w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
        out.append(w)
    return ' '.join(out)

exceptions = set()
for ln in io.open(os.path.join(HERE, 'root-exceptions.txt'), encoding='utf-8'):
    ln = ln.strip()
    if ln and not ln.startswith('#'):
        exceptions.add(norm(ln.split('\t')[0]))

ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')
problems, words, root_words = [], {}, collections.defaultdict(list)
sizes = {}
for u in range(1, 11):
    tsv = os.path.join(HERE, 'unit-%d-words.tsv' % u)
    md = os.path.join(HERE, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    rows = []
    for ln in io.open(tsv, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip():
            continue
        num, w, roots = ln.split('\t')
        rows.append((int(num), w.strip(), roots.strip()))
    # מספור רציף
    for i, (num, w, _r) in enumerate(rows, 1):
        if num != i:
            problems.append('י%d: מספור שבור בשורה %d (רשום %d)' % (u, i, num))
            break
    sizes[u] = len(rows)
    for _n, w, roots in rows:
        nw = ident(w)
        if nw in words:
            problems.append('כפילות מילה: "%s" (י%d וגם %s)' % (w, u, words[nw]))
        words[nw] = 'י%d' % u
        for r in roots.split(','):
            if r.strip():
                root_words[norm(r)].append((w, u))
    # MD מול TSV
    mdrows = []
    for ln in io.open(md, encoding='utf-8'):
        m = ROW.match(ln)
        if m and m.group(1).isdigit():
            mdrows.append((m.group(2).strip(), m.group(3).strip()))
    if len(mdrows) != len(rows):
        problems.append('י%d: %d שורות TSV מול %d שורות MD' % (u, len(rows), len(mdrows)))
    else:
        for i, ((_n, w, _r), (dw, gloss)) in enumerate(zip(rows, mdrows), 1):
            if fold(w) != fold(dw) and fold(w) != fold(dw.split('/')[0]):
                problems.append('י%d שורה %d: TSV "%s" ↔ MD "%s"' % (u, i, w, norm(dw)))
            if not gloss.strip():
                problems.append('י%d שורה %d (%s): פירוש ריק' % (u, i, w))

for r, ws in sorted(root_words.items()):
    distinct = sorted({w for w, _u in ws})
    if len(distinct) > 1 and r not in exceptions:
        problems.append('שורש "%s" משותף ל-%s ואינו בחריגים' % (r, ' / '.join(distinct)))

total = sum(sizes.values())
print('גדלים: ' + ' '.join('י%d=%d' % (u, sizes[u]) for u in range(1, 11)) + ' · סה"כ %d' % total)
shared = sum(1 for r, ws in root_words.items() if len({w for w, _ in ws}) > 1 and r in exceptions)
if problems:
    print('⛔ שער הסגירה: נכשל (%d בעיות)' % len(problems))
    for p in problems:
        print('   ' + p)
    sys.exit(1)
print('שער הסגירה: עבר ✓ · %d מילים · %d שורשים-משותפים מאושרים · אפס פירושים ריקים' % (total, shared))
