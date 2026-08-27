/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/93-contrast-tokens.
 *
 * node teeth82.js <none|revert|lightink|goldmoved|gradback|greyback|whyback|whytoken
 *                      |askgo|instspan|updbar|sizecustom|decor>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth82-'));
fs.mkdirSync(path.join(work, 'tests'), { recursive: true });
['tests/93-contrast-tokens.test.js', 'index.html']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

const edit = (a, b) => {
  const p = path.join(work, 'index.html');
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const A = a.replace(/\r\n/g, '\n');
  if (!s.includes(A)) { console.error(`המוטציה לא נתפסה: ${mut}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(A, b));
};

/* מחזיר לזהב את קצה הגרדיאנט של הכלל שמתחיל בעוגן · **לא** של הראשון בקובץ.
   ⛔ `.ask-go{` מופיע גם בתוך `.cheer-box .ask-go{margin-top:24px}`, ולכן עוגן
   שאינו נעוץ בתחילת שורה תופס כלל אחר לגמרי. זה הפיל גם את השער וגם את סקריפט
   ההחלפה, ולכן כאן נדרש במפורש שהכלל שנתפס באמת מכיל gold-ink. */
const editRule = (anchor) => {
  const p = path.join(work, 'index.html');
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = s.match(new RegExp('^\\s*' + esc, 'm'));
  if (!m) { console.error(`המוטציה לא נתפסה: ${mut}`); process.exit(3); }
  const i = m.index, j = s.indexOf('}', i);
  const rule = s.slice(i, j);
  if (!rule.includes('var(--gold-ink)')) { console.error(`אין gold-ink בכלל: ${mut}`); process.exit(3); }
  fs.writeFileSync(p, s.slice(0, i) + rule.replace('var(--gold-ink)', 'var(--gold)') + s.slice(j));
};

if (mut === 'revert')      // סלקטור טקסט אחד חוזר לזהב המקורי
  edit('.s-exp h4{font-size:.7rem;letter-spacing:.12em;color:var(--gold-ink)',
       '.s-exp h4{font-size:.7rem;letter-spacing:.12em;color:var(--gold)');
if (mut === 'lightink')    // האסימון מוחלף בערך שעובר על הכרטיס ונופל על הנייר
  edit('--gold-ink:#8a6512;', '--gold-ink:#956f23;');
if (mut === 'goldmoved')   // מישהו מכהה את --gold עצמו
  edit('--gold:#c9962f;', '--gold:#8a6512;');
if (mut === 'gradback')    // קצה גרדיאנט אחד מהמקוריים חוזר
  edit('.ask-opts button.active{background:linear-gradient(180deg,var(--gold-ink),var(--accent))',
       '.ask-opts button.active{background:linear-gradient(180deg,var(--gold),var(--accent))');
if (mut === 'greyback')    // תווית טופס חוזרת לאפור הישן
  edit('.au-link{background:transparent;border:0;color:var(--ink-soft)',
       '.au-link{background:transparent;border:0;color:#8d8274');
if (mut === 'whyback')     // הירוק חוזר לערך שאינו עובר
  edit('.s-why .vd.ok{color:#477247}', '.s-why .vd.ok{color:#4e7d4e}');
if (mut === 'whytoken')    // ערך מפורש מוחלף באסימון משותף
  edit('.s-why .vd.bad{color:#b0462d}', '.s-why .vd.bad{color:var(--accent)}');

/* ── ארבעת הכפתורים שנוספו ב-26.8 ── */
if (mut === 'askgo')       // ⭐ הבקרה שהמבקר ביקש במפורש · הכפתור הראשי
  editRule('.ask-go{');
if (mut === 'instspan')    // מספרי שלבי ההתקנה · 12.5px לבן על זהב
  editRule('.inst-steps li span{');
if (mut === 'updbar')
  editRule('.upd-bar{');
if (mut === 'sizecustom')
  editRule('.size-custom button{');

/* ── והכיוון ההפוך · קישוט בלי טקסט שהוכהה בטעות ── */
if (mut === 'decor')
  edit('.dots i.on{background:linear-gradient(180deg,var(--gold),var(--accent))',
       '.dots i.on{background:linear-gradient(180deg,var(--gold-ink),var(--accent))');

const r = cp.spawnSync(process.execPath, ['--test', 'tests/93-contrast-tokens.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(11)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '')));
fs.rmSync(work, { recursive: true, force: true });
