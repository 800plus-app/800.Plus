'use strict';
/* אימות מלא של יחידת מילות הקישור, בפקודה אחת, עם פסק דין אחד.
 *
 *   node connectives-he/verify_all_conn.js
 *
 * למה הכלי הזה קיים
 * -----------------
 * בצינור המקביל (השלמת המשפטים) דווח יותר מפעם אחת «השערים עוברים» כשהמצב היה
 * אחר · פעם מפני ששער בדק את הדבר הלא נכון, פעם מפני שהוא לא היה יכול לירות
 * כלל, ופעם מפני שקובץ הנתונים לא נבנה מחדש אחרי שהמנות שונו. כל השערים במקום
 * אחד, בסדר הנכון, ובלי אפשרות לדלג על אחד מהם.
 *
 * ⭐ הסדר אינו שרירותי: קודם בונים מהמנות, אחר כך בודקים. ריצה שבודקת קובץ ישן
 * היא בדיוק הכשל שהכלי בא למנוע.
 *
 * ⭐ כל צעד נמדד בשני תנאים יחד · **קוד יציאה 0 וגם ביטוי שחייב להופיע בפלט**.
 * קוד יציאה לבדו נשבר בשקט כשמישהו יעטוף שער ב-try, וביטוי לבדו נשבר כשהשער
 * מדפיס «✅» ואז קורס.
 *
 * ⛔ מה הכלי **אינו** מוכיח, ונאמר במפורש בפלט: איכות התוכן. אם המשפט באמת
 * מחייב את הכיוון, אם המסיחים קרובים מספיק, ואם ההסבר נכון · נמדדים בפותרים
 * עצמאיים ובביקורת עיוורת, בתהליך נפרד.
 *
 * ⚠ ‏`tests/run.js` נכלל כאן, ולכן `tests/103-conn.test.js` מריץ את השערים
 * **ישירות** ולא דרך הקובץ הזה. חיבור הפוך היה יוצר רקורסיה אינסופית.
 */
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BAR = '='.repeat(70);

const steps = [
  { name: 'בניית קובץ הנתונים מהמנות', cmd: ['connectives-he/assemble_conn.js'],
    need: /נדחו: 0\b/ },
  { name: 'שער הפורמט · הוכחת שיניים', cmd: ['connectives-he/check_format_conn.js', '--selftest'],
    need: /לשער יש שיניים/ },
  { name: 'שער הפורמט', cmd: ['connectives-he/check_format_conn.js'],
    need: /\b0 ממצאים[\s\S]*✅ השער עבר/ },
  { name: 'שער הכיוון', cmd: ['connectives-he/check_direction_he.js'],
    need: /\b0 ממצאים[\s\S]*✅ השער עבר/ },
  { name: 'שער החריץ התחבירי', cmd: ['connectives-he/check_slot_he.js'],
    need: /\b0 ממצאים[\s\S]*✅ השער עבר/ },
  { name: 'שער מילות ההיפוך', cmd: ['connectives-he/check_flip.js'],
    need: /\b0 ממצאים[\s\S]*✅ השער עבר/ },
  /* ⭐ שער מקור הניקוד נכנס **אחרי** ארבעת השערים הקיימים ולא במקומם · הם
     בודקים עקביות בתוך הפריט ובין הפריטים, והוא היחיד שמשווה את מחרוזת
     הניקוד עצמה מול הרשימה המאושרת. בלעדיו מנה יכולה לנקד לבד ולעבור. */
  { name: 'שער מקור הניקוד · הוכחת שיניים', cmd: ['connectives-he/check_nikud_source.js', '--selftest'],
    need: /לשער יש שיניים/ },
  { name: 'שער מקור הניקוד', cmd: ['connectives-he/check_nikud_source.js'],
    need: /\b0 ממצאים[\s\S]*✅ השער עבר/ },
  /* ⚠ המפריד בבאנר של הרנר סובלני בכוונה · הוא היה `PASS —` וסבב הסרת המקף
     הארוך הפך אותו ל-`PASS --`. שער שנופל על תו פיסוק אינו שער. */
  { name: 'חבילת הבדיקות של הפרויקט', cmd: ['tests/run.js'],
    need: /PASS (?:—|--) \d+ tests, 0 failures/ },
];

let failed = 0;
for (const s of steps) {
  let out = '', code = 0;
  try {
    out = cp.execFileSync(process.execPath, s.cmd,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status == null ? 1 : e.status; }
  const ok = code === 0 && s.need.test(out);
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '⛔'} ${s.name}${ok ? '' : `  (יציאה ${code})`}`);
  if (!ok) console.log('   ' + out.trim().split('\n').slice(-14).join('\n   '));
}

/* ── המספרים נשלפים מהתוצר עצמו ────────────────────────────────────────
   ⛔ ולא מהפלט של השערים · דיווח שנשען על ניסוח משתנה יחד עם הניסוח, ואז
   הוא מפסיק לתאר את המציאות בלי שאיש שינה נתון. */
let summary = '⚠ קובץ הנתונים לא נקרא';
try {
  const w = {};
  new Function('window', fs.readFileSync(path.join(__dirname, 'data-conn-he.js'), 'utf8'))(w);
  const bank = w.CONN_HE || {};
  const all = Object.values(bank).flat();
  const kb = Math.round(fs.statSync(path.join(__dirname, 'data-conn-he.js')).size / 1024);
  const flips = all.filter(x => (x.flip || []).length).length;
  const slots = {}; all.forEach(x => { slots[x.slot] = (slots[x.slot] || 0) + 1; });
  summary = `קובץ הנתונים: ${all.length} פריטים · ${kb}KB · ` +
    Object.entries(bank).map(([k, a]) => `${k} ${a.length}`).join(' · ') +
    `\nמילה הופכת: ${flips}/${all.length} · חריצים: ` +
    Object.entries(slots).map(([s, n]) => `${s} ${n}`).join(' · ');
} catch (e) { summary = '⚠ קובץ הנתונים לא נקרא — ' + e.message; }

console.log('\n' + BAR);
console.log(summary);
console.log(BAR);
console.log(failed ? `⛔ ${failed} שערים נכשלו — אין להעלות` : '✅ כל השערים עברו');
console.log('⚠ מה שלא נבדק כאן: איכות התוכן. חד-משמעיות הכיוון ואיכות ההסבר');
console.log('   נמדדות בפותרים עצמאיים ובביקורת עיוורת, בתהליך נפרד.');
console.log(BAR);
process.exit(failed ? 1 : 0);
