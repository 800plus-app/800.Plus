'use strict';
/* One gloss, one question · the rule that keeps a round from asking the same thing twice.
 *
 * What a user reported (2.8.2026)
 * -------------------------------
 *   "כשמתרגלים את ההסבר->מילה יש מלא מילים שחוזרות על עצמן"
 *
 * The words were not repeating. The QUESTIONS were. In the m2w direction the prompt is the
 * gloss, and 186 English glosses in the bank serve more than one entry · "מתחת" is below,
 * beneath, under AND underneath, all four of them in unit 1. Four separate cards, one identical
 * prompt, and no way for the learner to know which of the four is wanted.
 *
 * What was NOT wrong, and why that matters
 * ----------------------------------------
 * Nothing was ever scored against the learner for this: isCorrect falls through to glossAlts(),
 * which accepts every other bank word carrying the same gloss, and finishCard names the card's
 * own word in the feedback. That machinery already existed and is deliberately left alone here.
 * The defect was narrower · the prompt was unanswerable AS POSED, and the round read as one
 * question asked over and over.
 *
 * Why the duplicate is flipped rather than dropped
 * ------------------------------------------------
 * `cards` arrives already capped, so dropping a card shortens the round the learner asked for.
 * Flipping to w2m makes the prompt the WORD, which is unambiguous by construction, keeps the
 * entry in the round, and keeps the length. In 'mixed' this is entirely within contract; in pure
 * m2w it is the closest honest thing to the direction that was chosen, because the alternative
 * is a question with four right answers and no way to tell.
 *
 * Both banks are covered: Hebrew has 22 such groups (47 entries), English 186 (401 entries).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource, banks, expectNone } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

const none = (list, msg) => expectNone(assert, list, msg);
const app = appSource();

/* oneCardPerGloss is needed only by this file -- lifted pointwise rather than added to the shared
   list every other test file would then pay to load. Same contract: a rename in app.js throws
   out of extractAll BY NAME instead of leaving a green test on a function that no longer runs. */
function ctxFor(lang) {
  const c = loadApp({ lang, bank: false });
  for (const { name, code } of extractAll(app, ['oneCardPerGloss']))
    vm.runInContext(code, c, { filename: `app.js:${name}` });
  return c;
}
const EN = ctxFor('en');
const HE = ctxFor('he');

const card = (term, meaning, _dir) => ({ term, meaning, unit: '1', _dir });
const m2wOf = deck => deck.filter(c => c._dir === 'm2w');

describe('the rule · a gloss may pose at most one question per round', () => {

  test('four entries sharing one gloss leave exactly one m2w card', () => {
    const deck = ['below', 'beneath', 'under', 'underneath'].map(t => card(t, 'מתחת', 'm2w'));
    EN.oneCardPerGloss(deck);
    assert.strictEqual(m2wOf(deck).length, 1,
      'the learner would see the prompt "מתחת" more than once, with no way to tell the cards apart');
  });

  test('the other three are flipped, never dropped · the round keeps its length', () => {
    const deck = ['below', 'beneath', 'under', 'underneath'].map(t => card(t, 'מתחת', 'm2w'));
    const before = deck.length;
    EN.oneCardPerGloss(deck);
    assert.strictEqual(deck.length, before, 'a card was removed — the round is shorter than asked for');
    assert.strictEqual(deck.filter(c => c._dir === 'w2m').length, 3);
    /* Flipped means still practised: every one of the four entries is still in the round. */
    assert.deepStrictEqual(new Set(deck.map(c => c.term)),
      new Set(['below', 'beneath', 'under', 'underneath']));
  });

  test('distinct glosses are left completely alone', () => {
    const deck = [card('below', 'מתחת', 'm2w'), card('above', 'מעל', 'm2w'), card('near', 'ליד', 'm2w')];
    EN.oneCardPerGloss(deck);
    assert.strictEqual(m2wOf(deck).length, 3, 'a card was flipped although its prompt was unique');
  });

  test('a w2m card is never touched, even when its gloss collides', () => {
    /* In w2m the prompt is the WORD, so two entries sharing a gloss are two different questions.
       Flipping one of those to m2w would CREATE the collision this rule exists to prevent. */
    const deck = [card('below', 'מתחת', 'w2m'), card('beneath', 'מתחת', 'w2m')];
    EN.oneCardPerGloss(deck);
    assert.strictEqual(deck.filter(c => c._dir === 'w2m').length, 2);
    assert.strictEqual(m2wOf(deck).length, 0);
  });

  test('a w2m card does not consume the gloss on behalf of an m2w card', () => {
    /* The mixed direction deals both. If the w2m card claimed the gloss first, the m2w card
       would be flipped for a collision that never existed -- the round would quietly drift away
       from the direction the learner picked. */
    const deck = [card('below', 'מתחת', 'w2m'), card('beneath', 'מתחת', 'm2w')];
    EN.oneCardPerGloss(deck);
    assert.strictEqual(m2wOf(deck).length, 1, 'the only m2w card was flipped for nothing');
    assert.strictEqual(m2wOf(deck)[0].term, 'beneath');
  });

  test('an empty or one-character gloss is skipped, not treated as a shared key', () => {
    /* glossKey strips parentheses and punctuation, so a gloss that is nothing but an example
       reduces to ''. Treating '' as a key would collapse every such card onto one another. */
    const deck = [card('a', '(ראה להלן)', 'm2w'), card('b', '(ראה להלן)', 'm2w')];
    EN.oneCardPerGloss(deck);
    assert.strictEqual(m2wOf(deck).length, 2,
      'two cards with no usable gloss were treated as sharing one prompt');
  });

  test('the key ignores the example, exactly as glossKey does', () => {
    /* "יקר (מחיר)" and "יקר" pose the same question the moment maskTerm drops the aside. */
    const deck = [card('costly', 'יקר (מחיר גבוה)', 'm2w'), card('expensive', 'יקר', 'm2w')];
    EN.oneCardPerGloss(deck);
    assert.strictEqual(m2wOf(deck).length, 1, 'the aside was treated as part of the meaning');
  });
});

describe('over the real banks', () => {
  for (const [lang, ctx] of [['en', EN], ['he', HE]]) {
    const bank = banks()[lang];

    test(`${lang}: no round drawn from one unit can show a prompt twice`, () => {
      /* The whole unit at once is the worst case any real round can be a subset of. */
      const bad = [];
      for (const u of Object.keys(bank)) {
        const deck = bank[u].map(p => card(p[0], p[1], 'm2w'));
        ctx.oneCardPerGloss(deck);
        const seen = new Map();
        for (const c of m2wOf(deck)) {
          const g = ctx.glossKey(c.meaning);
          if (seen.has(g)) bad.push(`unit ${u}: "${g}" asked as both ${seen.get(g)} and ${c.term}`);
          else seen.set(g, c.term);
        }
      }
      none(bad, 'the same question is posed twice inside one round');
    });

    test(`${lang}: every entry stays in the round · the fix costs no practice`, () => {
      const bad = [];
      for (const u of Object.keys(bank)) {
        const deck = bank[u].map(p => card(p[0], p[1], 'm2w'));
        const n = deck.length;
        ctx.oneCardPerGloss(deck);
        if (deck.length !== n) bad.push(`unit ${u}: ${n} cards in, ${deck.length} out`);
      }
      none(bad, 'cards were dropped instead of flipped');
    });
  }

  test('the collision is real in the shipped data, so this rule is not theoretical', () => {
    /* If a future editorial pass disambiguates every gloss, this assertion is the thing that
       says so out loud rather than leaving the rule above passing vacuously forever. */
    const en = banks().en;
    const by = new Map();
    for (const u of Object.keys(en)) for (const p of en[u]) {
      const g = EN.glossKey(p[1]);
      by.set(g, (by.get(g) || 0) + 1);
    }
    const groups = [...by.values()].filter(n => n > 1).length;
    assert.ok(groups > 0,
      'no English gloss serves two entries any more — the flip rule now protects nothing, ' +
      'and this file should be re-read before it is trusted');
  });
});

describe('the rule is actually wired into the round', () => {
  /* startRound builds the deck, calls goto() and renderCard(), and cannot be lifted into the
     sandbox. So the checks above prove the FUNCTION is right, and this one proves it is
     reached -- without it they would go on passing over code nothing calls. */
  test('startRound runs the deck through oneCardPerGloss', () => {
    const at = app.indexOf('function startRound');
    assert.ok(at > 0, 'startRound disappeared');
    const body = app.slice(at, at + 1400);
    assert.ok(/oneCardPerGloss\s*\(/.test(body),
      'the deck is built without oneCardPerGloss — the duplicate prompts are back');
  });

  test('the deck it receives is one that already carries _dir', () => {
    /* First draft of this test compared indexOf('_dir') with indexOf('oneCardPerGloss(') and
       failed on correct code: the call WRAPS the .map that assigns _dir, so it is written first
       and evaluated last. Textual order is not evaluation order. What actually matters is that
       _dir is assigned inside the call's own argument -- a deck handed over before _dir exists
       looks entirely w2m, and the function would flip nothing while still appearing wired in. */
    const at = app.indexOf('function startRound');
    const call = app.slice(at).indexOf('oneCardPerGloss(');
    const arg = app.slice(at + call, at + call + 400);
    const close = arg.indexOf(');');
    assert.ok(close > 0 && /_dir\s*:/.test(arg.slice(0, close)),
      'oneCardPerGloss is handed a deck whose _dir has not been assigned yet — nothing will flip');
  });

  test('isCorrect still falls through to glossAlts · the acceptance was never the bug', () => {
    /* Guard on the machinery this fix deliberately did NOT touch: a learner who answers "under"
       to a "beneath" card is right, and must stay right. */
    assert.ok(/glossAlts\(w\)\.find\(t\s*=>\s*isCorrect\(/.test(app),
      'the synonym fallback is gone — correct answers would now be marked wrong');
  });
});
