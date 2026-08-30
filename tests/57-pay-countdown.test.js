'use strict';
/* שעון העצר לסיום התקופה החינמית.
 *
 * מה חגי ביקש (5.8.2026)
 * -----------------------
 * "שעון עצר באתר שסופר עד ה-01/09/2026, שיגרום לאנשים להרגיש לחץ לתרגל יותר, וגם
 * שיזכרו שעוד מעט הוא יהיה בתשלום."
 *
 * למה 1.9 ולא 30.8 · וזו לא בחירה שרירותית
 * ------------------------------------------
 * ב-5.8 יצא מייל ל-17 נרשמים, והסטורי שהועלה אומר: "פתוח וחינם עד ה-30.08". אם התשלום
 * מתחיל ב-1.9, אז 31.8 הוא יום שאיש לא יודע מה דינו. ההכרעה נעשתה לטובת מי שכבר קיבל
 * הבטחה: חינם עד סוף 31.8, תשלום מ-1.9. כך ההבטחה שנשלחה נשארת נכונה, ואפילו בעודף יום.
 * PAY_FROM הוא הערך היחיד שמחזיק את ההחלטה הזאת.
 *
 * שני כשלים שקטים שהבדיקה הזאת קיימת בשבילם
 * -------------------------------------------
 * 1. "1 ימים" אינו עברית (HEB §5). היום האחרון, יומיים והיום עצמו מקבלים ניסוח משלהם.
 * 2. כשהתאריך עובר · הפס נעלם. "נשארו 3- ימים" הוא בדיוק המשפט שגורם למישהו להפסיק
 *    להאמין לכל שאר המספרים על המסך. זה הכשל שמגיע מעצמו ביום שאחרי, בלי ששום דבר
 *    בקוד השתנה, ולכן הוא נבדק ולא נבדק בעין.
 *
 * וגם: ההשוואה היא בין תאריכים ולא בין רגעים. בלי setHours(0) המספר היה יורד באמצע
 * היום · "נשארו 5 ימים" בבוקר ו-4 אחרי הצהריים, בלי שקרה כלום.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const fn = () => {
  const at = app.indexOf('function renderPayCountdown');
  assert.ok(at > 0, 'renderPayCountdown נעלמה');
  return app.slice(at, at + 1100);
};

/* מרים את כלל הניסוח בלבד, בלי ה-DOM, כדי להריץ אותו על כל ערך אפשרי. */
function phraseFor(days) {
  const body = fn();
  /* שרשרת התנאים משתרעת על כמה שורות, ולכן החילוץ הוא מ-"const head" ועד השורה
     שאחריה (bar.innerHTML) ולא עד ה-';' הראשון. */
  const from = body.indexOf('const head');
  const to = body.indexOf('bar.innerHTML', from);
  assert.ok(from > 0 && to > from, 'לא נמצא כלל הניסוח');
  const expr = body.slice(from, to).replace(/^const head\s*=/, '').trim().replace(/;$/, '');
  return new Function('days', 'return ' + expr)(days);
}

describe('שעון העצר לתשלום', () => {

  test('PAY_FROM קיים כערך יחיד בקוד', () => {
    /* התאריך המדויק נדחה מ-1.9 (ראה tests/98-pay-from-buffer.test.js לסיבה ולחיץ
       הנדרש) -- הבדיקה כאן מוודאת רק שהוא לא פוזר על פני הקוד לכמה מקומות.
       assert.match לבדו אינו מספיק: הוא מסתפק במופע אחד ואינו סופר, ולכן הגדרה
       כפולה (const PAY_FROM='...' פעמיים) הייתה עוברת בשקט. סופרים לכן את כל
       ההגדרות במפורש ודורשים בדיוק אחת. הדפוס /const PAY_FROM=.../ תופס רק
       הגדרה, לא שימוש -- new Date(PAY_FROM+...) אינו מתחיל ב-"const PAY_FROM="
       ולכן לא נספר, וזה תקין. */
    const defs = app.match(/const PAY_FROM='\d{4}-\d{2}-\d{2}'/g) || [];
    assert.strictEqual(defs.length, 1,
      `PAY_FROM צריך להיות מוגדר פעם אחת בדיוק -- נמצאו ${defs.length} הגדרות`);
  });

  test('הפס קיים ב-HTML ומתחיל מוסתר', () => {
    const m = html.match(/<div class="paybar[^"]*"[^>]*id="payBar"[^>]*>/);
    assert.ok(m, 'אין #payBar');
    assert.match(m[0], /\bhidden\b/, 'הפס אינו מתחיל מוסתר -- הוא יהבהב לפני החישוב');
    assert.match(m[0], /role="status"/, 'אין role="status" -- קורא מסך לא יכריז על השינוי');
  });

  test('עברית תקינה לכל מספר', () => {
    assert.match(phraseFor(27), /<b>27<\/b> ימים עד המעבר לתשלום/);
    assert.strictEqual(phraseFor(2), 'עוד יומיים מתחיל התשלום');
    assert.strictEqual(phraseFor(1), 'מחר מתחיל התשלום');
    assert.strictEqual(phraseFor(0), 'היום מתחיל התשלום');
  });

  test('אף פעם לא "1 ימים" ולא "2 ימים"', () => {
    for (const d of [0, 1, 2]) {
      const s = phraseFor(d);
      assert.ok(!/\b1 ימים\b/.test(s) && !/\b2 ימים\b/.test(s),
        `ניסוח שבור עבור ${d}: "${s}"`);
    }
  });

  test('כשהתאריך עבר · הפס נעלם, ולא מציג מספר שלילי', () => {
    const body = fn();
    assert.match(body, /if\(days<0\)\{\s*bar\.classList\.add\('hidden'\)/,
      'אין יציאה על תאריך שעבר -- יוצג "נשארו 3- ימים"');
    assert.match(body, /bar\.innerHTML=''/,
      'התוכן אינו מנוקה -- טקסט ישן עלול להישאר בעץ הנגישות');
  });

  test('הספירה בין תאריכים, לא בין רגעים', () => {
    assert.match(fn(), /now\.setHours\(0,0,0,0\)/,
      'המספר יירד באמצע היום במקום בחצות');
  });

  /* ⛔ חגי, 30.8.2026, עם צילום של מסך הכניסה: «בדף הכניסה למי שלא רשום יש את
     הספירה הזאת היא לא רלוונטית תוריד אותה.»
     ⭐ הבדיקה הזאת מריצה את הפונקציה עצמה מול DOM מזויף · ולא מחפשת מחרוזת בקוד ·
     כי מה שנשבר כאן הוא התנהגות. והיא בודקת את **שני** הכיוונים: גידור שמכבה את
     הפס לכולם היה עובר בדיקה חד-כיוונית בשקט, ואיש לא היה רואה שהפס נעלם גם
     למי שמחובר. */
  const runRender = (user, days, barOn) => {
    const at = app.indexOf('function renderPayCountdown');
    const end = app.indexOf(String.fromCharCode(10) + '}', at);
    assert.ok(at > 0 && end > at, 'לא נמצאה renderPayCountdown');
    const src = app.slice(at, end + 2);
    const bar = {
      innerHTML: 'טקסט קודם',
      classList: { s: new Set(['hidden']),
        add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); },
        contains(c) { return this.s.has(c); } },
    };
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
    const pad = n => String(n).padStart(2, '0');
    const PAY_FROM = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    new Function('$', 'PAY_FROM', 'currentUser', 'PAY_BAR_ON',
      src + ';renderPayCountdown();')(sel => (sel === '#payBar' ? bar : null), PAY_FROM, user, barOn);
    return bar;
  };

  test('הפס כבוי · חגי ביקש להוריד אותו משני המצבים', () => {
    /* ⛔ 30.8.2026 · «תוריד אותה» ואז «שים לב שזה גם באתר כשאתה רשום». */
    const off = app.match(/const PAY_BAR_ON = (true|false);/);
    assert.ok(off, 'PAY_BAR_ON נעלם · אין יותר מתג אחד שמחזיק את ההחלטה');
    assert.strictEqual(off[1], 'false', 'הפס הודלק בלי החלטה חדשה של חגי');
    for (const user of [null, { id: 'u1' }]) {
      const bar = runRender(user, 32, false);
      assert.ok(bar.classList.contains('hidden'),
        `הפס מוצג ${user ? 'למחובר' : 'למי שאינו מחובר'} למרות שהמתג כבוי`);
      assert.strictEqual(bar.innerHTML, '', 'התוכן לא נוקה · טקסט ישן יישאר בעץ הנגישות');
    }
  });

  test('⛔ שן · כשהמתג יידלק, הפס יחזור למחובר בלבד', () => {
    /* ⭐ בלי הבדיקה הזאת «הכול מוסתר» היה עובר גם אם הפונקציה נשברה לגמרי,
       ואיש לא היה יודע שהחזרת המתג ל-true אינה מחזירה כלום. */
    const on = runRender({ id: 'u1' }, 32, true);
    assert.ok(!on.classList.contains('hidden'), 'המתג דלוק והפס עדיין מוסתר');
    assert.match(on.innerHTML, /<b>32<\/b> ימים עד המעבר לתשלום/);

    const out = runRender(null, 32, true);
    assert.ok(out.classList.contains('hidden'),
      'המתג דלוק והפס חזר גם למי שאינו רשום · זו הבקשה הראשונה של חגי');
  });

  test('renderWelcome מפעיל את הספירה', () => {
    const at = app.indexOf('function renderWelcome');
    assert.match(app.slice(at, at + 1600), /renderPayCountdown\(\)/,
      'renderWelcome אינו קורא ל-renderPayCountdown');
  });

  test('אין מקף ארוך בניסוח', () => {
    /* HEB §3א · חגי: "אסור מקפים ארוכים, זה סממן מזהה לAI". */
    for (const d of [27, 2, 1, 0])
      assert.ok(!phraseFor(d).includes('—'), `מקף ארוך בניסוח של ${d}`);
  });

  test('טקסט כהה על זהב בוהק, ולא לבן', () => {
    /* הגרסה הראשונה של הפס הייתה לבן על גרדיאנט זהב→טרהקוטה. נמדד יחס ניגודיות 2.62
       בקצה הזהב · מתחת לסף 4.5. זה בדיוק הלקח שכבר נלמד במייל התזכורת
       ("בוהק שאי אפשר לקרוא אינו בוהק"), ולכן הוא נשמר כאן כבדיקה ולא כזיכרון.
       הזוג הנוכחי, #3a2205 על #c9962f, נמדד 5.59 בקצה הגרוע. */
    const css = html.slice(html.indexOf('.paybar{'), html.indexOf('.install-cta{'));
    assert.ok(!/color:#fffdf8/.test(css), 'הטקסט חזר להיות לבן -- הניגודיות תיפול מתחת לסף');
    assert.match(css, /color:#3a2205/, 'צבע הטקסט הכהה נעלם');
  });

  test('מי שביקש פחות תנועה מקבל את הפס בלי אנימציה', () => {
    const css = html.slice(html.indexOf('.paybar{'), html.indexOf('.install-cta{'));
    assert.match(css, /prefers-reduced-motion: reduce/, 'אין כיבוד ל-prefers-reduced-motion');
    const at = css.indexOf('prefers-reduced-motion');
    assert.match(css.slice(at, at + 200), /animation:none/, 'האנימציות אינן מכובות');
  });

  test('הברק אינו נכנס לעץ הנגישות', () => {
    /* הפס נושא role="status"; אלמנט תוכן נוסף היה נקרא בקול. ::after אינו נקרא. */
    const css = html.slice(html.indexOf('.paybar{'), html.indexOf('.install-cta{'));
    assert.match(css, /\.paybar::after\{content:''/, 'הברק אינו ::after');
  });

  test('החישוב האמיתי מחזיר את המספר הנכון', () => {
    /* מריץ את נוסחת הימים עצמה מול תאריך ידוע. */
    const end = new Date('2026-09-01T00:00:00');
    const day = new Date('2026-08-05T23:59:00'); day.setHours(0, 0, 0, 0);
    assert.strictEqual(Math.round((end - day) / 864e5), 27, 'מ-5.8 ל-1.9 אינם 27 ימים');
    const last = new Date('2026-08-31T00:00:00'); last.setHours(0, 0, 0, 0);
    assert.strictEqual(Math.round((end - last) / 864e5), 1, '31.8 אינו "מחר"');
  });
});
