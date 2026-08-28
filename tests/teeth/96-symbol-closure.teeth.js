/* ⛔ זה **אינו** קובץ בדיקה. ראה `tests/teeth/README.md`.
   node tests/teeth/96-symbol-closure.teeth.js <none|drop07|dropsandbox|nocomment>
*/
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth96-'));
fs.mkdirSync(path.join(work, 'tests/_harness'), { recursive: true });
['tests/96-symbol-closure.test.js', 'tests/07-storage.test.js', 'tests/_harness/sandbox.js',
 'tests/_harness/extract.js', 'tests/_harness/scan.js', 'app.js', 'data.js', 'data-en.js']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

const edit = (f, a, b) => {
  const p = path.join(work, f);
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (!s.includes(a)) { console.error(`המוטציה לא נתפסה: ${mut} · ${f}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(a, b));
};

/* ⭐ בדיוק הכשל ההיסטורי · סמל שנקרא מתוך מורמת ואינו ברשימה. */
if (mut === 'drop07')      edit('tests/07-storage.test.js', "'vetoPut', 'fullVetoPass', 'buildBank',", "'buildBank',");
if (mut === 'dropsandbox') edit('tests/_harness/sandbox.js', "'fullVetoPass',", '');
if (mut === 'nocomment')   edit('tests/07-storage.test.js', 'רשימת סמלים **שנייה**', 'רשימה');

const r = cp.spawnSync(process.execPath, ['--test', 'tests/96-symbol-closure.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(12)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '').slice(0, 100)));
fs.rmSync(work, { recursive: true, force: true });
