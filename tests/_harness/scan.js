'use strict';
/* A small, honest JavaScript scanner.
 *
 * WHY THIS EXISTS. app.js is a browser script with no exports, and the only way to test its
 * functions from node is to lift their source text out of the file and evaluate it. Lifting by
 * counting `{` and `}` naively — the way scratchpad/nite_v1.js does — works today only by luck:
 * it counts braces that live inside strings, regexes, comments and template literals too. It
 * happens to survive because every such brace in app.js is currently balanced. The first time
 * someone writes /\{/ or '}' the extraction would silently return the wrong slice of the file,
 * and every test built on it would go green against code that was never run.
 *
 * So: build a mask of which characters are really CODE, and match braces only over those.
 * The mask is validated against the whole file by tests/00-harness.test.js — if a future edit
 * introduces syntax this scanner mishandles, the brace total stops being zero and that test
 * goes red, loudly, instead of the suite quietly testing nothing.
 */

const IDENT = /[A-Za-z0-9_$]/;
/* After one of these, a `/` opens a regex rather than dividing. */
const KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw']);

function skipQuoted(src, i) {
  const q = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === q) return i + 1;
    if (src[i] === '\n') return i;        // unterminated: bail rather than eat the rest of the file
    i++;
  }
  return i;
}

function skipRegex(src, i) {
  i++;                                     // past the opening /
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '\n') return i;              // not a regex after all
    if (inClass) { if (c === ']') inClass = false; }
    else if (c === '[') inClass = true;
    else if (c === '/') { i++; while (i < src.length && /[a-z]/.test(src[i])) i++; return i; }
    i++;
  }
  return i;
}

/* Is the `/` at this position the start of a regex literal, given the last significant char? */
function regexStarts(src, prevSig, prevWasValue) {
  if (prevSig < 0) return true;            // start of file / start of a ${ } expression
  if (prevWasValue) return false;          // 'abc'/2, foo()/2, x/2  -> division
  const c = src[prevSig];
  if (c === ')' || c === ']') return false;
  if (IDENT.test(c)) {                     // identifier or number: division, unless it's a keyword
    let s = prevSig;
    while (s >= 0 && IDENT.test(src[s])) s--;
    return KEYWORDS.has(src.slice(s + 1, prevSig + 1));
  }
  return true;                             // after ( , = : { } ; ! & | ? + - * % ~ ^ < > => etc.
}

/* mask[i] === 1  <=>  src[i] is executable code, not a string/regex/comment/template body. */
function codeMask(src) {
  const n = src.length;
  const mask = new Uint8Array(n);
  const tmpl = [];                         // one frame per open template literal
  let i = 0, prevSig = -1, prevWasValue = false;

  while (i < n) {
    const top = tmpl.length ? tmpl[tmpl.length - 1] : null;

    if (top && top.raw) {                  // inside the literal text of a template
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { tmpl.pop(); i++; prevSig = i - 1; prevWasValue = true; continue; }
      if (c === '$' && src[i + 1] === '{') { top.raw = false; top.depth = 1; i += 2; prevSig = -1; prevWasValue = false; continue; }
      i++; continue;
    }

    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'") { i = skipQuoted(src, i); prevSig = i - 1; prevWasValue = true; continue; }
    if (c === '`') { tmpl.push({ raw: true, depth: 0 }); i++; continue; }
    if (c === '/' && regexStarts(src, prevSig, prevWasValue)) { i = skipRegex(src, i); prevSig = i - 1; prevWasValue = true; continue; }

    if (top && !top.raw) {                 // track the ${ } expression's own braces
      if (c === '{') top.depth++;
      else if (c === '}') {
        top.depth--;
        if (top.depth === 0) { top.raw = true; i++; prevSig = -1; prevWasValue = false; continue; }
      }
    }

    mask[i] = 1;
    if (!/\s/.test(c)) { prevSig = i; prevWasValue = IDENT.test(c) || c === ')' || c === ']'; }
    i++;
  }
  return mask;
}

/* Net brace balance over code positions only. Should be 0 for a well-formed file. */
function braceBalance(src, mask = codeMask(src)) {
  let d = 0, min = 0;
  for (let i = 0; i < src.length; i++) {
    if (!mask[i]) continue;
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d < min) min = d; }
  }
  return { net: d, min };
}

/* Index of the `}` that closes the `{` at `open`. */
function matchBrace(src, open, mask) {
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (!mask[i]) continue;
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}

/* End of a single statement starting at `from`: the `;` at nesting depth 0. */
function statementEnd(src, from, mask) {
  let d = 0;
  for (let i = from; i < src.length; i++) {
    if (!mask[i]) continue;
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
    else if (c === ';' && d === 0) return i;
  }
  return -1;
}

/* All indexes where `re` matches AND the match starts at a code position. */
function codeMatches(src, re, mask) {
  const out = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(src))) {
    const at = m.index + (m[0].length - m[0].replace(/^[\s\n]+/, '').length);
    if (mask[at]) out.push({ index: m.index, at, match: m });
    if (m.index === rx.lastIndex) rx.lastIndex++;
  }
  return out;
}

module.exports = { codeMask, braceBalance, matchBrace, statementEnd, codeMatches };
