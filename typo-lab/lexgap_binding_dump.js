'use strict';
/* מי באמת כובל · typo-lab/lexgap_binding_dump.js
 * מוציא את השליליות הכובלות ביותר של מחלקת zngry, כדי לשאול עליהן את השאלה
 * הלקסיקלית. אם צפיפות המילים האמיתיות שם אינה **גבוהה בהרבה** מהכללית, אז
 * הרחבת לקסיקון אינה יכולה לקנות את המדרגה שהעקומה מראה ב-2%. */
const fs=require('fs'),path=require('path');
const F=require('./fit.js');
const {slackOf}=require('./lexgap_counterfactual.js');
const {rngFor,randInt}=require('./lib/rng.js');
const OUT=path.join(__dirname,'out');
const recs=F.loadCache('en-word'), z=F.loadZngry();
const S=F.pack(recs.concat(z)), sp=F.splits(S);
const shipped=F.fromAppParams(F.shippedParams('en-word'));
const m=F.clampModel(S,sp.all,F.fitStudent(S,
  sp.train.concat(sp.holdout,sp.cross).filter(i=>S.isAcc[i]!==1).concat(sp.zngry.filter(i=>S.isAcc[i]!==1)),
  sp.trainPos,{cuts:[2],seedW:shipped.regimes.map(g=>g.W)}));
const coef=F.modelCoef(m);
const zNeg=sp.zngry.filter(i=>S.isAcc[i]!==1);
const ranked=zNeg.map(i=>({i,s:slackOf(S,i,coef)})).filter(x=>isFinite(x.s)).sort((a,b)=>a.s-b.s);
const nMain=recs.length;
const strOf=i=>{ const r=(i>=nMain)?z[i-nMain]:recs[i]; return r&&r.typedKey; };
const top=ranked.slice(0,2913).map(x=>strOf(x.i)).filter(Boolean);
const uniqTop=Array.from(new Set(top));
console.log('top-2% binding records:',top.length,'· unique strings:',uniqTop.length);
console.log('slack range: ['+ranked[0].s.toFixed(4)+' , '+ranked[2912].s.toFixed(4)+']');
const rnd=rngFor('lexgap','binding','en'); const take=new Set();
while(take.size<Math.min(400,uniqTop.length)) take.add(uniqTop[randInt(rnd,uniqTop.length)]);
const arr=Array.from(take).sort();
for(let i=0;i*200<arr.length;i++) fs.writeFileSync(path.join(OUT,'judge','binding-'+String(i).padStart(2,'0')+'.txt'),arr.slice(i*200,(i+1)*200).join('\n'));
fs.writeFileSync(path.join(OUT,'lexgap-binding-sample.json'),JSON.stringify({topRecords:top.length,uniqueTop:uniqTop.length,n:arr.length,words:arr}));
console.log('wrote',Math.ceil(arr.length/200),'batches ·',arr.length,'strings');
console.log(arr.slice(0,30).join(' '));
