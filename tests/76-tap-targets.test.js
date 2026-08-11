'use strict';
/* גודל מטרת מגע — הכפתור שמתכווץ כשאין שם משתמש.
 *
 * מה נמדד בדפדפן ב-11.8.2026 (בדק בית 3 · ד5)
 * ---------------------------------------------
 * ‏`#userBadge2` / `#userBadge3` נמדדו **22×14 פיקסלים**. הם כפתורים לכל דבר,
 * עם `onclick` שפותח את מסך החשבון (app.js:4675-4676) ועם
 * `aria-label="החשבון שלי"` — כלומר קורא מסך מכריז עליהם ככפתור.
 *
 * למה הם מתכווצים
 * ----------------
 * ‏`.user-badge` הוא `display:flex` עם `padding:6px 10px` ו-`<b>` פנימי שמקבל
 * את השם. כשאין שם, ה-`<b>` ריק, ומה שנשאר הוא הריפוד בלבד: 20×12 ועוד גבול.
 * **אין שום לוגיקה שמסתירה את הכפתור כשהוא ריק** — נבדק, אפס מופעי `hidden`.
 * ‏`setName` כותב לשלושת התגים יחד (app.js:4372), ומחרוזת ריקה עוברת כמו כל
 * מחרוזת אחרת.
 *
 * למה זה תיקון ולא העדפה עיצובית
 * -------------------------------
 * ‏`index.html:671` כבר נושא הערה מדודה על אותו נושא בדיוק: *"37 פיקסלים
 * נמדדו בדפדפן — מתחת לאצבע"*. גודל מטרת המגע הוא שיקול שהפרויקט כבר קיבל
 * והפעיל. ‏WCAG 2.5.8 (AA) קובע 24×24 כרצפה, וזו הרצפה שנבחרה כאן.
 *
 * ⚠ התיקון **אינו נראה** במצב הרגיל: כשיש שם, הכפתור כבר גדול מהרצפה בהרבה,
 * ו-`min-*` אינו משנה דבר. הוא חל רק על המצב הריק. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* גוף כלל ה-CSS של הסלקטור, עד הסוגר הסוגר. חלון של N תווים היה נשבר על
   הערה שנוספת — בדיוק הכשל שמסלול א2 מנה ושכבר נשך פעם אחת בסבב הזה. */
function ruleBody(selector) {
  const at = html.indexOf(selector);
  if (at < 0) return null;
  const close = html.indexOf('}', at);
  return close < 0 ? null : html.slice(at, close);
}

describe('גודל מטרת מגע — WCAG 2.5.8', () => {
  test('הכפתורים באמת אינטראקטיביים, אחרת אין מה למדוד', () => {
    /* בלי זה, שינוי שהופך את התגית ל-<span> היה משאיר את הבדיקה ירוקה
       ומעיד על כלום. */
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    for (const id of ['userBadge2', 'userBadge3'])
      assert.ok(new RegExp(`\\$\\('#${id}'\\)\\.onclick`).test(app),
        `#${id} אינו נושא onclick — עדכן את הבדיקה או את ההנחה`);
    assert.match(html, /<button class="user-badge"[^>]*aria-label="החשבון שלי"/,
      'התגית אינה כפתור עם aria-label — קורא מסך לא יכריז עליה');
  });

  test('.user-badge אינו יורד מתחת ל-24×24 גם כשהוא ריק', () => {
    const body = ruleBody('.user-badge{');
    assert.ok(body, 'לא נמצא כלל ה-CSS של .user-badge');
    const minH = /min-height:\s*(\d+)px/.exec(body);
    const minW = /min-width:\s*(\d+)px/.exec(body);
    assert.ok(minH, 'אין min-height — כשאין שם משתמש הכפתור מתכווץ ל-14px גובה');
    assert.ok(minW, 'אין min-width — כשאין שם משתמש הכפתור מתכווץ ל-22px רוחב');
    assert.ok(+minH[1] >= 24, `min-height הוא ${minH[1]}px — מתחת לרצפת WCAG AA (24)`);
    assert.ok(+minW[1] >= 24, `min-width הוא ${minW[1]}px — מתחת לרצפת WCAG AA (24)`);
  });

  test('התגית עדיין מתיישרת למרכז, כך שהרצפה אינה מעוותת אותה', () => {
    /* min-height על display:flex בלי align-items היה מותח את ה-<b> לגובה
       המלא. הכלל כבר נושא align-items:center — מקובע כאן כדי שהתיקון לא
       יישבר בעריכה עתידית. */
    const body = ruleBody('.user-badge{');
    assert.match(body, /display:\s*flex/, '.user-badge אינו flex — הנחת המרכוז נשברה');
    assert.match(body, /align-items:\s*center/,
      'בלי align-items:center הרצפה החדשה תמתח את תוכן התגית');
  });
});
