'use strict';
/* Mutation testing for 800+ — the measurement that tells us what 175 green tests are worth.
 *
 * THE QUESTION THIS ANSWERS
 * -------------------------
 * "All tests pass" is not a statement about the app. It is a statement about the tests. A suite
 * that asserts nothing also passes. The only way to find out whether a suite would notice a real
 * bug is to introduce real bugs on purpose and count how many it notices.
 *
 * Each mutant is app.js with exactly ONE mechanical change: a `>` becomes `>=`, a `&&` becomes
 * `||`, a literal 0 becomes 1. Then `node tests/run.js` runs against it.
 *   suite goes red  -> KILLED   (the tests would have caught this bug)
 *   suite stays green -> SURVIVED (a hole, with a line number)
 *
 * WHY ONLY THE LIFTED SYMBOLS ARE MUTATED
 * ---------------------------------------
 * tests/_harness/sandbox.js does not load app.js against a DOM; it lifts named top-level symbols
 * into a vm. Code outside those symbols is unreachable from the suite by construction, so
 * mutating it would produce guaranteed survivors and a score dominated by a gap we already know
 * about. That gap is reported separately, as a share of app.js, instead of being smuggled into
 * the score.
 *
 * THREE OUTCOMES, NOT TWO
 * -----------------------
 * A mutant that no longer parses is excluded, not counted as killed. Otherwise the score inflates
 * on syntax errors, which is the classic way to make this number lie. INVALID and TIMEOUT are
 * reported separately and the score is killed / (killed + survived).
 *
 * SURVIVORS ARE THE PRODUCT, NOT THE SCORE
 * ----------------------------------------
 * Some survivors are equivalent mutants — a change that genuinely cannot alter behaviour (a
 * boundary that is unreachable, a default that is always overwritten). Those are not holes. The
 * survivor list has to be read by hand; the number is only the headline.
 *
 * FROZEN SNAPSHOT
 * ---------------
 * Everything runs against a copy taken at snapshot time, never the live tree. The baseline has to
 * mean "what the suite caught as of this moment" even while other work adds test files. Re-running
 * with the same mutants.json after new tests land gives the delta, which is the whole point.
 *
 *   node scripts/mutate.js snapshot          freeze app.js + data + tests into .mut/base
 *   node scripts/mutate.js plan [n]          generate the mutant list (default 500)
 *   node scripts/mutate.js run [label]       run every mutant, write the report
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { codeMask, matchBrace, statementEnd, codeMatches } = require('../tests/_harness/scan.js');
const { SYMBOLS } = require('../tests/_harness/sandbox.js');

const ROOT = path.join(__dirname, '..');
/* ⚠ הכלי עבר מ-scratchpad/ ל-scripts/ ב-11.8.2026 כדי שיהיה במעקב git —
   scratchpad/ ב-.gitignore, ותיקון שנעשה בו ב-בדק בית 3 היה נאבד.
   אבל **הדאטה נשאר במקומו**: .mut מחזיק תצלומים ועצי עבודה במשקל מאות
   מגה-בייט, ומקומו מחוץ למעקב. לכן הוא נתלה בשורש ולא ב-__dirname. */
const MUT = path.join(ROOT, 'scratchpad', '.mut');
const PLAN = path.join(MUT, 'mutants.json');
/* The snapshot directory is nameable so the SAME mutants can be re-run against a later suite.
 * `base` is the frozen 175-test tree; `after` is whatever the suite has grown into. Both point at
 * a byte-identical app.js — the offsets in mutants.json are absolute, so a single edited character
 * in app.js would silently shift every mutation site. Verify the hash before trusting a delta. */
const BASE = path.join(MUT, process.env.MUT_BASE || 'base');

const WORKERS = Math.max(2, Math.min(8, os.cpus().length - 1));
const TIMEOUT_MS = 60000;

/* ---------------------------------------------------------------- snapshot */

function copyInto(dst) {
  fs.mkdirSync(dst, { recursive: true });
  /* Every file the suite reads, not just the ones it lifts from. 00-harness.test.js brace-checks
   * config.js and both leveltest files; 08/10/13/15 read index.html for markup and CSS. A missing
   * one reads as a red CONTROL run, which aborts before a single mutant is measured — the failure
   * mode is loud, but it costs a full setup to discover, so the list is kept complete here.
   * index.html was missing until 2.8.2026 and cost exactly that. */
  /* 11.8.2026 — הרשימה הידנית נכשלה שוב, בדיוק כפי שההערה מעליה מתארת. מאז 2.8 נוספו
     data-sent-en.js, data-en-sentences.js, ובדיקות שקוראות את manifest.webmanifest, את
     האייקונים ואת הפונטים (13-sw בודקת שכל נכס ב-precache קיים בדיסק). ה-CONTROL האדום
     שקיבלתי הוא בדיוק הכשל שההערה מזהירה ממנו — פעם שנייה, מאותה סיבה.
     לכן במקום להאריך את הרשימה: נסרקים כל קובצי השורש מהסוגים שהחבילה קוראת, ועוד
     fonts/. רשימה שנגזרת מהדיסק אינה יכולה לפגר אחרי קובץ חדש. */
  const KEEP = /\.(js|html|webmanifest|json|png|svg|txt)$/i;
  for (const f of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!f.isFile() || !KEEP.test(f.name)) continue;
    fs.copyFileSync(path.join(ROOT, f.name), path.join(dst, f.name));
  }
  for (const d of ['fonts', 'tests']) {
    const src = path.join(ROOT, d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dst, d), { recursive: true });
  }
}

function snapshot() {
  fs.rmSync(BASE, { recursive: true, force: true });
  copyInto(BASE);
  const n = fs.readdirSync(path.join(BASE, 'tests')).filter(f => f.endsWith('.test.js')).length;
  console.log(`snapshot -> ${BASE}  (${n} test files)`);
}

/* ------------------------------------------------- the testable line ranges
 * Same location logic as tests/_harness/extract.js, but returning offsets instead of text.
 * Kept in step with it by construction: both walk the same mask with the same brace matcher. */

function rangeOfFunction(src, name, mask) {
  const hits = codeMatches(src, new RegExp('\\bfunction\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\('), mask);
  if (hits.length !== 1) return null;
  const start = hits[0].index;
  let open = src.indexOf('(', start), depth = 0, i = open;
  for (; i < src.length; i++) {
    if (!mask[i]) continue;
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  let body = -1;
  for (let j = i; j < src.length; j++) if (mask[j] && src[j] === '{') { body = j; break; }
  if (body < 0) return null;
  const end = matchBrace(src, body, mask);
  return end < 0 ? null : [start, end];
}

function rangeOfDecl(src, name, mask) {
  const hits = codeMatches(src, new RegExp('(?:^|[\\n;{}])\\s*(const|let|var)\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*='), mask);
  if (hits.length !== 1) return null;
  const kw = hits[0].match[1];
  const start = src.indexOf(kw, hits[0].index);
  const end = statementEnd(src, start, mask);
  return end < 0 ? null : [start, end];
}

function testableRanges(src, mask) {
  const out = [];
  for (const name of SYMBOLS) {
    const r = rangeOfFunction(src, name, mask) || rangeOfDecl(src, name, mask);
    if (r) out.push({ name, from: r[0], to: r[1] });
  }
  return out.sort((a, b) => a.from - b.from);
}

/* ----------------------------------------------------------------- mutators
 * Every operator is textual and length-preserving where it can be, so offsets stay readable.
 * `find` returns [offset, matchedText]; `to` is the replacement. Order matters: the longer
 * operators are listed first so `===` is never matched as `==`. */

const OPS = [
  // equality — the single most common place an off-by-one intent hides
  { id: 'eq',   from: '===', to: '!==' },
  { id: 'eq',   from: '!==', to: '===' },
  // relational boundaries
  { id: 'rel',  from: '>=',  to: '>'   },
  { id: 'rel',  from: '<=',  to: '<'   },
  // logical connectives
  { id: 'log',  from: '&&',  to: '||'  },
  { id: 'log',  from: '||',  to: '&&'  },
  // increment direction
  { id: 'inc',  from: '++',  to: '--'  },
];

/* Single-character operators need a guard so they are not part of a two-character one. */
const CHAR_OPS = [
  { id: 'rel', ch: '>', to: '>=', bad: ['=', '>', '-'] },   // =>, >=, >>, ->
  { id: 'rel', ch: '<', to: '<=', bad: ['=', '<', '!'] },   // <=, <<, <!
  { id: 'ari', ch: '+', to: '-',  bad: ['+', '='] },
  { id: 'ari', ch: '-', to: '+',  bad: ['-', '=', '>'] },
  { id: 'ari', ch: '*', to: '/',  bad: ['*', '=', '/'] },
];

const WORD_OPS = [
  { id: 'bool', from: 'true',  to: 'false' },
  { id: 'bool', from: 'false', to: 'true'  },
];

function inRanges(ranges, i) {
  for (const r of ranges) if (i >= r.from && i <= r.to) return r.name;
  return null;
}

function isWordChar(c) { return c && /[A-Za-z0-9_$]/.test(c); }

function sites(src, mask, ranges) {
  const out = [];
  const add = (i, len, to, id, sym) => out.push({ i, len, to, id, sym, was: src.substr(i, len) });

  for (let i = 0; i < src.length; i++) {
    if (!mask[i]) continue;
    const sym = inRanges(ranges, i);
    if (!sym) continue;

    // two-character operators
    let hit = false;
    for (const op of OPS) {
      if (src.startsWith(op.from, i)) {
        // `>=` inside `>>=` etc. is not reached because mask/order handle it; guard `=` after
        if (src[i + op.from.length] === '=') break;
        add(i, op.from.length, op.to, op.id, sym);
        i += op.from.length - 1; hit = true; break;
      }
    }
    if (hit) continue;

    // single-character operators
    for (const op of CHAR_OPS) {
      if (src[i] !== op.ch) continue;
      if (op.bad.includes(src[i + 1]) || op.bad.includes(src[i - 1])) break;
      if (src[i + 1] === '=') break;
      add(i, 1, op.to, op.id, sym);
      hit = true; break;
    }
    if (hit) continue;

    // keywords
    for (const op of WORD_OPS) {
      if (!src.startsWith(op.from, i)) continue;
      if (isWordChar(src[i - 1]) || isWordChar(src[i + op.from.length])) break;
      add(i, op.from.length, op.to, op.id, sym);
      i += op.from.length - 1; hit = true; break;
    }
    if (hit) continue;

    // numeric literals: n -> n+1, and 1 -> 0 so "off by one in the other direction" is covered
    if (/[0-9]/.test(src[i]) && !isWordChar(src[i - 1]) && src[i - 1] !== '.') {
      let j = i; while (/[0-9]/.test(src[j])) j++;
      if (src[j] !== '.' && !isWordChar(src[j])) {
        const lit = src.slice(i, j);
        if (lit.length <= 6) add(i, lit.length, lit === '1' ? '0' : String(Number(lit) + 1), 'num', sym);
        i = j - 1;
      }
    }
  }
  return out;
}

function lineOf(src, i) { return src.slice(0, i).split('\n').length; }

function plan(want) {
  const src = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');
  const mask = codeMask(src);
  const ranges = testableRanges(src, mask);
  const all = sites(src, mask, ranges);

  const covered = ranges.reduce((n, r) => n + (r.to - r.from + 1), 0);
  const share = (100 * covered / src.length).toFixed(1);

  /* Deterministic stratified sample: every k-th site, so re-running after new tests land uses
   * the identical mutants and the delta is a like-for-like comparison. No randomness anywhere. */
  const k = Math.max(1, Math.floor(all.length / want));
  const picked = all.filter((_, idx) => idx % k === 0).slice(0, want);

  const out = {
    generatedFrom: 'base snapshot',
    appLines: src.split('\n').length,
    liftedSymbols: ranges.length,
    testableCharShare: share,
    totalSites: all.length,
    mutants: picked.map((s, n) => ({
      id: n, i: s.i, len: s.len, was: s.was, to: s.to, op: s.id, sym: s.sym, line: lineOf(src, s.i),
    })),
  };
  fs.writeFileSync(PLAN, JSON.stringify(out, null, 1));
  console.log(`app.js: ${out.appLines} lines · ${ranges.length} lifted symbols cover ${share}% of the file`);
  console.log(`${all.length} mutation sites in reachable code -> sampled ${picked.length} (every ${k}th)`);
  const byOp = {};
  for (const m of out.mutants) byOp[m.op] = (byOp[m.op] || 0) + 1;
  console.log('by operator:', byOp);
}

/* --------------------------------------------------------------------- run */

function runOne(dir, cb) {
  execFile(process.execPath, [path.join(dir, 'tests', 'run.js')],
    { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    (err, stdout, stderr) => cb(err, (stdout || '') + (stderr || '')));
}

const INVALID = /SyntaxError|lifting .* out of app\.js failed|lifted from app\.js but undefined|no longer declares|Unexpected token|Invalid regular expression/;

async function run(label) {
  const spec = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  const src = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');

  // one working copy per worker
  const dirs = [];
  for (let w = 0; w < WORKERS; w++) {
    const d = path.join(MUT, 'w' + w);
    fs.rmSync(d, { recursive: true, force: true });
    fs.cpSync(BASE, d, { recursive: true });
    dirs.push(d);
  }

  // sanity: the unmutated snapshot must be green, or every result below is meaningless
  await new Promise((res, rej) => runOne(dirs[0], (err, out) => {
    if (err) { console.error(out.slice(-3000)); rej(new Error('the UNMUTATED snapshot is not green — aborting')); }
    else { console.log('control run: ' + (out.match(/PASS — .*/) || ['?'])[0]); res(); }
  }));

  const results = new Array(spec.mutants.length);
  let next = 0, done = 0;
  const t0 = Date.now();

  await Promise.all(dirs.map((dir, w) => new Promise(resolve => {
    const step = () => {
      const idx = next++;
      if (idx >= spec.mutants.length) return resolve();
      const m = spec.mutants[idx];
      const mutated = src.slice(0, m.i) + m.to + src.slice(m.i + m.len);
      fs.writeFileSync(path.join(dir, 'app.js'), mutated);
      runOne(dir, (err, out) => {
        let verdict;
        if (err && err.killed) verdict = 'timeout';
        else if (INVALID.test(out)) verdict = 'invalid';
        else if (err) verdict = 'killed';
        else verdict = 'survived';
        results[idx] = { ...m, verdict };
        done++;
        if (done % 25 === 0 || done === spec.mutants.length) {
          const el = (Date.now() - t0) / 1000;
          const rate = done / el;
          process.stdout.write(`  ${done}/${spec.mutants.length}  ${el.toFixed(0)}s  eta ${((spec.mutants.length - done) / rate).toFixed(0)}s\n`);
        }
        step();
      });
    };
    step();
  })));

  const by = v => results.filter(r => r.verdict === v);
  const killed = by('killed').length + by('timeout').length;
  const survived = by('survived').length;
  const invalid = by('invalid').length;
  const score = killed + survived === 0 ? 0 : (100 * killed / (killed + survived));

  const stamp = label || 'run';
  fs.writeFileSync(path.join(MUT, `results-${stamp}.json`), JSON.stringify({ spec: { ...spec, mutants: undefined }, score, killed, survived, invalid, results }, null, 1));

  console.log('\n' + '='.repeat(72));
  console.log(`MUTATION SCORE: ${score.toFixed(1)}%   (${killed} killed / ${killed + survived} valid mutants)`);
  console.log(`survived: ${survived}    invalid (excluded): ${invalid}`);
  console.log('='.repeat(72));

  // survivors grouped by the symbol they live in — that is the actionable shape
  const bySym = {};
  for (const r of by('survived')) (bySym[r.sym] = bySym[r.sym] || []).push(r);
  const rows = Object.entries(bySym).sort((a, b) => b[1].length - a[1].length);
  console.log('\nSURVIVORS BY SYMBOL (each one is a change no test noticed):');
  for (const [sym, list] of rows) {
    console.log(`\n  ${sym}  — ${list.length}`);
    for (const r of list.slice(0, 12)) console.log(`      app.js:${r.line}  ${r.was}  ->  ${r.to}`);
    if (list.length > 12) console.log(`      … ${list.length - 12} more`);
  }
  const clean = SYMBOLS.filter(s => !bySym[s] && results.some(r => r.sym === s));
  console.log(`\nSymbols with NO survivors (every mutation caught): ${clean.length}/${new Set(results.map(r => r.sym)).size}`);
  console.log(clean.join(', ') || '(none)');
}

const [, , cmd, arg] = process.argv;
if (cmd === 'snapshot') snapshot();
else if (cmd === 'plan') plan(Number(arg) || 500);
else if (cmd === 'run') run(arg).catch(e => { console.error(String(e.message || e)); process.exit(1); });
else console.log('usage: node scripts/mutate.js snapshot | plan [n] | run [label]');
