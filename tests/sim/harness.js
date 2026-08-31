'use strict';
/* רתמת הסימולציה · מרימה את **המסך** של יחידת מילות הקישור מ-app.js ומריצה
 * אותו מול DOM מזויף ו-localStorage מזויף.
 *
 * מה זה מוסיף על tests/104-conn-ui.test.js
 * -----------------------------------------
 * ‏104 מרים חישוב טהור (`connItemOk`, `connShuffled`, `loadConnData`) ובודק את
 * השאר בקריאת מקור. כאן מורמות גם `startConnRound`, `renderConnCard`,
 * `answerConn`, `finishConnRound` ושלושת המטפלים — כלומר **הסבב עצמו רץ**,
 * ולא רק הפונקציות שמסביבו.
 *
 * ⚠ מה שאינו מדומה, במפורש
 * --------------------------
 *   · `renderHome` היא צללית מונה. היא נוגעת בכל דף הבית, וזה מחוץ ליחידה.
 *   · `goto` / `goBack` הן צלליות מונות — ניווט בין מסכים אינו נבדק כאן.
 *   · ‏Supabase, שירות העובד, ו-CSS. אין רינדור אמיתי, ולכן «נראה נכון» אינו
 *     נטען כאן בשום מקום; רק «נכתב הערך הנכון» ו«לא נזרקה שגיאה».
 *   · ‏`innerHTML` אינו מפורש לעץ. מסך הסיום נבדק כטקסט.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAll, extractHandler } = require('../_harness/extract.js');
const { codeMask } = require('../_harness/scan.js');
const { makeLocalStorage } = require('../_harness/fakeStorage.js');
const { buildDocument } = require('./dom.js');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'app.js');
const DATA = path.join(ROOT, 'connectives-he', 'data-conn-he.js');

let _app = null;
/* ⭐ טקסט app.js חלופי, לשער-שיניים בלבד · אותו וסת בדיוק שיש ל-sandbox.js.
   הוכחה שהסימולציה באמת מאדימה דורשת להריץ אותה על קוד שבור, ובלי זה היה
   צריך לכתוב app.js שבור לדיסק ולקוות שהוא נמחק. ⛔ הקובץ עצמו אינו נגוע. */
let _override = null;
function setSourceOverride(src) { _override = src; }
const appSource = () => {
  if (_override != null) return _override;
  return _app == null ? (_app = fs.readFileSync(APP, 'utf8')) : _app;
};
let _data = null;
const dataSource = () => (_data == null ? (_data = fs.readFileSync(DATA, 'utf8')) : _data);

/* סדר ההערכה. קבועים ועוזרים לפני מי שקורא להם. */
const SYMBOLS = [
  // עוזרים כלליים
  '$', 'show', 'hide', 'esc', 'shuffle', 'toast',
  // אחסון
  'storageWarned', 'LS', 'storageBarOn', 'showStorageBar', 'hideStorageBar',
  'DIAG_KEY', 'shedStorage',
  // תשתית משותפת ליחידות
  'isObj', 'SUF', 'KEY', 'sEsc', 'okN', 'sentBuildV',
  // היחידה עצמה
  'CONN_LENS', 'CONN_LEN_KEY', 'CONN_PROG',
  'connQ',                       // `let connQ=[], connI=0, connOk=0, connAnswered=false;`
  'connSaveFailed',
  'connOn', 'connRoundLen', 'saneConnRec', 'connProg', 'connRecord',
  'connBank', 'connItems', 'connSummary', 'connItemOk', 'connShuffled',
  'connLoading', 'loadConnData',
  'renderConnLen', 'renderConnPick', 'startConnRound',
  'connTextHtml', 'connFull', 'renderConnCard', 'answerConn',
  'finishConnRound', 'openConnPick',
];

/* המטפלים · חסרי שם, ולכן מורמים בנפרד דרך extractHandler. הם החיווט האמיתי
   בין הכפתור לפונקציה, וסימולציה שקוראת ישר לפונקציה מדלגת בדיוק עליו. */
const HANDLERS = ['connNext', 'connExit', 'pbConn'];

/* מצב שאחרי ההרמה חייב להיות מוגדר. ‏connI/connOk/connAnswered נוסעים בתוך
   ההצהרה של connQ ואי אפשר לחלץ אותם בשמם — הם נבדקים כאן. */
const REQUIRED = SYMBOLS.concat(['connI', 'connOk', 'connAnswered']);

function makeApp(opts = {}) {
  const doc = buildDocument(ROOT);
  const ls = makeLocalStorage(opts);
  const calls = { renderHome: 0, goto: [], goBack: 0, queueRemoteSync: 0, flushRemoteSync: 0, toasts: [] };

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
    Promise, isNaN, isFinite, parseInt, parseFloat,
    /* ‏unref · `toast` מתזמן ניקוי ל-1.9 שניות, ובלי זה כל הודעה מחזיקה את
       התהליך ער אחרי שהסימולציה כבר סיימה. */
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    clearTimeout,

    document: doc,
    localStorage: ls,

    // ---- מצב ברמת המודול של app.js, בצורתו שאחרי האתחול ----
    LANG: opts.lang || 'he',
    PREVIEW: false,
    langLoaded: true,
    currentUser: opts.currentUser || null,
    stats: { words: {}, sessions: [] },
    toastT: undefined,

    // ---- צלליות · מה שמחוץ ליחידה ----
    renderHome() { calls.renderHome++; },
    goto(s) { calls.goto.push(s); },
    goBack() { calls.goBack++; },
    queueRemoteSync() { calls.queueRemoteSync++; },
    flushRemoteSync() { calls.flushRemoteSync++; return Promise.resolve(); },

    __calls: calls,
  };
  ctx.window = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const src = appSource();
  for (const { name, code } of extractAll(src, SYMBOLS)) {
    try { vm.runInContext(`'use strict';\n${code}`, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
  }
  const mask = codeMask(src);
  for (const id of HANDLERS) {
    const code = extractHandler(src, id, mask);
    try { vm.runInContext(`'use strict';\n${code}`, ctx, { filename: `app.js:#${id}` }); }
    catch (e) { throw new Error(`lifting the #${id} handler out of app.js failed: ${e.message}`); }
  }

  const absent = REQUIRED.filter(n => ctx[n] === undefined);
  if (absent.length) throw new Error('lifted from app.js but undefined afterwards: ' + absent.join(', '));

  /* ‏toast האמיתי רץ (הוא נוגע ב-#toast, ופס שנכשל להופיע הוא כשל אמיתי) —
     ומה שנאמר נרשם בדרך. עטיפה, לא החלפה. */
  const realToast = ctx.toast;
  ctx.toast = function (m) { calls.toasts.push(String(m)); return realToast(m); };

  let _orig = null;
  const api = {
    ctx, doc, ls, calls,

    /* טעינת קובץ הנתונים **בתוך אותו realm**. פריטים שנוצרו ב-realm אחר עוברים
       את Array.isArray אבל לא כל בדיקה אחרת, וזה מסוג הרעש שמחקה באג. */
    loadData() { vm.runInContext(dataSource(), ctx, { filename: 'data-conn-he.js' }); return ctx.window.CONN_HE; },

    setLen(n) { ls.seed('hw_conn_len', n); },
    prog() { return JSON.parse(JSON.stringify(ctx.connProg())); },
    rawProg() { return ls.getItem('hw_conn_prog'); },
    summary() { return JSON.parse(JSON.stringify(ctx.connSummary())); },

    el(id) { return doc.getElementById(id); },
    opts() { const b = doc.getElementById('connOpts'); return b ? b.querySelectorAll('.s-opt') : []; },
    card() { return ctx.connQ[ctx.connI]; },
    roundSrcs() { return ctx.connQ.map(x => x.src); },
    visible(id) { const e = doc.getElementById(id); return !!e && !e.classList.contains('hidden'); },

    /* הפריט **לפני** הערבוב, לפי מזהה. */
    origin(src) {
      if (!_orig) {
        _orig = new Map();
        for (const it of Object.values(ctx.connBank()).filter(Array.isArray).flat()) _orig.set(it.src, it);
      }
      return _orig.get(src);
    },
    /* ⭐ הלומד לוחץ על **המילה** שהוא יודע, לא על אינדקס. זה ההבדל שמכריע:
       מגיש שמערבב את הכפתורים ולא ממפה מחדש את מיקום התשובה עדיין «עקבי עם
       עצמו» מול בדיקה שלוחצת לפי `a`, ולומד שלוחץ על המילה הנכונה מקבל טעות.
       ⛔ המילה נשלפת מהמאגר המקורי ולא מהפריט המעורבב, אחרת אין לה עוגן. */
    rightIndex() {
      const it = api.card();
      const o = api.origin(it.src);
      if (!o) throw new Error(`פריט שאינו במאגר המקורי: ${it.src}`);
      const word = String(o.o[o.a]);
      const btns = api.opts();
      const j = btns.findIndex(b => b.textContent === word);
      if (j < 0) throw new Error(
        `⛔ המילה הנכונה «${word}» אינה מוצגת כלל בפריט ${it.src} · על המסך: ${btns.map(b => b.textContent).join(' | ')}`);
      return j;
    },
    answerRight() { return api.opts()[api.rightIndex()].click(); },
    answerWrong() {
      const r = api.rightIndex();
      const btns = api.opts();
      const j = btns.findIndex((_, i) => i !== r);
      if (j < 0) throw new Error('אין אפשרות שגויה להקליק');
      return btns[j].click();
    },
    next() { return doc.getElementById('connNext').click(); },

    /* סבב שלם דרך הכפתורים בלבד. `plan` הוא (i)=>boolean · האם לענות נכון. */
    playRound(plan) {
      const seen = [];
      let guard = 0;
      while (api.visible('connCard') && guard++ < 500) {
        const it = api.card();
        if (!it) break;
        seen.push(it.src);
        const wantRight = typeof plan === 'function' ? !!plan(seen.length - 1) : !!plan;
        if (wantRight) api.answerRight(); else api.answerWrong();
        api.next();
      }
      if (guard >= 500) throw new Error('הסבב לא הסתיים אחרי 500 צעדים · לולאה');
      return seen;
    },

    doneText() { const d = doc.getElementById('connDone'); return d ? d.innerHTML : ''; },
    reset() { ctx.connSaveFailed = false; ctx.connQ = []; ctx.connI = 0; ctx.connOk = 0; ctx.connAnswered = false; },
  };
  return api;
}

module.exports = { makeApp, SYMBOLS, HANDLERS, ROOT, appSource, dataSource, setSourceOverride };
