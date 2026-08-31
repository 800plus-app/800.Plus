'use strict';
/* שער הכיוון · האם ארבעת הכיוונים של הפריט עומדים.
 *
 *   node connectives-he/check_direction_he.js
 *   node connectives-he/check_direction_he.js --require-words
 *
 * למה הכיוון הוא הציר ולא מילת הקישור
 * -----------------------------------
 * התרגיל הראשי ביחידה הזאת הוא «לאיזה כיוון המשפט הולך». ‏`d` נושא כיוון לכל
 * אחת מארבע האפשרויות, ו-`k` הוא הכיוון של הפריט. שלושה כשלים הורגים את
 * התרגיל בשקט:
 *
 *   1. ‏`k` שאינו הכיוון של התשובה (`d[a]`) · הפריט מלמד את ההפך ממה שהוצהר.
 *   2. שני כיוונים זהים ב-`d` · ⛔ **זה החמור מכולם.** שתי אפשרויות שנושאות את
 *      אותו כיוון הופכות את השאלה «לאיזה כיוון» לשאלה בלי תשובה יחידה, והלומד
 *      שנפסל עליה צודק. פריט כזה שבור גם כשכל שאר השדות מושלמים.
 *   3. כיוון שאינו בקבוצה הסגורה · שגיאת כתיב שהופכת לקטגוריה בת פריט אחד.
 *
 * ⚠ ומה השער **אינו** יכול לומר: אם המשפט עצמו באמת הולך לכיוון שהוצהר. זו
 * קריאה אנושית, והיא נמדדת בביקורת העיוורת (שלב 2) ולא כאן.
 *
 * ⭐ מפת מילה⟵כיוון: המקור המוסמך הוא `connectives-he/words.json` כשהוא קיים.
 * ⛔ הוא **אינו** משוכפל לכאן. כשהוא איננו, המפה נגזרת מהמנות עצמן — ואז
 * הסתירה שהשער תופס היא «אותה מילה הוצהרה בשני כיוונים בשני פריטים», וזה
 * ממצא אמיתי בפני עצמו.
 */
const L = require('./lib_conn.js');

const { items, files, broken, dir } = L.loadBatches();
const words = L.loadWords();
const requireWords = process.argv.includes('--require-words');

const findings = broken.slice();
const notes = [`מנות: ${files.join(', ') || '(אין)'} · ${dir}`];

if (words.present) notes.push(`מפת המילים: ${words.byWord.size} מילים מ-words.json`);
else {
  notes.push(`ℹ words.json אינו בשימוש (${words.reason}) · המפה נגזרת מהמנות בלבד.`);
  if (requireWords) {
    console.log(notes.join('\n'));
    console.log(`\n⛔ הופעל --require-words ו-${words.path} אינו קריא. אין מפה מוסמכת.`);
    process.exit(1);
  }
}

/* ── כללים לכל פריט ──────────────────────────────────────────────────────*/
const byWordDir = new Map();                   // מפתח קנוני → { dir, src }
const absent = new Set();                      // מילים שאינן ברשימת המילים · מידע, לא ממצא
const kCount = {};

for (const it of items) {
  const add = m => findings.push(`${it.src} · ${m}`);
  const d = Array.isArray(it.d) ? it.d : null;
  if (!d) { add('d אינו מערך'); continue; }
  if (d.length !== 4) add(`d באורך ${d.length} ולא 4`);

  for (const x of d) if (!(x in L.DIRECTIONS)) add(`כיוון שאינו בקבוצה הסגורה: "${x}"`);
  if (!(it.k in L.DIRECTIONS)) add(`k שאינו בקבוצה הסגורה: "${it.k}"`);
  kCount[it.k] = (kCount[it.k] || 0) + 1;

  /* k === d[a] */
  const a = it.a;
  if (typeof a !== 'number' || !d[a]) add(`a=${JSON.stringify(a)} אינו מצביע על איבר ב-d`);
  else if (it.k !== d[a]) add(`k="${it.k}" אינו d[${a}]="${d[a]}"`);

  /* אין שני כיוונים זהים */
  const seen = new Map();
  d.forEach((x, i) => {
    if (seen.has(x)) findings.push(`${it.src} · שני כיוונים זהים ב-d: "${x}" ב-[${seen.get(x)}] וב-[${i}] — לשאלה אין תשובה יחידה`);
    else seen.set(x, i);
  });

  /* מפת מילה⟵כיוון · עקביות בין פריטים, ומול words.json כשהוא קיים */
  const o = Array.isArray(it.o) ? it.o : [];
  o.forEach((opt, i) => {
    const kk = L.key(opt);
    if (!kk || !d[i]) return;
    const prev = byWordDir.get(kk);
    if (prev && prev.dir !== d[i])
      findings.push(`${it.src} · "${kk}" הוצהרה "${d[i]}" כאן ו-"${prev.dir}" ב-${prev.src}`);
    else if (!prev) byWordDir.set(kk, { dir: d[i], src: it.src });

    if (words.present) {
      const rec = words.byWord.get(kk);
      /* ⚠ **היעדר אינו סתירה.** מסיח לגיטימי יכול להיות מחוץ לרשימת הלימוד
         של היחידה («כדי ש», «לשם»), ודיווח על כל אחד כזה כממצא היה צובע
         את השער אדום על נתון תקין · וזו הדרך הבדוקה לכבות שער אמיתי.
         היעדר נספר ומדווח כשורת מידע; **סתירה** היא ממצא. */
      if (!rec) absent.add(kk);
      else if (rec.dir && rec.dir !== d[i])
        findings.push(`${it.src} · "${kk}" מוצהרת "${d[i]}" · ברשימת המילים היא "${rec.dir}" (${rec.cat})`);
    }
  });
}

/* ── בקרה חיובית ─────────────────────────────────────────────────────────
   ⛔ בלי השורות האלה «0 ממצאים» יכול להיות גם התוצאה של מפה ריקה. */
const crossed = [...byWordDir.keys()].length;
notes.push(`מפת מילה⟵כיוון שנגזרה מהמנות: ${crossed} מילים · פיזור k: ` +
  Object.entries(kCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${L.DIRECTIONS[k] || k} ${n}`).join(' · '));
if (absent.size)
  notes.push(`ℹ מסיחים שאינם ברשימת המילים (לגיטימי, לא נוצלב): ${[...absent].join(', ')}`);
notes.push('⚠ נבדקה עקביות ההצהרות. אם המשפט עצמו הולך לכיוון שהוצהר —');
notes.push('   זו קריאה אנושית ונמדדת בביקורת העיוורת, לא כאן.');

process.exit(L.verdict('שער הכיוון · מילות קישור', items.length, findings, notes));
