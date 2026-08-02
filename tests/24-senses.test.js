'use strict';
/* מילה עם כמה פירושים אינה נלמדת בפירוש אחד.
 *
 * הראיה
 * ------
 * משתמש דיווח: "אני עונה פירוש אחד מתוך כמה, מקבל אוקיי מהאפליקציה שלמדתי אותה, ואנחנו
 * שוכחים את שאר הפירושים." הוא צדק — meaningMatch מקבלת כל פירוש רשום כתשובה מלאה,
 * ו-commitSession העלתה לרמה 3 על סמך אותה תשובה. השורה "גם: X · Y" כבר הוצגה, אבל היא
 * הערה, והמילה כבר נספרה כנלמדה בזמן שהיא נקראה.
 *
 * מה שנבנה
 * ---------
 * הרשומה זוכרת אילו פירושים נכתבו (`sens`, אינדקסים לתוך meaningSegs), והרמה נחסמת ב-2
 * כל עוד לא נכתבו שניים. 2 ולא 0 — המילה ממשיכה לעלות ויוצאת מ"חדשות", היא פשוט לא
 * נחשבת נלמדה.
 *
 * שני כשלים הפוכים, ושניהם נבדקים כאן:
 *   · לא לחסום בכלל — ואז שום דבר לא השתנה.
 *   · לחסום מילה עם פירוש אחד — ואז אף מילה פשוטה לא תגיע לחוזק מלא, לעולם.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./_harness/sandbox.js');

const he = loadApp({ lang: 'he' });
const R = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);

describe('saneRec — הזיכרון של הפירושים שנענו', () => {

  test('מערך תקין נשמר ממוין ובלי כפילויות', () => {
    const r = he.saneRec(R({ sens: [2, 0, 2, 1] }));
    assert.deepStrictEqual(Array.from(r.sens), [0, 1, 2],
      'כפילות הייתה נספרת כשני פירושים — אותו פירוש שנכתב פעמיים אינו שניים');
  });

  test('זבל לא מפיל ולא נשמר', () => {
    for (const junk of [null, 'abc', 42, {}, [{}, 'x']]) {
      const r = he.saneRec(R({ sens: junk }));
      if (r.sens !== undefined) {
        assert.ok(Array.isArray(r.sens), 'sens חזר כלא-מערך: ' + JSON.stringify(junk));
        assert.ok(r.sens.every(Number.isInteger), 'sens מכיל ערך שאינו מספר שלם');
      }
    }
  });

  test('רשומה בלי sens נשארת בלי sens — ולא מקבלת מערך ריק', () => {
    /* רשומה נדחפת לענן בכל סבב. מערך ריק בכל אחת מ-1,717 המילים הוא נפח על לא כלום. */
    assert.strictEqual(he.saneRec(R({})).sens, undefined);
    assert.strictEqual(he.saneRec(R({ sens: [] })).sens, undefined);
  });

  test('התקרה — לכל היותר 8, ומי אוכף אותה', () => {
    /* ב-saneRec התקרה נובעת מ-int0(x,7): כל ערך נחסם ב-7, ואחרי dedup יש לכל היותר
       שמונה. אין שם slice בכוונה — שורה שלא יכולה לרוץ נראית כהגנה ואינה הגנה. */
    const r = he.saneRec(R({ sens: [0,1,2,3,4,5,6,7,8,9,10] }));
    assert.strictEqual(r.sens.length, 8, 'התקרה נשברה: ' + JSON.stringify(r.sens));
    assert.ok(r.sens.every(i => i <= 7), 'ערך מעל 7 שרד: ' + JSON.stringify(r.sens));
  });

  test('noteSense לא מנפח רשומה — שם התקרה כן נושאת משקל', () => {
    /* הנתיב הזה אינו עובר דרך int0, ולכן הוא זה שיכול לתפוח. רשומה נדחפת לענן בכל
       סבב, ומערך שגדל בלי גבול מנפח כל אחת מ-1,717 המילים. */
    const meaning = Array.from({length: 12}, (_, i) => 'פ' + i).join(', ');
    const w = { term: 'מילה-רבת-פירושים', meaning };
    he.stats.words[he.K(w.term)] = he.saneRec(R({ seen: 1 }));
    for (const seg of he.meaningSegs(meaning)) he.noteSense(w, seg);
    const got = he.stats.words[he.K(w.term)].sens;
    assert.ok(got.length <= 8, 'הרשומה תפחה ל-' + got.length + ' פירושים');
  });
});

describe('senseCount / sensesLeft — כמה נדרש ומה כבר ניתן', () => {

  test('פירוש יחיד — אין דרישה', () => {
    /* הבדיקה הכי חשובה בקובץ. אם היא נופלת, אף מילה פשוטה לא תגיע לחוזק מלא לעולם. */
    assert.strictEqual(he.senseCount('כעס'), 1);
    assert.strictEqual(he.sensesLeft('שום-מילה', 'כעס'), 0);
  });

  test('שני פירושים ואף אחד לא ניתן — נדרשים שניים', () => {
    assert.strictEqual(he.senseCount('פחד, חשש'), 2);
    assert.strictEqual(he.sensesLeft('מילה-חדשה', 'פחד, חשש'), 2);
  });

  test('אחרי פירוש אחד — נדרש עוד אחד', () => {
    he.stats.words[he.K('א')] = he.saneRec(R({ seen: 1, sens: [0] }));
    assert.strictEqual(he.sensesLeft('א', 'פחד, חשש'), 1);
  });

  test('אחרי שניים — אין דרישה, גם כשיש חמישה פירושים', () => {
    /* דורשים שניים ולא את כולם: ערך עם חמישה פירושים היה הופך למלכודת שאי אפשר לצאת
       ממנה, והלומד היה רואה אותו חוזר לנצח. */
    he.stats.words[he.K('ב')] = he.saneRec(R({ seen: 2, sens: [0, 3] }));
    assert.strictEqual(he.sensesLeft('ב', 'א, ב, ג, ד, ה'), 0);
  });

  test('אינדקס שכבר לא קיים בפירוש אינו נספר', () => {
    /* הפירוש נערך והתקצר. אינדקס 4 מצביע לשומקום, וספירתו הייתה מזכה את הלומד בפירוש
       שהוא מעולם לא כתב. */
    he.stats.words[he.K('ג')] = he.saneRec(R({ seen: 1, sens: [0, 4] }));
    assert.strictEqual(he.sensesLeft('ג', 'פחד, חשש'), 1);
  });
});

describe('הכלל עצמו — פירוש אחד אינו מספיק לחוזק מלא', () => {

  /* meaningSegs מכריעה גם מה נחשב תשובה נכונה וגם כמה פירושים יש. שתי הספירות חייבות
     לצאת מאותו מקום — אחרת תשובה תתקבל כנכונה על פירוש שהמונה לא יודע עליו. */
  test('הספירה נגזרת מאותה חלוקה שמכריעה נכונות', () => {
    const m = 'פחד, חשש; מורא';
    assert.strictEqual(he.senseCount(m), he.meaningSegs(m).length);
    for (const seg of he.meaningSegs(m)) {
      assert.ok(he.meaningMatch(seg, m), 'פירוש שנספר אך אינו מתקבל כתשובה: ' + seg);
    }
  });

  test('פרנתזה אינה פירוש נוסף', () => {
    /* "יגור :: פוחד (אשר יגורתי בא)" — הדוגמה בסוגריים אינה פירוש, ואם תיספר, המילה
       תדרוש תשובה שאי אפשר לתת. */
    assert.strictEqual(he.senseCount('פוחד (אשר יגורתי בא)'), 1);
    assert.strictEqual(he.sensesLeft('ד', 'פוחד (אשר יגורתי בא)'), 0);
  });
});
