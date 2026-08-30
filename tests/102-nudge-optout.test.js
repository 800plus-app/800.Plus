'use strict';
/* מתג «תזכורות במייל» · השרשרת מהמתג עד אי-השליחה חייבת להישאר שלמה.
 *
 * שלוש חוליות, וכל אחת יכולה להישבר בשקט:
 *   1. הלקוח כותב את הדגל   · store.js › setNudgeOptout כותב nudge_optout על שורת
 *                             המשתמש עצמו (getUser().id), לא על שורה של אחר.
 *   2·3·4. שלושת הבוררים מכבדים אותו · כל pick_*.py פוסל את מי שהדגל דלוק לו,
 *          ב-continue, לפני שהוא נכנס ל-picked. אם השורה הזאת תיעלם מאחד מהם,
 *          מי שכיבה ימשיך לקבל מייל · וזו בדיוק זכות ההסרה שהמתג בא לממש.
 *
 * ⛔ מה שהשער הזה **אינו** עושה: הוא אינו מריץ את הבוררים · זה node והם python.
 * ההרצה האמיתית על פיקסטורה (משתמש שכיבה אינו נבחר) יושבת ב-
 * tests/teeth/102-nudge-optout.teeth.js · שם היא רצה מול python אמיתי, אדומה על
 * הדגל ההפוך וירוקה עליו. השער כאן שומר שהחוליה קיימת · הרתמה שם שהיא עובדת.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const שורש = path.join(__dirname, '..');
const קרא = f => fs.readFileSync(path.join(שורש, f), 'utf8');

describe('הלקוח כותב את nudge_optout על השורה של המשתמש עצמו', () => {

  const s = () => קרא('store.js');

  test('קיימת פונקציה שכותבת את הדגל', () => {
    assert.ok(/setNudgeOptout\s*\(/.test(s()),
      'אין ב-store.js פונקציה שכותבת nudge_optout · המתג לא יכול לשמור כלום');
  });

  test('הכתיבה היא update של nudge_optout על profiles', () => {
    const t = s();
    assert.ok(/from\(\s*['"]profiles['"]\s*\)\.update\(\s*\{[^}]*nudge_optout[^}]*\}\s*\)/.test(t),
      'הדגל אינו נכתב ב-update על טבלת profiles');
  });

  /* ⛔ העוגן שמונע הסלמת-הרשאות: הכתיבה חייבת להיות על id של המשתמש המחובר עצמו,
     ולא על id שמישהו מסר. אחרת מתג ההסרה היה יכול לכבות דיוור למשתמש אחר. */
  test('הכתיבה מוגבלת לשורת המשתמש המחובר · eq על data.user.id', () => {
    const t = s();
    assert.ok(/nudge_optout[\s\S]{0,120}?\.eq\(\s*['"]id['"]\s*,\s*data\.user\.id\s*\)/.test(t),
      'עדכון הדגל אינו מוגבל ל-data.user.id · המתג יכול לגעת בשורה של אחר');
  });
});

/* בכל בורר: הפסילה על nudge_optout קיימת, היא continue, והיא לפני הבחירה. */
for (const קובץ of ['scripts/pick_nudges.py', 'scripts/pick_lapsed.py', 'scripts/pick_inactive.py']) {
  describe(`${קובץ} מדלג על מי שכיבה תזכורות`, () => {

    const src = () => קרא(קובץ);

    test('יש פסילה על nudge_optout שנגמרת ב-continue', () => {
      const t = src();
      assert.ok(/if\s+p\.get\(\s*['"]nudge_optout['"]\s*\)\s*:[\s\S]{0,160}?\bcontinue\b/.test(t),
        'אין פסילה קשיחה על nudge_optout · מי שכיבה עדיין נכנס לבחירה');
    });

    test('הפסילה קודמת לבחירה · לפני picked.append', () => {
      const t = src();
      const guard = t.search(/if\s+p\.get\(\s*['"]nudge_optout['"]\s*\)\s*:/);
      const append = t.indexOf('picked.append(');
      assert.ok(guard >= 0, 'לא נמצאה הפסילה על nudge_optout · הצורה בקוד השתנתה והשער עיוור');
      assert.ok(append >= 0, 'לא נמצא picked.append · הצורה בקוד השתנתה והשער עיוור');
      assert.ok(guard < append,
        'הפסילה על nudge_optout יושבת אחרי הבחירה · מי שכיבה כבר נבחר לפני שנפסל');
    });
  });
}
