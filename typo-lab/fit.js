'use strict';
/* התאמת התלמיד · typo-lab/fit.js
 *
 * **המורה** שופט תשובות. **התלמיד** הוא האלגוריתם הדטרמיניסטי שיושב ב-`app.js` ולומד
 * לחקות אותו. הקובץ הזה מתאים את התלמיד: מודל קטן, קריא, וכזה שנכנס כמה עשרות מספרים
 * לתוך `app.js`. ‏⛔ בלי רשת נוירונים, בלי ספרייה חיצונית, בלי שום דבר שאי אפשר לשלוח.
 *
 * ===== צורת המודל · אותה צורה שרצה היום, מוכללת =====
 *
 * ‏`nearMatch` היום מכריע כך: קיים מועמד ויישור שהעלות הממושקלת שלהם אינה עולה על סף
 * רצועת האורך. יש שני "משטרים" — רגיל וצר — והבחירה ביניהם היא לפי `gap` (המרחק
 * למילת המאגר הקרובה פחות המרחק לשלך). התלמיד מכליל בדיוק שני דברים:
 *
 *   1. ‏**N משטרי gap** במקום 2. כל משטר נושא וקטור ספים ומשקלים משלו · בדיוק כמו
 *      ‏`bandsTight`/`WTight`, רק שהמספר אינו קבוע ב-2.
 *   2. ‏**מקדמים על תכונות שאינן ספירת פעולות** · `posFirst` (עריכה שנוגעת באות
 *      הראשונה) ו-`shareRatio`. הם נכנסים לאותה מכפלה סקלרית, ולכן העלות בזמן ריצה
 *      היא חיבור אחד נוסף לכל יישור.
 *
 *      ‎cost(pair) = Σ_op W[op]·count[op] + aFirst·posFirst + aShare·(1−shareRatio)‎
 *      ‎accept ⟺ ∃pair : cost(pair) ≤ t[regime][band(candLen)]‎
 *
 * השערים הקשיחים (וטו מאגר · וטו לקסיקון · נטייה · minLen) **אינם גנים**, מאותו נימוק
 * שכתוב ב-`lib/checker.js`: אילוץ שהוא לרעת הכושר חייב להיות מחוץ להישג ידו של החיפוש,
 * אחרת הוא יכבה אותו בצעד הראשון.
 *
 * ===== ⭐ הספים אינם חיפוש · הם נוסחה סגורה =====
 *
 * זו הנקודה שמייתרת את רוב החיפוש, והיא נובעת ישירות מאילוץ אפס-קבלות-השווא:
 *
 *   שורה מתקבלת ⟺ ‎∃b : c(r,b) ≤ t[b]‎   (‏c(r,b) = העלות המינימלית של השורה ברצועה b)
 *   אפס קבלות-שווא ⟺ ‎∀r∈reject ∀b : c(r,b) > t[b]‎
 *
 * האילוץ הוא **קוניונקציה על פני הרצועות**, ולכן הוא **מתפרק לרצועה בודדת**:
 *
 *   ‎t[b] = הערך הגדול ביותר ברשת שקטן ממש מ-‎min_{r∈reject} c(r,b)‎
 *
 * כלומר בהינתן משקלים, וקטור הספים האופטימלי תחת אפס קבלות-שווא הוא **מחושב ולא
 * מחופש**, והוא אופטימלי הוכחית ולא "הטוב ביותר שנמצא". החיפוש מצטמצם למשקלים בלבד.
 * אותו פירוק חל גם על המשטרים: שורה שייכת למשטר אחד בדיוק (לפי ה-gap שלה), ולכן
 * התא ‎(משטר, רצועה)‎ הוא היחידה העצמאית.
 *
 * ⚠ **ומה שזה לא נותן:** אפס שחושב על אוכלוסייה אחת אינו אפס על אוכלוסייה אחרת. זה
 * נמדד בפרויקט הזה ולא הונח (‏`STATE.md` · fold1 של gloss · נקודה נקייה על evolve עם
 * שתי קבלות-שווא ב-holdout). לכן `fitStudent` מקבל את קבוצת השליליות שהאילוץ נאכף
 * עליה כפרמטר מפורש, ו-`evalModel` מודד את ה-FA בכל קבוצה בנפרד ומדווח אותן לחוד.
 *
 * ⚠ **ואפס קבלות-שווא אינו אפס נזק.** זה הפיל שלושה סבבים בפרויקט. `residue()` כאן
 * מונה את השארית המלאה — כמה מחרוזות המודל מקבל, מהן כמה מילים אמיתיות, וכמה אינן
 * מילה כלל — והדוח מחויב להביא אותה לכל מועמד.
 */

const fs = require('fs');
const path = require('path');
const F = require('./features.js');

const OUT = path.join(__dirname, 'out');
const CACHE = path.join(OUT, 'cache');
const OPK = F.OP_KEYS;                       // 8 · סדר קבוע, נשמר בקובץ
const NOP = OPK.length;
const say = s => process.stdout.write(s + '\n');

/* ===== רצועות אורך · אותה רשת של app.js ===== */
const BAND_MAX = 20;                          // 1..20 ואז "מעל"
const NBAND = BAND_MAX + 1;
const bandOf = len => (len >= 1 && len <= BAND_MAX) ? len - 1 : BAND_MAX;

/* ===== משטרי gap =====
 * ‏gapRegime(gap, cuts) · cuts=[2] משחזר את היום (‏gap 1 = צר, gap≥2 = רגיל).
 * ‏cuts=[2,3] מוסיף משטר שלישי. הרשימה עולה, והמשטר האחרון הוא "כל השאר".
 */
function regimeOf(gap, cuts) {
  for (let i = 0; i < cuts.length; i++) if (gap < cuts[i]) return i;
  return cuts.length;
}

/* ===== אריזה · מהמטמון למערכים טיפוסיים =====
 * ‏`recs` מגיע מ-`out/cache/<set>.json` שנבנה פעם אחת מ-`evolve.loadRows` + `features`.
 * כאן זה נהיה שטוח: כל זוג (מועמד, יישור) הוא רשומה, וכל שורה מצביעה על טווח זוגות.
 */
function pack(recs) {
  const N = recs.length;
  let P = 0;
  for (const r of recs) P += r.pairs.length;

  const gap = new Int16Array(N), tLen = new Int16Array(N), kLen = new Int16Array(N);
  const gated = new Uint8Array(N);             // חסום מבנית · אף מודל אינו יכול לקבל
  const isAcc = new Uint8Array(N), trusted = new Uint8Array(N), hold = new Uint8Array(N);
  const today = new Uint8Array(N), cross = new Uint8Array(N), realWord = new Uint8Array(N);
  const zngry = new Uint8Array(N);   // ⛔ מחלקת zngry · נספרת בנפרד מהחוצות-כרטיסים
  const off = new Int32Array(N + 1);
  /* ⚠ **‏Float64 ולא Float32, וזה לא קוסמטיקה.** הספים נופלים בנוסחה סגורה **בדיוק**
     על גבול העלות, ולכן כל הפרש ברמת ה-ULP מכריע קבלה. עם Float32 יצא
     ‎2·(1−0.9) = 0.20000000298‎ מול ‎0.19999999999‎ ב-Float64, והמועמד נחלק מ-`lib/checker.js`
     ב-**47 שורות**, כולן על הגבול המדויק (‏`differejce`~`difference` · עלות 0.4 מול סף 0.4).
     שני מימושים שאינם מסכימים על ULP אינם שני מימושים של אותו חוק. */
  const pBand = new Uint8Array(P), pCnt = new Float64Array(P * NOP);
  const pFirst = new Float64Array(P), pShare = new Float64Array(P);

  let p = 0;
  for (let i = 0; i < N; i++) {
    const r = recs[i], rw = r.row;
    gap[i] = rw.gap; tLen[i] = rw.typedLen; kLen[i] = r.kLen == null ? rw.typedLen : r.kLen;
    /* השערים הקשיחים · בדיוק אלה של lib/checker.js, ובאותו סדר. */
    gated[i] = (rw.isBankWord || rw.isRealWord || rw.isInflection || r.pairs.length === 0) ? 1 : 0;
    isAcc[i] = r.label === 'accept' ? 1 : 0;
    trusted[i] = r.trusted === false ? 0 : 1;
    hold[i] = r.holdout ? 1 : 0;
    today[i] = r.today ? 1 : 0;
    cross[i] = r.cross ? 1 : 0;
    realWord[i] = r.why === 'real-word' ? 1 : 0;
    zngry[i] = r.why === 'zngry' ? 1 : 0;
    off[i] = p;
    for (const q of r.pairs) {
      pBand[p] = bandOf(q.candLen);
      for (let j = 0; j < NOP; j++) pCnt[p * NOP + j] = q['op_' + OPK[j]];
      pFirst[p] = q.posFirst;
      pShare[p] = 1 - q.shareRatio;
      p++;
    }
  }
  off[N] = p;
  return { N, P, gap, tLen, kLen, gated, isAcc, trusted, hold, today, cross, realWord, zngry, off, pBand, pCnt, pFirst, pShare, recs };
}

/* ===== עלות זוג · המכפלה הסקלרית שהריצה תעשה ===== */
/* ⚠ **סדר הסכימה מראה מול `featureCost` ב-`lib/checker.js`, אות באות.** שם זה
   ‎`off + (pos===0 ? aFirst : 0)` ואז צבירה על OP_KEYS; חיבור בסדר אחר נותן תוצאה
   שונה ב-ULP, וזה מספיק כדי לפצל החלטה על הגבול. אם אחד מהשניים משתנה — השני חייב. */
function pairCost(S, p, wv, aFirst, aShare) {
  let c = (aShare > 0 ? aShare * S.pShare[p] : 0) + (S.pFirst[p] ? aFirst : 0);
  const base = p * NOP;
  for (let j = 0; j < NOP; j++) c += S.pCnt[base + j] * wv[j];
  return c;
}

/* ===== ⭐ הנוסחה הסגורה · ספים אופטימליים תחת אפס קבלות-שווא =====
 *
 * ‏negIdx · השליליות שהאילוץ נאכף עליהן. ‏posIdx · החיוביות שה-recall נמדד עליהן.
 * מחזיר ספים לכל תא (משטר, רצועה) ואת ה-recall שהם נותנים.
 *
 * ‏GRID · הרשת שהמספר שנשלח יושב עליה. הסף נצנח לערך הגדול ביותר ברשת שקטן ממש מהמינימום
 * של השליליות · "קטן ממש" ולא "קטן או שווה", כי הקבלה עצמה היא ‎cost ≤ t‎.
 */
const GRID = 0.05;
const snapBelow = v => {
  if (!isFinite(v)) return Infinity;
  const g = Math.floor((v - 1e-9) / GRID) * GRID;
  return Math.max(0, Math.round(g * 1e6) / 1e6);
};

/* ‏marginHard · הכרעת חגי, לא גן. מתחתיו נדחה תמיד, ולפני כל חישוב. */
const MARGIN_HARD = 1;
const hardGated = (S, i, mh) => S.gap[i] < (mh == null ? MARGIN_HARD : mh);

function solveThresholds(S, negIdx, posIdx, coef) {
  const { cuts, wv, aFirst, aShare, minLen } = coef;
  const NR = cuts.length + 1;
  const CELLS = NR * NBAND;
  /* המינימום של השליליות בכל תא · מאתחלים לאינסוף (אין שלילית = הסף חופשי). */
  const negMin = new Float64Array(CELLS).fill(Infinity);

  for (let x = 0; x < negIdx.length; x++) {
    const i = negIdx[x];
    if (S.gated[i] || hardGated(S, i, coef.marginHard) || S.tLen[i] < minLen) continue;
    const R = regimeOf(S.gap[i], cuts);
    const hi = S.off[i + 1];
    for (let p = S.off[i]; p < hi; p++) {
      const cell = R * NBAND + S.pBand[p];
      const c = pairCost(S, p, wv, aFirst, aShare);
      if (c < negMin[cell]) negMin[cell] = c;
    }
  }

  const t = new Float64Array(CELLS);
  for (let c = 0; c < CELLS; c++) t[c] = snapBelow(negMin[c]);

  /* ⚠ תקרה · סף שאף שלילית אינה מגבילה ישב באינסוף, וזו בדיוק הצורה שנפסלה בסבב
     ה-gloss ("רצועה שיושבת בתקרה כי הדאטה שותק שם"). הוא נחתך לעלות המרבית שחיובית
     כלשהי באמת צריכה בתא הזה · מעליה הסף אינו קונה כלום ורק פותח סיכון עתידי. */
  const posMax = new Float64Array(CELLS).fill(-Infinity);
  for (let x = 0; x < posIdx.length; x++) {
    const i = posIdx[x];
    if (S.gated[i] || hardGated(S, i, coef.marginHard) || S.tLen[i] < minLen) continue;
    const R = regimeOf(S.gap[i], cuts);
    const hi = S.off[i + 1];
    for (let p = S.off[i]; p < hi; p++) {
      const cell = R * NBAND + S.pBand[p];
      const c = pairCost(S, p, wv, aFirst, aShare);
      if (c <= t[cell] && c > posMax[cell]) posMax[cell] = c;
    }
  }
  for (let c = 0; c < CELLS; c++) {
    if (posMax[c] === -Infinity) t[c] = 0;                       // אף חיובית · הרצועה מתה
    else t[c] = Math.min(t[c], snapBelow(posMax[c] + GRID));
  }
  return t;
}

/* ===== ההכרעה של התלמיד · שורה אחת ===== */
function decide(S, i, coef, t) {
  if (S.today[i]) return true;                                   // שכבה 1 · מה שמתקבל היום
  if (S.gated[i]) return false;
  if (hardGated(S, i, coef.marginHard)) return false;            // הכרעת חגי · לפני הכול
  if (S.tLen[i] < coef.minLen) return false;
  const R = regimeOf(S.gap[i], coef.cuts);
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const th = t[R * NBAND + S.pBand[p]];
    if (!(th > 0)) continue;
    if (pairCost(S, p, coef.wv, coef.aFirst, coef.aShare) <= th) return true;
  }
  return false;
}

/* ===== מדידה · על כל תת-קבוצה, ובהפרדה ===== */
function evalOn(S, idx, coef, t) {
  let tp = 0, nAcc = 0, fa = 0, nRej = 0, faReal = 0, faToday = 0;
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const acc = S.isAcc[i] === 1;
    if (acc) { if (S.trusted[i]) nAcc++; } else nRej++;
    if (!decide(S, i, coef, t)) continue;
    if (acc) { if (S.trusted[i]) tp++; }
    else { fa++; if (S.realWord[i]) faReal++; if (S.today[i]) faToday++; }
  }
  return { tp, nAcc, recall: nAcc ? tp / nAcc : 0, fa, nRej, faRealWord: faReal, faToday, faOwn: fa - faToday };
}

/* ===== חלוקות ===== */
function splits(S) {
  const train = [], holdout = [], cross = [], all = [], zngry = [];
  for (let i = 0; i < S.N; i++) {
    all.push(i);
    if (S.zngry && S.zngry[i]) { zngry.push(i); continue; }
    if (S.cross[i]) { cross.push(i); continue; }
    (S.hold[i] ? holdout : train).push(i);
  }
  const pick = (arr, want) => arr.filter(i => (S.isAcc[i] === 1) === want);
  return {
    train, holdout, cross, all, zngry,
    trainPos: pick(train, true), trainNeg: pick(train, false),
    holdPos: pick(holdout, true), holdNeg: pick(holdout, false),
  };
}

/* ===== החיפוש · טיפוס קואורדינטות דטרמיניסטי =====
 *
 * הספים מחושבים בנוסחה סגורה בכל צעד, ולכן החיפוש רץ **רק על המשקלים ועל שני
 * המקדמים**. סדר הקואורדינטות קבוע, הרשת קבועה, ושוברי-שוויון קבועים · אותה כניסה
 * מחזירה אותו מודל, בלי זרע ובלי אקראיות.
 *
 * הכושר הוא ‏recall על `posIdx` כשהאילוץ מתקיים על `negIdx` (והוא מתקיים תמיד לפי
 * הבנייה). שובר שוויון: מודל פשוט יותר · סכום ספים קטן יותר.
 */
const W_GRID = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.35, 1.8, 2.4, 3, 99];
const A_GRID = [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 99];

function scoreOf(S, negIdx, posIdx, coef) {
  const t = solveThresholds(S, negIdx, posIdx, coef);
  const r = evalOn(S, posIdx, coef, t);
  let sum = 0;
  for (let c = 0; c < t.length; c++) sum += t[c];
  return { t, tp: r.tp, recall: r.recall, complexity: sum };
}

function better(a, b) {
  if (a.tp !== b.tp) return a.tp > b.tp;
  return a.complexity < b.complexity;
}

/* ⭐ **התחלות מרובות · והנימוק אינו נוחות.**
 * טיפוס קואורדינטות מוצא אופטימום מקומי. הזרעה מ**המשקלים הנשלחים** מבטיחה שהמודל
 * לעולם לא יֵצֵא גרוע מהבסיס: באותם משקלים בדיוק, הספים בנוסחה הסגורה הם המרביים
 * תחת אפס קבלות-שווא, ולכן מספר הקבלות אינו יכול לרדת מתחת למה שהספים הנשלחים נותנים.
 * בלי ההזרעה הזאת התקבל מודל שמרוויח בסך הכול ו**מפסיד ברצועת אורך 6** · בדיוק צורת
 * ה"לא פארטו" שכבר סומנה בפרויקט כהחלטה מוצרית ולא כשיפור.
 */
function seedsFor(S, opts, R) {
  const out = [{ wv: new Float64Array(NOP).fill(1), aFirst: 0, aShare: 0 }];
  const sh = opts && opts.seedW && opts.seedW[R];
  if (sh) {
    const v = new Float64Array(NOP);
    for (let j = 0; j < NOP; j++) v[j] = sh[OPK[j]] == null ? 1 : sh[OPK[j]];
    out.push({ wv: v, aFirst: 0, aShare: 0 });
  }
  return out;
}

/* ‏שומר פארטו · אם נמסר `paretoRef` (recall לפי אורך של הבסיס, על **חיוביות האימון**),
   מועמד שמרגרס באיזושהי רצועת אורך נפסל. זו אינה אופטימיזציה אלא אילוץ מוצרי:
   שיפור שמוריד אורך מסוים הוא החלפה, לא שדרוג, וזו הכרעה של חגי ולא שלי. */
function lengthProfile(S, idx, coefFull, t) {
  const m = new Map();
  for (const i of idx) {
    if (S.isAcc[i] !== 1 || !S.trusted[i]) continue;
    const L = S.kLen[i] >= 12 ? 12 : S.kLen[i];
    let e = m.get(L); if (!e) { e = { n: 0, tp: 0 }; m.set(L, e); }
    e.n++; if (decide(S, i, coefFull, t)) e.tp++;
  }
  return m;
}

function fitStudent(S, negIdx, posIdx, opts) {
  const o = opts || {};
  const cuts = o.cuts || [2];
  const NR = cuts.length + 1;
  const marginHard = o.marginHard == null ? MARGIN_HARD : o.marginHard;
  const minLen = o.minLen == null ? 0 : o.minLen;
  const out = { cuts, minLen, marginHard, regimes: [] };
  let total = { tp: 0, nAcc: 0 };

  /* המודל הוא איחוד של משטרים בלתי-תלויים · כל משטר נפתר בנפרד, וזה מדויק ולא קירוב:
     שורה שייכת למשטר אחד, ולכן לא המשקלים ולא הספים של משטר אחר יכולים להשפיע עליה. */
  for (let R = 0; R < NR; R++) {
    const inR = i => regimeOf(S.gap[i], cuts) === R;
    const nneg = negIdx.filter(inR), npos = posIdx.filter(inR);
    const asCoef = c => ({ cuts: [], wv: c.wv, aFirst: c.aFirst, aShare: c.aShare, minLen, marginHard });

    /* יעד הפארטו · פרופיל האורך של הבסיס, במשטר הזה בלבד. */
    let ref = null;
    if (o.paretoRef) {
      const rc = { cuts: [], wv: o.paretoRef.wv[R], aFirst: 0, aShare: 0, minLen: o.paretoRef.minLen, marginHard };
      ref = lengthProfile(S, npos, rc, o.paretoRef.t[R]);
    }
    const passesPareto = (c, t) => {
      if (!ref) return true;
      const cur = lengthProfile(S, npos, asCoef(c), t);
      for (const [L, e] of ref) {
        const g = cur.get(L);
        if ((g ? g.tp : 0) < e.tp) return false;
      }
      return true;
    };

    let best = null, bestCur = null;
    for (const seed of seedsFor(S, o, R)) {
      const cur = { wv: Float64Array.from(seed.wv), aFirst: seed.aFirst, aShare: seed.aShare };
      let sc = scoreOf(S, nneg, npos, asCoef(cur));
      if (!passesPareto(cur, sc.t)) sc = null;
      const rounds = o.rounds == null ? 5 : o.rounds;
      for (let round = 0; round < rounds; round++) {
        let moved = false;
        const tryAxis = (get, set, grid) => {
          const orig = get();
          let bestV = orig;
          for (const v of grid) {
            if (v === orig) continue;
            set(v);
            const s = scoreOf(S, nneg, npos, asCoef(cur));
            if (!passesPareto(cur, s.t)) continue;
            if (!sc || better(s, sc)) { sc = s; bestV = v; }
          }
          set(bestV);
          if (bestV !== orig) moved = true;
        };
        for (let j = 0; j < NOP; j++) tryAxis(() => cur.wv[j], v => { cur.wv[j] = v; }, W_GRID);
        for (const key of (o.noFeat ? [] : (o.only ? [o.only] : ['aFirst', 'aShare']))) {
          tryAxis(() => cur[key], v => { cur[key] = v; }, A_GRID);
        }
        if (!moved) break;
      }
      if (sc && (!best || better(sc, best))) { best = sc; bestCur = { wv: Float64Array.from(cur.wv), aFirst: cur.aFirst, aShare: cur.aShare }; }
    }
    if (!bestCur) throw new Error(`fitStudent: אף התחלה לא סיפקה את שומר הפארטו במשטר ${R}`);

    const t = solveThresholds(S, nneg, npos, asCoef(bestCur));
    const bands = [];
    for (let b = 0; b < NBAND; b++) bands.push({ maxLen: b < BAND_MAX ? b + 1 : null, t: t[b] });
    const W = {};
    for (let j = 0; j < NOP; j++) W[OPK[j]] = bestCur.wv[j];
    out.regimes.push({ maxGap: R < cuts.length ? cuts[R] : null, W, aFirst: bestCur.aFirst, aShare: bestCur.aShare, bands });
    const r = evalOn(S, npos, asCoef(bestCur), t);
    total.tp += r.tp; total.nAcc += r.nAcc;
  }
  out.trainRecall = total.nAcc ? total.tp / total.nAcc : 0;
  return out;
}

/* ===== ⭐ הידוק · הסף הנמוך ביותר ששומר על סט ההחלטות ביט-אחר-ביט =====
 *
 * זה בדיוק ה-clamp שהופעל בסבב ה-gloss, ומאותה סיבה: **רצועה שיושבת גבוה כי אף שורה
 * אינה מגבילה אותה היא לא-מופרכת ולא בטוחה**, וכל הוספה עתידית למאגר מדליקה אותה בלי
 * שאיש ישים לב. ההידוק אינו יכול לשנות אף החלטה — הוא נבדק על **מפת הביטים המלאה**
 * ולא על סקלר ה-recall, ולכן "אותו recall במקרה" אינו יכול לעבור כאן.
 */
function clampModel(S, idx, model) {
  const M0 = modelCoef(model);
  const ref = new Uint8Array(idx.length);
  for (let x = 0; x < idx.length; x++) ref[x] = decideModel(S, idx[x], M0) ? 1 : 0;

  const out = JSON.parse(JSON.stringify(model));
  let lowered = 0, saved = 0;
  for (let R = 0; R < out.regimes.length; R++) {
    for (let b = 0; b < NBAND; b++) {
      const t0 = out.regimes[R].bands[b].t;
      if (!(t0 > 0)) continue;
      /* חיפוש בינארי על הרשת · הערך הקטן ביותר ששומר על הזהות. */
      let lo = 0, hi = Math.round(t0 / GRID);
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        out.regimes[R].bands[b].t = Math.round(mid * GRID * 1e6) / 1e6;
        const M = modelCoef(out);
        let same = true;
        for (let x = 0; x < idx.length && same; x++) if ((decideModel(S, idx[x], M) ? 1 : 0) !== ref[x]) same = false;
        if (same) hi = mid; else lo = mid + 1;
      }
      const tf = Math.round(lo * GRID * 1e6) / 1e6;
      out.regimes[R].bands[b].t = tf;
      if (tf < t0) { lowered++; saved += t0 - tf; }
    }
  }
  /* שער · הזהות חייבת להישמר. אם לא — ההידוק שגוי וכל מה שאחריו חסר ערך. */
  const M1 = modelCoef(out);
  let diff = 0;
  for (let x = 0; x < idx.length; x++) if ((decideModel(S, idx[x], M1) ? 1 : 0) !== ref[x]) diff++;
  if (diff) throw new Error(`clampModel: ההידוק שינה ${diff} החלטות · אינו no-op`);
  out.clamp = { lowered, saved: Math.round(saved * 100) / 100, identical: true };
  return out;
}

/* ===== המודל כמבנה נתונים אחד · לחישוב ולדיווח ===== */
function modelCoef(model) {
  const NR = model.regimes.length;
  const t = new Float64Array(NR * NBAND);
  const wv = [];
  for (let R = 0; R < NR; R++) {
    const g = model.regimes[R];
    for (let b = 0; b < NBAND; b++) t[R * NBAND + b] = g.bands[b].t;
    const v = new Float64Array(NOP);
    for (let j = 0; j < NOP; j++) v[j] = g.W[OPK[j]];
    wv.push({ wv: v, aFirst: g.aFirst, aShare: g.aShare });
  }
  return { t, per: wv, cuts: model.cuts, minLen: model.minLen, marginHard: model.marginHard == null ? MARGIN_HARD : model.marginHard };
}

function decideModel(S, i, M) {
  if (S.today[i]) return true;
  if (S.gated[i]) return false;
  if (hardGated(S, i, M.marginHard)) return false;
  if (S.tLen[i] < M.minLen) return false;
  const R = regimeOf(S.gap[i], M.cuts);
  const g = M.per[R];
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const th = M.t[R * NBAND + S.pBand[p]];
    if (!(th > 0)) continue;
    if (pairCost(S, p, g.wv, g.aFirst, g.aShare) <= th) return true;
  }
  return false;
}

function evalModel(S, idx, model) {
  const M = modelCoef(model);
  let tp = 0, nAcc = 0, fa = 0, nRej = 0, faReal = 0;
  for (let x = 0; x < idx.length; x++) {
    const i = idx[x];
    const acc = S.isAcc[i] === 1;
    if (acc) { if (S.trusted[i]) nAcc++; } else nRej++;
    if (!decideModel(S, i, M)) continue;
    if (acc) { if (S.trusted[i]) tp++; }
    else { fa++; if (S.realWord[i]) faReal++; }
  }
  return { tp, nAcc, recall: nAcc ? tp / nAcc : 0, fa, nRej, faRealWord: faReal };
}

/* ===== recall לפי אורך · הפילוח שחושף רגרסיה שהסקלר מסתיר ===== */
function recallByLength(S, idx, model) {
  const M = modelCoef(model);
  const m = new Map();
  for (const i of idx) {
    if (S.isAcc[i] !== 1 || !S.trusted[i]) continue;
    const L = S.kLen[i] >= 12 ? '12+' : String(S.kLen[i]);
    let e = m.get(L); if (!e) { e = { len: L, n: 0, tp: 0 }; m.set(L, e); }
    e.n++; if (decideModel(S, i, M)) e.tp++;
  }
  return Array.from(m.values())
    .sort((a, b) => (a.len === '12+' ? 99 : +a.len) - (b.len === '12+' ? 99 : +b.len))
    .map(e => Object.assign(e, { recall: e.n ? e.tp / e.n : null }));
}

/* ===== ⛔ השארית · אפס קבלות-שווא אינו אפס נזק =====
 * לכל מועמד: כמה מחרוזות מתקבלות · מהן כמה מילים אמיתיות · כמה אינן מילה כלל.
 * זה הסעיף שהפיל שלושה סבבים בפרויקט, והוא חובה בכל דוח.
 */
function residue(S, idx, model, baseModel) {
  const M = modelCoef(model);
  const B = baseModel ? modelCoef(baseModel) : null;
  let accepted = 0, real = 0, bank = 0, notWord = 0;
  let newAcc = 0, newGood = 0, newBad = 0, newNotWord = 0;
  const sample = [], badSample = [];
  for (const i of idx) {
    const ok = decideModel(S, i, M);
    if (!ok) continue;
    const r = S.recs[i];
    const isReal = !!r.row.isRealWord, isBank = !!r.row.isBankWord;
    accepted++;
    if (isReal) real++; else if (isBank) bank++; else notWord++;
    if (B && !decideModel(S, i, B)) {
      newAcc++;
      if (S.isAcc[i] === 1) newGood++; else { newBad++; if (badSample.length < 20) badSample.push({ typed: r.typedKey, term: r.term, why: r.why }); }
      if (!isReal && !isBank && sample.length < 20) { newNotWord++; sample.push({ typed: r.typedKey, term: r.term }); }
      else if (!isReal && !isBank) newNotWord++;
    }
  }
  return {
    accepted, realWord: real, bankWord: bank, notAWord: notWord,
    newAccepts: newAcc, newCorrect: newGood, newFalse: newBad, newNotAWord: newNotWord,
    sample, badSample,
  };
}

/* ===== טעינה ===== */
/* ‏`withCross` נרשם ומוחזר · **כל דוח חייב לומר באיזה מטמון הוא נמדד.** מטמון בלי
   הקבוצה חוצת-הכרטיסים אוכף אילוץ חלש יותר, ו-`STATE.md` מתעד שזה בדיוק המקום שבו
   נבחרים גנומים מורעלים. שתיקה כאן הייתה מייצרת מספר שנראה טוב ואינו בר-משלוח. */
let LAST_CACHE = null;
function loadCache(set) {
  const full = path.join(CACHE, set + '.json');
  const noX = path.join(CACHE, set + '.nocross.json');
  if (fs.existsSync(full)) { LAST_CACHE = { file: full, withCross: true }; return JSON.parse(fs.readFileSync(full, 'utf8')); }
  if (fs.existsSync(noX)) {
    LAST_CACHE = { file: noX, withCross: false };
    say('⚠ מטמון **בלי** הקבוצה חוצת-הכרטיסים · האילוץ כאן חלש יותר ממה שהשער יאכוף');
    return JSON.parse(fs.readFileSync(noX, 'utf8'));
  }
  throw new Error(`fit: אין מטמון תכונות ל-${set} · הריצו build_features.js`);
}
const cacheInfo = () => LAST_CACHE;

/* ⛔ שליליות מחלקת `zngry` · אילוץ מבני, לא תוויות מורה.
   נבנות ב-`zngry_negatives.js` ממנייה מלאה של המאגר, ולכן הן עולות **אפס** תקציב
   פסקים · בדיוק כמו השליליות חוצות-הכרטיסים. */
function loadZngry() {
  const f = path.join(CACHE, 'en-word.zngry.json');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/* ===== גשר אל `app.js` · לשני הכיוונים =====
 *
 * ‏`fromAppParams` ממיר את מה ש**נשלח היום** לצורת המודל כאן, כדי שהבסיס והמועמד
 * יימדדו באותו צינור בדיוק. בלי זה ההשוואה "‏69.09% → ?" משווה שני מדדים ולא שתי
 * נקודות · וזה בדיוק סוג התקלה שהפרויקט הזה מתעד שוב ושוב.
 *
 * ‏`toAppParams` מחזיר את הכיוון השני, וזורק אם המודל אינו בר-ביטוי במבנה של היום
 * (יותר משני משטרים, או מקדם תכונה שאינו אפס בלי תמיכה בקוד). זריקה ולא השלמה
 * שקטה: המלצה שלא ניתן להדביק גרועה מהמלצה שאין.
 */
function expandBands(bands) {
  const out = new Array(NBAND).fill(0);
  const norm = bands.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t || 0 }))
    .sort((a, b) => a.maxLen - b.maxLen);
  for (let b = 0; b < NBAND; b++) {
    const len = b < BAND_MAX ? b + 1 : BAND_MAX + 1;
    let t = norm[norm.length - 1].t;
    for (const x of norm) if (len <= x.maxLen) { t = x.t; break; }
    out[b] = t;
  }
  return out.map((t, b) => ({ maxLen: b < BAND_MAX ? b + 1 : null, t }));
}

function fromAppParams(P) {
  const mh = P.marginHard == null ? (P.vetoMargin == null ? 1 : P.vetoMargin) : P.marginHard;
  const ms = P.marginSoft == null ? mh : P.marginSoft;
  const W = Object.assign({}, P.W);
  const WT = P.WTight ? Object.assign({}, P.WTight) : W;
  const bands = expandBands(P.bands);
  const bandsT = P.bandsTight ? expandBands(P.bandsTight) : bands;
  /* ‏4ד · אותה ירושה בדיוק של `lib/checker.js`: הצר יורש מהרגיל כשהוא חסר, והרגיל
     נופל ל-0. ⚠ הגרסה הראשונה כאן קידדה 0 קשיח בשני המשטרים, ולכן שער A דיווח
     ‏3,378 אי-התאמות מול `checker.js` — כלומר השער השווה מועמד עם גן מול מודל בלי גן.
     בדיוק הכשל של `shipParams` שתועד ב-`bank_gate.js`, ובאותו מקום מבני. */
  const num = (v, d) => (v == null ? d : v);
  const aF = num(P.aFirst, 0), aS = num(P.aShare, 0);
  const aFT = num(P.aFirstTight, aF), aST = num(P.aShareTight, aS);
  if (ms > mh) {
    return { cuts: [ms], minLen: P.minLen || 0, marginHard: mh,
      regimes: [{ maxGap: ms, W: WT, aFirst: aFT, aShare: aST, bands: bandsT },
        { maxGap: null, W, aFirst: aF, aShare: aS, bands }] };
  }
  return { cuts: [], minLen: P.minLen || 0, marginHard: mh,
    regimes: [{ maxGap: null, W, aFirst: aF, aShare: aS, bands }] };
}

function toAppParams(model, base) {
  if (model.regimes.length > 2) {
    throw new Error(`toAppParams: ${model.regimes.length} משטרים · app.js תומך בשניים (bands/bandsTight). המודל אינו בר-הדבקה כמו שהוא`);
  }
  const shrink = bands => bands.map(b => ({ maxLen: b.maxLen, t: Math.round(b.t * 1e6) / 1e6 }));
  const out = Object.assign({}, base || {});
  out.minLen = model.minLen;
  out.marginHard = model.marginHard;
  if (model.regimes.length === 2) {
    out.marginSoft = model.cuts[0];
    out.bandsTight = shrink(model.regimes[0].bands);
    out.WTight = model.regimes[0].W;
    out.bands = shrink(model.regimes[1].bands);
    out.W = model.regimes[1].W;
    out.aFirstTight = model.regimes[0].aFirst;
    out.aShareTight = model.regimes[0].aShare;
    out.aFirst = model.regimes[1].aFirst;
    out.aShare = model.regimes[1].aShare;
  } else {
    out.marginSoft = model.marginHard;
    out.bands = shrink(model.regimes[0].bands);
    out.W = model.regimes[0].W;
    out.aFirst = model.regimes[0].aFirst;
    out.aShare = model.regimes[0].aShare;
  }
  return out;
}

/* ===== המדידה · הבסיס, המועמדים, והשיניים =====
 *
 *   node --max-old-space-size=6144 typo-lab/fit.js [--set=en-word]
 *
 * שלב 0 הוא **שחזור הבסיס**: הפרמטרים שנשלחים היום, דרך הצינור הזה, חייבים להחזיר את
 * המספר שרשום בארטיפקט. אם לא — הצינור מודד משהו אחר, וכל מספר שאחריו חסר ערך. זה
 * עוצר בכשל ואינו ממשיך.
 */
function reportModel(S, sp, name, model, baseFor) {
  const h = evalModel(S, sp.holdout, model);
  const tr = evalModel(S, sp.train, model);
  const xr = evalModel(S, sp.cross, model);
  const zn = sp.zngry && sp.zngry.length ? evalModel(S, sp.zngry, model) : { fa: 0, nRej: 0 };
  const res = residue(S, sp.train.concat(sp.holdout, sp.cross), model, baseFor);
  return {
    name,
    holdoutRecall: h.recall, holdoutTp: h.tp, holdoutN: h.nAcc, holdoutFA: h.fa,
    trainRecall: tr.recall, trainFA: tr.fa, crossFA: xr.fa,
    zngryFA: zn.fa, zngryN: zn.nRej,
    faRealWord: h.faRealWord + tr.faRealWord + xr.faRealWord,
    residue: res,
    byLength: recallByLength(S, sp.holdout, model),
    regimes: model.regimes.length,
    model,
  };
}

/* הפרמטרים הנשלחים · `out/typo-rules.json` הוא מקור האמת (‏`app.js` ביט-זהה לו,
   ונבדק). קריאה בלבד · הקובץ אינו שלי. */
function shippedParams(set, file) {
  const f = file || process.env.TYPO_RULES || path.join(OUT, 'typo-rules.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!j.params || !j.params[set]) throw new Error(`fit: אין params.${set} ב-typo-rules.json`);
  return j.params[set];
}

/* ===== ⭐ שער A · הצינור מול `lib/checker.js`, ביט-אחר-ביט =====
 *
 * לא "אותו recall" · **אותה מפת החלטות**. זה ההבדל בין להשוות שתי נקודות לבין להשוות
 * שני מדדים, וההבדל הזה כבר הפיל מספרים בפרויקט הזה (‏`selfcheck34` דיווח 19
 * קבלות-שווא על מסלול מהיר שאינו יודע לבטא משטר צר).
 *
 *   node --max-old-space-size=6144 typo-lab/fit.js --gate --set=en-word
 *
 * ‏`--break` מריץ את אותו שער על מודל שהוזז בכוונה בצעד רשת אחד · הוא חייב לחזור אדום.
 */
function gate(set) {
  const EV = require('./evolve.js');
  const { makeChecker } = require('./lib/checker.js');
  const P = shippedParams(set);
  say(`שער A · פרמטרים מ-${process.env.TYPO_RULES || 'out/typo-rules.json'}`);
  const S = pack(loadCache(set));

  say('טוען הקשר אמיתי · זה החלק היקר');
  const { perSet, langs } = EV.loadRows();
  const rows = perSet[set];
  const byId = new Map();
  for (let i = 0; i < S.N; i++) {
    const r = S.recs[i];
    if (r.cross) continue;
    byId.set(`${r.term}|${r.unit}|${r.typed}`, i);
  }

  /* אמת הבסיס · `lib/checker.js` על כל שורה, פעם אחת. */
  const checkers = {};
  const pairsIdx = [], truth = [];
  let missing = 0;
  for (const r of rows) {
    const i = byId.get(`${r.term}|${r.unit}|${r.typed}`);
    if (i == null) { missing++; continue; }
    const L = langs[r.lang];
    const ck = checkers[r.lang] || (checkers[r.lang] = makeChecker(P, L.ctx, L.veto, r.lang));
    const card = L.byCard.get(r.term + '|' + r.unit);
    pairsIdx.push(i);
    truth.push((r.set === 'gloss' ? ck.acceptGloss(r.typed, card) : ck.acceptWord(r.typed, card)).ok);
  }

  const compare = (model, label) => {
    const M = modelCoef(model);
    let diff = 0;
    const sample = [];
    for (let x = 0; x < pairsIdx.length; x++) {
      const i = pairsIdx[x];
      if (truth[x] === decideModel(S, i, M)) continue;
      diff++;
      if (sample.length < 4) { const r = S.recs[i]; sample.push(`"${r.typed}" ~ ${r.term}`); }
    }
    say(`  ${label.padEnd(46)} ${String(diff).padStart(6)} אי-התאמות${sample.length ? '  · ' + sample.join(' · ') : ''}`);
    return diff;
  };

  const clone = m => JSON.parse(JSON.stringify(m));
  const shipped = fromAppParams(P);
  say(`שער A · ${pairsIdx.length} שורות · ${missing} בלי התאמה במטמון`);
  const ok = compare(shipped, 'הפרמטרים הנשלחים · חייב להיות 0');

  /* ===== שיניים · שלוש מוטציות, כל אחת חייבת להאדים =====
     ⚠ מוטציה שלא ראיתי אדומה אינה עדות, ומוטציה שאינה מזיזה החלטה אינה מוטציה.
     ‏M1 היא הקטנה ביותר שאפשר: **צעד רשת אחד** על כל התאים. */
  const teeth = {};
  const m1 = clone(shipped);
  for (const g of m1.regimes) for (const b of g.bands) if (b.t > 0) b.t += GRID;
  teeth.M1 = compare(m1, 'M1 · כל סף +0.05 · צעד רשת אחד');

  const m2 = clone(shipped);
  m2.regimes[0].bands = m2.regimes[1].bands;              // המשטר הצר מאבד את הספים שלו
  m2.regimes[0].W = m2.regimes[1].W;
  teeth.M2 = compare(m2, 'M2 · המשטר הצר מוחלף ברגיל');

  const m3 = clone(shipped);
  m3.marginHard = 0;                                      // הכרעת חגי מבוטלת
  teeth.M3 = compare(m3, 'M3 · marginHard 1→0');

  /* ⭐ פילוח הרצועות · שתי שאלות **שונות**, ובכוונה שתיהן.
     ⚠ תיקון לניסוח שהיה כאן קודם: "העלאה בצעד אחד לא הזיזה כלום" **אינה** אומרת
     שהרצועה אינה נושאת דבר. היא אומרת רק שאין שורה שהעלות שלה נופלת בחלון
     ‎(t, t+0.05]‎. שתי השאלות הנפרדות הן:
       ‏carries · הורדה בצעד אחד מאבדת קבלה אמיתית → הרצועה נושאת משקל
       ‏binding · העלאה בצעד אחד מכניסה דחייה     → הסף יושב על גבול הבטיחות */
  let carries = 0, binding = 0, slack = 0;
  const perBand = [];
  for (let R = 0; R < shipped.regimes.length; R++) {
    for (let b = 0; b < NBAND; b++) {
      const t0 = shipped.regimes[R].bands[b].t;
      if (!(t0 > 0)) continue;
      const probe = (delta) => {
        const m = clone(shipped);
        m.regimes[R].bands[b].t = Math.max(0, t0 + delta);
        const M = modelCoef(m);
        let lostAcc = 0, gainedRej = 0;
        for (let x = 0; x < pairsIdx.length; x++) {
          const i = pairsIdx[x];
          const now = decideModel(S, i, M);
          if (now === truth[x]) continue;
          if (truth[x] && !now) lostAcc += (S.isAcc[i] === 1 ? 1 : 0);
          if (!truth[x] && now) gainedRej += (S.isAcc[i] === 1 ? 0 : 1);
        }
        return { lostAcc, gainedRej };
      };
      const down = probe(-GRID), up = probe(+GRID);
      if (down.lostAcc > 0) carries++;
      if (up.gainedRej > 0) binding++;
      if (down.lostAcc === 0 && up.gainedRej === 0) slack++;
      perBand.push({ regime: R, band: b + 1, t: t0, losesAcceptsWhenLowered: down.lostAcc, admitsRejectsWhenRaised: up.gainedRej });
    }
  }
  say(`  רצועות · ${carries} נושאות קבלות (הורדה מאבדת) · ${binding} על גבול הבטיחות (העלאה מכניסה דחייה) · ${slack} רפויות בשני הכיוונים`);
  return { n: pairsIdx.length, diff: ok, missing, teeth, carries, binding, slack, perBand };
}

function main() {
  const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
  const has = k => process.argv.includes('--' + k);
  const set = arg('set') || 'en-word';

  if (has('gate')) {
    const g = gate(set);
    if (g.diff !== 0) throw new Error('שער A אדום · הצינור אינו זהה ל-lib/checker.js');
    const silent = Object.keys(g.teeth).filter(k => g.teeth[k] === 0);
    if (silent.length) throw new Error(`שער A ירוק גם על מוטציות ${silent.join(', ')} · אין לו שיניים`);
    say('✅ שער A · זהות ביט-אחר-ביט מול lib/checker.js, ושלוש המוטציות הוכחו אדומות');
    fs.writeFileSync(path.join(OUT, `student-gateA-${set}.json`), JSON.stringify(g, null, 1));
    return;
  }

  say(`טוען מטמון · ${set}`);
  /* ⛔ מחלקת `zngry` נטענת לתוך אותו pack · היא **חייבת** להיות בתוך האילוץ ולא לצידו.
     נמדד מה קורה בלעדיה: המועמד עלה מ-46.48% ל-63.38% מהכרטיסים במחלקה, כלומר קנה
     recall בדיוק במטבע שאין לו שום שכבת הגנה אחרת. */
  const withZ = !process.argv.includes('--no-zngry');
  const zrecs = withZ && set === 'en-word' ? loadZngry() : null;
  const recs = loadCache(set);
  const S = pack(zrecs ? recs.concat(zrecs) : recs);
  if (zrecs) say(`⛔ נטענו ${zrecs.length} שליליות מחלקת zngry · אילוץ מבני, אפס תקציב מורה`);
  else if (withZ && set === 'en-word') say('⚠ אין מטמון zngry · המדידה **אינה** מכסה את המחלקה');
  const ci = cacheInfo();
  const sp = splits(S);
  say(`${S.N} שורות · ${S.P} זוגות · אימון ${sp.train.length} · holdout ${sp.holdout.length} · חוצות ${sp.cross.length} · zngry ${sp.zngry.length} · מטמון ${ci.withCross ? 'עם' : '⚠ בלי'} הקבוצה חוצת-הכרטיסים`);

  /* ===== שלב 0 · הבסיס, דרך אותו צינור בדיוק =====
     שער A כבר הוכיח שהצינור זהה ביט-אחר-ביט ל-`lib/checker.js`, ולכן המספר כאן הוא
     מה ש**באמת** נשלח — ולא מה שכתוב בדוח כלשהו. */
  const shipped = fromAppParams(shippedParams(set));
  const base = reportModel(S, sp, 'בסיס · מה שנשלח היום', shipped);
  const baseFull = evalModel(S, sp.all, shipped);
  say(`\nבסיס · holdout ${(100 * base.holdoutRecall).toFixed(2)}% · סט מלא ${(100 * baseFull.recall).toFixed(2)}% · FA hold ${base.holdoutFA} train ${base.trainFA} cross ${base.crossFA}`);

  /* ===== שני פרוטוקולים · ובכוונה שניהם =====
   *
   * ⭐ **A · בר-משלוח.** אילוץ אפס-הקבלות נאכף מול **כל שלילית שיש לנו** (אימון +
   *    holdout + חוצות-כרטיסים). זו הפרקטיקה שהפרויקט כבר אימץ ל-gloss אחרי ש-fold1
   *    הוכיח שאפס אינו עובר בין אוכלוסיות ("ספי המועמד חסומים מול כל שורה שיש לנו").
   *    ⚠ ולכן ‏FA=0 כאן הוא **מבנה ולא הכללה**, וזה נאמר במפורש בכל דיווח.
   *    המשקלים והתקרה נקבעים מ**חיוביות האימון בלבד** · חיוביות ה-holdout אינן משתתפות.
   *
   * ⚠ **B · מבחן ההכללה.** אותו חיפוש בדיוק, אבל האילוץ מול שליליות האימון בלבד.
   *    ‏FA ב-holdout כאן הוא **הראיה** לשאלה "האם אפס עובר לאוכלוסייה חדשה". אם הוא
   *    אינו אפס — זה נרשם, ולא מוסתר מאחורי פרוטוקול A.
   */
  const negAll = sp.train.concat(sp.holdout, sp.cross, sp.zngry).filter(i => S.isAcc[i] !== 1);
  const negTrain = sp.trainNeg.concat(sp.cross.filter(i => S.isAcc[i] !== 1));

  /* הזרעה מהמשקלים הנשלחים · שני משטרים, בסדר (צר, רגיל). */
  const seedW = shipped.regimes.map(g => g.W);
  const shC = modelCoef(shipped);
  const paretoRef = { wv: shC.per.map(x => x.wv), t: [0, 1].map(R => shC.t.slice(R * NBAND, (R + 1) * NBAND)), minLen: shipped.minLen };

  const variants = [
    { key: 'V0', name: 'V0 · ספים בנוסחה סגורה · בלי תכונה חדשה', opts: { cuts: [2], noFeat: true, seedW } },
    { key: 'V1', name: 'V1 · + posFirst + shareRatio', opts: { cuts: [2], seedW } },
    { key: 'V2', name: 'V2 · שלושה משטרי gap', opts: { cuts: [2, 3], seedW } },
    { key: 'VA', name: 'VA · אבלציה · posFirst בלבד', opts: { cuts: [2], seedW, only: 'aFirst' } },
    { key: 'VB', name: 'VB · אבלציה · shareRatio בלבד', opts: { cuts: [2], seedW, only: 'aShare' } },
    { key: 'V4', name: 'V4 · V1 + שומר פארטו לפי אורך', opts: { cuts: [2], seedW, paretoRef } },
  ];

  const out = { set, cache: ci, baseline: base, baselineFull: baseFull, A: [], B: [] };
  say('\n⭐ פרוטוקול A · האילוץ מול כל שלילית שיש לנו · FA=0 מבנית');
  for (const v of variants) {
    const raw = fitStudent(S, negAll, sp.trainPos, v.opts);
    const m = clampModel(S, sp.all, raw);
    const r = reportModel(S, sp, v.name, m, shipped);
    r.clamp = m.clamp;
    out.A.push(r);
    say(`  ${v.name.padEnd(40)} holdout ${(100 * r.holdoutRecall).toFixed(2)}% · FA h/t/x/z ${r.holdoutFA}/${r.trainFA}/${r.crossFA}/${r.zngryFA} · חדשות ${r.residue.newAccepts} (${r.residue.newFalse} שגויות)`);
  }
  say('\n⚠ פרוטוקול B · האילוץ מול שליליות האימון בלבד · ה-FA ב-holdout הוא הראיה על ההכללה');
  for (const v of variants) {
    const m = fitStudent(S, negTrain, sp.trainPos, v.opts);
    const r = reportModel(S, sp, v.name, m);
    out.B.push(r);
    say(`  ${v.name.padEnd(40)} holdout ${(100 * r.holdoutRecall).toFixed(2)}% · FA hold ${r.holdoutFA} · train ${r.trainFA}`);
  }

  const best = out.A.reduce((a, b) => (b.holdoutRecall > a.holdoutRecall ? b : a));
  say(`\n⭐ ${set} · ${(100 * base.holdoutRecall).toFixed(2)}% → ${(100 * best.holdoutRecall).toFixed(2)}%  (${best.name})`);
  say(`   שארית · ${best.residue.accepted} קבלות בסך הכול · מהן ${best.residue.realWord} מילים אמיתיות · ${best.residue.bankWord} מילות מאגר · ${best.residue.notAWord} אינן מילה כלל`);
  say(`   מעל הבסיס · ${best.residue.newAccepts} קבלות חדשות · ${best.residue.newCorrect} נכונות · ${best.residue.newFalse} שגויות · ${best.residue.newNotAWord} מהן אינן מילה`);
  say(`   לפי אורך · ${best.byLength.map(x => x.len + ':' + (100 * x.recall).toFixed(0) + '%').join(' ')}`);

  fs.writeFileSync(path.join(OUT, `student-${set}.json`), JSON.stringify(out, null, 1));
  say(`\nנכתב · out/student-${set}.json`);
  return out;
}

if (require.main === module) main();

module.exports = {
  main, reportModel,
  pack, splits, fitStudent, evalModel, decideModel, modelCoef, recallByLength, residue, clampModel, lengthProfile,
  solveThresholds, evalOn, regimeOf, bandOf, loadCache, loadZngry, cacheInfo, pairCost, MARGIN_HARD, hardGated, shippedParams, gate,
  fromAppParams, toAppParams, expandBands,
  NBAND, BAND_MAX, GRID, OPK, NOP,
};
