# -*- coding: utf-8 -*-
"""מחולל מנת עבודה לאימות פירושים.

    python make_batch.py <יחידה> <מ-#> <עד-#>   > batch.txt

לכל מילה: הפירוש הנוכחי, מוצא, שורש, וכל ההגדרות מהלקסיקון המקומי (ויקימילון).
מילה שאין לה ערך בלקסיקון מסומנת ⚑ — היא דורשת מילוג ברשת לפני כתיבה.
"""
import io, json, os, re, sys, unicodedata

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
    u, lo, hi = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    lex = json.load(io.open(os.path.join(HERE, 'lexicon.json'), encoding='utf-8'))
    lexf = {}
    for k, v in lex.items():
        lexf.setdefault(fold(k), v)
    status = {}
    p = os.path.join(HERE, 'gloss-status.tsv')
    if os.path.exists(p):
        for ln in io.open(p, encoding='utf-8'):
            c = ln.rstrip('\n').split('\t')
            if len(c) >= 7 and c[0].isdigit():
                status[(int(c[0]), int(c[1]))] = c[5]
    roots = [ln.rstrip('\n').split('\t')[2].strip()
             for ln in io.open(os.path.join(UNITS, 'unit-%d-words.tsv' % u), encoding='utf-8')
             if ln.strip()]
    md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    i, nmiss = 0, 0
    for ln in io.open(md, encoding='utf-8'):
        m = ROW.match(ln)
        if not m or not m.group(1).isdigit():
            continue
        i += 1
        if not (lo <= i <= hi):
            continue
        disp, gloss = m.group(2).strip(), m.group(3).strip()
        w = key(disp)
        ents = lex.get(w)
        approx = False
        if not ents:
            ents = lexf.get(fold(disp)) or []
            approx = bool(ents)      # התאמה בקיפול כתיב — עלולה להיות מילה אחרת
        print('### %d | %s' % (i, disp))
        print('שורש: %s | מוצא: %s' % (roots[i - 1] if i <= len(roots) else '?',
                                       status.get((u, i), '?')))
        print('נוכחי: %s' % gloss)
        if not ents:
            nmiss += 1
            print('⚑ אין בלקסיקון — נדרש מילוג')
        elif approx:
            print('⚠ התאמה משוערת בלבד (כתיב שונה) — ודא שזו אותה מילה, אחרת התעלם ואמת במילוג')
        for e in ents[:3]:
            head = e.get('vocalized', '')
            pos = e.get('pos', '')
            print('ויקימילון [%s%s]:' % (head, ' · ' + pos if pos else ''))
            for s in e.get('senses', [])[:4]:
                print('  - %s' % s[:180])
            if e.get('syn'):
                print('  נרדפות: %s' % ', '.join(e['syn'][:6]))
        print()
    sys.stderr.write('מנה: י%d %d-%d · חסרות בלקסיקון: %d\n' % (u, lo, hi, nmiss))


if __name__ == '__main__':
    main()
