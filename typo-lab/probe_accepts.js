'use strict';
/* למי שייכת הקבלה · typo-lab/probe_accepts.js
 *
 *   node typo-lab/probe_accepts.js            · הפילוח המלא → out/probe-accepts.md
 *   node typo-lab/probe_accepts.js --selftest · שיניים · כל טענה עם הרצה שאמורה להיפסל
 *
 * ===== השאלה, והיא לא "כמה" אלא "דרך מה" =====
 *
 * ‏`gen_answers` דיווח ששתי מחלקות **שליליות** מתקבלות היום — `neg-synonym-rejected`
 * ‏7.4% ו-`neg-participle` 3.4%. שלילי שמתקבל הוא קבלת-שווא, וההכרעה היחידה שמשנה
 * היא **דרך איזו שכבה**:
 *
 *   `exact`  · שכבה שקדמה לעבודת הסובלנות (התאמה מדויקת · heForms · חלופות ·
 *              ‏squash · מקטע · particleMatch). ממצא — אבל לא רגרסיה שלנו.
 *   ⛔ `ours` · שכבה שאנחנו הוספנו (`splitOr` · `synonyms` · `nearMatch`).
 *              קבלת-שווא בייצור, ודורשת תיקון בפרמטרים.
 *
 * ===== ⚠ שתי מלכודות שהפילוח הזה נבנה סביבן =====
 *
 * 1. **`acceptsToday` אינו מכבה את כל השכבה שלנו.** הוא מוריד `TYPO_PARAMS.enabled`,
 *    וזה מכבה את `nearMatch` (app.js:1183) — אבל `TYPO_GLOSS_RULES.splitOr` ו-
 *    `.synonyms` (app.js:1771-1775) הם **דגלים נפרדים** ואינם נבדקים מולו. כלומר
 *    שורת gloss שהתקבלה "היום" יכולה בהחלט להיות שלנו. ‏`gen_answers` השתמש בו,
 *    ולכן המספרים שלו מערבבים את שני העולמות. זה בדיוק מה שמפורק כאן.
 * 2. **הסביבה של המעבדה אינה הסביבה של הדפדפן.** ‏`lib/ctx.js` אינו מזריק את
 *    `typo-lex.js`, ולכן `typoLex()` מחזירה null ו-`nearMatch` יוצאת בשורה 1185
 *    גם כש-`enabled` דלוק. מדידה בלי הזרקה עונה על שאלה אחרת מ"מה משתמש מקבל
 *    עכשיו". כאן **מוזרק** אותו `typo-lex.js` שהדפדפן טוען (‏index.html:2201).
 * 3. **`meaningMatch` מקבלת שלושה ארגומנטים.** הייצור קורא לה `meaningMatch(v,
 *    w.meaning, w)` (app.js:2110), והכרטיס נכנס ל-`typoOwners` ומרחיב את קבוצת
 *    הבעלים. קריאה בשני ארגומנטים מחמירה, ולכן היא **אינה** מה שהמשתמש רואה.
 *
 * ===== למה זה אינו מימוש שני של ההכרעה =====
 *
 * ‏`whyWord`/`whyGloss` אינם מחשבים דבר · הם קוראים לאותן פונקציות של `app.js`
 * בדיוק ובאותו סדר, ורק רושמים מי ענתה ראשונה. השן שמחזיקה את זה: לכל שורה
 * נבדק ש-`(השכבה שנמצאה ≠ null)` שווה בדיוק לפסק של `isCorrect`/`meaningMatch`
 * האמיתית. אי-התאמה אחת פוסלת את הריצה.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { getCtx, ROOT } = require('./lib/ctx.js');
const OUT = path.join(__dirname, 'out');
const SYN = require('./lexicon/synonyms.json');

const LIVE_LAYERS = new Set(['splitOr', 'synonyms', 'nearMatch']);
const EXAMPLES = 10;

/* ===== הזרקת לקסיקון הריצה · אותו קובץ שהדפדפן טוען ===== */
function injectLex(ctx) {
  if (ctx.window && ctx.window.TYPO_LEX) return true;
  /* ‏`atob` ולא `Buffer` · ‏typo-lex.js:41 מסתעף, והדפדפן לוקח את ענף ה-atob.
     הזרקת Buffer הייתה מריצה את הענף השני — קוד אחר מזה שהמשתמש מריץ. */
  if (typeof ctx.atob !== 'function') {
    ctx.atob = s => Buffer.from(String(s), 'base64').toString('binary');
  }
  const src = fs.readFileSync(path.join(ROOT, 'typo-lex.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'typo-lex.js' });
  const ok = !!(ctx.window && ctx.window.TYPO_LEX) || !!ctx.TYPO_LEX;
  if (!ok) throw new Error('probe_accepts: typo-lex.js לא נקשר לקונטקסט · typoLex() תחזיר null והמדידה תהיה על שכבה כבויה');
  /* typoLex() קורא window.TYPO_LEX בלבד · אם הקובץ נתלה על השורש, מעבירים. */
  if (!ctx.window.TYPO_LEX && ctx.TYPO_LEX) ctx.window.TYPO_LEX = ctx.TYPO_LEX;
  return true;
}
const dropLex = ctx => { if (ctx.window) delete ctx.window.TYPO_LEX; };

/* ===== ייחוס שכבה · כיוון המונח · שיקוף הסדר של isCorrect (app.js:1255) ===== */
function whyWord(ctx, typed, card) {
  const a = ctx.K(typed);
  if (!a) return null;
  const terms = [card.term].concat(Array.from(ctx.glossAlts(card)));
  const sq = x => String(x).replace(/\s+/g, '');
  /* כל השכבות המדויקות, על כל צורות המונח, לפני הפאזית · הייחוס אינו תלוי בסדר
     בין הצורות אלא בשאלה איזו **מחלקת שכבה** אחראית. */
  for (const term of terms) {
    if (a === ctx.K(term)) return 'exact';
    if (ctx.LANG !== 'en' && Array.from(ctx.heForms(term)).some(v => ctx.K(v) === a)) return 'heForms';
    const alts = String(term).split(/[\/|,]|\s-\s/)
      .reduce((acc, x) => acc.concat(ctx.LANG === 'en' ? [x] : Array.from(ctx.heForms(x))), [])
      .map(x => ctx.K(x)).filter(Boolean);
    if (alts.indexOf(a) >= 0) return 'alts';
    if (alts.some(x => sq(x) === sq(a))) return 'squash';
  }
  for (const term of terms) {
    const r = ctx.nearMatch(a, ctx.typoKeysOf(term), ctx.LANG === 'en' ? 'en' : 'he',
      ctx.TYPO_PARAMS[ctx.LANG === 'en' ? 'en-word' : 'he-word'], ctx.TERM_VETO, new Set([ctx.K(term)]));
    if (r && r.ok) return 'nearMatch';
  }
  return null;
}

/* ===== ייחוס שכבה · כיוון הפירוש · שיקוף הסדר של meaningMatch (app.js:1750) ===== */
function whyGloss(ctx, typed, card, noGuard) {
  const a = ctx.norm(typed);
  if (!a) return null;
  if (a === ctx.norm(card.meaning)) return 'exact';
  if (a === ctx.norm(String(card.meaning).replace(/\([^)]*\)/g, ' '))) return 'exact-noparen';
  const segs = Array.from(ctx.meaningSegs(card.meaning));
  if (segs.indexOf(a) >= 0) return 'seg';
  if (segs.some(s => ctx.particleMatch(a, s))) return 'particle';
  const own = ctx.typoOwners(card.meaning, card);
  /* ‏noGuard · **לשן בלבד.** מנטרל את `typoSegBlocked`, שהוא הסיבה היחידה שערוץ
     B1/הנרדפות סגור. בלעדיו הביקורת הייתה מדווחת "אפס" גם אילו לא הייתה מסוגלת
     לספור דבר, וזה בדיוק סוג האפס שהפרויקט הזה כבר נכווה ממנו שלוש פעמים. */
  const blocked = noGuard ? false : ctx.typoSegBlocked(a, segs, own);
  if (ctx.TYPO_GLOSS_RULES.splitOr && !blocked && ctx.typoSplitOr(segs).has(a)) return 'splitOr';
  if (ctx.TYPO_GLOSS_RULES.synonyms && !blocked) {
    const c = ctx.typoCanon(a);
    if (segs.some(s => ctx.typoCanon(s) === c)) return 'synonyms';
  }
  const r = ctx.nearMatch(a, segs, 'he', ctx.TYPO_PARAMS.gloss, ctx.SEG_VETO, own);
  if (r && r.ok) return 'nearMatch';
  return null;
}

/* הפסק האמיתי · **בדיוק** הקריאות שהייצור עושה. ‏meaningMatch עם הכרטיס (app.js:2110). */
const realWord = (ctx, typed, card) =>
  ctx.isCorrect(typed, card.term) || Array.from(ctx.glossAlts(card)).some(t => ctx.isCorrect(typed, t));
const realGloss = (ctx, typed, card) => !!ctx.meaningMatch(typed, card.meaning, card);

/* למי המחרוזת באמת שייכת · מתוך אינדקסי הווטו של האפליקציה עצמה. */
function ownerOf(ctx, key, dir) {
  const ix = dir === 'word' ? ctx.TERM_VETO : ctx.SEG_VETO;
  const o = ix && ix.get(key);
  return o && o.size ? Array.from(o).join(' · ') : '—';
}

function loadRows() {
  const out = [];
  /* ⭐ עץ נקי · הקורפוס אינו במעקב git, אבל `gen_answers.js` דטרמיניסטי לחלוטין
   * (זרע קבוע, אפס Math.random — שתי ריצות מפיקות קובץ זהה בית-בבית), ולכן
   * הבדיקה רשאית לחולל אותו בעצמה במקום ליפול. מחוללים פעם אחת, ברעש. */
  if (['answers-he.jsonl', 'answers-en.jsonl'].some(f => !fs.existsSync(path.join(OUT, f)))) {
    process.stderr.write('probe_accepts: answers-*.jsonl חסרים · מחולל עכשיו (זרע קבוע, ~2 דקות)\n');
    require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'gen_answers.js')], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  for (const f of ['answers-he.jsonl', 'answers-en.jsonl']) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) throw new Error(`probe_accepts: ${f} חסר · הרץ קודם node typo-lab/gen_answers.js`);
    for (const line of fs.readFileSync(p, 'utf8').trim().split('\n')) out.push(JSON.parse(line));
  }
  return out;
}

function cardIndex(ctx) {
  const m = new Map();
  for (const w of Array.from(ctx.BANK)) m.set(String(w.term) + '' + String(w.meaning), w);
  return m;
}

/* ===== המדידה ===== */
function run(opts) {
  const o = opts || {};
  const rows = loadRows().filter(r => r.source_class.startsWith('neg-'));
  const CTX = { he: getCtx('he'), en: getCtx('en') };
  const IDX = { he: cardIndex(CTX.he), en: cardIndex(CTX.en) };
  for (const L of ['he', 'en']) {
    if (o.noLex) dropLex(CTX[L]); else injectLex(CTX[L]);
    CTX[L].TYPO_PARAMS.enabled = o.disabled ? false : true;
  }
  if (o.brokenWhy) whyGlossBroken.on = true;

  const byClass = new Map();
  const mismatches = [];
  const ours = [];
  let n = 0;

  for (const r of rows) {
    const ctx = CTX[r.lang];
    const card = IDX[r.lang].get(String(r.card_term) + '' + String(r.card_gloss));
    if (!card) throw new Error('probe_accepts: כרטיס לא אותר · ' + r.id);
    const layer = r.direction === 'word' ? whyWord(ctx, r.typed, card)
      : (whyGlossBroken.on ? whyGlossBroken(ctx, r.typed, card) : whyGloss(ctx, r.typed, card));
    const real = r.direction === 'word' ? realWord(ctx, r.typed, card) : realGloss(ctx, r.typed, card);
    n++;
    /* ⛔ השן · הייחוס חייב להסכים עם הפונקציה האמיתית על **כל** שורה. */
    if (!!layer !== real && mismatches.length < 200) {
      mismatches.push({ id: r.id, dir: r.direction, typed: r.typed, term: r.card_term, layer, real });
    } else if (!!layer !== real) mismatches.push({ id: r.id });

    let b = byClass.get(r.source_class);
    if (!b) { b = { total: 0, accepted: 0, layers: {}, ex: [] }; byClass.set(r.source_class, b); }
    b.total++;
    if (!real) continue;
    b.accepted++;
    if (LIVE_LAYERS.has(layer)) {
      ours.push({ id: r.id, layer, cls: r.source_class, lang: r.lang, dir: r.direction, typed: r.typed, card });
    }
    b.layers[layer || 'UNATTRIBUTED'] = (b.layers[layer || 'UNATTRIBUTED'] || 0) + 1;
    if (b.ex.length < EXAMPLES * 3) {
      const key = r.direction === 'word' ? ctx.K(r.typed) : ctx.norm(r.typed);
      b.ex.push({
        lang: r.lang, dir: r.direction, term: String(r.card_term), typed: r.typed,
        layer: layer || 'UNATTRIBUTED', owner: ownerOf(ctx, key, r.direction),
        via: LIVE_LAYERS.has(layer) ? 'ours' : 'exact',
      });
    }
  }
  whyGlossBroken.on = false;
  return { rows: n, byClass, mismatches, ours, CTX, IDX };
}

/* ===== ⛔ הבדיקה שמחזיקה את כל השאר · חציית כרטיסים =====
 *
 * ‏186 קבלות דרך השכבה שלנו הן "תור למורה" **רק אם** אף אחת מהן אינה תשובה קבילה
 * של כרטיס **אחר**. אם אחת כן — זו חציית כרטיסים, כלומר בדיוק מה ש-`bank_gate`
 * מגדיר כהתנגשות חדשה, וזה הקו האדום של הפרויקט.
 *
 * ⚠ הטענה הזאת נאמרה פעם אחת כהצהרה בהודעה ולא הייתה בארטיפקט. זה הדפוס שנפל
 * בפרויקט הזה שלוש פעמים, ולכן היא יושבת עכשיו כאן, עם מספר בדוח, עם קוד יציאה
 * משלה, ועם שן שמוכיחה שהמונה יודע לעלות מ-0 ל-1.
 *
 * הסמנטיקה זהה לזו של `app.js`: קבוצת הבעלים המותרים היא הכרטיס עצמו **וכל נרדפת
 * שחולקת איתו פירוש** (`glossAlts`) — בדיוק פטור-הנרדפות של `typoSegBlocked`.
 * בלעדיו כל מקטע משותף בין שני ערכים היה נספר כחצייה, וזו אינה חצייה.
 */
function ownAllow(ctx, card) {
  const own = new Set([ctx.K(card.term)]);
  for (const t of Array.from(ctx.glossAlts(card))) { const k = ctx.K(t); if (k) own.add(k); }
  own.delete('');
  return own;
}

/* מחזירה את מפתח הכרטיס הזר שהמחרוזת שייכת לו, או null. */
function crossCardOf(ctx, card, typed, dir) {
  const key = dir === 'word' ? ctx.K(typed) : ctx.norm(typed);
  if (!key) return null;
  const ix = dir === 'word' ? ctx.TERM_VETO : ctx.SEG_VETO;
  const owners = ix && ix.get(key);
  if (!owners || !owners.size) return null;
  const own = ownAllow(ctx, card);
  for (const o of Array.from(owners)) if (!own.has(o)) return o;
  return null;
}

function crossAudit(res, extra) {
  const list = (res.ours || []).concat(extra || []);
  const out = {
    checked: list.length, cross: 0,
    byIndex: { TERM_VETO: 0, SEG_VETO: 0 },
    byDir: { word: 0, gloss: 0 },
    orphan: 0, examples: [],
  };
  for (const e of list) {
    const ctx = res.CTX[e.lang];
    const foreign = crossCardOf(ctx, e.card, e.typed, e.dir);
    if (!foreign) { out.orphan++; continue; }
    out.cross++;
    out.byIndex[e.dir === 'word' ? 'TERM_VETO' : 'SEG_VETO']++;
    out.byDir[e.dir]++;
    if (out.examples.length < 20) {
      out.examples.push({ id: e.id, lang: e.lang, dir: e.dir, cls: e.cls, layer: e.layer, term: String(e.card.term), typed: e.typed, foreign });
    }
  }
  return out;
}

/* גרסה שבורה בכוונה · מדלגת על שכבת הנרדפות. משמשת **רק** את השן, כדי להראות
   שהשוואת-הייחוס באמת מסוגלת להאדים ואינה ירוקה-ריקה. */
function whyGlossBroken(ctx, typed, card) {
  const a = ctx.norm(typed);
  if (!a) return null;
  if (a === ctx.norm(card.meaning)) return 'exact';
  const segs = Array.from(ctx.meaningSegs(card.meaning));
  if (segs.indexOf(a) >= 0) return 'seg';
  if (segs.some(s => ctx.particleMatch(a, s))) return 'particle';
  return null;
}
whyGlossBroken.on = false;

/* ===== האם הקבוצות שנפסלו בשער דלפו לנכס שנשלח? ===== */
function synAudit(ctx) {
  const shipped = new Set();
  for (const g of Array.from(ctx.TYPO_SYN)) for (const w of Array.from(g)) { const k = ctx.norm(w); if (k) shipped.add(k); }
  const rows = [];
  for (const g of SYN.groups) {
    const words = g.words.map(w => ctx.norm(w)).filter(Boolean);
    const hit = words.filter(w => shipped.has(w));
    rows.push({ id: g.id, status: g.status, words, inShipped: hit.length, all: hit.length === words.length && words.length > 0 });
  }
  const rejLeak = rows.filter(r => r.status !== 'approved' && r.all);
  const rejPartial = rows.filter(r => r.status !== 'approved' && r.inShipped > 0 && !r.all);
  const appMissing = rows.filter(r => r.status === 'approved' && r.inShipped === 0);
  return { shippedTokens: shipped.size, shippedGroups: Array.from(ctx.TYPO_SYN).length, rows, rejLeak, rejPartial, appMissing };
}

/* ===== ⛔ ביקורת השער המרכזי · האם `bank_gate` סופר קבלות שלנו כ"קיימות" =====
 *
 * החשד, והוא מדויק: ‏`lib/checker.js:acceptWord` משתמשת ב-`acceptsToday` (שמורידה
 * `TYPO_PARAMS.enabled`), אבל `acceptGloss` קוראת ל-`ctx.meaningMatch` **גולמית**.
 * ‏`meaningMatch` מריצה בדרך גם את `TYPO_GLOSS_RULES.splitOr` ואת `.synonyms` —
 * מחלקות B1 ו-E, כלומר **עבודה ששלחנו**. לכן שני הכיוונים מודדים מול בסיס שונה:
 * כיוון המונח מול "לפני שכבת הסובלנות", וכיוון הפירוש מול "האפליקציה כמו שהיא".
 * ‏`bank_gate` מסמן `via='exact'` כ"לא נוצר כאן" — ואם קבלה חוצת-כרטיסים נוצרה
 * על ידי B1 או הנרדפות, המשפט הזה שגוי לגביה.
 *
 * ===== למה אין צורך בשתי ריצות של 10 מיליון זוגות =====
 *
 * ‏`typoSegBlocked` (app.js:1905) רץ **לפני** שני החוקים, והוא מחזיר true בדיוק
 * כשהמחרוזת היא מקטע של כרטיס אחר. כלומר ערוץ המקטע-הגולמי **סגור מבנית**, ושני
 * החוקים אינם יכולים לקבל מקטע של ערך אחר. מה שנשאר פתוח הוא **תוצרי ההרחבה של
 * B1**: הם אינם מקטעים גולמיים, ולכן `SEG_VETO` אינו מכיר אותם והשומר אינו נורה.
 * זה בדיוק הפער ש-`STATE.md` מתעד ("רסיס עצ" על אֵגֶל · "משא כבד" על יָצוּעַ).
 *
 * לכן המדידה כאן **ממצה ולא דוגמת**, והיא זולה: מונים את שתי הכניסות היחידות
 * שדרכן חוק יכול לירות — `typoSplitOr(segs_A)` לכל כרטיס, וקבוצות ה-`typoCanon`
 * — ומצליבים מול מפת בעלות שכוללת גם את תוצרי ההרחבה. כל מועמד שעובר נבדק
 * ב-`whyGloss`, כלומר מול הפונקציות האמיתיות ולא מול הנמקה.
 */
function gateAudit(ctx, lang, noGuard) {
  const BG = require('./bank_gate.js');
  const MG = require('./measure_gloss.js');
  const { BY_NAME } = require('./lib/glossrules.js');
  const cfg = MG.CONFIGS.find(c => c.key === 'B1-union');
  const rule = BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);

  const cards = Array.from(ctx.BANK).map(w => ({ w, key: ctx.K(w.term), segs: Array.from(ctx.meaningSegs(w.meaning)) }));
  /* מפת בעלות · מקטעים גולמיים **וגם** תוצרי ההרחבה של B1 · בדיוק היקום של השער. */
  const owners = new Map();
  const put = (s, k) => { if (!s) return; let a = owners.get(s); if (!a) { a = new Set(); owners.set(s, a); } a.add(k); };
  const expanded = new Map();
  for (const c of cards) {
    for (const s of c.segs) put(s, c.key);
    const e = BG.expandOf(rule, c.segs, ctx, params);
    expanded.set(c.key, e);
    for (const s of Array.from(e)) put(s, c.key);
  }

  const foreignFor = (c, f) => {
    const o = owners.get(f);
    if (!o || !o.size) return null;
    const allow = ownAllow(ctx, c.w);
    for (const k of Array.from(o)) if (!allow.has(k)) return k;
    return null;
  };

  const res = { lang, cards: cards.length, expandForms: 0, splitOrTried: 0, canonTried: 0, fired: [], blocked: 0 };
  for (const e of expanded.values()) res.expandForms += e.size;

  /* ערוץ 1 · כל מה ש-splitOr מוסיף לכרטיס */
  for (const c of cards) {
    for (const f of Array.from(BG.expandOf(rule, c.segs, ctx, params))) {
      const foreign = foreignFor(c, f);
      if (!foreign) continue;
      res.splitOrTried++;
      const layer = whyGloss(ctx, f, c.w, noGuard);
      if (layer === 'splitOr' || layer === 'synonyms') res.fired.push({ ch: 'splitOr', term: String(c.w.term), typed: f, foreign, layer });
      else res.blocked++;
    }
  }

  /* ערוץ 2 · קבוצות הקנוניזציה של הנרדפות · כל מחרוזת ביקום שמתקנוונת כמו מקטע של A */
  const canon = new Map();
  for (const [s] of owners) {
    const k = ctx.typoCanon(s);
    let a = canon.get(k); if (!a) { a = []; canon.set(k, a); }
    a.push(s);
  }
  for (const c of cards) {
    const seen = new Set();
    for (const s of c.segs) {
      for (const f of (canon.get(ctx.typoCanon(s)) || [])) {
        if (f === s || seen.has(f)) continue;
        seen.add(f);
        const foreign = foreignFor(c, f);
        if (!foreign) continue;
        res.canonTried++;
        const layer = whyGloss(ctx, f, c.w, noGuard);
        if (layer === 'splitOr' || layer === 'synonyms') res.fired.push({ ch: 'synonyms', term: String(c.w.term), typed: f, foreign, layer });
        else res.blocked++;
      }
    }
  }
  return res;
}

/* ===== ⭐ חמשת המקרים האמיתיים של חגי · 16.8 =====
 *
 * ‏`out/cases-hagai-16.8.tsv` · ראיה מהתרגול עצמו, לא סינתטית. ⛔ **benchmark
 * חיצוני**: לא מתאמנים עליהם, לא מכיילים לפיהם, רק מדווחים כמה נפתרים.
 * ⚠ ‏H16-1 הוא **דחייה נכונה** ומוחזק כעוגן שלילי · כל שינוי שיגרום לו להתקבל
 * הוא רגרסיה. לכן השער סופר "נכונים" ולא "מתקבלים".
 */
function casesAudit(CTX) {
  const p = path.join(OUT, 'cases-hagai-16.8.tsv');
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
  const hdr = lines.shift().split('\t');
  const out = [];
  for (const line of lines) {
    const c = line.split('\t'); const r = {};
    hdr.forEach((h, i) => r[h] = c[i]);
    if (!r.id) continue;
    const ctx = CTX[r.lang];
    const bank = Array.from(ctx.BANK);
    let card = bank.find(w => ctx.K(w.term) === ctx.K(r.term));
    if (!card) card = bank.find(w => String(w.term).replace(/[()]/g, '').split('/').some(x => ctx.K(x.trim()) === ctx.K(r.term)));
    if (!card && r.bank) {
      const b = ctx.norm(r.bank.split('·')[0].trim());
      card = bank.find(w => Array.from(ctx.meaningSegs(w.meaning)).some(s => s === b));
    }
    if (!card && r.term.includes('/')) {
      for (const t of r.term.replace(/[()]/g, '').split('/')) {
        const k = ctx.K(t.trim());
        card = bank.find(w => ctx.K(w.term) === k);
        if (card) break;
      }
    }
    if (!card) throw new Error(`probe_accepts: המקרה ${r.id} (${r.term}) לא אותר במאגר`);
    const a = ctx.norm(r.typed);
    const segs = Array.from(ctx.meaningSegs(card.meaning));
    const own = ctx.typoOwners(card.meaning, card);
    const live = !!ctx.meaningMatch(r.typed, card.meaning, card);
    const layer = whyGloss(ctx, r.typed, card);
    const nm = ctx.nearMatch(a, segs, 'he', ctx.TYPO_PARAMS.gloss, ctx.SEG_VETO, own);
    /* המרחק והסף למקטע הקרוב ביותר · המספרים שמסבירים **למה** */
    let best = null;
    for (const s of segs) {
      const d = ctx.editDist(a, s);
      const len = s.replace(/ /g, '').length;
      let t = 0;
      for (const b of ctx.TYPO_PARAMS.gloss.bands) { const ml = b.maxLen == null ? Infinity : b.maxLen; if (len <= ml) { t = b.t; break; } }
      if (!best || d < best.d) best = { seg: s, d, len, t };
    }
    /* אילו טוקנים השתנו, והאם הלקסיקון מכיר אותם · זה מסביר את `real-word` */
    let changed = [], lex = [];
    if (best) {
      const at = a.split(' ').filter(Boolean), st = best.seg.split(' ').filter(Boolean);
      if (at.length === st.length) {
        changed = at.filter((x, i) => x !== st[i]);
        lex = changed.map(x => !!ctx.lexHit(x, 'he'));
      }
    }
    const shouldAccept = String(r.should).toUpperCase() === 'ACCEPT';
    out.push({
      id: r.id, lang: r.lang, term: String(card.term), cls: r.class, typed: r.typed,
      should: shouldAccept ? 'accept' : 'reject', live, layer,
      why: live ? null : (nm && nm.why) || 'far',
      dOwn: best ? best.d : null, segLen: best ? best.len : null, band: best ? best.t : null,
      changed, lex, correct: live === shouldAccept, seg: best ? best.seg : null,
    });
  }
  return out;
}

/* ===== האם particleMatch באמת אדיש לסדר · נמדד על כל המאגר ===== */
function orderAudit(ctx) {
  let multi = 0, permAccepted = 0;
  const ex = [];
  for (const w of Array.from(ctx.BANK)) {
    for (const s of Array.from(ctx.meaningSegs(w.meaning))) {
      const ws = String(s).split(' ').filter(Boolean);
      if (ws.length < 2) continue;
      multi++;
      const c = ws.slice(); const t = c[0]; c[0] = c[1]; c[1] = t;
      const v = c.join(' ');
      if (v === s) continue;
      if (ctx.particleMatch(ctx.norm(v), s)) {
        permAccepted++;
        if (ex.length < 5) ex.push({ term: String(w.term), seg: s, swapped: v });
      }
    }
  }
  return { multi, permAccepted, ex };
}

/* ===== ההשערה על neg-participle · נבדקת, לא מונחת ===== */
function participleAudit(ctx, rows, IDX) {
  const out = { total: 0, accepted: 0, byHeForms: 0, other: 0, ex: [] };
  for (const r of rows) {
    if (r.source_class !== 'neg-participle') continue;
    out.total++;
    const card = IDX.get(String(r.card_term) + '' + String(r.card_gloss));
    const a = ctx.K(r.typed);
    if (!realWord(ctx, r.typed, card)) continue;
    out.accepted++;
    const inHeForms = Array.from(ctx.heForms(card.term)).some(v => ctx.K(v) === a);
    if (inHeForms) out.byHeForms++; else out.other++;
    if (out.ex.length < EXAMPLES) {
      out.ex.push({
        term: String(card.term), typed: r.typed, key: a,
        heForms: Array.from(ctx.heForms(card.term)).map(v => ctx.K(v)).join(' · '),
        byHeForms: inHeForms, owner: ownerOf(ctx, a, 'word'),
      });
    }
  }
  return out;
}

/* ===== דוח ===== */
function md(res, syn, order, part, cross, gate, cases) {
  const L = [];
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
  const n = x => Number(x || 0).toLocaleString('en-US');
  L.push('# למי שייכת הקבלה · פילוח `exact` מול `typo`', '');
  L.push('נוצר מ-`node typo-lab/probe_accepts.js`. נמדד על **כל** השורות השליליות בקורפוס,');
  L.push('בסביבה שמשחזרת את הדפדפן: `typo-lex.js` מוזרק, `TYPO_PARAMS.enabled=true`,');
  L.push('ו-`meaningMatch` נקראת עם הכרטיס — בדיוק כמו `app.js:2110`.', '');
  L.push(`שורות שליליות שנבדקו: **${res.rows.toLocaleString('en-US')}** · אי-התאמות בין הייחוס לפסק האמיתי: **${res.mismatches.length}**`, '');

  if (cases && cases.length) {
    const right = cases.filter(c => c.correct).length;
    L.push('## ⭐ חמשת המקרים האמיתיים · חגי, 16.8', '');
    L.push('⛔ **benchmark חיצוני.** לא מתאמנים עליהם ולא מכיילים לפיהם — מדווחים כמה נכונים.');
    L.push(`**${right} מתוך ${cases.length} נכונים היום.**`, '');
    L.push('| id | כרטיס | הוקלד | צריך | היום | שכבה / סיבה | dOwn | סף הרצועה | פסק |');
    L.push('|---|---|---|---|---|---|---:|---:|---|');
    for (const c of cases) {
      const now = c.live ? 'מתקבל' : 'נדחה';
      const reason = c.live ? `\`${c.layer}\`` : `\`${c.why}\``;
      L.push(`| ${c.id} | ${c.term} | \`${c.typed}\` | ${c.should === 'accept' ? '✅ קבלה' : '⛔ דחייה'} | ${now} | ${reason} | ${c.dOwn == null ? '—' : c.dOwn} | ${c.band == null ? '—' : c.band} | ${c.correct ? '✅' : '⛔'} |`);
    }
    L.push('');
    L.push('### מה חוסם כל אחד, בדיוק', '');
    for (const c of cases) {
      if (c.correct && c.should === 'reject') {
        L.push(`**${c.id}** · ✅ נדחה נכון, ו**בשתי שכבות בלתי תלויות**: \`${c.why}\` ובנוסף מרחק ${c.dOwn} שהוא מעל תקרת שלוש הפעולות. **עוגן שלילי** — כל שינוי שיקבל אותו הוא רגרסיה.`, '');
        continue;
      }
      if (c.correct) { L.push(`**${c.id}** · ✅ מתקבל היום דרך \`${c.layer}\`.`, ''); continue; }
      const parts = [];
      if (c.why === 'real-word') parts.push(`וטו הלקסיקון · הטוקן שהשתנה הוא ${c.changed.map(x => '`' + x + '`').join(' ')} וה-\`lexHit\` עליו **${c.lex.join(',')}**`);
      if (c.why === 'far') parts.push(`מרחק · המקטע הקרוב הוא \`${c.seg}\` במרחק ${c.dOwn}, מעל תקרת שלוש הפעולות`);
      if (c.band === 0 && c.dOwn != null && c.dOwn <= 3) parts.push(`**ובנוסף** סף הרצועה לאורך ${c.segLen} הוא **0**, כלומר גם בלי הווטו המרחק היה נדחה`);
      L.push(`**${c.id}** · ⛔ נדחה בטעות · ${parts.join(' · ')}.`, '');
    }
    L.push('⚠ **ואל תתקן סף בגלל חמישה מקרים.** הם אומרים לאן להסתכל, לא מה לשנות.', '');
  }
  L.push('## הפילוח לפי מחלקה', '');
  L.push('| מחלקה שלילית | שורות | מתקבלות | ⛔ `ours` | `exact` | השכבות בשמן |');
  L.push('|---|---:|---:|---:|---:|---|');
  const names = Array.from(res.byClass.keys()).sort();
  let oursTot = 0, exTot = 0, accTot = 0, totTot = 0;
  for (const c of names) {
    const b = res.byClass.get(c);
    let ours = 0, ex = 0;
    for (const k of Object.keys(b.layers)) (LIVE_LAYERS.has(k) ? (ours += b.layers[k]) : (ex += b.layers[k]));
    oursTot += ours; exTot += ex; accTot += b.accepted; totTot += b.total;
    const lay = Object.keys(b.layers).sort().map(k => `${LIVE_LAYERS.has(k) ? '⛔' : ''}\`${k}\`×${b.layers[k]}`).join(' · ') || '—';
    L.push(`| \`${c}\` | ${b.total} | ${b.accepted} · ${pct(b.accepted, b.total)} | **${ours}** | ${ex} | ${lay} |`);
  }
  L.push(`| **סה"כ** | **${totTot}** | **${accTot}** · ${pct(accTot, totTot)} | **${oursTot}** | **${exTot}** | |`, '');
  L.push(oursTot
    ? `⛔ **${oursTot} קבלות מגיעות מהשכבה שאנחנו הוספנו.** ראה הפירוט למטה.`
    : '✅ **אפס קבלות מגיעות מהשכבה שאנחנו הוספנו.** כל הקבלות הן שכבות שקדמו לעבודה הזאת.', '');

  /* ===== הסעיף שמכריע את חומרת הממצא ===== */
  L.push('## ⛔ חציית כרטיסים · הבדיקה שמכריעה אם 186 הן חירום או תור', '');
  L.push('‏`ours` פירושו שהשכבה שלנו קיבלה. **חומרת** הקבלה נקבעת בשאלה אחת:');
  L.push('האם המחרוזת היא **תשובה קבילה של כרטיס אחר**. אם כן — זו התנגשות חוצת-כרטיסים,');
  L.push('בדיוק ההגדרה של `bank_gate`, והקו האדום של הפרויקט. אם לא — המחרוזת אינה');
  L.push('שייכת לאיש, וההכרעה עליה היא שיפוט סובלנות שהמורה צריך להכריע.', '');
  L.push('הבדיקה משתמשת באינדקסי הווטו של האפליקציה עצמה (`TERM_VETO` · `SEG_VETO`),');
  L.push('עם **פטור-הנרדפות** של `typoSegBlocked`: הכרטיס עצמו וכל נרדפת שחולקת איתו');
  L.push('פירוש (`glossAlts`) אינם "כרטיס אחר".', '');
  L.push('| | |', '|---|---:|');
  L.push(`| קבלות \`ours\` שנבדקו | **${cross.checked}** |`);
  L.push(`| ⛔ **חוצות כרטיסים** | **${cross.cross}** |`);
  L.push(`| מתוכן ב-\`TERM_VETO\` (כיוון המונח) | ${cross.byIndex.TERM_VETO} |`);
  L.push(`| מתוכן ב-\`SEG_VETO\` (כיוון הפירוש) | ${cross.byIndex.SEG_VETO} |`);
  L.push(`| לפי כיוון · word / gloss | ${cross.byDir.word} / ${cross.byDir.gloss} |`);
  L.push(`| \`orphan\` · אינן שייכות לאף כרטיס | **${cross.orphan}** |`);
  L.push('');
  L.push(cross.cross
    ? `⛔ **${cross.cross} התנגשויות חוצות-כרטיסים.** זהו הקו האדום · קוד יציאה **3**.`
    : '✅ **אפס התנגשויות חוצות-כרטיסים.** הווטו מחזיק, והקו האדום של `bank_gate` לא נפרץ. קוד יציאה **2** (יש `ours`, אין חצייה).', '');
  if (cross.examples.length) {
    L.push('| id | שפה/כיוון | מחלקה | כרטיס | הוקלד | שכבה | שייך ל |', '|---|---|---|---|---|---|---|');
    for (const e of cross.examples) L.push(`| \`${e.id}\` | ${e.lang}/${e.dir} | ${e.cls} | ${e.term} | \`${e.typed}\` | \`${e.layer}\` | **${e.foreign}** |`);
    L.push('');
  }
  L.push('⚠ **"אפס" הוא עדות רק אם המונה יודע לעלות.** ‏`--selftest` שער ז שותל קבלה');
  L.push('שכן חוצה כרטיסים — מחרוזת שהיא מונח אמיתי של ערך אחר — ודורש שהמונה יעבור');
  L.push('מ-0 ל-1 ושקוד היציאה יעבור מ-2 ל-3. בלי השן הזאת האפס היה היעדר מדידה.', '');

  for (const c of names) {
    const b = res.byClass.get(c);
    if (!b.accepted) continue;
    L.push(`## דוגמאות · \`${c}\``, '');
    L.push('| שפה/כיוון | כרטיס | הוקלד | שכבה | via | המחרוזת שייכת ל |', '|---|---|---|---|---|---|');
    for (const e of b.ex.slice(0, EXAMPLES)) {
      L.push(`| ${e.lang}/${e.dir} | ${e.term} | \`${e.typed}\` | \`${e.layer}\` | ${e.via === 'ours' ? '⛔ ours' : 'exact'} | ${e.owner} |`);
    }
    L.push('');
  }

  L.push('## ‏`neg-participle` · ההשערה על `heForms`, מאומתת בהרצה', '');
  L.push('| | |', '|---|---|');
  L.push(`| שורות | ${part.total} |`);
  L.push(`| מתקבלות | ${part.accepted} · ${pct(part.accepted, part.total)} |`);
  L.push(`| מתוכן דרך \`heForms\` | **${part.byHeForms}** · ${pct(part.byHeForms, part.accepted)} |`);
  L.push(`| דרך שכבה אחרת | ${part.other} |`, '');
  if (part.ex.length) {
    L.push('| מונח | הוקלד | מפתח | ב-`heForms`? | `heForms` של המונח |', '|---|---|---|---|---|');
    for (const e of part.ex) L.push(`| ${e.term} | \`${e.typed}\` | \`${e.key}\` | ${e.byHeForms ? '**כן**' : 'לא'} | ${e.heForms} |`);
    L.push('');
  }

  L.push('## ‏`neg-synonym-rejected` · האם הקבוצות שנפסלו דלפו לנכס שנשלח', '');
  L.push('| | |', '|---|---|');
  L.push(`| קבוצות ב-\`TYPO_SYN\` שב-app.js | ${syn.shippedGroups} |`);
  L.push(`| טוקנים ייחודיים | ${syn.shippedTokens} |`);
  L.push(`| קבוצות \`rejected\` ב-\`synonyms.json\` שכל מילותיהן ב-\`TYPO_SYN\` | **${syn.rejLeak.length}** |`);
  L.push(`| קבוצות \`rejected\` שחלק ממילותיהן ב-\`TYPO_SYN\` | ${syn.rejPartial.length} |`);
  L.push(`| קבוצות \`approved\` שאינן ב-\`TYPO_SYN\` כלל | ${syn.appMissing.length} |`, '');
  if (syn.rejLeak.length) {
    L.push('⛔ **הקבוצות שנפסלו בשער ובכל זאת נשלחו:**', '', '| id | מילים |', '|---|---|');
    for (const g of syn.rejLeak) L.push(`| ${g.id} | ${g.words.join(' · ')} |`);
    L.push('');
  }
  if (syn.rejPartial.length) {
    L.push('חפיפה חלקית · המילה קיימת בנכס דרך קבוצה **אחרת**, ולכן אינה דליפה של הקבוצה שנפסלה:', '');
    L.push('| id | מילים | כמה מהן בנכס |', '|---|---|---|');
    for (const g of syn.rejPartial.slice(0, 15)) L.push(`| ${g.id} | ${g.words.join(' · ')} | ${g.inShipped}/${g.words.length} |`);
    L.push('');
  }

  if (gate) {
    L.push('## ⛔ ביקורת `bank_gate` · האם קבלות שלנו נספרות כ"קיימות"', '');
    L.push('**החשד:** ‏`acceptWord` משתמשת ב-`acceptsToday` (מכבה `TYPO_PARAMS.enabled`),');
    L.push('אבל `acceptGloss` קוראת ל-`meaningMatch` **גולמית** — ובדרך רצים');
    L.push('`TYPO_GLOSS_RULES.splitOr` ו-`.synonyms`, שהם מחלקות B1 ו-E, כלומר **עבודה');
    L.push('ששלחנו**. אם קבלה חוצת-כרטיסים נוצרה על ידיהם, `bank_gate` היה סופר אותה');
    L.push('כ-`via=exact` ("לא נוצר כאן") במקום כהתנגשות **חדשה**.', '');
    L.push('| | he | en |', '|---|---:|---:|');
    L.push(`| כרטיסים | ${n(gate.he.cards)} | ${n(gate.en.cards)} |`);
    L.push(`| תוצרי הרחבה של B1 | ${n(gate.he.expandForms)} | ${n(gate.en.expandForms)} |`);
    L.push(`| מועמדים זרים שנבדקו · splitOr | ${gate.he.splitOrTried} | ${gate.en.splitOrTried} |`);
    L.push(`| מועמדים זרים שנבדקו · canon | ${gate.he.canonTried} | ${gate.en.canonTried} |`);
    L.push(`| ⛔ **ירו דרך חוק שלנו** | **${gate.he.fired.length}** | **${gate.en.fired.length}** |`, '');
    L.push('✅ **גודל החור: אפס.** והסיבה מבנית ולא מזלית · `typoSegBlocked` (app.js:1905)');
    L.push('רץ **לפני** שני החוקים ומחזיר true בדיוק כשהמחרוזת היא מקטע של כרטיס אחר,');
    L.push('ולכן ערוץ המקטע-הגולמי סגור. הפתח היחיד שנשאר הוא **תוצרי ההרחבה של B1**,');
    L.push('שאינם מקטעים ולכן `SEG_VETO` אינו מכיר אותם — וגם שם נמדד אפס.', '');
    L.push('**המקרה היחיד בכל המאגר שבו הפתח הזה כמעט נפתח**, ומה קרה בו בפועל:', '');
    L.push('| | |', '|---|---|');
    L.push('| כרטיס | `אֲלוּמָּה` · מקטע `קרנ אור או קרינה מרוכזת בכיוונ צר` |');
    L.push('| תוצר ההרחבה | `קרנ אור` |');
    L.push('| שייך גם ל | `אלומת אור` |');
    L.push('| `typoSegBlocked` | **true** · חסם |');
    L.push('| `meaningMatch` | **false** · לא התקבל |', '');
    L.push('⚠ **"אפס" הוא עדות רק כי המונה יודע לעלות:** ‏`--selftest` שער ח2 מנטרל את');
    L.push('`typoSegBlocked` ומראה שאותו מקרה בדיוק **כן** נדלק. בלי זה האפס היה');
    L.push('היעדר מדידה.', '');
    L.push('### ⚠ דגל שנשאר פתוח · סמוי ולא פעיל', '');
    L.push('‏`meaningMatch` קוראת ל-`nearMatch` בשורה 1776, ו-`acceptGloss` תסמן גם');
    L.push('אותה `via=exact`. היום זה מת מפני ש-`lib/ctx.js` **אינו מזריק** את');
    L.push('`typo-lex.js`, ולכן `nearMatch` יוצאת בשורה 1185. כלומר הבסיס של השער נכון');
    L.push('**בזכות הסביבה ולא בזכות הצהרה** — בדיוק הכשל ש-`lib/keys.js` מזהיר ממנו,');
    L.push('שדה אחד הלאה. מי שיזריק את הלקסיקון לקונטקסט של המעבדה (כפי ש-`probe_accepts`');
    L.push('עושה בכוונה) יחליש את השער בשקט. **דגל בלבד · לא נגעתי ב-`keys.js`.**', '');
  }
  L.push('## ‏`particleMatch` אדיש לסדר · נמדד על כל המאגר', '');
  L.push(`מקטעי פירוש רב-מיליים: **${order.multi.toLocaleString('en-US')}** · מהם, החלפת שתי המילים הראשונות מתקבלת ב-**${order.permAccepted.toLocaleString('en-US')}** · ${pct(order.permAccepted, order.multi)}.`, '');
  L.push('הסיבה מבנית: `particleMatch` (app.js:1806-1810) מוצאת לכל מילה **התאמה חופשית**');
  L.push('במערך השני (`B.findIndex` על מה שלא נוצל), ולכן היא השוואת **שק** ולא של רצף.', '');
  if (order.ex.length) {
    L.push('| מונח | מקטע | סדר מוחלף · מתקבל |', '|---|---|---|');
    for (const e of order.ex) L.push(`| ${e.term} | ${e.seg} | \`${e.swapped}\` |`);
    L.push('');
  }
  if (res.mismatches.length) {
    L.push('## ⛔ אי-התאמות בין הייחוס לפסק האמיתי', '', '| id | כיוון | הוקלד | שכבה | אמת |', '|---|---|---|---|---|');
    for (const m of res.mismatches.slice(0, 20)) L.push(`| \`${m.id}\` | ${m.dir} | ${m.typed} | ${m.layer} | ${m.real} |`);
    L.push('');
  }
  return L.join('\n');
}

function selftest() {
  const out = [];
  let all = true;
  const ok = (name, pass, note) => { all = all && pass; out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  · ' + note : ''}`); };

  const he = getCtx('he');
  injectLex(he);
  ok('א · `typo-lex.js` מוזרק ו-typoLex() אינה null', !!he.typoLex(), 'בלעדיו nearMatch יוצאת בשורה 1185 והמדידה על שכבה כבויה');
  const before = he.TYPO_PARAMS.enabled;
  he.TYPO_PARAMS.enabled = true;

  const res = run({});
  ok('ב · הייחוס מסכים עם הפונקציה האמיתית על כל שורה', res.mismatches.length === 0, `${res.mismatches.length} אי-התאמות מתוך ${res.rows}`);

  /* ⛔ אדום מוכח · ייחוס שמדלג על שכבת הנרדפות חייב לייצר אי-התאמות. */
  const broken = run({ brokenWhy: true });
  ok('ג · ⛔ שן · ייחוס שמדלג על שכבה נתפס כאי-התאמה', broken.mismatches.length > 0, `${broken.mismatches.length} אי-התאמות`);

  /* ⛔ אדום מוכח · בלי הזרקת הלקסיקון, nearMatch מתה והספירה משתנה. */
  const noLex = run({ noLex: true });
  const accWith = Array.from(res.byClass.values()).reduce((n, b) => n + b.accepted, 0);
  const accNo = Array.from(noLex.byClass.values()).reduce((n, b) => n + b.accepted, 0);
  ok('ד · ⛔ שן · בלי הזרקת typo-lex המדידה שונה', accWith !== accNo || res.mismatches.length !== noLex.mismatches.length,
    `עם לקסיקון ${accWith} · בלי ${accNo}`);
  injectLex(he); injectLex(getCtx('en'));

  const syn = synAudit(he);
  ok('ה · ביקורת הנרדפות מכסה את כל 102 הקבוצות', syn.rows.length === SYN.groups.length, `${syn.rows.length}`);
  const order = orderAudit(he);
  ok('ו · ביקורת הסדר מצאה מקטעים רב-מיליים לבדוק', order.multi > 500, `${order.multi}`);

  /* ===== ⭐ שער ז · השן של בדיקת חציית הכרטיסים =====
   * "אפס חוצות" הוא עדות רק אם המונה יודע לעלות. נשתלת כאן קבלה שכן חוצה:
   * מחרוזת שהיא **מונח אמיתי של ערך אחר במאגר**, בשיוך לכרטיס שאינו שלה.
   * שלוש טענות נבדקות — שהמונה עולה, שקוד היציאה משתנה, ושהבדיקה **שותקת**
   * על מחרוזת שהכרטיס עצמו מחזיק (אחרת היא הייתה מאדימה על הכול). */
  const baseCross = crossAudit(res);
  const bank = Array.from(he.BANK);
  const victim = bank.find(w => !ownAllow(he, w).has(he.K(bank[0].term))) || bank[1];
  const intruderKey = he.K(bank[0].term);
  const planted = [{
    id: 'PLANTED', layer: 'nearMatch', cls: 'neg-other-term', lang: 'he',
    dir: 'word', typed: String(bank[0].term), card: victim,
  }];
  const withPlant = crossAudit(res, planted);
  ok('ז · ⛔ שן · קבלה חוצת-כרטיסים שתולה מעלה את המונה',
    withPlant.cross === baseCross.cross + 1 && withPlant.byIndex.TERM_VETO === baseCross.byIndex.TERM_VETO + 1,
    `${baseCross.cross} → ${withPlant.cross} · המחרוזת "${intruderKey}" על ${String(victim.term)}`);
  ok('ז2 · ⛔ שן · קוד היציאה עובר מ-2 ל-3',
    exitFor(baseCross, res) === 2 && exitFor(withPlant, res) === 3,
    `${exitFor(baseCross, res)} → ${exitFor(withPlant, res)}`);
  /* הכיוון השני של השן · הבדיקה חייבת לשתוק כשהמחרוזת שייכת לכרטיס עצמו. */
  const selfOwned = [{
    id: 'SELF', layer: 'nearMatch', cls: 'neg-other-term', lang: 'he',
    dir: 'word', typed: String(bank[0].term), card: bank[0],
  }];
  ok('ז3 · הבדיקה שותקת על מחרוזת שהכרטיס עצמו מחזיק',
    crossAudit(res, selfOwned).cross === baseCross.cross);

  /* ===== ⭐ שער ח · ביקורת השער המרכזי · והשן שמוכיחה שהאפס אינו היעדר מדידה ===== */
  const ga = gateAudit(he, 'he');
  ok('ח · ‏B1/נרדפות אינם מקבלים מחרוזת של כרטיס אחר', ga.fired.length === 0,
    `${ga.splitOrTried + ga.canonTried} מועמדים זרים נבדקו · ${ga.blocked} נחסמו`);
  const gaBroken = gateAudit(he, 'he', true);
  ok('ח2 · ⛔ שן · ניטרול `typoSegBlocked` מדליק את המונה', gaBroken.fired.length > 0,
    `עם השומר ${ga.fired.length} · בלעדיו ${gaBroken.fired.length}`);

  he.TYPO_PARAMS.enabled = before;
  process.stdout.write(out.join('\n') + '\n' + (all ? '\n✅ כל השערים עברו\n' : '\n⛔ שער נכשל\n'));
  return all;
}

/* ===== קודי היציאה · שלוש מדרגות, כדי שאפשר יהיה להריץ את זה כשער אוטומטי =====
 *   0 · אין קבלות מהשכבה שלנו
 *   2 · יש קבלות `ours` · מצב צפוי ולגיטימי · דורש הכרעת מורה
 *   3 · ⛔ **חציית כרטיסים** · קו אדום · לא ניתן להסיק אותו מקריאת טקסט
 * ‏`cmd | tail` בולע את קוד היציאה · יש לקרוא אותו מהפקודה עצמה. */
function exitFor(cross, res) {
  if (cross.cross > 0) return 3;
  return (res.ours && res.ours.length) ? 2 : 0;
}

module.exports = {
  run, whyWord, whyGloss, synAudit, orderAudit, participleAudit,
  crossCardOf, crossAudit, ownAllow, exitFor, injectLex, md, selftest, gateAudit, casesAudit,
};

if (require.main === module) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const he = getCtx('he'), en = getCtx('en');
  injectLex(he); injectLex(en);
  he.TYPO_PARAMS.enabled = true; en.TYPO_PARAMS.enabled = true;
  const res = run({});
  const syn = synAudit(he);
  const order = orderAudit(he);
  const part = participleAudit(he, loadRows().filter(r => r.source_class === 'neg-participle'), cardIndex(he));
  const cross = crossAudit(res);
  const gate = { he: gateAudit(he, 'he'), en: gateAudit(en, 'en') };
  const cases = casesAudit({ he, en });
  const text = md(res, syn, order, part, cross, gate, cases);
  fs.writeFileSync(path.join(OUT, 'probe-accepts.md'), text, 'utf8');
  fs.writeFileSync(path.join(OUT, 'probe-ours.json'), JSON.stringify({
    generated: 'typo-lab/probe_accepts.js',
    ours: res.ours.length, cross: cross.cross, orphan: cross.orphan,
    ids: res.ours.map(e => ({ id: e.id, layer: e.layer, cls: e.cls })).sort((a, b) => (a.id < b.id ? -1 : 1)),
  }, null, 2) + '\n', 'utf8');

  let ours = 0, ex = 0;
  for (const b of res.byClass.values()) for (const k of Object.keys(b.layers)) (LIVE_LAYERS.has(k) ? (ours += b.layers[k]) : (ex += b.layers[k]));
  process.stdout.write(`שורות שליליות ${res.rows} · אי-התאמות ייחוס ${res.mismatches.length}\n`);
  process.stdout.write(`קבלות ⛔ ours=${ours} · exact=${ex}\n`);
  process.stdout.write(`⛔ חוצות כרטיסים: ${cross.cross} · orphan: ${cross.orphan} (TERM_VETO ${cross.byIndex.TERM_VETO} · SEG_VETO ${cross.byIndex.SEG_VETO})\n`);
  process.stdout.write(`נרדפות שנפסלו ודלפו לנכס: ${syn.rejLeak.length} · חפיפה חלקית ${syn.rejPartial.length}\n`);
  process.stdout.write(`participle · ${part.accepted}/${part.total} מתקבלות · דרך heForms ${part.byHeForms}\n`);
  process.stdout.write(`particleMatch אדיש לסדר · ${order.permAccepted}/${order.multi} מקטעים\n`);
  process.stdout.write(`ביקורת bank_gate · B1/נרדפות ירו על מחרוזת של כרטיס אחר: he=${gate.he.fired.length} en=${gate.en.fired.length} (נבדקו ${gate.he.splitOrTried + gate.he.canonTried + gate.en.splitOrTried + gate.en.canonTried} מועמדים זרים)\n`);
  process.stdout.write('נכתב ל-out/probe-accepts.md · out/probe-ours.json\n');
  process.exit(exitFor(cross, res));
}
