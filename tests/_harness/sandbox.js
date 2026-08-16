'use strict';
/* Build a sandbox holding the real functions from app.js, running against the real word banks.
 *
 * WHY LIFT FUNCTIONS INSTEAD OF STUBBING A DOM AND LOADING THE WHOLE FILE
 * ---------------------------------------------------------------------
 * The alternative was a document/window/localStorage stub complete enough that `app.js` loads
 * end to end. That was measured, not assumed (see tests/README.md): app.js binds ~90 element
 * handlers at top level and also reaches for localStorage, matchMedia, navigator.serviceWorker,
 * IntersectionObserver, fetch and Supabase before any function is callable. Every one of those
 * is a thing a future edit can add to, and each addition breaks the stub — which means the
 * suite would go red for reasons that have nothing to do with the behaviour under test, and
 * the reflex would be to loosen the stub until it stops complaining.
 *
 * Lifting depends on exactly one property of app.js instead: that the function is still
 * declared at top level under the same name. That is a smaller, more stable surface, and when
 * it does break it breaks with a message naming the symbol (see extract.js) rather than with a
 * TypeError from inside a fake DOM. It is also the approach the project already reached for by
 * hand in scratchpad/nite_v1.js and nite_v3.js, so it is a hardening of a known-good technique
 * rather than a new bet.
 *
 * The cost, stated plainly: anything that only exists inside an event handler or that talks to
 * the DOM is NOT covered here and needs a browser. tests/README.md lists what that leaves out.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAll } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'app.js');

/* Every symbol the suite lifts out of app.js. Order is the order they are evaluated in; it only
 * matters for declarations whose initialiser runs immediately, which is why the plain constants
 * come first. */
const SYMBOLS = [
  // constants and coercion
  'MAX_SESSIONS', 'ASSOC_MAX', 'isObj', 'int0', 'saneRec',
  // normalisation
  'NIQ', 'normEn', 'norm', 'K',
  // Hebrew spelling variants
  'HOLAM', 'YOD', 'Y_VOWELS', 'HE_LETTER', 'VAV',
  'fullSpelling', 'pleneYod', 'pleneVav', 'heForms',
  // HTML escaping, and hiding the answer inside its own gloss (09-mask.test.js)
  'esc', 'CLITIC', 'HSUF', 'heStems', 'maskTerm',
  // bank + shared-gloss index
  'UNIT_IDS', 'PREVIEW_UNIT', 'GLOSS_ALT', 'vetoPut', 'buildBank', 'glossKey', 'glossSenses', 'buildGlossIndex', 'glossAlts',
  /* סובלנות איות · tests/71. הסדר כאן הוא סדר ההערכה, ולכן הקבועים לפני הפונקציות
     שקוראות להם. TERM_VETO ו-SEG_VETO מוצהרים כאן ונבנים ב-buildBank/buildGlossIndex. */
  'TYPO_PARAMS', 'TYPO_ADJ_HE', 'TYPO_ADJ_EN', 'TYPO_HOMO', 'TYPO_OPS',
  'TYPO_MAX_OPS', 'TYPO_RADIUS', 'TYPO_HE_RANGE', 'TYPO_PN', 'TYPO_IX',
  'TERM_VETO', 'SEG_VETO',
  'typoLex', 'lexHit', 'typoTokens', 'typoLexWhole', 'typoLexBlocked',
  'typoTables', 'typoSubKind', 'typoInsKind', 'typoDelKind', 'typoVectors', 'typoShare', 'typoWDist',
  'typoNorm', 'typoLetters', 'typoSuffixes', 'typoInflection',
  'typoDeletions', 'typoIndex', 'typoNearestOther', 'nearMatch', 'typoKeysOf', 'typoOwners',
  'TYPO_GLOSS_RULES', 'TYPO_OR_GUARDS', 'typoSplitOr', 'TYPO_SYN', 'TYPO_SYN_MAP',
  'typoSynMap', 'typoCanon', 'typoSegBlocked',
  /* ⚠ שכבת צירוף המקטעים · שלושת אלה נדרשים יחד. `meaningMatch` קוראת ל-
     `typoSegConcat`, וזו קוראת לשני הקבועים · בלי אחד מהם כל בדיקה שנוגעת
     בהתאמת פירוש נופלת ב-ReferenceError, ו-19 בדיקות מאדימות בשמות שנשמעים
     סמנטיים ("מילה שונה לגמרי עדיין נדחית") בזמן שהסיבה היא סימבול חסר.
     זה קרה כאן פעמיים · קודם על `typoShare`. **פונקציה חדשה ש-meaningMatch או
     isCorrect קוראות לה חייבת להיכנס לרשימה באותו שינוי.** */
  'typoSegConcat', 'TYPO_SEG_CONCAT_MAX', 'TYPO_SEG_CONCAT_EXCEPT',
  'editDist', 'creditSense', 'typoVeto',
  // stats model and the three practice buckets
  'rec', 'scopeWords', 'lvl', 'lastOf', 'wasSkipped', 'seenCount',
  'classify', 'uniqScope', 'newCards', 'weakCards', 'learnedCards', 'weakCtaText',
  'sess', 'commitSession',
  // answer checking
  'isCorrect', 'meaningSegs', 'meaningMatch', 'otherSenses',
  /* מילה עם כמה פירושים אינה נלמדת בפירוש אחד — sensesLeft היא מה שקובע את זה,
     ו-commitSession קוראת לה כדי לחסום את הרמה. */
  'senseCount', 'sensesLeft', 'noteSense', 'particleMatch', 'PARTICLE_STOP',
  /* התצוגה של אותם פירושים. meaningSegsRaw חייבת להיות מורמת יחד עם meaningSegs — כל
     הערך של tests/63 הוא להשוות ביניהן על כל המאגר. */
  'meaningSegsRaw', 'sensesGot', 'senseChips',
  // sync
  'mergeProgress', 'DEFAULT_DIR', 'pruneOrphans',
  // access gate
  'PAST_DUE_GRACE_DAYS', 'FREE_PHASE', 'hasAccess', 'subActive',
  /* ההכרעה של השרת קודמת ל-hasAccess ואינה מחליפה אותה — tests/67 בודק את שתיהן. */
  'ENT_KEY', 'entVerdict',
];

/* Symbols that must exist on the context afterwards. Superset of SYMBOLS: it also names the
 * ones that ride along inside a grouped declaration (const HOLAM=…, QUBUTS=…, HIRIQ=…), so a
 * rename of QUBUTS is caught even though QUBUTS is never extracted by name. */
const REQUIRED = SYMBOLS.concat(['QUBUTS', 'HIRIQ', 'DAGESH',
  /* נוסעים בתוך הצהרה משותפת: const TYPO_MAX_OPS = 3, TYPO_MAX_CANDS = 8 וכו'.
     אי אפשר לחלץ אותם בשמם, ולכן הם נבדקים כאן — שינוי שם ייתפס גם בהם. */
  'TYPO_MAX_CANDS', 'TYPO_LONG', 'TYPO_LEX_MIN']);

let cachedSource = null;
function appSource() {
  if (cachedSource == null) cachedSource = fs.readFileSync(APP, 'utf8');
  return cachedSource;
}

let cachedBanks = null;
function banks() {
  if (cachedBanks) return cachedBanks;
  const w = {};
  const load = f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInNewContext(code, { window: w });
  };
  load('data.js');
  load('data-en.js');
  cachedBanks = { he: w.UNIT_DATA, en: w.UNIT_DATA_EN };
  return cachedBanks;
}

/* A fresh, isolated sandbox. Nothing is shared between calls except the immutable source text
 * and the parsed banks, so tests cannot leak state into each other. */
function loadApp(opts = {}) {
  const lang = opts.lang || 'he';
  const b = banks();

  const ctx = {
    console,
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat,

    /* ---- module-level state of app.js, seeded to its post-boot shape ----
     * These are the `let`s the lifted functions close over. When app.js gains a new one, the
     * lifted function throws `ReferenceError: <name> is not defined` naming it exactly — add it
     * here. (That is not hypothetical: `committedKeys` and `sessionRowId` arrived this way.) */
    LANG: lang,
    PREVIEW: false,
    /* loadLangState() sets this on its way out, and the sync paths refuse to merge until it is
     * true — an unloaded memory is empty, and merging an empty side is an overwrite, not a
     * merge. Seeded false because that is what app.js declares. */
    langLoaded: false,
    assoc: {}, stats: { words: {}, sessions: [] }, deleted: new Set(), added: [], direction: 'm2w',
    BANK: [],
    session: new Map(), sessionScope: 'global', sessionMode: 'all', committed: false,
    committedKeys: new Set(), sessionRowId: null,
    isRetryRound: false,
    currentUser: null,

    // ---- side effects the lifted functions call but that are not under test ----
    // Persistence and network. commitSession() calls both; neither changes what it computes.
    saveStats() { ctx.__saved.stats++; return true; },
    saveAssoc() { ctx.__saved.assoc++; return true; },
    saveDeleted() { ctx.__saved.deleted++; return true; },
    saveAdded() { ctx.__saved.added++; return true; },
    queueRemoteSync() { },
    flushRemoteSync() { },
    toast(m) { ctx.__toasts.push(m); },
    __saved: { stats: 0, assoc: 0, deleted: 0, added: 0 },
    __toasts: [],
  };
  ctx.window = { UNIT_DATA: b.he, UNIT_DATA_EN: b.en };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  /* ‏opts.source · טקסט app.js חלופי, לשימוש שער-שיניים בלבד: הוכחה ששער מסוים
     באמת מאדים דורשת להריץ אותו על קוד שבור, ובלי הווסת הזה היה צריך לכתוב את
     app.js השבור לדיסק ולקוות שהוא נמחק. ברירת המחדל היא הקובץ האמיתי, והמטמון
     שלו אינו נגוע · מוטנט אינו מזהם הרצה הבאה. */
  const src = opts.source || appSource();
  for (const { name, code } of extractAll(src, SYMBOLS)) {
    try { vm.runInContext(code, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}\n---\n${code.slice(0, 400)}\n---`); }
  }

  const absent = REQUIRED.filter(n => ctx[n] === undefined);
  if (absent.length) throw new Error('lifted from app.js but undefined afterwards: ' + absent.join(', '));

  if (opts.bank !== false) ctx.buildBank();
  return ctx;
}

/* ---- helpers for driving a practice round through the app's own scoring ----
 *
 * commitSession() is the real function, lifted. What is restated here is only the three lines
 * finishCard() runs per card (app.js: `const e=sess(w); e.attempts++;` and the ok/!ok branch at
 * app.js:756-758). Those three lines live inside a function that rewrites #feedback innerHTML
 * and cannot be lifted without a DOM. This is the ONLY place the suite re-implements app logic;
 * everything that decides a bucket, a level or a count is the real code.
 *
 * outcome: 'first'    answered correctly on the first attempt of the round
 *          'struggle' answered correctly, but not on the first attempt
 *          'wrong'    never got it in this round (or skipped)
 */
function answerCard(ctx, card, outcome) {
  const e = ctx.sess(card);
  if (outcome === 'first') { e.attempts++; e.mastered = true; if (e.attempts === 1) e.firstTry = true; }
  else if (outcome === 'struggle') { e.attempts++; e.attempts++; e.mastered = true; }
  else if (outcome === 'wrong') { e.attempts++; }
  else throw new Error('unknown outcome ' + outcome);
}

/* Begin a round. Mirrors the reset half of startRound() (app.js:679-681); the rest of that
 * function shuffles a deck and touches the DOM, neither of which affects scoring. */
function startRound(ctx, { scope = 'global', mode = 'all', retry = false } = {}) {
  ctx.session = new Map();
  ctx.committed = false;
  ctx.committedKeys = new Set();
  ctx.sessionRowId = null;
  ctx.sessionScope = scope;
  ctx.sessionMode = mode;
  ctx.isRetryRound = !!retry;
}

/* Practise a list of [card, outcome] pairs as one round, then commit it the way the app does. */
function practiseRound(ctx, pairs, opts = {}) {
  startRound(ctx, opts);
  for (const [card, outcome] of pairs) answerCard(ctx, card, outcome);
  ctx.commitSession();
}

/* Values built INSIDE the sandbox belong to the vm's realm: an array made there does not share
 * a prototype with an array made here, so assert.deepStrictEqual rejects them even when the
 * contents are identical. Round-tripping through JSON brings a value back into this realm — and
 * for anything mergeProgress returns that is also the more honest comparison, because JSON is
 * exactly the form the value takes in localStorage and in Supabase. */
function plain(v) { return JSON.parse(JSON.stringify(v)); }

/* Cross-realm-safe type check: `x instanceof RegExp` is false for a regex literal evaluated in
 * the sandbox, even though it is a perfectly good RegExp. */
function tagOf(v) { return Object.prototype.toString.call(v); }

/* assert.deepStrictEqual(sandboxArray, []) fails on the PROTOTYPE, not the contents — which
 * reads as a mystery red with `actual: []  expected: []`. Every "this list must be empty"
 * assertion in the suite goes through here so that trap cannot be stepped on again. */
function expectNone(assert, list, message) {
  const items = Array.from(list);                    // …and back into this realm
  if (items.length === 0) return;
  const shown = items.slice(0, 8).map(x => '  · ' + x).join('\n');
  assert.fail(`${message}\n${shown}` + (items.length > 8 ? `\n  … and ${items.length - 8} more` : '') +
    `\n(${items.length} total)`);
}

module.exports = { loadApp, startRound, practiseRound, answerCard, banks, appSource, plain, tagOf, expectNone, SYMBOLS, REQUIRED, ROOT };
