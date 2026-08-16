'use strict';
/* מונה הדחיות · ארבעת הגבולות, כל אחד כשער עם שיניים.
 *
 * למה הקובץ הזה קיים
 * -------------------
 * הסעיף שהוא בודק אוסף את מה שלומד הקליד. זה בדיוק סוג הפיצ'ר שבו "כמעט כבוי"
 * ו"כמעט מקומי" הם כישלון מלא: לאפליקציה יש כ-15 נרשמים אמיתיים, ואיסוף מידע
 * עליהם דורש גילוי והסכמה שאינם קיימים כאן. לכן הדרישות אינן מנוסחות כ"מעט"
 * אלא כ**אפס**, ובדיקה שאינה יכולה ליפול אינה מוכיחה אפס.
 *
 * ארבעת הגבולות
 * --------------
 *   א · כבוי כברירת מחדל · אפס כתיבות אצל מי שלא הדליק.
 *   ב · תקרה קשיחה · 600 רשומות נכנסות, 500 נשארות.
 *   ג · מקומי בלבד · שום דבר אינו יוצא לרשת ואינו נוסע לענן.
 *   ד · לעולם לא על חשבון ההתקדמות · יומן שנופל אינו גוזם היסטוריית תרגול.
 *
 * ⚠ הבדיקות כאן מרימות את הקוד האמיתי מ-app.js ומריצות אותו מול localStorage
 * מזויף · אותה טכניקה בדיוק של tests/07, ומאותה סיבה: שכבת האחסון היא כולה
 * דיסק, ולכן היא זקוקה לדיסק. שום כלל אינו משוחזר כאן; כל מה שנשפט הוא הקוד
 * שנשלח למשתמש.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { extractAll } = require('./_harness/extract.js');
const { appSource, banks, expectNone } = require('./_harness/sandbox.js');
const { codeMask, codeMatches } = require('./_harness/scan.js');

/* ⚠ מערך שנבנה בתוך ארגז החול שייך למרחב אחר, ו-deepStrictEqual נופל על
   הפרוטוטיפ ולא על התוכן · "actual: []  expected: []". שתי העזרות האלה הן
   הדרך שהפרויקט כבר פתר בה בדיוק את המלכודת הזאת. */
const none = (list, msg) => expectNone(assert, list, msg);
const here = list => Array.from(list);

/* ============================ הטוען ============================ */

const SYMBOLS = [
  // מצב המודול שעליו LS.set נשען
  'storageWarned', 'storageBarOn',
  'LS', 'shedStorage', 'showStorageBar', 'hideStorageBar',
  'SUF', 'KEY', 'isObj',
  // הסעיף שנבדק
  'DIAG_KEY', 'DIAG_FLAG', 'DIAG_MAX', 'DIAG_COLS', 'diagSeq',
  'diagOn', 'hwDiag', 'diagRead', 'diagLog', 'diagMark',
  'diagWhy', 'diagReject', 'hwDiagTsv', 'diagCountText',
  // מה ש-diagWhy נשען עליו כדי לגזור "למה נדחתה"
  'NIQ', 'normEn', 'norm', 'K', 'meaningSegs', 'editDist',
  'GLOSS_ALT', 'glossKey', 'glossSenses', 'glossAlts',
  // מה שנוסע לענן · כדי להוכיח שהיומן אינו נוסע איתו
  'levelKeyFor', 'sizeKeyFor', 'examPreFor', 'EXAM_KEY', 'SENT_PROG', 'collectExtras',
];

/* localStorage שמתנהג כמו הדפדפן · ערכים הם מחרוזות, מפתח חסר הוא null,
   ומעל `cap` תווים setItem זורק. `blocked` דוחה מפתח אחד ללא קשר לגודל, וזו
   הדרך למדל דיסק שמלא בדיוק עבור היומן בלי לכייל בתים ביד. */
function makeLocalStorage(opts = {}) {
  const map = new Map();
  const cap = opts.cap == null ? Infinity : opts.cap;
  const quota = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; return e; };
  const api = {
    writes: 0,
    blocked: opts.blocked || null,
    getItem(k) { k = String(k); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      if (api.blocked && api.blocked(k)) throw quota();
      let after = k.length + v.length;
      for (const [kk, vv] of map) if (kk !== k) after += kk.length + vv.length;
      if (after > cap) throw quota();
      api.writes++;
      map.set(k, v);
    },
    removeItem(k) { map.delete(String(k)); },
    key(i) { const ks = Array.from(map.keys()); return i >= 0 && i < ks.length ? ks[i] : null; },
    read(k) { const v = api.getItem(k); return v == null ? undefined : JSON.parse(v); },
    keys() { return Array.from(map.keys()); },
    /* כותב מצד הבדיקה בלבד · עוקף cap ו-blocked כדי לבנות מצב התחלתי.
       לעולם אינו משמש קוד שנבדק. */
    seed(k, v) { map.set(String(k), typeof v === 'string' ? v : JSON.stringify(v)); return api; },
  };
  Object.defineProperty(api, 'length', { get: () => map.size });
  return api;
}

function makeDocument() {
  const els = {};
  return {
    body: { appendChild(e) { els[e.id] = e; } },
    getElementById(id) { return els[id] || null; },
    createElement() {
      const e = { id: '', className: '', innerHTML: '', _cls: new Set() };
      e.classList = { add: c => e._cls.add(c), remove: c => e._cls.delete(c), contains: c => e._cls.has(c) };
      return e;
    },
    querySelector() { return null; },
  };
}

let cachedLift = null;
const lifted = () => (cachedLift || (cachedLift = extractAll(appSource(), SYMBOLS)));

function loadDiag(opts = {}) {
  const b = banks();
  const ls = makeLocalStorage(opts);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat,
    localStorage: ls,
    document: makeDocument(),
    LANG: opts.lang || 'he',
    PREVIEW: false, currentUser: null,
    assoc: {}, stats: opts.stats || { words: {}, sessions: [] },
    deleted: new Set(), added: [], direction: 'w2m',
    BANK: [], session: new Map(),
    toast() {}, queueRemoteSync() {},
  };
  ctx.window = { UNIT_DATA: b.he, UNIT_DATA_EN: b.en };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const { name, code } of lifted()) {
    try { vm.runInContext("'use strict';\n" + code, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
  }
  const absent = SYMBOLS.filter(n => ctx[n] === undefined);
  if (absent.length) throw new Error('lifted from app.js but undefined afterwards: ' + absent.join(', '));
  ctx.ls = ls;
  return ctx;
}

/* דלוק · המצב היחיד שבו כתיבה מותרת. נעשה דרך המתג האמיתי ולא בזריעה ידנית,
   כדי שהמתג עצמו ייבדק ולא רק מה שאחריו. */
function armed(opts = {}) {
  const c = loadDiag(opts);
  c.hwDiag(true);
  c.ls.writes = 0;                    // הדלקת המתג עצמה אינה נספרת בכתיבות שנמדדות
  return c;
}

const CARD = { term: 'לְקוּי', meaning: 'פגום, מקולקל' };

/* ==================== א · כבוי כברירת מחדל ==================== */
describe('א · כבוי כברירת מחדל · אפס כתיבות אצל כל מי שאינו חגי', () => {

  test('בלי הדגל, diagOn שקרי ואין בכלל מפתחות באחסון', () => {
    const c = loadDiag();
    assert.strictEqual(c.diagOn(), false, 'המונה דלוק בלי שאיש הדליק אותו');
    assert.deepStrictEqual(c.ls.keys(), [], 'עצם בדיקת הדגל יצרה מפתח באחסון');
  });

  test('⭐ דחייה אצל משתמש שלא הדליק אינה כותבת כלום · אפס כתיבות, אפס מפתחות', () => {
    const c = loadDiag();
    for (let i = 0; i < 25; i++) c.diagReject(CARD, 'תשובה שגויה ' + i, true);
    assert.strictEqual(c.ls.writes, 0, 'בוצעה כתיבה לאחסון אצל משתמש שלא הדליק את המונה');
    assert.deepStrictEqual(c.ls.keys(), [], 'נוצרו מפתחות באחסון אצל משתמש שלא הדליק');
    none(c.diagRead(), 'נאספו רשומות בלי שהמונה הודלק');
  });

  test('diagLog מחזיר 0 כשהמונה כבוי, ולכן אין מזהה לסמן', () => {
    const c = loadDiag();
    assert.strictEqual(c.diagLog({ term: 'x' }), 0);
    assert.strictEqual(c.diagMark(1, true), false, 'סימון הצליח על יומן שאינו קיים');
  });

  test('גם סימון "בעצם ידעתי" אינו כותב כלום כשהמונה כבוי', () => {
    const c = loadDiag();
    c.diagMark(7, true);
    assert.strictEqual(c.ls.writes, 0, 'סימון כתב לאחסון למרות שהמונה כבוי');
  });

  test('כיבוי מוחק גם את הדגל וגם את מה שנאסף', () => {
    const c = armed();
    c.diagReject(CARD, 'משהו', true);
    assert.strictEqual(c.diagRead().length, 1);
    c.hwDiag(false);
    assert.strictEqual(c.diagOn(), false);
    assert.strictEqual(c.ls.getItem(c.DIAG_KEY), null, 'היומן שרד את הכיבוי');
    assert.strictEqual(c.ls.getItem(c.DIAG_FLAG), null, 'הדגל שרד את הכיבוי');
  });

  test('hwDiag() בלי ארגומנט מדווח ואינו משנה', () => {
    const c = loadDiag();
    assert.strictEqual(c.hwDiag(), false);
    assert.deepStrictEqual(c.ls.keys(), [], 'שאילתת מצב שינתה את האחסון');
  });

  test('דגל שנכתב ביד כמחרוזת גולמית מתקבל · localStorage["hw_diag"]="1"', () => {
    const c = loadDiag();
    c.ls.seed('hw_diag', '1');
    assert.strictEqual(c.diagOn(), true, 'הדלקה ידנית מהקונסול אינה נתפסת');
  });
});

/* ==================== ב · התקרה ==================== */
describe('ב · תקרה קשיחה · 600 נכנסות, 500 נשארות', () => {

  test('⭐ 600 רשומות נכתבות ו-500 בדיוק נשארות', () => {
    const c = armed();
    for (let i = 1; i <= 600; i++) c.diagReject(CARD, 'ניסיון ' + i, true);
    const log = c.diagRead();
    assert.strictEqual(log.length, 500,
      `התקרה לא עצרה · ביומן ${log.length} רשומות במקום 500`);
  });

  test('הישנות נזרקות והחדשות נשמרות · המאגר מעגלי, לא חוסם', () => {
    const c = armed();
    for (let i = 1; i <= 600; i++) c.diagReject(CARD, 'ניסיון ' + i, true);
    const log = c.diagRead();
    assert.strictEqual(log[0].typed, 'ניסיון 101', 'הרשומה הראשונה אינה זו שאחרי 100 שנזרקו');
    assert.strictEqual(log[log.length - 1].typed, 'ניסיון 600',
      'הרשומה האחרונה אינה החדשה ביותר · המאגר חוסם במקום להתגלגל');
  });

  test('יומן שכבר חרג מהתקרה על הדיסק מוחזר אליה בכתיבה אחת', () => {
    /* קובץ שנערך ביד, או תקרה שהורדה בגרסה חדשה. הסרה של רשומה אחת בכל כתיבה
       הייתה משאירה את החריגה לנצח. */
    const c = armed();
    const fat = Array.from({ length: 900 }, (_, i) => ({ id: i + 1, typed: 'ישן ' + i }));
    c.ls.seed(c.DIAG_KEY, fat);
    c.diagReject(CARD, 'חדשה', true);
    assert.strictEqual(c.diagRead().length, 500, 'חריגה קיימת לא צומצמה בחזרה לתקרה');
  });

  test('התקרה היא 500, כמספר · ולא ערך שהשתנה בשקט', () => {
    assert.strictEqual(loadDiag().DIAG_MAX, 500);
  });
});

/* ==================== ג · מקומי בלבד ==================== */
describe('ג · מקומי בלבד · שום דבר אינו יוצא לרשת', () => {

  /* נסרק הקוד שהורם בפועל, לא טקסט הקובץ · כך הערה שמזכירה fetch אינה מפילה,
     וקריאה אמיתית אינה יכולה להתחבא בתוך מחרוזת. */
  const NET = /\b(?:fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\s*\(|\bsb\s*\.\s*from\b|\bnavigator\s*\.\s*sendBeacon\b|\bsupabase\b/;
  const DIAG_FNS = ['diagOn', 'hwDiag', 'diagRead', 'diagLog', 'diagMark', 'diagWhy',
                    'diagReject', 'hwDiagTsv', 'diagCountText'];

  test('⭐ אף אחת מפונקציות המונה אינה מכילה קריאת רשת', () => {
    const bad = [];
    for (const { name, code } of extractAll(appSource(), DIAG_FNS)) {
      const mask = codeMask(code);
      if (codeMatches(code, NET, mask).length) bad.push(name);
    }
    assert.deepStrictEqual(bad, [],
      'פונקציות המונה מכילות קריאת רשת · הדרישה היא מקומי בלבד, ללא יוצא מן הכלל');
  });

  test('לגלאי יש שיניים · קריאת רשת שתולה נתפסת, והערה שמזכירה אותה לא', () => {
    const planted = 'function diagLog(row){ fetch("/x", {body: row}); }';
    assert.strictEqual(codeMatches(planted, NET, codeMask(planted)).length, 1,
      'הגלאי אינו מזהה fetch אמיתי · כל הבדיקה שמעליו חסרת ערך');
    const commented = 'function diagLog(row){ /* אין כאן fetch ואין sb.from */ return 0; }';
    assert.strictEqual(codeMatches(commented, NET, codeMask(commented)).length, 0,
      'הגלאי נופל על הערה · הוא ייחסם ויאולץ להתרופף');
  });

  test('⭐ היומן אינו נוסע לענן · collectExtras אינה אוספת אותו', () => {
    const c = armed();
    for (let i = 0; i < 5; i++) c.diagReject(CARD, 'סוד שהוקלד ' + i, true);
    assert.ok(c.diagRead().length === 5, 'תנאי מוקדם: היומן אינו ריק');
    const blob = JSON.stringify(c.collectExtras('he')) + JSON.stringify(c.collectExtras('en'));
    assert.ok(!blob.includes('סוד שהוקלד'),
      'מה שהלומד הקליד נמצא בבלוב שנוסע לסופאבייס · זו בדיוק ההבטחה שנשברה');
    assert.ok(!blob.includes(c.DIAG_KEY), 'מפתח היומן נאסף אל הבלוב המסונכרן');
  });

  test('מפתח היומן אינו נופל תחת התחילית ש-collectExtras סורקת', () => {
    const c = loadDiag();
    for (const lang of ['he', 'en'])
      assert.ok(!c.DIAG_KEY.startsWith(c.examPreFor(lang)),
        `${c.DIAG_KEY} מתחיל ב-${c.examPreFor(lang)} ולכן ייאסף לענן`);
  });
});

/* ==================== ד · לעולם לא על חשבון ההתקדמות ==================== */
describe('ד · יומן שנופל אינו גוזם התקדמות אמיתית', () => {

  const withHistory = () => ({ words: {}, sessions: Array.from({ length: 100 }, (_, i) => ({ t: i })) });

  test('⭐ כתיבת יומן שנכשלת על מכסה אינה מפעילה את מנגנון ההשלכה', () => {
    const c = armed({ stats: withHistory(), blocked: k => k === 'hw_diag_log' });
    assert.strictEqual(c.stats.sessions.length, 100, 'תנאי מוקדם');
    c.diagReject(CARD, 'תשובה', true);
    assert.strictEqual(c.stats.sessions.length, 100,
      'היסטוריית התרגול נגזמה ל-40 בגלל רשומת אבחון שלא נכנסה · ' +
      'המונה קנה לעצמו מקום במחיר ההתקדמות של חגי');
  });

  test('וגם אינה מרימה את פס ההתראה · "ההתקדמות לא נשמרת" יהיה שקר', () => {
    const c = armed({ stats: withHistory(), blocked: k => k === 'hw_diag_log' });
    c.diagReject(CARD, 'תשובה', true);
    assert.strictEqual(c.storageBarOn, false,
      'פס ההתראה עלה בגלל רשומת אבחון · הלומד מקבל אזהרה על נתונים שלמים');
  });

  test('כתיבת יומן שנכשלת אינה מפילה את התרגול', () => {
    const c = armed({ blocked: k => k === 'hw_diag_log' });
    assert.doesNotThrow(() => c.diagReject(CARD, 'תשובה', true));
    assert.strictEqual(c.diagReject(CARD, 'תשובה', true), 0, 'הוחזר מזהה לרשומה שלא נכתבה');
  });

  test('⭐ shedStorage זורק את היומן ראשון, לפני שהוא נוגע בהיסטוריה', () => {
    const c = loadDiag({ stats: withHistory() });
    c.ls.seed(c.DIAG_KEY, [{ id: 1, typed: 'רשומה' }]);
    c.shedStorage();
    assert.strictEqual(c.ls.getItem(c.DIAG_KEY), null,
      'היומן שרד את ההשלכה בזמן שהיסטוריית התרגול נגזמה · הסדר הפוך');
    assert.strictEqual(c.stats.sessions.length, 40, 'הגיזום הרגיל הפסיק לעבוד');
  });

  test('היומן נזרק גם כשגיזום הסבבים לבדו היה מספיק', () => {
    const c = loadDiag({ stats: withHistory() });
    c.ls.seed(c.DIAG_KEY, [{ id: 1 }]);
    c.shedStorage();
    assert.strictEqual(c.ls.getItem(c.DIAG_KEY), null,
      'היומן נשמר כי היה מקום · הוא ניתן לייצור מחדש וההתקדמות לא');
  });

  test('שני השלבים רצים · אין return באמצע שמסתפק ביומן', () => {
    /* ל-LS.set יש ניסיון חוזר אחד. שחרור חלקי היה מפיל כתיבה שגיזום הסבבים
       כן היה מציל. */
    const c = loadDiag({ stats: withHistory() });
    c.ls.seed(c.DIAG_KEY, [{ id: 1 }]);
    assert.strictEqual(c.shedStorage(), true);
    assert.strictEqual(c.stats.sessions.length, 40,
      'ההשלכה עצרה אחרי היומן ולא גזמה את מה שבאמת תופס מקום');
  });

  test('כתיבה רגילה שנכשלת עדיין משליכה · ההתנהגות הקיימת לא נשברה', () => {
    const c = loadDiag({ stats: withHistory(), blocked: k => k === 'hw_other' });
    c.LS.set('hw_other', { big: 1 });
    assert.strictEqual(c.stats.sessions.length, 40,
      'מנגנון ההשלכה הרגיל הפסיק לפעול · הוספת המצב המתכלה שברה אותו');
  });
});

/* ==================== מה נרשם בכל רשומה ==================== */
describe('הרשומה עצמה · מה נשמר, ומה שאין באפליקציה היום', () => {

  test('⭐ המחרוזת שהוקלדה נשמרת · זה כל מה שהיה חסר', () => {
    const c = armed();
    c.diagReject(CARD, 'שבור לגמרי', true);
    assert.strictEqual(c.diagRead()[0].typed, 'שבור לגמרי');
  });

  test('נשמרים גם חותמת זמן, שפה, כיוון והמונח', () => {
    const c = armed({ lang: 'he' });
    c.diagReject(CARD, 'פגום', true);
    const r = c.diagRead()[0];
    assert.match(r.ts, /^\d{4}-\d{2}-\d{2}T/, 'חותמת הזמן אינה ISO');
    assert.strictEqual(r.lang, 'he');
    assert.strictEqual(r.dir, 'w2m');
    assert.strictEqual(r.term, CARD.term);
  });

  test('הכיוון ההפוך נרשם ככזה', () => {
    const c = armed();
    c.diagReject(CARD, 'משהו', false);
    assert.strictEqual(c.diagRead()[0].dir, 'm2w');
  });

  test('שגיאת כתיב מסווגת typo, ומרחק העריכה נשמר לצדה', () => {
    const c = armed();
    c.diagReject(CARD, 'מקולקך', true);          // מקולקל עם אות אחת שונה
    const r = c.diagRead()[0];
    assert.strictEqual(r.why, 'typo', `סווג ${r.why} במקום typo (near=${r.near}, dist=${r.dist})`);
    assert.ok(r.dist >= 1 && r.dist <= 3, 'מרחק העריכה אינו נשמר או אינו סביר');
  });

  test('תשובה רחוקה מסווגת other', () => {
    const c = armed();
    c.diagReject(CARD, 'מכונית', true);
    assert.strictEqual(c.diagRead()[0].why, 'other');
  });

  test('מילה שנשלפה מתוך הסוגריים המסבירים מסווגת in-gloss', () => {
    const c = armed();
    c.diagReject({ term: 'יָגֹר', meaning: 'פוחד, חושש (אשר יגורתי בא)' }, 'יגורתי', true);
    assert.strictEqual(c.diagRead()[0].why, 'in-gloss',
      'תשובה שנשלפה מהסוגריים אינה מסווגת · זו דחייה מכוונת וכדאי לדעת כמה היא קורית');
  });

  test('שדה ריק מסווג empty ואינו מפיל', () => {
    const c = armed();
    c.diagReject(CARD, '', true);
    assert.strictEqual(c.diagRead()[0].why, 'empty');
  });

  test('diagWhy אינו זורק על כרטיס פגום', () => {
    const c = armed();
    assert.doesNotThrow(() => c.diagWhy({ term: null, meaning: null }, 'משהו', true));
    assert.doesNotThrow(() => c.diagWhy({}, null, false));
  });
});

/* ==================== "בעצם ידעתי" · מדד ה-override ==================== */
describe('מונה "בעצם ידעתי" · override rate', () => {

  test('⭐ לחיצה מסמנת את הרשומה שנוצרה מהדחייה הזאת', () => {
    const c = armed();
    const id = c.diagReject(CARD, 'פגום מאוד', true);
    assert.ok(id > 0, 'לא הוחזר מזהה');
    assert.strictEqual(c.diagRead()[0].ovr, 0, 'רשומה חדשה נולדה מסומנת');
    assert.strictEqual(c.diagMark(id, true), true);
    assert.strictEqual(c.diagRead()[0].ovr, 1, 'הסימון לא נשמר · המדד יהיה אפס תמיד');
  });

  test('ביטול הלחיצה מחזיר את הרשומה ל-0 · המדד אינו סופר לחיצות שבוטלו', () => {
    const c = armed();
    const id = c.diagReject(CARD, 'פגום מאוד', true);
    c.diagMark(id, true);
    c.diagMark(id, false);
    assert.strictEqual(c.diagRead()[0].ovr, 0, 'ביטול לא נרשם · override rate מנופח');
  });

  test('הסימון פוגע ברשומה הנכונה כשיש כמה', () => {
    const c = armed();
    const a = c.diagReject(CARD, 'ראשונה', true);
    const b = c.diagReject(CARD, 'שנייה', true);
    c.diagMark(b, true);
    const log = c.diagRead();
    assert.strictEqual(log.find(r => r.id === a).ovr, 0, 'סומנה הרשומה הלא נכונה');
    assert.strictEqual(log.find(r => r.id === b).ovr, 1);
  });
});

/* ==================== הייצוא ==================== */
describe('הייצוא · TSV שאפשר להעתיק ולקרוא', () => {

  test('כותרת ועוד שורה לכל רשומה, מופרדות בטאב', () => {
    const c = armed();
    c.diagReject(CARD, 'אחת', true);
    c.diagReject(CARD, 'שתיים', true);
    const lines = c.hwDiagTsv().split('\n');
    assert.strictEqual(lines.length, 3, 'מספר השורות אינו כותרת ועוד רשומה לכל דחייה');
    assert.deepStrictEqual(lines[0].split('\t'), here(c.DIAG_COLS));
    assert.strictEqual(lines[1].split('\t').length, c.DIAG_COLS.length,
      'שורה אינה נושאת את מספר העמודות של הכותרת');
  });

  test('⭐ טאב ושורה חדשה במה שהוקלד אינם שוברים את הטבלה', () => {
    const c = armed();
    c.diagReject(CARD, 'עם\tטאב\nושורה', true);
    const lines = c.hwDiagTsv().split('\n');
    assert.strictEqual(lines.length, 2, 'שורה חדשה שהוקלדה פיצלה רשומה לשתיים');
    assert.strictEqual(lines[1].split('\t').length, c.DIAG_COLS.length,
      'טאב שהוקלד הוסיף עמודה · כל הקובץ מוסט');
  });

  test('הערך שהוקלד עצמו נמצא בפלט', () => {
    const c = armed();
    c.diagReject(CARD, 'מה שהקלדתי', true);
    assert.ok(c.hwDiagTsv().includes('מה שהקלדתי'));
  });

  test('יומן ריק מייצא כותרת בלבד, ולא נופל', () => {
    const c = loadDiag();
    assert.strictEqual(c.hwDiagTsv(), c.DIAG_COLS.join('\t'));
  });

  test('עברית תקינה למספר הרשומות · "1 רשומות" אינו עברית', () => {
    const c = loadDiag();
    assert.strictEqual(c.diagCountText(0), 'אין עדיין רשומות');
    assert.strictEqual(c.diagCountText(1), 'רשומה אחת');
    assert.strictEqual(c.diagCountText(2), 'שתי רשומות');
    assert.strictEqual(c.diagCountText(7), '7 רשומות');
  });

  test('שלוש הפונקציות הגלובליות מונגשות ל-window', () => {
    const src = appSource();
    for (const fn of ['hwDiag', 'hwDiagTsv', 'hwDiagShow'])
      assert.ok(codeMatches(src, new RegExp('window\\.' + fn + '\\s*='), codeMask(src)).length,
        `${fn} אינו מונגש ל-window · חגי לא יוכל להפעיל אותו מהקונסול`);
  });
});

/* ==================== החיווט · מה שקורא לסעיף ==================== */
describe('החיווט בתוך finishCard', () => {
  const src = appSource();
  const mask = codeMask(src);

  test('דחייה נרשמת, ודילוג אינו נרשם', () => {
    assert.ok(codeMatches(src, /!ok\s*&&\s*!skipped\s*\)\s*\?\s*diagReject\(/, mask).length,
      'diagReject אינו מותנה ב-"נדחה ולא דולג" · דילוג יזהם את המכנה של override rate');
  });

  test('נמסרת המחרוזת שהוקלדה בפועל, ולא רק "נכון/לא נכון"', () => {
    assert.ok(codeMatches(src, /diagReject\(\s*w\s*,\s*\$\('#answerInput'\)\.value/, mask).length,
      'הקריאה אינה מעבירה את ערך שדה הקלט · אין מה ללמוד מהרשומה');
  });

  test('"בעצם ידעתי" מסמן בשני הכיוונים', () => {
    assert.ok(codeMatches(src, /diagMark\(\s*diagId\s*,\s*marked\s*\)/, mask).length,
      'הסימון אינו מקבל את מצב המתג · ביטול לחיצה לא יירשם');
  });
});
