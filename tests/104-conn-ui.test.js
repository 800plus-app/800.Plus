'use strict';
/* יחידת מילות הקישור · שלוש הנקודות שבהן החיווט לאפליקציה נשבר בשקט.
 *
 * למה דווקא שלוש אלה
 * -------------------
 * שלושתן חולקות תכונה אחת: כשהן שבורות **אין שגיאה**. המסך עולה, הסבב רץ,
 * הקונסולה נקייה, והלומד מקבל מסך שנראה תקין ומלמד אותו דבר שגוי או שאינו
 * נותן לו להיכנס בכלל. כל אחת מהן כבר קרתה בפרויקט הזה, ביחידת המשפטים:
 *
 *   1. **הגידור לשפה.** המקטע בבית מגודר `LANG==='he'` · תמונת ראי של הגידור
 *      הקיים על המשפטים. גידור שנשמט אינו זורק דבר: לומד אנגלית פשוט מקבל
 *      כפתור לתרגול בשפה שהוא לא פתח.
 *   2. **איפוס ההבטחה בכשל טעינה.** ‏`loadConnData` שומרת הבטחה אחת כדי שלא
 *      תיטען פעמיים. אם היא אינה מתאפסת ב-`onerror`, נסיון אחד בלי רשת נועל
 *      את היחידה **לנצח** · כל נסיון הבא מקבל את ההבטחה הכבויה ומחזיר false
 *      גם אחרי שהרשת חזרה. ההערה ב-`loadSentData` מתעדת בדיוק את זה.
 *   3. **הערבוב של ארבעת המערכים המקבילים.** כל פריט נשמר עם `a:0`, והמגיש
 *      חייב לערבב. ‏`o`, `g`, `r` ו-`d` מקבילים איבר-מול-איבר, וערבוב של אחד
 *      בלי השלושה האחרים מצמיד לכל מילת קישור את הפירוש, הנימוק והכיוון של
 *      מילה אחרת. ⚠ ביחידת המשפטים זה קרה עם שלושה מערכים, והכשל היה **שקט**.
 *
 * ⛔ הבדיקות כאן נראו נופלות על שלושת הפגמים לפני שנראו עוברות. שער שלא נראה
 * אדום אינו שער.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadWithStorage } = require('./_harness/fakeStorage.js');
const { ROOT } = require('./_harness/sandbox.js');

const SYMS = [
  'isObj', 'SUF', 'KEY', 'LS', 'shedStorage', 'showStorageBar', 'hideStorageBar',
  'shuffle',
  'CONN_LENS', 'CONN_LEN_KEY', 'CONN_PROG',
  'connOn', 'connRoundLen', 'saneConnRec', 'connProg',
  'connBank', 'connItems', 'connItemOk', 'connShuffled', 'connSummary',
  'sentBuildV', 'connLoading', 'loadConnData',
];

/* ⚠ `Promise` אינו בהקשר של המרים המשותף · הוא נבנה עבור קוד שאינו אסינכרוני.
   בלעדיו `loadConnData` נופלת ב-"Promise is not defined", וזה נראה כמו באג
   באפליקציה בזמן שהוא חוסר בהקשר. */
function load(opts = {}) {
  const c = loadWithStorage(SYMS, opts);
  c.Promise = Promise;
  return c;
}

/* ‏document מזויף שמספיק בדיוק ל-`loadConnData` ול-`sentBuildV`, ולא יותר:
   רשימת תגי סקריפט לשליפת מספר הבנייה, ו-head שאוסף את מה שנתלה עליו · כך
   אפשר לספור **כמה** תגים נוצרו, וזה מה שמבדיל הבטחה שאופסה מהבטחה כבויה. */
function fakeDoc() {
  const created = [];
  return {
    created,
    scripts: [{ src: './app.js?v=228' }],
    head: { appendChild(e) { created.push(e); } },
    body: { appendChild() {} },
    createElement() { return { src: '', onload: null, onerror: null }; },
    getElementById() { return null; },
    querySelector() { return null; },
    documentElement: {},
  };
}

/* קובץ הייצור של הצינור, נקרא ולא משוכפל. ⛔ בדיקה שממציאה פריט משלה מוכיחה
   שהקוד עובד על פריט מומצא · הפריטים האמיתיים הם מה שיוגש. */
function realBank() {
  const w = {};
  const f = path.join(ROOT, 'connectives-he', 'data-conn-he.js');
  vm.runInNewContext(fs.readFileSync(f, 'utf8'), { window: w });
  return w.CONN_HE || {};
}
const BANK = realBank();
const ITEMS = Object.values(BANK).filter(Array.isArray).flat();

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ═════════ בקרה חיובית ═════════ */
describe('קובץ הנתונים אכן נקרא', () => {
  test('יש פריטים לבדוק עליהם', () => {
    assert.ok(ITEMS.length > 0,
      'connectives-he/data-conn-he.js לא החזיר אף פריט · כל מה שאחריו יעבור ריקם');
  });
});

/* ═════════ 1 · הגידור לשפה ═════════ */
describe('המקטע בדף הבית מגודר לעברית', () => {

  test('בעברית המקטע פתוח', () => {
    assert.strictEqual(load({ lang: 'he' }).connOn(), true,
      'לומד עברית אינו רואה את היחידה · הקורפוס עברי והמקטע מוסתר ממי שהוא נועד לו');
  });

  test('באנגלית המקטע סגור', () => {
    assert.strictEqual(load({ lang: 'en' }).connOn(), false,
      'לומד אנגלית רואה כפתור ליחידה עברית · הכניסה תוביל אותו לתרגול בשפה שלא פתח');
  });

  /* ⚠ הכותרת והכפתור הם **שני** אלמנטים. גידור על אחד מהם בלבד משאיר כותרת
     מרחפת בלי תוכן, או כפתור בלי כותרת · ובשני המקרים בלי שגיאה. */
  test('שני חלקי המקטע תלויים על אותו גידור, ולא רק אחד מהם', () => {
    for (const id of ['connSectionT', 'connBands']) {
      const re = new RegExp("\\$\\('#" + id + "'\\)\\?\\.classList\\.toggle\\('hidden', !connOn\\(\\)\\)");
      assert.ok(re.test(app),
        `renderHome אינה מגדרת את #${id} ב-connOn() · החלק הזה של המקטע יוצג בכל שפה`);
    }
  });

  test('הספירה על הכפתור מחושבת רק כשהמקטע פתוח', () => {
    assert.ok(/if\(connOn\(\) && window\.CONN_HE\)\{/.test(app),
      'חישוב הספירה אינו מגודר · הוא ירוץ גם באנגלית וימלא כפתור מוסתר');
  });

  /* ⛔ הגידור ב-JS רץ אחרי הצביעה הראשונה. בלי `hidden` במקור, המקטע מהבהב
     על המסך של לומד אנגלית לפני ש-renderHome מספיקה להסתיר אותו. */
  test('המקטע מגיע מוסתר כבר במקור, ולא רק אחרי שה-JS רץ', () => {
    assert.ok(/<div class="section-t hidden" id="connSectionT">/.test(html),
      'כותרת המקטע אינה נושאת hidden במקור · היא תהבהב לפני שהגידור ירוץ');
    assert.ok(/<div class="practice-btns hidden" id="connBands">/.test(html),
      'כפתור היחידה אינו נושא hidden במקור · הוא יהבהב לפני שהגידור ירוץ');
  });
});

/* ═════════ 2 · איפוס ההבטחה בכשל טעינה ═════════ */
describe('loadConnData · כשל טעינה אינו נועל את היחידה', () => {

  test('כשל מחזיר false', async () => {
    const c = load({ lang: 'he' });
    const doc = fakeDoc(); c.document = doc;
    const p = c.loadConnData();
    assert.strictEqual(doc.created.length, 1, 'לא נתלה תג סקריפט כלל');
    doc.created[0].onerror();
    assert.strictEqual(await p, false, 'כשל טעינה לא הוחזר כ-false');
  });

  test('⭐ הנסיון השני מנסה באמת · ההבטחה אופסה ב-onerror', async () => {
    const c = load({ lang: 'he' });
    const doc = fakeDoc(); c.document = doc;
    const p1 = c.loadConnData();
    doc.created[0].onerror();
    assert.strictEqual(await p1, false);

    const p2 = c.loadConnData();
    assert.strictEqual(doc.created.length, 2,
      'הנסיון השני לא תלה תג חדש · ההבטחה לא אופסה ב-onerror, והיחידה נעולה ' +
      'עד רענון הדף גם אחרי שהרשת חזרה');
    c.window.CONN_HE = { cause: [] };
    doc.created[1].onload();
    assert.strictEqual(await p2, true,
      'הטעינה החוזרת לא דיווחה על הצלחה אף שהנתונים הגיעו');
  });

  test('טעינה שהצליחה אינה נטענת שוב', async () => {
    const c = load({ lang: 'he' });
    const doc = fakeDoc(); c.document = doc;
    c.window.CONN_HE = { cause: [] };
    assert.strictEqual(await c.loadConnData(), true);
    assert.strictEqual(doc.created.length, 0,
      'הקובץ נטען שוב אף שהנתונים כבר בזיכרון');
  });

  test('הכתובת מצביעה לקובץ שהצינור באמת כותב', async () => {
    const c = load({ lang: 'he' });
    const doc = fakeDoc(); c.document = doc;
    c.loadConnData();
    assert.strictEqual(doc.created[0].src, './connectives-he/data-conn-he.js?v=228',
      'הכתובת אינה זו שהצינור כותב אליה, או שאינה נושאת את מספר הבנייה');
    assert.ok(fs.existsSync(path.join(ROOT, 'connectives-he', 'data-conn-he.js')),
      'הקובץ שהכתובת מצביעה אליו אינו קיים בעץ');
  });
});

/* ═════════ 3 · הערבוב שומר על ההתאמה ═════════ */
describe('connShuffled · ארבעת המערכים המקבילים זזים יחד', () => {

  const good = ITEMS.filter(it => load({ lang: 'he' }).connItemOk(it));

  test('הפריטים שהצינור הפיק עוברים את שער התקינות', () => {
    assert.strictEqual(good.length, ITEMS.length,
      `${ITEMS.length - good.length} מתוך ${ITEMS.length} פריטים נפסלו בשער · ` +
      'או שהשער חמור מדי או שהצינור הפיק פריט שבור');
  });

  test('⭐ כל אפשרות נשארת עם הפירוש, הנימוק והכיוון שלה', () => {
    const c = load({ lang: 'he' });
    for (const it of good) {
      for (let t = 0; t < 60; t++) {
        const sh = c.connShuffled(it);
        for (let i = 0; i < sh.o.length; i++) {
          const j = it.o.indexOf(sh.o[i]);
          assert.notStrictEqual(j, -1, `אפשרות שאינה מהמקור: ${sh.o[i]}`);
          assert.strictEqual(sh.g[i], it.g[j],
            `הפירוש התנתק מהאפשרות «${sh.o[i]}» · הלומד יקרא הסבר של מילה אחרת`);
          assert.strictEqual(sh.r[i], it.r[j],
            `הנימוק התנתק מהאפשרות «${sh.o[i]}» · הלומד יקרא נימוק של מילה אחרת`);
          assert.strictEqual(sh.d[i], it.d[j],
            `הכיוון התנתק מהאפשרות «${sh.o[i]}» · שלב בחירת הכיוון יסמן תשובה שגויה`);
        }
      }
    }
  });

  test('⭐ התשובה הנכונה נשארת נכונה, וההצהרה k===d[a] שורדת', () => {
    const c = load({ lang: 'he' });
    for (const it of good) {
      for (let t = 0; t < 60; t++) {
        const sh = c.connShuffled(it);
        assert.strictEqual(sh.o[sh.a], it.o[it.a],
          '‏a אינו מצביע עוד על התשובה הנכונה אחרי הערבוב');
        assert.strictEqual(sh.d[sh.a], sh.k,
          '‏k אינו שווה עוד ל-d[a] אחרי הערבוב · הפריט סותר את עצמו');
      }
    }
  });

  /* ⛔ בקרה חיובית · בלי זה "התאמה נשמרה" עובר גם על מגיש שאינו מערבב כלל,
     וזה בדיוק הבאג שהיה ביחידת המשפטים: התשובה תמיד ראשונה. */
  test('הערבוב באמת מזיז · התשובה אינה תמיד ראשונה', () => {
    const c = load({ lang: 'he' });
    const it = good[0];
    let moved = 0;
    for (let t = 0; t < 200; t++) if (c.connShuffled(it).a !== it.a) moved++;
    assert.ok(moved > 0,
      'ב-200 ערבובים התשובה לא זזה אף פעם · המגיש אינו מערבב, והלומד יגלה ' +
      'בשאלה השלישית שהתשובה היא תמיד הכפתור הראשון');
  });
});

/* ═════════ שער הפריט · שיניים ═════════ */
describe('connItemOk · פריט שבור מוחרג ולא מוצג שבור', () => {
  const c = load({ lang: 'he' });
  const base = () => JSON.parse(JSON.stringify(ITEMS[0]));

  const מקרים = [
    ['g קצר מ-o', it => { it.g.pop(); }],
    ['r קצר מ-o', it => { it.r.pop(); }],
    ['d קצר מ-o', it => { it.d.pop(); }],
    ['a מחוץ לטווח', it => { it.a = 9; }],
    ['k אינו d[a]', it => { it.d[it.a] = 'time'; it.k = 'cause'; }],
    ['אין חריץ במשפט', it => { it.s = it.s.replace(/_{2,}/g, 'x'); }],
    ['פירוש ריק', it => { it.g[1] = ''; }],
    ['בלי מזהה', it => { delete it.src; }],
  ];
  for (const [שם, שבור] of מקרים) {
    test(`נפסל · ${שם}`, () => {
      const it = base(); שבור(it);
      assert.strictEqual(c.connItemOk(it), false, `פריט עם «${שם}» עבר את השער`);
    });
  }
  test('הפריט התקין עובר · אחרת כל המקרים למעלה עוברים מהסיבה הלא נכונה', () => {
    assert.strictEqual(c.connItemOk(base()), true);
  });
});

/* ═════════ ההתקדמות · נוסעת בבלוב הקיים ═════════ */
describe('ההתקדמות מסונכרנת בלי טבלה חדשה', () => {
  test('collectExtras אוסף את המפתח על השורה של עברית בלבד', () => {
    const at = app.indexOf('function collectExtras(');
    const body = app.slice(at, app.indexOf('\n}', at));
    assert.ok(/lang==='he'[\s\S]{0,120}CONN_PROG[\s\S]{0,60}out\.conn/.test(body),
      'התקדמות מילות הקישור אינה נאספת · היא לא תעבור בין מכשירים');
  });
  test('applyExtras קורא אותה בחזרה, וממזג מונוטונית', () => {
    const at = app.indexOf('function applyExtras(');
    const body = app.slice(at, app.indexOf('\n}\n', at));
    assert.ok(/ex\.conn/.test(body), 'applyExtras אינה קוראת את התקדמות מילות הקישור');
    assert.ok(/Math\.max\(Number\(l\.n\)\|\|0, Number\(r\.n\)\|\|0\)/.test(body),
      'המיזוג אינו מונוטוני · מכשיר שמאחר יגרור אחורה מכשיר שקדם לו');
  });
  test('⛔ בלי טבלת Supabase חדשה', () => {
    const sql = path.join(ROOT, 'supabase');
    const files = fs.existsSync(sql) ? fs.readdirSync(sql) : [];
    const bad = files.filter(f => /conn/i.test(f));
    assert.deepStrictEqual(bad, [],
      'נוספה ישות חדשה למסד בשביל היחידה הזאת · הבלוב הקיים כבר מסונכרן ומוגן ב-RLS');
  });
});
