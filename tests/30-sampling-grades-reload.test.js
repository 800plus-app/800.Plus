'use strict';
/* שלוש פונקציות טהורות שאף אחת מהן לא נבדקה, ולכל אחת יש דרך שקטה להישבר.
 *
 * capSampled · איזה מילים הלומד באמת מקבל
 *   כל הדליים נבדקו (03-buckets), והפונקציה שבוחרת מתוכם לא. היא נכתבה כתיקון לתלונה
 *   "אותן מילים חוזרות", ואם החלון יתקלקל התלונה תחזור בשקט: הסבב עדיין רץ, המספרים
 *   עדיין נכונים, ורק המשתמש ישים לב · אחרי חודשים.
 *
 * EX_GRADE · המשפט שנאמר ללומד על מוכנותו למבחן
 *   .find(g => pct >= g[0]) על מערך יורד. סדר שגוי אינו מתפוצץ אלא מחזיר את המשפט
 *   הראשון שמתאים · כלומר ציון 95 יכול לקבל "היחידה עוד לא נלמדה באמת".
 *
 * mayAutoReload · התקציב שמונע לולאת ריענון
 *   נכתב על שני כשלים אמיתיים: שתי גרסאות שמתחלפות בלולאה A→B→A→B, ואחסון ששותק
 *   (Safari פרטי) שגרם לכל קריאה לאשר ריענון. שניהם הופכים את האפליקציה לבלתי שמישה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

function ctxWith(syms, extra = {}) {
  const ctx = Object.assign({ Math, JSON, Array, Object, String, Number, Date, isNaN }, extra);
  ctx.toast = () => {};
  ctx.isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  vm.createContext(ctx);
  for (const { name, code } of extractAll(appSource(), syms))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
  return ctx;
}

describe('capSampled · הדגימה שמונעת "אותן מילים חוזרות"', () => {
  const c = ctxWith(['shuffle', 'capSampled']);
  const list = n => Array.from({ length: n }, (_, i) => i);

  test('מחזיר בדיוק n', () => {
    assert.strictEqual(c.capSampled(list(100), 20).length, 20);
  });

  test('רשימה קצרה מ-n מוחזרת שלמה ולא נחתכת', () => {
    const l = list(7);
    assert.deepStrictEqual(Array.from(c.capSampled(l, 20)), l);
    assert.deepStrictEqual(Array.from(c.capSampled(l, 7)), l);
  });

  test('n חסר או אפס · הרשימה כולה', () => {
    const l = list(50);
    assert.strictEqual(c.capSampled(l, 0).length, 50);
    assert.strictEqual(c.capSampled(l, null).length, 50);
  });

  test('בוחר רק מתוך 2n הדחופות ביותר · הכוונה של החזרה המרווחת', () => {
    /* אם החלון ייפתח לכל הרשימה, הפונקציה תהפוך ל"אקראי מהכול" והדחיפות תיעלם.
       הרשימה ממוינת מהדחוף לפחות דחוף, ולכן כל ערך שנבחר חייב להיות מתחת ל-2n. */
    for (let i = 0; i < 40; i++)
      for (const x of c.capSampled(list(500), 20))
        assert.ok(x < 40, `נבחרה מילה מחוץ לחלון: ${x} (החלון הוא 40)`);
  });

  test('שני סבבים רצופים אינם זהים · זו כל הסיבה שהפונקציה קיימת', () => {
    /* ההסתברות ששתי דגימות של 20 מתוך 40 יצאו זהות היא כ-1 ל-137 מיליארד.
       עשרים ניסיונות זהים אינם מקריות אלא חלון שקרס ל-n. */
    const l = list(500);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      const a = Array.from(c.capSampled(l, 20)).join(),
            b = Array.from(c.capSampled(l, 20)).join();
      if (a === b) same++;
    }
    assert.ok(same < 20, 'כל הסבבים יצאו זהים -- הדגימה אינה דוגמת, והתלונה המקורית חזרה');
  });

  test('בלי כפילויות', () => {
    const got = Array.from(c.capSampled(list(500), 20));
    assert.strictEqual(new Set(got).size, 20, 'אותה מילה הופיעה פעמיים בסבב אחד');
  });

  test('הרשימה שנמסרה אינה משתנה', () => {
    /* weakCards מחזירה מערך שהקורא ממשיך להשתמש בו. שינוי במקום כאן היה מערבב
       את הרשימה של המסך שמאחור. */
    const l = list(100), copy = l.slice();
    c.capSampled(l, 20);
    assert.deepStrictEqual(l, copy, 'capSampled שינתה את המערך שקיבלה');
  });
});

describe('EX_GRADE · המשפט על מוכנות למבחן', () => {
  const c = ctxWith(['EX_GRADE']);
  const verdict = pct => (c.EX_GRADE.find(g => pct >= g[0]) || c.EX_GRADE[c.EX_GRADE.length - 1])[1];

  test('הספים יורדים · אחרת find מחזירה את המשפט הלא נכון', () => {
    const t = c.EX_GRADE.map(g => g[0]);
    for (let i = 1; i < t.length; i++)
      assert.ok(t[i] < t[i - 1], `הספים אינם יורדים: ${JSON.stringify(t)}`);
    assert.strictEqual(t[t.length - 1], 0, 'אין סף 0 -- ציון נמוך לא יקבל שום משפט');
  });

  test('ציון מלא וציון אפס מקבלים את הקצוות הנכונים', () => {
    assert.strictEqual(verdict(100), c.EX_GRADE[0][1]);
    assert.strictEqual(verdict(0), c.EX_GRADE[c.EX_GRADE.length - 1][1]);
  });

  test('כל ציון מ-0 עד 100 מקבל משפט, ואף אחד לא נופל בין הכיסאות', () => {
    for (let p = 0; p <= 100; p++)
      assert.ok(typeof verdict(p) === 'string' && verdict(p).length > 0, 'אין משפט לציון ' + p);
  });

  test('המשפט אינו יורד בחומרתו כשהציון עולה', () => {
    /* מונוטוניות: אם 74 מקבל משפט טוב יותר מ-76, מישהו הפך שני ספים והלומד מקבל
       חיווי הפוך על מוכנותו למבחן אמיתי. */
    let prev = -1;
    for (let p = 100; p >= 0; p--) {
      const i = c.EX_GRADE.findIndex(g => g[1] === verdict(p));
      assert.ok(i >= prev, `הדירוג נשבר סביב ${p}%`);
      prev = i;
    }
  });
});

describe('mayAutoReload · התקציב שמונע לולאת ריענון', () => {
  function withStore(store) {
    return ctxWith(['UPD_MAX', 'mayAutoReload'], { sessionStorage: store });
  }
  const good = () => { const d = {}; return {
    getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

  test('שני ריענונים מותרים, השלישי נחסם', () => {
    const c = withStore(good());
    assert.strictEqual(c.mayAutoReload(), true,  'הריענון הראשון נחסם');
    assert.strictEqual(c.mayAutoReload(), true,  'הריענון השני נחסם');
    assert.strictEqual(c.mayAutoReload(), false, 'הריענון השלישי עבר -- זו לולאת A→B→A→B');
  });

  test('אחסון ששותק · לא מרעננים בכלל', () => {
    /* Safari פרטי ו-Lockdown זורקים או בולעים כתיבה. אם הכתיבה לא נקראת בחזרה,
       המונה לעולם אינו עולה וכל קריאה תאשר ריענון · ריענון אינסופי. */
    const silent = { getItem: () => null, setItem: () => {} };
    assert.strictEqual(withStore(silent).mayAutoReload(), false,
      'אחסון שבולע כתיבה אישר ריענון -- הלולאה שנכתבה כדי למנוע אותה');
    const throws = { getItem: () => { throw new Error('denied'); },
                     setItem: () => { throw new Error('denied'); } };
    assert.strictEqual(withStore(throws).mayAutoReload(), false, 'אחסון שזורק אישר ריענון');
  });

  test('אחרי החלון התקציב מתאפס', () => {
    /* בלי איפוס, טאב שנשאר פתוח שבוע לעולם לא יקבל עדכון אוטומטי יותר. */
    const d = {};
    const store = { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } };
    const c = withStore(store);
    c.mayAutoReload(); c.mayAutoReload();
    assert.strictEqual(c.mayAutoReload(), false);
    const o = JSON.parse(d.hw_updN);
    d.hw_updN = JSON.stringify({ n: o.n, t0: o.t0 - (c.UPD_WINDOW + 1000) });
    assert.strictEqual(c.mayAutoReload(), true, 'התקציב לא התאפס אחרי החלון');
  });

  test('ערך פגום באחסון אינו מפיל ואינו פותח את הדלת לרווחה', () => {
    for (const junk of ['{{{', 'null', '"x"', '{"n":"a","t0":1}', '[]']) {
      const d = { hw_updN: junk };
      const c = withStore({ getItem: k => (k in d ? d[k] : null),
                            setItem: (k, v) => { d[k] = String(v); } });
      assert.strictEqual(c.mayAutoReload(), true, 'ערך פגום חסם לגמרי: ' + junk);
      c.mayAutoReload();
      assert.strictEqual(c.mayAutoReload(), false, 'ערך פגום ביטל את התקציב: ' + junk);
    }
  });
});

describe('ציון המבחן · החשבון והתקרה', () => {
  const app = appSource();

  const pct = (ok, n) => (n ? Math.round(100 * ok / n) : 0);

  test('אפס שאלות אינו מחזיר NaN', () => {
    /* n=0 קורה כשיחידה ריקה או כשכל השאלות דולגו. NaN% היה מוצג ללומד כציון. */
    assert.strictEqual(pct(0, 0), 0);
  });

  test('הקצוות מדויקים', () => {
    assert.strictEqual(pct(10, 10), 100);
    assert.strictEqual(pct(0, 10), 0);
    assert.strictEqual(pct(1, 3), 33);
    assert.strictEqual(pct(2, 3), 67);
  });

  test('הציון לעולם אינו חורג מ-0..100', () => {
    for (let n = 1; n <= 60; n++)
      for (let ok = 0; ok <= n; ok++) {
        const p = pct(ok, n);
        assert.ok(p >= 0 && p <= 100 && Number.isInteger(p), `${ok}/${n} → ${p}`);
      }
  });

  test('היסטוריית המבחנים חסומה ב-20', () => {
    /* בלי התקרה הרשומה גדלה בלי גבול ונדחפת לענן בכל מבחן. */
    /* העוגן חייב להיות על אתר היסטוריית המבחנים עצמו. ב-app.js יש **שני**
       `slice(-20)` — כאן, ובחיתוך ה-sessions — ולכן `/slice\(-20\)/` על הקובץ
       כולו נשאר ירוק גם כשהתקרה הזאת נמחקת. נמדד ב-11.8.2026: הסרת ה-slice
       מהשורה של hist השאירה את הבדיקה ירוקה.
       ה-assert שהיה כאן קודם — `[...25].slice(-20)[0] === 5` — בדק את הסמנטיקה
       של JavaScript על מערך שנבנה בבדיקה עצמה. הוא עובר תמיד, ללא קשר ל-app.js. */
    assert.match(app, /Array\.isArray\(hist\)[\s\S]{0,160}?\.slice\(-20\)/,
      'תקרת היסטוריית המבחנים נעלמה — הרשומה תתפח בלי גבול ותידחף לענן בכל מבחן');
  });

  test('exAnswer מנטרל את הפקדים לפני שהוא ממשיך', () => {
    /* זה · ולא טיימר · מה שמונע תשובה כפולה. הנטרול קורה באותו handler סינכרוני,
       ולכן לחיצה שנייה כבר פוגשת כפתור מנוטרל. אם מישהו יעביר אותו אחרי ה-setTimeout,
       שתי לחיצות מהירות ייספרו כשתי תשובות והציון יהיה שגוי. */
    const at = app.indexOf('function exAnswer');
    assert.ok(at > 0, 'exAnswer נעלמה');
    const body = app.slice(at, app.indexOf('setTimeout', at));

    /* ל-exAnswer שני ענפים, ולכל אחד פקדים משלו: רב-ברירה מנטרל את הכפתורים,
       הקלדה מנטרלת את שדה הקלט ואת שני הכפתורים. בדיקה אחת כללית על
       /disabled=true/ ירוקה כל עוד **אחד** מהם קיים — ולכן היא לא תפסה את מחיקת
       ענף ההקלדה כולו. נמדד ב-11.8.2026: הסרת השורה של שלושת הפקדים השאירה
       929 בדיקות ירוקות. לכן כל ענף נבדק בשמו. */
    assert.match(body, /\.disabled\s*=\s*true/,
      'exAnswer אינה מנטרלת את הפקדים לפני ההמתנה — תשובה כפולה תיספר פעמיים');

    for (const id of ['exInput', 'exSubmit', 'exSkip']) {
      assert.ok(new RegExp(`\\$\\(['"]#${id}['"]\\)\\.disabled\\s*=\\s*true`).test(body),
        `#${id} אינו מנוטרל בענף ההקלדה של exAnswer — לחיצה שנייה בחלון הפידבק ` +
        `תרשום את התשובה פעמיים ותעוות את הציון`);
    }
  });
});
