'use strict';
/* Answer checking.
 *
 * This is the function that tells a learner they were wrong. Every failure here is the app
 * lying: a rejected correct answer teaches the learner to distrust the app, and an accepted
 * wrong one teaches them the wrong word. Neither shows up in a console.
 *
 * check() itself (app.js:735) cannot be lifted -- it reads #answerInput and writes #feedback.
 * What it decides with is two lines, restated here and nowhere else:
 *     isCorrect(v, w.term) || glossAlts(w).some(t => isCorrect(v, t))
 * Everything those two lines call is the real code.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, expectNone } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);
const he = loadApp({ lang: 'he' });
const en = loadApp({ lang: 'en' });

/* The acceptance rule of check() for a word→meaning card, in one place. */
const accepts = (ctx, typed, card) =>
  ctx.isCorrect(typed, card.term) || Array.from(ctx.glossAlts(card)).some(t => ctx.isCorrect(typed, t));

const find = (ctx, term) => {
  const w = Array.from(ctx.BANK).find(x => x.term === term);
  assert.ok(w, `"${term}" is no longer in the bank — pick another example for this test`);
  return w;
};

describe('isCorrect · exact match', () => {
  test('a term answers itself in both languages', () => {
    assert.strictEqual(he.isCorrect('כֹּפֶר', 'כֹּפֶר'), true);
    assert.strictEqual(en.isCorrect('house', 'house'), true);
  });

  test('normalisation applies to the answer as well as the term', () => {
    assert.strictEqual(en.isCorrect('  HOUSE ', 'house'), true);
    assert.strictEqual(en.isCorrect('the house', 'house'), true);
    assert.strictEqual(he.isCorrect(' כפר ', 'כֹּפֶר'), true);
  });

  test('an empty or whitespace answer is never correct', () => {
    for (const v of ['', '   ', '\t', null, undefined]) {
      assert.strictEqual(en.isCorrect(v, 'house'), false, `"${v}" was accepted`);
      assert.strictEqual(he.isCorrect(v, 'כֹּפֶר'), false, `"${v}" was accepted`);
    }
  });

  test('a punctuation-only answer is never correct', () => {
    // These normalise to '' -- the guard at app.js:488 is what stops them matching everything.
    assert.strictEqual(en.isCorrect('!!!', 'house'), false);
    assert.strictEqual(he.isCorrect('...', 'כֹּפֶר'), false);
    assert.strictEqual(he.isCorrect('״', 'כֹּפֶר'), false);
  });

  test('a different word is not correct', () => {
    assert.strictEqual(en.isCorrect('cat', 'dog'), false);
    assert.strictEqual(he.isCorrect('שולחן', 'כֹּפֶר'), false);
  });
});

describe('isCorrect · slash and comma alternatives', () => {
  test('either side of a " - " pair is accepted', () => {
    const w = find(en, '1st - first');
    assert.strictEqual(en.isCorrect('first', w.term), true);
    assert.strictEqual(en.isCorrect('1st', w.term), true);
    assert.strictEqual(en.isCorrect('1st - first', w.term), true);
  });

  test('either side of a slash pair is accepted', () => {
    assert.strictEqual(en.isCorrect('raise', 'raise / lift'), true);
    assert.strictEqual(en.isCorrect('lift', 'raise / lift'), true);
  });

  test('a comma-separated alternative is accepted', () => {
    assert.strictEqual(en.isCorrect('lorry', 'truck, lorry'), true);
    assert.strictEqual(en.isCorrect('truck', 'truck, lorry'), true);
  });

  test('a word NOT among the alternatives is still rejected', () => {
    assert.strictEqual(en.isCorrect('van', 'truck, lorry'), false);
    assert.strictEqual(en.isCorrect('second', '1st - first'), false);
  });

  test('Hebrew alternatives get the spelling rules applied to each side', () => {
    // app.js:492 flatMaps each alternative through heForms in Hebrew, not just the whole term.
    assert.strictEqual(he.isCorrect('כופר', 'כֹּפֶר / פדיון'), true);
    assert.strictEqual(he.isCorrect('פדיון', 'כֹּפֶר / פדיון'), true);
  });
});

describe('isCorrect · English compounds written both ways', () => {
  test('the closed form answers the open form and vice versa', () => {
    for (const [typed, term] of [
      ['bestseller', 'best-seller'], ['best seller', 'best-seller'], ['best-seller', 'bestseller'],
      ['selfconfidence', 'self-confidence'], ['self confidence', 'self-confidence'],
      ['departmentstore', 'department store'],
    ]) {
      assert.strictEqual(en.isCorrect(typed, term), true, `"${typed}" was rejected for "${term}"`);
    }
  });

  test('squashing separators does not make unrelated words match', () => {
    // The last-resort compare removes spaces. It must not turn "a lot" into "allot".
    assert.strictEqual(en.isCorrect('all otter', 'a lot'), false);
    assert.strictEqual(en.isCorrect('cathouse', 'cat'), false);
  });
});

describe('isCorrect · Hebrew plene forms', () => {
  test('the everyday unvocalised spelling is accepted for the stored vocalised one', () => {
    for (const [typed, term] of [
      ['כופר', 'כֹּפֶר'], ['סייס', 'סַיָּס'], ['מיכמורת', 'מִכְמוֹרֶת'], ['תקווה', 'תִּקְוָה'],
    ]) {
      assert.strictEqual(he.isCorrect(typed, term), true, `"${typed}" was rejected for "${term}"`);
    }
  });

  test('every Hebrew term accepts its own plene spelling · whole bank', () => {
    none(Array.from(he.BANK).filter(w => !Array.from(he.heForms(w.term)).every(f => he.isCorrect(f, w.term)))
      .map(w => w.term),
      'terms that reject one of their own generated spellings:');
  });

  test('the plene rules are not a licence to accept anything', () => {
    assert.strictEqual(he.isCorrect('כפרים', 'כֹּפֶר'), false, 'an inflection is not the word');
    assert.strictEqual(he.isCorrect('ספר', 'כֹּפֶר'), false);
  });
});

describe('shared gloss · a different word that means the same thing', () => {
  /* 401 English entries and 47 Hebrew ones carry a gloss identical to another entry's. In the
   * default direction the gloss IS the question, so a learner shown "ענף" can only be answered
   * with one of זֶרֶד / זַלְזַל / פֹּארָה · and the learner who knows a different one is told they
   * are wrong. */
  const cases = [
    { ctx: he, label: 'Hebrew' },
    { ctx: en, label: 'English' },
  ];

  for (const { ctx, label } of cases) {
    test(`${label}: a different word carrying an identical gloss is accepted`, () => {
      const group = Array.from(ctx.GLOSS_ALT.values()).find(a => a.length >= 2);
      assert.ok(group, `${label} bank has no shared-gloss groups — the index did not build`);
      const [ownTerm, otherTerm] = Array.from(group);
      const card = find(ctx, ownTerm);

      assert.strictEqual(ctx.isCorrect(otherTerm, card.term), false,
        'sanity: the two are genuinely different words');
      assert.strictEqual(accepts(ctx, otherTerm, card), true,
        `"${otherTerm}" means exactly what "${card.term}" means and was still marked wrong`);
    });

    test(`${label}: glossAlts never returns the card's own word`, () => {
      const offenders = [];
      for (const w of Array.from(ctx.BANK)) {
        const own = ctx.K(w.term);
        for (const alt of Array.from(ctx.glossAlts(w))) if (ctx.K(alt) === own) offenders.push(w.term);
      }
      none(offenders, 'glossAlts offered the card its own word as an alternative:');
    });

    test(`${label}: every shared-gloss group is mutually accepting`, () => {
      // If A accepts B, B must accept A. A one-way group means the learner's experience depends
      // on which of two identical cards came up.
      const bad = [];
      for (const arr of Array.from(ctx.GLOSS_ALT.values()).slice(0, 60)) {
        const terms = Array.from(arr);
        for (const a of terms) {
          const card = Array.from(ctx.BANK).find(w => w.term === a);
          if (!card) continue;
          for (const b of terms) {
            if (ctx.K(a) === ctx.K(b)) continue;
            if (!accepts(ctx, b, card)) bad.push(`asked "${a}", answered "${b}" -> rejected`);
          }
        }
      }
      none(bad, 'shared-gloss acceptance is not symmetric:');
    });
  }

  test('a word with an UNSHARED gloss gets no alternatives', () => {
    const solo = Array.from(en.BANK).find(w => en.glossAlts(w).length === 0);
    assert.ok(solo, 'every entry has an alternative, which cannot be right');
    assert.deepStrictEqual(Array.from(en.glossAlts(solo)), []);
  });

  test('the gloss index does not accept a genuinely wrong word', () => {
    const card = find(en, 'house');
    assert.strictEqual(accepts(en, 'elephant', card), false);
  });
});

describe('meaning direction · answering with the gloss', () => {
  test('the exact gloss is accepted', () => {
    assert.strictEqual(he.meaningMatch('אור, זוהר', 'אור, זוהר'), true);
  });

  test('one listed sense on its own is enough', () => {
    assert.strictEqual(he.meaningMatch('זוהר', 'אור, זוהר'), true);
    assert.strictEqual(he.meaningMatch('אור', 'אור, זוהר'), true);
  });

  test('the gloss without its explanatory parenthesis is accepted', () => {
    assert.strictEqual(he.meaningMatch('עירוני', 'עירוני (עירוני - urban)'), true);
  });

  test('REGRESSION: a word lifted out of a parenthetical example is NOT accepted', () => {
    /* app.js:714 · "יגור :: פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)" once accepted
     * "קרה", a completely different word, and promoted the card to level 3. One whole listed
     * sense is enough; a word from inside an example is not. */
    const gloss = 'פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)';
    assert.strictEqual(he.meaningMatch('קרה', gloss), false, 'a word from inside the example was accepted');
    assert.strictEqual(he.meaningMatch('חושש', gloss), true, 'a real listed sense must still pass');
    assert.strictEqual(he.meaningMatch('פוחד', gloss), true);
  });

  test('an empty answer never matches a gloss', () => {
    for (const v of ['', '  ', null, undefined]) assert.strictEqual(he.meaningMatch(v, 'אור, זוהר'), false);
  });

  test('meaningSegs never returns an empty segment', () => {
    const bad = [];
    for (const w of Array.from(he.BANK).slice(0, 400)) {
      for (const s of Array.from(he.meaningSegs(w.meaning))) if (!s) bad.push(w.term);
    }
    none(bad, 'meaningSegs produced an empty segment (it would match an empty answer):');
  });
});
