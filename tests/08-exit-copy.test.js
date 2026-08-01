'use strict';
/* שני מסכי היציאה — הנוסח מול מה שקורה בפועל.
 *
 * ✕ יציאה יושב ב-topbar של #level ושל #exam, מחוץ ל-#lvQuiz / #exQuiz. הוא לא נעלם כשהמבחן
 * נגמר: הוא על המסך גם כשהלומד עומד על מסך התוצאות — ושם התוצאה כבר נשמרה. lvFinish()
 * עושה LS.set(lvKey(), …) + queueRemoteSync(); exFinish() מוסיף ל-exKey(exUnit) וקורא
 * queueRemoteSync(). המשפט "התוצאה לא תישמר" היה שקר בדיוק במסך הזה.
 *
 * שני הבדיקות למטה מחזיקות את שני חצאי הטענה: שהכפתור באמת נגיש ממסך התוצאות (אחרת אין
 * בעיה), ושהנוסח לא מבטיח משהו שכבר נשבר.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractHandler } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');
const { appSource, ROOT } = require('./_harness/sandbox.js');

/* מה שהופך את המשפט לשקר: הכפתור לא בתוך תת-המסך של השאלות. אם מישהו יזיז אותו לתוך
   #lvQuiz / #exQuiz — הבעיה נעלמת, והבדיקה הזאת היא שתגיד את זה. */
const PAIRS = [
  { btn: 'lvExit', quiz: 'lvQuiz', result: 'lvResult' },
  { btn: 'exExit', quiz: 'exQuiz', result: 'exResult' },
];

/* כל נוסח שמבטיח ללומד שהתוצאה לא נשמרת. */
const CLAIMS_NOT_SAVED = /לא\s+(?:תישמר|יישמרו|נשמר|נשמרת|ישמרו)/;

describe('מסכי היציאה — הנוסח חייב להיות נכון גם ממסך התוצאות', () => {

  test('שני כפתורי היציאה יושבים ב-topbar, ולכן נגישים ממסך התוצאות', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const { btn, quiz, result } of PAIRS) {
      const b = html.indexOf('id="' + btn + '"');
      const q = html.indexOf('id="' + quiz + '"');
      const r = html.indexOf('id="' + result + '"');
      assert.ok(b > 0 && q > 0 && r > 0, `#${btn} / #${quiz} / #${result} לא נמצאו ב-index.html`);
      assert.ok(b < q && b < r,
        `#${btn} כבר לא ב-topbar מעל #${quiz} ו-#${result} — אם הוא נכנס לתוך מסך השאלות, ` +
        'עדכנו את הבדיקה הזאת ואת הנוסח יחד איתה');
    }
  });

  test('אף אחד משני המסכים לא מבטיח שהתוצאה לא תישמר', () => {
    const src = appSource();
    const mask = codeMask(src);
    for (const { btn } of PAIRS) {
      const code = extractHandler(src, btn, mask);
      assert.ok(/confirm\s*\(/.test(code), `#${btn} כבר לא שואל לפני יציאה`);
      assert.ok(!CLAIMS_NOT_SAVED.test(code),
        `#${btn} עדיין אומר ללומד שהתוצאה לא תישמר. ממסך התוצאות היא כבר נכתבה ל-localStorage ` +
        'ונדחפה לענן, ולכן זה לא נכון.');
    }
  });

  test('הנוסח החדש אומר את הכלל, ולכן נכון גם באמצע המבחן וגם בסוף', () => {
    // ההגנה מפני "תיקון" שרק הופך את השקר לשקר הפוך: משפט שמבטיח שהתוצאה כן נשמרה
    // יהיה שקרי באמצע המבחן, בדיוק כמו שהקודם היה שקרי בסופו.
    const src = appSource();
    const mask = codeMask(src);
    for (const { btn } of PAIRS) {
      const code = extractHandler(src, btn, mask);
      assert.ok(/מבחן שהושלם/.test(code),
        `#${btn} כבר לא מסביר מה נשמר. הנוסח צריך לומר את הכלל ("רק מבחן שהושלם נשמר"), ` +
        'כי אותו משפט נקרא משלושה מצבים שונים — לפני, באמצע ואחרי.');
      assert.ok(!/התוצאה נשמרה|נשמרה בהצלחה/.test(code),
        `#${btn} מבטיח שהתוצאה נשמרה — באמצע המבחן זה לא נכון`);
    }
  });
});
