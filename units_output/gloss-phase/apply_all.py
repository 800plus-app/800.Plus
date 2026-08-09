# -*- coding: utf-8 -*-
"""החלת כל מנות הפלט שטרם הוחלו + דיווח מצב פר-יחידה.

    python apply_all.py

עוקב אחרי מה שכבר הוחל דרך applied.log (שם קובץ + גודל), כדי שהרצה חוזרת
לא תחיל מנה פעמיים.
"""
import io, os, re, subprocess, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'batches')
LOG = os.path.join(HERE, 'applied.log')

done = set()
if os.path.exists(LOG):
    done = {ln.strip() for ln in io.open(LOG, encoding='utf-8') if ln.strip()}

pending = []
for f in sorted(os.listdir(B)):
    m = re.match(r'^out-u(\d+)-(\d+)-(\d+)\.tsv$', f)
    if not m:
        continue
    stamp = '%s:%d' % (f, os.path.getsize(os.path.join(B, f)))
    if stamp in done:
        continue
    pending.append((int(m.group(1)), int(m.group(2)), f, stamp))

pending.sort()


def sanitize(path):
    """סוכנים משאירים לפעמים שיירי תגיות כלי בסוף הקובץ — מנקים לפני ההחלה."""
    raw = io.open(path, encoding='utf-8').read()
    lines = [ln for ln in raw.split('\n')
             if ln.strip() and not ln.lstrip().startswith(('<', '#', '```'))]
    clean = '\n'.join(lines) + '\n'
    if clean != raw:
        io.open(path, 'w', encoding='utf-8', newline='\n').write(clean)
        print('  (נוקו שיירי תגיות מ-%s)' % os.path.basename(path))
    return len(lines)


applied = []
for u, _lo, f, stamp in pending:
    sanitize(os.path.join(B, f))
    stamp = '%s:%d' % (f, os.path.getsize(os.path.join(B, f)))
    r = subprocess.run([sys.executable, os.path.join(HERE, 'apply_batch.py'),
                        str(u), os.path.join(B, f)],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        print('⛔ %s נכשל: %s' % (f, (r.stderr or '').strip()[:200]))
        continue
    print('%s → %s' % (f, (r.stdout or '').strip()))
    applied.append(stamp)

with io.open(LOG, 'a', encoding='utf-8', newline='\n') as fh:
    for s in applied:
        fh.write(s + '\n')

# מצב פר-יחידה
print('\nמצב:')
tally = {}
for ln in io.open(os.path.join(HERE, 'gloss-status.tsv'), encoding='utf-8'):
    c = ln.rstrip('\n').split('\t')
    if len(c) >= 7 and c[0].isdigit():
        t = tally.setdefault(int(c[0]), {'ממתין': 0, 'אומת': 0, 'שוכתב': 0, 'SKIP': 0})
        t[c[6]] = t.get(c[6], 0) + 1
tot = {'ממתין': 0, 'אומת': 0, 'שוכתב': 0, 'SKIP': 0}
for u in sorted(tally):
    t = tally[u]
    for k in tot:
        tot[k] += t.get(k, 0)
    left = t.get('ממתין', 0)
    print('  י%-2d אומת %-3d שוכתב %-3d SKIP %-2d %s'
          % (u, t.get('אומת', 0), t.get('שוכתב', 0), t.get('SKIP', 0),
             '· נותרו %d' % left if left else '✓ הושלמה'))
n = sum(tot.values())
print('  סה"כ %d/%d טופלו (%.1f%%) · אומת %d · שוכתב %d · SKIP %d'
      % (n - tot['ממתין'], n, 100.0 * (n - tot['ממתין']) / n,
         tot['אומת'], tot['שוכתב'], tot['SKIP']))
