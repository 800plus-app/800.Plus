'use strict';
/* הווטו · למה קבלת מילת-מאגר-אחרת בלתי אפשרית מבנית ולא רק לא סבירה סטטיסטית.
 *
 * ההכרעה של חגי: הקלדה ששווה למילה אחרת במאגר נפסלת תמיד. סף מרחק, כמה שיהיה הדוק,
 * הוא הבטחה הסתברותית: הוא נכשל ברגע שנוסף למאגר זוג קרוב חדש. אינדקס בעלות נכשל רק
 * אם המילה האחרת לא נמצאת במאגר, כלומר לא נכשל.
 *
 * שני אינדקסים, אחד לכל כיוון:
 *   termKeys  מפתח מנורמל -> קבוצת הבעלים (K של המילה שמחזיקה אותו). כולל את K(term)
 *             ואת כל מפתחות heForms, כי אלה בדיוק הצורות שהריצה מקבלת בעברית: אם
 *             "כופר" מתקבל עבור כֹּפֶר, אז "כופר" הוא מילה תפוסה גם מנקודת המבט של
 *             כל כרטיס אחר.
 *   segKeys   מקטע פירוש מנורמל -> קבוצת הבעלים. הצד השני, כשהתשובה היא פירוש.
 *
 * בעלות אינה פסילה. מפתח תפוס שהכרטיס עצמו מקבל היום (המילה שלו, כתיב מלא שלה, נרדפת
 * שחולקת פירוש) אינו בווטו: הווטו נועד לחסום *הרחבה* פאזית אל מילה אחרת, ואסור לו
 * לשבור אף קבלה לגיטימית קיימת. לכן acceptedKeys תמיד גובר על הבעלות.
 */

const { acceptedKeys, acceptedSegs } = require('./keys.js');

function buildVeto(ctx, lang) {
  const L = lang || ctx.LANG;
  if (L !== ctx.LANG) throw new Error(`buildVeto: lang "${L}" does not match the context's LANG "${ctx.LANG}"`);
  const he = L !== 'en';

  const termKeys = new Map();
  const segKeys = new Map();
  const put = (map, key, owner) => {
    if (!key) return;
    let s = map.get(key);
    if (!s) { s = new Set(); map.set(key, s); }
    s.add(owner);
  };

  for (const w of Array.from(ctx.BANK)) {
    const owner = ctx.K(w.term);
    if (!owner) continue;
    put(termKeys, owner, owner);
    if (he) for (const v of Array.from(ctx.heForms(w.term))) put(termKeys, ctx.K(v), owner);
    for (const s of Array.from(ctx.meaningSegs(w.meaning))) put(segKeys, s, owner);
  }

  return { termKeys, segKeys, lang: L };
}

/* typedKey מגיע כבר מנורמל (K), כמו שהוא יגיע ל-nearMatch בשלב ב'. */
function isVetoedTerm(typedKey, card, veto, ctx) {
  if (!typedKey) return false;
  const owners = veto.termKeys.get(typedKey);
  if (!owners || !owners.size) return false;
  return !acceptedKeys(card, ctx).has(typedKey);
}

/* פטור הנרדפות: מקטע שכל בעליו הם הכרטיס עצמו או מילה שחולקת איתו פירוש (GLOSS_ALT,
   דרך glossAlts) אינו התנגשות אלא בדיוק המקרה שהאפליקציה כבר מקבלת היום. פסילה שלו
   הייתה רגרסיה על 401 הערכים באנגלית ו-47 בעברית שחולקים פירוש. */
function isVetoedSeg(typedSeg, card, veto, ctx) {
  if (!typedSeg) return false;
  const owners = veto.segKeys.get(typedSeg);
  if (!owners || !owners.size) return false;
  if (acceptedSegs(card, ctx).has(typedSeg)) return false;
  const allowed = new Set([ctx.K(card && card.term)]);
  for (const t of Array.from(ctx.glossAlts(card))) allowed.add(ctx.K(t));
  for (const o of owners) if (!allowed.has(o)) return true;
  return false;
}

module.exports = { buildVeto, isVetoedTerm, isVetoedSeg };
