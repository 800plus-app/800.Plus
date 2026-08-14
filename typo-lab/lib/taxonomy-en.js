'use strict';
/* אופרטורי טעות אנגליים · על המפתח המנורמל (normEn), אותו עיקרון כמו בעברית.
 *
 * normEn כבר הורידה רישיות, מקף, וסימני פיסוק, והסירה תווית פותחת (a/an/the/to). לכן
 * "Occurr-ence" ו-"occurrence" הם אותו מפתח, ואופרטור שמייצר הבדל כזה מייצר שורה ריקה.
 *
 * ההבדל המהותי מהעברית: באנגלית חלק גדול מהשגיאות אינו מכני אלא **תבניתי** · ie/ei,
 * c/k, c/s, ph/f, e שקטה, y/i, ועיצור כפול (accomodate). אלה אינן שגיאות מקלדת: הן
 * חוזרות על עצמן אצל כותבים שונים על אותן מילים בדיוק, ולכן הן מקבלות משקל דגימה
 * משלהן ולא נבלעות בתוך שכנות המקלדת.
 *
 * חוזה זהה לעברית: { name, class, weight, apply(key, rng) -> string[], why(key, out) }.
 */

const { shuffled, perWord } = require('./taxonomy-he.js');

/* ===== QWERTY ===== */
const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

/* אותו כלל היסט כמו בפריסה העברית · אותה מקלדת פיזית. */
function buildAdj() {
  const map = new Map();
  const add = (a, b) => {
    if (!a || !b || a === b) return;
    let s = map.get(a);
    if (!s) { s = new Set(); map.set(a, s); }
    s.add(b);
  };
  for (let r = 0; r < ROWS.length; r++) {
    for (let c = 0; c < ROWS[r].length; c++) {
      const k = ROWS[r][c];
      add(k, ROWS[r][c - 1]); add(k, ROWS[r][c + 1]);
      if (r > 0) { add(k, ROWS[r - 1][c]); add(k, ROWS[r - 1][c + 1]); }
      if (r < ROWS.length - 1) { add(k, ROWS[r + 1][c - 1]); add(k, ROWS[r + 1][c]); }
    }
  }
  const out = new Map();
  for (const [k, s] of map) out.set(k, Array.from(s).sort());
  return out;
}
const ADJ = buildAdj();

const VOWEL = 'aeiou';
const CONS = 'bcdfghjklmnpqrstvwxyz';

/* ===== מכניים ===== */
const genAdj = w => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const n = ADJ.get(w[i]); if (!n) continue;
    for (const c of n) out.push(w.slice(0, i) + c + w.slice(i + 1));
  }
  return out;
};

const genTranspose = w => {
  const out = [];
  for (let i = 0; i + 1 < w.length; i++) {
    if (w[i] === w[i + 1]) continue;
    out.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  return out;
};

const genDrop = w => {
  const out = [];
  if (w.length <= 2) return out;
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i) + w.slice(i + 1));
  return out;
};

const genDouble = w => {
  const out = [];
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1));
  return out;
};

/* ===== תבניתיים =====
 * כל חוק הוא { tag, gen } ומחזיר וריאציות של מילה בודדת. ה-tag נשמר כדי שהשדה why
 * בשורת הדאטהסט יגיד *איזו* תבנית ירתה, ולא רק "pattern": חוק שמייצר 90% מהשורות
 * ואינו תורם דבר ל-recall צריך להיראות בטבלת ההתפלגות, לא להתחבא בתוך צבירה.
 */
function replaceEach(w, from, to) {
  const out = [];
  let i = w.indexOf(from);
  while (i >= 0) { out.push(w.slice(0, i) + to + w.slice(i + from.length)); i = w.indexOf(from, i + 1); }
  return out;
}
const both = (a, b) => w => replaceEach(w, a, b).concat(replaceEach(w, b, a));

/* e שקטה · **רק הסרה**. הכיוון ההפוך נמחק אחרי מדידה: הוא ייצר writere, invasione,
   janitore · מחרוזות שאף כותב אנגלית אינו מפיק, כי אין תבנית שמובילה אליהן. הסרה כן
   נצפית ומוכרת (able→abl, future→futur), ולכן היא נשארת. */
const genSilentE = w => {
  const out = [];
  if (w.length > 3 && w.endsWith('e') && CONS.includes(w[w.length - 2])) out.push(w.slice(0, -1));
  return out;
};

/* c↔s · **רק בהקשר c רכה**, כלומר לפני e/i/y. שם שתי האותיות נשמעות /s/ וזו טעות
   פונטית אמיתית (necessary/necessery, license/licence). בלי השער הזה נולדו cpend מתוך
   spend, sonvince מתוך convince, matsh מתוך match ו-perhapc מתוך perhaps · אלה אינן
   טעויות אלא רעש, 1,084 שורות ממנו. */
const SOFT = 'eiy';
const genCS = w => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const nx = w[i + 1];
    if (!nx || !SOFT.includes(nx)) continue;
    if (w[i] === 'c') out.push(w.slice(0, i) + 's' + w.slice(i + 1));
    else if (w[i] === 's') out.push(w.slice(0, i) + 'c' + w.slice(i + 1));
  }
  return out;
};

/* y↔i · **רק בסוף מילה**, שם הן באמת מתחלפות (‎-ly/-li‎, happy/happi-). באמצע המילה
   התוצאה היא ynner מתוך inner ו-permissyon מתוך permission · צורות שאינן קיימות. */
const genYI = w => {
  const i = w.length - 1;
  if (i < 1) return [];
  if (w[i] === 'y') return [w.slice(0, i) + 'i'];
  if (w[i] === 'i') return [w.slice(0, i) + 'y'];
  return [];
};

/* עיצור כפול · ocurr/occur, accomodate/accommodate. שני הכיוונים, כי שתי הטעויות
   נצפות: גם השמטת האות הכפולה וגם הכפלה מיותרת של אות בודדת. */
const genDblCons = w => {
  const out = [];
  for (let i = 0; i + 1 < w.length; i++) {
    if (w[i] === w[i + 1] && CONS.includes(w[i])) out.push(w.slice(0, i) + w.slice(i + 1));
  }
  for (let i = 1; i < w.length - 1; i++) {
    if (!CONS.includes(w[i]) || w[i] === w[i + 1] || w[i] === w[i - 1]) continue;
    out.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1));
  }
  return out;
};

const RULES = [
  { tag: 'ie/ei', gen: both('ie', 'ei') },
  { tag: 'c/k', gen: both('c', 'k') },
  { tag: 'c/s', gen: genCS },
  { tag: 'ph/f', gen: both('ph', 'f') },
  { tag: 'silent-e', gen: genSilentE },
  { tag: 'y/i', gen: genYI },
  { tag: 'dbl-cons', gen: genDblCons }
];

const genPattern = w => {
  const out = [];
  for (const r of RULES) for (const v of r.gen(w)) out.push(v);
  return out;
};

/* איזון בין החוקים · מדידה: pattern/dbl-cons ייצר 3,884 שורות ו-pattern/ie-ei ‏32,
   יחס 120:1 בתוך אופרטור אחד. הסיבה אינה תדירות אמיתית אלא ספירה: dbl-cons מפיק
   עשרות וריאציות למילה ו-ie/ei לכל היותר אחת, ואחרי ערבוב אחיד של הרשימה המאוחדת
   הראשונה כמעט תמיד שייכת לחוק הפורה. הבורר לוקח את הראשון · ולכן החוק הפורה בלע הכול.
   התיקון: כל חוק נדגם בנפרד, סדר החוקים מעורבב, והרשימה נשזרת round-robin. חוק שירה
   מקבל סיכוי שווה להיות ראשון, בלי קשר לכמה וריאציות הוא יודע לייצר. */
function applyPattern(key, rng) {
  const words = String(key).split(' ');
  const buckets = RULES.map(r => {
    const list = [];
    for (let w = 0; w < words.length; w++) {
      const src = words[w];
      if (!src) continue;
      for (const v of r.gen(src)) {
        if (!v || v === src) continue;
        const c = words.slice(); c[w] = v;
        list.push(c.join(' '));
      }
    }
    return shuffled(list, rng);
  });
  const order = shuffled(RULES.map((r, i) => i), rng).filter(i => buckets[i].length);
  const out = [], seen = new Set();
  for (let depth = 0; ; depth++) {
    let any = false;
    for (const i of order) {
      const b = buckets[i];
      if (depth >= b.length) continue;
      any = true;
      if (!seen.has(b[depth])) { seen.add(b[depth]); out.push(b[depth]); }
    }
    if (!any) break;
  }
  return out;
}

/* איזו תבנית ייצרה את התוצאה. נבדק ולא נזכר: החוקים חופפים (c/s ו-c/k יכולים לייצר
   את אותה מחרוזת ממילים שונות), ולכן התג נגזר מהתוצאה בפועל ולא נשמר בצד. */
function patternWhy(key, out) {
  const words = String(key).split(' ');
  const got = String(out).split(' ');
  if (words.length !== got.length) return 'pattern';
  for (let i = 0; i < words.length; i++) {
    if (words[i] === got[i]) continue;
    for (const r of RULES) if (r.gen(words[i]).includes(got[i])) return r.tag;
    return 'pattern';
  }
  return 'pattern';
}

const op = (name, cls, weight, gen, why) => ({
  name, class: cls, weight,
  apply: (key, rng) => shuffled(perWord(gen)(key), rng),
  why: why || (() => name)
});

/* סכום המשקלים 7, כמו בעברית · אותו תקציב מועמדים למפתח בשני הסטים, אחרת ה-recall של
   he-word ושל en-word אינם ניתנים להשוואה.
   ‏pattern ירד מ-2 ל-1 אחרי שלושת השערים למעלה: החוקים מייצרים עכשיו הרבה פחות
   וריאציות למילה, ושני חריצים היו נשארים ריקים על רוב המפתחות. החריץ שהתפנה עבר
   ל-drop · השמטת אות היא מחלקת הטעות השנייה בשכיחותה אחרי שכנות מקלדת, והיא זו
   ששומרת על סכום 7 ועל ההשוואתיות מול העברית. */
const OPS = [
  op('adj', 'keyboard', 2, genAdj),
  op('transpose', 'order', 1, genTranspose),
  op('drop', 'omission', 2, genDrop),
  op('double', 'duplication', 1, genDouble),
  { name: 'pattern', class: 'pattern', weight: 1, apply: applyPattern, why: patternWhy }
];

module.exports = { OPS, ADJ, ROWS, RULES, patternWhy, applyPattern, genCS, genYI, genSilentE, SOFT };
