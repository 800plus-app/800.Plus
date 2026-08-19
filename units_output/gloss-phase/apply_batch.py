# -*- coding: utf-8 -*-
"""החלת פלט מנה על קובץ היחידה + עדכון gloss-status.tsv.

    python apply_batch.py <יחידה> <קובץ-פלט.tsv>

פלט מנה: מספר⟵TAB⟶מילה מנוקדת⟵TAB⟶פירוש⟵TAB⟶סטטוס⟵TAB⟶מקורות
אימות לפני כתיבה: המילה בשורה חייבת להתאים למילה שבאותו מספר ביחידה.
"""
import io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')


def plain(s):
    s = unicodedata.normalize('NFKC', s).replace('־', '-')
    return ' '.join(NIQ.sub('', s).split()).strip()


def main():
    u, src = int(sys.argv[1]), sys.argv[2]
    new = {}
    for ln in io.open(src, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip() or ln.startswith('#'):
            continue
        c = ln.split('\t')
        if len(c) < 4 or not c[0].strip().isdigit():
            sys.stderr.write('⛔ שורה פגומה: %r\n' % ln)
            sys.exit(2)
        new[int(c[0])] = (c[1].strip(), c[2].strip(), c[3].strip(),
                          c[4].strip() if len(c) > 4 else '')

    md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
    out, i, changed, kept, skipped = [], 0, 0, 0, 0
    for ln in io.open(md, encoding='utf-8'):
        m = ROW.match(ln.rstrip('\n'))
        if not m or not m.group(1).isdigit():
            out.append(ln.rstrip('\n'))
            continue
        i += 1
        disp, gloss = m.group(2).strip(), m.group(3).strip()
        if i in new:
            w, g, st, _srcs = new[i]
            if plain(w) != plain(disp):
                sys.stderr.write('⛔ שורה %d: המנה אומרת "%s" והיחידה "%s"\n' % (i, w, disp))
                sys.exit(2)
            if not g:
                sys.stderr.write('⛔ שורה %d: פירוש ריק\n' % i)
                sys.exit(2)
            if g != gloss:
                changed += 1
            elif st == 'SKIP':
                skipped += 1
            else:
                kept += 1
            gloss = g
        out.append('| %d | %s | %s |' % (i, disp, gloss))
    io.open(md, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')

    # עדכון קובץ הסטטוס
    sp = os.path.join(HERE, 'gloss-status.tsv')
    lines = io.open(sp, encoding='utf-8').read().split('\n')
    for k, ln in enumerate(lines):
        c = ln.split('\t')
        if len(c) >= 9 and c[0].isdigit() and int(c[0]) == u and int(c[1]) in new:
            _w, _g, st, srcs = new[int(c[1])]
            c[6] = st
            c[7] = srcs or c[7]
            lines[k] = '\t'.join(c)
    io.open(sp, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
    print('יחידה %d: %d שורות במנה · שונו %d · נשמרו %d · SKIP %d'
          % (u, len(new), changed, kept, skipped))


if __name__ == '__main__':
    main()
