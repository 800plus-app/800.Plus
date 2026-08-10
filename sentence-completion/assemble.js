/* מאחד את מנות הכותבים ל-`sentences-en-v3.js`, ומקבץ **לפי הרצועה הנגזרת**.
 *
 *   node sentence-completion/assemble.js
 *
 * למה לא לסמוך על החלוקה שהכותב הצהיר עליה: הרצועה נגזרת מ-max מספר היחידה
 * (`bands.js`), ולכן היא עובדה ולא הצהרה. כותב שכתב "אקדמי" ובחר מסיחים מיחידה 7
 * כתב פריט מתקדם. המאחד מקבץ לפי מה שנמדד, ומדפיס כל אי-התאמה.
 *
 * ⚠ הוא גם דוחה פריט שמסיח שלו אינו בבנק. בלי זה הפריט מגיע לשער בלי יחידה,
 * הרצועה יוצאת '?' והפריט נספר כאילו נבדק.
 */
const fs = require('fs'), path = require('path');
const B = require('./bands.js');

const dir = path.join(__dirname, 'batches');
/* ⚠ תוקן ב-10.8: הפילטר היה מוגבל לארבעה שמות, ולכן `v2.json` (8 הפריטים המאומתים)
   נאסף בשקט לאף מקום — הספירה הראתה 34 במקום 42. מנה שנשמטת בלי הודעה גרועה ממנה
   שנדחית. עכשיו נאספת כל `*.json`, ומנה שאין לה רצועה מוצהרת פשוט אינה נבדקת לסחיפה. */
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
if (!files.length) { console.error('אין מנות ב-batches/'); process.exit(2); }

const byBand = {}; B.BANDS.forEach(b => byBand[b.name] = []);
const rejected = [], moved = [];
const DECLARED = { base: 'בסיס', mid: 'בינוני', adv: 'מתקדם', aca: 'אקדמי' };
let total = 0;

for (const f of files) {
  const declared = DECLARED[path.basename(f, '.json')];
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
  catch (e) { rejected.push(`${f} :: JSON שבור — ${e.message}`); continue; }
  if (!Array.isArray(arr)) { rejected.push(`${f} :: אינו מערך`); continue; }

  arr.forEach((it, i) => {
    total++;
    const id = `${f}#${i + 1}`;
    const flat = [].concat(...it.o.map(o => [].concat(o)));
    const units = flat.map(w => B.unitOf(w));
    const missing = flat.filter((w, j) => units[j] === null);
    if (missing.length) { rejected.push(`${id} :: מסיחים שאינם בבנק — ${missing.join(', ')}`); return; }
    const mx = Math.max(...units);
    const band = B.bandOfUnit(mx);
    if (declared && band !== declared) moved.push(`${id} :: הוצהר ${declared} · נגזר ${band} (maxUnit=${mx})`);
    /* ⛔ נוסף ב-10.8 אחרי שכמעט גרם לנזק: המאחד ממיין מחדש בתוך רצועה, ולכן מספר
       השורה בשער **אינו** האינדקס בקובץ המנה. שלחתי לכותב "פריטים 1,2,3,5 נכשלו,
       אל תיגע ב-4 ו-6" — ובפועל 4 ו-6 היו מהשבורים. הוא הלך לפי פלט השער ולא לפי
       ההוראה שלי, וזה מה שהציל את המנה. `src` נושא את המקור, והשער מציג אותו. */
    it.src = `${path.basename(f, '.json')}#${i + 1}`;
    byBand[band].push(it);
  });
}

/* §4 — סדר קושי עולה בתוך רצועה, לפי max היחידה. הרזולוציה היא עשר מדרגות,
   ולכן זה מיון גס; §5 בתדריך אומר את זה במפורש. */
for (const b of Object.keys(byBand)) {
  byBand[b].sort((x, y) => {
    const u = it => Math.max(...[].concat(...it.o.map(o => [].concat(o))).map(w => B.unitOf(w) || 0));
    return u(x) - u(y);
  });
}

const esc = s => JSON.stringify(s);
const lines = [
  '/* השלמת משפטים באנגלית · v3 · מאוחד מ-batches/ ע"י assemble.js — אל תערוך ביד.',
  ' *',
  ' * הרצועות כאן **נגזרו** מ-max מספר היחידה ב-data-en.js (bands.js), ולא מההצהרה',
  ' * של הכותב. הכללים שהפריטים נכתבו לפיהם: WRITING-BRIEF.md.',
  ' * ⚠ a:0 בכל פריט — **המגיש חייב לערבב**, אחרת כל התשובות יוצאות באות אחת.',
  ' */',
  'window.SENT_EN = {',
];
for (const b of B.BANDS.map(x => x.name)) {
  lines.push(`  ${esc(b)}: [`);
  byBand[b].forEach(it => {
    lines.push(`    { src: ${esc(it.src)}, s: ${esc(it.s)},`);
    lines.push(`      o: ${JSON.stringify(it.o)}, a: ${it.a}, k: ${esc(it.k)}, w: ${JSON.stringify(it.w)},`);
    /* g/t/r הם הפורמט שחגי אישר ב-10.8: פירוש ארבע האפשרויות · תרגום המשפט
       כשהתשובה מושלמת ומודגשת · נימוק לכל אפשרות בנפרד. `e` נשמר כמקור החומר
       שממנו `r` נגזר, ולא מוצג ללומד. FORMAT-BRIEF.md. */
    lines.push(`      g: ${JSON.stringify(it.g || [])}, t: ${esc(it.t || '')},`);
    lines.push(`      r: ${JSON.stringify(it.r || [])},`);
    lines.push(`      e: ${esc(it.e)} },`);
  });
  lines.push('  ],');
}
lines.push('};', '');
fs.writeFileSync(path.join(__dirname, 'sentences-en-v3.js'), lines.join('\n'), 'utf8');

const kept = Object.values(byBand).reduce((a, v) => a + v.length, 0);
console.log('מנות: ' + files.join(', '));
console.log('נקראו: ' + total + ' · נכנסו: ' + kept + ' · נדחו: ' + rejected.length);
console.log(B.BANDS.map(b => b.name + ' ' + byBand[b.name].length).join(' · '));
if (moved.length) { console.log('\n⚠ רצועה נגזרת שונה מההצהרה:'); moved.forEach(m => console.log('  ' + m)); }
if (rejected.length) { console.log('\n⛔ נדחו:'); rejected.forEach(r => console.log('  ' + r)); }
console.log('\nנכתב: sentences-en-v3.js');
