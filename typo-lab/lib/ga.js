'use strict';
/* מנוע אלגוריתם גנטי גנרי · typo-lab/lib/ga.js
 *
 * גנרי בכוונה: הוא אינו יודע דבר על ספים, על מרחקים או על עברית. הוא מקבל מפרט גנים
 * (טווח לכל גן, ומי מהם שלם), פונקציית כושר, וזרע · ומחזיר את הטוב ביותר. כך אפשר
 * להריץ אותו שלוש פעמים על שלושה סטים בלי להעתיק אותו, ובלי שהוא ידע שיש שלושה.
 *
 * דטרמיניזם מלא: כל בחירה עוברת דרך mulberry32 זרוע. אותו זרע ואותה פונקציית כושר
 * מחזירים את אותו גנום, על כל מכונה. בלי זה, ריצת GA היא אנקדוטה ולא מדידה.
 *
 * הפרמטרים קבועים ומוצהרים (התוכנית קובעת אותם): אוכלוסייה 60, עד 80 דורות, אליטיזם 4,
 * טורניר 3, הצלבה אחידה בהסתברות 0.7, מוטציה גאוסית לגן בהסתברות 0.25 עם סטיית תקן
 * שהיא 10% מטווח הגן, ועצירה אחרי 15 דורות בלי שיפור.
 */

const { mulberry32 } = require('./rng.js');

const DEFAULTS = {
  popSize: 60,
  maxGen: 80,
  elite: 4,
  tournament: 3,
  crossoverP: 0.7,
  mutateP: 0.25,
  sigmaFrac: 0.10,
  patience: 15
};

/* גאוסי מזוג זרוע · Box-Muller. לא נשמר החצי השני בכוונה: שמירת מצב בין קריאות הייתה
   הופכת את סדר הקריאות לחלק מהתוצאה, וזה בדיוק סוג התלות ששוברת שחזור. */
function gauss(rnd) {
  let u = rnd(), v = rnd();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x, lo, hi) => x < lo ? lo : (x > hi ? hi : x);

function fix(spec, i, x) {
  const g = spec[i];
  let v = clamp(x, g.lo, g.hi);
  if (g.int) v = Math.round(v);
  return v;
}

function randomGenome(spec, rnd) {
  const out = new Array(spec.length);
  for (let i = 0; i < spec.length; i++) out[i] = fix(spec, i, spec[i].lo + rnd() * (spec[i].hi - spec[i].lo));
  return out;
}

/* בחירת טורניר · k מתמודדים אקראיים, המנצח הוא בעל הכושר הגבוה. עדיף כאן על בחירה
   פרופורציונית לכושר, כי הכושר שלנו יורד ל-1e6- בעונש המוות · יחס בין כושר של 0.9-
   לכושר של 3,000,000- אינו מספר שאפשר להסתברות עליו. */
function tournament(pop, fit, k, rnd) {
  let best = -1;
  for (let i = 0; i < k; i++) {
    const c = Math.floor(rnd() * pop.length);
    if (best < 0 || fit[c] > fit[best]) best = c;
  }
  return pop[best];
}

/* מריץ GA אחד.
 *   spec     · [{ name, lo, hi, int }]
 *   fitness  · genome -> number (גבוה יותר טוב)
 *   seeds    · גנומים פתיחה ידניים (נכנסים כמו שהם לראש האוכלוסייה)
 *   seed     · מספר · הזרע
 *   onGen    · דיווח לכל דור, לצורך ga-log
 */
function runGA(opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const spec = o.spec;
  if (!Array.isArray(spec) || !spec.length) throw new Error('runGA: an empty gene spec');
  if (typeof o.fitness !== 'function') throw new Error('runGA: fitness must be a function');
  const rnd = mulberry32(o.seed >>> 0);

  const seeds = (o.seeds || []).map(g => g.map((x, i) => fix(spec, i, x)));
  if (seeds.length > o.popSize) throw new Error(`runGA: ${seeds.length} seed genomes do not fit a population of ${o.popSize}`);

  let pop = seeds.slice();
  while (pop.length < o.popSize) pop.push(randomGenome(spec, rnd));

  const cache = new Map();
  const evalOne = g => {
    const k = g.join(',');
    let v = cache.get(k);
    if (v === undefined) { v = o.fitness(g); cache.set(k, v); }
    return v;
  };

  let best = null, bestFit = -Infinity, bestGen = -1, sinceImprove = 0;
  const log = [];

  for (let gen = 0; gen < o.maxGen; gen++) {
    const fit = pop.map(evalOne);
    let sum = 0, gBest = -1;
    for (let i = 0; i < pop.length; i++) {
      sum += fit[i];
      if (gBest < 0 || fit[i] > fit[gBest]) gBest = i;
    }
    if (fit[gBest] > bestFit + 1e-12) {
      bestFit = fit[gBest]; best = pop[gBest].slice(); bestGen = gen; sinceImprove = 0;
    } else sinceImprove++;

    const rec = { gen, best: fit[gBest], mean: sum / pop.length, bestEver: bestFit, sinceImprove };
    log.push(rec);
    if (o.onGen) o.onGen(rec, best);

    if (sinceImprove >= o.patience) break;
    if (gen === o.maxGen - 1) break;

    /* אליטיזם · ה-elite הטובים עוברים כמו שהם. בלי זה, הצלבה יכולה למחוק את המנצח
       ולהחזיר את הריצה אחורה, וזה נצפה בפועל כשעונש המוות יוצר נוף כושר קרוע. */
    const order = pop.map((_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const next = [];
    for (let i = 0; i < o.elite && i < order.length; i++) next.push(pop[order[i]].slice());

    while (next.length < o.popSize) {
      const a = tournament(pop, fit, o.tournament, rnd);
      const b = tournament(pop, fit, o.tournament, rnd);
      const child = new Array(spec.length);
      if (rnd() < o.crossoverP) {
        for (let i = 0; i < spec.length; i++) child[i] = (rnd() < 0.5 ? a[i] : b[i]);
      } else {
        const src = a;
        for (let i = 0; i < spec.length; i++) child[i] = src[i];
      }
      for (let i = 0; i < spec.length; i++) {
        if (rnd() < o.mutateP) {
          const sigma = (spec[i].hi - spec[i].lo) * o.sigmaFrac;
          child[i] = fix(spec, i, child[i] + gauss(rnd) * sigma);
        }
      }
      next.push(child);
    }
    pop = next;
  }

  return { best, bestFit, bestGen, generations: log.length, log, evaluations: cache.size };
}

module.exports = { runGA, DEFAULTS, randomGenome, gauss };
