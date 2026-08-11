'use strict';
/* The three practice buckets.
 *
 * newCards / weakCards / learnedCards feed the three buttons a learner actually presses, and
 * classify() feeds the donut above them. When these disagree, nothing errors: the app just shows
 * a number that contradicts the button underneath it, or hands back a word the learner already
 * practised as though it were new. That is the bug a tester reported today, and it survived
 * because "practise a unit and look at the buttons" is a slow thing to do by hand and nobody
 * does it twice.
 *
 * Everything below drives the REAL commitSession() from app.js — the same function the app runs
 * at the end of a round — so the level arithmetic under test is the shipped arithmetic.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, startRound, practiseRound, answerCard, expectNone } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);
const SCOPE = 'unit:1';

function fresh() { return loadApp({ lang: 'he' }); }
const keys = (ctx, list) => new Set(Array.from(list).map(w => ctx.K(w.term)));

describe('buckets — partition', () => {
  test('new + weak + learned covers the scope exactly once, before any practice', () => {
    const ctx = fresh();
    const total = ctx.uniqScope(SCOPE).length;
    const n = ctx.newCards(SCOPE).length, w = ctx.weakCards(SCOPE).length, l = ctx.learnedCards(SCOPE).length;
    assert.strictEqual(n + w + l, total, `buckets sum to ${n + w + l} but the scope holds ${total}`);
    assert.strictEqual(n, total, 'with no history every word should be new');
    assert.strictEqual(w + l, 0);
  });

  test('the three buckets stay mutually exclusive after a mixed round', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 30);
    practiseRound(ctx, deck.map((w, i) => [w, ['first', 'struggle', 'wrong'][i % 3]]), { scope: SCOPE });

    const n = keys(ctx, ctx.newCards(SCOPE)), w = keys(ctx, ctx.weakCards(SCOPE)), l = keys(ctx, ctx.learnedCards(SCOPE));
    const both = (a, b, label) => none([...a].filter(k => b.has(k)), `words in two buckets at once (${label}):`);
    both(n, w, 'new ∩ weak');
    both(n, l, 'new ∩ learned');
    both(w, l, 'weak ∩ learned');
  });

  test('the three buckets stay exhaustive after a mixed round', () => {
    const ctx = fresh();
    const all = ctx.uniqScope(SCOPE);
    practiseRound(ctx, all.slice(0, 30).map((w, i) => [w, ['first', 'struggle', 'wrong'][i % 3]]), { scope: SCOPE });

    const covered = new Set([...keys(ctx, ctx.newCards(SCOPE)), ...keys(ctx, ctx.weakCards(SCOPE)), ...keys(ctx, ctx.learnedCards(SCOPE))]);
    none(Array.from(all).map(w => ctx.K(w.term)).filter(k => !covered.has(k)),
      'words in the scope that no bucket claims — unreachable from any practice button:');
    assert.strictEqual(covered.size, all.length);
  });

  test('a level-test skip is the ONLY word allowed to sit outside all three buckets', () => {
    /* Stated as an equation so it cannot drift: the buttons plus the skipped count must equal
     * the scope. A skipped word is deliberately in no practice bucket — the learner said they
     * already know it — and classify() gives it its own slice of the donut. Without the
     * `+ skipped` term this invariant would silently become "buckets need not cover the scope". */
    const ctx = fresh();
    const all = ctx.uniqScope(SCOPE);
    ctx.stats.words[ctx.K(all[40].term)] =
      { seen: 1, first: 1, ever: 1, wrong: 0, level: 3, last: Date.now(), src: 'lv' };
    practiseRound(ctx, all.slice(0, 10).map((w, i) => [w, i % 2 ? 'first' : 'wrong']), { scope: SCOPE });

    const n = ctx.newCards(SCOPE).length, w = ctx.weakCards(SCOPE).length, l = ctx.learnedCards(SCOPE).length;
    const c = ctx.classify(SCOPE);
    assert.strictEqual(c.skipped, 1);
    assert.strictEqual(n + w + l + c.skipped, all.length,
      `buttons offer ${n + w + l} words, ${c.skipped} are skipped, but the scope holds ${all.length}`);

    const covered = new Set([...keys(ctx, ctx.newCards(SCOPE)), ...keys(ctx, ctx.weakCards(SCOPE)), ...keys(ctx, ctx.learnedCards(SCOPE))]);
    const orphans = Array.from(all).map(x => ctx.K(x.term)).filter(k => !covered.has(k));
    assert.deepStrictEqual(orphans, [ctx.K(all[40].term)],
      'exactly the skipped word should be outside every bucket');
  });

  test('a word never appears twice inside one bucket', () => {
    const ctx = fresh();
    practiseRound(ctx, ctx.uniqScope(SCOPE).slice(0, 30).map((w, i) => [w, i % 2 ? 'first' : 'wrong']), { scope: SCOPE });
    for (const [name, fn] of [['new', 'newCards'], ['weak', 'weakCards'], ['learned', 'learnedCards']]) {
      const list = Array.from(ctx[fn](SCOPE));
      assert.strictEqual(new Set(list.map(w => ctx.K(w.term))).size, list.length, `${name} contains a duplicate`);
    }
  });
});

describe("buckets — the tester's report: a practised word came back as new", () => {
  /* Reported today: practise 30 words in a unit, ask for "מילים חדשות", and some of the 30 come
   * back — both the ones he got right and the ones he got wrong. The cause (app.js:314) was that
   * "new" was defined as level < 1, and level is a STRENGTH counter, not a record of having met
   * the word: a wrong answer decrements and floors at 0, and so does a right answer that was not
   * on the first try. Both land on 0, which the old rule read as "never seen".
   *
   * This is the exact scenario, with the outcome mix that produced it. */
  test('practise 30 words with a realistic mix — none returns to "new"', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 30);
    // The mix that matters: the bug showed up for wrong answers AND for late-correct ones.
    const outcomes = deck.map((_, i) => (i % 10 < 4 ? 'wrong' : i % 10 < 7 ? 'struggle' : 'first'));
    practiseRound(ctx, deck.map((w, i) => [w, outcomes[i]]), { scope: SCOPE });

    const stillNew = keys(ctx, ctx.newCards(SCOPE));
    const returned = deck
      .map((w, i) => ({ w, outcome: outcomes[i] }))
      .filter(({ w }) => stillNew.has(ctx.K(w.term)))
      .map(({ w, outcome }) => `${w.term} (answered: ${outcome}, level ${ctx.lvl(w.term)}, seen ${ctx.seenCount(w.term)})`);

    none(returned, 'practised words offered again under "מילים שעוד לא תרגלתי":');
    assert.strictEqual(ctx.newCards(SCOPE).length, ctx.uniqScope(SCOPE).length - 30);
  });

  test('a word answered WRONG lands in weak, not in new', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    practiseRound(ctx, [[card, 'wrong']], { scope: SCOPE });
    assert.strictEqual(ctx.lvl(card.term), 0, 'a wrong answer should floor the level at 0');
    assert.strictEqual(ctx.seenCount(card.term), 1, 'but `seen` must record that the word was met');
    assert.ok(!keys(ctx, ctx.newCards(SCOPE)).has(ctx.K(card.term)), 'a word you got wrong is not a word you never met');
    assert.ok(keys(ctx, ctx.weakCards(SCOPE)).has(ctx.K(card.term)), 'it belongs in לחיזוק');
  });

  test('a word answered right but not first-try also lands in weak, not in new', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    practiseRound(ctx, [[card, 'struggle']], { scope: SCOPE });
    assert.strictEqual(ctx.lvl(card.term), 0);
    assert.strictEqual(ctx.seenCount(card.term), 1);
    assert.ok(!keys(ctx, ctx.newCards(SCOPE)).has(ctx.K(card.term)));
    assert.ok(keys(ctx, ctx.weakCards(SCOPE)).has(ctx.K(card.term)));
  });

  test('a clean first sight jumps straight to learned', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    practiseRound(ctx, [[card, 'first']], { scope: SCOPE });
    assert.strictEqual(ctx.lvl(card.term), 3, 'a word known on first sight is mastered (app.js:897)');
    assert.ok(keys(ctx, ctx.learnedCards(SCOPE)).has(ctx.K(card.term)));
  });

  test('a retry round cannot promote a word past where it already stood', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    practiseRound(ctx, [[card, 'wrong']], { scope: SCOPE });
    const before = ctx.lvl(card.term);
    practiseRound(ctx, [[card, 'first']], { scope: SCOPE, retry: true });
    assert.strictEqual(ctx.lvl(card.term), before,
      'recalling a word you just missed proves short-term recall, not knowledge (app.js:895)');
  });

  test('seen only ever grows — practice can never un-meet a word', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    let last = 0;
    for (const outcome of ['wrong', 'first', 'wrong', 'struggle', 'first']) {
      practiseRound(ctx, [[card, outcome]], { scope: SCOPE });
      const now = ctx.seenCount(card.term);
      assert.ok(now > last, `seen went ${last} -> ${now} after "${outcome}"`);
      last = now;
      assert.ok(!keys(ctx, ctx.newCards(SCOPE)).has(ctx.K(card.term)), `back in "new" after "${outcome}"`);
    }
  });
});

describe('buckets — a round interrupted part-way', () => {
  /* commitSession() can legitimately run several times in one round: visibilitychange fires
   * every time a notification pulls the learner away. The old code latched after the first
   * commit and threw the rest of the round away — the results screen said 10/10 while storage
   * held 3. The latch now guards only against applying the SAME entry twice.
   *
   * Both halves of that are silent when wrong, and both are about counts the learner is shown. */
  test('committing twice does not charge a word twice', () => {
    const ctx = fresh();
    const [card] = ctx.uniqScope(SCOPE);
    startRound(ctx, { scope: SCOPE });
    answerCard(ctx, card, 'first');
    ctx.commitSession();
    const afterFirst = { seen: ctx.seenCount(card.term), level: ctx.lvl(card.term) };
    ctx.commitSession();
    ctx.commitSession();
    assert.strictEqual(ctx.seenCount(card.term), afterFirst.seen, 'seen was incremented twice for one answer');
    assert.strictEqual(ctx.lvl(card.term), afterFirst.level);
  });

  test('words answered AFTER an interruption are still recorded', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 6);
    startRound(ctx, { scope: SCOPE });
    for (const card of deck.slice(0, 3)) answerCard(ctx, card, 'first');
    ctx.commitSession();                       // the learner is interrupted here
    for (const card of deck.slice(3)) answerCard(ctx, card, 'first');
    ctx.commitSession();                       // …and finishes the round
    none(deck.filter(w => ctx.seenCount(w.term) === 0).map(w => w.term),
      'answered in the second half of an interrupted round but never recorded:');
  });

  test('an interrupted round is ONE row in the session log, not several', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 9);
    startRound(ctx, { scope: SCOPE });
    for (const chunk of [deck.slice(0, 3), deck.slice(3, 6), deck.slice(6)]) {
      for (const card of chunk) answerCard(ctx, card, 'first');
      ctx.commitSession();
    }
    assert.strictEqual(ctx.stats.sessions.length, 1,
      'a round interrupted twice was logged as three separate rounds — the trend chart draws that');
    assert.strictEqual(ctx.stats.sessions[0].total, 9);
    assert.strictEqual(ctx.stats.sessions[0].correct, 9);
  });

  test('a genuinely new round starts a new log row', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 4);
    practiseRound(ctx, [[deck[0], 'first'], [deck[1], 'first']], { scope: SCOPE });
    practiseRound(ctx, [[deck[2], 'first'], [deck[3], 'first']], { scope: SCOPE });
    assert.strictEqual(ctx.stats.sessions.length, 2);
  });
});

describe('buckets — agreement with the donut', () => {
  test('classify totals match the scope and sum to their own total', () => {
    const ctx = fresh();
    practiseRound(ctx, ctx.uniqScope(SCOPE).slice(0, 30).map((w, i) => [w, ['first', 'struggle', 'wrong'][i % 3]]), { scope: SCOPE });
    const c = ctx.classify(SCOPE);
    assert.strictEqual(c.total, ctx.uniqScope(SCOPE).length);
    assert.strictEqual(c.strong + c.weak + c.fresh + c.skipped, c.total, 'classify buckets do not sum to its own total');
  });

  test('classify agrees with the three buttons after ordinary practice', () => {
    const ctx = fresh();
    practiseRound(ctx, ctx.uniqScope(SCOPE).slice(0, 30).map((w, i) => [w, ['first', 'struggle', 'wrong'][i % 3]]), { scope: SCOPE });
    const c = ctx.classify(SCOPE);
    assert.strictEqual(c.fresh, ctx.newCards(SCOPE).length, 'donut "חדשות" disagrees with the new button');
    assert.strictEqual(c.weak, ctx.weakCards(SCOPE).length, 'donut "חלשות" disagrees with the weak button');
    assert.strictEqual(c.strong, ctx.learnedCards(SCOPE).length, 'donut "שלמדתי" disagrees with the learned button');
  });

  test('classify agrees with the three buttons after a LEVEL TEST skip', () => {
    /* app.js:294 states the intent outright: a word skipped after the level test "is not a word
     * anyone learned here, and counting it under שלמדתי is the same false claim the dashboard was
     * just cured of. It gets its own bucket."
     *
     * classify() implements that. learnedCards() — which fills the שלמדתי button — does not, so
     * the donut and the button disagree by exactly the number of skipped words.
     *
     * The record below is byte-for-byte the one app.js:1637 writes. */
    const ctx = fresh();
    const victim = ctx.uniqScope(SCOPE)[40];
    ctx.stats.words[ctx.K(victim.term)] =
      { seen: 1, first: 1, ever: 1, wrong: 0, level: 3, last: Date.now(), src: 'lv' };

    const c = ctx.classify(SCOPE);
    assert.strictEqual(c.skipped, 1, 'classify should put the skipped word in its own bucket');
    assert.strictEqual(c.fresh, ctx.newCards(SCOPE).length);
    assert.strictEqual(c.weak, ctx.weakCards(SCOPE).length);
    assert.strictEqual(c.strong, ctx.learnedCards(SCOPE).length,
      `the donut says ${c.strong} words are known; the "שלמדתי" button offers ` +
      `${ctx.learnedCards(SCOPE).length}. learnedCards() does not exclude wasSkipped() words, so a ` +
      `word the learner declared they already knew is practised as one they learned here.`);
  });
});

describe('buckets — scope', () => {
  test('a unit scope is a strict subset of global, and the units partition the bank', () => {
    const ctx = fresh();
    const global = ctx.uniqScope('global').length;
    let sum = 0;
    for (const u of ctx.UNIT_IDS) sum += ctx.uniqScope('unit:' + u).length;
    assert.strictEqual(sum, global, 'the ten units do not add up to the whole bank');
  });

  test('practice in one unit does not move another unit\'s counts', () => {
    const ctx = fresh();
    const before = ctx.classify('unit:2');
    practiseRound(ctx, ctx.uniqScope('unit:1').slice(0, 10).map(w => [w, 'first']), { scope: 'unit:1' });
    assert.deepStrictEqual(
      { ...ctx.classify('unit:2') }, { ...before },
      'practising unit 1 changed unit 2 — the scopes are sharing a key');
  });

  test('weakCards is ordered oldest-first so revision reaches the stalest word', () => {
    const ctx = fresh();
    const deck = ctx.uniqScope(SCOPE).slice(0, 6);
    for (const card of deck) practiseRound(ctx, [[card, 'wrong']], { scope: SCOPE });
    const order = Array.from(ctx.weakCards(SCOPE)).map(w => ctx.lastOf(w.term));
    const sorted = order.slice().sort((a, b) => a - b);
    assert.deepStrictEqual(order, sorted, 'weakCards is not sorted by last-seen ascending');
  });
});

// ---------------------------------------------------------------------------------------------

/* The home-screen shortcut into a weak round. It used to hide below four weak words, which meant
 * the learner with two left — the moment a short round actually closes the gap — was shown
 * nothing. Lowering the floor to one exposed a second bug the old threshold had been hiding:
 * the label was built as `${n} מילים`, so it would have read "1 מילים לחיזוק". */
describe('the weak-words shortcut on the home screen', () => {
  test('one weak word is written as Hebrew, not as "1 מילים"', () => {
    const ctx = fresh();
    assert.match(ctx.weakCtaText(1), /מילה אחת/, 'singular must not be "1 מילים"');
    assert.ok(!/^1 /.test(ctx.weakCtaText(1)), 'and must not open with the digit 1');
  });

  test('every other count keeps the number, because the number is the reason to tap', () => {
    const ctx = fresh();
    for (const n of [2, 3, 7, 40, 312])
      assert.match(ctx.weakCtaText(n), new RegExp('(^|[^0-9])' + n + ' מילים'),
        'the count must appear for n=' + n);
  });

  test('the label always says which words these are, in the screen\'s own lexicon', () => {
    const ctx = fresh();
    for (const n of [1, 5])
      assert.match(ctx.weakCtaText(n), /לחיזוק · מכל יחידות הלימוד$/,
        'a new synonym for the weak bucket would make the learner translate');
  });
});
