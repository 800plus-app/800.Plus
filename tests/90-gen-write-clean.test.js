'use strict';
/* קובץ נוצר אינו משאיר `M` בעץ העבודה.
 *
 * מה שהיה
 * -------
 * ‏`sentence-completion/verify_all.js` בונה לפני שהוא בודק · זה מכוון. אבל אחרי
 * כל הרצה `data-sent-en.js` ו-`sentences-en-v3.js` הופיעו כמשונים, ונמדד שזה
 * **סופי-שורה בלבד**: ה-blob המסונן זהה ל-HEAD תו בתו, ו-`git diff --numstat` ריק.
 * ‏`core.autocrlf=true` כאן, כלומר צורת ה-checkout היא CRLF · והכותב פלט LF.
 *
 * ⚠ למה זה לא רק רעש: הרצת הגייט היא הוראה בפרומט המבקר. סשן שיריץ ואז יעשה
 * ‏`git add` על אחד הנתיבים ידחוף שינוי סופי-שורה על קובץ שלם, ויקבור בתוכו כל
 * שינוי אמיתי.
 *
 * מה השער הזה מחזיק
 * -----------------
 * שתי שכבות · שתיהן ניתנות לשבירה:
 *   1. ‏`writeGen` עצמה · מסוף שורות, דילוג על תוכן זהה, השוואה בבתים.
 *   2. שני הכותבים אינם חוזרים ל-`fs.writeFileSync` על קובץ ייצור.
 *
 * ⛔ השכבה השנייה היא העיקר. בלעדיה `writeGen` נשארת בקובץ ואיש אינו קורא לה,
 * וזו בדיוק הצורה שבה תיקון מתבטל בשקט בעריכה הבאה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const שורש = path.join(__dirname, '..');
const { writeGen } = require(path.join(שורש, 'sentence-completion/write_gen.js'));

function זמני() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
}

/* ⛔ **לא `repoEol`.** ‏`repoEol` היא הפונקציה הנבדקת · שער שמשתמש בה כדי לקבוע
   מה נכון מסכים איתה תמיד, גם כשהיא שגויה. זה נמדד: בגרסה הראשונה של הקובץ הזה
   מוטציה שקיבעה את מסוף השורות ל-LF **עברה 7/7**. הציפייה נשאלת כאן מ-git ישירות. */
function מסוףמצופה() {
  const cfg = k => {
    try {
      return cp.execFileSync('git', ['config', '--get', k],
        { cwd: שורש, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) { return ''; }
  };
  const eol = cfg('core.eol');
  if (eol === 'crlf') return '\r\n';
  if (eol === 'lf') return '\n';
  return cfg('core.autocrlf') === 'true' ? '\r\n' : '\n';
}

describe('writeGen · הכתיבה עצמה', () => {

  test('קובץ חדש נכתב, ומדווח שנכתב', () => {
    const d = זמני(), p = path.join(d, 'a.js');
    assert.strictEqual(writeGen(p, 'שלום\nעולם\n'), true);
    assert.ok(fs.existsSync(p));
  });

  test('תוכן זהה אינו נכתב שוב · גם ה-mtime אינו זז', () => {
    const d = זמני(), p = path.join(d, 'a.js');
    writeGen(p, 'שלום\nעולם\n');
    const מתי = fs.statSync(p).mtimeMs;
    assert.strictEqual(writeGen(p, 'שלום\nעולם\n'), false, 'נכתב שוב על תוכן זהה');
    assert.strictEqual(fs.statSync(p).mtimeMs, מתי, 'ה-mtime זז · git יבדוק מחדש בכל הרצה');
  });

  test('תוכן ששונה באמת כן נכתב', () => {
    const d = זמני(), p = path.join(d, 'a.js');
    writeGen(p, 'שלום\n');
    assert.strictEqual(writeGen(p, 'שלום\nעוד שורה\n'), true, 'שינוי אמיתי לא נכתב · זה נתון שאבד');
    assert.ok(fs.readFileSync(p, 'utf8').includes('עוד שורה'));
  });

  /* ⭐ זה התרחיש שניקה את עץ העבודה בפועל: הקובץ על הדיסק היה LF, התוכן זהה,
     והוא בכל זאת **חייב** להיכתב מחדש כדי לחזור לצורת ה-checkout. */
  test('אותו תוכן במסוף שורות שגוי כן נכתב מחדש', () => {
    const d = זמני(), p = path.join(d, 'a.js');
    const טקסט = 'שלום\nעולם\n';
    const הפוך = מסוףמצופה() === '\r\n' ? '\n' : '\r\n';
    fs.writeFileSync(p, Buffer.from(טקסט.replace(/\n/g, הפוך), 'utf8'));
    assert.strictEqual(writeGen(p, טקסט), true,
      'קובץ במסוף שורות שאינו צורת ה-checkout לא תוקן · הוא יישאר M לנצח');
    assert.strictEqual(writeGen(p, טקסט), false, 'ההרצה שאחריה עדיין כותבת');
  });

  test('הפלט הוא מסוף השורות ש-git מייצר, ואחיד', () => {
    const d = זמני(), p = path.join(d, 'a.js');
    writeGen(p, 'א\r\nב\nג\r\n');
    const b = fs.readFileSync(p).toString('latin1');
    const crlf = (b.match(/\r\n/g) || []).length;
    const lf = (b.match(/\n/g) || []).length;
    assert.strictEqual(lf, 3, 'מספר השורות השתנה');
    if (מסוףמצופה() === '\r\n')
      assert.strictEqual(lf - crlf, 0,
        'נשארו שורות LF חשופות · קובץ כזה מוצג כ-M גם כשה-blob זהה ל-HEAD');
    else
      assert.strictEqual(crlf, 0, 'נשארו שורות CRLF בריפו שצורת ה-checkout שלו LF');
  });
});

describe('הכותבים אינם חוזרים ל-writeFileSync', () => {

  const כותבים = [
    { קובץ: 'sentence-completion/assemble.js', יעד: 'sentences-en-v3.js' },
    { קובץ: 'sentence-completion/build_ship.js', יעד: 'data-sent-en.js' },
  ];

  for (const { קובץ, יעד } of כותבים) {
    test(`${קובץ} · הכתיבה ל-${יעד} עוברת דרך writeGen`, () => {
      const src = fs.readFileSync(path.join(שורש, קובץ), 'utf8');
      assert.ok(/require\(['"]\.\/write_gen\.js['"]\)/.test(src),
        `${קובץ} אינו טוען את write_gen.js`);
      assert.ok(/writeGen\s*\(/.test(src), `${קובץ} אינו קורא ל-writeGen`);
      /* ⛔ מחפשים את הצורה שחוזרת · writeFileSync על היעד עצמו, בשם או דרך dest. */
      const חוזר = new RegExp('writeFileSync\\s*\\([^)]*(' +
        יעד.replace(/[.]/g, '\\.') + '|\\bdest\\b|\\bheader\\b)');
      assert.ok(!חוזר.test(src),
        `${קובץ} חזר ל-fs.writeFileSync על קובץ הייצור · עץ העבודה יתלכלך שוב בכל הרצה`);
    });
  }
});
