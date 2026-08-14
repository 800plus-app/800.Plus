'use strict';
/* פס ההתקדמות והמונה של המבחן שורדים מבחן שננטש.
 *
 * מה שנמצא
 * --------
 * ב-index.html פס ההתקדמות (#exBar) והמונה (#exCount) יושבים ב-topbar של #exam, מחוץ
 * ל-#exQuiz. כלומר הם גלויים גם במסך הפתיחה (#exIntro) וגם במסך התוצאה. exRender מעדכן
 * אותם, אבל רק אחרי שהמבחן התחיל.
 *
 * openExam מציג את מסך הפתיחה בלי לאפס אותם. מי שהתחיל מבחן, ענה על כמה שאלות, ויצא · 
 * חוזר למסך הפתיחה ורואה פס חצי-מלא ומונה "7 / 20" של המבחן הקודם, לפני שלחץ "מתחילים".
 * הערך מטעה: הוא מתאר ריצה שכבר נזרקה.
 *
 * התיקון במקום הנכון
 * -------------------
 * לא ב-exExit בלבד · יש כמה דרכים לנטוש (✕, "חזרה", מעבר מסך). openExam הוא המקום היחיד
 * שכל הדרכים חוזרות אליו, ולכן האיפוס שם מכסה את כולן.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();
const at = app.indexOf('function openExam');
const body = app.slice(at, at + 1200);

describe('מבחן שננטש · הפס והמונה מתאפסים במסך הפתיחה', () => {

  test('openExam קיימת', () => {
    assert.ok(at > 0, 'openExam נעלמה');
  });

  test('openExam מאפס את #exBar', () => {
    assert.ok(/exBar[\s\S]{0,60}(width\s*=\s*['"`]0|width\s*=\s*['"`]0%)/.test(body)
              || /#exBar['"]\)\.style\.width\s*=\s*['"`]0/.test(body),
      'openExam אינו מאפס את #exBar — פס ההתקדמות של מבחן קודם נשאר גלוי במסך הפתיחה');
  });

  test('openExam מאפס את #exCount', () => {
    assert.ok(/exCount['"]\)\.textContent\s*=\s*['"`]\s*['"`]/.test(body),
      'openExam אינו מאפס את #exCount — מונה "7 / 20" של מבחן קודם נשאר גלוי במסך הפתיחה');
  });

  test('האיפוס קורה לפני שמסך הפתיחה מוצג', () => {
    /* אחרי show(exIntro) האיפוס עדיין נכון, אבל לפניו הוא מונע הבזוק של הערך הישן. */
    const resetAt = body.search(/exBar/);
    const introAt = body.indexOf("show($('#exIntro'))");
    assert.ok(resetAt > 0 && introAt > 0 && resetAt < introAt,
      'האיפוס בא אחרי הצגת מסך הפתיחה — הערך הישן מהבהב לרגע');
  });
});
