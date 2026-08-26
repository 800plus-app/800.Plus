#!/usr/bin/env python3
"""שליחת המייל השלישי · למי שפתח, תרגל מעט, ולא חזר.

⛔ DRY_RUN הוא ברירת המחדל, מאותה סיבה שב-send_nudges: מייל שיצא אי אפשר לבטל.

מה שונה כאן, ולמה
-----------------
זה **לא** «לא נכנסת הרבה זמן». חגי פסל את הניסוח הזה במפורש, וב-1.8.2026 הוא ביטל
לגמרי מייל שנשען על היעדר פעילות: היעדר אינו מספר, הוא תירוץ.

⭐ לכן המייל אינו מזכיר את השקט **בכלל**. הוא אומר שני מספרים אמיתיים · כמה מילים
הלומד תרגל, וכמה מהן עדיין לחיזוק · ונגמר. השקט הוא מה שקבע שהוא נשלח, לא מה שכתוב בו.

⛔ ומה שהיה נכנס בקלות ונפסל:
  · «לא נכנסת מאז ה-12 בחודש»      — האשמה, ואת התאריך הוא יודע לבד
  · «חבל שעצרת»                     — רגש במקום מידע (HEB §1)
  · «המילים שלך מחכות לך»           — האנשה. מילה אינה מחכה (HEB §1ב)
  · «רק 3 מילים ואתה מסודר»         — הבטחה שאיננו יכולים לקיים
"""
import json, os, sys, html, urllib.request, urllib.error
from datetime import datetime, timezone

DRY = os.environ.get('DRY', 'true') != 'false'
RESEND = os.environ.get('RESEND', '')
BASE = os.environ.get('URL') or 'https://oycypbnzcvtjliovfsxn.supabase.co'
KEY = os.environ.get('KEY', '')
FROM = '800+ <noreply@800-plus.com>'
APP = 'https://800-plus.com'

picked = json.load(open('lapsed.json', encoding='utf-8'))
if not picked:
    print('אין למי לשלוח'); sys.exit(0)

# ראה send_nudges — כתובת אחת שמחליפה את הרשימה, ולא מתווספת אליה.
# id=None ולכן שום שורה ב-profiles אינה מסומנת.
PREVIEW = (os.environ.get('PREVIEW') or '').strip()
if PREVIEW:
    p0 = picked[0]
    picked = [{'id': None, 'email': PREVIEW, 'name': p0.get('name', ''),
               'met': p0['met'], 'weak': p0['weak'], 'days': p0.get('days'), 'count': 0}]
    print('תצוגה מקדימה בלבד — נמען אחד: %s' % PREVIEW)


def post(url, payload, headers):
    # User-Agent מפורש · ברירת המחדל של urllib נחסמת ב-Cloudflare שלפני Resend.
    # ההסבר המלא ב-send_nudges.post, וזה אותו כשל בדיוק.
    headers = dict(headers, **{'User-Agent': '800plus-lapsed/1.0 (+https://800-plus.com)'})
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                 headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')


def subject(met, weak, days=None):
    """שורת הנושא · שני מספרים אמיתיים, ואף מילה על השקט.

    כשיש תאריך מבחן הוא גובר על מספר המילים שתורגלו: תאריך שהלומד הזין בעצמו הוא
    המידע החזק ביותר שיש לנו עליו. כשאין תאריך, «תרגלת N» הוא מה שמבדיל את המייל
    הזה מהתזכורת השבועית · הוא פותח במה שהלומד עשה, לא במה שחסר.
    """
    if days == 0:
        return '%d מילים לחיזוק · המבחן היום' % weak
    if days == 1:
        return '%d מילים לחיזוק · המבחן מחר' % weak
    if days:
        return '%d מילים לחיזוק · %d ימים עד המבחן' % (weak, days)
    return 'תרגלת %d מילים · %d מהן לחיזוק' % (met, weak)


def body(name, met, weak, days=None):
    """גוף המייל.

    המבנה זהה ל-send_nudges במכוון · אותה טבלה ברוחב קבוע (Outlook מתעלם מ-flex
    וממ-max-width על div), אותו dir="ltr" על הלוגו כדי ש-800+ לא יתהפך ל-‎+800,
    ואותו כפתור כהה-על-בהיר שעומד ביחס הניגודיות.

    ⭐ ההבדל היחיד בתוכן הוא השורה הפותחת. בתזכורת היא «שמנו לב שיש לך»; כאן היא
    מה שהלומד **עשה**. זו כל הנקודה של המייל הזה.
    """
    # שם פרטי בלבד · «שלום פז אברהמי,» קורא כמו מכתב מחברת ביטוח.
    # html.escape כי השם נבחר על ידי המשתמש ונדחף לתוך HTML.
    first = (name or '').split()[0] if (name or '').strip() else ''
    hello = ('שלום %s,' % html.escape(first)) if first else 'שלום,'
    # «1 ימים» אינו עברית, וזה ההבדל בין תזכורת אישית להודעה אוטומטית.
    if days == 0:      when = 'המבחן היום'
    elif days == 1:    when = 'המבחן מחר'
    elif days == 2:    when = 'נשארו לך יומיים עד המבחן'
    elif days:         when = 'נשארו לך %d ימים עד המבחן' % days
    else:              when = None
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
    <!-- dir="ltr": בתוך בלוק RTL הסימן + נדחף לצד השני והלוגו יוצא "+800". -->
    <div dir="ltr" style="font-size:15px;font-weight:700;letter-spacing:5px;color:#b5651d">800+</div>
  </td></tr>

  <tr><td style="padding:22px 30px 0;text-align:right">
    <p style="margin:0;font-size:15px;line-height:1.7;color:#2c2823">{hello}</p>
    <p style="margin:4px 0 0;font-size:15px;line-height:1.7;color:#2c2823">תרגלת {met} מילים.</p>
  </td></tr>

  <!-- המספר הוא הסיבה היחידה שהמייל מוצדק, ולכן הוא נראה ראשון ולא בתוך פסקה. -->
  <tr><td style="padding:18px 30px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:#fdf2e6;border:1px solid #f0dcc4;border-radius:13px">
      <tr><td style="padding:20px;text-align:center">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;
             font-weight:700;color:#a63c26">{weak}</div>
        <div style="margin-top:7px;font-size:13px;letter-spacing:1px;color:#8d8274">מילים לחיזוק</div>
      </td></tr>
    </table>
  </td></tr>

{exam_line}
  <tr><td style="padding:24px 30px 28px;text-align:center">
    <a href="{APP}" style="background:#f6a51f;color:#3a2205;text-decoration:none;
       font-size:17px;font-weight:700;padding:15px 40px;border-radius:12px;
       display:inline-block">תרגל עכשיו</a>
  </td></tr>

  <tr><td style="padding:0 30px 24px">
    <p style="margin:0;padding-top:16px;border-top:1px solid #eee4d5;
       font-size:12px;line-height:1.7;color:#9a8f80;text-align:center">
      להסרה מהתזכורות השב למייל הזה במילה "הסר"
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
    subj = subject(x['met'], x['weak'], x.get('days'))
    if DRY:
        print('[יבש] %-24s | %s' % (mask(x['email']), subj)); sent += 1; continue
    try:
        st, resp = post('https://api.resend.com/emails',
                        {'from': FROM, 'to': [x['email']], 'subject': subj,
                         'html': body(x['name'], x['met'], x['weak'], x.get('days')),
                         'reply_to': 'admin@800-plus.com',
                         'headers': {'List-Unsubscribe': '<mailto:admin@800-plus.com?subject=הסר>'}},
                        {'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json'})
        if st >= 300:
            print('✗ %s — HTTP %s %s' % (mask(x['email']), st, resp[:400])); failed += 1; continue
        if x.get('id') is None:
            sent += 1; print('✓ %s (תצוגה מקדימה — לא נרשם)' % mask(x['email'])); continue
        # מסומן מיד ולא בסוף · ריצה שתיפול באמצע לא תשלח שוב למי שכבר קיבל.
        # ⚠ אותה עמודה כמו התזכורת. ראה ההערה בסוף pick_lapsed על מה שחסר כאן.
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
