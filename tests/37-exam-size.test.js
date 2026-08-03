'use strict';
/* כמה שאלות במבחן היחידה — בורר, כמו בתרגול.
 *
 * הבקשה: "במבחן היחידה צריך להוסיף כפתור ברירה של כמה מילים אני רוצה להיבחן עליהם — 20 או
 * יותר... כמו שאנחנו בוחרים כמה מילים לתרגל".
 *
 * שתי מלכודות שהכלל הזה נופל אליהן בשקט
 * --------------------------------------
 * 1. בחירה גדולה מהיחידה. מי שבחר 50 ואז נכנס ליחידה של 30 היה מקבל מבחן של 30 — נכון —
 *    אבל מסך שמבטיח 50. הרצפה חשובה לא פחות: exBuild מסרב לבנות מתחת ל-8, ובחירה נמוכה
 *    מזה הייתה מחזירה מבחן ריק בלי הסבר.
 * 2. הפירוט שמתחת לבורר. הוא נגזר מהבחירה, ולכן הוא מצויר באותה פונקציה — לצייר אותם
 *    בנפרד היה מאפשר להם להיפרד: "20 שאלות" מעל בורר שעומד על 50.
 *
 * exTake היא טהורה בכוונה, ו-exBuild מקבלת את הכמות כפרמטר. פונקציה שקוראת בעצמה מ-LS
 * אינה ניתנת לבדיקה בלי לזייף את שכבת האחסון, וכלל החיתוך הוא בדיוק מה שצריך להיבדק.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const app = appSource();
const ctx = loadApp({ lang: 'en', bank: true });
for (const { name, code } of extractAll(app, ['exTake', 'EX_SIZES', 'exWords', 'exBuild', 'exDistract', 'exTestable', 'shuffle', 'EX_LEN', 'isTranslit', 'TRL', 'skel', 'exWriteOk']))
  vm.runInContext(code, ctx, { filename: `app.js:${name}` });

describe('exTake — כלל החיתוך', () => {

  test('0 פירושו כל היחידה, ולא אפס', () => {
    /* נשמר 0 ולא המספר עצמו, כדי שהבחירה תישאר נכונה גם אחרי שהיחידה גדלה או קטנה. */
    assert.strictEqual(ctx.exTake(395, 0), 395);
    assert.strictEqual(ctx.exTake(41, 0), 41);
  });

  test('בחירה גדולה מהיחידה נחתכת לגודל היחידה', () => {
    assert.strictEqual(ctx.exTake(30, 50), 30, 'המסך היה מבטיח 50 שאלות מיחידה של 30');
  });

  test('בחירה קטנה מ-8 מורמת ל-8', () => {
    /* exBuild מסרב לבנות מתחת ל-8. בלי הרצפה הזאת בחירה נמוכה מחזירה מבחן ריק בלי הסבר. */
    assert.strictEqual(ctx.exTake(395, 3), 8);
    assert.strictEqual(ctx.exTake(395, 1), 8);
  });

  test('ערך פגום נופל לגודל היחידה ולא מתרסק', () => {
    /* הערך מגיע מ-localStorage, שאפשר לערוך בידיים. */
    assert.strictEqual(ctx.exTake(40, undefined), 40);
    assert.strictEqual(ctx.exTake(40, 'שלום'), 40);
    assert.strictEqual(ctx.exTake(40, -5), 40);
  });

  test('בחירה סבירה מתקבלת כמו שהיא', () => {
    assert.strictEqual(ctx.exTake(395, 30), 30);
    assert.strictEqual(ctx.exTake(395, 20), 20);
  });

  test('כל גודל מוצע הוא לפחות הרצפה', () => {
    /* אחרת יופיע בבורר מספר שלחיצה עליו נותנת מספר אחר. */
    for (const n of ctx.EX_SIZES)
      assert.ok(n >= 8, `הבורר מציע ${n}, והרצפה תעלה אותו ל-8`);
  });
});

describe('exBuild מכבד את הכמות', () => {
  const uid = ctx.UNIT_IDS.find(u => ctx.exWords(u).length >= 60);

  test('בונה בדיוק כמה שביקשו', () => {
    assert.ok(uid, 'אין יחידה גדולה מספיק לבדוק עליה');
    assert.strictEqual(ctx.exBuild(uid, 12).length, 12);
    assert.strictEqual(ctx.exBuild(uid, 40).length, 40);
  });

  test('בלי פרמטר — ההתנהגות ההיסטורית, 20', () => {
    /* הבדיקות הקיימות קוראות ל-exBuild(uid) בלי כמות, ואסור שהן ימדדו מבחן באורך אחר. */
    assert.strictEqual(ctx.exBuild(uid).length, Math.min(ctx.EX_LEN, ctx.exWords(uid).length));
  });

  test('0 בונה את כל היחידה', () => {
    assert.strictEqual(ctx.exBuild(uid, 0).length, ctx.exWords(uid).length);
  });
});

describe('מחובר למסך', () => {
  const html = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'index.html'), 'utf8');

  test('הבורר קיים במסך הפתיחה של המבחן', () => {
    assert.ok(/id="exSizeSeg"/.test(html), 'הבורר נעלם');
    assert.ok(html.indexOf('id="exSizeSeg"') < html.indexOf('id="exParts"'),
      'הבורר יושב אחרי הפירוט שהוא אמור לשלוט בו');
  });

  test('הפירוט מצויר מאותה בחירה, באותה פונקציה', () => {
    const at = app.indexOf('function renderExSize');
    assert.ok(at > 0, 'renderExSize נעלמה');
    const body = app.slice(at, at + 1400);
    assert.ok(/exSizeSeg/.test(body) && /exParts/.test(body) && /exSub/.test(body),
      'הבורר והפירוט מצוירים בנפרד — הם יוכלו להראות מספרים שונים');
  });

  test('המבחן עצמו נבנה מהבחירה השמורה', () => {
    assert.ok(/exBuild\(exUnit,\s*LS\.get\(exLenKey\(\)/.test(app),
      'המבחן נבנה בגודל קבוע — הבורר משנה רק את התצוגה');
  });
});
