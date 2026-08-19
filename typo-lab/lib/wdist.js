'use strict';
/* מרחק עריכה ממושקל, חסום, ומודע-אופרטור · typo-lab/lib/wdist.js
 *
 * למה בכלל משקלים: כל האופרטורים אינם שווים בסבירות. החלפת אות בשכנה שלה במקלדת היא
 * הטעות הנפוצה ביותר; החלפת אות באות אקראית באותו מרחק היא כמעט תמיד מילה אחרת. מרחק
 * לוונשטיין רגיל נותן לשתיהן 1, ולכן כל סף שנבחר עליו מכייל את עצמו על הרעש ולא על
 * הטעות. משקל לכל סוג פעולה מפריד את השתיים בלי להוסיף שכבת חוקים.
 *
 * שני מקורות אמת, אפס העתקה:
 *   ADJ  · שכנות המקלדת מיובאת מ-taxonomy-he ומ-taxonomy-en כמו שהיא.
 *   HOMO · טבלת ההומופונים אינה מיוצאת מ-taxonomy-he, ולכן היא **נגזרת מהאופרטור עצמו**
 *          על ידי חקירה (deriveHomo למטה) ולא מועתקת. העתקה הייתה יוצרת מקור אמת שני
 *          שסוטה בשקט ברגע שמישהו יוסיף זוג לטקסונומיה.
 *
 * זיהוי השפה נגזר מהתווים ולא נמסר כפרמטר: החתימה שהמעבדה עובדת מולה היא
 * wEditDist(a,b,W,cap), והחלטה על סמך המחרוזות עצמן אינה יכולה להתפצל מהקלט.
 *
 * הרצועה (band) שווה ל-cap במונחי *פעולות*, כלומר floor(cap/הכנסה-הזולה-ביותר) במונחי
 * הפרש אינדקסים: כל צעד של הפרש אינדקס דורש לפחות הכנסה או מחיקה אחת. מעבר לרצועה
 * מוחזר Infinity · לא מספר גדול, כדי שהשוואה שגויה תתפוצץ ולא תתדרדר בשקט.
 */

const TAX_HE = require('./taxonomy-he.js');
const TAX_EN = require('./taxonomy-en.js');

const HE_RANGE = /[֐-׿]/;
const MATER = new Set(['ו', 'י']);

/* שמות הדליים · אלה בדיוק המפתחות של W ושל וקטור הספירה. סדר קבוע: הווקטור נשמר
   בקובץ ונקרא ממנו, ומכפלה סקלרית לפי אינדקס דורשת סדר שאינו משתנה בין ריצות. */
const OP_KEYS = ['sub', 'adjSub', 'transpose', 'ins', 'del', 'doubleLetter', 'materVI', 'homophone'];

/* ההגדרה של "בלי משקלים" · והנקודה העדינה היחידה בקובץ הזה.
 *
 * ‏transpose מקבל 2 ולא 1, כי היפוך שכנים **הוא** שתי עריכות לוונשטיין. editDist של
 * app.js היא לוונשטיין טהורה ואין בה מהלך היפוך כלל; אם המהלך שלנו היה מתומחר ב-1
 * במצב הניטרלי, "בלי משקלים" היה מרחק אחר מזה של האפליקציה, וכל השוואה בין המעבדה
 * לריצה הייתה משווה שני דברים. עם 2 המהלך לעולם אינו זול יותר מהמסלול שלוונשטיין
 * כבר מכירה, ולכן wEditDist(a,b,UNIT_W,Infinity) === editDist(a,b) · בדיוק, ולא בערך.
 * ‏selfcheck34 מוכיח את זה על 20,000 זוגות ולא מצהיר עליו.
 *
 * ה-GA כמובן חופשי לתמחר את ההיפוך מתחת ל-2 · שם זה בדיוק העניין. */
const UNIT_W = { sub: 1, adjSub: 1, transpose: 2, ins: 1, del: 1, doubleLetter: 1, materVI: 1, homophone: 1 };

/* משקלים לשבירת שוויון בלבד, ב-opCounts. הם אינם משפיעים על המרחק (הוא לא-ממושקל שם),
   רק על *איזה* יישור אופטימלי נבחר כשיש כמה. בלעדיהם הבחירה הייתה נופלת על סדר הכתיבה
   של הענפים, וזה בדיוק סוג הפרט שמשתנה בלי שאיש שם לב. */
const TIE_W = { sub: 1, adjSub: 0.6, transpose: 0.7, ins: 1, del: 1, doubleLetter: 0.5, materVI: 0.5, homophone: 0.6 };

/* ===== הטבלאות ===== */

function toSetMap(m) {
  const out = new Map();
  for (const [k, v] of m) out.set(k, new Set(v));
  return out;
}

/* חקירת אופרטור ההומופונים · מייצרת מילת-בדיקה שבה רק תו אחד יכול להשתנות, ומסיקה את
   הזוגות מהתוצאות. 'ל' נבחרה כמילוי כי היא אינה משתתפת באף זוג (לא ב-HOMO ולא
   ב-HOMO_FINAL), ולכן כל שינוי בתו אחר הוא בהכרח בתו הנחקר. שתי עמדות: אמצע (הזוגות
   הרגילים) וסוף (ה↔א, שחל רק במיקום האחרון). */
function deriveHomo() {
  const op = TAX_HE.OPS.find(o => o.name === 'homophone');
  if (!op) throw new Error('wdist: taxonomy-he has no homophone operator');
  const letters = 'אבגדהוזחטיכלמנסעפצקרשת';
  const map = new Map();
  const add = (a, b) => {
    if (!a || !b || a === b) return;
    let s = map.get(a);
    if (!s) { s = new Set(); map.set(a, s); }
    s.add(b);
  };
  for (const c of letters) {
    if (c === 'ל') continue;
    const probes = [['ל' + c + 'ל', 1], ['לל' + c, 2]];
    for (const [probe, pos] of probes) {
      for (const v of op.apply(probe, null)) {
        if (v.length !== probe.length) continue;
        let diff = -1, n = 0;
        for (let i = 0; i < probe.length; i++) if (v[i] !== probe[i]) { diff = i; n++; }
        if (n === 1 && diff === pos) { add(probe[pos], v[pos]); add(v[pos], probe[pos]); }
      }
    }
  }
  if (!map.size) throw new Error('wdist: deriving the homophone table from taxonomy-he yielded nothing');
  return map;
}

let HE_T = null, EN_T = null;
function heTables() {
  if (!HE_T) HE_T = { adj: toSetMap(TAX_HE.ADJ), homo: deriveHomo(), mater: true };
  return HE_T;
}
function enTables() {
  if (!EN_T) EN_T = { adj: toSetMap(TAX_EN.ADJ), homo: new Map(), mater: false };
  return EN_T;
}
function tablesFor(a, b) {
  return (HE_RANGE.test(a) || HE_RANGE.test(b)) ? heTables() : enTables();
}

/* ===== סיווג פעולה ===== */

/* כל פעולה נופלת לדלי אחד בדיוק · אחרת המכפלה הסקלרית של וקטור הספירה במשקלים אינה
   שווה לעלות, וטריק הביצועים של evolve היה מודד דבר אחר מהמנצח. */
function subKind(ca, cb, T) {
  const h = T.homo.get(ca);
  if (h && h.has(cb)) return 'homophone';
  const n = T.adj.get(ca);
  if (n && n.has(cb)) return 'adjSub';
  return 'sub';
}

/* אם קריאה קודמת להכפלה: בעברית ו/י כפולה היא תופעת כתיב מלא ולא אצבע שנתקעה, וזה
   ההסבר הנכון לה. באנגלית ו/י אינן קיימות בכלל ולכן הענף מת שם. */
function insKind(b, j, T) {
  const c = b[j - 1];
  if (T.mater && MATER.has(c)) return 'materVI';
  if ((j >= 2 && b[j - 2] === c) || (j < b.length && b[j] === c)) return 'doubleLetter';
  return 'ins';
}
function delKind(a, i, T) {
  const c = a[i - 1];
  if (T.mater && MATER.has(c)) return 'materVI';
  if ((i >= 2 && a[i - 2] === c) || (i < a.length && a[i] === c)) return 'doubleLetter';
  return 'del';
}

/* ===== מניית היישורים · הלב של "בלי הפתעות" =====
 *
 * מחזירה את **כל** וקטורי ספירת-הפעולות של יישורים שמשתמשים בלכל היותר maxOps פעולות,
 * מנוקים מווקטורים נשלטים (וקטור נשלט הוא כזה שקיים אחר שאינו גדול ממנו באף רכיב · כל
 * משקלים אי-שליליים יתמחרו אותו לא-זול-יותר, ולכן הוא חסר משמעות).
 *
 * למה זה נחוץ ולא מותרות: המרחק הממושקל הוא מינימום על פני יישורים, והיישור הזול תלוי
 * במשקלים. חישוב מהיר שמתמחר יישור **אחד** קבוע מראש הוא חסם עליון, ולכן הוא יכול
 * להראות "אפס קבלות-שווא" בזמן שהמסלול המדויק מקבל · וזה בדיוק מה שקרה בריצה השנייה:
 * ‏0 קבלות-שווא בקירוב מול 6 במדויק ("uuuf" ~ "unit"). עם המניין המלא, ההערכה המהירה
 * וההכרעה המדויקת הן אותו מספר בדיוק, ולא "קרוב".
 *
 * המניין זול כי הוא רודף התאמות בחמדנות: כשהתווים שווים, התאמה (0 פעולות) **שולטת** בכל
 * חלופה שמוציאה פעולה באותו מקום · אותו המשך בדיוק, בפעולות נוספות. לכן הסתעפות קורית
 * רק בנקודות אי-התאמה, ויש לכל היותר maxOps כאלה: ‏4^maxOps מסלולים, לא יותר.
 */
function opVectors(a, b, maxOps) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  const m = A.length, n = B.length;
  const K = maxOps == null ? 3 : maxOps;
  const T = tablesFor(A, B);
  const found = [];

  const zero = () => { const v = {}; for (const k of OP_KEYS) v[k] = 0; return v; };
  const walk = (i, j, budget, vec) => {
    while (i < m && j < n && A[i] === B[j]) { i++; j++; }
    if (i === m && j === n) { found.push(Object.assign({}, vec)); return; }
    if (budget <= 0) return;
    if (Math.abs((m - i) - (n - j)) > budget) return;             // אין מספיק פעולות לסגור את הפרש האורך
    const spend = (kind, ni, nj) => {
      vec[kind]++;
      walk(ni, nj, budget - 1, vec);
      vec[kind]--;
    };
    if (i + 1 < m && j + 1 < n && A[i] === B[j + 1] && A[i + 1] === B[j]) spend('transpose', i + 2, j + 2);
    if (i < m && j < n) spend(subKind(A[i], B[j], T), i + 1, j + 1);
    if (i < m) spend(delKind(A, i + 1, T), i + 1, j);
    if (j < n) spend(insKind(B, j + 1, T), i, j + 1);
  };
  walk(0, 0, K, zero());

  /* ניקוי שליטה · O(n²) על רשימה שאורכה עשרות במקרה הגרוע. */
  const out = [];
  for (const v of found) {
    let dominated = false;
    for (const u of found) {
      if (u === v) continue;
      let le = true, lt = false;
      for (const k of OP_KEYS) { if (u[k] > v[k]) { le = false; break; } if (u[k] < v[k]) lt = true; }
      if (le && lt) { dominated = true; break; }
    }
    if (dominated) continue;
    if (out.some(u => OP_KEYS.every(k => u[k] === v[k]))) continue;
    out.push(v);
  }
  return out;
}

/* ===== מרחק ממושקל חסום ===== */

/* ‏maxOps סופי · המרחק הוא המינימום על פני היישורים שנמנו, וזו הגדרה מדויקת ולא קירוב.
   ‏maxOps אינסופי · מסלול ה-DP הרצועתי הקלאסי, שנחוץ להוכחת השקילות מול editDist. */
function wEditDist(a, b, W, cap, maxOps) {
  const w = W || UNIT_W;
  if (maxOps != null && isFinite(maxOps)) {
    for (const k of OP_KEYS) if (!(w[k] >= 0)) throw new Error(`wEditDist: weight "${k}" must be non-negative`);
    const C = (cap == null || !isFinite(cap)) ? Infinity : cap;
    let best = Infinity;
    for (const v of opVectors(a, b, maxOps)) {
      let s = 0;
      for (const k of OP_KEYS) s += v[k] * w[k];
      if (s < best) best = s;
    }
    return best <= C ? best : Infinity;
  }
  return wEditDistBanded(a, b, w, cap);
}

function wEditDistBanded(a, b, W, cap) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  const w = W || UNIT_W;
  const C = (cap == null || !isFinite(cap)) ? Infinity : cap;
  if (A === B) return 0;

  const m = A.length, n = B.length;
  const T = tablesFor(A, B);

  const minIndel = Math.min(w.ins, w.del, w.doubleLetter, w.materVI);
  let band;
  if (!isFinite(C)) band = Math.max(m, n);
  else if (!(minIndel > 0)) band = Math.max(m, n);
  else band = Math.floor(C / minIndel);
  if (Math.abs(m - n) > band) return Infinity;

  const INF = Infinity;
  let prev2 = new Array(n + 1).fill(INF);
  let prev = new Array(n + 1).fill(INF);
  let cur = new Array(n + 1).fill(INF);

  prev[0] = 0;
  for (let j = 1; j <= n && j <= band; j++) prev[j] = prev[j - 1] + w[insKind(B, j, T)];

  for (let i = 1; i <= m; i++) {
    cur.fill(INF);
    const lo = Math.max(1, i - band), hi = Math.min(n, i + band);
    if (i <= band && isFinite(prev[0])) cur[0] = prev[0] + w[delKind(A, i, T)];
    let rowMin = cur[0];
    for (let j = lo; j <= hi; j++) {
      let v = INF;
      if (isFinite(prev[j])) v = prev[j] + w[delKind(A, i, T)];
      if (isFinite(cur[j - 1])) { const t = cur[j - 1] + w[insKind(B, j, T)]; if (t < v) v = t; }
      if (isFinite(prev[j - 1])) {
        const t = prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : w[subKind(A[i - 1], B[j - 1], T)]);
        if (t < v) v = t;
      }
      /* היפוך שכנים · OSA. אינו Damerau מלא בכוונה: היפוך שרץ מעל עריכות אחרות אינו
         טעות הקלדה אחת אלא צירוף, ותמחור שלו כפעולה אחת היה מרחיב את הסף בשקט. */
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1] && isFinite(prev2[j - 2])) {
        const t = prev2[j - 2] + w.transpose;
        if (t < v) v = t;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (!(rowMin <= C)) return Infinity;              // כל השורה כבר יקרה מהתקרה · אין דרך חזרה
    const spare = prev2; prev2 = prev; prev = cur; cur = spare;
  }

  const d = prev[n];
  return (isFinite(d) && d <= C) ? d : Infinity;
}

/* ===== וקטור ספירת הפעולות =====
 * מחזיר את היישור האופטימלי ב**מרחק לא ממושקל** (כל פעולה 1) ואת פילוח הפעולות שלו.
 * זה הטריק שמאפשר ל-GA לרוץ: הפילוח מחושב פעם אחת לכל שורה, והערכת גנום מצטמצמת
 * למכפלה סקלרית. זו **קירוב**: היישור הזול ביותר תחת משקלים אחרים יכול להיות אחר, ולכן
 * evolve חייבת לתמחר את המנצח מחדש ב-wEditDist המדויקת · ואם המספרים נפרדים, לצעוק.
 */
function opCounts(a, b, cap) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  const C = (cap == null || !isFinite(cap)) ? Infinity : cap;
  const m = A.length, n = B.length;
  const T = tablesFor(A, B);
  const counts = {};
  for (const k of OP_KEYS) counts[k] = 0;
  if (A === B) return { dist: 0, counts };

  const band = isFinite(C) ? Math.floor(C) : Math.max(m, n);
  if (Math.abs(m - n) > band) return null;

  const INF = Infinity;
  const D = [];
  for (let i = 0; i <= m; i++) D.push(new Float64Array(n + 1).fill(INF));
  D[0][0] = 0;
  for (let j = 1; j <= n && j <= band; j++) D[0][j] = j;
  for (let i = 1; i <= m; i++) {
    const lo = Math.max(1, i - band), hi = Math.min(n, i + band);
    if (i <= band) D[i][0] = i;
    for (let j = lo; j <= hi; j++) {
      let v = INF;
      if (isFinite(D[i - 1][j])) v = D[i - 1][j] + 1;
      if (isFinite(D[i][j - 1]) && D[i][j - 1] + 1 < v) v = D[i][j - 1] + 1;
      if (isFinite(D[i - 1][j - 1])) {
        const t = D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1);
        if (t < v) v = t;
      }
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1] && isFinite(D[i - 2][j - 2])) {
        const t = D[i - 2][j - 2] + 1;
        if (t < v) v = t;
      }
      D[i][j] = v;
    }
  }
  const dist = D[m][n];
  if (!isFinite(dist) || dist > C) return null;

  /* מסלול חזרה. בין כמה קודמים אופטימליים נבחר הזול לפי TIE_W · בחירה קבועה, שאינה
     תלויה בסדר הענפים, ושמקרבת את הקירוב ליישור שמשקלים ריאליים היו בוחרים. */
  let i = m, j = n;
  let guard = (m + n) * 2 + 8;
  while ((i > 0 || j > 0) && guard-- > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1] && D[i][j] === D[i - 1][j - 1]) { i--; j--; continue; }
    let best = null, bestCost = Infinity;
    const offer = (kind, ni, nj) => {
      const c = TIE_W[kind];
      if (c < bestCost) { bestCost = c; best = { kind, ni, nj }; }
    };
    if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1] &&
        isFinite(D[i - 2][j - 2]) && D[i][j] === D[i - 2][j - 2] + 1) offer('transpose', i - 2, j - 2);
    if (i > 0 && j > 0 && isFinite(D[i - 1][j - 1]) && D[i][j] === D[i - 1][j - 1] + 1) {
      offer(subKind(A[i - 1], B[j - 1], T), i - 1, j - 1);
    }
    if (i > 0 && isFinite(D[i - 1][j]) && D[i][j] === D[i - 1][j] + 1) offer(delKind(A, i, T), i - 1, j);
    if (j > 0 && isFinite(D[i][j - 1]) && D[i][j] === D[i][j - 1] + 1) offer(insKind(B, j, T), i, j - 1);
    if (!best) throw new Error(`opCounts: backtrace stuck at (${i},${j}) for "${A}" / "${B}"`);
    counts[best.kind]++;
    i = best.ni; j = best.nj;
  }
  if (i > 0 || j > 0) throw new Error(`opCounts: backtrace did not reach the origin for "${A}" / "${B}"`);

  /* שער פנימי · סכום הספירות חייב להיות המרחק הלא-ממושקל, אחרת סיווג כלשהו איבד פעולה
     והמכפלה הסקלרית תשקר בלי להיכשל. */
  let sum = 0;
  for (const k of OP_KEYS) sum += counts[k];
  if (sum !== dist) throw new Error(`opCounts: counted ${sum} operations but the distance is ${dist} for "${A}" / "${B}"`);

  return { dist, counts };
}

/* מכפלה סקלרית · הצורה שבה evolve מתמחרת גנום על וקטור שמור. */
function dotW(counts, W) {
  let s = 0;
  for (const k of OP_KEYS) s += (counts[k] || 0) * W[k];
  return s;
}

module.exports = { wEditDist, wEditDistBanded, opVectors, opCounts, dotW, OP_KEYS, UNIT_W, TIE_W, tablesFor, deriveHomo };
