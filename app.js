'use strict';
/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const esc = s => String(s==null?'':s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1900); }

/* ===== persistence (all local) ===== */
/* Storage is the app's only source of truth, so every write is defensive:
   a full disk / Safari private mode must never throw mid-round and lose a session. */
let storageWarned = false;
const LS = {
  get(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } },
  set(k,v){
    let payload;
    try{ payload = JSON.stringify(v); }catch(e){ return false; }
    try{ localStorage.setItem(k, payload); return true; }
    catch(e){
      // quota exceeded (or storage disabled) — shed the least valuable data and retry once
      if(shedStorage()){
        try{ localStorage.setItem(k, payload); return true; }catch(e2){}
      }
      if(!storageWarned){ storageWarned=true; try{ toast('אין מקום פנוי בדפדפן — חלק מההתקדמות לא נשמרה'); }catch(e3){} }
      return false;
    }
  },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
/* Sessions history is the only unbounded-ish store; drop the old tail first. */
function shedStorage(){
  let freed=false;
  for(const base of ['hw_stats','hw_stats_en']){
    try{
      const s=JSON.parse(localStorage.getItem(base)||'null');
      if(s && Array.isArray(s.sessions) && s.sessions.length>40){
        s.sessions=s.sessions.slice(-40);
        localStorage.setItem(base, JSON.stringify(s));
        if(stats && Array.isArray(stats.sessions) && KEY('hw_stats')===base) stats.sessions=s.sessions;
        freed=true;
      }
    }catch(e){}
  }
  return freed;
}
/* ---- language layer: Hebrew keeps the ORIGINAL keys so existing progress is never lost ---- */
let LANG = LS.get('hw_lang', null);            // 'he' | 'en' | null (not chosen yet)
if(LANG!=='he' && LANG!=='en') LANG=null;
const SUF = () => (LANG==='en' ? '_en' : '');  // Hebrew = legacy keys, English = *_en keys
const KEY = base => base + SUF();

let assoc={}, stats={words:{},sessions:[]}, deleted=new Set(), added=[], direction='m2w';

/* Anything read back from localStorage may be corrupt, hand-edited, or written by an
   older build. Coerce it into the exact shape the rest of the app assumes — otherwise a
   single bad value turns every counter into NaN and the damage is permanent. */
const ASSOC_MAX = 300;                                   // one association can't become a blob
const ASSOC_BUDGET = 300000;                             // …and the whole store can't either (~600KB)
const MAX_SESSIONS = 200;                                // hard ceiling on history growth
const isObj = v => v && typeof v==='object' && !Array.isArray(v);
const int0  = (v,max) => { const n=Math.trunc(Number(v)); if(!Number.isFinite(n)||n<0) return 0; return max==null?n:Math.min(n,max); };
function saneRec(r){
  if(!isObj(r)) r={};
  return { seen:int0(r.seen), first:int0(r.first), ever:int0(r.ever),
           wrong:int0(r.wrong), level:int0(r.level,3), last:int0(r.last) };
}
function loadLangState(){
  const a=LS.get(KEY('hw_assoc'), {});
  assoc={}; let aLen=2;
  if(isObj(a)) for(const k in a){
    if(typeof a[k]!=='string' || !a[k]) continue;
    const v=a[k].slice(0,ASSOC_MAX);
    aLen += k.length+v.length+6;
    if(aLen>ASSOC_BUDGET) break;                         // legacy oversized store: keep what fits
    assoc[k]=v;
  }

  const s=LS.get(KEY('hw_stats'), {});
  const words={}, srcW=isObj(s)&&isObj(s.words)?s.words:{};
  for(const k in srcW) words[k]=saneRec(srcW[k]);
  const srcS=isObj(s)&&Array.isArray(s.sessions)?s.sessions:[];
  stats={ words, sessions: srcS.filter(isObj).slice(-MAX_SESSIONS) };

  const d=LS.get(KEY('hw_deleted'), []);
  deleted=new Set(Array.isArray(d)?d.filter(x=>typeof x==='string'):[]);

  const ad=LS.get(KEY('hw_added'), []);
  added = Array.isArray(ad)
    ? ad.filter(p=>Array.isArray(p)&&typeof p[0]==='string'&&typeof p[1]==='string'&&p[0].trim()&&p[1].trim())
    : [];

  const dir=LS.get(KEY('hw_dir'), 'm2w');
  direction = (dir==='m2w'||dir==='w2m'||dir==='mixed') ? dir : 'm2w';
}
const DIRS_HE = [['m2w','פירוש → מילה'],['w2m','מילה → פירוש'],['mixed','מעורב']];
const DIRS_EN = [['m2w','עברית → אנגלית'],['w2m','אנגלית → עברית'],['mixed','מעורב']];
const DIRS = () => (LANG==='en' ? DIRS_EN : DIRS_HE);
function renderDirSegs(){
  ['#dirSegHome','#dirSegScope'].forEach(sel=>{
    const el=document.querySelector(sel); if(!el) return;
    el.innerHTML=DIRS().map(([d,l])=>`<button data-dir="${d}" class="${direction===d?'active':''}">${l}</button>`).join('');
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ direction=b.dataset.dir; LS.set(KEY('hw_dir'),direction); queueRemoteSync(); renderDirSegs(); });
  });
}
/* Associations are the one store the user can grow without limit, and localStorage is a hard
   ~5MB wall shared by both languages. Refuse growth past the budget instead of letting a
   later, silent quota failure eat someone's progress. */
function saveAssoc(){
  let payload; try{ payload=JSON.stringify(assoc); }catch(e){ return false; }
  if(payload.length>ASSOC_BUDGET){
    toast('מאגר האסוציאציות מלא — קצר או מחק אסוציאציות ישנות');
    const prev=LS.get(KEY('hw_assoc'), null);              // roll memory back to what is on disk
    if(isObj(prev)) assoc=prev;
    return false;
  }
  const ok=LS.set(KEY('hw_assoc'), assoc); queueRemoteSync(); return ok;
}
const saveStats   = () => { const ok=LS.set(KEY('hw_stats'), stats); queueRemoteSync(); return ok; };
const saveDeleted = () => { const ok=LS.set(KEY('hw_deleted'), [...deleted]); queueRemoteSync(); return ok; };
const saveAdded   = () => { const ok=LS.set(KEY('hw_added'), added); queueRemoteSync(); return ok; };

/* canonical word key: same word with/without niqqud (or across units) is ONE word everywhere */
const K = t => LANG==='en' ? normEn(t) : norm(t);
function normEn(s){
  return (s==null?'':String(s)).normalize('NFKC').toLowerCase()
    .replace(/^(to|a|an|the)\s+/,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}
/* one-time migration: merge existing per-exact-string records into normalized keys.
   Called from boot (norm/NIQ are defined further down the file). */
function migrateStores(){
  if(LS.get(KEY('hw_migr'),0)>=7) return;
  const nw={};
  for(const t in stats.words){
    const k=K(t); if(!k) continue;
    const r=saneRec(stats.words[t]);
    if(!nw[k]) nw[k]=r;
    else { const o=nw[k];
      o.seen+=r.seen; o.first+=r.first; o.ever+=r.ever; o.wrong+=r.wrong;
      o.level=Math.max(o.level,r.level); o.last=Math.max(o.last,r.last); }
  }
  stats.words=nw; saveStats();
  const na={}; for(const t in assoc){ const k=K(t); if(k && assoc[t] && !na[k]) na[k]=assoc[t]; } assoc=na; saveAssoc();
  deleted=new Set([...deleted].map(K).filter(Boolean)); saveDeleted();
  LS.set(KEY('hw_migr'),7);
}

/* Housekeeping: drop records/associations/deletions for words that no longer exist in the
   bank at all. Without this, every data refresh leaves permanent orphans in localStorage. */
function pruneOrphans(){
  const data=(LANG==='en'?window.UNIT_DATA_EN:window.UNIT_DATA)||{};
  const live=new Set();
  for(const u in data) for(const p of data[u]){ const k=K(p[0]); if(k) live.add(k); }
  for(const p of added){ const k=K(p[0]); if(k) live.add(k); }
  let touched=false;
  for(const k in stats.words) if(!live.has(k)){ delete stats.words[k]; touched=true; }
  for(const k in assoc)       if(!live.has(k)){ delete assoc[k];       touched=true; }
  let delTouched=false;
  for(const k of [...deleted]) if(!live.has(k)){ deleted.delete(k); delTouched=true; }
  if(touched){ saveStats(); saveAssoc(); }
  if(delTouched) saveDeleted();
}

/* ===== word bank ===== */
let BANK = [];
const UNIT_IDS = ['1','2','3','4','5','6','7','8','9','10'];
/* INVARIANT: after buildBank(), BANK holds each normalized key AT MOST ONCE — within a unit,
   across units, and across personal words. Everything downstream (counts, quizzes, stats)
   relies on this, so it is enforced here rather than trusted from the data files. */
function buildBank(){
  BANK = [];
  const seen = new Map();       // normalized key -> the one entry that owns it (first unit wins)
  const data = (LANG==='en' ? window.UNIT_DATA_EN : window.UNIT_DATA) || {};
  const add = (term, meaning, unit) => {
    if(typeof term!=='string' || !term.trim()) return;
    const k=K(term);
    if(!k || deleted.has(k)) return;
    meaning = typeof meaning==='string' ? meaning : '';
    const w0=seen.get(k);
    if(w0){                     // duplicate anywhere → fold its meaning into the owner
      if(meaning && !w0.meaning.split('; ').includes(meaning)) w0.meaning += (w0.meaning?'; ':'')+meaning;
      return;
    }
    const w={term, meaning, unit, id:unit+':'+k};
    seen.set(k,w); BANK.push(w);
  };
  for(const uid of Object.keys(data)){
    const rows = Array.isArray(data[uid]) ? data[uid] : [];
    for(const pair of rows){ if(Array.isArray(pair)) add(pair[0], pair[1], uid); }
  }
  for(const pair of added) add(pair[0], pair[1], 'custom');   // unit copy always wins
}

/* ===== stats model ===== */
function rec(term){ const k=K(term); const r=stats.words[k]; if(isObj(r)) return r; return (stats.words[k]=saneRec(null)); }
function scopeWords(scope){
  if(scope==='global'||scope==='random') return BANK;
  if(scope.startsWith('unit:')) { const u=scope.slice(5); return BANK.filter(w=>w.unit===u); }
  return BANK;
}
// classification (per the learning model):
//   חדשה  = seen==0 (never practiced)
//   חלשה  = seen>0 && level==0 (practiced but not yet gotten right on a first try)
//   יודע  = level>=1 (got it right first-try at least once, net) — stays only in "תרגל הכל"
// counter (level): +1 per correct-first-try, -1 per wrong; a clean first sight jumps to 3.
//   חדשות = counter 0 (never-seen, or got it wrong and not yet re-learned)
//   חלשות = counter 1-2 (knew it 1-2 times, on the way to mastery)
//   שלמדתי = counter >=3 (mastered / knew it on first sight)
const lvl = term => (stats.words[K(term)]||{}).level || 0;
const lastOf = term => (stats.words[K(term)]||{}).last || 0;
function classify(scope){
  const seen=new Set(); let strong=0,weak=0,fresh=0;
  for(const w of scopeWords(scope)){
    const k=K(w.term);
    if(seen.has(k)) continue; seen.add(k);
    const v=lvl(w.term);
    if(v>=3) strong++; else if(v>=1) weak++; else fresh++;
  }
  return {total:seen.size, strong, weak, fresh};
}
function uniqScope(scope){ const seen=new Set(),out=[]; for(const w of scopeWords(scope)){ const k=K(w.term); if(!seen.has(k)){seen.add(k);out.push(w);} } return out; }
function newCards(scope){ return uniqScope(scope).filter(w=>lvl(w.term)<1); }
function weakCards(scope){
  const arr=uniqScope(scope).filter(w=>{const v=lvl(w.term);return v>=1&&v<3;});
  arr.sort((a,b)=>lastOf(a.term)-lastOf(b.term));
  return arr;
}
function learnedCards(scope){ return uniqScope(scope).filter(w=>lvl(w.term)>=3); }
function allCards(scope){
  const w=uniqScope(scope).slice();
  shuffle(w);
  if(scope==='global'||scope==='random') return w.slice(0,30);
  return w;
}

/* ===== answer normalization ===== */
const NIQ=/[֑-ׇ]/g;
function norm(s){
  // NFKC folds Hebrew presentation forms (e.g. U+FB35 ﬡּ) back to letter+dagesh, so a word
  // stored with one can still be typed normally and matched.
  return (s==null?'':String(s)).normalize('NFKC').replace(NIQ,'').replace(/[‎‏]/g,'')
    .replace(/["'`׳״.,;:!?()\[\]{}\-–—/|]/g,'').replace(/\s+/g,' ').trim()
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ');
}
function isCorrect(input, term){
  const a=K(input); if(!a) return false;
  if(a===K(term)) return true;
  // accept slash/comma alternatives ("1st - first", "raise / lift")
  const alts=term.split(/[\/|,]|\s-\s/).map(x=>K(x)).filter(Boolean);
  return alts.includes(a);
}

/* ===== screens ===== */
const SCREENS=['auth','welcome','level','home','scope','quiz','results','stats','manage','add','exam'];
/* Heavy lists left in hidden screens keep thousands of nodes alive for the whole session;
   drop them on the way out — they are always rebuilt when the screen is opened again. */
const HEAVY = {stats:'#statsBody', manage:'#manageList', results:'#reviewList'};
function goto(id){
  SCREENS.forEach(s=>{
    if(s!==id && HEAVY[s] && !$('#'+s).classList.contains('hidden')){ const el=$(HEAVY[s]); if(el) el.innerHTML=''; }
    hide($('#'+s));
  });
  show($('#'+id)); window.scrollTo(0,0);
}

/* ===== HOME ===== */
function renderHome(){
  const total=BANK.length;
  const uniqTerms=new Set(BANK.map(w=>w.term)).size;
  $('#totalPill').textContent = `${total} מילים · ${uniqTerms} ייחודיות`;
  renderDirSegs();
  const grid=$('#unitGrid'); grid.innerHTML='';
  UNIT_IDS.forEach(uid=>{
    const c=classify('unit:'+uid);
    if(c.total===0) return;
    const pct=n=>c.total?(100*n/c.total):0;
    const el=document.createElement('button');
    el.className='tile';
    el.innerHTML=`<div class="num">${uid}</div><div class="lbl">${c.total} מילים</div>
      <div class="mini"><i class="s" style="width:${pct(c.strong)}%"></i><i class="w" style="width:${pct(c.weak)}%"></i><i class="n" style="width:${pct(c.fresh)}%"></i></div>`;
    el.onclick=()=>openScope('unit:'+uid);
    grid.appendChild(el);
  });
}

/* ===== SCOPE ===== */
let curScope='global';
const scopeTitle = s => s==='global'?'כל המאגר' : s==='random'?'אקראי' : 'יחידה '+s.slice(5);
function openScope(scope){
  curScope=scope;
  $('#scopeBrand').textContent = scope==='global'?'📚':scope==='random'?'🎲':'יחידה '+scope.slice(5);
  $('#scopeTitle').textContent = scopeTitle(scope);
  const c=classify(scope);
  $('#donutTotal').textContent=c.total;
  const done=c.total||1;
  const gs=100*c.strong/done, gw=100*c.weak/done;
  $('#donut').style.background=`conic-gradient(var(--green) 0 ${gs}%, var(--accent) ${gs}% ${gs+gw}%, var(--gold) ${gs+gw}% 100%)`;
  $('#legend').innerHTML=
    `<div><i class="s"></i> שלמדתי <b>${c.strong}</b></div>
     <div><i class="w"></i> לחיזוק <b>${c.weak}</b></div>
     <div><i class="n"></i> חדשות <b>${c.fresh}</b></div>`;
  const nc=newCards(scope).length, wc=weakCards(scope).length, lc=learnedCards(scope).length;
  $('#cntNew').textContent=nc; $('#cntWeak').textContent=wc; $('#cntLearned').textContent=lc;
  $('#pbNew').disabled = nc===0;
  $('#pbWeak').disabled = wc===0;
  $('#pbLearned').disabled = lc===0;
  const allN = (scope==='global'||scope==='random')?Math.min(30,c.total):c.total;
  $('#cntAll').textContent=allN;
  $('#pbAllSub').textContent = (scope==='global'||scope==='random')?'מדגם אקראי לתרגול מהיר':'כל מילות היחידה בערבוב';
  $('#pbAll').disabled = c.total===0;
  const isUnit=scope.startsWith('unit:');
  $('#examSectionT').classList.toggle('hidden', !isUnit);
  $('#pbExam').classList.toggle('hidden', !isUnit);
  $('#pbSheet').classList.toggle('hidden', !isUnit);
  if(isUnit){
    const h=LS.get(exKey(scope.slice(5)),[]);
    const last=Array.isArray(h)&&h.length?h[h.length-1]:null;
    $('#cntExam').textContent = last ? last.pct+'%' : '›';
    $('#pbExamSub').textContent = last
      ? `ציון אחרון ${last.pct}% · שיא ${Math.max(...h.map(x=>int0(x.pct)))}% · ${h.length===1?'מבחן אחד':h.length+' מבחנים'}`
      : 'ציון על השליטה שלך במילים של היחידה';
  }
  renderDirSegs();
  goto('scope');
}
$('#pbAll').onclick     = ()=> startRound(allCards(curScope), curScope, 'all');
// NOTE: new/learned are shuffled BEFORE the cap — otherwise slicing an ordered list hands
// back the very same 20 words every round, which reads as "the app keeps repeating itself".
$('#pbWeak').onclick    = ()=> askSize(n=> startRound(cap(weakCards(curScope),n), curScope, 'weak'));
$('#pbNew').onclick     = ()=> askSize(n=> startRound(cap(shuffle(newCards(curScope)),n), curScope, 'new'));
$('#pbLearned').onclick = ()=> askSize(n=> startRound(cap(shuffle(learnedCards(curScope)),n), curScope, 'learned'));
$('#pbExam').onclick=()=>{ if(curScope.startsWith('unit:')) openExam(curScope.slice(5)); };
$('#pbSheet').onclick=()=>{ if(curScope.startsWith('unit:')) printSheet(curScope.slice(5)); };
$('#pbStats').onclick   = ()=> openStats(curScope);
function cap(list,n){ if(n && list.length>n){ toast(`מתרגל ${n} מתוך ${list.length}`); return list.slice(0,n);} return list; }

/* ===== how many words this round? ===== */
const SIZES=[20,30,50,0];                       // 0 = ללא הגבלה
let sizeCb=null;
function askSize(cb){
  sizeCb=cb;
  const last=LS.get(KEY('hw_size'), 20);
  $('#sizeOpts').innerHTML=SIZES.map(n=>
    `<button data-n="${n}" class="${n===last?'active':''}">${n||'ללא הגבלה'}</button>`).join('');
  show($('#sizeAsk'));
}
$('#sizeOpts').onclick=e=>{
  const b=e.target.closest('button[data-n]'); if(!b) return;
  const n=+b.dataset.n;
  LS.set(KEY('hw_size'), n);
  hide($('#sizeAsk'));
  const cb=sizeCb; sizeCb=null; if(cb) cb(n);
};
$('#sizeCancel').onclick=()=>{ sizeCb=null; hide($('#sizeAsk')); };
$('#sizeAsk').onclick=e=>{ if(e.target===$('#sizeAsk')){ sizeCb=null; hide($('#sizeAsk')); } };

/* ===== QUIZ ENGINE ===== */
let deck=[], idx=0, correct=0, missed=[], answered=false;
let session=new Map(), sessionScope='global', sessionMode='all', committed=false;

function sess(w){ const k=K(w.term); if(!session.has(k)) session.set(k,{w,attempts:0,mastered:false,firstTry:false}); return session.get(k); }

function startRound(cards, scope, mode){
  if(!Array.isArray(cards) || cards.length===0){ toast('אין מילים לתרגול כאן'); return; }
  if(!committed && session.size>0) commitSession();
  session=new Map(); committed=false;
  sessionScope=scope; sessionMode=mode;
  // last line of defence: the same word can never appear twice inside one round
  const uniq=[], ks=new Set();
  for(const c of cards){ const k=K(c.term); if(k && !ks.has(k)){ ks.add(k); uniq.push(c); } }
  deck=shuffle(uniq).map(c=>({...c, _dir: direction==='mixed' ? (Math.random()<0.5?'m2w':'w2m') : direction}));
  if(!deck.length){ toast('אין מילים לתרגול כאן'); return; }
  idx=0; correct=0; missed=[];
  $('#quizScope').textContent = scopeTitle(scope);
  goto('quiz'); renderCard();
}
let focusT;
function renderCard(){
  answered=false;
  if(idx<0 || idx>=deck.length){ finishRound(); return; }
  const w=deck[idx];
  $('#progBar').style.width = (100*idx/deck.length)+'%';
  $('#qCount').textContent = `מילה ${idx+1} מתוך ${deck.length}`;
  $('#qLive').textContent = `✓ ${correct}`;
  $('#hintBtn').classList.remove('hidden'); $('#hintBox').classList.add('hidden'); $('#hintBox').textContent='';
  $('#feedback').classList.add('hidden'); $('#feedback').innerHTML='';
  const inp=$('#answerInput');
  inp.classList.remove('hidden'); inp.value=''; inp.disabled=false;
  show($('#answerActions'));
  const en = LANG==='en';
  if(w._dir==='w2m'){   // show the WORD, type the meaning (Hebrew side)
    $('#qKind').textContent = en ? 'כתוב את התרגום לעברית' : 'כתוב את הפירוש של המילה';
    $('#qText').textContent = w.term;
    $('#qText').dir = en ? 'ltr' : 'rtl';
    inp.placeholder = en ? 'התרגום…' : 'הפירוש…';
    inp.dir='rtl';
    bindSay('#qSay', w.term);
  }else{                // show the MEANING (Hebrew), type the word
    $('#qKind').textContent = en ? 'כתוב את המילה באנגלית' : 'כתוב את המילה לפי הפירוש';
    $('#qText').textContent = w.meaning;
    $('#qText').dir='rtl';
    // The English word IS the answer here, so it can only be read out after the card is
    // answered — otherwise the speaker button just gives it away.
    bindSay('#qSay', null);
    inp.placeholder = en ? 'the word…' : 'המילה…';
    inp.dir = en ? 'ltr' : 'rtl';
  }
  clearTimeout(focusT);
  focusT=setTimeout(()=>{ if(!$('#quiz').classList.contains('hidden') && !answered) inp.focus(); },30);
}
function meaningMatch(input, meaning){
  // the "meaning" side is Hebrew in both languages → always use the Hebrew normalizer
  const a=norm(input); if(!a) return false;
  if(a===norm(meaning)) return true;
  const segs=meaning.split(/[,;/|()]|\s-\s/).map(norm).filter(Boolean);
  if(segs.includes(a)) return true;
  if(!a.includes(' ') && a.length>=2) return norm(meaning).split(' ').includes(a);
  return false;
}
function check(){ if(answered||!deck[idx]) return; const w=deck[idx]; const ok = w._dir==='w2m' ? meaningMatch($('#answerInput').value, w.meaning) : isCorrect($('#answerInput').value, w.term); finishCard(ok, false); }
function skip(){ if(answered||!deck[idx]) return; finishCard(false, true); }
function finishCard(ok, skipped){
  const w=deck[idx]; if(!w) return;
  answered=true;
  const w2m = w._dir==='w2m';
  $('#answerInput').disabled=true; hide($('#answerActions'));
  $('#hintBtn').classList.add('hidden'); $('#hintBox').classList.add('hidden');
  // The card is over, so the English word can be read out in either direction now.
  bindSay('#qSay', w.term);
  const e=sess(w); e.attempts++;
  if(ok){ correct++; e.mastered=true; if(e.attempts===1)e.firstTry=true; }
  else { missed.push(w); }
  $('#qLive').textContent=`✓ ${correct}`;
  const fb=$('#feedback');
  const answer = w2m ? w.meaning : w.term;    // the correct answer for this direction
  const label  = w2m ? 'הפירוש' : 'המילה';
  const verdict = ok?'נכון! ✓':(skipped?'התשובה:':'לא מדויק');
  fb.innerHTML =
    `<div class="verdict ${ok?'ok':'no'}">${verdict}</div>`+
    (!ok?`<div class="reveal">${label}: <b>${esc(answer)}</b></div>`:'')+
    (!ok?`<button class="was-right" id="wasRight">בעצם ידעתי — סמן כנכון</button>`:'')+
    `<div class="assoc">
       <label>💡 האסוציאציה שלי ל"${esc(w.term)}"</label>
       <textarea id="assocInput" rows="2" placeholder="קישור/תמונה שיעזרו לזכור…">${esc(assoc[K(w.term)]||'')}</textarea>
       <div class="assoc-bar"><button id="assocSave">שמירה</button><span class="st" id="assocSt"></span></div>
     </div>
     <button class="del-live" id="delLive">🗑 אני מכיר את המילה — מחק מהמאגר</button>
     <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="nextBtn">${idx+1<deck.length?'הבא ←':'לסיכום'}</button></div>`;
  fb.classList.remove('hidden');
  function persist(){ const el=$('#assocInput'); if(!el) return; const v=el.value.trim().slice(0,ASSOC_MAX); if(v)assoc[K(w.term)]=v; else delete assoc[K(w.term)]; saveAssoc(); }
  $('#assocSave').onclick=()=>{ persist(); $('#assocSt').textContent='נשמר ✓'; };
  $('#assocInput').oninput=()=>$('#assocSt').textContent='';
  $('#nextBtn').onclick=()=>{ persist(); next(); };
  const wr=$('#wasRight'); if(wr) wr.onclick=()=>{ correct++; const i=missed.indexOf(w); if(i>=0)missed.splice(i,1); e.mastered=true; e.firstTry=(e.attempts===1); $('#qLive').textContent=`✓ ${correct}`; wr.remove(); document.querySelector('.verdict').textContent='סומן כנכון ✓'; document.querySelector('.verdict').className='verdict ok'; };
  $('#delLive').onclick=()=>{ const k=K(w.term); deleteWord(w.term); toast(`"${w.term}" נמחקה`); deck=deck.filter(c=>K(c.term)!==k); missed=missed.filter(c=>K(c.term)!==k); session.delete(k); if(deck.length===0){ finishRound(); return; } if(idx>=deck.length) idx=deck.length-1; next(true); };
}
function next(stay){
  if(!stay) idx++;
  if(idx>=deck.length) finishRound(); else renderCard();
}
// NOTE: stats are committed when LEAVING the results screen, so per-word corrections apply.
function finishRound(){
  $('#finalOf').textContent=`מתוך ${deck.length}`;
  $('#resScope').textContent='→ '+scopeTitle(sessionScope);
  renderReview();
  goto('results');
}
const verdictOf = term => { const e=session.get(K(term)); return !!(e && e.mastered); };
function refreshResultCounts(){
  correct = deck.filter(w=>verdictOf(w.term)).length;
  missed  = deck.filter(w=>!verdictOf(w.term));
  $('#finalScore').textContent=correct;
  $('#missCount').textContent=missed.length;
  $('#allGood').classList.toggle('hidden', missed.length!==0);
  $('#retryMissedBtn').classList.toggle('hidden', missed.length===0);
}
function renderReview(){
  refreshResultCounts();
  const list=$('#reviewList');
  list.innerHTML=deck.map(w=>{
    const ok=verdictOf(w.term);
    return `<div class="rev-row ${ok?'':'wrong'}" data-t="${esc(w.term)}">
      <div class="rev-w"><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span></div>
      <button class="rev-chip ${ok?'ok':'no'}">${ok?'✓ ידעתי':'✗ לא ידעתי'}</button></div>`;
  }).join('');
  list.querySelectorAll('.rev-chip').forEach(chip=>{
    chip.onclick=()=>{
      const row=chip.closest('.rev-row'); const term=row.dataset.t;
      const e=session.get(K(term)); if(!e) return;
      const nowOk=!e.mastered;
      e.mastered=nowOk; e.firstTry=nowOk; if(nowOk && e.attempts<1) e.attempts=1;
      row.classList.toggle('wrong', !nowOk);
      chip.className='rev-chip '+(nowOk?'ok':'no');
      chip.textContent=nowOk?'✓ ידעתי':'✗ לא ידעתי';
      refreshResultCounts();
    };
  });
}
function commitSession(){
  if(committed) return;
  committed=true;                       // set first: a throw below must not cause a double-commit
  const entries=[...session.values()]; if(!entries.length) return;
  const now=Date.now(); let c=0,ft=0,st=0,nw=0;
  entries.forEach(e=>{
    const r=rec(e.w.term);
    const wasNew = r.seen===0;
    if(wasNew) nw++;
    r.seen++;
    if(e.mastered && e.firstTry){                       // knew it (correct on first attempt of the round)
      r.first++; r.ever++;
      r.level = wasNew ? 3 : Math.min(3, r.level+1);     // knew on very first sight → straight to "שלמדתי"; else climb toward 3
      ft++; c++;
    }
    else if(e.mastered){ r.ever++; r.wrong+=Math.max(0,e.attempts-1); r.level=Math.max(0,r.level-1); st++; c++; }
    else { r.wrong++; r.level=Math.max(0,r.level-1); }
    r.last=now;
  });
  stats.sessions.push({t:now, scope:sessionScope, mode:sessionMode, total:entries.length, correct:c, firstTry:ft, struggled:st, newCount:nw});
  if(stats.sessions.length>MAX_SESSIONS) stats.sessions=stats.sessions.slice(-MAX_SESSIONS);
  saveStats();
}

$('#checkBtn').onclick=check;
$('#skipBtn').onclick=skip;
$('#answerInput').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!answered){ e.preventDefault(); e.stopPropagation(); check(); } });
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||!answered) return;
  if($('#quiz').classList.contains('hidden')) return;
  if(e.target && e.target.id==='assocInput') return;
  e.preventDefault(); const n=$('#nextBtn'); if(n) n.click();
});
$('#hintBtn').onclick=()=>{ const w=deck[idx]; if(!w) return; const a=assoc[K(w.term)]; const b=$('#hintBox'); b.textContent=a?('💡 '+a):'עדיין לא כתבת אסוציאציה למילה הזו — תוכל להוסיף אחרי שתענה.'; b.classList.remove('hidden'); };
$('#quitQuiz').onclick=()=>{ if(!committed&&session.size>0) commitSession(); openScope(sessionScope); };
$('#retryMissedBtn').onclick=()=>startRound(missed.slice(), sessionScope, sessionMode); // startRound commits the (corrected) session first
$('#resBackBtn').onclick=()=>{ commitSession(); openScope(sessionScope); };
$('#resScope').onclick=()=>{ commitSession(); openScope(sessionScope); };
// safety net: if the app is closed/backgrounded on the results screen, still record the round
window.addEventListener('pagehide', ()=>{ if(!committed && session.size>0) commitSession(); });
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && !committed && session.size>0) commitSession(); });

/* ===== STATS screen ===== */
function fmt(t){ const d=new Date(t); return d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}); }
function dots(l){ let s='<span class="dots">'; for(let i=1;i<=5;i++)s+=`<i class="${i<=l?'on':''}"></i>`; return s+'</span>'; }
function openStats(scope){
  $('#statsBrand').textContent=scopeTitle(scope);
  const body=$('#statsBody');
  const words=scopeWords(scope);
  const byTerm=new Map(); for(const w of words){ const k=K(w.term); if(!byTerm.has(k)) byTerm.set(k,w); }
  // Only words actually practiced — a list of words you have never met says nothing about
  // your strength. Weakest first, then the middle, then the ones you know.
  const all=[...byTerm.values()];
  const arr=all.filter(w=>{ const r=stats.words[K(w.term)]; return r && r.seen>0; })
    .sort((a,b)=>{
      const ra=stats.words[K(a.term)], rb=stats.words[K(b.term)];
      if(ra.level!==rb.level) return ra.level-rb.level;      // 0 → 3
      if(rb.wrong!==ra.wrong) return rb.wrong-ra.wrong;      // more mistakes = weaker
      return rb.last-ra.last;                                // most recent first
    });
  const untouched=all.length-arr.length;
  const sess=stats.sessions.filter(s=>s.scope===scope).slice(-8);
  let html='';
  if(sess.length){
    const last=sess[sess.length-1], prev=sess.length>1?sess[sess.length-2]:null;
    const pct=x=>x.total?Math.round(100*x.correct/x.total):0;
    let cmp='';
    if(prev){ const d=pct(last)-pct(prev); cmp = d>0?`<span style="color:var(--green);font-weight:700">▲ ${d}%</span>`:d<0?`<span style="color:var(--accent);font-weight:700">▼ ${-d}%</span>`:'ללא שינוי'; }
    html+=`<div class="section-t">היסטוריית משחקים</div>
      <div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px">
      <div><b style="font-family:'Frank Ruhl Libre';font-size:1.2rem;color:var(--accent)">${last.correct}/${last.total}</b> נכונות · ${last.firstTry} בפעם הראשונה</div>
      <div style="font-size:.8rem;color:var(--ink-soft);margin-top:3px">${fmt(last.t)}${cmp?' · השוואה: '+cmp:''}</div></div>
      <div class="trend">`+sess.map(x=>{const p=pct(x);return `<div class="tbar" title="${fmt(x.t)} — ${x.correct}/${x.total}"><i style="height:${Math.max(5,p)}%"></i><em>${p}%</em></div>`;}).join('')+`</div>`;
  }else{
    html+=`<div class="section-t">היסטוריית משחקים</div><p class="msg" style="color:var(--ink-soft)">עדיין לא סיימת סבב מלא בתחום הזה.</p>`;
  }
  // The full list is up to 3,694 rows (~44k DOM nodes) — far too heavy for a phone.
  // Render a page at a time and let the user ask for more.
  const row=w=>{
    const r=stats.words[K(w.term)]; const isNew=(!r||r.seen===0); const lv=isNew?0:r.level;
    const meta=isNew?'טרם תורגלה':`נראתה ${r.seen}× · ${r.first} ראשונה · ${r.wrong} טעויות`;
    return `<div class="str-row${isNew?' is-new':''}"><div class="str-w"><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span></div><div class="str-meter">${dots(lv)}<em>${meta}</em></div></div>`;
  };
  html+=`<div class="section-t">חוזק מילים · מהחלש לחזק</div>`;
  if(!arr.length){
    html+=`<p class="msg" style="color:var(--ink-soft)">עדיין לא תרגלת מילים בתחום הזה — תרגל סבב אחד והחוזק יופיע כאן.</p>`;
  }else{
    html+=`<p style="color:var(--ink-soft);font-size:.8rem;margin:0 0 8px">${arr.length} מילים שתרגלת`+
          (untouched?` · ${untouched} עוד לא נפגשת איתן`:'')+`</p>`;
  }
  html+=`<div class="strength-list" id="strList"></div>
         <button class="btn btn-ghost btn-block hidden" id="strMore" style="margin-top:10px"></button>`;
  body.innerHTML=html;
  const PAGE=150; let shown=0;
  const listEl=$('#strList'), moreEl=$('#strMore');
  const page=()=>{
    listEl.insertAdjacentHTML('beforeend', arr.slice(shown, shown+PAGE).map(row).join(''));
    shown=Math.min(shown+PAGE, arr.length);
    const left=arr.length-shown;
    moreEl.classList.toggle('hidden', left<=0);
    if(left>0) moreEl.textContent=`הצג עוד ${Math.min(PAGE,left)} (נותרו ${left})`;
  };
  moreEl.onclick=page; page();
  goto('stats');
}
$('#statsBack').onclick=()=>openScope(curScope);

/* ===== MANAGE ===== */
function deleteWord(term){ const k=K(term); deleted.add(k); saveDeleted(); delete assoc[k]; saveAssoc(); delete stats.words[k]; saveStats(); buildBank(); }
let mSel=new Set();
function renderManage(filter){
  const list=$('#manageList'); const f=norm(filter||'');
  const items=BANK.filter(w=>!f || norm(w.term).includes(f) || (w.meaning&&w.meaning.replace(NIQ,'').includes(filter)));
  list.innerHTML=items.slice(0,400).map(w=>{
    const u=w.unit==='custom'?'שלי':w.unit;
    return `<label class="m-row"><input type="checkbox" data-term="${esc(w.term)}" ${mSel.has(w.term)?'checked':''}><b>${esc(w.term)}</b><span>${esc(w.meaning)}</span><span class="u">${u}</span></label>`;
  }).join('') || '<p class="msg" style="color:var(--ink-soft)">לא נמצאו מילים</p>';
  list.querySelectorAll('input').forEach(c=>c.onchange=()=>{ c.checked?mSel.add(c.dataset.term):mSel.delete(c.dataset.term); $('#mCount').textContent=`${mSel.size} נבחרו`; });
  $('#mCount').textContent=`${mSel.size} נבחרו`;
}
$('#manageBtn').onclick=()=>{ mSel=new Set(); $('#mSearch').value=''; $('#mMsg').classList.add('hidden'); renderManage(''); goto('manage'); };
$('#mSearch').oninput=e=>renderManage(e.target.value);
$('#mDelete').onclick=()=>{
  const m=$('#mMsg'); m.classList.remove('hidden'); m.className='msg';
  if(mSel.size===0){ m.textContent='לא נבחרו מילים.'; return; }
  if(!confirm(`למחוק ${mSel.size} מילים? (ניתן לשחזר)`)){ m.classList.add('hidden'); return; }
  mSel.forEach(t=>{ const k=K(t); deleted.add(k); delete assoc[k]; delete stats.words[k]; });
  saveDeleted(); saveAssoc(); saveStats(); buildBank();
  m.className='msg ok'; m.textContent=`נמחקו ${mSel.size} מילים.`; mSel=new Set(); renderManage($('#mSearch').value); renderHome();
};
$('#mRestore').onclick=()=>{
  if(deleted.size===0){ toast('אין מחיקות לשחזר'); return; }
  if(!confirm(`לשחזר ${deleted.size} מילים שנמחקו?`)) return;
  deleted=new Set(); saveDeleted(); buildBank(); renderManage($('#mSearch').value); renderHome(); toast('המחיקות שוחזרו');
};

/* ===== ADD ===== */
$('#addBtn').onclick=()=>{ $('#addTerm').value=''; $('#addMeaning').value=''; $('#addMsg').classList.add('hidden'); goto('add'); };
$('#addSave').onclick=()=>{
  const t=$('#addTerm').value.trim(), mn=$('#addMeaning').value.trim();
  const m=$('#addMsg'); m.classList.remove('hidden');
  if(!t||!mn){ m.className='msg err'; m.textContent='צריך גם מילה וגם פירוש.'; return; }
  if(t.length>120||mn.length>400){ m.className='msg err'; m.textContent='המילה או הפירוש ארוכים מדי.'; return; }
  const k=K(t);
  if(!k){ m.className='msg err'; m.textContent='המילה לא תקינה.'; return; }
  const wasDeleted=deleted.has(k);
  if(!wasDeleted && BANK.some(w=>K(w.term)===k)){   // never create a duplicate of an existing word
    m.className='msg err'; m.textContent=`"${t}" כבר קיימת במאגר.`; return;
  }
  if(!added.some(p=>K(p[0])===k)) added.push([t,mn]);
  saveAdded(); deleted.delete(k); saveDeleted(); buildBank(); renderHome();
  m.className='msg ok'; m.textContent=`"${t}" נוספה למאגר ✓`; $('#addTerm').value=''; $('#addMeaning').value=''; $('#addTerm').focus();
};

/* ===== nav ===== */
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{ if(!committed && session.size>0) commitSession(); renderHome(); goto('home'); });
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>openScope(b.dataset.scope));

/* ===== PWA ===== */
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }

/* ===== התקנה למסך הבית =====
   כרום/אנדרואיד נותן לנו את אירוע ההתקנה ואפשר לפתוח את החלון בלחיצה.
   אייפון לא מאפשר זאת תכנותית — שם מציגים הדרכה. */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; LS.set('hw_installed', 1); });

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

/* מציג את חלון ההתקנה. force=true מתעלם מ"אולי אחר כך" (לשימוש מכפתור מפורש). */
function promptInstall(force){
  if(isStandalone() || LS.get('hw_installed',0)) return false;      // כבר מותקנת
  if(!force && LS.get('hw_instDismissed',0)) return false;          // המשתמש דחה
  ['#instAuto','#instIOS','#instManual'].forEach(s=>hide($(s)));
  if(installEvt)      show($('#instAuto'));
  else if(isIOS())    show($('#instIOS'));
  else                show($('#instManual'));
  show($('#installAsk'));
  return true;
}
function closeInstall(dismissed){
  hide($('#installAsk'));
  if(dismissed) LS.set('hw_instDismissed', 1);
}
$('#instNow').onclick = async ()=>{
  if(!installEvt){ closeInstall(false); return; }
  const evt = installEvt; installEvt = null;      // אפשר להשתמש באירוע פעם אחת בלבד
  try{
    evt.prompt();
    const { outcome } = await evt.userChoice;
    if(outcome === 'accepted'){ LS.set('hw_installed',1); toast('מותקן! חפש את האייקון במסך הבית'); }
    closeInstall(outcome !== 'accepted');
  }catch(e){ closeInstall(false); }
};
$('#instLater').onclick = ()=> closeInstall(true);
$('#installAsk').onclick = e =>{ if(e.target===$('#installAsk')) closeInstall(true); };

/* ===== welcome / language selection ===== */
function greeting(){
  const h=new Date().getHours();
  if(h<5)  return 'לילה טוב';
  if(h<12) return 'בוקר טוב';
  if(h<17) return 'צהריים טובים';
  if(h<21) return 'ערב טוב';
  return 'לילה טוב';
}
function langSummary(lang){
  // read that language's stats without switching the active language
  const s=LS.get(lang==='en'?'hw_stats_en':'hw_stats',{});
  const words=(isObj(s)&&isObj(s.words))?s.words:{};
  const data=(lang==='en'?window.UNIT_DATA_EN:window.UNIT_DATA)||{};
  const rawDel=LS.get(lang==='en'?'hw_deleted_en':'hw_deleted',[]);
  const del=new Set(Array.isArray(rawDel)?rawDel:[]);
  const nk = lang==='en'?normEn:norm;
  const keys=new Set();
  for(const u in data){
    const rows=Array.isArray(data[u])?data[u]:[];
    for(const p of rows){ if(!Array.isArray(p)) continue; const k=nk(p[0]); if(k && !del.has(k)) keys.add(k); }
  }
  // Scope every count to the live bank. Counting raw stats keys instead would fold in
  // orphans left behind by deleted or renamed entries, so "practised" could exceed the
  // number of words that exist.
  let learned=0, practised=0;
  keys.forEach(k=>{ const r=words[k]; if(!isObj(r)) return;
    if(int0(r.seen)>0) practised++;
    if(int0(r.level)>=3) learned++; });
  return {total:keys.size, learned, practised, pct: keys.size? Math.round(100*learned/keys.size):0};
}
/* ===== streak =====
   Derived from the session log rather than a counter of its own, so it can't drift out of
   sync with reality and it rides the existing cross-device merge for free. Both languages
   count: a day of Hebrew is a day of practice.
   Local calendar days, not 24h windows — practising at 23:50 and again at 00:10 is two days,
   which is how people actually experience a streak. */
const dayKey = ts =>{ const d=new Date(ts); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
function practiceDays(){
  const out=new Set();
  for(const key of ['hw_stats','hw_stats_en']){
    const s=LS.get(key,{});
    const arr=(isObj(s)&&Array.isArray(s.sessions))?s.sessions:[];
    arr.forEach(x=>{ if(isObj(x) && x.t) out.add(dayKey(x.t)); });
  }
  return out;
}
function streakInfo(){
  const days=practiceDays();
  const DAY=86400000, now=Date.now();
  // today doesn't break a streak that ran through yesterday — it just hasn't been extended yet
  let start = days.has(dayKey(now)) ? 0 : (days.has(dayKey(now-DAY)) ? 1 : -1);
  let n=0;
  if(start>=0) for(let i=start;;i++){ if(!days.has(dayKey(now-i*DAY))) break; n++; }
  const week=[];
  for(let i=6;i>=0;i--) week.push(days.has(dayKey(now-i*DAY)));
  return {n, today: days.has(dayKey(now)), week, total: days.size};
}
function renderWelcome(){
  const name=(LS.get('hw_name','')||'').trim();
  $('#greet').textContent = name ? greeting()+', '+name : greeting()+'!';
  const he=langSummary('he'), en=langSummary('en');
  $('#heCount').textContent=he.total+' מילים';
  $('#enCount').textContent=en.total+' מילים';
  $('#heProg').style.width=he.pct+'%';
  $('#enProg').style.width=en.pct+'%';
  $('#heProg').parentElement.title=`למדת ${he.learned} מתוך ${he.total}`;
  $('#enProg').parentElement.title=`למדת ${en.learned} מתוך ${en.total}`;

  const st=streakInfo();
  const learned=he.learned+en.learned, total=he.total+en.total;
  const seen=he.practised+en.practised;
  $('#dStreak').textContent=st.n;
  $('#dLearned').textContent=learned;
  $('#dSeen').textContent=seen;
  const pct=total?Math.round(100*learned/total):0;
  $('#dTotalLbl').textContent=`${learned} מתוך ${total} מילים — עברית ואנגלית יחד`;
  $('#dTotalPct').textContent=pct+'%';
  $('#dTotalBar').style.width=pct+'%';
  $('#dWeek').innerHTML=st.week.map(on=>`<i class="${on?'on':''}"></i>`).join('');
  $('#greetSub').textContent =
    st.n===0   ? 'מוכן לתרגל? בחר את השפה שתרצה לתרגל היום'
  : st.today   ? `כבר תרגלת היום — ${st.n} ימים רצוף. כל הכבוד.`
               : `${st.n} ימים רצוף. תרגול קצר היום שומר על הרצף.`;
  renderBuildTag();
  goto('welcome');
}
function enterLang(lang){
  if(!committed && session.size>0) commitSession();   // never lose an in-flight round
  if(lang!=='he' && lang!=='en') return;
  LANG=lang; LS.set('hw_lang',lang);
  loadLangState();
  migrateStores();
  pruneOrphans();
  buildBank();
  document.documentElement.lang = 'he';
  $('#homeTitle').textContent = lang==='en' ? 'פסיכומטרי — אנגלית' : 'פסיכומטרי — עברית';
  $('#homeSub').textContent   = lang==='en' ? 'English vocabulary · 10 יחידות' : 'המילון הרשמי · 10 יחידות';
  renderHome();
  goto('home');
  syncWithRemote(lang);   // fire-and-forget: pulls any progress from another device and merges it in
}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>enterLang(b.dataset.lang));
$('#switchLang').onclick=()=>{ if(!committed && session.size>0) commitSession(); renderWelcome(); };

/* ===== level test =====
   Estimates where the learner already knows the vocabulary, so the app can stop showing
   them words they mastered years ago. Result is advisory: nothing is marked as "learned"
   without the user explicitly agreeing on the result screen. */
const LV_BANDS=[['A1','בסיסי'],['A2','יסודי'],['B1','בינוני'],['B2','בינוני+'],['C1','מתקדם'],['C2','אקדמי']];
const LV_LABEL={A1:'רמה בסיסית',A2:'רמה יסודית',B1:'רמה בינונית',B2:'רמה בינונית-גבוהה',C1:'רמה מתקדמת',C2:'רמה אקדמית'};
/* ===== adaptive ladder =====
   The old test ran all 30 items and promoted on 60% per band — 3 of 5, where blind guessing
   already returns 25%. Two lucky guesses in a five-item band were enough to climb it, so the
   result drifted upward and topped out at C2 for people with real gaps.
   Now each band is a BLOCK of 6 items and promotion needs 5 of them. Guessing your way to
   5/6 on four-option items is a ~4% event, so a level has to be earned. We start in the
   middle and walk toward the edge that keeps failing, which also keeps the test short:
   a typical run is 12–18 items instead of a flat 30. */
const LV_ORDER=LV_BANDS.map(b=>b[0]);
const LV_BLOCK=6, LV_PASS=5, LV_START='B1';
let lvDeck=[], lvIdx=0, lvAns=[];
let lvBand=LV_START, lvBlock=[], lvBlockOk=0, lvPassed=null, lvFailedUp=false, lvSeen=new Set();

function levelDone(){ return LS.get('hw_level', null); }

function lvPool(band){
  const bank=Array.isArray(window.LEVEL_TEST)?window.LEVEL_TEST:[];
  return bank.filter(it=>it.band===band && !lvSeen.has(it.w));
}
function startLevelTest(){
  if(!lvPool(LV_START).length){ toast('מבחן הרמה לא נטען'); return; }
  lvAns=[]; lvSeen=new Set(); lvPassed=null; lvFailedUp=false; lvBand=LV_START;
  hide($('#lvIntro')); hide($('#lvResult')); show($('#lvQuiz'));
  goto('level'); lvLoadBlock();
}
/* Deal one band's block. Items are drawn fresh each run, so a retake isn't the same test. */
function lvLoadBlock(){
  lvBlock=shuffle(lvPool(lvBand)).slice(0,LV_BLOCK);
  lvBlock.forEach(it=>lvSeen.add(it.w));
  lvDeck=lvBlock.map(it=>({...it, opts: shuffle([it.a, ...it.d].slice())}));
  lvIdx=0; lvBlockOk=0;
  lvRender();
}
/* Where to go after a block: up while passing, down while failing, stop the moment the
   direction would reverse — that boundary IS the level. */
function lvNextBand(){
  const i=LV_ORDER.indexOf(lvBand);
  if(lvBlockOk>=LV_PASS){
    lvPassed=lvBand;
    if(lvFailedUp) return null;                 // already know the band above fails
    return LV_ORDER[i+1] || null;               // nothing above C2
  }
  lvFailedUp=true;
  if(lvPassed) return null;                     // found the ceiling from below
  return i>0 ? LV_ORDER[i-1] : null;            // still descending; A1 is the floor
}
function lvRender(){
  const it=lvDeck[lvIdx];
  if(!it){
    const nx=lvNextBand();
    if(nx){ lvBand=nx; lvLoadBlock(); return; }
    lvFinish(); return;
  }
  // total length isn't known up front, so show the block position and the band being probed
  $('#lvCount').textContent=`${lvBand} · ${lvIdx+1}/${lvDeck.length}`;
  $('#lvBar').style.width=(100*(lvAns.length)/(lvAns.length+lvDeck.length-lvIdx))+'%';
  $('#lvWord').textContent=it.w;
  bindSay('#lvSay', it.w, true);
  $('#lvOpts').innerHTML=it.opts.map((o,i)=>`<button data-i="${i}">${esc(o)}</button>`).join('');
  $('#lvOpts').querySelectorAll('button').forEach(b=>{
    b.onclick=()=>lvPick(it.opts[+b.dataset.i], b);
  });
  $('#lvDunno').disabled=false;
}
function lvPick(choice, btn){
  const it=lvDeck[lvIdx];
  const ok = choice===it.a;
  lvAns.push({band:it.band, ok}); if(ok) lvBlockOk++;
  // brief feedback so the test still teaches something
  $('#lvOpts').querySelectorAll('button').forEach(b=>{
    b.disabled=true;
    if(b.textContent===it.a) b.classList.add('right');
    else if(b===btn) b.classList.add('wrong');
  });
  $('#lvDunno').disabled=true;
  setTimeout(()=>{ lvIdx++; lvRender(); }, ok?320:900);
}
$('#lvDunno').onclick=()=>{
  const it=lvDeck[lvIdx]; if(!it) return;
  lvAns.push({band:it.band, ok:false});
  $('#lvOpts').querySelectorAll('button').forEach(b=>{ b.disabled=true; if(b.textContent===it.a) b.classList.add('right'); });
  $('#lvDunno').disabled=true;
  setTimeout(()=>{ lvIdx++; lvRender(); }, 900);
};

/* The level is the highest band that cleared 5/6 — nothing is inferred from bands we
   never reached, and nothing is credited to a band that only half-passed. */
function lvEstimate(){
  const per={};
  for(const [b] of LV_BANDS) per[b]={n:0,ok:0};
  lvAns.forEach(a=>{ if(per[a.band]){ per[a.band].n++; if(a.ok) per[a.band].ok++; } });
  let level=null;
  for(const [b] of LV_BANDS){ const p=per[b]; if(p.n && p.ok>=LV_PASS) level=b; }
  return {level, per};
}
function lvFinish(){
  const {level, per}=lvEstimate();
  // level===null means even the easiest block we reached wasn't cleared. Say so plainly
  // rather than handing out an A1 nobody earned.
  LS.set('hw_level', level||'A1'); queueRemoteSync();
  $('#lvBar').style.width='100%';
  $('#lvCount').textContent='';
  hide($('#lvQuiz')); show($('#lvResult'));
  $('#lvBadge').textContent=level||'A1−';
  $('#lvVerdict').textContent = level
    ? LV_LABEL[level]+' — הרמה הגבוהה ביותר שעברת בה 5 מתוך 6.'
    : 'נתחיל מהבסיס — זה בדיוק מה שהאפליקציה נועדה לסגור.';
  $('#lvBands').innerHTML=LV_BANDS.map(([b,name])=>{
    const p=per[b]||{n:0,ok:0};
    if(!p.n) return `<div class="lv-band" style="opacity:.42"><b>${b}</b><span class="lbl">${name}</span>
      <span class="bar"></span><span class="pc">לא נבדק</span></div>`;
    const pc=Math.round(100*p.ok/p.n);
    const mark=p.ok>=LV_PASS?' ✓':'';
    return `<div class="lv-band"><b>${b}</b><span class="lbl">${name}</span>
      <span class="bar"><i style="width:${pc}%"></i></span><span class="pc">${p.ok}/${p.n}${mark}</span></div>`;
  }).join('');

  // offer to skip words below the tested level — only with explicit consent.
  // hide() first: without it a previous run's offer stays on screen with a stale count.
  hide($('#lvOffer'));
  const skippable = lvCountKnown(level);
  if(skippable>=40){
    show($('#lvOffer'));
    $('#lvOfferText').innerHTML=`מצאתי <b>${skippable}</b> מילים באנגלית שברמה שלך כמעט בוודאי כבר מוכרות לך.
      אפשר לסמן אותן כמילים שלמדת, כדי שלא יופיעו ב"מילים חדשות" ותתחיל ישר במה שבאמת חסר לך.
      <br><span style="color:var(--ink-soft);font-size:.86rem">תמיד אפשר להחזיר אותן דרך ניהול מילים.</span>`;
    $('#lvApply').onclick=()=>{ const n=lvApplyKnown(level); hide($('#lvOffer')); toast(`${n} מילים סומנו כמוכרות`); };
    $('#lvNoApply').onclick=()=>hide($('#lvOffer'));
  }
}
/* Only English has frequency ranks, so the skip offer applies to the English bank.
   The cut sits TWO bands below where the learner tested. One band below was too greedy:
   a C2 result cleared 20000, which is every ranked word in the bank — the app offered to
   mark 3175 of 3694 words known off the back of a single test. Skipping should only ever
   cover words that are far easier than the ceiling that was actually demonstrated. */
const LV_CUT={A1:0, A2:0, B1:600, B2:2000, C1:5000, C2:10000};
function lvRankOf(term){ const m=window.EN_RANK; return m ? m[normEn(term)] : null; }
function lvCountKnown(level){
  const cut=LV_CUT[level]; if(!cut) return 0;
  const data=window.UNIT_DATA_EN||{}; let n=0;
  for(const u in data) for(const p of (data[u]||[])){
    const r=lvRankOf(p[0]); if(r && r<=cut) n++;
  }
  return n;
}
function lvApplyKnown(level){
  const cut=LV_CUT[level]; if(!cut) return 0;
  const wasLang=LANG;
  LANG='en'; loadLangState();
  const data=window.UNIT_DATA_EN||{}; let n=0;
  for(const u in data) for(const p of (data[u]||[])){
    const r=lvRankOf(p[0]); if(!(r && r<=cut)) continue;
    const k=normEn(p[0]); if(!k) continue;
    const rec=stats.words[k];
    if(rec && rec.level>=3) continue;                  // already known — leave as is
    stats.words[k]={seen:1,first:1,ever:1,wrong:0,level:3,last:Date.now()};
    n++;
  }
  saveStats();
  LANG=wasLang; loadLangState(); buildBank();
  return n;
}
$('#lvStart').onclick=startLevelTest;
const lvBtn=$('#lvOpen'); if(lvBtn) lvBtn.onclick=()=>{ hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); };
$('#lvSkip').onclick=()=>{ LS.set('hw_level','skipped'); renderWelcome(); };
$('#lvExit').onclick=()=>{ if(confirm('לצאת מהמבחן? התוצאות לא יישמרו.')) renderWelcome(); };
$('#lvDone').onclick=()=>renderWelcome();

/* ===== הקראה קולית =====
   Web Speech API — מובנה בדפדפן. אין תלות חוץ, אין קריאת רשת, ולכן ה-CSP לא נוגע בזה.
   מוקרא רק הצד האנגלי: הקראת עברית בקול אנגלי היא רעש, והקראת הפירוש בעברית תיתן
   ללומד את התשובה במקום לבחון אותה. */
const TTS = {
  ok: typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined',
  voice: null,
  // Voices load asynchronously and the first call often returns an empty list, so we look
  // again on the voiceschanged event instead of deciding once at boot.
  pick(){
    if(!this.ok) return null;
    let vs=[]; try{ vs=speechSynthesis.getVoices()||[]; }catch(e){ return null; }
    const en=vs.filter(v=>/^en(-|_|$)/i.test(v.lang||''));
    if(!en.length) return null;
    this.voice = en.find(v=>/^en-US/i.test(v.lang)) || en[0];
    return this.voice;
  },
  available(){ return !!(this.ok && (this.voice || this.pick())); },
  say(text, btn){
    if(!this.available() || !text) return false;
    try{
      speechSynthesis.cancel();                       // never let two words overlap
      const u=new SpeechSynthesisUtterance(String(text));
      u.voice=this.voice; u.lang=this.voice.lang || 'en-US';
      u.rate=0.9;                                     // a touch slow: this is for learning
      if(btn){ btn.classList.add('on');
        const off=()=>btn.classList.remove('on');
        u.onend=off; u.onerror=off; }
      speechSynthesis.speak(u);
      return true;
    }catch(e){ if(btn) btn.classList.remove('on'); return false; }
  }
};
/* Wire one speaker button to whatever English text is on screen. Hidden — not disabled —
   when the device has no English voice, because a button that does nothing is worse than
   no button.
   alwaysEn: the level test is an English test whatever language the app is currently in,
   so it must not be gated on LANG. */
const sayBound = new Map();
function bindSay(btnSel, text, alwaysEn){
  const btn=$(btnSel); if(!btn) return;
  sayBound.set(btnSel, [text, alwaysEn]);
  const speakable = (alwaysEn || LANG==='en') && text && TTS.available();
  btn.classList.toggle('hidden', !speakable);
  if(speakable) btn.onclick=(e)=>{ e.preventDefault(); TTS.say(text, btn); };
  else btn.onclick=null;
}
/* Voices arrive asynchronously and often after the first card is already on screen. Without
   replaying the last binding, the speaker would stay hidden until the user advanced a card. */
if(TTS.ok){
  try{
    TTS.pick();
    speechSynthesis.onvoiceschanged=()=>{
      const had=!!TTS.voice; TTS.voice=null;
      if(TTS.pick() && !had) sayBound.forEach((v,sel)=>bindSay(sel, v[0], v[1]));
    };
  }catch(e){}
}

/* ===== unit exams =====
   A measurement, not a practice round: the exam samples the unit at random and NEVER writes
   to word levels or the session log. If taking a test moved your progress bars, the bars would
   stop meaning "what I learned" and the score would stop being an independent read on it.

   Items are generated from the unit itself rather than hand-authored per unit. That is the
   whole reason the test can be trusted: a word can't repeat inside a sheet, an answer can't
   contradict the bank it came from, and every unit in both languages gets the same rigour
   without twenty hand-written files drifting out of sync with the data.

   Three sections, because one format only measures one kind of recall:
     recognise  — word → meaning, 4 options
     retrieve   — meaning → word, 4 options
     produce    — meaning → write the word yourself (no options to lean on) */
const EX_LEN=20, EX_MIX=[0.4,0.3,0.3];
let exQ=[], exI=0, exUnit=null, exAns=[];

/* Not every dictionary entry can be a test item. Some entries are fine to learn from and
   impossible to test: sentence templates ("either... or..."), and glosses that are a bare
   grammatical prefix — than, from and of are all "מ-" in the bank, so no option list built
   from them has one right answer. They stay in the practice bank and stay out of exams. */
function exTestable(term, meaning){
  if(/\.\.\.|…/.test(term) || /\.\.\.|…/.test(meaning)) return false;
  if(/^[א-ת]{1,2}-?$/.test(meaning)) return false;         // מ- · ש- · ו-
  if(meaning.replace(/[^א-ת]/g,'').length < 3) return false;
  return true;
}
/* Loan words are glossed by transliteration — drastic/דרסטי, organic/אורגני, strategy/אסטרטגיה.
   As a multiple-choice option that is fine. As a write-in prompt it hands over the answer:
   you sound out the Hebrew and spell it back without knowing the word at all.
   Rough transliteration + consonant overlap is enough to catch these; it only ever decides
   whether an item goes in a write-in slot, so a false positive costs nothing. */
const TRL={א:'a',ב:'b',ג:'g',ד:'d',ה:'h',ו:'v',ז:'z',ח:'h',ט:'t',י:'i',כ:'k',ך:'k',ל:'l',
  מ:'m',ם:'m',נ:'n',ן:'n',ס:'s',ע:'a',פ:'p',ף:'f',צ:'c',ץ:'c',ק:'k',ר:'r',ש:'s',ת:'t'};
const skel = s => String(s).toLowerCase().replace(/[aeiouhwy'’\- ]/g,'');
function isTranslit(meaning, term){
  if(LANG!=='en') return false;
  const heb=String(meaning).replace(/[^א-ת]/g,'');
  if(heb.length<4) return false;
  const a=skel([...heb].map(c=>TRL[c]||'').join('')), b=skel(term);
  if(!a.length || !b.length) return false;
  let hits=0, i=0;
  for(const c of b){ const j=a.indexOf(c,i); if(j>=0){ hits++; i=j+1; } }
  return hits/b.length >= 0.7;      // most of the English consonants appear, in order
}
function exWords(uid){
  const data=(LANG==='en'?window.UNIT_DATA_EN:window.UNIT_DATA)||{};
  const rows=Array.isArray(data[uid])?data[uid]:[];
  const nk=LANG==='en'?normEn:norm;
  const seen=new Set(), out=[];
  for(const p of rows){
    if(!Array.isArray(p)||!p[0]||!p[1]) continue;
    const term=String(p[0]).trim(), meaning=String(p[1]).trim();
    const k=nk(term); if(!k || seen.has(k) || deleted.has(k)) continue;
    if(!exTestable(term, meaning)) continue;
    seen.add(k); out.push({term, meaning, k});
  }
  return out;
}
/* Distractors come from the same unit, so difficulty is uniform and a wrong option can never
   be "obviously from somewhere else". Anything that overlaps the real answer is discarded —
   two options that are both defensible make the item unanswerable, not hard. */
function exDistract(pool, item, field, taken){
  const right=item[field], rn=norm(right);
  // A candidate must differ from the item on BOTH fields, not just the one being shown.
  // Comparing only the displayed field was a real hole: the unit lists אביון, חלכאי, מך and רש
  // with the same gloss, so a "which word means עני" item happily offered all four - four
  // correct answers, and the learner is marked wrong for knowing three of them.
  const other = field==='term' ? 'meaning' : 'term';
  const on=norm(item[other]);
  const clash=(a,b)=> a===b || a.includes(b) || b.includes(a);
  const usable=o=>{
    if(o.k===item.k) return false;
    const v=o[field]; if(!v) return false;
    if(clash(norm(v), rn)) return false;
    const w=o[other];
    return !(w && clash(norm(w), on));
  };
  // Prefer distractors that aren't another item's answer — reusing one hands out that item's
  // solution a question early. In a unit small enough that the paper covers most of it there
  // is nothing else to draw on, so relax rather than fail to build the question at all.
  let ok=pool.filter(o=>usable(o) && !taken.has(norm(o[field])));
  if(ok.length<3) ok=pool.filter(usable);
  // Two distractors that differ only in vowel points or punctuation read as the same option
  // twice, which quietly turns a four-way question into a three-way one.
  const used=new Set([rn]), out=[];
  for(const o of shuffle(ok)){
    const vn=norm(o[field]); if(used.has(vn)) continue;
    used.add(vn); out.push(o[field]);
    if(out.length===3) break;
  }
  return out;
}
function exBuild(uid){
  const pool=exWords(uid);
  if(pool.length<8) return [];
  const n=Math.min(EX_LEN, pool.length);
  // Keep morphological relatives out of the same paper. "evaluate" and "evaluation" are two
  // distinct entries, so nothing here counts them as a duplicate — but sitting side by side
  // they cue each other and burn a slot that could have tested a different word.
  // English only: the terms are ASCII lemmas, so a shared prefix is a reliable signal.
  // Hebrew relatives share a root with letters scattered through the word, which a prefix
  // test would either miss or fire on unrelated pairs.
  const related=(a,b)=>{
    if(LANG!=='en') return false;
    const x=normEn(a), y=normEn(b); let i=0;
    while(i<x.length && i<y.length && x[i]===y[i]) i++;
    return i>=5;
  };
  let picked=[];
  for(const c of shuffle(pool)){
    if(picked.length>=n) break;
    if(picked.some(p=>related(p.term,c.term))) continue;
    picked.push(c);
  }
  if(picked.length<n) picked=shuffle(pool).slice(0,n);   // tiny unit — coverage beats polish
  const nRec=Math.round(n*EX_MIX[0]), nRet=Math.round(n*EX_MIX[1]);
  // Write-in items ask for the word with no options to lean on, so put the single-word terms
  // in those slots. Expecting someone to type a three-word idiom letter-perfect measures
  // typing, not vocabulary.
  const oneWord=t=>!/\s/.test(String(t).replace(/\s*\/\s*/g,'/'));
  const goodProduce=it=>oneWord(it.term) && !isTranslit(it.meaning, it.term);
  picked.sort((a,b)=>(goodProduce(a)?1:0)-(goodProduce(b)?1:0));
  // Every answer in the paper, so no distractor can leak one.
  const taken=new Set(picked.map(it=>norm(it.term)).concat(picked.map(it=>norm(it.meaning))));
  return picked.map((it,i)=>{
    const kind = i<nRec ? 'recognise' : i<nRec+nRet ? 'retrieve' : 'produce';
    if(kind==='recognise'){
      const d=exDistract(pool,it,'meaning',taken);
      return d.length<3 ? null : {kind, it, prompt:it.term, answer:it.meaning, opts:shuffle([it.meaning,...d])};
    }
    if(kind==='retrieve'){
      const d=exDistract(pool,it,'term',taken);
      return d.length<3 ? null : {kind, it, prompt:it.meaning, answer:it.term, opts:shuffle([it.term,...d])};
    }
    // A write-in has no options to disambiguate it, so if two words in the unit share a gloss
    // the prompt genuinely has two right answers — the unit lists both זלזל and פארה as "ענף".
    // Accept all of them. Marking someone wrong for the synonym they happened to recall is the
    // exact failure this whole audit was about.
    const accept=pool.filter(o=>norm(o.meaning)===norm(it.meaning)).map(o=>o.term);
    return {kind, it, prompt:it.meaning, answer:it.term, opts:null, accept};
  }).filter(Boolean);
}
const EX_KIND={recognise:'מה הפירוש?', retrieve:'איזו מילה מתאימה לפירוש?', produce:'כתוב את המילה'};
const exKey = uid => 'hw_exam'+(LANG==='en'?'_en':'')+':'+uid;

function openExam(uid){
  exUnit=uid;
  const pool=exWords(uid);
  $('#exTitle').textContent='יחידה '+uid;
  if(pool.length<8){
    $('#exSub').textContent='ביחידה הזאת פחות מ-8 מילים — אין ממה לבנות מבחן אמיתי.';
    $('#exParts').innerHTML=''; $('#exStart').disabled=true;
  }else{
    const n=Math.min(EX_LEN,pool.length);
    const nRec=Math.round(n*EX_MIX[0]), nRet=Math.round(n*EX_MIX[1]);
    $('#exSub').textContent=`${n} שאלות מתוך ${pool.length} מילים ביחידה, בהגרלה חדשה בכל פעם. `+
      `המבחן לא משנה את ההתקדמות שלך — הוא רק מודד אותה.`;
    $('#exParts').innerHTML=
      `<div class="ex-part"><b>${nRec}</b><span>זיהוי — מילה ← פירוש, ארבע אפשרויות</span></div>
       <div class="ex-part"><b>${nRet}</b><span>שליפה — פירוש ← מילה, ארבע אפשרויות</span></div>
       <div class="ex-part"><b>${n-nRec-nRet}</b><span>כתיבה — פירוש ← לכתוב את המילה בעצמך</span></div>`;
    $('#exStart').disabled=false;
  }
  const hist=LS.get(exKey(uid),[]);
  const last=Array.isArray(hist)&&hist.length?hist[hist.length-1]:null;
  const best=Array.isArray(hist)&&hist.length?Math.max(...hist.map(h=>int0(h.pct))):null;
  $('#exKicker').textContent = last
    ? `מבחן יחידה · אחרון ${last.pct}% · שיא ${best}%` : 'מבחן יחידה';
  hide($('#exQuiz')); hide($('#exResult')); show($('#exIntro'));
  goto('exam');
}
function startExam(){
  exQ=exBuild(exUnit); exI=0; exAns=[];
  if(!exQ.length){ toast('לא הצלחתי לבנות מבחן ליחידה הזאת'); return; }
  hide($('#exIntro')); hide($('#exResult')); show($('#exQuiz'));
  exRender();
}
function exRender(){
  const q=exQ[exI];
  if(!q){ exFinish(); return; }
  $('#exCount').textContent=`${exI+1} / ${exQ.length}`;
  $('#exBar').style.width=(100*exI/exQ.length)+'%';
  $('#exKind').textContent=EX_KIND[q.kind];
  const promptIsEn = LANG==='en' && q.kind==='recognise';
  $('#exPrompt').textContent=q.prompt;
  $('#exPrompt').dir = promptIsEn ? 'ltr' : 'rtl';
  // Only when the English word is the prompt. On retrieve/produce items it is the answer,
  // and reading it aloud would hand the question over.
  bindSay('#exSay', promptIsEn ? q.prompt : null);
  hide($('#exFb'));
  if(q.opts){
    show($('#exOpts')); hide($('#exWrite'));
    const ltr = LANG==='en' && q.kind==='retrieve';
    $('#exOpts').innerHTML=q.opts.map((o,i)=>`<button data-i="${i}"${ltr?' dir="ltr"':''}>${esc(o)}</button>`).join('');
    $('#exOpts').querySelectorAll('button').forEach(b=>{
      b.onclick=()=>exAnswer(q.opts[+b.dataset.i]===q.answer, q.opts[+b.dataset.i], b);
    });
  }else{
    hide($('#exOpts')); show($('#exWrite'));
    const inp=$('#exInput');
    inp.value=''; inp.disabled=false; inp.dir = LANG==='en' ? 'ltr' : 'rtl';
    $('#exSubmit').disabled=false; $('#exSkip').disabled=false;
    inp.focus();
  }
}
function exAnswer(ok, given, btn){
  const q=exQ[exI];
  exAns.push({kind:q.kind, ok, term:q.it.term, meaning:q.it.meaning, given:given||''});
  if(q.opts){
    $('#exOpts').querySelectorAll('button').forEach(b=>{
      b.disabled=true;
      if(b.textContent===q.answer) b.classList.add('right');
      else if(b===btn) b.classList.add('wrong');
    });
  }else{
    $('#exInput').disabled=true; $('#exSubmit').disabled=true; $('#exSkip').disabled=true;
  }
  bindSay('#exSay', q.it.term);
  const fb=$('#exFb');
  const alts = (q.accept||[]).filter(t=>t!==q.answer);
  fb.innerHTML=`<div class="v ${ok?'ok':'no'}">${ok?'נכון ✓':'לא נכון'}</div>`+
    (ok
      ? (alts.length?`<div class="rv">גם ${alts.map(t=>'<b>'+esc(t)+'</b>').join(' וגם ')} נכון כאן</div>`:'')
      : `<div class="rv">התשובה: <b>${esc(q.answer)}</b>`+
        (alts.length?` (גם ${alts.map(esc).join(', ')})`:'')+`</div>`);
  show(fb);
  setTimeout(()=>{ exI++; exRender(); }, ok?420:1100);
}
/* any word in the unit that carries this exact gloss counts */
function exWriteOk(v, q){
  const list = (q.accept && q.accept.length) ? q.accept : [q.answer];
  return list.some(t=>isCorrect(v, t));
}
$('#exSubmit').onclick=()=>{ const q=exQ[exI]; if(!q||$('#exInput').disabled) return;
  const v=$('#exInput').value; exAnswer(exWriteOk(v, q), v); };
$('#exInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#exSubmit').click(); } });
$('#exSkip').onclick=()=>{ const q=exQ[exI]; if(!q||$('#exInput').disabled) return; exAnswer(false,''); };

const EX_GRADE=[[90,'שליטה מלאה ביחידה'],[75,'שליטה טובה, נשארו פינות'],[60,'בסיס קיים, צריך חזרה'],[40,'חצי הדרך — כדאי לתרגל את היחידה'],[0,'היחידה עוד לא נלמדה באמת']];
function exFinish(){
  const n=exAns.length, ok=exAns.filter(a=>a.ok).length;
  const pct=n?Math.round(100*ok/n):0;
  $('#exBar').style.width='100%'; $('#exCount').textContent='';
  hide($('#exQuiz')); show($('#exResult'));
  $('#exScore').textContent=pct+'%';
  $('#exVerdict').textContent=`${ok} מתוך ${n} — ${(EX_GRADE.find(g=>pct>=g[0])||EX_GRADE[EX_GRADE.length-1])[1]}`;
  const per={recognise:[0,0], retrieve:[0,0], produce:[0,0]};
  exAns.forEach(a=>{ const p=per[a.kind]; if(!p) return; p[1]++; if(a.ok) p[0]++; });
  const NAMES={recognise:'זיהוי (מילה ← פירוש)', retrieve:'שליפה (פירוש ← מילה)', produce:'כתיבה עצמאית'};
  $('#exBreak').innerHTML=Object.keys(per).filter(k=>per[k][1]).map(k=>
    `<div class="ex-row"><span class="nm">${NAMES[k]}</span><span class="sc">${per[k][0]}/${per[k][1]}</span></div>`).join('');
  const missed=exAns.filter(a=>!a.ok);
  $('#exMissed').innerHTML = missed.length
    ? missed.map(a=>`<div class="ex-miss"><b>${esc(a.term)}</b> — ${esc(a.meaning)}`+
        (a.given?`<div class="yours">כתבת: ${esc(a.given)}</div>`:'')+`</div>`).join('')
    : '<div class="ex-miss">ידעת את כל המילים במבחן הזה. 🎯</div>';
  // history is capped: a score log that grows without bound is the kind of thing that
  // silently eats the localStorage quota months later
  const hist=LS.get(exKey(exUnit),[]);
  const arr=(Array.isArray(hist)?hist:[]).concat([{t:Date.now(), pct, n}]).slice(-20);
  LS.set(exKey(exUnit), arr);
  const missedKeys=missed.map(a=>a.term);
  $('#exPractice').disabled=!missedKeys.length;
  $('#exPractice').onclick=()=>{
    const set=new Set(missedKeys.map(t=>K(t)));
    const cards=BANK.filter(w=>set.has(K(w.term)));
    if(!cards.length){ toast('אין מה לתרגל'); return; }
    startRound(shuffle(cards), 'unit:'+exUnit, 'exam');
  };
}
$('#exStart').onclick=startExam;
$('#exAgain').onclick=()=>openExam(exUnit);
$('#exCancel').onclick=()=>openScope('unit:'+exUnit);
$('#exDone').onclick=()=>openScope('unit:'+exUnit);
$('#exExit').onclick=()=>{ if(!exAns.length || confirm('לצאת מהמבחן? התוצאה לא תישמר.')) openScope('unit:'+exUnit); };

/* ===== printable sheet =====
   No PDF library: the CSP allows scripts from this origin only, and pulling in a bundler-sized
   dependency to draw text on a page would be the wrong trade anyway. The browser's own
   "print → save as PDF" produces a better sheet, works on every platform, and prints directly. */
/* The footer claims rights in what we actually made — the sheet, its layout and the app —
   and grants personal/classroom use. It deliberately does NOT claim ownership of the
   vocabulary itself: the word lists came from published psychometric material, and an
   "all rights reserved" over someone else's content is both false and the kind of claim
   that invites the wrong letter. See the note in משימות.md. */
const SHEET_YEAR = new Date().getFullYear();
const SHEET_RIGHTS = `© ${SHEET_YEAR} · עיצוב הדף והאפליקציה — כל הזכויות שמורות · `+
  `מותר לשימוש אישי ולימודי · אין למכור או להפיץ בתשלום`;

/* size=0 means the whole unit. A full English unit is ~380 words, which is a real worksheet
   rather than a quiz, so those sheets go two-up: the answer is a single short word and two
   columns halve the page count. Hebrew sheets stay single-column — you cannot write a
   definition on half a line. */
function buildSheet(uid, size){
  const pool=exWords(uid);
  // clear first: a refusal must not leave the previous unit's sheet sitting in the DOM
  $('#sheet').innerHTML='';
  if(pool.length<8) return false;
  const n = size ? Math.min(size, pool.length) : pool.length;
  const items=shuffle(pool).slice(0,n);
  const langName=LANG==='en'?'אנגלית':'עברית';
  const ltr=LANG==='en'?' ltr':'';
  const d=new Date();
  const date=`${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
  // Hebrew unit: the word is given and the definition is written. English unit: the Hebrew
  // meaning is given and the English word is written — matching how each side is actually tested.
  const askTerm = LANG!=='en';
  const q = it => askTerm ? it.term : it.meaning;
  const a = it => askTerm ? it.meaning : it.term;
  $('#sheet').innerHTML=`
    <div class="sh-page">
      <h1>מבחן אוצר מילים — ${langName}, יחידה ${uid}</h1>
      <div class="sh-meta">${n===pool.length?`כל ${n} מילות היחידה`:`${n} מילים מתוך ${pool.length}`} · ${date} · אוצר מילים לפסיכומטרי</div>
      <div class="sh-fill"><span>שם:</span><span>תאריך:</span><span>ציון: ____ / ${n}</span></div>
      <div class="sh-inst">${askTerm
        ? 'כתוב את הפירוש של כל מילה. תשובה חלקית שמעבירה את המשמעות — נקודה מלאה.'
        : 'כתוב את המילה באנגלית שמתאימה לפירוש. איות מדויק נדרש.'}</div>
      <ol${askTerm?'':' class="two"'}>${items.map(it=>`<li><span class="sh-q${askTerm?ltr:''}">${esc(q(it))}</span>
        <span class="sh-line"></span></li>`).join('')}</ol>
      <div class="sh-foot">דף הפתרונות בסוף<br>${SHEET_RIGHTS}</div>
    </div>
    <div class="sh-page">
      <h1>דף פתרונות — ${langName}, יחידה ${uid}</h1>
      <div class="sh-meta">אותה הגרלה, אותו סדר · ${n} מילים</div>
      <div class="sh-key">${items.map((it,i)=>
        `<div>${i+1}. <b${askTerm?ltr:''}>${esc(q(it))}</b> — ${esc(a(it))}</div>`).join('')}</div>
      <div class="sh-foot">${SHEET_RIGHTS}</div>
    </div>`;
  return true;
}
const SHEET_SIZES=[25,50,100,0];      // 0 = the whole unit
function printSheet(uid){
  const total=exWords(uid).length;
  if(total<8){ toast('ביחידה הזאת אין מספיק מילים לדף מבחן'); return; }
  const opts=SHEET_SIZES.filter(n=>!n || n<total);
  $('#sheetOpts').innerHTML=opts.map(n=>
    `<button data-n="${n}">${n||'כל היחידה · '+total}</button>`).join('');
  $('#sheetAskSub').textContent=`ביחידה ${total} מילים. הדף נפתח בחלון ההדפסה — משם אפשר להדפיס או לשמור כ-PDF.`;
  sheetUid=uid;
  show($('#sheetAsk'));
}
let sheetUid=null;
$('#sheetOpts').onclick=e=>{
  const b=e.target.closest('button[data-n]'); if(!b||!sheetUid) return;
  const uid=sheetUid, n=+b.dataset.n;
  hide($('#sheetAsk')); sheetUid=null;
  if(!buildSheet(uid,n)){ toast('לא הצלחתי לבנות את הדף'); return; }
  // give the browser a frame to lay the sheet out before it snapshots the page
  setTimeout(()=>{ try{ window.print(); }catch(e){ toast('ההדפסה לא נפתחה'); } }, 80);
};
$('#sheetCancel').onclick=()=>{ sheetUid=null; hide($('#sheetAsk')); };
$('#sheetAsk').onclick=e=>{ if(e.target===$('#sheetAsk')){ sheetUid=null; hide($('#sheetAsk')); } };

/* ===== account — every screen above this line requires a signed-in user =====
   This is the ONLY place app.js touches Store; everything else stays pure UI. */
let currentUser=null, syncTimer=null;

let syncPending=false;
function flushRemoteSync(){
  if(!currentUser || !syncPending) return;
  syncPending=false; clearTimeout(syncTimer);
  Store.pushProgress(LANG, {assoc, stats, deleted:[...deleted], added, dir:direction}).catch(()=>{});
}
function queueRemoteSync(){
  if(!currentUser) return;
  syncPending=true;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(flushRemoteSync, 1500);
}
// A debounced save that never fires is a save the user lost. Flush before the page goes away.
window.addEventListener('pagehide', flushRemoteSync);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushRemoteSync(); });

/* Merge is max-based, never subtractive — the same rule migrateStores already uses — so a
   sync race between two devices can only make progress look better than it is, never erase it. */
function mergeProgress(local, remote){
  if(!remote || !isObj(remote)) return local;
  const words={};
  const lw=isObj(local.stats)&&isObj(local.stats.words)?local.stats.words:{};
  const rw=isObj(remote.stats)&&isObj(remote.stats.words)?remote.stats.words:{};
  for(const k of new Set([...Object.keys(lw),...Object.keys(rw)])){
    const a=saneRec(lw[k]), b=saneRec(rw[k]);
    words[k]={ seen:Math.max(a.seen,b.seen), first:Math.max(a.first,b.first), ever:Math.max(a.ever,b.ever),
               wrong:Math.max(a.wrong,b.wrong), level:Math.max(a.level,b.level), last:Math.max(a.last,b.last) };
  }
  const ls=Array.isArray(local.stats&&local.stats.sessions)?local.stats.sessions:[];
  const rs=Array.isArray(remote.stats&&remote.stats.sessions)?remote.stats.sessions:[];
  const sessions=[...rs,...ls].filter(isObj).slice(-MAX_SESSIONS);
  const mergedAssoc={...(isObj(remote.assoc)?remote.assoc:{}), ...(isObj(local.assoc)?local.assoc:{})};
  const mergedDeleted=[...new Set([...(Array.isArray(remote.deleted)?remote.deleted:[]),
                                    ...(Array.isArray(local.deleted)?local.deleted:[])])];
  const seenAdd=new Set(); const mergedAdded=[];
  for(const p of [...(Array.isArray(local.added)?local.added:[]), ...(Array.isArray(remote.added)?remote.added:[])]){
    if(!Array.isArray(p)||!p[0]) continue; const k=K(p[0]); if(seenAdd.has(k)) continue; seenAdd.add(k); mergedAdded.push(p);
  }
  return { assoc:mergedAssoc, stats:{words,sessions}, deleted:mergedDeleted, added:mergedAdded,
           dir: local.dir || remote.dir || 'm2w' };
}

async function syncWithRemote(lang){
  if(!currentUser || !window.Store) return;
  let remote=null;
  try{ remote=await Store.pullProgress(lang); }catch(e){ return; }     // offline — keep working locally
  if(remote && lang===LANG){
    const before = added.length;
    const merged=mergeProgress({assoc,stats,deleted:[...deleted],added,dir:direction}, remote);
    assoc=merged.assoc; stats=merged.stats; deleted=new Set(merged.deleted); added=merged.added; direction=merged.dir;
    saveAssoc(); saveStats(); saveDeleted(); saveAdded(); LS.set(KEY('hw_dir'),direction);
    buildBank(); renderDirSegs(); renderHome();
    if(added.length>before) toast('התקדמות ממכשיר אחר צורפה');
  }
  Store.pushProgress(lang, {assoc, stats, deleted:[...deleted], added, dir:direction}).catch(()=>{});
}

function translateAuthError(err){
  const m=(err&&err.message)||'';
  if(/already registered|already exists/i.test(m)) return 'כבר יש חשבון עם המייל הזה — נסה להתחבר.';
  if(/invalid login credentials/i.test(m)) return 'אימייל או סיסמה שגויים.';
  if(/password.*(least|short|weak)/i.test(m)) return 'הסיסמה חייבת להיות לפחות 8 תווים.';
  if(/email.*invalid/i.test(m)) return 'כתובת אימייל לא תקינה.';
  if(/rate limit|too many/i.test(m)) return 'המערכת עמוסה כרגע — נסה שוב בעוד כמה דקות.';
  if(/confirm|not confirmed/i.test(m)) return 'צריך לאשר את מייל האימות לפני ההתחברות.';
  return 'משהו השתבש. בדוק את החיבור לרשת ונסה שוב.';
}

/* ===== build identity =====
   Two numbers can disagree: the build this page loaded, and the build sitting on the server.
   Showing both turns "is it deployed?" from a guess into something you can read. */
const BUILD = (()=>{
  const s=(document.querySelector('script[src*="app.js"]')||{}).src||'';
  return (s.match(/[?&]v=(\d+)/)||[])[1] || '?';
})();

async function serverBuild(){
  // cache:'no-store' — asking the network, not the copy this device already holds
  try{
    const r=await fetch('index.html?probe='+Date.now(), {cache:'no-store'});
    if(!r.ok) return null;
    const html=await r.text();
    return (html.match(/app\.js\?v=(\d+)/)||[])[1] || null;
  }catch(e){ return null; }   // offline: leave it unknown rather than claim it matches
}

async function renderBuildTag(){
  const el=$('#buildTag'); if(!el) return;
  el.innerHTML=`גרסה <b>${BUILD}</b>`;
  const sv=await serverBuild();
  if(!sv) return;                                   // offline — say nothing rather than guess
  if(sv===BUILD) el.innerHTML=`גרסה <b>${BUILD}</b> · מסונכרן ✓`;
  else el.innerHTML=`גרסה <b>${BUILD}</b> · <span class="stale">יש גרסה ${sv} — רענן</span>`;
}

/* ===== bug reports =====
   A report without context is unusable, so the screen / language / build / device are captured
   automatically. If the feedback table isn't created yet, fall back to email rather than
   silently swallowing what the user just wrote. */
const FB_TO='03hagay@gmail.com';
let fbKind='bug';

function currentScreenId(){
  for(const s of SCREENS){ const el=$('#'+s); if(el && !el.classList.contains('hidden')) return s; }
  return 'unknown';
}
function fbContext(){
  const v=(document.querySelector('script[src*="app.js"]')||{}).src||'';
  return {
    screen: currentScreenId(),
    lang: LANG||'—',
    build: (v.match(/v=(\d+)/)||[])[1] || '?',
    level: LS.get('hw_level',null),
    standalone: isStandalone(),
    viewport: innerWidth+'×'+innerHeight,
    ua: navigator.userAgent.slice(0,160)
  };
}
function openFeedback(){
  fbKind='bug';
  $('#fbKinds').querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.k==='bug'));
  $('#fbBody').value='';
  $('#fbMsg').classList.add('hidden');
  const c=fbContext();
  $('#fbCtx').textContent=`screen:${c.screen} · lang:${c.lang} · build:${c.build} · ${c.viewport}`;
  show($('#fbAsk'));
  setTimeout(()=>$('#fbBody').focus(),60);
}
function closeFeedback(){ hide($('#fbAsk')); }
$('#fbFab').onclick=openFeedback;
$('#fbCancel').onclick=closeFeedback;
$('#fbAsk').onclick=e=>{ if(e.target===$('#fbAsk')) closeFeedback(); };
$('#fbKinds').onclick=e=>{
  const b=e.target.closest('button[data-k]'); if(!b) return;
  fbKind=b.dataset.k;
  $('#fbKinds').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
};
function fbMailto(body,ctx){
  const subj=`[milim/${fbKind}] דיווח מהאפליקציה`;
  const lines=[body,'','— הקשר אוטומטי —',...Object.entries(ctx).map(([k,v])=>`${k}: ${v}`)];
  location.href=`mailto:${FB_TO}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
$('#fbSend').onclick=async ()=>{
  const body=$('#fbBody').value.trim();
  const msg=$('#fbMsg'); msg.classList.remove('hidden'); msg.className='msg';
  if(body.length<5){ msg.className='msg err'; msg.textContent='כתוב עוד משפט אחד כדי שנבין מה קרה.'; return; }
  const btn=$('#fbSend'); btn.disabled=true; msg.textContent='שולח…';
  const ctx=fbContext();
  try{
    const r=await Store.sendFeedback(fbKind, body, ctx);
    if(r.ok){ closeFeedback(); toast('תודה! הדיווח נשלח'); return; }
    if(r.missingTable){ msg.className='msg'; msg.textContent='נפתח לך מייל עם הדיווח — רק לשלוח.'; fbMailto(body,ctx); return; }
    msg.className='msg err'; msg.textContent='השליחה נכשלה. פותח מייל במקום…'; fbMailto(body,ctx);
  }catch(e){
    msg.className='msg err'; msg.textContent='אין חיבור. פותח מייל במקום…'; fbMailto(body,ctx);
  } finally { btn.disabled=false; }
};

/* Drifting words behind the sign-in screen: real entries from the bank, so the door already
   shows what is inside. Built once, from whichever banks happen to be loaded. */
function buildAuthDrift(){
  const host=$('#auDrift'); if(!host || host.childElementCount) return;
  const pick=[];
  for(const data of [window.UNIT_DATA, window.UNIT_DATA_EN]){
    if(!data) continue;
    const units=Object.keys(data).filter(u=>u!=='custom');   // never show one user's private words
    for(let i=0;i<11;i++){
      const u=units[Math.floor(Math.random()*units.length)];
      const rows=data[u]||[];
      if(!rows.length) continue;
      const t=rows[Math.floor(Math.random()*rows.length)][0];
      if(t && t.length<=18) pick.push(t);
    }
  }
  shuffle(pick);
  host.innerHTML=pick.slice(0,11).map((w,i)=>
    `<b style="inset-inline-start:${4+i*8.6}%;font-size:${(0.85+((i*7)%5)*0.19).toFixed(2)}rem;`+
    `animation-duration:${20+((i*11)%16)}s;animation-delay:-${((i*3.1)%23).toFixed(1)}s">${esc(w)}</b>`
  ).join('');
}

let authMode='signin';   // signing in is the common case; the sign-up tab is styled to stay findable
function setAuthMode(m, keepMsg){
  authMode=m;
  document.querySelectorAll('#authTabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===m));
  $('#fUsername').classList.toggle('hidden', m!=='signup');
  $('#authSubmit').innerHTML = (m==='signup' ? 'צור חשבון' : 'התחבר') + '<i>←</i>';
  $('#authSubmit').classList.toggle('bright', m==='signup');
  $('#authPassword').autocomplete = m==='signup' ? 'new-password' : 'current-password';
  if(!keepMsg) $('#authMsg').classList.add('hidden');   // keepMsg: don't wipe a message we just wrote
}
document.querySelectorAll('#authTabs button').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.tab));

/* The local cache belongs to exactly one account. A session can end without a click on
   "יציאה" (token expiry, cleared cookies, shared device) — and then the next person to sign
   in here would have the previous user's progress merged into THEIR account. So the cache is
   stamped with its owner, and any mismatch wipes it before a single byte is read. */
const HW_KEYS = ['hw_assoc','hw_stats','hw_deleted','hw_added','hw_dir','hw_migr','hw_size',
                 'hw_assoc_en','hw_stats_en','hw_deleted_en','hw_added_en','hw_dir_en','hw_migr_en','hw_size_en','hw_lang',
                 'hw_name','hw_level'];
function bindCacheToUser(uid){
  const owner = LS.get('hw_owner', null);
  if(owner && owner !== uid){
    HW_KEYS.forEach(k=>LS.del(k));
    assoc={}; stats={words:{},sessions:[]}; deleted=new Set(); added=[]; direction='m2w'; LANG=null;
  }
  LS.set('hw_owner', uid);
}

async function afterAuthed(justSignedUp){
  bindCacheToUser(currentUser.id);
  try{
    const p=await Store.myProfile();
    const nm = (p && p.username) || (currentUser.email||'').split('@')[0];
    $('#userBadge').textContent = p ? p.username : (currentUser.email||'');
    LS.set('hw_name', nm);            // the dashboard greets by name before any network call returns
  }
  catch(e){ $('#userBadge').textContent = currentUser.email||''; }
  await showAdminIfAllowed();
  show($('#fbFab'));            // reporting a bug must never be more than one tap away
  // First run: offer the level test once. Everything else lands on the language picker.
  if(!levelDone()){ hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); }
  else renderWelcome();
  // With email confirmation on, sign-up never yields a session — so the install offer has to
  // ride on the first successful sign-in, not on the sign-up call.
  if(justSignedUp || !LS.get('hw_instOffered',0)){ LS.set('hw_instOffered',1); setTimeout(()=>promptInstall(false),600); }
}

$('#authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('#authEmail').value.trim(), pw=$('#authPassword').value, uname=$('#authUsername').value.trim();
  const msg=$('#authMsg'); msg.classList.remove('hidden'); msg.className='au-msg';
  const btn=$('#authSubmit'); btn.disabled=true;
  try{
    if(authMode==='signup'){
      const r=await Store.signUp(email,pw,uname);
      if(r.error){ msg.className='au-msg err'; msg.textContent=translateAuthError(r.error); return; }
      if(!r.session){                                    // email confirmation required before login
        setAuthMode('signin', true);
        msg.className='au-msg ok'; msg.textContent='📧 נשלח מייל אימות לכתובת שלך. אשר אותו — ואז התחבר כאן.';
        $('#authPassword').value=''; return;
      }
      currentUser=r.user; toast('ברוך הבא!'); afterAuthed(true);
    }else{
      const r=await Store.signIn(email,pw);
      if(r.error){ msg.className='au-msg err'; msg.textContent=translateAuthError(r.error); return; }
      currentUser=r.user; afterAuthed(false);
    }
  } finally { btn.disabled=false; }
});
$('#authForgot').onclick=async ()=>{
  const email=$('#authEmail').value.trim();
  const msg=$('#authMsg'); msg.classList.remove('hidden');
  if(!email){ msg.className='au-msg err'; msg.textContent='הזן קודם את כתובת האימייל שלך למעלה.'; return; }
  msg.className='msg'; msg.textContent='שולח…';
  try{ await Store.resetPasswordFor(email); msg.className='au-msg ok'; msg.textContent='אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה.'; }
  catch(e){ msg.className='au-msg err'; msg.textContent='שגיאה בשליחה — נסה שוב.'; }
};
$('#signOutBtn').onclick=async ()=>{
  if(!committed && session.size>0) commitSession();
  try{ await Store.signOut(); }catch(e){}
  hide($('#fbFab'));
  localStorage.clear();          // the local cache belongs to this account; never let it bleed into the next login
  location.reload();
};

/* ===== admin dashboard — who signed up, when, how far they got.
   Deliberately has no way to reveal a password: none is stored in readable form. ===== */
let isAdmin=false;
async function showAdminIfAllowed(){
  isAdmin=false;
  try{ const p=await Store.myProfile(); isAdmin = !!(p && p.role==='admin'); }catch(e){}
  $('#adminBtn').classList.toggle('hidden', !isAdmin);
}
const fmtDate = t => t ? new Date(t).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'})
                        +' '+new Date(t).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}) : '—';

async function openAdmin(){
  goto('admin');
  const body=$('#adminBody');
  body.innerHTML='<p class="msg" style="color:var(--ink-soft)">טוען…</p>';
  const { users, error } = await Store.adminListUsers();
  if(error){
    body.innerHTML=`<p class="msg err">לא ניתן לטעון: ${esc(error.message)}</p>`+
      `<p class="msg" style="color:var(--ink-soft)">אם חסרות עמודות — הרץ את migration-2.sql ב-SQL Editor.</p>`;
    return;
  }
  if(!users.length){ body.innerHTML='<p class="msg" style="color:var(--ink-soft)">עדיין אין משתמשים רשומים.</p>'; return; }

  const rows=await Promise.all(users.map(async u=>{
    let learnedHe=0, learnedEn=0, last=u.last_seen;
    try{
      for(const p of await Store.adminUserProgress(u.id)){
        const w=(p.data&&p.data.stats&&p.data.stats.words)||{};
        const n=Object.values(w).filter(r=>r&&Number(r.level)>=3).length;
        if(p.lang==='en') learnedEn=n; else learnedHe=n;
        if(!last || (p.updated_at && p.updated_at>last)) last=p.updated_at;
      }
    }catch(e){}
    return `<div class="adm-row">
      <div class="adm-top"><b>${esc(u.username||'—')}</b>
        <span class="mail">${esc(u.email||'')}</span>
        ${u.role==='admin'?'<span class="adm-tag">אדמין</span>':''}</div>
      <div class="adm-meta">
        <span>נרשם <i>${fmtDate(u.created_at)}</i></span>
        <span>פעילות אחרונה <i>${fmtDate(last)}</i></span>
        <span>למד <i>${learnedHe}</i> עברית · <i>${learnedEn}</i> אנגלית</span>
      </div>
      <div class="adm-acts"><button data-reset="${esc(u.email||'')}">✉ אפס סיסמה</button></div>
    </div>`;
  }));
  body.innerHTML=`<p style="font-size:.82rem;color:var(--ink-soft);margin-bottom:10px">${users.length} משתמשים</p>`+rows.join('')
    +`<div class="section-t" style="margin-top:30px">דיווחי באגים ומשוב</div><div id="admFb">
        <p class="msg" style="color:var(--ink-soft)">טוען…</p></div>`;
  body.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{
    const mail=b.dataset.reset; if(!mail) return;
    b.disabled=true; b.textContent='שולח…';
    try{ await Store.adminSendReset(mail); b.textContent='✓ נשלח קישור איפוס'; }
    catch(e){ b.textContent='שגיאה — נסה שוב'; b.disabled=false; }
  });
  renderAdminFeedback();
}

const FB_KIND_HE={bug:'🐞 באג',idea:'💡 רעיון',other:'💬 אחר'};
async function renderAdminFeedback(){
  const host=$('#admFb'); if(!host) return;
  const { rows, error }=await Store.adminListFeedback();
  if(error){
    host.innerHTML=`<p class="msg" style="color:var(--ink-soft)">אין עדיין טבלת דיווחים — הרץ את
      <b>migration-4.sql</b> ב-SQL Editor. עד אז דיווחים נשלחים אליך במייל.</p>`;
    return;
  }
  if(!rows.length){ host.innerHTML='<p class="msg" style="color:var(--ink-soft)">אין דיווחים.</p>'; return; }
  const open=rows.filter(r=>r.status!=='done').length;
  host.innerHTML=`<p style="font-size:.82rem;color:var(--ink-soft);margin-bottom:10px">
      ${rows.length} דיווחים · <b style="color:var(--accent)">${open}</b> פתוחים</p>`
    + rows.map(r=>{
      const c=r.context||{};
      return `<div class="adm-row"${r.status==='done'?' style="opacity:.55"':''}>
        <div class="adm-top"><b>${FB_KIND_HE[r.kind]||r.kind}</b>
          <span class="mail">${esc(r.email||'—')}</span>
          ${r.status==='done'?'<span class="adm-tag">טופל</span>':''}</div>
        <p style="font-size:.94rem;line-height:1.55;margin:6px 0 8px;white-space:pre-wrap">${esc(r.body)}</p>
        <div class="fb-ctx">${esc(`${fmtDate(r.created_at)} · screen:${c.screen||'?'} · lang:${c.lang||'?'} · build:${c.build||'?'} · ${c.viewport||''} ${c.standalone?'· PWA':''}`)}</div>
        <div class="adm-acts"><button data-fb="${r.id}" data-st="${r.status==='done'?'new':'done'}">
          ${r.status==='done'?'↩ החזר לפתוח':'✓ סמן כטופל'}</button></div>
      </div>`;
    }).join('');
  host.querySelectorAll('[data-fb]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    if(await Store.adminMarkFeedback(+b.dataset.fb, b.dataset.st)) renderAdminFeedback();
    else { b.disabled=false; toast('העדכון נכשל'); }
  });
}
$('#adminBtn').onclick=openAdmin;

async function checkSessionAndBoot(){
  let sess=null;
  try{ sess=await Store.currentSession(); }catch(e){}
  if(sess && sess.user){ currentUser=sess.user; await afterAuthed(false); }
  else { setAuthMode('signin'); buildAuthDrift(); goto('auth'); hide($('#fbFab')); }
  try{
    Store.onAuthChange((s)=>{
      if(s && s.user && !currentUser){ currentUser=s.user; afterAuthed(false); }
      else if(!s){ currentUser=null; }
    });
  }catch(e){}
}

/* ===== boot ===== */
(function boot(){
  try{
    // The install CTA only makes sense when the app isn't installed yet — otherwise it's noise.
    const el=$('#installHint2');
    if(el && !isStandalone() && !LS.get('hw_installed',0)){
      show(el);
      el.onclick=()=>promptInstall(true);
    }
  }catch(e){}
  // The auth screen is the only way in, so it must appear even if the session lookup throws.
  // checkSessionAndBoot is async — a plain try/catch would never see its rejection.
  const fallbackToAuth = ()=>{ SCREENS.forEach(s=>{const el=$('#'+s); if(el) hide(el);}); show($('#auth')); setAuthMode('signin'); };
  try{ Promise.resolve(checkSessionAndBoot()).catch(fallbackToAuth); }
  catch(e){ fallbackToAuth(); }
})();
