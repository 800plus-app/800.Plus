'use strict';
/* ניהול מילים שנפתח מיחידה · רק אותה יחידה, וממוין לפי חוזק.
 *
 * מה חגי ביקש (5.8.2026, חשוב ודחוף 7)
 * -------------------------------------
 * "בניהול מילים כאשר אני נכנס לזה דרך יחידה צריך שאראה רק את המילים של היחידה, שלא אמחק
 * בטעות מילים אחרות. והסדר צריך להיות קודם כל המילים שאני חלש בהן, אחר כך מילים שלמדתי,
 * ואחר כך מילים חדשות · נגישות למילים הקשות."
 *
 * שתי דרישות נפרדות, ושתיהן נבדקות כאן:
 *
 * 1. היקף. קודם openManage(unit) רק *פתח* את היחידה (mOpen), וכל עשר היחידות נשארו על
 *    המסך מקופלות. מחיקה כאן נעשית בסימון תיבות ואז "מחק", והבחירה (mSel) שורדת קיפול
 *    של יחידה ושינוי חיפוש · כך שגלגול אצבע אחד אל יחידה אחרת מספיק כדי לסמן מילה שלא
 *    התכוונת אליה. mOnly מוציא את השורות האלה מה-DOM לחלוטין: מה שלא קיים אי אפשר לסמן.
 *
 * 2. סדר. אותן שלוש קבוצות של classify() ובאותו כלל בדיוק · lvl>=3 בשליטה, seen>0
 *    לחיזוק, והשאר טרם נפגשו. מילה שטעית בה אינה מילה שלא פגשת, ולכן היא הראשונה.
 *
 * ולמה יש כאן בדיקה על האיפוס
 * ----------------------------
 * mOnly הוא מצב גלובלי ששורד יציאה מהמסך. אם openManage(null) לא היה מאפס אותו, מי
 * שנכנס פעם אחת מיחידה 7 היה רואה רק אותה לתמיד · גם מ"ניהול מילים" הכללי · ו-3,900
 * המילים האחרות היו נעלמות בלי שום הודעה. זה הכשל השקט של התיקון הזה, ולכן הוא נבדק.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();

const renderManage = () => {
  const at = app.indexOf('function renderManage');
  assert.ok(at > 0, 'renderManage נעלמה');
  return app.slice(at, at + 1800);
};
const openManage = () => {
  const at = app.indexOf('function openManage');
  assert.ok(at > 0, 'openManage נעלמה');
  return app.slice(at, at + 700);
};

describe('ניהול מילים · היקף יחידה וסדר', () => {

  test('קיים מצב שמגביל את המסך ליחידה אחת', () => {
    assert.match(app, /let\s+mOnly\s*=\s*null/, 'אין mOnly');
  });

  test('הסינון חוסם מילים מיחידות אחרות מלהיכנס ל-DOM', () => {
    assert.match(renderManage(),
      /!mOnly\s*\|\|\s*String\(w\.unit\)\s*===\s*String\(mOnly\)/,
      'renderManage אינו מסנן לפי mOnly -- מילים מיחידות אחרות עדיין ניתנות לסימון ולמחיקה');
  });

  test('הסינון חל גם על תוצאות החיפוש', () => {
    /* אחרת חיפוש בתוך יחידה היה מחזיר מילים מכל המאגר, וזה בדיוק המצב שהתיקון בא למנוע. */
    const body = renderManage();
    const m = body.match(/const items\s*=\s*all\.filter\(([^;]*)\);/);
    assert.ok(m, 'לא נמצאה שורת הסינון של items');
    assert.ok(/mOnly/.test(m[1]) && /hit\(w\)/.test(m[1]),
      'הסינון לפי mOnly והחיפוש אינם חלים יחד על אותה רשימה');
  });

  test('openManage מגדיר את היחידה · ומאפס אותה בכניסה הכללית', () => {
    const body = openManage();
    assert.match(body, /mOnly\s*=\s*unit\s*\?\s*String\(unit\)\s*:\s*null/,
      'mOnly אינו מתאפס ל-null בכניסה ללא יחידה -- המשתמש יינעל על היחידה האחרונה לתמיד');
  });

  test('שני מסלולי הכניסה עדיין קיימים', () => {
    assert.match(app, /\$\('#manageBtn'\)\.onclick=\(\)=>openManage\(null\)/,
      'הכניסה הכללית לניהול מילים נשברה');
    assert.match(app, /\$\('#pbManage'\)\.onclick/,
      'הכניסה מהיחידה נשברה');
  });

  /* ⚠ שתי הבדיקות האלה חיפשו `const rank` **בתוך** renderManage, ונפלו ברגע שהדירוג
     חולץ החוצה ל-manageRank כדי שאפשר יהיה להריץ אותו בבדיקה (12.8.2026). הקוד היה
     תקין; מה שנשבר הוא נעילה על מקום המימוש. הן בודקות עכשיו את הפונקציה עצמה.
     ההתנהגות של "ידעתי" נבדקת ב-70-manage-order · כאן רק שהרשימה ממוינת בכלל
     ושכללי classify עדיין הם שקובעים. */
  test('הסדר: לחיזוק → בשליטה → טרם נפגשו, ומחוקות בסוף', () => {
    const m = app.match(/const manageRank\s*=\s*w\s*=>\s*([^;]+);/);
    assert.ok(m, 'אין פונקציית דירוג -- הסדר נשאר סדר המאגר');
    const r = m[1];
    /* אותו כלל של classify(): lvl>=3 בשליטה, seen>0 לחיזוק. */
    assert.match(r, /lvl\(w\.term\)\s*>=\s*3/, 'הדירוג אינו משתמש בכלל של classify לבשליטה');
    assert.match(r, /seenCount\(w\.term\)/, 'הדירוג אינו משתמש בכלל של classify לחיזוק');
    assert.match(r, /w\.gone/, 'מילה מחוקה אינה יורדת לסוף');
    assert.match(renderManage(), /ws\.sort\(\(a,b\)=>manageRank\(a\)-manageRank\(b\)\)/,
      'הרשימה אינה ממוינת בפועל');
  });

  test('דירוג: חלש קודם לנלמד, ונלמד קודם לחדש', () => {
    /* הכלל עצמו, מורץ. הבדיקה שמעל מוודאת שהוא כתוב; זו מוודאת שהוא נכון. */
    const expr = app.match(/const manageRank\s*=\s*w\s*=>\s*([^;]+);/)[1];
    const rank = new Function('w', 'lvl', 'seenCount', 'isKnown', 'return ' + expr);
    /* lvl ו-seenCount מקבלים את המחרוזת w.term ולא את האובייקט, ולכן הבדיקה עובדת מול
       טבלה לפי מונח. הגרסה הראשונה כאן קראה w.level מתוך מחרוזת, קיבלה undefined,
       וכל הדירוגים יצאו זהים · הבדיקה נכשלה על קוד תקין. */
    const LV = { a:1, b:3, c:0, d:0 }, SEEN = { a:2, b:5, c:0, d:0 };
    const lvl = t => LV[t], seen = t => SEEN[t], known = () => false;
    const weak   = rank({ term:'a' }, lvl, seen, known);
    const strong = rank({ term:'b' }, lvl, seen, known);
    const fresh  = rank({ term:'c' }, lvl, seen, known);
    const gone   = rank({ term:'d', gone:true }, lvl, seen, known);
    assert.ok(weak < strong, `מילה לחיזוק (${weak}) אינה לפני מילה בשליטה (${strong})`);
    assert.ok(strong < fresh, `מילה בשליטה (${strong}) אינה לפני מילה שטרם נפגשה (${fresh})`);
    assert.ok(fresh < gone, `מילה מחוקה (${gone}) אינה אחרונה`);
  });
});
