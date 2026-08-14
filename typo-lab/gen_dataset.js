'use strict';
/* ייצור הדאטהסט המתויג · typo-lab/gen_dataset.js
 *
 * מה נבנה כאן: לכל מפתח שהאפליקציה מקבלת היום, עשרות אלפי השחתות סינתטיות, כל אחת
 * מתויגת "ראוי-לקבל" או "חובה-לדחות". התיוג הוא הלב הישר של הפרויקט: ה-GA יכוון ספים
 * לפי התוויות האלה, וכל תווית שגויה כאן הופכת לסף שגוי שם.
 *
 * שלושה כללי תיוג, בסדר הזה:
 *   1. **וטו** · המחרוזת היא מילת מאגר אחרת (או מקטע פירוש של ערך אחר). חובה-לדחות,
 *      תמיד. זו ההכרעה של חגי ואין לה סף.
 *   2. **דו-משמעות** · אותה מחרוזת נגזרת מ*ערך אחר* במאגר בתוך אותו מספר פעולות. גם
 *      אם היא אינה מילה בפני עצמה, קבלתה היא הימור בין שני ערכים · חובה-לדחות.
 *      "אותו מספר פעולות" נמדד כמרחק עריכה של app.js עצמה ולא כספירת אופרטורים, כי
 *      אופרטור אחד אינו בהכרח מרחק אחד (היפוך שכנים הוא מרחק 2).
 *   3. אחרת · ראוי-לקבל.
 *
 * ומה **לא** נכנס בכלל: מועמד שהאפליקציה כבר מקבלת היום. שורה כזו אינה נתון אימון אלא
 * ניפוח · היא "נפתרה" בכל גנום, כולל גנום אפס-סובלנות, וה-recall שהיא מייצרת אינו
 * מודד דבר. הסינון נעשה מול הפונקציה האמיתית (isCorrect / meaningMatch), לא מול חיקוי.
 *
 * שלושה סטים ולא ארבעה: he-word · en-word · gloss. צד הפירוש הוא עברית **בשני**
 * המאגרים (meaningMatch מנרמל ב-norm העברי תמיד, app.js:1259), ולכן שורות הפירוש
 * מהמאגר האנגלי משתמשות בטקסונומיה העברית · סט gloss-אנגלי היה מתאמן על טקסט שאינו קיים.
 *
 * דטרמיניזם: אין Math.random. כל בחירה נגזרת מ-rngFor(lang, key, op, i), וכל איטרציה
 * היא על מערך ממוין. שתי ריצות מפיקות קבצים זהים ביט-אחר-ביט, ו-selfcheck2 מוכיח זאת
 * מול SHA-256 ולא מצהיר עליו.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { fnv1a, rngFor, randInt } = require('./lib/rng.js');
const { acceptedKeys, acceptedSegs, acceptsToday, squash } = require('./lib/keys.js');
const { buildVeto, isVetoedTerm, isVetoedSeg } = require('./lib/veto.js');
const { inLexicon, buildLexicon } = require('./lib/lexicon.js');
const { licitForms } = require('./lib/morph.js');
const TAX_HE = require('./lib/taxonomy-he.js');
const TAX_EN = require('./lib/taxonomy-en.js');

/* ===== קבועים · שינוי כאן משנה את ה-SHA, ולכן הם חלק מהמניפסט ===== */
const SEED = 'typo-lab/dataset/v3';   // תווית גרסה במניפסט בלבד · לא נכנס לאף rngFor
const FOLD_SALT = 'typo-lab/fold/v1';       // לא משתנה · שינוי מערבב את ה-folds ושובר השוואה לגרסה הקודמת
const HOLDOUT_SALT = 'typo-lab/holdout/v1';
const FOLDS = 5;
const HOLDOUT_RATE = 0.15;

const MIN_LEN = 3;                 // אורך באותיות, בלי רווחים
const POS_PER_KEY = 7;             // תקציב מועמדים חיוביים למפתח מונח · שווה לסכום המשקלים
const POS_PER_SEG = 2;             // מקטעי פירוש · יש מהם פי שניים וחצי, ולכן תקציב קטן יותר

/* ===== תקרת מקטע לייצור חיובי (ממצא F6) =====
 * ‏58.6% משורות הפירוש העבריות נשענו על מקטע רב-מילי, ‏17% על מקטע בן חמש מילים ומעלה
 * ("מתקנ מסתובב להכנת כלי חרס"). אף לומד אינו מקליד הגדרה בת שבע מילים כתשובה, ולכן
 * ספים שכוילו על מחרוזות כאלה כוילו על התפלגות שאינה קיימת. התקרה מפילה אותן. */
const SEG_MAX_WORDS = 3;
const SEG_MAX_LETTERS = 20;

/* ===== תקציב שליליים · חלוקה למשפחות במקום מונה יחיד (ממצא F6) =====
 * לפני: מונה אחד של 4, וזבל מילא כל שארית · 12,487 שורות זבל מול 1,780 בני-זוג
 * מרחק-1. זבל נדחה בכל גנום, כולל גנום אפס-סובלנות, ולכן הוא אינו מודד דבר; בן-הזוג
 * מרחק-1 הוא המשפחה **היחידה** שבודקת בדיוק את מה שהווטו קיים בשבילו.
 * אחרי: תקרה למשפחה, וזבל הוא **רצפה ולא מלאי** · הוא נורה רק לכרטיס שנשארו לו פחות
 * משני שליליים אחרי כל השאר. */
const NEG_PER_CARD = 5;
const NEG_GLOSS_PER_CARD = 3;
const NEG_CAP = { 'd1-partner': 2, 'other-variant': 2, inflection: 1, garbage: 1 };
const NEG_GLOSS_CAP = { 'other-gloss-seg': 2, garbage: 1 };
const GARBAGE_FLOOR = 2;           // מתחת לזה בלבד נפתח חריץ הזבל

const MAX_D = 2;                   // הרדיוס שאינדקס השכנים מכסה

const HE_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשת';
const EN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/* ===== מחלקות נושאות-משמעות (ממצא F1) =====
 * החלפה שהיא הומופון על אחד הזוגות האלה, או הוספת אם קריאה, אינה "אותה מילה בכתיב
 * אחר" · היא יכולה להיות מילה אחרת לגמרי (חכירה↔חקירה, אמד↔עמד, חמה↔חממה). כשהלקסיקון
 * אינו יודע להכריע והמפתח קצר, השורה נשארת accept אבל מסומנת novel-unverified
 * ו-trusted:false, וה-GA אמור להוציא אותה ממונה ה-recall במקום להתאמן על ניחוש. */
const MEANING_PAIRS = [['א', 'ע'], ['כ', 'ק'], ['ס', 'ש'], ['ת', 'ט']];
const UNVERIFIED_MAX_LETTERS = 6;

const OUT_DIR = path.join(__dirname, 'out');

/* ===== אינדקס שכנים · מחיקות בסגנון SymSpell =====
 * הבעיה: לכל מועמד צריך לדעת אם יש *מפתח אחר* במאגר במרחק קטן-או-שווה. השוואה מול כל
 * המפתחות היא ‎~100k מועמדים כפול ‎~10k מפתחות · מיליארד השוואות, כלומר דקות.
 * הפתרון: שתי מחרוזות במרחק ≤ d חולקות מחרוזת אחת לפחות בסביבת-המחיקות בעומק d שלהן.
 * לכן מאנדקסים את כל תוצאות המחיקה של כל מפתח, ושואלים באותה סביבה · חיפוש ‎O(L²)‎
 * במפות במקום סריקה. התוצאה היא מועמדים בלבד, וכל אחד מאומת ב-editDist האמיתית של
 * app.js · האינדקס מזרז, לא מכריע.
 */
function deletions(s, d) {
  const all = new Set([s]);
  let cur = [s];
  for (let step = 0; step < d; step++) {
    const nxt = [];
    for (const x of cur) {
      for (let i = 0; i < x.length; i++) {
        const y = x.slice(0, i) + x.slice(i + 1);
        if (!all.has(y)) { all.add(y); nxt.push(y); }
      }
    }
    cur = nxt;
  }
  return all;
}

/* מקטע פירוש ארוך במיוחד מקבל עומק 1 בלבד: סביבת-המחיקות גדלה כריבוע האורך, ומחרוזת
   בת 60 תווים הייתה תורמת אלפי ערכים לאינדקס עבור סיכון דו-משמעות שאינו קיים · שני
   שינויים במשפט בן שישים תווים אינם הופכים אותו לפירוש של ערך אחר. */
const LONG = 45;

function buildIndex(ownerMap) {
  const keys = Array.from(ownerMap.keys());
  const owners = keys.map(k => ownerMap.get(k));
  const del = new Map();
  for (let i = 0; i < keys.length; i++) {
    for (const v of deletions(keys[i], keys[i].length > LONG ? 1 : MAX_D)) {
      let a = del.get(v);
      if (!a) { a = []; del.set(v, a); }
      a.push(i);
    }
  }
  function near(s, d) {
    const dd = Math.min(d, MAX_D);
    if (dd <= 0) return [];
    const seen = new Set();
    const out = [];
    for (const v of deletions(s, s.length > LONG ? 1 : dd)) {
      const a = del.get(v);
      if (!a) continue;
      for (const i of a) if (!seen.has(i)) { seen.add(i); out.push(i); }
    }
    return out;
  }
  return { keys, owners, near, size: keys.length, entries: del.size };
}

/* ===== תיוג ===== */

/* מחזירה את המפתח המתנגש, או null. ownerAllow הוא קבוצת הבעלים שאינם "ערך אחר":
   הכרטיס עצמו, ובכיוון הפירוש גם נרדפות שחולקות איתו פירוש (בדיוק פטור-הנרדפות של
   isVetoedSeg · בלעדיו כל מקטע משותף ל-401 הערכים האנגליים היה יוצא דו-משמעי).
 *
 * ===== נקודת הייחוס · ממצא F7 =====
 * הגרסה הראשונה מדדה את המרחק מ**מפתח המקור היחיד** שהווריאציה נגזרה ממנו. הריצה
 * אינה עושה זאת: היא מודדת מרחק מ**הצורה הקבילה הקרובה ביותר** של הכרטיס, כי
 * acceptedKeys כולל heForms, חלופות וצורות-הדבקה, וכולן מתקבלות. הפער הזה תייג
 * דו-משמעיות שאינה קיימת · "איוחוי" רחוק עריכה אחת מ-"איחוי" (צורה קבילה של הכרטיס
 * עצמו) ושתיים מ-"אילחוש", כלומר חד-משמעי לחלוטין לפי המדד של הריצה · אבל הוא נגזר
 * מ-"איחווי" ולכן נמדד כרחוק 2 ויצא ambiguous.
 * המחיר שנמדד: ‏309 שורות היו האילוץ הכובל של ה-GA, ‏306 מהן היפוכי-שכנים בדיוק
 * בצורה הזו, והן דחפו את חוק המילה העברית ל-vetoMargin 2 ול-recall של 64.76%.
 * כאן המדידה היא מינימום מעל כל הצורות הקבילות · אותו מדד בדיוק שהריצה תשתמש בו,
 * וכך התוויות והסמנטיקה מסכימות במקום להתווכח.
 *
 * ===== F7b · אותה סמנטיקה גם על **המחרוזת המתנגשת**, ולא רק על נקודת הייחוס =====
 * ‏F7 תיקן את צד אחד של ההשוואה (מאיפה מודדים) והשאיר את הצד השני שבור: הלולאה החזירה
 * כל מפתח באינדקס שיש לו בעלים זר · **גם כשהמפתח עצמו הוא צורה קבילה של הכרטיס**.
 * מקטע פירוש חי בבעלות משותפת: "איחוד" מפרש גם את אִיחוּי וגם ערכים אחרים, "ללא ספק"
 * מפרש גם את בַּעֲלִיל וגם אחרים. לכן "יחוד" (מרחק 1 מ-"איחוד" שהכרטיס מחזיק, ומרחק 2+
 * מכל ערך אחר) יצא ‎ambiguous:איחוד · השורה הוכרזה דו-משמעית מול עצמה.
 * המדידה: ‏1,467 מתוך 8,413 שורות ‎ambiguous‎ בסט gloss, ועוד 7 בסט he-word.
 * ‏ownSet חוסם בדיוק את זה: מחרוזת שהכרטיס מחזיק אינה "ערך אחר" ולא משנה מי עוד מחזיק
 * בה · הבעלים הזר שלה מטופל בווטו (isVetoedSeg/isVetoedTerm) עם פטור-הכרטיס הנכון,
 * ולא כאן. כך "מינימום מעל הצורות הקבילות" מול "מינימום מעל מקטעים של ערכים אחרים",
 * שני הצדדים באותה סמנטיקה.
 */
function minDist(typed, ownKeys, ctx) {
  let best = Infinity;
  for (const k of ownKeys) {
    const d = ctx.editDist(k, typed);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/* ownSet · קבוצת הצורות הקבילות של הכרטיס עצמו (accKeys בכיוון המונח, accSegs בכיוון
   הפירוש). null משחזר את ההתנהגות שלפני F7b · ל-legacyRef בלבד, לצורך כימות. */
function collide(typed, ownKeys, ownerAllow, index, ctx, ownSet) {
  const d = minDist(typed, ownKeys, ctx);
  if (d <= 0 || !isFinite(d)) return null;
  for (const i of index.near(typed, d)) {
    const k = index.keys[i];
    if (ownSet && ownSet.has(k)) continue;                    // צורה של הכרטיס עצמו · לא "ערך אחר"
    if (ctx.editDist(k, typed) > d) continue;                 // רק ערך שקרוב לפחות כמו הכרטיס
    for (const o of index.owners[i]) if (!ownerAllow.has(o)) return k;
  }
  return null;
}

/* ===== שורות ===== */
const foldOf = groupKey => fnv1a(groupKey + FOLD_SALT) % FOLDS;
const holdoutOf = groupKey => (fnv1a(groupKey + HOLDOUT_SALT) % 100000) / 100000 < HOLDOUT_RATE;

/* סדר המפתחות בשורה קבוע · JSON.stringify שומר על סדר ההכנסה, וזה מה שהופך את הקובץ
   לניתן להשוואה ביט-אחר-ביט בין ריצות.
   ‏trusted · האם התווית ניתנת לאימות. false רק ל-novel-unverified: accept שהלקסיקון
   לא אישר ולא הפריך, על מפתח קצר ובמחלקה שיכולה לשנות משמעות. */
function makeRow(o) {
  return {
    set: o.set, lang: o.lang, dir: o.dir, unit: o.unit,
    term: o.term, key: o.key, typed: o.typed, op: o.op,
    label: o.label, why: o.why, trusted: o.trusted !== false,
    fold: o.fold, holdout: o.holdout
  };
}

const letters = s => String(s).replace(/ /g, '').length;
const wordsOf = s => String(s).split(' ').filter(Boolean).length;

/* מקטע שראוי לשמש בסיס לייצור חיובי · קצר מספיק שמישהו באמת יקליד אותו. */
const segOkForPositives = s => wordsOf(s) <= SEG_MAX_WORDS && letters(s) <= SEG_MAX_LETTERS;

/* האם ההבדל בין המפתח למוקלד הוא מחלקה נושאת-משמעות (הומופון מהזוגות, או אם קריאה
   שנוספה). נגזר מהמחרוזות עצמן ולא משם האופרטור · אופרטורים שונים מייצרים את אותה
   צורה, והשאלה היא מה ההבדל בפועל. */
function meaningBearingHe(key, typed) {
  const a = String(key), b = String(typed);
  if (a.length === b.length) {
    let at = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (at >= 0) return false;
      at = i;
    }
    if (at < 0) return false;
    for (const [x, y] of MEANING_PAIRS) {
      if ((a[at] === x && b[at] === y) || (a[at] === y && b[at] === x)) return true;
    }
    return false;
  }
  if (b.length === a.length + 1) {
    for (let i = 0; i < b.length; i++) {
      if (b[i] !== 'ו' && b[i] !== 'י') continue;
      if (b.slice(0, i) + b.slice(i + 1) === a) return true;
    }
  }
  return false;
}

/* צורות שנוצרו **רק** מהדבקת רווחים · acceptedKeys מוסיפה squash(alt) לצד alt עצמו
   (app.js:786, "ביתספר" מול "בית ספר"). המפתחות הטבעיים נבנים כאן מחדש באותו סדר
   שכבות, וכל מה שב-acceptedKeys ואינו בהם הוא בהכרח צורת-הדבקה. */
function squashOnlyKeys(card, ctx, accKeys) {
  const he = ctx.LANG !== 'en';
  const natural = new Set();
  const add = k => { if (k) natural.add(k); };
  add(ctx.K(card.term));
  if (he) for (const v of Array.from(ctx.heForms(card.term))) add(ctx.K(v));
  for (const part of String(card.term).split(/[\/|,]|\s-\s/)) {
    const forms = he ? Array.from(ctx.heForms(part)) : [part];
    for (const f of forms) add(ctx.K(f));
  }
  const out = new Set();
  for (const k of Array.from(accKeys)) if (!natural.has(k)) out.add(k);
  return out;
}

/* ===== הווטו השני · הלקסיקון (ממצא F1) =====
 * מחזירה 'real-word' אם המוקלד הוא מילה אמיתית שאינה צורה מקובלת של הכרטיס;
 * 'novel-unverified' אם הלקסיקון אינו יודע והמחלקה עלולה לשנות משמעות; אחרת null.
 */
function lexVerdict(typed, srcKey, strLang, acceptedSet) {
  if (acceptedSet.has(typed)) return null;
  if (inLexicon(typed, strLang, srcKey)) return 'real-word';
  if (strLang !== 'en' && letters(srcKey) <= UNVERIFIED_MAX_LETTERS && meaningBearingHe(srcKey, typed)) {
    return 'novel-unverified';
  }
  return null;
}

/* ===== המחולל =====
 * opts:
 *   outDir        · לאן נכתב
 *   limitCards    · עצירה אחרי N כרטיסים לשפה (לשערים בלבד · השיניים של selfcheck2)
 *   brokenOp      · שתילת אופרטור זהות + ביטול השומר typed!==key
 *   brokenFold    · fold לפי מספר השורה במקום לפי המילה (שתילת דליפה)
 *   quiet         · בלי פלט התקדמות
 *   legacyRef     · מדידת דו-משמעות מהמפתח היחיד ולא מכל הצורות הקבילות · לא לייצור,
 *                   רק כדי לכמת את השפעת ממצא F7 מול אותה ריצה בדיוק
 */
function generate(opts) {
  const o = opts || {};
  const outDir = o.outDir || OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const say = s => { if (!o.quiet) process.stdout.write(s + '\n'); };

  const files = [];
  const counts = { set: {}, label: {}, op: {}, why: {}, setLabel: {}, trusted: {} };
  const bump = (bag, k) => { bag[k] = (bag[k] || 0) + 1; };

  let rowIndex = 0;

  /* ===== אינדקס פירושים **משותף לשני המאגרים** (השלמה לממצא F3) =====
   * הסט gloss הוא סט אחד לפי התוכנית, כי צד הפירוש עברי בשני המאגרים. אבל האינדקס
   * נבנה עד כה לכל שפה בנפרד, ולכן אותו מקטע קיבל תוויות סותרות: "כעס"→"כיעס" יצא
   * accept מהלולאה העברית (אין שם "כועס" כמקטע) ו-reject מהאנגלית (שם יש). זו אינה
   * מחלוקת אמיתית · זו שאלה שנשאלה על שני עולמות ונרשמה כתשובה אחת.
   * האיחוד מכריע לחומרה: מקטע דו-משמעי באחד המאגרים הוא דו-משמעי בסט. וזה גם הנכון
   * מבחינת המוצר · ה-GA מפיק **פרמטרים משותפים** לשני המאגרים, ולכן הם חייבים להיות
   * בטוחים בשניהם בו-זמנית.
   * הבעלים מקבל תחילית שפה כדי ששני ערכים שונים באותו שם לא ייחשבו לאותו בעלים. */
  const glossOwners = new Map();
  for (const L of ['he', 'en']) {
    const c = getCtx(L);
    for (const w of Array.from(c.BANK)) {
      const owner = L + ':' + c.K(w.term);
      for (const s of Array.from(c.meaningSegs(w.meaning))) {
        if (!s) continue;
        let set = glossOwners.get(s);
        if (!set) { set = new Set(); glossOwners.set(s, set); }
        set.add(owner);
      }
    }
  }
  const segIndex = buildIndex(glossOwners);
  const allSegs = segIndex.keys.filter(s => letters(s) >= MIN_LEN && segOkForPositives(s));

  /* וטו-פירוש על האינדקס המאוחד · שיקוף של isVetoedSeg, עם בעלים ממורחבי-שפה. */
  const isVetoedSegAll = (typedSeg, accSegs, allowOwners) => {
    if (!typedSeg) return false;
    const owners = glossOwners.get(typedSeg);
    if (!owners || !owners.size) return false;
    if (accSegs.has(typedSeg)) return false;
    for (const o of owners) if (!allowOwners.has(o)) return true;
    return false;
  };

  /* כל השורות נאספות לפני הכתיבה · מעבר עקביות אחרון חייב לראות את שתי השפות יחד. */
  const byLang = {};
  let flips = 0;

  for (const lang of ['he', 'en']) {
    const t0 = Date.now();
    const ctx = getCtx(lang);
    const veto = buildVeto(ctx, lang);
    const wordTax = lang === 'he' ? TAX_HE.OPS : TAX_EN.OPS;
    const glossTax = TAX_HE.OPS;                       // צד הפירוש עברי בשני המאגרים
    const alphabet = lang === 'he' ? HE_ALPHABET : EN_ALPHABET;
    const wordSet = lang === 'he' ? 'he-word' : 'en-word';

    /* אופרטור זהות שתול · מייצר typed === key, כלומר "השחתה" שאינה משחיתה. יחד איתו
       מנוטרלים שני השומרים שחוסמים אותו (typed!==key והסינון מול מה שמתקבל היום), אחרת
       השורה השתולה לא הייתה נכתבת כלל ולא היה מה לתפוס. selfcheck2 חייב לתפוס אותה;
       אם לא · בדיקת typed!==key שלו היא קישוט. */
    const IDENT = { name: 'ident', class: 'broken', weight: 1, apply: k => [k], why: () => 'ident' };
    const ops = o.brokenOp ? [IDENT] : wordTax;
    const gops = o.brokenOp ? [IDENT] : glossTax;

    /* תור round-robin לפי משקלים · אותו אופרטור מופיע weight פעמים, והסכום הוא התקציב. */
    const draw = list => { const q = []; for (const op of list) for (let i = 0; i < op.weight; i++) q.push(op); return q; };
    const wordQueue = draw(ops);
    const glossQueue = draw(gops);
    /* סיבוב נקודת הפתיחה בתור לפי המפתח עצמו. בלי זה, תקציב שקטן מאורך התור נבלע כולו
       בראש התור: מקטע פירוש מקבל שני חריצים בלבד, ושניהם היו נופלים על adj · כלומר סט
       gloss שלם שאין בו אף היפוך, אף השמטה ואף אם-קריאה, וספים שכוילו על סוג טעות אחד. */
    const rotate = (queue, key, i) => queue[(fnv1a(key + '|rot') + i) % queue.length];

    const bank = Array.from(ctx.BANK);
    const cards = o.limitCards ? bank.slice(0, o.limitCards) : bank;

    const termIndex = buildIndex(veto.termKeys);
    say(`[${lang}] ${cards.length} כרטיסים · אינדקס מונחים ${termIndex.size} מפתחות/${termIndex.entries} ערכים · אינדקס פירושים משותף ${segIndex.size}/${segIndex.entries}`);

    const rows = [];
    const push = r => {
      const row = makeRow(r);
      if (o.brokenFold) row.fold = fnv1a(String(rowIndex) + FOLD_SALT) % FOLDS;
      rowIndex++;
      rows.push(row);
    };

    for (const card of cards) {
      const termKey = ctx.K(card.term);
      if (!termKey) continue;
      const fold = foldOf(termKey);
      const holdout = holdoutOf(termKey);
      const unit = card.unit == null ? '' : String(card.unit);
      const alts = Array.from(ctx.glossAlts(card));
      const accepts = typed => ctx.isCorrect(typed, card.term) || alts.some(t => ctx.isCorrect(typed, t));
      const acceptsGloss = typed => ctx.meaningMatch(typed, card.meaning);

      const accKeys = acceptedKeys(card, ctx);
      const accSegs = acceptedSegs(card, ctx);
      /* נקודות הייחוס למדידת דו-משמעות (ממצא F7) · כל הצורות שהריצה מקבלת לכרטיס הזה,
         ולא רק המפתח שהווריאציה במקרה נגזרה ממנו. */
      const ownWordKeys = Array.from(accKeys).filter(Boolean);
      const ownGlossKeys = Array.from(accSegs).filter(Boolean);

      /* ===== קבוצת הבעלים המותרים (ממצא F3) =====
       * ‏ownerAllow היה ‎new Set([termKey])‎ · קבוצה בת איבר אחד. כרטיס מורכב
       * (נֶקֶב / נַקְבּוּבִית, "saw, see") מקבל היום גם את החלקים שלו, ואם לחלק כזה יש
       * כרטיס משלו במאגר · הבעלים שלו אינו termKey, ולכן collide הכריז "דו-משמעי" על
       * מחרוזת שהכרטיס עצמו מקבל. התוצאה הייתה 69 שלשות ‎(set,key,typed)‎ זהות ביט
       * אחר ביט שנשאו גם accept וגם reject · 103 שורות שסותרות זו את זו.
       * ‏acceptedKeys היא בדיוק הקבוצה ש-isVetoedTerm כבר משתמשת בה, וכך שתי השכבות
       * מסכימות במקום להתווכח. */
      const allowTerm = new Set(accKeys);
      /* בעלי-פירוש מותרים · הכרטיס עצמו וכל נרדפת שחולקת איתו פירוש, בשתי השפות: מקטע
         משותף בין "anger" ל-"חֵמָה" אינו התנגשות אלא אותו פירוש בשני מאגרים. */
      const allowSeg = new Set();
      for (const k of Array.from(accKeys)) { allowSeg.add('he:' + k); allowSeg.add('en:' + k); }
      for (const t of alts) { const k = ctx.K(t); allowSeg.add('he:' + k); allowSeg.add('en:' + k); }

      const seen = new Set();

      /* ---- חיוביים · כיוון המונח ---- */
      /* צורות-הדבקה נזרקות (ממצא F6): squash של מונח רב-מילי מייצר "היכבירבמילימ" ·
         מחרוזת שהאפליקציה מקבלת מטעמי סלחנות, אבל איש אינו **מקליד** אותה, ולכן היא
         אינה בסיס לגיטימי לייצור טעויות. ‏5,565 שורות he-word נשענו עליה. */
      const squashOnly = squashOnlyKeys(card, ctx, accKeys);
      const keys = Array.from(accKeys)
        .filter(k => letters(k) >= MIN_LEN)
        .filter(k => !squashOnly.has(k))
        .sort();
      for (const key of keys) {
        for (let i = 0; i < wordQueue.length && i < POS_PER_KEY; i++) {
          const op = rotate(wordQueue, key, i);
          const variants = op.apply(key, rngFor(lang, key, op.name, i));
          for (const typed of variants) {
            if (!typed) continue;
            if (typed === key && !o.brokenOp) continue;
            if (seen.has(typed)) continue;
            if (!o.brokenOp && accepts(typed)) { seen.add(typed); continue; }   // כבר מתקבל היום · אינו נתון אימון
            seen.add(typed);
            let label = 'accept', why = 'novel', trusted = true;
            if (isVetoedTerm(typed, card, veto, ctx)) { label = 'reject'; why = 'veto'; }
            else {
              const hit = collide(typed, o.legacyRef ? [key] : ownWordKeys, allowTerm, termIndex, ctx, o.legacyRef ? null : accKeys);
              if (hit) { label = 'reject'; why = 'ambiguous:' + hit; }
              else {
                const v = lexVerdict(typed, key, lang, accKeys);
                if (v === 'real-word') { label = 'reject'; why = 'real-word'; }
                else if (v === 'novel-unverified') { why = 'novel-unverified'; trusted = false; }
              }
            }
            const sub = op.why(key, typed);
            push({
              set: wordSet, lang, dir: 'word', unit, term: card.term, key, typed,
              op: sub === op.name ? op.name : op.name + '/' + sub,
              label, why, trusted, fold, holdout
            });
            break;                                               // חריץ אחד · מועמד אחד
          }
        }
      }

      /* ---- שליליים · כיוון המונח ---- */
      let neg = 0;
      const negKind = {};
      const pushNeg = (typed, kind) => {
        if (neg >= NEG_PER_CARD) return;
        if ((negKind[kind] || 0) >= (NEG_CAP[kind] || 1)) return;
        if (!typed || typed === termKey || seen.has(typed)) return;
        if (accepts(typed)) return;                              // תווית "חובה-לדחות" על משהו שמתקבל היום היא רגרסיה, לא שלילי
        seen.add(typed);
        let why = kind;
        if (isVetoedTerm(typed, card, veto, ctx)) why = 'veto';
        else { const hit = collide(typed, o.legacyRef ? [termKey] : ownWordKeys, allowTerm, termIndex, ctx, o.legacyRef ? null : accKeys); if (hit) why = 'ambiguous:' + hit; }
        push({
          set: wordSet, lang, dir: 'word', unit, term: card.term, key: termKey, typed,
          op: 'neg/' + kind, label: 'reject', why, trusted: true, fold, holdout
        });
        neg++;
        negKind[kind] = (negKind[kind] || 0) + 1;
      };

      /* בן הזוג האמיתי מזוגות מרחק-1 · השלילי החזק ביותר שיש: מילה שקיימת, שנכתבת
         כמעט אותו דבר, ושהלומד באמת התכוון אליה. שני חריצים ולא אחד (ממצא F6): זו
         המשפחה היחידה שבודקת בדיוק את מה שהווטו קיים בשבילו, והיא הייתה 1.6% מהקורפוס. */
      const partners = [];
      for (const i of termIndex.near(termKey, 1)) {
        const k = termIndex.keys[i];
        if (k === termKey || ctx.editDist(k, termKey) !== 1) continue;
        let other = false;
        for (const ow of termIndex.owners[i]) if (!allowTerm.has(ow)) other = true;
        if (other) partners.push(k);
      }
      partners.sort();
      for (const p of partners.slice(0, NEG_CAP['d1-partner'])) pushNeg(p, 'd1-partner');

      /* וריאציה של מונח *אחר* שנוחתת במרחק ≤ 2 מהמפתח הזה · הכשל הקלאסי שסף לבדו
         אינו תופס: לא מילה, לא זבל, וקרובה לשני ערכים בבת אחת. */
      const near2 = [];
      for (const i of termIndex.near(termKey, 2)) {
        const k = termIndex.keys[i];
        if (k === termKey) continue;
        const d = ctx.editDist(k, termKey);
        if (d < 1 || d > 2) continue;
        let other = false;
        for (const ow of termIndex.owners[i]) if (!allowTerm.has(ow)) other = true;
        if (other) near2.push(k);
      }
      near2.sort();
      /* שני חריצים · שני מקורות שונים, לא אותו מקור פעמיים. */
      for (let slot = 0; slot < NEG_CAP['other-variant'] && near2.length; slot++) {
        const src = near2[randInt(rngFor(lang, termKey, 'neg-variant', slot, 'src'), near2.length)];
        const op = wordTax[randInt(rngFor(lang, termKey, 'neg-variant', slot, 'op'), wordTax.length)];
        for (const v of op.apply(src, rngFor(lang, termKey, 'neg-variant', slot, 'v'))) {
          if (ctx.editDist(termKey, v) > 2) continue;
          pushNeg(v, 'other-variant');
          break;
        }
      }

      /* נטייה טהורה · מחלקת כפרים מול כֹּפֶר. tests/05 מקבע שזו נשארת פסולה, ולכן היא
         נכנסת לאימון כשלילי מפורש ולא נשארת מקרה קצה שהוסק במקרה.
         (ממצא F2b) הצורה נבנית ב-lib/morph.js מה**מונח הכתוב** ולפי מורפולוגיה אמיתית,
         ומאושרת מול הלקסיקון. אם אין צורה לגיטימית · אין שורה. קודם הודבקה הסיומת
         למפתח המקופל ונולדו אבניימות, אלומהיות, anded, alsoing · 93.7% לא-מילים. */
      const forms = licitForms(card, lang);
      if (forms.length) {
        const f = forms[randInt(rngFor(lang, termKey, 'neg-inflect', 0), forms.length)];
        pushNeg(ctx.K(f), 'inflection');
      }

      /* זבל באורך ובאלפבית תואמים · **רצפה ולא מלאי** (ממצא F6). כרטיס שכבר קיבל שני
         שליליים אמיתיים אינו צריך אותו, וכרטיס בודד במאגר כן · בלעדיו כל סף היה נראה
         בטוח על כרטיס שאין לו שכנים. */
      for (let t = 0; t < 4 && neg < GARBAGE_FLOOR; t++) {
        const rnd = rngFor(lang, termKey, 'neg-garbage', t);
        let g = '';
        for (let i = 0; i < Math.max(MIN_LEN, letters(termKey)); i++) g += alphabet[randInt(rnd, alphabet.length)];
        pushNeg(g, 'garbage');
      }

      /* ---- כיוון הפירוש ---- */
      const segs = Array.from(accSegs).filter(s => letters(s) >= MIN_LEN).sort();
      /* ===== fold ו-holdout לפי ה**מקטע** ולא לפי המונח (ממצא F4) =====
       * מקטע פירוש משותף בין ערכים: "כעס" מפרש שישה ערכים שונים, "מסוגל" מפרש גם able
       * וגם capable. כשה-fold נגזר מהמונח, אותו מפתח יושב בשני folds · 24.5% משורות
       * הפירוש האנגליות חצו fold ו-9.2% חצו את קו ה-holdout, כלומר ה-CV מדד על טקסט
       * שהוא כבר ראה. הגזירה מהמקטע סוגרת את זה מבנית: fold הוא פונקציה של המפתח. */
      const gseen = new Set();
      const posSegs = segs.filter(segOkForPositives);
      for (const seg of posSegs) {
        const segFold = foldOf(seg);
        const segHoldout = holdoutOf(seg);
        for (let i = 0; i < glossQueue.length && i < POS_PER_SEG; i++) {
          const op = rotate(glossQueue, seg, i);
          const variants = op.apply(seg, rngFor(lang, seg, 'gloss', op.name, i));
          for (const typed of variants) {
            if (!typed) continue;
            if (typed === seg && !o.brokenOp) continue;
            if (gseen.has(typed)) continue;
            if (!o.brokenOp && acceptsGloss(typed)) { gseen.add(typed); continue; }
            gseen.add(typed);
            let label = 'accept', why = 'novel', trusted = true;
            if (isVetoedSegAll(typed, accSegs, allowSeg)) { label = 'reject'; why = 'veto'; }
            else {
              const hit = collide(typed, o.legacyRef ? [seg] : ownGlossKeys, allowSeg, segIndex, ctx, o.legacyRef ? null : accSegs);
              if (hit) { label = 'reject'; why = 'ambiguous:' + hit; }
              else {
                /* צד הפירוש עברי בשני המאגרים · הלקסיקון נשאל בעברית תמיד. */
                const v = lexVerdict(typed, seg, 'he', accSegs);
                if (v === 'real-word') { label = 'reject'; why = 'real-word'; }
                else if (v === 'novel-unverified') { why = 'novel-unverified'; trusted = false; }
              }
            }
            const sub = op.why(seg, typed);
            push({
              set: 'gloss', lang, dir: 'gloss', unit, term: card.term, key: seg, typed,
              op: sub === op.name ? op.name : op.name + '/' + sub,
              label, why, trusted, fold: segFold, holdout: segHoldout
            });
            break;
          }
        }
      }

      /* שליליים · כיוון הפירוש. המרכזי בהם הוא מקטע מפירוש של ערך אחר: זו הקבלה השגויה
         שהכי קל ליפול אליה, כי פירושים קצרים חולקים אוצר מילים. */
      /* הבסיס לשליליים · המקטע הקצר ביותר שראוי לייצור, ואם אין כזה · המקטע הראשון.
         ה-fold נגזר ממנו, בדיוק כמו בחיוביים, כך שכל שורה בסט gloss מקיימת
         ‏fold = f(key) ואין (set,key) שיושב בשני folds. */
      const gbase = posSegs.length ? posSegs[0] : (segs.length ? segs[0] : termKey);
      const gFold = foldOf(gbase);
      const gHoldout = holdoutOf(gbase);
      let gneg = 0;
      const gnegKind = {};
      const pushGNeg = (typed, kind) => {
        if (gneg >= NEG_GLOSS_PER_CARD) return;
        if ((gnegKind[kind] || 0) >= (NEG_GLOSS_CAP[kind] || 1)) return;
        if (!typed || gseen.has(typed) || typed === gbase) return;
        if (acceptsGloss(typed)) return;
        gseen.add(typed);
        let why = kind;
        if (isVetoedSegAll(typed, accSegs, allowSeg)) why = 'veto';
        else { const hit = collide(typed, o.legacyRef ? [gbase] : ownGlossKeys, allowSeg, segIndex, ctx, o.legacyRef ? null : accSegs); if (hit) why = 'ambiguous:' + hit; }
        push({
          set: 'gloss', lang, dir: 'gloss', unit, term: card.term, key: gbase, typed,
          op: 'neg/' + kind, label: 'reject', why, trusted: true, fold: gFold, holdout: gHoldout
        });
        gneg++;
        gnegKind[kind] = (gnegKind[kind] || 0) + 1;
      };
      if (allSegs.length) {
        for (let t = 0; t < 6 && gneg < NEG_GLOSS_PER_CARD; t++) {
          const rnd = rngFor(lang, termKey, 'neg-gloss', t);
          pushGNeg(allSegs[randInt(rnd, allSegs.length)], 'other-gloss-seg');
        }
      }
      for (let t = 0; t < 3 && gneg < GARBAGE_FLOOR; t++) {
        const rnd = rngFor(lang, termKey, 'neg-gloss-garbage', t);
        let g = '';
        for (let i = 0; i < Math.max(MIN_LEN, letters(gbase)); i++) g += HE_ALPHABET[randInt(rnd, HE_ALPHABET.length)];
        pushGNeg(g, 'garbage');
      }
    }

    byLang[lang] = rows;
    say(`[${lang}] ${rows.length} שורות · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
  }

  /* ===== מעבר עקביות אחרון (ממצא F3) =====
   * האינדקס המאוחד הסיר את הסתירות שנבעו משתי השפות. מה שיכול להישאר הוא סתירה שנובעת
   * מ**פטור הנרדפות**: אותו (מפתח, מוקלד) מותר לכרטיס שהמקטע המתנגש שייך גם לו, ואסור
   * לכרטיס שאינו מחזיק בו. זו אינה טעות אלא אובדן מידע · השורה נושאת (set,key,typed)
   * ולא נושאת את הכרטיס, ולכן ההחלטה האמיתית אינה ניתנת לשחזור ממנה.
   * ההכרעה: הצד המחמיר. שם המשחק הוא אפס קבלות-שווא, ותווית reject על שורה שאולי
   * הייתה מותרת עולה recall · תווית accept על שורה שאולי הייתה אסורה עולה את האילוץ
   * הקשיח עצמו. המספר נספר במניפסט ולא נבלע. */
  {
    const seenLabel = new Map();
    for (const L of ['he', 'en']) for (const r of byLang[L]) {
      const t = r.set + '' + r.key + '' + r.typed;
      const p = seenLabel.get(t);
      if (p === undefined) seenLabel.set(t, r.label);
      else if (p !== r.label) seenLabel.set(t, 'reject');
    }
    for (const L of ['he', 'en']) for (const r of byLang[L]) {
      const t = r.set + '' + r.key + '' + r.typed;
      if (seenLabel.get(t) === 'reject' && r.label !== 'reject') {
        r.label = 'reject'; r.why = 'cross-card'; r.trusted = true; flips++;
      }
    }
  }

  for (const lang of ['he', 'en']) {
    const rows = byLang[lang];
    for (const row of rows) {
      bump(counts.set, row.set); bump(counts.label, row.label);
      /* op נספר בשמו המלא (כולל תת-התבנית האנגלית וסוג השלילי): חוק שמייצר עשרות אלפי
         שורות ואינו תורם ל-recall חייב להיראות בטבלה ולא להיבלע בצבירה.
         why נספר לפי הקידומת בלבד · "ambiguous:<מפתח>" הוא אלפי ערכים שונים. */
      bump(counts.op, row.op); bump(counts.why, String(row.why).split(':')[0]);
      bump(counts.setLabel, row.set + '/' + row.label);
      bump(counts.trusted, String(row.trusted));
    }
    const file = path.join(outDir, `dataset-${lang}.jsonl`);
    const text = rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    fs.writeFileSync(file, text, 'utf8');
    const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    files.push({ name: path.basename(file), rows: rows.length, bytes: Buffer.byteLength(text, 'utf8'), sha256: sha });
    say(`[${lang}] ${sha.slice(0, 16)}…`);
  }

  const lex = buildLexicon();
  const manifest = {
    seed: SEED,
    foldSalt: FOLD_SALT,
    holdoutSalt: HOLDOUT_SALT,
    folds: FOLDS,
    holdoutRate: HOLDOUT_RATE,
    budgets: {
      MIN_LEN, POS_PER_KEY, POS_PER_SEG, NEG_PER_CARD, NEG_GLOSS_PER_CARD, MAX_D,
      SEG_MAX_WORDS, SEG_MAX_LETTERS, GARBAGE_FLOOR, UNVERIFIED_MAX_LETTERS,
      NEG_CAP, NEG_GLOSS_CAP
    },
    /* הלקסיקון הוא חלק מהתיוג, ולכן גודלו הוא חלק מהמניפסט: שינוי במקורות משנה תוויות,
       וצריך להיראות כאן ולא רק ב-SHA. */
    lexicon: lex.stats,
    consistencyFlips: flips,
    broken: { op: !!o.brokenOp, fold: !!o.brokenFold, limitCards: o.limitCards || 0 },
    total: files.reduce((n, f) => n + f.rows, 0),
    counts: {
      set: sortObj(counts.set), label: sortObj(counts.label),
      op: sortObj(counts.op), why: sortObj(counts.why), setLabel: sortObj(counts.setLabel),
      trusted: sortObj(counts.trusted)
    },
    files
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function sortObj(bag) {
  const out = {};
  for (const k of Object.keys(bag).sort()) out[k] = bag[k];
  return out;
}

module.exports = {
  generate, OUT_DIR, SEED, FOLD_SALT, HOLDOUT_SALT, FOLDS, HOLDOUT_RATE,
  foldOf, holdoutOf, buildIndex, deletions,
  segOkForPositives, meaningBearingHe, squashOnlyKeys, lexVerdict,
  SEG_MAX_WORDS, SEG_MAX_LETTERS, UNVERIFIED_MAX_LETTERS, MEANING_PAIRS, letters, wordsOf
};

if (require.main === module) {
  /* ‏--out=<dir> · ‏v3 נכתב ל-out/ עצמו: הצרכנים של v2 סיימו. הארכיון out/v1-old נשאר
     במקומו והוא הדאטהסט שמולו selfcheck2b מוכיח שיניים, ו-out/v2 נשאר כעד שני. */
  const arg = process.argv.slice(2).find(a => a.startsWith('--out='));
  const outDir = arg ? path.resolve(__dirname, arg.slice(6)) : OUT_DIR;
  const m = generate({ outDir });
  process.stdout.write('\n');
  process.stdout.write(`סה"כ ${m.total} שורות · ${JSON.stringify(m.counts.label)}\n`);
  process.stdout.write(`לקסיקון · ${m.lexicon.heTypes} טיפוסים עבריים · ${m.lexicon.enTypes} אנגליים · ${m.lexicon.files} קבצים\n`);
  process.stdout.write(`נכתב ל-${outDir}\n`);
}
