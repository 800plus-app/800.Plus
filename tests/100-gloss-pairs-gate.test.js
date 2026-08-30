'use strict';
/* שער הפירוש המשותף · עטיפה דקה ל-`typo-lab/gate_gloss_pairs.js`.
 *
 * ⛔ למה הקובץ הזה קיים: השער נכתב, רץ ירוק, ו**אף אחד לא הריץ אותו**. הוא לא
 * הופיע ב-`tests/` ולא בשום workflow. שער שאיש אינו מפעיל אינו שער · הוא קובץ.
 *
 * ⭐ שתי הבדיקות מכוונות לשני כשלים שונים, ושתיהן נדרשות:
 *   1. אין קבוצת פירוש משותף שעודכנה חלקית, ואין קבוצה חדשה שאינה במניפסט.
 *   2. ⛔ לשער יש שיניים · `--selftest` מחזיר איבר אחד לפירוש המשותף בזיכרון
 *      ומוודא שהשער נופל. ירוק שלא ראו אותו אדום אינו עדות.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'typo-lab', 'gate_gloss_pairs.js');

const run = args => {
  try { return { code: 0, out: execFileSync('node', [GATE, ...args], { cwd: ROOT, encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

test('פירוש משותף · אין קבוצה שעודכנה חלקית', () => {
  const r = run([]);
  assert.strictEqual(r.code, 0, 'השער נפל על המאגר הנוכחי:\n' + r.out);
  assert.match(r.out, /אף אחת לא עודכנה חלקית/);
  assert.match(r.out, /אין קבוצה חדשה שאינה רשומה/);
});

test('⛔ שן · השער נופל על עדכון חלקי מדומה', () => {
  const r = run(['--selftest']);
  assert.strictEqual(r.code, 0, 'הבדיקה העצמית נכשלה:\n' + r.out);
  assert.match(r.out, /עדכון חלקי/);
  assert.match(r.out, /יש שיניים/);
});
