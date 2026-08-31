'use strict';
/* עשרה משתמשים דרך יחידת מילות הקישור, ועוד סריקה על כל הפריטים.
 *
 *   node tests/sim/run.js              · עשרת התרחישים + סריקת כל הפריטים
 *   node tests/sim/run.js --selftest   · שער השיניים · מוכיח שהתרחישים מאדימים
 *
 * קוד יציאה 0 רק אם כל עשרת התרחישים עברו **וגם** הסריקה לא הפילה פריט.
 * כל תרחיש שנופל מדפיס את הטענה שנשברה ואת רצף הפעולות שמשחזר אותה.
 *
 * ⛔ זו רתמת אבחון, לא תיקון. ממצא מדווח ואינו מתוקן כאן.
 * ⛔ והרתמה אינה נוגעת באף קובץ ייצור — היא מרימה מ-app.js ומריצה בזיכרון.
 */

const fs = require('fs');
const path = require('path');
const { makeApp, ROOT, appSource } = require('./harness.js');

/* ── תשתית דיווח ─────────────────────────────────────────────────────── */
const APP_LINES = appSource().split('\n');
function lineOf(needle) {
  const i = APP_LINES.findIndex(l => l.includes(needle));
  return i < 0 ? '?' : i + 1;
}

/* ⛔ התרחישים **נרשמים** כאן ורצים ב-main, אחד-אחד ובהמתנה. תרחיש 10 הוא
   אסינכרוני, ורתמה שקוראת לו בלי await בולעת כל טענה שנשברה בתוכו — כלומר
   מדווחת «עבר» על תרחיש שלא נבדק. */
const registry = [];
function scenario(name, steps, fn) { registry.push({ name, steps, fn }); }

async function runAll(only) {
  const out = [];
  for (const { name, steps, fn } of registry) {
    if (only != null && !name.startsWith(only)) continue;
    const rec = { name, steps, fails: [], notes: [], error: null };
    const check = (ok, msg, where) => { if (!ok) rec.fails.push(where ? `${msg}  [${where}]` : msg); };
    const note = m => rec.notes.push(m);
    try { await fn(check, note); }
    catch (e) { rec.error = e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : String(e); }
    out.push(rec);
  }
  return out;
}
const bad = r => r.fails.length + (r.error ? 1 : 0);

/* ── עוזרים משותפים ──────────────────────────────────────────────────── */
function fresh(opts) {
  const a = makeApp(opts);
  a.loadData();
  return a;
}
function enterUnitViaHome(a) {
  /* דרך הכפתור בדף הבית, לא בקריאה ישירה — זה החיווט שנשבר בשקט. */
  return a.el('pbConn').click();
}

/* ══════════════ 1 · הרגיל ══════════════ */
scenario(
  'הרגיל · סבב של 5, הכול נכון',
  'setLen(5) → #pbConn → כפתור הסבב → 5 × (תשובה נכונה + הבא)',
  async (check) => {
    const a = fresh();
    a.setLen(5);
    await enterUnitViaHome(a);
    check(a.visible('connPick'), 'מסך הבחירה לא נפתח');
    a.el('connPickList').children[0].click();
    check(a.visible('connCard'), 'הקלף לא נפתח');
    check(a.ctx.connQ.length === 5, `אורך הסבב ${a.ctx.connQ.length} ולא 5`);

    const seen = a.playRound(true);
    check(seen.length === 5, `נענו ${seen.length} שאלות ולא 5`);
    check(a.ctx.connOk === 5, `connOk=${a.ctx.connOk} ולא 5`);
    check(a.visible('connDone'), 'מסך הסיום לא הוצג');
    check(!a.visible('connCard'), 'הקלף נשאר גלוי אחרי הסיום');
    check(/<div class="num">5<\/div>/.test(a.doneText()), 'מסך הסיום אינו מציג 5');
    check(/מתוך 5 משפטים/.test(a.doneText()), 'מסך הסיום אינו מציג "מתוך 5 משפטים"');
    check(a.el('connBar').style.width === '100%', 'פס ההתקדמות לא הושלם ל-100%');

    const p = a.prog();
    check(Object.keys(p).length === 5, `נשמרו ${Object.keys(p).length} רשומות ולא 5`);
    check(seen.every(s => p[s] && p[s].n === 1 && p[s].ok === 1 && p[s].last === 1),
      'רשומת התקדמות שגויה אחרי תשובה נכונה');
    const q = a.summary();
    check(q.solved === 5 && q.ok === 5 && q.left === q.total - 5,
      `סיכום שגוי: solved=${q.solved} ok=${q.ok} left=${q.left}`);
    check(a.calls.renderHome === 1, 'דף הבית לא רוענן בסוף הסבב');
  });

/* ══════════════ 2 · הטועה ══════════════ */
scenario(
  'הטועה · סבב של 5, הכול שגוי',
  'setLen(5) → סבב → 5 × (תשובה שגויה + הבא)',
  async (check) => {
    const a = fresh();
    a.setLen(5);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();
    const seen = a.playRound(false);

    check(seen.length === 5, `נענו ${seen.length} שאלות ולא 5`);
    check(a.ctx.connOk === 0, `connOk=${a.ctx.connOk} ולא 0`);
    check(/<div class="num">0<\/div>/.test(a.doneText()), 'מסך הסיום אינו מציג 0');
    const p = a.prog();
    check(seen.every(s => p[s] && p[s].n === 1 && p[s].ok === 0 && p[s].last === 0),
      'רשומת התקדמות שגויה אחרי תשובה שגויה');
    const q = a.summary();
    check(q.solved === 5 && q.ok === 0, `סיכום שגוי: solved=${q.solved} ok=${q.ok}`);
    check(q.pct === 0, `אחוז ${q.pct} ולא 0`);
  });

/* ══════════════ 3 · המעורב ══════════════ */
scenario(
  'המעורב · סבב של 10, חצי-חצי, וספירה מדויקת',
  'setLen(10) → סבב → נכון/שגוי לסירוגין → בדיקת המספר במסך הסיום',
  async (check) => {
    const a = fresh();
    a.setLen(10);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();
    check(a.ctx.connQ.length === 10, `אורך הסבב ${a.ctx.connQ.length} ולא 10`);

    const seen = a.playRound(i => i % 2 === 0);          // 0,2,4,6,8 נכונים = 5
    check(seen.length === 10, `נענו ${seen.length} שאלות ולא 10`);
    check(a.ctx.connOk === 5, `connOk=${a.ctx.connOk} ולא 5`);
    check(/<div class="num">5<\/div>/.test(a.doneText()),
      'מסך הסיום אינו מציג 5 · הספירה בסוף אינה מדויקת');
    check(/מתוך 10 משפטים/.test(a.doneText()), 'מסך הסיום אינו מציג "מתוך 10 משפטים"');

    const p = a.prog();
    const right = seen.filter((_, i) => i % 2 === 0);
    const wrong = seen.filter((_, i) => i % 2 === 1);
    check(right.every(s => p[s].ok === 1), 'פריט שנענה נכון לא נרשם כנכון');
    check(wrong.every(s => p[s].ok === 0), 'פריט שנענה שגוי נרשם כנכון');
    const q = a.summary();
    check(q.solved === 10, `solved=${q.solved} ולא 10`);
    check(q.ok === 5, `ok=${q.ok} ולא 5`);
    check(new RegExp(`בסך הכול: 5 מתוך ${q.total}`).test(a.doneText()),
      'שורת הסיכום המצטבר אינה תואמת את הסיכום בפועל');
  });

/* ══════════════ 4 · החוזר ══════════════ */
scenario(
  'החוזר · סבב שני אינו מחזיר את אותם פריטים',
  'סבב 1 של 10 → «סבב נוסף» → השוואת המזהים',
  async (check, note) => {
    const a = fresh();
    a.setLen(10);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();
    const r1 = a.playRound(true);
    check(a.visible('connDone'), 'מסך הסיום לא הוצג');

    a.el('connAgain').click();                            // הכפתור שנבנה במסך הסיום
    check(a.visible('connCard'), 'הסבב השני לא נפתח');
    const r2 = a.roundSrcs();
    check(r2.length === 10, `הסבב השני באורך ${r2.length} ולא 10`);
    const overlap = r2.filter(s => r1.includes(s));
    check(overlap.length === 0,
      `${overlap.length} פריטים חוזרים בסבב השני מתוך 150: ${overlap.slice(0, 5).join(', ')}`,
      `app.js:${lineOf('const fresh  = all.filter')}`);
    a.playRound(false);

    /* וגם סבב שלישי, אחרי שיש כבר גם קבוצת «נכשלו» */
    a.el('connAgain').click();
    const r3 = a.roundSrcs();
    const overlap3 = r3.filter(s => r1.includes(s) || r2.includes(s));
    check(overlap3.length === 0,
      `${overlap3.length} פריטים חוזרים בסבב השלישי אף ש-130 טרם נפתרו`);
    note(`שלושה סבבים = ${new Set([...r1, ...r2, ...r3]).size} פריטים ייחודיים מתוך 30 הגשות`);
  });

/* ══════════════ 5 · הנוטש ══════════════ */
scenario(
  'הנוטש · יציאה באמצע, וההתקדמות שנשמרה',
  'סבב של 5 → 2 תשובות → #connExit → #pbConn → בדיקת ההתקדמות והסבב הבא',
  async (check, note) => {
    const a = fresh();
    a.setLen(5);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();
    const all5 = a.roundSrcs();

    a.answerRight(); a.next();
    a.answerWrong(); a.next();
    const answered = all5.slice(0, 2);
    const unanswered = all5.slice(2);

    a.el('connExit').click();
    check(a.calls.goBack === 1, 'היציאה לא קראה ל-goBack');

    const p1 = a.prog();
    check(Object.keys(p1).length === 2,
      `נשמרו ${Object.keys(p1).length} רשומות · צפוי 2 (רק מה שנענה)`);
    check(answered.every(s => p1[s]), 'תשובה שניתנה לפני היציאה לא נשמרה');
    check(unanswered.every(s => !p1[s]), 'פריט שלא נענה נרשם בכל זאת');
    check(p1[answered[0]].ok === 1 && p1[answered[1]].ok === 0,
      'נכון/שגוי התהפכו בשמירה');

    /* חוזר */
    await enterUnitViaHome(a);
    check(a.visible('connPick'), 'החזרה לא פתחה את מסך הבחירה');
    check(!a.visible('connCard'), 'הקלף הנטוש נשאר על המסך אחרי החזרה');
    const q = a.summary();
    check(q.solved === 2, `אחרי החזרה solved=${q.solved} ולא 2`);

    a.el('connPickList').children[0].click();
    const r2 = a.roundSrcs();
    const back = r2.filter(s => answered.includes(s));
    check(back.length === 0, `${back.length} מהפריטים שכבר נענו חזרו מיד בסבב הבא`);
    const resumed = r2.filter(s => unanswered.includes(s));
    note(`הסבב הנטוש אינו מתחדש · ${resumed.length} מ-3 הפריטים שלא נענו חזרו בסבב חדש (מקרי)`);
    note('connQ/connI אינם מאופסים ביציאה, אבל openConnPick מסתיר את הקלף וסבב חדש דורס אותם');
  });

/* ══════════════ 6 · הלוחץ פעמיים ══════════════ */
scenario(
  'הלוחץ פעמיים · אין ספירה כפולה',
  'תשובה → אותה תשובה שוב (click ו-fire) → אפשרות אחרת → «הבא» פעמיים',
  async (check, note) => {
    const a = fresh();
    a.setLen(5);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();

    const it = a.card();
    const src = it.src;
    const opts = a.opts();
    const right = a.rightIndex();
    opts[right].click();
    check(a.ctx.connOk === 1, `אחרי תשובה אחת connOk=${a.ctx.connOk}`);
    check(a.prog()[src].n === 1, 'הרשומה לא נכתבה');

    /* (א) לחיצה שנייה על אותו כפתור — כפי שדפדפן מתנהג */
    const r = opts[right].click();
    check(r === 'ignored-disabled', 'הכפתור לא הושבת אחרי תשובה · אפשר ללחוץ עליו שוב');
    /* (ב) עקיפת ה-disabled · האם משמר ה-JS מחזיק לבדו */
    opts[right].fire();
    /* (ג) אפשרות אחרת, אחרי שכבר נענה */
    opts[right === 0 ? 1 : 0].fire();

    check(a.ctx.connOk === 1, `⛔ ספירה כפולה · connOk=${a.ctx.connOk} אחרי לחיצות חוזרות`,
      `app.js:${lineOf('if(connAnswered) return;')}`);
    check(a.prog()[src].n === 1,
      `⛔ הרשומה נספרה ${a.prog()[src].n} פעמים במקום פעם אחת`);
    check(a.prog()[src].ok === 1, `ok=${a.prog()[src].ok} ולא 1`);

    /* «הבא» פעמיים */
    const before = a.ctx.connI;
    a.next();
    check(a.ctx.connI === before + 1, 'הלחיצה על «הבא» לא קידמה');
    a.next();
    check(a.ctx.connI === before + 1,
      `⛔ «הבא» כפול קידם פעמיים · connI=${a.ctx.connI}`,
      `app.js:${lineOf("$('#connNext').onclick")}`);

    /* לחיצה על אפשרות של הקלף החדש · חייבת להיספר */
    a.answerRight();
    check(a.ctx.connOk === 2, `הקלף השני לא נספר · connOk=${a.ctx.connOk}`);
    note('הגנת ה-disabled וגם משמר connAnswered — שניהם נבדקו בנפרד');
  });

/* ══════════════ 7 · המתמיד ══════════════ */
scenario(
  'המתמיד · 30 סבבים של 5 = כל 150 הפריטים, ואז עוד אחד',
  'setLen(5) → 30 סבבים רצופים נכונים → סבב 31',
  async (check, note) => {
    const a = fresh();
    a.setLen(5);
    await enterUnitViaHome(a);
    a.el('connPickList').children[0].click();

    const all = [];
    for (let r = 0; r < 30; r++) {
      if (r > 0) a.el('connAgain').click();
      if (!a.visible('connCard')) { check(false, `סבב ${r + 1} לא נפתח`); return; }
      if (a.ctx.connQ.length !== 5) check(false, `סבב ${r + 1} באורך ${a.ctx.connQ.length} ולא 5`);
      all.push(...a.playRound(true));
    }
    check(all.length === 150, `סך הכול ${all.length} הגשות ולא 150`);
    check(new Set(all).size === 150,
      `⛔ ${150 - new Set(all).size} כפילויות ב-30 הסבבים · פריטים שטרם נפתרו נדלגו`);

    const q = a.summary();
    check(q.left === 0, `אחרי 30 סבבים נותרו ${q.left} פריטים שטרם נפתרו`);
    check(q.solved === 150 && q.ok === 150, `solved=${q.solved} ok=${q.ok}`);
    check(q.pct === 100, `pct=${q.pct} ולא 100`);

    /* ⭐ מה שקורה כשנגמרו הפריטים שטרם נפתרו */
    a.el('connAgain').click();
    check(a.visible('connCard'), '⛔ סבב 31 לא נפתח · המשתמש נתקע במסך הסיום');
    check(a.ctx.connQ.length === 5,
      `⛔ סבב 31 באורך ${a.ctx.connQ.length} · הסבב מתרוקן כשאין פריטים חדשים`,
      `app.js:${lineOf('if(pool.length < want) pool = pool.concat(slipped, solid)')}`);
    const r31 = a.playRound(true);
    check(r31.length === 5, `סבב 31 הגיש ${r31.length} שאלות`);
    check(a.visible('connDone'), 'סבב 31 לא הגיע למסך סיום');
    check(/הושלמה|בסך הכול/.test(a.doneText()) || a.doneText().length > 0, 'מסך הסיום ריק');

    /* ומסך הבחירה אחרי שהכול נפתר */
    a.ctx.openConnPick();
    const b = a.el('connPickList').children[0];
    check(!!b, 'מסך הבחירה נשאר בלי כפתור אחרי שהכול נפתר');
    check(/הושלמה/.test(b.innerHTML),
      `כפתור הסבב אינו מסמן «הושלמה»: ${String(b.innerHTML).slice(0, 90)}`);
    note(`אחרי 30 סבבים: ${JSON.stringify(q)}`);
    note('סבב 31 מגיש פריטים שכבר נפתרו — זו התנהגות מכוונת לפי סדר העדיפות ב-startConnRound');
  });

/* ══════════════ 8 · בעל האחסון המלא ══════════════ */
scenario(
  'בעל האחסון המלא · localStorage זורק בכל כתיבה',
  'blocked=כל מפתח → סבב של 5 → מסך סיום → שחרור האחסון → סבב נוסף',
  async (check, note) => {
    const a = makeApp({ blocked: () => true });
    a.loadData();
    /* ‏setLen עוקף את החסימה (seed) — כך נראה מכשיר שכבר היה לו ערך שמור. */
    a.setLen(5);
    a.ctx.openConnPick();
    check(a.visible('connPick'), 'מסך הבחירה לא נפתח כשהאחסון מלא');
    a.el('connPickList').children[0].click();
    check(a.visible('connCard'), '⛔ הסבב לא נפתח כשהאחסון מלא');

    const seen = a.playRound(true);
    check(seen.length === 5, `⛔ הסבב נקטע אחרי ${seen.length} שאלות`);
    check(a.ctx.connOk === 5, `connOk=${a.ctx.connOk} · הניקוד בזיכרון נפגע מכשל הכתיבה`);
    check(a.ctx.connSaveFailed === true, 'דגל כשל השמירה לא נדלק');
    check(/ההתקדמות לא נשמרה/.test(a.doneText()),
      'מסך הסיום אינו אומר שההתקדמות לא נשמרה');
    check(!/בסך הכול/.test(a.doneText()),
      'מסך הסיום מציג סיכום מצטבר שסותר את מה שלא נשמר');
    check(a.ctx.storageBarOn === true, 'פס ההתראה על אחסון מלא לא הוצג');
    const bar = a.el('stgBar');
    check(!!bar && bar.innerHTML.length > 0, 'פס ההתראה נוצר ריק');
    check(Object.keys(a.prog()).length === 0, 'התקדמות נשמרה אף שכל כתיבה נכשלה');

    /* ⭐ האחסון משתחרר. האם המסך מתאושש? */
    a.ls.blocked = null;
    a.el('connAgain').click();
    check(a.visible('connCard'), 'סבב אחרי שחרור האחסון לא נפתח');
    a.playRound(true);
    const savedNow = Object.keys(a.prog()).length;
    check(savedNow === 5, `אחרי שחרור האחסון נשמרו ${savedNow} רשומות ולא 5`);
    if (/ההתקדמות לא נשמרה/.test(a.doneText())) {
      check(false,
        '⚠ מסך הסיום עדיין אומר «ההתקדמות לא נשמרה» אף שהסבב הזה כן נשמר · ' +
        'connSaveFailed מצטבר ולעולם אינו מתאפס',
        `app.js:${lineOf('connSaveFailed = !LS.set(CONN_PROG, p) || connSaveFailed')}`);
    }
    note(`הודעות toast שנרשמו: ${a.calls.toasts.length}`);
  });

/* ══════════════ 9 · בעל הנתון הפגום ══════════════ */
scenario(
  'בעל הנתון הפגום · רשומות שבורות בהתקדמות',
  'זריעת hw_conn_prog בכל צורה שבורה → openConnPick → סבב מלא',
  (check, note) => {
    const items = fresh().ctx.connItems();
    const s0 = items[0].src, s1 = items[1].src, s2 = items[2].src;

    const מקרים = [
      ['null', 'null'],
      ['מערך במקום אובייקט', '[]'],
      ['מערך עם תוכן', '[{"n":1}]'],
      ['מחרוזת', '"התקדמות"'],
      ['מספר', '7'],
      ['לא JSON כלל', '{זה לא json'],
      ['n מילולי בעברית', JSON.stringify({ [s0]: { n: 'שלוש' } })],
      ['רשומה null', JSON.stringify({ [s0]: null })],
      ['רשומה מערך', JSON.stringify({ [s0]: [1, 2] })],
      ['n שלילי, ok ענק', JSON.stringify({ [s0]: { n: -5, ok: 99 } })],
      ['ok גדול מ-n', JSON.stringify({ [s0]: { n: 1, ok: 40 } })],
      ['שדות זרים ו-last מחרוזת', JSON.stringify({ [s0]: { n: 3, ok: 2, last: 'כן', foo: {} } })],
      ['מפתח שאינו קיים במאגר', JSON.stringify({ 'לא#קיים': { n: 4, ok: 4, last: 1 } })],
      ['NaN ו-Infinity כמחרוזות', JSON.stringify({ [s1]: { n: 'NaN', ok: 'Infinity', last: 1 } })],
      ['מבנה ישן · מערך מזהים', JSON.stringify([s0, s1, s2])],
      ['רשומה עמוקה', JSON.stringify({ [s2]: { n: { n: 1 }, ok: [], last: {} } })],
    ];

    for (const [שם, גולמי] of מקרים) {
      const a = makeApp();
      a.loadData();
      a.ls.seed('hw_conn_prog', גולמי);
      a.setLen(5);
      try {
        const p = a.prog();
        const q = a.summary();
        check(q.ok <= q.total && q.solved <= q.total && q.left >= 0,
          `«${שם}» · סיכום לא שפוי ${JSON.stringify(q)}`);
        check(q.pct >= 0 && q.pct <= 100, `«${שם}» · אחוז ${q.pct} מחוץ לטווח`);
        for (const k of Object.keys(p)) {
          const r = p[k];
          check(Number.isInteger(r.n) && r.n >= 0, `«${שם}» · n פגום נשאר: ${JSON.stringify(r)}`);
          check(Number.isInteger(r.ok) && r.ok >= 0 && r.ok <= r.n,
            `«${שם}» · ok פגום נשאר: ${JSON.stringify(r)}`);
          check(r.last === 0 || r.last === 1, `«${שם}» · last פגום נשאר: ${JSON.stringify(r)}`);
        }
        a.ctx.openConnPick();
        check(a.visible('connPick'), `«${שם}» · מסך הבחירה לא נפתח`);
        const b = a.el('connPickList').children[0];
        check(!!b, `«${שם}» · אין כפתור סבב`);
        b.click();
        check(a.visible('connCard'), `«${שם}» · הסבב לא נפתח`);
        check(a.ctx.connQ.length === 5, `«${שם}» · אורך הסבב ${a.ctx.connQ.length}`);
        const seen = a.playRound(i => i % 2 === 0);
        check(seen.length === 5, `«${שם}» · הסבב נקטע אחרי ${seen.length}`);
        check(a.visible('connDone'), `«${שם}» · לא הגיע למסך סיום`);
        const p2 = a.prog();
        check(seen.every(s => p2[s] && p2[s].n >= 1), `«${שם}» · תשובה לא נשמרה`);
      } catch (e) {
        check(false, `⛔ «${שם}» זרק: ${e.message}`,
          `app.js:${lineOf('function saneConnRec(r){')}`);
      }
    }
    note(`${מקרים.length} צורות פגומות נבדקו · saneConnRec/connProg בולעים את כולן`);
  });

/* ══════════════ 10 · האיטי ══════════════ */
scenario(
  'האיטי · טעינה איטית ונכשלת',
  '#pbConn → onerror → #pbConn שוב → onload → כניסה',
  (check, note) => {
    const a = makeApp();                                   // ⛔ בלי loadData
    const doc = a.doc;
    const subWas = a.el('pbConnSub').innerHTML;
    check(/<b>/.test(subWas), 'שורת התיאור בדף הבית לא נטענה מ-index.html · הבדיקה שאחריה תעבור ריקם');

    /* (א) כשל */
    const p1 = a.el('pbConn').click();
    check(doc.head.children.length === 1, `נתלו ${doc.head.children.length} תגי סקריפט ולא 1`);
    check(a.el('pbConn').disabled === true, 'הכפתור לא הושבת בזמן הטעינה');
    check(/טוען/.test(a.el('pbConnSub').textContent), 'לא נאמר למשתמש שהטעינה רצה');
    doc.head.children[0].onerror();

    return p1.then(() => {
      check(a.el('pbConn').disabled === false, 'הכפתור נשאר מושבת אחרי כשל');
      check(a.calls.goto.length === 0, '⛔ נכנס ליחידה אף שהטעינה נכשלה');
      check(a.calls.toasts.some(t => /לא ניתן לטעון/.test(t)),
        `לא הוצגה הודעת כשל · ההודעות: ${JSON.stringify(a.calls.toasts)}`);
      check(!/טוען/.test(a.el('pbConnSub').textContent), 'הכיתוב «טוען» נשאר תקוע');
      check(a.el('pbConnSub').innerHTML === subWas,
        '⛔ שורת התיאור לא שוחזרה במלואה אחרי הטעינה · ההדגשה שבתוכה נמחקה בלחיצה הראשונה',
        `app.js:${lineOf('const btn = $(\'#pbConn\'), sub = $(\'#pbConnSub\'), was = sub.innerHTML;')}`);

      /* (ב) נסיון שני · חייב לתלות תג חדש */
      const p2 = a.el('pbConn').click();
      check(doc.head.children.length === 2,
        `⛔ הנסיון השני לא תלה תג חדש (${doc.head.children.length}) · ההבטחה לא אופסה, ` +
        'והיחידה נעולה עד רענון הדף',
        `app.js:${lineOf('el.onerror = ()=>{ connLoading = null; res(false); };')}`);

      /* (ג) איטי · הנתונים מגיעים רק אחרי המתנה */
      return new Promise(res => setTimeout(res, 30)).then(() => {
        check(a.calls.goto.length === 0, 'נכנס ליחידה לפני שהנתונים הגיעו');
        a.loadData();                                      // "הסקריפט ירד"
        doc.head.children[1].onload();
        return p2;
      });
    }).then(() => {
      check(a.calls.goto.join(',') === 'conn',
        `⛔ אחרי טעינה מוצלחת לא נכנס ליחידה · goto=${JSON.stringify(a.calls.goto)}`);
      check(a.visible('connPick'), 'מסך הבחירה לא נפתח אחרי הטעינה');
      check(a.el('connPickList').children.length === 1, 'מסך הבחירה נשאר בלי כפתור סבב');
      check(a.el('pbConn').disabled === false, 'הכפתור נשאר מושבת');

      /* (ד) כניסה שלישית · אין טעינה חוזרת */
      const before = doc.head.children.length;
      return a.el('pbConn').click().then(() => {
        check(doc.head.children.length === before, 'הקובץ נטען שוב אף שהוא כבר בזיכרון');
        /* (ה) והסבב עצמו רץ אחרי הטעינה האיטית */
        a.setLen(5);
        a.ctx.renderConnPick();
        a.el('connPickList').children[0].click();
        check(a.visible('connCard'), '⛔ הסבב לא נפתח אחרי טעינה שנכשלה ואז הצליחה');
        const seen = a.playRound(true);
        check(seen.length === 5, `הסבב הגיש ${seen.length} שאלות`);
        note('התרחיש רץ אסינכרונית ומחזיר Promise · הרתמה ממתינה לו');
      });
    });
  });

/* ══════════════ סריקה · כל הפריטים דרך לוגיקת המסך ══════════════ */
function sweep() {
  const a = fresh();
  const bank = a.ctx.connBank();
  const raw = Object.values(bank).filter(Array.isArray).flat();
  const out = {
    total: raw.length, gateFailed: [], threw: [], mismatched: [],
    dupOptions: [], multiBlank: [], noBlankInHtml: [], emptyExp: [],
  };

  for (const it of raw) {
    if (!a.ctx.connItemOk(it)) { out.gateFailed.push(String(it && it.src)); continue; }

    /* תצפיות על הנתון עצמו — לא כשל בקוד, אבל כן מה שהלומד יראה */
    if (new Set(it.o).size !== it.o.length) out.dupOptions.push(it.src);
    const blanks = (it.s.match(/_{2,}/g) || []).length;
    if (blanks !== 1) out.multiBlank.push(`${it.src} (${blanks})`);

    for (const mode of ['right', 'wrong']) {
      try {
        const sh = a.ctx.connShuffled(it);
        a.reset();
        a.ctx.connQ = [sh];
        a.ctx.renderConnCard();

        const html = a.el('connText').innerHTML;
        if (!/<span class="bl">___<\/span>/.test(html)) out.noBlankInHtml.push(it.src);

        const btns = a.opts();
        if (btns.length !== sh.o.length) {
          out.mismatched.push(`${it.src}: ${btns.length} כפתורים מול ${sh.o.length} אפשרויות`);
          continue;
        }
        for (let i = 0; i < btns.length; i++) {
          if (btns[i].textContent !== String(sh.o[i]))
            out.mismatched.push(`${it.src}: כפתור ${i} מציג «${btns[i].textContent}» במקום «${sh.o[i]}»`);
        }

        /* ⭐ הערבוב חייב לשמור על ההצמדה — האפשרות, הפירוש, הנימוק והכיוון
           זזים יחד, והתשובה הנכונה נשארת אותה **מילה**. ⛔ בדיקה שלוחצת לפי
           `sh.a` עקבית עם עצמה גם כשהמיפוי נשבר, ולכן לא תופסת דבר. */
        const word = String(it.o[it.a]);
        if (String(sh.o[sh.a]) !== word)
          out.mismatched.push(`${it.src}: אחרי הערבוב התשובה המסומנת היא «${sh.o[sh.a]}» ולא «${word}»`);
        if (sh.g[sh.a] !== it.g[it.a] || sh.r[sh.a] !== it.r[it.a] || sh.d[sh.a] !== it.d[it.a])
          out.mismatched.push(`${it.src}: הפירוש/הנימוק/הכיוון של התשובה הנכונה התנתקו ממנה`);
        if (sh.k !== sh.d[sh.a])
          out.mismatched.push(`${it.src}: k אינו d[a] אחרי הערבוב · הפריט סותר את עצמו`);
        for (let i = 0; i < sh.o.length; i++) {
          const j = it.o.indexOf(sh.o[i]);
          if (j < 0) { out.mismatched.push(`${it.src}: אפשרות «${sh.o[i]}» אינה מהמקור`); continue; }
          if (sh.g[i] !== it.g[j] || sh.r[i] !== it.r[j] || sh.d[i] !== it.d[j])
            out.mismatched.push(`${it.src}: «${sh.o[i]}» קיבלה פירוש/נימוק/כיוון של מילה אחרת`);
        }

        /* הלומד לוחץ על המילה, לא על האינדקס. */
        const rightAt = btns.findIndex(b => b.textContent === word);
        if (rightAt < 0) { out.mismatched.push(`${it.src}: המילה הנכונה «${word}» אינה על המסך`); continue; }
        const pick = mode === 'right' ? rightAt : (rightAt === 0 ? 1 : 0);
        btns[pick].click();

        if (mode === 'right' && a.ctx.connOk !== 1)
          out.mismatched.push(`${it.src}: לחיצה על המילה הנכונה «${word}» נספרה כטעות`);
        if (mode === 'wrong' && a.ctx.connOk !== 0) out.mismatched.push(`${it.src}: תשובה שגויה נספרה כנכונה`);
        if (!btns[sh.a].classList.contains('is-right'))
          out.mismatched.push(`${it.src}: התשובה הנכונה לא סומנה`);
        if (mode === 'wrong' && !btns[pick].classList.contains('is-wrong'))
          out.mismatched.push(`${it.src}: הבחירה השגויה לא סומנה`);
        if (!btns.every(b => b.disabled)) out.mismatched.push(`${it.src}: כפתורים נשארו פעילים`);

        const exp = a.el('connExp').innerHTML;
        if (!exp || exp.length < 20) out.emptyExp.push(it.src);
        const answer = String(sh.o[sh.a]);
        if (!exp.includes(answer)) out.mismatched.push(`${it.src}: ההסבר אינו מציג את התשובה «${answer}»`);
        if (!a.ctx.connFull(sh).includes(answer))
          out.mismatched.push(`${it.src}: המשפט השלם אינו כולל את התשובה`);
        if (/_{2,}/.test(a.ctx.connFull(sh)))
          out.mismatched.push(`${it.src}: נשאר חריץ במשפט השלם`);
        if (a.el('connExp').classList.contains('hidden'))
          out.mismatched.push(`${it.src}: ההסבר נשאר מוסתר`);

        /* וגם המעבר לקלף הבא / הסיום */
        a.el('connNext').click();
      } catch (e) {
        out.threw.push(`${it && it.src} [${mode}]: ${e.message}`);
      }
    }
  }
  return out;
}

/* ══════════════ שער שיניים · node tests/sim/run.js --selftest ══════════════
   ⛔ סימולציה שמדווחת «עבר» ומעולם לא נראתה מאדימה אינה עדות. כל מוטנט כאן
   שובר נקודה אחת ב-app.js **בזיכרון בלבד**, ומצופה להפיל תרחיש מסוים.
   ⛔ **וכל מוטנט מעוגן ל-`after`.** יחידת המשפטים ויחידת מילות הקישור חולקות
   שורות זהות תו-בתו (`return { n, ok, last: … }` מופיעה פעמיים, שורת הודעת
   הכשל שלוש פעמים). ‏replace בלי עוגן פוגע ביחידה הלא נכונה ומדווח «התרחיש
   לא תפס» על מוטנט שמעולם לא נגע בקוד שנבדק — זה קרה כאן בהרצה הראשונה
   בשלושה מוטנטים מתוך שבעה. */
const MUTANTS = [
  {
    name: 'הערבוב אינו ממפה מחדש את מיקום התשובה',
    after: 'function connShuffled(it){',
    from: 'a: idx.indexOf(it.a),', to: 'a: it.a,',
    expect: ['sweep', 'הרגיל'],
  },
  {
    name: 'answerConn בלי משמר ההקלקה הכפולה',
    after: 'function answerConn(pick){',
    from: 'if(connAnswered) return;', to: '',
    expect: ['הלוחץ פעמיים'],
  },
  {
    name: 'טעינה שנכשלה נועלת את היחידה · ההבטחה אינה מאופסת',
    after: 'function loadConnData(){',
    from: 'el.onerror = ()=>{ connLoading = null; res(false); };', to: 'el.onerror = ()=>{ res(false); };',
    expect: ['האיטי'],
  },
  {
    name: 'הסבב מגיש תמיד את אותם פריטים ראשונים',
    after: 'function startConnRound(){',
    from: 'connQ = pool.slice(0, Math.min(want, all.length)).map(connShuffled);',
    to: 'connQ = all.slice(0, Math.min(want, all.length)).map(connShuffled);',
    expect: ['החוזר', 'המתמיד'],
  },
  {
    name: 'רשומת התקדמות שבורה אינה מנורמלת',
    after: 'function saneConnRec(r){',
    from: 'return { n, ok, last: Number(r.last) ? 1 : 0 };', to: 'return r;',
    expect: ['בעל הנתון הפגום'],
  },
  {
    name: 'התקדמות אינה נכתבת לדיסק',
    after: 'function connRecord(src, right){',
    from: 'connSaveFailed = !LS.set(CONN_PROG, p) || connSaveFailed;', to: 'connSaveFailed = false;',
    expect: ['הרגיל', 'בעל האחסון המלא'],
  },
  {
    name: 'הכפתור בדף הבית נכנס ליחידה גם כשהטעינה נכשלה',
    after: "$('#pbConn').onclick",
    from: "if(!ok){ toast('לא ניתן לטעון את המשפטים. בדוק את החיבור לרשת ונסה שוב'); return; }",
    to: "if(!ok){ toast('לא ניתן לטעון את המשפטים. בדוק את החיבור לרשת ונסה שוב'); }",
    expect: ['האיטי'],
  },
  /* ⚠ «השער מקבל הכול» היה מוטנט ריק — כל 150 הפריטים עוברים אותו גם ככה,
     ולכן ההרפיה אינה משנה דבר. ההידוק כן משנה, והוא מה שמפעיל את מסלול
     «לא נטענו משפטים» שאין לו שום כיסוי אחר. */
  {
    name: 'שער תקינות הפריט פוסל את כולם · המאגר מתרוקן',
    after: 'function connItemOk(it){',
    from: 'return isObj(it)', to: 'return false && isObj(it)',
    expect: ['sweep', 'הרגיל'],
  },
];

/* מחיל מוטנט **אחרי** העוגן, ומסרב כשהעוגן או הטקסט אינם חד-משמעיים. */
function applyMutant(src, mu) {
  const occ = (s, t) => { let c = 0, i = 0; while ((i = s.indexOf(t, i)) >= 0) { c++; i++; } return c; };
  if (occ(src, mu.after) !== 1) return { err: `העוגן «${mu.after}» מופיע ${occ(src, mu.after)} פעמים · לא חד-משמעי` };
  const at = src.indexOf(mu.after);
  const i = src.indexOf(mu.from, at);
  if (i < 0) return { err: `הטקסט לחיתוך לא נמצא אחרי העוגן · המוטנט ריק ולא הוכיח דבר` };
  return { src: src.slice(0, i) + mu.to + src.slice(i + mu.from.length) };
}

async function selftest() {
  const { setSourceOverride } = require('./harness.js');
  const real = appSource();
  const line = '='.repeat(74);
  const names = rs => rs.filter(bad).map(r => r.name.split(' ·')[0]);

  /* ⭐ בסיס · תרחיש שנופל כבר על הקוד האמיתי אינו ראיה לשום מוטנט. */
  const base = new Set(names(await runAll()));
  const bsw = sweep();
  const swBase = bsw.gateFailed.length + bsw.threw.length + bsw.mismatched.length;

  console.log(line);
  console.log('שער שיניים · כל מוטנט חייב להפיל את התרחיש שאמור לתפוס אותו');
  console.log(`בסיס (הקוד האמיתי) · תרחישים שכבר נופלים: ${base.size ? [...base].join(', ') : 'אין'} · סריקה: ${swBase}`);
  console.log(line);

  let bugs = 0;
  for (const mu of MUTANTS) {
    const m = applyMutant(real, mu);
    if (m.err) { console.log(`נפל  · «${mu.name}» — ${m.err}`); bugs++; continue; }
    setSourceOverride(m.src);
    let caught = [];
    try {
      caught = names(await runAll()).filter(n => !base.has(n));
      const sw = sweep();
      if (sw.gateFailed.length + sw.threw.length + sw.mismatched.length > swBase) caught.push('sweep');
    } finally { setSourceOverride(null); }
    const ok = mu.expect.some(e => caught.some(c => c === e || c.startsWith(e)));
    if (!ok) bugs++;
    console.log(`${ok ? 'עבר ' : 'נפל '} · «${mu.name}»`);
    console.log(`        צפוי: ${mu.expect.join(' / ')} · נתפס: ${caught.length ? caught.join(', ') : 'שום דבר'}`);
  }
  console.log(`\n${line}`);
  console.log(bugs
    ? `⛔ ${bugs} מתוך ${MUTANTS.length} מוטנטים לא נתפסו · הסימולציה אינה מוכיחה את מה שהיא טוענת`
    : `✔ כל ${MUTANTS.length} המוטנטים נתפסו · לכל תרחיש יש שיניים`);
  console.log(line);
  process.exitCode = bugs ? 1 : 0;
}

/* ══════════════ הרצה ודיווח ══════════════ */
(async () => {
  if (process.argv.includes('--selftest')) return selftest();
  const results = await runAll();
  const line = '='.repeat(74);
  const sw = sweep();

  let hardFails = 0;
  console.log(line);
  console.log('סימולציית עשרה משתמשים · יחידת מילים להשלמת משפטים');
  console.log(line);
  for (const r of results) {
    const n = bad(r);
    if (n) hardFails++;
    console.log(`\n${n ? 'נפל  ' : 'עבר  '} · ${r.name}`);
    console.log(`        רצף: ${r.steps}`);
    if (r.error) console.log(`        ⛔ שגיאה: ${r.error.replace(/\n/g, '\n        ')}`);
    for (const f of r.fails) console.log(`        ⛔ ${f}`);
    for (const n of r.notes) console.log(`        · ${n}`);
  }

  console.log(`\n${line}`);
  console.log(`סריקה · ${sw.total} פריטים דרך לוגיקת המסך`);
  console.log(line);
  const swBad = sw.gateFailed.length + sw.threw.length + sw.mismatched.length +
    sw.noBlankInHtml.length + sw.emptyExp.length;
  console.log(`  נפסלו בשער : ${sw.gateFailed.length}${sw.gateFailed.length ? ' · ' + sw.gateFailed.slice(0, 10).join(', ') : ''}`);
  console.log(`  זרקו       : ${sw.threw.length}`);
  for (const t of sw.threw.slice(0, 10)) console.log(`      ⛔ ${t}`);
  console.log(`  אי-התאמה   : ${sw.mismatched.length}`);
  for (const t of sw.mismatched.slice(0, 10)) console.log(`      ⛔ ${t}`);
  console.log(`  בלי חריץ   : ${sw.noBlankInHtml.length}`);
  console.log(`  הסבר ריק   : ${sw.emptyExp.length}`);
  console.log(`  ⚠ אפשרויות כפולות באותו פריט : ${sw.dupOptions.length}${sw.dupOptions.length ? ' · ' + sw.dupOptions.slice(0, 8).join(', ') : ''}`);
  console.log(`  ⚠ מספר חריצים שונה מ-1       : ${sw.multiBlank.length}${sw.multiBlank.length ? ' · ' + sw.multiBlank.slice(0, 8).join(', ') : ''}`);

  console.log(`\n${line}`);
  console.log(`פסק דין · ${results.length - hardFails} מתוך ${results.length} תרחישים עברו · ` +
    `סריקה: ${sw.total - swBad} מתוך ${sw.total} פריטים תקינים`);
  console.log(line);
  process.exitCode = (hardFails || swBad) ? 1 : 0;
})();
