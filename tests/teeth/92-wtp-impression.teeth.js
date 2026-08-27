/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/92-wtp-impression.
 * node teeth83.js <none|nomark|before|awaited|noguard|countall|noclosed|nodismiss>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth83-'));
fs.mkdirSync(path.join(work, 'tests/_harness'), { recursive: true });
['tests/92-wtp-impression.test.js', 'tests/_harness/sandbox.js', 'tests/_harness/extract.js',
  'tests/_harness/scan.js', 'app.js', 'store.js']
  .forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(work, f)));

const edit = (f, a, b) => {
  const p = path.join(work, f);
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const A = a.replace(/\r\n/g, '\n');
  if (!s.includes(A)) { console.error(`המוטציה לא נתפסה: ${mut} · ${f}`); process.exit(3); }
  fs.writeFileSync(p, s.replace(A, b));
};

if (mut === 'nomark')     // הרישום מוסר לגמרי · חוזרים למצב שאין בו מדידה
  edit('app.js', 'try{ Store.wtpMarkShown(); }catch(e){}', ';');
/* ⚠ הרישום **מוזז**, לא משוכפל. הגרסה הראשונה של המוטציה הוסיפה קריאה שנייה
   והשאירה את הראשונה · אז נפלה הבדיקה «ציפיתי לרישום אחד» במקום בדיקת הסדר,
   כלומר המוטציה בדקה משהו אחר ממה שהתכוונתי. */
if (mut === 'before') {   // הרישום מוזז לפני ההצגה · סופר כוונה ולא צפייה
  const p = path.join(work, 'app.js');
  let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const CALL = '    try{ Store.wtpMarkShown(); }catch(e){}\n';
  const SHOW = "    show($('#wtpAsk'));\n";
  if (!s.includes(CALL) || !s.includes(SHOW)) { console.error(`המוטציה לא נתפסה: ${mut}`); process.exit(3); }
  s = s.replace(CALL, '').replace(SHOW, CALL + SHOW);
  fs.writeFileSync(p, s);
}
if (mut === 'awaited')    // הרישום ממתין · מעכב מסך שכבר מוצג
  edit('app.js', 'try{ Store.wtpMarkShown(); }catch(e){}', 'await Store.wtpMarkShown();');
if (mut === 'noguard')    // ה-try יורד · חריגה תשבור את מסך התוצאות
  edit('app.js', 'try{ Store.wtpMarkShown(); }catch(e){}', 'Store.wtpMarkShown();');
if (mut === 'countall')   // ⭐ החוט הדק · wtpAsked חוזרת לספור כל שורה
  edit('store.js', "      .or('price_bucket.not.is.null,dismissed.is.true');", ';');
if (mut === 'noclosed')   // הנפילה הסגורה מוסרת
  edit('store.js', 'if (error) return true;\n    return (count || 0) > 0;',
       'return (count || 0) > 0;');
if (mut === 'nodismiss')  // הכתיבה של ✕ מוסרת
  edit('app.js', 'try{ Store.wtpSave({ dismissed:true }); }catch(e){}', ';');


if (mut === 'noreached')  // המכנה מוסר · שתי הנפילות חוזרות להיות בלתי ניתנות להפרדה
  edit('app.js', 'try{ Store.wtpMarkReached(); }catch(e){}', ';');
/* המכנה מוזז לתוך maybeAskWtp · שם הוא נרשם רק אחרי שהתנאים עברו, כלומר סופר
   את עצמו. שתי החלפות בלי שורות חדשות בתוך המחרוזת · הצורה עם `\n` נבלעה כאן
   שלוש פעמים כבר. */
if (mut === 'reachedlate') {
  edit('app.js', 'try{ Store.wtpMarkReached(); }catch(e){}', '');
  /* ⚠ עוגן ייחודי ל-maybeAskWtp. `if(!currentUser) return;` מופיע גם במקומות
     אחרים ב-app.js, ו-`replace` תופס את הראשון · אז הקריאה נשתלה בפונקציה
     הלא נכונה, והבדיקה «אינו נרשם בתוך maybeAskWtp» עברה מהסיבה הלא נכונה. */
  edit('app.js', '  if(wtpShown) return;',
       '  if(wtpShown) return; try{ Store.wtpMarkReached(); }catch(e){}');
}
if (mut === 'nokind')     // השורה נכתבת בלי kind · אי אפשר להבדיל בין השלבים
  edit('store.js', 'user_id: user.id, kind,', 'user_id: user.id,');
if (mut === 'savekind')   // התגובות מפסיקות לסמן את סוגן
  edit('store.js', "kind: row.dismissed ? 'dismiss' : 'answer',", '');

const r = cp.spawnSync(process.execPath, ['--test', 'tests/92-wtp-impression.test.js'],
  { cwd: work, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
const g = k => (out.match(new RegExp('^ℹ ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
console.log(`mut=${mut.padEnd(10)} EXIT=${r.status}  tests ${g('tests')}  pass ${g('pass')}  fail ${g('fail')}`);
[...new Set(out.split('\n').filter(l => l.includes('AssertionError')))]
  .forEach(l => console.log('    ' + l.trim().replace(/^AssertionError \[ERR_ASSERTION\]: /, '')));
fs.rmSync(work, { recursive: true, force: true });
