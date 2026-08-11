/* אימות מלא של השלמת המשפטים, בפקודה אחת, עם פסק דין אחד.
 *
 *   node sentence-completion/verify_all.js
 *
 * למה הכלי הזה קיים
 * -----------------
 * במהלך העבודה הזאת דיווחתי יותר מפעם אחת "השערים עוברים" כשהמצב היה אחר: פעם
 * מפני שהשער בדק את הדבר הלא נכון, פעם מפני שהוא לא היה יכול לירות בכלל, ופעם
 * מפני שהקורפוס לא נבנה מחדש אחרי שהמנות שונו. כל השערים במקום אחד, בסדר הנכון,
 * ובלי מקום לדלג על אחד מהם.
 *
 * הסדר אינו שרירותי: קודם בונים מהמנות, אחר כך בודקים את מה שנבנה. ריצה שבודקת
 * קורפוס ישן היא בדיוק הכשל שהכלי בא למנוע.
 *
 * ⛔ מה הכלי **אינו** מוכיח, ונאמר במפורש בפלט: איכות התוכן. חד-משמעיות ואיכות
 * ההסבר נמדדות בפותרים עצמאיים ובביקורת אדוורסרית, וזה תהליך נפרד שמצריך מודל.
 */
const cp = require('child_process'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');

const steps = [
  { name: 'בניית הקורפוס וקובץ הייצור', cmd: ['sentence-completion/assemble.js'], cwd: ROOT,
    need: /נדחו: 0/ },
  { name: 'שער הפורמט · הוכחת שיניים', cmd: ['sentence-completion/check_explain.js', '--selftest'], cwd: ROOT,
    need: /לשער יש שיניים/ },
  /* ⚠ היה `t נכתב 204\/204`, מספר מקובע. הוא עבד בדיוק כל עוד הקורפוס היה בגודל
     204, ונכשל ברגע שהוא **גדל** — כלומר השער התלונן על הצלחה. מספר קבוע בתוך שער
     הוא תאריך תפוגה שאיש אינו רואה. הדרישה האמיתית היא ש-`t` יהיה מלא בכל הפריטים,
     ולכן הביטוי דורש ששני המספרים יהיו זהים, יהיו אשר יהיו. */
  { name: 'שער הפורמט · g · t · r', cmd: ['sentence-completion/check_explain.js'], cwd: ROOT,
    need: /t נכתב (\d+)\/\1 \(100%\)[\s\S]*r מלא (\d+)\/\2 \(100%\)[\s\S]*✅/ },
  { name: 'שער הפריטים', cmd: ['sentence-completion/check_sentences.js'], cwd: ROOT,
    env: { SENT_FILE: 'sentences-en-v3.js' }, need: /0 כשלים[\s\S]*✅ השער עבר/ },
  { name: 'מילות הקישור מול סוג ההיגיון', cmd: ['sentence-completion/check_connectives.js'], cwd: ROOT,
    need: /אי-התאמה בין מילת הקישור לקטגוריה: [0-3]\b/ },
  { name: 'חבילת הבדיקות של הפרויקט', cmd: ['tests/run.js'], cwd: ROOT,
    need: /PASS — \d+ tests, 0 failures/ },
];

let failed = 0;
const lines = [];
for (const s of steps) {
  let out = '', code = 0;
  try {
    out = cp.execFileSync(process.execPath, s.cmd,
      { cwd: s.cwd, encoding: 'utf8', maxBuffer: 1 << 26,
        env: { ...process.env, ...(s.env || {}) } });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status || 1; }
  const ok = code === 0 && s.need.test(out);
  if (!ok) failed++;
  lines.push({ name: s.name, ok, out });
  console.log(`${ok ? '✅' : '⛔'} ${s.name}`);
  if (!ok) {
    console.log('   ' + out.trim().split('\n').slice(-12).join('\n   '));
  }
}

/* מספרים שנשלפים מהתוצר עצמו ולא מהפלט של השערים, כדי שהדיווח לא יסתמך על
   ניסוח שעלול להשתנות. */
const ship = (() => {
  const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'data-sent-en.js'), 'utf8'))(w);
  return w.SENT_EN;
})();
const items = Object.values(ship).flat();
const kb = Math.round(fs.statSync(path.join(ROOT, 'data-sent-en.js')).size / 1024);
const rLen = items.flatMap(x => x.r.map(y => y.length)).sort((a, b) => a - b);

console.log('\n' + '='.repeat(64));
console.log(`קובץ הייצור: ${items.length} פריטים · ${kb}KB · ` +
  Object.entries(ship).map(([b, a]) => `${b} ${a.length}`).join(' · '));
console.log(`אורך נימוק: חציון ${rLen[rLen.length >> 1]} · מקס ${rLen[rLen.length - 1]} תווים`);
console.log('='.repeat(64));
console.log(failed ? `⛔ ${failed} שערים נכשלו — אין להעלות` : '✅ כל השערים עברו');
console.log('⚠ מה שלא נבדק כאן: איכות התוכן. חד-משמעיות ואיכות ההסבר נמדדות');
console.log('   בפותרים עצמאיים ובביקורת אדוורסרית, בתהליך נפרד.');
console.log('='.repeat(64));
process.exit(failed ? 1 : 0);
