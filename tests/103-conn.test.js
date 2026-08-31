'use strict';
/* שערי יחידת מילות הקישור · עטיפה דקה מעל `connectives-he/`.
 *
 * ⛔ למה הקובץ הזה קיים: הלוגיקה של היחידה יושבת בחמישה שערים שרצים ביד או דרך
 * ‏`verify_all_conn.js`. שער שאיש אינו מריץ בכל קומיט הוא שער שמת בשקט · זה כבר
 * קרה כאן עם `units_output/check_attestation.js`, ששלושה שינויים רצופים עברו
 * מעליו על ירוק מלא ועיוור לגמרי לקובץ.
 *
 * ⚠ ‏`verify_all_conn.js` מריץ את `tests/run.js` בתוכו, ולכן הקובץ הזה מריץ את
 * חמשת השערים **ישירות**. קריאה ל-`verify_all_conn` מכאן הייתה רקורסיה אינסופית.
 *
 * ⭐ שלוש שכבות, וכל אחת נדרשת:
 *   1. השערים ירוקים על המנות שבעץ.
 *   2. ⛔ **לשער הפורמט יש שיניים** · שישה פגמים שתולים, כל אחד נופל בנפרד.
 *      «נפל» גורף היה מסתיר כלל שמת.
 *   3. ⛔ **השערים מסרבים לרוץ על ריק** · שער שסורק אפס פריטים ומדווח «0 ממצאים»
 *      הוא בדיוק הירוק המזויף שהמערכת הזאת נבנתה נגדו. נמדד עם תיקיית מנות ריקה.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const G = f => path.join(ROOT, 'connectives-he', f);

const run = (file, args, env) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [G(file), ...(args || [])],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...(env || {}) } }) };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
};

const GATES = [
  ['check_format_conn.js', 'שער הפורמט'],
  ['check_direction_he.js', 'שער הכיוון'],
  ['check_slot_he.js', 'שער החריץ התחבירי'],
  ['check_flip.js', 'שער מילות ההיפוך'],
];

describe('מילות קישור · השערים ירוקים על המנות שבעץ', () => {
  for (const [file, name] of GATES) {
    test(`${name} · 0 ממצאים`, () => {
      const r = run(file);
      assert.strictEqual(r.code, 0, `${name} מצא ממצא:\n${r.out}`);
      assert.match(r.out, /✅ השער עבר/);
      /* ⛔ הבקרה החיובית · «0 ממצאים» על אפס פריטים אינו ירוק */
      const m = r.out.match(/· (\d+) פריטים נסרקו/);
      assert.ok(m && Number(m[1]) > 0, `${name} לא סרק אף פריט:\n${r.out}`);
    });
  }

  test('המאחד בונה את קובץ הנתונים ואינו דוחה פריט', () => {
    const r = run('assemble_conn.js');
    assert.strictEqual(r.code, 0, 'המאחד דחה פריט:\n' + r.out);
    assert.match(r.out, /נדחו: 0\b/);
    assert.ok(fs.existsSync(G('data-conn-he.js')), 'data-conn-he.js לא נכתב');
  });

  test('קובץ הנתונים נטען ומייצר את הגלובל שלו', () => {
    const w = {};
    new Function('window', fs.readFileSync(G('data-conn-he.js'), 'utf8'))(w);
    assert.ok(w.CONN_HE && typeof w.CONN_HE === 'object', 'CONN_HE אינו אובייקט');
    const all = Object.values(w.CONN_HE).flat();
    assert.ok(all.length > 0, 'CONN_HE ריק');
    /* ⚠ `a:0` בכל פריט הוא הצהרה שהמגיש **חייב** לערבב · אם היא תישבר, כל
       התשובות באפליקציה ייצאו באותו מקום ואיש לא ישים לב עד שילד יפתור. */
    for (const it of all) assert.strictEqual(it.a, 0, `${it.src}: a אינו 0`);
  });
});

describe('⛔ שיניים · שער הפורמט נופל על כל אחד משישה פגמים שתולים', () => {
  const r = run('check_format_conn.js', ['--selftest']);

  test('הבדיקה העצמית עצמה עוברת', () => {
    assert.strictEqual(r.code, 0, 'הבדיקה העצמית נכשלה:\n' + r.out);
    assert.match(r.out, /לשער יש שיניים/);
  });

  /* כל פגם בנפרד · «נפל» גורף היה מסתיר כלל שמת בלי שאיש יראה */
  for (const kind of ['שדה חסר (k)', 'o באורך 3', 'a אינו 0', 'w שאינו o[0]', 'שני חריצי ___', 'מקף ארוך'])
    test(`נפל · ${kind}`, () => {
      const esc = kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.ok(new RegExp('✓ נופל\\s+' + esc).test(r.out),
        `הפגם «${kind}» לא נתפס:\n${r.out}`);
    });

  test('עובר · הפריט התקין', () => {
    assert.ok(/✓ עובר\s+הפריט התקין/.test(r.out), 'הפריט התקין נפסל:\n' + r.out);
  });
});

describe('⛔ שיניים · השערים מסרבים לדווח על ריק', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-empty-'));

  for (const [file, name] of GATES)
    test(`${name} · תיקיית מנות ריקה מחזירה קוד 2`, () => {
      const r = run(file, [], { CONN_BATCHES: empty });
      assert.strictEqual(r.code, 2, `${name} לא סירב לרוץ על ריק:\n${r.out}`);
      assert.match(r.out, /אפס פריטים/);
    });

  test('המאחד · תיקיית מנות ריקה מחזירה קוד 2 ואינו כותב', () => {
    const r = run('assemble_conn.js', [], { CONN_BATCHES: empty });
    assert.strictEqual(r.code, 2, 'המאחד כתב על ריק:\n' + r.out);
    assert.match(r.out, /מסרב לכתוב על ריק/);
  });
});
