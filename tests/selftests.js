'use strict';
/* מריץ את שני ה-selftests הפנימיים של typo-lab ומדווח קוד יציאה.
 * לא מתקן אותם — רק חושף כשל שקט. EXIT≠0 בכל אחד ⇒ נכשל.
 * runOne מוחזר לשימוש run.js; מודול זה אינו *.test.js ולכן לא נאסף פעמיים.
 */
const cp = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SELFTESTS = [
  { name: 'typo-lab/he_mater_gloss.js --selftest', cmd: ['typo-lab/he_mater_gloss.js', '--selftest'], slow: true },
  { name: 'typo-lab/probe_accepts.js --selftest',  cmd: ['typo-lab/probe_accepts.js', '--selftest'],  slow: false },
];

function runSelftests(quick) {
  let failed = 0;
  for (const t of SELFTESTS) {
    if (quick && t.slow) { console.log(`selftest SKIP (quick): ${t.name}`); continue; }
    const r = cp.spawnSync(process.execPath, t.cmd, { cwd: ROOT, stdio: 'ignore' });
    const exit = r.status === null ? -1 : r.status;
    const ok = exit === 0;
    console.log(`selftest ${ok ? 'PASS' : '\x1b[31mFAIL\x1b[0m'}: ${t.name} EXIT=${exit}`);
    if (!ok) failed++;
  }
  return failed;
}

module.exports = { runSelftests };

if (require.main === module) process.exit(runSelftests(process.argv.includes('--quick')) ? 1 : 0);
