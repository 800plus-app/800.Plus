'use strict';
/* "ידעתי" — המצב שבאמצע בין מחיקה לתרגול.
 *
 * דיווח משתמשת (2.8.2026): "יצא לי לחפש האם יש אפשרות לסמן מילים שמכירים מתוך המאגר...
 * כי אני כן רוצה לתרגל אותם אבל לא ללמוד מחדש".
 *
 * מחיקה הייתה התשובה היחידה שהייתה, והיא חזקה מדי: מילה מחוקה נעלמת מכל סבב ומכל מבחן.
 * מה שנדרש הוא להוציא אותה מ"מילים לחיזוק" ומ"מילים שעוד לא תרגלת", ולהשאיר אותה זמינה.
 *
 * שלושת הדברים שהבדיקות כאן שומרות עליהם, ושכל אחד מהם נשבר בשקט
 * -----------------------------------------------------------------
 * 1. המילה יוצאת מהחיזוק — אחרת התכונה לא עשתה כלום.
 * 2. המילה נשארת בתרגול — אחרת סימון "ידעתי" הוא מחיקה בשם אחר, וזו בדיוק הבקשה שנדחתה.
 * 3. ביטול הסימון מחזיר את הרמה שהייתה. בלי k0 הביטול היה מאפס היסטוריית תרגול אמיתית,
 *    ומי שסימן בטעות היה משלם על הטעות בכל מה שלמד על המילה הזאת.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const app = appSource();
const ctx = loadApp({ lang: 'en', bank: true });
for (const { name, code } of extractAll(app, ['isKnown', 'markKnown', 'unmarkKnown', 'allCards', 'shuffle']))
  vm.runInContext(code, ctx, { filename: `app.js:${name}` });

const TERM = ctx.BANK[0].term;
const SCOPE = 'unit:' + ctx.BANK[0].unit;
const has = (list, t) => list.some(w => ctx.K(w.term) === ctx.K(t));
const reset = () => { ctx.stats = { words: {}, sessions: [] }; };

describe('סימון "ידעתי"', () => {

  test('מוציא את המילה מרשימת החיזוק', () => {
    reset();
    /* מילה שתורגלה ונכשלה — בדיוק המקרה של הדיווח */
    ctx.stats.words[ctx.K(TERM)] = { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 1 };
    assert.ok(has(ctx.weakCards(SCOPE), TERM), 'הבדיקה לא התחילה מהמצב שהיא אמורה לבדוק');
    ctx.markKnown(TERM);
    assert.ok(!has(ctx.weakCards(SCOPE), TERM), 'המילה נשארה בחיזוק — הסימון לא עשה דבר');
  });

  test('המילה נשארת זמינה לתרגול — זה כל ההבדל ממחיקה', () => {
    reset();
    ctx.markKnown(TERM);
    assert.ok(has(ctx.allCards(SCOPE), TERM), '"ידעתי" הפך למחיקה בשם אחר');
    assert.ok(has(ctx.learnedCards(SCOPE), TERM), 'המילה נעלמה גם מ"מילים שלמדתי"');
  });

  test('ואינה חוזרת כ"מילה שעוד לא תרגלת"', () => {
    reset();
    ctx.markKnown(TERM);
    assert.ok(!has(ctx.newCards(SCOPE), TERM), 'המילה חזרה כחדשה אחרי שסומנה כידועה');
  });

  test('ביטול הסימון מחזיר את הרמה שהייתה, ולא מאפס', () => {
    reset();
    ctx.stats.words[ctx.K(TERM)] = { seen: 5, first: 2, ever: 4, wrong: 1, level: 2, last: 9 };
    ctx.markKnown(TERM);
    assert.strictEqual(ctx.lvl(TERM), 3);
    ctx.unmarkKnown(TERM);
    assert.strictEqual(ctx.lvl(TERM), 2, 'הביטול איפס היסטוריית תרגול אמיתית');
    assert.strictEqual(ctx.isKnown(TERM), false);
    assert.strictEqual(ctx.stats.words[ctx.K(TERM)].first, 2, 'שאר ההיסטוריה נפגעה');
  });

  test('סימון כפול אינו דורס את הרמה השמורה', () => {
    /* markKnown מציב level=3. קריאה שנייה הייתה שומרת 3 כ-k0, וביטול היה משאיר את המילה
       "ידועה" בלי הסימון — מצב שאין ממנו חזרה. */
    reset();
    ctx.stats.words[ctx.K(TERM)] = { seen: 5, first: 2, ever: 4, wrong: 1, level: 1, last: 9 };
    ctx.markKnown(TERM);
    assert.strictEqual(ctx.markKnown(TERM), false, 'סימון שני החזיר true');
    ctx.unmarkKnown(TERM);
    assert.strictEqual(ctx.lvl(TERM), 1, 'הרמה המקורית אבדה בסימון הכפול');
  });

  test('ביטול על מילה שלא סומנה אינו נוגע בכלום', () => {
    reset();
    ctx.stats.words[ctx.K(TERM)] = { seen: 2, first: 1, ever: 1, wrong: 0, level: 2, last: 3 };
    assert.strictEqual(ctx.unmarkKnown(TERM), false);
    assert.strictEqual(ctx.lvl(TERM), 2);
  });

  test('הסימון אינו מתחזה לדילוג של מבחן הרמה', () => {
    /* wasSkipped מסמן מילים שמבחן הרמה דילג עליהן על סמך הערכה סטטיסטית, והן מוחרגות
       מ"מילים שלמדתי". כאן הלומד הצהיר במפורש — שני דברים שונים שאסור להם להתערבב. */
    reset();
    ctx.markKnown(TERM);
    assert.strictEqual(ctx.wasSkipped(TERM), false,
      'מילה שהלומד סימן נספרת כמילה שמבחן הרמה דילג עליה');
  });
});

describe('השדות שורדים טעינה מחדש', () => {
  test('saneRec שומר את src ואת k0', () => {
    /* saneRec היא רשימה לבנה. שדה שלא נמצא בה נמחק בטעינה הראשונה — כלומר הסימון היה
       נעלם בפתיחה הבאה של האפליקציה, וזה כשל שאף בדיקה אחרת לא רואה. */
    const out = ctx.saneRec({ seen: 4, level: 3, src: 'known', k0: 2 });
    assert.strictEqual(out.src, 'known', 'הסימון נמחק בטעינה — המילה תחזור לחיזוק לבד');
    assert.strictEqual(out.k0, 2, 'הרמה השמורה נמחקה — ביטול הסימון יאפס היסטוריה');
  });
});

describe('מחובר למסך', () => {
  test('כל שורה בניהול מילים נושאת את הכפתור', () => {
    assert.ok(/data-known=/.test(app), 'הכפתור לא נבנה בשורה');
    assert.ok(/\[data-known\][\s\S]{0,200}preventDefault/.test(app),
      'אין preventDefault — לחיצה על "ידעתי" תסמן את תיבת המחיקה שלצדה');
  });

  test('לכל יחידה יש כניסה לניהול מילים', () => {
    const html = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(/id="pbManage"/.test(html), 'הכפתור נעלם ממסך היחידה');
    assert.ok(/\$\('#pbManage'\)\.onclick[\s\S]{0,160}openManage\(/.test(app),
      'הכפתור אינו מחובר ל-openManage');
  });

  test('openManage פותח את היחידה שממנה הגיעו, ורק אותה', () => {
    /* openManage קוראת ל-$ ול-goto ואינה ניתנת להרמה לארגז החול, ולכן הכלל נבדק על המקור.
       הניסוח שנבדק הוא ההצבה עצמה: כל דרך אחרת לפתוח — למשל add במקום השמה — הייתה משאירה
       יחידות קודמות פתוחות, וזה בדיוק המסך שהמשתמשת התלוננה עליו. */
    const at = app.indexOf('function openManage');
    assert.ok(at > 0, 'openManage נעלמה');
    const body = app.slice(at, at + 400);
    assert.ok(/mOpen\s*=\s*unit\s*\?\s*new Set\(\[String\(unit\)\]\)\s*:\s*new Set\(\)/.test(body),
      'openManage אינה מציבה בדיוק את היחידה שהתבקשה');
    assert.ok(/goto\('manage'\)/.test(body), 'openManage אינה עוברת למסך');
  });
});
