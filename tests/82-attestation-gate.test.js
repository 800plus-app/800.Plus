'use strict';
/* שער טבלאות ההוכחה · עטיפה דקה ל-`units_output/check_attestation.js`.
 *
 * ⛔ למה הקובץ הזה קיים בכלל: `check_all.py` אינו מזכיר `attestation` אף פעם, ואף
 * בדיקה כאן לא קראה את הקבצים האלה. שלושה שינויים רצופים בהם עברו על ירוק מלא ·
 * **ירוק אמיתי, ועיוור לגמרי לקובץ.**
 *
 * ⚠ הלוגיקה יושבת ב-`units_output/`, לצד `check_all.py`, ולא כאן · שם היא בהיקף
 * הקבצים של הסשן שמתחזק את המאגר, וכאן רק ההפעלה. אם צריך להזיז את העטיפה
 * לסשן אחר, זה קובץ של עשרים שורות.
 *
 * ⭐ שתי הבדיקות מכוונות לשני כשלים שונים, ושתיהן נדרשות:
 *   1. אין ממצא **חדש** מעבר לחוב המתועד.
 *   2. ⛔ לשער עצמו יש שיניים · הוא נופל על שורה מורעלת. שער שמדווח «עבר» בלי
 *      שראו אותו נופל אינו עדות, וזה כבר קרה בפרויקט הזה שלוש פעמים.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'units_output', 'check_attestation.js');

const run = args => {
  try { return { code: 0, out: execFileSync('node', [GATE, ...args], { cwd: ROOT, encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

test('טבלאות ההוכחה · אין ממצא חדש מעבר לחוב המתועד', () => {
  const r = run([]);
  assert.strictEqual(r.code, 0,
    'השער מצא ממצא חדש בטבלאות ההוכחה:\n' + r.out);
  assert.match(r.out, /אפס ממצאים חדשים/);
});

test('⛔ שן · השער נופל על שורה מורעלת', () => {
  const r = run(['--selftest']);
  assert.strictEqual(r.code, 0, 'הבדיקה העצמית נכשלה:\n' + r.out);
  /* ארבעת הכללים, כל אחד בנפרד · «נפל» גורף היה מסתיר כלל שמת */
  /* ⭐ 'מקור אסור · gloss-status' הוא המקרה שבודק את **מפת העמודות**:
   * שם המילה בעמודה 4 והמקור ב-6. ⛔ מפה שגויה מחזירה «אפס ממצאים»,
   * וזה נראה בדיוק כמו ירוק אמיתי · וכך השער החמיץ 38 הפרות בקובץ הזה. */
  for (const kind of ['שורה בלי מקור', 'מקור אסור', 'רישיון CC-BY-SA', 'לקסמה שגויה', 'מקור אסור · gloss-status'])
    assert.ok(new RegExp('✓ נפל\\s+' + kind).test(r.out),
      'הכלל «' + kind + '» לא נפל על השורה המורעלת:\n' + r.out);
});
