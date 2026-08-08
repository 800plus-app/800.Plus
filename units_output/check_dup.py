# -*- coding: utf-8 -*-
"""שער הכפילויות המכני — לא סומכים על זיכרון.

שימוש:
    python check_dup.py unit-N-words.tsv            # בדיקה בלבד
    python check_dup.py unit-N-words.tsv --commit   # בדיקה, ואם נקי — צבירה
    python check_dup.py unit-1-words.tsv --init     # אתחול: צבירה בלי בדיקה
                                                    # (יחידה 1 מכילה כפילויות-שורש
                                                    #  פנימיות מאושרות: הלל x3, שממ x2)

TSV: מספר ⟵TAB⟶ מילה בלי ניקוד ⟵TAB⟶ שורש (או שורשים מופרדים בפסיק).
לצירופים השורש הוא הצירוף עצמו במקפים (עלה-בתהו) — הגנת-השורש עליהם היא
ידנית בבחירת המילים, לא בסקריפט.

הבדיקה: מילה מול words-used.txt + כל unit-*-words.tsv קודמים; שורש מול
roots-used.txt; וכפילויות פנימיות בתוך הקובץ הנבדק. נורמליזציה: NFKC,
הסרת ניקוד ומקפים עבריים.
"""
import glob
import io
import os
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = os.path.join(HERE, 'words-used.txt')
ROOTS = os.path.join(HERE, 'roots-used.txt')
EXC = os.path.join(HERE, 'root-exceptions.txt')
NIQ = re.compile(r'[֑-ׇ]')


def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = NIQ.sub('', s)
    s = s.replace('־', '-').replace('‐', '-').replace('‑', '-')
    return ' '.join(s.split()).strip()


def load_set(path):
    if not os.path.exists(path):
        return set()
    return {norm(x) for x in io.open(path, encoding='utf-8').read().split('\n') if x.strip()}


def load_exceptions():
    """root-exceptions.txt — הכלל המרוכך (אישור חגי 2026-08-08):
    שורש ברשימה פטור מחסימת-שורש, כשהמילים אינן נגזרות שקופות זו של זו.
    פורמט שורה: שורש ⟵TAB⟶ תיעוד (הזוג + נימוק). שורות # הן הערות.
    בדיקת המילה עצמה נשארת קשיחה תמיד."""
    exc = set()
    if not os.path.exists(EXC):
        return exc
    for ln in io.open(EXC, encoding='utf-8'):
        ln = ln.strip()
        if not ln or ln.startswith('#'):
            continue
        exc.add(norm(ln.split('\t')[0]))
    return exc


def load_tsv(path):
    rows = []
    for ln in io.open(path, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip():
            continue
        parts = ln.split('\t')
        if len(parts) != 3:
            sys.stderr.write('⛔ שורה פגומה (%d עמודות): %r\n' % (len(parts), ln))
            sys.exit(2)
        num, word, roots = parts
        rows.append((num, norm(word), [norm(r) for r in roots.split(',') if r.strip()]))
    return rows


def main():
    if len(sys.argv) < 2:
        sys.stderr.write(__doc__)
        sys.exit(2)
    path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else ''
    rows = load_tsv(path)

    used_words = load_set(WORDS)
    used_roots = load_set(ROOTS)
    # חגורה ושלייקעס: גם קובצי היחידות הקודמות ישירות
    me = os.path.abspath(path)
    for p in sorted(glob.glob(os.path.join(HERE, 'unit-*-words.tsv'))):
        if os.path.abspath(p) == me:
            continue
        for _, w, rs in load_tsv(p):
            used_words.add(w)
            used_roots.update(rs)

    exceptions = load_exceptions()
    problems = []
    seen_w, seen_r = {}, {}
    excused = 0
    if mode != '--init':
        for num, w, rs in rows:
            if w in used_words:
                problems.append('שורה %s · המילה "%s" כבר בשימוש ביחידה קודמת' % (num, w))
            if w in seen_w:
                problems.append('שורה %s · המילה "%s" כפולה בתוך היחידה (גם בשורה %s)' % (num, w, seen_w[w]))
            seen_w.setdefault(w, num)
            for r in rs:
                if r in exceptions:
                    if r in used_roots or r in seen_r:
                        excused += 1
                    seen_r.setdefault(r, (num, w))
                    continue
                if r in used_roots:
                    problems.append('שורה %s · השורש "%s" (%s) כבר בשימוש' % (num, r, w))
                if r in seen_r and seen_r[r][1] != w:
                    problems.append('שורה %s · השורש "%s" (%s) כפול בתוך היחידה (גם ב-%s שורה %s)'
                                    % (num, r, w, seen_r[r][1], seen_r[r][0]))
                seen_r.setdefault(r, (num, w))

    if problems:
        sys.stdout.write('⛔ בדיקת כפילויות: נכשלה (%d בעיות)\n' % len(problems))
        for p in problems:
            sys.stdout.write('   %s\n' % p)
        sys.exit(1)

    tail = ' · %d חריגי-שורש מאושרים' % excused if excused else ''
    sys.stdout.write('בדיקת כפילויות: עברה (0 מילים, 0 שורשים)%s · %d פריטים\n' % (tail, len(rows)))

    if mode in ('--commit', '--init'):
        with io.open(WORDS, 'a', encoding='utf-8', newline='\n') as f:
            for _, w, _rs in rows:
                f.write(w + '\n')
        with io.open(ROOTS, 'a', encoding='utf-8', newline='\n') as f:
            done = set()
            for _, _w, rs in rows:
                for r in rs:
                    if r not in done:
                        f.write(r + '\n')
                        done.add(r)
        sys.stdout.write('נצברו %d מילים אל words-used.txt / roots-used.txt\n' % len(rows))


if __name__ == '__main__':
    main()
