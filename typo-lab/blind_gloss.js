'use strict';
/* ⭐ ביקורת עיוורת על הפירושים · typo-lab/blind_gloss.js
 *
 *   node typo-lab/blind_gloss.js --selftest      ⛔ שיניים · יוצא 1 כשקלט פגום עובר
 *   node typo-lab/blind_gloss.js --emit1         → out/blind/batch1/B-NN.tsv   (מילה בלבד)
 *   node typo-lab/blind_gloss.js --ingest1       ← out/blind/verdict1/*.tsv
 *   node typo-lab/blind_gloss.js --compare       → out/blind/residue.tsv
 *   node typo-lab/blind_gloss.js --emit2         → out/blind/batch2/C-NN.tsv   (מועמדים מעורבלים)
 *   node typo-lab/blind_gloss.js --ingest2       ← out/blind/verdict2/*.tsv
 *   node typo-lab/blind_gloss.js --emit3         → out/blind/batch3/P-NN.tsv   (א מול ב מוסווים)
 *   node typo-lab/blind_gloss.js --ingest3       ← out/blind/verdict3/*.tsv
 *   node typo-lab/blind_gloss.js --decide        → out/gloss-audit.tsv
 *   node typo-lab/blind_gloss.js --recall        → תפיסה מול 49 הידועים
 *   node typo-lab/blind_gloss.js --broad         → מסלול ב · פירוש רחב מדי
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ שני כללים שהקובץ הזה יורש ולא משנה
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **אין מטריקת דמיון.** `gloss_vs_example.js` מתעד שתי מטריקות שנזרקו
 *    (808 ו-165 דגלי שקר) ומורה במפורש שלא לבנות שלישית. ההשוואה כאן היא
 *    **שוויון מחרוזות מקונונות בלבד**. כל מה שאינו זהה עובר לשופט.
 *
 * 2. **שאלת המטרה אינה נשאלת.** `teacher.js`: שתי עדשות ששאלו "האם זה נכון"
 *    הפכו לחותמת גומי — 51.9% ו-46.9%, האחרונה 33 קבלות-שווא מתוך 33.
 *    ולכן שלב 1 כאן אינו שיפוט אלא **יצירה**: השופט כותב פירוש מאפס בלי לראות
 *    את המאגר. אין לו מה לאשר.
 *
 * התכן המלא והמכסות: `out/gloss-audit-PLAN.md` — נכתב לפני שנדגם פריט אחד.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'blind');
const D = n => path.join(OUT, n);
for (const d of ['batch1', 'verdict1', 'batch2', 'verdict2', 'batch3', 'verdict3'])
  fs.mkdirSync(D(d), { recursive: true });

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const say = s => process.stdout.write(s + '\n');

const SEED = 800800;               /* ⭐ מוצהר ב-PLAN.md לפני הדגימה */
/* ⚠ `BATCH2` ירד מ-160 ל-60 אחרי כשל **נמדד**: אצווה של 160 הרגה סוכן על
 * תקרת הפלט (64K) והקפיאה שלושה נוספים על ה-watchdog. הסוכן היחיד שסיים לקח
 * 55 דקות. ⭐ ההבדל בין מי שסיים למי שנהרג היה **כתיבת סקריפט** במקום ניתוח
 * פריט-פריט בטקסט — וזה עכשיו בראש ההנחיה, לא באמצעה. */
const BATCH1 = 150, BATCH2 = 60, BATCH3 = 70;

/* ===================== 0 · זרע דטרמיניסטי ===================== */
/* mulberry32 · אותו זרע ⇒ אותו ערבול בכל הרצה, בכל מכונה. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, seed) {
  const r = rng(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
const seedOf = s => { let h = SEED; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h >>> 0; };

/* ===================== 1 · טעינת המאגר ===================== */

function loadBank() {
  const src = fs.readFileSync(path.join(ROOT, 'data-en.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src).call(sandbox, sandbox.window);
  const units = sandbox.window.UNIT_DATA_EN;
  if (!units) throw new Error('לא נטען UNIT_DATA_EN');
  const rows = [];
  for (const u of Object.keys(units))
    for (const p of units[u])
      rows.push({ k: 'w' + String(rows.length + 1).padStart(4, '0'), unit: u, term: p[0], gloss: p[1] });
  return rows;
}

/* ===================== 2 · קנוניזציה · ⛔ לקסיקלית בלבד =====================
 *
 * ⛔ **מה שהיא אינה עושה ולא תעשה:** אינה מקלפת תחיליות (ה/ו/ב/ל/מ/ש/כ),
 * אינה מקלפת סיומות, אינה מסירה אימות קריאה, ואינה משתפת רצפים. זה בדיוק מה
 * ששתי הגרסאות שנזרקו ב-`gloss_vs_example.js` עשו, וזה מה שייצר 808 ו-165
 * דגלי שקר. כאן מוסרים **ניקוד ופיסוק בלבד** — רק מה שאינו נושא משמעות.
 *
 * ⭐ **ותיקון אחד מול הקובץ ההוא:** גרש וגרשיים **בתוך** מילה עברית נשמרים,
 * ולכן `תנ"כי` נשאר `תנ"כי` ולא `תנ כי`. שם זה היה פגם ידוע ב-10 כניסות
 * שהושאר בכוונה כי הוא סימטרי ותיקונו היה מבטל פסקים ששולמו. כאן אין פנקס
 * ישן לשמר, ולכן הוא מתוקן מלכתחילה. */

const NIQQUD = /[֑-ׇ]/g;
const HEB = '֐-׿';
function canon(s) {
  return String(s == null ? '' : s)
    .replace(NIQQUD, '')
    .replace(new RegExp('(?<=[' + HEB + '])[\'"׳״’”](?=[' + HEB + '])', 'g'), '')
    .replace(/[.,;:!?"'`()\[\]{}״׳“”‘’…·–—]/g, ' ')
    .replace(//g, '׳')
    .replace(/\s+/g, ' ')
    .trim();
}

/* מובנים מתוך פירוש: `;` מפריד מובנים רחוקים, `,` מפריד נרדפות. שניהם מובן.
 *
 * ⭐ **הערת שימוש בסוגריים מנותקת מהמילה.** `ללוות (מ-)` נותן גם `ללוות (מ-)`
 * וגם `ללוות`. זו **פענוח מבנה, לא מטריקת דמיון**: הסוגריים הן הערה על אופן
 * השימוש ואינן חלק מהמילה. הכיוון חד-סטרי — הוא יכול רק **לבטל** ממצא
 * (‏`borrow` הפסיק להידגל), לעולם לא ליצור אחד. לכן הוא בטוח.
 * ⚠ נוסף אחרי אצוות הכיול ולפני שלב 2, ומדווח ככזה. */
function senses(gloss) {
  const out = [];
  for (const s of String(gloss).split(/[;,]/).map(x => x.trim()).filter(Boolean)) {
    out.push(s);
    const bare = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (bare && bare !== s) out.push(bare);
  }
  return out;
}

/* ===================== 3 · שער קשיח · ⛔ זורק על שורה פגומה ===================== */

function readTSV(dir, cols, validate) {
  const files = fs.existsSync(D(dir)) ? fs.readdirSync(D(dir)).filter(f => f.endsWith('.tsv')).sort() : [];
  const rows = [], bad = [];
  for (const f of files) {
    const txt = fs.readFileSync(path.join(D(dir), f), 'utf8');
    txt.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      if (line.trim().startsWith('```')) { bad.push([f, i + 1, 'גדר קוד']); return; }
      const p = line.split('\t');
      if (p.length !== cols) { bad.push([f, i + 1, 'עמודות ' + p.length + ' במקום ' + cols]); return; }
      if (p[0] === 'k') return;                       /* כותרת */
      const err = validate ? validate(p) : null;
      if (err) { bad.push([f, i + 1, err]); return; }
      rows.push({ src: f, line: i + 1, p: p.map(x => x.trim()) });
    });
  }
  return { rows: rows, bad: bad, files: files };
}

const KEYRE = /^w\d{4}$/;

/* ===================== 4 · שלב 1 · יצירה עיוורת ===================== */

function emit1() {
  const bank = loadBank();
  const order = shuffled(bank, SEED);
  const slice = Number(arg('--slice', 0));
  const use = slice > 0 ? order.slice(0, slice) : order;
  let n = 0;
  for (let i = 0; i < use.length; i += BATCH1) {
    n++;
    const chunk = use.slice(i, i + BATCH1);
    const body = ['k\tterm'].concat(chunk.map(r => r.k + '\t' + r.term)).join('\n');
    fs.writeFileSync(path.join(D('batch1'), 'B-' + String(n).padStart(2, '0') + '.tsv'), body + '\n');
  }
  say('שלב 1 · ' + use.length + ' מילים · ' + n + ' אצוות · out/blind/batch1/');
}

function ingest1(bank) {
  const byK = new Map(bank.map(r => [r.k, r]));
  const g = readTSV('verdict1', 4, p => {
    if (!KEYRE.test(p[0].trim())) return 'מפתח פגום: ' + p[0].slice(0, 20);
    if (!byK.has(p[0].trim())) return 'מפתח לא במאגר';
    if (!p[1].trim()) return 'מובן ראשון ריק';
    if (/[A-Za-z]{3,}/.test(p[1])) return 'תשובה באנגלית';
    return null;
  });
  const out = new Map();
  for (const r of g.rows) {
    const s = [r.p[1], r.p[2], r.p[3]].map(x => x.trim()).filter(x => x && x !== '-' && x !== '–');
    if (out.has(r.p[0])) continue;                    /* מטמון: הפסק הראשון קובע */
    out.set(r.p[0], s);
  }
  return { map: out, bad: g.bad, files: g.files };
}

/* ===================== 5 · השוואה מכנית · שוויון בלבד ===================== */

function compare(bank, p1) {
  const res = [];
  for (const r of bank) {
    const blind = p1.map.get(r.k);
    if (!blind) continue;
    const stored = senses(r.gloss).map(canon);
    const storedSet = new Set(stored);
    const marks = blind.map(b => storedSet.has(canon(b)));
    const hits = marks.filter(Boolean).length;
    const missing = blind.map((b, i) => ({ s: b, rank: i + 1 })).filter((_, i) => !marks[i]);
    res.push({ k: r.k, term: r.term, gloss: r.gloss, unit: r.unit, blind: blind, stored: stored, hits: hits, missing: missing });
  }
  return res;
}

/* גלאי דליפה · זהות תו-בתו בין מה שנכתב לבין מה שבמאגר, כולל סדר. */
function leakRate(cmp) {
  let id = 0, multi = 0, idMulti = 0;
  for (const c of cmp) {
    const a = canon(c.blind.join(', ')), b = canon(c.gloss);
    if (a === b) id++;
    if (c.stored.length >= 2) { multi++; if (a === b) idMulti++; }
  }
  return { id: id, n: cmp.length, pct: cmp.length ? (100 * id / cmp.length) : 0, multi: multi, idMulti: idMulti, pctMulti: multi ? (100 * idMulti / multi) : 0 };
}

function writeResidue(cmp) {
  const res = cmp.filter(c => c.missing.length > 0);
  const body = ['k\tterm\tgloss\tblind\tmissing']
    .concat(res.map(c => [c.k, c.term, c.gloss, c.blind.join(' | '), c.missing.map(m => m.rank + ':' + m.s).join(' | ')].join('\t')))
    .join('\n');
  fs.writeFileSync(D('residue.tsv'), body + '\n');
  return res;
}

/* ===================== 6 · שלב 2 · דירוג עיוור · מועמדים מעורבלים ===================== */

/* ⛔⛔ הטיית סדר הדגימה · נמדדה כאן, ואל תסיר את האזהרה הזאת ═════════════
 *
 * `emit2` מייצר אצוות **בסדר `res`**, ו-`res` בא מ-`compare` שרץ על `bank`
 * בסדרו — כלומר **לפי יחידות, כלומר לפי שכיחות**. התוצאה: האצוות הראשונות
 * הן מילים שכיחות בלבד.
 *
 * ⭐ **וזה משנה את המספר, לא רק את הסדר.** מילים שכיחות רב-משמעיות הרבה
 * יותר, ולכן שיעור השרידה שלהן הוא **הגבוה ביותר שיימדד**. נמדד בפועל:
 *
 *     יחידות 1–2 · 240 פריטים · שרדו 60%
 *     יחידות 4–10 · 1,428 פריטים · **אפס נבדקו**
 *
 * ⛔ **הכפלת 60% ב-1,971 נותנת מספר מנופח.** זו המחלקה שהפילה את הפרויקט
 * הזה שוב ושוב: מספר **נכון על מה שנמדד ושקרי על מה שמסיקים ממנו**.
 * ⚠ המגמה 48%→54%→60% לאורך הגלים אינה החמרה במאגר — היא **הצטברות של אותן
 * יחידות שכיחות**. מי שיקרא אותה כהחמרה יטעה.
 *
 * ⭐ **ולכן `emitStrat` קיים:** הוא מרבד את השארית לשלוש רצועות ומדווח שיעור
 * **לכל רצועה בנפרד**. שלושה מספרים אומרים משהו; ממוצע משוקלל על דגימה מוטה
 * אינו אומר דבר. ⛔ אין לדווח שיעור אחד בלי לציין מאיזו רצועה נמדד. */
const STRATA = [
  { id: 'D1', units: [1, 2, 3], he: 'שכיח' },
  { id: 'D2', units: [4, 5, 6], he: 'בינוני' },
  { id: 'D3', units: [7, 8, 9, 10], he: 'נדיר' },
];

/* משגר אצוות מרובדות מן השארית **שטרם נשפטה**, כדי לא לשלם פעמיים. */
function emitStrat(res, bank) {
  const unit = new Map(bank.map(r => [r.k, Number(r.unit)]));
  const judged = new Set();
  if (fs.existsSync(D('verdict2')))
    for (const f of fs.readdirSync(D('verdict2')).filter(x => x.endsWith('.tsv')))
      for (const l of fs.readFileSync(path.join(D('verdict2'), f), 'utf8').split(/\r?\n/))
        if (l.trim()) judged.add(l.split('\t')[0].trim());
  /* גם 360 המפתחות של C-01..C-06 יוצאים — הם כבר בתור */
  const inC = new Set(res.slice(0, 360).map(c => c.k));
  const pool = res.filter(c => !judged.has(c.k) && !inC.has(c.k));
  const items = pool.map(c => {
    const uniq = [], seen = new Set();
    for (const s of c.blind.concat(senses(c.gloss))) {
      const cs = canon(s);
      if (cs && !seen.has(cs)) { seen.add(cs); uniq.push(s.trim()); }
    }
    return { k: c.k, term: c.term, cands: shuffled(uniq, seedOf(c.k)) };
  });
  fs.mkdirSync(D('batch2s'), { recursive: true });
  const out = [];
  for (const S of STRATA) {
    const mine = shuffled(items.filter(x => S.units.includes(unit.get(x.k))), SEED + S.units[0]);
    let n = 0;
    for (let i = 0; i < mine.length; i += BATCH2) {
      n++;
      const id = S.id + '-' + String(n).padStart(2, '0');
      fs.writeFileSync(path.join(D('batch2s'), id + '.tsv'),
        ['k\tterm\tcands'].concat(mine.slice(i, i + BATCH2).map(x => x.k + '\t' + x.term + '\t' + x.cands.join(' | '))).join('\n') + '\n');
    }
    out.push(S.id + ' (' + S.he + ' · יחידות ' + S.units.join(',') + ') · ' + mine.length + ' פריטים · ' + n + ' אצוות');
  }
  fs.writeFileSync(D('cands-strat.json'), JSON.stringify(items));
  out.forEach(say);
  return items;
}

function emit2(res) {
  let n = 0;
  const items = res.map(c => {
    const uniq = [], seen = new Set();
    for (const s of c.blind.concat(senses(c.gloss))) {
      const cs = canon(s);
      if (cs && !seen.has(cs)) { seen.add(cs); uniq.push(s.trim()); }
    }
    return { k: c.k, term: c.term, cands: shuffled(uniq, seedOf(c.k)) };
  });
  for (let i = 0; i < items.length; i += BATCH2) {
    n++;
    const chunk = items.slice(i, i + BATCH2);
    const body = ['k\tterm\tcands'].concat(chunk.map(x => x.k + '\t' + x.term + '\t' + x.cands.join(' | '))).join('\n');
    fs.writeFileSync(path.join(D('batch2'), 'C-' + String(n).padStart(2, '0') + '.tsv'), body + '\n');
  }
  fs.writeFileSync(D('cands.json'), JSON.stringify(items));
  say('שלב 2 · ' + items.length + ' פריטים · ' + n + ' אצוות · out/blind/batch2/');
  return items;
}

function ingest2() {
  const items = JSON.parse(fs.readFileSync(D('cands.json'), 'utf8'));
  const byK = new Map(items.map(x => [x.k, x]));
  const g = readTSV('verdict2', 3, p => {
    const k = p[0].trim();
    if (!KEYRE.test(k)) return 'מפתח פגום';
    if (!byK.has(k)) return 'מפתח לא באצווה';
    const lab = p[1].trim();
    if (!/^[כל]+$/.test(lab)) return 'תווית אינה רצף כ/ל';
    if (lab.length !== byK.get(k).cands.length) return 'אורך ' + lab.length + ' מול ' + byK.get(k).cands.length + ' מועמדים';
    return null;
  });
  /* שני שופטים בלתי תלויים: הקבצים נושאים סיומת -J1 / -J2 */
  const J = { J1: new Map(), J2: new Map() };
  for (const r of g.rows) {
    const j = /-J2\b|-J2\./.test(r.src) ? 'J2' : 'J1';
    if (!J[j].has(r.p[0])) J[j].set(r.p[0], r.p[1]);
  }
  return { J: J, bad: g.bad, items: items, byK: byK, files: g.files };
}

/* ===================== 7 · חוק ההכרעה שלב 2 · 2 מתוך 2 ===================== */

function survivors(res, p2) {
  const byK = new Map(res.map(c => [c.k, c]));
  const out = [];
  for (const it of p2.items) {
    const a = p2.J.J1.get(it.k), b = p2.J.J2.get(it.k);
    if (!a || !b) continue;                            /* חסר ⇒ אינו הסכמה */
    const c = byK.get(it.k);
    if (!c) continue;
    const storedSet = new Set(senses(c.gloss).map(canon));
    /* מובן חסר ששני השופטים סימנו כנפוץ */
    const endorsed = [];
    it.cands.forEach((cand, i) => {
      if (a[i] === 'כ' && b[i] === 'כ' && !storedSet.has(canon(cand))) endorsed.push(cand);
    });
    if (!endorsed.length) continue;
    const rankOf = s => { const m = c.missing.find(x => canon(x.s) === canon(s)); return m ? m.rank : 9; };
    endorsed.sort((x, y) => rankOf(x) - rankOf(y));
    out.push({ k: c.k, term: c.term, gloss: c.gloss, unit: c.unit, blind: c.blind, hits: c.hits, endorsed: endorsed, topRank: rankOf(endorsed[0]) });
  }
  return out;
}

/* ⭐ ההצעה נבנית **בתוספת בלבד** ומשמרת את הפיסוק המקורי אות באות.
   מובן שדורג ראשון נכנס לפני הפירוש הקיים; השאר נספחים אחרי `;`. */
function proposal(s) {
  const first = s.endorsed.filter(e => { const i = s.blind.findIndex(b => canon(b) === canon(e)); return i === 0; });
  const rest = s.endorsed.filter(e => first.indexOf(e) < 0);
  let out = '';
  if (first.length) out += first.join(', ') + ', ';
  out += s.gloss;
  if (rest.length) out += '; ' + rest.join(', ');
  return out;
}

function klass(s) {
  if (s.hits === 0) return 'פירוש שגוי';            /* פירוש שגוי */
  if (s.topRank === 1) return 'מובן נפוץ חסר'; /* מובן נפוץ חסר */
  return 'פירוש צר מדי';                        /* פירוש צר מדי */
}

/* ===================== 8 · שלב 3 · פאנל מוסווה ===================== */

function emit3(surv) {
  let n = 0;
  const items = surv.map(s => {
    const prop = proposal(s);
    const flip = rng(seedOf(s.k + 'p'))() < 0.5;       /* מי א ומי ב · לפי הזרע */
    return { k: s.k, term: s.term, A: flip ? prop : s.gloss, B: flip ? s.gloss : prop, propIs: flip ? 'A' : 'B' };
  });
  for (let i = 0; i < items.length; i += BATCH3) {
    n++;
    const chunk = items.slice(i, i + BATCH3);
    const body = ['k\tterm\tA\tB'].concat(chunk.map(x => [x.k, x.term, x.A, x.B].join('\t'))).join('\n');
    fs.writeFileSync(path.join(D('batch3'), 'P-' + String(n).padStart(2, '0') + '.tsv'), body + '\n');
  }
  fs.writeFileSync(D('panel.json'), JSON.stringify(items));
  say('שלב 3 · ' + items.length + ' פריטים · ' + n + ' אצוות · out/blind/batch3/');
  return items;
}

function ingest3() {
  const items = JSON.parse(fs.readFileSync(D('panel.json'), 'utf8'));
  const byK = new Map(items.map(x => [x.k, x]));
  const g = readTSV('verdict3', 2, p => {
    if (!KEYRE.test(p[0].trim())) return 'מפתח פגום';
    if (!byK.has(p[0].trim())) return 'מפתח לא באצווה';
    if (!/^[ABאב]$/.test(p[1].trim())) return 'תווית אינה A/B';
    return null;
  });
  const J = { J1: new Map(), J2: new Map(), J3: new Map() };
  for (const r of g.rows) {
    const j = /-J3\b|-J3\./.test(r.src) ? 'J3' : /-J2\b|-J2\./.test(r.src) ? 'J2' : 'J1';
    const v = r.p[1].trim() === 'א' ? 'A' : r.p[1].trim() === 'ב' ? 'B' : r.p[1].trim();
    if (!J[j].has(r.p[0])) J[j].set(r.p[0], v);
  }
  return { J: J, bad: g.bad, items: items, byK: byK, files: g.files };
}

/* ===================== 9 · הכרעה סופית ===================== */

function decide(surv, p3) {
  const byK = new Map(surv.map(s => [s.k, s]));
  const rows = [];
  for (const it of p3.items) {
    const votes = ['J1', 'J2', 'J3'].map(j => p3.J[j].get(it.k)).filter(Boolean);
    if (votes.length < 3) continue;                    /* פחות מ-3 שופטים ⇒ נופל */
    const forProp = votes.filter(v => v === it.propIs).length;
    if (forProp < 2) continue;                         /* ⛔ בספק — לא סתירה */
    const s = byK.get(it.k);
    rows.push({
      k: s.k, unit: s.unit, term: s.term, gloss: s.gloss,
      blind: s.blind.join(', '), prop: proposal(s), klass: klass(s),
      strength: forProp === 3 ? 'חזק' : 'בינוני',
      votes: forProp + '/3',
    });
  }
  rows.sort((a, b) => (a.strength === b.strength ? a.term.localeCompare(b.term) : (a.strength === 'חזק' ? -1 : 1)));
  const head = ['מילה', 'פירוש היום', 'מה השופטים כתבו', 'ההצעה', 'מחלקה', 'חוזק', 'פאנל', 'יחידה'].join('\t');
  const body = [head].concat(rows.map(r => [r.term, r.gloss, r.blind, r.prop, r.klass, r.strength, r.votes, r.unit].join('\t'))).join('\n');
  fs.writeFileSync(path.join(__dirname, 'out', 'gloss-audit.tsv'), body + '\n');
  return rows;
}

/* ===================== 10 · מסלול ב · פירוש רחב מדי · מכני ===================== */

function broad(bank) {
  const m = new Map();
  for (const r of bank) for (const s of senses(r.gloss)) {
    const c = canon(s);
    if (!c || c.length < 2) continue;
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(r.term);
  }
  const rows = [];
  for (const [c, terms] of m) if (terms.length >= 3) rows.push({ sense: c, n: terms.length, terms: terms });
  rows.sort((a, b) => b.n - a.n);
  const head = ['מובן', 'כמה מילים', 'המילים'].join('\t');
  fs.writeFileSync(path.join(__dirname, 'out', 'gloss-broad.tsv'),
    [head].concat(rows.map(r => [r.sense, r.n, r.terms.join(', ')].join('\t'))).join('\n') + '\n');
  return rows;
}

/* ===================== 11 · מדד האמינות · מול 49 הידועים ===================== */

function known() {
  const f = path.join(__dirname, 'out', 'gloss-fixes.tsv');
  if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.trim()).slice(1);
  const pos = [], neg = [], fake = [];
  for (const l of lines) {
    const p = l.split('\t');
    const term = p[0].trim(), side = (p[4] || '').trim(), prop = (p[3] || '').trim();
    if (/דגל שקרי/.test(side) || /אין שינוי/.test(prop)) fake.push(term);
    else if (side === 'פירוש') pos.push(term);
    else neg.push(term);                                /* "משפט" ⇒ הפירוש נכון ⇒ שלילי ודאי */
  }
  return { pos: pos, neg: neg, fake: fake };
}

/* ===================== 12 · ⛔ selftest · שיניים ===================== */

function selftest() {
  let fail = 0;
  const ok = (c, m) => { say((c ? '  ✅ ' : '  ⛔ ') + m); if (!c) fail++; };
  say('## selftest · blind_gloss.js\n');

  say('### קנוניזציה');
  ok(canon('מושב,') === 'מושב', 'פיסוק מוסר');
  ok(canon('תנ"כי') === 'תנ׳כי', 'גרשיים בתוך מילה נשמרים');
  ok(canon('המושב') !== canon('מושב'), '⛔ תחילית אינה מקולפת');
  ok(canon('מושבים') !== canon('מושב'), '⛔ סיומת אינה מקולפת');
  ok(canon('זמן') !== canon('שעה'), '⛔ אין דמיון · זמן≠שעה');

  say('\n### מובנים');
  ok(senses('מפגש, פגישה; מושב').length === 3, 'פיצול על , ו-;');

  say('\n### ⛔ שער קשיח · שיניים');
  const tmp = D('_selftest');
  fs.mkdirSync(tmp, { recursive: true });
  const bad = [
    'w0001\tא',                                         /* 2 עמודות במקום 4 */
    'w0002\tא\tב\tג\tד',                                /* 5 עמודות */
    'xxxx\tא\tב\tג',                                    /* מפתח פגום */
    'w9999\tא\tב\tג',                                   /* מפתח לא במאגר */
    'w0003\t\tב\tג',                                    /* מובן ראשון ריק */
    'w0004\tsession\tב\tג',                             /* אנגלית */
    '```',                                              /* גדר קוד */
  ].join('\n');
  fs.writeFileSync(path.join(tmp, 'X-01.tsv'), bad + '\n');
  const saveDir = D('verdict1'), stash = path.join(OUT, '_stash1');
  let restored = false;
  try {
    if (fs.existsSync(saveDir)) fs.renameSync(saveDir, stash);
    fs.renameSync(tmp, saveDir);
    const bank = loadBank();
    const g = ingest1(bank);
    ok(g.map.size === 0, 'אף שורה פגומה לא נכנסה (נכנסו ' + g.map.size + ')');
    ok(g.bad.length === 7, 'כל 7 השורות הפגומות נפסלו (נפסלו ' + g.bad.length + ')');
    const kinds = g.bad.map(b => b[2]);
    ok(kinds.some(x => /עמודות/.test(x)), 'עמודות שגויות נתפסות');
    ok(kinds.some(x => /מפתח פגום/.test(x)), 'מפתח פגום נתפס');
    ok(kinds.some(x => /לא במאגר/.test(x)), 'מפתח מומצא נתפס');
    ok(kinds.some(x => /ריק/.test(x)), 'מובן ריק נתפס');
    ok(kinds.some(x => /אנגלית/.test(x)), 'תשובה באנגלית נתפסת');
    ok(kinds.some(x => /גדר/.test(x)), 'גדר קוד נתפסת');
  } finally {
    if (fs.existsSync(saveDir)) fs.rmSync(saveDir, { recursive: true, force: true });
    if (fs.existsSync(stash)) { fs.renameSync(stash, saveDir); restored = true; }
    else fs.mkdirSync(saveDir, { recursive: true });
  }
  ok(fs.existsSync(saveDir), 'תיקיית הפסקים שוחזרה' + (restored ? '' : ' (הייתה ריקה)'));

  say('\n### חוק ההכרעה · אסימטרי');
  const fake = { k: 'w0001', term: 't', gloss: 'א', unit: '1', blind: ['ב'], hits: 0, endorsed: ['ב'], topRank: 1 };
  const p3 = { items: [{ k: 'w0001', propIs: 'A' }], J: { J1: new Map([['w0001', 'A']]), J2: new Map([['w0001', 'B']]), J3: new Map([['w0001', 'B']]) } };
  ok(decideDry([fake], p3).length === 0, '1 מתוך 3 בפאנל ⇒ נופל');
  const p3b = { items: [{ k: 'w0001', propIs: 'A' }], J: { J1: new Map([['w0001', 'A']]), J2: new Map([['w0001', 'A']]), J3: new Map([['w0001', 'B']]) } };
  const r2 = decideDry([fake], p3b);
  ok(r2.length === 1 && r2[0].strength === 'בינוני', '2 מתוך 3 ⇒ בינוני');
  const p3c = { items: [{ k: 'w0001', propIs: 'A' }], J: { J1: new Map([['w0001', 'A']]), J2: new Map([['w0001', 'A']]), J3: new Map([['w0001', 'A']]) } };
  ok(decideDry([fake], p3c)[0].strength === 'חזק', '3 מתוך 3 ⇒ חזק');
  const p3d = { items: [{ k: 'w0001', propIs: 'A' }], J: { J1: new Map([['w0001', 'A']]), J2: new Map([['w0001', 'A']]), J3: new Map() } };
  ok(decideDry([fake], p3d).length === 0, 'שופט חסר ⇒ נופל · חסר אינו הסכמה');

  say('\n### שלב 2 · 2 מתוך 2');
  const res = [{ k: 'w0001', term: 't', gloss: 'א', unit: '1', blind: ['ב'], hits: 0, missing: [{ s: 'ב', rank: 1 }] }];
  const items = [{ k: 'w0001', term: 't', cands: ['ב', 'א'] }];
  const mk = (a, b) => ({ items: items, J: { J1: new Map([['w0001', a]]), J2: new Map([['w0001', b]]) } });
  ok(survivors(res, mk('כל', 'לל')).length === 0, 'שופט אחד בלבד ⇒ נופל');
  ok(survivors(res, mk('כל', 'כל')).length === 1, '2 מתוך 2 ⇒ שורד');
  ok(survivors(res, mk('לכ', 'לכ')).length === 0, 'רק מובן שכבר במאגר ⇒ אין ממצא');

  say('\n### ההצעה · תוספת בלבד');
  const s1 = { term: 'soar', gloss: 'להמריא', blind: ['לנסוק'], endorsed: ['לנסוק'] };
  ok(proposal(s1).indexOf('להמריא') >= 0, 'הפירוש המקורי נשמר בהצעה');
  ok(proposal(s1).indexOf('לנסוק') === 0, 'מובן שדורג ראשון נכנס ראשון');

  say('\n### זרע');
  ok(shuffled([1, 2, 3, 4, 5], SEED).join() === shuffled([1, 2, 3, 4, 5], SEED).join(), 'ערבול דטרמיניסטי');

  say('\n' + (fail ? '⛔ ' + fail + ' נפילות' : '✅ הכל עבר'));
  process.exit(fail ? 1 : 0);
}

function decideDry(surv, p3) {
  const byK = new Map(surv.map(s => [s.k, s]));
  const rows = [];
  for (const it of p3.items) {
    const votes = ['J1', 'J2', 'J3'].map(j => p3.J[j].get(it.k)).filter(Boolean);
    if (votes.length < 3) continue;
    const forProp = votes.filter(v => v === it.propIs).length;
    if (forProp < 2) continue;
    const s = byK.get(it.k);
    rows.push({ k: s.k, term: s.term, strength: forProp === 3 ? 'חזק' : 'בינוני' });
  }
  return rows;
}

/* ===================== main ===================== */

if (has('--selftest')) selftest();

const bank = loadBank();

if (has('--emit1')) emit1();

if (has('--ingest1') || has('--compare') || has('--emit2') || has('--ingest2') || has('--emit3') || has('--ingest3') || has('--decide') || has('--recall')) {
  const p1 = ingest1(bank);
  if (p1.bad.length) { say('⛔ ' + p1.bad.length + ' שורות פגומות בשלב 1:'); p1.bad.slice(0, 15).forEach(b => say('   ' + b.join(' · '))); }
  say('שלב 1 · ' + p1.map.size + ' / ' + bank.length + ' פסקים · ' + p1.files.length + ' קבצים');
  const cmp = compare(bank, p1);
  const lk = leakRate(cmp);
  say('גלאי דליפה · זהות מלאה ' + lk.id + '/' + lk.n + ' = ' + lk.pct.toFixed(2) + '%' +
      ' · מהם רב-מובניים ' + lk.idMulti + '/' + lk.multi + ' = ' + lk.pctMulti.toFixed(2) + '%' +
      (lk.pct > 3 ? '  ⛔ מעל הסף 3% · הביקורת מזוהמת' : '  ✅ מתחת לסף'));
  const res = writeResidue(cmp);
  say('שארית · ' + res.length + ' / ' + cmp.length + ' (' + (100 * res.length / Math.max(1, cmp.length)).toFixed(1) + '%) עם מובן שאינו במאגר');

  if (has('--emit2')) emit2(res);

  if (has('--ingest2') || has('--emit3') || has('--ingest3') || has('--decide') || has('--recall')) {
    const p2 = ingest2();
    if (p2.bad.length) { say('⛔ ' + p2.bad.length + ' שורות פגומות בשלב 2:'); p2.bad.slice(0, 15).forEach(b => say('   ' + b.join(' · '))); }
    say('שלב 2 · J1=' + p2.J.J1.size + ' J2=' + p2.J.J2.size + ' מתוך ' + p2.items.length);
    const surv = survivors(res, p2);
    say('שרדו שלב 2 (2 מתוך 2) · ' + surv.length);
    if (has('--emit3')) emit3(surv);

    if (has('--ingest3') || has('--decide') || has('--recall')) {
      const p3 = ingest3();
      if (p3.bad.length) { say('⛔ ' + p3.bad.length + ' שורות פגומות בשלב 3:'); p3.bad.slice(0, 15).forEach(b => say('   ' + b.join(' · '))); }
      say('שלב 3 · J1=' + p3.J.J1.size + ' J2=' + p3.J.J2.size + ' J3=' + p3.J.J3.size + ' מתוך ' + p3.items.length);
      const rows = decide(surv, p3);
      const strong = rows.filter(r => r.strength === 'חזק').length;
      say('⭐ ממצאים · ' + rows.length + ' · מהם חזקים ' + strong + ' · out/gloss-audit.tsv');

      if (has('--recall')) {
        const K = known();
        const found = new Set(rows.map(r => r.term));
        const seen = new Set(bank.filter(b => p1.map.has(b.k)).map(b => b.term));
        const inScope = K.pos.filter(t => seen.has(t));
        const caught = inScope.filter(t => found.has(t));
        const negScope = K.neg.filter(t => seen.has(t)), fakeScope = K.fake.filter(t => seen.has(t));
        say('\n⭐ מדד אמינות · מול הידועים');
        say('  חיוביים בהיקף שנבדק · ' + inScope.length + ' · נתפסו ' + caught.length +
            ' = ' + (inScope.length ? (100 * caught.length / inScope.length).toFixed(0) : '-') + '%');
        say('  החמצות · ' + inScope.filter(t => !found.has(t)).join(', '));
        say('  ⛔ שליליים ודאיים בהיקף · ' + negScope.length + ' · סומנו בטעות ' + negScope.filter(t => found.has(t)).length +
            ' [' + negScope.filter(t => found.has(t)).join(', ') + ']');
        say('  ⛔ דגל שקרי מוכר בהיקף · ' + fakeScope.length + ' · סומן ' + fakeScope.filter(t => found.has(t)).length);
      }
    }
  }
}

if (has('--broad')) {
  const rows = broad(bank);
  say('מסלול ב · ' + rows.length + ' מובנים משמשים ≥3 מילים · out/gloss-broad.tsv');
  rows.slice(0, 25).forEach(r => say('  ' + r.sense + ' (' + r.n + ') · ' + r.terms.join(', ')));
}

/* ⭐ דגימה מרובדת · `--emit2s` · ראה את בלוק האזהרה שמעל `emitStrat`.
   מוציא רק את השארית שטרם נשפטה, כדי לא לשלם פעמיים על אותו פריט. */
if (has('--emit2s')) {
  const p1s = ingest1(bank);
  const cmps = compare(bank, p1s);
  const ress = cmps.filter(c => c.missing.length > 0);
  say('שארית כוללת · ' + ress.length);
  emitStrat(ress, bank);
}
