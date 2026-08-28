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
 * ⛔ ולמה שער ולא «להוריש את הרשימה»
 * ---------------------------------
 * ‏`tests/07` מרים **סט אחר בכוונה** · הוא בודק את שכבת האחסון ומספק
 * `localStorage` משלו, בזמן ש-`sandbox.js` דווקא **אינו** מספק אחד.
 * הורשה הייתה מכריחה אותו לגרור ~100 סמלים שאינם נוגעים לו.
 * ⭐ הסגירות היא מה שצריך לאכוף, לא זהות הרשימות.
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
function רשימתקובץ(rel) {
  const txt = fs.readFileSync(path.join(שורש, rel), 'utf8');
  const i = txt.indexOf('const SYMBOLS = [');
  assert.notStrictEqual(i, -1, `${rel} · לא נמצאה רשימת SYMBOLS`);
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
    { rel: 'tests/07-storage.test.js', list: () => רשימתקובץ('tests/07-storage.test.js') },
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

  /* ⭐ ההערה ב-`tests/07` מתעדת שזו רשימה שנייה · השער הזה הוא מה שהופך
     את התיעוד הזה לאכיף. */
  test('ההערה על הרשימה השנייה נשארה במקומה', () => {
    const txt = fs.readFileSync(path.join(שורש, 'tests/07-storage.test.js'), 'utf8');
    assert.ok(/רשימת סמלים \*\*שנייה\*\*/.test(txt),
      'ההערה שמסבירה שיש שתי רשימות הוסרה · הקורא הבא לא יידע');
  });
});
