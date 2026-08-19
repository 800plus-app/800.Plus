'use strict';
/* מדידת **עלות שולית לכל מקרה** · ארבעת המקרים המורפולוגיים שנשארו פתוחים.
 *
 *   node typo-lab/morph_cases.js              · המדידה המלאה → out/morph-cases-report.md
 *   node typo-lab/morph_cases.js --selftest   · שיניים · כל שער עם הרצה שאמורה להיפסל
 *   node typo-lab/morph_cases.js --gate=<key> · ערוץ המורפולוגיה של bank_gate על מועמד
 *
 * ===== במה זה שונה מ-measure_morph.js =====
 *
 * ‏`measure_morph.js` מודד **כללים**: מגדירים יחס דקדוקי, מחילים אותו על כל המאגר,
 * וסופרים התנגשויות. ‏28 וריאנטים נמדדו כך וכולם נדחו. הקובץ הזה עושה את ההפך:
 * לכל אחד מארבעת המקרים הפתוחים בנפרד, מהו התנאי ה**צר ביותר** שגורם למחרוזת הזאת
 * להתקבל על הכרטיס הזה, וכמה **עוד** מחרוזות במאגר כולו מקיימות בדיוק את אותו תנאי.
 *
 * ההבדל אינו סגנוני · הוא שני תאים שמעולם לא נמדדו:
 *   1. כל 11 זוגות המשקלים נמדדו **דו-כיוונית**. ‏`P-act-agent` מקבל גם "מורד" על
 *      מקטע "מרדנ" (מה שמקרה 4 צריך) וגם "פחדנ" על מקטע "פוחד" (מה שאיש לא ביקש).
 *      חצי חוק אינו חוק, והמחיר שלו אינו נגזר מהמספר המצרפי.
 *   2. כל 11 הזוגות נמדדו עם `strictRoot:true` בלבד. השורש של מקרה 8 הוא **עיפ** ·
 *      שורש ל"י · ולכן המקרה כולו נופל מחוץ למה שנמדד.
 *
 * ===== מקור אמת אחד · אין מימוש שני של המדידה =====
 *
 * המקרים 4, 8, 14 הם "מילה בודדת מוקלדת", ולכן יקום ההתנגשות שלהם הוא **בדיוק** זה
 * של `measure_morph` (‏`SINGLE`, שלמותו אומתה שם מול `meaningMatch` על 120,000 זוגות
 * לכל שפה). לכן הם נמדדים על ידי `measure_morph.measureRisk` **עצמה**, דרך הזרקת
 * החוק לרשימת החוקים · ולא על ידי העתק שלה. שער T1 מוכיח את זה: הוא מריץ את המסלול
 * הזה על `P-act-agent` וחייב לקבל את המספרים שכתובים ב-`out/morph-report.md`
 * ספרה-ספרה, ומדגים אדום על וריאנט שאמור לתת מספר אחר.
 *
 * מקרה 23 אינו כזה: התשובה שלו היא **שתי מילים**, ו-`SINGLE` הוא יקום של מילה אחת.
 * לכן הוא נמדד במנוע נפרד שנכתב כאן, ושתי טענותיו נבדקות ולא מונחות (שערים T3, T4, T6).
 *
 * ===== מה נספר כהתנגשות · אותה הגדרה בדיוק, בלי הרפיה =====
 *
 * מחרוזת שהתנאי מוסיף לכרטיס A, והיא **תשובה קבילה היום** של כרטיס B ≠ A שאינו נרדף
 * שלו. אותה הגדרה של `measure_morph`, אותו פטור-נרדפות (`glossAlts`), ואותו ווטו
 * (`isVetoedSeg`). כל התנגשות מודפסת **בשמה**, וכל אחת מאומתת אחת-אחת מול
 * `meaningMatch` האמיתית של הבעלים · לא מוסקת מאינדקס.
 */

const fs = require('fs');
const path = require('path');

const { isVetoedSeg } = require('./lib/veto.js');
const M = require('./lib/morphrules.js');
const MM = require('./measure_morph.js');
const { CASES24 } = require('./measure_gloss.js');

const OUT = path.join(__dirname, 'out');
const LANGS = ['he', 'en'];
const MATRES = M.MATRES;                        // 'אהוי'
const PARTICLE = 'הלבכו';                        // app.js:1799
const SEP1 = String.fromCharCode(1);            // מפריד לחתימות · לא מופיע בטקסט
const EX_CAP = 60;                              // כמה התנגשויות מוצגות בשמן לכל וריאנט

const words = s => String(s).split(/\s+/).filter(Boolean);

const OPEN = [4, 8, 14, 23];
const CASE = new Map(CASES24.filter(c => OPEN.includes(c.n)).map(c => [c.n, c]));

/* =====================================================================
 * 1 · בוני החוקים · חוזה זהה לזה של lib/morphrules.js
 * ===================================================================== */

/* השורש מוחזר מ-`M.matchTemplate` כשרשור הסלוטים לפי סדר, ולכן אפשר להחיל מגבלת
   אם-קריאה **לפי סלוט** בלי לשכפל את המנוע: `strictSlots:[1,3]` דורש ששורש 1 ו-3
   יהיו עיצורים ומתיר אם-קריאה בסלוט 2. זה בדיוק מה שמקרה 8 צריך (עיפ · י' באמצע),
   וזה מה ש-`strictRoot` הגורף חוסם. */
function rootOK(root, p) {
  if (p.strictRoot) { for (const ch of root) if (MATRES.includes(ch)) return false; }
  if (p.strictSlots) { for (const d of p.strictSlots) { const ch = root[d - 1]; if (ch === undefined || MATRES.includes(ch)) return false; } }
  return true;
}

const PAIR_BY_ID = new Map(M.BINYAN_PAIRS.map(x => [x.id, x]));

/* חוק זוג-משקלים **חד-כיווני**: המקטע חייב לשבת על צד אחד מוגדר, והתשובה על השני.
   segSide/typedSide הם 'a' או 'b' של הזוג כפי שהוא כתוב ב-morphrules.js.
   noParticleSeg · מילת מקטע שמתחילה באות יחס (הלבכו) אינה בסיס משקל אלא תחילית ועוד
   גוף. בלעדיו "לשמנ" (ל+שמן, הפועל של oil) נקרא כ-קַטְלָן של שורש בדוי ל-ש-מ.
   head · צד המקטע הוא **מילת התוכן הראשונה** של מקטע רב-מילי במקום מקטע בן מילה. */
function dirPairRule(key, pairId, o) {
  const pr = PAIR_BY_ID.get(pairId);
  if (!pr) throw new Error('morph_cases: pair not found - ' + pairId);
  const segTpl = pr[o.segSide], typedTpl = pr[o.typedSide];
  const segKey = (w, p) => {
    if (!w || w.length !== segTpl.length) return null;
    if (p.noParticleSeg && w.length > 3 && PARTICLE.includes(w[0])) return null;
    const r = M.matchTemplate(w, segTpl, false);
    return (r && rootOK(r, p)) ? pairId + ':' + r : null;
  };
  const typedKey = (w, p) => {
    if (!w || w.length !== typedTpl.length) return null;
    const r = M.matchTemplate(w, typedTpl, false);
    return (r && rootOK(r, p)) ? pairId + ':' + r : null;
  };
  const segWordsOf = (segs, ctx, p) => {
    const out = [];
    for (const seg of segs) {
      const W = words(seg);
      if (p.head) {
        const C = M.contentOf(W, ctx);
        if (C.length < 2) continue;                        // מקטע בן מילת תוכן אחת · תפקידו של החוק השני
        if (p.maxContent && C.length > p.maxContent) continue;
        out.push(C[0]);
      } else { if (W.length !== 1) continue; out.push(W[0]); }
    }
    return out;
  };
  return {
    id: key, name: 'mc_' + key.replace(/[^A-Za-z0-9]/g, '_'), cls: 'MC', kind: 'gen',
    he: pr.he + ' | ' + o.segSide + '->' + o.typedSide + (o.head ? ' | head' : ''),
    defaults: { strictRoot: false, strictSlots: null, noParticleSeg: false, head: !!o.head, maxContent: 0 },
    keysTyped(typed, ctx, p) { const W = words(typed); if (W.length !== 1) return new Set(); const k = typedKey(W[0], p); return k ? new Set([k]) : new Set(); },
    keysSeg(segs, ctx, p) { const out = new Set(); for (const w of segWordsOf(segs, ctx, p)) { const k = segKey(w, p); if (k) out.add(k); } return out; },
    accepts(typed, segs, ctx, p) {
      const a = this.keysTyped(typed, ctx, p); if (!a.size) return false;
      const b = this.keysSeg(segs, ctx, p);
      for (const x of a) if (b.has(x)) return true;
      return false;
    },
    /* המנייה המלאה · לכל מילת-מקטע כשרה, המחרוזת האחת שהתנאי מוסיף. קבוצה סופית,
       קטנה, וניתנת להצגה בשמה · וזה מה שנותן ל-measureRisk את עמודת המנייה. */
    expand(segs, ctx, p) {
      const out = new Set();
      for (const w of segWordsOf(segs, ctx, p)) {
        const k = segKey(w, p); if (!k) continue;
        const v = M.fillTemplate(typedTpl, k.slice(pairId.length + 1));
        if (v) out.add(v);
      }
      for (const s of segs) out.delete(s);
      return out;
    },
  };
}

/* החוק הדו-כיווני של morphrules, עטוף בשם משלנו · משמש כעוגן לשחזור morph-report. */
function bidiPairRule(key, pairId, params) {
  const base = M.binyanPair;
  return {
    id: key, name: 'mc_' + key.replace(/[^A-Za-z0-9]/g, '_'), cls: 'MC', kind: 'gen',
    he: (PAIR_BY_ID.get(pairId) || {}).he + ' | bidirectional',
    defaults: Object.assign({ pairs: [pairId], strictRoot: false }, params || {}),
    keysTyped(t, ctx, p) { return base.keysTyped(t, ctx, p); },
    keysSeg(s, ctx, p) { return base.keysSeg(s, ctx, p); },
    accepts(t, s, ctx, p) { return base.accepts(t, s, ctx, p); },
    expand(s, ctx, p) { return base.expand(s, ctx, p); },
  };
}

/* איחוד של שני תנאים · "מה שהיה נשלח בפועל" כשמקרה דורש גם מקטע-מילה וגם ראש-מקטע. */
function unionRule(key, parts) {
  return {
    id: key, name: 'mc_' + key.replace(/[^A-Za-z0-9]/g, '_'), cls: 'MC', kind: 'gen',
    he: parts.map(x => x.rule.he).join('  +  '),
    defaults: {},
    keysTyped(t, ctx) { const o = new Set(); for (const q of parts) for (const k of q.rule.keysTyped(t, ctx, q.p)) o.add(q.rule.id + '|' + k); return o; },
    keysSeg(s, ctx) { const o = new Set(); for (const q of parts) for (const k of q.rule.keysSeg(s, ctx, q.p)) o.add(q.rule.id + '|' + k); return o; },
    accepts(t, s, ctx) { for (const q of parts) if (q.rule.accepts(t, s, ctx, q.p)) return true; return false; },
    expand(s, ctx) { const o = new Set(); for (const q of parts) for (const v of q.rule.expand(s, ctx, q.p)) o.add(v); for (const x of s) o.delete(x); return o; },
  };
}

/* =====================================================================
 * 2 · הווריאנטים · שלושת המקרים בני מילה אחת
 * ===================================================================== */

const R = {};
/* מקרה 4 · סוֹרֵר "מרדן, סרבן, חסר משמעת" ← "מורד" */
R['C4-bidi'] = { rule: bidiPairRule('C4-bidi', 'act-agent', { strictRoot: true }), params: {}, case: 4, label: 'קוֹטֵל ↔ קַטְלָן · דו-כיווני · = `P-act-agent` בדוח הקודם' };
R['C4-dir'] = { rule: dirPairRule('C4-dir', 'act-agent', { segSide: 'b', typedSide: 'a' }), params: { strictRoot: true }, case: 4, label: 'מקטע `123נ` → תשובה `1ו23` · **כיוון אחד בלבד**' };
R['C4-dir-np'] = { rule: dirPairRule('C4-dir-np', 'act-agent', { segSide: 'b', typedSide: 'a' }), params: { strictRoot: true, noParticleSeg: true }, case: 4, label: 'כיוון אחד + מילת המקטע אינה פותחת באות יחס' };

/* מקרה 8 · לֵאוּת "יגעות, עייפות, תשישות" ← "עייף" */
R['C8-sr'] = { rule: bidiPairRule('C8-sr', 'adj-abs', { strictRoot: true }), params: {}, case: 8, label: 'תואר ↔ שם מופשט · דו-כיווני, שורש שלם · = `P-adj-abs` בדוח · **אינו פותר את 8**' };
R['C8-bidi'] = { rule: bidiPairRule('C8-bidi', 'adj-abs', { strictRoot: false }), params: {}, case: 8, label: 'תואר ↔ שם מופשט · דו-כיווני, גם שורש חלש · **התא שלא נמדד**' };
R['C8-dir'] = { rule: dirPairRule('C8-dir', 'adj-abs', { segSide: 'b', typedSide: 'a' }), params: {}, case: 8, label: 'מקטע `1י23ות` → תשובה `1י23` · כיוון אחד' };
R['C8-dir-s13'] = { rule: dirPairRule('C8-dir-s13', 'adj-abs', { segSide: 'b', typedSide: 'a' }), params: { strictSlots: [1, 3] }, case: 8, label: 'כיוון אחד + שורש 1 ו-3 עיצורים · רק סלוט 2 רשאי להיות אם קריאה' };

/* מקרה 14 · הִתְעַרְטֵל "פשט את בגדיו; חשף את רגשותיו" ← "התפשט" · המקטע **רב-מילי** */
R['C14-w1'] = { rule: dirPairRule('C14-w1', 'pa-hit', { segSide: 'a', typedSide: 'b' }), params: { strictRoot: true }, case: 14, label: 'מקטע בן מילה אחת `123` → `הת123` · **אינו פותר את 14**' };
R['C14-head'] = { rule: dirPairRule('C14-head', 'pa-hit', { segSide: 'a', typedSide: 'b', head: true }), params: { strictRoot: true }, case: 14, label: 'ראש מקטע רב-מילי `123` → `הת123` · **התוספת השולית של 14**' };
R['C14-head-2'] = { rule: dirPairRule('C14-head-2', 'pa-hit', { segSide: 'a', typedSide: 'b', head: true }), params: { strictRoot: true, maxContent: 2 }, case: 14, label: 'כמו הקודם, רק מקטע בן **שתי** מילות תוכן' };
R['C14-both'] = {
  rule: unionRule('C14-both', [
    { rule: dirPairRule('u1', 'pa-hit', { segSide: 'a', typedSide: 'b' }), p: { strictRoot: true, head: false, noParticleSeg: false, maxContent: 0 } },
    { rule: dirPairRule('u2', 'pa-hit', { segSide: 'a', typedSide: 'b', head: true }), p: { strictRoot: true, head: true, noParticleSeg: false, maxContent: 0 } },
  ]), params: {}, case: 14, label: 'האיחוד · מה שהיה נשלח בפועל',
};

const SINGLE_KEYS = ['C4-bidi', 'C4-dir', 'C4-dir-np', 'C8-sr', 'C8-bidi', 'C8-dir', 'C8-dir-s13', 'C14-w1', 'C14-head', 'C14-head-2', 'C14-both'];
/* מה כל וריאנט אמור לעשות למקרה שלו · **מקובע**, כדי שהשער יצעק אם זה משתנה.
     'solve' · התנאי מקבל, והווטו אינו חוסם · המקרה נפתר
     'veto'  · התנאי **כן** מקבל, אבל הווטו חוסם · כלומר המחרוזת שייכת לכרטיס אחר
     'no'    · התנאי אינו מקבל בכלל
   ההבחנה בין 'veto' ל-'no' היא כל הממצא של מקרים 8 ו-14, ולכן היא מקובעת ולא נבלעת. */
const EXPECT_SOLVE = {
  'C4-bidi': 'solve', 'C4-dir': 'solve', 'C4-dir-np': 'solve',
  'C8-sr': 'no', 'C8-bidi': 'veto', 'C8-dir': 'veto', 'C8-dir-s13': 'veto',
  'C14-w1': 'no', 'C14-head': 'veto', 'C14-head-2': 'veto', 'C14-both': 'veto',
};
const outcomeOf = s => (s.solved ? 'solve' : (s.why === 'הווטו חוסם' ? 'veto' : 'no'));

/* =====================================================================
 * 3 · המדידה של 4/8/14 · דרך measure_morph.measureRisk עצמה
 * ===================================================================== */

/* הזרקה זמנית לרשימת החוקים של morphrules. זו **לא** נוחות: `measureRisk` בונה את
   הבודק דרך `makeMorphChecker`, שרץ על `RULES`; חוק שאינו שם היה מקבל עמודת רגרסיה
   ריקה שנראית ירוקה. הזרקה + הסרה שומרת על ההתנהגות המקורית לכל השאר. */
function withRule(rule, fn) {
  M.RULES.push(rule); M.BY_NAME.set(rule.name, rule); M.BY_ID.set(rule.id, rule);
  try { return fn(); } finally {
    const i = M.RULES.indexOf(rule); if (i >= 0) M.RULES.splice(i, 1);
    M.BY_NAME.delete(rule.name); M.BY_ID.delete(rule.id);
  }
}

const singleCache = new Map();
function measureSingle(key) {
  if (singleCache.has(key)) return singleCache.get(key);
  const spec = R[key];
  const out = withRule(spec.rule, () => {
    const o = {};
    for (const lang of LANGS) o[lang] = MM.measureRisk(MM.loadLang(lang), { rule: spec.rule.name, params: spec.params });
    return o;
  });
  singleCache.set(key, out);
  return out;
}

function resolveCase(L, c) {
  const ctx = L.ctx;
  const k = ctx.K(c.term);
  let card = L.cards.find(x => x.key === k);
  if (!card) {
    const forms = new Set(Array.from(ctx.heForms(c.term)).map(x => ctx.K(x)));
    card = L.cards.find(x => Array.from(ctx.heForms(x.w.term)).some(v => forms.has(ctx.K(v))));
  }
  if (!card) card = L.cards.find(x => x.w.meaning === c.meaning);
  if (!card) throw new Error('morph_cases: case card not found - ' + c.term);
  return card;
}

function solvesCase(key) {
  const spec = R[key];
  const c = CASE.get(spec.case);
  const L = MM.loadLang('he');
  const card = resolveCase(L, c);
  const ctx = L.ctx;
  const a = ctx.norm(c.typed);
  if (ctx.meaningMatch(a, card.w.meaning)) return { solved: false, why: 'מתקבל היום' };
  const p = Object.assign({}, spec.rule.defaults, spec.params);
  if (!spec.rule.accepts(a, card.segs, ctx, p)) return { solved: false, why: 'התנאי אינו מקבל' };
  const vetoed = isVetoedSeg(a, card.w, L.veto, ctx);
  return { solved: !vetoed, why: vetoed ? 'הווטו חוסם' : 'מתקבל' };
}

/* =====================================================================
 * 4 · מקרה 23 · מנוע רב-מילים
 *
 * ‏דִּידַקְטִי · "שקשור בתחום תורת ההוראה" ← "קשור להוראה".
 * המקטע נושא **ארבע** מילות תוכן, התשובה **שתיים**, ואחת מהן נבדלת בתחילית ש'.
 * ‏particleMatch דורש `A.length === B.length` (app.js:1802) ומקלף רק מ-'הלבכו'
 * (app.js:1799), ולכן **שני** הדברים חסרים. זה לא חוק אחד.
 *
 * ===== שקילות שנבדקה ולא הונחה =====
 * ‏eq של particleMatch הוא `x===y || peel(x)===y || x===peel(y) || peel(x)===peel(y)`.
 * הוא **אינו** יחס שקילות, ולכן קנוניזציה לערך יחיד הייתה מפספסת זוגות. כאן כל מילה
 * מקבלת **קבוצת** קנון `{w} ∪ {peel(w)}`, ומתקיים `eq(x,y) ⟺ הקבוצות נחתכות`.
 * שער T3 מוכיח את זה על כל אוצר המילים העברי ומדגים אדום על קנון בעל ערך יחיד.
 * ===================================================================== */

function peelOf(w, withShin) {
  const out = [];
  if (w.length > 3 && PARTICLE.includes(w[0])) out.push(w.slice(1));
  if (withShin && w.length > 3 && w[0] === 'ש') out.push(w.slice(1));
  return out;
}
const canonSet = (w, withShin) => [w].concat(peelOf(w, withShin));
function eqWords(x, y, shinSeg) {
  const a = canonSet(x, false);                    // צד התשובה · לעולם לא מקלפים ש' מהתשובה
  const b = canonSet(y, shinSeg);                  // צד הפירוש
  for (const u of a) if (b.includes(u)) return true;
  return false;
}

/* התאמה **מדויקת** (backtracking) ולא חמדנית. ‏particleMatch עצמו חמדן, ולכן ההתאמה
   כאן היא **על**-קבוצה שלו · כיוון בטוח למדידת סיכון. כל פגיעה מאומתת בסוף מול
   `meaningMatch` האמיתית, ולכן חיוביים-שגויים אינם נספרים כהתנגשות. */
function subMatch(A, B, shinSeg) {
  if (!A.length || A.length > B.length) return false;
  const used = new Array(B.length).fill(false);
  const go = i => {
    if (i === A.length) return true;
    for (let j = 0; j < B.length; j++) {
      if (used[j] || !eqWords(A[i], B[j], shinSeg)) continue;
      used[j] = true; if (go(i + 1)) return true; used[j] = false;
    }
    return false;
  };
  return go(0);
}

const C23 = {
  'C23-shin': { shin: true, subset: false, minTyped: 1, edges: false, label: "ש' כאות יחס · **בלי** חלקיות" },
  'C23-sub1': { shin: false, subset: true, minTyped: 1, edges: false, label: 'תשובה חלקית · כל תת-קבוצה לא ריקה · **בלי** ש' },
  'C23-sub2': { shin: false, subset: true, minTyped: 2, edges: false, label: 'תשובה חלקית · **שתי** מילות תוכן ומעלה' },
  'C23-sub2e': { shin: false, subset: true, minTyped: 2, edges: true, label: 'תשובה חלקית · ≥2 מילים **ושומרת על הראשונה והאחרונה**' },
  'C23-full': { shin: true, subset: true, minTyped: 2, edges: true, label: "**התנאי הצר ביותר שפותר את 23** · ש' + ≥2 + ראשונה ואחרונה" },
};

/* הפרדיקט של מקרה 23 · מוגדר פעם אחת ומשמש גם את המחולל וגם את הבדיקה. */
function ruleAccepts(typed, segs, ctx, cfg, st) {
  const A = words(typed).filter(x => !st.has(x));
  if (!A.length || A.length < cfg.minTyped) return false;
  for (const s of segs) {
    const B = words(s).filter(x => !st.has(x));
    if (!B.length) continue;
    if (!cfg.subset && A.length !== B.length) continue;
    if (A.length > B.length) continue;
    /* השומר "ראשונה ואחרונה": התשובה חייבת לכסות את מילת התוכן הראשונה של המקטע ואת
       האחרונה. זה בדיוק מה שחגי הקליד · שמר על "שקשור" ועל "ההוראה" והשמיט את
       "בתחומ תורת" שבאמצע. */
    if (cfg.edges) {
      if (!eqWords(A[0], B[0], cfg.shin)) continue;
      if (!eqWords(A[A.length - 1], B[B.length - 1], cfg.shin)) continue;
    }
    if (subMatch(A, B, cfg.shin)) return true;
  }
  return false;
}

/* ===== מה מחוללים בצד התשובה · והסיבה שזו לא קמצנות =====
 * הפיתוי הוא לחולל לכל מילה את כל צורות אות-היחס (‏w, הבסיס, וכל 'הלבכו' + הבסיס) ·
 * 7 צורות למילה, כלומר עד 7^k למקטע. אף אחת מהן אינה **קבלה חדשה**: כולן כבר
 * מתקבלות היום דרך `particleMatch` (‏`peel(x)===y`, `x===peel(y)`, `peel==peel`).
 * הצורה היחידה שהתנאי באמת מוסיף בצד התשובה היא **קילוף ש'**, כי ש' אינה ברשימת
 * אותיות היחס. לכן זה מה שמחוללים, והשאר מכוסה על ידי חתימות הקנון בצד הבעלים.
 * ⚠ נמדד ולא הונח · שער T6 מריץ את ההרחבה המלאה על מדגם ומדווח כמה היא מוסיפה. */
function genForms(w, cfg) {
  const out = [w];
  if (cfg.shin && w.length > 3 && w[0] === 'ש') out.push(w.slice(1));
  return out;
}
function allParticleForms(w) {
  const out = new Set([w]);
  const base = (w.length > 3 && PARTICLE.includes(w[0])) ? w.slice(1) : w;
  out.add(base);
  for (const c of PARTICLE) { const v = c + base; if (v.length > 3) out.add(v); }
  return Array.from(out);
}
function cartesian(lists, cap) {
  let acc = [[]];
  for (const list of lists) {
    const nx = [];
    for (const a of acc) for (const v of list) nx.push(a.concat(v));
    acc = nx;
    if (acc.length > cap) return null;
  }
  return acc;
}

/* ===== האינדקס · הפוך, לא קרטזי =====
 * הגרסה הראשונה אינדקסה כל מקטע לפי **חתימת רב-קבוצה** של ערכי קנון, כלומר עד 2^m
 * רשומות למקטע. זה נכון ובלתי-שמיש: מקטע בן 20 מילים (הפירוש המלא) פיצץ את הזיכרון
 * ל-3GB והריצה לא הסתיימה. האינדקס ההפוך נותן את אותה שלמות ב-m·|canon| רשומות:
 *   אורך → ערך קנון → קבוצת מקטעים
 * התאמה מושלמת בין x למקטע מחייבת שלכל מילה ב-x יש מילת-מקטע שחולקת איתה ערך קנון,
 * ולכן **חיתוך** הרשימות הוא חסם עליון שלם על המועמדים · וההכרעה נופלת ב-subMatch
 * המדויק, ואחריו אימות מול `meaningMatch` האמיתית.
 */
function loadMulti(lang, opts) {
  const noCanon = !!(opts && opts.noCanon);
  const L = MM.loadLang(lang);
  const ctx = L.ctx, st = L.st;
  /* כל מה שכרטיס מקבל היום · שלושת הענפים המפורשים של meaningMatch. הענף הרביעי
     (‏particleMatch) אינו קבוצת מחרוזות אלא יחס, והוא נתפס דרך ערכי הקנון. */
  const segs = [];
  for (const c of L.cards) {
    const add = (t, own) => { const ws = words(t).filter(x => !st.has(x)); if (ws.length) segs.push({ owner: c.key, ws, text: t, own: !!own }); };
    for (const s of c.segs) add(s, true);
    add(c.meanNorm); add(c.meanBare);
  }
  const valsOf = w => (noCanon ? [w] : canonSet(w, false));
  const IX = new Map();                              // אורך → ערך → מקטעים · לענף "מתקבל היום"
  const IX2 = new Map();                             // ערך → מקטעים · לענף "מתקבל **תחת אותו תנאי**"
  segs.forEach((sg, i) => {
    let byVal = IX.get(sg.ws.length);
    if (!byVal) { byVal = new Map(); IX.set(sg.ws.length, byVal); }
    for (const w of sg.ws) for (const v of valsOf(w)) {
      let s = byVal.get(v); if (!s) { s = new Set(); byVal.set(v, s); } s.add(i);
      if (!sg.own) continue;
      let s2 = IX2.get(v); if (!s2) { s2 = new Set(); IX2.set(v, s2); } s2.add(i);
    }
  });
  const candSegs = xw => {
    const byVal = IX.get(xw.length);
    if (!byVal) return [];
    let cand = null;
    for (const w of xw) {
      const acc = new Set();
      for (const v of valsOf(w)) { const s = byVal.get(v); if (s) for (const j of s) acc.add(j); }
      if (!acc.size) return [];
      if (cand === null) cand = acc;
      else { const nx = new Set(); for (const j of cand) if (acc.has(j)) nx.add(j); cand = nx; }
      if (!cand.size) return [];
    }
    return Array.from(cand);
  };
  /* אותו חיתוך בלי אילוץ האורך · לענף "התנאי מקבל את x גם על כרטיס אחר". */
  const candAny = xw => {
    let cand = null;
    for (const w of xw) {
      const acc = new Set();
      for (const v of valsOf(w)) { const s = IX2.get(v); if (s) for (const j of s) acc.add(j); }
      if (!acc.size) return [];
      if (cand === null) cand = acc;
      else { const nx = new Set(); for (const j of cand) if (acc.has(j)) nx.add(j); cand = nx; }
      if (!cand.size) return [];
    }
    return Array.from(cand);
  };
  return { L, ctx, segs, IX, IX2, candSegs, candAny };
}
const multiCache = new Map();
const getMulti = lang => { let x = multiCache.get(lang); if (!x) { x = loadMulti(lang); multiCache.set(lang, x); } return x; };

/* כל תת-הקבוצות של מקטע שעומדות בשומרים · שומרות על סדר המילים המקורי. */
function subsetsOf(ws, cfg) {
  const out = [];
  const n = ws.length;
  if (n > 20) return out;
  for (let mask = 1; mask < (1 << n); mask++) {
    const idx = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (!cfg.subset && idx.length !== n) continue;
    if (idx.length < cfg.minTyped) continue;
    if (cfg.edges && (idx[0] !== 0 || idx[idx.length - 1] !== n - 1)) continue;
    out.push(idx.map(i => ws[i]));
  }
  return out;
}

function measureMulti(key, lang, opts) {
  const cfg = C23[key];
  const o = opts || {};
  const Mx = o.model || getMulti(lang);
  const { L, ctx, segs: IXSEGS, candSegs, candAny } = Mx;
  /* אימות מול meaningMatch ממוזכר לפי (מחרוזת, בעלים) · אותה שאלה בדיוק חוזרת
     מכרטיסים שונים שמייצרים את אותה מחרוזת, והפונקציה אינה זולה. */
  const vmemo = new Map();
  const accepts = (x, oc) => {
    const k = x + SEP1 + oc.key;
    let v = vmemo.get(k);
    if (v === undefined) { v = ctx.meaningMatch(x, oc.w.meaning); vmemo.set(k, v); }
    return v;
  };
  const res = {
    newAccepts: 0, benign: 0, sameUnit: 0, otherUnit: 0, gatedSame: 0, gatedOther: 0,
    exSame: [], exOther: [], verified: 0, alreadyToday: 0, regress: 0, cards: 0,
    subsets: 0, capped: 0, coll: new Set(),
    /* ===== שני סוגי התנגשות · וזה ההבדל שמכריע במקרה 23 =====
     * ‏today  · המחרוזת היא תשובה קבילה של כרטיס אחר **היום**. זו ההגדרה של
     *           `measure_morph`, והיא הנכונה לחוק שמוסיף מחרוזת בודדת.
     * ‏mutual · התנאי מקבל את אותה מחרוזת **גם על כרטיס אחר**. לחוק תת-קבוצה זה
     *           הנזק העיקרי, והוא בלתי נראה להגדרה הראשונה: "כובע" אינו תשובה
     *           קבילה של מִגְבַּעַת היום (הפירוש שלה "כובע רחב שוליים" · שלוש
     *           מילים, ו-particleMatch דורש אורך שווה), אבל ברגע שהתנאי דלוק הוא
     *           נעשה תשובה של מִצְנֶפֶת **ושל** מִגְבַּעַת **ושל** תִּיתוֹרָה
     *           בבת אחת · וההבחנה בין שלוש המילים נמחקת. זה בדיוק מה שהדוח
     *           המקורי (`דוחות/סיכומים/מדידת-כלל-מורפולוגי.md §א`) נקב בשמו. */
    mutSame: 0, mutOther: 0, exMutSame: [], exMutOther: [], mutPairs: new Set(),
  };
  const seen = new Set();
  for (const c of (o.cards || L.cards)) {
    res.cards++;
    const allowed = new Set([c.key]);
    for (const t of Array.from(ctx.glossAlts(c.w))) allowed.add(ctx.K(t));
    for (const s of c.segs) {
      const ws = words(s).filter(x => !L.st.has(x));
      if (!ws.length) continue;
      for (const sub of subsetsOf(ws, cfg)) {
        res.subsets++;
        const per = sub.map(w => (o.fullForms ? allParticleForms(w) : genForms(w, cfg)));
        const combos = cartesian(per, o.fullForms ? 60000 : 8192);
        if (!combos) { res.capped++; continue; }
        for (const combo of combos) {
          const x = combo.join(' ');
          const tag = c.key + SEP1 + x;
          if (seen.has(tag)) continue;
          seen.add(tag);
          if (!ruleAccepts(x, [s], ctx, cfg, L.st)) continue;   // הפרדיקט מכריע, לא המחולל
          if (ctx.meaningMatch(x, c.w.meaning)) { res.alreadyToday++; continue; }
          res.newAccepts++;
          const xw = words(x).filter(t => !L.st.has(t));
          const owners = new Set();
          for (const j of candSegs(xw)) {
            const sg = IXSEGS[j];
            if (allowed.has(sg.owner)) continue;
            if (!subMatch(xw, sg.ws, false)) continue;          // התאמה מדויקת, לא רק חיתוך
            owners.add(sg.owner);
          }
          const bad = [];
          for (const z of owners) {
            const oc = L.cardByKey.get(z); if (!oc) continue;
            res.verified++;
            if (!accepts(x, oc)) continue;                       // חיובי-שגוי של האינדקס · נזרק
            bad.push(oc);
          }
          /* ===== ענף mutual · אותו x מתקבל גם על כרטיס אחר **תחת אותו תנאי** ===== */
          const mut = new Set();
          for (const j of candAny(xw)) {
            const sg = IXSEGS[j];
            if (allowed.has(sg.owner)) continue;
            if (!ruleAccepts(x, [sg.text], ctx, cfg, L.st)) continue;
            mut.add(sg.owner);
          }
          if (mut.size) {
            const mc = Array.from(mut).map(z => L.cardByKey.get(z)).filter(Boolean);
            const munits = new Set(mc.map(b => b.unit));
            for (const b of mc) res.mutPairs.add(c.key + SEP1 + b.key);
            const mrow = c.w.term + " (יח' " + c.unit + ') ← "' + x + '" · התנאי מקבל אותו גם על ' +
              mc.slice(0, 4).map(b => b.w.term + " (יח' " + b.unit + ')').join(' , ');
            if (munits.has(c.unit)) { res.mutSame++; if (res.exMutSame.length < EX_CAP) res.exMutSame.push(mrow); }
            else { res.mutOther++; if (res.exMutOther.length < EX_CAP) res.exMutOther.push(mrow); }
          }

          if (!bad.length) { res.benign++; continue; }
          const vetoed = isVetoedSeg(x, c.w, L.veto, ctx);
          const units = new Set(bad.map(b => b.unit));
          for (const b of bad) res.coll.add(c.key + SEP1 + b.key);
          const row = c.w.term + " (יח' " + c.unit + ') ← "' + x + '" · תשובה קבילה של ' +
            bad.slice(0, 4).map(b => b.w.term).join(' , ') + (vetoed ? ' · הווטו חוסם' : ' · **הווטו אינו חוסם**');
          if (units.has(c.unit)) { res.sameUnit++; if (!vetoed) res.gatedSame++; if (res.exSame.length < EX_CAP) res.exSame.push(row); }
          else { res.otherUnit++; if (!vetoed) res.gatedOther++; if (res.exOther.length < EX_CAP) res.exOther.push(row); }
        }
      }
    }
    /* רגרסיה · כל מקטע שמתקבל היום חייב להישאר מתקבל. התנאי אדיטיבי, ולכן זו בדיקה
       שאמורה להיות טריוויאלית · ובדיוק לכן היא נכתבת ולא מונחת. */
    for (const s of c.segs) if (!ctx.meaningMatch(s, c.w.meaning)) res.regress++;
  }
  return res;
}

/* =====================================================================
 * 4ב · מי **מחזיק** את המחרוזת שהוקלד
 *
 * זו השאלה שקודמת לכל מדידת עלות, ולא נשאלה קודם: לפני ששואלים כמה עולה תנאי שמקבל
 * את "עייף" על לֵאוּת, צריך לבדוק אם "עייף" **כבר שייך למישהו**. אם הוא מקטע פירוש של
 * ערך אחר, שום תנאי לא יעבור · הווטו (`isVetoedSeg`) חוסם אותו לפני שהתנאי בכלל נמדד,
 * וזה בדיוק מה שאמור לקרות: שתי המילים הן ערכים נבדלים שהמאגר בא ללמד להבדיל ביניהם.
 * ===================================================================== */
function ownership() {
  const L = MM.loadLang('he');
  const ctx = L.ctx;
  const out = [];
  for (const n of OPEN) {
    const c = CASE.get(n);
    const card = resolveCase(L, c);
    const a = ctx.norm(c.typed);
    const segOwners = Array.from(L.veto.segKeys.get(a) || []);
    const termOwners = Array.from(L.veto.termKeys.get(ctx.K(a)) || []);
    const rows = segOwners.map(o => {
      const oc = L.cardByKey.get(o);
      return oc ? { term: oc.w.term, unit: oc.unit, meaning: oc.w.meaning } : { term: o, unit: '?', meaning: '' };
    });
    out.push({
      n, term: card.w.term, unit: card.unit, meaning: card.w.meaning, typed: c.typed, norm: a,
      owners: rows, termOwners, vetoed: isVetoedSeg(a, card.w, L.veto, ctx),
    });
  }
  return out;
}

function solvesCase23(key) {
  const L = MM.loadLang('he');
  const c = CASE.get(23);
  const card = resolveCase(L, c);
  const ctx = L.ctx;
  const a = ctx.norm(c.typed);
  if (ctx.meaningMatch(a, card.w.meaning)) return { solved: false, why: 'מתקבל היום' };
  if (!ruleAccepts(a, card.segs, ctx, C23[key], L.st)) return { solved: false, why: 'התנאי אינו מקבל' };
  const vetoed = isVetoedSeg(a, card.w, L.veto, ctx);
  return { solved: !vetoed, why: vetoed ? 'הווטו חוסם' : 'מתקבל' };
}

/* =====================================================================
 * 4ג · השארית · מה שהתנאי מוסיף ו**שום ווטו אינו רואה**
 *
 * הווטו · בכל גרסה · מגן רק מפני מחרוזת שהיא תשובה של כרטיס אחר. יתר הקבלות אינן
 * נמדדות מבנית (‏`morph-report.md §גבול המדידה`). הן **כן** נמדדות חלקית: לקסיקון
 * הריצה (`out/runtime-lexicon.js`) מסמן מילה עברית אמיתית שאינה צורה קבילה של אף ערך
 * במאגר · וזה בדיוק גודל הסיכון שהווטו עיוור לו.
 *
 * מקור אמת אחד · `vetoSet` מיובא מ-`morph_veto_search.js` (הקובץ שכבר מדד את השארית
 * של `P-act-agent`), ולא ממומש כאן מחדש. שער T7 מקבע את המספרים שלו: `C4-bidi` הוא
 * אותו חוק בדיוק כמו `P-act-agent`, ולכן חייב להחזיר 284/17/0/267/19.
 *
 * ⚠ הלקסיקון הוא מסנן Bloom עם ‎FPR ~0.5%‎ · "מילה אמיתית" עשויה להיות חיובי-שגוי
 * באחת מכל 200 בערך, ו-negative שגוי בלתי אפשרי מבנית. כלומר המספר הוא חסם **עליון**
 * הדוק על כמות המילים האמיתיות, לא ספירה מדויקת.
 * ===================================================================== */
let LEXCACHE;
function runtimeLex() {
  if (LEXCACHE !== undefined) return LEXCACHE;
  try { LEXCACHE = require(path.join(OUT, 'runtime-lexicon.js')); } catch (e) { LEXCACHE = null; }
  return LEXCACHE;
}

/* ⚠ פער שנמצא בקריאת השורות, ולא במספר · **מונח של מאגר אחר אינו נבדק.**
   הפירושים במאגר האנגלי כתובים **בעברית**, ולכן התנאי מייצר שם מחרוזות עבריות. שער
   המונח (`VT`) של אותה סריקה בודק מול `veto.termKeys` של המאגר האנגלי, שמכיל מונחים
   באנגלית בלבד. התוצאה: מחרוזת כמו "מועד" מתקבלת על `delicacy` ונספרת כ"שארית תמימה",
   בעוד שהיא **מונח עברי במאגר** (מוֹעֵד). הפער הזה קיים גם ב-`measure_morph` וגם
   ב-`morph_veto_search`, ולכן הוא לא מדווח באף אחד מהם. כאן הוא נספר בנפרד. */
const heTermSet = (() => {
  let S = null;
  return () => {
    if (S) return S;
    const L = MM.loadLang('he');
    S = new Set();
    for (const k of L.veto.termKeys.keys()) S.add(k);
    return S;
  };
})();

function residual(key) {
  const spec = R[key];
  const rule = spec.rule;
  if (rule.kind !== 'gen') return { key, gen: false };
  const MVS = require('./morph_veto_search.js');
  const LEX = runtimeLex();
  const HT = heTermSet();
  const out = { key, gen: true, total: 0, today: 0, collide: 0, term: 0, rest: 0, realWord: 0, heTermCross: 0, known: 0, rows: [] };
  for (const lang of LANGS) {
    const L = MM.loadLang(lang);
    const ctx = L.ctx;
    const V = MVS.vetoSet(L, key);
    const params = Object.assign({}, rule.defaults, spec.params);
    for (const card of L.cards) {
      for (const x of rule.expand(card.segs, ctx, params)) {
        if (!rule.accepts(x, card.segs, ctx, params)) continue;
        if (card.singles.has(x)) { out.today++; continue; }
        out.total++;
        if (V.V1(x, card)) { out.collide++; continue; }
        if (V.VT(x, card)) { out.term++; continue; }
        out.rest++;
        const real = LEX ? !!LEX.lookup(x, 'he') : null;
        if (real) out.realWord++;
        /* מונח עברי שהסריקה של המאגר הזה אינה יכולה לראות · ראה ההערה למעלה. */
        const heTerm = HT.has(x);
        if (heTerm) out.heTermCross++;
        if (real || heTerm) out.known++;
        out.rows.push({ lang, term: card.w.term, unit: card.unit, typed: x, meaning: card.w.meaning, real, heTerm });
      }
    }
  }
  return out;
}

/* =====================================================================
 * 5 · שערים · כל אחד עם הרצה שאמורה להיפסל
 * ===================================================================== */

/* המספרים האלה כתובים ב-out/morph-report.md, סעיף `P-act-agent`. אם המסלול כאן סוטה
   מהם, כל מספר בקובץ הזה מודד קוד אחר מזה שהדוח הקודם מדד. */
const ANCHOR = { he: { newAccepts: 7, sameUnit: 2, otherUnit: 1 }, en: { newAccepts: 14, sameUnit: 1, otherUnit: 13 } };

function selftest() {
  /* הפלט נכתב **תוך כדי** ולא בסוף · שער שרץ עשרים דקות בלי סימן חיים אינו ניתן
     לאבחון, וזה קרה בפועל בגרסה הראשונה. */
  let fail = 0, total = 0;
  const T0 = Date.now();
  const out = { push: s => process.stdout.write(s + '\n') };
  const chk = (name, ok, note) => {
    total++;
    if (!ok) fail++;
    out.push('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + '  · ' + note + '  [' + ((Date.now() - T0) / 1000).toFixed(1) + 'ש]');
  };

  out.push('א · שחזור morph-report דרך מסלול המדידה הזה · אנטי-סחיפה');
  const anchor = measureSingle('C4-bidi');
  const ok = LANGS.every(l => ANCHOR[l].newAccepts === anchor[l].newAccepts && ANCHOR[l].sameUnit === anchor[l].sameUnit && ANCHOR[l].otherUnit === anchor[l].otherUnit);
  chk('T1 · `P-act-agent` משוחזר ספרה-ספרה', ok,
    LANGS.map(l => l + ' ' + anchor[l].newAccepts + '/' + anchor[l].sameUnit + '/' + anchor[l].otherUnit +
      ' (צפוי ' + ANCHOR[l].newAccepts + '/' + ANCHOR[l].sameUnit + '/' + ANCHOR[l].otherUnit + ')').join(' · '));
  const rl = bidiPairRule('anchorLoose', 'act-agent', { strictRoot: false });
  const loose = withRule(rl, () => MM.measureRisk(MM.loadLang('he'), { rule: rl.name, params: {} }));
  chk('T1r · ההשוואה מסוגלת לזהות שינוי (אדום מכוון)', loose.newAccepts !== anchor.he.newAccepts,
    'strictRoot:false נותן he ' + loose.newAccepts + ' ולא ' + anchor.he.newAccepts);

  out.push('');
  out.push('ב · כל תנאי פותר בדיוק את מה שהוא אמור, ולא בכיוון ההפוך');
  for (const k of SINGLE_KEYS) {
    const s = solvesCase(k);
    const got = outcomeOf(s);
    chk('T2 · ' + k + ' · מקרה ' + R[k].case, got === EXPECT_SOLVE[k], s.why + ' (' + got + ', צפוי ' + EXPECT_SOLVE[k] + ')');
  }
  for (const k of Object.keys(C23)) {
    const s = solvesCase23(k);
    const exp = (k === 'C23-full');
    chk('T2 · ' + k + ' · מקרה 23', s.solved === exp, s.why + (exp ? '' : ' (צפוי שלא יפתור לבדו)'));
  }
  {
    const rev = dirPairRule('rev', 'act-agent', { segSide: 'a', typedSide: 'b' });
    const L = MM.loadLang('he'); const card4 = resolveCase(L, CASE.get(4));
    chk('T2r · היפוך הכיוון מפיל את מקרה 4 (אדום מכוון)',
      !rev.accepts(L.ctx.norm(CASE.get(4).typed), card4.segs, L.ctx, Object.assign({}, rev.defaults, { strictRoot: true })),
      'הכיוון ההפוך אינו מקבל "מורד"');
  }

  out.push('');
  out.push("ג · קנון-כקבוצה שקול ל-eq של particleMatch · וקנון בעל ערך יחיד אינו");
  {
    const L = MM.loadLang('he');
    const V = new Set();
    for (const c of L.cards) for (const s of c.segs) for (const t of words(s)) if (!L.st.has(t)) V.add(t);
    const arr = Array.from(V);
    const peel = w => (w.length > 3 && PARTICLE.includes(w[0])) ? w.slice(1) : null;
    const eq = (x, y) => x === y || peel(x) === y || x === peel(y) || (!!peel(x) && peel(x) === peel(y));
    const one = w => peel(w) || w;
    let badSet = 0, badOne = 0, n = 0;
    for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
      n++;
      const t = eq(arr[i], arr[j]);
      if (t !== eqWords(arr[i], arr[j], false)) badSet++;
      if (t !== (one(arr[i]) === one(arr[j]))) badOne++;
    }
    chk('T3 · קנון-כקבוצה · אפס אי-התאמות', badSet === 0, badSet + ' מתוך ' + n.toLocaleString('en-US') + ' זוגות סדורים (' + arr.length + ' מילים)');
    chk('T3r · קנון בעל ערך יחיד נופל (אדום מכוון)', badOne > 0, badOne + ' אי-התאמות · הקנון היחיד לא היה נאמן');
  }

  out.push('');
  out.push('ד · מנוע רב-המילים מוצא התנגשות שידועה מראש');
  {
    /* מִצְנֶפֶת "כובע בד, מגבעת" · הקלדת "כובע" היא הדוגמה שהדוח המקורי נקב בשמה
       (דוחות/סיכומים/מדידת-כלל-מורפולוגי.md §א): היא תשובה קבילה גם של מִגְבַּעַת ושל
       תִּיתוֹרָה. אם המנוע לא מוצא אותה, אין ערך לשום מספר שהוא מחזיר. */
    /* מכוון לכרטיס עצמו ולא לרשימת הדוגמאות · הרשימה חסומה ב-60 והכרטיס הזה אינו
       בהכרח בתוכה. שער שנשען על תקרת תצוגה בודק את התקרה ולא את המנוע. */
    const one = MM.loadLang('he').cards.filter(c => /מִצְנֶפֶת/.test(c.w.term));
    const r = measureMulti('C23-sub1', 'he', { cards: one });
    const rows = r.exMutSame.concat(r.exMutOther);
    const hit = rows.some(s => s.indexOf('"כובע"') >= 0 && /מִגְבַּעַת|תִּיתוֹרָה/.test(s));
    chk('T4 · ההתנגשות הידועה (מצנפת ← "כובע" גם מגבעת/תיתורה) נמצאת', hit && one.length === 1,
      one.length !== 1 ? 'הכרטיס לא אותר · ' + one.length : (rows.find(s => s.indexOf('"כובע"') >= 0) || 'לא נמצאה · המנוע אינו אמין'));
    /* ⚠ ההתנגשות הזאת **אינה** מסוג "מתקבל היום": `meaningMatch("כובע", מגבעת)` הוא
       false, כי הפירוש שלה הוא שלוש מילים ו-particleMatch דורש אורך שווה. היא נראית
       רק בענף mutual · וזו הסיבה שהענף הזה קיים. */
    chk('T4b · והיא אכן **אינה** נראית בענף "מתקבל היום" (אחרת הענף מיותר)',
      !r.exSame.concat(r.exOther).some(s => s.indexOf('"כובע"') >= 0),
      'meaningMatch("כובע", מגבעת) = ' + MM.loadLang('he').ctx.meaningMatch('כובע', 'כובע רחב שוליים'));
    const rAll = measureMulti('C23-sub1', 'he');
    const r2 = measureMulti('C23-sub1', 'he', { model: loadMulti('he', { noCanon: true }) });
    chk('T4r · אינדקס בלי ערכי קנון מפספס (אדום מכוון)', r2.mutSame + r2.mutOther < rAll.mutSame + rAll.mutOther,
      (r2.mutSame + r2.mutOther) + ' מול ' + (rAll.mutSame + rAll.mutOther) + ' · ההפרש הוא ענף particleMatch');
  }

  out.push('');
  out.push('ה · אין רגרסיה ואין אי-הסכמה בין אינדקס לפרדיקט');
  {
    let bad = 0; const det = [];
    for (const k of SINGLE_KEYS) {
      const m = measureSingle(k);
      for (const lang of LANGS) {
        const x = m[lang];
        const n = x.regress + x.expandMismatch + x.scanMissing + x.verifyFail;
        if (n) { bad += n; det.push(k + '/' + lang + ' regress=' + x.regress + ' idx=' + x.expandMismatch + ' miss=' + x.scanMissing + ' vf=' + x.verifyFail); }
      }
    }
    chk('T5 · אפס רגרסיה / אי-הסכמה בכל ' + SINGLE_KEYS.length + ' הווריאנטים', bad === 0, bad ? det.join(' · ') : 'הכל אפס');
    const broken = dirPairRule('broken', 'act-agent', { segSide: 'b', typedSide: 'a' });
    const good = broken.expand.bind(broken);
    broken.expand = (segs, ctx, p) => { const o = good(segs, ctx, p); o.add('קוטלנ'); return o; };
    const bm = withRule(broken, () => MM.measureRisk(MM.loadLang('he'), { rule: broken.name, params: { strictRoot: true } }));
    chk('T5r · expand סותר את accepts נתפס (אדום מכוון)', bm.expandMismatch > 0, 'expandMismatch=' + bm.expandMismatch);
  }

  out.push('');
  out.push("ו · חיסכון החילול בצד התשובה אינו מסתיר התנגשות");
  {
    /* ההרחבה המלאה (7 צורות אות-יחס למילה) על מדגם מקטעים · אם היא מוסיפה התנגשות
       שהחילול המצומצם לא ראה, החיסכון אינו לגיטימי. מדגם ולא הכל · 7^k אינו בר-הרצה
       על המאגר כולו, וזה נאמר במפורש. */
    const L = MM.loadLang('he');
    const sample = L.cards.filter((_, i) => i % 11 === 0).slice(0, 120);
    const a = measureMulti('C23-sub2e', 'he', { cards: sample });
    const b = measureMulti('C23-sub2e', 'he', { cards: sample, fullForms: true });
    /* ההשוואה היא על **זוגות כרטיסים** ולא על מחרוזות: אותה התנגשות בדיוק מיוצגת
       ב-49 מחרוזות שונות בהרחבה המלאה, והשוואה לפי מחרוזת הייתה סופרת אותה 49 פעם
       ומכריזה "נמצאו 215 חדשות" בלי ולו זוג כרטיסים חדש אחד. זה קרה בפועל. */
    let extra = 0; const names = [];
    for (const x of b.coll) if (!a.coll.has(x)) { extra++; if (names.length < 3) names.push(x.replace(SEP1, ' ← ')); }
    let extraM = 0;
    for (const x of b.mutPairs) if (!a.mutPairs.has(x)) extraM++;
    chk('T6 · ההרחבה המלאה אינה חושפת זוג-כרטיסים חדש · מדגם ' + sample.length, extra === 0 && extraM === 0,
      'זוגות: מצומצם ' + a.coll.size + '/' + a.mutPairs.size + ' · מלא ' + b.coll.size + '/' + b.mutPairs.size +
      ' · חדשים ' + extra + '/' + extraM + (names.length ? ' · ' + names.join(' ; ') : '') + ' · נחסמו בתקרה ' + b.capped);
  }

  out.push('');
  out.push('ז · השארית · שחזור המנייה של `P-act-agent` שכבר נמדדה');
  {
    /* out/morph-residual.P-act-agent.json · נמדד בקובץ אחר, בשיטה אחרת, על אותו חוק.
       ‏`C4-bidi` הוא אותו חוק בדיוק, ולכן חייב להחזיר את אותם מספרים. אם לא · אחד
       משני המסלולים שגוי, ואי אפשר לדעת איזה בלי לעצור. */
    const EXP = { total: 284, collide: 17, term: 0, rest: 267, realWord: 19 };
    const r = residual('C4-bidi');
    const okAll = Object.keys(EXP).every(k => r[k] === EXP[k]);
    chk('T7 · שארית `C4-bidi` = שארית `P-act-agent` שנמדדה בנפרד', okAll,
      'total ' + r.total + '/' + EXP.total + ' · collide ' + r.collide + '/' + EXP.collide +
      ' · term ' + r.term + '/' + EXP.term + ' · rest ' + r.rest + '/' + EXP.rest + ' · realWord ' + r.realWord + '/' + EXP.realWord);
    const rd = residual('C4-dir');
    chk('T7r · המנייה מבחינה בין התנאים (אדום מכוון)', rd.total !== r.total || rd.rest !== r.rest,
      'C4-dir · total ' + rd.total + ' · rest ' + rd.rest + ' · realWord ' + rd.realWord);
    chk('T7l · לקסיקון הריצה נטען', !!runtimeLex(), runtimeLex() ? 'out/runtime-lexicon.js' : 'חסר · כל realWord הוא null');
  }

  process.stdout.write('\n' + (fail ? '⛔' : '✅') + ' ' + (total - fail) + '/' + total + ' שערים · ' + ((Date.now() - T0) / 1000).toFixed(1) + ' שניות\n');
  return fail;
}

/* =====================================================================
 * 6 · ערוץ המורפולוגיה של bank_gate על מועמד מכאן
 *
 * ‏bank_gate מחפש את המפתח ב-`measure_morph.CONFIGS`, שאינו קובץ שלי. לכן המועמד
 * נרשם שם **בזיכרון התהליך בלבד** לפני הקריאה, והסריקה עצמה היא `morphSweep` של
 * השער · לא העתק שלה. יקום הצורות של השער גדול מזה של המעבדה (תוצרי B1 + צורות
 * הדאטהסט), וזו בדיוק הנקודה העיוורת שהפילה את מועמד ה-gloss הראשון.
 * ===================================================================== */
function runGate(key) {
  const spec = R[key];
  if (!spec) { process.stdout.write('unknown key: ' + key + '\n'); process.exit(2); }
  process.env.MORPH_RULE = key;
  if (!process.env.MORPH_VETO) process.env.MORPH_VETO = 'V0';
  M.RULES.push(spec.rule); M.BY_NAME.set(spec.rule.name, spec.rule); M.BY_ID.set(spec.rule.id, spec.rule);
  MM.CONFIGS.push({ key, rule: spec.rule.name, params: spec.params, label: spec.label });
  const BG = require('./bank_gate.js');
  const MG = require('./measure_gloss.js');
  const gcfg = MG.CONFIGS.find(c => c.key === 'B1-union');
  const models = { he: BG.langModel('he'), en: BG.langModel('en') };
  const dsFiles = ['dataset-he.jsonl', 'dataset-en.jsonl'].map(n => path.join(OUT, n));
  const DS = BG.scanDataset(dsFiles, models);
  const rows = LANGS.map(l => BG.morphSweep(models[l], DS.forms.gloss[l], gcfg));
  let bad = 0; const lines = [];
  for (const r of rows) {
    lines.push('  ' + r.lang + '/' + r.set + ' · ' + r.forms + ' צורות (חוק ' + r.fromRule + ' · דאטהסט ' + r.fromDataset +
      ' · אות-יחס ' + r.fromParticle + ') · ' + r.cands + ' מועמדים · ' + r.pairs + ' זוגות · ' +
      r.collisions.length + ' חדשות · ' + r.baseline.length + ' של היום');
    for (const h of r.collisions.slice(0, 40)) lines.push('    ⛔ [' + h.lang + '] "' + h.typed + '" מתקבל על "' + h.card + "\" (יח' " + h.unit + ') · שייך ל-' + h.intruder);
    bad += r.collisions.length;
  }
  lines.push('');
  lines.push((bad ? '⛔' : '✅') + ' ' + key + ' · ' + bad + ' התנגשויות חדשות בערוץ המורפולוגיה של השער (ווטו ' + process.env.MORPH_VETO + ')');
  const text = lines.join('\n') + '\n';
  process.stdout.write(text);
  fs.appendFileSync(path.join(OUT, 'morph-cases-gate.log'), '\n=== ' + key + ' · ' + new Date().toISOString() + ' ===\n' + text, 'utf8');
  return bad;
}

/* =====================================================================
 * 7 · הדוח
 * ===================================================================== */

const sum = (m, f) => LANGS.reduce((n, l) => n + f(m[l]), 0);

function verdictOf(gs, go, tm) { return (gs + go + tm) === 0 ? '✅ נקי' : '❌ נדחה'; }

function detail(p, keys, single) {
  for (const k of keys) {
    const m = single[k].risk;
    p('#### `' + k + '` · ' + R[k].label);
    p('');
    for (const lang of LANGS) {
      const x = m[lang];
      p('- **' + (lang === 'he' ? 'עברית' : 'אנגלית') + '**: ' + x.newAccepts + ' קבלות חדשות · ' + x.benign + ' תמימות · ' +
        x.sameUnit + ' התנגשות באותה יחידה · ' + x.otherUnit + ' ביחידה אחרת · ' + x.termSame + '+' + x.termOther + ' מונח תפוס · ' +
        'רגרסיה ' + x.regress + ' · אומתו מול meaningMatch ' + x.verified + ' (' + x.verifyFail + ' נכשלו) · אינדקס מול פרדיקט ' + x.expandMismatch +
        ' · מנייה ' + x.genTotal + ', מהן ' + x.genFree + ' מחוץ ליקום ולכן מוכחות כלא-מתנגשות · מנייה שהסריקה פספסה ' + x.scanMissing);
    }
    const blocks = [
      ['**התנגשויות בתוך יחידת תרגול · כולן בשמן:**', LANGS.map(l => m[l].exSame)],
      ['**התנגשויות ביחידה אחרת:**', LANGS.map(l => m[l].exOther)],
      ['**מונח תפוס · התשובה היא מילה אחרת במאגר:**', LANGS.map(l => m[l].exTerm)],
      ['**קבלות חדשות שאינן התנגשות · דוגמאות:**', LANGS.map(l => m[l].exBenign)],
    ];
    for (const [title, lists] of blocks) {
      const rows = [];
      LANGS.forEach((l, i) => { for (const s of lists[i]) rows.push('[' + l + '] ' + s); });
      if (!rows.length) continue;
      p(''); p(title); p('');
      for (const s of rows.slice(0, EX_CAP)) p('- ' + s);
    }
    p('');
  }
}

function report() {
  const A = []; const p = s => A.push(s);
  const t0 = Date.now();

  const single = {};
  for (const k of SINGLE_KEYS) single[k] = { risk: measureSingle(k), solve: solvesCase(k) };
  const multi = {};
  for (const k of Object.keys(C23)) multi[k] = { risk: { he: measureMulti(k, 'he'), en: measureMulti(k, 'en') }, solve: solvesCase23(k) };

  const HEAD = "| תנאי | מה הוא דורש | פותר? | קבלות חדשות | התנגשות ביחידה | ביחידה אחרת | נותר אחרי הווטו | מונח תפוס | פסק |";
  const SEP = '|---|---|---|---|---|---|---|---|---|';
  const rowOf = k => {
    const m = single[k].risk;
    const gs = sum(m, x => x.gatedSame), go = sum(m, x => x.gatedOther), tm = sum(m, x => x.termSame) + sum(m, x => x.termOther);
    return '| `' + k + '` | ' + R[k].label + ' | ' + (single[k].solve.solved ? '✅ ' + R[k].case : '—') + ' | ' +
      sum(m, x => x.newAccepts) + ' | ' + sum(m, x => x.sameUnit) + ' | ' + sum(m, x => x.otherUnit) + ' | ' +
      gs + ' + ' + go + ' | ' + tm + ' | ' + verdictOf(gs, go, tm) + ' |';
  };

  p('# עלות שולית לכל מקרה · ארבעת המקרים המורפולוגיים הפתוחים');
  p('');
  p('נוצר על ידי `typo-lab/morph_cases.js`. כל מספר נמדד על הפונקציות האמיתיות של `app.js`');
  p('דרך ארגז החול, על שני המאגרים המלאים.');
  p('');
  p('## התוצאה בשורה אחת לכל מקרה');
  p('');
  p('| # | המקרה | הפסק | למה |');
  p('|---|---|---|---|');
  p('| 4 | סוֹרֵר ← "מורד" | 🟡 **קיים תנאי נקי**, ומחירו נמדד | `C4-dir-np` · אפס התנגשויות ששורדות את הווטו בשני המאגרים. המחיר אינו התנגשויות אלא **39 קבלות שקטות** שאף ווטו אינו רואה |');
  p('| 8 | לֵאוּת ← "עייף" | ⛔ **אין תנאי** · לא צר ולא רחב | `עייף` הוא הפירוש **המלא** של הוֹגִיעַ ומקטע של נִלְאֶה. זו שאלת זהות ולא שאלת סף |');
  p('| 14 | הִתְעַרְטֵל ← "התפשט" | ⛔ **אין תנאי** | `התפשט` הוא מקטע של פָשָׂה ושל נִטַּשׁ. אותו מנגנון |');
  p('| 23 | דִּידַקְטִי ← "קשור להוראה" | ❌ **יקר · ודורש שני חוקים** | ש\' כאות יחס **וגם** תשובה חלקית. בצורתם ההדוקה ביותר יחד: 63 התנגשויות הדדיות על 49 זוגות כרטיסים |');
  p('');
  p('**שניים מהארבעה אינם יקרים · הם בלתי אפשריים**, וזה ממצא אחר לגמרי מ"יקר מדי".');
  p('');
  p('## מה השאלה כאן, ובמה היא שונה');
  p('');
  p('`out/morph-report.md` מדד **כללים** · 28 וריאנטים, כל אחד מוחל על כל המאגר, וכולם');
  p('נדחו. השאלה כאן הפוכה: לכל מקרה בנפרד, מהו התנאי ה**צר ביותר** שגורם למחרוזת הזאת');
  p('להתקבל על הכרטיס הזה, וכמה **עוד** מחרוזות במאגר כולו מקיימות בדיוק את אותו תנאי.');
  p('');
  p('שני תאים שהמדידה הקודמת לא כיסתה, וזה לא ניסוח מחדש של אותו מספר:');
  p('');
  p('1. כל 11 זוגות המשקלים נמדדו **דו-כיוונית**. מקרה 4 צריך כיוון אחד (מקטע `קטלן` →');
  p('   תשובה `קוטל`); הכיוון השני מביא איתו התנגשויות משלו ואיש לא ביקש אותו.');
  p('2. כל 11 הזוגות נמדדו עם `strictRoot:true` בלבד. השורש של מקרה 8 הוא **עיפ** ·');
  p('   שורש ל"י · ולכן המקרה נופל **מחוץ** למה שנמדד. `P-adj-abs` בלי `strictRoot`');
  p('   מעולם לא נמדד לבדו.');
  p('');
  p('## הגדרות · זהות לאלה של `measure_morph.js`, בלי הרפיה');
  p('');
  p('- **התנגשות** · מחרוזת שהתנאי מוסיף לכרטיס A, והיא תשובה קבילה **היום** של כרטיס');
  p('  ‏B ≠ A שאינו נרדף שלו (`glossAlts`). כל אחת מאומתת מול `meaningMatch` האמיתית.');
  p('- **הווטו** · `isVetoedSeg`. הטור "נותר אחרי הווטו" הוא השארית שהווטו **אינו** חוסם.');
  p('- **סף** · התנגשות אחת ששורדת את הווטו = נדחה. לא משנה כמה פותר.');
  p('- **רגרסיה** · שום מקטע שמתקבל היום אינו נופל · נמדד בכל וריאנט, לא הונח.');
  p('');
  p('---');
  p('');

  /* ===== 0 · הבעלות · השאלה שקודמת לעלות ===== */
  const own = ownership();
  p('## 0 · השאלה שקודמת לעלות · מי **מחזיק** את המחרוזת');
  p('');
  p('לפני ששואלים כמה עולה תנאי שמקבל את "עייף" על לֵאוּת, צריך לבדוק אם "עייף" כבר');
  p('שייך למישהו. אם הוא **מקטע פירוש של ערך אחר**, שום תנאי לא יעבור: הווטו');
  p('(`isVetoedSeg`) חוסם אותו לפני שהתנאי בכלל נמדד. זה לא כשל של התנאי · זה בדיוק מה');
  p('שהווטו נועד לעשות, כי שתי המילים הן ערכים **נבדלים** שהמאגר בא ללמד להבדיל ביניהם.');
  p('');
  p('| # | הכרטיס | מה הוקלד | המחרוזת היא מקטע פירוש של | הווטו |');
  p('|---|---|---|---|---|');
  for (const o of own) {
    const who = o.owners.length ? o.owners.map(x => x.term + " (יח' " + x.unit + ' · "' + x.meaning + '")').join(' · ') : '—';
    p('| ' + o.n + ' | ' + o.term + " (יח' " + o.unit + ') | `' + o.typed + '` | ' + who + ' | ' + (o.vetoed ? '⛔ חוסם' : '✅ אינו חוסם') + ' |');
  }
  p('');
  p('**זה מכריע שניים מארבעת המקרים, ולא ברמת סף אלא ברמת זהות:**');
  p('');
  p('- **מקרה 8** · `עייף` הוא ה**פירוש המלא** של הוֹגִיעַ ומקטע ראשון של נִלְאֶה.');
  p('  שניהם ביחידה 3, לֵאוּת ביחידה 1, ואף אחד מהם אינו נרדף שחולק פירוש (`glossAlts`');
  p('  ריק). תנאי שיקבל את "עייף" על לֵאוּת מוחק את ההבחנה בין שלושה ערכים.');
  p('- **מקרה 14** · `התפשט` הוא מקטע ראשון של פָשָׂה (יח\' 2) ומקטע של נִטַּשׁ (יח\' 9).');
  p('');
  p('**לכן לשני המקרים האלה אין "תנאי צר ביותר" · אין תנאי בכלל.** זה נבדק לא רק על');
  p('התנאים שנבנו כאן: `measure_morph.measureBenefit` מחזירה `solvedGated` לכל 28');
  p('הווריאנטים הקודמים, ו-**8 ו-14 אינם מופיעים באף אחד מהם**. הטור "פותר מ-24"');
  p('ב-`out/morph-report.md` הוא הספירה **לפני** הווטו, ולכן הוא הראה אותם כפתוחים.');
  p('');
  p('| וריאנט | פותר (לפני ווטו) | פותר (אחרי ווטו) |');
  p('|---|---|---|');
  {
    const L = MM.loadLang('he');
    const resolved = MM.resolveCases(L);
    for (const cfg of MM.CONFIGS.concat(MM.PAIR_CONFIGS)) {
      const b = MM.measureBenefit(L, cfg, resolved);
      if (!b.solved.length) continue;
      p('| `' + cfg.key + '` | ' + b.solved.join(', ') + ' | ' + (b.solvedGated.join(', ') || '—') + ' |');
    }
  }
  p('');
  p('שני המקרים שנשארו פתוחים הם **4** ו-**23**, ורק להם יש עלות שולית למדוד.');
  p('');
  p('---');
  p('');

  p('## מקרה 4 · סוֹרֵר `מרדן, סרבן, חסר משמעת` ← **"מורד"**');
  p('');
  p('המקטע `מרדנ` הוא מילה בודדת והתשובה `מורד` היא מילה בודדת. התנאי הצר: שתיהן שני');
  p('צדדים של זוג המשקלים **קוֹטֵל ↔ קַטְלָן** עם אותו שורש שלם (מרד), והמקטע הוא צד');
  p('ה-`קטלן`. אין כאן שלד, אין קיפול אוצר מילים ואין קילוף · זו כבר הצורה המינימלית,');
  p('והמדידה כאן היא מה שהכיוון היחיד עולה.');
  p('');
  p(HEAD); p(SEP);
  for (const k of ['C4-bidi', 'C4-dir', 'C4-dir-np']) p(rowOf(k));
  p('');
  p('### השארית · מה שהתנאי מוסיף ו**שום ווטו אינו רואה**');
  p('');
  p('"אפס התנגשויות" אינו "אפס נזק". הווטו מגן רק מפני מחרוזת שהיא תשובה של כרטיס אחר;');
  p('כל היתר נכנס בשקט. המנייה כאן היא **מלאה** (החוק מסוג `gen`), ולכן זו ספירה ולא הערכה.');
  p('');
  p('| תנאי | קבלות חדשות | התנגשות (V1) | מונח | **שארית** | מילה בלקסיקון | מונח עברי חוצה-מאגר | ידוע סה"כ |');
  p('|---|---|---|---|---|---|---|---|');
  const res4 = {};
  for (const k of ['C4-bidi', 'C4-dir', 'C4-dir-np']) {
    const r = residual(k); res4[k] = r;
    p('| `' + k + '` | ' + r.total + ' | ' + r.collide + ' | ' + r.term + ' | **' + r.rest + '** | ' + r.realWord + ' | ' + r.heTermCross + ' | ' + r.known + ' |');
  }
  p('');
  p('‏`C4-bidi` הוא `P-act-agent` בדיוק, ומספריו (284 · 17 · 267 · 19) זהים למנייה');
  p('שנעשתה עליו בנפרד ב-`out/morph-residual.P-act-agent.json` · שער T7 מקבע את זה.');
  p('');
  {
    /* ההכלה נבדקת ולא מונחת · בלעדיה אפשר לומר רק "39" ולא "39 **מתוך** 267",
       ושתי האמירות אינן זהות. */
    const kOf = r => new Set(r.rows.map(x => x.lang + '|' + x.term + '|' + x.typed));
    const A = kOf(res4['C4-bidi']), B = kOf(res4['C4-dir']), C = kOf(res4['C4-dir-np']);
    const miss = (s, t) => { let n = 0; for (const x of s) if (!t.has(x)) n++; return n; };
    p('**התשובה המדויקת · הקבוצות מקוננות, ונבדק שהן מקוננות:**');
    p('');
    p('- ‏`C4-dir` ⊆ `C4-bidi` · ' + miss(B, A) + ' חריגות · ' + B.size + ' מתוך ' + A.size);
    p('- ‏`C4-dir-np` ⊆ `C4-dir` · ' + miss(C, B) + ' חריגות · ' + C.size + ' מתוך ' + B.size);
    p('');
    p('כלומר התנאי הצר גורר **' + C.size + ' מתוך ' + A.size + '** הקבלות השקטות של');
    p('`P-act-agent`, ומהן **' + res4['C4-dir-np'].rows.filter(x => x.real).length + ' מתוך ' +
      res4['C4-bidi'].rows.filter(x => x.real).length + '** המילים שהלקסיקון מסמן כאמיתיות.');
  }
  p('');
  p('שני השומרים אינם שקולים במחיר: **הכיוון** מוריד 267→70, ו**שומר-אות-היחס**');
  p('מוריד 70→39. השני נדרש גם לשער: `C4-dir` בלעדיו **נכשל** בשער המאגר על');
  p('`oil` ← `"לושמ"` (ראה למטה), כי `"לשמנ"` הוא ל+שמן ולא קַטְלָן.');
  p('');
  p('⚠ **הטור "מונח עברי חוצה-מאגר" הוא פער מדידה שנמצא כאן ואינו נספר באף דוח קודם.**');
  p('הפירושים במאגר האנגלי כתובים **בעברית**, ולכן התנאי מייצר שם מחרוזות עבריות · אבל');
  p('שער המונח של אותה סריקה בודק מול `veto.termKeys` של המאגר האנגלי, שמכיל מונחים');
  p('באנגלית בלבד. התוצאה: `delicacy` ← `"מועד"` נספר כשארית תמימה, בעוד ש-מוֹעֵד הוא');
  p('**מונח במאגר העברי**. ב-`C4-bidi` יש שתי שורות כאלה (`conquistador` ← `"כבשנ"`,');
  p('כלומר כִּבְשָׁן, ו-`delicacy` ← `"מועד"`). הפער קיים גם ב-`measure_morph` וגם');
  p('ב-`morph_veto_search`.');
  p('');
  p('#### ⚠ הלקסיקון הוא חסם תחתון · והוא מחזיר `false` על המחרוזת של המקרה עצמו');
  p('');
  p('`out/runtime-lexicon.js` נבנה מהטקסטים **שלנו בלבד**, ובחיסור כל צורה קבילה של כל');
  p('ערך במאגר. לכן "מילה אמיתית" שלו פירושו "מילה שהופיעה בטקסטים שלנו", ולא "מילה');
  p('בעברית". הנה הבדיקה על המילים של השארית עצמה:');
  p('');
  {
    const LEX = runtimeLex();
    const probe = ['מורד', 'סוקר', 'שוחק', 'מוסכ', 'צובע', 'מועד', 'נוצל', 'קומצ', 'שוקד', 'שוחצ', 'זולל', 'סודר', 'מוזג', 'סופק'];
    const no = probe.filter(w => LEX && !LEX.lookup(w, 'he'));
    const yes = probe.filter(w => LEX && LEX.lookup(w, 'he'));
    p('- מוחזר `true`: ' + yes.map(w => '`' + w + '`').join(' · '));
    p('- מוחזר **`false`** אף שכולן מילים עבריות רגילות: ' + no.map(w => '`' + w + '`').join(' · '));
  }
  p('');
  p('בראש הרשימה יושבת `מורד` · **המחרוזת שמקרה 4 עצמו רוצה**. כלומר המספר "6 מילים');
  p('אמיתיות מתוך 39" (ו-"19 מתוך 267" ב-`P-act-agent`) הוא **חסם תחתון ולא ספירה**,');
  p('והשיעור האמיתי גבוה בהרבה. זה נמדד על המכשיר, לא הוערך.');
  p('');
  p('#### כל ' + res4['C4-dir-np'].rest + ' שורות השארית של `C4-dir-np` · בשמן');
  p('');
  p('הטור הראשון: `LEX` = בלקסיקון · `מונח` = מונח עברי חוצה-מאגר.');
  p('');
  for (const x of res4['C4-dir-np'].rows) {
    const flag = (x.real ? '`LEX` ' : '') + (x.heTerm ? '`מונח` ' : '');
    p('- ' + (flag || '') + '[' + x.lang + '] ' + x.term + " (יח' " + x.unit + ') ← **"' + x.typed + '"** · הפירוש: ' + x.meaning);
  }
  p('');
  detail(p, ['C4-bidi', 'C4-dir', 'C4-dir-np'], single);

  p('## מקרה 8 · לֵאוּת `יגעות, עייפות, תשישות` ← **"עייף"**');
  p('');
  p('המקטע `עייפות` והתשובה `עייפ` הם שני צדדים של **תואר ↔ שם מופשט** (`1י23` ↔');
  p('`1י23ות`), שורש עיפ. השורש חלש (י\' באמצע), ולכן `strictRoot` פוסל אותו · וזו');
  p('הסיבה שהתא הזה לא נמדד. התנאי הצר: מקטע בן מילה אחת בתבנית `1י23ות`, תשובה');
  p('בתבנית `1י23`, אותו שורש, כיוון אחד.');
  p('');
  p('**⛔ ובכל זאת אין כאן שאלת עלות.** התנאי אכן מקבל את "עייף" · אבל `עייף` הוא');
  p('הפירוש **המלא** של הוֹגִיעַ ומקטע של נִלְאֶה, ולכן הווטו חוסם אותו. שים לב לשורה');
  p('האחרונה בטבלה: `C8-dir-s13` הוא **✅ נקי · אפס התנגשויות בשני המאגרים** · והוא');
  p('עדיין אינו פותר את המקרה. זו הצורה החדה ביותר של הממצא: **התנאי חינם, והמקרה');
  p('בכל זאת בלתי נגיש.** מה שחוסם אינו מחיר אלא זהות. הטבלה נשארת כאן כדי שהקביעה');
  p('הזאת תהיה מדודה ולא מוצהרת.');
  p('');
  p(HEAD); p(SEP);
  for (const k of ['C8-sr', 'C8-bidi', 'C8-dir', 'C8-dir-s13']) p(rowOf(k));
  p('');
  detail(p, ['C8-sr', 'C8-bidi', 'C8-dir', 'C8-dir-s13'], single);

  p('## מקרה 14 · הִתְעַרְטֵל `פשט את בגדיו; חשף את רגשותיו` ← **"התפשט"**');
  p('');
  p('כאן המקטע **אינו** מילה בודדת: `פשט את בגדיו` נושא שתי מילות תוכן (`פשט`,');
  p('`בגדיו`). לכן שום חוק מילה-מול-מילה אינו נוגע במקרה הזה, כמה שיהיה הדוק ·');
  p('‏`C14-w1` בטבלה הוא בדיוק זה והוא **אינו פותר**. התוספת השולית של מקרה 14 היא');
  p('הרשות לקחת את **מילת התוכן הראשונה** של מקטע רב-מילי, כלומר מחלקה B2 (ראש מקטע)');
  p('שכבר נדחתה בפני עצמה · והשאלה כאן היא כמה היא עולה כשמצמצמים אותה לזוג משקלים');
  p('אחד (פָּעַל → הִתְפַּעֵל) בכיוון אחד.');
  p('');
  p('**⛔ וגם כאן הבדיקה נעצרת לפני העלות.** `התפשט` הוא מקטע של פָשָׂה (יח\' 2) ושל');
  p('נִטַּשׁ (יח\' 9), ולכן הווטו חוסם אותו בכל תצורה. בניגוד למקרה 8, כאן גם המחיר');
  p('עצמו גבוה: `C14-head` מוסיף 7 התנגשויות ששורדות את הווטו, ו-`C14-both` ‏32.');
  p('כלומר מקרה 14 נכשל **בשני** המבחנים · הוא גם חסום בזהות וגם יקר.');
  p('');
  p(HEAD); p(SEP);
  for (const k of ['C14-w1', 'C14-head', 'C14-head-2', 'C14-both']) p(rowOf(k));
  p('');
  detail(p, ['C14-w1', 'C14-head', 'C14-head-2', 'C14-both'], single);

  p('## מקרה 23 · דִּידַקְטִי `שקשור בתחום תורת ההוראה` ← **"קשור להוראה"**');
  p('');
  p('⚠ **המקרה הזה אינו מורפולוגיה, והוא דורש שני חוקים ולא אחד.** המקטע נושא ארבע');
  p('מילות תוכן (`שקשור בתחומ תורת ההוראה`) והתשובה שתיים. `particleMatch` דורש');
  p('‏`A.length === B.length` (app.js:1802) ומקלף רק מ-`הלבכו` (app.js:1799). לכן חסרים');
  p('**שני** דברים בלתי תלויים:');
  p('');
  p("- **‏(א) ש' כאות יחס** · `שקשור` מול `קשור`. ש' אינה ברשימת אותיות היחס.");
  p('- **‏(ב) תשובה חלקית** · שתיים מתוך ארבע מילות התוכן. זו מחלקה C/B2 ולא מורפולוגיה.');
  p('');
  p('אף אחד מהם לבדו אינו מקבל את "קשור להוראה" · נבדק ולא הונח (עמודת "פותר?").');
  p('התנאי הצר ביותר שכן פותר: (א) **וגם** (ב), כשהחלקיות מוגבלת ל-≥2 מילות תוכן');
  p('ולשמירה על מילת התוכן הראשונה והאחרונה של המקטע · שזה בדיוק מה שחגי הקליד');
  p('(שמר על `שקשור` ועל `ההוראה`, השמיט את `בתחומ תורת` שבאמצע).');
  p('');
  p('היקום כאן אינו `SINGLE` של `measure_morph` · הוא יקום **רב-מילים**, ולכן נמדד');
  p('במנוע נפרד. שקילותו ל-`eq` של `particleMatch` נבדקת בשער T3, יכולתו למצוא');
  p('התנגשות ידועה בשער T4, וחיסכון החילול בשער T6.');
  p('');
  p('### ⚠ לחוק תת-קבוצה יש סוג התנגשות שני, ו-`measure_morph` אינו סופר אותו');
  p('');
  p('ההגדרה של `measure_morph` היא "המחרוזת היא תשובה קבילה של כרטיס אחר **היום**".');
  p('היא נכונה לחוק שמוסיף מחרוזת בודדת, והיא **מפספסת** את הנזק העיקרי של חוק חלקיות:');
  p('');
  p('> `מִצְנֶפֶת :: כובע בד, מגבעת` · הקלדת **"כובע"**.');
  p('> ‏`meaningMatch("כובע", מִגְבַּעַת)` הוא **false** · הפירוש שלה "כובע רחב שוליים",');
  p('> שלוש מילים, ו-`particleMatch` דורש אורך שווה. כלומר בהגדרה הראשונה אין כאן');
  p('> התנגשות. אבל ברגע שהתנאי דלוק, "כובע" נעשה תשובה קבילה של מִצְנֶפֶת **וגם** של');
  p('> מִגְבַּעַת (יח\' 10) **וגם** של תִּיתוֹרָה (יח\' 7) · וההבחנה בין שלוש המילים נמחקת.');
  p('');
  p('זו בדיוק ההתנגשות ש-`דוחות/סיכומים/מדידת-כלל-מורפולוגי.md §א` נקב בשמה. לכן הטבלה סופרת');
  p('**שני** טורים: `היום` (ההגדרה הקיימת) ו-**`הדדי`** (התנאי מקבל את אותה מחרוזת גם');
  p('על כרטיס אחר). שער T4 מוכיח שהמנוע מוצא את השורה הזאת, ו-T4b מוכיח שהיא **אינה**');
  p('נראית בטור הראשון · כלומר הטור השני אינו כפילות.');
  p('');
  p("| תנאי | מה הוא דורש | פותר? | קבלות חדשות | היום · יח' | היום · אחר | אחרי ווטו | **הדדי · יח'** | **הדדי · אחר** | זוגות כרטיסים | פסק |");
  p('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(C23)) {
    const m = multi[k].risk;
    const gs = sum(m, x => x.gatedSame), go = sum(m, x => x.gatedOther);
    const ms = sum(m, x => x.mutSame), mo = sum(m, x => x.mutOther);
    const pairs = LANGS.reduce((n, l) => n + m[l].mutPairs.size, 0);
    p('| `' + k + '` | ' + C23[k].label + ' | ' + (multi[k].solve.solved ? '✅ 23' : '—') + ' | ' +
      sum(m, x => x.newAccepts) + ' | ' + sum(m, x => x.sameUnit) + ' | ' + sum(m, x => x.otherUnit) + ' | ' +
      gs + ' + ' + go + ' | **' + ms + '** | **' + mo + '** | ' + pairs + ' | ' +
      ((gs + go + ms + mo) === 0 ? '✅ נקי' : '❌ נדחה') + ' |');
  }
  p('');
  for (const k of Object.keys(C23)) {
    const m = multi[k].risk;
    p('#### `' + k + '` · ' + C23[k].label);
    p('');
    for (const lang of LANGS) {
      const x = m[lang];
      p('- **' + (lang === 'he' ? 'עברית' : 'אנגלית') + '**: ' + x.newAccepts + ' קבלות חדשות · ' + x.benign + ' תמימות · ' +
        x.sameUnit + ' התנגשות-היום באותה יחידה · ' + x.otherUnit + ' ביחידה אחרת · ' +
        x.mutSame + '/' + x.mutOther + ' הדדיות (' + x.mutPairs.size + ' זוגות כרטיסים) · רגרסיה ' + x.regress +
        ' · ' + x.subsets + ' תת-קבוצות נסרקו · ' + x.verified + ' מועמדי-בעלים אומתו מול `meaningMatch`');
    }
    for (const [title, lists] of [
      ['**התנגשויות "מתקבל היום" בתוך יחידת תרגול:**', LANGS.map(l => m[l].exSame)],
      ['**התנגשויות "מתקבל היום" ביחידה אחרת:**', LANGS.map(l => m[l].exOther)],
      ['**התנגשויות הדדיות בתוך יחידת תרגול:**', LANGS.map(l => m[l].exMutSame)],
      ['**התנגשויות הדדיות ביחידה אחרת:**', LANGS.map(l => m[l].exMutOther)],
    ]) {
      const rows = [];
      LANGS.forEach((l, i) => { for (const s of lists[i]) rows.push('[' + l + '] ' + s); });
      if (!rows.length) continue;
      p(''); p(title + ' · ' + Math.min(rows.length, EX_CAP) + ' בשמן'); p('');
      for (const s of rows.slice(0, EX_CAP)) p('- ' + s);
    }
    p('');
  }

  p('**איזה משני החוקים יקר · הפירוק מהטבלה עצמה.** ‏`C23-sub2e` ו-`C23-full` נבדלים');
  p("בדיוק ברכיב ש', ומספרי ההתנגשות שלהם **זהים** · כלומר בתוך השומר ההדוק (≥2 מילים,");
  p("ראשונה ואחרונה) רכיב ש' מוסיף אלפי קבלות ואפס התנגשויות. היקר הוא רכיב **החלקיות**.");
  p("אבל ש' לבדה, בלי אותו שומר (`C23-shin`), כן מתנגשת · 21 ששורדות את הווטו. כלומר");
  p('אף אחד משני החוקים אינו "החינמי", והצירוף נדחה בגלל החלקיות.');
  p('');
  p('⚠ **מה החלקיות עושה, בשם אחד:** `סָנֵגוֹר` (יח\' 1) ← `"עורכ דינ הנאשמ"` מתקבל');
  p("**גם על `קָטֵגוֹר`** (יח' 4). כלומר התשובה של הסנגור נעשית התשובה של הקטגור ·");
  p('שני ערכים שכל תפקידם במאגר הוא ההבחנה ביניהם. אותו דבר ב-`אַרְכִיב`/`גַּנְזַך`,');
  p('ב-`גַּת`/`יֶקֶב`, וב-`מִצְנֶפֶת`/`מִגְבַּעַת`/`תִּיתוֹרָה`. זה לא מקרה קצה ·');
  p('זה מה שקיצור פירוש **עושה**: הוא מוחק בדיוק את המילים שנושאות את ההבדל.');
  p('');
  p("⚠ **למה ש' יקרה, בשמות:** ש' היא אות שורש לא פחות משהיא אות יחס, והתנאי אינו יכול");
  p('להבדיל. הקילוף מייצר `שולי`→`ולי`, `שינה`→`ינה`, `שודד`→`ודד`, `שמחה`→`מחה`, וכל');
  p("אחת מהן נעשית תשובה קבילה של ערך אחר. זה שונה מהותית מ-`הלבכו`: שם אות היחס אינה");
  p('אות שורש נפוצה, ולכן `particleMatch` מחזיק. הרשימות למעלה נותנות את זה בשמן.');
  p('');
  p('---');
  p('');
  p('## שער המאגר · ערוץ המורפולוגיה');
  p('');
  p('המדידה למעלה נעשית על יקום הקבלה של המעבדה. **השער אינו סומך עליו**: יקום הצורות');
  p('שלו כולל בנוסף את תוצרי ההרחבה של `B1-union` ואת צורות הדאטהסט שתויגו `accept` ·');
  p('שתי קבוצות שאינן מקטע פירוש ולכן **בלתי נראות** לכל ווטו שנבנה מהמאגר בלבד. זו');
  p('בדיוק הנקודה העיוורת שהפילה את מועמד ה-gloss הראשון (`STATE.md`, 15.8 05:30).');
  p('');
  p('```');
  p('node typo-lab/morph_cases.js --gate=<key>      # ווטו V0 · morphSweep של bank_gate עצמו');
  p('```');
  p('');
  {
    const logPath = path.join(OUT, 'morph-cases-gate.log');
    if (fs.existsSync(logPath)) {
      const txt = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      p('```');
      for (const line of txt.slice(-40)) p(line);
      p('```');
    } else {
      p('_(‏`out/morph-cases-gate.log` טרם נוצר · הרץ את הפקודה למעלה)_');
    }
  }
  p('');
  p('### הרצה שנייה · הארטיפקט מול השער המלא');
  p('');
  p('```');
  p('node typo-lab/morph_cases.js --artifact=C4-dir-np      # out/typo-rules.MORPHCASE1.json');
  p('TYPO_RULES=typo-lab/out/typo-rules.MORPHCASE1.json node typo-lab/bank_gate.js');
  p('```');
  p('');
  p('⚠ **מה ההרצה הזאת מוכיחה ומה לא.** היא מריצה את **כל** שכבות השער (מונח, פירוש,');
  p('נרדפות, צירה) על הארטיפקט, ולכן היא מוכיחה שהוא אינו שובר שכבה קיימת. היא **אינה**');
  p('בודקת את החוק המורפולוגי עצמו: הוא אינו ממומש ב-`lib/checker.js`, ולכן אינו נגזר');
  p('מהפרמטרים · בדיוק המצב של "הגן המדורג" ב-`STATE.md §פתוח לחגי #3`. הערוץ שבודק');
  p('אותו הוא `--gate=` למעלה. שני הירוקים נדרשים, ואף אחד מהם אינו מספיק לבדו.');
  p('הפלט: `out/bank-gate.typo-rules.MORPHCASE1.md`.');
  p('');
  p('**השער הודגם אדום לפני שנסמכתי עליו:** `C4-bidi` (= `P-act-agent`) מחזיר 4');
  p('התנגשויות בשמן, ובהן שתיים שהמעבדה **לא** ראתה בכלל (`"תכננ"` על `substance`,');
  p('`"בשמנ"` על `cologne`) · הן מגיעות מצורות הדאטהסט ומההרחבה, לא מהמאגר.');
  p('זה מה שהופך את הירוק של `C4-dir-np` לעדות ולא להצהרה.');
  p('');
  p('---');
  p('');
  p('## המלצה');
  p('');
  p('1. **מקרים 8 ו-14 · לסגור.** אין להם תנאי, ולא בגלל שהוא יקר. המחרוזת שהמשתמש');
  p('   הקליד היא התשובה הנכונה של ערך אחר במאגר. הם שייכים לכפתור "בעצם ידעתי · סמן');
  p('   כנכון", וזו התשובה הסופית ולא ביניים. ⚠ שווה **לעדכן את `out/morph-report.md`**:');
  p('   הטור "פותר מ-24" שם הוא לפני-ווטו, והוא מציג אותם כפתוחים.');
  p('2. **מקרה 23 · לסגור.** הוא דורש שני חוקים בלתי תלויים, ושניהם יקרים בנפרד.');
  p('   התנאי החלקי מוחק הבחנות בין ערכים (מִצְנֶפֶת / מִגְבַּעַת / תִּיתוֹרָה),');
  p("   וש' כאות יחס מתנגשת בכל מילה שש' היא בה אות שורש.");
  p('3. **מקרה 4 · הכרעה של חגי, ולא הנדסית.** `C4-dir-np` הוא התנאי המורפולוגי הראשון');
  p('   בפרויקט שגם פותר מקרה אמיתי וגם עובר את סף אפס-ההתנגשויות · **בשתי** שכבות');
  p('   הבדיקה: אפס בשארית המעבדה, ואפס בערוץ המורפולוגיה של `bank_gate` על היקום');
  p('   המורחב. אבל הוא מוסיף 39 קבלות שקטות, ובהן `air conditioner` ← `"מוזג"`');
  p('   ו-`usher` ← `"סודר"` · שתי מילים עבריות אמיתיות שאינן התשובה.');
  p('');
  p('   **וההידוק מוצה.** מה שמייצר את 39 השורות הוא שהתבנית `123נ` מתאימה לכל שם עצם');
  p("   שמסתיים ב-ן', ולא רק לשם פועֵל במשקל קַטְלָן: `מזגן`, `סרטן`, `מטען`, `מסנן`,");
  p('   `מתקן`, `מעדן`, `קנקן`, `נמען` · כולם בשמם ברשימה למעלה. אין סימן **מבני**');
  p('   שמבדיל ביניהם לבין `מרדן`, ולכן כל הידוק נוסף דורש רשימת שמות-פועֵל · כלומר');
  p('   תוכן חדש, לא שומר.');
  p('');
  p('   השאלה אינה "האם הוא נקי" (הוא נקי, ובשער) אלא **האם 39 קבלות שקטות שוות מקרה');
  p('   אחד מתוך 24**. זו הכרעת מוצר ולא הנדסה, ולכן היא לא הוכרעה כאן.');
  p('');
  p('---');
  p('');
  p('## גבול המדידה');
  p('');
  p('1. **נמדד במלואו** · לכל תנאי, כל מחרוזת שהוא מוסיף במאגר כולו, והאם היא תשובה');
  p('   קבילה של ערך אחר. למקרים 4/8/14 היקום הוא `SINGLE` של `measure_morph`,');
  p('   ששלמותו אומתה שם מול `meaningMatch` על 120,000 זוגות לכל שפה.');
  p('2. **מקרה 23** · היקום רב-מילים, וההתאמה כאן **מדויקת** (backtracking) בעוד');
  p('   ש-`particleMatch` עצמו **חמדן**. כלומר התנאי שנמדד רחב-או-שווה לזה שהיה נשלח,');
  p('   וההתנגשויות הן חסם עליון ולא הערכה נמוכה. כל פגיעה אומתה מול `meaningMatch`');
  p('   האמיתית, ולכן חיובי-שגוי של החתימה אינו נספר.');
  p('3. **לא נמדד** · האם המחרוזת פשוט **שגויה סמנטית** בלי להיות תשובה של אף ערך אחר.');
  p('   זה בדיוק הסייג של `out/morph-report.md §גבול המדידה`, והוא תקף כאן במלואו.');
  p('   "קבלות חדשות" פחות ההתנגשויות הוא הגודל של הסיכון הזה, לא הוכחה שהוא אפס.');
  p('   השארית שנספרה למעלה היא **המדידה החלקית** של אותו סיכון, לא ביטול הסייג.');
  p('4. **"מתקבל היום" כאן הוא לפני שכבת הסובלנות.** ‏`lib/ctx.js` אינו מזריק את');
  p('   `typo-lex.js`, ולכן `typoLex()` מחזירה `null` ו-`nearMatch` יוצאת בשורה');
  p('   הראשונה · נבדק בהרצה ולא הונח. זו אותה משמעות שבה `lib/keys.js §acceptsToday`');
  p('   משתמש, והיא **הנכונה** להגדרת "התנגשות חדשה" (זה מה ש-`bank_gate` סופר');
  p('   כ-`via=typo` מול `via=exact`). הכיוון של השארית הזאת: כרטיס שמקבל מחרוזת **רק**');
  p('   דרך שכבת הסובלנות אינו נספר כאן כבעלים · כלומר ההתנגשויות הן חסם **תחתון**');
  p('   בערוץ הזה. השכבה שכן מודדת אותו היא שער המאגר, דרך צורות הדאטהסט · ולכן');
  p('   הירוק שנשען עליו הוא הירוק שקובע.');
  p('5. **מקרה 23 · ההשוואה "הדדי" נמדדת מול המקטעים ולא מול כל מחרוזת אפשרית.**');
  p('   כלומר: נספר "מקטע של B שהתנאי מקבל גם עליו", ולא כל מחרוזת שהתנאי מקבל על');
  p('   שני כרטיסים. זה חסם תחתון, והוא מספיק כדי לדחות · אין צורך במספר גדול יותר.');
  p('');
  p('נמדד ב-' + ((Date.now() - t0) / 1000).toFixed(1) + ' שניות.');

  const text = A.join('\n') + '\n';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'morph-cases-report.md'), text, 'utf8');
  process.stdout.write(text);
  process.stdout.write('\nנכתב אל typo-lab/out/morph-cases-report.md\n');
  return { single, multi };
}

/* ===== הארטיפקט =====
 * העתק של `out/typo-rules.json` **בלי שינוי** ועוד בלוק `morphCase` אדיטיבי. הסיבה
 * שזה העתק ולא קובץ חדש: `bank_gate` קורא ממנו את הפרמטרים, הספים ו-EFF, ולכן
 * הרצה עליו מוכיחה שהארטיפקט אינו שובר אף שכבה קיימת. הבלוק החדש הוא **תיעוד**:
 * החוק עצמו אינו ממומש ב-`lib/checker.js` ולכן `bank_gate` אינו יכול לראות אותו
 * דרך הפרמטרים · לזה קיים `--gate=`, שמריץ את `morphSweep` של השער על החוק עצמו.
 * ⚠ הבחנה זו נאמרת במפורש כדי ששום ירוק כאן לא ייקרא כאישור למה שהוא לא בדק. */
function artifact(key) {
  const spec = R[key];
  if (!spec) { process.stdout.write('unknown key: ' + key + '\n'); process.exit(2); }
  const base = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const res = residual(key);
  const risk = measureSingle(key);
  base.morphCase = {
    key,
    label: spec.label,
    case: spec.case,
    source: 'typo-lab/morph_cases.js',
    note: 'תיעוד בלבד · החוק אינו ממומש ב-lib/checker.js ולכן אינו נבדק דרך הפרמטרים. ' +
      'ערוץ הבדיקה שלו הוא morphSweep של bank_gate דרך `node typo-lab/morph_cases.js --gate=' + key + '`.',
    rule: { pair: 'act-agent', segTemplate: '123נ', typedTemplate: '1ו23', direction: 'seg->typed', strictRoot: true, noParticleSeg: true },
    measured: {
      solves: solvesCase(key),
      byLang: Object.fromEntries(LANGS.map(l => [l, {
        newAccepts: risk[l].newAccepts, sameUnit: risk[l].sameUnit, otherUnit: risk[l].otherUnit,
        survivingVeto: risk[l].gatedSame + risk[l].gatedOther, termTaken: risk[l].termSame + risk[l].termOther,
        regress: risk[l].regress, enumerated: risk[l].genTotal, outsideUniverse: risk[l].genFree,
      }])),
      residual: { total: res.total, collide: res.collide, term: res.term, rest: res.rest, realWord: res.realWord, heTermCross: res.heTermCross },
      residualRows: res.rows,
    },
    caveat: 'realWord נמדד מול out/runtime-lexicon.js, שמחזיר false גם על "מורד" עצמה · ' +
      'המספר הוא חסם תחתון על מספר המילים העבריות האמיתיות בשארית, לא ספירה.',
  };
  const out = path.join(OUT, 'typo-rules.MORPHCASE1.json');
  fs.writeFileSync(out, JSON.stringify(base, null, 1), 'utf8');
  process.stdout.write('נכתב ' + out + ' · fp=' + (base.fp || '?') + ' · שארית ' + res.rest + ' · מילים בלקסיקון ' + res.realWord + '\n');
  return 0;
}

function main() {
  const arg = process.argv.slice(2);
  const gate = arg.find(a => a.startsWith('--gate='));
  const art = arg.find(a => a.startsWith('--artifact='));
  if (arg.includes('--selftest')) process.exit(selftest() ? 1 : 0);
  if (gate) process.exit(runGate(gate.slice(7)) ? 1 : 0);
  if (art) process.exit(artifact(art.slice(11)));
  report();
}

if (require.main === module) main();

module.exports = {
  R, C23, SINGLE_KEYS, EXPECT_SOLVE, ANCHOR, measureSingle, measureMulti, solvesCase, solvesCase23,
  ruleAccepts, eqWords, canonSet, subMatch, dirPairRule, bidiPairRule, selftest, report, runGate, getMulti,
  residual, ownership, runtimeLex, withRule,
};
