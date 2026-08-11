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

# ההדגשה בתרגום. הקובץ מיוצר ב-mark_he.js ומשלים ידנית; כאן הוא רק **מוחל**, ואחרי
# שער: הסרת הסימון חייבת להחזיר את התרגום המקורי תו-בתו. תרגום ששוכתב בדרך הוא שינוי
# תוכן שעבר בלי ביקורת, וזה בדיוק מה שהשער הזה קיים כדי לא לאפשר.
BOLD_TSV = os.path.join(HERE, 'sentences-en-he-bold.tsv')
bold = {}
if os.path.exists(BOLD_TSV):
    for l in io.open(BOLD_TSV, encoding='utf-8'):
        if not l.strip():
            continue
        c = l.rstrip('\n').split('\t')
        if len(c) < 2 or c[1] == 'SKIP':
            continue
        bold[c[0]] = c[1]


def he_out(w):
    """התרגום כפי שהוא נכנס לאפליקציה: עם <b> סביב המילה המתורגמת, אם סומנה."""
    he = hemap[w]
    assert not re.search(r'[<>&]', he), 'תו HTML בתרגום: ' + w
    mk = bold.get(w)
    if not mk:
        return he
    assert mk.replace('**', '') == he, 'הסימון שינה את התרגום: ' + w
    n = mk.count('**')
    # עד ארבעה מקטעים: צירוף מתאם (`not only... but also...`) מודגש בשני מקומות
    # בעברית בדיוק כמו באנגלית. מספר אי-זוגי הוא סימון שלא נסגר.
    assert n >= 2 and n % 2 == 0 and n <= 8, 'סימון לא תקין (%d כוכביות): %s' % (n, w)
    out = mk
    for _ in range(n // 2):
        out = out.replace('**', '<b>', 1).replace('**', '</b>', 1)
    return out
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
def exact_part(w, s):
    """הצורה כפי שהיא, אם היא מופיעה במשפט כאסימון שלם.

    ⛔ למה זה קודם ל-matched_parts: ההתאמה של matched_parts רכה (אותה התאמת גזע
    של השער), ולכן היא תופסת לפעמים אסימון אחר **גם כשהמילה עצמה נמצאת במשפט**.
    נמדד על כל 3,946 המשפטים, שמונה מקרים: `there` הודגש על `the` · `theme` על
    `the` · `sheet` על `she` · `beg` על `began` · ו-`edit`/`mark`/`photograph`/
    `inspect` הודגשו על `editor`/`marker`/`photographer`/`inspector`. בארבעת
    הראשונים הלומד רואה מילה אחרת לגמרי מודגשת בכרטיס של המילה שלו.
    חל רק על מפתח בעל צורה אחת: במפתח מפוצל (`best-seller`, `granted (that)`)
    ההדגשה מורכבת מכמה חלקים והמנגנון הקיים הוא הנכון.
    """
    forms = [f.strip() for f in re.split(r'[-/,()]', w) if f.strip()]
    if len(forms) != 1 or re.search(r'\d', w):
        return None
    m = re.search(r"(?<![A-Za-z'])" + re.escape(forms[0]) + r"(?![A-Za-z'])", s, re.I)
    return [m.group(0)] if m else None


for w, s in rows:
    parts = exact_part(w, s) or matched_parts(w, s)
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
                                  json.dumps(he_out(w), ensure_ascii=False)))
out[-1] = out[-1].rstrip(',')
out.append('};')
io.open(os.path.join(HERE, '..', 'data-en-sentences.js'), 'w', encoding='utf-8').write(
    '\n'.join(out) + '\n')
marked = sum(1 for w, _ in rows if bold.get(w))
print('🟢 data-en-sentences.js: %d ערכים · %d עם הדגשה בתרגום (%.1f%%) · %d בלי'
      % (len(rows), marked, 100.0 * marked / len(rows), len(rows) - marked))
