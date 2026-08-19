# -*- coding: utf-8 -*-
"""איחוד פלטי השופטים + שערים מכניים.

בדיקות: שלמות שורות מול הקלט · הכרעה חוקית · סדר תואם.
שערים מכניים אחרי השיפוט:
  א. למה שכבר במאגר (norm/fold, כולל וריאנטים של סוגריים) ⇒ נדחה-מכני.
  ב. שורש שכבר ב-roots-used/במאגר ⇒ נדחה-מכני, אלא אם השופט נימק שורש-חריג.
  ג. איחוד למות כפולות בין מנות (צירוף ציטוטים).
פלט: accepted.tsv · rejected.tsv · סיכום.
"""
import collections, glob, io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(os.path.dirname(HERE))
UNITS = os.path.join(PROJ, 'units_output')

NIQ = re.compile(r'[֑-ׇ]')
FINALS = str.maketrans('ךםןףץ', 'כמנפצ')

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = NIQ.sub('', s)
    s = s.replace('־', ' ').replace('-', ' ')
    s = s.replace('׳', "'").replace('״', '"')
    return ' '.join(s.split()).strip()

def fold_word(w):
    w = w.translate(FINALS)
    w = re.sub(r'וו+', 'ו', w)
    w = re.sub(r'יי+', 'י', w)
    if len(w) > 2:
        w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
    return w

def fold(s):
    return ' '.join(fold_word(w) for w in norm(s).split())

# מאגר
bank_norm, bank_fold = set(), set()
PAREN = re.compile(r'\(([^)]*)\)')
for n in range(1, 11):
    for ln in io.open(os.path.join(UNITS, 'unit-%d-words.tsv' % n), encoding='utf-8'):
        p = ln.rstrip('\n').split('\t')
        if len(p) < 3 or not p[1].strip():
            continue
        w = p[1].strip()
        for v in {w, PAREN.sub(r'\1', w), PAREN.sub('', w)}:
            nv = norm(v)
            if nv:
                bank_norm.add(nv)
                bank_fold.add(fold(v))

roots_used = set()
for ln in io.open(os.path.join(UNITS, 'roots-used.txt'), encoding='utf-8'):
    r = ln.strip().translate(FINALS)
    if r and not r.startswith('#'):
        roots_used.add(r.replace('-', ''))

VALID = {'מועמד', 'דחייה: רעש', 'דחייה: נטייה', 'דחייה: שקופה', 'דחייה: שכיחה',
         'דחייה: שם-פרטי', 'דחייה: ארמית', 'דחייה: מקצועי', 'דחייה: לועזית',
         'דחייה: הומוגרף', 'דחייה: שורש-קיים'}

# נתוני הצבירה המקוריים
agg = {}
for ln in io.open(os.path.join(HERE, 'candidates.tsv'), encoding='utf-8'):
    if ln.startswith('#') or ln.startswith('מנורמל'):
        continue
    p = ln.rstrip('\n').split('\t')
    if len(p) >= 9:
        agg[p[0]] = p

problems, judged = [], {}
for inp in sorted(glob.glob(os.path.join(HERE, 'judge-batches', 'j-*.txt'))):
    nb = os.path.basename(inp)[:-4]
    outp = os.path.join(HERE, 'judge-batches', 'out-%s.tsv' % nb)
    if not os.path.exists(outp):
        problems.append('%s: אין פלט' % nb)
        continue
    ins = [l.rstrip('\n').split('\t') for l in io.open(inp, encoding='utf-8') if l.strip()]
    outs = [l.rstrip('\n').split('\t') for l in io.open(outp, encoding='utf-8')
            if l.strip() and not l.startswith('#') and not l.startswith('מנורמל')]
    if len(ins) != len(outs):
        problems.append('%s: %d קלט מול %d פלט' % (nb, len(ins), len(outs)))
        continue
    for i, (a, b) in enumerate(zip(ins, outs)):
        key = a[0]
        if norm(b[0]) != norm(key):
            problems.append('%s שורה %d: סדר לא תואם (%s≠%s)' % (nb, i + 1, b[0], key))
            continue
        verdict = b[1].strip() if len(b) > 1 else ''
        if verdict not in VALID:
            problems.append('%s שורה %d: הכרעה לא חוקית "%s"' % (nb, i + 1, verdict))
            continue
        lemma = b[2].strip() if len(b) > 2 else ''
        root = b[3].strip() if len(b) > 3 else ''
        note = b[4].strip() if len(b) > 4 else ''
        judged[key] = (verdict, lemma, root, note, nb)

print('נשפטו: %d · בעיות: %d' % (len(judged), len(problems)))
for p in problems[:20]:
    print('  ⚠', p)

# --- שערים מכניים על המועמדים ---
by_lemma = {}
rejected = []
for key, (verdict, lemma, root, note, nb) in judged.items():
    a = agg.get(key, [key, key, '?', '?', '', '0', '0', '0', ''])
    if verdict != 'מועמד':
        rejected.append((key, a[1], verdict, note, nb))
        continue
    ln_, lf = norm(lemma), fold(lemma)
    if ln_ in bank_norm or lf in bank_fold:
        rejected.append((key, a[1], 'נדחה-מכני: למה-כבר-במאגר (%s)' % lemma, note, nb))
        continue
    rkey = norm(root).replace(' ', '').translate(FINALS)
    exc = note.startswith('שורש-חריג')
    if rkey and rkey != '-' and rkey in roots_used and not exc:
        rejected.append((key, a[1], 'נדחה-מכני: שורש-קיים (%s)' % root, note, nb))
        continue
    e = by_lemma.setdefault(ln_, {'lemma': lemma, 'root': root, 'notes': set(),
                                  'keys': [], 'moadim': set(), 'occ': 0,
                                  'qs': [], 'kinds': set(), 'cites': [], 'exc': exc})
    e['keys'].append(key)
    if note:
        e['notes'].add(note)
    for c in a[8].split(' ; '):
        if c:
            e['cites'].append(c)
            e['moadim'].add(c.split('·')[0])
    e['occ'] += int(a[6] or 0)
    if a[7] and float(a[7]) > 0:
        e['qs'].append(float(a[7]))
    e['kinds'].add(a[2])

with io.open(os.path.join(HERE, 'accepted.tsv'), 'w', encoding='utf-8') as f:
    f.write('למה\tשורש\tמועדים\tהופעות\tממוצע-שאלה\tסוגים\tצורות-מקור\tהערות\tציטוטים\n')
    for ln_, e in sorted(by_lemma.items(), key=lambda kv: (-len(kv[1]['moadim']), kv[0])):
        avg_q = sum(e['qs']) / len(e['qs']) if e['qs'] else 0
        f.write('\t'.join([e['lemma'], e['root'], str(len(e['moadim'])), str(e['occ']),
                           '%.1f' % avg_q, '+'.join(sorted(e['kinds'])),
                           ' / '.join(e['keys']), ' | '.join(sorted(e['notes'])),
                           ' ; '.join(e['cites'][:6])]) + '\n')

with io.open(os.path.join(HERE, 'rejected.tsv'), 'w', encoding='utf-8') as f:
    f.write('מנורמל\tייצוג\tסיבה\tהערה\tמנה\n')
    for r in sorted(rejected, key=lambda x: (x[2], x[0])):
        f.write('\t'.join(r) + '\n')

reasons = collections.Counter(r[2].split(' (')[0] for r in rejected)
print('\nמועמדים אחרי איחוד למות: %d' % len(by_lemma))
print('חריגי-שורש מנומקים: %d' % sum(1 for e in by_lemma.values() if e['exc']))
for r, c in reasons.most_common():
    print('  %s: %d' % (r, c))
