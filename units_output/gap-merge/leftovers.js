/* רשימת כל מה שנשאר מ-599 מילות הפער, לבחירה של חגי.
 *
 * ארבע קטגוריות, וכל שורה נושאת את מה שצריך כדי להכריע: הסיבה שהיא לא נכנסה,
 * מה מכסה אותה, הפירוש הישן, ו-**דגל הרישיון**.
 *
 * ⛔ דגל הרישיון הוא העמודה הקריטית. 299 ה"שווה" עברו ציד ויש להן מקור נחלת-הכלל.
 * 151 ה"אולי" ו-149 ה"לא שווה" **לא עברו ציד** — הן נושאות את ההוכחה מהסבב על
 * המאגר הישן, ושם יש גם ויקימילון (אסור לפי כלל א5) וגם חמש בלי הוכחה בכלל.
 * מילה שתיבחר עם דגל אדום תצטרך ציד לפני שהיא נכנסת.
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '').replace(/["'ʼ’׳״]/g, '')
  .replace(/[־‐-―]/g, ' ').replace(/-\s*$/, '').replace(/\s*\/\s*/g, ' / ')
  .replace(/\s+/g, ' ').trim();

/* סיווג הפער */
const gap = new Map();
fs.readFileSync(REPO + 'gap/gap-classified.tsv', 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
  .forEach(l => { const c = l.split('\t'); gap.set(norm(c[0]), c); });

/* הוכחות: קודם הציד של 299, ואם לא — הסבב על הישן */
const clean = new Map(), old = new Map();
fs.readFileSync(REPO + 'attestation/attestation-299-worth.tsv', 'utf8').split(/\r?\n/).slice(1)
  .filter(Boolean).forEach(l => { const c = l.split('\t'); clean.set(norm(c[0]), c[2]); });
fs.readFileSync(REPO + 'attestation/attestation.tsv', 'utf8').split(/\r?\n/).slice(1)
  .filter(Boolean).forEach(l => { const c = l.split('\t'); old.set(norm(c[0]), c[2] || ''); });
const noProof = new Set(fs.readFileSync(REPO + 'attestation/attestation-missing.tsv', 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).map(l => norm(l.split('\t')[0])));

function licFlag(w) {
  if (clean.has(w)) return ['🟢 נקי', clean.get(w)];
  if (noProof.has(w)) return ['🔴 אין הוכחה', ''];
  const s = old.get(w) || '';
  if (!s) return ['🔴 אין הוכחה', ''];
  if (/ויקימילון|ויקיפדיה|BY-SA|BY \(/.test(s)) return ['🟠 דורש ציד · ' + s.split(' (')[0], s];
  if (/מוגן/.test(s)) return ['🔴 מקור מוגן', s];
  return ['🟢 נקי', s];
}

const rows = [];
/* א · 101 שנפסלו בשיבוץ */
fs.readFileSync('rejected.tsv', 'utf8').split(/\r?\n/).filter(Boolean).forEach(l => {
  const [term, why] = l.split('\t');
  const w = norm(term), g = gap.get(w) || [];
  const [flag, src] = licFlag(w);
  rows.push(['נפסלה בשיבוץ', term, why || '', g[3] || '', g[4] || '', g[5] || '', flag, src]);
});
/* ב · 2 שהוצאו לפני */
[['הִסְתּוֹפֵף', 'המילה כבר בצובר כחסימה מכוונת; הצירוף "הסתופף בצילו" ביחידה 9'],
 ['טַבּוּלָה רָאסָה', 'אין הוכחה עברית — ההוכחה היא למונח הלטיני. דורשת הכרעת עו"ד']]
  .forEach(([term, why]) => {
    const w = norm(term), g = gap.get(w) || [];
    const [flag, src] = licFlag(w);
    rows.push(['הוצאה לפני השיבוץ', term, why, g[3] || '', g[4] || '', g[5] || '', flag, src]);
  });
/* ג+ד · 151 אולי · 149 לא שווה */
for (const [w, c] of gap) {
  const cls = c[1].trim();
  if (cls === 'שווה') continue;
  const [flag, src] = licFlag(w);
  rows.push([cls === 'אולי' ? 'אולי · לא נבדקה' : 'לא שווה · הוכרעה', c[0], c[2] || '', c[3] || '', c[4] || '', c[5] || '', flag, src]);
}

const ORDER = { 'נפסלה בשיבוץ': 0, 'הוצאה לפני השיבוץ': 1, 'אולי · לא נבדקה': 2, 'לא שווה · הוכרעה': 3 };
rows.sort((a, b) => ORDER[a[0]] - ORDER[b[0]] || (a[6] < b[6] ? -1 : 1) || Number(a[4]) - Number(b[4]));

fs.writeFileSync(REPO + 'gap-merge/leftovers.tsv',
  'בחר\tקטגוריה\tמילה\tהסיבה שלא נכנסה\tמה מכסה אותה\tיחידה בישן\tפירוש בישן\tרישיון\tמקור ההוכחה\n' +
  rows.map(r => ['', ...r].join('\t')).join('\n') + '\n', 'utf8');

const t = {}, f = {};
rows.forEach(r => { t[r[0]] = (t[r[0]] || 0) + 1; f[r[6].split(' · ')[0]] = (f[r[6].split(' · ')[0]] || 0) + 1; });
console.log('='.repeat(58));
console.log(`סה"כ לבחירה: ${rows.length}`);
Object.entries(ORDER).forEach(([k]) => console.log(`   ${t[k] || 0}  ${k}`));
console.log('='.repeat(58));
Object.entries(f).sort().forEach(([k, v]) => console.log(`   ${v}  ${k}`));
console.log('='.repeat(58));
/* שער: 599 = 196 שנכנסו + מה שכאן + 3 כפילויות-מקף שנספרות בנפסלות */
console.log(`שער: 196 נכנסו + ${rows.length} כאן = ${196 + rows.length} · בפער היו 599`);
