/* מנקד את תשובות הבוטים מול blind.key.tsv (דרישת חגי 4).
 *
 *   node sentence-completion/score.js "1:B 2:D ..." "1:B 2:D ..." [...]
 *
 * מה נמדד, ולמה שלושת המדדים ולא אחד:
 *  · **דיוק פר-רצועה** — אם אקדמי אינו קשה יותר מקל, מנגנון הרמות דקורטיבי.
 *    זו הבדיקה האובייקטיבית היחידה שיש לנו על נגזרת-הרמה מ-EN_RANK.
 *  · **פיצול בין פותרים** — פריט שהפותרים נחלקו בו הוא פריט שההקשר אינו מכריע
 *    בו (דרישה 1) או שהתשובה אינה מתלבשת (דרישה 2).
 *  · **פה-אחד-שגוי** — כולם בחרו אותה תשובה שאינה המפתח. זה **לא** פריט קשה,
 *    זה חשד שהמפתח שגוי או שהמסיח טוב מהתשובה. הפריט המסוכן ביותר במאגר.
 *
 * ⚠ הסכמה מלאה אינה מוכיחה איכות. אם כל הפותרים צודקים ב-100%, ייתכן שהפריטים
 *   קלים מדי ללומד אנושי — ראה הערת התקרה בסוף הפלט.
 */
const fs = require('fs'), path = require('path');
/* ⚠ תוקן ב-10.8: הסקריפט קרא תמיד את blind.key.tsv, ולכן ניקוד של 8 פריטי v2 נעשה
   מול מפתח v1 בן 40 — 32 פריטים "חסרי תשובה" נחשבו שגויים, והפלט נראה כמו כשל מוחלט
   של v2. TAG מיישר אותו עם blind_export.js. נוסף גם שער שצועק כשמספר התשובות אינו
   תואם את המפתח, כדי שאי-התאמה כזאת לא תדווח שוב כתוצאה. */
const TAG = process.env.TAG || '';
const key = fs.readFileSync(path.join(__dirname, `blind.key${TAG}.tsv`), 'utf8')
  .trim().split('\n').slice(1).map(l => l.split('\t'));
const K = new Map(key.map(([q, level, n, a]) => [+q, { level, n, a }]));

/* מקבל **גם נתיב קובץ וגם מחרוזת**.
   ⚠ הגרסה הראשונה קיבלה מחרוזת בלבד, ולכן `node score.js runs/x.txt` פירסר את
   **שם הקובץ** כתשובות והחזיר 0. הפיצול היה גם על רווחים, כך ש-`1: D` עם רווח
   נשבר לשני אסימונים ואיבד את התשובה. עכשיו הפרסור הוא שורה-שורה. */
const runs = process.argv.slice(2).map(arg => {
  const src = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg;
  const m = new Map();
  src.split(/\r?\n|\s{2,}/).forEach(line => {
    const mm = String(line).match(/(\d+)\s*[:.]\s*([A-Da-d])\b/);
    if (mm) m.set(+mm[1], mm[2].toUpperCase());
  });
  return m;
});
if (!runs.length) { console.error('אין תשובות. העבר מחרוזת אחת לפחות.'); process.exit(2); }
runs.forEach((r, i) => {
  if (r.size !== K.size) {
    console.error(`⛔ ריצה ${i + 1}: ${r.size} תשובות מול מפתח בן ${K.size} פריטים. ` +
      `כנראה TAG שגוי (blind.key${TAG}.tsv). לא מנקד — ניקוד כזה נראה כמו כשל אמיתי.`);
    process.exit(2);
  }
});

const ORDER = ['בסיס', 'בינוני', 'מתקדם', 'אקדמי'];
const per = {}; ORDER.forEach(l => per[l] = { n: 0, hit: 0 });
const split = [], unanimousWrong = [];

for (const [q, { level, n, a }] of K) {
  const picks = runs.map(r => r.get(q) || '?');
  const uniq = [...new Set(picks)];
  per[level].n++;
  const allRight = picks.every(p => p === a);
  if (allRight) per[level].hit++;
  if (uniq.length > 1) split.push({ q, level, n, a, picks });
  else if (uniq[0] !== a) unanimousWrong.push({ q, level, n, a, got: uniq[0] });
}

console.log(`פותרים: ${runs.length} · פריטים: ${K.size}\n`);
console.log('רצועה    פריטים  פה-אחד-נכון  דיוק');
console.log('─'.repeat(44));
for (const l of ORDER) {
  const p = per[l]; if (!p.n) continue;
  const pct = (p.hit / p.n * 100).toFixed(0);
  const bar = '█'.repeat(Math.round(p.hit / p.n * 18)).padEnd(18, '·');
  console.log(l.padEnd(9) + String(p.n).padEnd(8) + String(p.hit).padEnd(13) + bar + ' ' + pct + '%');
}
const tot = Object.values(per).reduce((a, p) => ({ n: a.n + p.n, hit: a.hit + p.hit }), { n: 0, hit: 0 });
console.log('─'.repeat(44));
console.log('סה"כ'.padEnd(9) + String(tot.n).padEnd(8) + String(tot.hit).padEnd(13) + (tot.hit / tot.n * 100).toFixed(0) + '%');

/* ⚠ הבאג שתוקן ב-10.8: התנאי היה `v <= acc[i-1]`, כלומר **שוויון נחשב ירידה**,
   וקו שטוח ב-100% הודפס כ"✅ יורדת — הרמה מתואמת לקושי". זו הצהרה הפוכה מהאמת:
   קו שטוח הוא היעדר אות. פותר חזק פותר את כל הרצועות, ואז המדידה רוויה ואינה
   אומרת דבר על הקושי — רק על החד-משמעיות. שלוש מסקנות ולא שתיים. */
const acc = ORDER.filter(l => per[l].n).map(l => per[l].hit / per[l].n);
const span = Math.max(...acc) - Math.min(...acc);
const ceiling = Math.min(...acc) >= 0.98;
const strictlyDown = acc.every((v, i) => i === 0 || v < acc[i - 1] - 1e-9);
let verdict;
if (span < 0.05 && ceiling)
  verdict = '  ⚠ רווי — הפותר פתר הכול. מוכיח **חד-משמעיות**, ואינו אומר דבר על קושי.';
else if (span < 0.05)
  verdict = '  ⛔ שטוח — הרמה אינה מנבאת קושי אצל הפותר הזה.';
else if (strictlyDown)
  verdict = '  ✅ יורדת ממש — נגזרת הרמה מ-EN_RANK מתואמת לקושי.';
else
  verdict = '  ⚠ יש פער בין הרצועות אבל לא סדר יורד — לבדוק פר-רצועה.';
console.log('\nעקומת הקושי: ' + acc.map(v => (v * 100).toFixed(0) + '%').join(' → ') + verdict);
if (ceiling && span < 0.05)
  console.log('  ← כדי למדוד קושי צריך פותר חלש בכוונה, או משתמשים אמיתיים.');

if (split.length) {
  console.log('\n⚠ פיצול בין פותרים — ההקשר אינו מכריע (דרישות 1–2):');
  split.forEach(s => console.log(`  שאלה ${s.q} · ${s.level}#${s.n} · מפתח ${s.a} · נבחרו ${s.picks.join('/')}`));
}
if (unanimousWrong.length) {
  console.log('\n⛔ פה אחד שגוי — חשד שהמפתח שגוי או שהמסיח טוב מהתשובה:');
  unanimousWrong.forEach(s => console.log(`  שאלה ${s.q} · ${s.level}#${s.n} · מפתח ${s.a} · כולם ${s.got}`));
}
if (!split.length && !unanimousWrong.length) console.log('\nאין פיצול ואין פה-אחד-שגוי.');

console.log('\n' + '='.repeat(60));
console.log('⚠ תקרה: פותר מלאכותי חזק אינו לומד אנושי. דיוק 100% אצל הבוטים');
console.log('  אינו מוכיח שהפריט טוב — הוא מוכיח שהוא **חד-משמעי**. קושי');
console.log('  בפועל נמדד רק על משתמשים אמיתיים באפליקציה.');
console.log('='.repeat(60));
