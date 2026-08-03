'use strict';
/* "בעצם ידעתי" חייב לשחרר את המילה מרשימת החיזוק.
 *
 * הדיווח (2.8.2026): "אם אני מתרגל וטעיתי באיות... הסטטיסטיקה לא מתעדכנת, וזה לא יורד לאחר
 * 3-4 פעמים ממילים שאני חלש בהם למרות שכביכול אני כבר שולט בה."
 *
 * המנגנון, שנמדד ולא נוחש
 * ------------------------
 * 43% מהמילים באנגלית ו-65% בעברית נושאות יותר מפירוש אחד. עבורן commitSession מגביל את
 * הרמה ל-2 כל עוד sensesLeft>0 — כלל מכוון, שנולד מהתלונה "עונים פירוש אחד, מקבלים אוקיי,
 * ושוכחים את השאר". אבל weakCards מגדיר "חלשה" כ-level<3, ולכן מילה רב-משמעית נשארת
 * ברשימת החיזוק עד שיינתנו שני פירושים.
 *
 * ו-noteSense, שהיא הדרך היחידה לזכות בפירוש, נקראת רק כשהתשובה נכונה — ומשתמשת בהתאמה
 * מדויקת (`segs.indexOf(a)`). שגיאת כתיב לעולם לא תתאים. כלומר הלומד שטעה באיות ולחץ
 * "בעצם ידעתי" אינו מזוכה באף פירוש, התקרה נשארת 2 לנצח, והמילה לא יורדת מהחיזוק אף פעם.
 *
 * למה זיכוי הוא הפתרון הנכון, ולא הסרת התקרה
 * -------------------------------------------
 * התקרה עצמה נכונה ונשארת: מי שיודע פירוש אחד מתוך שלושה לא שולט במילה. מה שנשבר הוא שלא
 * הייתה שום דרך להתקדם דרך הכפתור. האפליקציה כבר סומכת על "בעצם ידעתי" כדי לקבוע
 * `mastered` — לסמוך עליו גם לזיכוי בפירוש הוא אותה רמת אמון בדיוק, לא רמה חדשה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const app = appSource();
const ctx = loadApp({ lang: 'en', bank: false });
for (const { name, code } of extractAll(app, ['creditSense', 'editDist', 'sensesLeft', 'senseCount', 'meaningSegs']))
  vm.runInContext(code, ctx, { filename: `app.js:${name}` });

const W = { term: 'spread', meaning: 'להתפשט; ממרח' };
const reset = () => { ctx.stats = { words: {}, sessions: [] }; };

describe('creditSense — הזיכוי שמאחורי "בעצם ידעתי"', () => {

  test('פירוש שנכתב נכון מזוכה', () => {
    reset();
    ctx.creditSense(W, 'ממרח');
    assert.deepStrictEqual(Array.from(ctx.stats.words.spread.sens || []), [1]);
  });

  test('שגיאת כתיב מזוכה גם היא — זה כל הדיווח', () => {
    /* "ממרך" במקום "ממרח". noteSense עם indexOf לא מוצאת אותה, ולכן הכפתור לא הועיל. */
    reset();
    ctx.creditSense(W, 'ממרך');
    assert.deepStrictEqual(Array.from(ctx.stats.words.spread.sens || []), [1],
      'שגיאת כתיב לא זוכתה — המילה תישאר ברשימת החיזוק לנצח');
  });

  test('כשאין שום קרבה — מזוכה הפירוש הראשון שטרם זוכה', () => {
    /* הלומד הצהיר שידע. לא לזכות אותו בכלום פירושו לכלוא את המילה בחיזוק בלי מוצא. */
    reset();
    ctx.creditSense(W, 'משהו אחר לגמרי');
    assert.deepStrictEqual(Array.from(ctx.stats.words.spread.sens || []), [0]);
  });

  test('שתי לחיצות משחררות את התקרה', () => {
    reset();
    ctx.creditSense(W, 'משהו');
    ctx.creditSense(W, 'עוד משהו');
    assert.strictEqual(ctx.sensesLeft(W.term, W.meaning), 0,
      'אחרי שני זיכויים התקרה עדיין 2 — המילה לא תגיע לרמה 3 לעולם');
  });

  test('אותו פירוש פעמיים אינו נספר פעמיים', () => {
    reset();
    ctx.creditSense(W, 'ממרח');
    ctx.creditSense(W, 'ממרח');
    assert.deepStrictEqual(Array.from(ctx.stats.words.spread.sens || []), [1]);
    assert.strictEqual(ctx.sensesLeft(W.term, W.meaning), 1,
      'לחיצה על אותו פירוש פתחה את התקרה בלי פירוש שני');
  });

  test('מילה עם פירוש אחד אינה מושפעת', () => {
    reset();
    ctx.creditSense({ term: 'solo', meaning: 'לבד' }, 'לבד');
    const r = ctx.stats.words.solo;
    assert.ok(!r || !r.sens || !r.sens.length, 'נרשם פירוש למילה חד-משמעית');
  });
});

describe('הכלל מחובר בפועל', () => {
  test('הכפתור "בעצם ידעתי" מזכה בפירוש', () => {
    const at = app.indexOf("id=\"wasRight\"");
    assert.ok(at > 0, 'הכפתור נעלם');
    const h = app.indexOf("$('#wasRight')");
    assert.ok(h > 0, 'המאזין של הכפתור נעלם');
    const body = app.slice(h, h + 500);
    assert.ok(/creditSense\(/.test(body),
      'הכפתור אינו מזכה בפירוש — מילה רב-משמעית תישאר בחיזוק גם אחרי עשר לחיצות');
  });

  test('התקרה עצמה נשארה — היא לא הבאג', () => {
    assert.ok(/sensesLeft\([^)]*\)\s*>\s*0\s*\)\s*\?\s*2\s*:\s*3/.test(app),
      'התקרה הוסרה. מי שיודע פירוש אחד מתוך שלושה אינו שולט במילה, וזו הייתה בקשה מפורשת');
  });
});
