#!/usr/bin/env python3
"""מי אמור לקבל את התזכורת השבועית, ולמה בדיוק.

הבחירה יושבת כאן ולא ב-YAML בכוונה: היא הדבר היחיד ב-workflow הזה שאפשר לטעות בו בשקט.
שאילתה שמחזירה יותר מדי אנשים שולחת מייל למי שביקש שלא, ושאילתה שמחזירה מעט מדי לא
מפילה כלום ופשוט לא עושה כלום — וזה הכשל שלא מבחינים בו במשך חודשים.

כל שורה שנפסלת מודפסת עם הסיבה. מי שיסתכל על הלוג ויראה 0 נמענים צריך לדעת אם זה כי
כולם פעילים או כי הכול שבור.
"""
import json, os, sys
from datetime import datetime, timezone, timedelta

NOW = datetime.now(timezone.utc)
QUIET_DAYS = 7      # לא נכנס שבוע
COOLDOWN_DAYS = 7   # ולא קיבל מאיתנו שבוע
MAX_NUDGES = 4      # וגם לא ארבע פעמים כבר

def ts(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except Exception:
        return None

def mask(e):
    """הלוגים של Actions גלויים לכל מי שרואה את המאגר, והמאגר הזה פומבי. כתובת מלאה לצד
    מספר המילים לחיזוק היא פרופיל התקדמות מקושר לזהות. שלושה תווים מספיקים כדי לזהות שורה
    בזמן ניפוי, ואינם מספיקים כדי לכתוב למישהו."""
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


def days_since(v):
    t = ts(v)
    # round ולא floor: החותמת מהריצה הקודמת מאוחרת משעת ה-cron (06:00Z), ולכן
    # floor הפך 6 ימים ו-22 שעות ל-6 < 7 ופסל 55 מ-59 נמענים ב-30.8.
    return None if t is None else round((NOW - t).total_seconds() / 86400)


def _selftest(broken=False):
    """ארבעה מקרים שמסמרים את העיגול: 6 ימים ו-22 שעות חייבים להיחשב 7.
    הגרסה הישנה ((NOW-t).days) עיגלה כלפי מטה ופסלה 55 מ-59 נמענים ב-30.8."""
    from datetime import timedelta
    cases = [
        ('6 ימים ו-22 שעות', NOW - timedelta(days=6, hours=22), 7),
        ('6 ימים בדיוק', NOW - timedelta(days=6), 6),
        ('7 ימים ושעתיים', NOW - timedelta(days=7, hours=2), 7),
        ('אין תאריך', None, None),
    ]
    if broken:
        # שן: מזריקים ציפייה שגויה כדי להוכיח שהבדיקה עצמה מסוגלת ליפול.
        cases[0] = (cases[0][0] + ' · שן', cases[0][1], 6)
    ok = 0
    for name, t, want in cases:
        got = days_since(t.isoformat() if t is not None else None)
        if got == want:
            ok += 1
            print('  ✓ %s → %s' % (name, got))
        else:
            print('  ✗ %s → %s (ציפינו %s)' % (name, got, want))
    print('בדיקה עצמית: %d/%d' % (ok, len(cases)))
    sys.exit(0 if ok == len(cases) else 1)


if '--selftest' in sys.argv:
    # קונסולת Windows מקומית היא cp1252; ה-CI ממילא utf-8.
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    _selftest('--break' in sys.argv)


profiles = json.load(open('profiles.json', encoding='utf-8'))
progress = json.load(open('progress.json', encoding='utf-8'))

# כמה מילים "עומדות ליפול" לכל אדם: נפגשו, ועדיין לא ברמה 3. זה בדיוק המספר שהמייל
# מבטיח, ולכן הוא נמדד מאותם נתונים שהאפליקציה מציגה ולא ממונה נפרד.
weak = {}
# תאריך המבחן רוכב על extras ומסונכרן לענן (app.js: collectExtras). הוא לכל אדם ולא לכל
# שפה, ולכן מספיק למצוא אותו באחת השורות. בלעדיו אין משפט על המבחן — לא נחש ולא ברירת
# מחדל: "נשארו לך X ימים" למי שלא הזין תאריך הוא מספר שהומצא.
exam = {}
for row in progress:
    uid = row.get('user_id')
    # השאילתה מושכת רק stats ו-extras.exam, ולא את data כולו — ראה weekly-nudge.yml.
    # ה-fallback ל-data נשאר כדי שגיבוי ישן או הרצה ידנית מול קובץ מלא ימשיכו לעבוד.
    ex = row.get('exam') or ((row.get('data') or {}).get('extras') or {}).get('exam')
    if ex and uid not in exam:
        exam[uid] = str(ex)
    st = row.get('stats') or (row.get('data') or {}).get('stats') or {}
    words = st.get('words') or {}
    n = 0
    for r in words.values():
        if not isinstance(r, dict) or r.get('src') == 'lv':
            continue
        try:
            if int(r.get('seen') or 0) > 0 and int(r.get('level') or 0) < 3:
                n += 1
        except (TypeError, ValueError):
            continue
    weak[uid] = weak.get(uid, 0) + n

picked, skipped = [], {}
def skip(why):
    skipped[why] = skipped.get(why, 0) + 1

for p in profiles:
    email = (p.get('email') or '').strip()
    if not email:
        skip('אין כתובת');                                   continue
    if p.get('nudge_optout'):
        skip('ביקש לא לקבל');                                continue
    if (p.get('nudge_count') or 0) >= MAX_NUDGES:
        skip('כבר קיבל %d' % MAX_NUDGES);                    continue
    d = days_since(p.get('nudge_last_sent'))
    if d is not None and d < COOLDOWN_DAYS:
        skip('קיבל לפני %d ימים' % d);                        continue
    seen = days_since(p.get('last_seen'))
    if seen is not None and seen < QUIET_DAYS:
        skip('נכנס לפני %d ימים' % seen);                     continue
    n = weak.get(p.get('id'), 0)
    if n < 5:
        # פחות מחמש אינו "עומדות ליפול" אלא רעש, ומייל על שלוש מילים שוחק את המייל הבא.
        skip('רק %d מילים לחיזוק' % n);                       continue
    # ימים עד המבחן. None כשאין תאריך, וגם כשהתאריך כבר עבר — "נשארו לך 4- ימים" הוא
    # בדיוק סוג המשפט ששולח אדם למחוק את המייל ולסמן אותו כספאם.
    days = None
    d0 = ts(exam.get(p.get('id')))
    if d0 is not None:
        k = (d0.date() - NOW.date()).days
        if 0 <= k <= 400:
            days = k
    picked.append({'id': p['id'], 'email': email, 'days': days,
                   'name': (p.get('username') or '').strip(), 'weak': n,
                   # נישא הלאה כדי שהשליחה תוכל להעלות אותו באחד. PostgREST אינו יודע
                   # להגדיל שדה במקום, ולכן הערך החדש מחושב כאן ולא בשרת.
                   'count': int(p.get('nudge_count') or 0)})

picked.sort(key=lambda x: -x['weak'])
json.dump(picked, open('nudges.json', 'w', encoding='utf-8'), ensure_ascii=False)

print('נבחרו %d מתוך %d פרופילים' % (len(picked), len(profiles)))
for why, n in sorted(skipped.items(), key=lambda kv: -kv[1]):
    print('  נפסלו %3d — %s' % (n, why))
for x in picked:
    # התאריך מודפס גם כשהוא חסר. "אין תאריך" הוא המידע שמסביר למה המייל של אדם מסוים
    # יצא בלי שורת המבחן, ובלעדיו ההבדל בין שני מיילים נראה כתקלה.
    when = ('%d ימים עד המבחן' % x['days']) if x['days'] is not None else 'אין תאריך מבחן'
    print('  → %s · %d מילים לחיזוק · %s' % (mask(x['email']), x['weak'], when))

with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f:
    f.write('count=%d\n' % len(picked))
