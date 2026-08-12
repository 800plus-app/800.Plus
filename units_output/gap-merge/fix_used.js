/* `words-used.txt` נשאר על 2,015 בזמן שבמאגר 2,269. הוא הצובר של שער הכפילויות,
 * ולכן קובץ שלא עודכן פירושו שער חלש.
 *
 * ⚠ ולמה **לא** לייצר אותו מחדש מקובצי היחידות: הוא **על-קבוצה בכוונה**. `הסתופף`
 * יושב בו ואינו באף unit-N-words.tsv — הוא נחסם למרות שהצירוף `הסתופף בצילו` הוא
 * שנכנס. ייצור מחדש היה מוחק את החסימה הזאת ומאפשר למילה להיכנס. לכן: הוספה בלבד.
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/[־‐-―]/g, '-').replace(/\s+/g, ' ').trim();

const have = new Set(fs.readFileSync(REPO + 'words-used.txt', 'utf8').split('\n').map(norm).filter(Boolean));
const haveR = new Set(fs.readFileSync(REPO + 'roots-used.txt', 'utf8').split('\n').map(norm).filter(Boolean));
const inBank = [], rootsBank = [];
for (let u = 1; u <= 10; u++)
  fs.readFileSync(REPO + `unit-${u}-words.tsv`, 'utf8').split('\n').filter(x => x.trim()).forEach(l => {
    const p = l.split('\t'); if (p.length !== 3) return;
    inBank.push(norm(p[1]));
    norm(p[2]).split(',').forEach(r => { r = r.trim(); if (r) rootsBank.push(r); });
  });

const addW = [...new Set(inBank.filter(w => !have.has(w)))];
const addR = [...new Set(rootsBank.filter(r => !haveR.has(r)))];
const onlyInFile = [...have].filter(w => !inBank.includes(w));
console.log(`במאגר: ${inBank.length} · ב-words-used: ${have.size}`);
console.log(`חסרות בצובר: ${addW.length} · שורשים חסרים: ${addR.length}`);
console.log(`⚠ בצובר ואינן במאגר (חסימות מכוונות — נשמרות): ${onlyInFile.length} · ${onlyInFile.slice(0, 8).join(' · ')}`);

if (process.argv.includes('--write')) {
  fs.appendFileSync(REPO + 'words-used.txt', addW.join('\n') + '\n', 'utf8');
  fs.appendFileSync(REPO + 'roots-used.txt', addR.join('\n') + '\n', 'utf8');
  console.log(`\n✓ נוספו ${addW.length} מילים ו-${addR.length} שורשים לצוברים`);
} else console.log('\n(בדיקה בלבד — --write לכתיבה)');
