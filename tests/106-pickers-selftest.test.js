'use strict';
/* הבדיקה העצמית של בוררי המיילים · עטיפה דקה בתבנית `tests/82`.
 *
 * ⛔ למה: `days_since` עיגל כלפי מטה, ולכן 6 ימים ו-22 שעות נספרו כ-6 < 7 —
 * ו-55 מ-59 נמענים נפסלו בריצת 30.8 בלי ששום דבר האדים. ה-cron קבוע ב-06:00Z
 * והחותמת מהריצה הקודמת תמיד מאוחרת ממנו, אז הכשל היה מובנה, לא מקרי.
 *
 * ⭐ שתי בדיקות לכל בורר, כמו בשער הטבלאות:
 *   1. `--selftest` עובר 4/4 (כולל מקרה 6-ימים-ו-22-שעות שנופל על הקוד הישן).
 *   2. ⛔ שן · `--selftest --break` מזריק ציפייה שגויה וחייב להחזיר 1.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PY = process.platform === 'win32' ? 'python' : 'python3';

const run = (script, args) => {
  try {
    return { code: 0, out: execFileSync(PY, [path.join(ROOT, 'scripts', script), ...args],
      { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
  }
};

for (const script of ['pick_nudges.py', 'pick_inactive.py', 'activity.py']) {
  test(script + ' · הבדיקה העצמית עוברת', () => {
    const r = run(script, ['--selftest']);
    assert.strictEqual(r.code, 0, 'הבדיקה העצמית נכשלה:\n' + r.out);
    assert.match(r.out, /בדיקה עצמית: \d+\/\d+/);
    assert.doesNotMatch(r.out, /✗/, 'מקרה נכשל בתוך פלט ירוק:\n' + r.out);
  });
}

for (const script of ['pick_nudges.py', 'pick_inactive.py']) {
  test('⛔ שן · ' + script + ' נופל על ציפייה שגויה', () => {
    const r = run(script, ['--selftest', '--break']);
    assert.strictEqual(r.code, 1, 'השן לא ננעצה — --break היה אמור להחזיר 1:\n' + r.out);
  });

  test(script + ' · מקרה 6 ימים ו-22 שעות נספר 7 (הכשל של 30.8)', () => {
    const r = run(script, ['--selftest']);
    assert.match(r.out, /6 ימים ו-22 שעות → 7/,
      'העיגול חזר להיות כלפי מטה:\n' + r.out);
  });
}
