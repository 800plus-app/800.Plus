# -*- coding: utf-8 -*-
"""שער מכני למשפטי האנגלית. בדיקות שאינן דורשות שיפוט:
שלמות שורות מול הקלט · המילה מופיעה (התאמת-גזע רכה) · אורך 8–16 (קשיח 6–20) ·
בלי מקף ארוך · בלי מילות-AI · בלי משפט כפול · תקינות TSV.
שימוש: python check_en.py            (כל out-e-*.tsv)
        python check_en.py e-07      (מנה אחת)
"""
import glob, io, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
BANNED = ('delve', 'tapestry', 'testament to', 'a myriad of', 'in the realm',
          'in today’s world', "in today's world", '—')

# נטיות לא-רגולריות שמבחן-הגזע לא תופס. התדריך מתיר הטיה, אז אלה חוקיות.
IRREG = {'wear': ('wore', 'worn'), 'buy': ('bought',), 'catch': ('caught',),
         'teach': ('taught',), 'think': ('thought',), 'bring': ('brought',),
         'fight': ('fought',), 'seek': ('sought',), 'go': ('went', 'gone'),
         'eat': ('ate',), 'fall': ('fell',), 'see': ('saw', 'seen'),
         'take': ('took',), 'give': ('gave',), 'come': ('came',),
         'run': ('ran',), 'sit': ('sat',), 'stand': ('stood',),
         'win': ('won',), 'lose': ('lost',), 'say': ('said',),
         'tell': ('told',), 'sell': ('sold',), 'hold': ('held',),
         'keep': ('kept',), 'sleep': ('slept',), 'feel': ('felt',),
         'leave': ('left',), 'meet': ('met',), 'get': ('got',),
         'find': ('found',), 'fly': ('flew', 'flown'), 'draw': ('drew', 'drawn'),
         'grow': ('grew', 'grown'), 'know': ('knew', 'known'),
         'throw': ('threw', 'thrown'), 'speak': ('spoke', 'spoken'),
         'break': ('broke', 'broken'), 'choose': ('chose', 'chosen'),
         'write': ('wrote', 'written'), 'ride': ('rode', 'ridden'),
         'rise': ('rose', 'risen'), 'drive': ('drove', 'driven'),
         'sing': ('sang', 'sung'), 'drink': ('drank', 'drunk'),
         'swim': ('swam', 'swum'), 'begin': ('began', 'begun'),
         'pay': ('paid',), 'lay': ('laid',), 'hear': ('heard',),
         'make': ('made',), 'build': ('built',), 'send': ('sent',),
         'spend': ('spent',), 'lend': ('lent',), 'bend': ('bent',),
         'shoot': ('shot',), 'stick': ('stuck',), 'strike': ('struck',),
         'hang': ('hung',), 'shake': ('shook', 'shaken'), 'steal': ('stole', 'stolen'),
         'freeze': ('froze', 'frozen'), 'forget': ('forgot', 'forgotten'),
         'understand': ('understood',), 'mean': ('meant',), 'deal': ('dealt',),
         'sweep': ('swept',), 'weep': ('wept',), 'feed': ('fed',),
         'lead': ('led',), 'read': ('read',), 'blow': ('blew', 'blown'),
         'wake': ('woke', 'woken'), 'tear': ('tore', 'torn'),
         'swear': ('swore', 'sworn'), 'bear': ('bore', 'borne'),
         'bite': ('bit', 'bitten'), 'hide': ('hid', 'hidden'),
         'shine': ('shone',), 'dig': ('dug',), 'spin': ('spun',),
         'fell': ('felled',), 'flee': ('fled',), 'cling': ('clung',),
         'swing': ('swung',), 'sink': ('sank', 'sunk'), 'shrink': ('shrank', 'shrunk'),
         'spring': ('sprang', 'sprung'), 'sting': ('stung',), 'string': ('strung',)}

def match_tok(t, x):
    if t in IRREG and x in IRREG[t]:
        return True
    """התאמת-גזע רכה: זהות, או שהאחד תחילית של השני (owns~own, decided~decide)."""
    if t == x:
        return True
    if len(t) >= 3 and len(x) >= 3 and (x.startswith(t[:3]) or t.startswith(x[:3])):
        return abs(len(t) - len(x)) <= 3 and (x.startswith(t[:min(len(t), len(x)) - 1]) or
                                              t.startswith(x[:min(len(t), len(x)) - 1]))
    return False

def word_in(word, sent):
    s = sent.lower()
    # ערך מרובה-צורות ("1st - first") — מספיקה אחת מהצורות
    forms = [f.strip() for f in re.split(r'[-/,()]', word) if f.strip()]
    for f in forms:
        toks = [t for t in re.findall(r"[a-z']+", f.lower()) if t]
        if not toks:
            continue
        if all(any(match_tok(t, x) for x in re.findall(r"[a-z']+", s)) for t in toks):
            return True
    return False

names = sys.argv[1:] or sorted(
    os.path.basename(p)[4:-4] for p in glob.glob(os.path.join(HERE, 'out-e-*.tsv')))
tot_bad = 0
seen_sent = {}
for nb in names:
    inp = os.path.join(HERE, 'batches', nb + '.txt')
    outp = os.path.join(HERE, 'out-' + nb + '.tsv')
    if not os.path.exists(outp):
        print('⚠ %s: אין פלט' % nb)
        continue
    ins = [l.rstrip('\n').split('\t') for l in io.open(inp, encoding='utf-8') if l.strip()]
    outs = [l.rstrip('\n').split('\t') for l in io.open(outp, encoding='utf-8')
            if l.strip() and not l.startswith('#')]
    bad = []
    if len(ins) != len(outs):
        bad.append('שורות: %d קלט מול %d פלט' % (len(ins), len(outs)))
    for i, o in zip(ins, outs):
        w_in, w_out = i[1], o[0]
        sent = o[1].strip() if len(o) > 1 else ''
        probs = []
        if w_out.strip().lower() != w_in.strip().lower():
            probs.append('סדר/מילה (%s≠%s)' % (w_out, w_in))
        if not sent:
            probs.append('ריק')
        else:
            n = len(re.findall(r"[A-Za-z']+", sent))
            if n < 6 or n > 20:
                probs.append('אורך %d' % n)
            low = sent.lower()
            for b in BANNED:
                if b in low or b in sent:
                    probs.append('אסור: %s' % b.strip())
            if not word_in(w_in, sent):
                probs.append('המילה לא במשפט')
            key = low
            if key in seen_sent and seen_sent[key] != w_in:
                probs.append('משפט כפול עם %s' % seen_sent[key])
            seen_sent[key] = w_in
        if probs:
            bad.append('%s: %s | %s' % (w_in, '; '.join(probs), sent[:60]))
    if bad:
        tot_bad += len(bad)
        print('⛔ %s — %d בעיות' % (nb, len(bad)))
        for b in bad[:10]:
            print('   ', b)
    else:
        print('🟢 %s (%d)' % (nb, len(outs)))
print('\nסה"כ בעיות: %d' % tot_bad)
