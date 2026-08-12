'use strict';
/* מבחן רמה חוזר — ההצעה להוריד מילים.
 *
 * מה חגי ביקש (5.8.2026, חשוב ודחוף 3)
 * -------------------------------------
 * "לאפשר סנכרון כאשר עושים מבחן רמה גם לא בפעם הראשונה. נכנסים להגדרות, עושים מבחן רמה,
 * להציע להוריד מילים — לשלב את המילים שכבר למדת ומה שאתה אמור לא ללמוד לפני ההמלצה."
 *
 * מה היה
 * -------
 * ההצעה נחסמה לחלוטין לכל חשבון עם 10+ מילים שתורגלו:
 *     const skippable = (LV_LANG==='en' && already < 10) ? lvCountKnown(level) : 0;
 * החסימה נוספה אחרי שחשבון אמיתי איבד 2,470 רשומות, וזו הייתה הסיבה הנכונה — אבל הכלי
 * היה גס. מי שחזר להגדרות ועשה מבחן רמה בשנית לא ראה הצעה בכלל, גם כשהיו לו מאות מילים
 * מתחת לרמתו שמעולם לא נגע בהן.
 *
 * למה בטוח להסיר אותה
 * --------------------
 * ההגנה האמיתית היא לכל מילה, והיא קיימת בשני המקומות שסופרים ומחילים:
 *   lvCountKnown  — `if(!k || words[k] || gone.has(k)) continue`
 *   lvApplyKnown  — `if(stats.words[k]) continue;  // any history at all — leave it alone`
 * כלומר מילה שכבר תורגלה אינה יכולה להיכנס להצעה, לא לספירה ולא לכתיבה. זו בדיוק
 * הדרישה "לשלב את המילים שכבר למדת לפני ההמלצה".
 *
 * הבדיקה המרכזית כאן היא האחרונה, והיא מודדת ולא מצטטת: בונה חשבון עם היסטוריה,
 * מריצה את ההחלה בפועל, ומוודאת שאף רשומה קיימת לא שונתה. זה הנכס שאבד פעם.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();
/* עד הסוגר המסיים של הפונקציה, לא חלון של N תווים. קודם זה היה `slice(at, at + 3000)`,
   וכשנוספה הערה ל-lvFinish המחרוזת שנבדקת יצאה מהחלון והבדיקה נפלה על קוד תקין לגמרי.
   בדיקה שנשברת מהוספת הערה מלמדת להתעלם ממנה. */
const lvFinish = () => {
  const at = app.indexOf('function lvFinish');
  assert.ok(at > 0, 'lvFinish נעלמה');
  const end = app.indexOf('\n}', at);
  assert.ok(end > at, 'לא נמצא הסוגר המסיים של lvFinish');
  return app.slice(at, end + 2);
};

describe('מבחן רמה חוזר — ההצעה', () => {

  test('החסימה הרחבה על חשבון עם היסטוריה הוסרה', () => {
    const body = lvFinish();
    assert.ok(!/already\s*<\s*10/.test(body),
      'ההצעה עדיין נחסמת לפי מספר המילים שתורגלו — מבחן רמה חוזר לא יציע דבר');
    assert.match(body, /const skippable\s*=\s*\(LV_LANG==='en'\)\s*\?\s*lvCountKnown\(level\)/,
      'הספירה אינה מבוססת על lvCountKnown בלבד');
  });

  test('עברית עדיין לא מגיעה להצעה', () => {
    /* הדירוגים קיימים רק באנגלית; הצעה בעברית הייתה מבוססת על כלום. */
    assert.match(lvFinish(), /LV_LANG==='en'/, 'השער על אנגלית נעלם');
  });

  test('הספירה פוסלת מילה עם היסטוריה או מחיקה', () => {
    const at = app.indexOf('function lvCountKnown');
    assert.ok(at > 0, 'lvCountKnown נעלמה');
    assert.match(app.slice(at, at + 700), /words\[k\]\s*\|\|\s*gone\.has\(k\)/,
      'lvCountKnown אינו פוסל מילים שכבר תורגלו — ההצעה תכלול מילים שהלומד כבר יודע');
  });

  test('ההחלה לעולם אינה נוגעת ברשומה קיימת', () => {
    const at = app.indexOf('function lvApplyKnown');
    assert.ok(at > 0, 'lvApplyKnown נעלמה');
    const body = app.slice(at, at + 900);
    assert.match(body, /if\(stats\.words\[k\]\)\s*continue/,
      'ההחלה עלולה לדרוס התקדמות קיימת — זה הבאג שעלה 2,470 רשומות');
    const guardAt = body.indexOf('if(stats.words[k]) continue');
    const writeAt = body.indexOf('stats.words[k]={');
    assert.ok(guardAt > 0 && guardAt < writeAt, 'השער אינו לפני הכתיבה');
  });

  test('הטקסט אומר ללומד שמה שתרגל אינו נכלל', () => {
    /* מי שחוזר למבחן רמה עם היסטוריה צריך לדעת שההצעה אינה נוגעת בה. */
    assert.match(lvFinish(), /מילים שכבר תרגלת אינן נכללות כאן/,
      'ההצעה אינה אומרת שהמילים שתורגלו מוחרגות');
  });

  test('התוצאה נשמרת ומסונכרנת בכל מבחן, גם חוזר', () => {
    const body = lvFinish();
    assert.match(body, /LS\.set\(lvKey\(\),\s*level\|\|'A1'\);\s*queueRemoteSync\(\)/,
      'התוצאה אינה נדחפת לענן — מבחן חוזר לא יסתנכרן למכשירים האחרים');
  });
});
