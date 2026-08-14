'use strict';
/* Two places where a written policy and the running code disagreed.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE -- same limits as 17-a11y.test.js, stated again because
 * they matter more here. `node tests/run.js` has no browser, no DOM, no accessibility tree and
 * no screen reader. Everything below is either (a) arithmetic/set logic over values lifted out
 * of app.js and evaluated in a vm, or (b) an assertion about the source text of app.js and
 * index.html. What is pinned is the MECHANISM. That a sighted user reads the line, or that a
 * screen reader speaks the checkbox label, is NOT proven here and was not observed.
 *
 * Every group carries a control -- an assertion that the pre-fix state would have failed -- so a
 * group that can only ever pass is visible as such.
 *
 *   FIX 1 -- the feedback form claimed to disclose what travels with a bug report, and listed
 *           three of the seven things fbContext() actually sends. User-Agent and viewport were
 *           collected and not shown. The decision was to show them, not to stop sending them.
 *   FIX 2 -- the Terms (§2) and the Privacy policy (§9) declare a minimum age of 16 with parental
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
 * keep passing while the disclosure went stale again -- which is the exact bug being fixed. */
function fbContextKeys() {
  const src = fn('fbContext');
  const lit = src.match(/return\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(lit, 'fbContext() no longer ends in a `return { ... };` object literal — reparse it');
  const keys = [...lit[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1]);
  assert.ok(keys.length >= 3, 'parsed fewer than 3 keys out of fbContext() — the regex is wrong');
  return keys;
}

/* FB_CTX_LABELS and fbCtxSentence are pure -- no DOM, no globals -- so they can be run for real
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

  test('FB_CTX_LABELS covers exactly the keys fbContext() sends · no more, no fewer', () => {
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

  test('an unlabelled key is impossible to hide · it shows up raw rather than vanishing', () => {
    /* Control for the mechanism itself: prove the code cannot silently omit a field. If a future
     * key is added to fbContext and not to FB_CTX_LABELS, the user must still see that something
     * is sent, and the deepStrictEqual test above must be what goes red -- not silence. */
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
     * stopped there. Both copies said it -- the dialog line and the paragraph above the textarea. */
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
 * statement. Exactly one match or throw -- a missing symbol must never become a silent pass. */
function authSubmitHandler() {
  const { statementEnd, codeMatches } = require('./_harness/scan.js');
  const hits = codeMatches(app, /\$\('#authForm'\)\.addEventListener\('submit'/, appMask);
  assert.strictEqual(hits.length, 1,
    `app.js binds #authForm submit ${hits.length} times — extraction is ambiguous`);
  const end = statementEnd(app, hits[0].index, appMask);
  assert.ok(end > 0, 'could not find the end of the #authForm submit handler');
  return app.slice(hits[0].index, end + 1);
}

/* FIX 2 · תיבת הצהרת הגיל · הוסרה ביוזמת בעל המוצר.
 *
 * הנימוק שלו, והוא נכון: אי אפשר לאכוף אותה. תיבה שמסמנים בלי לקרוא אינה שער, והיא כן
 * חיכוך אמיתי בהרשמה · מחיר ודאי בתמורה להגנה מדומה.
 *
 * מה שנשאר נבדק כאן. הבדיקה השנייה היא החשובה מבין השתיים: הפיתוי להחזיר "שער אמיתי"
 * בדמות תאריך לידה יחזור, ותאריך לידה הוא פריט מידע אישי נוסף להחזיק, להצדיק ולדלוף · 
 * בתמורה לתשובה שהתיבה כבר נתנה, ושגם היא לא הייתה אכיפה. */
describe('FIX 2 · סף הגיל נשאר בתנאי השימוש, ולא בשדה נוסף', () => {

  test('שום מקום אינו מבקש תאריך לידה', () => {
    assert.ok(!/תאריך לידה/.test(html), 'index.html asks for a birth date');
    assert.ok(!/\bid="(dob|birth[A-Za-z]*|authDob|authBirth[A-Za-z]*)"/i.test(html),
      'index.html carries a birth-date field');
    /* מצומצם לטופס ההרשמה בכוונה: #accExam הוא שדה תאריך לגיטימי · מועד המבחן. */
    const form = html.match(/<form id="authForm"[\s\S]*?<\/form>/);
    assert.ok(form, 'index.html no longer has <form id="authForm"> — rescope this test');
    assert.ok(!/type="date"/.test(form[0]), 'the sign-up form carries a date input');
  });

  test('התיבה הוסרה משני הצדדים ולא רק מאחד', () => {
    /* חצי הסרה היא המצב הגרוע מכולם: תיבה שנשארה ב-HTML בלי אכיפה נראית כשער ואיננה,
       ואכיפה שנשארה בלי תיבה חוסמת הרשמה על שדה שאינו קיים. */
    assert.ok(!/id="authAge"/.test(html), 'תיבת authAge עדיין קיימת ב-index.html');
    assert.ok(!/authAge/.test(app), 'app.js עדיין מתייחס ל-authAge');
    assert.ok(!/id="fAge"/.test(html), 'עטיפת fAge עדיין ב-index.html');
  });
});
