'use strict';
/* סדר השורות בניהול המילים.
 *
 * בקשת חגי (12.8.2026, על צילום של המסך)
 * ---------------------------------------
 *   "הסדר בניהול המילים חייב להיות שתמיד המילים שלא ידעתי למעלה שאוכל להוריד אותם
 *    אם אני רוצה בנוחות"
 *
 * מה היה, ולמה זה נראה אקראי
 * ---------------------------
 * מיון כן היה, והוא מיין לפי חוזק: חלש ⟵ נלמד ⟵ טרם נפגש ⟵ נמחק. אבל `markKnown`
 * כותב `level=3` בנוסף ל-`src:'known'`, ולכן מילה שהלומד סימן "ידעתי" נספרה בדירוג
 * כ"נלמדה" — כלומר דורגה 1, **מעל** מילה שמעולם לא נפגשה שדורגה 2.
 *
 * התוצאה על המסך: מסומנות ולא-מסומנות משולבות זו בזו, ומי שעובר על יחידה כדי לסמן
 * נאלץ לדלג שוב ושוב על שורות שכבר סגר.
 *
 * מה שהבדיקות כאן נועלות
 * -----------------------
 * 1. מסומנת "ידעתי" יורדת מתחת לכל מה שלא סומן — זו הבקשה עצמה.
 * 2. הדירוג נשען על `src==='known'` ולא על הרמה. זה מה שנשבר: הרמה היא תוצר לוואי
 *    של הסימון, ולכן דירוג שקורא אותה מחזיר את הבאג בדיוק.
 * 3. הסדר הפנימי של מה שלא סומן נשמר (חלש ⟵ נלמד ⟵ טרם נפגש), ומחוקה נשארת אחרונה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const app = appSource();
const ctx = loadApp({ lang: 'en', bank: true });
for (const { name, code } of extractAll(app, ['isKnown', 'markKnown', 'unmarkKnown', 'manageRank']))
  vm.runInContext(code, ctx, { filename: `app.js:${name}` });

const reset = () => { ctx.stats = { words: {}, sessions: [] }; };
/* פריט כפי ש-manageItems מייצר אותו: מה שהדירוג נוגע בו הוא term ו-gone בלבד */
const item = (term, gone) => ({ term, gone: !!gone });
const put = (term, rec) => { ctx.stats.words[ctx.K(term)] = rec; };

describe('סדר ניהול המילים', () => {

  test('מילה שסומנה "ידעתי" יורדת מתחת לכל מה שלא סומן', () => {
    reset();
    put('fresh', undefined);                                             // מעולם לא נפגשה
    put('weak',    { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 1 });
    put('learned', { seen: 4, first: 4, ever: 4, wrong: 0, level: 3, last: 1 });
    ctx.markKnown('known');
    const known = ctx.manageRank(item('known'));
    for (const t of ['weak', 'learned', 'fresh'])
      assert.ok(ctx.manageRank(item(t)) < known,
        `"${t}" חייבת להיות מעל מילה שסומנה ידעתי`);
  });

  test('הדירוג נשען על הסימון ולא על הרמה — זה מה שנשבר', () => {
    reset();
    /* שתי מילים באותה רמה בדיוק. ההבדל היחיד הוא src, וזה חייב להספיק:
       markKnown כותב level=3, ודירוג שקורא את הרמה היה מדרג את שתיהן זהה. */
    put('bySkill', { seen: 4, first: 4, ever: 4, wrong: 0, level: 3, last: 1 });
    put('byClick', { seen: 4, first: 4, ever: 4, wrong: 0, level: 3, last: 1 });
    ctx.markKnown('byClick');
    assert.strictEqual(ctx.lvl('bySkill'), ctx.lvl('byClick'), 'שתיהן ברמה 3, אחרת המבחן ריק');
    assert.ok(ctx.manageRank(item('bySkill')) < ctx.manageRank(item('byClick')),
      'מילה שנלמדה בתרגול חייבת להיות מעל מילה שרק סומנה ידעתי');
  });

  test('ביטול הסימון מחזיר את המילה למעלה', () => {
    reset();
    put('w', { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 1 });
    const before = ctx.manageRank(item('w'));
    ctx.markKnown('w');
    assert.ok(ctx.manageRank(item('w')) > before, 'הסימון לא הוריד אותה');
    ctx.unmarkKnown('w');
    assert.strictEqual(ctx.manageRank(item('w')), before, 'הביטול לא החזיר אותה למקומה');
  });

  test('הסדר הפנימי נשמר, ומחוקה אחרונה תמיד', () => {
    reset();
    put('weak',    { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 1 });
    put('learned', { seen: 4, first: 4, ever: 4, wrong: 0, level: 3, last: 1 });
    ctx.markKnown('known');
    const r = t => ctx.manageRank(item(t));
    assert.ok(r('weak') < r('learned'), 'חלשה מעל נלמדה');
    assert.ok(r('learned') < r('fresh'), 'נלמדה מעל מה שטרם נפגש');
    assert.ok(r('fresh') < r('known'), 'מה שטרם נפגש מעל מה שסומן');
    /* מחוקה אחרונה גם כשהיא חלשה — היא כבר לא בתרגול */
    assert.ok(ctx.manageRank(item('weak', true)) > r('known'), 'מחוקה אינה אחרונה');
  });
});
