/* מחיל את הניקוד שהוסכם על קובצי היחידות — מקור האמת שממנו gloss-status נבנה.
 *
 * ⛔ שני שערים לפני כתיבה, ושניהם על כל שורה:
 *  1. **זהות אותיות.** הסרת הניקוד מהמילה החדשה חייבת להחזיר בדיוק את המילה
 *     שהייתה בקובץ. זה מה שתפס 18 הצעות של המנקדים שהשמיטו יו"ד או וי"ו.
 *  2. **שינוי נקודתי.** נוגעים **רק** בעמודת המילה, ורק בשורות שברשימה. הפירוש
 *     והמספור לא נגעים, והשורה נבנית מחדש מאותם שדות.
 *
 * ⚠ מה שהכלי הזה **לא** עושה: הוא לא מנקד ולא מכריע. הוא רק כותב מה שהוסכם.
 */
const fs = require('fs'), path = require('path');
const UNITS = 'C:/Users/03hag/Claude projects/800+/units_output';
const NIQ = /[֑-ׇ]/g;
const bare = s => s.normalize('NFKC').replace(NIQ, '').trim();

const agreed = new Map(fs.readFileSync('niqqud/agreed.tsv', 'utf8').split(/\r?\n/)
  .slice(1).filter(Boolean).map(l => l.split('\t')).map(c => [c[0].trim(), c[1].trim()]));
console.log(`${agreed.size} מילים בהסכמה`);

let written = 0, skipped = [];
for (let u = 1; u <= 10; u++) {
  const f = path.join(UNITS, u === 1 ? 'unit-1-flat.md' : `unit-${u}-hebrew.md`);
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  let touched = 0;
  for (let i = 0; i < lines.length; i++) {
    /* ⚠ `([^|]+?)` ולא `(.+?)`. בגרסה הראשונה המילה נתפסה יחד עם הפירוש כולו,
       ולכן אף שורה לא הותאמה והכלי דיווח "0 נכתבו" בלי שגיאה. הסיבה: `.` אינו
       חוצה `\r`, והשורות כאן מסתיימות ב-CRLF, ולכן המנוע סידר את הקבוצות אחרת
       ממה שהתכוונתי. איסור מפורש על `|` בתוך המילה מכריע את זה חד-משמעית. */
    const m = lines[i].replace(/\r$/, '').match(/^(\|\s*\d+\s*\|\s*)([^|]+?)(\s*\|\s*)(.*)$/);
    if (!m) continue;
    const word = m[2].trim();
    if (NIQ.test(word)) continue;                 // כבר מנוקד
    const pointed = agreed.get(word);
    if (!pointed) continue;
    if (bare(pointed) !== bare(word)) { skipped.push([word, 'זהות אותיות']); continue; }
    const cr = /\r$/.test(lines[i]) ? '\r' : '';
    lines[i] = m[1] + pointed + m[3] + m[4] + cr;
    touched++; written++;
  }
  if (touched) {
    fs.writeFileSync(f, lines.join('\n'), 'utf8');
    console.log(`  יחידה ${u}: ${touched} נוקדו`);
  }
}
console.log(`\nסה"כ נכתבו ${written} · נדחו ${skipped.length}`);
skipped.forEach(([w, why]) => console.log(`  ⛔ ${w}: ${why}`));
