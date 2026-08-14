'use strict';
/* טיוב הספים · typo-lab/evolve.js
 *
 * שלוש ריצות GA בלתי תלויות · he-word, en-word, gloss · על 89,375 שורות מתויגות, עם
 * ‏5-fold CV לפי fold, holdout שאינו נגוע, ואילוץ קשיח אחד: **אפס קבלות-שווא**.
 *
 * ===== שתי סמנטיקות חדשות בדאטהסט v2, ומה הן עושות למדידה =====
 *
 * ‏1. ‏**trusted:false** (3,891 שורות · he-word 2,275, gloss 1,616, en-word 0). כולן
 *    ‏accept/novel-unverified: הלקסיקון הנקי-רישיונית לא ידע להכריע אם הווריאנט הוא
 *    מילה אחרת או לא, והן מרוכזות במפתחות עבריים קצרים עם עריכות נושאות-משמעות
 *    (הומופון א/ע כ/ק ס/ש ת/ט, שתילת אם-קריאה). **הן מוצאות ממונה ה-recall** · לא
 *    כזכות ולא כקנס. אימון עליהן הוא אימון על ניחוש. הן אינן מוסרות מהנתונים: אם אחת
 *    מהן תתויג אי-פעם reject, קבלה שלה עדיין תיספר כקבלת-שווא (המונה fa אינו מסתכל
 *    על trusted כלל · נמדד שכיום אין אף שורת reject לא-מהימנה, ולכן השומר רדום ונכון).
 *    הדוח מדפיס גם את ה-recall **כולל** אותן, כדי שגודל האפקט יהיה גלוי ולא מוסתר.
 *
 * ‏2. ‏**why:"real-word"** (1,984 שורות · he-word 1,167, gloss 694, en-word 123). כולן
 *    reject: המוקלד הוא מילה אמיתית לפי הלקסיקון אך אינו צורה מקובלת של הכרטיס. אלה
 *    השליליות הקשות באמת, וקבלת-שווא עליהן היא הכשל היקר ביותר · לומד שהתכוון למילה
 *    אחרת מקבל "נכון". הן נספרות **בנפרד** ומודפסות בכל דוח.
 *
 * ===== מה הכושר מודד, ומה הוא לא =====
 *
 * ‏fitness = ‎-1e6 × מספר קבלות-השווא‎, ואם אין כאלה · recall פחות קנס מורכבות.
 * העונש הוא "מוות עם גרדיאנט": גנום עם 3 קבלות-שווא גרוע מגנום עם 2, ולכן ה-GA יכול
 * לטפס החוצה מאזור אסור במקום לראות מדף שטוח של אינסוף-שלילי ולתעות בו.
 *
 * ה-recall נמדד מול **התקרה הכנה** ולא מול 1.0: שורות שהחוק של היום כבר מקבל אינן
 * בדאטהסט בכלל (gen_dataset סינן אותן), ולכן כל שורת accept כאן היא סובלנות חדשה
 * שנמדדת. הדוח מדווח גם כמה מהן בכלל ניתנות להשגה · יש שורות accept שנחסמות מבנית
 * (וטו, שולי דו-משמעות), ואף גנום לא יגיע אליהן. תקרה שאינה מדווחת היא recall מנופח.
 *
 * ===== טריק הביצועים, והסייג שלו =====
 *
 * לכל שורה מחושב מראש וקטור ספירת-פעולות מול שלושת המועמדים הקרובים (מרחק לא ממושקל,
 * חסם 3). הערכת גנום מצטמצמת למכפלה סקלרית · בלי DP בלולאה הפנימית. זה **קירוב**:
 * היישור הזול ביותר תחת משקלים לא-אחידים יכול להיות אחר. לכן המנצח מתומחר מחדש
 * ב-wEditDist המדויקת על כל השורות, והדוח מדווח את המספרים המדויקים. אם השניים נפרדים
 * מהותית · זה נאמר בקול, לא נבלע.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto, isVetoedTerm, isVetoedSeg } = require('./lib/veto.js');
const { acceptedKeys, acceptedSegs, acceptsToday } = require('./lib/keys.js');
const { buildIndex } = require('./gen_dataset.js');
const { opVectors, wEditDist, OP_KEYS } = require('./lib/wdist.js');
const { makeChecker, normalizeParams, nearestOther, suffixesFor, letters, lexVetoed, LEX_AVAILABLE, MAX_OPS, MAX_CANDS } = require('./lib/checker.js');
const { runGA } = require('./lib/ga.js');
const { mulberry32, fnv1a, seedFor } = require('./lib/rng.js');

const OUT = path.join(__dirname, 'out');
const SEED = 'typo-lab/evolve/v1';
const SETS = ['he-word', 'en-word', 'gloss'];
/* אותם קבועים בדיוק של lib/checker.js · הקירוב המהיר חייב לבחון את אותה קבוצת מועמדים
   שהמסלול המדויק בוחן, אחרת ההפרש בין השניים אינו "בחירת יישור" אלא באג. */
const CAND_K = MAX_CANDS;
const CAND_CAP = MAX_OPS;
const GOLDEN_TARGET = 10000;
const BIG_GA = { popSize: 80, maxGen: 130, patience: 22 };
const COMPLEXITY_W = 0.002;

const say = s => process.stdout.write(s + '\n');

/* ===== מפרט הגנום =====
 * ‏W.sub מקובע ב-1.0 ואינו גן · הוא יחידת המידה. בלי עוגן, (W, ספים) ו-(2W, 2ספים) הם
 * אותו מסווג בדיוק, וה-GA היה מבזבז דורות על נדידה לאורך כיוון שאינו משנה דבר.
 */
/* ===== הגנום · וקטור סף לכל אורך =====
 *
 * מה שהמדידה של סוכן הכיסוי הראתה: ארבע רצועות אורך היו האילוץ הכובל, לא הלקסיקון.
 * רצועה אחת חייבת סף אחד לטווח שלם של אורכים, ולכן אורך שרוצה סובלנות גוררת אחריו
 * את שכניו · וה-GA נאלץ לאפס את כולם כדי לספק את אילוץ אפס-קבלות-השווא. עם סף לכל
 * אורך, כל אורך נסחר בנפרד. נמדד: gloss מ-0.00% ל-8.61%, כלומר "אפס מבני" היה תוצר
 * של מרחב החיפוש ולא של הבעיה.
 *
 * ‏2..12 בנפרד ואז 13+ · מתחת ל-3 אין שורות accept כלל, ומעל 12 הזנב דליל מכדי
 * להצדיק גן לכל אורך. שנים-עשר גני סף במקום שמונה גני רצועה.
 *
 * הייצוג נשאר **bands** בדיוק כפי שהבודק כבר קורא אותו · maxLen עולה ב-1 בכל צעד.
 * לכן lib/checker.js אינו משתנה בכלל, וטבלת הזהב, השער הממצה ו-tests/71 ממשיכים
 * לקרוא את אותו מבנה. שינוי ייצוג שדורש שינוי בבודק היה שינוי סמנטי מוסווה. */
const T_LENS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GENES = [
  { name: 'minLen', lo: 0, hi: 8, int: true }
].concat(T_LENS.map(L => ({ name: 't' + L, lo: 0, hi: 3 })))
  .concat([{ name: 't13plus', lo: 0, hi: 3 }])
  .concat([
    { name: 'W.adjSub', lo: 0.2, hi: 2 },
    { name: 'W.transpose', lo: 0.2, hi: 3 },
    { name: 'W.ins', lo: 0.2, hi: 2 },
    { name: 'W.del', lo: 0.2, hi: 2 },
    { name: 'W.doubleLetter', lo: 0.2, hi: 2 },
    { name: 'W.materVI', lo: 0.2, hi: 2 },
    { name: 'W.homophone', lo: 0.2, hi: 2 },
    /* התחום מתחיל ב-1 ולא ב-0, ובכוונה. ‏vetoMargin=0 מתיר לקבל מחרוזת שקרובה למילת
       מאגר אחרת **יותר** מאשר לשלך · סתירה חזיתית להכרעת חגי. נמדד שה-GA אכן בוחר 0
       כשמותר לו. אילוץ שהוא לרעת הכושר חייב להיות מחוץ להישג ידו. */
    { name: 'vetoMargin', lo: 1, hi: 3, int: true }
  ]);
const NT = T_LENS.length + 1;                 // מספר גני הסף
const WI = 1 + NT;                            // תחילת גני המשקל
const GI = {};
GENES.forEach((g, i) => { GI[g.name] = i; });

/* הרצועות **עולות ממש**. שוויון אינו ניטרלי: normalizeParams ממיין לפי maxLen, ולכן
   שתי רצועות עם אותו maxLen מייצרות רצועה שנייה מוצללת לצמיתות · הסף שלה אינו נקרא
   לעולם, וה-GA מבזבז עליה גן שלם. נמדד בפועל בגנום he-word שנשלח: bands 6:2.4869
   ו-6:0, כלומר סף 2.4869 שנראה בדוח ואינו קיים בהחלטה. */
function genomeToParams(g) {
  const bands = T_LENS.map((L, i) => ({ maxLen: L, t: g[1 + i] }));
  bands.push({ maxLen: Infinity, t: g[1 + T_LENS.length] });
  return {
    minLen: g[0],
    bands,
    W: {
      sub: 1,
      adjSub: g[WI], transpose: g[WI + 1], ins: g[WI + 2], del: g[WI + 3],
      doubleLetter: g[WI + 4], materVI: g[WI + 5], homophone: g[WI + 6]
    },
    vetoMargin: g[WI + 7]
  };
}

/* גנום מפרמטרים · הזרעים נכתבים כפרמטרים קריאים, ולכן הסף לכל אורך נדגם מהם דרך
   אותה פונקציה שהבודק משתמש בה. כך זרע שנכתב כארבע רצועות נכנס בלי לאבד דבר. */
function paramsToGenome(p) {
  const P = normalizeParams(p);
  const thr = len => {
    for (const b of P.bands) if (len <= b.maxLen) return b.t;
    return P.bands[P.bands.length - 1].t;
  };
  const W = P.W || {};
  return [P.minLen]
    .concat(T_LENS.map(L => thr(L)))
    .concat([thr(99)])
    .concat([
      W.adjSub == null ? 1 : W.adjSub,
      W.transpose == null ? 2 : W.transpose,
      W.ins == null ? 1 : W.ins,
      W.del == null ? 1 : W.del,
      W.doubleLetter == null ? 1 : W.doubleLetter,
      W.materVI == null ? 1 : W.materVI,
      W.homophone == null ? 1 : W.homophone,
      P.vetoMargin == null ? 1 : P.vetoMargin
    ]);
}

/* ===== שמונת הזרעים הידניים =====
 * הראשון הוא **אפס סובלנות** · הוא מייצר בדיוק את ההתנהגות של היום (אף קבלה פאזית).
 * הוא מבטיח שהאוכלוסייה הראשונית מכילה לפחות גנום אחד בלי קבלות-שווא, ולכן אין תרחיש
 * שבו ה-GA מחזיר משהו גרוע מהמצב הקיים · הגרוע ביותר שיכול לקרות הוא "בלי שינוי".
 */
const SEED_PARAMS = [
  { note: 'zero-tolerance · today', minLen: 0, bands: [{ maxLen: 3, t: 0 }, { maxLen: 6, t: 0 }, { maxLen: 10, t: 0 }, { maxLen: Infinity, t: 0 }], W: {}, vetoMargin: 1 },
  { note: 'plain d<=1 for len>=4', minLen: 4, bands: [{ maxLen: 3, t: 0 }, { maxLen: 6, t: 1 }, { maxLen: 10, t: 1 }, { maxLen: Infinity, t: 1 }], W: {}, vetoMargin: 1 },
  { note: 'd<=1 under 8 · d<=2 at 8+', minLen: 3, bands: [{ maxLen: 3, t: 0 }, { maxLen: 7, t: 1 }, { maxLen: 12, t: 2 }, { maxLen: Infinity, t: 2 }], W: {}, vetoMargin: 1 },
  { note: 'creditSense cap floor(len/3)', minLen: 0, bands: [{ maxLen: 3, t: 1 }, { maxLen: 5, t: 1 }, { maxLen: 8, t: 2 }, { maxLen: Infinity, t: 3 }], W: {}, vetoMargin: 1 },
  { note: 'weighted · adjSub/mater/homophone discounted', minLen: 4, bands: [{ maxLen: 3, t: 0 }, { maxLen: 6, t: 1 }, { maxLen: 10, t: 1 }, { maxLen: Infinity, t: 1 }], W: { adjSub: 0.6, materVI: 0.5, homophone: 0.6, transpose: 1.2 }, vetoMargin: 1 },
  { note: 'weighted · generous on long words', minLen: 4, bands: [{ maxLen: 3, t: 0 }, { maxLen: 6, t: 1 }, { maxLen: 10, t: 1.5 }, { maxLen: Infinity, t: 2 }], W: { adjSub: 0.5, materVI: 0.4, homophone: 0.5, doubleLetter: 0.5, transpose: 0.9 }, vetoMargin: 1 },
  { note: 'strict short · margin 2', minLen: 5, bands: [{ maxLen: 4, t: 0 }, { maxLen: 7, t: 0.6 }, { maxLen: 11, t: 1.2 }, { maxLen: Infinity, t: 2 }], W: { adjSub: 0.7, materVI: 0.5, homophone: 0.7, transpose: 1.4 }, vetoMargin: 2 },
  { note: 'plain d<=1 · margin 2', minLen: 4, bands: [{ maxLen: 3, t: 0 }, { maxLen: 6, t: 1 }, { maxLen: 10, t: 1 }, { maxLen: Infinity, t: 1 }], W: {}, vetoMargin: 2 },
  /* שלוש נקודות ההפעלה שנשלחות היום · נכנסות כזרעים כדי שהייצוג החדש לא יוכל לצאת
     גרוע מהישן. הן נדגמות לסף-לכל-אורך דרך paramsToGenome, ולכן הן מיוצגות במדויק. */
  { note: 'shipped he-word (4-band)', minLen: 6, vetoMargin: 1, bands: [{ maxLen: 3, t: 0 }, { maxLen: 7, t: 0.5164 }, { maxLen: 14, t: 0 }, { maxLen: Infinity, t: 1.5253 }], W: { adjSub: 1.5771, transpose: 1.9474, ins: 1.6279, del: 0.5165, doubleLetter: 0.4423, materVI: 0.9335, homophone: 1.7535 } },
  { note: 'shipped en-word (4-band)', minLen: 1, vetoMargin: 2, bands: [{ maxLen: 2, t: 0.0889 }, { maxLen: 9, t: 1.5657 }, { maxLen: 10, t: 1.055 }, { maxLen: Infinity, t: 1.4513 }], W: { adjSub: 1.3764, transpose: 1.0148, ins: 1.4561, del: 1.534, doubleLetter: 1.0232, materVI: 0.596, homophone: 1.6427 } },
  { note: 'gloss 1/20000 (4-band)', minLen: 4, vetoMargin: 2, bands: [{ maxLen: 4, t: 0.663 }, { maxLen: 9, t: 0 }, { maxLen: 13, t: 0.4274 }, { maxLen: Infinity, t: 1.3205 }], W: { adjSub: 2, transpose: 2.8453, ins: 1.9206, del: 0.2, doubleLetter: 0.2, materVI: 0.9063, homophone: 0.2 } }
];

/* ===== טעינה וקדם-חישוב ===== */

function loadRows() {
  const perSet = {};
  for (const s of SETS) perSet[s] = [];
  const langs = {};

  for (const lang of ['he', 'en']) {
    const t0 = Date.now();
    const ctx = getCtx(lang);
    const veto = buildVeto(ctx, lang);
    const IX = { term: buildIndex(veto.termKeys), seg: buildIndex(veto.segKeys) };
    const byCard = new Map();
    for (const w of Array.from(ctx.BANK)) byCard.set(String(w.term) + '|' + String(w.unit == null ? '' : w.unit), w);
    langs[lang] = { ctx, veto, IX, byCard, suffixes: suffixesFor(ctx) };

    const file = path.join(OUT, `dataset-${lang}.jsonl`);
    const text = fs.readFileSync(file, 'utf8');
    let n = 0, missing = 0, todayHits = 0, maxVec = 0;

    /* מטמונים לכל שפה · acceptedKeys ו-acceptedSegs נקראות עשרות אלפי פעמים על אותם
       כרטיסים, וכל קריאה בונה Set מחדש. */
    const candCache = new Map(), allowCache = new Map();
    const candsOf = (card, gloss) => {
      const id = String(card.term) + '|' + String(card.unit) + '|' + (gloss ? 'g' : 'w');
      let v = candCache.get(id);
      if (!v) {
        v = Array.from(gloss ? acceptedSegs(card, ctx) : acceptedKeys(card, ctx)).filter(Boolean).sort();
        candCache.set(id, v);
      }
      return v;
    };
    const allowOf = (card, gloss) => {
      const id = String(card.term) + '|' + String(card.unit) + '|' + (gloss ? 'g' : 'w');
      let v = allowCache.get(id);
      if (!v) {
        v = new Set([ctx.K(card.term)]);
        if (gloss) for (const t of Array.from(ctx.glossAlts(card))) v.add(ctx.K(t));
        allowCache.set(id, v);
      }
      return v;
    };
    /* אותם מטמונים משמשים גם את בניית השליליות החוצות-כרטיסים · אותו מערך מועמדים
       בדיוק, ולכן גם אותו מטמון-אסימונים של הלקסיקון ואותו סדר מיון. */
    langs[lang].keysOf = card => candsOf(card, false);
    langs[lang].segsOf = card => candsOf(card, true);
    langs[lang].allowTerm = card => allowOf(card, false);
    langs[lang].allowSeg = card => allowOf(card, true);

    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      const card = langs[lang].byCard.get(r.term + '|' + r.unit);
      if (!card) { missing++; continue; }
      const gloss = r.set === 'gloss';
      const cands = candsOf(card, gloss);
      const allow = allowOf(card, gloss);

      /* נרמול · לא פורמליות. רוב השורות נולדו ממפתחות מנורמלים ולכן typed שלהן כבר
         מנורמל, אבל שורות neg/inflection נבנות כ-termKey + סיומת **גולמית** ("אריג"
         + "ים"), ולכן יש בהן אות סופית. בלי K() כאן, "אריגים" אינו נפתח לעולם מול
         המועמד "אריג"+"ימ", שומר הנטיות מפספס אותו, וכל השערים למטה עובדים על מחרוזת
         שהריצה בכלל לא תראה. נמדד: 223 שורות נטייה בעברית שרדו את כל השכבות ולחצו את
         הספים למטה · כלומר גזלו recall משורות אמיתיות. */
      const typed = gloss ? ctx.norm(r.typed) : ctx.K(r.typed);

      const vetoed = gloss ? isVetoedSeg(typed, card, veto, ctx) : isVetoedTerm(typed, card, veto, ctx);
      /* שכבה 2ב · מחושבת פעם אחת לשורה, בדיוק כמו הווטו, כי היא אינה תלויה בגנום.
         השפה היא 'he' לכל מקטע פירוש · גם במאגר האנגלי, שם הפירושים עבריים. */
      const lexV = lexVetoed(typed, cands, gloss ? 'he' : lang, veto);
      const today = gloss ? !!ctx.meaningMatch(r.typed, card.meaning) : !!acceptsToday(ctx, r.typed, card);
      if (today) todayHits++;

      /* שומר הנטיות · כיוון המונח בלבד, בדיוק כמו בבודק. */
      let inflect = false;
      if (!gloss) {
        for (const c of cands) {
          if (typed.length <= c.length || !typed.startsWith(c)) continue;
          if (langs[lang].suffixes.includes(typed.slice(c.length))) { inflect = true; break; }
        }
      }

      /* המועמדים · אותה בחירה ואותו מיון בדיוק כמו ב-lib/checker.js: מרחק גולמי עד
         MAX_OPS, ממוין לפי (מרחק, אורך, לקסיקוגרפית), עד MAX_CANDS. ‏raw הוא editDist
         של app.js (לוונשטיין), ולא oc.dist שהוא OSA · היפוך שכנים הוא 2 שם ו-1 כאן,
         והשער חייב לרוץ על המדד של האפליקציה. */
      let dOwn = 99;
      const scored = [];
      for (const c of cands) {
        const raw = ctx.editDist(typed, c);
        if (raw < dOwn) dOwn = raw;
        if (raw > CAND_CAP) continue;
        const vs = opVectors(typed, c, CAND_CAP);
        if (!vs.length) continue;
        if (vs.length > maxVec) maxVec = vs.length;
        scored.push({ len: letters(c), raw, vecs: vs, key: c });
      }
      scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const top = scored.slice(0, CAND_K);
      const dOtherRaw = nearestOther(typed, gloss ? IX.seg : IX.term, allow, ctx);
      const dOther = isFinite(dOtherRaw) ? dOtherRaw : 9;

      perSet[r.set].push({
        lang, set: r.set, op: r.op, label: r.label, why: r.why, fold: r.fold, holdout: !!r.holdout,
        /* ‏trusted · ברירת המחדל היא true, כי שורה בלי השדה היא שורה מדאטהסט ישן ואין
           סיבה להוציא אותה מהמונה. ההוצאה חלה רק על סימון מפורש false. */
        trusted: r.trusted !== false,
        term: r.term, unit: r.unit, key: r.key, typed: r.typed, typedKey: typed,
        vetoed, lexVetoed: lexV, today, inflect, dOwn: Math.min(dOwn, 9), dOther,
        tLen: letters(typed), kLen: letters(r.key), cands: top
      });
      n++;
    }
    say(`[${lang}] ${n} שורות נטענו · ${missing} בלי כרטיס · ${todayHits} שכבר מתקבלות היום · לכל היותר ${maxVec} יישורים בלתי-נשלטים למועמד · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (todayHits) say(`  ⚠ ${todayHits} שורות שהחוק של היום כבר מקבל · gen_dataset אמורה לסנן אותן`);
  }
  return { perSet, langs };
}

/* ===== השליליות החוצות-כרטיסים · האילוץ שבאמת מחייב =====
 *
 * מה שהמדידה הראתה, ובגללו הבלוק הזה קיים: הדאטהסט מתייג כל וריאציה מול הכרטיס
 * ש**ממנו היא נוצרה**, בעוד שהאילוץ האמיתי הוא רוחב-מאגר · וריאציה של כרטיס A אסור
 * שתתקבל על כרטיס B, לכל B. הזוגות האלה כמעט אינם קיימים בשורות האימון, ולכן ה-GA היה
 * חופשי להרחיב ספים שנראים נקיים לכל כרטיס בנפרד ומתנגשים בין כרטיסים. ‏bank_gate מדד
 * 138 התנגשויות חדשות על הפרמטרים שנשלחו · "caughtt" התקבל על bought, "110th" על
 * 1st, "tootth" על both, "תיתוורהה" על הִתְוָוה. זו סטייה מבנית ולא תאונת כיול.
 *
 * הפתרון: לספור אותן כשליליות קשות בתוך הכושר. הקבוצה נבנית **פעם אחת** בעומק MAX_OPS
 * (‏3), שהוא על-קבוצה של כל עומק שגנום כלשהו יכול לייצר, ולכן היא תקפה לכל הגנומים.
 * מסננים מראש את מה ששום גנום אינו יכול לקבל · וטו, לקסיקון, נטייה, מחוץ לטווח · כי
 * שורה שנחסמת מבנית אינה יכולה להיות קבלת-שווא, ורק המותר נשאר בלולאה הפנימית.
 *
 * ‏makeNear/delVariants מיובאים מ-bank_gate ולא נכתבים מחדש · המסנן שמייצר את הקבוצה
 * חייב להיות אותו מסנן שהשער הממצה משתמש בו, אחרת ה-GA מתכייל מול קבוצה אחת ונשפט
 * על אחרת. הקובץ ההוא שייך לסוכן אחר ואינו נערך כאן, רק נקרא.
 *
 * מה **לא** מודלל כאן: שכבת ההרחבה B1 של צד הפירוש. היא ערוץ קבלה נוסף, ולכן הכושר
 * שמרני-חסר שם. השער הממצה נשאר הסמכות הסופית וזה מה שסוגר את הפער.
 */
const BG = require('./bank_gate.js');

function buildCrossCard(langs, perSet) {
  const out = { 'he-word': [], 'en-word': [], 'gloss': [] };
  const stats = {};

  for (const lang of ['he', 'en']) {
    const L = langs[lang];
    const ctx = L.ctx;
    const cards = Array.from(ctx.BANK);

    /* לכל כרטיס · הצורות הקבילות שלו, הבעלים, וקבוצת ההיתר (הכרטיס ונרדפותיו). */
    const info = cards.map(w => {
      const owner = ctx.K(w.term);
      const allowed = new Set([owner]);
      for (const t of Array.from(ctx.glossAlts(w))) { const k = ctx.K(t); if (k) allowed.add(k); }
      return { w, owner, term: w.term, unit: w.unit, allowed, keys: L.keysOf(w), segs: L.segsOf(w) };
    });
    const byKey = new Map();
    for (const e of info) if (!byKey.has(e.owner)) byKey.set(e.owner, e);
    /* keysPlus · מה שמתקבל **היום** דרך acceptsToday, כולל נרדפות שחולקות פירוש.
       צורה כזאת מתקבלת דרך via=exact ולכן אינה "התנגשות חדשה" · היא ההתנהגות הקיימת,
       ואסור לספור אותה כקבלת-שווא של הגנום. */
    for (const e of info) {
      const s = new Set(e.keys);
      for (const t of Array.from(ctx.glossAlts(e.w))) {
        const g = byKey.get(ctx.K(t));
        if (g) for (const k of g.keys) s.add(k);
      }
      e.keysPlus = s;
    }

    for (const dir of ['word', 'gloss']) {
      const set = dir === 'gloss' ? 'gloss' : (lang === 'en' ? 'en-word' : 'he-word');
      const formsOf = e => (dir === 'gloss' ? e.segs : e.keys);

      /* צורה -> בעלים · כל צורה קבילה של כל ערך, ובנוסף כל וריאציה שהדאטהסט מתייג
         ראויה-לקבל. הווריאציות הן העיקר: הן אינן מילות מאגר ולכן הווטו אינו רואה
         אותן, וזה בדיוק המסלול שדרכו "caughtt" הגיע ל-bought. */
      const owners = new Map();
      const keyOwners = new Map();
      const put = (f, o) => { if (!f || !o) return; let s = owners.get(f); if (!s) { s = new Set(); owners.set(f, s); } s.add(o); };
      for (const e of info) for (const k of formsOf(e)) {
        put(k, e.owner);
        let s = keyOwners.get(k); if (!s) { s = new Set(); keyOwners.set(k, s); } s.add(e.owner);
      }
      for (const r of perSet[set]) {
        if (r.lang !== lang || r.label !== 'accept') continue;
        const card = L.byCard.get(r.term + '|' + r.unit);
        if (card) put(r.typedKey, ctx.K(card.term));
      }

      const forms = Array.from(owners.keys());
      const NI = BG.makeNear(forms, CAND_CAP, 24);
      let pairs = 0, kept = 0, blocked = 0, todaySkip = 0, unreach = 0;

      for (const e of info) {
        const src = formsOf(e);
        if (!src.length) continue;
        const seen = new Set();
        for (const k of src) for (const i of NI.near(k)) seen.add(i);
        /* ערכים שחולקים עם הכרטיס צורה קבילה הם אותה מילה במאגר פעמיים · פטור, בדיוק
           כמו exemptOf בשער. */
        const share = new Set();
        for (const k of src) { const s = keyOwners.get(k); if (s) for (const o of s) share.add(o); }
        const own = new Set(src);

        for (const i of seen) {
          const f = forms[i];
          let outside = null;
          for (const o of owners.get(f)) {
            if (e.allowed.has(o)) continue;
            if (share.has(o)) { const ko = keyOwners.get(f); if (!(ko && ko.has(o) && !own.has(f))) continue; }
            outside = o; break;
          }
          if (outside == null) continue;
          if (e.keysPlus.has(f)) { todaySkip++; continue; }        // מתקבל היום · לא חדש
          pairs++;

          /* השכבות המבניות קודם · הן זולות, והן מסלקות את הרוב המכריע לפני שמחשבים
             וקטורי יישור. מה שנחסם מבנית אינו יכול להיות קבלת-שווא באף גנום. */
          const gloss = dir === 'gloss';
          const vetoed = gloss ? isVetoedSeg(f, e.w, L.veto, ctx) : isVetoedTerm(f, e.w, L.veto, ctx);
          if (vetoed) { blocked++; continue; }
          let inflect = false;
          if (!gloss) for (const c of src) {
            if (f.length <= c.length || !f.startsWith(c)) continue;
            if (L.suffixes.includes(f.slice(c.length))) { inflect = true; break; }
          }
          if (inflect) { blocked++; continue; }
          if (lexVetoed(f, src, gloss ? 'he' : lang, L.veto)) { blocked++; continue; }

          /* מרחק גולמי ומועמדים · אותה בחירה בדיוק כמו בשורת דאטהסט. */
          let dOwn = 99;
          const scored = [];
          for (const c of src) {
            if (Math.abs(f.length - c.length) > CAND_CAP) continue;
            const raw = ctx.editDist(f, c);
            if (raw < dOwn) dOwn = raw;
            if (raw > CAND_CAP) continue;
            const vs = opVectors(f, c, CAND_CAP);
            if (!vs.length) continue;
            scored.push({ len: letters(c), raw, vecs: vs, key: c });
          }
          if (!scored.length) continue;
          scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

          /* ===== סינון בר-השגה · הוכחתי, לא היוריסטי =====
             שומרים רק זוגות שקיים גנום **בתוך מרחב החיפוש** שמקבל אותם. הגנום השולט
             הוא הקיצון של כל גן בכיוון המתירני: כל הספים 3 (התקרה של גן t), כל
             המשקלים 0.2 (הרצפה של גני W · ‏sub מקובע ב-1), minLen 0, ושוליים 1
             (הרצפה של vetoMargin). זוג שהוא דוחה לא ייתקבל על ידי אף גנום, ולכן
             הסרתו אינה יכולה להחמיץ התנגשות · בלי זה נשארו 1.96 מיליון שורות
             שהלולאה הפנימית של ה-GA אינה יכולה לשאת. */
          const allow = gloss ? L.allowSeg(e.w) : L.allowTerm(e.w);
          const dOtherRaw = nearestOther(f, gloss ? L.IX.seg : L.IX.term, allow, ctx);
          const dOtherV = isFinite(dOtherRaw) ? dOtherRaw : 9;
          if ((dOtherV - Math.min(dOwn, 9)) < 1) { unreach++; continue; }
          let reach = false;
          for (const s of scored.slice(0, CAND_K)) {
            for (const v of s.vecs) {
              let c = 0;
              for (const k of OP_KEYS) c += v[k] * (k === 'sub' ? 1 : 0.2);
              if (c <= 3) { reach = true; break; }
            }
            if (reach) break;
          }
          if (!reach) { unreach++; continue; }

          out[set].push({
            lang, set, op: 'cross/bank', label: 'reject', why: 'cross-card-bank', trusted: true,
            fold: -1, holdout: false, term: e.term, unit: e.unit, key: src[0], typed: f, typedKey: f,
            intruder: outside,
            vetoed: false, lexVetoed: false, today: false, inflect: false,
            dOwn: Math.min(dOwn, 9), dOther: dOtherV,
            tLen: letters(f), kLen: letters(src[0]), cands: scored.slice(0, CAND_K)
          });
          kept++;
        }
      }
      stats[`${lang}/${dir}`] = { forms: forms.length, pairs, kept, blocked, unreachable: unreach, todaySkip };
    }
  }
  return { rows: out, stats };
}

/* קודי הדלי · ההרכב של קבלות-השווא חשוב לא פחות ממספרן. קבלה של מילת מאגר אחרת
   ("וטו") היא כשל פדגוגי אחר לגמרי מקבלה של מחרוזת דו-משמעית. */
const WHY_CODE = { 'real-word': 1, 'veto': 2, 'ambiguous': 3, 'inflection': 4, 'garbage': 5, 'other-variant': 6, 'cross-card': 7, 'cross-card-bank': 8 };
const WHY_NAME = ['other', 'real-word', 'veto', 'ambiguous', 'inflection', 'garbage', 'other-variant', 'cross-card', 'cross-card-bank'];

/* ההכרעה לשורה אחת · אותו סדר שכבות בדיוק של evalSubset, לשימוש המדידות שאינן
   בלולאה הפנימית. מוגדרת פעם אחת כדי ששתיהן לא ייפרדו. */
function decideOne(S, i, E) {
  const f = S.flags[i];
  if (f & 4) return true;
  if (f & 1) return false;
  if (E.useLex && (f & 64)) return false;
  if (S.tLen[i] < E.minLen) return false;
  if (f & 2) return false;
  if (!E.anyT) return false;
  const K = OP_KEYS.length;
  const hi = S.off[i + 1];
  let ok = false;
  for (let p = S.off[i]; p < hi; p++) {
    const L = S.pLen[p];
    const t = E.tcache[L < 256 ? L : 255];
    if (!(t > 0)) continue;
    let cost = 0;
    const base = p * K;
    for (let j = 0; j < K; j++) cost += S.pCnt[base + j] * E.wv[j];
    if (cost <= t) { ok = true; break; }
  }
  if (ok && E.margin > 0 && (S.dOther[i] - S.dOwn[i]) < E.margin) ok = false;
  return ok;
}

function faBuckets(S, idx, E) {
  const out = {};
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    if (S.flags[i] & 8) continue;
    if (!decideOne(S, i, E)) continue;
    const n = WHY_NAME[S.whyCode[i]] || 'other';
    out[n] = (out[n] || 0) + 1;
  }
  return out;
}

function listFalseAccepts(S, idx, E, limit) {
  const out = [];
  for (let x = 0; x < idx.length && out.length < (limit || 50); x++) {
    const i = idx[x];
    if (S.flags[i] & 8) continue;
    if (!decideOne(S, i, E)) continue;
    const r = S.rows[i];
    out.push({ typed: r.typed, key: r.key, term: r.term, unit: r.unit, set: r.set, op: r.op, why: r.why, intruder: r.intruder || null });
  }
  return out;
}

/* ===== ארוז לסט למערכים טיפוסיים · זו הצורה שהלולאה הפנימית של ה-GA רצה עליה =====
 * כל שורה נפרשת לרשימת זוגות (אורך המועמד, וקטור פעולות של יישור בלתי-נשלט). קבלה
 * מתרחשת אם קיים זוג שהמכפלה הסקלרית שלו אינה עולה על הסף של רצועת האורך שלו · וזו
 * **בדיוק** ההגדרה של lib/checker.js, לא קירוב שלה.
 */
function packSet(rows) {
  const N = rows.length;
  const K = OP_KEYS.length;
  /* ‏1 וטו · 2 נטייה · 4 מתקבל היום · 8 label=accept · 16 trusted · 32 why=real-word
     · 64 וטו הלקסיקון */
  const flags = new Uint8Array(N);
  const tLen = new Int16Array(N);
  const kLen = new Int16Array(N);
  /* קוד הדלי · קבלת-שווא על מילת מאגר אחרת אינה אותו כשל כמו קבלת-שווא על מחרוזת
     דו-משמעית, ולכן הספירה לבדה אינה מספיקה · ההרכב נמדד בנפרד. */
  const whyCode = new Uint8Array(N);
  const dOwn = new Int8Array(N);
  const dOther = new Int8Array(N);
  const fold = new Int8Array(N);
  const hold = new Uint8Array(N);
  const off = new Int32Array(N + 1);
  let P = 0;
  for (const r of rows) for (const c of r.cands) P += c.vecs.length;
  const pLen = new Int16Array(P);
  const pCnt = new Float32Array(P * K);
  let p = 0;
  for (let i = 0; i < N; i++) {
    const r = rows[i];
    whyCode[i] = WHY_CODE[String(r.why).split(':')[0]] || 0;
    flags[i] = (r.vetoed ? 1 : 0) | (r.inflect ? 2 : 0) | (r.today ? 4 : 0) | (r.label === 'accept' ? 8 : 0)
      | (r.trusted === false ? 0 : 16) | (r.why === 'real-word' ? 32 : 0) | (r.lexVetoed ? 64 : 0);
    tLen[i] = r.tLen; kLen[i] = r.kLen; dOwn[i] = r.dOwn; dOther[i] = r.dOther;
    fold[i] = r.fold; hold[i] = r.holdout ? 1 : 0;
    off[i] = p;
    for (const c of r.cands) {
      for (const v of c.vecs) {
        pLen[p] = c.len;
        for (let j = 0; j < K; j++) pCnt[p * K + j] = v[OP_KEYS[j]];
        p++;
      }
    }
  }
  off[N] = p;
  return { N, flags, tLen, kLen, whyCode, dOwn, dOther, fold, hold, off, pLen, pCnt, pairs: P, rows };
}

/* ===== הערכה מהירה · מכפלה סקלרית =====
 * הסדר כאן זהה לסדר של lib/checker.js ואינו רשות: וטו, אורך, נטייה, מרחק, ואז שולי
 * הדו-משמעות. סדר אחר היה מייצר recall אחר מזה שהריצה תיתן.
 */
function makeFastEval(P) {
  const bands = P.bands;
  const wv = new Float64Array(OP_KEYS.length);
  for (let j = 0; j < OP_KEYS.length; j++) wv[j] = P.W[OP_KEYS[j]];
  const anyT = bands.some(b => b.t > 0);
  const thr = len => {
    for (const b of bands) if (len <= b.maxLen) return b.t;
    return bands[bands.length - 1].t;
  };
  const tcache = new Float64Array(256);
  for (let l = 0; l < 256; l++) tcache[l] = thr(l);
  return { wv, anyT, tcache, minLen: P.minLen, margin: P.vetoMargin, useLex: P.useLexicon !== false };
}

/* ‏nAcc/tp סופרים **רק שורות accept מהימנות**, וזה המונה שהכושר רואה. nAccAll/tpAll
   סופרים את הכול, ומדווחים לצד כדי שגודל האפקט של ההוצאה יהיה גלוי. ‏fa אינו מסתכל על
   trusted בכלל · קבלת שורה שתויגה reject היא כשל, מהימנה או לא. faReal הוא אותו מונה
   מצומצם לדלי real-word, מספר הבטיחות החשוב ביותר בריצה. */
function evalSubset(S, idx, E) {
  const { flags, tLen, dOwn, dOther, off, pLen, pCnt } = S;
  const K = OP_KEYS.length;
  let tp = 0, nAcc = 0, fa = 0, nRej = 0, tpAll = 0, nAccAll = 0, faReal = 0, nRejReal = 0, faToday = 0;
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const f = flags[i];
    const isAcc = (f & 8) !== 0;
    const trusted = (f & 16) !== 0;
    const realWord = (f & 32) !== 0;
    if (isAcc) { nAccAll++; if (trusted) nAcc++; }
    else { nRej++; if (realWord) nRejReal++; }
    let ok = false;
    if (f & 4) ok = true;                                        // מתקבל היום · שכבה 1
    else if (f & 1) ok = false;                                  // וטו מבני
    else if (E.useLex && (f & 64)) ok = false;                   // וטו הלקסיקון · שכבה 2ב
    else if (tLen[i] < E.minLen) ok = false;
    else if (f & 2) ok = false;                                  // נטייה
    else if (!E.anyT) ok = false;
    else {
      const hi = off[i + 1];
      for (let p = off[i]; p < hi; p++) {
        const L = pLen[p];
        const t = E.tcache[L < 256 ? L : 255];
        if (!(t > 0)) continue;
        let cost = 0;
        const base = p * K;
        for (let j = 0; j < K; j++) cost += pCnt[base + j] * E.wv[j];
        if (cost <= t) { ok = true; break; }
      }
      if (ok && E.margin > 0 && (dOther[i] - dOwn[i]) < E.margin) ok = false;
    }
    if (ok) {
      if (isAcc) { tpAll++; if (trusted) tp++; }
      else { fa++; if (realWord) faReal++; if (f & 4) faToday++; }
    }
  }
  return {
    tp, nAcc, fa, nRej, recall: nAcc ? tp / nAcc : 0,
    tpAll, nAccAll, recallAll: nAccAll ? tpAll / nAccAll : 0,
    nUntrustedAccept: nAccAll - nAcc, tpUntrusted: tpAll - tp,
    faRealWord: faReal, nRejectRealWord: nRejReal,
    /* קבלות-שווא שהגיעו משכבה 1 · ההתנהגות של היום, לא של הגנום. מדווחות בנפרד כדי
       ששער לא ייכשל על משהו שאף פרמטר אינו יכול לגרום לו או למנוע. */
    faToday, faOwn: fa - faToday
  };
}

/* ‏recall לפי אורך המילה שאליה מכוונים (letters של המפתח, לא של המוקלד) · הפילוח
   שחשף בריצה הקודמת ש-4 אותיות באנגלית עומד על 4.3% ושעברית קצרה סמוכה לאפס. הדליים
   הם 3..11 ואז "12+" · מתחת ל-3 אין שורות (MIN_LEN בדאטהסט). */
function recallByLength(S, idx, E) {
  const buckets = new Map();
  const one = new Int32Array(1);
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const L = S.kLen[i];
    const b = L >= 12 ? '12+' : String(L);
    let e = buckets.get(b);
    if (!e) { e = { len: b, nAccept: 0, tp: 0, nReject: 0, fa: 0 }; buckets.set(b, e); }
    one[0] = i;
    const r = evalSubset(S, one, E);
    e.nAccept += r.nAcc; e.tp += r.tp; e.nReject += r.nRej; e.fa += r.fa;
  }
  const out = Array.from(buckets.values()).sort((a, b) => (a.len === '12+' ? 99 : +a.len) - (b.len === '12+' ? 99 : +b.len));
  for (const e of out) e.recall = e.nAccept ? e.tp / e.nAccept : null;
  return out;
}

function complexityOf(P) {
  let s = 0;
  for (const b of P.bands) s += b.t;
  return s / (P.bands.length * 3);
}

/* ‏allowed · תקציב קבלות-השווא בשורות (לא בשיעור) של תת-הקבוצה הנמדדת. אפס משחזר
   בדיוק את הכושר הקודם: ‎-1e6×fa מתחת לתקציב, ו-recall פחות קנס מעליו · כך שנקודת
   התקציב 0 בסריקה חייבת לצאת זהה לריצת ברירת המחדל, וזה נבדק.
   ‏xfa · התנגשויות חוצות-כרטיסים. הן נספרות באותו מונה בדיוק, כי מבחינת הלומד אין
   הבדל בין "קיבל תשובה של כרטיס אחר" לבין "קיבל שלילית מהדאטהסט" · שתיהן תשובה
   שגויה שאושרה. */
const FA_TIE = 1e-3;
function fitnessOf(res, P, allowed, xfa) {
  const fa = res.fa + (xfa || 0);
  const lim = allowed || 0;
  if (fa > lim) return -1e6 * (fa - lim);
  const tie = lim > 0 ? FA_TIE * (fa / lim) : 0;
  return res.recall - COMPLEXITY_W * complexityOf(P) - tie;
}

/* ===== המסלול המדויק · אותה החלטה, ב-wEditDist האמיתית ובלי שום קיצור ===== */
function exactEval(rows, params, langs) {
  const checkers = {};
  const out = {
    tp: 0, nAcc: 0, fa: 0, nRej: 0, tpAll: 0, nAccAll: 0,
    faRealWord: 0, nRejectRealWord: 0, realWordFalseAccepts: [],
    byOp: new Map(), byLen: new Map(), falseAccepts: []
  };
  for (const r of rows) {
    const ckKey = r.lang + '|' + r.set;
    let ck = checkers[ckKey];
    if (!ck) {
      const L = langs[r.lang];
      ck = checkers[ckKey] = makeChecker(params, L.ctx, L.veto, r.lang);
    }
    const card = langs[r.lang].byCard.get(r.term + '|' + r.unit);
    const v = r.set === 'gloss' ? ck.acceptGloss(r.typed, card) : ck.acceptWord(r.typed, card);
    const isAcc = r.label === 'accept';
    const trusted = r.trusted !== false;
    const realWord = r.why === 'real-word';
    if (isAcc) { out.nAccAll++; if (trusted) out.nAcc++; }
    else { out.nRej++; if (realWord) out.nRejectRealWord++; }
    const fam = String(r.op).split('/')[0];
    let b = out.byOp.get(fam);
    if (!b) { b = { nAcc: 0, tp: 0, nRej: 0, fa: 0, nAccAll: 0, tpAll: 0 }; out.byOp.set(fam, b); }
    const lk = r.kLen >= 12 ? '12+' : String(r.kLen);
    let g = out.byLen.get(lk);
    if (!g) { g = { nAcc: 0, tp: 0, nRej: 0, fa: 0 }; out.byLen.set(lk, g); }
    if (isAcc) { b.nAccAll++; if (trusted) { b.nAcc++; g.nAcc++; } }
    else { b.nRej++; g.nRej++; }
    if (v.ok) {
      if (isAcc) {
        out.tpAll++; b.tpAll++;
        if (trusted) { out.tp++; b.tp++; g.tp++; }
      } else {
        out.fa++; b.fa++; g.fa++;
        if (realWord) {
          out.faRealWord++;
          if (out.realWordFalseAccepts.length < 25) out.realWordFalseAccepts.push({ typed: r.typed, key: r.key, term: r.term, op: r.op, via: v.via, dist: v.dist });
        }
        if (out.falseAccepts.length < 25) out.falseAccepts.push({ typed: r.typed, key: r.key, term: r.term, why: r.why, op: r.op, via: v.via, dist: v.dist });
      }
    }
  }
  out.recall = out.nAcc ? out.tp / out.nAcc : 0;
  out.recallAll = out.nAccAll ? out.tpAll / out.nAccAll : 0;
  out.nUntrustedAccept = out.nAccAll - out.nAcc;
  out.tpUntrusted = out.tpAll - out.tp;
  return out;
}

/* ===== ריצת GA אחת על תת-קבוצה ===== */
/* ‏useLex אינו גן ואינו נבחר · הוא נקבע מבחוץ, והריצה הנגדית היא הדרך היחידה למדוד
   כמה השכבה תרמה. אילו היה גן, ה-GA היה מכבה אותו בדור הראשון (הוא עולה recall) והיה
   חוזר בדיוק לנקודת הכשל של v2. */
function paramsFor(g, useLex) {
  return normalizeParams(Object.assign(genomeToParams(g), { useLexicon: useLex !== false }));
}

function evolveOn(S, trainIdx, seedStr, logSink, tag, useLex, opts) {
  const o = opts || {};
  const X = o.cross || null;                    // חבילת השליליות החוצות-כרטיסים
  const xIdx = o.crossIdx || null;
  const allowed = o.allowed || 0;
  const seeds = SEED_PARAMS.map(paramsToGenome);
  /* מרחב של 21 גנים במקום 16 · אוכלוסייה וסבלנות גדולות יותר לריצות הראשיות. הסריקה
     נשארת בברירת המחדל כי היא ממילא מאוחדת על פני כל הנקודות. */
  const res = runGA(Object.assign({
    spec: GENES,
    seeds,
    seed: fnv1a(seedStr),
    fitness: g => {
      const P = paramsFor(g, useLex);
      const E = makeFastEval(P);
      const xfa = X ? evalSubset(X, xIdx, E).fa : 0;
      return fitnessOf(evalSubset(S, trainIdx, E), P, allowed, xfa);
    },
    onGen: rec => { if (logSink) logSink(Object.assign({ tag }, rec)); }
  }, o.ga || {}));
  return res;
}

/* ===== סריקת התקציב =====
 *
 * חגי הסיר את האילוץ שהיה מחייב · אפס קבלות-שווא · והחליף אותו בתקציב. זו שאלה אחרת
 * מ"מה הנקודה הטובה ביותר", ולכן היא נענית בעקומה ולא בנקודה: לכל תקציב, איזה recall
 * הוא קונה, ומה **הרכב** קבלות-השווא שהוא מייצר.
 *
 * התקציב נמדד בשורות ולא בשיעור בתוך הכושר, כי הכושר מסתכל על תת-קבוצה שגודלה משתנה
 * (‏4/5 באימון, הכל בריצה הסופית). ‏allowed = floor(budget × |תת-הקבוצה|).
 *
 * ההתנגשויות החוצות-כרטיסים נספרות **במלואן** מול תקציב שגודלו נגזר מקבוצת האימון,
 * ולא מפוצלות ל-holdout · הן אינן "תשובה שלומד הקליד" אלא תכונה מבנית של המאגר, ואין
 * להן חלוקת folds. זו החמרה מכוונת: הן נספרות בכל הערכה ובכל תקציב.
 */
function runSweep(set, S, X, xI, nonHold, nhArr, hoArr, budgets, cvMeanRef) {
  const out = [];
  for (const b of budgets) {
    const allowedFinal = Math.floor(b * nonHold.length);
    const valR = [];
    for (let f = 0; f < 5; f++) {
      const tr = [], va = [];
      for (const i of nonHold) (S.fold[i] === f ? va : tr).push(i);
      const r = evolveOn(S, Int32Array.from(tr), `${SEED}|${set}|b${b}|fold${f}`, null, null, true,
        { cross: X, crossIdx: xI, allowed: Math.floor(b * tr.length) });
      const E = makeFastEval(paramsFor(r.best, true));
      valR.push(evalSubset(S, Int32Array.from(va), E).recall);
    }
    const cvMean = valR.reduce((a, c) => a + c, 0) / valR.length;
    const cvSd = Math.sqrt(valR.reduce((a, c) => a + (c - cvMean) * (c - cvMean), 0) / valR.length);

    const fin = evolveOn(S, nhArr, `${SEED}|${set}|b${b}|final`, null, null, true,
      { cross: X, crossIdx: xI, allowed: allowedFinal });
    const P = paramsFor(fin.best, true);
    const E = makeFastEval(P);
    const ho = evalSubset(S, hoArr, E);
    const ev = evalSubset(S, nhArr, E);
    const xr = X && X.N ? evalSubset(X, xI, E) : { fa: 0 };
    const buckets = faBuckets(S, hoArr, E);
    if (xr.fa) buckets['cross-card-bank'] = (buckets['cross-card-bank'] || 0) + xr.fa;

    out.push({
      budget: b, budgetLabel: b === 0 ? '0' : `1/${Math.round(1 / b)}`,
      allowedOnEvolveSet: allowedFinal,
      cvMean, cvSd,
      evolveRecall: ev.recall, evolveFalseAccepts: ev.fa,
      holdoutRecall: ho.recall, holdoutFalseAccepts: ho.fa,
      holdoutRate: hoArr.length ? ho.fa / hoArr.length : 0,
      crossCardCollisions: xr.fa,
      totalFalseAccepts: ho.fa + xr.fa,
      buckets,
      shipGate: (ho.fa + xr.fa) <= Math.floor(b * hoArr.length) && ho.recall >= cvMean - 2 * cvSd,
      params: P, genome: fin.best
    });
    say(`  תקציב ${(b === 0 ? '0' : '1/' + Math.round(1 / b)).padStart(8)} · holdout recall ${(ho.recall * 100).toFixed(2)}% · FA ${String(ho.fa).padStart(4)} (1/${ho.fa ? Math.round(hoArr.length / ho.fa) : '∞'}) · חוצי-כרטיסים ${String(xr.fa).padStart(3)} · ${Object.entries(buckets).map(([k, v]) => k + ':' + v).join(' ') || 'אין'}`);
  }
  return out;
}

/* ===== התקרה הכנה ===== */
const PERMISSIVE = margin => normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 999 }], W: {}, vetoMargin: margin });

function reachableCeiling(S, idx, margin) {
  /* גנום מתירני לחלוטין · כל סף אינסופי, אורך מינימלי 0. מה שהוא לא מקבל, אף גנום
     לא יקבל: הוא נחסם מבנית (וטו, נטייה, שולי דו-משמעות) או שאין לו מועמד בטווח. */
  return evalSubset(S, idx, makeFastEval(PERMISSIVE(margin)));
}

/* השורות שקושרות את הידיים · אלה שמתקבלות בגנום המתירני ביותר ובכל זאת מתויגות
   "חובה-לדחות". כל עוד אחת מהן שורדת, עונש המוות דוחף את ה-GA לשוליים גדולים יותר,
   וכל הסט משלם על כך ב-recall. הן נכתבות לארטיפקט בשמן: זו רשימה קצרה שאפשר להסתכל
   עליה ולהכריע, ולא "התוצאה יצאה נמוכה". */
function bindingRejects(S, margin, limit) {
  const E = makeFastEval(PERMISSIVE(margin));
  const one = new Int32Array(1);
  const out = [];
  for (let i = 0; i < S.N; i++) {
    if (S.flags[i] & 8) continue;
    one[0] = i;
    if (evalSubset(S, one, E).fa) out.push(S.rows[i]);
  }
  const groups = {};
  for (const r of out) {
    const k = String(r.op).split('/')[0] + ' · ' + String(r.why).split(':')[0];
    const g = groups[k] || (groups[k] = { count: 0, examples: [] });
    g.count++;
    if (g.examples.length < (limit || 6)) g.examples.push(`"${r.typedKey}" ~ "${r.key}" (${r.why})`);
  }
  return { total: out.length, groups };
}

/* ===== טבלת הזהב ===== */
function buildGolden(rowsBySet, params, langs) {
  const strata = new Map();
  let total = 0;
  for (const set of SETS) for (const r of rowsBySet[set]) {
    const k = `${r.set}|${String(r.op).split('/')[0]}|${r.label}`;
    let a = strata.get(k);
    if (!a) { a = []; strata.set(k, a); }
    a.push(r);
    total++;
  }
  const out = [];
  const keys = Array.from(strata.keys()).sort();
  const checkers = {};
  for (const k of keys) {
    const arr = strata.get(k);
    /* מכסה יחסית לגודל השכבה, אבל לא פחות מ-5 · אופרטור נדיר (‏ie/ei, 32 שורות בסך
       הכול) חייב להופיע בטבלה, אחרת הבדיקה שתריץ אותה מחדש לא תיגע בו לעולם. */
    const quota = Math.max(5, Math.round(GOLDEN_TARGET * arr.length / total));
    const n = Math.min(quota, arr.length);
    const rnd = mulberry32(seedFor(SEED, 'golden', k));
    const a = arr.slice();
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rnd() * (a.length - i));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    for (const r of a.slice(0, n)) {
      /* המפתח הוא שפה **וסט**, לא שפה. שורות ה-gloss של המאגר האנגלי הן lang=en אבל
         סט gloss, ומטמון לפי שפה בלבד היה מגיש להן את הפרמטרים של en-word · 1,333
         החלטות שגויות בטבלה, שנתפסו בהרצה החוזרת של selfcheck34. */
      const ckKey = r.lang + '|' + r.set;
      let ck = checkers[ckKey];
      if (!ck) {
        const L = langs[r.lang];
        ck = checkers[ckKey] = makeChecker(params[r.set], L.ctx, L.veto, r.lang);
      }
      const card = langs[r.lang].byCard.get(r.term + '|' + r.unit);
      const cands = r.set === 'gloss'
        ? Array.from(acceptedSegs(card, langs[r.lang].ctx)).sort()
        : Array.from(acceptedKeys(card, langs[r.lang].ctx)).sort();
      const v = r.set === 'gloss' ? ck.acceptGloss(r.typed, card) : ck.acceptWord(r.typed, card);
      out.push({
        set: r.set, lang: r.lang, dir: r.set === 'gloss' ? 'gloss' : 'word',
        term: r.term, unit: r.unit, typed: r.typed, candidates: cands,
        verdict: { ok: v.ok, via: v.via || null, why: v.why || null, dist: v.dist == null ? null : Number(v.dist.toFixed(6)) },
        /* ‏label לבדו כבר לא מספיק כדי לקרוא שורה בטבלה: accept לא-מהימן אינו כישלון
           כשהוא נדחה, ו-reject/real-word הוא הכשל היקר ביותר כשהוא מתקבל. שני השדות
           נכתבים כדי שהקורא יבחין ביניהם בלי לחזור לדאטהסט. */
        label: r.label, trusted: r.trusted !== false, why: r.why
      });
    }
  }
  out.sort((a, b) => (a.set < b.set ? -1 : a.set > b.set ? 1 : 0) || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0) || (a.typed < b.typed ? -1 : a.typed > b.typed ? 1 : 0));
  return out;
}

/* ===== ראשי ===== */
function main() {
  const T0 = Date.now();
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

  say('טעינה וקדם-חישוב ...');
  const { perSet, langs } = loadRows();

  say('בניית השליליות החוצות-כרטיסים (עומק ' + CAND_CAP + ', פעם אחת) ...');
  const tX = Date.now();
  const cross = buildCrossCard(langs, perSet);
  for (const [k, v] of Object.entries(cross.stats)) {
    say(`  ${k} · ${v.forms} צורות · ${v.pairs} זוגות חוצי-כרטיסים · ${v.blocked} נחסמו מבנית · ${v.kept} נשארו בלולאה · ${v.todaySkip} מתקבלים היום`);
  }
  say(`  ${((Date.now() - tX) / 1000).toFixed(1)}s`);

  const gaLog = [];
  const logSink = rec => gaLog.push(rec);
  const results = {};
  const params = {};

  const crossPacks = {}, crossIdx = {};
  for (const set of SETS) {
    crossPacks[set] = packSet(cross.rows[set]);
    crossIdx[set] = Int32Array.from({ length: crossPacks[set].N }, (_, i) => i);
  }

  for (const set of SETS) {
    const rows = perSet[set];
    const S = packSet(rows);
    const N = S.N;
    const X = crossPacks[set], xI = crossIdx[set];
    const xOpts = { cross: X, crossIdx: xI };
    const nonHold = [], holdout = [];
    for (let i = 0; i < N; i++) (S.hold[i] ? holdout : nonHold).push(i);
    const nhArr = Int32Array.from(nonHold), hoArr = Int32Array.from(holdout);

    let nAccAll = 0, nUntrusted = 0, nUntrustedRej = 0, nRealWord = 0;
    for (let i = 0; i < N; i++) {
      const f = S.flags[i];
      if (f & 8) nAccAll++;
      if (!(f & 16)) { nUntrusted++; if (!(f & 8)) nUntrustedRej++; }
      if (f & 32) nRealWord++;
    }
    const ceilShare = nAccAll / N;

    say(`\n===== ${set} · ${N} שורות · ${nonHold.length} לאבולוציה · ${holdout.length} holdout · ${(ceilShare * 100).toFixed(1)}% מתויגות accept =====`);
    say(`  ‏trusted:false · ${nUntrusted} שורות מוצאות ממונה ה-recall (מתוכן ${nUntrustedRej} מתויגות reject · אלה עדיין נספרות כקבלות-שווא)`);
    say(`  ‏why=real-word · ${nRealWord} שליליות קשות · קבלת-שווא עליהן נספרת ומודפסת בנפרד`);
    /* מה השכבה החדשה עושה לנתונים · כמה שורות היא חוסמת, וכמה מהן היא חוסמת בטעות. */
    let nLex = 0, nLexAcc = 0, nLexAccTrusted = 0, nLexReal = 0;
    for (let i = 0; i < N; i++) {
      const f = S.flags[i];
      if (!(f & 64)) continue;
      nLex++;
      if (f & 8) { nLexAcc++; if (f & 16) nLexAccTrusted++; }
      if (f & 32) nLexReal++;
    }
    say(`  וטו הלקסיקון · חוסם ${nLex} שורות · מתוכן ${nLexReal} real-word (הרווח) ו-${nLexAcc} accept (המחיר · ${nLexAccTrusted} מהימנות)`);

    /* ---- 5-fold CV ---- */
    const folds = [];
    for (let f = 0; f < 5; f++) {
      const tr = [], va = [];
      for (const i of nonHold) (S.fold[i] === f ? va : tr).push(i);
      const trA = Int32Array.from(tr), vaA = Int32Array.from(va);
      const r = evolveOn(S, trA, `${SEED}|${set}|fold${f}`, logSink, `${set}/fold${f}`, true, Object.assign({ ga: BIG_GA }, xOpts));
      const P = normalizeParams(genomeToParams(r.best));
      const E = makeFastEval(P);
      const trRes = evalSubset(S, trA, E), vaRes = evalSubset(S, vaA, E);
      folds.push({
        fold: f, nTrain: tr.length, nVal: va.length, generations: r.generations,
        trainRecall: trRes.recall, valRecall: vaRes.recall,
        trainFalseAccepts: trRes.fa, valFalseAccepts: vaRes.fa,
        valRealWordFalseAccepts: vaRes.faRealWord,
        valRecallIncludingUntrusted: vaRes.recallAll,
        vetoMargin: P.vetoMargin, minLen: P.minLen,
        params: P
      });
      say(`  fold ${f} · דורות ${r.generations} · שוליים ${P.vetoMargin} · train recall ${(trRes.recall * 100).toFixed(2)}% (FA ${trRes.fa}) · val recall ${(vaRes.recall * 100).toFixed(2)}% (FA ${vaRes.fa} · real-word ${vaRes.faRealWord})`);
    }
    const gaps = folds.map(f => f.trainRecall - f.valRecall);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const valR = folds.map(f => f.valRecall);
    const cvMean = valR.reduce((a, b) => a + b, 0) / valR.length;
    const cvSd = Math.sqrt(valR.reduce((a, b) => a + (b - cvMean) * (b - cvMean), 0) / valR.length);
    const anyValFA = folds.some(f => f.valFalseAccepts > 0);
    const overfit = meanGap > 0.03;
    if (anyValFA) say(`  ⛔ יש fold עם קבלות-שווא ב-validation · זה חור בווטו, לא כיול`);
    if (overfit) say(`  ⚠ פער train-val ממוצע ${(meanGap * 100).toFixed(2)}% · מעל הסף 3%`);

    /* ---- אבולוציה סופית על כל מה שאינו holdout ---- */
    const fin = evolveOn(S, nhArr, `${SEED}|${set}|final`, logSink, `${set}/final`, true, Object.assign({ ga: BIG_GA }, xOpts));
    const P = normalizeParams(genomeToParams(fin.best));
    const E = makeFastEval(P);
    const trainRes = evalSubset(S, nhArr, E);
    const holdRes = evalSubset(S, hoArr, E);
    const ceilNH = reachableCeiling(S, nhArr, P.vetoMargin);
    const ceilHO = reachableCeiling(S, hoArr, P.vetoMargin);

    say(`  סופי · דורות ${fin.generations} · אבולוציה recall ${(trainRes.recall * 100).toFixed(2)}% (FA ${trainRes.fa}) · holdout recall ${(holdRes.recall * 100).toFixed(2)}% (FA ${holdRes.fa})`);
    say(`  תקרה בת-השגה · אבולוציה ${(ceilNH.recall * 100).toFixed(2)}% · holdout ${(ceilHO.recall * 100).toFixed(2)}%`);
    /* אותו גנום, שני מונים · המספר שהכושר ראה מול המספר אילו הלא-מהימנות היו בפנים.
       הפער הזה הוא כל מה שהחלטת ההוצאה עשתה, והוא מודפס כדי שלא יהיה סמוי. */
    say(`  ‏recall בלי הלא-מהימנות (המונה שהכושר ראה) · אבולוציה ${(trainRes.recall * 100).toFixed(2)}% · holdout ${(holdRes.recall * 100).toFixed(2)}%`);
    say(`  ‏recall אילו נכללו · אבולוציה ${(trainRes.recallAll * 100).toFixed(2)}% (${trainRes.tpUntrusted}/${trainRes.nUntrustedAccept} לא-מהימנות התקבלו) · holdout ${(holdRes.recallAll * 100).toFixed(2)}% (${holdRes.tpUntrusted}/${holdRes.nUntrustedAccept})`);
    say(`  ‏קבלות-שווא על real-word · אבולוציה ${trainRes.faRealWord}/${trainRes.nRejectRealWord} · holdout ${holdRes.faRealWord}/${holdRes.nRejectRealWord}`);

    /* נקודות ההפעלה החלופיות · אותו גנום, שולי דו-משמעות אחרים. זה המספר היחיד בדוח
       שחגי באמת צריך להכריע עליו, ולכן הוא נמדד ומודפס ולא נשאר בראש של מי שהריץ. */
    const alt = {};
    for (const m of [1, 2, 3]) {
      const Pm = normalizeParams(Object.assign({}, genomeToParams(fin.best), { vetoMargin: m }));
      const Em = makeFastEval(Pm);
      const a1 = evalSubset(S, nhArr, Em), a2 = evalSubset(S, hoArr, Em);
      alt[m] = {
        evolveRecall: a1.recall, evolveFalseAccepts: a1.fa, evolveRealWordFalseAccepts: a1.faRealWord,
        holdoutRecall: a2.recall, holdoutFalseAccepts: a2.fa, holdoutRealWordFalseAccepts: a2.faRealWord,
        evolveRecallIncludingUntrusted: a1.recallAll, holdoutRecallIncludingUntrusted: a2.recallAll
      };
      say(`  שוליים=${m} · אבולוציה recall ${(a1.recall * 100).toFixed(2)}% (FA ${a1.fa} · real-word ${a1.faRealWord}) · holdout ${(a2.recall * 100).toFixed(2)}% (FA ${a2.fa} · real-word ${a2.faRealWord})`);
    }

    /* ה-CV למעלה מודד את ה**נוהל** (לאמן מחדש על 4/5), ולכן הוא יכול לנחות באגן אחר
       מזה של הריצה הסופית · en-word הוא בדיוק המקרה, שלושה folds מצאו שוליים=1 אפשריים
       על 80% מהנתונים והריצה המלאה לא. השורה הזאת מודדת שאלה אחרת ולא פחות חשובה:
       האם ה**קונפיגורציה הנשלחת** מכלילה, כלומר איך הפרמטרים הסופיים מתנהגים על כל
       חמישיית האימות. שתי השאלות מדווחות, כי כל אחת לבדה מטעה. */
    const fixedByFold = [];
    for (let f = 0; f < 5; f++) {
      const va = [];
      for (const i of nonHold) if (S.fold[i] === f) va.push(i);
      const rf = evalSubset(S, Int32Array.from(va), E);
      fixedByFold.push({ fold: f, recall: rf.recall, falseAccepts: rf.fa });
    }
    say(`  הפרמטרים הסופיים על חמשת ה-folds · ${fixedByFold.map(x => (x.recall * 100).toFixed(1) + '%/FA' + x.falseAccepts).join(' · ')}`);

    /* מה שקושר את הידיים בשוליים ההדוקים פחות · תמיד מודפס, גם כשהכול ירוק. */
    const binding = bindingRejects(S, 1, 6);
    say(`  מה שחוסם שוליים=1 · ${binding.total} שורות: ${Object.entries(binding.groups).map(([k, v]) => k + ' ×' + v.count).join(' · ') || 'אין'}`);
    for (const [k, v] of Object.entries(binding.groups)) for (const e of v.examples.slice(0, 3)) say(`     ${k} ${e}`);

    /* שער המשלוח הוא מה שהתוכנית קובעת · אפס קבלות-שווא ב-holdout ו-recall בטווח.
       ‏anyValFA מדווח בנפרד ואינו חלק ממנו: הוא דגל על **כיול** שלא הכליל, ולא על
       תוצאה שנכשלה, ובלבול בין השניים היה מסתיר את הראשון מאחורי השני. */
    /* התנגשויות חוצות-כרטיסים בנקודת ההפעלה הסופית · חלק מהשער, לא נספח. גנום שנקי
       על הדאטהסט ומתנגש במאגר אינו נקי. */
    const xRes = evalSubset(X, xI, E);
    const xList = [];
    for (let i = 0; i < X.N && xList.length < 40; i++) {
      const one = Int32Array.of(i);
      if (evalSubset(X, one, E).fa) { const r = X.rows[i]; xList.push({ typed: r.typed, card: r.term, unit: r.unit, intruder: r.intruder }); }
    }
    say(`  התנגשויות חוצות-כרטיסים · ${xRes.fa} מתוך ${X.N} זוגות בסיכון`);
    for (const h of xList.slice(0, 6)) say(`     "${h.typed}" מתקבל על "${h.card}" (וריאציה של "${h.intruder}")`);

    const lo = cvMean - 2 * cvSd;
    const ship = holdRes.fa === 0 && xRes.fa === 0 && holdRes.recall >= lo;
    say(`  שער משלוח · FA=${holdRes.fa} · recall ${(holdRes.recall * 100).toFixed(2)}% מול רצפה ${(lo * 100).toFixed(2)}% → ${ship ? 'עובר' : 'נופל'}${anyValFA ? ' (עם דגל val-FA פתוח)' : ''}`);

    /* ---- הריצה הנגדית · אותו קוד, אותו זרע, בלי שכבת הלקסיקון ----
       בלי זה, "הלקסיקון עזר" הוא היסק מהשוואה בין שתי ריצות שגם הנתונים שלהן שונים,
       ואי אפשר לדעת כמה מהשיפור בא מתיקון התוויות F7b וכמה מהשכבה. עם זה שני האפקטים
       מופרדים במדידה: v3-בלי-לקסיקון מול v2 הוא תיקון התוויות, ו-v3-עם מול v3-בלי הוא
       הלקסיקון. */
    const noLexFin = evolveOn(S, nhArr, `${SEED}|${set}|final|nolex`, null, `${set}/nolex`, false, xOpts);
    const Pnl = paramsFor(noLexFin.best, false);
    const Enl = makeFastEval(Pnl);
    const nlTrain = evalSubset(S, nhArr, Enl), nlHold = evalSubset(S, hoArr, Enl);
    /* ואותה נקודת הפעלה סופית בלי השכבה · כמה קבלות-שווא היא הייתה פותחת */
    const sameNoLex = evalSubset(S, hoArr, makeFastEval(Object.assign({}, P, { useLexicon: false })));
    say(`  נגדי · בלי לקסיקון · שוליים ${Pnl.vetoMargin} · אבולוציה ${(nlTrain.recall * 100).toFixed(2)}% (FA ${nlTrain.fa} · real-word ${nlTrain.faRealWord}) · holdout ${(nlHold.recall * 100).toFixed(2)}% (FA ${nlHold.fa} · real-word ${nlHold.faRealWord})`);
    say(`  נגדי · הפרמטרים הסופיים בלי השכבה · holdout recall ${(sameNoLex.recall * 100).toFixed(2)}% · FA ${sameNoLex.fa} (real-word ${sameNoLex.faRealWord})`);

    /* ‏recall לפי אורך המילה · הפילוח שחשף בריצה הקודמת את הקריסה במילים הקצרות. */
    const rblNH = recallByLength(S, nhArr, E), rblHO = recallByLength(S, hoArr, E);
    say(`  ‏recall לפי אורך המפתח (אבולוציה) · ${rblNH.map(b => b.len + ':' + (b.recall == null ? '—' : (b.recall * 100).toFixed(1) + '%') + '(' + b.nAccept + ')').join(' ')}`);

    /* ---- סריקת התקציב ---- */
    const BUDGETS = [0, 1 / 50000, 1 / 20000, 1 / 10000, 1 / 7000, 1 / 5000, 1 / 2000, 1 / 1000];
    /* לעברית נשאלה שאלה מפורשת · האם 90% בהישג יד בתקציב כלשהו. לכן הסריקה שלה
       ממשיכה מעבר לרשימה עד שהיא חוצה או עד שהתקציב מגוחך. */
    const EXTRA = set === 'he-word' ? [1 / 500, 1 / 200, 1 / 100, 1 / 50, 1 / 20, 1 / 10, 1 / 5, 1 / 2] : [];
    say(`  סריקת תקציב · ${BUDGETS.length + EXTRA.length} נקודות`);
    const sweep = runSweep(set, S, X, xI, nonHold, nhArr, hoArr, BUDGETS.concat(EXTRA));

    params[set] = P;
    results[set] = {
      rowsTotal: N, rowsEvolve: nonHold.length, rowsHoldout: holdout.length,
      acceptShare: ceilShare,
      /* הטיפול בשורות הלא-מהימנות, כתוב בארטיפקט ולא רק בקונסולה · מי שיקרא את
         typo-rules.json בעוד חודש חייב לדעת מה יצא מהמונה ומה זה עשה למספר. */
      untrusted: {
        policy: 'excluded from the recall denominator and numerator; still counted as a false accept if labelled reject',
        rows: nUntrusted, rejectRows: nUntrustedRej,
        evolveRecallExcluding: trainRes.recall, evolveRecallIncluding: trainRes.recallAll,
        holdoutRecallExcluding: holdRes.recall, holdoutRecallIncluding: holdRes.recallAll,
        evolveUntrustedAccepted: trainRes.tpUntrusted, evolveUntrustedTotal: trainRes.nUntrustedAccept,
        holdoutUntrustedAccepted: holdRes.tpUntrusted, holdoutUntrustedTotal: holdRes.nUntrustedAccept
      },
      /* שכבת הלקסיקון · מה היא חוסמת, ומה קורה בלעדיה. שתי השורות האחרונות הן
         האטריבוציה: counterfactual הוא ריצת GA שלמה בלי השכבה, ו-sameParams הוא אותה
         נקודת הפעלה בלי השכבה. */
      lexicon: {
        available: LEX_AVAILABLE,
        blockedRows: nLex, blockedRealWord: nLexReal, blockedAccept: nLexAcc, blockedAcceptTrusted: nLexAccTrusted,
        counterfactual: {
          vetoMargin: Pnl.vetoMargin, minLen: Pnl.minLen,
          evolveRecall: nlTrain.recall, evolveFalseAccepts: nlTrain.fa, evolveRealWordFalseAccepts: nlTrain.faRealWord,
          holdoutRecall: nlHold.recall, holdoutFalseAccepts: nlHold.fa, holdoutRealWordFalseAccepts: nlHold.faRealWord
        },
        sameParamsWithoutLexicon: { holdoutRecall: sameNoLex.recall, holdoutFalseAccepts: sameNoLex.fa, holdoutRealWordFalseAccepts: sameNoLex.faRealWord }
      },
      realWord: {
        rows: nRealWord,
        evolveFalseAccepts: trainRes.faRealWord, evolveRejectRows: trainRes.nRejectRealWord,
        holdoutFalseAccepts: holdRes.faRealWord, holdoutRejectRows: holdRes.nRejectRealWord
      },
      cv: { folds: folds.map(f => ({ fold: f.fold, nTrain: f.nTrain, nVal: f.nVal, generations: f.generations, trainRecall: f.trainRecall, valRecall: f.valRecall, valFalseAccepts: f.valFalseAccepts, valRealWordFalseAccepts: f.valRealWordFalseAccepts, valRecallIncludingUntrusted: f.valRecallIncludingUntrusted, vetoMargin: f.vetoMargin, minLen: f.minLen })), mean: cvMean, sd: cvSd, meanTrainValGap: meanGap, overfitFlag: overfit, anyValFalseAccepts: anyValFA },
      final: { generations: fin.generations, evaluations: fin.evaluations, fitness: fin.bestFit, recall: trainRes.recall, falseAccepts: trainRes.fa, reachableCeiling: ceilNH.recall },
      holdout: { recall: holdRes.recall, falseAccepts: holdRes.fa, realWordFalseAccepts: holdRes.faRealWord, reachableCeiling: ceilHO.recall, floor: lo, ship },
      recallByLength: { basis: 'letters of the card key the row was derived from', evolve: rblNH, holdout: rblHO },
      crossCard: {
        rowsInRisk: X.N, collisionsAtShipped: xRes.fa, examples: xList.slice(0, 20),
        note: 'cross-card pairs enumerated at MAX_OPS depth over every accepted form and every dataset should-accept variant; rows no genome in the gene space could accept are filtered out (provable, not heuristic). Gloss B1 expansion is not modelled here - bank_gate.js remains the final authority.'
      },
      budgetSweep: sweep.map(r => ({
        budget: r.budget, budgetLabel: r.budgetLabel, allowedOnEvolveSet: r.allowedOnEvolveSet,
        cvMean: r.cvMean, cvSd: r.cvSd,
        evolveRecall: r.evolveRecall, evolveFalseAccepts: r.evolveFalseAccepts,
        holdoutRecall: r.holdoutRecall, holdoutFalseAccepts: r.holdoutFalseAccepts, holdoutRate: r.holdoutRate,
        crossCardCollisions: r.crossCardCollisions, totalFalseAccepts: r.totalFalseAccepts,
        buckets: r.buckets, shipGate: r.shipGate,
        params: {
          minLen: r.params.minLen, vetoMargin: r.params.vetoMargin, useLexicon: r.params.useLexicon !== false,
          bands: r.params.bands.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: Number(b.t.toFixed(4)) })),
          W: Object.fromEntries(OP_KEYS.map(k => [k, Number(r.params.W[k].toFixed(4))]))
        }
      })),
      altMargins: alt,
      finalParamsByFold: fixedByFold,
      bindingAtMargin1: binding,
      genome: fin.best
    };
  }

  /* ---- תמחור מחדש מדויק · המנצח מול wEditDist האמיתית ---- */
  say('\nתמחור מחדש מדויק (wEditDist מלאה, בלי קירוב) ...');
  const exact = {};
  for (const set of SETS) {
    const rows = perSet[set];
    const nh = rows.filter(r => !r.holdout), ho = rows.filter(r => r.holdout);
    const e1 = exactEval(nh, params[set], langs);
    const e2 = exactEval(ho, params[set], langs);
    const apxR = results[set].final.recall, apxH = results[set].holdout.recall;
    const dR = Math.abs(e1.recall - apxR), dH = Math.abs(e2.recall - apxH);
    say(`  ${set} · אבולוציה recall מדויק ${(e1.recall * 100).toFixed(2)}% (FA ${e1.fa} · real-word ${e1.faRealWord}) · holdout ${(e2.recall * 100).toFixed(2)}% (FA ${e2.fa} · real-word ${e2.faRealWord})`);
    say(`     כולל לא-מהימנות · אבולוציה ${(e1.recallAll * 100).toFixed(2)}% · holdout ${(e2.recallAll * 100).toFixed(2)}%`);
    if (e1.faRealWord || e2.faRealWord) {
      say(`  ⛔ קבלות-שווא על מילים אמיתיות · זה הכשל היקר ביותר. דוגמאות:`);
      for (const x of e1.realWordFalseAccepts.concat(e2.realWordFalseAccepts).slice(0, 8)) say(`     "${x.typed}" ~ "${x.key}" (${x.op} · via ${x.via} · d=${x.dist})`);
    }
    if (dR > 0.005 || dH > 0.005 || e1.fa !== results[set].final.falseAccepts || e2.fa !== results[set].holdout.falseAccepts) {
      say(`  ⚠⚠ אזהרה · הקירוב והמסלול המדויק נפרדו ב-${set}: recall ${(apxR * 100).toFixed(2)}%→${(e1.recall * 100).toFixed(2)}% · holdout ${(apxH * 100).toFixed(2)}%→${(e2.recall * 100).toFixed(2)}% · קבלות-שווא ${results[set].final.falseAccepts}/${results[set].holdout.falseAccepts} → ${e1.fa}/${e2.fa}`);
    }
    if (e1.fa || e2.fa) {
      say(`  ⛔ קבלות-שווא במסלול המדויק · דוגמאות:`);
      for (const x of e1.falseAccepts.concat(e2.falseAccepts).slice(0, 8)) say(`     "${x.typed}" ~ "${x.key}" (${x.op} · ${x.why} · via ${x.via} · d=${x.dist})`);
    }
    const byOp = {};
    for (const [k, v] of Array.from(e1.byOp.entries()).concat(Array.from(e2.byOp.entries()))) {
      const b = byOp[k] || (byOp[k] = { nAcc: 0, tp: 0, nRej: 0, fa: 0, nAccAll: 0, tpAll: 0 });
      b.nAcc += v.nAcc; b.tp += v.tp; b.nRej += v.nRej; b.fa += v.fa; b.nAccAll += v.nAccAll; b.tpAll += v.tpAll;
    }
    const byLen = {};
    for (const [k, v] of Array.from(e1.byLen.entries()).concat(Array.from(e2.byLen.entries()))) {
      const b = byLen[k] || (byLen[k] = { nAcc: 0, tp: 0, nRej: 0, fa: 0 });
      b.nAcc += v.nAcc; b.tp += v.tp; b.nRej += v.nRej; b.fa += v.fa;
    }
    for (const k of Object.keys(byLen)) byLen[k].recall = byLen[k].nAcc ? byLen[k].tp / byLen[k].nAcc : null;
    exact[set] = {
      evolve: { recall: e1.recall, recallIncludingUntrusted: e1.recallAll, falseAccepts: e1.fa, realWordFalseAccepts: e1.faRealWord, nAccept: e1.nAcc, nAcceptAll: e1.nAccAll, nReject: e1.nRej, nRejectRealWord: e1.nRejectRealWord },
      holdout: { recall: e2.recall, recallIncludingUntrusted: e2.recallAll, falseAccepts: e2.fa, realWordFalseAccepts: e2.faRealWord, nAccept: e2.nAcc, nAcceptAll: e2.nAccAll, nReject: e2.nRej, nRejectRealWord: e2.nRejectRealWord },
      byOp, byLen,
      agreesWithApproximation: !(dR > 0.005 || dH > 0.005 || e1.fa !== results[set].final.falseAccepts || e2.fa !== results[set].holdout.falseAccepts)
    };
  }

  /* ---- פילוח לפי אופרטור ---- */
  say('\nrecall לפי אופרטור (מהמסלול המדויק):');
  for (const set of SETS) {
    const rows = Object.entries(exact[set].byOp).sort((a, b) => b[1].nAcc - a[1].nAcc);
    say(`  ${set}:`);
    for (const [op, b] of rows) {
      if (b.nAcc) say(`    ${op.padEnd(18)} accept ${String(b.nAcc).padStart(6)} · נתפסו ${(100 * b.tp / b.nAcc).toFixed(1).padStart(5)}%   reject ${String(b.nRej).padStart(6)} · קבלות-שווא ${b.fa}`);
      else say(`    ${op.padEnd(18)} accept      0            reject ${String(b.nRej).padStart(6)} · קבלות-שווא ${b.fa}`);
    }
  }

  /* ---- פילוח לפי אורך המפתח ---- */
  say('\n‏recall לפי אורך המפתח (מהמסלול המדויק · אבולוציה+holdout יחד · המונה בלי לא-מהימנות):');
  for (const set of SETS) {
    const ks = Object.keys(exact[set].byLen).sort((a, b) => (a === '12+' ? 99 : +a) - (b === '12+' ? 99 : +b));
    say(`  ${set}:`);
    for (const k of ks) {
      const b = exact[set].byLen[k];
      say(`    אורך ${k.padStart(3)} · accept ${String(b.nAcc).padStart(6)} · נתפסו ${b.nAcc ? (100 * b.tp / b.nAcc).toFixed(1).padStart(5) : '    —'}%   reject ${String(b.nRej).padStart(6)} · קבלות-שווא ${b.fa}`);
    }
  }

  /* ---- טבלת הזהב ---- */
  say('\nטבלת זהב ...');
  const golden = buildGolden(perSet, params, langs);
  fs.writeFileSync(path.join(OUT, 'golden.jsonl'), golden.map(g => JSON.stringify(g)).join('\n') + '\n', 'utf8');
  const gShaOk = golden.filter(g => g.verdict.ok).length;
  say(`  ${golden.length} החלטות · ${gShaOk} קבלות · ${golden.length - gShaOk} פסילות`);

  /* ---- ארטיפקטים ---- */
  fs.writeFileSync(path.join(OUT, 'ga-log.jsonl'), gaLog.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');

  const serialParams = {};
  for (const set of SETS) {
    const P = params[set];
    serialParams[set] = {
      minLen: P.minLen,
      vetoMargin: P.vetoMargin,
      /* נכתב במפורש · צרכן שיטען את הפרמטרים האלה בלי השכבה יקבל את המספרים של
         הריצה הנגדית, לא את אלה שבדוח. */
      useLexicon: P.useLexicon !== false,
      bands: P.bands.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: Number(b.t.toFixed(4)) })),
      W: Object.fromEntries(OP_KEYS.map(k => [k, Number(P.W[k].toFixed(4))]))
    };
  }
  const wall = (Date.now() - T0) / 1000;
  const out = {
    ver: SEED,
    generatedAt: new Date().toISOString().slice(0, 10),
    wallClockSec: Number(wall.toFixed(1)),
    dataset: { total: manifest.total, files: manifest.files.map(f => ({ name: f.name, rows: f.rows, sha256: f.sha256 })), seed: manifest.seed },
    lexicon: (() => {
      const f = path.join(OUT, 'runtime-lexicon.js');
      if (!LEX_AVAILABLE || !fs.existsSync(f)) return { available: false };
      const buf = fs.readFileSync(f);
      const L = require('./out/runtime-lexicon.js');
      return {
        available: true, file: 'runtime-lexicon.js', version: L.version,
        bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        he: { n: L.he.n, m: L.he.m, k: L.he.k }, en: { n: L.en.n, m: L.en.m, k: L.en.k },
        fprTarget: L.fprTarget
      };
    })(),
    ga: { popSize: 60, maxGen: 80, elite: 4, tournament: 3, crossoverP: 0.7, mutateP: 0.25, sigmaFrac: 0.1, patience: 15, genes: GENES.map(g => g.name), seedGenomes: SEED_PARAMS.map(s => s.note), complexityWeight: COMPLEXITY_W },
    params: serialParams,
    results,
    exact,
    golden: { rows: golden.length, file: 'golden.jsonl' },
    /* ‏enabled נגזר מהשער ואינו קבוע. ארטיפקט שכתוב בו enabled:true בזמן שבלוק
       ה-results שלו מדווח ship:false הוא ארטיפקט שסותר את עצמו, ומי שיצרוך אותו
       יקבל חוקים שמייצרים קבלות-שווא על שליליות קשות. נמדד בריצה הזאת: he-word
       ו-gloss נופלים בשער, ולכן הדגל יוצא false ואין הפעלה בטעות. */
    shipGate: Object.fromEntries(SETS.map(s => [s, {
      pass: results[s].holdout.ship && exact[s].holdout.falseAccepts === 0 && exact[s].holdout.realWordFalseAccepts === 0,
      holdoutFalseAccepts: exact[s].holdout.falseAccepts,
      holdoutRealWordFalseAccepts: exact[s].holdout.realWordFalseAccepts,
      holdoutRecall: exact[s].holdout.recall,
      floor: results[s].holdout.floor
    }])),
    enabled: SETS.every(s => results[s].holdout.ship && exact[s].holdout.falseAccepts === 0 && exact[s].holdout.realWordFalseAccepts === 0)
  };
  fs.writeFileSync(path.join(OUT, 'typo-rules.json'), JSON.stringify(out, null, 2), 'utf8');

  say('\n===== סיכום =====');
  for (const set of SETS) {
    const P = serialParams[set];
    const r = results[set], e = exact[set];
    say(`${set}: minLen=${P.minLen} vetoMargin=${P.vetoMargin} bands=${P.bands.map(b => (b.maxLen == null ? '∞' : b.maxLen) + ':' + b.t).join(' ')}`);
    say(`   W ${OP_KEYS.map(k => k + '=' + P.W[k]).join(' ')}`);
    say(`   CV val recall ${(r.cv.mean * 100).toFixed(2)}% ± ${(r.cv.sd * 100).toFixed(2)} · holdout ${(e.holdout.recall * 100).toFixed(2)}% · FA ${e.holdout.falseAccepts} · תקרה בת-השגה ${(r.holdout.reachableCeiling * 100).toFixed(2)}% · accept-share ${(r.acceptShare * 100).toFixed(1)}%`);
    say(`   ‏real-word · קבלות-שווא ${e.evolve.realWordFalseAccepts + e.holdout.realWordFalseAccepts} מתוך ${e.evolve.nRejectRealWord + e.holdout.nRejectRealWord} · לא-מהימנות ${r.untrusted.rows} מוצאו · recall אילו נכללו ${(e.holdout.recallIncludingUntrusted * 100).toFixed(2)}% ב-holdout`);
  }
  say(`\nזמן קיר ${wall.toFixed(1)} שניות · נכתבו out/typo-rules.json · out/ga-log.jsonl (${gaLog.length} דורות) · out/golden.jsonl (${golden.length})`);

  /* קבלה שהגיעה דרך via=exact היא ההתנהגות של היום · שכבה 1 רצה לפני כל פרמטר, ואין
     גנום שיכול למנוע אותה או לגרום לה. היא מדווחת בנפרד ואינה חוסמת משלוח · אחרת השער
     נכשל על משהו שהוא אינו יכול לתקן. נמדד: שורת gloss אחת ("כל" מול "כלל") שהדאטהסט
     מתייג reject ו-meaningMatch מקבלת ממילא. */
  const bad = SETS.filter(s => exact[s].evolve.falseAccepts || exact[s].holdout.falseAccepts);
  if (bad.length) { say(`\n⛔ קבלות-שווא ב: ${bad.join(', ')} · אין משלוח`); process.exitCode = 1; }
  const badReal = SETS.filter(s => exact[s].evolve.realWordFalseAccepts || exact[s].holdout.realWordFalseAccepts);
  if (badReal.length) { say(`⛔ קבלות-שווא על מילים אמיתיות ב: ${badReal.join(', ')}`); process.exitCode = 1; }
}

if (require.main === module) main();

module.exports = { GENES, buildGolden, faBuckets, listFalseAccepts, decideOne, genomeToParams, paramsToGenome, SEED_PARAMS, packSet, makeFastEval, evalSubset, recallByLength, fitnessOf, complexityOf, loadRows, buildCrossCard, exactEval, SETS, CAND_K, CAND_CAP, COMPLEXITY_W };
