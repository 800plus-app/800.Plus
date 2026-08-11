# -*- coding: utf-8 -*-
"""חילוץ הצורה שבה מילת הערך מופיעה בפועל במשפט, להדגשה באפליקציה.
אותה התאמת-גזע רכה של check_en (כולל הנטיות הלא-רגולריות), אבל במקום כן/לא
מוחזרים הקטעים עצמם כפי שהם במשפט (עם רישיות): קודם חלון רציף של כל מילות
הצורה ("as long as"), ואם אין — כל מילה בנפרד ("both... and...").
הרצה ישירה = בדיקה על כל sentences-en.tsv ומדפיסה כשלים.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from check_en import match_tok

def matched_parts(word, sent):
    stoks = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"[A-Za-z']+", sent)]
    low = [t[0].lower() for t in stoks]
    forms = [f.strip() for f in re.split(r'[-/,()]', word) if f.strip()]
    best = None
    for f in forms:
        if re.search(r'\d', f):
            continue
        ftoks = re.findall(r"[a-z']+", f.lower())
        if not ftoks:
            continue
        n = len(ftoks)
        for i in range(len(stoks) - n + 1):
            if all(match_tok(ftoks[j], low[i + j]) for j in range(n)):
                return [sent[stoks[i][1]:stoks[i + n - 1][2]]]
        # אין חלון רציף — כל מילת-צורה בנפרד, משמאל לימין
        parts, pos = [], 0
        for t in ftoks:
            hit = next((k for k in range(pos, len(stoks)) if match_tok(t, low[k])), None)
            if hit is None:
                parts = []; break
            parts.append(stoks[hit][0]); pos = hit + 1
        if parts and best is None:
            best = parts
    return best

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    rows = [l.rstrip('\n').split('\t') for l in
            io.open(os.path.join(HERE, 'sentences-en.tsv'), encoding='utf-8') if l.strip()]
    bad = 0
    for w, s in rows:
        p = matched_parts(w, s)
        if not p:
            bad += 1
            print('⛔ %s | %s' % (w, s))
    print('🟢 %d/%d חולצו · %d כשלים' % (len(rows) - bad, len(rows), bad))
