'use strict';
/* מילה שהוצגה ללומד נחשבת מילה שנפגש איתה — גם אם לא ענה עליה.
 *
 * הדיווח (2.8.2026): "כשאני מתרגל מילים חדשות — יש מילים שמופיעות כמה פעמים... זאת הבעיה
 * הכי גדולה שלנו כרגע שפוגעת באמון המשתמשים".
 *
 * מה שנמדד, ולא נוחש
 * -------------------
 * scratchpad/practice_sim.js מריץ סבבי תרגול אמיתיים מול newCards/cap/shuffle שהורמו מ-app.js.
 * בסבב שמושלם עד הסוף: אפס חזרות, בכל עשר היחידות. בסבב שננטש באמצע: 60 חזרות על פני 12
 * סבבים. ההפרש הוא כרטיס אחד בדיוק לכל סבב — זה שהיה על המסך כשהלומד יצא.
 *
 * הסיבה
 * ------
 * session מתמלא ב-finishCard, כלומר רק כשעונים. הכרטיס שהוצג ולא נענה אינו נכנס אליו, ולכן
 * commitSession לא מגדילה לו seen — ו-newCards, שמסננת לפי seen===0, מחזירה אותו כחדש.
 *
 * למה לא לספור אותו כטעות
 * ------------------------
 * הפיתוי הוא לרשום אותו ככישלון ולסיים. אבל הלומד לא ענה תשובה שגויה — הוא לא ענה בכלל.
 * לרשום wrong ולהוריד level היה מעניש אותו על סגירת האפליקציה, ודוחף את המילה לרשימת החיזוק
 * בלי שום ראיה שהיא חלשה. הרשומה נכתבת כ"נפגשתי" בלבד: seen ו-last, ותו לא.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();

/* commitSession נוגעת ב-Store, ב-LS וב-DOM ואינה ניתנת להרמה לארגז החול. הכללים נבדקים כאן על
   מימוש מקביל, והבדיקות האחרונות מוודאות שהכללים שב-app.js עדיין אלה — כדי ששינוי בקוד לא
   ישאיר בדיקה ירוקה על התנהגות שכבר לא קיימת. */
function commit(words, session) {
  for (const [k, e] of session) {
    const r = words[k] || (words[k] = { seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 });
    const wasNew = r.seen === 0;
    r.seen++;
    if (e.attempts === 0) { r.last = 1; continue; }      // הוצג ולא נענה — נפגשתי, וזהו
    if (e.mastered && e.firstTry) { r.first++; r.ever++; r.level = Math.min(3, wasNew ? 3 : r.level + 1); }
    else if (e.mastered) { r.ever++; r.level = Math.max(0, r.level - 1); }
    else { r.wrong++; r.level = Math.max(0, r.level - 1); }
    r.last = 1;
  }
}
const shownOnly = () => new Map([['alpha', { attempts: 0, mastered: false, firstTry: false }]]);

describe('כרטיס שהוצג ולא נענה', () => {

  test('נספר כמילה שנפגשנו איתה', () => {
    const words = {};
    commit(words, shownOnly());
    assert.strictEqual(words.alpha.seen, 1,
      'seen נשאר 0 — newCards תחזיר את המילה כחדשה, וזו בדיוק החזרתיות שדווחה');
  });

  test('אינו נספר כטעות ואינו מוריד את הרמה', () => {
    /* הצד השני של אותו מטבע: מי שסגר את האפליקציה לא ענה תשובה שגויה. */
    const words = { alpha: { seen: 3, first: 2, ever: 2, wrong: 0, level: 2, last: 0 } };
    commit(words, shownOnly());
    assert.strictEqual(words.alpha.wrong, 0, 'נרשמה טעות על מילה שהלומד לא ענה עליה כלל');
    assert.strictEqual(words.alpha.level, 2, 'הרמה ירדה בגלל יציאה מהאפליקציה');
  });

  test('אינו מזכה בהתקדמות', () => {
    const words = {};
    commit(words, shownOnly());
    assert.strictEqual(words.alpha.first, 0, 'נרשמה ידיעה על מילה שלא נענתה');
    assert.strictEqual(words.alpha.ever, 0);
    assert.strictEqual(words.alpha.level, 0, 'מילה שרק הוצגה קפצה לרמה 3');
  });

  test('כרטיס שכן נענה ממשיך להתנהג בדיוק כמקודם', () => {
    /* בלי זה, התיקון עלול לבלוע את המסלול הרגיל בלי שאף בדיקה תיפול. */
    const words = {};
    commit(words, new Map([['beta', { attempts: 1, mastered: true, firstTry: true }]]));
    assert.deepStrictEqual(
      { seen: words.beta.seen, first: words.beta.first, level: words.beta.level },
      { seen: 1, first: 1, level: 3 });
  });
});

describe('הכללים עדיין ב-app.js', () => {

  test('renderCard רושם את הכרטיס שהוצג', () => {
    const at = app.indexOf('function renderCard');
    assert.ok(at > 0, 'renderCard נעלמה');
    const body = app.slice(at, at + 900);
    assert.ok(/sess\(w\)/.test(body),
      'הכרטיס אינו נרשם בזמן ההצגה — מי שיצא באמצע יקבל אותו שוב כמילה חדשה');
  });

  test('commitSession מבדילה בין הוצג-ולא-נענה לבין נענה', () => {
    const at = app.indexOf('function commitSession');
    assert.ok(at > 0, 'commitSession נעלמה');
    const body = app.slice(at, at + 1800);
    assert.ok(/attempts\s*===\s*0/.test(body),
      'אין הבחנה בין כרטיס שהוצג לכרטיס שנענה — או שהחזרתיות חוזרת, או שנרשמת טעות שלא קרתה');
  });

  test('newCards עדיין מסננת לפי seen ולא לפי level', () => {
    /* הבאג הקודם באותו מקום בדיוק: level הוא מונה חוזק, לא רישום פגישה. */
    assert.ok(/function newCards[\s\S]{0,120}seenCount\(w\.term\)\s*===\s*0/.test(app),
      'newCards חזרה להסתמך על level — זה הבאג שגרם לחזרתיות בפעם הקודמת');
  });
});
