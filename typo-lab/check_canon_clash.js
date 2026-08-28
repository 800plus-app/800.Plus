'use strict';
/* בדיקת התנגשות **בצורה המקנוננת** · typo-lab/check_canon_clash.js
 *
 * ⛔ למה הכלי הזה קיים: בהחלה הקודמת בדקתי התנגשות על **מחרוזות גולמיות**.
 * `magnitude` קיבל «עוצמה», שאינה שייכת לאף ערך אחר — ⭐ **אבל שכבת הנרדפות
 * מקנוננת אותה ל-«כוח»**, שכבר בבעלות `energy` · `force` · `strength`.
 * שלושה זוגות נשברו, ו-`tests/71` נפל. **בדיקה שאינה עוברת דרך `typoCanon`
 * עיוורת בדיוק לסוג ההתנגשות שהשכבה הזאת מייצרת.**
 *
 * ⚠ הוא **קורא בלבד** · אינו כותב לאף קובץ, בניגוד ל-`gate_synonyms.js`.
 *
 * שימוש:  node typo-lab/check_canon_clash.js <מילה> <פירוש-מוצע>
 *         node typo-lab/check_canon_clash.js --file <tsv>   (מילה\tפירוש)
 */
const fs = require('fs');
const path = require('path');
const T = path.join(__dirname, '..', 'tests', '71-typo-tolerance.test.js');

const src = fs.readFileSync(T, 'utf8');
const start = src.indexOf('function ctxFor');
const end = src.indexOf('const HE = ctxFor');
const head = src.slice(0, end).replace(/^const \{ test, describe \}.*$/m, 'const { test, describe } = { test(){}, describe(){} };');
const Module = require('module');
const m = new Module(T, null);
m.filename = T; m.paths = Module._nodeModulePaths(path.dirname(T));
m._compile(head + '\nmodule.exports = { ctxFor };\n', T);
const { ctxFor } = m.exports;

/* מפה: צורה מקנוננת → הערכים שמחזיקים אותה · בשתי השפות */
function canonIndex() {
  const idx = new Map();
  for (const lang of ['he', 'en']) {
    const c = ctxFor(lang);
    for (const w of Array.from(c.BANK))
      for (const s of Array.from(c.meaningSegs(w.meaning))) {
        const k = c.typoCanon(s);
        if (!idx.has(k)) idx.set(k, new Set());
        idx.get(k).add(lang + ':' + c.K(w.term));
      }
  }
  return idx;
}
const EN_CTX = ctxFor('en');
const IDX = canonIndex();

/* הפירוש שבמאגר היום · הבסיס להפרש */
const CUR = new Map();
for (const w of Array.from(EN_CTX.BANK)) CUR.set(w.term, w.meaning);

/* ⭐ רק **המובנים שנוספים** נבדקים.
 * ⚠ הגרסה הראשונה בדקה את הפירוש כולו, ולכן דיווחה על `widespread` «נפוצ»
 * שכבר יושב במאגר ועובר את כל השערים. **חפיפה קיימת אינה ממצא** — היא כבר
 * התקבלה. מה שמסוכן הוא מחרוזת חדשה שנכנסת למחלקה קנונית תפוסה. */
function clashesFor(term, gloss) {
  const out = [];
  const own = 'en:' + EN_CTX.K(term);
  const before = new Set(Array.from(EN_CTX.meaningSegs(CUR.get(term) || '')).map(s => EN_CTX.typoCanon(s)));
  for (const s of Array.from(EN_CTX.meaningSegs(gloss))) {
    const k = EN_CTX.typoCanon(s);
    if (before.has(k)) continue;                 /* קיים כבר · לא הפרש */
    const holders = [...(IDX.get(k) || [])].filter(x => x !== own);
    if (holders.length) out.push({ seg: s, canon: k, holders });
  }
  return out;
}

const args = process.argv.slice(2);
let jobs = [];
if (args[0] === '--file') jobs = fs.readFileSync(args[1], 'utf8').split(/\r?\n/).filter(Boolean)
  .map(l => l.split('\t')).filter(c => c.length >= 2);
else if (args.length >= 2) jobs = [[args[0], args.slice(1).join(' ')]];
else { console.error('שימוש: node typo-lab/check_canon_clash.js <מילה> <פירוש>  |  --file <tsv>'); process.exit(2); }

let bad = 0;
for (const [term, gloss] of jobs) {
  const cl = clashesFor(term, gloss);
  if (!cl.length) { console.log('✓ ' + term.padEnd(18) + 'אין התנגשות מקנוננת'); continue; }
  bad++;
  for (const c of cl)
    console.log('⛔ ' + term.padEnd(18) + '«' + c.seg + '» → מקנוננת ל-«' + c.canon + '» · בבעלות ' + c.holders.slice(0, 4).join(' · '));
}
console.log('\n' + (bad ? '⛔ ' + bad + ' מתוך ' + jobs.length + ' מתנגשות' : '⭐ אפס התנגשויות · ' + jobs.length + ' נבדקו'));
process.exit(bad ? 1 : 0);
