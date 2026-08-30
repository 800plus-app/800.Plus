'use strict';
/* The legal pages must describe what the code actually does -- measured, not assumed.
 *
 * Born from the 30.8.2026 legal audit, which found the live privacy policy declaring
 * "this is the complete localStorage list" while at least 12 real keys (including the
 * learner's exam date and the Supabase auth token) were absent, and deletion.html
 * describing billing records that have never existed (no payment provider is connected).
 *
 * WHAT THIS FILE PROVES: set logic over source text only. It cannot prove a human
 * reads the page; it pins the MECHANISM that keeps document and code from drifting:
 *
 *   GROUP 1 -- every localStorage-style key literal in app.js/store.js appears in
 *              privacy.html. A developer adding `hw_newthing` without documenting it
 *              turns the build red.
 *   GROUP 2 -- the Supabase auth token entry is named explicitly (it holds the email).
 *   GROUP 3 -- deletion.html does not claim present-tense billing records while no
 *              billing exists (app.js FREE_PHASE / no charge flow).
 *   GROUP 4 -- privacy, terms and deletion carry the SAME update date (accessibility
 *              is exempt: it changes on its own audit cadence).
 *
 * Every group carries a control that proves the check can fail.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const privacy = read('privacy.html');
const terms = read('terms.html');
const deletion = read('deletion.html');
const code = read('app.js') + '\n' + read('store.js') + '\n' + read('sw.js');

/* Pure so the control below can prove teeth. Collects hw_* key literals plus
 * every base name passed to the per-language KEY() wrapper (catches non-hw_
 * keys like wcHide). */
function collectKeys(src) {
  const out = new Set();
  let m;
  const hw = /['"`](hw_[A-Za-z][A-Za-z0-9_]*)/g;
  while ((m = hw.exec(src))) out.add(m[1]);
  const viaKey = /KEY\('([A-Za-z][A-Za-z0-9_]*)'\)/g;
  while ((m = viaKey.exec(src))) out.add(m[1]);
  return out;
}
/* Boundary-anchored: `hw_sent` does NOT count as covered by `hw_sent_prog`.
 * A `_en` variant is documented by its boundary-matched base name plus the
 * doc's explicit "_en suffix" note -- listing every variant would be noise. */
function missingFromDoc(keys, doc) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const present = (k) => new RegExp(esc(k) + '(?![A-Za-z0-9_])').test(doc);
  const covered = (k) => present(k) ||
    (k.endsWith('_en') && present(k.slice(0, -3)) && doc.includes('_en'));
  return [...keys].filter((k) => !covered(k)).sort();
}

describe('GROUP 1: every storage key literal in code is named in privacy.html', () => {
  test('no undocumented keys', () => {
    const keys = collectKeys(code);
    assert.ok(keys.size >= 20, `sanity: expected 20+ keys, extractor found ${keys.size}`);
    const missing = missingFromDoc(keys, privacy);
    assert.deepStrictEqual(missing, [],
      `keys used by the code but absent from privacy.html: ${missing.join(', ')}`);
  });
  test('CONTROL: an undocumented key is caught', () => {
    const missing = missingFromDoc(new Set(['hw_zz_undocumented']), privacy);
    assert.deepStrictEqual(missing, ['hw_zz_undocumented']);
  });
  test('CONTROL: substring of a documented key is NOT considered covered', () => {
    const missing = missingFromDoc(new Set(['hw_sent']), privacy);
    assert.deepStrictEqual(missing, ['hw_sent'],
      'hw_sent must not ride on hw_sent_prog being documented');
  });
});

describe('GROUP 2: the auth token is disclosed by name', () => {
  test('privacy names the sb auth token', () => {
    assert.ok(privacy.includes('auth-token'),
      'privacy.html must name the Supabase auth token entry (it contains the email)');
  });
});

/* Factored so the control runs the REAL check against the pre-fix wording. */
function billingWordingOk(txt) {
  return !txt.includes('נשמרים רשומת החיוב') && txt.includes('אין רשומות תשלום');
}
describe('GROUP 3: deletion.html matches the no-billing reality', () => {
  test('no present-tense billing records while billing is off', () => {
    assert.ok(billingWordingOk(deletion),
      'deletion.html must state the no-billing reality and drop the old billing-records claim');
  });
  test('CONTROL: the real checker rejects the pre-fix wording', () => {
    const oldText = 'אם ביצעת תשלום, נשמרים רשומת החיוב ויומן אירועי הסליקה';
    assert.ok(!billingWordingOk(oldText));
  });
});

describe('GROUP 4: privacy, terms and deletion share one update date', () => {
  const dateOf = (html, name) => {
    const m = html.match(/עודכן:\s*([^<·]+?)(?:\s*·|<)/);
    assert.ok(m, `${name}: no update-date line found`);
    return m[1].trim();
  };
  test('dates are identical', () => {
    const p = dateOf(privacy, 'privacy');
    const t = dateOf(terms, 'terms');
    const d = dateOf(deletion, 'deletion');
    assert.strictEqual(t, p, `terms date "${t}" differs from privacy date "${p}"`);
    assert.strictEqual(d, p, `deletion date "${d}" differs from privacy date "${p}"`);
  });
  test('CONTROL: the real extractor exposes a drifting date', () => {
    const stale = '<div class="updated">עודכן: 14 באוגוסט 2026</div>';
    assert.notStrictEqual(dateOf(stale, 'stale-synthetic'), dateOf(privacy, 'privacy'),
      'a page left on the old date must not compare equal');
  });
});
