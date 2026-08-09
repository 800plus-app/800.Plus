# -*- coding: utf-8 -*-
"""שער הפירושים המכני — בדיקות שלא יכולות לטעות (שלב הפירושים, פרוטוקול v1).

שימוש:
    python check_gloss.py            # כל היחידות
    python check_gloss.py 3          # יחידה אחת
    python check_gloss.py --list X   # רק כשל מסוג X (למשל circular)

הבדיקות (כל אחת מכנית, אפס שיפוט סמנטי):
  empty        פירוש ריק
  circular     המילה עצמה / נגזרת-שורש שקופה מופיעה בפירוש
  toolong      מעל 60 תווים
  parens       סוגריים לא מאוזנים · הגדרה ריקה אחרי הסרת סוגריים · יותר מדוגמה אחת למשמעות
  repeat       רצף של 3 מילים ומעלה שחוזר בתוך אותו פירוש
  shared       אותו פירוש (או מקטע-משמעות) משרת שתי מילים
  punct        נקודה מסיימת · מקף ארוך · תו · · רווח כפול · פיסוק תלוש
  fragment     מקטע-משמעות שנפתח בוי"ו החיבור (שבר משפט)
  niqqud       ניקוד בתוך הפירוש
"""
import collections, io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
NIQ = re.compile(r'[֑-ׇ]')
FIN = str.maketrans('ךםןףץ', 'כמנפצ')
ROW = re.compile(r'^\|\s*(\d+)\s*\|(.*?)\|(.*)\|\s*$')
MAXLEN = 60

# חריגים מאושרים — פירושים שהבדיקה מסמנת אך הוכרעו כתקינים.
# פורמט: (סוג, מילה) ⟵ מתווסף רק בהכרעה מתועדת.
ALLOWED = set()


def plain(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('־', '-')
    return ' '.join(NIQ.sub('', s).split()).strip()


def fold(w):
    w = w.translate(FIN)
    w = re.sub(r'וו+', 'ו', w)
    w = re.sub(r'יי+', 'י', w)
    if len(w) > 2:
        w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
    return w


def strip_parens(g):
    return ' '.join(re.sub(r'\([^)]*\)', ' ', g).split())


def senses(g):
    """מקטעי משמעות — מה שהמנוע סופר: פיצול על ; : . אחרי הסרת סוגריים."""
    return [s.strip() for s in re.split(r'[;:.]', strip_parens(g)) if s.strip()]


def load_units():
    """מחזיר [(unit, idx, word_display, word_plain, root, gloss)]."""
    out = []
    for u in range(1, 11):
        tsv = os.path.join(UNITS, 'unit-%d-words.tsv' % u)
        roots = []
        for ln in io.open(tsv, encoding='utf-8'):
            if ln.strip():
                roots.append(ln.rstrip('\n').split('\t')[2].strip())
        md = os.path.join(UNITS, 'unit-%d-hebrew.md' % u if u != 1 else 'unit-1-flat.md')
        i = 0
        for ln in io.open(md, encoding='utf-8'):
            m = ROW.match(ln)
            if not m or not m.group(1).isdigit():
                continue
            disp, gloss = m.group(2).strip(), m.group(3).strip()
            out.append((u, i + 1, disp, plain(disp),
                        roots[i] if i < len(roots) else '', gloss))
            i += 1
    return out


def check(rows):
    problems = []

    def bad(kind, u, i, w, msg):
        if (kind, plain(w)) not in ALLOWED:
            problems.append((kind, u, i, w, msg))

    seen_gloss, seen_sense = {}, {}
    for u, i, disp, word, root, g in rows:
        gp = plain(g)
        if not gp:
            bad('empty', u, i, disp, 'פירוש ריק')
            continue

        # מעגליות — נבדקת על ההגדרה בלבד. הדוגמה שבסוגריים חייבת להכיל את
        # המילה (זו קולוקציה), ולכן היא מוחרגת לפי פרוטוקול v1.
        defn = strip_parens(gp)
        wtoks = {fold(t) for t in word.split() if len(t) >= 3}
        froot = fold(root) if root and '-' not in root and len(root) >= 3 else None
        for t in re.findall(r'[א-ת]{3,}', defn):
            ft = fold(t)
            if ft in wtoks:
                bad('circular', u, i, disp, 'ההגדרה מכילה את המילה: %s' % t)
                break
        else:
            # נגזרת-שורש: אזהרה לסקירה, לא כשל חוסם (מכאוב↔כאב הוא נרדף לגיטימי)
            for t in re.findall(r'[א-ת]{3,}', defn):
                ft = fold(t)
                if froot and (ft == froot or (len(ft) > len(froot) and froot in ft
                                              and len(ft) - len(froot) <= 2)):
                    bad('rootecho', u, i, disp, 'נגזרת-שורש (%s): %s' % (root, t))
                    break

        if len(gp) > MAXLEN:
            bad('toolong', u, i, disp, '%d תווים' % len(gp))

        if gp.count('(') != gp.count(')'):
            bad('parens', u, i, disp, 'סוגריים לא מאוזנים')
        elif '(' in gp:
            if not strip_parens(gp):
                bad('parens', u, i, disp, 'ההגדרה ריקה בלי הסוגריים')
            if gp.count('(') > max(1, len(senses(gp))):
                bad('parens', u, i, disp, 'יותר דוגמאות מאשר משמעויות')
            # שתי דוגמאות דחוסות לסוגריים אחד. הערה: המנוע מסיר סוגריים *לפני*
            # הפיצול, ולכן זה לא שובר אותו — זו הפרת כלל "דוגמה אחת למשמעות".
            # נקודתיים מותרות: הן מפרידות צירוף מפירושו — (מלחך פנכה: חנפן).
            m2 = re.search(r'\(([^)]*;[^)]*)\)', gp)
            if m2:
                bad('parens', u, i, disp, 'שתי דוגמאות בסוגריים אחד: (%s)' % m2.group(1))

        toks = re.findall(r'[א-ת"׳]+', gp)
        trigrams = [' '.join(toks[k:k + 3]) for k in range(len(toks) - 2)]
        dup = [t for t, c in collections.Counter(trigrams).items() if c > 1]
        if dup:
            bad('repeat', u, i, disp, 'רצף חוזר: %s' % dup[0])

        key = gp
        if key in seen_gloss:
            bad('shared', u, i, disp, 'פירוש זהה ל-%s' % seen_gloss[key])
        seen_gloss.setdefault(key, disp)
        for s in senses(gp):
            if len(s) >= 6:
                if s in seen_sense and seen_sense[s] != disp:
                    bad('shared', u, i, disp, 'מקטע "%s" משותף עם %s' % (s, seen_sense[s]))
                seen_sense.setdefault(s, disp)

        if gp.endswith('.'):
            bad('punct', u, i, disp, 'נקודה מסיימת')
        if '—' in gp or '–' in gp:
            bad('punct', u, i, disp, 'מקף ארוך')
        if '·' in gp:
            bad('punct', u, i, disp, 'התו · שובר את פיצול המשמעויות')
        if re.search(r'\s[,;:]|[,;:]{2}', g):
            bad('punct', u, i, disp, 'פיסוק תלוש')
        if '  ' in g:
            bad('punct', u, i, disp, 'רווח כפול')

        # שבר משפט = מקטע *המשך* שנפתח בוי"ו החיבור. מקטע ראשון שנפתח בוי"ו
        # הוא מילה לגיטימית (ויכוח, ותרן, ועד) ולא שבר.
        for s in senses(gp)[1:]:
            if re.match(r'^ו[א-ת]', s) and len(s.split()) <= 4:
                bad('fragment', u, i, disp, 'מקטע-המשך נפתח בוי"ו: %s' % s)

        # מקף עברי (U+05BE) יושב בתוך טווח הניקוד אך הוא תו מחבר לגיטימי
        # ("אי־נוחות", "זמן־מה") — מנוטרל לפני בדיקת הניקוד.
        if NIQ.search(g.replace('־', '-')):
            bad('niqqud', u, i, disp, 'ניקוד בתוך הפירוש')

    return problems


def main():
    args = [a for a in sys.argv[1:]]
    only_kind = None
    if '--list' in args:
        only_kind = args[args.index('--list') + 1]
        args = args[:args.index('--list')]
    rows = load_units()
    if args and args[0].isdigit():
        rows = [r for r in rows if r[0] == int(args[0])]
    problems = check(rows)
    if only_kind:
        problems = [p for p in problems if p[0] == only_kind]
    # rootecho = אזהרה לסקירה ידנית; כל השאר חוסמים
    hard = [p for p in problems if p[0] != 'rootecho']
    warn = [p for p in problems if p[0] == 'rootecho']
    by_kind = collections.Counter(p[0] for p in hard)
    print('נבדקו %d פירושים' % len(rows))
    if warn and '--quiet' not in sys.argv:
        print('⚠ %d אזהרות נגזרת-שורש (לסקירה, לא חוסם)' % len(warn))
    if not hard:
        print('שער הפירושים: עבר ✓')
        return 0
    print('⛔ %d כשלים: %s' % (len(hard),
          ' · '.join('%s=%d' % kv for kv in by_kind.most_common())))
    show = hard if only_kind else hard[:60]
    for kind, u, i, w, msg in show:
        print('   [%s] י%d:%d %s — %s' % (kind, u, i, w, msg))
    if len(show) < len(hard):
        print('   ... ועוד %d' % (len(hard) - len(show)))
    return 1


if __name__ == '__main__':
    sys.exit(main())
