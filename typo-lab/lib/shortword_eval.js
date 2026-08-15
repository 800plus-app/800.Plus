'use strict';
/* מעריך מורחב · typo-lab/lib/shortword_eval.js
 *
 * ===== מה זה, ומה זה **לא** =====
 *
 * זה אינו מימוש שני של הבודק. זו הרחבה של מרחב הגנים בלבד, שנבנתה כך שהיא **מכילה**
 * את המעריך של evolve כמקרה פרטי, וההכלה הזאת נבדקת ולא מוצהרת: שלב 1 של shortword.js
 * מריץ את שני המעריכים שורה-שורה על כל שש החבילות (שלושה סטים ושלוש קבוצות חוצות-
 * כרטיסים) ודורש אפס פערים, ו---selftest שובר את הפרדיקט ומראה שהשער נופל.
 *
 * ===== שלוש הרחבות, וכולן ניתנות לביטוי כקבועים ב-TYPO_PARAMS =====
 *
 * ‏1. **משקלים לפי אורך** · wvFor(len). היום וקטור המשקלים גלובלי: מילה בת שלוש אותיות
 *    ומילה בת שתים-עשרה מתומחרות באותם מחירים לאופרטור. זה בדיוק החלל שלא נחקר.
 *
 * ‏2. **שוליים מדורגים** · במקום מספר שלם אחד (vetoMargin) שני מספרים:
 *      marginHard · מתחתיו נדחה תמיד. זו הכרעת חגי ואין עליה ויכוח.
 *      marginSoft · בין marginHard ל-marginSoft נכנסים ל**משטר הצר**: סף אחר (bandsTight)
 *                   ומשקלים אחרים (WTight).
 *    ‏marginSoft === marginHard משחזר בדיוק את ההתנהגות של vetoMargin היחיד.
 *
 * ‏3. **שימור אות ראשונה / שלד עיצורים** · מסנן על מועמדים, פעיל רק במשטר הצר ורק עד
 *    אורך נתון. שני הפרדיקטים מחושבים מהמחרוזות עצמן ולכן הריצה אינה צריכה שום נתון
 *    חדש · אבל הם **כן** דורשים שינוי קוד בבודק, וזה מתומחר בדוח ולא נבלע.
 *
 * ===== למה יש שלב "הידור" =====
 *
 * הקבלה היא "קיים יישור שעלותו אינה עולה על הסף של רצועת האורך שלו". הסף תלוי באורך
 * המועמד בלבד, ולכן לכל שורה מספיק לשמור את **העלות המינימלית לכל אורך מועמד** · שאר
 * היישורים אינם יכולים להכריע. זה מקטין את הלולאה הפנימית מ-‏(זוגות × 8 אופרטורים)
 * ל-(אורכים ייחודיים), וזה מה שמאפשר לכייל אלפי נקודות במקום עשרות. ההידור תלוי
 * במשקלים בלבד, ולכן הוא נעשה פעם אחת לכל וקטור משקלים והכיול רץ עליו.
 *
 * ⚠ ההידור הוא צוואר הבקבוק של הנכונות · אם הוא מאבד זוג, המעריך נהיה שמרני בשקט
 * ו"אפס קבלות-שווא" הופך לאמירה ריקה. לכן שלב 1 בודק את המסלול המהודר עצמו מול
 * evolve.decideOne, ולא גרסה לא-מהודרת שלו.
 */

const { OP_KEYS } = require('./wdist.js');
const K = OP_KEYS.length;

const MAXL = 18;                                  // אורך אחרון שמקבל גן משלו · מעליו רצועת ∞

/* ===== נכסי עזר לכל זוג · מה שהמערך הארוז אינו שומר =====
 * הסדר חייב להיות **בדיוק** סדר הפריסה של packSet: לכל שורה, לכל מועמד, לכל יישור.
 * אחרת האינדקסים נפרדים והמסנן יחול על הזוג הלא נכון. הסדר נבדק בשלב 1 דרך השקילות.
 */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const skeleton = s => String(s || '').split('').filter(c => !VOWELS.has(c)).join('');

function buildAux(S) {
  const P = S.pairs;
  const pFirst = new Uint8Array(P);
  const pSkel = new Uint8Array(P);
  let p = 0;
  for (let i = 0; i < S.N; i++) {
    const r = S.rows[i];
    const t = String(r.typedKey == null ? '' : r.typedKey);
    for (const c of r.cands) {
      const k = String(c.key == null ? '' : c.key);
      const f = (t && k && t[0] === k[0]) ? 1 : 0;
      const sk = (skeleton(t) === skeleton(k)) ? 1 : 0;
      for (let q = 0; q < c.vecs.length; q++) { pFirst[p] = f; pSkel[p] = sk; p++; }
    }
  }
  if (p !== P) throw new Error(`shortword_eval.buildAux: laid out ${p} pairs but the pack holds ${P}`);
  return { pFirst, pSkel };
}

/* ===== הידור עלויות ===== */
/* wvFor(len) מחזיר Float64Array באורך K · הוא הגן החדש "משקלים לפי אורך".
   keep(p) הוא מסנן הזוגות (אות ראשונה / שלד) · null = הכול נשמר. */
function compile(S, wvFor, keep) {
  const N = S.N;
  const off = new Int32Array(N + 1);
  const lens = [];
  const costs = [];
  const seenL = [];
  const seenC = [];
  for (let i = 0; i < N; i++) {
    off[i] = lens.length;
    seenL.length = 0; seenC.length = 0;
    const hi = S.off[i + 1];
    for (let p = S.off[i]; p < hi; p++) {
      if (keep && !keep(p)) continue;
      const L = S.pLen[p];
      const wv = wvFor(L);
      let c = 0;
      const base = p * K;
      for (let j = 0; j < K; j++) c += S.pCnt[base + j] * wv[j];
      let at = -1;
      for (let q = 0; q < seenL.length; q++) if (seenL[q] === L) { at = q; break; }
      if (at < 0) { seenL.push(L); seenC.push(c); }
      else if (c < seenC[at]) seenC[at] = c;
    }
    for (let q = 0; q < seenL.length; q++) { lens.push(seenL[q]); costs.push(seenC[q]); }
  }
  off[N] = lens.length;
  return { off, len: Int16Array.from(lens), cost: Float64Array.from(costs) };
}

/* ===== ספים ===== */
function thrCache(bands) {
  const B = bands.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t == null ? 0 : b.t }))
    .sort((a, b) => a.maxLen - b.maxLen);
  const c = new Float64Array(256);
  for (let l = 0; l < 256; l++) {
    let v = B[B.length - 1].t;
    for (const b of B) if (l <= b.maxLen) { v = b.t; break; }
    c[l] = v;
  }
  return c;
}
function bandsFromVec(vec) {
  const b = [];
  for (let l = 1; l <= MAXL; l++) b.push({ maxLen: l, t: vec[l] || 0 });
  b.push({ maxLen: Infinity, t: vec[MAXL + 1] || 0 });
  return b;
}

/* ===== ההכרעה · אותו סדר שכבות בדיוק של evolve.evalSubset =====
 * מתקבל-היום, וטו, לקסיקון, אורך, נטייה, שוליים, מרחק. השוליים לפני המרחק ולא אחריו ·
 * ההכרעה זהה (פסילה היא פסילה) והלולאה קצרה יותר.
 */
function mkE(P) {
  const hard = P.marginHard == null ? (P.vetoMargin == null ? 0 : P.vetoMargin) : P.marginHard;
  const soft = P.marginSoft == null ? hard : P.marginSoft;
  if (soft < hard) throw new Error('shortword_eval: marginSoft must not be below marginHard');
  return {
    minLen: P.minLen || 0,
    useLex: P.useLexicon !== false,
    tcache: thrCache(P.bands),
    ttcache: thrCache(P.bandsTight || P.bands),
    marginHard: hard, marginSoft: soft
  };
}

function decideOne(S, i, E, CN, CT) {
  const f = S.flags[i];
  if (f & 4) return true;
  if (f & 1) return false;
  if (E.useLex && (f & 64)) return false;
  if (S.tLen[i] < E.minLen) return false;
  if (f & 2) return false;
  const gap = S.dOther[i] - S.dOwn[i];
  if (E.marginHard > 0 && gap < E.marginHard) return false;
  const tight = E.marginSoft > E.marginHard && gap < E.marginSoft;
  const C = tight ? CT : CN;
  const tc = tight ? E.ttcache : E.tcache;
  const hi = C.off[i + 1];
  for (let p = C.off[i]; p < hi; p++) {
    const L = C.len[p];
    const t = tc[L < 256 ? L : 255];
    if (!(t > 0)) continue;
    if (C.cost[p] <= t) return true;
  }
  return false;
}

/* אותו מבנה החזרה בדיוק של evolve.evalSubset · אחרת אי אפשר להשוות מספרים. */
function evalSubset(S, idx, E, CN, CT) {
  let tp = 0, nAcc = 0, fa = 0, nRej = 0, tpAll = 0, nAccAll = 0, faReal = 0, nRejReal = 0, faToday = 0;
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const f = S.flags[i];
    const isAcc = (f & 8) !== 0;
    if (isAcc) { nAccAll++; if (f & 16) nAcc++; }
    else { nRej++; if (f & 32) nRejReal++; }
    const ok = decideOne(S, i, E, CN, CT);
    if (ok) {
      if (isAcc) { tpAll++; if (f & 16) tp++; }
      else { fa++; if (f & 32) faReal++; if (f & 4) faToday++; }
    }
  }
  return {
    tp, nAcc, fa, nRej, recall: nAcc ? tp / nAcc : 0,
    tpAll, nAccAll, recallAll: nAccAll ? tpAll / nAccAll : 0,
    faRealWord: faReal, nRejectRealWord: nRejReal, faToday, faOwn: fa - faToday
  };
}

/* ‏recall לפי אורך המפתח · אותה חלוקה בדיוק של evolve.recallByLength (3..11 ואז 12+). */
function recallByLength(S, idx, E, CN, CT) {
  const m = new Map();
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const L = S.kLen[i];
    const b = L >= 12 ? '12+' : String(L);
    let e = m.get(b);
    if (!e) { e = { len: b, nAccept: 0, tp: 0, nReject: 0, fa: 0 }; m.set(b, e); }
    const f = S.flags[i];
    const ok = decideOne(S, i, E, CN, CT);
    if (f & 8) { if (f & 16) { e.nAccept++; if (ok) e.tp++; } }
    else { e.nReject++; if (ok) e.fa++; }
  }
  const out = Array.from(m.values()).sort((a, b) => (a.len === '12+' ? 99 : +a.len) - (b.len === '12+' ? 99 : +b.len));
  for (const e of out) e.recall = e.nAccept ? e.tp / e.nAccept : null;
  return out;
}

const constW = W => {
  const v = new Float64Array(K);
  for (let j = 0; j < K; j++) v[j] = W[OP_KEYS[j]] == null ? 1 : W[OP_KEYS[j]];
  return () => v;
};

module.exports = { buildAux, compile, thrCache, bandsFromVec, mkE, decideOne, evalSubset, recallByLength, constW, skeleton, MAXL, K, OP_KEYS };
