'use strict';
/* הרעיון של חגי, נמדד: הווטו גלובלי (3,946 מילים) אבל התרגול הוא פר יחידה.
 * כמה הקלדות נחסמות היום בגלל מילה שהלומד **לא מתרגל בכלל**?
 *
 * לכל מילה ביחידה נבחרת מייצרים את כל שגיאות-המרחק-1 (השמטה, הכפלה, החלפת
 * שכן במקלדת), ובודקים: האם היא נדחית, ואם כן — האם החוסם הוא מאותה יחידה. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = 'C:/Users/03hag/Claude projects/800+';
const { loadApp } = require(path.join(ROOT, 'tests/_harness/sandbox.js'));

const c = loadApp({ lang: 'en' });
const w = c.window || c; w.Buffer = Buffer;
try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'typo-lex.js'), 'utf8'), w); } catch (e) {}

const unitOf = new Map();
for (const card of c.BANK) unitOf.set(c.K(card.term), String(card.unit));

const NEI = { a:'qs', b:'vn', c:'xv', d:'sf', e:'wr', f:'dg', g:'fh', h:'gj', i:'uo', j:'hk',
              k:'jl', l:'k', m:'n', n:'bm', o:'ip', p:'o', q:'w', r:'et', s:'ad', t:'ry',
              u:'yi', v:'cb', x:'zc', y:'tu', z:'x' };

function typos(word) {
  const out = new Set(), s = word.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    out.add(s.slice(0, i) + s.slice(i + 1));                       // השמטה
    out.add(s.slice(0, i + 1) + s[i] + s.slice(i + 1));            // הכפלה
    for (const n of (NEI[s[i]] || '')) out.add(s.slice(0, i) + n + s.slice(i + 1));
  }
  out.delete(s);
  return [...out].filter(x => x.length > 2 && /^[a-z ]+$/.test(x));
}

const UNITS = process.argv[2] ? process.argv[2].split(',') : ['1'];
let tried = 0, accepted = 0, blockedSame = 0, blockedOther = 0, blockedNone = 0;
const examples = [];

for (const card of c.BANK) {
  if (!UNITS.includes(String(card.unit))) continue;
  const own = c.K(card.term);
  for (const t of typos(card.term)) {
    tried++;
    if (c.isCorrect(t, card.term)) { accepted++; continue; }
    /* מי "תופס" את המחרוזת הזאת — מילה אחרת במאגר? */
    const owner = c.TERM_VETO.get(c.K(t));
    if (!owner) { blockedNone++; continue; }
    const owners = [...owner].filter(o => o !== own);
    if (!owners.length) { blockedNone++; continue; }
    const sameUnit = owners.some(o => unitOf.get(o) === String(card.unit));
    if (sameUnit) blockedSame++;
    else {
      blockedOther++;
      if (examples.length < 999)
        examples.push({ term: card.term, unit: card.unit, typed: t,
                        by: owners.map(o => o + ' (יח\' ' + unitOf.get(o) + ')').join(', ') });
    }
  }
}

console.log('=== יחידות ' + UNITS.join(',') + ' · כל שגיאות מרחק-1 ===');
console.log('  נבדקו                       : ' + tried);
console.log('  ✅ מתקבלות היום              : ' + accepted);
console.log('  נדחות מסיבה שאינה ווטו      : ' + blockedNone);
console.log('  ⛔ ווטו · החוסם באותה יחידה  : ' + blockedSame);
console.log('  ⭐ ווטו · החוסם ביחידה אחרת  : ' + blockedOther + '   ← אלה שהרעיון שלך פותח');
console.log();
console.log('=== דוגמאות · נחסם בגלל מילה שהלומד לא מתרגל ===');
for (const e of examples)
  console.log('  יח\' ' + String(e.unit).padStart(2) + ' · ' + e.term.padEnd(14) + ' ← "' + e.typed.padEnd(14) + '" נחסם על ידי ' + e.by);
