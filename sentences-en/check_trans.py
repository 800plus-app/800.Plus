# -*- coding: utf-8 -*-
"""שער מכני לתרגומי המשפטים. בדיקות שאינן דורשות שיפוט:
שלמות שורות ומפתחות מול t-e-NN.txt · לא ריק · יש עברית · בלי אותיות לטיניות ·
בלי מקף ארוך/·/ניקוד · בלי רווח כפול · אורך 10–140 תווים · נגמר בסימן סוף משפט ·
תרגום כפול בין שתי מילים שונות (חשוד — המשפטים שונים).
שימוש: python check_trans.py [e-01 ...]   בלי ארגומנטים = כל trans/tr-e-*.tsv
"""
import glob, io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
TR = os.path.join(HERE, 'trans')
HEB = re.compile(r'[א-ת]')
LAT = re.compile(r'[A-Za-z]')
NIQ = re.compile(r'[֑-ׇ]')

def problems(he):
    p = []
    if not he:
        return ['ריק']
    if not HEB.search(he):
        p.append('אין עברית')
    if LAT.search(he):
        p.append('אותיות לטיניות')
    if '—' in he:
        p.append('מקף ארוך')
    if '·' in he:
        p.append('·')
    if NIQ.search(he):
        p.append('ניקוד')
    if '  ' in he:
        p.append('רווח כפול')
    if not (10 <= len(he) <= 140):
        p.append('אורך %d' % len(he))
    if he and he[-1] not in '.?!':
        p.append('בלי סוף משפט')
    return p

names = sys.argv[1:] or sorted(
    os.path.basename(p)[3:-4] for p in glob.glob(os.path.join(TR, 'tr-e-*.tsv')))
tot = 0
seen = {}
for nb in names:
    tp = os.path.join(TR, 't-%s.txt' % nb)
    rp = os.path.join(TR, 'tr-%s.tsv' % nb)
    if not os.path.exists(rp):
        print('⚠ %s: אין פלט' % nb); tot += 1; continue
    ins = [l.rstrip('\n').split('\t') for l in io.open(tp, encoding='utf-8') if l.strip()]
    outs = [l.rstrip('\n').split('\t') for l in io.open(rp, encoding='utf-8')
            if l.strip() and not l.startswith('#')]
    bad = []
    if len(ins) != len(outs):
        bad.append('שורות: %d קלט מול %d פלט' % (len(ins), len(outs)))
    for i, o in zip(ins, outs):
        w = i[0]
        if o[0].strip() != w.strip():
            bad.append('מפתח: %s ≠ %s' % (o[0], w)); continue
        he = o[1].strip() if len(o) > 1 else ''
        p = problems(he)
        if he in seen and seen[he] != w:
            p.append('תרגום כפול עם %s' % seen[he])
        seen[he] = w
        if p:
            bad.append('%s: %s | %s' % (w, '; '.join(p), he[:60]))
    if bad:
        tot += len(bad)
        print('⛔ %s — %d בעיות' % (nb, len(bad)))
        for b in bad[:12]:
            print('   ', b)
    else:
        print('🟢 %s (%d)' % (nb, len(outs)))
print('\nסה"כ בעיות: %d' % tot)
