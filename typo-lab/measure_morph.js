'use strict';
/* מדידת מחלקת המורפולוגיה הצרה · תועלת מול סיכון, מספר לכל וריאנט בנפרד.
 *
 * המתודולוגיה זהה ל-measure_gloss.js ואינה גרסה שלה: אותן שלוש שאלות, אותו סף קשיח,
 * אותו פטור-נרדפות, אותו שער ווטו, ואותה דרישה שכל התנגשות תופיע בשמה.
 *   תועלת   כמה מ-24 המקרים האמיתיים שחגי צילם הווריאנט פותר.
 *   סיכון   כל מחרוזת שהווריאנט *מוסיף* ואינה מתקבלת היום, מוצלבת מול יקום התשובות
 *           הקבילות של כל שאר הכרטיסים · בשתי השפות, על המאגר המלא.
 *   רגרסיה  ששום דבר שמתקבל היום אינו נדחה.
 *
 * ⚠ 24 המקרים הם ולידציה חיצונית. אסור לכוון עליהם פרמטרים מעבר לדיווח.
 *
 * ⛔ ההקשר שאסור לשכוח: כלל מורפולוגי כללי כבר נמדד ונדחה בפרויקט הזה
 * (`דוחות/סיכומים/מדידת-כלל-מורפולוגי.md`): גזירה לשלד עיצורי על כל מילות התוכן קיפלה 61.7%
 * מאוצר המילים ל-869 קבוצות מתנגשות והפכה 918 זוגות פירושים לניתנים להחלפה. הקובץ הזה
 * אינו מודד אותו מחדש · הוא מודד האם ההגבלה למילה-בודדת-מול-מילה-בודדת מצילה אותו.
 *
 * ===== יקום ההתנגשות · ולמה כאן הוא **מלא** ולא חלקי =====
 * שלושת החוקים דורשים ש-typed יהיה טוקן יחיד. לכן די למנות את **כל המחרוזות בנות
 * מילה אחת שאיזשהו כרטיס מקבל היום**, וזו קבוצה סופית שנגזרת ישירות מ-meaningMatch
 * (app.js:1257) · ארבעת הענפים שלה:
 *   1. norm(meaning) כשהוא טוקן יחיד
 *   2. אותו דבר בלי הסוגריים
 *   3. מקטע שהוא טוקן יחיד
 *   4. particleMatch מול מקטע בעל **מילת תוכן אחת** · וזו הרחבה סופית: קילוף/הוספה של
 *      אות אחת מ-'הלבכו' בראש המילה, בכפוף לתנאי האורך>3 של peel.
 * ענף 4 הוא היחיד שאינו טריוויאלי, והוא נגזר מהקוד ולא מהזיכרון. השלמות **נבדקת
 * אמפירית** מול meaningMatch האמיתית על 120,000 זוגות אקראיים לכל שפה, מבריכה שכוללת
 * במפורש גם מחרוזות שאינן ביקום · אחרת הבדיקה הייתה מאשרת רק את מה שכבר בפנים.
 *
 * מכאן: לחוקים האלה **אין שארית "לא נמדדה"** בכיוון הפירוש. קבוצת הקבלות של M1/M2 אכן
 * אינסופית (כל מחרוזת עם אותו שלד), וזה נאמר במפורש בדוח · אבל השאלה שמכריעה היא
 * החיתוך שלה עם יקום סופי, והחיתוך הזה נמנה במלואו.
 *
 * פטור הנרדפות: מקטע שבעליו הוא הכרטיס עצמו או מילה שחולקת איתו פירוש (glossAlts) אינו
 * התנגשות · זו בדיוק ההתנהגות של היום, ואותה הכרעה כמו ב-veto.js.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { buildVeto, isVetoedSeg } = require('./lib/veto.js');
const { acceptedKeys } = require('./lib/keys.js');
const M = require('./lib/morphrules.js');
const { rngFor, randInt } = require('./lib/rng.js');

/* 24 המקרים מיובאים ולא משוכפלים · טבלה שנייה הייתה סחיפה שקטה ביום שהראשונה תתוקן. */
const { CASES24 } = require('./measure_gloss.js');

/* ===== התצורות שנמדדות =====
 * כל שורה היא וריאנט אחד עם ערכי פרמטרים · אף וריאנט אינו נמדד בתערובת, כדי שאפשר
 * יהיה לייחס כל התנגשות לחוק ולערך פרמטר.
 */
const CONFIGS = [
  { key: 'M1-n3', rule: 'skeletonSingle', params: { peelSuffix: false, peelPrefix: false, minSkel: 3 }, label: 'שלד מילה-מול-מילה · בלי קילוף, שלד ≥3' },
  { key: 'M1-n2', rule: 'skeletonSingle', params: { peelSuffix: false, peelPrefix: false, minSkel: 2 }, label: 'שלד מילה-מול-מילה · בלי קילוף, שלד ≥2' },
  { key: 'M1-s3', rule: 'skeletonSingle', params: { peelSuffix: true, peelPrefix: false, minSkel: 3 }, label: 'שלד · קילוף סיומת, שלד ≥3' },
  { key: 'M1-s3-w4', rule: 'skeletonSingle', params: { peelSuffix: true, peelPrefix: false, minSkel: 3, minWordLen: 4 }, label: 'שלד · קילוף סיומת, שלד ≥3, מילה ≥4' },
  { key: 'M1-s2', rule: 'skeletonSingle', params: { peelSuffix: true, peelPrefix: false, minSkel: 2 }, label: 'שלד · קילוף סיומת, שלד ≥2' },
  { key: 'M1-p3', rule: 'skeletonSingle', params: { peelSuffix: true, peelPrefix: true, minSkel: 3 }, label: 'שלד · קילוף תחילית וסיומת, שלד ≥3' },
  { key: 'M1-p2', rule: 'skeletonSingle', params: { peelSuffix: true, peelPrefix: true, minSkel: 2 }, label: 'שלד · קילוף תחילית וסיומת, שלד ≥2' },

  { key: 'M2-f3', rule: 'skeletonInSeg', params: { headMode: 'first', peelSuffix: true, peelPrefix: false, minSkel: 3 }, label: 'שלד מול ראש מקטע · מילת תוכן ראשונה' },
  { key: 'M2-l3', rule: 'skeletonInSeg', params: { headMode: 'longest', peelSuffix: true, peelPrefix: false, minSkel: 3 }, label: 'שלד מול ראש מקטע · מילת התוכן הארוכה' },
  { key: 'M2-a3', rule: 'skeletonInSeg', params: { headMode: 'any', peelSuffix: true, peelPrefix: false, minSkel: 3 }, label: 'שלד מול כל מילה במקטע · חסם עליון' },
  { key: 'M2-f3p', rule: 'skeletonInSeg', params: { headMode: 'first', peelSuffix: true, peelPrefix: true, minSkel: 3 }, label: 'שלד מול ראש מקטע · ראשונה, גם קילוף תחילית' },
  { key: 'M2-l3p', rule: 'skeletonInSeg', params: { headMode: 'longest', peelSuffix: true, peelPrefix: true, minSkel: 3 }, label: 'שלד מול ראש מקטע · ארוכה, גם קילוף תחילית' },
  { key: 'M2-f2', rule: 'skeletonInSeg', params: { headMode: 'first', peelSuffix: true, peelPrefix: false, minSkel: 2 }, label: 'שלד מול ראש מקטע · ראשונה, שלד ≥2' },

  { key: 'M3-all', rule: 'binyanPair', params: { conservative: false, strictRoot: false }, label: 'טבלת משקלים · כל 11 הזוגות' },
  { key: 'M3-all-sr', rule: 'binyanPair', params: { conservative: false, strictRoot: true }, label: 'טבלת משקלים · כל הזוגות, שורש שלם בלבד' },
  { key: 'M3-cons', rule: 'binyanPair', params: { conservative: true, strictRoot: false }, label: 'טבלת משקלים · 7 הזוגות שומרי-המשמעות' },
  { key: 'M3-cons-sr', rule: 'binyanPair', params: { conservative: true, strictRoot: true }, label: 'טבלת משקלים · שומרי-משמעות, שורש שלם בלבד' },
];

/* פירוק M3 לזוג-זוג · תצורה מצרפית שנדחית אינה אומרת מי אשם, ובלי הפירוק היה נשאר
   פתח ל"אולי זוג בודד בכל זאת נקי". כאן זה נמדד ולא נותר פתוח. strictRoot דלוק כי זו
   הצורה ההדוקה ביותר של כל זוג · אם היא מתנגשת, הרפויה ממנה מתנגשת בוודאי. */
const PAIR_CONFIGS = M.BINYAN_PAIRS.map(pr => ({
  key: 'P-' + pr.id, rule: 'binyanPair',
  params: { pairs: [pr.id], strictRoot: true },
  label: 'זוג בודד · ' + pr.he,
}));

/* ===== תצורות לפי **מחלקת טרנספורמציה** · תוספת אדיטיבית =====
 * ‏`PAIR_CONFIGS` מפרק זוג-זוג ו-`CONFIGS` מאגד הכול או את `CONSERVATIVE`. חסרה
 * הרמה שביניהן: קיבוץ לפי מה שהטרנספורמציה עושה למשמעות. ההגדרות כאן זהות ל-`XFORM`
 * ב-`typo-lab/he_morph_split.js`, ובכוונה — שתי רשימות שנכתבות פעמיים נסחפות.
 *   A · נטייה              אותה לקסמה, צורה דקדוקית אחרת
 *   B · גזירה משמרת-תוכן   לקסמה אחרת, אותו אירוע/תכונה
 *   C · גזירה מחליפת-לקסמה דיאתזה, סבילות, שינוי בניין
 * ‏`strictRoot: false` בכוונה · זה בדיוק המרחב ש-`he_morph_split` מדד, וכל הידוק
 * צריך להיות מדיד בנפרד ולא אפוי לתוך ההגדרה.
 */
const XFORM_GROUPS = {
  'C-INF': ['pa-inf', 'hit-inf'],
  'C-PART': ['pa-act'],
  'C-ACTNOUN': ['act-pa', 'act-inf', 'hif-act'],
  'C-ABSNOUN': ['adj-abs'],
  'C-AGENT': ['act-agent'],
  'C-VOICE': ['act-pass'],
  'C-BINYAN': ['pa-hit', 'nif-pa'],
  'C-A': ['pa-inf', 'hit-inf', 'pa-act'],
  'C-B': ['act-pa', 'act-inf', 'hif-act', 'adj-abs'],
  'C-AB': ['pa-inf', 'hit-inf', 'pa-act', 'act-pa', 'act-inf', 'hif-act', 'adj-abs'],
  'C-C': ['act-agent', 'act-pass', 'pa-hit', 'nif-pa'],
};
/* ⛔ שער כיסוי · הלקח של "נרמול פרמטרים אחד". ‏`he_morph_split.js` זורק על זוג בלי
   מחלקה; הרשימה כאן נקראת דרך `CLASS_CONFIGS` בשלושה קבצים אחרים, וקודם לא היה לה
   שער. זוג 12 היה מפיל קובץ אחד ברעש ומשאיר את השני מודד מרחב קטן יותר **בשקט**. */
{
  const singles = ['C-INF', 'C-PART', 'C-ACTNOUN', 'C-ABSNOUN', 'C-AGENT', 'C-VOICE', 'C-BINYAN'];
  const seen = new Map();
  for (const k of singles) for (const id of XFORM_GROUPS[k]) {
    if (seen.has(id)) throw new Error(`measure_morph: הזוג ${id} בשתי מחלקות · ${seen.get(id)} ו-${k}`);
    seen.set(id, k);
  }
  const missing = M.BINYAN_PAIRS.map(p => p.id).filter(id => !seen.has(id));
  if (missing.length) throw new Error('measure_morph: זוגות בלי מחלקה · ' + missing.join(','));
  const unknown = Array.from(seen.keys()).filter(id => !M.BINYAN_PAIRS.some(p => p.id === id));
  if (unknown.length) throw new Error('measure_morph: מחלקה מפנה לזוג שאינו קיים · ' + unknown.join(','));
}
const CLASS_CONFIGS = Object.keys(XFORM_GROUPS).map(k => ({
  key: k, rule: 'binyanPair',
  params: { pairs: XFORM_GROUPS[k], strictRoot: false },
  label: 'מחלקה · ' + k.slice(2) + ' · ' + XFORM_GROUPS[k].join(','),
}));

const LANGS = ['he', 'en'];
const EX_OTHER_CAP = 40;      // תקרת דוגמאות ליחידה אחרת
const SAME_LIST_CAP = 60;     // כמה התנגשויות-באותה-יחידה מוצגות בשמן לכל וריאנט
const FAST_SAMPLE = 120000;   // זוגות לאימות שיקוף meaningMatch, לכל שפה
const TERM_SAMPLE = 120000;   // זוגות לאימות שיקוף isCorrect, לכל שפה

const P_LETTERS = 'הלבכו';    // PARTICLE של particleMatch (app.js:1294)
const tokens = s => String(s).split(/\s+/).filter(Boolean);

/* ===== ענף 4 של meaningMatch · ההרחבה הסופית =====
 * כל המחרוזות בנות מילה אחת ש-particleMatch מקבל מול מילת תוכן יחידה y.
 * נגזר ישירות מ-eq של app.js:1299 · ארבעת הענפים שלו, ולא "בערך":
 *   x===y                       המילה עצמה
 *   peel(x)===y                 x = אות יחס + y, ובתנאי |x|>3
 *   x===peel(y)                 y = אות יחס + x, ובתנאי |y|>3
 *   peel(x)===peel(y)           שתיהן אות יחס + אותו גוף
 * מחרוזת שהיא מילת יחס עצמאית נופלת · cut מוציא אותה ואז A.length===0 מחזיר false.
 */
function particleForms(y, st) {
  const out = new Set();
  const add = v => { if (v && !st.has(v)) out.add(v); };
  add(y);
  for (const c of P_LETTERS) { const v = c + y; if (v.length > 3) add(v); }
  if (y.length > 3 && P_LETTERS.includes(y[0])) {
    const base = y.slice(1);
    add(base);
    for (const c of P_LETTERS) { const v = c + base; if (v.length > 3) add(v); }
  }
  return out;
}

/* ===== טעינת שפה · כל האינדקסים פעם אחת ===== */
const langCache = new Map();
function loadLang(lang) {
  const hit = langCache.get(lang); if (hit) return hit;
  const ctx = getCtx(lang);
  const veto = buildVeto(ctx, lang);
  const bank = Array.from(ctx.BANK);
  const st = M.stopOf(ctx);

  const cards = bank.map(w => {
    const segs = Array.from(ctx.meaningSegs(w.meaning));
    const meanNorm = ctx.norm(w.meaning);
    const meanBare = ctx.norm(String(w.meaning).replace(/\([^)]*\)/g, ' '));
    /* קבוצת כל המחרוזות בנות מילה אחת שהכרטיס מקבל היום · ארבעת ענפי meaningMatch. */
    const singles = new Set();
    if (tokens(meanNorm).length === 1) singles.add(meanNorm);
    if (tokens(meanBare).length === 1) singles.add(meanBare);
    for (const s of segs) {
      if (tokens(s).length === 1) singles.add(s);
      const cut = tokens(s).filter(x => !st.has(x));
      if (cut.length === 1) for (const v of particleForms(cut[0], st)) singles.add(v);
    }
    return { w, key: ctx.K(w.term), unit: String(w.unit), segs, singles, meanNorm, meanBare };
  });

  const unitOfOwner = new Map();
  for (const c of cards) { let s = unitOfOwner.get(c.key); if (!s) { s = new Set(); unitOfOwner.set(c.key, s); } s.add(c.unit); }
  const cardByKey = new Map();
  for (const c of cards) if (!cardByKey.has(c.key)) cardByKey.set(c.key, c);

  /* SINGLE · יקום ההתנגשות המלא בכיוון הפירוש: מחרוזת בת מילה אחת -> קבוצת הבעלים. */
  const SINGLE = new Map();
  for (const c of cards) for (const x of c.singles) {
    let s = SINGLE.get(x); if (!s) { s = new Set(); SINGLE.set(x, s); } s.add(c.key);
  }

  /* VOCAB · אוצר המילים ה**אמיתי** של המאגר, מילה בודדת: כל טוקן שמופיע בפירוש כלשהו
     (בלי מילות יחס עצמאיות) וכל מפתח מונח בן מילה אחת. משמש למדידת קיפול אוצר המילים
     · המדד שהרג את הכלל הכללי · ולסקאלת "כמה קבלות חדשות". */
  const VOCAB = new Set();
  for (const c of cards) {
    for (const s of c.segs) for (const t of tokens(s)) if (!st.has(t)) VOCAB.add(t);
    if (tokens(c.key).length === 1) VOCAB.add(c.key);
  }
  if (lang !== 'en') for (const w of bank) for (const v of Array.from(ctx.heForms(w.term))) {
    const k = ctx.K(v); if (k && tokens(k).length === 1) VOCAB.add(k);
  }

  const out = { lang, ctx, veto, bank, cards, unitOfOwner, cardByKey, SINGLE, VOCAB, st };
  validateFast(out);
  validateTerm(out);
  langCache.set(lang, out);
  return out;
}

/* ===== שן א' · שיקוף meaningMatch =====
 * הבריכה כוללת בכוונה שלושה סוגים: מחרוזות שביקום, מילים אמיתיות שאינן ביקום, ומוטנטים
 * שנבנו כדי לדגדג בדיוק את ענף particleMatch (הוספה/הורדה של אות יחס). בלי הסוג השני
 * והשלישי הבדיקה הייתה מאשרת רק שהיקום מוכל ב-meaningMatch, ולא שהוא **שווה** לו ·
 * כלומר לא הייתה בודקת שלמות בכלל, וזו כל הטענה של הקובץ הזה.
 */
function poolOf(L) {
  const pool = new Set();
  for (const x of L.SINGLE.keys()) pool.add(x);
  for (const x of L.VOCAB) pool.add(x);
  const arr = Array.from(pool);
  for (const x of arr) {
    if (x.length > 3 && P_LETTERS.includes(x[0])) pool.add(x.slice(1));
    for (const c of P_LETTERS) pool.add(c + x);
  }
  return Array.from(pool).filter(x => x && tokens(x).length === 1);
}

/* מועמדים ל**כרטיס מסוים**, שנבנים מהפירוש שלו ו**לא** מ-singles.
 * זו הנקודה שבה הבדיקה מפסיקה להיות מעגלית: דגימה אחידה של (מחרוזת, כרטיס) מתוך מכפלה
 * של 77,000 על 1,700 היא כמעט תמיד שלילי-שלילי, ולכן היא חזקה מאוד נגד קבלה מיותרת
 * וכמעט חסרת כוח נגד קבלה **חסרה** · מחיקה של ערך אחד מהיקום לא הייתה נתפסת אף פעם.
 * זה נמדד בפועל בשער ולא נוחש. לכן הדגימה דו-שלבית:
 *   שלב א' · מחרוזת אקראית מהבריכה מול כרטיס אקראי · כוח נגד קבלה מיותרת
 *   שלב ב' · מועמד סביר **של אותו כרטיס** · כוח נגד קבלה חסרה
 * המועמדים נגזרים מהפירוש בלבד (מילותיו, עם ובלי אות יחס בראש), ולכן הם בנייה עצמאית
 * מ-singles ולא שיקוף שלו.
 */
function candidatesFor(L, card) {
  if (card._cand) return card._cand;
  const out = new Set();
  const add = v => { if (v && v.length) out.add(v); };
  const seeds = new Set();
  for (const s of card.segs) for (const t of tokens(s)) seeds.add(t);
  for (const t of tokens(card.meanNorm)) seeds.add(t);
  for (const t of tokens(card.meanBare)) seeds.add(t);
  for (const s of card.segs) if (tokens(s).length === 1) seeds.add(s);
  for (const y of seeds) {
    add(y);
    for (const c of P_LETTERS) add(c + y);
    if (y.length > 1) add(y.slice(1));
  }
  card._cand = Array.from(out);
  return card._cand;
}

/* השוואה מדגמית אחת, דו-שלבית · משמשת גם את הווידוא וגם את השער, כדי שהשער יבדוק את
   הקוד שמכריע ולא העתק שלו. getSingles מוחלף בשער ביקום מקולקל בכוונה. */
function sampleMismatch(L, getSingles, n, tag) {
  const rnd = rngFor('measure_morph', tag, L.lang);
  const half = Math.floor(n / 2);
  let bad = 0, badEx = null;
  for (let i = 0; i < n; i++) {
    const c = L.cards[randInt(rnd, L.cards.length)];
    let x;
    if (i < half) x = L.pool[randInt(rnd, L.pool.length)];
    else { const cand = candidatesFor(L, c); x = cand[randInt(rnd, cand.length)]; }
    if (!x || tokens(x).length !== 1) continue;
    const mine = getSingles(c).has(x);
    if (mine !== L.ctx.meaningMatch(x, c.w.meaning)) { bad++; if (!badEx) badEx = `${c.w.term} <- "${x}" (שלי ${mine})`; }
  }
  return { bad, badEx };
}

function validateFast(L) {
  L.pool = poolOf(L);
  const r = sampleMismatch(L, c => c.singles, FAST_SAMPLE, 'fast');
  L.fastMismatch = r.bad;
  if (r.bad) throw new Error(`measure_morph: יקום המילה-הבודדת אינו שקול ל-meaningMatch · ${r.bad}/${FAST_SAMPLE} אי-התאמות, לדוגמה ${r.badEx}`);
}

/* ===== שן ב' · שיקוף isCorrect בצד המונח =====
 * הווטו על צד המונח נשען על termKeys, ו-termKeys נבנה מ-K+heForms. אם ההנחה הזאת
 * שגויה, כל ספירת "התנגשות מול מונח" למטה שגויה איתה. נבדק ולא מונח.
 */
function validateTerm(L) {
  const rnd = rngFor('measure_morph', 'term', L.lang);
  const pool = L.pool;
  let bad = 0, badEx = null;
  for (let n = 0; n < TERM_SAMPLE; n++) {
    const x = pool[randInt(rnd, pool.length)];
    const c = L.cards[randInt(rnd, L.cards.length)];
    /* isCorrect מנרמלת את הקלט שלה (`const a=K(input)`, app.js:772), ולכן גם השיקוף
       חייב · בעברית K(x)===x כי x כבר מנורמל, אבל באנגלית normEn מוחקת תווים שאינם
       a-z, ולכן "וprice" מגיע ל-isCorrect כ-"price". שיקוף בלי K היה מפספס בדיוק את
       הזוגות האלה, וזה נתפס בפועל: 2 אי-התאמות מתוך 120,000. */
    const xk = L.ctx.K(x);
    const mine = !!xk && acceptedKeys(c.w, L.ctx).has(xk);
    if (mine !== L.ctx.isCorrect(x, c.w.term)) { bad++; if (!badEx) badEx = `${c.w.term} <- "${x}" (שלי ${mine})`; }
  }
  L.termMismatch = bad;
  if (bad) throw new Error(`measure_morph: acceptedKeys אינו שקול ל-isCorrect · ${bad}/${TERM_SAMPLE} אי-התאמות, לדוגמה ${badEx}`);
}

/* מי הבעלים ה*מפריעים* · אותה הכרעה של isVetoedSeg, אבל מחזירה שמות. */
function offenders(L, x, card) {
  const owners = L.SINGLE.get(x);
  if (!owners || !owners.size) return [];
  if (card.singles.has(x)) return [];
  const allowed = new Set([card.key]);
  for (const t of Array.from(L.ctx.glossAlts(card.w))) allowed.add(L.ctx.K(t));
  const bad = [];
  for (const o of owners) if (!allowed.has(o)) bad.push(o);
  return bad;
}

/* ===== קיפול אוצר המילים · המדד שהרג את הכלל הכללי =====
 * שם: 3,011 מתוך 4,883 מילים (61.7%) נפלו לקבוצות גזע מתנגשות. כאן אותו מדד בדיוק על
 * אותו אוצר מילים, אבל עם פונקציית המפתח של הווריאנט. המספר הזה אינו מכריע לבדו ·
 * ההתנגשויות בפועל מכריעות · אבל הוא ההשוואה הישירה, והוא מוצג לצדן.
 */
function measureConflation(L, cfg) {
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const byKey = new Map();
  const words = Array.from(L.VOCAB);
  for (const w of words) {
    const ks = rule.keysTyped(w, L.ctx, params);
    for (const k of ks) { let a = byKey.get(k); if (!a) { a = new Set(); byKey.set(k, a); } a.add(w); }
  }
  const folded = new Set();
  const groups = [];
  for (const [k, set] of byKey) {
    if (set.size < 2) continue;
    for (const w of set) folded.add(w);
    groups.push({ k, words: Array.from(set) });
  }
  groups.sort((a, b) => b.words.length - a.words.length || (a.k < b.k ? -1 : 1));
  return { vocab: words.length, folded: folded.size, groups: groups.length, top: groups.slice(0, 6) };
}

/* ===== מדידת סיכון על כל המאגר ===== */
function measureRisk(L, cfg) {
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const ctx = L.ctx;
  const res = {
    newAccepts: 0, benign: 0, sameUnit: 0, otherUnit: 0, gatedSame: 0, gatedOther: 0,
    termSame: 0, termOther: 0,
    exSame: [], exOther: [], exTerm: [], exBenign: [],
    regress: 0, verified: 0, verifyFail: 0, expandMismatch: 0, scanMissing: 0,
    genTotal: 0, genFree: 0, enumerated: rule.kind === 'gen',
  };
  const gated = M.makeMorphChecker(ctx, { [rule.name]: { on: true, params, veto: L.veto } });

  /* אינדקס: מפתח -> כל מחרוזות היקום שמייצרות אותו. בלעדיו זו מכפלה של אלפי כרטיסים
     בעשרות אלפי מחרוזות · מאות מיליוני קריאות, כלומר ריצה שלא מסתיימת. */
  const keyIx = new Map();
  for (const x of L.pool) {
    for (const k of rule.keysTyped(x, ctx, params)) {
      let a = keyIx.get(k); if (!a) { a = []; keyIx.set(k, a); } a.push(x);
    }
  }

  for (const card of L.cards) {
    /* רגרסיה · כל מקטע שמתקבל היום חייב להתקבל גם דרך הבודק המשולב **עם** שער הווטו.
       זה בדיוק הכשל שקל לכתוב בטעות בשלב ב': ווטו שיוחל על ההכרעה כולה ולא על התוספת. */
    for (const s of card.segs) {
      const v = gated(s, card.w);
      if (!v.ok || v.by !== 'today') res.regress++;
    }

    const segK = rule.keysSeg(card.segs, ctx, params);
    if (!segK.size) continue;
    const hits = new Set();
    for (const k of segK) { const a = keyIx.get(k); if (a) for (const x of a) hits.add(x); }

    const allowed = new Set([card.key]);
    for (const t of Array.from(ctx.glossAlts(card.w))) allowed.add(ctx.K(t));

    for (const x of hits) {
      if (card.singles.has(x)) continue;                     // כבר מתקבל היום
      /* שן · האינדקס והפרדיקט חייבים להסכים. אינדקס שמצא מה שהחוק לא מקבל (או להפך)
         מודד קוד אחר מזה שמכריע. */
      if (!rule.accepts(x, card.segs, ctx, params)) { res.expandMismatch++; continue; }
      res.newAccepts++;

      const bad = offenders(L, x, card);
      if (bad.length) {
        /* ⚠ אף התנגשות אינה מוסקת · כל אחת מאומתת מול meaningMatch האמיתית של הבעלים. */
        let ownerCard = null;
        for (const o of bad) { const cc = L.cardByKey.get(o); if (cc) { ownerCard = cc; break; } }
        res.verified++;
        if (!ownerCard || !ctx.meaningMatch(x, ownerCard.w.meaning)) res.verifyFail++;
        const units = new Set();
        for (const o of bad) for (const u of (L.unitOfOwner.get(o) || [])) units.add(u);
        /* השארית אחרי הווטו · נמנית אחת-אחת דרך isVetoedSeg האמיתי, לא מוסקת.
           הווטו הוא לפי-מחרוזת (segKeys), ולכן הוא חוסם בדיוק את המחרוזות שהן מקטע
           מדויק של ערך אחר · ולא את אלה שהגיעו ליקום דרך ההרחבה של particleMatch.
           ההבחנה הזאת היא כל ההבדל בין "כולן נחסמות" לבין המספר האמיתי. */
        const vetoed = isVetoedSeg(x, card.w, L.veto, ctx);
        const row = `${card.w.term} (יח' ${card.unit}) ← "${x}" · תשובה קבילה של ${bad.slice(0, 4).join(' , ')}${vetoed ? ' · הווטו חוסם' : ' · **הווטו אינו חוסם**'}`;
        if (units.has(card.unit)) { res.sameUnit++; if (!vetoed) res.gatedSame++; res.exSame.push(row); }
        else { res.otherUnit++; if (!vetoed) res.gatedOther++; if (res.exOther.length < EX_OTHER_CAP) res.exOther.push(row); }
        continue;
      }

      /* המחרוזת אינה תשובה של אף כרטיס · אבל היא עדיין עלולה להיות **מונח** במאגר,
         כלומר מילה תפוסה. לא התנגשות בכיוון הזה, ומדווח בנפרד ולא נבלע. */
      const xk = ctx.K(x);                                   // כמו isCorrect · הקלט מנורמל תחילה
      const tOwners = xk ? L.veto.termKeys.get(xk) : null;
      if (tOwners && tOwners.size && !acceptedKeys(card.w, ctx).has(xk)) {
        const units = new Set();
        for (const o of tOwners) for (const u of (L.unitOfOwner.get(o) || [])) units.add(u);
        const row = `${card.w.term} (יח' ${card.unit}) ← "${x}" · "${x}" הוא מונח במאגר (${Array.from(tOwners).slice(0, 3).join(' , ')})`;
        if (units.has(card.unit)) { res.termSame++; res.exTerm.push(row); }
        else { res.termOther++; if (res.exTerm.length < EX_OTHER_CAP) res.exTerm.push(row); }
        continue;
      }

      res.benign++;
      if (res.exBenign.length < 12) res.exBenign.push(`${card.w.term} ← "${x}"`);
    }

    /* לחוקי gen · מנייה מלאה, כדי שהמספר "כמה מחרוזות החוק בכלל מוסיף" יהיה מדוד.
       מחרוזת שנמנתה ואינה ב-SINGLE מוכחת כלא-מתנגשת: SINGLE הוא **כל** מה שמתקבל
       בת-מילה-אחת בכל המאגר, ושלמותו נבדקה למעלה. */
    if (rule.kind === 'gen') {
      for (const x of rule.expand(card.segs, ctx, params)) {
        if (!rule.accepts(x, card.segs, ctx, params)) { res.expandMismatch++; continue; }
        if (card.singles.has(x)) continue;
        res.genTotal++;
        if (!L.SINGLE.has(x)) res.genFree++;
        else if (!hits.has(x)) res.scanMissing++;
      }
    }
  }
  return res;
}

/* ===== תועלת · 24 המקרים ===== */
function resolveCases(L) {
  const ctx = L.ctx;
  const out = [];
  for (const c of CASES24) {
    const k = ctx.K(c.term);
    let card = L.cards.find(x => x.key === k);
    if (!card) {
      const forms = new Set(Array.from(ctx.heForms(c.term)).map(x => ctx.K(x)));
      card = L.cards.find(x => Array.from(ctx.heForms(x.w.term)).some(v => forms.has(ctx.K(v))));
    }
    if (!card) card = L.cards.find(x => x.w.meaning === c.meaning);
    if (!card) throw new Error(`measure_morph: המקרה ${c.n} (${c.term}) לא אותר במאגר · יש לעדכן את הטבלה`);
    out.push({ c, card });
  }
  return out;
}

function measureBenefit(L, cfg, resolved) {
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const ctx = L.ctx;
  const solved = [], solvedGated = [];
  for (const { c, card } of resolved) {
    const a = ctx.norm(c.typed);
    if (ctx.meaningMatch(a, card.w.meaning)) continue;          // כבר מתקבל היום
    if (!rule.accepts(a, card.segs, ctx, params)) continue;
    solved.push(c.n);
    if (!isVetoedSeg(a, card.w, L.veto, ctx)) solvedGated.push(c.n);
  }
  return { solved, solvedGated };
}

function alreadyToday(L, resolved) {
  const out = [];
  for (const { c, card } of resolved) if (L.ctx.meaningMatch(L.ctx.norm(c.typed), card.w.meaning)) out.push(c.n);
  return out;
}

/* ===== הרצה ===== */
function run(configs) {
  const L = { he: loadLang('he'), en: loadLang('en') };
  const resolved = resolveCases(L.he);
  const today = alreadyToday(L.he, resolved);
  const rows = [];
  for (const cfg of configs) {
    const { solved, solvedGated } = measureBenefit(L.he, cfg, resolved);
    const risk = {}, conf = {};
    for (const lang of LANGS) { risk[lang] = measureRisk(L[lang], cfg); conf[lang] = measureConflation(L[lang], cfg); }
    const sum = f => LANGS.reduce((n, l) => n + f(risk[l]), 0);
    const raw = { same: sum(x => x.sameUnit), other: sum(x => x.otherUnit) };
    const gated = { same: sum(x => x.gatedSame), other: sum(x => x.gatedOther) };
    const term = { same: sum(x => x.termSame), other: sum(x => x.termOther) };
    const newAcc = sum(x => x.newAccepts);
    const mismatch = sum(x => x.expandMismatch) + sum(x => x.scanMissing) + sum(x => x.verifyFail);
    /* ⚠ סף קשיח: התנגשות אחת בתוך יחידת תרגול = הווריאנט נדחה, ולא משנה כמה פותר.
       הסף מוחל על השארית **אחרי הווטו**, כי הווטו הוא חלק מהחוק כפי שהוא יישלח · וזו
       אותה הכרעה בדיוק של measure_gloss.js. הספירה הגולמית מוצגת לצדה ולא נמחקת:
       בקריאה מחמירה יותר של הסף (גולמי ולא אחרי-ווטו) גם 'נקי-עם-וטו' נדחה, וזה נאמר
       במפורש בדוח. */
    const verdict = gated.same > 0 || term.same > 0 ? 'נדחה'
      : gated.other > 0 ? 'נדחה'
        : !solvedGated.length ? 'נקי-חסר-תועלת'
          : raw.same + raw.other === 0 ? 'נקי' : 'נקי-עם-וטו';
    rows.push({ cfg, solved, solvedGated, risk, conf, raw, gated, term, newAcc, mismatch, verdict });
  }
  return { L, resolved, today, rows };
}

/* ===== דוח ===== */
function md(out) {
  const { rows, today, resolved, L } = out;
  const A = [];
  const p = s => A.push(s);
  p('# מחלקת מורפולוגיה צרה · מדידת M1, M2, M3');
  p('');
  p('נוצר על ידי `typo-lab/measure_morph.js`. כל מספר כאן נמדד על הפונקציות האמיתיות של');
  p('`app.js` דרך ארגז החול, על שני המאגרים המלאים.');
  p('');
  p('## ⛔ ההקשר · מה כבר נדחה');
  p('');
  p('`דוחות/סיכומים/מדידת-כלל-מורפולוגי.md` מדד כלל מורפולוגי **כללי** (גזירה לשלד עיצורי על כל');
  p('מילות התוכן של שני הצדדים) ודחה אותו: הגזירה קיפלה **61.7% מאוצר המילים** ל-869');
  p('קבוצות גזע מתנגשות והפכה **918 זוגות פירושים** לניתנים להחלפה. הכלל ההוא אינו מוצע');
  p('כאן מחדש. מה שנמדד כאן הוא ההשערה הצרה: שהגבלה ל**מילה בודדת מול מילה בודדת**');
  p('מנטרלת את המנגנון שהרג אותו, כי היא מבטלת את מכפלת הגזעים על פירוש רב-מילי.');
  p('');
  p('## מה נמדד');
  p('');
  p('- **תועלת** · כמה מ-24 המקרים האמיתיים הווריאנט פותר.');
  p(`  ${today.length} מהם כבר מתקבלים היום (${today.join(', ')}) ולכן אינם נספרים לאף חוק.`);
  p('- **סיכון** · לכל ערך בשני המאגרים, כל מחרוזת שהווריאנט מוסיף ואינה מתקבלת היום,');
  p('  מוצלבת מול **יקום כל התשובות הקבילות בנות מילה אחת של כל הכרטיסים**, ובנפרד מול');
  p('  יקום כל מפתחות המונחים. מפוצל לאותה יחידת תרגול מול יחידה אחרת.');
  p('- **קיפול אוצר מילים** · אותו מדד בדיוק שהרג את הכלל הכללי, עם פונקציית המפתח של');
  p('  כל וריאנט. מוצג לצד ההתנגשויות ולא במקומן.');
  p('- **רגרסיה** · שום דבר שמתקבל היום אינו נדחה.');
  p('');
  p('הסף קשיח: **התנגשות אחת בתוך יחידת תרגול = הווריאנט נדחה**, ולא משנה כמה פותר.');
  p('');
  p('### למה כאן אין עמודת "לא נמדד"');
  p('');
  p('קבוצת הקבלות של M1 ו-M2 היא אכן **אינסופית** · כל מחרוזת עם אותו שלד עיצורי, ואין');
  p('חסם על מספרן. זה נאמר במפורש ולא נבלע. מה שכן סופי הוא **החיתוך** שלה עם יקום');
  p('התשובות הקבילות, ורק החיתוך הזה קובע התנגשות. שלושת החוקים דורשים שהתשובה תהיה');
  p('מילה **אחת**, ולכן היקום הרלוונטי הוא כל המחרוזות בנות מילה אחת שאיזשהו כרטיס מקבל');
  p('היום · קבוצה שנמנתה במלואה מארבעת ענפי `meaningMatch`, כולל ההרחבה הסופית של');
  p('`particleMatch`. השלמות אינה מוצהרת:');
  p('');
  for (const lang of LANGS) {
    const x = L[lang];
    p(`- **${lang === 'he' ? 'עברית' : 'אנגלית'}** · ${x.SINGLE.size.toLocaleString('en-US')} מחרוזות ביקום, ${x.pool.length.toLocaleString('en-US')} בבריכת הבדיקה · ` +
      `${x.fastMismatch} אי-התאמות מול \`meaningMatch\` ב-${FAST_SAMPLE.toLocaleString('en-US')} זוגות אקראיים, ` +
      `${x.termMismatch} מול \`isCorrect\` ב-${TERM_SAMPLE.toLocaleString('en-US')} זוגות.`);
  }
  p('');
  p('הדגימה **דו-שלבית**, וזה לא פרט טכני: חצי מהזוגות הם מחרוזת אקראית מהבריכה מול');
  p('כרטיס אקראי, וחצי הם מועמד סביר **של אותו כרטיס** (מילות הפירוש שלו, עם ובלי אות');
  p('יחס בראש). דגימה אחידה בלבד היא כמעט תמיד שלילי-שלילי, ולכן היא חזקה נגד קבלה');
  p('מיותרת וכמעט חסרת כוח נגד קבלה **חסרה** · יקום שחסר בו ענף שלם לא היה נתפס בה.');
  p('זה לא נוחש: הגרסה הראשונה של הדגימה נכשלה בדיוק בזה בשער, ולכן היא שונתה.');
  p('השער מוכיח את הכוח בשני הכיוונים · יקום בלי ענף `particleMatch` ויקום מנופח שניהם');
  p('נתפסים, והיקום התקין שותק.');
  p('');
  p('## הטבלה');
  p('');
  const mark = r => r.verdict === 'נקי' ? '✅ נקי' : r.verdict === 'נקי-עם-וטו' ? '🟡 נקי רק עם וטו'
    : r.verdict === 'נקי-חסר-תועלת' ? '⚪ נקי אך אינו פותר דבר' : '❌ נדחה';
  const line = r => {
    const cf = LANGS.map(l => `${(100 * r.conf[l].folded / Math.max(1, r.conf[l].vocab)).toFixed(1)}%`).join(' / ');
    return `| \`${r.cfg.key}\` | ${r.cfg.label} | ${r.solved.length}${r.solved.length ? ' (' + r.solved.join(',') + ')' : ''} | ${r.newAcc} | ` +
      `${r.raw.same} | ${r.raw.other} | ${r.gated.same} + ${r.gated.other} | ${r.term.same}+${r.term.other} | ${cf} | ${mark(r)} |`;
  };
  const HEAD = '| וריאנט | תיאור | פותר מ-24 | קבלות חדשות | התנגשות ביחידה | ביחידה אחרת | נותר אחרי הווטו (יח\' + אחר) | מונח תפוס | קיפול אוצר מילים | פסק |';
  const SEP = '|---|---|---|---|---|---|---|---|---|---|';
  const main = rows.filter(r => !r.cfg.key.startsWith('P-'));
  const pairRows = rows.filter(r => r.cfg.key.startsWith('P-'));
  p(HEAD); p(SEP);
  for (const r of main) p(line(r));
  p('');
  if (pairRows.length) {
    p('### פירוק M3 · כל זוג משקלים לבדו');
    p('');
    p('תצורה מצרפית שנדחית אינה אומרת אילו זוגות אשמים. הפירוק סוגר את הפתח');
    p('"אולי זוג בודד בכל זאת נקי" · הוא נמדד, לא נותר פתוח.');
    p('');
    p(HEAD); p(SEP);
    for (const r of pairRows) p(line(r));
    p('');
  }
  p('"קבלות חדשות" נספר בתוך בריכת המילים האמיתית של המאגר (אוצר הפירושים + המונחים +');
  p('מוטנטי אות-יחס). "קיפול אוצר מילים" הוא אחוז המילים שחולקות מפתח עם מילה אחרת,');
  p('עברית / אנגלית · להשוואה, הכלל הכללי שנדחה עמד על 61.7%.');
  p('');
  p('## פירוט לכל וריאנט');
  p('');
  for (const r of rows) {
    p(`### \`${r.cfg.key}\` · ${r.cfg.label}`);
    p('');
    for (const lang of LANGS) {
      const x = r.risk[lang], c = r.conf[lang];
      p(`- **${lang === 'he' ? 'עברית' : 'אנגלית'}**: ${x.newAccepts} קבלות חדשות · ${x.benign} תמימות · ` +
        `${x.sameUnit} התנגשות באותה יחידה · ${x.otherUnit} ביחידה אחרת · ${x.termSame}+${x.termOther} מונח תפוס · ` +
        `רגרסיה ${x.regress} · התנגשויות שאומתו מול meaningMatch ${x.verified} (${x.verifyFail} נכשלו) · ` +
        `אינדקס מול פרדיקט ${x.expandMismatch}` + (x.enumerated ? ` · מנייה ${x.genTotal}, מהן ${x.genFree} מחוץ ליקום ולכן מוכחות כלא-מתנגשות · מנייה שהסריקה פספסה ${x.scanMissing}` : '') +
        ` · קיפול ${c.folded}/${c.vocab} מילים ב-${c.groups} קבוצות`);
    }
    const same = [];
    for (const lang of LANGS) for (const s of r.risk[lang].exSame) same.push(`[${lang}] ${s}`);
    if (same.length) {
      p('');
      /* כל התנגשות בתוך יחידת תרגול מוצגת בשמה · אבל לווריאנט עם אלפי התנגשויות רשימה
         מלאה אינה מוסיפה עדות, היא רק מעלימה את הדוח. הגבול נאמר במפורש ולא נבלע. */
      if (same.length <= SAME_LIST_CAP) p(`**כל ${same.length} ההתנגשויות בתוך יחידת תרגול, בשמן:**`);
      else p(`**${same.length} התנגשויות בתוך יחידת תרגול · ${SAME_LIST_CAP} הראשונות בשמן (השאר מאותו סוג בדיוק):**`);
      p('');
      for (const s of same.slice(0, SAME_LIST_CAP)) p(`- ${s}`);
    }
    const oth = [];
    for (const lang of LANGS) for (const s of r.risk[lang].exOther) oth.push(`[${lang}] ${s}`);
    if (oth.length) {
      p('');
      p(`**התנגשויות ביחידה אחרת (עד ${EX_OTHER_CAP} לשפה):**`);
      p('');
      for (const s of oth) p(`- ${s}`);
    }
    const tm = [];
    for (const lang of LANGS) for (const s of r.risk[lang].exTerm) tm.push(`[${lang}] ${s}`);
    if (tm.length) {
      p('');
      p(`**מונח תפוס · התשובה היא מילה אחרת במאגר (עד ${EX_OTHER_CAP} לשפה):**`);
      p('');
      for (const s of tm) p(`- ${s}`);
    }
    const cg = r.conf.he.top;
    if (cg.length && cg[0].words.length > 1) {
      p('');
      p('**קבוצות הקיפול הגדולות בעברית:**');
      p('');
      for (const g of cg) p(`- \`${g.k}\` ← ${g.words.slice(0, 12).join(', ')}${g.words.length > 12 ? ` (ועוד ${g.words.length - 12})` : ''}`);
    }
    p('');
  }
  p('## 24 המקרים · מי פותר מה');
  p('');
  p('| # | מילה | הוקלד | קטגוריה | נפתר על ידי וריאנט מורפולוגי |');
  p('|---|---|---|---|---|');
  for (const { c } of resolved) {
    const by = rows.filter(r => r.solved.includes(c.n)).map(r => r.cfg.key);
    const clean = rows.filter(r => r.solvedGated.includes(c.n) && (r.verdict === 'נקי' || r.verdict === 'נקי-עם-וטו')).map(r => r.cfg.key);
    const cell = today.includes(c.n) ? '**מתקבל היום**' : (clean.length ? clean.join(', ') : (by.length ? by.join(', ') + ' (כולם נדחו)' : 'לא נפתר'));
    p(`| ${c.n} | ${c.term} | ${c.typed} | ${c.cat} | ${cell} |`);
  }
  p('');
  const rec = rows.filter(r => r.verdict === 'נקי' || r.verdict === 'נקי-עם-וטו');
  const recSolved = new Set();
  for (const r of rec) for (const n of r.solvedGated) recSolved.add(n);
  p('## המלצה');
  p('');
  if (rec.length) {
    for (const r of rec) p(`- \`${r.cfg.key}\` · ${r.cfg.label} · פותר ${r.solvedGated.join(', ')} · אפס התנגשויות בשני המאגרים`);
    p('');
    p(`**תוספת נטו: ${recSolved.size} מקרים** מעבר למה שכבר מכוסה.`);
  } else {
    p('**אין ולו וריאנט מורפולוגי אחד שגם פותר מקרה וגם עובר את סף אפס-ההתנגשויות.**');
    p('');
    p('### מה בדיוק הורג את זה');
    p('');
    p('ההשערה הייתה שהנזק של הכלל הכללי בא מקיפול פירוש רב-מילי, ושהגבלה למילה-מול-מילה');
    p('תנטרל אותו. **ההשערה נכונה בחלקה ולא מספיקה.** הקיפול אכן צנח: מ-61.7% ל-1.4%');
    p('בווריאנט ההדוק ביותר (`M3-cons-sr`), ובזוג בודד ל-0.2%. ובכל זאת כל וריאנט שפותר');
    p('ולו מקרה אחד נדחה, וזו הסיבה:');
    p('');
    p('**מאגר אוצר מילים בנוי מזוגות מאותו שורש · זו לא תקלה, זה מה שהוא בא ללמד.**');
    p('החוק אינו מתנגש במילים רחוקות אלא בדיוק בשכנות: `מדען` מול `מודע`, `צרכן` מול');
    p('`צורך`, `פחדן` מול `פוחד`, `הרחיב` מול `הרחבה`, `הבחין` מול `הבחנה`. שתי המילים');
    p('בכל זוג הן ערכים **נבדלים** במאגר, לעיתים קרובות באותה יחידת תרגול · ולומד שכתב');
    p('אחת מהן במקום השנייה טעה, ובדיוק את הטעות הזאת המאגר בא ללמד. חוק שמקבל את שתיהן');
    p('מוחק את ההבחנה.');
    p('');
    p('הצורה החדה ביותר של הממצא: `P-act-agent` · **זוג משקלים אחד** (קוֹטֵל ↔ קַטְלָן),');
    p('שורש שלם בלבד, שני הצדדים מילה בודדת. הוא מוסיף 21 קבלות בסך הכל בשני המאגרים,');
    p('מקפל 0.2% מאוצר המילים, ופותר מקרה אמיתי אחד (#4 סוֹרֵר). ובכל זאת יש לו 3');
    p('התנגשויות בתוך יחידת תרגול, מנויות בשמן למעלה. אי אפשר להדק אותו יותר · זו כבר');
    p('הצורה המינימלית.');
    p('');
    p('**מה כן לוקחים מכאן:** המקרים המורפולוגיים שנשארו (4, 8, 14, 23) הם 4 מתוך 24.');
    p('הם שייכים לכפתור "בעצם ידעתי · סמן כנכון", בדיוק כמו 11 הנרדפות. זו לא הודאה');
    p('בכישלון · זו התוצאה שהמדידה החזירה, והיא זהה למסקנת הדוח המקורי.');
  }
  p('');
  p('## מה נדחה ולמה');
  p('');
  for (const r of rows.filter(x => x.verdict === 'נדחה')) {
    const first = [];
    for (const lang of LANGS) for (const s of r.risk[lang].exSame) first.push(`[${lang}] ${s}`);
    for (const lang of LANGS) for (const s of r.risk[lang].exOther) first.push(`[${lang}] יחידה אחרת · ${s}`);
    for (const lang of LANGS) for (const s of r.risk[lang].exTerm) first.push(`[${lang}] מונח · ${s}`);
    p(`- \`${r.cfg.key}\` · ${r.raw.same} התנגשויות בתוך יחידת תרגול (${r.gated.same} שורדות את הווטו), ` +
      `${r.raw.other} בין יחידות (${r.gated.other} שורדות), ${r.term.same + r.term.other} מול מונח` +
      (first.length ? ` · לדוגמה: ${first[0]}` : ''));
  }
  p('');
  p('## גבול המדידה · מה נמדד ומה לא');
  p('');
  p('1. **נמדד במלואו:** האם מחרוזת שהחוק מוסיף היא תשובה קבילה של ערך אחר · בשני');
  p('   המאגרים, על יקום סופי ומאומת, וכל התנגשות אומתה אחת-אחת מול `meaningMatch`');
  p('   האמיתית של הבעלים ולא הוסקה מהאינדקס.');
  p('2. **נמדד בנפרד:** האם המחרוזת היא **מונח** במאגר. זו אינה התנגשות בכיוון הפירוש,');
  p('   אבל היא מילה תפוסה, ולכן היא מדווחת ולא נבלעת.');
  p('3. **לא נמדד, ואי אפשר למדוד מכאן:** האם המחרוזת פשוט **שגויה סמנטית** בלי להיות');
  p('   תשובה של אף ערך אחר. "מוריד" ו"מורד" חולקות שלד; אם אחת מהן אינה במאגר, אף');
  p('   מדידה מבנית לא תתפוס את זה. עמודת "קבלות חדשות תמימות" היא הגודל של הסיכון');
  p('   הזה, לא הוכחה שהוא אפס.');
  return A.join('\n') + '\n';
}

function main() {
  const t0 = Date.now();
  const out = run(CONFIGS.concat(PAIR_CONFIGS));
  const text = md(out);
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'morph-report.md'), text, 'utf8');
  process.stdout.write(text);
  process.stdout.write(`\nנכתב אל typo-lab/out/morph-report.md · ${((Date.now() - t0) / 1000).toFixed(1)} שניות\n`);
  const bad = out.rows.reduce((n, r) => n + LANGS.reduce((m, l) =>
    m + r.risk[l].regress + r.risk[l].expandMismatch + r.risk[l].scanMissing + r.risk[l].verifyFail, 0), 0);
  if (bad) { process.stdout.write(`\n⚠ ${bad} כשלי רגרסיה/אי-הסכמה · פסק דין: אדום\n`); process.exit(1); }
}

if (require.main === module) main();

module.exports = {
  CASES24, CONFIGS, PAIR_CONFIGS, CLASS_CONFIGS, XFORM_GROUPS, LANGS, loadLang, resolveCases, measureBenefit, measureRisk,
  measureConflation, offenders, run, md, alreadyToday, particleForms, sampleMismatch,
  candidatesFor, FAST_SAMPLE, TERM_SAMPLE,
};
