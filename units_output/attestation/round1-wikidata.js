/* הצלבת 1,719 מילות הבנק העברי מול לקסמות ויקינתונים (CC0).
 *
 * מטרת ההתאמה: הוכחה שהמילה קיימת כערך מילוני במקור חופשי-מזכויות. לכן ההתאמה
 * שמרנית: זהות מלאה אחרי נרמול (הסרת ניקוד, NFKC, גרשיים) — לא התאמת גזע ולא
 * "קרוב". מה שלא נמצא זהה נשאר ברשימת החוסר, ויטופל מול מקור אחר או בצורה אחרת.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―-]/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* הלקסמות */
const lex = new Map();                       // צורה מנורמלת ← [Lid, הלמה המקורית]
let rows = 0;
for (let i = 0; i < 5; i++) {
  for (const line of fs.readFileSync(`attest/lex-${i}.tsv`, 'utf8').split('\n')) {
    const m = line.match(/entity\/(L\d+)>\t"?(.+?)"?(@he)?\s*$/);
    if (!m) continue;
    rows++;
    const key = norm(m[2]);
    if (key && !lex.has(key)) lex.set(key, [m[1], m[2]]);
  }
}

/* הבנק */
const w = {};
new Function('window', fs.readFileSync(process.argv[2], 'utf8'))(w);
const words = [];
Object.entries(w.UNIT_DATA).forEach(([u, arr]) =>
  arr.forEach(e => words.push({ unit: u, term: Array.isArray(e) ? e[0] : e.term })));

const hit = [], miss = [];
for (const x of words) {
  const key = norm(x.term);
  const found = lex.get(key);
  if (found) hit.push([x.term, x.unit, found[0], found[1]]);
  else miss.push([x.term, x.unit]);
}
fs.writeFileSync('wikidata-hits.tsv',
  'מילה\tיחידה\tלקסמה\tלמה במקור\n' + hit.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync('wikidata-miss.tsv',
  miss.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
console.log(`לקסמות שנטענו: ${rows} · צורות ייחודיות: ${lex.size}`);
console.log(`מילות הבנק: ${words.length}`);
console.log(`נמצאו בוויקינתונים (CC0): ${hit.length} (${(hit.length / words.length * 100).toFixed(1)}%)`);
console.log(`לא נמצאו: ${miss.length}`);
const multi = miss.filter(([t]) => norm(t).includes(' ')).length;
console.log(`  מתוכן צירופים (כמה מילים): ${multi} · מילים בודדות: ${miss.length - multi}`);
