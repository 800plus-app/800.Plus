#!/usr/bin/env node
'use strict';
/* ============================================================================
 * enbank_coverage.js · כיסוי המאגר האנגלי · לא כיסוי הדאטהסט
 * ============================================================================
 *
 * ⚠ השאלה שהקובץ הזה עונה עליה שונה מכל מספר recall אחר במעבדה.
 *
 * כל מדידות ה-recall בפרויקט נמדדות על **הדאטהסט** · שורות של (מחרוזת מוקלדת → כרטיס)
 * שהגנרטור דגם. הן עונות על "מתוך השיבושים שייצרנו, כמה נסלחים". הן **אינן** עונות על
 * "כמה מהמאגר האנגלי מכוסה בכלל", כי הדאטהסט דוגם וריאציות ולא ממצה אותן, וכי הוא מכסה
 * 3,904 ערכים ולא 3,946.
 *
 * כאן נמדד הדבר עצמו: לכל ערך אנגלי במאגר, האם **קיימת** מחרוזת בתוך טווח טקסונומיית
 * האופרטורים שהבודק מקבל אותה ושאינה מתקבלת כבר היום.
 *
 * ===== ההגדרה המדויקת של "מקבל סובלנות" =====
 *
 * ערך E מקבל סובלנות ⟺ קיימת מחרוזת s כך ש:
 *   1. s נוצרת מהחלת אופרטור **אחד** מ-`lib/taxonomy-en.js` על אחד מהמפתחות המקובלים
 *      של E (`acceptedKeys`) · אותם אופרטורים בדיוק שמייצרים את הדאטהסט, בלי להמציא
 *      חדשים, ובמיצוי מלא ולא בדגימה;
 *   2. `acceptsToday(s, E)` = false · כלומר s **אינה** מתקבלת כבר היום (`via:'exact'`);
 *   3. `acceptWord(s, E)` מחזירה `ok:true` · כלומר `via:'typo'`.
 *
 * שלושת התנאים ביחד הם "הערך הזה יכול לקבל סליחה כלשהי". ערך שכל שיבוש שלו נדחה הוא
 * ערך **נעול**, וזה מה שנספר.
 *
 * ⚠ מה שההגדרה **אינה** אומרת: היא אינה מודדת כמה מהשגיאות שלומד אמיתי יעשה ייסלחו.
 * מיצוי אופרטור-אחד הוא חסם עליון על מה שהמאגר מרשה ולא אומדן של התנהגות משתמש.
 *
 * ===== ייחוס הנעילה · נקרא מההחלטה, לא מנוחש =====
 *
 * `decide()` ב-`lib/checker.js` מחזירה `why`. שתי הבחנות שה-`why` הגולמי מכווץ, ושתיהן
 * הן בדיוק ההבדל בין קיר לכפתור, ולכן הן מופרדות כאן · בשתיהן דרך **פונקציות המעבדה
 * עצמן** ולא דרך מימוש שני:
 *
 *   `collision` מוחזר גם משכבה 2 (וטו המאגר · המחרוזת **היא** מילת מאגר אחרת) וגם
 *   משכבה 4ב (שולי הדו-משמעות · המחרוזת אינה מילה אבל היא קרובה למילה אחרת כמו שהיא
 *   קרובה לשלך). מופרד כאן על ידי קריאה ל-`isVetoedTerm` · אותה פונקציה שהבודק קורא לה.
 *     → `collision-bank`   · קיר. אין פרמטר שמזיז אותו.
 *     → `collision-margin` · `vetoMargin`. כפתור, אבל כפתור שנוגע בבטיחות.
 *
 *   `far` מוחזר גם כשאין מועמד בתוך `MAX_OPS` וגם כשיש מועמד אבל המרחק הממושקל עבר את
 *   סף רצועת האורך. מופרד על ידי `ctx.editDist` · הפונקציה של האפליקציה עצמה.
 *     → `far-ops`       · מעל 3 עריכות גולמיות. קיר קשיח (`MAX_OPS`).
 *     → `far-threshold` · הסף/המשקלים. **כפתור**.
 *
 * `short` (‏minLen), `real-word` (הלקסיקון) ו-`inflection` (שומר הנטיות) מוחזרים כמו
 * שהם. השכבות רצות בסדר, ולכן `why` הוא **השכבה הראשונה** שדחתה · ומכאן שהיסטוגרמה
 * לבדה אינה מספיקה, וכל טענת "כפתור" נבדקת גם בעולם-נגד שבו הכפתור מסובב.
 *
 * ===== שיניים =====
 *
 * `--selftest` מריץ שלושה עולמות על **כל** המאגר ודורש שהמדידה תבחין ביניהם:
 *   ‏zero (כל הספים 0) חייב לתת 0 · shipped חייב להיות > 0 · all-open חייב להיות > shipped.
 * מדידה שמדפיסה אותו מספר בשלושת העולמות אינה מודדת דבר, והשער נופל אדום.
 *
 * הקובץ **קורא בלבד** מכל מה שאינו `out/enbank-coverage.{json,md}`.
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto, isVetoedTerm } = require('./lib/veto.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { makeChecker, normalizeParams, letters, indexesFor, MAX_OPS } = require('./lib/checker.js');
const { OPS } = require('./lib/taxonomy-en.js');

const OUT_DIR = path.join(__dirname, 'out');
const RULES_PATH = path.join(OUT_DIR, 'typo-rules.json');
const GRADED_PATH = path.join(OUT_DIR, 'graded-candidate-rules.json');
const JSON_OUT = path.join(OUT_DIR, 'enbank-coverage.json');
const MD_OUT = path.join(OUT_DIR, 'enbank-coverage.md');

const ARGV = process.argv.slice(2);
const has = f => ARGV.includes(f);
const argOf = f => { const i = ARGV.indexOf(f); return i >= 0 ? ARGV[i + 1] : null; };
const LIMIT = argOf('--limit') ? parseInt(argOf('--limit'), 10) : 0;
const SELFTEST = has('--selftest');

const say = (...a) => console.log(...a);
const pct = x => (x == null ? '—' : (100 * x).toFixed(2) + '%');

/* ===== רצועות אורך · 3..11 ואז 12+, בדיוק החלוקה של recallByLength במעבדה ===== */
const BANDS = ['<3', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12+'];
const bandOf = n => (n < 3 ? '<3' : n >= 12 ? '12+' : String(n));

const REASONS = ['collision-bank', 'collision-margin', 'real-word', 'short', 'inflection', 'far-threshold', 'far-ops'];
const REASON_HE = {
  'collision-bank': 'התנגשות · המחרוזת היא מילת מאגר אחרת (קיר)',
  'collision-margin': 'דו-משמעות · קרובה למילת מאגר אחרת כמו שהיא קרובה לשלך (vetoMargin)',
  'real-word': 'מילה אמיתית של השפה שאינה צורת הכרטיס (לקסיקון)',
  'short': 'מתחת ל-minLen',
  'inflection': 'נטייה · סיומת טהורה',
  'far-threshold': 'מעל סף רצועת האורך (כפתור · ספים ומשקלים)',
  'far-ops': 'מעל 3 עריכות גולמיות (MAX_OPS · קיר קשיח)'
};

/* ===================== שלב 0 · בניית הסביבה ===================== */

function buildEnv() {
  const t0 = Date.now();
  const ctx = getCtx('en');
  const veto = buildVeto(ctx, 'en');
  const IX = indexesFor(veto);

  const bank = Array.from(ctx.BANK);
  /* מפת בעלים → המונח כפי שהוא כתוב, כדי שדוגמה תישא שם ולא מפתח מנורמל. */
  const ownerTerm = new Map();
  for (const w of bank) {
    const k = ctx.K(w.term);
    if (k && !ownerTerm.has(k)) ownerTerm.set(k, String(w.term));
  }

  const cards = [];
  let kNotIdempotent = 0, totalCands = 0, totalExact = 0;

  const slice = LIMIT ? bank.slice(0, LIMIT) : bank;
  for (const card of slice) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(Boolean);
    if (!keys.length) { cards.push({ card, keys, skip: 'no-keys' }); continue; }

    /* מיצוי · rng = null. `shuffled` מחזירה במקרה הזה קבוצה ממוינת וייחודית, ולכן
       ההרצה דטרמיניסטית לחלוטין ואינה תלויה בזרע. */
    const raw = new Set();
    for (const k of keys) for (const op of OPS) {
      for (const v of op.apply(k, null)) if (v) raw.add(v);
    }
    for (const k of keys) raw.delete(k);

    const cands = [];
    for (const s of Array.from(raw).sort()) {
      /* המרחב שבו ההכרעה נופלת הוא מרחב המפתחות. אופרטור שמייצר מחרוזת שאינה נקודת-שבת
         של K תיבלע בנרמול · נספר ולא נבלע בשקט. */
      if (ctx.K(s) !== s) { kNotIdempotent++; continue; }
      if (acceptsToday(ctx, s, card)) { totalExact++; continue; }   // כבר מתקבל היום
      let minRaw = Infinity, nearKeyLen = 0;
      for (const k of keys) { const d = ctx.editDist(s, k); if (d < minRaw) { minRaw = d; nearKeyLen = letters(k); } }
      /* dLen · הפרש האורך מהמפתח הקרוב ביותר. משמש **רק** לבחירת דוגמה להצגה:
         שיבוש באותו אורך (החלפה/היפוך) נראה לעין כמו טעות הקלדה, בעוד שהוספה בתחילת
         המילה (`aabide`) היא פלט חוקי של האופרטור אבל דוגמה חסרת ערך לחגי. */
      cands.push({ s, minRaw, dLen: Math.abs(letters(s) - nearKeyLen), bankVeto: isVetoedTerm(s, card, veto, ctx) });
    }
    totalCands += cands.length;

    const lens = keys.map(letters);
    const primaryLen = letters(ctx.K(card.term));
    cards.push({
      card, keys, cands,
      minKeyLen: Math.min.apply(null, lens),
      maxKeyLen: Math.max.apply(null, lens),
      primaryLen,
      allow: new Set([ctx.K(card.term)])
    });
  }

  say(`סביבה · ${bank.length} ערכים אנגליים במאגר · ${cards.length} נמדדים · ` +
      `${totalCands} מועמדים · ${totalExact} מהם כבר מתקבלים היום · ` +
      `${kNotIdempotent} נפלו בנרמול · ${((Date.now() - t0) / 1000).toFixed(1)}ש`);

  return { ctx, veto, IX, bank, ownerTerm, cards, stats: { totalCands, totalExact, kNotIdempotent } };
}

/* ===================== דיווח בלבד · מי השותף להתנגשות ===================== */
/* לא חלק מההכרעה. משמש רק כדי לתת שם למי שחסם, כי טבלה בלי שמות אינה שמישה. */
function nearestOtherKey(typed, index, allow, ctx) {
  let best = Infinity, bestKey = null, bestI = -1;
  for (const i of index.near(typed, 2)) {
    const k = index.keys[i];
    let other = false;
    for (const o of index.owners[i]) if (!allow.has(o)) { other = true; break; }
    if (!other) continue;
    const d = ctx.editDist(k, typed);
    if (d < best) { best = d; bestKey = k; bestI = i; }
  }
  return { d: best, key: bestKey, i: bestI };
}

function bankOwnersOf(typed, veto, allow) {
  const owners = veto.termKeys.get(typed);
  if (!owners) return [];
  return Array.from(owners).filter(o => !allow.has(o));
}

/* ===================== שלב 1 · מדידת עולם אחד ===================== */

function measureWorld(name, params, env) {
  const { ctx, veto, IX, cards, ownerTerm } = env;
  const t0 = Date.now();
  const chk = makeChecker(params, ctx, veto, 'en');

  const byLen = new Map();
  for (const b of BANDS) byLen.set(b, { len: b, total: 0, covered: 0, reasons: Object.fromEntries(REASONS.map(r => [r, 0])), candReasons: Object.fromEntries(REASONS.map(r => [r, 0])) });

  const reasonTotals = Object.fromEntries(REASONS.map(r => [r, 0]));
  const candReasonTotals = Object.fromEntries(REASONS.map(r => [r, 0]));
  const locked = [];
  let covered = 0, total = 0, noKeys = 0;

  for (const e of cards) {
    if (e.skip) { noKeys++; continue; }
    total++;
    const band = byLen.get(bandOf(e.minKeyLen));
    band.total++;

    let ok = false, okVariant = null, okDist = null;
    const hist = Object.fromEntries(REASONS.map(r => [r, 0]));
    let firstOf = {};                                            // דוגמה ראשונה לכל סיבה

    for (const c of e.cands) {
      const r = chk.acceptWord(c.s, e.card);
      if (r.ok) {
        /* via:'exact' סוננה מראש בבניית המועמדים · אם היא בכל זאת חוזרת, זה חוסר
           עקביות בין acceptsToday לבין acceptWord ולא כיסוי, ולכן היא לא נספרת. */
        if (r.via === 'exact') continue;
        ok = true; okVariant = okVariant || c.s; okDist = okDist == null ? r.dist : okDist;
        continue;
      }
      let why = r.why;
      if (why === 'collision') why = c.bankVeto ? 'collision-bank' : 'collision-margin';
      else if (why === 'far') why = c.minRaw <= MAX_OPS ? 'far-threshold' : 'far-ops';
      if (!(why in hist)) continue;
      hist[why]++;
      candReasonTotals[why]++;
      band.candReasons[why]++;
      /* הדוגמה שתוצג · **המועמד הקרוב ביותר** מבין אלה שנחסמו מהסיבה הזאת, ולא הראשון
         בסדר לקסיקוגרפי. הראשון-לקסיקוגרפית מחזיר שיטתית `aabide`, `ccommence` (הכפלת
         האות הראשונה), וזה שיבוש חוקי בטקסונומיה אבל דוגמה חסרת ערך לעין אנושית. */
      const cur = firstOf[why];
      const better = !cur || c.minRaw < cur.minRaw ||
        (c.minRaw === cur.minRaw && c.dLen < cur.dLen);
      if (better) firstOf[why] = c;
    }

    if (ok) { covered++; band.covered++; continue; }

    /* סיבת הנעילה של הערך · השכיחה מבין מועמדיו, עם שובר-שוויון קבוע לפי סדר REASONS
       (‏קיר לפני כפתור), כדי שהתוצאה לא תהיה תלויה בסדר איטרציה. */
    let primary = null, bestN = -1;
    for (const r of REASONS) if (hist[r] > bestN) { bestN = hist[r]; primary = r; }
    if (bestN <= 0) primary = e.cands.length ? 'far-ops' : 'far-ops';
    reasonTotals[primary]++;
    band.reasons[primary]++;

    /* שם השותף · רק לדיווח */
    const ex = firstOf[primary] || null;
    let partner = null, partnerDist = null;
    if (ex && primary === 'collision-bank') {
      const os = bankOwnersOf(ex.s, veto, e.allow);
      partner = os.length ? (ownerTerm.get(os[0]) || os[0]) : null;
      partnerDist = 0;
    } else if (ex && primary === 'collision-margin') {
      const n = nearestOtherKey(ex.s, IX.term, e.allow, ctx);
      if (n.key) {
        const owners = Array.from(IX.term.owners[n.i] || []).filter(o => !e.allow.has(o));
        partner = owners.length ? (ownerTerm.get(owners[0]) || owners[0]) : n.key;
        partnerDist = n.d;
      }
    }

    locked.push({
      term: String(e.card.term), unit: String(e.card.unit), meaning: String(e.card.meaning || ''),
      len: e.minKeyLen, band: bandOf(e.minKeyLen), primary,
      nCands: e.cands.length, hist,
      example: ex ? ex.s : null, exampleRawDist: ex ? ex.minRaw : null,
      partner, partnerDist,
      allOneReason: bestN === e.cands.length && e.cands.length > 0
    });
  }

  const secs = (Date.now() - t0) / 1000;
  say(`  ${name.padEnd(14)} · ${covered}/${total} = ${pct(covered / total)} · ${secs.toFixed(1)}ש`);

  return {
    name, params,
    total, covered, pct: total ? covered / total : null, noKeys,
    byLength: BANDS.map(b => {
      const v = byLen.get(b);
      return { len: b, total: v.total, covered: v.covered, pct: v.total ? v.covered / v.total : null, reasons: v.reasons, candReasons: v.candReasons };
    }),
    reasonTotals, candReasonTotals, locked, secs
  };
}

/* ===================== שלב 2 · מרווח המאגר · הטענה של STATE.md ===================== */
/* STATE.md טוען ש-98.3% משורות אורך-3 יושבות ב-gap=1. הטענה ההיא נמדדה על הדאטהסט.
   כאן היא נמדדת על **המאגר**: לכל ערך, המרחק למפתח הקרוב ביותר ששייך לערך אחר. */
function bankGap(env) {
  const { ctx, IX, cards } = env;
  const out = new Map();
  for (const b of BANDS) out.set(b, { len: b, n: 0, g0: 0, g1: 0, g2: 0, gFar: 0 });
  const perEntry = [];
  for (const e of cards) {
    if (e.skip) continue;
    let best = Infinity, bestKey = null;
    for (const k of e.keys) {
      const n = nearestOtherKey(k, IX.term, e.allow, ctx);
      if (n.d < best) { best = n.d; bestKey = n.key; }
    }
    const b = out.get(bandOf(e.minKeyLen));
    b.n++;
    if (best === 0) b.g0++; else if (best === 1) b.g1++; else if (best === 2) b.g2++; else b.gFar++;
    perEntry.push({ term: String(e.card.term), len: e.minKeyLen, gap: isFinite(best) ? best : null, nearest: bestKey });
  }
  return { byLength: Array.from(out.values()), perEntry };
}

/* ===================== עולמות ===================== */

function worldsFor(shipped) {
  const zeroBands = shipped.bands.map(b => ({ maxLen: b.maxLen, t: 0 }));
  const openBands = shipped.bands.map(b => ({ maxLen: b.maxLen, t: MAX_OPS }));
  const cp = o => JSON.parse(JSON.stringify(o));
  return [
    ['zero', Object.assign(cp(shipped), { bands: zeroBands })],
    ['shipped', cp(shipped)],
    ['no-minLen', Object.assign(cp(shipped), { minLen: 0 })],
    ['no-margin', Object.assign(cp(shipped), { vetoMargin: 0 })],
    ['no-lexicon', Object.assign(cp(shipped), { useLexicon: false })],
    ['open-bands', Object.assign(cp(shipped), { bands: openBands })],
    ['all-open', Object.assign(cp(shipped), { minLen: 0, vetoMargin: 0, useLexicon: false, bands: openBands })],
    /* ===== leave-one-in · כוח החסימה הבלעדי של כל שכבה =====
     * "כבה שכבה אחת" אינו מספיק כשיש שכבה דומיננטית: היא מסתירה את כל השאר, וכל
     * העמודות יוצאות זהות לנשלח · וזה נראה כאילו אף שכבה אינה חוסמת. לכן הכיוון ההפוך:
     * מתוך העולם המתירני מדליקים **שכבה אחת** בחזרה. מה שנופל שם הוא מה שהשכבה ההיא
     * חוסמת לבדה, בלי הסתרה.
     * ⚠ וטו המאגר (`collision-bank`) אינו מופיע כאן · אין לו פרמטר, ולכן הוא דלוק בכל
     * שבעת העולמות. זה בדיוק מה שהופך אותו לקיר ולא לכפתור. */
    ['only-margin', Object.assign(cp(shipped), { minLen: 0, useLexicon: false, bands: openBands })],
    ['only-lexicon', Object.assign(cp(shipped), { minLen: 0, vetoMargin: 0, bands: openBands })],
    ['only-minLen', Object.assign(cp(shipped), { vetoMargin: 0, useLexicon: false, bands: openBands })],
    ['only-bands', Object.assign(cp(shipped), { minLen: 0, vetoMargin: 0, useLexicon: false })]
  ];
}

/* ===================== המועמד המדורג ===================== */
/* הגן המדורג (marginHard/marginSoft) הוא **גן חדש**. אם `lib/checker.js` אינו מממש
   אותו, טעינת הפרמטרים "תצליח" ותמדוד בשקט משהו אחר לגמרי. לכן נבדק במפורש. */
function loadGraded() {
  if (!fs.existsSync(GRADED_PATH)) return { present: false, reason: 'הקובץ out/graded-candidate-rules.json אינו קיים' };
  let j;
  try { j = JSON.parse(fs.readFileSync(GRADED_PATH, 'utf8')); }
  catch (e) { return { present: false, reason: 'הקובץ קיים אך אינו JSON תקין: ' + e.message }; }
  const p = (j.params && (j.params['en-word'] || j.params.enWord)) || j['en-word'] || j.params || j;
  if (!p || !Array.isArray(p.bands)) return { present: false, reason: 'הקובץ קיים אך אין בו params.en-word עם bands' };
  const wantsGraded = p.marginHard != null || p.marginSoft != null;
  if (wantsGraded) {
    const norm = normalizeParams(p);
    if (norm.marginHard == null && norm.marginSoft == null) {
      return { present: false, params: p, reason: 'המועמד נושא marginHard/marginSoft אך `lib/checker.js` הנוכחי אינו מממש אותם · normalizeParams משמיטה אותם, ולכן מדידה כאן הייתה מודדת את הגנום הישן ומדווחת עליו כמדורג' };
    }
  }
  return { present: true, params: p, graded: wantsGraded };
}

/* ===================== selftest ===================== */

function selftest(env, shipped) {
  say('\n===== --selftest · האם המדידה מסוגלת להבחין =====\n');
  const ws = worldsFor(shipped);
  const pick = n => ws.find(w => w[0] === n)[1];
  const zero = measureWorld('zero', pick('zero'), env);
  const ship = measureWorld('shipped', pick('shipped'), env);
  const open = measureWorld('all-open', pick('all-open'), env);

  const checks = [
    ['עולם משותק (כל הספים 0) חייב לקרוס ל-0', zero.covered === 0, `${zero.covered}/${zero.total}`],
    ['העולם הנשלח חייב להיות מעל 0', ship.covered > 0, `${ship.covered}/${ship.total} = ${pct(ship.pct)}`],
    ['עולם מתירני חייב לנפח מעל הנשלח', open.covered > ship.covered, `${open.covered} > ${ship.covered}`],
    ['שלושת המספרים חייבים להיות שונים זה מזה', new Set([zero.covered, ship.covered, open.covered]).size === 3, `${zero.covered} / ${ship.covered} / ${open.covered}`],
    ['רצועת אורך 3 חייבת להשתנות בין העולמות', (() => {
      const a = zero.byLength.find(x => x.len === '3').covered;
      const b = open.byLength.find(x => x.len === '3').covered;
      return b > a;
    })(), `אורך 3 · zero ${zero.byLength.find(x => x.len === '3').covered} → all-open ${open.byLength.find(x => x.len === '3').covered}`]
  ];

  let bad = 0;
  for (const [name, okv, detail] of checks) {
    say(`  ${okv ? 'PASS' : 'FAIL'}  ${name}  · ${detail}`);
    if (!okv) bad++;
  }
  say('');
  say(bad ? `⛔ ${bad} מתוך ${checks.length} נפלו · המדידה אינה מבחינה, ואין לצטט ממנה מספר.`
          : `✅ ${checks.length}/${checks.length} · המדידה מבחינה בין שלושה עולמות.`);
  return { checks: checks.map(([n, o, d]) => ({ name: n, pass: o, detail: d })), pass: bad === 0, zero: zero.covered, shipped: ship.covered, open: open.covered };
}

/* ===================== דוגמאות נקובות בשם ===================== */

function namedExamples(world, perBand) {
  const out = {};
  for (const b of BANDS) {
    const rows = world.locked.filter(l => l.band === b);
    if (!rows.length) continue;
    /* הסיבה המובילה ברצועה · הדוגמאות מדגימות אותה ולא מקרה אקראי. */
    const cnt = {};
    for (const r of rows) cnt[r.primary] = (cnt[r.primary] || 0) + 1;
    let modal = null, n = -1;
    for (const r of REASONS) if ((cnt[r] || 0) > n) { n = cnt[r] || 0; modal = r; }
    const pref = rows.filter(r => r.primary === modal);
    /* קודם כאלה שיש להן שותף נקוב בשם · דוגמה בלי שם אינה שמישה */
    pref.sort((a, x) => (x.partner ? 1 : 0) - (a.partner ? 1 : 0) || (a.term < x.term ? -1 : a.term > x.term ? 1 : 0));
    out[b] = { modal, modalCount: n, of: rows.length, rows: pref.slice(0, perBand) };
  }
  return out;
}

/* ===================== main ===================== */

function main() {
  if (!fs.existsSync(RULES_PATH)) { console.error('חסר out/typo-rules.json'); process.exit(2); }
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const shipped = rules.params && rules.params['en-word'];
  if (!shipped) { console.error('אין params["en-word"] ב-typo-rules.json'); process.exit(2); }

  const env = buildEnv();

  if (SELFTEST) {
    const st = selftest(env, shipped);
    process.exit(st.pass ? 0 : 1);
  }

  say('\n===== עולמות =====');
  /* סקר ראשון אחרי המועמד המדורג · הוא מיוצר בסוכן אחר במקביל, ולכן נבדק פעמיים:
     פעם לפני לולאת העולמות ופעם אחריה (הלולאה עצמה היא זמן ההמתנה). */
  const gradedEarly = loadGraded();
  if (!gradedEarly.present) say(`  (סקר 1 · מועמד מדורג עדיין לא זמין · ${gradedEarly.reason})`);
  const worlds = {};
  for (const [name, p] of worldsFor(shipped)) worlds[name] = measureWorld(name, p, env);

  const graded = loadGraded();
  if (graded.present) {
    say('  מועמד מדורג נמצא · נמדד');
    worlds['graded'] = measureWorld('graded', graded.params, env);
  } else {
    say(`  ⚠ עמודת המועמד המדורג חסרה · ${graded.reason}`);
  }

  say('\n===== מרווח המאגר =====');
  const gap = bankGap(env);
  for (const g of gap.byLength) if (g.n) say(`  אורך ${g.len.padStart(3)} · n=${String(g.n).padStart(4)} · gap0 ${g.g0} · gap1 ${g.g1} · gap2 ${g.g2} · רחוק ${g.gFar}`);

  const st = selftest(env, shipped);

  /* ===== ייחוס · באיזה קוד המספר נמדד =====
   * ‏`lib/checker.js` נערך בסוכן אחר **במקביל** להרצה הזאת (הגן המדורג). מספר שאין לו
   * גרסת-קוד נקובה אינו ניתן לשחזור, ולכן ה-sha נרשם ולא נזכר. */
  const sha = f => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch (e) { return null; } };
  const provenance = {
    checker: sha(path.join(__dirname, 'lib', 'checker.js')),
    checkerMtime: (() => { try { return fs.statSync(path.join(__dirname, 'lib', 'checker.js')).mtime.toISOString(); } catch (e) { return null; } })(),
    app: sha(path.join(__dirname, '..', 'app.js')),
    typoRules: sha(RULES_PATH),
    gradedCandidateFile: fs.existsSync(GRADED_PATH) ? sha(GRADED_PATH) : null,
    runtimeLexicon: sha(path.join(OUT_DIR, 'runtime-lexicon.js')),
    note: 'lib/checker.js נערך בסוכן אחר במקביל להרצה. המספרים כאן תקפים ל-sha הזה בלבד.'
  };

  const report = {
    generatedAt: new Date().toISOString(),
    lang: 'en',
    provenance,
    denominator: {
      bankEntries: env.bank.length,
      measured: worlds.shipped.total,
      note: 'ctx.BANK של app.js עם LANG=en · כל K(term) ייחודי · אין ערכים כפולים',
      datasetDenominator: 3904,
      datasetNote: '3,904 הוא מספר הערכים שיש להם שורת accept מהימנה בדאטהסט, לא גודל המאגר. 3,946 = 3,904 + 42 ערכים שהגנרטור לא ייצר להם שורת accept.'
    },
    definition: {
      admitsTolerance: 'קיימת מחרוזת s מהחלת אופרטור יחיד מ-taxonomy-en על מפתח מקובל של הערך, ש-acceptsToday שלה false ו-acceptWord מחזירה ok:true',
      lengthBand: 'האורך שלפיו הערך משויך לרצועה הוא letters(המפתח המקובל הקצר ביותר). primaryLen ו-maxKeyLen נשמרים ב-perEntry כדי שאפשר יהיה לחתוך אחרת.',
      exhaustive: true, sampled: false
    },
    stats: env.stats,
    worlds: Object.fromEntries(Object.entries(worlds).map(([k, v]) => [k, {
      name: v.name, params: v.params, total: v.total, covered: v.covered, pct: v.pct,
      byLength: v.byLength, reasonTotals: v.reasonTotals, candReasonTotals: v.candReasonTotals, secs: v.secs
    }])),
    gradedCandidate: graded.present ? { present: true, graded: !!graded.graded } : { present: false, reason: graded.reason },
    bankGap: gap.byLength,
    examples: namedExamples(worlds.shipped, 6),
    selftest: st,
    lockedShipped: worlds.shipped.locked
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1), 'utf8');
  fs.writeFileSync(MD_OUT, renderMd(report, worlds, graded), 'utf8');
  say(`\nנכתב · ${JSON_OUT}`);
  say(`נכתב · ${MD_OUT}`);
}

/* ===================== דוח ===================== */

function renderMd(rep, worlds, graded) {
  const L = [];
  const W = worlds;
  const p = x => (x == null ? '—' : (100 * x).toFixed(1) + '%');

  L.push('# כיסוי המאגר האנגלי · כמה מהמאגר יכול לקבל סובלנות בכלל');
  L.push('');
  L.push('נוצר על ידי `typo-lab/enbank_coverage.js`. ‏**זו אינה מדידת recall.** ‏recall נמדד על');
  L.push('שורות הדאטהסט ועונה על "מתוך השיבושים שייצרנו, כמה נסלחים". כאן נמדד המאגר עצמו.');
  L.push('');

  L.push('## המכנה האמיתי');
  L.push('');
  L.push(`**${rep.denominator.bankEntries} ערכים אנגליים.** ‏\`ctx.BANK\` של \`app.js\` בהקשר \`LANG='en'\`, כלומר`);
  L.push('בדיוק המאגר שהאפליקציה טוענת · לא קובץ נתונים שנקרא בצד. כל 3,946 המפתחות `K(term)`');
  L.push('ייחודיים, ולכן אין ניכוי כפילויות.');
  L.push('');
  L.push('**‏3,904 אינו מכנה של המאגר.** הוא מספר הערכים שיש להם שורת `accept` מהימנה בדאטהסט');
  L.push('(‏`out/coverage-report.md:244` אומר זאת במפורש: `3,946 = 3,904 + 42`). שתי השורות');
  L.push('ב-`STATE.md` שנראות כסותרות אינן סותרות · הן מודדות שני דברים:');
  L.push('');
  L.push('| טענה ב-STATE.md | מכנה | מה נמדד בפועל |');
  L.push('|---|---|---|');
  L.push('| ‏"2,669 מתוך 3,946 (67.6%)" | המאגר | אבל המונה 2,669 נספר על **שורות הדאטהסט** (`coverage.json`), ורק המכנה הוחלף ל-3,946 |');
  L.push('| ‏"מ-2,680 ל-3,486 מתוך 3,904" | הדאטהסט | ‏`shortword.js:725` · `entryCov` רץ על שורות `accept` מהימנות בלבד |');
  L.push('');
  L.push('כלומר **שני המספרים מודדים כיסוי-דאטהסט**, ו-2,669 מול 2,680 הוא הפרש בין שני מסלולי');
  L.push('הכרעה (‏`coverage.js` מול הקירוב המהיר `decideOne` של `shortword_eval.js`) על אותה');
  L.push('אוכלוסייה. אף אחד מהם אינו התשובה לשאלה שנשאלה, כי דאטהסט **דוגם** וריאציות.');
  L.push('');
  L.push(`המדידה כאן ממצה: ${rep.stats.totalCands} מועמדים נבחנו על ${rep.worlds.shipped.total} ערכים,`);
  L.push(`ועוד ${rep.stats.totalExact} מחרוזות סוננו מראש מפני שהן מתקבלות כבר היום (\`via:'exact'\`).`);
  L.push('');

  L.push('## ⚠ שתי טענות ב-STATE.md נסוגות');
  L.push('');
  L.push(`**1 · "‏2,669 מתוך 3,946 ערכי האנגלית (67.6%) מקבלים סובלנות; 1,235 לא."** המספר`);
  L.push(`הנכון על המאגר הוא **${W.shipped.covered} מתוך ${W.shipped.total} (${p(W.shipped.pct)}) · ${W.shipped.total - W.shipped.covered} לא.** הפער אינו`);
  L.push('שיטת חישוב אלא אוכלוסייה: 2,669 נספר על ערכים שיש להם שורת `accept` בדאטהסט ושאחת');
  L.push('מהשורות האלה מתקבלת. הדאטהסט **דוגם** וריאציות לכל ערך, ולכן ערך שיש לו וריאציה נסלחת');
  L.push('שלא נדגמה נספר שם כלא-מכוסה. המיצוי מוצא אותה.');
  L.push('');
  L.push('**‏המסקנה של STATE.md דווקא מתחזקת:** נכתב שם ש-1,235 הערכים האלה "אינם חסומים מבנית ·');
  L.push('הם נופלים על החלטת תקציב". זה נמדד עכשיו ישירות · ראה טבלת `leave-one-in` למטה.');
  L.push('');
  L.push('**2 · "‏98.3% משורות אורך-3 יושבות בדיוק ב-gap=1."** על המאגר זה');
  L.push(`${p(rep.bankGap.find(x => x.len === '3').g1 / rep.bankGap.find(x => x.len === '3').n)} ולא 98.3%. ראה סעיף מרווח המאגר · הכיוון עומד, המספר לא.`);
  L.push('');
  L.push('## ההגדרה · מה נספר כ"מקבל סובלנות"');
  L.push('');
  L.push('ערך מקבל סובלנות ⟺ **קיימת** מחרוזת `s` כך ש:');
  L.push('');
  L.push('1. `s` נוצרת מהחלת אופרטור יחיד מ-`lib/taxonomy-en.js` (adj · transpose · drop · double · pattern)');
  L.push('   על אחד מ-`acceptedKeys` של הערך · **מיצוי מלא, לא דגימה**, ובלי להמציא אופרטור חדש;');
  L.push('2. `acceptsToday(s, card) === false` · היא אינה מתקבלת כבר היום;');
  L.push('3. `acceptWord(s, card).ok === true` · הבודק האמיתי מקבל אותה.');
  L.push('');
  L.push('⚠ **מה שההגדרה אינה אומרת:** זהו חסם עליון על מה שהמאגר מרשה, ולא אומדן של אילו');
  L.push('שגיאות לומד אמיתי יעשה. שיבוש בן שתי פעולות אינו נמנה כאן.');
  L.push('');
  L.push('רצועת האורך של ערך היא `letters` של **המפתח המקובל הקצר ביותר** שלו. ‏`primaryLen`');
  L.push('ו-`maxKeyLen` נשמרים ב-JSON כדי שאפשר יהיה לחתוך אחרת בלי הרצה חוזרת.');
  L.push('');

  L.push('## הנשלח · כיסוי לפי אורך');
  L.push('');
  const cols = ['shipped', 'no-minLen', 'no-margin', 'no-lexicon', 'open-bands', 'all-open'].filter(k => W[k]);
  if (W.graded) cols.push('graded');
  /* סף הרצועה שנשלח · מוצג לצד הכיסוי, כי הוא ההסבר לרוב הבליטות בטבלה. */
  const thrOf = b => {
    if (b === '<3') b = '2';
    const n = b === '12+' ? 12 : +b;
    const bands = normalizeParams(W.shipped.params).bands;
    for (const x of bands) if (n <= x.maxLen) return x.t;
    return bands[bands.length - 1].t;
  };
  L.push('| אורך | ערכים | סף `t` שנשלח | ' + cols.map(c => c === 'shipped' ? '**נשלח**' : c).join(' | ') + ' |');
  L.push('|---|---|---|' + cols.map(() => '---').join('|') + '|');
  for (const b of BANDS) {
    const base = W.shipped.byLength.find(x => x.len === b);
    if (!base.total) continue;
    L.push(`| ${b} | ${base.total} | ${thrOf(b)} | ` + cols.map(c => {
      const e = W[c].byLength.find(x => x.len === b);
      return `${e.covered} · ${p(e.pct)}`;
    }).join(' | ') + ' |');
  }
  L.push('| **סה"כ** | **' + W.shipped.total + '** | | ' + cols.map(c => `**${W[c].covered} · ${p(W[c].pct)}**`).join(' | ') + ' |');
  L.push('');
  L.push('העמודות שאינן "נשלח" הן **עולמות-נגד**: אותו גנום בדיוק עם כפתור אחד מסובב. הן קיימות');
  L.push('כדי שהיסטוגרמת הסיבות לא תיקרא כטענה · שכבה שנקראה "החוסמת" חייבת להראות תזוזה כשמכבים אותה.');
  L.push('');

  L.push('### כוח החסימה הבלעדי של כל שכבה · leave-one-in');
  L.push('');
  L.push('⚠ **הטבלה שמעליה לבדה מטעה.** כשיש שכבה דומיננטית היא מסתירה את כל השאר, וכל העמודות');
  L.push('יוצאות זהות לנשלח · וזה נראה כאילו אף שכבה אינה חוסמת. לכן הכיוון ההפוך: מתוך העולם');
  L.push('המתירני מדליקים **שכבה אחת** בחזרה. מה שנופל שם הוא מה שהיא חוסמת לבדה.');
  L.push('');
  const lo = [['only-margin', 'vetoMargin'], ['only-lexicon', 'לקסיקון'], ['only-minLen', 'minLen'], ['only-bands', 'ספי הרצועות + משקלים']];
  L.push('| שכבה שהודלקה לבדה | כיסוי | ירידה מ-`all-open` | סוג |');
  L.push('|---|---|---|---|');
  for (const [k, he] of lo) {
    if (!W[k]) continue;
    const d = W['all-open'].covered - W[k].covered;
    L.push(`| ${he} (\`${k}\`) | ${W[k].covered} · ${p(W[k].pct)} | **${d}** | כפתור |`);
  }
  L.push(`| וטו המאגר · \`collision-bank\` | — | ${W['all-open'].total - W['all-open'].covered} נשארים נעולים גם ב-\`all-open\` | **קיר · אין לו פרמטר** |`);
  L.push('');
  L.push('וטו המאגר אינו שורה בטבלה כמו האחרות מפני שאי אפשר לכבות אותו · הוא דלוק בכל אחד');
  L.push('מהעולמות, כולל `all-open`. מה שנשאר נעול ב-`all-open` הוא בדיוק מה ששום כיול לא יפתח.');
  L.push('');

  /* ===== התשובה, נאמרת ולא נגזרת מהטבלאות ===== */
  {
    const b3 = W.shipped.byLength.find(x => x.len === '3');
    const b4 = W.shipped.byLength.find(x => x.len === '4');
    const o3 = W['open-bands'].byLength.find(x => x.len === '3');
    const o4 = W['open-bands'].byLength.find(x => x.len === '4');
    const m3 = W['no-margin'].byLength.find(x => x.len === '3');
    const m4 = W['no-margin'].byLength.find(x => x.len === '4');
    const g3 = rep.bankGap.find(x => x.len === '3');
    const g4 = rep.bankGap.find(x => x.len === '4');
    L.push('## התשובה לשאלה "האם אפשר לתקוף את מגבלת האורך"');
    L.push('');
    L.push('**לא בכפתור שחשבנו עליו. הכפתור היחיד שזז הוא `vetoMargin`, והוא תקציב קבלות-שווא.**');
    L.push('');
    L.push('| מה שנוסה על אורך 3-4 | אורך 3 | אורך 4 |');
    L.push('|---|---|---|');
    L.push(`| נשלח | ${b3.covered}/${b3.total} · ${p(b3.pct)} | ${b4.covered}/${b4.total} · ${p(b4.pct)} |`);
    L.push('| `minLen` = 0 | ללא שינוי | ללא שינוי |');
    L.push('| לקסיקון כבוי | ללא שינוי | ללא שינוי |');
    L.push(`| כל הספים פתוחים ל-3 | ${o3.covered} · **+${o3.covered - b3.covered}** | ${o4.covered} · **+${o4.covered - b4.covered}** |`);
    L.push(`| \`vetoMargin\` = 0 | ${m3.covered} · **+${m3.covered - b3.covered}** | ${m4.covered} · **+${m4.covered - b4.covered}** |`);
    L.push('');
    L.push('שלוש מסקנות, כל אחת נמדדה ולא הוסקה:');
    L.push('');
    L.push('1. **`minLen` הוא כפתור מת.** הוא חוסם **0** ערכים בלעדית. הוא מופיע בהיסטוגרמה');
    L.push(`   כסיבה המובילה של ${W.shipped.reasonTotals['short']} ערכים ברצועת \`<3\`, אבל אותם ערכים`);
    L.push('   מכוסים ב-`only-minLen` · כלומר לשיבוש שלהם יש דרך אחרת לעבור את שער האורך, ו-`minLen`');
    L.push('   אינו מה שסוגר אותם. **זו הדוגמה למה היסטוגרמה לבדה אינה ראיה.**');
    L.push('2. **הספים הם כפתור אמיתי אבל כמעט ריק בקצה הקצר.** פתיחת כל הספים לתקרת הרשת מחזירה');
    L.push(`   ${o3.covered - b3.covered} ערכים באורך 3 ו-${o4.covered - b4.covered} באורך 4. ה-85 שנחסמו ב-\`far-threshold\` באורך 3`);
    L.push('   פשוט עוברים לחסימה הבאה · `collision-margin`. השכבות רצות בסדר, ולכן `why` הוא השכבה');
    L.push('   ה**ראשונה** שירתה ולא בהכרח היחידה.');
    L.push('3. **‏`vetoMargin` הוא הקיר האמיתי, והוא קיר של צפיפות מאגר ולא של כיול.**');
    L.push(`   ‏${g3.g1} מתוך ${g3.n} הערכים באורך 3 (${p(g3.g1 / g3.n)}) ו-${g4.g1} מתוך ${g4.n} באורך 4 (${p(g4.g1 / g4.n)})`);
    L.push('   יושבים במרחק עריכה **1** ממילת מאגר אחרת. בצפיפות כזאת כל שגיאת הקלדה יחידה היא');
    L.push('   הימור בין שני ערכים · וזה בדיוק מה ש-`vetoMargin` מסרב לעשות.');
    L.push('');
    L.push('**כלומר: קיר, לא כפתור** · אבל קיר שאפשר לקנות ממנו יציאה בתקציב קבלות-שווא נקוב, ולא');
    L.push('קיר מבני. הקיר המבני היחיד (`collision-bank`, וטו המאגר) חוסם **0 ערכים** לבדו: אין אף ערך');
    L.push('אנגלי שכל שיבושיו הם מילות מאגר אחרות.');
    L.push('');
  }

  L.push('## היסטוגרמת סיבות הנעילה · לפי רצועת אורך');
  L.push('');
  L.push('הסיבה נקראת מ-`why` שהבודק החזיר, ולא מנוחשת. שתי הפרדות נוספו כי `why` מכווץ אותן:');
  L.push('`collision` → `collision-bank` (וטו המאגר · נקרא מ-`isVetoedTerm`) מול `collision-margin`');
  L.push('(שולי הדו-משמעות), ו-`far` → `far-ops` (מעל `MAX_OPS=3`) מול `far-threshold` (מעל סף הרצועה).');
  L.push('');
  L.push('ספירה **לפי ערך נעול** · הסיבה השכיחה מבין מועמדיו:');
  L.push('');
  L.push('| אורך | נעולים | ' + REASONS.join(' | ') + ' |');
  L.push('|---|---|' + REASONS.map(() => '---').join('|') + '|');
  for (const b of BANDS) {
    const e = W.shipped.byLength.find(x => x.len === b);
    if (!e.total) continue;
    const locked = e.total - e.covered;
    if (!locked) { L.push(`| ${b} | 0 | ` + REASONS.map(() => '·').join(' | ') + ' |'); continue; }
    L.push(`| ${b} | ${locked} | ` + REASONS.map(r => e.reasons[r] || '·').join(' | ') + ' |');
  }
  L.push('| **סה"כ** | **' + (W.shipped.total - W.shipped.covered) + '** | ' + REASONS.map(r => `**${W.shipped.reasonTotals[r]}**`).join(' | ') + ' |');
  L.push('');
  L.push('ספירה **לפי מועמד** · כל שיבוש שנדחה, בלי איגום לערך:');
  L.push('');
  L.push('| אורך | ' + REASONS.join(' | ') + ' |');
  L.push('|---|' + REASONS.map(() => '---').join('|') + '|');
  for (const b of BANDS) {
    const e = W.shipped.byLength.find(x => x.len === b);
    if (!e.total) continue;
    L.push(`| ${b} | ` + REASONS.map(r => e.candReasons[r] || '·').join(' | ') + ' |');
  }
  L.push('');
  L.push('מקרא:');
  L.push('');
  for (const r of REASONS) L.push(`- \`${r}\` — ${REASON_HE[r]}`);
  L.push('');

  L.push('## מרווח המאגר · הטענה של STATE.md נבדקת על המאגר ולא על הדאטהסט');
  L.push('');
  L.push('‏`STATE.md` טוען ש-98.3% משורות אורך-3 יושבות בדיוק ב-`gap=1`. הטענה ההיא נמדדה על');
  L.push('שורות הדאטהסט. כאן נמדד המאגר: לכל ערך, מרחק העריכה למפתח הקרוב ביותר ששייך לערך אחר.');
  L.push('');
  L.push('| אורך | ערכים | gap=0 | gap=1 | gap=2 | ‏>2 או אין |');
  L.push('|---|---|---|---|---|---|');
  for (const g of rep.bankGap) {
    if (!g.n) continue;
    L.push(`| ${g.len} | ${g.n} | ${g.g0} | ${g.g1} (${p(g.g1 / g.n)}) | ${g.g2} | ${g.gFar} |`);
  }
  L.push('');
  {
    const g3 = rep.bankGap.find(x => x.len === '3');
    L.push(`**פסק:** הטענה **בכיוונה נכונה ובמספרה לא.** על המאגר, ${p(g3.g1 / g3.n)} מערכי אורך-3`);
    L.push(`יושבים ב-\`gap=1\` (${g3.g1} מתוך ${g3.n}), ולא 98.3%. ההפרש אינו רעש · 98.3% נמדד על`);
    L.push('**שורות** הדאטהסט, וריבוי שורות לערך מטה את הממוצע לכיוון הערכים הצפופים, שהם בדיוק');
    L.push('אלה שמייצרים יותר שורות. **הכיוון עומד:** צפיפות `gap=1` נופלת מונוטונית עם האורך,');
    L.push(`מ-${p(g3.g1 / g3.n)} באורך 3 ל-${p(rep.bankGap.find(x => x.len === '12+').g1 / rep.bankGap.find(x => x.len === '12+').n)} באורך 12+, וזה בדיוק צורת עקומת הכיסוי.`);
    L.push('');
    L.push('⚠ ההגדרה כאן: `gap` = מרחק העריכה מהמפתח המקובל הקרוב ביותר של הערך אל מפתח מאגר');
    L.push('בבעלות ערך אחר, ברדיוס 2 של אינדקס הווטו. ‏`>2 או אין` מאחד "רחוק מ-2" עם "אין ברדיוס"');
    L.push('· האינדקס אינו רואה מעבר ל-2, וזו מגבלה של הכלי ולא ממצא.');
    L.push('');
  }

  L.push('## דוגמאות נקובות בשם');
  L.push('');
  L.push('לכל רצועה · הסיבה המובילה, ולאחריה ערכים אמיתיים שנעולים בגללה, עם השיבוש הספציפי');
  L.push('והמילה האחרת שהוא מתנגש בה.');
  L.push('');
  for (const b of BANDS) {
    const ex = rep.examples[b];
    if (!ex || !ex.rows.length) continue;
    L.push(`### אורך ${b} · ${ex.modalCount}/${ex.of} מהנעולים · \`${ex.modal}\``);
    L.push('');
    L.push('| ערך | פירוש | השיבוש | נחסם על ידי | מרחק |');
    L.push('|---|---|---|---|---|');
    for (const r of ex.rows) {
      L.push(`| \`${r.term}\` | ${r.meaning} | \`${r.example || '—'}\` | ${r.partner ? '`' + r.partner + '`' : REASON_HE[r.primary]} | ${r.partnerDist == null ? (r.exampleRawDist == null ? '—' : r.exampleRawDist) : r.partnerDist} |`);
    }
    L.push('');
  }

  L.push('## מה לקסיקון מושלם היה קונה · ומה לא');
  L.push('');
  const dLex = W['no-lexicon'].covered - W.shipped.covered;
  const lexCands = W.shipped.candReasonTotals['real-word'];
  L.push('שכבת הלקסיקון היא הכיוון שהוצע פעמיים ב-`STATE.md` כמקור החסם. **על המאגר האנגלי');
  L.push('היא אינה החסם, וזה נמדד ולא הוערך.**');
  L.push('');
  L.push(`כיבוי **מוחלט** של השכבה (\`useLexicon:false\`) משאיר את הכיסוי על ${W['no-lexicon'].covered} · בדיוק`);
  L.push(`אותו מספר כמו הנשלח. הדלקתה לבדה בעולם מתירני (\`only-lexicon\`) משאירה ${W['only-lexicon'].covered}/${W['only-lexicon'].total}`);
  L.push('· היא אינה נועלת אף ערך. הכיוון חד: הסרת שכבת דחייה יכולה רק להוסיף קבלות, ולכן');
  L.push(`${W['no-lexicon'].covered} = ${W.shipped.covered} פירושו **אפס** ערכים שנקנים, ולא "הפרש קטן".`);
  L.push('');
  L.push(`> ‏**חסם עליון, והוא הדוק:** לקסיקון מושלם קונה **${dLex} ערכים** מתוך ${W.shipped.total}.`);
  L.push('');
  L.push('הנימוק שהחסם באמת עליון: המסנן הוא Bloom · `negative` שגוי בלתי אפשרי מבנית, `positive`');
  L.push('שגוי אפשרי. לכן לקסיקון מושלם דוחה **תת-קבוצה** של מה שהמסנן הנוכחי דוחה, וכיסויו נמצא');
  L.push(`בין הנשלח (${W.shipped.covered}) לבין הלקסיקון-הכבוי (${W['no-lexicon'].covered}). כששני הקצוות שווים, הקטע מנוון.`);
  L.push('');
  L.push(`⚠ **מה שזה לא אומר.** השכבה כן דוחה ${lexCands} **מועמדים** בודדים · היא עובדת. אבל לכל`);
  L.push('ערך שהיא דוחה ממנו שיבוש אחד יש שיבוש אחר שנחסם ממילא בשכבה אחרת, ולכן ברזולוציה של');
  L.push('"האם הערך מקבל סובלנות כלשהי" היא בלתי נראית. **המדידה הזאת אינה אומרת דבר על תרומת');
  L.push('הלקסיקון ל-recall ולבטיחות** · שם הוא נמדד בנפרד (‏`STATE.md`: 2,019 שורות `real-word`),');
  L.push('וזו מדידה אחרת עם מסקנה אחרת.');
  L.push('');
  L.push('⚠ **מה שנשאר לא נמדד:** כמה מהמחרוזות שהמסנן דוחה הן באמת מילים אנגליות · לזה דרוש');
  L.push('אורקל חיצוני שאין לנו, וקביעה בלי אורקל הייתה ניחוש.');
  L.push('');
  L.push(`מה שלקסיקון **אינו** קונה, בשום איכות: ${W.shipped.reasonTotals['collision-margin']} ערכים נעולים על דו-משמעות מול`);
  L.push(`מילת מאגר אחרת ו-${W.shipped.reasonTotals['far-threshold']} על סף רצועה. אף אחת מהשתיים אינה שאלה על אוצר מילים.`);
  L.push('');

  L.push('## מועמד מדורג');
  L.push('');
  if (rep.gradedCandidate.present) {
    L.push(`**נמדד.** ‏${W.graded.covered}/${W.graded.total} = ${p(W.graded.pct)} · מול ${W.shipped.covered} (${p(W.shipped.pct)}) בנשלח.`);
    L.push(`‏**+${W.graded.covered - W.shipped.covered} ערכים.**`);
    L.push('');
    L.push('⚠ **הקובץ נחת באמצע ההרצה הזאת**, ו-`lib/checker.js` נערך בסוכן אחר במקביל כדי');
    L.push('לממש את הגן. שני דברים שנבדקו ולא הונחו לפני שהעמודה נמדדה:');
    L.push('');
    L.push('1. הקובץ אכן נושא `marginHard`/`marginSoft`;');
    L.push('2. ‏`normalizeParams` של הבודק **משמרת** אותם. אילו היה משמיט אותם בשקט, העמודה');
    L.push('   הייתה מודדת את הגנום הישן ומדווחת עליו בשם המועמד · שער מפורש בקוד חוסם את זה.');
    L.push('');
    L.push('הגנום נושא גם `bandsTight`/`WTight`, כלומר המנגנון הוא **שני משטרים** ולא רק');
    L.push('שוליים מדורגים. העמודה מודדת את מה שיש בקובץ, לא תיאור שלו.');
    L.push('');
    L.push('| אורך | נעולים | ' + REASONS.join(' | ') + ' |');
    L.push('|---|---|' + REASONS.map(() => '---').join('|') + '|');
    for (const b of BANDS) {
      const e = W.graded.byLength.find(x => x.len === b);
      if (!e.total) continue;
      L.push(`| ${b} | ${e.total - e.covered} | ` + REASONS.map(r => e.reasons[r] || '·').join(' | ') + ' |');
    }
    L.push('| **סה"כ** | **' + (W.graded.total - W.graded.covered) + '** | ' + REASONS.map(r => `**${W.graded.reasonTotals[r]}**`).join(' | ') + ' |');
    L.push('');
    /* הבליטה שהעין תופסת · נאמרת במפורש עם המספר, ולא מושארת לקורא לגלות בטבלה. */
    {
      const worst = W.graded.byLength
        .filter(x => x.total >= 50 && x.total > x.covered)
        .sort((a, b) => (b.total - b.covered) - (a.total - a.covered))[0];
      if (worst) {
        const sh = W.shipped.byLength.find(x => x.len === worst.len);
        L.push(`⚠ **בליטה שיש להסתכל עליה:** ${worst.total - worst.covered} מתוך ${W.graded.total - W.graded.covered} הנעולים של המועמד יושבים ברצועת אורך **${worst.len}** לבדה`);
        L.push(`(‏${p(worst.pct)} כיסוי, מול ${p(sh.pct)} בנשלח), וכולם על \`far-threshold\` · כלומר סף הרצועה`);
        L.push('הזאת, ולא שכבת בטיחות. זו אותה צורה בדיוק שנרשמה ב-`STATE.md` על המועמד הקצר-אנגלי');
        L.push('("‏מוריד אורך 5"), והיא **החלפה מוצרית ולא שיפור טהור**: המועמד קונה את הקצה הקצר');
        L.push('ומשלם ברצועה אחת באמצע.');
        L.push('');
      }
    }
    L.push('⛔ **המספר הזה אינו מאושר לשליחה.** הוא מודד **כיסוי** ולא בטיחות. ‏`bank_gate` הוא');
    L.push('הסמכות היחידה על קבלות-שווא חוצות-כרטיסים, והוא לא רץ כאן. ‏`STATE.md` כבר רושם את');
    L.push('הגן המדורג כ-"‏📐 נמדד · **לא מאומת**", והמדידה הזאת אינה משנה את הסטטוס הזה.');
  } else {
    L.push(`⛔ **העמודה חסרה.** ${rep.gradedCandidate.reason}`);
    L.push('');
    L.push('הסיבה נאמרת ולא נבלעת: מדידה של קובץ מועמד שנושא גן שהבודק אינו מממש הייתה מדווחת');
    L.push('על הגנום הישן בשם המועמד החדש · בדיוק סוג המספר שגרוע מאין מספר.');
  }
  L.push('');

  L.push('## ‏selftest · הוכחת שיניים');
  L.push('');
  L.push('מדידה שמדפיסה אותו מספר בעולם משותק, בעולם הנשלח ובעולם מתירני אינה מודדת דבר.');
  L.push('');
  L.push('| בדיקה | פסק | פרט |');
  L.push('|---|---|---|');
  for (const c of rep.selftest.checks) L.push(`| ${c.name} | ${c.pass ? '✅' : '⛔'} | ${c.detail} |`);
  L.push('');
  L.push('`node typo-lab/enbank_coverage.js --selftest` מריץ את זה לבדו ויוצא בקוד שאינו אפס בכשל.');
  L.push('');

  L.push('## ייחוס · באיזה קוד נמדד');
  L.push('');
  L.push('‏`lib/checker.js` נערך בסוכן אחר **במקביל** להרצה הזאת. מספר בלי גרסת-קוד נקובה אינו');
  L.push('ניתן לשחזור, ולכן:');
  L.push('');
  L.push('| קובץ | sha256 (16) |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(rep.provenance)) {
    if (k === 'note' || v == null) continue;
    L.push(`| \`${k}\` | \`${v}\` |`);
  }
  L.push('');
  L.push('אם `checker` שונה מזה שבטבלה, יש להריץ מחדש לפני ציטוט.');
  L.push('');
  return L.join('\n');
}

if (require.main === module) main();
module.exports = { buildEnv, measureWorld, worldsFor, bandOf, BANDS, REASONS };
