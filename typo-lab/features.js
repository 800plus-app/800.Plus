'use strict';
/* חילוץ תכונות · typo-lab/features.js
 *
 * מ-‏(lang, direction, term, gloss, typed) לווקטור מספרי. זה הקלט של **התלמיד** —
 * האלגוריתם הדטרמיניסטי שלומד לחקות את המורה. מה שנשלח בסוף הוא קוד, ולכן כל תכונה
 * כאן חייבת להיות ניתנת לחישוב בתוך `app.js` בפחות מ-1ms, בלי רשת ובלי טבלה כבדה.
 * לכל תכונה מסומנת העלות בפועל ומה **כבר** מחושב היום ב-`nearMatch`.
 *
 * ===== המבנה · שתי רמות, ולא אחת =====
 *
 * ההכרעה של `nearMatch` היא **מינימום על פני זוגות (מועמד, יישור)**: מחרוזת מתקבלת
 * אם קיים מועמד ויישור שהעלות שלהם אינה עולה על סף רצועת האורך. ווקטור תכונות שטוח
 * אחד לשורה לא יכול לבטא את זה — הוא היה ממוצע על פני מסלולים שאינם קיימים יחד.
 * לכן:
 *
 *   ‏rowFeatures  · תכונות שאינן תלויות במועמד  · gap, isRealWord, isBankWord, nCands…
 *   ‏pairFeatures · תכונה לכל (מועמד, יישור)     · ספירת פעולות, מיקום, אורך המועמד…
 *
 * וההכרעה היא ‎`∃pair : cost(pair,row) ≤ t[band(pair.candLen)]`‎ — **בדיוק** הצורה של
 * ‏`lib/checker.js` ושל `app.js`, ולכן כל דבר שהתלמיד לומד כאן ניתן לשליחה בלי לשנות
 * מבנה נתונים.
 *
 * ===== ⚠ הפער שהתכונה `isRealWord` יורשת · נאמר במפורש ולא נבלע =====
 *
 * `isRealWord` נשענת על `out/runtime-lexicon.js`, ו**הלקסיקון הנשלח אינו משוחזר
 * מהבנאי הנוכחי** — ‏667 מילים עודפות, משימה #57 · ‏`selfcheck2b` אדום על זה.
 * התכונה משתמשת בו כי הוא מה שרץ בפועל בדפדפן, אבל **כל מספר שנגזר ממנה יורש את
 * הפער הזה**, וכשהלקסיקון ייבנה מחדש ייתכן שהמספרים יזוזו. זה מסומן גם ב-`COST`
 * למטה וגם בכל דוח שנגזר מכאן.
 *
 * ===== שיניים =====
 *
 * המניין כאן (`alignments`) מעתיק את הצורה של `opVectors` ב-`lib/wdist.js` ומוסיף
 * לה מידע מיקום. העתקה = מקור אמת שני שסוטה בשקט, ולכן `selfcheck()` מוודא שהווקטורים
 * שהוא מייצר **זהים כקבוצה** לאלה של `wdist.opVectors` על אלפי זוגות אמיתיים, ונופל
 * בשמו אם לא.
 */

const { opVectors, opCounts, OP_KEYS, tablesFor } = require('./lib/wdist.js');

const letters = s => String(s == null ? '' : s).replace(/ /g, '').length;

/* ===== טבלת התכונות · שם · מה היא תופסת · עלות ריצה ב-app.js =====
 *
 * `have` · מה שכבר מחושב היום בתוך `nearMatch` ולכן עלותו **אפס נוספת**.
 * `new`  · מה שדורש קוד חדש, עם אומדן העלות שלו.
 */
const COST = {
  /* --- זוג (מועמד, יישור) --- */
  op_sub:          { level: 'pair', have: true,  cost: '0 · typoVectors כבר מייצר את הווקטור', note: 'החלפת אות רחוקה — כמעט תמיד מילה אחרת' },
  op_adjSub:       { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'שכן מקלדת — הטעות המוטורית הנפוצה ביותר' },
  op_transpose:    { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'היפוך שכנים — מוטורי טהור' },
  op_ins:          { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'אות עודפת' },
  op_del:          { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'אות חסרה — המסוכן ביותר, מקצר לכיוון מילים אחרות' },
  op_doubleLetter: { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'הכפלה — אצבע שנתקעה' },
  op_materVI:      { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'ו/י — כתיב מלא/חסר, עברית בלבד' },
  op_homophone:    { level: 'pair', have: true,  cost: '0 · אותו ווקטור', note: 'ת/ט כ/ק א/ע — טעות כתיב, עברית בלבד' },
  nOps:            { level: 'pair', have: true,  cost: '0 · סכום הווקטור', note: 'כמה עריכות בסך הכול' },
  candLen:         { level: 'pair', have: true,  cost: '0 · typoLetters(s.c) כבר מחושב', note: 'בוחר את רצועת הסף' },

  /* מיקום · הגן החדש היחיד שדורש קוד ולא רק צירוף מחדש */
  posFirst:        { level: 'pair', have: false, cost: '≈0 · דגל אחד בתוך המניין הקיים · O(1) לכל יישור', note: '⭐ עריכה שנוגעת באות הראשונה. fought/bought, כלב/חלב' },
  posRel:          { level: 'pair', have: false, cost: '≈0 · אותו מקום', note: 'מיקום יחסי של העריכה המוקדמת ביותר · 0 = ראש המילה' },
  lcpRatio:        { level: 'pair', have: false, cost: 'O(len) · לולאה אחת קצרה', note: 'כמה מהראש שרד · ראש זהה = אותה מילה' },
  shareRatio:      { level: 'pair', have: false, cost: 'O(len) · מפת תווים קטנה', note: 'יחס תווים משותפים · אנגרמות ומחיקות' },
  lenDiff:         { level: 'pair', have: true,  cost: '0 · שני אורכים שכבר קיימים', note: 'הפרש אורך חתום · מאריך מול מקצר' },

  /* --- שורה --- */
  gap:             { level: 'row',  have: true,  cost: '0 · typoNearestOther כבר רץ ב-nearMatch', note: '⭐ המרחק למילת המאגר הקרובה פחות המרחק לשלך. הגן החזק ביותר' },
  dOwn:            { level: 'row',  have: true,  cost: '0 · כבר מחושב בלולאה', note: 'המרחק הגולמי לצורה הקבילה הקרובה' },
  isRealWord:      { level: 'row',  have: true,  cost: '0 · typoLexBlocked כבר רץ · ⚠ יורש את פער 667 המילים של הלקסיקון', note: '⭐ המחרוזת היא מילה אמיתית של השפה' },
  isBankWord:      { level: 'row',  have: true,  cost: '0 · וטו המאגר כבר רץ', note: '⭐ המחרוזת היא ערך אחר במאגר · הווטו' },
  isInflection:    { level: 'row',  have: true,  cost: '0 · typoInflection כבר רץ', note: 'ההפרש הוא סיומת טהורה · נטייה ולא טעות' },
  nCands:          { level: 'row',  have: true,  cost: '0 · scored.length כבר קיים', note: 'כמה צורות קבילות בטווח · כרטיס עם תאומים' },
  isMultiWord:     { level: 'row',  have: false, cost: '≈0 · indexOf(" ")', note: 'ביטוי רב-מילתי · התנהגות אחרת לגמרי' },
  typedLen:        { level: 'row',  have: true,  cost: '0 · typoLetters(a) כבר מחושב', note: 'אורך אחרי נרמול' },
  lenRatio:        { level: 'row',  have: false, cost: '≈0 · חילוק אחד', note: 'אורך יחסי · מוקלד חלקי הצורה הקרובה' },
};

const PAIR_KEYS = Object.keys(COST).filter(k => COST[k].level === 'pair');
const ROW_KEYS = Object.keys(COST).filter(k => COST[k].level === 'row');

/* ===== מניין היישורים · עם מיקום =====
 *
 * אותו הליכה חמדנית של `wdist.opVectors` (התאמה שולטת בכל חלופה באותו מקום, ולכן
 * הסתעפות רק בנקודות אי-התאמה), אבל כל ווקטור נושא איתו גם את **המיקום המוקדם ביותר**
 * שבו נפלה פעולה. המיקום נמדד באינדקס של המחרוזת המוקלדת (`a`), כי זו המחרוזת שהלומד
 * הקליד ועליה נשאלת השאלה "היכן טעית".
 *
 * ⚠ ניקוי השליטה כאן חייב להיות זהיר יותר מב-`wdist`: שם ווקטור נשלט נזרק, וכאן שני
 * ווקטורים זהים בספירה יכולים להיבדל במיקום. לכן השליטה נשמרת על הספירה בלבד ובין
 * ווקטורי-ספירה זהים נשמר **המיקום המוקדם ביותר** (הפסימי — עריכה קרוב לראש היא
 * החשודה יותר, ומודל שלא יראה אותה יקבל יותר משהוא צריך).
 */
function alignments(a, b, maxOps) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  const m = A.length, n = B.length;
  const K = maxOps == null ? 3 : maxOps;
  const T = tablesFor(A, B);
  const found = [];

  const zero = () => { const v = {}; for (const k of OP_KEYS) v[k] = 0; return v; };
  const subKind = (ca, cb) => {
    const h = T.homo.get(ca);
    if (h && h.has(cb)) return 'homophone';
    const nb = T.adj.get(ca);
    if (nb && nb.has(cb)) return 'adjSub';
    return 'sub';
  };
  const insKind = (j) => {
    const c = B[j - 1];
    if (T.mater && (c === 'ו' || c === 'י')) return 'materVI';
    if ((j >= 2 && B[j - 2] === c) || (j < B.length && B[j] === c)) return 'doubleLetter';
    return 'ins';
  };
  const delKind = (i) => {
    const c = A[i - 1];
    if (T.mater && (c === 'ו' || c === 'י')) return 'materVI';
    if ((i >= 2 && A[i - 2] === c) || (i < A.length && A[i] === c)) return 'doubleLetter';
    return 'del';
  };

  const walk = (i, j, budget, vec, firstPos) => {
    while (i < m && j < n && A[i] === B[j]) { i++; j++; }
    if (i === m && j === n) { found.push({ v: Object.assign({}, vec), pos: firstPos }); return; }
    if (budget <= 0) return;
    if (Math.abs((m - i) - (n - j)) > budget) return;
    const fp = firstPos < 0 ? i : firstPos;
    const spend = (kind, ni, nj) => { vec[kind]++; walk(ni, nj, budget - 1, vec, fp); vec[kind]--; };
    if (i + 1 < m && j + 1 < n && A[i] === B[j + 1] && A[i + 1] === B[j]) spend('transpose', i + 2, j + 2);
    if (i < m && j < n) spend(subKind(A[i], B[j]), i + 1, j + 1);
    if (i < m) spend(delKind(i + 1), i + 1, j);
    if (j < n) spend(insKind(j + 1), i, j + 1);
  };
  walk(0, 0, K, zero(), -1);

  /* איחוד לפי ספירה · המיקום המוקדם ביותר שורד. */
  const byKey = new Map();
  for (const f of found) {
    const key = OP_KEYS.map(k => f.v[k]).join(',');
    const hit = byKey.get(key);
    if (!hit) byKey.set(key, f);
    else if (f.pos >= 0 && (hit.pos < 0 || f.pos < hit.pos)) hit.pos = f.pos;
  }
  const uniq = Array.from(byKey.values());

  /* ניקוי שליטה · זהה ל-wdist, על הספירה בלבד. */
  const out = [];
  for (const f of uniq) {
    let dominated = false;
    for (const g of uniq) {
      if (g === f) continue;
      let le = true, lt = false;
      for (const k of OP_KEYS) { if (g.v[k] > f.v[k]) { le = false; break; } if (g.v[k] < f.v[k]) lt = true; }
      if (le && lt) { dominated = true; break; }
    }
    if (!dominated) out.push(f);
  }
  return out;
}

/* ===== תכונות ברמת הזוג ===== */
function pairFeatures(typedKey, cand, maxOps) {
  const A = String(typedKey), B = String(cand);
  const cl = letters(B), tl = letters(A);
  const out = [];
  for (const al of alignments(A, B, maxOps == null ? 3 : maxOps)) {
    let nOps = 0;
    for (const k of OP_KEYS) nOps += al.v[k];
    const pos = al.pos < 0 ? 0 : al.pos;
    out.push({
      op_sub: al.v.sub, op_adjSub: al.v.adjSub, op_transpose: al.v.transpose,
      op_ins: al.v.ins, op_del: al.v.del, op_doubleLetter: al.v.doubleLetter,
      op_materVI: al.v.materVI, op_homophone: al.v.homophone,
      nOps,
      candLen: cl,
      posFirst: al.pos === 0 ? 1 : 0,
      posRel: A.length ? pos / A.length : 0,
      lcpRatio: cl ? lcp(A, B) / cl : 0,
      shareRatio: shareRatio(A, B),
      lenDiff: tl - cl,
    });
  }
  return out;
}

function lcp(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function shareRatio(a, b) {
  const m = new Map();
  for (const c of a) m.set(c, (m.get(c) || 0) + 1);
  let shared = 0;
  for (const c of b) { const v = m.get(c); if (v > 0) { shared++; m.set(c, v - 1); } }
  const d = Math.max(a.length, b.length);
  return d ? shared / d : 0;
}

/* ===== תכונות ברמת השורה ===== */
function rowFeatures(o) {
  const gap = (o.dOther == null ? 9 : o.dOther) - (o.dOwn == null ? 0 : o.dOwn);
  const tl = o.tLen == null ? letters(o.typedKey) : o.tLen;
  const nearest = o.nearestCandLen == null ? tl : o.nearestCandLen;
  return {
    gap,
    dOwn: o.dOwn == null ? 0 : o.dOwn,
    isRealWord: o.lexVetoed ? 1 : 0,
    isBankWord: o.vetoed ? 1 : 0,
    isInflection: o.inflect ? 1 : 0,
    nCands: o.nCands == null ? 0 : o.nCands,
    isMultiWord: (String(o.typedKey).indexOf(' ') >= 0 || (o.term && String(o.term).indexOf(' ') >= 0)) ? 1 : 0,
    typedLen: tl,
    lenRatio: nearest ? tl / nearest : 1,
  };
}

/* ===== המסלול הקנוני · מחמשת הקלטים בלבד =====
 *
 * זו החתימה שהמשימה מגדירה, והיא קיימת כדי להוכיח שהתכונות **באמת** נגזרות מ-
 * ‏(lang, direction, term, gloss, typed) ולא ממבנה פנימי של המעבדה. היא איטית (בונה
 * מועמדים מחדש לכל קריאה) ולכן המדידות רצות דרך `fromRow`; `selfcheck` מוודא ששתי
 * הדרכים מסכימות ווקטור-מול-ווקטור.
 */
function extract(input, env) {
  const { lang, direction, term, gloss, typed } = input;
  const ctx = env.ctx, veto = env.veto;
  const isGloss = direction === 'gloss';
  const card = env.card || { term, unit: input.unit, meaning: gloss };
  const cands = (isGloss ? env.segsOf(card) : env.keysOf(card)).filter(Boolean);
  const typedKey = isGloss ? ctx.norm(typed) : ctx.K(typed);
  if (!typedKey) return null;

  const allow = isGloss ? env.allowSeg(card) : env.allowTerm(card);
  const index = isGloss ? env.IX.seg : env.IX.term;
  const dOtherRaw = env.nearestOther(typedKey, index, allow, ctx);

  let dOwn = 99;
  const scored = [];
  for (const c of cands) {
    const raw = ctx.editDist(typedKey, c);
    if (raw < dOwn) dOwn = raw;
    if (raw > 3) continue;
    scored.push({ key: c, raw, len: letters(c) });
  }
  scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const top = scored.slice(0, 8);

  const row = rowFeatures({
    dOther: isFinite(dOtherRaw) ? dOtherRaw : 9,
    dOwn: Math.min(dOwn, 9),
    lexVetoed: env.lexVetoed(typedKey, cands, isGloss ? 'he' : lang, veto),
    vetoed: isGloss ? env.isVetoedSeg(typedKey, card, veto, ctx) : env.isVetoedTerm(typedKey, card, veto, ctx),
    inflect: !isGloss && env.isInflection(typedKey, cands),
    nCands: top.length,
    typedKey, term,
    tLen: letters(typedKey),
    nearestCandLen: top.length ? top[0].len : letters(typedKey),
  });
  const pairs = [];
  for (const s of top) for (const p of pairFeatures(typedKey, s.key)) pairs.push(p);
  return { row, pairs, typedKey, cands: top };
}

/* ===== המסלול המהיר · משורה שכבר נטענה על ידי evolve.loadRows =====
 * אותן תכונות בדיוק, בלי לבנות מועמדים מחדש. זה מה שהמדידות רצות עליו.
 */
function fromRow(r) {
  const row = rowFeatures({
    dOther: r.dOther, dOwn: r.dOwn, lexVetoed: r.lexVetoed, vetoed: r.vetoed,
    inflect: r.inflect, nCands: r.cands.length, typedKey: r.typedKey, term: r.term,
    tLen: r.tLen, nearestCandLen: r.cands.length ? r.cands[0].len : r.tLen,
  });
  const pairs = [];
  for (const c of r.cands) for (const p of pairFeatures(r.typedKey, c.key)) pairs.push(p);
  return { row, pairs };
}

/* ===== שיניים · המניין שלי מול המניין של wdist =====
 * העתקה של הליכה = מקור אמת שני. הבדיקה דורשת **זהות קבוצתית** של ווקטורי הספירה,
 * ולא "בערך אותו מספר", ונופלת בשמה. `--selftest` שובר בכוונה ומראה אדום.
 */
function selfcheck(pairs, opts) {
  const broken = opts && opts.broken;
  let n = 0, bad = 0;
  const sample = [];
  for (const [a, b] of pairs) {
    const mine = alignments(a, b, 3).map(f => OP_KEYS.map(k => f.v[k]).join(','));
    let theirs = opVectors(a, b, 3).map(v => OP_KEYS.map(k => v[k]).join(','));
    if (broken && theirs.length) theirs = theirs.slice(1);
    const ms = new Set(mine), ts = new Set(theirs);
    let same = ms.size === ts.size;
    if (same) for (const x of ms) if (!ts.has(x)) { same = false; break; }
    n++;
    if (!same) { bad++; if (sample.length < 5) sample.push({ a, b, mine: [...ms], theirs: [...ts] }); }
  }
  return { n, bad, sample };
}

module.exports = {
  COST, PAIR_KEYS, ROW_KEYS, OP_KEYS,
  alignments, pairFeatures, rowFeatures, extract, fromRow, selfcheck,
  letters, lcp, shareRatio,
};
