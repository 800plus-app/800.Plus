#!/usr/bin/env python3
"""שליחת התזכורת השבועית דרך Resend, ורישום מה נשלח.

DRY_RUN הוא ברירת המחדל, וזה לא זהירות יתר: מייל שיצא ל-15 אנשים אמיתיים אי אפשר לבטל.
הריצה היבשה מדפיסה בדיוק את מה שהיה נשלח — כולל הנושא והשורה הראשונה — כדי שאפשר יהיה
לקרוא את הנוסח לפני שהוא מגיע למישהו.

הרישום ב-profiles קורה אחרי כל שליחה ולא בסוף: אם הריצה תיפול באמצע, מי שכבר קיבל לא
יקבל שוב בריצה הבאה. עדכון מרוכז בסוף היה מאבד את כל הרישום בכישלון אחד.
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

DRY = os.environ.get('DRY', 'true') != 'false'
RESEND = os.environ.get('RESEND', '')
BASE = os.environ.get('URL') or 'https://oycypbnzcvtjliovfsxn.supabase.co'
KEY = os.environ.get('KEY', '')
FROM = '800+ <noreply@800-plus.com>'
APP = 'https://800-plus.com'

picked = json.load(open('nudges.json', encoding='utf-8'))
if not picked:
    print('אין למי לשלוח'); sys.exit(0)

# PREVIEW — לקרוא את המייל בתיבה אמיתית לפני שהוא מגיע למישהו אחר.
# ריצה יבשה מדפיסה נושא ושורה ראשונה, וזה מספיק כדי לתפוס שגיאת נוסח אבל לא כדי לראות
# איך הכפתור נראה בג'ימייל, אם העברית לא נשברת, ואם זה נוחת בספאם. הכתובת מחליפה את כל
# הרשימה — לא מתווספת אליה — כך שהמצב "גם תצוגה מקדימה וגם שליחה אמיתית" אינו קיים.
# id=None ולכן שום שורה ב-profiles לא מסומנת: זו לא תזכורת, וספירת התזכורות לא זזה.
PREVIEW = (os.environ.get('PREVIEW') or '').strip()
if PREVIEW:
    # days נישא הלאה. בלעדיו התצוגה המקדימה הייתה מציגה מייל בלי שורת המבחן ומאשרת
    # נוסח שאיש לא יקבל — בדיוק סוג האישור שגרוע מאין אישור.
    picked = [{'id': None, 'email': PREVIEW, 'name': picked[0].get('name', ''),
               'weak': picked[0]['weak'], 'days': picked[0].get('days'), 'count': 0}]
    print('תצוגה מקדימה בלבד — נמען אחד: %s' % PREVIEW)

def post(url, payload, headers):
    # User-Agent מפורש. ברירת המחדל של urllib היא "Python-urllib/3.x", ו-Cloudflare
    # שיושב לפני api.resend.com חוסם אותה — 403 עם "error code: 1010", שנראה בדיוק כמו
    # מפתח פסול או דומיין לא מאומת. אף אחד מהם לא היה השורש.
    headers = dict(headers, **{'User-Agent': '800plus-nudge/1.0 (+https://800-plus.com)'})
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                 headers=headers, method='POST')
    # 4xx מגיע כחריגה, וגוף התשובה נזרק איתה. אצל Resend הגוף הוא כל האבחנה — "domain is
    # not verified" ו"key has no permission" שניהם 403 ונראים זהה בלעדיו. הוא מוחזר כאן
    # כדי שהלוג יגיד למה נכשל ולא רק שנכשל.
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

def subject(n, days=None):
    """שורת הנושא.

    "עומדות ליפול לך מהזיכרון" היה דימוי, ודימוי תופס את מקום המידע (HEB, חוק 1).
    "לחיזוק" הוא המונח שהאפליקציה מציגה.

    התאריך נכנס לכותרת ולא רק לגוף: הכותרת היא מה שנקרא לפני שמחליטים לפתוח, ושני
    מספרים אמיתיים בה עושים את העבודה שמילת דחיפות אחת לא עושה. כשאין תאריך אין חצי
    כותרת — יש כותרת אחרת.
    """
    if days == 0:
        return '%d מילים לחיזוק · המבחן היום' % n
    if days == 1:
        return '%d מילים לחיזוק · המבחן מחר' % n
    if days:
        return '%d מילים לחיזוק · %d ימים עד המבחן' % (n, days)
    return '%d מילים שתרגלת טרם הגיעו לשליטה' % n

def body(name, n, days=None):
    """גוף המייל.

    הלחץ שמזיז אדם הוא תאריך אמיתי שהוא בעצמו הזין, ולא ניסוח דחוף. days מגיע
    מ-pick_nudges והוא None כשלא הוזן תאריך או כשהוא כבר עבר — ואז המשפט פשוט אינו שם.
    זו הנקודה שבה קל להחליק ברירת מחדל, ומספר מומצא בשורה שכל תפקידה ללחוץ הוא הדרך
    המהירה ביותר לאבד את האמון של מי שיודע מתי המבחן שלו.

    הניסוח נגזר מהסקיל HEB, ושלושה דברים בו אינם אקראיים:

    · "מילים בשליטה" הוא המונח שהאפליקציה עצמה משתמשת בו במסך הבית ("292 מתוך 3900
      מילים כבר בשליטה"). מונח חדש למושג קיים מחייב את הקורא לתרגם.
    · המספר אינו מופנה למסך מסוים. pick_nudges סוכם את שתי השפות, ומסך הבית מציג את
      השפה הפתוחה בלבד — "תראה את זה שם" היה הבטחה שהמסך סותר.
    · "סבב חיזוק אחד מכסה עד 20 מילים" ולא "עשר דקות מספיקות". 20 הוא cap()
      ב-app.js; עשר דקות הוא ניחוש.

    עיצוב: טבלה ולא div, כי Outlook מתעלם מ-flex ומ-max-width על div, ורוחב קבוע על
    טבלה הוא הדבר היחיד שכל לקוחות המייל מכבדים.
    """
    # שם פרטי בלבד. "שלום פז אברהמי," קורא כמו מכתב מחברת ביטוח.
    first = (name or '').split()[0] if (name or '').strip() else ''
    hello = ('שלום %s,' % first) if first else 'שלום,'
    # "1 ימים" אינו עברית, ומספר שנכתב נכון הוא מה שמבדיל תזכורת אישית מהודעה אוטומטית.
    if days == 0:      when = 'המבחן היום'
    elif days == 1:    when = 'המבחן מחר'
    elif days == 2:    when = 'נשארו לך יומיים עד המבחן'
    elif days:         when = 'נשארו לך %d ימים עד המבחן' % days
    else:              when = None
    # שורה משלה ולא סיפא של פסקה. כשאין תאריך אין שורה, והמייל מסתיים במספר ובכפתור.
    exam_line = '' if when is None else f"""  <tr><td style="padding:16px 30px 0;text-align:center">
    <p style="margin:0;font-size:15px;font-weight:700;color:#a63c26">{when}</p>
  </td></tr>
"""
    return f"""<div dir="rtl" style="margin:0;padding:24px 12px;background:#f4ede2;
     font-family:'Segoe UI',system-ui,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
       width="520" style="width:520px;max-width:100%;background:#fffdf8;border:1px solid #e8ddcb;
       border-radius:16px;overflow:hidden">
  <tr><td style="padding:26px 30px 0;text-align:center">
    <div style="font-size:15px;font-weight:700;letter-spacing:5px;color:#b5651d">800+</div>
  </td></tr>

  <tr><td style="padding:22px 30px 0;text-align:right">
    <p style="margin:0;font-size:15px;line-height:1.7;color:#2c2823">{hello}</p>
    <p style="margin:4px 0 0;font-size:15px;line-height:1.7;color:#2c2823">שמנו לב שיש לך</p>
  </td></tr>

  <!-- המספר הוא הסיבה היחידה שהמייל הזה מוצדק. בלעדיו זו תזכורת גנרית, ותזכורת
       גנרית נמחקת. לכן הוא הדבר הראשון שנראה, ולא שורה בתוך פסקה. -->
  <tr><td style="padding:18px 30px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#fdf2e6;border:1px solid #f0dcc4;border-radius:13px">
      <tr><td style="padding:20px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;
             font-weight:700;color:#a63c26">{n}</div>
        <div style="margin-top:7px;font-size:13px;letter-spacing:1px;color:#8d8274">מילים לחיזוק</div>
      </td></tr>
    </table>
  </td></tr>

{exam_line}
  <!-- הכפתור בוהק ועם טקסט כהה ולא לבן. לבן על כתום בהיר יורד מתחת ליחס הניגודיות
       הנדרש, ו"בוהק" שאי אפשר לקרוא אינו בוהק. הכהה על הבהיר נותן את שניהם. -->
  <tr><td style="padding:24px 30px 28px;text-align:center">
    <a href="{APP}" style="background:#f6a51f;color:#3a2205;text-decoration:none;
       font-size:17px;font-weight:700;padding:15px 40px;border-radius:12px;
       display:inline-block">תרגל עכשיו</a>
  </td></tr>

  <tr><td style="padding:0 30px 24px">
    <p style="margin:0;padding-top:16px;border-top:1px solid #eee4d5;
       font-size:12px;line-height:1.7;color:#9a8f80;text-align:center">
      ניתן לכבות את התזכורת ב<a href="{APP}" style="color:#9a8f80">הגדרות האפליקציה</a>
      · להסרה מלאה השב למייל הזה במילה "הסר"
    </p>
  </td></tr>
</table>
</div>"""

def mask(e):
    """ראה pick_nudges.mask — המאגר פומבי, ולוג פומבי הוא פרסום."""
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


sent = failed = 0
for x in picked:
    subj = subject(x['weak'], x.get('days'))
    if DRY:
        print('[יבש] %-24s | %s' % (mask(x['email']), subj)); sent += 1; continue
    try:
        st, resp = post('https://api.resend.com/emails',
                        {'from': FROM, 'to': [x['email']], 'subject': subj,
                         'html': body(x['name'], x['weak'], x.get('days')),
                         # כותרת תקנית שלקוחות מייל מציגים ככפתור "בטל הרשמה". היא אינה
                         # מחליפה את הקישור בגוף — חלק מהלקוחות לא מציגים אותה בכלל.
                         'headers': {'List-Unsubscribe': '<mailto:noreply@800-plus.com?subject=הסר>'}},
                        {'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json'})
        if st >= 300:
            print('✗ %s — HTTP %s %s' % (mask(x['email']), st, resp[:400])); failed += 1; continue
        # תצוגה מקדימה אינה תזכורת, ואין שורה לסמן.
        if x.get('id') is None:
            sent += 1; print('✓ %s (תצוגה מקדימה — לא נרשם)' % mask(x['email'])); continue
        # מסומן מיד, לא בסוף: ריצה שתיפול באמצע לא תשלח שוב למי שכבר קיבל.
        req = urllib.request.Request(
            '%s/rest/v1/profiles?id=eq.%s' % (BASE, x['id']),
            data=json.dumps({'nudge_last_sent': datetime.now(timezone.utc).isoformat(),
                             'nudge_count': x.get('count', 0) + 1}).encode('utf-8'),
            headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY,
                     'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
            method='PATCH')
        try:
            urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as e:
            # השליחה הצליחה והרישום לא. זו בדיוק הדרך שבה מישהו מקבל שני מיילים, ולכן
            # היא נאמרת בקול ולא נבלעת.
            print('::warning::נשלח ל-%s אך הרישום נכשל (%s) — עלול לקבל שוב' % (mask(x['email']), e.code))
        sent += 1
        print('✓ %s' % mask(x['email']))
    except Exception as e:
        print('✗ %s — %s' % (mask(x['email']), e)); failed += 1

print('\n%s: %d נשלחו, %d נכשלו' % ('ריצה יבשה' if DRY else 'נשלח', sent, failed))
if failed and not DRY:
    sys.exit(1)
