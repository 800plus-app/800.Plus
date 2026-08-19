# -*- coding: utf-8 -*-
"""שער מכני מוקשח · סבב שני. רץ על final-e-NN.tsv (או rev2-*.tsv עם --rev).
מוסיף על check_en.py: כפילות משפטים בכל הקורפוס · דפוסי-הגדרה ·
מונוטוניות פותחנים · רווח כפול · תו לא-ASCII · אות פותחת · נקודה מסיימת.
"""
import glob, io, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_en import word_in, BANNED

DEFINING = (', which means', 'which is a', 'refers to', 'is defined as',
            'is a word that', ', meaning ', 'is when you', 'is the act of')

files = sorted(glob.glob(os.path.join(HERE, 'final-e-*.tsv')))
rows = []          # (batch, idx, word, sent)
for p in files:
    nb = os.path.basename(p)[6:-4]
    ins = [l.rstrip('\n').split('\t') for l in
           io.open(os.path.join(HERE, 'batches', nb + '.txt'), encoding='utf-8') if l.strip()]
    for i, l in enumerate(io.open(p, encoding='utf-8')):
        l = l.rstrip('\n')
        if not l.strip():
            continue
        c = l.split('\t')
        rows.append((nb, i, c[0], c[1] if len(c) > 1 else '', ins[i][2] if i < len(ins) else ''))

probs = collections.defaultdict(list)
seen = {}
opener_runs = []
prev_open, run = None, 0
for nb, i, w, s, g in rows:
    key = '%s:%d %s' % (nb, i + 1, w)
    if not s.strip():
        probs[key].append('ריק'); continue
    n = len(re.findall(r"[A-Za-z']+", s))
    if n < 6 or n > 20:
        probs[key].append('אורך %d' % n)
    low = s.lower()
    for b in BANNED:
        if (b in low or b in s) and b.strip().lower() not in w.lower():
            probs[key].append('אסור: %s' % b.strip())
    for d in DEFINING:
        if d in low:
            probs[key].append('דפוס-הגדרה: %s' % d.strip())
    if not word_in(w, s):
        probs[key].append('המילה לא במשפט')
    if '  ' in s:
        probs[key].append('רווח כפול')
    if not s[0].isupper() and not s[0].isdigit() and s[0] not in '"\'':
        probs[key].append('פותח באות קטנה')
    if not s.rstrip().endswith(('.', '!', '?', '"', "'")):
        probs[key].append('בלי סימן סיום')
    weird = [ch for ch in s if ord(ch) > 127 and ch not in '’‘“”éèáíóúñ']
    if weird:
        probs[key].append('תו חריג: %s' % ''.join(sorted(set(weird))))
    if low in seen and seen[low] != w:
        probs[key].append('משפט כפול עם %s' % seen[low])
    seen[low] = w
    op = low.split()[0]
    if op == prev_open:
        run += 1
        if run >= 5:
            opener_runs.append('%s: רצף %d של "%s"' % (key, run + 1, op))
    else:
        prev_open, run = op, 0

print('סה"כ שורות: %d' % len(rows))
for k, v in probs.items():
    print('⛔ %s: %s' % (k, '; '.join(v)))
print('בעיות: %d שורות' % len(probs))
for o in opener_runs[:20]:
    print('⚠ ', o)
