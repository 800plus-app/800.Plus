/* מייצא את השאלון **בלי מפתח התשובות** — הקלט לבוטים הפותרים (דרישת חגי 4).
 *
 *   node sentence-completion/blind_export.js > sentence-completion/blind.txt
 *
 * למה בלי המפתח, ולמה בקובץ נפרד: פותר שרואה את התשובה אינו פותר, הוא מאשר.
 * זה בדיוק גייט 4 של §6.3 ("בקשה נפרדת ל-LLM לפתור את השאלה בלי לדעת את התשובה").
 *
 * ⚠ הסדר מעורבב בזרע קבוע. בלי זה כל הפריטים של רמה אחת מגיעים רצוף, והפותר
 * מסיק את הרמה מהמקום ברשימה — כלומר מקבל רמז שהלומד לא יקבל, והמדידה מזדהמת.
 * זרע קבוע ולא Math.random: ריצה חוזרת חייבת לתת את אותו קובץ, אחרת אי אפשר
 * להשוות בין סבבים.
 */
const path = require('path');
global.window = {};
require(path.join(__dirname, process.env.SENT_FILE || 'sentences-en.js'));
const SENT = global.window.SENT_EN;
const TAG = process.env.TAG || '';   // מפריד את מפתחות v2 ממפתחות v1

const items = [];
for (const [level, arr] of Object.entries(SENT))
  arr.forEach((it, i) => items.push({ level, n: i + 1, it }));

/* mulberry32 — PRNG דטרמיניסטי. הזרע 800 הוא אותו זרע של חלוקת ה-held-out. */
let seed = 800;
const rnd = () => (seed = (seed + 0x6D2B79F5) | 0,
  ((s => (s = Math.imul(s ^ s >>> 15, s | 1), s ^= s + Math.imul(s ^ s >>> 7, s | 61), ((s ^ s >>> 14) >>> 0) / 4294967296))(seed)));
for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }

const LET = ['A', 'B', 'C', 'D'];
const key = [];
console.log(`# ${items.length} sentence-completion items. Choose the ONE option that best completes each sentence.`);
console.log('# Two blanks (___ ... ___) means the option supplies both words, in order.');
console.log('');
items.forEach((r, idx) => {
  const q = idx + 1;
  /* ⛔ הבאג שנתפס כאן ב-10.8: כל 40 הפריטים נכתבו עם a:0 (התשובה ראשונה — קריא
     לביקורת), ולכן הייצוא נתן A בכל 40. פותר שעונה A תמיד מקבל 100%, והמדידה
     חסרת ערך; ולומד היה מזהה את התבנית בשאלה החמישית. הערבוב כאן הוא חובה,
     לא נוחות. אותה חובה חלה על המסך בשלב 2 — ראה check_sentences.js. */
  const order = r.it.o.map((_, j) => j);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  console.log(`${q}. ${r.it.s}`);
  order.forEach((oi, pos) => console.log(`   ${LET[pos]}) ${[].concat(r.it.o[oi]).join(' … ')}`));
  console.log('');
  key.push(`${q}\t${r.level}\t${r.n}\t${LET[order.indexOf(r.it.a)]}`);
});
require('fs').writeFileSync(path.join(__dirname, `blind.key${TAG}.tsv`),
  'q\tlevel\tn\tanswer\n' + key.join('\n') + '\n', 'utf8');
process.stderr.write(`מפתח נכתב ל-blind.key${TAG}.tsv (${key.length} פריטים) — לא לתת אותו לפותרים.\n`);
