'use strict';
/* Lift named declarations out of app.js as source text, so they can be evaluated in a sandbox.
 *
 * Two forms are supported, because app.js uses both:
 *   function name(...) { ... }          -> returned verbatim
 *   const|let|var name = <expr>;        -> returned with the keyword rewritten to `var`
 *
 * `var` matters: inside a vm script, a `const` is a lexical binding that neither becomes a
 * property of the sandbox nor survives to the next script. This is the same problem
 * scratchpad/nite_v3.js worked around with `global.NIQ = ...` before eval-ing norm(). Rewriting
 * the real declaration is strictly better than restating its value: when someone widens the
 * niqqud range in app.js, the tests pick up the new range instead of quietly testing the old one.
 *
 * Anything not found throws immediately and by name. A missing symbol must never degrade into
 * a test that passes because it tested nothing.
 */

const { codeMask, matchBrace, statementEnd, codeMatches } = require('./scan.js');

function escapeName(n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function extractFunction(src, name, mask) {
  const hits = codeMatches(src, new RegExp('\\bfunction\\s+' + escapeName(name) + '\\s*\\('), mask);
  if (!hits.length) return null;
  if (hits.length > 1) throw new Error(`app.js declares function ${name} ${hits.length} times — extraction is ambiguous`);
  const start = hits[0].index;
  let open = src.indexOf('(', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {                       // walk the parameter list
    if (!mask[i]) continue;
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  let body = -1;
  for (let j = i; j < src.length; j++) if (mask[j] && src[j] === '{') { body = j; break; }
  if (body < 0) throw new Error(`could not find the body of function ${name} in app.js`);
  const end = matchBrace(src, body, mask);
  if (end < 0) throw new Error(`unbalanced braces in function ${name} in app.js`);
  return src.slice(start, end + 1);
}

function extractDecl(src, name, mask) {
  const hits = codeMatches(src, new RegExp('(?:^|[\\n;{}])\\s*(const|let|var)\\s+' + escapeName(name) + '\\s*='), mask);
  if (!hits.length) return null;
  if (hits.length > 1) throw new Error(`app.js declares ${name} ${hits.length} times — extraction is ambiguous`);
  const kw = hits[0].match[1];
  const start = src.indexOf(kw, hits[0].index);
  const end = statementEnd(src, start, mask);
  if (end < 0) throw new Error(`could not find the end of the ${name} declaration in app.js`);
  return 'var' + src.slice(start + kw.length, end + 1);
}

/* Pull a batch. `spec` is a list of names; each is tried as a function first, then a declaration. */
function extractAll(src, names) {
  const mask = codeMask(src);
  const out = [];
  const missing = [];
  for (const name of names) {
    const code = extractFunction(src, name, mask) || extractDecl(src, name, mask);
    if (!code) { missing.push(name); continue; }
    out.push({ name, code });
  }
  if (missing.length) {
    throw new Error(
      'app.js no longer declares: ' + missing.join(', ') +
      '\nThe test harness lifts these out of app.js by name. If one was renamed, moved into a\n' +
      'closure, or turned into a method, update tests/_harness/sandbox.js — do NOT delete the test.');
  }
  return out;
}

/* Lift a top-level `$('#id').onclick = …` statement as source text.
 *
 * app.js binds ~90 handlers this way, and some of the app's most consequential decisions live
 * only inside them — #lvExit deciding whether a pending timer still gets to write hw_level, for
 * one. extractFunction/extractDecl cannot reach those: the handler has no name. Same contract as
 * the two above — exactly one match, or throw by name. */
function extractHandler(src, id, mask = codeMask(src)) {
  const hits = codeMatches(src, new RegExp("\\$\\('#" + escapeName(id) + "'\\)\\.onclick\\s*="), mask);
  if (!hits.length) throw new Error(`app.js no longer binds a top-level onclick for #${id}`);
  if (hits.length > 1) throw new Error(`app.js binds #${id}.onclick ${hits.length} times — extraction is ambiguous`);
  const start = hits[0].index;
  const end = statementEnd(src, start, mask);
  if (end < 0) throw new Error(`could not find the end of the #${id} handler in app.js`);
  return src.slice(start, end + 1);
}

module.exports = { extractFunction, extractDecl, extractAll, extractHandler };
