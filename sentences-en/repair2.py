# -*- coding: utf-8 -*-
"""תיקון כשל הבודקים: פסיקת FIX שמחקה את מילת הערך מהמשפט — נפסלת,
והמשפט המקורי של הכותב (שעבר את השער) חוזר ל-final.
בנוסף: הסרת מקפים ארוכים ששרדו ב-final (תוקנו בזמנו רק בקובץ המאוחד).
"""
import glob, io, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_en import word_in

# המשפטים הנקיים שכבר אושרו בקובץ המאוחד במקום אלה עם המקף הארוך
EMDASH_FIX = {}
for l in io.open(os.path.join(HERE, 'sentences-en.tsv'), encoding='utf-8'):
    c = l.rstrip('\n').split('\t')
    if len(c) == 2 and '—' not in c[1]:
        EMDASH_FIX.setdefault(c[0], c[1])

tot_rev, tot_dash = 0, 0
for p in sorted(glob.glob(os.path.join(HERE, 'final-e-*.tsv'))):
    nb = os.path.basename(p)[6:-4]
    fins = [l.rstrip('\n').split('\t') for l in io.open(p, encoding='utf-8') if l.strip()]
    outs = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'out-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    changed = []
    for i, (f, o) in enumerate(zip(fins, outs)):
        w, sent, orig = f[0], f[1], o[1]
        if sent != orig and not word_in(w, sent) and word_in(w, orig):
            f[1] = orig
            changed.append('%d %s (הוחזר המקור)' % (i + 1, w))
            tot_rev += 1
        elif '—' in f[1]:
            fix = EMDASH_FIX.get(w)
            if fix and word_in(w, fix):
                f[1] = fix
                changed.append('%d %s (מקף ארוך הוסר)' % (i + 1, w))
                tot_dash += 1
    if changed:
        io.open(p, 'w', encoding='utf-8').write('\n'.join('\t'.join(f) for f in fins) + '\n')
        print('🟧 %s: %d שינויים — %s' % (nb, len(changed), '; '.join(changed[:6])))
print('סה"כ: %d הוחזרו למקור · %d תיקוני מקף' % (tot_rev, tot_dash))
