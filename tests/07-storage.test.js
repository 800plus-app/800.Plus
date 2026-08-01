'use strict';
/* localStorage — the only place a learner's progress actually lives.
 *
 * WHY THIS FILE HAS ITS OWN LOADER
 * --------------------------------
 * `_harness/sandbox.js` deliberately does NOT provide a localStorage: every function it lifts is
 * a pure computation, and giving it a fake disk would have been surface with no test behind it.
 * The storage layer is the opposite — it is nothing BUT the disk — so it needs one, and
 * tests/README.md names that as the reason this area was left uncovered ("testable with a
 * localStorage stub and the obvious next thing to add").
 *
 * So the same technique is used, one layer wider: lift the storage symbols out of app.js by name
 * (extract.js, unchanged) and evaluate them against a localStorage stub that behaves like the
 * real one — string values only, insertion-ordered keys, and a byte cap that throws a
 * QuotaExceededError. Nothing about app.js is restated here; every rule under test is the
 * shipped code.
 *
 * ONE DELIBERATE DIFFERENCE FROM _harness/sandbox.js, stated because a reader will notice it:
 * each lifted snippet is evaluated with a `'use strict'` prologue. app.js begins with
 * `'use strict'`, and at least one real failure in this file (markRestored on a corrupt store)
 * exists ONLY in strict mode — in sloppy mode the assignment silently no-ops instead of
 * throwing. A harness that runs the code in a laxer mode than the browser does would report
 * that bug as absent. sandbox.js does not do this because none of its functions assign to a
 * primitive; this one does.
 *
 * HOW TO READ THE ASSERTION MESSAGES
 * ----------------------------------
 * The suite is green, so every test here passes against today's app.js. Some of them pass by
 * pinning behaviour that is a FINDING rather than a specification — a silent truncation, a
 * migration that stamps itself done after a failed write. Those say so in the message, in the
 * form the project already uses for `FREE_PHASE is currently ON` in 04-access.test.js: if you
 * fix the bug, this test goes red and the message tells you to invert it in the same commit.
 * Full write-up: דוחות/בדק-בית-2/04-localstorage.md
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const vm = require('vm');
const { extractAll } = require('./_harness/extract.js');
const { appSource, banks, plain, expectNone } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);

/* ============================ the loader ============================ */

/* Every symbol this file reaches for. Same contract as sandbox.js's SYMBOLS: a rename in app.js
 * throws by name out of extractAll rather than producing a test that quietly passes. */
const SYMBOLS = [
  'storageWarned', 'storageBarOn',
  'ASSOC_MAX', 'ASSOC_BUDGET', 'MAX_SESSIONS', 'DEFAULT_DIR',
  'isObj', 'int0', 'saneRec',
  'NIQ', 'normEn', 'norm',
  'LS', 'shedStorage', 'showStorageBar', 'hideStorageBar',
  'SUF', 'KEY', 'K',
  'loadLangState',
  'undeletedKey', 'markRestored', 'markDeletedAgain', 'restoredMap',
  'mergeProgress', 'absorbDisk',
  'saveAssoc', 'saveStats', 'saveDeleted', 'saveAdded',
  'remapHyphenKeys', 'migrateStores', 'pruneOrphans',
  'levelKeyFor', 'examPreFor', 'sizeKeyFor', 'EXAM_KEY',
  'collectExtras', 'applyExtras', 'wipeAccountKeys', 'bindCacheToUser',
  'exKey', 'UNIT_IDS', 'PREVIEW_UNIT', 'GLOSS_ALT', 'buildBank', 'glossKey', 'buildGlossIndex',
];

/* A localStorage that behaves like the browser's, including the parts that bite:
 *   - values are STRINGS. localStorage.setItem(k, {}) stores "[object Object]", and code that
 *     assumes otherwise breaks only in production.
 *   - getItem of a missing key is null, not undefined.
 *   - key(i)/length walk insertion order, which is what collectExtras and wipeAccountKeys iterate.
 *   - past `cap` total characters, setItem THROWS. Real browsers throw a DOMException whose
 *     .name is 'QuotaExceededError'; app.js only ever catches, so the shape that matters is
 *     "it throws", and the name is set for anyone who later wants to branch on it.
 * `blocked` refuses one specific key regardless of size — the way to model a disk that is full
 * for the big blob but still has room for a flag, without hand-tuning byte counts. */
function makeLocalStorage(opts = {}) {
  const map = new Map();
  const cap = opts.cap == null ? Infinity : opts.cap;
  const quota = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; return e; };
  const api = {
    __map: map,
    blocked: opts.blocked || null,
    used() { let n = 0; for (const [k, v] of map) n += k.length + v.length; return n; },
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
    // test-side reader: the parsed value of a key, or undefined if absent
    read(k) { const v = api.getItem(k); return v == null ? undefined : JSON.parse(v); },
    keys() { return Array.from(map.keys()); },
    /* Test-side WRITER, bypassing cap and blocked. Setting up "this is what was already on the
     * disk before it filled up" through the throwing setItem would mean the fixture cannot be
     * written at all. Only ever used to build a starting state, never by code under test. */
    seed(k, v) { map.set(String(k), typeof v === 'string' ? v : JSON.stringify(v)); return api; },
  };
  Object.defineProperty(api, 'length', { get: () => map.size });
  return api;
}

/* Only what showStorageBar/hideStorageBar touch. They are the user-visible half of a quota
 * failure, so they run for real rather than being stubbed away — a bar that silently fails to
 * appear is exactly the failure mode the bar was added to prevent. */
function makeDocument() {
  const els = {};
  const el = id => {
    const e = { id, className: '', innerHTML: '', _cls: new Set() };
    e.classList = { add: c => e._cls.add(c), remove: c => e._cls.delete(c), contains: c => e._cls.has(c), toggle: () => {} };
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

let cachedLift = null;
function lifted() {
  if (!cachedLift) cachedLift = extractAll(appSource(), SYMBOLS);
  return cachedLift;
}

/* A fresh realm per call. Nothing is shared but the immutable source text and the parsed banks. */
function loadStorage(opts = {}) {
  const b = banks();
  const ls = makeLocalStorage(opts);
  const ctx = {
    console: { log() {}, warn() {}, error(m) { ctx.__errors.push(String(m)); } },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat,
    localStorage: ls,
    document: makeDocument(),
    LANG: opts.lang || 'he',
    PREVIEW: false,
    currentUser: opts.user || null,
    assoc: {}, stats: { words: {}, sessions: [] }, deleted: new Set(), added: [], direction: 'w2m',
    BANK: [], diskAhead: false, session: new Map(),
    queueRemoteSync() { ctx.__syncs++; },
    toast(m) { ctx.__toasts.push(m); },
    __syncs: 0, __toasts: [], __errors: [],
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

/* ---- fixtures ---- */
const R = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);
const S = (t, extra = {}) => Object.assign({ t, scope: 'global', total: 5, correct: 3 }, extra);
/* A bank big enough to clear pruneOrphans's 50-word floor, plus whatever extra terms are asked
 * for. Hermetic on purpose: the migration tests are about the mechanism, and pinning them to
 * whichever real words happen to contain a hyphen today would make a data edit look like a
 * code regression. */
function fakeBank(extra = [], n = 60) {
  const rows = Array.from({ length: n }, (_, i) => ['מילה' + i, 'gloss ' + i]);
  return { '1': rows.concat(extra.map(t => [t, 'gloss'])) };
}
/* The normaliser as it was BEFORE v8 — the rule that produced the keys still sitting on the
 * disks this migration exists for. Restated (it no longer exists in app.js to lift) but only
 * ever used to BUILD a fixture, never to judge one. */
const preV8Key = ctx => t => String(t).normalize('NFKC').replace(ctx.NIQ, '').replace(/[‎‏]/g, '')
  .replace(/["'`׳״.,;:!?()\[\]{}\-–—/|]/g, '').replace(/\s+/g, ' ').trim()
  .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ');

/* ============================ the stub itself ============================ */
/* A stub that lies makes every test below it meaningless, so it is checked first — the same
 * reason 00-harness.test.js checks the scanner before anything uses it. */
describe('the localStorage stub behaves like a browser', () => {
  test('values are stored as strings, and objects stringify the way the real API does', () => {
    const ls = makeLocalStorage();
    ls.setItem('a', 1);
    ls.setItem('b', { x: 1 });
    assert.strictEqual(ls.getItem('a'), '1');
    assert.strictEqual(ls.getItem('b'), '[object Object]');
  });

  test('a missing key reads back as null, not undefined', () => {
    assert.strictEqual(makeLocalStorage().getItem('nope'), null);
  });

  test('length and key(i) walk insertion order — collectExtras and wipeAccountKeys rely on it', () => {
    const ls = makeLocalStorage();
    ['z', 'a', 'm'].forEach(k => ls.setItem(k, '1'));
    assert.strictEqual(ls.length, 3);
    assert.deepStrictEqual([0, 1, 2].map(i => ls.key(i)), ['z', 'a', 'm']);
    assert.strictEqual(ls.key(3), null);
  });

  test('past the cap setItem throws, names itself QuotaExceededError, and stores nothing', () => {
    const ls = makeLocalStorage({ cap: 10 });
    assert.throws(() => ls.setItem('key', 'a much longer value'), e => e.name === 'QuotaExceededError');
    assert.strictEqual(ls.getItem('key'), null, 'a rejected write must leave no trace');
  });
});

/* ============================ LS.get ============================ */
describe('LS.get — nothing read back from disk is trusted', () => {
  const STORES = ['hw_stats', 'hw_assoc', 'hw_deleted', 'hw_added', 'hw_dir', 'hw_migr',
                  'hw_undeleted', 'hw_exam:3', 'hw_level_he', 'hw_owner', 'hw_lang'];

  test('a missing key returns the default', () => {
    const c = loadStorage();
    assert.deepStrictEqual(plain(c.LS.get('nothing_here', { d: 1 })), { d: 1 });
  });

  test('truncated JSON returns the default instead of throwing', () => {
    const c = loadStorage();
    c.ls.setItem('hw_stats', '{"words":{"a":');          // a write cut off mid-flight
    assert.strictEqual(c.LS.get('hw_stats', 'FALLBACK'), 'FALLBACK');
  });

  test('EVERY store survives a corrupt value — none of them throws on read', () => {
    const c = loadStorage();
    const junk = ['{oops', '[1,', 'undefined', '', ' ', 'NaN', "{'single':1}"];
    const threw = [];
    for (const k of STORES) for (const j of junk) {
      c.ls.setItem(k, j);
      try { c.LS.get(k, 'D'); } catch (e) { threw.push(`${k} = ${JSON.stringify(j)} -> ${e.message}`); }
    }
    none(threw, 'LS.get threw on a corrupt value — a boot that throws here shows a blank app:');
  });

  test('a stored null reads as the default, so "written as null" and "never written" are the same', () => {
    const c = loadStorage();
    c.ls.setItem('k', 'null');
    assert.strictEqual(c.LS.get('k', 'D'), 'D');
  });

  test('false, 0 and "" are values, NOT missing — the rule is v==null, not falsiness', () => {
    const c = loadStorage();
    for (const [stored, expected] of [['false', false], ['0', 0], ['""', '']]) {
      c.ls.setItem('k', stored);
      assert.strictEqual(c.LS.get('k', 'D'), expected,
        `${stored} came back as the default; a stored 0 must not read as "never set"`);
    }
  });

  test('LS.get does not check SHAPE — it hands back whatever parsed', () => {
    /* This is why loadLangState/saneRec exist and why every caller has to guard. Pinned so that
     * a future "LS.get should validate" change is a decision rather than a surprise. */
    const c = loadStorage();
    c.ls.setItem('hw_stats', '"a string"');
    assert.strictEqual(c.LS.get('hw_stats', {}), 'a string');
    c.ls.setItem('hw_deleted', '{"not":"an array"}');
    assert.deepStrictEqual(plain(c.LS.get('hw_deleted', [])), { not: 'an array' });
  });

  test('LS.del removes the key and never throws on one that was never there', () => {
    const c = loadStorage();
    c.ls.setItem('k', '1');
    c.LS.del('k');
    assert.strictEqual(c.ls.getItem('k'), null);
    assert.doesNotThrow(() => c.LS.del('never_existed'));
  });
});

/* ============================ LS.set — a full disk ============================ */
describe('LS.set — a full disk', () => {
  test('a write that fits returns true and lands on disk', () => {
    const c = loadStorage();
    assert.strictEqual(c.LS.set('hw_dir', 'w2m'), true);
    assert.strictEqual(c.ls.read('hw_dir'), 'w2m');
  });

  test('a write that does not fit returns false and stores nothing', () => {
    const c = loadStorage({ cap: 20 });
    assert.strictEqual(c.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3)] }), false);
    assert.strictEqual(c.ls.getItem('hw_stats'), null);
  });

  test('the learner is TOLD: one toast and a standing bar', () => {
    /* The whole point of the bar. A round that is not saved and not announced is a learner who
     * finds out days later that a week of practice is missing. */
    const c = loadStorage({ cap: 20 });
    c.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3)] });
    assert.strictEqual(c.__toasts.length, 1, 'a failed save said nothing');
    assert.ok(/אין מקום/.test(c.__toasts[0]), 'the toast does not mention running out of space');
    assert.strictEqual(c.storageBarOn, true, 'the standing warning bar never went up');
  });

  test('the toast fires once per page life — the bar, not the toast, is the standing signal', () => {
    const c = loadStorage({ cap: 20 });
    for (let i = 0; i < 6; i++) c.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3)] });
    assert.strictEqual(c.__toasts.length, 1, '6 failed writes produced ' + c.__toasts.length + ' toasts');
    assert.strictEqual(c.storageBarOn, true);
  });

  test('the bar says something different depending on whether a cloud copy exists', () => {
    /* Signed in, the data is safe elsewhere and the message is informational. Signed out, this
     * is the only copy and the message has to say so. */
    const anon = loadStorage({ cap: 20 });
    anon.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3)] });
    const anonText = anon.document.getElementById('stgBar').innerHTML;

    const user = loadStorage({ cap: 20, user: { id: 'u1' } });
    user.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3)] });
    const userText = user.document.getElementById('stgBar').innerHTML;

    assert.notStrictEqual(anonText, userText, 'the bar reads the same signed in and signed out');
    assert.ok(/לא נשמרת/.test(anonText), 'an anonymous learner is not told their progress is not being saved');
    assert.ok(/בחשבון שלך/.test(userText), 'a signed-in learner is not told the account still has them');
  });

  test('the bar comes down again the moment a write succeeds', () => {
    const c = loadStorage({ cap: 40 });
    c.LS.set('hw_stats', { words: {}, sessions: [S(1), S(2), S(3), S(4)] });
    assert.strictEqual(c.storageBarOn, true);
    c.LS.set('a', 1);
    assert.strictEqual(c.storageBarOn, false, 'the bar stayed up after storage started working again');
  });

  test('FINDING: a value JSON cannot serialise fails in TOTAL silence', () => {
    /* JSON.stringify throwing returns false before any of the warning machinery runs: no toast,
     * no bar, no storageWarned. Every other failure path in LS.set tells the learner; this one
     * does not, and the caller (saveStats) discards the false. Today only a cyclic or BigInt
     * value can reach it, which is why this is a hole rather than a live bug — but it is the
     * one write failure the learner can never find out about.
     * If this is fixed, invert the assertions below in the same commit. */
    const c = loadStorage();
    const cyclic = {}; cyclic.self = cyclic;
    assert.strictEqual(c.LS.set('hw_stats', cyclic), false);
    assert.strictEqual(c.__toasts.length, 0, 'a toast now appears — good; update this test');
    assert.strictEqual(c.storageBarOn, false, 'the bar now appears — good; update this test');
  });

  test('a rejected write leaves the previous value on disk intact', () => {
    const c = loadStorage({ cap: 120 });
    c.LS.set('hw_dir', 'w2m');
    const before = c.ls.getItem('hw_dir');
    c.LS.set('hw_dir', 'x'.repeat(300));
    assert.strictEqual(c.ls.getItem('hw_dir'), before, 'a failed write corrupted the value already stored');
  });
});

/* ============================ shedStorage ============================ */
describe('shedStorage — what a quota failure costs', () => {
  const withHistory = n => ({ words: {}, sessions: Array.from({ length: n }, (_, i) => S(i)) });

  test('it trims the live history to 40 rounds and reports that it freed something', () => {
    const c = loadStorage();
    c.stats = withHistory(150);
    assert.strictEqual(c.shedStorage(), true);
    assert.strictEqual(c.stats.sessions.length, 40);
    assert.strictEqual(c.stats.sessions[39].t, 149, 'the trim kept the OLDEST rounds — it must keep the newest');
  });

  test('it also trims the OTHER language, straight off disk', () => {
    const c = loadStorage({ lang: 'he' });
    c.ls.setItem('hw_stats_en', JSON.stringify(withHistory(120)));
    c.shedStorage();
    assert.strictEqual(c.ls.read('hw_stats_en').sessions.length, 40);
  });

  test('with nothing left to shed it returns false, so LS.set stops retrying', () => {
    const c = loadStorage();
    c.stats = withHistory(10);
    assert.strictEqual(c.shedStorage(), false);
  });

  test('the live history is trimmed from MEMORY, so the round that just ended survives', () => {
    /* The reason shedStorage reads `stats` rather than the disk copy: the round that overflowed
     * the quota is the one that is not on disk yet, and an earlier version threw it away. */
    const c = loadStorage();
    c.ls.setItem('hw_stats', JSON.stringify(withHistory(100)));       // disk: rounds 0..99
    c.stats = withHistory(100);
    c.stats.sessions.push(S(999, { total: 7, correct: 7 }));          // memory also has the new one
    c.shedStorage();
    assert.strictEqual(c.stats.sessions[c.stats.sessions.length - 1].t, 999,
      'the round that triggered the overflow was the one thrown away');
  });

  test('FINDING: a quota failure while writing an UNRELATED key spends the practice history', () => {
    /* Concrete: the disk is full and the learner finishes a unit exam. exFinish writes ~40 bytes
     * to hw_exam:3. That write fails, LS.set calls shedStorage, and 110 rounds of practice
     * history are deleted from disk to make room for the score. The exam score is saved. The
     * streak the history feeds is not recoverable on a device with no account.
     * shedStorage is the app's only pressure valve, so this is a trade rather than a mistake —
     * but the trade is made silently, for any key, including flags worth nothing. */
    const c = loadStorage({ blocked: k => k === 'hw_exam:3' });
    c.stats = withHistory(150);
    c.ls.setItem('hw_stats', JSON.stringify(c.stats));
    c.LS.set('hw_exam:3', [{ t: 1, pct: 80, n: 10 }]);
    assert.strictEqual(c.ls.read('hw_stats').sessions.length, 40,
      'the on-disk history was NOT trimmed — if that is a fix, invert this test in the same commit');
    assert.strictEqual(c.stats.sessions.length, 40);
  });

  test('FINDING: the history is spent even when the retry then fails too', () => {
    /* The worst shape of the same trade. Everything is refused, so shedding buys nothing — but
     * it happens first and unconditionally, and by the time LS.set returns false the learner is
     * down 110 rounds AND the write they asked for did not land. */
    const c = loadStorage({ blocked: () => true });
    c.stats = withHistory(150);
    assert.strictEqual(c.LS.set('hw_celebrated', { 'he:unit:3': 1 }), false);
    assert.strictEqual(c.stats.sessions.length, 40,
      'the history is no longer trimmed on a failed retry — if that is a fix, invert this test');
  });

  test('FINDING: sessions are the ONLY thing shed — assoc, added and exam history are never touched', () => {
    /* stats.sessions is a few KB. The association store is allowed 300,000 characters PER
     * LANGUAGE by ASSOC_BUDGET, which is the bulk of a 5MB quota, and nothing sheds it. A
     * learner whose disk is full because of associations gets their practice history deleted
     * instead, repeatedly, and it never helps. */
    const c = loadStorage();
    c.stats = { words: {}, sessions: [] };
    c.assoc = { a: 'x'.repeat(5000) };
    c.added = [['w', 'g']];
    c.ls.setItem('hw_assoc', JSON.stringify(c.assoc));
    c.ls.setItem('hw_exam:3', JSON.stringify([{ t: 1, pct: 1, n: 1 }]));
    assert.strictEqual(c.shedStorage(), false, 'shedStorage now frees something other than sessions — update this test');
    assert.strictEqual(c.ls.read('hw_assoc').a.length, 5000, 'associations were shed');
    assert.strictEqual(c.ls.read('hw_exam:3').length, 1, 'exam history was shed');
  });
});

/* ============================ loadLangState ============================ */
describe('loadLangState — coercing whatever is on disk', () => {
  const JUNK = ['"a string"', '42', '[1,2,3]', 'true', 'null', '{oops'];

  test('junk of every type in every store loads to an empty, usable state and never throws', () => {
    const bad = [];
    for (const j of JUNK) {
      const c = loadStorage();
      for (const k of ['hw_stats', 'hw_assoc', 'hw_deleted', 'hw_added', 'hw_dir']) c.ls.setItem(k, j);
      try {
        c.loadLangState();
        if (Object.keys(c.stats.words).length) bad.push(`${j}: invented ${Object.keys(c.stats.words).length} words`);
        if (c.stats.sessions.length) bad.push(`${j}: invented sessions`);
        if (Object.keys(c.assoc).length) bad.push(`${j}: invented associations`);
        if (c.deleted.size) bad.push(`${j}: invented deletions`);
        if (c.added.length) bad.push(`${j}: invented personal words`);
        if (c.direction !== c.DEFAULT_DIR) bad.push(`${j}: direction became ${c.direction}`);
      } catch (e) { bad.push(`${j}: THREW ${e.message}`); }
    }
    none(bad, 'a corrupt store did not load cleanly — this runs on every enterLang():');
  });

  test('a corrupt word record is coerced by saneRec rather than propagated', () => {
    const c = loadStorage();
    c.ls.setItem('hw_stats', JSON.stringify({
      words: { w: { seen: 'lots', first: null, ever: undefined, wrong: NaN, level: 99, last: -5 } },
      sessions: [],
    }));
    c.loadLangState();
    const r = plain(c.stats.words.w);
    assert.deepStrictEqual(r, { seen: 0, first: 0, ever: 0, wrong: 0, level: 3, last: 0 });
    none(Object.entries(r).filter(([, v]) => !Number.isFinite(v)).map(([k, v]) => `${k} = ${v}`),
      'a non-finite value reached the stats model — one NaN turns every counter into NaN forever:');
  });

  test('the level-test marker survives the load', () => {
    const c = loadStorage();
    c.ls.setItem('hw_stats', JSON.stringify({ words: { w: R({ level: 3, src: 'lv' }) }, sessions: [] }));
    c.loadLangState();
    assert.strictEqual(c.stats.words.w.src, 'lv',
      'src is the only way to tell a level-test result from real practice, and the undo needs it');
  });

  test('the session history is capped on LOAD, not only on write', () => {
    const c = loadStorage();
    c.ls.setItem('hw_stats', JSON.stringify({ words: {}, sessions: Array.from({ length: 500 }, (_, i) => S(i)) }));
    c.loadLangState();
    assert.strictEqual(c.stats.sessions.length, c.MAX_SESSIONS);
    assert.strictEqual(c.stats.sessions[c.MAX_SESSIONS - 1].t, 499, 'the cap kept the oldest rounds');
  });

  test('non-object rows in the history are dropped', () => {
    const c = loadStorage();
    c.ls.setItem('hw_stats', JSON.stringify({ words: {}, sessions: [S(1), null, 'x', 42, [], S(2)] }));
    c.loadLangState();
    assert.strictEqual(c.stats.sessions.length, 2);
  });

  test('deleted keeps strings only, added keeps [string,string] pairs with content', () => {
    const c = loadStorage();
    c.ls.setItem('hw_deleted', JSON.stringify(['ok', 42, null, { a: 1 }, '']));
    c.ls.setItem('hw_added', JSON.stringify([['w', 'g'], ['', 'no key'], ['no gloss', ''], 'junk', null, ['w2', 'g2', 'extra']]));
    c.loadLangState();
    assert.deepStrictEqual(Array.from(c.deleted), ['ok', ''],
      'the deletion list took a non-string — buildBank compares it against normalised keys');
    assert.deepStrictEqual(plain(c.added), [['w', 'g'], ['w2', 'g2', 'extra']]);
  });

  test('an unrecognised direction falls back to the app default, a saved one always wins', () => {
    for (const [stored, want] of [['"m2w"', 'm2w'], ['"w2m"', 'w2m'], ['"mixed"', 'mixed'],
                                  ['"sideways"', null], ['42', null], ['null', null]]) {
      const c = loadStorage();
      c.ls.setItem('hw_dir', stored);
      c.loadLangState();
      assert.strictEqual(c.direction, want == null ? c.DEFAULT_DIR : want, `hw_dir = ${stored}`);
    }
  });

  test('FINDING: saneRec clamps `level` but puts no ceiling on `seen` or `last`', () => {
    /* level is clamped to 0..3; nothing else is. A corrupt `last` of 3.6e16 is a timestamp in the
     * year 1,141,695 — and mergeProgress resolves `level` by "whichever record was written
     * LAST". That record therefore wins every conflict on every device, forever, and the word's
     * level can never be changed again by anything the learner does. tests/README.md already
     * names clock skew as undefended; this is the same door with corruption instead of a clock. */
    const c = loadStorage();
    const r = plain(c.saneRec({ seen: 1e21, last: Number.MAX_SAFE_INTEGER * 4, level: 99, wrong: -3 }));
    assert.strictEqual(r.level, 3, 'level is no longer clamped');
    assert.ok(r.last > 1e15, 'last is now bounded — good; update this test and the report');
    assert.ok(r.seen > 1e20, 'seen is now bounded — good; update this test and the report');
  });
});

/* ============================ the association budget ============================ */
describe('the association budget', () => {
  test('one over-long association is cut to ASSOC_MAX on load', () => {
    const c = loadStorage();
    c.ls.setItem('hw_assoc', JSON.stringify({ w: 'z'.repeat(1000) }));
    c.loadLangState();
    assert.strictEqual(c.assoc.w.length, c.ASSOC_MAX);
  });

  test('a non-string association value is dropped rather than coerced', () => {
    const c = loadStorage();
    c.ls.setItem('hw_assoc', JSON.stringify({ a: 'ok', b: 42, c: null, d: { x: 1 }, e: '' }));
    c.loadLangState();
    assert.deepStrictEqual(plain(c.assoc), { a: 'ok' });
  });

  test('saveAssoc refuses to grow past the budget, tells the learner, and rolls memory back to disk', () => {
    const c = loadStorage();
    c.ls.setItem('hw_assoc', JSON.stringify({ safe: 'on disk' }));
    c.assoc = { safe: 'on disk', huge: 'x'.repeat(c.ASSOC_BUDGET) };
    assert.strictEqual(c.saveAssoc(), false);
    assert.strictEqual(c.__toasts.length, 1, 'the refusal was silent');
    assert.deepStrictEqual(plain(c.assoc), { safe: 'on disk' },
      'memory was left holding a value that is not on disk and never will be');
  });

  test('FINDING: an over-budget store is truncated on LOAD with no toast and no bar', () => {
    /* The `break` in loadLangState keeps whatever fits in insertion order and abandons the rest.
     * saveAssoc, which refuses the same overflow, at least says so. This path says nothing. */
    const c = loadStorage();
    const big = {}; for (let i = 0; i < 2000; i++) big['k' + i] = 'x'.repeat(200);
    c.ls.setItem('hw_assoc', JSON.stringify(big));
    c.loadLangState();
    assert.ok(Object.keys(c.assoc).length < 2000, 'nothing was dropped — update this test');
    assert.strictEqual(c.__toasts.length, 0, 'the learner is now told — good; invert this test');
    assert.strictEqual(c.storageBarOn, false, 'the bar now appears — good; invert this test');
  });

  test('FINDING: …and the next save writes the truncation back over the full copy', () => {
    /* This is what makes the truncation permanent. Load drops 573 associations, the very next
     * saveAssoc SUCCEEDS (the truncated payload is under budget) and overwrites the disk. There
     * is no step at which the learner could have noticed, and no copy left to recover from
     * unless the cloud row still holds them. */
    const c = loadStorage();
    const big = {}; for (let i = 0; i < 2000; i++) big['k' + i] = 'x'.repeat(200);
    c.ls.setItem('hw_assoc', JSON.stringify(big));
    const before = Object.keys(c.ls.read('hw_assoc')).length;
    c.loadLangState();
    const kept = Object.keys(c.assoc).length;
    assert.strictEqual(c.saveAssoc(), true, 'the truncated payload no longer saves — update this test');
    const after = Object.keys(c.ls.read('hw_assoc')).length;
    assert.strictEqual(after, kept);
    assert.ok(after < before, `disk went ${before} -> ${after} associations, silently`);
  });
});

/* ============================ migrations ============================ */
describe('migrateStores / remapHyphenKeys — a one-way door', () => {
  /* The fixture is a key the migration WOULD change — a raw term still carrying its niqqud, the
   * shape every pre-v8 store is full of. A key the normaliser happens to leave alone would make
   * these two tests pass whether the short-circuit works or not. */
  const rawKey = 'כֹּפֶר';

  test('the version stamp is a one-way door: at 8 the migration never runs again', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    assert.notStrictEqual(c.K(rawKey), rawKey, 'fixture is wrong: this key is already normalised');
    c.ls.setItem('hw_migr', '8');
    c.stats = { words: { [rawKey]: R({ seen: 5 }) }, sessions: [] };
    c.migrateStores();
    assert.ok(c.stats.words[rawKey],
      'the migration ran again at version 8 — that is fine, but this test pinned that it does not');
  });

  test('a version written as a STRING still counts as done', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    c.ls.setItem('hw_migr', '"8"');                      // "8" >= 8 coerces to true
    c.stats = { words: { [rawKey]: R({ seen: 5 }) }, sessions: [] };
    c.migrateStores();
    assert.ok(c.stats.words[rawKey], 'a string version no longer short-circuits — update this test');
  });

  test('the v8 full migration folds duplicate keys by SUMMING the counts', () => {
    /* Two raw spellings of one word become one record, and the practice on both is added up
     * rather than one copy winning. This is the rule remapHyphenKeys does NOT follow — see below. */
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    /* The same word written twice: once with niqqud, once without. Before v8 those were two
     * separate records and the learner's practice was split between them. */
    assert.strictEqual(c.K('כֹּפֶר'), c.K('כפר'), 'fixture is wrong: these two do not share a key');
    c.stats = { words: {
      'כֹּפֶר': R({ seen: 4, first: 2, ever: 2, wrong: 1, level: 1, last: 100 }),
      'כפר':    R({ seen: 6, first: 3, ever: 3, wrong: 2, level: 3, last: 200 }),
    }, sessions: [] };
    c.migrateStores();
    const merged = plain(c.stats.words[c.K('כפר')]);
    assert.strictEqual(merged.seen, 10, 'the two records did not add up');
    assert.strictEqual(merged.first, 5);
    assert.strictEqual(merged.level, 3, 'the fold takes the higher level');
    assert.strictEqual(merged.last, 200);
    assert.strictEqual(Object.keys(c.stats.words).length, 1);
  });

  test('re-running the v8 migration on already-migrated data changes nothing', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    c.stats = { words: { 'כֹּפֶר': R({ seen: 4, last: 100 }) }, sessions: [] };
    c.migrateStores();
    const once = plain(c.stats.words);
    c.ls.setItem('hw_migr', '0');                        // force it to run again
    c.migrateStores();
    assert.deepStrictEqual(plain(c.stats.words), once, 'a second migration changed the data');
  });

  test('remapHyphenKeys moves a record from the pre-v8 key to the v8 key', () => {
    const c = loadStorage();
    const term = 'בַּר-מִינָן';
    c.window.UNIT_DATA = fakeBank([term]);
    const oldK = preV8Key(c)(term), newK = c.K(term);
    assert.notStrictEqual(oldK, newK, 'fixture is wrong: this term\'s key did not change at v8');
    c.stats = { words: { [oldK]: R({ seen: 40, first: 30, level: 3, last: 500 }) }, sessions: [] };
    assert.strictEqual(c.remapHyphenKeys(), 1);
    assert.ok(!c.stats.words[oldK], 'the old key was left behind as well');
    assert.strictEqual(c.stats.words[newK].seen, 40, '40 practices did not arrive at the new key');
  });

  test('the remap covers every real bank term whose key changed at v8', () => {
    /* Driven off the shipped data files, not a fixture: if a data edit introduces a term whose
     * pre-v8 key differs and the remap stops reaching it, that record becomes an orphan and
     * pruneOrphans deletes it. Both languages. */
    const stranded = [];
    for (const lang of ['he', 'en']) {
      const c = loadStorage({ lang });
      const data = lang === 'en' ? c.window.UNIT_DATA_EN : c.window.UNIT_DATA;
      const old = lang === 'en'
        ? t => String(t).normalize('NFKC').toLowerCase().replace(/^(to|a|an|the)\s+/, '')
            .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
        : preV8Key(c);
      const pairs = [];
      for (const u in data) for (const p of data[u]) {
        if (!p || !p[0]) continue;
        const nk = c.K(p[0]), ok = old(p[0]);
        if (nk && ok && nk !== ok) pairs.push([p[0], ok, nk]);
      }
      if (!pairs.length) continue;
      c.stats = { words: {}, sessions: [] };
      for (const [, ok] of pairs) c.stats.words[ok] = R({ seen: 7, last: 1 });
      c.remapHyphenKeys();
      for (const [term, ok, nk] of pairs) {
        if (!c.stats.words[nk]) stranded.push(`${lang}: ${term} (${ok} -> ${nk}) never arrived`);
        else if (c.stats.words[ok]) stranded.push(`${lang}: ${term} left a copy at the old key ${ok}`);
      }
    }
    none(stranded, 'a pre-v8 record is not reachable by the remap, so pruneOrphans will delete it:');
  });

  test('FINDING: a remap collision abandons the older record instead of folding it', () => {
    /* migrateStores sums colliding records. remapHyphenKeys does not: `if(stats.words[ok] &&
     * !stats.words[nk])` means that when BOTH keys exist the old one is left where it is — and
     * pruneOrphans, which runs immediately after in enterLang(), deletes it as an orphan.
     * Concrete: the learner practised בַּר-מִינָן 40 times before v8, then once after the update
     * on a device that had already migrated, then the two devices synced. 40 practices and a
     * level-3 mastery are replaced by the one-practice record. */
    const c = loadStorage();
    const term = 'בַּר-מִינָן';
    c.window.UNIT_DATA = fakeBank([term]);
    const oldK = preV8Key(c)(term), newK = c.K(term);
    c.stats = { words: {
      [oldK]: R({ seen: 40, first: 30, ever: 30, wrong: 4, level: 3, last: 500 }),
      [newK]: R({ seen: 1, wrong: 1, level: 0, last: 600 }),
    }, sessions: [] };
    c.remapHyphenKeys();
    assert.strictEqual(c.stats.words[newK].seen, 1,
      'the records now fold — good; invert this test and the report entry in the same commit');
    c.pruneOrphans();
    assert.ok(!c.stats.words[oldK], 'the abandoned record is no longer pruned — update this test');
  });

  test('FINDING: nothing is saved when only an association or a deletion moved', () => {
    /* `moved` counts stats moves only, and `if(moved){ saveStats(); saveAssoc(); saveDeleted(); }`
     * is the only write. A learner who wrote an association for a hyphenated word but never
     * practised it gets the remap in memory and nothing on disk — and migrateStores then stamps
     * hw_migr=8, so it never runs again. On the next boot the old key is read back, the
     * migration is skipped, and pruneOrphans deletes the association for good. */
    const c = loadStorage();
    const term = 'בַּר-מִינָן';
    c.window.UNIT_DATA = fakeBank([term]);
    const oldK = preV8Key(c)(term), newK = c.K(term);

    c.assoc = { [oldK]: 'האסוציאציה שלי' };
    c.deleted = new Set([oldK]);
    c.ls.setItem('hw_assoc', JSON.stringify(c.assoc));
    c.ls.setItem('hw_deleted', JSON.stringify([oldK]));

    assert.strictEqual(c.remapHyphenKeys(), 0, 'moved now counts assoc/deleted too — invert this test');
    assert.ok(c.assoc[newK], 'memory did move to the new key');
    assert.deepStrictEqual(plain(c.ls.read('hw_assoc')), { [oldK]: 'האסוציאציה שלי' },
      'the disk was written — if that is a fix, invert this test in the same commit');

    // …and now the next boot, exactly as enterLang runs it
    c.ls.setItem('hw_migr', '8');
    c.loadLangState();
    c.migrateStores();
    c.pruneOrphans();
    assert.deepStrictEqual(plain(c.assoc), {}, 'the association survived — update this test');
    assert.deepStrictEqual(plain(c.ls.read('hw_assoc')), {},
      'the association is now gone from disk too, permanently');
  });

  test('FINDING: hw_migr is stamped done even when the write it depended on failed', () => {
    /* migrateStores calls saveStats() and then LS.set(hw_migr, 8) without looking at what
     * saveStats returned. On a disk with room for a 9-byte flag but not for a 40KB stats blob —
     * the ordinary shape of a full quota — the stamp lands and the data does not. */
    const c = loadStorage({ blocked: k => k === 'hw_stats' });
    c.window.UNIT_DATA = fakeBank();
    c.stats = { words: { 'כֹּפֶר': R({ seen: 9, level: 3, last: 100 }) }, sessions: [] };
    c.ls.seed('hw_stats', plain(c.stats));
    c.migrateStores();
    assert.strictEqual(c.ls.read('hw_migr'), 8,
      'the stamp is now conditional on the save — good; invert this test and the report');
    assert.ok(c.ls.read('hw_stats').words['כֹּפֶר'],
      'the disk still holds the un-migrated key while the stamp says the migration is done');
  });

  test('FINDING: full scenario — a full disk on one boot erases every record on the next', () => {
    /* The three findings above compose into total, silent, permanent loss:
     *   boot 1  quota is tight. migrateStores normalises 60 records in memory, saveStats fails,
     *           LS.set(hw_migr, 8) succeeds. Disk: old keys + "migration complete".
     *   boot 2  space is free again. loadLangState reads the OLD keys. migrateStores sees 8 and
     *           returns. pruneOrphans finds nothing in the bank under those keys and deletes
     *           every one of them, then saves.
     * Nothing throws. Nothing is logged. The learner opens the app and has never practised. */
    const words = {};
    const bank = fakeBank();
    for (const [term] of bank['1']) words[term + 'ֶ'] = R({ seen: 3, level: 2, last: 100 });  // pre-v8 raw keys

    // ---- boot 1: the stats blob does not fit, the flag does ----
    const b1 = loadStorage({ blocked: k => k === 'hw_stats' });
    b1.window.UNIT_DATA = bank;
    b1.ls.seed('hw_stats', { words, sessions: [] });
    b1.loadLangState();
    assert.strictEqual(Object.keys(b1.stats.words).length, 60, 'fixture did not load');
    b1.migrateStores();
    assert.strictEqual(b1.ls.read('hw_migr'), 8);
    assert.strictEqual(Object.keys(b1.ls.read('hw_stats').words).length, 60, 'the disk was not updated');

    // ---- boot 2: the disk works again ----
    const b2 = loadStorage();
    b2.window.UNIT_DATA = bank;
    b2.ls.seed('hw_migr', b1.ls.read('hw_migr'));
    b2.ls.seed('hw_stats', b1.ls.getItem('hw_stats'));
    b2.loadLangState();
    b2.migrateStores();
    b2.pruneOrphans();
    assert.strictEqual(Object.keys(b2.stats.words).length, 0,
      'records now survive this sequence — that is the fix; invert this test and the report');
    assert.deepStrictEqual(plain(b2.ls.read('hw_stats')), { words: {}, sessions: [] },
      'the empty state was written to disk, so there is nothing left to recover from');
    assert.strictEqual(b2.__toasts.length, 0, 'still silent');
  });
});

/* ============================ pruneOrphans ============================ */
describe('pruneOrphans — the guard in front of a permanent delete', () => {
  test('a bank that did not fully load stops the prune dead', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = { '1': [['אחד', 'one']] };
    c.stats = { words: { a: R({ seen: 1 }) }, sessions: [] };
    c.assoc = { a: 'keep me' };
    c.deleted = new Set(['b']);
    c.pruneOrphans();
    assert.ok(c.stats.words.a, 'a partly loaded data.js deleted the learner\'s progress');
    assert.ok(c.assoc.a);
    assert.ok(c.deleted.has('b'));
    assert.ok(c.__errors.some(m => /pruneOrphans/.test(m)), 'the refusal was not logged');
  });

  test('the floor is 50 live words: 49 refuses, 50 prunes', () => {
    for (const [n, shouldSurvive] of [[49, true], [50, false]]) {
      const c = loadStorage();
      c.window.UNIT_DATA = fakeBank([], n);
      c.stats = { words: { 'not-in-any-bank': R({ seen: 1 }) }, sessions: [] };
      c.pruneOrphans();
      assert.strictEqual(!!c.stats.words['not-in-any-bank'], shouldSurvive, `with ${n} live words`);
    }
  });

  test('a personal word counts as live and is never pruned', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    c.added = [['מילה אישית', 'my own']];
    c.stats = { words: { [c.K('מילה אישית')]: R({ seen: 3 }) }, sessions: [] };
    c.pruneOrphans();
    assert.ok(c.stats.words[c.K('מילה אישית')], 'a word the learner added themselves was pruned');
  });

  test('an orphan record, association and deletion all go, and the result is written', () => {
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    const live = c.K('מילה0');
    c.stats = { words: { ghost: R({ seen: 4 }), [live]: R({ seen: 2 }) }, sessions: [] };
    c.assoc = { ghost: 'orphan', [live]: 'real' };
    c.deleted = new Set(['ghost', live]);
    c.pruneOrphans();
    assert.deepStrictEqual(Object.keys(plain(c.stats.words)), [live]);
    assert.deepStrictEqual(Object.keys(plain(c.assoc)), [live]);
    assert.deepStrictEqual(Array.from(c.deleted), [live]);
    assert.ok(c.ls.read('hw_stats'), 'the prune was not persisted, so it runs again every boot');
    assert.strictEqual(c.ls.read('hw_stats').words[live].seen, 2, 'a surviving record was altered');
  });
});

/* ============================ the restore log ============================ */
describe('the restore log (hw_undeleted)', () => {
  test('a restore is written and read back', () => {
    const c = loadStorage();
    c.markRestored('word');
    assert.ok(c.restoredMap().word > 0);
    assert.ok(c.ls.read('hw_undeleted').word > 0);
  });

  test('deleting the same word again drops the restore, so the last explicit action stands', () => {
    const c = loadStorage();
    c.markRestored('word');
    c.markDeletedAgain('word');
    assert.deepStrictEqual(plain(c.restoredMap()), {});
  });

  test('the falsy corrupt values the ||{} guard was written for are handled', () => {
    for (const junk of ['0', 'null', 'false', '""']) {
      const c = loadStorage();
      c.ls.setItem('hw_undeleted', junk);
      assert.doesNotThrow(() => c.markRestored('word'), `hw_undeleted = ${junk}`);
      assert.ok(c.ls.read('hw_undeleted').word > 0);
    }
  });

  test('FINDING: a TRUTHY non-object on disk makes markRestored throw', () => {
    /* `LS.get(k,{})||{}` catches 0, null, false and "" and nothing else. A string, a number or
     * true passes the guard and `m[k]=Date.now()` then assigns to a primitive — which app.js's
     * own `'use strict'` turns into a TypeError. It is raised inside the click handler for
     * "שחזר מחיקות" (app.js:1534), so the handler dies before `deleted=new Set()` and
     * `saveDeleted()`: the button does nothing at all, with no error on screen. Worse at
     * app.js:1535, where records are deleted from stats.words in the same loop — a throw there
     * leaves memory half-emptied and the matching saveStats() never runs.
     * Only external corruption can put such a value there today (nothing in app.js writes one),
     * which is why this is a defensive hole rather than a live bug — but the ||{} guard shows
     * the case was meant to be covered, and it covers half of it. */
    /* `assert.throws(fn, TypeError)` does NOT work here: the error is constructed inside the vm
     * and does not share a prototype with this realm's TypeError — the same cross-realm trap
     * tests/README.md records for deepStrictEqual. Match on .name instead. */
    for (const junk of ['"junk"', '42', 'true']) {
      const c = loadStorage();
      c.ls.setItem('hw_undeleted', junk);
      assert.throws(() => c.markRestored('word'), e => e.name === 'TypeError',
        `hw_undeleted = ${junk} no longer throws — that is the fix; invert this test`);
    }
  });

  test('FINDING: an ARRAY on disk swallows the restore silently', () => {
    /* An array passes `||{}`, accepts the property assignment, and then JSON.stringify drops
     * every non-index property — so the write "succeeds" and stores []. The learner presses
     * restore, the word comes back, and the next sync re-deletes it because mergeProgress found
     * no record of the restore. No throw, no message. */
    const c = loadStorage();
    c.ls.setItem('hw_undeleted', '[]');
    c.markRestored('word');
    assert.deepStrictEqual(plain(c.ls.read('hw_undeleted')), [],
      'the restore is now recorded — good; invert this test and the report entry');
    assert.strictEqual(c.restoredMap().word, undefined);
  });

  test('FINDING: the restore log is never pruned and never leaves the device', () => {
    /* pruneOrphans clears stats, assoc and deleted of words that left the bank; hw_undeleted is
     * not in that list, so an entry for a removed word stays forever. collectExtras does not
     * gather it either, so a restore made on the phone is unknown to the laptop — which
     * app.js:2721 states plainly as a known limit, and this pins it so it stays stated. */
    const c = loadStorage();
    c.window.UNIT_DATA = fakeBank();
    c.markRestored('מילה-שכבר-לא-במאגר');
    c.pruneOrphans();
    assert.ok(c.ls.read('hw_undeleted')['מילה-שכבר-לא-במאגר'],
      'the restore log is now pruned — good; update this test');
    assert.ok(!JSON.stringify(plain(c.collectExtras('he'))).includes('undeleted'),
      'the restore log now syncs — good; update this test and app.js:2721');
  });
});

/* ============================ absorbDisk ============================ */
describe('absorbDisk — the second tab', () => {
  test('a round written by the other tab is merged in, not overwritten', () => {
    const c = loadStorage();
    c.stats = { words: { mine: R({ seen: 5, last: 10 }) }, sessions: [S(1)] };
    c.diskAhead = true;
    c.ls.setItem('hw_stats', JSON.stringify({ words: { theirs: R({ seen: 3, last: 20 }) }, sessions: [S(2)] }));
    c.absorbDisk();
    assert.deepStrictEqual(Object.keys(plain(c.stats.words)).sort(), ['mine', 'theirs']);
    assert.strictEqual(c.stats.sessions.length, 2, 'the other tab\'s round was dropped');
  });

  test('a corrupt disk copy loses nothing that is in memory', () => {
    const c = loadStorage();
    c.stats = { words: { mine: R({ seen: 5, last: 10 }) }, sessions: [S(1)] };
    c.assoc = { mine: 'keep' };
    c.diskAhead = true;
    c.ls.setItem('hw_stats', '{not json');
    c.ls.setItem('hw_assoc', '"a string"');
    assert.doesNotThrow(() => c.absorbDisk());
    assert.strictEqual(c.stats.words.mine.seen, 5, 'a corrupt disk copy erased memory');
    assert.strictEqual(c.assoc.mine, 'keep');
  });

  test('an empty disk is left alone rather than merged in as emptiness', () => {
    const c = loadStorage();
    c.stats = { words: { mine: R({ seen: 5, last: 10 }) }, sessions: [S(1)] };
    c.diskAhead = true;
    c.absorbDisk();
    assert.strictEqual(c.stats.words.mine.seen, 5);
    assert.strictEqual(c.diskAhead, false, 'the flag was not cleared, so every later save re-merges');
  });

  test('with the flag down it is a no-op, so an ordinary save costs nothing', () => {
    const c = loadStorage();
    c.stats = { words: { mine: R({ seen: 5, last: 10 }) }, sessions: [] };
    c.ls.setItem('hw_stats', JSON.stringify({ words: { theirs: R({ seen: 3, last: 20 }) }, sessions: [] }));
    c.absorbDisk();
    assert.deepStrictEqual(Object.keys(plain(c.stats.words)), ['mine']);
  });
});

/* ============================ account keys ============================ */
describe('account keys — one device, one owner', () => {
  test('wipeAccountKeys sweeps keys built at RUNTIME, which a hand-kept list could not', () => {
    const c = loadStorage();
    for (const k of ['hw_stats', 'hw_exam:3', 'hw_exam_en:7', 'hw_level_he', 'hw_lang', 'hw_notifDay'])
      c.ls.setItem(k, '1');
    c.wipeAccountKeys();
    none(c.ls.keys().filter(k => k.startsWith('hw_')),
      'a key belonging to the previous account survived a change of owner:');
  });

  test('…and spares the three device-level keys and anything not hw_', () => {
    const c = loadStorage();
    for (const k of ['hw_owner', 'hw_seenIntro', 'hw_instDismissed', 'sb-auth-token', 'hw_stats'])
      c.ls.setItem(k, '1');
    c.wipeAccountKeys();
    assert.deepStrictEqual(c.ls.keys().sort(),
      ['hw_instDismissed', 'hw_owner', 'hw_seenIntro', 'sb-auth-token'].sort());
  });

  test('a change of owner wipes the cache and the memory behind it', () => {
    const c = loadStorage();
    c.ls.setItem('hw_owner', '"u1"');
    c.ls.setItem('hw_stats', '{"words":{"a":{}},"sessions":[]}');
    c.stats = { words: { a: R({ seen: 1 }) }, sessions: [] };
    c.assoc = { a: 'x' }; c.deleted = new Set(['b']); c.added = [['w', 'g']];
    c.bindCacheToUser('u2', false);
    assert.strictEqual(c.ls.getItem('hw_stats'), null);
    assert.deepStrictEqual(plain(c.stats), { words: {}, sessions: [] },
      'memory still held the previous account\'s progress, ready to be pushed to the new one');
    assert.strictEqual(c.LANG, null, 'LANG survived, so the next save would write to a stale row');
    assert.strictEqual(c.ls.read('hw_owner'), 'u2');
  });

  test('the same owner signing in again keeps everything', () => {
    const c = loadStorage();
    c.ls.setItem('hw_owner', '"u1"');
    c.ls.setItem('hw_stats', '{"words":{"a":{}},"sessions":[]}');
    c.bindCacheToUser('u1', false);
    assert.ok(c.ls.read('hw_stats').words.a, 'signing back in wiped the cache');
    assert.strictEqual(c.LANG, 'he');
  });

  test('a preview cache is adopted on sign-UP and discarded on sign-IN', () => {
    /* The landing page promises a visitor their practice is kept. Adopting on sign-in instead
     * would merge a stranger's demo into an existing account, which is the leak the owner stamp
     * exists to stop — so the promise holds for exactly one of the two paths. */
    for (const [adopt, kept] of [[true, true], [false, false]]) {
      const c = loadStorage();
      c.ls.setItem('hw_owner', '"preview"');
      c.ls.setItem('hw_stats', '{"words":{"a":{}},"sessions":[]}');
      c.bindCacheToUser('u9', adopt);
      assert.strictEqual(!!c.ls.getItem('hw_stats'), kept, `adopt=${adopt}`);
      assert.strictEqual(c.ls.read('hw_owner'), 'u9');
    }
  });
});

describe('extras — the progress that is not in hw_stats', () => {
  test('collectExtras gathers the level result, the round size and every exam key', () => {
    const c = loadStorage({ lang: 'he' });
    c.ls.setItem('hw_level_he', '"B2"');
    c.ls.setItem('hw_size', '30');
    c.ls.setItem('hw_exam:3', JSON.stringify([{ t: 1, pct: 80, n: 10 }]));
    c.ls.setItem('hw_exam:7', JSON.stringify([{ t: 2, pct: 90, n: 10 }]));
    c.ls.setItem('hw_exam_en:1', JSON.stringify([{ t: 3, pct: 50, n: 10 }]));   // the other language
    c.ls.setItem(c.EXAM_KEY, '"2026-09-01"');
    const ex = plain(c.collectExtras('he'));
    assert.strictEqual(ex.level, 'B2');
    assert.strictEqual(ex.size, 30);
    assert.strictEqual(ex.exam, '2026-09-01');
    assert.deepStrictEqual(Object.keys(ex.exams).sort(), ['3', '7'],
      'collectExtras crossed the language boundary');
  });

  test('applyExtras is additive — a local value is never replaced by an older row', () => {
    const c = loadStorage({ lang: 'he' });
    c.ls.setItem('hw_level_he', '"C1"');
    c.ls.setItem('hw_size', '50');
    c.applyExtras('he', { level: 'A1', size: 10, exam: '2026-01-01' });
    assert.strictEqual(c.ls.read('hw_level_he'), 'C1', 'a device that is ahead was pulled backwards');
    assert.strictEqual(c.ls.read('hw_size'), 50);
    assert.strictEqual(c.ls.read(c.EXAM_KEY), '2026-01-01', 'an absent value should still be filled');
  });

  test('exam histories from two devices are unioned, deduped, sorted and capped at 20', () => {
    const c = loadStorage({ lang: 'he' });
    const shared = { t: 100, pct: 70, n: 10 };
    c.ls.setItem('hw_exam:3', JSON.stringify([shared, { t: 300, pct: 90, n: 10 }]));
    c.applyExtras('he', { exams: { '3': [shared, { t: 200, pct: 80, n: 10 }] } });
    const rows = plain(c.ls.read('hw_exam:3'));
    assert.deepStrictEqual(rows.map(r => r.t), [100, 200, 300], 'the shared attempt was double-counted');

    c.ls.setItem('hw_exam:9', JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ t: i, pct: i, n: 10 }))));
    c.applyExtras('he', { exams: { '9': [{ t: 999, pct: 99, n: 10 }] } });
    const capped = plain(c.ls.read('hw_exam:9'));
    assert.strictEqual(capped.length, 20);
    assert.strictEqual(capped[19].t, 999, 'the cap dropped the newest attempt');
  });

  test('junk from the cloud never throws and never destroys a local history', () => {
    const c = loadStorage({ lang: 'he' });
    c.ls.setItem('hw_exam:3', JSON.stringify([{ t: 1, pct: 80, n: 10 }]));
    const bad = [];
    for (const junk of [null, undefined, 'x', 42, [], { exams: 'nope' }, { exams: { '3': 'nope' } },
                        { exams: { '3': [null, 'x', 42] } }, { level: 0, size: null }]) {
      try { c.applyExtras('he', junk); } catch (e) { bad.push(`${JSON.stringify(junk)} -> ${e.message}`); }
      const rows = c.ls.read('hw_exam:3');
      if (!Array.isArray(rows) || rows.length !== 1) bad.push(`${JSON.stringify(junk)} destroyed the local history`);
    }
    none(bad, 'applyExtras mishandled a malformed cloud payload:');
  });
});
