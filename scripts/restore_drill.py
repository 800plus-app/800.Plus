#!/usr/bin/env python3
"""תרגיל שחזור — האם הגיבוי באמת ניתן לשחזור, או רק קיים.

הטעות שהתרגיל הזה קיים כדי למנוע
---------------------------------
גיבוי שרץ בהצלחה כל לילה יוצר ביטחון, והביטחון הזה נבדק לראשונה ביום שבו צריך אותו —
כלומר ביום הגרוע ביותר האפשרי. "יש קובץ JSON" ו"אפשר להחזיר ממנו את המשתמשים" הם שתי
טענות שונות, והשנייה היא היחידה ששווה משהו.

מה נבדק כאן, וכל בדיקה היא כשל אמיתי שנראה בשטח
------------------------------------------------
1. הקובץ נטען      — JSON קטוע הוא הכשל השכיח ביותר בגיבוי שנכתב תוך כדי ריצה.
2. יש שורות        — 200 OK עם מערך ריק הוא הכשל הכי שקט שיש. RLS שחוסמת את המפתח
                     מחזירה בדיוק את זה, וגיבוי של אפס שורות נראה מוצלח בלוג.
3. העמודות קיימות  — שחזור נכשל על עמודה חסרה, לא על קובץ חסר.
4. המפתחות ייחודיים — id כפול אומר שהייצוא רץ תוך כדי כתיבה ואינו עקבי.
5. ההתקדמות נפתחת  — progress.data הוא JSON בתוך JSON. אם הפנימי שבור, השורה קיימת
                     והמשתמש איבד הכול. זו הבדיקה היחידה כאן שנוגעת במה שבאמת יקר.
6. הצלבה מול היום  — מספר השורות בגיבוי מול המספר בייצור. גיבוי שקטן משמעותית מהמצב
                     הנוכחי הוא גיבוי חלקי, וזה לא נראה בשום מקום אחר.

לא כותב כלום. תרגיל שחזור שנוגע בייצור אינו תרגיל.
"""
import json, os, subprocess, sys

REPO = 'Hagay-BOT/800plus-backups'
OK, BAD, WARN = '✔', '✗', '⚠'

# עמודה אחת לכל טבלה שבלעדיה השחזור חסר משמעות.
REQUIRED = {
    'profiles':     ['id', 'email'],
    'progress':     ['user_id', 'lang', 'data'],
    'feedback':     ['id'],
    'subscription': ['user_id'],
    'assoc_shared': ['id', 'word_key', 'text'],
}
KEYS = {'profiles': 'id', 'progress': None, 'feedback': 'id',
        'subscription': 'user_id', 'assoc_shared': 'id'}


def gh(args, timeout=90):
    return subprocess.run(['gh'] + args, capture_output=True, text=True,
                          timeout=timeout, encoding='utf-8', errors='replace')


def fetch(name):
    r = gh(['api', f'repos/{REPO}/contents/data/{name}.json', '--jq', '.download_url'])
    url = r.stdout.strip()
    if not url:
        return None
    return gh(['api', '--method', 'GET', url]).stdout if url.startswith('http') else None


def live_counts():
    """כמה שורות יש עכשיו בייצור. דורש SUPABASE_SERVICE_KEY; בלעדיו הבדיקה מדולגת
       ומסומנת ככזו, ולא מוצגת כאילו עברה."""
    key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not key:
        return None
    base = os.environ.get('SUPABASE_URL') or 'https://oycypbnzcvtjliovfsxn.supabase.co'
    out = {}
    import urllib.request
    for t in REQUIRED:
        req = urllib.request.Request(
            f'{base}/rest/v1/{t}?select=*',
            headers={'apikey': key, 'Authorization': 'Bearer ' + key,
                     'Prefer': 'count=exact', 'Range': '0-0'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                cr = r.headers.get('Content-Range', '')
                out[t] = int(cr.split('/')[-1]) if '/' in cr else None
        except Exception:
            out[t] = None
    return out


def main():
    rows, fatal = [], 0
    live = live_counts()

    for table, cols in REQUIRED.items():
        raw = fetch(table)
        if not raw:
            rows.append((BAD, table, 'הקובץ לא נמשך מ-' + REPO)); fatal += 1; continue

        try:
            data = json.loads(raw)
        except Exception as e:
            rows.append((BAD, table, 'JSON פגום — %s' % e)); fatal += 1; continue

        if not isinstance(data, list):
            rows.append((BAD, table, 'אינו מערך שורות')); fatal += 1; continue
        if not data:
            rows.append((BAD, table, '0 שורות — ייצוא ריק נראה מוצלח ואינו')); fatal += 1; continue

        missing = [c for c in cols if c not in data[0]]
        if missing:
            rows.append((BAD, table, 'עמודות חסרות: ' + ', '.join(missing))); fatal += 1; continue

        note = '%d שורות · %d עמודות' % (len(data), len(data[0]))

        k = KEYS.get(table)
        if k:
            ids = [r.get(k) for r in data]
            if len(set(ids)) != len(ids):
                rows.append((BAD, table, note + ' · %s כפול — ייצוא לא עקבי'
                             % k)); fatal += 1; continue

        # ההתקדמות עצמה — הדבר היחיד כאן שאי אפשר לבנות מחדש.
        if table == 'progress':
            words = broken = 0
            for r in data:
                d = r.get('data')
                if isinstance(d, str):
                    try:
                        d = json.loads(d)
                    except Exception:
                        broken += 1; continue
                if not isinstance(d, dict):
                    broken += 1; continue
                w = ((d.get('stats') or {}).get('words') or {})
                if not isinstance(w, dict):
                    broken += 1; continue
                words += len(w)
            if broken:
                rows.append((BAD, table, note + ' · %d שורות עם data שבור' % broken))
                fatal += 1; continue
            note += ' · %d מילים נשמרות' % words

        if live and live.get(table) is not None:
            n, l = len(data), live[table]
            if n < l:
                rows.append((WARN, table, note + ' · בייצור %d — הגיבוי מפגר' % l)); continue
            note += ' · בייצור %d' % l

        rows.append((OK, table, note))

    w = max(len(r[1]) for r in rows)
    print('\nתרגיל שחזור — %s\n' % REPO)
    for mark, t, note in rows:
        print('  %s  %-*s  %s' % (mark, w, t, note))

    if live is None:
        print('\n  %s הצלבה מול ייצור דולגה — SUPABASE_SERVICE_KEY אינו בסביבה' % WARN)

    print('\n  %s' % ('הגיבוי ניתן לשחזור' if not fatal
                      else '%d טבלאות אינן ניתנות לשחזור' % fatal))
    return 1 if fatal else 0


if __name__ == '__main__':
    sys.exit(main())
