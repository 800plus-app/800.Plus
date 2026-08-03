'use strict';
/* כפתור "אחורה" באנדרואיד סוגר את האפליקציה באמצע סבב.
 *
 * מה שנמצא
 * --------
 * לאפליקציה אין היסטוריית ניווט פנימית — אף קריאה ל-history.pushState. באנדרואיד, שבו
 * "אחורה" הוא כפתור מערכת, לחיצה עליו באמצע תרגול או מבחן מנווטת אחורה מהדף כולו, כלומר
 * סוגרת את ה-PWA. מי שטעה ולחץ מאבד את הסבב.
 *
 * התיקון
 * -------
 * goto — צוואר הבקבוק היחיד לכל מעבר מסך — דוחף רשומת היסטוריה אחת בכניסה ל-quiz או ל-exam.
 * מאזין popstate קולט את לחיצת ה"אחורה", שומר את הסבב (commitSession) ומחזיר למסך הבחירה
 * במקום לצאת. דוחפים רשומה אחת בלבד (שמורה בדגל hwDeep), ולכן אין תור היסטוריה להיתקע בו.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();

describe('כפתור אחורה — היסטוריה פנימית לסבב ולמבחן', () => {

  test('goto דוחף רשומת היסטוריה בכניסה למסך עמוק', () => {
    const at = app.indexOf('function goto');
    const body = app.slice(at, at + 900);
    assert.ok(/pushState/.test(body),
      'goto אינו דוחף היסטוריה — אין מה לכפתור אחורה לקלוט, והוא סוגר את האפליקציה');
    assert.ok(/hwDeep/.test(body),
      'הדגל hwDeep חסר — בלעדיו לא ניתן למנוע דחיפה כפולה ולבנות תור שהמשתמש נתקע בו');
  });

  test('הדחיפה מותנית — רשומה אחת בלבד, לא תור', () => {
    const at = app.indexOf('function goto');
    const body = app.slice(at, at + 900);
    assert.ok(/!\s*\(\s*history\.state[\s\S]{0,40}hwDeep/.test(body),
      'goto דוחף בלי לבדוק שכבר קיימת רשומה — כל מעבר מסך מוסיף עוד אחת');
  });

  test('קיים מאזין popstate', () => {
    assert.ok(/addEventListener\(\s*['"]popstate['"]/.test(app),
      'אין מאזין popstate — כפתור אחורה לא נקלט');
  });

  test('המאזין שומר את הסבב ומחזיר למסך הבחירה', () => {
    const at = app.search(/addEventListener\(\s*['"]popstate['"]/);
    const body = app.slice(at, at + 600);
    assert.ok(/commitSession\(\)/.test(body),
      'popstate אינו שומר את הסבב — לחיצת אחורה באמצע תרגול מאבדת אותו');
    assert.ok(/openScope/.test(body),
      'popstate אינו מחזיר למסך הבחירה');
  });
});
