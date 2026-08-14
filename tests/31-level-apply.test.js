'use strict';
/* הכתיבה הגדולה ביותר באפליקציה, ומה שומר עליה.
 *
 * הרקע, מתוך ההערה בקוד עצמו
 * ---------------------------
 * גרסה קודמת של מבחן הרמה כתבה {seen:1, wrong:0, level:3} על 2,470 מילים ומחקה כל
 * ספירת תרגול שהייתה מאחוריהן. שני כללים נוספו כדי שזה לא יחזור:
 *
 *   1. רשומה קיימת לעולם אינה נדרסת · גם לא רשומה חלשה. היסטוריה גוברת על ניחוש.
 *   2. כל רשומה שנכתבת כאן נושאת src:'lv', ולכן ריצה שגויה ניתנת לזיהוי ולביטול.
 *      בלי הסימון הזה אין שום דרך להבדיל בינה לבין תרגול אמיתי.
 *
 * שני הכללים לא נבדקו מעולם, ושניהם שקטים כשהם נשברים: הראשון מוחק היסטוריה בלי
 * להתריע, והשני משאיר את "שחזור" בניהול מילים בלי מה למצוא · כלומר הופך את ההבטחה
 * "תמיד אפשר להחזיר אותן" לשקר.
 *
 * שלישי, ולא פחות חשוב: המספר שמוצג במסך האישור חייב להיות המספר שהכפתור באמת מייצר.
 * הערה בקוד מספרת שפעם הוא הבטיח 2,470 בזמן שהפעולה סימנה הרבה פחות · מסך שמבקש
 * הסכמה למספר שגוי.
 *
 * למה חלק מהבדיקות הן על המקור
 * ------------------------------
 * lvApplyKnown מחליפה LANG, קוראת ל-loadLangState, ל-saveStats ול-Store · כלומר היא
 * דורשת את שכבת האחסון ואת שכבת הרשת יחד. הכללים עצמם נבדקים כאן על מימוש מקביל
 * מדויק, והבדיקה האחרונה מוודאת שהכללים שב-app.js עדיין אלה · כך ששינוי בקוד לא
 * ישאיר בדיקה ירוקה על התנהגות שכבר לא קיימת.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource, banks } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const en = loadApp({ lang: 'en', bank: false });
/* LV_CUT אינו ברשימת הסמלים המשותפת · הוא נדרש רק כאן, והרמתו נקודתית עדיפה על
   הרחבת הרשימה שכל שאר הקבצים משלמים עליה. */
for (const { name, code } of extractAll(appSource(), ['LV_CUT']))
  vm.runInContext(code, en, { filename: `app.js:${name}` });
const app = appSource();
const EN = banks().en;

/* מימוש מקביל לגוף הלולאה של lvApplyKnown. כל שורה כאן מקבילה לשורה שם. */
function applyKnown(words, cut, rankOf, data) {
  let n = 0; const stamp = 1754000000000;
  for (const u in data) for (const p of (data[u] || [])) {
    const r = rankOf(p[0]); if (!(r && r <= cut)) continue;
    const k = en.normEn(p[0]); if (!k) continue;
    if (words[k]) continue;
    words[k] = { seen: 1, first: 1, ever: 1, wrong: 0, level: 3, last: stamp, src: 'lv' };
    n++;
  }
  return n;
}

/* מאגר קטן ודטרמיניסטי. הבנק האמיתי משתתף רק בבדיקת הסקאלה בסוף. */
const DATA = { 1: [['alpha', 'א'], ['bravo', 'ב'], ['charlie', 'ג']],
               2: [['delta', 'ד'], ['echo', 'ה']] };
const RANK = { alpha: 100, bravo: 300, charlie: 900, delta: 5000, echo: null };
const rankOf = t => RANK[en.normEn(t)] || null;

describe('כלל 1 · היסטוריה לעולם אינה נדרסת', () => {

  test('רשומה קיימת נשארת בדיוק כפי שהייתה', () => {
    const real = { seen: 9, first: 2, ever: 5, wrong: 4, level: 1, last: 111 };
    const words = { alpha: Object.assign({}, real) };
    applyKnown(words, 1000, rankOf, DATA);
    assert.deepStrictEqual(words.alpha, real,
      'מילה עם היסטוריה נדרסה — זה בדיוק הבאג שמחק 2,470 רשומות');
  });

  test('גם רשומה חלשה מאוד גוברת על הסימון', () => {
    /* המקרה המפתה: level 0 ו-4 טעויות "נראה" כמו כלום, והוא בדיוק המידע היקר · 
       מילה שהלומד נכשל בה שוב ושוב. סימונה כידועה מוציאה אותה מהתרגול לתמיד. */
    const weak = { seen: 4, first: 0, ever: 0, wrong: 4, level: 0, last: 222 };
    const words = { bravo: Object.assign({}, weak) };
    applyKnown(words, 1000, rankOf, DATA);
    assert.deepStrictEqual(words.bravo, weak, 'רשומה חלשה נדרסה בידי מבחן הרמה');
  });

  test('רשומה שנכתבה בריצה קודמת של המבחן אינה נספרת פעמיים', () => {
    const words = {};
    const first = applyKnown(words, 1000, rankOf, DATA);
    const second = applyKnown(words, 1000, rankOf, DATA);
    assert.strictEqual(second, 0, 'ריצה שנייה סימנה שוב — הספירה מנופחת');
    assert.ok(first > 0);
  });
});

describe('כלל 2 · הסימון שמאפשר לבטל', () => {

  test('כל רשומה שנכתבת נושאת src=lv', () => {
    const words = {};
    applyKnown(words, 1000, rankOf, DATA);
    for (const k of Object.keys(words))
      assert.strictEqual(words[k].src, 'lv',
        `${k} נכתב בלי סימון — אי אפשר להבדיל בינו לבין תרגול אמיתי, ו"שחזור" לא ימצא אותו`);
  });

  test('רשומות אמיתיות אינן מקבלות את הסימון', () => {
    /* הצד השני: אם הסימון ידבק גם לתרגול אמיתי, "שחזור" ימחק היסטוריה אמיתית. */
    const words = { alpha: { seen: 3, level: 2 } };
    applyKnown(words, 1000, rankOf, DATA);
    assert.ok(!words.alpha.src, 'רשומת תרגול אמיתית קיבלה src');
  });

  test('הסימון הוא בדיוק מה ש"שחזור" ו-mergeProgress מחפשים', () => {
    /* שלושה מקומות באפליקציה מחפשים src==='lv'. ערך אחר בכל אחד מהם שובר את הביטול
       בלי להפיל דבר. */
    assert.ok(/src\s*===\s*'lv'/.test(app), "אף אחד כבר לא מחפש src==='lv'");
    assert.ok(/src:\s*'lv'/.test(app), "lvApplyKnown כבר לא כותב src:'lv'");
  });
});

describe('הסף · LV_CUT', () => {

  test('רק מילים מתחת לסף מסומנות', () => {
    const words = {};
    applyKnown(words, 1000, rankOf, DATA);
    assert.ok(words.alpha && words.bravo && words.charlie, 'מילה מתחת לסף לא סומנה');
    assert.ok(!words.delta, 'מילה מעל הסף (5000) סומנה בסף 1000');
  });

  test('מילה בלי דירוג אינה מסומנת לעולם', () => {
    /* בלי התנאי הזה, מילה שאין עליה נתון הייתה מסומנת כידועה על סמך כלום. */
    const words = {};
    applyKnown(words, 999999, rankOf, DATA);
    assert.ok(!words.echo, 'מילה בלי דירוג סומנה כידועה');
  });

  test('A1 ו-A2 אינם מסמנים דבר', () => {
    /* LV_CUT מחזיר 0, והפונקציה יוצאת מיד. מי שנבחן ברמה הנמוכה ביותר אינו אמור
       לדלג על שום מילה. */
    assert.strictEqual(en.LV_CUT.A1, 0);
    assert.strictEqual(en.LV_CUT.A2, 0);
  });

  test('הסף עולה עם הרמה, ו-C2 אינו מכסה את כל המאגר', () => {
    /* ההערה בקוד מתעדת בדיוק את זה: סף מקל מדי הציע לסמן 3,175 מתוך 3,694 מילים
       על סמך מבחן אחד. */
    const L = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    for (let i = 1; i < L.length; i++)
      assert.ok(en.LV_CUT[L[i]] >= en.LV_CUT[L[i - 1]],
        `הסף אינו עולה בין ${L[i - 1]} ל-${L[i]}`);

    const ranked = [];
    for (const u in EN) for (const p of (EN[u] || [])) ranked.push(p[0]);
    const words = {};
    const marked = applyKnown(words, en.LV_CUT.C2, () => 1, EN);   // כל המילים מדורגות ומתחת לסף
    assert.ok(marked > 0);
    assert.ok(en.LV_CUT.C2 < 20000,
      `סף C2 הוא ${en.LV_CUT.C2} — גבוה מספיק כדי לכסות את כל הבנק המדורג`);
  });
});

describe('המספר שבמסך האישור הוא המספר שהכפתור מייצר', () => {

  test('הספירה מדלגת על מה שהסימון מדלג עליו', () => {
    /* lvCountKnown ו-lvApplyKnown חייבות להסכים. ההערה בקוד מספרת שפעם הן לא הסכימו,
       והמסך ביקש הסכמה למספר שלא קרה. */
    const words = { alpha: { seen: 2 } };
    const n = applyKnown(Object.assign({}, words), 1000, rankOf, DATA);
    assert.strictEqual(n, 2, `הספירה החזירה ${n} — alpha כבר קיימת ואמורה לרדת מהמניין`);
  });

  test('lvCountKnown ב-app.js אכן מדלגת על רשומות קיימות ועל מחוקות', () => {
    const at = app.indexOf('function lvCountKnown');
    assert.ok(at > 0, 'lvCountKnown נעלמה');
    const body = app.slice(at, at + 900);
    assert.ok(/words\[k\]/.test(body), 'lvCountKnown אינה בודקת רשומות קיימות');
    assert.ok(/gone|deleted/.test(body), 'lvCountKnown אינה מתחשבת במילים שנמחקו');
  });

  test('lvApplyKnown ב-app.js עדיין נושאת את שני הכללים', () => {
    const at = app.indexOf('function lvApplyKnown');
    assert.ok(at > 0, 'lvApplyKnown נעלמה');
    const body = app.slice(at, at + 900);
    assert.ok(/if\s*\(\s*stats\.words\[k\]\s*\)\s*continue/.test(body),
      'כלל 1 נעלם — רשומה קיימת כבר אינה מוגנת, וזה הבאג שמחק 2,470 רשומות');
    assert.ok(/src:\s*'lv'/.test(body), "כלל 2 נעלם — הרשומות נכתבות בלי src:'lv'");
    assert.ok(/LANG\s*=\s*wasLang|LANG\s*=\s*here/.test(app.slice(at, at + 2600)),
      'LANG אינה מוחזרת — האפליקציה נשארת באנגלית אחרי מבחן רמה בעברית');
  });
});
