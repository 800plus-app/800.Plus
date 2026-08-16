'use strict';
/* בניית מטמון התכונות · typo-lab/build_features.js
 *
 * ‏`evolve.loadRows()` עולה ~35 שניות ו-`buildCrossCard` עוד כמה דקות. כל ריצת התאמה
 * או לולאה שהייתה משלמת את זה מחדש הייתה הופכת את הלולאה לבלתי-שמישה, ולכן התכונות
 * מחולצות **פעם אחת** ונשמרות ב-`out/cache/<set>.json`.
 *
 *   node --max-old-space-size=6144 typo-lab/build_features.js
 *
 * ⚠ המטמון נגזר משלושה קלטים: הדאטהסטים, `features.js`, ו-`lib/` (דרך `loadRows`).
 * המניפסט שנכתב לצידו נושא את ה-sha של הדאטהסטים ושל `features.js`, ו-`loadCache`
 * **אינו** בודק אותו — זו בדיוק צורת התקלה של `coverage-cross.json` המעופש שתועדה
 * ב-`STATE.md`. לכן `fit.js --selftest` משווה את המניפסט מול הקבצים בפועל וצועק.
 *
 * ⛔ הפלט כבד (מאות MB) ואינו נכנס לגיט · ראה `out/.gitignore`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EV = require('./evolve.js');
const F = require('./features.js');

const OUT = path.join(__dirname, 'out');
const CACHE = path.join(OUT, 'cache');
const say = s => process.stdout.write(s + '\n');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

function main() {
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });

  /* שלב 0 · שיניים לפני שנבנה עליהן משהו. המניין ב-features.js הוא העתקה של הצורה
     שב-lib/wdist.js, וההעתקה חייבת להיות מוכחת ולא מוצהרת. */
  const probe = [['1sst', '1st'], ['fougght', 'bought'], ['zngry', 'angry'], ['tootth', 'both'],
    ['מיכמוררת', 'מכמורת'], ['אמירר', 'אמיר'], ['speck', 'speak'], ['knew', 'new']];
  const sc = F.selfcheck(probe);
  if (sc.bad) throw new Error(`build_features: המניין סוטה מ-wdist.opVectors ב-${sc.bad} מתוך ${sc.n}`);
  const broken = F.selfcheck(probe, { broken: true });
  if (!broken.bad) throw new Error('build_features: שער המניין ירוק גם על מניין שבור · אין לו שיניים');
  say(`✅ שער המניין · ${sc.n}/${sc.n} זהים · ומניין שבור מחזיר ${broken.bad} אדומים`);

  /* ⚠ שני שלבים, ובכוונה. `buildCrossCard` הוא 10M זוגות ולוקח עשרות דקות; שורות
     הדאטהסט מוכנות תוך דקות. הפרדה מאפשרת למדוד את הבסיס בזמן שהקבוצה החוצה נבנית,
     **ובלבד שכל דוח יאמר במפורש אם הוא נמדד עם הקבוצה החוצה או בלעדיה.** מדידה בלי
     הקבוצה החוצה היא מדידה של אילוץ חלש יותר · `STATE.md` מתעד שאיגום לפי recall בלי
     האילוץ הזה בוחר שיטתית גנומים מורעלים. */
  const withCross = !process.argv.includes('--no-cross');
  const t0 = Date.now();
  const { perSet, langs } = EV.loadRows();
  let X = { rows: {}, stats: { skipped: 'לא נבנה · --no-cross' } };
  if (withCross) {
    say('בונה את הקבוצה חוצת-הכרטיסים · זה החלק היקר');
    X = EV.buildCrossCard(langs, perSet);
  } else {
    say('⚠ מדלג על הקבוצה חוצת-הכרטיסים · המטמון חלש יותר וכל דוח ממנו חייב לומר זאת');
  }
  say('cross · ' + JSON.stringify(X.stats));

  const manifest = {
    generatedAt: new Date().toISOString(),
    datasets: { he: sha(path.join(OUT, 'dataset-he.jsonl')), en: sha(path.join(OUT, 'dataset-en.jsonl')) },
    features: sha(path.join(__dirname, 'features.js')),
    sets: {},
  };

  for (const set of ['he-word', 'en-word', 'gloss']) {
    const rows = perSet[set].concat(X.rows[set] || []);
    const recs = [];
    for (const r of rows) {
      const f = F.fromRow(r);
      recs.push({
        set, lang: r.lang, term: r.term, unit: r.unit, key: r.key, typed: r.typed, typedKey: r.typedKey,
        op: r.op, label: r.label, why: r.why, trusted: r.trusted !== false, fold: r.fold, holdout: !!r.holdout,
        today: !!r.today, kLen: r.kLen,
        cross: r.why === 'cross-card-bank' || r.why === 'cross-card',
        row: f.row, pairs: f.pairs,
      });
    }
    const suffix = withCross ? '' : '.nocross';
    const file = path.join(CACHE, set + suffix + '.json');
    fs.writeFileSync(file, JSON.stringify(recs));
    manifest.sets[set] = { rows: recs.length, bytes: fs.statSync(file).size };
    say(`${set} · ${recs.length} שורות · ${(fs.statSync(file).size / 1e6).toFixed(1)}MB`);
  }
  manifest.withCross = withCross;
  fs.writeFileSync(path.join(CACHE, withCross ? 'manifest.json' : 'manifest.nocross.json'), JSON.stringify(manifest, null, 1));
  say(`סה"כ ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
}

if (require.main === module) main();
module.exports = { main };
