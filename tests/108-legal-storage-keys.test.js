'use strict';
/* 108 -- the localStorage key list declared in privacy.html section 5 must cover
 * every storage key the code actually writes (app.js, store.js, sw.js).
 *
 * Complements 100-legal-docs-consistency (which checks the whole document set):
 * this file focuses on the storage-key contract alone and reads the DECLARED
 * list from the section-5 table itself, so a key deleted from the table (not
 * just from the page text) turns the build red.
 *
 * Teeth proven on 4.9.2026 by removing hw_examDate from a copy of the page:
 * the check failed with "keys written by the code but not declared: hw_examDate".
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = read('app.js') + '\n' + read('store.js') + '\n' + read('sw.js');

/* Keys the code writes: hw_* literals plus base names passed to KEY('...'). */
function codeKeys(src) {
  const out = new Set();
  let m;
  const hw = /['"`](hw_[A-Za-z][A-Za-z0-9_]*)/g;
  while ((m = hw.exec(src))) out.add(m[1]);
  const viaKey = /KEY\('([A-Za-z][A-Za-z0-9_]*)'\)/g;
  while ((m = viaKey.exec(src))) out.add(m[1]);
  return out;
}

/* Keys the page declares: <code>...</code> entries inside the section-5 table
 * (between id="s5" and id="s6"). Pure over the html string so the control can
 * run the real logic on a mutated copy. */
function declaredKeys(html) {
  const s5 = html.indexOf('id="s5"');
  const s6 = html.indexOf('id="s6"');
  assert.ok(s5 > -1 && s6 > s5, 'privacy.html must contain sections s5 and s6');
  const section = html.slice(s5, s6);
  const out = new Set();
  let m;
  const re = /<code>([^<]+)<\/code>/g;
  while ((m = re.exec(section))) out.add(m[1].replace(/:$/, '').trim());
  return out;
}

function undeclared(codeSet, declSet, html) {
  const hasEnNote = html.includes('_en');
  return [...codeSet].filter((k) => {
    if (declSet.has(k)) return false;
    if (k.endsWith('_en') && hasEnNote && declSet.has(k.slice(0, -3))) return false;
    return true;
  }).sort();
}

describe('108: privacy.html section 5 declares every storage key the code writes', () => {
  const html = read('privacy.html');

  test('sanity: extractors find a real population', () => {
    assert.ok(codeKeys(code).size >= 20, 'expected 20+ keys in code');
    assert.ok(declaredKeys(html).size >= 20, 'expected 20+ declared keys in the table');
  });

  test('no key written by the code is missing from the declared table', () => {
    const missing = undeclared(codeKeys(code), declaredKeys(html), html);
    assert.deepStrictEqual(missing, [],
      `keys written by the code but not declared: ${missing.join(', ')}`);
  });

  test('CONTROL: removing a declared key from a copy of the page is caught', () => {
    const mutated = html.replace('<code>hw_examDate</code>', '<code>hw_removed_for_control</code>');
    const missing = undeclared(codeKeys(code), declaredKeys(mutated), mutated);
    assert.ok(missing.includes('hw_examDate'),
      'the real checker must flag hw_examDate when its table row is removed');
  });
});
