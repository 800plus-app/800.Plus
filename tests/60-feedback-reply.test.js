'use strict';
/* מענה למדווח · הכפתור בלוח הבקרה.
 *
 * מה חגי ביקש (5.8.2026)
 * -----------------------
 * "תכין כפתור לשליחת ההודעה · שרק אני אעשה את זה, אחרי שאנחנו מתקנים את התקלות."
 *
 * שתי המילים האלה קובעות את כל התכנון: "רק אני", ו"אחרי שמתקנים".
 *
 * למה mailto ולא שליחה מהאפליקציה
 * ---------------------------------
 * מפתח Resend יושב בסודות של GitHub ולא בדפדפן. שליחה מהאפליקציה הייתה מחייבת להביא
 * אותו לקוד הלקוח, כלומר לחשוף אותו לכל מי שפותח את מקור העמוד · 3,945 שורות שכל
 * אחד יכול לקרוא. mailto גם הופך את "רק אני שולח" למילולי ולא להסדר אמון: ההודעה
 * נפתחת בתיבה של חגי, והוא לוחץ שלח. אותו דפוס שכבר קיים ב-#lockContact.
 *
 * למה רק על דיווח שסומן "טופל"
 * ------------------------------
 * הנוסח מבטיח "בדקתי, מצאתי ותיקנתי · והגרסה כבר עודכנה". על דיווח פתוח זו הבטחה
 * שקרית, וזה בדיוק הסוג שגורם לאדם להפסיק לדווח · כלומר הורס את מה שהמייל בא להשיג.
 * השער הזה הוא לב הבדיקה.
 *
 * ולמה "שלום," בלי שם
 * --------------------
 * לטבלת הדיווחים אין שדה שם, רק כתובת. גזירת שם פרטי מהכתובת הייתה מייצרת
 * "שלום paz123" · פנייה שנראית אוטומטית יותר מ"שלום," תקין (HEB §6).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const handler = () => {
  const at = app.indexOf("host.querySelectorAll('[data-reply]')");
  assert.ok(at > 0, 'ה-handler של כפתור המענה נעלם');
  return app.slice(at, at + 1400);
};

describe('מענה למדווח', () => {

  test('הכפתור מוצג רק על דיווח שסומן "טופל", ורק כשיש כתובת', () => {
    /* הניסוח הראשון של הבדיקה חיפש r.status==='done' בחלון של 220 תווים לפני הכפתור,
       ועבר גם כשהשער הוסר · כי אותה מחרוזת מופיעה בכפתור השכן
       (data-st="${r.status==='done'?'new':'done'}"). בדיקה שעוברת על קוד שבור היא
       גרועה מאין בדיקה, ולכן היא נעוצה עכשיו בתנאי המדויק ולא בשכונה שלו. */
    assert.ok(app.includes("r.status==='done' && r.email"),
      'השער על הכפתור אינו התנאי המדויק — הוא עלול להופיע על דיווח פתוח, ואז ההבטחה "תיקנתי" היא שקר');
    const at = app.indexOf('data-reply=');
    assert.ok(at > 0, 'הכפתור אינו קיים');
    const gateAt = app.indexOf("r.status==='done' && r.email");
    assert.ok(gateAt > 0 && gateAt < at && at - gateAt < 200,
      'התנאי אינו צמוד לכפתור — ייתכן שהוא שייך למשהו אחר');
  });

  test('נפתח mailto ולא נשלח מהאפליקציה', () => {
    const h = handler();
    assert.match(h, /location\.href='mailto:'/, 'אינו פותח mailto');
    assert.ok(!/RESEND|api\.resend\.com|Bearer/.test(app),
      'מפתח או קריאה ל-Resend הגיעו לקוד הלקוח — הוא ייחשף לכל מי שפותח את המקור');
  });

  test('הכתובת, הנושא והגוף מקודדים', () => {
    /* גוף בעברית עם שורות חדשות חייב encodeURIComponent, אחרת ה-mailto נקטע. */
    const h = handler();
    for (const part of ['encodeURIComponent(r.email)', 'encodeURIComponent(subject)', 'encodeURIComponent(body)'])
      assert.ok(h.includes(part), `${part} חסר — ה-mailto יישבר על תו מיוחד`);
  });

  test('הנוסח הוא זה שחגי אישר', () => {
    const h = handler();
    assert.match(h, /התקבל!/, 'שורת הפתיחה שונתה');
    assert.match(h, /בדקתי, מצאתי ותיקנתי/, 'משפט התיקון שונה');
    assert.match(h, /תמשיך לדווח ❤️/, 'שורת הסיום שונתה');
    assert.match(h, /'שלום,'/, 'הפנייה אינה "שלום," — או שהוכנס שם מומצא');
  });

  test('הנושא מצטט את מה שהמדווח עצמו כתב', () => {
    /* "באג" אינו אומר כלום שבועיים אחרי; ציטוט שלו מזוהה במבט. */
    const h = handler();
    assert.match(h, /const topic=String\(r\.body\|\|''\)/, 'הנושא אינו נגזר מגוף הדיווח');
    assert.match(h, /\.slice\(0,\s*50\)/, 'הציטוט אינו נחתך — נושא ארוך ישבור את השורה');
  });

  test('השם נשלף מ-profiles לפי הכתובת', () => {
    /* לטבלת הדיווחים אין שדה שם, ולכן הוא מגיע מ-profiles. */
    const at = app.indexOf('async function renderAdminFeedback');
    const body = app.slice(at, at + 1800);
    assert.match(body, /Store\.adminListUsers\(\)/, 'השמות אינם נטענים מ-profiles');
    assert.match(body, /fbNames\.set\(mail,\s*n\)/, 'לא נבנית מפת כתובת→שם');
    assert.match(handler(), /fbNames\.get\(String\(r\.email\|\|''\)\.trim\(\)\.toLowerCase\(\)\)/,
      'הפנייה אינה מחפשת את השם לפי הכתובת');
    assert.match(handler(), /name \? 'שלום '\+name\+',' : 'שלום,'/,
      'אין נפילה ל"שלום," כשאין שם');
  });

  test('firstNameOf · שם פרטי בלבד, ורק אם זה שם', () => {
    /* מורם ומורץ, ולא נבדק בעין: שני השערים כאן הם מה שמונע פנייה שנראית אוטומטית. */
    const at = app.indexOf('function firstNameOf');
    const src = app.slice(at, app.indexOf('async function renderAdminFeedback'));
    const fn = new Function('return ' + src.slice(src.indexOf('function firstNameOf')))();
    assert.strictEqual(fn('דני כהן'), 'דני', 'שם מלא — נלקח רק הפרטי (HEB §6)');
    assert.strictEqual(fn('Dana Levi'), 'Dana');
    assert.strictEqual(fn('  יעל  '), 'יעל', 'רווחים מסביב לא נוקו');
    /* הבאג המוכר: "השם שלי הפך למייל" (נספח FIXBUG). "שלום dana@example.com,"
       מכריז שהמייל אוטומטי, וזה גרוע מפנייה כללית. */
    assert.strictEqual(fn('dana@example.com'), '', 'כתובת מייל התקבלה כשם');
    assert.strictEqual(fn('123'), '', 'מחרוזת בלי אותיות התקבלה כשם');
    assert.strictEqual(fn('🙂'), '', 'אמוג׳י התקבל כשם');
    for (const v of ['', '   ', null, undefined])
      assert.strictEqual(fn(v), '', `ערך ריק (${JSON.stringify(v)}) לא הוחזר כריק`);
  });

  test('כישלון בטעינת השמות אינו שובר את הפאנל', () => {
    /* profiles עלולה להיות חסומה ב-RLS. הפנייה תהיה "שלום," וזו פנייה תקינה · אבל
       שגיאה לא מטופלת הייתה מונעת מרשימת הדיווחים כולה להיטען. */
    const at = app.indexOf('async function renderAdminFeedback');
    const body = app.slice(at, at + 1800);
    const tryAt = body.indexOf('try{');
    const usersAt = body.indexOf('Store.adminListUsers()');
    assert.ok(tryAt > 0 && tryAt < usersAt, 'טעינת השמות אינה עטופה ב-try');
    assert.match(body.slice(usersAt, usersAt + 400), /catch\(e\)\{\}/, 'אין catch');
  });

  test('אין מקף ארוך בנוסח', () => {
    /* HEB §3א. המקף היחיד המותר כאן הוא זה שבתוך "תיקנתי · והגרסה", שהוא… */
    const h = handler();
    const body = h.slice(h.indexOf('const body='), h.indexOf('location.href'));
    const dashes = (body.match(/—/g) || []).length;
    assert.ok(dashes <= 1, `יש ${dashes} מקפים ארוכים בנוסח — HEB §3א מתיר לכל היותר את זה שבמשפט התיקון`);
  });

  test('לכפתור יש עיצוב משלו, ולא של פעולה הרסנית', () => {
    assert.match(html, /\.adm-acts button\.adm-reply\{/, 'אין סגנון ל-.adm-reply');
    assert.match(html, /\.adm-acts button\.adm-reply\{[^}]*var\(--green\)/,
      'כפתור המענה אינו ירוק — הוא ייראה כמו פעולה מסוכנת');
  });
});
