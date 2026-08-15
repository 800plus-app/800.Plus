'use strict';
/* שער ההתנגשויות · לקסיקון זוגות המורפולוגיה
 *
 *   node typo-lab/gate_morph_pairs.js
 *   node typo-lab/gate_morph_pairs.js --selftest      הוכחת שיניים · חובה לפני שסומכים על פסק
 *
 * ===== למה רשימה ולא כלל =====
 *
 * ‏28 וריאנטים מורפולוגיים נמדדו ונדחו (`out/morph-report.md`) · כולם על התנגשויות, ולא
 * אחד מהם על חוסר תועלת. הסיבה זהה בכולם: **כלל מכליל, ולכן הוא מתנגש**. `P-act-agent`
 * (קוטל↔קטלן) פותר את מקרה 4 ומייצר 21 קבלות חדשות, מהן 17 התנגשויות · הוא מתיר את
 * ההמרה על **כל שורש במאגר**, בזמן שהמקרה דורש אותה על שורש אחד.
 *
 * מחלקה E (‏`gate_synonyms.js`) כבר הוכיחה את הדרך השנייה: **רשימה מפורשת אינה מכלילה,
 * ולכן אינה מתנגשת**. ‏55 קבוצות נרדפות מתוך 102 עברו שער אפס-התנגשויות והן חיות היום.
 * הקובץ הזה עושה את אותו הדבר למורפולוגיה: במקום "התר קוטל↔קטלן", לכתוב `מורד ↔ מרדן`.
 *
 * המודל זהה לחלוטין לזה של מחלקה E, וזה לא במקרה · זוג מורפולוגי הוא קבוצת נרדפות בת
 * שתי מילים. לכן **הפונקציה שמכריעה כאן היא `gate_synonyms.collisionsUnder` עצמה**, לא
 * העתק שלה: החלפה חופשית בתוך קבוצה שקולה למיפוי כל מילות הקבוצה לנציג אחד, ושני
 * טקסטים ניתנים להמרה זה לזה אם ורק אם הצורה הקנונית שלהם זהה.
 *
 * ===== מה כן שונה · יקום הקבלה =====
 *
 * ‏`gate_synonyms` בונה את יקום התשובות מ**מפתחות המונחים ומקטעי הפירושים בלבד**. זה
 * נכון למה שהוא נבנה לו, ו**אינו מספיק כאן**. ‏`bank_gate.js:552` מתעד את הלקח במפורש,
 * והוא נקנה ביוקר: מועמד ה-gloss הראשון קיבל ירוק מהמעבדה ונדחה בשער המאגר, מפני
 * שהיקום שנבדק היה צר מיקום הקבלה האמיתי. שתי מחרוזות ("רסיס עצ" על אֵגֶל, "משא כבד"
 * על יָצוּעַ) היו בלתי-נראות לשתי שכבות ההגנה בו-זמנית.
 *
 * לכן היקום כאן הוא **חמשת המקורות של שער המאגר**, וכולם מיובאים ולא ממומשים מחדש:
 *
 *   1. `acceptedKeys`      · מפתחות המונח · שיקוף `isCorrect` (‏selfcheck1 מקבע)
 *   2. `acceptedSegs`      · מקטעי הפירוש · `meaningSegs` של האפליקציה
 *   3. `measure_morph.SINGLE` · ענף `particleMatch` · כל מחרוזת בת מילה אחת שכרטיס
 *                            מקבל היום. שלמותו נבדקת מול `meaningMatch` על 120,000 זוגות
 *   4. `bank_gate.expandOf(B1-union)` · תוצרי ההרחבה של חוק צד-הפירוש שנשלח
 *   5. `bank_gate.scanDataset`        · צורות שהדאטהסט מתייג accept
 *
 * ⚠ ההבדל אינו תיאורטי. הוא נמדד, והוא מודגם ב-`--selftest`: יש זוגות שהיקום הצר
 * מאשר והיקום המלא דוחה בשמן.
 *
 * ===== שום התנגשות אינה מוסקת =====
 *
 * כל התנגשות שהשער מדווח מאומתת מול הפונקציות האמיתיות של `app.js`: המחרוזת הפולשת
 * חייבת להיות מתקבלת בפועל עבור הערך הפולש (‏`acceptsToday` · `meaningMatch` · הבודק
 * המכויל של `out/typo-rules.json`). ‏`verifyFail` חייב להיות 0, אחרת השער נופל · יקום
 * שמנפח התנגשויות מדווח על קוד אחר מזה שרץ.
 *
 * ===== baseline =====
 *
 * מדווחות רק התנגשויות **חדשות**. אותו חישוב בדיוק רץ עם canon = הזהות, וההפרש הוא מה
 * שהזוג יצר. שני ערכים שחולקים מחרוזת כבר היום אינם באשמת הלקסיקון.
 *
 * ===== זרות =====
 *
 * מילה יכולה להופיע בזוג אחד בלבד. זו אינה קפדנות סגנון: `canonMapOf` ממפה כל קבוצה
 * לנציג משלה, ושני זוגות שחולקים מילה היו מייצרים מיפוי **לא-טרנזיטיבי** ובשקט ·
 * הלקסיקון היה נבדק כמשהו אחר ממה שהוא. השער נופל על זה בשם.
 */

const fs = require('fs');
const path = require('path');

const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys, acceptedSegs, acceptsLive } = require('./lib/keys.js');
const { makeChecker } = require('./lib/checker.js');
const { buildVeto } = require('./lib/veto.js');
const GS = require('./gate_synonyms.js');
const BG = require('./bank_gate.js');
const MG = require('./measure_gloss.js');
const MM = require('./measure_morph.js');
const { BY_NAME: GLOSS_BY_NAME } = require('./lib/glossrules.js');

const LEX_PATH = path.join(__dirname, 'lexicon', 'morph-pairs.json');
const OUT_DIR = path.join(__dirname, 'out');
const OUT_MD = path.join(OUT_DIR, 'morph-pairs-report.md');
const RULES_PATH = path.join(OUT_DIR, 'typo-rules.json');
const LANGS = ['he', 'en'];

/* ===== יקום הקבלה · חמשת המקורות ===== */

const uniCache = new Map();

function shipSets() {
  const j = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const nb = bs => bs.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t }));
  const norm = q => {
    const o = { minLen: q.minLen, vetoMargin: q.vetoMargin, W: q.W, bands: nb(q.bands) };
    if (q.marginHard != null) o.marginHard = q.marginHard;
    if (q.marginSoft != null) o.marginSoft = q.marginSoft;
    if (Array.isArray(q.bandsTight) && q.bandsTight.length) o.bandsTight = nb(q.bandsTight);
    if (q.WTight) o.WTight = q.WTight;
    return o;
  };
  return { 'he-word': norm(j.params['he-word']), 'en-word': norm(j.params['en-word']), gloss: norm(j.params.gloss) };
}

let dsCache = null;
function datasetForms() {
  if (dsCache) return dsCache;
  const models = { he: BG.langModel('he'), en: BG.langModel('en') };
  const files = ['dataset-he.jsonl', 'dataset-en.jsonl'].map(n => path.join(OUT_DIR, n));
  dsCache = BG.scanDataset(files, models);
  return dsCache;
}

/* ‏universe(lang) · מודל בצורת gate_synonyms, עם יקום מורחב.
 * ‏entries[].segs הוא **קבוצת המחרוזות שהכרטיס מקבל היום כטקסט שלם** · זה צד הקורבן.
 * ‏answers הוא אותה קבוצה לכל הכרטיסים, בתוספת מפתחות המונח · זה צד הפולש.
 */
function universe(lang, opts) {
  const narrow = !!(opts && opts.narrow);
  const key = lang + (narrow ? '|narrow' : '|full');
  const hit = uniCache.get(key);
  if (hit) return hit;

  const ctx = getCtx(lang);
  const he = lang !== 'en';
  const M = BG.langModel(lang);
  const LM = narrow ? null : MM.loadLang(lang);
  const cfg = MG.CONFIGS.find(c => c.key === 'B1-union');
  if (!cfg) throw new Error('gate_morph_pairs: B1-union לא נמצא ב-measure_gloss.CONFIGS');
  const gRule = GLOSS_BY_NAME.get(cfg.rule);
  const gParams = Object.assign({}, gRule.defaults, cfg.params);
  const DS = narrow ? null : datasetForms();

  const entries = [];
  const answers = [];
  const unitOf = new Map();
  const termOf = new Map();
  const src = { key: 0, seg: 0, particle: 0, expand: 0, dataset: 0 };

  for (const e of M.info) {
    unitOf.set(e.owner, e.unit);
    if (!termOf.has(e.owner)) termOf.set(e.owner, e.term);

    /* צד הקורבן · כל מה שהכרטיס מקבל כטקסט שלם */
    const accept = new Map();          // מחרוזת -> סוג המקור
    for (const s of e.segs) if (s) accept.set(s, 'פירוש');
    if (!narrow) {
      const lc = LM.cardByKey.get(e.owner);
      if (lc) for (const x of lc.singles) if (x && !accept.has(x)) accept.set(x, 'יחס');
      for (const s of BG.expandOf(gRule, e.segs, ctx, gParams)) {
        const k = ctx.norm(s);
        if (k && !accept.has(k)) accept.set(k, 'הרחבה');
      }
    }
    entries.push({ owner: e.owner, term: e.term, unit: e.unit, segs: Array.from(accept.keys()), allowed: e.allowed, w: e.w });

    /* צד הפולש */
    answers.push({ key: e.owner, owner: e.owner, kind: 'מילה', text: e.term });
    src.key++;
    for (const k of e.keys) if (k !== e.owner) { answers.push({ key: k, owner: e.owner, kind: he ? 'כתיב' : 'מפתח', text: k }); src.key++; }
    for (const [s, kind] of accept) { answers.push({ key: s, owner: e.owner, kind, text: s }); src[kind === 'פירוש' ? 'seg' : kind === 'יחס' ? 'particle' : 'expand']++; }
  }

  if (!narrow) {
    const byKey = new Map(M.info.map(e => [e.owner, e]));
    const addDs = (map, normalize) => {
      for (const [f, os] of map) {
        const k = normalize ? ctx.norm(f) : f;
        if (!k) continue;
        for (const o of os) if (byKey.has(o)) { answers.push({ key: k, owner: o, kind: 'דאטהסט', text: k }); src.dataset++; }
      }
    };
    addDs(DS.forms.gloss[lang], false);
    addDs(DS.forms.word[lang], true);
  }

  const u = { ctx, lang, entries, answers, unitOf, termOf, src, model: M, LM, narrow };
  uniCache.set(key, u);
  return u;
}

/* ===== התנגשויות חדשות ===== */

const baseCache = new Map();
function baselineOf(u) {
  const k = u.lang + (u.narrow ? '|narrow' : '|full');
  const hit = baseCache.get(k);
  if (hit) return hit;
  const b = GS.collisionsUnder(u, null);
  baseCache.set(k, b);
  return b;
}

function newCollisions(pairs, opts) {
  const langs = (opts && opts.langs) || LANGS;
  const found = [];
  for (const lang of langs) {
    const u = universe(lang, opts);
    const map = GS.canonMapOf(pairs, u.ctx.norm);
    if (!map) continue;
    const base = baselineOf(u);
    for (const [id, d] of GS.collisionsUnder(u, map)) if (!base.has(id)) found.push(d);
  }
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found;
}

/* ===== אימות · שום התנגשות אינה מוסקת =====
 * המחרוזת הפולשת חייבת להיות מתקבלת בפועל עבור הערך הפולש, דרך הפונקציות של app.js
 * או דרך הבודק המכויל שנשלח. אחרת היקום מנפח, והדוח מתאר קוד אחר מזה שרץ.
 */
const ckCache = new Map();
function checkerFor(lang) {
  const hit = ckCache.get(lang);
  if (hit) return hit;
  const ctx = getCtx(lang);
  const veto = buildVeto(ctx, lang);
  const S = shipSets();
  const c = {
    word: makeChecker(S[lang === 'en' ? 'en-word' : 'he-word'], ctx, veto, lang),
    gloss: makeChecker(S.gloss, ctx, veto, lang),
  };
  ckCache.set(lang, c);
  return c;
}

function verifyHits(hits) {
  let fail = 0;
  const bad = [];
  for (const h of hits) {
    const u = universe(h.lang);
    const ctx = u.ctx;
    const inv = u.model.byKey.get(h.intruder);
    if (!inv) { fail++; bad.push(`${h.lang} ${h.intruderTerm}: הערך הפולש לא נמצא במודל`); continue; }
    const t = h.intruderText;
    const ck = checkerFor(h.lang);
    const ok = acceptsLive(ctx, t, inv.w) || ctx.meaningMatch(t, inv.w.meaning, inv.w) ||
      ck.word.acceptWord(t, inv.w).ok || ck.gloss.acceptGloss(t, inv.w).ok;
    if (!ok) { fail++; if (bad.length < 8) bad.push(`${h.lang} "${t}" אינו מתקבל בפועל עבור ${h.intruderTerm}`); }
  }
  return { fail, bad };
}

/* ===== השער ===== */

function describe(d) {
  const u = x => (x == null ? '?' : String(x));
  return `[${d.lang}] "${d.victimTerm}" (יחידה ${u(d.victimUnit)}) · "${d.victimSeg}" ` +
    `מתלכד עם ${d.intruderKind} של "${d.intruderTerm}" (יחידה ${u(d.intruderUnit)}): "${d.intruderText}"` +
    (d.sameUnit ? ' ‼ אותה יחידה' : '');
}

/* זרות · מילה בזוג אחד בלבד. ‏canonMapOf אינו טרנזיטיבי, ולכן חפיפה שוברת את המודל בשקט. */
function disjointness(pairs) {
  const ctx = getCtx('he');
  const seen = new Map();
  const bad = [];
  for (const g of pairs) {
    for (const w of g.words) {
      const n = ctx.norm(w);
      if (!n) { bad.push(`זוג ${g.id}: "${w}" מתנרמל לריק`); continue; }
      if (seen.has(n) && seen.get(n) !== g.id) bad.push(`"${w}" מופיע גם בזוג ${seen.get(n)} וגם בזוג ${g.id}`);
      else seen.set(n, g.id);
    }
    if (g.words.length !== 2) bad.push(`זוג ${g.id}: ${g.words.length} מילים · זוג הוא שתיים`);
    for (const w of g.words) if (String(ctx.norm(w)).split(/\s+/).length !== 1) bad.push(`זוג ${g.id}: "${w}" אינו מילה בודדת`);
  }
  return bad;
}

function runGate(pairs, opts) {
  const results = pairs.map(g => {
    const hits = newCollisions([g], opts);
    return {
      id: g.id, words: g.words.slice(), family: g.family, note: g.note,
      pass: hits.length === 0, hits, severe: hits.filter(h => h.sameUnit).length,
    };
  });

  /* מעבר שני · אינטראקציה בין זוגות. שני זוגות זרים עדיין יכולים להחליף שתי מילים
     שונות **באותו מקטע**, וזה לא נבדק באף אחת מהבדיקות הבודדות. */
  const interactions = [];
  for (let round = 0; round < 8; round++) {
    const ok = results.filter(r => r.pass);
    if (!ok.length) break;
    const groupsOk = ok.map(r => pairs.find(g => g.id === r.id));
    const combined = newCollisions(groupsOk, opts);
    const own = new Set();
    for (const r of ok) for (const h of r.hits) own.add(h.id);
    const extra = combined.filter(h => !own.has(h.id));
    if (!extra.length) break;
    const guilty = new Set();
    const touches = (r, h) => {
      const norm = universe(h.lang).ctx.norm;
      const words = new Set((h.victimSeg + ' ' + h.intruderText).split(/\s+/).map(norm));
      return r.words.map(norm).some(w => words.has(w));
    };
    for (const h of extra) for (const r of ok) if (touches(r, h)) guilty.add(r.id);
    if (!guilty.size) break;
    for (const r of results) if (guilty.has(r.id)) {
      r.pass = false;
      r.hits = r.hits.concat(extra.filter(h => touches(r, h)));
      r.interaction = true;
    }
    interactions.push(...extra);
  }
  return { results, interactions };
}

/* ===== תועלת · 24 המקרים ===== */

/* ‏reachable · חסם מבני, ולא הערכה.
 * החלפת נרדפת/זוג היא מיפוי **טוקן לטוקן**: `canonText` מפצל על רווח וממפה כל מילה
 * למילה. לכן `canonText` שומר על **מספר הטוקנים**. מכאן: אם לכרטיס אין ולו מחרוזת
 * מתקבלת אחת באותו מספר טוקנים כמו התשובה שהוקלדה, שום לקסיקון זוגות — ולא משנה כמה
 * זוגות ייכתבו בו — אינו יכול לפתור את המקרה. זו תקרה של המחלקה, לא של הרשימה.
 */
function measureCases(approved) {
  const u = universe('he');
  const ctx = u.ctx;
  const map = GS.canonMapOf(approved, ctx.norm);
  const L = MM.loadLang('he');
  const resolved = MM.resolveCases(L);
  const byOwner = new Map(u.entries.map(e => [e.owner, e]));
  const rows = [];
  for (const { c, card } of resolved) {
    const e = byOwner.get(card.key);
    const typed = ctx.norm(c.typed);
    /* "מתקבל היום" · כיוון הפירוש הוא app.js:2110, כלומר meaningMatch עם הכרטיס.
       ‏`acceptsToday` של lib/keys.js היא כיוון ה**מונח** ומכבה את הסובלנות במפורש,
       ולכן היא **אינה** השאלה כאן · ערבוב השתיים מנפח את מספר ה"נפתרו". */
    const todayOk = ctx.meaningMatch(typed, card.w.meaning, card.w) || acceptsLive(ctx, c.typed, card.w);
    const ct = GS.canonText(typed, map);
    const matched = e ? (e.segs.find(s => GS.canonText(s, map) === ct) || null) : null;
    const nTok = s => String(s).split(/\s+/).filter(Boolean).length;
    const tokTyped = nTok(typed);
    const tokSegs = e ? Array.from(new Set(e.segs.map(nTok))).sort((a, b) => a - b) : [];
    /* ⛔ חסם הזהות · המחרוזת שהוקלדה היא **תשובה שלמה של כרטיס אחר**.
       זו אינה שאלה של כלל או של רשימה: גם רשומה מקובעת "קבל בדיוק את המחרוזת הזאת
       על הכרטיס הזה" הייתה מקבלת את התשובה הנכונה של ערך אחר. */
    const owners = L.SINGLE.get(typed);
    const identity = [];
    if (owners) for (const o of owners) if (!e || !e.allowed.has(o)) {
      const oc = L.cardByKey.get(o);
      identity.push(oc ? `${oc.w.term} (יח' ${oc.unit})` : o);
    }
    rows.push({
      n: c.n, term: card.w.term, unit: card.unit, cat: c.cat, meaning: card.w.meaning,
      typed: c.typed, todayOk, solved: !todayOk && !!matched, matchedSeg: matched,
      tokTyped, tokSegs, reachable: tokSegs.includes(tokTyped), identity,
      why: matched ? 'נפתר' : (identity.length ? 'זהות · המחרוזת היא תשובה של כרטיס אחר'
        : !tokSegs.includes(tokTyped) ? 'טוקנים · אין לכרטיס מחרוזת באותו אורך' : 'לא נכתב זוג מתאים'),
    });
  }
  return rows;
}

/* ===== רוחב התועלת · כמה קבלות הזוגות המאושרים מוסיפים בכלל =====
 * ‏24 המקרים הם בנצ'מרק צר. המספר הזה אומר כמה (כרטיס, מחרוזת) נוספים הלקסיקון פותח
 * על **כל המאגר** · וכיוון שההתנגשויות אפס, כולם לא-מתנגשים בהגדרה.
 */
/* ⚠ המדידה הזאת נכתבה פעם אחת הפוך, וזה שווה תיעוד: היא ספרה כמה מחרוזות **שכבר ביקום**
   נעשות קבילות. לזוג נקי זה בהכרח אפס — "נקי" פירושו בדיוק שהצד השני אינו תשובה של אף
   כרטיס, כלומר אינו ביקום. מדידה כזאת מחזירה 0 לכל זוג שעובר, ולכן היא אינה מודדת תועלת
   אלא מגדירה אותה כאפס. מה שנספר כאן הוא הנכון: כמה מחרוזות **חדשות** הלקסיקון פותח. */
function breadth(approved) {
  const out = {};
  for (const lang of LANGS) {
    const u = universe(lang);
    const norm = u.ctx.norm;
    const partner = new Map();
    for (const g of approved) {
      const ws = g.words.map(norm).filter(Boolean);
      if (ws.length !== 2) continue;
      partner.set(ws[0], ws[1]);
      partner.set(ws[1], ws[0]);
    }
    let cards = 0, adds = 0, touched = 0;
    const ex = [];
    for (const e of u.entries) {
      const own = new Set(e.segs);
      const made = new Set();
      for (const s of e.segs) {
        const ws = s.split(' ');
        const pos = [];
        for (let i = 0; i < ws.length; i++) if (partner.has(ws[i])) pos.push(i);
        if (!pos.length) continue;
        touched++;
        /* כל תת-קבוצה לא ריקה של המיקומים · הקבוצה סופית וקטנה, ולכן נמנית במלואה */
        const total = Math.pow(2, Math.min(pos.length, 10));
        for (let m = 1; m < total; m++) {
          const v = ws.slice();
          for (let j = 0; j < pos.length && j < 10; j++) if (m & (1 << j)) v[pos[j]] = partner.get(ws[pos[j]]);
          const t = v.join(' ');
          if (t !== s && !own.has(t)) made.add(t);
        }
      }
      if (made.size) {
        cards++; adds += made.size;
        if (ex.length < 8) ex.push(`${e.term} ← "${Array.from(made)[0]}"`);
      }
    }
    out[lang] = { cards, adds, touched, ex };
  }
  return out;
}

/* ===== אינטראקציה עם מחלקה E · הלקסיקון שכבר נשלח =====
 * שני לקסיקונים שרצים יחד אינם סכום של שני לקסיקונים שנמדדו לחוד: מקטע שבו מילה אחת
 * מוחלפת מהנרדפות ומילה אחרת מהזוגות לא נבדק באף אחת מהמדידות. נמדד ולא מונח.
 */
function classEInteraction(approvedPairs) {
  let lex = null;
  try { lex = GS.loadLexicon(); } catch (e) { return { error: e.message }; }
  const syn = (lex.groups || []).filter(g => g.status === 'approved');
  const ctx = getCtx('he');
  const words = new Map();
  const overlap = [];
  for (const g of syn) for (const w of g.words) words.set(ctx.norm(w), 'E' + g.id);
  for (const g of approvedPairs) for (const w of g.words) {
    const n = ctx.norm(w);
    if (words.has(n)) overlap.push(`"${w}" · מחלקה E קבוצה ${words.get(n)} וגם זוג ${g.id}`);
  }
  /* מחלקה E נמדדת כאן ביקום **המלא**, שהוא רחב מזה שהשער שלה משתמש בו. */
  const synAlone = newCollisions(syn);
  const pairsAlone = newCollisions(approvedPairs);
  const together = newCollisions(syn.concat(approvedPairs));
  const own = new Set([...synAlone, ...pairsAlone].map(h => h.id));
  const extra = together.filter(h => !own.has(h.id));
  return { synGroups: syn.length, overlap, synAlone: synAlone.length, pairsAlone: pairsAlone.length, together: together.length, extra };
}

/* ===== אמינות היקום · הצד שכן ניתן להפרכה =====
 *
 * ⚠ **מה שנכתב כאן קודם היה טאוטולוגיה, וזה מתועד בכוונה.** הבדיקה הראשונה שאלה
 * "האם קיים ‎x∈segs‎ עם ‎canon(x)=canon(s)‎" עבור ‎s∈segs‎ · ‏‎x=s‎ מספק את זה תמיד, ולכן
 * היא לא יכלה להאדים לעולם. ‏CLAUDE.md מנסח את זה בדיוק: *"שער שמדווח 'עבר' בלי הוכחת
 * שיניים אינו עדות"*, וזה היה המקרה השלישי מאותו סוג בפרויקט.
 *
 * אי-רגרסיה כאן היא **מבנית ולא אמפירית**, וזו הניסוח הנכון: השכבה היא
 * ‎`meaningMatch(t) || canonMatch(t)`‎ · תוספת בלבד, ו-‎`canon(s)=canon(s)`‎ תמיד. אין מה
 * למדוד שם, ולהעמיד פנים שיש זו הטעיה.
 *
 * מה שכן ניתן להפרכה, וזו הבדיקה שהוחלפה לתוכה: האם **צד הקורבן של היקום** אמיתי ·
 * כלומר האם כל מחרוזת שסימנתי "הכרטיס מקבל אותה" באמת מתקבלת לפי `app.js`. זו המראה
 * של `verifyHits` בצד השני, והיא נופלת אם בניתי את היקום לא נכון · מודגם ב-`--selftest`.
 */
const OWN_KINDS = new Set(['פירוש', 'יחס', 'מילה', 'כתיב', 'מפתח']);

function universeFaithful(opts) {
  let checked = 0, bad = 0, own = 0;
  const ex = [], exOwn = [];
  const byKind = {};
  for (const lang of LANGS) {
    const u = universe(lang);
    const ctx = u.ctx;
    const kindOf = new Map();
    for (const a of u.answers) if (!kindOf.has(a.owner + ' ' + a.key)) kindOf.set(a.owner + ' ' + a.key, a.kind);
    for (const e of u.entries) for (const s of e.segs) {
      checked++;
      const inject = opts && opts.mutant && e.owner === opts.mutant.owner && s === opts.mutant.str;
      const ok = inject ? false : (ctx.meaningMatch(s, e.w.meaning, e.w) || acceptsLive(ctx, s, e.w));
      if (ok) continue;
      bad++;
      const k = kindOf.get(e.owner + ' ' + s) || '?';
      byKind[k] = (byKind[k] || 0) + 1;
      const row = `${lang} ${e.term} ← "${s}" (${k})`;
      if (ex.length < 8) ex.push(row);
      if (OWN_KINDS.has(k)) { own++; if (exOwn.length < 8) exOwn.push(row); }
    }
  }
  return { checked, bad, own, ex, exOwn, byKind };
}

/* ===== כלל מול רשימה · הטענה של הקובץ הזה, נמדדת =====
 *
 * חוק `binyanPair` הוא **מכליל**: הוא מתיר את ההמרה על כל שורש שמתאים לתבנית. אפשר
 * למנות בדיוק אילו זוגות מפורשים הוא מרשה — `expand` היא מנייה מלאה (‏kind='gen') —
 * ואז לשאול על כל אחד מהם את אותה שאלה שנשאלת על זוג שנכתב ביד.
 *
 * ⚠ **מה שנוסה ונפסל כמדד:** ‏`out/runtime-lexicon.js` נראה כמו אורקל טבעי ל"האם זו
 * מילה עברית", והוא **אינו** כזה. הוא נבנה במפורש אחרי **חיסור כל צורה קבילה של כל ערך
 * במאגר**, ולכן הוא מחזיר false גם למילים נפוצות לגמרי · נמדד: `בית`, `אדם`, `ילדים`,
 * `עייף` כולן false. עמודת "אינה מילה" שנבנתה עליו החזירה 186 מתוך 186, כלומר סימנה גם
 * את `מורד↔מרדן`. המדד הוסר · מספר שאי אפשר לעמוד מאחוריו גרוע ממספר שאינו קיים.
 */
function ruleVsList(gateIds) {
  const MR = require('./lib/morphrules.js');
  const out = [];
  for (const pr of MR.BINYAN_PAIRS) {
    const params = { pairs: [pr.id], strictRoot: true };
    const seen = new Map();       // "a|b" -> [a,b]
    for (const lang of LANGS) {
      const ctx = getCtx(lang);
      for (const w of Array.from(ctx.BANK)) for (const s of Array.from(ctx.meaningSegs(w.meaning))) {
        if (String(s).split(/\s+/).filter(Boolean).length !== 1) continue;
        for (const v of MR.binyanPair.expand([s], ctx, params)) {
          const k = [s, v].sort().join('|');
          if (!seen.has(k)) seen.set(k, [s, v]);
        }
      }
    }
    const list = Array.from(seen.values());
    const row = { id: pr.id, he: pr.he, generated: list.length, gated: null, colliding: null, clean: null, sample: list.slice(0, 8).map(x => x.join('↔')), collidingNames: [] };
    if (gateIds && gateIds.includes(pr.id)) {
      let coll = 0;
      for (const [a, b] of list) if (newCollisions([{ id: -100, words: [a, b] }]).length) { coll++; if (row.collidingNames.length < 12) row.collidingNames.push(`${a}↔${b}`); }
      row.gated = list.length; row.colliding = coll; row.clean = list.length - coll;
    }
    out.push(row);
  }
  return out;
}

/* ===== לקסיקון ===== */

function loadLexicon(p) {
  const raw = JSON.parse(fs.readFileSync(p || LEX_PATH, 'utf8'));
  if (!raw || !Array.isArray(raw.pairs)) throw new Error('morph-pairs.json: אין מערך pairs');
  return raw;
}

/* ===== שיניים ===== */

function selftest() {
  const say = s => process.stdout.write(s + '\n');
  let fails = 0;
  const T = (name, ok, detail) => {
    say(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
    if (!ok) fails++;
  };
  say('=== שיניים · gate_morph_pairs ===');
  say('');

  const u = universe('he');
  const ue = universe('en');
  say('א · היקום אינו ריק, ומורחב מעבר לזה של gate_synonyms');
  T('יקום עברי לא ריק', u.answers.length > 1000 && u.entries.length > 1000, `${u.entries.length} ערכים · ${u.answers.length} תשובות`);
  const narrow = universe('he', { narrow: true });
  T('היקום המלא גדול מהצר', u.answers.length > narrow.answers.length,
    `מלא ${u.answers.length} · צר ${narrow.answers.length} · מקורות ${JSON.stringify(u.src)}`);
  T('כל חמשת המקורות תרמו', u.src.key > 0 && u.src.seg > 0 && u.src.particle > 0 && u.src.expand > 0 && u.src.dataset > 0,
    JSON.stringify(u.src));
  T('אנגלית נטענת גם היא', ue.entries.length > 1000, `${ue.entries.length} ערכים`);

  say('');
  say('ב · זוג שבור בכוונה חייב להאדים');
  /* שני מקטעים אמיתיים של שני ערכים שונים · מיזוג שלהם הוא בדיוק מה שאסור. */
  const RED1 = [{ id: -1, words: ['עייף', 'עייפות'], family: 'teeth', note: 'שיניים' }];
  const h1 = newCollisions(RED1);
  T('עייף↔עייפות מאדים', h1.length > 0, h1.length ? describe(h1[0]) : 'לא נמצאה התנגשות · השער עיוור');
  const RED2 = [{ id: -2, words: ['שקט', 'דומם'], family: 'teeth', note: 'שיניים' }];
  const h2 = newCollisions(RED2);
  T('שקט↔דומם מאדים', h2.length > 0, h2.length ? describe(h2[0]) : 'לא נמצאה התנגשות');

  say('');
  say('ג · והשער אינו אדום תמיד');
  /* מחרוזות שאינן במאגר כלל · אין דרך שהן ייצרו התנגשות. */
  const GREEN = [{ id: -3, words: ['קוואזיתלת', 'קוואזיארבע'], family: 'teeth', note: 'שיניים' }];
  const h3 = newCollisions(GREEN);
  T('זוג מומצא עובר', h3.length === 0, `${h3.length} התנגשויות`);

  say('');
  say('ד · היקום המורחב תופס מה שהצר מפספס · הדגמה, לא הצהרה');
  let found = null;
  for (const pr of [['הפריע', 'הפרעה'], ['הסכים', 'הסכמה'], ['לשמור', 'שמר'], ['הכריז', 'הכרזה']]) {
    const g = [{ id: -4, words: pr, family: 'teeth', note: 'שיניים' }];
    const nHits = newCollisions(g, { narrow: true });
    const fHits = newCollisions(g);
    if (nHits.length === 0 && fHits.length > 0) { found = { pr, nHits, fHits }; break; }
  }
  T('קיים זוג שהיקום הצר מאשר והמלא דוחה', !!found,
    found ? `${found.pr.join(' ↔ ')} · צר ${found.nHits.length} · מלא ${found.fHits.length} · ${describe(found.fHits[0])}`
      : 'לא נמצא · ההרחבה לא הודגמה, ולכן היא אינה עדות');

  say('');
  say('ט · החסם המבני · canonText שומר על מספר הטוקנים');
  const nTok = s => String(s).split(/\s+/).filter(Boolean).length;
  const mapT = GS.canonMapOf([{ id: -9, words: ['פשט', 'התפשט'] }], u.ctx.norm);
  const sample = ['פשט את בגדיו', 'שקשור בתחומ תורת ההוראה', 'מרדנ'];
  T('החלפה אינה משנה מספר טוקנים', sample.every(s => nTok(GS.canonText(s, mapT)) === nTok(s)),
    sample.map(s => `${nTok(s)}→${nTok(GS.canonText(s, mapT))}`).join(' '));

  say('');
  say('ה · האימות עצמו עובד');
  const v1 = verifyHits(h1);
  T('ההתנגשויות שנמצאו מאומתות מול app.js', v1.fail === 0, `${h1.length} התנגשויות · ${v1.fail} נכשלו`);
  const fake = [{ lang: 'he', intruder: 'זזזזזז', intruderTerm: 'זזזזזז', intruderText: 'זזזזזז' }];
  T('אימות על ערך מומצא נופל', verifyHits(fake).fail === 1);

  say('');
  say('ו · זרות · חפיפה בין זוגות נופלת בשם');
  const OVER = [{ id: 1, words: ['אבד', 'איבד'] }, { id: 2, words: ['איבד', 'אובדן'] }];
  T('חפיפה נתפסת', disjointness(OVER).length > 0, disjointness(OVER)[0]);
  T('רשימה זרה שותקת', disjointness([{ id: 1, words: ['אבד', 'איבד'] }, { id: 2, words: ['רעב', 'רעבון'] }]).length === 0);
  T('שלוש מילים נתפסות', disjointness([{ id: 1, words: ['א', 'ב', 'ג'] }]).length > 0);

  say('');
  say('ז · baseline · מה שמתנגש היום אינו באשמת הלקסיקון');
  const base = baselineOf(u);
  T('קיים baseline לא ריק', base.size > 0, `${base.size} התנגשויות קיימות בעברית`);

  say('');
  say('ח · אמינות צד הקורבן של היקום · והבדיקה הזאת חייבת להיות ניתנת להפרכה');
  const fa = universeFaithful();
  T('כל מחרוזת שאני בניתי באמת מתקבלת לפי app.js', fa.own === 0,
    `${fa.checked} נבדקו · ${fa.bad} לא מתקבלות${fa.ex.length ? ' · ' + fa.ex[0] : ''}${Object.keys(fa.byKind).length ? ' · ' + JSON.stringify(fa.byKind) : ''}`);
  const victim = u.entries.find(e => e.segs.length);
  const mut = universeFaithful({ mutant: { owner: victim.owner, str: victim.segs[0] } });
  T('הזרקת מחרוזת שאינה מתקבלת מאדימה', mut.own === fa.own + 1, `${mut.bad} · ${mut.ex[0] || ''}`);

  say('');
  say(fails ? `⛔ ${fails} כשלים` : '✅ כל השיניים אדומות במקום הנכון');
  process.exit(fails ? 1 : 0);
}

/* ===== main ===== */

function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const lex = loadLexicon();
  const pairs = lex.pairs;

  const dj = disjointness(pairs);
  if (dj.length) {
    process.stdout.write('⛔ הלקסיקון אינו זר · המודל הקנוני אינו תקף עליו:\n');
    for (const b of dj.slice(0, 12)) process.stdout.write('   ' + b + '\n');
    process.exit(2);
  }

  const { results } = runGate(pairs);
  const byId = new Map(results.map(r => [r.id, r]));
  for (const g of pairs) {
    const r = byId.get(g.id);
    if (!r) continue;
    g.status = r.pass ? 'approved' : 'rejected';
    if (r.pass) delete g.reason;
    else g.reason = r.hits.slice(0, 3).map(describe).join(' ‖ ');
  }

  /* זוגות שנכתבו עבור מקרה שחסום-זהות · לא "נדחו בשער" אלא **בלתי ניתנים למימוש**.
     ההבחנה חשובה: זוג שנדחה אפשר לנסח מחדש, וזוג חסום-זהות אי אפשר. */
  const ctxHe = getCtx('he');
  const blockedTyped = new Map();
  for (const c of measureCases([])) if (c.identity && c.identity.length) blockedTyped.set(ctxHe.norm(c.typed), c);
  for (const g of pairs) {
    const hit = g.words.map(w => ctxHe.norm(w)).find(w => blockedTyped.has(w));
    if (!hit) { delete g.unimplementable; continue; }
    const c = blockedTyped.get(hit);
    g.unimplementable = `מקרה ${c.n} · "${c.typed}" הוא תשובה שלמה של ${c.identity.join(' , ')} · חסם זהות, לא חסם ניסוח`;
  }

  const approved = pairs.filter(g => g.status === 'approved');
  const rejected = pairs.filter(g => g.status === 'rejected');
  const allHits = results.reduce((a, r) => a.concat(r.hits), []);
  const ver = verifyHits(allHits);
  const cases = measureCases(approved);
  const ceiling = measureCases(pairs);
  const reg = universeFaithful();
  const uHe = universe('he'), uEn = universe('en');
  const inter = classEInteraction(approved);
  /* כמה מהזוגות היקום הצר (זה של gate_synonyms) היה מאשר · המחיר של הנקודה העיוורת */
  const narrowOnly = [];
  for (const g of pairs) {
    const r = byId.get(g.id);
    if (r.pass) continue;
    if (newCollisions([g], { narrow: true }).length === 0) narrowOnly.push({ g, hits: r.hits });
  }

  const MORPH = [4, 8, 14, 23];
  const solvedAll = cases.filter(c => c.solved);
  const solvedMorph = cases.filter(c => c.solved && MORPH.includes(c.n));
  const ceilMorph = ceiling.filter(c => c.solved && MORPH.includes(c.n));
  const todayCases = cases.filter(c => c.todayOk);
  const wide = breadth(approved);
  /* ‏act-agent הוא המשפחה של מקרה 4 · המקרה היחיד מהארבעה שהוא בר-פתרון בכלל,
     ולכן ההשוואה כלל-מול-רשימה נעשית בדיוק שם, ולא על משפחה נוחה יותר. */
  const rvl = ruleVsList(['act-agent']);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LEX_PATH, JSON.stringify(lex, null, 2) + '\n', 'utf8');

  const L = [];
  const p = s => L.push(s);
  p('# שער ההתנגשויות · לקסיקון זוגות המורפולוגיה');
  p('');
  p('נוצר על ידי `typo-lab/gate_morph_pairs.js`. אין לערוך ביד · כל הרצה כותבת מחדש.');
  p('');
  p('## פסק הדין');
  p('');
  p('| | |');
  p('|---|---|');
  p(`| זוגות שנכתבו | ${pairs.length} |`);
  p(`| עברו (approved) | **${approved.length}** |`);
  p(`| נדחו (rejected) | **${rejected.length}** |`);
  p(`| התנגשויות חדשות שנמצאו | ${allHits.length} |`);
  p(`| מתוכן באותה יחידה (החמורות) | ${results.reduce((a, r) => a + r.severe, 0)} |`);
  p(`| התנגשויות שאומתו מול app.js · נכשלו | ${ver.fail} |`);
  p(`| נדחו רק בגלל אינטראקציה בין זוגות | ${results.filter(r => r.interaction).length} |`);
  p(`| **מ-4 מקרי המורפולוגיה הפתוחים · נפתרו** | **${solvedMorph.length}** (${solvedMorph.map(c => c.n).join(', ') || '-'}) |`);
  p(`| התקרה · מה כל ${pairs.length} הזוגות היו פותרים בלי השער | ${ceilMorph.length} (${ceilMorph.map(c => c.n).join(', ') || '-'}) |`);
  p(`| מ-24 המקרים · מתקבלים כבר היום | ${todayCases.length} (${todayCases.map(c => c.n).join(', ')}) |`);
  p(`| מ-24 המקרים · **חדשים** בזכות הלקסיקון | **${solvedAll.length}** (${solvedAll.map(c => c.n).join(', ') || '-'}) |`);
  p(`| מחרוזות חדשות שנפתחו על כל המאגר · he / en | ${wide.he.adds} / ${wide.en.adds} · על ${wide.he.cards} + ${wide.en.cards} ערכים |`);
  p(`| אמינות היקום · מחרוזות שנבדקו / אינן מתקבלות בפועל | ${reg.checked} / **${reg.bad}** |`);
  p('');
  p('⚠ **"מתקבל היום" נמדד בכיוון הפירוש** (‏`meaningMatch` · app.js:2110), ולא דרך');
  p('‏`acceptsToday` של `lib/keys.js` — שהיא כיוון ה**מונח** ומכבה את שכבת הסובלנות');
  p('במפורש. ערבוב השתיים מנפח את מספר ה"נפתרו". שש השורות שכבר עוברות היום נמדדו');
  p('גם עם שכבת הסובלנות דלוקה וגם כבויה, ובשני המצבים אותן שש.');
  p('');
  p('## המלצה · שורה אחת');
  p('');
  p(`הלקסיקון עובד ונקי: **${approved.length} זוגות** עברו שער אפס-התנגשויות על שני המאגרים,`);
  p(`פותחים ${wide.he.adds + wide.en.adds} מחרוזות על ${wide.he.cards + wide.en.cards} ערכים, באפס התנגשויות ובאפס רגרסיה.`);
  p('');
  p(`ובכל זאת — מתוך ארבעת המקרים שהמשימה נפתחה עליהם, **${solvedMorph.length} נפתר** (מקרה 4).`);
  p('שניים מתים מבנית (חסם זהות), והרביעי דורש מחלקה אחרת לגמרי (תשובה חלקית).');
  p('');
  p('**מה שאני הייתי אומר לחגי, ולא באופן אוהד:**');
  p('');
  p(`- המסלול עובד, והוא בדיוק המסלול שמחלקה E כבר הוכיחה. אין כאן סיכון חדש.`);
  p(`- התועלת על הבנצ׳מרק האמיתי היא **מקרה אחד** · בדיוק כמו שמחלקה E נתנה 2 מתוך 11.`);
  p(`- המחיר אינו סיכון אלא **תחזוקה**: ${pairs.length} שורות שצריך לקרוא מחדש בכל שינוי במאגר.`);
  p('- אם המדד הוא "24 המקרים" — **לא שווה**. אם המדד הוא "למעט פסילות שרירותיות');
  p(`  על ניסוח אחר של אותה מילה" — ${wide.he.adds + wide.en.adds} מחרוזות על ${wide.he.cards + wide.en.cards} ערכים הן המספר, והוא לא אפס.`);
  p('- **ההכרעה של חגי.** אני לא הייתי משלח את זה עבור מקרה אחד מתוך 24.');
  p('');
  p('שני דברים שיצאו מהעבודה הזאת ושווים יותר מהלקסיקון עצמו, ושניהם למטה במלואם:');
  p(`1. היקום של שער הנרדפות צר מיקום הקבלה · ${narrowOnly.length} מתוך ${pairs.length} זוגות עוברים בו ונופלים במלא.`);
  p(`2. שער אפס-ההתנגשויות אינו יכול לפסול מחרוזות שאינן מילים · ראה "כלל מול רשימה".`);
  p('');
  p('## יקום הקבלה שנבדק');
  p('');
  p('חמשת המקורות של `bank_gate.js`, מיובאים ולא ממומשים מחדש. יקום צר יותר היה מייצר');
  p('ירוק שלא הסתכל · זה בדיוק מה שהפיל את מועמד ה-gloss הראשון.');
  p('');
  p('| שפה | ערכים | תשובות ביקום | מפתחות מונח | מקטעים | ‏particleMatch | ‏B1-union | דאטהסט |');
  p('|---|---|---|---|---|---|---|---|');
  for (const u of [uHe, uEn]) {
    p(`| ${u.lang} | ${u.entries.length} | ${u.answers.length} | ${u.src.key} | ${u.src.seg} | ${u.src.particle} | ${u.src.expand} | ${u.src.dataset} |`);
  }
  p('');
  p('## ארבעת המקרים הפתוחים');
  p('');
  p('| # | מילה | הפירוש | מה הוקלד | טוקנים · תשובה / מחרוזות הכרטיס | נפתר | למה |');
  p('|---|---|---|---|---|---|---|');
  for (const c of cases.filter(x => MORPH.includes(x.n))) {
    p(`| ${c.n} | ${c.term} | ${String(c.meaning).replace(/\|/g, '/')} | ${c.typed} | ${c.tokTyped} / ${c.tokSegs.join(',')} | ${c.solved ? '**כן**' : 'לא'} | ${c.why} |`);
  }
  p('');
  p('### ⛔ חסם הזהות · שניים מהמקרים מתים, ולא בגלל השער');
  p('');
  p('המחרוזת שהוקלדה היא **תשובה שלמה ומאושרת של כרטיס אחר**, ושני הכרטיסים אינם');
  p('נרדפים שחולקים פירוש. זו אינה שאלה של כלל מול רשימה: גם רשומה מקובעת שאומרת "קבל');
  p('בדיוק את המחרוזת הזאת על הכרטיס הזה" הייתה מקבלת את התשובה הנכונה של ערך אחר,');
  p('כלומר הורסת בדיוק את האבחנה שכלל אפס-הקבלות קיים כדי לשמור.');
  p('');
  for (const c of cases.filter(x => MORPH.includes(x.n) && x.identity.length)) {
    p(`- **מקרה ${c.n} · ${c.term}** · "${c.typed}" הוא תשובה מלאה של: ${c.identity.join(' , ')}. **בלתי ניתן למימוש.**`);
  }
  p('');
  p('הממצא הזה הגיע גם משני סוכנים אחרים, בשתי שיטות בלתי תלויות, ומוסכם.');
  p('');
  p('### התקרה של המחלקה · נמדדת, לא משוערת');
  p('');
  p('החלפת זוג היא מיפוי **טוקן לטוקן**: `canonText` מפצל על רווח וממפה מילה למילה, ולכן');
  p('הוא **שומר על מספר הטוקנים** (מודגם ב-`--selftest`). מכאן חסם קשיח: אם לכרטיס אין ולו');
  p('מחרוזת מתקבלת אחת באותו מספר טוקנים כמו התשובה שהוקלדה, **שום** לקסיקון זוגות אינו');
  p('יכול לפתור את המקרה · לא בגלל השער, ולא בגלל מה שנכתב או לא נכתב ברשימה.');
  p('');
  for (const c of cases.filter(x => MORPH.includes(x.n) && !x.reachable)) {
    p(`- **מקרה ${c.n} · ${c.term}** · הוקלד "${c.typed}" (${c.tokTyped} טוקנים) · לכרטיס יש רק מחרוזות באורך ${c.tokSegs.join(', ')} טוקנים. **בלתי-נגיש מבנית.**`);
  }
  p('');
  p('אלה בדיוק המקרים שסווגו בדוח כ"מורפולוגיה **+ חלקית**": התשובה אינה החלפת מילה');
  p('בפירוש אלא **תת-קבוצה** ממנו במשקל אחר. מה שחסר להם הוא מחלקת "תשובה חלקית"');
  p('(‏B2 · ראש מקטע), שנמדדה ונדחתה על 34 התנגשויות · לא לקסיקון.');
  p('');
  p('⚠ **מקרה 23 במפורש:** הזוג `שקשור ↔ קשור` **עובר את השער והוא נקי**, ובכל זאת אינו');
  p('פותר את המקרה · "קשור להוראה" הוא שני טוקנים והמקטע הוא ארבעה. כלומר גם זוג מושלם');
  p('אינו מספיק שם, ומה שדרוש הוא טיפול ב**תשובה חלקית**. זה נאמר כדי שלא ייווצר רושם');
  p('שזוג נוסף ברשימה יסגור אותו.');
  p('');
  p('## הזוגות שעברו');
  p('');
  if (!approved.length) p('אין.');
  else {
    p('| # | זוג | משפחה | הערה |');
    p('|---|---|---|---|');
    for (const g of approved) p(`| ${g.id} | ${g.words.join(' ↔ ')} | ${g.family} | ${g.note} |`);
  }
  p('');
  p('## הזוגות שנדחו · ובשם ההתנגשות');
  p('');
  if (!rejected.length) p('אין.');
  for (const g of rejected) {
    const r = byId.get(g.id);
    p(`### ${g.id} · ${g.words.join(' ↔ ')}${r.interaction ? '  (אינטראקציה בין זוגות)' : ''}${g.unimplementable ? '  ⛔ בלתי ניתן למימוש' : ''}`);
    p('');
    p(`${g.family} · ${g.note}`);
    if (g.unimplementable) { p(''); p(`⛔ **${g.unimplementable}**`); }
    p('');
    p(`התנגשויות חדשות: ${r.hits.length}${r.severe ? ` · מהן ${r.severe} באותה יחידה` : ''}`);
    p('');
    for (const h of r.hits.slice(0, 5)) p(`- ${describe(h)}`);
    if (r.hits.length > 5) p(`- ... ועוד ${r.hits.length - 5}`);
    p('');
  }
  p('## כלל מול רשימה · הטענה של הקובץ הזה, במספרים');
  p('');
  p('חוק `binyanPair` הוא `kind: gen`, כלומר קבוצת הקבלות שלו **ניתנת למנייה מלאה**.');
  p('לכן אפשר לשאול בדיוק כמה זוגות מפורשים כל כלל מרשה, ואז לשאול על כל אחד מהם את');
  p('אותה שאלה שנשאלת כאן על זוג שנכתב ביד.');
  p('');
  p('| כלל | מייצר זוגות מפורשים | נבדקו בשער | מתנגשים | עוברים את השער | דוגמאות ממה שהוא מרשה |');
  p('|---|---|---|---|---|---|');
  for (const r of rvl) {
    p(`| \`${r.id}\` · ${r.he} | ${r.generated} | ${r.gated == null ? '·' : r.gated} | ${r.colliding == null ? '·' : r.colliding} | ${r.clean == null ? '·' : r.clean} | ${r.sample.slice(0, 4).join(' · ')} |`);
  }
  p('');
  const ag = rvl.find(r => r.id === 'act-agent');
  if (ag) {
    p(`**‏\`act-agent\` הוא המשפחה של מקרה 4**, המקרה היחיד מהארבעה שהוא בר-פתרון בכלל.`);
    p(`מ-\`out/morph-report.md\`: הכלל הזה פותר את מקרה 4 ונדחה שם על התנגשויות.`);
    p('');
    p(`### 🔑 והנה מה שהמדידה הזאת מוסיפה, והוא הפוך ממה שציפיתי`);
    p('');
    p(`הכלל מרשה **${ag.generated} זוגות מפורשים**. מתוכם **${ag.colliding} בלבד מתנגשים**, כלומר`);
    p(`**${ag.clean} מהם עוברים את שער אפס-ההתנגשויות**. כלומר לא נכון לומר שהכלל נדחה מפני`);
    p('שכל מה שהוא מרשה מתנגש · רובו המכריע **אינו** מתנגש.');
    p('');
    p('הסיבה שהוא בכל זאת לא ראוי למשלוח היא אחרת לגמרי, וזה הממצא:');
    p('');
    p(`| מה שהכלל מרשה | ${ag.sample.slice(0, 6).join(' · ')} |`);
    p('|---|---|');
    p('');
    p('‏`טוסט↔טסטנ` · `שוקת↔שקתנ` · `מוטע↔מטענ` אינם התנגשויות — הם פשוט **אינם מילים**.');
    p('אף כרטיס אינו מקבל אותם, ולכן שער ההתנגשויות **אינו יכול** לפסול אותם: הוא שואל');
    p('"האם זו תשובה של כרטיס אחר", ולא "האם זו מילה".');
    p('');
    p('⚠ זו בדיוק הפרצה ש-`STATE.md` כבר תיעד ב-15.8 15:00 על פונקציית המטרה של ה-GA:');
    p('*"אילוץ אפס-הקבלות-שווא ... **מעולם לא קנס** קבלה של מחרוזת שאינה מילה כלל"*.');
    p('כאן היא חוזרת במחלקה אחרת לגמרי, ובאותה צורה.');
    p('');
    p('**המסקנה המדויקת, ולא זו שרציתי:** הרשימה המפורשת אינה עדיפה על הכלל מפני שהיא');
    p('עוברת שער והוא לא. שניהם עוברים את השער כמעט באותה מידה. היא עדיפה מפני ש**היא');
    p('נכתבת על ידי מי שיודע ש"טסטן" אינה מילה** — כלומר היא מוסיפה שכבת בקרה שאין לשער');
    p(`בכלל. המחיר: כדי לקבל את הזוג האחד שפותר מקרה אמיתי (\`מרדן ↔ מורד\`), הכלל דורש`);
    p(`לקחת גם את ${ag.generated - 1} האחרים.`);
    p('');
    if (ag.collidingNames.length) {
      p(`${ag.colliding} הזוגות שכן מתנגשים, בשמם: ${ag.collidingNames.join(' · ')}${ag.colliding > ag.collidingNames.length ? ' ...' : ''}`);
      p('');
    }
  }
  p('## ⚠ מה שהיקום הצר היה מאשר · המחיר של הנקודה העיוורת');
  p('');
  p('אותם זוגות בדיוק, מול היקום של `gate_synonyms` (מפתחות מונח + מקטעי פירוש בלבד)');
  p('לעומת יקום הקבלה המלא. **ההפרש אינו תיאורטי:**');
  p('');
  p(`**${narrowOnly.length} מתוך ${pairs.length} הזוגות מקבלים ירוק ביקום הצר ואדום ביקום המלא.**`);
  p('');
  if (narrowOnly.length) {
    p('| זוג | התנגשויות ביקום המלא | ההתנגשות הראשונה |');
    p('|---|---|---|');
    for (const { g, hits } of narrowOnly) p(`| ${g.words.join(' ↔ ')} | ${hits.length} | ${describe(hits[0])} |`);
    p('');
    p('רוב ההתנגשויות האלה מגיעות מענף `particleMatch` (סוג "יחס") · מחרוזת בת מילה אחת');
    p('שכרטיס מקבל דרך קילוף אות יחס, ואינה מקטע פירוש גולמי. זו **אותה משפחת נקודה');
    p('עיוורת** שהפילה את מועמד ה-gloss הראשון (‏`STATE.md`, 05:30).');
    p('');
  }
  p('## אינטראקציה עם מחלקה E · לקסיקון הנרדפות שכבר נשלח');
  p('');
  if (inter.error) p(`לא נמדד: ${inter.error}`);
  else {
    p(`| | |`);
    p(`|---|---|`);
    p(`| קבוצות נרדפות מאושרות | ${inter.synGroups} |`);
    p(`| חפיפת מילים בין שני הלקסיקונים | ${inter.overlap.length} |`);
    p(`| התנגשויות · הנרדפות לבדן, **ביקום המלא** | ${inter.synAlone} |`);
    p(`| התנגשויות · הזוגות לבדם | ${inter.pairsAlone} |`);
    p(`| התנגשויות · שני הלקסיקונים יחד | ${inter.together} |`);
    p(`| **התנגשויות שנולדו רק מהצירוף** | **${inter.extra.length}** |`);
    p('');
    if (inter.overlap.length) { for (const o of inter.overlap) p(`- ⚠ ${o}`); p(''); }
    if (inter.extra.length) {
      p('התנגשויות שאף אחד מהלקסיקונים אינו מייצר לבדו:');
      p('');
      for (const h of inter.extra.slice(0, 10)) p(`- ${describe(h)}`);
      p('');
    }
    if (inter.synAlone > 0) {
      p(`⚠ **ממצא נלווה שראוי להיאמר:** ${inter.synGroups} קבוצות הנרדפות שכבר אושרו ונשלחו`);
      p(`מייצרות **${inter.synAlone} התנגשויות** כשמודדים אותן ביקום הקבלה המלא. השער שלהן`);
      p('(`gate_synonyms.js`) מודד ביקום הצר, ולכן לא ראה אותן. זה **אינו** ממצא על הקובץ');
      p('הזה · הוא על מחלקה E, והוא מוצג כאן כי המדידה נעשתה ממילא ואסור לבלוע אותה.');
      p('');
    }
  }
  p('## אימות');
  p('');
  p(`כל ${allHits.length} ההתנגשויות אומתו מול הפונקציות של \`app.js\` (\`acceptsToday\` ·`);
  p('`meaningMatch` · הבודק המכויל). התנגשות שאינה מאומתת פירושה יקום מנופח, ולכן');
  p(`\`verifyFail\` חייב להיות 0. **נמדד: ${ver.fail}.**`);
  if (ver.bad.length) { p(''); for (const b of ver.bad) p(`- ⛔ ${b}`); }
  p('');
  p(`אמינות צד הקורבן: **${reg.checked}** מחרוזות ביקום נבדקו מול \`meaningMatch\` האמיתית של `);
  p('`app.js`. פסק הדין הוא על המקורות ש**אני** בניתי (מקטע, יחס, מפתח מונח):');
  p('');
  p(`| | |`);
  p(`|---|---|`);
  p(`| מחרוזות שנבדקו | ${reg.checked} |`);
  p(`| **ממקור שלי · אינן מתקבלות** | **${reg.own}** · חוסם |`);
  p(`| משכבות אחרות (B1 · דאטהסט) · אינן מתקבלות | ${reg.bad - reg.own} · קירוב-יתר בכיוון הבטוח |`);
  p(`| פילוח לפי מקור | ${JSON.stringify(reg.byKind)} |`);
  p('');
  if (reg.exOwn.length) { p('⛔ ממקור שלי · חוסם:'); p(''); for (const x of reg.exOwn) p(`- ⛔ ${x}`); p(''); }
  if (reg.bad > reg.own) {
    p('⚠ **ממצא נלווה · אינו שלי, ואני לא בולע אותו.** המחרוזות האלה מגיעות');
    p('מ-`expandOf(B1-union)` · חוק צד-הפירוש שהמעבדה מניחה שנשלח · והבודק של המעבדה');
    p('מקבל אותן, אבל `meaningMatch` של `app.js` **דוחה אותן**. נמדד:');
    p('');
    for (const x of reg.ex.filter(y => !reg.exOwn.includes(y)).slice(0, 4)) p(`- ${x}`);
    p('');
    p('למשל עבור `אֲלוּמָּה`: `expandOf` מייצר `"קרנ אור"` ו-`makeGlossChecker` מחזיר');
    p('`{ok:true, by:"splitOr"}`, בזמן ש-`ctx.meaningMatch("קרנ אור", meaning, card)` מחזיר **false**.');
    p('כלומר קיים פער בין תצורת `B1-union` שבמעבדה לבין `splitOr` שרץ באפליקציה.');
    p('');
    p('לא נגעתי · זו שכבה של מישהו אחר, והכיוון בטוח לענייני: הכללה של מחרוזת');
    p('עודפת בצד הקורבן **מגדילה** את מספר ההתנגשויות שהשער יכול למצוא, ולכן');
    p('מחמירה אותו. אבל הוא ראוי לבדיקה · `bank_gate` משתמש באותה קבוצה בדיוק.');
    p('');
  }
  p('');
  p('⚠ **אי-רגרסיה כאן היא מבנית ולא אמפירית, וזה נאמר במפורש.** השכבה היא');
  p('‏`meaningMatch(t) || canonMatch(t)` · תוספת בלבד, ו-`canon(s)=canon(s)` תמיד. הבדיקה');
  p('שהייתה כאן קודם ("האם קיים `x∈segs` עם `canon(x)=canon(s)`") מסופקת תמיד על ידי');
  p('`x=s`, כלומר לא יכלה להאדים לעולם. היא הוחלפה בבדיקה שכן ניתנת להפרכה · שצד');
  p('הקורבן של היקום אמיתי · ושיש לה הדגמת אדום ב-`--selftest`.');
  p('');
  p('## רוחב התועלת · מה הלקסיקון פותח מעבר ל-24 המקרים');
  p('');
  p('| שפה | ערכים שמקבלים משהו חדש | מחרוזות מתקבלות שנוספו | מקטעים שהלקסיקון נוגע בהם |');
  p('|---|---|---|---|');
  p(`| he | ${wide.he.cards} | ${wide.he.adds} | ${wide.he.touched} |`);
  p(`| en | ${wide.en.cards} | ${wide.en.adds} | ${wide.en.touched} |`);
  p('');
  p('כולן לא-מתנגשות · אפס ההתנגשויות נמדד על אותו יקום בדיוק. דוגמאות:');
  p('');
  for (const x of wide.he.ex.concat(wide.en.ex).slice(0, 10)) p(`- ${x}`);
  p('');
  p(`⚠ **קרא את היחס:** ${approved.length} זוגות מאושרים פותחים ${wide.he.adds + wide.en.adds} מחרוזות על`);
  p(`${wide.he.cards + wide.en.cards} ערכים מתוך ${uHe.entries.length + uEn.entries.length}, ומהן **${solvedAll.length}** נוגעת במקרה אמיתי אחד`);
  p('מתוך 24. זו התמונה המלאה של יחס עלות-תועלת, ולא רק המספר החיובי.');
  p('');
  p(`<!-- morph-pairs-gate: ${JSON.stringify({
    pairs: pairs.length, approved: approved.length, rejected: rejected.length,
    hits: allHits.length, verifyFail: ver.fail, universeUnfaithful: reg.bad, universeUnfaithfulOwn: reg.own, universeUnfaithfulByKind: reg.byKind,
    solvedMorph: solvedMorph.map(c => c.n), ceilingMorph: ceilMorph.map(c => c.n),
    solvedAll: solvedAll.map(c => c.n),
    unreachable: cases.filter(c => MORPH.includes(c.n) && !c.reachable).map(c => c.n),
    identityBlocked: cases.filter(c => MORPH.includes(c.n) && c.identity.length).map(c => c.n),
    todayAlready: todayCases.map(c => c.n),
    breadth: { he: { cards: wide.he.cards, adds: wide.he.adds }, en: { cards: wide.en.cards, adds: wide.en.adds } },
    ruleVsList: rvl,
    narrowOnly: narrowOnly.map(x => x.g.words.join('~')),
    classE: inter.error ? { error: inter.error } : {
      groups: inter.synGroups, overlap: inter.overlap.length, synAlone: inter.synAlone,
      pairsAlone: inter.pairsAlone, together: inter.together, extra: inter.extra.length,
    },
    universe: { he: uHe.src, en: uEn.src },
  })} -->`);
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n', 'utf8');

  const say = s => process.stdout.write(s + '\n');
  say(`זוגות: ${pairs.length} · עברו: ${approved.length} · נדחו: ${rejected.length}`);
  say(`התנגשויות חדשות: ${allHits.length} (מהן באותה יחידה: ${results.reduce((a, r) => a + r.severe, 0)}) · אימות נכשל: ${ver.fail}`);
  say(`אמינות היקום: ${reg.checked} נבדקו · ${reg.bad} אינן מתקבלות בפועל`);
  say('');
  say('דחיות:');
  for (const g of rejected) {
    const r = byId.get(g.id);
    say(`  ${String(g.id).padStart(3)} [${g.words.join(' ↔ ')}] · ${r.hits.length} התנגשויות`);
    if (r.hits[0]) say(`      ${describe(r.hits[0])}`);
  }
  say('');
  say(`ארבעת המקרים הפתוחים · נפתרו: ${solvedMorph.map(c => c.n).join(', ') || 'אף אחד'} (תקרה ללא שער: ${ceilMorph.map(c => c.n).join(', ') || 'אף אחד'})`);
  for (const c of cases.filter(x => MORPH.includes(x.n))) {
    say(`  ${String(c.n).padStart(2)} ${c.solved ? 'כן ' : 'לא '} ${c.term} · "${c.typed}" · ${c.why}` +
      `${c.matchedSeg ? ` -> "${c.matchedSeg}"` : ''}${c.identity.length ? ` [${c.identity.join(' , ')}]` : ''}`);
  }
  say(`מתקבלים כבר היום: ${todayCases.map(c => c.n).join(', ')} (${todayCases.length} מתוך 24)`);
  say(`רוחב · קבלות חדשות על כל המאגר: he ${wide.he.adds} על ${wide.he.cards} ערכים · en ${wide.en.adds} על ${wide.en.cards} ערכים`);
  say('');
  say(`היקום הצר היה מאשר ${narrowOnly.length} זוגות שהמלא דוחה: ${narrowOnly.map(x => x.g.words.join('↔')).join(' · ') || '-'}`);
  if (!inter.error) say(`מחלקה E · ${inter.synGroups} קבוצות · לבדן ביקום המלא ${inter.synAlone} התנגשויות · צירוף מוסיף ${inter.extra.length} · חפיפת מילים ${inter.overlap.length}`);
  say('');
  say(`נכתב: ${OUT_MD}`);
  say(`עודכן: ${LEX_PATH}`);
  if (ver.fail || reg.own) { say('⛔ אימות ההתנגשויות או אמינות היקום נכשלו'); process.exit(1); }
}

if (require.main === module) main();

module.exports = {
  universe, newCollisions, runGate, measureCases, verifyHits,
  disjointness, describe, loadLexicon, breadth, ruleVsList, classEInteraction, universeFaithful,
  LEX_PATH, OUT_MD,
};
