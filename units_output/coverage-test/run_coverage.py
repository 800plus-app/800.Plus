# -*- coding: utf-8 -*-
"""בדיקת כיסוי אובייקטיבית: המאגר (units_output) מול מבחני נייט.

פרוטוקול (הוראת חגי, 9.8.2026):
- spring_2026 מחוץ לשתי הקבוצות (שימש כבר לתיקון).
- 4 מבחני held-out נבחרים אקראית עם seed קבוע (SEED=800) — לא נקראים ולא נמדדים.
- חילוץ לפי חוק בלבד: אנלוגיות = שני צידי כל זוג (רגל + 4 אפשרויות);
  השלמת-החסר = מילים בודדות מתוך אפשרויות התשובה בלבד (לא מגוף המשפט).
- סינון מכני: רשימת עצירה סגורה (stopwords.txt) = רשימה דקדוקית סגורה +
  500 המילים השכיחות בקורפוס קבוצת המדידה. מוחל על פריטי מילה-בודדת בלבד.
- נרמול: פונקציה אחת (norm/fold) מוחלת זהה על המאגר ועל החילוץ.
- התאמה: מלא = זהות אחרי נרמול (כולל איחוד כתיב מלא/חסר, הסרת ה/ו/ל תחיליות,
  יחיד-אם-קיים-במאגר); קרוב = שורש המאגר מופיע ברצף במילה המקופלת, ולצירוף —
  טוקן-תוכן שמתאים מלא למילת מאגר או מכיל שורש מאגר; אחרת חסר.
- אסור לשנות את המאגר. כל הקבצים נשמרים לשחזור מלא.
"""
import collections, io, json, os, random, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)                                  # units_output
EXAMS = os.path.join(os.path.dirname(UNITS), 'בחינות-נייט', 'normalized')
OUTX = os.path.join(HERE, 'extract')
os.makedirs(OUTX, exist_ok=True)

SEED = 800

# ---------- 0. חלוקת מבחנים ----------
all_stems = sorted(f[:-4] for f in os.listdir(EXAMS) if f.endswith('.txt'))
pool = [s for s in all_stems if s != 'spring_2026']
held = sorted(random.Random(SEED).sample(pool, 4))
measure = [s for s in pool if s not in held]
io.open(os.path.join(HERE, 'heldout.txt'), 'w', encoding='utf-8').write(
    'SEED=%d\nheld-out (לא נמדדו, לא נקראו):\n%s\n' % (SEED, '\n'.join(held)))

# ---------- 1. נרמול — פונקציה אחת לשני הצדדים ----------
NIQ = re.compile(r'[֑-ׇ]')
SPLIT_LETTER = re.compile(r'(?<![א-ת])([א-ת]) ([א-ת]{2,})')
FINALS = str.maketrans('ךםןףץ', 'כמנפצ')

def strip_niqqud(s):
    s = NIQ.sub('', s)
    return SPLIT_LETTER.sub(r'\1\2', s)  # איחוי אות שהניקוד פיצל

def norm(s):
    """נרמול בסיסי: NFKC, בלי ניקוד, מקף/מירכאות אחידים, רווחים אחידים."""
    s = unicodedata.normalize('NFKC', s)
    s = strip_niqqud(s)
    s = s.replace('־', ' ').replace('-', ' ')
    s = s.replace('׳', "'").replace('״', '"')
    return ' '.join(s.split()).strip()

def fold_word(w):
    """איחוד כתיב מלא/חסר: כפולות וו/יי→בודדת, הסרת ו/י פנימיות, סופיות→רגילות."""
    w = w.translate(FINALS)
    w = re.sub(r'וו+', 'ו', w)
    w = re.sub(r'יי+', 'י', w)
    if len(w) > 2:
        w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
    return w

def fold(s):
    return ' '.join(fold_word(w) for w in norm(s).split())

def prefix_variants(w):
    """הסרת ו' החיבור, ה' הידיעה, ל' היחס — לפי חוק, מתחילת מילה בלבד."""
    out = {w}
    forms = [w]
    if w.startswith('ו') and len(w) > 2:
        forms.append(w[1:])
    for f in forms:
        out.add(f)
        if f[0] in 'הל' and len(f) > 2:
            out.add(f[1:])
    return out

PLURAL_SUF = ('יים', 'ות', 'ים')
def singular_variants(w):
    out = set()
    for suf in PLURAL_SUF:
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            out.add(w[:-len(suf)])
    return out

# ---------- 2. טעינת המאגר (קריאה בלבד) ----------
bank_exact, bank_fold, bank_roots = {}, {}, set()
bank_words = []
PAREN = re.compile(r'\(([^)]*)\)')
for n in range(1, 11):
    for ln in io.open(os.path.join(UNITS, 'unit-%d-words.tsv' % n), encoding='utf-8'):
        p = ln.rstrip('\n').split('\t')
        if len(p) < 3 or not p[1].strip():
            continue
        word, roots = p[1].strip(), p[2].strip()
        bank_words.append(word)
        variants = {word}
        if '(' in word:  # "קנה (לו) שביתה" → עם ובלי החלק שבסוגריים
            variants.add(PAREN.sub(r'\1', word))
            variants.add(PAREN.sub('', word))
        for v in variants:
            nv = norm(v)
            if nv:
                bank_exact.setdefault(nv, word)
                bank_fold.setdefault(fold(v), word)
        for r in re.split(r'[^א-ת]+', roots):
            if len(r) >= 3 and '-' not in r:
                bank_roots.add(r.translate(FINALS))
print('מאגר: %d מילים · %d צורות-נרמול · %d שורשים' %
      (len(bank_words), len(bank_exact), len(bank_roots)))

# ---------- 3. רשימת עצירה סגורה ----------
STOP_PATH = os.path.join(HERE, 'stopwords.txt')
GRAM = set('''
של את הוא היא הם הן זה זו זאת אלה אלו אשר כי אם כך כן לא אין יש היה היו הייתה
יהיה תהיה להיות היות עם בין תחת לפני אחרי בתוך מתוך אצל מול ליד עד מן על אל
אבל אלא או גם רק כמו כדי בגלל למרות לכן אפוא שכן אולם אך ואילו כלפי לגבי בשל
אני אתה הוא אנחנו אתם אנו לי לך לו לה לנו להם להן אותו אותה אותם אותן אותי
שלו שלה שלהם שלי שלנו עצמו עצמה עצמם מי מה איזה איזו אילו כמה מתי איפה היכן
כל כלל שום אף כלשהו כלשהי משהו מישהו דבר
אחד אחת שני שתי שניים שתיים שלוש שלושה ארבע ארבעה חמש חמישה שש שישה שבע שבעה
שמונה תשע תשעה עשר עשרה עשרים שלושים מאה אלף ראשון ראשונה שנייה שלישי שלישית
'''.split())
if os.path.exists(STOP_PATH):
    STOP = set(w.strip() for w in io.open(STOP_PATH, encoding='utf-8')
               if w.strip() and not w.startswith('#'))
else:
    freq = collections.Counter()
    for stem in measure:
        txt = norm(io.open(os.path.join(EXAMS, stem + '.txt'), encoding='utf-8').read())
        for w in re.findall(r"[א-ת][א-ת'\"]+", txt):
            if len(w) >= 2:
                freq[w] += 1
    top500 = [w for w, _ in freq.most_common(500)]
    STOP = GRAM | set(top500)
    with io.open(STOP_PATH, 'w', encoding='utf-8') as f:
        f.write('# רשימת עצירה סגורה — נבנתה מכנית, seed=%d\n' % SEED)
        f.write('# חלק א: רשימה דקדוקית סגורה (יחס/כינויים/מספרים ועוד)\n')
        f.write('\n'.join(sorted(GRAM)))
        f.write('\n# חלק ב: 500 השכיחות בקורפוס 16 מבחני המדידה (מנורמל)\n')
        f.write('\n'.join(top500) + '\n')
print('רשימת עצירה: %d מילים' % len(STOP))

def is_stopped(item):
    toks = item.split()
    if len(toks) == 1:
        return toks[0] in STOP
    return all(t in STOP for t in toks)  # צירוף נפסל רק אם כולו מילות עצירה

# ---------- 4. חילוץ לפי חוק ----------
RE_AN_HDR = re.compile(r'אנלוגיות\s*\(שאלות')
RE_AN_END = re.compile(r'הבנה והסקה')
RE_PAIR = re.compile(r"([א-ת][א-ת'\"׳״ ]{0,24}?)\s*:\s*"
                     r"([א-ת][א-ת'\"׳״ ]{0,24}?)(?=\s*[-()\n.,;©0-9]|$)")
RE_COMPL = re.compile(r'הוראות לשאלות[^\n]*להשלמת החסר[^\n]*')
RE_OPT = re.compile(r'\(\s*\)\s*\d')
RE_QNUM = re.compile(r'\.(\d{1,2})(?=[\sא-ת"])')
RE_HEBTOK = re.compile(r"[א-ת][א-ת'\"׳״]+")
INSTR_SKIP = ('מצאו את היחס', 'בכל שאלה יש זוג', 'שימו לב')

def clean_side(s):
    s = ' '.join(strip_niqqud(s).split()).strip(" '\"")
    return s

def extract_exam(stem):
    """מחזיר רשימת (item, kind) — לפני נרמול-התאמה, אחרי סינון עצירה."""
    text = io.open(os.path.join(EXAMS, stem + '.txt'), encoding='utf-8').read()
    text = unicodedata.normalize('NFKC', text)
    items = []

    # --- אנלוגיות: כל זוג "א :ב" בקטע האנלוגיות; זוג = שני פריטים ---
    n_pairs = 0
    for m in RE_AN_HDR.finditer(text):
        e = RE_AN_END.search(text, m.end())
        chunk = text[m.end():e.start() if e else m.end() + 4000]
        lines = [ln for ln in chunk.split('\n')
                 if not any(k in ln for k in INSTR_SKIP)]
        chunk = '\n'.join(lines)
        for a, b in RE_PAIR.findall(strip_niqqud(chunk)):
            a, b = clean_side(a), clean_side(b)
            if not a or not b or len(a) > 22 or len(b) > 22:
                continue
            n_pairs += 1
            for side in (a, b):
                items.append((side, 'analogy'))

    # --- השלמת החסר: מילים מתוך אפשרויות התשובה בלבד ---
    # שני פורמטים של טקסט: A = "( )1..." (קובצי txt); B = "... )1(" בסוף שורה (pymupdf).
    n_opts = 0
    fmt_b = len(re.findall(r'\)\d\(', text)) > len(RE_OPT.findall(text))
    for m in re.finditer(r'([^\n]*הוראות לשאלות[^\n]*)(\n[^\n]*)?', text):
        header = m.group(0)
        if 'להשלמת החסר' not in header:
            continue
        # מספרי הטווח: בפורמט A הם בשורת ההוראות עצמה; ב-B הם בשורה הראשונה
        nums = [int(x) for x in re.findall(r'\d+', m.group(1))]
        qmax = max(nums) if nums else 0
        start = m.end() if fmt_b else m.start() + len(m.group(1))
        ends = []
        nx = text.find('הוראות לשאלות', start)
        if nx > -1: ends.append(nx)
        for pat in ('קטע קריאה', 'הבנה והסקה'):
            i = text.find(pat, start)
            if i > -1: ends.append(i)
        if qmax:
            mm = re.search(r'\.%d(?=[\sא-ת"])' % (qmax + 1), text[start:start + 9000])
            if mm: ends.append(start + mm.start())
        end = min(ends) if ends else start + 6000
        region = text[start:end]
        if fmt_b:
            # פורמט B: כל אפשרות = שורה שלמה שסמנה ')N(' בתוכה
            for ln in region.split('\n'):
                if re.search(r'\)\s*\d\s*\(', ln):
                    n_opts += 1
                    seg = strip_niqqud(re.sub(r'\)\s*\d\s*\(', ' ', ln))
                    for w in RE_HEBTOK.findall(seg):
                        if len(w) >= 2:
                            items.append((w, 'completion'))
        else:
            marks = [(x.start(), 'opt') for x in RE_OPT.finditer(region)]
            marks += [(x.start(), 'q') for x in RE_QNUM.finditer(region)]
            marks += [(x.start(), 'cut') for x in re.finditer(r'[©]|מועד ', region)]
            marks.sort()
            for i, (pos, kind) in enumerate(marks):
                if kind != 'opt':
                    continue
                nend = marks[i + 1][0] if i + 1 < len(marks) else len(region)
                seg = strip_niqqud(region[pos:nend])
                n_opts += 1
                for w in RE_HEBTOK.findall(seg):
                    if len(w) >= 2:
                        items.append((w, 'completion'))

    # סינון עצירה מכני + ייחוד פר-מבחן
    seen, out = set(), []
    for it, kind in items:
        it_n = norm(it)
        if not it_n or is_stopped(it_n):
            continue
        key = (it_n, kind)
        if key in seen:
            continue
        seen.add(key)
        out.append((it, it_n, kind))
    return out, n_pairs, n_opts

# ---------- 5. התאמה — שלוש רמות, סקריפט בלבד ----------
def match_item(item_n):
    """מחזיר ('full'|'close'|'miss', צורת-המאגר-שהותאמה או '')."""
    toks = item_n.split()
    if len(toks) == 1:
        w = toks[0]
        cands = set(prefix_variants(w))
        for c in list(cands):
            cands |= singular_variants(c)  # יחיד — נספר רק אם קיים במאגר (נבדק מיד)
        for c in cands:
            if c in bank_exact:
                return 'full', bank_exact[c]
        for c in cands:
            fc = fold(c)
            if fc in bank_fold:
                return 'full', bank_fold[fc]
        for c in cands:
            fc = fold(c)
            for r in bank_roots:
                if len(fc) >= len(r) and r in fc:
                    return 'close', r
        return 'miss', ''
    # צירוף: התאמה כמכלול (מדויק/מקופל), כולל הסרת ו' תחילית מהמילה הראשונה
    variants = {item_n}
    if toks[0].startswith('ו') and len(toks[0]) > 2:
        variants.add(' '.join([toks[0][1:]] + toks[1:]))
    for v in variants:
        if v in bank_exact:
            return 'full', bank_exact[v]
    for v in variants:
        if fold(v) in bank_fold:
            return 'full', bank_fold[fold(v)]
    # קרוב לצירוף: טוקן-תוכן (לא-עצירה, ≥3) שמתאים מלא למילת מאגר או מכיל שורש מאגר
    for t in toks:
        if len(t) < 3 or t in STOP:
            continue
        if t in bank_exact or fold(t) in bank_fold:
            return 'close', t
        ft = fold(t)
        for r in bank_roots:
            if len(ft) >= len(r) and r in ft:
                return 'close', r
    return 'miss', ''

# ---------- 6. ריצה + דוח ----------
per_exam = {}
agg_miss = collections.Counter()
agg_miss_kind = {}
agg_miss_src = collections.defaultdict(set)
health = []
for stem in measure:
    rows, n_pairs, n_opts = extract_exam(stem)
    res = []
    for raw, it_n, kind in rows:
        verdict, hit = match_item(it_n)
        res.append((raw, it_n, kind, verdict, hit))
        if verdict == 'miss':
            agg_miss[it_n] += 1
            agg_miss_kind[it_n] = ('צירוף' if ' ' in it_n else 'מילה', raw)
            agg_miss_src[it_n].add(kind)
    with io.open(os.path.join(OUTX, stem + '.tsv'), 'w', encoding='utf-8') as f:
        f.write('# חילוץ גולמי %s · זוגות-אנלוגיה=%d · אפשרויות-השלמה=%d\n'
                % (stem, n_pairs, n_opts))
        f.write('פריט\tמנורמל\tסוג\tתוצאה\tהתאמה\n')
        for r in res:
            f.write('\t'.join(r) + '\n')
    per_exam[stem] = res
    health.append((stem, n_pairs, n_opts, len(res)))
    n = len(res)
    nf = sum(1 for r in res if r[3] == 'full')
    nc = sum(1 for r in res if r[3] == 'close')
    print('%s: %d פריטים · מלא %.1f%% · מלא+קרוב %.1f%% (זוגות=%d)' %
          (stem, n, 100.0 * nf / n if n else 0, 100.0 * (nf + nc) / n if n else 0, n_pairs))

# --- דוח ---
L = ['# דוח כיסוי — המאגר מול מבחני נייט (קבוצת המדידה)', '',
     'seed=%d · held-out: %s · spring_2026 מחוץ לשתי הקבוצות.' % (SEED, ', '.join(held)),
     'בתיקייה %d מבחנים; אחרי ניכוי spring_2026 נותרו %d, מהם 4 held-out ⇒ **%d מבחני מדידה** (ההנחיה נקבה 17 — זה מלוא הקיים).' %
     (len(all_stems), len(pool), len(measure)), '',
     'חוקי החילוץ, הנרמול וההתאמה: run_coverage.py (קובץ זה הופעל כמות-שהוא). ',
     'stopwords.txt = רשימה סגורה (דקדוקית + 500 שכיחות בקורפוס המדידה). ',
     'אסור-לתקן: המאגר לא שונה במהלך המדידה.', '',
     '## בריאות החילוץ', '',
     '| מבחן | זוגות אנלוגיה | אפשרויות השלמה | פריטים אחרי סינון |', '|---|---|---|---|']
for stem, np_, no_, ni in health:
    flag = '' if 50 <= np_ <= 70 else ' ⚠'
    L.append('| %s | %d%s | %d | %d |' % (stem, np_, flag, no_, ni))
L += ['', '(צפי: 2 פרקים × 6 שאלות × 5 זוגות = 60 זוגות למבחן; ⚠ = מחוץ ל-50–70.)', '',
      '## כיסוי לפי מבחן', '',
      '| מבחן | פריטים | מלא | מלא % | +קרוב % | חסרים |', '|---|---|---|---|---|---|']
tot = {'n': 0, 'f': 0, 'c': 0}
for stem in measure:
    res = per_exam[stem]
    n = len(res); nf = sum(1 for r in res if r[3] == 'full'); nc = sum(1 for r in res if r[3] == 'close')
    tot['n'] += n; tot['f'] += nf; tot['c'] += nc
    L.append('| %s | %d | %d | %.1f%% | %.1f%% | %d |' %
             (stem, n, nf, 100.0 * nf / n if n else 0, 100.0 * (nf + nc) / n if n else 0, n - nf - nc))
L += ['', '**מצטבר: %d פריטים · כיסוי מלא %.1f%% · מלא+קרוב %.1f%%**' %
      (tot['n'], 100.0 * tot['f'] / tot['n'], 100.0 * (tot['f'] + tot['c']) / tot['n']), '']

# --- כיסוי אנלוגיות בלבד (בלי השלמות) ---
L += ['## כיסוי לפי מבחן — אנלוגיות בלבד', '',
      '| מבחן | פריטים | מלא | מלא % | +קרוב % | חסרים |', '|---|---|---|---|---|---|']
atot = {'n': 0, 'f': 0, 'c': 0}
for stem in measure:
    res = [r for r in per_exam[stem] if r[2] == 'analogy']
    n = len(res); nf = sum(1 for r in res if r[3] == 'full'); nc = sum(1 for r in res if r[3] == 'close')
    atot['n'] += n; atot['f'] += nf; atot['c'] += nc
    L.append('| %s | %d | %d | %.1f%% | %.1f%% | %d |' %
             (stem, n, nf, 100.0 * nf / n if n else 0, 100.0 * (nf + nc) / n if n else 0, n - nf - nc))
L += ['', '**מצטבר אנלוגיות: %d פריטים · כיסוי מלא %.1f%% · מלא+קרוב %.1f%%**' %
      (atot['n'], 100.0 * atot['f'] / atot['n'], 100.0 * (atot['f'] + atot['c']) / atot['n']), '']

# פירוט לפי סוג פריט ולפי מקור
for kind_he, kind in (('מילים בודדות', 'מילה'), ('ניבים/צירופים', 'צירוף')):
    rows = [(it, c) for it, c in agg_miss.items() if agg_miss_kind[it][0] == kind]
    L += ['## חסרים — %s (ממוינים לפי מספר מבחנים)' % kind_he, '',
          '| פריט | מבחנים שבהם חסר | מקור |', '|---|---|---|']
    SRC_HE = {'analogy': 'אנלוגיות', 'completion': 'השלמות'}
    for it, c in sorted(rows, key=lambda x: (-x[1], x[0])):
        src = '+'.join(sorted(SRC_HE[s] for s in agg_miss_src[it]))
        L.append('| %s | %d | %s |' % (agg_miss_kind[it][1], c, src))
    L.append('')

by_type = collections.Counter()
for stem in measure:
    for r in per_exam[stem]:
        by_type[(r[2], r[3])] += 1
L += ['## פירוט לפי מקור חילוץ', '', '| מקור | פריטים | מלא | קרוב | חסר |', '|---|---|---|---|---|']
for src, he in (('analogy', 'אנלוגיות'), ('completion', 'השלמות')):
    n = sum(v for (s, _), v in by_type.items() if s == src)
    L.append('| %s | %d | %d | %d | %d |' % (he, n, by_type[(src, 'full')],
             by_type[(src, 'close')], by_type[(src, 'miss')]))

# חסרים פר-מבחן — הרשימה המלאה
L += ['', '## רשימת החסרים המלאה לפי מבחן', '']
for stem in measure:
    misses = [r[0] for r in per_exam[stem] if r[3] == 'miss']
    L.append('**%s** (%d): %s' % (stem, len(misses), ' · '.join(misses)))
    L.append('')

io.open(os.path.join(HERE, 'דוח-כיסוי.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('\nמצטבר: %d פריטים · מלא %.1f%% · מלא+קרוב %.1f%%' %
      (tot['n'], 100.0 * tot['f'] / tot['n'], 100.0 * (tot['f'] + tot['c']) / tot['n']))
print('דוח: units_output/coverage-test/דוח-כיסוי.md')
