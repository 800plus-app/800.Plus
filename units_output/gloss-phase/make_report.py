# -*- coding: utf-8 -*-
"""דוח שלב הפירושים — מספרים מלאים + דגימות לפי יחידה.

    python make_report.py            > דוח-פירושים-v1.md
    python make_report.py --samples 6  (ברירת מחדל 5 לכל יחידה)

הדגימה מוטה לשכתובים (שם הסיכון), ומציגה לפני/אחרי מהמנות המקוריות.
"""
import collections, glob, io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')
NSAMPLE = 5
if '--samples' in sys.argv:
    NSAMPLE = int(sys.argv[sys.argv.index('--samples') + 1])


def plain(s):
    return ' '.join(NIQ.sub('', unicodedata.normalize('NFKC', s)).split()).strip()


# הפירוש שקדם לשכתוב — נשלף מקובצי המנה (שורת "נוכחי:")
old = {}
for p in glob.glob(os.path.join(HERE, 'batches', 'u*-*.txt')):
    m = re.match(r'^u(\d+)-', os.path.basename(p))
    if not m:
        continue
    u = int(m.group(1))
    cur = None
    for ln in io.open(p, encoding='utf-8'):
        h = re.match(r'^### (\d+) \| (.+)$', ln.strip())
        if h:
            cur = int(h.group(1))
        elif ln.startswith('נוכחי:') and cur:
            old[(u, cur)] = ln[len('נוכחי:'):].strip()

# מצב + פירושים נוכחיים
status, sources = {}, {}
for ln in io.open(os.path.join(HERE, 'gloss-status.tsv'), encoding='utf-8'):
    c = ln.rstrip('\n').split('\t')
    if len(c) >= 8 and c[0].isdigit():
        status[(int(c[0]), int(c[1]))] = c[6]
        sources[(int(c[0]), int(c[1]))] = c[7]

cur = {}
for u in range(1, 11):
    md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    i = 0
    for ln in io.open(md, encoding='utf-8'):
        m = ROW.match(ln)
        if m and m.group(1).isdigit():
            i += 1
            cur[(u, i)] = (m.group(2).strip(), m.group(3).strip())

tally = collections.defaultdict(collections.Counter)
for (u, i), st in status.items():
    tally[u][st] += 1

L = ['# דוח שלב הפירושים — מאגר 800+', '',
     'כל פירוש נבדק מול שני מקורות (ויקימילון מקומי מדאמפ ציבורי + מילוג/אבניאון ברשת) '
     'ונכתב מחדש מההבנה כשנדרש. פרוטוקול: gloss-phase/PROMPT.md.', '',
     '## מספרים', '', '| יחידה | מילים | אומת | שוכתב | SKIP |', '|---|---|---|---|---|']
tot = collections.Counter()
for u in range(1, 11):
    t = tally[u]
    n = sum(t.values())
    for k, v in t.items():
        tot[k] += v
    L.append('| %d | %d | %d | %d | %d |' % (u, n, t['אומת'], t['שוכתב'], t['SKIP']))
N = sum(tot.values())
L.append('| **סה"כ** | **%d** | **%d** | **%d** | **%d** |'
         % (N, tot['אומת'], tot['שוכתב'], tot['SKIP']))
done = tot['אומת'] + tot['שוכתב'] + tot['SKIP']
if done < N:
    L += ['', '⚠ בטיפול: %d מתוך %d הושלמו (%.0f%%).' % (done, N, 100.0 * done / N)]
L += ['', '%.0f%% מהפירושים שטופלו עמדו בפרוטוקול ונשמרו כלשונם; %.0f%% נוסחו מחדש.'
      % (100.0 * tot['אומת'] / done, 100.0 * tot['שוכתב'] / done), '']

# SKIP — הרשימה המלאה
skips = [(u, i) for (u, i), st in sorted(status.items()) if st == 'SKIP']
L += ['## SKIP — ערכים שנשארו בספק (%d)' % len(skips), '']
if skips:
    L += ['| יחידה | מילה | הפירוש שנשאר | הספק |', '|---|---|---|---|']
    for u, i in skips:
        w, g = cur.get((u, i), ('?', '?'))
        L.append('| %d | %s | %s | %s |' % (u, w, g, sources.get((u, i), '')))
else:
    L.append('אין.')
L.append('')

# דגימות לפי יחידה
L += ['## דגימות לפי יחידה', '',
      'לכל יחידה: שכתובים (לפני ⟵ אחרי) ואחריהם פירושים שאומתו כמות שהם.', '']
for u in range(1, 11):
    rw = [(i, st) for (uu, i), st in sorted(status.items()) if uu == u and st == 'שוכתב']
    vf = [(i, st) for (uu, i), st in sorted(status.items()) if uu == u and st == 'אומת']
    if not rw and not vf:
        continue
    L.append('### יחידה %d' % u)
    L.append('')
    step = max(1, len(rw) // NSAMPLE) if rw else 1
    picks = rw[::step][:NSAMPLE]
    if picks:
        L += ['| מילה | לפני | אחרי |', '|---|---|---|']
        for i, _ in picks:
            w, g = cur.get((u, i), ('?', '?'))
            L.append('| %s | %s | **%s** |' % (w, old.get((u, i), '—'), g))
        L.append('')
    step = max(1, len(vf) // 3) if vf else 1
    keep = vf[::step][:3]
    if keep:
        L.append('אומתו כמות שהם: ' + ' · '.join(
            '%s = %s' % (cur[(u, i)][0], cur[(u, i)][1]) for i, _ in keep if (u, i) in cur))
        L.append('')

io.open(os.path.join(HERE, 'דוח-פירושים-v1.md'), 'w', encoding='utf-8',
        newline='\n').write('\n'.join(L) + '\n')
print('הדוח נכתב · %d ערכים · אומת %d · שוכתב %d · SKIP %d'
      % (N, tot['אומת'], tot['שוכתב'], tot['SKIP']))
