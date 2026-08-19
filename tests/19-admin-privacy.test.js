'use strict';
/* THE PROMISE IN THE PRIVACY POLICY, AS AN EXECUTABLE TEST.
 *
 * The policy says the service owner "does not see the content of your private associations".
 * An association is something the learner wrote for themselves, on the assumption nobody would
 * read it — the most personal thing in the whole store. store.js used to hand the admin panel
 * `select('lang,data,updated_at')`, and `data` is the entire blob:
 *
 *     { assoc, stats, deleted, added, dir, extras }
 *
 * so every association and every word the learner added with their own gloss crossed the wire
 * into an admin screen, on every panel load. The panel never displayed any of it — it reads
 * `stats` and nothing else — but "we don't render it" is not the promise that was made. The
 * promise was that it is not seen, and a row that arrives in the browser has been seen.
 *
 * These tests assert on the *columns actually requested*, not on what the panel renders, because
 * the projection is where the promise is kept or broken. A test that only checked the rendered
 * numbers would stay green while the whole blob was shipped.
 *
 * `added` is excluded along with `assoc` deliberately. The policy allows the owner to know how
 * much you practised; a word the learner typed in, together with the meaning they wrote for it,
 * is writing, not a count. Nothing in the panel ever used it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadStore, ROOT } = require('./_harness/fakeSupabase.js');
const { codeMask, codeMatches } = require('./_harness/scan.js');
const { extractFunction } = require('./_harness/extract.js');

/* The shape a real row has. If the query asked for the whole blob, this is what would arrive. */
const FULL_BLOB = {
  stats: { words: { שיח: { level: 4, seen: 3 }, קטן: { level: 5, seen: 1, src: 'lv' } },
           sessions: [{ t: 1700000000000 }, { t: 1700000900000 }] },
  assoc: { שיח: 'נשמע כמו SHEE-akh, שיחה עם סבתא בגינה' },
  added: { ורבליזציה: 'מילה שהמצאתי, ההסבר הפרטי שלי' },
  deleted: ['מילה שמחקתי'],
  dir: 'he',
  extras: { note: 'פרטי' },
};

function progressCall(respond) {
  const s = loadStore({ respond: { 'progress.select': respond } });
  return s;
}

test('adminUserProgress does not ask the cloud for the association blob', async () => {
  const s = progressCall({ data: [{ lang: 'he', updated_at: '2026-01-01T00:00:00Z', stats: FULL_BLOB.stats }] });
  await s.Store.adminUserProgress('u-9');

  const op = s.calls.find(c => c.table === 'progress' && c.verb === 'select');
  assert.ok(op, 'adminUserProgress issued no read at all');

  const cols = String(op.columns || '').split(',').map(c => c.trim()).filter(Boolean);
  assert.ok(cols.length, 'adminUserProgress asked for no columns — that means "*", the whole row');

  /* The bare column `data` is the blob. `data->stats` is a projection of one key out of it and
     is what we want; `data` alone, or `*`, is not. */
  const bare = cols.filter(c => /(^|:)\s*data\s*$/.test(c) || c === '*');
  assert.deepStrictEqual(bare, [],
    'the admin read still pulls the whole `data` blob (' + op.columns + ') — that blob contains ' +
    '`assoc`, the learner\'s own associations, which the privacy policy promises are never seen');
});

test('the admin read pulls stats, and nothing else the learner wrote', async () => {
  const s = progressCall({ data: [] });
  await s.Store.adminUserProgress('u-9');
  const cols = String(s.calls[0].columns || '');

  assert.match(cols, /data->stats/, 'stats must still be pulled — the panel counts practice from it');
  for (const secret of ['assoc', 'added', 'extras', 'deleted']) {
    assert.ok(!new RegExp('data\\s*->>?\\s*' + secret).test(cols),
      `the admin read asks for data->${secret}; that is the learner's own writing, not a count`);
  }
});

test('the read is still scoped to the one user being inspected', async () => {
  const s = progressCall({ data: [] });
  await s.Store.adminUserProgress('u-9');
  assert.deepStrictEqual(s.calls[0].filters, [['eq', 'user_id', 'u-9']]);
});

test('a returned row carries the counts the panel needs and no prose', async () => {
  const s = progressCall({ data: [{ lang: 'he', updated_at: '2026-01-01T00:00:00Z', stats: FULL_BLOB.stats }] });
  const { rows } = await s.Store.adminUserProgress('u-9');
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(r.lang, 'he');
  assert.ok(r.updated_at, 'updated_at drives the "last activity" column');
  assert.ok(r.stats && r.stats.words, 'the panel counts practised words out of stats.words');
  assert.strictEqual(r.assoc, undefined);
  assert.strictEqual(r.added, undefined);
  assert.strictEqual(JSON.stringify(rows).includes('נשמע כמו'), false,
    'an association came back from an admin read');
});

test('a failed read is reported as a failure, not as "no progress"', async () => {
  /* 08-store.test.js owns the shape; repeated here because the projection change is the kind of
     edit that quietly reintroduces `return data || []` on an error path, and this file is the one
     that gets edited when the projected columns change. */
  const s = progressCall({ data: null, error: { code: '42501', message: 'rls' } });
  const r = await s.Store.adminUserProgress('u-9');
  assert.ok(r && r.error, 'the RLS refusal was swallowed · the panel will count this learner as "never practised"');
});

/* ---- the other side of the seam: the panel must read what is now sent ---- */

test('the admin panel reads stats off the projected row, not off a blob', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const code = extractFunction(src, 'openAdmin', codeMask(src));
  assert.ok(code, 'app.js no longer declares openAdmin — update this test, do not delete it');
  /* Matched against real code only — a comment may legitimately mention p.data to explain
     why it is gone, and a comment is not a read. */
  const mask = codeMask(code);
  assert.ok(codeMatches(code, /adminUserProgress/, mask).length, 'openAdmin no longer calls adminUserProgress');
  assert.strictEqual(codeMatches(code, /\bp\.data\b/, mask).length, 0,
    'openAdmin still reads p.data — that field is no longer sent, so every count would read 0');
  assert.ok(codeMatches(code, /\bp\.stats\b/, mask).length,
    'openAdmin must read the projected `stats` field');
});

/* The three cards on the panel are the only numbers anybody reads daily, and both ways they
   were wrong were invisible from the screen · a rolling 24h window labelled "today", and a
   dropped request counted as a person who never practised. Source-level because openAdmin
   needs a live Supabase to execute, which is the same reason this file already inspects it
   rather than running it. A source guard is weaker than a run, and it is what is available. */
test('the glance counts by calendar day, not by a rolling window', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const code = extractFunction(src, 'openAdmin', codeMask(src));
  assert.ok(code, 'app.js no longer declares openAdmin — update this test, do not delete it');
  const mask = codeMask(code);
  assert.ok(codeMatches(code, /setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/, mask).length,
    '"today" is not anchored to midnight — it is a rolling window again, and a round from last night counts as today');
  assert.ok(codeMatches(code, /getDay\(\)/, mask).length,
    '"this week" does not start on Sunday — it is a rolling 168 hours again');
  assert.strictEqual(codeMatches(code, /now\s*-\s*u\.lastRound/, mask).length, 0,
    'the rolling-window comparison is back');
});

test('a learner whose progress failed to load is not counted as "never practised"', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const code = extractFunction(src, 'openAdmin', codeMask(src));
  const mask = codeMask(code);
  assert.ok(codeMatches(code, /readFailed/, mask).length,
    'openAdmin no longer tracks failed reads — a dropped request is being counted as a person');
  const never = codeMatches(code, /never:[^\n]*/, mask).map(h => h.match[0]).join(' ');
  assert.ok(/readFailed/.test(never),
    'the "never practised" count does not exclude failed reads: ' + never);
});

test('no other admin query pulls the progress blob', () => {
  const src = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
  const mask = codeMask(src);
  const bare = [];
  const re = /from\(\s*'progress'\s*\)\s*\.select\(\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) {
    if (!mask[m.index]) continue;                   // mask is 1 on real code, 0 in comments
    const cols = m[1].split(',').map(c => c.trim());
    if (cols.includes('data') || cols.includes('*')) bare.push({ at: m.index, cols: m[1] });
  }
  /* pullProgress legitimately pulls the whole blob — it is the learner reading their own row,
     under their own token. Every such read must be inside a function named pullProgress. */
  for (const b of bare) {
    const before = src.slice(0, b.at);
    const fn = (before.match(/async\s+([A-Za-z0-9_]+)\s*\(/g) || []).pop() || '';
    assert.ok(/pullProgress/.test(fn),
      `a query in ${fn.trim()} selects the whole progress blob (${b.cols}); only the learner ` +
      `reading their own row (pullProgress) may do that`);
  }
});
