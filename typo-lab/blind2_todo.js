'use strict';
/* מה עוד חסר בשלב 2 של הביקורת העיוורת · והאם מה שכבר נכתב תקין.
 *
 * ⛔ נכתב אחרי שתקרת 20 הסוכנים המקבילים דחתה שיגור, ושתי אצוות כמעט אבדו
 * מהמעקב. רשימת התיקייה היא מקור האמת, לא הזיכרון שלי.
 *
 *   node typo-lab/blind2_todo.js          → מה חסר
 *   node typo-lab/blind2_todo.js --check  → + אימות פורמט של מה שנכתב
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BATCH = path.join(ROOT, 'typo-lab/out/blind/batch2s');
const VER = path.join(ROOT, 'typo-lab/out/blind/verdict2');

const batches = fs.readdirSync(BATCH).filter(f => /^D\d-\d+\.tsv$/.test(f)).map(f => f.replace('.tsv', '')).sort();
const rows = f => fs.readFileSync(path.join(BATCH, f + '.tsv'), 'utf8').split(/\r?\n/).filter(Boolean).length;

const missing = [], done = [], bad = [];
for (const b of batches) {
  for (const j of ['J1', 'J2']) {
    const p = path.join(VER, b + '-' + j + '.tsv');
    if (!fs.existsSync(p)) { missing.push(b + '-' + j); continue; }
    done.push(b + '-' + j);
    if (!process.argv.includes('--check')) continue;
    /* אימות פורמט · בדיוק 3 עמודות TAB, ואורך הרצף = מספר המועמדים */
    const cand = new Map();
    for (const l of fs.readFileSync(path.join(BATCH, b + '.tsv'), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const c = l.split('\t'); if (c[0] === 'k') continue;
      cand.set(c[0], (c[2] || '').split('|').filter(s => s.trim()).length);
    }
    let n = 0, err = [];
    for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const c = l.split('\t'); n++;
      if (c.length !== 3) { err.push(c[0] + ': ' + c.length + ' עמודות'); continue; }
      if (!cand.has(c[0])) { err.push(c[0] + ': מפתח שאינו באצווה'); continue; }
      if (c[1].length !== cand.get(c[0])) err.push(c[0] + ': רצף ' + c[1].length + ' מול ' + cand.get(c[0]) + ' מועמדים');
      if (/[^כל]/.test(c[1])) err.push(c[0] + ': תו שאינו כ/ל');
    }
    if (err.length || n !== cand.size) bad.push({ f: b + '-' + j, n, want: cand.size, err: err.slice(0, 3) });
  }
}

console.log('=== שלב 2 · ' + batches.length + ' אצוות × 2 שופטים = ' + (batches.length * 2) + ' פסקים ===');
console.log('  ✅ נכתבו : ' + done.length);
console.log('  ⬜ חסרים : ' + missing.length);
const items = missing.reduce((s, m) => s + rows(m.split('-J')[0]), 0);
console.log('  פריטים שטרם נשפטו (ספירה כפולה לשני שופטים): ' + items);
console.log();
if (missing.length) {
  console.log('=== לשגר ===');
  const byB = {};
  missing.forEach(m => { const [b, j] = m.split('-J'); (byB[b] = byB[b] || []).push('J' + j); });
  Object.entries(byB).forEach(([b, js]) => console.log('  ' + b.padEnd(7) + js.join(' ') + '   (' + rows(b) + ' שורות)'));
}
if (process.argv.includes('--check')) {
  console.log();
  console.log(bad.length ? '⛔ ' + bad.length + ' קובצי פסק פגומים:' : '✅ כל ' + done.length + ' קובצי הפסק תקינים בפורמט');
  bad.forEach(x => console.log('  ' + x.f + ' · ' + x.n + '/' + x.want + ' שורות · ' + x.err.join(' · ')));
}
