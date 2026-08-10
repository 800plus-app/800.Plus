/* שער האיכות להשלמת משפטים · דוחות/השלמת-משפטים-אנגלית-תוכנית.md §6.3
 *
 *   node sentences/check_sentences.js
 *
 * למה Node ולא Python (התוכנית לא קבעה): הנתונים הם `window.SENT_EN` ו-`window.EN_RANK`,
 * שני קובצי JS. גייט בפייתון היה צריך לפרסר object literal עם מפתחות בלי מרכאות —
 * כלומר לכתוב פרסר JS, ולסמוך עליו. כאן `require` קורא את אותו קובץ שהדפדפן יקרא.
 * זה גם הדפוס שכבר קיים בפרויקט (`node tests/run.js`).
 *
 * ⚠ גייט 4 של §6.3 (חד-משמעיות) **אינו מיושם כאן ואינו יכול להיות.** הוא דורש
 * קריאת LLM שפותרת את השאלה בלי לדעת את התשובה. הסקריפט מדווח עליו כ"לא נבדק"
 * במקום להשתיק אותו — שער שמדלג בשקט על הבדיקה החשובה ביותר גרוע משער שאין.
 */
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'enrank.js'));
require(path.join(__dirname, 'sentences-en.js'));
const RANK = global.window.EN_RANK;
const SENT = global.window.SENT_EN;

/* מועתק מ-app.js:303. אם normEn משתנה שם, הרמות כאן זזות — ולכן הוא נבדק מול המקור. */
function normEn(s) {
  return (s == null ? '' : String(s)).normalize('NFKC').toLowerCase()
    .trim().replace(/^(to|a|an|the)\s+/, '')
    .replace(/[-–—/|]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/* §4 — הרצועות. הגבול העליון הוא כולל. */
const BANDS = [
  ['בסיס', 0, 2000],
  ['בינוני', 2001, 5000],
  ['מתקדם', 5001, 10000],
  ['אקדמי', 10001, Infinity],
];
const bandOf = r => (BANDS.find(b => r >= b[1] && r <= b[2]) || ['?'])[0];
const bandIdx = n => BANDS.findIndex(b => b[0] === n);

const rankOf = w => { const v = RANK[normEn(w)]; return typeof v === 'number' ? v : null; };

const errors = [], flags = [];
const E = (id, m) => errors.push(`⛔ ${id} · ${m}`);
const F = (id, m) => flags.push(`⚠ ${id} · ${m}`);

const seenSentences = new Map();
const rows = [];
const kCount = {};

for (const [level, items] of Object.entries(SENT)) {
  if (bandIdx(level) === -1) { E(level, `רמה שאינה אחת מארבע הרצועות של §4`); continue; }
  const correctHere = new Set(), distractorHere = new Set();

  items.forEach((it, i) => {
    const id = `${level}#${i + 1}`;
    const blanks = (it.s.match(/___/g) || []).length;
    const pair = Array.isArray(it.o[0]);

    /* ── גייט 1 · מכני ───────────────────────────────────────────── */
    if (it.o.length !== 4) E(id, `${it.o.length} מסיחים במקום 4`);
    if (!Number.isInteger(it.a) || it.a < 0 || it.a >= it.o.length) E(id, `a=${it.a} מחוץ לטווח`);
    if (blanks === 0) E(id, 'אין ___ במשפט');
    if (pair && blanks !== 2) E(id, `o הוא זוגות אבל יש ${blanks} חסרים`);
    if (!pair && blanks !== 1) E(id, `o הוא מילים בודדות אבל יש ${blanks} חסרים`);
    if (pair && it.o.some(p => !Array.isArray(p) || p.length !== 2))
      E(id, 'לא כל איברי o הם זוגות באורך 2');
    const key = it.s.trim();
    if (seenSentences.has(key)) E(id, `משפט כפול · זהה ל-${seenSentences.get(key)}`);
    else seenSentences.set(key, id);
    if (!it.e || !it.e.trim()) E(id, 'אין הסבר e');
    const flat = it.o.flat();
    if (new Set(flat.map(normEn)).size !== new Set(it.o.map(o => JSON.stringify(o))).size && !pair)
      E(id, 'מסיחים כפולים');

    /* ── גייט 5 · מילת הקישור שהוצהרה מופיעה באמת ────────────────── */
    const sLow = it.s.toLowerCase();
    (it.w || []).forEach(w => {
      if (!sLow.includes(String(w).toLowerCase())) E(id, `w="${w}" אינו מופיע ב-s`);
    });
    if (!it.w || !it.w.length) F(id, 'אין w — לא ניתן לתרגול ממוקד לפי מילת קישור');
    kCount[it.k] = (kCount[it.k] || 0) + 1;

    /* ── גייט 2 · כל מסיח קיים ב-EN_RANK ─────────────────────────── */
    const missing = flat.filter(w => rankOf(w) === null);
    if (missing.length) E(id, `מסיחים שאינם ב-EN_RANK: ${missing.join(', ')}`);

    /* ── גייט 3 · הרמה נגזרת ומושווית למוצהרת ────────────────────── */
    const ranks = flat.map(rankOf).filter(r => r !== null);
    const optMax = ranks.length ? Math.max(...ranks) : null;
    const derived = optMax === null ? '?' : bandOf(optMax);
    const gap = derived === '?' ? 0 : Math.abs(bandIdx(derived) - bandIdx(level));
    if (gap >= 2) E(id, `רמה מוצהרת ${level} מול נגזרת ${derived} (max=${optMax}) — פער של ${gap} רצועות`);
    else if (gap === 1) F(id, `רמה מוצהרת ${level} מול נגזרת ${derived} (max=${optMax})`);

    /* מילות הנשיאה — מדווחות, לא פוסלות. אין רשימת תדירות כללית לאמת מולה. */
    const carrier = it.s.replace(/___/g, ' ').split(/[^A-Za-z']+/).filter(Boolean);
    const cRanks = carrier.map(rankOf).filter(r => r !== null);
    const carrierMax = cRanks.length ? Math.max(...cRanks) : null;
    if (carrierMax !== null && bandIdx(bandOf(carrierMax)) > bandIdx(level))
      F(id, `מילת נשיאה ברצועה גבוהה מהרמה: ${bandOf(carrierMax)} (${carrierMax})`);

    /* ⚠ נרשם עם מזהה הפריט, ולא כקבוצה שטוחה. בפריט דו-חסר המסיחים חולקים מילים
       **בכוונה** — `orderly/incomprehensible` מול `orderly/widespread` היא בדיוק מלכודת
       "המילה הראשונה נכונה, השנייה לא" מ-§1.4. גרסה קודמת השוותה קבוצות שטוחות וסימנה
       11 דגלים שכולם היו הצלבה בתוך אותו פריט, כלומר תלונה על התכנון ולא על פגם. */
    [].concat(it.o[it.a]).forEach(w => correctHere.add(normEn(w) + '@' + id));
    it.o.forEach((o, j) => {
      if (j !== it.a) [].concat(o).forEach(w => distractorHere.add(normEn(w) + '@' + id));
    });

    rows.push({ id, level, derived, optMax, carrierMax, k: it.k, blanks, it });
  });

  /* ── §5 שלב 1 · תשובה נכונה שמשמשת מסיח **בפריט אחר** באותה רמה ─── */
  const dWords = new Map();
  [...distractorHere].forEach(t => {
    const [w, id] = t.split('@');
    if (!dWords.has(w)) dWords.set(w, new Set());
    dWords.get(w).add(id);
  });
  [...correctHere].forEach(t => {
    const [w, id] = t.split('@');
    const elsewhere = [...(dWords.get(w) || [])].filter(o => o !== id);
    if (elsewhere.length)
      F(level, `"${w}" נכונה ב-${id} ומסיחה ב-${elsewhere.join(', ')}`);
  });
}

/* ── §5 שלב 1 · פיזור סוגי k ─────────────────────────────────────── */
const total = Object.values(kCount).reduce((a, b) => a + b, 0);
for (const fam of ['contrast', 'cause', 'addition']) {
  const pct = ((kCount[fam] || 0) / total) * 100;
  if (pct < 15) E('פיזור', `k=${fam} הוא ${pct.toFixed(1)}% — מתחת ל-15% שהתוכנית דורשת`);
}

/* ── דיווח ───────────────────────────────────────────────────────── */
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
console.log('רמה      פריט  נגזרת    max  נשיאה  חסרים  k');
console.log('─'.repeat(60));
for (const r of rows) {
  console.log(pad(r.level, 9) + pad(r.id.split('#')[1], 6) + pad(r.derived, 9) +
    pad(r.optMax, 6) + pad(r.carrierMax === null ? '—' : r.carrierMax, 7) +
    pad(r.blanks, 7) + r.k);
}
console.log('\nפיזור k: ' + Object.entries(kCount).map(([k, v]) =>
  `${k} ${v} (${((v / total) * 100).toFixed(0)}%)`).join(' · '));

if (flags.length) { console.log('\n' + '─'.repeat(60)); flags.forEach(f => console.log(f)); }
if (errors.length) { console.log('\n' + '─'.repeat(60)); errors.forEach(e => console.log(e)); }

console.log('\n' + '='.repeat(60));
console.log(`${total} פריטים · ${errors.length} כשלים · ${flags.length} דגלים`);
console.log('⚠ גייט 4 (חד-משמעיות · פתרון עיוור ב-LLM) — לא נבדק. דורש קריאת מודל.');
console.log(errors.length ? '⛔ השער נכשל' : '✅ השער עבר');
console.log('='.repeat(60));
process.exit(errors.length ? 1 : 0);
