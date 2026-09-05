#!/usr/bin/env python3
"""מי מקבל את המייל השלישי: מי שפתח, תרגל מעט, ולא חזר.

הקהל שלא היה שייך לאף אחד
-------------------------
שני הבוררים הקיימים מכסים את שני הקצוות ומשאירים חור באמצע:

  pick_inactive  → מי שלא פתח מעולם            (אין לו אף מילה שנפגשה)
  pick_nudges    → מי שיש לו 5 מילים לחיזוק ומעלה
  ⛔ באמצע       → פתח, תרגל שלוש מילים, ונעלם  · לא מקבל כלום

מייל ההפעלה יגיד לו «נרשמת ולא פתחת», וזה שקר בפניו. התזכורת חוסמת אותו מתחת לחמש,
מנימוק כתוב: «מייל על שלוש מילים שוחק את המייל הבא».

⭐ מה שמיישב את זה: **אין מייל הבא.** הקהל הזה מקבל מייל אחד, פעם אחת, ואז לעולם לא.
מייל שאינו חוזר אינו יכול לשחוק את מה שיבוא אחריו, ושלוש מילים הן דווקא היתרון כאן ·
זו כמות שאפשר לסיים בישיבה אחת, לא חוב שמצטבר.

⛔ «שקט» נמדד מהאפליקציה, לא מ-`last_seen`
------------------------------------------
`last_seen` נכתב רק כשמקלידים סיסמה, והלקוח שומר הפעלה · ולכן הוא ריק אצל לומדים
פעילים. במקומו נלקח **התאריך שהאפליקציה עצמה כותבת לכל מילה** (`stats.words[k].last`,
מתעדכן בכל סבב שנסגר). המאוחר מביניהם הוא «מתי תרגל בפעם האחרונה», והוא אינו תלוי
במסלול ההתחברות כלל.

⭐ עדכון 27.8.2026: `last_seen` תוקן בלקוח (`store.js:46-63` touchSeen, נקרא מ-signIn
ומ-`app.js:5711` בכל טעינה) — מעכשיו הוא מתעדכן גם בלי הקלדת סיסמה. אבל שורות
שקדמו ל-2026-08-27 נשארו ריקות, ולכן האות השני עדיין הכרחי לקהל הקיים, והתאריך מהאפליקציה נשאר המדד.

התנאים, וכל אחד למה:
  · תרגל לפחות מילה אחת       — אחרת הוא שייך למייל ההפעלה, לא לכאן.
  · בין 1 ל-4 מילים לחיזוק     — חמש ומעלה שייכות לתזכורת השבועית. הגבול מוחלט,
                                 ולכן שלושת הקהלים זרים זה לזה בהגדרה.
  · לא תרגל 14 יום             — ⚠ ערך שנבחר כאן ולא הוכתב. ראה QUIET_DAYS.
  · לא קיבל מאיתנו מעולם       — מייל אחד בלבד, ואין שני.
  · יש כתובת · לא ויתר · לא כתובת בדיקה
"""
import json, os, sys
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc)

# ⚠ נבחר כאן, לא הוכתב. שבוע הוא הסף של התזכורת השבועית, והוא מוקדם מדי לקהל הזה ·
# מי שתרגל שלוש מילים לפני חמישה ימים עדיין בתוך העניין. חודש כבר מאוחר. שבועיים הם
# מספיק זמן כדי שההרגל ייפסק בפועל, ומעט מספיק כדי שמה שהתחיל עדיין יהיה מוכר.
# ⛔ אם חגי מחליט אחרת — זו השורה היחידה שצריך לשנות.
QUIET_DAYS = 14
WEAK_MAX = 4        # מ-5 ומעלה זה כבר הקהל של pick_nudges. הגבול חייב להישאר צמוד לשם.
MAX_EVER = 1        # ⭐ מייל אחד לאדם, אי פעם. זה מה שמצדיק סף נמוך.

# דומיינים של כתובות זמניות/בדיקה. שליחה אליהן אינה מגיעה לאדם אמיתי.
TEST_DOMAINS = {'mailinator.com', 'example.com', 'test.com'}


def ts(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
    except Exception:
        return None


def mask(e):
    """המאגר פומבי, ולוג פומבי הוא פרסום — ראה pick_nudges.mask."""
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


profiles = json.load(open('profiles.json', encoding='utf-8'))
try:
    progress = json.load(open('progress.json', encoding='utf-8'))
except FileNotFoundError:
    sys.exit('⛔ progress.json חסר · כל שלושת התנאים של הבורר הזה נגזרים ממנו, '
             'ובלעדיו אין קהל. לא נשלח כלום.')

# שלושה מספרים לכל אדם, כולם מאותם נתונים שהאפליקציה מציגה:
#   met  · כמה מילים נפגשו בכלל          → «פתח או לא»
#   weak · נפגשו ועדיין מתחת לרמה 3      → אותו חישוב בדיוק כמו ב-pick_nudges
#   last · המאוחר מבין תאריכי התרגול     → «מתי בפעם האחרונה»
met, weak, last = {}, {}, {}
for row in progress:
    uid = row.get('user_id')
    st = row.get('stats') or (row.get('data') or {}).get('stats') or {}
    for r in (st.get('words') or {}).values():
        if not isinstance(r, dict) or r.get('src') == 'lv':
            continue
        try:
            seen = int(r.get('seen') or 0)
            lvl = int(r.get('level') or 0)
        except (TypeError, ValueError):
            continue
        if seen <= 0:
            continue
        met[uid] = met.get(uid, 0) + 1
        if lvl < 3:
            weak[uid] = weak.get(uid, 0) + 1
        try:
            # ms מאז 1970, כפי ש-app.js כותב אותו.
            t = int(r.get('last') or 0)
        except (TypeError, ValueError):
            t = 0
        if t > last.get(uid, 0):
            last[uid] = t

picked, skipped = [], {}


def skip(why):
    skipped[why] = skipped.get(why, 0) + 1


for p in profiles:
    uid = p.get('id')
    email = (p.get('email') or '').strip()
    if not email:
        skip('אין כתובת');                                     continue
    if p.get('nudge_optout'):
        skip('ביקש לא לקבל');                                  continue
    if email.rpartition('@')[2].lower() in TEST_DOMAINS:
        skip('כתובת בדיקה');                                   continue
    if (p.get('nudge_count') or 0) >= MAX_EVER:
        skip('כבר קיבל מאיתנו');                               continue
    n_met = met.get(uid, 0)
    if n_met == 0:
        skip('לא תרגל כלום · שייך למייל ההפעלה');               continue
    n_weak = weak.get(uid, 0)
    if n_weak == 0:
        skip('אין לו מה לחזק · שולט בכל מה שתרגל');             continue
    if n_weak > WEAK_MAX:
        skip('%d מילים לחיזוק · שייך לתזכורת' % n_weak);        continue
    t = last.get(uid, 0)
    if not t:
        # ⛔ בלי תאריך תרגול אי אפשר לדעת אם הוא שקט או תרגל אתמול. לא מנחשים.
        skip('אין תאריך תרגול · אי אפשר לדעת אם שקט');          continue
    days = (NOW - datetime.fromtimestamp(t / 1000, timezone.utc)).days
    if days < QUIET_DAYS:
        skip('תרגל לפני %d ימים' % days);                       continue

    # ימים עד המבחן. None כשאין תאריך וגם כשהוא עבר — «נשארו לך 4- ימים» הוא בדיוק
    # סוג המשפט ששולח אדם לסמן ספאם. אותו כלל כמו ב-pick_nudges.
    exam_days = None
    ex = None
    for row in progress:
        if row.get('user_id') != uid:
            continue
        ex = row.get('exam') or ((row.get('data') or {}).get('extras') or {}).get('exam')
        if ex:
            break
    d0 = ts(ex)
    if d0 is not None:
        k = (d0.date() - NOW.date()).days
        if 0 <= k <= 400:
            exam_days = k

    picked.append({'id': uid, 'email': email, 'name': (p.get('username') or '').strip(),
                   'met': n_met, 'weak': n_weak, 'days': exam_days,
                   'count': int(p.get('nudge_count') or 0)})

picked.sort(key=lambda x: -x['met'])
json.dump(picked, open('lapsed.json', 'w', encoding='utf-8'), ensure_ascii=False)

print('נבחרו %d מתוך %d פרופילים' % (len(picked), len(profiles)))
for why, n in sorted(skipped.items(), key=lambda kv: -kv[1]):
    print('  נפסלו %3d — %s' % (n, why))
for x in picked:
    when = ('%d ימים עד המבחן' % x['days']) if x['days'] is not None else 'אין תאריך מבחן'
    print('  → %s · תרגל %d · %d לחיזוק · %s' % (mask(x['email']), x['met'], x['weak'], when))

with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f:
    f.write('count=%d\n' % len(picked))
