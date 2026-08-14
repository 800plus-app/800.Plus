'use strict';
/* Accessibility · the four findings from דוחות/בדק-בית-2/09-נגישות.md that were fixed.
 *
 * WHY THIS FILE EXISTS, AND WHAT IT CAN AND CANNOT PROVE
 * -----------------------------------------------------
 * The audit that produced 09-נגישות.md drove a real Chromium through Playwright. This suite
 * cannot: `node tests/run.js` has no browser, no layout, no accessibility tree. So this file
 * deliberately tests only the two things that ARE decidable without one, and says so rather
 * than pretending to more:
 *
 *   1. CONTRAST · a pure function of the declared CSS colours. WCAG 2.1 relative luminance is
 *      arithmetic, so it is computed here from the hex literals actually present in index.html.
 *      This is NOT pixel sampling. The audit's own report records why pixel sampling failed
 *      (section א): it caught rounded corners, the background *behind* a gradient button, and
 *      mid-`transition` values · the same element measured 3.33 and 4.19 on two runs. Reading
 *      the declared value and doing the arithmetic is deterministic and repeats exactly.
 *
 *   2. STRUCTURE · whether the markup and the render path contain the hooks a screen reader
 *      needs: a live region on the element that changes, a role on the error paragraph, an
 *      explicit focus move where the browser would otherwise drop focus on <body>. These are
 *      source-text assertions in the style of 10-distractors.test.js.
 *
 * WHAT IS NOT PROVEN HERE, STATED PLAINLY: that a screen reader actually speaks any of this.
 * No NVDA/JAWS/VoiceOver was run · not by this suite and not by the audit either (09-נגישות.md
 * section ד, item 1). What is asserted is the MECHANISM. The audit measured, in a real browser,
 * that this exact mechanism (an aria-live region in index.html filled from app.js) does reach
 * Chromium's accessibility tree for #feedback · so the mechanism is not a guess; its
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
  assert.ok(src, `app.js no longer declares function ${name}() -- extraction failed by name ` +
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
/* index.html with CSS comments stripped. Rules are located by what precedes the selector, and a
 * /* … *​/ sitting immediately above a rule is exactly the sort of thing this repo writes -- the
 * first draft of ruleDecl() anchored on `}` and stopped finding .au-go:hover the moment the fix
 * was documented above it. Removing comments first makes the anchor mean what it says. */
const css = html.replace(/\/\*[\s\S]*?\*\//g, '\n');

/* Pull one declaration out of one rule, e.g. rule('.au-go:hover', 'background'). */
function ruleDecl(selector, prop) {
  const sel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* `{` נוסף למחלקת התווים ב-6.8: 36 כללי :hover נעטפו ב-@media (hover:hover) כדי
     שלא יידבקו במסך מגע, ומאותו רגע התו שלפני הסלקטור הוא `{` של שאילתת המדיה.
     בלי זה הבדיקה לא מוצאת את הכלל ונופלת על קוד תקין · מתקנים את הבדיקה, לא את הקוד.
     בטוח: סלקטור לעולם אינו מופיע בתוך גוף הצהרות, ולכן העוגן עדיין חד-משמעי. */
  const m = css.match(new RegExp('(?:^|[\\n;},{])\\s*' + sel + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, `index.html has no rule for ${selector}`);
  const d = m[1].match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;}]+)'));
  return d ? d[1].trim() : null;
}

const AA_BODY = 4.5;

describe('contrast · the checker itself (control)', () => {
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
     * If a future edit reverts either of them, the two tests below go red -- this proves those
     * two tests are capable of going red. */
    assert.ok(contrast('#7d7365', '#f6f1e7') < AA_BODY, 'old --ink-soft must read as failing');
    assert.ok(contrast('#fffdf8', '#c9962f') < AA_BODY, 'white on gold must read as failing');
  });
});

describe('A11Y-04a · --ink-soft passes AA on both surfaces it is painted on', () => {
  /* The report counts ten interface rows that all resolve to --ink-soft on --paper: #qCount,
   * #qLive, .section-t, .score-of, .topbar .back (x15), .btn-ghost, .qmeta, .w-sub, .tile .lbl,
   * .m-head span. They stand or fall together on one variable, so one variable is tested. */
  const ink = cssVar('ink-soft');
  const paper = cssVar('paper');
  const card = cssVar('card');

  test(`--ink-soft ${ink} on --paper ${paper} reaches 4.5:1`, () => {
    const c = contrast(ink, paper);
    assert.ok(c >= AA_BODY, `--ink-soft on --paper is ${r2(c)}:1, needs ${AA_BODY}:1`);
  });

  test(`--ink-soft ${ink} on --card ${card} reaches 4.5:1`, () => {
    const c = contrast(ink, card);
    assert.ok(c >= AA_BODY, `--ink-soft on --card is ${r2(c)}:1, needs ${AA_BODY}:1`);
  });

  test('--ink-soft is still recognisably the same soft grey, not a black substitute', () => {
    /* Guards the fix from the other side. "Make it pass" has a trivial wrong answer -- set it to
     * #000 -- which would flatten the whole visual hierarchy the variable exists to create. */
    const c = contrast(ink, paper);
    assert.ok(c < 8, `--ink-soft on --paper is ${r2(c)}:1 -- that is body-ink dark, not soft`);
  });
});

describe('A11Y-04b · .au-go:hover is no longer white on gold', () => {
  /* index.html:51 already documents this exact failure for .btn-primary ("white on gold measured
   * 2.66:1, below AA") and fixed it there. .au-go:hover reintroduced it on the primary button of
   * the auth card -- the single gate into the app. */
  test('the hover pair of the auth card\'s primary button reaches 4.5:1', () => {
    const bg = ruleDecl('.au-go:hover', 'background');
    const fg = ruleDecl('.au-go:hover', 'color');
    assert.ok(bg && fg, '.au-go:hover must declare both background and color');
    const c = contrast(fg, bg);
    assert.ok(c >= AA_BODY, `.au-go:hover is ${fg} on ${bg} = ${r2(c)}:1, needs ${AA_BODY}:1`);
  });

  test('--gold is not used as a text-bearing background anywhere in .au-go', () => {
    const gold = cssVar('gold').toLowerCase();
    const bg = String(ruleDecl('.au-go:hover', 'background')).toLowerCase();
    assert.notStrictEqual(bg, gold,
      `--gold (${gold}) carries no readable text at any size on either surface (2.37 / 2.62)`);
  });
});

describe('A11Y-02 · focus is moved deliberately after an answer, not dropped on <body>', () => {
  /* `$('#answerInput').disabled=true` runs while that input holds focus. Per HTML, disabling the
   * focused element returns focus to <body> · measured, `focusAfter: "BODY"`, and 6 Tab presses
   * to get back to "הבא ←", passing a destructive delete button on the way. */
  const src = fn('finishCard');

  test('finishCard() disables the focused input · the condition that creates the bug', () => {
    assert.match(src, /\$\('#answerInput'\)\.disabled\s*=\s*true/,
      'if this line is gone the bug is gone too and this whole group should be re-derived');
  });

  test('finishCard() then moves focus explicitly to #nextBtn', () => {
    assert.match(src, /\$\('#nextBtn'\)\s*\.focus\(\)/,
      'nothing in finishCard() calls .focus() on #nextBtn -- focus falls to <body>');
  });

  test('the focus move happens AFTER the feedback markup exists', () => {
    /* #nextBtn is created by the fb.innerHTML assignment. Focusing before that runs would be a
     * no-op on an element that does not exist yet -- a fix that reads right and does nothing. */
    const built = src.indexOf('fb.innerHTML');
    const focused = src.search(/\$\('#nextBtn'\)\s*\.focus\(\)/);
    assert.ok(built >= 0, 'finishCard no longer builds #feedback via fb.innerHTML');
    assert.ok(focused > built,
      'focus() on #nextBtn runs before the innerHTML that creates it -- it would hit null');
  });

  test('the target really is the button the round continues through', () => {
    assert.match(src, /id="nextBtn"/,
      'finishCard must be the place #nextBtn is minted, or the focus target is a stale id');
  });
});

describe('A11Y-01 · the new card is announced, and nothing else is', () => {
  const render = fn('renderCard');

  test('index.html carries a polite live region for the card', () => {
    assert.match(html, /id="cardLive"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="cardLive"/,
      'no #cardLive region with aria-live="polite" in index.html');
  });

  test('#cardLive is atomic · the sentence is read as one unit, not word by word', () => {
    const tag = html.match(/<[^>]*id="cardLive"[^>]*>/);
    assert.ok(tag, 'no element with id="cardLive"');
    assert.match(tag[0], /aria-atomic="true"/);
  });

  test('#cardLive is available to a screen reader but takes no visual space', () => {
    const tag = html.match(/<[^>]*id="cardLive"[^>]*>/)[0];
    assert.match(tag, /class="[^"]*\bsr-only\b/, '#cardLive must carry .sr-only');
    /* display:none and visibility:hidden both remove a node from the accessibility tree, so a
     * live region hidden that way announces nothing at all. The clip technique does not. */
    const rule = html.match(/\.sr-only\s*\{([^}]*)\}/);
    assert.ok(rule, 'index.html declares no .sr-only rule');
    const css = rule[1].replace(/\s+/g, '');
    assert.ok(!/display:none/.test(css) && !/visibility:hidden/.test(css),
      '.sr-only uses display:none or visibility:hidden -- that hides it from the reader too');
    assert.match(css, /position:absolute/);
    assert.match(css, /clip|clip-path/);
  });

  test('renderCard() fills #cardLive', () => {
    assert.match(render, /\$\('#cardLive'\)\.textContent\s*=/,
      'renderCard writes nothing to #cardLive -- the new card stays silent');
  });

  test('the announcement carries all three facts the audit found missing', () => {
    /* position in the round (#qCount), what to do (#qKind), and the word itself (#qText). */
    const line = render.match(/\$\('#cardLive'\)\.textContent\s*=([^\n]*)/);
    assert.ok(line, 'no #cardLive assignment to inspect');
    for (const part of ['#qCount', '#qKind', '#qText']) {
      assert.ok(line[1].includes(part),
        `the announcement omits ${part} -- the audit named all three as silent`);
    }
  });

  test('it is written once per card, not once per keystroke', () => {
    /* Noise is worse than silence: a live region rewritten on every DOM touch is a reader that
     * never stops talking. renderCard runs once per card, and holds the only write. */
    const inRender = (render.match(/\$\('#cardLive'\)\.textContent\s*=/g) || []).length;
    assert.strictEqual(inRender, 1, 'renderCard writes #cardLive more than once');
    const inApp = (app.match(/#cardLive'\)\.textContent\s*=/g) || []).length;
    assert.strictEqual(inApp, 1, 'something outside renderCard also writes #cardLive');
  });

  test('#qLive · the score counter · is no longer the one thing that gets announced', () => {
    /* Before the fix this was the ONLY announcement on a card change, and it carries "✓ 0":
     * the least useful fact on the screen, spoken over the most useful one. It stays visible;
     * it stops being a live region. */
    const tag = html.match(/<[^>]*id="qLive"[^>]*>/);
    assert.ok(tag, 'no element with id="qLive"');
    assert.doesNotMatch(tag[0], /aria-live/,
      '#qLive is still a live region -- it will talk over #cardLive on every card');
  });

  test('#feedback keeps its live region (the verdict must still be announced)', () => {
    /* The audit verified in Chromium that the verdict DOES reach the accessibility tree through
     * this region. Nothing above is allowed to have cost that. */
    const tag = html.match(/<[^>]*id="feedback"[^>]*>/);
    assert.ok(tag, 'no element with id="feedback"');
    assert.match(tag[0], /aria-live="polite"/);
    assert.match(tag[0], /role="status"/);
  });
});

describe('A11Y-03 · the auth error is announced', () => {
  const msgs = [
    ['authMsg', 'the only gate into the app -- a wrong password is otherwise silent'],
    ['delMsg', 'the same paragraph pattern, on the account-deletion dialog'],
  ];

  for (const [id, why] of msgs) {
    test(`#${id} carries role="alert" · ${why}`, () => {
      const tag = html.match(new RegExp('<[^>]*id="' + id + '"[^>]*>'));
      assert.ok(tag, `no element with id="${id}"`);
      assert.match(tag[0], /role="alert"/,
        `#${id} has no role="alert": the message appears on screen and is never spoken`);
    });

    test(`#${id} is assertive, not polite`, () => {
      /* A failed sign-in interrupts the task the user is doing; it is not an incidental status.
       * role="alert" implies assertive, but the attribute is stated so an edit that swaps the
       * role for role="status" cannot silently downgrade the urgency. */
      const tag = html.match(new RegExp('<[^>]*id="' + id + '"[^>]*>'))[0];
      assert.match(tag, /aria-live="assertive"/);
    });
  }

  test('the error paragraph is still the element app.js writes to', () => {
    /* Guards against the role being added to a decorative wrapper while the text goes elsewhere. */
    assert.match(app, /\$\('#authMsg'\)/, 'app.js no longer addresses #authMsg');
  });

  test('control · an element known to have no role is reported as having none', () => {
    /* Proves the matcher above is reading the tag it claims to read. #qCount is a bare span. */
    const tag = html.match(/<[^>]*id="qCount"[^>]*>/);
    assert.ok(tag, 'no element with id="qCount"');
    assert.doesNotMatch(tag[0], /role="alert"/);
  });
});
