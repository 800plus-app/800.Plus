'use strict';
/* מדידת שלושת המועמדים · typo-lab/measure_candidates.js
 *
 *   node typo-lab/measure_candidates.js  → out/candidates-report.md
 *
 * ⛔ **מדידה בלבד. שום דבר כאן אינו נשלח, ו-`app.js` לא נוגעים בו.**
 * שלושת המועמדים עלו מחמשת המקרים האמיתיים של חגי (16.8), וחמישה מקרים אינם
 * התפלגות — הם אומרים לאן להסתכל. ההכרעה נקבעת על האוכלוסייה.
 *
 * ===== למה לא מריצים כאן את `bank_gate` ארבע פעמים =====
 * ‏`particleMatch` מחזיקה את רשימת הקילוף כ-`const PARTICLE='הלבכו'` **בתוך
 * הפונקציה** (app.js:1799), ואי אפשר להחליף אותה מבחוץ בלי לערוך את `app.js` —
 * שאסור, וגם סוכן אחר עובד עליו כרגע. לכן מיושמת כאן מראה מדויקת של הפונקציה
 * עם רשימה ושומר-אורך פרמטריים, ונמדד עליה **בדיוק הקריטריון של `bank_gate`**:
 * מחרוזת שמתקבלת על כרטיס A ושהיא תשובה קבילה של כרטיס B ≠ A.
 *
 * ⭐ והמדידה כאן **ממצה ולא דגימה**, בזכות תנאי הכרחי: ‏`eq` של particleMatch
 * מתיר לכל היותר קילוף אחד מכל צד, ולכן שתי מחרוזות שמתאימות **חייבות** לחלוק
 * את אותה רב-קבוצה של "שורש עמוק" (קילוף חוזר של כל אות שימוש). קיבוץ לפי
 * המפתח הזה מייצר על-קבוצה שלמה, ומצמצם השוואה של 10k×10k לכמה אלפי זוגות.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');

const OUT = path.join(__dirname, 'out');
const BASE_PEEL = 'הלבכו';          // app.js:1799 · כפי שהוא היום
const ALL_PEEL = 'הלבכומש';         // איחוד · משמש לקיבוץ בלבד
const BASE_MINLEN = 3;              // app.js:1803 · `w.length > 3`

/* ===== מראה מדויקת של particleMatch (app.js:1798-1811) ===== */
function makeParticle(ctx, peel, minLen) {
  const STOP = new Set(Array.from(ctx.PARTICLE_STOP));
  const cut = s => String(s).split(/\s+/).filter(x => x && !STOP.has(x));
  const pl = w => (w.length > minLen && peel.includes(w[0])) ? w.slice(1) : null;
  const eq = (x, y) => x === y || pl(x) === y || x === pl(y) || (!!pl(x) && pl(x) === pl(y));
  return function (a, seg) {
    const A = cut(a), B = cut(seg);
    if (!A.length || A.length !== B.length) return false;
    const used = B.map(() => false);
    return A.every(x => {
      const j = B.findIndex((y, i) => !used[i] && eq(x, y));
      if (j < 0) return false;
      used[j] = true; return true;
    });
  };
}

/* שורש עמוק · קילוף חוזר של כל אות שימוש. תנאי הכרחי להתאמה בכל תצורה. */
function deepKey(ctx, s) {
  const STOP = new Set(Array.from(ctx.PARTICLE_STOP));
  const deep = w => { let x = w; while (x.length > 2 && ALL_PEEL.includes(x[0])) x = x.slice(1); return x; };
  const t = String(s).split(/\s+/).filter(x => x && !STOP.has(x)).map(deep).sort();
  return t.length + '|' + t.join(' ');
}

/* ===== היקום · כל מקטע קביל של כל כרטיס, עם בעליו ===== */
function buildUniverse() {
  const segOwners = new Map();     // מקטע -> Set(lang:key)
  const cards = [];
  for (const L of ['he', 'en']) {
    const ctx = getCtx(L);
    for (const w of Array.from(ctx.BANK)) {
      const key = L + ':' + ctx.K(w.term);
      const segs = Array.from(ctx.meaningSegs(w.meaning)).filter(Boolean);
      const allow = new Set([key]);
      for (const t of Array.from(ctx.glossAlts(w))) { allow.add('he:' + ctx.K(t)); allow.add('en:' + ctx.K(t)); }
      cards.push({ L, ctx, w, key, segs, allow });
      for (const s of segs) {
        let o = segOwners.get(s); if (!o) { o = new Set(); segOwners.set(s, o); }
        o.add(key);
      }
    }
  }
  return { segOwners, cards };
}

/* ===== מועמד 1 · רשימת הקילוף ושומר האורך ===== */
function measurePeel(U) {
  const he = getCtx('he');
  const base = makeParticle(he, BASE_PEEL, BASE_MINLEN);

  /* קיבוץ לפי שורש עמוק · תנאי הכרחי, ולכן הקיבוץ שלם */
  const byKey = new Map();
  for (const s of U.segOwners.keys()) {
    const k = deepKey(he, s);
    let a = byKey.get(k); if (!a) { a = []; byKey.set(k, a); }
    a.push(s);
  }

  const CONFIGS = [
    { id: 'base', peel: BASE_PEEL, minLen: 3, label: 'הבסיס · `הלבכו` · `length > 3`' },
    { id: '+ש', peel: BASE_PEEL + 'ש', minLen: 3, label: '‏+ ש' },
    { id: '+מ', peel: BASE_PEEL + 'מ', minLen: 3, label: '‏+ מ' },
    { id: '+שמ', peel: BASE_PEEL + 'שמ', minLen: 3, label: '‏+ ש ו-מ' },
    { id: 'len2', peel: BASE_PEEL, minLen: 2, label: 'הבסיס · שומר `length > 2`' },
    { id: '+ש/len2', peel: BASE_PEEL + 'ש', minLen: 2, label: '‏+ ש · שומר `length > 2`' },
    { id: '+שמ/len2', peel: BASE_PEEL + 'שמ', minLen: 2, label: '‏+ ש ו-מ · שומר `length > 2`' },
  ];

  const out = [];
  for (const cfg of CONFIGS) {
    const pm = makeParticle(he, cfg.peel, cfg.minLen);
    let cross = 0, pairs = 0;
    const ex = [];
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      for (const a of group) {
        for (const b of group) {
          if (a === b) continue;
          pairs++;
          if (base(a, b)) continue;              // כבר מתקבל היום · לא חדש
          if (!pm(a, b)) continue;
          /* ‏b הוא מקטע של כרטיס כלשהו · האם a שייך לכרטיס **אחר** מבעליו של b? */
          const ownersB = U.segOwners.get(b), ownersA = U.segOwners.get(a);
          let foreign = null;
          for (const oa of ownersA) if (!ownersB.has(oa)) { foreign = oa; break; }
          if (!foreign) continue;
          cross++;
          if (ex.length < 8) ex.push({ typed: a, seg: b, foreign });
        }
      }
    }
    out.push({ ...cfg, pairs, cross, ex });
  }
  return out;
}

/* ===== מועמד 1ב · השארית · מה החוק מקבל שאינו במאגר =====
 * ⚠ **תקרה מוצהרת:** נמנות וריאציות של **טוקן אחד** בכל מקטע. זה בדיוק המקרה
 * של H16-4 ושל הרוב המכריע במציאות, אבל אינו כל מרחב החוק. הוא נאמר ולא נבלע.
 */
function measureResidue(U, letters, minLen) {
  const he = getCtx('he');
  const base = makeParticle(he, BASE_PEEL, BASE_MINLEN);
  const pm = makeParticle(he, BASE_PEEL + letters, minLen);
  const { buildLexicon } = require('./lib/lexicon.js');
  const LEX = buildLexicon();
  const res = { total: 0, newly: 0, realWord: 0, bankAnswer: 0, notWord: 0, ex: [] };
  const seen = new Set();
  for (const s of U.segOwners.keys()) {
    const toks = String(s).split(' ').filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      for (const p of letters) {
        for (const v of [p + toks[i], toks[i].startsWith(p) && toks[i].length > minLen ? toks[i].slice(1) : null]) {
          if (!v) continue;
          const c = toks.slice(); c[i] = v;
          const a = c.join(' ');
          const k = a + '' + s;
          if (seen.has(k)) continue;
          seen.add(k);
          res.total++;
          if (base(a, s) || !pm(a, s)) continue;
          res.newly++;
          if (U.segOwners.has(a)) { res.bankAnswer++; continue; }
          const parts = a.split(' ').filter(Boolean);
          if (parts.every(x => LEX.he.has(x))) { res.realWord++; if (res.ex.length < 6) res.ex.push({ a, s }); }
          else res.notWord++;
        }
      }
    }
  }
  return res;
}

/* ===== מועמד 2 · פטור מווטו הלקסיקון למילות שימוש =====
 * הרשימה **נכתבה כאן** · מחלקה סגורה, בלתי תלויה במאגר, ולכן שורדת הוספות
 * עתידיות. ⛔ היא **מוצעת ונמדדת**, לא נשלחת: הנזק נמדד למטה, מילה-מילה.
 */
const FUNC_WORDS = ('ש אשר כי אם או אך אבל אלא גם אף רק כאשר כש בעוד בזמן כדי למען מפני משום כיוון היות ' +
  'של את עם על אל מן אצל בין לפי כמו עד מאז לקראת בלי ללא בעד נגד לפני אחרי תחת מעל מתחת בתוך מחוץ לצד ליד ' +
  'בו בה בהם בהן שבו שבה שבהם שבהן לו לה להם להן שלו שלה שלהם שלהן עליו עליה עליהם ממנו ממנה מהם אליו אליה ' +
  'איתו איתה עמו עמה בכך לכך מכך זה זו זאת אלה אלו הוא היא הם הן אותו אותה אותם אותן ' +
  'כל כאלה כזה יותר פחות מאוד מאד כבר עוד שוב תמיד אולי אינו אינה אינם שאינו שאינה שיש שאין שניתן שאפשר').split(/\s+/);

function measureFuncExempt(U) {
  const he = getCtx('he');
  const norm = new Set(FUNC_WORDS.map(w => he.norm(w)).filter(Boolean));

  /* ⚠ הנזק · האם מילת שימוש היא בעצמה תשובה קבילה של כרטיס · **מנייה מלאה** */
  const damage = [];
  for (const w of Array.from(norm).sort()) {
    const owners = U.segOwners.get(w);
    if (owners && owners.size) damage.push({ word: w, owners: Array.from(owners).join(' · ') });
  }

  /* כמה שורות E3 בקורפוס משתחררות · שורה שכל הטוקנים שהשתנו בה הם מילות שימוש */
  const dx = new Map();
  for (const f of ['answers-dx-he.jsonl', 'answers-dx-en.jsonl']) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, 'utf8').trim().split('\n')) { const r = JSON.parse(l); dx.set(r.id, r); }
  }
  const CT = { he: getCtx('he'), en: getCtx('en') };
  let e3 = 0, freed = 0, freedNeg = 0, freedPos = 0;
  const ex = [];
  for (const f of ['answers-he.jsonl', 'answers-en.jsonl']) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, 'utf8').trim().split('\n')) {
      const r = JSON.parse(l);
      if (r.direction !== 'gloss') continue;
      const d = dx.get(r.id);
      if (!d || !d.edgeWhy || d.edgeWhy.indexOf('E3') < 0 || !d.lexReal) continue;
      e3++;
      const ctx = CT[r.lang];
      const a = ctx.norm(r.typed);
      let allFunc = false;
      for (const s of Array.from(ctx.meaningSegs(r.card_gloss))) {
        const at = a.split(' ').filter(Boolean), st = s.split(' ').filter(Boolean);
        if (at.length !== st.length) continue;
        const diff = at.filter((x, i) => x !== st[i]);
        if (!diff.length) continue;
        if (diff.every(x => norm.has(x))) { allFunc = true; break; }
      }
      if (!allFunc) continue;
      freed++;
      if (r.source_class.startsWith('neg-')) freedNeg++; else freedPos++;
      if (ex.length < 8) ex.push({ id: r.id, cls: r.source_class, term: r.card_term, typed: r.typed });
    }
  }
  return { listSize: norm.size, damage, e3, freed, freedNeg, freedPos, ex };
}

/* ===== מועמד 3 · seg-concat · חלקי מול מלא ===== */
function measureConcat() {
  const CT = { he: getCtx('he'), en: getCtx('en') };
  const dx = new Map();
  for (const f of ['answers-dx-he.jsonl', 'answers-dx-en.jsonl']) {
    for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n')) { const r = JSON.parse(l); dx.set(r.id, r); }
  }
  const res = { total: 0, full: 0, partial: 0, partialToday: 0, fullToday: 0, ex: [] };
  for (const f of ['answers-he.jsonl', 'answers-en.jsonl']) {
    for (const l of fs.readFileSync(path.join(OUT, f), 'utf8').trim().split('\n')) {
      const r = JSON.parse(l);
      if (r.source_class !== 'seg-concat') continue;
      const ctx = CT[r.lang];
      const segs = Array.from(ctx.meaningSegs(r.card_gloss));
      const d = dx.get(r.id);
      res.total++;
      const isFull = segs.length === 2;      // צירוף זוג כשיש בדיוק שניים = כל המקטעים
      if (isFull) { res.full++; if (d.today) res.fullToday++; }
      else { res.partial++; if (d.today) res.partialToday++; if (res.ex.length < 6) res.ex.push({ term: r.card_term, typed: r.typed, segs: segs.length }); }
    }
  }
  return res;
}

function md(peel, resShin, resMem, func, concat) {
  const L = [];
  const n = x => Number(x || 0).toLocaleString('en-US');
  L.push('# שלושת המועמדים · מדידה', '');
  L.push('⛔ **מדידה בלבד · שום דבר כאן לא נשלח, ו-`app.js` לא נגעו בו.**');
  L.push('המועמדים עלו מחמשת המקרים של חגי (16.8). חמישה מקרים אינם התפלגות —');
  L.push('הם אומרים לאן להסתכל. ההכרעה נקבעת על האוכלוסייה ועל `bank_gate`.', '');

  L.push('## מועמד 1 · רשימת הקילוף של `particleMatch`', '');
  L.push('הקריטריון: מחרוזת שמתקבלת על כרטיס A והיא תשובה קבילה של כרטיס **אחר** —');
  L.push('בדיוק ההגדרה של `bank_gate`. המדידה **ממצה**: קיבוץ לפי "שורש עמוק" הוא');
  L.push('תנאי הכרחי להתאמה, ולכן העל-קבוצה שלמה.', '');
  L.push('| תצורה | זוגות שנבדקו | ⛔ התנגשויות חוצות-כרטיסים |', '|---|---:|---:|');
  for (const c of peel) L.push(`| ${c.label} | ${n(c.pairs)} | **${c.cross}** |`);
  L.push('');
  for (const c of peel) {
    if (!c.ex.length) continue;
    L.push(`**${c.label} · דוגמאות להתנגשות:**`, '', '| מוקלד | על המקטע | שייך גם ל |', '|---|---|---|');
    for (const e of c.ex) L.push(`| \`${e.typed}\` | \`${e.seg}\` | ${e.foreign} |`);
    L.push('');
  }
  L.push('### השארית · מה החוק מקבל שאינו במאגר', '');
  L.push('⚠ **תקרה מוצהרת:** נמנות וריאציות של **טוקן אחד** בכל מקטע. זה המקרה של');
  L.push('H16-4 ושל הרוב המכריע במציאות, אבל אינו כל מרחב החוק.', '');
  L.push('| תוספת | מועמדים | חדשות שמתקבלות | מהן תשובת מאגר | מילה עברית אמיתית | אינן מילה |');
  L.push('|---|---:|---:|---:|---:|---:|');
  L.push(`| ש | ${n(resShin.total)} | **${n(resShin.newly)}** | ${resShin.bankAnswer} | ${resShin.realWord} | ${resShin.notWord} |`);
  L.push(`| מ | ${n(resMem.total)} | **${n(resMem.newly)}** | ${resMem.bankAnswer} | ${resMem.realWord} | ${resMem.notWord} |`);
  L.push('');
  if (resMem.ex.length) {
    L.push('**מ · דוגמאות למילים אמיתיות שהחוק היה מקבל:**', '', '| מוקלד | על המקטע |', '|---|---|');
    for (const e of resMem.ex) L.push(`| \`${e.a}\` | \`${e.s}\` |`);
    L.push('');
  }

  L.push('## מועמד 2 · פטור מווטו הלקסיקון למילות שימוש', '');
  L.push(`רשימה סגורה שנכתבה כאן · **${func.listSize}** מילים · **בלתי תלויה במאגר**, ולכן שורדת הוספות עתידיות.`, '');
  L.push('| | |', '|---|---:|');
  L.push(`| שורות E3 בקורפוס (וטו לקסיקון הוא החוסם) | ${n(func.e3)} |`);
  L.push(`| מהן משתחררות בפטור | **${n(func.freed)}** |`);
  L.push(`| מתוכן ממחלקות חיוביות | ${func.freedPos} |`);
  L.push(`| ⚠ מתוכן ממחלקות שליליות | **${func.freedNeg}** |`, '');
  L.push('### ⚠ הנזק · מנייה מלאה, לא דגימה', '');
  L.push(`**${func.damage.length}** מילים מהרשימה הן בעצמן תשובה קבילה של כרטיס.`);
  if (func.damage.length) {
    L.push('אלה **חייבות לצאת מהרשימה** — בדיוק בשבילן הווטו קיים.', '', '| מילה | הכרטיס שמחזיק אותה |', '|---|---|');
    for (const d of func.damage) L.push(`| \`${d.word}\` | ${d.owners} |`);
  }
  L.push('');
  if (func.ex.length) {
    L.push('**דוגמאות לשורות שמשתחררות:**', '', '| מחלקה | כרטיס | הוקלד |', '|---|---|---|');
    for (const e of func.ex) L.push(`| ${e.cls} | ${e.term} | \`${e.typed}\` |`);
    L.push('');
  }
  L.push('⚠ ‏`freedNeg` הוא **המספר שמכריע**, והוא אינו "נזק" אוטומטית: `source_class`');
  L.push('הוא מוצא ולא פסק. אבל כל שורה שם צריכה פסק מורה לפני שמישהו נוגע בווטו.', '');

  L.push('## מועמד 3 · `seg-concat` · חלקי מול מלא', '');
  L.push('| | שורות | מתקבלות היום |', '|---|---:|---:|');
  L.push(`| צירוף **מלא** (כל המקטעים) | ${concat.full} | **${concat.fullToday}** |`);
  L.push(`| צירוף **חלקי** (תת-קבוצה) | ${concat.partial} | **${concat.partialToday}** |`);
  L.push(`| סה"כ | ${concat.total} | ${concat.fullToday + concat.partialToday} |`, '');
  L.push('⭐ **וזו התשובה למה H16-3 נכשל:** `norm` מסירה את הפסיק, ולכן צירוף **כל**');
  L.push('המקטעים בסדרם שווה ל-`norm(meaning)` ומתקבל בשכבה הראשונה. צירוף **חלקי**');
  L.push('(שניים מתוך שלושה, כמו `cosmopolitan`) אינו שווה לכלום ואף שכבה אינה מגיעה אליו.', '');
  if (concat.ex.length) {
    L.push('| כרטיס | מקטעים | הוקלד |', '|---|---:|---|');
    for (const e of concat.ex) L.push(`| ${e.term} | ${e.segs} | \`${e.typed}\` |`);
    L.push('');
  }
  return L.join('\n');
}

if (require.main === module) {
  const U = buildUniverse();
  process.stdout.write(`יקום · ${U.cards.length} כרטיסים · ${U.segOwners.size} מקטעים ייחודיים\n`);
  const peel = measurePeel(U);
  for (const c of peel) process.stdout.write(`  ${c.id.padEnd(10)} זוגות ${String(c.pairs).padStart(7)} · חוצות ${c.cross}\n`);
  const resShin = measureResidue(U, 'ש', 3);
  const resMem = measureResidue(U, 'מ', 3);
  process.stdout.write(`שארית · ש: חדשות ${resShin.newly} (מילים ${resShin.realWord}) · מ: חדשות ${resMem.newly} (מילים ${resMem.realWord})\n`);
  const func = measureFuncExempt(U);
  process.stdout.write(`מילות שימוש · רשימה ${func.listSize} · משחררת ${func.freed}/${func.e3} · נזק ${func.damage.length}\n`);
  const concat = measureConcat();
  process.stdout.write(`seg-concat · מלא ${concat.full} (מתקבל ${concat.fullToday}) · חלקי ${concat.partial} (מתקבל ${concat.partialToday})\n`);
  fs.writeFileSync(path.join(OUT, 'candidates-report.md'), md(peel, resShin, resMem, func, concat), 'utf8');
  process.stdout.write('נכתב ל-out/candidates-report.md\n');
}

module.exports = { makeParticle, deepKey, buildUniverse, measurePeel, measureResidue, measureFuncExempt, measureConcat, FUNC_WORDS };
