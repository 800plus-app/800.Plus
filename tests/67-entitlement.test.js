'use strict';
/* מי מכריע על גישה · השרת או המכשיר.
 *
 * הבעיה (א1)
 * -----------
 * hasAccess() משווה את sub_until ל-Date.now(), כלומר **לשעון של הטלפון**. מי שמזיז
 * את השעון אחורה מאריך לעצמו את המנוי, ואין לזה שום מחסום. כל עוד אין תשלום זה
 * תיאורטי; ביום שיהיה, זו דלת פתוחה.
 *
 * my_entitlement() (migrations/11.sql:478) מחזירה תשובה שנחתכה בשרת:
 *   access · has_access(auth.uid()) · ההכרעה עצמה, כולל שלב חינמי ותפקיד אדמין
 *   server_now · כי שעון הלקוח משקר, בכוונה ובלי כוונה
 *   offline_until · least(sub_until, now + offline_grace_days). **השרת אומר בעצמו**
 *                  כמה זמן מותר לסמוך על התשובה הזאת בלי רשת.
 *
 * מה entVerdict מכריע, ולמה שלושה ערכים ולא שניים
 * -------------------------------------------------
 * true / false / **null**. null אינו "אין גישה" אלא "לשרת אין תשובה עכשיו" · ואז
 * חוזרים לבדיקה המקומית שקיימת היום. זה מהותי: כל השער הזה נכשל־פתוח בכוונה
 * (ראה ההערה מעל accessOk), והאפליקציה היא PWA שחייבת לעבוד באוטובוס. שער שנועל
 * מפני שאין רשת הוא בדיוק התקלה שההערות בקוד מזהירות מפניה.
 *
 * ⚠ מה זה **לא** עושה: כשהשרת אומר false, זה false · גם אם שעון המכשיר טוען אחרת.
 * זו כל הנקודה של המשימה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./_harness/sandbox.js');

const ctx = loadApp();
const V = (ent, now) => ctx.entVerdict(ent, now);
const NOW = Date.parse('2026-08-06T12:00:00Z');
const iso = ms => new Date(ms).toISOString();

describe('הכרעת גישה מהשרת', () => {

  test('השרת אומר "אין גישה" · והמכשיר לא מנצח אותו', () => {
    /* הלב של א1. אפילו עם offline_until רחוק, false נשאר false. */
    assert.strictEqual(V({ access: false, offline_until: iso(NOW + 9e8) }, NOW), false);
  });

  test('השרת אומר "יש גישה" · והתשובה מתקבלת', () => {
    assert.strictEqual(V({ access: true, offline_until: iso(NOW + 864e5) }, NOW), true);
  });

  test('התשובה השמורה פגה · חוזרים לבדיקה המקומית, לא נועלים', () => {
    /* null ולא false. מכשיר שהיה אופליין שבועיים אינו מכשיר גנוב, והנעילה כאן
       הייתה מוציאה לומד משלם מהאפליקציה בלי שאיש עשה כלום. */
    assert.strictEqual(V({ access: true,  offline_until: iso(NOW - 1) }, NOW), null);
    assert.strictEqual(V({ access: false, offline_until: iso(NOW - 1) }, NOW), null);
  });

  test('תאריך שאי אפשר לפענח אינו נועל', () => {
    /* אותו כלל שכבר חל על sub_until ב-hasAccess: תקלה שלנו לא סוגרת דלת. */
    assert.strictEqual(V({ access: true,  offline_until: 'לא-תאריך' }, NOW), true);
    assert.strictEqual(V({ access: false, offline_until: 'לא-תאריך' }, NOW), false);
  });

  test('בלי offline_until · התשובה תקפה', () => {
    assert.strictEqual(V({ access: true }, NOW), true);
  });

  test('אין תשובה מהשרת · null, ולא הכרעה', () => {
    /* כל אלה חייבים להוביל לנפילה חזרה למסלול הקיים ולא ל"אין גישה". */
    for (const bad of [null, undefined, {}, { access: 'yes' }, { access: 1 }, 'true', 42])
      assert.strictEqual(V(bad, NOW), null, 'ערך פסול הוכרע במקום להיפול חזרה: ' + JSON.stringify(bad));
  });
});

describe('מה שנשאר מהמסלול הישן', () => {
  test('hasAccess לא נגעו בה · היא עדיין הנפילה־לאחור', () => {
    /* entVerdict אינה מחליפה את hasAccess אלא קודמת לה. אם hasAccess תישבר,
       מכשיר בלי רשת יאבד את השער כולו. */
    assert.strictEqual(ctx.hasAccess({ role: 'admin' }), true);
    assert.strictEqual(ctx.hasAccess({ sub_status: 'none' }), true, 'שלב חינמי');
    assert.strictEqual(ctx.hasAccess({ sub_status: 'canceled', sub_until: null }), false);
  });
});
