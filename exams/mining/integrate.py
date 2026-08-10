# -*- coding: utf-8 -*-
"""שילוב התוספות המאושרות אל קובצי היחידות.

קלט: final-additions.tsv (למה-מנוקדת · שורש · פירוש · יחידה · ציטוט · מקורות)
פעולות לכל תוספת:
  unit-N-hebrew.md  — שורת טבלה חדשה בסוף, מספור ממשיך
  unit-N-words.tsv  — שורה תואמת: מספר · מילה-בלי-ניקוד · שורש-משורשר
                       (ניב ⇒ ביטוי-ממוקף, כמוסכמת יצא-נשכר הקיימת)
  roots-used.txt    — הוספת שורש חדש (מילים בודדות בלבד)
  gloss-status.tsv  — שורה: מוצא=כריית-מבחנים · סטטוס=שוכתב
שימוש: python integrate.py [--dry]
"""
import io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(os.path.dirname(HERE))
UNITS = os.path.join(PROJ, 'units_output')
DRY = '--dry' in sys.argv

NIQ = re.compile(r'[֑-ׇ]')
FIN = str.maketrans('ךםןףץ', 'כמנפצ')

def plain(s):
    s = unicodedata.normalize('NFKC', s).replace('־', ' ')
    return ' '.join(NIQ.sub('', s).split()).strip()

adds = []
for ln in io.open(os.path.join(HERE, 'final-additions.tsv'), encoding='utf-8'):
    if ln.startswith('#') or not ln.strip():
        continue
    p = ln.rstrip('\n').split('\t')
    assert len(p) >= 6, p
    adds.append({'lemma': p[0], 'root': p[1], 'gloss': p[2], 'unit': int(p[3]),
                 'cite': p[4], 'src': p[5]})
print('תוספות: %d' % len(adds))

# --- שורש משורשר לפי המוסכמה ---
for a in adds:
    pw = plain(a['lemma'])
    if ' ' in pw:                      # ניב ⇒ ביטוי ממוקף
        a['tsv_root'] = pw.replace(' ', '-')
    elif a['root'] in ('', '-'):
        a['tsv_root'] = pw.translate(FIN)
    else:
        a['tsv_root'] = a['root'].replace('-', '').translate(FIN)
    a['plain'] = pw

# --- בדיקת התנגשות שורש פנימית בין התוספות ---
seen = {}
for a in adds:
    if ' ' in a['plain']:
        continue
    if a['tsv_root'] in seen:
        print('⚠ שורש כפול בין תוספות: %s (%s ↔ %s) — דורש root-exceptions'
              % (a['tsv_root'], seen[a['tsv_root']], a['lemma']))
    seen[a['tsv_root']] = a['lemma']

by_unit = {}
for a in adds:
    by_unit.setdefault(a['unit'], []).append(a)

total_new = 0
for u in sorted(by_unit):
    md_p = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    tsv_p = os.path.join(UNITS, 'unit-%d-words.tsv' % u)
    md = io.open(md_p, encoding='utf-8').read().rstrip('\n')
    tsv = io.open(tsv_p, encoding='utf-8').read().rstrip('\n')
    last = int(tsv.splitlines()[-1].split('\t')[0])
    md_rows, tsv_rows = [], []
    n = last
    for a in by_unit[u]:
        n += 1
        a['num'] = n
        md_rows.append('| %d | %s | %s |' % (n, a['lemma'], a['gloss']))
        tsv_rows.append('%d\t%s\t%s' % (n, a['plain'], a['tsv_root']))
    print('יחידה %d: %d ⟵ %d (+%d)' % (u, last, n, n - last))
    total_new += n - last
    if not DRY:
        io.open(md_p, 'w', encoding='utf-8').write(md + '\n' + '\n'.join(md_rows) + '\n')
        io.open(tsv_p, 'w', encoding='utf-8').write(tsv + '\n' + '\n'.join(tsv_rows) + '\n')

if not DRY:
    # roots-used — מילים בודדות בלבד, שורש שאינו כבר בקובץ
    rp = os.path.join(UNITS, 'roots-used.txt')
    existing = set(l.strip() for l in io.open(rp, encoding='utf-8'))
    new_roots = []
    for a in adds:
        if ' ' not in a['plain'] and a['tsv_root'] not in existing:
            new_roots.append(a['tsv_root'])
            existing.add(a['tsv_root'])
    with io.open(rp, 'a', encoding='utf-8') as f:
        for r in new_roots:
            f.write(r + '\n')
    print('roots-used: +%d' % len(new_roots))

    # gloss-status
    with io.open(os.path.join(UNITS, 'gloss-phase', 'gloss-status.tsv'), 'a', encoding='utf-8') as f:
        for a in adds:
            f.write('\t'.join([str(a['unit']), str(a['num']), a['lemma'], a['plain'],
                               a['tsv_root'], 'כריית-מבחנים', 'שוכתב', a['src'],
                               a['cite']]) + '\n')
print('סה"כ נוספו: %d' % total_new)
