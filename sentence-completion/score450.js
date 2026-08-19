/* מנקד את שער הקלוז על 246 הפריטים החדשים, **ולפי מנה**.
 *
 *   node sentence-completion/score450.js runs/cloze450-run1.txt runs/cloze450-run2.txt ...
 *
 * למה לפי מנה ולא רק סיכום
 * ------------------------
 * תשע מנות, שמונה כותבים שעבדו בעיוורון זה מזה. ממוצע כללי של 246 פריטים יחביא
 * מנה אחת חלשה: 27 פריטים גרועים בתוך 246 מזיזים את הסיכום בכמה אחוזים ונראים
 * כרעש. פירוט לפי מנה הופך את זה לחתימה — ומצביע על **מי** לתקן, לא רק על מה.
 *
 * ⭐ וההבחנה שהוכיחה את עצמה בסבב הקודם, ולכן היא כאן מההתחלה: פריט שנפסל בקלוז
 * אינו בהכרח פריט שבור. אם המילה שהפותרים העדיפו **אינה בין ארבע האפשרויות**,
 * הפריט ממשיך להפריד ברב-ברירה, ומה שנמדד הוא שקיים בעולם נרדף טבעי יותר שלא
 * הוצע. בסבב הקודם כל שבע השאריות היו מהסוג הזה, ובשתיים מהן המילה כלל אינה
 * בבנק. לכן המנקד בודק את זה בעצמו ולא משאיר את ההבחנה לפרשנות.
 */
const fs = require('fs'), path = require('path');
const B = require('./bands.js'); B.unitOf('the');

const norm = s => String(s).toLowerCase().trim()
  .replace(/^(to|a|an|the)\s+/, '').replace(/[^a-z]/g, '').replace(/^analyse$/, 'analyze');

const key = new Map();
fs.readFileSync(path.join(__dirname, 'cloze.key-recheck.tsv'), 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).forEach(l => {
    const c = l.split('\t');
    key.set(+c[0], { src: c[1], gold: c[2].split('|').map(norm) });
  });

/* אפשרויות הפריט, כדי להכריע אם המילה שהפותרים העדיפו היא בכלל אפשרות. */
const opts = new Map();
for (const f of fs.readdirSync(path.join(__dirname, 'batches')).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(__dirname, 'batches', f), 'utf8'))
    .forEach((it, i) => opts.set(`${f.replace(/\.json$/, '')}#${i + 1}`,
      [].concat(...it.o.map(o => [].concat(o))).map(norm)));

const runs = process.argv.slice(2).map(f => {
  const m = new Map();
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(l => {
    const mm = l.match(/^\s*(\d+)\s*:\s*(.+)$/);
    if (mm) m.set(+mm[1], mm[2].split(',').map(x => x.split('+').map(norm)));
  });
  return m;
});
if (!runs.length) { console.error('נדרש לפחות קובץ ריצה אחד'); process.exit(1); }
const N = runs.length;
runs.forEach((r, i) => {
  if (r.size !== key.size)
    console.error(`⚠ ריצה ${i + 1}: ${r.size} תשובות מול מפתח בן ${key.size}. מנקד בכל זאת, והפער נאמר.`);
});

const byBatch = {};
const rows = [];
for (const [q, k] of key) {
  const batch = k.src.replace(/#.*/, '');
  const tries = runs.map(r => r.get(q) || []);
  const first = tries.filter(t => t[0] && k.gold.every((g, i) => t[0][i] === g)).length;
  const any = tries.filter(t => t.some(att => att && k.gold.every((g, i) => att[i] === g))).length;
  const v = first >= Math.ceil(N / 2) ? 'TOP1' : (any > 0 ? 'TOP3' : 'MISS');
  /* מה הפותרים העדיפו פה אחד, וכמה מזה הוא בכלל אפשרות בפריט */
  const pref = tries.map(t => (t[0] || []).join('+')).filter(Boolean);
  const unanimous = pref.length && pref.every(x => x === pref[0]) ? pref[0] : null;
  const inOpts = unanimous
    ? unanimous.split('+').every(w => (opts.get(k.src) || []).includes(w)) : false;
  (byBatch[batch] = byBatch[batch] || []).push(v);
  rows.push({ q, ...k, v, unanimous, inOpts, got: pref.join(' / ') });
}

const pct = (n, t) => `${Math.round(100 * n / t)}%`;
const tot = { TOP1: 0, TOP3: 0, MISS: 0 };
rows.forEach(r => tot[r.v]++);

console.log('='.repeat(72));
console.log(`שער הקלוז · ${key.size} פריטים חדשים · ${N} פותרים עצמאיים`);
console.log('='.repeat(72));
console.log(`TOP1 ${tot.TOP1} (${pct(tot.TOP1, key.size)}) · TOP3 ${tot.TOP3} · MISS ${tot.MISS} (${pct(tot.MISS, key.size)})`);
console.log('\nמנה     פריטים  TOP1  TOP3  MISS  אחוז-עובר');
console.log('-'.repeat(50));
for (const b of Object.keys(byBatch).sort()) {
  const v = byBatch[b], c = { TOP1: 0, TOP3: 0, MISS: 0 };
  v.forEach(x => c[x]++);
  console.log(b.padEnd(9) + String(v.length).padEnd(8) + String(c.TOP1).padEnd(6) +
    String(c.TOP3).padEnd(6) + String(c.MISS).padEnd(6) + pct(c.TOP1, v.length));
}

const miss = rows.filter(r => r.v === 'MISS');
console.log('\n' + '='.repeat(72));
console.log(`⛔ ${miss.length} פריטים שההקשר לא הכריע בהם את המפתח`);
console.log('='.repeat(72));
/* ⭐ ההפרדה שקובעת אם צריך לתקן: האם המילה המועדפת היא אפשרות בפריט. */
const real = miss.filter(r => r.inOpts), spare = miss.filter(r => !r.inOpts);
console.log(`\n⛔ ${real.length} דורשים תיקון — המילה שהפותרים העדיפו **היא אפשרות בפריט**,`);
console.log('   כלומר יש שם שתי תשובות שניתן להגן עליהן:');
real.forEach(r => console.log(`   ${r.src.padEnd(11)} מפתח ${r.gold.join('+').padEnd(22)} העדיפו ${r.unanimous}`));
console.log(`\nℹ ${spare.length} אינם פגם — המילה המועדפת אינה בין האפשרויות, ולכן`);
console.log('   הפריט ממשיך להפריד ברב-ברירה:');
spare.slice(0, 25).forEach(r => console.log(`   ${r.src.padEnd(11)} מפתח ${r.gold.join('+').padEnd(22)} העדיפו ${r.got.slice(0, 40)}`));
if (spare.length > 25) console.log(`   ... ועוד ${spare.length - 25}`);

const out = path.join(__dirname, 'runs', 'cloze450.tsv');
fs.writeFileSync(out, 'q\tsrc\tkey\tverdict\tunanimous\tinOptions\n' +
  rows.map(r => [r.q, r.src, r.gold.join('+'), r.v, r.unanimous || '', r.inOpts ? 'yes' : 'no'].join('\t')).join('\n'), 'utf8');
console.log(`\nנכתב: ${path.relative(process.cwd(), out)}`);
console.log('⚠ השער מודד הכרעת-הקשר, לא קושי. קושי נמדד על משתמשים אמיתיים.');
