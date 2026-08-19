/* שער כיסוי ההקשר (דרישת חגי 1) — מייצא את המשפטים **בלי האפשרויות בכלל**.
 *
 *   node sentence-completion/cloze_export.js > sentence-completion/cloze.txt
 *
 * למה זה חזק מרב-ברירה, וזו כל הנקודה
 * ------------------------------------
 * בבדיקת רב-הברירה קיבלנו 40/40 משלושה פותרים — ואז הביקורת האדוורסרית הראתה
 * ש-16 פריטים אינם אנגלית טבעית. כלומר ה-100% הושג ב**אלימינציה**: המסיחים היו
 * אבסורדיים (naval, bee, onion), ולכן אפשר היה לפתור בלי לקרוא את המשפט.
 *
 * ⭐ ייצור בלי אפשרויות **מבטל אלימינציה לחלוטין.** מי שמשלים את החסר חייב לגזור
 * את המילה מההקשר בלבד. אם הוא לא מגיע לתשובה — ההקשר אינו מכריע, וזה בדיוק
 * מה שדרישה 1 אוסרת ("לא ממציאים משפטים בלי קונטקסט").
 *
 * ותוצר-משנה שהוא עיקר: אם הפותר כותב `resolve` ואני כתבתי `solve`, השער תופס גם
 * את דרישה 2 — הצירוף הלא-טבעי — באותה ריצה. שני השערים במכשיר אחד.
 *
 * המספור זהה ל-blind.txt בכוונה: הוא נקרא מ-blind.key.tsv ולא מחושב מחדש, כדי
 * ששאלה 15 כאן תהיה שאלה 15 שם. אחרת אי אפשר להצליב בין שתי המדידות.
 */
const fs = require('fs'), path = require('path');
global.window = {};
require(path.join(__dirname, process.env.SENT_FILE || 'sentences-en.js'));
const SENT = global.window.SENT_EN;
const TAG = process.env.TAG || '';

const keyFile = path.join(__dirname, `blind.key${TAG}.tsv`);
if (!fs.existsSync(keyFile)) {
  console.error('blind.key.tsv חסר. הרץ קודם: node sentence-completion/blind_export.js > sentence-completion/blind.txt');
  process.exit(2);
}
const rows = fs.readFileSync(keyFile, 'utf8').trim().split('\n').slice(1)
  .map(l => l.split('\t')).map(([q, level, n]) => ({ q: +q, level, n: +n }));

const key = [];
console.log('# Fill in each blank. You are given NO options — derive the word from the context alone.');
console.log('# "___ ... ___" means two blanks: supply both words, in order.');
console.log('');
for (const r of rows) {
  const it = SENT[r.level][r.n - 1];
  if (!it) { console.error(`פריט חסר: ${r.level}#${r.n}`); process.exit(2); }
  console.log(`${r.q}. ${it.s}`);
  const correct = [].concat(it.o[it.a]);
  key.push(`${r.q}\t${r.level}\t${r.n}\t${correct.join('|')}\t${correct.length}`);
}
fs.writeFileSync(path.join(__dirname, `cloze.key${TAG}.tsv`),
  'q\tlevel\tn\twords\tblanks\n' + key.join('\n') + '\n', 'utf8');
process.stderr.write(`מפתח נכתב ל-cloze.key${TAG}.tsv (${key.length} פריטים) — לא לתת אותו לפותרים.\n`);
