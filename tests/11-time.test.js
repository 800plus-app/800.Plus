'use strict';
/* ===== time, day boundaries, and two writers =====
 *
 * Everything in this file is about ONE question: what happens when the clock is not what the
 * code assumed it was. Three flavours of that:
 *
 *   1. A device whose clock is WRONG. `mergeProgress` resolves a level conflict by comparing
 *      `last`, and `last` is whatever `Date.now()` said on the device that wrote it. Nothing
 *      validates it. A phone two days fast wins every conflict it takes part in, and -- because
 *      the merge also keeps `max(last)` -- its stamp stays in the record and keeps winning.
 *   2. Day boundaries. The streak counts LOCAL calendar days but walks backwards in fixed
 *      86,400,000ms steps. Israel changes its clock twice a year, so one day a year is 23 hours
 *      long and one is 25. On those two days the walk skips a day or visits one twice.
 *   3. Two writers. The same round can be pushed to the cloud twice with different `t` values,
 *      and `sessionRowIdx` is an INDEX into an array that a merge is allowed to re-sort.
 *
 * WHAT THESE TESTS ASSERT
 * -----------------------
 * Most of them pin behaviour that is WRONG, because the brief for this pass was to measure, not
 * to repair. A test that pins a bug has to say so in its own name, or the next person reads a
 * green line as an endorsement -- so every such test is named for the failure it locks in, and
 * the docs/ report for this pass lists them. Where the correct behaviour is short enough to
 * state, it is written out as a `skip`ped test right underneath, the same convention
 * 04-access.test.js uses for the unparseable-date bug.
 *
 * TIMEZONE
 * --------
 * process.env.TZ is set BEFORE anything reads a Date, and `run.js` gives every test file its own
 * child process (node:test's default isolation), so this cannot leak into another file. The very
 * first test asserts the timezone actually took effect: without it the DST tests would pass by
 * accident on a UTC machine and prove nothing.
 */
process.env.TZ = 'Asia/Jerusalem';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { loadApp, startRound, answerCard, practiseRound, plain, ROOT } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');

const DAY = 86400000;
const T0 = 1785000000000;                 // an arbitrary fixed "now" for the merge tests

/* Symbols this file needs that _harness/sandbox.js does not lift for everyone else. Lifted here
 * rather than added to SYMBOLS so that a rename shows up as a failure in THIS file, next to the
 * tests that care, instead of breaking all nine files at once. */
const TIME_SYMBOLS = ['dayKey', 'practiceDays', 'streakInfo', 'examDays', 'EXAM_KEY', 'NOTIF', 'langSummary',
                      'examTip', 'renderExamPill'];

let cachedSrc = null;
function appSrc() {
  if (cachedSrc == null) cachedSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  return cachedSrc;
}

/* A sandbox with three additions: the time-related functions above, a localStorage stub (the
 * streak and the exam countdown read straight from it), and a Date whose `now()` can be moved.
 *
 * The fake Date is a SUBCLASS installed on this context only. Assigning to the shared `Date`
 * that sandbox.js passes in would replace Date.now for the whole Node process, including the
 * other test files running concurrently. */
function loadTime(opts) {
  const ctx = loadApp(opts || {});
  const store = {};
  ctx.LS = {
    get(k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? JSON.parse(JSON.stringify(store[k])) : d; },
    set(k, v) { store[k] = JSON.parse(JSON.stringify(v)); return true; },
    del(k) { delete store[k]; },
  };
  ctx.localStorage = { length: 0, key() { return null; } };

  const Real = ctx.Date;
  class FakeDate extends Real {
    constructor(...a) { if (a.length === 0) super(FakeDate.__now); else super(...a); }
    static now() { return FakeDate.__now; }
  }
  FakeDate.__now = Real.now();
  ctx.Date = FakeDate;
  ctx.at = ms => { FakeDate.__now = ms; return ms; };

  for (const { name, code } of extractAll(appSrc(), TIME_SYMBOLS))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
  return ctx;
}

/* local-time constructor, so the test reads as a wall clock and not as an epoch */
const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 0, mi || 0, 0, 0).getTime();

/* one word record, the shape stats.words holds */
const wr = o => Object.assign({ seen: 0, first: 0, ever: 0, wrong: 0, level: 0, last: 0 }, o);
/* one side of a merge */
const side = (words, sessions) => ({ assoc: {}, stats: { words: words || {}, sessions: sessions || [] },
                                     deleted: [], added: [], dir: 'w2m' });
/* one session-log row */
const srow = (t, tag, total) => ({ t, scope: tag, mode: 'all', total: total == null ? 1 : total,
                                   correct: total == null ? 1 : total, firstTry: total == null ? 1 : total,
                                   struggled: 0, newCount: 0 });

// ---------------------------------------------------------------------------------------------

describe('time · the environment these tests need', () => {
  /* Without this, every DST test below would run on UTC, find no transition, pass, and prove
     nothing at all. It is the most important test in the file. */
  test('the runtime really is on Israel time, or the DST tests below are meaningless', () => {
    assert.strictEqual(new Date(2026, 0, 15).getTimezoneOffset(), -120, 'January should be UTC+2 (IST)');
    assert.strictEqual(new Date(2026, 6, 15).getTimezoneOffset(), -180, 'July should be UTC+3 (IDT)');
  });

  test('the fake clock is per-sandbox and does not touch the real one', () => {
    const realBefore = Date.now();
    const ctx = loadTime();
    ctx.at(T0);
    assert.strictEqual(ctx.Date.now(), T0);
    assert.ok(Date.now() >= realBefore, 'the host Date.now must not have been frozen');
    assert.ok(Date.now() !== T0);
  });
});

// ---------------------------------------------------------------------------------------------

describe('clock skew · a wrong clock wins the conflict', () => {
  /* app.js:2697  const newer = (a.last >= b.last) ? a : b;
     That single line is the whole conflict resolver for `level`, and `last` is unvalidated. */

  test('BUG: a phone whose clock runs two days fast overturns an answer given a minute ago', () => {
    const ctx = loadTime();
    // laptop, honest clock: the learner has JUST got this word wrong. level dropped to 0.
    const laptop = side({ k: wr({ seen: 9, first: 4, ever: 8, wrong: 3, level: 0, last: T0 }) });
    // phone, clock two days fast: practised an hour ago in real terms, knew it, stamped T0+2d
    const phone = side({ k: wr({ seen: 5, first: 5, ever: 5, wrong: 0, level: 3, last: T0 + 2 * DAY }) });
    const m = plain(ctx.mergeProgress(laptop, phone));
    assert.strictEqual(m.stats.words.k.level, 3, 'the stale record won because its clock said so');
    assert.strictEqual(m.stats.words.k.last, T0 + 2 * DAY, 'and the skewed stamp is now the record');
  });

  test('BUG: the skewed stamp stays, so answers given for the next two days are discarded too', () => {
    const ctx = loadTime();
    let cloud = wr({ seen: 5, first: 5, ever: 5, wrong: 0, level: 3, last: T0 + 2 * DAY });
    // the learner keeps failing the word on the honest device, all day, for two days
    for (let i = 1; i <= 12; i++) {
      const local = side({ k: wr({ seen: 9 + i, first: 4, ever: 8, wrong: 3 + i, level: 0, last: T0 + i * 3600000 }) });
      cloud = plain(ctx.mergeProgress(local, side({ k: cloud }))).stats.words.k;
    }
    assert.strictEqual(cloud.wrong, 15, 'the mistakes are all counted…');
    assert.strictEqual(cloud.level, 3, '…and the level never moves, because one bad stamp outranks all of them');
  });

  test('BUG: a word frozen at level 3 by a skewed clock leaves the practice queue entirely', () => {
    const ctx = loadTime();
    const term = ctx.BANK[0].term, k = ctx.K(term);
    ctx.stats.words[k] = wr({ seen: 9, first: 4, ever: 8, wrong: 15, level: 3, last: T0 + 2 * DAY });
    const weak = ctx.weakCards('global').map(w => ctx.K(w.term));
    assert.ok(!weak.includes(k), 'a word the learner keeps missing is not offered under "weak"');
    assert.ok(ctx.learnedCards('global').map(w => ctx.K(w.term)).includes(k),
      'it is counted as learned instead -- on the donut, on the ring and in the reminder');
  });

  test('BUG: a clock stepped BACKWARDS makes a device lose to its own earlier write', () => {
    const ctx = loadTime();
    // the cloud holds what this device pushed before the NTP correction
    const cloud = side({ k: wr({ seen: 9, first: 4, ever: 8, wrong: 3, level: 3, last: T0 }) });
    // an hour of drift is corrected; the very next answer is stamped an hour in the past
    const afterStep = side({ k: wr({ seen: 10, first: 4, ever: 8, wrong: 4, level: 0, last: T0 - 3600000 }) });
    const m = plain(ctx.mergeProgress(afterStep, cloud));
    assert.strictEqual(m.stats.words.k.wrong, 4, 'the mistake is counted');
    assert.strictEqual(m.stats.words.k.level, 3, 'but the level it should have taken away is put straight back');
  });

  test('a tie resolves to the local record · which is what makes two tabs on one device safe', () => {
    const ctx = loadTime();
    const a = side({ k: wr({ level: 1, last: T0 }) });
    const b = side({ k: wr({ level: 2, last: T0 }) });
    assert.strictEqual(plain(ctx.mergeProgress(a, b)).stats.words.k.level, 1);
  });

  test('BUG: saneRec clamps a timestamp below zero but accepts one 76 years in the future', () => {
    const ctx = loadTime();
    assert.strictEqual(plain(ctx.saneRec({ last: -5 })).last, 0, 'negative is clamped');
    assert.strictEqual(plain(ctx.saneRec({ last: 'tomorrow' })).last, 0, 'unparseable is clamped');
    assert.strictEqual(plain(ctx.saneRec({ last: 4102444800000 })).last, 4102444800000,
      'the year 2100 is accepted verbatim -- there is no upper bound anywhere');
  });

  /* The fix is two lines and belongs in app.js, so it is written out rather than applied:
       in saneRec()   const cap = Date.now() + 864e5;                       // one day of slack
                      out.last = out.last > cap ? 0 : out.last;
     Anything stamped further ahead than a day cannot have been written by a clock worth
     believing, and zero is the safe value: it loses every conflict instead of winning them all. */
  test.skip('a record stamped further ahead than a day of slack should not be trusted', () => {
    const ctx = loadTime();
    ctx.at(T0);
    assert.strictEqual(plain(ctx.saneRec({ last: T0 + 2 * DAY })).last, 0);
  });
});

// ---------------------------------------------------------------------------------------------

describe('two writers · the same round, twice', () => {
  /* commitSession() writes ONE log row per round and grows it on every later commit
     (app.js:1261-1269). The row's `t` moves each time. The cloud may already hold the earlier
     version of that same row -- and the dedupe key is [t, scope, total, correct], so the two
     versions do not look like the same round to it. */

  /* FIXED 2.8.2026. The row carries `rid` -- the first commit's timestamp plus scope and mode -- 
     and the merge dedupes on it. The old key was [t, scope, total, correct], every one of which
     a SECOND commit of the same round changes, so the half-finished copy in the cloud and the
     finished copy on the device looked like two different rounds. Ten answers logged as fifteen.
     Note what the merge must do beyond deduping: the two copies are the same round at different
     stages, so it keeps the FULLER one rather than whichever arrived first. */
  test('an interrupted round pushed mid-way is still one row after the next sync', () => {
    const ctx = loadTime();
    const cards = ctx.BANK.slice(0, 10);
    ctx.at(T0);
    startRound(ctx, { scope: 'unit:1' });
    for (let i = 0; i < 5; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();                                   // tab hidden → commit, then push
    const pushed = plain({ assoc: ctx.assoc, stats: ctx.stats, deleted: [], added: [], dir: 'w2m' });

    ctx.at(T0 + 120000);                                   // back two minutes later, same round
    for (let i = 5; i < 10; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();
    assert.strictEqual(ctx.stats.sessions.length, 1, 'locally it is still one round');

    const merged = plain(ctx.mergeProgress(
      { assoc: ctx.assoc, stats: ctx.stats, deleted: [], added: [], dir: 'w2m' }, pushed));
    assert.strictEqual(merged.stats.sessions.length, 1, 'the half-finished copy came back as a second round');
    assert.strictEqual(merged.stats.sessions[0].total, 10,
      'the merge kept the staler copy -- ten answers were played and the log must say ten');
  });

  test('the fuller copy wins whichever side it arrives from', () => {
    // the same assertion with the arguments swapped: "keep the first" would pass one way only
    const ctx = loadTime();
    const cards = ctx.BANK.slice(0, 10);
    ctx.at(T0);
    startRound(ctx, { scope: 'unit:1' });
    for (let i = 0; i < 5; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();
    const half = plain({ assoc: {}, stats: plain(ctx.stats), deleted: [], added: [], dir: 'w2m' });
    ctx.at(T0 + 120000);
    for (let i = 5; i < 10; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();
    const full = plain({ assoc: {}, stats: plain(ctx.stats), deleted: [], added: [], dir: 'w2m' });

    for (const [a, b, who] of [[half, full, 'the fuller copy is remote'], [full, half, 'the fuller copy is local']]) {
      const m = plain(ctx.mergeProgress(plain(a), plain(b)));
      assert.strictEqual(m.stats.sessions.length, 1, who + ': not deduped');
      assert.strictEqual(m.stats.sessions[0].total, 10, who + ': the emptier copy won');
    }
  });

  test('BUG: a merge mid-round moves the row pointer, and the next commit lands on another round', () => {
    const ctx = loadTime();
    const cards = ctx.BANK.slice(0, 20);
    ctx.at(T0);              practiseRound(ctx, [[cards[0], 'first']], { scope: 'unit:1' });
    ctx.at(T0 + 3 * DAY);    practiseRound(ctx, [[cards[1], 'first']], { scope: 'unit:1' });

    ctx.at(T0 + 5 * DAY);
    startRound(ctx, { scope: 'unit:2' });
    for (let i = 2; i < 5; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();                                   // creates the row and its rid
    const rid = plain(ctx.stats.sessions).find(r => r.scope === 'unit:2').rid;
    assert.ok(rid, 'the row must carry an id, or nothing below is being tested');
    assert.strictEqual(ctx.sessionRowId, rid);

    /* Exactly what flushRemoteSync does: replace `stats` with the merged object. mergeProgress
       re-sorts by `t`, so a round the other device made on day 1 is inserted BEFORE this one -- 
       and under the old numeric pointer that silently re-aimed it at a three-day-old round. */
    const remote = side({}, [srow(T0 + 1 * DAY, 'unit:9', 7)]);
    ctx.stats = ctx.mergeProgress(
      { assoc: ctx.assoc, stats: ctx.stats, deleted: [], added: [], dir: 'w2m' }, remote).stats;
    const movedTo = plain(ctx.stats.sessions).findIndex(r => r.rid === rid);
    assert.notStrictEqual(movedTo, 2, 'fixture: the merge must actually move the row, or this proves nothing');

    ctx.at(T0 + 5 * DAY + 60000);
    for (let i = 5; i < 8; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();                                   // the learner finishes the round

    const rows = plain(ctx.stats.sessions);
    const mine = rows.find(r => r.rid === rid);
    assert.strictEqual(mine.total, 6, 'the three new answers did not land on the round being played');
    assert.strictEqual(mine.t, T0 + 5 * DAY + 60000);
    const bystander = rows.find(r => r.scope === 'unit:1' && r.t === T0 + 3 * DAY);
    assert.ok(bystander, 'the three-day-old round vanished -- its date was dragged to today');
    assert.strictEqual(bystander.total, 1, 'a bystander round grew');
  });

  test('…and no practice day disappears from the streak', () => {
    const ctx = loadTime();
    const cards = ctx.BANK.slice(0, 20);
    ctx.at(T0);              practiseRound(ctx, [[cards[0], 'first']], { scope: 'unit:1' });
    ctx.at(T0 + 3 * DAY);    practiseRound(ctx, [[cards[1], 'first']], { scope: 'unit:1' });
    ctx.at(T0 + 5 * DAY);
    startRound(ctx, { scope: 'unit:2' });
    for (let i = 2; i < 5; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();

    const before = new Set(plain(ctx.stats.sessions).map(s => ctx.dayKey(s.t)));
    ctx.stats = ctx.mergeProgress(
      { assoc: ctx.assoc, stats: ctx.stats, deleted: [], added: [], dir: 'w2m' },
      side({}, [srow(T0 + 1 * DAY, 'unit:9', 7)])).stats;
    ctx.at(T0 + 5 * DAY + 60000);
    for (let i = 5; i < 8; i++) answerCard(ctx, cards[i], 'first');
    ctx.commitSession();

    const after = new Set(plain(ctx.stats.sessions).map(s => ctx.dayKey(s.t)));
    const lost = [...before].filter(d => !after.has(d));
    assert.deepStrictEqual(lost, [],
      'a calendar day left the log because a round\'s date was dragged forward onto today -- ' +
      'that is a broken streak, and the learner has no way to tell what happened');
  });

  test('two devices practising different words offline both keep their work', () => {
    const ctx = loadTime();
    const base = { k1: wr({ seen: 1, first: 1, ever: 1, level: 3, last: T0 }) };
    const phone  = side({ k1: base.k1, k2: wr({ seen: 2, first: 2, ever: 2, level: 3, last: T0 + 100 }) },
                        [srow(T0 + 100, 'unit:1')]);
    const laptop = side({ k1: base.k1, k3: wr({ seen: 5, first: 1, ever: 3, wrong: 4, level: 1, last: T0 + 200 }) },
                        [srow(T0 + 200, 'unit:2')]);
    const m = plain(ctx.mergeProgress(laptop, phone));
    assert.deepStrictEqual(Object.keys(m.stats.words).sort(), ['k1', 'k2', 'k3']);
    assert.strictEqual(m.stats.sessions.length, 2, 'both rounds are in the log');
    // and the reverse order gives the same answer
    const n = plain(ctx.mergeProgress(phone, laptop));
    assert.deepStrictEqual(Object.keys(n.stats.words).sort(), ['k1', 'k2', 'k3']);
    assert.strictEqual(n.stats.sessions.length, 2);
  });

  test('BUG: two devices that finish an identical round in the same millisecond lose one of them', () => {
    const ctx = loadTime();
    /* The dedupe key is [t, scope, total, correct] and nothing else. Two devices with clocks in
       agreement, both finishing a 10-word unit round with 10 correct at the same millisecond,
       collapse into one row. Unlikely, not impossible -- and it is the honest limit of a dedupe
       key made of the round's own contents rather than an id. */
    const a = side({}, [srow(T0, 'unit:1', 10)]);
    const b = side({}, [srow(T0, 'unit:1', 10)]);
    assert.strictEqual(plain(ctx.mergeProgress(a, b)).stats.sessions.length, 1);
    // one millisecond apart and both survive, which is what makes this a race and not a rule
    const c = side({}, [srow(T0 + 1, 'unit:1', 10)]);
    assert.strictEqual(plain(ctx.mergeProgress(a, c)).stats.sessions.length, 2);
  });
});

// ---------------------------------------------------------------------------------------------

describe('MAX_SESSIONS · what happens exactly at the ceiling', () => {
  test('the cap is 200, and exactly at it nothing is dropped', () => {
    const ctx = loadTime();
    assert.strictEqual(ctx.MAX_SESSIONS, 200);
    const full = []; for (let i = 0; i < 200; i++) full.push(srow(T0 + i * 60000, 'r' + i));
    const m = plain(ctx.mergeProgress(side({}, full), side({}, [])));
    assert.strictEqual(m.stats.sessions.length, 200);
    assert.strictEqual(m.stats.sessions[0].scope, 'r0', 'the oldest round is still there');
  });

  test('one over the cap drops the OLDEST round, and only that one', () => {
    const ctx = loadTime();
    const full = []; for (let i = 0; i < 201; i++) full.push(srow(T0 + i * 60000, 'r' + i));
    const m = plain(ctx.mergeProgress(side({}, full), side({}, [])));
    assert.strictEqual(m.stats.sessions.length, 200);
    assert.strictEqual(m.stats.sessions[0].scope, 'r1');
    assert.strictEqual(m.stats.sessions[199].scope, 'r200');
  });

  test('commitSession still finds its own row after ITS cap trims', () => {
    const ctx = loadTime();
    const cards = ctx.BANK.slice(0, 5);
    ctx.stats.sessions = []; for (let i = 0; i < 200; i++) ctx.stats.sessions.push(srow(T0 + i * 60000, 'old' + i));
    ctx.at(T0 + 300 * 60000);
    startRound(ctx, { scope: 'unit:7' });
    answerCard(ctx, cards[0], 'first');
    ctx.commitSession();                                  // 201 rows → trimmed to 200
    assert.strictEqual(ctx.stats.sessions.length, 200);
    answerCard(ctx, cards[1], 'first');
    ctx.commitSession();                                  // must grow the SAME row
    assert.strictEqual(ctx.stats.sessions.length, 200, 'no second row was created');
    const mine = ctx.stats.sessions.find(r => r.rid === ctx.sessionRowId);
    assert.ok(mine, 'the round lost its own row to the trim');
    assert.strictEqual(mine.scope, 'unit:7');
    assert.strictEqual(mine.total, 2);
  });

  test('BUG: one round stamped in the future pins itself to the log and evicts real ones', () => {
    const ctx = loadTime();
    /* The cap is applied AFTER a sort by `t`, so "the newest 200" means "the 200 with the
       largest numbers", not "the 200 most recent". A round written by a device two days fast
       sits at the end of that list until real time catches up with it -- and every round the
       learner plays in the meantime pushes a REAL one off the front instead. */
    let sess = []; for (let i = 0; i < 200; i++) sess.push(srow(T0 + i * 60000, 'real' + i));
    sess = sess.concat([srow(T0 + 2 * DAY, 'SKEWED')]);
    let m = plain(ctx.mergeProgress(side({}, sess), side({}, [])));
    assert.ok(m.stats.sessions.some(s => s.scope === 'SKEWED'));
    assert.ok(!m.stats.sessions.some(s => s.scope === 'real0'), 'a real round was dropped for it');

    for (let i = 0; i < 20; i++) sess = sess.concat([srow(T0 + (200 + i) * 60000, 'later' + i)]);
    m = plain(ctx.mergeProgress(side({}, sess), side({}, [])));
    assert.ok(m.stats.sessions.some(s => s.scope === 'SKEWED'), 'still there twenty rounds later');
    const lost = sess.filter(s => s.scope !== 'SKEWED' && !m.stats.sessions.some(x => x.scope === s.scope));
    assert.strictEqual(lost.length, 21, 'and twenty-one real rounds have been evicted in its place');
  });
});

// ---------------------------------------------------------------------------------------------

describe('day boundaries · the streak', () => {
  /* app.js:1749  const dayKey = ts => …getFullYear()+'-'+(getMonth()+1)+'-'+getDate();
     app.js:1765  for(let i=start;;i++){ if(!days.has(dayKey(now-i*DAY))) break; n++; }
     dayKey is LOCAL calendar time; the walk is in fixed 24-hour steps. Those two agree on 363
     days a year. */

  const withDays = (ctx, listHe, listEn) => {
    ctx.LS.set('hw_stats', { words: {}, sessions: (listHe || []).map(t => ({ t })) });
    ctx.LS.set('hw_stats_en', { words: {}, sessions: (listEn || []).map(t => ({ t })) });
  };

  test('practising at 23:59 and again at 00:01 is two days, deliberately', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 8, 4, 23, 59), at(2026, 8, 5, 0, 1)]);
    ctx.at(at(2026, 8, 5, 9, 0));
    const s = plain(ctx.streakInfo());
    assert.strictEqual(s.total, 2);
    assert.strictEqual(s.n, 2);
    assert.strictEqual(s.today, true);
  });

  test('both languages count towards one streak', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 8, 3, 10)], [at(2026, 8, 4, 10)]);
    ctx.at(at(2026, 8, 5, 9, 0));
    assert.strictEqual(plain(ctx.streakInfo()).n, 2);
  });

  test('a plain missed day ends the streak, as it should', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 8, 1, 10), at(2026, 8, 2, 10), at(2026, 8, 4, 10)]);
    ctx.at(at(2026, 8, 5, 9, 0));
    assert.strictEqual(plain(ctx.streakInfo()).n, 1);
  });

  /* ---- the two days a year the arithmetic disagrees with the calendar ---- */

  test('DST spring-forward: stepping back 24h from 00:30 skips the whole previous day', () => {
    const ctx = loadTime();
    // Israel 2026: clocks go 02:00 → 03:00 on Friday 27 March. That day is 23 hours long.
    assert.strictEqual(ctx.dayKey(at(2026, 3, 28, 0, 30)), '2026-3-28');
    assert.strictEqual(ctx.dayKey(at(2026, 3, 28, 0, 30) - DAY), '2026-3-26',
      '27 March never appears -- one subtraction jumps clean over it');
  });

  test('practising on the DST day and opening the app at 00:30 that night keeps the streak', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 3, 27, 20)]);                    // practised on the 27th
    ctx.at(at(2026, 3, 28, 0, 30));
    const s = plain(ctx.streakInfo());
    assert.strictEqual(s.total, 1, 'the round IS in the log');
    assert.strictEqual(s.n, 1, 'and the streak counts it');
    assert.deepStrictEqual(s.week.filter(d => d.on).map(d => d.label), ['ו'],
      'the seven-day strip shows the Friday that was practised');
    // …and the answer does not change with the hour, which is what the bug used to do
    ctx.at(at(2026, 3, 28, 9, 0));
    assert.strictEqual(plain(ctx.streakInfo()).n, 1, 'same answer at 09:00 as at 00:30');
  });

  test('DST spring-forward does not lose a day out of the middle of a running streak', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 3, 26, 20), at(2026, 3, 27, 20)]);
    ctx.at(at(2026, 3, 28, 0, 30));
    assert.strictEqual(plain(ctx.streakInfo()).n, 2, 'two consecutive days read as two');
    ctx.at(at(2026, 3, 28, 9, 0));
    assert.strictEqual(plain(ctx.streakInfo()).n, 2, 'and still two once the hour has passed');
  });

  test('DST fall-back does not count the 25-hour day twice', () => {
    const ctx = loadTime();
    // Israel 2026: clocks go 02:00 → 01:00 on Sunday 25 October. That day is 25 hours long.
    withDays(ctx, [at(2026, 10, 23, 20), at(2026, 10, 24, 20), at(2026, 10, 25, 20)]);
    ctx.at(at(2026, 10, 25, 23, 30));
    const s = plain(ctx.streakInfo());
    assert.strictEqual(s.total, 3, 'three distinct days were practised');
    assert.strictEqual(s.n, 3, 'and the streak says three');
  });

  test('the seven-day strip shows seven distinct weekdays on the fall-back day', () => {
    const ctx = loadTime();
    withDays(ctx, [at(2026, 10, 25, 20)]);
    ctx.at(at(2026, 10, 25, 23, 30));
    const labels = plain(ctx.streakInfo()).week.map(d => d.label);
    assert.strictEqual(labels.length, 7);
    assert.strictEqual(new Set(labels).size, 7, 'seven bars, seven distinct weekdays');
    assert.strictEqual(labels[6], 'א', 'and the last one is the Sunday the clock went back on');
  });

  test('the streak walks calendar days across BOTH transitions, hour by hour', () => {
    const ctx = loadTime();
    /* The bug had a one-hour window: 00:30 gave one answer and 09:00 another, from the same
       data. Pinning several hours of the same day makes that class of failure visible again
       rather than only the single hour that happened to be picked. */
    for (const h of [0, 1, 3, 12, 23]) {
      const ctxH = loadTime();
      withDays(ctxH, [at(2026, 3, 26, 20), at(2026, 3, 27, 20), at(2026, 3, 28, 10)]);
      ctxH.at(at(2026, 3, 28, h, 30));
      assert.strictEqual(plain(ctxH.streakInfo()).n, 3, 'spring-forward at ' + h + ':30');
    }
    for (const h of [0, 1, 2, 12, 23]) {
      const ctxH = loadTime();
      withDays(ctxH, [at(2026, 10, 23, 20), at(2026, 10, 24, 20), at(2026, 10, 25, 19)]);
      ctxH.at(at(2026, 10, 25, h, 30));
      assert.strictEqual(plain(ctxH.streakInfo()).n, 3, 'fall-back at ' + h + ':30');
    }
    void ctx;
  });

  /* The fix steps by CALENDAR days instead of by 86,400,000ms: a Date anchored at midday and
     walked back with setDate(), which knows about the transition. Three lines in streakInfo. */
  test('the streak steps by calendar days, not by fixed 24-hour blocks', () => {
    const ctx = loadTime();
    ctx.LS.set('hw_stats', { words: {}, sessions: [{ t: at(2026, 3, 26, 20) }, { t: at(2026, 3, 27, 20) }] });
    ctx.LS.set('hw_stats_en', { words: {}, sessions: [] });
    ctx.at(at(2026, 3, 28, 0, 30));
    assert.strictEqual(plain(ctx.streakInfo()).n, 2);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the exam countdown', () => {
  /* FIXED. examDays() used to be:
       const t = new Date(y, m-1, d).setHours(23,59,59,999);
       days: Math.ceil((t - Date.now()) / 864e5)
 -- Math.ceil over a fraction of a day, not a difference of calendar days, which put every
     figure one too high: "1 day left" all through the exam day and "the exam is today" on the
     day after it. It is now a difference between two local midnights. The three tests below
     used to be named `BUG:` and pinned the off-by-one; they now pin the calendar answer. */

  const setExam = (ctx, v) => ctx.LS.set('hw_examDate', v);

  test('a malformed or missing date produces no countdown at all', () => {
    const ctx = loadTime();
    assert.strictEqual(ctx.examDays(), null);
    setExam(ctx, '5/8/2026');  assert.strictEqual(ctx.examDays(), null);
    setExam(ctx, '2026-8-5');  assert.strictEqual(ctx.examDays(), null);
  });

  test('on the morning of the exam the countdown reads 0 · "המבחן היום" all day', () => {
    const ctx = loadTime();
    setExam(ctx, '2026-08-05');
    ctx.at(at(2026, 8, 5, 8, 0));
    assert.strictEqual(plain(ctx.examDays()).days, 0,
      'renderExamPill says "היום" at days===0, and the exam day is when it should');
    ctx.at(at(2026, 8, 5, 23, 30));
    assert.strictEqual(plain(ctx.examDays()).days, 0, 'still 0 at half past eleven at night');
    ctx.at(at(2026, 8, 5, 0, 1));
    assert.strictEqual(plain(ctx.examDays()).days, 0, 'and one minute after midnight too');
  });

  test('the day after the exam the pill hides instead of wishing good luck', () => {
    const ctx = loadTime();
    setExam(ctx, '2026-08-05');
    ctx.at(at(2026, 8, 6, 8, 0));
    assert.strictEqual(plain(ctx.examDays()).days, -1, 'renderExamPill hides on days < 0');
    ctx.at(at(2026, 8, 6, 23, 0));
    assert.strictEqual(plain(ctx.examDays()).days, -1, 'and stays hidden the whole of that day');
    ctx.at(at(2026, 8, 7, 8, 0));
    assert.strictEqual(plain(ctx.examDays()).days, -2);
  });

  test('every figure in the countdown is the number of calendar days left', () => {
    const ctx = loadTime();
    ctx.at(at(2026, 8, 5, 10, 0));
    for (const [date, shown] of [['2026-08-06', 1], ['2026-08-07', 2], ['2026-08-12', 7]]) {
      setExam(ctx, date);
      assert.strictEqual(plain(ctx.examDays()).days, shown);
    }
    /* the figure must not depend on the time of day the learner happens to open the app */
    for (const h of [0, 6, 13, 23]) {
      ctx.at(at(2026, 8, 5, h, 30));
      setExam(ctx, '2026-08-12');
      assert.strictEqual(plain(ctx.examDays()).days, 7, 'same answer at ' + h + ':30');
    }
  });

  /* ===== the milestone line and the expired date =====
     renderExamPill needs three things app.js gets from the page: $, classify and openAccount.
     Stubbing them here is cheaper than a DOM, and it keeps the assertion on the branch that
     matters -- WHAT the pill decides to say -- rather than on how a div renders. */
  function withPill(ctx) {
    const host = { innerHTML: '', onclick: null, _cls: new Set(),
                   classList: { add(c){ host._cls.add(c); }, remove(c){ host._cls.delete(c); },
                                contains(c){ return host._cls.has(c); } } };
    ctx.$ = sel => sel === '#examPill' ? host : null;
    ctx.classify = () => ({ fresh: 100, weak: 20, ok: 0, strong: 0 });
    ctx.openAccount = () => { host._opened = true; };
    return host;
  }

  test('each milestone range gets its own line, and the exam day gets none', () => {
    const ctx = loadTime();
    /* the boundaries are the whole point: 31/30, 14/13, 7/6 are where the text must flip */
    assert.strictEqual(ctx.examTip(400), ctx.examTip(31), '30+ is one range all the way up');
    assert.notStrictEqual(ctx.examTip(31), ctx.examTip(30), 'the 30/31 boundary must flip');
    assert.strictEqual(ctx.examTip(30), ctx.examTip(14), '14–30 is one range');
    assert.notStrictEqual(ctx.examTip(14), ctx.examTip(13), 'the 13/14 boundary must flip');
    assert.strictEqual(ctx.examTip(13), ctx.examTip(7), '7–13 is one range');
    assert.notStrictEqual(ctx.examTip(7), ctx.examTip(6), 'the 6/7 boundary must flip');
    assert.strictEqual(ctx.examTip(6), ctx.examTip(1), '1–6 is one range');
    assert.strictEqual(ctx.examTip(0), '', 'on the day itself there is nothing to advise');
    for (const d of [400, 31, 30, 14, 13, 7, 6, 1])
      assert.ok(/[א-ת]/.test(ctx.examTip(d)) && !/—/.test(ctx.examTip(d)),
        'every milestone line is Hebrew and free of the em-dash: ' + d);
  });

  test('an exam date that has passed offers to update it instead of vanishing', () => {
    const ctx = loadTime();
    const host = withPill(ctx);
    ctx.LS.set('hw_examDate', '2026-08-05');
    ctx.at(at(2026, 8, 9, 10, 0));                 // four days after the exam
    ctx.renderExamPill();
    assert.ok(!host.classList.contains('hidden'), 'the row stays on screen once the date passes');
    assert.match(host.innerHTML, /עבר/, 'and says so');
    assert.strictEqual(typeof host.onclick, 'function', 'clicking it leads somewhere');
    host.onclick();
    assert.ok(host._opened, 'and where it leads is the settings screen that holds the field');
  });

  test('no date, or one absurdly far off, shows nothing at all', () => {
    const ctx = loadTime();
    const host = withPill(ctx);
    ctx.renderExamPill();
    assert.ok(host.classList.contains('hidden'), 'nothing set -- no nagging row');
    assert.strictEqual(host.onclick, null, 'and nothing to click');
    ctx.LS.set('hw_examDate', '2028-08-05');
    ctx.at(at(2026, 8, 5, 10, 0));                 // 731 days out, past the 400-day guard
    ctx.renderExamPill();
    assert.ok(host.classList.contains('hidden'), 'a countdown that long is noise, not a plan');
  });

  test('the pill carries the milestone line for a live date, and drops it on the day', () => {
    const ctx = loadTime();
    const host = withPill(ctx);
    ctx.at(at(2026, 8, 5, 10, 0));
    ctx.LS.set('hw_examDate', '2026-09-20');       // 46 days out
    ctx.renderExamPill();
    assert.match(host.innerHTML, /46/, 'the number of days is still the headline');
    assert.match(host.innerHTML, /pill-tip/, 'and the milestone line rides under it');
    ctx.LS.set('hw_examDate', '2026-08-05');       // today
    ctx.renderExamPill();
    assert.match(host.innerHTML, /בהצלחה/);
    assert.ok(!/pill-tip/.test(host.innerHTML), 'no advice on the morning of the exam');
  });

  /* ⚠ הבדיקה הזאת נולדה מאובדן אמיתי (12.8.2026). הקוד ב-app.js פלט `class="pill-tip"`,
     ובקומיט של סשן אחר ("יישור ענף העבודה") שלושת כללי ה-CSS של הפיל נמחקו מ-index.html
     יחד עם role=status. שום בדיקה לא צעקה, כי כל צד בנפרד היה תקין · והמסך הציג את
     ציון הדרך דחוס לצד המספרים במקום בשורה משלו. מחלקה שהקוד פולט חייבת עיצוב. */
  test('every class the pill emits has a rule, and the row is announced', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const src = appSrc();
    for (const cls of ['pill-tip', 'exam-past'])
      if (src.includes(cls))
        assert.ok(html.includes('.exam-pill .' + cls) || html.includes('.exam-pill.' + cls),
          `app.js פולט "${cls}" ואין לו כלל ב-index.html`);
    assert.match(html, /id="examPill"[^>]*role="status"/,
      'הפיל אינו מוכרז לקורא מסך');
    /* min-width ולא flex-basis: פריט flex עם basis:100% עדיין מתכווץ ומתיישב בשורה */
    assert.match(html, /\.exam-pill \.pill-tip\{min-width:100%/,
      'ציון הדרך יתיישב לצד המספרים במקום לשבור שורה');
  });

  test('the countdown does not slip a day across a daylight-saving transition', () => {
    const ctx = loadTime();
    // Israel 2026: 27 March is 23 hours long, 25 October is 25 hours long.
    ctx.at(at(2026, 3, 25, 10, 0));
    setExam(ctx, '2026-03-30');
    assert.strictEqual(plain(ctx.examDays()).days, 5, 'five calendar days across spring-forward');
    ctx.at(at(2026, 10, 23, 10, 0));
    setExam(ctx, '2026-10-28');
    assert.strictEqual(plain(ctx.examDays()).days, 5, 'five calendar days across fall-back');
  });

  /* Calendar-day arithmetic, matching what the sentence claims:
       const t0 = new Date(); t0.setHours(0,0,0,0);
       days: Math.round((new Date(y, m-1, d) - t0) / 864e5)                */
  test('the countdown reads 0 on the day of the exam and negative after it', () => {
    const ctx = loadTime();
    setExam(ctx, '2026-08-05');
    ctx.at(at(2026, 8, 5, 8, 0));
    assert.strictEqual(plain(ctx.examDays()).days, 0);
    ctx.at(at(2026, 8, 6, 8, 0));
    assert.strictEqual(plain(ctx.examDays()).days, -1);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the reminder · how long is "two days away"', () => {
  /* app.js:3480  const away = d.last ? Math.floor((Date.now() - d.last) / DAY) : -1;
     A 48-hour window, while the streak beside it counts calendar days. */
  const facts = last => ({ streak: 0, learned: 120, weak: 30, last });

  test('the buckets are 48 hours and 14 days, measured from the last round', () => {
    const ctx = loadTime();
    const now = at(2026, 8, 5, 9, 0); ctx.at(now);
    assert.match(plain(ctx.NOTIF.compose(facts(now - 1.9 * DAY))).title, /זמן ללמוד/);
    assert.match(plain(ctx.NOTIF.compose(facts(now - 2 * DAY))).title, /יומיים/);
    assert.match(plain(ctx.NOTIF.compose(facts(now - 13 * DAY))).title, /יומיים/);
    /* הכותרת כאן היא **סמן לדלי** ולא הנוסח שנבדק. היא הייתה "המילים מחכות
       לך" ושונתה ל"מילים לחיזוק" ב-14.8: מילים אינן מחכות, וזו ההאנשה
       ש-/HEB §1ב נוקב בה בשמה. הגבול עצמו · 14 יום · לא זז. */
    assert.match(plain(ctx.NOTIF.compose(facts(now - 14 * DAY))).title, /לחיזוק/);
  });

  test('BUG: two whole calendar days can pass without "יומיים בלי תרגול" ever firing', () => {
    const ctx = loadTime();
    // last round Monday 23:00; the learner skips Tuesday entirely and opens on Wednesday morning
    ctx.at(at(2026, 8, 5, 8, 0));                      // Wednesday
    const last = at(2026, 8, 3, 23, 0);                // Monday night
    assert.match(plain(ctx.NOTIF.compose(facts(last))).title, /זמן ללמוד/,
      'Tuesday was missed outright, and the message is still the ordinary one');
  });

  test('BUG: a session stamped in the future silences every away-based reminder', () => {
    const ctx = loadTime();
    const now = at(2026, 8, 5, 9, 0); ctx.at(now);
    /* NOTIF.facts() takes `last` as the largest session `t` across both languages. One round
       pushed by a device whose clock is two days fast makes `away` negative for two days -- and
       during those two days the learner can vanish entirely without either reminder firing. */
    assert.match(plain(ctx.NOTIF.compose(facts(now + 2 * DAY))).title, /זמן ללמוד/);
    assert.ok(!/יומיים|מחכות/.test(plain(ctx.NOTIF.compose(facts(now + 2 * DAY))).title));
  });

  test('the daily nudge is decided on the DEVICE clock, in a 6:00–12:00 window', () => {
    const ctx = loadTime();
    // openTimeNudge is DOM-bound, so what is pinned here is the value it reads
    ctx.at(at(2026, 8, 5, 5, 59)); assert.strictEqual(new ctx.Date().getHours(), 5);
    ctx.at(at(2026, 8, 5, 6, 0));  assert.strictEqual(new ctx.Date().getHours(), 6);
    ctx.at(at(2026, 8, 5, 12, 30)); assert.strictEqual(new ctx.Date().getHours(), 12);
    // and the "once a day" marker is a dayKey, so it shares every property tested above
    assert.strictEqual(ctx.dayKey(at(2026, 8, 5, 12, 30)), '2026-8-5');
  });
});
