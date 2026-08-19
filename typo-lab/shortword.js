'use strict';
/* shortword.js · האם אפשר לפתוח מילים אנגליות קצרות, ובאיזה מחיר
 *
 * ===== השאלה =====
 *
 * ‏out/coverage-report.md מדד שה-recall האנגלי באפס קבלות-שווא הוא 0.6% באורך 3, 2.8%
 * באורך 4 ו-12.0% באורך 5, בעוד שהחסם המוחלט שם הוא 98–99%. שתי מסקנות כבר נסגרו שם
 * ואינן נפתחות כאן: לקסיקון מושלם אינו קונה דבר מתחת לאורך 6, ומה ששורד בגנום מתירני
 * הוא צפיפות מאגר (‏ambiguous ו-cross-card). השאלה שנשארה: האם **העשרת מרחב התכונות**
 * · ולא הרפיית ספים · מפרידה בין "הלומד שגה בהקלדה" לבין "הלומד התכוון למילה אחרת".
 *
 * ===== מה נמדד כאן =====
 *
 *   שלב 1 · שער שקילות · המעריך המורחב חייב להסכים עם evolve.decideOne שורה-שורה.
 *   שלב 2 · אבחון הקיר · איזו שכבה בדיוק חוסמת את האורכים הקצרים.
 *   שלב 3 · בתוך מרחב הגנים הקיים · האם צירוף אחר של משקלים ושוליים כבר פותר את זה.
 *   שלב 4 · הגן החדש · שוליים מדורגים עם משטר צר.
 *   שלב 5 · שימור אות ראשונה ושלד עיצורים במשטר הצר.
 *   שלב 6 · אינטראקציה אופרטור×אורך במשטר הרגיל · ההשערה המקורית, נבדקת ישירות.
 *   שלב 7 · אופציית התקציב · מתומחרת בנפרד ולעולם לא מוצגת כתוצאה.
 *
 * ⚠ הקובץ אינו כותב פרמטרים לייצור ואינו מריץ את השער הממצה. מועמד נבדק ב-bank_gate
 * לפני שנאמר עליו משהו.
 *
 * ===== --set · באיזה סט מתבצעת המדידה הראשית =====
 *
 * שלבים 2 עד 7ב נכתבו סביב שאלה אנגלית, אבל אף אחד מהם אינו תלוי באנגלית בקוד · הם
 * תלויים בסט אחד שנבחר. ‏`--set` בוחר אותו, וברירת המחדל היא `en-word` **בדיוק** כפי
 * שהיה קודם: אותם קבצי פלט, אותו סדר קריאות ל-rng, אותו שלב 8 (שרץ תמיד על שאר הסטים,
 * ובברירת המחדל זה he-word ואז gloss · בדיוק הרשימה שהייתה כתובה כאן ביד).
 * ⚠ אי-הרגרסיה **נמדדה ולא הוצהרה**: הרצה מלאה לפני ואחרי השינוי, עם אותו
 * `out/typo-rules.json`, נותנת `stages` זהים בית-בית.
 *
 * הדוח בעברית (`writeReport`) מנוסח על אנגלית לאורך כל הטקסט, ולכן הוא נכתב **רק**
 * בברירת המחדל. סט אחר מקבל את ה-JSON בלבד · דוח מנוסח על השפה הלא נכונה גרוע מאין דוח.
 *
 * הרצה · node typo-lab/shortword.js [--set <he-word|en-word|gloss>] [--selftest] [--quick]
 */

const fs = require('fs');
const path = require('path');

const EV = require('./evolve.js');
const CH = require('./lib/checker.js');
const SE = require('./lib/shortword_eval.js');
const { mulberry32 } = require('./lib/rng.js');
const { OP_KEYS } = require('./lib/wdist.js');

const OUT = path.join(__dirname, 'out');
const ARGS = process.argv.slice(2);
const has = f => ARGS.includes(f);
const SELFTEST = has('--selftest');
const QUICK = has('--quick');
/* ‏--set · הסט שנמדד בשלבים 2-7ב. ברירת המחדל היא en-word, וכל מסלול הקוד איתה זהה
   למה שהיה כאן לפני הדגל. סט לא מוכר עוצר · שם עם שגיאת כתיב לא ימדוד בשקט את אנגלית. */
const argVal = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d; };
const SET = argVal('--set', 'en-word');
if (!EV.SETS.includes(SET)) {
  process.stdout.write(`⛔ --set ${SET} · הסטים המוכרים הם ${EV.SETS.join(', ')}\n`);
  process.exit(2);
}
/* סיומת שם הקובץ · ריקה ל-en-word, ולכן הארטיפקטים האנגליים נשארים בדיוק במקומם. */
const FSUF = SET === 'en-word' ? '' : '.' + SET;
const say = s => process.stdout.write(s + '\n');
const pct = v => v == null ? '-' : (v * 100).toFixed(2) + '%';
const MAXL = SE.MAXL;
const TICK = '`';

const GRID = [];
for (let v = 0; v <= 3.0001; v += 0.1) GRID.push(Math.round(v * 100) / 100);

/* גבולות גני המשקל · נקראים מ-evolve.GENES ולא נכתבים ביד, כדי שחיפוש "בתוך המרחב"
   יהיה באמת בתוך המרחב. ‏sub מקובע ב-1 · הוא יחידת המידה. */
const W_BOUNDS = {};
for (const g of EV.GENES) if (g.name.startsWith('W.')) W_BOUNDS[g.name.slice(2)] = { lo: g.lo, hi: g.hi };

/* ===== גבול ההוכחה · למה החיפוש כאן חסום =====
 *
 * ‏buildCrossCard סינן זוגות חוצי-כרטיסים שאף גנום **במרחב** אינו יכול לקבל, והמסנן
 * הזה הניח בדיוק שלושה דברים: כל הספים לכל היותר 3, כל המשקלים לפחות 0.2, והשוליים
 * לפחות 1. גנום שיוצא מהמעטפת בכיוון המתירני נמדד מול קבוצת שליליות **חסרה**, ואז
 * "אפס קבלות-שווא" הוא חוסר-ידיעה ולא תוצאה. לכן החיפוש כאן חסום:
 *   ספים · רשת 0..3 בלבד · משקלים · לא מתחת ל-0.2 · marginHard · לא מתחת ל-1.
 * מחיר "יקר" (‏99) מותר, כי הוא רק מקטין קבלות · הצד הזול הוא זה שחייב חסם. */
const W_FLOOR = 0.2;
const T_MAX = 3;
const EXPENSIVE = 99;

const idxAll = S => Int32Array.from({ length: S.N }, (_, i) => i);

/* ⚠ נקרא **פעם אחת** בתחילת הריצה. סוכן אחר יכול לכתוב את הקובץ הזה מחדש באמצע, ולכן
   החתימה נשמרת בדוח · אחרת "שיפור" הוא השוואה מול בסיס שכבר אינו קיים. */
let SHIP_META = null;
function shipParams() {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  SHIP_META = { ver: j.ver, generatedAt: j.generatedAt, mtime: fs.statSync(path.join(OUT, 'typo-rules.json')).mtime.toISOString() };
  return j.params;
}

function makeScn(S, idx, X, xI) { return { S, idx, X, xI }; }

function compileFor(scn, aux, xaux, wvMain, wvTight, keepMain, keepTight) {
  scn.CN = SE.compile(scn.S, wvMain, keepMain ? keepMain(aux) : null);
  scn.XCN = SE.compile(scn.X, wvMain, keepMain ? keepMain(xaux) : null);
  scn.CT = wvTight ? SE.compile(scn.S, wvTight, keepTight ? keepTight(aux) : null) : scn.CN;
  scn.XCT = wvTight ? SE.compile(scn.X, wvTight, keepTight ? keepTight(xaux) : null) : scn.XCN;
  return scn;
}
function shareCompile(from, to) { to.CN = from.CN; to.CT = from.CT; to.XCN = from.XCN; to.XCT = from.XCT; }

/* ‏faOwn ולא fa · קבלה שהגיעה משכבה 1 (‏acceptsToday) היא ההתנהגות של היום ואין גנום
   שגורם לה או מונע אותה. אותה הבחנה בדיוק שקיימת ב-coverage.js. */
function evalPoint(scn, E) {
  const r = SE.evalSubset(scn.S, scn.idx, E, scn.CN, scn.CT);
  const xr = scn.X && scn.X.N ? SE.evalSubset(scn.X, scn.xI, E, scn.XCN, scn.XCT) : { faOwn: 0, faToday: 0, fa: 0 };
  return {
    recall: r.recall, tp: r.tp, nAcc: r.nAcc, res: r,
    fa: r.faOwn + xr.faOwn, faToday: r.faToday + xr.faToday, sfa: r.fa, xfa: xr.fa
  };
}

/* ספירת קבלות-שווא עם יציאה מוקדמת · זו הפונקציה שהכיול קורא אלפי פעמים, ולכן היא
   נעצרת ברגע שהתקציב נחרג במקום למנות עד הסוף. הקבוצה החוצה-כרטיסים נספרת ראשונה
   כי היא צפופה בקבלות-שווא, ולכן היא זו שקוטעת. */
function faOver(scn, E, budget) {
  let fa = 0;
  const count = (S, idx, CN, CT) => {
    for (let x = 0; x < idx.length; x++) {
      const i = idx[x];
      const f = S.flags[i];
      if (f & 8) continue;                                     // שורת accept · לא קבלת-שווא
      if (f & 4) continue;                                     // מתקבל היום · לא באחריות הגנום
      if (!SE.decideOne(S, i, E, CN, CT)) continue;
      if (++fa > budget) return true;
    }
    return false;
  };
  if (scn.X && scn.X.N && count(scn.X, scn.xI, scn.XCN, scn.XCT)) return true;
  return count(scn.S, scn.idx, scn.CN, scn.CT);
}

/* ===== טיפוס-קואורדינטות =====
 * הקבילות מונוטונית יורדת בכל סף בנפרד, ולכן לכל קואורדינטה חיפוש בינארי על הרשת.
 * התוצאה **מקסימלית מקומית** (אי אפשר להעלות אף סף לבד) ולא המקסימום הגלובלי · וזה
 * נאמר ולא מוסתר. סבבים לסירוגין עולה/יורד כדי להקטין את התלות בסדר.
 *
 * הספים מוחזקים כמטמון-לפי-אורך שמתעדכן נקודתית, ולא נבנים מחדש בכל בדיקה · בנייה
 * מחדש הייתה יקרה יותר מההערכה עצמה.
 */
function setCoord(cache, l, v) {
  if (l <= MAXL) { cache[l] = v; if (l === 1) cache[0] = v; }
  else for (let k = MAXL + 1; k < 256; k++) cache[k] = v;
}
function tune(scn, base, opts) {
  const O = opts || {};
  const budget = O.budget || 0;
  const doMain = O.main !== false;
  const doTight = !!O.tight;
  const vm = new Array(MAXL + 2).fill(0);
  const vt = new Array(MAXL + 2).fill(0);
  const E = SE.mkE(Object.assign({}, base, { bands: SE.bandsFromVec(vm), bandsTight: SE.bandsFromVec(vt) }));
  const feasible = () => !faOver(scn, E, budget);
  if (!feasible()) return null;                       // כבר לא קביל בלי שום סובלנות

  const coords = [];
  for (let l = 1; l <= MAXL + 1; l++) { if (doMain) coords.push(['m', l]); if (doTight) coords.push(['t', l]); }
  let changed = true, passes = 0;
  const maxPass = QUICK ? 2 : 4;
  while (changed && passes < maxPass) {
    changed = false; passes++;
    const up = passes % 2 === 1;
    for (let n = 0; n < coords.length; n++) {
      const [kind, l] = coords[up ? n : coords.length - 1 - n];
      const vec = kind === 'm' ? vm : vt;
      const cache = kind === 'm' ? E.tcache : E.ttcache;
      const keep = vec[l];
      let lo = 0, hi = GRID.length - 1, best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        setCoord(cache, l, GRID[mid]);
        if (feasible()) { best = GRID[mid]; lo = mid + 1; } else hi = mid - 1;
      }
      vec[l] = best; setCoord(cache, l, best);
      if (best !== keep) changed = true;
    }
  }
  /* ===== צמצום · אותו recall, בספים הנמוכים ביותר שמחזיקים אותו =====
   *
   * טיפוס-קואורדינטות דוחף כל סף עד הגבול שאילוץ קבלות-השווא מרשה, גם כשהסף כבר
   * מזמן הפסיק לקנות recall. באורכים הארוכים כמעט אין שליליות חוצות-כרטיסים במודל
   * (‏0 שורות מעל אורך 8), ולכן שם "אפס קבלות-שווא" אינו מגביל דבר והספים נעצרים
   * בתקרת הרשת · פרמטר שנראה מכויל ולמעשה רק לא נבדק. הצמצום מוריד כל סף לערך הקטן
   * ביותר שעדיין נותן **בדיוק אותו** מספר קבלות אמת. זה אינו משנה אף מספר בדוח, והוא
   * משנה מאוד את מה שנשלח.
   */
  const tpOf = () => SE.evalSubset(scn.S, scn.idx, E, scn.CN, scn.CT).tp;
  const target = tpOf();
  for (let n = 0; n < coords.length; n++) {
    const [kind, l] = coords[n];
    const vec = kind === 'm' ? vm : vt;
    const cache = kind === 'm' ? E.tcache : E.ttcache;
    const cur = vec[l];
    if (!(cur > 0)) continue;
    let lo = 0, hi = GRID.indexOf(cur), best = cur;
    if (hi < 0) continue;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      setCoord(cache, l, GRID[mid]);
      if (tpOf() === target) { best = GRID[mid]; hi = mid - 1; } else lo = mid + 1;
    }
    vec[l] = best; setCoord(cache, l, best);
  }
  if (tpOf() !== target) throw new Error('tune: the shrink pass changed the recall · this must be impossible');
  if (faOver(scn, E, budget)) throw new Error('tune: the shrink pass broke feasibility · this must be impossible');

  const params = Object.assign({}, base, { bands: SE.bandsFromVec(vm), bandsTight: SE.bandsFromVec(vt) });
  return { params, E: SE.mkE(params), vecMain: vm.slice(), vecTight: vt.slice(), point: evalPoint(scn, E), passes };
}

/* ===== התקרה המבודדת לכל אורך =====
 *
 * טיפוס-קואורדינטות מחזיר נקודה מקסימלית מקומית, ולכן "אורך 5 יצא 1.55%" יכול להיות
 * תכונה של סדר החיפוש ולא של הבעיה. המבחן שאינו תלוי בסדר: לפתוח **רצועת אורך אחת
 * בלבד**, כל השאר באפס, ולחפש את הסף הגדול ביותר שעדיין נותן אפס קבלות-שווא. מה
 * שיוצא הוא התקרה של אותה רצועה בפני עצמה · אם היא נמוכה, אף סדר חיפוש לא יציל אותה.
 */
function bandGroup(L) { const g = []; if (L >= 12) { for (let l = 12; l <= MAXL + 1; l++) g.push(l); } else g.push(L); return g; }
function isolatedCeiling(scn, S, idx, base, withTight) {
  const out = [];
  for (let L = 3; L <= 12; L++) {
    const E = SE.mkE(Object.assign({}, base, {
      bands: SE.bandsFromVec(new Array(MAXL + 2).fill(0)),
      bandsTight: SE.bandsFromVec(new Array(MAXL + 2).fill(0))
    }));
    const grp = bandGroup(L);
    const climb = cache => {
      let lo = 0, hi = GRID.length - 1, best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        for (const l of grp) setCoord(cache, l, GRID[mid]);
        if (!faOver(scn, E, 0)) { best = GRID[mid]; lo = mid + 1; } else hi = mid - 1;
      }
      for (const l of grp) setCoord(cache, l, best);
      return best;
    };
    const tMain = climb(E.tcache);
    const tTight = withTight ? climb(E.ttcache) : 0;
    const bl = SE.recallByLength(S, idx, E, scn.CN, scn.CT);
    const key = L >= 12 ? '12+' : String(L);
    const row = bl.find(e => e.len === key);
    out.push({ len: key, tMain, tTight, recall: row ? row.recall : null, nAccept: row ? row.nAccept : 0 });
  }
  return out;
}

/* ===== main ===== */
function main() {
  const T0 = Date.now();
  const rep = { generatedAt: new Date().toISOString(), argv: ARGS, stages: {} };

  say('טעינה וקדם-חישוב ...');
  const { perSet, langs } = EV.loadRows();

  /* מטמון השליליות החוצות-כרטיסים · אותו מפתח דאטהסט בדיוק של coverage.js. בנייה
     מחדש עולה כ-430 שניות, ולכן היא נעשית רק אם המפתח אינו תואם. */
  const CACHE = path.join(OUT, 'coverage-cross.json');
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const dsKey = (manifest.files || []).map(f => f.name + ':' + f.sha256).sort().join('|');
  let cross = null;
  if (fs.existsSync(CACHE)) {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (c.dsKey === dsKey) { cross = { rows: c.rows, stats: c.stats }; say('שליליות חוצות-כרטיסים · מהמטמון'); }
  }
  if (!cross) {
    say('בניית השליליות החוצות-כרטיסים ... (‏~430s)');
    cross = EV.buildCrossCard(langs, perSet);
    fs.writeFileSync(CACHE, JSON.stringify({ dsKey, stats: cross.stats, rows: cross.rows }));
  }

  const S = {}, X = {}, xI = {}, ALL = {}, NH = {}, HO = {}, AUX = {}, XAUX = {};
  for (const set of EV.SETS) {
    S[set] = EV.packSet(perSet[set]);
    X[set] = EV.packSet(cross.rows[set]);
    AUX[set] = SE.buildAux(S[set]);
    XAUX[set] = SE.buildAux(X[set]);
    xI[set] = idxAll(X[set]);
    ALL[set] = idxAll(S[set]);
    const nh = [], ho = [];
    for (let i = 0; i < S[set].N; i++) (S[set].hold[i] ? ho : nh).push(i);
    NH[set] = Int32Array.from(nh); HO[set] = Int32Array.from(ho);
  }
  const SHIP = shipParams();

  /* ================= שלב 1 · שער השקילות ================= */
  say('\n===== שלב 1 · שער השקילות · המעריך המורחב מול evolve =====');
  const rnd = mulberry32(20260815);
  const probes = [];
  for (const set of EV.SETS) probes.push({ set, name: 'shipped', P: CH.normalizeParams(SHIP[set]) });
  for (const set of EV.SETS) for (let k = 0; k < 3; k++) {
    const W = { sub: 1 };
    for (const [n, b] of Object.entries(W_BOUNDS)) W[n] = +(b.lo + rnd() * (b.hi - b.lo)).toFixed(4);
    const vec = new Array(MAXL + 2).fill(0).map(() => +(rnd() * 3).toFixed(2));
    probes.push({
      set, name: 'random#' + k,
      P: CH.normalizeParams({ minLen: Math.floor(rnd() * 5), vetoMargin: 1 + Math.floor(rnd() * 3), W, bands: SE.bandsFromVec(vec) })
    });
  }

  const eqRun = broken => {
    let diff = 0, checked = 0, acc = 0;
    for (const pr of probes) {
      /* ‏evolve.makeFastEval אינו יכול לבטא משטר צר · וקטור משקלים אחד, מטמון ספים אחד,
         ‏margin יחיד · ומאז 15.8 הוא **זורק** על גנים מדורגים במקום להתעלם מהם בשקט.
         השער הזה משווה ממילא רק את הצד הלא-מדורג (‏E1 למטה מקבל marginHard=marginSoft=
         vetoMargin), ולכן ההיטל נעשה כאן במפורש. זה אינו משנה אף החלטה: makeFastEval
         קורא bands/W/minLen/vetoMargin/useLexicon בלבד. */
      const flat = Object.assign({}, pr.P, { marginHard: pr.P.vetoMargin, marginSoft: pr.P.vetoMargin });
      const E0 = EV.makeFastEval(flat);
      const wv = SE.constW(pr.P.W);
      const E1 = SE.mkE(Object.assign({}, pr.P, {
        marginHard: broken === 'margin' ? 0 : pr.P.vetoMargin,
        marginSoft: pr.P.vetoMargin
      }));
      /* ‏--selftest 'drop' · ההידור מוותר על אחד מכל חמישה זוגות. זה בדיוק סוג האובדן
         השקט שהופך "אפס קבלות-שווא" לאמירה ריקה, ולכן הוא חייב להיראות. */
      const keep = broken === 'drop' ? (p => p % 5 !== 0) : null;
      for (const pack of [S[pr.set], X[pr.set]]) {
        if (!pack.N) continue;
        const C = SE.compile(pack, wv, keep);
        for (let i = 0; i < pack.N; i++) {
          const a = EV.decideOne(pack, i, E0);
          const b = SE.decideOne(pack, i, E1, C, C);
          checked++; if (a) acc++;
          if (a !== b) diff++;
        }
      }
    }
    return { checked, diff, acc };
  };
  const eq = eqRun(null);
  say(`  ${eq.checked} הכרעות נבדקו · ${eq.diff} פערים ${eq.diff ? '⛔' : '✅'} · מתוכן ${eq.acc} קבלות (השער אינו בודק "הכול נדחה")`);
  rep.stages.equivalence = eq;
  if (eq.diff || !eq.acc) { say('⛔ המעריך המורחב אינו מכיל את evolve · אין להמשיך'); process.exitCode = 1; return; }

  if (SELFTEST) {
    const t1 = eqRun('margin');
    say(`  --selftest · שוליים שבורים (‏marginHard=0) · ${t1.diff} פערים ${t1.diff > 0 ? '✅ (לשער יש שיניים)' : '⛔ (השער עיוור)'}`);
    if (!t1.diff) process.exitCode = 1;
    const t2 = eqRun('drop');
    say(`  --selftest · הידור שמאבד זוגות · ${t2.diff} פערים ${t2.diff > 0 ? '✅ (לשער יש שיניים)' : '⛔ (השער עיוור)'}`);
    if (!t2.diff) process.exitCode = 1;
  }

  /* ================= שלב 2 · אבחון הקיר ================= */
  say('\n===== שלב 2 · איזו שכבה בדיוק חוסמת את האנגלית הקצרה =====');
  const set = SET;
  const Sen = S[set], Xen = X[set];

  const gapTab = [];
  {
    const m = new Map();
    for (let i = 0; i < Sen.N; i++) {
      const f = Sen.flags[i];
      if (!(f & 8) || !(f & 16)) continue;                     // שורות accept מהימנות בלבד
      const L = Sen.kLen[i] >= 12 ? 12 : Sen.kLen[i];
      let e = m.get(L);
      if (!e) { e = { len: L === 12 ? '12+' : String(L), n: 0, gapLt1: 0, gap1: 0, gapGe2: 0 }; m.set(L, e); }
      const g = Sen.dOther[i] - Sen.dOwn[i];
      e.n++; if (g < 1) e.gapLt1++; else if (g === 1) e.gap1++; else e.gapGe2++;
    }
    for (const [, e] of Array.from(m.entries()).sort((a, b) => a[0] - b[0])) {
      e.shareGap1 = e.n ? e.gap1 / e.n : null;
      gapTab.push(e);
    }
  }
  say('  שורות accept אנגליות לפי אורך ולפי מרווח הדו-משמעות (‏gap = dOther − dOwn):');
  say('    אורך |     n | gap<1 | gap=1 | gap>=2 | חלקן של gap=1');
  for (const e of gapTab) say(`    ${String(e.len).padStart(4)} | ${String(e.n).padStart(5)} | ${String(e.gapLt1).padStart(5)} | ${String(e.gap1).padStart(5)} | ${String(e.gapGe2).padStart(6)} | ${pct(e.shareGap1)}`);

  const crossTab = [];
  {
    const m = new Map();
    for (let i = 0; i < Xen.N; i++) {
      const L = Xen.kLen[i] >= 12 ? 12 : Xen.kLen[i];
      let e = m.get(L);
      if (!e) { e = { len: L === 12 ? '12+' : String(L), n: 0, gap1: 0, gapGe2: 0 }; m.set(L, e); }
      const g = Xen.dOther[i] - Xen.dOwn[i];
      e.n++; if (g === 1) e.gap1++; else if (g >= 2) e.gapGe2++;
    }
    for (const [, e] of Array.from(m.entries()).sort((a, b) => a[0] - b[0])) crossTab.push(e);
  }
  say('  פולשים חוצי-כרטיסים לפי אורך: ' + crossTab.map(e => `${e.len}:${e.n}(gap1=${e.gap1})`).join(' '));

  /* ההוכחה שהסף אינו הקיר · הפרמטרים שנשלחו, עם סף 3.0 באורכים 2..6. */
  const shipP = CH.normalizeParams(SHIP[set]);
  const wvShip = SE.constW(shipP.W);
  const scnFull = compileFor(makeScn(Sen, ALL[set], Xen, xI[set]), AUX[set], XAUX[set], wvShip, null, null, null);
  const shipBase = { minLen: shipP.minLen, useLexicon: true, W: shipP.W, vetoMargin: shipP.vetoMargin, marginHard: shipP.vetoMargin, marginSoft: shipP.vetoMargin };
  const shipE = SE.mkE(Object.assign({}, shipBase, { bands: shipP.bands }));
  const shipPt = evalPoint(scnFull, shipE);

  const tcShip = SE.thrCache(shipP.bands);
  const openVec = new Array(MAXL + 2).fill(0);
  for (let l = 1; l <= MAXL; l++) openVec[l] = tcShip[l];
  openVec[MAXL + 1] = tcShip[255];
  for (let l = 2; l <= 6; l++) openVec[l] = T_MAX;
  const openE = SE.mkE(Object.assign({}, shipBase, { bands: SE.bandsFromVec(openVec) }));
  const openPt = evalPoint(scnFull, openE);
  const openBL = SE.recallByLength(Sen, ALL[set], openE, scnFull.CN, scnFull.CT);
  say(`  הפרמטרים שנשלחו · recall ${pct(shipPt.recall)} · FA ${shipPt.fa}`);
  say(`  אותם פרמטרים עם ספים 3.0 באורכים 2..6 · recall ${pct(openPt.recall)} · FA ${openPt.fa}`);
  say('    ' + openBL.filter(e => ['3', '4', '5', '6'].includes(e.len)).map(e => `${e.len}:${pct(e.recall)}`).join(' ') + '  ← אם זה לא זז, הקיר אינו הסף');

  const live = new Array(SE.K).fill(0);
  for (let p = 0; p < Sen.pairs; p++) for (let j = 0; j < SE.K; j++) if (Sen.pCnt[p * SE.K + j] > 0) live[j]++;
  const liveIdx = [];
  for (let j = 0; j < SE.K; j++) if (live[j] > 0) liveIdx.push(j);
  say('  אופרטורים חיים באנגלית: ' + OP_KEYS.map((k, j) => `${k}=${live[j]}`).join(' '));

  /* ⚠ הבסיס נמדד כאן מ-out/typo-rules.json **הנוכחי**. אם coverage.json נכתב לפני
     ריצת GA מאוחרת יותר, הטבלה בדוח הכיסוי מתארת פרמטרים אחרים · וזה חייב להיאמר,
     כי אחרת כל "שיפור" כאן הוא השוואה בין שתי נקודות מוצא שונות. */
  let coverBase = null;
  try {
    const cj = JSON.parse(fs.readFileSync(path.join(OUT, 'coverage.json'), 'utf8'));
    coverBase = cj.stages && cj.stages.shipped && cj.stages.shipped[set] ? cj.stages.shipped[set].fullSetRecall : null;
    if (coverBase != null && Math.abs(coverBase - shipPt.recall) > 1e-6) {
      say(`  ⚠ out/coverage.json מדד לבסיס ${pct(coverBase)} · typo-rules.json הנוכחי נותן ${pct(shipPt.recall)} · הפרמטרים שנשלחים השתנו מאז דוח הכיסוי`);
    }
  } catch (e) { /* אין דוח כיסוי · לא קריטי */ }

  rep.stages.wall = {
    gapByLength: gapTab, crossByLength: crossTab, coverageReportBaseline: coverBase,
    shipped: { recall: shipPt.recall, fa: shipPt.fa },
    thresholdsWideOpen: { recall: openPt.recall, fa: openPt.fa, byLength: openBL },
    liveOps: Object.fromEntries(OP_KEYS.map((k, j) => [k, live[j]]))
  };

  /* ================= שלב 3 · בתוך מרחב הגנים הקיים ================= */
  say('\n===== שלב 3 · האם מרחב הגנים הקיים כבר מכיל פתרון =====');
  const scnTrain = makeScn(Sen, NH[set], Xen, xI[set]);
  const scnHold = makeScn(Sen, HO[set], Xen, xI[set]);

  const wSamples = [{ name: 'shipped', W: shipP.W }];
  const NS = QUICK ? 30 : 150;
  for (let k = 0; k < NS; k++) {
    const W = { sub: 1 };
    for (const [n, b] of Object.entries(W_BOUNDS)) {
      const lo = Math.max(W_FLOOR, b.lo);
      W[n] = +(lo + rnd() * (b.hi - lo)).toFixed(4);
    }
    wSamples.push({ name: 'rand' + k, W });
  }
  const inSpace = [];
  for (const margin of [1, 2]) {
    let best = null;
    for (const ws of wSamples) {
      compileFor(scnTrain, AUX[set], XAUX[set], SE.constW(ws.W), null, null, null);
      shareCompile(scnTrain, scnFull); shareCompile(scnTrain, scnHold);
      for (const minLen of [0, 3]) {
        const t = tune(scnTrain, { minLen, useLexicon: true, W: ws.W, vetoMargin: margin, marginHard: margin, marginSoft: margin }, { main: true, tight: false });
        if (!t) continue;
        if (best && t.point.recall <= best.trainRecall) continue;
        const ho = evalPoint(scnHold, t.E);
        const fu = evalPoint(scnFull, t.E);
        best = {
          margin, minLen, W: ws.W, wName: ws.name,
          trainRecall: t.point.recall, trainFA: t.point.fa,
          holdoutRecall: ho.recall, holdoutFA: ho.fa, fullRecall: fu.recall, fullFA: fu.fa,
          vec: t.vecMain, params: t.params,
          byLengthFull: SE.recallByLength(Sen, ALL[set], t.E, scnFull.CN, scnFull.CT),
          byLengthHold: SE.recallByLength(Sen, HO[set], t.E, scnHold.CN, scnHold.CT)
        };
      }
    }
    inSpace.push(best);
    if (best) say(`  שוליים ${margin} · הטוב מ-${wSamples.length} וקטורי משקלים: אימון ${pct(best.trainRecall)} · holdout ${pct(best.holdoutRecall)} · סט מלא ${pct(best.fullRecall)} · FA ${best.fullFA} (‏W=${best.wName}, minLen=${best.minLen})`);
  }
  rep.stages.inSpace = inSpace;

  /* ================= שלב 4 · הגן החדש · שוליים מדורגים ================= */
  say('\n===== שלב 4 · שוליים מדורגים · משטר צר ל-gap=1 =====');
  /* הפירוק שמצדיק את הגן: כל שורה נופלת למשטר אחד בדיוק לפי ה-gap שלה, ולכן קבלות-
     השווא של שני המשטרים אינן מתחרות · "אפס קבלות-שווא" מתפרק לשתי בעיות בלתי תלויות. */
  const mkW = allow => {
    const W = {};
    for (const k of OP_KEYS) W[k] = allow.includes(k) ? 1 : EXPENSIVE;
    return W;
  };
  const subsets = [];
  for (let mask = 0; mask < (1 << liveIdx.length); mask++) {
    const allow = [];
    for (let b = 0; b < liveIdx.length; b++) if (mask & (1 << b)) allow.push(OP_KEYS[liveIdx[b]]);
    subsets.push(allow);
  }
  say(`  ${subsets.length} תת-קבוצות אופרטורים למשטר הצר (‏${liveIdx.length} אופרטורים חיים)`);

  const gradedBase = margin => ({ minLen: 0, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: margin });
  const graded = [];
  let bestGraded = null;
  for (const allow of subsets) {
    const WT = mkW(allow);
    compileFor(scnTrain, AUX[set], XAUX[set], wvShip, SE.constW(WT), null, null);
    shareCompile(scnTrain, scnFull); shareCompile(scnTrain, scnHold);
    const t = tune(scnTrain, gradedBase(2), { main: true, tight: true });
    if (!t) continue;
    const ho = evalPoint(scnHold, t.E), fu = evalPoint(scnFull, t.E);
    const rec = {
      allow: allow.join('+') || '(ריק · = שוליים 2 רגילים)',
      trainRecall: t.point.recall, holdoutRecall: ho.recall, holdoutFA: ho.fa,
      fullRecall: fu.recall, fullFA: fu.fa,
      vecTight: t.vecTight.slice(1, 14), vecMain: t.vecMain.slice(1, 14)
    };
    graded.push(rec);
    if (!bestGraded || t.point.recall > bestGraded.t.point.recall) bestGraded = { allow, WT, t, rec };
  }
  const sorted = graded.slice().sort((a, b) => b.trainRecall - a.trainRecall);
  say('  שש תת-הקבוצות הטובות ביותר (‏recall אימון):');
  for (const g of sorted.slice(0, 6)) say(`    ${g.allow.padEnd(48)} אימון ${pct(g.trainRecall)} · holdout ${pct(g.holdoutRecall)} · מלא ${pct(g.fullRecall)} · FA ${g.fullFA}`);
  const empty = graded.find(g => g.allow.startsWith('(ריק'));
  say(`  המשטר הצר כבוי (‏= שוליים 2 רגילים): אימון ${pct(empty && empty.trainRecall)}`);
  rep.stages.gradedMargin = { subsets: sorted, best: bestGraded ? bestGraded.rec : null };

  if (SELFTEST && bestGraded) {
    compileFor(scnFull, AUX[set], XAUX[set], wvShip, SE.constW(bestGraded.WT), null, null);
    const a = evalPoint(scnFull, bestGraded.t.E);
    const zeroTight = SE.mkE(Object.assign({}, bestGraded.t.params, { bandsTight: SE.bandsFromVec(new Array(MAXL + 2).fill(0)) }));
    const b = evalPoint(scnFull, zeroTight);
    say(`  --selftest · ביטול המשטר הצר · recall ${pct(a.recall)} → ${pct(b.recall)} ${b.recall < a.recall ? '✅ (לגן יש שיניים)' : '⛔ (הגן מת)'}`);
    if (!(b.recall < a.recall)) process.exitCode = 1;

    const wildE = SE.mkE({
      minLen: 0, useLexicon: true, marginHard: 1, marginSoft: 1,
      bands: SE.bandsFromVec(new Array(MAXL + 2).fill(3)), bandsTight: SE.bandsFromVec(new Array(MAXL + 2).fill(3))
    });
    const wild = evalPoint(scnFull, wildE);
    say(`  --selftest · גנום מתירני מייצר ${wild.fa} קבלות-שווא ${wild.fa > 0 ? '✅' : '⛔ (מבחן הקבילות ריק)'}`);
    if (!wild.fa) process.exitCode = 1;

    const hs = new Set(Array.from(HO[set]));
    let overlap = 0;
    for (const i of NH[set]) if (hs.has(i)) overlap++;
    say(`  --selftest · holdout ${HO[set].length} שורות · חפיפה עם האימון ${overlap} ${HO[set].length > 0 && overlap === 0 ? '✅' : '⛔'}`);
    if (!(HO[set].length > 0 && overlap === 0)) process.exitCode = 1;

    /* שיניים · אילוץ אפס קבלות-השווא חייב להיות **כובל**: אם שחרור התקציב אינו קונה
       recall, האילוץ אינו מגביל דבר וכל המספרים בדוח מודדים משהו אחר. */
    compileFor(scnTrain, AUX[set], XAUX[set], wvShip, SE.constW(bestGraded.WT), null, null);
    const t0 = tune(scnTrain, gradedBase(2), { main: true, tight: true, budget: 0 });
    const t9 = tune(scnTrain, gradedBase(2), { main: true, tight: true, budget: 100 });
    const bind = t9 && t0 && t9.point.recall > t0.point.recall + 1e-6;
    say(`  --selftest · תקציב 0 מול 100 · אימון ${pct(t0 && t0.point.recall)} מול ${pct(t9 && t9.point.recall)} ${bind ? '✅ (האילוץ כובל)' : '⛔ (האילוץ אינו כובל)'}`);
    if (!bind) process.exitCode = 1;
  }

  /* עידון · משקלים רציפים למשטר הצר, סביב תת-הקבוצה המנצחת. */
  let refined = null;
  if (bestGraded) {
    let best = { W: bestGraded.WT, t: bestGraded.t };
    const NR = QUICK ? 15 : 100;
    for (let k = 0; k < NR; k++) {
      const W = {};
      /* ‏sub לא יורד מתחת ל-1 · המסנן שבנה את הקבוצה החוצה-כרטיסים תמחר החלפה ב-1
         בדיוק, ולכן משקל נמוך יותר היה מוציא אותנו מהמעטפת שבתוכה הקבוצה שלמה. */
      for (const key of OP_KEYS) W[key] = bestGraded.allow.includes(key)
        ? (key === 'sub' ? +(1 + rnd()).toFixed(3) : +(W_FLOOR + rnd() * (2 - W_FLOOR)).toFixed(3))
        : EXPENSIVE;
      compileFor(scnTrain, AUX[set], XAUX[set], wvShip, SE.constW(W), null, null);
      const t = tune(scnTrain, gradedBase(2), { main: true, tight: true });
      if (t && t.point.recall > best.t.point.recall) best = { W, t };
    }
    compileFor(scnTrain, AUX[set], XAUX[set], wvShip, SE.constW(best.W), null, null);
    shareCompile(scnTrain, scnFull); shareCompile(scnTrain, scnHold);
    refined = {
      W: best.W, vecMain: best.t.vecMain, vecTight: best.t.vecTight, params: best.t.params,
      trainRecall: best.t.point.recall, holdoutRecall: evalPoint(scnHold, best.t.E).recall,
      fullRecall: evalPoint(scnFull, best.t.E).recall, fullFA: evalPoint(scnFull, best.t.E).fa
    };
    say(`  עידון משקלים רציפים · אימון ${pct(refined.trainRecall)} · holdout ${pct(refined.holdoutRecall)} · מלא ${pct(refined.fullRecall)} · FA ${refined.fullFA}`);
  }
  rep.stages.gradedRefined = refined;

  /* ================= שלב 5 · אות ראשונה ושלד עיצורים ================= */
  say('\n===== שלב 5 · שימור אות ראשונה / שלד עיצורים במשטר הצר =====');
  const filters = {
    none: null,
    firstLetter: aux => (p => aux.pFirst[p] === 1),
    skeleton: aux => (p => aux.pSkel[p] === 1),
    firstOrSkel: aux => (p => aux.pFirst[p] === 1 || aux.pSkel[p] === 1)
  };
  const filtRes = {};
  if (bestGraded) {
    const WT = refined ? refined.W : bestGraded.WT;
    for (const [name, f] of Object.entries(filters)) {
      compileFor(scnTrain, AUX[set], XAUX[set], wvShip, SE.constW(WT), null, f);
      shareCompile(scnTrain, scnFull); shareCompile(scnTrain, scnHold);
      const t = tune(scnTrain, gradedBase(2), { main: true, tight: true });
      if (!t) { filtRes[name] = null; continue; }
      const ho = evalPoint(scnHold, t.E), fu = evalPoint(scnFull, t.E);
      filtRes[name] = {
        trainRecall: t.point.recall, holdoutRecall: ho.recall, holdoutFA: ho.fa,
        fullRecall: fu.recall, fullFA: fu.fa, vecTight: t.vecTight.slice(1, 14),
        byLengthFull: SE.recallByLength(Sen, ALL[set], t.E, scnFull.CN, scnFull.CT),
        byLengthHold: SE.recallByLength(Sen, HO[set], t.E, scnHold.CN, scnHold.CT),
        params: t.params, WT
      };
      say(`  ${name.padEnd(12)} אימון ${pct(t.point.recall)} · holdout ${pct(ho.recall)} · מלא ${pct(fu.recall)} · FA ${fu.fa}`);
    }
  }
  rep.stages.filters = filtRes;

  /* ================= שלב 6 · אופרטור×אורך במשטר הרגיל ================= */
  say('\n===== שלב 6 · ההשערה המקורית · משקלים לפי אורך, שוליים רגילים =====');
  const opxlen = [];
  const vLong = wvShip(0);
  for (const split of [5, 6]) {
    for (const allow of [['adjSub', 'transpose', 'doubleLetter'], ['adjSub', 'doubleLetter'], ['adjSub', 'transpose', 'doubleLetter', 'del'], OP_KEYS.slice()]) {
      const vShort = SE.constW(mkW(allow))(0);
      const wvFor = L => (L <= split ? vShort : vLong);
      compileFor(scnTrain, AUX[set], XAUX[set], wvFor, null, null, null);
      shareCompile(scnTrain, scnFull);
      const t = tune(scnTrain, { minLen: 0, useLexicon: true, W: shipP.W, vetoMargin: shipP.vetoMargin, marginHard: shipP.vetoMargin, marginSoft: shipP.vetoMargin }, { main: true, tight: false });
      if (!t) continue;
      const bl = SE.recallByLength(Sen, ALL[set], t.E, scnFull.CN, scnFull.CT);
      const short = bl.filter(e => ['3', '4', '5'].includes(e.len));
      opxlen.push({ split, allow: allow.join('+'), trainRecall: t.point.recall, fullRecall: evalPoint(scnFull, t.E).recall, short: short.map(e => ({ len: e.len, recall: e.recall })) });
      say(`    split<=${split} · ${allow.join('+').padEnd(46)} אימון ${pct(t.point.recall)} · 3/4/5 = ${short.map(e => pct(e.recall)).join(' / ')}`);
    }
  }
  rep.stages.opByLength = opxlen;

  /* ================= שלב 7 · אופציית התקציב ================= */
  say('\n===== שלב 7 · אופציה מתומחרת · שוליים 1 עם תקציב קבלות-שווא =====');
  /* ⚠ זו **אינה** התוצאה. אפס קבלות-שווא הוא ברירת המחדל הקשיחה. */
  compileFor(scnTrain, AUX[set], XAUX[set], wvShip, null, null, null);
  shareCompile(scnTrain, scnFull);
  const budgets = QUICK ? [0, 20, 150] : [0, 5, 20, 50, 100, 150, 250, 420];
  const budgetCurve = [];
  for (const b of budgets) {
    const t = tune(scnTrain, { minLen: 0, useLexicon: true, W: shipP.W, vetoMargin: 1, marginHard: 1, marginSoft: 1 }, { main: true, tight: false, budget: b });
    if (!t) { budgetCurve.push({ budget: b, feasible: false }); continue; }
    const fu = evalPoint(scnFull, t.E);
    const bl = SE.recallByLength(Sen, ALL[set], t.E, scnFull.CN, scnFull.CT);
    const buckets = {};
    for (let i = 0; i < Sen.N; i++) {
      if (Sen.flags[i] & 8) continue;
      if (!SE.decideOne(Sen, i, t.E, scnFull.CN, scnFull.CT)) continue;
      const w = String(Sen.rows[i].why).split(':')[0];
      buckets[w] = (buckets[w] || 0) + 1;
    }
    let xfa = 0;
    for (let i = 0; i < Xen.N; i++) if (SE.decideOne(Xen, i, t.E, scnFull.XCN, scnFull.XCT)) xfa++;
    if (xfa) buckets['cross-card-bank'] = xfa;
    budgetCurve.push({
      budget: b, feasible: true, trainRecall: t.point.recall, fullRecall: fu.recall,
      fullFA: fu.fa, setFA: fu.sfa, crossFA: fu.xfa, buckets,
      byLength: bl.map(e => ({ len: e.len, recall: e.recall, nAccept: e.nAccept }))
    });
    say(`  תקציב ${String(b).padStart(3)} · אימון ${pct(t.point.recall)} · מלא ${pct(fu.recall)} · FA ${fu.fa} (סט ${fu.sfa}, חוצה ${fu.xfa}) · ${JSON.stringify(buckets)}`);
  }
  rep.stages.budget = budgetCurve;

  /* ================= שלב 7ב · התקרה המבודדת לכל אורך ================= */
  say('\n===== שלב 7ב · תקרת כל רצועת אורך בפני עצמה (אפס קבלות-שווא) =====');
  const iso = {};
  {
    const m1 = inSpace[0], m2 = inSpace[1];
    const cfgs = [];
    if (m2) cfgs.push({ name: 'שוליים 2 · W שנשלח', W: m2.W, base: { minLen: 0, useLexicon: true, marginHard: 2, marginSoft: 2 }, tight: false, WT: null, filt: null });
    if (m1) cfgs.push({ name: 'שוליים 1 · W הטוב בתוך המרחב', W: m1.W, base: { minLen: 0, useLexicon: true, marginHard: 1, marginSoft: 1 }, tight: false, WT: null, filt: null });
    if (bestGraded) cfgs.push({ name: 'שוליים מדורגים + מסנן firstLetter', W: shipP.W, base: { minLen: 0, useLexicon: true, marginHard: 1, marginSoft: 2 }, tight: true, WT: (refined ? refined.W : bestGraded.WT), filt: filters.firstLetter });
    for (const c of cfgs) {
      compileFor(scnFull, AUX[set], XAUX[set], SE.constW(c.W), c.WT ? SE.constW(c.WT) : null, null, c.filt);
      iso[c.name] = isolatedCeiling(scnFull, Sen, ALL[set], c.base, c.tight);
      say(`  ${c.name}: ` + iso[c.name].map(e => `${e.len}:${pct(e.recall)}`).join(' '));
    }
  }
  rep.stages.isolatedCeiling = iso;

  /* ================= שלב 8 · האם זה תופעה אנגלית או תכונה של הבעיה ================= */
  say('\n===== שלב 8 · אותו גן על he-word ועל gloss =====');
  /* ⚠ ל-gloss אין קבוצה חוצת-כרטיסים (‏0 שורות), ולכן אילוץ אפס-קבלות-השווא שם מודד
     פחות ממה שהוא מודד באנגלית. השער הממצה נשאר הסמכות · זה נאמר ולא נבלע. */
  const others = {};
  /* שאר הסטים, בסדר של EV.SETS · בברירת המחדל זה בדיוק ['he-word','gloss'] שהיה כאן ביד. */
  for (const s2 of EV.SETS.filter(x => x !== set)) {
    const P2 = CH.normalizeParams(SHIP[s2]);
    const wv2 = SE.constW(P2.W);
    const scn2 = makeScn(S[s2], NH[s2], X[s2], xI[s2]);
    const scn2f = makeScn(S[s2], ALL[s2], X[s2], xI[s2]);
    const scn2h = makeScn(S[s2], HO[s2], X[s2], xI[s2]);
    compileFor(scn2f, AUX[s2], XAUX[s2], wv2, null, null, null);
    const base2 = SE.mkE({ minLen: P2.minLen, useLexicon: true, bands: P2.bands, marginHard: P2.vetoMargin, marginSoft: P2.vetoMargin });
    const shipRec = evalPoint(scn2f, base2);
    const live2 = new Array(SE.K).fill(0);
    for (let p = 0; p < S[s2].pairs; p++) for (let j = 0; j < SE.K; j++) if (S[s2].pCnt[p * SE.K + j] > 0) live2[j]++;
    const liveIdx2 = [];
    for (let j = 0; j < SE.K; j++) if (live2[j] > 0) liveIdx2.push(j);
    let best2 = null;
    for (let mask = 0; mask < (1 << liveIdx2.length); mask++) {
      const allow = [];
      for (let b = 0; b < liveIdx2.length; b++) if (mask & (1 << b)) allow.push(OP_KEYS[liveIdx2[b]]);
      compileFor(scn2, AUX[s2], XAUX[s2], wv2, SE.constW(mkW(allow)), null, null);
      shareCompile(scn2, scn2f); shareCompile(scn2, scn2h);
      const t = tune(scn2, { minLen: 0, useLexicon: true, W: P2.W, vetoMargin: 1, marginHard: 1, marginSoft: 2 }, { main: true, tight: true });
      if (!t) continue;
      if (!best2 || t.point.recall > best2.trainRecall) {
        best2 = { allow: allow.join('+') || '(ריק)', trainRecall: t.point.recall, holdoutRecall: evalPoint(scn2h, t.E).recall, fullRecall: evalPoint(scn2f, t.E).recall, fullFA: evalPoint(scn2f, t.E).fa, vecTight: t.vecTight.slice(1, 14) };
      }
    }
    others[s2] = { shippedFullRecall: shipRec.recall, crossRows: X[s2].N, best: best2 };
    say(`  ${s2}: שנשלח ${pct(shipRec.recall)} → שוליים מדורגים ${best2 ? pct(best2.fullRecall) : '—'} (‏holdout ${best2 ? pct(best2.holdoutRecall) : '—'}, FA ${best2 ? best2.fullFA : '—'}, מחלקות ${best2 ? best2.allow : '—'}) · שורות חוצות-כרטיסים ${X[s2].N}`);
  }
  rep.stages.otherSets = others;

  /* ================= סיכום ================= */
  say('\n===== סיכום · recall אנגלי לפי אורך, אפס קבלות-שווא =====');
  compileFor(scnFull, AUX[set], XAUX[set], wvShip, null, null, null);
  const shipBLfull = SE.recallByLength(Sen, ALL[set], shipE, scnFull.CN, scnFull.CT);
  const shipBLhold = SE.recallByLength(Sen, HO[set], shipE, scnFull.CN, scnFull.CT);

  const candidates = [];
  for (const v of inSpace) if (v) candidates.push({
    name: `בתוך מרחב הגנים · שוליים ${v.margin}`, holdoutRecall: v.holdoutRecall, fullRecall: v.fullRecall,
    byLengthFull: v.byLengthFull, byLengthHold: v.byLengthHold, params: v.params, W: v.W, needsCheckerChange: false,
    fullFA: v.fullFA, holdoutFA: v.holdoutFA
  });
  for (const [name, f] of Object.entries(filtRes)) if (f) candidates.push({
    name: `שוליים מדורגים · מסנן ${name}`, filter: name, holdoutRecall: f.holdoutRecall, fullRecall: f.fullRecall,
    byLengthFull: f.byLengthFull, byLengthHold: f.byLengthHold, params: f.params, W: shipP.W, WT: f.WT,
    needsCheckerChange: true
  });
  candidates.sort((a, b) => b.holdoutRecall - a.holdoutRecall);
  const win = candidates[0];
  /* המועמד הטוב ביותר ש**אינו** דורש שינוי בבודק · זה מה שאפשר לשלוח היום. */
  const winShippable = candidates.filter(c => !c.needsCheckerChange)[0] || null;

  const mapOf = arr => Object.fromEntries(arr.map(e => [e.len, e.recall]));
  const sf = mapOf(shipBLfull), sh = mapOf(shipBLhold);
  const wf = win ? mapOf(win.byLengthFull) : {}, wh = win ? mapOf(win.byLengthHold) : {};
  const cf = winShippable ? mapOf(winShippable.byLengthFull) : {}, chd = winShippable ? mapOf(winShippable.byLengthHold) : {};
  const nOf = Object.fromEntries(shipBLfull.map(e => [e.len, e.nAccept]));
  const tbl = [];
  say('  אורך | accept | שנשלח | בתוך-המרחב | מדורג | שנשלח(ho) | בתוך-המרחב(ho) | מדורג(ho)');
  for (const e of shipBLfull) {
    tbl.push({
      len: e.len, nAccept: nOf[e.len], shippedFull: sf[e.len], inSpaceFull: cf[e.len], bestFull: wf[e.len],
      shippedHold: sh[e.len], inSpaceHold: chd[e.len], bestHold: wh[e.len]
    });
    say(`  ${String(e.len).padStart(4)} | ${String(nOf[e.len]).padStart(6)} | ${pct(sf[e.len]).padStart(7)} | ${pct(cf[e.len]).padStart(10)} | ${pct(wf[e.len]).padStart(7)} | ${pct(sh[e.len]).padStart(9)} | ${pct(chd[e.len]).padStart(14)} | ${pct(wh[e.len]).padStart(9)}`);
  }

  /* כמה ערכים במאגר מקבלים סובלנות כלשהי · השאלה "כל המילים האנגליות" נמדדת בערכים
     ולא רק בשורות. */
  const entryCov = (E, CN, CT) => {
    const m = new Map();
    for (let i = 0; i < Sen.N; i++) {
      const f = Sen.flags[i];
      if (!(f & 8) || !(f & 16)) continue;                    // שורות accept מהימנות בלבד
      const id = String(Sen.rows[i].term) + '|' + String(Sen.rows[i].unit);
      const ok = SE.decideOne(Sen, i, E, CN, CT) ? 1 : 0;
      m.set(id, (m.get(id) || 0) | ok);
    }
    let withTol = 0;
    for (const v of m.values()) if (v) withTol++;
    return { entries: m.size, withTolerance: withTol };
  };
  const covShip = entryCov(shipE, scnFull.CN, scnFull.CT);
  say(`  ערכים אנגליים עם סובלנות כלשהי · שנשלח ${covShip.withTolerance}/${covShip.entries}`);
  let covWin = null;
  if (win) {
    if (win.needsCheckerChange) compileFor(scnFull, AUX[set], XAUX[set], wvShip, SE.constW(win.WT), null, filters[win.filter] || null);
    else compileFor(scnFull, AUX[set], XAUX[set], SE.constW(win.W), null, null, null);
    covWin = entryCov(SE.mkE(win.params), scnFull.CN, scnFull.CT);
    say(`  ערכים אנגליים עם סובלנות כלשהי · הטוב ביותר ${covWin.withTolerance}/${covWin.entries}`);
  }

  rep.stages.summary = {
    shipped: { fullRecall: shipPt.recall, byLengthFull: shipBLfull, byLengthHold: shipBLhold, entryCoverage: covShip },
    candidates: candidates.map(c => ({ name: c.name, holdoutRecall: c.holdoutRecall, fullRecall: c.fullRecall, needsCheckerChange: c.needsCheckerChange })),
    winner: win ? { name: win.name, holdoutRecall: win.holdoutRecall, fullRecall: win.fullRecall, needsCheckerChange: win.needsCheckerChange, params: win.params, W: win.W, WT: win.WT || null, entryCoverage: covWin } : null,
    bestShippableToday: winShippable ? { name: winShippable.name, holdoutRecall: winShippable.holdoutRecall, fullRecall: winShippable.fullRecall, params: winShippable.params, W: winShippable.W } : null,
    table: tbl
  };

  /* ===== קובץ מועמד · רק אם יש שיפור שאפשר לשלוח בלי לגעת בבודק ===== */
  let wroteCandidate = false;
  if (winShippable) {
    /* ⚠ ההשוואה חייבת להיות על אותו קומפיילר · scnFull מהודר כרגע למשקלים של המנצח,
       ולכן הוא מהודר מחדש למשקלים שנשלחו לפני שמודדים את הבסיס. */
    compileFor(scnFull, AUX[set], XAUX[set], wvShip, null, null, null);
    const holdShip = SE.evalSubset(Sen, HO[set], shipE, scnFull.CN, scnFull.CT).recall;
    /* ⚠ מועמד חייב להיות נקי על **הסט המלא**, לא רק על שורות האימון שעליהן כויל.
       ‏tune מבטיח אפס קבלות-שווא רק על מה שהוא ראה, וזה בדיוק הכשל שחזר בפרויקט הזה
       פעמיים (‏gloss/fold1, והנקודה העברית). נמדד: ב-he-word הנקודה הטובה ביותר
       "בתוך המרחב" נותנת holdout 18.38% עם **קבלת-שווא אחת**, והיא נכתבה כמועמד לפני
       השורה הזאת. קובץ ששמו "מועמד" ונושא קבלת-שווא הוא מלכודת, לא ארטיפקט.
       ‏(ב-en-word הנקודה הזאת נקייה, ולכן התנאי אינו משנה שם דבר · נמדד ולא הוצהר.) */
    const dirty = (winShippable.fullFA || 0) > 0 || (winShippable.holdoutFA || 0) > 0;
    if (dirty) {
      say(`  לא נכתב קובץ מועמד · הטוב ביותר שאפשר לשלוח נושא ${winShippable.fullFA} קבלות-שווא בסט המלא (‏${winShippable.holdoutFA} מהן ב-holdout)`);
    } else if (winShippable.holdoutRecall > holdShip + 1e-9) {
      const others2 = EV.SETS.filter(x => x !== set).join(' ו-');
      const out = { ver: 'typo-lab/evolve/v1+shortword-candidate', generatedAt: new Date().toISOString(), note: `${set} בלבד · ${others2} זהים בית-בית ל-out/typo-rules.json`, params: {} };
      for (const s2 of EV.SETS) out.params[s2] = SHIP[s2];
      const P = winShippable.params;
      out.params[set] = {
        minLen: P.minLen, vetoMargin: P.vetoMargin, useLexicon: true,
        bands: P.bands.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: b.t })),
        W: Object.assign({ sub: 1 }, winShippable.W)
      };
      fs.writeFileSync(path.join(OUT, `shortword-candidate-rules${FSUF}.json`), JSON.stringify(out, null, 1));
      wroteCandidate = true;
      say(`  נכתב out/shortword-candidate-rules${FSUF}.json · holdout ${pct(winShippable.holdoutRecall)} מול ${pct(holdShip)} שנשלח`);
    } else {
      say(`  לא נכתב קובץ מועמד · הטוב ביותר שאפשר לשלוח (‏${pct(winShippable.holdoutRecall)}) אינו עוקף את מה שנשלח (‏${pct(holdShip)})`);
    }
  }
  rep.candidateWritten = wroteCandidate;

  rep.shippedSource = SHIP_META;
  rep.set = set;
  rep.wallClockSec = (Date.now() - T0) / 1000;
  fs.writeFileSync(path.join(OUT, `shortword${FSUF}.json`), JSON.stringify(rep, null, 1));
  /* הדוח מנוסח על אנגלית מהכותרת ועד הדוגמאות (‏teeth/tenth), ולכן הוא נכתב רק לסט
     שהוא נכתב עבורו. סט אחר מקבל JSON, ומי שרוצה דוח עבורו כותב אותו במקום הנכון. */
  if (set === 'en-word') {
    writeReport(rep);
    say(`\nנכתבו out/shortword.json ו-out/shortword-report.md · ${rep.wallClockSec.toFixed(1)}s`);
  } else {
    say(`\nנכתב out/shortword${FSUF}.json · ${rep.wallClockSec.toFixed(1)}s (הדוח המנוסח קיים ל-en-word בלבד)`);
  }
  return rep;
}

/* ===== הדוח ===== */
function writeReport(rep) {
  const L = [];
  const p = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
  const s = rep.stages;
  const w = s.summary && s.summary.winner;
  const ship = s.summary && s.summary.shipped;
  const shipTag = TICK + 'vetoMargin = 2' + TICK;

  L.push('# מילים אנגליות קצרות · האם אפשר לפתוח אותן, ובאיזה מחיר');
  L.push('');
  L.push(`נוצר ${rep.generatedAt} · ${(rep.wallClockSec || 0).toFixed(1)} שניות`);
  L.push('');
  L.push('שחזור: `node typo-lab/shortword.js` · שערים: `node typo-lab/shortword.js --selftest`');
  L.push('');
  if (rep.shippedSource) L.push(`הבסיס נקרא מ-\`out/typo-rules.json\` (‏${rep.shippedSource.ver} · ${rep.shippedSource.generatedAt} · נכתב לאחרונה ${rep.shippedSource.mtime}). הקובץ הזה נקרא פעם אחת בתחילת הריצה; אם סוכן אחר כתב אותו מחדש בינתיים, כל המספרים כאן מתייחסים לגרסה שנקראה.`);
  L.push('');
  L.push('## פסק הדין');
  L.push('');
  L.push(`הפרמטרים שנשלחו נותנים ${p(ship && ship.fullRecall)} על הסט המלא. הטוב ביותר שנמצא כאן הוא **${w ? w.name : '—'}** — ${p(w && w.fullRecall)} על הסט המלא ו-${p(w && w.holdoutRecall)} על ה-holdout, באפס קבלות-שווא. ${w && w.needsCheckerChange ? 'הוא דורש שינוי ב-`lib/checker.js` (ובתאומו ב-`app.js`) ולכן אינו נשלח כמו שהוא.' : 'הוא חי בתוך מרחב הגנים הקיים ואינו דורש שינוי קוד.'}`);
  L.push('');
  if (s.summary && s.summary.bestShippableToday) {
    const b = s.summary.bestShippableToday;
    L.push(`הטוב ביותר שאפשר לשלוח **בלי לגעת בבודק**: ${b.name} — ${p(b.fullRecall)} סט מלא, ${p(b.holdoutRecall)} holdout.`);
    L.push('');
  }
  L.push(`קובץ מועמד ${rep.candidateWritten ? '**נכתב** ל-`out/shortword-candidate-rules.json`' : '**לא נכתב** — לא נמצא שיפור שאפשר לשלוח בלי לשנות את הבודק'}.`);
  L.push('');

  /* התשובה לשאלה שנשאלה · לא נגזרת מהטבלאות אלא נאמרת. */
  {
    const b = (s.budget || []).filter(x => x.feasible);
    const top = b.length ? b.reduce((a, c) => (c.fullRecall > a.fullRecall ? c : a)) : null;
    const iso = s.isolatedCeiling || {};
    const isoG = iso['שוליים מדורגים + מסנן firstLetter'] || [];
    const at5 = isoG.find(e => e.len === '5');
    L.push('### התשובה לשאלה "האם אפשר להרחיב לכל המילים האנגליות"');
    L.push('');
    L.push(`**לא, לא באפס קבלות-שווא.** התקרה שנמדדה עם הגן החדש היא ${p(w && w.fullRecall)} (‏${p(w && w.holdoutRecall)} ב-holdout), ומספר הערכים שמקבלים סובלנות כלשהי עולה מ-${ship && ship.entryCoverage ? ship.entryCoverage.withTolerance : '—'} ל-${w && w.entryCoverage ? w.entryCoverage.withTolerance : '—'} מתוך ${ship && ship.entryCoverage ? ship.entryCoverage.entries : '—'}.`);
    L.push('');
    if (top) L.push(`**כן, בתקציב.** ${p(top.fullRecall)} · כלומר כמעט כל שורת accept אנגלית · עולה ${top.fullFA} קבלות-שווא: ${Object.entries(top.buckets).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(', ')}. מתוכן ${top.crossFA} הן התנגשויות מאגר אמיתיות — מחרוזת שהיא צורה קבילה של ערך אחר, שהתקבלה על הערך הזה. זה המחיר, והוא אינו רעש: זו בדיוק התשובה השגויה שאילוץ אפס-קבלות-השווא נועד למנוע.`);
    L.push('');
    const t3 = (s.summary.table || []).find(r => r.len === '3');
    const t4 = (s.summary.table || []).find(r => r.len === '4');
    const t5 = (s.summary.table || []).find(r => r.len === '5');
    L.push(`**הקיר שנשאר גם עם הגן החדש הוא אורך 5** — ${at5 ? p(at5.recall) : '—'} גם כשפותחים את הרצועה הזאת לבדה עד הסוף, מול ${t5 ? p(t5.shippedFull) : '—'} שכבר יש היום. כלומר הגן החדש קונה שם כמעט כלום. אורך 3 ואורך 4 דווקא **כן** נפתחים: ${t3 ? p(t3.shippedFull) : '—'} → ${t3 ? p(t3.bestFull) : '—'} ו-${t4 ? p(t4.shippedFull) : '—'} → ${t4 ? p(t4.bestFull) : '—'}. הצפיפות סביב מילים בנות חמש אותיות במאגר הזה — במיוחד המספרים הסודרים ומילות ה-th (‏teeth/tenth/teenth, sixth/south/sight, seventh/event/sheet) — אינה ניתנת להפרדה באף תכונה שנבדקה כאן.`);
    L.push('');
  }

  L.push('**שלב צמצום.** כל נקודה שמדווחת כאן עברה מעבר שמוריד כל סף לערך הקטן ביותר ששומר על **בדיוק אותו** מספר קבלות אמת באימון. בלעדיו הספים באורכים הארוכים נעצרים בתקרת הרשת פשוט מפני שאין שם שליליות שיעצרו אותם (‏0 שורות חוצות-כרטיסים מעל אורך 8) — כלומר פרמטר שנראה מכויל ולמעשה רק לא נבדק. הצמצום אינו יכול לשנות את ה-recall באימון; מה שהוא כן משנה זה את ה-recall ב-holdout, וההפרש הזה הוא בדיוק כמה מהשיפור לכאורה נשען על ספים שאף שורת אימון אינה תומכת בהם.');
  L.push('');
  L.push('## הקיר · מה בדיוק חוסם אורך 3–5');
  L.push('');
  L.push('שורות ה-accept האנגליות לפי אורך ולפי מרווח הדו-משמעות `gap = dOther − dOwn`:');
  L.push('');
  L.push('| אורך | שורות accept | gap<1 | gap=1 | gap≥2 | חלקן של gap=1 |');
  L.push('|---|---|---|---|---|---|');
  for (const e of (s.wall.gapByLength || [])) L.push(`| ${e.len} | ${e.n} | ${e.gapLt1} | ${e.gap1} | ${e.gapGe2} | ${p(e.shareGap1)} |`);
  L.push('');
  L.push(`הפרמטרים שנשלחו רצים עם ${shipTag}, כלומר הם דוחים כל שורה שבה \`gap < 2\` — לפני שמישהו הסתכל על מרחק בכלל. הטבלה אומרת שזה מוחק כמעט את כל האורכים הקצרים.`);
  L.push('');
  L.push(`ההוכחה שהסף אינו הקיר: אותם פרמטרים בדיוק, עם סף 3.0 (תקרת הרשת) באורכים 2–6, נותנים ${p(s.wall.thresholdsWideOpen.recall)} עם ${s.wall.thresholdsWideOpen.fa} קבלות-שווא. כלומר פתיחת הספים לרווחה קונה שבריר אחוז של recall וקונה איתו קבלות-שווא — היא אינה מזיזה את האורכים הקצרים, כי השכבה שחוסמת אותם רצה לפניהם.`);
  if (s.wall.coverageReportBaseline != null && Math.abs(s.wall.coverageReportBaseline - (ship && ship.fullRecall)) > 1e-6) {
    L.push('');
    L.push(`⚠ **הבסיס כאן אינו הבסיס שבדוח הכיסוי.** \`out/coverage.json\` מדד ${p(s.wall.coverageReportBaseline)} על הסט המלא, ואילו \`out/typo-rules.json\` הנוכחי נותן ${p(ship && ship.fullRecall)} — הפרמטרים שנשלחים השתנו מאז. כל ההשוואות בקובץ הזה הן מול הפרמטרים **הנוכחיים**, ולכן טבלת האורכים כאן שונה מזו שבדוח הכיסוי.`);
  }
  L.push('');
  L.push('פולשים חוצי-כרטיסים לפי אורך: ' + (s.wall.crossByLength || []).map(e => `${e.len}: ${e.n} (‏gap=1: ${e.gap1})`).join(' · '));
  L.push('');
  L.push('אופרטורים חיים באנגלית: ' + Object.entries(s.wall.liveOps || {}).map(([k, v]) => `${k}=${v}`).join(' · ') + '. אופרטור עם 0 הוא גן מת בסט הזה.');
  L.push('');

  L.push('## שלב 3 · מרחב הגנים הקיים');
  L.push('');
  L.push('חיפוש אקראי על שבעת גני המשקל (בגבולות `evolve.GENES`) עם טיפוס-קואורדינטות על שנים-עשר ספי האורך, לכל ערך שוליים.');
  L.push('');
  L.push('| שוליים | minLen | recall אימון | recall holdout | recall סט מלא | FA |');
  L.push('|---|---|---|---|---|---|');
  for (const v of (s.inSpace || [])) if (v) L.push(`| ${v.margin} | ${v.minLen} | ${p(v.trainRecall)} | ${p(v.holdoutRecall)} | ${p(v.fullRecall)} | ${v.fullFA} |`);
  L.push('');

  L.push('## שלב 4 · הגן החדש · שוליים מדורגים');
  L.push('');
  L.push('במקום מספר שלם אחד `vetoMargin`, שני מספרים: `marginHard` (מתחתיו נדחה תמיד — נשאר 1, הכרעת חגי) ו-`marginSoft`. בין השניים נכנסים ל**משטר צר** עם וקטור ספים נפרד (`bandsTight`) ווקטור משקלים נפרד (`WTight`). `marginSoft === marginHard` משחזר בדיוק את ההתנהגות הקיימת, וזה מה ששער השקילות בשלב 1 מוכיח.');
  L.push('');
  L.push('כל שורה נופלת למשטר אחד בדיוק לפי ה-`gap` שלה, ולכן קבלות-השווא של שני המשטרים אינן מתחרות: אילוץ אפס קבלות-שווא מתפרק לשתי בעיות בלתי תלויות.');
  L.push('');
  L.push('| מחלקות אופרטורים מותרות במשטר הצר | recall אימון | recall holdout | recall סט מלא | FA |');
  L.push('|---|---|---|---|---|');
  for (const g of (s.gradedMargin.subsets || []).slice(0, 14)) L.push(`| ${g.allow} | ${p(g.trainRecall)} | ${p(g.holdoutRecall)} | ${p(g.fullRecall)} | ${g.fullFA} |`);
  L.push('');
  if (s.gradedRefined) L.push(`עידון משקלים רציפים למחלקות המנצחות: אימון ${p(s.gradedRefined.trainRecall)} · holdout ${p(s.gradedRefined.holdoutRecall)} · סט מלא ${p(s.gradedRefined.fullRecall)} · FA ${s.gradedRefined.fullFA}.`);
  L.push('');

  L.push('## שלב 5 · מסנני מבנה במשטר הצר');
  L.push('');
  L.push('| מסנן | recall אימון | recall holdout | recall סט מלא | FA |');
  L.push('|---|---|---|---|---|');
  for (const [k, v] of Object.entries(s.filters || {})) if (v) L.push(`| ${k} | ${p(v.trainRecall)} | ${p(v.holdoutRecall)} | ${p(v.fullRecall)} | ${v.fullFA} |`);
  L.push('');

  L.push('## שלב 6 · ההשערה המקורית · אופרטור×אורך בלי לגעת בשוליים');
  L.push('');
  L.push('| חתך אורך | מחלקות מותרות באורך הקצר | recall אימון | 3 / 4 / 5 |');
  L.push('|---|---|---|---|');
  for (const o of (s.opByLength || [])) L.push(`| ≤${o.split} | ${o.allow} | ${p(o.trainRecall)} | ${o.short.map(e => p(e.recall)).join(' / ')} |`);
  L.push('');

  L.push('## הטבלה שהשאלה נשאלה עליה · recall אנגלי לפי אורך, אפס קבלות-שווא');
  L.push('');
  L.push('שלוש נקודות: מה שנשלח, הטוב ביותר **בתוך מרחב הגנים הקיים** (נשלח היום, בלי שינוי קוד), והטוב ביותר עם הגן החדש (דורש שינוי בבודק).');
  L.push('');
  L.push('| אורך | שורות accept | שנשלח | בתוך-המרחב | מדורג | שנשלח (ho) | בתוך-המרחב (ho) | מדורג (ho) |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of (s.summary.table || [])) L.push(`| ${r.len} | ${r.nAccept} | ${p(r.shippedFull)} | ${p(r.inSpaceFull)} | ${p(r.bestFull)} | ${p(r.shippedHold)} | ${p(r.inSpaceHold)} | ${p(r.bestHold)} |`);
  L.push('');
  L.push('⚠ **המחיר ברצועות אחרות אינו אפס.** המועמד שבתוך המרחב אינו שיפור פארטו: הוא מרוויח באורכים הקצרים ובזנב הארוך ומפסיד באמצע. מי שמסתכל על מספר אחד לא יראה את זה.');
  L.push('');
  if (s.isolatedCeiling) {
    L.push('### תקרת כל רצועה בפני עצמה');
    L.push('');
    L.push('כדי שלא נסיק "אורך 5 נמוך" ממשהו שהוא תכונה של סדר החיפוש: כאן נפתחת **רצועה אחת בלבד** בכל פעם, כל השאר באפס, וסף הרצועה מטופס למקסימום שעדיין נותן אפס קבלות-שווא. תוצאה נמוכה כאן היא תכונה של הבעיה ולא של החיפוש.');
    L.push('');
    const names = Object.keys(s.isolatedCeiling);
    const lens = (s.isolatedCeiling[names[0]] || []).map(e => e.len);
    L.push('| תצורה | ' + lens.join(' | ') + ' |');
    L.push('|---|' + lens.map(() => '---').join('|') + '|');
    for (const n of names) L.push(`| ${n} | ` + s.isolatedCeiling[n].map(e => p(e.recall)).join(' | ') + ' |');
    L.push('');
    L.push('⚠ עמודת `12+` אינה בת-השוואה לטבלה שמעליה: כאן היא פותחת את כל האורכים 12–18 ו-∞ **בסף אחד**, בעוד שהפתרון המשולב נותן לכל אחד מהם סף משלו. בשאר העמודות ההשוואה ישירה, וההתאמה כמעט מושלמת — כלומר הפתרון המשולב אכן יושב על תקרת כל רצועה, ולא מפספס בגלל סדר החיפוש.');
    L.push('');
  }
  if (ship && ship.entryCoverage) L.push(`ערכים אנגליים במאגר שמקבלים סובלנות כלשהי: ${ship.entryCoverage.withTolerance}/${ship.entryCoverage.entries} במה שנשלח${w && w.entryCoverage ? `, ${w.entryCoverage.withTolerance}/${w.entryCoverage.entries} בטוב ביותר` : ''}.`);
  L.push('');
  if (w && w.needsCheckerChange) {
    L.push('### המפרט המלא של המנצח · מה בדיוק צריך להיכנס ל-TYPO_PARAMS');
    L.push('');
    L.push('```json');
    L.push(JSON.stringify({
      minLen: w.params.minLen, marginHard: w.params.marginHard, marginSoft: w.params.marginSoft,
      W: Object.assign({ sub: 1 }, w.W), WTight: w.WT,
      bands: w.params.bands.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: b.t })),
      bandsTight: w.params.bandsTight.map(b => ({ maxLen: isFinite(b.maxLen) ? b.maxLen : null, t: b.t })),
      tightRequiresFirstLetter: /firstLetter|firstOrSkel/.test(w.name)
    }, null, 1));
    L.push('```');
    L.push('');
    L.push('השינוי הנדרש ב-`lib/checker.js` (ובתאום שלו ב-`app.js`): בתוך `decide`, במקום `if (dOther - dOwn < P.vetoMargin) return collision`, לחשב `gap` פעם אחת, לדחות כש-`gap < marginHard`, ולבחור בין `(bands, W)` לבין `(bandsTight, WTight)` לפי `gap < marginSoft`. שני קריאות `nearestOther` אין כאן — הריצה כבר מחשבת את `dOther` היום בכל פעם ש-`vetoMargin > 0`, ולכן **אין עלות ריצה חדשה**, רק קבועים נוספים. מסנן האות הראשונה הוא השוואת תו אחד. מה שכן צריך: בנייה מחדש של `out/golden.jsonl` והרצת השער הממצה.');
    L.push('');
  }
  if (s.otherSets) {
    L.push('### אותו גן על שאר הסטים');
    L.push('');
    L.push('| סט | שנשלח | שוליים מדורגים (סט מלא) | holdout | FA | מחלקות מותרות | שורות חוצות-כרטיסים |');
    L.push('|---|---|---|---|---|---|---|');
    for (const [k, v] of Object.entries(s.otherSets)) {
      L.push(`| ${k} | ${p(v.shippedFullRecall)} | ${p(v.best && v.best.fullRecall)} | ${p(v.best && v.best.holdoutRecall)} | ${v.best ? v.best.fullFA : '—'} | ${v.best ? v.best.allow : '—'} | ${v.crossRows} |`);
    }
    L.push('');
    L.push('⚠ ל-`gloss` יש **אפס** שורות חוצות-כרטיסים במודל, ולכן אילוץ אפס-קבלות-השווא שם חלש יותר ממה שהוא באנגלית. מספר ה-gloss אינו בר-השוואה למספר האנגלי בלי `bank_gate`.');
    L.push('');
  }

  L.push('## אופציה מתומחרת · תקציב קבלות-שווא (‏**אינה** התוצאה)');
  L.push('');
  L.push('`marginHard = marginSoft = 1`, כלומר בלי המשטר הצר — פשוט מרשים ל-`gap = 1` להתקבל, ומכיילים ספים תחת תקציב.');
  L.push('');
  L.push('| תקציב | recall סט מלא | מעטפת מונוטונית | FA בפועל | סט | חוצה-כרטיסים | הרכב |');
  L.push('|---|---|---|---|---|---|---|');
  let env = 0;
  for (const b of (s.budget || [])) {
    if (!b.feasible) { L.push(`| ${b.budget} | לא קביל | | | | | |`); continue; }
    if (b.fullRecall > env) env = b.fullRecall;
    L.push(`| ${b.budget} | ${p(b.fullRecall)} | ${p(env)} | ${b.fullFA} | ${b.setFA} | ${b.crossFA} | ${Object.entries(b.buckets).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(', ')} |`);
  }
  L.push('');
  L.push('⚠ העקומה **אינה מונוטונית** (תקציב 50 נותן פחות מתקציב 20). זה אינו רעש מדידה אלא תכונה של טיפוס-הקואורדינטות: עם תקציב, הסבב הראשון יכול "לבזבז" את התקציב על רצועת אורך אחת ולנעול את השאר. כל שורה בטבלה היא נקודה **קבילה**, ולכן כל ערך הוא חסם תחתון: ה-recall האמיתי בתקציב ‎b אינו נמוך מהמקסימום של כל השורות עד ‎b.');
  L.push('');
  L.push('הדלי `cross-card-bank` אינו "שורה בדאטהסט" אלא התנגשות מאגר אמיתית: מחרוזת שהיא צורה של ערך אחר והתקבלה על הערך הזה. זו התשובה השגויה היקרה ביותר, ולכן כל שורה בטבלה הזאת היא מחיר ולא רעש.');
  L.push('');

  L.push('## מעגליות · איפה זה נושך');
  L.push('');
  L.push('תוויות הדאטהסט נוצרו מאותה טקסונומיית אופרטורים שמכיילים כאן מולה. שורות ה-accept הן בדיוק `adj`, `drop`, `double`, `pattern` ו-`transpose` — ולכן **כל** תכונה שצורתה "האם היישור עשוי ממחלקות האופרטורים האלה" תיראה חזקה יותר ממה שהיא. הצד השני של המבחן אינו סובל מזה באותה מידה: הפולשים חוצי-הכרטיסים הם צורות מאגר אמיתיות ולא נגזרו מהטקסונומיה, ולכן ההפרדה מולם היא עדות אמיתית. אבל צד ה-accept כן, ולכן **מספר ה-recall כאן הוא חסם עליון על מה שמשתמש אמיתי יחווה**, וההפרש גדול יותר ככל שהתכונה קרובה יותר לטקסונומיה. שלב 4 הוא בדיוק תכונה כזאת, ולכן המספר שלו הוא הנפוח ביותר בדוח.');
  L.push('');

  L.push('## מה לא נקבע כאן');
  L.push('');
  L.push('- לא הורץ `bank_gate.js` (השער הממצה) — הוא כותב נכס משותף וחגי מריץ אותו בעצמו. אף מספר כאן אינו תחליף לו.');
  L.push('- החיפוש הוא טיפוס-קואורדינטות: נקודה **מקסימלית מקומית**, לא מקסימום גלובלי. חיפוש המשקלים הוא אקראי ולא ממצה.');
  L.push('- כל מספר שאינו מסומן holdout הוא בתוך-המדגם.');
  L.push('- החיפוש חסום לתוך המעטפת ש-`buildCrossCard` הניחה כשסינן זוגות "בלתי ברי-השגה" (ספים ≤ 3, משקלים ≥ 0.2, `marginHard` ≥ 1). מחוץ למעטפת קבוצת השליליות החוצות-כרטיסים חסרה, ואז "אפס קבלות-שווא" אינו נמדד אלא לא-נצפה.');
  L.push('- `he-word` ו-`gloss` לא כוילו כאן. הם נשארים כפי שנשלחו.');
  fs.writeFileSync(path.join(OUT, 'shortword-report.md'), L.join('\n') + '\n');
}

/* ‏--report-only · בונה מחדש את הדוח מ-out/shortword.json בלי לחזור על המדידה. קיים
   כדי שתיקון נוסח לא ידרוש 20 דקות חישוב, ולכן הוא **אינו** מחשב שום מספר חדש. */
if (require.main === module) {
  if (has('--report-only')) {
    if (SET !== 'en-word') { say('⛔ --report-only קיים ל-en-word בלבד · הדוח מנוסח על אנגלית'); process.exit(2); }
    const j = JSON.parse(fs.readFileSync(path.join(OUT, 'shortword.json'), 'utf8'));
    writeReport(j);
    say('נכתב out/shortword-report.md מתוך out/shortword.json הקיים');
  } else main();
}
module.exports = { tune, evalPoint, makeScn, compileFor, faOver, writeReport };
