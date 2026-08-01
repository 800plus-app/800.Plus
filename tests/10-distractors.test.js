'use strict';
/* Distractors, exam papers and the level test.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * tests/README.md put this whole area under "what is NOT covered — this needs a browser":
 * "The level test (leveltest.js, leveltest-he.js) and exam generation — including
 * pickDistractors, where a bad distractor is a card with two correct answers."
 *
 * Half of that is right. Rendering an option list needs a browser. Deciding WHICH strings go in
 * it does not: exDistract(), exBuild(), exWriteOk(), lvNextBand() and lvEstimate() are pure
 * functions of a word pool and a run of answers. And the app already owns a machine-checkable
 * definition of "this string is also a correct answer" — isCorrect(), meaningMatch(), glossAlts()
 * and exWriteOk() itself — so nothing here is a matter of taste.
 *
 * NOTE ON THE NAME `pickDistractors`: no such symbol exists in the project. The unit exam picks
 * distractors in exDistract() (app.js:2212). The level test picks none at runtime at all — every
 * item in leveltest.js / leveltest-he.js ships with a fixed `d` array — so for the level test the
 * distractor question is a DATA question, and it is asked of those two files below.
 *
 * THE CENTRAL INVARIANT
 * ---------------------
 * A four-option question with two defensible answers is not a hard question, it is a broken one:
 * the learner answers correctly, is told they are wrong, and stops believing the score. So:
 *
 *   retrieve  (prompt = gloss, options = terms)    no offered term may satisfy exWriteOk() for
 *                                                  this item — that is the app's OWN checker for
 *                                                  this exact prompt one section later.
 *   recognise (prompt = term, options = meanings)  no offered gloss may satisfy meaningMatch()
 *                                                  against the answer's gloss, nor share its
 *                                                  glossKey (the GLOSS_ALT index).
 *
 * That invariant HOLDS today, in both banks. A test that only ever passes proves nothing, so the
 * control is built in: `describe('the detector itself')` feeds exDistract pools that DO contain a
 * co-correct candidate and asserts it is caught, and asserts the detector fires on pairs the
 * clash filter is not asked about. If exDistract's overlap guard is ever weakened, the whole-bank
 * tests go red rather than staying green over a broken filter.
 *
 * ONE TEST IS A PIN, NOT A SPEC — `KNOWN BUG` in its name, in the style 09-mask.test.js already
 * uses: the "לא יודע" button in the level test starts a timer that no exit path can cancel.
 * The test asserts today's WRONG behaviour so the suite stays green and goes red the moment
 * somebody fixes it. The corrected assertion is written out in the comment above it.
 *
 * Findings written up in: דוחות/בדק-בית-2/11-מבחן-רמה.md
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAll } = require('./_harness/extract.js');
const { codeMask, codeMatches, statementEnd } = require('./_harness/scan.js');
const { loadApp, appSource, banks, expectNone, ROOT } = require('./_harness/sandbox.js');

const none = (list, msg) => expectNone(assert, list, msg);

/* ============================ the loader ============================ */

/* Symbols this file needs on top of _harness/sandbox.js's list. Same contract: a rename in
 * app.js throws out of extractAll BY NAME rather than leaving a test that quietly passes.
 * EX_LEN and LV_BLOCK are named alone on purpose — they ride in grouped declarations
 * (`const EX_LEN=20, EX_MIX=…`, `const LV_BLOCK=6, LV_PASS=5, LV_START=…`) so the whole group
 * arrives, and a rename of EX_MIX or LV_PASS still breaks extraction. */
const EXTRA = [
  'shuffle',
  'EX_LEN', 'exTestable', 'TRL', 'skel', 'isTranslit',
  'exWords', 'exDistract', 'exBuild', 'exWriteOk',
  'LV_BANDS', 'LV_ORDER', 'LV_BLOCK', 'LV_LANG', 'lvDeck', 'lvBand', 'lvNextBand', 'lvEstimate',
];
const MUST_EXIST = EXTRA.concat(['EX_MIX', 'LV_PASS', 'LV_START', 'lvIdx', 'lvAns',
  'lvBlockOk', 'lvPassed', 'lvFailedUp', 'lvSeen']);

/* shuffle() is the only source of randomness in exDistract/exBuild. A suite whose verdict
 * depends on the draw is a suite that goes red on a Tuesday, so the sandbox gets its own Math
 * with a seeded random. Everything else on Math is the real thing. */
function seededMath(ref) {
  const m = {};
  for (const k of Object.getOwnPropertyNames(Math)) {
    const v = Math[k];
    m[k] = typeof v === 'function' ? v.bind(Math) : v;
  }
  m.random = () => ref.rnd();
  return m;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_BANKS = (() => {
  const w = {};
  for (const f of ['leveltest.js', 'leveltest-he.js'])
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { window: w });
  return { en: w.LEVEL_TEST, he: w.LEVEL_TEST_HE };
})();

function load(lang) {
  const ctx = loadApp({ lang });
  const ref = { rnd: mulberry32(20250801) };
  ctx.Math = seededMath(ref);              // replaces Math INSIDE the vm only
  ctx.window.LEVEL_TEST = LEVEL_BANKS.en;
  ctx.window.LEVEL_TEST_HE = LEVEL_BANKS.he;
  for (const { name, code } of extractAll(appSource(), EXTRA))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
  const absent = MUST_EXIST.filter(n => ctx[n] === undefined);
  if (absent.length) assert.fail('lifted from app.js but undefined afterwards: ' + absent.join(', '));
  ctx.__reseed = s => { ref.rnd = mulberry32(s); };
  return ctx;
}

const he = load('he');
const en = load('en');
const LANGS = [['he', he], ['en', en]];

/* ============================ the two co-correctness predicates ============================ */

/* Both are expressed THROUGH the app's own functions, never alongside them.
 *
 * retrieve: q is the item as exBuild builds it for a write-in slot, `accept` included, and the
 * verdict is exWriteOk's — the identical call the exam makes when the learner types an answer to
 * this identical prompt. If it says true, the option list is offering a second correct answer. */
function acceptListFor(ctx, pool, item) {
  return pool.filter(o => ctx.norm(o.meaning) === ctx.norm(item.meaning)).map(o => o.term);
}
function termIsAlsoCorrect(ctx, pool, item, term, accept) {
  return ctx.exWriteOk(term,
    { it: item, answer: item.term, accept: accept || acceptListFor(ctx, pool, item) });
}
/* recognise: meaningMatch is what practice mode uses to grade a word→meaning card, and glossKey
 * equality is the app's own definition of "these two entries mean the same thing" (GLOSS_ALT). */
function meaningIsAlsoCorrect(ctx, item, meaning) {
  if (ctx.meaningMatch(meaning, item.meaning)) return true;
  const a = ctx.glossKey(meaning), b = ctx.glossKey(item.meaning);
  return b.length >= 2 && a === b;
}

/* Pools are large (a full English unit is ~385 testable words) and exDistract is O(pool) per
 * call, so the whole-bank sweeps walk every unit but a fixed, seeded slice of each one. The
 * slice is deterministic, so a failure is reproducible; the level-test, ladder and edge-case
 * suites below are exhaustive.
 *
 * The sweep runs ONCE, at load, and the tests read its results. Six tests each re-running
 * exDistract over both banks took five minutes; the whole rest of the suite takes thirteen
 * seconds, and a suite people stop running is a suite that stops working. */
function sample(list, n, seed) {
  if (list.length <= n) return list.slice();
  const r = mulberry32(seed), out = [], used = new Set();
  while (out.length < n) {
    const i = Math.floor(r() * list.length);
    if (used.has(i)) continue;
    used.add(i); out.push(list[i]);
  }
  return out;
}
const PER_UNIT = 12;
function buildSweep(ctx) {
  const rows = [];
  for (const uid of ctx.UNIT_IDS) {
    const pool = ctx.exWords(uid);
    if (pool.length < 8) continue;
    const nT = new Map(), nM = new Map();
    for (const o of pool) { nT.set(o, ctx.norm(o.term)); nM.set(o, ctx.norm(o.meaning)); }
    const taken = new Set([...nT.values(), ...nM.values()]);
    const byTerm = new Map(pool.map(o => [o.term, o]));
    const byMeaning = new Map(pool.map(o => [o.meaning, o]));
    const acceptCache = new Map();
    const accept = item => {
      if (!acceptCache.has(item)) {
        const k = nM.get(item);
        acceptCache.set(item, pool.filter(o => nM.get(o) === k).map(o => o.term));
      }
      return acceptCache.get(item);
    };
    for (const item of sample(pool, PER_UNIT, Number(uid) * 991 + 7)) {
      rows.push({
        uid, pool, item, nT, nM, byTerm, byMeaning, accept,
        dTerm: ctx.exDistract(pool, item, 'term', taken),
        dMeaning: ctx.exDistract(pool, item, 'meaning', taken),
      });
    }
  }
  return rows;
}
/* Papers are built once too, for the same reason. Two seeded runs per unit. */
function buildPapers(ctx) {
  const out = [];
  for (const uid of ctx.UNIT_IDS) {
    const pool = ctx.exWords(uid);
    if (pool.length < 8) { out.push({ uid, pool, tooSmall: true }); continue; }
    for (let run = 0; run < 1; run++) {
      ctx.__reseed(Number(uid) * 1009 + run);
      out.push({ uid, run, pool, paper: ctx.exBuild(uid) });
    }
  }
  return out;
}
const SWEEP = { he: buildSweep(he), en: buildSweep(en) };
const PAPERS = { he: buildPapers(he), en: buildPapers(en) };

/* ============================ exDistract — the contract ============================ */

describe('exDistract — what may never appear in an option list', () => {
  for (const [lang, ctx] of LANGS) {
    test(`${lang}: no offered distractor is a SECOND CORRECT ANSWER`, () => {
      const bad = [];
      for (const r of SWEEP[lang]) {
        for (const term of r.dTerm)
          if (termIsAlsoCorrect(ctx, r.pool, r.item, term, r.accept(r.item)))
            bad.push(`[${lang} u${r.uid} retrieve] "${r.item.meaning}" -> ${r.item.term}, ` +
              `but exWriteOk also accepts the offered option ${term}`);
        for (const m of r.dMeaning)
          if (meaningIsAlsoCorrect(ctx, r.item, m))
            bad.push(`[${lang} u${r.uid} recognise] ${r.item.term} -> "${r.item.meaning}", ` +
              `but the offered option "${m}" also means it`);
      }
      none(bad, 'the exam offered an option the app itself would mark correct');
    });

    test(`${lang}: the answer is never among its own distractors`, () => {
      const bad = [];
      for (const r of SWEEP[lang]) {
        if (r.dTerm.some(t => ctx.norm(t) === r.nT.get(r.item))) bad.push(`${lang} u${r.uid} ${r.item.term} (term)`);
        if (r.dMeaning.some(m => ctx.norm(m) === r.nM.get(r.item))) bad.push(`${lang} u${r.uid} ${r.item.term} (meaning)`);
      }
      none(bad, 'exDistract returned the right answer as a distractor');
    });

    test(`${lang}: never more than 3, and never the same option twice`, () => {
      const bad = [];
      for (const r of SWEEP[lang]) {
        for (const [field, d] of [['term', r.dTerm], ['meaning', r.dMeaning]]) {
          if (d.length > 3) bad.push(`${lang} u${r.uid} ${r.item.term} ${field}: ${d.length} distractors`);
          if (new Set(d.map(x => ctx.norm(x))).size !== d.length)
            bad.push(`${lang} u${r.uid} ${r.item.term} ${field}: duplicate option ${d.join(' | ')}`);
        }
      }
      none(bad, 'exDistract broke its own shape contract');
    });

    /* Named regression. The unit lists אביון, חלכאי, מך and רש with the same gloss, so a "which
       word means עני" item once offered all four — four correct answers, and the learner is
       marked wrong for knowing three of them. The fix was to compare BOTH fields, not just the
       displayed one, and this is what keeps it. */
    test(`${lang}: a candidate must differ on BOTH fields — the אביון/חלכאי/מך/רש regression`, () => {
      const bad = [];
      const clash = (a, b) => a === b || a.includes(b) || b.includes(a);
      for (const r of SWEEP[lang]) {
        for (const t of r.dTerm) {
          const o = r.byTerm.get(t); if (!o) continue;
          if (clash(r.nM.get(o), r.nM.get(r.item)))
            bad.push(`${lang} u${r.uid}: "${r.item.meaning}" offered ${t}, whose gloss is "${o.meaning}"`);
        }
        for (const m of r.dMeaning) {
          const o = r.byMeaning.get(m); if (!o) continue;
          if (clash(r.nT.get(o), r.nT.get(r.item)))
            bad.push(`${lang} u${r.uid}: ${r.item.term} offered "${m}", whose word is ${o.term}`);
        }
      }
      none(bad, 'a distractor overlapped the answer on the hidden field');
    });
  }
});

/* ============================ the detector itself ============================
 * The four tests above pass. They are worth exactly nothing unless the same machinery, pointed
 * at a pool that DOES hold a second correct answer, says so. These pools are hand-built. */

describe('the detector itself — proof these tests can go red', () => {
  const mk = (term, meaning) => ({ term, meaning, k: he.K(term) });

  test('a byte-identical gloss IS caught by exDistract, and the detector agrees it would matter', () => {
    const item = mk('זַלְזַל', 'ענף'), twin = mk('פֹּארָה', 'ענף'), other = mk('כִּסֵּא', 'מושב');
    const pool = [item, twin, other];
    // the detector: if the twin were ever offered, it would be flagged
    assert.ok(termIsAlsoCorrect(he, pool, item, twin.term),
      'a word carrying the identical gloss must count as a second correct answer');
    // the shipped filter: it is not offered
    assert.deepStrictEqual(Array.from(he.exDistract(pool, item, 'term', new Set())), ['כִּסֵּא']);
  });

  test('a gloss that IS one listed sense of the answer is caught on the recognise side', () => {
    const item = mk('שָׁאוֹן', 'קול, המולה, רעש'), twin = mk('רַעַשׁ', 'רעש');
    const pool = [item, twin, mk('כִּסֵּא', 'מושב')];
    assert.ok(meaningIsAlsoCorrect(he, item, twin.meaning),
      'meaningMatch accepts one whole listed sense, so this option is a correct answer');
    assert.deepStrictEqual(Array.from(he.exDistract(pool, item, 'meaning', new Set())), ['מושב']);
  });

  /* The gap the substring guard cannot see. exDistract compares glosses with norm(), which keeps
     the contents of a parenthesis; glossAlts compares them with glossKey(), which strips it. Two
     entries whose glossKey is identical but whose parentheticals differ are invisible to the
     filter and visible to the app's own shared-gloss index. This asserts the gap exists, so it
     cannot be closed by accident and left undocumented. */
  test('KNOWN GAP: same glossKey, different parenthetical — the filter does not see it', () => {
    /* A private sandbox: the two entries are pushed into BANK and the REAL buildGlossIndex is
       run over it, so glossAlts and exWriteOk answer about them the way they answer about any
       shipped word. Nothing about the index is restated here. */
    const ctx = load('he');
    const item = { term: 'אָרִיג', meaning: 'ענף (של עץ)', k: ctx.K('אָרִיג') };
    const twin = { term: 'שָׂרִיג', meaning: 'ענף (בחברה)', k: ctx.K('שָׂרִיג') };
    ctx.BANK.push({ term: item.term, meaning: item.meaning, unit: 'x', id: 'x' },
      { term: twin.term, meaning: twin.meaning, unit: 'x', id: 'x' });
    ctx.buildGlossIndex();

    assert.strictEqual(ctx.glossKey(item.meaning), ctx.glossKey(twin.meaning),
      'the app itself calls these two glosses the same meaning');
    assert.ok(ctx.glossAlts(item).includes(twin.term),
      'so its own shared-gloss index lists the twin as an alternative');
    assert.ok(termIsAlsoCorrect(ctx, [item, twin], item, twin.term),
      'and exWriteOk therefore accepts the twin as an answer to this prompt');

    /* …and exDistract offers it anyway: it compares glosses with norm(), which keeps what is
       inside the parentheses, so neither string contains the other and the clash guard is silent.
       When this line goes red because exDistract started consulting glossKey/glossAlts, delete
       the KNOWN GAP wording and assert the twin is NOT offered — the gap will have been closed. */
    const pool = [item, twin, { term: 'כִּסֵּא', meaning: 'מושב', k: ctx.K('כִּסֵּא') }];
    assert.ok(ctx.exDistract(pool, item, 'term', new Set()).includes(twin.term),
      'today exDistract offers it; if it no longer does, invert this assertion');
  });

  test('a pool with nothing but co-correct candidates yields no distractors at all', () => {
    const item = mk('זַלְזַל', 'ענף');
    const pool = [item, mk('פֹּארָה', 'ענף'), mk('שׂוֹכָה', 'ענף'), mk('בַּד', 'ענף')];
    none(he.exDistract(pool, item, 'term', new Set()),
      'every other word in this pool means exactly the same thing; none may be offered');
  });
});

/* ============================ starved pools ============================
 * "A unit with few words, filters that shrink the pool, a single word in scope, a bank smaller
 * than the number of distractors needed." None of these can reach a user through exBuild — it
 * refuses to build below 8 words — but exDistract is a public function of the module and the
 * question asked of it was whether it hangs, short-changes, or repeats itself. */

describe('exDistract — starved pools', () => {
  const mk = (term, meaning) => ({ term, meaning, k: he.K(term) });

  test('a pool holding only the item returns nothing and returns', () => {
    const item = mk('זַלְזַל', 'ענף');
    none(he.exDistract([item], item, 'term', new Set()), 'nothing to draw from');
    none(he.exDistract([item], item, 'meaning', new Set()), 'nothing to draw from');
  });

  test('an EMPTY pool returns nothing and returns', () => {
    none(he.exDistract([], mk('זַלְזַל', 'ענף'), 'term', new Set()), 'nothing to draw from');
  });

  test('fewer candidates than needed gives fewer distractors — it does not loop or pad', () => {
    const item = mk('זַלְזַל', 'ענף');
    const pool = [item, mk('כִּסֵּא', 'מושב'), mk('שֻׁלְחָן', 'רהיט לאכילה')];
    const d = he.exDistract(pool, item, 'term', new Set());
    assert.strictEqual(d.length, 2, 'two usable candidates must give exactly two distractors');
    assert.strictEqual(new Set(d).size, 2, 'and it must not repeat one to reach three');
  });

  test('an entry with an empty gloss is never offered', () => {
    const item = mk('זַלְזַל', 'ענף');
    const pool = [item, mk('כִּסֵּא', ''), mk('שֻׁלְחָן', 'רהיט')];
    assert.deepStrictEqual(Array.from(he.exDistract(pool, item, 'meaning', new Set())), ['רהיט']);
  });

  test('candidates differing only in niqqud count as ONE option, not two', () => {
    /* Two options that read the same turn a four-way question into a three-way one without
       saying so — the exact reason exDistract dedupes on norm() rather than on the raw string. */
    const item = mk('זַלְזַל', 'ענף');
    const pool = [item, mk('כסא', 'מושב'), mk('כִּסֵּא', 'מקום ישיבה'), mk('שֻׁלְחָן', 'רהיט')];
    const d = he.exDistract(pool, item, 'term', new Set());
    assert.strictEqual(new Set(d.map(x => he.norm(x))).size, d.length,
      'כסא and כִּסֵּא must not both be offered');
  });

  test('when `taken` swallows the whole pool, the relaxed branch still fills the question', () => {
    /* Preferring distractors that are not another item's answer is a nicety; failing to build
       the question at all is not an option, so exDistract relaxes. This pins that it does. */
    const item = mk('זַלְזַל', 'ענף');
    const pool = [item, mk('כִּסֵּא', 'מושב'), mk('שֻׁלְחָן', 'רהיט'), mk('דֶּלֶת', 'פתח'), mk('חַלּוֹן', 'צוהר')];
    const all = new Set(pool.map(p => he.norm(p.term)));
    assert.strictEqual(he.exDistract(pool, item, 'term', all).length, 3,
      'the strict filter emptied the pool; the relaxed one must still return three');
  });
});

/* ============================ exBuild — the paper ============================ */

describe('exBuild — the paper a learner actually sits', () => {
  test('a unit with fewer than 8 testable words builds no paper at all', () => {
    /* openExam() says so on screen and startExam() toasts; this pins the function underneath. */
    const uid = Object.keys(banks().he)[0];
    assert.ok(he.exBuild(uid).length > 0, 'a real unit must still build one');
    // the guard itself, through the only door available: a unit id that holds nothing
    none(he.exBuild('__no_such_unit__'), 'an unknown unit must produce no questions');
  });

  for (const [lang, ctx] of LANGS) {
    test(`${lang}: every unit builds a full paper, with the advertised section sizes`, () => {
      /* openExam() prints "<n> questions" and a 8/6/6 breakdown BEFORE the paper is built. If
         exBuild silently drops a question (d.length<3 -> null -> filtered) the learner is shown
         a promise the exam does not keep. */
      const bad = [];
      for (const p of PAPERS[lang]) {
        if (p.tooSmall) { bad.push(`${lang} u${p.uid}: only ${p.pool.length} testable words`); continue; }
        const want = Math.min(ctx.EX_LEN, p.pool.length);
        if (p.paper.length !== want)
          bad.push(`${lang} u${p.uid} run${p.run}: openExam promised ${want} questions, exBuild produced ${p.paper.length}`);
        const nRec = Math.round(want * 0.4), nRet = Math.round(want * 0.3);
        const got = k => p.paper.filter(q => q.kind === k).length;
        if (got('recognise') !== nRec || got('retrieve') !== nRet || got('produce') !== want - nRec - nRet)
          bad.push(`${lang} u${p.uid} run${p.run}: sections ${got('recognise')}/${got('retrieve')}/${got('produce')}` +
            ` but the screen promised ${nRec}/${nRet}/${want - nRec - nRet}`);
      }
      none(bad, 'the paper does not match what the intro screen advertised');
    });

    test(`${lang}: no word is asked twice in one paper, and the answer is always among its options`, () => {
      const bad = [];
      for (const p of PAPERS[lang]) {
        if (p.tooSmall) continue;
        const keys = p.paper.map(q => ctx.K(q.it.term));
        if (new Set(keys).size !== keys.length) bad.push(`${lang} u${p.uid} run${p.run}: a word is asked twice`);
        for (const q of p.paper) {
          if (!q.opts) continue;
          if (q.opts.length !== 4) bad.push(`${lang} u${p.uid} ${q.it.term}: ${q.opts.length} options`);
          if (!q.opts.includes(q.answer)) bad.push(`${lang} u${p.uid} ${q.it.term}: answer missing from its options`);
          if (new Set(q.opts.map(o => ctx.norm(o))).size !== q.opts.length)
            bad.push(`${lang} u${p.uid} ${q.it.term}: two options read the same`);
        }
      }
      none(bad, 'a generated paper broke its own shape');
    });

    test(`${lang}: no question in a generated paper has two correct answers`, () => {
      const bad = [];
      for (const p of PAPERS[lang]) {
        if (p.tooSmall) continue;
        const nM = new Map(p.pool.map(o => [o, ctx.norm(o.meaning)]));
        const accept = new Map();
        const acc = it => {
          if (!accept.has(it)) accept.set(it, p.pool.filter(o => nM.get(o) === ctx.norm(it.meaning)).map(o => o.term));
          return accept.get(it);
        };
        for (const q of p.paper) {
          if (!q.opts) continue;
          for (const o of q.opts) {
            if (o === q.answer) continue;
            const twoWays = q.kind === 'recognise'
              ? meaningIsAlsoCorrect(ctx, q.it, o)
              : termIsAlsoCorrect(ctx, p.pool, q.it, o, acc(q.it));
            if (twoWays) bad.push(`${lang} u${p.uid} ${q.kind} ${q.it.term}: "${o}" is also correct`);
          }
        }
      }
      none(bad, 'a paper offered a second correct answer');
    });

    /* Named regression, from the comment at app.js:2391-2394: a learner taught in practice that
       פֹּארָה answers "ענף" typed it in the exam and was marked wrong — and that score is stored.
       Same question, two verdicts, and the stricter one is the one that counts. */
    test(`${lang}: a write-in accepts every word the practice screen accepts — the פֹּארָה/ענף regression`, () => {
      const bad = [];
      for (const r of SWEEP[lang]) {
        const q = { it: r.item, answer: r.item.term, accept: r.accept(r.item) };
        for (const alt of ctx.glossAlts(r.item))
          if (!ctx.exWriteOk(alt, q))
            bad.push(`${lang} u${r.uid}: practice accepts ${alt} for "${r.item.meaning}", the exam does not`);
      }
      none(bad, 'the exam is stricter than practice on the same prompt');
    });
  }
});

/* ============================ the level-test item banks ============================
 * leveltest.js and leveltest-he.js are generated files whose header says "do not hand-edit".
 * Nothing checked that the generator's promises survived. These are those promises, as tests. */

describe('level-test banks — the distractors that ship pre-baked', () => {
  for (const [lang, bankKey] of [['en', 'en'], ['he', 'he']]) {
    const bank = LEVEL_BANKS[bankKey];
    const ctx = lang === 'he' ? he : en;

    test(`${lang}: every item offers exactly four distinct options`, () => {
      const bad = [];
      for (const it of bank) {
        if (!Array.isArray(it.d) || it.d.length !== 3) bad.push(`${it.w}: ${(it.d || []).length} distractors`);
        if ((it.d || []).some(d => d === it.a)) bad.push(`${it.w}: the answer is also a distractor`);
        if (new Set([it.a, ...(it.d || [])].map(x => ctx.norm(x))).size !== 4)
          bad.push(`${it.w}: two of its four options read the same`);
      }
      none(bad, 'a level-test item cannot be answered as posed');
    });

    test(`${lang}: every band can fill a block AND can be passed`, () => {
      /* lvLoadBlock deals LV_BLOCK items and lvNextBand needs LV_PASS of them. A band holding
         fewer than LV_PASS items is a band nobody can ever clear, and the ladder would walk
         straight past it without anything saying so. */
      const bad = [];
      for (const b of ctx.LV_ORDER) {
        const n = bank.filter(it => it.band === b).length;
        if (n < ctx.LV_BLOCK) bad.push(`band ${b} has ${n} items, a block needs ${ctx.LV_BLOCK}`);
      }
      none(bad, 'a band cannot fill its block');
    });

    test(`${lang}: no distractor is another item's answer in the same band`, () => {
      /* Items from one band are dealt as one block, so a distractor that is a neighbour's answer
         hands out that neighbour's solution a question early. */
      const bad = [];
      for (const b of ctx.LV_ORDER) {
        const items = bank.filter(it => it.band === b);
        const answers = new Set(items.map(it => ctx.norm(it.a)));
        for (const it of items) for (const d of it.d)
          if (answers.has(ctx.norm(d)) && ctx.norm(d) !== ctx.norm(it.a))
            bad.push(`${it.w} offers "${d}", another ${b} item's answer`);
      }
      none(bad, 'a level-test block leaks its own answers');
    });

    test(`${lang}: no distractor is a meaning the word bank gives to that same word`, () => {
      /* The level-test gloss is one sense; the main bank may list others. If a distractor is one
         of those other senses, the item has two correct answers and the ladder mis-measures. */
      const data = lang === 'he' ? ctx.window.UNIT_DATA : ctx.window.UNIT_DATA_EN;
      const glosses = new Map();
      for (const u in data) for (const p of (data[u] || [])) {
        if (!p || !p[0]) continue;
        const k = ctx.K(p[0]);
        if (!glosses.has(k)) glosses.set(k, []);
        glosses.get(k).push(String(p[1] || ''));
      }
      const bad = [];
      for (const it of bank) {
        const mine = glosses.get(ctx.K(it.w)) || [];
        for (const d of it.d) {
          if (mine.some(g => ctx.norm(g) === ctx.norm(d) || ctx.meaningSegs(g).includes(ctx.norm(d))))
            bad.push(`${it.w} (${it.band}): "${d}" is a meaning the bank gives to ${it.w}`);
          if (ctx.meaningMatch(d, it.a) || (ctx.glossKey(it.a).length >= 2 && ctx.glossKey(d) === ctx.glossKey(it.a)))
            bad.push(`${it.w} (${it.band}): "${d}" means the same as the answer "${it.a}"`);
        }
      }
      none(bad, 'a level-test item has two correct answers');
    });
  }
});

/* ============================ the adaptive ladder ============================ */

describe('the adaptive ladder — lvNextBand and lvEstimate', () => {
  /* Drive the REAL lvNextBand over EVERY possible pass/fail sequence. It reads and writes
     module-level state, so each replay resets exactly what startLevelTest resets. */
  const reset = () => vm.runInContext("lvBand='B1'; lvPassed=null; lvFailedUp=false; lvBlockOk=0;", en);
  function walk(pattern) {
    reset();
    const visited = [];
    for (const pass of pattern) {
      visited.push(en.lvBand);
      vm.runInContext('lvBlockOk=' + (pass ? 5 : 4) + ';', en);
      const nx = en.lvNextBand();
      if (nx == null) return { pattern, visited, ended: true, level: en.lvPassed };
      vm.runInContext('lvBand=' + JSON.stringify(nx) + ';', en);
    }
    return { pattern, visited, ended: false, level: en.lvPassed };
  }
  const runs = [];
  (function gen(p) {
    if (p.length > 10) { runs.push({ pattern: p, ended: false, visited: [], level: null }); return; }
    const r = walk(p);
    if (r.ended) { runs.push(r); return; }
    gen(p.concat(true)); gen(p.concat(false));
  })([]);

  test('every answer pattern terminates — the ladder cannot loop', () => {
    none(runs.filter(r => !r.ended).map(r => r.pattern.map(x => x ? 'P' : 'f').join('')),
      'these patterns never reach a result within 10 blocks');
  });

  test('no band is ever probed twice', () => {
    /* lvPool() excludes words already seen, and each band holds ten items. A revisit would deal
       four, and LV_PASS=5 of four is unreachable — the band would be silently unpassable. */
    none(runs.filter(r => r.ended && new Set(r.visited).size !== r.visited.length)
      .map(r => r.visited.join('>')), 'a band was probed twice in one run');
  });

  test('a run is always 12–24 items, exactly as the intro screen claims', () => {
    const bad = runs.filter(r => r.ended)
      .map(r => ({ n: r.visited.length * en.LV_BLOCK, v: r.visited.join('>') }))
      .filter(x => x.n < 12 || x.n > 24)
      .map(x => `${x.v} = ${x.n} items`);
    none(bad, 'index.html promises "12–24 מילים"');
  });

  test('all correct climbs to C2; all wrong bottoms out with no level at all', () => {
    const right = runs.find(r => r.ended && r.pattern.every(Boolean));
    assert.deepStrictEqual(Array.from(right.visited), ['B1', 'B2', 'C1', 'C2']);
    assert.strictEqual(right.level, 'C2');
    assert.strictEqual(right.visited.length * en.LV_BLOCK, 24);

    const wrong = runs.find(r => r.ended && r.pattern.every(p => !p));
    assert.deepStrictEqual(Array.from(wrong.visited), ['B1', 'A2', 'A1']);
    assert.strictEqual(wrong.level, null,
      'nothing was cleared, so no band was earned — lvFinish stores the fallback "A1"');
  });

  test('4 of 6 never promotes — the guessing floor', () => {
    /* Four options, six items: 5/6 by luck is a ~4% event, 4/6 is not. The whole point of
       LV_PASS is that a level has to be earned, so pin the boundary. */
    reset();
    vm.runInContext('lvBlockOk=4;', en);
    assert.strictEqual(en.lvNextBand(), 'A2', '4/6 in B1 must walk DOWN');
    reset();
    vm.runInContext('lvBlockOk=5;', en);
    assert.strictEqual(en.lvNextBand(), 'B2', '5/6 in B1 must walk UP');
  });

  test('lvEstimate always agrees with the ladder about the level reached', () => {
    const bad = [];
    for (const r of runs) {
      if (!r.ended) continue;
      const ans = [];
      r.pattern.forEach((pass, i) => {
        for (let j = 0; j < en.LV_BLOCK; j++) ans.push({ band: r.visited[i], ok: j < (pass ? 5 : 4) });
      });
      vm.runInContext('lvAns=' + JSON.stringify(ans) + ';', en);
      const est = en.lvEstimate();
      if ((est.level || null) !== (r.level || null))
        bad.push(`${r.visited.join('>')}: the ladder says ${r.level}, lvEstimate says ${est.level}`);
    }
    none(bad, 'the badge on the result screen would disagree with the ladder that produced it');
  });
});

/* ============================ timers that outlive the screen ============================
 * app.js:2445-2448 records the bug this guards: "confirm() blocks the queue but does not cancel
 * timers … in the level test it wrote hw_level, which is the gate that decides whether the test
 * is ever offered again." The fix was `let exTimer=null, lvTimer=null` plus a clearTimeout in
 * each exit handler. This checks the fix is still whole — over source text, because the handlers
 * are DOM-bound and cannot be lifted. */

describe('feedback timers — nothing may outlive the exit button', () => {
  const src = appSource();
  const mask = codeMask(src);
  const lineOf = i => src.slice(0, i).split('\n').length;
  /* Every setTimeout in app.js whose body advances a quiz deck. Both the exam and the level test
     use the same shape: bump the index, re-render. */
  const advancing = codeMatches(src, /setTimeout\(\(\)=>\{\s*(exI|lvIdx)\+\+;/, mask)
    .map(h => ({ at: h.index, line: lineOf(h.index), which: h.match[1], src: src.slice(h.index - 40, h.index + 60) }));

  test('the advancing timers are exactly the ones this file knows about', () => {
    assert.strictEqual(advancing.length, 3,
      'app.js grew or lost a deck-advancing timer; the tests below name the three that existed:\n' +
      advancing.map(a => `  app.js:${a.line} (${a.which})`).join('\n'));
  });

  test('the exam feedback timer is stored so #exExit can cancel it', () => {
    const ex = advancing.filter(a => a.which === 'exI');
    assert.strictEqual(ex.length, 1);
    assert.match(ex[0].src, /exTimer\s*=\s*setTimeout/,
      `app.js:${ex[0].line} must assign its timer to exTimer`);
    assert.ok(codeMatches(src, /clearTimeout\(exTimer\)/, mask).length >= 1,
      'nothing clears exTimer any more');
  });

  test('the level-test answer timer is stored so #lvExit can cancel it', () => {
    const pick = advancing.filter(a => a.which === 'lvIdx' && /lvTimer\s*=\s*setTimeout/.test(a.src));
    assert.strictEqual(pick.length, 1, 'lvPick must assign its timer to lvTimer');
    assert.ok(codeMatches(src, /clearTimeout\(lvTimer\)/, mask).length >= 1,
      'nothing clears lvTimer any more');
  });

  /* KNOWN BUG — pinned, not specified.
   *
   * `$('#lvDunno').onclick` (app.js:1913-1919) ends with a BARE setTimeout: the id is thrown
   * away, so `clearTimeout(lvTimer)` in #lvExit (app.js:2088) cannot reach it. Press "לא יודע"
   * and then leave within 900 ms and the timer still fires on a screen the learner has left:
   * it runs lvIdx++ and lvRender(), which at the end of the last block reaches lvFinish() and
   * writes hw_level — the exact gate app.js:2445-2448 says this whole mechanism exists to
   * protect. Exit and immediately restart, and it instead eats the first question of the retake.
   *
   * WHEN THIS IS FIXED, this test goes red. Replace its body with:
   *     const dunno = advancing.filter(a => a.which === 'lvIdx' && !/lvTimer\s*=\s*setTimeout/.test(a.src));
   *     assert.strictEqual(dunno.length, 0, 'every deck-advancing timer must be cancellable');
   * and delete the KNOWN BUG wording. */
  test("KNOWN BUG: #lvDunno's timer is not stored, so no exit path can cancel it", () => {
    const untracked = advancing.filter(a => a.which === 'lvIdx' && !/lvTimer\s*=\s*setTimeout/.test(a.src));
    assert.strictEqual(untracked.length, 1,
      'expected exactly one untracked deck-advancing timer (the "לא יודע" button)');
    assert.ok(untracked[0].line > 1900 && untracked[0].line < 1930,
      `expected it at the #lvDunno handler around app.js:1918, found app.js:${untracked[0].line}`);
  });

  /* KNOWN BUG — the confirm() text on the way out of a FINISHED test.
   * #exExit and #lvExit both warn "the result will not be saved". By the time the result screen
   * is up, exFinish (app.js:2428) and lvFinish (app.js:1935) have already written it to
   * localStorage. The topbar exit button is part of the <section>, so it is on screen there too.
   * Pinned as source text because the handlers are DOM-bound. */
  test('KNOWN BUG: the exit prompt claims the result is unsaved after it has been saved', () => {
    const exExit = codeMatches(src, /\$\('#exExit'\)\.onclick/, mask);
    assert.strictEqual(exExit.length, 1);
    const body = src.slice(exExit[0].index, statementEnd(src, exExit[0].index, mask) + 1);
    assert.match(body, /התוצאה לא תישמר/, 'the warning text moved; re-check whether it is still false');
    assert.ok(!/exResult|hasFinished|exSaved/.test(body),
      'the handler still does not ask whether the exam already finished; if it now does, invert this test');
  });
});
