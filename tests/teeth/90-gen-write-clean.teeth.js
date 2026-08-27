/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/90-gen-write-clean.
 *
 * ⛔ כאן אי אפשר לדרוס מקור בזיכרון · השער קורא שני קבצים מהדיסק ומייבא מודול
 *    שלישי. לכן העותק השבור נכתב לתיקייה זמנית שהיא עותק מלא של השלושה, והשער
 *    מורץ מולה. app.js ועץ העבודה האמיתי אינם נגועים.
 *
 * node teeth79.js <none|writefilesync|nogen|nolf|noskip>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth79-'));
fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
fs.mkdirSync(path.join(work, 'sentence-completion'), { recursive: true });

const cp3 = f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f));
['tests/90-gen-write-clean.test.js',
  'sentence-completion/write_gen.js',
  'sentence-completion/assemble.js',
  'sentence-completion/build_ship.js'].forEach(cp3);
/* .git נדרש כדי ש-repoEol תקרא את אותה הגדרה · מעתיקים את הערך במפורש במקום. */
const eol = cp.execFileSync('git', ['config', '--get', 'core.autocrlf'],
  { cwd: ROOT, encoding: 'utf8' }).trim();
cp.execFileSync('git', ['init', '-q'], { cwd: work });
cp.execFileSync('git', ['config', 'core.autocrlf', eol], { cwd: work });

const P = f => path.join(work, f);
const edit = (f, a, b) => {
  const p = P(f), s = fs.readFileSync(p, 'utf8');
  if (!s.includes(a)) { console.error('המוטציה לא נתפסה: ' + mut + ' · ' + f); process.exit(3); }
  fs.writeFileSync(p, s.replace(a, b));
};

if (mut === 'writefilesync')          // חוזרים ל-fs.writeFileSync על קובץ הייצור
  edit('sentence-completion/build_ship.js',
    'const נכתבייצור = writeGen(dest, header);',
    /* ⚠ ה-writeGen נשמר בכוונה · מוטציה שמסירה אותו נתפסת בבדיקה שלפניה,
       והבדיקה על writeFileSync עצמה לא הייתה מורצת כלל. */
    "const נכתבייצור = writeGen(dest, header) || fs.writeFileSync(dest, header, 'utf8');");
if (mut === 'nogen')                  // מסירים את הטעינה של write_gen מ-assemble
  edit('sentence-completion/assemble.js',
    "const { writeGen } = require('./write_gen.js');",
    'const writeGen = () => true;');
if (mut === 'nolf')                   // מסוף השורות חוזר לקבוע · LF תמיד
  edit('sentence-completion/write_gen.js',
    "  return EOL;\n}", "  EOL = '\\n';\n  return EOL;\n}");
if (mut === 'noskip')                 // מפסיקים לדלג על תוכן זהה
  edit('sentence-completion/write_gen.js',
    '  if (cur && cur.equals(buf)) return false;', '');

const r = cp.spawnSync(process.execPath, ['--test', 'tests/90-gen-write-clean.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(14)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim()));
fs.rmSync(work, { recursive: true, force: true });
