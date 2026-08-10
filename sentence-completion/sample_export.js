/* דוגם תת-קבוצה מרובדת מהקורפוס, ומייצא ממנה שאלון עיוור + שאלון cloze.
 *
 *   node sentence-completion/sample_export.js 60
 *
 * למה דגימה ולא הקורפוס כולו
 * --------------------------
 * שערי הבוטים דורשים ששה פותרים, וכל פרומט מכיל את השאלון במלואו. על 209 פריטים
 * זה פרומט של ~1,300 שורות לכל פותר — יקר, ובגודל כזה גם פחות אמין: פותר שמתעייף
 * בפריט 180 מייצר רעש שנראה כמו פגם בפריט.
 *
 * ⚠ **וזו דגימה, ואני אומר את זה במקום להציג אותה כמדידה מלאה.** ההערכה על 60
 * פריטים מרובדים היא הערכה טובה לאיכות הקורפוס, ואינה תעודה לכל פריט בו. פריט
 * שלא נדגם לא נבדק — נקודה. הפריטים שנדגמו נרשמים בקובץ, כדי שסבב הבא ידגום אחרים.
 *
 * הריבוד לפי רצועה ולפי היחס בקורפוס, כדי שהאקדמי — הרצועה החלשה במדידות הקודמות
 * (4 מ-10 גבוליים) — לא ייעלם מהמדגם.
 *
 * זרע קבוע 800, אותו זרע של חלוקת ה-held-out. ריצה חוזרת נותנת אותו מדגם, אחרת
 * אי אפשר להשוות בין סבבים.
 */
const fs = require('fs'), path = require('path');
global.window = {};
require(path.join(__dirname, 'sentences-en-v3.js'));
const SENT = global.window.SENT_EN;

const N = parseInt(process.argv[2] || '60', 10);
let seed = 800;
const rnd = () => (seed = (seed + 0x6D2B79F5) | 0,
  ((s => (s = Math.imul(s ^ s >>> 15, s | 1), s ^= s + Math.imul(s ^ s >>> 7, s | 61), ((s ^ s >>> 14) >>> 0) / 4294967296))(seed)));

const bands = Object.keys(SENT);
const total = bands.reduce((a, b) => a + SENT[b].length, 0);
const picked = [];
for (const b of bands) {
  const arr = SENT[b].slice();
  const want = Math.max(1, Math.round(SENT[b].length / total * N));
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  arr.slice(0, want).forEach(it => picked.push({ band: b, it }));
}
/* ערבוב סופי — אחרת כל פריטי רצועה מגיעים רצוף והפותר מסיק את הרמה מהמקום. */
for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }

const LET = ['A', 'B', 'C', 'D'];
const blind = ['# ' + picked.length + ' sentence-completion items. Choose the ONE option that best completes each sentence.',
  '# "___ ... ___" means two blanks: the option supplies both words, in order.', ''];
const cloze = ['# Fill in each blank. You are given NO options — derive the word from the context alone.',
  '# "___ ... ___" means two blanks: supply both words, in order. Give the BASE FORM of verbs.', ''];
const key = [];

picked.forEach((r, idx) => {
  const q = idx + 1, it = r.it;
  const order = it.o.map((_, j) => j);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  blind.push(`${q}. ${it.s}`);
  order.forEach((oi, pos) => blind.push(`   ${LET[pos]}) ${[].concat(it.o[oi]).join(' … ')}`));
  blind.push('');
  cloze.push(`${q}. ${it.s}`);
  const words = [].concat(it.o[it.a]);
  key.push([q, r.band, it.src || '?', LET[order.indexOf(it.a)], words.join('|'), words.length].join('\t'));
});

const dir = path.join(__dirname, 'exam');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'blind-s.txt'), blind.join('\n'), 'utf8');
fs.writeFileSync(path.join(dir, 'cloze-s.txt'), cloze.join('\n'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'sample.key.tsv'),
  'q\tband\tsrc\tanswer\twords\tblanks\n' + key.join('\n') + '\n', 'utf8');
/* ⚠ המנקדים קוראים סכימות קבועות: score.js צריך (q, level, n, answer) ו-score_cloze.js
   צריך (q, level, n, words, blanks). sample.key.tsv נושא עמודה נוספת (src), ולכן הזנה
   שלו ישירות הייתה מזיזה עמודה ומייצרת ניקוד שנראה תקין ואינו. שני הקבצים נכתבים
   בסכימה שכל מנקד מצפה לה, עם TAG=-s. */
const rows = key.map(l => l.split('\t'));   // [q, band, src, answer, words, blanks]
fs.writeFileSync(path.join(__dirname, 'blind.key-s.tsv'),
  'q\tlevel\tn\tanswer\n' + rows.map(r => [r[0], r[1], r[2], r[3]].join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(__dirname, 'cloze.key-s.tsv'),
  'q\tlevel\tn\twords\tblanks\n' + rows.map(r => [r[0], r[1], r[2], r[4], r[5]].join('\t')).join('\n') + '\n', 'utf8');

const per = {}; picked.forEach(p => per[p.band] = (per[p.band] || 0) + 1);
process.stderr.write(`מדגם: ${picked.length} מתוך ${total} (${(picked.length / total * 100).toFixed(0)}%)\n`);
process.stderr.write(Object.entries(per).map(([b, n]) => `${b} ${n}/${SENT[b].length}`).join(' · ') + '\n');
process.stderr.write(`exam/blind-s.txt · exam/cloze-s.txt · המפתח: sample.key.tsv (מחוץ ל-exam/)\n`);
process.stderr.write('⚠ פריט שלא נדגם לא נבדק. זו הערכה, לא תעודה לכל פריט.\n');
