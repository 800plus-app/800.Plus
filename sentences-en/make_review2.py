# -*- coding: utf-8 -*-
"""בניית מנות ביקורת לסבב השני: word<TAB>gloss<TAB>sentence.
מצליב batches/e-NN.txt (יחידה·מילה·גלוסה) עם final-e-NN.tsv (מילה·משפט).
פלט: review2/r-e-NN.txt
"""
import glob, io, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
outdir = os.path.join(HERE, 'review2')
os.makedirs(outdir, exist_ok=True)

names = sorted(os.path.basename(p)[6:-4] for p in glob.glob(os.path.join(HERE, 'final-e-*.tsv')))
tot = 0
for nb in names:
    ins = [l.rstrip('\n').split('\t') for l in
           io.open(os.path.join(HERE, 'batches', nb + '.txt'), encoding='utf-8') if l.strip()]
    fins = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'final-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    if len(ins) != len(fins):
        print('⛔ %s: %d קלט מול %d סופי' % (nb, len(ins), len(fins)))
        continue
    rows = []
    for i, f in zip(ins, fins):
        word, gloss = i[1], i[2]
        w2, sent = f[0], f[1]
        if word.strip().lower() != w2.strip().lower():
            print('⚠ %s: אי-התאמת מילה %s ≠ %s' % (nb, word, w2))
        rows.append('%s\t%s\t%s' % (word, gloss, sent))
    io.open(os.path.join(outdir, 'r-%s.txt' % nb), 'w', encoding='utf-8').write('\n'.join(rows) + '\n')
    tot += len(rows)
print('🟢 %d מנות · %d שורות' % (len(names), tot))
