'use strict';
/* THE one command:   node tests/run.js
 *
 * Why a runner script rather than telling people to type `node --test "tests/**\/*.test.js"`:
 * that command is not the same in every shell. PowerShell, cmd and bash disagree about quoting
 * and about whether the glob is expanded before node sees it, and the failure mode when they
 * disagree is "0 tests, exit 0" -- a green run that tested nothing. Discovery happens here, in
 * JavaScript, where it behaves the same everywhere.
 *
 * Exit code is 0 only if every test passed AND at least one test ran.
 */

const fs = require('fs');
const path = require('path');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

const DIR = __dirname;
const files = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.test.js'))
  .sort()
  .map(f => path.join(DIR, f));

if (files.length === 0) {
  console.error('No *.test.js files found in ' + DIR + ' — refusing to report success.');
  process.exit(1);
}

let passed = 0, failed = 0;
const failures = [];
const isSuite = e => !!(e.details && e.details.type === 'suite');   // suites re-report their children

const stream = run({ files, concurrency: true });

stream.on('test:pass', e => { if (!isSuite(e)) passed++; });
stream.on('test:fail', e => {
  if (isSuite(e)) return;
  failed++;
  // line number included: the same test name runs twice (once per language) in 02-bank
  failures.push(`${path.basename(e.file || '?')}:${e.line || '?'} › ${e.name}`);
  process.exitCode = 1;                       // set at the moment of failure, not at the end
});

stream.compose(spec).pipe(process.stdout);

process.on('exit', () => {
  const line = '='.repeat(72);
  process.stdout.write(`\n${line}\n`);
  if (passed + failed === 0) {
    process.stdout.write(`NO TESTS RAN — treating that as a failure\n${line}\n`);
    return;
  }
  if (failed === 0) {
    process.stdout.write(`PASS — ${passed} tests, 0 failures (${files.length} files)\n${line}\n`);
  } else {
    process.stdout.write(`FAIL — ${failed} failing of ${passed + failed} tests (${files.length} files)\n\n`);
    for (const f of failures) process.stdout.write(`  x ${f}\n`);
    process.stdout.write(`\nEach failure above is a finding about the app or the data, not a\n`);
    process.stdout.write(`flaky test. See tests/README.md for the ones that are already known.\n${line}\n`);
  }
});

/* A run that discovered files but executed nothing is a failure, not a pass. */
stream.on('end', () => { if (passed + failed === 0) process.exitCode = 1; });
