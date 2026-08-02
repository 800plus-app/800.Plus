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

/* ===================================================================================
 * FIX 2 · the declared age threshold is actually enforced
 * =================================================================================== */

/* The sign-up path lives in an addEventListener, not in a named function and not in an
 * `.onclick`, so neither extractFunction nor extractHandler reaches it. Lifted here the same
 * way extractHandler does it: locate exactly one binding, then walk to the end of the
 * statement. Exactly one match or throw — a missing symbol must never become a silent pass. */
function authSubmitHandler() {
  const { statementEnd, codeMatches } = require('./_harness/scan.js');
  const hits = codeMatches(app, /\$\('#authForm'\)\.addEventListener\('submit'/, appMask);
  assert.strictEqual(hits.length, 1,
    `app.js binds #authForm submit ${hits.length} times — extraction is ambiguous`);
  const end = statementEnd(app, hits[0].index, appMask);
  assert.ok(end > 0, 'could not find the end of the #authForm submit handler');
  return app.slice(hits[0].index, end + 1);
}

describe('FIX 2 · a required age declaration on sign-up', () => {
  const tag = () => {
    const m = html.match(/<input[^>]*id="authAge"[^>]*>/);
    assert.ok(m, 'index.html has no <input id="authAge"> — the Terms §2 threshold has no control');
    return m[0];
  };

  test('it is a checkbox, not a date of birth', () => {
    assert.match(tag(), /type="checkbox"/, '#authAge is not a checkbox');
  });

  test('nothing anywhere asks for a birth date', () => {
    /* A declaration is a tick. A birth date is a second piece of personal data to hold, to leak
     * and to justify, for an answer the tick already gives. This is a decision, so it is pinned. */
    assert.ok(!/תאריך לידה/.test(html), 'index.html asks for a birth date');
    assert.ok(!/\bid="(dob|birth[A-Za-z]*|authDob|authBirth[A-Za-z]*)"/i.test(html),
      'index.html carries a birth-date field');
    /* Scoped to the auth form on purpose. #accExam is a date input and a legitimate one — the
     * date of the psychometric exam the learner is working towards. A blanket ban on type="date"
     * would fail on it and say nothing about age. What must stay empty is the sign-up form. */
    const form = html.match(/<form id="authForm"[\s\S]*?<\/form>/);
    assert.ok(form, 'index.html no longer has <form id="authForm"> — rescope this test');
    assert.ok(!/type="date"/.test(form[0]), 'the sign-up form carries a date input');
  });

  test('the checkbox has a real accessible name, not a floating paragraph beside it', () => {
    /* Either wrapped in its own <label> (implicit) or pointed at by for= (explicit). A <p> next
     * to a checkbox is read by a screen reader as an unlabelled checkbox. */
    const wrapped = /<label[^>]*>(?:(?!<\/label>)[\s\S])*id="authAge"(?:(?!<\/label>)[\s\S])*<\/label>/
      .test(html);
    const explicit = /<label[^>]*for="authAge"/.test(html);
    assert.ok(wrapped || explicit, '#authAge has no <label> — it is an unnamed checkbox');
  });

  test('the wording is one short line a 17-year-old will actually read', () => {
    const m = html.match(/<label[^>]*id="fAge"[^>]*>[\s\S]*?<\/label>/);
    assert.ok(m, 'no <label id="fAge"> wrapping the age declaration');
    const text = m[0].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')
                     .replace(/\s+/g, ' ').trim();
    assert.ok(text.includes('16'), `the line never says 16: "${text}"`);
    assert.ok(text.includes('18'), `the line never mentions the parental-consent age: "${text}"`);
    assert.ok(text.length <= 90,
      `the line is ${text.length} chars — a long legal sentence gets ticked unread, which is ` +
      `the same as no gate at all: "${text}"`);
  });

  test('it is shown on sign-up and not on sign-in', () => {
    assert.match(html, /<label[^>]*id="fAge"[^>]*class="[^"]*\bhidden\b/,
      '#fAge is not hidden in the markup — sign-in, the default tab, would show it');
    const src = fn('setAuthMode');
    assert.match(src, /\$\('#fAge'\)\.classList\.toggle\('hidden',\s*m!=='signup'\)/,
      "setAuthMode does not toggle #fAge on the signup tab only");
  });

  test('leaving the sign-up tab clears the tick', () => {
    /* Otherwise a tick survives a tab switch and a reload of the form, and the next person on a
     * shared device inherits a declaration they never made. */
    assert.match(fn('setAuthMode'), /\$\('#authAge'\)\.checked\s*=\s*false/,
      'setAuthMode never resets #authAge');
  });

  test('sign-up is refused when the box is unticked', () => {
    const src = authSubmitHandler();
    assert.match(src, /if\s*\(\s*!\s*\$\('#authAge'\)\.checked\s*\)/,
      'the submit handler never reads #authAge.checked — the threshold is decorative');
  });

  test('the refusal happens BEFORE the account is created', () => {
    /* A check that runs after Store.signUp() reads right and enforces nothing. */
    const src = authSubmitHandler();
    const gate = src.search(/if\s*\(\s*!\s*\$\('#authAge'\)\.checked\s*\)/);
    const signUp = src.indexOf('Store.signUp');
    assert.ok(gate >= 0 && signUp >= 0, 'gate or Store.signUp call not found in the handler');
    assert.ok(gate < signUp, 'the age gate runs after Store.signUp — the account already exists');
  });

  test('the gate is inside the sign-up branch and cannot block a sign-in', () => {
    const src = authSubmitHandler();
    const branch = src.search(/if\s*\(\s*authMode\s*===\s*'signup'\s*\)/);
    const gate = src.search(/if\s*\(\s*!\s*\$\('#authAge'\)\.checked\s*\)/);
    assert.ok(branch >= 0, "the handler no longer branches on authMode==='signup'");
    assert.ok(gate > branch,
      'the age gate sits before the signup branch — an existing user signing in would be blocked ' +
      'by a box that is hidden on their tab');
  });

  test('the refusal is announced through the existing #authMsg alert, not a new element', () => {
    /* #authMsg already carries role="alert" (A11Y-03). Inventing a second error surface here
     * would leave one of the two silent. */
    const src = authSubmitHandler();
    const gate = src.search(/if\s*\(\s*!\s*\$\('#authAge'\)\.checked\s*\)/);
    const block = src.slice(gate, gate + 500);
    assert.match(block, /msg\.textContent\s*=/, 'the gate writes no message — a dead button');
    assert.match(block, /msg\.className\s*=\s*'au-msg err'/, 'the message is not styled as an error');
    assert.match(html, /id="authMsg"[^>]*role="alert"/, '#authMsg lost its role="alert"');
    assert.match(block, /return/, 'the gate does not return — execution falls through to sign-up');
  });

  test('the error is tied to the field it is about, and focus goes there', () => {
    const src = authSubmitHandler();
    const gate = src.search(/if\s*\(\s*!\s*\$\('#authAge'\)\.checked\s*\)/);
    const block = src.slice(gate, gate + 500);
    assert.match(block, /\$\('#authAge'\)\.focus\(\)/,
      'focus is not moved to the box the learner has to tick');
    assert.match(html, /<input[^>]*id="authAge"[^>]*aria-describedby="authMsg"/,
      '#authAge is not described by #authMsg — the alert is spoken with no link to the control');
    assert.match(block, /setAttribute\('aria-invalid','true'\)/,
      '#authAge is never marked aria-invalid');
  });

  test('the invalid state is cleared once the box is ticked', () => {
    /* aria-invalid that is set and never unset makes a corrected field keep announcing an error. */
    assert.match(app, /\$\('#authAge'\)\.onchange\s*=/,
      'nothing listens for the tick, so aria-invalid never comes off');
  });
});
