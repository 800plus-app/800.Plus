'use strict';
/* «נרשם ולא פתח מעולם» · שני האותות שחייבים להסכים.
 *
 * מה שנמצא
 * --------
 * ‏`last_seen` נכתב ב-`store.js` בתוך `signIn` בלבד · כלומר רק כשמישהו מקליד
 * סיסמה. הלקוח מוגדר `persistSession: true`, ולכן מי שנכנס פעם אחת במכשיר חוזר
 * אליו לנצח בלי לעבור שם שוב. בפועל השדה מדד «מתי הוקלדה סיסמה בפעם האחרונה»,
 * ונקרא בכל מקום כאילו הוא «מתי נראה לאחרונה».
 *
 * ⛔ ומה שזה שבר: `scripts/pick_inactive.py` מזהה «לא פתח מעולם» לפי `last_seen`
 * ריק. לומד פעיל בלי `last_seen` נבחר למייל «נרשמת ולא פתחת» — **ובאותו יום נבחר
 * גם לתזכורת השבועית.** שוחזר על פיקסטורה: פרופיל אחד הופיע בשתי הרשימות.
 * ‏`activation-email.yml` מבטיח במפורש שזה בלתי אפשרי.
 *
 * שתי השכבות שהשער הזה מחזיק
 * --------------------------
 *   1. ‏`last_seen` נכתב בכל פתיחה · לא רק ב-`signIn`.
 *   2. הבורר אינו סומך על `last_seen` לבדו · הוא דורש גם שלא נפגשה אף מילה,
 *      ובלי `progress.json` הוא נופל במקום לשלוח.
 *
 * ⛔ מה שהשער הזה **אינו** מכסה, במפורש: `activation-email.yml` עדיין אינו מושך
 * את `progress.json`. הקובץ אינו בהיקף של הסשן הזה. עד שהשורה תתווסף שם, הריצה
 * המתוזמנת תיפול · וזה מכוון, כי החלופה היא לשלוח למי שאסור.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./_harness/sandbox.js');
const { codeMask, matchBrace, codeMatches } = require('./_harness/scan.js');

const שורש = path.join(__dirname, '..');
const קרא = f => fs.readFileSync(path.join(שורש, f), 'utf8');

/** גוף פונקציה בשמה, כולל הסוגריים · הגבול נמדד מספירת סוגריים ולא ממספר קבוע. */
function גוף(src, פתיחה) {
  const at = src.indexOf(פתיחה);
  assert.notStrictEqual(at, -1, `לא נמצא: ${פתיחה}`);
  const mask = codeMask(src);
  const open = src.indexOf('{', at);
  const close = matchBrace(src, open, mask);
  assert.ok(close > open, `חילוץ נכשל: ${פתיחה}`);
  return src.slice(at, close + 1);
}

describe('last_seen נכתב בכל פתיחה', () => {

  test('store.js מחזיק touchSeen, והכתיבה אינה כלואה ב-signIn', () => {
    const s = קרא('store.js');
    assert.ok(/touchSeen\s*\(/.test(s), 'store.js אינו מחזיק touchSeen');
    const signIn = גוף(s, 'async signIn(');
    const כתיבות = codeMatches(s, /last_seen\s*:/, codeMask(s));
    assert.ok(כתיבות.length >= 1, 'אין שום כתיבה ל-last_seen');
    /* ⭐ כל כתיבה ל-last_seen חייבת לשבת מחוץ ל-signIn · בתוך touchSeen.
       זו הצורה שהייתה שגויה, ולכן זו הצורה שנחסמת. */
    const בsignIn = כתיבות.filter(m => s.slice(0, m.at).length >= s.indexOf(signIn) &&
      m.at < s.indexOf(signIn) + signIn.length && m.at >= s.indexOf(signIn));
    assert.strictEqual(בsignIn.length, 0,
      'last_seen נכתב בתוך signIn · מי שחוזר עם הפעלה שמורה לעולם לא עובר שם');
  });

  test('afterAuthed קוראת ל-touchSeen · זה המסלול שכל הכניסות עוברות בו', () => {
    const b = גוף(appSource(), 'async function afterAuthed(');
    const קריאות = codeMatches(b, /Store\.touchSeen\s*\(/, codeMask(b));
    assert.strictEqual(קריאות.length, 1,
      'afterAuthed אינה קוראת ל-Store.touchSeen · שחזור הפעלה מהדיסק לא יעדכן last_seen');
  });

  /* פתיחה אחת = כתיבה אחת. afterAuthed נקראת גם מאירוע החלפת משתמש. */
  test('יש שומר נגד כתיבה כפולה באותה פתיחה', () => {
    const b = גוף(appSource(), 'async function afterAuthed(');
    assert.ok(/seenTouched/.test(b),
      'אין שומר · אותה פתיחה תכתוב את last_seen יותר מפעם אחת');
  });
});

describe('הבורר אינו סומך על last_seen לבדו', () => {

  const py = () => קרא('scripts/pick_inactive.py');

  test('progress.json נדרש · בלעדיו הסקריפט נופל ואינו שולח', () => {
    const s = py();
    assert.ok(/progress\.json/.test(s), 'pick_inactive.py אינו טוען את progress.json');
    assert.ok(/sys\.exit\(/.test(s),
      'אין נפילה · בלי progress.json הסקריפט ימשיך וישלח למי שאסור');
    /* ⛔ `except FileNotFoundError` שרק מדפיס וממשיך הוא בדיוק הכשל · ריצה ירוקה
       שלא שולחת כלום, או גרוע מכך שולחת לפי האות השגוי. */
    assert.ok(/except FileNotFoundError:[\s\S]{0,200}?sys\.exit\(/.test(s),
      'היעדר progress.json נתפס אבל אינו מפיל את הריצה');
  });

  test('פרופיל שנפגש עם מילה נפסל · גם כשאין לו last_seen', () => {
    const s = py();
    assert.ok(/met\s*=\s*\{\}/.test(s), 'אין ספירת מילים שנפגשו');
    /* ⛔ הספירה חייבת **לפסול**, לא רק להתקיים. `met.get(...)` בשורה נפרדת שאיש
       אינו בודק היא שער שלא יורה · הצורה הזאת כבר עברה כירוקה בפרויקט הזה. */
    assert.ok(/if\s+n_met\s*:[\s\S]{0,160}?skip\s*\(/.test(s),
      'הספירה נבנית ואינה משמשת לפסילה · זה שער שלא יורה');
    /* הסיבה מודפסת בנפרד · «כבר נכנס» ו«פתח ותרגל» הם שני כשלים שונים,
       ולוג שמאחד אותם מסתיר איזה מהם קרה. */
    assert.ok(/פתח ותרגל/.test(s), 'סיבת הפסילה החדשה אינה מודפסת בנפרד');
  });

  /* ⛔ `seen>0` ולא `level<3`. כאן די בכך שנגעו במילה אחת כדי לדעת שהאפליקציה
     נפתחה · סינון לפי רמה היה מחזיר לומדים ששלטו בכל מה שתרגלו אל תוך הרשימה. */
  test('הספירה היא «נפגשה», לא «מילה לחיזוק»', () => {
    const s = py();
    const קטע = s.slice(s.indexOf('met = {}'), s.indexOf('picked, skipped'));
    assert.ok(/seen/.test(קטע), 'הספירה אינה נשענת על seen');
    assert.ok(!/level/.test(קטע),
      'הספירה מסננת לפי level · לומד ששלט בכל מה שתרגל ייספר כמי שלא פתח');
  });
});
