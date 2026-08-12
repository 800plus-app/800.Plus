/* התוצר: הוכחת מקור חופשי ל-299 המילים שסווגו "שווה להכניס".
 *
 * שתי שכבות:
 *   283 — הוכחה שכבר נאספה בסבב על המאגר הישן, ורישיונה נחלת-הכלל/CC0.
 *    16 — נצודו כאן מחדש, כי הוכחתן הייתה CC BY-SA או גרוע מזה.
 *
 * ⚠ שער: 299 בקלט = 299 בפלט, וכל שורה עם רפרנס לא ריק ורישיון מרשימה סגורה.
 * שורה בלי רפרנס אינה "כמעט מוכחת" — היא נספרת כחסרה והסקריפט צועק.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '').replace(/["'׳״]/g, '')
  .replace(/[־‐-―]/g, ' ').replace(/-\s*$/, '').replace(/\s*\/\s*/g, ' / ')
  .replace(/\s+/g, ' ').trim();

const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const worth = fs.readFileSync('worth-299.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));

/* ההוכחות מהסבב על הישן */
const att = new Map();
const attLines = fs.readFileSync(REPO + 'attestation/attestation.tsv', 'utf8').split(/\r?\n/);
attLines.slice(1).filter(Boolean).forEach(l => { const c = l.split('\t'); att.set(norm(c[0]), c); });

/* השדרוגים שנצודו כאן */
const hunt = JSON.parse(fs.readFileSync('hunt2.json', 'utf8'));
const up = new Map();
for (const h of hunt) {
  if (h.term.includes('בִּמְבֵּם') || h.term.includes('טַבּוּלָה')) continue;   // מטופלות ידנית למטה
  const src = h.whole
    ? ['ספריא · נחלת הכלל', h.whole.ref, `הצירוף במלואו · ${h.whole.ver}`]
    : ['לפי מילה · CC0 / נחלת הכלל',
       h.per.map(p => `${p.w}=${p.ev.ref}`).join(' · '),
       h.per.map(p => `${p.w}: ${p.ev.how}`).join(' · ')];
  up.set(norm(h.term), src);
}
/* ⭐ שתי הכרעות שנעשו בקריאה ולא בסקריפט, ולכן נכתבות במפורש: */
up.set(norm('בִּמְבֵּם'), ['ויקיטקסט · נחלת הכלל',
  'בחורף/א · יוסף חיים ברנר',
  'הצורה "מבמבם" בטקסט: «והוא אוחז בכתף כולם, "מבמבם" לא בקולו». ברנר נפטר 1921']);
up.set(norm('טַבּוּלָה רָאסָה'), ['ויקיטקסט הלטיני · נחלת הכלל',
  'Summa Theologiae, Prima pars, Quaestio CI · תומאס אקווינס',
  '⚠ תעתיק של מונח לטיני עתיק: «sicut tabula rasa in qua nihil est scriptum». ' +
  'לא נמצאה הוכחה עברית — `ראסה` מופיע רק בטקסט יהודי-ערבי, ו-`טבולה` שם הוא הומוגרף (טְבוּלָה למעשרות)']);

const CLEAN = /ויקינתונים|נחלת הכלל|CC0|ויקיטקסט/;
const out = [], bad = [];
for (const [term, unit, gloss] of worth) {
  const k = norm(term);
  const u = up.get(k);
  const a = att.get(k);
  const row = u ? [term, unit, u[0], u[1], u[2]]
            : a ? [term, unit, a[2], a[3], a[4] || '']
            : null;
  if (!row || !row[3] || !CLEAN.test(row[2])) { bad.push([term, row ? row[2] : 'אין שורה']); continue; }
  out.push(row);
}

console.log('='.repeat(64));
console.log(`בקלט: ${worth.length} · בפלט עם הוכחה חופשית: ${out.length}`);
if (bad.length) { console.log(`⛔ בלי הוכחה חופשית: ${bad.length}`); bad.forEach(b => console.log(`   ${b[0]} — ${b[1]}`)); }
console.log('='.repeat(64));
const t = {}; out.forEach(r => t[r[2]] = (t[r[2]] || 0) + 1);
Object.entries(t).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}× ${k}`));

if (bad.length) { console.log('\n⛔ לא נכתב קובץ — יש שורות בלי הוכחה.'); process.exit(1); }

fs.writeFileSync(REPO + 'attestation/attestation-299-worth.tsv',
  'מילה\tיחידה בישן\tמקור ההוכחה\tרפרנס\tהערה\n' +
  out.map(r => r.join('\t')).join('\n') + '\n', 'utf8');

/* ---- ועדכון הטבלה של המאגר הישן: 16 השורות שהוכחתן שודרגה ---- */
let changed = 0;
const newAtt = attLines.map((l, i) => {
  if (i === 0 || !l) return l;
  const c = l.split('\t');
  const u = up.get(norm(c[0]));
  if (!u) return l;
  changed++;
  return [c[0], c[1], u[0], u[1], u[2]].join('\t');
});
/* ⚠ שער: מספר השורות לא זז, ובדיוק 16 השתנו */
if (newAtt.length !== attLines.length) { console.log('⛔ מספר השורות זז — לא נכתב'); process.exit(1); }
if (changed !== 16) { console.log(`⛔ ${changed} שורות שודרגו במקום 16 — לא נכתב`); process.exit(1); }
fs.writeFileSync(REPO + 'attestation/attestation.tsv', newAtt.join('\n'), 'utf8');
console.log(`\n✓ נכתב attestation-299-worth.tsv (${out.length} שורות)`);
console.log(`✓ שודרגו ${changed} שורות ב-attestation.tsv · סה"כ שורות ללא שינוי (${attLines.length})`);
