'use strict';
/* Two places where a written policy and the running code disagreed.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE — same limits as 17-a11y.test.js, stated again because
 * they matter more here. `node tests/run.js` has no browser, no DOM, no accessibility tree and
 * no screen reader. Everything below is either (a) arithmetic/set logic over values lifted out
 * of app.js and evaluated in a vm, or (b) an assertion about the source text of app.js and
 * index.html. What is pinned is the MECHANISM. That a sighted user reads the line, or that a
 * screen reader speaks the checkbox label, is NOT proven here and was not observed.
 *
 * Every group carries a control — an assertion that the pre-fix state would have failed — so a
 * group that can only ever pass is visible as such.
 *
 *   FIX 1 — the feedback form claimed to disclose what travels with a bug report, and listed
 *           three of the seven things fbContext() actually sends. User-Agent and viewport were
 *           collected and not shown. The decision was to show them, not to stop sending them.
 *   FIX 2 — the Terms (§2) and the Privacy policy (§9) declare a minimum age of 16 with parental
 *           consent under 18. There was no field, no box, and no check anywhere in the code.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource, ROOT } = require('./_harness/sandbox.js');
const { extractFunction, extractDecl } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = appSource();
const appMask = codeMask(app);

const fn = name => {
  const src = extractFunction(app, name, appMask);
  assert.ok(src, `app.js no longer declares function ${name}() — extraction failed by name ` +
                 `rather than leaving a test that quietly passes`);
  return src;
};
const decl = name => {
  const src = extractDecl(app, name, appMask);
  assert.ok(src, `app.js no longer declares ${name} — extraction failed by name`);
  return src;
};

/* ===================================================================================
 * FIX 1 · the form shows everything the report carries
 * =================================================================================== */

/* The keys are read out of fbContext()'s own object literal rather than restated here. Restating
 * them would mean an eighth field could be added to the report tomorrow and this suite would
 * keep passing while the disclosure went stale again — which is the exact bug being fixed. */
function fbContextKeys() {
  const src = fn('fbContext');
  const lit = src.match(/return\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(lit, 'fbContext() no longer ends in a `return { ... };` object literal — reparse it');
  const keys = [...lit[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]);
  assert.ok(keys.length >= 3, 'parsed fewer than 3 keys out of fbContext() — the regex is wrong');
  return keys;
}

/* FB_CTX_LABELS and fbCtxSentence are pure — no DOM, no globals — so they can be run for real
 * instead of pattern-matched. An assertion about the STRING A USER SEES is worth more than an
 * assertion that some identifier appears somewhere in the file. */
function loadSentence() {
  const ctx = vm.createContext({});
  vm.runInContext(decl('FB_CTX_LABELS') + '\n' + fn('fbCtxSentence') +
                  '\n;({ FB_CTX_LABELS: FB_CTX_LABELS, fbCtxSentence: fbCtxSentence })', ctx);
  return vm.runInContext('({ FB_CTX_LABELS, fbCtxSentence })', ctx);
}

describe('FIX 1 · every field that travels with a bug report is named in the form', () => {
  test('fbContext() still collects the two fields the audit found undisclosed', () => {
    /* Control for the whole group. If `ua` and `viewport` were dropped from the payload instead
     * of disclosed, the rest of this group would be testing a promise about nothing. */
    const keys = fbContextKeys();
    assert.ok(keys.includes('ua'), 'fbContext no longer sends `ua` — re-derive this group');
    assert.ok(keys.includes('viewport'), 'fbContext no longer sends `viewport` — re-derive this group');
  });

  test('FB_CTX_LABELS covers exactly the keys fbContext() sends — no more, no fewer', () => {
    const { FB_CTX_LABELS } = loadSentence();
    const sent = fbContextKeys().sort();
    const labelled = Object.keys(FB_CTX_LABELS).sort();
    assert.deepStrictEqual(labelled, sent,
      'the disclosure and the payload have drifted apart. A key that is sent and not labelled is ' +
      'the original bug; a key that is labelled and not sent is a promise about data that no ' +
      'longer exists.');
  });

  test('the sentence the user reads names every one of them', () => {
    const { FB_CTX_LABELS, fbCtxSentence } = loadSentence();
    const s = fbCtxSentence(Object.fromEntries(Object.keys(FB_CTX_LABELS).map(k => [k, 'x'])));
    for (const [k, label] of Object.entries(FB_CTX_LABELS)) {
      assert.ok(s.includes(label), `"${label}" (${k}) is sent but does not appear in the line`);
    }
  });

  test('it is one short readable Hebrew sentence, not a diagnostic dump', () => {
    /* The line this replaces was removed once already for looking like a console (index.html:911
     * records why). Re-adding raw values would undo that fix in the name of transparency. */
    const { FB_CTX_LABELS, fbCtxSentence } = loadSentence();
    const s = fbCtxSentence(Object.fromEntries(Object.keys(FB_CTX_LABELS).map(k => [k, 'VALUE'])));
    assert.ok(!s.includes('VALUE'), 'the line prints the values themselves — names only');
    assert.ok(!/[{}·]|=>/.test(s), 'the line carries code punctuation — it should read as prose');
    assert.ok(s.length < 220, `the line is ${s.length} chars — too long to be read before sending`);
    assert.match(s, /[֐-׿]/, 'the line is not in Hebrew');
  });

  test('an unlabelled key is impossible to hide — it shows up raw rather than vanishing', () => {
    /* Control for the mechanism itself: prove the code cannot silently omit a field. If a future
     * key is added to fbContext and not to FB_CTX_LABELS, the user must still see that something
     * is sent, and the deepStrictEqual test above must be what goes red — not silence. */
    const { fbCtxSentence } = loadSentence();
    const s = fbCtxSentence({ screen: 'a', somethingNew: 'b' });
    assert.ok(s.includes('somethingNew'), 'an unlabelled key disappears from the disclosure');
  });

  test('openFeedback() derives the line from the real context, not from a literal', () => {
    const src = fn('openFeedback');
    assert.match(src, /\$\('#fbCtx'\)\.textContent\s*=\s*fbCtxSentence\(\s*fbContext\(\)\s*\)/,
      '#fbCtx is filled from something other than fbCtxSentence(fbContext()) — the displayed ' +
      'text can then drift from the payload again');
    assert.ok(!/#fbCtx'\)\.textContent\s*=\s*`?['"`]/.test(src),
      'a hardcoded string is being written into #fbCtx');
  });

  test('the hardcoded three-item claim is gone from app.js and from index.html', () => {
    /* The exact wording that was wrong: it named the screen, the language and the build, and
     * stopped there. Both copies said it — the dialog line and the paragraph above the textarea. */
    assert.ok(!/נשלח יחד עם הדיווח: המסך שהיית בו, שפת התרגול וגרסת האפליקציה/.test(app),
      'app.js still writes the old three-item sentence');
    assert.ok(!/אני שולח יחד עם זה את המסך שהיית בו והגרסה/.test(html),
      'index.html still promises only the screen and the version');
  });
});
