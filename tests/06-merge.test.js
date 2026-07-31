'use strict';
/* mergeProgress — what happens when two devices disagree.
 *
 * This runs on every sync. Its failures are the least visible in the whole app: nothing errors,
 * the learner just finds progress missing, or a word they deleted back in the bank, or their
 * practice history doubled. app.js:2250 records that a plain concat of sessions doubled the
 * history on every language switch (3 -> 6 -> 12 -> 24) until the 200 cap filled with copies and
 * real practice days fell out, shrinking the streak — a bug made entirely of a missing dedupe.
 *
 * Values that come back out of the sandbox are compared through plain(): the vm builds them in
 * its own realm, and JSON is the shape they take in localStorage and in Supabase anyway.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, plain, expectNone } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);
const ctx = loadApp({ lang: 'he', bank: false });

const R = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);
const P = o => Object.assign({ assoc: {}, stats: { words: {}, sessions: [] }, deleted: [], added: [], dir: 'm2w' }, o);
const merge = (l, r) => plain(ctx.mergeProgress(l, r));

describe('merge — progress is never lost', () => {
  test('counts take the maximum of both sides', () => {
    const out = merge(
      P({ stats: { words: { w: R({ seen: 5, first: 3, ever: 4, wrong: 1, last: 10 }) }, sessions: [] } }),
      P({ stats: { words: { w: R({ seen: 2, first: 7, ever: 1, wrong: 9, last: 20 }) }, sessions: [] } }));
    assert.strictEqual(out.stats.words.w.seen, 5);
    assert.strictEqual(out.stats.words.w.first, 7);
    assert.strictEqual(out.stats.words.w.ever, 4);
    assert.strictEqual(out.stats.words.w.wrong, 9);
    assert.strictEqual(out.stats.words.w.last, 20);
  });

  test('no count is ever lower after a merge than it was on either side', () => {
    const a = { seen: 9, first: 4, ever: 6, wrong: 2, level: 2, last: 500 };
    const b = { seen: 3, first: 8, ever: 1, wrong: 7, level: 0, last: 100 };
    const out = merge(P({ stats: { words: { w: R(a) }, sessions: [] } }),
      P({ stats: { words: { w: R(b) }, sessions: [] } }));
    none(['seen', 'first', 'ever', 'wrong', 'last']
      .filter(f => out.stats.words.w[f] < Math.max(a[f], b[f]))
      .map(f => `${f}: ${out.stats.words.w[f]} < max(${a[f]}, ${b[f]})`),
      'a merge lowered a counter that only ever grows:');
  });

  test('a word known only to one side survives', () => {
    const out = merge(P({ stats: { words: { onlyLocal: R({ seen: 1, last: 5 }) }, sessions: [] } }),
      P({ stats: { words: { onlyRemote: R({ seen: 2, last: 6 }) }, sessions: [] } }));
    assert.deepStrictEqual(Object.keys(out.stats.words).sort(), ['onlyLocal', 'onlyRemote']);
  });

  test('a personal word added on one device survives, and is not duplicated', () => {
    const out = merge(P({ added: [['שלום', 'hello'], ['q', 'r']] }), P({ added: [['שלום', 'hi'], ['z', 'x']] }));
    assert.strictEqual(out.added.length, 3, 'expected the two שלום rows to fold into one');
    assert.deepStrictEqual(out.added[0], ['שלום', 'hello'], 'the local copy should win');
    assert.ok(out.added.some(p => p[0] === 'z'), 'the remote-only word was dropped');
  });

  test('an association written on one device survives, and local wins a conflict', () => {
    const out = merge(P({ assoc: { a: 'mine', b: 'local-only' } }), P({ assoc: { a: 'theirs', c: 'remote-only' } }));
    assert.strictEqual(out.assoc.a, 'mine');
    assert.strictEqual(out.assoc.b, 'local-only');
    assert.strictEqual(out.assoc.c, 'remote-only');
  });
});

describe('merge — level is last-write-wins, deliberately', () => {
  /* The literal rule "never lose a higher level" was tried and is NOT what this does, on purpose
   * (app.js:2239): taking Math.max per field meant a downgrade after a wrong answer could never
   * survive, because the older copy still held the higher level — so a word the learner had just
   * failed stayed marked as known. The strength that survives is the one written LAST. */
  test('a higher level survives when it is the newer record', () => {
    const out = merge(P({ stats: { words: { w: R({ level: 3, last: 999 }) }, sessions: [] } }),
      P({ stats: { words: { w: R({ level: 0, last: 100 }) }, sessions: [] } }));
    assert.strictEqual(out.stats.words.w.level, 3);
  });

  test('a LOWER level survives when it is the newer record — a failure is not undone by a sync', () => {
    const out = merge(P({ stats: { words: { w: R({ level: 3, last: 100 }) }, sessions: [] } }),
      P({ stats: { words: { w: R({ level: 0, last: 999 }) }, sessions: [] } }));
    assert.strictEqual(out.stats.words.w.level, 0,
      'a word the learner just got wrong came back marked as known');
  });

  test('a tie on the timestamp resolves to the local record', () => {
    const out = merge(P({ stats: { words: { w: R({ level: 2, last: 500 }) }, sessions: [] } }),
      P({ stats: { words: { w: R({ level: 1, last: 500 }) }, sessions: [] } }));
    assert.strictEqual(out.stats.words.w.level, 2);
  });

  test('the level-test marker travels with the record that won', () => {
    const out = merge(P({ stats: { words: { w: R({ level: 0, last: 10 }) }, sessions: [] } }),
      P({ stats: { words: { w: Object.assign(R({ level: 3, last: 20 }), { src: 'lv' }) }, sessions: [] } }));
    assert.strictEqual(out.stats.words.w.src, 'lv',
      'losing src makes a level-test result indistinguishable from real practice, which is the ' +
      'information needed to undo a level test taken by the wrong person');
  });
});

describe('merge — a deletion is never resurrected', () => {
  test('a word deleted locally stays deleted when the remote has never heard of it', () => {
    const out = merge(P({ deleted: ['gone'] }), P({ deleted: [] }));
    assert.deepStrictEqual(out.deleted, ['gone']);
  });

  test('a word deleted remotely stays deleted locally', () => {
    const out = merge(P({ deleted: [] }), P({ deleted: ['gone'] }));
    assert.deepStrictEqual(out.deleted, ['gone']);
  });

  test('deletions from both sides are unioned, not intersected', () => {
    const out = merge(P({ deleted: ['a', 'b'] }), P({ deleted: ['b', 'c'] }));
    assert.deepStrictEqual(out.deleted.slice().sort(), ['a', 'b', 'c']);
  });

  test('a deletion survives repeated syncs against a stale device', () => {
    // The realistic shape of the bug: an old phone that never saw the deletion keeps pushing.
    const stale = P({ deleted: [], added: [['word', 'gloss']] });
    let state = P({ deleted: ['word'] });
    for (let i = 0; i < 5; i++) state = merge(state, stale);
    assert.ok(state.deleted.includes('word'), 'a stale device resurrected a deleted word after 5 syncs');
  });
});

describe('merge — sessions', () => {
  const S = (t, extra = {}) => Object.assign({ t, scope: 'global', total: 5, correct: 3 }, extra);

  test('the same round appearing on both sides is counted once', () => {
    const shared = S(100);
    const out = merge(P({ stats: { words: {}, sessions: [shared, S(200)] } }),
      P({ stats: { words: {}, sessions: [shared, S(300)] } }));
    assert.strictEqual(out.stats.sessions.length, 3, 'the shared round was double-counted');
  });

  test('REGRESSION: repeated merges do not double the history', () => {
    /* The streak bug. Each return to a language ran a merge, and a plain concat re-added every
     * round the device already had: 3 -> 6 -> 12 -> 24. */
    const remote = P({ stats: { words: {}, sessions: [S(1), S(2), S(3)] } });
    let state = P({ stats: { words: {}, sessions: [S(1), S(2), S(3)] } });
    for (let i = 0; i < 6; i++) state = merge(state, remote);
    assert.strictEqual(state.stats.sessions.length, 3,
      `history grew to ${state.stats.sessions.length} rounds after 6 syncs of the same 3`);
  });

  test('sessions come back in chronological order', () => {
    const out = merge(P({ stats: { words: {}, sessions: [S(300), S(100)] } }),
      P({ stats: { words: {}, sessions: [S(200), S(50)] } }));
    const ts = out.stats.sessions.map(s => s.t);
    assert.deepStrictEqual(ts, ts.slice().sort((a, b) => a - b));
  });

  test('history is capped, and the cap keeps the NEWEST rounds', () => {
    const many = n => Array.from({ length: n }, (_, i) => S(i + 1));
    const out = merge(P({ stats: { words: {}, sessions: many(300) } }), P({ stats: { words: {}, sessions: [] } }));
    assert.strictEqual(out.stats.sessions.length, ctx.MAX_SESSIONS);
    assert.strictEqual(out.stats.sessions[out.stats.sessions.length - 1].t, 300, 'the cap dropped the newest rounds');
  });

  test('non-object junk in the session list is dropped rather than propagated', () => {
    const out = merge(P({ stats: { words: {}, sessions: [S(1), null, 'x', 42] } }),
      P({ stats: { words: {}, sessions: [] } }));
    assert.strictEqual(out.stats.sessions.length, 1);
  });
});

describe('merge — idempotent', () => {
  const rich = () => P({
    assoc: { a: 'LA', b: 'LB' },
    stats: {
      words: { w1: R({ seen: 5, level: 3, last: 100 }), w2: R({ seen: 1, level: 0, last: 50 }) },
      sessions: [{ t: 1, scope: 'g', total: 5, correct: 3 }, { t: 3, scope: 'g', total: 2, correct: 2 }],
    },
    deleted: ['d1'], added: [['x', 'y']], dir: 'w2m',
  });
  const remote = () => P({
    assoc: { a: 'RA', c: 'RC' },
    stats: {
      words: { w1: R({ seen: 7, level: 0, last: 80 }), w3: R({ seen: 2, level: 1, last: 200 }) },
      sessions: [{ t: 2, scope: 'g', total: 4, correct: 1 }, { t: 3, scope: 'g', total: 2, correct: 2 }],
    },
    deleted: ['d2'], added: [['x', 'z'], ['q', 'r']], dir: 'm2w',
  });

  test('merging the same payload twice equals merging it once', () => {
    const once = merge(rich(), remote());
    const twice = merge(once, remote());
    assert.deepStrictEqual(twice, once);
  });

  test('…and a third and fourth time changes nothing further', () => {
    let state = merge(rich(), remote());
    const after1 = JSON.stringify(state);
    for (let i = 0; i < 3; i++) state = merge(state, remote());
    assert.strictEqual(JSON.stringify(state), after1);
  });

  test('idempotent even when the history is over the cap', () => {
    const many = n => Array.from({ length: n }, (_, i) => ({ t: i + 1, scope: 'g', total: 1, correct: 1 }));
    const l = P({ stats: { words: {}, sessions: many(250) } });
    const r = P({ stats: { words: {}, sessions: many(120) } });
    const once = merge(l, r);
    assert.deepStrictEqual(merge(once, r), once);
  });

  test('merging a payload into itself is a no-op', () => {
    const s = rich();
    assert.deepStrictEqual(merge(s, plain(merge(s, P({})))), plain(merge(s, P({}))));
  });
});

describe('merge — malformed input', () => {
  test('a null or non-object remote returns the local state untouched', () => {
    const local = rich_();
    for (const bad of [null, undefined, 'x', 42, []]) {
      assert.strictEqual(ctx.mergeProgress(local, bad), local, `remote=${JSON.stringify(bad)} was not passed through`);
    }
    function rich_() { return P({ assoc: { a: '1' }, deleted: ['d'] }); }
  });

  test('missing sub-objects do not throw and do not invent data', () => {
    const out = merge({}, {});
    assert.deepStrictEqual(out.assoc, {});
    assert.deepStrictEqual(out.deleted, []);
    assert.deepStrictEqual(out.added, []);
    assert.deepStrictEqual(out.stats.words, {});
    assert.deepStrictEqual(out.stats.sessions, []);
  });

  test('a corrupt word record is coerced, not propagated', () => {
    const out = merge(P({ stats: { words: { w: { seen: 'lots', level: 99, last: -5, wrong: NaN } }, sessions: [] } }),
      P({ stats: { words: {}, sessions: [] } }));
    const r = out.stats.words.w;
    assert.strictEqual(r.seen, 0, 'a non-numeric count must become 0, not NaN');
    assert.strictEqual(r.level, 3, 'level is clamped to the 0..3 range');
    assert.strictEqual(r.last, 0);
    assert.strictEqual(r.wrong, 0);
    for (const [k, v] of Object.entries(r)) {
      if (k === 'src') continue;
      assert.ok(Number.isFinite(v), `${k} came out as ${v}`);
    }
  });

  test('the direction falls back sensibly', () => {
    assert.strictEqual(merge(P({ dir: 'w2m' }), P({ dir: 'm2w' })).dir, 'w2m', 'local direction should win');
    assert.strictEqual(merge(P({ dir: null }), P({ dir: 'mixed' })).dir, 'mixed');
    assert.strictEqual(merge(P({ dir: null }), P({ dir: null })).dir, 'm2w');
  });

  test('a bad `added` row is skipped rather than stored', () => {
    const out = merge(P({ added: [['ok', 'gloss'], null, ['', 'empty'], 'junk', []] }), P({ added: [] }));
    assert.deepStrictEqual(out.added, [['ok', 'gloss']]);
  });
});
