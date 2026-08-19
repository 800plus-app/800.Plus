'use strict';
/* שרשרת ההתראות — השערים שמונעים את שלוש התקלות שאי אפשר לבטל.
 *
 * מה נבנה, ולמה השערים האלה
 * ---------------------------
 * הצנרת הייתה קיימת במלואה — `push` ב-sw.js, `subscribePush` ב-app.js, `push_sub`
 * ב-Supabase, ו-`send-push` עם חתימת VAPID — אבל אף אחד לא קרא לפונקציה, ולכן אף
 * התראה מעולם לא יצאה. נוסף `push-daily.yml` שמפעיל אותה.
 *
 * שלוש התקלות שהשערים כאן נועלים:
 *
 * 1. **שליחה לכולם בטעות.** הפונקציה שלחה לכל המנויים כשלא נאמר קהל יעד. הפעלה
 *    ידנית ששכחה פרמטר הייתה מגיעה לכל מי שנרשם, ואי אפשר לבטל התראה שיצאה.
 *    עכשיו: בלי `only` ובלי `audience=all` — סירוב.
 *
 * 2. **כתובת מייל בריפו ציבורי.** הריפו פתוח, וכתובות כבר דלפו ממנו פעם. כתובת
 *    הבדיקה חייבת לשבת בסוד ולא בקובץ.
 *
 * 3. **מפתח VAPID פגום.** הערה בקוד עצמו מזהירה: מפתח שאינו P-256 תקין אינו
 *    מתפוצץ — הוא מייצר מנוי שלעולם לא מקבל דבר. כשל שקט שנמשך חודשים.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const FN = read('supabase/functions/send-push/index.ts');
const WF = read('.github/workflows/push-daily.yml');
const CFG = read('config.js');

describe('שער קהל היעד — שליחה לכולם לא קורית בשתיקה', () => {
  test('הפונקציה מסרבת כשלא נאמר קהל יעד', () => {
    assert.match(FN, /if\s*\(\s*!only\s*&&\s*audience\s*!==\s*'all'\s*\)/,
      'חסר התנאי שדוחה קריאה בלי only ובלי audience=all');
    assert.match(FN, /status:\s*400/, 'הסירוב חייב להיות 400 מפורש');
  });

  test('שאילתת המנויים ממוקדת כש-only נמסר', () => {
    assert.match(FN, /user_id=eq\./, 'המיקוד חייב לסנן לפי user_id');
    assert.match(FN, /profiles\?email=eq\./, 'המייל חייב להיפתר ל-user_id');
  });

  test('כתובת שאין לה משתמש, או משתמש בלי מנוי, נופלים בקול', () => {
    const codes = FN.match(/status:\s*404/g) || [];
    assert.ok(codes.length >= 2,
      `צפויים שני מצבי 404 — כתובת לא נמצאה, ומשתמש בלי מנוי. נמצאו ${codes.length}`);
  });

  test('ברירת המחדל של המפעיל היא נמען אחד ולא כולם', () => {
    assert.match(WF, /default:\s*me/, 'ברירת המחדל של audience חייבת להיות me');
    assert.match(WF, /vars\.PUSH_AUDIENCE\s*\|\|\s*'me'/,
      'ריצה מתוזמנת בלי משתנה מוגדר חייבת ליפול ל-me');
  });
});

describe('שער הפרטיות — אין כתובות מייל בריפו הציבורי', () => {
  test('המפעיל אינו מכיל כתובת מייל', () => {
    const hits = WF.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
    assert.deepStrictEqual(hits, [],
      `נמצאה כתובת מייל בקובץ המפעיל: ${hits.join(', ')}`);
  });

  test('כתובת הבדיקה נקראת מסוד', () => {
    assert.match(WF, /secrets\.PUSH_TEST_EMAIL/, 'הכתובת חייבת להגיע מסוד');
  });
});

describe('שער ה-VAPID — מפתח פגום לא נשלח לייצור', () => {
  const key = (CFG.match(/window\.VAPID_PUBLIC\s*=\s*'([^']*)'/) || [])[1];

  test('הערך קיים בקובץ התצורה', () => {
    assert.notStrictEqual(key, undefined, 'window.VAPID_PUBLIC נעלם מ-config.js');
  });

  /* ריק = אין Push, וזה מצב לגיטימי ומתועד. אבל ערך שאינו ריק **חייב** להיות
     מפתח P-256 תקין: 65 בתים שמתחילים ב-0x04. זו בדיוק הבדיקה ש-importKey
     עושה בצד השרת, ועדיף שהיא תיפול כאן מאשר בזמן שליחה. */
  test('ערך לא ריק הוא מפתח P-256 תקין', () => {
    if (!key) return;                       // ריק — מותר
    assert.match(key, /^[A-Za-z0-9_-]+$/, 'VAPID_PUBLIC חייב להיות base64url בלי ריפוד');
    const p = key.replace(/-/g, '+').replace(/_/g, '/');
    const raw = Buffer.from(p + '='.repeat((4 - (p.length % 4)) % 4), 'base64');
    assert.strictEqual(raw.length, 65, `מפתח P-256 הוא 65 בתים, נמצאו ${raw.length}`);
    assert.strictEqual(raw[0], 4, 'הבית הראשון חייב להיות 0x04 (נקודה לא דחוסה)');
  });

  test('המפתח הפרטי אינו בקוד', () => {
    assert.ok(!/VAPID_PRIVATE\s*=\s*'[^']+'/.test(CFG),
      '⛔ מפתח פרטי בקובץ תצורה ציבורי');
  });
});

describe('שער החוליה החסרה — מישהו קורא לפונקציה', () => {
  test('קיים מפעיל שמפנה ל-send-push', () => {
    assert.match(WF, /functions\/v1\/send-push/, 'המפעיל אינו קורא ל-send-push');
    assert.match(WF, /x-trigger-secret/, 'המפעיל אינו שולח את סוד ההרשאה');
  });

  test('המפעיל נופל כשנשלחו אפס התראות', () => {
    assert.match(WF, /sent.*=.*0|0 התראות נשלחו/,
      'ריצה שלא שלחה דבר חייבת להיכשל, לא לדווח הצלחה');
  });
});
