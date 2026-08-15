'use strict';
/* הוכחת אפס-התנגשויות על כל המאגר · typo-lab/bank_gate.js
 *
 *   node typo-lab/bank_gate.js
 *
 * ===== מה מוכיחים כאן =====
 *
 * זה סטנדרט ההוכחה של הפרויקט. app.js:781 מנסח אותו על כלל ההדבקה של הרווחים:
 * "measured ZERO new collisions across all 1,719 Hebrew terms". כל כלל שנוגע בהכרעת
 * הנכונות עובר את אותה מדידה, ולא מדגם ממנה.
 *
 * הטענה: לכל ערך A במאגר ולכל ערך **אחר** B, שום צורה שמתקבלת עבור B, ושום וריאציה
 * שהדאטהסט מתייג ראויה-לקבל עבור B, אינה מתקבלת על הכרטיס של A · אלא אם B הוא נרדף
 * שחולק פירוש עם A (‏glossAlts, כלומר בדיוק המקרה שהאפליקציה מקבלת היום בכוונה).
 *
 * ===== שלוש שכבות, שלוש הוכחות =====
 *
 *   1. כיוון המונח   · הבודק המכויל (out/typo-rules.json) על he-word ועל en-word.
 *   2. כיוון הפירוש  · אותו בודק על סט gloss, **וגם** חוק צד-הפירוש המומלץ
 *                      (‏B1-union מתוך measure_gloss.CONFIGS, לא מוקלד כאן מחדש).
 *   3. נרדפות        · קבוצות ה-approved מהלקסיקון, דרך gate_synonyms.newCollisions.
 *
 * ===== ולמה זה לא מדגם · הסינון הוא שלם ולא היוריסטי =====
 *
 * המסנן המתבקש (רצועת אורך + אות ראשונה ואחרונה) הוא מהיר אבל **אינו שלם**: שתי
 * מחרוזות במרחק עריכה 1 יכולות להיפרד באות הראשונה, וזוג כזה היה נעלם מהספירה ומההוכחה
 * גם יחד. שער שמפספס בשקט גרוע משער שאינו קיים.
 *
 * לכן הסינון כאן נגזר מהפרמטרים עצמם ומוכח:
 *   · ‏decide() בבודק פוסלת כל מועמד שמרחק העריכה הגולמי אליו גדול מ-MAX_OPS.
 *   · קבלה פאזית דורשת עלות ממושקלת ‎<= t‎, וכל פעולה עולה לפחות ‎min(W)‎, ולכן מספר
 *     הפעולות אינו עולה על ‎floor(max(t)/min(W))‎. מספר הפעולות של יישור כלשהו חוסם
 *     מלמעלה את מרחק העריכה, ולכן זהו חסם על המרחק.
 *   ⇒ ‏EFF = min(MAX_OPS, floor(max(t)/min(W)))‎, ‏**נקרא מהארטיפקט בכל ריצה**.
 *     ‏EFF=0 עדיין נבדק במרחק 0, כי שכבת ההתאמה המדויקת אינה כפופה לסף.
 *
 * ומעליו אינדקס-מחיקות (‏SymSpell): שתי מחרוזות במרחק לוונשטיין ‎<= d‎ חולקות מחרוזת
 * שמתקבלת מהשמטת ‎<= d‎ תווים מכל אחת מהן. ‏editDist של app.js הוא לוונשטיין טהור
 * (‏selfcheck34 מקבע זאת: היפוך עולה שם 2), ולכן האינדקס **שלם**. מחרוזות ארוכות
 * מהסף אינן נכנסות לאינדקס אלא נסרקות ישירות מול רצועת האורך, וגם זה שלם.
 *
 * ===== התנגשות חדשה מול התנהגות של היום =====
 *
 * ‏acceptWord מחזירה via='exact' כשההכרעה היא של האפליקציה כמו שהיא היום, ו-via='typo'
 * כשהיא של השכבה החדשה. הפסק האדום הוא על 'typo' בלבד · זו ההגדרה של "אפס התנגשויות
 * **חדשות**". קבלה חוצת-ערכים ב-via='exact' היא התנהגות קיימת, היא מדווחת בשמה בדוח,
 * והיא לא נוצרה כאן. בליעה שלה לתוך אותו מספר הייתה מטשטשת בדיוק את מה שהשער נועד למדוד.
 *
 * ===== שום מספר אינו מקובע בקוד =====
 * הפרמטרים, הספים, מספר הזוגות והתוצאה נקראים מהארטיפקט בזמן ריצה. אופטימיזציה שרצה
 * במקביל ומחליפה את out/typo-rules.json תחת השער היא בדיוק המצב שהשער תוכנן אליו.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptedSegs } = require('./lib/keys.js');
const { makeChecker, MAX_OPS } = require('./lib/checker.js');
const { wEditDist, UNIT_W } = require('./lib/wdist.js');
const { makeGlossChecker, BY_NAME } = require('./lib/glossrules.js');
const GS = require('./gate_synonyms.js');
const MG = require('./measure_gloss.js');

const OUT = path.join(__dirname, 'out');
/* ‏TYPO_RULES קיים כדי שאפשר יהיה להריץ את השער על ארטיפקט אחר · בקרת שפיות ("על
   פרמטרים שמרניים השער חייב לרדת לירוק") ובדיקה של מועמד לפני שהוא נכתב ל-out. ברירת
   המחדל היא הארטיפקט האמיתי, ואין כאן שום ערך מקובע. */
const RULES_PATH = process.env.TYPO_RULES || path.join(OUT, 'typo-rules.json');
/* ‏ריצה על ארטיפקט חלופי אינה מורשית לדרוס את דוח הריצה של הפרמטרים הנשלחים · אחרת
   בדיקת מועמד או הדגמת שיניים משאירה אחריה `bank-gate.md` שמתאר משהו אחר לגמרי,
   ובדיוק זו הטעות ש-`fingerprint` נועד לתפוס. הדוח נכתב לצד הארטיפקט שנבדק. */
/* ‏MORPH_RULE · ערוץ המורפולוגיה. **כבוי כברירת מחדל**: בלי המשתנה הזה הקובץ מתנהג
   בדיוק כמו קודם, אותו פלט ואותה טביעה. מחלקת המורפולוגיה מעולם לא נשלחה, ולכן אין לה
   ייצוג ב-`typo-rules.json` · הרצת השער עליה בלי הערוץ הזה הייתה ירוק שלא הסתכל.
   ‏MORPH_VETO בוחר איזה ווטו נבדק · `V1t` (יקום הקבלה המלא) או `V0` (הווטו של היום,
   מצב השיניים: הוא **חייב** להחזיר אדום). */
const MORPH_RULE = process.env.MORPH_RULE || '';
const MORPH_VETO = process.env.MORPH_VETO || 'V1t';
const MD_PATH = process.env.TYPO_RULES
  ? path.join(OUT, 'bank-gate.' + path.basename(RULES_PATH).replace(/\.json$/, '') + '.md')
  : MORPH_RULE
    ? path.join(OUT, `bank-gate.morph.${MORPH_RULE}.${MORPH_VETO}.md`)
    : path.join(OUT, 'bank-gate.md');

const say = s => process.stdout.write(s + '\n');
const md = [];
const p = s => md.push(s);

/* ===== הארטיפקט ===== */

function shipParams() {
  if (!fs.existsSync(RULES_PATH)) {
    say('⛔ out/typo-rules.json חסר · הריצו קודם את evolve.js');
    process.exit(2);
  }
  const j = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const nb = bs => bs.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t }));
  /* ‏גני השוליים המדורגים חייבים לעבור כאן במפורש. הם **אינם** נופלים לברירת המחדל
     הנכונה אם משמיטים אותם: ‏normalizeParams יורש marginSoft מ-marginHard ומכבה את
     המשטר הצר, כלומר ארטיפקט מדורג היה נבדק כאן כאילו הוא אינו מדורג — שער ירוק על
     פרמטרים שאינם אלה שנשלחים. זה הכיוון המסוכן מבין השניים, ולכן הוא מפורש. */
  const norm = q => {
    const o = {
      minLen: q.minLen, vetoMargin: q.vetoMargin, W: q.W,
      bands: nb(q.bands),
    };
    if (q.marginHard != null) o.marginHard = q.marginHard;
    if (q.marginSoft != null) o.marginSoft = q.marginSoft;
    if (Array.isArray(q.bandsTight) && q.bandsTight.length) o.bandsTight = nb(q.bandsTight);
    if (q.WTight) o.WTight = q.WTight;
    return o;
  };
  const sets = {};
  for (const k of ['he-word', 'en-word', 'gloss']) {
    if (!j.params || !j.params[k]) { say(`⛔ out/typo-rules.json בלי params.${k}`); process.exit(2); }
    sets[k] = norm(j.params[k]);
  }
  return { ver: j.ver || '(ללא ver)', enabled: j.enabled !== false, sets, fp: fingerprint(sets), raw: j };
}

/* טביעת אצבע של הפרמטרים עצמם.
 * ‏ver אינו זיהוי: כל ריצה של האופטימיזציה כותבת את אותה מחרוזת ver עם גנום אחר, וזה
 * נמדד כאן בפועל · הדוח נכתב על minLen=7 והסיכום נקרא כבר minLen=6 באותה ריצה עצמה.
 * שער שמדווח מספרים משני ארטיפקטים שונים אינו מדווח על אף אחד מהם, ולכן verify_all
 * משווה את הטביעה ומכריז אדום על אי-התאמה. */
function fingerprint(sets) {
  const nb = bs => (bs || []).map(b => [b.maxLen === Infinity || b.maxLen == null ? -1 : b.maxLen, b.t]);
  const nw = w => Object.keys(w || {}).sort().map(k => [k, w[k]]);
  /* ‏שני ארטיפקטים שנבדלים רק במשטר הצר חייבים לקבל טביעות שונות · אחרת verify_all
     משווה טביעה, מוצא התאמה, ומכריז שהדוח מתאר את הפרמטרים שנשלחים בזמן שהוא מתאר
     ריצה אחרת לגמרי. ‏null מפורש (ולא השמטה) כדי שגנום בלי המשטר יקבל טביעה יציבה. */
  const norm = q => ({
    minLen: q.minLen, vetoMargin: q.vetoMargin,
    bands: nb(q.bands),
    W: nw(q.W),
    marginHard: q.marginHard == null ? null : q.marginHard,
    marginSoft: q.marginSoft == null ? null : q.marginSoft,
    bandsTight: q.bandsTight ? nb(q.bandsTight) : null,
    WTight: q.WTight ? nw(q.WTight) : null,
  });
  const keys = Object.keys(sets).sort();
  return crypto.createHash('sha256')
    .update(JSON.stringify(keys.map(k => [k, norm(sets[k])])))
    .digest('hex').slice(0, 12);
}

/* חסם מספר הפעולות שנגזר מהפרמטרים · ראה ההסבר בראש הקובץ. */
function effOps(P) {
  /* ‏החסם נלקח על **איחוד** שני המשטרים. הצר אינו בהכרח הצר יותר בכל גן: הוא הודק
     במשקלים ויכול להיות רחב יותר ברצועה בודדת, ואז חסם שנגזר מהמשטר הראשי בלבד
     היה מייצר אינדקס-מחיקות רדוד מדי — כלומר זוגות שלא הגיעו לחישוב ושער ירוק
     שנובע מאי-בדיקה. במועמד הנוכחי הראשי ממילא שולט; זה נכתב כדי שיישאר נכון. */
  const ws = [];
  for (const w of [P.W, P.WTight]) if (w) for (const k of Object.keys(w)) {
    const x = w[k]; if (typeof x === 'number' && x > 0) ws.push(x);
  }
  const minW = ws.length ? Math.min.apply(null, ws) : 0;
  const ts = [];
  for (const bs of [P.bands, P.bandsTight]) if (bs) for (const b of bs) ts.push(typeof b.t === 'number' ? b.t : 0);
  const maxT = ts.length ? Math.max.apply(null, ts) : 0;
  if (!(maxT > 0)) return 0;
  if (!(minW > 0)) return MAX_OPS;
  return Math.max(0, Math.min(MAX_OPS, Math.floor(maxT / minW + 1e-9)));
}

/* ===== אינדקס-מחיקות · שלם למרחק לוונשטיין <= depth ===== */

function delVariants(s, d) {
  const all = new Set([s]);
  let cur = [s];
  for (let i = 0; i < d; i++) {
    const nxt = [];
    for (const x of cur) {
      for (let j = 0; j < x.length; j++) {
        const y = x.slice(0, j) + x.slice(j + 1);
        if (!all.has(y)) { all.add(y); nxt.push(y); }
      }
    }
    cur = nxt;
    if (!cur.length) break;
  }
  return all;
}

/* מחרוזות ארוכות מ-LONG אינן מפורקות (‏C(66,3) הוא 45,760 וריאציות למקטע אחד), אלא
   נסרקות ישירות מול רצועת האורך. שני המסלולים שלמים, וההפרדה היא ביצועים בלבד. */
function makeNear(forms, depth, LONG) {
  const idx = new Map();
  const shortByLen = new Map();
  const longs = [];
  let variants = 0;
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    if (f.length > LONG) { longs.push(i); continue; }
    let a = shortByLen.get(f.length);
    if (!a) { a = []; shortByLen.set(f.length, a); }
    a.push(i);
    for (const v of delVariants(f, depth)) {
      let b = idx.get(v);
      if (!b) { b = []; idx.set(v, b); }
      b.push(i); variants++;
    }
  }
  let probes = 0;
  function near(q, out) {
    const res = out || new Set();
    if (q.length <= LONG) {
      for (const v of delVariants(q, depth)) {
        probes++;
        const b = idx.get(v);
        if (b) for (const i of b) res.add(i);
      }
    } else {
      for (let L = Math.max(0, q.length - depth); L <= q.length + depth; L++) {
        const a = shortByLen.get(L);
        if (a) for (const i of a) res.add(i);
      }
    }
    for (const i of longs) if (Math.abs(forms[i].length - q.length) <= depth) res.add(i);
    return res;
  }
  return { near, variants, longs: longs.length, entries: idx.size, stats: () => ({ probes }) };
}

/* ===== סריקת הדאטהסט · בזרימה, בלי לשמור שורות =====
 * ‏89 אלף אובייקטים שמורים בזיכרון עלו כאן ביותר מגיגה-בייט והפילו את הריצה לזחילה.
 * מה שהשער צריך מהדאטהסט הוא בדיוק צורה -> בעלים, ולכן השורה נזרקת מיד אחרי החילוץ.
 * הקובץ עשוי להיכתב מחדש תחתינו בזמן שאופטימיזציה רצה במקביל, ולכן שורה שאינה נפרסת
 * נספרת ומדווחת ולא מפילה את השער. */
function scanDataset(files, models) {
  const out = { word: { he: new Map(), en: new Map() }, gloss: { he: new Map(), en: new Map() } };
  let rows = 0, bad = 0;
  const missing = [];
  const put = (map, f, o) => {
    if (!f || !o) return;
    let s = map.get(f);
    if (!s) { s = new Set(); map.set(f, s); }
    s.add(o);
  };
  for (const file of files) {
    if (!fs.existsSync(file)) { missing.push(path.basename(file)); continue; }
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let r;
      try { r = JSON.parse(line); } catch (e) { bad++; continue; }
      rows++;
      if (r.label !== 'accept') continue;
      const M = models[r.lang];
      if (!M) continue;
      const o = M.ctx.K(r.term);
      if (!o) continue;
      const typed = String(r.typed == null ? '' : r.typed);
      if (!typed) continue;
      if (r.set === 'gloss') put(out.gloss[r.lang], M.ctx.norm(typed), o);
      else if (r.set === 'he-word' || r.set === 'en-word') put(out.word[r.lang], typed, o);
    }
  }
  return { forms: out, rows, bad, missing };
}

/* ===== מודל שפה ===== */

function langModel(L) {
  const ctx = getCtx(L);
  const veto = buildVeto(ctx, L);
  const cards = Array.from(ctx.BANK);
  const info = cards.map(w => {
    const owner = ctx.K(w.term);
    const allowed = new Set([owner]);
    for (const t of Array.from(ctx.glossAlts(w))) { const k = ctx.K(t); if (k) allowed.add(k); }
    return {
      w, owner, term: w.term, unit: w.unit, allowed,
      keys: Array.from(acceptedKeys(w, ctx)).filter(Boolean),
      segs: Array.from(acceptedSegs(w, ctx)).filter(Boolean),
    };
  });
  const byKey = new Map();
  for (const e of info) if (!byKey.has(e.owner)) byKey.set(e.owner, e);
  /* keysPlus · המפתחות שהכרטיס מקבל *היום* דרך acceptsToday, כולל אלה של הנרדפות
     שחולקות איתו פירוש. הם נחוצים כי שכבת ההתאמה המדויקת אינה כפופה לשום סף מרחק,
     ולכן מסנן שנשען על מרחק בלבד היה מפספס אותה. */
  for (const e of info) {
    const s = new Set(e.keys);
    for (const t of Array.from(ctx.glossAlts(e.w))) {
      const g = byKey.get(ctx.K(t));
      if (g) for (const k of g.keys) s.add(k);
    }
    e.keysPlus = s;
  }
  return { L, ctx, veto, cards, info, byKey };
}

/* ===== 1 · כיוון המונח ===== */

function termSweep(M, P, dsForms) {
  const ctx = M.ctx;
  const set = M.L === 'en' ? 'en-word' : 'he-word';
  const ck = makeChecker(P.sets[set], ctx, M.veto, M.L);
  const depth = effOps(P.sets[set]);

  /* צורה -> בעלים. כל מפתח שמתקבל עבור ערך, ובנוסף כל וריאציה שהדאטהסט מתייג
     ראויה-לקבל עבורו · אלה הצורות שהלומד באמת יקליד. */
  const owners = new Map();
  const put = (f, o) => {
    if (!f || !o) return;
    let s = owners.get(f);
    if (!s) { s = new Set(); owners.set(f, s); }
    s.add(o);
  };
  /* keyOwners · רק צורות שהן מפתח קביל של ערך, בלי וריאציות הדאטהסט. ההבחנה הזו היא
     שמאפשרת להגיד "המחרוזת הזאת **היא** מילה אחרת" ולא רק "היא נגזרת ממנה". */
  const keyOwners = new Map();
  for (const e of M.info) for (const k of e.keys) {
    put(k, e.owner);
    let s = keyOwners.get(k);
    if (!s) { s = new Set(); keyOwners.set(k, s); }
    s.add(e.owner);
  }
  let fromDataset = 0;
  for (const [f, os] of dsForms) {
    if (!owners.has(f)) fromDataset++;
    for (const o of os) put(f, o);
  }

  const forms = Array.from(owners.keys());
  const ownerOf = forms.map(f => owners.get(f));
  const NI = makeNear(forms, depth, 24);
  const byForm = new Map();
  forms.forEach((f, i) => byForm.set(f, i));
  /* הערוץ השני · מפתחות שהכרטיס מקבל היום דרך acceptsToday. הם אינם כפופים לשום סף
     מרחק, ולכן חייבים להיכנס להכרעה גם כשהמסנן דוחה אותם. */
  const always = e => {
    const out = [];
    for (const k of e.keysPlus) { const i = byForm.get(k); if (i !== undefined) out.push(i); }
    return out;
  };
  /* ערכים שחולקים עם הכרטיס צורה קבילה · אותה מילה במאגר פעמיים. */
  const exemptOf = e => {
    const share = new Set();
    for (const k of e.keys) { const s = keyOwners.get(k); if (s) for (const o of s) share.add(o); }
    const own = new Set(e.keys);
    return (f, i, o) => {
      if (!share.has(o)) return false;
      const ko = keyOwners.get(f);
      if (ko && ko.has(o) && !own.has(f)) return false;   // זו צורה קבילה של מילה אחרת
      return true;
    };
  };
  const R = sweep(M, forms, ownerOf, NI, depth, (f, card) => ck.acceptWord(f, card), 'term', e => e.keys, always, exemptOf);

  return Object.assign({ lang: M.L, set, depth, forms: forms.length, fromDataset, cards: M.info.length }, R,
    { probes: NI.stats().probes, indexEntries: NI.entries, longForms: NI.longs });
}

/* הלולאה המשותפת לשני הכיוונים.
 * ‏Int32Array עם חותמת דור במקום Set: הדלי לכל כרטיס מגיע לאלפי מועמדים, ו-Set
 * שנבנה מחדש 5,663 פעמים היה עלות הריצה כולה. אין כאן שינוי סמנטי · אותה קבוצה בדיוק.
 * ‏wEditDist עם UNIT_W וחסם הוא מרחק לוונשטיין חסום, ו-selfcheck34 מקבע שהוא זהה
 * ל-editDist של app.js. משתמשים בו כמסנן בלבד; ההכרעה עצמה נשארת של הבודק האמיתי. */
function sweep(M, forms, ownerOf, NI, depth, decide, dir, srcOf, alwaysOf, exemptOf) {
  const stamp = new Int32Array(forms.length);
  const forced = new Int32Array(forms.length);
  const bag = [];
  let gen = 0, pairs = 0, cands = 0, skipped = 0, decided = 0;
  const collisions = [];
  const baseline = [];
  const sameWord = [];
  for (const e of M.info) {
    gen++;
    bag.length = 0;
    const src = srcOf(e);
    const exempt = exemptOf ? exemptOf(e) : null;
    for (const k of src) for (const i of NI.near(k)) { if (stamp[i] !== gen) { stamp[i] = gen; bag.push(i); } }
    for (const i of alwaysOf(e)) { forced[i] = gen; if (stamp[i] !== gen) { stamp[i] = gen; bag.push(i); } }
    cands += bag.length;
    for (const i of bag) {
      let outside = null;
      for (const o of ownerOf[i]) if (!e.allowed.has(o)) { outside = o; break; }
      if (outside == null) { skipped++; continue; }
      /* אימות המרחק בפועל · האינדקס מחזיר על-קבוצה, וכאן היא מצטמצמת למה שבאמת בטווח.
         זהו "הזוג שהגיע לחישוב מרחק". דילוג מותר רק כששני התנאים נשללים: מחוץ לטווח
         הפעולות **וגם** אינו בערוץ ההתאמה של היום, שאינו כפוף לשום סף מרחק. */
      pairs++;
      const f = forms[i];
      if (forced[i] !== gen) {
        let d = Infinity;
        for (const k of src) {
          if (Math.abs(f.length - k.length) > depth) continue;   // חסם אורך לפני חישוב · זול יותר מקריאה
          const x = wEditDist(f, k, UNIT_W, depth);
          if (x < d) d = x;
          if (!d) break;
        }
        if (!(d <= depth)) continue;
      }
      decided++;
      const v = decide(f, e.w);
      if (!v.ok) continue;
      /* מי מהבעלים החיצוניים הוא באמת "מילה אחרת". ערך שחולק עם הכרטיס צורה קבילה הוא
         **אותה מילה** שמופיעה במאגר פעמיים (יחידה אחרת, או חלופת כתיב בתוך אותו ערך),
         ווריאציה שלו היא וריאציה של המילה של הכרטיס עצמו · לא התנגשות. החריג: אם
         המחרוזת היא צורה קבילה של אותו ערך ו**אינה** צורה קבילה של הכרטיס, זו כן מילה
         אחרת ("נקב" מול הכרטיס "נקבובית"), והיא נשארת אדומה.
         הפרדה ולא דילוג: הזוג מחושב, נספר, ומופיע בדוח בשם. שער שמשתיק בשקט אינו שער. */
      let hard = null;
      for (const o of ownerOf[i]) {
        if (e.allowed.has(o)) continue;
        if (exempt && exempt(f, i, o)) continue;
        hard = o; break;
      }
      const hit = {
        lang: M.L, dir, card: e.term, unit: e.unit,
        typed: f, intruder: hard == null ? outside : hard, via: v.via || null, dist: v.dist == null ? null : v.dist,
      };
      if (hard == null) sameWord.push(hit);
      else if (v.via === 'typo') collisions.push(hit);
      else baseline.push(hit);
    }
  }
  return { cands, pairs, decided, skipped, collisions, baseline, sameWord };
}

/* ===== 2 · כיוון הפירוש ===== */

/* קבוצת המחרוזות שחוק B1 מוסיף לכרטיס · חוק 'gen' ולכן הקבוצה סופית וניתנת למנייה. */
function expandOf(rule, segs, ctx, params) {
  if (typeof rule.expand !== 'function') return new Set();
  try { return rule.expand(segs, ctx, params) || new Set(); } catch (e) { return new Set(); }
}

/* ===== ערוץ ההתאמה של היום בצד הפירוש · חסם נכון ל-particleMatch =====
 *
 * ‏meaningMatch מקבלת גם דרך particleMatch (app.js:1293), וזו התאמה שאינה כפופה לשום
 * סף מרחק: היא זורקת מילות יחס עצמאיות ומקלפת אות תחילית אחת מכל מילה. מסנן מרחק לבדו
 * היה מפספס אותה, ושער שמפספס בשקט אינו שער.
 *
 * החסם: ‏eq של particleMatch מקבל x=y, ‏peel(x)=y, ‏x=peel(y) או ‏peel(x)=peel(y). בכל
 * ארבעת המקרים **הגזע העמוק זהה** · deepRoot שמקלף כל עוד אפשר. לכן שוויון רב-קבוצת
 * ה-deepRoot של מילות התוכן הוא תנאי הכרחי ל-particleMatch, וקיבוץ לפיו מייצר על-קבוצה
 * שלמה של הערוץ הזה במחיר של חיפוש בטבלת גיבוב אחת. */
const PARTICLE_STOP_HE = ['של', 'את', 'עם', 'על', 'אל', 'מן', 'כל', 'זה', 'זאת', 'הוא', 'היא', 'אשר', 'או', 'גם', 'לפי'];
function rootKeyWith(s, stop) {
  const PARTICLE = 'הלבכו';
  const deep = w => { let x = w; while (x.length > 3 && PARTICLE.includes(x[0])) x = x.slice(1); return x; };
  const ws = String(s).split(/\s+/).filter(x => x && !stop.has(x)).map(deep).sort();
  return ws.join(' ');
}

function glossSweep(M, P, dsForms, cfg) {
  const ctx = M.ctx;
  const ck = makeChecker(P.sets.gloss, ctx, M.veto, M.L);
  const depth = effOps(P.sets.gloss);
  const rule = BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const glossCk = makeGlossChecker(ctx, { [cfg.rule]: { on: true, params, veto: M.veto } });

  const owners = new Map();
  const put = (f, o) => {
    if (!f || !o) return;
    let s = owners.get(f);
    if (!s) { s = new Set(); owners.set(f, s); }
    s.add(o);
  };
  let fromRule = 0;
  const expanded = new Map();
  for (const e of M.info) {
    for (const s of e.segs) put(s, e.owner);
    /* הצורות שהחוק המומלץ **מוסיף** לערך הן צורות מתקבלות שלו לכל דבר, ולכן הן חלק
       מהיקום שנבדק. בלי זה השער היה מוכיח את המאגר של אתמול. */
    const ex = [];
    for (const s of expandOf(rule, e.segs, ctx, params)) {
      const k = ctx.norm(s);
      if (!k) continue;
      ex.push(k);
      if (!owners.has(k)) fromRule++;
      put(k, e.owner);
    }
    expanded.set(e, ex);
  }
  let fromDataset = 0;
  for (const [f, os] of dsForms) {
    if (!owners.has(f)) fromDataset++;
    for (const o of os) put(f, o);
  }

  const forms = Array.from(owners.keys());
  const ownerOf = forms.map(f => owners.get(f));
  const byForm = new Map();
  forms.forEach((f, i) => byForm.set(f, i));
  const NI = makeNear(forms, depth, 24);

  const stop = new Set(PARTICLE_STOP_HE.map(x => ctx.norm(x)).filter(Boolean));
  const rootIdx = new Map();
  forms.forEach((f, i) => {
    const rk = rootKeyWith(f, stop);
    let a = rootIdx.get(rk);
    if (!a) { a = []; rootIdx.set(rk, a); }
    a.push(i);
  });

  /* מה שנכנס להכרעה בלי קשר למרחק: המקטעים עצמם, הפירוש המלא ובלי הסוגריים, וכל צורה
     שחולקת גזע עמוק עם אחד מהם. */
  const always = e => {
    const out = [];
    const seeds = e.segs.slice();
    seeds.push(ctx.norm(e.w.meaning));
    seeds.push(ctx.norm(String(e.w.meaning).replace(/\([^)]*\)/g, ' ')));
    for (const s of seeds) {
      if (!s) continue;
      const i = byForm.get(s);
      if (i !== undefined) out.push(i);
      const a = rootIdx.get(rootKeyWith(s, stop));
      if (a) for (const j of a) out.push(j);
    }
    return out;
  };

  const R = sweep(M, forms, ownerOf, NI, depth, (f, card) => ck.acceptGloss(f, card), 'gloss', e => e.segs, always);

  /* שכבת החוק · קבוצת הקבלות שהיא מוסיפה סופית וניתנת למנייה מלאה (‏kind='gen'),
     ולכן נבדקת כולה ולא בדגימה. */
  let rulePairs = 0;
  for (const e of M.info) {
    const seen = new Set();
    for (const s of e.segs) { const i = byForm.get(s); if (i !== undefined) seen.add(i); }
    for (const k of expanded.get(e)) { const i = byForm.get(k); if (i !== undefined) seen.add(i); }
    for (const i of seen) {
      let outside = null;
      for (const o of ownerOf[i]) if (!e.allowed.has(o)) { outside = o; break; }
      if (outside == null) continue;
      rulePairs++;
      const v = glossCk(forms[i], e.w);
      if (!v.ok) continue;
      const hit = {
        lang: M.L, dir: 'gloss-rule', card: e.term, unit: e.unit,
        typed: forms[i], intruder: outside, via: v.by === 'today' ? 'exact' : 'typo', by: v.by || null,
      };
      if (v.by === 'today') R.baseline.push(hit); else R.collisions.push(hit);
    }
  }

  return Object.assign({
    lang: M.L, set: 'gloss', depth, forms: forms.length, fromRule, fromDataset,
    cards: M.info.length, rulePairs, cfgKey: cfg.key,
  }, R, { probes: NI.stats().probes, indexEntries: NI.entries, longForms: NI.longs });
}

/* ===== 3 · הנרדפות ===== */

/* ===== ערוץ המורפולוגיה · אופציונלי =====
 *
 * למה זה כאן ולא במעבדה בלבד: יקום הצורות של השער **אינו** יקום הקבלה של
 * `measure_morph`. הוא כולל בנוסף (א) את תוצרי ההרחבה של `B1-union` ו-(ב) את צורות
 * הדאטהסט שתויגו accept. שתי הקבוצות האלה אינן מקטע פירוש ואינן בענף `particleMatch`,
 * ולכן הן **בלתי נראות** לכל ווטו שנבנה מהמאגר בלבד. זו בדיוק הנקודה העיוורת שהפילה
 * את מועמד ה-gloss הראשון, והיא הסיבה היחידה שהערוץ הזה שווה משהו.
 *
 * מקור אמת אחד: יקום הקבלה שמשמש כווטו מיובא מ-`measure_morph` (‏`SINGLE`) ואינו
 * ממומש כאן מחדש · בדיוק כפי ש-`expandOf` מיוצא כדי שהחיפוש לא יכתוב אותו שוב.
 */
function morphSweep(M, dsForms, glossCfg) {
  const ctx = M.ctx;
  const MR = require('./lib/morphrules.js');
  const MM = require('./measure_morph.js');
  const { isVetoedSeg } = require('./lib/veto.js');

  const mcfg = MM.CONFIGS.concat(MM.PAIR_CONFIGS, MM.CLASS_CONFIGS).find(c => c.key === MORPH_RULE);
  if (!mcfg) { say('⛔ MORPH_RULE לא מוכר · ' + MORPH_RULE); process.exit(2); }
  const rule = MR.BY_NAME.get(mcfg.rule);
  const params = Object.assign({}, rule.defaults, mcfg.params);

  const gRule = BY_NAME.get(glossCfg.rule);
  const gParams = Object.assign({}, gRule.defaults, glossCfg.params);

  /* יקום הקבלה בנות מילה אחת · מיובא, לא ממומש מחדש. */
  const LM = MM.loadLang(M.L);
  const cardByKey = new Map();
  for (const c of LM.cards) if (!cardByKey.has(c.key)) cardByKey.set(c.key, c);

  /* יקום הצורות · ארבעה מקורות. שלושת הראשונים זהים ל-glossSweep.
     ⚠ הרביעי הוא **החובה**, ובלעדיו השער הזה היה ירוק ששקר: `glossSweep` מטפל בענף
     `particleMatch` דרך קיבוץ `rootIdx` ולא דרך הוספת צורות, ולכן מחרוזת שהיא תשובה
     קבילה של כרטיס אחר **רק** דרך הענף הזה אינה במפה. אלה בדיוק ארבע ההתנגשויות
     שהמעבדה מצאה ("תכננ" על content, "לושמ" על oil), והריצה הראשונה של הערוץ הזה
     החזירה 0 עליהן. זה נמדד ותוקן, לא נוחש. */
  const owners = new Map();
  const put = (f, o) => { if (!f || !o) return; let s = owners.get(f); if (!s) { s = new Set(); owners.set(f, s); } s.add(o); };
  let fromRule = 0, fromDataset = 0, fromParticle = 0;
  for (const e of M.info) {
    for (const s of e.segs) put(s, e.owner);
    for (const s of expandOf(gRule, e.segs, ctx, gParams)) {
      const k = ctx.norm(s); if (!k) continue;
      if (!owners.has(k)) fromRule++;
      put(k, e.owner);
    }
  }
  for (const [f, os] of dsForms) { if (!owners.has(f)) fromDataset++; for (const o of os) put(f, o); }
  for (const [f, os] of LM.SINGLE) { if (!owners.has(f)) fromParticle++; for (const o of os) put(f, o); }

  const blocked = (f, e) => {
    const lc = cardByKey.get(e.owner);
    if (MORPH_VETO === 'V0') return isVetoedSeg(f, e.w, M.veto, ctx);
    if (MORPH_VETO === 'none') return false;
    if (lc && lc.singles.has(f)) return false;                 // מתקבל היום · לעולם לא רגרסיה
    const os = LM.SINGLE.get(f);
    if (os) for (const o of os) if (!e.allowed.has(o)) return true;
    const fk = ctx.K(f);
    const to = fk ? M.veto.termKeys.get(fk) : null;
    if (to && to.size && !acceptedKeys(e.w, ctx).has(fk)) return true;
    return false;
  };

  /* אינדקס לפי מפתח החוק · בלי זה זו מכפלה של אלפי כרטיסים בעשרות אלפי צורות. */
  const forms = Array.from(owners.keys());
  const keyIx = new Map();
  forms.forEach((f, i) => {
    for (const k of rule.keysTyped(f, ctx, params)) {
      let a = keyIx.get(k); if (!a) { a = []; keyIx.set(k, a); } a.push(i);
    }
  });

  const collisions = [], baseline = [];
  let pairs = 0, cands = 0;
  for (const e of M.info) {
    const segK = rule.keysSeg(e.segs, ctx, params);
    if (!segK.size) continue;
    const seen = new Set();
    for (const k of segK) { const a = keyIx.get(k); if (a) for (const i of a) seen.add(i); }
    for (const i of seen) {
      cands++;
      let outside = null;
      for (const o of owners.get(forms[i])) if (!e.allowed.has(o)) { outside = o; break; }
      if (outside == null) continue;
      const f = forms[i];
      if (!rule.accepts(f, e.segs, ctx, params)) continue;
      pairs++;
      const hit = { lang: M.L, dir: 'morph-rule', card: e.term, unit: e.unit, typed: f, intruder: outside, via: 'morph', by: mcfg.key };
      if (ctx.meaningMatch(f, e.w.meaning)) { hit.via = 'exact'; baseline.push(hit); continue; }
      if (blocked(f, e)) continue;
      collisions.push(hit);
    }
  }
  return {
    lang: M.L, set: 'morph:' + MORPH_RULE + '/' + MORPH_VETO, depth: 0, forms: forms.length,
    fromRule, fromDataset, fromParticle, cards: M.info.length, cands, pairs, rulePairs: 0,
    collisions, baseline, sameWord: [],
  };
}

function synonymLayer() {
  let lex = null;
  try { lex = GS.loadLexicon(); } catch (e) { return { error: e.message, groups: 0, hits: [] }; }
  const approved = (lex.groups || []).filter(g => g.status === 'approved');
  const hits = approved.length ? GS.newCollisions(approved) : [];
  return { groups: approved.length, total: (lex.groups || []).length, hits };
}

/* ===== הכיוון ההפוך · חמשת זוגות הצירה שהוחזרו (app.js:687) ===== */

/* הזוגות אינם מספר שמומצא כאן: הם רשומים בתוך app.js כנימוק לביטול כלל הצירה, ומשמעותם
   שקבלה הדדית ביניהם היא בדיוק הרגרסיה שנמדדה ונדחתה. השער דורש שכל עשר ההכרעות
   (חמישה זוגות, שני כיוונים) יישארו דחייה. */
const TSERE = [
  ['רְדִיד', 'רִדֵּד'], ['הִגִיר', 'הִגֵּר'], ['נִיכָּר', 'נֵכַר'],
  ['גִּבֵּן', 'גָבִין'], ['גִּלְעֵן', 'גַּלְעִין'],
];

function tsereGate(M, P) {
  const ctx = M.ctx;
  const ck = makeChecker(P.sets['he-word'], ctx, M.veto, 'he');
  const byKey = new Map();
  for (const e of M.info) if (!byKey.has(e.owner)) byKey.set(e.owner, e);
  const rows = [];
  for (const [a, b] of TSERE) {
    const ea = byKey.get(ctx.K(a));
    const eb = byKey.get(ctx.K(b));
    if (!ea || !eb) {
      rows.push({ a, b, ok: false, note: !ea && !eb ? 'שני הערכים אינם במאגר' : (!ea ? `"${a}" אינו במאגר` : `"${b}" אינו במאגר`) });
      continue;
    }
    /* כל צורה קבילה של האחד מוקלדת על הכרטיס של השני, ולא רק המילה המנוקדת: הכלל
       שהוחזר פעל דרך הכתיב המלא, ולכן שם נופלת ההכרעה. */
    const one = (from, onCard) => {
      const bad = [];
      for (const k of from.keys) {
        const v = ck.acceptWord(k, onCard.w);
        if (v.ok) bad.push(`${k} → ${onCard.term} (via=${v.via})`);
      }
      return bad;
    };
    const bad = one(ea, eb).concat(one(eb, ea));
    rows.push({ a, b, ok: bad.length === 0, note: bad.length ? bad.join(' · ') : `${ea.keys.length + eb.keys.length} צורות, כולן נדחו` });
  }
  return rows;
}

/* ===== ראשי ===== */

function main() {
  const T0 = Date.now();
  say('=== שער כל המאגר · אפס התנגשויות חדשות ===');

  const P = shipParams();
  const cfg = MG.CONFIGS.find(c => c.key === 'B1-union');
  if (!cfg) { say('⛔ B1-union לא נמצא ב-measure_gloss.CONFIGS'); process.exit(2); }

  const models = { he: langModel('he'), en: langModel('en') };
  const dsFiles = ['dataset-he.jsonl', 'dataset-en.jsonl'].map(n => path.join(OUT, n));
  const DS = scanDataset(dsFiles, models);
  const dsRowCount = DS.rows, dsBad = DS.bad, dsMissing = DS.missing;
  say(`ארטיפקט: ver=${P.ver} · enabled=${P.enabled} · דאטהסט ${dsRowCount} שורות` +
    (dsBad ? ` (${dsBad} שורות לא נפרסו)` : '') + (dsMissing.length ? ` · חסר: ${dsMissing.join(', ')}` : ''));

  const termRes = [termSweep(models.he, P, DS.forms.word.he), termSweep(models.en, P, DS.forms.word.en)];
  const glossRes = [glossSweep(models.he, P, DS.forms.gloss.he, cfg), glossSweep(models.en, P, DS.forms.gloss.en, cfg)];
  const morphRes = MORPH_RULE
    ? [morphSweep(models.he, DS.forms.gloss.he, cfg), morphSweep(models.en, DS.forms.gloss.en, cfg)]
    : [];
  if (MORPH_RULE) say(`ערוץ מורפולוגיה · ${MORPH_RULE} · ווטו ${MORPH_VETO}`);
  const syn = synonymLayer();
  const tsere = tsereGate(models.he, P);

  const all = termRes.concat(glossRes).concat(morphRes);
  const newHits = all.reduce((a, r) => a.concat(r.collisions), []).concat(syn.hits.map(h => ({
    lang: h.lang, dir: 'synonym', card: h.victimTerm, unit: h.victimUnit,
    typed: h.victimSeg, intruder: h.intruderTerm, via: 'synonym',
  })));
  const baseHits = all.reduce((a, r) => a.concat(r.baseline), []);
  const sameHits = all.reduce((a, r) => a.concat(r.sameWord || []), []);
  const totalPairs = all.reduce((a, r) => a + r.pairs + (r.rulePairs || 0), 0);
  const totalCands = all.reduce((a, r) => a + r.cands, 0);
  const totalCards = models.he.info.length + models.en.info.length;
  const tsereBad = tsere.filter(r => !r.ok);

  /* ===== מסך ===== */
  say('');
  for (const r of all) {
    say(`  ${r.lang}/${r.set}${r.cfgKey ? ' + ' + r.cfgKey : ''} · EFF=${r.depth} · ${r.forms} צורות · ` +
      `${r.pairs + (r.rulePairs || 0)} זוגות נבדקו · ${r.collisions.length} חדשות · ${r.baseline.length} של היום · ${(r.sameWord || []).length} אותה מילה`);
  }
  say(`  נרדפות · ${syn.groups}/${syn.total || 0} קבוצות מאושרות · ${syn.hits.length} התנגשויות חדשות` +
    (syn.error ? ` · שגיאה: ${syn.error}` : ''));
  say(`  צירה · ${tsere.length - tsereBad.length}/${tsere.length} זוגות נשארים דחויים`);
  say('');
  say(`  סה"כ ${totalCards} ערכים · ${totalCands} מועמדים · **${totalPairs}** זוגות הגיעו לחישוב מרחק`);

  const fail = newHits.length > 0 || tsereBad.length > 0;

  /* ===== הדוח ===== */
  p('# שער כל המאגר · אפס התנגשויות חדשות');
  p('');
  p(`נוצר: ${new Date().toISOString()} · ‏\`node typo-lab/bank_gate.js\``);
  p('');
  p('## הטענה');
  p('');
  p('לכל ערך A ולכל ערך **אחר** B: שום צורה שמתקבלת עבור B, ושום וריאציה שהדאטהסט מתייג');
  p('ראויה-לקבל עבור B, אינה מתקבלת על הכרטיס של A · אלא אם B חולק פירוש עם A (‏glossAlts).');
  p('זהו סטנדרט ההוכחה שכתוב ב-app.js:781 ("zero new collisions across all 1,719 Hebrew terms").');
  p('');
  p('## מה נבדק');
  p('');
  p(`· פרמטרים: \`out/typo-rules.json\` ver=\`${P.ver}\` · טביעת אצבע \`${P.fp}\` · enabled=${P.enabled}`);
  p(`· חוק צד-הפירוש: \`${cfg.key}\` · ${cfg.label}`);
  p(`· נרדפות: ${syn.groups} קבוצות בסטטוס approved מתוך ${syn.total || 0}`);
  p(`· דאטהסט: ${dsRowCount} שורות` + (dsBad ? ` (${dsBad} לא נפרסו)` : '') + (dsMissing.length ? ` · חסר: ${dsMissing.join(', ')}` : ''));
  p('');
  p('| שכבה | EFF | צורות | מועמדים | זוגות שחושבו | חדשות | של היום | אותה מילה |');
  p('|---|---|---|---|---|---|---|---|');
  for (const r of all) {
    p(`| ${r.lang}/${r.set}${r.cfgKey ? ' + ' + r.cfgKey : ''} | ${r.depth} | ${r.forms} | ${r.cands} | ${r.pairs + (r.rulePairs || 0)} | ${r.collisions.length} | ${r.baseline.length} | ${(r.sameWord || []).length} |`);
  }
  p(`| נרדפות · ${syn.groups} קבוצות | · | · | · | · | ${syn.hits.length} | · | · |`);
  p('');
  p(`**${totalPairs}** זוגות (צורה, כרטיס) הגיעו לחישוב מרחק אמיתי, מתוך ${totalCands} מועמדים`);
  p(`שהמסנן העלה, על ${totalCards} ערכים.`);
  p('');
  p('הסינון נגזר מהפרמטרים ואינו היוריסטי: ‏EFF = min(MAX_OPS, floor(max(t)/min(W))) חוסם');
  p('את מספר הפעולות, ומעליו אינדקס-מחיקות שהוא שלם למרחק לוונשטיין. זוג שנפל מהמסנן');
  p('אינו יכול היה להתקבל, ולכן הספירה היא הוכחה ולא מדגם.');
  p('');
  p('## התנגשויות חדשות');
  p('');
  if (!newHits.length) p('**אפס התנגשויות חדשות.**');
  else {
    p(`**${newHits.length} התנגשויות חדשות. אין להעלות.**`);
    p('');
    p('| שפה | כיוון | כרטיס | יחידה | הוקלד | הפולש |');
    p('|---|---|---|---|---|---|');
    for (const h of newHits) p(`| ${h.lang} | ${h.dir} | ${h.card} | ${h.unit == null ? '?' : h.unit} | ${h.typed} | ${h.intruder} |`);
  }
  p('');
  p('## קבלות חוצות-ערכים שקיימות היום (‏via=exact)');
  p('');
  p('אלה אינן תוצר של השכבה החדשה: זו ההתנהגות של האפליקציה כמו שהיא, והן מדווחות כאן');
  p('כדי שלא ייבלעו לתוך המספר של ההתנגשויות החדשות.');
  p('');
  if (!baseHits.length) p('אין.');
  else {
    p(`${baseHits.length} מקרים. הראשונים:`);
    p('');
    p('| שפה | כיוון | כרטיס | הוקלד | הפולש |');
    p('|---|---|---|---|---|');
    for (const h of baseHits.slice(0, 40)) p(`| ${h.lang} | ${h.dir} | ${h.card} | ${h.typed} | ${h.intruder} |`);
    if (baseHits.length > 40) p(`| ... | | ועוד ${baseHits.length - 40} | | |`);
  }
  p('');
  p('## אותה מילה, שני ערכים');
  p('');
  p('קבלות שבהן הערך "הפולש" חולק עם הכרטיס צורה קבילה · כלומר אותה מילה מופיעה במאגר');
  p('פעמיים (יחידה אחרת, או חלופת כתיב בתוך ערך אחר). וריאציה שלה היא וריאציה של המילה');
  p('של הכרטיס עצמו, ולכן אינה התנגשות. מה שכן נשאר אדום: מחרוזת שהיא **צורה קבילה** של');
  p('הערך האחר ואינה צורה קבילה של הכרטיס.');
  p('');
  if (!sameHits.length) p('אין.');
  else {
    p(`${sameHits.length} מקרים. הראשונים:`);
    p('');
    p('| שפה | כיוון | כרטיס | הוקלד | הערך החולק |');
    p('|---|---|---|---|---|');
    for (const h of sameHits.slice(0, 25)) p(`| ${h.lang} | ${h.dir} | ${h.card} | ${h.typed} | ${h.intruder} |`);
    if (sameHits.length > 25) p(`| ... | | ועוד ${sameHits.length - 25} | | |`);
  }
  p('');
  p('## הכיוון ההפוך · חמשת זוגות הצירה שהוחזרו');
  p('');
  p('‏app.js:687 מתעד כלל צירה שנוסה והוחזר, מפני שהוא הצית חמש התנגשויות אמיתיות.');
  p('הזוגות האלה חייבים להמשיך לדחות זה את זה גם תחת הסובלנות החדשה.');
  p('');
  p('| זוג | פסק | פירוט |');
  p('|---|---|---|');
  for (const r of tsere) p(`| ${r.a} ~ ${r.b} | ${r.ok ? '✅ נדחה' : '⛔'} | ${r.note} |`);
  p('');
  p('## פסק דין');
  p('');
  p(fail
    ? `⛔ אדום · ${newHits.length} התנגשויות חדשות, ${tsereBad.length} זוגות צירה נפרצו.`
    : `✅ ירוק · אפס התנגשויות חדשות על ${totalCards} ערכים, ${totalPairs} זוגות שחושבו, וחמשת זוגות הצירה נשארו דחויים.`);
  p('');
  p('## מה השער הזה **אינו** מוכיח');
  p('');
  p('· שלוש השכבות נמדדות זו לצד זו ולא זו דרך זו. הנרדפות נמדדות במודל ההתאמה המדויקת');
  p('  של gate_synonyms, מפני שגם הריצה אינה מרכיבה אותן לתוך המרחק הממושקל.');
  p('· ‏via=exact הוא ההתנהגות של היום, והשער אינו מתיימר לתקן אותה.');
  p('· איכות התוכן, ניסוח ההודעה למשתמש, וההתנהגות בדפדפן אינן נמדדות כאן.');
  p('');
  p(`<!-- bank-gate: ${JSON.stringify({
    ver: P.ver, paramsFp: P.fp, enabled: P.enabled, cfg: cfg.key,
    cards: totalCards, candidates: totalCands, pairs: totalPairs,
    newCollisions: newHits.length, baselineExact: baseHits.length, sameWord: sameHits.length,
    synonymGroups: syn.groups, tsereRejected: tsere.length - tsereBad.length, tserePairs: tsere.length,
    layers: all.map(r => ({ lang: r.lang, set: r.set, eff: r.depth, forms: r.forms, pairs: r.pairs + (r.rulePairs || 0), collisions: r.collisions.length })),
    pass: !fail,
  })} -->`);

  fs.writeFileSync(MD_PATH, md.join('\n') + '\n', 'utf8');

  const wall = ((Date.now() - T0) / 1000).toFixed(1);
  say('');
  say(`נכתב out/${path.basename(MD_PATH)} · ${wall} שניות`);
  if (fail) {
    say(`⛔ ${newHits.length} התנגשויות חדשות · ${tsereBad.length} זוגות צירה נפרצו`);
    for (const h of newHits.slice(0, 20)) say(`   [${h.lang}/${h.dir}] "${h.typed}" מתקבל על "${h.card}" · שייך ל-${h.intruder}`);
    for (const r of tsereBad) say(`   [צירה] ${r.a} ~ ${r.b} · ${r.note}`);
    process.exit(1);
  }
  say(`✅ אפס התנגשויות חדשות · ${totalCards} ערכים · ${totalPairs} זוגות שחושבו`);
  process.exit(0);
}

if (require.main === module) main();

/* ‏expandOf מיוצא כדי שהחיפוש יוכל לבנות את אותה קבוצת-הרחבה שהשער בודק, במקום
   לכתוב אותה מחדש. זו בדיוק הסיבה שהשער דחה את מועמד ה-gloss הראשון: הכושר של ה-GA
   אינו מדלל את ערוץ B1, ולכן החיפוש הציע נקודה שהשער פוסל. מקור אמת אחד לשני הצדדים. */
module.exports = { effOps, delVariants, makeNear, shipParams, fingerprint, TSERE, expandOf, morphSweep, langModel, scanDataset };
