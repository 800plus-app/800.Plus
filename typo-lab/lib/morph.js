'use strict';
/* נטיות לגיטימיות · השלילי מסוג "מחלקת כפרים".
 *
 * מה שהיה שבור: הסיומת הודבקה ל**מפתח המקופל**, כלומר לפלט של norm. norm מקפלת אותיות
 * סופיות (ן→נ, ם→מ), ולכן אצבעון הפך ל-אצבעונ ואז ל-אצבעונות · לא נטייה, לא מילה, ולא
 * שום דבר שכותב מקליד. 93.7% משורות neg/inflection היו כאלה.
 *
 * העיקרון כאן: הנטייה נבנית מה**צורה הכתובה** (card.term בלי ניקוד), לפי מורפולוגיה
 * אמיתית, ורק אחר כך עוברת ל-K. אם אין צורה לגיטימית · מחזירים רשימה ריקה והשורה
 * **נופלת**. עדיף שלילי אחד פחות מאשר שלילי שאינו מילה בתחפושת של נטייה.
 *
 * המודול הזה משמש גם את המחולל וגם את selfcheck2b: השער מחשב מחדש מהכרטיס ודורש שוויון,
 * כך שכל שורת neg/inflection ניתנת לגזירה עצמאית מהמאגר. זו הסיבה שהוא קובץ נפרד ולא
 * פונקציה פנימית ב-gen_dataset.
 */

const NIQQUD = /[֑-ׇ]/g;
const HE_ONLY = /^[א-ת]+$/;
const FINAL_UNFOLD = { 'ן': 'נ', 'ם': 'מ', 'ך': 'כ', 'ף': 'פ', 'ץ': 'צ' };

const bare = s => String(s == null ? '' : s).replace(NIQQUD, '').trim();

/* ===== עברית ===== */

/* צורות שכבר ברבים · הוספת סיומת עליהן אינה נטייה אלא ריבוי כפול. אָבְנַיִים היא זוגי
   ולכן נכנסת לכאן גם היא. */
const HE_PLURAL_END = /(יים|ים|יות|ות)$/;

/* ריבוי · שלושה מקרים בלבד, וכל השאר נופל. הרשימה קצרה בכוונה: כל חוק נוסף הוא ניחוש
   על משקל שאין לנו לו סימן במאגר (אין שדה חלק-דיבר), וניחוש כזה מייצר בדיוק את הזבל
   שהמודול הזה נועד לחסל.
     1. מסתיים ב-ה  →  ה נופלת, נוספת ות          חממה → חממות
     2. מסתיים ב-ית →  ת נופלת, נוספת ות          נקבובית → נקבוביות
     3. אחרת        →  האות הסופית נפתחת, נוספת ים  אצבעון → אצבעונים · כפר → כפרים
   מסתיים ב-ת שאינה ית · נופל: בית→בתים מול מחברת→מחברות אינם אותו חוק, ואין לנו איך
   להבחין ביניהם. */
function inflectHe(term) {
  const w = bare(term);
  if (!w || w.includes(' ')) return [];              // רב-מילי · הנטייה נופלת על איזו מילה?
  if (!HE_ONLY.test(w)) return [];
  if (w.length < 3) return [];
  if (HE_PLURAL_END.test(w)) return [];

  const last = w[w.length - 1];
  if (last === 'ה') return [w.slice(0, -1) + 'ות'];
  if (last === 'ת') return w.endsWith('ית') ? [w.slice(0, -1) + 'ות'] : [];
  const head = w.slice(0, -1) + (FINAL_UNFOLD[last] || last);
  return [head + 'ים'];
}

/* ===== אנגלית ===== */

/* מחלקות סגורות · מילת יחס, קישור, כינוי, עזר. אין להן נטייה, ו-anded / alsoing נולדו
   בדיוק מזה שלא נשאלה השאלה. */
const EN_CLOSED = new Set(('a an the and or but nor for so yet if then than that this these those which who whom ' +
  'whose what when where why how all any both each every few many more most much no none some such very too also ' +
  'not only just even still already always never often sometimes rarely by at in on of to from with without within ' +
  'into onto upon about above below under over between among during before after since until through across ' +
  'against toward towards around behind beyond beside besides despite except per via off out up down here there ' +
  'now yesterday tomorrow today am is are was were be been being do does did have has had will would shall should ' +
  'may might must can could ought i you he she it we they me him her us them my your his its our their mine yours ' +
  'hers ours theirs').split(' '));

/* מילים עבריות שמתחילות ב-ל ואינן שם פועל · הן שוברות את זיהוי הפועל דרך הפירוש.
   הרשימה נגזרה מסריקת המאגר האנגלי בפועל, לא מהזיכרון. */
const HE_NOT_INFINITIVE = new Set(('לחלוטין לבד לפחות לפני ליד לוח לעיתים לעתים לרוב לכן לכל למשל לגמרי לאט למעלה ' +
  'למטה לאחר לצד לפי לעומת לאורך לרוחב לשווא לפעמים לחילופין לחלופין לבסוף לעולם לכאורה לאחרונה למרות לצורך לעבר ' +
  'לתוך לידי לבטח לבטלה לרעה לטובה לאן למה לאמיתו לרגע לנצח לעד לשעבר לפרקים לסירוגין לכדי לשם לבין לרשות לזמן ' +
  'להלן לעיל לרוע לילה לשון לחם לב לוע להב לסת לקח לפיד').split(' '));

const VOWEL = 'aeiou';
const isCons = c => !!c && !VOWEL.includes(c);

/* פועל · אין שדה חלק-דיבר, ולכן הסימן הוא הפירוש: שם הפועל העברי פותח ב-ל. שני שערים
   נוספים חוסמים את הדליפות שנמדדו · תואר הפועל באנגלית (‎-ly‎) והמחלקה הסגורה. */
function isEnVerb(term, meaning) {
  const t = String(term || '');
  if (!t || t.includes(' ')) return false;
  if (/ly$/.test(t)) return false;
  if (EN_CLOSED.has(t)) return false;
  const first = bare(meaning).split(/[\s,;·]/)[0].replace(/[^א-ת]/g, '');
  if (!/^ל[א-ת]{2,}$/.test(first)) return false;
  return !HE_NOT_INFINITIVE.has(first);
}

/* ‎-s‎ · חוקי איות אמיתיים ולא הדבקה. */
function enS(w) {
  if (/[sxz]$/.test(w) || /(ch|sh)$/.test(w)) return null;   // כבר מסתיים בשורק · commends+es אינו צורה
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/o$/.test(w)) return w + 'es';
  return w + 's';
}

/* ‎-ing / -ed‎ נפלטות רק כשהבסיס אינו דורש הכפלת עיצות סופית. stop→stopping ו-refer→
   referring תלויים בהטעמה, ואין לנו אותה · ולכן הבסיסים האלה מוותרים על שתי הצורות
   ומסתפקים ב-‎-s‎. מותר: מסתיים ב-e (הורדת ה-e), מסתיים בשני עיצורים, מסתיים בעיצור+y. */
function enDoubles(w) {
  if (/e$/.test(w)) return false;
  if (/[^aeiou]y$/.test(w)) return false;
  if (w.length >= 2 && isCons(w[w.length - 1]) && isCons(w[w.length - 2])) return false;
  return true;
}

function enIng(w) {
  if (enDoubles(w)) return null;
  if (/ee$/.test(w)) return w + 'ing';
  if (/e$/.test(w)) return w.slice(0, -1) + 'ing';
  if (/[^aeiou]y$/.test(w)) return w + 'ing';
  return w + 'ing';
}

/* ‎-ed‎ **אינה נפלטת בכלל**, וזו הכרעה ולא השמטה: הפעלים התכופים באנגלית הם בדיוק
   הבלתי-רגילים · drink/drank, break/broke, feel/felt, find/found. drinked אינו נטייה
   אלא מחרוזת שגויה, ואין לנו טבלת פעלים חריגים שנוכל לסמוך עליה. ‎-s‎ ו-‎-ing‎ רגילות
   כמעט תמיד, ולכן רק הן נשארות. */

/* בסיס שכבר נוטה · commends הוא גוף שלישי, ו-commendsing אינו צורה. עיצור (שאינו s)
   ואחריו s הוא סימן הנטייה הזה; focus / pass / process אינם נופלים בו. */
const EN_ALREADY_INFLECTED = /[bcdfgklmnprtvwz]s$/;

/* מוחזרת רשימה ממוינת · הבורר במחולל לוקח ממנה לפי rng, וסדר יציב הוא תנאי לדטרמיניזם. */
function inflectEn(term, meaning) {
  const w = bare(term).toLowerCase();
  if (!w || !/^[a-z]+$/.test(w)) return [];
  if (w.length < 3) return [];
  if (EN_ALREADY_INFLECTED.test(w)) return [];
  if (!isEnVerb(w, meaning)) return [];
  const out = [enS(w), enIng(w)].filter(Boolean);
  return Array.from(new Set(out)).sort();
}

/* שער האישוש · הרגל השנייה, והיא זו שנותנת לשער שיניים אמיתיות.
 * המורפולוגיה למעלה היא חוק שכתבנו, ולכן בדיקה מולה לבדה היא מעגלית. התנאי השני הוא
 * חיצוני לה: הצורה חייבת להיות **מאושרת בלקסיקון**, כלומר מילה שאנחנו עצמנו כתבנו
 * באחד הטקסטים של הפרויקט. אחו→אחוים נופל שם, כפר→כפרים עובר, agree→agrees עובר.
 * המחיר הוא דלילות (‏109 עבריות, ‏295 אנגליות במקום 5,630 שורות זבל) · והוא נכון:
 * שלילי אחד שהוא באמת נטייה שווה יותר ממאה שאינם.
 */
function licitForms(card, lang) {
  const raw = lang === 'en' ? inflectEn(card && card.term, card && card.meaning) : inflectHe(card && card.term);
  if (!raw.length) return raw;
  const { inLexicon } = require('./lexicon.js');
  const { getCtx } = require('./ctx.js');
  const ctx = getCtx(lang === 'en' ? 'en' : 'he');
  const nrm = lang === 'en' ? (s => ctx.normEn(s)) : (s => ctx.norm(s));
  return raw.filter(f => inLexicon(nrm(f), lang === 'en' ? 'en' : 'he'));
}

module.exports = {
  inflectHe, inflectEn, licitForms, isEnVerb, bare,
  EN_CLOSED, HE_NOT_INFINITIVE, EN_ALREADY_INFLECTED
};
