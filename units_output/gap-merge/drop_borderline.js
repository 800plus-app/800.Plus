/* מוציא מרשימת הבחירה את שלוש המילים שהוכחתן נשענת על **הכרעה הנדסית שלי**
 * ולא על ראיה משפטית: מונח לועזי שאין לו הוכחה עברית, ואומת בשפת המקור.
 *
 * הטענה הייתה "תעתיק של מונח עתיק בנחלת הכלל אינו יוצר זכות". היא סבירה, אבל
 * ⛔ אני לא עורך דין, וחגי בחר את הקו השמרני. לכן הן יוצאות מהבחירה.
 *
 * ⚠ הן **לא נמחקות** — הן עוברות ל-`borderline-dropped.tsv` עם כל הראיות, כדי
 * שאם עו"ד יאשר את הקו הזה אפשר יהיה להחזיר אותן בלי לחזור על העבודה.
 * ⛔ אף אחת מהן אינה במאגר, ולכן זו לא מחיקת תוכן.
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
const key = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/["'\u02bc\u2019׳״]/g, '').replace(/[־‐-―]/g, ' ').replace(/\s+/g, ' ').trim();

const DROP = new Map([
  ['טבולה ראסה', 'לטינית · Summa Theologiae, Quaestio CI, תומאס אקווינס (המאה ה-13). `ראסה` בעברית מופיע רק בטקסט יהודי-ערבי, ו-`טבולה` הוא הומוגרף (טְבוּלָה למעשרות)'],
  ['פורס מזור', 'צרפתית-לטינית · L’Encyclopédie 1765, ערך VIMAIRE: «vis major, qui signifie force majeure»'],
  ['סוריאליסטי', 'צרפתית · אפולינר, Les Mamelles de Tirésias 1917: «j’ai forgé l’adjectif surréaliste»'],
]);

const path = REPO + 'gap-merge/leftovers.tsv';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const head = lines[0];
const kept = [], dropped = [];
for (const l of lines.slice(1)) {
  if (!l.trim()) continue;
  const c = l.split('\t');
  const d = DROP.get(key(c[2]));
  if (d) dropped.push([c[2], c[1], c[6], c[3], d]);
  else kept.push(l);
}

if (dropped.length !== 3) { console.log(`⛔ נמצאו ${dropped.length} ולא 3 — לא נכתב`); process.exit(1); }
/* שער: 403 = 400 שנשארו + 3 שיצאו */
if (kept.length + dropped.length !== 403) { console.log(`⛔ ${kept.length}+${dropped.length} ≠ 403`); process.exit(1); }

fs.writeFileSync(path, head + '\n' + kept.join('\n') + '\n', 'utf8');
fs.writeFileSync(REPO + 'gap-merge/borderline-dropped.tsv',
  'מילה\tהקטגוריה שהייתה\tפירוש בישן\tהסיבה שלא נכנסה בשיבוץ\tההוכחה שנמצאה, ולמה היא גבולית\n' +
  dropped.map(r => r.join('\t')).join('\n') + '\n', 'utf8');

console.log('='.repeat(62));
console.log(`הוצאו מהבחירה: ${dropped.length} · נשארו לבחירה: ${kept.length}`);
dropped.forEach(r => console.log(`   ⛔ ${r[0]}  (${r[1]})`));
console.log('='.repeat(62));
const t = {};
kept.forEach(l => { const c = l.split('\t'); t[c[1]] = (t[c[1]] || 0) + 1; });
Object.entries(t).forEach(([k, v]) => console.log(`   ${v}  ${k}`));
const flags = [...new Set(kept.map(l => l.split('\t')[7]).filter(f => f && !/🟢/.test(f)))];
console.log('='.repeat(62));
console.log(flags.length ? `⛔ נשארו דגלים לא-ירוקים: ${flags.join(' · ')}`
                         : '✓ כל 400 שנשארו הן 🟢 נקי — נחלת הכלל או CC0, בעברית');
