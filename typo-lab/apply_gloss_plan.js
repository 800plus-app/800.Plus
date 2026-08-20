'use strict';
/* מחיל את typo-lab/out/gloss-plan.tsv על data-en.js.
 *
 * ⛔ data-en.js נעול ואינו נערך ידנית. הכלי הזה מחליף **רק את מחרוזת הפירוש**
 * בשורה של המילה, ומאמת שכל החלפה היא יחידה. אם ההתאמה אינה יחידה — עוצר.
 *
 *   node typo-lab/apply_gloss_plan.js --dry   → מראה מה ישתנה, לא כותב
 *   node typo-lab/apply_gloss_plan.js         → כותב + גיבוי
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data-en.js');
const DRY = process.argv.includes('--dry');

const plan = (() => {
  const L = fs.readFileSync(path.join(ROOT, 'typo-lab/out/gloss-plan.tsv'), 'utf8').split(/\r?\n/).filter(Boolean);
  const h = L.shift().split('\t');
  return L.map(l => { const c = l.split('\t'), o = {}; h.forEach((k, i) => o[k] = c[i]); return o; });
})();

let src = fs.readFileSync(FILE, 'utf8');
const before = src;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const applied = [], failed = [];

for (const r of plan) {
  const term = r['מילה'], from = r['פירוש היום'], to = r['הפירוש החדש'];
  /* ⚠ הקובץ מודפס יפה, ולכן המילה והפירוש יושבים בשתי **שורות נפרדות**:
         [
          "iceberg",
          "קרחון"
         ],
     הביטוי חייב לחצות את שבירת השורה. גרסה ראשונה הניחה `["term","gloss"`
     ברצף אחד והחזירה 0 התאמות מתוך 9 — ה-dry run תפס את זה. */
  const re = new RegExp('("' + esc(term) + '",\\s*\\n\\s*")' + esc(from) + '(")', 'g');
  const hits = src.match(re);
  if (!hits) { failed.push({ term, why: 'לא נמצאה התאמה' }); continue; }
  if (hits.length > 1) { failed.push({ term, why: hits.length + ' התאמות — לא יחידה' }); continue; }
  src = src.replace(re, '$1' + to.replace(/\$/g, '$$$$') + '$2');
  applied.push({ term, from, to });
}

console.log('=== החלה ===');
applied.forEach(a => console.log('  ✅ ' + a.term.padEnd(12) + a.from + '  →  ' + a.to));
failed.forEach(f => console.log('  ⛔ ' + f.term.padEnd(12) + f.why));
console.log('\n  הוחלו: ' + applied.length + '   נכשלו: ' + failed.length);

if (failed.length) { console.log('\n⛔ יש כשלים — לא נכתב דבר.'); process.exit(1); }
if (DRY) { console.log('\n(--dry · לא נכתב)'); process.exit(0); }

/* שער אחרי הכתיבה, לפני שנוגעים בקובץ האמיתי: הקובץ חייב להיטען,
   לשמור על מספר הערכים, ואף פירוש לא יהיה ריק או הוראה. */
const w = {};
try { vm.runInNewContext(src, { window: w }); }
catch (e) { console.log('⛔ הקובץ החדש אינו נטען: ' + e.message); process.exit(1); }
const count = Object.values(w.UNIT_DATA_EN).reduce((s, a) => s + a.length, 0);
const w0 = {}; vm.runInNewContext(before, { window: w0 });
const count0 = Object.values(w0.UNIT_DATA_EN).reduce((s, a) => s + a.length, 0);
if (count !== count0) { console.log('⛔ מספר הערכים השתנה: ' + count0 + ' → ' + count); process.exit(1); }
/* ⚠ ביטויים שלמים · ראה ההערה ב-build_gloss_plan.js. השער סירב לכתוב כי `delete`
   מפורש "למחוק", והרשימה הרחבה חסמה גם אותו. הסירוב היה נכון; הרשימה לא. */
const INSTRUCTION = /^(להסיר ניקוד|להחליף במילה|להצר ל|להוסיף מובן|לפצל ל|למחוק ערך|לאחד עם)(?=$|[\s:,.·])/;
for (const u of Object.keys(w.UNIT_DATA_EN)) for (const p of w.UNIT_DATA_EN[u]) {
  if (!p[1] || !String(p[1]).trim()) { console.log('⛔ פירוש ריק: ' + p[0]); process.exit(1); }
  if (INSTRUCTION.test(String(p[1]).trim())) { console.log('⛔ הוראה בפירוש: ' + p[0] + ' → ' + p[1]); process.exit(1); }
}

fs.writeFileSync(FILE + '.bak', before, 'utf8');
fs.writeFileSync(FILE, src, 'utf8');
console.log('\n✅ נכתב · ' + count + ' ערכים · גיבוי ב-data-en.js.bak');
