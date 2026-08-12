/* מאחד את שלושת המנקדים העיוורים ומכריע.
 *
 * ההיגיון: שלושה מנקדים שלא ראו זה את זה. הסכמה של שלושה על אותו ניקוד היא עדות
 * חזקה בהרבה מניקוד יחיד — ובעיקר, היא **הוכחה שהניקוד נגזר מכלל דקדוקי ולא הועתק
 * ממקור**, כי שלושה מקורות עצמאיים לא מגיעים לאותה טעות מקרית.
 *
 * שערים מכניים שרצים על כל תוצאה, ואינם דורשים שום מקור חיצוני:
 *  1. **זהות אותיות.** הסרת הניקוד חייבת להחזיר את המילה המקורית תו-בתו. זה השער
 *     היחיד שבאמת חשוב: מנקד שהוסיף או שינה אות שינה את המילה.
 *  2. יש ניקוד בפועל (לא הוחזרה המילה כמות שהיא).
 *  3. אין תו ניקוד אחרי רווח או בתחילת מילה.
 */
const fs = require('fs');
const DIR = 'niqqud/';
const NIQ = /[֑-ׇ]/g;
const bare = s => s.normalize('NFKC').replace(NIQ, '').trim();

/* ⛔ נרמול NFC לפני **כל** השוואה. בלעדיו שני מנקדים שכתבו את אותו ניקוד בדיוק
   נספרו כחלוקים: `הַמַּחֲלוֹקֶת` נכתב אצל אחד דגש-אחר-כך-פתח ואצל השני
   פתח-אחר-כך-דגש (05BC מול 05B7). על המסך זה **אותו דבר בדיוק**, וכמחרוזת זה
   שונה. נמצא על `סלע המחלוקת` ו-`קירח מכאן ומכאן`, ושתיהן דווחו כמחלוקת שווא. */
const nfc = s => String(s).normalize('NFC').trim();
const load = f => fs.existsSync(DIR + f)
  ? new Map(fs.readFileSync(DIR + f, 'utf8').split(/\r?\n/).filter(Boolean)
      .map(l => l.split('\t')).map(c => [nfc(c[0]), { p: nfc(c[1] || ''), c: (c[2] || '').trim() }]))
  : new Map();

const A = load('out-A.tsv'), B = load('out-B.tsv'), C = load('out-C.tsv');
const terms = fs.readFileSync(DIR + 'to-point.tsv', 'utf8').split(/\r?\n/)
  .filter(Boolean).map(l => l.split('\t')[0].trim());

function gate(term, pointed) {
  if (!pointed) return 'ריק';
  if (bare(pointed) !== bare(term)) return 'האותיות שונו';
  if (!NIQ.test(pointed)) return 'אין ניקוד';
  if (/(^|\s)[֑-ׇ]/.test(pointed)) return 'ניקוד בלי אות';
  return null;
}

const agreed = [], split = [], rejected = [];
for (const t of terms) {
  const cands = [['A', A.get(t)], ['B', B.get(t)], ['C', C.get(t)]]
    .filter(([, v]) => v && v.p);
  const ok = [], bad = [];
  cands.forEach(([who, v]) => {
    const why = gate(t, v.p);
    (why ? bad : ok).push([who, v.p, v.c, why]);
  });
  bad.forEach(([who, p, , why]) => rejected.push([t, who, p, why]));
  if (!ok.length) { split.push([t, 'אין אף הצעה תקינה', '']); continue; }
  const tally = {};
  ok.forEach(([, p]) => tally[p] = (tally[p] || 0) + 1);
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const doubt = ok.some(([, , c]) => c === '?');
  if (best[0][1] >= 2) agreed.push([t, best[0][0], `${best[0][1]}/${ok.length}`, doubt ? 'סומן ספק' : '']);
  else split.push([t, ok.map(([w, p]) => `${w}: ${p}`).join(' · '), doubt ? 'סומן ספק' : '']);
}

fs.writeFileSync(DIR + 'agreed.tsv',
  'מילה\tניקוד\tהסכמה\tהערה\n' + agreed.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync(DIR + 'split.tsv',
  'מילה\tההצעות\tהערה\n' + split.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync(DIR + 'rejected.tsv',
  'מילה\tמנקד\tההצעה\tהסיבה\n' + rejected.map(r => r.join('\t')).join('\n') + '\n', 'utf8');

console.log('='.repeat(58));
console.log(`${terms.length} מילים · שלושה מנקדים עיוורים`);
console.log(`  הסכמה של 2 ומעלה:  ${agreed.length}`);
console.log(`  מחלוקת מלאה:       ${split.length}  → הכרעה ידנית`);
console.log(`  נדחו בשער:         ${rejected.length}  (הצעות, לא מילים)`);
console.log('='.repeat(58));
const unan = agreed.filter(r => /^3\//.test(r[2])).length;
console.log(`פה אחד (3/3): ${unan} · ברוב (2/3): ${agreed.length - unan}`);
if (rejected.length) rejected.slice(0, 8).forEach(r => console.log(`  ⛔ ${r[0]} · ${r[1]}: ${r[3]}`));
