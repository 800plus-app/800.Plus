'use strict';
/* gloss_search.js · מה באמת נמצא בקצה של סט הפירושים, ולמה נשלח 0.00%
 *
 * ‏out/typo-rules.json שולח ל-gloss שנים-עשר ספים באפס · סובלנות כבויה לגמרי, recall
 * ‏0.00%. התיעוד קרא לזה "רדום מבנית". הקובץ הזה **מודד** אם זה נכון.
 *
 * ⚠ הקובץ אינו מריץ GA כדי לחפש · הוא פותר את הבעיה **בדיוק**. הסיבה נשענת על תכונה
 * שנבדקת כאן ולא מוצהרת (שלב 5, ושער S2 ב---selftest):
 *
 *   ‏decideOne מקבל שורה אם **קיים** זוג (אורך-מועמד L, עלות c) עם c ≤ t[L]. לכן קבוצת
 *   השורות המתקבלות בווקטור ספים t היא **איחוד** על הרצועות של קבוצות המתקבלות כשרק
 *   רצועה אחת דולקת. מכאן: אין קבלות-שווא ב-t ⟺ אין קבלות-שווא בכל רצועה **לחוד**.
 *   כלומר תחום הקבילות הוא **תיבה** ‏(t_i ≤ cap_i), וה-recall מונוטוני עולה בכל סף ·
 *   ולכן הפינה (cap_1..cap_n) היא **המקסימום הגלובלי**, לא נקודה מקסימלית מקומית.
 *
 * זה הופך את החיפוש על הספים ל-n חיפושים בינאריים בלתי תלויים · שניות, לא דורות, ובלי
 * תלות בסדר. ‏coverage.js הגיע לאותה פינה בטיפוס-קואורדינטות והצהיר עליה כמקסימום
 * מקומי · ההצהרה הזאת הייתה זהירה מדי, וזה נמדד כאן ולא נאמר.
 *
 * מה **כן** נשאר חיפוש הוריסטי: שמונת המשקלים. הם משנים את העלויות ולכן את ה-caps,
 * והם נסרקים בירידת-קואורדינטות דטרמיניסטית על רשת. זה נאמר ולא מוסתר.
 *
 * ⛔ הקובץ אינו כותב לייצור. הוא כותב מועמד ל-out/gloss-candidate-rules.json בלבד ·
 *    ‏TYPO_RULES=typo-lab/out/gloss-candidate-rules.json node typo-lab/bank_gate.js
 *    הוא מה שמכריע, והוא מורץ בידי חגי ולא כאן.
 *
 * הרצה · node typo-lab/gloss_search.js [--selftest] [--quick]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EV = require('./evolve.js');
const CH = require('./lib/checker.js');
const GX = require('./lib/gloss_search_expand.js');
const BGATE = require('./bank_gate.js');   // נקרא בלבד · effOps/makeNear/expandOf. אינו מורץ.
const { runGA } = require('./lib/ga.js');
const { fnv1a } = require('./lib/rng.js');

const OUT = path.join(__dirname, 'out');
const ARGS = process.argv.slice(2);
const has = f => ARGS.includes(f);
const SELFTEST = has('--selftest');
const QUICK = has('--quick');
const say = s => process.stdout.write(s + '\n');
const pct = x => (x * 100).toFixed(2) + '%';

/* אותם קבועים של evolve.js · הזרע ומפרט ה-GA, כדי שהשחזור בשלב 4 יהיה שחזור ולא חיקוי. */
const SEED = 'typo-lab/evolve/v1';
const BIG_GA = { popSize: 80, maxGen: 130, patience: 22 };

/* דגלי packSet · 1 וטו · 2 נטייה · 4 מתקבל היום · 8 label=accept · 16 trusted
   · 32 why=real-word · 64 וטו הלקסיקון */
const F_TODAY = 4, F_ACCEPT = 8;

/* רשת הספים · 0..3 בצעדי 0.05. הגבול העליון 3 אינו שרירותי · הוא ה-hi של גני הסף
   ב-GENES, ולכן החיפוש כאן נשאר **בתוך** מרחב הגנים שה-GA קיבל ואינו מנצח אותו
   בעזרת תחום רחב יותר. */
const TGRID = [];
for (let v = 0; v <= 3.0001; v += 0.05) TGRID.push(Math.round(v * 100) / 100);

/* טווחי המשקלים · מועתקים מ-GENES ולא מומצאים. ‏sub מקובע ב-1 · הוא יחידת המידה. */
const W_SPEC = EV.GENES.filter(g => g.name.startsWith('W.'))
  .map(g => ({ key: g.name.slice(2), lo: g.lo, hi: g.hi }));
const W_STEP = 0.1;
const wGrid = s => { const a = []; for (let v = s.lo; v <= s.hi + 1e-9; v += W_STEP) a.push(Math.round(v * 100) / 100); return a; };

const I32 = a => Int32Array.from(a);

/* ===================== טעינה =====================
 *
 * ⚠ ‏out/coverage-cross.json **אינו** נקרא כאן יותר, ולא מטעמי סגנון. המפתח שלו הוא
 * ה-sha של הדאטהסט בלבד, והוא אינו מכסה את **קוד הבונה**. בפועל: הקובץ ההוא נכתב
 * ב-01:10, ‏evolve.js נערך ב-01:39, ו-typo-rules.json שנכתב ב-02:07 מדווח
 * ‏rowsInRisk 534/396 בעוד שהמטמון מחזיק 533/398. כלומר מטמון "תקף" החזיר שליליות של
 * בונה אחר. המטמון כאן ממופתח בדאטהסט **ובגיבוב של כל קובץ שמשתתף בבנייה**.
 */
const CACHE_JS = path.join(__dirname, 'lib', 'gloss_search_cache.js');
const CODE_FILES = ['evolve.js', 'bank_gate.js', 'measure_gloss.js',
  'lib/glossrules.js', 'lib/gloss_search_expand.js', 'lib/checker.js', 'lib/veto.js', 'lib/keys.js', 'lib/wdist.js'];
function codeKey() {
  const h = crypto.createHash('sha256');
  for (const f of CODE_FILES) {
    const p = path.join(__dirname, f);
    h.update(f + ':' + (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : 'missing'));
  }
  return h.digest('hex').slice(0, 16);
}

function load() {
  const { perSet, langs } = EV.loadRows();
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const dsKey = (manifest.files || []).map(f => f.name + ':' + f.sha256).sort().join('|');
  const key = dsKey + '#' + codeKey();

  let cached = null;
  if (fs.existsSync(CACHE_JS)) {
    try { const c = require(CACHE_JS); if (c && c.key === key) cached = c; } catch (e) { cached = null; }
  }
  let cross, crossSource, wordCross = null;
  if (cached) {
    cross = { rows: cached.rows, stats: cached.stats };
    wordCross = cached.wordRows || null;
    crossSource = 'cache';
    say('  שליליות חוצות-כרטיסים · מהמטמון (מפתח דאטהסט + גיבוב קוד תואם)');
  } else {
    say('  בניית השליליות החוצות-כרטיסים לסט הפירושים · **כולל תוצרי ההרחבה של B1** ...');
    const t = Date.now();
    const g = GX.buildCross(langs, perSet, { expansion: true, dirs: ['gloss'] });
    say(`    ${((Date.now() - t) / 1000).toFixed(1)}s · ${JSON.stringify(g.stats)}`);
    /* כיוון המונח · נבנה רק כדי שהשער בשלב 4ב יוכל להשוות לרשומה הרשמית. */
    say('  בניית כיוון המונח (לשער השקילות) ...');
    const t2 = Date.now();
    const w = GX.buildCross(langs, perSet, { expansion: false, dirs: ['word'] });
    say(`    ${((Date.now() - t2) / 1000).toFixed(1)}s`);
    cross = { rows: g.rows, stats: g.stats };
    wordCross = { 'he-word': w.rows['he-word'].length, 'en-word': w.rows['en-word'].length, stats: w.stats };
    crossSource = 'built';
    const body = 'module.exports = ' + JSON.stringify({ key, dsKey, rows: g.rows, stats: g.stats, wordRows: wordCross }) + ';\n';
    fs.writeFileSync(CACHE_JS, '/* מטמון · נוצר בידי gloss_search.js · ממופתח בדאטהסט ובגיבוב קוד הבונה. */\n' + body);
  }
  return { perSet, langs, cross, crossSource, dsKey, cacheKey: key, wordCross };
}

/* ===================== אוכלוסיות ===================== */
function populations(S) {
  const all = [], evolve = [], hold = [], rej = [], acc = [];
  const rejAll = [], rejEvolve = [], accEvolve = [], accHold = [];
  for (let i = 0; i < S.N; i++) {
    const isAcc = (S.flags[i] & F_ACCEPT) !== 0;
    all.push(i);
    (isAcc ? acc : rej).push(i);
    if (S.hold[i]) { hold.push(i); if (isAcc) accHold.push(i); }
    else { evolve.push(i); if (isAcc) accEvolve.push(i); else rejEvolve.push(i); }
    if (!isAcc) rejAll.push(i);
  }
  return {
    all: I32(all), evolve: I32(evolve), hold: I32(hold),
    rejAll: I32(rejAll), rejEvolve: I32(rejEvolve),
    accAll: I32(acc), accEvolve: I32(accEvolve), accHold: I32(accHold)
  };
}

/* ===================== מנוע הערכה ===================== */
const PERMISSIVE = margin => CH.normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 999 }], W: {}, vetoMargin: margin, useLexicon: true });

/* קבוצת הסיכון · שורות reject שגנום **מתירני לחלוטין** מקבל. שורה שאינה בקבוצה הזאת
   חסומה מבנית (וטו, לקסיקון, נטייה, שולי דו-משמעות, או שאין לה מועמד בטווח) ולכן אף
   ווקטור ספים ואף משקל אינם יכולים לקבל אותה · ספירת קבלות-השווא עליה מיותרת.
   ‏minLen=0 בכוונה · minLen רק מוריד קבלות, ולכן הקבוצה תקפה לכל minLen.
   ‏W אינו משנה · בסף 999 כל עלות אפשרית עוברת. שער S1 מוכיח את השקילות ואת שיניה. */
function atRiskFor(S, rejIdx, margin) {
  const E = EV.makeFastEval(PERMISSIVE(margin));
  const out = [];
  for (let x = 0; x < rejIdx.length; x++) { const i = rejIdx[x]; if (EV.decideOne(S, i, E)) out.push(i); }
  return I32(out);
}

/* מבנה רצועות · רשימת maxLen עולה, והאחרון הוא ∞. שני מבנים נמדדים:
     perLen · סף לכל אורך-מועמד · המרחב המלא ש-lib/checker.js כבר יודע לקרוא
     ga12   · maxLen 2..12 ואז ∞ · **בדיוק** מרחב הגנים שה-GA קיבל */
function bandSpec(kind, lmax) {
  if (kind === 'ga12') return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, Infinity];
  const a = []; for (let l = 1; l <= lmax; l++) a.push(l); a.push(Infinity); return a;
}
function mkParams(spec, vec, minLen, margin, W) {
  const bands = spec.map((mx, i) => ({ maxLen: mx, t: vec[i] }));
  return CH.normalizeParams({ minLen, vetoMargin: margin, useLexicon: true, bands, W });
}

/* ===================== הפותר · פינת התיבה =====================
 * לכל רצועה בנפרד · הסף הגדול ביותר ברשת שעדיין נותן אפס קבלות-שווא **כשרק היא
 * דולקת**. לפי פירוק האיחוד, הווקטור המורכב מכל ה-caps הוא הפתרון האופטימלי הגלובלי
 * תחת האילוץ, ולא נקודה מקסימלית שתלויה בסדר.
 */
function solve(ctx, kind, minLen, margin, W, riskIdx) {
  const spec = bandSpec(kind, ctx.lmax);
  const n = spec.length;
  const zero = new Array(n).fill(0);
  if (faOwn(ctx, mkParams(spec, zero, minLen, margin, W), riskIdx) !== 0) return null;   // אין אפילו נקודת אפס קבילה
  const vec = new Array(n).fill(0);
  for (let b = 0; b < n; b++) {
    const probe = new Array(n).fill(0);
    let lo = 0, hi = TGRID.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      probe[b] = TGRID[mid];
      if (faOwn(ctx, mkParams(spec, probe, minLen, margin, W), riskIdx) === 0) { best = TGRID[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    vec[b] = best;
  }
  return { spec, vec, params: mkParams(spec, vec, minLen, margin, W), kind, minLen, margin, W: Object.assign({}, W) };
}

let N_EVAL = 0;
function faOwn(ctx, P, riskIdx) {
  N_EVAL++;
  const E = EV.makeFastEval(P);
  const r = EV.evalSubset(ctx.S, riskIdx, E);
  const x = ctx.X.N ? EV.evalSubset(ctx.X, ctx.XI, E) : null;
  return r.faOwn + (x ? x.faOwn : 0);
}

/* מדידה מלאה של נקודה · על כל אוכלוסייה בנפרד, בלי לערבב. */
function measure(ctx, P) {
  const E = EV.makeFastEval(P);
  const g = ix => EV.evalSubset(ctx.S, ix, E);
  const A = g(ctx.pop.all), Ev = g(ctx.pop.evolve), Ho = g(ctx.pop.hold);
  const xr = ctx.X.N ? EV.evalSubset(ctx.X, ctx.XI, E) : { fa: 0, faOwn: 0, faToday: 0 };
  return {
    all: pack(A), evolve: pack(Ev), holdout: pack(Ho),
    cross: { rows: ctx.X.N, fa: xr.fa, faOwn: xr.faOwn },
    faOwnTotal: A.faOwn + xr.faOwn,
    faLiteralTotal: A.fa + xr.fa
  };
}
const pack = r => ({
  recall: r.recall, tp: r.tp, nAccept: r.nAcc,
  recallIncludingUntrusted: r.recallAll, tpAll: r.tpAll, nAcceptAll: r.nAccAll,
  falseAccepts: r.fa, falseAcceptsOwn: r.faOwn, falseAcceptsFromTodayLayer: r.faToday,
  falseAcceptsRealWord: r.faRealWord, nReject: r.nRej
});

/* ===================== החיפוש על המשקלים =====================
 * ירידת-קואורדינטות דטרמיניסטית · לכל משקל בתורו, כל ערך ברשת, הספים נפתרים מחדש
 * לפינת התיבה, והמטרה נמדדת. אין אקראיות, אין זרע · אותה הרצה מחזירה אותו פלט.
 * זו **אינה** אופטימיזציה גלובלית על המשקלים, וזה נאמר.
 */
function objectiveOf(ctx, sol, objIdx, tieIdx) {
  const E = EV.makeFastEval(sol.params);
  const primary = EV.evalSubset(ctx.S, objIdx, E).recall;
  const tie = EV.evalSubset(ctx.S, tieIdx, E).recall;
  let sum = 0; for (const t of sol.vec) sum += t;
  return { primary, tie, complexity: sum };
}
const better = (a, b) => !b || a.primary > b.primary + 1e-12
  || (Math.abs(a.primary - b.primary) <= 1e-12 && a.tie > b.tie + 1e-12)
  || (Math.abs(a.primary - b.primary) <= 1e-12 && Math.abs(a.tie - b.tie) <= 1e-12 && a.complexity < b.complexity - 1e-12);

function descend(ctx, kind, minLen, margin, W0, risk, objIdx, tieIdx) {
  let W = Object.assign({ sub: 1 }, W0);
  let cur = solve(ctx, kind, minLen, margin, W, risk);
  if (!cur) return null;
  let curObj = objectiveOf(ctx, cur, objIdx, tieIdx);
  let pass = 0, moved = true;
  while (moved && pass < 4) {
    moved = false; pass++;
    for (const s of W_SPEC) {
      const keep = W[s.key];
      let bv = keep, bo = curObj, bs = cur;
      for (const v of wGrid(s)) {
        if (v === keep) continue;
        W[s.key] = v;
        const sol = solve(ctx, kind, minLen, margin, W, risk);
        if (!sol) continue;
        const o = objectiveOf(ctx, sol, objIdx, tieIdx);
        if (better(o, bo)) { bo = o; bv = v; bs = sol; }
      }
      W[s.key] = bv;
      if (bv !== keep) { moved = true; cur = bs; curObj = bo; }
    }
  }
  return { sol: cur, obj: curObj, passes: pass };
}

function searchPoint(ctx, kind, riskOf, objIdx, tieIdx, label, extraStarts) {
  const starts = [ctx.shippedW, Object.fromEntries(W_SPEC.map(s => [s.key, s.lo]))].concat(extraStarts || []);
  const margins = [1, 2, 3];
  const minLens = QUICK ? [0, 6] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let best = null;
  for (const margin of margins) {
    const risk = riskOf(margin);
    for (const minLen of minLens) {
      for (const W0 of starts) {
        const r = descend(ctx, kind, minLen, margin, W0, risk, objIdx, tieIdx);
        if (r && better(r.obj, best && best.obj)) best = r;
      }
    }
  }
  if (best) say(`  ${label} · ${kind} · minLen ${best.sol.minLen} · שוליים ${best.sol.margin} · יעד ${pct(best.obj.primary)}`);
  return best;
}

/* איחוד · ירידת-קואורדינטות תלויה בנקודת ההתחלה, ולכן נקודה שנמצאה תחת אילוץ אחד
   מוזרעת מחדש תחת האילוץ השני. בלי זה קרה בפועל שהמועמד "המשני" עקף את הראשי · וזה
   היה סימן לאופטימום מקומי, לא לתוצאה. */
function consolidate(ctx, best, cfgs, kind, risk, objIdx, tieIdx) {
  let out = best;
  for (const c of cfgs) {
    if (!c) continue;
    const r = descend(ctx, kind, c.minLen, c.margin, c.W, risk(c.margin), objIdx, tieIdx);
    if (r && better(r.obj, out && out.obj)) out = r;
  }
  return out;
}

/* ===================== שחזור ריצת ה-GA =====================
 * לא ציטוט מהיומן · הרצה מחדש של אותו GA עם אותו זרע, ואז השוואה **דור-דור** ליומן
 * שנשמר. אם הסדרות זהות, הגנום שיוצא כאן הוא הגנום שרץ אז · ולכן מותר לשאול אותו
 * למה היו לו שתי קבלות-שווא בוולידציה. אם הן אינן זהות, השחזור נכשל ונאמר.
 */
/* ⚠ השחזור רץ עם קבוצת שליליות **ריקה**, ובכוונה. הריצה ההיסטורית השתמשה
   ב-evolve.buildCrossCard, שהחזירה 0 שורות לסט הפירושים · וזה מתועד בארטיפקט עצמו
   (‏results.gloss.crossCard.rowsInRisk === 0, נבדק כאן ולא מונח). הקבוצה המורחבת שאנחנו
   בונים היום היא בדיוק מה שחסר שם, ולכן להזין אותה לשחזור היה משנה את נוף הכושר
   ומבטל את השחזור · ואכן נמדד שהוא מפסיק להתאים ליומן. */
function replayGA(ctx, tag, trainIdx, seedStr) {
  const seeds = EV.SEED_PARAMS.map(EV.paramsToGenome);
  const log = [];
  const res = runGA(Object.assign({
    spec: EV.GENES, seeds, seed: fnv1a(seedStr),
    fitness: g => {
      const P = CH.normalizeParams(Object.assign(EV.genomeToParams(g), { useLexicon: true }));
      const E = EV.makeFastEval(P);
      return EV.fitnessOf(EV.evalSubset(ctx.S, trainIdx, E), P, 0, 0);
    },
    onGen: rec => log.push(rec)
  }, BIG_GA));
  return { res, log, tag };
}
function gaLogOf(tag) {
  const f = path.join(OUT, 'ga-log.jsonl');
  if (!fs.existsSync(f)) return null;
  const out = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.tag === tag) out.push(r);
  }
  return out.length ? out : null;
}
function sameLog(mine, theirs) {
  if (!theirs || mine.length !== theirs.length) return false;
  for (let i = 0; i < mine.length; i++) {
    const a = mine[i], b = theirs[i];
    if (a.gen !== b.gen || a.best !== b.best || a.mean !== b.mean || a.bestEver !== b.bestEver || a.sinceImprove !== b.sinceImprove) return false;
  }
  return true;
}

/* ===================== main ===================== */
function main() {
  const T0 = Date.now();
  const R = { generatedAt: new Date().toISOString(), argv: ARGS.slice(), stages: {} };

  say('טעינה וקדם-חישוב ...');
  const { perSet, langs, cross, crossSource, dsKey, cacheKey, wordCross } = load();
  const S = EV.packSet(perSet.gloss);
  const X = EV.packSet(cross.rows.gloss);
  const XI = I32(Array.from({ length: X.N }, (_, i) => i));
  const pop = populations(S);
  const ship = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  let lmax = 0;
  for (let i = 0; i < S.N; i++) for (let p = S.off[i]; p < S.off[i + 1]; p++) if (S.pLen[p] > lmax) lmax = S.pLen[p];
  const ctx = { S, X, XI, pop, lmax, shippedW: ship.params.gloss.W };

  R.stages.data = {
    rows: S.N, evolve: pop.evolve.length, holdout: pop.hold.length,
    acceptRows: pop.accAll.length, acceptEvolve: pop.accEvolve.length, acceptHoldout: pop.accHold.length,
    rejectRows: pop.rejAll.length, crossCardRows: X.N, crossSource, crossStats: cross.stats,
    cacheKey, maxCandidateLength: lmax
  };
  say(`  gloss · ${S.N} שורות · ${pop.evolve.length} אבולוציה · ${pop.hold.length} holdout · ${pop.accAll.length} accept · ${pop.rejAll.length} reject`);
  say(`  שליליות חוצות-כרטיסים · ${X.N} שורות (${crossSource}) · אורך מועמד מרבי ${lmax}`);

  /* ============ שלב 0 · לקבוצת השליליות **חייבות** להיות שיניים ============
     המועמד הקודם נפל בשער על שתי התנגשויות דרך תוצרי ההרחבה של B1. קבוצת שליליות
     שאינה מכילה אותן היא קבוצה שבנויה על אותה נקודה עיוורת · וכל מה שייבנה מעליה חסר
     ערך. לכן זה נבדק **לפני** החיפוש, והכישלון עוצר. */
  say('\n===== שלב 0 · השליליות שהשער תפס חייבות להיות בקבוצה =====');
  const MUST = [
    { typed: 'רסיס עצ', term: 'אֵגֶל', intruder: 'שבב' },
    { typed: 'משא כבד', term: 'יָצוּעַ', intruder: 'עול' }
  ];
  const found = MUST.map(m => {
    const hit = cross.rows.gloss.find(r => r.typedKey === m.typed && r.term === m.term);
    return { want: m, present: !!hit, intruder: hit ? hit.intruder : null, dOwn: hit ? hit.dOwn : null, dOther: hit ? hit.dOther : null, today: hit ? hit.today : null };
  });
  for (const f of found) say(`  ${f.present ? '✅' : '⛔'} "${f.want.typed}" מול "${f.want.term}" · פולש ${f.intruder || '—'}${f.present ? ` · dOwn ${f.dOwn} · dOther ${f.dOther}` : ''}`);
  R.stages.constraintTeeth = { required: MUST, found, expansionForms: (cross.stats['he/gloss'] || {}).fromRule, rows: X.N };
  if (found.some(f => !f.present)) {
    say('⛔ קבוצת השליליות אינה משחזרת את מה שהשער תפס · הבנייה שגויה, ואין טעם בשום דבר אחריה');
    process.exitCode = 1;
    return;
  }
  say(`  ‏${(cross.stats['he/gloss'] || {}).fromRule || 0} צורות he ו-${(cross.stats['en/gloss'] || {}).fromRule || 0} צורות en נכנסו לקבוצה **רק** בזכות ההרחבה`);

  /* ============ שלב 1 · הרצפה המבנית של מונה קבלות-השווא ============
     ‏evalSubset סופר ב-fa **גם** שורות שהשכבה הראשונה (acceptsToday/meaningMatch)
     מקבלת · אלה שורות שאף גנום אינו יכול לגרום להן ואינו יכול למנוע. אם קיימת אפילו
     אחת כזאת בתת-הקבוצה שהכושר מסתכל עליה, ‏fitnessOf מחזיר ‎-1e6 לכל גנום. */
  say('\n===== שלב 1 · שורות שהשכבה הראשונה מקבלת ובכל זאת מתויגות reject =====');
  const stuck = [];
  for (let i = 0; i < S.N; i++) {
    if ((S.flags[i] & F_ACCEPT) || !(S.flags[i] & F_TODAY)) continue;
    const r = S.rows[i];
    stuck.push({ idx: i, typed: r.typed, typedKey: r.typedKey, key: r.key, term: r.term, unit: r.unit, why: r.why, op: r.op, lang: r.lang, fold: S.fold[i], holdout: !!S.hold[i], trusted: r.trusted !== false });
  }
  let stuckX = 0;
  for (let i = 0; i < X.N; i++) if (!(X.flags[i] & F_ACCEPT) && (X.flags[i] & F_TODAY)) stuckX++;
  R.stages.structuralFloor = { rowsInSet: stuck.length, rowsInCross: stuckX, rows: stuck };
  for (const s of stuck) say(`  ⛔ "${s.typed}" ~ "${s.key}" (${s.term}|${s.unit}) · why=${s.why} · op=${s.op} · fold ${s.fold} · holdout ${s.holdout}`);
  say(`  סה"כ ${stuck.length} בסט ו-${stuckX} בשליליות · רצפת fa של evolve.js = ${stuck.length + stuckX} לכל גנום שרואה אותן`);

  /* ============ שלב 2 · פורנזיקה של יומן ה-GA ============ */
  say('\n===== שלב 2 · מה יומן ה-GA אומר =====');
  const tags = ['gloss/fold0', 'gloss/fold1', 'gloss/fold2', 'gloss/fold3', 'gloss/fold4', 'gloss/final'];
  const forensic = {};
  for (const t of tags) {
    const L = gaLogOf(t);
    if (!L) { forensic[t] = null; continue; }
    const last = L[L.length - 1];
    forensic[t] = { generations: L.length, bestEver: last.bestEver, sinceImprove: last.sinceImprove, everImproved: L.some(r => r.sinceImprove === 0 && r.gen > 0) };
    say(`  ${t} · ${L.length} דורות · bestEver ${last.bestEver} · ${last.bestEver === -1e6 ? 'לא נמצא אף פרט קביל · עונש מוות שטוח' : 'קביל'}`);
  }
  R.stages.gaLog = forensic;

  /* ============ שלב 3 · שחזור fold1 ו-final ============ */
  say('\n===== שלב 3 · שחזור ריצות ה-GA ושתי קבלות-השווא של fold1 =====');
  const histCross = ship.results.gloss.crossCard.rowsInRisk;
  say(`  הריצה ההיסטורית ראתה ${histCross} שליליות חוצות-כרטיסים ב-gloss (מתוך typo-rules.json) · השחזור רץ עם אותה קבוצה`);
  if (histCross !== 0) { say('  ⛔ הארטיפקט מדווח קבוצה לא ריקה · ההנחה של השחזור שגויה'); process.exitCode = 1; }
  R.stages.historicalCrossRows = histCross;
  const nonHold = pop.evolve;
  const trOf = f => { const a = []; for (let x = 0; x < nonHold.length; x++) { const i = nonHold[x]; if (S.fold[i] !== f) a.push(i); } return I32(a); };
  const vaOf = f => { const a = []; for (let x = 0; x < nonHold.length; x++) { const i = nonHold[x]; if (S.fold[i] === f) a.push(i); } return I32(a); };
  const replay = {};
  for (const f of [1]) {
    const rp = replayGA(ctx, `gloss/fold${f}`, trOf(f), `${SEED}|gloss|fold${f}`);
    const ok = sameLog(rp.log, gaLogOf(`gloss/fold${f}`));
    const P = CH.normalizeParams(Object.assign(EV.genomeToParams(rp.res.best), { useLexicon: true }));
    const E = EV.makeFastEval(P);
    const va = vaOf(f), tr = trOf(f);
    const vr = EV.evalSubset(S, va, E), trr = EV.evalSubset(S, tr, E);
    const list = EV.listFalseAccepts(S, va, E, 50);
    replay[`fold${f}`] = {
      logMatchesArtifact: ok, generations: rp.log.length, bestFit: rp.res.bestFit,
      params: P, trainRecall: trr.recall, trainFalseAccepts: trr.fa,
      valRecall: vr.recall, valFalseAccepts: vr.fa, valFalseAcceptsOwn: vr.faOwn,
      valRealWordFalseAccepts: vr.faRealWord, valRecallIncludingUntrusted: vr.recallAll,
      falseAcceptRows: list
    };
    say(`  fold${f} · שחזור זהה ליומן: ${ok ? '✅' : '⛔'} · דורות ${rp.log.length} · train recall ${pct(trr.recall)} (FA ${trr.fa}) · val recall ${pct(vr.recall)} (FA ${vr.fa})`);
    for (const fa of list) say(`    קבלת-שווא בוולידציה · "${fa.typed}" ~ "${fa.key}" (${fa.term}|${fa.unit}) · why=${fa.why} · op=${fa.op}`);
    if (!ok) say('  ⚠ השחזור אינו זהה ליומן · המסקנות על הגנום הזה אינן מוכחות');
  }
  R.stages.replay = replay;

  /* מה הפרמטרים שנשלחו נותנים · הבסיס להשוואה */
  const shipM = measure(ctx, CH.normalizeParams(ship.params.gloss));
  R.stages.shipped = { params: ship.params.gloss, measured: shipM };
  say(`\n  הפרמטרים שנשלחו · evolve ${pct(shipM.evolve.recall)} · holdout ${pct(shipM.holdout.recall)} · fa(evolve.js) ${shipM.faLiteralTotal} · faOwn ${shipM.faOwnTotal}`);

  /* ============ שלב 4 · קבוצות הסיכון ============ */
  say('\n===== שלב 4 · קבוצת הסיכון לכל שוליים =====');
  const riskAllCache = {}, riskEvCache = {};
  const riskAll = m => riskAllCache[m] || (riskAllCache[m] = atRiskFor(S, pop.rejAll, m));
  const riskEv = m => riskEvCache[m] || (riskEvCache[m] = atRiskFor(S, pop.rejEvolve, m));
  const riskStat = {};
  for (const m of [1, 2, 3]) { riskStat[m] = { all: riskAll(m).length, evolve: riskEv(m).length }; say(`  שוליים ${m} · ${riskStat[m].all} שורות reject בסיכון מתוך ${pop.rejAll.length} (אבולוציה בלבד ${riskStat[m].evolve})`); }
  R.stages.atRisk = riskStat;

  /* ============ שלב 5 · פירוק האיחוד · התיבה ============ */
  say('\n===== שלב 5 · תחום הקבילות הוא תיבה · נמדד =====');
  const boxProof = verifyBox(ctx, riskAll(1));
  R.stages.boxProperty = boxProof;
  say(`  ${boxProof.checked} ווקטורי ספים אקראיים-דטרמיניסטיים · קבוצת המתקבלים שווה לאיחוד הרצועות ב-${boxProof.agree} מהם ${boxProof.agree === boxProof.checked ? '✅' : '⛔'}`);
  if (boxProof.agree !== boxProof.checked) { say('  ⛔ פירוק האיחוד אינו מתקיים · הטענה שהפינה היא מקסימום גלובלי נופלת'); process.exitCode = 1; }

  /* ============ שלב 6 · החיפוש ============ */
  say('\n===== שלב 6 · החיפוש הדטרמיניסטי =====');
  const points = {};

  /* ‏A · האילוץ על **כל** מה שיש (אבולוציה + holdout + חוצי-כרטיסים), המטרה holdout.
     זו בדיוק השאלה שנשאלה · והמספר שיוצא הוא בתוך-המדגם מבחינת ה-holdout, וזה נאמר. */
  points.A_allRows = searchPoint(ctx, 'perLen', riskAll, pop.accHold, pop.accAll, 'A · אילוץ על הכול · מטרה holdout');
  /* ‏B · האילוץ ו**המטרה** על שורות האבולוציה בלבד · ה-holdout לא נגע. זה המבחן
     היחיד כאן שיש לו תוקף מחוץ למדגם, והוא גם זה שבודק אם אפס קבלות-שווא **מכליל**. */
  points.B_evolveOnly = searchPoint(ctx, 'perLen', riskEv, pop.accEvolve, pop.accEvolve, 'B · אילוץ ומטרה על אבולוציה בלבד');
  /* ‏C · המועמד למשלוח · המשקלים ו-minLen/שוליים של B (שלא ראו את ה-holdout כמטרה),
     והספים נפתרים מחדש תחת האילוץ על **כל** השורות · כך שהוא נקי על כל מה שיש. */
  if (points.B_evolveOnly) {
    const b = points.B_evolveOnly.sol;
    const c = solve(ctx, b.kind, b.minLen, b.margin, b.W, riskAll(b.margin));
    points.C_shippable = c ? { sol: c, obj: objectiveOf(ctx, c, pop.accHold, pop.accAll), passes: 0 } : null;
  }
  /* איחוד · A חייבת להיות לפחות כמו כל נקודה אחרת תחת אותו אילוץ */
  points.A_allRows = consolidate(ctx, points.A_allRows,
    [points.B_evolveOnly && points.B_evolveOnly.sol, points.C_shippable && points.C_shippable.sol],
    'perLen', riskAll, pop.accHold, pop.accAll);
  /* ‏D · אותו חיפוש בדיוק, מוגבל למרחב הגנים של ה-GA (‏12 רצועות) · כדי לענות אם
     ה-GA היה יכול למצוא משהו לו הכושר לא היה שטוח. */
  points.D_gaGeneSpace = searchPoint(ctx, 'ga12', riskAll, pop.accHold, pop.accAll, 'D · מרחב הגנים של ה-GA · אילוץ על הכול',
    [points.A_allRows && points.A_allRows.sol.W, points.B_evolveOnly && points.B_evolveOnly.sol.W].filter(Boolean));

  const outPoints = {};
  for (const [k, v] of Object.entries(points)) {
    if (!v) { outPoints[k] = null; continue; }
    const m = measure(ctx, v.sol.params);
    outPoints[k] = {
      kind: v.sol.kind, minLen: v.sol.minLen, vetoMargin: v.sol.margin, W: v.sol.W,
      thresholds: v.sol.spec.map((mx, i) => ({ maxLen: mx === Infinity ? null : mx, t: v.sol.vec[i] })),
      params: v.sol.params, measured: m,
      recallByLength: {
        all: EV.recallByLength(S, pop.all, EV.makeFastEval(v.sol.params)),
        holdout: EV.recallByLength(S, pop.hold, EV.makeFastEval(v.sol.params))
      }
    };
    say(`  ${k} · evolve ${pct(m.evolve.recall)} · holdout ${pct(m.holdout.recall)} · untrusted-included(all) ${pct(m.all.recallIncludingUntrusted)}`);
    say(`      faOwn · evolve ${m.evolve.falseAcceptsOwn} · holdout ${m.holdout.falseAcceptsOwn} · חוצי-כרטיסים ${m.cross.faOwn} · סה"כ ${m.faOwnTotal}`);
    say(`      fa בספירה המילולית של evolve.js · ${m.faLiteralTotal} (מתוכן ${m.all.falseAcceptsFromTodayLayer} משכבה 1)`);
  }
  R.stages.points = outPoints;

  /* קו התקציב · מדווח בנפרד ובמפורש, ואינו התשובה. */
  const budget = budgetLine(ctx, points.C_shippable || points.A_allRows, riskAll);
  R.stages.budgetLine = budget;
  if (budget) say(`\n  (שורת תקציב · לא התשובה) · עם תקציב של ${budget.allowed} קבלות-שווא מעבר לרצפה · holdout ${pct(budget.holdoutRecall)}`);

  /* האם fold1 קיבל את השורות שלו */
  const cmp = {};
  if (replay.fold1 && replay.fold1.falseAcceptRows.length) {
    const best = points.C_shippable || points.A_allRows;
    const E = EV.makeFastEval(best.sol.params);
    cmp.fold1Rows = replay.fold1.falseAcceptRows.map(r => {
      let acc = null;
      for (let i = 0; i < S.N; i++) { const q = S.rows[i]; if (q.typed === r.typed && q.key === r.key && q.term === r.term && String(q.unit) === String(r.unit)) { acc = EV.decideOne(S, i, E); break; } }
      return { typed: r.typed, key: r.key, term: r.term, unit: r.unit, why: r.why, acceptedByOurBest: acc };
    });
    say('\n  האם הנקודה שלנו מקבלת את שתי השורות של fold1:');
    for (const c of cmp.fold1Rows) say(`    "${c.typed}" ~ "${c.key}" · ${c.acceptedByOurBest ? '⛔ מקבלת' : '✅ אינה מקבלת'}`);
  }
  R.stages.fold1Comparison = cmp;

  /* ============ שלב 7 · כתיבת המועמד ============
     הנשלח הוא הנקודה עם ה-holdout recall הגבוה מבין A ו-C · שתיהן מקיימות את האילוץ
     הקשה על **כל** השורות. ההבדל היחיד ביניהן הוא אם המטרה שלפיה נבחרו המשקלים
     הסתכלה על ה-holdout, וזה מדווח בדוח ולא נבלע. */
  const chosen = (points.A_allRows && points.C_shippable)
    ? (points.C_shippable.obj.primary > points.A_allRows.obj.primary ? points.C_shippable : points.A_allRows)
    : (points.A_allRows || points.C_shippable);
  R.stages.chosenPoint = points.A_allRows && chosen === points.A_allRows ? 'A_allRows' : 'C_shippable';

  /* ---- שלב 7א · מעבר הכיווץ ----
     ‏recall מרבי אינו מצדיק ספים שאף שורה לא הפריכה. כל רצועה יורדת לערך הקטן ביותר
     ששומר על **קבוצת ההכרעה זהה בדיוק**, ולכן כל מספר בדוח חייב לצאת זהה סיבית-סיבית
     · ואם לא, זה ממצא ולא רעש: רצועה שחשבנו שאינה נגישה נושאת recall. */
  say('\n===== שלב 7א · כיווץ הספים · אותה החלטה בדיוק, בערכים הקטנים ביותר =====');
  const before = measure(ctx, chosen.sol.params);
  const sh = shrinkPass(ctx, chosen.sol);
  const after = measure(ctx, sh.params);
  const idn = (a, b) => a.evolve.recall === b.evolve.recall && a.holdout.recall === b.holdout.recall
    && a.all.recall === b.all.recall && a.all.recallIncludingUntrusted === b.all.recallIncludingUntrusted
    && a.evolve.tp === b.evolve.tp && a.holdout.tp === b.holdout.tp
    && a.faOwnTotal === b.faOwnTotal && a.faLiteralTotal === b.faLiteralTotal;
  const identical = idn(before, after);
  const lowered = [], zeroed = [];
  for (let i = 0; i < sh.vec.length; i++) {
    if (sh.vec[i] < chosen.sol.vec[i]) {
      const mx = chosen.sol.spec[i] === Infinity ? '∞' : chosen.sol.spec[i];
      lowered.push(`${mx}: ${chosen.sol.vec[i]}→${sh.vec[i]}`);
      if (sh.vec[i] === 0) zeroed.push(String(mx));
    }
  }
  R.stages.shrink = {
    sweeps: sh.sweeps,
    bandsBefore: chosen.sol.spec.map((mx, i) => ({ maxLen: mx === Infinity ? null : mx, t: chosen.sol.vec[i] })),
    bandsAfter: chosen.sol.spec.map((mx, i) => ({ maxLen: mx === Infinity ? null : mx, t: sh.vec[i] })),
    loweredBands: lowered, zeroedBands: zeroed,
    recallIdentical: identical, before: before, after: after
  };
  say(`  ${sh.sweeps} סבבים · ${lowered.length} רצועות ירדו · ${zeroed.length} מהן ל-0`);
  say(`  לפני · evolve ${pct(before.evolve.recall)} · holdout ${pct(before.holdout.recall)} · tp ${before.evolve.tp}/${before.holdout.tp} · faOwn ${before.faOwnTotal}`);
  say(`  אחרי · evolve ${pct(after.evolve.recall)} · holdout ${pct(after.holdout.recall)} · tp ${after.evolve.tp}/${after.holdout.tp} · faOwn ${after.faOwnTotal}`);
  say(`  ${identical ? '✅ זהה סיבית-סיבית · הכיווץ לא שינה שום מספר' : '⛔ הכיווץ שינה מספר · זה ממצא ולא רעש'}`);
  if (!identical) process.exitCode = 1;
  for (const l of lowered) say(`    ${l}`);
  /* מה כל רצועה **נושאת** · מאפסים אותה לבדה וסופרים כמה קבלות אמת נעלמו. לפי פירוק
     האיחוד זו התרומה ה**ייחודית** שלה (שורות שאף רצועה אחרת אינה מקבלת). זו התשובה
     המדידה לשאלה "אילו רצועות באמת חיות" · ורצועה שיצאה 0 בכיווץ נושאת 0 בהגדרה. */
  const carry = [];
  for (let i = 0; i < sh.vec.length; i++) {
    const v = sh.vec.slice(); v[i] = 0;
    const m = measure(ctx, mkParams(chosen.sol.spec, v, chosen.sol.minLen, chosen.sol.margin, chosen.sol.W));
    carry.push({
      maxLen: chosen.sol.spec[i] === Infinity ? null : chosen.sol.spec[i], t: sh.vec[i],
      tpLostEvolve: after.evolve.tp - m.evolve.tp, tpLostHoldout: after.holdout.tp - m.holdout.tp
    });
  }
  R.stages.shrink.bandCarry = carry;
  const live = carry.filter(c => c.tpLostEvolve + c.tpLostHoldout > 0);
  say(`  רצועות חיות (מאבדות קבלות אמת אם מאפסים אותן) · ${live.length} מתוך ${carry.length}`);
  for (const c of live) say(`    maxLen ${c.maxLen === null ? '∞' : c.maxLen} · t ${c.t} · נושאת ${c.tpLostEvolve} אבולוציה + ${c.tpLostHoldout} holdout`);
  const surprising = live.filter(c => c.maxLen !== null && c.maxLen < chosen.sol.minLen);
  if (surprising.length) {
    say(`  ⚠ ממצא · ${surprising.length} רצועות עם maxLen קטן מ-minLen (${chosen.sol.minLen}) **אינן** מתות · הן נושאות recall`);
    say('     ‏minLen מסנן את אורך המחרוזת שהוקלדה, לא את אורך המועמד · ועם del זול, מחרוזת ארוכה מיושרת למקטע קצר');
  }

  /* מכאן והלאה **הפרמטרים המכווצים** הם מה שנמדד ומה שנכתב · לא הפינה. */
  chosen.shrunk = sh;
  let wrote = null;
  if (chosen) {
    const cand = {
      ver: 'typo-lab/evolve/v1+gloss-search-candidate',
      generatedAt: R.generatedAt,
      params: {
        'he-word': ship.params['he-word'],
        'en-word': ship.params['en-word'],
        gloss: chosen.shrunk.params
      },
      enabled: true
    };
    /* ‏maxLen: Infinity אינו JSON · הארטיפקט של הייצור כותב null, ו-normalizeParams
       מחזיר null ל-Infinity. אותה המרה בדיוק, אחרת המועמד אינו נקרא כמו שנמדד. */
    cand.params.gloss = JSON.parse(JSON.stringify(cand.params.gloss, (k, v) => (v === Infinity ? null : v)));
    const p = path.join(OUT, 'gloss-candidate-rules.json');
    fs.writeFileSync(p, JSON.stringify(cand, null, 1));
    wrote = p;
    /* שער · he-word ו-en-word חייבים לצאת זהים לחלוטין לשנשלח */
    const back = JSON.parse(fs.readFileSync(p, 'utf8'));
    const same = s => JSON.stringify(back.params[s]) === JSON.stringify(ship.params[s]);
    const idOk = same('he-word') && same('en-word');
    /* שער · המועמד שנקרא מהדיסק חייב לתת בדיוק את אותם מספרים */
    const rt = measure(ctx, CH.normalizeParams(back.params.gloss));
    const rtOk = Math.abs(rt.holdout.recall - measure(ctx, chosen.shrunk.params).holdout.recall) < 1e-12 && rt.faOwnTotal === 0;
    R.stages.candidate = { path: p, identicalOtherSets: idOk, roundTripOk: rtOk, holdoutRecall: rt.holdout.recall, faOwnTotal: rt.faOwnTotal, faLiteralTotal: rt.faLiteralTotal };
    say(`\nנכתב ${p} · he-word/en-word זהים לשנשלח ${idOk ? '✅' : '⛔'} · הלוך-חזור ${rtOk ? '✅' : '⛔'}`);
    if (!idOk || !rtOk) process.exitCode = 1;
  }

  /* ============ שלב 8 · המסלול המדויק ============
     ‏evalSubset הוא קירוב מהיר · הוא רואה רק CAND_K המועמדים הקרובים ביותר ואינו
     מריץ את שכבת ההרחבה של צד הפירוש. ‏exactEval מריץ את **הבודק עצמו**
     (‏makeChecker/acceptGloss) על כל שורה. אם השניים חלוקים על אפס קבלות-השווא,
     המספר שלמעלה אינו שווה כלום · ולכן זה נמדד ולא מונח. */
  say('\n===== שלב 8 · המסלול המדויק · lib/checker.js על כל שורה =====');
  const ex = EV.exactEval(perSet.gloss, chosen.shrunk.params, langs);
  const exFa = ex.falseAccepts.map(f => ({ typed: f.typed, key: f.key, term: f.term, why: f.why, op: f.op, via: f.via, dist: f.dist }));
  /* ‏exactEval שומרת לכל היותר 25 דוגמאות. כל עוד fa ≤ 25 הרשימה **מלאה** והספירה
     כאן מדויקת; מעל זה אי אפשר להכריע מהדגימה, ולכן זה נספר כשלילה ולא כהצלחה. */
  const exOwn = ex.fa > exFa.length ? ex.fa : exFa.filter(f => f.via !== 'exact').length;
  R.stages.exact = {
    recall: ex.recall, recallIncludingUntrusted: ex.recallAll, tp: ex.tp, nAccept: ex.nAcc,
    falseAccepts: ex.fa, falseAcceptsNotFromExactPath: exOwn, falseAcceptsRealWord: ex.faRealWord,
    rows: exFa, fastRecallAllRows: measure(ctx, chosen.shrunk.params).all.recall
  };
  say(`  ‏recall ${pct(ex.recall)} (הקירוב המהיר: ${pct(R.stages.exact.fastRecallAllRows)}) · fa ${ex.fa} · מהן דרך המסלול המדויק/שכבה 1: ${ex.fa - exOwn} · real-word ${ex.faRealWord}`);
  for (const f of exFa) say(`    "${f.typed}" ~ "${f.key}" (${f.term}) · why=${f.why} · via=${f.via}`);
  if (exOwn > 0) { say('  ⛔ הבודק האמיתי מוצא קבלות-שווא שהגנום אחראי להן · המספר שלמעלה אינו תקף'); process.exitCode = 1; }
  else say('  ✅ הבודק האמיתי מסכים · אפס קבלות-שווא שהגנום אחראי להן');

  /* ============ שלב 9 · שכפול השער מקומית ============
     ‏evalSubset אינה רואה את ערוץ ההרחבה, ולכן "אפס קבלות-שווא" שלה אינו פסק הדין של
     ‏bank_gate. כאן רצה סריקת השער עצמה · הבודק האמיתי, מול כל צורה של כל כרטיס אחר
     כולל תוצרי ההרחבה. הריצה הזאת יקרה (~140s) ומכוונת בדיוק לשאלה "האם השער יעבור". */
  say('\n===== שלב 9 · שכפול סריקת bank_gate על המועמד =====');
  const tG = Date.now();
  const gate = GX.sweepGloss(langs, perSet, chosen.shrunk.params);
  /* ‏EFF · החסם שהשער גוזר מהפרמטרים וקובע לפיו את עומק האינדקס, ולכן את זמן הריצה
     שלו. מדווח כאן כדי שהעלות של המועמד תהיה ידועה **לפני** שמריצים אותו. */
  const eff = BGATE.effOps(CH.normalizeParams(chosen.shrunk.params));
  say(`  ‏EFF של המועמד = ${eff} (עומק הסריקה של השער) · השכפול רץ בעומק ${CH.MAX_OPS}`);
  R.stages.gateReplication = {
    cfgKey: gate.cfgKey, eff, sweepDepth: CH.MAX_OPS, pairs: gate.pairs, decided: gate.decided, baseline: gate.baselineCount,
    collisions: gate.collisions, perLang: gate.langs.map(l => ({ lang: l.lang, forms: l.forms, fromRule: l.fromRule, pairs: l.pairs, decided: l.decided, collisions: l.collisions.length })),
    seconds: (Date.now() - tG) / 1000
  };
  say(`  ${gate.pairs} זוגות · ${gate.decided} הוכרעו · ${gate.baselineCount} קבלות via=exact (התנהגות קיימת) · ${((Date.now() - tG) / 1000).toFixed(1)}s`);
  for (const c of gate.collisions) say(`  ⛔ [${c.lang}/gloss] "${c.typed}" התקבל על "${c.card}" · שייך ל-${c.intruder} · dist ${c.dist}`);
  if (gate.collisions.length) { say(`  ⛔ ${gate.collisions.length} התנגשויות · המועמד ייפול בשער`); process.exitCode = 1; }
  else say('  ✅ אפס התנגשויות חדשות בשכפול · זה תנאי הכרחי, ו-bank_gate נשאר הסמכות');

  /* ============ --selftest ============ */
  if (SELFTEST) selftest(ctx, R, riskAll, chosen, ship, perSet, langs, wordCross);

  R.evaluations = N_EVAL;
  R.wallClockSec = (Date.now() - T0) / 1000;
  R.dsKey = dsKey;
  fs.writeFileSync(path.join(OUT, 'gloss-search.json'), JSON.stringify(R, (k, v) => (v === Infinity ? null : v), 1));
  writeReport(R);
  say(`\nנכתב out/gloss-search.json ו-out/gloss-search-report.md · ${R.wallClockSec.toFixed(1)}s · ${N_EVAL} הערכות`);
}

/* ===================== פירוק האיחוד · המדידה =====================
 * ווקטורי ספים דטרמיניסטיים (‏LCG פנימי · אין Math.random בקובץ הזה). לכל ווקטור,
 * קבוצת השורות שהמנוע מקבל חייבת להיות שווה לאיחוד הקבוצות של רצועה-רצועה.
 */
function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function acceptedSet(ctx, P, idx) {
  const E = EV.makeFastEval(P);
  const out = new Set();
  for (let x = 0; x < idx.length; x++) { const i = idx[x]; if (EV.decideOne(ctx.S, i, E)) out.add(i); }
  return out;
}
function verifyBox(ctx, idx) {
  const rnd = lcg(20260815);
  const spec = bandSpec('perLen', ctx.lmax);
  const n = spec.length;
  let checked = 0, agree = 0;
  const W = Object.assign({ sub: 1 }, ctx.shippedW);
  for (let k = 0; k < 40; k++) {
    const vec = new Array(n).fill(0).map(() => TGRID[Math.floor(rnd() * TGRID.length)]);
    const minLen = Math.floor(rnd() * 5), margin = 1 + Math.floor(rnd() * 3);
    const joint = acceptedSet(ctx, mkParams(spec, vec, minLen, margin, W), idx);
    const uni = new Set();
    for (let b = 0; b < n; b++) {
      if (!(vec[b] > 0)) continue;
      const one = new Array(n).fill(0); one[b] = vec[b];
      for (const i of acceptedSet(ctx, mkParams(spec, one, minLen, margin, W), idx)) uni.add(i);
    }
    checked++;
    if (joint.size === uni.size && Array.from(joint).every(i => uni.has(i))) agree++;
  }
  return { checked, agree, note: 'accepted(t) == union over bands of accepted(e_i t_i)' };
}

/* ===================== מעבר הכיווץ =====================
 *
 * פינת התיבה נותנת את ה-recall המרבי · אבל היא נותנת אותו עם ספים שאף שורה בדאטהסט
 * אינה מגבילה. רצועה שיושבת על תקרת הרשת (‏3) רק מפני ש**אין** עליה נתונים אינה
 * "בטוחה", היא **לא הופרכה** · והיא נעשית חיה ברגע שמישהו יוסיף כרטיס למאגר.
 *
 * לכן: לכל רצועה, הערך **הקטן ביותר ברשת** ששומר על קבוצת ההכרעה **זהה בדיוק** ·
 * אותן שורות מתקבלות, אותן שורות נדחות, בכל הסט ובשליליות החוצות-כרטיסים. רצועה שאף
 * שורה מתקבלת אינה עוברת דרכה יורדת בכך ל-0 מעצמה · אין צורך לזהות אותה בנפרד.
 *
 * ⚠ סריקה **לינארית** מלמטה ולא חיפוש בינארי, ובכוונה. הפרדיקט "הקבוצה זהה" נכון על
 * קטע ולא על זנב (מתחת לערך המינימלי הקבוצה קטנה, ומעל ה-cap היא גדלה), ולכן חיפוש
 * בינארי היה נשען על מונוטוניות שאינה מתקיימת. הסריקה איטית פי עשרה ונכונה תמיד.
 */
function decisionBitmap(ctx, P) {
  const E = EV.makeFastEval(P);
  const b = new Uint8Array(ctx.S.N + ctx.X.N);
  for (let i = 0; i < ctx.S.N; i++) b[i] = EV.decideOne(ctx.S, i, E) ? 1 : 0;
  for (let i = 0; i < ctx.X.N; i++) b[ctx.S.N + i] = EV.decideOne(ctx.X, i, E) ? 1 : 0;
  return b;
}
function sameBitmap(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
/* מזעור רצועה אחת · הערך הקטן ביותר ברשת (ולא גדול מהנוכחי) ששומר על הביטמפ. הערך
   הנוכחי תמיד עומד בתנאי, ולכן הסריקה תמיד מסתיימת. */
function minimiseBand(ctx, sol, vec, i, R0) {
  const keep = vec[i];
  let found = keep;
  for (const t of TGRID) {
    if (t > keep + 1e-12) break;
    vec[i] = t;
    if (sameBitmap(decisionBitmap(ctx, mkParams(sol.spec, vec, sol.minLen, sol.margin, sol.W)), R0)) { found = t; break; }
  }
  vec[i] = found;
  return found;
}
/* ‏startVec/ref נפרדים מ-sol כדי ש---selftest יוכל להריץ את **אותו** מעבר בדיוק על
   ווקטור מנופח בכוונה ולראות אותו חוזר · שער שרואים אותו רק ירוק אינו עדות.
   הסריקה חוזרת עד **נקודת שבת**: מזעור רצועה אחת משנה את מה שהשכנות שלה יכולות
   להרשות לעצמן, ולכן מעבר יחיד היה מחזיר תוצאה שתלויה בסדר. בנקודת השבת כל רצועה
   מינימלית **בהינתן** כל האחרות · וזו בדיוק הטענה ששער S9ב בודק. */
function shrinkPass(ctx, sol, startVec, ref) {
  const vec = (startVec || sol.vec).slice();
  const R0 = ref || decisionBitmap(ctx, mkParams(sol.spec, sol.vec, sol.minLen, sol.margin, sol.W));
  let moved = true, sweeps = 0;
  while (moved && sweeps < 8) {
    moved = false; sweeps++;
    for (let i = 0; i < vec.length; i++) {
      const before = vec[i];
      if (minimiseBand(ctx, sol, vec, i, R0) !== before) moved = true;
    }
  }
  return { vec, params: mkParams(sol.spec, vec, sol.minLen, sol.margin, sol.W), ref: R0, sweeps };
}

/* ===================== שורת התקציב ===================== */
function budgetLine(ctx, best, riskAll) {
  if (!best) return null;
  const b = best.sol;
  const spec = b.spec, n = spec.length;
  const risk = riskAll(b.margin);
  const allowed = 5;
  const vec = new Array(n).fill(0);
  const faAt = v => { const E = EV.makeFastEval(mkParams(spec, v, b.minLen, b.margin, b.W)); const r = EV.evalSubset(ctx.S, risk, E); const x = ctx.X.N ? EV.evalSubset(ctx.X, ctx.XI, E) : null; return r.faOwn + (x ? x.faOwn : 0); };
  for (let i = 0; i < n; i++) {
    const probe = new Array(n).fill(0);
    let lo = 0, hi = TGRID.length - 1, bestT = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; probe[i] = TGRID[mid]; if (faAt(probe) <= allowed) { bestT = TGRID[mid]; lo = mid + 1; } else hi = mid - 1; }
    vec[i] = bestT;
  }
  const P = mkParams(spec, vec, b.minLen, b.margin, b.W);
  const m = measure(ctx, P);
  return { allowed, holdoutRecall: m.holdout.recall, evolveRecall: m.evolve.recall, faOwnTotal: m.faOwnTotal, faLiteralTotal: m.faLiteralTotal, note: 'תקציב · לא התשובה. האילוץ הקשה הוא אפס.' };
}

/* ===================== --selftest · שיניים =====================
 * לכל שער · הרצה שהוא צריך לעבור, **ואחריה** שבירה מכוונת שהוא חייב להיכשל עליה.
 * שער שראו אותו רק ירוק אינו עדות · זה כלל הפרויקט, וכאן הוא ממומש שער-שער.
 */
function selftest(ctx, R, riskAll, chosen, ship, perSet, langs, wordCross) {
  say('\n===== --selftest · שיניים =====');
  const S = ctx.S, res = {};
  const bad = m => { say('  ⛔ ' + m); process.exitCode = 1; };
  const ok = m => say('  ✅ ' + m);

  /* S1 · קבוצת הסיכון שקולה לקבוצת ה-reject המלאה · ואינה שקולה כשמזייפים אותה */
  {
    const rnd = lcg(11);
    const spec = bandSpec('perLen', ctx.lmax);
    let agree = 0, trials = 0;
    for (let k = 0; k < 60; k++) {
      const vec = new Array(spec.length).fill(0).map(() => TGRID[Math.floor(rnd() * TGRID.length)]);
      const P = mkParams(spec, vec, 0, 1, Object.assign({ sub: 1 }, ctx.shippedW));
      const E = EV.makeFastEval(P);
      const a = EV.evalSubset(S, riskAll(1), E).faOwn, b = EV.evalSubset(S, ctx.pop.rejAll, E).faOwn;
      trials++; if (a === b) agree++;
    }
    const fake = riskAll(3);        // קבוצה של שוליים 3 · תת-קבוצה ממש, ולכן חייבת לפספס
    const Pw = mkParams(bandSpec('perLen', ctx.lmax), new Array(bandSpec('perLen', ctx.lmax).length).fill(3), 0, 1, Object.assign({ sub: 1 }, ctx.shippedW));
    const Ew = EV.makeFastEval(Pw);
    const wrong = EV.evalSubset(S, fake, Ew).faOwn, right = EV.evalSubset(S, ctx.pop.rejAll, Ew).faOwn;
    res.S1 = { trials, agree, brokenSubsetFa: wrong, fullFa: right };
    if (agree === trials) ok(`S1 · קבוצת הסיכון שקולה בכל ${trials} הניסויים`); else bad(`S1 · ${trials - agree} פערים`);
    if (wrong < right) ok(`S1-שיניים · קבוצה שגויה (שוליים 3) מדווחת ${wrong} במקום ${right} · לשער יש שיניים`);
    else bad('S1-שיניים · קבוצה שגויה לא שינתה דבר · השער עיוור');
  }

  /* S2 · מבחן הקבילות חייב להיות מסוגל להיכשל */
  {
    const E = EV.makeFastEval(PERMISSIVE(1));
    const f = EV.evalSubset(S, ctx.pop.rejAll, E).faOwn;
    res.S2 = { permissiveFaOwn: f };
    if (f > 0) ok(`S2 · גנום מתירני מייצר ${f} קבלות-שווא · אפס הוא טענה שאפשר להפריך`); else bad('S2 · גנום מתירני אינו מייצר קבלות-שווא · מבחן ריק');
  }

  /* S3 · ה-caps הדוקים · כל רצועה בפינה קבילה, וצעד רשת אחד מעליה אינה */
  {
    const b = chosen.sol, spec = b.spec, risk = riskAll(b.margin);
    const faAt = v => { const E = EV.makeFastEval(mkParams(spec, v, b.minLen, b.margin, b.W)); const r = EV.evalSubset(S, risk, E); const x = ctx.X.N ? EV.evalSubset(ctx.X, ctx.XI, E) : null; return r.faOwn + (x ? x.faOwn : 0); };
    const cornerOk = faAt(b.vec) === 0;
    let tight = 0, testable = 0;
    for (let i = 0; i < spec.length; i++) {
      const gi = TGRID.indexOf(b.vec[i]);
      if (gi < 0 || gi === TGRID.length - 1) continue;          // כבר בתקרת הרשת · אין מה לבדוק
      testable++;
      const v = b.vec.slice(); v[i] = TGRID[gi + 1];
      if (faAt(v) > 0) tight++;
    }
    res.S3 = { cornerFeasible: cornerOk, testableBands: testable, tightBands: tight };
    if (cornerOk) ok('S3 · הפינה קבילה'); else bad('S3 · הפינה אינה קבילה');
    if (testable && tight === testable) ok(`S3-שיניים · כל ${testable} הרצועות שאינן בתקרת הרשת נשברות בצעד אחד מעלה`);
    else if (!testable) say('  · S3-שיניים · כל הרצועות בתקרת הרשת · אין מה לשבור');
    else bad(`S3-שיניים · ${testable - tight} רצועות אינן הדוקות · ה-cap אינו cap`);
  }

  /* S4 · השורה התקועה · אף גנום אינו יכול לגעת בה, והדגל הוא הסיבה */
  {
    const st = R.stages.structuralFloor.rows[0];
    if (!st) { say('  · S4 · אין שורה תקועה · אין מה להוכיח'); res.S4 = null; }
    else {
      const i = st.idx;
      const Ez = EV.makeFastEval(CH.normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 0 }], W: {}, vetoMargin: 3, useLexicon: true }));
      const acceptedAtZero = EV.decideOne(S, i, Ez);
      const T = { N: S.N, flags: Uint8Array.from(S.flags), tLen: S.tLen, off: S.off, pLen: S.pLen, pCnt: S.pCnt, dOwn: S.dOwn, dOther: S.dOther, rows: S.rows, whyCode: S.whyCode };
      T.flags[i] &= ~F_TODAY;                                   // מנטרלים את דגל שכבה 1 בעותק
      const acceptedWithoutFlag = EV.decideOne(T, i, Ez);
      res.S4 = { acceptedAtZeroTolerance: acceptedAtZero, acceptedWithoutTodayFlag: acceptedWithoutFlag };
      if (acceptedAtZero) ok('S4 · השורה מתקבלת גם בסובלנות אפס · אף סף אינו נוגע בה');
      else bad('S4 · השורה אינה מתקבלת בסובלנות אפס · ההסבר לרצפה שגוי');
      if (!acceptedWithoutFlag) ok('S4-שיניים · ניטרול דגל שכבה 1 בעותק הופך אותה לנדחית · הדגל הוא הסיבה');
      else bad('S4-שיניים · גם בלי הדגל היא מתקבלת · הסיבה אינה הדגל');
    }
  }

  /* S5 · שחזור ה-GA · זהה ליומן, ומזייף זרע חייב לא להיות זהה */
  {
    const r = R.stages.replay && R.stages.replay.fold1;
    if (!r) { say('  · S5 · אין שחזור'); res.S5 = null; }
    else {
      if (r.logMatchesArtifact) ok('S5 · שחזור fold1 זהה ליומן דור-דור'); else bad('S5 · השחזור אינו זהה ליומן');
      const nonHold = ctx.pop.evolve;
      const tr = []; for (let x = 0; x < nonHold.length; x++) { const i = nonHold[x]; if (S.fold[i] !== 1) tr.push(i); }
      const rp = replayGA(ctx, 'x', I32(tr), `${SEED}|gloss|fold1|WRONG-SEED`);
      const same = sameLog(rp.log, gaLogOf('gloss/fold1'));
      res.S5 = { match: r.logMatchesArtifact, wrongSeedMatches: same };
      if (!same) ok('S5-שיניים · זרע מזויף אינו משחזר את היומן · ההשוואה אינה ריקה');
      else bad('S5-שיניים · גם זרע מזויף משחזר · ההשוואה ריקה');
    }
  }

  /* S6 · המועמד שנכתב · הלוך-חזור, ושינוי מכוון חייב לשנות מספרים */
  {
    const p = path.join(OUT, 'gloss-candidate-rules.json');
    const back = JSON.parse(fs.readFileSync(p, 'utf8'));
    const m0 = measure(ctx, CH.normalizeParams(back.params.gloss));
    const broken = JSON.parse(JSON.stringify(back.params.gloss));
    for (const b of broken.bands) b.t = 3;                       // סובלנות מקסימלית בכל רצועה
    const m1 = measure(ctx, CH.normalizeParams(broken));
    res.S6 = { faOwn: m0.faOwnTotal, brokenFaOwn: m1.faOwnTotal, holdout: m0.holdout.recall, brokenHoldout: m1.holdout.recall };
    if (m0.faOwnTotal === 0) ok(`S6 · המועמד מהדיסק · faOwn 0 · holdout ${pct(m0.holdout.recall)}`); else bad(`S6 · המועמד מהדיסק מייצר ${m0.faOwnTotal} קבלות-שווא`);
    if (m1.faOwnTotal > 0) ok(`S6-שיניים · העלאת כל הספים ל-3 מייצרת ${m1.faOwnTotal} קבלות-שווא · המדידה רגישה`);
    else bad('S6-שיניים · גם ספים מקסימליים אינם מייצרים קבלות-שווא · המדידה עיוורה');
    /* he-word/en-word · זהות מוחלטת, ושינוי מכוון חייב להיתפס */
    const idOk = JSON.stringify(back.params['he-word']) === JSON.stringify(ship.params['he-word'])
      && JSON.stringify(back.params['en-word']) === JSON.stringify(ship.params['en-word']);
    const mut = JSON.parse(JSON.stringify(back.params['he-word'])); mut.minLen = (mut.minLen || 0) + 1;
    const mutCaught = JSON.stringify(mut) !== JSON.stringify(ship.params['he-word']);
    res.S6b = { identical: idOk, mutationCaught: mutCaught };
    if (idOk) ok('S6 · he-word ו-en-word זהים בייט-בייט לשנשלח'); else bad('S6 · הסטים האחרים אינם זהים');
    if (mutCaught) ok('S6-שיניים · שינוי של minLen אחד ב-he-word נתפס בהשוואה'); else bad('S6-שיניים · ההשוואה אינה תופסת שינוי');
  }

  /* S7 · השיפור אמיתי · שנשלח 0, אנחנו לא 0 */
  {
    const shipR = R.stages.shipped.measured.holdout.recall;
    const ourR = R.stages.points[R.stages.chosenPoint].measured.holdout.recall;
    res.S7 = { shipped: shipR, ours: ourR };
    if (shipR === 0) ok('S7 · הפרמטרים שנשלחו נותנים בדיוק 0.00% · הבסיס נמדד ולא צוטט'); else bad(`S7 · שנשלח נמדד ${pct(shipR)} ולא 0 · ההנחה שגויה`);
    if (ourR > shipR) ok(`S7-שיניים · הנקודה שלנו ${pct(ourR)} > ${pct(shipR)}`); else bad('S7-שיניים · אין שיפור');
  }

  /* S8 · המסלול המדויק · מסכים על אפס, וחייב להיות מסוגל לא להסכים */
  {
    const e = R.stages.exact;
    if (!e) { say('  · S8 · אין מדידה מדויקת'); res.S8 = null; }
    else {
      if (e.falseAcceptsNotFromExactPath === 0) ok(`S8 · lib/checker.js על כל ${ctx.S.N} השורות · אפס קבלות-שווא שהגנום אחראי להן (fa ${e.falseAccepts}, כולן דרך via=exact)`);
      else bad(`S8 · הבודק האמיתי מוצא ${e.falseAcceptsNotFromExactPath} קבלות-שווא`);
      /* שיניים · אותו מסלול בדיוק, עם ספים מנופחים · חייב לדווח קבלות-שווא */
      const loose = JSON.parse(JSON.stringify(chosen.shrunk.params, (k, v) => (v === Infinity ? null : v)));
      for (const b of loose.bands) b.t = 3;
      loose.minLen = 0;
      const ex2 = EV.exactEval(perSet.gloss, loose, langs);
      const own2 = ex2.falseAccepts.filter(f => f.via !== 'exact').length;   // מדגם של עד 25
      res.S8 = { fa: e.falseAccepts, own: e.falseAcceptsNotFromExactPath, brokenFa: ex2.fa, brokenOwnInSample: own2, sampleCap: ex2.falseAccepts.length };
      if (own2 > 0) ok(`S8-שיניים · אותו מסלול עם ספים 3 ו-minLen 0 מדווח ${ex2.fa} קבלות-שווא · ${own2} מתוך ${ex2.falseAccepts.length} הדוגמאות שנשמרו אינן via=exact · המדידה המדויקת אינה עיוורת`);
      else bad('S8-שיניים · גם ספים מקסימליים אינם מייצרים קבלות-שווא במסלול המדויק · המדידה עיוורה');
    }
  }

  /* S9 · מעבר הכיווץ · לא no-op מצד אחד, ולא חמדני מדי מצד שני */
  {
    const sh = chosen.shrunk, sol = chosen.sol;
    const V = sh.vec, ref = decisionBitmap(ctx, sh.params);

    /* ‏9א · שיניים · רצועה שמנפחים אותה בכוונה חייבת לחזור בדיוק לערך שנבחר.
       המזעור נעשה על **רצועה אחת** כשכל השאר בערכי הכיווץ · וזה מוגדר היטב רק מפני
       שהמעבר רץ עד נקודת שבת, ולכן כל רצועה מינימלית בהינתן האחרות. */
    let k = -1;
    for (let i = 0; i < V.length; i++) if (V[i] < sol.vec[i]) { k = i; break; }
    if (k < 0) { say('  · S9א · הכיווץ לא הוריד אף רצועה · אין מה לנפח'); res.S9a = null; }
    else {
      const inflated = V.slice(); inflated[k] = sol.vec[k];
      const drifted = !sameBitmap(decisionBitmap(ctx, mkParams(sol.spec, inflated, sol.minLen, sol.margin, sol.W)), ref);
      const work = inflated.slice();
      const got = minimiseBand(ctx, sol, work, k, ref);
      const mx = sol.spec[k] === Infinity ? '∞' : sol.spec[k];
      res.S9a = { band: mx, inflatedTo: sol.vec[k], returnedTo: got, expected: V[k], inflationChangedDecisions: drifted };
      if (got === V[k]) ok(`S9א-שיניים · רצועה maxLen ${mx} נופחה ל-${sol.vec[k]} והמעבר החזיר אותה בדיוק ל-${got} · הכיווץ אינו no-op`);
      else bad(`S9א-שיניים · הרצועה חזרה ל-${got} ולא ל-${V[k]}`);
    }

    /* ‏9ב · שיניים הפוכות · כל רצועה שנשמרה מעל 0 חייבת להיות **הדוקה**: צעד רשת
       אחד למטה חייב לשנות את קבוצת ההכרעה. אחרת הכיווץ לא סיים את העבודה. */
    let kept = 0, tight = 0;
    const slack = [];
    for (let i = 0; i < V.length; i++) {
      if (!(V[i] > 0)) continue;
      const gi = TGRID.indexOf(V[i]);
      if (gi <= 0) continue;
      kept++;
      const v = V.slice(); v[i] = TGRID[gi - 1];
      if (!sameBitmap(decisionBitmap(ctx, mkParams(sol.spec, v, sol.minLen, sol.margin, sol.W)), ref)) tight++;
      else slack.push(sol.spec[i] === Infinity ? '∞' : sol.spec[i]);
    }
    res.S9b = { keptBands: kept, tightBands: tight, slackBands: slack };
    if (kept && tight === kept) ok(`S9ב · כל ${kept} הרצועות שנשמרו מעל 0 הדוקות · צעד אחד למטה שובר את זהות ההחלטה`);
    else if (!kept) say('  · S9ב · אין רצועות מעל 0 · אין מה לבדוק');
    else bad(`S9ב · ${kept - tight} רצועות עדיין רפויות (${slack.join(', ')}) · הכיווץ לא סיים`);

    /* ‏9ג · זהות המספרים · לא "כמעט" */
    const s = R.stages.shrink;
    if (s.recallIdentical) ok(`S9ג · ‏recall זהה סיבית-סיבית · evolve ${pct(s.after.evolve.recall)} · holdout ${pct(s.after.holdout.recall)} · faOwn ${s.after.faOwnTotal}`);
    else bad('S9ג · הכיווץ שינה מספר');
    /* שיניים · השוואת הזהות חייבת להיות מסוגלת לזהות שינוי */
    const nudged = V.slice();
    let ni = -1; for (let i = 0; i < V.length; i++) if (V[i] > 0) { ni = i; break; }
    if (ni >= 0) {
      const gi = TGRID.indexOf(V[ni]); nudged[ni] = TGRID[Math.max(0, gi - 1)];
      const m = measure(ctx, mkParams(sol.spec, nudged, sol.minLen, sol.margin, sol.W));
      res.S9c = { nudgedBand: sol.spec[ni] === Infinity ? '∞' : sol.spec[ni], nudgedHoldout: m.holdout.recall, keptHoldout: s.after.holdout.recall };
      if (m.holdout.recall !== s.after.holdout.recall || m.evolve.recall !== s.after.evolve.recall)
        ok(`S9ג-שיניים · הורדת רצועה maxLen ${res.S9c.nudgedBand} בצעד אחד מזיזה את המספרים · evolve ${pct(s.after.evolve.recall)}→${pct(m.evolve.recall)} · holdout ${pct(s.after.holdout.recall)}→${pct(m.holdout.recall)} · מבחן הזהות אינו ריק`);
      else bad('S9ג-שיניים · הורדת רצועה אינה מזיזה דבר · מבחן הזהות ריק');
    }
  }

  /* S10 · שכפול השער · מכויל מול כשל ידוע, לא מוצהר */
  {
    const g = R.stages.gateReplication;
    if (g.collisions.length === 0) ok(`S10 · שכפול השער על המועמד · ${g.pairs} זוגות · אפס התנגשויות`);
    else bad(`S10 · השכפול מוצא ${g.collisions.length} התנגשויות במועמד`);
    /* שיניים · **הפרמטרים שנפלו בשער בפועל**. השכפול חייב למצוא בדיוק את שתי
       ההתנגשויות שהשער דיווח עליהן, בשמן. שכפול שאינו משחזר כשל ידוע אינו שכפול. */
    const FAILED = {
      minLen: 6, vetoMargin: 1, useLexicon: true,
      W: { sub: 1, adjSub: 1.3, transpose: 1.3, ins: 2, del: 0.2, doubleLetter: 0.2, materVI: 0.6, homophone: 0.5 },
      bands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        .map((L, i) => ({ maxLen: L, t: [0, 0, 1.8, 2.2, 0, 0, 0.4, 0.4, 0, 0.5, 1.2, 0.5, 0.5, 1.9, 1.2, 1.1, 2, 2, 2, 0.6][i] }))
        .concat([{ maxLen: null, t: 0 }])
    };
    const rep = GX.sweepGloss(langs, perSet, FAILED);
    const names = rep.collisions.map(c => `${c.typed}|${c.card}`).sort();
    const want = ['רסיס עצ|אֵגֶל', 'משא כבד|יָצוּעַ'].sort();
    const same = names.length === want.length && names.every((x, i) => x === want[i]);
    res.S10 = { candidateCollisions: g.collisions.length, failedParamsCollisions: rep.collisions.length, reproduced: same, rows: rep.collisions };
    if (same) ok(`S10-שיניים · על הפרמטרים שנפלו בשער, השכפול מוצא בדיוק את אותן 2 התנגשויות (${rep.collisions.map(c => '"' + c.typed + '"→' + c.card).join(', ')}) · השכפול מכויל`);
    else bad(`S10-שיניים · השכפול מצא ${rep.collisions.length} (${names.join(', ')}) במקום בדיוק את השתיים שהשער דיווח · אינו מכויל`);
  }

  /* S11 · שער השקילות · הבונה שלי מול הרשומה הרשמית של evolve.js */
  {
    if (!wordCross) { say('  · S11 · כיוון המונח מהמטמון · אין מה להשוות'); res.S11 = null; }
    else {
      const j = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
      const want = { 'he-word': j.results['he-word'].crossCard.rowsInRisk, 'en-word': j.results['en-word'].crossCard.rowsInRisk };
      const got = { 'he-word': wordCross['he-word'], 'en-word': wordCross['en-word'] };
      const same = want['he-word'] === got['he-word'] && want['en-word'] === got['en-word'];
      /* המטמון הישן · אותו דאטהסט, בונה אחר. ההשוואה מולו היא השיניים: היא מראה
         שהמספרים **יכולים** להיות שונים, ולכן ההתאמה למעלה אינה טריוויאלית. */
      let stale = null;
      const CC = path.join(OUT, 'coverage-cross.json');
      if (fs.existsSync(CC)) {
        try { const c = JSON.parse(fs.readFileSync(CC, 'utf8')); stale = { 'he-word': c.rows['he-word'].length, 'en-word': c.rows['en-word'].length }; } catch (e) { stale = null; }
      }
      res.S11 = { officialRowsInRisk: want, mine: got, match: same, staleCache: stale };
      if (same) ok(`S11 · הבונה שלי מייצר ${got['he-word']}/${got['en-word']} שורות בכיוון המונח · זהה ל-typo-rules.json (${want['he-word']}/${want['en-word']})`);
      else bad(`S11 · הבונה שלי ${got['he-word']}/${got['en-word']} מול הרשומה ${want['he-word']}/${want['en-word']}`);
      if (stale && (stale['he-word'] !== want['he-word'] || stale['en-word'] !== want['en-word']))
        ok(`S11-שיניים · out/coverage-cross.json מחזיק ${stale['he-word']}/${stale['en-word']} · מטמון "תקף" לפי מפתח הדאטהסט אך של בונה אחר · ההשוואה אינה ריקה, והמטמון ההוא אינו נקרא כאן`);
      else say('  · S11-שיניים · המטמון הישן תואם · אין הדגמה של פער');
    }
  }

  R.stages.selftest = res;
}

/* ===================== הדוח ===================== */
function writeReport(R) {
  const L = [];
  const p = s => L.push(s);
  const P = R.stages.points;
  const st = R.stages.structuralFloor;
  const fmt = m => `evolve ${pct(m.evolve.recall)} · holdout ${pct(m.holdout.recall)} · כולל לא-מהימנות ${pct(m.all.recallIncludingUntrusted)}`;

  p('# ‏gloss · נקודת ההפעלה הטובה ביותר באפס קבלות-שווא');
  p('');
  p(`נוצר ${R.generatedAt} · \`node typo-lab/gloss_search.js --selftest\` · ${R.evaluations} הערכות · ${R.wallClockSec.toFixed(1)}s`);
  p('');
  p('## התשובה בשורה אחת');
  p('');
  const C = P[R.stages.chosenPoint];
  p(`אפס קבלות-שווא שהגנום אחראי להן, על **כל** השורות (${R.stages.data.rows} שורות סט · ${R.stages.data.evolve} אבולוציה + ${R.stages.data.holdout} holdout · ועוד ${R.stages.data.crossCardRows} שליליות חוצות-כרטיסים): **${pct(C.measured.holdout.recall)}** holdout recall · ${pct(C.measured.evolve.recall)} על שורות האבולוציה · ‏recallIncludingUntrusted ${pct(C.measured.holdout.recallIncludingUntrusted)} ב-holdout ו-${pct(C.measured.evolve.recallIncludingUntrusted)} באבולוציה.`);
  p('');
  p(`הנקודה שנכתבה ל-\`out/gloss-candidate-rules.json\` היא **${R.stages.chosenPoint}**. השוואה: השנשלח **0.00%**, ו-\`coverage.js\` מדדה **8.61%** holdout (בכיול רצועות-אורך, על גרסה קודמת של \`typo-rules.json\` שבה למשקלי ה-gloss היו ערכים אחרים לגמרי · \`del 0.2\`, \`homophone 0.2\`). כאן המשקלים נסרקו במפורש, ולכן המספר גבוה יותר.`);
  p('');
  p('⚠ **הספירה המילולית של `evolve.js` אינה יכולה לרדת מ-' + (st.rowsInSet + st.rowsInCross) + '**, ולא בגלל כיול: ' + st.rowsInSet + ' שורה בסט מתויגת `reject` ובכל זאת **השכבה הראשונה מקבלת אותה כבר היום**. ‏`evalSubset` סופרת אותה ב-`fa`, ואף פרמטר אינו יכול לגרום לה או למנוע אותה. כל המספרים כאן מדווחים בשתי הספירות בנפרד.');
  p('');
  for (const s of st.rows) p(`- \`"${s.typed}"\` ~ \`"${s.key}"\` · כרטיס \`${s.term}|${s.unit}\` · \`why=${s.why}\` · \`op=${s.op}\` · fold ${s.fold} · holdout ${s.holdout}`);
  p('');
  p('## הנקודות שנמדדו');
  p('');
  p('| נקודה | מרחב | minLen | שוליים | evolve | holdout | ‏faOwn סה"כ | ‏fa בספירת evolve.js |');
  p('|---|---|---|---|---|---|---|---|');
  const names = { A_allRows: 'A · אילוץ על הכול, מטרה holdout', B_evolveOnly: 'B · אילוץ ומטרה על אבולוציה בלבד', C_shippable: 'C · מועמד למשלוח', D_gaGeneSpace: 'D · מרחב הגנים של ה-GA' };
  for (const [k, v] of Object.entries(P)) {
    if (!v) { p(`| ${names[k] || k} | — | — | — | — | — | — | — |`); continue; }
    p(`| ${names[k] || k} | ${v.kind} | ${v.minLen} | ${v.vetoMargin} | ${pct(v.measured.evolve.recall)} | ${pct(v.measured.holdout.recall)} | ${v.measured.faOwnTotal} | ${v.measured.faLiteralTotal} |`);
  }
  p('');
  p(`הפרמטרים שנשלחו · ${fmt(R.stages.shipped.measured)} · faOwn ${R.stages.shipped.measured.faOwnTotal} · fa ${R.stages.shipped.measured.faLiteralTotal}`);
  p('');
  p('### קבלות-שווא לפי אוכלוסייה · הנקודה הנבחרת');
  p('');
  p(`- שורות אבולוציה (${R.stages.data.evolve}) · קבלות-שווא של הגנום **${C.measured.evolve.falseAcceptsOwn}** · ועוד ${C.measured.evolve.falseAcceptsFromTodayLayer} משכבה 1 שאינן בשליטת אף פרמטר`);
  p(`- ‏holdout (${R.stages.data.holdout}) · קבלות-שווא של הגנום **${C.measured.holdout.falseAcceptsOwn}** · ועוד ${C.measured.holdout.falseAcceptsFromTodayLayer} משכבה 1`);
  p(`- שליליות חוצות-כרטיסים · **${C.measured.cross.faOwn}** מתוך ${C.measured.cross.rows} שורות · הקבוצה ריקה לסט הפירושים (\`buildCrossCard\` שמרה 0 זוגות משני הצדדים · he/gloss ו-en/gloss), ולכן האילוץ הזה **אינו** מה שחסם את gloss`);
  p(`- ‏real-word · ${C.measured.all.falseAcceptsRealWord} קבלות-שווא על שליליות קשות, על כל השורות`);
  p('');
  if (R.stages.shrink) {
    const s = R.stages.shrink;
    p('### מעבר הכיווץ · הורדת כל רצועה לערך הקטן ביותר שאינו משנה דבר');
    p('');
    p('פינת התיבה נותנת את ה-recall המרבי, אבל היא נותנת אותו עם רצועות שיושבות על תקרת הרשת (`3`) רק מפני שאף שורה בדאטהסט אינה מגבילה אותן. רצועה כזאת **לא הופרכה**, וזה אינו אותו דבר כמו "בטוחה": היא נעשית חיה ברגע שמישהו מוסיף כרטיס למאגר. לכן כל רצועה הורדה לערך הקטן ביותר ברשת ששומר על **קבוצת ההכרעה זהה בדיוק** · אותן שורות מתקבלות, אותן נדחות, בכל הסט ובשליליות. רצועה שאף קבלה אינה עוברת דרכה יורדת בכך ל-`0` מעצמה.');
    p('');
    p('| ‏maxLen | לפני | אחרי |');
    p('|---|---|---|');
    for (let i = 0; i < s.bandsBefore.length; i++) {
      const a = s.bandsBefore[i], b = s.bandsAfter[i];
      const mark = a.t !== b.t ? ' ←' : '';
      p(`| ${a.maxLen === null ? '∞' : a.maxLen} | ${a.t} | **${b.t}**${mark} |`);
    }
    p('');
    p(`${s.loweredBands.length} רצועות ירדו, ${s.zeroedBands.length} מהן ל-\`0\` (\`maxLen\` ${s.zeroedBands.join(', ')}) · ${s.sweeps} סבבים עד נקודת שבת.`);
    p('');
    if (s.bandCarry) {
      const live = s.bandCarry.filter(c => c.tpLostEvolve + c.tpLostHoldout > 0);
      p(`**מה כל רצועה נושאת.** מאפסים רצועה אחת וסופרים כמה קבלות אמת נעלמו · לפי פירוק האיחוד זו התרומה הייחודית שלה. ${live.length} רצועות מתוך ${s.bandCarry.length} חיות:`);
      p('');
      p('| ‏maxLen | ‏t אחרי הכיווץ | קבלות אמת שהיא לבדה נושאת · evolve | ‏holdout |');
      p('|---|---|---|---|');
      for (const c of live) p(`| ${c.maxLen === null ? '∞' : c.maxLen} | ${c.t} | ${c.tpLostEvolve} | ${c.tpLostHoldout} |`);
      p('');
      const surprising = live.filter(c => c.maxLen !== null && c.maxLen < (P[R.stages.chosenPoint].minLen));
      if (surprising.length) {
        p(`⚠ **ממצא · הרצועות הקצרות אינן מתות.** ההנחה שלי בסבב הקודם הייתה ש-\`maxLen\` 1–4 בלתי-נגישות מאחורי \`minLen ${P[R.stages.chosenPoint].minLen}\`. הכיווץ הפריך אותה: ${surprising.map(c => '`' + c.maxLen + '`').join(', ')} ירדו אבל **לא** ל-0, כי איפוסן מוחק קבלות אמת. הסיבה: \`minLen\` מסנן את אורך המחרוזת ש**הוקלדה**, ואילו הרצועה נבחרת לפי אורך ה**מועמד**; עם \`del ${P[R.stages.chosenPoint].W.del}\` מחיקה זולה, מחרוזת מוקלדת ארוכה מיושרת למקטע פירוש קצר בעלות נמוכה. ‏\`maxLen\` 1 ו-2 אכן יצאו 0; 3 ו-4 לא. זה בדיוק סוג הרצועה שראוי שהשער הממצה יסתכל עליה.`);
        p('');
      }
    }
    p(`**והמספרים לא זזו.** לפני: evolve ${pct(s.before.evolve.recall)} (tp ${s.before.evolve.tp}) · holdout ${pct(s.before.holdout.recall)} (tp ${s.before.holdout.tp}) · faOwn ${s.before.faOwnTotal}. אחרי: evolve ${pct(s.after.evolve.recall)} (tp ${s.after.evolve.tp}) · holdout ${pct(s.after.holdout.recall)} (tp ${s.after.holdout.tp}) · faOwn ${s.after.faOwnTotal}. זהות ${s.recallIdentical ? '**סיבית-סיבית** ✅' : '**נשברה** ⛔ · זה ממצא'} · לא "בערך".`);
    p('');
    p('הארטיפקט שנכתב הוא **המכווץ**. כל מספר בדוח הזה נמדד עליו, כולל המסלול המדויק למטה.');
    p('');
  }
  p('### ‏recall לפי אורך המפתח · הנקודה הנבחרת');
  p('');
  p('| אורך | ‏accept | ‏tp | ‏recall | ‏reject | ‏fa |');
  p('|---|---|---|---|---|---|');
  for (const b of C.recallByLength.all) p(`| ${b.len} | ${b.nAccept} | ${b.tp} | ${b.recall == null ? '—' : pct(b.recall)} | ${b.nReject} | ${b.fa} |`);
  p('');
  if (R.stages.constraintTeeth) {
    const t = R.stages.constraintTeeth;
    p('### הנקודה העיוורת שהשער חשף · תוצרי ההרחבה של B1');
    p('');
    p('המועמד הקודם נפל ב-`bank_gate` על שתי התנגשויות, ושתיהן דרך אותו ערוץ:');
    p('');
    p('```');
    p('⛔ [he/gloss] "רסיס עצ" accepted on "אֵגֶל" · belongs to שבב');
    p('⛔ [he/gloss] "משא כבד" accepted on "יָצוּעַ" · belongs to עול');
    p('```');
    p('');
    p('`"רסיס עצ"` הוא **תוצר הרחבה** של הכרטיס `שבב` תחת חוק `B1-union` (פיצול "או" מחלק), ולא מקטע פירוש גולמי. מכאן שתי העיוורויות בו-זמנית: הוא אינו באינדקס המקטעים ולכן **שולי הדו-משמעות אינם רואים אותו** (`dOther` יצא 9, כלומר "אין שכן"), והוא לא היה במפת הבעלים של `buildCrossCard` ולכן **קבוצת השליליות לא הכילה אותו**. ‏"‏0 שורות חוצות-כרטיסים ב-gloss" לא היה סימן לבטיחות · הוא היה סימן לנקודה עיוורת, וכך אמרתי עליו בטעות בסבב הקודם.');
    p('');
    p(`המסלול עצמו: \`"רסיס עצ"\` → \`"רסיס"\` (מקטע של \`אֵגֶל\`) הוא **שלוש מחיקות**, ובעלות \`del 0.2\` זה \`dist 0.6\` · מתחת לסף של רצועת \`maxLen 4\`. זו בדיוק אותה רצועה קצרה שהכיווץ בסבב הקודם סירב לאפס, ואותו \`del\` זול.`);
    p('');
    p(`**התיקון:** קבוצת השליליות נבנית מחדש כשקבוצת הצורות כוללת את תוצרי ההרחבה של כל כרטיס · ${t.expansionForms} צורות he ו-${(R.stages.data.crossStats && R.stages.data.crossStats['en/gloss'] || {}).fromRule || 0} צורות en שלא היו שם קודם. הפונקציה עצמה מיובאת מ-\`bank_gate.expandOf\` עם אותו \`cfg\`, ולא נכתבת מחדש. סט השליליות של gloss עבר מ-**0** שורות ל-**${t.rows}**.`);
    p('');
    p('ולפני שנבנה עליה משהו · היא נבדקה מול מה שהשער כבר תפס:');
    p('');
    for (const f of t.found) p(`- ${f.present ? '✅' : '⛔'} \`"${f.want.typed}"\` מול \`${f.want.term}\` · פולש \`${f.intruder}\` · \`dOwn ${f.dOwn}\` · \`dOther ${f.dOther}\``);
    p('');
  }
  if (R.stages.gateReplication) {
    const g = R.stages.gateReplication;
    p('### שכפול השער מקומית · לפני שמבזבזים עוד 504 שניות');
    p('');
    p(`‏\`glossSweep\` אינה מיוצאת מ-\`bank_gate\`, ולכן לולאת הסריקה נכתבת ב-\`lib/gloss_search_expand.js\` · אבל היא **מכוילת ולא מוצהרת**: מריצים אותה על הפרמטרים שנפלו בשער בפועל, והיא חייבת למצוא בדיוק את אותן שתי התנגשויות בשמן (שער S10). היא אכן מוצאת אותן, עם \`dist 0.6\` בשתיהן.`);
    p('');
    p(`על המועמד הנוכחי: **${g.pairs.toLocaleString('en-US')}** זוגות · ${g.decided.toLocaleString('en-US')} הוכרעו · **${g.collisions.length} התנגשויות חדשות** · ${g.baseline} קבלות \`via=exact\` שהן התנהגות קיימת ואינן פסק אדום. ${((g.seconds || 0)).toFixed(0)}s.`);
    p('');
    for (const c of g.collisions) p(`- ⛔ \`[${c.lang}/gloss]\` \`"${c.typed}"\` על \`"${c.card}"\` · שייך ל-\`${c.intruder}\``);
    p('');
    p(`‏\`depth\` בשכפול הוא \`MAX_OPS\` (=${g.sweepDepth}) ולא \`effOps(P)\` · על-חסם, כי קבלה פאזית דורשת מרחק גולמי \`<= MAX_OPS\` לכל \`P\`. לכן השכפול מכריע **על-קבוצה** של מה שהשער מכריע, ואינו יכול לפספס התנגשות \`typo\`. ההפרש הקטן בספירת הזוגות מול השער הוא קבוצת ה-\`always\` של השער · צורות שחולקות גזע עמוק ונכנסות להכרעה בלי קשר למרחק, וכולן מגיעות לערוץ \`via=exact\` ולא ל-\`typo\`.`);
    p('');
    p(`**עלות הריצה הבאה שלך.** ‏\`EFF\` של המועמד הוא **${g.eff}** · זה מה שקובע את עומק אינדקס-המחיקות בשער ולכן את זמן הריצה. ‏\`EFF\` נגזר מ-\`floor(max(t)/min(W))\` חסום ב-\`MAX_OPS\`, ועם סף חיובי כלשהו ומשקל מינימלי ${'`' + Math.min.apply(null, Object.values(P[R.stages.chosenPoint].W)) + '`'} הוא נשאר ${g.eff}. כלומר סדר הגודל של ${g.pairs.toLocaleString('en-US')} זוגות ו-~500 שניות הוא **מחיר מובנה של סובלנות חיובית ב-gloss**, ולא משהו שהמועמד הזה החמיר. ‏gloss בסובלנות אפס נותן \`EFF=0\` ו-15,768 זוגות · זו העסקה.`);
    p('');
    p('⚠ זהו **תנאי הכרחי ולא פסק דין**. `bank_gate` בודק גם את שכבת חוק צד-הפירוש (`gloss-rule`), את כיוון המונח, את הנרדפות ואת זוגות הצירה. הוא נשאר הסמכות.');
    p('');
  }
  if (R.stages.exact) {
    const e = R.stages.exact;
    p('### אימות במסלול המדויק · `lib/checker.js` עצמו');
    p('');
    p(`‏\`exactEval\` הריצה את הבודק האמיתי (\`makeChecker/acceptGloss\`, כולל מה שהקירוב המהיר אינו רואה) על כל ${R.stages.data.rows} שורות ה-gloss עם הפרמטרים שנכתבו: **recall ${pct(e.recall)}** · \`fa ${e.falseAccepts}\` · מתוכן **${e.falseAcceptsNotFromExactPath}** שהגנום אחראי להן · \`real-word ${e.falseAcceptsRealWord}\`. הקירוב המהיר נתן ${pct(e.fastRecallAllRows)} על אותן שורות · ההפרש נובע מקיצוץ קבוצת המועמדים ל-\`CAND_K\` בקירוב, וכיוונו לטובת המסלול המדויק.`);
    p('');
    for (const f of e.rows) p(`- \`"${f.typed}"\` ~ \`"${f.key}"\` · \`${f.term}\` · \`why=${f.why}\` · \`via=${f.via}\` ← המסלול המדויק, לא סובלנות`);
    p('');
  }
  p('## למה נשלח 0.00%');
  p('');
  for (const [t, v] of Object.entries(R.stages.gaLog)) {
    if (!v) continue;
    p(`- \`${t}\` · ${v.generations} דורות · bestEver \`${v.bestEver}\`${v.bestEver === -1e6 ? ' · אף פרט קביל לא נמצא' : ''}`);
  }
  p('');
  const r1 = R.stages.replay && R.stages.replay.fold1;
  if (r1) {
    p(`שחזור \`gloss/fold1\` (אותו זרע, אותו מפרט GA) זהה ליומן דור-דור: **${r1.logMatchesArtifact ? 'כן' : 'לא'}**. שתי קבלות-השווא שלו בוולידציה:`);
    p('');
    for (const f of r1.falseAcceptRows) p(`- \`"${f.typed}"\` ~ \`"${f.key}"\` · \`${f.term}|${f.unit}\` · \`why=${f.why}\` · \`op=${f.op}\``);
    p('');
  }
  if (R.stages.fold1Comparison && R.stages.fold1Comparison.fold1Rows) {
    p('האם הנקודה שלנו מקבלת אותן:');
    p('');
    for (const c of R.stages.fold1Comparison.fold1Rows) p(`- \`"${c.typed}"\` ~ \`"${c.key}"\` · ${c.acceptedByOurBest ? '**כן**' : 'לא'}`);
    p('');
  }
  p('## פסק הדין · שלוש האפשרויות, ומה הראיות אומרות');
  p('');
  p('**1 · תכונה מבנית של הנתונים?** לא. תחת האילוץ הקשה של אפס קבלות-שווא שהגנום אחראי להן, על כל השורות שיש, נמדד ' +
    `**${pct((P.A_allRows || P.C_shippable).measured.holdout.recall)}** holdout recall · והוא חיובי, לא אפס. יתרה מזו, גם **בתוך מרחב הגנים המדויק של ה-GA** (שתים-עשרה רצועות) נמדד ${P.D_gaGeneSpace ? pct(P.D_gaGeneSpace.measured.holdout.recall) : '—'}. הייצוג לא היה המחסום.`);
  p('');
  p('**2 · אילוץ אפס קבלות-שווא שאי אפשר לספק?** רק בקריאה המילולית, ובגלל שורה אחת. ' +
    `\`evalSubset\` סופרת ב-\`fa\` גם קבלות של **השכבה הראשונה** (\`meaningMatch\`), ובסט הפירושים יש בדיוק ${st.rowsInSet} שורה כזאת שמתויגת \`reject\`. כל עוד היא בתת-הקבוצה שהכושר מודד, \`fitnessOf\` מחזיר \`-1e6\` לכל גנום · כולל לגנום אפס-הסובלנות. זו **לא** אי-ספיקות של האילוץ הפדגוגי: אף פרמטר אינו יכול לגרום לקבלה הזאת או למנוע אותה. ‏\`coverage.js\` כבר עשתה את ההבחנה הזאת ומדדה \`faOwn\` ולא \`fa\`; \`evolve.js\` לא.`);
  p('');
  p('**3 · כשל חיפוש?** כן · וזה השורש. הרצף מוכח מתוך הארטיפקטים:');
  p('');
  p(`- השורה התקועה נמצאת ב-\`fold ${st.rows.length ? st.rows[0].fold : '?'}\` ואינה ב-holdout. לכן היא **בתוך** קבוצת האימון של folds 0,2,3,4 ושל \`final\`, ו**מחוץ** לקבוצת האימון של fold1 בלבד.`);
  p('- זה בדיוק מה שהיומן מראה: `gloss/fold1` הוא היחיד שהגיע לכושר חיובי; כל השאר ו-`final` נעצרו על `-1000000` = `-1e6 × 1` · כלומר קבלת-שווא **אחת** בדיוק, לא יותר.');
  p('- כשכל גנום מקבל את אותו ציון, נוף הכושר שטוח. `runGA` מעדכן `bestEver` רק ב-`>` ממש, ולכן `sinceImprove` עולה מדור לדור עד `patience=22` והריצה נעצרת ב-23 דורות · וזה בדיוק מספר הדורות שנרשם בארבעת ה-folds וב-`final`.');
  p('- הגנום ש"ניצח" הוא הפרט הראשון באוכלוסייה עם הכושר המקסימלי בדור 0, כלומר `SEED_PARAMS[0]` · זרע אפס-הסובלנות. ואכן `params.gloss` שנשלח זהה לו: `minLen 0`, `vetoMargin 1`, כל שנים-עשר הספים 0, ומשקלי ברירת המחדל של `normalizeParams`.');
  p('');
  p('כלומר "רדום מבנית" מתאר נכון את הפלט ולא נכון את הסיבה. הפלט הוא **ברירת המחדל של כשל**, לא תוצאה של חיפוש · ה-GA מעולם לא דירג שני גנומים שונים זה מול זה בסט הזה.');
  p('');
  p('### התיקון המינימלי שהיה מונע את זה');
  p('');
  p('לספור ב-`fitnessOf` את `faOwn` במקום `fa` (או לסנן מהדאטהסט את השורות שהשכבה הראשונה כבר מקבלת · `gen_dataset` אמורה לעשות זאת, וההודעה `⚠ 1 שורות שהחוק של היום כבר מקבל` נדפסת בכל טעינה). זה לבדו מחזיר לנוף הכושר שיפוע, ולפי המדידה כאן היה מאפשר ל-GA להגיע לסביבות ' + (P.D_gaGeneSpace ? pct(P.D_gaGeneSpace.measured.holdout.recall) : '—') + ' במרחב הגנים שלו.');
  p('');
  p('## מגבלות · מה המספרים האלה אינם');
  p('');
  p('- ‏**מעגליות.** התיוג עצמו נגזר מאותו לקסיקון שנמדד כאן: `why=real-word` ו-`why=ambiguous` נקבעו מול המאגר והלקסיקון, ואותו לקסיקון הוא גם שכבת הווטו שחוסמת שורות בזמן ההערכה. לכן "אפס קבלות-שווא" הוא אפס **מול התיוג הזה**, ומחרוזת שהלקסיקון אינו מכיר אינה יכולה להיספר. הנקודה שבה זה נושך חזק במיוחד: רצועות אורך שבהן ה-recall קופץ הן בדיוק אלה שבהן הלקסיקון חוסם הרבה שליליות · הרווח שם עשוי להיות רווח של כיסוי מילון ולא של כיול.');
  p('- ‏**ה-holdout אינו עצמאי** בנקודה A ובנקודה C: האילוץ נמדד גם עליו. רק נקודה B מכיילת בלי לגעת בו, וההפרש בין B ל-A הוא גודל ההתאמה-לתוך-המדגם.');
  p('- ‏**שכבת ההרחבה B1 · הייתה בלתי ממודלת, וזה בדיוק מה שהפיל את המועמד הקודם.** עכשיו היא בתוך קבוצת השליליות (`lib/gloss_search_expand.js`) ובתוך שכפול הסריקה, ושתיהן מכוילות מול הכשל שהשער דיווח. מה שעדיין **אינו** ממודל כאן: שכבת חוק צד-הפירוש כערוץ קבלה של הכרטיס עצמו (`gloss-rule`), כיוון המונח, הנרדפות וזוגות הצירה. `bank_gate.js` נשאר הסמכות היחידה.');
  p('- ‏**מטמון שאינו ממופתח בקוד הוא מלכודת.** `out/coverage-cross.json` נכתב ב-01:10, `evolve.js` נערך ב-01:39, ו-`typo-rules.json` מ-02:07 מדווח `rowsInRisk` 534/396 בעוד המטמון מחזיק 533/398. מפתח ה-sha של הדאטהסט לבדו אמר "תקף". המטמון של הקובץ הזה ממופתח בדאטהסט **ובגיבוב כל קובץ שמשתתף בבנייה**, והשוואת המספרים האלה היא שער (S11).');
  p('- החיפוש על הספים **מדויק** (פינת התיבה · הוכחה נמדדת בשלב 5). החיפוש על המשקלים הוא ירידת-קואורדינטות ואינו מובטח גלובלית.');
  p('- ‏**רצועות שאין להן נתונים · טופל.** בפינת התיבה רצועות שאף שורה אינה מגבילה יושבות על תקרת הרשת. מעבר הכיווץ מוריד כל אחת מהן לערך הקטן ביותר שאינו משנה את ההחלטה, ולכן רצועה בלתי-נגישה יוצאת `0` ולא `3`. מה שנשאר מעל 0 הוא **הדוק** · צעד רשת אחד למטה כבר שובר את זהות ההחלטה, וזה נמדד (שער S9ב). זה מקטין את החשיפה אבל אינו מבטל את הצורך ב-`bank_gate.js`, שרואה גם את שכבת ההרחבה B1 ואת המאגר המלא.');
  p('');
  if (R.stages.budgetLine) {
    p(`שורת תקציב · **לא התשובה**: עם ${R.stages.budgetLine.allowed} קבלות-שווא מותרות, holdout ${pct(R.stages.budgetLine.holdoutRecall)}. האילוץ הקשה נשאר אפס.`);
    p('');
  }
  fs.writeFileSync(path.join(OUT, 'gloss-search-report.md'), L.join('\n'));
}

if (require.main === module) main();
module.exports = { solve, bandSpec, mkParams, atRiskFor, verifyBox, measure };
