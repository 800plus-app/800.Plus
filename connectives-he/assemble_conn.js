'use strict';
/* מאחד את מנות מילות הקישור לקובץ הנתונים של היחידה.
 *
 *   node connectives-he/assemble_conn.js
 *
 * ⛔ **לאן הוא כותב, ולמה לא לשורש.** התוצר הוא
 * ‏`connectives-he/data-conn-he.js`, ולא `data-conn-he.js` בשורש הריפו. שלב 5
 * בתוכנית הוא זה שמעתיק אותו לשורש יחד עם `REV` ותגי `?v=`, וקובץ נתונים
 * שנוחת בשורש לפני שהאפליקציה יודעת לטעון אותו הוא קובץ שאיש אינו מגיש · וזו
 * בדיוק תקרית ה-404 שכבר קרתה כאן. עד שלב 5 הוא יושב בתיקיית היחידה.
 *
 * ⭐ פריט שבור **נדחה ולא מפיל את הבנייה**: הקובץ נכתב עם הפריטים התקינים,
 * הדחויים מודפסים בשמם, וקוד היציאה הוא 1. שתי ההתנהגויות נדרשות יחד ·
 * בנייה שקורסת על פריט אחד עוצרת את כל הגל, וקוד יציאה 0 על דחייה הופך את
 * «נדחו: 3» לשורה שאיש אינו רואה.
 *
 * הכללים אינם משוכפלים כאן · `checkItem` מגיעה מ-`check_format_conn.js`,
 * ולכן אי אפשר שהמאחד יקבל פריט שהשער פוסל.
 */
const path = require('path');
const L = require('./lib_conn.js');
const { checkItem } = require('./check_format_conn.js');
const { writeGen } = require('../sentence-completion/write_gen.js');

const { items, files, broken, dir } = L.loadBatches();

/* ⛔ אפס פריטים הוא כשל ולא «אין מה לעשות», והבדיקה הזאת חייבת לבוא **לפני**
   הכתיבה · מנה שנמחקה בטעות הייתה מייצרת קובץ ייצור ריק ובנייה ירוקה. */
if (!items.length) {
  console.log(`מנות: ${files.join(', ') || '(אין)'} · ${dir}`);
  broken.forEach(b => console.log('⛔ ' + b));
  console.log('⛔ אפס פריטים במנות — המאחד מסרב לכתוב על ריק.');
  process.exit(2);
}

const kept = {}, rejected = broken.slice();
for (const it of items) {
  const F = checkItem(it, it.src);
  if (F.length) { rejected.push(F.join(' | ')); continue; }
  (kept[it.k] = kept[it.k] || []).push(it);
}

/* קיבוץ לפי כיוון · תמונת ראי של `window.SENT_EN` שמקובץ לפי רצועה. המגיש
   בוחר פריט, ולכן הקיבוץ הוא מה שמאפשר לו לאזן כיוונים במקום להגיש עשרה
   פריטי ויתור ברצף. */
const esc = s => JSON.stringify(s);
const order = Object.keys(L.DIRECTIONS).filter(k => kept[k]);
const lines = [
  '/* יחידת מילות הקישור · נוצר מ-connectives-he/batches/ ע"י assemble_conn.js.',
  ' * ⛔ אל תערוך ביד · העריכה הבאה תדרוס אותך. הפורמט: connectives-he/SCHEMA.md.',
  ' * ⚠ a:0 בכל פריט · **המגיש חייב לערבב o, g, r ו-d יחד**, אחרת התשובה תמיד ראשונה.',
  ' */',
  'window.CONN_HE = {',
];
for (const k of order) {
  lines.push(`  ${esc(k)}: [`);
  for (const it of kept[k]) {
    lines.push(`    { src: ${esc(it.src)}, s: ${esc(it.s)},`);
    lines.push(`      o: ${JSON.stringify(it.o)}, a: ${it.a}, k: ${esc(it.k)}, d: ${JSON.stringify(it.d)},`);
    lines.push(`      w: ${esc(it.w)}, slot: ${esc(it.slot)}, flip: ${JSON.stringify(it.flip)},`);
    lines.push(`      g: ${JSON.stringify(it.g)}, r: ${JSON.stringify(it.r)} },`);
  }
  lines.push('  ],');
}
lines.push('};', '');

const dest = path.join(L.DIR, 'data-conn-he.js');
const נכתב = writeGen(dest, lines.join('\n'));

const total = Object.values(kept).reduce((a, v) => a + v.length, 0);
console.log(L.BAR);
console.log(`מנות: ${files.join(', ') || '(אין)'} · ${dir}`);
console.log(`נקראו: ${items.length} · נכנסו: ${total} · נדחו: ${rejected.length}`);
console.log(order.map(k => `${L.DIRECTIONS[k]} ${kept[k].length}`).join(' · ') || '(ריק)');
console.log((נכתב ? 'נכתב' : 'ללא שינוי · התוכן זהה') + ': connectives-he/data-conn-he.js');
if (rejected.length) {
  console.log('\n⛔ נדחו:');
  rejected.forEach(r => console.log('  ' + r));
}
console.log(L.BAR);
process.exit(rejected.length ? 1 : 0);
