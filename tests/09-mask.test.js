'use strict';
/* esc() and maskTerm() · the two functions that decide what reaches the DOM.
 *
 * WHY THESE TWO TOGETHER
 * ----------------------
 * app.js writes HTML by string concatenation in 52 places. esc() is the only thing standing
 * between a stored value and that markup, and maskTerm() is the only thing standing between a
 * gloss and the answer it is supposed to be hiding. Neither had a single test: tests/README.md
 * listed `esc()` under "what a browser is needed for" and said of maskTerm that "its output is
 * only ever seen as a prompt, so judging it needs eyes".
 *
 * Half of that is true and half of it is not. esc() and maskTerm() are both pure string
 * functions of their arguments · no DOM, no storage, no clock · so they are exactly as testable
 * as norm(). What needs eyes is whether a masked prompt still *teaches*; what does not need eyes
 * is whether the answer is sitting in it, because the app already owns a machine-checkable
 * definition of "this string answers that word": isCorrect(). These tests use it.
 *
 * WHAT IS PINNED vs WHAT IS ASSERTED
 * ----------------------------------
 * Three tests below assert behaviour that is WRONG and say so in their names (they start with
 * "KNOWN BUG"). They are written to pass against today's app.js on purpose. A test that asserts
 * the correct behaviour would go red now and stay red, and a permanently-red suite is one nobody
 * reads. A test that pins the wrong behaviour goes red the moment somebody FIXES it · which
 * forces whoever fixes it to come here, read the finding, and flip the assertion. Each one names
 * the exact line the corrected assertion should become.
 *
 * Findings written up in: דוחות/בדק-בית-2/07-dom-xss.md
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, banks, expectNone } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);

const he = loadApp({ lang: 'he' });
const en = loadApp({ lang: 'en' });

/* Every maximal run of Hebrew-block characters, which is what maskTerm itself treats as a
   "word" (app.js uses the same /[֐-׿]+/ class). The mask marker is not a word. */
const MARK = '־־־';
const words = s => (String(s).match(/[֐-׿]+/g) || []).filter(w => w !== MARK);

/* Rows straight out of the shipped bank, so a bank edit is picked up without touching this file. */
const heRows = [];
for (const [unit, list] of Object.entries(banks().he))
  for (const p of list) if (Array.isArray(p)) heRows.push({ unit, term: p[0], meaning: p[1] });
const row = term => {
  const r = heRows.find(x => x.term === term);
  if (!r) assert.fail(`data.js no longer contains the entry ${term} — this test was built on it`);
  return r;
};

/* ============================ esc() ============================ */

describe('esc() · the only escape in the app', () => {
  test('escapes every character that can break out of text or a quoted attribute', () => {
    assert.strictEqual(he.esc('<'), '&lt;');
    assert.strictEqual(he.esc('>'), '&gt;');
    assert.strictEqual(he.esc('&'), '&amp;');
    assert.strictEqual(he.esc('"'), '&quot;');
    assert.strictEqual(he.esc("'"), '&#39;');
    assert.strictEqual(he.esc('`'), '&#96;');
  });

  test('a script payload comes out inert', () => {
    assert.strictEqual(he.esc('<img src=x onerror=alert(1)>'),
      '&lt;img src=x onerror=alert(1)&gt;');
    assert.strictEqual(he.esc('</textarea><script>alert(1)</script>'),
      '&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('output can never close a quoted attribute or open a tag', () => {
    /* Every interpolation of esc() in app.js sits either in text or inside a DOUBLE-quoted
       attribute (data-term, data-w, data-reset, value=…). Both quote styles and the backtick
       are covered, so the check is style-independent. */
    const payloads = ['" onerror="alert(1)', "' onerror='alert(1)", '`', '</b><img src=x>',
                      '"><script>alert(1)</script>', 'a&b<c>d"e\'f`g'];
    none(payloads.filter(p => /[<>"'`]/.test(he.esc(p))),
      'esc() left a character that can terminate the surrounding markup');
  });

  test('null and undefined become an empty string, not the words "null"/"undefined"', () => {
    // The assoc textarea and the "also" line both interpolate values that can legitimately be
    // absent; printing the word "null" into someone's own note would be a visible bug.
    assert.strictEqual(he.esc(null), '');
    assert.strictEqual(he.esc(undefined), '');
  });

  test('a non-string is coerced, not passed through', () => {
    // Everything reaching esc() from the cloud is JSON.parse output, so it can be any type.
    assert.strictEqual(he.esc(0), '0');
    assert.strictEqual(he.esc(false), 'false');
    assert.strictEqual(he.esc(12), '12');
    assert.strictEqual(he.esc(['<a>', '<b>']), '&lt;a&gt;,&lt;b&gt;');
    assert.strictEqual(he.esc({}), '[object Object]');
  });

  test('esc() is NOT idempotent · pinned so double-escaping is a red test, not a mystery', () => {
    // esc(esc(x)) turns &lt; into &amp;lt;. No site in app.js escapes twice today; if one
    // starts to, a learner sees "&amp;quot;" in their own association and this test explains why.
    assert.strictEqual(he.esc(he.esc('<')), '&amp;lt;');
    assert.notStrictEqual(he.esc(he.esc('<')), he.esc('<'));
  });

  test('the language sandbox does not change escaping', () => {
    assert.strictEqual(en.esc('<b>'), he.esc('<b>'));
  });
});

/* ============================ maskTerm() ============================ */

describe('maskTerm() · hiding the answer inside its own gloss', () => {
  test('English is a no-op across the whole English bank', () => {
    /* HONEST LIMIT OF THIS TEST -- measured, not assumed. Deleting the `if(LANG==='en') return
       meaning` short-circuit from app.js changes the output of ZERO of the 3,900 English
       entries, so this test CANNOT fail by that line being removed. The reason is that every
       stem the function builds from an English term is Latin, while hits() is only ever called
       on runs of Hebrew characters -- the two sets can never intersect. The guard is a
       short-circuit and a piece of documentation, not a branch that decides anything.
       What this test does protect is the invariant itself: if maskTerm is ever made
       language-agnostic, or the Hebrew stemmer starts accepting Latin, an English card that
       suddenly hides part of its own Hebrew gloss shows up here. */
    const bad = [];
    for (const [unit, list] of Object.entries(banks().en))
      for (const p of list)
        if (Array.isArray(p) && en.maskTerm(p[1], p[0]) !== p[1])
          bad.push(`unit ${unit} · ${p[0]} → "${en.maskTerm(p[1], p[0])}"`);
    none(bad, 'an English card had its Hebrew gloss masked');
    assert.strictEqual(en.maskTerm('a large dog', 'dog'), 'a large dog');
    assert.strictEqual(en.maskTerm('כלב גדול', 'dog'), 'כלב גדול');
  });

  test('a circular Hebrew gloss IS masked', () => {
    // לַהַק :: "קבוצה של בעלי חיים, להקה; קבוצת מטוסים" · the inflection app.js's own comment
    // names as the reason this function exists. (תְּלוּלִית, the other example in that comment,
    // was since rewritten in data.js and no longer names itself -- which is why this test reads
    // the gloss out of the bank instead of restating it.)
    const r = row('לַהַק');
    const out = he.maskTerm(r.meaning, r.term);
    assert.notStrictEqual(out, r.meaning, 'the gloss names the word and was left alone');
    assert.ok(out.includes(MARK), `expected a mask marker, got ${JSON.stringify(out)}`);
    assert.ok(!out.includes('להקה'), `the inflection survived: ${JSON.stringify(out)}`);
    none(words(out).filter(w => he.isCorrect(w, r.term)),
      'the masked prompt still contains a string the app would accept as the answer');
  });

  test('a substring is not a giveaway: צָעִיר must not hide עִיר', () => {
    // The stem rule exists for exactly this. A raw substring match would blank עיר and turn
    // "עיר קטנה" into "־־־ קטנה" on a card whose answer is צעיר.
    assert.strictEqual(he.maskTerm('עיר קטנה', 'צָעִיר'), 'עיר קטנה');
  });

  test('one side stays as written: שָׁפוּף must not blank כפוף', () => {
    // Stripping BOTH sides made the כ and the ש each read as a prefix, reducing both words to
    // פופ · two unrelated words, one destroyed prompt.
    assert.strictEqual(he.maskTerm('כפוף, שחוח', 'שָׁפוּף'), 'כפוף, שחוח');
  });

  test('a function word is never the answer: אין stays visible', () => {
    const r = row('אֵין יָדוֹ מַשֶּׂגֶת');
    const out = he.maskTerm(r.meaning, r.term);
    assert.ok(/אינ|אין/.test(out),
      `blanking אין turns the prompt into its own opposite: ${JSON.stringify(out)}`);
  });

  test('an unanswerable prompt is refused: קרן אור is shown intact', () => {
    // אֲלוּמַּת אוֹר masks down to "קרן ־־־", i.e. guess from three letters. The guard accepts
    // the giveaway instead -- a deliberate trade, pinned here so it cannot be removed silently.
    assert.strictEqual(he.maskTerm('קרן אור', 'אֲלוּמַּת אוֹר'), 'קרן אור');
  });

  test('two heads masked with nothing left to modify is refused', () => {
    const m = 'נחמה כלשהי, נחמה מועטה';
    assert.strictEqual(he.maskTerm(m, 'נֶחָמָה פּוּרְתָּא'), m,
      '"־־־ כלשהי, ־־־ מועטה" is over the letter threshold and still unanswerable');
  });

  test('a parenthetical that contains the word is dropped whole, not blanked inside it', () => {
    const r = row('שְׁאַט נֶפֶשׁ');                    // "תחושת סלידה (שאט - בוז)"
    const out = he.maskTerm(r.meaning, r.term);
    assert.ok(!out.includes('('), `the aside survived: ${JSON.stringify(out)}`);
    assert.ok(!out.includes(MARK), `"(מכת ־־־ ־־־)" is noise, not a hint: ${JSON.stringify(out)}`);
    assert.strictEqual(out, 'תחושת סלידה');
  });

  test('an aside that does NOT contain the word is kept', () => {
    // Dropping every parenthesis would throw away the example that makes a gloss worth reading.
    const m = 'רטוב מאוד (אחרי גשם)';
    assert.ok(he.maskTerm(m, 'כֶּלֶב').includes('(אחרי גשם)'));
  });

  test('an empty or whitespace term leaves the gloss alone and does not throw', () => {
    assert.strictEqual(he.maskTerm('כלב נובח', ''), 'כלב נובח');
    assert.strictEqual(he.maskTerm('כלב נובח', '   '), 'כלב נובח');
    assert.strictEqual(he.maskTerm('כלב נובח', 'א'), 'כלב נובח', 'a 1-letter term has no stem');
  });

  test('an empty gloss stays empty', () => {
    assert.strictEqual(he.maskTerm('', 'כֶּלֶב'), '');
  });

  test('a gloss with no Hebrew at all is returned untouched', () => {
    // Latin-only glosses exist in the bank ("מקומי (local), אזורי" has one inside).
    assert.strictEqual(he.maskTerm('a dog that barks', 'כֶּלֶב'), 'a dog that barks');
    const r = row('לוֹקָלִי');
    assert.strictEqual(he.maskTerm(r.meaning, r.term), r.meaning,
      'a Latin word inside a Hebrew gloss must not be treated as a Hebrew stem');
  });

  test('niqqud on the gloss side is matched too, not only on the term', () => {
    // The Hebrew-run regex /[֐-׿]+/ swallows the vowel points, so the token handed to hits()
    // carries them; norm() has to strip them or a POINTED giveaway walks straight through while
    // the same word unpointed is caught. Both spellings must behave identically.
    const pointed   = he.maskTerm('בַּיִת גדול ויפה מאוד, מקום מגורים קבוע', 'בַּיִת');
    const unpointed = he.maskTerm('בית גדול ויפה מאוד, מקום מגורים קבוע',   'בַּיִת');
    assert.ok(pointed.includes(MARK), `pointed giveaway survived: ${JSON.stringify(pointed)}`);
    assert.ok(!/בַּיִת|בית/.test(pointed));
    assert.strictEqual(pointed, unpointed, 'niqqud in the gloss changes the outcome');
  });

  test('the gloss is long enough to mask · the guard is not what is being measured above', () => {
    // Same words, short gloss: the "unanswerable" guard fires and restores everything. Pinned
    // next to the test above so a future reader cannot mistake one effect for the other.
    assert.strictEqual(he.maskTerm('בַּיִת גדול, בית', 'בַּיִת'), 'בַּיִת גדול, בית');
  });
});

/* ==================== whole-bank invariants ====================
 * The value of these is that they are exhaustive. A rule checked against six hand-picked words
 * cannot notice the seventh, and the bank is edited several times a day. */

describe('maskTerm() over the whole Hebrew bank', () => {
  const prompts = heRows.map(r => ({ ...r, out: String(he.maskTerm(r.meaning, r.term)) }));
  const changed = prompts.filter(p => p.out !== p.meaning);

  /* The two entries the leak rule cannot pass today. Named individually, with the reason, so
     that this list can only ever shrink -- a third name appearing here is a new bug. */
  const KNOWN_LEAKS = new Set(['אִבֵּק', 'שָׁוְא', 'בַּר']);

  test('masking actually runs · the rule is not silently dead', () => {
    // If a future edit makes hits() always false, every other test here still passes while the
    // feature does nothing at all. 76 of 1,717 entries are masked today.
    assert.ok(changed.length >= 40,
      `only ${changed.length} of ${prompts.length} glosses are masked — has hits() stopped matching?`);
  });

  test('no prompt outside the known-bad list contains a string isCorrect() would accept', () => {
    // isCorrect() is the app's own definition of "this answers that word", so this is not an
    // approximation of a leak -- it is the leak, measured with the app's own ruler.
    const leaks = prompts
      .filter(p => !KNOWN_LEAKS.has(p.term))
      .map(p => ({ p, hit: words(p.out).filter(w => he.isCorrect(w, p.term)) }))
      .filter(x => x.hit.length)
      .map(x => `unit ${x.p.unit} · ${x.p.term} → "${x.p.out}"  [accepted: ${x.hit.join(', ')}]`);
    none(leaks, 'a card shows the answer inside its own question');
  });

  test('no prompt is masked down to nothing', () => {
    const empty = changed
      .filter(p => p.out.includes(MARK) && words(p.out).length === 0)
      .map(p => `${p.term} → "${p.out}"`);
    none(empty, 'the prompt is nothing but mask markers — unanswerable');
  });

  test('masking never invents a marker in a gloss it did not change', () => {
    const bogus = prompts.filter(p => p.out === p.meaning && p.out.includes(MARK))
      .map(p => p.term);
    none(bogus, 'a marker appears in a gloss maskTerm reports as unchanged');
  });

  test('the marker never survives into the feedback text', () => {
    // finishCard shows esc(w.meaning), never the masked form. Guard the bank instead: a real
    // ־־־ typed into a gloss would make the two indistinguishable.
    none(heRows.filter(r => String(r.meaning).includes(MARK)).map(r => r.term),
      'a gloss in data.js literally contains the mask marker');
  });

  test('every prompt is a string, and never longer than the gloss it came from', () => {
    const bad = prompts.filter(p => typeof p.out !== 'string' || p.out.length > String(p.meaning).length + 8)
      .map(p => `${p.term} (${typeof p.out})`);
    none(bad, 'maskTerm returned a non-string, or grew the gloss');
  });
});

/* ==================== the findings, pinned ==================== */

describe('maskTerm() · KNOWN BUGS, pinned to today’s behaviour', () => {
  test('KNOWN BUG · אִבֵּק · the hidden>=3 guard hands over the answer', () => {
    /* "ניקה מאבק, הוציא אבק; פיזר אבקה על משהו" masks to three markers, so the
       `hidden>=3` guard treats the prompt as unanswerable and restores the gloss · which is the
       one containing the literal answer אבק. The guard is right that three blanks is too many;
       it is wrong to resolve that by showing the answer.
       WHEN FIXED, this test should become:
         assert.notStrictEqual(out, r.meaning);
         none(words(out).filter(w => he.isCorrect(w, r.term)), '…'); */
    const r = row('אִבֵּק');
    const out = he.maskTerm(r.meaning, r.term);
    assert.strictEqual(out, r.meaning, 'the gloss is no longer returned intact — the bug may be fixed');
    assert.ok(words(out).some(w => he.isCorrect(w, r.term)),
      'the answer is no longer readable in the prompt — the bug may be fixed');
  });

  test('KNOWN BUG · שָׁוְא · hits() ignores the plene forms isCorrect() accepts', () => {
    /* The gloss says שווא (plene); norm(שָׁוְא) is שוא (defective). heStems() only strips
       clitics and suffixes, so the two never meet and nothing is masked · while isCorrect()
       DOES accept שווא for שָׁוְא, through heForms()/fullSpelling(). maskTerm and isCorrect
       disagree about what the same word is, and the gap is exactly this leak.
       WHEN FIXED (hits() consulting heForms()), this becomes:
         assert.ok(out.includes(MARK)); */
    const r = row('שָׁוְא');
    const out = he.maskTerm(r.meaning, r.term);
    assert.ok(he.heForms(r.term).some(f => he.norm(f) === 'שווא'),
      'heForms no longer produces the plene spelling — the premise of this finding changed');
    assert.strictEqual(out, r.meaning, 'the plene giveaway is now masked — the bug may be fixed');
    assert.ok(words(out).some(w => he.isCorrect(w, r.term)));
  });

  test('KNOWN BUG · a hyphenated term can never be masked at all', () => {
    /* maskTerm splits the term on WHITESPACE only (`String(term).split(/\s+/)`), but norm()
       turns a hyphen into a SPACE. So בַּר-מִינָן stays one token, and its stems come out as
       "בר מיננ" / "ר מיננ" · strings with a space in them. hits() is only ever called on runs
       of /[֐-׿]+/, which cannot contain a space, so no token can ever equal such a stem.
       Every hyphenated term is therefore unmaskable, whatever its gloss says.

       The control below is what makes this a cause and not a coincidence: the SAME term with a
       space instead of the hyphen masks correctly against the SAME gloss.

       Not exploitable today · all 12 hyphenated terms in data.js have glosses that do not name
       themselves, so the whole-bank leak test above passes. It is one bank edit away.
       WHEN FIXED (splitting on /[\s־-]+/ or stemming norm(term).split(' ')), this becomes:
         assert.ok(hyphenated.includes(MARK)); */
    const gloss = 'בר מינן שנפטר לפני שנים רבות מאוד';
    const hyphenated = he.maskTerm(gloss, 'בַּר-מִינָן');
    const spaced     = he.maskTerm(gloss, 'בַּר מִינָן');

    // .every() rather than deepStrictEqual on the returned array: the array is built inside the
    // vm realm, so deepStrictEqual rejects it on the prototype (see tests/README.md).
    const stems = he.heStems('בַּר-מִינָן');
    assert.ok(stems.length > 0 && stems.every(s => s.includes(' ')),
      `the stems of a hyphenated term are no longer multi-word — the cause may be fixed: ${JSON.stringify(Array.from(stems))}`);
    assert.strictEqual(hyphenated, gloss, 'a hyphenated term now masks — the bug may be fixed');
    assert.ok(spaced.includes(MARK), 'the space-written control must still mask, or this proves nothing');
    assert.notStrictEqual(hyphenated, spaced, 'hyphen and space must differ for the bug to exist');

    // …and the reason it does not bite yet.
    const hyphenTerms = heRows.filter(r => /[-־]/.test(r.term));
    assert.ok(hyphenTerms.length > 0, 'no hyphenated terms left in the bank — finding is moot');
    none(hyphenTerms
      .filter(r => words(he.maskTerm(r.meaning, r.term)).some(w => he.isCorrect(w, r.term)))
      .map(r => r.term),
      'a hyphenated term now leaks its answer — the latent bug above just went live');
  });

  test('KNOWN BUG · a non-string gloss is returned un-stringified', () => {
    /* Every path but the final fallback returns a string; `return meaning` returns whatever came
       in. maskTerm(null, term) is null, and `$('#qText').textContent = null` renders an EMPTY
       question. Reachable because mergeProgress() accepts an `added` row whose meaning is not a
       string, while loadLangState() rejects it · so a poisoned cloud blob survives until the
       next reload.
       WHEN FIXED (`return String(meaning ?? '')`), this becomes:
         assert.strictEqual(he.maskTerm(null, 'כלב'), ''); */
    assert.strictEqual(he.maskTerm(null, 'כלב'), null);
    assert.strictEqual(he.maskTerm(undefined, 'כלב'), undefined);
    assert.strictEqual(he.maskTerm(123, 'כלב'), 123);
  });

  test('KNOWN BUG · mergeProgress keeps an `added` row whose meaning is not a string', () => {
    /* loadLangState filters these on the localStorage path; mergeProgress checks only p[0].
       The cloud path therefore admits what the disk path rejects. */
    const empty = { assoc: {}, stats: { words: {}, sessions: [] }, deleted: [], added: [], dir: 'w2m' };
    const m = he.mergeProgress(empty, { ...empty, added: [['מילה', null], ['שנייה', { a: 1 }]] });
    assert.strictEqual(m.added.length, 2, 'the rows are now filtered — the bug may be fixed');
    assert.ok(m.added.every(p => typeof p[1] !== 'string'));
  });
});
