'use strict';
/* מאגר שנטען חלקית — ומחיקה שאי אפשר לבטל.
 *
 * הרקע
 * ------
 * `pruneOrphans` מוחקת כל רשומה שאין לה מילה במאגר. ההערה שמעל השומר בקוד
 * מספרת שזה כבר קרה: מאגר ריק נקרא כ"כל מילה של הלומד היא יתומה", והכול נמחק
 * לצמיתות ונכתב לדיסק. השומר שנוסף אז הוא **רצפה מוחלטת**: `live.size < 50`.
 *
 * הפער
 * -----
 * רצפה מוחלטת מגנה מפני "ריק", לא מפני "חצי". מאגר שנטען עם 200 מילים מתוך
 * 3,000 עובר את הרצפה בנוחות, וכל שאר הרשומות נמחקות — ואז `saveStats()`
 * מפעילה `queueRemoteSync()`, כלומר האובדן נדחף גם לענן. אין ממנו חזרה.
 *
 * ⚠ הסתייגות כנה על הסבירות: קבצי הדאטה הם השמה אחת גדולה, ולכן קובץ שנחתך
 * באמצע הוא SyntaxError — הגלובל לא מוגדר כלל, המאגר יוצא ריק, והרצפה הקיימת
 * תופסת אותו. המצב שהבדיקות כאן חוסמות הוא הנדיר יותר: מאגר שנבנה חלקי אך
 * תקין תחבירית. הסיבה לחסום אותו בכל זאת היא יחס העלות — התיקון הוא תנאי אחד,
 * והנזק שהוא מונע הוא אובדן התקדמות בלתי הפיך שכבר קרה פעם אחת.
 *
 * הכלל שנבחר: יחסי ולא מוחלט. אם המחיקה תמחק את **רוב** רשומות הלומד, זו אינה
 * תחזוקה אלא תאונה. נדרש גם מינימום רשומות, כדי שהכלל לא יתפוס מצב אמיתי שבו
 * ללומד יש שתי רשומות ואחת מהן באמת יתומה (ראו tests/06). */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, banks, appSource } = require('./_harness/sandbox.js');

const src = appSource();

/* מפתחות אמיתיים מיחידות שאינן היחידה ששורדת, כדי שכולם ייחשבו יתומים. */
function keysOutside(ctx, keepUnit, n) {
  const he = banks().he, out = [];
  for (const u of Object.keys(he)) {
    if (u === keepUnit) continue;
    for (const p of he[u]) { out.push(ctx.K(p[0])); if (out.length >= n) return out; }
  }
  return out;
}

describe('pruneOrphans — מאגר חלקי אינו רשות למחוק', () => {
  test('מאגר שנטען חלקית אינו מוחק את רשומות הלומד', () => {
    const ctx = loadApp();
    const he = banks().he;
    const keepUnit = Object.keys(he)[0];
    /* היחידה ששורדת מספיק גדולה כדי לעבור את הרצפה המוחלטת (50) — כלומר
       הבדיקה מודדת את הכלל היחסי ולא את הרצפה הישנה. */
    const survivors = he[keepUnit].length;
    assert.ok(survivors >= 50,
      `יחידה ${keepUnit} מכילה ${survivors} מילים — קטנה מהרצפה, הבדיקה לא תמדוד את הכלל הנכון`);

    const doomed = keysOutside(ctx, keepUnit, 30);
    assert.strictEqual(doomed.length, 30, 'לא נאספו מספיק מפתחות אמיתיים');
    ctx.stats.words = {};
    for (const k of doomed) ctx.stats.words[k] = { seen: 3, correct: 1 };
    ctx.assoc = {};
    for (const k of doomed) ctx.assoc[k] = 'אסוציאציה';

    // המאגר "נטען חלקית": רק יחידה אחת הגיעה.
    ctx.window.UNIT_DATA = { [keepUnit]: he[keepUnit] };

    ctx.pruneOrphans();

    const left = Object.keys(ctx.stats.words).length;
    assert.strictEqual(left, 30,
      `מאגר חלקי מחק ${30 - left} מתוך 30 רשומות — וזו מחיקה שנדחפת גם לענן`);
    assert.strictEqual(Object.keys(ctx.assoc).length, 30,
      'האסוציאציות נמחקו על סמך מאגר חלקי');
  });

  test('הסירוב אינו שומר את המחיקה לדיסק', () => {
    const ctx = loadApp();
    const he = banks().he;
    const keepUnit = Object.keys(he)[0];
    const doomed = keysOutside(ctx, keepUnit, 30);
    ctx.stats.words = {};
    for (const k of doomed) ctx.stats.words[k] = { seen: 1 };
    ctx.window.UNIT_DATA = { [keepUnit]: he[keepUnit] };
    const before = ctx.__saved.stats;
    ctx.pruneOrphans();
    assert.strictEqual(ctx.__saved.stats, before,
      'נשמר לדיסק אף שלא נמחק דבר — saveStats גורר queueRemoteSync, כלומר כתיבה לענן');
  });

  test('תחזוקה אמיתית עדיין עובדת — יתום בודד נמחק', () => {
    /* הכלל היחסי לא נועד לבטל את הניקיון, רק את המחיקה ההמונית. אם זה נשבר,
       יתומים יצטברו לנצח וזו הבעיה שהפונקציה נכתבה לפתור. */
    const ctx = loadApp();
    const he = banks().he;
    const real = [];
    for (const u of Object.keys(he)) { for (const p of he[u]) { real.push(ctx.K(p[0])); if (real.length >= 40) break; } if (real.length >= 40) break; }
    ctx.stats.words = {};
    for (const k of real) ctx.stats.words[k] = { seen: 2 };
    ctx.stats.words['מילה-שאיננה-במאגר'] = { seen: 7 };
    ctx.pruneOrphans();
    assert.ok(!ctx.stats.words['מילה-שאיננה-במאגר'],
      'היתום הבודד שרד — הכלל היחסי חוסם יותר מדי');
    assert.strictEqual(Object.keys(ctx.stats.words).length, 40,
      'מילים אמיתיות נמחקו');
  });
});

describe('updateSafeNow — מסך התוצאות אינו מסך בטוח', () => {
  test("'results' ברשימת המסכים העסוקים", () => {
    /* ההערה מעל הפונקציה כותבת במפורש: "deliberately NOT applied automatically
       when the round ends, because that moment is the results screen and
       reloading would erase what they are reading."
       אבל 'results' לא היה ברשימה, ואחרי commitSession גם התנאי השני כבר כבוי —
       כלומר הפונקציה החזירה "בטוח" בדיוק במסך שההערה מגינה עליו. */
    const m = /const busy=\[([^\]]+)\]/.exec(src);
    assert.ok(m, 'לא נמצאה רשימת busy ב-updateSafeNow');
    const busy = m[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    for (const scr of ['quiz', 'exam', 'level', 'sent', 'results'])
      assert.ok(busy.includes(scr),
        `'${scr}' חסר מ-busy — רענון אוטומטי ימחק את מה שעל המסך`);
  });
});

describe('התחברות — כשל אינו יכול להשאיר "מתחבר…" על המסך', () => {
  test('מסלול ההתחברות תופס חריגה ולא רק משחרר את הכפתור', () => {
    /* היה try{…} finally{btn.disabled=false}. בלי catch, כל זריקה — רשת
       שנופלת, או store.js שלא נטען — משאירה את ההודעה "מתחבר…" על המסך
       לנצח. §10 של כללי הניסוח בפרויקט: הודעת שגיאה חייבת לומר מה עכשיו. */
    const at = src.indexOf("$('#authForm').addEventListener('submit'");
    assert.ok(at > 0, "לא נמצא מטפל השליחה של #authForm");
    const body = src.slice(at, src.indexOf('\n});', at));
    assert.ok(/\}\s*catch\s*\(/.test(body),
      'למסלול ההתחברות אין catch — זריקה משאירה את המשתמש מול "מתחבר…" בלי הסבר');
  });
});
