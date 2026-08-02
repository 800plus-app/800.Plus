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
    picked = [{'id': None, 'email': PREVIEW, 'name': picked[0].get('name', ''),
               'weak': picked[0]['weak'], 'count': 0}]
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

def body(name, n):
    hello = ('שלום %s,' % name) if name else 'שלום,'
    # המספר הוא הסיבה היחידה שהמייל הזה מוצדק. בלעדיו זו תזכורת גנרית, ותזכורת גנרית
    # נמחקת. עם המספר זו עובדה על ההתקדמות של האדם עצמו.
    return f"""<div dir="rtl" style="font-family:system-ui,Segoe UI,Arial;line-height:1.7;color:#2c2823;max-width:520px">
  <p>{hello}</p>
  <p><b>{n} מילים</b> שכבר תרגלת עומדות ליפול לך מהזיכרון — נפגשת איתן, והן טרם התבססו.</p>
  <p>עשר דקות של חזרה ממוקדת מספיקות כדי להחזיר אותן.</p>
  <p style="margin:26px 0">
    <a href="{APP}" style="background:#b5651d;color:#fff;text-decoration:none;
       padding:13px 26px;border-radius:12px;display:inline-block">לחזור לתרגול</a>
  </p>
  <p style="font-size:.8rem;color:#8d8274;border-top:1px solid #e8e2d8;padding-top:14px">
    אפשר לכבות את התזכורת הזאת מ<a href="{APP}" style="color:#8d8274">ההגדרות באפליקציה</a>,
    או להשיב למייל הזה במילה "הסר".
  </p>
</div>"""

sent = failed = 0
for x in picked:
    subj = '%d מילים עומדות ליפול לך מהזיכרון' % x['weak']
    if DRY:
        print('[יבש] %-34s | %s' % (x['email'], subj)); sent += 1; continue
    try:
        st, resp = post('https://api.resend.com/emails',
                        {'from': FROM, 'to': [x['email']], 'subject': subj,
                         'html': body(x['name'], x['weak']),
                         # כותרת תקנית שלקוחות מייל מציגים ככפתור "בטל הרשמה". היא אינה
                         # מחליפה את הקישור בגוף — חלק מהלקוחות לא מציגים אותה בכלל.
                         'headers': {'List-Unsubscribe': '<mailto:noreply@800-plus.com?subject=הסר>'}},
                        {'Authorization': 'Bearer ' + RESEND, 'Content-Type': 'application/json'})
        if st >= 300:
            print('✗ %s — HTTP %s %s' % (x['email'], st, resp[:400])); failed += 1; continue
        # תצוגה מקדימה אינה תזכורת, ואין שורה לסמן.
        if x.get('id') is None:
            sent += 1; print('✓ %s (תצוגה מקדימה — לא נרשם)' % x['email']); continue
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
            print('::warning::נשלח ל-%s אך הרישום נכשל (%s) — עלול לקבל שוב' % (x['email'], e.code))
        sent += 1
        print('✓ %s' % x['email'])
    except Exception as e:
        print('✗ %s — %s' % (x['email'], e)); failed += 1

print('\n%s: %d נשלחו, %d נכשלו' % ('ריצה יבשה' if DRY else 'נשלח', sent, failed))
if failed and not DRY:
    sys.exit(1)
