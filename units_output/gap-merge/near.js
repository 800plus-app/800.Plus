/* השער חוסם פירוש **זהה** לקיים. אבל הממצא הגדול בביקורות הקודמות היה 851 זוגות
 * **קרובים מדי** — וזהות מדויקת לא תופסת אותם. כאן נמדדת חפיפת מילות תוכן בין כל
 * פירוש חדש לכל פירוש קיים, וכל זוג מעל 60% מוצג לעין.
 *
 * ⚠ זו מדידה ולא שער: שני נרדפים אמיתיים (`חמה` ו-`עברה`) הם פריטי מבחן נפרדים
 * לגיטימיים, ולכן חפיפה גבוהה היא סימן לבדיקה ולא פסילה אוטומטית.
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '').replace(/\s+/g, ' ').trim();
const STOP = new Set('של את על מן אל עם או גם לא אין יש כל מי מה זה זו הוא היא הם בין לפי כמו אחרי לפני בתוך בלי מאוד רק כבר עוד היה הייתה היו להיות אדם דבר משהו מישהו כדי בדרך בעיקר למשל וכן וגם אך אבל כן ללא שאינו מתוך'.split(' '));
const words = g => norm(g).replace(/\([^)]*\)/g, ' ').split(/[\s,;:()]+/)
  .filter(x => x.length >= 2 && !STOP.has(x));

const bank = [];
for (let u = 1; u <= 10; u++)
  fs.readFileSync(REPO + (u === 1 ? 'unit-1-flat.md' : `unit-${u}-hebrew.md`), 'utf8')
    .split(/\r?\n/).forEach(l => {
      const m = l.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
      if (m && m[2].trim()) bank.push({ u, w: norm(m[1]), gl: m[2].trim(), ws: words(m[2]) });
    });

const add = fs.readFileSync('accepted.tsv', 'utf8').split(/\r?\n/).filter(Boolean)
  .map(l => l.split('\t')).map(c => ({ w: norm(c[0]), u: c[2], gl: c[4], ws: words(c[4]) }));

console.log(`${add.length} תוספות מול ${bank.length} קיימות\n`);
const hits = [];
for (const a of add) {
  if (!a.ws.length) continue;
  for (const b of bank) {
    if (!b.ws.length) continue;
    const s = new Set(b.ws);
    const hit = a.ws.filter(w => s.has(w)).length;
    const ov = hit / Math.min(a.ws.length, b.ws.length);
    if (ov >= 0.6) hits.push({ a, b, ov: Math.round(ov * 100) });
  }
}
hits.sort((x, y) => y.ov - x.ov);
console.log(`זוגות בחפיפה ≥60%: ${hits.length}`);
hits.slice(0, 30).forEach(h =>
  console.log(`  ${h.ov}%  ${h.a.w} (י${h.a.u}: ${h.a.gl})  ↔  ${h.b.w} (י${h.b.u}: ${h.b.gl})`));

/* וגם בין התוספות לעצמן */
const self = [];
for (let i = 0; i < add.length; i++) for (let j = i + 1; j < add.length; j++) {
  const A = add[i], B = add[j];
  if (!A.ws.length || !B.ws.length) continue;
  const s = new Set(B.ws);
  const ov = A.ws.filter(w => s.has(w)).length / Math.min(A.ws.length, B.ws.length);
  if (ov >= 0.6) self.push(`  ${Math.round(ov * 100)}%  ${A.w} (${A.gl}) ↔ ${B.w} (${B.gl})`);
}
console.log(`\nבין התוספות לעצמן: ${self.length}`);
self.slice(0, 15).forEach(x => console.log(x));
