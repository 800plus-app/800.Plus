'use strict';
/* מדידת חוקי צד-הפירוש · תועלת מול סיכון, מספר לכל חוק בנפרד.
 *
 * שלוש שאלות, ולכל אחת מספר שאפשר להתווכח איתו:
 *   תועלת   כמה מ-24 המקרים האמיתיים שחגי צילם החוק פותר.
 *   סיכון   כמה מחרוזות שהחוק *מוסיף* הן תשובה לגיטימית של ערך אחר · נמדד על כל
 *           המאגר, בשתי השפות, ולא על 24 השורות.
 *   רגרסיה  ששום דבר שמתקבל היום אינו נדחה. תוספתי מבנית, ונבדק בכל זאת.
 *
 * ⚠ 24 המקרים הם ולידציה חיצונית. אסור לכוון עליהם פרמטרים מעבר לדיווח: הם דגימה
 *   שחגי בחר בעצמה כ"מעצבנות מאוד", ולכן הטיה מכוונת לטובת כל חוק שייבנה לפיהם.
 *   מה שמכריע הוא עמודת הסיכון, וסף אפס-התנגשויות הוא קשיח.
 *
 * ===== יקום ההתנגשות · מה נמדד ומה לא =====
 * היקום הוא **כל מקטע פירוש במאגר** (veto.segKeys) · בכיוון w2m הלומד מקליד פירוש,
 * והתשובות הקבילות של ערך הן בדיוק המקטעים שלו. לחוקי 'gen', שקבוצת הקבלות שלהם
 * סופית, נבדקות גם המחרוזות שאינן מקטע בשום מקום · מול meaningMatch האמיתית של כל
 * שאר הכרטיסים ביחידה. לחוקי 'scan' הקבוצה אינסופית, ולכן שם היקום הוא המקטעים
 * המדויקים בלבד. זה הגבול של המדידה והוא נאמר במפורש ולא נבלע.
 *
 * פטור הנרדפות: מקטע שבעליו הוא הכרטיס עצמו או מילה שחולקת איתו פירוש (glossAlts)
 * אינו התנגשות · זו בדיוק ההתנהגות של היום. אותה הכרעה בדיוק כמו ב-veto.js.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { buildVeto, isVetoedSeg } = require('./lib/veto.js');
const G = require('./lib/glossrules.js');

/* ===== 24 המקרים האמיתיים · ולידציה חיצונית =====
 * מקור: דוחות/סיכומים/מדידת-כלל-מורפולוגי.md, הטבלה בשורות 40-65. 24 צילומים של חגי,
 * 5.8.2026. אפס שגיאות כתיב ביניהם: 11 נרדפות, 6 מורפולוגיה, 7 תשובה חלקית,
 * 2 מילה עודפת. הם benchmark ולא סט אימון · לא מכווננים עליהם, רק מדווחים.
 * term הוא כפי שנרשם בדוח; meaning משמש לאיתור כשהמפתח אינו מתאים (מונח עם "/").
 */
const CASES24 = [
  { n: 1, term: 'מְגֻבָּב', meaning: 'ערוך בערימה, מועמס זה על גב זה', typed: 'מסודר בערימה', cat: 'נרדפות' },
  { n: 2, term: 'שִׁיסָּה', meaning: 'גרם למישהו לתקוף אחר, הסית', typed: 'הסית לתקיפה', cat: 'נרדפות' },
  { n: 3, term: 'נִכּוּשׁ', meaning: 'עקירת עשבים שוטים', typed: 'הסרת עשבים שוטים', cat: 'נרדפות' },
  { n: 4, term: 'סוֹרֵר', meaning: 'מרדן, סרבן, חסר משמעת', typed: 'מורד', cat: 'מורפולוגיה' },
  { n: 5, term: 'הִתְחַלָּה', meaning: 'העמיד פני חולה, התחזה לחולה', typed: 'שיחק את עצמו חולה', cat: 'נרדפות' },
  { n: 6, term: 'עָמַד מִנֶּגֶד / מִן הַצַּד', meaning: 'לא התערב', typed: 'נמנע מלהתערב', cat: 'נרדפות' },
  { n: 7, term: 'מְשֻׁנָּן', meaning: 'בעל שיניים או בעל צורה של שיניים', typed: 'בעל שיניים', cat: 'תשובה חלקית' },
  { n: 8, term: 'לֵאוּת', meaning: 'יגעות, עייפות, תשישות', typed: 'עייף', cat: 'מורפולוגיה' },
  { n: 9, term: 'קֻשְׁיָה', meaning: 'שאלה, בעיה, חידה', typed: 'סוגיה', cat: 'נרדפות' },
  { n: 10, term: 'כַּן / כַּנָּה', meaning: 'בסיס שעליו מעמידים דבר כלשהו', typed: 'בסיס שמניחים עליו דברים', cat: 'נרדפות' },
  { n: 11, term: 'לְמַגִּינַת לִבּוֹ', meaning: 'לצערו, למורת רוחו', typed: 'לצערו הרב', cat: 'מילה עודפת' },
  { n: 12, term: 'סַיָּס', meaning: 'עובד המטפל בסוסים', typed: 'עובד באחו מטפל בסוסים', cat: 'מילה עודפת שגויה' },
  { n: 13, term: 'בַּלָּן', meaning: 'עובד בבית המרחץ', typed: 'עובד בבית מרחץ', cat: 'מורפולוגיה' },
  { n: 14, term: 'הִתְעַרְטֵל', meaning: 'פשט את בגדיו; חשף את רגשותיו הכמוסים', typed: 'התפשט', cat: 'מורפולוגיה' },
  { n: 15, term: 'קוֹשֵׁשׁ', meaning: 'אסף עצים או קש למדורה', typed: 'אסף עצים למדורה', cat: 'תשובה חלקית' },
  { n: 16, term: 'נִחַם', meaning: 'התחרט על מה שעשה, הצטער; התנחם', typed: 'התחרט', cat: 'תשובה חלקית' },
  { n: 17, term: 'הֶדְיוֹט', meaning: 'נטול ידיעות בתחום מסוים', typed: 'לא יודע דבר בנושא', cat: 'נרדפות' },
  { n: 18, term: 'מִצְנֶפֶת', meaning: 'כובע בד, מגבעת', typed: 'כובע', cat: 'תשובה חלקית' },
  { n: 19, term: 'הִפְלִיג בְּ-', meaning: 'הגזים והרחיב יתר על המידה בדבר מה', typed: 'הגזים ב', cat: 'תשובה חלקית' },
  { n: 20, term: 'נָדָן', meaning: 'נרתיק החרב', typed: 'נרתיק לחרב', cat: 'מורפולוגיה' },
  { n: 21, term: 'עַלְוָוה', meaning: 'כלל העלים המכסים את העץ', typed: 'כל העלים על העץ', cat: 'נרדפות + חלקית' },
  { n: 22, term: 'קוֹרֶט / קַרְטוֹב', meaning: 'מעט, כמות קטנה', typed: 'קצת', cat: 'נרדפות' },
  { n: 23, term: 'דִּידַקְטִי', meaning: 'שקשור בתחום תורת ההוראה (דידקטיקה - תורת ההוראה)', typed: 'קשור להוראה', cat: 'מורפולוגיה + חלקית' },
  { n: 24, term: 'יַרְכָתַיִם', meaning: 'האזור האחורי והמרוחק ביותר בדבר; חלקה האחורי של אונייה', typed: 'אחורי הסירה', cat: 'נרדפות' },
];

/* ===== התצורות שנמדדות =====
 * כל שורה היא חוק אחד עם ערכי פרמטרים · אף חוק אינו נמדד בתערובת, כדי שאפשר יהיה
 * לייחס כל התנגשות לחוק ולערך פרמטר.
 */
const CONFIGS = [
  { key: 'B1-plain', rule: 'splitOr', params: { mode: 'plain', minSide: 1 }, label: 'פיצול "או" ישיר' },
  { key: 'B1-plain-2', rule: 'splitOr', params: { mode: 'plain', minSide: 2 }, label: 'פיצול "או" ישיר · לפחות 2 מילים בכל צד' },
  { key: 'B1-dist', rule: 'splitOr', params: { mode: 'distributive', minSide: 1 }, label: 'פיצול "או" מחלק (תחילית/סיומת משותפת)' },
  { key: 'B1-dist-2', rule: 'splitOr', params: { mode: 'distributive', minSide: 2 }, label: 'פיצול "או" מחלק · לפחות 2 מילים בכל ליבה' },
  { key: 'B1-plain-a2', rule: 'splitOr', params: { mode: 'plain', minAlt: 2 }, label: 'פיצול "או" ישיר · חלופה בת 2 מילים לפחות' },
  { key: 'B1-dist-a2', rule: 'splitOr', params: { mode: 'distributive', minAlt: 2 }, label: 'פיצול "או" מחלק · חלופה בת 2 מילים לפחות' },
  { key: 'B1-dist-a3', rule: 'splitOr', params: { mode: 'distributive', minAlt: 3 }, label: 'פיצול "או" מחלק · חלופה בת 3 מילים לפחות' },
  {
    key: 'B1-union', rule: 'splitOr', label: 'פיצול "או" מחלק · איחוד שני השומרים (ליבה≥2 או חלופה≥3)',
    params: { mode: 'distributive', guards: [{ minSide: 2, minAlt: 1 }, { minSide: 1, minAlt: 3 }] },
  },

  { key: 'B2-1-0', rule: 'headOfSegment', params: { minWords: 1, minFrac: 0, headMode: 'any' }, label: 'ראש מקטע · N=1 X=0%' },
  { key: 'B2-1-33', rule: 'headOfSegment', params: { minWords: 1, minFrac: 0.33, headMode: 'any' }, label: 'ראש מקטע · N=1 X=33%' },
  { key: 'B2-1-50', rule: 'headOfSegment', params: { minWords: 1, minFrac: 0.5, headMode: 'any' }, label: 'ראש מקטע · N=1 X=50%' },
  { key: 'B2-1-33-mt', rule: 'headOfSegment', params: { minWords: 1, minFrac: 0.33, headMode: 'modifierTail' }, label: 'ראש מקטע · N=1 X=33% זנב-תיאור' },
  { key: 'B2-2-50', rule: 'headOfSegment', params: { minWords: 2, minFrac: 0.5, headMode: 'any' }, label: 'ראש מקטע · N=2 X=50%' },
  { key: 'B2-2-66', rule: 'headOfSegment', params: { minWords: 2, minFrac: 0.66, headMode: 'any' }, label: 'ראש מקטע · N=2 X=66%' },
  { key: 'B2-3-75', rule: 'headOfSegment', params: { minWords: 3, minFrac: 0.75, headMode: 'any' }, label: 'ראש מקטע · N=3 X=75%' },

  { key: 'C1-1-fill', rule: 'extraWord', params: { maxExtra: 1, fillerOnly: true, subsequence: false }, label: 'מילה עודפת · 1, מילת עוצמה בלבד' },
  { key: 'C1-1-fill-seq', rule: 'extraWord', params: { maxExtra: 1, fillerOnly: true, subsequence: true }, label: 'מילה עודפת · 1, מילת עוצמה, סדר נשמר' },
  { key: 'C1-2-fill', rule: 'extraWord', params: { maxExtra: 2, fillerOnly: true, subsequence: false }, label: 'מילה עודפת · 2, מילות עוצמה בלבד' },
  { key: 'C1-1-any', rule: 'extraWord', params: { maxExtra: 1, fillerOnly: false, subsequence: false }, label: 'מילה עודפת · 1, כל מילה' },
  { key: 'C1-2-any', rule: 'extraWord', params: { maxExtra: 2, fillerOnly: false, subsequence: false }, label: 'מילה עודפת · 2, כל מילה' },

  { key: 'D1-base', rule: 'particleLoose', params: { peel: 'הלבכו', minLen: 4, subset: false }, label: 'מילת יחס · זהה ל-particleMatch של היום' },
  { key: 'D1-ms', rule: 'particleLoose', params: { peel: 'הלבכומש', minLen: 4, subset: false }, label: 'מילת יחס · + מ\' ו-ש\'' },
  { key: 'D1-len3', rule: 'particleLoose', params: { peel: 'הלבכו', minLen: 3, subset: false }, label: 'מילת יחס · קילוף גם ממילה בת 3' },
  { key: 'D1-ms-len3', rule: 'particleLoose', params: { peel: 'הלבכומש', minLen: 3, subset: false }, label: 'מילת יחס · + מ\'/ש\' וגם ממילה בת 3' },
  { key: 'D1-sub1', rule: 'particleLoose', params: { peel: 'הלבכומש', minLen: 4, subset: true, maxMissing: 1 }, label: 'מילת יחס · תת-קבוצה, חסרה 1' },
  { key: 'D1-sub2', rule: 'particleLoose', params: { peel: 'הלבכומש', minLen: 4, subset: true, maxMissing: 2 }, label: 'מילת יחס · תת-קבוצה, חסרות 2' },
];

const LANGS = ['he', 'en'];
const EX_CAP = 40;                 // תקרת דוגמאות מפורטות בדוח, כפי שנדרש

/* ===== טעינת שפה · כל האינדקסים פעם אחת ===== */
const langCache = new Map();
function loadLang(lang) {
  const hit = langCache.get(lang); if (hit) return hit;
  const ctx = getCtx(lang);
  const veto = buildVeto(ctx, lang);
  const bank = Array.from(ctx.BANK);

  const cards = bank.map(w => {
    const segs = Array.from(ctx.meaningSegs(w.meaning));
    return {
      w, key: ctx.K(w.term), unit: String(w.unit), segs, segSet: new Set(segs),
      meanNorm: ctx.norm(w.meaning), meanBare: ctx.norm(String(w.meaning).replace(/\([^)]*\)/g, ' ')),
    };
  });
  const byUnit = new Map();
  for (const c of cards) { let a = byUnit.get(c.unit); if (!a) { a = []; byUnit.set(c.unit, a); } a.push(c); }
  const unitOfOwner = new Map();
  for (const c of cards) { let s = unitOfOwner.get(c.key); if (!s) { s = new Set(); unitOfOwner.set(c.key, s); } s.add(c.unit); }

  /* יקום ההתנגשות: כל מקטע פירוש במאגר. */
  const U = Array.from(veto.segKeys.keys());
  const uSet = new Set(U);
  const st = G.stopOf(ctx);
  const uWords = U.map(s => G.wordsOf(s));
  const uCut = uWords.map(ws => ws.filter(x => !st.has(x)));

  /* אינדקס למילה עודפת: המקטע חייב להיות מוכל בתשובה, ולכן כל מילת תוכן של המקטע
     חייבת להופיע בה. מספיק לעבור על רשימת המועמדים של המילה הנדירה ביותר. */
  const byWord = new Map();
  uCut.forEach((cut, i) => { for (const w of new Set(cut)) { let a = byWord.get(w); if (!a) { a = []; byWord.set(w, a); } a.push(i); } });

  /* אינדקס למילת יחס: peel מוריד את האות ה*ראשונה* בלבד, ולכן בכל ארבעת ענפי eq
     האות האחרונה של שתי המילים זהה. חתימה = מספר מילים + רב-קבוצת האותיות האחרונות.
     מסנן נכון (superset) ולא היוריסטיקה: זוג שאינו חולק חתימה אינו יכול להתאים. */
  const sigOf = cut => cut.length + '|' + cut.map(w => w[w.length - 1]).sort().join('');
  const bySig = new Map();
  uCut.forEach((cut, i) => { if (!cut.length) return; const s = sigOf(cut); let a = bySig.get(s); if (!a) { a = []; bySig.set(s, a); } a.push(i); });
  const byCount = new Map();
  uCut.forEach((cut, i) => { let a = byCount.get(cut.length); if (!a) { a = []; byCount.set(cut.length, a); } a.push(i); });

  /* אינדקס ליחידה, לבדיקת "האם מחרוזת כלשהי היא תשובה קבילה של כרטיס אחר ביחידה".
     בלעדיו הבדיקה הזאת היא meaningMatch לכל כרטיס ביחידה לכל מחרוזת · עשרות מיליוני
     קריאות. הפילטר על חתימת האות האחרונה נכון (superset) ולא היוריסטי, כי particleMatch
     מקלף את האות הראשונה בלבד. */
  const out0 = new Map();
  for (const c of cards) {
    const u = c.unit;
    let ix = out0.get(u);
    if (!ix) { ix = { exact: new Map(), sig: new Map() }; out0.set(u, ix); }
    const put = (m, k, v) => { if (!k) return; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(v); };
    put(ix.exact, c.meanNorm, { c });
    put(ix.exact, c.meanBare, { c });
    for (const s of c.segs) {
      put(ix.exact, s, { c });
      const cut = G.wordsOf(s).filter(x => !st.has(x));
      if (cut.length) put(ix.sig, sigOf(cut), { c, s });
    }
  }

  const out = { lang, ctx, veto, bank, cards, byUnit, unitOfOwner, U, uSet, uCut, byWord, byCount, bySig, sigOf, st, unitIx: out0 };
  validateFast(out);
  langCache.set(lang, out);
  return out;
}

/* שיקוף מדויק של meaningMatch (app.js:1257) על ערכים שחושבו מראש · אותו סדר, אותם
   ארבעה ענפים. לא "בערך אותו דבר": השקילות נבדקת בפועל למטה על 200,000 זוגות אקראיים,
   וריצה שנופלת בה מסמנת אדום. בלי השיקוף, המדידה על עשרות מיליוני זוגות בלתי אפשרית. */
/* הצורה הקנונית · מילות התוכן בלבד. particleMatch מתעלם ממילות היחס העצמאיות בשני
   הצדדים, ולכן שתי מחרוזות שנבדלות רק בהן הן אותה תשובה לכל דבר. */
function canon(L, x) { return G.wordsOf(x).filter(w => !L.st.has(w)).join(' '); }

function fastAccepts(L, x, card) {
  if (!x) return false;
  if (x === card.meanNorm || x === card.meanBare) return true;
  if (card.segSet.has(x)) return true;
  for (const s of card.segs) if (L.ctx.particleMatch(x, s)) return true;
  return false;
}

const FAST_SAMPLE = 200000;
function validateFast(L) {
  const { rngFor, randInt } = require('./lib/rng.js');
  const rnd = rngFor('measure_gloss', 'fast', L.lang);
  let bad = 0, badEx = null;
  for (let n = 0; n < FAST_SAMPLE; n++) {
    const x = L.U[randInt(rnd, L.U.length)];
    const c = L.cards[randInt(rnd, L.cards.length)];
    if (fastAccepts(L, x, c) !== L.ctx.meaningMatch(x, c.w.meaning)) { bad++; if (!badEx) badEx = `${c.w.term} <- "${x}"`; }
  }
  L.fastMismatch = bad;
  if (bad) throw new Error(`measure_gloss: fastAccepts אינו שקול ל-meaningMatch · ${bad}/${FAST_SAMPLE} אי-התאמות, לדוגמה ${badEx}`);
}

/* מי הבעלים ה*מפריעים* של מקטע עבור כרטיס נתון · אותה הכרעה של isVetoedSeg, אבל
   מחזירה שמות. השקילות מול isVetoedSeg נאכפת בכל קריאה (assertVeto), כדי ששתי
   הפונקציות לא ייפרדו בשקט. */
function offenders(L, seg, card) {
  const owners = L.veto.segKeys.get(seg);
  if (!owners || !owners.size) return [];
  if (card.segSet.has(seg)) return [];
  const allowed = new Set([card.key]);
  for (const t of Array.from(L.ctx.glossAlts(card.w))) allowed.add(L.ctx.K(t));
  const bad = [];
  for (const o of owners) if (!allowed.has(o)) bad.push(o);
  return bad;
}

/* ===== מועמדים לחוקי scan · מסננים נכונים בלבד ===== */
function scanCandidates(L, rule, params, card) {
  const idx = new Set();
  for (const seg of card.segs) {
    const cut = G.wordsOf(seg).filter(x => !L.st.has(x));
    if (!cut.length) continue;
    if (rule.name === 'extraWord') {
      let best = null;
      for (const w of new Set(cut)) { const a = L.byWord.get(w); if (!a) { best = []; break; } if (!best || a.length < best.length) best = a; }
      if (best) for (const i of best) idx.add(i);
    } else if (rule.name === 'particleLoose') {
      if (!params.subset) { const a = L.bySig.get(L.sigOf(cut)); if (a) for (const i of a) idx.add(i); }
      else {
        const maxMissing = params.maxMissing || 0;
        for (let c = Math.max(1, cut.length - maxMissing); c <= cut.length; c++) {
          const a = L.byCount.get(c); if (a) for (const i of a) idx.add(i);
        }
      }
    } else throw new Error('scanCandidates: אין מסנן לחוק ' + rule.name);
  }
  return idx;
}

/* ===== מדידת סיכון על כל המאגר ===== */
function measureRisk(L, cfg) {
  const rule = G.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const ctx = L.ctx;
  const res = {
    newAccepts: 0, benign: 0, sameUnit: 0, otherUnit: 0, freeChecked: 0, freeCollisions: 0,
    freeSameUnit: 0, exSame: [], exOther: [], exFree: [], vetoMismatch: 0, regress: 0,
    expandMismatch: 0, scanMissing: 0, enumerated: false,
  };
  /* בודק משולב עם שער הווטו · נבנה פעם אחת לתצורה ומשמש לבדיקת הרגרסיה. הוא הצורה
     שבה החוק באמת יישלח: meaningMatch קודם, החוק אחריו, והווטו חוסם רק את התוספת. */
  const gated = G.makeGlossChecker(ctx, { [rule.name]: { on: true, params, veto: L.veto } });

  for (const card of L.cards) {
    /* רגרסיה · אינווריאנט תוספתיות עם שיניים: כל מקטע שמתקבל היום חייב להתקבל גם דרך
       הבודק המשולב *עם* שער הווטו. אם הווטו יוחל על ההכרעה כולה ולא רק על התוספת,
       השורה הזאת נופלת · וזה בדיוק הכשל שקל לכתוב בטעות בשלב ב'. */
    for (const s of card.segs) {
      const v = gated(s, card.w);
      if (!v.ok || v.by !== 'today') res.regress++;
    }

    /* ההתנגשויות *בתוך* היקום נמדדות תמיד בסריקה מלאה על היקום · זו המדידה המדויקת
       והיא אינה תלויה בשום מנייה. המנייה משמשת רק לשאלה השנייה: מה קורה עם מחרוזות
       שאינן מקטע בשום ערך. */
    const hits = [];
    if (rule.kind === 'gen') {
      for (const x of rule.expand(card.segs, ctx, params)) if (L.uSet.has(x)) hits.push(x);
    } else {
      for (const i of scanCandidates(L, rule, params, card)) {
        const x = L.U[i];
        if (rule.accepts(x, card.segs, ctx, params)) hits.push(x);
      }
    }

    let free = null;
    const gen = rule.kind === 'gen' ? rule.expand(card.segs, ctx, params)
      : (rule.finiteExpand ? rule.finiteExpand(card.segs, ctx, params) : null);
    if (gen) {
      res.enumerated = true;
      /* שן א' · כל מחרוזת שנמנתה חייבת להתקבל בפועל. מנייה שאינה תואמת את הפרדיקט
         מודדת קוד אחר מזה שמכריע. */
      free = [];
      const canonHit = new Set(hits.map(x => canon(L, x)));
      for (const x of gen) {
        if (!rule.accepts(x, card.segs, ctx, params)) { res.expandMismatch++; continue; }
        if (!L.uSet.has(x) && !canonHit.has(canon(L, x))) free.push(x);
      }
      /* שן ב' · המנייה חייבת לכסות את כל מה שהסריקה מצאה ביקום, בהשוואה קנונית
         (מילות יחס עצמאיות אינן מבדילות · particleMatch מתעלם מהן ממילא).
         מנייה חסרה הייתה מחביאה בדיוק את מה שהיא אמורה לחשוף. */
      const genCanon = new Set(Array.from(gen).map(x => canon(L, x)));
      /* רק על מה שהחוק באמת *מוסיף* · מקטע שהכרטיס מקבל היום יורד מהמנייה בכוונה
         ("בנוי היטב" הוא גם מקטע בפני עצמו וגם "בנוי" ועוד מילת עוצמה). */
      for (const x of hits) if (!fastAccepts(L, x, card) && !genCanon.has(canon(L, x))) res.scanMissing++;
    }

    for (const x of hits) {
      if (fastAccepts(L, x, card)) continue;                     // כבר מתקבל היום
      res.newAccepts++;
      const bad = offenders(L, x, card);
      const vetoed = isVetoedSeg(x, card.w, L.veto, ctx);
      if ((bad.length > 0) !== vetoed) res.vetoMismatch++;        // שיניים: הסכמה מול veto.js
      if (!bad.length) { res.benign++; continue; }
      const units = new Set();
      for (const o of bad) for (const u of (L.unitOfOwner.get(o) || [])) units.add(u);
      const same = units.has(card.unit);
      const row = `${card.w.term} (יח' ${card.unit}) ← "${x}" · בבעלות ${bad.slice(0, 4).join(' , ')}`;
      if (same) { res.sameUnit++; if (res.exSame.length < EX_CAP) res.exSame.push(row); }
      else { res.otherUnit++; if (res.exOther.length < EX_CAP) res.exOther.push(row); }
    }

    /* לחוקי gen · גם מחרוזת שאינה מקטע בשום מקום עלולה להיות תשובה קבילה של כרטיס
       אחר ביחידה דרך particleMatch. נבדק מול meaningMatch האמיתית. */
    if (free && free.length) {
      const ix = L.unitIx.get(card.unit);
      const allowed = new Set([card.key]);
      for (const t of Array.from(ctx.glossAlts(card.w))) allowed.add(ctx.K(t));
      for (const x of free) {
        if (fastAccepts(L, x, card)) continue;
        res.freeChecked++;
        /* א · שקילות-חלקיקים מול **כל** היקום. מחרוזת שאינה מקטע בשום ערך עדיין
           מתקבלת אצל ערך אחר אם particleMatch מזהה אותה מול מקטע שלו · בדיוק הפרצה
           שווטו לפי-מחרוזת אינו סוגר, ולכן זה מה שנמדד כאן. */
        let hitSeg = null;
        const cut = G.wordsOf(x).filter(w => !L.st.has(w));
        if (cut.length) for (const i of (L.bySig.get(L.sigOf(cut)) || [])) {
          const cand = L.U[i];
          if (cand === x || !ctx.particleMatch(x, cand)) continue;
          if (offenders(L, cand, card).length) { hitSeg = cand; break; }
        }
        /* ב · הפירוש המלא של כרטיס אחר באותה יחידה (norm של המחרוזת כולה, ועם/בלי
           סוגריים) · שני ענפים של meaningMatch שאינם מקטע ולכן אינם ביקום. */
        let mate = null;
        if (!hitSeg) for (const e of (ix.exact.get(x) || [])) if (!allowed.has(e.c.key)) { mate = e.c; break; }
        if (!hitSeg && !mate) continue;
        res.freeCollisions++;
        const units = new Set();
        if (hitSeg) for (const o of offenders(L, hitSeg, card)) for (const u of (L.unitOfOwner.get(o) || [])) units.add(u);
        if (mate) units.add(mate.unit);
        const who = hitSeg ? `שקול ל-"${hitSeg}"` : `הפירוש של ${mate.w.term}`;
        if (units.has(card.unit)) res.freeSameUnit++;
        if (res.exFree.length < EX_CAP) res.exFree.push(`${card.w.term} (יח' ${card.unit}) ← "${x}" · ${who}${units.has(card.unit) ? ' · אותה יחידה' : ' · יחידה אחרת'}`);
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
    /* שיניים: מקרה שלא אותר הוא סחיפת מאגר, לא "מקרה שלא נפתר". נופל בשמו. */
    if (!card) throw new Error(`measure_gloss: המקרה ${c.n} (${c.term}) לא אותר במאגר · יש לעדכן את הטבלה`);
    out.push({ c, card });
  }
  return out;
}

function measureBenefit(L, cfg, resolved) {
  const rule = G.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const ctx = L.ctx;
  const solved = [], solvedGated = [];
  for (const { c, card } of resolved) {
    const a = ctx.norm(c.typed);
    if (ctx.meaningMatch(a, card.w.meaning)) continue;           // כבר מתקבל היום
    if (!rule.accepts(a, card.segs, ctx, params)) continue;
    solved.push(c.n);
    /* התועלת ששורדת את שער הווטו · תשובה שהיא הפירוש של ערך אחר נחסמת גם כשהחוק קיבל
       אותה, ולכן "פותר" בלי הסייג הזה הוא מספר מנופח. */
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
    const risk = {};
    for (const lang of LANGS) risk[lang] = measureRisk(L[lang], cfg);
    const sum = f => LANGS.reduce((n, l) => n + f(risk[l]), 0);
    const raw = {
      same: sum(x => x.sameUnit) + sum(x => x.freeSameUnit),
      other: sum(x => x.otherUnit) + sum(x => x.freeCollisions - x.freeSameUnit),
    };
    /* עם שער הווטו: כל התנגשות שנמצאה ביקום היא בדיוק מחרוזת שהווטו חוסם · הזהות
       הזאת נמדדת ואינה מוצהרת (vetoMismatch חייב להיות 0). מה ששורד הן רק
       ההתנגשויות שמחוץ ליקום, כלומר מה שהווטו לפי-מחרוזת אינו מכסה. */
    const mismatch = sum(x => x.vetoMismatch) + sum(x => x.expandMismatch) + sum(x => x.scanMissing);
    const gated = { same: sum(x => x.freeSameUnit), other: sum(x => x.freeCollisions - x.freeSameUnit) };
    /* "נותר אחרי הווטו" הוא מספר רק כשקבוצת הקבלות נמנתה במלואה. לחוק שנמדד בסריקה
       בתוך היקום בלבד, המספר אינו 0 · הוא לא-נמדד, וזה נאמר ולא מוסתר מאחורי אפס. */
    const measured = LANGS.every(l => risk[l].enumerated);
    /* ⚠ "לא נמדד" נספר כדחייה ולא כהמלצה. תצורה עם התנגשויות בתוך היקום שהשארית שלה
       לא נמנתה היא בדיוק המקרה שבו קל להסיק "הווטו כנראה סוגר את זה" · וזו הסקה, לא
       מדידה. סף אפס-הקבלות-שווא אינו נסגר בהסקה. */
    const verdict = raw.same + raw.other === 0 ? 'נקי'
      : !solvedGated.length ? 'נדחה'
        : measured ? (gated.same + gated.other === 0 ? 'נקי-עם-וטו' : 'נדחה')
          : 'נדחה-לא-נמדד';
    rows.push({ cfg, solved, solvedGated, risk, raw, gated, mismatch, measured, verdict });
  }
  return { L, resolved, today, rows };
}

/* ===== דוח ===== */
function md(out) {
  const { rows, today, resolved } = out;
  const L = [];
  const p = s => L.push(s);
  p('# חוקי צד-הפירוש · מדידת מחלקות B, C, D');
  p('');
  p('נוצר על ידי `typo-lab/measure_gloss.js`. כל מספר כאן נמדד על הפונקציות האמיתיות של');
  p('`app.js` דרך ארגז החול, על שני המאגרים המלאים.');
  p('');
  p('## מה נמדד');
  p('');
  p('- **תועלת** · כמה מ-24 המקרים האמיתיים (`דוחות/סיכומים/מדידת-כלל-מורפולוגי.md`) החוק פותר.');
  p(`  ${today.length} מהם כבר מתקבלים היום (${today.join(', ')}) ולכן אינם נספרים לאף חוק.`);
  p('- **סיכון** · לכל ערך במאגר, כל מחרוזת שהחוק מוסיף ואינה מתקבלת היום, מוצלבת מול');
  p('  יקום כל מקטעי הפירוש. התנגשות = המחרוזת בבעלות ערך אחר שאינו הכרטיס עצמו ואינו');
  p('  מילה שחולקת איתו פירוש. מפוצל לאותה יחידת תרגול מול יחידה אחרת.');
  p('- **רגרסיה** · שום דבר שמתקבל היום אינו נדחה. החוקים תוספתיים (OR), ונבדק בפועל.');
  p('');
  p('הסף קשיח: **התנגשות אחת בתוך יחידת תרגול = החוק נדחה**, ולא משנה כמה מקרים הוא פותר.');
  p('');
  p('שני מצבים נמדדים לכל תצורה: **בלי שער הווטו** (החוק לבדו) ו**עם שער הווטו** של');
  p('`veto.js`, שחוסם מחרוזת שהיא פירוש של ערך אחר. הווטו חוסם רק את התוספת, לעולם לא');
  p('את `meaningMatch` · האינווריאנט הזה נאכף על כל מקטע בכל המאגר בעמודת הרגרסיה.');
  p('');
  p('## הטבלה');
  p('');
  p('| תצורה | תיאור | פותר מ-24 | פותר עם וטו | קבלות חדשות | התנגשות ביחידה | התנגשות ביחידה אחרת | נותר אחרי הווטו | פסק |');
  p('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const na = LANGS.reduce((n, l) => n + r.risk[l].newAccepts + r.risk[l].freeChecked, 0);
    const naTxt = r.measured ? String(na) : `${LANGS.reduce((n, l) => n + r.risk[l].newAccepts, 0)} ביקום`;
    const mark = r.verdict === 'נקי' ? '✅ נקי' : r.verdict === 'נקי-עם-וטו' ? '🟡 נקי רק עם וטו'
      : r.verdict === 'נדחה-לא-נמדד' ? '❌ נדחה · שארית לא נמדדה' : '❌ נדחה';
    const rest = r.measured ? `${r.gated.same} + ${r.gated.other}` : 'לא נמדד';
    p(`| \`${r.cfg.key}\` | ${r.cfg.label} | ${r.solved.length}${r.solved.length ? ' (' + r.solved.join(',') + ')' : ''} | ` +
      `${r.solvedGated.length}${r.solvedGated.length ? ' (' + r.solvedGated.join(',') + ')' : ''} | ${naTxt} | ${r.raw.same} | ${r.raw.other} | ${rest} | ${mark} |`);
  }
  p('');
  p('"קבלות חדשות" לחוקי `gen` היא הקבוצה המלאה; לחוקי `scan` היא אינסופית ולכן נמדדת');
  p('בתוך יקום המקטעים בלבד.');
  p('');
  p('## פירוט לכל תצורה');
  p('');
  for (const r of rows) {
    p(`### \`${r.cfg.key}\` · ${r.cfg.label}`);
    p('');
    for (const lang of LANGS) {
      const x = r.risk[lang];
      p(`- **${lang === 'he' ? 'עברית' : 'אנגלית'}**: ${x.newAccepts} קבלות חדשות ביקום · ${x.benign} תמימות · ` +
        `${x.sameUnit} התנגשות באותה יחידה · ${x.otherUnit} ביחידה אחרת · ` +
        (x.enumerated ? `${x.freeChecked} מחרוזות מחוץ ליקום נמנו ונבדקו מול כל היחידה, ${x.freeCollisions} מהן התנגשו` : 'מחוץ ליקום · לא נמדד (קבוצה אינסופית)') +
        ` · רגרסיה ${x.regress} · אי-הסכמה מול veto.js ${x.vetoMismatch}` +
        (x.enumerated ? ` · מנייה מול פרדיקט ${x.expandMismatch} · סריקה שהמנייה פספסה ${x.scanMissing}` : ''));
    }
    const named = [];
    for (const lang of LANGS) {
      for (const s of r.risk[lang].exSame) named.push(`[${lang}] אותה יחידה · ${s}`);
      for (const s of r.risk[lang].exFree) named.push(`[${lang}] אותה יחידה · ${s}`);
    }
    if (named.length) {
      p('');
      p(`**התנגשויות בשמן (עד ${EX_CAP} לכל קטגוריה):**`);
      p('');
      for (const s of named.slice(0, EX_CAP)) p(`- ${s}`);
    } else {
      const other = [];
      for (const lang of LANGS) for (const s of r.risk[lang].exOther) other.push(`[${lang}] ${s}`);
      if (other.length) {
        p('');
        p(`**התנגשויות ביחידה אחרת בשמן (עד ${EX_CAP}):**`);
        p('');
        for (const s of other.slice(0, EX_CAP)) p(`- ${s}`);
      }
    }
    p('');
  }
  p('## 24 המקרים · מי פותר מה');
  p('');
  p('| # | מילה | הוקלד | קטגוריה | נפתר על ידי |');
  p('|---|---|---|---|---|');
  for (const { c } of resolved) {
    const by = rows.filter(r => r.solved.includes(c.n)).map(r => r.cfg.key);
    const clean = rows.filter(r => r.solvedGated.includes(c.n) && (r.verdict === 'נקי' || r.verdict === 'נקי-עם-וטו')).map(r => r.cfg.key);
    const cell = today.includes(c.n) ? '**מתקבל היום**' : (clean.length ? clean.join(', ') : (by.length ? by.join(', ') + ' (כולן נדחו)' : 'לא נפתר'));
    p(`| ${c.n} | ${c.term} | ${c.typed} | ${c.cat} | ${cell} |`);
  }
  p('');
  const rec = rows.filter(r => (r.verdict === 'נקי' || r.verdict === 'נקי-עם-וטו') && r.solvedGated.length);
  const recSolved = new Set();
  for (const r of rec) for (const n of r.solvedGated) recSolved.add(n);
  p('## הסט המומלץ');
  p('');
  if (rec.length) {
    for (const r of rec) p(`- \`${r.cfg.key}\` · ${r.cfg.label} · פותר ${r.solvedGated.join(', ')} · ${r.verdict === 'נקי' ? 'נקי גם בלי הווטו' : '**דורש את שער הווטו**'}`);
    p('');
    p('');
    p('כל השורות האלה הן אותו חוק אחד (B1) עם שומרים שונים, והן מוכלות זו בזו · **מה');
    p('שנשלח הוא `B1-union` בלבד**, שהוא האיחוד שלהן ופותר את שני המקרים. השאר מופיעות');
    p('כדי להראות מה כל שומר לבדו קונה ומה הוא מפסיד.');
    p('');
    p(`**סך הכל: ${recSolved.size} מתוך 24** (ועוד ${today.length} שכבר מתקבלים היום, סך ${recSolved.size + today.length} מתוך 24).`);
    p('');
    p('מחלקות C ו-D אינן תורמות ולו מקרה אחד שעובר את הסף. זו לא תוצאה של פרמטרים לא');
    p('מוצלחים · נמדדו 5 תצורות ל-C ו-6 ל-D, וכולן נדחו על התנגשויות אמיתיות ומנויות בשם.');
  } else {
    p('אין תצורה שגם פותרת מקרה וגם עוברת את סף אפס-ההתנגשויות.');
  }
  p('');
  p('## מה נדחה ולמה');
  p('');
  for (const r of rows.filter(x => x.verdict === 'נדחה' || x.verdict === 'נדחה-לא-נמדד')) {
    const first = [];
    for (const lang of LANGS) { for (const s of r.risk[lang].exSame) first.push(`[${lang}] ${s}`); for (const s of r.risk[lang].exFree) first.push(`[${lang}] ${s}`); }
    for (const lang of LANGS) for (const s of r.risk[lang].exOther) first.push(`[${lang}] יחידה אחרת · ${s}`);
    const tail = !r.measured ? ', והשארית שמחוץ ליקום **לא נמדדה** · לכן לא מומלץ'
      : (r.gated.same + r.gated.other ? `, ${r.gated.same}+${r.gated.other} שורדות גם את הווטו` : ', כולן נחסמות על ידי הווטו');
    p(`- \`${r.cfg.key}\` · ${r.raw.same} התנגשויות בתוך יחידת תרגול, ${r.raw.other} בין יחידות` + tail +
      (first.length ? ` · לדוגמה: ${first[0]}` : ''));
  }
  p('');
  p('### מסקנה נגררת על C1');
  p('');
  p('`C1-1-fill-seq` היא התצורה ה**מחמירה ביותר** של מילה עודפת: העודפת חייבת להיות מילת');
  p('עוצמה וגם הסדר חייב להישמר. היא נמדדה במלואה, ונמצאו בה התנגשויות ששורדות את הווטו.');
  p('כל שאר תצורות C1 מקבלות קבוצה **המכילה** אותה (הן מוותרות על תנאי הסדר או על תנאי');
  p('מילת העוצמה), ולכן השארית שלהן אינה יכולה להיות קטנה יותר. זו הסקה ממכילות ולא');
  p('מדידה, והיא מספיקה לדחייה · לא הייתה מספיקה לאישור.');
  p('');
  p('הסיבה השורשית, והיא הממצא האמיתי של מחלקה C: במאגר הזה **מילת עוצמה אינה רעש, היא');
  p('ההבדל בין שני ערכים**. "כעס" מול "כעס מאוד", "קשה" מול "קשה יותר", "גדול" מול');
  p('"הגדול ביותר" · שלושתם זוגות ערכים נבדלים, חלקם באותה יחידה. חוק שמתעלם ממילת');
  p('עוצמה מוחק בדיוק את ההבחנה שהמאגר בא ללמד.');
  p('');
  p('## גבול המדידה');
  p('');
  p('יקום ההתנגשות הוא מקטעי הפירוש המדויקים של המאגר, בשתי השפות. לכל תצורה שקבוצת');
  p('הקבלות שלה סופית (B1, B2, ו-C1 כשהעודפת חייבת להיות מילת עוצמה והסדר נשמר) נבדקו');
  p('**גם** המחרוזות שאינן מקטע בשום מקום, אחת אחת, מול `meaningMatch` האמיתית של כל שאר');
  p('הכרטיסים באותה יחידה. עמודת "נותר אחרי הווטו" היא המספר הזה.');
  p('');
  p('לתצורות שקבוצת הקבלות שלהן אינסופית (C1 עם כל מילה, D1) העמודה מסומנת "לא נמדד"');
  p('ולא אפס: החוקים האלה נדחו על סמך ההתנגשויות **בתוך** היקום, ולכן לא הושקעה בהם');
  p('מנייה מלאה. אסור לקרוא את "לא נמדד" כ"נקי".');
  p('');
  p('שתי שיניים על המדידה עצמה, ושתיהן מדווחות בפירוט לכל תצורה: כל מחרוזת שנמנתה');
  p('נבדקת מול הפרדיקט (`expandMismatch`), וכל מה שהסריקה על היקום מוצאת נבדק שהמנייה');
  p('כיסתה (`scanMissing`). שתיהן חייבות להיות 0, אחרת המדידה מודדת קוד אחר מזה שמכריע.');
  return L.join('\n') + '\n';
}

function main() {
  const t0 = Date.now();
  const out = run(CONFIGS);
  const text = md(out);
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gloss-rules-report.md'), text, 'utf8');
  process.stdout.write(text);
  process.stdout.write(`\nנכתב אל typo-lab/out/gloss-rules-report.md · ${((Date.now() - t0) / 1000).toFixed(1)} שניות\n`);
  const bad = out.rows.reduce((n, r) => n + LANGS.reduce((m, l) =>
    m + r.risk[l].regress + r.risk[l].vetoMismatch + r.risk[l].expandMismatch + r.risk[l].scanMissing, 0), 0);
  if (bad) { process.stdout.write(`\n⚠ ${bad} כשלי רגרסיה/אי-הסכמה מול veto.js · פסק דין: אדום\n`); process.exit(1); }
}

if (require.main === module) main();

module.exports = { CASES24, CONFIGS, LANGS, loadLang, resolveCases, measureBenefit, measureRisk, offenders, run, md, alreadyToday };
