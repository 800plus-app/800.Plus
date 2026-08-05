'use strict';
/* אפשרות שנשארת מסומנת אחרי בחירה — במבחן רמה ובמבחן היחידה.
 *
 * הדיווח (משתמשת, 5.8.2026)
 * --------------------------
 * "יש מילים מוקפות בריבוע מודגש יותר... ברגע שבחרתי תשובה אחת, בשאלה הבאה אותו ריבוע
 * של תשובה נשאר מסומן קצת."
 *
 * מה זה לא היה
 * -------------
 * לא שריד של מחלקה ולא פוקוס. lvRender כותב `$('#lvOpts').innerHTML=` מחדש (app.js),
 * כלומר הכפתורים נהרסים ונבנים; מחלקה כמו .right או .wrong אינה יכולה לשרוד, ופוקוס
 * על אלמנט שנמחק עובר ל-body. שתי ההשערות המתבקשות שגויות.
 *
 * מה זה כן
 * ---------
 * ה-:hover עצמו. במסך מגע הדפדפן משאיר hover על מה שנמצא מתחת לאצבע גם אחרי ההרפיה,
 * והכפתור החדש שנבנה באותו מקום בדיוק יורש אותו. הכלל היה
 *     .lv-opts button:hover{border-color:var(--gold);transform:translateY(-1px)}
 * כלומר מסגרת זהב והרמה — על אפשרות אחת בלבד, בדיוק "מסומן קצת".
 *
 * למה שתי התכונות ולא אחת
 * -------------------------
 * hover:hover לבדו מחזיר אמת במכשירים היברידיים (מסך מגע עם עכבר מחובר), ולכן הוא
 * אינו מספיק. pointer:fine יחד איתו מתאר מצביע מדויק בפועל.
 *
 * ו-#exOpts נושא את אותה מחלקה .lv-opts, ולכן מבחן היחידה נרפא מאותו תיקון.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('hover דביק במסך מגע', () => {

  test('כלל ה-hover של אפשרויות התשובה עטוף בשאילתת מדיה', () => {
    const at = html.indexOf('.lv-opts button:hover');
    assert.ok(at > 0, 'הכלל נעלם');
    /* מחפש אחורה את פתיחת ה-@media הקרובה ומוודא שהיא עוטפת את הכלל. */
    const before = html.slice(Math.max(0, at - 400), at);
    assert.match(before, /@media \(hover:hover\) and \(pointer:fine\)\{[^}]*$/,
      'הכלל אינו בתוך @media (hover:hover) and (pointer:fine) — הסימון יידבק אחרי נגיעה');
  });

  test('שתי התכונות נדרשות, לא רק hover', () => {
    /* hover:hover לבדו אמת גם במכשיר היברידי, ושם הבאג היה חוזר. */
    const at = html.indexOf('@media (hover:hover) and (pointer:fine)');
    assert.ok(at > 0, 'חסרה שאילתת המדיה המלאה');
  });

  test('מבחן היחידה נרפא מאותו תיקון', () => {
    /* #exOpts משתמש באותה מחלקה, ולכן אין צורך בכלל שני — אבל אם המחלקה תשתנה,
       הבדיקה הזאת תיפול ותזכיר שהמבחן נשאר מאחור. */
    assert.match(html, /class="lv-opts" id="exOpts"/,
      '#exOpts אינו נושא עוד את .lv-opts — התיקון אינו חל על מבחן היחידה');
  });

  test('ההרמה וההדגשה לא הוסרו מהדסקטופ', () => {
    /* התיקון הוא סייג, לא מחיקה: עם עכבר המשוב הזה עדיין נכון ורצוי. */
    const at = html.indexOf('.lv-opts button:hover');
    const rule = html.slice(at, at + 120);
    assert.match(rule, /border-color:var\(--gold\)/, 'הדגשת המסגרת נמחקה במקום להיות מסויגת');
    assert.match(rule, /transform:translateY\(-1px\)/, 'ההרמה נמחקה במקום להיות מסויגת');
  });
});
