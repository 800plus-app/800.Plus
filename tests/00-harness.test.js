'use strict';
/* Tests for the test harness.
 *
 * Everything else in this suite runs code lifted out of app.js by text. If the lifting is wrong,
 * the other files can go green while testing nothing at all -- which is the single worst outcome
 * available here, worse than having no suite. These tests exist so that the lifting itself fails
 * loudly and by name.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { codeMask, braceBalance, matchBrace } = require('./_harness/scan.js');
const { extractFunction, extractDecl } = require('./_harness/extract.js');
const { loadApp, banks, appSource, plain, tagOf, REQUIRED, ROOT } = require('./_harness/sandbox.js');

describe('harness · the source scanner', () => {
  test('braces balance to zero over code positions in every project script', () => {
    for (const f of ['app.js', 'store.js', 'sw.js', 'config.js', 'leveltest.js', 'leveltest-he.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const b = braceBalance(src);
      assert.deepStrictEqual(b, { net: 0, min: 0 },
        `${f}: the scanner does not see balanced braces (${JSON.stringify(b)}). Either the file is ` +
        `broken, or it now uses syntax tests/_harness/scan.js mishandles. Fix the scanner -- do NOT ` +
        `weaken this assertion, because every other test in this suite depends on it being true.`);
    }
  });

  test('braces inside strings, regexes, comments and templates are not counted', () => {
    const src = [
      'function tricky(a){',
      '  const s = "a } b { c";',
      "  const t = 'x { y } z';",
      '  const r = /[{]|\\}/g;',
      '  const u = /a\\/b{2,3}/;',
      '  // } a comment brace {',
      '  /* } block } comment { */',
      '  const tpl = `lit } ${ a ? {k:1} : {k:2} } tail {`;',
      '  return [s,t,r,u,tpl];',
      '}',
      'function after(){ return 42; }',
    ].join('\n');
    const mask = codeMask(src);
    assert.deepStrictEqual(braceBalance(src, mask), { net: 0, min: 0 });

    const lifted = extractFunction(src, 'tricky', mask);
    assert.ok(lifted.startsWith('function tricky(a){'), 'lift did not start at the declaration');
    assert.ok(lifted.trimEnd().endsWith('}'), 'lift did not end at the closing brace');
    assert.ok(!lifted.includes('function after'), 'lift ran past the end of the function');
    // and it is real, runnable code
    const ctx = vm.createContext({});
    vm.runInContext(lifted, ctx);
    assert.strictEqual(typeof ctx.tricky, 'function');
    assert.strictEqual(ctx.tricky(1).length, 5);
  });

  test('a naive brace count would get the same input wrong (the scanner is load-bearing)', () => {
    // This is the exact technique scratchpad/nite_v1.js uses. Pinned here so nobody is tempted
    // to simplify scan.js back into it: one unbalanced brace inside a regex is enough to break it.
    const naive = (s, n) => {
      const i = s.indexOf('function ' + n + '(');
      let d = 0;
      for (let k = s.indexOf('{', i); k < s.length; k++) {
        if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
      }
      return undefined;                              // never closed
    };
    const good = 'function f(){ return 1; }\nfunction g(){ return 2; }';
    const openBrace = 'function f(){ const r = /[{]/; return r; }\nfunction g(){ return 2; }';
    const closeBrace = "function f(){ const s = '}'; return s; }\nfunction g(){ return 2; }";

    assert.ok(naive(good, 'f'), 'sanity: the naive counter handles the easy case');

    // …and gets both hard cases wrong, in opposite directions.
    assert.strictEqual(naive(openBrace, 'f'), undefined, 'expected the naive counter to never close');
    assert.ok(naive(closeBrace, 'f').length < "function f(){ const s = '}'; return s; }".length,
      'expected the naive counter to stop early on a brace inside a string');

    for (const src of [good, openBrace, closeBrace]) {
      const lifted = extractFunction(src, 'f', codeMask(src));
      assert.ok(lifted.startsWith('function f()'), 'scanner lift lost the head');
      assert.ok(lifted.trimEnd().endsWith('}'), 'scanner lift lost the tail');
      assert.ok(!lifted.includes('function g'), 'scanner lift overran into the next function');
    }
  });

  test('matchBrace and statement extraction survive a multi-name const', () => {
    const src = "const A='}', B='{', C=3;\nconst D=1;";
    const mask = codeMask(src);
    const d = extractDecl(src, 'A', mask);
    assert.ok(d.startsWith('var '), 'declaration must be rewritten to var so it lands on the sandbox');
    const ctx = vm.createContext({});
    vm.runInContext(d, ctx);
    assert.deepStrictEqual([ctx.A, ctx.B, ctx.C], ['}', '{', 3]);
    assert.strictEqual(ctx.D, undefined, 'extraction ran past the end of the statement');
  });
});

describe('harness · lifting app.js', () => {
  test('every symbol the suite depends on is still declared in app.js', () => {
    const ctx = loadApp();                       // throws by name if anything is missing
    const absent = REQUIRED.filter(n => ctx[n] === undefined);
    assert.deepStrictEqual(absent, []);
  });

  test('lifted symbols have the shape the tests assume', () => {
    const ctx = loadApp();
    for (const n of ['norm', 'normEn', 'K', 'fullSpelling', 'pleneYod', 'pleneVav', 'heForms',
      'buildBank', 'glossAlts', 'classify', 'newCards', 'weakCards', 'learnedCards',
      'commitSession', 'isCorrect', 'mergeProgress', 'hasAccess', 'saneRec']) {
      assert.strictEqual(typeof ctx[n], 'function', `${n} is not a function`);
    }
    // tagOf, not instanceof: the sandbox is a separate realm, so its RegExp is not ours.
    assert.strictEqual(tagOf(ctx.NIQ), '[object RegExp]', 'NIQ is not a RegExp');
    assert.strictEqual(typeof ctx.PAST_DUE_GRACE_DAYS, 'number');
    assert.strictEqual(typeof ctx.FREE_PHASE, 'boolean');
  });

  test('values crossing out of the sandbox compare correctly once made plain', () => {
    // Guards the helper the merge tests rely on. An array built inside the vm has a different
    // prototype, so deepStrictEqual rejects it even when the contents match -- a trap that would
    // otherwise show up as an unexplainable red in 06-merge.
    const ctx = loadApp({ bank: false });
    const out = ctx.mergeProgress({ assoc: {}, stats: { words: {} }, deleted: ['a'], added: [] },
      { assoc: {}, stats: { words: {} }, deleted: ['b'], added: [] });
    assert.throws(() => assert.deepStrictEqual(out.deleted, ['a', 'b']),
      'if this stops throwing, plain() is no longer needed and the comment above is stale');
    assert.deepStrictEqual(plain(out.deleted).sort(), ['a', 'b']);
  });

  test('a missing symbol is a loud failure, not a silent skip', () => {
    const mask = codeMask(appSource());
    assert.strictEqual(extractFunction(appSource(), 'thisFunctionDoesNotExist', mask), null);
    assert.strictEqual(extractDecl(appSource(), 'thisConstDoesNotExist', mask), null);
    const { extractAll } = require('./_harness/extract.js');
    assert.throws(() => extractAll(appSource(), ['norm', 'nope_not_here']), /nope_not_here/);
  });

  test('the sandbox is isolated · one test cannot leak state into the next', () => {
    const a = loadApp({ lang: 'he' });
    a.stats.words.__leak = a.saneRec({ seen: 9, level: 3, last: 1 });
    const b = loadApp({ lang: 'he' });
    assert.strictEqual(b.stats.words.__leak, undefined);
    assert.strictEqual(b.BANK.length > 0, true);
  });

  test('the real word banks load and are the size the app expects', () => {
    const b = banks();
    assert.strictEqual(Object.keys(b.he).length, 10, 'Hebrew bank should have 10 units');
    assert.strictEqual(Object.keys(b.en).length, 10, 'English bank should have 10 units');
    const he = loadApp({ lang: 'he' }), en = loadApp({ lang: 'en' });
    assert.ok(he.BANK.length > 1000, 'Hebrew BANK looks empty: ' + he.BANK.length);
    assert.ok(en.BANK.length > 3000, 'English BANK looks empty: ' + en.BANK.length);
  });
});
