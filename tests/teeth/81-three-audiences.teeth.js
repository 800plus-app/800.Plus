/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/81-three-audiences.
 * node teeth81.js <none|gap|overlap|nomet|inactive|byseen|accuse|emdash|cta|wetdefault|nodays>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth81-'));
['tests', 'scripts'].forEach(d => fs.mkdirSync(path.join(work, d), { recursive: true }));
['tests/81-three-audiences.test.js', 'scripts/pick_lapsed.py', 'scripts/pick_nudges.py',
  'scripts/pick_inactive.py', 'scripts/send_lapsed.py']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

const edit = (f, a, b) => {
  const p = path.join(work, f);
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const A = a.replace(/\r\n/g, '\n');
  if (!s.includes(A)) { console.error(`המוטציה לא נתפסה: ${mut} · ${f}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(A, b));
};

// ── הגבול בין שני הבוררים ──
if (mut === 'gap')        // הסף של התזכורת עולה ל-7 · נפתח חור של שתי מילים
  edit('scripts/pick_nudges.py', 'if n < 5:', 'if n < 7:');
if (mut === 'overlap')    // WEAK_MAX עולה ל-5 · אותו אדם יקבל שני מיילים
  edit('scripts/pick_lapsed.py', 'WEAK_MAX = 4', 'WEAK_MAX = 5');
if (mut === 'nomet')      // המייל השלישי מפסיק לדרוש שתורגלה מילה
  edit('scripts/pick_lapsed.py', '    if n_met == 0:', '    if False:');
if (mut === 'inactive')   // מייל ההפעלה מפסיק לפסול את מי שתרגל
  edit('scripts/pick_inactive.py', '    if n_met:', '    if False:');
if (mut === 'byseen')     // «שקט» חוזר להישען על תאריך הכניסה
  edit('scripts/pick_lapsed.py', "t = int(r.get('last') or 0)", 't = 0');

// ── הנוסח ──
if (mut === 'accuse')     // מוסיפים משפט שמזכיר את השקט
  edit('scripts/send_lapsed.py', 'תרגלת {met} מילים.', 'לא נכנסת הרבה זמן.');
if (mut === 'emdash')     // מקף ארוך בתוך הנוסח
  edit('scripts/send_lapsed.py', "return 'תרגלת %d מילים · %d מהן לחיזוק'",
    "return 'תרגלת %d מילים — %d מהן לחיזוק'");
if (mut === 'cta')        // טקסט הכפתור יוצא מהלקסיקון
  edit('scripts/send_lapsed.py', '>תרגל עכשיו</a>', '>לחץ כאן</a>');
if (mut === 'wetdefault') // ברירת המחדל מפסיקה להיות ריצה יבשה
  edit('scripts/send_lapsed.py', "os.environ.get('DRY', 'true')", "os.environ.get('DRY', 'false')");
if (mut === 'nodays')     // הענף של «יומיים» נמחק · «1 ימים» חוזר
  edit('scripts/send_lapsed.py', "elif days == 2:    when = 'נשארו לך יומיים עד המבחן'", '');

const r = cp.spawnSync(process.execPath, ['--test', 'tests/81-three-audiences.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(11)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '')));
fs.rmSync(work, { recursive: true, force: true });
