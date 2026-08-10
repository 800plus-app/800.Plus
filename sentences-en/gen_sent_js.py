# -*- coding: utf-8 -*-
"""מייצר את ../data-en-sentences.js (window.EX_SENT_EN — SENT_EN תפוס ע"י השלמת המשפטים) מתוך sentences-en.tsv.
המפתח הוא מילת הערך בדיוק כפי שהיא ב-data-en.js (אומת: 0 כפולים, סדר מלא).
"""
import io, json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
rows = [l.rstrip('\n').split('\t') for l in
        io.open(os.path.join(HERE, 'sentences-en.tsv'), encoding='utf-8') if l.strip()]
assert all(len(r) == 2 and r[1].strip() for r in rows), 'שורה שבורה'
keys = set()
for w, s in rows:
    assert w not in keys, 'מפתח כפול: ' + w
    keys.add(w)
out = ['// English example sentences: one per data-en.js entry, keyed by the entry word.',
       '// Written by the sentence pipeline and verified twice (sentences-en/STATE-sentences.md).',
       'window.EX_SENT_EN = {']
for w, s in rows:
    out.append(' %s: %s,' % (json.dumps(w, ensure_ascii=False), json.dumps(s.strip(), ensure_ascii=False)))
out[-1] = out[-1].rstrip(',')
out.append('};')
io.open(os.path.join(HERE, '..', 'data-en-sentences.js'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('🟢 data-en-sentences.js: %d ערכים' % len(rows))
