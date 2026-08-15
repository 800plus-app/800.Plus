'use strict';
/* budget_sweep.js · עקומת recall מול תקציב קבלות-שווא · שלושת הסטים, מרחב 12 הרצועות
 *
 * ⛔ **ברירת המחדל היא אפס קבלות-שווא.** כל תקציב שאינו אפס הוא הכרעה של חגי ולא
 * המלצה של הקובץ הזה. הקובץ מתמחר אפשרויות · הוא אינו בוחר אחת.
 *
 * ===== למה הקובץ הזה קיים =====
 *
 * ‏out/typo-rules.json כבר נשא שני בלוקים · budgetSweepNamed ו-budgetSweepDenominators ·
 * שנמדדו במרחב גנים ישן עם **ארבע** רצועות אורך. המרחב שנשלח היום הוא וקטור סף של
 * **12 רצועות**, והוא העלה he-word מ-9.71% ל-18.10% ו-en-word מ-45.39% ל-49.73%. עקומה
 * שנמדדה במרחב אחר אינה ניתנת להשוואה למה שנשלח, ולכן היא נמדדת כאן מחדש.
 *
 * ===== איחוד · הלקח שכבר עלה ביוקר פעם אחת =====
 *
 * ההערה pooling ב-typo-rules.json מתעדת מלכודת אמיתית: כל נקודת תקציב הייתה ריצת GA
 * עצמאית עם זרע משלה, והעקומה הגולמית יצאה **לא מונוטונית** · he-word נמדד 3.04%
 * בתקציב 0 בסריקה מול 9.71% בריצה הראשית, ו-gloss קרס ל-0.00%. גנום שקביל בתקציב הדוק
 * קביל בכל תקציב רופף יותר, ולכן עקומה שאינה מאוחדת מודדת את מזל הזרע ולא את הבעיה.
 *
 * כאן האיחוד הוא **מבני ולא תיקון בדיעבד**: כל הגנומים שנוצרו אי-פעם · זרעים ידניים,
 * הפרמטרים שנשלחים, הסריקה הישנה, וכל מנצחי ה-GA בכל נקודה ובכל fold · נכנסים לבריכה
 * אחת. לכל תקציב נבחר הטוב ביותר מתוך **כל** הבריכה שעומד בתקציב. מונוטוניות היא אז
 * תוצאה של הבנייה, ושער נפרד מוודא אותה בכל זאת.
 *
 * ===== בסיס הספירה · מוצהר במפורש כי הוא משנה את המספרים =====
 *
 *   מונה   · כל קבלות-השווא על **כל** שורות הדאטהסט של הסט (אבולוציה + holdout),
 *            ועוד כל התנגשות חוצת-כרטיסים במאגר. שתיהן תשובה שגויה שאושרה.
 *   מכנה   · מספר שורות הדאטהסט של הסט.
 *   מוחרג  · קבלות שכבר קורות היום דרך שכבה 1 (‏acceptsToday / meaningMatch). אין גנום
 *            שיכול לגרום להן או למנוע אותן, ולכן חיובן על התקציב אינו מודד פרמטר.
 *            **זה אינו ניואנס:** ב-gloss יש בדיוק שורה אחת כזאת ("כל" מול "כלל"), והיא
 *            בלעה לבדה את כל התקציב ב-0 וב-1/50,000 בסריקה הישנה · וזו הסיבה ש-gloss
 *            נראה שם "אפס מבני". הן נספרות ומדווחות בנפרד.
 *
 * ===== מה הקובץ הזה אינו =====
 *
 * הוא אינו כותב פרמטרים לייצור, אינו נוגע ב-typo-rules.json, ואינו מריץ את bank_gate.
 * ‏bank_gate נשאר הסמכות הסופית · במיוחד ל-gloss, שבו שכבת ההרחבה B1 אינה ממודלת כאן
 * כלל (‏X.N=0), ולכן דגל "אין חוצי-כרטיסים" בסט הזה אינו עדות אלא היעדר מדידה.
 *
 * הרצה · node typo-lab/budget_sweep.js [--selftest] [--quick] [--sets=he-word,gloss]
 *                                      [--pool-cache] [--refresh-pool]
 *
 * ריצה מלאה היא ~32 דקות (‏336 ריצות GA). ‏--pool-cache שומר את הגנומים בלבד (לא מדדים)
 * ל-out/budget-sweep-pool.jsonl ומוריד ריצה חוזרת לשניות · שימושי כשמתקנים נוסח בדוח
 * או קריטריון בחירה. הוא **כבוי כברירת מחדל**: ריצה רגילה כותבת בדיוק שני ארטיפקטים.
 * המטמון שומר גנומים ולא מספרים · כל מדד מחושב מחדש מהמערכים הארוזים בכל ריצה, ולכן
 * מספר ישן אינו יכול לשרוד שינוי בקוד שהפיק אותו.
 */

const fs = require('fs');
const path = require('path');

const EV = require('./evolve.js');
const CH = require('./lib/checker.js');
const { runGA } = require('./lib/ga.js');
const { fnv1a } = require('./lib/rng.js');
const { OP_KEYS } = require('./lib/wdist.js');

const OUT = path.join(__dirname, 'out');
const SEED = 'typo-lab/budget_sweep/v1';
const ARGS = process.argv.slice(2);
const has = f => ARGS.includes(f);
const argOf = (k, d) => { const a = ARGS.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const SELFTEST = has('--selftest');
const QUICK = has('--quick');
const say = s => process.stdout.write(s + '\n');
const pct = x => x == null ? '—' : (x * 100).toFixed(2) + '%';
const oneIn = (n, d) => n ? '1/' + Math.round(d / n).toLocaleString('en-US') : '0';

const SETS = EV.SETS.filter(s => (argOf('sets', '') ? argOf('sets', '').split(',').includes(s) : true));

/* ===== נקודות התקציב =====
 * הרשימה שחגי ביקש, ועוד נקודות ביניים שנועדו **לאתר את חציית 90%** ולא לקשט את
 * הטבלה. הזנב הרופף (‏1/50 ומטה) נכלל כדי שאפשר יהיה לומר "לא חוצה" כעובדה נמדדת
 * ולא כהשערה · סט שאינו מגיע ל-90% אפילו בתקציב של 1 מכל 2 אינו מגיע לעולם. */
const BUDGETS = [
  0, 1 / 50000, 1 / 20000, 1 / 12000, 1 / 10000, 1 / 7000, 1 / 5000, 1 / 3000,
  1 / 2000, 1 / 1500, 1 / 1000, 1 / 700, 1 / 500, 1 / 350, 1 / 250, 1 / 200,
  1 / 150, 1 / 113, 1 / 100, 1 / 70, 1 / 50, 1 / 30, 1 / 20, 1 / 10, 1 / 5, 1 / 2
];
const bLabel = b => b === 0 ? '0' : '1/' + Math.round(1 / b);
/* נקודות שבהן רץ גם 5-fold CV מלא · הן היקרות (‏6 ריצות GA במקום 2) ולכן הן שמורות
   לנקודות שחגי באמת מכריע עליהן. ה-CV מודד את ה**נוהל** (לכייל מחדש על 4/5), וזו
   שאלה אחרת מ"האם הנקודה הנבחרת מכלילה" · השנייה נמדדת בכל נקודה דרך fixedByFold. */
const CV_AT = new Set([0, 1 / 20000, 1 / 12000, 1 / 7000, 1 / 3000, 1 / 1000].map(bLabel));

const GA_OPTS = QUICK ? { popSize: 30, maxGen: 24, patience: 6 } : { popSize: 70, maxGen: 100, patience: 18 };

/* ===== עזרים על מערכים ארוזים ===== */
const F_TODAY = 4, F_ACCEPT = 8;
const idxAll = S => Int32Array.from({ length: S.N }, (_, i) => i);
const gKey = g => g.map(x => Number(x).toFixed(6)).join(',');

/* גנום ← פרמטרים · בדיוק המסלול של evolve.paramsFor, דרך הפונקציות המיוצאות. */
const paramsOf = g => CH.normalizeParams(Object.assign(EV.genomeToParams(g), { useLexicon: true }));

/* פרמטרים מסודרים (כפי שהם נכתבים ב-typo-rules.json) ← גנום. ‏maxLen:null הוא ∞.
 *
 * ⛔ מרחב הגנים של `evolve.GENES` **אינו מכיל** את גני השוליים המדורגים
 * (‏marginHard · marginSoft · bandsTight · WTight). ארטיפקט מדורג שמומר כאן היה
 * מאבד אותם בשקט וחוזר כגנום רגיל · כלומר עקומת תקציב שנראית כאילו היא מתארת את
 * הפרמטרים הנשלחים ומתארת בפועל גרסה חלשה מהם. זו בדיוק אותה תקלה שנמצאה
 * ב-`bank_gate.shipParams` וב-`canonOf` של tests/71, ושם היא הוכחה: שני ארטיפקטים
 * שונים קיבלו את הטביעה 99db507cb8a5.
 *
 * זריקה ולא השלמה: עקומת תקציב לגן המדורג דורשת הרחבה של `GENES`, וזו החלטה
 * שמשנה את פריסת הגנום ומבטלת כל ארטיפקט קיים. עד שהיא תתקבל, מספר שגוי בשקט
 * גרוע ממחסום רועש. */
function genomeFromSerial(P) {
  const graded = [];
  if (P.marginSoft != null && P.marginHard != null && P.marginSoft > P.marginHard) graded.push('marginSoft>marginHard');
  if (Array.isArray(P.bandsTight) && P.bandsTight.length) graded.push('bandsTight');
  if (P.WTight) graded.push('WTight');
  if (graded.length) {
    throw new Error('genomeFromSerial: פרמטרים מדורגים (' + graded.join(', ') +
      ') · מרחב הגנים של budget_sweep אינו מכיל אותם, והמרה כאן הייתה מייצרת עקומה על גנום אחר');
  }
  return EV.paramsToGenome({
    minLen: P.minLen, vetoMargin: P.vetoMargin,
    bands: P.bands.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t })),
    W: P.W
  });
}

/* ===== התקרה **בתוך מרחב הגנים** =====
 * כל סף בתקרת הגן (‏3), כל משקל ברצפת הגן (‏0.2), minLen=0, שוליים ברצפה (‏1). זהו גנום
 * **שולט**: כל מה שהוא דוחה, אף גנום במרחב אינו יכול לקבל. ומכיוון ש-W.sub מקובע ב-1
 * וקבוצת המועמדים חסומה ב-MAX_OPS=3, היישור היקר ביותר האפשרי הוא שלוש החלפות = 3.0,
 * שעדיין נכנס תחת סף 3 · ולכן התקרה-בתוך-המרחב זהה לתקרה הבלתי-חסומה של evolve. */
function ceilingGenome(margin) {
  return EV.GENES.map(g => {
    if (g.name === 'minLen') return 0;
    if (g.name === 'vetoMargin') return margin;
    if (g.name.startsWith('W.')) return g.lo;
    return g.hi;
  });
}
const zeroGenome = () => EV.GENES.map(g => (g.name === 'vetoMargin' ? 3 : g.name.startsWith('W.') ? 1 : 0));

/* ===== הערכת גנום אחת · כל מה שנקודה בעקומה צריכה =====
 *
 * ‏faOwn ולא fa · ראה בסיס הספירה בראש הקובץ. faBuckets ו-listFalseAccepts הן
 * הפונקציות של evolve.js ואינן נכתבות כאן מחדש; הן כן **מסומנות** · פריט שהגיע משכבה 1
 * מקבל layer1:true, כדי שקורא לא יזקוף לגנום קבלה שאינה שלו.
 */
function makeEvaluator(set, S, X, xI, NH, HO, ALL, layer1Keys) {
  const cache = new Map();
  return function evaluate(genome, source) {
    const k = gKey(genome);
    const hit = cache.get(k);
    if (hit) { if (source && !hit.sources.includes(source)) hit.sources.push(source); return hit; }

    const P = paramsOf(genome);
    const E = EV.makeFastEval(P);
    const rAll = EV.evalSubset(S, ALL, E);
    const rNH = EV.evalSubset(S, NH, E);
    const rHO = EV.evalSubset(S, HO, E);
    const rX = X.N ? EV.evalSubset(X, xI, E) : { fa: 0, faOwn: 0, faToday: 0 };

    const buckets = EV.faBuckets(S, ALL, E);
    if (X.N) for (const [b, n] of Object.entries(EV.faBuckets(X, xI, E))) buckets[b] = (buckets[b] || 0) + n;
    const bucketsHO = EV.faBuckets(S, HO, E);
    if (X.N) for (const [b, n] of Object.entries(EV.faBuckets(X, xI, E))) bucketsHO[b] = (bucketsHO[b] || 0) + n;

    const named = EV.listFalseAccepts(S, ALL, E, 1e9)
      .map(x => Object.assign({}, x, { layer1: layer1Keys.has(x.term + '|' + x.unit + '|' + x.typed) }));
    const namedX = X.N ? EV.listFalseAccepts(X, xI, E, 1e9).map(x => Object.assign({}, x, { layer1: false, crossCard: true })) : [];

    const rec = {
      key: k, genome: genome.slice(), sources: source ? [source] : [], params: P,
      set,
      faDataset: rAll.faOwn, faLayer1: rAll.faToday, faCross: rX.faOwn == null ? rX.fa : rX.faOwn,
      faTotal: rAll.faOwn + (rX.faOwn == null ? rX.fa : rX.faOwn),
      faRealWord: rAll.faRealWord,
      holdoutRecall: rHO.recall, holdoutFA: rHO.faOwn,
      evolveRecall: rNH.recall, evolveFA: rNH.faOwn,
      allRecall: rAll.recall,
      holdoutRecallInclUntrusted: rHO.recallAll, evolveRecallInclUntrusted: rNH.recallAll,
      buckets, bucketsHoldout: bucketsHO,
      named: named.concat(namedX),
      complexity: EV.complexityOf(P)
    };
    rec.crossCardFA = (buckets['cross-card'] || 0) + (buckets['cross-card-bank'] || 0);
    cache.set(k, rec);
    return rec;
  };
}

/* ===== ריצת GA אחת · אותו מנוע, אותה פונקציית כושר מיוצאת =====
 * ‏fitnessOf מקבלת את קבלות-השווא של הדאטהסט ב-res.fa ואת החוצות-כרטיסים ב-xfa, ומחברת
 * אותן. כאן נמסר res.fa=0 ו-xfa=סך ה-faOwn של שני המקורות · אותה אריתמטיקה בדיוק, אבל
 * על הבסיס שהוצהר למעלה (בלי שכבה 1).
 *
 * ‏hardCross · **משפחת גנומים שנייה, וזו הסיבה שהיא קיימת:** כשקבלה חוצת-כרטיסים נספרת
 * באותו תקציב כמו כל שאר קבלות-השווא, ה-GA קונה אותה בשמחה · היא זולה ומשחררת recall.
 * אבל השער הממצה דוחה אותה על הסף, ולכן גנום כזה אינו בר-משלוח בשום תקציב. המשפחה
 * הזאת מקבלת מוות קשיח על כל התנגשות, ומוציאה את התקציב על הדאטהסט בלבד · וזו המשפחה
 * שחגי באמת יכול לבחור ממנה. בלי שתיהן, העקומה מציגה מספרים שאי אפשר לשלוח.
 */
function evolveAt(S, X, xI, trainIdx, allowed, seedStr, hardCross) {
  const seeds = EV.SEED_PARAMS.map(EV.paramsToGenome);
  return runGA(Object.assign({
    spec: EV.GENES,
    seeds,
    seed: fnv1a(seedStr),
    fitness: g => {
      const P = paramsOf(g);
      const E = EV.makeFastEval(P);
      const r = EV.evalSubset(S, trainIdx, E);
      const x = X.N ? EV.evalSubset(X, xI, E) : { fa: 0, faOwn: 0 };
      const xOwn = x.faOwn == null ? x.fa : x.faOwn;
      /* המוות הקשיח מסודר בסדר גודל נפרד לגמרי (‏1e12) כדי שהוא לעולם לא יתחרה
         אריתמטית בעונש חריגת התקציב (‏1e6) · אחרת גנום עם אלף קבלות-שווא ובלי
         התנגשות היה נראה כמו גנום עם התנגשות אחת, ושתי המשפחות היו מתערבבות. */
      const base = EV.fitnessOf({ fa: 0, recall: r.recall }, P, allowed, hardCross ? r.faOwn : r.faOwn + xOwn);
      return hardCross && xOwn > 0 ? -1e12 * xOwn + base : base;
    }
  }, GA_OPTS)).best;
}

/* ===== השערים · כל אחד פונקציה טהורה על העקומה, כדי ש---selftest יוכל לשבור אותה =====
 *
 * ⚠ ירוק שמעולם לא נראה אדום אינו עדות. כל שער כאן מקבל את האובייקט שהוא שופט
 * כארגומנט ואינו קורא לשום מצב גלובלי · זו כל הסיבה שהוא ניתן לשבירה מבוקרת.
 */
const GATES = {
  /* מונוטוניות · האיחוד אמור להבטיח אותה מבנית. השער קיים כי "אמור" אינו מדידה. */
  monotone(curve) {
    const bad = [];
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].holdoutRecall < curve[i - 1].holdoutRecall - 1e-12) {
        bad.push(`${curve[i - 1].budgetLabel}→${curve[i].budgetLabel}: ${pct(curve[i - 1].holdoutRecall)}→${pct(curve[i].holdoutRecall)}`);
      }
    }
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : `${curve.length} נקודות עולות חלש` };
  },
  /* קבילות · כל נקודה חייבת לעמוד בתקציב שהיא מתיימרת לייצג. */
  feasible(curve) {
    const bad = curve.filter(p => p.faTotal > p.allowed).map(p => `${p.budgetLabel}: ${p.faTotal}>${p.allowed}`);
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : 'כל נקודה בתוך התקציב שלה' };
  },
  /* אפס הוא אפס · הנקודה שהיא ברירת המחדל חייבת להיות נקייה לחלוטין. */
  zeroIsZero(curve) {
    const z = curve.find(p => p.budget === 0);
    if (!z) return { ok: false, detail: 'אין נקודת תקציב 0' };
    return { ok: z.faTotal === 0, detail: `תקציב 0 · ${z.faTotal} קבלות-שווא` };
  },
  /* סכום הדליים · קבלת-שווא שאינה נופלת לשום דלי היא קבלת-שווא שלא סופרה. */
  bucketsSum(curve) {
    const bad = [];
    for (const p of curve) {
      const s = Object.values(p.buckets).reduce((a, c) => a + c, 0);
      if (s !== p.faTotal + p.faLayer1) bad.push(`${p.budgetLabel}: Σדליים ${s} ≠ ${p.faTotal + p.faLayer1}`);
    }
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : 'ההרכב מכסה כל קבלת-שווא' };
  },
  /* שמות · שיעור בלי שמות אינו דוח. הרשימה חייבת להיות שלמה, לא מדגם. */
  namesComplete(curve) {
    const bad = [];
    for (const p of curve) {
      if (p.namedTruncated) continue;
      if (p.namedFalseAccepts.length !== p.faTotal + p.faLayer1) {
        bad.push(`${p.budgetLabel}: ${p.namedFalseAccepts.length} שמות מול ${p.faTotal + p.faLayer1} קבלות`);
      }
    }
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : 'כל קבלת-שווא נקובה בשם' };
  },
  /* התקרה · אף נקודה אינה יכולה לעבור את מה שהגנום השולט משיג. */
  underCeiling(curve, ceiling) {
    const bad = curve.filter(p => p.holdoutRecall > ceiling + 1e-9).map(p => `${p.budgetLabel}: ${pct(p.holdoutRecall)} > תקרה ${pct(ceiling)}`);
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : `הכול תחת ${pct(ceiling)}` };
  },
  /* חוצי-כרטיסים · הדגל חייב לזהות נקודה מורעלת. */
  crossCardFlag(curve) {
    const bad = curve.filter(p => (p.crossCardFA > 0) !== !!p.crossCardPoisoned).map(p => p.budgetLabel);
    const n = curve.filter(p => p.crossCardPoisoned).length;
    return { ok: !bad.length, detail: bad.length ? 'אי-התאמה ב: ' + bad.join(',') : `${n} נקודות מורעלות מתוך ${curve.length}` };
  },
  /* העקומה בת-המשלוח · מונוטונית בפני עצמה, ואף נקודה בה אינה נושאת התנגשות. */
  shippableClean(curve) {
    const bad = [];
    let prev = -1;
    for (const p of curve) {
      const s = p.bestShippable;
      if (!s) continue;
      if (s.buckets && ((s.buckets['cross-card'] || 0) + (s.buckets['cross-card-bank'] || 0)) > 0) bad.push(`${p.budgetLabel}: התנגשות בנקודה שסומנה בת-משלוח`);
      if (s.holdoutRecall < prev - 1e-12) bad.push(`${p.budgetLabel}: ירידה ${pct(prev)}→${pct(s.holdoutRecall)}`);
      prev = Math.max(prev, s.holdoutRecall);
    }
    return { ok: !bad.length, detail: bad.length ? bad.join(' · ') : 'העקומה בת-המשלוח נקייה ועולה חלש' };
  }
};

function runGates(curve, ceiling) {
  const out = {};
  for (const [name, fn] of Object.entries(GATES)) out[name] = fn(curve, ceiling);
  return out;
}

/* ===== האומדן לשימוש אמיתי =====
 *
 * ⚠ **הכי חשוב להיאמר קודם:** אין לנו לוגים של הקלדות אמיתיות. לכן המספר "בשימוש" אינו
 * מדידה אלא מודל, והוא נכתב כאן כפונקציה של פרמטר חופשי אחד ומוצהר · ולא כמספר יחיד
 * שנשמע כמו מדידה. האומדנים הקודמים שנרשמו ב-STATE.md (אנגלית ~1/12,300, עברית
 * ~1/117,000) **אינם ניתנים לשחזור**: השיטה שהפיקה אותם אינה מתועדת באף ארטיפקט בריפו,
 * רק המסקנה. הם מובאים להשוואה ומסומנים כלא-משוחזרים.
 *
 * המודל · קבלת-שווא בשימוש דורשת שהלומד יקליד מחרוזת ש(א) אינה צורה קבילה של הכרטיס
 * שהוצג לו, ו(ב) הבודק מקבל. לכן
 *
 *     שיעור לכל תשובה = P(קבלת-שווא | התשובה היא החטאה-קרובה שגויה) × q
 *
 * שבו q הוא חלקן של ההחטאות-הקרובות מכלל התשובות בשימוש. האיבר הראשון **נמדד** אצלנו
 * (‏faTotal חלקי מספר שורות ה-reject), והשני הוא הפרמטר שאין לנו. הטבלה נותנת אותו לכמה
 * ערכי q, ואת המכפיל מול המבחן.
 *
 * חולשות שחייבות להיאמר:
 *   1. ‏q אינו נמדד. הוא הפער בין "מבחן" ל"שימוש", וכל המספר "בשימוש" תלוי בו לינארית.
 *   2. המודל מניח שאוכלוסיית ה-reject במבחן מייצגת החטאות-קרובות אמיתיות **בהינתן**
 *      שהתשובה היא החטאה-קרובה. זה כמעט בוודאות לא נכון: gen_dataset מונה שגיאות
 *      שיטתית (כל השמטה, כל החלפת שכן), ולומד אמיתי אינו מגריל אחידה מהקבוצה הזאת.
 *      הכיוון אינו ידוע · שגיאות נפוצות עשויות להיות דווקא המסוכנות (real-word) או
 *      דווקא הבטוחות.
 *   3. השורות החוצות-כרטיסים אינן "תשובה שלומד הקליד" אלא תכונה של המאגר. הן נספרות
 *      במונה במלואן ואינן משתתפות במכנה, וזו החמרה מכוונת.
 *   4. חשיפה לפי כרטיס (למטה) היא **כן** מדידה ולא מודל, ולכן היא המספר שכדאי להסתכל
 *      עליו כשהמודל מרגיז: כמה כרטיסים במאגר בכלל נושאים מחרוזת שתתקבל בטעות.
 */
const Q_GRID = [0.005, 0.01, 0.02, 0.05, 0.10, 0.20];

function inUseEstimate(point, meta) {
  const pGivenReject = meta.rejects ? point.faTotal / meta.rejects : 0;
  return {
    method: 'rate_in_use = P(false accept | typed answer is a near-miss wrong answer) x q ; the first term is measured, q is an explicit free parameter (share of real answer attempts that are near-miss wrong answers) that we cannot measure without typing logs',
    faTotal: point.faTotal,
    rowsInTest: meta.rows, rejectRowsInTest: meta.rejects,
    trapDensityInTest: meta.rows ? meta.rejects / meta.rows : 0,
    rateInTest: meta.rows ? point.faTotal / meta.rows : 0,
    rateInTestLabel: oneIn(point.faTotal, meta.rows),
    pFalseAcceptGivenNearMiss: pGivenReject,
    byQ: Q_GRID.map(q => ({
      q, rate: pGivenReject * q,
      label: pGivenReject * q > 0 ? '1/' + Math.round(1 / (pGivenReject * q)).toLocaleString('en-US') : '0 (אין קבלות-שווא כלל)'
    })),
    cardExposure: point.cardExposure
  };
}

/* ===== main ===== */
function main() {
  const T0 = Date.now();
  say('טעינה וקדם-חישוב ...');
  const { perSet, langs } = EV.loadRows();

  /* מטמון השליליות החוצות-כרטיסים · אותו קובץ ואותו מפתח דאטהסט שבהם coverage.js
     משתמש. הבנייה עולה ~430 שניות, והפלט קטן · מפתח שאינו תואם מבטל את המטמון ולא
     נשען על זיכרון. */
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const dsKey = (manifest.files || []).map(f => f.name + ':' + f.sha256).sort().join('|');
  const CACHE = path.join(OUT, 'coverage-cross.json');
  let cross = null;
  if (fs.existsSync(CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      if (c.dsKey === dsKey) { cross = { rows: c.rows, stats: c.stats }; say('שליליות חוצות-כרטיסים · מהמטמון (מפתח דאטהסט תואם)'); }
      else say('⚠ מטמון חוצי-הכרטיסים אינו תואם את הדאטהסט · נבנה מחדש');
    } catch (e) { cross = null; }
  }
  if (!cross) {
    const tX = Date.now();
    say('בניית השליליות החוצות-כרטיסים (יקר · ~430 שניות) ...');
    cross = EV.buildCrossCard(langs, perSet);
    say(`  ${((Date.now() - tX) / 1000).toFixed(1)}s`);
    fs.writeFileSync(CACHE, JSON.stringify({ dsKey, stats: cross.stats, rows: cross.rows }));
  }

  let prior = null;
  try { prior = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8')); } catch (e) { prior = null; }

  const report = {
    ver: SEED,
    generatedAt: new Date().toISOString().slice(0, 10),
    gaOptions: GA_OPTS,
    basis: {
      counted: 'every false accept over every dataset row of the set (evolve + holdout) plus every cross-card bank collision',
      denominator: 'dataset rows of the set',
      excluded: 'layer-1 acceptances (acceptsToday / meaningMatch) - no genome can cause or prevent them; counted and reported separately as faLayer1',
      pooling: 'a genome feasible at a tight budget is feasible at every looser one, so every budget reports the best known genome across the whole pool (manual seeds, shipped params, the previous 4-band sweep, and every GA winner at every budget and every fold). Monotonicity is structural here, and a separate gate verifies it anyway.',
      geneSpace: '12-band per-length threshold vector (t2..t12, t13plus) + minLen + 7 weights + vetoMargin = 21 genes; identical to what evolve.js ships today',
      default: 'ZERO false accepts is the default. Every non-zero budget on this curve is a priced option for Hagai to decide, not a recommendation taken here.'
    },
    dataset: { total: manifest.total, files: (manifest.files || []).map(f => ({ name: f.name, rows: f.rows, sha256: f.sha256 })) },
    sets: {}
  };

  for (const set of SETS) {
    const S = EV.packSet(perSet[set]);
    const X = EV.packSet(cross.rows[set] || []);
    const xI = idxAll(X);
    const ALL = idxAll(S);
    const nh = [], ho = [];
    for (let i = 0; i < S.N; i++) (S.hold[i] ? ho : nh).push(i);
    const NH = Int32Array.from(nh), HO = Int32Array.from(ho);

    let rejects = 0, layer1Rows = 0;
    const layer1Keys = new Set();
    const cardsInSet = new Set();
    for (let i = 0; i < S.N; i++) {
      const r = S.rows[i];
      cardsInSet.add(r.term + '|' + r.unit);
      if (!(S.flags[i] & F_ACCEPT)) rejects++;
      if (S.flags[i] & F_TODAY) { layer1Rows++; layer1Keys.add(r.term + '|' + r.unit + '|' + r.typed); }
    }

    say(`\n===== ${set} · ${S.N} שורות (${nh.length} אבולוציה · ${ho.length} holdout) · ${rejects} שליליות · ${cardsInSet.size} כרטיסים · ${X.N} זוגות חוצי-כרטיסים =====`);
    if (!X.N) say('  ⚠ אין מודל חוצה-כרטיסים לסט הזה · דגל "נקי מחוצי-כרטיסים" כאן הוא היעדר מדידה, לא עדות');

    const evaluate = makeEvaluator(set, S, X, xI, NH, HO, ALL, layer1Keys);

    /* ---- בריכת הגנומים ---- */
    const pool = [];
    const add = (g, src) => { if (g) pool.push(evaluate(g, src)); };
    for (let i = 0; i < EV.SEED_PARAMS.length; i++) add(EV.paramsToGenome(EV.SEED_PARAMS[i]), 'seed:' + EV.SEED_PARAMS[i].note);
    add(zeroGenome(), 'zero-tolerance');
    for (const m of [1, 2, 3]) add(ceilingGenome(m), 'in-space-ceiling:margin' + m);
    if (prior && prior.params && prior.params[set]) add(genomeFromSerial(prior.params[set]), 'shipped');
    if (prior && prior.results && prior.results[set] && prior.results[set].budgetSweep) {
      for (const p of prior.results[set].budgetSweep) add(genomeFromSerial(p.params), 'prior-sweep:' + p.budgetLabel);
    }
    say(`  בריכה התחלתית · ${new Set(pool.map(p => p.key)).size} גנומים ידועים`);

    /* ---- ריצות GA · שתי משפחות לכל נקודה, ועוד 5 folds בנקודות ההכרעה ----
       המטמון שומר גנומים בלבד ולא מדדים · המדדים מחושבים מחדש בכל ריצה מהמערכים
       הארוזים. כך תיקון בדוח או בקריטריון הבחירה עולה שניות ולא שעה, ובלי הסיכון
       שמספר ישן ישרוד בקובץ אחרי שהקוד שהפיק אותו השתנה. */
    const cvBy = {};
    /* ⚠ המטמון **כבוי כברירת מחדל ובכוונה**. ריצה רגילה כותבת שני ארטיפקטים בלבד ·
       ‏budget-sweep.json ו-budget-sweep-report.md · ולא מוסיפה קובץ שלישי לתיקייה
       משותפת. ‏--pool-cache מדליק אותו, והסיומת .jsonl נופלת תחת כלל ההתעלמות שכבר
       קיים ב-out/.gitignore, ולכן הוא אינו יכול להיכנס לריפו הציבורי. */
    const POOL_CACHE = has('--pool-cache');
    const poolCacheFile = path.join(OUT, 'budget-sweep-pool.jsonl');
    const poolKey = [dsKey, SEED, JSON.stringify(GA_OPTS), BUDGETS.map(bLabel).join(','), Array.from(CV_AT).join(',')].join('#');
    let cached = null;
    if (POOL_CACHE && !has('--refresh-pool') && fs.existsSync(poolCacheFile)) {
      try {
        const c = JSON.parse(fs.readFileSync(poolCacheFile, 'utf8'));
        if (c.poolKey === poolKey && c.sets && c.sets[set]) cached = c;
      } catch (e) { cached = null; }
    }
    if (cached) {
      for (const e of cached.sets[set].genomes) add(e.g, e.src);
      Object.assign(cvBy, cached.sets[set].cv);
      say(`  ריצות ה-GA · מהמטמון (${cached.sets[set].genomes.length} גנומים)`);
    } else {
      const produced = [];
      const addGA = (g, src) => { produced.push({ g, src }); add(g, src); };
      for (const b of BUDGETS) {
        const L = bLabel(b);
        const tGA = Date.now();
        /* משפחה א · התקציב מכסה גם התנגשויות. משפחה ג · מוות קשיח על התנגשות. */
        addGA(evolveAt(S, X, xI, NH, Math.floor(b * nh.length), `${SEED}|${set}|b${L}|final|a`, false), `ga:${L}:a`);
        addGA(evolveAt(S, X, xI, NH, Math.floor(b * nh.length), `${SEED}|${set}|b${L}|final|c`, true), `ga:${L}:xhard`);
        if (CV_AT.has(L)) {
          const valR = [];
          for (let f = 0; f < 5; f++) {
            const tr = [], va = [];
            for (const i of nh) (S.fold[i] === f ? va : tr).push(i);
            const g = evolveAt(S, X, xI, Int32Array.from(tr), Math.floor(b * tr.length), `${SEED}|${set}|b${L}|fold${f}`, false);
            addGA(g, `ga:${L}:fold${f}`);
            addGA(evolveAt(S, X, xI, Int32Array.from(tr), Math.floor(b * tr.length), `${SEED}|${set}|b${L}|xfold${f}`, true), `ga:${L}:xfold${f}`);
            valR.push(EV.evalSubset(S, Int32Array.from(va), EV.makeFastEval(paramsOf(g))).recall);
          }
          const m = valR.reduce((a, c) => a + c, 0) / valR.length;
          cvBy[L] = { mean: m, sd: Math.sqrt(valR.reduce((a, c) => a + (c - m) * (c - m), 0) / valR.length), folds: valR };
        }
        say(`  GA ${L.padStart(8)} · ${((Date.now() - tGA) / 1000).toFixed(1)}s · בריכה ${new Set(pool.map(p => p.key)).size}`);
      }
      if (POOL_CACHE) {
        let store = { poolKey, sets: {} };
        if (fs.existsSync(poolCacheFile)) {
          try { const c = JSON.parse(fs.readFileSync(poolCacheFile, 'utf8')); if (c.poolKey === poolKey) store = c; } catch (e) { /* מטמון פגום · נכתב מחדש */ }
        }
        store.sets[set] = { genomes: produced, cv: cvBy };
        fs.writeFileSync(poolCacheFile, JSON.stringify(store), 'utf8');
      }
    }

    /* ---- דה-דופליקציה ---- */
    const byKey = new Map();
    for (const p of pool) if (!byKey.has(p.key)) byKey.set(p.key, p);
    const cands = Array.from(byKey.values());

    const ceilRec = cands.filter(c => c.sources.some(s => s.startsWith('in-space-ceiling')))
      .sort((a, b) => b.holdoutRecall - a.holdoutRecall)[0];
    const ceiling = ceilRec ? ceilRec.holdoutRecall : 1;
    say(`  תקרה בתוך מרחב הגנים · holdout ${pct(ceiling)} · אבולוציה ${pct(ceilRec.evolveRecall)} · ${ceilRec.faTotal} קבלות-שווא`);

    /* ---- האיחוד · לכל תקציב, הטוב ביותר מכל הבריכה שעומד בו ----
     *
     * **שתי בחירות ולא אחת, וזה ההבדל שמכריע.** `best` הוא ה-recall הגבוה ביותר שהתקציב
     * קונה · והוא עלול לקנות אותו בקבלה חוצת-כרטיסים, כלומר ערך אחד במאגר שהתקבל כערך
     * אחר. `bestShippable` הוא הטוב ביותר **בלי אף התנגשות**. השער הממצה דוחה את הראשון
     * על הסף, ולכן דיווח של `best` בלבד היה מציג לחגי מחיר על מוצר שאי אפשר למכור לו.
     */
    const NAME_CAP = 200;
    const rank = (a, x) =>
      x.holdoutRecall - a.holdoutRecall ||
      x.evolveRecall - a.evolveRecall ||
      a.faTotal - x.faTotal ||
      a.complexity - x.complexity ||
      (a.key < x.key ? -1 : 1);
    const curve = [];
    for (const b of BUDGETS) {
      const allowed = Math.floor(b * S.N);
      const feasible = cands.filter(c => c.faTotal <= allowed).sort(rank);
      const clean = feasible.filter(c => c.crossCardFA === 0);
      const w = feasible[0];
      const wc = clean[0];
      if (!w) { say(`  ⛔ ${bLabel(b)} · אין אף גנום קביל (לא אמור לקרות · גנום האפס תמיד קביל)`); continue; }

      /* חשיפה לפי כרטיס · כמה כרטיסים במאגר נושאים בכלל מחרוזת שתתקבל בטעות. */
      const hitCards = new Set(w.named.filter(x => !x.layer1).map(x => x.term + '|' + x.unit));
      const fixedByFold = [];
      const E = EV.makeFastEval(w.params);
      for (let f = 0; f < 5; f++) {
        const va = [];
        for (const i of nh) if (S.fold[i] === f) va.push(i);
        const rf = EV.evalSubset(S, Int32Array.from(va), E);
        fixedByFold.push({ fold: f, recall: rf.recall, falseAccepts: rf.faOwn });
      }

      const named = w.named.slice(0, NAME_CAP);
      const shippable = wc ? {
        holdoutRecall: wc.holdoutRecall, evolveRecall: wc.evolveRecall,
        faDataset: wc.faDataset, faTotal: wc.faTotal, faLayer1: wc.faLayer1,
        rateInTest: S.N ? wc.faTotal / S.N : 0, rateInTestLabel: oneIn(wc.faTotal, S.N),
        buckets: wc.buckets, bucketsHoldout: wc.bucketsHoldout,
        namedFalseAccepts: wc.named.slice(0, NAME_CAP), namedTruncated: wc.named.length > NAME_CAP,
        cardExposure: {
          cardsWithAnyFalseAccept: new Set(wc.named.filter(x => !x.layer1).map(x => x.term + '|' + x.unit)).size,
          cardsInSet: cardsInSet.size
        },
        genomeSource: wc.sources.join(' | '),
        recallCostVsBest: w.holdoutRecall - wc.holdoutRecall,
        params: {
          minLen: wc.params.minLen, vetoMargin: wc.params.vetoMargin, useLexicon: true,
          bands: wc.params.bands.map(x => ({ maxLen: isFinite(x.maxLen) ? x.maxLen : null, t: Number(x.t.toFixed(4)) })),
          W: Object.fromEntries(OP_KEYS.map(k => [k, Number(wc.params.W[k].toFixed(4))]))
        }
      } : null;
      curve.push({
        budget: b, budgetLabel: bLabel(b), allowed,
        bestShippable: shippable,
        holdoutRecall: w.holdoutRecall, evolveRecall: w.evolveRecall, allRowsRecall: w.allRecall,
        holdoutRecallInclUntrusted: w.holdoutRecallInclUntrusted,
        faDataset: w.faDataset, faCross: w.faCross, faTotal: w.faTotal, faLayer1: w.faLayer1,
        faRealWord: w.faRealWord,
        rateInTest: S.N ? w.faTotal / S.N : 0, rateInTestLabel: oneIn(w.faTotal, S.N),
        holdoutFalseAccepts: w.holdoutFA,
        buckets: w.buckets, bucketsHoldout: w.bucketsHoldout,
        crossCardFA: w.crossCardFA,
        crossCardPoisoned: w.crossCardFA > 0,
        namedFalseAccepts: named,
        namedTruncated: w.named.length > NAME_CAP,
        cardExposure: { cardsWithAnyFalseAccept: hitCards.size, cardsInSet: cardsInSet.size },
        genomeSource: w.sources.join(' | '),
        cv: cvBy[bLabel(b)] || null,
        fixedByFold,
        params: {
          minLen: w.params.minLen, vetoMargin: w.params.vetoMargin, useLexicon: true,
          bands: w.params.bands.map(x => ({ maxLen: isFinite(x.maxLen) ? x.maxLen : null, t: Number(x.t.toFixed(4)) })),
          W: Object.fromEntries(OP_KEYS.map(k => [k, Number(w.params.W[k].toFixed(4))]))
        }
      });

      const bl = Object.entries(w.buckets).map(([k, v]) => k + ':' + v).join(' ') || 'אין';
      say(`  ${bLabel(b).padStart(8)} · holdout ${pct(w.holdoutRecall).padStart(7)} · בר-משלוח ${(wc ? pct(wc.holdoutRecall) : '—').padStart(7)} · FA ${String(w.faTotal).padStart(4)}/${allowed} (${oneIn(w.faTotal, S.N)}) · ${bl}${w.crossCardFA ? '  ⛔ חוצה-כרטיסים' : ''}`);
    }

    const gates = runGates(curve, ceiling);
    for (const [n, g] of Object.entries(gates)) say(`  שער ${n.padEnd(14)} ${g.ok ? '✅' : '⛔'} ${g.detail}`);

    const ninety = curve.find(p => p.holdoutRecall >= 0.90);
    const ninetyClean = curve.find(p => p.bestShippable && p.bestShippable.holdoutRecall >= 0.90);
    const ceilClean = cands.filter(c => c.crossCardFA === 0).sort(rank)[0];
    say(`  90% · כולל מורעלות ${ninety ? ninety.budgetLabel : 'לא נחצה'} · בר-משלוח ${ninetyClean ? ninetyClean.budgetLabel : 'לא נחצה'} · תקרה בת-משלוח ${pct(ceilClean ? ceilClean.holdoutRecall : 0)}`);

    const meta = { rows: S.N, rejects, cards: cardsInSet.size };
    report.sets[set] = {
      rows: S.N, rowsEvolve: nh.length, rowsHoldout: ho.length,
      rejectRows: rejects, layer1Rows, cardsInSet: cardsInSet.size,
      crossCardPairsModelled: X.N,
      crossCardModelled: X.N > 0,
      inSpaceCeiling: {
        holdoutRecall: ceilRec.holdoutRecall, evolveRecall: ceilRec.evolveRecall,
        falseAccepts: ceilRec.faTotal, buckets: ceilRec.buckets,
        note: 'all thresholds at the gene ceiling (3), all weights at the gene floor (0.2), minLen 0, vetoMargin 1. This genome dominates the whole gene space: what it rejects, no genome can accept.'
      },
      poolSize: cands.length,
      curve,
      shippableCeiling: ceilClean ? {
        holdoutRecall: ceilClean.holdoutRecall, faTotal: ceilClean.faTotal,
        rateInTestLabel: oneIn(ceilClean.faTotal, S.N),
        note: 'best genome in the whole pool with zero cross-card acceptances, at any budget. This is the hard ceiling on anything that could survive bank_gate.js.'
      } : null,
      ninetyPercent: {
        crossedAt: ninety ? ninety.budgetLabel : null,
        crossedCleanAt: ninetyClean ? ninetyClean.budgetLabel : null,
        ceilingHoldoutRecall: ceiling,
        shippableCeilingHoldoutRecall: ceilClean ? ceilClean.holdoutRecall : null,
        note: ninety ? null : (ceiling < 0.90 ? 'the in-space ceiling itself is below 90% - unreachable at any budget in this gene space' : 'not reached inside the budget grid tested')
      },
      /* האומדן נבנה על הנקודה **בת-המשלוח** · היא זו שיכולה להגיע לייצור. הנקודה
         המורעלת מובאת לצדה רק כדי שההפרש יהיה גלוי. */
      inUse: Object.fromEntries(curve.filter(p => ['0', '1/20000', '1/12000', '1/7000', '1/3000', '1/1000'].includes(p.budgetLabel))
        .map(p => [p.budgetLabel, Object.assign(
          inUseEstimate(p.bestShippable || p, meta),
          { basisPoint: p.bestShippable ? 'bestShippable' : 'best (no clean point exists at this budget)' })])),
      gates: Object.fromEntries(Object.entries(gates).map(([k, v]) => [k, { pass: v.ok, detail: v.detail }]))
    };

    /* ---- --selftest · לשבור כל שער ולראות אותו אדום ---- */
    if (SELFTEST) {
      say(`\n  ----- --selftest · ${set} · כל שער נשבר בכוונה ונבדק שהוא נופל -----`);
      const st = {};
      const clone = () => JSON.parse(JSON.stringify(curve));
      const check = (name, broken, gate, arg) => {
        const before = GATES[gate](curve, arg);
        const after = GATES[gate](broken, arg);
        st[name] = { greenOnReal: before.ok, redWhenBroken: !after.ok, brokenDetail: after.detail };
        say(`   ${name.padEnd(26)} · ירוק על האמת ${before.ok ? '✅' : '⛔'} · אדום כשנשבר ${!after.ok ? '✅' : '⛔ (השער עיוור)'}`);
        if (!before.ok || after.ok) process.exitCode = 1;
      };

      /* 1 · מונוטוניות · העקומה הגולמית (הטוב ביותר **שנוצר באותה נקודה בלבד**, בלי
         איחוד) היא בדיוק מה שההערה pooling מתעדת כלא-מונוטוני. */
      const raw = [];
      for (const b of BUDGETS) {
        const L = bLabel(b), allowed = Math.floor(b * S.N);
        const local = cands.filter(c => c.faTotal <= allowed && c.sources.some(s => s.startsWith('ga:' + L + ':')));
        const w = local.sort((a, x) => x.holdoutRecall - a.holdoutRecall)[0] || cands.find(c => c.faTotal === 0);
        raw.push({ budgetLabel: L, holdoutRecall: w.holdoutRecall });
      }
      check('monotone/unpooled', raw, 'monotone');

      /* 2 · קבילות · נקודה שחורגת מהתקציב שלה בשורה אחת. */
      const c2 = clone(); c2[0].faTotal = c2[0].allowed + 1;
      check('feasible/over-budget', c2, 'feasible');

      /* 3 · אפס · תקציב 0 עם קבלת-שווא אחת. */
      const c3 = clone(); c3[0].faTotal = 1;
      check('zeroIsZero/dirty-zero', c3, 'zeroIsZero');

      /* 4 · סכום הדליים · דלי שנמחק. */
      const c4 = clone();
      const vic4 = c4.find(p => Object.keys(p.buckets).length);
      if (vic4) delete vic4.buckets[Object.keys(vic4.buckets)[0]];
      else c4[0].faTotal += 1;                       // אין דליים כלל · שוברים את הסכום ישירות
      check('bucketsSum/dropped-bucket', c4, 'bucketsSum');

      /* 5 · שמות · רשימה קטועה בלי סימון קטיעה. */
      const c5 = clone();
      const vic5 = c5.find(p => p.namedFalseAccepts.length > 0) || c5[c5.length - 1];
      vic5.namedFalseAccepts = []; vic5.namedTruncated = false;
      if (vic5.faTotal + vic5.faLayer1 === 0) vic5.faTotal = 1;
      check('namesComplete/truncated', c5, 'namesComplete');

      /* 6 · תקרה · נקודה שמתיימרת לעבור את הגנום השולט. */
      const c6 = clone(); c6[c6.length - 1].holdoutRecall = ceiling + 0.05;
      check('underCeiling/above-ceiling', c6, 'underCeiling', ceiling);

      /* 7 · חוצי-כרטיסים · נקודה שנושאת התנגשות ואינה מסומנת. הגנום השולט מייצר
         התנגשויות בפועל, ולכן קודם נבדק שהמדידה עצמה אינה ריקה. */
      const c7 = clone(); const vic7 = c7.find(p => p.crossCardFA > 0) || c7[c7.length - 1];
      vic7.crossCardFA = Math.max(1, vic7.crossCardFA); vic7.crossCardPoisoned = false;
      check('crossCardFlag/unflagged', c7, 'crossCardFlag');

      /* 8 · העקומה בת-המשלוח · נקודה שסומנה בת-משלוח ובכל זאת נושאת התנגשות. */
      const c8 = clone();
      const vic8 = c8.find(p => p.bestShippable);
      if (vic8) vic8.bestShippable.buckets = Object.assign({}, vic8.bestShippable.buckets, { 'cross-card-bank': 1 });
      check('shippableClean/dirty-shippable', c8, 'shippableClean');
      /* ⚠ הבדיקה הזאת חייבת להיות נפרדת מהשער · השער מוודא שהדגל עקבי, וזה מוודא
         ש**יש מה לדגול**. דגל שאף פעם לא היה לו מה לתפוס אינו מודד כלום. */
      st.ceilingProducesCrossCard = { measured: ceilRec.crossCardFA, bankModelPairs: X.N, ok: ceilRec.crossCardFA > 0 };
      say(`   ${'ceiling-produces-cross-card'.padEnd(26)} · הגנום השולט מייצר ${ceilRec.crossCardFA} קבלות חוצות-כרטיסים ${ceilRec.crossCardFA > 0 ? '✅ (למדידה יש מה לתפוס)' : '⛔ (מבחן ההרעלה ריק)'}${X.N ? '' : ' · מהדאטהסט בלבד, אין מודל מאגר לסט הזה'}`);
      if (!ceilRec.crossCardFA) process.exitCode = 1;

      report.sets[set].selftest = st;
    }
  }

  const wall = (Date.now() - T0) / 1000;
  report.wallClockSec = Number(wall.toFixed(1));
  report.priorInUseEstimates = {
    source: 'typo-lab/STATE.md lines 163-164',
    values: { 'en-word': { inTest: '1/11,759', inUse: '~1/12,300' }, 'he-word': { inTest: '1/8,406', inUse: '~1/117,000' } },
    reproduced: false,
    note: 'the in-test figures reproduce exactly (3 false accepts over 35,278 / 25,217 dataset rows at the 1/7000 operating point in the OLD 4-band gene space). The in-use figures do NOT reproduce: no artifact in the repository records the method that produced them, only the conclusion. They are quoted here for comparison and marked unreproduced.'
  };
  fs.writeFileSync(path.join(OUT, 'budget-sweep.json'), JSON.stringify(report, null, 1), 'utf8');
  writeMarkdown(report);
  say(`\nזמן קיר ${wall.toFixed(1)}s · נכתבו out/budget-sweep.json ו-out/budget-sweep-report.md`);

  const failed = [];
  for (const s of Object.keys(report.sets)) for (const [g, v] of Object.entries(report.sets[s].gates)) if (!v.pass) failed.push(`${s}/${g}`);
  if (failed.length) { say('⛔ שערים שנפלו: ' + failed.join(', ')); process.exitCode = 1; }
}

/* ===== הדוח בעברית ===== */
function writeMarkdown(R) {
  const L = [];
  const p2 = x => (x * 100).toFixed(2) + '%';
  L.push('# עקומת recall מול תקציב קבלות-שווא · מרחב 12 הרצועות');
  L.push('');
  L.push(`נמדד ${R.generatedAt} · ‏\`node typo-lab/budget_sweep.js\` · זמן קיר ${R.wallClockSec}s · GA ${JSON.stringify(R.gaOptions)}`);
  L.push('');
  L.push('## ⛔ מה זה כן ומה זה לא');
  L.push('');
  L.push('**ברירת המחדל היא אפס קבלות-שווא.** כל שורה בטבלאות שאינה שורת התקציב `0` היא');
  L.push('**אפשרות מתומחרת** שמחכה להכרעה של חגי, ולא המלצה שכבר נלקחה כאן. הקובץ הזה אינו');
  L.push('כותב פרמטרים לייצור ואינו מריץ את `bank_gate.js` · השער הממצה נשאר הסמכות הסופית.');
  L.push('');
  L.push('## איך נמדד · בסיס הספירה');
  L.push('');
  L.push('| מה | איך |');
  L.push('|---|---|');
  L.push('| מונה | כל קבלות-השווא על **כל** שורות הדאטהסט של הסט (אבולוציה + holdout) ועוד כל התנגשות חוצת-כרטיסים במאגר |');
  L.push('| מכנה | מספר שורות הדאטהסט של הסט |');
  L.push('| מוחרג | קבלות שכבר קורות היום דרך שכבה 1 (`acceptsToday` / `meaningMatch`) · אין גנום שגורם להן או מונע אותן. נספרות בעמודה `שכבה 1` |');
  L.push('| מרחב | וקטור סף לכל אורך · 12 רצועות · 21 גנים · זהה למה ש-`evolve.js` שולח היום |');
  L.push('');
  L.push('### איחוד · למה העקומה מונוטונית');
  L.push('');
  L.push('גנום שקביל בתקציב הדוק קביל בכל תקציב רופף יותר. לכן כל הגנומים שנוצרו אי-פעם ·');
  L.push('הזרעים הידניים, הפרמטרים הנשלחים, הסריקה הישנה בת 4 הרצועות, וכל מנצחי ה-GA בכל');
  L.push('נקודה ובכל fold · נכנסים לבריכה אחת, וכל תקציב מדווח את הטוב ביותר **מכל הבריכה**');
  L.push('שעומד בו. בלי זה העקומה מודדת את מזל הזרע: ההערה `pooling` ב-`typo-rules.json`');
  L.push('מתעדת בדיוק את זה · he-word יצא 3.04% בתקציב 0 בסריקה מול 9.71% בריצה הראשית.');
  L.push('שער `monotone` מוודא את התוצאה בכל זאת, ו---selftest מריץ אותו על העקומה הלא');
  L.push('מאוחדת כדי להראות שהוא נופל שם.');
  L.push('');
  L.push('### ⚠ מעגליות · איפה המספרים חלשים');
  L.push('');
  L.push('התוויות שלפיהן נמדדת כל קבלת-שווא (`real-word`, `ambiguous`, `garbage` …) נגזרו');
  L.push('**מאותו לקסיקון** שנמדד כאן, ובאותו צינור שמייצר את שורות הדאטהסט. משמעות הדבר:');
  L.push('');
  L.push('- מחרוזת שהלקסיקון אינו מכיר תויגה `garbage` או `ambiguous` גם אם היא מילה עברית');
  L.push('  אמיתית, ולכן דלי `real-word` הוא **חסם תחתון** על הסיכון האמיתי ולא מדידה שלו.');
  L.push('- שם הדלי אינו עדות חיצונית · הוא ההכרעה של הצינור שלנו על עצמו.');
  L.push('- הכיוון של ההטיה ידוע: כיסוי לקסיקון חלקי **מקטין** את `real-word` ו**מגדיל** את');
  L.push('  הדליים הרכים. כלומר ההרכב שמוצג כאן ורוד מהמציאות, לא קודר ממנה.');
  L.push('');
  for (const [set, D] of Object.entries(R.sets)) {
    L.push('---');
    L.push('');
    L.push(`## ${set}`);
    L.push('');
    L.push(`${D.rows} שורות (${D.rowsEvolve} אבולוציה · ${D.rowsHoldout} holdout) · ${D.rejectRows} שליליות · `
      + `${D.cardsInSet} כרטיסים שהדאטהסט מכסה · ${D.crossCardPairsModelled} זוגות חוצי-כרטיסים במודל · `
      + `בריכה של ${D.poolSize} גנומים.`);
    L.push('');
    if (!D.crossCardModelled) {
      L.push('> ⛔ **אין מודל חוצה-כרטיסים לסט הזה.** העמודה "חוצי-כרטיסים" כאן היא היעדר');
      L.push('> מדידה ולא עדות לניקיון. `bank_gate` כבר מצא בסט הזה שתי התנגשויות אמיתיות');
      L.push('> דרך תוצרי ההרחבה של B1, שאינם מקטעי פירוש ולכן בלתי-נראים גם למרווח');
      L.push('> הדו-משמעות וגם לקבוצה החוצה-כרטיסים. **כל נקודה כאן חייבת לעבור את השער');
      L.push('> הממצה לפני שנאמר עליה משהו.**');
      L.push('');
    }
    if (D.layer1Rows) {
      L.push(`> ⭐ **${D.layer1Rows} שורות שכבה 1 בסט הזה.** אלה שורות שתויגו \`reject\` והבודק מקבל`);
      L.push('> אותן **כבר היום**, לפני שנקרא שום פרמטר. אין גנום שגורם להן ואין גנום שמונע אותן,');
      L.push('> ולכן הן מוחרגות מהתקציב ונספרות בעמודה נפרדת. **זה לא ניואנס:** בסריקה הישנה הן');
      L.push('> חויבו על התקציב, בלעו אותו כולו בתקציבים ההדוקים, וייצרו את המסקנה השגויה שהסט');
      L.push('> "אפס מבני". השורה עצמה מופיעה ברשימת השמות למטה עם הסימון `שכבה 1`.');
      L.push('');
    }
    L.push(`**התקרה בתוך מרחב הגנים** · ${p2(D.inSpaceCeiling.holdoutRecall)} ב-holdout `
      + `(${D.inSpaceCeiling.falseAccepts} קבלות-שווא). כל סף בתקרת הגן, כל משקל ברצפתו · `
      + 'הגנום הזה שולט על כל המרחב, ומה שהוא דוחה אף גנום אינו מקבל.');
    L.push('');
    L.push('### העקומה');
    L.push('');
    L.push('**שתי עמודות recall ולא אחת.** `best` הוא ה-recall הגבוה ביותר שהתקציב קונה,');
    L.push('גם אם הוא קונה אותו בקבלה חוצת-כרטיסים. `בר-משלוח` הוא הגבוה ביותר **בלי אף');
    L.push('התנגשות**. קבלה חוצת-כרטיסים היא ערך אחד במאגר שהתקבל כערך אחר, ו-`bank_gate.js`');
    L.push('הממצה דוחה אותה על הסף · לכן עמודת `best` המורעלת אינה אופציה בשום מחיר, והעמודה');
    L.push('שחגי בוחר ממנה היא `בר-משלוח`.');
    L.push('');
    L.push('| תקציב | best (holdout) | **בר-משלוח** | מחיר הניקיון | FA / מותר | שיעור במבחן | שכבה 1 | חוצי-כרטיסים ב-best | הרכב הדליים של best |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const p of D.curve) {
      const b = Object.entries(p.buckets).filter(([k]) => k !== 'cross-card' && k !== 'cross-card-bank')
        .map(([k, v]) => `${k} ${v}`).join(' · ') || '—';
      const s = p.bestShippable;
      L.push(`| \`${p.budgetLabel}\` | ${p2(p.holdoutRecall)}${p.crossCardPoisoned ? ' ⛔' : ''} | **${s ? p2(s.holdoutRecall) : '—'}** | ${s && s.recallCostVsBest > 1e-9 ? '−' + p2(s.recallCostVsBest) : '—'} | ${p.faTotal} / ${p.allowed} | ${p.rateInTestLabel} | ${p.faLayer1} | ${p.crossCardFA ? '⛔ ' + p.crossCardFA : '0'} | ${b} |`);
    }
    L.push('');
    L.push('הרכב הדליים של **הנקודה בת-המשלוח** · זה ההרכב שחגי באמת קונה:');
    L.push('');
    L.push('| תקציב | בר-משלוח | FA | שיעור | הרכב |');
    L.push('|---|---|---|---|---|');
    for (const p of D.curve) {
      const s = p.bestShippable;
      if (!s) { L.push(`| \`${p.budgetLabel}\` | — | — | — | אין נקודה נקייה |`); continue; }
      const b = Object.entries(s.buckets).map(([k, v]) => `${k} ${v}`).join(' · ') || '—';
      L.push(`| \`${p.budgetLabel}\` | ${p2(s.holdoutRecall)} | ${s.faTotal} | ${s.rateInTestLabel} | ${b} |`);
    }
    L.push('');
    if (D.shippableCeiling) {
      L.push(`**התקרה בת-המשלוח** · ${p2(D.shippableCeiling.holdoutRecall)} עם ${D.shippableCeiling.faTotal} `
        + `קבלות-שווא (${D.shippableCeiling.rateInTestLabel}). זהו הגנום הטוב ביותר בכל הבריכה שאין בו `
        + 'אף התנגשות חוצת-כרטיסים, בכל תקציב שהוא · חסם קשיח על כל מה שיכול לשרוד את השער הממצה.');
      L.push('');
    }
    const poisoned = D.curve.filter(p => p.crossCardPoisoned);
    if (poisoned.length) {
      L.push('### ⛔ נקודות מורעלות · קבלה חוצת-כרטיסים');
      L.push('');
      L.push('קבלה חוצת-כרטיסים היא ערך אחד במאגר שהתקבל כערך אחר. `bank_gate.js` הממצה');
      L.push('דוחה אותה על הסף, ולכן **הנקודות האלה אינן ניתנות למשלוח בשום תקציב** · לא');
      L.push('משנה כמה חגי מוכן לשלם. הן נשארות בטבלה כדי שהעקומה לא תיראה טובה יותר ממה');
      L.push('שהיא, אבל הן אינן אופציה.');
      L.push('');
      L.push('| תקציב | התנגשויות | holdout |');
      L.push('|---|---|---|');
      for (const p of poisoned) L.push(`| \`${p.budgetLabel}\` | ${p.crossCardFA} | ${p2(p.holdoutRecall)} |`);
      L.push('');
      const shippable = D.curve.filter(p => !p.crossCardPoisoned);
      const bestClean = shippable[shippable.length - 1];
      L.push(`הנקודה הרופפת ביותר שאינה מורעלת: \`${bestClean.budgetLabel}\` ב-${p2(bestClean.holdoutRecall)}.`);
      L.push('');
    } else {
      L.push('**אין נקודה מורעלת** · אף תקציב בטבלה אינו מקבל ערך אחד במאגר כערך אחר'
        + (D.crossCardModelled ? '.' : ' · אבל ראה האזהרה למעלה, אין מודל לסט הזה.'));
      L.push('');
    }
    L.push('### 90%');
    L.push('');
    const N9 = D.ninetyPercent;
    L.push(`- **כולל נקודות מורעלות:** ${N9.crossedAt ? 'נחצה ב-`' + N9.crossedAt + '`' : 'לא נחצה'}. `
      + `תקרת המרחב ${p2(N9.ceilingHoldoutRecall)}.`);
    if (N9.crossedCleanAt) {
      L.push(`- **בר-משלוח (בלי אף התנגשות חוצת-כרטיסים):** נחצה ב-\`${N9.crossedCleanAt}\`.`);
    } else if (N9.shippableCeilingHoldoutRecall != null && N9.shippableCeilingHoldoutRecall < 0.90) {
      L.push(`- **בר-משלוח: לא נחצה, ולא ייחצה.** התקרה בת-המשלוח היא ${p2(N9.shippableCeilingHoldoutRecall)}, `
        + 'כלומר כל גנום במרחב שמגיע ל-90% **קונה את זה בקבלה חוצת-כרטיסים**. זו אינה שאלת תקציב '
        + 'אלא מגבלה של המרחב מול המאגר: אין מחיר שחגי יכול לשלם כדי לקנות 90% נקיים כאן.');
    } else {
      L.push('- **בר-משלוח:** לא נחצה ברשת התקציבים שנבדקה.');
    }
    L.push('');
    L.push('### קבלות-השווא בשמן');
    L.push('');
    L.push('שיעור בלי שמות אינו דוח. להלן כל קבלת-שווא בכל נקודה עד `1/1000` ועד 12 דוגמאות');
    L.push('בנקודות הרופפות יותר. `שכבה 1` מסמן קבלה שכבר קורית היום ואין גנום שמונע אותה.');
    L.push('');
    const nameBlock = (title, items, total, loose) => {
      if (!items.length) { L.push(`- ${title} · אין קבלות-שווא.`); return; }
      L.push(`- ${title} · ${total} קבלות-שווא${loose ? ' (12 ראשונות)' : ''}:`);
      for (const x of items) {
        L.push(`  - \`${x.typed}\` התקבל על **${x.term}** (יחידה ${x.unit}, מפתח \`${x.key}\`) · ${x.why}`
          + (x.crossCard ? ` · ⛔ חוצה-כרטיסים, וריאציה של \`${x.intruder}\`` : '')
          + (x.layer1 ? ' · שכבה 1' : ''));
      }
    };
    L.push('#### הנקודות בנות-המשלוח · אלה השמות שחגי קונה');
    L.push('');
    for (const p of D.curve) {
      const s = p.bestShippable;
      if (!s) { L.push(`- \`${p.budgetLabel}\` · אין נקודה נקייה.`); continue; }
      const loose = p.budget > 1 / 1000;
      nameBlock('`' + p.budgetLabel + '`', loose ? s.namedFalseAccepts.slice(0, 12) : s.namedFalseAccepts, s.faTotal + s.faLayer1, loose);
    }
    L.push('');
    L.push('#### נקודות ה-`best` · כולל המורעלות, לשם השוואה בלבד');
    L.push('');
    for (const p of D.curve) {
      const loose = p.budget > 1 / 1000;
      nameBlock('`' + p.budgetLabel + '`', loose ? p.namedFalseAccepts.slice(0, 12) : p.namedFalseAccepts, p.faTotal + p.faLayer1, loose);
    }
    L.push('');
    L.push('### מדוד במבחן מול משוער בשימוש');
    L.push('');
    L.push('⚠ **אין לנו לוגים של הקלדות אמיתיות.** לכן "בשימוש" אינו מדידה אלא מודל, והוא');
    L.push('נכתב כפונקציה של פרמטר חופשי אחד ומוצהר · ולא כמספר יחיד שנשמע כמו מדידה.');
    L.push('');
    L.push('```');
    L.push('שיעור בשימוש = P(קבלת-שווא | התשובה שהוקלדה היא החטאה-קרובה שגויה) × q');
    L.push('               ^-- נמדד אצלנו                                        ^-- לא נמדד');
    L.push('```');
    L.push('');
    L.push('`q` הוא חלקן של ההחטאות-הקרובות מכלל התשובות בשימוש. במבחן `q` הוא למעשה');
    L.push(`צפיפות המלכודות, כאן ${(100 * D.rejectRows / D.rows).toFixed(1)}% · ובשימוש הוא נמוך בהרבה, וזה כל ההפרש.`);
    L.push('');
    for (const [lbl, U] of Object.entries(D.inUse)) {
      L.push(`**תקציב \`${lbl}\`** · ${U.faTotal} קבלות-שווא · במבחן **${U.rateInTestLabel}** · `
        + `חשיפה: ${U.cardExposure.cardsWithAnyFalseAccept} כרטיסים נושאים מחרוזת שתתקבל בטעות, `
        + `מתוך ${U.cardExposure.cardsInSet} הכרטיסים שהדאטהסט מכסה בסט הזה (לא מתוך המאגר כולו · `
        + `המאגר גדול יותר, ולכן החשיפה היחסית האמיתית קטנה עוד יותר)`);
      L.push('');
      L.push('| q (חלק ההחטאות-הקרובות בשימוש) | ' + U.byQ.map(x => (x.q * 100) + '%').join(' | ') + ' |');
      L.push('|---|' + U.byQ.map(() => '---').join('|') + '|');
      L.push('| שיעור משוער בשימוש | ' + U.byQ.map(x => x.label).join(' | ') + ' |');
      L.push('');
    }
    L.push('**חולשות המודל, במפורש:**');
    L.push('');
    L.push('1. `q` אינו נמדד, וכל המספר "בשימוש" תלוי בו לינארית. מי שרוצה מספר יחיד חייב');
    L.push('   להצהיר על `q` · ואז זו הכרעה שלו ולא מדידה שלנו.');
    L.push('2. המודל מניח שאוכלוסיית השליליות במבחן מייצגת החטאות אמיתיות **בהינתן**');
    L.push('   שהתשובה היא החטאה-קרובה. זה כמעט בוודאות לא נכון: `gen_dataset` מונה שגיאות');
    L.push('   שיטתית (כל השמטה, כל החלפת שכן) ולומד אמיתי אינו מגריל אחידה מהקבוצה הזאת.');
    L.push('   **כיוון ההטיה אינו ידוע** · ייתכן ששגיאות נפוצות הן דווקא ה-`real-word`');
    L.push('   המסוכנות, וייתכן ההפך.');
    L.push('3. השורות החוצות-כרטיסים אינן "תשובה שלומד הקליד" אלא תכונה של המאגר. הן');
    L.push('   נספרות במונה במלואן ואינן במכנה · החמרה מכוונת.');
    L.push('4. **חשיפה לפי כרטיס היא כן מדידה ולא מודל**, ולכן היא המספר שכדאי להסתכל עליו');
    L.push('   כשהמודל מרגיז: כמה כרטיסים במאגר בכלל נושאים מחרוזת שתתקבל בטעות. לומד');
    L.push('   שלא נתקל בהם נושא סיכון אפס.');
    L.push('');
    L.push('### פרמטרים של הנקודות בנות-המשלוח');
    L.push('');
    L.push('⚠ אלה פרמטרים **מדודים ולא מאושרים**. אף אחד מהם לא עבר את `bank_gate.js`, וכל');
    L.push('אחד מהם חייב לעבור אותו לפני שנאמר עליו משהו · `TYPO_RULES=<path> node typo-lab/bank_gate.js`.');
    L.push('');
    L.push('| תקציב | minLen | שוליים | רצועות | מקור הגנום |');
    L.push('|---|---|---|---|---|');
    for (const p of D.curve) {
      const P = p.bestShippable ? p.bestShippable.params : p.params;
      const src = p.bestShippable ? p.bestShippable.genomeSource : p.genomeSource;
      L.push(`| \`${p.budgetLabel}\` | ${P.minLen} | ${P.vetoMargin} | ${P.bands.map(b => (b.maxLen == null ? '∞' : b.maxLen) + ':' + b.t).join(' ')} | ${src.split(' | ')[0]} |`);
    }
    L.push('');
    L.push('### שערים');
    L.push('');
    L.push('| שער | תוצאה | פרטים |');
    L.push('|---|---|---|');
    for (const [n, g] of Object.entries(D.gates)) L.push(`| \`${n}\` | ${g.pass ? '✅' : '⛔'} | ${g.detail} |`);
    L.push('');
    if (D.selftest) {
      L.push('#### `--selftest` · הוכחת שיניים');
      L.push('');
      L.push('ירוק שמעולם לא נראה אדום אינו עדות. כל שער נשבר בכוונה ונבדק שהוא נופל.');
      L.push('');
      L.push('| שבירה | ירוק על האמת | אדום כשנשבר |');
      L.push('|---|---|---|');
      for (const [n, v] of Object.entries(D.selftest)) {
        if (v.greenOnReal === undefined) continue;
        L.push(`| \`${n}\` | ${v.greenOnReal ? '✅' : '⛔'} | ${v.redWhenBroken ? '✅' : '⛔'} |`);
      }
      L.push('');
    }
  }
  L.push('---');
  L.push('');
  L.push('## האומדנים הקודמים · לא שוחזרו');
  L.push('');
  L.push('`STATE.md` שורות 163-164 רשמו: אנגלית 1/11,759 במבחן מול ~1/12,300 בשימוש,');
  L.push('עברית 1/8,406 מול ~1/117,000.');
  L.push('');
  L.push('- **המספרים "במבחן" משוחזרים בדיוק**: הם 3 קבלות-שווא על 35,278 ועל 25,217 שורות');
  L.push('  דאטהסט, בנקודת ההפעלה 1/7,000 של מרחב **4 הרצועות** הישן.');
  L.push('- **המספרים "בשימוש" אינם משוחזרים.** חיפוש בכל הריפו מצא את המסקנה בלבד; השיטה');
  L.push('  שהפיקה אותם אינה מתועדת באף ארטיפקט. הם מובאים להשוואה ומסומנים כלא-משוחזרים.');
  L.push('  שים לב שהם דורשים `q` שונה מאוד בין השפות (~37% לאנגלית מול ~3% לעברית), ואין');
  L.push('  בנתונים שלנו שום דבר שמצדיק פער כזה בין שתי שפות באותה אפליקציה.');
  L.push('');
  L.push('## שחזור');
  L.push('');
  L.push('```');
  L.push('node typo-lab/budget_sweep.js --selftest              # העקומה + הוכחת שיניים לכל שער');
  L.push('node typo-lab/budget_sweep.js --selftest --pool-cache # ועוד מטמון גנומים לריצה חוזרת מהירה');
  L.push('```');
  L.push('');
  L.push(`ריצה מלאה ${Math.round(R.wallClockSec / 60)} דקות · 336 ריצות GA. ריצה רגילה כותבת בדיוק שני`);
  L.push('ארטיפקטים: `out/budget-sweep.json` ו-`out/budget-sweep-report.md`. הדוח נגזר במלואו');
  L.push('מה-JSON · אין בו מספר שאינו נקרא משם.');
  L.push('');
  L.push('⚠ **אף פרמטר כאן לא עבר את `bank_gate.js`.** השער הממצה הוא הסמכות הסופית, והוא');
  L.push('נמצא בבעלות סוכן אחר · הוא לא הורץ מכאן. נקודה בטבלה היא מדידה, לא אישור משלוח.');
  L.push('');
  L.push('דטרמיניסטי · כל ריצת GA זרועה מ-`' + R.ver + '`, וקבוצת השליליות החוצות-כרטיסים');
  L.push('נלקחת מ-`out/coverage-cross.json` לפי מפתח ה-sha של הדאטהסט.');
  L.push('');
  fs.writeFileSync(path.join(OUT, 'budget-sweep-report.md'), L.join('\n'), 'utf8');
}

if (require.main === module) main();

/* ‏writeMarkdown מיוצאת בכוונה · הדוח נגזר במלואו מ-out/budget-sweep.json, ולכן תיקון
   נוסח אינו מחייב סריקה חוזרת בת חצי שעה. שינוי **מספר** לעולם לא ייכנס דרך כאן · כל
   מספר בדוח נקרא מה-JSON ואינו מחושב מחדש. */
module.exports = { GATES, BUDGETS, bLabel, ceilingGenome, inUseEstimate, writeMarkdown };
