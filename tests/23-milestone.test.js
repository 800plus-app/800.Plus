'use strict';
/* ציון הדרך בכרטיס הסיום — נאמר פעם אחת בדיוק, וברגע הנכון.
 *
 * למה זה נבדק בכלל
 * -----------------
 * הכרטיס אומר כמה ידעת בסבב, והפס אומר כמה נשאר. אף אחד מהם לא אומר "עברת נקודה שלא
 * עברת קודם", וזה מה שהופך שלושה חודשים של תרגול לרצף של רגעים במקום לפס שזז לאט.
 *
 * שני כשלים אפשריים, והם הפוכים זה לזה:
 *   · לא להיאמר בכלל — ואז אין ציון דרך.
 *   · להיאמר שוב ושוב — ואז הוא נהיה רעש, ומי שרואה "50 מילים!" כל יום מפסיק להאמין לו.
 *
 * החישוב עצמו נגזר מהמצב האמיתי (solidBefore = c.strong פחות מה שהסבב הזה העלה), ולא
 * ממונה נפרד שיכול לצאת מסנכרון עם מה שהלומד באמת יודע. הבדיקות כאן מפעילות בדיוק את
 * הנוסחה הזאת על המספרים שסביב כל רף.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* הנוסחה כפי שהיא ב-app.js. אם היא משתנה שם, השורה הזאת מפסיקה לתאר אותה — ולכן
   הבדיקה האחרונה בקובץ מוודאת שהיא עדיין כתובה שם מילה במילה. */
const STEPS = [10, 25, 50, 100, 200, 400, 800];
const crossed = (before, now) => STEPS.filter(n => before < n && now >= n).pop();

describe('ציון דרך — נאמר בדיוק כשעוברים את הרף', () => {

  test('עלייה שחוצה רף מדווחת עליו', () => {
    assert.strictEqual(crossed(49, 52), 50);
    assert.strictEqual(crossed(9, 10), 10, 'נגיעה מדויקת ברף היא חצייה');
    assert.strictEqual(crossed(0, 12), 10, 'סבב ראשון גדול חוצה את הרף הראשון');
  });

  test('סבב שלא חצה כלום שותק', () => {
    assert.strictEqual(crossed(52, 58), undefined);
    assert.strictEqual(crossed(50, 50), undefined, 'סבב בלי התקדמות אינו חצייה');
    assert.strictEqual(crossed(0, 0), undefined);
  });

  test('אותו רף לא נאמר פעמיים', () => {
    /* הסבב שאחרי החצייה מתחיל מ-52, ולכן 50 כבר מאחוריו. זה כל המנגנון שמונע חזרה,
       ולכן הוא נבדק במפורש. */
    assert.strictEqual(crossed(49, 52), 50);
    assert.strictEqual(crossed(52, 55), undefined, 'הרף נאמר שוב בסבב הבא');
  });

  test('קפיצה שחוצה שני רפים מדווחת על הגבוה', () => {
    /* מבחן רמה או סבב ארוך יכולים לעבור שניים בבת אחת. "עברת 25" אחרי שכבר עברת 50
       קורא כהמעטה. */
    assert.strictEqual(crossed(20, 60), 50);
    assert.strictEqual(crossed(0, 1000), 800, 'הגבוה ביותר, לא הראשון');
  });

  test('ירידה לא מדווחת', () => {
    /* רמה יכולה לרדת אחרי תשובה שגויה, ו-c.strong יורד איתה. */
    assert.strictEqual(crossed(60, 45), undefined);
  });

  test('כל הרפים עולים, ואין כפילויות', () => {
    assert.deepStrictEqual([...STEPS].sort((a, b) => a - b), STEPS, 'הרפים אינם ממוינים');
    assert.strictEqual(new Set(STEPS).size, STEPS.length, 'יש רף כפול');
  });
});

describe('ציון דרך — הקוד באמת מחשב את זה', () => {

  test('הנוסחה קיימת ב-app.js ומשתמשת ב-newlySolid, לא במונה נפרד', () => {
    assert.match(app, /solidBefore\s*=\s*c\.strong\s*-\s*newlySolid/,
      'solidBefore אינו נגזר מהמצב — מונה נפרד יוצא מסנכרון עם מה שהלומד באמת יודע');
    assert.match(app, /STEPS\.filter\(n=>solidBefore<n\s*&&\s*solidNow>=n\)\.pop\(\)/,
      'תנאי החצייה השתנה; הבדיקות בקובץ הזה כבר לא מתארות את הקוד');
  });

  test('רשימת הרפים בקוד זהה לזו שנבדקת כאן', () => {
    const m = app.match(/const\s+STEPS\s*=\s*\[([\d,\s]+)\]/);
    assert.ok(m, 'STEPS לא נמצא ב-app.js');
    assert.deepStrictEqual(m[1].split(',').map(s => Number(s.trim())), STEPS,
      'הרפים בקוד ובבדיקה נפרדו — הבדיקה מאשרת מספרים שאיש לא רואה');
  });

  test('התג מוצג בתוך הכרטיס הקיים ולא כמסך חדש', () => {
    assert.match(app, /class="up-mile"/, 'התג לא נכתב לכרטיס');
    assert.ok(!/showMilestone|milestoneScreen|goto\('milestone'/.test(app),
      'נוסף מסך נפרד — מסך שקופץ באמצע נסגר מהר וגם מפריע');
    assert.match(html, /\.up-mile\{/, 'אין עיצוב ל-.up-mile — התג יופיע כטקסט חשוף');
  });
});
