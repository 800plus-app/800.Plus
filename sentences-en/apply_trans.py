# -*- coding: utf-8 -*-
"""מיזוג פסיקות אימות התרגומים: trans/tr-e-NN.tsv + trans/rev-e-NN.tsv ⟵ trans/final-tr-e-NN.tsv.
כל FIX עובר את אותו שער מכני של check_trans לפני קבלה; FIX שנכשל ⟵ המקורי נשאר ונרשם.
אי-התאמת ספירה ⟵ מיזוג לפי מפתח-מילה. בלי ארגומנטים = כל המנות שיש להן rev.
"""
import glob, io, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
TR = os.path.join(HERE, 'trans')
sys.path.insert(0, HERE)
from check_trans import problems

names = sys.argv[1:] or sorted(
    os.path.basename(p)[4:-4] for p in glob.glob(os.path.join(TR, 'rev-e-*.tsv')))
tot_fix, tot_rej = 0, 0
for nb in names:
    fins = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(TR, 'tr-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    revs = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(TR, 'rev-%s.tsv' % nb), encoding='utf-8')
            if l.strip() and not l.startswith('#')]
    bykey = {}
    if len(revs) != len(fins):
        for r in revs:
            bykey.setdefault(r[0].strip().lower(), r)
        print('⚠ %s: %d פסיקות מול %d — מיזוג לפי מילה' % (nb, len(revs), len(fins)))
    out, fixed, rej = [], 0, 0
    for i, f in enumerate(fins):
        w, he = f[0], f[1]
        r = revs[i] if not bykey and i < len(revs) else bykey.get(w.strip().lower())
        if r and len(r) > 1 and r[1].strip().upper() == 'FIX':
            new = r[2].strip() if len(r) > 2 else ''
            if new and not problems(new):
                he = new; fixed += 1
            else:
                rej += 1
                print('   ✗ %s %s: FIX נדחה בשער — נשאר המקורי' % (nb, w))
        out.append('%s\t%s' % (w, he))
    io.open(os.path.join(TR, 'final-tr-%s.tsv' % nb), 'w', encoding='utf-8').write(
        '\n'.join(out) + '\n')
    tot_fix += fixed; tot_rej += rej
    print('🟢 %s: %d תוקנו · %d נדחו בשער' % (nb, fixed, rej))
print('סה"כ: %d תוקנו · %d נדחו' % (tot_fix, tot_rej))
