/* מודד אי-התאמה בין **מילת הקישור** שבמשפט לבין **סוג ההיגיון** שהוצהר ב-`k`.
 *
 *   node sentence-completion/check_connectives.js
 *
 * למה זה הפגם המערכתי היחיד שלא נסגר
 * -----------------------------------
 * שלושה קוראים עצמאיים, בשני סבבי מדידה נפרדים, סימנו את אותו דבר: `moreover`,
 * `furthermore`, `likewise` ו-`in addition` מחברים פסוקיות שאין ביניהן יחס
 * הוספה. בסבב הראשון שני פותרי רב-ברירה סימנו את הדפוס הזה כרוב מקרי "האנגלית
 * הלא טבעית" שלהם, ובמדידה החוזרת הקורא העוין סימן אותו שוב בחמישה פריטים.
 *
 * ⭐ ולמה זה חמור **דווקא כאן**: הקורפוס הזה בנוי סביב מילות קישור. כל פריט נושא
 * `k` (סוג ההיגיון) ו-`w` (מילת הקישור), והם ציר הפריט ולא קישוט. מילת קישור
 * שמשמשת נגד ההיגיון שלה אינה שגיאת סגנון, היא שגיאה בפריט המבחן.
 *
 * ⚠ מה השער הזה **יכול** למדוד: התאמה בין מילת הקישור לקטגוריה. מה שהוא **אינו**
 * יכול למדוד: אם הפסוקיות עצמן באמת נושאות את היחס. פסוקית שמוצהרת כהוספה
 * ומכילה `moreover` תעבור כאן גם אם התוכן הוא ניגוד. זה שיפוט אנושי, וזה נאמר.
 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'batches');

/* מיפוי מילת קישור → הקטגוריה שהיא באמת מסמנת באנגלית. */
const CAT = {
  addition:  ['moreover', 'furthermore', 'in addition', 'besides', 'also', 'as well',
              'likewise', 'similarly', 'what is more'],
  contrast:  ['yet', 'however', 'although', 'though', 'even though', 'even so', 'still',
              'nevertheless', 'nonetheless', 'whereas', 'while', 'but', 'rather', 'instead',
              'on the contrary', 'in contrast', 'despite', 'in spite of'],
  cause:     ['because', 'since', 'as', 'therefore', 'thus', 'hence', 'so', 'consequently',
              'for this reason', 'accordingly'],
  condition: ['if', 'unless', 'until', 'once', 'provided', 'as long as', 'in case', 'when'],
  sequence:  ['then', 'next', 'afterwards', 'finally', 'first', 'later', 'before', 'after'],
  purpose:   ['so that', 'in order to', 'so as to', 'lest'],
  /* ⚠ נוסף אחרי הריצה הראשונה: `example` הוא סוג היגיון קיים בקורפוס (17 פריטים)
     ולא היה במיפוי, ולכן 21 פריטים תקינים דווחו כ"מילה שאינה במיפוי". דיווח כזה
     נראה כמו רשימת בעיות והוא היה פער בשער, לא בנתונים. */
  example:   ['such as', 'for instance', 'for example', 'including', 'as well as'],
};
/* `likewise`/`similarly` מסמנות **הקבלה**, וזה תת-סוג של הוספה אך לא כל הוספה.
   נשמר בנפרד כדי לדגול שימוש בהן בלי שתי פסוקיות מקבילות. */
const PARALLEL = new Set(['likewise', 'similarly']);

const catOf = w => {
  const s = String(w).toLowerCase().trim();
  for (const [c, list] of Object.entries(CAT)) if (list.includes(s)) return c;
  return null;
};

const items = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    .forEach((it, i) => items.push({ ...it, src: `${f.replace(/\.json$/, '')}#${i + 1}` }));

const mismatch = [], unknown = [], parallel = [], noW = [];
const byK = {}, byW = {};
for (const it of items) {
  byK[it.k] = (byK[it.k] || 0) + 1;
  const ws = it.w || [];
  if (!ws.length) { noW.push(it.src); continue; }
  for (const w of ws) {
    byW[String(w).toLowerCase()] = (byW[String(w).toLowerCase()] || 0) + 1;
    const c = catOf(w);
    if (!c) { unknown.push(`${it.src} · "${w}" אינה במיפוי`); continue; }
    if (c !== it.k) mismatch.push(`${it.src} · "${w}" מסמנת ${c} · הוצהר ${it.k}`);
    if (PARALLEL.has(String(w).toLowerCase())) parallel.push(`${it.src} · "${w}"`);
  }
}

console.log('='.repeat(68));
console.log(`${items.length} פריטים · התאמת מילת הקישור לסוג ההיגיון`);
console.log('='.repeat(68));
console.log('סוגי היגיון: ' + Object.entries(byK).sort((a,b)=>b[1]-a[1])
  .map(([k,n])=>`${k} ${n}`).join(' · '));
console.log('\nמילות הקישור השכיחות: ' + Object.entries(byW).sort((a,b)=>b[1]-a[1])
  .slice(0,12).map(([w,n])=>`${w} ${n}`).join(' · '));

console.log(`\n⛔ אי-התאמה בין מילת הקישור לקטגוריה: ${mismatch.length}`);
mismatch.forEach(x => console.log('   ' + x));
console.log(`\n⚠ מילת הקבלה (likewise/similarly) — דורשת שתי פסוקיות מקבילות: ${parallel.length}`);
parallel.forEach(x => console.log('   ' + x));
console.log(`\nℹ מילות קישור שאינן במיפוי: ${unknown.length}`);
unknown.slice(0, 12).forEach(x => console.log('   ' + x));
console.log(`ℹ פריטים בלי w: ${noW.length}`);
console.log('\n⚠ השער הזה מודד **התאמת קטגוריה** בלבד. אם הפסוקיות עצמן נושאות');
console.log('   את היחס שהמילה מבטיחה — זו קריאה אנושית, והיא לא נמדדת כאן.');
console.log('='.repeat(68));
