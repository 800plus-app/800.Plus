'use strict';
/* מה חסר בשלב 3 · פאנל של שלושה, ואימות פורמט של מה שנכתב.
 *
 * ⚠ אותה אזהרה כמו ב-blind2_todo: הכלי מראה מה **על הדיסק**, לא מה **באוויר**.
 * סוכן שרץ נראה כאן כחסר. בשלב 2 זה גרם לשלושה שיגורים כפולים, ואצווה אחת
 * (D3-13-J2) נדחפה החוצה ולא שוגרה כלל. לפני שיגור — לבדוק גם מה כבר באוויר.
 *
 *   node typo-lab/blind3_todo.js          → מה חסר
 *   node typo-lab/blind3_todo.js --check  → + אימות פורמט
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BATCH = path.join(ROOT, 'typo-lab/out/blind/batch3');
const VER = path.join(ROOT, 'typo-lab/out/blind/verdict3');
const JUDGES = ['J1', 'J2', 'J3'];

const batches = fs.readdirSync(BATCH).filter(f => /^P-\d+\.tsv$/.test(f)).map(f => f.replace('.tsv', '')).sort();
const keysOf = b => {
  const s = new Set();
  for (const l of fs.readFileSync(path.join(BATCH, b + '.tsv'), 'utf8').split(/\r?\n/).filter(Boolean)) {
    const k = l.split('\t')[0]; if (k !== 'k') s.add(k);
  }
  return s;
};

const missing = [], done = [], bad = [];
for (const b of batches) {
  const want = keysOf(b);
  for (const j of JUDGES) {
    const p = path.join(VER, b + '-' + j + '.tsv');
    if (!fs.existsSync(p)) { missing.push(b + '-' + j); continue; }
    done.push(b + '-' + j);
    if (!process.argv.includes('--check')) continue;
    const seen = new Set(); const err = [];
    for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const c = l.split('\t');
      if (c.length !== 2) { err.push(c[0] + ': ' + c.length + ' עמודות'); continue; }
      if (!want.has(c[0])) { err.push(c[0] + ': מפתח שאינו באצווה'); continue; }
      if (!/^[ABאב]$/.test(c[1].trim())) { err.push(c[0] + ': תווית "' + c[1] + '" אינה A/B'); continue; }
      if (seen.has(c[0])) err.push(c[0] + ': מפתח כפול');
      seen.add(c[0]);
    }
    if (err.length || seen.size !== want.size)
      bad.push({ f: b + '-' + j, n: seen.size, want: want.size, err: err.slice(0, 3) });
  }
}

console.log('=== שלב 3 · ' + batches.length + ' אצוות × 3 שופטים = ' + (batches.length * 3) + ' פסקים ===');
console.log('  ✅ נכתבו : ' + done.length);
console.log('  ⬜ חסרים : ' + missing.length);
console.log();
if (missing.length) {
  const byB = {};
  missing.forEach(m => { const i = m.lastIndexOf('-J'); (byB[m.slice(0, i)] = byB[m.slice(0, i)] || []).push(m.slice(i + 1)); });
  console.log('=== לשגר ===');
  Object.entries(byB).forEach(([b, js]) => console.log('  ' + b.padEnd(6) + js.join(' ') + '   (' + keysOf(b).size + ' פריטים)'));
}
if (process.argv.includes('--check')) {
  console.log();
  console.log(bad.length ? '⛔ ' + bad.length + ' קובצי פסק פגומים:' : '✅ כל ' + done.length + ' קובצי הפסק תקינים בפורמט');
  bad.forEach(x => console.log('  ' + x.f + ' · ' + x.n + '/' + x.want + ' · ' + x.err.join(' · ')));
}
