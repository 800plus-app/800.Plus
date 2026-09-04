'use strict';
/* מה שמתפרסם לאתר הוא רשימה סגורה — לא כל המאגר.
 *
 * מה נמדד ב-3.9.2026 על האתר החי
 * ---------------------------------
 * `curl` בלי חשבון ובלי תשלום החזיר 200 על כל אחד מאלה:
 *   https://800-plus.com/יחידות/יחידה-01.md          11,710 בתים — טבלת המילים של יחידה 1, קריאה לעין
 *   https://800-plus.com/שפות/עברית/יחידה 1/words.txt 13,492 בתים — רשימת המילים הגולמית
 *   https://800-plus.com/units_output/STATE.md        19,415 בתים — פלט הצינור
 *   https://800-plus.com/METHODOLOGY.md               31,757 בתים — תיעוד השיטה
 *   https://800-plus.com/tests/run.js                  2,551 בתים
 *   https://800-plus.com/supabase/rls-isolation-all-tables.sql  25,328 בתים
 * הסיבה אחת: Pages במצב «פרסום מענף» מגיש **כל** קובץ במאגר — 2,442 באותו יום.
 *
 * מה השער הזה עושה
 * ------------------
 * `scripts/build-pages.js` מגדיר רשימה סגורה, וה-workflow מפרסם רק אותה. הסכנה
 * ברשימה ידנית היא הכיוון ההפוך: קובץ שהאפליקציה **כן** צריכה נשכח בה, והאתר
 * עולה שבור. לכן הבדיקה כאן קוראת מה `index.html`, `sw.js`, `app.js` והמניפסט
 * באמת מבקשים, ודורשת שכל אחד מהם יהיה ברשימה. תגית `<script>` חדשה בלי שורה
 * ברשימה מפילה את החבילה — לא את המשתמשים.
 *
 * ⛔ ומה השער הזה **אינו** טוען, וזה עיקר העניין:
 * `data.js` ו-`data-en.js` **נשארים** מתפרסמים, מפני שהדפדפן טוען אותם כדי
 * להציג מילים. אפליקציית PWA סטטית לא יכולה למסור תוכן למשתמש ולהסתיר אותו
 * ממנו בו-זמנית. השער מסיר את העותקים שאיש אינו צריך; את המאגר המהודר שהמוצר
 * רץ עליו הוא אינו סוגר, וכל טענה אחרת תהיה שקרית.
 *
 * הוכחת שיניים (3.9.2026): הוצאת 'data.js' מ-FILES ב-build-pages.js הפילה את
 * «כל מה שהדף מבקש נמצא ברשימת הפרסום» עם `חסר ברשימת הפרסום: data.js`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { resolve, REPO } = require('../scripts/build-pages.js');

const published = resolve();
const pubSet = new Set(published);

/* מנקה ?v=230, ./ מוביל, ו-/ מוביל — כדי שההשוואה תהיה על אותו מרחב שמות. */
const norm = u => String(u).split('?')[0].replace(/^\.\//, '').replace(/^\//, '');
const external = u => /^(https?:|mailto:|data:|#|\/\/)/.test(u) || u === '';
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');

/* ===== מה הדף באמת מבקש ===== */

function fromIndex() {
  const html = read('index.html');
  const out = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) out.add(m[1]);
  for (const m of html.matchAll(/url\(([^)]+)\)/g)) out.add(m[1].replace(/^['"]|['"]$/g, ''));
  return [...out].filter(u => !external(u)).map(norm);
}

function fromSw() {
  const sw = read('sw.js');
  const out = new Set();
  const block = name => {
    const i = sw.indexOf('const ' + name + ' = [');
    assert.ok(i >= 0, `sw.js: לא נמצאה הרשימה ${name} — הבדיקה הזאת מדדה כלום`);
    return sw.slice(i, sw.indexOf('];', i));
  };
  for (const blk of [block('ASSETS'), block('CORE')]) {
    for (const m of blk.matchAll(/[`'"](\.[^`'"]+)[`'"]/g)) out.add(m[1]);
  }
  /* הקובץ היחיד שאינו ברשימה אלא נבנה בשורה נפרדת. */
  for (const m of sw.matchAll(/CONN\s*=\s*`([^`]+)`/g)) out.add(m[1]);
  return [...out].map(u => norm(u.replace('${REV}', ''))).filter(u => u !== '');
}

function fromApp() {
  const app = read('app.js');
  const out = new Set();
  for (const m of app.matchAll(/\.src\s*=\s*'(\.\/[^']+)'/g)) out.add(norm(m[1]));
  return [...out];
}

function fromManifest() {
  const mf = JSON.parse(read('manifest.webmanifest'));
  return (mf.icons || []).map(i => norm(i.src));
}

describe('105 · מה שמתפרסם לאתר', () => {

  test('כל מה שהדף מבקש נמצא ברשימת הפרסום', () => {
    const wanted = [
      ...fromIndex().map(u => ['index.html', u]),
      ...fromSw().map(u => ['sw.js', u]),
      ...fromApp().map(u => ['app.js', u]),
      ...fromManifest().map(u => ['manifest.webmanifest', u]),
    ];
    /* ⛔ אם החילוץ לא מצא כלום, הבדיקה עברה על ריק. */
    assert.ok(wanted.length >= 30, `חולצו רק ${wanted.length} נכסים — החילוץ נשבר`);
    const missing = wanted.filter(([, u]) => !pubSet.has(u));
    assert.deepStrictEqual(
      missing, [],
      'חסר ברשימת הפרסום: ' + missing.map(([w, u]) => `${u} (מבוקש ב-${w})`).join(', ')
    );
  });

  test('כל מה שברשימת הפרסום קיים על הדיסק', () => {
    const gone = published.filter(p => !fs.existsSync(path.join(REPO, p)));
    assert.deepStrictEqual(gone, [], 'ברשימה אך לא קיים: ' + gone.join(', '));
  });

  test('עצי המקור אינם מתפרסמים', () => {
    /* התיקיות שהיו נגישות בכתובת הפומבית ואין לאפליקציה שום צורך בהן. */
    const forbidden = [
      'units_output/', 'יחידות/', 'שפות/', 'sentences/', 'sentences-en/',
      'pipeline_output/', 'typo-lab/', 'tests/', 'scripts/', 'ביקורת/',
      'שיווק/', 'supabase/', '.github/',
    ];
    const leaked = published.filter(p => forbidden.some(d => p.startsWith(d)));
    assert.deepStrictEqual(leaked, [], 'עץ מקור מתפרסם: ' + leaked.join(', '));
  });

  test('מתיקיית מקור שיש בה קובץ חי מתפרסם רק הקובץ עצמו', () => {
    for (const [dir, only] of [
      ['sentence-completion/', 'sentence-completion/sent-lex.js'],
      ['connectives-he/', 'connectives-he/data-conn-he.js'],
      ['widget/', 'widget/widget.json'],
    ]) {
      const inDir = published.filter(p => p.startsWith(dir));
      assert.deepStrictEqual(inDir, [only], `${dir} מפרסם יותר מ-${only}: ` + inDir.join(', '));
    }
  });

  test('שום קובץ תיעוד אינו מתפרסם', () => {
    const docs = published.filter(p => p.toLowerCase().endsWith('.md'));
    assert.deepStrictEqual(docs, [], 'תיעוד מתפרסם: ' + docs.join(', '));
  });

  test('הקבצים שנמדדו חשופים ב-3.9.2026 אינם ברשימה', () => {
    /* כל אחד מאלה החזיר 200 באתר החי באותו יום. הם מקובעים בשמם כדי שחזרה
       שלהם לרשימה תיתפס, ולא רק החוק הכללי שמעליהם. */
    const measured = [
      'יחידות/יחידה-01.md',
      'שפות/עברית/יחידה 1/words.txt',
      'שפות/אנגלית/יחידה 1/words.txt',
      'units_output/STATE.md',
      'METHODOLOGY.md',
      'CLAUDE.md',
      'STATE.md',
      'DEPLOY.md',
      'README.txt',
      'words.txt',
      'tests/run.js',
      'supabase/rls-isolation-all-tables.sql',
    ];
    /* בקרה חיובית: אם אחד מהם כבר אינו במאגר, המדידה מתייחסת לעולם אחר. */
    const stillInRepo = measured.filter(p => fs.existsSync(path.join(REPO, p)));
    assert.ok(stillInRepo.length >= 10,
      `רק ${stillInRepo.length} מהקבצים שנמדדו עדיין במאגר — לעדכן את המדידה`);
    const leaked = measured.filter(p => pubSet.has(p));
    assert.deepStrictEqual(leaked, [], 'קובץ שנמדד חשוף חזר לרשימה: ' + leaked.join(', '));
  });

  test('רשימת הפרסום קטנה בסדר גודל מהמאגר', () => {
    /* המספר עצמו אינו מקודש; מה שמקובע הוא שהאתר אינו המאגר. */
    assert.ok(published.length > 20, `רשימת הפרסום ${published.length} — קטנה מדי, כנראה נשברה`);
    assert.ok(published.length < 80, `רשימת הפרסום ${published.length} — גדלה מעבר לאפליקציה`);
  });

  test('המאגר המהודר עדיין מתפרסם — וזה מה שלא נסגר', () => {
    /* ⛔ הבדיקה הזאת מקבעת מגבלה, לא הישג. `data.js` ו-`data-en.js` חייבים
       להיות מוגשים כדי שהאפליקציה תעבוד, ולכן הם ניתנים להורדה בלי חשבון.
       היא כאן כדי שאיש לא יקרא את השער הזה כאילו סגר את המאגר. */
    for (const f of ['data.js', 'data-en.js']) {
      assert.ok(pubSet.has(f), `${f} אינו ברשימה — האפליקציה תישבר`);
    }
  });
});
