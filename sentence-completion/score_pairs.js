/* מפריד בין "פריט זוג שבור" לבין "השער קשה מדי לזוגות".
 *
 *   TAG=-full node sentence-completion/score_pairs.js runs/cloze-full-run*.txt
 *
 * למה זה נדרש
 * -----------
 * שער הקלוז דורש התאמה **בשני** החריצים. בפריט חסר בודד זו דרישה אחת; בפריט זוג
 * זו דרישה כפולה, וההסתברות לעבור נופלת ריבועית גם כשהפריט תקין לגמרי. נמדד:
 * 11 מ-14 הנפסלים הם פריטי זוג, כלומר 48% מפריטי הזוג נפסלו מול 1.7% מהבודדים.
 * זה פער של פי 28, וחשד סביר שהוא במכשיר ולא בפריטים.
 *
 * ⭐ ההבחנה: אם הפותרים קלעו לחריץ **אחד** בעקביות, ההקשר כן מכריע את החריץ הזה
 * והכשל הוא בשני בלבד. אם הם פספסו את **שניהם**, הפריט אכן שבור.
 */
const fs = require('fs'), path = require('path');
const TAG = process.env.TAG || '';
const keyFile = path.join(__dirname, `cloze.key${TAG}.tsv`);
const runs = process.argv.slice(2);
if (!runs.length) { console.error('נדרש לפחות קובץ ריצה אחד'); process.exit(1); }

const norm = s => String(s).toLowerCase().trim()
  .replace(/^(to|a|an|the)\s+/, '').replace(/[^a-z]/g, '')
  .replace(/^analyse$/, 'analyze');   // איות בריטי אינו טעות

const key = new Map();
fs.readFileSync(keyFile, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).forEach(l => {
  const c = l.split('\t');
  key.set(+c[0], { level: c[1], n: c[2], ans: c[3] });
});

/* תשובת פותר: "12: a + b, c + d"  →  רשימת נסיונות, כל נסיון מערך חריצים */
const parseRun = f => {
  const m = new Map();
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(l => {
    const mm = l.match(/^\s*(\d+)\s*:\s*(.+)$/);
    if (!mm) return;
    m.set(+mm[1], mm[2].split(',').map(x => x.split('+').map(norm)));
  });
  return m;
};
const R = runs.map(parseRun);

let pairs = 0, single = 0, rows = [];
for (const [q, k] of key) {
  /* ⚠ המפתח מפריד חריצים ב-`|` (cloze_export.js), הפותרים ב-`+` (התדריך שלהם).
     הגרסה הראשונה פיצלה את המפתח על `+` ולכן מצאה **אפס** פריטי זוג ודיווחה
     0/0 בכל שורה. טבלה של אפסים נראית כמו "אין בעיה" ולא כמו כשל בקריאה. */
  const gold = String(k.ans).split(/[|+]/).map(norm);
  if (gold.length < 2) { single++; continue; }
  pairs++;
  /* לכל חריץ: בכמה ריצות הוא נקלע, בנסיון הראשון */
  const hit = gold.map((g, slot) =>
    R.filter(r => (r.get(q) || [[]])[0] && (r.get(q) || [[]])[0][slot] === g).length);
  const both = R.filter(r => {
    const t = (r.get(q) || [[]])[0] || [];
    return gold.every((g, i) => t[i] === g);
  }).length;
  rows.push({ q, id: `${k.level}#${k.n}`, ans: k.ans, hit, both });
}

const N = R.length;
const full = rows.filter(r => r.both >= 2).length;
const oneSlot = rows.filter(r => r.both < 2 && r.hit.some(h => h >= 2)).length;
const none = rows.filter(r => r.both < 2 && !r.hit.some(h => h >= 2)).length;

console.log('='.repeat(64));
console.log(`${pairs} פריטי זוג · ${single} פריטי חסר בודד · ${N} ריצות`);
console.log('='.repeat(64));
console.log(`שני החריצים נקלעו ברוב הריצות:  ${full}/${pairs}`);
console.log(`חריץ אחד בלבד:                  ${oneSlot}/${pairs}  ← ההקשר מכריע חלקית`);
console.log(`אף חריץ:                        ${none}/${pairs}  ⛔ פריט שבור באמת`);
console.log('\nפירוט הפריטים שלא עברו במלואם:');
rows.filter(r => r.both < 2).forEach(r => {
  const label = r.hit.map((h, i) => `חריץ${i + 1}:${h}/${N}`).join(' · ');
  const verdict = r.hit.some(h => h >= 2) ? '⚠ חריץ אחד' : '⛔ שניהם';
  console.log(`  ${verdict}  ${r.id.padEnd(12)} ${String(r.ans).padEnd(26)} ${label}`);
});
console.log('\n⭐ ההכרעה: פריט שנקלע בחריץ אחד אינו "הקשר שאינו מכריע" אלא חריץ שני');
console.log('   שיש לו נרדף טבעי. זה תיקון של מילה אחת, לא פסילת פריט.');
console.log('='.repeat(64));
