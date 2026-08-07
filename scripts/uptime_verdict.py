# -*- coding: utf-8 -*-
"""ההכרעה על טבלת uptime_log של migrations/16.sql. מדפיס שורת התרעה, או כלום.

יושב בקובץ נפרד ולא בתוך ה-workflow משתי סיבות:
 1. **אפשר להריץ אותו מקומית.** לוגיקה שיושבת בתוך YAML נבדקת רק בייצור, וזה בדיוק
    הדפוס שהקובץ הזה נועד למנוע.
 2. `jq` קיים ברנר של GitHub ולא במחשב, ולכן הוא לא היה ניתן לבדיקה לפני דחיפה.

שתי שאלות, והשנייה היא העיקר:
 · **מה הטבלה מדווחת** — שלוש תוצאות אחרונות כושלות = האתר נפל.
 · **האם היא בכלל מתעדכנת** — שורה אחרונה בת יותר מ-30 דקות (שש ריצות שהוחמצו)
   אומרת ש**הבודק עצמו מת**. זה מה ש-16.sql מבקש לתפוס בהערה שלו, וזה גם הכשל
   שכל uptime.yml עוסק בו: מוניטור שהפסיק לנטר בשקט.
"""
import io, json, sys
from datetime import datetime, timezone

STALE_MIN = 30          # שש ריצות של 5 דקות. פחות מזה הוא רעש.
NEED_BAD = 3            # שלוש תוצאות רצופות, כמו בבדיקת ה-probe שמעל


def parse(ts):
    """timestamptz של סופאבייס. Z ו-offset שניהם מופיעים, ולכן שניהם מטופלים."""
    s = str(ts or '').strip().replace('Z', '+00:00')
    # מיקרו-שניות בסופאבייס יכולות להיות באורך משתנה; fromisoformat דורש 3 או 6.
    if '.' in s:
        head, _, tail = s.partition('.')
        digits = ''.join(c for c in tail if c.isdigit())
        rest = tail[len(digits):]
        s = head + '.' + (digits + '000000')[:6] + rest
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def verdict(rows, now=None):
    """מחזיר מחרוזת התרעה, או '' כשאין מה להתריע."""
    if not rows:
        return ''                                  # ריק אינו תקלה — pg_cron עוד לא רץ
    now = now or datetime.now(timezone.utc)
    age = int((now - parse(rows[0].get('checked_at'))).total_seconds() // 60)
    if age > STALE_MIN:
        return 'pg_cron הפסיק לרשום — השורה האחרונה בת %d דקות' % age
    res = [r for r in rows if r.get('note') == 'תוצאה'][:NEED_BAD]
    if len(res) >= NEED_BAD and all(r.get('ok') is False for r in res):
        return 'האתר נפל לפי pg_cron — שלוש בדיקות רצופות כשלו'
    return ''


def selftest():
    """שמונה מצבים. `python3 scripts/uptime_verdict.py --selftest`

    יושב כאן ולא בהודעת קומיט: הוכחה שאפשר להריץ מחדש היא הוכחה, והוכחה שנכתבה
    פעם אחת בטקסט נשכחת בשינוי הבא."""
    from datetime import timedelta
    now = datetime(2026, 8, 7, 20, 0, 0, tzinfo=timezone.utc)

    def T(m):
        return (now - timedelta(minutes=m)).isoformat().replace('+00:00', 'Z')

    def R(m, ok=None, note='תוצאה'):
        return {'checked_at': T(m), 'ok': ok, 'note': note}

    cases = [
        ('טבלה ריקה', [], False),
        ('שלוש הצלחות', [R(1, True), R(6, True), R(11, True)], False),
        ('נפילה אחת', [R(1, False), R(6, True), R(11, True)], False),
        ('שתי נפילות', [R(1, False), R(6, False), R(11, True)], False),
        ('שלוש נפילות רצופות', [R(1, False), R(6, False), R(11, False)], True),
        ('הבודק מת · 95 דקות', [R(95, True), R(100, True)], True),
        ('שורות בקשה בלבד', [R(1, None, '812'), R(6, None, '811')], False),
        ('מיקרו-שניות חריגות',
         [{'checked_at': '2026-08-07T19:59:00.12345+00:00', 'ok': True, 'note': 'תוצאה'}], False),
    ]
    bad = 0
    for name, rows, want in cases:
        got = bool(verdict(rows, now=now))
        ok = got == want
        bad += 0 if ok else 1
        sys.stdout.write('%s %-24s %s\n' % ('✅' if ok else '⛔', name,
                                            verdict(rows, now=now) or 'שקט'))
    sys.stdout.write('%d/%d עברו\n' % (len(cases) - bad, len(cases)))
    return 1 if bad else 0


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        sys.exit(selftest())
    rows = json.load(io.open(sys.argv[1] if len(sys.argv) > 1 else 'log.json', encoding='utf-8'))
    a = verdict(rows)
    if rows:
        age = int((datetime.now(timezone.utc) - parse(rows[0]['checked_at'])).total_seconds() // 60)
        sys.stderr.write('%d שורות · האחרונה בת %d דקות\n' % (len(rows), age))
    sys.stdout.write(a)
