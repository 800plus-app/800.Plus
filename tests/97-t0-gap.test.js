'use strict';
/* כמה מילים מקבלות `t0` שגוי · מספר, לא הערכה.
 *
 * ⛔ מה השאלה באמת
 * ---------------
 * ‏`backfillT0` מזהה רק מילה ש**מעולם** לא נענתה נכון בניסיון ראשון וטעו בה.
 * מילה שנלמדה דרך טעות ואז נשלטה — `first` שלה עלה, ולכן היא **נופלת מהשחזור**.
 * השאלה אינה «האם המנגנון מושלם» (נקבע שלא), אלא **כמה מילים זה בפועל**.
 *
 * ⭐ והתשובה מתפצלת לשניים, וזה כל העניין:
 *
 *   1. **פרופיל שנוצר אחרי שהפיצ'ר עלה** · `t0` נכתב חי ב-`commitSession`,
 *      ולכן המספר הוא **אפס**, ולא בקירוב. זה נמדד כאן.
 *   2. **פרופיל ותיק** · המספר תלוי בהיסטוריה של אותו לומד, והיא יושבת אצלו
 *      במכשיר וב-Supabase. ⛔ **אין לזה תשובה בריפו**, והבדיקה הזאת אומרת
 *      את זה במפורש במקום להמציא מספר.
 *
 * ⛔ ולמה אי אפשר לשחזר מההיסטוריה · נמדד ולא הונח
 * -----------------------------------------------
 * ‏`stats.sessions` שומר **מצרפים בלבד** — `total` · `correct` · `firstTry` ·
 * `struggled` · `newCount`. **אין בו רשימת מילים.** לכן גם עם כל היסטוריית
 * הסבבים אי אפשר לדעת אילו מילים נלמדו דרך טעות. הבדיקה נועלת את זה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource } = require('./_harness/sandbox.js');
const { extractFunction, extractDecl } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');

const שורש = path.join(__dirname, '..');
const SRC = appSource();
const MASK = codeMask(SRC);

/** הפונקציה האמיתית מ-`app.js`, לא העתק שלה. */
function מנוע() {
  const ctx = { Date, console };
  vm.createContext(ctx);
  for (const n of ['isObj', 'backfillT0']) {
    /* ⛔ `isObj` הוא חץ ב-`const`, לא הצהרת פונקציה · `extractFunction` לבדה
       מחזירה null והמנוע נופל על שם שנראה כמו סמל חסר. */
    const code = extractFunction(SRC, n, MASK) || extractDecl(SRC, n, MASK);
    assert.ok(code, `לא נמצא ב-app.js: ${n}`);
    vm.runInContext(code, ctx, { filename: 'app.js:' + n });
  }
  return ctx;
}

/** רשומה במבנה שהאפליקציה כותבת · ראה `saneRec`. */
const rec = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);

/** כמה מילים **נשארות** בלי t0 אף שנלמדו דרך טעות · זה המספר שהמשימה מבקשת. */
function פערים(words) {
  let n = 0;
  for (const k in words) {
    const r = words[k];
    /* «נלמדה דרך טעות» = טעו בה אי פעם. «נשלטה» = first>0 ולכן השחזור מפספס. */
    if (r.wrong > 0 && r.first > 0 && !r.t0) n++;
  }
  return n;
}

describe('כמה מילים מקבלות t0 שגוי', () => {

  /* ⭐ בקרה חיובית · בלי זה כל אפס שאחריה חסר ערך. */
  test('המונה סופר · הבקרה', () => {
    const words = {
      'א': rec({ seen: 3, first: 2, wrong: 1 }),   // נלמדה דרך טעות ואז נשלטה
      'ב': rec({ seen: 1, first: 1, wrong: 0 }),   // ידע מיד
      'ג': rec({ seen: 2, first: 0, wrong: 2 }),   // עדיין לא שולט · השחזור תופס
    };
    assert.strictEqual(פערים(words), 1, 'המונה אינו מזהה את המקרה שהוא נועד לספור');
  });

  /* ⭐ **המספר שהמשימה ביקשה.** פרופיל שנוצר אחרי שהפיצ'ר עלה · t0 נכתב חי. */
  test('⭐ פרופיל שנוצר אחרי הפיצ׳ר · המספר הוא אפס', () => {
    const ctx = מנוע();
    const words = {};
    /* 200 מילים, כל צירוף של נכון/טעות/דילוג, וכולן עם t0 חי כמו ש-commitSession כותב. */
    for (let i = 0; i < 200; i++) {
      const wrong = i % 3 === 0 ? 0 : (i % 3);
      const first = i % 2;
      words['w' + i] = rec({
        seen: 1 + (i % 5), first, wrong, last: 1000 + i,
        t0: (wrong > 0 || first === 0) ? 900 + i : undefined,
      });
    }
    ctx.backfillT0(words);
    assert.strictEqual(פערים(words), 0,
      'פרופיל חדש כבר נולד עם פער · המשמעות היא ש-commitSession אינו כותב t0 בזמן');
  });

  /* ⛔ ואת המספר של פרופיל ותיק אי אפשר לגזור כאן · זו לא עצלות, זו מדידה. */
  test('⛔ ההיסטוריה אינה שומרת אילו מילים · ולכן אין מספר לפרופיל ותיק', () => {
    const push = SRC.slice(SRC.indexOf('stats.sessions.push('), SRC.indexOf('stats.sessions.push(') + 260);
    for (const שדה of ['total:', 'correct:', 'firstTry:', 'struggled:', 'newCount:'])
      assert.ok(push.includes(שדה), `רשומת הסבב איבדה את ${שדה} · המדידה הזאת התיישנה`);
    assert.ok(!/\bwords\s*:/.test(push) && !/\bterms\s*:/.test(push),
      '⭐ רשומת הסבב התחילה לשמור רשימת מילים · אם כך **אפשר** לשחזר t0 מההיסטוריה, ' +
      'וההכרעה «אבוד לשחזור» צריכה להיבחן מחדש');
  });

  /* ⛔ מה שהשחזור **כן** תופס · שלא ייקרא כאילו הוא לא עושה כלום. */
  test('השחזור תופס את מי שעדיין לא שולט בה', () => {
    const ctx = מנוע();
    const words = {
      'תופס': rec({ seen: 2, first: 0, wrong: 2, last: 5000 }),
      'לא-תופס-ידע-מיד': rec({ seen: 1, first: 1, wrong: 0, last: 5000 }),
      'לא-תופס-מבחן-רמה': rec({ seen: 2, first: 0, wrong: 2, last: 5000, src: 'lv' }),
    };
    const n = ctx.backfillT0(words);
    assert.strictEqual(n, 1, `השחזור סימן ${n} · ציפיתי לאחת בלבד`);
    assert.strictEqual(words['תופס'].t0, 5000, 'התאריך אינו last');
    assert.ok(!words['לא-תופס-מבחן-רמה'].t0, 'מבחן רמה נכנס לשחזור · src=lv אמור לצאת');
  });

  /* ⛔ והרצה שנייה לא מזיזה כלום · אחרת המספר משתנה בכל טעינה. */
  test('השחזור אינו זז בהרצה שנייה', () => {
    const ctx = מנוע();
    const words = { 'א': rec({ seen: 2, first: 0, wrong: 2, last: 5000 }) };
    ctx.backfillT0(words);
    const t = words['א'].t0;
    assert.strictEqual(ctx.backfillT0(words), 0, 'ההרצה השנייה סימנה שוב');
    assert.strictEqual(words['א'].t0, t, 'התאריך זז בהרצה שנייה');
  });
});
