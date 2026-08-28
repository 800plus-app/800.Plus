# -*- coding: utf-8 -*-
"""האם הפירוש היום זהה לפירוש הישן · units_output/gloss-phase/diff_old.py

⛔ **הכלי הזה לעולם אינו מדפיס את הטקסט עצמו** — לא את הישן ולא את החדש.
   הוא מדפיס **פסק בלבד**: זהה · שונה · לא נמצא.

⭐ **ולמה זה חשוב:** ‏30 מהפירושים מקורם בוויקימילון, וההוראה היא לכתוב אותם
   מאפס **מהידע שלנו**. ⚠ מי שקורא את הישן כדי «לנסח אחרת» מייצר **יצירה
   נגזרת** — וזה בדיוק מה שהכלל אוסר. ⛔ לכן הטקסט אינו יוצא מהכלי הזה.

⭐ ובנוסף נמדד **מרחק** — כדי לתפוס «שינוי מילה אחת» שמתחזה לכתיבה מחדש.

    python diff_old.py            → כל השורות שסומנו «⚠ דרוש מקור»
    python diff_old.py --all      → כל הטבלה (בקרה)
"""
import io, os, re, sys, unicodedata, difflib

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*?)\|\s*$')


def plain(s):
    s = unicodedata.normalize('NFKC', s).replace('־', '-')
    return ' '.join(NIQ.sub('', s).split()).strip()


def unit_file(u):
    p = os.path.join(UNITS, 'unit-1-flat.md' if u == 1 else 'unit-%d-hebrew.md' % u)
    return p if os.path.exists(p) else None


def load_unit(u):
    """{מספר: (מילה, פירוש)} · הפירוש נטען אך **אינו מודפס לעולם**."""
    p = unit_file(u)
    if not p:
        return {}
    out = {}
    for ln in io.open(p, encoding='utf-8'):
        m = ROW.match(ln.rstrip('\n'))
        if m:
            out[int(m.group(1))] = (m.group(2).strip(), m.group(3).strip())
    return out


def main():
    ALL = '--all' in sys.argv
    old = {}
    for ln in io.open(os.path.join(HERE, 'old-glosses.tsv'), encoding='utf-8'):
        c = ln.rstrip('\n').split('\t')
        if len(c) >= 4 and c[0].strip().isdigit():
            old[(int(c[0]), int(c[1]))] = (c[2].strip(), c[3].strip())

    rows = []
    for ln in io.open(os.path.join(HERE, 'gloss-status.tsv'), encoding='utf-8'):
        c = ln.rstrip('\n').split('\t')
        if len(c) < 7 or not c[0].strip().isdigit():
            continue
        if not ALL and 'דרוש מקור' not in c[5]:
            continue
        rows.append((int(c[0]), int(c[1]), c[2].strip(), c[6].strip()))

    units = {}
    same, diff, missing = [], [], []
    for u, n, word, status in rows:
        if u not in units:
            units[u] = load_unit(u)
        cur = units[u].get(n)
        o = old.get((u, n))
        if not cur or not o:
            missing.append((u, n, word))
            print('  %-24s ⚠ לא נמצא  (יחידה %d · #%d)' % (word, u, n))
            continue
        a, b = plain(o[1]), plain(cur[1])
        ratio = difflib.SequenceMatcher(None, a, b).ratio()
        if a == b:
            same.append((u, n, word, status))
            print('  %-24s ⛔ זהה למקור הישן        [%s]' % (word, status))
        else:
            diff.append((u, n, word, status, ratio))
            mark = '⚠ קרוב מדי' if ratio >= 0.70 else '⭐ שונה'
            print('  %-24s %s · דמיון %.2f      [%s]' % (word, mark, ratio, status))

    print('')
    print('  ================================================================')
    print('  ⛔ זהה למקור הישן : %d' % len(same))
    print('  ⭐ שונה           : %d   (מהם ⚠ דמיון ≥0.70: %d)'
          % (len(diff), sum(1 for d in diff if d[4] >= 0.70)))
    print('  ⚠ לא נמצא        : %d' % len(missing))
    print('  ================================================================')
    print('  ⛔ הטקסט עצמו לא הודפס · במכוון.')
    sys.exit(1 if same else 0)


main()
