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
   check() עצמה נוגעת ב-DOM ולכן אינה ניתנת להרמה; שתי השורות שהיא מכריעה בהן הן אלה.

   ⛔ **"היום" כאן פירושו לפני שכבת הסובלנות, ועכשיו זה כתוב ולא במקרה.**

   ‏bank_gate מגדיר "התנגשות **חדשה**" בדיוק על ההבחנה הזאת: `via='exact'` היא
   ההתנהגות הקיימת, `via='typo'` היא של השכבה החדשה, והפסק האדום הוא על השנייה
   בלבד. ההבחנה נשענת כולה על הפונקציה הזאת.

   ומה שנמצא: ‏`lib/ctx.js` אינו מזריק את `typo-lex.js`, ולכן `typoLex()` מחזירה
   null, ‏`nearMatch` יוצאת בשורה הראשונה, והשכבה **כבויה מעצמה**. כלומר המשמעות
   הנכונה התקבלה כאן **בטעות**, מהיעדר הזרקה — ולא מהצהרה.
   נמדד: על 304 שיבושי אות-כפולה, ‏`acceptsToday` החזירה 31 בלי לקסיקון ו-228
   איתו. הזרקה אחת במקום הלא נכון הייתה מרחיבה פי שבעה את מה שנחשב "מתקבל היום",
   מכווצת באותו שיעור את מה שהשער סופר כחדש, ומחלישה בשקט את השער החשוב בפרויקט.

   לכן השכבה מכובה כאן **במפורש**. זה no-op היום, וזו בדיוק הנקודה: הוא ימשיך
   להיות נכון גם אחרי שמישהו יזריק את הלקסיקון לקונטקסט של המעבדה.
   ⚠ מי שרוצה את ההתנהגות **המלאה** של האפליקציה (כולל סובלנות) — למשל כדי לשאול
   "כמה מ-24 המקרים נפתרים באמת היום" — צריך פונקציה אחרת ולא את זו. שתי השאלות
   נפרדות, והן היו מעורבבות. */
function acceptsToday(ctx, typed, card) {
  const P = ctx.TYPO_PARAMS;
  const was = P ? P.enabled : undefined;
  if (P) P.enabled = false;
  try {
    return ctx.isCorrect(typed, card.term) ||
      Array.from(ctx.glossAlts(card)).some(t => ctx.isCorrect(typed, t));
  } finally {
    if (P) P.enabled = was;
  }
}

/* ההתנהגות המלאה של האפליקציה · כולל שכבת הסובלנות, כמו שהלומד רואה אותה.
   זו השאלה "מה באמת מתקבל היום", והיא **אינה** השאלה שהשער שואל. */
function acceptsLive(ctx, typed, card) {
  return ctx.isCorrect(typed, card.term) ||
    Array.from(ctx.glossAlts(card)).some(t => ctx.isCorrect(typed, t));
}

module.exports = { acceptedKeys, acceptedSegs, acceptsToday, acceptsLive, squash };
