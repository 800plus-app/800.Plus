/* שער האיכות להשלמת משפטים · דוחות/השלמת-משפטים-אנגלית-תוכנית.md §6.3
 *
 *   node sentences/check_sentences.js
 *
 * למה Node ולא Python (התוכנית לא קבעה): הנתונים הם `window.SENT_EN` ו-`window.UNIT_DATA_EN`,
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
/* ⭐ 10.8.2026 — הרצועה נגזרת מ-`bands.js`, כלומר ממספר היחידה ב-`data-en.js` **שלנו**,
   ולא מ-`enrank.js`. `enrank.js` נגזר מ-FrequencyWords תחת CC BY-SA 4.0, וחגי קבע
   שלא תישאר חשיפה משפטית בשום נכס (CLAUDE.md). אפס חשיפה = אפס תלות, לא רישיון
   מתירני יותר. הנימוק המלא והמדידה שתומכת בו — בכותרת bands.js.
   ⚠ הקובץ הזה **אינו טוען את enrank.js יותר**. אם מישהו מחזיר אותו, הוא מחזיר את
   התלות ואת החשיפה. */
const B = require(path.join(__dirname, 'bands.js'));
/* SENT_FILE מאפשר להריץ את אותו שער על מאגר אחר — נדרש להשוואת v1 מול v2
   באותם שערים בדיוק. שער שמודד שתי גרסאות בשני קודים אינו משווה ביניהן. */
require(path.join(__dirname, process.env.SENT_FILE || 'sentences-en.js'));
const SENT = global.window.SENT_EN;

const normEn = B.normEn;
const bandOf = B.bandOfUnit;
const bandIdx = B.bandIdx;
/* "דירוג" כאן הוא מספר היחידה: 1–10. שם המשתנה נשמר כדי לא לפזר שינויים,
   אבל היחידות הן יחידות ולא דירוגי תדירות. */
const rankOf = w => B.unitOf(w);

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
    /* ⭐ `src` קודם למספר השורה. המאחד ממיין מחדש בתוך רצועה, ולכן "בסיס#1" אינו
       הפריט הראשון בקובץ המנה — ושער שאינו יכול להצביע על הפריט שנכשל שולח את
       הכותב לתקן את הפריט הלא-נכון. נתפס ב-10.8 כשזה כמעט קרה. */
    const id = it.src ? `${level}·${it.src}` : `${level}#${i + 1}`;
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

    /* מילות הנשיאה. ⛔ תוקן ב-10.8: הגרסה הקודמת פירקה את המשפט למילים בודדות,
       ולכן `even though` (ערך יחידה **2** בבנק) נבדק כ-even=4 + though=4, ו-`in addition`
       כ-addition=5. אחרי שהכלל הוחמר לכשל ברצועת הבסיס, זה פסל כמעט כל מילת קישור
       שהתדריך מבקש. `carrierMaxOf` מתאים את הצירוף הארוך ביותר, כלומר את מה שהבנק
       באמת דירג. אותה מחלה כמו באג הפסיקים: החיפוש לא תאם את אחסון הבנק. */
    const cHit = B.carrierMaxOf(it.s.replace(/___/g, ' '));
    const carrierMax = cHit ? cHit.unit : null;
    const carrierTerm = cHit ? cHit.term : null;
    /* ⚠ הוחמר ל-כשל ברצועת הבסיס ב-10.8, אחרי שמנה 1 החזירה 4 מ-6 פריטי בסיס עם
       מילות נשיאה מיחידות 6–8. התדריך כבר קבע "פריט בסיסי שהמשפט שלו קשה אינו פריט
       בסיסי", והשער רק סימן — כלומר החוק היה כתוב ולא נאכף.
       ברצועות הגבוהות זה נשאר דגל: שם משפט נשיאה עשיר הוא לגיטימי ואף רצוי. */
    if (carrierMax !== null && bandIdx(bandOf(carrierMax)) > bandIdx(level)) {
      const msg = `מילת נשיאה ברצועה גבוהה מהרמה: "${carrierTerm}" = יחידה ${carrierMax} (${bandOf(carrierMax)})`;
      if (level === 'בסיס') E(id, msg + ' — ברצועת הבסיס משפט הנשיאה חייב להיות בסיסי גם הוא');
      else F(id, msg);
    }

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

  /* ⛔ נוסף ב-10.8: **מפתח כפול**. הבדיקה שמעל מצאה key↔distractor אבל לא שני פריטים
     שהתשובה בהם זהה — ו-`retain` ו-`draft` היו מפתח בשני פריטי מתקדם כל אחד. הלומד
     רואה את אותה תשובה פעמיים, וזה גרוע מחפיפת מסיח. תוצאה ישירה של הפיצול המקבילי:
     כותבים אינם רואים זה את זה, ולכן זו **חייבת** להיות בדיקה של הקורפוס ולא של הכותב.
     כשל ולא דגל — פריט כפול הוא פגם במוצר, לא הערה. */
  const keyOwners = new Map();
  [...correctHere].forEach(t => {
    const [w, id] = t.split('@');
    if (!keyOwners.has(w)) keyOwners.set(w, new Set());
    keyOwners.get(w).add(id);
  });
  [...keyOwners].filter(([, ids]) => ids.size > 1).forEach(([w, ids]) =>
    E(level, `"${w}" הוא המפתח ביותר מפריט אחד: ${[...ids].join(', ')} — הלומד יראה אותה תשובה פעמיים`));
}

/* ── מקום התשובה · הבאג של 10.8 ──────────────────────────────────────
   כל הפריטים נכתבו עם a:0 כדי שהתשובה תהיה ראשונה וקריאה לביקורת. זה תקין
   **בנתונים** ופסול **בהגשה**: ייצוא ראשון נתן A בכל 40 הפריטים, כלומר בוט
   שעונה A תמיד מקבל 100%, ולומד מזהה את התבנית בשאלה החמישית.
   ההערה הזאת אינה כשל אלא חוזה: מי שמגיש — blind_export.js והמסך בשלב 2 —
   חייב לערבב. השער מוודא שהחוזה נאמר בקול ולא נשכח. */
const aDist = {};
Object.values(SENT).flat().forEach(it => { aDist[it.a] = (aDist[it.a] || 0) + 1; });
if (Object.keys(aDist).length === 1)
  F('הגשה', `כל התשובות באינדקס ${Object.keys(aDist)[0]} — **המגיש חייב לערבב**. ` +
           `בלי ערבוב: בוט שעונה תמיד אותה אות מקבל 100%, והמדידה חסרת ערך.`);

/* ── §5 שלב 1 · פיזור סוגי k ───────────────────────────────────────
   ⚠ כלל **קורפוס**, לא כלל פריט. §5 מציב אותו למאגר של 200. על מדגם של 8 פריטים
   15% הם 1.2 פריטים, ואז פריט אחד לכאן או לכאן מפיל את השער — מה שקרה ב-10.8
   כששלושה פריטים תוקנו לטובה וה-k שלהם זז. הבחירה הייתה בין לעקם שלושה פריטים
   טובים כדי לספק כלל קורפוס, ובין להגביל את הכלל לסקאלה שנכתב לה. **לכייל תוכן
   כדי לספק שער זו בדיוק ההפרה שהשער אמור למנוע**, ולכן הכלל מושתק מתחת ל-20
   ומדווח במקום להישתק בשקט. */
const total = Object.values(kCount).reduce((a, b) => a + b, 0);
const K_MIN_N = 20;
if (total < K_MIN_N) {
  console.log(`\nℹ כלל פיזור ה-k (§5, ≥15% לשלוש המשפחות) לא נאכף — ${total} פריטים, ` +
              `מתחת ל-${K_MIN_N}. הוא כלל קורפוס ואינו בר-מדידה על מדגם.`);
} else {
  for (const fam of ['contrast', 'cause', 'addition']) {
    const pct = ((kCount[fam] || 0) / total) * 100;
    if (pct < 15) E('פיזור', `k=${fam} הוא ${pct.toFixed(1)}% — מתחת ל-15% שהתוכנית דורשת`);
  }
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
