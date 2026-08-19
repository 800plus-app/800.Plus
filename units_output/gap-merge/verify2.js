/* הכרעה חד-משמעית: האם 101 הנפסלות נכנסו?
 *
 * ⚠ הבדיקה הראשונה שלי דיווחה "3 נפסלות במאגר" וזה היה **שקר של הבדיקה**: היא
 * מקפלת מקף לרווח, ולכן `בֶּן-דְּמוּתוֹ` שנפסלה התאימה ל-`בן דמותו` ש**כבר היה**
 * במאגר לפני התוספת. הדרך היחידה להכריע היא להשוות מול המאגר כפי שהיה ב-1f10f6a
 * ולראות מה נוסף בפועל.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const CWD = 'C:/Users/03hag/Claude projects/800+';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/[־‐-―]/g, '-').replace(/\s+/g, ' ').trim();
const ident = s => norm(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const words = txt => txt.split('\n').filter(x => x.trim())
  .map(l => l.split('\t')).filter(p => p.length === 3).map(p => norm(p[1]));

const before = new Set(), after = new Map();
for (let u = 1; u <= 10; u++) {
  words(execSync(`git show 1f10f6a:units_output/unit-${u}-words.tsv`,
    { cwd: CWD, encoding: 'utf8', maxBuffer: 1 << 24 })).forEach(w => before.add(w));
  words(fs.readFileSync(REPO + `unit-${u}-words.tsv`, 'utf8')).forEach(w => after.set(w, u));
}
const added = [...after.keys()].filter(w => !before.has(w));
console.log('='.repeat(64));
console.log(`לפני: ${before.size} · אחרי: ${after.size} · נוספו בפועל: ${added.length}`);

const rej = fs.readFileSync('rejected.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')[0]);
const acc = fs.readFileSync('accepted.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')[0]);
const addedSet = new Set(added);

const rejIn = rej.filter(w => addedSet.has(norm(w)));
const accOut = acc.filter(w => !addedSet.has(norm(w)));
console.log('='.repeat(64));
console.log(`⛔ מ-101 הנפסלות, נוספו למאגר: ${rejIn.length}`);
rejIn.forEach(w => console.log('   ' + w));
console.log(`⛔ מ-196 שאושרו, לא נוספו: ${accOut.length}`);
accOut.forEach(w => console.log('   ' + w));
console.log('='.repeat(64));
console.log(rejIn.length === 0 && accOut.length === 0 && added.length === 196
  ? '✓ בדיוק 196 נוספו · אף אחת מ-101 הנפסלות לא נכנסה'
  : '⛔ אי-התאמה');

/* ובנפרד: הפער בין gloss-status לקובצי היחידות */
const st = fs.readFileSync(REPO + 'gloss-phase/gloss-status.tsv', 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split('\t'));
console.log(`\ngloss-status: ${st.length} שורות`);
const stW = st.map(c => norm(c[3] || ''));
const notInBank = stW.filter(w => !after.has(w));
const notInStatus = [...after.keys()].filter(w => !stW.includes(w));
console.log(`⚠ ב-gloss-status ולא בקובצי היחידות: ${notInBank.length}`);
notInBank.forEach(w => console.log(`   "${w}"`));
console.log(`⚠ בקובצי היחידות ולא ב-gloss-status: ${notInStatus.length}`);
notInStatus.forEach(w => console.log(`   "${w}"`));
