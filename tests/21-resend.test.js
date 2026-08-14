'use strict';
/* "לא קיבלתי את המייל" · הדרך החוצה מהמסך שאין ממנו יציאה.
 *
 * למה הקובץ הזה קיים
 * -------------------
 * שני משתמשים אמיתיים נתקעו כאן, ובשני המקרים המערכת עבדה כשורה. הלוג של ספק המייל הראה
 * Delivered על שני מיילים לאותה כתובת ב-Gmail · הם פשוט נחתו בספאם ולא נראו. אחר כך, כשאותו
 * אדם ניסה להירשם שוב, Supabase לא שלח דבר: החשבון כבר קיים, וההתנהגות המכוונת היא להחזיר
 * הצלחה בלי לשלוח, כדי שאי אפשר יהיה לגלות אילו כתובות רשומות. מבחינת האדם: "ניסיתי פעמיים,
 * שום מייל." מבחינת המערכת: הכול תקין. מסך ללא מוצא.
 *
 * הכפתור הזה הוא המוצא. resend() הוא הקריאה היחידה שבאמת שולחת מייל מחדש לחשבון קיים שטרם
 * אושר · signUp חוזר לא עושה את זה.
 *
 * מה נבדק כאן
 * ------------
 * store.js אמיתי מול Supabase מזויף; index.html ו-app.js נקראים כטקסט, כי החיווט של כפתור
 * הוא בדיוק מה שנשבר בשקט · onclick שלא הוצמד לא זורק שום דבר, הוא פשוט לא קורה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadStore, pgError } = require('./_harness/fakeSupabase.js');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = appSource();

/* ========================================================== store.js ===================== */
describe('store · שליחה חוזרת של מייל האישור', () => {

  test('Store.resendConfirmation קיים', () => {
    const { Store } = loadStore();
    assert.strictEqual(typeof Store.resendConfirmation, 'function',
      'app.js קורא ל-Store.resendConfirmation; בלעדיו זו TypeError בדפדפן ותו לא');
  });

  test('הוא קורא ל-auth.resend עם type "signup" · לא signUp מחדש', async () => {
    const { Store, fake } = loadStore();
    await Store.resendConfirmation('a@b.com');
    const call = fake.authCalls.find(c => c.m === 'resend');
    assert.ok(call, 'לא נקרא auth.resend בכלל');
    assert.strictEqual(call.args.type, 'signup',
      'type אחר שולח מייל אחר לגמרי — magiclink או recovery, לא אישור הרשמה');
    assert.strictEqual(call.args.email, 'a@b.com');
    assert.ok(!fake.authCalls.some(c => c.m === 'signUp'),
      'signUp חוזר על חשבון קיים מחזיר הצלחה ולא שולח כלום — זה בדיוק המלכוד שהכפתור בא לפתור');
  });

  test('הכתובת מנוקה מרווחים לפני השליחה', async () => {
    const { Store, fake } = loadStore();
    await Store.resendConfirmation('  a@b.com  ');
    assert.strictEqual(fake.authCalls.find(c => c.m === 'resend').args.email, 'a@b.com');
  });

  test('כתובת ריקה לא יוצאת לרשת בכלל', async () => {
    const { Store, fake } = loadStore();
    const r = await Store.resendConfirmation('   ');
    assert.strictEqual(r.ok, false);
    assert.ok(!fake.authCalls.some(c => c.m === 'resend'),
      'קריאה בלי כתובת שורפת מהמכסה של Supabase ומחזירה שגיאה — עדיף לא לצאת');
  });

  test('הצלחה מוחזרת כ-ok:true', async () => {
    const { Store } = loadStore();
    assert.deepStrictEqual((await Store.resendConfirmation('a@b.com')).ok, true);
  });

  test('שגיאה מוחזרת כערך, לא נזרקת', async () => {
    const err = pgError('429', 'For security purposes, you can only request this after 51 seconds');
    const { Store } = loadStore({ resend: { data: null, error: err } });
    const r = await Store.resendConfirmation('a@b.com');
    assert.strictEqual(r.ok, false, 'שגיאה שנבלעת מציגה ללומד "נשלח" כשלא נשלח כלום');
    assert.ok(r.error, 'הקריאה חייבת להחזיר את השגיאה כדי שהמסך יוכל לתרגם אותה');
  });

  test('נפילת רשת לא מפילה את המסך', async () => {
    const { Store } = loadStore({ resend: () => { throw new Error('Failed to fetch'); } });
    const r = await Store.resendConfirmation('a@b.com');
    assert.strictEqual(r.ok, false, 'חריגה שלא נתפסת משאירה את הכפתור מושבת לנצח');
  });
});

/* ========================================================== index.html =================== */
describe('index.html · הכפתור נמצא, ובמקום הנכון', () => {

  const idx = id => html.indexOf('id="' + id + '"');

  test('#mailAskResend קיים', () => {
    assert.ok(idx('mailAskResend') > 0, 'אין כפתור שליחה חוזרת ב-index.html');
  });

  test('הוא יושב בתוך #mailAsk · המסך שבו האדם תקוע', () => {
    const start = idx('mailAsk');
    const end = html.indexOf('id="sizeAsk"');
    const btn = idx('mailAskResend');
    assert.ok(start > 0 && end > start, 'מבנה index.html השתנה — לא מצאתי את גבולות #mailAsk');
    assert.ok(btn > start && btn < end, 'הכפתור מחוץ לדיאלוג, ולכן לא נראה כשצריך אותו');
  });

  test('הוא מופיע לפני כפתור איפוס הסיסמה', () => {
    assert.ok(idx('mailAskResend') < idx('mailAskExisting'),
      'שליחה חוזרת היא הדבר הראשון שמנסים; איפוס סיסמה הוא המוצא האחרון. הסדר על המסך ' +
      'הוא ההוראה היחידה שרוב האנשים קוראים.');
  });

  test('לכפתור יש טקסט שאומר מה הוא עושה, לא "לחץ כאן"', () => {
    const m = html.slice(idx('mailAskResend')).match(/>([^<]{4,})</);
    assert.ok(m, 'לכפתור אין טקסט גלוי');
    assert.ok(/לא\s*קיבלתי|שלח\s*שוב|שליחה\s*חוזרת/.test(m[1]),
      'הטקסט חייב לתאר את הפעולה: ' + JSON.stringify(m[1]));
  });

  /* נמדד בדפדפן אמיתי: 127×20 פיקסלים. .ask-cancel מעוצב ככקישור טקסט בלי ריפוד, ותשעה
     כפתורים באפליקציה יורשים את זה · כולל זה, שהוא המוצא היחיד של מי שתקוע בלי מייל, על
     טלפון. 44 פיקסלים הוא הסף המקובל (WCAG 2.5.5) והוא בערך רוחב של אצבע. */
  test('גובה יעד המגע של .ask-cancel מגיע ל-44 פיקסלים', () => {
    const m = html.match(/\.ask-cancel\{([^}]*)\}/);
    assert.ok(m, 'הכלל .ask-cancel לא נמצא ב-index.html');
    const mh = m[1].match(/min-height\s*:\s*(\d+)px/);
    assert.ok(mh, 'ל-.ask-cancel אין min-height כלל: ' + JSON.stringify(m[1]));
    assert.ok(Number(mh[1]) >= 44,
      `יעד מגע של ${mh[1]}px קטן מאצבע. תשעה כפתורים יורשים את הכלל הזה.`);
  });
});

/* ========================================================== app.js ======================= */
describe('app.js · הכפתור באמת מחובר', () => {

  test('יש הצמדה ל-#mailAskResend', () => {
    assert.ok(/\$\('#mailAskResend'\)\s*\.\s*onclick\s*=/.test(app),
      'כפתור בלי onclick לא זורק שום שגיאה — הוא פשוט לא עושה כלום, וזה הכשל השקט ביותר');
  });

  test('ההצמדה קוראת ל-Store.resendConfirmation', () => {
    const from = app.indexOf("$('#mailAskResend')");
    assert.ok(from > 0);
    assert.ok(/Store\.resendConfirmation/.test(app.slice(from, from + 900)),
      'המטפל לא קורא לשכבת הרשת');
  });

  test('הכפתור מושבת בזמן השליחה · כפולה שורפת את מכסת הספק', () => {
    const from = app.indexOf("$('#mailAskResend')");
    assert.ok(/disabled\s*=\s*true/.test(app.slice(from, from + 900)),
      'Supabase חוסם שליחה שנייה לאותה כתובת בתוך דקה; לחיצה כפולה תיראה ללומד ככישלון');
  });

  test('כישלון מוצג ללומד ולא נבלע', () => {
    const from = app.indexOf("$('#mailAskResend')");
    const body = app.slice(from, from + 900);
    assert.ok(/mailAskMsg/.test(body),
      'התוצאה חייבת להגיע לאלמנט ההודעה של הדיאלוג — אחרת הלחיצה נראית כאילו לא קרה כלום');
  });
});

/* ========================================================== הנוסח ======================= */
describe('הנוסח · לא להבטיח מייל שאולי לא ייראה', () => {

  /* המשפט שהוצג אחרי הרשמה מוצלחת. הוא היה הבטחה נחרצת, ובשני המקרים שנצפו הוא היה מדויק
     מבחינה טכנית ומטעה מבחינה מעשית: המייל אכן נשלח, אכן נמסר, ואיש לא ראה אותו. */
  test('ההודעה שאחרי ההרשמה מזכירה שהמייל עלול לא להופיע', () => {
    const m = app.match(/textContent\s*=\s*'([^']*אשר את המייל[^']*)'/);
    assert.ok(m, 'לא מצאתי את הודעת ההרשמה — השתנתה?');
    assert.ok(/ספאם|לא הגיע|קידומי/.test(m[1]),
      'הנוסח מבטיח בביטחון ולא מכין לאפשרות היחידה שקרתה בפועל: ' + JSON.stringify(m[1]));
  });
});
