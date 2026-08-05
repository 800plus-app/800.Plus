'use strict';
/* זיהוי פירוש משותף — לפי פירושים בודדים, לא לפי המחרוזת כולה.
 *
 * מה היה שבור
 * ------------
 * glossKey השווה את מחרוזת הפירוש **במלואה**. לכן accurate="מדויק" ו-precise="מדויק"
 * נתפסו, אבל colossal="עצום" מול vast="עצום, נרחב, רחב ידיים" לא — למרות ש"עצום" הוא
 * פירוש שלם של שניהם. סימולציה על היחידות מדדה **163 זוגות כאלה ביחידות 6-10 באנגלית
 * לבדן**, מול 20 שנתפסו.
 *
 * שתי פגיעות, ושתיהן אצל הלומד
 * ------------------------------
 * 1. בכיוון פירוש→מילה שני הפרומפטים הוצגו באותו סבב, כי oneCardPerGloss לא ידע שהם
 *    חולקים משהו. זה מה שחגי דיווח עליו כ"כפילויות".
 * 2. ובכיוון ההפוך — הפגיעה הקשה יותר — glossAlts לא החזיר את השני, ולכן לומד שכתב
 *    "colossal" על הפרומפט של vast סומן כטועה. תשובה נכונה שנדחית.
 *
 * למה meaningSegs ולא פיצול משלנו
 * ---------------------------------
 * meaningSegs הוא מה שמכריע אילו תשובות מתקבלות. אם "שני ערכים חולקים פירוש" היה נמדד
 * בכלל אחר, שתי ההגדרות היו נפרדות ומתיישנות בנפרד. מקור אמת אחד.
 *
 * ולמה אין כאן סינון אורך
 * ------------------------
 * הגרסה הראשונה דרשה שני תווים לפחות, אבל norm מסיר את המקף ולכן "מ-" הצטמצם לתו אחד
 * ונזרק — from ו-than חזרו להיות שני פרומפטים זהים באותו סבב. בדיקה 44 תפסה.
 * במאגר כולו יש ארבעה פירושים באורך תו אחד, וכולם מיליות אמיתיות.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');

const app = appSource();
const he = loadApp({ lang: 'he' });
const en = loadApp({ lang: 'en' });
const find = (ctx, t) => ctx.BANK.find(w => w.term === t);

describe('פירוש משותף — לפי פירושים בודדים', () => {

  test('glossSenses נשען על meaningSegs, ולא על פיצול משלו', () => {
    const at = app.indexOf('function glossSenses');
    assert.ok(at > 0, 'glossSenses נעלמה');
    assert.match(app.slice(at, at + 900), /return meaningSegs\(g\)/,
      'glossSenses אינה מחזירה את meaningSegs — שתי הגדרות שיתיישנו בנפרד');
  });

  test('הזוגות ש-glossKey פספס מזוהים עכשיו, לשני הכיוונים', () => {
    for (const [a, b] of [['colossal', 'vast'], ['retire', 'withdraw'],
                          ['augment', 'elaborate'], ['disdain', 'scorn']]) {
      const A = find(en, a), B = find(en, b);
      assert.ok(A && B, `${a}/${b} אינם במאגר`);
      assert.ok(en.glossAlts(A).includes(b), `${a} אינו מזהה את ${b} כנרדפת`);
      assert.ok(en.glossAlts(B).includes(a), `${b} אינו מזהה את ${a} כנרדפת`);
    }
  });

  test('מה שנתפס קודם ממשיך להיתפס', () => {
    const A = find(en, 'accurate'), B = find(en, 'precise');
    assert.ok(A && B, 'accurate/precise אינם במאגר');
    assert.ok(en.glossAlts(A).includes('precise') && en.glossAlts(B).includes('accurate'),
      'זוג הפירוש הזהה נשבר');
  });

  test('מילים שאינן נרדפות אינן מזוהות ככאלה', () => {
    /* השער. הרחבת ההתאמה היא בדיוק סוג השינוי שמקבל תשובות שגויות בדרך. */
    const A = find(en, 'colossal'), T = find(en, 'tiny');
    if (A && T) assert.ok(!en.glossAlts(A).includes('tiny'), 'colossal ו-tiny נחשבו נרדפות');
  });

  test('פירוש באורך תו אחד אינו נזרק', () => {
    /* "מ-" הוא הפירוש של from, of ו-than. אם הוא נזרק, שלושתם מוצגים עם אותו פרומפט. */
    const F = find(en, 'from'), T = find(en, 'than');
    assert.ok(F && T, 'from/than אינם במאגר');
    assert.ok(en.glossAlts(F).includes('than'), '"מ-" נזרק — from ו-than אינם חולקים פירוש');
  });

  test('oneCardPerGloss תופס לפי פירוש בודד', () => {
    const at = app.indexOf('function oneCardPerGloss');
    const body = app.slice(at, at + 700);
    assert.match(body, /glossSenses\(c\.meaning\)/, 'הכלל עדיין משווה מחרוזת מלאה');
    assert.match(body, /senses\.some\(s=>taken\.has\(s\)\)/, 'כרטיס אינו נבדק מול פירוש שכבר נתפס');
    assert.match(body, /senses\.forEach\(s=>taken\.add\(s\)\)/, 'כרטיס אינו תופס את כל פירושיו');
  });

  test('העברית לא נשברה', () => {
    /* אותו כלל, מאגר אחר. 23 קבוצות פירוש בעברית. */
    let linked = 0;
    for (const w of he.BANK) if (he.glossAlts(w).length) linked++;
    assert.ok(linked > 0, 'אף ערך עברי אינו מזוהה כחולק פירוש — האינדקס ריק');
  });

  test('אף ערך לא הפך לחסר תשובה', () => {
    /* הרגרסיה שכבר קרתה היום: הרחבת כלל התאמה שמחקה פירושים. */
    for (const ctx of [he, en]) {
      const bad = ctx.BANK.filter(w => {
        const segs = ctx.meaningSegs(w.meaning);
        return segs.length && !segs.some(s => ctx.meaningMatch(s, w.meaning));
      });
      assert.strictEqual(bad.length, 0,
        'ערכים שאין להם תשובה קבילה: ' + JSON.stringify(bad.slice(0, 5).map(w => w.term)));
    }
  });
});
