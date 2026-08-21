'use strict';
/* יחידת החזרות · t0, ומה שהיא נשענת עליו.
 *
 * הפיצ'ר: יחידת תרגול שמורכבת רק מהמילים שהלומד **נפגש בהן ולא ידע**, מסודרות
 * מהוותיקה לחדשה. חגי: "ככה אפשר לעשות חזרות על כל הדברים שלמדנו ולא סתם לתרגל
 * ולתרגל ובכלל לשכוח".
 *
 * שלוש נקודות כשל, וכולן שקטות
 * -----------------------------
 * 1. **t0 שנמחק במיזוג.** saneRec ו-mergeProgress הן שתי רשימות לבנות נפרדות, ושדה
 *    שנוסף לאחת בלבד נמחק כל 12 שניות · כך אבדו כאן sens ו-k0 (tests/39). כאן זה
 *    חמור יותר, כי t0 הוא היסטוריה שאי אפשר לחשב מחדש: ברגע שנמחק, המילה יוצאת
 *    מהרשימה לתמיד.
 * 2. ⛔ **כלל המיזוג הפוך משאר השדות.** כולם max, ו-t0 הוא min · הוא "הפעם
 *    הראשונה". max היה דוחף אותו קדימה בכל סנכרון והופך את הוותיקה ביותר לחדשה,
 *    כלומר הורס בדיוק את הסדר שהוא הנתון היחיד שהפיצ'ר מוכר.
 * 3. **הסדר ש-startRound מערבב.** startRound מערבב כל חפיסה ללא תנאי, ולכן "הישן
 *    קודם" נהרס אלא אם הוא מוחזר אחרי הבנייה.
 *
 * הכול רץ מול commitSession האמיתית · אותה פונקציה שהאפליקציה מריצה בסוף סבב.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, startRound, practiseRound, answerCard } = require('./_harness/sandbox.js');

const fresh = () => loadApp({ lang: 'he' });
const t0of = (ctx, card) => (ctx.stats.words[ctx.K(card.term)] || {}).t0;

/* כרטיס שהוצג ולא נענה: sess() נוצר ברינדור, attempts נשאר 0. אין לזה outcome
   ב-answerCard כי הוא לא מענה · וזו בדיוק ההבחנה שנבדקת כאן. */
const showOnly = (ctx, card) => { ctx.sess(card); };

describe('t0 · מתי מילה נחשבת "נלמדה"', () => {

  test('נפגש ולא ידע ⇒ t0 נכתב', () => {
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    assert.ok(t0of(ctx, w) > 0, 'מילה שטעו בה במפגש הראשון לא קיבלה t0 — היא לא תופיע ביחידת החזרות לעולם');
  });

  test('טעה ואז תיקן באותו סבב ⇒ t0 נכתב', () => {
    /* זו הלמידה הקלאסית: לא ידע, ואז ידע. אם רק "טעה ולא תיקן" היה מזכה, הפיצ'ר
       היה מפספס בדיוק את המילים שהלומד באמת רכש. */
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'struggle']], { scope: 'unit:1' });
    assert.ok(t0of(ctx, w) > 0, '"טעה ואז תיקן" הוא הלמידה עצמה, ולא זוכה');
  });

  test('ידע בניסיון הראשון ⇒ אין t0', () => {
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'first']], { scope: 'unit:1' });
    assert.strictEqual(t0of(ctx, w), undefined,
      'מילה שהלומד ידע מהרגע הראשון אינה מילה שהוא למד — היחידה הזאת אינה "כל מה שתרגלתי"');
  });

  test('הוצג ולא נענה ⇒ אין t0 · ובסבב שבו כן ענה וטעה, כן', () => {
    /* הכשל שהתנאי הזה קיים בשבילו: seen עולה גם על כרטיס שהוצג ונסגרה האפליקציה,
       ולכן wasNew היה מכריז "נלמדה" על מילה שהלומד מעולם לא ענה עליה — ואז המפגש
       האמיתי הראשון כבר לא היה virgin ולא היה מזכה. שני צדדים של אותה טעות. */
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];

    startRound(ctx, { scope: 'unit:1' });
    showOnly(ctx, w);
    ctx.commitSession();
    assert.strictEqual(t0of(ctx, w), undefined, 'כרטיס שהוצג ולא נענה אינו למידה');
    assert.strictEqual(ctx.stats.words[ctx.K(w.term)].seen, 1, 'seen כן עלה — זו בדיוק הסיבה ש-wasNew לא מספיק');

    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    assert.ok(t0of(ctx, w) > 0, 'המפגש האמיתי הראשון לא זוכה, כי seen כבר לא היה 0');
  });

  test('t0 דביק · טעות מאוחרת אינה מזיזה אותו', () => {
    /* בלי זה הרשימה הייתה מסודרת לפי הטעות האחרונה במקום לפי הלמידה הראשונה,
       כלומר בדיוק הפוך מהתכן. */
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    const first = t0of(ctx, w);
    ctx.stats.words[ctx.K(w.term)].t0 = 1000;           // תאריך ותיק מוצהר
    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    assert.strictEqual(t0of(ctx, w), 1000, 't0 זז אחרי טעות נוספת — הסדר של היחידה נהרס');
    assert.ok(first > 0);
  });

  test('שליטה מאוחרת אינה מוחקת את t0', () => {
    /* המילה נשארת ביחידת החזרות גם אחרי שנשלטה · "בשליטה" היום אינו "בשליטה בעוד
       חודש", וזו השכחה שהפיצ'ר נבנה נגדה. */
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    practiseRound(ctx, [[w, 'first']], { scope: 'unit:1' });
    practiseRound(ctx, [[w, 'first']], { scope: 'unit:1' });
    assert.ok(t0of(ctx, w) > 0, 'המילה נעלמה מהחזרות ברגע שנשלטה');
    assert.ok(ctx.acquiredCards('unit:1').some(x => ctx.K(x.term) === ctx.K(w.term)));
  });
});

describe('t0 · הישרדות טעינה ומיזוג', () => {
  const ctx = loadApp({ lang: 'he', bank: false });
  const K = ctx.K;
  const rec = o => ({ seen: 5, first: 2, ever: 3, wrong: 1, level: 3, last: 100, ...o });
  const side = (term, o) => ({ stats: { words: { [K(term)]: rec(o) }, sessions: [] },
                               assoc: {}, deleted: [], added: [], dir: 'm2w' });
  const merged = (a, b, term) => ctx.mergeProgress(a, b).stats.words[K(term)];

  test('saneRec משמר t0', () => {
    assert.strictEqual(ctx.saneRec({ t0: 12345 }).t0, 12345,
      't0 נמחק בטעינה — כמו sens ו-k0 בזמנו');
  });

  test('saneRec אינו ממציא t0 לרשומה שאין לה', () => {
    assert.strictEqual(ctx.saneRec({}).t0, undefined,
      't0:0 על כל רשומה מנפח את הבלוב שנדחף לענן בכל סבב, ו-0 גם מנצח כל תאריך אמיתי במיזוג');
  });

  test('⛔ המיזוג לוקח את המינימום · הישן מנצח', () => {
    /* השדה היחיד כאן שכללו הפוך. max היה הופך את המילה הוותיקה ביותר לחדשה ביותר
       בכל סנכרון, כלומר הורס את הסדר שהוא כל מה שהיחידה מוכרת. */
    assert.strictEqual(merged(side('x', { t0: 100 }), side('x', { t0: 200 }), 'x').t0, 100);
    assert.strictEqual(merged(side('x', { t0: 200 }), side('x', { t0: 100 }), 'x').t0, 100,
      'הכיוון ההפוך נותן תוצאה אחרת — המיזוג אינו סימטרי');
  });

  test('צד בלי t0 אינו מוחק את הצד שיש לו', () => {
    assert.strictEqual(merged(side('x', { t0: 100 }), side('x', {}), 'x').t0, 100);
    assert.strictEqual(merged(side('x', {}), side('x', { t0: 100 }), 'x').t0, 100);
  });

  test('רשומה חסרה נחשבת 0 · והאפס לא מנצח', () => {
    /* saneRec הופך רשומה חסרה למאופסת, ו-0 הוא ה"מינימום" המוחלט. אותה מלכודת
       שתוארה ב-mergeProgress על last:0. */
    assert.strictEqual(merged(side('x', { t0: 0 }), side('x', { t0: 500 }), 'x').t0, 500);
  });

  test('שתי רשומות בלי t0 אינן מייצרות אחד', () => {
    assert.strictEqual(merged(side('x', {}), side('x', {}), 'x').t0, undefined);
  });
});

describe('t0 · שחזור להיסטוריה שנצברה לפני השדה', () => {

  test('מעולם לא נכון-ראשון + טעה ⇒ משוחזר לפי last', () => {
    const w = { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 777 };
    const words = { a: { ...w } };
    assert.strictEqual(loadApp({ lang: 'he', bank: false }).backfillT0(words), 1);
    assert.strictEqual(words.a.t0, 777);
  });

  test('⭐ טעה ואז נשלט ⇒ משוחזר · זה המקרה שהיה שבור', () => {
    /* ⛔ הבדיקה קבעה כאן `0`, לפי ההנחה ש-first>0 הורס את הראיה. ההנחה הופרכה
       בשדה: מסך הסטטיסטיקה הציג לחגי **31 מילים "שטעית בהן בעבר וכבר יודע"**
       בזמן שיחידת החזרות מצאה **אחת**. `wrong` אינו מתאפס לעולם, ולכן הראיה
       שרדה · התנאי הוא שפסל אותה, ודווקא אצל מי שהתקדם הכי הרבה. */
    const words = { a: { seen: 8, first: 5, ever: 6, wrong: 2, level: 3, last: 777 } };
    assert.strictEqual(loadApp({ lang: 'he', bank: false }).backfillT0(words), 1,
      'מילה בשליטה שטעו בה בעבר נפסלה — היחידה תישאר ריקה בדיוק למי שהכי התקדם');
    assert.strictEqual(words.a.t0, 777);
  });

  test('היחידה מיושרת למסך הסטטיסטיקה', () => {
    /* renderStats סופר `settled` לפי `wrong>0` בלבד. כל פער בין שני התנאים חוזר
       למשתמש כ"המסך אומר 31 והיחידה נותנת 1". */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
    const at = src.indexOf('function backfillT0');
    const body = src.slice(at, src.indexOf('\nfunction ', at + 10));
    assert.ok(!/r\.first\s*===\s*0/.test(body),
      'התנאי first===0 חזר — הוא פוסל כל מילה שנלמדה דרך טעות ואז נשלטה');
    assert.ok(/r\.wrong\s*>\s*0/.test(body), 'האות היציב `wrong>0` נעלם מהשחזור');
  });

  test('מבחן רמה (src=lv) ⇒ לא משוחזר', () => {
    const words = { a: { seen: 1, first: 0, ever: 0, wrong: 1, level: 0, last: 777, src: 'lv' } };
    assert.strictEqual(loadApp({ lang: 'he', bank: false }).backfillT0(words), 0,
      'מבחן הרמה כותב רשומה בלי שהלומד נפגש במילה');
  });

  test('בלי טעויות ⇒ לא משוחזר', () => {
    const words = { a: { seen: 2, first: 0, ever: 0, wrong: 0, level: 0, last: 777 } };
    assert.strictEqual(loadApp({ lang: 'he', bank: false }).backfillT0(words), 0);
  });

  test('idempotent · הרצה שנייה אינה מזיזה דבר', () => {
    const ctx = loadApp({ lang: 'he', bank: false });
    const words = { a: { seen: 3, first: 0, ever: 0, wrong: 3, level: 0, last: 777 } };
    ctx.backfillT0(words);
    assert.strictEqual(ctx.backfillT0(words), 0, 'ריצה חוזרת שיחזרה שוב — אין צורך בדגל מיגרציה רק אם זה מחזיק');
    assert.strictEqual(words.a.t0, 777);
  });
});

describe('acquiredCards · הרשימה והסדר', () => {

  test('ריקה כשאין היסטוריה', () => {
    assert.strictEqual(fresh().acquiredCards('global').length, 0);
  });

  test('מכילה רק מילים עם t0', () => {
    const ctx = fresh();
    const [a, b, c] = ctx.uniqScope('unit:1');
    practiseRound(ctx, [[a, 'wrong'], [b, 'first'], [c, 'struggle']], { scope: 'unit:1' });
    const got = new Set(ctx.acquiredCards('unit:1').map(w => ctx.K(w.term)));
    assert.ok(got.has(ctx.K(a.term)), 'הטעות חסרה');
    assert.ok(got.has(ctx.K(c.term)), '"טעה ואז תיקן" חסר');
    assert.ok(!got.has(ctx.K(b.term)), 'מילה שידע מהרגע הראשון נכנסה');
    assert.strictEqual(got.size, 2);
  });

  test('⭐ ממוינת מהוותיקה לחדשה', () => {
    /* זה כל התכן: "אם למדתי 10 מילים 2 בכל יום 5 ימים אחורה אז ה-2 מילים של היום
       הראשון יופיעו קודם". */
    const ctx = fresh();
    const ws = ctx.uniqScope('unit:1').slice(0, 4);
    practiseRound(ctx, ws.map(w => [w, 'wrong']), { scope: 'unit:1' });
    const stamps = [400, 100, 300, 200];
    ws.forEach((w, i) => { ctx.stats.words[ctx.K(w.term)].t0 = stamps[i]; });
    /* Array.from · המערך נבנה בתוך ה-vm ולכן אינו חולק prototype עם המערך כאן,
       ו-deepStrictEqual דוחה אותו גם כשהתוכן זהה. מתועד ב-sandbox.js. */
    const order = Array.from(ctx.acquiredCards('unit:1')).map(w => ctx.stats.words[ctx.K(w.term)].t0);
    assert.deepStrictEqual(order, [100, 200, 300, 400], 'הסדר אינו מהוותיק לחדש');
  });

  test('מילה שדולגה במבחן הרמה אינה נכנסת', () => {
    const ctx = fresh();
    const w = ctx.uniqScope('unit:1')[0];
    practiseRound(ctx, [[w, 'wrong']], { scope: 'unit:1' });
    assert.strictEqual(ctx.acquiredCards('unit:1').length, 1);
    ctx.stats.words[ctx.K(w.term)].src = 'lv';
    ctx.stats.words[ctx.K(w.term)].level = 3;
    assert.strictEqual(ctx.acquiredCards('unit:1').length, 0,
      'wasSkipped אינו נאכף — אותו כשל שהראה "שלמדתי 0" ליד כפתור עם 1,725');
  });
});

describe('נוסח הכפתור', () => {
  const ctx = loadApp({ lang: 'he', bank: false });

  test('התת־כותרת קבועה · הספרה עומדת בנפרד', () => {
    /* ⭐ הבדיקה בדקה "1 מילים" מול ענף יחיד/רבים. המספר יצא מהמחרוזת והפך
       לאלמנט משלו (.wc-n), ולכן הענף אינו קיים ואינו יכול להישבר · אבל מחרוזת
       שתחזיר ספרה תחזיר גם את הבאג. זה מה שנשמר כאן. */
    assert.ok(!/\d/.test(ctx.acquiredCtaText()), 'ספרה חזרה לתת־כותרת');
    assert.strictEqual(ctx.acquiredCtaText(), 'כל מילה שלא הכרת');
  });

  test('אין מקף ארוך', () => {
    assert.ok(!ctx.acquiredCtaText().includes('—'),
      'מקף ארוך הוא סממן מזהה ל-AI · אסור בכל טקסט שיוצא החוצה');
  });
});
