'use strict';
/* store.js — the sync layer, against a cloud that misbehaves on cue.
 *
 * 224 lines, zero tests until now, and every one of them stands between a learner's progress and
 * the only other copy of it. The failures here are the quietest in the app: nothing throws,
 * nothing turns red on screen, and the loss is discovered days later as "my words are gone".
 *
 * WHAT IS REAL AND WHAT IS FAKE
 *   real: store.js in full, and — where a verdict has to become a decision — app.js's own
 *         flushRemoteSync / syncWithRemoteInner / mergeProgress / pruneOrphans, lifted.
 *   fake: the network. See tests/_harness/fakeSupabase.js for what the fake copies faithfully
 *         (lazy builders, errors as values, transport failures as rejections) and what it does
 *         not (it is not a database).
 *
 * TESTS NAMED "BUG:" ARE PINNED TO BEHAVIOUR THAT IS WRONG.
 * They assert what the code does today, not what it should do, so the suite stays green and the
 * finding stays visible. Each one says in its message what a fix must change. When somebody
 * fixes the bug the test goes RED, on purpose, naming the line — that is the alarm, not a
 * regression. Do not "repair" such a test by loosening it; invert it.
 *
 * Cross-realm: everything store.js returns is built inside a vm, so its prototypes are not this
 * realm's. Deep comparisons go through plain(); "must be empty" goes through expectNone().
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { plain, expectNone } = require('./_harness/sandbox.js');
const { loadStore, loadSyncLayer, makeSupabase, ERRORS, storeSource } = require('./_harness/fakeSupabase.js');

const none = (list, msg) => expectNone(assert, list, msg);

/* A word record and a progress payload, in the shape mergeProgress and the cloud both use. */
const R = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);
const P = o => Object.assign({ assoc: {}, stats: { words: {}, sessions: [] }, deleted: [], added: [], dir: 'm2w' }, o);
const GHOST = 'מילה-שאיננה-במאגר';

/* ============================================================ the fake itself ============= */
describe('store — the seam is real', () => {
  test('store.js still exposes every function app.js calls on it', () => {
    const { Store } = loadStore();
    /* Lifted from the Store.* call sites in app.js. A rename there is a runtime TypeError in a
     * browser and nothing else — here it is a named red line. */
    const needed = ['signUp', 'signIn', 'signOut', 'resetPasswordFor', 'currentSession', 'onAuthChange',
      'myProfile', 'pullProgress', 'pushProgress', 'sendFeedback', 'adminListFeedback',
      'adminMarkFeedback', 'countOpenFeedback', 'adminListUsers', 'adminUserProgress',
      'adminSendReset', 'shareAssoc', 'unshareAssoc', 'listSharedAssoc', 'verifyMyPassword',
      'adminDeleteUserData', 'deleteMyAccount', 'adminSetSubscription'];
    none(needed.filter(n => typeof Store[n] !== 'function'),
      'app.js calls these on Store and store.js no longer defines them:');
  });

  test('the client is created with persistSession and autoRefreshToken on', () => {
    // Both are load-bearing: without them a reload signs the learner out, and a token that never
    // refreshes turns every later sync into a silent no-op.
    const { created } = loadStore();
    assert.strictEqual(created.length, 1, 'store.js should create exactly one client');
    const o = created[0].options;
    assert.strictEqual(o.auth.persistSession, true);
    assert.strictEqual(o.auth.autoRefreshToken, true);
  });

  test('a query builder issues nothing until it is awaited', async () => {
    /* postgrest-js builders are lazy, and adminDeleteUserData is built on that: it puts three of
     * them in an array and awaits them one at a time. A fake that fired on construction would
     * make that function look atomic. */
    const { sb, calls } = makeSupabase();
    const b = sb.from('progress').delete().eq('user_id', 'x');
    assert.strictEqual(calls.length, 0, 'the fake talked to the server before anyone awaited it');
    await b;
    assert.strictEqual(calls.length, 1);
  });

  test('a scripted failure really reaches store.js', async () => {
    // Proof the fake can fail. Without this, every "handles the error" test below could be green
    // because no error was ever delivered.
    const s = loadStore({ respond: { 'progress.select': { error: ERRORS.down() } } });
    const res = await s.Store.pullProgress('he');
    assert.strictEqual(res.ok, false);
    assert.ok(s.warnings.some(w => /pullProgress failed/.test(w)), 'store.js did not log the failure');
  });
});

/* ================================================ pullProgress: failed read vs empty cloud == */
describe('pullProgress — a failed read must never look like an empty cloud', () => {
  /* The whole reason pullProgress returns {ok,data} instead of a bare value (store.js:45-46).
   * If a dropped request reads as "the cloud is empty", the caller answers by pushing the local
   * state over it — and on a fresh device the local state is nothing at all. */

  test('a row with a payload comes back as ok:true with the payload', async () => {
    const cloud = P({ stats: { words: { w: R({ seen: 3 }) }, sessions: [] } });
    const s = loadStore({ respond: { 'progress.select': { data: { data: cloud, updated_at: '2026-01-01T00:00:00Z' } } } });
    const res = await s.Store.pullProgress('he');
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(plain(res.data), cloud);
  });

  test('no row at all is ok:true with data null — this is the ONLY real "empty cloud"', async () => {
    const s = loadStore({ respond: { 'progress.select': { data: null } } });
    const res = await s.Store.pullProgress('he');
    assert.strictEqual(res.ok, true, 'a genuinely absent row is not a failure — a new account has one');
    assert.strictEqual(res.data, null);
  });

  test('every way a read can fail comes back ok:false, never ok:true', async () => {
    const bad = [];
    for (const [name, mk] of Object.entries(ERRORS)) {
      const s = loadStore({ respond: { 'progress.select': { error: mk() } } });
      const res = await s.Store.pullProgress('he');
      if (res.ok !== false || res.data !== null) bad.push(`${name} -> ${JSON.stringify(plain(res))}`);
    }
    none(bad, 'a failed read reported success — the caller will overwrite the cloud with local state:');
  });

  test('a dropped read is not followed by a write, end to end', async () => {
    const s = loadSyncLayer({ respond: { 'progress.select': { error: ERRORS.timeout() } } });
    const ok = await s.ctx.flushRemoteSync();
    assert.strictEqual(ok, false, 'a flush that never wrote must not report success');
    none(s.fake.of('progress', 'upsert').map(c => JSON.stringify(plain(c.row))),
      'a failed read was followed by a write — this is how a whole account is erased:');
    assert.strictEqual(s.ctx.syncPending, true,
      'the pending save was thrown away by a failed read; nothing would ever retry it');
  });

  test('with no session the read is refused rather than run unscoped', async () => {
    const s = loadStore({ user: null });
    const res = await s.Store.pullProgress('he');
    assert.strictEqual(res.ok, false, 'no user must not read as an empty cloud either');
    none(s.calls.map(c => c.table + '.' + c.verb),
      'a query was sent with no user id to scope it by:');
  });

  test('the read is scoped to this user AND this language, and asks for at most one row', async () => {
    /* RLS scopes it too, but a mis-edited policy is invisible from the client; the explicit
     * filters are the second lock, and maybeSingle() is what makes "no row" expressible. */
    const s = loadStore({ respond: { 'progress.select': { data: null } } });
    await s.Store.pullProgress('en');
    const q = s.fake.of('progress', 'select')[0];
    assert.deepStrictEqual(q.filters, [['eq', 'user_id', 'u-1'], ['eq', 'lang', 'en']]);
    assert.strictEqual(q.single, 'maybe', 'single() would turn "no row yet" into an error');
  });

  test('BUG: a row that comes back without its data column reads as an empty cloud', async () => {
    /* The one hole left in the ok/data distinction. `select('data,updated_at')` is trusted to
     * return both; when the row arrives without the payload — a column-level grant revoked, a
     * proxy truncating the body, a migration that renamed the column and left a view behind —
     * `data ? data.data : null` yields undefined, and store.js still says ok:true.
     * Concrete: the row EXISTS and holds 1,700 practised words. The caller sees ok:true / no
     * data, treats it as a new account, and pushes the local (possibly empty) state over it with
     * an upsert. One request, everything gone.
     * A fix: return ok:false when a row came back but its data field is absent. */
    const s = loadStore({ respond: { 'progress.select': { data: { updated_at: '2026-01-01T00:00:00Z' } } } });
    const res = await s.Store.pullProgress('he');
    assert.strictEqual(res.ok, true, 'if this is now false the hole is closed — invert this test');
    assert.ok(!res.data, 'a row that exists was reported as no data at all');
  });

  test('BUG: a half-projected row makes the app overwrite the cloud, end to end', async () => {
    const s = loadSyncLayer({
      respond: { 'progress.select': { data: { updated_at: '2026-01-01T00:00:00Z' } }, 'progress.upsert': {} },
    });
    s.ctx.stats = { words: {}, sessions: [] };            // a fresh device: nothing to lose locally
    await s.ctx.flushRemoteSync();
    const wrote = s.fake.of('progress', 'upsert');
    assert.strictEqual(wrote.length, 1,
      'pinned to the bug: today the app writes here. When pullProgress starts reporting this as a ' +
      'failed read, this becomes 0 — invert the test then.');
    assert.deepStrictEqual(plain(wrote[0].row.data.stats.words), {},
      'the row that was pushed over the cloud is empty, which is the whole damage');
  });

  test('CONTRACT: a transport failure rejects instead of returning ok:false', async () => {
    /* store.js documents {ok,data} as the answer to every outcome, but a fetch that dies never
     * reaches the `if (error)` branch — it rejects the builder. Every caller today happens to
     * wrap pullProgress in try/catch (app.js:2614, 2749, 2979, 2065); the next one that trusts
     * the documented shape gets an unhandled rejection instead of a verdict. */
    const s = loadStore({ respond: () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(() => s.Store.pullProgress('he'), /Failed to fetch/,
      'if this stops rejecting, the contract is now honest — replace this with an ok:false check');
  });
});

/* ============================================================== pushProgress: the write ==== */
describe('pushProgress — a failed write is invisible', () => {
  test('a successful write upserts the row this device owns, keyed for conflict', async () => {
    const s = loadStore({ respond: { 'progress.upsert': {} } });
    const payload = P({ assoc: { a: 'x' } });
    assert.strictEqual(await s.Store.pushProgress('he', payload), true);
    const w = s.fake.of('progress', 'upsert')[0];
    assert.strictEqual(w.row.user_id, 'u-1');
    assert.strictEqual(w.row.lang, 'he');
    assert.deepStrictEqual(plain(w.row.data), payload);
    assert.strictEqual(w.options.onConflict, 'user_id,lang',
      'without onConflict the upsert inserts a second row, and maybeSingle() then fails forever');
  });

  test('BUG: every failure returns false and nothing throws', async () => {
    /* This is the contract two destructive call sites are unaware of:
     *   app.js:3121-3132 signOutNow — `saved = await flushRemoteSync()` then localStorage.clear()
     *   app.js:3384-3395 accReset  — `await Store.pushProgress(...)` inside a try/catch, then
     *                                wipeAccountKeys(). The catch cannot fire: there is nothing
     *                                to catch. The comment above it says the cloud is emptied
     *                                FIRST so a failure leaves the device intact — it does not. */
    const failures = [];
    for (const [name, mk] of Object.entries(ERRORS)) {
      const s = loadStore({ respond: { 'progress.upsert': { error: mk() } } });
      let threw = false, out;
      try { out = await s.Store.pushProgress('he', P({})); } catch (e) { threw = true; }
      if (threw || out !== false) failures.push(`${name}: threw=${threw} returned=${out}`);
    }
    none(failures, 'a write failure signalled itself some other way than returning false:');
  });

  test('BUG: the user is told nothing — the only trace is a console warning', async () => {
    const s = loadStore({ respond: { 'progress.upsert': { error: ERRORS.rls() } } });
    await s.Store.pushProgress('he', P({}));
    assert.deepStrictEqual(s.warnings.map(w => w.split(' ').slice(0, 2).join(' ')), ['pushProgress failed'],
      'a lost write should reach the learner, not only devtools');
  });

  test('a token that expired mid-session refuses the write instead of guessing an id', async () => {
    const s = loadStore({ user: null });
    assert.strictEqual(await s.Store.pushProgress('he', P({})), false);
    none(s.calls.map(c => c.table + '.' + c.verb), 'a row was written with no signed-in user:');
  });

  test('BUG: there is no retry — one dropped write is one lost round', async () => {
    const s = loadStore({ respond: { 'progress.upsert': { error: ERRORS.timeout() } } });
    await s.Store.pushProgress('he', P({}));
    assert.strictEqual(s.fake.of('progress', 'upsert').length, 1,
      'pinned: a retryable failure (statement timeout) is attempted exactly once and dropped');
  });

  test('the payload is written verbatim — store.js validates nothing', async () => {
    /* Not a bug by itself; stated because it means every guarantee about what lands in the cloud
     * comes from mergeProgress and its callers, and nothing downstream re-checks. */
    const s = loadStore({ respond: { 'progress.upsert': {} } });
    const junk = { stats: { words: { w: { seen: 'lots' } } }, added: [null], nonsense: true };
    await s.Store.pushProgress('he', junk);
    assert.deepStrictEqual(plain(s.fake.of('progress', 'upsert')[0].row.data), junk);
  });

  test('updated_at is stamped from the device clock, not the server', async () => {
    /* The same skew the README names for mergeProgress, one layer down: a phone with a wrong
     * clock stamps the row, and the field is not compared against anything server-side.
     * pullProgress selects updated_at and then discards it (store.js:52,55), so today the stamp
     * is written and never read — a monitoring field, not a conflict resolver. */
    const before = Date.now();
    const s = loadStore({ respond: { 'progress.upsert': {} } });
    await s.Store.pushProgress('he', P({}));
    const t = Date.parse(s.fake.of('progress', 'upsert')[0].row.updated_at);
    assert.ok(t >= before - 1000 && t <= Date.now() + 1000, 'updated_at did not come from this clock');
  });
});

/* ============================================ the real caller: flushRemoteSync on a fake cloud */
describe('flushRemoteSync — the round trip the app actually runs', () => {
  test('an empty cloud is filled from the device', async () => {
    const s = loadSyncLayer({ respond: { 'progress.select': { data: null }, 'progress.upsert': {} } });
    s.ctx.stats = { words: { w: R({ seen: 4, last: 10 }) }, sessions: [] };
    assert.strictEqual(await s.ctx.flushRemoteSync(), true);
    assert.strictEqual(s.fake.of('progress', 'upsert')[0].row.data.stats.words.w.seen, 4);
  });

  test('a cloud row is merged before the write, not overwritten by it', async () => {
    const s = loadSyncLayer({
      respond: {
        'progress.select': { data: { data: P({ stats: { words: { remoteOnly: R({ seen: 7, last: 99 }) }, sessions: [] } }) } },
        'progress.upsert': {},
      },
    });
    s.ctx.stats = { words: { localOnly: R({ seen: 1, last: 5 }) }, sessions: [] };
    await s.ctx.flushRemoteSync();
    const pushed = plain(s.fake.of('progress', 'upsert')[0].row.data.stats.words);
    assert.deepStrictEqual(Object.keys(pushed).sort(), ['localOnly', 'remoteOnly'],
      'the write dropped one side — whichever device syncs last would win outright');
  });

  test('a language switch while the read is in flight cancels the write', async () => {
    let ref = null;
    const s = loadSyncLayer({
      respond: { 'progress.select': () => { ref.LANG = 'en'; return { data: null }; }, 'progress.upsert': {} },
    });
    ref = s.ctx;
    assert.strictEqual(await s.ctx.flushRemoteSync(), false);
    none(s.fake.of('progress', 'upsert').map(c => c.row.lang),
      'Hebrew globals were written into the row named by the old language:');
  });

  test('a cache that belongs to another account is never pushed', async () => {
    const s = loadSyncLayer({ disk: { hw_owner: 'someone-else' }, respond: { 'progress.upsert': {} } });
    assert.strictEqual(await s.ctx.flushRemoteSync(), false);
    none(s.calls.map(c => c.table + '.' + c.verb), 'one account\'s progress was written into another\'s row:');
  });

  test('BUG: a failed write is reported as a completed save', async () => {
    /* The single most expensive line in this file. store.js:64 returns false; app.js:2639-2643
     * awaits it inside a try/catch and returns true regardless, because only a throw is treated
     * as failure. signOutNow (app.js:3121-3132) reads that true and runs localStorage.clear() —
     * erasing the only remaining copy of everything the learner did since the last good sync.
     * The comment at app.js:2583-2586 states the exact invariant this breaks.
     * Fix: `return await Store.pushProgress(...) === true;` — one word. */
    const s = loadSyncLayer({
      respond: { 'progress.select': { data: null }, 'progress.upsert': { error: ERRORS.rls() } },
    });
    s.ctx.stats = { words: { w: R({ seen: 9, last: 1 }) }, sessions: [] };
    const saved = await s.ctx.flushRemoteSync();
    assert.strictEqual(s.fake.of('progress', 'upsert').length, 1, 'sanity: the write really was attempted');
    assert.strictEqual(saved, true,
      'PINNED TO THE BUG: flushRemoteSync says "saved" after the cloud refused the write, and ' +
      'signOutNow clears localStorage on that word. When app.js starts checking pushProgress\'s ' +
      'return value this flips to false — invert this assertion then, do not loosen it.');
  });

  test('BUG: a failed write also clears the pending flag, so nothing retries it', async () => {
    // app.js:2638 sets syncPending=false before the write, on the reasoning that every EARLIER
    // bail-out leaves it queued. The write itself is the one failure that escapes that rule.
    const s = loadSyncLayer({
      respond: { 'progress.select': { data: null }, 'progress.upsert': { error: ERRORS.down() } },
    });
    await s.ctx.flushRemoteSync();
    assert.strictEqual(s.ctx.syncPending, false,
      'pinned: the round is now unsaved AND unqueued. A fix leaves it true so the next flush tries again.');
  });

  test('BUG: the merge in this path is never pruned, so cloud orphans come back and are re-pushed', async () => {
    /* app.js:2760-2766 explains that pruning before the merge is not pruning: the merge is
     * max-based, so every orphan the cloud still holds comes straight back. The prune was added
     * to syncWithRemoteInner — and flushRemoteSync, which the same file calls "the common path"
     * (app.js:2623) because commitSession flushes at the end of EVERY round, still has none.
     * Concrete: the production row of 2,650 records against a bank of 1,717 is re-created by
     * the first finished round after any clean-up, and pushed back to the cloud from there. */
    const s = loadSyncLayer({
      respond: {
        'progress.select': { data: { data: P({ stats: { words: { [GHOST]: R({ seen: 4, last: 9 }) }, sessions: [] }, assoc: { [GHOST]: 'אסוציאציה יתומה' } }) } },
        'progress.upsert': {},
      },
    });
    await s.ctx.flushRemoteSync();
    const pushed = s.fake.of('progress', 'upsert')[0].row.data;
    assert.ok(s.ctx.stats.words[GHOST], 'pinned: the orphan is back in local state after the merge');
    assert.ok(pushed.stats.words[GHOST], 'pinned: and was written straight back to the cloud');
    assert.ok(pushed.assoc[GHOST], 'pinned: its association came back too');
    /* When pruneOrphans() is added after the merge here, all three flip. Invert them then. */
  });
});

/* ================================================= syncWithRemoteInner: the path that prunes = */
describe('syncWithRemoteInner — prune after merge, the way the fix intended', () => {
  const cloudWithGhost = () => ({
    'progress.select': { data: { data: P({ stats: { words: { [GHOST]: R({ seen: 4, last: 9 }) }, sessions: [] }, assoc: { [GHOST]: 'יתומה' } }) } },
    'progress.upsert': {},
  });
  /* This path does NOT await its write (app.js:2775-2776) — see the test at the end of this
   * block — so the upsert lands a turn later than the function resolves. */
  const settle = () => new Promise(r => setImmediate(r));

  test('an orphan the cloud still holds does not survive the sync', async () => {
    const s = loadSyncLayer({ respond: cloudWithGhost() });
    await s.ctx.syncWithRemoteInner('he');
    await settle();
    const pushed = s.fake.of('progress', 'upsert')[0].row.data;
    assert.ok(!s.ctx.stats.words[GHOST], 'the orphan survived locally — the prune ran before the merge, or not at all');
    assert.ok(!pushed.stats.words[GHOST], 'the orphan was pushed back to the cloud, which is what made it immortal');
    // The association is pruned by the same pass and is the half that carries the learner's own
    // writing, so it is asserted separately rather than trusted to ride along with the record.
    assert.ok(!s.ctx.assoc[GHOST], 'the orphan association survived locally');
    assert.ok(!pushed.assoc[GHOST], 'the orphan association was pushed back to the cloud');
  });

  test('a word that IS in the bank is untouched by that prune', async () => {
    const s = loadSyncLayer({ respond: cloudWithGhost() });
    const real = s.ctx.K(s.ctx.BANK[0].term);
    s.ctx.stats.words[real] = s.ctx.saneRec(R({ seen: 6, level: 2, last: 4 }));
    await s.ctx.syncWithRemoteInner('he');
    await settle();
    assert.ok(s.ctx.stats.words[real], 'the prune deleted a real word — this destroys progress');
    assert.strictEqual(s.ctx.stats.words[real].seen, 6);
  });

  test('a failed read stops the whole thing, write included', async () => {
    const s = loadSyncLayer({ respond: { 'progress.select': { error: ERRORS.rls() } } });
    await s.ctx.syncWithRemoteInner('he');
    await settle();
    none(s.fake.of('progress', 'upsert').map(c => c.row.lang), 'a failed read was still followed by a write:');
  });

  test('BUG: the write here is fire-and-forget, and its failure is discarded by design', async () => {
    /* app.js:2775-2776 — `Store.pushProgress(...).catch(()=>{})`, not awaited. syncWithRemote
     * therefore releases syncBusy while a write is still in flight, and a `.catch` that does
     * nothing is the only handling a failed write gets on this path. The merged state is already
     * on disk, so nothing is lost immediately — but the cloud and the device now disagree, and
     * only the next successful flush will notice. */
    const s = loadSyncLayer({ respond: { 'progress.select': { data: null }, 'progress.upsert': { error: ERRORS.down() } } });
    await s.ctx.syncWithRemoteInner('he');
    assert.strictEqual(s.fake.of('progress', 'upsert').length, 0,
      'pinned: the function resolved before its own write was even issued');
    await settle();
    assert.strictEqual(s.fake.of('progress', 'upsert').length, 1, 'the write did go out, one turn later');
  });
});

/* ============================================================== identity across a round trip = */
describe('identity — the account is resolved twice per sync, independently', () => {
  test('one flush asks the auth layer who this is twice, with nothing tying the answers together', async () => {
    const s = loadSyncLayer({ respond: { 'progress.select': { data: null }, 'progress.upsert': {} } });
    await s.ctx.flushRemoteSync();
    assert.strictEqual(s.fake.authCalls.filter(c => c.m === 'getUser').length, 2,
      'pullProgress and pushProgress each call getUser; neither passes the id to the other');
  });

  test('BUG: an account that changes between the read and the write sends A\'s data into B\'s row', async () => {
    /* Narrow but real. app.js checks the cache owner BEFORE the read (app.js:2597) and never
     * again; the session can change underneath a running page — a confirmation link opened in
     * the same tab, a second tab signing in, a refresh that lands on another account — and the
     * storage listener's reload is not instant. pullProgress resolves the user, merges that
     * row into the local state, and pushProgress then resolves the user AGAIN.
     * Result: everything account A had, written into account B's row, under B's RLS, legally.
     * Fix: resolve the user once and pass the id, or re-check it before the upsert. */
    const s = loadSyncLayer({
      user: n => (n === 0 ? { id: 'u-1', email: 'a@x' } : { id: 'u-2', email: 'b@x' }),
      respond: {
        'progress.select': { data: { data: P({ stats: { words: { secretOfA: R({ seen: 5, last: 3 }) }, sessions: [] } }) } },
        'progress.upsert': {},
      },
    });
    await s.ctx.flushRemoteSync();
    const read = s.fake.of('progress', 'select')[0], wrote = s.fake.of('progress', 'upsert')[0];
    assert.strictEqual(read.filters[0][2], 'u-1');
    assert.strictEqual(wrote.row.user_id, 'u-2',
      'pinned: the row read for u-1 was written back under u-2');
    assert.ok(wrote.row.data.stats.words.secretOfA, 'and it carried u-1\'s progress with it');
  });

  test('a token that dies between the read and the write loses the round silently', async () => {
    const s = loadSyncLayer({
      user: n => (n === 0 ? { id: 'u-1' } : null),
      respond: { 'progress.select': { data: null }, 'progress.upsert': {} },
    });
    const saved = await s.ctx.flushRemoteSync();
    none(s.fake.of('progress', 'upsert').map(c => c.row.lang), 'a write went out with no user:');
    assert.strictEqual(saved, true,
      'pinned: nothing was written and the app was told the save completed — same root cause as ' +
      'the failed-write bug above');
  });
});

/* ================================================================ profile and admin reads ==== */
describe('myProfile — the same bug pullProgress was fixed for, still open', () => {
  test('BUG: a failed profile read is indistinguishable from having no profile', async () => {
    /* store.js:40 destructures only `data` and drops `error`. Both outcomes are null.
     * accessOk (app.js:3528-3535) fails OPEN on null — deliberate, and harmless.
     * showAdminIfAllowed (app.js:3562-3567) fails CLOSED: one dropped request and the admin
     * loses the control-centre button until reload.
     * openAccount (app.js:3164-3169) leaves "טוען…" on screen forever.
     * A fix looks exactly like pullProgress's: return {ok,profile} and let each caller choose. */
    const failed = loadStore({ respond: { 'profiles.select': { error: ERRORS.down() } } });
    const absent = loadStore({ respond: { 'profiles.select': { data: null } } });
    assert.strictEqual(await failed.Store.myProfile(), null);
    assert.strictEqual(await absent.Store.myProfile(), null,
      'if these two ever differ, the distinction has been made — rewrite this test around it');
  });

  test('no session returns null without querying the profiles table', async () => {
    const s = loadStore({ user: null });
    assert.strictEqual(await s.Store.myProfile(), null);
    none(s.calls.map(c => c.table), 'profiles was queried with no user to scope it by:');
  });

  test('BUG: adminUserProgress reports a failed read as "this learner has no progress"', async () => {
    // The admin screen (app.js:3789) renders the result directly, so a dropped request shows an
    // empty account — the one screen where that reads as "their data is gone".
    const s = loadStore({ respond: { 'progress.select': { error: ERRORS.timeout() } } });
    const rows = await s.Store.adminUserProgress('u-9');
    none(rows, 'expected the failure to be indistinguishable from empty (pinned):');
  });

  test('adminListUsers and adminListFeedback DO hand the error back', async () => {
    // Stated as the contrast: the same file gets this right two functions later.
    const s = loadStore({ respond: { 'profiles.select': { error: ERRORS.rls() }, 'feedback.select': { error: ERRORS.rls() } } });
    const u = await s.Store.adminListUsers(), f = await s.Store.adminListFeedback();
    assert.ok(u.error, 'adminListUsers swallowed the error');
    assert.ok(f.error, 'adminListFeedback swallowed the error');
  });
});

/* =============================================================== feedback and associations === */
describe('feedback and shared associations', () => {
  test('a missing feedback table is flagged so the caller can fall back to email', async () => {
    const s = loadStore({ respond: { 'feedback.insert': { error: ERRORS.missingTable() } } });
    const r = await s.Store.sendFeedback('bug', 'body', {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.missingTable, true);
  });

  test('any other failure is NOT flagged as a missing table', async () => {
    const s = loadStore({ respond: { 'feedback.insert': { error: ERRORS.down() } } });
    const r = await s.Store.sendFeedback('bug', 'body', {});
    assert.strictEqual(r.ok, false);
    assert.ok(!r.missingTable, 'an offline report would tell the user the feature is not installed');
  });

  test('a report from a signed-out visitor is stored with null identity, not dropped', async () => {
    const s = loadStore({ user: null, respond: { 'feedback.insert': {} } });
    const r = await s.Store.sendFeedback('idea', 'text', { screen: 'home' });
    assert.strictEqual(r.ok, true);
    const row = s.fake.of('feedback', 'insert')[0].row;
    assert.strictEqual(row.user_id, null);
    assert.strictEqual(row.email, null);
  });

  test('countOpenFeedback returns null on failure and 0 on none — the badge can tell them apart', async () => {
    const bad = loadStore({ respond: { 'feedback.select': { error: ERRORS.down() } } });
    const zero = loadStore({ respond: { 'feedback.select': { count: 0 } } });
    assert.strictEqual(await bad.Store.countOpenFeedback(), null);
    assert.strictEqual(await zero.Store.countOpenFeedback(), 0);
    const q = zero.fake.of('feedback', 'select')[0];
    assert.strictEqual(q.options.head, true, 'head:true is what keeps this free to call on every screen');
    assert.deepStrictEqual(q.filters, [['neq', 'status', 'done']]);
  });

  test('a missing shared_assoc function is reported as a migration gap, not silence', async () => {
    const s = loadStore({ respond: { 'rpc.shared_assoc': { error: ERRORS.missingFn() } } });
    const r = await s.Store.listSharedAssoc('he', 'k');
    assert.strictEqual(r.ok, false);
    none(r.rows, 'a failed lookup returned rows:');
    assert.ok(s.warnings.some(w => /9\.sql/.test(w)), 'the warning should name the migration that was not run');
  });

  test('the reader never sees their own row twice, and authorship never crosses the wire', async () => {
    const s = loadStore({ respond: { 'rpc.shared_assoc': { data: [{ text: 'שלי', is_mine: true }, { text: 'של אחר', is_mine: false }] } } });
    const r = await s.Store.listSharedAssoc('he', 'k');
    assert.strictEqual(r.mine, true);
    assert.deepStrictEqual(plain(r.rows).map(x => x.text), ['של אחר']);
    none(plain(r.rows).filter(x => 'user_id' in x), 'a row carried a user_id out of the RPC:');
  });

  test('BUG: shareAssoc refuses a too-short text with the same {ok:false} a server failure gives', async () => {
    // app.js:1010 branches on r.ok alone, so "your note is too short to share" and "the share
    // failed" produce the same message. Two characters is also a very low bar to call a note.
    const s = loadStore({ respond: { 'assoc_shared.upsert': {} } });
    const short = await s.Store.shareAssoc('he', 'k', 'w', 'a');
    const failed = loadStore({ respond: { 'assoc_shared.upsert': { error: ERRORS.rls() } } });
    const bad = await failed.Store.shareAssoc('he', 'k', 'w', 'ארוך מספיק');
    assert.strictEqual(short.ok, false);
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(short.error, undefined, 'pinned: the rejected-locally case carries no reason at all');
    none(s.calls.map(c => c.table), 'a too-short note was still sent to the server:');
  });

  test('a long association is truncated to 300 characters without telling anyone', async () => {
    const s = loadStore({ respond: { 'assoc_shared.upsert': {} } });
    await s.Store.shareAssoc('he', 'k', 'w', 'א'.repeat(500));
    assert.strictEqual(s.fake.of('assoc_shared', 'upsert')[0].row.text.length, 300,
      'the cut itself is right; that the writer is never told is the finding');
  });
});

/* ==================================================================== destructive paths ====== */
describe('deletion — the two paths that remove data', () => {
  test('BUG: adminDeleteUserData is three writes with no rollback', async () => {
    /* store.js:172-182. The progress delete lands, the feedback delete fails, and the function
     * returns {ok:false} — so the admin is told nothing was deleted while the learner's entire
     * progress row is already gone. Worse, the third step never runs: it is the one that clears
     * sub_status, and store.js:166-171 documents that skipping it hands the account unlimited
     * access. A failure in the middle produces exactly the state the comment says must not exist.
     * Fix: an RPC that does all three in one transaction. */
    const s = loadStore({ respond: op => (op.table === 'feedback' ? { error: ERRORS.rls() } : {}) });
    const r = await s.Store.adminDeleteUserData('victim');
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(s.calls.map(c => c.table + '.' + c.verb), ['progress.delete', 'feedback.delete'],
      'pinned: step 1 already ran and step 3 never will');
    none(s.fake.of('profiles', 'update').map(() => 'profiles.update'),
      'expected the subscription reset to have been skipped (that is the bug):');
  });

  test('all three steps are scoped to the one user id', async () => {
    const s = loadStore({ respond: {} });
    await s.Store.adminDeleteUserData('victim');
    none(s.calls.filter(c => !c.filters.some(f => f[2] === 'victim')).map(c => c.table + '.' + c.verb),
      'a delete ran without being filtered to the target user — this would empty the whole table:');
  });

  test('a missing id deletes nothing at all', async () => {
    const s = loadStore({ respond: {} });
    const r = await s.Store.adminDeleteUserData('');
    assert.strictEqual(r.ok, false);
    none(s.calls.map(c => c.table + '.' + c.verb), 'an unscoped delete was issued for an empty user id:');
  });

  test('deleteMyAccount separates "not deployed" from "failed" from "offline"', async () => {
    const mk = fetch => loadStore({ fetch }).Store;
    const notDeployed = await mk(async () => ({ status: 404, ok: false, json: async () => ({}) })).deleteMyAccount();
    const offline = await mk(async () => { throw new TypeError('NetworkError'); }).deleteMyAccount();
    const refused = await mk(async () => ({ status: 500, ok: false, json: async () => ({ error: 'nope' }) })).deleteMyAccount();
    const ok = await mk(async () => ({ status: 200, ok: true, json: async () => ({ ok: true, removed: 2 }) })).deleteMyAccount();
    assert.strictEqual(notDeployed.notDeployed, true);
    assert.ok(!offline.notDeployed && /רשת/.test(offline.error.message));
    assert.ok(!refused.ok && refused.error.message === 'nope');
    assert.deepStrictEqual(plain(ok), { ok: true, removed: 2 });
  });

  test('a 200 with a body that is not JSON is a failure, not a success', async () => {
    // An HTML error page from a proxy returns 200 more often than it should.
    const s = loadStore({ fetch: async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } }) });
    const r = await s.Store.deleteMyAccount();
    assert.strictEqual(r.ok, false);
  });

  test('with no session the account-deletion request is never sent', async () => {
    const s = loadStore({ session: null, fetch: async () => { throw new Error('fetch must not run'); } });
    const r = await s.Store.deleteMyAccount();
    assert.strictEqual(r.ok, false);
    assert.ok(/חיבור פעיל/.test(r.error.message));
  });

  test('the bearer token is the session token, and the anon key rides along', async () => {
    let seen = null;
    const s = loadStore({ fetch: async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({ ok: true }) }; } });
    await s.Store.deleteMyAccount();
    assert.ok(seen.url.endsWith('/functions/v1/delete-account'));
    assert.strictEqual(seen.init.headers.Authorization, 'Bearer tok-1');
    assert.strictEqual(seen.init.headers.apikey, 'anon-key-xyz');
  });
});

/* ======================================================================== auth surface ======= */
describe('auth — what the caller is told', () => {
  test('signUp and signIn hand the error object back untouched for translation', async () => {
    const err = { message: 'Invalid login credentials', status: 400 };
    const s = loadStore({ signIn: { data: { user: null, session: null }, error: err } });
    const r = await s.Store.signIn('a@b.c', 'wrong');
    assert.strictEqual(r.user, null);
    assert.strictEqual(r.error.message, 'Invalid login credentials',
      'translateAuthError (app.js:2779) matches on the message text — flattening it loses every ' +
      'specific message the user needs');
  });

  test('BUG: the last_seen stamp is fired and forgotten — sign-in resolves before it lands', async () => {
    /* store.js:24. Deliberately best-effort, and that is defensible; what is not visible anywhere
     * is that it fails. The admin dashboard's "last seen" column is the only thing that reads it,
     * so a column that silently stops updating reads as a user who stopped using the app. */
    /* The slow response is on a timer, not on a gate this test opens: if store.js ever starts
     * awaiting the stamp, this test must go RED, not hang. */
    const slow = () => new Promise(r => setTimeout(() => r({ error: ERRORS.down() }), 20));
    const s = loadStore({ respond: op => (op.table === 'profiles' ? slow() : {}) });
    const r = await s.Store.signIn('a@b.c', 'pw');
    const upd = s.fake.of('profiles', 'update')[0];
    assert.ok(r.user, 'the sign-in itself succeeded');
    assert.ok(upd, 'the last_seen write was issued');
    assert.strictEqual(upd.settled, false,
      'pinned: signIn resolved while the write was still in flight — a tab closed here loses it');
    await new Promise(res => setTimeout(res, 40));
    assert.strictEqual(upd.settled, true, 'sanity: the write did eventually come back, and it failed');
    none(s.warnings, 'expected the failure to be logged nowhere at all (that is the finding):');
  });

  test('BUG: verifyMyPassword is a full sign-in, with every side effect of one', async () => {
    /* store.js:156-162. Checking the password by signing in again is the only way to do it from
     * a browser and the comment says so. The cost is not named: supabase-js emits SIGNED_IN and
     * rotates the session, so app.js's onAuthChange handler (app.js:3993) runs in the middle of
     * the admin delete-data flow, and every mistyped password counts against the auth rate limit
     * — the same limit the project already hit at two mails per hour. */
    const s = loadStore();
    const events = [];
    s.Store.onAuthChange(sess => events.push(sess));
    assert.strictEqual(await s.Store.verifyMyPassword('pw'), true);
    assert.strictEqual(s.fake.authCalls.filter(c => c.m === 'signInWithPassword').length, 1);
    assert.strictEqual(events.length, 1,
      'pinned: a password check re-authenticated and woke every auth listener in the app');
  });

  test('verifyMyPassword refuses when there is no signed-in email to check against', async () => {
    const s = loadStore({ user: null });
    assert.strictEqual(await s.Store.verifyMyPassword('pw'), false);
    none(s.fake.authCalls.filter(c => c.m === 'signInWithPassword').map(c => c.m),
      'a sign-in was attempted with no email:');
  });

  test('the password reset link points back at this exact page', async () => {
    const s = loadStore({ location: { origin: 'https://milim.example', pathname: '/app/index.html' } });
    await s.Store.resetPasswordFor('a@b.c');
    const call = s.fake.authCalls.find(c => c.m === 'resetPasswordForEmail');
    assert.strictEqual(call.options.redirectTo, 'https://milim.example/app/index.html');
  });
});

/* ===================================================================== the lifting itself ==== */
describe('the harness — why these tests lift app.js the way they do', () => {
  test('extract.js alone cannot lift an async function, which is why liftAsync exists', () => {
    const { extractFunction } = require('./_harness/extract.js');
    const { codeMask } = require('./_harness/scan.js');
    const src = 'async function f(){ await 1; return 2; }';
    const naive = extractFunction(src, 'f', codeMask(src));
    assert.ok(!naive.startsWith('async'), 'extract.js matches at `function`, so `async` is dropped');
    assert.throws(() => new Function(naive), SyntaxError,
      'and the result is not valid code — a silently mis-lifted function is the failure mode ' +
      'tests/README.md calls worse than having no tests');
    const { liftAsync } = require('./_harness/fakeSupabase.js');
    assert.ok(liftAsync(src, 'f', codeMask(src)).startsWith('async function f'));
  });

  test('store.js is loaded from disk, not restated here', () => {
    // Guards against the worst possible version of this file: one that tests a copy of store.js
    // living inside the tests, which would stay green forever after store.js changed.
    assert.ok(/window\.Store\s*=\s*Store/.test(storeSource()), 'store.js no longer ends by exporting Store');
    assert.ok(storeSource().length > 4000, 'store.js came back suspiciously short');
  });
});
