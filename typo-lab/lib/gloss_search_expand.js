'use strict';
/* gloss_search_expand.js · הנקודה העיוורת של סט הפירושים, ואיך סוגרים אותה
 *
 * ===== מה קרה =====
 *
 * המועמד הקודם נפל ב-bank_gate על שתי התנגשויות:
 *   ‏[he/gloss] "רסיס עצ" התקבל על "אֵגֶל" · שייך ל-שבב
 *   ‏[he/gloss] "משא כבד" התקבל על "יָצוּעַ" · שייך ל-עול
 *
 * שתיהן מגיעות דרך **תוצרי ההרחבה של חוק B1** (‏splitOr/distributive · פיצול "או"
 * מחלק). תוצר הרחבה אינו מקטע פירוש גולמי, ולכן הוא:
 *   · אינו נמצא באינדקס המקטעים ‏(IX.seg) ולכן **שולי הדו-משמעות אינם רואים אותו**,
 *   · ואינו נמצא במפת הבעלים של buildCrossCard ולכן **קבוצת השליליות אינה רואה אותו**.
 * שתי השכבות שאמורות לתפוס בדיוק את זה עיוורות לו בו-זמנית · ולכן "0 שורות חוצות
 * כרטיסים ב-gloss" לא היה סימן לבטיחות אלא סימן לנקודה עיוורת.
 *
 * ===== מה הקובץ הזה עושה =====
 *
 * ‏1 · בונה מחדש את קבוצת השליליות החוצות-כרטיסים כשקבוצת הצורות כוללת גם את **תוצרי
 *     ההרחבה** של כל כרטיס, בדיוק כפי ש-glossSweep בשער בונה אותה.
 * ‏2 · משכפל את סריקת השער בקוד (‏sweepGloss) על **הבודק האמיתי**, כדי שאפשר יהיה
 *     לאמת מועמד מקומית לפני שמבזבזים עוד 504 שניות של השער.
 *
 * ⛔ פונקציית ההרחבה **אינה** נכתבת כאן מחדש · היא מיובאת מ-bank_gate.expandOf עם
 *    אותו cfg בדיוק (‏measure_gloss.CONFIGS · B1-union). מימוש שני הוא בדיוק הדרך שבה
 *    המעבדה נסחפת, וזה נאמר במפורש בהוראה.
 *
 * ===== ההבדלים המכוונים מ-evolve.buildCrossCard, ולמה =====
 *
 * ‏א · **בלי פטור ה-share** בכיוון הפירוש. ‏evolve מוותרת על זוג כשהבעלים החיצוני חולק
 *      צורה עם הכרטיס, אבל ‏glossSweep בשער קורא ל-sweep **בלי exemptOf** · כלומר לשער
 *      אין פטור כזה בכיוון הפירוש. הפער הזה הוא בדיוק סוג הפער שמחזיר מועמד מהשער,
 *      ולכן כאן מיושר לשער (מחמיר יותר).
 * ‏ב · **‏today נקבע לפי meaningMatch ולא לפי keysPlus.** ‏acceptGloss מחזירה
 *      ‏via='exact' **אך ורק** כש-ctx.meaningMatch מתקיימת (lib/checker.js), וכל שאר
 *      הקבלות הן via='typo' · כלומר בדיוק הפסק האדום של השער. לכן הדגל שהמנוע המהיר
 *      מסמן כ"מתקבל היום" חייב להיות אותה פונקציה עצמה, ולא קירוב שלה.
 *
 * שני ההבדלים מחמירים ואינם מקלים · הם יכולים רק להוסיף שליליות, לא להסיר.
 */

const BG = require('../bank_gate.js');
const MG = require('../measure_gloss.js');
const { BY_NAME } = require('./glossrules.js');
const { isVetoedTerm, isVetoedSeg } = require('./veto.js');
const { opVectors, wEditDist, OP_KEYS, UNIT_W } = require('./wdist.js');
const { makeChecker, normalizeParams, nearestOther, letters, lexVetoed, MAX_OPS, MAX_CANDS } = require('./checker.js');

const CAND_K = MAX_CANDS, CAND_CAP = MAX_OPS;

/* החוק שהשער בודק · נקרא מהמקור ולא מוקלד כאן. */
const CFG = MG.CONFIGS.find(c => c.key === 'B1-union');
if (!CFG) throw new Error('gloss_search_expand: B1-union לא נמצא ב-measure_gloss.CONFIGS');
const RULE = BY_NAME.get(CFG.rule);
if (!RULE) throw new Error(`gloss_search_expand: החוק ${CFG.rule} אינו רשום ב-glossrules`);
const RULE_PARAMS = Object.assign({}, RULE.defaults, CFG.params);

/* תוצרי ההרחבה של כרטיס · אותה קריאה בדיוק של glossSweep, כולל הנרמול. */
function expansionOf(ctx, segs) {
  const out = [];
  for (const s of BG.expandOf(RULE, segs, ctx, RULE_PARAMS)) {
    const k = ctx.norm(s);
    if (k) out.push(k);
  }
  return out;
}

/* מודל כרטיסים · אותם שדות שגם bank_gate.langModel וגם buildCrossCard בונים. */
function cardInfo(langs, lang) {
  const L = langs[lang], ctx = L.ctx;
  const info = Array.from(ctx.BANK).map(w => {
    const owner = ctx.K(w.term);
    const allowed = new Set([owner]);
    for (const t of Array.from(ctx.glossAlts(w))) { const k = ctx.K(t); if (k) allowed.add(k); }
    return { w, owner, term: w.term, unit: w.unit, allowed, keys: L.keysOf(w), segs: L.segsOf(w) };
  });
  const byKey = new Map();
  for (const e of info) if (!byKey.has(e.owner)) byKey.set(e.owner, e);
  for (const e of info) {
    const s = new Set(e.keys);
    for (const t of Array.from(ctx.glossAlts(e.w))) {
      const g = byKey.get(ctx.K(t));
      if (g) for (const k of g.keys) s.add(k);
    }
    e.keysPlus = s;
  }
  return { L, ctx, info, byKey };
}

/* ===== קבוצת הצורות · מי הבעלים של כל מחרוזת =====
 * הסדר זהה ל-buildCrossCard: קודם הצורות של כל הכרטיסים, אחר כך (בכיוון הפירוש, אם
 * מבקשים) תוצרי ההרחבה, ואחר כך צורות הדאטהסט. הסדר קובע את סדר forms ולכן את הבעלים
 * החיצוני הראשון שנבחר · ולכן הוא נשמר ולא "בערך".
 */
function formUniverse(model, dir, perSet, lang, withExpansion) {
  const { ctx, info, L } = model;
  const owners = new Map(), keyOwners = new Map();
  const put = (f, o) => { if (!f || !o) return; let s = owners.get(f); if (!s) { s = new Set(); owners.set(f, s); } s.add(o); };
  const formsOf = e => (dir === 'gloss' ? e.segs : e.keys);
  for (const e of info) for (const k of formsOf(e)) {
    put(k, e.owner);
    let s = keyOwners.get(k); if (!s) { s = new Set(); keyOwners.set(k, s); } s.add(e.owner);
  }
  let fromRule = 0;
  const expanded = new Map();
  if (dir === 'gloss' && withExpansion) {
    for (const e of info) {
      const ex = expansionOf(ctx, e.segs);
      expanded.set(e, ex);
      for (const k of ex) { if (!owners.has(k)) fromRule++; put(k, e.owner); }
    }
  }
  const set = dir === 'gloss' ? 'gloss' : (lang === 'en' ? 'en-word' : 'he-word');
  let fromDataset = 0;
  for (const r of (perSet[set] || [])) {
    if (r.lang !== lang || r.label !== 'accept') continue;
    const card = L.byCard.get(r.term + '|' + r.unit);
    if (!card) continue;
    if (!owners.has(r.typedKey)) fromDataset++;
    put(r.typedKey, ctx.K(card.term));
  }
  return { owners, keyOwners, expanded, fromRule, fromDataset, set };
}

/* ===== בניית השליליות ===== */
function buildCross(langs, perSet, opts) {
  const o = opts || {};
  const withExpansion = o.expansion !== false;
  const dirs = o.dirs || ['word', 'gloss'];
  const out = { 'he-word': [], 'en-word': [], gloss: [] };
  const stats = {};

  for (const lang of (o.langs || ['he', 'en'])) {
    const model = cardInfo(langs, lang);
    const { ctx, info } = model;
    const L = langs[lang];

    for (const dir of dirs) {
      const gloss = dir === 'gloss';
      const U = formUniverse(model, dir, perSet, lang, withExpansion);
      const { owners, keyOwners } = U;
      const set = U.set;
      const formsOf = e => (gloss ? e.segs : e.keys);

      const forms = Array.from(owners.keys());
      const NI = BG.makeNear(forms, CAND_CAP, 24);
      let pairs = 0, kept = 0, blocked = 0, todayRows = 0, unreach = 0;

      for (const e of info) {
        const src = formsOf(e);
        if (!src.length) continue;
        const seen = new Set();
        for (const k of src) for (const i of NI.near(k)) seen.add(i);
        const share = new Set();
        for (const k of src) { const s = keyOwners.get(k); if (s) for (const q of s) share.add(q); }
        const own = new Set(src);

        for (const i of seen) {
          const f = forms[i];
          let outside = null;
          for (const q of owners.get(f)) {
            if (e.allowed.has(q)) continue;
            /* ‏א · פטור ה-share קיים בכיוון המונח (כמו evolve) ואינו קיים בכיוון
               הפירוש (כמו השער · sweep נקראת שם בלי exemptOf). */
            if (!gloss && share.has(q)) { const ko = keyOwners.get(f); if (!(ko && ko.has(q) && !own.has(f))) continue; }
            outside = q; break;
          }
          if (outside == null) continue;
          if (!gloss && e.keysPlus.has(f)) { todayRows++; continue; }
          pairs++;

          const vetoed = gloss ? isVetoedSeg(f, e.w, L.veto, ctx) : isVetoedTerm(f, e.w, L.veto, ctx);
          if (vetoed) { blocked++; continue; }
          let inflect = false;
          if (!gloss) for (const c of src) {
            if (f.length <= c.length || !f.startsWith(c)) continue;
            if (L.suffixes.includes(f.slice(c.length))) { inflect = true; break; }
          }
          if (inflect) { blocked++; continue; }
          if (lexVetoed(f, src, gloss ? 'he' : lang, L.veto)) { blocked++; continue; }

          let dOwn = 99;
          const scored = [];
          for (const c of src) {
            if (Math.abs(f.length - c.length) > CAND_CAP) continue;
            const raw = ctx.editDist(f, c);
            if (raw < dOwn) dOwn = raw;
            if (raw > CAND_CAP) continue;
            const vs = opVectors(f, c, CAND_CAP);
            if (!vs.length) continue;
            scored.push({ len: letters(c), raw, vecs: vs, key: c });
          }
          if (!scored.length) continue;
          scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

          const allow = gloss ? L.allowSeg(e.w) : L.allowTerm(e.w);
          const dOtherRaw = nearestOther(f, gloss ? L.IX.seg : L.IX.term, allow, ctx);
          const dOtherV = isFinite(dOtherRaw) ? dOtherRaw : 9;
          if ((dOtherV - Math.min(dOwn, 9)) < 1) { unreach++; continue; }
          let reach = false;
          for (const s of scored.slice(0, CAND_K)) {
            for (const v of s.vecs) {
              let c = 0;
              for (const k of OP_KEYS) c += v[k] * (k === 'sub' ? 1 : 0.2);
              if (c <= 3) { reach = true; break; }
            }
            if (reach) break;
          }
          if (!reach) { unreach++; continue; }

          /* ‏ב · הדגל "מתקבל היום" · אותה פונקציה שהבודק עצמו בודק כדי להחזיר
             ‏via='exact'. שורה כזאת נספרת ב-faToday ולא ב-faOwn, וזה בדיוק ההבדל בין
             "התנגשות חדשה" ל"התנהגות קיימת" בשער. */
          const today = gloss ? !!ctx.meaningMatch(f, e.w.meaning) : false;
          if (today) todayRows++;

          out[set].push({
            lang, set, op: 'cross/bank', label: 'reject', why: 'cross-card-bank', trusted: true,
            fold: -1, holdout: false, term: e.term, unit: e.unit, key: src[0], typed: f, typedKey: f,
            intruder: outside,
            vetoed: false, lexVetoed: false, today, inflect: false,
            dOwn: Math.min(dOwn, 9), dOther: dOtherV,
            tLen: letters(f), kLen: letters(src[0]), cands: scored.slice(0, CAND_K)
          });
          kept++;
        }
      }
      stats[`${lang}/${dir}`] = {
        forms: forms.length, fromRule: U.fromRule, fromDataset: U.fromDataset,
        pairs, kept, blocked, unreachable: unreach, todayRows, expansion: gloss && withExpansion
      };
    }
  }
  return { rows: out, stats, cfgKey: CFG.key };
}

/* ===== שכפול סריקת השער · הבודק האמיתי, לא הקירוב =====
 *
 * ‏glossSweep אינה מיוצאת מ-bank_gate, ולכן הלולאה הזאת נכתבת כאן · וזה **מכויל** ולא
 * מוצהר: ‏--selftest מריץ אותה על הפרמטרים שכשלו בשער ודורש שהיא תמצא בדיוק את שתי
 * ההתנגשויות שהשער דיווח עליהן, בשמן. שכפול שאינו משחזר את הכשל הידוע אינו שכפול.
 *
 * ‏depth · כאן MAX_OPS ולא effOps(P). זהו על-חסם: קבלה פאזית דורשת מרחק גולמי
 * ‏<= MAX_OPS, ולכן סריקה בעומק MAX_OPS היא על-קבוצה של כל מה שהשער מכריע, לכל P.
 * מחמיר ולא מקל · וזו הבחירה הנכונה כשמאמתים לפני שער יקר.
 */
function sweepGloss(langs, perSet, params, opts) {
  const o = opts || {};
  const P = normalizeParams(params);
  const results = [];
  for (const lang of (o.langs || ['he', 'en'])) {
    const model = cardInfo(langs, lang);
    const { ctx, info } = model;
    const L = langs[lang];
    const U = formUniverse(model, 'gloss', perSet, lang, o.expansion !== false);
    const forms = Array.from(U.owners.keys());
    const ownerOf = forms.map(f => U.owners.get(f));
    const NI = BG.makeNear(forms, MAX_OPS, 24);
    const ck = makeChecker(P, ctx, L.veto, lang);

    let pairs = 0, decided = 0;
    const collisions = [], baseline = [];
    for (const e of info) {
      const src = e.segs;
      if (!src.length) continue;
      const bag = new Set();
      for (const k of src) NI.near(k, bag);
      for (const i of bag) {
        let outside = null;
        for (const q of ownerOf[i]) if (!e.allowed.has(q)) { outside = q; break; }
        if (outside == null) continue;
        pairs++;
        const f = forms[i];
        let d = Infinity;
        for (const k of src) {
          if (Math.abs(f.length - k.length) > MAX_OPS) continue;
          const x = wEditDist(f, k, UNIT_W, MAX_OPS);
          if (x < d) d = x;
          if (!d) break;
        }
        if (!(d <= MAX_OPS)) continue;
        decided++;
        const v = ck.acceptGloss(f, e.w);
        if (!v.ok) continue;
        const hit = { lang, card: e.term, unit: e.unit, typed: f, intruder: outside, via: v.via || null, dist: v.dist == null ? null : v.dist };
        if (v.via === 'typo') collisions.push(hit); else baseline.push(hit);
      }
    }
    results.push({ lang, forms: forms.length, fromRule: U.fromRule, fromDataset: U.fromDataset, pairs, decided, collisions, baseline });
  }
  return {
    cfgKey: CFG.key,
    langs: results,
    collisions: results.reduce((a, r) => a.concat(r.collisions), []),
    baselineCount: results.reduce((a, r) => a + r.baseline.length, 0),
    pairs: results.reduce((a, r) => a + r.pairs, 0),
    decided: results.reduce((a, r) => a + r.decided, 0)
  };
}

module.exports = { CFG, RULE, RULE_PARAMS, expansionOf, cardInfo, formUniverse, buildCross, sweepGloss, CAND_K, CAND_CAP };
