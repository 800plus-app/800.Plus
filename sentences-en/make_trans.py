# -*- coding: utf-8 -*-
"""מנות תרגום: final2-e-NN.tsv + הפירוש מ-data-en.js ⟵ trans/t-e-NN.txt
שורה: מילה ⭾ פירוש-עברי ⭾ משפט. הפירוש ניתן כדי שהמילה הנלמדת תתורגם
לפי המשמעות שהאפליקציה מלמדת, לא לפי משמעות אחרת של אותה מילה.
"""
import glob, io, json, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))

raw = io.open(os.path.join(HERE, '..', 'data-en.js'), encoding='utf-8').read()
m = re.search(r'=\s*(\{.*\})\s*;?\s*$', raw, re.S)
data = json.loads(m.group(1))
gloss = {}
for u in data.values():
    for w, g in u:
        gloss[w] = g

os.makedirs(os.path.join(HERE, 'trans'), exist_ok=True)
tot = 0
for p in sorted(glob.glob(os.path.join(HERE, 'final2-e-*.tsv'))):
    nb = os.path.basename(p)[7:-4]
    rows = [l.rstrip('\n').split('\t') for l in io.open(p, encoding='utf-8') if l.strip()]
    out = []
    for w, s in rows:
        assert w in gloss, 'אין פירוש: ' + w
        out.append('%s\t%s\t%s' % (w, gloss[w], s))
    io.open(os.path.join(HERE, 'trans', 't-%s.txt' % nb), 'w', encoding='utf-8').write(
        '\n'.join(out) + '\n')
    tot += len(out)
print('🟢 %d מנות · %d שורות' % (len(glob.glob(os.path.join(HERE, 'trans', 't-e-*.txt'))), tot))
