# -*- coding: utf-8 -*-
"""ניקוי מכני של פלט סוכני התרגום, לפני השער:
· שורות זבל בסוף (</content>, </invoke>, ריקות) נמחקות
· קידומת מספור "N⭾" נחתכת כשמאחוריה נשארות שתי עמודות תקינות
לא נוגע בתוכן התרגום עצמו. משכתב את הקובץ רק אם השתנה.
"""
import glob, io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
TR = os.path.join(HERE, 'trans')
for p in sorted(glob.glob(os.path.join(TR, 'tr-e-*.tsv'))):
    lines = io.open(p, encoding='utf-8').read().split('\n')
    out, changed = [], False
    for l in lines:
        if not l.strip() or re.fullmatch(r'</?\w+>', l.strip()):
            changed = changed or bool(l.strip())
            continue
        c = l.split('\t')
        if len(c) >= 3 and re.fullmatch(r'\d+', c[0]):
            l = '\t'.join(c[1:]); changed = True
        out.append(l)
    if changed:
        io.open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
        print('🔧 %s' % os.path.basename(p))
print('סיום')
