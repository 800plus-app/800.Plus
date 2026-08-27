/* כתיבת קובץ נוצר, בלי ללכלך את עץ העבודה.
 *
 * הבעיה שזה פותר
 * --------------
 * ‏`verify_all.js` בונה לפני שהוא בודק · זה מכוון, וההערה שלו מסבירה למה: ריצה
 * שבודקת קורפוס ישן היא הכשל שהכלי נבנה כדי למנוע. אבל אחרי כל הרצה
 * ‏`data-sent-en.js` ו-`sentences-en-v3.js` הופיעו כ-`M` ב-`git status`, וזה נמדד:
 *
 *   git rev-parse HEAD:data-sent-en.js        → ef25c92f5492…
 *   git hash-object --path … data-sent-en.js  → ef25c92f5492…   · אותו blob בדיוק
 *   git diff --numstat data-sent-en.js        → ריק
 *   git status --porcelain data-sent-en.js    →  M              · ובכל זאת
 *
 * הסיבה: ‏`core.autocrlf=true` כאן, כלומר **צורת ה-checkout היא CRLF**. הכותב פלט
 * ‏LF, ולכן הקובץ על הדיסק אינו בצורה ש-checkout היה מייצר · git מסמן אותו כמשונה
 * כדי שהמשיכה הבאה תנרמל אותו, גם כשהתוכן המסונן זהה לחלוטין.
 *
 * ⚠ **ולמה זה לא רק רעש:** הרצת הגייט היא הוראה בפרומט המבקר. סשן שיריץ ואז יעשה
 * ‏`git add` על אחד הנתיבים ידחוף שינוי סופי-שורה על קובץ שלם, ויקבור בתוכו כל
 * שינוי אמיתי.
 *
 * ההכרעה
 * ------
 * **הגייט ממשיך לכתוב.** החלופה שנשקלה · `--check` שמשווה ומדווח בלבד · הייתה
 * צריכה לבנות ממילא כדי שיהיה מול מה להשוות, כלומר אותה עבודה בדיוק ועוד מנגנון.
 * ⭐ וגרוע מכך: היא הייתה מסירה את **התסמין** ומשאירה את המחלה. עץ העבודה המלוכלך
 * הוא מה שחשף שכל קובץ נוצר בריפו הזה נכתב בצורה שאינה צורת ה-checkout.
 *
 * לכן התיקון יושב בכותב עצמו, ושתי שכבות לו:
 *   1. מסוף השורות נקבע לפי מה ש-git יעשה בפועל (`core.eol` · `core.autocrlf`).
 *   2. תוכן זהה אינו נכתב כלל · גם ה-mtime לא זז, וגם קובץ ענק לא נכתב לחינם.
 */
'use strict';
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

let EOL = null;
/** מה `git checkout` היה מייצר כאן · CRLF או LF. נקבע פעם אחת לתהליך. */
function repoEol(cwd) {
  if (EOL) return EOL;
  const cfg = k => {
    try {
      return cp.execFileSync('git', ['config', '--get', k],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) { return ''; }        // אין git, או שהמפתח לא מוגדר
  };
  const eol = cfg('core.eol');
  if (eol === 'crlf') EOL = '\r\n';
  else if (eol === 'lf') EOL = '\n';
  else EOL = cfg('core.autocrlf') === 'true' ? '\r\n' : '\n';
  return EOL;
}

/**
 * כותב `text` ל-`dest` בצורה שאינה מייצרת שינוי מדומה.
 * מחזיר `true` אם נכתב בפועל, `false` אם התוכן כבר היה זהה.
 */
function writeGen(dest, text) {
  const nl = repoEol(path.dirname(dest));
  const body = String(text).replace(/\r\n/g, '\n').replace(/\n/g, nl);
  const buf = Buffer.from(body, 'utf8');
  /* השוואה בבתים ולא במחרוזת · מחרוזת שווה שנכתבה בקידוד אחר עדיין מייצרת diff. */
  let cur = null;
  try { cur = fs.readFileSync(dest); } catch (e) { }
  if (cur && cur.equals(buf)) return false;
  fs.writeFileSync(dest, buf);
  return true;
}

module.exports = { writeGen, repoEol };
