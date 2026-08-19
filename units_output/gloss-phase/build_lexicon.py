# -*- coding: utf-8 -*-
"""בניית לקסיקון מקומי מדאמפ ויקימילון העברי (CC BY-SA).

קלט:  hewiktionary.xml.bz2 (דאמפ ציבורי)
פלט:  lexicon.json — { מילה-בלי-ניקוד: [ {vocalized, pos, root, senses[], labels[], syn[]} ] }

הלקסיקון משמש **לקריאה והבנה בלבד**. הפירושים במאגר נכתבים מחדש מההבנה —
אף פעם לא בהעתקה. כלל החפיפה (>50% מילים משותפות עם מקור) נאכף בנפרד.
"""
import bz2, collections, io, json, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
DUMP = os.path.join(HERE, 'hewiktionary.xml.bz2')
OUT = os.path.join(HERE, 'lexicon.json')
NIQ = re.compile(r'[֑-ׇ]')

TITLE = re.compile(r'<title>(.*?)</title>')
HEAD = re.compile(r'^==\s*([^=]+?)\s*==\s*$', re.M)
DEFLINE = re.compile(r'^#(?![:*#])\s*(.+)$', re.M)
REDIRECT = re.compile(r'^#\s*(?:הפניה|REDIRECT)\s*\[\[(.+?)\]\]', re.I)
SECTION = re.compile(r'^===\s*(.+?)\s*===\s*$', re.M)
ENT = {'&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#039;': "'"}

# תבניות שמוסיפות תווית משלב/תחום — נשמרות כ-labels ולא כטקסט
LABEL_TMPL = {'מקרא', 'משלב', 'רובד', 'תחום', 'ביטוי', 'מליצי', 'סלנג', 'ארכאי',
              'לשון חז"ל', 'תלמוד', 'שאילה', 'הַשְׁאָלָה', 'בהשאלה'}


def unent(s):
    for k, v in ENT.items():
        s = s.replace(k, v)
    return s


def strip_templates(s):
    """מסיר {{...}} מקוננים; מחזיר (טקסט, תוויות שנאספו)."""
    labels, out, depth, buf = [], [], 0, []
    i = 0
    while i < len(s):
        if s.startswith('{{', i):
            depth += 1; i += 2; buf.append('')
            continue
        if s.startswith('}}', i) and depth:
            inner = buf.pop() if buf else ''
            depth -= 1; i += 2
            parts = [p.strip() for p in inner.split('|')]
            if parts and parts[0] in LABEL_TMPL:
                labels.append(' '.join(p for p in parts if p))
            continue
        ch = s[i]
        if depth:
            buf[-1] += ch
        else:
            out.append(ch)
        i += 1
    return ''.join(out), labels


def clean(s):
    """טקסט הגדרה נקי: בלי תבניות, קישורים, הדגשות, הערות."""
    s = unent(s)
    s, labels = strip_templates(s)
    s = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', s)
    s = re.sub(r'\[\[([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'''?", '', s)
    s = re.sub(r'<ref[^>]*>.*?</ref>', ' ', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = s.replace('#', ' ')
    s = re.sub(r'\s+', ' ', s).strip(' .;,·')
    return s, labels


def parse_page(title, text):
    """מחזיר רשימת ערכים (יכולים להיות כמה כותרות מנוקדות בעמוד אחד)."""
    m = REDIRECT.match(text.strip())
    if m:
        return [{'redirect': m.group(1)}]
    entries = []
    heads = list(HEAD.finditer(text))
    if not heads:
        heads = [None]
    for k, h in enumerate(heads):
        if h is None:
            voc, body = title, text
        else:
            voc = h.group(1).strip()
            end = heads[k + 1].start() if k + 1 < len(heads) else len(text)
            body = text[h.end():end]
        if voc.strip('=') in ('תרגום', 'ראו גם', 'קישורים חיצוניים'):
            continue
        # קטע ההגדרות = עד הכותרת המשנית הראשונה (גיזרון/נגזרות/תרגום...)
        sec = SECTION.search(body)
        defs_area = body[:sec.start()] if sec else body
        senses, labels = [], []
        for d in DEFLINE.findall(defs_area):
            txt, lb = clean(d)
            if txt and len(txt) > 1:
                senses.append(txt)
                labels += lb
        if not senses:
            continue
        pos = re.search(r'\|\s*חלק דיבר\s*=\s*([^\n|]+)', body)
        root = re.search(r'\|\s*שורש\s*=\s*([^\n]*)', body)
        rtxt = ''
        if root:
            rc, _ = clean(root.group(1))
            rtxt = rc
            mm = re.search(r'שרש3?\|([^}]+)', root.group(1))
            if mm:
                rtxt = ''.join(p.strip() for p in mm.group(1).split('|'))[:8]
        syn = []
        msec = re.search(r'===\s*מילים נרדפות\s*===(.*?)(?:^===|\Z)', body, re.S | re.M)
        if msec:
            for ln in msec.group(1).split('\n'):
                if ln.strip().startswith('*'):
                    t, _ = clean(ln.lstrip('* '))
                    if t:
                        syn.append(t)
        entries.append({'vocalized': voc, 'pos': pos.group(1).strip() if pos else '',
                        'root': rtxt, 'senses': senses,
                        'labels': sorted(set(labels)), 'syn': syn})
    return entries


def key(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('־', ' ').replace('-', ' ')
    return ' '.join(NIQ.sub('', s).split()).strip()


def main():
    lex = collections.defaultdict(list)
    redirects = {}
    npages = nentries = 0
    title, buf, inpage = None, [], False
    with bz2.open(DUMP, 'rt', encoding='utf-8') as f:
        for line in f:
            if '<title>' in line:
                m = TITLE.search(line)
                title = unent(m.group(1)) if m else None
            if '<text' in line:
                inpage, buf = True, []
            if inpage:
                buf.append(line)
            if inpage and '</text>' in line:
                inpage = False
                if not title or ':' in title:      # מרחבי שם טכניים
                    continue
                raw = ''.join(buf)
                raw = raw[raw.find('>') + 1:raw.rfind('</text>')]
                npages += 1
                for e in parse_page(title, raw):
                    if 'redirect' in e:
                        redirects[key(title)] = key(e['redirect'])
                        continue
                    e['title'] = title
                    lex[key(title)].append(e)
                    nentries += 1
                if npages % 20000 == 0:
                    print('  ...%d עמודים' % npages)
    # פתרון הפניות (עומק 1)
    nred = 0
    for src, dst in redirects.items():
        if src not in lex and dst in lex:
            lex[src] = lex[dst]
            nred += 1
    json.dump(lex, io.open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    size = os.path.getsize(OUT) / 1e6
    print('עמודים: %d · ערכים: %d · מפתחות: %d · הפניות שנפתרו: %d · %.1fMB'
          % (npages, nentries, len(lex), nred, size))


if __name__ == '__main__':
    main()
