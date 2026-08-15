'use strict';
/* he_graded_search.js · האם קיימת נקודה מדורגת עברית שעולה על מה שנשלח, באפס קבלות-שווא
 *
 * ===== למה קובץ נפרד ולא עוד שלב ב-shortword.js =====
 *
 * ‏shortword.js נבנה סביב שאלה אנגלית, ושלב 8 שלו מודד את he-word בנקודה **אחת**:
 * ‏marginSoft=2, minLen=0, W ראשי כפי שנשלח, בחירה לפי recall אימון בלבד. הנקודה הזאת
 * נמדדה ונפסלה (‏19.14% עם קבלת-שווא אחת). נקודה אחת אינה חיפוש, ולכן כאן נסרק המרחב.
 *
 * ===== ההבדל המבני בין עברית לאנגלית · הוא שקובע מה הגן עושה =====
 *
 * ‏en-word נשלח עם vetoMargin = 2, כלומר שורות gap=1 נדחו **לפני** שכבת המרחק. הגן
 * המדורג שם היה **פתיחה**: marginHard 1 החזיר אותן למשחק, ו-bandsTight/WTight הגבילו
 * מה מותר להן.
 *
 * ‏he-word נשלח עם vetoMargin = **1**. שורות gap=1 כבר מתקבלות היום, תחת אותו וקטור
 * ספים בדיוק של שורות gap≥2. לכן הגן המדורג בעברית אינו יכול לפתוח אף שורה חדשה:
 * ‏marginHard נשאר 1 והקבוצה הנגישה זהה לחלוטין לזו של היום. מה שהוא **כן** עושה הוא
 * **ניתוק**: היום ספי המשטר היחיד מוחזקים למטה על ידי סיכון קבלות-השווא של gap=1,
 * ושורות gap≥2 משלמות את המחיר. הפרדת שני הווקטורים מאפשרת לספים של gap≥2 לעלות.
 *
 * מכאן שתי מסקנות שאסור לבלוע:
 *   1. מעטפת הבטיחות זהה לזו של היום · אף מחרוזת שנדחית היום בגלל marginHard אינה
 *      נפתחת כאן. זה מקטין את הסיכון, ואינו מבטל את הצורך ב-bank_gate.
 *   2. ההשערה האנגלית ("במשטר הצר מותרות רק עריכות מאריכות") **אינה** ההשערה הנכונה
 *      כאן, כי המשטר הצר אינו הצד שנפתח. לכן נסרקות כל תת-הקבוצות ולא נבחרת אחת מראש.
 *
 * ===== האילוץ · אפס קבלות-שווא, ובאיזו אוכלוסייה =====
 *
 * הכשל שכבר קרה בפרויקט הזה פעמיים (‏gloss/fold1, והנקודה העברית של shortword שלב 8):
 * גנום שהוא נקי על שורות האימון **אינו** נקי על שורות אחרות. לכן כל נקודה כאן נמדדת
 * בארבעה מקומות · אימון, holdout, סט מלא, וקבוצת השליליות חוצות-הכרטיסים · ורק נקודה
 * שהיא אפס בכולם נחשבת מועמדת. שני מסלולי כיול מדווחים בנפרד:
 *   TRAIN · הספים מכוילים על שורות האימון בלבד · ה-holdout הוא מבחן הכללה אמיתי.
 *   ALL   · הספים מכוילים כשהאילוץ נספר על **כל** שורה שיש לנו · אפס ב-holdout הוא
 *           אז מבנה ולא הכללה, וה-recall הוא הטענה. זה מה שנעשה במועמד ה-gloss.
 *
 * ⛔ שער המאגר הוא הסמכות הסופית. שום מספר כאן אינו תחליף לו.
 *
 * הרצה · node typo-lab/he_graded_search.js [--selftest] [--quick] [--cross <path>]
 */

const fs = require('fs');
const path = require('path');

const EV = require('./evolve.js');
const CH = require('./lib/checker.js');
const SE = require('./lib/shortword_eval.js');
const SW = require('./shortword.js');
const { mulberry32 } = require('./lib/rng.js');
const { OP_KEYS } = require('./lib/wdist.js');

const OUT = path.join(__dirname, 'out');
const ARGS = process.argv.slice(2);
const has = f => ARGS.includes(f);
const argVal = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const SELFTEST = has('--selftest');
const QUICK = has('--quick');
const SET = 'he-word';
const say = s => process.stdout.write(s + '\n');
const pct = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const MAXL = SE.MAXL;

const W_FLOOR = 0.2;                                  // מעטפת buildCrossCard · לא יורדים מתחתיה
const EXPENSIVE = 99;
const idxAll = S => Int32Array.from({ length: S.N }, (_, i) => i);
const mkW = allow => { const W = {}; for (const k of OP_KEYS) W[k] = allow.includes(k) ? 1 : EXPENSIVE; return W; };

/* ===== שער הקבוצה חוצת-הכרטיסים · הוא רץ לפני כל מדידה, ועוצר בכשל =====
 *
 * ‏out/coverage-cross.json ממופתח ב-sha של הדאטהסט **בלבד**, ולכן הוא מדווח "תקף" גם
 * כשהבנאי (‏evolve.buildCrossCard) השתנה מאז. זה בדיוק הבאג שתועד ב-STATE.md: המטמון
 * מחזיק 533/398 בזמן ש-typo-rules.json רושם 534/396. שורה חוצת-כרטיסים חסרה היא נקודה
 * עיוורת · "אפס קבלות-שווא" מולה אינו נמדד אלא לא-נצפה, וזה הכשל שהפיל את מועמד ה-gloss
 * בשער המאגר. לכן הספירה נבדקת מול typo-rules.json, ואי-התאמה עוצרת.
 */
function loadCross(perSet, langs) {
  const rules = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const want = {};
  for (const s of EV.SETS) want[s] = rules.results[s].crossCard.rowsInRisk;

  const CROSS_ARG = argVal('--cross', null);
  const tryFiles = CROSS_ARG ? [path.resolve(CROSS_ARG)] : [path.join(OUT, 'he-cross.json'), path.join(OUT, 'coverage-cross.json')];
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const dsKey = (manifest.files || []).map(f => f.name + ':' + f.sha256).sort().join('|');

  for (const f of tryFiles) {
    if (!fs.existsSync(f)) continue;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    const got = Object.fromEntries(EV.SETS.map(s => [s, (c.rows[s] || []).length]));
    const okKey = c.dsKey === dsKey;
    const okCnt = EV.SETS.every(s => got[s] === want[s]);
    say(`  מועמד מטמון ${path.basename(f)} · dsKey ${okKey ? '✅' : '⛔'} · ספירה ${JSON.stringify(got)} מול typo-rules ${JSON.stringify(want)} ${okCnt ? '✅' : '⛔ מעופש'}`);
    if (okKey && okCnt) return { rows: c.rows, stats: c.stats, source: path.basename(f) };
  }
  say('  אף מטמון אינו תקף · בנייה מחדש (‏~450 שניות)');
  const cross = EV.buildCrossCard(langs, perSet);
  const got = Object.fromEntries(EV.SETS.map(s => [s, (cross.rows[s] || []).length]));
  if (!EV.SETS.every(s => got[s] === want[s])) {
    throw new Error(`הבנאי החזיר ${JSON.stringify(got)} ואילו typo-rules.json רושם ${JSON.stringify(want)} · אחד מהם שגוי ואין להמשיך`);
  }
  fs.writeFileSync(path.join(OUT, 'he-cross.json'), JSON.stringify({ dsKey, stats: cross.stats, rows: cross.rows }));
  return { rows: cross.rows, stats: cross.stats, source: 'rebuilt' };
}

/* ===== main ===== */
function main() {
  const T0 = Date.now();
  const rep = { generatedAt: new Date().toISOString(), argv: ARGS, set: SET, stages: {} };

  say('טעינה ...');
  const { perSet, langs } = EV.loadRows();
  say('\n===== שער 0 · הקבוצה חוצת-הכרטיסים =====');
  const cross = loadCross(perSet, langs);
  say(`  מקור: ${cross.source}`);
  rep.crossSource = cross.source;

  const S = EV.packSet(perSet[SET]);
  const X = EV.packSet(cross.rows[SET]);
  const AUX = SE.buildAux(S), XAUX = SE.buildAux(X);
  const ALL = idxAll(S), xI = idxAll(X);
  const nh = [], ho = [];
  for (let i = 0; i < S.N; i++) (S.hold[i] ? ho : nh).push(i);
  const NH = Int32Array.from(nh), HO = Int32Array.from(ho);
  say(`  he-word · ${S.N} שורות (${NH.length} אימון · ${HO.length} holdout) · ${X.N} שורות חוצות-כרטיסים`);
  rep.rows = { total: S.N, train: NH.length, holdout: HO.length, cross: X.N };

  const rules = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const shipP = CH.normalizeParams(rules.params[SET]);
  const wvShip = SE.constW(shipP.W);

  const scnTrain = SW.makeScn(S, NH, X, xI);
  const scnHold = SW.makeScn(S, HO, X, xI);
  const scnFull = SW.makeScn(S, ALL, X, xI);
  const share = () => { for (const t of [scnFull, scnHold]) { t.CN = scnTrain.CN; t.CT = scnTrain.CT; t.XCN = scnTrain.XCN; t.XCT = scnTrain.XCT; } };

  /* ================= שלב 1 · הבסיס · מה שנשלח, נמדד כאן ================= */
  say('\n===== שלב 1 · הבסיס · הפרמטרים שנשלחים היום =====');
  SW.compileFor(scnFull, AUX, XAUX, wvShip, null, null, null);
  scnTrain.CN = scnFull.CN; scnTrain.CT = scnFull.CT; scnTrain.XCN = scnFull.XCN; scnTrain.XCT = scnFull.XCT;
  scnHold.CN = scnFull.CN; scnHold.CT = scnFull.CT; scnHold.XCN = scnFull.XCN; scnHold.XCT = scnFull.XCT;
  const shipE = SE.mkE({
    minLen: shipP.minLen, useLexicon: true, bands: shipP.bands,
    marginHard: shipP.vetoMargin, marginSoft: shipP.vetoMargin
  });
  const base = {
    train: SW.evalPoint(scnTrain, shipE), holdout: SW.evalPoint(scnHold, shipE), full: SW.evalPoint(scnFull, shipE)
  };
  say(`  אימון ${pct(base.train.recall)} · holdout ${pct(base.holdout.recall)} · סט מלא ${pct(base.full.recall)}`);
  say(`  קבלות-שווא · אימון ${base.train.fa} · holdout ${base.holdout.fa} · מלא ${base.full.fa} (סט ${base.full.sfa} · חוצות ${base.full.xfa})`);
  say(`  vetoMargin שנשלח = ${shipP.vetoMargin} · minLen = ${shipP.minLen}`);
  say(`  ‏typo-rules.json רושם holdout ${pct(rules.results[SET].holdout.recall)} · STATE.md רושם 18.10%`);
  rep.stages.baseline = {
    params: { minLen: shipP.minLen, vetoMargin: shipP.vetoMargin, W: shipP.W, bands: shipP.bands },
    trainRecall: base.train.recall, holdoutRecall: base.holdout.recall, fullRecall: base.full.recall,
    trainFA: base.train.fa, holdoutFA: base.holdout.fa, fullFA: base.full.fa, crossFA: base.full.xfa,
    artifactHoldout: rules.results[SET].holdout.recall,
    byLengthHold: SE.recallByLength(S, HO, shipE, scnFull.CN, scnFull.CT)
  };

  /* ================= שלב 2 · האבחון העברי ================= */
  say('\n===== שלב 2 · מה בדיוק שונה בעברית =====');
  const gapTab = [];
  {
    const m = new Map();
    for (let i = 0; i < S.N; i++) {
      const f = S.flags[i];
      if (!(f & 8) || !(f & 16)) continue;
      const L = S.kLen[i] >= 12 ? 12 : S.kLen[i];
      let e = m.get(L);
      if (!e) { e = { len: L === 12 ? '12+' : String(L), n: 0, gapLt1: 0, gap1: 0, gap2: 0, gapGe3: 0 }; m.set(L, e); }
      const g = S.dOther[i] - S.dOwn[i];
      e.n++; if (g < 1) e.gapLt1++; else if (g === 1) e.gap1++; else if (g === 2) e.gap2++; else e.gapGe3++;
    }
    for (const [, e] of Array.from(m.entries()).sort((a, b) => a[0] - b[0])) { e.shareGap1 = e.n ? e.gap1 / e.n : null; gapTab.push(e); }
  }
  say('  שורות accept עבריות לפי אורך ולפי gap = dOther − dOwn:');
  say('   אורך |     n | gap<1 | gap=1 | gap=2 | gap>=3 | חלק gap=1');
  for (const e of gapTab) say(`   ${String(e.len).padStart(4)} | ${String(e.n).padStart(5)} | ${String(e.gapLt1).padStart(5)} | ${String(e.gap1).padStart(5)} | ${String(e.gap2).padStart(5)} | ${String(e.gapGe3).padStart(6)} | ${pct(e.shareGap1)}`);

  /* אילו שורות בכלל נגישות · marginHard=1 חוסם gap<1 היום ומחר, ולכן זו התקרה. */
  let accReach = 0, accTot = 0;
  for (let i = 0; i < S.N; i++) {
    const f = S.flags[i];
    if (!(f & 8) || !(f & 16)) continue;
    accTot++;
    if (S.dOther[i] - S.dOwn[i] >= 1) accReach++;
  }
  say(`  שורות accept נגישות תחת marginHard=1: ${accReach}/${accTot} (${pct(accReach / accTot)}) · זו התקרה המבנית, לפני כל סף`);

  const crossTab = [];
  {
    const m = new Map();
    for (let i = 0; i < X.N; i++) {
      const L = X.kLen[i] >= 12 ? 12 : X.kLen[i];
      let e = m.get(L);
      if (!e) { e = { len: L === 12 ? '12+' : String(L), n: 0, gap1: 0, gap2: 0, gapGe3: 0 }; m.set(L, e); }
      const g = X.dOther[i] - X.dOwn[i];
      e.n++; if (g === 1) e.gap1++; else if (g === 2) e.gap2++; else if (g >= 3) e.gapGe3++;
    }
    for (const [, e] of Array.from(m.entries()).sort((a, b) => a[0] - b[0])) crossTab.push(e);
  }
  say('  פולשים חוצי-כרטיסים לפי אורך: ' + crossTab.map(e => `${e.len}:${e.n}(g1=${e.gap1},g2=${e.gap2})`).join(' '));

  const live = new Array(SE.K).fill(0);
  for (let p = 0; p < S.pairs; p++) for (let j = 0; j < SE.K; j++) if (S.pCnt[p * SE.K + j] > 0) live[j]++;
  const liveIdx = [];
  for (let j = 0; j < SE.K; j++) if (live[j] > 0) liveIdx.push(j);
  say('  אופרטורים חיים בעברית: ' + OP_KEYS.map((k, j) => `${k}=${live[j]}`).join(' '));
  say(`  ${liveIdx.length} חיים → ${1 << liveIdx.length} תת-קבוצות למשטר הצר`);
  rep.stages.diagnosis = {
    gapByLength: gapTab, crossByLength: crossTab,
    liveOps: Object.fromEntries(OP_KEYS.map((k, j) => [k, live[j]])),
    reachableAcceptShare: accReach / accTot, reachableAccepts: accReach, totalAccepts: accTot
  };

  /* ================= שלב 3 · הסריקה ================= */
  say('\n===== שלב 3 · סריקת המרחב המדורג =====');
  const subsets = [];
  for (let mask = 0; mask < (1 << liveIdx.length); mask++) {
    const allow = [];
    for (let b = 0; b < liveIdx.length; b++) if (mask & (1 << b)) allow.push(OP_KEYS[liveIdx[b]]);
    subsets.push(allow);
  }
  const SOFTS = QUICK ? [2] : [2, 3];
  const MINLENS = QUICK ? [shipP.minLen] : [0, shipP.minLen];

  /* נקודה נמדדת ומדווחת · אותה פונקציה לשני מסלולי הכיול, כדי שהם לא ייפרדו. */
  const measure = (t, meta) => {
    const tr = SW.evalPoint(scnTrain, t.E), hoP = SW.evalPoint(scnHold, t.E), fu = SW.evalPoint(scnFull, t.E);
    return Object.assign({
      trainRecall: tr.recall, holdoutRecall: hoP.recall, fullRecall: fu.recall,
      trainFA: tr.fa, holdoutFA: hoP.fa, fullFA: fu.fa, setFA: fu.sfa, crossFA: fu.xfa,
      clean: fu.fa === 0 && hoP.fa === 0 && tr.fa === 0 && fu.xfa === 0,
      vecMain: t.vecMain.slice(1, MAXL + 2), vecTight: t.vecTight.slice(1, MAXL + 2)
    }, meta);
  };

  /* ===== ביקורת · אותו חיפוש בדיוק, בלי הגן =====
   * בלי זה אי אפשר לדעת אם מה שנמצא הוא הגן המדורג או פשוט טיפוס-קואורדינטות על ספים
   * שה-GA לא הגיע אליהם. ‏marginSoft = marginHard = 1 הוא ההתנהגות של היום בדיוק. */
  SW.compileFor(scnTrain, AUX, XAUX, wvShip, null, null, null);
  share();
  const ctlCfg = ml => ({ minLen: ml, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: 1 });
  const control = [];
  for (const minLen of (QUICK ? [shipP.minLen] : [0, shipP.minLen])) {
    for (const [route, scn] of [['TRAIN', scnTrain], ['ALL', scnFull]]) {
      const t = SW.tune(scn, ctlCfg(minLen), { main: true, tight: false });
      if (t) control.push(measure(t, { route, marginSoft: 1, minLen, allow: '(אין משטר צר)' }));
    }
  }
  for (const c of control) say(`  ביקורת · ${c.route} minLen=${c.minLen} בלי הגן · holdout ${pct(c.holdoutRecall)} · נקי=${c.clean ? 'כן' : 'לא (FA ' + c.trainFA + '/' + c.holdoutFA + '/' + c.fullFA + ')'}`);
  rep.stages.control = control;

  const scan = control.filter(c => c.clean).slice();
  let done = 0;
  for (const soft of SOFTS) for (const minLen of MINLENS) {
    for (const allow of subsets) {
      SW.compileFor(scnTrain, AUX, XAUX, wvShip, SE.constW(mkW(allow)), null, null);
      share();
      const cfg = { minLen, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: soft };
      const tT = SW.tune(scnTrain, cfg, { main: true, tight: true });
      if (tT) scan.push(measure(tT, { route: 'TRAIN', marginSoft: soft, minLen, allow: allow.join('+') || '(ריק)' }));
      const tA = SW.tune(scnFull, cfg, { main: true, tight: true });
      if (tA) scan.push(measure(tA, { route: 'ALL', marginSoft: soft, minLen, allow: allow.join('+') || '(ריק)' }));
      done++;
      if (done % 32 === 0) say(`  ... ${done}/${SOFTS.length * MINLENS.length * subsets.length} תצורות · ${((Date.now() - T0) / 1000).toFixed(0)}s`);
    }
  }
  const cleanScan = scan.filter(r => r.clean);
  const bySort = a => a.slice().sort((x, y) => y.holdoutRecall - x.holdoutRecall);
  say(`  ${scan.length} נקודות · ${cleanScan.length} מהן נקיות בכל ארבעת המקומות`);
  say('  עשר הנקיות הטובות ב-holdout:');
  for (const r of bySort(cleanScan).slice(0, 10)) {
    say(`    ${r.route} soft=${r.marginSoft} minLen=${r.minLen} ${String(r.allow).padEnd(42)} holdout ${pct(r.holdoutRecall)} · מלא ${pct(r.fullRecall)}`);
  }
  say('  ולהשוואה · חמש הטובות ביותר שאינן נקיות (אלה שהיו נבחרות לפי recall בלבד):');
  for (const r of bySort(scan.filter(x => !x.clean)).slice(0, 5)) {
    say(`    ${r.route} soft=${r.marginSoft} minLen=${r.minLen} ${String(r.allow).padEnd(42)} holdout ${pct(r.holdoutRecall)} · FA אימון ${r.trainFA} ho ${r.holdoutFA} מלא ${r.fullFA} חוצות ${r.crossFA}`);
  }
  rep.stages.scan = { n: scan.length, nClean: cleanScan.length, topClean: bySort(cleanScan).slice(0, 40), topDirty: bySort(scan.filter(x => !x.clean)).slice(0, 15) };

  /* ================= שלב 4 · עידון משקלים רציפים ================= */
  say('\n===== שלב 4 · עידון · משקלים רציפים סביב התצורות הנקיות המובילות =====');
  const rnd = mulberry32(20260816);
  /* המסלול ההוגן (‏TRAIN) חייב לקבל הזדמנות גם כשהוא אינו בראש הרשימה · אחרת העידון
     רץ רק על המסלול שה-holdout שלו אינו מבחן. */
  const seeds = bySort(cleanScan).slice(0, QUICK ? 2 : 5)
    .concat(bySort(cleanScan.filter(r => r.route === 'TRAIN')).slice(0, QUICK ? 1 : 2));
  const NR = QUICK ? 10 : 120;
  const refined = [];
  for (const sd of seeds) {
    const allow = sd.allow === '(ריק)' ? [] : sd.allow.split('+');
    let best = null;
    for (let k = 0; k < NR; k++) {
      const WT = {};
      for (const key of OP_KEYS) {
        WT[key] = allow.includes(key)
          ? (key === 'sub' ? +(1 + rnd()).toFixed(3) : +(W_FLOOR + rnd() * (2 - W_FLOOR)).toFixed(3))
          : EXPENSIVE;
      }
      SW.compileFor(scnTrain, AUX, XAUX, wvShip, SE.constW(WT), null, null);
      share();
      const cfg = { minLen: sd.minLen, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: sd.marginSoft };
      const t = SW.tune(sd.route === 'ALL' ? scnFull : scnTrain, cfg, { main: true, tight: true });
      if (!t) continue;
      const m = measure(t, { route: sd.route, marginSoft: sd.marginSoft, minLen: sd.minLen, allow: sd.allow, WT });
      if (!m.clean) continue;
      if (!best || m.holdoutRecall > best.m.holdoutRecall) best = { m, WT, params: t.params };
    }
    if (best) {
      refined.push(Object.assign({}, best.m, { params: best.params }));
      say(`  ${sd.route} soft=${sd.marginSoft} minLen=${sd.minLen} ${sd.allow} · holdout ${pct(sd.holdoutRecall)} → ${pct(best.m.holdoutRecall)}`);
    } else {
      say(`  ${sd.route} soft=${sd.marginSoft} minLen=${sd.minLen} ${sd.allow} · אף עידון נקי לא עקף · נשארת נקודת הרשת`);
    }
  }
  rep.stages.refined = refined.map(r => Object.assign({}, r, { params: undefined }));

  /* ================= שלב 4ב · האם מסלול ALL מכליל · אימות צולב ================= */
  /* ‏מסלול ALL סופר את אילוץ אפס-הקבלות על **כל** שורה שיש לנו, ולכן "אפס ב-holdout"
     שלו הוא מבנה ולא הכללה, וה-recall שלו הוא בתוך-המדגם. אמירה כזאת בלי מספר היא
     סייג ריק. כאן היא נמדדת: אותה פרוצדורה בדיוק רצה על כל השורות **פחות קפל אחד**,
     והקפל שהושמט הוא המבחן. אם קבלות-השווא בקפל אינן אפס · הפרוצדורה אינה מכלילה,
     וזה יירשם ככשל ולא ייבלע. */
  say('\n===== שלב 4ב · אימות צולב · האם פרוצדורת ALL מכלילה =====');
  const folds = new Map();
  for (let i = 0; i < S.N; i++) { const f = S.fold[i]; if (!folds.has(f)) folds.set(f, []); folds.get(f).push(i); }
  const foldKeys = Array.from(folds.keys()).sort((a, b) => a - b);
  const foldIdx = new Map(foldKeys.map(f => [f, Int32Array.from(folds.get(f))]));
  const foldRest = new Map(foldKeys.map(f => [f, Int32Array.from(Array.from({ length: S.N }, (_, i) => i).filter(i => S.fold[i] !== f))]));

  /* אותה פרוצדורה בדיוק, על כל השורות פחות קפל אחד · הקפל שהושמט הוא המבחן. */
  const runCV = (label, allow, WT, soft, minLen) => {
    SW.compileFor(scnTrain, AUX, XAUX, wvShip, WT ? SE.constW(WT) : null, null, null);
    share();
    const cfg = { minLen, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: soft };
    const rows = [];
    for (const f of foldKeys) {
      const scnMinus = SW.makeScn(S, foldRest.get(f), X, xI);
      const scnFold = SW.makeScn(S, foldIdx.get(f), null, null);
      for (const s of [scnMinus, scnFold]) { s.CN = scnTrain.CN; s.CT = scnTrain.CT; s.XCN = scnTrain.XCN; s.XCT = scnTrain.XCT; }
      const t = SW.tune(scnMinus, cfg, { main: true, tight: soft > 1 });
      if (!t) { rows.push({ fold: f, feasible: false }); continue; }
      const held = SW.evalPoint(scnFold, t.E);
      rows.push({ fold: f, n: foldIdx.get(f).length, recall: held.recall, fa: held.fa });
    }
    const ok = rows.filter(r => r.feasible !== false);
    const meanR = ok.length ? ok.reduce((a, c) => a + c.recall, 0) / ok.length : null;
    const totFA = ok.reduce((a, c) => a + c.fa, 0);
    say(`  ${label.padEnd(48)} recall מחוץ למדגם ${pct(meanR)} · קבלות-שווא מחוץ למדגם ${String(totFA).padStart(3)} ${totFA === 0 ? '✅' : '⛔'}  (${rows.map(r => r.fa).join(',')})`);
    return { label, allow, WTight: WT, marginSoft: soft, minLen, folds: rows, meanRecall: meanR, totalFA: totFA };
  };

  /* ⚠ בלי הביקורת אי אפשר לייחס · אם גם ההליך בלי הגן דולף מחוץ למדגם, הדליפה היא
     תכונה של טיפוס-קואורדינטות עד קצה האילוץ, ולא של השוליים המדורגים. */
  const cvList = [];
  const bestALL = bySort(cleanScan.filter(r => r.route === 'ALL'))[0];
  const bestRef = refined.filter(r => r.route === 'ALL').sort((a, b) => b.holdoutRecall - a.holdoutRecall)[0];
  cvList.push(runCV('ביקורת · בלי הגן (marginSoft=1)', [], null, 1, shipP.minLen));
  cvList.push(runCV('מדורג · soft=2 · transpose+doubleLetter (רשת)', ['transpose', 'doubleLetter'], mkW(['transpose', 'doubleLetter']), 2, shipP.minLen));
  if (bestALL) cvList.push(runCV(`מדורג · soft=${bestALL.marginSoft} · ${bestALL.allow} (רשת)`, null, mkW(bestALL.allow.split('+')), bestALL.marginSoft, bestALL.minLen));
  if (bestRef) cvList.push(runCV(`מדורג · soft=${bestRef.marginSoft} · ${bestRef.allow} (מעודן)`, null, bestRef.WT, bestRef.marginSoft, bestRef.minLen));

  /* בקרת שפיות · הגנום **הנשלח** מוחזק קבוע ונמדד על אותם קפלים. אם גם הוא מדליק
     קבלות-שווא, המבחן קשה מכל מה שהופעל אי פעם וההשוואה אינה הוגנת. */
  {
    SW.compileFor(scnTrain, AUX, XAUX, wvShip, null, null, null);
    share();
    let tot = 0; const per = [];
    for (const f of foldKeys) {
      const scnFold = SW.makeScn(S, foldIdx.get(f), null, null);
      scnFold.CN = scnTrain.CN; scnFold.CT = scnTrain.CT;
      const r = SW.evalPoint(scnFold, shipE);
      per.push(r.fa); tot += r.fa;
    }
    say(`  ${'בקרת שפיות · הגנום הנשלח, קבוע'.padEnd(48)} קבלות-שווא בקפלים ${String(tot).padStart(3)} ${tot === 0 ? '✅' : '⛔'}  (${per.join(',')})`);
    cvList.push({ label: 'shipped-fixed', folds: per.map((fa, i) => ({ fold: foldKeys[i], fa })), totalFA: tot, note: 'גנום קבוע · לא פרוצדורה' });
  }
  const cvOut = cvList;
  rep.stages.crossValidation = { folds: foldKeys, runs: cvList };

  /* ================= שלב 5 · הפסק ================= */
  say('\n===== שלב 5 · הפסק =====');
  const pool = [];
  for (const r of cleanScan) pool.push({ rec: r, params: null });
  for (const r of refined) pool.push({ rec: r, params: r.params });
  pool.sort((a, b) => b.rec.holdoutRecall - a.rec.holdoutRecall);
  const win = pool[0] || null;
  const BAR_STATE = 0.1810;
  const BAR_MEAS = base.holdout.recall;
  say(`  הרף מ-STATE.md: ${pct(BAR_STATE)} · הרף כפי שנמדד כאן על מה שנשלח: ${pct(BAR_MEAS)}`);
  if (!win) {
    say('  ⛔ לא נמצאה אף נקודה נקייה · אין מועמד');
  } else {
    say(`  הטובה ביותר: ${win.rec.route} soft=${win.rec.marginSoft} minLen=${win.rec.minLen} · ${win.rec.allow}`);
    say(`    holdout ${pct(win.rec.holdoutRecall)} · אימון ${pct(win.rec.trainRecall)} · מלא ${pct(win.rec.fullRecall)} · FA 0/0/0/0`);
    say(`    מול STATE ${pct(BAR_STATE)}: ${win.rec.holdoutRecall > BAR_STATE ? '✅ עובר' : '⛔ אינו עובר'} · מול הנמדד ${pct(BAR_MEAS)}: ${win.rec.holdoutRecall > BAR_MEAS ? '✅ עובר' : '⛔ אינו עובר'}`);
  }
  /* ⚠ הסייג שאסור לרדת בלעדיו · מסלול ALL רואה את שורות ה-holdout באילוץ, ולכן
     "‏holdout נקי" שלו אינו מבחן הכללה. האימות הצולב הוא המבחן, והוא מדווח כאן לצד
     המספר ולא בהערת שוליים. */
  const cvGraded = (cvOut || []).filter(c => c.label && /מדורג/.test(c.label));
  const cvCtl = (cvOut || []).find(c => c.label && /ביקורת/.test(c.label));
  rep.verdict = {
    barState: BAR_STATE, barMeasured: BAR_MEAS,
    winner: win ? Object.assign({}, win.rec, { params: undefined }) : null,
    beatsState: !!(win && win.rec.holdoutRecall > BAR_STATE),
    beatsMeasured: !!(win && win.rec.holdoutRecall > BAR_MEAS),
    cleanTrainRouteExists: cleanScan.some(r => r.route === 'TRAIN' && r.holdoutRecall > BAR_STATE),
    generalizes: cvGraded.length ? cvGraded.every(c => c.totalFA === 0) : null,
    controlGeneralizes: cvCtl ? cvCtl.totalFA === 0 : null
  };
  say(`  מסלול TRAIN (המבחן ההוגן) · האם קיימת נקודה נקייה מעל הרף: ${rep.verdict.cleanTrainRouteExists ? 'כן' : '**לא**'}`);
  say(`  אימות צולב · הגן המדורג מכליל: ${rep.verdict.generalizes === null ? '—' : rep.verdict.generalizes ? 'כן' : '**לא**'} · הביקורת בלי הגן מכלילה: ${rep.verdict.controlGeneralizes === null ? '—' : rep.verdict.controlGeneralizes ? 'כן' : '**לא**'}`);

  /* פרמטרים מלאים למועמד · רק אם הוא באמת עוקף את שני הרפים. */
  if (win && win.rec.holdoutRecall > BAR_STATE && win.rec.holdoutRecall > BAR_MEAS) {
    let P = win.params;
    if (!P) {
      /* נקודת רשת · משחזרים אותה כדי לקבל את הפרמטרים המלאים */
      const allow = win.rec.allow === '(ריק)' ? [] : win.rec.allow.split('+');
      SW.compileFor(scnTrain, AUX, XAUX, wvShip, SE.constW(mkW(allow)), null, null);
      share();
      const cfg = { minLen: win.rec.minLen, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: win.rec.marginSoft };
      const t = SW.tune(win.rec.route === 'ALL' ? scnFull : scnTrain, cfg, { main: true, tight: true });
      const chk = measure(t, {});
      if (Math.abs(chk.holdoutRecall - win.rec.holdoutRecall) > 1e-12) {
        throw new Error(`שחזור הנקודה המנצחת נתן ${chk.holdoutRecall} במקום ${win.rec.holdoutRecall} · החיפוש אינו דטרמיניסטי ואין לסמוך עליו`);
      }
      P = t.params;
      win.rec.WT = mkW(allow);
    }
    rep.candidate = {
      minLen: P.minLen, vetoMargin: 1, marginHard: 1, marginSoft: P.marginSoft, useLexicon: true,
      W: Object.assign({ sub: 1 }, shipP.W),
      WTight: win.rec.WT,
      bands: P.bands.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: b.t })),
      bandsTight: P.bandsTight.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: b.t })),
      route: win.rec.route, allow: win.rec.allow,
      byLengthHold: null
    };
    const E = SE.mkE(P);
    const allow2 = win.rec.allow === '(ריק)' ? [] : win.rec.allow.split('+');
    SW.compileFor(scnFull, AUX, XAUX, wvShip, SE.constW(win.rec.WT || mkW(allow2)), null, null);
    rep.candidate.byLengthHold = SE.recallByLength(S, HO, E, scnFull.CN, scnFull.CT);
    say(`  ✅ נכתב מפרט מועמד ל-rep.candidate · marginSoft=${P.marginSoft} minLen=${P.minLen}`);
  } else {
    rep.candidate = null;
    say('  ⛔ אין מועמד · אף נקודה נקייה אינה עוקפת את הרף');
  }

  /* ================= שערים ================= */
  if (SELFTEST) {
    say('\n===== שערים · כל אחד עם הרצה שאמורה להיפסל =====');
    let fail = 0;

    /* ‏S1 · שקילות · marginSoft=marginHard חייב לשחזר את evolve שורה-שורה */
    {
      SW.compileFor(scnFull, AUX, XAUX, wvShip, null, null, null);
      const E0 = EV.makeFastEval(shipP);
      const E1 = SE.mkE({ minLen: shipP.minLen, useLexicon: true, bands: shipP.bands, marginHard: shipP.vetoMargin, marginSoft: shipP.vetoMargin });
      let diff = 0, acc = 0;
      for (let i = 0; i < S.N; i++) {
        const a = EV.decideOne(S, i, E0), b = SE.decideOne(S, i, E1, scnFull.CN, scnFull.CT);
        if (a) acc++; if (a !== b) diff++;
      }
      const Eb = SE.mkE({ minLen: shipP.minLen, useLexicon: true, bands: shipP.bands, marginHard: 0, marginSoft: 0 });
      let diffB = 0;
      for (let i = 0; i < S.N; i++) if (EV.decideOne(S, i, E0) !== SE.decideOne(S, i, Eb, scnFull.CN, scnFull.CT)) diffB++;
      say(`  S1 · שקילות מול evolve · ${diff} פערים על ${S.N} שורות (${acc} קבלות) ${diff === 0 && acc > 0 ? '✅' : '⛔'} · שבור (marginHard=0) → ${diffB} פערים ${diffB > 0 ? '✅ שיניים' : '⛔ עיוור'}`);
      if (diff !== 0 || acc === 0 || diffB === 0) fail++;
    }

    /* ‏S2 · שער הקבוצה חוצת-הכרטיסים · המטמון המעופש חייב להיפסל */
    {
      const stale = path.join(OUT, 'coverage-cross.json');
      let red = false, msg = '';
      if (fs.existsSync(stale)) {
        const c = JSON.parse(fs.readFileSync(stale, 'utf8'));
        const got = Object.fromEntries(EV.SETS.map(s => [s, (c.rows[s] || []).length]));
        const want = Object.fromEntries(EV.SETS.map(s => [s, rules.results[s].crossCard.rowsInRisk]));
        red = !EV.SETS.every(s => got[s] === want[s]);
        msg = `${JSON.stringify(got)} מול ${JSON.stringify(want)}`;
      }
      say(`  S2 · out/coverage-cross.json מול typo-rules.json · ${msg} ${red ? '✅ נפסל כנדרש (המטמון מעופש)' : '⛔ השער אינו מבחין'}`);
      if (!red) fail++;
    }

    /* ‏S3 · האילוץ כובל · תקציב 0 מול 100 חייב לשנות recall */
    {
      SW.compileFor(scnTrain, AUX, XAUX, wvShip, SE.constW(mkW(['transpose', 'ins', 'doubleLetter'])), null, null);
      share();
      const cfg = { minLen: 0, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: 2 };
      const t0 = SW.tune(scnTrain, cfg, { main: true, tight: true, budget: 0 });
      const t9 = SW.tune(scnTrain, cfg, { main: true, tight: true, budget: 100 });
      const bind = t9 && t0 && t9.point.recall > t0.point.recall + 1e-9;
      say(`  S3 · תקציב 0 (${pct(t0 && t0.point.recall)}) מול 100 (${pct(t9 && t9.point.recall)}) ${bind ? '✅ האילוץ כובל' : '⛔ האילוץ אינו כובל · אפס-קבלות אינו מודד דבר'}`);
      if (!bind) fail++;
    }

    /* ‏S4 · גנום מתירני חייב לייצר קבלות-שווא · אחרת מבחן הקבילות ריק */
    {
      SW.compileFor(scnFull, AUX, XAUX, wvShip, null, null, null);
      const wildE = SE.mkE({
        minLen: 0, useLexicon: true, marginHard: 1, marginSoft: 1,
        bands: SE.bandsFromVec(new Array(MAXL + 2).fill(3)), bandsTight: SE.bandsFromVec(new Array(MAXL + 2).fill(3))
      });
      const wild = SW.evalPoint(scnFull, wildE);
      say(`  S4 · גנום מתירני · ${wild.fa} קבלות-שווא (מהן ${wild.xfa} חוצות-כרטיסים) ${wild.fa > 0 && wild.xfa > 0 ? '✅' : '⛔ מבחן הקבילות ריק'}`);
      if (!(wild.fa > 0 && wild.xfa > 0)) fail++;
    }

    /* ‏S5 · ל-holdout אין חפיפה עם האימון */
    {
      const hs = new Set(Array.from(HO));
      let overlap = 0;
      for (const i of NH) if (hs.has(i)) overlap++;
      say(`  S5 · holdout ${HO.length} שורות · חפיפה ${overlap} ${HO.length > 0 && overlap === 0 ? '✅' : '⛔'}`);
      if (!(HO.length > 0 && overlap === 0)) fail++;
    }

    /* ‏S6 · למועמד יש שיניים · איפוס bandsTight חייב להזיז recall, אחרת המשטר הצר מת */
    if (rep.candidate) {
      const allow = rep.candidate.allow === '(ריק)' ? [] : rep.candidate.allow.split('+');
      SW.compileFor(scnFull, AUX, XAUX, wvShip, SE.constW(rep.candidate.WTight || mkW(allow)), null, null);
      const P = { minLen: rep.candidate.minLen, useLexicon: true, marginHard: 1, marginSoft: rep.candidate.marginSoft, bands: rep.candidate.bands, bandsTight: rep.candidate.bandsTight };
      const a = SW.evalPoint(scnFull, SE.mkE(P));
      const b = SW.evalPoint(scnFull, SE.mkE(Object.assign({}, P, { bandsTight: SE.bandsFromVec(new Array(MAXL + 2).fill(0)) })));
      say(`  S6 · איפוס bandsTight · ${pct(a.recall)} → ${pct(b.recall)} ${b.recall < a.recall ? '✅ למשטר הצר יש משקל' : '⛔ המשטר הצר מת · הגן אינו עושה כלום'}`);
      if (!(b.recall < a.recall)) fail++;
    } else {
      say('  S6 · אין מועמד · לא נבדק');
    }

    rep.selftest = { failures: fail };
    say(`\n  ${fail === 0 ? '✅ כל השערים עברו' : '⛔ ' + fail + ' שערים נכשלו'}`);
    if (fail) process.exitCode = 1;
  }

  rep.wallClockSec = (Date.now() - T0) / 1000;
  fs.writeFileSync(path.join(OUT, 'he-graded-search.json'), JSON.stringify(rep, null, 1));
  say(`\nנכתב out/he-graded-search.json · ${rep.wallClockSec.toFixed(1)}s`);
  return rep;
}

if (require.main === module) main();
module.exports = { main };
