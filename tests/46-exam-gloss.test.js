'use strict';
/* למבחן היחידה לא הייתה מקבילה ל-oneCardPerGloss, ולכן יכלו להופיע בו שתי שאלות עם אותו פירוש.
 *
 * הרקע
 * -----
 * בתרגול, oneCardPerGloss מונע שתי שאלות שהפירוש בהן זהה (הוא הופך את הכפילות מ-m2w ל-w2m
 * במקום למחוק). למבחן אין את זה. נמדד: בכל אחת מ-10 יחידות האנגלית יש לפחות קבוצת-פירוש
 * משותפת אחת · למשל "although" ו-"even though", שניהם "למרות ש-". כששניהם נבחרים, המבחן
 * מציג את אותו פירוש כשאלה פעמיים.
 *
 * התיקון
 * -------
 * בלולאת הבחירה ב-exBuild מדלגים על מועמד שהפירוש שלו כבר נלקח (glossKey). הרשת הקיימת · 
 * "יחידה קטנה או כל היחידה, כיסוי לפני ליטוש" · ממלאה חזרה אם הדילוג הוריד מתחת לכמות
 * המבוקשת, ולכן בחירת "כל היחידה" עדיין מחזירה את כל המילים.
 *
 * הבדיקה, דטרמיניסטית
 * --------------------
 * shuffle מוחלף בזהות, כך שהבחירה סורקת את המילים בסדר הנתונים. ביחידה 2 המילה השנייה
 * מקבוצת "למרות ש-" יושבת באינדקס 124; בבקשה של 130 שאלות, הקוד ללא התיקון בוחר את שתיהן,
 * והתיקון מדלג וממלא הלאה. הבדיקה דורשת שכל הפירושים בשאלות שנבחרו שונים זה מזה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const app = appSource();
const ctx = loadApp({ lang: 'en', bank: true });
for (const { name, code } of extractAll(app,
  ['exTake', 'exWords', 'exBuild', 'exDistract', 'exTestable', 'shuffle', 'EX_LEN',
   'isTranslit', 'TRL', 'skel', 'exWriteOk', 'glossKey', 'maskTerm', 'normEn', 'norm']))
  vm.runInContext(code, ctx, { filename: name });

// זהות · כדי שהבחירה תהיה דטרמיניסטית בסדר הנתונים, ולא תלויה בהגרלה
ctx.shuffle = a => a;
const glossKey = ctx.glossKey;

describe('מבחן היחידה · פירוש אחד לכל שאלה', () => {

  test('אין שתי שאלות עם אותו פירוש', () => {
    const items = ctx.exBuild('2', 130);
    assert.ok(items.length > 0, 'exBuild החזיר מבחן ריק -- האם היחידה או הכלים השתנו?');
    const glosses = items.map(it => glossKey(it.it.meaning));
    const seen = new Set(), dup = [];
    for (const g of glosses) { if (g.length >= 2 && seen.has(g)) dup.push(g); else seen.add(g); }
    assert.deepStrictEqual(dup, [],
      'שני פריטים במבחן חולקים פירוש -- אותה שאלה מופיעה פעמיים: ' + dup.join(', '));
  });

  test('בחירת "כל היחידה" עדיין מחזירה את כל המילים', () => {
    /* התיקון לא רשאי לצמצם את המבחן המלא: מי שבחר את כל היחידה מקבל את כולה, כפילויות ועוד. */
    const n = ctx.exWords('2').length;
    assert.strictEqual(ctx.exBuild('2', 0).length, n,
      'דדופ הפירושים הוריד את "כל היחידה" מתחת לגודל היחידה');
  });
});
