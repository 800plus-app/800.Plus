/* מצליב את דיווחי הפותרים העצמאיים לרשימת עבודה אחת.
 *
 *   TAG=-full node sentence-completion/consolidate.js
 *
 * למה הצלבה ולא איחוד
 * -------------------
 * פותר בודד שמסמן "אנגלית לא טבעית" הוא דעה. **שני** פותרים שסימנו את אותו פריט
 * בלי לדעת זה על זה הם עדות. האיחוד מנפח את הרשימה ומצניע את הסימן, ההצלבה
 * מייצרת סדר עדיפויות אמיתי.
 *
 * המספרים כאן הועתקו ידנית מדיווחי הסוכנים, ולכן הם **קלט ולא מדידה**. הם
 * מסומנים כך במפורש כדי שלא ייקראו כפלט של סקריפט.
 */
const fs = require('fs'), path = require('path');
const TAG = process.env.TAG || '';

/* ---- קלט ידני מדיווחי שני פותרי רב-הברירה (מספרי שאלה ב-blind-full.txt) ---- */
const MC = {
  run1: {
    guess: [10, 28, 45, 47, 52, 53, 73, 86, 102, 110, 111, 122, 127, 128, 141, 161, 166, 169, 177, 179, 189, 193, 194, 202],
    unnatural: [1, 7, 20, 68, 70, 74, 83, 86, 87, 93, 95, 98, 101, 129, 143, 155, 158, 165, 179, 181, 185, 188, 189, 193, 196],
  },
  run2: {
    guess: [1, 28, 52, 53, 64, 86, 102, 111, 120, 122, 128, 141, 161, 166, 169, 175, 179, 189, 193, 202],
    unnatural: [13, 20, 23, 28, 70, 74, 83, 86, 87, 93, 98, 105, 129, 136, 155, 158, 179, 185, 190, 193, 196, 200],
  },
};
/* ---- קלט ידני משלושת פותרי הקלוז: פריטים שהצהירו עליהם כלא-מוכרעים ---- */
const CLOZE_UNSURE = [
  [16, 23, 39, 68, 87, 101, 103, 104, 122, 133, 152, 165, 177, 178, 180, 183, 185, 200, 204,
    1, 20, 43, 53, 59, 66, 78, 97, 155, 174, 179, 193],
  [101, 104, 177, 178, 165, 183, 164, 152, 174,
    1, 10, 15, 23, 30, 39, 43, 53, 59, 66, 87, 133, 157, 180, 187, 200, 204, 27, 64, 110, 124, 146, 155, 179, 201],
  [1, 23, 39, 43, 59, 64, 86, 97, 101, 104, 133, 152, 155, 165, 177, 179, 180, 190, 193, 200, 204,
    16, 17, 27, 47, 53, 66, 80, 87, 122, 124, 132, 178, 185, 201],
];

/* ---- קלט ידני מהביקורת האדוורסרית (קורא עוין אחד, 204 פריטים) ---- */
const ADV = {
  fail: [1, 5, 8, 9, 10, 11, 18, 24, 28, 32, 36, 38, 41, 45, 49, 52, 53, 65, 70, 71, 73, 77, 86, 90,
    100, 101, 105, 110, 113, 115, 116, 120, 128, 130, 136, 141, 157, 159, 169, 177, 179, 185, 189, 192, 193, 202, 204],
  weak: [2, 3, 4, 6, 7, 14, 19, 23, 51, 56, 64, 69, 74, 76, 79, 82, 87, 88, 94, 95, 97, 98, 104, 119,
    123, 125, 127, 135, 143, 146, 153, 161, 162, 174, 175, 184, 197],
};

const key = new Map();
fs.readFileSync(path.join(__dirname, `blind.key${TAG}.tsv`), 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).forEach(l => {
    const c = l.split('\t'); key.set(+c[0], `${c[1]}#${c[2]}`);
  });

const count = lists => {
  const m = new Map();
  lists.forEach(L => new Set(L).forEach(q => m.set(q, (m.get(q) || 0) + 1)));
  return m;
};
const unnatural = count([MC.run1.unnatural, MC.run2.unnatural]);
const guess = count([MC.run1.guess, MC.run2.guess]);
const unsure = count(CLOZE_UNSURE);

/* ציון עדיפות: כמה קוראים **עצמאיים** סימנו את הפריט, בכל הזוויות.
   ⚠ הביקורת האדוורסרית מקבלת משקל 3 ל-FAIL ו-1 ל-WEAK, ולא יותר: היא קורא
   **אחד**, והיא בסתירה חלקית לנתונים. היא טוענת ש-47 פריטים נושאים שתי תשובות
   נכונות, ואילו שני פותרים עצמאיים הסכימו עם המפתח ב-202 מ-204 ופיצלו בשניים
   בלבד. אם שתי אפשרויות היו נכונות באמת, היינו רואים פיצול. לכן FAIL בודד אינו
   פסילה, וחפיפה בין קוראים כן. */
const advF = new Set(ADV.fail), advW = new Set(ADV.weak);
const score = new Map();
const add = (q, w) => score.set(q, (score.get(q) || 0) + w);
for (const [q, c] of unnatural) add(q, c * 3);   // אנגלית לא טבעית — החמור
for (const [q, c] of guess) add(q, c * 2);       // שתי אפשרויות מגננות
for (const [q, c] of unsure) add(q, c);          // הקשר לא מכריע
advF.forEach(q => add(q, 3));
advW.forEach(q => add(q, 1));

const rows = [...score.entries()].map(([q, s]) => ({
  q, id: key.get(q) || '?', s,
  un: unnatural.get(q) || 0, gu: guess.get(q) || 0, us: unsure.get(q) || 0,
  adv: advF.has(q) ? 'FAIL' : (advW.has(q) ? 'WEAK' : ''),
})).sort((a, b) => b.s - a.s || a.q - b.q);

const both = k => rows.filter(r => r[k] === 2);
console.log('='.repeat(72));
console.log('הצלבת דיווחי הפותרים · 2 פותרי רב-ברירה · 3 פותרי קלוז');
console.log('='.repeat(72));
console.log(`אנגלית לא טבעית · **שני** הפותרים: ${both('un').length} פריטים`);
console.log('  ' + both('un').map(r => `${r.q}(${r.id})`).join(' · '));
console.log(`\nשתי אפשרויות מגננות · **שני** הפותרים: ${both('gu').length} פריטים`);
console.log('  ' + both('gu').map(r => `${r.q}(${r.id})`).join(' · '));
console.log(`\nהקשר לא מכריע · כל **שלושת** פותרי הקלוז: ${rows.filter(r => r.us === 3).length} פריטים`);
console.log('  ' + rows.filter(r => r.us === 3).map(r => `${r.q}(${r.id})`).join(' · '));

console.log('\n' + '='.repeat(72));
console.log('20 הפריטים בעדיפות הגבוהה ביותר לתיקון');
console.log('ציון = לא-טבעי×3 + ניחוש×2 + לא-מוכרע×1, לפי מספר הקוראים שסימנו');
console.log('='.repeat(72));
console.log('  #   פריט         ציון  לא-טבעי  ניחוש  לא-מוכרע  אדוורסרי');
rows.slice(0, 20).forEach(r => console.log(
  `  ${String(r.q).padEnd(4)}${r.id.padEnd(13)}${String(r.s).padEnd(6)}${String(r.un + '/2').padEnd(9)}${String(r.gu + '/2').padEnd(7)}${String(r.us + '/3').padEnd(10)}${r.adv}`));

/* ⭐ הקבוצה שבאמת מוכרעת: פריט שסומן בידי **כל** הזוויות, כלומר גם קוראי
   רב-הברירה, גם פותרי הקלוז, וגם הביקורת. שם אין ויכוח. */
const consensus = rows.filter(r => r.un === 2 && r.gu >= 1 && r.adv === 'FAIL');
console.log('\n' + '='.repeat(72));
console.log(`⛔ קונצנזוס מלא — שני קוראי רב-ברירה + ביקורת אדוורסרית: ${consensus.length} פריטים`);
console.log('   אלה לתיקון ראשון, בלי ויכוח.');
consensus.forEach(r => console.log(`   ${r.q} · ${r.id}`));
console.log('='.repeat(72));

const out = path.join(__dirname, 'runs', 'consolidated.tsv');
fs.writeFileSync(out, 'q\titem\tscore\tunnatural\tguess\tunsure\tadversarial\n' +
  rows.map(r => [r.q, r.id, r.s, r.un, r.gu, r.us, r.adv].join('\t')).join('\n'), 'utf8');
console.log(`\nנכתב: ${path.relative(process.cwd(), out)} · ${rows.length} פריטים שסומנו לפחות פעם אחת`);
console.log(`⚠ ${204 - rows.length} פריטים לא סומנו בידי אף קורא.`);
