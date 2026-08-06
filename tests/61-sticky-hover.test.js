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
const { ROOT, appSource } = require('./_harness/sandbox.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/* נוסף ב-6.8 עבור בדיקת הפוקוס בסוף הקובץ — היא בודקת את app.js ולא את הגיליון. */
const app = appSource();

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

  test('אף כלל :hover אינו נשאר בלי סייג', () => {
    /* ב-6.8 הורחב התיקון מהכלל שדווח לכל הגיליון: 36 כללים נוספים נעטפו. הדביקות
       אינה ייחודית לאפשרויות התשובה — היא תכונה של מסך מגע, וכל כלל :hover סובל ממנה.
       הבדיקה סופרת ולא מדגימה, כי כלל חדש שייכתב בלי סייג לא ייתפס בשום דרך אחרת. */
    /* ⚠ הניסוח הראשון של הבדיקה הזאת ספר `:hover{` וקיבל 74 במקום 37 — כי שאילתת
       המדיה **עצמה** מכילה `(hover:hover)` ונתפסה כאילו היא כלל. בדיקה שסופרת את
       הסייג כאילו הוא הבעיה אינה בדיקה. הסינון על @media הוא כל ההבדל. */
    const GUARD = '@media (hover:hover) and (pointer:fine){';
    const unguarded = [];
    let n = 0;
    for (const m of html.matchAll(/([^\n{]*:hover(?:[^\n{]*)?)\{/g)) {
      if (m[1].includes('@media')) continue;          // הסייג עצמו, לא כלל
      n++;
      if (!html.slice(0, m.index).trimEnd().endsWith(GUARD)) unguarded.push(m[1].trim());
    }
    assert.ok(n > 30, `נמצאו רק ${n} כללי :hover — הביטוי אינו תופס`);
    assert.strictEqual(unguarded.length, 0,
      `${unguarded.length} כללי :hover בלי סייג — יידבקו במסך מגע:\n  ${unguarded.slice(0, 8).join('\n  ')}`);
  });

  test('ההרמה וההדגשה לא הוסרו מהדסקטופ', () => {
    /* התיקון הוא סייג, לא מחיקה: עם עכבר המשוב הזה עדיין נכון ורצוי. */
    const at = html.indexOf('.lv-opts button:hover');
    const rule = html.slice(at, at + 120);
    assert.match(rule, /border-color:var\(--gold\)/, 'הדגשת המסגרת נמחקה במקום להיות מסויגת');
    assert.match(rule, /transform:translateY\(-1px\)/, 'ההרמה נמחקה במקום להיות מסויגת');
  });
});

describe('פוקוס מקלדת במבחן הרמה', () => {

  test('הפוקוס מוחזר אחרי רינדור — אבל רק לניווט מקלדת', () => {
    /* innerHTML הורס את הכפתורים, ולכן הפוקוס נופל ל-body בכל שאלה. נמדד בדפדפן:
       document.activeElement היה BODY אחרי כל רינדור, כלומר משתמש מקלדת מתחיל מ-Tab
       הראשון בכל שאלה מחדש.

       ההחזרה מותנית ב-lvKeyboardNav ולא גורפת: פוקוס אוטומטי אחרי לחיצת עכבר גורר
       הכרזה קולית של קורא מסך בכל שאלה, וטבעת פוקוס למי שלא ביקש. :focus-visible הוא
       ההכרעה של הדפדפן עצמו בין מקלדת לעכבר, ואין סיבה לנחש אותה מחדש. */
    const at = app.indexOf('function lvRender');
    const body = app.slice(at, app.indexOf('function lvPick'));
    assert.match(body, /if\(lvKeyboardNav && opts\.length\) opts\[0\]\.focus\(\)/,
      'הפוקוס אינו מוחזר — משתמש מקלדת מאבד את מקומו בכל שאלה');
    assert.match(body, /lvKeyboardNav=false/, 'הדגל אינו מתאפס — ההחזרה תימשך גם אחרי מעבר לעכבר');
    const pick = app.slice(app.indexOf('function lvPick'), app.indexOf('function lvPick') + 700);
    assert.match(pick, /matches\(':focus-visible'\)/,
      'ההבחנה בין מקלדת לעכבר אינה נשענת על :focus-visible');
  });
});
