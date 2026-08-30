/* ⛔ זה **אינו** קובץ בדיקה. tests/run.js סורק *.test.js בתיקייה העליונה בלבד,
   ולכן הקובץ הזה אינו נאסף לחבילה · והוא לא אמור.

   ⭐ מה זה כן: ההוכחה מקצה לקצה שהמתג עובד. השער ב-tests/102 קורא מקור (node),
   וכאן רצה **python אמיתי**: פיקסטורה של שני משתמשים כשירים, לאחד מהם הדגל דלוק,
   מריצים את scripts/pick_nudges.py כפי שהוא, וקוראים את הנמענים שיצאו. משתמש
   שכיבה תזכורות אינו אמור להיות שם.

   ⛔ ולמה בעץ ולא בסקרצ'פד: תוצאה שאי אפשר להריץ מחדש אינה עדות. מי שקורא דוח
   עם EXIT=1 צריך לשחזר אותו.

   ‏הרצה · node tests/teeth/102-nudge-optout.teeth.js <none|flip|noguard>
     none    · הדגל דלוק אצל השני   → הוא נופל מהרשימה   → PASS  (ירוק)
     flip    · הדגל כבוי אצל השני    → הוא נכנס לרשימה     → FAIL  (אדום · «הפוך את הדגל»)
     noguard · הדגל דלוק אך שורת הפסילה הוסרה מהבורר → הוא נכנס → FAIL (אדום · הפסילה נושאת משקל)
   בלי ארגומנט = none.
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'teeth102-'));

/* שני משתמשים כשירים לתזכורת: יש כתובת, לא קיבלו לאחרונה, לא נכנסו לאחרונה,
   ולכל אחד חמש מילים לחיזוק (seen>0, level<3). ההבדל היחיד ביניהם הוא הדגל. */
const optoutB = (mut === 'flip') ? false : true;
const profiles = [
  { id: 'AAAA', email: 'alice@example.com', username: 'alice',
    nudge_optout: false, nudge_count: 0, nudge_last_sent: null, last_seen: null },
  { id: 'BBBB', email: 'bob@example.com', username: 'bob',
    nudge_optout: optoutB, nudge_count: 0, nudge_last_sent: null, last_seen: null },
];
const words = {};
for (let i = 1; i <= 5; i++) words['w' + i] = { seen: 1, level: 0 };
const progress = [
  { user_id: 'AAAA', stats: { words } },
  { user_id: 'BBBB', stats: { words } },
];
fs.writeFileSync(path.join(work, 'profiles.json'), JSON.stringify(profiles), 'utf8');
fs.writeFileSync(path.join(work, 'progress.json'), JSON.stringify(progress), 'utf8');

/* איזה סקריפט מריצים: המקורי, או עותק שממנו הוסרה שורת הפסילה (noguard). */
let script = path.join(ROOT, 'scripts', 'pick_nudges.py');
if (mut === 'noguard') {
  let py = fs.readFileSync(script, 'utf8');
  const A = "if p.get('nudge_optout'):";
  if (!py.includes(A)) { console.error('המוטציה לא נתפסה · הצורה בקוד השתנתה'); process.exit(3); }
  py = py.replace(A, 'if False:');
  script = path.join(work, 'pick_nudges_noguard.py');
  fs.writeFileSync(script, py, 'utf8');
}

/* python או py -3 · מה שקיים. */
function runPython(scriptPath, cwd) {
  for (const [cmd, pre] of [['python', []], ['py', ['-3']]]) {
    const r = cp.spawnSync(cmd, [...pre, scriptPath], { cwd, encoding: 'utf8' });
    if (!(r.error && r.error.code === 'ENOENT')) return r;
  }
  return { error: new Error('python לא נמצא'), status: 127, stdout: '', stderr: 'no python' };
}

const r = runPython(script, work);
const out = (r.stdout || '') + (r.stderr || '');
if (r.status !== 0 && !fs.existsSync(path.join(work, 'nudges.json'))) {
  console.error(`python נכשל (status ${r.status})\n${out}`);
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(2);
}

const picked = JSON.parse(fs.readFileSync(path.join(work, 'nudges.json'), 'utf8'));
const ids = picked.map(x => x.id);
const bobIn = ids.includes('BBBB');
const aliceIn = ids.includes('AAAA');

/* השער: מי שכיבה (BBBB) אינו ברשימה · ומי שלא כיבה (AAAA) כן, כדי שהמבחן לא
   יעבור סתם כי הכול רוקן. */
const pass = !bobIn && aliceIn;

console.log(`mut=${mut.padEnd(8)} EXIT_EXPECT=${mut === 'none' ? 0 : 1}`);
console.log('  ' + (out.split('\n').find(l => l.includes('נבחרו')) || '').trim());
console.log(`  nudges.json ids = [${ids.join(', ')}]`);
console.log(`  optout(bob)=${optoutB}  bobInList=${bobIn}  aliceInList=${aliceIn}`);
if (pass) {
  console.log('  ✓ PASS · מי שכיבה תזכורות אינו נבחר, ומי שלא כיבה נבחר');
} else {
  console.log('  ✗ FAIL · ' + (bobIn
    ? 'המשתמש שהדגל שלו נבדק נכנס לרשימת הנמענים'
    : 'מי שלא כיבה נשמט מהרשימה · הפיקסטורה או הבורר השתנו'));
}

fs.rmSync(work, { recursive: true, force: true });
process.exit(pass ? 0 : 1);
