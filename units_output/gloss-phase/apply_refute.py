# -*- coding: utf-8 -*-
"""מחיל את תוצאות סבב ההפרכה.

CONFIRMED        -> הפירוש החדש נשאר.
REJECTED/UNSURE  -> הפירוש הקודם (old-glosses.tsv) מוחזר, והערך מסומן SKIP.

    python apply_refute.py            # דוח בלבד, בלי לכתוב
    python apply_refute.py --write    # כותב לקבצי היחידות
"""
import io, os, re, sys, unicodedata, collections

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
RB = os.path.join(HERE, 'refute-batches')
ROW = re.compile(r'^(\|\s*(\d+)\s*\|)(.*?)(\|)(.*)(\|\s*)$')
NIQ = re.compile(r'[֑-ׇ]')
WRITE = '--write' in sys.argv


def key(s):
    s = unicodedata.normalize('NFKC', s).replace('־', ' ').replace('-', ' ')
    return ' '.join(NIQ.sub('', s).split()).strip()


def unit_md(u):
    return os.path.join(UNITS, 'unit-1-flat.md' if u == 1 else 'unit-%d-hebrew.md' % u)


# --- הפירושים הקודמים ---
old = {}
for ln in io.open(os.path.join(HERE, 'old-glosses.tsv'), encoding='utf-8'):
    c = ln.rstrip('\n').split('\t')
    if len(c) >= 4:
        old[(int(c[0]), int(c[1]))] = c[3]

# --- הכרעות ההפרכה ---
verdicts = {}
missing_out = []
for u in range(1, 11):
    for fn in sorted(os.listdir(RB)):
        m = re.match(r'^r%d-(\d+)\.txt$' % u, fn)
        if not m:
            continue
        out = os.path.join(RB, 'out-' + fn[:-4] + '.tsv')
        if not os.path.exists(out):
            missing_out.append(fn[:-4])
            continue
        for ln in io.open(out, encoding='utf-8'):
            ln = ln.rstrip('\n')
            if not ln.strip():
                continue
            c = ln.split('\t')
            if len(c) < 3 or not c[0].strip().isdigit():
                continue
            n = int(c[0].strip())
            v = c[2].strip().upper()
            v = ('CONFIRMED' if 'CONFIRM' in v else
                 'REJECTED' if 'REJECT' in v else
                 'UNSURE' if 'UNSURE' in v else v)
            verdicts[(u, n)] = (v, c[1].strip(), (c[3].strip() if len(c) > 3 else ''))

if missing_out:
    print('⚠ חסרות תוצאות למנות: %s' % ', '.join(missing_out))

# --- החלה ---
stats = collections.Counter()
log = []
for u in range(1, 11):
    path = unit_md(u)
    lines = io.open(path, encoding='utf-8').readlines()
    i, changed = 0, 0
    for li, ln in enumerate(lines):
        m = ROW.match(ln.rstrip('\n'))
        if not m or not m.group(2).isdigit():
            continue
        i += 1
        vd = verdicts.get((u, i))
        if not vd:
            continue
        v, word, why = vd
        cur = m.group(5).strip()
        disp = m.group(3).strip()
        if word and key(word) != key(disp):
            print('⛔ אי-התאמת מילה י%d:%d — במנה "%s" בקובץ "%s"' % (u, i, word, disp))
            stats['mismatch'] += 1
            continue
        stats[v] += 1
        if v == 'CONFIRMED':
            continue
        prev = old.get((u, i))
        if not prev:
            print('⛔ אין פירוש קודם לי%d:%d %s — נשאר כפי שהוא' % (u, i, disp))
            stats['no_prev'] += 1
            continue
        log.append((u, i, disp, v, cur, prev, why))
        lines[li] = '%s%s%s %s %s' % (m.group(1), m.group(3), m.group(4), prev, m.group(6).lstrip()) + '\n'
        changed += 1
    if WRITE and changed:
        io.open(path, 'w', encoding='utf-8').writelines(lines)
    print('י%-3d הוכרעו %-4d · הוחזרו %d' % (u, sum(1 for k in verdicts if k[0] == u), changed))

with io.open(os.path.join(HERE, 'refute-log.tsv'), 'w', encoding='utf-8') as f:
    f.write('יחידה\t#\tמילה\tהכרעה\tפירוש שנדחה\tפירוש שהוחזר\tנימוק\n')
    for r in log:
        f.write('\t'.join(str(x) for x in r) + '\n')

print('\nסה"כ: CONFIRMED %d · REJECTED %d · UNSURE %d · הוחזרו %d'
      % (stats['CONFIRMED'], stats['REJECTED'], stats['UNSURE'], len(log)))
if not WRITE:
    print('(הרצה יבשה — הוסף --write כדי לכתוב)')
