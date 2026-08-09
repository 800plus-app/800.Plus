# -*- coding: utf-8 -*-
"""מחולל מנת הפרכה (שלב 2) — בודק עצמאי שמנסה להפריך כל פירוש ששוכתב.

    python make_refute.py <יחידה> [<מ-#> <עד-#>]   > refute.txt

מציג את הפירוש **החדש בלבד** (בלי הישן, בלי הנימוק) — כדי שהמפריך לא יושפע
מהכותב. ההגדרות מהלקסיקון מצורפות כראיה שאפשר להפריך מולה.
כלל ההכרעה: ספק כלשהו ⇒ REJECTED, והפירוש חוזר לקודמו.
"""
import io, json, os, re, subprocess, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
FIN = str.maketrans('ךםןףץ', 'כמנפצ')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')


def key(s):
    s = unicodedata.normalize('NFKC', s).replace('־', ' ').replace('-', ' ')
    return ' '.join(NIQ.sub('', s).split()).strip()


def fold(s):
    out = []
    for w in key(s).split():
        w = w.translate(FIN)
        w = re.sub(r'וו+', 'ו', w)
        w = re.sub(r'יי+', 'י', w)
        if len(w) > 2:
            w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
        out.append(w)
    return ' '.join(out)


def main():
    u = int(sys.argv[1])
    lo = int(sys.argv[2]) if len(sys.argv) > 3 else 1
    hi = int(sys.argv[3]) if len(sys.argv) > 3 else 10 ** 6
    lex = json.load(io.open(os.path.join(HERE, 'lexicon.json'), encoding='utf-8'))
    lexf = {}
    for k, v in lex.items():
        lexf.setdefault(fold(k), v)
    # רק שורות שסטטוסן "שוכתב"
    targets = {}
    for ln in io.open(os.path.join(HERE, 'gloss-status.tsv'), encoding='utf-8'):
        c = ln.rstrip('\n').split('\t')
        if len(c) >= 8 and c[0].isdigit() and int(c[0]) == u and c[6] == 'שוכתב':
            targets[int(c[1])] = c[7]
    md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    i, n = 0, 0
    for ln in io.open(md, encoding='utf-8'):
        m = ROW.match(ln)
        if not m or not m.group(1).isdigit():
            continue
        i += 1
        if i not in targets or not (lo <= i <= hi):
            continue
        n += 1
        disp, gloss = m.group(2).strip(), m.group(3).strip()
        print('### %d | %s' % (i, disp))
        print('פירוש לבדיקה: %s' % gloss)
        print('מקורות שהוצהרו: %s' % targets[i])
        ents = lex.get(key(disp)) or lexf.get(fold(disp)) or []
        if not ents:
            print('⚑ אין בלקסיקון — חובה לאמת ברשת')
        for e in ents[:2]:
            print('ויקימילון [%s]:' % e.get('vocalized', ''))
            for s in e.get('senses', [])[:4]:
                print('  - %s' % s[:180])
        print()
    sys.stderr.write('הפרכה: י%d · %d פירושים ששוכתבו\n' % (u, n))


if __name__ == '__main__':
    main()
