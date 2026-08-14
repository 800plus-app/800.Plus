'use strict';
/* שדות שהמיזוג מוחק בשקט · ומבטל תיקונים שכבר נעשו.
 *
 * שני סוכנים שלא ראו זה את זה הגיעו לאותו ממצא, מכיוונים שונים: אחד דרך הסנכרון, אחד דרך
 * אי-השוויונות בנתונים. זה מה שהעלה אותו מהשערה לעובדה.
 *
 * מה קורה
 * -------
 * saneRec היא רשימה לבנה, ויש לה שתי רשומות שנוספו לאחרונה: `sens` (אילו פירושים הלומד
 * כבר כתב, v146) ו-`k0` (הרמה שהייתה לפני סימון "ידעתי", v147). שתיהן שורדות טעינה.
 *
 * mergeProgress בונה כל רשומה **מחדש** · `{seen,first,ever,wrong,level,last}` ועוד `src`.
 * שתי הרשימות הלבנות אינן מסונכרנות זו לזו, ולכן `sens` ו-`k0` נמחקים בכל מיזוג.
 *
 * וזה לא תרחיש של שני מכשירים: flushRemoteSync ממזג בסוף כל סבב, ו-absorbDisk ממזג בין
 * שתי לשוניות. כלומר זה קורה למשתמש יחיד, כל 12 שניות.
 *
 * הנזק, בשרשרת
 * -------------
 *   sens נמחק → sensesLeft חוזר ל-2 → התקרה ב-commitSession נשארת 2 → weakCards דורש 3
 *   → מילה רב-משמעית לא יכולה לצאת מ"לחיזוק" לעולם.
 * וזו בדיוק התלונה שבגללה נכתב creditSense. התיקון היה נכון; המיזוג ביטל אותו.
 *
 *   k0 נמחק אך src:'known' שורד → unmarkKnown עושה level=int0(undefined)=0
 *   → ביטול "ידעתי" מאפס היסטוריית תרגול אמיתית, בדיוק מה ש-k0 נוסף כדי למנוע.
 *
 * ולמה max ולא "החדש מנצח"
 * -------------------------
 * `sens` הוא קבוצה של פירושים שהלומד כתב בפועל. פירוש שנכתב במכשיר אחד נכתב, נקודה · 
 * ואיחוד הוא הדבר היחיד שלא מאבד ידע אמיתי. `k0` הוא היסטוריה, ולכן הגבוה שורד: להעדיף
 * את הנמוך פירושו שסנכרון יכול להוריד רמה שהלומד השיג.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');

const app = appSource();
const ctx = loadApp({ lang: 'he', bank: false });
const K = ctx.K;
const rec = o => ({ seen: 5, first: 2, ever: 3, wrong: 1, level: 3, last: 100, ...o });
const side = (term, o) => ({ stats: { words: { [K(term)]: rec(o) }, sessions: [] },
                             assoc: {}, deleted: [], added: [], dir: 'm2w' });
const merged = (a, b, term) => ctx.mergeProgress(a, b).stats.words[K(term)];

describe('sens שורד מיזוג', () => {

  test('פירוש שנכתב במכשיר אחד אינו נמחק', () => {
    const out = merged(side('x', { sens: [0, 1] }), side('x', {}), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []), [0, 1],
      'sens נמחק — המילה תיתקע ב"לחיזוק" לנצח, וזה מבטל את creditSense');
  });

  test('פירושים משני הצדדים מתאחדים', () => {
    /* פירוש שנכתב במכשיר אחד נכתב. איחוד הוא הדבר היחיד שלא מאבד ידע אמיתי. */
    const out = merged(side('x', { sens: [0] }), side('x', { sens: [2] }), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []).sort(), [0, 2]);
  });

  test('בלי כפילויות, ועם התקרה', () => {
    const out = merged(side('x', { sens: [0, 1, 2] }), side('x', { sens: [1, 2, 3] }), 'x');
    const s = Array.from(out.sens || []);
    assert.deepStrictEqual(s.sort((p, q) => p - q), [0, 1, 2, 3]);
    assert.ok(s.length <= 8, 'התקרה של saneRec נשברה');
  });

  test('צד בלי sens אינו מוחק את הצד שיש לו', () => {
    const out = merged(side('x', {}), side('x', { sens: [1] }), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []), [1]);
  });
});

describe('k0 שורד מיזוג', () => {

  test('הרמה השמורה עוברת יחד עם הסימון', () => {
    const out = merged(side('x', { src: 'known', k0: 2 }), side('x', {}), 'x');
    assert.strictEqual(out.src, 'known');
    assert.strictEqual(out.k0, 2,
      'k0 נמחק בעוד src שרד — ביטול "ידעתי" יאפס היסטוריית תרגול אמיתית');
  });

  test('כששני הצדדים מחזיקים · הגבוה שורד', () => {
    /* להעדיף את הנמוך פירושו שסנכרון יכול להוריד רמה שהלומד השיג. */
    assert.strictEqual(merged(side('x', { src: 'known', k0: 1 }), side('x', { src: 'known', k0: 3 }), 'x').k0, 3);
  });

  test('מילה בלי סימון אינה מקבלת k0 יש מאין', () => {
    const out = merged(side('x', {}), side('x', {}), 'x');
    assert.ok(out.k0 === undefined, 'נוסף k0 למילה שלא סומנה מעולם');
  });
});

describe('שלושת מסלולי המיזוג מעבירים את יומן השחזורים', () => {
  /* mergeProgress מחסר את המשוחזרים אחרי האיחוד. מסלול שלא מעביר את היומן מחזיר את
     המחיקה מהענן, כותב אותה לדיסק ודוחף אותה בחזרה · ואז המסלול הבא, שכן מעביר, משחזר
     שוב. המילה מהבהבת פנימה והחוצה לפי מי סנכרן אחרון. */
  const sites = ['absorbDisk', 'flushRemoteSync', 'syncWithRemoteInner'];
  for (const fn of sites) {
    test(`${fn} מעביר undeleted`, () => {
      const at = app.indexOf('function ' + fn);
      assert.ok(at > 0, fn + ' נעלמה');
      const body = app.slice(at, at + 6000);
      const call = body.indexOf('mergeProgress(');
      assert.ok(call > 0, fn + ' אינה ממזגת בכלל');
      assert.ok(/undeleted\s*:/.test(body.slice(call, call + 320)),
        fn + ' ממזגת בלי יומן השחזורים — מילה ששוחזרה תימחק שוב');
    });
  }
});

describe('שתי הרשימות הלבנות מסונכרנות', () => {
  test('כל שדה ש-saneRec שומר, mergeProgress מעביר', () => {
    /* זה הכלל שהיה חסר. saneRec ו-mergeProgress הן שתי רשימות לבנות נפרדות, ושדה חדש
       שנוסף לאחת ולא לשנייה נמחק בשקט בסנכרון הבא · בלי שאף בדיקה תראה. */
    const sane = app.slice(app.indexOf('function saneRec'), app.indexOf('function saneRec') + 1400);
    const fields = [...sane.matchAll(/out\.(\w+)\s*=/g)].map(m => m[1])
      .concat([...sane.matchAll(/\b(\w+)\s*:\s*int0\(r\./g)].map(m => m[1]));
    const mp = app.slice(app.indexOf('function mergeProgress'), app.indexOf('function mergeProgress') + 4000);
    const missing = [...new Set(fields)].filter(f => !new RegExp('\\b' + f + '\\b').test(mp));
    assert.deepStrictEqual(missing, [],
      'saneRec שומר שדות ש-mergeProgress מוחק: ' + missing.join(', '));
  });
});
