# -*- coding: utf-8 -*-
"""בניית gloss-status.tsv — מצב האימות של כל 2,015 הפירושים.

עמודות: יחידה · # · מילה מנוקדת · מילה · שורש · מוצא · סטטוס · מקורות · הערה
מוצא:
  ירושה-מבוקרת  הפירוש זהה/כמעט-זהה לפירוש ב-data.js (עבר את סבבי הביקורת)
  ירושה-שונה    המילה בdata.js אך הפירוש נוסח מחדש כאן — דורש אימות
  טיוטה         נכתב בסבבי המיזוג/הסגירה של הפייפליין — לא אומת מול מילון
סטטוס: ממתין (התחלתי) → אומת / שוכתב / SKIP
"""
import io, json, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
PROJ = os.path.dirname(UNITS)
OUT = os.path.join(HERE, 'gloss-status.tsv')
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


def load_datajs():
    """קורא את data.js לקריאה בלבד — { מילה: פירוש } לפי נרמול וקיפול."""
    txt = io.open(os.path.join(PROJ, 'data.js'), encoding='utf-8').read()
    i = txt.find('UNIT_DATA')
    i = txt.find('{', i)
    depth, j = 0, i
    while j < len(txt):
        if txt[j] == '{':
            depth += 1
        elif txt[j] == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    data = json.loads(txt[i:j + 1])
    exact, folded = {}, {}
    for unit, pairs in data.items():
        for w, g in pairs:
            for part in str(w).split('/'):
                k = key(part)
                if k:
                    exact.setdefault(k, g)
                    folded.setdefault(fold(part), g)
    return exact, folded


def words_overlap(a, b):
    ta = {t for t in re.findall(r'[א-ת]{2,}', key(a))}
    tb = {t for t in re.findall(r'[א-ת]{2,}', key(b))}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def main():
    exact, folded = load_datajs()
    lex = json.load(io.open(os.path.join(HERE, 'lexicon.json'), encoding='utf-8'))
    lexf = {}
    for k, v in lex.items():
        lexf.setdefault(fold(k), v)

    rows, counts = [], {'ירושה-מבוקרת': 0, 'ירושה-שונה': 0, 'טיוטה': 0}
    inlex = 0
    for u in range(1, 11):
        roots = [ln.rstrip('\n').split('\t')[2].strip()
                 for ln in io.open(os.path.join(UNITS, 'unit-%d-words.tsv' % u), encoding='utf-8')
                 if ln.strip()]
        md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
        i = 0
        for ln in io.open(md, encoding='utf-8'):
            m = ROW.match(ln)
            if not m or not m.group(1).isdigit():
                continue
            disp, gloss = m.group(2).strip(), m.group(3).strip()
            w = key(disp)
            old = exact.get(w) or folded.get(fold(disp))
            if old is None:
                origin = 'טיוטה'
            elif words_overlap(old, gloss) >= 0.6:
                origin = 'ירושה-מבוקרת'
            else:
                origin = 'ירושה-שונה'
            counts[origin] += 1
            has_lex = 'ויקימילון' if (w in lex or fold(disp) in lexf) else ''
            if has_lex:
                inlex += 1
            rows.append((u, i + 1, disp, w, roots[i] if i < len(roots) else '',
                         origin, 'ממתין', has_lex, ''))
            i += 1

    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('יחידה\t#\tמילה מנוקדת\tמילה\tשורש\tמוצא\tסטטוס\tמקורות\tהערה\n')
        for r in rows:
            f.write('\t'.join(str(x) for x in r) + '\n')
    print('נכתבו %d שורות · %s' % (len(rows), ' · '.join('%s=%d' % kv for kv in counts.items())))
    print('קיימות בלקסיקון המקומי: %d (%.1f%%) · דורשות מילוג: %d'
          % (inlex, 100.0 * inlex / len(rows), len(rows) - inlex))


if __name__ == '__main__':
    main()
