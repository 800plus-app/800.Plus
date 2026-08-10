# -*- coding: utf-8 -*-
"""מיזוג פלט הכותב עם פסיקות הבודק האובייקטיבי ⟵ final-e-NN.tsv.

FIX עם משפט מתוקן ⟵ המשפט של הבודק. OK ⟵ המשפט המקורי.
FIX בלי משפט (הפרת פורמט של הבודק) ⟵ המקורי, ונרשם לאזהרה.
שימוש: python apply_ver.py e-01 [e-02 ...]
"""
import io, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))

for nb in sys.argv[1:]:
    outs = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'out-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    vers = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'ver-%s.tsv' % nb), encoding='utf-8') if l.strip()]
    if len(outs) != len(vers):
        print('⛔ %s: %d משפטים מול %d פסיקות — לא ממוזג' % (nb, len(outs), len(vers)))
        continue
    final, fixed, bad = [], 0, 0
    for o, v in zip(outs, vers):
        word, sent = o[0], o[1]
        verdict = v[1].strip().upper() if len(v) > 1 else 'OK'
        if verdict == 'FIX':
            if len(v) > 2 and v[2].strip():
                sent = v[2].strip()
                fixed += 1
            else:
                bad += 1
        final.append('%s\t%s' % (word, sent))
    io.open(os.path.join(HERE, 'final-%s.tsv' % nb), 'w', encoding='utf-8').write(
        '\n'.join(final) + '\n')
    msg = '🟢 %s: %d שורות · %d תוקנו' % (nb, len(final), fixed)
    if bad:
        msg += ' · ⚠ %d FIX בלי משפט (נשאר המקורי)' % bad
    print(msg)
