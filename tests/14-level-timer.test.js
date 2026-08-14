'use strict';
/* מבחן הרמה · הטיימר שיורה אחרי שהלומד כבר יצא.
 *
 * WHY THIS FILE STUBS A DOM WHEN THE REST OF THE SUITE REFUSES TO
 * ---------------------------------------------------------------
 * tests/_harness/sandbox.js lifts top-level FUNCTIONS out of app.js and deliberately does not
 * fake a DOM (see the header there). The bug under test does not live in a function: it lives in
 * the `$('#lvDunno').onclick` handler, and the thing that is supposed to cancel it lives in the
 * `$('#lvExit').onclick` handler. Neither is liftable by name.
 *
 * So this file stubs the smallest surface those two statements actually touch · `$` returning an
 * object per selector, and a fake clock · and evaluates the REAL statement text pulled out of
 * app.js. Nothing about the handlers is restated here. `lvRender` and `lvFinish` are spies on
 * purpose: what is being asserted is whether the pending tick reaches them at all, not what they
 * then draw.
 *
 * THE INCIDENT THIS GUARDS
 * ------------------------
 * confirm() blocks the queue but does not cancel timers. Press "לא יודע", then leave within
 * 900ms: the tick fires on a screen the learner already left, walks into lvFinish(), and writes
 * hw_level + queueRemoteSync() · the key that decides whether the test is ever offered again.
 * app.js:2445-2448 records that exact incident for the exam screen. lvPick() was fixed then;
 * the "לא יודע" path was not.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { extractFunction, extractHandler } = require('./_harness/extract.js');
const { codeMask, codeMatches } = require('./_harness/scan.js');
const { appSource } = require('./_harness/sandbox.js');

/* ---- a clock that never fires on its own ------------------------------------------------- */
function makeClock() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout(fn) { const id = ++seq; pending.set(id, fn); return id; },   // ids start at 1
    clearTimeout(id) { pending.delete(id); },                               // clearTimeout(null) is a no-op
    tick() { const fns = [...pending.values()]; pending.clear(); fns.forEach(f => f()); return fns.length; },
    get pending() { return pending.size; },
  };
}

/* ---- the level-test screen, reduced to what the two handlers touch ----------------------- */
function levelScreen({ deck = 3, at = 0 } = {}) {
  const src = appSource();
  const mask = codeMask(src);

  const clock = makeClock();
  const els = new Map();
  const el = sel => {
    if (!els.has(sel)) els.set(sel, { innerHTML: '', textContent: '', disabled: false, style: {}, querySelectorAll: () => [] });
    return els.get(sel);
  };

  const log = { render: 0, finish: 0, welcome: 0 };

  const ctx = {
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean,
    $: el,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    confirm: () => true,

    // module state of the level-test region
    lvDeck: Array.from({ length: deck }, (_, i) => ({ w: 'w' + i, a: 'a' + i, band: 'B1', opts: ['a' + i, 'x'] })),
    lvIdx: at, lvAns: [], lvBlockOk: 0, lvTimer: null, exTimer: null,

    // spies: the question is whether the pending tick REACHES these, not what they draw
    lvRender() { log.render++; if (!ctx.lvDeck[ctx.lvIdx]) ctx.lvFinish(); },
    lvFinish() { log.finish++; },          // the real one does LS.set(lvKey(), …) + queueRemoteSync()
    renderWelcome() { log.welcome++; },
    bindSay() { }, hide() { }, show() { }, goto() { }, esc: s => s, shuffle: a => a,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const pieces = [
    ['lvPick', extractFunction(src, 'lvPick', mask)],
    ['#lvDunno handler', extractHandler(src, 'lvDunno', mask)],
    ['#lvExit handler', extractHandler(src, 'lvExit', mask)],
  ];
  for (const [name, code] of pieces) {
    if (!code) throw new Error(`app.js no longer declares ${name}`);
    try { vm.runInContext(code, ctx, { filename: `app.js:${name}` }); }
    catch (e) { throw new Error(`lifting ${name} out of app.js failed: ${e.message}`); }
  }

  return {
    ctx, clock, log,
    dunno: () => el('#lvDunno').onclick(),
    pick: correct => ctx.lvPick(correct ? ctx.lvDeck[ctx.lvIdx].a : 'x', null),
    exit: () => el('#lvExit').onclick(),
  };
}

describe('מבחן רמה · יציאה חייבת לבטל את הטיימר התלוי', () => {

  test('positive control: without leaving, "לא יודע" DOES advance on the tick', () => {
    // Guards the direction of every assertion below: if the handler simply stopped scheduling
    // anything, the "does not fire after exit" tests would pass while the test screen froze.
    const s = levelScreen({ deck: 3, at: 0 });
    s.dunno();
    assert.strictEqual(s.clock.pending, 1, '"לא יודע" did not schedule the advance at all');
    assert.strictEqual(s.clock.tick(), 1);
    assert.strictEqual(s.log.render, 1, 'the tick did not reach lvRender');
    assert.strictEqual(s.ctx.lvIdx, 1, 'the tick did not advance the question');
  });

  test('"לא יודע" then יציאה · the pending tick must NOT fire', () => {
    const s = levelScreen({ deck: 3, at: 0 });
    s.dunno();
    s.exit();
    assert.strictEqual(s.log.welcome, 1, 'the exit handler did not run');
    assert.strictEqual(s.clock.pending, 0,
      'clearTimeout in #lvExit did not reach the timer scheduled by "לא יודע" — ' +
      'the handler calls setTimeout without storing the id in lvTimer');
    assert.strictEqual(s.clock.tick(), 0);
    assert.strictEqual(s.log.render, 0, 'the tick rendered onto a screen the learner already left');
    assert.strictEqual(s.ctx.lvIdx, 0, 'the tick advanced the question after the learner left');
  });

  test('"לא יודע" on the LAST question then יציאה · hw_level must not be written', () => {
    // The incident from app.js:2445-2448, on the level test: lvFinish() is what does
    // LS.set(lvKey(), …) + queueRemoteSync(). Reaching it after יציאה writes a level the
    // learner never finished earning, and pushes it to the cloud.
    const s = levelScreen({ deck: 2, at: 1 });
    s.dunno();
    s.exit();
    s.clock.tick();
    assert.strictEqual(s.log.finish, 0,
      'lvFinish() ran after the learner left — it writes hw_level and calls queueRemoteSync()');
  });

  test('answering normally then יציאה · the pending tick must NOT fire (regression)', () => {
    // lvPick() was already fixed once. This keeps it fixed.
    const s = levelScreen({ deck: 3, at: 0 });
    s.pick(true);
    s.exit();
    assert.strictEqual(s.clock.pending, 0, 'lvPick no longer stores its timer id in lvTimer');
    assert.strictEqual(s.clock.tick(), 0);
    assert.strictEqual(s.log.render, 0);
  });

  test('both level-test timers go through the same variable #lvExit clears', () => {
    // A timer stored in some OTHER variable is cancelled by nothing.
    const src = appSource();
    const mask = codeMask(src);
    const region = [extractFunction(src, 'lvPick', mask), extractHandler(src, 'lvDunno', mask)].join('\n');
    const scheduled = codeMatches(region, /setTimeout\s*\(/, codeMask(region));
    assert.ok(scheduled.length >= 1, 'the level-test region schedules nothing at all');
    const stored = codeMatches(region, /lvTimer\s*=\s*setTimeout\s*\(/, codeMask(region));
    assert.strictEqual(stored.length, scheduled.length,
      `${scheduled.length - stored.length} setTimeout call(s) in the level-test region are not ` +
      'stored in lvTimer, so clearTimeout(lvTimer) in #lvExit cannot reach them');
    const exit = extractHandler(src, 'lvExit', mask);
    assert.ok(/clearTimeout\s*\(\s*lvTimer\s*\)/.test(exit),
      '#lvExit no longer clears lvTimer');
  });
});
