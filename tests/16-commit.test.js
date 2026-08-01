'use strict';
/* commitSession() — the arithmetic at the end of every round.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A mutation run (scratchpad/mutate.js) turns single characters of app.js into single bugs and
 * asks whether the suite notices. With 471 tests green, commitSession still had 24 survivors —
 * more than any other symbol in the file. A survivor is not a style complaint: it is a bug that
 * could ship. Among the 24 were "start the correct counter at 1 instead of 0" (every round in
 * the history reports one more correct answer than happened) and "delete the level drop after a
 * wrong answer" (a word the learner keeps failing never comes back). Both stayed green.
 *
 * The reason is structural, not careless. Other files drive commitSession constantly — every
 * bucket test practises a round — but they assert on what comes OUT of the buckets afterwards,
 * and the buckets read `level` and `seen` through thresholds that swallow an off-by-one. Nothing
 * looked at the numbers commitSession itself writes. This file does, and only that.
 *
 * HOW IT IS ORGANISED
 * -------------------
 * One describe per thing commitSession computes, in the order the function computes it:
 *   1. the log row      — the counters the stats screen, the trend chart and the streak read
 *   2. the levels       — the scheduler's memory of how well a word is known
 *   3. the word record  — seen / first / ever / wrong
 *   4. the commit latch — committing twice must not charge the learner twice
 *   5. the history trim — what happens to the round's row pointer when old rounds are dropped
 *
 * Every assertion here is pinned to a mutant that survived before it was written; the comment
 * above each test names the change it is there to catch. Assertions with no mutant behind them
 * are marked, so nobody later mistakes decoration for coverage.
 *
 * The numbers are asserted EXACTLY (=== 1, never >= 1). An off-by-one is the whole family of
 * bugs this function is prone to, and a loose assertion is how 24 of them stayed invisible.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, startRound, practiseRound, answerCard } = require('./_harness/sandbox.js');

const SCOPE = 'unit:1';
const fresh = () => loadApp({ lang: 'he' });

/* Three distinct words from a real unit. Nothing about the words matters except that they are
 * distinct under K() — commitSession is keyed by K(), and two spelling variants of one word
 * would silently collapse into a single record and make every count here ambiguous. */
function words(ctx, n) {
  const out = [], seen = new Set();
  for (const w of ctx.uniqScope(SCOPE)) {
    const k = ctx.K(w.term);
    if (seen.has(k)) continue;
    seen.add(k); out.push(w);
    if (out.length === n) break;
  }
  assert.strictEqual(out.length, n, `needed ${n} distinct words in ${SCOPE}`);
  return out;
}

/* Give a word a history. rec() mints a zeroed record on first touch, so this is the same shape
 * the app stores — `seen` above zero is what makes the word NOT new, which is the branch most of
 * the level arithmetic below depends on. */
function seed(ctx, term, patch) {
  const r = ctx.rec(term);
  Object.assign(r, patch);
  return r;
}

const recOf = (ctx, term) => ctx.rec(term);

/* ------------------------------------------------------------------ 1. the log row */

describe('commitSession — the round log row', () => {
  /* Kills: `let ft=0` -> `ft=1`, `st=0` -> `st=1`, `nw=0` -> `nw=1` (three accumulators that
   * survived starting one too high), `ft++` -> `ft--`, `st++` -> `st--`, `c++` -> `c--`.
   * Every one of these feeds the stats screen, the trend chart and the streak. */
  test('a mixed round writes ONE row and every counter on it is exact', () => {
    const ctx = fresh();
    const [a, b, c] = words(ctx, 3);
    for (const w of [a, b, c]) seed(ctx, w.term, { seen: 4, level: 2 });

    practiseRound(ctx, [[a, 'first'], [b, 'struggle'], [c, 'wrong']], { scope: SCOPE });

    assert.strictEqual(ctx.stats.sessions.length, 1, 'one round is one row');
    const row = ctx.stats.sessions[0];
    assert.strictEqual(row.total, 3, 'total = words answered');
    assert.strictEqual(row.correct, 2, 'correct = first-try + struggled, and nothing else');
    assert.strictEqual(row.firstTry, 1, 'exactly one word was known on the first attempt');
    assert.strictEqual(row.struggled, 1, 'exactly one word was reached on a later attempt');
    assert.strictEqual(row.newCount, 0, 'all three had been seen before — none of them is new');
    assert.strictEqual(row.scope, SCOPE);
    assert.strictEqual(row.mode, 'all');
  });

  /* Kills: `if(wasNew) nw++` -> `nw--`. newCount is what the "words met for the first time"
   * figure is built from; negative is not a number the screen can survive. */
  test('a round of words never met before counts every one of them as new', () => {
    const ctx = fresh();
    const deck = words(ctx, 3);
    practiseRound(ctx, deck.map(w => [w, 'first']), { scope: SCOPE });

    const row = ctx.stats.sessions[0];
    assert.strictEqual(row.newCount, 3, 'three untouched words = three new words');
    assert.strictEqual(row.total, 3);
    assert.strictEqual(row.firstTry, 3);
  });

  /* A word already seen contributes 0 to newCount even when it is answered perfectly — the pair
   * to the test above, and what makes `nw` distinguishable from `ft`. */
  test('a word met before is never counted as new again', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });

    assert.strictEqual(ctx.stats.sessions.length, 2);
    assert.strictEqual(ctx.stats.sessions[0].newCount, 1, 'first meeting');
    assert.strictEqual(ctx.stats.sessions[1].newCount, 0, 'second meeting is not a first meeting');
  });

  /* One round is one row even when the round is committed in the middle (visibilitychange does
   * exactly this on a phone). No mutant behind this one — it guards the fix the comment above
   * commitSession describes, and the row-growing branch every trim test below depends on. */
  test('committing mid-round grows the same row instead of opening a second one', () => {
    const ctx = fresh();
    const [a, b] = words(ctx, 2);
    startRound(ctx, { scope: SCOPE });

    answerCard(ctx, a, 'first');
    ctx.commitSession();
    answerCard(ctx, b, 'wrong');
    ctx.commitSession();

    assert.strictEqual(ctx.stats.sessions.length, 1, 'one round, one row — not two rounds of one');
    const row = ctx.stats.sessions[0];
    assert.strictEqual(row.total, 2);
    assert.strictEqual(row.correct, 1);
    assert.strictEqual(row.firstTry, 1);
  });
});

/* --------------------------------------------------------------------- 2. the levels */

describe('commitSession — the level a word sits at', () => {
  /* Kills: `Math.min(3, r.level+1)` -> `r.level-1`, and `+1` -> `+0`. Both leave the word at or
   * below where it started after the learner got it right, so a word answered correctly forever
   * never leaves the weak bucket. */
  test('getting it right on the first attempt climbs exactly one level', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 5, level: 1 });

    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 2, 'level 1 answered correctly becomes 2 — one step, not two, not none');
  });

  /* Kills: `Math.min(3, …)` -> `Math.min(4, …)`. 3 is the ceiling the buckets and the donut are
   * defined against; a 4 would be a level no screen in the app knows how to draw. */
  test('the climb stops at 3 — a fully learned word cannot go higher', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 9, level: 3 });

    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 3, '3 is the ceiling');
  });

  /* Kills: `r.level=Math.max(0, r.level-1)` -> `r.level-0` in the STRUGGLED branch. Reaching the
   * answer on a second attempt is short-term recall; the level has to give ground for the word
   * to come back. */
  test('reaching it only on a later attempt drops the level by one', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 5, level: 2 });

    practiseRound(ctx, [[a, 'struggle']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 1, 'struggled = one level down');
  });

  /* Kills: `r.level=Math.max(0, r.level-1)` -> `r.level-0` in the WRONG branch.
   * This is the product in one line: a word that falls comes back. With the drop removed a word
   * the learner fails every single time keeps whatever level it had and is never scheduled again,
   * and the whole suite stayed green while that was true. */
  test('a word answered wrong drops a level — the promise that a fallen word comes back', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 7, level: 3 });

    practiseRound(ctx, [[a, 'wrong']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 2, 'wrong = one level down, every time');

    practiseRound(ctx, [[a, 'wrong']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 1);
    practiseRound(ctx, [[a, 'wrong']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 0);
  });

  /* The floor. No surviving mutant behind this one — Math.max(0, …) was already covered — but it
   * is the other half of the sentence above and costs one line. */
  test('the drop stops at 0 — a level is never negative', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 7, level: 0 });

    practiseRound(ctx, [[a, 'wrong']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 0);
  });

  /* A word met for the first time and answered correctly lands at 3 rather than climbing from 0.
   * No surviving mutant behind this one; it pins the `wasNew ? 3` arm so the two arms of the
   * ternary above cannot be confused for each other by a later edit. */
  test('a brand-new word answered correctly lands straight at 3', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });
    assert.strictEqual(recOf(ctx, a.term).level, 3);
  });

  /* The retry round is the guard against inflating a level by immediately re-answering a word
   * that was just missed. No surviving mutant behind it (the ternary itself was not sampled);
   * it is here because it is the condition the two arms above are selected by. */
  test('a retry round never raises a level, however well the word is answered', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    seed(ctx, a.term, { seen: 5, level: 1 });

    practiseRound(ctx, [[a, 'first']], { scope: SCOPE, retry: true });
    assert.strictEqual(recOf(ctx, a.term).level, 1, 'a retry proves short-term recall, not knowledge');
  });
});

/* ---------------------------------------------------------------- 3. the word record */

describe('commitSession — the per-word counters', () => {
  /* Kills: `r.first++` -> `r.first--`, `r.ever++` -> `r.ever--` (first-try branch). */
  test('a first-try answer records one sighting, one first, one ever, no mistakes', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });

    const r = recOf(ctx, a.term);
    assert.strictEqual(r.seen, 1);
    assert.strictEqual(r.first, 1);
    assert.strictEqual(r.ever, 1);
    assert.strictEqual(r.wrong, 0, 'answered on the first attempt — nothing to charge');
  });

  /* Kills: `r.ever++` -> `r.ever--` (struggled branch), `e.attempts-1` -> `e.attempts+1`, and
   * `e.attempts-1` -> `e.attempts-0`. Two attempts means exactly ONE miss on the way. */
  test('a struggled answer charges exactly the misses that happened', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'struggle']], { scope: SCOPE });

    const r = recOf(ctx, a.term);
    assert.strictEqual(r.seen, 1);
    assert.strictEqual(r.first, 0, 'not known on the first attempt');
    assert.strictEqual(r.ever, 1, 'it was reached in the end, so it counts as answered');
    assert.strictEqual(r.wrong, 1, 'two attempts = one miss — not two, not three');
  });

  /* Kills: `r.wrong++` -> `r.wrong--` (never-got-it branch). */
  test('a word never reached records one sighting and one mistake, and no credit', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'wrong']], { scope: SCOPE });

    const r = recOf(ctx, a.term);
    assert.strictEqual(r.seen, 1);
    assert.strictEqual(r.first, 0);
    assert.strictEqual(r.ever, 0, 'never reached = never answered');
    assert.strictEqual(r.wrong, 1);
  });

  /* Kills: `Math.max(0, e.attempts-1)` -> `Math.max(1, e.attempts-1)`.
   *
   * The entry is built by hand because the floor it guards is not reachable through play:
   * finishCard() increments `attempts` before it ever sets `mastered`, so a mastered entry
   * always carries at least one attempt, and for the struggled branch at least two. The floor is
   * defensive code, and this is the input it defends against — a mastered entry with a single
   * attempt must be charged ZERO mistakes, because a raised floor would invent one out of
   * nothing and permanently mark a word the learner never got wrong.
   */
  test('the mistake floor cannot invent a mistake that did not happen', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    startRound(ctx, { scope: SCOPE });
    ctx.session.set(ctx.K(a.term), { w: a, attempts: 1, mastered: true, firstTry: false });
    ctx.commitSession();

    assert.strictEqual(recOf(ctx, a.term).wrong, 0, 'one attempt, reached — nothing to charge');
    assert.strictEqual(ctx.stats.sessions[0].struggled, 1);
  });
});

/* ----------------------------------------------------------------- 4. the commit latch */

describe('commitSession — committing twice must not charge twice', () => {
  /* Kills: `committed=true` -> `committed=false` on the normal path. `committed` is what the
   * results screen and the exit path read to decide whether the round still needs saving. */
  test('a committed round is marked committed', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });
    assert.strictEqual(ctx.committed, true);
  });

  /* Kills: `committed=true` -> `committed=false` on the early return (nothing new to apply).
   * The early return is the common case — every exit path calls commitSession, and all but the
   * first find nothing left to do. Leaving `committed` false there would make the app believe an
   * already-saved round is still unsaved. */
  test('committing a round with nothing new left still leaves it marked committed', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });

    ctx.committed = false;                 // as if a later code path cleared the flag
    ctx.commitSession();                   // nothing unapplied — takes the early return
    assert.strictEqual(ctx.committed, true);
  });

  /* No single surviving mutant behind this one: it is the regression guard for the incident in
   * the comment above commitSession, and the reason the per-key set exists at all. Nothing in
   * the suite asserted that a second commit is a no-op. */
  test('a second commit of the same round changes nothing at all', () => {
    const ctx = fresh();
    const [a, b] = words(ctx, 2);
    practiseRound(ctx, [[a, 'first'], [b, 'wrong']], { scope: SCOPE });

    const savesBefore = ctx.__saved.stats;
    const snapshot = JSON.stringify({ sessions: ctx.stats.sessions, words: ctx.stats.words });

    ctx.commitSession();
    ctx.commitSession();
    ctx.commitSession();

    assert.strictEqual(JSON.stringify({ sessions: ctx.stats.sessions, words: ctx.stats.words }), snapshot,
      'three extra commits moved a number that the learner never earned');
    assert.strictEqual(ctx.stats.sessions.length, 1);
    assert.strictEqual(recOf(ctx, a.term).seen, 1, 'seen must count rounds, not commits');
    assert.strictEqual(ctx.__saved.stats, savesBefore, 'nothing changed, so nothing was written');
  });
});

/* ------------------------------------------------------------------ 5. the history trim */

describe('commitSession — trimming the history', () => {
  const foreign = n => Array.from({ length: n }, (_, i) => ({
    t: 1000 + i, scope: 'foreign', mode: 'all', total: 7, correct: 7, firstTry: 7, struggled: 0, newCount: 0,
  }));

  /* Kills: `stats.sessions.length > MAX_SESSIONS` -> `>=`.
   *
   * At exactly the ceiling nothing is dropped, and `>=` there computes cut=0 and slices a full
   * copy — so the only witness that the branch ran is that the array was REBUILT. That is what
   * the identity assertion below is for, and it is stated as "left alone" rather than "equal",
   * because equal is what the bug looks like. */
  test('at exactly the ceiling the history is left alone, not rebuilt', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    ctx.stats.sessions = foreign(ctx.MAX_SESSIONS - 1);
    const arrayBefore = ctx.stats.sessions;

    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });   // pushes the 200th row

    assert.strictEqual(ctx.stats.sessions.length, ctx.MAX_SESSIONS, 'exactly at the ceiling');
    assert.strictEqual(ctx.stats.sessions, arrayBefore, 'the ceiling is not yet exceeded — nothing to trim');
    assert.strictEqual(ctx.stats.sessions[ctx.MAX_SESSIONS - 1].rid, ctx.sessionRowId,
      'the round just played must be the last row');
  });

  /* Past the ceiling the oldest rounds go and the pointer follows the row that is still there. */
  test('past the ceiling the oldest rounds are dropped and the round keeps its own row', () => {
    const ctx = fresh();
    const [a] = words(ctx, 1);
    ctx.stats.sessions = foreign(ctx.MAX_SESSIONS);

    practiseRound(ctx, [[a, 'first']], { scope: SCOPE });

    assert.strictEqual(ctx.stats.sessions.length, ctx.MAX_SESSIONS, 'the ceiling holds');
    const mine = ctx.stats.sessions.find(r => r.rid === ctx.sessionRowId);
    assert.ok(mine, 'the round just played is no longer findable by its id');
    assert.strictEqual(mine.scope, SCOPE, 'the id must resolve to the round just played, not to a stranger');
    assert.strictEqual(ctx.stats.sessions[0].t, 1001, 'the oldest row is the one that went');
  });

  /* Kills: `Math.max(-1, sessionRowIdx-cut)` -> `Math.max(+1, …)` and -> `Math.max(-0, …)`.
   *
   * When the trim cuts PAST the round's own row, that row is gone and the only honest answer is
   * -1: no row, open a new one on the next commit. Both mutants answer with a real index instead
   * (1 and 0), and the next commit of the same round then adds this round's words to somebody
   * else's history row — a round from weeks ago silently grows.
   *
   * Reaching a cut bigger than the row's index takes the history growing under the round rather
   * than the round growing the history, which is what a remote merge landing mid-round does:
   * mergeProgress replaces stats.sessions wholesale, and a second device's history is longer.
   * That is simulated directly below.
   */
  test('when the trim cuts past this round\'s own row the pointer is dropped, not aimed at a stranger', () => {
    const ctx = fresh();
    const [a, b, c] = words(ctx, 3);
    startRound(ctx, { scope: SCOPE });

    answerCard(ctx, a, 'first');
    ctx.commitSession();
    assert.strictEqual(ctx.stats.sessions[0].rid, ctx.sessionRowId, 'the round opened the first row');
    const myRow = ctx.stats.sessions[0];

    // a sync lands mid-round: a longer history from another device, this round's row still in it
    ctx.stats.sessions = [myRow, ...foreign(ctx.MAX_SESSIONS + 4)];

    answerCard(ctx, b, 'wrong');
    ctx.commitSession();                   // grows myRow, then trims it off the front

    assert.strictEqual(ctx.stats.sessions.length, ctx.MAX_SESSIONS);
    assert.strictEqual(ctx.stats.sessions.includes(myRow), false, 'this round\'s row was trimmed away');
    assert.strictEqual(ctx.stats.sessions.some(r => r.rid === ctx.sessionRowId), false,
      'the row is gone, so no row may answer to this id — anything that does is a stranger');

    // and the next commit of the SAME round must open a fresh row rather than grow a stranger
    answerCard(ctx, c, 'first');
    ctx.commitSession();

    const last = ctx.stats.sessions[ctx.stats.sessions.length - 1];
    assert.strictEqual(last.scope, SCOPE, 'a fresh row for the words that had nowhere to go');
    assert.strictEqual(last.total, 1);
    assert.strictEqual(last.firstTry, 1);
    assert.strictEqual(ctx.stats.sessions.filter(s => s.scope === 'foreign' && s.total !== 7).length, 0,
      'a round from the history was grown by words answered today');
  });
});
