# -*- coding: utf-8 -*-
"""נרמול המבחנים החדשים (exams/*.pdf) לטקסט — אותו מסלול כמו build_index.py.

בכוונה תיקייה נפרדת מ-בחינות-נייט/normalized: הוספת קבצים לשם הייתה משנה את
הגרלת ה-held-out (random.Random(SEED).sample על כל הקבצים בתיקייה).
"""
import glob, os, re, sys
import fitz

sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.abspath(__file__))
NORM = os.path.join(BASE, 'normalized')
os.makedirs(NORM, exist_ok=True)

BIDI = {c: None for c in [0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D,
                          0x202E, 0x2066, 0x2067, 0x2068, 0x2069, 0x00AD]}


def normalize(text):
    text = text.translate(BIDI)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


for pdf in sorted(glob.glob(os.path.join(BASE, '*.pdf'))):
    stem = os.path.basename(pdf)[:-4]
    d = fitz.open(pdf)
    text = normalize('\n'.join(p.get_text() for p in d))
    open(os.path.join(NORM, stem + '.txt'), 'w', encoding='utf-8').write(text)
    heb = len(re.findall(r'[א-ת]', text))
    n_an = len(re.findall(r'אנלוגיות\s*\(שאלות', text))
    n_compl = len(re.findall(r'הוראות לשאלות[^\n]*להשלמת החסר', text))
    print('%s: %d עמ\' · %d תווים · %d עבריים · פרקי-אנלוגיות=%d · השלמות=%d'
          % (stem, d.page_count, len(text), heb, n_an, n_compl))
