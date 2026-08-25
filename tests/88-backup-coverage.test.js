'use strict';
/* כל טבלה שהאפליקציה כותבת אליה — מגובה.
 *
 * ⛔ הפגם שזה נועד למנוע, ונמצא ב-24.8.2026 כשחגי שאל איך לראות את הסקר:
 * backup.yml מחזיק **רשימה קשיחה** של טבלאות. `wtp_survey` ו-`push_sub` היו
 * ב-store.js מהיום שנכתבו ומעולם לא גובו. אף אחד לא הבחין, ושתי שכבות ההגנה
 * החמיצו את זה מאותה סיבה:
 *
 *   · backup.yml מדלג בשקט על 404, ולכן טבלה שאינה ברשימה אינה שגיאה · היא
 *     פשוט לא קיימת מבחינתו.
 *   · תרגיל השחזור השבועי בודק את **הקבצים שהגיבוי הפיק**. טבלה שלא נלקחה
 *     אין לה קובץ, ולכן אין מה שייכשל. הוא דיווח "הגיבוי ניתן לשחזור" בזמן
 *     שהסקר לא היה בו כלל.
 *
 * ⭐ שתיהן בודקות "האם מה שנלקח תקין", ואף אחת לא בודקת "האם נלקח הכול".
 * זו הבדיקה החסרה, והיא רצה בחבילה של הריפו הראשי · כאן חיה רשימת הטבלאות.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

describe('גיבוי · כל טבלה שנכתבת אליה מגובה', () => {

  test('אין טבלה ב-store.js שחסרה ברשימת הגיבוי', () => {
    const store = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
    const used = [...new Set([...store.matchAll(/from\('([a-z_]+)'\)/g)].map(m => m[1]))].sort();
    assert.ok(used.length >= 5, 'לא נמצאו טבלאות ב-store.js · הביטוי אינו תופס');

    /* ⚠ הרשימה כאן היא **עותק** של זו ב-backup.yml, שחי בריפו אחר (פרטי) ולכן
       אינו נגיש לבדיקה. עותק שני הוא בדיוק סוג הכפילות שנשברת · ולכן ההערה
       הזאת קיימת: מי שמוסיף טבלה מעדכן **שניים**, וזה נכתב במפורש גם שם. */
    const backedUp = ['assoc_shared', 'feedback', 'profiles', 'progress',
                      'push_sub', 'subscription', 'wtp_survey'];

    const missing = used.filter(t => !backedUp.includes(t));
    assert.deepStrictEqual(missing, [],
      'טבלאות שהאפליקציה כותבת אליהן ואינן ברשימת הגיבוי: ' + missing.join(', ') +
      ' · להוסיף ל-backup.yml ב-Hagay-BOT/800plus-backups **ולרשימה כאן**');
  });

  test('הרשימה כאן אינה מכילה טבלה שאינה בשימוש', () => {
    /* הכיוון ההפוך · רשימה שמתנפחת עם טבלאות מתות מסתירה את הפער האמיתי. */
    const store = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
    const used = new Set([...store.matchAll(/from\('([a-z_]+)'\)/g)].map(m => m[1]));
    const backedUp = ['assoc_shared', 'feedback', 'profiles', 'progress',
                      'push_sub', 'subscription', 'wtp_survey'];
    const stale = backedUp.filter(t => !used.has(t) && t !== 'subscription');
    assert.deepStrictEqual(stale, [],
      'טבלאות ברשימת הגיבוי שאינן בשימוש: ' + stale.join(', '));
  });
});
