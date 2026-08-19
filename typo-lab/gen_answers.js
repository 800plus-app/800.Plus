'use strict';
/* מחולל הקורפוס · typo-lab/gen_answers.js
 *
 * ===== מה זה, ומה זה **לא** =====
 *
 * זה **לא** הדאטהסט המתויג. `gen_dataset.js` מייצר שורות עם `label` שהמעבדה כתבה,
 * וה-GA מכייל ספים מולן. כאן אין `label` בכלל: הקובץ הזה מפיק **תשובות** — מחרוזות
 * שלומד יכול היה להקליד — ומשאיר את הפסק למורה (המודל). התלמיד (האלגוריתם
 * הדטרמיניסטי) לומד אחר כך לחקות את הפסק הזה.
 *
 * לכן כל מספר שמכיל הכרעה של המעבדה יושב ב**קובץ נפרד** (`answers-dx-*.jsonl`),
 * ואין להראות אותו למורה: מורה שרואה "מה האלגוריתם של היום חושב" מעגן את עצמו
 * בדיוק במה שאנחנו מנסים לשפר.
 *
 * ===== ⭐ מה קובע את איכות הקורפוס · ההתפלגות, לא הכמות =====
 *
 * מחולל שמפיק 50,000 וריאציות מאותה משפחה נותן לתלמיד 50,000 עותקים של אותו לקח.
 * שלוש הכרעות מבנה נגזרות מזה, וכולן נאכפות בקוד ולא בכוונה טובה:
 *
 *   1. **תור round-robin לפי משקלים, עם סיבוב לפי המפתח.** אותה טכניקה של
 *      `gen_dataset` (ושם היא נמדדה: בלי הסיבוב, סט gloss שלם יצא בלי אף היפוך).
 *      כל מחלקה מקבלת חריצים לפי משקל, ואף מחלקה אינה יכולה לבלוע את התקציב.
 *   2. **⛔ שליליות קשות הן לפחות מחצית מהקורפוס.** התקציב מחולק ‎12/22‎ לטובת
 *      השליליות, וזבל אקראי הוא **רצפה ולא מלאי** (חריץ אחד, ורק לכרטיס שלא נמצאו
 *      לו שלושה שליליים אמיתיים). שלילי שקל לדחות אינו מלמד לדחות.
 *   3. **⭐ דגימה בגבול.** לכל חריץ נבנית רשימת מועמדים מלאה, כל מועמד מנוקד מול
 *      ההכרעה של היום, ובהסתברות `EDGE_SHARE` נבחר המועמד ש**הכי קרוב לגבול**.
 *      רוב הזוגות ברורים מאליהם ואינם מלמדים כלום; המידע יושב ברצועה שבה האלגוריתם
 *      של היום כמעט מכריע. שאר החריצים נדגמים אחיד, כי קורפוס שכולו גבול הוא הטיה
 *      בפני עצמה.
 *
 * ===== הגדרת רצועת הגבול · מדידה, לא תחושה =====
 *
 * לכל מועמד מחושבים, מול הפרמטרים ש**נשלחים בפועל** (`app.js:TYPO_PARAMS`):
 *   dOwn    מרחק עריכה לצורה הקבילה הקרובה ביותר של הכרטיס
 *   dOther  מרחק למפתח הקרוב ביותר במאגר ששייך לערך אחר
 *   margin  ‎min over candidates‎ של ‎(המרחק הממושקל − סף רצועת האורך)‎
 * והשורה נחשבת **בגבול** אם היא אינה מתקבלת היום ומתקיים אחד מארבעה:
 *   E1  ‎|margin| ≤ 0.35‎              · כמעט מכריע על מרחק (0.35 ≈ פעולה זולה אחת)
 *   E2  ‎dOther−dOwn ∈ [hard−1, hard+1]‎ · כמעט מכריע על דו-משמעות
 *   E3  ‎margin ≤ 0‎ ובכל זאת נדחה     · כלומר **רק** וטו (לקסיקון/מאגר/אורך) עוצר
 *   E4  ‎dOwn = 3‎ בדיוק                · יושבת על תקרת הפעולות
 * ‏E3 היא הרצועה שחנקה את ה-recall בעברית (‏2,019 שורות `real-word` ב-v3), ולכן
 * היא מחלקה בפני עצמה ולא הערת שוליים.
 *
 * ===== ⛔ ‏24 המקרים של חגי · holdout חיצוני =====
 *
 * הם ה-benchmark היחיד שאינו מעגלי, ולכן הם **מוחרגים מכל דבר**: הכרטיס עצמו לא
 * מייצר שורות, מפתחות המונח ומקטעי הפירוש שלו אינם משמשים לא כבסיס חיובי ולא
 * כתורם שלילי, ואף מחרוזת מוקלדת אינה שווה לאחת מ-24 התשובות. הם נכתבים לקובץ
 * נפרד עם ‎`split: "external"`‎, ו-`--selftest` מוכיח באדום שהחסימה יורה.
 *
 * ===== דליפה · חלוקה ברמת המילה, ותורמים מאותו צד =====
 *
 * ‏`split` נגזר מ-fnv1a של ה**קבוצה**, לא של השורה:
 *   כיוון המונח   קבוצה = מפתח המונח
 *   כיוון הפירוש  קבוצה = מקטע הפירוש  (ממצא F4 · "כעס" מפרש שישה ערכים, וגזירה
 *                 מהמונח הייתה שמה את אותו טקסט בשני הצדדים)
 * וזה לבדו אינו מספיק: שלילי שנתרם מכרטיס אחר גורר את **הכרטיס האחר** לתוך השורה.
 * לכן כל תורם — מונח אחר, מקטע אחר, שותף דו-משמעות — נבדק שהוא באותו `split`,
 * ותורם מ-split אחר **נזרק ונספר**. זה מבני, לא סטטיסטי.
 *
 * ===== דטרמיניזם =====
 * אין ‎Math.random‎. כל בחירה נגזרת מ-`rngFor(...)` וממחרוזת-מתכון שנשמרת בשורה
 * עצמה בשדה `seed`, וכל איטרציה היא על מערך ממוין. שתי ריצות מפיקות קובץ זהה
 * ביט-אחר-ביט, וה-SHA-256 של כל קובץ נרשם במניפסט.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { fnv1a, rngFor, randInt } = require('./lib/rng.js');
const { acceptedKeys, acceptedSegs, acceptsToday } = require('./lib/keys.js');
const { buildVeto } = require('./lib/veto.js');
const { buildLexicon } = require('./lib/lexicon.js');
const { licitForms } = require('./lib/morph.js');
const MR = require('./lib/morphrules.js');
const TAX_HE = require('./lib/taxonomy-he.js');
const TAX_EN = require('./lib/taxonomy-en.js');
const { normalizeParams, nearestOther } = require('./lib/checker.js');
const { wEditDist } = require('./lib/wdist.js');
const { buildIndex, letters } = require('./gen_dataset.js');
const MG = require('./measure_gloss.js');

/* ⚠ `gen_dataset.wordsOf` מחזירה **מספר** ולא מערך, ואין לייבא אותה לכאן. הגרסה
   הראשונה כן ייבאה אותה, ו-`ws.length` על מספר הוא `undefined`: שש מחלקות שלמות
   (נרדפות · תשובה חלקית · מילה עודפת · סדר מילים · החלפת מילה · מורפולוגיה בצד
   הפירוש) יצאו **ריקות בשקט**, בלי שגיאה ובלי אזהרה. נתפס רק בטבלת ההתפלגות. */
const wsOf = s => String(s).split(' ').filter(Boolean);

const OUT_DIR = path.join(__dirname, 'out');
const SYN = require('./lexicon/synonyms.json');

/* ===== קבועים · שינוי כאן משנה את ה-SHA ולכן הם חלק מהמניפסט ===== */
/* ⭐ v2 · נוספו שלוש מחלקות שחמשת המקרים האמיתיים של חגי (16.8) הוכיחו שחסרות:
   func-prefix (0 שורות עם ש') · seg-concat (0 שורות) · ktiv-haser בצד הפירוש
   (קיים כ-1,643 שורות תחת התווית mater, ולכן לא היה נמדד). SPLIT_SALT **לא**
   השתנה בכוונה — חלוקת train/val/holdout לכל קבוצה נשארת זהה ל-v1. */
const SEED = 'typo-lab/answers/v2';
const SPLIT_SALT = 'typo-lab/answers/split/v1';
const SPLIT_TRAIN = 0.70;
const SPLIT_VAL = 0.85;              // ‏[0.70,0.85) val · השאר holdout

const MIN_LEN = 3;
const MAX_D = 3;                     // תקרת הפעולות של הבודק · אותו MAX_OPS
const EDGE_W = 0.35;                 // ‏E1 · רוחב רצועת הגבול במרחק הממושקל
const EDGE_SHARE = 0.7;              // איזה חלק מהחריצים מעדיף את המועמד הקרוב לגבול
const EDGE_SCAN = 20;                // כמה מועמדים נסרקים לכל חריץ בחיפוש הגבול

const SLOTS = { wordPos: 6, wordNeg: 7, glossPos: 4, glossNeg: 5 };
const GARBAGE_FLOOR = 3;             // חריץ הזבל נפתח רק מתחת למספר שליליים אמיתיים הזה
const NIQQUD_EVERY = 3;              // דגימה דלילה של מחלקות הניקוד · ראה §ניקוד
const VERIFY_EVERY = 40;             // כל שורה כזאת נבדקת מול הפונקציה **האמיתית**

const SEG_MAX_WORDS = 4;
const SEG_MAX_LETTERS = 24;

const HE_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשת';
const EN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

const NIQQUD_G = /[֑-ׇ]/g;           // ל-replace בלבד
const NIQQUD_1 = /[֑-ׇ]/;            // ל-test · regex עם /g שומר lastIndex ומשקר בלולאה
/* תנועות שאפשר להחליף זו בזו בלי לשנות את **האותיות** · בדיוק המקרה שנטען שלא נבדק. */
const NIQQUD_POOL = ['ְ', 'ֱ', 'ִ', 'ֵ', 'ֶ', 'ַ', 'ָ', 'ֹ', 'ֻ'];

const FILLERS = ['מאוד', 'מאד', 'הרב', 'ביותר', 'לגמרי', 'לחלוטין', 'במיוחד', 'ממש'];

/* ===== ⭐ אותיות שימוש · שלוש המחלקות שחמשת המקרים של חגי (16.8) חשפו =====
 *
 * ‏`particleMatch` (app.js:1799) מקלפת מהרשימה ‎'הלבכו'‎ — **ש' ו-מ' אינן בה** —
 * ויש לה שומר ‎`w.length > 3`‎. מקרה H16-4 נופל בשתיהן בבת אחת: `שבו` מול `בו`,
 * ש' שאינה ברשימה, ומילה בת שלוש אותיות שהשומר חוסם ממילא.
 * נמדד על הקורפוס לפני ההוספה: תחילית ש' אמיתית — **0 שורות**. שאר התחיליות
 * הופיעו רק כתוצר לוואי של הכפלת אות (‏468) או של `adj` (‏98), וכולן במחלקות
 * שליליות. כלומר הצורה שהלומד באמת מקליד לא הייתה מיוצגת בכלל. */
const FUNC_PREFIX = ['ש', 'כש', 'ה', 'ב', 'ל', 'כ', 'מ', 'ו'];

/* ===== המחלקות · המשקל הוא מספר החריצים בתור, לא הסתברות ===== */
const POS_CLASSES = [
  { id: 'sp-adj', w: 2, dirs: 'wg' },          // שכן מקלדת
  { id: 'sp-transpose', w: 1, dirs: 'wg' },    // היפוך
  { id: 'sp-drop', w: 1, dirs: 'wg' },         // השמטה
  { id: 'sp-double', w: 1, dirs: 'wg' },       // הכפלה
  { id: 'sp-pattern', w: 1, dirs: 'w' },       // אנגלית · ie/ei, c/k, c/s, ph/f, silent-e, y/i
  { id: 'mater', w: 2, dirs: 'wg' },           // ⭐ אם קריאה ו/י · הנפוצה ביותר בעברית
  { id: 'homophone', w: 1, dirs: 'wg' },       // ת/ט כ/ק א/ע ס/ש ח/כ ב/ו
  { id: 'niqqud-none', w: 1, dirs: 'w' },
  { id: 'niqqud-partial', w: 1, dirs: 'w' },
  { id: 'niqqud-wrong', w: 1, dirs: 'w' },
  { id: 'ktiv-haser', w: 2, dirs: 'wg' },      // ⭐ הפער האמיתי בשכנות הניקוד · H16-2
  { id: 'func-prefix', w: 2, dirs: 'g' },      // ⭐ שבו/בו · H16-4 · אות שימוש, לא אות שורש
  { id: 'seg-concat', w: 2, dirs: 'g' },       // ⭐ שני מקטעים ברצף · H16-3
  { id: 'morph-pair', w: 2, dirs: 'wg' },      // כעס↔לכעוס · רשם↔רושם
  { id: 'synonym', w: 2, dirs: 'g' },          // 55 הקבוצות המאושרות
  { id: 'partial-head', w: 2, dirs: 'g' },     // תשובה חלקית · ראש מקטע
  { id: 'partial-cut', w: 2, dirs: 'g' },      // תשובה חלקית · חיתוך ב"או"
  { id: 'extra-word', w: 2, dirs: 'g' },       // לצערו הרב מול לצערו
  { id: 'word-order', w: 1, dirs: 'g' },
];

const NEG_CLASSES = [
  { id: 'neg-other-term', w: 2, dirs: 'w' },       // מילת מאגר אחרת
  { id: 'neg-other-gloss', w: 3, dirs: 'g' },      // פירוש של ערך אחר
  { id: 'neg-equidistant', w: 3, dirs: 'wg' },     // ⭐ אותו מספר צעדים משתי מילים
  { id: 'neg-real-word', w: 3, dirs: 'wg' },       // מילה אמיתית שאינה צורת הכרטיס
  { id: 'neg-homophone-word', w: 2, dirs: 'wg' },  // חכירה↔חקירה
  { id: 'neg-inflection', w: 2, dirs: 'w' },       // כפרים / כֹּפֶר
  { id: 'neg-participle', w: 1, dirs: 'w' },       // כבש→כובש · מילה אחרת, לא טעות
  { id: 'neg-other-variant', w: 2, dirs: 'w' },
  { id: 'neg-morph-overreach', w: 2, dirs: 'g' },
  { id: 'neg-synonym-rejected', w: 2, dirs: 'g' }, // 47 הקבוצות שהשער פסל
  { id: 'neg-gloss-swap', w: 2, dirs: 'g' },
  { id: 'neg-garbage', w: 1, dirs: 'wg' },         // רצפה בלבד · ראה GARBAGE_FLOOR
];

/* ===== עזר ===== */
const bare = s => String(s == null ? '' : s).replace(NIQQUD_G, '');
const uniqSorted = a => Array.from(new Set(a.filter(Boolean))).sort();
const isNeg = c => c.startsWith('neg-');

function splitOf(group) {
  const r = (fnv1a(group + SPLIT_SALT) % 100000) / 100000;
  return r < SPLIT_TRAIN ? 'train' : (r < SPLIT_VAL ? 'val' : 'holdout');
}

/* תור round-robin עם סיבוב לפי המפתח · הטכניקה של gen_dataset, ומאותה סיבה בדיוק:
   תקציב שקטן מאורך התור נבלע כולו בראש התור אם לא מסובבים. */
function drawQueue(classes, dir) {
  const q = [];
  for (const c of classes) if (c.dirs.includes(dir)) for (let i = 0; i < c.w; i++) q.push(c.id);
  return q;
}
const rotate = (queue, key, i) => queue[(fnv1a(key + '|rot') + i) % queue.length];

function thrOf(bands, len) {
  for (const b of bands) if (len <= b.maxLen) return b.t;
  return bands[bands.length - 1].t;
}

/* כל המחרוזות במרחק עריכה 1. משמש לחיתוך "אותו מספר צעדים משתי מילים": מחרוזת
   שנמצאת בשתי הסביבות היא במרחק ≤1 משתיהן, והשוויון עצמו מאומת ב-editDist. */
function edits1(w, alphabet) {
  const out = new Set();
  for (let i = 0; i < w.length; i++) {
    out.add(w.slice(0, i) + w.slice(i + 1));
    for (const c of alphabet) if (c !== w[i]) out.add(w.slice(0, i) + c + w.slice(i + 1));
  }
  for (let i = 0; i <= w.length; i++) for (const c of alphabet) out.add(w.slice(0, i) + c + w.slice(i));
  out.delete(w);
  return out;
}

/* ===== §ניקוד =====
 * ⚠ מה שהמדידה החזירה, והוא סוגר את החשד: **כל 1,717 המונחים העבריים מנוקדים**,
 * ו-norm מסירה את כל טווח ‎U+0591..U+05C7‎ (אומת: ‏1,717 מתוך 1,717 מונחים נותנים
 * אותו מפתח עם ניקוד ובלעדיו). לכן הקלדה **בלי** ניקוד, עם ניקוד **חלקי**, או עם
 * ניקוד **שגוי** מגיעות לאותו מפתח בדיוק ומתקבלות היום — הן אינן פער.
 * הפער האמיתי בשכנות הזאת הוא **כתיב חסר**: המונח נכתב מלא (מִכְמוֹרֶת) והלומד
 * הקליד את הצורה החסרה (מכמרת), כלומר האות ו' עצמה נעלמה — וזה כבר מפתח אחר.
 * שלוש מחלקות הניקוד נשארות בקורפוס בדגימה דלילה (`NIQQUD_EVERY`) כדי שהתכונה
 * תהיה **מקובעת ולא מונחת**: אם מישהו ישנה את norm, הן יתחילו ליפול.
 */
function niqqudVariants(term, kind) {
  const s = String(term);
  const marks = [];
  for (let i = 0; i < s.length; i++) if (NIQQUD_1.test(s[i])) marks.push(i);
  if (!marks.length) return [];
  if (kind === 'none') return [bare(s)];
  const out = [];
  if (kind === 'partial') {
    for (let keep = 1; keep < marks.length; keep++) {
      const drop = new Set(marks.slice(keep));
      out.push(Array.from(s).filter((c, i) => !drop.has(i)).join(''));
    }
    return out;
  }
  for (const i of marks) for (const m of NIQQUD_POOL) {
    if (s[i] === m) continue;
    out.push(s.slice(0, i) + m + s.slice(i + 1));
  }
  return out;
}

/* כתיב חסר · הסרת אם קריאה שהניקוד מסמן כמלאה (חולם מלא, שורוק, חיריק מלא). */
function ktivHaser(term, ctx) {
  const s = String(term);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== 'ו' && s[i] !== 'י') continue;
    const pm = s[i - 1] || '';
    const nx = s[i + 1] || '';
    const isMater = s[i] === 'ו'
      ? (pm === 'ֹ' || pm === 'ֻ' || nx === 'ּ' || nx === 'ֹ')
      : (pm === 'ִ' || pm === 'ֵ');
    if (!isMater) continue;
    let j = i + 1;
    while (j < s.length && NIQQUD_1.test(s[j])) j++;
    const v = ctx.K(s.slice(0, i) + s.slice(j));
    if (v) out.push(v);
  }
  return out;
}

/* אות שימוש שנוספה או נגרעה ממילה בתוך מקטע · שני הכיוונים. */
function funcPrefixVariants(seg) {
  const ws = wsOf(seg);
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    for (const p of FUNC_PREFIX) {
      if (!w.startsWith(p)) {
        const c = ws.slice(); c[i] = p + w; out.push(c.join(' '));
      } else if (w.length - p.length >= 2) {
        const c = ws.slice(); c[i] = w.slice(p.length); out.push(c.join(' '));
      }
    }
  }
  return out;
}

/* כתיב חסר בצד הפירוש · **מחיקה בלבד** של אם קריאה פנימית · עיקרון → עקרון.
   זו תת-קבוצה של `mater` (שעושה גם הוספה), והיא מופרדת כדי שתהיה **נמדדת**:
   ‏1,643 שורות בצורה הזאת כבר היו בקורפוס, אבל תחת התווית `mater`, ולכן אי אפשר
   היה לדעת כמה מהן ולא אפשר היה להעלות אותן בתור. */
function ktivHaserSeg(seg) {
  const out = [];
  const ws = wsOf(seg);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    for (let j = 1; j < w.length - 1; j++) {
      if (w[j] !== 'י' && w[j] !== 'ו') continue;
      const c = ws.slice(); c[i] = w.slice(0, j) + w.slice(j + 1);
      out.push(c.join(' '));
    }
  }
  return out;
}

/* ===== נרדפות · 55 מאושרות (חיובי) מול 47 שהשער פסל (שלילי קשה) =====
 * ⚠ המפתחות **חייבים** להיות מנורמלים. מקטעי הפירוש מגיעים מ-`meaningSegs`, כלומר
 * אחרי norm, ולכן אותיות סופיות מקופלות ("טרם" הוא "טרמ"). מפה שנבנתה מהכתיב
 * הרגיל של `synonyms.json` פשוט לא מוצאת אותן — בשקט, בלי שגיאה. */
function synonymMaps(ctx) {
  const N = w => (ctx ? ctx.norm(w) : w) || w;
  const ok = new Map(), bad = new Map();
  for (const g of SYN.groups) {
    const target = g.status === 'approved' ? ok : bad;
    for (const a of g.words) for (const b of g.words) {
      if (a === b) continue;
      const ka = N(a), kb = N(b);
      if (ka === kb) continue;
      let s = target.get(ka); if (!s) { s = new Set(); target.set(ka, s); }
      s.add(kb);
    }
  }
  return { ok, bad };
}

function substituteWord(seg, map) {
  const ws = wsOf(seg);
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    const alts = map.get(ws[i]);
    if (!alts) continue;
    for (const a of Array.from(alts).sort()) {
      const c = ws.slice(); c[i] = a;
      out.push(c.join(' '));
    }
  }
  return out;
}

/* ===== מורפולוגיה · אותה מילה במשקל אחר, מטבלת הזוגות שכתבנו בעצמנו ===== */
function morphForms(word) {
  const out = new Set();
  for (const pr of MR.BINYAN_PAIRS) {
    for (const [from, to] of [['a', 'b'], ['b', 'a']]) {
      const r = MR.matchTemplate(word, pr[from], false);
      if (!r) continue;
      const v = MR.fillTemplate(pr[to], r);
      if (v && v !== word && !/[ךםןףץ]/.test(v)) out.add(v);
    }
  }
  return Array.from(out).sort();
}

/* ===== המחולל =====
 * opts:
 *   outDir       · לאן נכתב
 *   limitCards   · עצירה אחרי N כרטיסים לשפה (לשערים בלבד)
 *   quiet        · בלי פלט התקדמות
 *   brokenSplit  · ⛔ שן · split ברמת ה**שורה** במקום ברמת הקבוצה · חייב להדליק את שער הדליפה
 *   brokenBlock  · ⛔ שן · ביטול חסימת 24 המקרים · חייב להדליק את השער השני
 */
function generate(opts) {
  const o = opts || {};
  const outDir = o.outDir || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const say = s => { if (!o.quiet) process.stdout.write(s + '\n'); };
  const t00 = Date.now();

  const CTX = { he: getCtx('he'), en: getCtx('en') };
  const LEX = buildLexicon();
  const SYNM = synonymMaps(getCtx('he'));
  const heCtx = CTX.he;

  /* ---- ⛔ 24 המקרים · חסימה מלאה ---- */
  const resolved = MG.resolveCases({
    ctx: heCtx,
    cards: Array.from(heCtx.BANK).map(w => ({ key: heCtx.K(w.term), w })),
  });
  if (resolved.length !== 24) throw new Error(`gen_answers: ${resolved.length} מקרים אותרו במקום 24`);

  const CASE_TERM_RAW = new Set(resolved.map(r => String(r.card.w.term)));
  const BLOCK_TERM = new Set();
  const BLOCK_SEG = new Set();
  const BLOCK_TYPED = new Set();
  for (const { c, card } of resolved) {
    for (const k of acceptedKeys(card.w, heCtx)) BLOCK_TERM.add(k);
    for (const s of acceptedSegs(card.w, heCtx)) BLOCK_SEG.add(s);
    BLOCK_TYPED.add(heCtx.norm(c.typed));
  }
  const CASE_TERM = new Set(BLOCK_TERM), CASE_SEG = new Set(BLOCK_SEG);
  if (o.brokenBlock) { BLOCK_TERM.clear(); BLOCK_SEG.clear(); BLOCK_TYPED.clear(); }
  const isCaseCard = w => !o.brokenBlock && CASE_TERM_RAW.has(String(w.term));
  say(`⛔ holdout חיצוני · 24 מקרים · ${BLOCK_TERM.size} מפתחות מונח · ${BLOCK_SEG.size} מקטעים חסומים`);

  /* ---- אינדקס פירושים מאוחד לשני המאגרים (ממצא F3) ---- */
  const glossOwners = new Map();
  for (const L of ['he', 'en']) {
    const c = CTX[L];
    for (const w of Array.from(c.BANK)) {
      if (isCaseCard(w)) continue;
      const owner = L + ':' + c.K(w.term);
      for (const s of Array.from(c.meaningSegs(w.meaning))) {
        if (!s || BLOCK_SEG.has(s)) continue;
        let set = glossOwners.get(s); if (!set) { set = new Set(); glossOwners.set(s, set); }
        set.add(owner);
      }
    }
  }
  const segIndex = buildIndex(glossOwners);

  /* ---- מאגרי תורמים לפי split · תורם מ-split אחר הוא דליפה ולכן נזרק ---- */
  const segBySplit = { train: [], val: [], holdout: [] };
  for (const s of segIndex.keys) {
    if (letters(s) < MIN_LEN) continue;
    segBySplit[splitOf('g|' + s)].push(s);
  }
  for (const k of Object.keys(segBySplit)) segBySplit[k].sort();

  const state = {};
  for (const L of ['he', 'en']) {
    const ctx = CTX[L];
    const veto = buildVeto(ctx, L);
    const termIndex = buildIndex(veto.termKeys);
    const wordSet = L === 'he' ? 'he-word' : 'en-word';
    const termBySplit = { train: [], val: [], holdout: [] };
    for (const k of termIndex.keys) {
      if (BLOCK_TERM.has(k) || letters(k) < MIN_LEN) continue;
      termBySplit[splitOf('w|' + L + '|' + k)].push(k);
    }
    for (const s of Object.keys(termBySplit)) termBySplit[s].sort();
    state[L] = {
      ctx, veto, termIndex, termBySplit,
      pWord: normalizeParams(ctx.TYPO_PARAMS[wordSet]),
      pGloss: normalizeParams(ctx.TYPO_PARAMS.gloss),
      tax: L === 'he' ? TAX_HE : TAX_EN,
      alphabet: L === 'he' ? HE_ALPHABET : EN_ALPHABET,
      lex: L === 'he' ? LEX.he : LEX.en,
    };
    say(`[${L}] מאגר ${Array.from(ctx.BANK).length} כרטיסים · אינדקס מונחים ${termIndex.size} מפתחות · פילוח ${termBySplit.train.length}/${termBySplit.val.length}/${termBySplit.holdout.length}`);
  }

  /* ===== ניקוד מועמד מול ההכרעה של היום =====
   * אין כאן מימוש שני של ההכרעה: אלה בדיוק הרכיבים של `lib/checker.js` (אותו
   * `wEditDist`, אותו `nearestOther`, אותם `bands` אחרי `normalizeParams`), בהרכבה
   * שמחזירה גם את המספרים ולא רק את הפסק. הפסק **האמיתי** נדגם ומאומת בהמשך. */
  function scoreCand(a) {
    const { key, cands, index, allow, P, ctx, accSet, lexReal } = a;
    const today = accSet.has(key);
    let dOwn = Infinity;
    const scored = [];
    for (const c of cands) {
      const raw = ctx.editDist(key, c);
      if (raw < dOwn) dOwn = raw;
      if (raw <= MAX_D) scored.push({ c, raw, len: letters(c) });
    }
    scored.sort((x, y) => x.raw - y.raw || x.len - y.len || (x.c < y.c ? -1 : x.c > y.c ? 1 : 0));
    const dOther = nearestOther(key, index, allow, ctx);
    const gap = dOther - dOwn;
    const graded = P.marginSoft > P.marginHard;
    const tight = graded && gap < P.marginSoft;

    /* ⛔ ⚠ המרווח נמדד ב**שני** המשטרים, ולא רק בזה שחל · וזה תיקון של באג מדידה
       אמיתי, לא זהירות יתר. הגרסה הראשונה חישבה margin במשטר שחל בלבד והחזירה
       **68.3% "בגבול"** — מספר שנראה מצוין. הוא היה שקר:
         ‏`WTight` שנשלח נותן **99** ל-sub/adjSub/del/materVI/homophone, ולכן כל
         מרווח במשטר הצר יוצא בסדר גודל של **97**. ‏`|margin| ≤ 0.35` לא יכול
         להידלק שם לעולם, ולכן E1 מת בשקט וכל ה-68% נשענו על טריגר הדו-משמעות
         בלבד — כלומר המדד מדד **גן אחד** והצהיר על שניים.
       מה שהיה שגוי בהמשגה: שורה במשטר הצר אינה "רחוקה מהגבול". היא רחוקה מסף
       **אחד** בזמן שהסף שמכריע עליה בפועל הוא **מתי המשטר מתהדק** (‎gap =
       marginSoft‎). לכן נמדדים שניהם, ו-E2 דורש ששני המשטרים יהיו **חלוקים**.
       אחרי התיקון: 41.3% רחב · 22.4% גרעין.
       ⛔ **הלקח שאסור לאבד:** מדד גבול שמחושב תחת וקטור משקלים אחד בלבד, בעוד
       שהריצה בוחרת בין שני וקטורים, מודד את הגן הלא נכון ונראה מצוין בזמן שהוא
       עושה את זה. כל שינוי כאן חייב להישאל מול שני המשטרים. */
    const marginIn = (W, bands) => {
      let margin = Infinity, wdist = Infinity, thr = 0;
      for (const s of scored.slice(0, 4)) {
        const t = thrOf(bands, s.len);
        const d = wEditDist(key, s.c, W, Infinity, MAX_D);
        if (!isFinite(d)) continue;
        if (d - t < margin) { margin = d - t; wdist = d; thr = t; }
      }
      return { margin, wdist, thr };
    };
    const main = marginIn(P.W, P.bands);
    const tt = graded ? marginIn(P.WTight, P.bandsTight) : main;
    const app = tight ? tt : main;
    const num = x => (isFinite(x) ? Number(x.toFixed(4)) : null);

    /* חמישה טריגרים, וכל אחד הוא "שינוי אחד קטן מהפך את ההכרעה". */
    const why = [];
    if (!today) {
      const vetoed = lexReal || gap < P.marginHard || letters(key) < P.minLen;
      // E1 · שער המרחק · המרווח במשטר שחל יושב על הסף
      if (isFinite(app.margin) && Math.abs(app.margin) <= EDGE_W) why.push('E1');
      // E2 · שער המשטר · gap צמוד לקו ההידוק, ושני המשטרים חלוקים על התוצאה
      if (graded && isFinite(gap) && Math.abs(gap - P.marginSoft) <= 1 &&
        isFinite(main.margin) && (main.margin <= 0) !== (isFinite(tt.margin) && tt.margin <= 0)) why.push('E2');
      // E3 · המרחק כבר מקבל · רק וטו (לקסיקון · מאגר · אורך) עוצר
      if (isFinite(app.margin) && app.margin <= 0 && vetoed) why.push('E3');
      // E4 · יושבת בדיוק על תקרת שלוש הפעולות
      if (dOwn === MAX_D) why.push('E4');
      // E5 · שער הדו-משמעות · המרחק מקבל, ורק שוליים בגודל שלם אחד מכריעים
      if (isFinite(app.margin) && app.margin <= 0 && isFinite(gap) && Math.abs(gap - P.marginHard) <= 1) why.push('E5');
    }
    return {
      today, dOwn: isFinite(dOwn) ? dOwn : null, dOther: isFinite(dOther) ? dOther : null,
      gap: isFinite(gap) ? gap : null,
      wdist: num(app.wdist), thr: app.thr, margin: num(app.margin),
      marginMain: num(main.margin), marginTight: num(tt.margin),
      regime: tight ? 'tight' : 'main', lexReal: !!lexReal,
      /* שתי הגדרות, ובכוונה. `edgeStrict` הוא הגרעין שאין עליו ויכוח — המרווח
         עצמו יושב על הסף (E1) או שרק וטו מפריד בין קבלה לדחייה (E3). `edge`
         כולל גם את שער המשטר, את התקרה ואת שער הדו-משמעות. מדווחים את שניהם,
         כדי שהכותרת לא תישען על ההגדרה הנוחה. */
      edge: why.length > 0, edgeStrict: why.includes('E1') || why.includes('E3'),
      edgeWhy: why.join('+'),
    };
  }

  /* ===== לולאת הייצור ===== */
  const rows = { he: [], en: [] };
  const dxRows = { he: [], en: [] };
  const counts = {
    class: {}, langDir: {}, classLangDir: {}, split: {}, edge: {}, edgeStrict: {},
    edgeWhy: {}, today: {}, splitClass: {}, classEdge: {}, classToday: {},
  };
  /* כל מחלקה מוצהרת נכנסת לספירה באפס · מחלקה שלא ירתה חייבת להיראות בטבלה
     ולא להיעלם ממנה. זה בדיוק מה שהחביא את באג ה-wordsOf. */
  for (const c of POS_CLASSES.concat(NEG_CLASSES)) counts.class[c.id] = 0;
  const bump = (bag, k) => { bag[k] = (bag[k] || 0) + 1; };
  const dropped = { blockedCards: 0, blockedStrings: 0, crossSplit: 0 };
  /* falsePos · המראה אמרה "מתקבל היום" והאמת אומרת שלא. זה שקר לכיוון המסוכן
     (שורה אמיתית שנחשבה טריוויאלית) ולכן הוא **שער**. falseNeg · הכיוון הבטוח. */
  const verify = { checked: 0, falsePos: 0, falseNeg: 0, examples: [], fpExamples: [] };
  const seq = { he: { word: 0, gloss: 0 }, en: { word: 0, gloss: 0 } };
  let rowNo = 0;

  const noHe = c => !/^(mater|niqqud-|ktiv-haser|homophone|morph-pair|neg-participle)/.test(c.id);
  const Q = {
    wordPos: { he: drawQueue(POS_CLASSES.filter(c => c.id !== 'sp-pattern'), 'w'), en: drawQueue(POS_CLASSES.filter(noHe), 'w') },
    wordNeg: { he: drawQueue(NEG_CLASSES, 'w'), en: drawQueue(NEG_CLASSES.filter(c => c.id !== 'neg-participle'), 'w') },
    glossPos: drawQueue(POS_CLASSES, 'g'),
    glossNeg: drawQueue(NEG_CLASSES, 'g'),
  };

  for (const lang of ['he', 'en']) {
    const S = state[lang];
    const ctx = S.ctx;
    const t0 = Date.now();
    const bank = Array.from(ctx.BANK);
    const cards = o.limitCards ? bank.slice(0, o.limitCards) : bank;

    for (const card of cards) {
      if (isCaseCard(card)) { dropped.blockedCards++; continue; }
      const termKey = ctx.K(card.term);
      if (!termKey || BLOCK_TERM.has(termKey)) { dropped.blockedCards++; continue; }

      const accKeys = acceptedKeys(card, ctx);
      const accSegs = acceptedSegs(card, ctx);
      const ownKeys = Array.from(accKeys).filter(Boolean).sort();
      const ownSegs = Array.from(accSegs).filter(Boolean).sort();
      const allowTerm = new Set(accKeys);
      const allowSeg = new Set();
      for (const k of accKeys) { allowSeg.add('he:' + k); allowSeg.add('en:' + k); }
      for (const t of Array.from(ctx.glossAlts(card))) { const k = ctx.K(t); allowSeg.add('he:' + k); allowSeg.add('en:' + k); }

      const wGroup = 'w|' + lang + '|' + termKey;
      const wSplit = splitOf(wGroup);

      const realWordIn = (set, s) => {
        if (!s) return false;
        const parts = String(s).split(' ').filter(Boolean);
        if (!parts.length) return false;
        for (const p of parts) if (!set.has(p)) return false;
        return true;
      };

      /* ---------- מועמדים · כיוון המונח ---------- */
      const candW = {};
      const addW = (cls, list) => { if (list && list.length) (candW[cls] || (candW[cls] = [])).push(...list.filter(Boolean)); };
      const opOut = name => {
        const op = S.tax.OPS.find(x => x.name === name);
        return op ? op.apply(termKey, rngFor(SEED, lang, termKey, name)).slice(0, 24) : [];
      };
      addW('sp-adj', opOut('adj'));
      addW('sp-transpose', opOut('transpose'));
      addW('sp-drop', opOut('drop'));
      addW('sp-double', opOut('double'));
      if (lang === 'en') addW('sp-pattern', opOut('pattern'));
      if (lang === 'he') {
        addW('mater', opOut('mater'));
        addW('homophone', opOut('homophone'));
        addW('morph-pair', morphForms(termKey));
        addW('ktiv-haser', ktivHaser(card.term, ctx));
        /* ⚠ שלוש מחלקות הניקוד מנורמלות ל**אותו מפתח בדיוק** (זה כל הממצא), ולכן
           שלושתן על אותו כרטיס היו שלוש שורות זהות מבחינת ההכרעה — ומהן השנייה
           והשלישית נופלות ממילא בסינון הכפילויות. לכן כל כרטיס תורם **סוג אחד**,
           והסוג מסתובב לפי המפתח: שלוש המחלקות מיוצגות, בלי שכפול. */
        if (fnv1a(termKey + '|niq') % NIQQUD_EVERY === 0) {
          const kind = ['none', 'partial', 'wrong'][fnv1a(termKey + '|niqkind') % 3];
          addW('niqqud-' + kind, niqqudVariants(card.term, kind).slice(0, 12));
        }
      }

      /* --- שליליים · כיוון המונח --- */
      const nearTerm = [];
      for (const i of S.termIndex.near(termKey, 2)) {
        const k = S.termIndex.keys[i];
        if (k === termKey || accKeys.has(k) || BLOCK_TERM.has(k)) continue;
        let other = false;
        for (const ow of S.termIndex.owners[i]) if (!allowTerm.has(ow)) { other = true; break; }
        if (!other) continue;
        if (splitOf('w|' + lang + '|' + k) !== wSplit) { dropped.crossSplit++; continue; }
        nearTerm.push(k);
      }
      const nearU = uniqSorted(nearTerm);
      addW('neg-other-term', nearU.slice(0, 12));
      /* ⚠ תוספת שאינה קישוט: לכרטיס ב-holdout רק 15% מהמאגר זמינים כתורמים, ולכן
         "מילת מאגר אחרת" הייתה נעלמת שם לגמרי — כלומר המחלקה שהווטו קיים בשבילה
         הייתה חסרה בדיוק ברצועה שמודדים עליה. שלוש מילים אקראיות מאותו split
         סוגרות את זה. הן קלות יותר מהשכנות, ובורר הגבול ממילא יעדיף את הקשות. */
      {
        const pool = state[lang].termBySplit[wSplit];
        const rnd3 = [];
        for (let t = 0; t < 3 && pool.length; t++) {
          const k = pool[randInt(rngFor(SEED, lang, termKey, 'otRand', t), pool.length)];
          if (k && k !== termKey && !accKeys.has(k)) rnd3.push(k);
        }
        addW('neg-other-term', uniqSorted(rnd3));
      }

      {
        const varOut = [];
        for (const src of nearU.slice(0, 4)) {
          for (const op of S.tax.OPS) {
            for (const v of op.apply(src, rngFor(SEED, lang, termKey, 'ov', src, op.name)).slice(0, 3)) {
              if (!v || accKeys.has(v) || v === src) continue;
              if (ctx.editDist(termKey, v) > MAX_D) continue;
              varOut.push(v);
            }
          }
        }
        addW('neg-other-variant', uniqSorted(varOut).slice(0, 12));
      }
      /* ⭐ אותו מספר צעדים משתי מילים · חיתוך שתי סביבות-מרחק-1, ואז שוויון מאומת */
      if (!termKey.includes(' ') && termKey.length >= MIN_LEN && termKey.length <= 12) {
        const e1 = edits1(termKey, S.alphabet);
        const equi = [];
        for (const k2 of nearU.slice(0, 3)) {
          if (k2.includes(' ') || k2.length > 12) continue;
          const e2 = edits1(k2, S.alphabet);
          for (const s of e1) {
            if (!e2.has(s) || accKeys.has(s) || s === k2) continue;
            if (ctx.editDist(s, termKey) !== ctx.editDist(s, k2)) continue;
            equi.push(s);
          }
        }
        addW('neg-equidistant', uniqSorted(equi).slice(0, 16));
      }
      {
        const rw = [], hw = [];
        for (const op of S.tax.OPS) {
          for (const v of op.apply(termKey, rngFor(SEED, lang, termKey, 'rw', op.name)).slice(0, 30)) {
            if (accKeys.has(v) || !realWordIn(S.lex, v)) continue;
            (op.name === 'homophone' ? hw : rw).push(v);
          }
        }
        addW('neg-real-word', uniqSorted(rw).slice(0, 12));
        addW('neg-homophone-word', uniqSorted(hw).slice(0, 12));
      }
      addW('neg-inflection', licitForms(card, lang).map(f => ctx.K(f)));
      if (lang === 'he' && termKey.length === 3) {
        const p = termKey[0] + 'ו' + termKey.slice(1);
        if (TAX_HE.isParticipleShape(termKey, p)) addW('neg-participle', [p]);
      }
      {
        const g = [];
        for (let t = 0; t < 3; t++) {
          const rnd = rngFor(SEED, lang, termKey, 'garb', t);
          let s = '';
          for (let i = 0; i < Math.max(MIN_LEN, letters(termKey)); i++) s += S.alphabet[randInt(rnd, S.alphabet.length)];
          g.push(s);
        }
        addW('neg-garbage', g);
      }

      /* ---------- מועמדים · כיוון הפירוש ---------- */
      const posSegs = ownSegs.filter(s => !BLOCK_SEG.has(s) && letters(s) >= MIN_LEN);
      const shortSegs = posSegs.filter(s => wsOf(s).length <= SEG_MAX_WORDS && letters(s) <= SEG_MAX_LETTERS);
      const gBase = shortSegs.length ? shortSegs[0] : (posSegs.length ? posSegs[0] : null);
      const candG = {};
      const addG = (cls, list) => { if (list && list.length) (candG[cls] || (candG[cls] = [])).push(...list.filter(Boolean)); };
      let gGroup = null, gSplit = null;

      if (gBase) {
        gGroup = 'g|' + gBase;
        gSplit = splitOf(gGroup);
        const gOp = name => {
          const op = TAX_HE.OPS.find(x => x.name === name);
          return op ? op.apply(gBase, rngFor(SEED, lang, gBase, 'g', name)).slice(0, 20) : [];
        };
        addG('sp-adj', gOp('adj'));
        addG('sp-transpose', gOp('transpose'));
        addG('sp-drop', gOp('drop'));
        addG('sp-double', gOp('double'));
        addG('mater', gOp('mater'));
        addG('homophone', gOp('homophone'));
        for (const seg of posSegs.slice(0, 3)) {
          addG('synonym', substituteWord(seg, SYNM.ok));
          addG('neg-synonym-rejected', substituteWord(seg, SYNM.bad));
          const ws = wsOf(seg);
          if (ws.length >= 2) {
            for (let k = 1; k < ws.length; k++) addG('partial-head', [ws.slice(0, k).join(' ')]);
            /* חיתוך ב"או" · **שני** הצדדים. מקרה 7 (מְשֻׁנָּן · "בעל שיניים או בעל
               צורה של שיניים" → "בעל שיניים") הוא הצד הראשון, אבל לומד שכותב את
               החלופה השנייה נותן בדיוק אותה תשובה חלקית ואין סיבה להשמיט אותה. */
            for (let i = 1; i + 1 < ws.length; i++) {
              if (ws[i] !== 'או' && ws[i] !== 'וכנ' && ws[i] !== 'אלא') continue;
              addG('partial-cut', [ws.slice(0, i).join(' '), ws.slice(i + 1).join(' ')]);
            }
            for (let i = 0; i + 1 < ws.length; i++) {
              const c = ws.slice(); const t = c[i]; c[i] = c[i + 1]; c[i + 1] = t;
              addG('word-order', [c.join(' ')]);
            }
          }
          if (ws.length <= SEG_MAX_WORDS) for (const f of FILLERS) addG('extra-word', [seg + ' ' + (ctx.norm(f) || f)]);
          if (ws.length === 1) addG('morph-pair', morphForms(ws[0]));
          addG('func-prefix', funcPrefixVariants(seg));
          addG('ktiv-haser', ktivHaserSeg(seg));
        }
        /* ⭐ שני מקטעים שלמים ברצף · מקרה H16-3 (`קוסמופוליטי רב תרבותי`).
           נמדד לפני ההוספה: **0 שורות** בקורפוס. ‏`partial-head` הוא תחילית של
           מקטע אחד ו-`extra-word` מוסיף מילת עוצמה · **צירוף שני מקטעים הוא
           מנגנון אחר לגמרי**, ואף שכבה בריצה אינה מבצעת אותו (הפסק היה `far`). */
        if (posSegs.length >= 2) {
          const cc = [];
          for (let i = 0; i < posSegs.length && i < 4; i++) {
            for (let j = 0; j < posSegs.length && j < 4; j++) {
              if (i === j) continue;
              cc.push(posSegs[i] + ' ' + posSegs[j]);
            }
          }
          addG('seg-concat', cc);
        }

        const nearSeg = [];
        for (const i of segIndex.near(gBase, 2)) {
          const s = segIndex.keys[i];
          if (s === gBase || accSegs.has(s) || BLOCK_SEG.has(s)) continue;
          let other = false;
          for (const ow of segIndex.owners[i]) if (!allowSeg.has(ow)) { other = true; break; }
          if (!other) continue;
          if (splitOf('g|' + s) !== gSplit) { dropped.crossSplit++; continue; }
          nearSeg.push(s);
        }
        const nearSegU = uniqSorted(nearSeg);
        addG('neg-other-gloss', nearSegU.slice(0, 10));

        const donors = segBySplit[gSplit];
        if (donors.length) {
          const far = [], swap = [], over = [];
          const bw = wsOf(gBase);
          for (let t = 0; t < 6; t++) {
            const s = donors[randInt(rngFor(SEED, lang, gBase, 'ng', t), donors.length)];
            if (s && !accSegs.has(s) && !BLOCK_SEG.has(s)) far.push(s);
          }
          for (let t = 0; t < 6 && bw.length >= 2; t++) {
            const donor = donors[randInt(rngFor(SEED, lang, gBase, 'sw', t), donors.length)];
            const dw = wsOf(donor);
            if (!dw.length) continue;
            const i = randInt(rngFor(SEED, lang, gBase, 'swi', t), bw.length);
            const j = randInt(rngFor(SEED, lang, gBase, 'swj', t), dw.length);
            const c = bw.slice(); c[i] = dw[j];
            const v = c.join(' ');
            if (!accSegs.has(v) && !BLOCK_SEG.has(v)) swap.push(v);
          }
          for (let t = 0; t < 8; t++) {
            const donor = donors[randInt(rngFor(SEED, lang, gBase, 'mo', t), donors.length)];
            const dw = wsOf(donor);
            if (dw.length !== 1) continue;
            for (const v of morphForms(dw[0])) if (!accSegs.has(v) && !BLOCK_SEG.has(v)) over.push(v);
          }
          addG('neg-other-gloss', uniqSorted(far).slice(0, 6));
          addG('neg-gloss-swap', uniqSorted(swap).slice(0, 8));
          addG('neg-morph-overreach', uniqSorted(over).slice(0, 8));
        }
        {
          const rw = [], hw = [];
          for (const op of TAX_HE.OPS) {
            for (const v of op.apply(gBase, rngFor(SEED, lang, gBase, 'grw', op.name)).slice(0, 24)) {
              if (!v || accSegs.has(v) || !realWordIn(LEX.he, v)) continue;
              (op.name === 'homophone' ? hw : rw).push(v);
            }
          }
          addG('neg-real-word', uniqSorted(rw).slice(0, 10));
          addG('neg-homophone-word', uniqSorted(hw).slice(0, 10));
        }
        if (!gBase.includes(' ') && gBase.length >= MIN_LEN && gBase.length <= 12) {
          const e1 = edits1(gBase, HE_ALPHABET);
          const equi = [];
          for (const k2 of nearSegU.slice(0, 3)) {
            if (k2.includes(' ') || k2.length > 12) continue;
            const e2 = edits1(k2, HE_ALPHABET);
            for (const s of e1) {
              if (!e2.has(s) || accSegs.has(s) || s === k2) continue;
              if (ctx.editDist(s, gBase) !== ctx.editDist(s, k2)) continue;
              equi.push(s);
            }
          }
          addG('neg-equidistant', uniqSorted(equi).slice(0, 12));
        }
        {
          const g = [];
          for (let t = 0; t < 3; t++) {
            const rnd = rngFor(SEED, lang, gBase, 'ggarb', t);
            let s = '';
            for (let i = 0; i < Math.max(MIN_LEN, letters(gBase)); i++) s += HE_ALPHABET[randInt(rnd, HE_ALPHABET.length)];
            g.push(s);
          }
          addG('neg-garbage', g);
        }
      }

      /* ---------- מילוי החריצים ---------- */
      const seen = { word: new Set(), gloss: new Set() };
      const realNeg = { word: 0, gloss: 0 };
      const scoreCache = new Map();

      const ctxFor = dir => dir === 'word'
        ? { cands: ownKeys, index: S.termIndex, allow: allowTerm, P: S.pWord, accSet: accKeys, lex: S.lex }
        : { cands: ownSegs, index: segIndex, allow: allowSeg, P: S.pGloss, accSet: accSegs, lex: LEX.he };

      const scoreOf = (dir, key) => {
        const ck = dir + '|' + key;
        let v = scoreCache.get(ck);
        if (!v) {
          const c = ctxFor(dir);
          v = scoreCand({ key, cands: c.cands, index: c.index, allow: c.allow, P: c.P, ctx, accSet: c.accSet, lexReal: !c.accSet.has(key) && realWordIn(c.lex, key) });
          scoreCache.set(ck, v);
        }
        return v;
      };

      const keyOf = (dir, v) => dir === 'word' ? ctx.K(v) : ctx.norm(v);

      const emit = (dir, cls, typedRaw, recipe, group, split) => {
        const typed = String(typedRaw);
        const key = keyOf(dir, typed);
        if (!key || seen[dir].has(key)) return false;
        if (BLOCK_TYPED.has(key) || (dir === 'word' && BLOCK_TERM.has(key)) || (dir === 'gloss' && BLOCK_SEG.has(key))) {
          dropped.blockedStrings++; return false;
        }
        if (cls === 'neg-garbage' && realNeg[dir] >= GARBAGE_FLOOR) return false;

        /* ⚠ שני מסלולים, ובכוונה. הניקוד רץ על ~1.7 מיליון מועמדים ולכן משתמש
           במראה המהירה (חברות ב-acceptedKeys/acceptedSegs) — קירוב-דגימה, וזה
           מותר. אבל השדה שנרשם לקובץ חייב להיות ה**אמת**, ולכן כל שורה שנפלטת
           נבדקת מול הפונקציה האמיתית של האפליקציה.
           מה שנמדד: המראה היא **חסם תחתון** · `meaningMatch` מקבלת גם קילוף
           תחילית (התקשר ~ להתקשר) וגם `particleMatch`, ואלה אינם חברות במקטע.
           הכיוון הזה בטוח לדגימה (לכל היותר נכנסת שורה שכבר מתקבלת, והיא מסומנת
           ככזאת); הכיוון ההפוך היה שקר, ולכן הוא **שער** ולא מספר. */
        const mirror = scoreOf(dir, key);
        const realToday = dir === 'word' ? acceptsToday(ctx, typed, card) : glossToday(ctx, typed, card);
        verify.checked++;
        if (realToday !== mirror.today) {
          if (mirror.today) { verify.falsePos++; if (verify.fpExamples.length < 8) verify.fpExamples.push({ id: 'pending', dir, typed }); }
          else { verify.falseNeg++; if (verify.examples.length < 8) verify.examples.push({ dir, typed, card: String(card.term) }); }
        }
        const sc = realToday === mirror.today ? mirror
          : Object.assign({}, mirror, { today: realToday, edge: false, edgeStrict: false, edgeWhy: '' });

        seen[dir].add(key);
        const n = ++seq[lang][dir];
        const id = `${lang}-${dir === 'word' ? 'w' : 'g'}-${String(n).padStart(6, '0')}`;
        const rowSplit = o.brokenSplit ? ['train', 'val', 'holdout'][rowNo % 3] : split;
        rowNo++;
        rows[lang].push({
          id, lang, direction: dir,
          card_term: card.term, card_gloss: card.meaning,
          typed, source_class: cls, seed: recipe, split: rowSplit, group,
        });
        dxRows[lang].push({ id, class: cls, ...sc });
        bump(counts.class, cls); bump(counts.langDir, lang + '/' + dir);
        bump(counts.classLangDir, cls + '|' + lang + '|' + dir);
        if (sc.edge) bump(counts.classEdge, cls);
        if (sc.today) bump(counts.classToday, cls);
        bump(counts.split, rowSplit); bump(counts.splitClass, rowSplit + '|' + (isNeg(cls) ? 'neg' : 'pos'));
        bump(counts.edge, String(sc.edge)); bump(counts.edgeStrict, String(sc.edgeStrict));
        bump(counts.today, String(sc.today));
        if (sc.edgeWhy) bump(counts.edgeWhy, sc.edgeWhy);
        if (isNeg(cls) && cls !== 'neg-garbage') realNeg[dir]++;
        return true;
      };

      /* בורר החריץ · ⭐ כאן נופלת הדגימה בגבול. */
      const fillSlots = (dir, queue, budget, pool, tag, group, split) => {
        let filled = 0;
        for (let i = 0; i < queue.length && filled < budget; i++) {
          const cls = rotate(queue, tag + '|' + dir, i);
          const list = pool[cls];
          if (!list || !list.length) continue;
          const uniq = uniqSorted(list).slice(0, EDGE_SCAN);
          const avail = uniq.filter(v => { const k = keyOf(dir, v); return k && !seen[dir].has(k); });
          if (!avail.length) continue;
          let chosen = null;
          if (rngFor(SEED, lang, tag, dir, cls, i)() < EDGE_SHARE) {
            let bestScore = -Infinity;
            for (const v of avail) {
              const sc = scoreOf(dir, keyOf(dir, v));
              const s = (sc.edge ? 100 : 0) - (sc.margin == null ? 50 : Math.abs(sc.margin));
              if (s > bestScore) { bestScore = s; chosen = v; }
            }
          }
          if (!chosen) chosen = avail[randInt(rngFor(SEED, lang, tag, dir, cls, i, 'pick'), avail.length)];
          if (emit(dir, cls, chosen, `${SEED}|${lang}|${dir}|${tag}|${cls}|${i}`, group, split)) filled++;
        }
        return filled;
      };

      fillSlots('word', Q.wordNeg[lang], SLOTS.wordNeg, candW, termKey, wGroup, wSplit);
      fillSlots('word', Q.wordPos[lang], SLOTS.wordPos, candW, termKey, wGroup, wSplit);
      if (gBase) {
        fillSlots('gloss', Q.glossNeg, SLOTS.glossNeg, candG, gBase, gGroup, gSplit);
        fillSlots('gloss', Q.glossPos, SLOTS.glossPos, candG, gBase, gGroup, gSplit);
      }
    }
    say(`[${lang}] ${rows[lang].length} שורות · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
  }

  /* ===== שערי דליפה · נבדקים, לא מוצהרים ===== */
  const groupSplit = new Map();
  const leaks = [];
  for (const L of ['he', 'en']) for (const r of rows[L]) {
    const p = groupSplit.get(r.group);
    if (p === undefined) groupSplit.set(r.group, r.split);
    else if (p !== r.split) leaks.push(`${r.group}: ${p} ≠ ${r.split}`);
  }
  if (leaks.length) throw new Error(`gen_answers: ${leaks.length} קבוצות יושבות בשני splits · ` + leaks.slice(0, 3).join(' | '));

  const caseLeak = [];
  for (const L of ['he', 'en']) for (const r of rows[L]) {
    const ctx = CTX[L];
    if (CASE_TERM_RAW.has(String(r.card_term))) caseLeak.push(`${r.id} · כרטיס ${r.card_term}`);
    const k = r.direction === 'word' ? ctx.K(r.typed) : ctx.norm(r.typed);
    if (r.direction === 'word' && CASE_TERM.has(k)) caseLeak.push(`${r.id} · מפתח ${k}`);
    if (r.direction === 'gloss' && CASE_SEG.has(k)) caseLeak.push(`${r.id} · מקטע ${k}`);
    if (caseLeak.length > 40) break;
  }
  if (caseLeak.length) throw new Error(`gen_answers: דליפה של 24 המקרים · ${caseLeak.length}+ · ` + caseLeak.slice(0, 3).join(' | '));

  /* ===== 24 המקרים · קובץ נפרד, split חיצוני ===== */
  const caseRows = resolved.map(({ c, card }) => ({
    id: `case-${String(c.n).padStart(2, '0')}`,
    lang: 'he', direction: 'gloss',
    card_term: card.w.term, card_gloss: card.w.meaning,
    typed: c.typed, source_class: 'case24/' + c.cat,
    seed: `${SEED}|case|${c.n}`, split: 'external', group: 'case|' + c.n,
  }));

  /* ===== כתיבה ===== */
  const files = [];
  const write = (name, list) => {
    const text = list.map(r => JSON.stringify(r)).join('\n') + (list.length ? '\n' : '');
    fs.writeFileSync(path.join(outDir, name), text, 'utf8');
    files.push({
      name, rows: list.length, bytes: Buffer.byteLength(text, 'utf8'),
      sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    });
  };
  write('answers-he.jsonl', rows.he);
  write('answers-en.jsonl', rows.en);
  write('answers-dx-he.jsonl', dxRows.he);
  write('answers-dx-en.jsonl', dxRows.en);
  write('answers-cases24.jsonl', caseRows);

  const total = rows.he.length + rows.en.length;
  const negTotal = Object.keys(counts.class).filter(isNeg).reduce((n, k) => n + counts.class[k], 0);
  const edgeTotal = counts.edge['true'] || 0;
  const edgeStrictTotal = counts.edgeStrict['true'] || 0;
  const hardNeg = Object.keys(counts.class).filter(k => isNeg(k) && k !== 'neg-garbage').reduce((n, k) => n + counts.class[k], 0);
  const emptyClasses = Object.keys(counts.class).filter(k => !counts.class[k]).sort();

  const manifest = {
    seed: SEED,
    splitSalt: SPLIT_SALT,
    splitRates: { train: SPLIT_TRAIN, val: Number((SPLIT_VAL - SPLIT_TRAIN).toFixed(2)), holdout: Number((1 - SPLIT_VAL).toFixed(2)) },
    budgets: { SLOTS, EDGE_W, EDGE_SHARE, EDGE_SCAN, MIN_LEN, MAX_D, GARBAGE_FLOOR, NIQQUD_EVERY, SEG_MAX_WORDS, SEG_MAX_LETTERS },
    /* הפרמטרים שמולם נמדדה רצועת הגבול · אם הם ישתנו, הרצועה משתנה, וזה חייב להיראות. */
    againstParams: { fp: heCtx.TYPO_PARAMS.fp, ver: heCtx.TYPO_PARAMS.ver },
    lexicon: LEX.stats,
    synonyms: {
      approved: SYN.groups.filter(g => g.status === 'approved').length,
      rejected: SYN.groups.filter(g => g.status !== 'approved').length,
    },
    external: { cases: caseRows.length, blockedTermKeys: CASE_TERM.size, blockedSegs: CASE_SEG.size, blockedTyped: BLOCK_TYPED.size },
    total,
    negatives: negTotal,
    negativeShare: total ? Number((negTotal / total).toFixed(4)) : 0,
    hardNegatives: hardNeg,
    hardNegativeShare: total ? Number((hardNeg / total).toFixed(4)) : 0,
    boundary: edgeTotal,
    boundaryShare: total ? Number((edgeTotal / total).toFixed(4)) : 0,
    boundaryStrict: edgeStrictTotal,
    boundaryStrictShare: total ? Number((edgeStrictTotal / total).toFixed(4)) : 0,
    acceptedTodayRows: counts.today['true'] || 0,
    emptyClasses,
    dropped,
    mirrorCheck: verify,
    leakChecks: { groupsInTwoSplits: leaks.length, case24Leaks: caseLeak.length, groups: groupSplit.size },
    counts: {
      class: sortObj(counts.class), langDir: sortObj(counts.langDir), split: sortObj(counts.split),
      splitClass: sortObj(counts.splitClass), edge: sortObj(counts.edge),
      edgeStrict: sortObj(counts.edgeStrict), edgeWhy: sortObj(counts.edgeWhy),
      classLangDir: sortObj(counts.classLangDir),
      classEdge: sortObj(counts.classEdge), classToday: sortObj(counts.classToday),
    },
    files,
    elapsedSec: Number(((Date.now() - t00) / 1000).toFixed(1)),
  };
  fs.writeFileSync(path.join(outDir, 'answers-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'answers-report.md'), report(manifest), 'utf8');
  return manifest;
}

/* meaningMatch בלי שכבת הסובלנות · אותו נימוק בדיוק של acceptsToday ב-lib/keys.js. */
function glossToday(ctx, typed, card) {
  const P = ctx.TYPO_PARAMS;
  const was = P ? P.enabled : undefined;
  if (P) P.enabled = false;
  try { return !!ctx.meaningMatch(typed, card && card.meaning); }
  finally { if (P) P.enabled = was; }
}

function sortObj(bag) {
  const out = {};
  for (const k of Object.keys(bag).sort()) out[k] = bag[k];
  return out;
}

/* ===== הדוח ===== */
function report(m) {
  const L = [];
  const n = x => Number(x || 0).toLocaleString('en-US');
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
  L.push('# קורפוס התשובות · `answers-*.jsonl`', '');
  L.push(`נוצר מ-\`node typo-lab/gen_answers.js\` · זרע \`${m.seed}\` · ${n(m.total)} שורות · ${m.elapsedSec} שניות.`);
  L.push(`רצועת הגבול נמדדה מול הפרמטרים שנשלחים בפועל · \`fp=${m.againstParams.fp}\`.`, '');
  L.push('| | |', '|---|---|');
  L.push(`| שורות | **${n(m.total)}** |`);
  L.push(`| ⛔ שליליות | **${n(m.negatives)}** · ${pct(m.negatives, m.total)} |`);
  L.push(`| ⛔ מהן **קשות** (בלי זבל) | **${n(m.hardNegatives)}** · ${pct(m.hardNegatives, m.total)} |`);
  L.push(`| ⭐ ברצועת הגבול (רחבה · E1-E5) | **${n(m.boundary)}** · ${pct(m.boundary, m.total)} |`);
  L.push(`| ⭐ בגרעין הגבול (צרה · E1/E3 בלבד) | **${n(m.boundaryStrict)}** · ${pct(m.boundaryStrict, m.total)} |`);
  L.push(`| מתקבלות כבר היום | ${n(m.acceptedTodayRows)} · ${pct(m.acceptedTodayRows, m.total)} |`);
  L.push(`| ‏train / val / holdout | ${n(m.counts.split.train)} / ${n(m.counts.split.val)} / ${n(m.counts.split.holdout)} |`);
  L.push(`| ‏holdout חיצוני | ${m.external.cases} מקרים · \`answers-cases24.jsonl\` |`);
  L.push('');
  L.push('## ההתפלגות · שורות לכל `source_class`, בכל שפה ובכל כיוון', '');
  L.push('| מחלקה | he/word | he/gloss | en/word | en/gloss | סה"כ | ⭐ בגבול | מתקבל היום |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  const cls = Object.keys(m.counts.class).sort((a, b) => {
    const an = a.startsWith('neg-') ? 1 : 0, bn = b.startsWith('neg-') ? 1 : 0;
    return an - bn || (a < b ? -1 : 1);
  });
  const cell = (c, l, d) => m.counts.classLangDir[`${c}|${l}|${d}`] || 0;
  for (const c of cls) {
    const tot = m.counts.class[c];
    const e = m.counts.classEdge[c] || 0, td = m.counts.classToday[c] || 0;
    L.push(`| ${c.startsWith('neg-') ? '⛔ ' : ''}\`${c}\` | ${cell(c, 'he', 'word')} | ${cell(c, 'he', 'gloss')} | ${cell(c, 'en', 'word')} | ${cell(c, 'en', 'gloss')} | **${tot}** | ${pct(e, tot)} | ${td ? pct(td, tot) : '—'} |`);
  }
  L.push(`| | | | | | **${n(m.total)}** | ${pct(m.boundary, m.total)} | ${pct(m.acceptedTodayRows, m.total)} |`, '');
  L.push('⚠ **"מתקבל היום" גבוה במחלקה = המחלקה כבר פתורה ואינה נתון אימון.** היא נשארת');
  L.push('בקורפוס כעוגן — כדי שרגרסיה עתידית תיראה — ולא כדי ללמד ממנה.', '');
  L.push('⛔ **"מתקבל היום" על מחלקה `neg-` אינו נתון סטטיסטי — הוא קבלה באפליקציה החיה.**');
  L.push('הפילוח `exact` מול `typo` על **כל** השורות השליליות רץ ב-`typo-lab/probe_accepts.js`');
  L.push('ונשמר ב-`out/probe-accepts.md`. התוצאה: 1,079 קבלות · **186 מהשכבה שלנו** ·');
  L.push('**אפס חוצות-כרטיסים**. ⚠ `source_class` הוא **מוצא ולא פסק** — שורה `neg-` היא');
  L.push('השערת-קושי, לא הכרעה שהיא שגויה. ראה שם.', '');
  if (m.emptyClasses && m.emptyClasses.length) {
    L.push(`⚠ **מחלקות שהוצהרו ולא ירו אף שורה:** ${m.emptyClasses.map(c => '`' + c + '`').join(' · ')}`, '');
  } else {
    L.push('✅ כל מחלקה שהוצהרה ירתה לפחות שורה אחת.', '');
  }
  L.push('## ⭐ רצועת הגבול · לפי מה נקבעה', '');
  L.push('| טריגר | שורות | מה זה אומר |', '|---|---:|---|');
  const why = {
    E1: 'שער המרחק · ‎|margin| ≤ 0.35‎ במשטר שחל בפועל',
    E2: 'שער המשטר · ‎gap‎ צמוד ל-`marginSoft`, ושני המשטרים חלוקים על התוצאה',
    E3: 'המרחק כבר מקבל · **רק** וטו (לקסיקון · מאגר · אורך) עוצר',
    E4: 'יושבת בדיוק על תקרת שלוש הפעולות',
    E5: 'שער הדו-משמעות · המרחק מקבל, ורק שוליים בגודל שלם אחד מכריעים',
  };
  const per = {};
  for (const k of Object.keys(m.counts.edgeWhy)) for (const t of k.split('+')) per[t] = (per[t] || 0) + m.counts.edgeWhy[k];
  for (const t of ['E1', 'E2', 'E3', 'E4', 'E5']) L.push(`| ${t} | ${n(per[t])} | ${why[t]} |`);
  L.push('', '⚠ שורה יכולה להדליק יותר מטריגר אחד · הסכום גדול מסך השורות בגבול.');
  L.push('', '⚠ **ומה שהמדד הזה במכוון אינו מודד:** המחלקות הסמנטיות — נרדפות, תשובה');
  L.push('חלקית, מילה עודפת, סדר מילים — יושבות **רחוק** מכל סף מרחק (‎dOwn‎ של 6 עד 17),');
  L.push('ולכן הן כמעט לעולם אינן "בגבול". זה נכון ולא ליקוי: מנגנון המרחק אינו יכול');
  L.push('להגיע אליהן בשום כיול, וזה בדיוק מה ש-`STATE.md` מדד (‏18 מתוך 24 המקרים).');
  L.push('הן מתוקצבות בנפרד ונמדדות בטבלת ההתפלגות, לא ברצועת הגבול.', '');
  L.push('## ⚠ מה שהקורפוס מדד על מנגנון ההכרעה עצמו', '');
  L.push('שלוש תכונות של `app.js` שהקורפוס חשף במדידה. שתיים מהן `STATE.md` מתאר אחרת.', '');
  L.push('| מה | המספר | איפה |', '|---|---:|---|');
  L.push('| **`particleMatch` אדיש לחלוטין לסדר המילים** · השוואת **שק** ולא של רצף | **1,867 / 1,867** מקטעים רב-מיליים (100%) מקבלים החלפת סדר | app.js:1806-1810 · `B.findIndex` על מה שלא נוצל |');
  L.push('| נרדפות מאושרות ופיצול "או" **שלוחים** · `TYPO_GLOSS_RULES={splitOr:true,synonyms:true}` | מחלקות `synonym` ו-`word-order` · **100% מתקבלות היום** | app.js:1819 |');
  L.push('| ⛔ `acceptsToday` **אינו** מכבה את כל השכבה שלנו · הוא מוריד `TYPO_PARAMS.enabled`, ו-`splitOr`/`synonyms` הם דגלים נפרדים | ראה `out/probe-accepts.md` | app.js:1183 מול 1771-1775 |');
  L.push('');
  L.push('התכונה הראשונה היא **החלטה שאיש לא קיבל במפורש**: כל תמורת סדר מילים בכל פירוש');
  L.push('רב-מילי במאגר מתקבלת, וזה מקור **837 מתוך 893** הקבלות ה-`exact` על שורות שליליות.');
  L.push('היא קדמה לעבודת הסובלנות ואינה רגרסיה שלה — אבל היא צריכה הכרעה, לא היסק.', '');
  L.push('## מניעת דליפה', '');
  L.push('| בדיקה | תוצאה |', '|---|---|');
  L.push(`| קבוצות בקורפוס (מפתח מונח · מקטע פירוש) | ${n(m.leakChecks.groups)} |`);
  L.push(`| קבוצה שיושבת בשני splits | **${m.leakChecks.groupsInTwoSplits}** |`);
  L.push(`| דליפה של 24 המקרים | **${m.leakChecks.case24Leaks}** |`);
  L.push(`| תורמים שנזרקו כי היו ב-split אחר | ${n(m.dropped.crossSplit)} |`);
  L.push(`| מחרוזות שנחסמו על ידי ה-holdout החיצוני | ${n(m.dropped.blockedStrings)} |`);
  L.push(`| כרטיסים שנחסמו | ${n(m.dropped.blockedCards)} |`);
  L.push('');
  L.push('## אימות מול הפונקציה האמיתית · `acceptsToday` / `meaningMatch`', '');
  L.push(`**כל** ${n(m.mirrorCheck.checked)} השורות שנפלטו נבדקו מול הפונקציה האמיתית של האפליקציה,`);
  L.push('ולא מדגם. הדגל `today` בקובץ ה-dx הוא התוצאה שלה, לא של המראה המהירה.', '');
  L.push('| כיוון הפער | מופעים | משמעות |', '|---|---:|---|');
  L.push(`| ⛔ המראה אמרה "מתקבל" והאמת לא | **${m.mirrorCheck.falsePos}** | היה מסנן שורות אמיתיות · חייב להיות אפס |`);
  L.push(`| המראה אמרה "לא מתקבל" והאמת כן | ${n(m.mirrorCheck.falseNeg)} · ${pct(m.mirrorCheck.falseNeg, m.mirrorCheck.checked)} | קילוף תחילית ו-\`particleMatch\` · הכיוון הבטוח |`);
  if (m.mirrorCheck.examples.length) {
    L.push('', 'דוגמאות לכיוון הבטוח:', '', '| כיוון | כרטיס | מוקלד |', '|---|---|---|');
    for (const e of m.mirrorCheck.examples) L.push(`| ${e.dir} | ${e.card || ''} | ${e.typed} |`);
  }
  L.push('');
  L.push('## הקבצים', '', '| קובץ | שורות | בתים | SHA-256 |', '|---|---:|---:|---|');
  for (const f of m.files) L.push(`| \`${f.name}\` | ${n(f.rows)} | ${n(f.bytes)} | \`${f.sha256}\` |`);
  L.push('');
  return L.join('\n');
}

/* ===== שיניים · כל שער עם הרצה שאמורה להיפסל ===== */
function selftest() {
  const os = require('os');
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gen-answers-'));
  const out = [];
  let all = true;
  const ok = (name, pass, note) => { all = all && pass; out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  · ' + note : ''}`); };

  const m = generate({ outDir: mk(), limitCards: 150, quiet: true });
  ok('א · הקורפוס אינו ריק', m.total > 500, `${m.total} שורות`);
  ok('ב · ⛔ שליליות הן לפחות מחצית', m.negativeShare >= 0.5, `${(m.negativeShare * 100).toFixed(1)}%`);
  ok('ג · ⭐ יש שורות בגבול', m.boundaryShare > 0.15, `${(m.boundaryShare * 100).toFixed(1)}%`);
  ok('ד · אפס קבוצות בשני splits', m.leakChecks.groupsInTwoSplits === 0);
  ok('ה · אפס דליפה של 24 המקרים', m.leakChecks.case24Leaks === 0);
  ok('ו · שלוש הרצועות מיוצגות', ['train', 'val', 'holdout'].every(s => (m.counts.split[s] || 0) > 0), JSON.stringify(m.counts.split));
  /* המראה המהירה חייבת להיות **חסם תחתון**: מותר לה לפספס קבלה (הכיוון הבטוח),
     ואסור לה להמציא אחת. הכיוון הבטוח נמדד ומדווח, ולא נבדק לאפס. */
  ok('ז · המראה היא חסם תחתון · אפס "מתקבל" מומצא', m.mirrorCheck.checked > 0 && m.mirrorCheck.falsePos === 0,
    `fp=${m.mirrorCheck.falsePos} · fn=${m.mirrorCheck.falseNeg}/${m.mirrorCheck.checked}`);

  const m2 = generate({ outDir: mk(), limitCards: 150, quiet: true });
  ok('ח · דטרמיניזם · שתי הרצות, אותו SHA', m.files.every((f, i) => f.sha256 === m2.files[i].sha256),
    m.files.map(f => f.sha256.slice(0, 8)).join(' '));

  let fired = false, msg = '';
  try { generate({ outDir: mk(), limitCards: 40, quiet: true, brokenSplit: true }); }
  catch (e) { fired = /בשני splits/.test(e.message); msg = e.message.slice(0, 60); }
  ok('ט · ⛔ שן · split ברמת השורה נתפס כדליפה', fired, msg);

  /* ‏200 ולא 0: כל 24 הכרטיסים יושבים באינדקסים 27..181 של המאגר העברי (נמדד, לא
     הונח), ולכן חלון של 200 מספיק כדי שהחסימה המבוטלת תדליק את השער — בלי להריץ
     את כל 5,663 הכרטיסים בתוך שער. */
  let fired2 = false, msg2 = '';
  try { generate({ outDir: mk(), limitCards: 200, quiet: true, brokenBlock: true }); }
  catch (e) { fired2 = /24 המקרים/.test(e.message); msg2 = e.message.slice(0, 60); }
  ok('י · ⛔ שן · ביטול החסימה מדליק את שער 24 המקרים', fired2, msg2);

  process.stdout.write(out.join('\n') + '\n');
  process.stdout.write(all ? '\n✅ כל השערים עברו\n' : '\n⛔ שער נכשל\n');
  return all;
}

module.exports = {
  generate, report, selftest, splitOf, edits1, niqqudVariants, ktivHaser, morphForms,
  synonymMaps, substituteWord, drawQueue, glossToday,
  SEED, SPLIT_SALT, POS_CLASSES, NEG_CLASSES, SLOTS, EDGE_W, EDGE_SHARE, OUT_DIR,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const lim = args.find(a => a.startsWith('--cards='));
  const outArg = args.find(a => a.startsWith('--out='));
  const m = generate({
    limitCards: lim ? Number(lim.slice(8)) : 0,
    outDir: outArg ? path.resolve(__dirname, outArg.slice(6)) : OUT_DIR,
  });
  process.stdout.write('\n');
  process.stdout.write(`סה"כ ${m.total} שורות · שליליות ${(m.negativeShare * 100).toFixed(1)}% · בגבול ${(m.boundaryShare * 100).toFixed(1)}%\n`);
  process.stdout.write(`‏train/val/holdout · ${m.counts.split.train}/${m.counts.split.val}/${m.counts.split.holdout}\n`);
  for (const f of m.files) process.stdout.write(`${f.name} · ${f.rows} שורות · ${f.sha256.slice(0, 16)}…\n`);
}
