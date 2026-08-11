# -*- coding: utf-8 -*-
"""קלט לסבב אימות התרגומים: t-e-NN.txt + tr-e-NN.tsv ⟵ trans/r-e-NN.txt
שורה: מילה ⭾ פירוש ⭾ משפט אנגלי ⭾ תרגום. רץ רק על מנות שעברו את השער.
"""
import glob, io, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
TR = os.path.join(HERE, 'trans')
names = sys.argv[1:] or sorted(
    os.path.basename(p)[3:-4] for p in glob.glob(os.path.join(TR, 'tr-e-*.tsv')))
for nb in names:
    ins = [l.rstrip('\n').split('\t') for l in
           io.open(os.path.join(TR, 't-%s.txt' % nb), encoding='utf-8') if l.strip()]
    trs = [l.rstrip('\n').split('\t') for l in
           io.open(os.path.join(TR, 'tr-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    assert len(ins) == len(trs), nb
    out = []
    for i, t in zip(ins, trs):
        assert i[0] == t[0], '%s: %s≠%s' % (nb, i[0], t[0])
        out.append('%s\t%s\t%s\t%s' % (i[0], i[1], i[2], t[1]))
    io.open(os.path.join(TR, 'r-%s.txt' % nb), 'w', encoding='utf-8').write(
        '\n'.join(out) + '\n')
    print('🟢 r-%s.txt (%d)' % (nb, len(out)))
