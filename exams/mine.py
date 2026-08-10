# -*- coding: utf-8 -*-
"""שלב ב · כרייה עם ציטוטים מ-22 מבחני הקורפוס (16 מדידה + 6 חדשים).

נגזר מ-run_coverage.py (אותם נרמול/התאמה/רשימת-עצירה בדיוק), עם שתי תוספות:
1. ציטוט לכל פריט: מועד · פרק מילולי · מספר שאלה · תפקיד (רגל/מסיח K/אפשרות K).
2. צבירה חוצת-מבחנים: מונה מועדים, ממוצע מיקום-קושי (מס' שאלה באנלוגיות).

held-out (autumn_2022, winter_2021, winter_2024, winter_2025) ו-spring_2026
אינם נקראים. המאגר לקריאה בלבד.

פלט: mining/raw/<stem>.tsv · mining/candidates.tsv · סיכום למסך.
"""
import collections, io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
UNITS = os.path.join(PROJ, 'units_output')
OLD_NORM = os.path.join(PROJ, 'בחינות-נייט', 'normalized')
NEW_NORM = os.path.join(HERE, 'normalized')
CT = os.path.join(UNITS, 'coverage-test')
OUT = os.path.join(HERE, 'mining')
RAW = os.path.join(OUT, 'raw')
os.makedirs(RAW, exist_ok=True)

HELD = {'autumn_2022', 'winter_2021', 'winter_2024', 'winter_2025'}
EXCL = HELD | {'spring_2026'}

# ---------- נרמול (העתק מדויק מ-run_coverage.py) ----------
NIQ = re.compile(r'[֑-ׇ]')
SPLIT_LETTER = re.compile(r'(?<![א-ת])([א-ת]) ([א-ת]{2,})')
FINALS = str.maketrans('ךםןףץ', 'כמנפצ')

def strip_niqqud(s):
    s = NIQ.sub('', s)
    return SPLIT_LETTER.sub(r'\1\2', s)

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = strip_niqqud(s)
    s = s.replace('־', ' ').replace('-', ' ')
    s = s.replace('׳', "'").replace('״', '"')
    return ' '.join(s.split()).strip()

def fold_word(w):
    w = w.translate(FINALS)
    w = re.sub(r'וו+', 'ו', w)
    w = re.sub(r'יי+', 'י', w)
    if len(w) > 2:
        w = w[0] + re.sub(r'[וי]', '', w[1:-1]) + w[-1]
    return w

def fold(s):
    return ' '.join(fold_word(w) for w in norm(s).split())

def prefix_variants(w):
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

# ---------- מאגר (קריאה בלבד) ----------
bank_exact, bank_fold, bank_roots = {}, {}, set()
PAREN = re.compile(r'\(([^)]*)\)')
n_bank = 0
for n in range(1, 11):
    for ln in io.open(os.path.join(UNITS, 'unit-%d-words.tsv' % n), encoding='utf-8'):
        p = ln.rstrip('\n').split('\t')
        if len(p) < 3 or not p[1].strip():
            continue
        word, roots = p[1].strip(), p[2].strip()
        n_bank += 1
        variants = {word}
        if '(' in word:
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
print('מאגר: %d מילים · %d שורשים' % (n_bank, len(bank_roots)))

# ---------- רשימת עצירה קפואה ----------
STOP = set(w.strip() for w in io.open(os.path.join(CT, 'stopwords.txt'), encoding='utf-8')
           if w.strip() and not w.startswith('#'))
print('רשימת עצירה: %d' % len(STOP))

def is_stopped(item):
    toks = item.split()
    if len(toks) == 1:
        return toks[0] in STOP
    return all(t in STOP for t in toks)

# ---------- התאמה (העתק מדויק) ----------
def match_item(item_n):
    toks = item_n.split()
    if len(toks) == 1:
        w = toks[0]
        cands = set(prefix_variants(w))
        for c in list(cands):
            cands |= singular_variants(c)
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
    variants = {item_n}
    if toks[0].startswith('ו') and len(toks[0]) > 2:
        variants.add(' '.join([toks[0][1:]] + toks[1:]))
    for v in variants:
        if v in bank_exact:
            return 'full', bank_exact[v]
    for v in variants:
        if fold(v) in bank_fold:
            return 'full', bank_fold[fold(v)]
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

# ---------- חילוץ עם ציטוטים ----------
RE_AN_HDR = re.compile(r'אנלוגיות\s*\(שאלות')
RE_AN_END = re.compile(r'הבנה והסקה')
RE_PAIR = re.compile(r"([א-ת][א-ת'\"׳״ ]{0,24}?)\s*:\s*"
                     r"([א-ת][א-ת'\"׳״ ]{0,24}?)(?=\s*[-()\n.,;©0-9]|$)")
RE_HEBTOK = re.compile(r"[א-ת][א-ת'\"׳״]+")
INSTR_SKIP = ('מצאו את היחס', 'בכל שאלה יש זוג', 'שימו לב', 'זכויות שמורות',
              'אין להעתיק', 'הזמן המוקצב', 'חשיבה מילולית', 'מועד ')

def clean_side(s):
    return ' '.join(strip_niqqud(s).split()).strip(" '\"")

def pair_from(seg):
    m = RE_PAIR.search(strip_niqqud(seg))
    if not m:
        return None
    a, b = clean_side(m.group(1)), clean_side(m.group(2))
    if not a or not b or len(a) > 22 or len(b) > 22:
        return None
    return a, b

def analogy_items(text, fmt_b, chapter, stem):
    """מחזיר [(item, kind, chapter, qnum, role)] מקטע אנלוגיות אחד."""
    items = []
    if fmt_b:
        # שורת רגל: מסתיימת ב-'.N'; שורת מסיח: מסתיימת ב-')K('
        q = 0
        for ln in text.split('\n'):
            if any(k in ln for k in INSTR_SKIP) or ':' not in ln:
                continue
            mq = re.search(r'\.\s*(\d{1,2})\s*$', ln)
            mo = re.search(r'\)\s*(\d)\s*\($|\)\s*(\d)\s*\(', ln)
            pr = pair_from(re.sub(r'\)\s*\d\s*\(|\.\s*\d{1,2}\s*$|^\s*-\s*', ' ', ln))
            if not pr:
                continue
            if mq:
                q = int(mq.group(1))
                role_a = role_b = 'רגל'
            elif mo:
                k = mo.group(1) or mo.group(2)
                role_a = role_b = 'מסיח %s' % k
            else:
                role_a = role_b = 'לא-זוהה'
            for side in pr:
                items.append((side, 'analogy', chapter, q, role_a))
    else:
        # פורמט A: סמנים ' .N' (שאלה) ו-'( )K' (מסיח) בתוך טקסט רציף
        marks = [(m.start(), 'q', int(m.group(1)))
                 for m in re.finditer(r'\.\s?(\d{1,2})(?=[א-ת\s])', text)]
        marks += [(m.start(), 'opt', int(m.group(1)))
                  for m in re.finditer(r'\(\s*\)\s*(\d)', text)]
        marks += [(m.start(), 'cut', 0) for m in re.finditer(r'©|מועד |חשיבה מילולית', text)]
        marks.sort()
        q = 0
        for i, (pos, kind, num) in enumerate(marks):
            if kind == 'cut':
                continue
            nend = marks[i + 1][0] if i + 1 < len(marks) else len(text)
            seg = text[pos:nend]
            if any(k in seg for k in INSTR_SKIP):
                continue
            pr = pair_from(re.sub(r'^[.()\s\d]+', ' ', seg))
            if kind == 'q':
                q = num
                role = 'רגל'
            else:
                role = 'מסיח %d' % num
            if not pr:
                continue
            for side in pr:
                items.append((side, 'analogy', chapter, q, role))
    return items

def completion_items(text, fmt_b, stem):
    """אפשרויות התשובה של השלמת-החסר, עם מספר שאלה. מחזיר [(word,'completion',chap,q,role)]."""
    items = []
    chapter = 0
    # אזורי השלמה: כל בלוק 'הוראות לשאלות' שהשורה/ההמשך שלו מכיל 'להשלמת החסר'
    for m in re.finditer(r'([^\n]*הוראות לשאלות[^\n]*)(\n[^\n]*)?', text):
        header = m.group(0)
        if 'להשלמת החסר' not in header:
            continue
        chapter += 1
        nums = [int(x) for x in re.findall(r'\d+', m.group(1))]
        qmax = max(nums) if nums else 0
        start = m.end()
        ends = []
        nx = text.find('הוראות לשאלות', start)
        if nx > -1: ends.append(nx)
        for pat in ('קטע קריאה', 'הבנה והסקה'):
            i = text.find(pat, start)
            if i > -1: ends.append(i)
        if qmax:
            mm = re.search(r'\.\s?%d(?=[\sא-ת"])' % (qmax + 1), text[start:start + 9000])
            if mm: ends.append(start + mm.start())
        end = min(ends) if ends else start + 6000
        region = text[start:end]
        if fmt_b:
            q = 0
            for ln in region.split('\n'):
                mq = re.search(r'\.\s*(\d{1,2})\s*$', ln)
                if mq:
                    q = int(mq.group(1))
                mo = re.search(r'\)\s*(\d)\s*\(', ln)
                # שורת-אפשרות בלי סמן: בחלק מקובצי 2019-2020 הטקסט נקרע מהסמן
                # ')N('. אפשרויות השלמה מזוהות מכנית לפי מפריד ה-'/' שלהן.
                if mo or ('/' in ln and RE_HEBTOK.search(ln)):
                    seg = strip_niqqud(re.sub(r'\)\s*\d\s*\(', ' ', ln))
                    role = 'אפשרות %s' % mo.group(1) if mo else 'אפשרות ?'
                    for w in RE_HEBTOK.findall(seg):
                        if len(w) >= 2:
                            items.append((w, 'completion', chapter, q, role))
        else:
            marks = [(x.start(), 'opt', int(x.group(1))) for x in re.finditer(r'\(\s*\)\s*(\d)', region)]
            marks += [(x.start(), 'q', int(x.group(1))) for x in re.finditer(r'\.\s?(\d{1,2})(?=[\sא-ת"])', region)]
            marks += [(x.start(), 'cut', 0) for x in re.finditer(r'[©]|מועד ', region)]
            marks.sort()
            q = 0
            for i, (pos, kind, num) in enumerate(marks):
                if kind == 'q':
                    q = num
                    continue
                if kind != 'opt':
                    continue
                nend = marks[i + 1][0] if i + 1 < len(marks) else len(region)
                seg = strip_niqqud(region[pos:nend])
                for w in RE_HEBTOK.findall(seg):
                    if len(w) >= 2:
                        items.append((w, 'completion', chapter, q, 'אפשרות %d' % num))
    return items

def extract_exam(stem, path):
    text = unicodedata.normalize('NFKC', io.open(path, encoding='utf-8').read())
    fmt_b = len(re.findall(r'\)\d\(', text)) > len(re.findall(r'\(\s*\)\s*\d', text))
    items = []
    chap = 0
    for m in RE_AN_HDR.finditer(text):
        chap += 1
        e = RE_AN_END.search(text, m.end())
        chunk = text[m.end():e.start() if e else m.end() + 4000]
        items += analogy_items(chunk, fmt_b, chap, stem)
    items += completion_items(text, fmt_b, stem)
    # סינון עצירה + ייחוד פר-מבחן (פריט+סוג — הציטוט הראשון נשמר)
    seen, out = set(), []
    for it, kind, chapter, q, role in items:
        it_n = norm(it)
        if not it_n or is_stopped(it_n):
            continue
        key = (it_n, kind)
        if key in seen:
            continue
        seen.add(key)
        out.append((it, it_n, kind, chapter, q, role))
    return out, fmt_b

# ---------- ריצה ----------
corpus = []
for f in sorted(os.listdir(OLD_NORM)):
    if f.endswith('.txt') and f[:-4] not in EXCL:
        corpus.append((f[:-4], os.path.join(OLD_NORM, f)))
for f in sorted(os.listdir(NEW_NORM)):
    if f.endswith('.txt'):
        corpus.append((f[:-4], os.path.join(NEW_NORM, f)))
assert len(corpus) == 22, 'ציפינו ל-22 מבחני כרייה, יש %d' % len(corpus)
assert not any(s in EXCL for s, _ in corpus)

agg = {}
for stem, path in corpus:
    rows, fmt_b = extract_exam(stem, path)
    n_an = sum(1 for r in rows if r[2] == 'analogy')
    n_co = len(rows) - n_an
    with io.open(os.path.join(RAW, stem + '.tsv'), 'w', encoding='utf-8') as f:
        f.write('# %s · fmt=%s · analogy=%d · completion=%d\n'
                % (stem, 'B' if fmt_b else 'A', n_an, n_co))
        f.write('פריט\tמנורמל\tסוג\tפרק\tשאלה\tתפקיד\tתוצאה\tהתאמה\n')
        for it, it_n, kind, chapter, q, role in rows:
            verdict, hit = match_item(it_n)
            f.write('\t'.join([it, it_n, kind, str(chapter), str(q), role, verdict, hit]) + '\n')
            e = agg.setdefault(it_n, {'raw': collections.Counter(), 'kinds': set(),
                                      'verdict': verdict, 'hit': hit, 'cites': [],
                                      'qs': []})
            e['raw'][it] += 1
            e['kinds'].add(kind)
            e['cites'].append('%s·פרק%d·ש%s·%s' % (stem, chapter, q or '?', role))
            if kind == 'analogy' and q:
                e['qs'].append(q)
    print('%s: fmt=%s · analogy=%d · completion=%d' % (stem, 'B' if fmt_b else 'A', n_an, n_co))

# ---------- צבירה ----------
rows = []
for it_n, e in agg.items():
    moadim = len({c.split('·')[0] for c in e['cites']})
    avg_q = sum(e['qs']) / len(e['qs']) if e['qs'] else 0
    rows.append((it_n, e['raw'].most_common(1)[0][0], '+'.join(sorted(e['kinds'])),
                 e['verdict'], e['hit'], moadim, len(e['cites']), avg_q,
                 ' ; '.join(e['cites'])))
rows.sort(key=lambda r: (-r[5], r[0]))
with io.open(os.path.join(OUT, 'candidates.tsv'), 'w', encoding='utf-8') as f:
    f.write('# צבירה חוצת-מבחנים · קורפוס=%d מבחנים · פריטים ייחודיים=%d\n'
            % (len(corpus), len(rows)))
    f.write('מנורמל\tייצוג\tסוג\tתוצאה\tהתאמה\tמועדים\tהופעות\tממוצע-שאלה\tציטוטים\n')
    for r in rows:
        f.write('\t'.join([r[0], r[1], r[2], r[3], r[4], str(r[5]), str(r[6]),
                           '%.1f' % r[7], r[8]]) + '\n')

by_v = collections.Counter(r[3] for r in rows)
print('\nסה"כ פריטים ייחודיים: %d · full=%d · close=%d · miss=%d'
      % (len(rows), by_v['full'], by_v['close'], by_v['miss']))
print('מועמדים (miss): %d · מהם ב-2+ מועדים: %d'
      % (by_v['miss'], sum(1 for r in rows if r[3] == 'miss' and r[5] >= 2)))
