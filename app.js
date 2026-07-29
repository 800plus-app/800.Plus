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
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ direction=b.dataset.dir; LS.set(KEY('hw_dir'),direction); renderDirSegs(); });
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
  return LS.set(KEY('hw_assoc'), assoc);
}
const saveStats   = () => LS.set(KEY('hw_stats'), stats);
const saveDeleted = () => LS.set(KEY('hw_deleted'), [...deleted]);
const saveAdded   = () => LS.set(KEY('hw_added'), added);

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
const SCREENS=['welcome','home','scope','quiz','results','stats','manage','add'];
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
  renderDirSegs();
  goto('scope');
}
$('#pbAll').onclick     = ()=> startRound(allCards(curScope), curScope, 'all');
// NOTE: new/learned are shuffled BEFORE the cap — otherwise slicing an ordered list hands
// back the very same 20 words every round, which reads as "the app keeps repeating itself".
$('#pbWeak').onclick    = ()=> askSize(n=> startRound(cap(weakCards(curScope),n), curScope, 'weak'));
$('#pbNew').onclick     = ()=> askSize(n=> startRound(cap(shuffle(newCards(curScope)),n), curScope, 'new'));
$('#pbLearned').onclick = ()=> askSize(n=> startRound(cap(shuffle(learnedCards(curScope)),n), curScope, 'learned'));
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
  }else{                // show the MEANING (Hebrew), type the word
    $('#qKind').textContent = en ? 'כתוב את המילה באנגלית' : 'כתוב את המילה לפי הפירוש';
    $('#qText').textContent = w.meaning;
    $('#qText').dir='rtl';
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

/* ===== EXPORT ===== */
$('#exportBtn').onclick=()=>{
  const keys=Object.keys(assoc).filter(t=>assoc[t]);
  if(!keys.length){ toast('אין עדיין אסוציאציות לגיבוי'); return; }
  const lines=['# גיבוי אסוציאציות','# מילה - אסוציאציה',''].concat(keys.map(t=>`${t} - ${assoc[t]}`));
  const blob=new Blob([lines.join('\r\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='associations.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);   // release the blob, don't leak it for the session
};

/* ===== nav ===== */
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{ if(!committed && session.size>0) commitSession(); renderHome(); goto('home'); });
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>openScope(b.dataset.scope));

/* ===== PWA ===== */
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }

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
  let learned=0; keys.forEach(k=>{ const r=words[k]; if(isObj(r) && Number(r.level)>=3) learned++; });
  return {total:keys.size, learned, pct: keys.size? Math.round(100*learned/keys.size):0};
}
function renderWelcome(){
  $('#greet').textContent=greeting()+'!';
  const he=langSummary('he'), en=langSummary('en');
  $('#heCount').textContent=he.total+' מילים';
  $('#enCount').textContent=en.total+' מילים';
  $('#heProg').style.width=he.pct+'%';
  $('#enProg').style.width=en.pct+'%';
  $('#heProg').parentElement.title=`למדת ${he.learned} מתוך ${he.total}`;
  $('#enProg').parentElement.title=`למדת ${en.learned} מתוך ${en.total}`;
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
}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>enterLang(b.dataset.lang));
$('#switchLang').onclick=()=>{ if(!committed && session.size>0) commitSession(); renderWelcome(); };

/* ===== boot ===== */
(function boot(){
  try{
    const iOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
    const hint = iOS ? 'טיפ: שתף → "הוסף למסך הבית" לשימוש אופליין' : 'טיפ: תפריט הדפדפן → "התקן אפליקציה" לשימוש אופליין';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if(!standalone && $('#installHint2')) $('#installHint2').textContent=hint;
  }catch(e){}
  // the welcome screen must render even if a summary/stat read fails — it is the only way in
  try{ renderWelcome(); }
  catch(e){ SCREENS.forEach(s=>{const el=$('#'+s); if(el) hide(el);}); show($('#welcome')); }
})();
