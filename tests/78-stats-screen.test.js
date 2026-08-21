'use strict';
/* מסך הסטטיסטיקה · מה הוא שואל.
 *
 * חגי, 21.8.2026, אחרי שראה את המסך: **"לא משנה כמה הוא צדק · משנה במה הוא טעה
 * ומה הוא לא יודע"**. ארבעה מתוך חמשת הפריטים שהיו שם היו ציונים.
 *
 * שלושה ליקויים נמדדו בדפדפן לפני שהמסך נבנה מחדש, וכל אחד מהם מקבל כאן שער:
 *
 * 1. ⛔ **הגרף היה עיוור מ-77% ומעלה.** `.trend` גבוה 84px, התווית 15.34px והמרווח
 *    4px, ולכן `<i>` לא יכול לעבור 64.66px. בצילום של חגי שבע מתוך שמונה עמודות
 *    יצאו זהות · כולל 82% ו-80% שנראו כמו 100%.
 *
 * 2. ⛔ **הכיתוב בענן סתר את מה שהענן הראה.** הגודל נגזר מ-`wrong − first` והמספר
 *    שהוצג היה `wrong` לבדו, בזמן שהכיתוב אמר "ככל שמילה גדולה יותר כך טעית בה
 *    יותר". נמדד: מילה בדרגה הגדולה נשאה 3 והקטנה נשאה 5.
 *
 * 3. ⛔ **המשקל לא נשא מידע.** ה-@font-face של Heebo מצהיר `font-weight:400 700`,
 *    ולכן `.cw.t3{font-weight:800}` ו-`.cw.t2{font-weight:700}` רונדרו זהים.
 *    אומת במדידת רוחב גליפים: 700, 800 ו-900 החזירו 460.84px.
 *
 * הבדיקות כאן סורקות מקור, ולכן הן שער נגד רגרסיה · לא הוכחה שהמסך יפה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, appSource, loadApp } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ⛔ מסירים הערות לפני הסריקה. השער הראשון שכתבתי כאן נפל על **ההערה שלי עצמי**
   שמסבירה למה "ידעת מיד" הוסר · כלומר הוא היה מדווח "הליקוי חזר" על טקסט שמתעד
   שהוא תוקן. זו בדיוק המחלה שתועדה ב-tests/39: שער שמתאים מחרוזת עובר בזכות
   הערה ולא בזכות קוד, ושם היא הסתירה ליקוי אמיתי. כאן היא יוצרת התרעת שווא.
   הכיוון היחיד שאסור: לרכך את השער. הפתרון הוא לסרוק את מה שרץ. */
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

const statsRaw = (() => {
  const at = app.indexOf('function openStats');
  assert.ok(at > 0, 'openStats נעלמה');
  const end = app.indexOf('\nfunction ', at + 10);
  return app.slice(at, end > 0 ? end : app.length);
})();
const stats = stripComments(statsRaw);

describe('המסך שואל במה טעית, לא כמה צדקת', () => {

  test('⛔ גרף הסבבים אינו חוזר', () => {
    /* הוא היה עיוור מ-77% ומעלה · ראה את ההערה בראש הקובץ. */
    assert.ok(!/class="trend"/.test(stats),
      'גרף שמונת הסבבים חזר · כל אחוז מ-77 ומעלה מצייר את אותה עמודה');
    assert.ok(!/class="tbar"/.test(stats), 'עמודות הגרף חזרו');
  });

  test('⛔ ציון הסבב האחרון אינו חוזר', () => {
    assert.ok(!/\$\{last\.correct\}\/\$\{last\.total\}/.test(stats),
      'כרטיס "16/16 נכונים" חזר · ציון של עבודה שנגמרה אינו פעולה');
    assert.ok(!/▲|▼/.test(stats), 'חץ ההשוואה חזר · הוא השווה סוגי סבבים שונים');
  });

  test('⛔ "ידעת מיד" אינו חוזר', () => {
    /* מונה מילים שמעולם לא טעית בהן, כלומר גדל כשלא עושים את העבודה הקשה. */
    assert.ok(!/ידעת מיד/.test(stats), '"ידעת מיד" חזר למסך');
  });

  test('המסך פותח במה שנותר לעשות', () => {
    assert.match(stats, /class="section-t">מה עכשיו</, 'הכותרת "מה עכשיו" נעלמה');
    assert.match(stats, /class="nx-line"/, 'שורת המצב נעלמה');
    assert.match(stats, /classify\(scope\)/, 'המסך אינו נשען עוד על classify');
    assert.match(stats, /examDays\(\)/, 'ספירת הימים למבחן נעלמה');
    assert.match(stats, /id="drillFresh"/, 'הכפתור שמתחיל מילים שטרם תורגלו נעלם');
  });
});

describe('הרשימה · ציר אחד, ומידע שאפשר לפעול לפיו', () => {

  test('רשימה ולא ענן', () => {
    assert.ok(!/class="cloud"/.test(stats), 'ענן המילים חזר · חגי ביקש רשימה');
    assert.match(stats, /class="wlist"/, 'הרשימה נעלמה');
  });

  test('⛔ המיון והמספר המוצג הם אותו נתון', () => {
    /* זה הליקוי שעשה את המסך "לא מובן": הגודל נגזר מ-wrong−first והמספר היה
       wrong, ולכן המילה הגדולה נשאה מספר קטן יותר מהקטנה. */
    assert.ok(!/score\(w\)/.test(stats.slice(stats.indexOf('const missed'))),
      'המיון חזר להישען על score · הוא אינו המספר שמוצג');
    assert.match(stats, /wrong\)\s*,\s*wb\s*=\s*int0\(stats\.words\[K\(b\.term\)\]\)?\.?wrong|wb-wa/,
      'הרשימה אינה ממוינת לפי מספר הטעויות שהיא מציגה');
  });

  test('⛔ המשקל אינו נושא מידע · Heebo נחתך ב-700', () => {
    const face = html.match(/@font-face\{font-family:'Heebo'[\s\S]{0,200}?\}/);
    assert.ok(face, 'ה-@font-face של Heebo נעלם');
    assert.match(face[0], /font-weight:400 700/,
      'טווח המשקלים של Heebo השתנה · אם הוא כולל 800 אפשר לשקול משקל כערוץ מידע');
    const row = html.match(/\.ww b\{[^}]*\}/);
    assert.ok(row && /Frank Ruhl Libre/.test(row[0]),
      'שם המילה ברשימה אינו ב-Frank Ruhl Libre · Heebo אינו נושא את הטווח');
  });

  test('לחיצה על שורה פותחת פירוש · tooltip אינו נגיש בטלפון', () => {
    assert.match(stats, /class="wmean"/, 'שורת הפירוש נעלמה');
    assert.match(stats, /aria-expanded/, 'מצב הפתיחה אינו מוכרז לקורא מסך');
    assert.ok(!/title="נראתה/.test(stats),
      'המונים חזרו ל-tooltip · הם בלתי נגישים במסך מגע');
  });

  test('⭐ "לא תרגלת N ימים" · עברית תקינה למספר', () => {
    /* last יושב בכל רשומה מאז ומעולם ושימש רק למיון. אותה משמעת של /HEB §5
       שכותבת "יומיים" ו"מחר" במקום מספר. */
    const ctx = loadApp({ lang: 'he', bank: false });
    assert.match(stats, /const sinceText/, 'הניסוח לפי ימים נעלם');
    assert.match(stats, /לא תרגלת מאתמול/, 'המקרה של יום אחד אינו מטופל · "1 ימים" אינו עברית');
    assert.match(stats, /לא תרגלת יומיים/, 'המקרה של יומיים אינו מטופל');
    assert.ok(!/לא ראית/.test(stats),
      '"ראית" הוא מילה נרדפת למונח קיים · הלקסיקון אומר "תרגלת"');
    assert.ok(ctx);
  });

  test('מידת נגיעה · השורה עוברת את 44', () => {
    const row = html.match(/\.wrow\{[^}]*\}/);
    assert.ok(row, '.wrow נעלמה');
    const m = row[0].match(/min-height:(\d+)px/);
    assert.ok(m && Number(m[1]) >= 48,
      'השורה קטנה מ-48px · הצ׳יפ הישן מדד 37.8 וזה היה מתחת לסף');
  });

  test('יש תגובת לחיצה · זה מה שהמסך היה חסר', () => {
    /* ⚠ הניסוח הראשון בדק `html.includes('.wrow:active')` ועבר גם אחרי שמחקתי
       את הכלל · כי אותו סלקטור מופיע **גם** בבלוק prefers-reduced-motion.
       שער שמחפש מחרוזת בכל הקובץ סופר את הסייג כאילו הוא הכלל. נמדד בשבירה
       מכוונת, ותוקן: בודקים את הכלל מחוץ לבלוק התנועה המופחתת. */
    const noRM = html.replace(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\}\}/g, ' ');
    assert.match(noRM, /\.wrow:active\{[^}]*transform:scale/,
      'לשורה אין מצב לחיצה מחוץ לסייג התנועה המופחתת');
    assert.match(noRM, /\.wmore:active\{[^}]*transform:scale/,
      'לכפתור "הצג עוד" אין מצב לחיצה');
    assert.match(html, /prefers-reduced-motion:reduce\)\{\s*\.wrow:active/,
      'אין סייג לתנועה מופחתת');
  });
});

describe('אין מקף ארוך בטקסט שהמסך מייצר', () => {
  test('כל המחרוזות נקיות', () => {
    /* ⚠ השער הכללי (tests/75) סורק מקור, ולכן `— ${esc(x)}` מוקף לטינית חומק
       ממנו. כאן נבדק הגוף של openStats במפורש. */
    assert.ok(!stats.includes('—'), 'מקף ארוך במסך הסטטיסטיקה · /HEB §3א');
  });
});
