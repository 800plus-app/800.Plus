/* מנת הסבב השני.
 *
 * ⛔ למה היא נדרשת, וזו טעות שלי ולא של הסוכנים: נתתי לכל סוכן את "המשפחה
 * הקיימת" של השורש ה**משוער**. הסוכנים תיקנו את השורש — נכון, ו-90 תיקונים — ואז
 * השורש המתוקן התנגש עם מילה שמעולם לא הצגתי להם. `כִּיסוּפִים` תוקן ל-`כספ`
 * ופגש את `נכסף` שלא היה בקלט שלו.
 *
 * כאן ההתנגשות **האמיתית** מוצגת: המילה, הפירוש שנכתב לה, המילה הקיימת, הפירוש
 * שלה, והיחידה. ההכרעה היא בין `חריג` (משמעות שונה מהותית) ל-`נפסל` (נגזרת שקופה).
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/[־‐-―]/g, '-').replace(/\s+/g, ' ').trim();

/* המאגר: מילה → {יחידה, פירוש}; ושורש → מילים */
const info = new Map(), byRoot = new Map();
for (let u = 1; u <= 10; u++) {
  const gl = new Map();
  fs.readFileSync(REPO + (u === 1 ? 'unit-1-flat.md' : `unit-${u}-hebrew.md`), 'utf8')
    .split(/\r?\n/).forEach(l => {
      const m = l.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
      if (m) gl.set(norm(m[2]), m[3].trim());
    });
  fs.readFileSync(REPO + `unit-${u}-words.tsv`, 'utf8').split('\n').filter(x => x.trim()).forEach(l => {
    const p = l.split('\t'); if (p.length !== 3) return;
    const w = norm(p[1]);
    info.set(w, { u, gl: gl.get(w) || '' });
    norm(p[2]).split(',').forEach(r => { r = r.trim(); if (!r) return; if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(w); });
  });
}

const acc = fs.readFileSync('accepted.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
const errs = fs.readFileSync('validation.txt', 'utf8').split(/\r?\n/).filter(Boolean);
const need = new Set();
errs.forEach(e => { const m = e.match(/^(.+?): השורש/); if (m) need.add(m[1]); });
/* וגם התנגשות פנימית בין שתי תוספות */
const rows = [];
for (const [term, root, unit, sec, gloss] of acc) {
  if (!need.has(term)) continue;
  const others = [];
  root.split(',').forEach(raw => {
    const rt = norm(raw);
    (byRoot.get(rt) || []).forEach(w => {
      const i = info.get(w);
      others.push(`"${w}" (י${i.u}: ${i.gl})`);
    });
    /* תוספת אחרת באותו שורש */
    acc.forEach(a => { if (a[0] !== term && norm(a[1]) === rt) others.push(`"${norm(a[0])}" (תוספת חדשה, י${a[2]}: ${a[4]})`); });
  });
  rows.push([term, root, unit, gloss, [...new Set(others)].join(' | ')]);
}
console.log(`דורשות הכרעת שורש: ${rows.length}`);
fs.writeFileSync('packets/in-p2.tsv',
  'מילה מנוקדת\tשורש\tיחידה שנקבעה\tהפירוש שנכתב לה\tהמילים הקיימות באותו שורש\n' +
  rows.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
console.log('נכתב packets/in-p2.tsv');
rows.slice(0, 8).forEach(r => console.log(`  ${r[0]} (${r[3]}) · ${r[1]} · מול ${r[4].slice(0, 80)}`));
