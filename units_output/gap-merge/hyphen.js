/* ⛔ באג שהשער תפס, והוא לא שלי לבד.
 *
 * `בֶּן-דְּמוּתוֹ` ו-`בן דמותו` הם אותו ערך, אבל אחד כתוב במקף והשני ברווח. הנרמול
 * ב-`check_dup.py` וב-`check_all.py` ממיר `־` ל-`-` **ומשאיר אותו**, ולכן שתי
 * הצורות אינן נחשבות זהות. גם `בַּר-מִינָן` מול `בר מינן`.
 *
 * כלומר: שער הכפילויות של הפרויקט **אינו תופס כפילות שמוסתרת במקף**. כאן נמדד
 * כמה מקרים כאלה יש ב-297 המועמדות, וכמה כבר קיימים בתוך המאגר עצמו.
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const NIQ = /[֑-ׇ]/g;
/* הנרמול הקיים: מקף נשמר */
const normOld = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/[־‐-―]/g, '-').replace(/\s+/g, ' ').trim();
/* הנרמול המתוקן: מקף = רווח */
const normNew = s => normOld(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

const bank = [];
for (let u = 1; u <= 10; u++)
  fs.readFileSync(REPO + `unit-${u}-words.tsv`, 'utf8').split('\n').filter(x => x.trim())
    .forEach(l => { const p = l.split('\t'); if (p.length === 3) bank.push({ u, w: p[1].trim() }); });

/* א · כפילויות מוסתרות-מקף בתוך המאגר עצמו */
const byNew = new Map();
bank.forEach(b => {
  const k = normNew(b.w);
  if (!byNew.has(k)) byNew.set(k, []);
  byNew.get(k).push(b);
});
const inBank = [...byNew.entries()].filter(([, v]) => v.length > 1);
console.log(`המאגר: ${bank.length} ערכים`);
console.log(`⛔ כפילויות מוסתרות-מקף **בתוך המאגר**: ${inBank.length}`);
inBank.forEach(([k, v]) => console.log(`   ${k} ← ${v.map(x => `"${x.w}" (י${x.u})`).join(' + ')}`));

/* ב · מועמדות שהן בעצם כפילות */
const bankNew = new Set(bank.map(b => normNew(b.w)));
const bankOld = new Set(bank.map(b => normOld(b.w)));
const cand = fs.readFileSync('worth-299.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')[0]);
const hidden = cand.filter(t => !bankOld.has(normOld(t)) && bankNew.has(normNew(t)));
console.log(`\n⛔ מועמדות שהשער הישן היה מכניס והן כפילות: ${hidden.length}`);
hidden.forEach(t => {
  const m = bank.find(b => normNew(b.w) === normNew(t));
  console.log(`   ${t}  ↔  "${m.w}" (י${m.u})`);
});

/* ג · וגם כפילות בין המועמדות עצמן */
const seen = new Map(), self = [];
cand.forEach(t => {
  const k = normNew(t);
  if (seen.has(k)) self.push([seen.get(k), t]);
  seen.set(k, t);
});
console.log(`\nכפילות בין המועמדות עצמן: ${self.length}`);
self.forEach(p => console.log(`   ${p[0]} ↔ ${p[1]}`));
fs.writeFileSync('hidden-dupes.tsv', hidden.join('\n') + '\n', 'utf8');
