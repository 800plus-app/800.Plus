'use strict';
/* כל טקסט שמגיע מבחוץ ונכנס ל-innerHTML — חייב לעבור אסקייפ.
 *
 * מה נבדק בדפדפן חי ב-11.8.2026 (בדק בית 3 · ד1)
 * -----------------------------------------------
 * שתי השכבות נבדקו **אמפירית**, לא בקריאה:
 *
 *   שכבה 1 · esc — הוזנו שלוש מילים מותאמות עם מטען חי דרך `added`, ורונדרו
 *   דרך openManage() של האפליקציה עצמה. התוצאה: 0 תגי img, 0 svg, 0 script,
 *   0 מאפייני on*, וה-HTML הגולמי הראה `&lt;img src=x onerror=&quot;…&quot;&gt;`.
 *
 *   שכבה 2 · CSP — הוזרקו שמונה וקטורים ל-DOM חי. אף אחד לא רץ, והדפדפן רשם
 *   חסימות: script-src-attr (inline), base-uri, connect-src, img-src.
 *
 * למה הקובץ הזה קיים בכל זאת
 * ---------------------------
 * "תקין ב-11.8" אינו הבטחה. ב-app.js יש 62 אתרי innerHTML ו-175 הזרקות, וכל
 * שדה חדש בתבנית הוא הזדמנות לשכוח esc אחד. דוח 07 של בדק בית 2 קרא ל-53
 * אתרי ההזרקה בעיניים והגדיר את עצמו "הטענה הכי גדולה בדוח והכי פחות נבדקה" —
 * קריאה בעיניים אינה מתמשכת. זו הבדיקה שכן.
 *
 * ⚠ CSP אינו תחליף. הוא נבדק וחוסם, אבל הוא **שכבה שנייה**: הוא חי ב-<meta>
 * שאפשר לשנות בשורה אחת, וגם כשהוא עומד, הזרקת HTML בלי הרצת סקריפט עדיין
 * מעוותת מסך. הכלל כאן הוא על שכבה 1. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource, expectNone } = require('./_harness/sandbox.js');
const { htmlSinks, unescapedOutputs } = require('./_harness/htmlsinks.js');

const src = appSource();
const SINKS = htmlSinks(src);

/* שדות שהתוכן שלהם נכתב בידי מישהו שאינו הקוד הזה:
   term/meaning — מילה שהמשתמש הוסיף בעצמו.
   email/username — profiles ב-Supabase.
   body/kind — שורת דיווח שמשתמש הקליד.
   admView.q — תיבת החיפוש בפאנל הניהול. */
const EXTERNAL = ['.term', '.meaning', '.email', '.username', '.body', '.kind', 'admView.q'];

/* פונקציות שמותר לעטוף בהן במקום esc, כי הן עושות אסקייפ בעצמן על כל מסלול
   יציאה. כל שם כאן חייב בדיקה נלווית שמקבעת את זה — ראו למטה.
   ⚠ maskTerm **אינה** כאן, אף שהיא מקבלת meaning גולמי ומחזירה אותו כמות שהוא.
   היא לא צריכה להיות: הפלט שלה נכתב ל-textContent (app.js:3483) ולא ל-innerHTML,
   ולכן אינו נכנס לסורק הזה מלכתחילה. אם מישהו יזיז אותה ל-innerHTML, הכלל
   למטה יאדים — וזאת בדיוק ההתראה הנכונה. */
const ESCAPERS = /(^|[^\w$])(esc|sEsc|senseChips)$/;

describe('innerHTML — שדות חיצוניים עוברים אסקייפ', () => {
  test('הסורק באמת מוצא את אתרי ההזרקה', () => {
    /* בלי זה, כלל שלא מוצא כלום עובר בירוק וטוען שהכול נקי — בדיוק דפוס
       "השער שדיווח עבר בלי לבדוק" שכבר קרה בפרויקט הזה שלוש פעמים. */
    assert.ok(SINKS.length > 120,
      `רק ${SINKS.length} הזרקות נמצאו — הסורק נשבר, לא הקוד`);
    assert.ok(SINKS.some(s => /esc\(/.test(s.expr)),
      'לא נמצאה אף הזרקה עם esc — הסורק לא קורא את התבניות');
  });

  for (const field of EXTERNAL) {
    test(`${field} — כל מופע בתוך innerHTML עטוף באסקייפר`, () => {
      const bad = SINKS
        .filter(s => unescapedOutputs(s.expr, field, ESCAPERS).length)
        .map(s => `app.js:${s.line}  ${s.expr.slice(0, 100)}`);
      expectNone(assert, bad,
        `${field} נכנס ל-innerHTML בלי esc() — טקסט שנכתב מחוץ לקוד הזה הופך ל-HTML`);
    });
  }

  test('העוטפים החלופיים באמת עושים אסקייפ', () => {
    /* senseChips מותרת ברשימה למעלה. אם היא תפסיק לעשות אסקייפ, הכלל למעלה
       יאשר בשקט את מה שהיא מזריקה — ולכן היא נבדקת בעצמה. */
    for (const name of ['senseChips']) {
      const at = src.indexOf(`function ${name}(`);
      assert.ok(at > 0, `${name} לא נמצאה ב-app.js — עדכן את ESCAPERS`);
      const body = src.slice(at, src.indexOf('\n}', at));
      const returns = body.split(/\breturn\b/).slice(1);
      assert.ok(returns.length > 0, `${name} בלי return`);
      returns.forEach((r, i) => {
        const head = r.slice(0, 200);
        assert.ok(/esc\(/.test(head) || /^\s*(''|""|`` |null|\[)/.test(head),
          `${name}: מסלול יציאה ${i + 1} מחזיר ערך בלי esc() — ${head.slice(0, 80).trim()}`);
      });
    }
  });
});

describe('CSP — מה שנבדק בדפדפן, מקובע כאן', () => {
  const fs = require('fs');
  const path = require('path');
  const { ROOT } = require('./_harness/sandbox.js');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';

  test('ה-CSP קיים ונטען לפני כל סקריפט', () => {
    assert.ok(csp, 'אין CSP ב-index.html');
    const cspAt = html.indexOf('Content-Security-Policy');
    const firstScript = html.indexOf('<script');
    assert.ok(firstScript < 0 || cspAt < firstScript,
      'ה-CSP מופיע אחרי סקריפט — meta-CSP אינו חל למפרע על מה שכבר נטען');
  });

  test('script-src בלי unsafe-inline ובלי unsafe-eval', () => {
    /* זה מה שחסם בפועל את שמונת הווקטורים ב-11.8. הרפיה כאן מבטלת את
       השכבה השנייה כולה, ולכן היא צריכה להיות שינוי מודע. */
    const m = /script-src ([^;]+)/.exec(csp);
    assert.ok(m, 'אין script-src');
    assert.ok(!/unsafe-inline/.test(m[1]), "script-src קיבל 'unsafe-inline'");
    assert.ok(!/unsafe-eval/.test(m[1]), "script-src קיבל 'unsafe-eval'");
  });

  test('ההנחיות שנמדדו חוסמות — קיימות', () => {
    for (const d of ['default-src', 'base-uri', 'form-action', 'connect-src', 'img-src'])
      assert.ok(csp.includes(d), `${d} נעלם מה-CSP — נמדד ב-11.8 שהוא חוסם בפועל`);
    assert.match(csp, /base-uri 'none'/, "base-uri 'none' — חסם <base href=evil> בבדיקה");
    assert.match(csp, /default-src 'none'/, "default-src 'none' — מה שסוגר frame-src ו-object-src");
  });

  test('connect-src מגביל לעצמנו ול-Supabase בלבד', () => {
    const m = /connect-src ([^;]+)/.exec(csp);
    assert.ok(m, 'אין connect-src');
    const hosts = m[1].trim().split(/\s+/).filter(h => h !== "'self'");
    expectNone(assert, hosts.filter(h => !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(h)),
      'connect-src נפתח ליעד שאינו Supabase — זה ערוץ ההוצאה של מידע');
  });
});
