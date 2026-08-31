'use strict';
/* התקדמות בהשלמת המשפטים — הדיסק, ההגירה, והמיזוג מהענן.
 *
 * למה הקובץ הזה קיים
 * -------------------
 * `hw_sent_prog` הוא מפתח localStorage חדש (11.8.2026) עם **מסלול סנכרון משלו**
 * דרך `extras.sent`, והגירה חד-פעמית ממבנה ישן. שלושת אלה — מפתח חדש, מיזוג
 * חדש, והגירה — הם בדיוק שלוש המחלקות שכבר נשכו בפרויקט הזה. עד עכשיו לא הייתה
 * עליהם אף בדיקה: `sentProg`, `saneSentRec`, `sentItemOk`, `applyExtras`
 * ו-`collectExtras` כולם מחוץ ל-SYMBOLS של sandbox.js, כלומר בלתי ניתנים לבדיקה.
 *
 * ⚠ הקובץ נבדק ב-11.8.2026 ורוב המסלולים נמצאו **תקינים**. הבדיקות כאן מקבעות
 * התנהגות נכונה שלא הייתה מוגנת, ולא מתעדות באגים. היוצא מן הכלל היחיד מסומן
 * במפורש למטה (hw_sent_done שאינו נמחק).
 *
 * למה מרים נפרד ולא sandbox.js
 * -----------------------------
 * sandbox.js בכוונה אינו מספק דיסק — ההערה בראש 07-storage מנמקת את זה. כאן
 * נדרש דיסק, ולכן משתמשים ב-_harness/fakeStorage.js.
 *
 * ⚠ מלכודת שנתפסה בבניית המרים, ורשומה כאן כדי שלא תחזור: `LS.set` נוגע
 * ב-`storageBarOn` בתוך ה-try של הכתיבה **המוצלחת**. הקשר בלי המשתנה הזה זורק
 * ReferenceError שנבלע ב-catch של LS.set, והמרים מדמה "דיסק מלא" על דיסק ריק.
 * בדיקות שנכתבות מול מרים כזה מתעדות תקלת מרים כהתנהגות האפליקציה. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadWithStorage } = require('./_harness/fakeStorage.js');
/* ⚠ אובייקט שנוצר בתוך ה-vm נושא prototype של אותו realm, ו-deepStrictEqual
   נופל על כך ולא על התוכן — "mystery red" שההערה ליד plain() ב-sandbox.js
   מזהירה ממנו במפורש. כל ערך שחוזר מהקוד המורם עובר דרכו. */
const { plain } = require('./_harness/sandbox.js');

const SYMS = ['isObj', 'SUF', 'KEY', 'SENT_KEY', 'SENT_PROG', 'saneSentRec', 'sentProg',
              'sentItemOk', 'LS', 'levelKeyFor', 'examPreFor', 'sizeKeyFor', 'EXAM_KEY',
              'CONN_PROG', 'saneConnRec', 'connProg',
              'collectExtras', 'applyExtras', 'shedStorage', 'showStorageBar', 'hideStorageBar'];

const load = (opts = {}) => loadWithStorage(SYMS, opts);

describe('saneSentRec — שום דבר מהדיסק אינו נאמן', () => {
  const c = load();

  test('ok לעולם אינו גדול מ-n', () => {
    assert.deepStrictEqual(plain(c.saneSentRec({ n: 3, ok: 99 })), { n: 3, ok: 3, last: 0 });
  });

  test('ערכים שליליים ושברים מנורמלים', () => {
    assert.deepStrictEqual(plain(c.saneSentRec({ n: -5, ok: -2 })), { n: 0, ok: 0, last: 0 });
    assert.deepStrictEqual(plain(c.saneSentRec({ n: 2.7, ok: 1.9 })), { n: 2, ok: 1, last: 0 });
  });

  test('זבל מוחזר כ-null ולא כרשומה חלקית', () => {
    for (const junk of [null, undefined, 'x', 42, []]) {
      assert.strictEqual(c.saneSentRec(junk), null, `${JSON.stringify(junk)} אמור להיפסל`);
    }
  });

  test('last מנורמל ל-0/1', () => {
    assert.strictEqual(c.saneSentRec({ n: 1, ok: 1, last: 'yes' }).last, 0);
    assert.strictEqual(c.saneSentRec({ n: 1, ok: 1, last: 7 }).last, 1);
  });
});

describe('sentProg — ההגירה מהמבנה הישן', () => {
  test('מערך המזהים הישן הופך למפה, שמרנית: n=1 ok=0', () => {
    const c = load();
    c.__ls.seed('hw_sent_done', ['a', 'b']);
    /* הכיוון השמרני מכוון: הפריטים נענו ואיננו יודעים את התוצאה, ולכן הם
       מוצגים כ"נפתרו ולא נכונים" ומוחזרים לתרגול — במקום להצהיר על שליטה
       שלא נמדדה. */
    assert.deepStrictEqual(plain(c.sentProg()), {
      a: { n: 1, ok: 0, last: 0 }, b: { n: 1, ok: 0, last: 0 },
    });
  });

  test('המבנה החדש גובר כששניהם קיימים', () => {
    const c = load();
    c.__ls.seed('hw_sent_done', ['old']);
    c.__ls.seed('hw_sent_prog', { fresh: { n: 5, ok: 4, last: 1 } });
    assert.deepStrictEqual(plain(c.sentProg()), { fresh: { n: 5, ok: 4, last: 1 } });
  });

  test('⭐ הכתיבה נכשלת — ההגירה עדיין מוחזרת, ולא אובדת', () => {
    /* זה המסלול המסוכן: אם ההגירה הייתה מוחקת את המקור לפני שהיא מוודאת
       שהיעד נכתב, דיסק מלא היה מוחק את כל ההתקדמות. */
    const c = load({ blocked: k => k === 'hw_sent_prog' });
    c.__ls.seed('hw_sent_done', ['a', 'b']);
    const first = plain(c.sentProg());
    assert.deepStrictEqual(Object.keys(first).sort(), ['a', 'b']);
    assert.deepStrictEqual(plain(c.sentProg()), first, 'קריאה שנייה חייבת להחזיר את אותו דבר');
  });

  test('⚠ המפתח הישן נמחק אחרי הגירה מוצלחת — ורק אחריה', () => {
    /* ממצא 11.8.2026: hw_sent_done נשאר על הדיסק לנצח אחרי ההגירה. הוא כבר
       לא נקרא (המבנה החדש גובר), ולכן אלה נתונים מתים שתופסים מכסה — באפליקציה
       שיש בה מנגנון shedStorage שלם מפני שהמכסה נגמרת בפועל.
       המחיקה חייבת להיות מותנית בהצלחת הכתיבה: LS.set מחזיר בוליאני, ומחיקה
       אחרי כתיבה שנכשלה מוחקת את העותק היחיד. */
    const ok = load();
    ok.__ls.seed('hw_sent_done', ['a']);
    ok.sentProg();
    assert.strictEqual(ok.__ls.read('hw_sent_done'), undefined,
      'hw_sent_done שרד הגירה מוצלחת — נתונים מתים שתופסים מכסה');

    const full = load({ blocked: k => k === 'hw_sent_prog' });
    full.__ls.seed('hw_sent_done', ['a']);
    full.sentProg();
    assert.deepStrictEqual(full.__ls.read('hw_sent_done'), ['a'],
      'המקור נמחק למרות שהכתיבה נכשלה — זה אובדן ההתקדמות כולה');
  });
});

describe('applyExtras · sent — מיזוג מונוטוני מהענן', () => {
  test('ענן שמאחר אינו גורר אחורה מכשיר שקדם לו', () => {
    const c = load({ lang: 'en' });
    c.__ls.seed('hw_sent_prog', { x: { n: 5, ok: 3, last: 1 } });
    c.applyExtras('en', { sent: { x: { n: 2, ok: 1, last: 0 } } });
    assert.deepStrictEqual(c.__ls.read('hw_sent_prog').x, { n: 5, ok: 3, last: 1 });
  });

  test('ok גדול מ-n מהענן נחסם — אחוז שליטה לא יעבור 100', () => {
    const c = load({ lang: 'en' });
    c.__ls.seed('hw_sent_prog', { x: { n: 1, ok: 0, last: 0 } });
    c.applyExtras('en', { sent: { x: { n: 2, ok: 99, last: 0 } } });
    const r = c.__ls.read('hw_sent_prog').x;
    assert.ok(r.ok <= r.n, `ok=${r.ok} > n=${r.n}`);
  });

  test('פריט שקיים רק בענן נוסף', () => {
    const c = load({ lang: 'en' });
    c.__ls.seed('hw_sent_prog', { x: { n: 1, ok: 1, last: 1 } });
    c.applyExtras('en', { sent: { y: { n: 3, ok: 2, last: 1 } } });
    assert.deepStrictEqual(Object.keys(c.__ls.read('hw_sent_prog')).sort(), ['x', 'y']);
  });

  test('רשומות פגומות מהענן אינן מפילות ואינן נכנסות', () => {
    const c = load({ lang: 'en' });
    c.__ls.seed('hw_sent_prog', { x: { n: 1, ok: 1, last: 0 } });
    c.applyExtras('en', { sent: { a: null, b: 'str', c: 42, d: [], e: { n: 'x', ok: {} } } });
    assert.deepStrictEqual(c.__ls.read('hw_sent_prog'), { x: { n: 1, ok: 1, last: 0 } });
  });

  test('כתיבה שנכשלת אינה זורקת החוצה ואינה משנה את המקומי', () => {
    const c = load({ lang: 'en', blocked: k => k === 'hw_sent_prog' });
    c.__ls.seed('hw_sent_prog', { x: { n: 1, ok: 0, last: 0 } });
    c.applyExtras('en', { sent: { x: { n: 5, ok: 4, last: 1 } } });
    assert.deepStrictEqual(c.__ls.read('hw_sent_prog').x, { n: 1, ok: 0, last: 0 });
  });
});

describe('הפרדת שפות — השלמת משפטים היא אנגלית בלבד', () => {
  /* enterLang שולח ל-mode רק כש-lang==='en'; בעברית אין תרגול משפטים כלל.
     לכן מפתח יחיד בלי סיומת שפה הוא הנכון — אבל רק כל עוד שני הצדדים
     מגודרים. הבדיקה הזאת שומרת על הגידור. */

  test('collectExtras("he") אינו כולל sent', () => {
    const c = load({ lang: 'he' });
    c.__ls.seed('hw_sent_prog', { x: { n: 3, ok: 2, last: 1 } });
    assert.ok(!Object.prototype.hasOwnProperty.call(c.collectExtras('he'), 'sent'),
      'התקדמות המשפטים נוסעת על שורת העברית — היא שייכת לאנגלית בלבד');
  });

  test('collectExtras("en") כן כולל sent', () => {
    const c = load({ lang: 'en' });
    c.__ls.seed('hw_sent_prog', { x: { n: 3, ok: 2, last: 1 } });
    assert.deepStrictEqual(plain(c.collectExtras('en').sent), { x: { n: 3, ok: 2, last: 1 } });
  });

  test('applyExtras("he") אינו נוגע בהתקדמות המשפטים', () => {
    const c = load({ lang: 'he' });
    c.__ls.seed('hw_sent_prog', { x: { n: 1, ok: 1, last: 0 } });
    c.applyExtras('he', { sent: { x: { n: 9, ok: 9, last: 1 } } });
    assert.deepStrictEqual(c.__ls.read('hw_sent_prog').x, { n: 1, ok: 1, last: 0 });
  });
});

describe('sentItemOk — השומר על פריט בזמן ריצה', () => {
  const c = load();
  const good = { s: 'a __ b', o: ['x', 'y'], a: 0, g: ['g1', 'g2'], r: ['r1', 'r2'], t: 'note' };

  test('פריט תקין עובר', () => assert.strictEqual(c.sentItemOk(good), true));

  test('כל צורה פגומה נפסלת', () => {
    const bad = {
      'a מחוץ לטווח': { ...good, a: 5 },
      'a שלילי': { ...good, a: -1 },
      'a שבר': { ...good, a: 0.5 },
      'g באורך שונה מ-o': { ...good, g: ['g1'] },
      'r באורך שונה מ-o': { ...good, r: ['r1'] },
      'משפט בלי מקום ריק': { ...good, s: 'no blank here' },
      'אפשרות אחת בלבד': { ...good, o: ['x'], g: ['g1'], r: ['r1'] },
      't ריק': { ...good, t: '   ' },
      'לא אובייקט': 'x',
    };
    for (const [why, item] of Object.entries(bad)) {
      assert.strictEqual(c.sentItemOk(item), false, `${why} — עבר את השומר`);
    }
  });
});
