'use strict';
/* Normalisation, both languages.
 *
 * norm() and normEn() decide what counts as "the same word" EVERYWHERE: the key a progress
 * record is stored under, whether a bank entry is a duplicate, and whether a typed answer is
 * right. When one of them shifts, nothing crashes -- the app just starts telling people they got
 * a word wrong that they got right, or forgets progress it still has on disk. That is why the
 * v8 hyphen change needed a migration (app.js remapHyphenKeys) rather than a redeploy.
 *
 * The fixed regressions below are named, one test each, so that undoing one is a red line with
 * the word in it rather than a number going down.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./_harness/sandbox.js');

const he = loadApp({ lang: 'he', bank: false });
const en = loadApp({ lang: 'en', bank: false });

describe('norm() · Hebrew', () => {
  test('strips niqqud', () => {
    assert.strictEqual(he.norm('כֹּפֶר'), 'כפר');
    assert.strictEqual(he.norm('סַיָּס'), 'סיס');
  });

  test('folds final letters so ך ם ן ף ץ never split a key', () => {
    assert.strictEqual(he.norm('שלום'), he.norm('שלומ'));
    assert.strictEqual(he.norm('ארץ'), he.norm('ארצ'));
    for (const [fin, reg] of [['ך', 'כ'], ['ם', 'מ'], ['ן', 'נ'], ['ף', 'פ'], ['ץ', 'צ']]) {
      assert.strictEqual(he.norm('אב' + fin), 'אב' + reg, `final ${fin} not folded`);
    }
  });

  test('NFKC folds Hebrew presentation forms back to letter + mark', () => {
    // U+FB35 HEBREW LETTER VAV WITH DAGESH -- stored by some sources, typed by nobody.
    assert.strictEqual(he.norm('וּ'), 'ו');
    assert.strictEqual(he.norm('וּ'), he.norm('וּ'), 'presentation form must key like letter+dagesh');
  });

  test('drops directionality marks that are invisible but not absent', () => {
    assert.strictEqual(he.norm('‎אב‏'), 'אב');
  });

  test('removes quotes, gershayim and punctuation', () => {
    assert.strictEqual(he.norm('צה״ל'), 'צהל');
    assert.strictEqual(he.norm('אב׳'), 'אב');
    assert.strictEqual(he.norm('אב, גד. הו!'), 'אב גד הו');
  });

  test('treats a hyphen as a SEPARATOR, not as noise', () => {
    // The v8 change. A hyphen must become a space, not vanish: department-store is two words.
    assert.strictEqual(he.norm('אב-גד'), 'אב גד');
    assert.strictEqual(he.norm('אב–גד'), 'אב גד');      // en dash
    assert.strictEqual(he.norm('אב—גד'), 'אב גד');      // em dash
    assert.strictEqual(he.norm('אב/גד'), 'אב גד');
    assert.notStrictEqual(he.norm('אב-גד'), 'אבגד');
  });

  test('collapses whitespace and trims', () => {
    assert.strictEqual(he.norm('  אב   גד  '), 'אב גד');
    assert.strictEqual(he.norm('אב\n\tגד'), 'אב גד');
  });

  test('is total: null, undefined and numbers do not throw', () => {
    for (const v of [null, undefined, 0, 12, false, NaN]) assert.strictEqual(typeof he.norm(v), 'string');
    assert.strictEqual(he.norm(null), '');
    assert.strictEqual(he.norm(undefined), '');
  });

  test('is idempotent · normalising twice equals normalising once', () => {
    for (const s of ['כֹּפֶר', 'צה״ל', 'אב-גד', '  שלום  ', 'וּ', 'אֲלוּמַּת אוֹר']) {
      assert.strictEqual(he.norm(he.norm(s)), he.norm(s), `not idempotent for ${s}`);
    }
  });
});

describe('normEn() · English', () => {
  test('folds case', () => {
    assert.strictEqual(en.normEn('BestSeller'), en.normEn('bestseller'));
    assert.strictEqual(en.normEn('Department Store'), 'department store');
  });

  test('strips a leading article or infinitive marker', () => {
    assert.strictEqual(en.normEn('the book'), 'book');
    assert.strictEqual(en.normEn('a cat'), 'cat');
    assert.strictEqual(en.normEn('an apple'), 'apple');
    assert.strictEqual(en.normEn('to run'), 'run');
  });

  test('REGRESSION: a leading SPACE must not hide the article', () => {
    // app.js:150 "trim first: a leading space hid the article". Before the fix, '  the book'
    // keyed differently from 'the book' and the same word held two progress records.
    assert.strictEqual(en.normEn('  the book'), 'book');
    assert.strictEqual(en.normEn('\tto run '), 'run');
  });

  test('only strips the article when it is a whole word', () => {
    assert.strictEqual(en.normEn('theatre'), 'theatre');
    assert.strictEqual(en.normEn('another'), 'another');
    assert.strictEqual(en.normEn('tone'), 'tone');
  });

  test('treats hyphen, dashes and slash as separators', () => {
    assert.strictEqual(en.normEn('best-seller'), 'best seller');
    assert.strictEqual(en.normEn('self–confidence'), 'self confidence');
    assert.strictEqual(en.normEn('raise/lift'), 'raise lift');
  });

  test('drops remaining punctuation but keeps digits', () => {
    assert.strictEqual(en.normEn("don't"), 'dont');
    assert.strictEqual(en.normEn('co-operate!'), 'co operate');
    assert.strictEqual(en.normEn('1st'), '1st');
  });

  test('applies NFKC before anything else', () => {
    assert.strictEqual(en.normEn('ﬁle'), 'file');            // U+FB01 ligature
    assert.strictEqual(en.normEn('ｃａｆｅ'), 'cafe');          // fullwidth
  });

  test('is total and idempotent', () => {
    for (const v of [null, undefined, 0, false]) assert.strictEqual(typeof en.normEn(v), 'string');
    for (const s of ['the Best-Seller', '  to RUN ', "don't", 'ﬁle']) {
      assert.strictEqual(en.normEn(en.normEn(s)), en.normEn(s), `not idempotent for ${s}`);
    }
  });
});

describe('named regressions · these must never come back', () => {
  test('כֹּפֶר is answerable as כופר (defective spelling is not what people type)', () => {
    assert.strictEqual(he.norm('כֹּפֶר'), 'כפר', 'stripping niqqud leaves the DEFECTIVE spelling');
    assert.ok(he.heForms('כֹּפֶר').some(f => he.norm(f) === 'כופר'),
      'heForms must offer the full spelling כופר; otherwise the app accepts only כפר, a different word');
    assert.strictEqual(he.isCorrect('כופר', 'כֹּפֶר'), true);
    assert.strictEqual(he.isCorrect('כפר', 'כֹּפֶר'), true, 'the stored spelling must still be accepted');
  });

  test('סַיָּס is answerable as סייס (consonantal yod doubles when unvocalised)', () => {
    assert.strictEqual(he.norm(he.pleneYod('סַיָּס')), 'סייס');
    assert.strictEqual(he.isCorrect('סייס', 'סַיָּס'), true);
    assert.strictEqual(he.isCorrect('סיס', 'סַיָּס'), true);
  });

  test('מִכְמוֹרֶת is answerable as מיכמורת, NOT as מיכמוורת', () => {
    // app.js:362 -- a holam male is already a vav; looking only forward doubled it. 74 terms
    // rejected their own standard spelling.
    assert.strictEqual(he.norm(he.fullSpelling('מִכְמוֹרֶת')), 'מיכמורת');
    assert.strictEqual(he.isCorrect('מיכמורת', 'מִכְמוֹרֶת'), true);
  });

  test('best-seller and bestseller are the same answer', () => {
    assert.strictEqual(en.isCorrect('bestseller', 'best-seller'), true);
    assert.strictEqual(en.isCorrect('best-seller', 'best-seller'), true);
    assert.strictEqual(en.isCorrect('best seller', 'best-seller'), true);
    assert.strictEqual(en.isCorrect('self confidence', 'self-confidence'), true);
    assert.strictEqual(en.isCorrect('selfconfidence', 'self-confidence'), true);
  });

  test('"department store" keys as two words, and the closed form still answers it', () => {
    // The v8 key change that needed remapHyphenKeys(). The KEY must be the two-word form…
    assert.strictEqual(en.normEn('department store'), 'department store');
    assert.strictEqual(en.normEn('department-store'), 'department store');
    assert.notStrictEqual(en.normEn('department store'), 'departmentstore');
    // …while the answer matcher stays forgiving about how it is typed.
    assert.strictEqual(en.isCorrect('departmentstore', 'department store'), true);
    assert.strictEqual(en.isCorrect('Department Store', 'department store'), true);
  });
});

describe('Hebrew spelling variants', () => {
  test('fullSpelling derives matres from the niqqud rather than guessing', () => {
    assert.ok(he.norm(he.fullSpelling('כֹּפֶר')).includes('ו'), 'holam should yield a ו');
    assert.ok(he.norm(he.fullSpelling('מִכְמוֹרֶת')).startsWith('מי'), 'hiriq should yield a י');
    // Guessing (dropping all matres) would merge unrelated words. שיר and שר must stay apart.
    assert.notStrictEqual(he.norm('שִׁיר'), he.norm('שַׂר'));
  });

  test('pleneYod only doubles a CONSONANTAL yod, never a mater', () => {
    assert.strictEqual(he.norm(he.pleneYod('סַיָּס')), 'סייס');
    // a bare yod after a hiriq is a mater and must be left alone
    assert.strictEqual(he.pleneYod('שִׁיר'), 'שִׁיר');
  });

  test('pleneVav doubles a consonantal vav', () => {
    assert.strictEqual(he.norm(he.pleneVav('תִּקְוָה')), 'תקווה');
  });

  test('heForms always includes the term itself and never an empty string', () => {
    for (const t of ['כֹּפֶר', 'סַיָּס', 'תִּקְוָה', 'מִכְמוֹרֶת', 'אֲלוּמַּת אוֹר']) {
      const f = he.heForms(t);
      assert.ok(f.includes(t), `heForms(${t}) dropped the term itself`);
      assert.ok(f.every(x => typeof x === 'string' && x.length > 0), `heForms(${t}) produced an empty form`);
    }
  });

  test('heForms composes the rules · a word can need a ו and a doubled י at once', () => {
    const f = he.heForms('קוּשִׁיָה').map(he.norm);
    assert.ok(f.includes('קושייה'), 'expected the everyday spelling קושייה among ' + [...new Set(f)].join(','));
  });

  test('the Hebrew rules are not applied to English', () => {
    // isCorrect gates heForms on LANG. If that gate is lost, English answers start matching
    // through Hebrew spelling rules, which is nonsense that would only show up as odd accepts.
    assert.strictEqual(en.isCorrect('hous', 'house'), false);
    assert.strictEqual(en.isCorrect('cat', 'dog'), false);
  });
});
