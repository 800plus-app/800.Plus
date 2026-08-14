'use strict';
/* מבחן הרמה מאחורי אזהרה ואישור.
 *
 * למה הקובץ הזה קיים
 * -------------------
 * מבחן הרמה ישב כשני כפתורים במסך בחירת השפה · המסך שנפתח בכל כניסה · ולחיצה אחת עליהם
 * התחילה אותו. הוא אינו פעולה ניטרלית:
 *
 *   · lvFinish() עושה LS.set(lvKey(), level||'A1') + queueRemoteSync(), כלומר תוצאת מבחן
 *     הרמה הקודמת מוחלפת ונדחפת לענן לכלל המכשירים.
 *   · במסלול האנגלי הוא המקום היחיד באפליקציה שמציע להוציא מילים מהתרגול (lvApplyKnown).
 *
 * הכפתורים עברו להגדרות, ובדרך אליהם עומד עכשיו #lvAsk · דיאלוג שמסביר מה קורה ודורש
 * אישור מפורש. שלוש הדרכים שבהן זה יכול להישבר בשקט, וכל אחת מהן נבדקת כאן:
 *
 *   1. מישהו יחזיר קיצור דרך · כפתור שקורא ל-lvStart ישירות, והדיאלוג יישאר קוד מת.
 *   2. מישהו ימחק את גוף האזהרה ויישאר עם דיאלוג ריק שרק שואל "להתחיל?".
 *   3. מישהו ישכח לרשום את השורות החדשות ב-ACC_TABS · ואז הן גלויות גם בלשונית הפרופיל.
 *
 * ובנוסף, המלכודת שכבר נפלנו בה פעם: טקסט שמפנה לכפתור בשם שכבר לא קיים. האזהרה מפנה
 * ל"ניהול מילים" ← "שחזר מחיקות", ולכן הבדיקה מוודאת ששני השמות האלה עדיין מופיעים
 * כתוויות של כפתורים אמיתיים ב-index.html.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { extractHandler, extractFunction, extractDecl } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = appSource();
const mask = codeMask(app);

/* הדיאלוג עצמו, כמחרוזת. נחתך על סגירת ה-div החיצוני של ה-.ask הבא אחריו · מספיק
   לוודא שהטקסט והכפתורים יושבים בתוך אותו אלמנט ולא במקום אקראי בקובץ. */
function lvAskMarkup() {
  const at = html.indexOf('id="lvAsk"');
  assert.ok(at > 0, 'index.html כבר לא מכיל את #lvAsk -- דיאלוג האזהרה נעלם');
  const next = html.indexOf('class="ask hidden"', at);
  return html.slice(at, next > at ? next : at + 3000);
}

describe('מבחן הרמה עבר להגדרות', () => {

  test('שתי השורות קיימות ב-index.html', () => {
    for (const id of ['accLevelHe', 'accLevelEn'])
      assert.ok(html.includes('id="' + id + '"'), `#${id} לא נמצא ב-index.html`);
  });

  test('הכפתורים הישנים במסך בחירת השפה כבר לא קיימים', () => {
    /* אם מישהו יחזיר אותם, יש שוב מסלול של לחיצה אחת אל המבחן · והדיאלוג יעקוף. */
    for (const id of ['lvOpen', 'lvOpenHe'])
      assert.ok(!html.includes('id="' + id + '"'),
        `#${id} חזר למסך בחירת השפה. זהו מסלול שעוקף את #lvAsk -- או שהוא נמחק, ` +
        'או שהוא צריך לעבור דרך אותו דיאלוג.');
  });

  test('שתי השורות רשומות בלשונית ההגדרות בלבד', () => {
    /* ACC_TABS הוא מקור האמת היחיד להסתרה. שורה שלא רשומה בו נשארת גלויה בשתי
       הלשוניות · ושורה שרשומה בשתיהן תיעלם ותופיע בכל החלפה. */
    const decl = extractDecl(app, 'ACC_TABS', mask);
    assert.ok(decl, 'app.js כבר לא מכריז על ACC_TABS');
    const profile = decl.slice(decl.indexOf('profile:'), decl.indexOf('settings:'));
    const settings = decl.slice(decl.indexOf('settings:'));
    for (const id of ['accLevelHe', 'accLevelEn']) {
      assert.ok(settings.includes(`'${id}'`), `${id} לא רשום ב-ACC_TABS.settings`);
      assert.ok(!profile.includes(`'${id}'`),
        `${id} רשום גם ב-ACC_TABS.profile -- הוא יופיע בלשונית הלמידה`);
    }
  });
});

describe('האזהרה · לחיצה על השורה פותחת דיאלוג, לא מבחן', () => {

  test('אף אחת משתי השורות לא מתחילה את המבחן בעצמה', () => {
    for (const id of ['accLevelHe', 'accLevelEn']) {
      const code = extractHandler(app, id, mask);
      assert.ok(/lvAskOpen\s*\(/.test(code),
        `#${id} כבר לא פותח את דיאלוג האזהרה`);
      assert.ok(!/lvStart\s*\(/.test(code) && !/startLevelTest\s*\(/.test(code),
        `#${id} מתחיל את המבחן ישירות. lvFinish() כותב את הרמה על הקודמת ודוחף אותה ` +
        'לענן, ולכן חייב לעמוד ביניהם אישור מפורש.');
    }
  });

  test('lvStart נקרא מכפתור האישור בלבד', () => {
    /* הבדיקה שסוגרת את הפרצה מכל הכיוונים: לא משנה מאיזו שורה חדשה, כל קריאה ל-lvStart
       שאינה מתוך #lvAskGo היא מסלול שעוקף את האזהרה. ההכרזה עצמה (const lvStart = …)
       אינה קריאה ולכן מוחרגת. */
    const decl = extractDecl(app, 'lvStart', mask) || '';
    const go = extractHandler(app, 'lvAskGo', mask);
    const calls = [...app.matchAll(/\blvStart\s*\(/g)].map(m => m.index);
    const stray = calls.filter(i => {
      const at = app.indexOf(decl);
      if (decl && at >= 0 && i >= at && i < at + decl.length) return false;   // ההכרזה
      const g = app.indexOf(go);
      return !(g >= 0 && i >= g && i < g + go.length);
    });
    assert.deepStrictEqual(stray, [],
      'משהו קורא ל-lvStart מחוץ ל-#lvAskGo -- כלומר יש מסלול אל המבחן שלא עובר באזהרה');
  });

  test('#lvAsk הוא דיאלוג מהסוג שכבר קיים באפליקציה, ומוסתר כברירת מחדל', () => {
    const tag = html.match(/<div[^>]*id="lvAsk"[^>]*>/);
    assert.ok(tag, 'אין אלמנט עם id="lvAsk"');
    assert.match(tag[0], /class="ask hidden"/,
      '#lvAsk אינו .ask hidden -- או שהוא לא נראה כמו שאר הדיאלוגים, או שהוא פתוח תמיד');
  });
});

describe('כפתור האישור · צעד מפורש, ואפשר לוותר עליו', () => {

  test('הדיאלוג מחזיק גם אישור וגם ביטול', () => {
    const box = lvAskMarkup();
    assert.ok(/id="lvAskGo"/.test(box), 'אין כפתור אישור בדיאלוג');
    assert.ok(/id="lvAskNo"/.test(box), 'אין כפתור ביטול -- לדיאלוג אזהרה חייבת להיות דרך החוצה');
  });

  test('כפתור האישור מתאר את הפעולה ואינו "אישור" סתם', () => {
    const box = lvAskMarkup();
    const label = (box.match(/id="lvAskGo"[^>]*>([^<]*)</) || [])[1];
    assert.ok(label && label.trim(), 'לכפתור האישור אין טקסט');
    assert.ok(/מבחן/.test(label),
      `כפתור האישור כתוב "${label.trim()}" -- הוא צריך לומר מה הוא מתחיל`);
  });

  test('האישור סוגר את הדיאלוג לפני שהוא מתחיל, ומעביר את השפה שנפתחה', () => {
    const go = extractHandler(app, 'lvAskGo', mask);
    assert.ok(/dataset\.lang/.test(go),
      'כפתור האישור אינו קורא את השפה מהדיאלוג -- הוא עלול להתחיל את השפה הלא נכונה');
    assert.ok(/lvStart\s*\(/.test(go), 'כפתור האישור לא מתחיל את המבחן');
  });

  test('הביטול סוגר בלי להתחיל דבר', () => {
    const no = extractHandler(app, 'lvAskNo', mask);
    assert.ok(!/lvStart\s*\(/.test(no), 'הביטול מתחיל את המבחן');
  });
});

describe('הנוסח אומר מה באמת קורה', () => {
  const box = () => lvAskMarkup().replace(/<!--[\s\S]*?-->/g, '');

  test('הדיאלוג מסביר שהתוצאה מחליפה את הקודמת ומסתנכרנת', () => {
    /* זו ההשלכה שבגללה הדיאלוג קיים. lvFinish() עושה LS.set(lvKey(), …) · כתיבה על
       הערך הקיים · ואז queueRemoteSync(). דיאלוג שרק שואל "להתחיל?" אינו אזהרה. */
    const t = box();
    assert.ok(/מחליפה/.test(t),
      'האזהרה כבר לא אומרת שהתוצאה מחליפה את הקודמת -- זו ההשלכה היחידה שקורית תמיד');
    assert.ok(/מסתנכרנת|מכשירים/.test(t),
      'האזהרה לא מזכירה שהתוצאה נדחפת לכלל המכשירים (queueRemoteSync)');
  });

  test('הדיאלוג אומר גם מה לא נוגעים בו', () => {
    /* הצד השני של אותה אמת: lvFinish אינו נוגע ב-hw_stats, בציוני היחידות וברצף.
       אזהרה שמשאירה את זה פתוח מרתיעה ממבחן שהוא לרוב לגמרי בטוח. */
    assert.ok(/תרגלת/.test(box()),
      'האזהרה לא אומרת שמילים שכבר תורגלו נשארות -- היא מפחידה יותר ממה שהקוד עושה');
  });

  test('הפסקה על הוצאת מילים מהתרגול קיימת, ומוצגת רק באנגלית', () => {
    /* ההצעה קיימת רק כש-LV_LANG==='en' (ראה lvFinish), ולכן הצגתה בעברית תהיה
       אזהרה מפני משהו שלא יקרה. */
    assert.ok(/id="lvAskEn"/.test(box()), 'הפסקה על הוצאת המילים מהתרגול נמחקה');
    const open = extractFunction(app, 'lvAskOpen', mask);
    assert.ok(open, 'app.js כבר לא מכריז על lvAskOpen()');
    assert.ok(/#lvAskEn'\)\.classList\.toggle\('hidden'/.test(open),
      "lvAskOpen כבר לא מסתיר את #lvAskEn -- הפסקה תוצג גם במבחן העברית");
    assert.ok(/lang\s*!==\s*'en'/.test(open),
      'התנאי שמסתיר את #lvAskEn אינו נשען על השפה האנגלית');
  });

  test('ההבטחה שאפשר להחזיר את המילים מפנה לכפתורים שקיימים באמת', () => {
    /* המלכודת המתועדת: טקסט ניקב בשם כפתור, הכפתור שונה, והמשפט הפך לשקר. שני השמות
       שהאזהרה מפנה אליהם נבדקים מול התוויות שב-index.html. */
    const t = box();
    assert.ok(/ניהול מילים/.test(t) && /שחזר מחיקות/.test(t),
      'האזהרה כבר לא אומרת איך מחזירים מילים שהוצאו מהתרגול');
    assert.ok(/id="manageBtn"[^>]*>[^<]*ניהול מילים/.test(html),
      'האזהרה מפנה ל"ניהול מילים", אבל אין כפתור בשם הזה ב-index.html');
    assert.ok(/id="mRestore"[^>]*>\s*שחזר מחיקות/.test(html),
      'האזהרה מפנה ל"שחזר מחיקות", אבל אין כפתור בשם הזה ב-index.html');
  });

  test('שם השפה נכתב לדיאלוג · האזהרה לא אומרת "עברית" על מבחן באנגלית', () => {
    const open = extractFunction(app, 'lvAskOpen', mask);
    assert.ok(/#lvAskLang'\)\.textContent/.test(open), 'שם השפה בכותרת אינו מתעדכן');
    assert.ok(/id="lvAskLang"/.test(box()), 'אין מקום בכותרת לשם השפה');
  });
});
