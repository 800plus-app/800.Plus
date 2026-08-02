'use strict';
/* A fake Supabase, and store.js running against it inside a vm.
 *
 * WHY A FAKE CLIENT RATHER THAN A FAKE `Store`
 * --------------------------------------------
 * store.js is 224 lines whose entire job is turning a Supabase response into a verdict the app
 * can act on: {ok,data} vs null, true vs false, missingTable vs error. Stubbing `Store` itself
 * would test the app's reaction to verdicts store.js may or may not actually produce — which is
 * precisely the layer where the bug lives ("a failed read that reads as an empty cloud"). So the
 * seam is one level lower: the real store.js runs, and what is replaced is the network.
 *
 * WHAT THE FAKE IS FAITHFUL TO, DELIBERATELY
 * ------------------------------------------
 * 1. **Builders are lazy.** In postgrest-js, `from('t').delete().eq(...)` issues nothing until it
 *    is awaited — the builder is a thenable, not a promise. `adminDeleteUserData` depends on that:
 *    it builds three of them into an array and awaits them one at a time. A fake that fired on
 *    construction would make that function look atomic when it is not. Nothing lands in `calls`
 *    until `then()` is called.
 * 2. **A PostgREST error is a resolved value, not a rejection.** `{data:null, error:{...}}`. This
 *    is the single most important property to copy, because every "did the caller notice?"
 *    question in store.js turns on it: a `try/catch` around a failing write catches nothing.
 * 3. **A transport failure IS a rejection.** fetch dying (offline, DNS, CORS) rejects the
 *    builder. Both shapes exist in the real client and store.js treats them differently.
 * 4. **Responses can be slow.** `respond` may return a promise, so "the request was issued but
 *    nobody waited for the answer" is expressible — which is what store.js does on sign-in.
 *
 * WHAT IT IS NOT: a database. Nothing is stored, no RLS is simulated, no constraint is enforced.
 * Every response is scripted by the test. That is the point — the interesting cases (a dropped
 * read, a half-projected row, a token that changed mid-sync) are exactly the ones a working
 * database will not produce on demand.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { loadApp } = require('./sandbox.js');
const { codeMask, codeMatches } = require('./scan.js');
const { extractFunction } = require('./extract.js');

const ROOT = path.join(__dirname, '..', '..');

let cachedStore = null;
function storeSource() {
  if (cachedStore == null) cachedStore = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
  return cachedStore;
}

/* A PostgREST error the way it actually arrives: a plain object with a code, not an Error. */
function pgError(code, message) {
  return { code, message: message || 'scripted failure ' + code, details: null, hint: null };
}
/* The named ones store.js reacts to, plus the ordinary ways a request dies. */
const ERRORS = {
  missingTable: () => pgError('42P01', 'relation "public.feedback" does not exist'),
  missingFn: () => pgError('42883', 'function public.shared_assoc(text, text) does not exist'),
  rls: () => pgError('42501', 'new row violates row-level security policy'),
  multipleRows: () => pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned'),
  timeout: () => pgError('57014', 'canceling statement due to statement timeout'),
  down: () => pgError(undefined, 'FetchError: request to https://x.supabase.co failed'),
};

/* `respond` may be a function (op) => result, or a map keyed by "<table>.<verb>" / "rpc.<fn>",
 * with an optional `default`. The map form keeps the tests one line long. */
function toResponder(spec) {
  if (typeof spec === 'function') return spec;
  const map = spec || {};
  return op => {
    const key = op.verb === 'rpc' ? 'rpc.' + op.fn : op.table + '.' + op.verb;
    const hit = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : map.default;
    const r = typeof hit === 'function' ? hit(op) : hit;
    return r === undefined ? { data: null, error: null } : r;
  };
}

function makeSupabase(opts = {}) {
  const calls = [];            // every op that was actually issued (i.e. awaited)
  const authCalls = [];        // getUser / getSession / signIn / signUp / signOut, in order
  const authListeners = [];
  const respond = toResponder(opts.respond);
  let getUserN = 0;

  /* `user` may be an object, null, a function of the call index (an account that changes
   * mid-flight), or an Error to throw (the auth endpoint itself failing). */
  function resolveUser() {
    const n = getUserN++;
    const u = typeof opts.user === 'function' ? opts.user(n)
      : opts.user === undefined ? { id: 'u-1', email: 'learner@example.com' } : opts.user;
    if (u instanceof Error) throw u;
    return u || null;
  }

  function record(op) {
    op.n = calls.length;
    op.settled = false;
    calls.push(op);
    let out;
    try { out = respond(op); } catch (e) { op.settled = true; return Promise.reject(e); }
    return Promise.resolve(out).then(r => {
      op.settled = true;
      const res = r || {};
      return { data: res.data === undefined ? null : res.data, error: res.error || null,
               count: res.count === undefined ? null : res.count, status: res.status };
    }, e => { op.settled = true; throw e; });
  }

  /* One chainable, lazy builder. Every filter is remembered so a test can assert that the read
   * really was scoped to this user and this language — a mis-edited RLS policy is invisible
   * from here, an unfiltered query is not. */
  function builder(op) {
    const api = {
      __op: op,
      select(columns, options) { op.columns = columns; if (options) op.options = options; return api; },
      eq(col, val) { op.filters.push(['eq', col, val]); return api; },
      neq(col, val) { op.filters.push(['neq', col, val]); return api; },
      order(col, o) { op.order = [col, o]; return api; },
      limit(n) { op.limit = n; return api; },
      maybeSingle() { op.single = 'maybe'; return api; },
      single() { op.single = 'one'; return api; },
      then(onOk, onErr) { return record(op).then(onOk, onErr); },
      catch(f) { return api.then(undefined, f); },
      finally(f) { return api.then(v => { f(); return v; }, e => { f(); throw e; }); },
    };
    return api;
  }
  const start = (table, verb, extra) =>
    builder(Object.assign({ table, verb, filters: [], single: null }, extra));

  const sb = {
    from(table) {
      return {
        select: (columns, options) => start(table, 'select', { columns, options }),
        insert: row => start(table, 'insert', { row }),
        upsert: (row, options) => start(table, 'upsert', { row, options }),
        update: patch => start(table, 'update', { patch }),
        delete: () => start(table, 'delete', {}),
      };
    },
    rpc: (fn, params) => start(null, 'rpc', { fn, params }),
    auth: {
      async getUser() {
        authCalls.push({ m: 'getUser' });
        const u = resolveUser();
        return { data: { user: u }, error: u ? null : (opts.authError || pgError(undefined, 'Auth session missing!')) };
      },
      async getSession() {
        authCalls.push({ m: 'getSession' });
        const s = typeof opts.session === 'function' ? opts.session()
          : opts.session === undefined ? { access_token: 'tok-1', user: { id: 'u-1' } } : opts.session;
        if (s instanceof Error) throw s;
        return { data: { session: s || null }, error: null };
      },
      async signUp(args) {
        authCalls.push({ m: 'signUp', args });
        return opts.signUp || { data: { user: { id: 'u-new' }, session: null }, error: null };
      },
      async signInWithPassword(args) {
        authCalls.push({ m: 'signInWithPassword', args });
        const r = typeof opts.signIn === 'function' ? opts.signIn(args)
          : opts.signIn || { data: { user: { id: 'u-1', email: args && args.email }, session: { access_token: 'tok-1' } }, error: null };
        /* supabase-js fires SIGNED_IN on every successful password sign-in, including the one
         * verifyMyPassword() uses purely as a password check. Copied because that side effect is
         * the interesting part. */
        if (!r.error) for (const cb of authListeners) cb('SIGNED_IN', r.data && r.data.session);
        return r;
      },
      async signOut() { authCalls.push({ m: 'signOut' }); if (opts.signOutThrows) throw opts.signOutThrows; return { error: null }; },
      async resetPasswordForEmail(email, o) { authCalls.push({ m: 'resetPasswordForEmail', email, options: o }); return opts.reset || { data: {}, error: null }; },
      /* Re-sends the sign-up confirmation. Supabase rate-limits this per address (the SMTP
       * screen's "minimum interval per user"), so the interesting case is not success — it is
       * the 429 that comes back when somebody taps twice. */
      async resend(args) {
        authCalls.push({ m: 'resend', args });
        // function form so a test can throw — a dropped connection is not an error value
        if (typeof opts.resend === 'function') return opts.resend(args);
        return opts.resend || { data: {}, error: null };
      },
      onAuthStateChange(cb) { authListeners.push(cb); return { data: { subscription: { unsubscribe() { } } } }; },
    },
  };

  return { sb, calls, authCalls, authListeners,
           of: (table, verb) => calls.filter(c => c.table === table && c.verb === verb),
           last: () => calls[calls.length - 1] };
}

/* store.js, real, in a fresh realm, wired to a fake client. */
function loadStore(opts = {}) {
  const fake = makeSupabase(opts);
  const warnings = [];
  const created = [];
  const win = {
    SUPA_URL: opts.url || 'https://fake.supabase.co',
    SUPA_KEY: opts.key || 'anon-key-xyz',
    supabase: { createClient: (u, k, o) => { created.push({ url: u, key: k, options: o }); return fake.sb; } },
  };
  const ctx = {
    console: { log: () => { }, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')) },
    JSON, Date, Math, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, Promise,
    isNaN, isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
    window: win,
    location: opts.location || { origin: 'https://milim.example', pathname: '/index.html' },
    fetch: opts.fetch || (() => { throw new Error('fetch was called but no stub was given'); }),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(storeSource(), ctx, { filename: 'store.js' });
  if (!ctx.window.Store) throw new Error('store.js no longer sets window.Store — the app loads it by that name');
  return { Store: ctx.window.Store, fake, calls: fake.calls, warnings, created, ctx, win };
}

/* ---------------------------------------------------------------------------------------------
 * The app side of the seam.
 *
 * flushRemoteSync / syncWithRemoteInner are where a store.js verdict becomes a decision about the
 * learner's data, so testing store.js without them would stop one line short of the thing that
 * matters. They are lifted out of app.js the same way everything else in this suite is — with one
 * addition: extract.js matches at `function`, which silently drops a leading `async`, and the
 * lifted text then throws SyntaxError at its first `await`. 08-store.test.js pins that.
 * ------------------------------------------------------------------------------------------- */
function liftAsync(src, name, mask) {
  const code = extractFunction(src, name, mask);
  if (!code) throw new Error(
    `app.js no longer declares a function named ${name}. The sync tests lift it by name — if it ` +
    `was renamed or moved into a closure, update tests/_harness/fakeSupabase.js; do NOT delete the test.`);
  const isAsync = codeMatches(src, new RegExp('\\basync\\s+function\\s+' + name + '\\s*\\('), mask).length > 0;
  return (isAsync ? 'async ' : '') + code;
}

/* app.js's sync functions, running for real, over the real mergeProgress/pruneOrphans, against a
 * real store.js, against a fake cloud. Everything DOM-shaped is stubbed to a no-op; nothing that
 * decides what is written or kept is stubbed. */
function loadSyncLayer(opts = {}) {
  const st = loadStore(opts);
  const ctx = loadApp({ lang: opts.lang || 'he' });          // real bank: pruneOrphans refuses to run without one
  const disk = new Map(opts.disk ? Object.entries(opts.disk) : []);

  ctx.Store = st.Store;
  ctx.currentUser = opts.currentUser === undefined ? { id: 'u-1', email: 'learner@example.com' } : opts.currentUser;
  ctx.syncPending = true;
  /* The default is a NORMALLY LOADED device — enterLang() has run and loadLangState() has moved
   * this language's progress from localStorage into the globals. Every test here that predates
   * the flag assumes exactly that, and it is the state the app is in whenever a learner is
   * actually practising.
   * tests/22-unloaded-sync.test.js turns it off on purpose: that is the welcome screen, where
   * the globals are still at their declared defaults, and syncing from there overwrote a real
   * learner's offline session with an older cloud copy. */
  ctx.langLoaded = opts.langLoaded === undefined ? true : opts.langLoaded;
  ctx.syncTimer = null;
  ctx.syncBusy = false;
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.KEY = k => k;
  ctx.LS = {
    get: (k, d) => (disk.has(k) ? disk.get(k) : d),
    set: (k, v) => { disk.set(k, v); return true; },
  };
  if (!disk.has('hw_owner') && ctx.currentUser) disk.set('hw_owner', ctx.currentUser.id);
  ctx.__disk = disk;
  ctx.__calls = { applyExtras: [], collectExtras: 0, buildBank: 0, renderHome: 0, renderDirSegs: 0 };
  ctx.restoredMap = () => ({});
  ctx.collectExtras = () => { ctx.__calls.collectExtras++; return opts.extras || {}; };
  ctx.applyExtras = (lang, ex) => { ctx.__calls.applyExtras.push([lang, ex]); };
  ctx.renderHome = () => { ctx.__calls.renderHome++; };
  ctx.renderDirSegs = () => { ctx.__calls.renderDirSegs++; };
  ctx.$ = () => ({ classList: { contains: () => true, toggle: () => { }, add: () => { } } });
  const realBuildBank = ctx.buildBank;
  ctx.buildBank = () => { ctx.__calls.buildBank++; return realBuildBank(); };

  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const mask = codeMask(src);
  for (const name of (opts.lift || ['flushRemoteSync', 'syncWithRemoteInner'])) {
    const code = liftAsync(src, name, mask);
    try { vm.runInContext(code, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
    if (typeof ctx[name] !== 'function') throw new Error(`${name} lifted from app.js but is not a function`);
  }
  return Object.assign(st, { ctx, disk });
}

module.exports = { makeSupabase, loadStore, loadSyncLayer, liftAsync, pgError, ERRORS, storeSource, ROOT };
