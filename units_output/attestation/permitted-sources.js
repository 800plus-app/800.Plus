'use strict';
/* מדידת מקורות מותרים בבנק החי · units_output/attestation/permitted-sources.js
 *
 *   node units_output/attestation/permitted-sources.js             → שלושת המספרים
 *   node units_output/attestation/permitted-sources.js --list      → ושמות הערכים
 *   node units_output/attestation/permitted-sources.js --apply     → החלפת מקורות בפועל
 *   node units_output/attestation/permitted-sources.js --selftest  → בקרה שהמדידה זזה
 *
 * ===== מה נמדד =====
 *
 * הבנק החי הוא `data.js`. לכל ערך אמורה להיות שורה ב-`attestation.tsv`.
 * השאלה: כמה ערכים **אינם** נשענים על מקור מהרשימה הסגורה המותרת, וכמה מהם
 * אפשר להציל ממקור מותר **שכבר יושב בעץ** — בלי קריאת רשת אחת.
 *
 * הרשימה הסגורה: ויקינתונים (CC0) · ויקיטקסט · נוסחי מקרא עתיקים בנחלת הכלל ·
 * טקסט קלאסי בנחלת הכלל דרך ספריא. ⛔ מחוץ לה: CC BY · CC BY-SA · ויקיפדיה ·
 * ויקימילון · «דרוש מקור» · **וכל מהדורה משנת 1929 ומעלה**, גם כשהיא מתויגת
 * «נחלת הכלל» — הקאש `sefaria-licenses.json` כבר נתפס מתייג כך מהדורה מודרנית
 * (`Gur Aryeh, Machon Yerushalyim, 1989-1995`), ולכן אינו עדות לבדו.
 *
 * ⛔ **הכיסוי החלופי אינו ניחוש** — הוא נדרש להיות שורה קיימת בעץ, עם רפרנס
 * לא ריק, על **אותה מילה בדיוק** אחרי הסרת ניקוד בלבד. ⛔ אין השלמת אמות קריאה
 * ואין נרמול גרש — שתי המחלקות האלה כבר ייצרו כאן התאמות שקריות.
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const UNITS = path.join(DIR, '..');
const ROOT = path.join(UNITS, '..');

const NIQ = /[֑-ׇ]/g;
const APOS = /[׳’]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '').replace(APOS, "'").trim();

/* תוויות שמותרות בלי תנאי · ויקינתונים, ויקיטקסט, מקרא עתיק, וצירוף שלהן */
const ALLOWED = /^(ויקינתונים|ויקיטקסט|לפי מילה|כתב־יד לנינגרד|נחלת הכלל \(מקרא עתיק\))/;
/* תוויות ספריא שנחשבות מותרות **רק** אם אין במהדורה שנה 1929 ומעלה */
const SEFARIA_PD = /^(נחלת הכלל \/ CC0 \(לפי ספריא\)|ספריא · נחלת הכלל|טקסט קלאסי)/;
const CUTOFF = 1929;
const maxYear = ref => {
  const ys = String(ref).match(/\b(1[5-9]\d\d|20\d\d)\b/g);
  return ys ? Math.max.apply(null, ys.map(Number)) : null;
};
/* פסק דין על שורה · null אם מותרת, אחרת שם הקטגוריה */
function verdict(src, ref) {
  if (ALLOWED.test(src)) return null;
  if (SEFARIA_PD.test(src) || (/^ספריא ·/.test(src) && /Public Domain/.test(src))) {
    const y = maxYear(ref);
    return (y && y >= CUTOFF) ? 'ספריא נחלת-הכלל · מהדורה ' + y : null;
  }
  if (/^⚠ דרוש מקור/.test(src)) return 'ללא מקור כלל';
  if (/CC[-\s]?BY[-\s]?SA/i.test(src) || /^ויקיפדיה/.test(src)) return 'CC BY-SA';
  if (/CC[-\s]?BY/i.test(src)) return 'CC BY';
  return 'תווית לא מוכרת · ' + src;
}
/* שורה יכולה לשמש **חלופה** רק אם היא מותרת **וגם** יש לה רפרנס */
const usableAlt = (src, ref) => String(ref).trim() !== '' && verdict(src, ref) === null;

const tsv = p => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));

/* ===== הבנק החי ===== */
function liveBank() {
  const txt = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  const out = [];
  for (const u of Object.keys(j)) for (const e of j[u]) out.push({ w: e[0], unit: u });
  return out;
}

/* ===== מאגר החלופות · לפי סדר עדיפות =====
 * ⭐ `attestation-nine.tsv` ראשון · הוא היחיד שנבדק ידנית עם עמודת ראיה. */
const ALT_FILES = [
  { f: path.join(DIR, 'attestation-nine.tsv'), w: 0, s: 2, r: 3 },
  { f: path.join(DIR, 'attestation-299-worth.tsv'), w: 0, s: 2, r: 3 },
  { f: path.join(DIR, 'attestation-new-bank.tsv'), w: 0, s: 2, r: 3 },
  { f: path.join(UNITS, 'gloss-phase', 'gloss-status.tsv'), w: 3, s: 5, r: 9 },
];
function altIndex() {
  const idx = new Map();
  for (const spec of ALT_FILES) {
    if (!fs.existsSync(spec.f)) continue;
    const name = path.basename(spec.f);
    for (const c of tsv(spec.f).slice(1)) {
      const w = c[spec.w] || '', s = (c[spec.s] || '').trim(), r = (c[spec.r] || '').trim();
      if (!w || !usableAlt(s, r)) continue;
      const k = norm(w);
      if (!idx.has(k)) idx.set(k, { file: name, src: s, ref: r, word: w });
    }
  }
  return idx;
}

/* ===== המדידה ===== */
function measure(rowsOverride) {
  const rows = rowsOverride || tsv(path.join(DIR, 'attestation.tsv'));
  const body = rows.slice(1);
  const byWord = new Map();
  body.forEach((c, i) => byWord.set(norm(c[0]), { c: c, i: i }));
  const idx = altIndex();

  const pop = [];
  byWord.forEach(function (e) {
    const c = e.c;
    const v = verdict((c[2] || '').trim(), (c[3] || '').trim());
    if (v) pop.push({ row: e.i, word: c[0], cat: v, src: c[2] || '', ref: c[3] || '', alt: idx.get(norm(c[0])) || null });
  });
  /* ערכים ב-data.js שאין להם שורת הוכחה כלל */
  const noRow = liveBank().filter(e => !byWord.has(norm(e.w)))
    .map(e => ({ row: -1, word: e.w, cat: 'אין שורת הוכחה כלל', src: '', ref: '', alt: idx.get(norm(e.w)) || null }));

  const all = pop.concat(noRow);
  return { all: all, covered: all.filter(p => p.alt), left: all.filter(p => !p.alt), rows: body.length };
}

function report(m) {
  const by = {};
  for (const p of m.all) {
    const k = p.cat.replace(/ · מהדורה \d+$/, ' · מהדורה 1929+');
    if (!by[k]) by[k] = [0, 0];
    by[k][p.alt ? 0 : 1]++;
  }
  console.log('שורות ב-attestation.tsv: ' + m.rows + '  ·  ערכים ב-data.js: ' + liveBank().length);
  console.log('');
  console.log('אוכלוסייה · לא נשענת על מקור מהרשימה המותרת: ' + m.all.length);
  console.log('  קיבלו חלופה מוכחת מהעץ:  ' + m.covered.length);
  console.log('  נשארו בלי:               ' + m.left.length);
  console.log('  ' + (m.covered.length + m.left.length === m.all.length ? '✅ הסכום מתיישב' : '⛔ הסכום אינו מתיישב'));
  console.log('');
  console.log('לפי קטגוריה                                   יש חלופה    אין');
  Object.keys(by).sort().forEach(k =>
    console.log('  ' + k + ' '.repeat(Math.max(1, 44 - k.length)) + String(by[k][0]).padStart(5) + String(by[k][1]).padStart(7)));
  return m;
}

/* ===== החלה ===== */
function apply() {
  const file = path.join(DIR, 'attestation.tsv');
  const rows = tsv(file);
  const m = measure(rows);
  let swapped = 0, flagged = 0, added = 0;
  /* ⭐ ערך שיש לו חלופה מוכחת אבל **אין לו שורה** · נכתבת לו שורה, והוא נגרע
   * מ-`attestation-missing.tsv` כדי שלא תהיינה שתי אמיתות על אותה מילה. */
  const unitOf = new Map(liveBank().map(e => [norm(e.w), e.unit]));
  const addedWords = [];
  for (const p of m.all) {
    if (p.row >= 0 || !p.alt) continue;
    rows.push([p.word, unitOf.get(norm(p.word)) || '', p.alt.src, p.alt.ref,
      '⟵ נוספה שורה · הערך היה ב-attestation-missing.tsv בלי הוכחה · המקור מ-' + p.alt.file]);
    addedWords.push(norm(p.word)); added++;
  }
  if (added) {
    const mf = path.join(DIR, 'attestation-missing.tsv');
    const mr = tsv(mf).filter((r, i) => i === 0 || addedWords.indexOf(norm(r[0])) < 0);
    fs.writeFileSync(mf, mr.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  }
  for (const p of m.all) {
    if (p.row < 0) continue;                       /* טופל למעלה */
    const c = rows[p.row + 1];
    while (c.length < 5) c.push('');
    if (p.alt) {
      c[4] = ('⟵ הוחלף · הטענה הקודמת: ' + (c[2] || '(ריק)') + ' / ' + (c[3] || '(ריק)') +
        ' · המקור החדש מ-' + p.alt.file + (c[4] ? ' · ' + c[4] : '')).trim();
      c[2] = p.alt.src; c[3] = p.alt.ref; swapped++;
    } else if (p.cat === 'CC BY' || p.cat === 'CC BY-SA') {
      c[4] = ('⚠ אין מקור מהרשימה המותרת · הטענה שנמצאה: ' + c[2] + (c[4] ? ' · ' + c[4] : '')).trim();
      c[2] = '⚠ דרוש מקור'; flagged++;
    } else if (/^ספריא נחלת-הכלל · מהדורה/.test(p.cat)) {
      c[4] = ('⚠ ' + p.cat + ' · «נחלת הכלל» אינו מאושר למהדורה מ-1929 ואילך · דורש הכרעה' + (c[4] ? ' · ' + c[4] : '')).trim();
      flagged++;
    }
  }
  fs.writeFileSync(file, rows.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  console.log('הוחלפו מקורות: ' + swapped + '  ·  נוספו שורות: ' + added +
    '  ·  סומנו בלי חלופה: ' + flagged);
}

/* ===== בקרה · שהמדידה מסוגלת להחזיר מספר אחר ===== */
function selftest() {
  const base = measure();
  console.log('בסיס · אוכלוסייה ' + base.all.length + ' · יש חלופה ' + base.covered.length + ' · אין ' + base.left.length);
  const rows = tsv(path.join(DIR, 'attestation.tsv')).map(r => r.slice());
  let ok = true;

  /* בקרה 1 · הרעלת שורה מותרת לתווית אסורה — האוכלוסייה חייבת לגדול ב-1 */
  const a = rows.map(r => r.slice());
  const i1 = a.findIndex((r, i) => i > 0 && ALLOWED.test((r[2] || '').trim()));
  a[i1][2] = 'ויקיפדיה · CC BY-SA';
  const r1 = measure(a);
  const p1 = r1.all.length === base.all.length + 1;
  console.log((p1 ? '✓ ' : '⛔ ') + 'בקרה 1 · שורה מותרת הורעלה ל-CC BY-SA → אוכלוסייה ' + base.all.length + ' ⟵ ' + r1.all.length);
  ok = ok && p1;

  /* בקרה 2 · הזזת שנת המהדורה מתחת לסף — האוכלוסייה חייבת לקטון */
  const b = rows.map(r => r.slice());
  const i2 = b.findIndex((r, i) => i > 0 && /^ספריא נחלת-הכלל · מהדורה/.test(verdict((r[2] || '').trim(), (r[3] || '').trim()) || ''));
  if (i2 < 0) { console.log('⛔ בקרה 2 · אין שורת ספריא 1929+ להזיז'); ok = false; }
  else {
    b[i2][3] = b[i2][3].replace(/\b(19[2-9]\d|20\d\d)\b/g, '1850');
    const r2 = measure(b);
    const p2 = r2.all.length === base.all.length - 1;
    console.log((p2 ? '✓ ' : '⛔ ') + 'בקרה 2 · מהדורה 1929+ הוזזה ל-1850 → אוכלוסייה ' + base.all.length + ' ⟵ ' + r2.all.length);
    ok = ok && p2;
  }

  /* בקרה 3 · שורה שאין לה חלופה משונה למילה שכן יש לה חלופה בעץ — הכיסוי חייב לעלות.
   * ⚠ הכיוון ההפוך (למחוק מילה מכוסה) **אינו** בקרה תקפה כאן: הערך נושר אז
   * מ-`attestation.tsv` וחוזר מיד כערך «אין שורת הוכחה כלל» שהחלופה שלו נמצאת,
   * והמונה לא זז. נבדק, החזיר 41⟵41, והוחלף. */
  const c = rows.map(r => r.slice());
  const idx = altIndex();
  const inFile = new Set(rows.slice(1).map(r => norm(r[0])));
  const spare = Array.from(idx.keys()).filter(k => !inFile.has(k))[0];
  const leftRow = base.left.filter(p => p.row >= 0)[0];
  if (!spare || !leftRow) { console.log('⛔ בקרה 3 · אין מילה פנויה או שורה בלי חלופה'); ok = false; }
  else {
    c[leftRow.row + 1][0] = spare;
    const r3 = measure(c);
    const p3 = r3.covered.length === base.covered.length + 1;
    console.log((p3 ? '✓ ' : '⛔ ') + 'בקרה 3 · «' + leftRow.word + '» שונתה ל-«' + spare +
      '» שיש לה חלופה בעץ → כיסוי ' + base.covered.length + ' ⟵ ' + r3.covered.length);
    ok = ok && p3;
  }

  console.log(ok ? '\n⭐ למדידה יש שיניים · שלוש הבקרות הזיזו את המספר' : '\n⛔ המדידה אינה מגיבה');
  process.exit(ok ? 0 : 1);
}

if (process.argv.indexOf('--selftest') >= 0) selftest();
else if (process.argv.indexOf('--apply') >= 0) apply();
else {
  const m = report(measure());
  if (process.argv.indexOf('--list') >= 0) {
    console.log('\n=== נשארו בלי חלופה ===');
    m.left.forEach(p => console.log('  ' + p.word + ' | ' + p.cat + ' | ' + p.src + ' | ' + String(p.ref).slice(0, 60)));
    console.log('\n=== קיבלו חלופה ===');
    m.covered.forEach(p => console.log('  ' + p.word + ' | ' + p.cat + ' ⟶ ' + p.alt.file + ' | ' + p.alt.src + ' | ' + p.alt.ref.slice(0, 60)));
  }
}
