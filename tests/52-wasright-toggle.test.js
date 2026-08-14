'use strict';
/* "בעצם ידעתי" · מתג, לא פעולה חד-כיוונית.
 *
 * מה חגי ביקש (5.8.2026, קובץ המשימות · חשוב ודחוף 4)
 * ---------------------------------------------------
 * "סימון 'ידעתי' שלא יהיה חד משמעי, שיהיה אפשר ללחוץ גם הפוך ברגע שטעיתי ולחצתי 'ידעתי' · 
 * שתהיה לי אופציה ללחוץ שוב אם בטעות לא ידעתי וטעיתי כשלחצתי."
 *
 * למה זה היה חד-כיווני
 * ---------------------
 * ה-handler הסתיים ב-wr.remove(). לחיצה אחת והכפתור נעלם מה-DOM, כך שלא היה בכלל אלמנט
 * ללחוץ עליו שוב. מסך הסיכום אפשר לתקן (renderReview › .rev-chip מחליף mastered), אבל רק
 * אחרי שהסבב נגמר · והטעות קורית בכרטיס עצמו.
 *
 * מה הביטול חייב להחזיר, ולמה כל אחד
 * -----------------------------------
 * הבדיקה כאן עומדת על ארבעה, כי כל אחד מהם נקרא במקום אחר ודליפה של אחד מהם שקטה:
 *   · correct · הניקוד שמוצג ב-#qLive ובמסך הסיכום.
 *   · missed · הרשימה שממנה נבנה "תרגל את מה שפספסתי".
 *   · mastered/firstTry · מה ש-commitSession קורא בפועל כדי לקבוע רמה.
 *   · r.sens · creditSense כותב לזיכרון הקבוע מיד, לא בסוף הסבב. בלי שחזור, ביטול היה
 *                משאיר פירוש מזוכה שהלומד לא נתן, והמילה הייתה מטפסת לעבר "נלמדה" על סמך
 *                לחיצה שבוטלה. זה הפריט היחיד כאן שנוגע בנתונים שנשמרים לדיסק.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* גוף ה-handler של #wasRight, מהאיתור שלו ועד סוף הבלוק. */
function handler() {
  const at = app.indexOf("const wr=$('#wasRight')");
  assert.ok(at > 0, "לא נמצא ה-handler של #wasRight");
  return app.slice(at, at + 2200);
}

describe('"בעצם ידעתי" · מתג הפיך', () => {

  test('הכפתור אינו נמחק מה-DOM אחרי לחיצה', () => {
    assert.ok(!/wr\.remove\(\)/.test(handler()),
      'עדיין קיים wr.remove() — לחיצה אחת מוחקת את הכפתור ואי אפשר לבטל');
  });

  test('יש מצב שנשמר בין לחיצות, והוא מתהפך', () => {
    const h = handler();
    assert.match(h, /let\s+marked\s*=\s*false/, 'אין דגל מצב marked');
    assert.match(h, /marked\s*=\s*!marked/, 'המצב אינו מתהפך בלחיצה');
  });

  test('ביטול מחזיר את הניקוד ואת רשימת הפספוסים', () => {
    const h = handler();
    assert.match(h, /correct\s*=\s*Math\.max\(0,\s*correct\s*-\s*1\)/,
      'הניקוד אינו יורד בביטול — המסך יראה נכון אחד יותר מהאמת');
    assert.match(h, /missed\.push\(w\)/,
      'המילה אינה חוזרת ל-missed — "תרגל את מה שפספסתי" ידלג עליה');
  });

  test('ביטול מחזיר את מה ש-commitSession קורא', () => {
    const h = handler();
    assert.match(h, /e\.mastered\s*=\s*false/, 'mastered אינו מבוטל');
    assert.match(h, /e\.firstTry\s*=\s*false/, 'firstTry אינו מבוטל');
  });

  test('ביטול משחזר את r.sens שנכתב לזיכרון הקבוע', () => {
    /* זה הפריט היחיד כאן שנוגע בנתונים שנשמרים. creditSense רץ מיד בלחיצה, ולכן
       חייב להישמר עותק לפניו ולהיות משוחזר בביטול. */
    const h = handler();
    assert.match(h, /sensBefore\s*=\s*\(rec\(w\.term\)\.sens\s*\|\|\s*\[\]\)\.slice\(\)/,
      'לא נשמר עותק של sens לפני creditSense');
    assert.match(h, /rec\(w\.term\)\.sens\s*=\s*sensBefore/,
      'sens אינו משוחזר בביטול — פירוש מזוכה נשאר אחרי לחיצה שבוטלה');
    const setAt = h.indexOf('sensBefore=(rec(w.term).sens');
    const creditAt = h.indexOf('creditSense(w,');
    assert.ok(setAt > 0 && creditAt > 0 && setAt < creditAt,
      'העותק נשמר אחרי creditSense — כלומר הוא כבר מזוהם');
  });

  test('הכפתור אומר ללומד שאפשר לבטל', () => {
    const h = handler();
    assert.match(h, /לחץ לביטול/,
      'הכפתור אינו מציין שניתן לבטל — מתג שנראה כמו פעולה שהסתיימה');
  });

  test('למצב הדלוק יש עיצוב משלו', () => {
    assert.match(html, /\.was-right\.on\{/,
      'אין סגנון ל-.was-right.on — אי אפשר לראות שהכפתור דלוק');
  });
});
