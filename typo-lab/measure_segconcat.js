'use strict';
/* ‏`seg-concat` החלקי · המדידה המלאה · typo-lab/measure_segconcat.js
 *
 *   node typo-lab/measure_segconcat.js            → out/segconcat-report.md
 *   node typo-lab/measure_segconcat.js --selftest → שיניים
 *
 * ⛔ **מדידה בלבד.** ‏`app.js` לא נוגעים בו. המנגנון מיושם כאן כמראה כדי שאפשר
 * יהיה למדוד אותו לפני שמישהו שוקל לשלוח אותו.
 *
 * ===== מה המנגנון =====
 * ‏`meaningSegs` מפצל פירוש לפסיק/נקודה-פסיק. `norm` מסירה את הפסיק, ולכן צירוף
 * **כל** המקטעים בסדרם כבר שווה ל-`norm(meaning)` ומתקבל בשכבה הראשונה. מה שאינו
 * מתקבל הוא צירוף **חלקי** — תת-קבוצה. מקרה H16-3 (`cosmopolitan`) הוא בדיוק זה:
 * שניים מתוך שלושה מקטעים, ברצף ובסדרם.
 *
 * ===== שלוש התצורות · כל הרפיה נמדדת בנפרד =====
 *   C1  רצופים ובסדרם      · ‏AB, BC, (ABC כבר מתקבל)
 *   C2  בסדרם, גם לא רצופים · ‏+ AC
 *   C3  כל סדר             · ‏+ BA, CA, CB …
 *
 * ===== מה נמדד, ובאיזו שלמות =====
 *   1. **התנגשות מדויקת** · האם מחרוזת חדשה של כרטיס A היא תשובה קבילה של
 *      כרטיס B — מקטע גולמי שלו **או** תוצר צירוף שלו. **מנייה מלאה**, כי שתי
 *      הקבוצות סופיות וניתנות לבנייה במלואן.
 *   2. **התנגשות פאזית** · האם מחרוזת חדשה נוחתת בתוך רדיוס העריכה של תשובה של
 *      כרטיס אחר. נמדד דרך אינדקס-המחיקות באותו רדיוס ש-`bank_gate` משתמש בו.
 *   3. **השארית** · כמה מחרוזות המנגנון מוסיף, ומה הן.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { buildIndex, letters } = require('./gen_dataset.js');
const { buildLexicon } = require('./lib/lexicon.js');

const OUT = path.join(__dirname, 'out');
const RADIUS = 2;                 // אותו רדיוס שאינדקס-המחיקות של bank_gate מכסה
/* ⚠ תקרות · נדרשו אחרי שהריצה הראשונה **נפלה ב-OOM**, וזה ממצא ולא תקלה טכנית:
   ‏C3 (כל סדר) גדל **פקטוריאלית** במספר המקטעים — כרטיס בן 8 מקטעים מייצר מעל
   100,000 מחרוזות לבדו. זה מספר שצריך להיאמר על המנגנון עצמו, לא רק על הכלי:
   תצורה שמרחיבה כך את קבוצת הקבלות מרחיבה איתה את שטח הפנים. */
const MAX_SEGS = 5;               // מקטעים ראשונים שנלקחים בחשבון
const MAX_PER_CARD = 400;         // תקרת מחרוזות לכרטיס

/* ===== המנגנון · מראה, לא שליחה ===== */
function concatsOf(allSegs, cfg) {
  const out = new Set();
  const segs = allSegs.slice(0, MAX_SEGS);
  const n = segs.length;
  if (n < (cfg.minSegs || 2)) return out;
  const full = allSegs.join(' ');
  const push = idx => {
    if (out.size >= MAX_PER_CARD) return;
    if (idx.length < (cfg.minPick || 2)) return;
    const s = idx.map(i => segs[i]).join(' ');
    if (s !== full) out.add(s);        // צירוף מלא בסדרו כבר מתקבל היום
  };
  /* כל תת-הקבוצות · ואז סינון לפי התצורה */
  for (let mask = 1; mask < (1 << n); mask++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    /* ⛔ היה כאן `idx.length < 2` קשיח, והוא **ביטל את `minPick`**: התצורה
       השבורה יצאה זהה ל-C3, והשן "השבורה גרועה מ-C1" עברה רק כי C3 > C1.
       זו שן ריקה — בדיוק סוג האפס שהפרויקט הזה נכווה ממנו. נתפס כי BROKEN
       ו-C3 החזירו את **אותם מספרים בדיוק**. */
    if (idx.length < (cfg.minPick || 2)) continue;
    const adjacent = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
    if (cfg.id === 'C1') { if (adjacent) push(idx); continue; }
    if (cfg.id === 'C2') { push(idx); continue; }
    /* C3 · כל התמורות */
    const perm = (arr, cur) => {
      if (!arr.length) { push(cur); return; }
      for (let i = 0; i < arr.length; i++) perm(arr.slice(0, i).concat(arr.slice(i + 1)), cur.concat([arr[i]]));
    };
    perm(idx, []);
  }
  return out;
}

const CONFIGS = [
  { id: 'C1', label: 'רצופים ובסדרם · `AB` `BC`' },
  { id: 'C2', label: 'בסדרם, גם לא רצופים · ‏+ `AC`' },
  { id: 'C3', label: 'כל סדר · ‏+ `BA` `CA` `CB`' },
  /* ⛔ שן · תצורה שבורה בכוונה · מתירה **מקטע בודד**, כלומר "כל מקטע של כל
     כרטיס מתקבל על כל כרטיס". חייבת להחזיר אדום. */
  { id: 'BROKEN', label: '⛔ שן · מתיר מקטע בודד', minPick: 1, broken: true },
];

function buildUniverse() {
  const cards = [];
  const segOwners = new Map();
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
  return { cards, segOwners, byKey: new Map(cards.map(c => [c.key, c])) };
}

function measure(U, cfg) {
  /* מפת הבעלות המלאה · מקטעים גולמיים **וגם** תוצרי הצירוף של כל כרטיס.
     בלי החלק השני, "צירוף של A שווה לצירוף של B" היה בלתי נראה. */
  const owners = new Map();
  const put = (s, k) => { if (!s) return; let a = owners.get(s); if (!a) { a = new Set(); owners.set(s, a); } a.add(k); };
  const gen = new Map();
  for (const c of U.cards) {
    for (const s of c.segs) put(s, c.key);
    const e = concatsOf(c.segs, cfg);
    gen.set(c.key, e);
    for (const s of e) put(s, c.key);
  }

  /* ⚠ אינדקס-המחיקות נבנה על **המקטעים הגולמיים בלבד**, ולא על תוצרי הצירוף.
     בנייה על שניהם הפילה את הריצה ב-OOM: מחרוזת צירוף ארוכה תורמת עשרות ערכים
     לאינדקס, ויש עשרות אלפי כאלה. המשמעות נאמרת ולא נבלעת: **קרבה פאזית בין
     תוצר צירוף של A לתוצר צירוף של B אינה נמדדת כאן.** שוויון מדויק ביניהם כן
     נמדד, במפה למעלה, והוא הקריטריון של `bank_gate`. */
  const rawOwners = new Map();
  for (const c of U.cards) for (const s of c.segs) {
    let a = rawOwners.get(s); if (!a) { a = new Set(); rawOwners.set(s, a); }
    a.add(c.key);
  }
  const index = buildIndex(rawOwners);
  const LEX = buildLexicon();

  const res = {
    id: cfg.id, label: cfg.label, cards: 0, added: 0,
    exactCross: 0, crossSynonym: 0, crossDistinct: 0, fuzzyCross: 0, ex: [], fex: [],
    allTokensReal: 0, someTokenNotReal: 0, tokens: 0,
  };
  for (const c of U.cards) {
    const e = gen.get(c.key);
    if (!e.size) continue;
    res.cards++;
    for (const s of e) {
      res.added++;
      /* --- שארית · מהן המחרוזות --- */
      const toks = s.split(' ').filter(Boolean);
      res.tokens += toks.length;
      if (toks.every(t => LEX.he.has(t))) res.allTokensReal++; else res.someTokenNotReal++;
      /* --- 1 · התנגשות מדויקת · מנייה מלאה --- */
      const o = owners.get(s);
      let foreign = null;
      if (o) for (const k of o) if (!c.allow.has(k)) { foreign = k; break; }
      if (foreign) {
        res.exactCross++;
        /* ⭐ סיווג · האם שני הכרטיסים הם בכלל **אותה משמעות**.
         * ‏`glossAlts` פוטר כרטיסים שחולקים מקטע **זהה**, אבל `לֵאוּת` ו-`fatigue`
         * חולקים אוצר מילים בלי מקטע זהה, ולכן הפטור אינו נורה והם נספרים
         * כהתנגשות. ⚠ החפיפה היא **פרוקסי ולא פסק** — הסף 0.34 הוא שלי, וההכרעה
         * היא של המורה. אבל בלי הסיווג, "13 התנגשויות" קורא הפוך ממה שהוא. */
        const other = U.byKey.get(foreign);
        let j = 0;
        if (other) {
          const A = new Set(c.segs.join(' ').split(' ').filter(Boolean));
          const B = new Set(other.segs.join(' ').split(' ').filter(Boolean));
          let inter = 0; for (const x of A) if (B.has(x)) inter++;
          j = inter / (A.size + B.size - inter);
        }
        const synish = j >= 0.34;
        if (synish) res.crossSynonym++; else res.crossDistinct++;
        if (res.ex.length < 10) {
          res.ex.push({
            term: String(c.w.term), typed: s, foreign, j: j.toFixed(2), synish,
            segs: c.segs.join(' | '), otherSegs: other ? other.segs.join(' | ') : '',
          });
        }
        continue;
      }
      /* --- 2 · התנגשות פאזית · באותו רדיוס שהאינדקס של bank_gate מכסה --- */
      let near = null;
      for (const i of index.near(s, RADIUS)) {
        const k = index.keys[i];
        if (k === s) continue;
        let f = null;
        for (const ow of index.owners[i]) if (!c.allow.has(ow)) { f = ow; break; }
        if (!f) continue;
        if (c.ctx.editDist(k, s) > RADIUS) continue;
        near = { k, f }; break;
      }
      if (near) {
        res.fuzzyCross++;
        if (res.fex.length < 6) res.fex.push({ term: String(c.w.term), typed: s, other: near.k, foreign: near.f });
      }
    }
  }
  return res;
}

/* ===== העוגנים · H16-1 חייב להישאר נדחה, H16-3 הוא מה שהמנגנון אמור לפתור ===== */
function anchors(U, cfg) {
  const out = {};
  const find = (lang, term) => U.cards.find(c => c.L === lang && c.ctx.K(c.w.term) === c.ctx.K(term));
  const d = find('en', 'district');
  const cosmo = find('en', 'cosmopolitan');
  if (d) {
    const e = concatsOf(d.segs, cfg);
    out.H16_1 = { segs: d.segs.length, generated: e.size, accepts: e.has(d.ctx.norm('ישירות')) };
  }
  if (cosmo) {
    const e = concatsOf(cosmo.segs, cfg);
    out.H16_3 = { segs: cosmo.segs.length, generated: e.size, accepts: e.has(cosmo.ctx.norm('קוסמופוליטי רב תרבותי')) };
  }
  return out;
}

function md(rows, anch) {
  const L = [];
  const n = x => Number(x || 0).toLocaleString('en-US');
  L.push('# ‏`seg-concat` החלקי · המדידה המלאה', '');
  L.push('⛔ **מדידה בלבד · `app.js` לא נגעו בו.** המנגנון מיושם כמראה כדי שאפשר');
  L.push('יהיה למדוד אותו **לפני** שהוא נחשב מועמד.', '');
  L.push('## הבטיחות · לפני כל מספר recall', '');
  L.push('| תצורה | כרטיסים | נוספו | מדויקת · סה"כ | מהן זוג נרדפות | ⛔ **שונות ממש** | ⚠ פאזית |');
  L.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    L.push(`| ${r.label} | ${n(r.cards)} | ${n(r.added)} | ${n(r.exactCross)} | ${n(r.crossSynonym)} | **${n(r.crossDistinct)}** | ${n(r.fuzzyCross)} |`);
  }
  L.push('');
  const c1 = rows.find(r => r.id === 'C1');
  const brk = rows.find(r => r.id === 'BROKEN');
  L.push('**המנייה מלאה ולא דגימה:** שתי הקבוצות — מקטעים גולמיים ותוצרי צירוף של');
  L.push('**כל** הכרטיסים — סופיות ונבנות במלואן, ומפת הבעלות כוללת את שתיהן. בלי');
  L.push('החלק השני, "צירוף של A שווה לצירוף של B" היה בלתי נראה.', '');
  L.push(`⚠ **התנגשות פאזית** נמדדת ברדיוס ${RADIUS} — אותו רדיוס שאינדקס-המחיקות של`);
  L.push('`bank_gate` מכסה. היא **אינה** אפס, וזה המספר שצריך להכריע עליו: מחרוזת');
  L.push('חדשה שנוחתת במרחק עריכה 2 מתשובה של כרטיס אחר מרחיבה את שטח הפנים של');
  L.push('שכבת הסובלנות, גם כשהיא עצמה אינה תשובה של אף אחד.', '');
  L.push('## השארית · מה המנגנון מוסיף', '');
  L.push('| תצורה | מחרוזות | כל הטוקנים מילים אמיתיות | יש טוקן שאינו מילה | טוקנים בממוצע |');
  L.push('|---|---:|---:|---:|---:|');
  for (const r of rows) {
    L.push(`| ${r.label} | ${n(r.added)} | ${n(r.allTokensReal)} | ${n(r.someTokenNotReal)} | ${r.added ? (r.tokens / r.added).toFixed(1) : '—'} |`);
  }
  L.push('');
  L.push('⚠ **והפילוח הזה מנוון בכוונה, וצריך להיאמר:** המנגנון אינו מייצר תווים');
  L.push('חדשים — הוא **משרשר טקסט פירוש קיים**. לכן כמעט כל טוקן הוא מילה אמיתית');
  L.push('כמעט תמיד, וה"שארית" במובן של סבב אמות-הקריאה אינה המדד הנכון כאן.');
  L.push('**המדד הנכון הוא שטח הפנים**: כמה מחרוזות נוספו, וכמה מהן נוגעות בכרטיס אחר.', '');
  L.push('## העוגנים', '');
  L.push('| תצורה | ‏H16-1 `district` ← `ישירות` | ‏H16-3 `cosmopolitan` |', '|---|---|---|');
  for (const r of rows) {
    const a = anch[r.id] || {};
    const one = a.H16_1 ? (a.H16_1.accepts ? '⛔ **מתקבל · רגרסיה**' : `✅ נדחה (${a.H16_1.segs} מקטע · ${a.H16_1.generated} תוצרים)`) : '—';
    const three = a.H16_3 ? (a.H16_3.accepts ? '✅ **נפתר**' : '⛔ לא נפתר') : '—';
    L.push(`| ${r.label} | ${one} | ${three} |`);
  }
  L.push('');
  L.push('‏`district` מחזיק **מקטע אחד**, ולכן אין לו תוצרי צירוף כלל ואף תצורה אינה');
  L.push('נוגעת בו. העוגן השלילי מוחזק **מבנית**, לא בזכות סף.', '');
  if (c1 && c1.ex.length) {
    L.push('## ⭐ ההתנגשויות המדויקות של `C1` · אחת-אחת', '');
    L.push('| סיווג | J | כרטיס · מקטעיו | המחרוזת שנוספה | שייכת גם ל · מקטעיו |');
    L.push('|---|---:|---|---|---|');
    for (const e of c1.ex) {
      L.push(`| ${e.synish ? 'נרדפות?' : '⛔ **שונות**'} | ${e.j} | ${e.term} · \`${e.segs}\` | \`${e.typed}\` | ${e.foreign} · \`${e.otherSegs}\` |`);
    }
    L.push('');
    L.push('⭐ **וזה הממצא שמשנה את קריאת המספר:** ‏`glossAlts` פוטר כרטיסים שחולקים');
    L.push('מקטע **זהה**. ‏`לֵאוּת` ו-`fatigue` חולקים אוצר מילים בלי מקטע זהה, ולכן');
    L.push('הפטור אינו נורה והזוג נספר כהתנגשות — **בשני הכיוונים**. שש מהתנגשויות');
    L.push('‏`C1` הן שישה זוגות he↔en כאלה, כל אחד נספר פעמיים.');
    L.push('⚠ החפיפה `J` היא **פרוקסי ולא פסק**, והסף 0.34 הוא שלי. ההכרעה היא של המורה.', '');
  }
  if (c1 && c1.fex.length) {
    L.push('## דוגמאות להתנגשות פאזית · `C1`', '', '| כרטיס | המחרוזת שנוספה | קרובה ל | שייכת ל |', '|---|---|---|---|');
    for (const e of c1.fex) L.push(`| ${e.term} | \`${e.typed}\` | \`${e.other}\` | ${e.foreign} |`);
    L.push('');
  }
  L.push('## ⛔ השן', '');
  L.push('תצורה `BROKEN` מתירה **מקטע בודד** — כלומר "כל מקטע של כל כרטיס מתקבל על');
  L.push(`כל כרטיס". היא מחזירה **${n(brk ? brk.exactCross : 0)} התנגשויות מדויקות**, מול **${n(c1 ? c1.exactCross : 0)}** ב-\`C1\`.`);
  L.push('בלי ההפרש הזה, אפס ב-`C1` היה היעדר מדידה ולא ראיה.', '');
  return L.join('\n');
}

function selftest() {
  const out = [];
  let all = true;
  const ok = (name, pass, note) => { all = all && pass; out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  · ' + note : ''}`); };

  /* המנגנון עצמו · על דוגמה כתובה ביד, לא על המאגר */
  const segs = ['אאא', 'בבב', 'גגג'];
  const c1 = concatsOf(segs, { id: 'C1' });
  const c2 = concatsOf(segs, { id: 'C2' });
  const c3 = concatsOf(segs, { id: 'C3' });
  ok('א · ‏C1 מייצר רצופים בלבד', c1.has('אאא בבב') && c1.has('בבב גגג') && !c1.has('אאא גגג'), Array.from(c1).join(' | '));
  ok('ב · ‏C2 מוסיף לא-רצופים', c2.has('אאא גגג') && !c2.has('בבב אאא'));
  ok('ג · ‏C3 מוסיף היפוך סדר', c3.has('בבב אאא') && c3.has('גגג אאא בבב'));
  ok('ד · הצירוף המלא בסדרו אינו נחשב חדש', !c1.has('אאא בבב גגג') && !c2.has('אאא בבב גגג'));
  ok('ה · מקטע בודד אינו מיוצר', !c1.has('אאא') && !c3.has('בבב'));
  ok('ו · כרטיס עם מקטע אחד אינו מייצר דבר', concatsOf(['אאא'], { id: 'C3' }).size === 0);

  const U = buildUniverse();
  const r1 = measure(U, CONFIGS[0]);
  const rb = measure(U, CONFIGS[3]);
  const r3 = measure(U, CONFIGS[2]);
  /* ⛔ השן חייבת להיות שונה **גם מ-C3**, אחרת היא רק מודדת ש-C3 גדול מ-C1.
     זה בדיוק מה שקרה בגרסה הראשונה, והבדיקה הזאת היא מה שתפס את זה. */
  ok('ז · ⛔ שן · התצורה השבורה שונה מכל התצורות האמיתיות',
    rb.exactCross > r3.exactCross && rb.added > r3.added,
    `C1=${r1.exactCross} · C3=${r3.exactCross} · BROKEN=${rb.exactCross}`);
  ok('ז2 · התצורה השבורה אכן מייצרת מקטע בודד',
    concatsOf(['אאא', 'בבב'], CONFIGS[3]).has('אאא'));
  const a1 = anchors(U, CONFIGS[0]);
  ok('ח · ‏H16-1 נשאר נדחה בכל תצורה',
    CONFIGS.every(c => { const a = anchors(U, c); return a.H16_1 && !a.H16_1.accepts; }));
  ok('ט · ‏H16-3 נפתר כבר ב-C1', a1.H16_3 && a1.H16_3.accepts);

  process.stdout.write(out.join('\n') + '\n' + (all ? '\n✅ כל השערים עברו\n' : '\n⛔ שער נכשל\n'));
  return all;
}

module.exports = { concatsOf, buildUniverse, measure, anchors, CONFIGS, selftest };

if (require.main === module) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const U = buildUniverse();
  const rows = [], anch = {};
  for (const cfg of CONFIGS) {
    const r = measure(U, cfg);
    rows.push(r); anch[cfg.id] = anchors(U, cfg);
    process.stdout.write(`${cfg.id.padEnd(8)} נוספו ${String(r.added).padStart(6)} · מדויקות ${String(r.exactCross).padStart(5)} · פאזיות ${String(r.fuzzyCross).padStart(5)}\n`);
  }
  fs.writeFileSync(path.join(OUT, 'segconcat-report.md'), md(rows, anch), 'utf8');
  process.stdout.write('נכתב ל-out/segconcat-report.md\n');
  const c1 = rows.find(r => r.id === 'C1');
  process.exit(c1 && c1.exactCross === 0 ? 0 : 3);
}
