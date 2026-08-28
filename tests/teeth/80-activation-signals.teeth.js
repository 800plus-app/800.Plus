/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/80-activation-signals.
 * עותק של העץ המינימלי בתיקייה זמנית · app.js האמיתי אינו נגוע.
 *
 * node teeth80.js <none|backinsignin|noafter|noguard|softfail|nomet|bylevel>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth80-'));

['tests/_harness', 'scripts'].forEach(d => fs.mkdirSync(path.join(work, d), { recursive: true }));
['tests/80-activation-signals.test.js', 'tests/_harness/sandbox.js', 'tests/_harness/extract.js',
  'tests/_harness/scan.js', 'app.js', 'store.js', 'scripts/pick_inactive.py']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

/* ⚠ הקבצים בעץ העבודה הם CRLF · מוטציה שכתובה עם \n בלבד אינה נתפסת, וההרצה
   נראית אז כמו שער עיוור. לכן ההשוואה מנרמלת, וההחלפה נעשית על הצורה המנורמלת. */
const edit = (f, a, b) => {
  const p = path.join(work, f);
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const A = a.replace(/\r\n/g, '\n');
  if (!s.includes(A)) { console.error(`המוטציה לא נתפסה: ${mut} · ${f}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(A, b));
};

if (mut === 'backinsignin')        // הכתיבה חוזרת לתוך signIn · הצורה השגויה המקורית
  edit('store.js', 'if (data && data.user) Store.touchSeen(data.user.id);',
    "if (data && data.user) { sb.from('profiles')" +
    ".update({ last_seen: new Date().toISOString() }).eq('id', data.user.id).then(()=>{}); }");
if (mut === 'noafter')             // afterAuthed מפסיקה לקרוא ל-touchSeen
  edit('app.js', 'try{ Store.touchSeen(currentUser.id); }catch(e){}', ';');
if (mut === 'noguard')             // מסירים את השומר מפני כתיבה כפולה
  edit('app.js', 'if(seenTouched !== currentUser.id){\n    seenTouched = currentUser.id;',
    'if(true){');
if (mut === 'softfail')            // חוסר progress.json מודפס אבל אינו מפיל
  edit('scripts/pick_inactive.py', "except FileNotFoundError:\n    sys.exit(",
    "except FileNotFoundError:\n    progress = []\n    print(");
/* ⭐ התנאי בלבד מנוטרל · מחרוזת הסיבה נשארת בקובץ. מוטציה שמוחקת את הבלוק כולו
   הייתה מפילה קודם את הבדיקה על ההדפסה, והבדיקה על הפסילה לא הייתה מורצת. */
if (mut === 'nomet')               // הספירה נבנית אבל אינה פוסלת
  edit('scripts/pick_inactive.py', '    if n_met:', '    if False and n_met:');
if (mut === 'bylevel')             // הספירה חוזרת לסנן לפי רמה
  edit('scripts/pick_inactive.py', "if int(r.get('seen') or 0) > 0:",
    "if int(r.get('seen') or 0) > 0 and int(r.get('level') or 0) < 3:");

const r = cp.spawnSync(process.execPath, ['--test', 'tests/80-activation-signals.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(13)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '')));
fs.rmSync(work, { recursive: true, force: true });
