#!/usr/bin/env python3
"""שורת מדד פעילות אחת ללוג של weekly-nudge — בלי שום PII.

מה נמדד ולמה: «פעיל» נקבע לפי התאריך שהאפליקציה עצמה כותבת לכל מילה
(`stats.words[k].last`, מתעדכן בכל סבב שנסגר) — לא לפי `last_seen`, שנכתב רק
בהקלדת סיסמה (תוקן בלקוח ב-store.js:46-63 touchSeen, אבל שורות ישנות ריקות).
המקסימום על שני ה-lang, כמו ב-pick_lapsed.

הפלט שורה אחת בלבד, מספרים בלבד:
  פעילים 7 ימים: A · 30 ימים: B · מעולם לא: C · רשומים: D · מנויי דחיפה: E
«30 ימים» כולל את «7 ימים» (מצטבר). E נספר מ-push.json (שורות user_id בטבלת
push_sub) — המספר שמכריע אם push-daily מקבל לוח זמנים או מושבת.

הצעד ב-workflow רץ `if: always()`; חסר קובץ אינו מפיל את הריצה אלא נכתב במפורש.
"""
import json
import sys
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc)


def load(path):
    try:
        return json.load(open(path, encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return None


def last_practice(progress):
    """לכל user_id: חותמת התרגול המאוחרת ביותר (מילישניות), על פני כל השפות."""
    last = {}
    for row in progress or []:
        uid = row.get('user_id')
        st = row.get('stats') or (row.get('data') or {}).get('stats') or {}
        for r in (st.get('words') or {}).values():
            if not isinstance(r, dict):
                continue
            try:
                t = int(r.get('last') or 0)
            except (TypeError, ValueError):
                continue
            if t > last.get(uid, 0):
                last[uid] = t
    return last


def line(profiles, progress, subs):
    last = last_practice(progress)
    a = b = c = 0
    for p in profiles or []:
        t = last.get(p.get('id'), 0)
        if not t:
            c += 1
            continue
        days = (NOW - datetime.fromtimestamp(t / 1000, timezone.utc)).total_seconds() / 86400
        if days <= 7:
            a += 1
        if days <= 30:
            b += 1
    d = len(profiles or [])
    e = '?' if subs is None else len(subs)
    return ('פעילים 7 ימים: %d · '
            '30 ימים: %d · '
            'מעולם לא: %d · '
            'רשומים: %d · '
            'מנויי דחיפה: %s') % (a, b, c, d, e)


def _selftest():
    """ארבעה משתמשים סינתטיים — כל דלי מיוצג."""
    ms = lambda days: int((NOW.timestamp() - days * 86400) * 1000)
    profiles = [{'id': 'u1'}, {'id': 'u2'}, {'id': 'u3'}, {'id': 'u4'}]
    progress = [
        {'user_id': 'u1', 'stats': {'words': {'w': {'last': ms(2)}}}},   # פעיל השבוע
        {'user_id': 'u2', 'stats': {'words': {'w': {'last': ms(20)}}}},  # פעיל החודש בלבד
        {'user_id': 'u3', 'stats': {'words': {}}},                        # מעולם לא תרגל
        # u4 בלי שורת progress בכלל — גם הוא «מעולם לא»
    ]
    subs = [{'user_id': 'u1'}, {'user_id': 'u2'}]
    got = line(profiles, progress, subs)
    expect = ('פעילים 7 ימים: 1 · '
              '30 ימים: 2 · '
              'מעולם לא: 2 · '
              'רשומים: 4 · '
              'מנויי דחיפה: 2')
    ok = got == expect
    print(('  ✓ ' if ok else '  ✗ ') + got)
    print('בדיקה עצמית: %s' % ('1/1' if ok else '0/1 · ציפינו: ' + expect))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass
    if '--selftest' in sys.argv:
        _selftest()
    profiles = load('profiles.json')
    progress = load('progress.json')
    subs = load('push.json')
    if profiles is None:
        print('⚠ profiles.json חסר · אין מדד פעילות לריצה הזו')
        sys.exit(0)
    print(line(profiles, progress, subs))
