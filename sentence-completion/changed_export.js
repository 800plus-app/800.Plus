/* מייצא לבדיקה חוזרת **רק את הפריטים שהשתנו** מאז קומיט נתון.
 *
 *   node sentence-completion/changed_export.js [ref]      ברירת מחדל HEAD
 *
 * למה ממוקד ולא הרצה חוזרת של הכל
 * --------------------------------
 * המדידה האובייקטיבית על 204 הפריטים כבר רצה: שני פותרי רב-ברירה, שלושה פותרי
 * קלוז, וביקורת אדוורסרית. אחרי סבב התיקונים **גוף המשפט השתנה בחלק מהפריטים**,
 * ולכן המדידה מיושנת עבורם ותקפה עבור השאר. הרצה חוזרת של הכל הייתה מבזבזת חמש
 * ריצות שלמות כדי למדוד מחדש פריטים שלא נגעו בהם.
 *
 * ⚠ והכי חשוב: הפריטים שהשתנו הם בדיוק אלה ש**נמצאו שבורים**. הם הקבוצה שחייבת
 * הוכחה מחדש. לומר "השערים עוברים" על פריט שתוקן בלי למדוד אותו שוב הוא בדיוק
 * מה שהתיקון בא למנוע.
 *
 * הפלט: cloze-recheck.txt · blind-recheck.txt · והמפתחות שלהם.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const REF = process.argv[2] || 'HEAD';
const dir = path.join(__dirname, 'batches');
const ROOT = path.join(__dirname, '..');

/* הגרסה הקומטת של כל מנה, כדי להשוות מולה. מנה שאינה בקומיט = חדשה כולה. */
const committed = f => {
  try {
    return JSON.parse(cp.execFileSync('git',
      ['show', `${REF}:sentence-completion/batches/${f}`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
  } catch (e) { return null; }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changed = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const now = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const old = committed(f);
  now.forEach((it, i) => {
    const src = `${f.replace(/\.json$/, '')}#${i + 1}`;
    const before = old && old[i];
    /* רק שינוי ב**פריט** מחייב מדידה מחדש. שינוי ב-g/t/r הוא הסבר, ואינו משנה
       את מה שהפותר רואה: הוא פותר מ-s ומ-o בלבד. */
    if (!before || !same(before.s, it.s) || !same(before.o, it.o) || before.a !== it.a)
      changed.push({ ...it, src });
  });
}

if (!changed.length) { console.log('אין פריטים שהשתנו מאז ' + REF + ' — אין מה למדוד מחדש.'); process.exit(0); }

const lbl = o => Array.isArray(o) ? o.join(' + ') : String(o);
const L = 'ABCD';
/* ⚠ ערבוב עם זרע קבוע. בלי ערבוב כל התשובות יוצאות באות A (הקורפוס שמור ב-a:0),
   ובוט שעונה תמיד A מקבל 100% והמדידה חסרת ערך. זרע קבוע ולא Math.random כדי
   שהרצה חוזרת תיתן את אותו קובץ. */
let seed = 20260810;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const blind = ['# פריטים שתוקנו, למדידה חוזרת. בחר את האפשרות המשלימה נכון.',
  '# "___ … ___" פירושו שני חסרים; האפשרות מספקת את שתי המילים בסדרן.', ''];
const cloze = ['# אותם פריטים, **בלי אפשרויות**. גזור את המילה מההקשר.',
  '# "___ … ___" פירושו שני חסרים; ספק את שתיהן בסדרן.', ''];
const bKey = ['q\tsrc\tanswer'], cKey = ['q\tsrc\twords\tblanks'];

changed.forEach((it, n) => {
  const q = n + 1;
  const idx = shuf(it.o.map((_, i) => i));
  const a = idx.indexOf(it.a);
  blind.push(`${q}. ${it.s}`);
  idx.forEach((i, j) => blind.push(`   ${L[j]}) ${lbl(it.o[i])}`));
  blind.push('');
  cloze.push(`${q}. ${it.s}`);
  bKey.push(`${q}\t${it.src}\t${L[a]}`);
  const words = [].concat(it.o[it.a]);
  cKey.push(`${q}\t${it.src}\t${words.join('|')}\t${words.length}`);
});

const w = (f, lines) => fs.writeFileSync(path.join(__dirname, f), lines.join('\n') + '\n', 'utf8');
w('blind-recheck.txt', blind); w('cloze-recheck.txt', cloze);
w('blind.key-recheck.tsv', bKey); w('cloze.key-recheck.tsv', cKey);

console.log(`${changed.length} פריטים השתנו מאז ${REF} ונדרשת להם מדידה מחדש:`);
changed.forEach((it, n) => console.log(`  ${n + 1}. ${it.src}`));
console.log('\nנכתבו: blind-recheck.txt · cloze-recheck.txt · שני המפתחות');
