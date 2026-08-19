# -*- coding: utf-8 -*-
"""מפצל את refute-uN.txt למנות עבודה של ~30 ערכים לסוכני הפרכה,
ובמקביל מחלץ את הפירושים הקודמים (שורת "נוכחי:" במנות המקוריות) אל old-glosses.tsv
כדי שנוכל להחזיר פירוש שנדחה.
"""
import io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'refute-batches')
os.makedirs(OUT, exist_ok=True)

CHUNK = 30

# --- 1. פיצול מנות ההפרכה ---
made = []
for u in range(1, 11):
    src = os.path.join(HERE, 'refute-u%d.txt' % u)
    blocks, cur = [], []
    for ln in io.open(src, encoding='utf-8'):
        if ln.startswith('### '):
            if cur:
                blocks.append(cur)
            cur = [ln]
        elif cur:
            cur.append(ln)
    if cur:
        blocks.append(cur)
    for j in range(0, len(blocks), CHUNK):
        part = blocks[j:j + CHUNK]
        name = 'r%d-%02d' % (u, j // CHUNK + 1)
        with io.open(os.path.join(OUT, name + '.txt'), 'w', encoding='utf-8') as f:
            f.write('# מנת הפרכה — יחידה %d · %d ערכים\n\n' % (u, len(part)))
            for b in part:
                f.write(''.join(b).rstrip('\n') + '\n\n')
        made.append((name, u, len(part)))

# --- 2. חילוץ הפירושים הקודמים ---
old = {}
bdir = os.path.join(HERE, 'batches')
for fn in sorted(os.listdir(bdir)):
    m = re.match(r'^u(\d+)-\d+-\d+\.txt$', fn)
    if not m:
        continue
    u = int(m.group(1))
    num = None
    for ln in io.open(os.path.join(bdir, fn), encoding='utf-8'):
        h = re.match(r'^### (\d+) \| (.+?)\s*$', ln)
        if h:
            num = int(h.group(1))
            word = h.group(2)
            continue
        if num is not None and ln.startswith('נוכחי:'):
            old[(u, num)] = (word, ln[len('נוכחי:'):].strip())
            num = None

with io.open(os.path.join(HERE, 'old-glosses.tsv'), 'w', encoding='utf-8') as f:
    for (u, n) in sorted(old):
        w, g = old[(u, n)]
        f.write('%d\t%d\t%s\t%s\n' % (u, n, w, g))

for name, u, c in made:
    print('%s\t%d' % (name, c))
print('סה"כ מנות: %d · פירושים קודמים שחולצו: %d' % (len(made), len(old)))
