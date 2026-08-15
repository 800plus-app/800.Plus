'use strict';
/* סובלנות בבדיקת תשובות · שכבת זמן הריצה
 *
 * מה הקובץ הזה מגן עליו
 * ----------------------
 * שלוש מחלקות נמדדו במעבדה הלא-מקוונת `typo-lab/` ורק חלקן נשלחו:
 *
 *   A · שגיאות כתיב  ⛔ **מונחת וכבויה** (`TYPO_PARAMS.enabled === false`).
 *       שער המאגר מצא 138 התנגשויות אמיתיות עם הפרמטרים הנוכחיים ("caughtt" על
 *       bought, "110th" על "1st - first"), כי האופטימיזציה ניקדה כל וריאציה מול
 *       הכרטיס שלה בלבד ולא מול 5,662 האחרים. ה-GA רץ מחדש עם האילוץ החוצה-כרטיסים,
 *       והפרמטרים ישתנו. עד אז השרברבות כאן נבדקת, והחוק אינו פועל.
 *   B1 · פיצול "או" מחלק  ✅ פועל · 0 התנגשויות חדשות בשני המאגרים.
 *   E · נרדפות (55 קבוצות)  ✅ פועל · 0 התנגשויות חדשות בשני המאגרים.
 *
 * הבדיקות שנוגעות במחלקה A מדליקות אותה מקומית ומחזירות את המצב · הן בודקות את
 * המנגנון, לא את ההחלטה לשלוח אותו.
 *
 * העוגן · שקילות מעבדה↔ריצה
 * ---------------------------
 * המימוש הקנוני של ההכרעה חי ב-`typo-lab/lib/checker.js`, והועתק ל-app.js. נגד
 * סחיפה בין שני העותקים המעבדה פולטת טבלת זהב · `typo-lab/out/golden.jsonl`,
 * 10,000 החלטות · והבדיקה הראשונה כאן מריצה אותה מחדש על הפונקציה **המורמת
 * מ-app.js**. אי-התאמה אחת היא אדום. השקילות נבדקת בכל ריצה, לא ביום ההדבקה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadApp, appSource, ROOT, expectNone } = require('./_harness/sandbox.js');
const { extractFunction } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');

const LEX_PATH = path.join(ROOT, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;
const LAB = path.join(ROOT, 'typo-lab', 'out');
const RULES = fs.existsSync(path.join(LAB, 'typo-rules.json'))
  ? JSON.parse(fs.readFileSync(path.join(LAB, 'typo-rules.json'), 'utf8')) : null;
const GOLDEN_FILE = path.join(LAB, 'golden.jsonl');

const src = appSource();
const SRC_MASK = codeMask(src);

/* הקשר לכל שפה. הלקסיקון מוזרק כמו בדפדפן — index.html טוען typo-lex.js לפני
   app.js, וכאן זה אותו אובייקט בדיוק (הקובץ מייצא גם ל-require). */
function ctxFor(lang, opts = {}) {
  const c = loadApp({ lang });
  if (opts.lex !== false && LEX) c.window.TYPO_LEX = LEX;
  return c;
}
const HE = ctxFor('he'), EN = ctxFor('en');
const CTX = { he: HE, en: EN };

/* מחלקה A נשלחת כבויה. בדיקה שצריכה אותה מדליקה אותה ומחזירה — ולא נשענת על
   הערך שבקובץ, כדי שהיא תמשיך לבדוק את אותו דבר גם אחרי שהמתג יתהפך. */
function withClassA(ctx, fn) {
  const was = ctx.TYPO_PARAMS.enabled;
  ctx.TYPO_PARAMS.enabled = true;
  try { return fn(); } finally { ctx.TYPO_PARAMS.enabled = was; }
}
function withoutClassA(ctx, fn) {
  const was = ctx.TYPO_PARAMS.enabled;
  ctx.TYPO_PARAMS.enabled = false;
  try { return fn(); } finally { ctx.TYPO_PARAMS.enabled = was; }
}
function withGlossRules(ctx, splitOr, synonyms, fn) {
  const a = ctx.TYPO_GLOSS_RULES.splitOr, b = ctx.TYPO_GLOSS_RULES.synonyms;
  ctx.TYPO_GLOSS_RULES.splitOr = splitOr; ctx.TYPO_GLOSS_RULES.synonyms = synonyms;
  try { return fn(); } finally { ctx.TYPO_GLOSS_RULES.splitOr = a; ctx.TYPO_GLOSS_RULES.synonyms = b; }
}

/* ===== טביעת אצבע · הקישור בין הקבוע לארטיפקט =====
 * `ver` הוא אותה מחרוזת בכל ריצת GA ולכן אינו מזהה גרסה. הטביעה נגזרת מהפרמטרים
 * עצמם, ולכן עריכה של משקל אחד כאן בלי לעדכן את הארטיפקט (או להפך) נופלת. */
const SETS = ['he-word', 'en-word', 'gloss'];
const OPS = ['sub', 'adjSub', 'transpose', 'ins', 'del', 'doubleLetter', 'materVI', 'homophone'];
const r4 = x => Number(Number(x).toFixed(4));
/* צורה קנונית · המשקלים והספים מעוגלים לארבע ספרות, כי זו הצורה שהארטיפקט מפרסם
   בשדה `params`. הקישור נעשה מול השדה הזה ולא מול הגנום: הגנום הוא פנימי של
   evolve.js, והשחזור ממנו תלוי בפונקציה שיכולה להשתנות בין ריצות. */
function canonOf(P, round) {
  const nb = (bs, r) => Array.from(bs).map(b => [(b.maxLen == null || !isFinite(b.maxLen)) ? null : b.maxLen, r ? r4(b.t) : b.t]);
  const nw = (w, r) => OPS.map(k => (w[k] == null ? null : (r ? r4(w[k]) : w[k])));
  return JSON.stringify(SETS.map(s => {
    const p = P[s];
    /* גני המשטר הצר נכנסים לצורה הקנונית · בלעדיהם שני סטים שנבדלים **רק** בו
       מקבלים אותה טביעה, והבדיקה "‏TYPO_PARAMS נושא את טביעת האצבע של הפרמטרים
       שבתוכו" הופכת לעיוורת בדיוק לגן שהיא אמורה לשמור עליו. אותו כשל בדיוק נמצא
       ותוקן ב-typo-lab/bank_gate.js, ושם הוא הוכח: שני ארטיפקטים שונים קיבלו את
       הטביעה 99db507cb8a5. ‏null מפורש כדי שסט בלי המשטר יישאר יציב. */
    return [p.minLen, p.vetoMargin, p.useLexicon !== false ? 1 : 0,
      nb(p.bands, round), nw(p.W, round),
      p.marginHard == null ? null : p.marginHard,
      p.marginSoft == null ? null : p.marginSoft,
      p.bandsTight ? nb(p.bandsTight, round) : null,
      p.WTight ? nw(p.WTight, round) : null];
  }));
}
function fnv(sIn) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < sIn.length; i++) { h ^= sIn.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const fpOf = P => fnv(canonOf(P, false));
const linkOf = P => fnv(canonOf(P, true));
const ARTIFACT_LINK = RULES ? linkOf(RULES.params) : null;
const FP_MATCHES = !!RULES && ARTIFACT_LINK === linkOf(HE.TYPO_PARAMS);

/* ===== מה שמתקבל **היום** · שיקוף מדויק של ארבע השכבות המדויקות =====
 * זה המקום היחיד בקובץ שמשכפל לוגיקה של האפליקציה, והוא משוכפל בכוונה: בדיקה
 * ש-`enabled:false` מחזיר את התנהגות היום אינה יכולה להשתמש ב-`enabled:false`
 * כמדד. סחיפה בין השיקוף הזה לשכבות האמיתיות מפילה את הבדיקה, וזה בדיוק הרצוי. */
function todayCorrect(c, input, term) {
  const a = c.K(input); if (!a) return false;
  if (a === c.K(term)) return true;
  if (c.LANG !== 'en' && Array.from(c.heForms(term)).some(v => c.K(v) === a)) return true;
  const alts = String(term).split(/[\/|,]|\s-\s/)
    .flatMap(x => c.LANG === 'en' ? [x] : Array.from(c.heForms(x)))
    .map(x => c.K(x)).filter(Boolean);
  if (alts.includes(a)) return true;
  const squash = x => String(x).replace(/\s+/g, '');
  return alts.some(x => squash(x) === squash(a));
}
function todayMeaning(c, input, meaning) {
  const a = c.norm(input); if (!a) return false;
  if (a === c.norm(meaning)) return true;
  if (a === c.norm(String(meaning).replace(/\([^)]*\)/g, ' '))) return true;
  const segs = Array.from(c.meaningSegs(meaning));
  if (segs.includes(a)) return true;
  return segs.some(s => c.particleMatch(a, s));
}

/* ===== מדגם דטרמיניסטי ===== */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* וריאציות שמכסות את כל הענפים: זהה · מחיקה · היפוך · החלפה · הכפלה · מילה אחרת
   במאגר · סיומת נטייה. בלי כיסוי כזה "מסכים עם היום" היה נבדק על התאמות מדויקות
   בלבד, כלומר על השכבה שממילא לא נגעתי בה. */
function probesFor(c, w, other, r) {
  const k = c.K(w.term);
  const out = [w.term, k, other.term];
  if (k.length > 3) {
    const i = 1 + Math.floor(r() * (k.length - 2));
    out.push(k.slice(0, i) + k.slice(i + 1));                       // מחיקה
    out.push(k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2));     // היפוך
    out.push(k.slice(0, i) + (c.LANG === 'en' ? 'x' : 'ש') + k.slice(i + 1));  // החלפה
    out.push(k.slice(0, i) + k[i] + k.slice(i));                    // הכפלה
    out.push(k + (c.LANG === 'en' ? 's' : 'ים'));                   // נטייה
  }
  return out;
}
function wordSample(c, n, seed) {
  const r = rng(seed);
  const bank = Array.from(c.BANK);
  const rows = [];
  for (let i = 0; rows.length < n && i < bank.length * 8; i++) {
    const w = bank[Math.floor(r() * bank.length)];
    const other = bank[Math.floor(r() * bank.length)];
    for (const p of probesFor(c, w, other, r)) { rows.push([p, w.term]); if (rows.length >= n) break; }
  }
  return rows;
}
function glossSample(c, n, seed) {
  const r = rng(seed);
  const bank = Array.from(c.BANK).filter(w => c.meaningSegs(w.meaning).length);
  const rows = [];
  for (let i = 0; rows.length < n && i < bank.length * 8; i++) {
    const w = bank[Math.floor(r() * bank.length)];
    const other = bank[Math.floor(r() * bank.length)];
    const segs = Array.from(c.meaningSegs(w.meaning));
    const s = segs[Math.floor(r() * segs.length)];
    const cand = [s, w.meaning, Array.from(c.meaningSegs(other.meaning))[0] || other.term];
    if (s.length > 4) {
      const j = 1 + Math.floor(r() * (s.length - 2));
      cand.push(s.slice(0, j) + s.slice(j + 1));
      cand.push(s.slice(0, j) + s[j + 1] + s[j] + s.slice(j + 2));
      cand.push('ה' + s);
    }
    for (const p of cand) { if (p) rows.push([p, w]); if (rows.length >= n) break; }
  }
  return rows;
}

describe('סובלנות איות · שקילות מעבדה↔ריצה', () => {

  test('הארטיפקטים של המעבדה נמצאים', () => {
    assert.ok(RULES, 'typo-lab/out/typo-rules.json חסר · בלעדיו אין מה לאמת מולו');
    assert.ok(fs.existsSync(GOLDEN_FILE), 'typo-lab/out/golden.jsonl חסר · הוא בגיט בכוונה (‏out/.gitignore חורג עבורו) והוא ההוכחה היחידה לשקילות');
    assert.ok(LEX, 'typo-lex.js חסר מהשורש');
  });

  test('הארטיפקט מפרסם את שלושת הסטים', () => {
    for (const s of SETS) assert.ok(RULES.params[s], `typo-rules.json חסר את הסט ${s}`);
  });

  test('TYPO_PARAMS נושא את טביעת האצבע של הפרמטרים שבתוכו', () => {
    /* פנימי · עריכת משקל בלי לעדכן את fp נופלת כאן. `ver` אינו יכול לשמש לזה:
       הוא אותה מחרוזת בכל ריצת GA. */
    assert.strictEqual(fpOf(HE.TYPO_PARAMS), HE.TYPO_PARAMS.fp,
      'הפרמטרים ב-app.js השתנו ו-fp לא · עדכן את שניהם יחד');
  });

  test('TYPO_PARAMS זהה לפרמטרים שהארטיפקט מפרסם', () => {
    /* חיצוני · הקישור עצמו. אם ה-GA רץ מחדש והארטיפקט התחלף בלי שהקבוע עודכן
       (או להפך), השורה הזאת אדומה ומצביעה על השדה שנפרד.
       ההשוואה מעוגלת לארבע ספרות כי זו הדיוק שהארטיפקט מפרסם בו; ב-app.js
       הערכים בדיוק מלא, וזה נדרש כדי שטבלת הזהב תשוחזר. */
    for (const s of SETS) {
      const mine = HE.TYPO_PARAMS[s], art = RULES.params[s];
      assert.strictEqual(mine.minLen, art.minLen, `${s} · minLen`);
      assert.strictEqual(mine.vetoMargin, art.vetoMargin, `${s} · vetoMargin`);
      assert.strictEqual(mine.useLexicon !== false, art.useLexicon !== false, `${s} · useLexicon`);
      /* ‏JSON ולא deepStrictEqual · מערך שנוצר בתוך ארגז החול אינו חולק אב-טיפוס
         עם מערך שנוצר כאן, ו-deepStrictEqual נופל על זה גם כשהתוכן זהה. */
      assert.strictEqual(JSON.stringify(Array.from(mine.bands).map(b => [b.maxLen, r4(b.t)])),
        JSON.stringify(art.bands.map(b => [b.maxLen, r4(b.t)])), `${s} · bands`);
      assert.strictEqual(JSON.stringify(OPS.map(k => r4(mine.W[k]))),
        JSON.stringify(OPS.map(k => r4(art.W[k]))), `${s} · W`);
      /* השוליים המדורגים · מושווים במפורש ולא דרך הטביעה בלבד, כדי שכשהם ייפרדו
         השורה תגיד **איזה** שדה נפרד ולא רק שהטביעות שונות. */
      assert.strictEqual(mine.marginHard == null ? null : mine.marginHard,
        art.marginHard == null ? null : art.marginHard, `${s} · marginHard`);
      assert.strictEqual(mine.marginSoft == null ? null : mine.marginSoft,
        art.marginSoft == null ? null : art.marginSoft, `${s} · marginSoft`);
      assert.strictEqual(
        mine.bandsTight ? JSON.stringify(Array.from(mine.bandsTight).map(b => [b.maxLen, r4(b.t)])) : null,
        art.bandsTight ? JSON.stringify(art.bandsTight.map(b => [b.maxLen, r4(b.t)])) : null, `${s} · bandsTight`);
      assert.strictEqual(
        mine.WTight ? JSON.stringify(OPS.map(k => r4(mine.WTight[k]))) : null,
        art.WTight ? JSON.stringify(OPS.map(k => r4(art.WTight[k]))) : null, `${s} · WTight`);
    }
    assert.strictEqual(linkOf(HE.TYPO_PARAMS), ARTIFACT_LINK);
  });

  test('טבלת הזהב · 10,000 החלטות של המעבדה, מחדש על nearMatch המורמת מ-app.js', t => {
    if (!FP_MATCHES) {
      /* לא לעבור בשקט על נתונים ישנים. */
      t.diagnostic(`⚠ טבלת הזהב אינה תואמת לפרמטרים: הארטיפקט ${ARTIFACT_LINK} מול app.js ${linkOf(HE.TYPO_PARAMS)}`);
      t.skip('golden.jsonl הופק מפרמטרים אחרים · הרץ typo-lab/evolve.js מחדש לפני שסומכים על השקילות');
      return;
    }
    /* ‏\r?\n · git ממיר את הקובץ ל-CRLF ב-checkout על ווינדוס, ופיצול על \n
       בלבד היה משאיר \r בסוף כל שורה. */
    const rows = fs.readFileSync(GOLDEN_FILE, 'utf8').trim().split(/\r?\n/);
    assert.strictEqual(rows.length, RULES.golden.rows, 'מספר השורות בטבלת הזהב אינו זה שהארטיפקט מדווח');
    const by = { he: new Map(), en: new Map() };
    for (const l of ['he', 'en']) for (const w of Array.from(CTX[l].BANK)) by[l].set(w.term + '|' + w.unit, w);

    const bad = [];
    withClassA(HE, () => withClassA(EN, () => {
      for (const line of rows) {
        const r = JSON.parse(line);
        const c = CTX[r.lang];
        const card = by[r.lang].get(r.term + '|' + r.unit);
        if (!card) { bad.push(`אין כרטיס ${r.term}|${r.unit}`); continue; }
        const gloss = r.set === 'gloss';
        const a = gloss ? c.norm(r.typed) : c.K(r.typed);
        const own = new Set([c.K(card.term)]);
        if (gloss) for (const t2 of Array.from(c.glossAlts(card))) own.add(c.K(t2));
        /* המועמדים מגיעים מהטבלה, ממוינים. הסדר אינו משנה — כל שכבה היא מינימום
           או "קיים" — וזה נבדק כאן מעצם ההתאמה מול פסק שחושב על סדר אחר. */
        const v = c.nearMatch(a, r.candidates, gloss ? 'he' : r.lang, c.TYPO_PARAMS[r.set],
          gloss ? c.SEG_VETO : c.TERM_VETO, own);
        const got = { ok: v.ok, why: v.why || null, dist: v.dist == null ? null : Number(v.dist.toFixed(6)) };
        const exp = { ok: r.verdict.ok, why: r.verdict.why || null, dist: r.verdict.dist };
        if (got.ok !== exp.ok || got.why !== exp.why || got.dist !== exp.dist)
          bad.push(`[${r.set}] ${r.term} <- "${r.typed}" · מעבדה ${JSON.stringify(exp)} · ריצה ${JSON.stringify(got)}`);
      }
    }));
    expectNone(assert, bad, 'המעבדה והריצה נפרדו · אלה ההחלטות שנחלקו');
  });
});

describe('סובלנות איות · מתג הכיבוי והתלות בלקסיקון', () => {

  test('שלוש המחלקות במצב שנשלח · A דלוקה, B1 ו-E דלוקות', () => {
    assert.strictEqual(HE.TYPO_PARAMS.enabled, true,
      'מחלקה A כבויה · אם זו הכוונה, עדכן גם את ההערה מעל הקבוע');
    assert.strictEqual(HE.TYPO_GLOSS_RULES.splitOr, true);
    assert.strictEqual(HE.TYPO_GLOSS_RULES.synonyms, true);
  });

  /* ⚠ הבדיקה הזאת החליפה בדיקה קודמת שקבעה "צד הפירוש רדום מבנית · כל רצועות הסף
     אפס". **ההנחה ההיא הייתה שגויה, והיא תועדה כאן כעובדה במשך יממה.** האפס לא היה
     מבנה אלא כשל חיפוש: שורת שכבה-1 יחידה ("כל" על הפירוש "כלל", via=exact) נפלה בסט
     האימון של חמש מתוך שש הרצות ה-GA, העניקה לכל גנום את אותו עונש ‎-1e6‎, השטיחה את
     נוף הכושר, וההרצה נעצרה בדור 23 והחזירה את גנום הזריעה. ‏gloss/fold1 — ההרצה
     היחידה שהשורה נפלה אצלה בוולידציה — רצה 130 דורות והגיעה לכושר חיובי.

     הלקח לבדיקה עצמה: "כל הספים אפס" הוא **פרוקסי**, לא המאפיין. הוא נראה כמו בדיקה
     חזקה ("התנגשות בלתי אפשרית מבנית") אבל הוא קיבע תוצאה של באג. הבדיקה הזאת מקבעת
     את **המאפיין עצמו** — שתי ההתנגשויות שהשער מצא בפועל נדחות — ולכן היא נשארת
     נכונה גם כשהכיול זז, ונופלת אם מישהו יחזיר סף שפותח אותן. */
  test('שתי ההתנגשויות שהשער תפס בצד הפירוש נדחות · והסט חי', () => {
    /* שתיהן הגיעו דרך תוצרי ההרחבה של B1: תוצר הרחבה אינו מקטע פירוש גולמי, ולכן
       הוא שקוף גם לשולי הדו-משמעות (dOther=9) וגם לקבוצה חוצת-הכרטיסים (אפס שורות
       gloss). התיקון היה להזרים את expandOf(B1-union) לתוך האילוץ. */
    const CASES = [
      { typed: 'רסיס עצ', term: 'אֵגֶל', intruder: 'שבב' },
      { typed: 'משא כבד', term: 'יָצוּעַ', intruder: 'עול' },
    ];
    for (const cs of CASES) {
      const w = Array.from(HE.BANK).find(x => x.term === cs.term);
      /* אי-מציאת הכרטיס הייתה הופכת את הבדיקה לירוקה-ריקה · לכן היא כשל. */
      assert.ok(w, `הכרטיס ${cs.term} לא נמצא במאגר · הבדיקה אינה יכולה לרוץ`);
      const segs = Array.from(HE.meaningSegs(w.meaning));
      assert.ok(segs.length > 0, `אין מקטעי פירוש ל-${cs.term} · הבדיקה ריקה`);
      const own = HE.typoOwners(w.meaning, w);
      const v = HE.nearMatch(HE.norm(cs.typed), segs, 'he', HE.TYPO_PARAMS.gloss, HE.SEG_VETO, own);
      assert.strictEqual(v.ok, false,
        `"${cs.typed}" התקבל על ${cs.term} · הוא שייך ל-${cs.intruder}, וזו בדיוק ההתנגשות ששער המאגר פסל`);
      /* וגם דרך הכניסה האמיתית של האפליקציה, לא רק דרך nearMatch ישירות. */
      assert.strictEqual(HE.meaningMatch(cs.typed, w.meaning, w), false,
        `meaningMatch קיבל "${cs.typed}" על ${cs.term}`);
    }

    /* חיוּת · בלי זה אפשר "לעבור" את הבדיקה בכך שמחזירים את כל הספים לאפס, כלומר
       בדיוק המצב השגוי שהבדיקה הזאת באה להחליף. */
    assert.ok(Array.from(HE.TYPO_PARAMS.gloss.bands).some(b => b.t > 0),
      'כל רצועות הסף בצד הפירוש אפס · הסט רדום. אם זו הכוונה — זו הכרעה, ומקומה בהערה מעל הקבוע');
  });

  test('enabled:false מחזיר את התנהגות היום בדיוק · 500 שורות לכל כיוון', () => {
    for (const c of [HE, EN]) {
      const bad = [];
      withoutClassA(c, () => {
        for (const [input, term] of wordSample(c, 500, 0x51ee)) {
          const got = c.isCorrect(input, term), want = todayCorrect(c, input, term);
          if (got !== want) bad.push(`[${c.LANG}] isCorrect("${input}","${term}") = ${got} · היום ${want}`);
        }
        withGlossRules(c, false, false, () => {
          for (const [input, w] of glossSample(c, 500, 0x51ef)) {
            const got = c.meaningMatch(input, w.meaning, w), want = todayMeaning(c, input, w.meaning);
            if (got !== want) bad.push(`[${c.LANG}] meaningMatch("${input}","${w.meaning}") = ${got} · היום ${want}`);
          }
        });
      });
      expectNone(assert, bad, 'המתג כבוי והתשובה בכל זאת השתנתה');
    }
  });

  test('בלי typo-lex.js השכבה כבויה לגמרי · לא מקלה יותר', () => {
    /* אופליין, חסימה, טעינה שנכשלה. הכיוון הבטוח הוא היחיד שמתקבל על הדעת:
       בלי הלקסיקון אותם פרמטרים פותחים קבלות-שווא, ולכן חוסר שלו מכבה הכול. */
    for (const lang of ['he', 'en']) {
      const c = ctxFor(lang, { lex: false });
      assert.strictEqual(c.typoLex(), null, 'הלקסיקון נטען בכל זאת · הבדיקה אינה בודקת כלום');
      const bad = [];
      withClassA(c, () => withGlossRules(c, false, false, () => {
        for (const [input, term] of wordSample(c, 500, 0x51ee)) {
          const got = c.isCorrect(input, term), want = todayCorrect(c, input, term);
          if (got !== want) bad.push(`[${lang}] isCorrect("${input}","${term}") = ${got} · היום ${want}`);
        }
        for (const [input, w] of glossSample(c, 500, 0x51ef)) {
          const got = c.meaningMatch(input, w.meaning, w), want = todayMeaning(c, input, w.meaning);
          if (got !== want) bad.push(`[${lang}] meaningMatch("${input}") = ${got} · היום ${want}`);
        }
      }));
      expectNone(assert, bad, 'הלקסיקון חסר והשכבה בכל זאת שינתה תשובה');
    }
  });

  test('שכבת הלקסיקון נושאת במשקל · בלעדיה נפתחות בדיוק הקבלות שנמדדו', t => {
    if (!FP_MATCHES) { t.skip('טבלת הזהב אינה תואמת לפרמטרים'); return; }
    const rows = fs.readFileSync(GOLDEN_FILE, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
      .filter(r => r.verdict.why === 'real-word');
    assert.ok(rows.length > 0, 'אין בטבלת הזהב שורות שהלקסיקון דחה · אין מה למדוד');
    const by = { he: new Map(), en: new Map() };
    for (const l of ['he', 'en']) for (const w of Array.from(CTX[l].BANK)) by[l].set(w.term + '|' + w.unit, w);
    const opened = { 'he-word': 0, 'en-word': 0, gloss: 0 };
    withClassA(HE, () => withClassA(EN, () => {
      for (const r of rows) {
        const c = CTX[r.lang];
        const card = by[r.lang].get(r.term + '|' + r.unit);
        if (!card) continue;
        const gloss = r.set === 'gloss';
        const a = gloss ? c.norm(r.typed) : c.K(r.typed);
        const own = new Set([c.K(card.term)]);
        if (gloss) for (const t2 of Array.from(c.glossAlts(card))) own.add(c.K(t2));
        const P = Object.assign({}, c.TYPO_PARAMS[r.set], { useLexicon: false });
        const v = c.nearMatch(a, r.candidates, gloss ? 'he' : r.lang, P,
          gloss ? c.SEG_VETO : c.TERM_VETO, own);
        if (v.ok) opened[r.set]++;
      }
    }));
    /* המספרים נמדדו על אותה טבלת זהב. הם מוצמדים ולא מושווים ל"גדול מאפס":
       שכבה שנחלשת בשקט היא בדיוק מה שהבדיקה הזאת אמורה לתפוס.
       ‏gloss עלה 0 → 5 כשצד הפירוש הופעל. הערך 0 הקודם לא העיד שהלקסיקון מיותר שם
       אלא שכל הספים היו אפס ולכן לא היה מה לפתוח · עכשיו הוא נושא במשקל גם בסט
       הזה, וחמש שורות real-word נפתחות בלעדיו.
       ‏en-word עלה 12 → 21 עם השוליים המדורגים. הכיוון הזה הוא **הנכון**: הסובלנות
       האנגלית התרחבה, ולכן יש יותר מחרוזות שרק הלקסיקון עוצר. ירידה כאן הייתה
       הסימן המדאיג · היא הייתה אומרת שהשכבה נחלשה בשקט. */
    assert.deepStrictEqual(opened, { 'he-word': 8, 'en-word': 21, gloss: 5 },
      'המחיר של כיבוי הלקסיקון השתנה · השכבה או הפרדיקט שלה זזו');
  });

  test('תקרת הפעולות קבועה על 3 · הפרצה שה-GA מצא בריצה הראשונה', () => {
    /* ⚠ הבדיקה הזאת נכתבה אחרי שהתגלה שהיא חסרה. עם הפרמטרים הקודמים שינוי
       התקרה מ-3 ל-4 הפיל את טבלת הזהב; עם הפרמטרים הנוכחיים הוא כבר לא, כי
       המשקל הזול ביותר (0.4423) כפול ארבע עובר כל סף קיים, ולכן התקרה חדלה
       להיות האילוץ הכובל. משמע: טבלת הזהב לבדה כבר אינה שומרת על הקבוע הזה,
       והוא נשמר כאן במפורש.
       למה הוא קיים בכלל: בלעדיו ה-GA הוריד את מחיר ההכנסה והמחיקה ל-0.2 ומצא
       שהמסלול הזול הוא למחוק הכול ולכתוב מחדש · "kqvv" התקבל כטעות הקלדה של
       "late". שלוש עריכות גולמיות, לא ארבע. */
    assert.strictEqual(HE.TYPO_MAX_OPS, 3, 'תקרת הפעולות זזה');
    assert.strictEqual(HE.TYPO_MAX_CANDS, 8, 'מספר המועמדים הנבחנים זז · המעבדה והריצה יבחנו קבוצות שונות');
    for (const v of Array.from(HE.typoVectors('קקקקקקקק', 'קקקקקזזז', 3))) {
      let n = 0; for (const k of Array.from(HE.TYPO_OPS)) n += v[k];
      assert.ok(n <= 3, `יישור עם ${n} פעולות עבר את התקרה`);
    }
    /* וברמת ההחלטה · סף רחב מלאכותית, בלי לקסיקון ובלי וטו, כדי שהתקרה תהיה
       הדבר היחיד שמכריע. ארבע עריכות נדחות, שלוש מתקבלות. */
    const P = Object.assign({}, HE.TYPO_PARAMS['he-word'],
      { minLen: 0, vetoMargin: 0, useLexicon: false, bands: [{ maxLen: null, t: 99 }] });
    const cand = 'קקקקקקקק';
    assert.strictEqual(HE.editDist('קקקקזזזז', cand), 4);
    assert.strictEqual(HE.nearMatch('קקקקזזזז', [cand], 'he', P, new Map(), new Set()).ok, false,
      'ארבע עריכות התקבלו · התקרה נפרצה');
    assert.strictEqual(HE.nearMatch('קקקקקזזז', [cand], 'he', P, new Map(), new Set()).ok, true,
      'שלוש עריכות נדחו · הבדיקה מודדת משהו אחר ממה שהיא חושבת');
  });

  test('הפרדיקט חוצה-הכיוונים · שתי הבריחות שנמדדו', () => {
    /* התיקון שעלה ריצה שלמה: אסימון הוא מילה אמיתית אם המסנן מכיר אותו **או**
       שהוא צורה קבילה במאגר, בשני הכיוונים. שתי המחרוזות כאן הן בדיוק המקרים
       שהמסנן לבדו מפספס, כי הבנאי מחסיר ממנו כל צורה של המאגר. */
    assert.strictEqual(LEX.lookup('on', 'en'), false, 'המסנן כן מכיר את "on" · הדוגמה כבר אינה מדגימה');
    assert.strictEqual(EN.lexHit('on', 'en'), true, 'פער אסימון-מול-מחרוזת חזר · "on particular" יתקבל על "in particular"');
    assert.strictEqual(LEX.lookup('מעניינ', 'he'), false, 'המסנן כן מכיר את "מעניינ" · הדוגמה כבר אינה מדגימה');
    assert.strictEqual(HE.lexHit('מעניינ', 'he'), true, 'פער חוצה-כיוונים חזר · מקטע פירוש אינו נראה בכיוון המונח');
  });
});

describe('סובלנות איות · הווטו וההודעה', () => {

  test('הקלדה שהיא מילה אחרת במאגר נפסלת ומדליקה את הדגל', () => {
    withClassA(HE, () => {
      for (const twin of ['טָמִיר', 'תָּמִיר']) {
        HE.typoVeto = false;
        assert.strictEqual(HE.isCorrect(twin, 'אָמִיר'), false, `${twin} התקבל עבור אָמִיר`);
        assert.strictEqual(HE.typoVeto, true, `${twin} נפסל בלי להדליק את דגל ההתנגשות`);
      }
      /* והצד השני · פסילה שאינה התנגשות אינה מדליקה אותו, אחרת ההודעה הייתה
         מופיעה על כל תשובה שגויה והופכת לרעש. */
      HE.typoVeto = false;
      assert.strictEqual(HE.isCorrect('גקגקגקגק', 'אָמִיר'), false);
      assert.strictEqual(HE.typoVeto, false, 'זבל אקראי הדליק את דגל ההתנגשות');
    });
  });

  test('check מאפס את הדגל ו-finishCard קורא ומנקה', () => {
    /* מקובע על המקור · שתי הפונקציות נוגעות ב-DOM ואינן ניתנות להרמה, והכשל
       שמקובע כאן אמיתי: skip() והמבחן מגיעים ל-finishCard בלי לעבור ב-check,
       ודגל שנשאר דלוק היה מרנדר הודעה על הכרטיס הבא. */
    const check = extractFunction(src, 'check', SRC_MASK);
    const finish = extractFunction(src, 'finishCard', SRC_MASK);
    assert.match(check, /acceptedAlt\s*=\s*null;\s*\n\s*typoVeto\s*=\s*false;/,
      'check() כבר אינו מאפס את typoVeto ליד acceptedAlt');
    assert.match(finish, /const\s+vetoed\s*=\s*typoVeto;\s*typoVeto\s*=\s*false;/,
      'finishCard() כבר אינו קורא-ומנקה את typoVeto');
    const head = finish.slice(0, finish.indexOf('answered=true'));
    assert.ok(/typoVeto\s*=\s*false/.test(head), 'הניקוי ב-finishCard ירד אחרי יציאה מוקדמת');
  });

  test('ההודעה מרונדרת רק על פסילה, ומפנה לכפתור בשמו המדויק', () => {
    const finish = extractFunction(src, 'finishCard', SRC_MASK);
    assert.match(finish, /!ok\s*&&\s*!skipped\s*&&\s*vetoed/,
      'תנאי הרינדור של הודעת ההתנגשות השתנה · דילוג או תשובה נכונה יציגו אותה');
    assert.ok(finish.includes('מה שכתבת מתאים למילה אחרת במאגר'), 'נוסח ההודעה נעלם');
    assert.ok(finish.includes('בעצם ידעתי · סמן כנכון'), 'ההודעה אינה נוקבת בשם הכפתור');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const button = finish.includes('id="wasRight">בעצם ידעתי · סמן כנכון<') || html.includes('בעצם ידעתי · סמן כנכון');
    assert.ok(button, 'הכפתור שההודעה מפנה אליו אינו קיים בשם הזה');
    /* ‏/HEB · מקף ארוך הוא סממן מזהה של טקסט שנכתב במכונה, ואסור בכל טקסט שיוצא
       החוצה. נבדק על המחרוזת המרונדרת עצמה, לא על חלון קוד שכולל הערות שכנות. */
    const notice = (finish.match(/typo-veto">([\s\S]*?)<\/div>/) || [])[1] || '';
    assert.ok(notice.length > 10, 'לא נמצאה מחרוזת ההודעה');
    assert.ok(!notice.includes('—'), 'מקף ארוך בטקסט שמוצג למשתמש');
  });
});

describe('סובלנות איות · סדר השכבות', () => {

  test('הפאזי אחרון ב-isCorrect', () => {
    const fn = extractFunction(src, 'isCorrect', SRC_MASK);
    const iSquash = fn.lastIndexOf('squash(x)===squash(a)');
    const iFuzzy = fn.indexOf('nearMatch(');
    assert.ok(iSquash > 0 && iFuzzy > 0, 'אחת השכבות נעלמה מ-isCorrect');
    assert.ok(iFuzzy > iSquash, 'השכבה הפאזית עברה לפני שכבה מדויקת · קבלה קיימת עלולה להיפסל');
    assert.strictEqual(fn.indexOf('nearMatch('), fn.lastIndexOf('nearMatch('), 'יותר מקריאה אחת');
  });

  test('הפאזי אחרון ב-meaningMatch, ואחרי B1 ו-E', () => {
    const fn = extractFunction(src, 'meaningMatch', SRC_MASK);
    const iParticle = fn.indexOf('particleMatch(');
    const iSplit = fn.indexOf('typoSplitOr(');
    const iSyn = fn.indexOf('typoCanon(');
    const iFuzzy = fn.indexOf('nearMatch(');
    assert.ok(iParticle > 0 && iSplit > 0 && iSyn > 0 && iFuzzy > 0, 'אחת השכבות נעלמה מ-meaningMatch');
    assert.ok(iSplit > iParticle, 'B1 עבר לפני השכבות המדויקות');
    assert.ok(iFuzzy > iSplit && iFuzzy > iSyn, 'השכבה הפאזית אינה אחרונה');
  });

  test('exWriteOk יורש דרך isCorrect ואינו מכריע בעצמו', () => {
    const fn = extractFunction(src, 'exWriteOk', SRC_MASK);
    assert.ok(fn.includes('isCorrect('), 'exWriteOk כבר אינו עובר דרך isCorrect');
    assert.ok(!fn.includes('nearMatch('), 'exWriteOk התחיל להכריע בעצמו · שתי דרכים לאותה שאלה');
  });
});

describe('סובלנות איות · שערי כל המאגר', () => {

  test('שום דבר שמתקבל היום אינו נפסל · שני המאגרים, שני הכיוונים', () => {
    for (const c of [HE, EN]) {
      const bad = [];
      for (const w of Array.from(c.BANK)) {
        for (const k of c.typoKeysOf(w.term)) if (!c.isCorrect(k, w.term)) bad.push(`[${c.LANG}] ${w.term} <- ${k}`);
        for (const s of Array.from(c.meaningSegs(w.meaning))) if (!c.meaningMatch(s, w.meaning, w)) bad.push(`[${c.LANG}] ${w.term} :: ${s}`);
      }
      expectNone(assert, bad, 'קבלות שהיו קיימות נעלמו');
    }
  });

  test('אף ערך אינו מקבל פירוש של ערך אחר · המנייה המלאה של B1', () => {
    /* B1 היא היחידה מבין השתיים שקבוצת הקבלות שלה סופית וניתנת למנייה, ולכן
       נבדקת כאן במלואה ולא במדגם. */
    for (const c of [HE, EN]) {
      const bad = [];
      let expanded = 0;
      for (const w of Array.from(c.BANK)) {
        const segs = Array.from(c.meaningSegs(w.meaning));
        const allow = c.typoOwners(w.meaning, w);
        for (const e of Array.from(c.typoSplitOr(segs))) {
          if (!c.meaningMatch(e, w.meaning, w)) continue;
          expanded++;
          /* שני האינדקסים, ולא רק המקטעים. וטו המקטעים חוסם מבנית בתוך
             meaningMatch עצמה, ולכן בדיקה שלו לבדה הייתה טאוטולוגית; ההתנגשות
             שהמעבדה מדדה בשומרים הרופפים היא דווקא מול **מונח**: "גלימה" הוא
             ערך במאגר, ופיצול רופף היה נותן אותו כתשובה ל-אִצְטְלָה. */
          for (const idx of [c.SEG_VETO, c.TERM_VETO]) {
            const owners = idx.get(e);
            if (!owners) continue;
            for (const o of owners) if (!allow.has(o)) bad.push(`[${c.LANG}] ${w.term} קיבל "${e}" שבבעלות ${o}`);
          }
        }
      }
      assert.ok(expanded > 0, `[${c.LANG}] B1 לא ייצרה אף קבלה · הבדיקה ריקה`);
      expectNone(assert, bad, 'פיצול "או" פתח תשובה של ערך אחר');
    }
  });

  test('הנרדפות אינן ממזגות שני ערכים · השוואה מול קו הבסיס', () => {
    /* הסיכון של E אינו נראה בווטו: הקנוניזציה ממזגת שתי מחרוזות **שונות**, ולכן
       מדידה נכונה היא ספירת מחלקות קנוניות עם שני בעלים, פחות אלה שכבר חלקו מקטע
       זהה לפני הלקסיקון. זה בדיוק החישוב של typo-lab/gate_synonyms.js. */
    for (const c of [HE, EN]) {
      const classes = (canon) => {
        const idx = new Map();
        for (const w of Array.from(c.BANK)) {
          const owner = c.K(w.term);
          for (const s of Array.from(c.meaningSegs(w.meaning))) {
            const key = canon ? c.typoCanon(s) : s;
            let m = idx.get(key); if (!m) { m = new Set(); idx.set(key, m); }
            m.add(owner);
          }
        }
        return idx;
      };
      const allowOf = new Map();
      for (const w of Array.from(c.BANK)) allowOf.set(c.K(w.term), c.typoOwners(w.meaning, w));
      const count = idx => {
        let n = 0;
        for (const [, owners] of idx) {
          if (owners.size < 2) continue;
          for (const a of owners) for (const b of owners)
            if (a !== b && !(allowOf.get(a) || new Set()).has(b)) n++;
        }
        return n;
      };
      const base = count(classes(false)), withSyn = count(classes(true));
      assert.strictEqual(withSyn, base,
        `[${c.LANG}] הנרדפות מיזגו ${withSyn - base} זוגות ערכים שלא היו ממוזגים · קבוצה שעברה את השער נשברה, או שנוספה קבוצה שלא עברה`);
    }
  });

  test('קבלה מזכה פירוש · שלושת הנתיבים החדשים, על כל המאגר', () => {
    /* האינווריאנט של tests/62: מה שמתקבל כנכון חייב להיות מזוכה. הפרתו נועלת מילה
       ברשימת החיזוק לנצח, וזה בדיוק הבאג שדווח. */
    const check = (c, useClassA) => {
      const bad = [];
      let n = 0;
      for (const w of Array.from(c.BANK)) {
        const segs = Array.from(c.meaningSegs(w.meaning));
        if (segs.length < 2) continue;
        const probes = new Set();
        for (const e of Array.from(c.typoSplitOr(segs))) probes.add(e);
        for (const s of segs) {
          const cn = c.typoCanon(s);
          if (cn !== s) probes.add(cn);
          if (useClassA && s.length > 8) probes.add(s.slice(0, 3) + s[4] + s[3] + s.slice(5));
        }
        for (const p of probes) {
          if (segs.includes(p)) continue;
          if (!c.meaningMatch(p, w.meaning, w)) continue;
          n++;
          c.stats.words = {};
          c.noteSense(w, p);
          const r = c.stats.words[c.K(w.term)];
          if (!r || !Array.isArray(r.sens) || !r.sens.length)
            bad.push(`[${c.LANG}] ${w.term} קיבל "${p}" ולא זוכה באף פירוש`);
        }
      }
      assert.ok(n > 0, `[${c.LANG}] אף קבלה חדשה לא נמצאה · הבדיקה ריקה`);
      expectNone(assert, bad, 'תשובה התקבלה ולא זוכתה · המילה תיתקע ברשימת החיזוק');
    };
    for (const c of [HE, EN]) check(c, false);
    withClassA(HE, () => check(HE, true));
  });
});

describe('סובלנות איות · שתי מחלקות הפירוש שנשלחו', () => {

  const findHe = key => {
    for (const w of Array.from(HE.BANK)) {
      if (HE.K(w.term) === key) return w;
      for (const v of Array.from(HE.heForms(w.term))) if (HE.K(v) === key) return w;
    }
    return null;
  };

  test('B1 · שני המקרים האמיתיים שהחוק נבנה בשבילם', () => {
    const cases = [['משוננ', 'בעל שיניים'], ['קושש', 'אסף עצים למדורה']];
    for (const [key, typed] of cases) {
      const w = findHe(key);
      assert.ok(w, `${key} אינו במאגר · המאגר נערך והמקרה איבד את הבסיס שלו`);
      assert.ok(w.meaning.includes(' או '), `${w.term} · הפירוש כבר אינו מונה חלופות ב"או"`);
      assert.strictEqual(HE.meaningMatch(typed, w.meaning, w), true, `${w.term} <- "${typed}" נדחה`);
      withGlossRules(HE, false, true, () => {
        assert.strictEqual(HE.meaningMatch(typed, w.meaning, w), false,
          `${w.term} <- "${typed}" התקבל גם בלי B1 · המקרה כבר אינו מדגים את החוק`);
      });
    }
  });

  test('E · שני המקרים האמיתיים שהלקסיקון פותר', () => {
    const cases = [['מגובב', 'מסודר בערימה'], ['ניכוש', 'הסרת עשבים שוטים']];
    for (const [key, typed] of cases) {
      const w = findHe(key);
      assert.ok(w, `${key} אינו במאגר`);
      assert.strictEqual(HE.meaningMatch(typed, w.meaning, w), true, `${w.term} <- "${typed}" נדחה`);
      withGlossRules(HE, true, false, () => {
        assert.strictEqual(HE.meaningMatch(typed, w.meaning, w), false,
          `${w.term} <- "${typed}" התקבל גם בלי מחלקה E`);
      });
    }
  });

  test('55 קבוצות בדיוק, וכולן מנורמלות לצורה שהמאגר מדבר בה', () => {
    assert.strictEqual(HE.TYPO_SYN.length, 55, 'מספר קבוצות הנרדפות השתנה · כל קבוצה חייבת לעבור את שער אפס-ההתנגשויות לפני שהיא נכנסת');
    const map = HE.typoSynMap();
    for (const g of HE.TYPO_SYN) for (const word of g)
      assert.strictEqual(map.get(HE.norm(word)), HE.norm(g[0]), `"${word}" אינו ממופה לנציג הקבוצה`);
  });

  test('הווטו חוסם את שתי המחלקות · מקטע של ערך אחר אינו מתקבל', () => {
    const bad = [];
    for (const c of [HE, EN]) {
      for (const w of Array.from(c.BANK)) {
        const segs = Array.from(c.meaningSegs(w.meaning));
        const allow = c.typoOwners(w.meaning, w);
        for (const [seg, owners] of c.SEG_VETO) {
          if (segs.includes(seg)) continue;
          let foreign = false;
          for (const o of owners) if (!allow.has(o)) { foreign = true; break; }
          if (!foreign) continue;
          if (c.typoSegBlocked(seg, segs, allow) !== true) bad.push(`[${c.LANG}] ${w.term} · "${seg}" אינו חסום`);
          break;                                  // מקטע זר אחד לכל ערך · השאלה היא בינארית
        }
      }
    }
    expectNone(assert, bad, 'וטו המקטעים אינו חוסם מקטע של ערך אחר');
  });
});

describe('סובלנות איות · טסט הסיום של שתי המילים', () => {

  const find = (c, key) => {
    for (const w of Array.from(c.BANK)) {
      if (c.K(w.term) === key) return w;
      for (const v of Array.from(c.heForms(w.term))) if (c.K(v) === key) return w;
    }
    return null;
  };

  test('אָמִיר · הקלדת אחד משני התאומים נפסלת עם נימוק ההתנגשות', () => {
    const amir = find(HE, 'אמיר');
    assert.ok(amir, 'אָמִיר אינו במאגר · המילה הראשונה בטסט הסיום איבדה את הבסיס שלה');
    for (const twin of ['טמיר', 'תמיר']) {
      assert.ok(find(HE, twin), `${twin} אינו במאגר · אָמִיר כבר אינה מילה עם שני תאומים במרחק 1`);
      assert.strictEqual(HE.editDist('אמיר', twin), 1, `${twin} אינו במרחק 1 מ-אמיר`);
    }
    withClassA(HE, () => {
      for (const twin of ['טָמִיר', 'תָּמִיר']) {
        const v = HE.nearMatch(HE.K(twin), HE.typoKeysOf(amir.term), 'he',
          HE.TYPO_PARAMS['he-word'], HE.TERM_VETO, new Set([HE.K(amir.term)]));
        assert.deepStrictEqual({ ok: v.ok, why: v.why }, { ok: false, why: 'collision' },
          `${twin} לא נפסל בנימוק ההתנגשות`);
      }
    });
  });

  test('מִכְמוֹרֶת · כתיב מלא מתקבל, ומילה שכנה במאגר נפסלת', () => {
    const mich = find(HE, 'מכמורת');
    assert.ok(mich, 'מִכְמוֹרֶת אינו במאגר');
    /* חצי הכתיב-המלא אינו תלוי בסובלנות כלל · heForms כבר מייצר אותו, וזה מה
       שהתיקון של fullSpelling נועד לתת. */
    assert.strictEqual(HE.isCorrect('מיכמורת', mich.term), true, 'הכתיב המלא הרגיל נדחה');
    const neighbour = find(HE, 'מכמונת');
    assert.ok(neighbour, 'מִכְמוֹנֶת אינו במאגר · השכן שהבדיקה נשענת עליו נעלם');
    assert.strictEqual(HE.editDist('מכמורת', 'מכמונת'), 1);
    withClassA(HE, () => {
      HE.typoVeto = false;
      assert.strictEqual(HE.isCorrect(neighbour.term, mich.term), false, 'מילה שכנה מהמאגר התקבלה');
      assert.strictEqual(HE.typoVeto, true, 'הפסילה לא סומנה כהתנגשות');
    });
  });

  /* המשקל שמתמחר אות כפולה. שתי הקבלות למטה עוברות דרכו ודרכו בלבד, ולכן הן
     נבדקות מולו ולא מול מספר קשיח · אם ה-GA יתמחר אותו אחרת, הבדיקה תלך איתו
     והטענה ("הקבלה היא בדיוק אות אחת כפולה") תישאר אותה טענה. */
  const DOUBLE = () => HE.TYPO_PARAMS['he-word'].W.doubleLetter;
  const wordVerdict = (typed, w) => HE.nearMatch(HE.K(typed), HE.typoKeysOf(w.term), 'he',
    HE.TYPO_PARAMS['he-word'], HE.TERM_VETO, new Set([HE.K(w.term)]));

  test('מִכְמוֹרֶת · חצי הקבלה · טעות אמיתית מעל כתיב מלא מתקבלת', () => {
    const mich = find(HE, 'מכמורת');
    /* "מיכמוררת" · הכתיב המלא שהמאגר מלמד, ועליו ר' כפולה. */
    assert.strictEqual(HE.isCorrect('מיכמוררת', mich.term), true, 'אות כפולה מעל הכתיב המלא נדחתה');
    const v = wordVerdict('מיכמוררת', mich);
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.dist, DOUBLE(), `הקבלה תומחרה ב-${v.dist} · לא כאות כפולה אחת`);
    /* וההפרדה שהיא כל העניין: אותה מילה בדיוק, בהחלפת אות במקום הכפלה, נדחית.
       החלפה שקולה ל-1 לפחות, וזה מעל כל סף ברצועות הרלוונטיות. */
    assert.strictEqual(HE.isCorrect('מיכמורץ', mich.term), false, 'החלפת אות התקבלה');
    assert.strictEqual(HE.isCorrect('מיכמורט', mich.term), false, 'החלפת אות התקבלה');
  });

  test('אָמִיר · חצי הקבלה · טעות שאינה אחד התאומים מתקבלת', () => {
    /* ⚠ הבדיקה הזאת התהפכה. בפרמטרים הקודמים minLen היה 6 והמפתח "אמיר" (4
       אותיות) לא הגיע בכלל לשכבה · היה כאן פין שקיבע "אין לה סובלנות". עכשיו
       minLen=3, המילה עוברת את השער, וזה הצד השני של טסט הסיום שחגי ביקש:
       טעות כתיב שאינה אחד התאומים מתקבלת, והתאומים נפסלים.
       מה שמתקבל הוא אות כפולה בלבד · החלפת אות ברצועה של 4 אותיות מתומחרת
       ב-1 מול סף 0.2471, ולכן נדחית. הסובלנות כאן צרה בכוונה, וזה בדיוק מה
       שמאפשר לה להתקיים על מילה בת ארבע אותיות עם שני תאומים במאגר. */
    const amir = find(HE, 'אמיר');
    assert.ok(HE.K(amir.term).replace(/ /g, '').length >= HE.TYPO_PARAMS['he-word'].minLen,
      'אָמִיר שוב מתחת לשער האורך · אין לה סובלנות, והבדיקה הזאת אינה בודקת כלום');
    const v = wordVerdict('אמירר', amir);
    assert.strictEqual(v.ok, true, 'טעות כתיב שאינה אחד התאומים נדחתה');
    assert.strictEqual(v.dist, DOUBLE(), `הקבלה תומחרה ב-${v.dist} · לא כאות כפולה אחת`);
    assert.strictEqual(HE.isCorrect('אמירר', amir.term), true, 'isCorrect אינו מסכים עם nearMatch');
    /* ומה שנשאר סגור, כל אחד מנימוק אחר · זה מה שהופך את הקבלה לצרה ולא לרחבה. */
    for (const [typo, why] of [['טמיר', 'collision'], ['תמיר', 'collision'],
                               ['אמיד', 'real-word'], ['אמרי', 'real-word'],
                               ['אמיל', 'far'], ['עמיר', 'far']]) {
      const r = wordVerdict(typo, amir);
      assert.strictEqual(r.ok, false, `"${typo}" התקבל עבור אָמִיר`);
      assert.strictEqual(r.why, why, `"${typo}" נפסל מהסיבה ${r.why} במקום ${why}`);
    }
  });
});
