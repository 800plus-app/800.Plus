/* מסיר מקף ארוך משדה ההסבר `e` בכל מנות הכתיבה. /HEB §3א.
 *
 *   node sentence-completion/fix_dashes.js --dry     (מציג ולא כותב)
 *   node sentence-completion/fix_dashes.js
 *
 * למה זה נדרש
 * -----------
 * `e` מוצג ללומד אחרי שהוא עונה, ולכן `/HEB` חל עליו. §3א אוסר מקף ארוך במפורש:
 * "אסור מקפים ארוכים, זה סממן מזהה לAI". נמדד: 145 מ-204 פריטים (71%) הכילו אותו.
 * הפעלתי /HEB על הפירוש של `ratify` ולא החלתי אותו על ההסברים; כותב רצועת הבסיס
 * השני הוא שזיהה את הפער.
 *
 * ⚠ ולמה לא החלפה גורפת ל-`·`
 * מדדתי מה המקף **עושה** שם, ולא רק שהוא קיים: מ-232 מופעים, 44% הם **זוגות
 * שעוטפים ביטוי אנגלי** בתוך עברית (`המשרד מנהל את הקרן — administer the fund —`),
 * ורוב הבודדים **מציגים ביטוי אנגלי** (`המורה מעביר — impart`). התפקיד הוא סוגריים,
 * לא הפרדה בין פריטים שווי-מעמד. `·` שם היה שגוי דווקא.
 *
 * הכללים, לפי סדר:
 *   1. `— <רצף לטיני> —`  →  `(<לטיני>)`      זוג שעוטף ביטוי
 *   2. `— <רצף לטיני>` לפני פיסוק/עברית/סוף  →  `(<לטיני>)`   הצגת ביטוי
 *   3. מקף שנשאר לפני עברית  →  `,`            אפוזיציה או הסבר
 *
 * ⛔ שער תוכן: הסקריפט מאמת שרצף **המילים** לא השתנה — רק פיסוק. אם מילה נוספה,
 * נעלמה או זזה, הוא עוצר ולא כותב. רביזיה מכנית על 145 טקסטים עברית חייבת שער כזה.
 */
const fs = require('fs'), path = require('path');
const DRY = process.argv.includes('--dry');
const dir = path.join(__dirname, 'batches');

/* ⛔ תוקן ב-10.8 אחרי ריצה יבשה: הגרסה הראשונה השתמשה בכמת **עצל** (`*?`) עם רווח
   בתוך מחלקת התווים, ולכן עצרה במילה הלטינית הראשונה:
       "סעיף — a clause is amended."  →  "סעיף (a) clause is amended."
       "קוצרים — harvest it."          →  "קוצרים (harvest) it."
   ⚠ ושער התוכן אישר את זה, כי הוא בדק שאף **מילה** לא זזה — וזה היה נכון. הסוגריים
   פשוט נחתו במקום הלא נכון. **בדקתי את הדבר הלא נכון**, וזה בדיוק סוג הכשל שהשער
   נועד למנוע. נוסף שער שני שסופר סוגריים ומוודא שהן עוטפות רצף לטיני שלם.

   הרצף מוגדר עכשיו כ**סדרת מילים לטיניות שלמות**, חמדנית, שאינה חוצה לעברית. */
const LATW = "[A-Za-z][A-Za-z0-9'/+]*";
const LAT = `${LATW}(?:\\s+${LATW})*`;
function fix(e) {
  let s = String(e);
  s = s.replace(new RegExp(`\\s*[—–]\\s*(${LAT})\\s*[—–]\\s*`, 'g'), ' ($1) ');       // 1
  s = s.replace(new RegExp(`\\s*[—–]\\s*(${LAT})`, 'g'), ' ($1)');                    // 2
  s = s.replace(/\s*[—–]\s*/g, ', ');                                                 // 3
  return s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
          .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1')
          .replace(/,\s*,/g, ',').trim();
}
/* שער שני: כל סוגריים שנוספו חייבות לעטוף רצף לטיני שלם — לא לחתוך מילה באמצע
   ולא להשאיר מילה לטינית צמודה בחוץ. */
function parensOk(out) {
  const m = out.match(/\(([^()]*)\)/g) || [];
  for (const g of m) {
    const inner = g.slice(1, -1);
    if (!/[A-Za-z]/.test(inner)) continue;              // סוגריים בעברית — לא מעניינו
    const at = out.indexOf(g);
    const after = out.slice(at + g.length);
    if (/^\s*[A-Za-z]/.test(after)) return false;        // מילה לטינית נשארה בחוץ
  }
  return true;
}
/* רק אותיות וספרות — פיסוק מותר להשתנות, מילים לא. */
const words = s => String(s).match(/[\p{L}\p{N}]+/gu) || [];

let changed = 0, files = 0, bad = [];
const samples = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const p = path.join(dir, f);
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  let touched = false;
  arr.forEach((it, i) => {
    if (!it.e || !/[—–]/.test(it.e)) return;
    const out = fix(it.e);
    const a = words(it.e).join(''), b = words(out).join('');
    if (a !== b) { bad.push(`${f}#${i + 1} · מילים השתנו`); return; }
    if (!parensOk(out)) { bad.push(`${f}#${i + 1} · סוגריים חותכות ביטוי לטיני`); return; }
    if (samples.length < 4) samples.push({ id: `${f}#${i + 1}`, before: it.e, after: out });
    it.e = out; changed++; touched = true;
  });
  if (touched) { files++; if (!DRY) fs.writeFileSync(p, JSON.stringify(arr, null, 1), 'utf8'); }
}

samples.forEach(s => {
  console.log('\n' + s.id);
  console.log('  לפני: ' + s.before.slice(0, 150));
  console.log('  אחרי: ' + s.after.slice(0, 150));
});
console.log('\n' + '='.repeat(60));
console.log(`תוקנו ${changed} הסברים ב-${files} מנות${DRY ? '  (ריצה יבשה — לא נכתב)' : ''}`);
if (bad.length) {
  console.log(`⛔ ${bad.length} דולגו — שער התוכן תפס שינוי במילים ולא רק בפיסוק:`);
  bad.forEach(x => console.log('   ' + x));
  console.log('   אלה דורשים יד. הסקריפט לא נגע בהם.');
} else console.log('✅ שער התוכן: אף מילה לא נוספה, נעלמה או זזה בכל התיקונים.');
console.log('='.repeat(60));
