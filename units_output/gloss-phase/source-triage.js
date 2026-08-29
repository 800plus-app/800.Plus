'use strict';
/* מיון מקורות הפירושים הוותיקים · units_output/gloss-phase/source-triage.js
 *
 *   node units_output/gloss-phase/source-triage.js             → הפירוק למספרים
 *   node units_output/gloss-phase/source-triage.js --list      → ושמות השורות
 *   node units_output/gloss-phase/source-triage.js --apply     → סוגר את מה שנסגר
 *   node units_output/gloss-phase/source-triage.js --selftest  → בקרה שהמיון זז
 *
 * ===== מה זה עונה =====
 *
 * ‏2,073 פירושים ותיקים לא עברו את שער המקורות מעולם. ⛔ אודיט של 2,073 פריטים
 * אינו תשובה — הוא עוד גל. השאלה היא **כמה מהם בכלל דורשים משהו**, ולכן כל
 * שורה נשפטת כאן ב**אותו שער בדיוק** שמודד את הבנק החי.
 *
 * ⭐ ‏`verdict` מיובא מ-`permitted-sources.js` ואינו מועתק. יש שער אחד, לא שניים.
 *
 * ===== שלוש הקבוצות =====
 *
 *   A · מקור מותר ורפרנס לא ריק   → ⭐ אינו דורש דבר. זה רוב האוכלוסייה.
 *   B · ספריא «נחלת הכלל» על מהדורה 1929 ואילך → ⛔ **טענה משפטית בלי כיסוי.**
 *       זה בדיוק הפגם שכבר תוקן ב-`attestation.tsv` ב-29.8, ואותה תרופה חלה כאן.
 *   C · «דרוש מקור» כבר רשום       → דורש מקור חיצוני. ⛔ מחוץ לתחום הסוכן.
 *
 * ===== מה ש-`--apply` עושה · ומה שהוא לא =====
 *
 * ⭐ הוא נוגע **רק בקבוצה B**, ורק בעמודת המקור:
 *   · יש לאותה מילה מקור מותר מוכח בעץ → מוחלף אליו.
 *   · אין                              → העמודה עוברת ל-«⚠ דרוש מקור».
 * ⭐ **שום מידע לא נמחק** — הטענה הקודמת והרפרנס נשמרים במלואם בעמודת ההערה,
 * וריצה שנייה אינה מוסיפה הערה שנייה.
 * ⛔ **הוא אינו נוגע בטקסט הפירוש, בסטטוס, ובשורות «ממתין».** המשימה היא
 * מקורות, לא ניסוח.
 *
 * ⚠ **פגם שנמצא ולא תוקן:** לשורת הכותרת 9 שמות ולשורות הנתונים 10 שדות —
 * העמודה העשירית (הרפרנס) אינה מופיעה בכותרת. כל הקוראים עובדים לפי מיקום
 * ולכן זה לא שובר דבר, אבל הכותרת משקרת. ⛔ לא נגעתי בה כאן.
 */
const fs = require('fs');
const path = require('path');
const P = require('../attestation/permitted-sources.js');
const HERE = __dirname;
const UNITS = path.dirname(HERE);
const ATT = path.join(UNITS, 'attestation');
const FILE = path.join(HERE, 'gloss-status.tsv');

/* ⛔ **מלכודת שנמדדה כאן:** עותק העבודה על הדיסק ב-CRLF, אבל מה שרשום ב-git
 * הוא LF, ו-git **אינו** מנרמל את הקובץ הזה. כתיבה חוזרת ב-CRLF מייצרת דיף
 * פנטום של 4,540 שורות על שינוי של 79. ⭐ לכן נכתב ב-LF, והדיף הוא 80 שורות. */
/* ⛔ `.replace(/\n$/)` לבדו משאיר את ה-`\r` של השורה האחרונה בתוך השדה — נמדד */
const readRows = () => fs.readFileSync(FILE, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).map(l => l.split('\t'));
const writeRows = r => fs.writeFileSync(FILE, r.map(c => c.join('\t')).join('\n') + '\n', 'utf8');

const SRC = 5, STATUS = 6, NOTE = 8, REF = 9, WORD = 3;
const FLAG = '⚠ דרוש מקור';

/* ===== בנק החלופות · רק שורות שעוברות את אותו שער ===== */
const tsv = p => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
function altIndex() {
  const idx = new Map();
  const files = [['attestation.tsv', 0, 2, 3], ['attestation-lexicon-proof.tsv', 0, 2, 3],
    ['attestation-talmud-proof.tsv', 0, 2, 3], ['attestation-nine.tsv', 0, 2, 3],
    ['attestation-299-worth.tsv', 0, 2, 3], ['attestation-new-bank.tsv', 0, 2, 3]];
  for (const [f, w, s, r] of files) {
    const p = path.join(ATT, f);
    if (!fs.existsSync(p)) continue;
    for (const c of tsv(p).slice(1)) {
      const src = (c[s] || '').trim(), ref = (c[r] || '').trim();
      if (!c[w] || !P.usableAlt(src, ref)) continue;
      const k = P.norm(c[w]);
      if (!idx.has(k)) idx.set(k, { file: f, src: src, ref: ref });
    }
  }
  return idx;
}

/* ===== המיון ===== */
function triage(rowsOverride) {
  const rows = rowsOverride || readRows();
  const body = rows.slice(1);
  const idx = altIndex();
  const out = { pending: [], A: [], B: [], C: [], other: [], rows: body.length };
  body.forEach((c, i) => {
    if ((c[STATUS] || '').trim() === 'ממתין') return void out.pending.push(i);
    const v = P.verdict((c[SRC] || '').trim(), (c[REF] || '').trim());
    const rec = { i: i, word: c[WORD] || '', src: (c[SRC] || '').trim(), ref: (c[REF] || '').trim(),
      alt: idx.get(P.norm(c[WORD] || '')) || null };
    if (!v) out.A.push(rec);
    else if (/^ספריא נחלת-הכלל/.test(v)) { rec.cat = v; out.B.push(rec); }
    else if (v === 'ללא מקור כלל') out.C.push(rec);
    else { rec.cat = v; out.other.push(rec); }
  });
  return out;
}

function report(t) {
  const n = t.A.length + t.B.length + t.C.length + t.other.length;
  console.log('שורות בקובץ: ' + t.rows + '  ·  «ממתין» (מחוץ לאוכלוסייה): ' + t.pending.length);
  console.log('');
  console.log('אוכלוסייה · פירושים ותיקים שלא עברו את שער המקורות: ' + n);
  console.log('  A · מקור מותר ורפרנס לא ריק · ⭐ אינו דורש דבר : ' + t.A.length);
  console.log('  B · ספריא «נחלת הכלל» על מהדורה 1929+ · ⛔ טענה בלי כיסוי : ' + t.B.length);
  console.log('        מתוכם יש מקור מותר מוכח בעץ · ניתן להחלפה מיידית : ' + t.B.filter(r => r.alt).length);
  console.log('        מתוכם אין · העמודה עוברת ל-«דרוש מקור»          : ' + t.B.filter(r => !r.alt).length);
  console.log('  C · «דרוש מקור» כבר רשום · דורש מקור חיצוני : ' + t.C.length);
  console.log('  D · תווית לא מוכרת : ' + t.other.length);
  console.log('  ' + (n === t.rows - t.pending.length ? '✅ הסכום מתיישב' : '⛔ הסכום אינו מתיישב'));
  return t;
}

/* ===== ההחלה · קבוצה B בלבד ===== */
function apply() {
  const rows = readRows();
  const t = triage(rows);
  let swapped = 0, flagged = 0, skipped = 0;
  for (const r of t.B) {
    const c = rows[r.i + 1];
    while (c.length < 10) c.push('');
    /* ⛔ אי-חזרתיות · שורה שכבר טופלה אינה מקבלת הערה שנייה */
    if (/⟵ מקור הוחלף|⚠ מהדורה 1929/.test(c[NOTE] || '')) { skipped++; continue; }
    const prev = 'הטענה הקודמת: ' + (c[SRC] || '(ריק)') + ' / ' + (c[REF] || '(ריק)');
    if (r.alt) {
      c[NOTE] = ('⟵ מקור הוחלף · ' + prev + ' · המקור החדש מ-' + r.alt.file + (c[NOTE] ? ' · ' + c[NOTE] : '')).trim();
      c[SRC] = r.alt.src; c[REF] = r.alt.ref; swapped++;
    } else {
      c[NOTE] = ('⚠ מהדורה 1929 ואילך · «נחלת הכלל» אינו מאושר עליה · ' + prev + (c[NOTE] ? ' · ' + c[NOTE] : '')).trim();
      c[SRC] = FLAG; flagged++;
    }
  }
  writeRows(rows);
  console.log('הוחלפו למקור מותר: ' + swapped + '  ·  סומנו «דרוש מקור»: ' + flagged +
    '  ·  כבר טופלו קודם: ' + skipped);
  console.log('⛔ לא נגעתי בטקסט הפירוש, בסטטוס, ובשורות «ממתין».');
}

/* ===== בקרה · שהמיון מסוגל להחזיר מספר אחר ===== */
function selftest() {
  const base = triage();
  console.log('בסיס · A ' + base.A.length + ' · B ' + base.B.length + ' · C ' + base.C.length + ' · D ' + base.other.length);
  const rows = readRows();
  let ok = true;

  /* בקרה 1 · שורה מותרת מורעלת לספריא-1978 · B חייב לגדול ב-1 ו-A לרדת ב-1 */
  const a = rows.map(r => r.slice());
  const i1 = base.A[0].i + 1;
  a[i1][SRC] = 'ספריא · נחלת הכלל';
  a[i1][REF] = 'Injected Control (Jerusalem, 1978 [he])';
  const r1 = triage(a);
  const p1 = r1.B.length === base.B.length + 1 && r1.A.length === base.A.length - 1;
  ok = ok && p1;
  console.log((p1 ? '✓ ' : '⛔ ') + 'בקרה 1 · שורה מותרת ⟵ ספריא 1978 · B ' + base.B.length + '⟵' + r1.B.length +
    ' · A ' + base.A.length + '⟵' + r1.A.length);

  /* בקרה 2 · אותה הזרקה עם 1850 · שום דבר לא זז · הסף הוא מה שמזיז */
  const b = rows.map(r => r.slice());
  b[i1][SRC] = 'ספריא · נחלת הכלל';
  b[i1][REF] = 'Injected Control (Jerusalem, 1850 [he])';
  const r2 = triage(b);
  const p2 = r2.B.length === base.B.length && r2.A.length === base.A.length;
  ok = ok && p2;
  console.log((p2 ? '✓ ' : '⛔ ') + 'בקרה 2 · אותה שורה עם 1850 · B ' + r2.B.length + ' · A ' + r2.A.length + ' · לא זז, כנדרש');

  /* בקרה 3 · שורת «ממתין» אינה נספרת באוכלוסייה */
  const c = rows.map(r => r.slice());
  const pi = base.pending[0] + 1;
  const before = triage(c).A.length;
  c[pi][STATUS] = 'אומת';
  while (c[pi].length < 10) c[pi].push('');
  c[pi][SRC] = 'ויקינתונים (CC0)'; c[pi][REF] = 'L1';
  const r3 = triage(c);
  const p3 = r3.pending.length === base.pending.length - 1 && r3.A.length === before + 1;
  ok = ok && p3;
  console.log((p3 ? '✓ ' : '⛔ ') + 'בקרה 3 · שורת «ממתין» שנסגרה · ממתין ' + base.pending.length + '⟵' +
    r3.pending.length + ' · A ' + before + '⟵' + r3.A.length);

  /* בקרה 4 · שער אחד · המיון והמדידה של הבנק החי מסכימים על אותה תווית */
  const p4 = P.verdict('ספריא · נחלת הכלל', 'x (Jerusalem, 1978 [he])') !== null &&
    P.verdict('ספריא · נחלת הכלל', 'x (Vilna, 1880 [he])') === null &&
    P.verdict('ויקינתונים (CC0)', 'L1') === null && P.verdict('⚠ דרוש מקור', '') === 'ללא מקור כלל';
  ok = ok && p4;
  console.log((p4 ? '✓ ' : '⛔ ') + 'בקרה 4 · השער המיובא מכריע · 1978 נפסל · 1880 עובר · «דרוש מקור» מזוהה');

  console.log(ok ? '\n⭐ למיון יש שיניים · שלוש הזרקות הזיזו אותו והרביעית לא' : '\n⛔ המיון אינו מגיב');
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  const a = process.argv;
  if (a.indexOf('--selftest') >= 0) selftest();
  else if (a.indexOf('--apply') >= 0) apply();
  else {
    const t = report(triage());
    if (a.indexOf('--list') >= 0) {
      console.log('\n=== B · להחלפה מיידית ===');
      t.B.filter(r => r.alt).forEach(r => console.log('  ' + r.word + ' | ' + String(r.ref).slice(0, 55) + ' ⟶ ' + r.alt.src));
      console.log('\n=== B · ל-«דרוש מקור» ===');
      t.B.filter(r => !r.alt).forEach(r => console.log('  ' + r.word + ' | ' + String(r.ref).slice(0, 70)));
      console.log('\n=== C · דורש מקור חיצוני ===');
      t.C.forEach(r => console.log('  ' + r.word + ' | ' + String(r.ref).slice(0, 70)));
    }
  }
}
