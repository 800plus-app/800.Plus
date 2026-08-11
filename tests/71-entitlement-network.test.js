'use strict';
/* מסלול ה-entitlement הרשתי — השכבה שבין השרת ל-entVerdict.
 *
 * מה 67 כבר מכסה, ומה לא
 * ------------------------
 * `67-entitlement` בודק את `entVerdict` — הפונקציה **הטהורה** שמכריעה מתוך
 * אובייקט נתון. מה שמביא את האובייקט הזה — `Store.myEntitlement` ו-
 * `refreshEntitlement` — לא נבדק כלל עד 11.8.2026.
 *
 * זו בדיוק מחלקת הפער ש-08-store נבנה לסגור בשכבה אחרת: "קריאה שנכשלה שנקראת
 * כענן ריק". כאן כשל שקט אינו מציג מספר שגוי — הוא **נועל משלם או פותח
 * לא-משלם**. תשלומים מתחילים ב-1.9.
 *
 * ⚠ המסלול נבדק ונמצא תקין ברובו. הבדיקות כאן מקבעות התנהגות נכונה שלא הייתה
 * מוגנת. היוצא מן הכלל היחיד — שלילה שאינה נדבקת על דיסק מלא — מסומן ⭐.
 *
 * למה זה לא נתיב חם
 * ------------------
 * `accessOk` נקראת פעם אחת בלבד, מ-`afterAuthed` בזמן האתחול. קריאת הרשת
 * שבתוכה אינה חוזרת על כל פעולה, ולכן אין כאן שאלת ביצועים. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadWithStorage } = require('./_harness/fakeStorage.js');
const { plain } = require('./_harness/sandbox.js');

const SYMS = ['isObj', 'SUF', 'KEY', 'LS', 'ENT_KEY', 'entVerdict',
              'shedStorage', 'showStorageBar', 'hideStorageBar'];

/* refreshEntitlement היא async ולכן מורמת בנפרד — extract.js משמיט את ה-async
   בשקט, ו-08-store מקבע את המגבלה. */
function ctxWith(answer, opts = {}) {
  const c = loadWithStorage(SYMS, Object.assign({ async: ['refreshEntitlement'] }, opts));
  c.Store = { myEntitlement: async () => (typeof answer === 'function' ? answer() : answer) };
  return c;
}

describe('refreshEntitlement — מה שמגיע מהשרת, ומה קורה כשלא', () => {
  test('תשובה תקפה נשמרת ומוחזרת', async () => {
    const c = ctxWith({ access: true, offline_until: '2099-01-01' });
    assert.strictEqual((await c.refreshEntitlement()).access, true);
    assert.strictEqual(c.__ls.read('hw_entitlement').access, true);
  });

  test('null מהשרת — נופלים למטמון ולא מוחקים אותו', async () => {
    const c = ctxWith(null);
    c.__ls.seed('hw_entitlement', { access: true, offline_until: '2099-01-01' });
    assert.strictEqual((await c.refreshEntitlement()).access, true);
  });

  test('השרת זורק — נופלים למטמון', async () => {
    const c = ctxWith(() => { throw new Error('network down'); });
    c.__ls.seed('hw_entitlement', { access: false });
    assert.strictEqual((await c.refreshEntitlement()).access, false);
  });

  test('צורה פגומה מהשרת אינה נשמרת ואינה דורסת מטמון תקין', async () => {
    /* access שאינו בוליאני הוא תשובה שאי אפשר להכריע לפיה. שמירתה הייתה
       הופכת מטמון תקין לזבל שנשאר על הדיסק. */
    const c = ctxWith({ access: 'yes' });
    c.__ls.seed('hw_entitlement', { access: true });
    await c.refreshEntitlement();
    assert.deepStrictEqual(c.__ls.read('hw_entitlement'), { access: true });
  });

  test('שלילה מהשרת דורסת מטמון שאומר "יש גישה"', async () => {
    const c = ctxWith({ access: false });
    c.__ls.seed('hw_entitlement', { access: true, offline_until: '2099-01-01' });
    await c.refreshEntitlement();
    assert.strictEqual(c.__ls.read('hw_entitlement').access, false);
  });

  test('אין שרת ואין מטמון — null, כלומר "אין הכרעה" ולא "אין גישה"', async () => {
    const c = ctxWith(null);
    const out = await c.refreshEntitlement();
    assert.strictEqual(out, null);
    assert.strictEqual(c.entVerdict(out, Date.now()), null,
      'null חייב להוביל למסלול המקומי, לא לנעילה');
  });

  test('⭐ שלילה שהכתיבה שלה נכשלה אינה משאירה מטמון שמתיר', async () => {
    /* ממצא 11.8.2026. הדיסק מלא, השרת שולל גישה:
       · הסשן הנוכחי מקבל false — נכון.
       · אבל LS.set נכשלה, ועל הדיסק נשאר {access:true} מלפני כן.
       · בטעינה הבאה entVerdict מחזיר **true** — הגישה חוזרת.
       כלומר שלילה אינה נדבקת כשהמכסה מלאה, וזו אינה תקלה תיאורטית:
       לאפליקציה יש מנגנון shedStorage שלם מפני שהמכסה נגמרת אצל משתמשים.

       התיקון אסימטרי בכוונה. כשהכתיבה נכשלת ו**השרת שלל** — המטמון נמחק,
       ובטעינה הבאה entVerdict מחזיר null ונופלים למסלול המקומי שבודק את
       הפרופיל. זו האמת, ולא הרשאה ישנה.
       כשהשרת **מתיר** והכתיבה נכשלת, המטמון נשאר: מחיקה שם הייתה שוללת
       גישה ממי שיש לו אותה, בדיוק במכשיר שכבר במצוקה. */
    const c = ctxWith({ access: false }, { blocked: k => k === 'hw_entitlement' });
    c.__ls.seed('hw_entitlement', { access: true, offline_until: '2099-01-01' });

    assert.strictEqual((await c.refreshEntitlement()).access, false, 'הסשן הנוכחי');

    const onDisk = c.__ls.read('hw_entitlement');
    assert.notStrictEqual(c.entVerdict(onDisk === undefined ? null : onDisk, Date.now()), true,
      'הטעינה הבאה מחזירה גישה שהשרת שלל');
  });

  test('כתיבה שנכשלת על תשובה מתירה — המטמון נשמר', async () => {
    const c = ctxWith({ access: true }, { blocked: k => k === 'hw_entitlement' });
    c.__ls.seed('hw_entitlement', { access: true, offline_until: '2099-01-01' });
    await c.refreshEntitlement();
    assert.strictEqual(c.__ls.read('hw_entitlement').access, true,
      'מחיקת מטמון מתיר על דיסק מלא שוללת גישה ממי שיש לו אותה');
  });

  test('מטמון מורעל — מחרוזת אינה הכרעה', async () => {
    const c = ctxWith(null);
    c.__ls.seed('hw_entitlement', 'not an object');
    assert.strictEqual(c.entVerdict(await c.refreshEntitlement(), Date.now()), null);
  });
});
