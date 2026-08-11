# -*- coding: utf-8 -*-
"""מייצר את ../data-en-sentences.js (window.EX_SENT_EN — SENT_EN תפוס ע"י השלמת המשפטים)
מתוך sentences-en.tsv + sentences-en-he.tsv. ערך = [משפט, תרגום].
המילה הנלמדת מודגשת כבר כאן (<b>) לפי אותה התאמת-גזע של השער (find_match),
והמשפט מוזרק באפליקציה כמות שהוא — ולכן שער קשיח: אסור אף תו HTML במקור.
"""
import io, json, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from find_match import matched_parts
from check_trans import problems

rows = [l.rstrip('\n').split('\t') for l in
        io.open(os.path.join(HERE, 'sentences-en.tsv'), encoding='utf-8') if l.strip()]
hemap = dict(l.rstrip('\n').split('\t') for l in
             io.open(os.path.join(HERE, 'sentences-en-he.tsv'), encoding='utf-8') if l.strip())
assert all(len(r) == 2 and r[1].strip() for r in rows), 'שורה שבורה'
keys = set()
for w, s in rows:
    assert w not in keys, 'מפתח כפול: ' + w
    keys.add(w)
    assert not re.search(r'[<>&]', s), 'תו HTML במשפט: ' + w
    assert w in hemap, 'אין תרגום: ' + w
    assert not problems(hemap[w]), 'תרגום פסול (%s): %s' % (w, hemap[w])

out = ['// English example sentences: [sentence, Hebrew translation] per data-en.js entry,',
       '// keyed by the entry word. The learned word is pre-wrapped in <b> by the generator,',
       '// which also asserts the raw sentence has no other HTML characters.',
       'window.EX_SENT_EN = {']
for w, s in rows:
    parts = matched_parts(w, s)
    assert parts, 'לא נמצאה הצורה במשפט: ' + w
    # עטיפה לפי סדר החלקים משמאל לימין, עם גבולות אותיות — אחרת "and" היה נתפס
    # בתוך "band", או מופע מוקדם מדי של אותה מילה לפני החלק הקודם.
    cur = 0
    for p in parts:
        m2 = re.compile(r'(?<![A-Za-z])' + re.escape(p) + r'(?![A-Za-z])').search(s, cur)
        assert m2, 'החלק נעלם מהמשפט: %s | %s' % (p, w)
        s = s[:m2.start()] + '<b>' + p + '</b>' + s[m2.end():]
        cur = m2.end() + 7
    out.append(' %s: [%s,%s],' % (json.dumps(w, ensure_ascii=False),
                                  json.dumps(s, ensure_ascii=False),
                                  json.dumps(hemap[w], ensure_ascii=False)))
out[-1] = out[-1].rstrip(',')
out.append('};')
io.open(os.path.join(HERE, '..', 'data-en-sentences.js'), 'w', encoding='utf-8').write(
    '\n'.join(out) + '\n')
print('🟢 data-en-sentences.js: %d ערכים' % len(rows))
