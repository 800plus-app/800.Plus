/* מייצא את אוצר המילים הזמין לכותב, לפי רצועה.
 *
 *   node sentence-completion/vocab_export.js אקדמי
 *   node sentence-completion/vocab_export.js מתקדם > batch.txt
 *
 * למה זה נדרש: כלל 2 בתדריך אומר שכל ארבעת המסיחים חייבים להיות ב-`data-en.js`,
 * אחרת אין להם יחידה ואי אפשר לגזור רצועה. כותב שאינו רואה את הרשימה ימציא מסיחים
 * שאינם בבנק — וזה בדיוק מה שקרה ב-v1, שם `ratify` ו-`endorse` נבחרו והתגלו כחסרים
 * רק אחרי שהפריט נכתב.
 *
 * מייצא **מונחים בלבד, בלי הפירוש העברי.** שתי סיבות: הפירוש מכפיל את הנפח, וכותב
 * אנגלית אינו צריך אותו כדי לזהות שדה סמנטי. מה שכן נדרש הוא מספר היחידה, כי הוא
 * מה שקובע את הרצועה.
 */
const B = require('./bands.js');

const want = process.argv[2];
const band = B.BANDS.find(b => b.name === want);
if (!band) {
  console.error('רצועה: ' + B.BANDS.map(b => b.name).join(' | '));
  process.exit(2);
}

const map = B.unitMap();
const byUnit = new Map();
for (const [term, unit] of map) {
  if (unit < band.lo || unit > band.hi) continue;
  if (!byUnit.has(unit)) byUnit.set(unit, []);
  byUnit.get(unit).push(term);
}

/* גם היחידות שמתחת לרצועה — מסיח אחד גבוה מספיק כדי לקבוע רצועה, ולכן שאר השדה
   הסמנטי מותר לבוא מלמטה. בלי זה אי אפשר לבנות אשכול נרדפות סביר כמעט לעולם. */
const below = [];
if (band.lo > 1) for (const [term, unit] of map) if (unit < band.lo) below.push([unit, term]);

const units = [...byUnit.keys()].sort((a, b) => a - b);
console.log(`# רצועה: ${want} · יחידות ${band.lo}–${band.hi}`);
console.log(`# ⚠ לפחות מסיח אחד חייב לבוא מיחידות ${band.lo}–${band.hi}, אחרת הפריט לא ייפול ברצועה.`);
console.log('');
for (const u of units) {
  const list = byUnit.get(u).sort();
  console.log(`## יחידה ${u} · ${list.length} מונחים — לפחות אחד מכאן`);
  console.log(list.join(' · '));
  console.log('');
}
if (below.length) {
  const list = below.map(x => x[1]).sort();
  console.log(`## יחידות 1–${band.lo - 1} · ${list.length} מונחים — מותרים כמסיחים נוספים`);
  console.log(list.join(' · '));
}
