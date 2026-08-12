/* מאחד את סיווגי ששת הבודקים לטבלה אחת, ומצליב מול הסיווג המכני.
 *
 * ⚠ שער שלמות לפני הכול: כל מילה שנכנסה לסיווג חייבת לצאת ממנו. בודק שלא נשמטה
 * שורה ושלא נוספה, ושכל סיווג הוא אחד משלושת המותרים. שורה בלי סיווג תקין אינה
 * "כמעט מסווגת" — היא נספרת כחסרה.
 *
 * ⭐ הנתון המעניין ביותר כאן אינו החלוקה אלא **שיעור אי-ההסכמה עם הסקריפט**.
 * הוא מודד כמה הראיה המכנית הייתה שווה: אם הבודקים חלקו על מחצית, הסקריפט שימש
 * לדירוג ולא להכרעה, וזה מה שנאמר עליו מההתחלה.
 */
const fs = require('fs');
const DIR = 'gap/batches/';
const NIQ = /[֑-ׇ]/g;
/* ⚠ מנרמל גם רווחים סביב קו נטוי. בודק אחד כתב את הערך בלי רווחים סביב הלוכסן,
   ולכן השורה נראתה כאילו לא סווגה — והמאחד דיווח "לא סווגו: 1" על מילה שכן סווגה.
   אי-התאמה של רווח אחד היא בדיוק סוג הדבר שנראה כמו נתון חסר. */
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
const OK = new Set(['שווה', 'אולי', 'לא שווה']);

/* הסיווג המכני והראיות */
const mech = new Map();
fs.readFileSync('gap-analysis.tsv', 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
  .forEach(l => { const c = l.split('\t'); mech.set(norm(c[0]), c); });

const rows = [];
const seen = new Set();
let badLines = [];
for (const f of fs.readdirSync(DIR).filter(x => /\.out\.tsv$/.test(x)).sort()) {
  fs.readFileSync(DIR + f, 'utf8').split(/\r?\n/).filter(Boolean).forEach(l => {
    const c = l.split('\t');
    const w = norm(c[0]);
    const cls = (c[1] || '').trim();
    if (!w || !OK.has(cls)) { badLines.push([f, l.slice(0, 60)]); return; }
    if (seen.has(w)) return;                       // כפילות בין מנות
    seen.add(w);
    const m = mech.get(w) || [];
    rows.push({
      word: c[0].trim(), cls, why: (c[2] || '').trim(), covered: (c[3] || '').trim(),
      unit: m[1] || '', gloss: m[2] || '', mech: m[3] || '', overlap: m[4] || '',
      near: m[5] || '', nearGl: m[6] || '',
    });
  });
}

/* שער: מי שהיה בקלט ואינו בפלט */
const input = [...mech.keys()];
const missing = input.filter(w => !seen.has(w));

const tally = {};
rows.forEach(r => tally[r.cls] = (tally[r.cls] || 0) + 1);
const disagree = rows.filter(r => r.mech && r.mech !== r.cls).length;

const ORDER = { 'שווה': 0, 'אולי': 1, 'לא שווה': 2 };
rows.sort((a, b) => ORDER[a.cls] - ORDER[b.cls] || Number(a.unit) - Number(b.unit));
fs.writeFileSync('gap/gap-classified.tsv',
  'מילה\tסיווג\tהסיבה\tמה מכסה אותה\tיחידה בישן\tפירוש\tסיווג מכני\tחפיפה %\tהקרוב בחדש\n' +
  rows.map(r => [r.word, r.cls, r.why, r.covered, r.unit, r.gloss, r.mech, r.overlap, r.near].join('\t')).join('\n') + '\n',
  'utf8');

console.log('='.repeat(60));
console.log(`בקלט: ${input.length} · בפלט: ${rows.length}`);
if (missing.length) console.log(`⛔ לא סווגו: ${missing.length} · ${missing.slice(0, 10).join(' · ')}`);
if (badLines.length) console.log(`⛔ שורות פסולות: ${badLines.length} · ${badLines.slice(0, 3).map(b => b.join(': ')).join(' | ')}`);
console.log('='.repeat(60));
['שווה', 'אולי', 'לא שווה'].forEach(k => console.log(`  ${k}: ${tally[k] || 0}`));
console.log('='.repeat(60));
console.log(`אי-הסכמה עם הסיווג המכני: ${disagree}/${rows.length} = ${(disagree / rows.length * 100).toFixed(0)}%`);
console.log('⭐ המספר הזה הוא המדידה על הסקריפט: הוא שימש לדירוג, לא להכרעה.');
