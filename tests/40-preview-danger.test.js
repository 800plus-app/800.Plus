'use strict';
/* מחיקת האחסון המקומי כשאין עותק אחר בשום מקום.
 *
 * מה שנמצא
 * --------
 * `signOutNow` מוחק את localStorage רק אם הסנכרון הצליח. הנימוק כתוב שם ונכון: מכשיר שמחזיק
 * את העותק היחיד לא נמחק. אבל `saved` אותחל ל-`true`, וה-`if` שמציב אותו לפי הסנכרון מותנה
 * ב-`currentUser`.
 *
 * במצב הצצה אין `currentUser`. ה-`if` מדולג, `saved` נשאר `true`, ו-`localStorage.clear()` רץ.
 *
 * PREVIEW מסנן את היחידות בלבד (app.js: buildBank) — שום דבר אחר לא חסום, ולכן הגלגל במסך
 * בחירת השפה פותח את מסך החשבון המלא, כולל "אזור מסוכן", למי שאין לו חשבון. שלוש לחיצות
 * מסקרנות, ובלי אף שאלה, מוחקות בדיוק את ההתקדמות שהפס הזהוב מבטיח שתעבור לחשבון.
 *
 * שתי שכבות, ובכוונה
 * -------------------
 * הסתרת הכפתורים היא תיקון החוויה. `saved=!!currentUser` היא רשת הביטחון, והיא זו שקובעת —
 * כי היא מחזיקה גם אם מסלול אחר יגיע ל-signOutNow, וגם אם מישהו יוסיף כפתור ולא ירשום אותו
 * ברשימה. בדיקה על ההסתרה לבדה הייתה משאירה את המחיקה עצמה פתוחה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();
const signOut = app.slice(app.indexOf('const signOutNow'),
                          app.indexOf('$(\'#accSignOut\').onclick'));

describe('רשת הביטחון — מה שקובע', () => {

  test('בלי חשבון, saved מתחיל כ-false', () => {
    assert.ok(/let\s+saved\s*=\s*!!\s*currentUser/.test(signOut),
      'saved מתחיל כ-true, ולכן מצב הצצה מוחק את האחסון בלי שום עותק אחר');
  });

  test('המחיקה עדיין מותנית ב-saved', () => {
    /* אם מישהו "יתקן" את זה בהסרת התנאי, כל התנתקות תמחק גם כשהסנכרון נכשל.
       תנאים נוספים מותרים — התנאי הוחמר מאז ל-`saved && !syncPending.he && !syncPending.en`,
       כי flushRemoteSync דוחף שפה אחת בלבד ו-clear() מוחק את שתיהן. מה שנשמר כאן הוא
       ש-`saved` ממשיך לשמור על המחיקה, לא הצורה המדויקת של השורה. */
    assert.ok(/if\s*\(\s*saved\b[^)]*\)\s*localStorage\.clear\(\)/.test(signOut),
      'localStorage.clear רץ בלי תנאי');
  });

  test('והמחיקה מותנית גם בשפה השנייה', () => {
    /* הליבה של התיקון: flushRemoteSync מדווח על השפה הפעילה בלבד, ולכן "נשמר" של אנגלית
       אינו רישיון למחוק סבב עברית שלא הגיע לענן. */
    assert.ok(/localStorage\.clear/.test(signOut) &&
              /!\s*syncPending\.he\s*&&\s*!\s*syncPending\.en/.test(signOut),
      'המחיקה שוב מסתמכת על השפה הפעילה בלבד — עבודה בשפה השנייה תימחק');
  });

  test('ויש ענף שמסביר למה לא נמחק', () => {
    assert.ok(/else[\s\S]{0,140}console\.warn/.test(signOut),
      'המקרה שבו לא מוחקים עובר בשקט — אין דרך לדעת שזה קרה');
  });

  test('הסבב האחרון נשמר לפני הכול', () => {
    assert.ok(signOut.indexOf('commitSession()') < signOut.indexOf('localStorage.clear()'),
      'האחסון נמחק לפני שהסבב שבאוויר נשמר');
  });
});

describe('אזור מסוכן במצב הצצה', () => {

  test('שלושת הכפתורים מוסתרים', () => {
    const at = app.indexOf('function renderAccTab');
    assert.ok(at > 0, 'renderAccTab נעלמה');
    const body = app.slice(at, at + 1200);
    assert.ok(/if\s*\(\s*PREVIEW\s*\)/.test(body), 'אין הסתרה במצב הצצה');
    for (const id of ['accSignOut', 'accReset', 'accDelete'])
      assert.ok(new RegExp(id).test(body.slice(body.indexOf('if(PREVIEW)'))),
        id + ' נשאר גלוי למי שאין לו חשבון');
  });

  test('ההסתרה באה אחרי חלוקת הלשוניות, ולא לפניה', () => {
    /* לפניה, הלולאה של הלשוניות הייתה מחזירה אותם לגלויים. */
    const at = app.indexOf('function renderAccTab');
    const body = app.slice(at, at + 1200);
    assert.ok(body.indexOf('tab-off', body.indexOf('if(PREVIEW)')) > 0
              && body.indexOf('if(PREVIEW)') > body.indexOf('Object.entries(ACC_TABS)'),
      'ההסתרה רצה לפני חלוקת הלשוניות ותתבטל');
  });

  test('הרשימה שמסתירים היא בדיוק אזור המסוכן שברשימת ההגדרות', () => {
    /* אם ייווסף כפתור הרסני ל-ACC_TABS.settings ולא לרשימת ההסתרה, הוא ייחשף בהצצה. */
    const at = app.indexOf('const ACC_TABS');
    const tabs = app.slice(at, at + 500);
    for (const id of ['accSignOut', 'accReset', 'accDelete'])
      assert.ok(new RegExp(id).test(tabs), id + ' נעלם מ-ACC_TABS — הבדיקה כבר לא שומרת עליו');
  });
});
