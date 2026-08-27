'use strict';
/* «הכרטיס הוצג» · הרישום שלא היה קיים, וזה מה שחסם כל מדידה של המשפך.
 *
 * מה שהיה
 * -------
 * ‏`wtp_survey` קיבלה שורה **רק** בשתי נקודות · ✕ (`dismissed:true`) ושליחת
 * תשובה. ‏`show($('#wtpAsk'))` לא כתב דבר. ⛔ ולכן «כמה ראו את הסקר» מעולם
 * לא נמדד · מה שנמדד הוא «כמה הגיבו», ואת ההפרש בין השניים אי אפשר היה לגזור
 * בשום שאילתה. זה חסם מבני, לא חסר בשאילתה.
 *
 * ⛔ ולמה זה לא הסתדר עם מכנה חלופי
 * ---------------------------------
 * שני מכנים נוסו ושניהם נפלו מאותה סיבה:
 *   `data->'stats' <> '{}'`        · ⛔ תמיד־אמת · `stats` מאותחל ל-
 *                                    `{words:{},sessions:[]}` (`app.js:112`)
 *   `stats.sessions` לא ריק        · ⛔ `finishRound` **אינו** קורא ל-
 *                                    `commitSession`, והשורה נוצרת בקומיט
 *                                    הראשון · כלומר גם מי שענה על 3 מילים
 *                                    מתוך 20 וסגר לשונית מקבל אחת.
 * ⭐ שניהם ספרו «יש שורת התקדמות», לא «סיים סבב». המכנה פשוט אינו בנתונים,
 * ולכן הוא נכתב עכשיו מהצד של הקוד.
 *
 * ⛔ שתי החלטות שנלקחו כאן, ושתיהן ניתנות לשבירה
 * ----------------------------------------------
 * 1. **INSERT ולא UPDATE.** ל-`wtp_survey` אין מיגרציה בריפו · המדיניות שלה
 *    אינה ידועה מהקוד. ‏INSERT מוכח שעובד (‏17 שורות קיימות); UPDATE הוא ניחוש,
 *    ואם הוא חסום **התשובות עצמן** היו מפסיקות להירשם. המחיר: שתי שורות ללומד
 *    שהגיב, וניתוח שסופר `distinct user_id`.
 * 2. **`wtpAsked` סופרת תשובות בלבד.** בלי הסינון, שורת ההצגה הייתה חוסמת גם
 *    את מי שהתעלם · ⛔ וזה **שינוי התנהגות** ולא מדידה: היום מי שהתעלם נשאל
 *    שוב בטעינה הבאה. הסינון שומר על ההתנהגות הקיימת בדיוק.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./_harness/sandbox.js');
const { codeMask, matchBrace, codeMatches } = require('./_harness/scan.js');

const שורש = path.join(__dirname, '..');
const store = () => fs.readFileSync(path.join(שורש, 'store.js'), 'utf8');

function גוף(src, פתיחה) {
  const at = src.indexOf(פתיחה);
  assert.notStrictEqual(at, -1, `לא נמצא: ${פתיחה}`);
  const mask = codeMask(src);
  const open = src.indexOf('{', at);
  const close = matchBrace(src, open, mask);
  assert.ok(close > open, `חילוץ נכשל: ${פתיחה}`);
  return src.slice(at, close + 1);
}

describe('הרישום נכתב, ובמקום הנכון', () => {

  test('wtpMark כותב שורה עם kind, ב-insert ולא ב-update', () => {
    const b = גוף(store(), 'function wtpMark(');
    assert.ok(/\.insert\(/.test(b), 'wtpMark אינו כותב שורה');
    assert.ok(!/\.update\(/.test(b),
      'wtpMark משתמש ב-update · המדיניות אינה ידועה, ו-insert הוא מה שמוכח');
    /* ⛔ **בתוך המטען של ה-insert, לא «איפשהו בפונקציה».** הניסוח הראשון היה
       `/\bkind\b/` על כל הגוף · והוא עבר גם אחרי שהשדה הוסר מהמטען, כי `kind`
       נשאר כשם הפרמטר בשורת ההצהרה. השער היה ירוק ועיוור, ונמדד. */
    const מטען = b.slice(b.indexOf('.insert('), b.indexOf('})', b.indexOf('.insert(')));
    assert.ok(/(^|[,{\s])kind\s*[,:]/.test(מטען),
      'השורה נכתבת בלי kind · אי אפשר להבדיל בין השלבים');
  });

  test('שני השלבים קיימים ומשתמשים באותה פונקציה', () => {
    const s = store();
    assert.ok(/wtpMarkShown\(\)\s*\{\s*wtpMark\('shown'\)/.test(s), 'חסר שלב shown');
    assert.ok(/wtpMarkReached\(\)\s*\{\s*wtpMark\('reached'\)/.test(s), 'חסר שלב reached');
  });

  /* ⭐ המכנה נרשם ב-`finishRound` ולא בתוך `maybeAskWtp`. שם הוא היה נרשם רק
     אחרי שכל התנאים עברו · כלומר סופר את עצמו, ושתי הנפילות היו נעלמות. */
  test('«הגיע» נרשם ב-finishRound', () => {
    const fr = גוף(appSource(), 'function finishRound(');
    assert.ok(/Store\.wtpMarkReached\s*\(/.test(fr),
      'finishRound אינו רושם «הגיע» · המכנה חסר ושתי הנפילות בלתי ניתנות להפרדה');
  });

  /* ⭐ בדיקה נפרדת ולא `assert` שני באותה בדיקה · הראשון זורק והשני לא מורץ,
     ואז מוטציה שמזיזה את הרישום נראית כאילו רק «הסירה» אותו. */
  test('«הגיע» אינו נרשם בתוך maybeAskWtp', () => {
    const mw = גוף(appSource(), 'function maybeAskWtp(');
    assert.ok(!/wtpMarkReached/.test(mw),
      '«הגיע» נרשם בתוך maybeAskWtp · הוא ייכתב רק אחרי שהתנאים עברו, וסופר את עצמו');
  });

  test('התגובות נושאות kind משלהן', () => {
    const b = גוף(store(), 'async wtpSave(');
    assert.ok(/kind:\s*row\.dismissed\s*\?\s*'dismiss'\s*:\s*'answer'/.test(b),
      'wtpSave אינו מסמן את סוג התגובה · שאילתה אחת לא תוכל לספור את כל המשפך');
  });

  /* ⭐ **אחרי `show`, לא לפניו.** רישום שנכתב לפני ההצגה סופר כוונה ולא צפייה,
     וזו בדיוק הטעות שהדגל `wtpShown` עשה במקור. */
  test('הרישום נקרא אחרי show($(#wtpAsk)) ולא לפניו', () => {
    const b = גוף(appSource(), 'function maybeAskWtp(');
    const mask = codeMask(b);
    const הצגה = codeMatches(b, /show\(\s*\$\(\s*['"]#wtpAsk['"]\s*\)\s*\)/, mask);
    const רישום = codeMatches(b, /Store\.wtpMarkShown\s*\(/, mask);
    assert.strictEqual(הצגה.length, 1, 'ציפיתי להצגה אחת');
    assert.strictEqual(רישום.length, 1, 'maybeAskWtp אינה רושמת הצגה · המשפך נשאר בלתי מדיד');
    assert.ok(רישום[0].at > הצגה[0].at,
      'הרישום נכתב לפני ההצגה · הוא סופר כוונה ולא צפייה');
  });

  /* ⛔ הכתיבה אסור שתחסום · הכרטיס כבר על המסך. */
  test('הרישום אינו נעטף ב-await ואינו מפיל את המסך', () => {
    const b = גוף(appSource(), 'function maybeAskWtp(');
    assert.ok(!/await\s+Store\.wtpMarkShown/.test(b),
      'הרישום ממתין · כישלון רשת יעכב מסך שכבר מוצג');
    assert.ok(/try\{\s*Store\.wtpMarkShown\(\);\s*\}catch/.test(b),
      'הרישום אינו עטוף ב-try · חריגה כאן תשבור את מסך התוצאות');
  });
});

describe('ההתנהגות הקיימת נשמרה', () => {

  /* ⛔ זה החוט הדק של השינוי כולו. בלי הסינון, שורת ההצגה חוסמת את מי שהתעלם. */
  test('wtpAsked סופרת תשובות בלבד, לא הצגות', () => {
    const b = גוף(store(), 'async wtpAsked(');
    assert.ok(/price_bucket\.not\.is\.null/.test(b) && /dismissed\.is\.true/.test(b),
      'wtpAsked סופרת כל שורה · שורת ההצגה תחסום גם את מי שלא הגיב, וזה ' +
      'שינוי התנהגות ולא מדידה');
  });

  test('wtpAsked עדיין נופלת סגורה על שגיאה', () => {
    const b = גוף(store(), 'async wtpAsked(');
    assert.ok(/if\s*\(\s*error\s*\)\s*return true/.test(b),
      'הנפילה הסגורה הוסרה · שגיאת רשת תציג כרטיס ששליחתו תיכשל');
    assert.ok(/if\s*\(!user\)\s*return true/.test(b),
      'הבדיקה «מנותק» הוסרה · אין שורה לכתוב אליה');
  });

  test('שתי הכתיבות המקוריות לא הוסרו', () => {
    const a = appSource();
    assert.ok(/Store\.wtpSave\(\s*\{\s*dismissed:true\s*\}\s*\)/.test(a),
      'הכתיבה של ✕ הוסרה · «סגרו בלי לענות» מפסיק להימדד');
    assert.ok(/price_bucket:\s*wtpPrice/.test(a), 'שליחת התשובה הוסרה');
  });
});
