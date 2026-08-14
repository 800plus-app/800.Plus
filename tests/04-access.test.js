'use strict';
/* The access gate.
 *
 * hasAccess() is one function with seven branches and it decides whether a paying customer can
 * open the app. Both failure directions are expensive and neither raises anything: locking
 * someone who paid is a refund claim under חוק הגנת הצרכן, and unlocking someone who did not is
 * revenue quietly walking out. app.js:2963 records that there were once two implementations of
 * this and a comment claiming there was one, and that both got canceled and past_due wrong.
 *
 * The matrix below is exhaustive on purpose: every status against every shape of date, both
 * inside and outside the free phase. Reading a table is how a wrong cell gets noticed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./_harness/sandbox.js');

const ctx = loadApp({ bank: false });
const DAY = 864e5;
const at = days => new Date(Date.now() + days * DAY).toISOString();
const can = (row, freePhase = true) => { ctx.FREE_PHASE = freePhase; return ctx.hasAccess(row); };

describe('access gate · the two cases that cost money', () => {
  test('CANCELED with a future paid-through date KEEPS access', () => {
    // Cancelling on day 2 of a month already paid for must not cost the other 28 days.
    assert.strictEqual(can({ sub_status: 'canceled', sub_until: at(28) }), true);
    assert.strictEqual(can({ sub_status: 'canceled', sub_until: at(1) }), true);
  });

  test('CANCELED past its paid-through date loses access', () => {
    assert.strictEqual(can({ sub_status: 'canceled', sub_until: at(-1) }), false);
    assert.strictEqual(can({ sub_status: 'canceled', sub_until: null }), false);
  });

  test('PAST_DUE keeps access inside the grace window', () => {
    // A declined card is usually an expired card or a bank blocking an unfamiliar merchant.
    const grace = ctx.PAST_DUE_GRACE_DAYS;
    assert.ok(grace >= 1, 'the grace window has been set to zero -- a bank glitch now churns the customer');
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: at(-0.1) }), true);
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: at(-(grace - 0.1)) }), true);
  });

  test('PAST_DUE loses access outside the grace window', () => {
    const grace = ctx.PAST_DUE_GRACE_DAYS;
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: at(-(grace + 0.1)) }), false);
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: at(-30) }), false);
  });

  test('PAST_DUE with a future date is simply still paid for', () => {
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: at(5) }), true);
  });

  test('the grace boundary is exactly PAST_DUE_GRACE_DAYS, not a day either side', () => {
    const g = ctx.PAST_DUE_GRACE_DAYS;
    const justInside = new Date(Date.now() - (g * DAY - 60000)).toISOString();
    const justOutside = new Date(Date.now() - (g * DAY + 60000)).toISOString();
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: justInside }), true, 'one minute inside the window');
    assert.strictEqual(can({ sub_status: 'past_due', sub_until: justOutside }), false, 'one minute outside the window');
  });
});

describe('access gate · the full matrix', () => {
  const DATES = {
    'no date': null,
    'future': at(30),
    'expired 1d': at(-1),
    'expired 30d': at(-30),
  };
  /* Expected access, written out rather than computed, so a change to hasAccess has to be
   * agreed with here rather than silently absorbed. */
  const EXPECTED = {
    //                no date  future  expired 1d  expired 30d
    active: /*    */[true, true, false, false],
    grace: /*     */[true, true, false, false],
    canceled: /*  */[false, true, false, false],
    past_due: /*  */[false, true, true, false],
    trialing: /*  */[false, false, false, false],   // unknown status: fail CLOSED
  };

  for (const [status, row] of Object.entries(EXPECTED)) {
    test(`sub_status "${status}" behaves as specified across every date`, () => {
      Object.keys(DATES).forEach((label, i) => {
        assert.strictEqual(can({ sub_status: status, sub_until: DATES[label] }), row[i],
          `hasAccess({sub_status:"${status}", sub_until:${label}}) should be ${row[i]}`);
      });
    });
  }

  test('an unrecognised status fails closed', () => {
    for (const s of ['trialing', 'paused', 'refunded', '', 'ACTIVE', 0, null]) {
      assert.strictEqual(can({ sub_status: s, sub_until: at(30) }), false,
        `unknown status ${JSON.stringify(s)} opened the gate`);
    }
  });

  test('status is case-sensitive · "ACTIVE" is not "active"', () => {
    // Worth pinning: a provider webhook that upper-cases the status would lock every customer.
    assert.strictEqual(can({ sub_status: 'ACTIVE', sub_until: at(30) }), false);
  });
});

describe('access gate · fail-open paths', () => {
  test('no profile row at all opens the gate', () => {
    // Documented as deliberate (app.js:2979): a failed profile read must not lock the app.
    assert.strictEqual(can(null), true);
    assert.strictEqual(can(undefined), true);
  });

  test('a row without the subscription columns opens the gate', () => {
    // The columns are not deployed everywhere yet; their absence is not a signal of non-payment.
    assert.strictEqual(can({}), true);
    assert.strictEqual(can({ role: 'user' }), true);
  });

  test('admin always has access, whatever the billing says', () => {
    assert.strictEqual(can({ role: 'admin', sub_status: 'none', sub_until: at(-99) }), true);
    assert.strictEqual(can({ role: 'admin', sub_status: 'canceled', sub_until: null }), true);
  });

  test('an open-ended active subscription (no end date) has access', () => {
    assert.strictEqual(can({ sub_status: 'active', sub_until: null }), true);
    assert.strictEqual(can({ sub_status: 'grace', sub_until: null }), true);
  });
});

describe('access gate · the free phase', () => {
  test('"none" has access while FREE_PHASE is on, and loses it when it is turned off', () => {
    assert.strictEqual(can({ sub_status: 'none', sub_until: null }, true), true);
    assert.strictEqual(can({ sub_status: 'none', sub_until: null }, false), false);
  });

  test('turning the free phase off does not disturb any other status', () => {
    for (const [status, until, expected] of [
      ['active', at(30), true], ['canceled', at(30), true],
      ['past_due', at(-1), true], ['canceled', at(-1), false],
    ]) {
      assert.strictEqual(can({ sub_status: status, sub_until: until }, false), expected,
        `${status}/${until} changed when FREE_PHASE was turned off`);
    }
  });

  test('FREE_PHASE is currently ON · the day this flips, billing is live', () => {
    const pristine = loadApp({ bank: false });
    assert.strictEqual(pristine.FREE_PHASE, true,
      'FREE_PHASE is now false: everyone on sub_status "none" has just lost access. ' +
      'If that is intended, update this test in the same commit.');
  });
});

describe('access gate · malformed dates', () => {
  /* Not a hypothetical: sub_until is written by billing webhooks, and a provider that sends a
   * unix timestamp, an empty string or a localised date produces exactly these. Pinned so the
   * behaviour is a decision rather than an accident. */
  /* Was pinned the other way round -- "fails CLOSED" -- with the fix sitting beside it as a
   * skipped test. The fix was made in app.js (REV 87), so the two swap: this now asserts the
   * behaviour we chose, and the old assertion is gone rather than commented out.
   *
   * Why open and not closed: sub_until is written by a billing webhook. A provider that starts
   * sending "2026-07-31 00:00:00+03" or a localised date produces an Invalid Date, and under the
   * old rule every `active` subscriber holding one was locked out of an app they had paid for -- 
   * silently, and all at once. An unreadable date now means no end date, which fails in the
   * direction that costs a few free days instead of every paying customer simultaneously.
   * The accepted cost: a row whose date is garbage for some other reason gets open-ended access
   * until someone notices. hasAccess logs to console.error precisely so it is noticeable. */
  test('an unparseable date does NOT lock a paying subscriber', () => {
    for (const bad of ['not-a-date', 'yesterday', '31/07/2026', {}, []]) {
      assert.strictEqual(can({ sub_status: 'active', sub_until: bad }), true,
        `sub_until=${JSON.stringify(bad)} -- an "active" subscriber must keep access when the ` +
        `date cannot be read. Locking them is the one failure mode that hits every paying ` +
        `customer at once.`);
    }
  });

  test('an unreadable date does not RESURRECT a status that has no access', () => {
    // Fail-open applies to the date, not to the status: canceled with an unreadable date has
    // no period left to honour, so it stays closed.
    assert.strictEqual(can({ sub_status: 'canceled', sub_until: 'not-a-date' }), false);
    assert.strictEqual(can({ sub_status: 'past_due',  sub_until: 'not-a-date' }), false);
  });

  test('an empty-string date is treated as no date, not as an invalid one', () => {
    // '' is falsy, so `r.sub_until ? new Date(...) : null` yields null -> open-ended access.
    assert.strictEqual(can({ sub_status: 'active', sub_until: '' }), true);
  });

  test('a numeric epoch is accepted, which is worth knowing', () => {
    assert.strictEqual(can({ sub_status: 'active', sub_until: Date.now() + 30 * DAY }), true);
    assert.strictEqual(can({ sub_status: 'active', sub_until: Date.now() - 30 * DAY }), false);
  });
});

describe('access gate · one definition', () => {
  test('subActive is hasAccess, not a second implementation of it', () => {
    // app.js:2963 exists because there were once two. This is the cheap guard against a third.
    const rows = [
      { sub_status: 'active', sub_until: at(30) }, { sub_status: 'canceled', sub_until: at(5) },
      { sub_status: 'past_due', sub_until: at(-1) }, { sub_status: 'past_due', sub_until: at(-10) },
      { sub_status: 'none', sub_until: null }, { role: 'admin' }, {}, null,
    ];
    for (const r of rows) {
      assert.strictEqual(ctx.subActive(r), ctx.hasAccess(r), `subActive disagrees with hasAccess for ${JSON.stringify(r)}`);
    }
  });
});
