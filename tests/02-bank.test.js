'use strict';
/* Bank integrity -- what protects a bank edit.
 *
 * data.js and data-en.js are edited by hand and by script, several times a day. Nothing about a
 * bad edit crashes: a duplicate key silently merges two words into one entry, an untranslated
 * gloss silently asks an unanswerable question, a leftover comma silently shows an empty "also"
 * line. Every one of those reaches a learner looking like the app working normally.
 *
 * These run over the real files. They are deliberately whole-bank, not sampled -- a rule that
 * only checks the words added today (as scratchpad/nite_v1.js does) cannot catch a regression
 * in a word added last week.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, banks, expectNone, ROOT } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);

const LANGS = [
  { lang: 'he', file: 'data.js', label: 'Hebrew' },
  { lang: 'en', file: 'data-en.js', label: 'English' },
];

/* Only markers that cannot also be ordinary vocabulary.
 *
 * Built from strings rather than written as a regex literal, and the invisible characters are
 * given as escapes: a non-breaking space pasted in as a character looks exactly like a space,
 * and the first draft of this rule contained one, which quietly turned it into "match every row"
 * · 3,687 failures that all looked real.
 *
 * Note what is NOT here: bare Hebrew verbs. לבדוק is a legitimate gloss for `check`, and
 * להשלים for `complete`, `accomplish` and `perfect` · both were in the first draft of this list,
 * and both failed on correct data. A one-word Hebrew "marker" is almost always somebody's
 * vocabulary. Only multi-word phrases no gloss would ever be, plus never-legitimate characters. */
const MARKER = new RegExp([
  '\\bTODO\\b', '\\bFIXME\\b', '\\bXXX\\b', '\\bTBD\\b', '\\bWIP\\b',
  '\\?\\?', '<<<', '>>>', '\\[\\[', '\\]\\]', '«', '»', '##',
  ' ',                       // non-breaking space
  '�',                       // U+FFFD, i.e. a byte that failed to decode
  'חסר פירוש', 'טרם תורגם', 'להשלים פירוש', 'צריך בדיקה',
].join('|'), 'i');

for (const { lang, file, label } of LANGS) {
  describe(`${label} bank (${file})`, () => {
    const ctx = loadApp({ lang });
    const data = banks()[lang];
    const rows = [];
    for (const unit of Object.keys(data)) for (const pair of data[unit]) rows.push({ unit, term: pair[0], gloss: pair[1] });
    const at = r => `${r.term} [unit ${r.unit}]`;

    test('every row is a [term, gloss] pair of non-empty strings', () => {
      none(rows.filter(r => typeof r.term !== 'string' || !r.term.trim() ||
        typeof r.gloss !== 'string' || !r.gloss.trim())
        .map(r => `unit ${r.unit}: ${JSON.stringify(r.term)} / ${JSON.stringify(r.gloss)}`),
        'malformed rows:');
    });

    test('every normalised key is unique across the whole bank', () => {
      // buildBank() folds duplicates into the first entry silently. If two units both hold the
      // word, one unit's count is a lie and the second gloss is glued onto the first.
      const seen = new Map(); const dupes = [];
      for (const r of rows) {
        const k = ctx.K(r.term);
        if (seen.has(k)) dupes.push(`${k}  <-  ${seen.get(k)}  vs  "${r.term}" [unit ${r.unit}]`);
        else seen.set(k, `"${r.term}" [unit ${r.unit}]`);
      }
      none(dupes, 'duplicate normalised keys — one of each pair is invisible in the app:');
    });

    test('no normalised key is empty', () => {
      none(rows.filter(r => !ctx.K(r.term)).map(r => `unit ${r.unit}: ${JSON.stringify(r.term)}`),
        'terms that normalise to nothing, and so can never be looked up or answered:');
    });

    test('every gloss contains Hebrew · in both banks the gloss is the Hebrew side', () => {
      none(rows.filter(r => !/[֐-׿]/.test(r.gloss)).map(r => `${at(r)} :: ${r.gloss}`),
        'glosses with no Hebrew at all:');
    });

    test('every listed sense contains Hebrew · an untranslated sense is an unanswerable prompt', () => {
      // Segment-level, not gloss-level. A gloss like "חשבון; account for · להסביר" is fine: the
      // Latin is a collocation being glossed. A segment that is ONLY Latin is untranslated text.
      const bad = [];
      for (const r of rows) {
        for (const seg of String(r.gloss).split(';')) {
          if (seg.trim() && !/[֐-׿]/.test(seg)) bad.push(`${at(r)} :: ${r.gloss}`);
        }
      }
      none(bad, 'glosses with a sense that was never translated:');
    });

    test('no Latin letters outside parentheses or a collocation gloss', () => {
      // Inside parentheses Latin is a usage note and is intended, and "account for · להסביר"
      // is a collocation being glossed. Anything else is source text that never got translated.
      const strip = g => String(g)
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[A-Za-z][A-Za-z .]*\s*[—–-]\s*(?=[֐-׿])/g, ' ');
      none(rows.filter(r => /[A-Za-z]/.test(strip(r.gloss))).map(r => `${at(r)} :: ${r.gloss}`),
        'Latin text outside a parenthetical or a collocation gloss:');
    });

    test('no leftover editing markers', () => {
      none(rows.filter(r => MARKER.test(r.gloss) || MARKER.test(r.term)).map(r => `${at(r)} :: ${r.gloss}`),
        'editing markers left in the bank:');
    });

    test('no leftover separator artefacts (dangling or doubled , ;)', () => {
      none(rows.filter(r => /^[\s,;/|]/.test(r.gloss) || /[,;/|]\s*$/.test(r.gloss) || /[,;]\s*[,;]/.test(r.gloss))
        .map(r => `${at(r)} :: ${JSON.stringify(r.gloss)}`),
        'a truncated edit left a separator behind:');
    });

    test('parentheses are balanced · maskTerm and meaningSegs both split on them', () => {
      none(rows.filter(r => (r.gloss.match(/\(/g) || []).length !== (r.gloss.match(/\)/g) || []).length)
        .map(r => `${at(r)} :: ${r.gloss}`),
        'unbalanced parentheses:');
    });

    test('no sense is listed twice inside one entry', () => {
      // "senses merged" is the documented shape of these files. A merge that ran twice shows the
      // learner "גם: לפני · לפני" on the feedback line after a correct answer.
      const bad = [];
      for (const r of rows) {
        const parts = String(r.gloss).split(/[,;]/).map(s => s.trim()).filter(Boolean);
        if (new Set(parts).size !== parts.length) bad.push(`${at(r)} :: ${r.gloss}`);
      }
      none(bad, 'the same sense listed twice in one entry (the learner is shown "גם: X · X"):');
    });

    test('the unit totals match the count the file claims in its own header', () => {
      const header = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')[0];
      const m = header.match(/([\d,]+)\s+entries\s+in\s+(\d+)\s+units/);
      assert.ok(m, `${file}'s first line no longer states its own size: ${header}`);
      const claimedEntries = Number(m[1].replace(/,/g, ''));
      const claimedUnits = Number(m[2]);
      assert.strictEqual(Object.keys(data).length, claimedUnits, `${file} header claims ${claimedUnits} units`);
      assert.strictEqual(rows.length, claimedEntries,
        `${file} header claims ${claimedEntries} entries but the file holds ${rows.length}`);
    });

    test('units are the ten the app asks for, and none is empty', () => {
      assert.deepStrictEqual(Object.keys(data).sort((a, b) => a - b), Array.from(ctx.UNIT_IDS));
      none(Object.keys(data).filter(u => data[u].length === 0).map(u => `unit ${u} is empty`), 'empty units:');
    });

    test('buildBank keeps every entry · nothing is silently folded away', () => {
      // If this drifts from the row count, two entries collided on a key and one learner-visible
      // word disappeared from the app without any error being raised anywhere.
      assert.strictEqual(ctx.BANK.length, rows.length);
    });

    test('every term is accepted as its own answer', () => {
      // The matcher must never reject the word it is asking for. Cheap, whole-bank, and the one
      // check that catches a normalisation change breaking a whole class of entries at once.
      none(Array.from(ctx.BANK).filter(w => !ctx.isCorrect(w.term, w.term)).map(w => w.term),
        'terms the matcher rejects as their own answer:');
    });

    test('no gloss is just the term again', () => {
      none(rows.filter(r => ctx.K(r.term) && ctx.K(r.term) === ctx.K(r.gloss)).map(r => `${at(r)} :: ${r.gloss}`),
        'the gloss repeats the term, so the card asks and answers itself:');
    });
  });
}

describe('Hebrew bank · one lexeme, one entry', () => {
  /* data.js's own first line promises "One word = one entry, senses merged." Key uniqueness
   * (tested above) enforces that only up to niqqud. It cannot see a word entered once
   * defectively and once plene · עֹל and עֹול normalise to על and עול, two different keys, so
   * the dedupe in buildBank never fires. The learner meets the same word in two units, and
   * progress recorded on one does not count for the other.
   *
   * heForms is exactly the right instrument: it already knows which spellings are the same
   * word, because that is what it exists for. */
  /* THE RULE (set by the owner, 1.8.2026): when one spelling carries two vocalisations with
   * two meanings, both words belong in the bank and the NIQQUD is what tells them apart.
   *
   * So a collision is no longer automatically a fault. What decides is the VOWEL SEQUENCE:
   *
   *   עֹל /o/     vs עֹול /o/       same vowels → one word written twice → DUPLICATE
   *   אִכּוּל /i,u/ vs אִיכּוּל /i,u/  same vowels → DUPLICATE
   *   נֹגַהּ /o,a/  vs נוּגֶה /u,e/    different  → two real words → LEGAL
   *
   * Vowels, not the literal string, because plene spelling adds letters that carry no mark:
   * the vav in עֹול and the yod in אִיכּוּל are maters, so both sides reduce to the same sound
   * and the duplicate is caught. Dagesh is skipped as consonantal EXCEPT on vav, where it is
   * the shuruq vowel · that single exception is what separates נוּגֶה from נֹגַהּ. */
  const VOWEL = /[ְ-ׇֻ]/;
  function vowels(term) {
    const out = [];
    const s = term.normalize('NFC');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === 'ּ') {                       // dagesh: a vowel only when it sits in a vav
        if (s[i - 1] === 'ו' && !VOWEL.test(s[i + 1] || '')) out.push('u');
        continue;
      }
      if (VOWEL.test(c)) out.push(c);
    }
    return out.join('');
  }

  test('colliding entries differ in vocalisation · no word is in the bank twice', () => {
    const ctx = loadApp({ lang: 'he' });
    const byKey = new Map();
    for (const w of ctx.BANK) byKey.set(ctx.K(w.term), w);
    const pairs = new Map();
    for (const w of ctx.BANK) {
      const own = ctx.K(w.term);
      for (const form of ctx.heForms(w.term)) {
        const k = ctx.K(form);
        if (!k || k === own) continue;
        const other = byKey.get(k);
        if (!other) continue;
        const id = [w.term, other.term].sort().join(' ~ ');
        if (pairs.has(id)) continue;
        // different vowels = two real words sharing a spelling. That is allowed now.
        if (vowels(w.term) !== vowels(other.term)) continue;
        pairs.set(id, `"${w.term}" [unit ${w.unit}] /${vowels(w.term)}/ :: ${w.meaning.slice(0, 40)}\n` +
          `        "${other.term}" [unit ${other.unit}] /${vowels(other.term)}/ :: ${other.meaning.slice(0, 40)}`);
      }
    }
    none([...pairs.values()],
      'these two rows are the SAME word: same consonants and the same vowels, differing only\n' +
      'in plene vs defective spelling. Keep one row — the plene spelling, which is the modern\n' +
      'standard — and merge both glosses into it. A learner who meets the same word in two\n' +
      'units builds progress on one that does not count for the other:');
  });

  /* The other half of the rule. Two words may share a spelling only if they are genuinely two
   * words, and the gloss is the only thing the learner has to tell them apart -- so if the two
   * glosses are equal, the vocalisation difference is a typo rather than a distinction. */
  test('a legal homograph pair carries two different meanings', () => {
    const ctx = loadApp({ lang: 'he' });
    const byKey = new Map();
    for (const w of ctx.BANK) byKey.set(ctx.K(w.term), w);
    const bad = new Set();
    for (const w of ctx.BANK) {
      const own = ctx.K(w.term);
      for (const form of ctx.heForms(w.term)) {
        const k = ctx.K(form);
        if (!k || k === own) continue;
        const other = byKey.get(k);
        if (!other || vowels(w.term) === vowels(other.term)) continue;
        if (w.meaning.trim() === other.meaning.trim())
          bad.add(`"${w.term}" and "${other.term}" share one gloss: ${w.meaning.slice(0, 60)}`);
      }
    }
    none([...bad], 'these are vocalised differently but mean the same thing, so nothing in the\n' +
      'app distinguishes them for the learner:');
  });
});
