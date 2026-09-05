#!/usr/bin/env python3
"""מי מקבל את מייל ההפעלה: מי שנרשם ולא פתח את האפליקציה מעולם.

זה קהל אחר לגמרי מהתזכורת השבועית (pick_nudges.py). שם התנאי המכריע הוא "יש לו מה
לחזק" — מספר אמיתי של מילים שנפגשו ועדיין לא ברמה 3. למי שלא פתח מעולם אין מספר כזה,
אין לו התקדמות, ולכן pick_nudges פוסל אותו במפורש (n<5). המייל כאן אינו תזכורת אלא
הזמנה ראשונה, והמספר שמצדיק אותו הוא היקף המאגר והחלון החינמי — לא מילים לחיזוק.

⛔ `last_seen` ריק אינו אומר "לא פתח מעולם", וזה נמדד
------------------------------------------------------
השדה נכתב ב-`store.js` בתוך `signIn` בלבד, כלומר רק כשמישהו מקליד סיסמה. הלקוח מוגדר
`persistSession: true`, ולכן מי שנכנס פעם אחת במכשיר חוזר אליו לנצח בלי לעבור שם שוב.
בפועל השדה מדד "מתי הוקלדה סיסמה בפעם האחרונה".

⭐ עדכון 27.8.2026: `last_seen` תוקן בלקוח (`store.js:46-63` touchSeen, נקרא מ-signIn
ומ-`app.js:5711` בכל טעינה) — מעכשיו הוא מתעדכן גם בלי הקלדת סיסמה. אבל שורות
שקדמו ל-2026-08-27 נשארו ריקות, ולכן האות השני עדיין הכרחי לקהל הקיים.

לומד פעיל עם `last_seen` ריק נבחר כאן למייל "נרשמת ולא פתחת", **ובאותו יום נבחר גם
לתזכורת השבועית** — שתי הודעות סותרות, שעה זו מזו. ‏`activation-email.yml` מבטיח
במפורש שזה בלתי אפשרי; ההבטחה נשענה על אותה הנחה שגויה.

⭐ לכן התנאי כאן אינו `last_seen` לבדו אלא **שני אותות שחייבים להסכים**: אין `last_seen`
**וגם** אין ולו מילה אחת שנפגשה. השני הוא זה שאפשר לסמוך עליו — הוא נמדד מאותם נתונים
שהאפליקציה מציגה, בדיוק כמו ב-`pick_nudges`.

⛔ ובלי `progress.json` אי אפשר לבדוק את האות השני, ולכן הסקריפט **נופל** ואינו שולח.
ריצה ירוקה שלא שולחת כלום היא הכשל שאיש אינו מבחין בו במשך חודשים; ריצה אדומה נראית.

התנאים, וכל אחד למה:
  · לא נכנס מעולם (last_seen ריק)   — מי שכבר פתח ראה את האפליקציה; אין מה "להפעיל".
  · ואין לו אף מילה שנפגשה           — האות שאפשר לסמוך עליו. ראה למעלה.
  · יש כתובת                        — הערוץ היחיד אליו.
  · לא ויתר (nudge_optout)          — הסכמה. בלעדיה זה ספאם.
  · לא כתובת בדיקה                   — mailinator וכו' הן כתובות זמניות; שליחה אליהן בזבוז
                                       ופוגעת בשיעור המסירה של הדומיין.
  · לא קיבל מאיתנו בשבעה ימים        — הפעלה ידנית כפולה לא תשלח למישהו פעמיים.

כל שורה שנפסלת מודפסת עם הסיבה, כמו ב-pick_nudges: מי שרואה 0 נמענים צריך לדעת אם זה
כי כולם כבר פתחו או כי משהו שבור.
"""
import json, os, sys
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



def mask(e):
    """המאגר פומבי, ולוג פומבי הוא פרסום — ראה pick_nudges.mask."""
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


profiles = json.load(open('profiles.json', encoding='utf-8'))

# ⛔ נופלים, לא ממשיכים. בלי הקובץ הזה אי אפשר להבדיל בין "לא פתח מעולם" לבין
# "פתח, ופשוט אין לו last_seen" — ושליחה במצב הזה מגיעה ללומדים פעילים.
try:
    progress = json.load(open('progress.json', encoding='utf-8'))
except FileNotFoundError:
    sys.exit('⛔ progress.json חסר · אי אפשר לוודא מי באמת לא פתח, ולכן לא נשלח כלום.\n'
             '   הוסף ל-.github/workflows/activation-email.yml, בצעד "מי אמור לקבל",\n'
             '   מיד אחרי המשיכה של profiles ולפני הרצת הסקריפט:\n'
             '     curl -sS -o progress.json "${H[@]}" \\\n'
             '       "$BASE/rest/v1/progress?select=user_id,stats:data->stats"\n'
             '   זו אותה שאילתה שכבר קיימת ב-weekly-nudge.yml, בלי exam ובלי lang.')

# כמה מילים בכלל נפגשו · **לא** "מילים לחיזוק". כאן די בכך שנגעו במילה אחת כדי לדעת
# שהאפליקציה נפתחה, ולכן אין סינון לפי level כמו ב-pick_nudges.
met = {}
for row in progress:
    uid = row.get('user_id')
    st = row.get('stats') or (row.get('data') or {}).get('stats') or {}
    words = st.get('words') or {}
    n = 0
    for r in words.values():
        if not isinstance(r, dict):
            continue
        try:
            if int(r.get('seen') or 0) > 0:
                n += 1
        except (TypeError, ValueError):
            continue
    met[uid] = met.get(uid, 0) + n

picked, skipped = [], {}


def skip(why):
    skipped[why] = skipped.get(why, 0) + 1


for p in profiles:
    email = (p.get('email') or '').strip()
    if not email:
        skip('אין כתובת');                                  continue
    if p.get('last_seen'):
        skip('כבר נכנס');                                   continue
    # ⭐ האות השני. `last_seen` ריק אינו מספיק — ראה ההסבר בראש הקובץ.
    n_met = met.get(p.get('id'), 0)
    if n_met:
        skip('פתח ותרגל · %d מילים' % n_met);                continue
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
