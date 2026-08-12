'use strict';
/* מבחן רמה — המסך ששותק אחרי המבחן.
 *
 * הדיווח (12.8.2026)
 * -------------------
 *   "עשיתי את המבחן כניסה · קיבלתי רמה של בינוני פלוס · היה אמור לחסוך לי מילים ·
 *    אבל מבחינת היחידות לימוד זה נותר זהה, לא קיבלתי סלקציה מסוימת ונאלצתי לבצע אותה לבד"
 *
 * וזו הפעם השנייה. דיווח id=2 (31.7.2026, lang=he) אמר את אותו הדבר בקצרה:
 *   "אחרי מבחן רמה בעברית אין סינון כלשהו של המילים"
 *
 * מה נמצא
 * --------
 * הדילוג נשען על דירוג שכיחות, והוא קיים באנגלית בלבד — זו החלטה מתועדת, לא באג.
 * העברית כבר מקבלת פאנל שמסביר את זה. אבל הענף השלישי לא נכתב מעולם:
 *
 *     if(skippable>=40){ ...ההצעה... }
 *     else if(LV_LANG==='he'){ ...ההסבר... }
 *     // אנגלית עם פחות מ-40 — נופל בין הכיסאות, הפאנל נשאר מוסתר
 *
 * כלומר לומד אנגלית שסיים מבחן ואין לו 40 מילים לדילוג מקבל מסך ששותק. הוא שכיח
 * במיוחד ברמות A1/A2, שבהן LV_CUT הוא 0 ולכן skippable הוא תמיד 0 — כל לומד מתחיל
 * באנגלית נופל לשם, בכל מבחן, תמיד.
 *
 * שלוש הבדיקות למטה הן על lvOfferKind, שהוא הצומת שמכריע מה המסך אומר. הן נכתבו
 * לפני התיקון ונראו אדומות: הפונקציה לא הייתה קיימת, ואחרי שנכתבה — הענף השלישי
 * החזיר את אותו ערך כמו העברית ונפל על הבדיקה השנייה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./_harness/sandbox.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAll } = require('./_harness/extract.js');
const { ROOT } = require('./_harness/sandbox.js');

const SYMS = ['LV_CUT', 'lvOfferKind', 'LV_SUB', 'lvOfferNote'];
function load() {
  const ctx = loadApp({});
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  for (const { name, code } of extractAll(src, SYMS))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
  return ctx;
}

describe('מבחן רמה — אף מסך תוצאה אינו שותק', () => {
  test('אנגלית עם 40 מילים ומעלה — ההצעה לדלג', () => {
    const ctx = load();
    assert.strictEqual(ctx.lvOfferKind('en', 40, 2000), 'offer');
    assert.strictEqual(ctx.lvOfferKind('en', 3000, 10000), 'offer');
  });

  test('אנגלית בלי מספיק מילים לדילוג — הסבר, לא שתיקה', () => {
    const ctx = load();
    /* זה הליקוי עצמו: שני המצבים האלה החזירו מסך ריק */
    const few = ctx.lvOfferKind('en', 39, 2000);
    const basic = ctx.lvOfferKind('en', 0, ctx.LV_CUT.A1);
    for (const k of [few, basic]) {
      assert.ok(k, 'חייב להיות סוג מסר, לא ערך ריק');
      assert.notStrictEqual(k, 'offer', 'אין מה להציע כשאין מספיק מילים');
    }
    /* ושני המצבים אינם אותו מסר: "אין דילוג ברמה הזו" אינו "לא נמצאו מספיק מילים" */
    assert.notStrictEqual(few, basic, 'שתי סיבות שונות מחייבות שני הסברים שונים');
    for (const k of [few, basic]) {
      const note = ctx.lvOfferNote(k);
      assert.ok(note && /[א-ת]/.test(note), 'לכל סוג יש נוסח עברי: ' + k);
      assert.ok(!/—/.test(note), 'בלי מקף ארוך: ' + k);
    }
  });

  test('עברית — תמיד ההסבר, לעולם לא ההצעה', () => {
    const ctx = load();
    /* גם אם ספירה כלשהי תדלוף לכאן בעתיד, עברית לא אמורה להציע דילוג:
       אין לה מקור שכיחות, וההצעה הייתה טענה שהנתונים אינם תומכים בה. */
    for (const n of [0, 39, 40, 5000])
      assert.notStrictEqual(ctx.lvOfferKind('he', n, 2000), 'offer',
        'עברית קיבלה הצעת דילוג עם skippable=' + n);
    const note = ctx.lvOfferNote(ctx.lvOfferKind('he', 0, 0));
    assert.ok(/[א-ת]/.test(note) && !/—/.test(note), 'לעברית יש נוסח, והוא בלי מקף ארוך');
  });
});
