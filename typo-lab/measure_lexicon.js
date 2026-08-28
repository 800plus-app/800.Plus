'use strict';
/* מדידת רשימת הווטו · typo-lab/measure_lexicon.js
 *
 * ⛔ למה זה נדרש לפני מחיקה: `typo-lab/lib/lexicon.js:27` בורר **לפי סיומת**
 * (`{ dir: 'units_output', ext: /\.(md|tsv|txt)$/ }`), ולכן 118 קובצי ה-`.txt`
 * שמקורם ויקימילון **נכנסים לרשימת הווטו שנצרבת ל-`typo-lex.js` ונשלחת למוצר.**
 * ⭐ בדיקה «האם האפליקציה מזכירה את שם הקובץ» מחזירה 0 ועיוורת לחלוטין ל-glob.
 *
 * ⚠ וכיוון ההשפעה: רשימת ווטו **קטנה יותר = קבלה מתירנית יותר של שגיאות כתיב**.
 * ⛔ התכווצות מהותית היא שינוי התנהגות במוצר · עוצרים ומדווחים, לא סוגרים.
 *
 * ⚠ הכלי **קורא בלבד** ואינו כותב את `typo-lex.js` · מדידה שכותבת את הנכס
 * שהיא מודדת הורסת את הבסיס להשוואה.
 *
 *   node typo-lab/measure_lexicon.js <קובץ-פלט.json>
 */
const fs = require('fs');
const { buildLexicon, fileList } = require('./lib/lexicon.js');

const out = process.argv[2];
if (!out) { console.error('שימוש: node typo-lab/measure_lexicon.js <קובץ-פלט.json>'); process.exit(2); }

const files = fileList();
const lex = buildLexicon();

/* המבנה משתנה בין גרסאות · סופרים גנרית ולא מניחים שדות */
const sizeOf = v => v instanceof Set ? v.size : (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0));
const parts = {};
let total = 0;
for (const [k, v] of Object.entries(lex)) { const n = sizeOf(v); if (n) { parts[k] = n; total += n; } }

const dump = {};
for (const [k, v] of Object.entries(lex)) {
  if (v instanceof Set) dump[k] = [...v].sort();
  else if (Array.isArray(v)) dump[k] = [...v].sort();
}

fs.writeFileSync(out, JSON.stringify({ files: files.length, parts, total, dump }, null, 0), 'utf8');
console.log('קבצים שנסרקו : ' + files.length);
Object.entries(parts).forEach(([k, n]) => console.log('  ' + k.padEnd(14) + n.toLocaleString()));
console.log('סה"כ טיפוסים : ' + total.toLocaleString());
