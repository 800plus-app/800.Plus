'use strict';
/* localStorage מזויף + מרים סמלים שנוגעים בדיסק.
 *
 * למה זה קיים בנפרד מ-_harness/sandbox.js
 * ----------------------------------------
 * sandbox.js **בכוונה** אינו מספק דיסק — כל מה שהוא מרים הוא חישוב טהור, וההערה
 * בראש 07-storage מנמקת את זה במפורש. שכבת האחסון היא ההפך: היא כולה דיסק.
 * 07 פתר את זה עם מרים משלו בתוך הקובץ. הקובץ הזה הוא אותו פתרון, מוצא החוצה,
 * כדי שקובץ בדיקות שני שנוגע בדיסק לא ישכפל את הלוגיקה בשלישית.
 *
 * ⚠ 07-storage מחזיק עותק משלו שקדם לקובץ הזה ולא הועבר לכאן. איחודם הוא צעד
 * נפרד: הקובץ ההוא נושא 103 בדיקות ותו בקרה שמזהה אותו ככלי בינארי בעיני grep,
 * ורפקטור עיוור עליו הוא בדיוק סוג הסיכון שהבדק הזה בא למנוע. נרשם ולא בוצע.
 *
 * הסמנטיקה זהה לזו של 07, כי היא הסמנטיקה של הדפדפן:
 *   · ערכים הם **מחרוזות**. setItem(k,{}) שומר "[object Object]".
 *   · getItem של מפתח חסר מחזיר null ולא undefined.
 *   · key(i)/length הולכים בסדר ההכנסה — זה מה ש-collectExtras ו-wipeAccountKeys סורקים.
 *   · מעל cap תווים, setItem **זורק**.
 */

const { extractAll } = require('./extract.js');
const { appSource, banks } = require('./sandbox.js');

function makeLocalStorage(opts = {}) {
  const map = new Map();
  const cap = opts.cap == null ? Infinity : opts.cap;
  const quota = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; return e; };
  const api = {
    __map: map,
    blocked: opts.blocked || null,
    getItem(k) { k = String(k); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      if (api.blocked && api.blocked(k)) throw quota();
      let after = k.length + v.length;
      for (const [kk, vv] of map) if (kk !== k) after += kk.length + vv.length;
      if (after > cap) throw quota();
      map.set(k, v);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { const ks = Array.from(map.keys()); return i >= 0 && i < ks.length ? ks[i] : null; },
    read(k) { const v = api.getItem(k); return v == null ? undefined : JSON.parse(v); },
    keys() { return Array.from(map.keys()); },
    /* כתיבה מצד הבדיקה בלבד, עוקפת cap ו-blocked. בלעדיה אי אפשר לבנות מצב
       פתיחה של "כך נראה הדיסק לפני שהתמלא". לעולם לא בשימוש הקוד הנבדק. */
    seed(k, v) { map.set(String(k), typeof v === 'string' ? v : JSON.stringify(v)); return api; },
  };
  Object.defineProperty(api, 'length', { get: () => map.size });
  return api;
}

/* רק מה ש-showStorageBar/hideStorageBar נוגעים בו. */
function makeDocument() {
  const els = {};
  const el = id => {
    const e = { id, className: '', innerHTML: '', _cls: new Set() };
    e.classList = { add: c => e._cls.add(c), remove: c => e._cls.delete(c),
                    contains: c => e._cls.has(c), toggle: () => {} };
    return e;
  };
  return {
    body: { appendChild(e) { els[e.id] = e; } },
    getElementById(id) { return els[id] || null; },
    createElement() { return el(''); },
    querySelector() { return null; },
    documentElement: {},
  };
}

/* מרים רשימת סמלים מ-app.js מול דיסק מזויף.
   'use strict' לכל קטע — app.js מתחיל בו, וכשל אמיתי אחד לפחות בפרויקט קיים
   **רק** במצב הזה (השמה לפרימיטיב שב-sloppy עוברת בשקט). מרים שמריץ במצב רפוי
   יותר מהדפדפן ידווח על באג כזה כאילו אינו קיים. אותו נימוק כתוב ב-07. */
function loadWithStorage(symbols, opts = {}) {
  const ls = makeLocalStorage(opts);
  const b = banks();
  const ctx = {
    console: { log() {}, warn(m) { ctx.__warns.push(String(m)); }, error(m) { ctx.__errors.push(String(m)); } },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat,
    localStorage: ls,
    LANG: opts.lang || 'he',
    PREVIEW: false,
    langLoaded: true,
    currentUser: null,
    assoc: {}, stats: { words: {}, sessions: [] }, deleted: new Set(), added: [], direction: 'm2w',
    BANK: [],
    /* ⚠ שני ה-let האלה חייבים להיזרע, ולא רק "כדאי". LS.set נוגע ב-storageBarOn
       בתוך ה-try של הכתיבה המוצלחת; בלעדיו נזרק ReferenceError שנבלע ב-catch —
       והמרים מדמה **דיסק מלא** על דיסק ריק לגמרי. נתפס ב-11.8.2026 בדיוק כך,
       ובלי לשים לב היו נכתבות כאן בדיקות שמפרשות תקלת מרים כהתנהגות האפליקציה. */
    storageBarOn: false,
    storageWarned: false,
    toast() {},
    queueRemoteSync() {},
    flushRemoteSync() {},
    /* showStorageBar/hideStorageBar נוגעים ב-DOM. הם רצים באמת ולא מוחלפים
       בצללית ריקה: פס שנכשל להופיע הוא בדיוק הכשל שהפס נועד למנוע. */
    document: makeDocument(),
    __warns: [], __errors: [],
  };
  ctx.window = { UNIT_DATA: b.he, UNIT_DATA_EN: b.en };
  ctx.globalThis = ctx;
  require('vm').createContext(ctx);

  for (const { name, code } of extractAll(appSource(), symbols)) {
    try { require('vm').runInContext(`'use strict';\n${code}`, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
  }
  const absent = symbols.filter(n => ctx[n] === undefined);
  if (absent.length) throw new Error(`app.js no longer defines: ${absent.join(', ')}`);

  ctx.__ls = ls;
  return ctx;
}

module.exports = { makeLocalStorage, loadWithStorage };
