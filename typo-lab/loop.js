'use strict';
/* לולאת הלמידה · typo-lab/loop.js
 *
 * *"מכונה שלומדת מכל תשובה וככה מדייקת את עצמה ואת האלגוריתם"* — וזה **לא** אימון
 * חד-פעמי. הלולאה:
 *
 *   1. התאם תלמיד על מה שמתויג עד כה
 *   2. הרץ אותו על כל הקורפוס
 *   3. אסוף את המקרים שבהם התלמיד חולק על המורה, ואת אלה שהוא הכי לא בטוח בהם
 *   4. שלח **אותם** לתיוג נוסף        ← כאן כל הערך
 *   5. חזור. עצור כששני סבבים לא הוסיפו כלום
 *
 * ===== ⭐ דגימה בגבול, לא אחידה · והנימוק אינו אסתטי =====
 *
 * פונקציית המטרה היא "למקסם קבלות נכונות תחת **אפס** קבלות-שווא". תחת אילוץ כזה,
 * הערך של פסק מורה אינו אחיד בכלל:
 *
 *   · שורה שהתלמיד **מקבל** ואינה מתויגת היא קבלת-שווא בכוח. פסק אחד עליה יכול להזיז
 *     סף שלם. זו התווית היקרה ביותר במערכת.
 *   · שורה שיושבת **על הגבול** (העלות שלה כמעט שווה לסף) קובעת היכן הסף ייפול.
 *   · שורה שרחוקה מהגבול משני הצדדים אינה משנה דבר. ‏90% מהזוגות הם כאלה.
 *
 * לכן פונקציית הרכישה היא: קודם מה שהתלמיד מקבל ואינו מתויג, אחר כך לפי המרחק המוחלט
 * מהגבול. **וזה נמדד מול דגימה אחידה באותו תקציב בדיוק**, כי "ברור שזה עדיף" הוא בדיוק
 * סוג הטענה שהפרויקט הזה דורש להוכיח.
 *
 * ===== ⚠ המורה כאן זמני · והמספרים יוחלפו =====
 *
 * המורה האמיתי (מודל ששופט תשובות) עדיין לא מוכן, וגם מחולל הקורפוס לא. עד שיהיו,
 * המורה הוא **התיוג הקיים בדאטהסט** (`out/dataset-{he,en}.jsonl`, ‏89,375 שורות),
 * והוא נשאל דרך `askTeacher` בלבד — פונקציה אחת, מונה אחד — כדי שהחלפתו במורה אמיתי
 * תהיה עריכה של פונקציה אחת ולא של הלולאה. **כל מספר בדוח שנגזר מכאן הוא זמני.**
 *
 * ===== ⛔ מה שאסור לגעת בו =====
 *
 *   · ‏holdout · לעולם אינו מתויג ולעולם אינו מאומן עליו. הוא רק נמדד.
 *   · ‏24 המקרים של חגי · holdout חיצוני. מדווח רק כמה נפתרים.
 *   · ‏40 התיוגים האנושיים (`out/semantic-blind.labeled.tsv`) · ground truth שאינו
 *     ניתן לייצור מחדש. לא אימון.
 */

const fs = require('fs');
const path = require('path');
const FIT = require('./fit.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const pct = x => (100 * x).toFixed(2) + '%';

/* ===== המורה · נקודת ההחלפה היחידה =====
 * ⚠ זמני. כשהמורה האמיתי יהיה מוכן, הפונקציה הזאת נקראת אליו והמונה נשאר כמו שהוא.
 */
function makeTeacher(S) {
  let asked = 0;
  const seen = new Set();
  return {
    ask(i) {
      if (!seen.has(i)) { seen.add(i); asked++; }
      return S.isAcc[i] === 1 ? 'accept' : 'reject';
    },
    get count() { return asked; },
    source: 'dataset-labels (זמני · המורה האמיתי טרם נבנה)',
  };
}

/* ===== מרחק מהגבול · מדד אי-הוודאות של התלמיד =====
 * חיובי = מתקבל בנוחות · שלילי = נדחה בנוחות · סביב אפס = הגבול עצמו.
 * מוחזר המרחק **המקסימלי** על פני הזוגות, כלומר הזוג שהכי קרוב לקבלה — זה הזוג
 * שמכריע את השורה, ולכן הוא זה שאי-הוודאות נמדדת עליו.
 */
function boundaryMargin(S, i, M) {
  if (S.gated[i] || S.tLen[i] < M.minLen) return -Infinity;
  const R = FIT.regimeOf(S.gap[i], M.cuts);
  const g = M.per[R];
  let best = -Infinity;
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const th = M.t[R * FIT.NBAND + S.pBand[p]];
    if (!(th > 0)) continue;
    const d = th - FIT.pairCost(S, p, g.wv, g.aFirst, g.aShare);
    if (d > best) best = d;
  }
  return best;
}

/* ===== פונקציית הרכישה · מה שווה לשלוח לתיוג =====
 *
 * דירוג · קטן יותר = דחוף יותר.
 *   ‏tier 0 · התלמיד **מקבל** ואין תווית · קבלת-שווא בכוח. התווית היקרה ביותר במערכת.
 *   ‏tier 1 · על הגבול מלמטה · ‎|margin|‎ קטן.
 * בתוך כל דרגה · ‎|margin|‎ עולה, כלומר הכי קרוב לסף קודם. שובר שוויון: אינדקס.
 *
 * ⭐ **סבב-סבב על התאים, ולא רשימה אחת.** הספים הם לכל תא ‎(משטר, רצועה)‎ בנפרד, ולכן
 * ‏250 תוויות שכולן נופלות בתא אחד מהדקות סף אחד ומשאירות את כל השאר פרוץ. נמדד: בלי
 * החלוקה הזאת שני סבבים רצופים לא הזיזו את המודל בכלל, וכלל העצירה הרג את הלולאה
 * ב-750 תוויות. החלוקה היא מה שהופך את התקציב לפרוס על כל מה שצריך הידוק.
 */
function cellOf(S, i, M) {
  const R = FIT.regimeOf(S.gap[i], M.cuts);
  let b = -1, best = -Infinity;
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const th = M.t[R * FIT.NBAND + S.pBand[p]];
    if (!(th > 0)) continue;
    const d = th - FIT.pairCost(S, p, M.per[R].wv, M.per[R].aFirst, M.per[R].aShare);
    if (d > best) { best = d; b = S.pBand[p]; }
  }
  return R * FIT.NBAND + (b < 0 ? 0 : b);
}

/* ‏עלות מינימלית על פני הזוגות · משמשת לשורות שהמודל **הנוכחי** סגר עליהן את הרצועה. */
function minCost(S, i, M) {
  const R = FIT.regimeOf(S.gap[i], M.cuts);
  const g = M.per[R];
  let best = Infinity;
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const c = FIT.pairCost(S, p, g.wv, g.aFirst, g.aShare);
    if (c < best) best = c;
  }
  return best;
}

function acquire(S, pool, M, k) {
  const cells = new Map();
  for (const i of pool) {
    if (S.gated[i] || S.tLen[i] < M.minLen || FIT.hardGated(S, i, M.marginHard)) continue;   // חסום מבנית · תווית עליו חסרת ערך
    const m = boundaryMargin(S, i, M);
    /* ⚠ **תיקון · שורה ברצועה שהמודל הנוכחי סגר אינה "חסרת ערך".** בגרסה הקודמת כל
       שורה בלי זוג פעיל הושמטה מהרכישה לחלוטין, ולכן היא לא יכלה להיות מתויגת **לעולם**
       — גם כשמודל מאוחר יותר היה פותח את הרצועה. נמדד: הדגימה בגבול נעצרה על 77.02%
       בעוד שהאחידה הגיעה ל-81.08% על אותו תקציב, וזה כל ההסבר. עכשיו הן נכנסות
       כדרגה 2, לפי העלות המינימלית — הזולה קודם, כי היא הראשונה שרצועה פתוחה תקבל. */
    const tier = m === -Infinity ? 2 : (m >= 0 ? 0 : 1);
    const d = m === -Infinity ? minCost(S, i, M) : Math.abs(m);
    const c = m === -Infinity ? FIT.regimeOf(S.gap[i], M.cuts) * FIT.NBAND + S.pBand[S.off[i]] : cellOf(S, i, M);
    let a = cells.get(c); if (!a) { a = []; cells.set(c, a); }
    a.push({ i, tier, d });
  }
  const keys = Array.from(cells.keys()).sort((a, b) => a - b);
  for (const c of keys) cells.get(c).sort((a, b) => a.tier - b.tier || a.d - b.d || a.i - b.i);
  const out = [];
  const cursor = new Map(keys.map(c => [c, 0]));
  let progressed = true;
  while (out.length < k && progressed) {
    progressed = false;
    for (const c of keys) {
      if (out.length >= k) break;
      const a = cells.get(c), at = cursor.get(c);
      if (at >= a.length) continue;
      out.push(a[at].i); cursor.set(c, at + 1); progressed = true;
    }
  }
  return out;
}

/* ===== דגימה אחידה · קו הבסיס שהטענה נמדדת מולו =====
 * ‏LCG קבוע · אותה סדרה בכל ריצה, בלי תלות ב-Math.random.
 */
function uniformPick(pool, k, seed) {
  const a = pool.slice();
  let s = (seed || 1) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, k);
}

/* ===== סבב אחד =====
 *
 * ⭐ **השליליות חוצות-הכרטיסים נכנסות תמיד, ואינן עולות תקציב מורה.** הן אינן תשובות
 * שלומד הקליד — הן **נמנות מהמאגר עצמו** (‏`evolve.buildCrossCard`, אותו מסנן של
 * `bank_gate`): וריאציה של כרטיס A שנוחתת על כרטיס B. אין למורה מה לפסוק עליהן, והן
 * זמינות offline במלואן.
 * ⚠ נמדד מה קורה בלעדיהן: הלולאה התכנסה למודל עם **326 קבלות-שווא חוצות-כרטיסים**,
 * כלומר בדיוק מה ששער המאגר פוסל. אילוץ שאפשר למנות אותו במלואו חייב להיאכף מבנית ולא
 * להישאב לדגימה.
 */
function fitOn(S, labeled, opts, structuralNeg) {
  const pos = [], neg = (structuralNeg || []).slice();
  for (const i of labeled) (S.isAcc[i] === 1 ? pos : neg).push(i);
  return FIT.fitStudent(S, neg, pos, opts);
}

/* ===== הלולאה המלאה =====
 *
 * ⚠ **תיקון למדד שהיה כאן קודם, והוא הלקח המרכזי של הסבב.** המדד הראשון היה
 * "‏recall ב-holdout", והוא נתן 98% אחרי 500 תוויות — בזמן שאותו מודל עשה **18
 * קבלות-שווא**. תלמיד שלא שמע על מספיק שליליות פשוט מקבל הכול; ‏recall גבוה הוא שם
 * **סימפטום של חוסר בטיחות**, לא איכות. תחת פונקציית מטרה של אפס קבלות-שווא, מדד
 * שאינו מסתכל על ה-FA מודד את הכיוון ההפוך.
 *
 * המדד הנכון · שני מספרים, ותמיד יחד:
 *   `faUnseen` · קבלות-שווא על שליליות ש**לא** תויגו · אימון-שלא-תויג + holdout + חוצות.
 *                זו ההכללה, וזה המספר שקובע אם המודל בר-משלוח בכלל.
 *   `holdoutRecall` · נמדד, אבל **נספר כאיכות רק כשה-FA אפס**.
 *
 * ‏mode · 'boundary' (הרכישה למעלה) או 'uniform' (קו הבסיס).
 * עצירה · שני סבבים רצופים בלי שינוי בזוג (faUnseen, holdoutTp).
 */
function runLoop(S, sp, opts) {
  const o = opts || {};
  const mode = o.mode || 'boundary';
  const seedN = o.seed == null ? 300 : o.seed;
  const perRound = o.perRound == null ? 250 : o.perRound;
  const maxRounds = o.maxRounds == null ? 200 : o.maxRounds;
  const budget = o.budget == null ? Infinity : o.budget;
  const teacher = makeTeacher(S);

  /* הבריכה · כל מה שאפשר לתייג. ⛔ holdout ו-cross אינם בפנים ולעולם לא ייכנסו. */
  const pool = sp.train.slice();
  const holdNeg = sp.holdNeg;
  const crossNeg = sp.cross.filter(i => S.isAcc[i] !== 1);

  let labeled = uniformPick(pool, Math.min(seedN, pool.length), 12345);
  for (const i of labeled) teacher.ask(i);
  const lab = new Uint8Array(S.N);
  for (const i of labeled) lab[i] = 1;

  const curve = [];
  let stale = 0, prevKey = null, model = null;

  for (let round = 0; round < maxRounds; round++) {
    model = fitOn(S, labeled, o.fit, crossNeg);
    const M = FIT.modelCoef(model);

    /* ‏FA על מה שלא תויג · זו ההכללה, ולא ה-FA על מה שהמודל כבר ראה (הוא אפס בהגדרה). */
    let faUnlab = 0;
    for (const i of sp.trainNeg) if (!lab[i] && FIT.decideModel(S, i, M)) faUnlab++;
    let faHold = 0;
    for (const i of holdNeg) if (FIT.decideModel(S, i, M)) faHold++;
    let faX = 0;
    for (const i of crossNeg) if (FIT.decideModel(S, i, M)) faX++;
    const h = FIT.evalModel(S, sp.holdout, model);
    const faUnseen = faUnlab + faHold + faX;

    curve.push({ round, labels: teacher.count, holdoutRecall: h.recall, holdoutTp: h.tp,
      faUnlabeled: faUnlab, faHoldout: faHold, faCross: faX, faUnseen });

    /* ⚠ **"שני סבבים לא הוסיפו כלום" = המודל לא זז**, ולא "המדד לא זז". ההבחנה אינה
       סמנטית: 250 תוויות שכולן חיוביות אינן משנות אף סף, המדד קופא, וכלל עצירה שמסתכל
       על המדד הורג את הלולאה בזמן שהיא עוד באמצע העבודה. נמדד — זה בדיוק מה שקרה. */
    const key = JSON.stringify(model.regimes.map(g => [g.W, g.aFirst, g.aShare, g.bands.map(b => b.t)]));
    if (key === prevKey) stale++; else { stale = 0; prevKey = key; }
    if (!o.noStop && stale >= (o.patience == null ? 3 : o.patience)) break;
    if (teacher.count >= budget) break;

    const rest = [];
    for (const i of pool) if (!lab[i]) rest.push(i);
    if (!rest.length) break;
    const k = Math.min(perRound, rest.length, budget - teacher.count);
    if (k <= 0) break;
    const next = mode === 'uniform' ? uniformPick(rest, k, 999 + round) : acquire(S, rest, M, k);
    if (!next.length) break;
    for (const i of next) { teacher.ask(i); lab[i] = 1; labeled.push(i); }
  }
  return { model, curve, labels: teacher.count, teacher: teacher.source, last: curve[curve.length - 1] };
}

/* ===== עקומת הלמידה · איכות מול מספר פסקי מורה =====
 * שתי שיטות, אותם תקציבים בדיוק, אותו זרע התחלתי. זו ההוכחה שהמשימה דורשת.
 */
function learningCurve(S, sp, budgets, opts) {
  const rows = [];
  for (const B of budgets) {
    for (const mode of ['uniform', 'boundary']) {
      /* ⭐ עקומת למידה מודדת את האיכות **בתקציב B**, ולכן היא מוציאה את כל התקציב.
         כלל העצירה נמדד בנפרד למטה · לערבב את השניים היה נותן "איכות בתקציב B"
         שהיא בעצם "איכות בתקציב שבו הלולאה החליטה לעצור", וזה מספר אחר לגמרי. */
      const r = runLoop(S, sp, Object.assign({}, opts, { mode, budget: B, noStop: true }));
      const L = r.last;
      rows.push({ budget: B, mode, labels: r.labels, holdoutRecall: L.holdoutRecall,
        faUnseen: L.faUnseen, faUnlabeled: L.faUnlabeled, faHoldout: L.faHoldout, faCross: L.faCross });
      say(`  ${String(B).padStart(6)} · ${mode.padEnd(8)} → holdout ${pct(L.holdoutRecall)} · FA לא-נראה ${String(L.faUnseen).padStart(4)} (לא-מתויג ${L.faUnlabeled} · holdout ${L.faHoldout} · חוצות ${L.faCross})`);
    }
  }
  return rows;
}

/* ===== ההרצה =====
 *   node --max-old-space-size=6144 typo-lab/loop.js [--set=en-word]
 */
function main() {
  const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
  const set = arg('set') || 'en-word';
  const S = FIT.pack(FIT.loadCache(set));
  const ci = FIT.cacheInfo();
  const sp = FIT.splits(S);
  const shipped = FIT.fromAppParams(FIT.shippedParams(set));
  const seedW = shipped.regimes.map(g => g.W);
  const fitOpts = { cuts: [2], seedW };

  const base = FIT.evalModel(S, sp.holdout, shipped);
  say(`${set} · מטמון ${ci.withCross ? 'עם' : '⚠ בלי'} הקבוצה חוצת-הכרטיסים`);
  say(`בסיס (מה שנשלח) · holdout ${pct(base.recall)}`);

  /* ===== התקרה · אותו מתאים בדיוק על **כל** התוויות =====
     זו הנקודה שעקומת הלמידה שואפת אליה, והיא בדיוק פרוטוקול B של `fit.js`. */
  const crossNeg = sp.cross.filter(i => S.isAcc[i] !== 1);
  const ceilModel = FIT.fitStudent(S, sp.trainNeg.concat(crossNeg), sp.trainPos, fitOpts);
  const cM = FIT.modelCoef(ceilModel);
  const ceil = FIT.evalModel(S, sp.holdout, ceilModel);
  let ceilFaHold = 0;
  for (const i of sp.holdNeg) if (FIT.decideModel(S, i, cM)) ceilFaHold++;
  say(`תקרה · כל ${sp.train.length} התוויות · holdout ${pct(ceil.recall)} · FA לא-נראה ${ceilFaHold}
`);

  const budgets = [250, 500, 1000, 2000, 4000, 8000, 16000, 30042];
  say('עקומת הלמידה · דגימה אחידה מול דגימה בגבול · אותו תקציב, אותו זרע');
  const rows = learningCurve(S, sp, budgets, { fit: fitOpts, seed: 250, perRound: 250 });

  /* ⭐ הטענה שדורשת הוכחה · כמה תוויות דרושות כדי להגיע לאיכות התקרה.
     "איכות" = ‏FA לא-נראה אינו גרוע מהתקרה **וגם** recall אינו נופל ממנה. */
  const reach = mode => {
    const r = rows.filter(x => x.mode === mode).sort((a, b) => a.labels - b.labels)
      .find(x => x.faUnseen <= ceilFaHold && x.holdoutRecall >= ceil.recall - 1e-9);
    return r ? r.labels : null;
  };
  const rb = reach('boundary'), ru = reach('uniform');
  say('');
  say(`הגעה לאיכות התקרה (‏FA ≤ ${ceilFaHold} וגם recall ≥ ${pct(ceil.recall)}) · גבול ${rb == null ? 'לא הגיע' : rb + ' תוויות'} · אחיד ${ru == null ? 'לא הגיע' : ru + ' תוויות'}`);
  if (rb != null && ru != null) say(`⭐ יחס · פי ${(ru / rb).toFixed(1)} פחות תוויות לדגימה בגבול`);

  /* בטיחות קודמת · כמה תוויות עד ש-FA הלא-נראה יורד מתחת לסף. זה המדד שקובע
     אם המודל בר-משלוח בכלל, ו-recall בלעדיו הוא מספר חסר משמעות. */
  say('\nתוויות עד ש-FA הלא-נראה יורד מתחת לסף:');
  for (const thr of [50, 20, 10, 5, 2, 1]) {
    const f = m => { const r = rows.filter(x => x.mode === m).sort((a, b) => a.labels - b.labels).find(x => x.faUnseen <= thr); return r ? r.labels : null; };
    const b = f('boundary'), u = f('uniform');
    say(`  FA ≤ ${String(thr).padStart(3)} · גבול ${String(b == null ? '—' : b).padStart(6)} · אחיד ${String(u == null ? '—' : u).padStart(6)}${(b && u) ? '  · פי ' + (u / b).toFixed(1) : ''}`);
  }

  /* השוואה זוגית · באותו תקציב, מי בטוח יותר ומי גבוה יותר */
  let bWins = 0, uWins = 0, tie = 0;
  for (const B of budgets) {
    const u = rows.find(r => r.budget === B && r.mode === 'uniform');
    const b = rows.find(r => r.budget === B && r.mode === 'boundary');
    if (!u || !b) continue;
    const key = x => [x.faUnseen, -x.holdoutRecall];
    const [bf, br] = key(b), [uf, ur] = key(u);
    if (bf < uf || (bf === uf && br < ur)) bWins++;
    else if (uf < bf || (uf === bf && ur < br)) uWins++;
    else tie++;
  }
  say(`\nהשוואה זוגית לפי תקציב (‏FA קודם, ואז recall) · גבול ${bWins} · אחיד ${uWins} · תיקו ${tie}`);

  /* לולאה אחת מלאה עם כלל העצירה */
  const run = runLoop(S, sp, { mode: 'boundary', fit: fitOpts, seed: 250, perRound: 250 });
  say(`\nלולאה עם כלל העצירה · ${run.curve.length} סבבים · ${run.labels} תוויות · holdout ${pct(run.last.holdoutRecall)} · FA לא-נראה ${run.last.faUnseen}`);
  say('סבב · תוויות · recall · FA לא-נראה');
  for (const c of run.curve) say(`  ${String(c.round).padStart(3)} · ${String(c.labels).padStart(6)} · ${pct(c.holdoutRecall).padStart(7)} · ${c.faUnseen}`);

  fs.writeFileSync(path.join(OUT, `student-loop-${set}.json`), JSON.stringify({
    set, cache: ci, teacher: run.teacher,
    baselineHoldoutRecall: base.recall,
    ceiling: { holdoutRecall: ceil.recall, faUnseen: ceilFaHold, labels: sp.train.length },
    curve: rows, reachedCeiling: { boundary: rb, uniform: ru },
    stoppingRun: { rounds: run.curve.length, labels: run.labels, perRound: run.curve },
    pairwise: { boundary: bWins, uniform: uWins, tie },
  }, null, 1));
  say(`\nנכתב · out/student-loop-${set}.json`);
}

if (require.main === module) main();

module.exports = { main, makeTeacher, boundaryMargin, acquire, uniformPick, fitOn, runLoop, learningCurve };
