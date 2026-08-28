'use strict';
/* ניגודיות · הצבעים שנמדדו נופלים מתחת ל-WCAG AA לא יחזרו בשקט.
 *
 * מה שנמדד ב-26.8.2026, על האתר החי
 * ---------------------------------
 * ארבעה שורשים · 15 סלקטורים · כולם ניגודיות, אף אחד אינו שבירה. החמור:
 * `.s-exp h4` · 11.2px בזהב על שמנת, **2.62**. זה הכיתוב של שלושת חלקי ההסבר
 * במסך שאחרי תשובה · הטקסט שהלומד בא בשבילו.
 *
 * ⛔ למה השער מחשב יחסים ולא משווה מחרוזות
 * ----------------------------------------
 * שער שבודק «הצבע הוא #8a6512» עובר גם כשמישהו יחליף אותו ב-#c9962f מחר, כל עוד
 * הוא יעדכן את הבדיקה יחד איתו · וזה בדיוק מה שקורה בעריכה אחת. הבדיקה כאן
 * **מחשבת את היחס לפי WCAG 2.1** מול הרקע שנמדד בדפדפן, ולכן היא נופלת על כל
 * ערך שאינו עומד בתקן, גם ערך שאיש לא חשב עליו.
 *
 * ⚠ מה שהשער **אינו** יכול לדעת: על איזה רקע כל סלקטור יושב בפועל. הרקעים כאן
 * הם מה שנמדד בדפדפן על העמוד החי (ראה היוצא של הסשן), ואם מסך ישתנה כך שאלמנט
 * יעבור לרקע אחר · השער לא ידע. זו המגבלה, והיא נאמרת ולא נבלעת.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---- WCAG 2.1 relative luminance ---- */
const lum = hex => {
  const v = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const יחס = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** ערך אסימון מתוך ה-`:root` של index.html. */
function אסימון(שם) {
  const m = html.match(new RegExp('--' + שם + '\\s*:\\s*(#[0-9a-fA-F]{6})'));
  assert.ok(m, `האסימון --${שם} אינו בפלטה`);
  return m[1].toLowerCase();
}

/** גוף כלל CSS לפי הסלקטור המדויק שלו.
 *
 * ⛔ **העוגן נתפס בתחילת שורה בלבד.** ‏`indexOf('.ask-go{')` מצא קודם את
 * `.cheer-box .ask-go{margin-top:24px}` · כלל אחר לגמרי שאין בו גרדיאנט,
 * והשער האדים על קוד תקין. אותה מלכודת בדיוק הפילה גם את סקריפט ההחלפה.
 * כל סלקטור שהוא **סיומת** של סלקטור אחר נופל לזה.
 */
function כלל(sel) {
  /* ⚠ `m` כדגל ולא `(?m)` בתוך התבנית · תחביר הדגלים-בתוך-הביטוי הוא של פייתון,
     וב-JavaScript הוא `SyntaxError: Invalid group`. נמדד, 21 בדיקות קרסו. */
  const m = html.match(new RegExp('^\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{', 'm'));
  assert.ok(m, `הכלל ${sel} אינו בקובץ בתחילת שורה · השער הזה עיוור מעכשיו`);
  const i = m.index;
  const body = html.slice(i, html.indexOf('}', i));
  /* ⭐ שומר · כלל שנתפס בטעות הוא כמעט תמיד קצרצר («margin-top:24px»), ואז
     בדיקת «אין כאן --gold-ink» עוברת מהסיבה הלא נכונה. */
  assert.ok(body.includes(':'), `הכלל ${sel} נתפס ריק · העוגן תפס את הדבר הלא נכון`);
  return body;
}

/* הרקעים נמדדו בדפדפן על העמוד החי · לא הונחו. ראה ההערה בראש הקובץ. */
const CARD = '#fffdf8';        // --card
const PAPER = '#f6f1e7';       // --paper
const ROW = '#faf3e4';         // .m-row · גוון זהב rgba(201,150,47,.1) מעל הכרטיס
const AUTH = '#fcf7ee';        // מסך ההרשמה
const DEEP = '#efe7d6';        // --paper-deep

describe('הזהב ככתב', () => {

  test('--gold-ink עובר AA על שני הרקעים שהוא יושב עליהם', () => {
    const g = אסימון('gold-ink');
    /* ⭐ **שני** הרקעים, ולא רק הכרטיס. `.s-done .num` יושב על --paper, ושם ערך
       שעובר על הכרטיס בקושי עלול ליפול · זה נמדד: #956f23 מחזיר 4.51 על הכרטיס
       ורק 4.08 על הנייר, כלומר הוא היה משאיר סלקטור אחד נכשל. */
    assert.ok(יחס(g, CARD) >= 4.5, `--gold-ink על הכרטיס: ${יחס(g, CARD).toFixed(2)} < 4.5`);
    assert.ok(יחס(g, PAPER) >= 4.5, `--gold-ink על הנייר: ${יחס(g, PAPER).toFixed(2)} < 4.5`);
    assert.ok(יחס(g, ROW) >= 4.5, `--gold-ink על שורת הניהול: ${יחס(g, ROW).toFixed(2)} < 4.5`);
    assert.ok(יחס('#ffffff', g) >= 4.5,
      `לבן על --gold-ink כקצה גרדיאנט: ${יחס('#ffffff', g).toFixed(2)} < 4.5`);
  });

  /* ⛔ `--gold` עצמו נשאר כפי שהוא · הוא משמש גם כרקע וכמסגרת, ושם הוא תקין.
     שער שהיה מחייב אותו לעבור כטקסט היה שולח למישהו להכהות את כל הזהב באתר. */
  test('--gold עצמו לא הוכהה', () => {
    assert.strictEqual(אסימון('gold'), '#c9962f',
      '--gold שונה · הוא רקע ומסגרת במקומות רבים, והשינוי חורג ממה שנמדד');
  });

  const טקסט = ['.s-exp h4', '.s-done .num', '.ex-sent .ex-lbl', '.assoc label',
    '.m-row .u', '.m-head i', '.install-cta .ar'];
  for (const sel of טקסט) {
    test(`${sel} · צבע הטקסט הוא --gold-ink`, () => {
      const r = כלל(sel);
      assert.ok(/color:var\(--gold-ink\)/.test(r), `${sel} אינו משתמש ב---gold-ink`);
      assert.ok(!/color:var\(--gold\)/.test(r), `${sel} חזר ל---gold · 2.62 מול הרקע`);
    });
  }

  /* ⚠ ארבעת האחרונים נוספו ב-26.8 אחרי שהתגלה שהביקורת פספסה אותם · היא מדדה
     מסכים שביקרה בהם, והם לא הופיעו באף אחד. אותה תקלה בדיוק. */
  const כפתורים = ['.seg button.active', '.ask-opts button.active',
    '.wtp-prices button.active', '.fb-kinds button.active',
    '.size-custom button', '.ask-go', '.upd-bar', '.inst-steps li span'];
  for (const sel of כפתורים) {
    test(`${sel} · קצה הגרדיאנט הוא --gold-ink`, () => {
      const r = כלל(sel);
      assert.ok(/linear-gradient\(180deg,var\(--gold-ink\),var\(--accent\)\)/.test(r),
        `${sel} · קצה הגרדיאנט חזר ל---gold · הטקסט הלבן יורד ל-2.66 בראש הכפתור`);
    });
  }

  /* ⛔ והכיוון ההפוך · קישוט **בלי טקסט** חייב להישאר בזהב המלא. שער שדורש
     `--gold-ink` בכל גרדיאנט היה שולח מישהו להכהות גם אותם, וזה שינוי עיצוב
     שאיש לא ביקש ושלא נמדד בו שום כשל. */
  const קישוט = ['.dots i.on', '.tbar i', '.lp-week i.on', '.feat::before'];
  for (const sel of קישוט) {
    test(`${sel} · קישוט בלי טקסט · נשאר בזהב`, () => {
      const r = כלל(sel);
      assert.ok(!/--gold-ink/.test(r),
        `${sel} הוכהה · אין בו טקסט, ולכן אין מה לתקן בו`);
    });
  }
});

describe('תוויות הטופס ומסך ההסבר', () => {

  test('תוויות ההרשמה משתמשות ב---ink-soft, והוא עובר', () => {
    for (const sel of ['.au-field span', '.au-link']) {
      const r = כלל(sel);
      assert.ok(/color:var\(--ink-soft\)/.test(r), `${sel} אינו משתמש ב---ink-soft`);
      assert.ok(!/#8d8274/.test(r), `${sel} חזר ל-#8d8274 · 3.34`);
    }
    const s = אסימון('ink-soft');
    assert.ok(יחס(s, AUTH) >= 4.5, `--ink-soft על מסך ההרשמה: ${יחס(s, AUTH).toFixed(2)} < 4.5`);
  });

  /* ⛔ ערך מפורש ולא האסימון: --green ו---accent משמשים גם כרקע, ושם הם תקינים. */
  test('הירוק והאדום במסך ההסבר עוברים על הבז׳', () => {
    for (const [sel, שם] of [['.s-why .vd.ok', 'ok'], ['.s-why .vd.bad', 'bad']]) {
      const r = כלל(sel);
      const m = r.match(/color:(#[0-9a-fA-F]{6})/);
      assert.ok(m, `${sel} אינו נושא ערך צבע מפורש · אסימון משותף יגרור מקומות שלא נמדדו`);
      const v = יחס(m[1], DEEP);
      assert.ok(v >= 4.5, `${sel} (${שם}) · ${v.toFixed(2)} < 4.5 מול --paper-deep`);
    }
  });
});
