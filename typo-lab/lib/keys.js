'use strict';
/* מה שהריצה מקבלת *היום* · שיקוף של isCorrect, לא חוק חדש.
 *
 * המעבדה מודדת סובלנות שמעבר למה שכבר מתקבל. בלי לדעת במדויק מה כבר מתקבל, כל וריאציה
 * "שהתקבלה" עלולה להיות וריאציה שהתקבלה מאז ומתמיד, וה-recall ייצא מנופח. לכן
 * acceptedKeys מונה את השכבות של isCorrect (app.js:771-788) לפי הסדר שלהן:
 *
 *   1. K(term)                                    ההתאמה המדויקת
 *   2. heForms(term)                              עברית בלבד · כתיב מלא, י/ו כפולים
 *   3. חלופות מופרדות ב-/ | , או " - ", כל אחת מורחבת ב-heForms
 *   4. אותן חלופות בלי רווחים                     bestseller מול best seller, ביתספר מול בית ספר
 *
 * הסדר חשוב לקריאה בלבד; התוצאה היא איחוד. שכבה 4 רצה על alts ולא על heForms(term)
 * הישירים, כי כך isCorrect עצמה כתובה, והדיוק הזה הוא כל העניין: acceptedKeys שמכיל
 * מפתח שאינו מתקבל היום יסתיר פסילה אמיתית מהמעבדה. selfcheck1 בודק בדיוק את זה.
 */

const squash = x => String(x).replace(/\s+/g, '');

function acceptedKeys(card, ctx) {
  const out = new Set();
  const add = k => { if (k) out.add(k); };
  const term = card && card.term;
  if (term == null) return out;
  const he = ctx.LANG !== 'en';

  add(ctx.K(term));
  if (he) for (const v of Array.from(ctx.heForms(term))) add(ctx.K(v));

  const alts = String(term).split(/[\/|,]|\s-\s/)
    .flatMap(x => he ? Array.from(ctx.heForms(x)) : [x])
    .map(x => ctx.K(x)).filter(Boolean);
  for (const a of alts) { add(a); add(squash(a)); }

  return out;
}

/* הפירושים הקבילים של הכרטיס, מנורמלים · אותו פיצול שמכריע בכיוון "הקלדת פירוש".
   meaningSegs כבר מחזירה norm על כל מקטע, ולכן אין כאן נרמול נוסף: נרמול כפול היה
   יוצר מפתח שאינו קיים באפליקציה. */
function acceptedSegs(card, ctx) {
  const out = new Set();
  for (const s of Array.from(ctx.meaningSegs(card && card.meaning))) if (s) out.add(s);
  return out;
}

/* חוק הקבלה הקנוני של check(), במקום אחד · מנוסח מחדש ב-tests/05-answer.test.js:23.
   check() עצמה נוגעת ב-DOM ולכן אינה ניתנת להרמה; שתי השורות שהיא מכריעה בהן הן אלה. */
function acceptsToday(ctx, typed, card) {
  return ctx.isCorrect(typed, card.term) ||
    Array.from(ctx.glossAlts(card)).some(t => ctx.isCorrect(typed, t));
}

module.exports = { acceptedKeys, acceptedSegs, acceptsToday, squash };
