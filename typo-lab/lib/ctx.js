'use strict';
/* הקשר ריצה אמיתי למעבדה · אפס מימוש מחדש.
 *
 * כל פונקציה שהמעבדה מודדת עליה היא הפונקציה של app.js עצמה, מורמת דרך ארגז החול של
 * חבילת הבדיקות (tests/_harness/sandbox.js). זה העיקרון שכל התוכנית עומדת עליו: אם
 * המעבדה תממש מחדש את isCorrect, היא תמדוד את המימוש שלה ולא את האפליקציה, וכל מספר
 * שיצא ממנה יהיה חסר ערך.
 *
 * הטעינה יקרה (קריאת app.js, שני קובצי מאגר, בניית BANK ו-GLOSS_ALT), ולכן ממוזכרת לפי
 * שפה. שני ההקשרים מבודדים זה מזה: LANG הוא משתנה מודול ב-app.js, ולכן הקשר עברי והקשר
 * אנגלי חייבים להיות שני sandbox נפרדים ולא אחד שמחליף שפה.
 */

const vm = require('vm');
const path = require('path');

const HARNESS = path.join(__dirname, '..', '..', 'tests', '_harness');
const { loadApp, appSource, ROOT } = require(path.join(HARNESS, 'sandbox.js'));
const { extractAll } = require(path.join(HARNESS, 'extract.js'));

/* סימבולים שהמעבדה צריכה ו-SYMBOLS של ארגז החול אינו מרים (הרשימה ב-sandbox.js:36-66).
 * מורמים כאן ולא שם בכוונה: שלב א' אינו נוגע בחבילת הבדיקות, וכל עריכה של sandbox.js היא
 * עריכה בקוד שמחזיק 961 בדיקות ירוקות. בשלב ב', כשהריצה עצמה תשתמש ב-editDist דרך
 * nearMatch, הוא ייכנס ל-SYMBOLS ואז הבלוק הזה יהפוך ל-no-op (הבדיקה `=== undefined`
 * למטה כבר מכסה את המצב הזה בלי שינוי קוד).
 */
const EXTRA = ['editDist'];

const cache = new Map();

function getCtx(lang) {
  const L = lang || 'he';
  if (L !== 'he' && L !== 'en') throw new Error(`getCtx: lang must be 'he' or 'en', got "${L}"`);
  const hit = cache.get(L);
  if (hit) return hit;

  const ctx = loadApp({ lang: L });

  const missing = EXTRA.filter(n => ctx[n] === undefined);
  if (missing.length) {
    for (const { name, code } of extractAll(appSource(), missing)) {
      try { vm.runInContext(code, ctx, { filename: `app.js:${name}` }); }
      catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
    }
    /* אותו חוזה של ארגז החול: סימבול חסר נופל בשמו, ולא מתדרדר לבדיקה שעברה כי לא בדקה
       כלום. extractAll כבר זורק על "לא נמצא"; זה תופס את "נמצא אבל התאפס". */
    const still = EXTRA.filter(n => ctx[n] === undefined);
    if (still.length) throw new Error('lifted from app.js but undefined afterwards: ' + still.join(', '));
  }

  cache.set(L, ctx);
  return ctx;
}

module.exports = { getCtx, EXTRA, ROOT };
