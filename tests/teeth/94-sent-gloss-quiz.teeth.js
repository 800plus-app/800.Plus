/* ⛔ זה **אינו** קובץ בדיקה. ראה `tests/teeth/README.md`.

   הוכחת שיניים ל-tests/94-sent-gloss-quiz.
   node tests/teeth/85-sent-gloss-quiz.teeth.js
     <none|nosuffix|suffixorder|attr|blankbtn|noreset|nopush|noffer|nogloss
      |dupword|onefromone|noclose|forced|fixedlen|badlen|nosave|modalatend|nobtn>
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth85-'));
fs.mkdirSync(path.join(work, 'tests/_harness'), { recursive: true });
['tests/94-sent-gloss-quiz.test.js', 'tests/_harness/sandbox.js', 'tests/_harness/extract.js',
  'tests/_harness/scan.js', 'app.js', 'index.html', 'data-en.js']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

const edit = (f, a, b) => {
  const p = path.join(work, f);
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const A = a.replace(/\r\n/g, '\n');
  if (!s.includes(A)) { console.error(`המוטציה לא נתפסה: ${mut} · ${f}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(A, b));
};

/* ── הפירוש ── */
if (mut === 'nosuffix')     // שכבת הסיומות מנוטרלת · צורות מוטות לא נפתרות
  edit('app.js', 'for(const [suf, add] of SENT_SUFF){', 'for(const [suf, add] of []){');
if (mut === 'suffixorder')  // "s" לפני "ies" · "studies" נחתך ל-"studie"
  edit('app.js', "const SENT_SUFF = [\n  ['ies','y']", "const SENT_SUFF = [\n  ['s',''], ['ies','y']");
if (mut === 'attr')         // המילה חוזרת ל-attribute · sEsc אינו מגן על גרשיים
  edit('app.js', 'return `<button type="button" class="s-w${has?\' has\':\'\'}">${sEsc(part)}</button>`;',
       'return `<button type="button" class="s-w${has?\' has\':\'\'}" data-w="${sEsc(part)}">${sEsc(part)}</button>`;');
if (mut === 'blankbtn')     // החסר הופך לכפתור · הלומד יקיש על ___ ויקבל "אין פירוש"
  edit('app.js', "if(/^_{2,}$/.test(part)){", 'if(false){');
if (mut === 'nogloss')      // המילון מוחזר ריק · אין פירוש לאף מילה
  edit('app.js', '  sentLexMap = m;\n  return m;', '  sentLexMap = new Map();\n  return sentLexMap;');
if (mut === 'noclose')      // הפירוש הקודם נשאר פתוח על השאלה הבאה
  edit('app.js', '  hideSentGloss();\n  $(\'#sentHint\')', "  $('#sentHint')");

/* ── הבוחן ── */
/* ⚠ העוגן הוא השורה **שאחרי** האיפוס, לא ההערה שלפניו · הערה היא בדיוק מה
   שמשתנה בעריכה הבאה, ומוטציה שנתלית בה מפסיקה להיתפס בשקט. */
if (mut === 'noreset')      // המנה אינה מתאפסת · שאריות מסבב קודם נכנסות
  edit('app.js', "  sqBatch = [];\n  $('#sentPick')", "  $('#sentPick')");
if (mut === 'nopush')       // הפריט אינו נצבר · הבוחן לעולם לא יוצע
  edit('app.js', '  if(done) sqBatch.push(done);', ';');
if (mut === 'noffer')       // ההצעה מוסרת
  edit('app.js', '  sqOfferIfDue(sentI >= sentQ.length);', ';');
if (mut === 'dupword')      // מילה כפולה נשאלת פעמיים
  edit('app.js', 'if(!term || !mean || !k || seen.has(k)) continue;', 'if(!term || !mean || !k) continue;');
if (mut === 'onefromone')   // שאלה עם אפשרות אחת נחשבת שאלה
  edit('app.js', '.filter(q=>q.opts.length > 1);', ';');
if (mut === 'forced')       // כפתור ההמשך מוסר · הבוחן נכפה
  edit('index.html', '<button class="btn btn-ghost" id="sqNo">המשך בסבב</button>', '');


/* ── אורך הסבב ── */
if (mut === 'fixedlen')     // הבורר מקובע על 10 · המדד שהמבקר ביקש במפורש
  edit('app.js', '  return SENT_LENS.includes(v) ? v : 10;', '  return 10;');
if (mut === 'badlen')       // ערך מ-localStorage מתקבל בלי בדיקה
  edit('app.js', '  return SENT_LENS.includes(v) ? v : 10;', '  return v || 10;');
if (mut === 'nosave')       // הבחירה אינה נשמרת · לא תשרוד רענון
  edit('app.js', 'b.onclick = ()=>{ LS.set(SENT_LEN_KEY, n); renderSentLen(); };',
       'b.onclick = ()=>{ renderSentLen(); };');
/* ── איפה הבוחן מוצע ── */
if (mut === 'modalatend')   // החלונית חוזרת לקפוץ גם בסיום
  edit('app.js', '  if(over) return false;                     // הכפתור במסך הסיכום ייקח את זה', '');
if (mut === 'nobtn')        // הכפתור יורד ממסך הסיכום
  edit('app.js', "? `<button class=\"btn btn-ghost\" id=\"sentQuizBtn\">בוחן על ${sqQ.length} המילים</button>`",
       "? ''");

const r = cp.spawnSync(process.execPath, ['--test', 'tests/94-sent-gloss-quiz.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(12)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError') || l.includes('Error: ')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '').slice(0, 110)));
fs.rmSync(work, { recursive: true, force: true });
