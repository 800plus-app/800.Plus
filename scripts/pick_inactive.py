#!/usr/bin/env python3
"""מי מקבל את מייל ההפעלה: מי שנרשם ולא פתח את האפליקציה מעולם.

זה קהל אחר לגמרי מהתזכורת השבועית (pick_nudges.py). שם התנאי המכריע הוא "יש לו מה
לחזק" — מספר אמיתי של מילים שנפגשו ועדיין לא ברמה 3. למי שלא פתח מעולם אין מספר כזה,
אין לו התקדמות, ולכן pick_nudges פוסל אותו במפורש (n<5). המייל כאן אינו תזכורת אלא
הזמנה ראשונה, והמספר שמצדיק אותו הוא היקף המאגר והחלון החינמי — לא מילים לחיזוק.

התנאים, וכל אחד למה:
  · לא נכנס מעולם (last_seen ריק)   — מי שכבר פתח ראה את האפליקציה; אין מה "להפעיל".
  · יש כתובת                        — הערוץ היחיד אליו.
  · לא ויתר (nudge_optout)          — הסכמה. בלעדיה זה ספאם.
  · לא כתובת בדיקה                   — mailinator וכו' הן כתובות זמניות; שליחה אליהן בזבוז
                                       ופוגעת בשיעור המסירה של הדומיין.
  · לא קיבל מאיתנו בשבעה ימים        — הפעלה ידנית כפולה לא תשלח למישהו פעמיים.

כל שורה שנפסלת מודפסת עם הסיבה, כמו ב-pick_nudges: מי שרואה 0 נמענים צריך לדעת אם זה
כי כולם כבר פתחו או כי משהו שבור.
"""
import json, os
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc)
COOLDOWN_DAYS = 7
# דומיינים של כתובות זמניות/בדיקה. שליחה אליהן אינה מגיעה לאדם אמיתי.
TEST_DOMAINS = {'mailinator.com', 'example.com', 'test.com'}


def ts(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except Exception:
        return None


def days_since(v):
    t = ts(v)
    return None if t is None else (NOW - t).days


def mask(e):
    """המאגר פומבי, ולוג פומבי הוא פרסום — ראה pick_nudges.mask."""
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


profiles = json.load(open('profiles.json', encoding='utf-8'))
picked, skipped = [], {}


def skip(why):
    skipped[why] = skipped.get(why, 0) + 1


for p in profiles:
    email = (p.get('email') or '').strip()
    if not email:
        skip('אין כתובת');                                  continue
    if p.get('last_seen'):
        skip('כבר נכנס');                                   continue
    if p.get('nudge_optout'):
        skip('ביקש לא לקבל');                               continue
    if email.rpartition('@')[2].lower() in TEST_DOMAINS:
        skip('כתובת בדיקה');                                continue
    d = days_since(p.get('nudge_last_sent'))
    if d is not None and d < COOLDOWN_DAYS:
        skip('קיבל לפני %d ימים' % d);                       continue
    picked.append({'id': p['id'], 'email': email,
                   'name': (p.get('username') or '').strip(),
                   # נישא הלאה כדי שהשליחה תעלה אותו באחד — PostgREST אינו מגדיל שדה בשרת.
                   'count': int(p.get('nudge_count') or 0)})

json.dump(picked, open('activation.json', 'w', encoding='utf-8'), ensure_ascii=False)

print('נבחרו %d מתוך %d פרופילים' % (len(picked), len(profiles)))
for why, n in sorted(skipped.items(), key=lambda kv: -kv[1]):
    print('  נפסלו %3d — %s' % (n, why))
for x in picked:
    print('  → %s' % mask(x['email']))

with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f:
    f.write('count=%d\n' % len(picked))
