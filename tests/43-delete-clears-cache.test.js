'use strict';
/* מחיקת חשבון חייבת לנקות גם את מטמון הנתונים hw-data.
 *
 * מה שנמצא
 * --------
 * מסלול מחיקת החשבון (#delGo) מוחק את החשבון בשרת, קורא ל-Store.signOut ול-localStorage.clear.
 * אבל טקסט התזכורת האישי נכתב ל-Cache Storage תחת השם 'hw-data' — לא ל-localStorage — והמחיקה
 * לא נוגעת בו.
 *
 * שני מסלולים אחרים באפליקציה (איפוס, יציאה) כן מנקים את hw-data. מחיקת החשבון, שאמורה למחוק
 * הכי הרבה, מנקה הכי מעט. משתמש שמחק את חשבונו וסמך על "לא נשאר אצלנו שום מידע עליך" עדיין
 * מחזיק את המספרים האישיים שלו במטמון, ומקבל מהם התראה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();
const at = app.indexOf("$('#delGo').onclick");
const body = app.slice(at, at + 1400);

describe('מחיקת חשבון — hw-data נמחק גם הוא', () => {

  test('מסלול המחיקה קיים', () => {
    assert.ok(at > 0, "המאזין של #delGo נעלם");
  });

  test('המסלול מוחק את מטמון hw-data', () => {
    assert.ok(/caches\.delete\(\s*['"]hw-data['"]\s*\)/.test(body),
      "מחיקת החשבון אינה מנקה את hw-data — טקסט התזכורת האישי שורד את המחיקה");
  });

  test('הניקוי בא אחרי מחיקת החשבון בשרת', () => {
    /* מנקים מקומית רק אחרי ש-deleteMyAccount החזירה הצלחה — לא לפני. */
    const srvAt = body.indexOf('deleteMyAccount');
    const cacheAt = body.search(/caches\.delete\(\s*['"]hw-data/);
    assert.ok(srvAt >= 0 && cacheAt > srvAt,
      'ניקוי המטמון קורה לפני שהמחיקה בשרת הצליחה');
  });
});
