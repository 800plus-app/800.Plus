# -*- coding: utf-8 -*-
"""שערי המנוע — פורט של האילוצים שהאפליקציה אוכפת על פירושים.

מקור הלוגיקה: tests/24-senses, 28-answerable, 55-meaning-split, 66-gloss-fragments.
המנוע מפצל פירוש למקטעי-משמעות, וכל מקטע הוא תשובה שהלומד יכול להקליד.
פירוש שמייצר מקטע שאיש לא יקליד = מילה שננעלת לנצח ברשימת החיזוק.

    python check_engine.py
"""
import collections, io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')


def plain(s):
    s = unicodedata.normalize('NFKC', s).replace('־', '-')
    return ' '.join(NIQ.sub('', s).split()).strip()


def meaning_segs(gloss):
    """כמו במנוע: מסירים סוגריים, מפצלים על ; : . ואז מנקים."""
    g = re.sub(r'\([^)]*\)', ' ', gloss)
    segs = [s.strip(' ,') for s in re.split(r'[;:.]', g)]
    return [s for s in segs if s]


def main():
    rows = []
    for u in range(1, 11):
        md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
        i = 0
        for ln in io.open(md, encoding='utf-8'):
            m = ROW.match(ln)
            if m and m.group(1).isdigit():
                i += 1
                rows.append((u, i, m.group(2).strip(), plain(m.group(3).strip())))

    problems = []
    seg_owner = {}
    seg_count = collections.Counter()
    for u, i, w, g in rows:
        segs = meaning_segs(g)
        if not segs:
            problems.append(('unanswerable', u, i, w, 'אין מקטע-משמעות אחרי הסרת סוגריים'))
            continue
        for k, s in enumerate(segs):
            if len(s) < 2:
                problems.append(('unanswerable', u, i, w, 'מקטע קצר מדי: %r' % s))
            if k and re.match(r'^ו[א-ת]', s) and len(s.split()) <= 4:
                problems.append(('fragment', u, i, w, 'מקטע-המשך נפתח בוי"ו: %s' % s))
            if s.startswith(('או ', 'גם ', 'אך ')):
                problems.append(('fragment', u, i, w, 'מקטע נפתח במילת קישור: %s' % s))
            if s in seg_owner and seg_owner[s] != w:
                problems.append(('shared-seg', u, i, w, 'מקטע "%s" גם אצל %s' % (s, seg_owner[s])))
            seg_owner.setdefault(s, w)
        seg_count[len(segs)] += 1
        if len(segs) > 3:
            problems.append(('too-many-senses', u, i, w,
                             '%d מקטעים — הלומד יידרש לכולם ברמה 3' % len(segs)))

    print('נבדקו %d פירושים · התפלגות מקטעים: %s' %
          (len(rows), ' '.join('%d→%d' % kv for kv in sorted(seg_count.items()))))
    if not problems:
        print('שערי המנוע: עברו ✓')
        return 0
    by = collections.Counter(p[0] for p in problems)
    print('⛔ %d כשלים: %s' % (len(problems), ' · '.join('%s=%d' % kv for kv in by.most_common())))
    for kind, u, i, w, msg in problems[:60]:
        print('   [%s] י%d:%d %s — %s' % (kind, u, i, w, msg))
    if len(problems) > 60:
        print('   ... ועוד %d' % (len(problems) - 60))
    return 1


if __name__ == '__main__':
    sys.exit(main())
