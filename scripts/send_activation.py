#!/usr/bin/env python3
"""שליחת מייל ההפעלה דרך Resend, ורישום מה נשלח.

DRY הוא ברירת המחדל. מייל שיצא ל-12 אנשים אמיתיים אי אפשר לבטל — הריצה היבשה מדפיסה את
הנושא לכל נמען מבלי לשלוח דבר. PREVIEW שולח לכתובת אחת בלבד ואינו מסמן שום שורה, כדי
לראות את המייל בתיבה אמיתית (עברית לא נשברת, לא נוחת בספאם) לפני שהוא מגיע למישהו אחר.

הרישום ב-profiles (nudge_last_sent, nudge_count) קורה אחרי כל שליחה ולא בסוף: ריצה
שתיפול באמצע לא תשלח שוב למי שכבר קיבל.

הנוסח אושר על ידי חגי (4.8.2026) ונגזר מ-HEB: מספר אמיתי (היקף המאגר), תאריך אמיתי
(סוף החלון החינמי), פעולה אחת. בלי דימוי, בלי מקף ארוך, שם פרטי בלבד. זה אינו מייל
תזכורת חוזר, ולכן אין שורת "כבה בהגדרות" — רק הסרה בהשבה למייל.
"""
import json, os, sys, html, urllib.request, urllib.error
from datetime import datetime, timezone

DRY = os.environ.get('DRY', 'true') != 'false'
RESEND = os.environ.get('RESEND', '')
BASE = os.environ.get('URL') or 'https://oycypbnzcvtjliovfsxn.supabase.co'
KEY = os.environ.get('KEY', '')
FROM = '800+ <noreply@800-plus.com>'
APP = 'https://800-plus.com'
# ⛔ כאן ישב היקף המאגר, והוא הוסר. חגי פסל אותו שלוש פעמים, האחרונה ב-27.8.2026:
# "מספר המילים לא משנה, זה לא הקלף שאנחנו משחקים עליו".
# ⚠ וההערה על שורת הנושא כאן כבר אמרה "ולכן גם אין כאן מספר" · בזמן שגוף המייל
# המשיך לרנדר אותו. תיקון חצי, ששרד כי איש לא בדק את הצד השני.
# ⛔ אין להחזיר מספר היקף בלי הכרעה שלו.
# ⛔ שורת הנושא הבטיחה "פתוח וחינם עד ה-30.08" והמייל יוצא בראשון 30.8 עצמו —
# הבטחה שנגמרת ביום שבו היא נקראת. חגי הכריע ב-26.8.2026 להוריד אותה.
# ⛔ ואין להחזיר תאריך חדש בלי הכרעה שלו: זו התחייבות מול נרשמים אמיתיים.
#
# ⭐ ולמה דווקא הניסוח הזה. הנוסח הראשון שהצעתי נשען על היקף המאגר, וחגי פסל:
# "מספר המילים לא משנה, זה לא הקלף שאנחנו משחקים עליו" (26.8.2026). הקלף הוא
# העובדה עצמה — נרשמת ולא התחלת — וזה הדבר היחיד שנכון לכל נמען ברשימה הזאת,
# כי לאיש מהם אין עדיין מספר אישי. ⛔ ולכן גם אין כאן מספר: מספר שאינו שלו
# הופך מייל אישי להודעה שיווקית.
SUBJECT = 'נרשמת ל-800+ ועוד לא התחלת'

picked = json.load(open('activation.json', encoding='utf-8'))
if not picked:
    print('אין למי לשלוח'); sys.exit(0)

# PREVIEW מחליף את כל הרשימה בנמען אחד — אין מצב של גם תצוגה מקדימה וגם שליחה אמיתית.
# id=None ולכן שום שורה ב-profiles לא מסומנת.
PREVIEW = (os.environ.get('PREVIEW') or '').strip()
if PREVIEW:
    picked = [{'id': None, 'email': PREVIEW, 'name': picked[0].get('name', ''), 'count': 0}]
    print('תצוגה מקדימה בלבד — נמען אחד: %s' % PREVIEW)


def post(url, payload, headers):
    # User-Agent מפורש — Cloudflare שלפני api.resend.com חוסם את ברירת המחדל של urllib
    # ב-403 שנראה בדיוק כמו מפתח פסול. ראה send_nudges.post.
    headers = dict(headers, **{'User-Agent': '800plus-activation/1.0 (+https://800-plus.com)'})
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                 headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


def body(name):
    """גוף המייל. מבנה זהה ל-send_nudges.body (טבלה ולא div, כי Outlook מתעלם מ-flex),
    אבל התוכן הוא הפעלה ולא תזכורת: אין 'מילים לחיזוק' כי אין לקהל הזה התקדמות."""
    # שם פרטי בלבד; המשתמש בחר אותו ולכן html.escape מונע ש-< או " ישברו את המייל.
    first = (name or '').split()[0] if (name or '').strip() else ''
    hello = ('שלום %s,' % html.escape(first)) if first else 'שלום,'
    return f"""<div dir="rtl" style="margin:0;padding:24px 12px;background:#f4ede2;
     font-family:'Segoe UI',system-ui,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
       width="520" style="width:520px;max-width:100%;background:#fffdf8;border:1px solid #e8ddcb;
       border-radius:16px;overflow:hidden">
  <tr><td style="padding:26px 30px 0;text-align:center">
    <!-- dir="ltr" ולא רק עיצוב: בתוך בלוק RTL הסימן + הוא תו נייטרלי, והוא נדחף לצד
         השני — הלוגו יצא "‎+800". index.html פותר את זה ב-<bdi>, אבל bdi אינו נתמך
         באופן אחיד בלקוחות מייל, ו-dir הוא המקבילה שכולם מכבדים. -->
    <div dir="ltr" style="font-size:15px;font-weight:700;letter-spacing:5px;color:#b5651d">800+</div>
  </td></tr>

  <tr><td style="padding:22px 30px 0;text-align:right">
    <!-- ⭐ השורה שמתחת אמרה "פתחת חשבון ל-800+ ועוד לא התחלת לתרגל" — וזה בדיוק
         מה ששורת הנושא אומרת עכשיו. חזרה מילה במילה על מה שהנמען כבר קרא בתיבה
         היא המשפט הראשון שגורם לו לסגור. במקומה עובדה שמקדמת: 20 הוא ברירת המחדל
         של סבב תרגול (app.js · askSize · LS.get('hw_size', 20)), לא הערכה. -->
    <p style="margin:0;font-size:15px;line-height:1.7;color:#2c2823">{hello}</p>
  </td></tr>

  <!-- ⭐ 20 ולא היקף המאגר. זה גודל סבב ברירת המחדל (app.js · askSize ·
       LS.get('hw_size', 20)), כלומר מספר שנוגע ללומד הזה ולא לגודל המוצר.
       הוא גם מה שהמשפט למעלה מבטיח, ולכן הכרטיס מראה אותו במקום לחזור עליו. -->
  <tr><td style="padding:18px 30px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#fdf2e6;border:1px solid #f0dcc4;border-radius:13px">
      <tr><td style="padding:20px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;
             font-weight:700;color:#a63c26">20</div>
        <div style="margin-top:7px;font-size:13px;letter-spacing:1px;color:#8d8274">מילים בסבב הראשון</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- ⛔ כאן ישבה השורה "כל אוצר המילים פתוח וחינם, עד ה-30.08". הוסרה ב-26.8.2026
       בהכרעת חגי: המייל יוצא בראשון 30.8, והשורה הבטיחה חלון שנסגר באותו יום.
       והמספר למעלה הוא מה שמצדיק את המייל, והוא נכון לכל נמען. -->

  <!-- הכפתור כהה על בהיר: לבן על כתום בהיר נופל מתחת ליחס הניגודיות. ראה send_nudges. -->
  <tr><td style="padding:24px 30px 28px;text-align:center">
    <a href="{APP}" style="background:#f6a51f;color:#3a2205;text-decoration:none;
       font-size:17px;font-weight:700;padding:15px 40px;border-radius:12px;
       display:inline-block">תרגל עכשיו</a>
  </td></tr>

  <tr><td style="padding:0 30px 24px">
    <p style="margin:0;padding-top:16px;border-top:1px solid #eee4d5;
       font-size:12px;line-height:1.7;color:#9a8f80;text-align:center">
      להסרה השב למייל הזה במילה "הסר"
    </p>
  </td></tr>
</table>
</div>"""


def mask(e):
    e = str(e or '')
    a, _, b = e.partition('@')
    return (a[:3] + '***@' + b) if b else '***'


sent = failed = 0
for x in picked:
    if DRY:
        print('[יבש] %-24s | %s' % (mask(x['email']), SUBJECT)); sent += 1; continue
    try:
        st, resp = post('https://api.resend.com/emails',
                        {'from': FROM, 'to': [x['email']], 'subject': SUBJECT,
                         'html': body(x['name']),
                         # reply_to לתיבה מנוטרת: תשובת "הסר" אל noreply נעלמת.
                         'reply_to': 'admin@800-plus.com',
                         'headers': {'List-Unsubscribe': '<mailto:admin@800-plus.com?subject=הסר>'}},
                        {'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json'})
        if st >= 300:
            print('✗ %s — HTTP %s %s' % (mask(x['email']), st, resp[:400])); failed += 1; continue
        if x.get('id') is None:
            sent += 1; print('✓ %s (תצוגה מקדימה — לא נרשם)' % mask(x['email'])); continue
        # מסומן מיד: ריצה שתיפול באמצע לא תשלח שוב למי שכבר קיבל.
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
            print('::warning::נשלח ל-%s אך הרישום נכשל (%s) — עלול לקבל שוב' % (mask(x['email']), e.code))
        sent += 1
        print('✓ %s' % mask(x['email']))
    except Exception as e:
        print('✗ %s — %s' % (mask(x['email']), e)); failed += 1

print('\n%s: %d נשלחו, %d נכשלו' % ('ריצה יבשה' if DRY else 'נשלח', sent, failed))
if failed and not DRY:
    sys.exit(1)
