'use strict';
/* הזמנה חד-פעמית לקבוצת הוואטסאפ.
 *
 * מה חגי ביקש (4.8.2026)
 * ----------------------
 * "תוסיף בכניסה הצעה להצטרפות קבוצת הוואטסאפ", ואז: "אני רוצה שזה יקפוץ לכל המשתמשים
 * פעם אחת בפתיחה... ברגע שהם לחצו איקס זה לא יופיע יותר כהודעה קופצת רק כאופציה למטה".
 *
 * שלוש דרישות שנגזרות מזה, וכל אחת נבדקת כאן:
 *   1. יש דיאלוג קופץ (#waAsk) שמתחיל מוסתר, ובו קישור הצטרפות אמיתי לקבוצה.
 *   2. הוא מוצג פעם אחת בלבד: hw_waOffered נכתב ברגע ההצגה, ולכן לא משנה איך סוגרים.
 *   3. הכרטיס הקבוע (#waCta) נשאר — "האופציה למטה" שאינה נעלמת עם הסגירה.
 *
 * ולמה הדגל שמור מהניקוי בהחלפת חשבון
 * ------------------------------------
 * הצטרפות לקבוצת וואטסאפ היא פעולת מכשיר, לא נתון של החשבון. wipeAccountKeys מוחק כל
 * מפתח hw_ פרט לרשימת חריגים; אם hw_waOffered לא בה, כל החלפת חשבון על אותו מכשיר
 * מקפיצה את ההזמנה מחדש — בדיוק כמו hw_instDismissed, שכבר ברשימה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const WA_LINK = 'https://chat.whatsapp.com/FxJIBhZ6AYu92bTk08Afgg';

describe('הזמנה לקבוצת הוואטסאפ', () => {

  test('הדיאלוג הקופץ קיים, מתחיל מוסתר, ומצביע לקבוצה', () => {
    const m = html.match(/<div class="ask[^"]*"[^>]*id="waAsk"[^>]*>/);
    assert.ok(m, 'אין #waAsk ב-index.html');
    assert.match(m[0], /\bhidden\b/, '#waAsk אינו מתחיל מוסתר — הוא יבזיק לפני שהקוד מחליט');
    const block = html.slice(html.indexOf('id="waAsk"'), html.indexOf('id="waAsk"') + 700);
    assert.ok(block.includes(WA_LINK), 'הקישור בדיאלוג אינו מצביע לקבוצת הוואטסאפ');
  });

  test('כפתור ההצטרפות הוא קישור <a> שפותח את הוואטסאפ, לא כפתור', () => {
    const a = html.match(/<a[^>]*id="waAskGo"[^>]*>/);
    assert.ok(a, '#waAskGo אינו קישור <a> — כפתור לא יפתח את אפליקציית הוואטסאפ');
    assert.match(a[0], /target="_blank"/, 'הקישור אינו נפתח בלשונית נפרדת');
    assert.match(a[0], /rel="noopener"/, 'קישור target=_blank בלי rel="noopener"');
  });

  test('יש כפתור סגירה (X) — חגי ביקש אותו במפורש', () => {
    assert.match(html, /id="waAskX"/, 'אין כפתור X לסגירת הדיאלוג');
  });

  test('renderWelcome מציע את הקבוצה — המסך שכל משתמש רואה בכל כניסה', () => {
    const at = app.indexOf('function renderWelcome');
    assert.ok(at > 0, 'renderWelcome נעלמה');
    const body = app.slice(at, at + 1500);
    assert.match(body, /maybeOfferWhatsapp\(\)/,
      'renderWelcome אינו קורא ל-maybeOfferWhatsapp — ההזמנה לא תגיע למי שכבר מחובר');
  });

  test('מוצג פעם אחת בלבד: הדגל נכתב ברגע ההצגה', () => {
    const at = app.indexOf('function maybeOfferWhatsapp');
    assert.ok(at > 0, 'maybeOfferWhatsapp נעלמה');
    const body = app.slice(at, at + 700);
    // יציאה מוקדמת אם כבר הוצע
    assert.match(body, /if\(LS\.get\('hw_waOffered',0\)\)\s*return/,
      'אין יציאה מוקדמת על hw_waOffered — ההזמנה תקפוץ שוב ושוב');
    // והדגל נכתב לפני ההצגה, כדי שכל דרך סגירה תספיק
    const setAt = body.indexOf("LS.set('hw_waOffered',1)");
    const showAt = body.indexOf("show($('#waAsk'))");
    assert.ok(setAt > 0 && showAt > 0 && setAt < showAt,
      'hw_waOffered אינו נכתב לפני ההצגה — סגירה ב-X עלולה לא לסגור אותו לתמיד');
  });

  test('הכרטיס הקבוע במסך (#waCta) נשאר — "האופציה למטה"', () => {
    assert.match(html, /id="waCta"/,
      'הכרטיס הקבוע נעלם — לפי חגי הוא צריך להישאר כאופציה גם אחרי סגירת הפופאפ');
  });

  test('hw_waOffered שמור מהניקוי בהחלפת חשבון', () => {
    const at = app.indexOf('function wipeAccountKeys');
    assert.ok(at > 0, 'wipeAccountKeys נעלמה');
    const body = app.slice(at, at + 400);
    assert.match(body, /k!=='hw_waOffered'/,
      'hw_waOffered אינו ברשימת החריגים — כל החלפת חשבון תקפיץ את ההזמנה מחדש');
  });
});
