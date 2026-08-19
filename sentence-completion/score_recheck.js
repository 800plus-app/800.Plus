/* מנקד את המדידה החוזרת על הפריטים שתוקנו.
   מפתח: cloze.key-recheck.tsv  ·  q · src · words(מופרד ב-|) · blanks */
const fs=require('fs'),path=require('path');
const norm=s=>String(s).toLowerCase().trim().replace(/^(to|a|an|the)\s+/,'')
  .replace(/[^a-z]/g,'').replace(/^analyse$/,'analyze');
const key=new Map();
fs.readFileSync(path.join(__dirname,'cloze.key-recheck.tsv'),'utf8').split(/\r?\n/).slice(1)
  .filter(Boolean).forEach(l=>{const c=l.split('\t');key.set(+c[0],{src:c[1],gold:c[2].split('|').map(norm)})});
const runs=process.argv.slice(2).map(f=>{
  const m=new Map();
  fs.readFileSync(f,'utf8').split(/\r?\n/).forEach(l=>{
    const mm=l.match(/^\s*(\d+)\s*:\s*(.+)$/); if(!mm)return;
    m.set(+mm[1], mm[2].split(',').map(x=>x.split('+').map(norm)));
  }); return m;});
const N=runs.length;
let top1=0,top3=0,miss=0,rows=[];
for(const [q,k] of key){
  const tries=runs.map(r=>r.get(q)||[]);
  const first=tries.filter(t=>t[0]&&k.gold.every((g,i)=>t[0][i]===g)).length;
  const any=tries.filter(t=>t.some(att=>k.gold.every((g,i)=>att[i]===g))).length;
  const slot=k.gold.map((g,i)=>tries.filter(t=>t[0]&&t[0][i]===g).length);
  const v=first>=Math.ceil(N/2)?'TOP1':(any>0?'TOP3':'MISS');
  if(v==='TOP1')top1++;else if(v==='TOP3')top3++;else miss++;
  rows.push({q,src:k.src,gold:k.gold.join('+'),v,slot,
    got:tries.map(t=>(t[0]||[]).join('+')).join(' / ')});
}
console.log('='.repeat(70));
console.log(`מדידה חוזרת · ${key.size} פריטים שתוקנו · ${N} פותרים עצמאיים`);
console.log(`TOP1 ${top1} · TOP3 ${top3} · MISS ${miss}`);
console.log('='.repeat(70));
rows.forEach(r=>{
  const mark=r.v==='TOP1'?'✅':(r.v==='TOP3'?'⚠':'⛔');
  console.log(`${mark} ${String(r.q).padStart(2)} ${r.src.padEnd(11)} ${r.gold.padEnd(22)} חריצים:${r.slot.join('/')}  →  ${r.got}`);
});
console.log('\n⚠ MISS כאן אינו בהכרח פריט שבור: הוא אומר שההקשר אינו מכריע את');
console.log('   **המילה המדויקת**. פריט שנקלע במשמעות ונחלק על נרדף הוא פריט תקין');
console.log('   ברב-ברירה, שם המסיחים הם שמכריעים.');
