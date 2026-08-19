'use strict';
/* ⛔ הצד השני · SEG_VETO ו-GLOSS_ALT במצב אורח · typo-lab/preview_veto_gloss.js
 *
 *   node --max-old-space-size=6144 typo-lab/preview_veto_gloss.js [--selftest]
 *
 * ‏`buildGlossIndex` (app.js:517) בונה **שניהם באותה לולאה** מ-`BANK`:
 *   ‏`SEG_VETO`  · "המקטע הזה תפוס בידי ערך אחר" → **חייב להיות גלובלי**
 *   ‏`GLOSS_ALT` · "שני ערכים חולקים פירוש" → **חייב להישאר צמוד ל-BANK**
 * ולכן התיקון אינו "לבנות מהכול" אלא **לפצל את הלולאה**. הקובץ הזה מודד את שני
 * הצדדים: כמה בטיחות מפסידים כשה-SEG_VETO מצטמצם, וכמה נזק היה נגרם אילו
 * ‏GLOSS_ALT היה מורחב יחד איתו.
 */
const fs=require('fs'), path=require('path');
const {getCtx}=require('./lib/ctx.js');
const {buildVeto}=require('./lib/veto.js');
const {acceptedSegs}=require('./lib/keys.js');
const {makeChecker}=require('./lib/checker.js');
const {shippedParams}=require('./lex_gap.js');
const {vetoScoped,PREVIEW_UNIT}=require('./preview_veto.js');
const OUT=path.join(__dirname,'out');
const say=s=>process.stdout.write(s+'\n');
const HE='אבגדהוזחטיכלמנסעפצקרשת';                      // build_runtime_lexicon.js:81 · norm מקפל סופיות

function ballHe(k){
  const out=new Set(), n=k.length;
  for(let i=0;i<n;i++) for(const c of HE) if(c!==k[i]) out.add(k.slice(0,i)+c+k.slice(i+1));
  for(let i=0;i<=n;i++) for(const c of HE) out.add(k.slice(0,i)+c+k.slice(i));
  for(let i=0;i<n;i++) out.add(k.slice(0,i)+k.slice(i+1));
  for(let i=0;i+1<n;i++) if(k[i]!==k[i+1]) out.add(k.slice(0,i)+k[i+1]+k[i]+k.slice(i+2));
  out.delete(k); return out;
}

function main(){
  const ctx=getCtx('en');                                  // כרטיס אנגלי · הפירוש עברי
  const P=shippedParams();
  const full=buildVeto(ctx,'en');
  const prev=vetoScoped(ctx,'en',w=>String(w.unit)===PREVIEW_UNIT);
  const Pg=JSON.parse(fs.readFileSync(path.join(OUT,'typo-rules.json'),'utf8')).params.gloss;
  const ckF=makeChecker(Pg,ctx,full,'en'), ckP=makeChecker(Pg,ctx,prev.veto,'en');
  const cards=Array.from(ctx.BANK).filter(w=>String(w.unit)===PREVIEW_UNIT);
  const u1=new Set(cards.map(w=>ctx.K(w.term)));
  const outsideOwner=s=>{const o=full.segKeys.get(s); if(!o) return null;
    const x=Array.from(o).filter(y=>!u1.has(y)); return x.length?x:null;};

  let gen=0, delta=0, deltaOther=0; const ex=[];
  for(const card of cards){
    const segs=Array.from(acceptedSegs(card,ctx)).filter(Boolean);
    const own=new Set(segs); const seen=new Set();
    for(const k of segs){
      if(k.length<2) continue;
      for(const s of ballHe(k)){
        if(s.length<2||own.has(s)||seen.has(s)) continue; seen.add(s); gen++;
        if(ctx.meaningMatch(s,card.meaning)) continue;
        if(!ckP.acceptGloss(s,card).ok) continue;
        if(ckF.acceptGloss(s,card).ok) continue;
        delta++;
        const o=outsideOwner(s);
        if(o){ deltaOther++; if(ex.length<12) ex.push({typed:s,seg:k,term:card.term,owners:o.slice(0,3)}); }
      }
    }
  }
  say(`\n=== הצד השני · הלומד מקליד את הפירוש (עברית) על כרטיס אנגלי ===`);
  say(`  SEG_VETO · מלא ${full.segKeys.size} → אורח ${prev.veto.segKeys.size}`);
  say(`  מחרוזות שנמנו · ${gen}`);
  say(`  ⛔ מתקבלות אצל אורח ונדחות אצל משתמש מלא · ${delta}`);
  say(`  ⛔ מהן · פירוש קביל של ערך מחוץ ליחידה 1 · ${deltaOther}`);
  for(const e of ex) say(`     ${e.typed.padEnd(14)} על ${String(e.term).padEnd(14)} · הפירוש של ${e.owners.join(', ')}`);

  /* ===== הסיכון בתיקון · GLOSS_ALT אסור להרחיב ===== */
  const galtNow=new Map(), galtAll=new Map();
  const add=(m,card)=>{for(const s of Array.from(ctx.meaningSegs(card.meaning))){let a=m.get(s);if(!a){a=[];m.set(s,a);}if(!a.includes(card.term))a.push(card.term);}};
  for(const c of cards) add(galtNow,c);
  for(const c of Array.from(ctx.BANK)) add(galtAll,c);
  let extra=0; const exG=[];
  for(const c of cards) for(const s of Array.from(ctx.meaningSegs(c.meaning))){
    const now=(galtNow.get(s)||[]).length, all=(galtAll.get(s)||[]).length;
    if(all>1&&now<2){ extra++; if(exG.length<6) exG.push(`${c.term} ← ${(galtAll.get(s)||[]).filter(t=>t!==c.term).slice(0,2).join('/')} (על "${s}")`); }
  }
  say(`\n⚠ הסיכון בתיקון · אילו GLOSS_ALT היה מורחב יחד עם SEG_VETO:`);
  say(`  ${extra} פטורי-נרדפות **חדשים** לכרטיסי יחידה 1 · כלומר קבלה **רחבה יותר** לאורח, ההפך מהמטרה`);
  for(const g of exG) say(`     ${g}`);
  say(`  ⇒ התיקון חייב לפצל את הלולאה · SEG_VETO גלובלי, GLOSS_ALT צמוד ל-BANK`);
  fs.writeFileSync(path.join(OUT,'preview-veto-gloss.json'),JSON.stringify({gen,delta,deltaOther,examples:ex,glossAltRisk:extra},null,1));
  say('\nנכתב · out/preview-veto-gloss.json');
}
if(require.main===module) main();
module.exports={ballHe,main};
