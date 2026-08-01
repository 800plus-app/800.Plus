'use strict';
/* The service worker's one security decision: which requests it is allowed to touch at all.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * House-check 2, finding #2. The fetch handler filtered on method and protocol and nothing else,
 * and `cacheable` explicitly accepted `res.type === 'cors'` — so every authenticated GET to
 * Supabase was stored and replayed. The cache key is the URL; the Authorization header is not
 * part of it, and the live server returns 200 with no `Vary`. Proven in a real browser during the
 * check: a read with token A was cached, and a read with token B to the same URL got A's answer.
 * `GET /auth/v1/user` is the same URL for every person alive.
 *
 * WHY A NAMED FUNCTION RATHER THAN A CONDITION INSIDE THE HANDLER
 * --------------------------------------------------------------
 * The rule could have been one more `if` in the middle of `addEventListener('fetch', …)`. It is a
 * lifted top-level function instead because that is the only shape this suite can test: the
 * handler needs FetchEvent, Request, Response, CacheStorage and clients, and a stub of all five
 * is a stub that will drift. `swHandles` is a pure function of a URL, so the rule that keeps user
 * data out of the cache is checked on every run rather than believed.
 *
 * The lifting is the same mechanism tests/_harness/extract.js uses on app.js, pointed at sw.js:
 * if the function is renamed or inlined, this fails by name instead of passing vacuously.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractAll } = require('./_harness/extract.js');
const { ROOT } = require('./_harness/sandbox.js');

const SW = path.join(ROOT, 'sw.js');
const src = fs.readFileSync(SW, 'utf8');

const ctx = vm.createContext({ URL });
for (const { code } of extractAll(src, ['swHandles'])) vm.runInContext(code, ctx);

const APP = 'https://800-plus.com';
const handles = (u, origin = APP) => ctx.swHandles(new URL(u), origin);

describe('sw — the worker only ever touches its own origin', () => {
  /* The finding itself. Every one of these is a real URL the app requests while signed in. */
  const SUPABASE = 'https://oycypbnzcvtjliovfsxn.supabase.co';
  const foreign = [
    [`${SUPABASE}/rest/v1/progress?select=*&user_id=eq.abc`, 'the progress row — one user\'s whole history'],
    [`${SUPABASE}/auth/v1/user`, 'IDENTICAL url for every user alive — the worst possible cache key'],
    [`${SUPABASE}/rest/v1/profiles?select=*`, 'names and email addresses'],
    [`${SUPABASE}/rest/v1/assoc_shared?select=*`, 'other people\'s private associations'],
    ['https://esm.sh/anything.js', 'any third party at all'],
  ];

  for (const [url, why] of foreign) {
    test(`refuses ${new URL(url).host}${new URL(url).pathname} — ${why}`, () => {
      assert.strictEqual(handles(url), false,
        `the worker would cache and replay this. It is served on URL alone: the Authorization\n` +
        `header is not part of the cache key, and the response carries no Vary. Two different\n` +
        `signed-in users hitting this URL get whichever answer arrived first.`);
    });
  }

  test('our own assets are still handled — the fix must not turn the app into a non-PWA', () => {
    const ours = ['/', '/index.html', '/app.js?v=116', '/data.js?v=116', '/icon-192.png',
      '/manifest.webmanifest', '/store.js?v=116'];
    const refused = ours.filter(p => handles(APP + p) !== true);
    assert.deepStrictEqual(refused, [],
      'the whole point of the worker is to serve these offline; refusing them breaks the install');
  });

  test('a foreign host that merely starts with our own name is still foreign', () => {
    // 800-plus.com.evil.example is a different origin however much it reads like ours
    assert.strictEqual(handles('https://800-plus.com.evil.example/steal'), false);
    assert.strictEqual(handles('https://evil.example/?x=https://800-plus.com'), false);
  });

  test('a different scheme or port on our own host is a different origin', () => {
    assert.strictEqual(handles('http://800-plus.com/app.js'), false, 'http vs https is a different origin');
    assert.strictEqual(handles('https://800-plus.com:8443/app.js'), false, 'a different port is a different origin');
  });

  test('extension and data schemes are never touched', () => {
    for (const u of ['chrome-extension://abc/x.js', 'data:text/plain,hello', 'blob:https://800-plus.com/abc']) {
      assert.strictEqual(handles(u), false, u + ' should never reach the worker\'s cache');
    }
  });

  /* localhost matters: the whole verification workflow runs there, and a rule that only works in
   * production is a rule nobody can check before deploying. */
  test('the rule is about the origin it runs on, not about a hardcoded domain', () => {
    const local = 'http://localhost:8000';
    assert.strictEqual(handles(local + '/app.js', local), true);
    assert.strictEqual(handles(APP + '/app.js', local), false,
      'running on localhost, the production host is foreign — the check must read the live origin');
  });
});

describe('sw — the rest of the file still agrees with itself', () => {
  /* REV names both the cache and every ?v= string. These two have drifted before, and the failure
   * is invisible online and a white screen offline. */
  test('every ?v= in sw.js matches REV', () => {
    const rev = (src.match(/const REV\s*=\s*'([^']+)'/) || [])[1];
    assert.ok(rev, 'REV is no longer a simple string literal in sw.js');
    const bad = [...src.matchAll(/\?v=(\d+)/g)].map(m => m[1]).filter(v => v !== rev);
    assert.deepStrictEqual(bad, [], `hardcoded ?v= values that do not match REV=${rev}`);
  });
});
