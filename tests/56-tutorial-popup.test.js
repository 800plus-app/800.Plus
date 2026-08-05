'use strict';
/* פופאפ סרטון ההדרכה.
 *
 * מה חגי ביקש (5.8.2026, חשוב לא דחוף 5)
 * ---------------------------------------
 * "להנגיש את סרטון השימוש בכניסה כמו הודעת הוואטסאפ — שזה יקפוץ לכולם, ואז יהיה אפשר
 * ללחוץ 'אל תראה לי את זה יותר'."
 *
 * אותה מכניקה של הזמנת הוואטסאפ, ובכוונה: המשתמש כבר למד מה עושה חלון כזה, וחזרה על
 * דפוס קיים עדיפה על המצאת דפוס שני לאותו תפקיד.
 *
 * הערך היחיד שחסר — וזה למה הפופאפ עדיין לא מוצג
 * -----------------------------------------------
 * TUTORIAL_URL ריק. סרטון ההדרכה הקיים יושב ב-שיווק/סרטונים/ אבל ‎.gitignore חוסם mp4
 * בתיקיית השיווק, ולכן אין לו כתובת חיה. פופאפ שמפנה לקישור שבור גרוע מאין פופאפ,
 * ולכן השער הזה קיים ונבדק כאן במפורש: כל עוד המחרוזת ריקה, אין הזמנה.
 * ברגע שתהיה כתובת — שינוי של ערך אחד מפעיל את הכול.
 *
 * ולמה "אל תראה לי את זה יותר" הוא בדיקה ולא ניסוח
 * -------------------------------------------------
 * זו הבטחה מפורשת שנכתבת על כפתור. hw_vidOffered נכתב ברגע ההצגה ולא ברגע הסגירה, כך
 * שההבטחה מתקיימת בכל מסלול יציאה — X, הכפתור, לחיצה מחוץ לתיבה או Escape.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const fn = () => {
  const at = app.indexOf('function maybeOfferTutorial');
  assert.ok(at > 0, 'maybeOfferTutorial נעלמה');
  return app.slice(at, at + 800);
};

describe('פופאפ סרטון ההדרכה', () => {

  test('הדיאלוג קיים ומתחיל מוסתר', () => {
    const m = html.match(/<div class="ask[^"]*"[^>]*id="vidAsk"[^>]*>/);
    assert.ok(m, 'אין #vidAsk ב-index.html');
    assert.match(m[0], /\bhidden\b/, '#vidAsk אינו מתחיל מוסתר');
  });

  test('הכפתור אומר בדיוק את מה שחגי ביקש', () => {
    const at = html.indexOf('id="vidAskNo"');
    assert.ok(at > 0, 'אין כפתור סגירה');
    assert.match(html.slice(at, at + 120), /אל תראה לי את זה יותר/,
      'הכפתור אינו נושא את הנוסח שחגי ביקש');
  });

  test('בלי כתובת אין הזמנה', () => {
    /* השער שמונע פופאפ שמפנה לשום מקום. */
    assert.match(app, /const TUTORIAL_URL\s*=\s*''/, 'TUTORIAL_URL אינו מוגדר כריק כברירת מחדל');
    assert.match(fn(), /if\(!TUTORIAL_URL\)\s*return/,
      'הפופאפ אינו נחסם כשאין כתובת — הוא יפנה לקישור שבור');
  });

  test('הכתובת מוזרקת לקישור לפני ההצגה', () => {
    const body = fn();
    const setAt = body.indexOf('a.href=TUTORIAL_URL');
    const showAt = body.indexOf("show($('#vidAsk'))");
    assert.ok(setAt > 0, 'הכתובת אינה מוזרקת ל-#vidAskGo');
    assert.ok(setAt < showAt, 'הכתובת מוזרקת אחרי ההצגה — הקישור יהיה ריק לרגע');
  });

  test('מוצג פעם אחת: הדגל נכתב לפני ההצגה', () => {
    const body = fn();
    assert.match(body, /if\(LS\.get\('hw_vidOffered',0\)\)\s*return/, 'אין יציאה מוקדמת על הדגל');
    const setAt = body.indexOf("LS.set('hw_vidOffered',1)");
    const showAt = body.indexOf("show($('#vidAsk'))");
    assert.ok(setAt > 0 && setAt < showAt,
      'הדגל אינו נכתב לפני ההצגה — "אל תראה לי את זה יותר" עלול לא להתקיים');
  });

  test('לא נערם על דיאלוג אחר שכבר פתוח', () => {
    /* הזמנת הוואטסאפ יורה ב-900ms וזו ב-1500ms; בלי הבדיקה הזאת שני חלונות היו
       נפתחים זה על גבי זה בכניסה הראשונה. */
    assert.match(fn(), /document\.querySelector\('\.ask:not\(\.hidden\)'\)/,
      'הפופאפ אינו בודק אם דיאלוג אחר כבר פתוח');
  });

  test('renderWelcome מפעיל אותו', () => {
    const at = app.indexOf('function renderWelcome');
    assert.match(app.slice(at, at + 1500), /maybeOfferTutorial\(\)/,
      'renderWelcome אינו קורא ל-maybeOfferTutorial');
  });

  test('הדגל שמור מהניקוי בהחלפת חשבון', () => {
    const at = app.indexOf('function wipeAccountKeys');
    assert.match(app.slice(at, at + 400), /k!=='hw_vidOffered'/,
      'hw_vidOffered אינו ברשימת החריגים — הסרטון יקפוץ מחדש בכל החלפת חשבון');
  });

  test('כל מסלולי הסגירה מחוברים', () => {
    for (const id of ['vidAskNo', 'vidAskX', 'vidAskGo'])
      assert.ok(app.includes(`$('#${id}').onclick`), `אין handler ל-#${id}`);
    assert.match(app, /\$\('#vidAsk'\)\.onclick=e=>/, 'לחיצה מחוץ לתיבה אינה סוגרת');
  });
});
