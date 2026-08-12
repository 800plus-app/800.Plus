/* מזריק את הסיבות המשוחזרות ל-rejected.tsv, ומוודא ששום שורה לא נשארת בלי סיבה. */
const fs = require('fs');
const R = require('./reasons.js');
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ,'').replace(/["'׳״]/g,'')
  .replace(/[־‐-―]/g,'-').replace(/\s*\/\s*/g,' / ').replace(/\s+/g,' ').trim();
const rows = fs.readFileSync('rejected.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const acc = new Set(fs.readFileSync('accepted.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>norm(l.split('\t')[0])));
/* סיבה מהסבב השני = כבר בקובץ ומתחילה בהסבר, לא בפירוש */
const p2 = new Set();
['out-p2a','out-p2b'].forEach(f=>{
  const p='packets/'+f+'.tsv';
  if (fs.existsSync(p)) fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).forEach(l=>{
    const c=l.split('\t'); if((c[1]||'').trim()==='נפסל') p2.add(norm(c[0]));
  });
});
let filled=0, missing=[];
const out = rows.map(([term, why]) => {
  const k = norm(term);
  if (p2.has(k)) return [term, why];                 // נימוק אמיתי מהסבב השני
  const r = R[k];
  if (r) { filled++; return [term, r]; }
  missing.push(term);
  return [term, why];
});
console.log(`שורות: ${out.length} · הושלמו סיבות: ${filled} · מהסבב השני: ${p2.size}`);
if (missing.length) { console.log(`⛔ בלי סיבה: ${missing.length}`); missing.forEach(m=>console.log('   '+m)); }
else console.log('✓ לכל 101 יש סיבה');
fs.writeFileSync('rejected.tsv', out.map(r=>r.join('\t')).join('\n')+'\n','utf8');
