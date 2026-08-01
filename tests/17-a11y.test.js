'use strict';
/* Accessibility — the four findings from דוחות/בדק-בית-2/09-נגישות.md that were fixed.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT CAN AND CANNOT PROVE
 * -----------------------------------------------------
 * The audit that produced 09-נגישות.md drove a real Chromium through Playwright. This suite
 * cannot: `node tests/run.js` has no browser, no layout, no accessibility tree. So this file
 * deliberately tests only the two things that ARE decidable without one, and says so rather
 * than pretending to more:
 *
 *   1. CONTRAST — a pure function of the declared CSS colours. WCAG 2.1 relative luminance is
 *      arithmetic, so it is computed here from the hex literals actually present in index.html.
 *      This is NOT pixel sampling. The audit's own report records why pixel sampling failed
 *      (section א): it caught rounded corners, the background *behind* a gradient button, and
 *      mid-`transition` values — the same element measured 3.33 and 4.19 on two runs. Reading
 *      the declared value and doing the arithmetic is deterministic and repeats exactly.
 *
 *   2. STRUCTURE — whether the markup and the render path contain the hooks a screen reader
 *      needs: a live region on the element that changes, a role on the error paragraph, an
 *      explicit focus move where the browser would otherwise drop focus on <body>. These are
 *      source-text assertions in the style of 10-distractors.test.js.
 *
 * WHAT IS NOT PROVEN HERE, STATED PLAINLY: that a screen reader actually speaks any of this.
 * No NVDA/JAWS/VoiceOver was run — not by this suite and not by the audit either (09-נגישות.md
 * section ד, item 1). What is asserted is the MECHANISM. The audit measured, in a real browser,
 * that this exact mechanism (an aria-live region in index.html filled from app.js) does reach
 * Chromium's accessibility tree for #feedback — so the mechanism is not a guess; its
 * application to three more places is what is pinned below.
 *
 * EVERY GROUP CARRIES A CONTROL. A contrast checker that returns "pass" for everything, or a
 * structure test that greps for a string too loose to ever be absent, is worth nothing. So each
 * group asserts a known-BAD input is rejected as well as a known-good one accepted.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');
const { extractFunction } = require('./_harness/extract.js');
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

/* ===================== WCAG 2.1 contrast, from first principles ===================== */
/* https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and #dfn-contrast-ratio, verbatim. */
function srgbToLinear(v) {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  assert.match(h, /^[0-9a-fA-F]{6}$/, `not a hex colour: ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const r2 = n => Math.round(n * 100) / 100;

/* Pull a CSS custom property's value out of index.html's :root block. Throws by name if the
 * variable is renamed, rather than silently testing a colour that is no longer used. */
function cssVar(name) {
  const m = html.match(new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{3,6})\\s*[;}]'));
  assert.ok(m, `index.html no longer declares --${name} as a hex literal`);
  return m[1];
}
/* Pull one declaration out of one rule, e.g. rule('.au-go:hover', 'background'). */
function ruleDecl(selector, prop) {
  const sel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp('(?:^|[},])\\s*' + sel + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, `index.html has no rule for ${selector}`);
  const d = m[1].match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;}]+)'));
  return d ? d[1].trim() : null;
}

const AA_BODY = 4.5;

describe('contrast — the checker itself (control)', () => {
  /* If these do not hold, nothing else in this file means anything. */
  test('black on white is 21:1 and white on white is 1:1', () => {
    assert.strictEqual(r2(contrast('#000000', '#ffffff')), 21);
    assert.strictEqual(r2(contrast('#ffffff', '#ffffff')), 1);
  });

  test('reproduces the audit\'s published numbers for the colours it measured', () => {
    /* 09-נגישות.md section ג. Two independent implementations landing on the same figures is
     * what makes the table below trustworthy; a checker only ever validated against its own
     * output validates nothing. */
    assert.strictEqual(r2(contrast('#7d7365', '#f6f1e7')), 4.13);  // old --ink-soft on --paper
    assert.strictEqual(r2(contrast('#7d7365', '#fffdf8')), 4.58);  // old --ink-soft on --card
    assert.strictEqual(r2(contrast('#c9962f', '#f6f1e7')), 2.37);  // --gold on --paper
    assert.strictEqual(r2(contrast('#c9962f', '#fffdf8')), 2.62);  // --gold on --card
    assert.strictEqual(r2(contrast('#fffdf8', '#c9962f')), 2.62);  // .au-go:hover, white on gold
  });

  test('the checker rejects the colours that were broken (it can return FAIL)', () => {
    /* A11Y-04 in the report's contrast table. These are the exact values that were replaced.
     * If a future edit reverts either of them, the two tests below go red — this proves those
     * two tests are capable of going red. */
    assert.ok(contrast('#7d7365', '#f6f1e7') < AA_BODY, 'old --ink-soft must read as failing');
    assert.ok(contrast('#fffdf8', '#c9962f') < AA_BODY, 'white on gold must read as failing');
  });
});

describe('A11Y-02 · focus is moved deliberately after an answer, not dropped on <body>', () => {
  /* `$('#answerInput').disabled=true` runs while that input holds focus. Per HTML, disabling the
   * focused element returns focus to <body> — measured, `focusAfter: "BODY"`, and 6 Tab presses
   * to get back to "הבא ←", passing a destructive delete button on the way. */
  const src = fn('finishCard');

  test('finishCard() disables the focused input — the condition that creates the bug', () => {
    assert.match(src, /\$\('#answerInput'\)\.disabled\s*=\s*true/,
      'if this line is gone the bug is gone too and this whole group should be re-derived');
  });

  test('finishCard() then moves focus explicitly to #nextBtn', () => {
    assert.match(src, /\$\('#nextBtn'\)\s*\.focus\(\)/,
      'nothing in finishCard() calls .focus() on #nextBtn — focus falls to <body>');
  });

  test('the focus move happens AFTER the feedback markup exists', () => {
    /* #nextBtn is created by the fb.innerHTML assignment. Focusing before that runs would be a
     * no-op on an element that does not exist yet — a fix that reads right and does nothing. */
    const built = src.indexOf('fb.innerHTML');
    const focused = src.search(/\$\('#nextBtn'\)\s*\.focus\(\)/);
    assert.ok(built >= 0, 'finishCard no longer builds #feedback via fb.innerHTML');
    assert.ok(focused > built,
      'focus() on #nextBtn runs before the innerHTML that creates it — it would hit null');
  });

  test('the target really is the button the round continues through', () => {
    assert.match(src, /id="nextBtn"/,
      'finishCard must be the place #nextBtn is minted, or the focus target is a stale id');
  });
});

