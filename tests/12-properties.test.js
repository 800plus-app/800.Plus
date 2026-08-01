'use strict';
/* mergeProgress under property-based testing — invariants over random payloads.
 *
 * WHY THIS EXISTS ALONGSIDE 06-merge.test.js
 * ------------------------------------------
 * 06-merge builds each payload by hand. That is the right way to pin a bug that was actually
 * observed — and it caught the session-doubling bug — but a hand-built payload can only fail in a
 * way someone already imagined. Every example test is a guess about which shape breaks the code.
 *
 * This file asserts the RULES instead, and lets a generator look for the shape:
 *
 *   never decreases     no counter is lower after a merge than it was on either side
 *   invents nothing     every key in the output came from one of the two inputs
 *   idempotent          merging the same remote twice equals merging it once
 *   order-independent   who is called "local" cannot change the counters
 *   survives JSON       the result round-trips unchanged, because that is how it is stored
 *   deleted is a union  a word deleted anywhere stays deleted
 *   respects the cap    the session log never exceeds MAX_SESSIONS
 *   never throws        including on payloads no honest client would ever send
 *
 * These are exactly the failures that never produce an error message. mergeProgress runs on every
 * sync; when it is wrong the learner just quietly finds progress missing.
 *
 * DETERMINISM
 * -----------
 * Math.random is not used anywhere. A seeded PRNG generates the cases, so a red run is
 * reproducible from the seed printed in the failure — a property test that cannot reproduce its
 * own counterexample is worse than no test, because it turns a real bug into a flake nobody
 * trusts. SEED is fixed; override with MERGE_SEED=<n> to hunt for new cases.
 *
 * SHRINKING
 * ---------
 * A raw counterexample is typically 6 words and 8 sessions of noise, and reads as unactionable.
 * Every failure is minimised first — keys, sessions and magnitudes are removed one at a time for
 * as long as the property keeps failing — so what gets printed is the smallest payload that still
 * breaks. That minimal payload is the thing worth copying into 06-merge as a permanent example.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, plain } = require('./_harness/sandbox.js');

const ctx = loadApp({ lang: 'he', bank: false });
const merge = (l, r) => plain(ctx.mergeProgress(l, r));

const SEED = Number(process.env.MERGE_SEED) || 20260801;
const CASES = Number(process.env.MERGE_CASES) || 300;

/* mulberry32 — small, fast, and identical on every machine and every Node version. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- generators */

/* A deliberately tiny key pool. Random 20-character keys would almost never collide, and the
 * whole point of a merge is what happens when both sides hold the SAME word. */
const KEYS = ['אב', 'גד', 'הו', 'זח', 'טי', 'כל'];
const FIELDS = ['seen', 'first', 'ever', 'wrong', 'level', 'last'];

/* `level` is deliberately NOT one of them. app.js:2696 states the rule: the record written LAST
 * wins on level, because a demotion after a wrong answer has to survive the merge — under a max
 * a word the learner had just failed would stay marked as known, and the whole "words you keep
 * missing come back" behaviour would quietly stop working. Counts grow; level moves both ways.
 * Asserting max over level here would not be a stricter test, it would be a wrong one. */
const GROWING = ['seen', 'first', 'ever', 'wrong', 'last'];

function mkGen(r) {
  const int = n => Math.floor(r() * n);
  const pick = a => a[int(a.length)];
  const chance = p => r() < p;

  /* `last` starts at 1, not 0. Every write path in the app stamps it — commitSession sets
   * r.last=now unconditionally (app.js:1256) and the level test writes last:stamp (app.js:2051) —
   * so last===0 does not describe a record a current client produces. It is reachable only
   * through legacy or corrupt data, and it behaves differently enough to deserve its own named
   * test rather than being smuggled in as random noise. See "a one-sided word" below. */
  const rec = () => {
    const o = {};
    // level is capped at 3 by saneRec (app.js:113); generating 0..11 would only be testing the
    // clamp, and would make every shrunk counterexample read as a level bug when it is not one
    for (const f of FIELDS) o[f] = f === 'last' ? 1 + int(2000) : f === 'level' ? int(4) : int(12);
    return o;
  };

  /* Values a well-behaved client never sends but a corrupt localStorage row, a partial response
   * or an older schema absolutely can. JSON cannot even carry some of them — which is itself one
   * of the things under test. */
  const junk = () => pick([null, undefined, NaN, Infinity, -1, -0, '3', '', 'abc', true, false,
    {}, [], 1e21, 0.5, Number.MAX_SAFE_INTEGER]);

  const hostileRec = () => {
    const o = rec();
    for (const f of FIELDS) if (chance(0.35)) o[f] = junk();
    if (chance(0.2)) delete o[pick(FIELDS)];
    return o;
  };

  const words = (hostile) => {
    const o = {};
    const n = int(KEYS.length + 1);
    for (let i = 0; i < n; i++) o[pick(KEYS)] = hostile ? hostileRec() : rec();
    return o;
  };

  /* `t` is junk about a fifth of the time. The sort at app.js:2712 reads it as `Number(t)||0`,
   * which is a line written specifically for rows whose timestamp is missing or unusable — and a
   * generator that only ever emits clean integers can never reach it. Proven, not assumed: with
   * numeric-only timestamps both mutants on that line survived the new file. */
  const session = () => ({
    t: chance(0.2) ? pick([0, null, undefined, NaN, 'abc', '']) : int(5000),
    scope: pick(['global', 'unit', 'weak']), mode: pick(['all', 'new', 'weak']),
    total: int(20), correct: int(20), firstTry: int(20), struggled: int(20), newCount: int(20),
  });

  const sessions = () => Array.from({ length: int(9) }, session);

  /* `undeleted` and `src:'lv'` are generated on purpose, not as flavour. The first version of
   * this file left both out, and a mutation run proved the consequence: every mutant on the
   * restore branch at app.js:2691 survived, because no generated payload could ever reach it.
   * A generator that cannot produce the input a branch needs is a test that does not test it. */
  const payload = (hostile = false) => {
    const w = words(hostile);
    for (const k of Object.keys(w)) if (chance(0.3) && isObj(w[k])) w[k].src = 'lv';
    const undeleted = {};
    for (const k of KEYS) if (chance(0.15)) undeleted[k] = 1;
    return {
      assoc: chance(0.5) ? {} : { [pick(KEYS)]: 'note' },
      stats: { words: w, sessions: sessions() },
      deleted: KEYS.filter(() => chance(0.2)),
      undeleted,
      added: Array.from({ length: int(4) }, () => [pick(KEYS), 'gloss' + int(3)]),
      dir: hostile && chance(0.5) ? pick([null, 42, 'nonsense']) : pick(['m2w', 'w2m']),
    };
  };
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  return { payload, int, pick, chance };
}

/* ------------------------------------------------------------- the runner */

const clone = v => JSON.parse(JSON.stringify(v === undefined ? null : v));

/* Remove one thing at a time and keep whatever still fails. Plain greedy shrinking: enough to
 * turn "6 words and 8 sessions" into something a person can read, without a shrinking library. */
function shrink(pair, fails) {
  let [a, b] = pair;
  let improved = true;
  const still = (x, y) => { try { return fails(x, y); } catch (e) { return true; } };

  while (improved) {
    improved = false;
    for (const side of [0, 1]) {
      const cur = () => (side === 0 ? a : b);
      const put = v => { if (side === 0) a = v; else b = v; };

      for (const k of Object.keys(cur().stats.words)) {           // drop a word
        const t = clone(cur()); delete t.stats.words[k];
        if (still(side === 0 ? t : a, side === 0 ? b : t)) { put(t); improved = true; }
      }
      if (cur().stats.sessions.length) {                          // halve the session log
        const t = clone(cur()); t.stats.sessions = t.stats.sessions.slice(0, -1);
        if (still(side === 0 ? t : a, side === 0 ? b : t)) { put(t); improved = true; }
      }
      for (const list of ['deleted', 'added']) {                  // drop a row
        if (!cur()[list].length) continue;
        const t = clone(cur()); t[list] = t[list].slice(0, -1);
        if (still(side === 0 ? t : a, side === 0 ? b : t)) { put(t); improved = true; }
      }
      for (const k of Object.keys(cur().stats.words)) {           // shrink magnitudes
        for (const f of FIELDS) {
          const v = cur().stats.words[k][f];
          if (typeof v !== 'number' || v === 0 || !Number.isFinite(v)) continue;
          const t = clone(cur()); t.stats.words[k][f] = v > 1 ? Math.floor(v / 2) : 0;
          if (still(side === 0 ? t : a, side === 0 ? b : t)) { put(t); improved = true; }
        }
      }
    }
  }
  return [a, b];
}

/* Run one property over CASES generated pairs. On the first failure: shrink, then fail with the
 * seed, the case number and the minimal payload — everything needed to reproduce it by hand. */
function forAll(name, { hostile = false, check }) {
  const r = rng(SEED);
  const gen = mkGen(r);
  for (let i = 0; i < CASES; i++) {
    const a = gen.payload(hostile), b = gen.payload(hostile);
    const fails = (x, y) => {
      try { return !!check(merge(clone(x), clone(y)), x, y); } catch (e) { return 'threw: ' + e.message; }
    };
    const why = fails(a, b);
    if (!why) continue;
    const [sa, sb] = shrink([a, b], (x, y) => !!fails(x, y));
    const final = fails(sa, sb);
    assert.fail(
      `${name}\n\n${typeof final === 'string' ? final : String(why)}\n\n` +
      `seed ${SEED}, case ${i} of ${CASES}  (reproduce: MERGE_SEED=${SEED} node tests/run.js)\n` +
      `local  = ${JSON.stringify(sa)}\n` +
      `remote = ${JSON.stringify(sb)}\n` +
      `merged = ${JSON.stringify((() => { try { return merge(clone(sa), clone(sb)); } catch (e) { return 'THREW: ' + e.message; } })())}`);
  }
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* The one documented exception to "a word on either side survives the merge": a level-test skip
 * the learner explicitly un-skipped. The local device deleted the record; a union would drag it
 * straight back from the cloud, so app.js:2691 drops it instead. Every property about survival
 * has to state this exception rather than trip over it. */
const restoredSkip = (a, b, k) =>
  !a.stats.words[k] && b.stats.words[k] && b.stats.words[k].src === 'lv' && a.undeleted && a.undeleted[k];

/* ------------------------------------------------------------- properties */

describe('property — progress only ever grows', () => {
  test('no counter comes out lower than it went in on either side', () => {
    forAll('a merge lowered a counter that is supposed to be monotonic', {
      check: (out, a, b) => {
        for (const k of new Set([...Object.keys(a.stats.words), ...Object.keys(b.stats.words)])) {
          if (restoredSkip(a, b, k)) continue;
          const o = out.stats.words[k];
          if (!o) return `word ${k} vanished from the merge entirely`;
          for (const f of GROWING) {
            const want = Math.max(num(a.stats.words[k] && a.stats.words[k][f]),
                                  num(b.stats.words[k] && b.stats.words[k][f]));
            if (num(o[f]) < want) return `${k}.${f}: got ${o[f]}, both sides had at least ${want}`;
          }
        }
        return false;
      },
    });
  });

  test('every word in the result came from one of the two sides', () => {
    forAll('the merge invented a word that neither side held', {
      check: (out, a, b) => {
        const src = new Set([...Object.keys(a.stats.words), ...Object.keys(b.stats.words)]);
        for (const k of Object.keys(out.stats.words)) if (!src.has(k)) return `invented ${k}`;
        return false;
      },
    });
  });
});

describe('property — merging is stable', () => {
  test('merging the same remote twice equals merging it once', () => {
    forAll('mergeProgress is not idempotent', {
      /* `undeleted` is re-attached, and that is not a convenience. It is not part of the merge
       * payload and mergeProgress does not return it: it lives in its own localStorage key
       * (app.js:167) and every caller injects it fresh via restoredMap() (app.js:179, 2618).
       * Dropping it on the second pass would model a device that forgot its own restore log
       * between two syncs, which is not a thing that happens — and would report a false bug. */
      check: (out, a, b) => {
        const twice = merge(Object.assign(clone(out), { undeleted: a.undeleted }), clone(b));
        return JSON.stringify(twice) === JSON.stringify(out)
          ? false : 'the second merge of the same remote changed the result';
      },
    });
  });

  test('a merged state merged with itself is a fixed point', () => {
    forAll('merging a state with itself changed it', {
      check: (out) => JSON.stringify(merge(clone(out), clone(out))) === JSON.stringify(out)
        ? false : 'self-merge is not a no-op',
    });
  });

  test('which side is called "local" cannot change any counter', () => {
    forAll('the merge is order-dependent on counters', {
      /* The restore log travels with the DEVICE, not with the payload — app.js:2717-2722 states
       * that plainly ("the restore log is per-device"). So the swap keeps `undeleted` on whichever
       * side is currently local; otherwise this would be asserting that a per-device log is
       * symmetric, which is the one thing the design says it is not. */
      check: (out, a, b) => {
        const bLocal = Object.assign(clone(b), { undeleted: a.undeleted });
        const other = merge(bLocal, clone(a));
        for (const k of Object.keys(out.stats.words)) {
          /* The restore branch is one-sided on purpose — it fires on "the LOCAL device does not
           * have this record" — so a key it drops in one direction and not the other is the
           * design working, not an inconsistency. Excluded in both directions, by name. */
          if (restoredSkip(a, b, k) || restoredSkip(bLocal, a, k)) continue;
          const x = out.stats.words[k], y = other.stats.words[k];
          if (!y) return `word ${k} only survives in one argument order`;
          for (const f of GROWING) if (num(x[f]) !== num(y[f])) return `${k}.${f}: ${x[f]} vs ${y[f]} when the sides swap`;
          /* level is order-independent only when the two timestamps differ. On an exact tie the
           * rule at app.js:2697 is `a.last >= b.last ? a : b`, so whoever is passed as local wins
           * — stated here rather than asserted away, because that tie is the one case where two
           * devices can legitimately end up on different levels for the same word. */
          const ta = num(a.stats.words[k] && a.stats.words[k].last);
          const tb = num(b.stats.words[k] && b.stats.words[k].last);
          if (ta !== tb && num(x.level) !== num(y.level)) return `${k}.level: ${x.level} vs ${y.level} with distinct timestamps ${ta}/${tb}`;
        }
        return false;
      },
    });
  });
});

describe('property — a word only one side has ever seen', () => {
  /* The first sync of a new device is entirely this case: everything the cloud holds is unknown
   * locally. If a one-sided record does not arrive whole, a learner who signs in on a second
   * phone silently starts over — the failure this whole file exists to rule out. */
  test('arrives intact when only the remote has it', () => {
    forAll('a remote-only word did not arrive intact', {
      check: (out, a, b) => {
        for (const k of Object.keys(b.stats.words)) {
          if (a.stats.words[k] || restoredSkip(a, b, k)) continue;
          const want = b.stats.words[k], got = out.stats.words[k];
          // last===0 is its own case, named and locked in the test at the end of this block
          if (num(want.last) === 0) continue;
          if (!got) return `${k} exists only remotely and did not arrive at all`;
          for (const f of FIELDS) if (num(got[f]) !== num(want[f])) return `${k}.${f}: arrived as ${got[f]}, remote had ${want[f]}`;
        }
        return false;
      },
    });
  });

  test('arrives intact when only the local has it', () => {
    forAll('a local-only word was altered by the merge', {
      check: (out, a, b) => {
        for (const k of Object.keys(a.stats.words)) {
          if (b.stats.words[k]) continue;
          const want = a.stats.words[k], got = out.stats.words[k];
          if (num(want.last) === 0) continue;                       // same named case as above
          if (!got) return `${k} exists only locally and was dropped`;
          for (const f of FIELDS) if (num(got[f]) !== num(want[f])) return `${k}.${f}: became ${got[f]}, local had ${want[f]}`;
        }
        return false;
      },
    });
  });

  /* ---- the boundary the property above deliberately stops at ----
   * With last===0 the same case is NOT symmetric, and this test states what actually happens
   * rather than what should. saneRec turns an absent local record into a full zeroed one
   * (app.js:111), which then enters the `a.last >= b.last` comparison as if it were real data
   * and wins the tie at 0 — so a remote-only record with no timestamp arrives at level 0, while
   * the mirror image keeps its level. No current write path produces last===0 (commitSession
   * stamps r.last unconditionally, the level test writes last:stamp), so this is latent, not
   * live: it needs a legacy or corrupted record to bite. Locked here so that if anyone changes
   * the tie-break, this test tells them the asymmetry was known and deliberate to leave. */
  test('with no timestamp at all the arrival is asymmetric — current behaviour, latent defect', () => {
    const P = o => Object.assign({ assoc: {}, stats: { words: {}, sessions: [] }, deleted: [], added: [], dir: 'm2w' }, o);
    const W = r => ({ stats: { words: { w: Object.assign({ seen: 9, first: 0, ever: 0, wrong: 0, level: 3, last: 0 }, r) }, sessions: [] } });

    assert.strictEqual(merge(P({}), P(W({}))).stats.words.w.level, 0,
      'remote-only with last:0 — if this is now 3, the tie-break was fixed: delete this test and keep the property above');
    assert.strictEqual(merge(P(W({})), P({})).stats.words.w.level, 3,
      'local-only with last:0 must keep its level');
    // and with any real timestamp at all, both directions are already correct
    assert.strictEqual(merge(P({}), P(W({ last: 1 }))).stats.words.w.level, 3);
  });
});

describe('a stamp from the future cannot outrank the present', () => {
  /* app.js:2697 resolves `level` by comparing `last`, and nothing anywhere validates `last` — it
   * is whatever Date.now() said on the device that wrote it. app.js:2699 then keeps max(last), so
   * a device whose clock runs fast does not merely win one conflict: its stamp STAYS in the record
   * and goes on beating every honest answer until real time catches up. In the reported scenario
   * the learner failed the word twelve more times over two days and it never left level 3 — it was
   * counted as learned by classify (app.js:402) and dropped out of the practice queue entirely.
   *
   * The merge therefore refuses to rank any stamp above `now + a small slack`. Clamped, not
   * rejected: the record still arrives whole, the stamp simply stops outranking the present.
   *
   * WHAT THE SLACK COSTS, STATED HONESTLY. It is not zero, and it cannot be. Honest clocks drift,
   * the cloud copy was itself stamped by ANOTHER device's clock, and the round trip takes real
   * time — at zero margin the merge would start discarding writes that were perfectly valid. The
   * price is that a lying clock still wins for the length of the slack. What the fix removes is
   * the DURATION: the poison expires in minutes instead of two days.
   *
   * These tests need time to pass between merges, so they drive the sandbox's clock. The fake Date
   * is installed on ctx only for the duration of one call and always restored, because every other
   * test in this file shares this context. */
  const DAY = 86400000;
  const T0 = 1780000000000;                 // a fixed "now" — these tests must not depend on today
  const SLACK = 300000;                     // the margin app.js allows; 5 minutes
  const P = o => Object.assign({ assoc: {}, stats: { words: {}, sessions: [] }, deleted: [], added: [], dir: 'm2w' }, o);
  const W = r => ({ stats: { words: { w: Object.assign({ seen: 5, first: 2, ever: 5, wrong: 0, level: 0, last: 0 }, r) }, sessions: [] } });

  const RealDate = ctx.Date;
  function atClock(ms, fn) {
    class FakeDate extends RealDate {
      constructor(...a) { if (!a.length) super(ms); else super(...a); }
      static now() { return ms; }
    }
    ctx.Date = FakeDate;
    try { return fn(); } finally { ctx.Date = RealDate; }
  }

  test('the skewed stamp is not stored, so it cannot keep winning for two days', () => {
    const laptop = P(W({ seen: 9, first: 4, ever: 8, wrong: 3, level: 0, last: T0 }));
    const phone = P(W({ seen: 5, first: 5, ever: 5, wrong: 0, level: 3, last: T0 + 2 * DAY }));
    const m = atClock(T0, () => merge(laptop, phone));
    assert.ok(m.stats.words.w.last <= T0 + SLACK,
      `the record kept a stamp ${m.stats.words.w.last - T0}ms in the future — it now outranks every honest answer until real time reaches it`);
  });

  test('an hour later the honest device takes the level back', () => {
    /* The same conflict as above, then the learner fails the word again an hour on. Before the
     * clamp this answer lost too, because the cloud still held T0+2d. */
    const laptop = P(W({ level: 0, wrong: 3, last: T0 }));
    const phone = P(W({ level: 3, wrong: 0, last: T0 + 2 * DAY }));
    const afterFirst = atClock(T0, () => merge(laptop, phone));
    const nextAnswer = P({ stats: { words: { w: Object.assign({}, afterFirst.stats.words.w, { level: 0, wrong: 4, last: T0 + 3600000 }) }, sessions: [] } });
    const m = atClock(T0 + 3600000, () => merge(nextAnswer, afterFirst));
    assert.strictEqual(m.stats.words.w.level, 0,
      'an answer given an hour after the skewed one must be the one that counts');
  });

  test('the word the learner keeps failing goes back into the queue', () => {
    /* The report's scenario, run end to end: twelve more failures over the two days the skewed
     * stamp used to cover. The counts were always right; it was `level` that never moved. */
    let cloud = { seen: 5, first: 5, ever: 5, wrong: 0, level: 3, last: T0 + 2 * DAY };
    for (let i = 1; i <= 12; i++) {
      const t = T0 + i * 3600000;
      const local = P(W({ seen: 9 + i, first: 4, ever: 8, wrong: 3 + i, level: 0, last: t }));
      cloud = atClock(t, () => merge(local, P(W(cloud)))).stats.words.w;
    }
    assert.strictEqual(cloud.wrong, 15, 'the mistakes were always counted');
    assert.strictEqual(cloud.level, 0, 'and now the level follows them, so the word comes back');
  });

  test('ordinary drift still wins — the slack is not zero', () => {
    const m = atClock(T0, () => merge(P(W({ level: 0, last: T0 - 60000 })), P(W({ level: 3, last: T0 + 30000 }))));
    assert.strictEqual(m.stats.words.w.level, 3,
      'a device half a minute ahead is drifting, not lying — it must still win');
  });
});

describe('property — the session log is ordered and keeps the newest rounds', () => {
  /* The stats screen draws this list in order and the streak counts backwards from its end, so
   * an out-of-order or wrongly-trimmed log is a wrong chart and a wrong streak — neither of which
   * throws. app.js:2712 sorts on `Number(t)||0`, which is the line that has to hold. */
  test('rounds come out in chronological order', () => {
    forAll('the merged session log is not in chronological order', {
      check: (out) => {
        const s = out.stats.sessions;
        for (let i = 1; i < s.length; i++) {
          const prev = num(Number(s[i - 1].t)), cur = num(Number(s[i].t));
          if (cur < prev) return `row ${i} has t=${s[i].t} after t=${s[i - 1].t}`;
        }
        return false;
      },
    });
  });

  test('when the log is trimmed it is the oldest rounds that go', () => {
    forAll('the trim dropped a newer round and kept an older one', {
      check: (out, a, b) => {
        const all = [...a.stats.sessions, ...b.stats.sessions].map(x => num(Number(x.t)));
        if (!all.length || out.stats.sessions.length === 0) return false;
        const kept = out.stats.sessions.map(x => num(Number(x.t)));
        const newestDropped = Math.max(...all.filter(t => !kept.includes(t)), -Infinity);
        const oldestKept = Math.min(...kept);
        return newestDropped > oldestKept
          ? `dropped a round at t=${newestDropped} while keeping one at t=${oldestKept}` : false;
      },
    });
  });
});

describe('property — an un-skipped level-test word stays un-skipped', () => {
  /* The mirror of the deletion rule, one layer down. The learner ran the level test, it marked a
   * word as known, they disagreed and un-skipped it — recorded in `undeleted`. The cloud still
   * holds the src:'lv' record. A union would hand it straight back and the un-skip would last
   * until the next sync. app.js:2691 is the line that prevents that. */
  test('a locally restored level-test record does not come back from the cloud', () => {
    forAll('an un-skipped level-test word was resurrected by the merge', {
      check: (out, a, b) => {
        for (const k of Object.keys(b.stats.words)) {
          if (!restoredSkip(a, b, k)) continue;
          if (out.stats.words[k]) return `${k} was un-skipped locally and the merge brought it back`;
        }
        return false;
      },
    });
  });
});

describe('property — the result is storable', () => {
  /* The merge output goes straight into localStorage and into a Supabase jsonb column. Anything
   * JSON cannot represent — undefined, NaN, Infinity — silently becomes null or disappears on the
   * way in, so a value that does not survive the round trip is data loss, not a formatting nit. */
  test('the merged state survives a JSON round trip unchanged', () => {
    forAll('the merge produced a value JSON cannot carry', {
      hostile: true,
      check: (out) => JSON.stringify(JSON.parse(JSON.stringify(out))) === JSON.stringify(out)
        ? false : 'the stored form differs from the in-memory form',
    });
  });

  test('the session log never exceeds the cap', () => {
    const cap = ctx.MAX_SESSIONS;
    assert.ok(Number.isFinite(cap) && cap > 0, 'MAX_SESSIONS is not a usable number');
    forAll(`the merge produced more than MAX_SESSIONS (${cap}) session rows`, {
      check: (out) => out.stats.sessions.length > cap ? `${out.stats.sessions.length} rows` : false,
    });
  });
});

describe('property — a deletion is never undone', () => {
  /* Union of both sides, MINUS this device's restore log (app.js:2726-2728). The subtraction is
   * the whole point: a plain union cannot express "I brought this word back", so a restore used
   * to survive about ninety seconds — until the next sync handed the deletion back from the
   * cloud. Asserting a pure union here would be asserting the bug. */
  test('a word deleted on either side stays deleted, unless this device restored it', () => {
    forAll('a merge resurrected a deleted word', {
      check: (out, a, b) => {
        const want = [...new Set([...a.deleted, ...b.deleted])].filter(k => !a.undeleted[k]);
        for (const k of want) if (!out.deleted.includes(k)) return `${k} was deleted but came back`;
        return false;
      },
    });
  });

  test('a word this device restored is not re-deleted by the cloud', () => {
    forAll('a restored word was pushed back into the bin by the merge', {
      check: (out, a) => {
        for (const k of Object.keys(a.undeleted)) {
          if (out.deleted.includes(k)) return `${k} was restored locally and the merge re-deleted it`;
        }
        return false;
      },
    });
  });
});

describe('property — hostile payloads do not crash the sync', () => {
  /* A corrupt row must degrade to a sane default. Throwing here means the sync dies and the user
   * silently stops syncing — the worst outcome available, because nothing tells them. */
  test('mergeProgress never throws, whatever the two sides contain', () => {
    forAll('mergeProgress threw on a payload a corrupt client could send', {
      hostile: true,
      check: () => false,
    });
  });

  test('no counter comes back as a non-number, however corrupt the input', () => {
    forAll('a corrupt input leaked a non-number into a counter', {
      hostile: true,
      check: (out) => {
        for (const [k, o] of Object.entries(out.stats.words)) {
          for (const f of FIELDS) {
            const v = o[f];
            if (v === undefined) continue;                    // absent is fine; wrong type is not
            if (typeof v !== 'number' || !Number.isFinite(v)) return `${k}.${f} = ${JSON.stringify(v)}`;
          }
        }
        return false;
      },
    });
  });
});
