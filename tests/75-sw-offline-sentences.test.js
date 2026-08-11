'use strict';
/* השלמת משפטים אופליין — הפשרה נשמרת, הרגרסיה נסגרת.
 *
 * מה נמדד ב-11.8.2026 (בדק בית 3 · ד2/ד3)
 * -----------------------------------------
 * השרת הופל בפועל ונטען מחדש. האפליקציה עלתה מהמטמון במלואה, אבל
 * `loadSentData()` החזירה `false` אחרי 2.3 שניות — `data-sent-en.js` (195KB)
 * אינו ב-`ASSETS`, ולכן אינו מוקדם-מטמון.
 *
 * למה זו לא סתם "החלטה שהיא בסדר"
 * ---------------------------------
 * ההחלטה **לטעון עצלה** מנומקת ב-app.js:5668 ונכונה: רוב הכניסות אינן נוגעות
 * בתרגול הזה, ואין סיבה לעכב עלייה ב-195KB. אבל precache הוא החלטה אחרת —
 * הוא רץ ברקע ואינו מעכב כלום. הקובץ כן נכנס למטמון בזמן ריצה בשימוש ראשון,
 * ואז `activate` מוחק את המטמון הישן בכל דיפלוי:
 *     ks.filter(k => k !== V && k.startsWith('hw-v')).map(k => caches.delete(k))
 * ‏`REV` זז 41 פעם בעשרה ימים, ולכן מי שכן מתרגל משפטים איבד את היכולת לתרגל
 * אופליין אחרי **כל** העלאת גרסה, עד שייכנס שוב כשהוא מקוון.
 *
 * הפתרון שומר על שני הצדדים: מי שמעולם לא נגע במשפטים אינו מוריד כלום, ומי
 * שהקובץ כבר היה אצלו מקבל אותו מראש בגרסה החדשה. התנאי נמדד מול המטמון הישן,
 * שהוא העדות היחידה שיש ל-service worker על מה שהמשתמש באמת עשה. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* גוף מאזין ה-install בלבד. שער שמחפש בקובץ כולו היה נצבע ירוק מאזכור
   ב-ASSETS או בהערה, וזה בדיוק דפוס "השער שדיווח עבר בלי לבדוק". */
function installBody() {
  const at = sw.indexOf("addEventListener('install'");
  assert.ok(at > 0, "לא נמצא מאזין install ב-sw.js");
  const end = sw.indexOf("addEventListener('activate'", at);
  return sw.slice(at, end > 0 ? end : sw.length);
}

/* רשימת ASSETS כטקסט, כדי לבדוק מה כן ומה לא מוקדם-מטמון ללא תנאי. */
function assetsBlock() {
  const at = sw.indexOf('const ASSETS');
  return sw.slice(at, sw.indexOf('];', at));
}

describe('data-sent-en.js — לא לכולם, אבל כן למי שמשתמש', () => {
  test('הפשרה נשמרת: הקובץ אינו ב-ASSETS ללא תנאי', () => {
    /* אם מישהו "יתקן" את זה בכך שיוסיף אותו ל-ASSETS, כל לומד עברית-בלבד
       יוריד 195KB בכל דיפלוי. זה הצד השני של אותה פשרה, והוא לא פחות אמיתי. */
    assert.ok(!/data-sent-en\.js/.test(assetsBlock()),
      'data-sent-en.js נכנס ל-ASSETS — 195KB בכל דיפלוי גם למי שלא נוגע במשפטים');
  });

  test('install מקדים אותו למי שכבר היה לו', () => {
    const body = installBody();
    assert.ok(/data-sent-en\.js/.test(body),
      'install אינו מזכיר את data-sent-en.js — מי שמתרגל משפטים יאבד אופליין בכל דיפלוי');
    assert.ok(/caches\.keys\(\)/.test(body),
      'ההקדמה אינה מותנית במטמון הקודם — כלומר היא חלה על כולם, והפשרה נשברה');
  });

  test('ה-URL שמוקדם זהה ל-URL שהדף מבקש', () => {
    /* cache-first מתאים על ה-URL המדויק כולל ה-query. אם ה-service worker
       ישמור `?v=182` והדף יבקש בלי query (או להפך), ההתאמה לא תקרה לעולם —
       195KB יורדים ואיש לא נהנה מהם. sentBuildV שולפת את v מתוך תג app.js. */
    assert.match(app, /function sentBuildV\(\)[\s\S]{0,220}?app\\?\.js\\?\?v=/,
      'sentBuildV שינתה צורה — ודא שוב שה-URL תואם');
    const body = installBody();
    assert.match(body, /data-sent-en\.js\?v=\$\{REV\}/,
      'ה-URL שמוקדם אינו נושא ?v=${REV} — הוא לא ייענה לבקשה של הדף');
  });

  test('הכישלון אינו מפיל את ההתקנה', () => {
    /* ההערה ב-sw.js קובעת ש-CORE בלבד רשאי להפיל install. קובץ של 195KB
       על רשת חלשה הוא בדיוק המקרה שבגללו הכלל הזה נכתב. */
    const body = installBody();
    const at = body.indexOf('data-sent-en.js');
    const around = body.slice(Math.max(0, at - 320), at + 320);
    assert.ok(/catch\s*\(/.test(around),
      'ההקדמה של data-sent-en.js אינה עטופה ב-catch — כשל שלה יבטל את ההתקנה כולה');
  });
});
