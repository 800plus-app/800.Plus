# -*- coding: utf-8 -*-
"""מיזוג פסיקות הסבב השני: final-e-NN.tsv + review2/rev2-e-NN.tsv ⟵ final2-e-NN.tsv.
כל FIX נבדק מכנית לפני קבלה: מילת הערך במשפט · אורך 6-20 · בלי אסורות/מקף ארוך ·
לא ריק. FIX שנכשל ⟵ המקורי נשאר ונרשם. אי-התאמת ספירה ⟵ מיזוג לפי מפתח-מילה.
שימוש: python apply2.py e-01 [e-02 ...]  או בלי ארגומנטים = כל המנות שיש להן rev2.
"""
import glob, io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_en import word_in, BANNED

def fix_ok(w, s):
    if not s or '—' in s:
        return False
    n = len(re.findall(r"[A-Za-z']+", s))
    if n < 6 or n > 20:
        return False
    low = s.lower()
    for b in BANNED:
        if (b in low or b in s) and b.strip().lower() not in w.lower():
            return False
    return word_in(w, s)

names = sys.argv[1:] or sorted(
    os.path.basename(p)[5:-4] for p in glob.glob(os.path.join(HERE, 'review2', 'rev2-e-*.tsv')))
tot_fix, tot_rej = 0, 0
for nb in names:
    fins = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'final-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    revs = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'review2', 'rev2-%s.tsv' % nb), encoding='utf-8')
            if l.strip() and not l.startswith('#')]
    bykey = {}
    if len(revs) != len(fins):
        for r in revs:
            bykey.setdefault(r[0].strip().lower(), r)
        print('⚠ %s: %d פסיקות מול %d — מיזוג לפי מילה' % (nb, len(revs), len(fins)))
    out, fixed, rej = [], 0, 0
    for i, f in enumerate(fins):
        w, sent = f[0], f[1]
        r = revs[i] if not bykey and i < len(revs) else bykey.get(w.strip().lower())
        if r and len(r) > 1 and r[1].strip().upper() == 'FIX':
            new = r[2].strip() if len(r) > 2 else ''
            if fix_ok(w, new):
                sent = new; fixed += 1
            else:
                rej += 1
                print('   ✗ %s %s: FIX נדחה בשער — נשאר המקורי' % (nb, w))
        out.append('%s\t%s' % (w, sent))
    io.open(os.path.join(HERE, 'final2-%s.tsv' % nb), 'w', encoding='utf-8').write(
        '\n'.join(out) + '\n')
    tot_fix += fixed; tot_rej += rej
    print('🟢 %s: %d תוקנו · %d נדחו בשער' % (nb, fixed, rej))
print('סה"כ: %d תוקנו · %d נדחו' % (tot_fix, tot_rej))
