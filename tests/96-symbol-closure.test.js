'use strict';
/* רשימת סמלים חייבת להיות סגורה · פונקציה שהיא מרימה, ושקוראת לאחרת, גוררת אותה.
 *
 * ⛔ הכשל, ארבע פעמים בפרויקט הזה
 * ------------------------------
 * פונקציה חדשה נוספת ל-`app.js`, נקראת מתוך פונקציה **שכן** מורמת, ולא נרשמת
 * ברשימת הסמלים. התוצאה היא `ReferenceError` יחיד · ועשרות בדיקות שמאדימות
 * בשמות **סמנטיים** שאין להם קשר לסיבה:
 *
 *   `typoShare`      · 19 בדיקות · «מילה שונה לגמרי עדיין נדחית»
 *   `typoSegConcat`  · 19 בדיקות · אותם שמות
 *   `fullVetoPass`   · **140 בדיקות**, כולל `00-harness` עצמה
 *   `backfillT0`     · 15 בדיקות · «junk of every type loads to an empty state»
 *   `sentTextHtml`   · 23 בדיקות · «מה נשמע» · «נגישות»
 *
 * ⭐ ובכל פעם התיקון היה שורה אחת, והאבחון לקח את רוב הזמן.
 *
 * ⭐ ומאז 5.9.2026 · `tests/07` **יורש** את הרשימה של `sandbox.js` ומוסיף רק
 * את סמלי שכבת האחסון שלו (`EXTRA_SYMBOLS`), כך ששם חדש שנכנס למקור האחד זורם
 * אליו מעצמו. השער כאן נשאר על הרשימה **המאוחדת**: הורשה סוגרת את פער
 * שתי-הרשימות, אבל אינה מוכיחה שהרשימה המאוחדת עצמה סגורה.
 *
 * ⚠ מה השער **אינו** תופס, במפורש: קריאה שנבנית כמחרוזת, קריאה דרך
 * `window[...]`, ופונקציה שנקראת רק מתוך מטפל DOM שאינו מורם ממילא.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, SYMBOLS: SANDBOX_SYMBOLS } = require('./_harness/sandbox.js');
const { codeMask, matchBrace } = require('./_harness/scan.js');

const שורש = path.join(__dirname, '..');
const SRC = appSource();
const MASK = codeMask(SRC);

/** כל שם של פונקציה שמוצהרת ברמה העליונה של app.js. */
function פונקציותעליונות() {
  const out = new Map();
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(SRC))) {
    /* ⛔ רק הצהרה שמתחילה בעמודה 0 · פונקציה מקוננת אינה סמל שאפשר להרים. */
    if (m.index > 0 && SRC[m.index - 1] !== '\n') continue;
    const open = SRC.indexOf('{', m.index);
    const close = matchBrace(SRC, open, MASK);
    if (close > open) out.set(m[1], SRC.slice(open + 1, close));
  }
  return out;
}

/** השמות שקוד מסוים קורא להם, מתוך קבוצת מועמדים · על קוד בלי הערות ובלי מחרוזות. */
function קוראל(גוף, מועמדים) {
  /* ⛔ ההערות והמחרוזות יורדות לפני החיפוש. שם שמופיע בהערה אינו קריאה,
     וזו בדיוק הצורה שבה שער־נוכחות עובר בלי לבדוק דבר · נמדד ב-tests/39. */
  const נקי = גוף
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const hits = new Set();
  for (const שם of מועמדים)
    if (new RegExp('\\b' + שם + '\\s*\\(').test(נקי)) hits.add(שם);
  return hits;
}

/** רשימת הסמלים של קובץ בדיקה, כפי שהיא כתובה בו. */
function רשימתקובץ(rel, marker = 'const SYMBOLS = [') {
  const txt = fs.readFileSync(path.join(שורש, rel), 'utf8');
  const i = txt.indexOf(marker);
  assert.notStrictEqual(i, -1, `${rel} · לא נמצאה הרשימה ${marker}`);
  const seg = txt.slice(i, txt.indexOf('];', i));
  return [...seg.matchAll(/'([A-Za-z_$][\w$]*)'/g)].map(m => m[1]);
}

/** מה שהסביבה מספקת בעצמה · דוקאים שאינם צריכים להיות מורמים. */
function דוקאים(rel) {
  const txt = fs.readFileSync(path.join(שורש, rel), 'utf8');
  const i = txt.indexOf('const ctx = {');
  if (i < 0) return new Set();
  const seg = txt.slice(i, txt.indexOf('};', i));
  return new Set([...seg.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*[(:]/gm)].map(m => m[1]));
}

const TOP = פונקציותעליונות();

describe('סגירות רשימות הסמלים', () => {

  /* ⭐ בקרה חיובית · בלי זה כל בדיקה שאחריה עוברת מהסיבה הלא נכונה. */
  test('נמצאו פונקציות עליונות ב-app.js', () => {
    assert.ok(TOP.size > 100, `נמצאו ${TOP.size} פונקציות · ציפיתי למאות`);
    assert.ok(TOP.has('loadLangState') && TOP.has('mergeProgress'),
      'חילוץ הפונקציות פספס שמות ידועים · הביטוי השתנה');
  });

  const מקרים = [
    { rel: 'tests/_harness/sandbox.js', list: () => SANDBOX_SYMBOLS },
    /* הרשימה בפועל של tests/07 היא ירושה + תוספות · השער רץ על האיחוד. */
    { rel: 'tests/07-storage.test.js',
      list: () => SANDBOX_SYMBOLS.concat(רשימתקובץ('tests/07-storage.test.js', 'const EXTRA_SYMBOLS = [')) },
  ];

  for (const { rel, list } of מקרים) {
    test(`${rel} · כל מה שנקרא מתוך המורמות · מורם גם הוא`, () => {
      const names = list();
      const set = new Set(names);
      const stubs = דוקאים(rel);
      const חסרים = [];
      for (const שם of names) {
        const גוף = TOP.get(שם);
        if (!גוף) continue;                       // קבוע ולא פונקציה · אין גוף לסרוק
        for (const נקרא of קוראל(גוף, TOP.keys()))
          if (נקרא !== שם && !set.has(נקרא) && !stubs.has(נקרא))
            חסרים.push(`${שם} → ${נקרא}`);
      }
      assert.strictEqual(חסרים.length, 0,
        `⛔ ${חסרים.length} קריאות לפונקציה שאינה ברשימה ואינה דוקא. ` +
        'כל אחת מהן היא ReferenceError יחיד שיפיל עשרות בדיקות בשמות שאין להם ' +
        'קשר לסיבה:\n  ' + [...new Set(חסרים)].slice(0, 15).join('\n  '));
    });
  }

  /* ⭐ הירושה היא התיקון · השער הזה הוא מה שמונע ממנה להתפרק בחזרה לשתי רשימות. */
  test('tests/07 יורש את הרשימה של sandbox.js ואינו מעתיק אותה', () => {
    const txt = fs.readFileSync(path.join(שורש, 'tests/07-storage.test.js'), 'utf8');
    assert.ok(txt.includes('SANDBOX_SYMBOLS.concat(EXTRA_SYMBOLS)'),
      'tests/07 חזר לרשימה עצמאית · שם חדש ב-sandbox.js שוב יפיל אותו בשמות מטעים');
    const extras = רשימתקובץ('tests/07-storage.test.js', 'const EXTRA_SYMBOLS = [');
    const dup = extras.filter(n => SANDBOX_SYMBOLS.includes(n));
    assert.deepStrictEqual(dup, [],
      'EXTRA_SYMBOLS מכפיל שמות שכבר ב-sandbox.js · זו תחילת הפיצול בחזרה: ' + dup.join(', '));
  });
});
