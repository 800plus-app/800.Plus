# -*- coding: utf-8 -*-
"""תיקונים נקודתיים ל-16 הכשלים שנפתחו כשהפירוש הקודם הוחזר בסבב ההפרכה.

כל תיקון עונה על שתי דרישות בו-זמנית: ההסתייגות של המפריך (המשמעות המרכזית,
מה שהמקורות תומכים בו) והכלל שהשער אכף (מעגליות, ניקוד, סוגריים, מקטע משותף).
"""
import io, os, re, sys, unicodedata

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
UNITS = os.path.dirname(HERE)
ROW = re.compile(r'^(\|\s*(\d+)\s*\|)(.*?)(\|)(.*)(\|\s*)$')
NIQ = re.compile(r'[֑-ׇ]')

FIXES = {
    # (יחידה, מספר): (מילה לאימות, פירוש חדש)
    (1, 92):   ('הלך',        'פסע אנה ואנה; הטיל אימה (הילך אימים)'),
    (1, 108):  ('זקף',        'הרים, יישר; ייחס (זקף לזכותו)'),
    (1, 130):  ('משוכה',      'גדר שיחים; מכשול במסלול ריצה'),
    (1, 152):  ('סרק',        'ריק מתועלת, לשווא (אילן סרק)'),
    (2, 84):   ('פקד',        'ציווה; ביקר; אירע לו (פקד אותו אסון)'),
    (2, 108):  ('כפף',        'עיקם, הרכין'),
    (3, 150):  ('מתק',        'עריבות טעם, נועם (מתק שפתיים)'),
    (3, 154):  ('דשן',        'שמן, בעל שומן רב (ארוחה דשנה)'),
    (5, 108):  ('פאה',        'שיער מלאכותי לראש; קצה, צד (פאתי העיר)'),
    (6, 13):   ('התברך',      'זכה בדבר טוב (התברך בקול ערב)'),
    (7, 13):   ('כהה',        'נעשה פחות בהיר, החשיך (עיניו כהו)'),
    (8, 188):  ('נשיא',       'ראש מדינה, מנהיג; עב, ענן'),
    (9, 10):   ('קב',         'מקל תמיכה להליכה; מידת נפח קדומה'),
    (9, 53):   ('נקרה',       'הזדמן לו, נקלע בדרכו'),
    (9, 121):  ('שומה',       'אומדן ערך, הערכה; גידול שפיר על העור'),
    (10, 24):  ('אם הדרך',    'צומת מרכזי; נקודת הכרעה (עמד באם הדרך)'),
}


def key(s):
    s = unicodedata.normalize('NFKC', s).replace('־', ' ').replace('-', ' ')
    return ' '.join(NIQ.sub('', s).split()).strip()


done = 0
for u in range(1, 11):
    path = os.path.join(UNITS, 'unit-1-flat.md' if u == 1 else 'unit-%d-hebrew.md' % u)
    lines = io.open(path, encoding='utf-8').readlines()
    i, changed = 0, 0
    for li, ln in enumerate(lines):
        m = ROW.match(ln.rstrip('\n'))
        if not m or not m.group(2).isdigit():
            continue
        i += 1
        f = FIXES.get((u, i))
        if not f:
            continue
        expect, new = f
        disp = m.group(3).strip()
        if key(disp) != key(expect):
            print('⛔ י%d:%d אי-התאמה — בקובץ "%s", ציפינו "%s"' % (u, i, disp, expect))
            continue
        if len(new) > 60:
            print('⛔ י%d:%d מעל 60 תווים (%d)' % (u, i, len(new)))
            continue
        old = m.group(5).strip()
        lines[li] = '%s%s%s %s %s' % (m.group(1), m.group(3), m.group(4), new, m.group(6).lstrip()) + '\n'
        print('י%-2d:%-4d %-14s %s  ⟵  %s' % (u, i, disp, new, old))
        changed += 1
        done += 1
    if changed:
        io.open(path, 'w', encoding='utf-8').writelines(lines)

print('\nתוקנו %d מתוך %d' % (done, len(FIXES)))
