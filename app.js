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
    try{ localStorage.setItem(k, payload); if(storageBarOn) hideStorageBar(); return true; }
    catch(e){
      /* quota exceeded (or storage disabled) — shed the least valuable data and retry once.
         The retry must re-serialize: shedStorage trims stats.sessions in memory, and `v` is
         usually that very object, so re-sending the payload built above would write back
         exactly what did not fit and undo the shedding in the same breath. */
      if(shedStorage()){
        try{ payload = JSON.stringify(v); }catch(e4){}
        try{ localStorage.setItem(k, payload); hideStorageBar(); return true; }catch(e2){}
      }
      /* A toast lasts under two seconds and then this fails in total silence for the rest of
         the session, while every later round is quietly lost. A learner deserves to know the
         app has stopped remembering — and to know whether the cloud still has them. */
      if(!storageWarned){ storageWarned=true; try{ toast('אין מקום פנוי בדפדפן — חלק מההתקדמות לא נשמרה'); }catch(e3){} }
      try{ showStorageBar(); }catch(e5){}
      return false;
    }
  },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
/* A bar, not a toast: it stays until a write succeeds, because the condition stays until then
   too. The wording changes with the one fact that decides how bad this is — whether there is a
   signed-in account still receiving the progress. */
let storageBarOn=false;
function showStorageBar(){
  if(storageBarOn) return;
  storageBarOn=true;
  let bar=document.getElementById('stgBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='stgBar'; bar.className='stg-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = currentUser
    ? 'הזיכרון של הדפדפן מלא. ההתקדמות ממשיכה להישמר בחשבון שלך, אבל לא במכשיר הזה — פנה מקום כדי לחזור לעבודה רגילה.'
    : '⚠ הזיכרון של הדפדפן מלא וההתקדמות שלך <b>לא נשמרת</b>. פתח חשבון או פנה מקום בדפדפן.';
  bar.classList.remove('hidden');
}
function hideStorageBar(){
  if(!storageBarOn) return;
  storageBarOn=false;
  const bar=document.getElementById('stgBar');
  if(bar) bar.classList.add('hidden');
}
/* Sessions history is the only unbounded-ish store; drop the old tail first.
   The live `stats` object is trimmed FIRST and from memory, because it holds the round that
   just ended — the one that triggered the overflow and is not on disk yet. Reading the disk
   copy and assigning it back over stats.sessions threw that round away. */
function shedStorage(){
  let freed=false;
  const live=KEY('hw_stats');
  if(stats && Array.isArray(stats.sessions) && stats.sessions.length>40){
    stats.sessions=stats.sessions.slice(-40);
    try{ localStorage.setItem(live, JSON.stringify(stats)); }catch(e){}
    freed=true;
  }
  for(const base of ['hw_stats','hw_stats_en']){
    if(base===live) continue;                    // handled above, from memory
    try{
      const s=JSON.parse(localStorage.getItem(base)||'null');
      if(s && Array.isArray(s.sessions) && s.sessions.length>40){
        s.sessions=s.sessions.slice(-40);
        localStorage.setItem(base, JSON.stringify(s));
        freed=true;
      }
    }catch(e){}
  }
  return freed;
}
/* ---- language layer: Hebrew keeps the ORIGINAL keys so existing progress is never lost ---- */
let LANG = LS.get('hw_lang', null);            // 'he' | 'en' | null (not chosen yet)
if(LANG!=='he' && LANG!=='en') LANG=null;
/* declared here, not next to startPreview(): buildBank() reads it and runs long before
   that block would execute, which would throw on the temporal dead zone */
let PREVIEW = false;
const PREVIEW_UNIT = '1';
const SUF = () => (LANG==='en' ? '_en' : '');  // Hebrew = legacy keys, English = *_en keys
const KEY = base => base + SUF();

const DEFAULT_DIR = 'w2m';        // the exam shows the word and asks the meaning — so do we
let assoc={}, stats={words:{},sessions:[]}, deleted=new Set(), added=[], direction=DEFAULT_DIR;

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
  const out={ seen:int0(r.seen), first:int0(r.first), ever:int0(r.ever),
              wrong:int0(r.wrong), level:int0(r.level,3), last:int0(r.last) };
  /* `src` marks a record the LEVEL TEST wrote rather than the learner. Dropping it here erased
     the marker on the first load, which is exactly the information needed to undo a level test
     that was taken by the wrong person — the incident this field was added for. */
  if(r.src) out.src=String(r.src).slice(0,8);
  return out;
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

  /* DEFAULT_DIR is w2m — word first, meaning second — because that is the direction the
     psychometric exam itself asks in. Someone who never opens this setting should be
     practising the way they will be tested, not the other way round. It is only a default:
     a saved choice always wins, so nobody's existing setting moves. */
  const dir=LS.get(KEY('hw_dir'), DEFAULT_DIR);
  direction = (dir==='m2w'||dir==='w2m'||dir==='mixed') ? dir : DEFAULT_DIR;
}
/* ===== two tabs =====
   Every save writes the WHOLE object, so a second tab silently overwrote the first one's round:
   measured at 20 words practised and 10 stored, with none of the first tab's surviving.
   The `storage` event fires only in the OTHER tabs, so it is exactly the signal needed. It is
   not acted on immediately — reloading state under a running round would swap the deck out from
   under the learner. It raises a flag, and the next save reconciles before it writes.
   The merge is mergeProgress(), the same function the cloud sync uses: counts take the max,
   level comes from whichever record was written last, sessions dedupe on their own fields.
   Reusing it matters — a second merge written by hand here would drift from that one. */
let diskAhead=false;
let bootTimedOut=false;   // the boot watchdog fired: afterAuthed may finish, but must not navigate
/* Keys the user explicitly restored. Persisted, because the deletion it reverses is persisted
   too — a log that lived only in memory would let the next page load re-delete the word. An
   entry is dropped the moment the same word is deleted again, so the last explicit action by
   the person using the app is always the one that stands. */
const undeletedKey = () => KEY('hw_undeleted');
function markRestored(k){ const m=LS.get(undeletedKey(),{})||{}; m[k]=Date.now(); LS.set(undeletedKey(),m); }
function markDeletedAgain(k){ const m=LS.get(undeletedKey(),{})||{}; if(m[k]){ delete m[k]; LS.set(undeletedKey(),m); } }
const restoredMap = () => LS.get(undeletedKey(),{})||{};
function absorbDisk(){
  if(!diskAhead) return;
  diskAhead=false;
  const disk={ stats: LS.get(KEY('hw_stats'), null),
               assoc: LS.get(KEY('hw_assoc'), null),
               deleted: LS.get(KEY('hw_deleted'), null),
               added: LS.get(KEY('hw_added'), null) };
  if(!disk.stats && !disk.assoc && !disk.deleted && !disk.added) return;
  const m=mergeProgress({assoc, stats, deleted:[...deleted], added, dir:direction, undeleted:restoredMap()},
                        {assoc:disk.assoc||{}, stats:disk.stats||{words:{},sessions:[]},
                         deleted:disk.deleted||[], added:disk.added||[], dir:direction});
  assoc=m.assoc; stats=m.stats; deleted=new Set(m.deleted); added=m.added;
}
window.addEventListener('storage', e=>{
  if(!e.key || e.key.indexOf('hw_')!==0) return;
  /* A different account signed in elsewhere. Nothing in this tab is valid any more, and merging
     one person's progress into another's is the exact failure the owner check exists to stop. */
  if(e.key==='hw_owner'){ location.reload(); return; }
  if(LANG!=='he' && LANG!=='en') return;
  const mine=['hw_stats','hw_assoc','hw_deleted','hw_added'].map(KEY);
  if(mine.indexOf(e.key)<0) return;
  diskAhead=true;
  // Idle: adopt the other tab's work now, so the screens are not showing yesterday's numbers.
  if(session.size===0){
    absorbDisk(); buildBank();
    if(!$('#home').classList.contains('hidden')) renderHome();
    if(!$('#welcome').classList.contains('hidden')) renderWelcome();
  }
});

/* The default comes first. A picker whose first option is not the one you are actually in
   reads as though the app chose oddly on your behalf. */
const DIRS_HE = [['w2m','מילה → פירוש'],['m2w','פירוש → מילה'],['mixed','מעורב']];
const DIRS_EN = [['w2m','אנגלית → עברית'],['m2w','עברית → אנגלית'],['mixed','מעורב']];
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
  absorbDisk();
  const ok=LS.set(KEY('hw_assoc'), assoc); queueRemoteSync(); return ok;
}
const saveStats   = () => { absorbDisk(); const ok=LS.set(KEY('hw_stats'), stats); queueRemoteSync(); return ok; };
const saveDeleted = () => { absorbDisk(); const ok=LS.set(KEY('hw_deleted'), [...deleted]); queueRemoteSync(); return ok; };
const saveAdded   = () => { absorbDisk(); const ok=LS.set(KEY('hw_added'), added); queueRemoteSync(); return ok; };

/* canonical word key: same word with/without niqqud (or across units) is ONE word everywhere */
const K = t => LANG==='en' ? normEn(t) : norm(t);
function normEn(s){
  return (s==null?'':String(s)).normalize('NFKC').toLowerCase()
    .trim().replace(/^(to|a|an|the)\s+/,'')        // trim first: a leading space hid the article
    .replace(/[-–—/|]/g,' ')                       // separator, not noise (| was dropped here and kept in Hebrew)
    .replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}
/* one-time migration: merge existing per-exact-string records into normalized keys.
   Called from boot (norm/NIQ are defined further down the file). */
/* v8: norm/normEn began treating a hyphen as a separator instead of deleting it, so the key
   of every hyphenated term changed (departmentstore -> "department store"). The old key cannot
   be reversed back into a term, so the remap is driven from the BANK: for each word in the data
   files, compute the key under the OLD rule and move any record found there onto the new key.
   Must run before pruneOrphans(), which would otherwise delete the records as orphans. */
function remapHyphenKeys(){
  const oldNorm = t => String(t).normalize('NFKC').replace(NIQ,'').replace(/[‎‏]/g,'')
    .replace(/["'`׳״.,;:!?()\[\]{}\-–—/|]/g,'').replace(/\s+/g,' ').trim()
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ');
  const oldNormEn = t => String(t).normalize('NFKC').toLowerCase()
    .replace(/^(to|a|an|the)\s+/,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  const oldK = LANG==='en' ? oldNormEn : oldNorm;
  const data = (LANG==='en' ? window.UNIT_DATA_EN : window.UNIT_DATA) || {};
  let moved=0;
  for(const u in data) for(const p of (data[u]||[])){
    const term=p&&p[0]; if(!term) continue;
    const nk=K(term), ok=oldK(term);
    if(!nk || !ok || nk===ok) continue;
    if(stats.words[ok] && !stats.words[nk]){ stats.words[nk]=stats.words[ok]; delete stats.words[ok]; moved++; }
    if(assoc[ok] && !assoc[nk]){ assoc[nk]=assoc[ok]; delete assoc[ok]; }
    if(deleted.has(ok)){ deleted.delete(ok); deleted.add(nk); }
  }
  if(moved){ saveStats(); saveAssoc(); saveDeleted(); }
  return moved;
}
function migrateStores(){
  if(LS.get(KEY('hw_migr'),0)===7){ remapHyphenKeys(); LS.set(KEY('hw_migr'),8); return; }
  if(LS.get(KEY('hw_migr'),0)>=8) return;
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
  remapHyphenKeys();
  LS.set(KEY('hw_migr'),8);
}

/* Housekeeping: drop records/associations/deletions for words that no longer exist in the
   bank at all. Without this, every data refresh leaves permanent orphans in localStorage. */
function pruneOrphans(){
  const data=(LANG==='en'?window.UNIT_DATA_EN:window.UNIT_DATA)||{};
  const live=new Set();
  for(const u in data) for(const p of data[u]){ const k=K(p[0]); if(k) live.add(k); }
  for(const p of added){ const k=K(p[0]); if(k) live.add(k); }
  /* THE GUARD THAT WAS MISSING. `<script src="data.js">` has no onerror and nothing verified
     that the bank actually arrived — and the service worker installs the data files
     best-effort. One failed fetch plus an offline launch therefore produced an EMPTY bank,
     and everything below read that as "every word the learner has is an orphan": all records,
     all associations, deleted permanently, silently, and written straight to disk.
     A bank this small is never a real state. Refuse to prune instead of trusting it. */
  if(live.size < 50){
    console.error('pruneOrphans בוטל: המאגר נטען חלקית ('+live.size+' מילים) — לא נמחק דבר');
    return;
  }
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
  let data = (LANG==='en' ? window.UNIT_DATA_EN : window.UNIT_DATA) || {};
  if(PREVIEW) data = { [PREVIEW_UNIT]: data[PREVIEW_UNIT] || [] };   // preview = unit 1 only
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
  buildGlossIndex();
}

/* ===== words that share a gloss =====
   401 English entries and 47 Hebrew ones carry a gloss that is byte-identical to another
   entry's. In the default direction the gloss IS the question, so "ענף" can only be answered
   with זַלְזַל even though פֹּארָה is exactly as correct — and the learner who knows both is
   told they are wrong. The exam already accepted every word carrying the same gloss, but only
   within one unit and only in the exam; practice, where people spend their time, accepted one.
   Built once per bank build: a scan per keystroke over 5,619 entries is not free. */
let GLOSS_ALT = new Map();
function glossKey(g){
  return String(g||'').replace(/\s*\([^)]*\)/g,'')      // examples are not part of the meaning
    .replace(/\s+/g,' ').replace(/[.,;·]+$/,'').trim().toLowerCase();
}
function buildGlossIndex(){
  GLOSS_ALT=new Map();
  for(const w of BANK){
    const g=glossKey(w.meaning); if(g.length<2) continue;
    let arr=GLOSS_ALT.get(g); if(!arr){ arr=[]; GLOSS_ALT.set(g,arr); }
    arr.push(w.term);
  }
  for(const [g,arr] of GLOSS_ALT) if(arr.length<2) GLOSS_ALT.delete(g);
}
/* Every OTHER word that means the same thing as this card. */
function glossAlts(card){
  const arr=GLOSS_ALT.get(glossKey(card && card.meaning));
  if(!arr) return [];
  const own=K(card.term);
  return arr.filter(t=>K(t)!==own);
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
/* A word skipped after the level test is stored at level 3 so the practice queue leaves it
   alone — but it is not a word anyone learned here, and counting it under "שלמדתי" is the same
   false claim the dashboard was just cured of. It gets its own bucket. */
const wasSkipped = term => { const r=stats.words[K(term)]; return !!(r && r.src==='lv'); };
function classify(scope){
  const seen=new Set(); let strong=0,weak=0,fresh=0,skipped=0;
  for(const w of scopeWords(scope)){
    const k=K(w.term);
    if(seen.has(k)) continue; seen.add(k);
    if(wasSkipped(w.term)){ skipped++; continue; }
    /* Same three buckets the practice buttons use, and for the same reason: a word you got
       wrong is not a word you have never met. Keeping the donut on the old rule would have
       left the picture disagreeing with the buttons underneath it. */
    if(lvl(w.term)>=3) strong++;
    else if(seenCount(w.term)>0) weak++;
    else fresh++;
  }
  return {total:seen.size, strong, weak, fresh, skipped};
}
function uniqScope(scope){ const seen=new Set(),out=[]; for(const w of scopeWords(scope)){ const k=K(w.term); if(!seen.has(k)){seen.add(k);out.push(w);} } return out; }
/* Reported by a tester: practise 30 words in a unit, then ask for "מילים חדשות", and some of
   the 30 come back — both ones he got right and ones he got wrong.
   The cause was that "new" was defined as `level < 1`, and `level` is a STRENGTH counter, not a
   record of having met the word. A word answered wrong is decremented and floors at 0; a word
   answered right but not on the first try is ALSO decremented. Both land back on 0, which the
   old rule read as "never seen".
   `seen` is the field that actually answers "have I met this word", so it is the one the button
   labelled "מילים שעוד לא תרגלתי" now uses. A practised word that is still weak belongs in
   לחיזוק — which is exactly what that button is for. */
const seenCount = term => { const r=stats.words[K(term)]; return r ? int0(r.seen) : 0; };
function newCards(scope){ return uniqScope(scope).filter(w=>seenCount(w.term)===0); }
function weakCards(scope){
  const arr=uniqScope(scope).filter(w=>seenCount(w.term)>0 && lvl(w.term)<3);
  arr.sort((a,b)=>lastOf(a.term)-lastOf(b.term));
  return arr;
}
/* `wasSkipped` guards were added to `classify` and `langSummary` today and NOT here, so the same
   screen showed the legend "שלמדתי 0" beside a button reading "מילים שלמדתי 1,725" — and that
   button drilled exactly the words the level test had promised would stop appearing.
   Skipped words come back through ניהול מילים ← שחזור, which is the honest route. */
function learnedCards(scope){
  return uniqScope(scope).filter(w=>lvl(w.term)>=3 && !wasSkipped(w.term));
}
function allCards(scope){
  const w=uniqScope(scope).slice();
  shuffle(w);
  if(scope==='global'||scope==='random') return w.slice(0,30);
  return w;
}

/* ===== answer normalization ===== */
/* U+05BE MAQAF — the Hebrew hyphen — sits inside the niqqud block, so the old single range
   DELETED it: norm("בֵּית־סֵפֶר") gave "ביתספר" while the same term with an ASCII hyphen gave
   "בית ספר". Two spellings of one word, two different keys. Excluded here and handled as the
   separator it is, exactly like "-" already was. No term in the bank uses it today, so no
   stored key moves — this closes the door before someone types it. */
const NIQ=/[֑-ֽֿ-ׇ]/g;
function norm(s){
  // NFKC folds Hebrew presentation forms (e.g. U+FB35 ﬡּ) back to letter+dagesh, so a word
  // stored with one can still be typed normally and matched.
  return (s==null?'':String(s)).normalize('NFKC').replace(NIQ,'').replace(/[‎‏]/g,'')
    .replace(/[-–—/|־]/g,' ')                    // separator, not noise: department-store == department store
    .replace(/["'`׳״.,;:!?()\[\]{}]/g,'').replace(/\s+/g,' ').trim()
    .replace(/ך/g,'כ').replace(/ם/g,'מ').replace(/ן/g,'נ').replace(/ף/g,'פ').replace(/ץ/g,'צ');
}
/* Hebrew is stored vocalised, and stripping niqqud leaves the DEFECTIVE spelling: כֹּפֶר -> כפר.
   Nobody types that — they type כופר — while כפר, a different word entirely, was accepted.
   The full spelling is derived from the niqqud itself rather than guessed: a holam or qubuts
   becomes a ו, a hiriq becomes a י. Guessing (dropping all matres) would have merged
   unrelated words such as שיר and שר. */
const HOLAM='ֹ', QUBUTS='ֻ', HIRIQ='ִ';
function fullSpelling(term){
  const src=String(term).normalize('NFKC');
  let out='';
  for(let i=0;i<src.length;i++){
    const c=src[i];
    out+=c;
    if(c!==HOLAM && c!==QUBUTS && c!==HIRIQ) continue;
    const add = c===HIRIQ ? 'י' : 'ו';
    /* A holam male is already a vav — the mark sits ON it, so the letter comes BEFORE the mark.
       Looking only forward meant מִכְמוֹרֶת produced מיכמוורת, a non-word, and the ordinary
       spelling מיכמורת was offered nowhere. 74 terms rejected their own standard spelling.
       Same bug family as סייס; missed because the earlier fix was written for yod alone. */
    let b=i-1; while(b>=0 && /[֑-ׇ]/.test(src[b])) b--;
    if(src[b]===add) continue;
    // look past any further niqqud marks to find the next real letter
    let j=i+1; while(j<src.length && /[֑-ׇ]/.test(src[j])) j++;
    if(src[j]!==add) out+=add;
  }
  return out;
}
/* The second half of the same problem. Unvocalised Hebrew also DOUBLES a consonantal yod
   inside a word — סייס, מניין, קניין, עיניים, צרכנייה — and stripping niqqud leaves one yod,
   so a learner typing the ordinary modern spelling was marked wrong. 64 terms in the bank.
   Again the niqqud decides rather than a guess: a yod carrying a vowel or a dagesh is a
   consonant; a bare yod after a hiriq is a mater lectionis and is left alone.

   Deliberately permissive. The rule over-applies to a handful of conventional spellings
   (היה, עין), so those get accepted in both forms — and accepting one extra spelling costs
   nothing, while rejecting the standard one costs the learner a word they actually knew. */
const YOD='י', DAGESH='ּ';
const Y_VOWELS='ְֱֲֳִֵֶַָֹֻ';
const HE_LETTER=/[א-ת]/;
function pleneYod(term){
  const s=String(term).normalize('NFKC');
  let out='';
  for(let i=0;i<s.length;i++){
    const c=s[i]; out+=c;
    if(c!==YOD) continue;
    let j=i+1, marks='';
    while(j<s.length && /[֑-ׇ]/.test(s[j])){ marks+=s[j]; j++; }
    if(!marks.split('').some(m=>Y_VOWELS.includes(m)||m===DAGESH)) continue;  // a mater, not a consonant
    if(s[j]===YOD) continue;                                   // already written double
    let p=i-1; while(p>=0 && /[֑-ׇ]/.test(s[p])) p--;
    if(p<0 || !HE_LETTER.test(s[p]) || s[p]===YOD) continue;   // word-initial, or the pair's second half
    if(!HE_LETTER.test(s[j]||'')) continue;                    // word-final
    out+=marks+YOD; i=j-1;
  }
  return out;
}
/* A tsere-to-yod rule was tried here and REVERTED. In unvocalised Hebrew a pi'el like מֵרֵט or
   בֵּרֵךְ is written מירט / בירך, so accepting that spelling looked right — but measured against
   the whole bank it made five real pairs collide (רְדִיד~רִדֵּד, הִגִיר~הִגֵּר, נִיכָּר~נֵכַר,
   גִּבֵּן~גָבִין, גִּלְעֵן~גַּלְעִין), meaning a learner asked for one word would be marked
   correct for the other. Five wrong acceptances to rescue one entry is a bad trade, and unlike
   the vav and doubled-yod rules this one cannot be made safe by being permissive. */
const VAV='ו';
function pleneVav(term){
  const s=String(term).normalize('NFKC');
  let out='';
  for(let i=0;i<s.length;i++){
    const c=s[i]; out+=c;
    if(c!==VAV) continue;
    let j=i+1, marks='';
    while(j<s.length && /[֑-ׇ]/.test(s[j])){ marks+=s[j]; j++; }
    if(!marks.split('').some(m=>Y_VOWELS.includes(m)||m===DAGESH)) continue;  // a mater, not a consonant
    if(s[j]===VAV) continue;                                   // already written double
    let p=i-1; while(p>=0 && /[֑-ׇ]/.test(s[p])) p--;
    if(p<0 || !HE_LETTER.test(s[p]) || s[p]===VAV) continue;    // word-initial, or the pair's second half
    if(!HE_LETTER.test(s[j]||'')) continue;                     // word-final
    out+=marks+VAV; i=j-1;
  }
  return out;
}
/* Every spelling of a Hebrew term a learner might reasonably type. The rules compose:
   a word can need a restored ו, a doubled י and a doubled ו at once. */
function heForms(x){
  const f=fullSpelling(x), y=pleneYod(x), v=pleneVav(x);
  return [x, f, y, v, fullSpelling(y), pleneYod(f), pleneVav(f), fullSpelling(v)];
}
/* ===== the gloss must not contain the answer =====
   132 Hebrew glosses name the very word they define — literally (תְּלוּלִית :: ערימה קטנה,
   תלולית), through an inflection (לַהַק :: ...להקה), or inside the example that makes the gloss
   worth reading (בְּאִיבּוֹ :: בראשית דרכו (נקטף באיבו)). Rewriting all of them would have
   thrown away the examples and etymologies, so the word is hidden at the moment it is used as
   a PROMPT instead — and the full text is shown again in the feedback, where it teaches.
   Hebrew glues ו/ה/ב/כ/ל/מ/ש to the front of a word and inflects the end, so a giveaway is
   matched on the stripped stem, never on a raw substring: צָעִיר must not hide עִיר. */
const CLITIC=['ו','ה','ב','כ','ל','מ','ש','וה','וב','ול','ומ','כש','שה','שב','מה','לה','בה'];
const HSUF=['ה','ות','ים','י','ו','נו','כם','הם','יה','ית','יות'];
function heStems(w){
  const base=norm(w); if(base.length<3) return [];
  const out=new Set([base]);
  for(const p of CLITIC) if(base.startsWith(p) && base.length-p.length>2) out.add(base.slice(p.length));
  for(const b of [...out]) for(const s of HSUF.map(norm))
    if(s && b.endsWith(s) && b.length-s.length>2) out.add(b.slice(0,-s.length));
  return [...out];
}
function maskTerm(meaning, term){
  if(LANG==='en') return meaning;                       // the answer is English; a Hebrew gloss cannot leak it
  const tWords=String(term).split(/\s+/);
  const tBase=new Set(tWords.map(norm).filter(x=>x.length>2));
  const tStems=new Set(); for(const t of tWords) for(const s of heStems(t)) tStems.add(s);
  if(!tStems.size) return meaning;
  /* One side must be the word as written. Letting BOTH sides be stripped made שָׁפוּף match
     כפוף — the כ and the ש each read as a prefix and both reduce to פופ — which is not a
     giveaway at all, just two unrelated words with a shared tail. */
  /* Function words are never 'the answer'. Blanking אין inside אֵין יָדוֹ מַשֶּׂגֶת turned
     the prompt into its own opposite. */
  const FUNC=new Set(['אינ','אינו','בינ','ממנו','אלא','אשר','כמו','לפי','אתה','הוא','היא','זה','זאת','של','את','על','לא','כל','גמ','אמ','כי']);
  const hits = w => { const b=norm(w);
    if(FUNC.has(b)) return false;
    return tStems.has(b) || heStems(w).some(s=>tBase.has(s)); };
  /* A parenthetical is an EXAMPLE of the word in use. Blanking the word inside it leaves
     "(מכת ־־־ ־־־)" — noise, not a hint — so the whole aside is dropped from the prompt
     instead. It comes back in the feedback, where the example is the point. */
  const noAside=String(meaning).replace(/\s*\([^)]*\)/g, m => (m.match(/[֐-׿]+/g)||[]).some(hits) ? '' : m);
  const tidy = s => s.replace(/\s{2,}/g,' ').replace(/^[\s,;]+|[\s,;]+$/g,'');
  let out=tidy(noAside.replace(/[֐-׿]+/g, w => hits(w) ? '־־־' : w));
  /* An unanswerable prompt is worse than a hint. "אֲלוּמָּת אוֹר :: קרן אור" masks down to
     "קרן ־־־", which asks the learner to guess from three letters — so when blanking leaves
     too little to work with, the giveaway is accepted and the original gloss is shown.
     Dropping a circular example never triggers this: what remains is a clean definition. */
  /* Two guards, because letter-count alone was not enough. "נֶחָמָה פּוּרְתָּא :: נחמה כלשהי,
     נחמה מועטה" masked BOTH heads and left "־־־ כלשהי, ־־־ מועטה" — ten letters, comfortably
     over the threshold, and completely unanswerable. When two or more words are hidden and only
     a couple of content words survive, what is left is modifiers with nothing to modify. */
  const hidden=(out.match(/־־־/g)||[]).length;
  const rest=(out.replace(/־־־/g,' ').match(/[֐-׿]{2,}/g)||[]).length;
  if(out.includes('־־־') &&
     (out.replace(/־־־/g,'').replace(/[^֐-׿]/g,'').length < 6 || (hidden>=2 && rest<=2) || hidden>=3))
    out = tidy(noAside);
  return /[֐-׿]/.test(out) ? out : meaning;
}
function isCorrect(input, term){
  const a=K(input); if(!a) return false;
  if(a===K(term)) return true;
  if(LANG!=='en' && heForms(term).some(v=>K(v)===a)) return true;   // כופר for כֹּפֶר, סייס for סַיָּס
  // accept slash/comma alternatives ("1st - first", "raise / lift")
  const alts=term.split(/[\/|,]|\s-\s/).flatMap(x=>LANG==='en'?[x]:heForms(x))
                 .map(x=>K(x)).filter(Boolean);
  if(alts.includes(a)) return true;
  /* Compounds get written both ways — best-seller / bestseller, and in Hebrew a learner who
     types בית ספר as one word. This ran for English only, so 163 English terms were protected
     and the 380 multi-word Hebrew terms were not. Extended to both after measuring the risk:
     squashing spaces produces ZERO new collisions across all 1,719 Hebrew terms, neither
     between two terms nor onto an existing single-word key. Like the plene-spelling rules,
     this only ever ADDS an accepted form and can never reject one. */
  const squash=x=>String(x).replace(/\s+/g,'');
  if(alts.some(x=>squash(x)===squash(a))) return true;
  return false;
}

/* ===== screens ===== */
const SCREENS=['auth','welcome','level','home','scope','quiz','results','stats','manage','add','exam','admin','locked','intro','account','boot'];
/* Heavy lists left in hidden screens keep thousands of nodes alive for the whole session;
   drop them on the way out — they are always rebuilt when the screen is opened again. */
const HEAVY = {stats:'#statsBody', manage:'#manageList', results:'#reviewList'};
function goto(id){
  SCREENS.forEach(s=>{
    if(s!==id && HEAVY[s] && !$('#'+s).classList.contains('hidden')){ const el=$(HEAVY[s]); if(el) el.innerHTML=''; }
    hide($('#'+s));
  });
  show($('#'+id)); window.scrollTo(0,0);
  if(id==='intro'){
    /* The same screen serves two audiences. A visitor with no session must always get the two
       CTAs back, even if a signed-in session on this device previously opened it read-only. */
    if(!currentUser){ show($('#introCta')); hide($('#introTop')); }
    countUpIntro();
    // if the reveal animation has not finished by now it is never going to — show everything
    setTimeout(()=>{ const el=$('#intro'); if(el) el.classList.add('anim-done'); }, 1500);
  }
}
/* The landing page states the size of the bank. A number that arrives already finished reads as
   a claim; one that runs up reads as a count. Eased, so it decelerates into the real figure —
   and it never invents one: the target is the two banks as actually loaded. */
let countedIntro=false;
function countUpIntro(){
  const el=$('#introCount'); if(!el || countedIntro) return;
  /* Both banks must be present. A failed <script> for one of them is silent — no console error,
     no exception — and the headline then announced 3,694 instead of 5,413, which is worse than
     announcing nothing: a broken load was presented as a plausible fact. */
  const he=window.UNIT_DATA, en=window.UNIT_DATA_EN;
  const cnt=o=>Object.values(o||{}).reduce((a,b)=>a+b.length,0);
  const n=cnt(he)+cnt(en);
  if(!cnt(he) || !cnt(en)){ el.textContent='—'; return; }
  countedIntro=true;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent=n.toLocaleString('en-US'); return; }
  const t0=performance.now(), DUR=1400;
  let done=false;
  const tick=t=>{
    const p=Math.min(1,(t-t0)/DUR), e=1-Math.pow(1-p,3);
    el.textContent=Math.round(n*e).toLocaleString('en-US');
    if(p<1) requestAnimationFrame(tick); else done=true;
  };
  requestAnimationFrame(tick);
  /* requestAnimationFrame does not advance in a tab that is not compositing — a background tab,
     a battery-saver throttle. Without this the headline number sits on "0", which reads as a
     broken page rather than a slow one. If no frame has arrived, show the real figure. */
  /* The guard asks whether the count FINISHED, not whether a frame ever ran — one frame and
     then a stall used to leave the number frozen half way. */
  setTimeout(()=>{ if(!done) el.textContent=n.toLocaleString('en-US'); }, DUR+400);
}

/* ===== HOME ===== */
function renderHome(){
  const total=BANK.length;
  const uniqTerms=new Set(BANK.map(w=>w.term)).size;
  /* Was `1717 מילים · 1717 ייחודיות` — the same number twice, and "ייחודיות" explains nothing
     to someone who has just arrived. The second half only ever differs when a duplicate slips
     in, which is a thing for ME to see, not the learner. What they want to know is how much of
     it is theirs. */
  const done = classify('global');
  $('#totalPill').textContent = done.strong
    ? `${done.strong} מתוך ${total} מילים כבר בשליטה`
    : `${total} מילים · עוד לא התחלת`;
  /* Weak words across the WHOLE language, ignoring units — the survey's top request by a wide
     margin. Hidden rather than shown empty: on day one nothing is weak yet, and an offer to
     drill zero words is a worse first impression than no offer at all. */
  renderExamPill();
  const weakAll = weakCards('global');
  const cta = $('#homeWeak');
  if(cta){
    cta.classList.toggle('hidden', weakAll.length < 4);
    $('#homeWeakSub').textContent =
      `${weakAll.length} מילים לחיזוק — מכל היחידות, בלי לבחור אחת`;
  }
  renderDirSegs();
  const grid=$('#unitGrid'); grid.innerHTML='';
  UNIT_IDS.forEach(uid=>{
    const c=classify('unit:'+uid);
    if(c.total===0) return;
    const pct=n=>c.total?(100*n/c.total):0;
    const el=document.createElement('button');
    el.className='tile';
    el.innerHTML=`<div class="num">${uid}</div><div class="lbl">${c.total} מילים</div>
      <div class="mini"><i class="s" style="width:${pct(c.strong)}%"></i><i class="w" style="width:${pct(c.weak)}%"></i><i class="n" style="width:${pct(c.fresh)}%"></i><i class="k" style="width:${pct(c.skipped||0)}%"></i></div>`;
    el.onclick=()=>openScope('unit:'+uid);
    grid.appendChild(el);
  });
}

/* ===== SCOPE ===== */
/* A per-unit "X% appear in real exams" tag was built from the NITE measurement and then
   removed on sight. The numbers are true — 47% down to 23% — but on a tile they read as
   "77% of this unit is a waste of time", on seven units out of ten. A true number that
   discourages the exact work it describes is the wrong number to show.
   The measurement itself is kept: scratchpad/unit_examshare.json. */
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
  $('#donut').style.background=`conic-gradient(var(--green) 0 ${gs}%, var(--accent) ${gs}% ${gs+gw}%,`+
    ` var(--gold) ${gs+gw}% ${gs+gw+100*c.fresh/done}%, var(--line) ${gs+gw+100*c.fresh/done}% 100%)`;
  $('#legend').innerHTML=
    `<div><i class="s"></i> שלמדתי <b>${c.strong}</b></div>
     <div><i class="w"></i> לחיזוק <b>${c.weak}</b></div>
     <div><i class="n"></i> חדשות <b>${c.fresh}</b></div>`+
    (c.skipped ? `<div title="דילגת עליהן אחרי מבחן הרמה. ניהול מילים ← שחזור"><i class="k"></i>
       דילגתי <b>${c.skipped}</b></div>` : '');
  const nc=newCards(scope).length, wc=weakCards(scope).length, lc=learnedCards(scope).length;
  $('#cntNew').textContent=nc; $('#cntWeak').textContent=wc; $('#cntLearned').textContent=lc;
  $('#pbNew').disabled = nc===0;
  $('#pbWeak').disabled = wc===0;
  $('#pbLearned').disabled = lc===0;
  /* The end-of-round card tells you where the round left you. This tells you where you are
     BEFORE you start — same numbers, same place in the flow, so the two agree by construction. */
  const met=c.strong+c.weak;
  const sp=$('#scopeProg');
  if(sp) sp.innerHTML = c.total
    ? `פגשת <b>${met}</b> מתוך ${c.total} מילים` +
      (c.fresh ? ` · נשארו <b>${c.fresh}</b> שלא פגשת` : ' · פגשת את כולן ✓') +
      (c.strong ? ` · <b>${c.strong}</b> בשליטה` : '')
    : '';
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
    $('#cntExam').textContent = last ? last.pct+'%' : '‹';
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
// the list is built ONCE, up front, so the sheet can show its size and the callback caps the
// very same list — building it twice would let a background sync change it in between
// same round as כל המאגר ← מילים לחיזוק, minus the two taps in between
$('#homeWeak').onclick = ()=>{
  curScope='global';
  const l=weakCards('global');
  if(!l.length){ toast('אין כרגע מילים לחיזוק — תרגל סבב ונראה'); return; }
  askSize(l.length, n=> startRound(capSampled(l,n), 'global', 'weak'));
};
$('#pbWeak').onclick    = ()=>{ const l=weakCards(curScope);    askSize(l.length, n=> startRound(capSampled(l,n), curScope, 'weak')); };
$('#pbNew').onclick     = ()=>{ const l=newCards(curScope);     askSize(l.length, n=> startRound(cap(shuffle(l),n), curScope, 'new')); };
$('#pbLearned').onclick = ()=>{ const l=learnedCards(curScope); askSize(l.length, n=> startRound(cap(shuffle(l),n), curScope, 'learned')); };
$('#pbExam').onclick=()=>{ if(curScope.startsWith('unit:')) openExam(curScope.slice(5)); };
$('#pbSheet').onclick=()=>{ if(curScope.startsWith('unit:')) printSheet(curScope.slice(5)); };
$('#pbStats').onclick   = ()=> openStats(curScope);
function cap(list,n){ if(n && list.length>n){ toast(`מתרגל ${n} מתוך ${list.length}`); return list.slice(0,n);} return list; }
/* A survey respondent put it exactly: the same words keep coming back. shuffle() is a correct
   Fisher-Yates, and that was never the problem — the SET was deterministic. weakCards is sorted
   by least-recently-seen and then sliced, so two rounds in a row on an unchanged bank produced
   the identical twenty words. Widening the window and sampling inside it keeps the
   spaced-repetition intent (the oldest are still the candidates) while making consecutive
   rounds differ. Window of 2n: with n=20 you draw 20 out of the 40 most overdue. */
function capSampled(list, n){
  if(!n || list.length<=n) return list;
  const window=list.slice(0, Math.min(list.length, n*2));
  toast(`מתרגל ${n} מתוך ${list.length}`);
  return shuffle(window.slice()).slice(0, n);
}

/* ===== how many words this round? ===== */
const SIZES=[10,20,50];                         // 0 = the whole scope; -1 = "אחר", a typed number
let sizeCb=null, sizeTotal=0;
/* The count matters to the choice: picking between 20 and "everything" is a different decision
   when everything is 24 than when it is 400, and the learner could not see which. So the caller
   now hands over the size of the list it is about to cap. */
function askSize(total, cb){
  sizeTotal=total||0;
  /* A preset that is not smaller than the list caps nothing — picking it gives the same round
     as picking everything. When none of them is smaller, the sheet has one real answer, and
     asking a question with one answer is just a tap the learner has to spend. Start the round. */
  const usable = SIZES.filter(n => n < sizeTotal);
  if(!usable.length){ sizeCb=null; cb(0); return; }
  sizeCb=cb;
  const last=LS.get(KEY('hw_size'), 20);
  const custom = last>0 && SIZES.indexOf(last)<0 && last<sizeTotal ? last : 0;   // a typed number
  // "כל היחידה" is only true inside a unit — כל המאגר and אקראי are not units.
  const allLabel = (curScope==='global'||curScope==='random' ? 'הכול' : 'כל היחידה')
                 + (sizeTotal ? ' · '+sizeTotal : '');
  // only the presets that actually narrow the list — 50 beside a list of 12 is noise
  const opts = usable.map(n=>({n, label:String(n)}))
      .concat([{n:-1, label: custom ? 'אחר · '+custom : 'אחר'}, {n:0, label:allLabel}]);
  // when the saved size no longer fits, "everything" is what a tap would actually do — say so
  const allIsEffective = !custom && usable.indexOf(last) < 0;
  $('#sizeOpts').innerHTML=opts.map(o=>{
    const on = o.n===-1 ? !!custom : (o.n===0 ? allIsEffective : o.n===last);
    const cls = (on?'active ':'') + (o.n===0?'wide':'');
    return `<button data-n="${o.n}" class="${cls.trim()}">${esc(o.label)}</button>`;
  }).join('');
  $('#sizeCustomN').value = custom || '';
  hide($('#sizeCustom'));
  show($('#sizeAsk'));
}
function chooseSize(n){
  if(n>0) LS.set(KEY('hw_size'), n);            // 0 stays out of the default: it is a one-off
  hide($('#sizeAsk')); hide($('#sizeCustom'));
  const cb=sizeCb; sizeCb=null; if(cb) cb(n);
}
$('#sizeOpts').onclick=e=>{
  const b=e.target.closest('button[data-n]'); if(!b) return;
  const n=+b.dataset.n;
  if(n===-1){                                   // reveal the field instead of closing the sheet
    show($('#sizeCustom'));
    $('#sizeCustomN').focus(); $('#sizeCustomN').select();
    return;
  }
  chooseSize(n);
};
function customGo(){
  const raw=parseInt($('#sizeCustomN').value,10);
  if(!(raw>0)){ $('#sizeCustomN').focus(); return; }   // no number, no round: say nothing, wait
  chooseSize(Math.min(raw, 999));
}
$('#sizeCustomGo').onclick=customGo;
// Enter inside the field is the same as pressing התחל — on a phone that is the keyboard's own key
$('#sizeCustomN').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); customGo(); } });
$('#sizeCancel').onclick=()=>{ sizeCb=null; hide($('#sizeCustom')); hide($('#sizeAsk')); };
$('#sizeAsk').onclick=e=>{ if(e.target===$('#sizeAsk')){ sizeCb=null; hide($('#sizeCustom')); hide($('#sizeAsk')); } };

/* ===== QUIZ ENGINE ===== */
let deck=[], idx=0, correct=0, missed=[], answered=false;
let session=new Map(), sessionScope='global', sessionMode='all', committed=false;
/* Which words of the CURRENT round have already been written to stats, and which log row this
   round owns. Both exist because commitSession can now legitimately run several times per
   round — visibilitychange fires every time a notification pulls the learner away. */
let committedKeys=new Set(), sessionRowIdx=-1;

function sess(w){ const k=K(w.term); if(!session.has(k)) session.set(k,{w,attempts:0,mastered:false,firstTry:false}); return session.get(k); }

let isRetryRound=false;
function startRound(cards, scope, mode, retry){
  if(!Array.isArray(cards) || cards.length===0){ toast('אין מילים לתרגול כאן'); return; }
  if(!committed && session.size>0) commitSession();
  session=new Map(); committed=false; committedKeys=new Set(); sessionRowIdx=-1;
  sessionScope=scope; sessionMode=mode;
  // last line of defence: the same word can never appear twice inside one round
  const uniq=[], ks=new Set();
  for(const c of cards){ const k=K(c.term); if(k && !ks.has(k)){ ks.add(k); uniq.push(c); } }
  deck=shuffle(uniq).map(c=>({...c, _dir: direction==='mixed' ? (Math.random()<0.5?'m2w':'w2m') : direction}));
  if(!deck.length){ toast('אין מילים לתרגול כאן'); return; }
  idx=0; correct=0; missed=[]; isRetryRound=!!retry;
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
    // the gloss becomes the question here, so the answer must not be inside it
    $('#qText').textContent = maskTerm(w.meaning, w.term);
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
  // …and the same answer without the explanatory parenthesis, which nobody types
  if(a===norm(String(meaning).replace(/\([^)]*\)/g,' '))) return true;
  const segs=meaningSegs(meaning);
  if(segs.includes(a)) return true;
  /* A single word from ANYWHERE in the gloss used to pass — including from inside a
     parenthetical example. "יגור :: פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)"
     accepted "קרה", a different word entirely, and promoted the item to level 3.
     One whole listed sense is still enough; a word lifted out of an example is not. */
  return false;
}
/* the senses a learner may legitimately answer with: comma/semicolon separated, and never
   the contents of a parenthesis, which explains rather than defines */
/* the senses the learner did NOT give, for the "also:" line after a correct answer */
function otherSenses(input, meaning){
  const a=norm(input);
  const raw=String(meaning).replace(/\([^)]*\)/g,' ').split(/[;/|]|\s-\s|,/)
    .map(x=>x.trim()).filter(Boolean);
  if(raw.length<2) return [];
  return raw.filter(x=>norm(x)!==a).slice(0,4);
}
function meaningSegs(meaning){
  return String(meaning).replace(/\([^)]*\)/g,' ')
    .split(/[,;/|]|\s-\s/).map(norm).filter(Boolean);
}
let acceptedAlt=null;      // set when the answer was a different word with the same gloss
function check(){
  if(answered||!deck[idx]) return;
  const w=deck[idx], v=$('#answerInput').value;
  acceptedAlt=null;
  if(w._dir==='w2m'){ finishCard(meaningMatch(v, w.meaning), false); return; }
  if(isCorrect(v, w.term)){ finishCard(true, false); return; }
  /* Same meaning, different word. Accepted — and the card's own word is named in the feedback,
     because the point of the round is still to learn THIS entry. */
  const alt=glossAlts(w).find(t=>isCorrect(v, t));
  if(alt){ acceptedAlt=alt; finishCard(true, false); return; }
  finishCard(false, false);
}
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
    /* One listed sense is a correct answer, but the word usually carries more. Showing the
       rest on a CORRECT answer is where it costs nothing and teaches something. */
    (ok && w2m ? (()=>{ const rest=otherSenses($('#answerInput').value, w.meaning);
       return rest.length ? `<div class="also">גם: <b>${esc(rest.join(' · '))}</b></div>` : ''; })() : '')+
    /* Answered with a different word that carries the same gloss. Counting it wrong would be
       false; counting it silently right would leave the card's own word unlearned. */
    (ok && acceptedAlt
      ? `<div class="also">גם <b><bdi>${esc(acceptedAlt)}</bdi></b> נכון לפירוש הזה.
         הכרטיס הזה הוא <b><bdi>${esc(w.term)}</bdi></b>.</div>` : '')+
    (!ok?`<div class="reveal">${label}: <b><bdi>${esc(answer)}</bdi></b></div>`:'')+
    /* The prompt hid the word inside its own gloss, and in this direction the gloss is never
       shown again — so the example that made it worth reading would have been lost. Now that
       the card is over it can only teach, so it is restored in full. */
    (!w2m && maskTerm(w.meaning,w.term)!==w.meaning
      ? `<div class="also">הפירוש המלא: <b>${esc(w.meaning)}</b></div>` : '')+
    (!ok?`<button class="was-right" id="wasRight">בעצם ידעתי — סמן כנכון</button>`:'')+
    `<div class="assoc">
       <label>💡 האסוציאציה שלי ל"${esc(w.term)}"</label>
       <textarea id="assocInput" rows="2" placeholder="קישור/תמונה שיעזרו לזכור…">${esc(assoc[K(w.term)]||'')}</textarea>
       <div class="assoc-bar"><button id="assocSave">שמירה</button>
         <label class="shr"><input type="checkbox" id="assocShare"> שתף עם לומדים אחרים</label>
         <span class="st" id="assocSt"></span></div>
       <button class="assoc-peek" id="assocPeek">👀 מה אחרים כתבו על המילה הזאת</button>
       <div class="assoc-others hidden" id="assocOthers"></div>
     </div>
     <button class="del-live" id="delLive">🗑 אני מכיר את המילה — מחק מהמאגר</button>
     <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="nextBtn">${idx+1<deck.length?'הבא ←':'לסיכום'}</button></div>`;
  fb.classList.remove('hidden');
  let shareKnown=false;          // has the share state been read back successfully?
  function persist(){ const el=$('#assocInput'); if(!el) return; const v=el.value.trim().slice(0,ASSOC_MAX); if(v)assoc[K(w.term)]=v; else delete assoc[K(w.term)]; saveAssoc(); }
  $('#assocSave').onclick=async()=>{
    /* persist() silently slices to ASSOC_MAX. Someone who wrote a long note was told "נשמר ✓"
       and lost everything past the limit without ever being shown a limit. */
    const rawLen=($('#assocInput').value||'').trim().length;
    persist();
    $('#assocSt').textContent = rawLen>ASSOC_MAX
      ? `נשמר ✓ · נשמרו ${ASSOC_MAX} התווים הראשונים מתוך ${rawLen}`
      : 'נשמר ✓';
    const box=$('#assocShare'); if(!box || !currentUser) return;
    const txt=($('#assocInput').value||'').trim();
    if(box.checked && txt.length>=2){
      const r=await Store.shareAssoc(wLang, wKey, w.term, txt);
      $('#assocSt').textContent = r.ok ? 'נשמר ושותף ✓' : 'נשמר · השיתוף נכשל';
    } else if(shareKnown){
      /* Only take a share down when we actually KNOW the current state. If the read that fills
         this checkbox failed, an unchecked box means "we don't know", not "the learner opted
         out" — and acting on it deleted a share nobody asked to delete. */
      await Store.unshareAssoc(wLang, wKey);
    }
  };
  $('#assocInput').oninput=()=>$('#assocSt').textContent='';
  $('#nextBtn').onclick=()=>{ persist(); next(); };
  /* Sharing is per-association and starts OFF. Everything written before this feature existed
     was written privately, and none of it is ever published retroactively. */
  const wKey=K(w.term), wLang=LANG;
  const shareBox=$('#assocShare');
  if(shareBox && currentUser){
    /* Check `ok` before trusting `mine`. A failed read returned mine:false, the checkbox
       cleared itself, and the next save read that box and UNSHARED an association the learner
       had shared — while the UI said "נשמר ✓". Exactly the bug pullProgress already had. */
    Store.listSharedAssoc(wLang, wKey).then(r=>{
      if(!r || r.ok!==true) return;
      shareKnown=true;
      if($('#assocShare')) $('#assocShare').checked = !!r.mine;
    }).catch(()=>{});
  } else if(shareBox){ shareBox.closest('.shr').classList.add('hidden'); }

  $('#assocPeek').onclick=async()=>{
    const box=$('#assocOthers'); if(!box) return;
    if(!currentUser){ box.textContent='צריך חשבון כדי לראות אסוציאציות של לומדים אחרים.'; box.classList.remove('hidden'); return; }
    box.classList.remove('hidden'); box.textContent='טוען…';
    const r=await Store.listSharedAssoc(wLang, wKey);
    if(!r.ok){ box.textContent='לא ניתן לטעון כרגע.'; return; }
    box.innerHTML = r.rows.length
      ? r.rows.map(x=>`<div class="oth">${esc(x.text)}</div>`).join('')
      : '<div class="oth empty">עוד אף אחד לא שיתף כאן. אתה יכול להיות הראשון.</div>';
  };

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
  renderUnitProgress();
  goto('results');
}

/* ===== where this round leaves you in the unit =====
   The score alone answers "how did I do just now" and says nothing about "how far am I". A
   learner could practise the same unit for a month without ever being told they had covered it.
   Language-agnostic on purpose: classify() and scopeWords() already work off LANG, so Hebrew
   and English get this from the same code and can never drift apart.
   Counted BEFORE commitSession runs on this screen? No — commitSession has already run by the
   time finishRound is reached, so these numbers include the round just finished. */
function renderUnitProgress(){
  const host=$('#unitProg'); if(!host) return;
  const scope=sessionScope;
  const c=classify(scope);
  if(!c.total){ host.innerHTML=''; return; }
  const met=c.strong+c.weak;                       // words this learner has actually faced
  const pct=n=>c.total?(100*n/c.total):0;
  const title=scope.startsWith('unit:') ? 'יחידה '+scope.slice(5) : scopeTitle(scope);

  /* What THIS round moved. session still holds the round's entries at this point. */
  let newlyMet=0, newlySolid=0;
  for(const e of session.values()){
    const r=stats.words[K(e.w.term)];
    if(!r) continue;
    if(int0(r.seen)===1) newlyMet++;               // first time ever faced
    if(e.mastered && e.firstTry && int0(r.level)>=3) newlySolid++;
  }
  const gain=[];
  if(newlyMet)   gain.push(`<b>${newlyMet}</b> מילים חדשות שלא פגשת לפני היום`);
  if(newlySolid) gain.push(`<b>${newlySolid}</b> עלו לחוזק מלא`);

  const allMet = c.fresh===0;
  const allSolid = c.strong+ (c.skipped||0) === c.total;

  host.innerHTML=`
    <div class="up-card">
      <div class="up-top"><b>${esc(title)}</b><span>${met
        ? `${met} מתוך ${c.total} מילים פגשת`
        : `טרם התחלת · ${c.total} מילים`}</span></div>
      <div class="up-bar">
        <i class="s" style="width:${pct(c.strong)}%"></i>
        <i class="w" style="width:${pct(c.weak)}%"></i>
        <i class="k" style="width:${pct(c.skipped||0)}%"></i>
        <i class="n" style="width:${pct(c.fresh)}%"></i>
      </div>
      <div class="up-keys">
        <span><i style="background:#4e8d55"></i>בשליטה <b>${c.strong}</b></span>
        <span><i style="background:#c9962f"></i>בעבודה <b>${c.weak}</b></span>
        ${c.skipped?`<span><i style="background:var(--line)"></i>דילגת <b>${c.skipped}</b></span>`:''}
        <span><i style="background:var(--paper-deep);border:1px solid var(--line)"></i>לא פגשת <b>${c.fresh}</b></span>
      </div>
      ${gain.length?`<div class="up-gain">בסבב הזה: ${gain.join(' · ')}</div>`:''}
      ${allSolid ? `<div class="up-done">🎉 סיימת את ${esc(title)} — כל המילים בשליטה.</div>`
        : allMet ? `<div class="up-done">✓ פגשת את כל ${c.total} המילים ב${esc(title)}. נשארו ${c.weak} לחזק.</div>`
        : ''}
    </div>`;

  /* Closing a whole unit is the biggest thing that happens in this app, and until now it was a
     line of text inside a card the learner had to notice. Once — the first time a unit turns
     solid — it gets the screen. Never again for that unit: a celebration that repeats every
     visit stops being one, and starts being something to dismiss. */
  if(allSolid) celebrateUnit(scope, title, c.total);
}

/* Written in the app's own palette rather than the usual confetti primaries: gold, rust and the
   deep green the "בשליטה" key already uses. Fired from the two lower corners, the way real
   fireworks are seen — from below. */
const CHEERS = [
  ['יחידה שלמה.', 'כל מילה כאן כבר שלך.'],
  ['סגרת אותה.', 'זה נראה גדול מבחוץ, ואתה עברת את זה מילה-מילה.'],
  ['הכול בשליטה.', 'היחידה הזאת כבר לא תפתיע אותך במבחן.'],
  ['נגמרה היחידה.', 'מי שמגיע לכאן כבר לא מחפש קיצורי דרך.'],
];
function celebrateUnit(scope, title, total){
  const seen = LS.get('hw_celebrated', {});
  const key = (LANG||'he') + ':' + scope;
  if(!isObj(seen) || seen[key]) return;             // one unit, one celebration, ever
  const mark = isObj(seen) ? seen : {};
  mark[key] = 1; LS.set('hw_celebrated', mark);

  const [head, sub] = CHEERS[Math.floor(Math.random()*CHEERS.length)];
  $('#cheerTitle').textContent = head;
  $('#cheerSub').textContent   = sub;
  $('#cheerUnit').textContent  = title + ' · ' + total + ' מילים';
  show($('#cheer'));
  // motion is decoration here; the message carries the meaning on its own
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) fireworks($('#cheerCanvas'));
}
function fireworks(cv){
  const dpr = Math.min(devicePixelRatio||1, 2);
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w*dpr; cv.height = h*dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const COLS = ['#c9962f','#a63c26','#4e8d55','#d8a94a','#b8622f'];
  const parts = [];
  function burst(x, y, scale){
    const col = COLS[Math.floor(Math.random()*COLS.length)];
    const n = 46 + Math.floor(Math.random()*22);
    for(let i=0;i<n;i++){
      const a  = (Math.PI*2*i)/n + Math.random()*0.18;
      // a ring, not a disc: real bursts are a shell, and varying the speed only slightly
      // keeps that shape while the drag below softens it into a cloud
      const sp = (2.5 + Math.random()*2.2) * scale;
      parts.push({x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:1, col,
                  r: 1.6 + Math.random()*2.1});
    }
  }
  let t = 0, raf = 0;
  /* Spread across the full width and staggered in size: a volley, not a metronome. The last
     one lands around frame 130, and the whole thing is over in roughly five seconds. */
  const shots = [[0.20,0.26,1.00],[0.76,0.20,0.85],[0.50,0.13,1.15],[0.32,0.34,0.75],
                 [0.86,0.38,0.80],[0.12,0.18,0.90],[0.62,0.30,1.05],[0.42,0.22,0.70]];
  const EVERY = 16;
  (function frame(){
    t++;
    // one burst every ~16 frames, then let the last shell fall and STOP — this is a moment,
    // not an ambient effect, and a canvas that never stops drains a phone battery
    const i = Math.floor((t-1)/EVERY);
    if((t-1) % EVERY === 0 && i < shots.length) burst(w*shots[i][0], h*shots[i][1], shots[i][2]);
    g.clearRect(0,0,w,h);
    g.globalCompositeOperation = 'lighter';     // overlapping sparks brighten, as light does
    for(const p of parts){
      p.x += p.vx; p.y += p.vy; p.vy += 0.052; p.vx *= 0.988; p.vy *= 0.988;
      p.life -= 0.0072;
      if(p.life <= 0) continue;
      const a = Math.max(0, p.life);
      g.globalAlpha = a * a;                    // fade slowly, then fall away quickly
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r * (0.55 + a*0.45), 0, Math.PI*2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    for(let j=parts.length-1;j>=0;j--) if(parts[j].life<=0) parts.splice(j,1);
    if(parts.length || i < shots.length) raf = requestAnimationFrame(frame);
    else cancelAnimationFrame(raf);
  })();
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
/* `committed` used to be a one-way latch, cleared only in startRound. But visibilitychange
   commits mid-round — so on a phone, the first incoming notification committed the 3 words
   answered so far and then LATCHED. Everything answered afterwards was thrown away: the
   results screen said 10/10 while storage held 3, and the session log recorded {total:3}.
   Committing mid-round is right; refusing to commit again is not. The latch now guards only
   against committing the SAME session twice, and answering more words makes it a new state. */
function commitSession(){
  /* Only entries not yet applied. Re-applying one would increment r.seen a second time and
     charge the learner twice for the same answer, which is the reason the old code latched. */
  const entries=[...session.entries()].filter(([k])=>!committedKeys.has(k)).map(([,e])=>e);
  if(!entries.length){ committed=true; return; }
  entries.forEach(e=>committedKeys.add(K(e.w.term)));
  committed=true;
  const now=Date.now(); let c=0,ft=0,st=0,nw=0;
  entries.forEach(e=>{
    const r=rec(e.w.term);
    const wasNew = r.seen===0;
    if(wasNew) nw++;
    r.seen++;
    if(e.mastered && e.firstTry){                       // knew it (correct on first attempt of the round)
      r.first++; r.ever++;
      // a retry of a word just missed proves short-term recall, not knowledge: credit it, but
      // never let it climb past where the word already stood before the round began
      r.level = isRetryRound ? r.level : (wasNew ? 3 : Math.min(3, r.level+1));
      ft++; c++;
    }
    else if(e.mastered){ r.ever++; r.wrong+=Math.max(0,e.attempts-1); r.level=Math.max(0,r.level-1); st++; c++; }
    else { r.wrong++; r.level=Math.max(0,r.level-1); }
    r.last=now;
  });
  /* One log row per ROUND, not per commit. A round interrupted twice used to be recorded as
     three separate rounds of 3, 4 and 3 words, which is what the trend chart on the stats
     screen then drew. The row is created on first commit and grown by every later one. */
  const row=sessionRowIdx>=0 ? stats.sessions[sessionRowIdx] : null;
  if(row){
    row.t=now; row.total+=entries.length; row.correct+=c;
    row.firstTry+=ft; row.struggled+=st; row.newCount+=nw;
  } else {
    stats.sessions.push({t:now, scope:sessionScope, mode:sessionMode,
                         total:entries.length, correct:c, firstTry:ft, struggled:st, newCount:nw});
    sessionRowIdx=stats.sessions.length-1;
  }
  if(stats.sessions.length>MAX_SESSIONS){
    const cut=stats.sessions.length-MAX_SESSIONS;
    stats.sessions=stats.sessions.slice(-MAX_SESSIONS);
    sessionRowIdx=Math.max(-1, sessionRowIdx-cut);   // the row moved; keep pointing at it
  }
  saveStats();
  /* The end of a round is the moment real progress exists, and the one moment worth spending a
     round trip on. Pushing here is what lets the per-answer debounce be long: a phone killed by
     the OS without firing pagehide loses at most the round in progress, never a finished one. */
  flushRemoteSync();
  /* Refresh the numbers the reminder is built from. Written after every round rather than once
     when permission was granted — otherwise the worker keeps announcing a streak that ended and
     the "two days away" rule can never fire, because `last` never moves. */
  // guarded: committing a round is core, notifications are peripheral, and core must not throw
  // because a peripheral is missing — which is exactly what happened to every bucket test
  if(typeof NOTIF!=='undefined' && NOTIF.granted()) NOTIF.cacheMessage();
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
/* Retrying the words you just missed must not undo the miss. startRound commits the (corrected)
   session first, so the retry begins with attempts===1 and counted as "knew it first try" —
   handing back the level the mistake had just taken away, ten seconds after the answer was
   shown on screen. The round is now flagged so the retry can restore at most what was lost. */
$('#retryMissedBtn').onclick=()=>startRound(missed.slice(), sessionScope, sessionMode, true);
$('#resBackBtn').onclick=()=>{ commitSession(); openScope(sessionScope); };
$('#resScope').onclick=()=>{ commitSession(); openScope(sessionScope); };
// safety net: if the app is closed/backgrounded on the results screen, still record the round
window.addEventListener('pagehide', ()=>{ if(!committed && session.size>0) commitSession(); });
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && !committed && session.size>0) commitSession(); });

/* ===== STATS screen ===== */
function fmt(t){ const d=new Date(t); return d.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit'})+' · '+d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}); }
function openStats(scope){
  $('#statsBrand').textContent=scopeTitle(scope);
  const body=$('#statsBody');
  const words=scopeWords(scope);
  const byTerm=new Map(); for(const w of words){ const k=K(w.term); if(!byTerm.has(k)) byTerm.set(k,w); }
  // Only words actually practiced — a list of words you have never met says nothing about
  // your strength. Weakest first, then the middle, then the ones you know.
  const all=[...byTerm.values()];
  /* Words skipped after the level test carry seen:1 so the practice queue leaves them alone —
     and this screen counted them under "ידעת מיד, בלי טעות אחת", for words the learner has
     never been shown. Third screen today to inherit that bug from the same marker. */
  const arr=all.filter(w=>{ const r=stats.words[K(w.term)]; return r && r.seen>0 && r.src!=='lv'; })
    .sort((a,b)=>{
      const ra=stats.words[K(a.term)], rb=stats.words[K(b.term)];
      if(ra.level!==rb.level) return ra.level-rb.level;      // 0 → 3
      if(rb.wrong!==ra.wrong) return rb.wrong-ra.wrong;      // more mistakes = weaker
      return rb.last-ra.last;                                // most recent first
    });
  /* Skipped words are neither practised nor unmet, so they get counted as themselves rather
     than folded into "עוד לא נפגשתם" — which would have been the same lie in a quieter place. */
  const skippedN=all.filter(w=>wasSkipped(w.term)).length;
  const untouched=all.length-arr.length-skippedN;
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
  /* ===== the word cloud =====
     The old screen was a flat list, weakest first, every row the same size — so the eleven words
     that keep beating you looked exactly like the six hundred you got right on sight. The list
     was accurate and unreadable, which is the same as unhelpful.
     Score = wrong − first: how many times, NET, this word has beaten you. A word missed five
     times and never known on sight scores 5. A word missed once and known first-try four times
     scores −3. One subtraction, and it explains itself in a sentence. */
  const score=w=>{ const r=stats.words[K(w.term)]; return r ? (int0(r.wrong)-int0(r.first)) : 0; };
  const tier=s=> s>=3 ? 3 : s>=1 ? 2 : 0;   // scores are whole numbers, so 0<s<1 cannot occur
  const fight=[], nearly=[], settled=[], instant=[];
  for(const w of arr){
    const r=stats.words[K(w.term)], s=score(w);
    if(s>=3) fight.push(w);
    else if(s>=1) nearly.push(w);
    else if(int0(r.wrong)>0) settled.push(w);
    else instant.push(w);
  }
  const bySc=(a,b)=>score(b)-score(a);
  fight.sort(bySc); nearly.sort(bySc);

  const chip=(w,t)=>{ const r=stats.words[K(w.term)];
    return `<button class="cw t${t}" data-w="${esc(w.term)}" title="נראתה ${int0(r.seen)}× · ${int0(r.first)} בפעם הראשונה · ${int0(r.wrong)} טעויות"
      ><bdi>${esc(w.term)}</bdi>${int0(r.wrong)?`<em>${int0(r.wrong)}</em>`:''}</button>`; };
  const cloud=(list,id)=>`<div class="cloud" id="${id}">${list.map(w=>chip(w,tier(score(w)))).join('')}</div>`;

  html+=`<div class="section-t">איפה אתה נלחם</div>`;
  if(!arr.length){
    html+=`<p class="msg" style="color:var(--ink-soft)">עדיין לא תרגלת מילים בתחום הזה — תרגל סבב אחד והתמונה תופיע כאן.</p>`;
  }else{
    html+=`<p class="cloud-note">ככל שמילה גדולה וכהה יותר, כך היא הפילה אותך יותר פעמים.
      המספר לידה הוא מספר הטעויות. לחיצה על מילה מראה את הפירוש.</p>`;
    if(fight.length){
      html+=`<p class="cloud-note" style="margin-bottom:2px"><b>${fight.length} מילים לא מוותרות לך.</b> כאן נמצאת העבודה.</p>`
        + cloud(fight.slice(0,80),'cloudFight')
        + `<button class="btn btn-primary btn-block" id="drillFight" style="margin:6px 0 18px">תרגל בדיוק את ${Math.min(fight.length,30)} המילים האלה ←</button>`;
    }
    if(nearly.length) html+=`<p class="cloud-note" style="margin-bottom:2px">${nearly.length} מילים כמעט בשליטה.</p>`
      + cloud(nearly.slice(0,80),'cloudNearly');
    /* The two quiet groups get a line each and no cloud. Drawing six hundred words you already
       know is exactly the noise this screen was rebuilt to remove. */
    if(settled.length||instant.length||skippedN){
      html+=`<div class="quiet-line" style="margin-top:14px">`
        + (settled.length?`<div>נאבקת ונסגר: <b>${settled.length}</b> מילים שטעית בהן בעבר וכבר יודע.</div>`:'')
        + (instant.length?`<div style="margin-top:6px">ידעת מיד: <b>${instant.length}</b> מילים, בלי טעות אחת.</div>`:'')
        + (untouched?`<div style="margin-top:6px">עוד לא נפגשתם: <b>${untouched}</b> מילים.</div>`:'')
        + (skippedN?`<div style="margin-top:6px">דילגת אחרי מבחן הרמה: <b>${skippedN}</b> מילים.
             <span style="opacity:.75">ניהול מילים ← שחזור.</span></div>`:'')
        + `</div>`;
    }
  }
  body.innerHTML=html;
  /* Tapping a word reveals its meaning under the row it sits in, and tapping again hides it.
     A tooltip would be unreachable on the phones most of these learners use. */
  body.querySelectorAll('.cw').forEach(b=>b.onclick=()=>{
    const nx=b.nextElementSibling;
    if(nx && nx.classList.contains('cw-meaning')){ nx.remove(); return; }
    const w=byTerm.get(K(b.dataset.w)); if(!w) return;
    b.insertAdjacentHTML('afterend', `<div class="cw-meaning"><b><bdi>${esc(w.term)}</bdi></b> — ${esc(w.meaning)}</div>`);
  });
  const drill=$('#drillFight');
  if(drill) drill.onclick=()=>startRound(fight.slice(0,30), scope, 'weak');
  goto('stats');
}
$('#statsBack').onclick=()=>openScope(curScope);

/* ===== MANAGE ===== */
function deleteWord(term){ const k=K(term); deleted.add(k); saveDeleted(); delete assoc[k]; saveAssoc(); delete stats.words[k]; saveStats(); buildBank(); }
let mSel=new Set();
/* Every entry in the language, INCLUDING the deleted ones. BANK cannot serve this screen: it
   drops deleted words by design, so the one place that is supposed to bring them back never
   listed them. Read from the raw data instead, and mark each row's state. */
function manageItems(){
  const data=(LANG==='en' ? window.UNIT_DATA_EN : window.UNIT_DATA) || {};
  const out=[];
  for(const u of Object.keys(data).sort((a,b)=>+a-+b))
    for(const p of (data[u]||[])) if(Array.isArray(p))
      out.push({term:p[0], meaning:p[1], unit:u, gone:deleted.has(K(p[0]))});
  /* buildBank folds a duplicate away (first unit wins); this screen did not, so a word the user
     added by hand that also exists in a unit appeared twice here and once everywhere else. */
  const seen=new Set(out.map(w=>K(w.term)));
  for(const p of added) if(Array.isArray(p)){
    const k=K(p[0]); if(!k || seen.has(k)) continue; seen.add(k);
    out.push({term:p[0], meaning:p[1], unit:'custom', gone:deleted.has(k)});
  }
  return out;
}
let mOpen=new Set();      // which unit sections are expanded
let mSearching=false;     // was the previous render a search? (so clearing can collapse again)
/* Grouped by unit and collapsed by default. The old screen was one flat alphabetical list
   cut at `slice(0,400)` — so 3,500 of 3,900 words simply were not there, with nothing on
   screen saying so. Sections keep the DOM small without hiding anything. */
function renderManage(filter){
  const list=$('#manageList');
  const raw=String(filter||'').trim();
  const f=norm(raw);
  const all=manageItems();
  const hit=w=>!f || norm(w.term).includes(f) ||
    (w.meaning && w.meaning.replace(NIQ,'').includes(raw));
  const items=all.filter(hit);
  const byUnit=new Map();
  for(const w of items){ if(!byUnit.has(w.unit)) byUnit.set(w.unit,[]); byUnit.get(w.unit).push(w); }
  /* Searching opens the units it found; CLEARING the box has to close them again. Without the
     else branch the expansion survived, so search-then-clear rendered all 3,900 rows at once —
     exactly the DOM this screen was rebuilt to stop producing. */
  if(raw) mOpen=new Set(byUnit.keys());
  else if(mSearching) mOpen=new Set();
  mSearching=!!raw;

  if(!items.length){
    list.innerHTML='<p class="msg" style="color:var(--ink-soft)">לא נמצאו מילים</p>';
    $('#mCount').textContent=`${mSel.size} נבחרו`;
    return;
  }
  const rowHtml=w=>`<label class="m-row${w.gone?' is-gone':''}">
      <input type="checkbox" data-term="${esc(w.term)}" ${mSel.has(w.term)?'checked':''} ${w.gone?'disabled':''}>
      <b>${esc(w.term)}</b><span>${esc(w.meaning)}</span>
      ${w.gone?`<button class="m-undo" data-undo="${esc(w.term)}" title="החזר מילה זו">↺ החזר</button>`:''}</label>`;

  list.innerHTML=[...byUnit.entries()].map(([u,ws])=>{
    const gone=ws.filter(w=>w.gone).length;
    const open=mOpen.has(u);
    const name=u==='custom'?'המילים שלי':'יחידה '+u;
    return `<div class="m-group">
      <button class="m-head" data-unit="${esc(u)}" aria-expanded="${open}">
        <i>${open?'▾':'◂'}</i><b>${name}</b>
        <span>${ws.length} מילים${gone?` · <em>${gone} נמחקו</em>`:''}</span>
      </button>
      <div class="m-body${open?'':' hidden'}">${open?ws.map(rowHtml).join(''):''}</div>
    </div>`;
  }).join('');

  list.querySelectorAll('.m-head').forEach(b=>b.onclick=()=>{
    const u=b.dataset.unit;
    if(mOpen.has(u)) mOpen.delete(u); else mOpen.add(u);
    renderManage($('#mSearch').value);
  });
  list.querySelectorAll('.m-row input').forEach(c=>c.onchange=()=>{
    c.checked?mSel.add(c.dataset.term):mSel.delete(c.dataset.term);
    $('#mCount').textContent=`${mSel.size} נבחרו`;
  });
  /* Per-word restore. "שחזר מחיקות" is all-or-nothing, which is the wrong tool when you
     deleted forty words on purpose and one of them by mistake. */
  list.querySelectorAll('[data-undo]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const uk=K(b.dataset.undo); deleted.delete(uk); markRestored(uk);
    saveDeleted(); buildBank(); renderManage($('#mSearch').value); renderHome();
    toast('הוחזרה: '+b.dataset.undo);
  });
  $('#mCount').textContent=`${mSel.size} נבחרו`;
}
$('#manageBtn').onclick=()=>{ mSel=new Set(); $('#mSearch').value=''; $('#mMsg').classList.add('hidden'); renderManage(''); goto('manage'); };
$('#mSearch').oninput=e=>renderManage(e.target.value);
$('#mDelete').onclick=()=>{
  const m=$('#mMsg'); m.classList.remove('hidden'); m.className='msg';
  if(mSel.size===0){ m.textContent='לא נבחרו מילים.'; return; }
  /* The selection survives collapsing a unit and changing the search, so it was possible to tick
     twenty words in unit 4, search for something else, press delete, and remove twenty words
     that were nowhere on screen. The dialog said "delete 20 words?" and named none of them.
     It names them now, and says plainly how many are out of view. */
  const shown=new Set([...document.querySelectorAll('#manageList .m-row input')].map(c=>c.dataset.term));
  const hidden=[...mSel].filter(t=>!shown.has(t));
  const names=[...mSel].slice(0,8).join(' · ') + (mSel.size>8 ? ` ועוד ${mSel.size-8}` : '');
  const warn = hidden.length ? `

${hidden.length} מהן אינן מוצגות כרגע על המסך.` : '';
  if(!confirm(`למחוק ${mSel.size} מילים?

${names}${warn}

(ניתן לשחזר דרך ניהול מילים)`)){
    m.classList.add('hidden'); return; }
  mSel.forEach(t=>{ const k=K(t); deleted.add(k); markDeletedAgain(k); delete assoc[k]; delete stats.words[k]; });
  saveDeleted(); saveAssoc(); saveStats(); buildBank();
  m.className='msg ok'; m.textContent=`נמחקו ${mSel.size} מילים.`; mSel=new Set(); renderManage($('#mSearch').value); renderHome();
};
/* Restores BOTH kinds of removal. The level test promised "תמיד אפשר להחזיר אותן דרך ניהול
   מילים" and wrote a src:'lv' marker for exactly that purpose — and then nothing ever read it.
   The undo was designed and never built, so the promise on that screen was false. */
$('#mRestore').onclick=()=>{
  const skipped=Object.keys(stats.words||{}).filter(k=>stats.words[k] && stats.words[k].src==='lv');
  if(deleted.size===0 && !skipped.length){ toast('אין מה לשחזר'); return; }
  const parts=[];
  if(deleted.size) parts.push(`${deleted.size} מילים שנמחקו`);
  if(skipped.length) parts.push(`${skipped.length} מילים שדילגת עליהן אחרי מבחן הרמה`);
  if(!confirm('לשחזר '+parts.join(' ו-')+'?')) return;
  if(deleted.size){ deleted.forEach(markRestored); deleted=new Set(); saveDeleted(); }
  if(skipped.length){ skipped.forEach(k=>{ delete stats.words[k]; markRestored(k); }); saveStats(); }
  buildBank(); renderManage($('#mSearch').value); renderHome();
  toast('שוחזר: '+parts.join(' · '));
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
/* BANK is empty until enterLang() runs, and the admin panel is reachable straight from the
   welcome screen — so "back" used to land on a home screen with no units, no counts and every
   button disabled. Go back to where the user actually came from. */
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{
  if(!committed && session.size>0) commitSession();
  if(!BANK.length || (LANG!=='he' && LANG!=='en')){ renderWelcome(); return; }
  renderHome(); goto('home');
});
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>openScope(b.dataset.scope));

/* ===== PWA ===== */
/* ===== staying up to date =====
   Registering the worker was the whole update story, and it is not enough: a page that stays
   open never asks again, so a learner could sit on a build from days ago while the footer
   quietly suggested they reload. Three parts now — ask again on every return to the app,
   notice when a new worker takes over, and apply it at a moment that costs nothing. */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
  // an installed PWA can live for days in the background; check whenever it comes back
  const askForUpdate=()=>{ navigator.serviceWorker.ready.then(r=>r.update()).catch(()=>{}); };
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ askForUpdate(); pullIfStale(); checkBuildNow(); } });
  window.addEventListener('online', ()=>{ askForUpdate(); pullIfStale(); checkBuildNow(); });
  window.addEventListener('focus', ()=>{ pullIfStale(); checkBuildNow(); });
  navigator.serviceWorker.addEventListener('message', e=>{
    if(!e.data || e.data.type!=='sw-activated') return;
    if(String(e.data.rev)===String(BUILD)) return;      // already running it
    applyUpdate(e.data.rev);
  });
}
/* The app pushed to the cloud but never pulled again after the language was entered — there is
   no poll and no realtime channel. So a learner who practised on their phone and left the
   laptop tab open all day saw nothing from the phone, and the laptop's next save pushed a state
   that had never seen it. Coming back to the app is the natural moment to reconcile.
   Throttled, because visibilitychange fires on every alt-tab. */
let lastPull=0;
function pullIfStale(){
  if(!currentUser || (LANG!=='he' && LANG!=='en')) return;
  const now=Date.now();
  if(now-lastPull < 60000) return;
  lastPull=now;
  syncWithRemote(LANG);
}
let updatePending=null;
/* Reloading mid-round would throw away answers the learner has not committed yet, so the new
   build is applied only from a screen where nothing is in flight. Otherwise the bar appears and
   waits for a tap — deliberately NOT applied automatically when the round ends, because that
   moment is the results screen and reloading would erase what they are reading. */
function updateSafeNow(){
  const busy=['quiz','exam','level'];
  return !busy.includes(currentScreenId()) && !(typeof session!=='undefined' && session.size>0 && !committed);
}
/* May this tab reload itself right now?
   The first version remembered only the LAST version it tried, which two real situations
   defeat outright. Two builds alternating — GitHub Pages serves index.html with max-age=600 and
   different edges can disagree for minutes after a deploy, and a rollback does the same — bounce
   A→B→A→B forever, because each reload sees a version different from the one remembered. And
   when sessionStorage cannot be written at all (Safari private mode, iOS Lockdown), the empty
   catch meant nothing was ever remembered and EVERY call reloaded.
   So: count reloads in a window instead of remembering one version, and read the counter back
   to prove the write actually stuck. If it cannot be counted, do not reload — show the bar. */
const UPD_MAX=2, UPD_WINDOW=15*60*1000;
function mayAutoReload(){
  try{
    const now=Date.now();
    let o=null;
    try{ o=JSON.parse(sessionStorage.getItem('hw_updN')||'null'); }catch(e){}
    if(!isObj(o) || typeof o.n!=='number' || typeof o.t0!=='number' || now-o.t0>UPD_WINDOW) o={n:0,t0:now};
    if(o.n>=UPD_MAX) return false;
    o.n++;
    const payload=JSON.stringify(o);
    sessionStorage.setItem('hw_updN', payload);
    return sessionStorage.getItem('hw_updN')===payload;   // storage that silently drops writes
  }catch(e){ return false; }
}
function applyUpdate(rev){
  if(!rev || String(rev)===String(BUILD)) return;
  updatePending=rev;
  if(updateSafeNow() && mayAutoReload()){ location.reload(); return; }
  showUpdateBar(rev);
}
/* renderBuildTag runs only from the welcome screen, and `sw-activated` fires once. A learner who
   stays inside a language after a deploy therefore had no path back to a fresh build at all —
   registration.update() on an already-active worker produces no second activate and no second
   message. Ask the server directly when the app comes back to the foreground. */
let lastBuildCheck=0;
async function checkBuildNow(){
  const now=Date.now();
  if(now-lastBuildCheck < 5*60*1000) return;
  lastBuildCheck=now;
  const sv=await serverBuild();
  if(sv && sv!==BUILD) applyUpdate(sv);
}
function showUpdateBar(rev){
  let bar=$('#updBar');
  if(!bar){
    bar=document.createElement('button');
    bar.id='updBar'; bar.className='upd-bar';
    bar.onclick=()=>location.reload();
    document.body.appendChild(bar);
  }
  bar.innerHTML=`גרסה ${rev} מוכנה — לחץ לרענון`;
  bar.classList.remove('hidden');
  document.body.classList.add('has-upd');   // lift the bug-report button clear of the bar
}

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
  /* A word skipped after the level test carries src:'lv'. It is marked level:3 so it stays out
     of "מילים חדשות", but it was never practised here and must NOT be counted as learned —
     that is what made the dashboard jump by thousands after one placement test and report a
     number nobody had earned. */
  let learned=0, practised=0, weak=0, skipped=0;
  keys.forEach(k=>{ const r=words[k]; if(!isObj(r)) return;
    if(r.src==='lv'){ skipped++; return; }
    if(int0(r.seen)>0) practised++;
    if(int0(r.level)>=3) learned++;
    else if(int0(r.seen)>0) weak++;      // met, not yet solid — the same rule classify() uses
  });
  return {total:keys.size, learned, practised, weak, skipped,
          fresh: Math.max(0, keys.size-practised-skipped),
          pct: keys.size? Math.round(100*learned/keys.size):0};
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
  // the last seven days, each carrying its weekday letter so the strip explains itself:
  // five filled bars next to a streak of 1 looks like a contradiction until you see WHERE the gap is
  const HE_DAY=['א','ב','ג','ד','ה','ו','ש'];
  const week=[];
  for(let i=6;i>=0;i--){
    const t=now-i*DAY;
    week.push({on: days.has(dayKey(t)), label: HE_DAY[new Date(t).getDay()], today: i===0});
  }
  return {n, today: days.has(dayKey(now)), week, total: days.size};
}
function renderWelcome(){
  const name=(LS.get('hw_name','')||'').trim();
  $('#greet').textContent = name ? greeting()+', '+name : greeting()+'!';
  /* Each language reports its own numbers. Averaging 1,713 Hebrew words with 3,694 English
     ones produced a single percentage that described neither. */
  for(const [lang, s] of [['he', langSummary('he')], ['en', langSummary('en')]]){
    $('#'+lang+'Pct').textContent     = s.pct+'%';
    $('#'+lang+'Learned').textContent = s.learned;
    $('#'+lang+'Pract').textContent   = s.practised;
    $('#'+lang+'Count').textContent   = 'מתוך '+s.total;
    $('#'+lang+'Prog').style.width    = s.pct+'%';
    $('#'+lang+'Prog').parentElement.title = `למדת ${s.learned} מתוך ${s.total}`;
  }

  const st=streakInfo();
  const days = n => n===1 ? 'יום רצוף' : 'ימים רצוף';
  $('#dStreak').textContent=st.n;
  $('#dStreakLbl').textContent=days(st.n);
  $('#dWeek').innerHTML=st.week.map(d=>
    `<i class="${d.on?'on':''}${d.today?' now':''}"><em>${d.label}</em></i>`).join('');
  $('#greetSub').textContent =
    st.n===0   ? 'מוכן לתרגל? בחר את השפה שתרצה לתרגל היום'
  : st.today   ? `כבר תרגלת היום — ${st.n} ${days(st.n)}. כל הכבוד.`
               : `${st.n} ${days(st.n)}. תרגול קצר היום שומר על הרצף.`;
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

/* The test exists in both languages and writes to two different keys, but this gate read only
   the English one — so a learner who finished the Hebrew test was sent back to the level screen
   on every sign-in, and the Hebrew result was stored and never used for anything. */
function levelDone(){ return LS.get('hw_level', null) || LS.get('hw_level_he', null); }

/* The test now exists in both languages. LV_LANG says which bank is being answered;
   everything downstream (the result key, the skip offer, the speaker button) reads it. */
let LV_LANG='en';
const lvKey = () => LV_LANG==='he' ? 'hw_level_he' : 'hw_level';
function lvPool(band){
  const bank = LV_LANG==='he'
    ? (Array.isArray(window.LEVEL_TEST_HE) ? window.LEVEL_TEST_HE : [])
    : (Array.isArray(window.LEVEL_TEST)    ? window.LEVEL_TEST    : []);
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
  bindSay('#lvSay', LV_LANG==='en' ? it.w : null, true);
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
  lvTimer=setTimeout(()=>{ lvIdx++; lvRender(); }, ok?320:900);
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
  LS.set(lvKey(), level||'A1'); queueRemoteSync();
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
  /* The offer is for someone STARTING OUT. Once an account holds practice history the test
     is a measurement, not a setup step — and offering to rewrite that history is how a real
     account lost 2,470 records. Ranks exist only for English, so Hebrew never qualifies. */
  const already = hasProgressIn('en');
  const skippable = (LV_LANG==='en' && already < 10) ? lvCountKnown(level) : 0;
  if(LV_LANG==='en' && already >= 10){
    $('#lvOfferText').innerHTML='';
    console.info('[lv] הצעת הדילוג הושמטה — לחשבון כבר יש '+already+' מילים עם התקדמות');
  }
  if(skippable>=40){
    show($('#lvOffer'));
    $('#lvOfferText').innerHTML=`מצאתי <b>${skippable}</b> מילים באנגלית שנמצאות הרבה מתחת לרמה שהדגמת
      עכשיו, ולכן כמעט בוודאי כבר מוכרות לך.
      <br><span style="color:var(--ink-soft);font-size:.86rem">מה זה עושה בפועל: המילים האלה יוצאות
      מ"מילים חדשות" ולא יגיעו אליך בתרגול, כדי שתתחיל ישר במה שבאמת חסר לך. הן <b>לא</b> נמחקות
      ו<b>לא</b> נספרות כמילים שלמדת — מספר הנלמדות שלך לא יזוז מזה.
      להחזיר אותן: ניהול מילים ← שחזור.</span>`;
    $('#lvApply').onclick=()=>{ const n=lvApplyKnown(level); hide($('#lvOffer'));
      toast(`${n} מילים הוצאו מהתרגול · ניתן להחזיר בניהול מילים`); };
    $('#lvNoApply').onclick=()=>hide($('#lvOffer'));
  } else if(LV_LANG==='he'){
    /* Hebrew used to land here with an empty panel and no explanation at all. It cannot offer
       the same thing English does: skipping is driven by a frequency rank, and there is no
       Hebrew frequency source in the project. The unit number is the only signal available and
       it is not a difficulty signal — so an offer built on it would be a claim the data does
       not support. Say what happened instead of showing nothing. */
    show($('#lvOffer'));
    $('#lvOfferText').innerHTML=`התוצאה נשמרה ומשמשת את האפליקציה מכאן והלאה.
      <br><span style="color:var(--ink-soft);font-size:.86rem">בעברית אין עדיין דילוג אוטומטי על
      מילים שאתה כבר יודע — הדילוג באנגלית נשען על דירוג שכיחות, ולעברית אין מקור כזה. עד שיהיה,
      אפשר להוציא מילים מוכרות ידנית דרך ניהול מילים.</span>`;
    $('#lvApply').classList.add('hidden');
    $('#lvNoApply').textContent='הבנתי';      // there is nothing here to decline
    $('#lvNoApply').onclick=()=>hide($('#lvOffer'));
  }
  if(LV_LANG!=='he'){
    $('#lvApply').classList.remove('hidden');
    $('#lvNoApply').textContent='לא, אתרגל הכל';
  }
}
/* Only English has frequency ranks, so the skip offer applies to the English bank.
   The cut sits TWO bands below where the learner tested. One band below was too greedy:
   a C2 result cleared 20000, which is every ranked word in the bank — the app offered to
   mark 3175 of 3694 words known off the back of a single test. Skipping should only ever
   cover words that are far easier than the ceiling that was actually demonstrated. */
const LV_CUT={A1:0, A2:0, B1:600, B2:2000, C1:5000, C2:10000};
function lvRankOf(term){ const m=window.EN_RANK; return m ? m[normEn(term)] : null; }
/* Counts what will ACTUALLY be marked, which is not the same as what is below the cut.
   The old version counted every ranked word under the cut across the whole bank and ignored
   history and deletions — so it advertised 2,470 while lvApplyKnown, which skips any word that
   already has a record, would mark far fewer. A number on a confirmation screen has to be the
   number the button produces, or the screen is lying about what you are agreeing to. */
function lvCountKnown(level){
  const cut=LV_CUT[level]; if(!cut) return 0;
  const data=window.UNIT_DATA_EN||{};
  const raw=LS.get('hw_stats_en', null);
  const words=(isObj(raw) && isObj(raw.words)) ? raw.words : {};
  const gone=new Set(LS.get('hw_deleted_en', []) || []);
  let n=0;
  for(const u in data) for(const p of (data[u]||[])){
    const r=lvRankOf(p[0]); if(!(r && r<=cut)) continue;
    const k=normEn(p[0]);
    if(!k || words[k] || gone.has(k)) continue;
    n++;
  }
  return n;
}
/* Does this account already hold real practice history in `lang`?
   Read straight from storage: the caller may be standing in the OTHER language, and
   switching LANG just to count would be a side effect on a read. */
function hasProgressIn(lang){
  try{
    const raw=LS.get(lang==='en' ? 'hw_stats_en' : 'hw_stats', null);
    const w=(isObj(raw) && isObj(raw.words)) ? raw.words : null;
    if(!w) return 0;
    let n=0; for(const k in w){ const r=w[k]; if(isObj(r) && Number(r.seen)>0) n++; }
    return n;
  }catch(e){ return 0; }
}

/* Marks words as already known. TWO rules exist because breaking either one destroyed a
   real account: a level test wrote {seen:1,wrong:0,level:3} over 2,470 words and erased
   every practice count behind them.
   1. An existing record is NEVER touched — not even a weak one. History outranks a guess.
   2. Records written here carry src:'lv', so a mistaken run can always be told apart from
      genuine practice and undone. Without that marker the two are indistinguishable. */
function lvApplyKnown(level){
  const cut=LV_CUT[level]; if(!cut) return 0;
  const wasLang=LANG;
  LANG='en'; loadLangState();
  const data=window.UNIT_DATA_EN||{}; let n=0; const stamp=Date.now();
  for(const u in data) for(const p of (data[u]||[])){
    const r=lvRankOf(p[0]); if(!(r && r<=cut)) continue;
    const k=normEn(p[0]); if(!k) continue;
    if(stats.words[k]) continue;                       // any history at all — leave it alone
    stats.words[k]={seen:1,first:1,ever:1,wrong:0,level:3,last:stamp,src:'lv'};
    n++;
  }
  saveStats();
  /* saveStats only SCHEDULES a push, 1500ms out — and LANG is restored on the next line, so by
     the time it fired it was pushing the other language's row. The 40+ words just marked as
     known never reached the cloud, and on a second device the learner met them as new.
     Pushed here, while the English state is still the loaded one — and only after a confirmed
     read, so a dropped request can't overwrite a real English row with this partial snapshot. */
  if(currentUser && window.Store){
    const snap={assoc, stats, deleted:[...deleted], added, dir:direction, extras:collectExtras('en')};
    (async()=>{
      try{
        const res=await Store.pullProgress('en');
        if(!res || res.ok!==true) return;
        let m=snap;
        if(res.data){
          /* mergeProgress keys `added` through K(), which reads the CURRENT language — and by
             the time this resolves LANG is back to Hebrew. Pin it for the merge itself. */
          const here=LANG; LANG='en';
          try{ m=mergeProgress(snap, res.data); } finally { LANG=here; }
          applyExtras('en', res.data.extras);
        }
        await Store.pushProgress('en', {...m, extras:collectExtras('en')});
      }catch(e){}
    })();
  }
  LANG=wasLang; loadLangState(); buildBank();
  return n;
}
$('#lvStart').onclick=startLevelTest;
const lvStart = lang => { LV_LANG=lang;
  $('#lvIntroLang').textContent = lang==='he' ? 'עברית' : 'אנגלית';
  hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); };
const lvBtn=$('#lvOpen');     if(lvBtn) lvBtn.onclick=()=>lvStart('en');
const lvBtnHe=$('#lvOpenHe'); if(lvBtnHe) lvBtnHe.onclick=()=>lvStart('he');
$('#lvSkip').onclick=()=>{ LS.set(lvKey(),'skipped'); renderWelcome(); };
$('#lvExit').onclick=()=>{ if(confirm('לצאת מהמבחן? התוצאות לא יישמרו.')){ clearTimeout(lvTimer); renderWelcome(); } };
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
  /* A one-word gloss that is itself a word in the bank makes an unfair write-in: "בד" is a
     defensible answer to the prompt "בד", and the item was after אָרִיג. Seven of them —
     אריג/בד, זרד/ענף, אסקופה/סף, נפיל/ענק, טלף/פרסה, זלזל/ענף, פארה/ענף. They stay in
     practice, where the direction is stated and the feedback teaches, but they never take a
     write-in slot in a graded test. */
  const glossIsAWord=it=>{
    const m=String(it.meaning).trim();
    if(!/^[֐-׿]+$/.test(m)) return false;
    const k=norm(m);
    return k!==norm(it.term) && BANK.some(w=>norm(w.term)===k);
  };
  const goodProduce=it=>oneWord(it.term) && !isTranslit(it.meaning, it.term) && !glossIsAWord(it);
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
      return d.length<3 ? null : {kind, it, prompt:maskTerm(it.meaning,it.term), answer:it.term, opts:shuffle([it.term,...d])};
    }
    // A write-in has no options to disambiguate it, so if two words in the unit share a gloss
    // the prompt genuinely has two right answers — the unit lists both זלזל and פארה as "ענף".
    // Accept all of them. Marking someone wrong for the synonym they happened to recall is the
    // exact failure this whole audit was about.
    const accept=pool.filter(o=>norm(o.meaning)===norm(it.meaning)).map(o=>o.term);
    return {kind, it, prompt:maskTerm(it.meaning,it.term), answer:it.term, opts:null, accept};
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
  exTimer=setTimeout(()=>{ exI++; exRender(); }, ok?420:1100);
}
/* any word in the unit that carries this exact gloss counts */
/* `accept` is built per unit; practice accepts any word in the WHOLE bank carrying the same
   gloss. A learner taught in practice that פֹּארָה answers "ענף" typed it in the exam and was
   marked wrong — and that score is stored. Same question, two verdicts, and the stricter one
   is the one that counts. Falls back to the bank-wide index only when the unit list misses. */
function exWriteOk(v, q){
  const list = (q.accept && q.accept.length) ? q.accept : [q.answer];
  if(list.some(t=>isCorrect(v, t))) return true;
  const alts=glossAlts(q.it || {term:q.answer, meaning:q.question});
  return alts.length ? alts.some(t=>isCorrect(v, t)) : false;
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
  // exam history is part of the account's progress, but nothing ever asked for it to be sent —
  // so scores lived only on the device that produced them
  queueRemoteSync();
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
/* confirm() blocks the queue but does not cancel timers: answering the LAST question and then
   confirming "leave, the result will not be saved" let the pending tick fire, reach exFinish()
   and save the score anyway — and in the level test it wrote hw_level, which is the gate that
   decides whether the test is ever offered again. */
let exTimer=null, lvTimer=null;
$('#exExit').onclick=()=>{ if(!exAns.length || confirm('לצאת מהמבחן? התוצאה לא תישמר.')){ clearTimeout(exTimer); openScope('unit:'+exUnit); } };

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
const SHEET_RIGHTS = `© ${SHEET_YEAR} <bdi>800+</bdi> · עיצוב הדף והאפליקציה — כל הזכויות שמורות · `+
  `מותר לשימוש אישי ולימודי · אין למכור או להפיץ בתשלום`;

/* size=0 means the whole unit. A full English unit is ~380 words, which is a real worksheet
   rather than a quiz, so those sheets go two-up: the answer is a single short word and two
   columns halve the page count. Hebrew sheets stay single-column — you cannot write a
   definition on half a line. */
/* `uid` is normally a unit number. It can also be the string 'weak', which builds the same
   sheet from the words the learner is still getting wrong ACROSS all units — the survey's top
   request, and the one case where a printable page is worth more than a unit sheet: it is
   exactly the list you would otherwise copy out by hand. */
function buildSheet(uid, size){
  const isWeak = uid === 'weak';
  const pool = isWeak ? weakCards('global') : exWords(uid);
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
      <h1><bdi>800+</bdi> — ${isWeak?`מילים לחיזוק · ${langName}`:`מבחן ${langName}, יחידה ${uid}`}</h1>
      <div class="sh-meta">${isWeak
        ? `${n} מילים שעדיין לא יושבות, מכל היחידות`
        : (n===pool.length?`כל ${n} מילות היחידה`:`${n} מילים מתוך ${pool.length}`)} · ${date} · <bdi>800+</bdi></div>
      <div class="sh-fill"><span>שם:</span><span>תאריך:</span><span>ציון: ____ / ${n}</span></div>
      <div class="sh-inst">${askTerm
        ? 'כתוב את הפירוש של כל מילה. תשובה חלקית שמעבירה את המשמעות — נקודה מלאה.'
        : 'כתוב את המילה באנגלית שמתאימה לפירוש. איות מדויק נדרש.'}</div>
      <ol${askTerm?'':' class="two"'}>${items.map(it=>`<li><span class="sh-q${askTerm?ltr:''}">${esc(q(it))}</span>
        <span class="sh-line"></span></li>`).join('')}</ol>
      <div class="sh-foot">דף הפתרונות בסוף<br>${SHEET_RIGHTS}</div>
    </div>
    <div class="sh-page">
      <h1>דף פתרונות — ${isWeak?`מילים לחיזוק · ${langName}`:`${langName}, יחידה ${uid}`}</h1>
      <div class="sh-meta">אותה הגרלה, אותו סדר · ${n} מילים</div>
      <div class="sh-key">${items.map((it,i)=>
        `<div>${i+1}. <b${askTerm?ltr:''}>${esc(q(it))}</b> — ${esc(a(it))}</div>`).join('')}</div>
      <div class="sh-foot">${SHEET_RIGHTS}</div>
    </div>`;
  return true;
}
const SHEET_SIZES=[25,50,100,0];      // 0 = the whole unit
function printSheet(uid){
  const isWeak = uid === 'weak';
  const total = (isWeak ? weakCards('global') : exWords(uid)).length;
  if(total<8){ toast(isWeak ? 'צריך לפחות 8 מילים לחיזוק כדי לבנות דף' : 'ביחידה הזאת אין מספיק מילים לדף מבחן'); return; }
  const opts=SHEET_SIZES.filter(n=>!n || n<total);
  $('#sheetOpts').innerHTML=opts.map(n=>
    `<button data-n="${n}">${n||(isWeak?'כולן · ':'כל היחידה · ')+total}</button>`).join('');
  $('#sheetAskSub').textContent = (isWeak
    ? `${total} מילים לחיזוק מכל היחידות. `
    : `ביחידה ${total} מילים. `) + 'הדף נפתח בחלון ההדפסה — משם אפשר להדפיס או לשמור כ-PDF.';
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

/* Progress is more than hw_stats. The level-test result, the unit-exam history and the round
   size were written to localStorage only, so "one account and your progress follows you"
   stopped being true at the language gate: a second device sent the learner back through a
   level test they had already finished, and their exam scores were simply absent. The keys are
   per-language, so they are collected under the language the row is keyed by — never the
   language that happens to be loaded when the debounced push fires. */
const levelKeyFor = lang => lang==='he' ? 'hw_level_he' : 'hw_level';
const examPreFor  = lang => 'hw_exam'+(lang==='en'?'_en':'')+':';
const sizeKeyFor  = lang => lang==='en' ? 'hw_size_en' : 'hw_size';
function collectExtras(lang){
  const exams={}, pre=examPreFor(lang);
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith(pre)) exams[k.slice(pre.length)]=LS.get(k,[]);
  }
  // exam is per PERSON, not per language — it rides both rows and whichever syncs first wins
  return { level:LS.get(levelKeyFor(lang),null), size:LS.get(sizeKeyFor(lang),null), exams,
           exam:LS.get(EXAM_KEY,null) };
}
/* Same rule as mergeProgress: additive only. A local value already present is never replaced,
   so a device that is ahead can't be pulled backwards by an older row. */
function applyExtras(lang, ex){
  if(!isObj(ex)) return;
  if(ex.level && !LS.get(levelKeyFor(lang),null)) LS.set(levelKeyFor(lang), ex.level);
  if(ex.size!=null && LS.get(sizeKeyFor(lang),null)==null) LS.set(sizeKeyFor(lang), ex.size);
  if(ex.exam && !LS.get(EXAM_KEY,null)) LS.set(EXAM_KEY, ex.exam);
  if(!isObj(ex.exams)) return;
  const pre=examPreFor(lang);
  for(const u of Object.keys(ex.exams)){
    const rem=Array.isArray(ex.exams[u])?ex.exams[u]:[];
    const loc=LS.get(pre+u,[]);
    const seen=new Set();
    const all=[...(Array.isArray(loc)?loc:[]),...rem].filter(isObj)
      .filter(x=>{ const id=[x.t,x.pct,x.n].join('|'); if(seen.has(id)) return false; seen.add(id); return true; })
      .sort((a,b)=>(Number(a.t)||0)-(Number(b.t)||0)).slice(-20);
    LS.set(pre+u, all);
  }
}

let syncPending=false;
/* Returns TRUE only when there is nothing left unsaved — either the write landed, or there was
   nothing to write. Every bail-out returns FALSE, because signOutNow awaits this and then runs
   localStorage.clear(): a flush that quietly failed used to look identical to one that
   succeeded, and the only remaining copy of the session was erased a line later. */
async function flushRemoteSync(){
  if(!currentUser || !syncPending) return true;
  clearTimeout(syncTimer);
  if(LANG!=='he' && LANG!=='en') return false;  // the row has no key to write to
  /* The cache on this device belongs to exactly one account, and the row we are about to
     overwrite belongs to whoever the token says we are. If those two disagree, writing would
     copy one person's progress into another person's row. It has happened: a session can change
     underneath a running page (a confirmation link opened in the same tab, a token refreshed
     into a different account) and every save after that point wrote to the wrong owner.
     Refuse instead of writing, and re-bind, so the next save is honest. */
  if(LS.get('hw_owner', null) !== currentUser.id){
    console.warn('sync aborted: cache owner !== session user');
    syncPending=false;
    /* Deliberately NOT bindCacheToUser here. That call can run wipeAccountKeys() and set
       LANG=null — and this runs from a debounced background timer, so it could blank the
       language underneath a learner mid-round. Refusing the write is the whole job; the owner
       stamp is re-established on the next boot, and the `storage` listener already reloads the
       page when hw_owner actually changes elsewhere. */
    return false;
  }
  const lang=LANG;
  /* pushProgress is a whole-row upsert, so EVERY write must be preceded by a read. An earlier
     version merged once per language and then wrote blind for the rest of the page's life —
     which still lost whatever the other device wrote in between. One extra request per
     debounced save is a cheap price for not overwriting a paying user's work. */
  {
    let res=null;
    try{ res=await Store.pullProgress(lang); }catch(e){ return false; }
    if(!res || res.ok!==true) return false;      // a failed read is never followed by a write
    if(lang!==LANG) return false;                // language changed while in flight
    if(res.data){
      const merged=mergeProgress({assoc,stats,deleted:[...deleted],added,dir:direction,undeleted:restoredMap()}, res.data);
      assoc=merged.assoc; stats=merged.stats; deleted=new Set(merged.deleted); added=merged.added; direction=merged.dir;
      saveAssoc(); saveStats(); saveDeleted(); saveAdded(); LS.set(KEY('hw_dir'),direction);
      /* The merge can bring back a deletion or an addition made on another device, and BANK is
         built from exactly those two. syncWithRemoteInner rebuilds; this path never did — and
         since commitSession now flushes at the end of EVERY round, it is the common path.
         A word deleted on the phone stayed in the deck on the laptop until the next reload. */
      buildBank();
      if(!$('#home').classList.contains('hidden')) renderHome();
      /* mergeProgress covers stats/assoc/deleted/added — it knows nothing about extras. Without
         this, collectExtras below read a device that had never seen the other one's exam
         history and pushed right over it. applyExtras is additive, so this only ever adds. */
      applyExtras(lang, res.data.extras);
    }
  }
  /* Cleared here and nowhere earlier. Clearing it at the top meant that a flush which bailed
     out — no language chosen yet, or a read that failed — threw the pending save away, and
     nothing ever retried it. Every early return above now leaves the save queued.
     Awaited, not fire-and-forget: signOutNow calls this and then runs localStorage.clear(),
     so returning before the write lands would erase the only other copy of the session. */
  syncPending=false;
  try{
    await Store.pushProgress(lang, {assoc, stats, deleted:[...deleted], added, dir:direction,
                                    extras:collectExtras(lang)});
    return true;
  }catch(e){ return false; }
}
/* 1,500ms was shorter than the gap between two answers, so every single answer produced a full
   round trip — and pushProgress is a whole-row upsert preceded by a whole-row read. A learner
   with real history carries a ~51KB row, so one answer moved ~100KB. Thirty testers practising
   for an hour would have moved on the order of a gigabyte, against a 5GB monthly egress budget:
   the ceiling here is bandwidth, not requests.
   Twelve seconds instead. Nothing is risked by waiting: the save is already forced at every
   point where the page can lose it — round end (commitSession), tab hidden, pagehide, language
   switch and sign-out — and a queued save survives every early return in flushRemoteSync. */
const SYNC_DEBOUNCE_MS = 12000;
function queueRemoteSync(){
  if(!currentUser) return;
  if(LANG!=='he' && LANG!=='en') return;        // nothing to key the row by yet
  syncPending=true;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(flushRemoteSync, SYNC_DEBOUNCE_MS);
}
/* Every overlay could only be dismissed by locating its cancel button. Escape is the one key
   every user already knows, and it cost four lines. */
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  const open=[...document.querySelectorAll('.ask')].filter(el=>!el.classList.contains('hidden'));
  if(!open.length) return;
  e.preventDefault();
  open.forEach(el=>el.classList.add('hidden'));
});

/* A debounced save that never fires is a save the user lost. Flush before the page goes away.
   Now that every push reads and merges first, this cannot always complete inside a pagehide —
   and that is accepted: the data is already in localStorage and syncs on the next open. The one
   path that MUST complete is sign-out, because it erases localStorage, and that one awaits. */
window.addEventListener('pagehide', flushRemoteSync);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushRemoteSync(); });

/* Merge is max-based, never subtractive — the same rule migrateStores already uses — so a
   sync race between two devices can only make progress look better than it is, never erase it. */
function mergeProgress(local, remote){
  if(!remote || !isObj(remote)) return local;
  const words={};
  const lw=isObj(local.stats)&&isObj(local.stats.words)?local.stats.words:{};
  const rw=isObj(remote.stats)&&isObj(remote.stats.words)?remote.stats.words:{};
  /* Same failure as the deletions above, one layer down: restoring level-test skips DELETES the
     local record, and a union over both key sets brought it straight back from the cloud. A
     record can never be removed by a max-merge, so the restore has to be stated, not inferred —
     inferring it from "absent locally" would wipe every skip the first time a new device synced. */
  const restoredStats=isObj(local.undeleted)?local.undeleted:{};
  for(const k of new Set([...Object.keys(lw),...Object.keys(rw)])){
    if(!lw[k] && rw[k] && rw[k].src==='lv' && restoredStats[k]) continue;   // explicitly un-skipped
    const a=saneRec(lw[k]), b=saneRec(rw[k]);
    /* The record that was written LAST wins. Taking Math.max per field looked safe but was not:
       a downgrade after a wrong answer could never survive, because the older copy still held
       the higher level — so a word the learner had just failed stayed marked as known. Counts
       still take the max, since they only ever grow. */
    const newer = (a.last >= b.last) ? a : b;
    words[k]={ seen:Math.max(a.seen,b.seen), first:Math.max(a.first,b.first), ever:Math.max(a.ever,b.ever),
               wrong:Math.max(a.wrong,b.wrong), level:newer.level, last:Math.max(a.last,b.last) };
    if(newer.src) words[k].src=newer.src;
  }
  const ls=Array.isArray(local.stats&&local.stats.sessions)?local.stats.sessions:[];
  const rs=Array.isArray(remote.stats&&remote.stats.sessions)?remote.stats.sessions:[];
  /* Sessions carry no id, and the local list is the one that was pushed to the server — so a
     plain concat re-added every round the device already had. Each return to a language
     doubled the history (3 -> 6 -> 12 -> 24) until the 200 cap filled with copies and real
     practice days fell out, shrinking the streak. Dedupe on the round's own fields, and sort,
     because the two lists are not necessarily in chronological order. */
  const seenSess=new Set();
  const sessions=[...rs,...ls].filter(isObj)
    .filter(x=>{ const id=[x.t,x.scope,x.total,x.correct].join('|'); if(seenSess.has(id)) return false; seenSess.add(id); return true; })
    .sort((x,y)=>(Number(x.t)||0)-(Number(y.t)||0))
    .slice(-MAX_SESSIONS);
  const mergedAssoc={...(isObj(remote.assoc)?remote.assoc:{}), ...(isObj(local.assoc)?local.assoc:{})};
  /* Deletions merged as a plain union, which meant a RESTORE could never survive: the user
     brought a word back, the cloud copy still listed it as deleted, and the next sync put it
     straight back in the bin. "ניתן לשחזר" was true for about ninety seconds.
     A union cannot express "this was un-deleted" — it has no way to tell a deletion this device
     has not heard of yet from one it has deliberately reversed. So restores are recorded
     explicitly and subtracted after the union.
     Scope, stated honestly: the restore log is per-device. Another device that still lists the
     word keeps its own copy deleted until it syncs its own restore. Making that symmetric needs
     per-key deletion timestamps — tombstones — which is a change to the stored shape and a
     migration, not a line here. This fixes the reported failure; the full fix is named. */
  const restored=isObj(local.undeleted)?local.undeleted:{};
  const mergedDeleted=[...new Set([...(Array.isArray(remote.deleted)?remote.deleted:[]),
                                    ...(Array.isArray(local.deleted)?local.deleted:[])])]
                      .filter(k=>!restored[k]);
  const seenAdd=new Set(); const mergedAdded=[];
  for(const p of [...(Array.isArray(local.added)?local.added:[]), ...(Array.isArray(remote.added)?remote.added:[])]){
    if(!Array.isArray(p)||!p[0]) continue; const k=K(p[0]); if(seenAdd.has(k)) continue; seenAdd.add(k); mergedAdded.push(p);
  }
  return { assoc:mergedAssoc, stats:{words,sessions}, deleted:mergedDeleted, added:mergedAdded,
           dir: local.dir || remote.dir || DEFAULT_DIR };
}

/* One merge at a time. Two of them interleaving means the second one's loadLangState()
   re-reads a disk the first has already rewritten, and the merge is lost. */
let syncBusy=false;
async function syncWithRemote(lang){
  if(!currentUser || !window.Store) return;
  if(lang!=='he' && lang!=='en') return;        // no language chosen yet: the row has no key to write to
  if(syncBusy) return;
  syncBusy=true;
  try{ return await syncWithRemoteInner(lang); } finally { syncBusy=false; }
}
async function syncWithRemoteInner(lang){
  let res=null;
  try{ res=await Store.pullProgress(lang); }catch(e){ return; }
  /* A failed read used to look exactly like an empty cloud, and the push below then wrote the
     local state over it. On a fresh device the local state is EMPTY — one dropped request was
     enough to erase everything the account had. Only a confirmed read may be followed by a write. */
  if(!res || res.ok!==true) return;
  const remote=res.data;
  if(remote) applyExtras(lang, remote.extras);   // level / exams / size are not language-loaded state
  if(remote && lang===LANG){
    const before = added.length;
    const merged=mergeProgress({assoc,stats,deleted:[...deleted],added,dir:direction}, remote);
    assoc=merged.assoc; stats=merged.stats; deleted=new Set(merged.deleted); added=merged.added; direction=merged.dir;
    /* Prune AFTER the merge, not only before it. enterLang() prunes and then syncs — and the
       merge is max-based, so every orphan the cloud still holds comes straight back and is
       pushed out again by the write below. The orphans were immortal: measured in production
       as a Hebrew row carrying 2,650 word records against a bank of 1,717, which also swept
       up the English keys an older cross-language write bug had put there. Pruning here is
       the only point where the local state and the cloud state have already become one. */
    pruneOrphans();
    saveAssoc(); saveStats(); saveDeleted(); saveAdded(); LS.set(KEY('hw_dir'),direction);
    buildBank(); renderDirSegs(); renderHome();
    if(added.length>before) toast('התקדמות ממכשיר אחר צורפה');
  }
  /* Guard the write too: the language can change while the read is in flight, and the globals
     below always belong to the CURRENT language. Pushing them under `lang` wrote English
     progress into the Hebrew row. */
  if(lang!==LANG) return;
  Store.pushProgress(lang, {assoc, stats, deleted:[...deleted], added, dir:direction,
                            extras:collectExtras(lang)}).catch(()=>{});
}

function translateAuthError(err){
  const m=(err&&err.message)||'';
  if(/already registered|already exists/i.test(m)) return 'כבר יש חשבון עם המייל הזה — נסה להתחבר.';
  /* Not just "wrong": the second sentence is the way out. Whoever let the browser generate a
     password never saw it, so "נסה שוב" is advice they cannot act on — the reset link is the
     only real path back in, and it has to be named here or it will not be found. */
  if(/invalid login credentials/i.test(m))
    return 'אימייל או סיסמה שגויים. אם הדפדפן יצר לך סיסמה ואינך יודע אותה — לחץ "שכחתי סיסמה" למטה.';
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
  if(sv===BUILD){ el.innerHTML=`גרסה <b>${BUILD}</b> · מסונכרן ✓`; return; }
  /* This used to be a sentence. A sentence asking the user to perform a browser action is not
     a fix — it is a note. The same detection now offers the action itself. */
  el.innerHTML=`גרסה <b>${BUILD}</b> · <span class="stale">יש גרסה ${sv}</span>`;
  applyUpdate(sv);
}

/* ===== bug reports =====
   A report without context is unusable, so the screen / language / build / device are captured
   automatically. If the feedback table isn't created yet, fall back to email rather than
   silently swallowing what the user just wrote. */
/* The product's own address, not the owner's personal Gmail. Switched only after inbound mail
   to admin@800-plus.com was confirmed arriving — this is the fallback that carries a bug report
   when the database is unreachable, so a wrong address here loses reports silently. */
const FB_TO='admin@800-plus.com';
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
    level: LS.get('hw_level',null) || LS.get('hw_level_he',null),
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
  /* The diagnostic line used to sit in the dialog in monospace, and a tester asked what it was.
     Fair question: `screen:results · lang:en · build:100 · 393×793` means nothing to her, and a
     form that shows you something you cannot understand reads as a form you might be breaking.
     It still travels with every report — it is what makes a report reproducible — it is just no
     longer shown. One plain sentence takes its place, because silently attaching device details
     would be worse than showing them. */
  const c=fbContext();
  $('#fbCtx').textContent=`נשלח יחד עם הדיווח: המסך שהיית בו, שפת התרגול וגרסת האפליקציה.`;
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
/* Every hw_* key belongs to whoever was signed in when it was written. The old list was
   hand-maintained and did not know about keys built at runtime — hw_exam:3, hw_exam_en:7,
   hw_level_he — so exam scores and level results survived a change of account and were shown
   to the next person. Sweeping by prefix cannot fall behind a new key again. */
function wipeAccountKeys(){
  const doomed=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith('hw_') && k!=='hw_owner' && k!=='hw_seenIntro' && k!=='hw_instDismissed')
      doomed.push(k);
  }
  doomed.forEach(k=>LS.del(k));
  return doomed.length;
}
/* `adopt` is the preview handover. A visitor practises under owner='preview', and the landing
   page tells them their progress is kept — but a brand-new account is still an owner change,
   so the wipe below threw away exactly what the promise covered. On SIGN-UP the preview cache
   is adopted; on SIGN-IN it is not, because that account already has its own cloud row and
   merging a stranger's demo into it is the leak this whole mechanism exists to prevent. */
function bindCacheToUser(uid, adopt){
  const owner = LS.get('hw_owner', null);
  if(owner && owner !== uid && !(adopt && owner === 'preview')){
    wipeAccountKeys();
    assoc={}; stats={words:{},sessions:[]}; deleted=new Set(); added=[]; direction=DEFAULT_DIR; LANG=null;
  }
  LS.set('hw_owner', uid);
}

/* Bring the account down from the cloud BEFORE anything is drawn or decided.
   Two screens read straight out of localStorage — the welcome dashboard (langSummary) and the
   level-test gate — and on a fresh device localStorage is empty. A returning learner with 188
   Hebrew and 292 English records was therefore greeted with "0 words · 0 practised" and pushed
   back into a placement test, while every one of those records sat safe in the cloud. Nothing
   was ever lost; nothing was fetched either.
   Fail-safe by construction: only a confirmed read writes anything, and a request that never
   comes back leaves the device exactly as it was. */
async function pullAccountState(){
  if(!currentUser || !window.Store) return;
  if(syncBusy) return;          // a merge is in flight; reloading the disk under it loses it
  for(const lang of ['he','en']){
    let res=null;
    try{ res=await Store.pullProgress(lang); }catch(e){ continue; }
    if(!res || res.ok!==true || !res.data) continue;
    const d=res.data;
    applyExtras(lang, d.extras);
    /* Fill only a side that is EMPTY. A side that already holds progress is merged by
       syncWithRemote when that language is actually entered — with its own normaliser
       loaded, which is what `added` has to be keyed by. Merging it from here would key it
       with the wrong one. */
    if(hasProgressIn(lang)>0) continue;
    const sk = lang==='en' ? '_en' : '';
    /* Each key is filled only if it is EMPTY here. An earlier version keyed the whole decision
       off the stats side, so a visitor who had added or deleted words without practising yet
       had that work overwritten by the cloud copy. */
    const empty = (k,isArr) => { const v=LS.get(k, null);
      return v==null || (isArr ? (!Array.isArray(v) || !v.length) : !Object.keys(isObj(v)?v:{}).length); };
    if(isObj(d.stats))           LS.set('hw_stats'+sk,   d.stats);
    if(isObj(d.assoc)   && empty('hw_assoc'+sk,false))   LS.set('hw_assoc'+sk,   d.assoc);
    if(Array.isArray(d.deleted) && empty('hw_deleted'+sk,true)) LS.set('hw_deleted'+sk, d.deleted);
    if(Array.isArray(d.added)   && empty('hw_added'+sk,true))   LS.set('hw_added'+sk,   d.added);
    if(d.dir && LS.get('hw_dir'+sk,null)==null) LS.set('hw_dir'+sk, d.dir);
    if(lang===LANG) loadLangState();          // the active language is already in memory
  }
  /* Accounts created before the extras field have no stored test result to restore — but a
     learner with real history plainly does not need a placement test. */
  if(!levelDone()) for(const lang of ['en','he'])
    if(hasProgressIn(lang)>=10){ LS.set(levelKeyFor(lang),'skipped'); break; }
}

/* The name appears on two screens and both are the way into the account page, so they are
   written together — a badge that says one thing on the welcome screen and another on the home
   screen is how "which account am I actually in" becomes a question. */
function setBadges(text){
  const t=text||'';
  ['#userBadge','#userBadgeW'].forEach(id=>{ const el=$(id); if(el) el.textContent=t; });
}

async function afterAuthed(justSignedUp){
  bindCacheToUser(currentUser.id, justSignedUp);   // a fresh account inherits the preview it came from
  try{
    const p=await Store.myProfile();
    const nm = (p && p.username) || (currentUser.email||'').split('@')[0];
    setBadges(p ? p.username : (currentUser.email||''));
    LS.set('hw_name', nm);            // the dashboard greets by name before any network call returns
  }
  catch(e){ setBadges(currentUser.email||''); }
  await showAdminIfAllowed();
  /* BEFORE the subscription gate: a locked user can still press "יציאה", and sign-out writes to
     the cloud. Reaching that write with a device that never fetched the account meant the locked
     screen's own promise — "שום מילה שלמדת לא נמחקת" — was false. */
  await pullAccountState();
  if(!(await accessOk())) return;      // subscription lapsed — the gate owns the screen from here
  show($('#fbFab'));            // reporting a bug must never be more than one tap away
  /* The level test was being forced on EVERY sign-in. Signing out runs localStorage.clear(),
     and the cloud copy of the result is only read by syncWithRemote — which needs a language,
     which is chosen AFTER this gate. So the gate always read an empty local key and sent the
     learner back through a test they had already finished. The result is now fetched before
     the gate decides, and only a confirmed read counts. */
  // First run: offer the level test once. Everything else lands on the language picker.
  if(bootTimedOut){ renderWelcome(); }        // the watchdog already placed the user; do not move them
  else if(!levelDone()){ hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); }
  else renderWelcome();
  // With email confirmation on, sign-up never yields a session — so the install offer has to
  // ride on the first successful sign-in, not on the sign-up call.
  if(justSignedUp || !LS.get('hw_instOffered',0)){ LS.set('hw_instOffered',1); setTimeout(()=>promptInstall(false),600); }
  // asked after the third day of use, not on arrival: a prompt shown to a stranger gets denied,
  // and a denial in the browser is permanent
  setTimeout(()=>{ if(NOTIF.askable() && streakInfo().total>=2) $('#notifCta').classList.remove('hidden'); }, 1200);
  /* Refresh the cached reminder on every sign-in. It used to be written once, while asking for
     permission, and then never again — so the background worker kept announcing a streak the
     learner had left behind months earlier. */
  if(NOTIF.granted()) NOTIF.cacheMessage();
  NOTIF.openTimeNudge();
}

$('#authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('#authEmail').value.trim(), pw=$('#authPassword').value, uname=$('#authUsername').value.trim();
  /* This used to un-hide the message element BEFORE writing to it — so the text left over from
     the previous attempt was revealed and sat there for the whole round trip. Signing up with a
     fresh address flashed "אימייל או סיסמה שגויים" for a second before the real answer arrived.
     Never reveal the box without also replacing what is in it. */
  const msg=$('#authMsg'); msg.className='au-msg';
  msg.textContent = authMode==='signup' ? 'יוצר חשבון…' : 'מתחבר…';
  msg.classList.remove('hidden');
  const btn=$('#authSubmit'); btn.disabled=true;
  try{
    if(authMode==='signup'){
      const r=await Store.signUp(email,pw,uname);
      if(r.error){ msg.className='au-msg err'; msg.textContent=translateAuthError(r.error); return; }
      if(!r.session){                                    // email confirmation required before login
        setAuthMode('signin', true);
        msg.className='au-msg ok'; msg.textContent='אשר את המייל, ואז התחבר כאן.';
        $('#authPassword').value='';
        // and say it where it cannot be missed: the confirmation click is the whole gate
        $('#mailAskTo').textContent=email;
        show($('#mailAsk'));
        return;
      }
      currentUser=r.user; toast('ברוך הבא!'); afterAuthed(true);
    }else{
      const r=await Store.signIn(email,pw);
      if(r.error){ msg.className='au-msg err'; msg.textContent=translateAuthError(r.error); return; }
      currentUser=r.user; afterAuthed(false);
    }
  } finally { btn.disabled=false; }
});
$('#cheerOk').onclick=()=>hide($('#cheer'));
$('#cheer').onclick=e=>{ if(e.target===$('#cheer')) hide($('#cheer')); };
$('#mailAskOk').onclick=()=>hide($('#mailAsk'));
$('#mailAsk').onclick=e=>{ if(e.target===$('#mailAsk')) hide($('#mailAsk')); };
$('#mailAskExisting').onclick=async e=>{
  const to=$('#mailAskTo').textContent.trim(), m=$('#mailAskMsg');
  if(!to) return;
  e.target.disabled=true;
  m.className='au-msg'; m.textContent='שולח…'; m.classList.remove('hidden');
  try{ await Store.resetPasswordFor(to); m.className='au-msg ok';
       m.textContent='נשלח. אם הכתובת רשומה, יגיע ממנה קישור לבחירת סיסמה חדשה.'; }
  catch(err){ m.className='au-msg err'; m.textContent='שגיאה בשליחה — נסה שוב בעוד רגע.';
              e.target.disabled=false; }
};
$('#authForgot').onclick=async ()=>{
  const email=$('#authEmail').value.trim();
  const msg=$('#authMsg'); msg.classList.remove('hidden');
  if(!email){ msg.className='au-msg err'; msg.textContent='הזן קודם את כתובת האימייל שלך למעלה.'; return; }
  msg.className='msg'; msg.textContent='שולח…';
  try{ await Store.resetPasswordFor(email); msg.className='au-msg ok'; msg.textContent='אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה.'; }
  catch(e){ msg.className='au-msg err'; msg.textContent='שגיאה בשליחה — נסה שוב.'; }
};
/* The welcome screen is now a real landing page, so sign-out and the admin panel
   have to be reachable from it too — not only from inside a language. */
const signOutNow = async ()=>{
  if(!committed && session.size>0) commitSession();
  /* The local copy is about to be erased, and a debounced push may still be pending — or an
     earlier one may have failed silently, since pushProgress returns false instead of throwing
     and nothing retried it. Flush once, wait for it, and only then clear. */
  /* This used to push straight to the cloud with no read and no merge — the single most
     destructive moment to do that, since localStorage.clear() below removes the only other
     copy. Routed through flushRemoteSync, which reads and merges first when this language has
     not been reconciled yet, and refuses to write at all after a failed read. */
  /* If the save did not land, the device holds the ONLY copy — so it is not erased. Keeping it
     is safe: bindCacheToUser() wipes the cache the moment a different account signs in, so the
     next user still cannot see it, while this user keeps the round they just finished. */
  let saved=true;
  try{
    if(currentUser && (LANG==='he' || LANG==='en')){
      syncPending=true;
      saved=await flushRemoteSync();
    }
  }catch(e){ saved=false; }
  try{ await Store.signOut(); }catch(e){}
  hide($('#fbFab'));
  // the cached reminder names the previous learner's streak — it is account data, not an asset
  try{ if(window.caches) await caches.delete('hw-data'); }catch(e){}
  if(saved) localStorage.clear(); // the cache belongs to this account; never let it bleed into the next login
  else console.warn('sign-out: הסנכרון לא הושלם — המטמון המקומי נשמר כדי לא לאבד את הסבב האחרון');
  location.reload();
};
$('#signOutBtn').onclick  = signOutNow;
$('#signOutBtn2').onclick = signOutNow;
$('#signOutBtn3').onclick = signOutNow;
$('#signOutBtn4').onclick = signOutNow;

/* ===== account screen =====
   Tapping your own name opens it. For an admin the same tap opens the control centre instead —
   an admin has no use for "install the app" and every use for the list of who signed up. */
async function openAccount(){
  /* Admins used to be bounced straight to the control panel, which meant the owner could never
     reach his own settings — no reminder toggle, no progress, no weak-words sheet. He practises
     too. The panel is now one row inside this screen instead of a redirect away from it. */
  $('#accAdmin').classList.toggle('hidden', !isAdmin);
  const mail=(currentUser&&currentUser.email)||'—';
  $('#accName').textContent = (LS.get('hw_name','')||'').trim() || 'החשבון שלי';
  $('#accMail').textContent = mail;
  $('#accMail2').textContent = mail;
  $('#accUser').textContent = (LS.get('hw_name','')||'—');
  $('#accSince').textContent = '—';
  $('#accSub').textContent = 'טוען…';
  /* Install is pointless once the app IS installed. Unlike the home-screen CTA this one is NOT
     hidden after a dismissal — the whole point of moving it here is that a settings page is
     where you go looking for something you said "not now" to. */
  $('#accInstall').classList.toggle('hidden', isStandalone() || LS.get('hw_installed',0)===1);
  renderAccNotif();
  renderAccProgress();
  renderAccExam();
  goto('account');
  try{
    const p=await Store.myProfile();
    if(p){
      if(p.username){ $('#accUser').textContent=p.username; $('#accName').textContent=p.username; }
      if(p.created_at) $('#accSince').textContent=fmtDate(p.created_at).split(' ')[0];
      $('#accSub').textContent = FREE_PHASE && p.sub_status==='none' ? 'פתוח — שלב חינמי' : subLabel(p);
    } else $('#accSub').textContent='פתוח';
  }catch(e){ $('#accSub').textContent='לא ידוע'; }
}
$('#userBadge2').onclick = openAccount;
$('#userBadge3').onclick = openAccount;
$('#accBack').onclick = ()=>{ if(LANG==='he'||LANG==='en') goto('home'); else { renderWelcome(); goto('welcome'); } };
/* ===== the exam date =====
   Stored per ACCOUNT, not per language — a person sits one psychometric exam. Kept in the
   extras blob so it rides the existing cross-device sync instead of needing a column. */
const EXAM_KEY='hw_examDate';
const examDays = ()=>{
  const v=LS.get(EXAM_KEY,'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y,m,d]=v.split('-').map(Number);
  /* A difference of CALENDAR days, not of milliseconds. Math.ceil over the fraction of a day
     left until 23:59 of the exam date reported 1 all through the exam day itself and 0 on the
     day after — the banner said "the exam is today" twenty-four hours late, every time.
     Both ends are pinned to local midnight and rounded, so the 23- and 25-hour days that
     daylight saving produces cannot push the answer off by one either. */
  const t0=new Date(); t0.setHours(0,0,0,0);
  const t=new Date(y,m-1,d); t.setHours(0,0,0,0);
  return { date:v, days: Math.round((t.getTime()-t0.getTime())/864e5) };
};
function renderAccExam(){
  const inp=$('#accExam'), sub=$('#accExamSub');
  if(!inp) return;
  const e=examDays();
  inp.value = e ? e.date : '';
  const today=new Date();
  inp.min = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'
          + String(today.getDate()).padStart(2,'0');
  sub.textContent = !e ? 'נוסיף ספירה לאחור למסך הבית'
    : e.days > 0 ? `נשארו ${e.days} ימים`
    : e.days === 0 ? 'המבחן היום. בהצלחה.'
    : 'התאריך עבר — אפשר לעדכן למועד הבא';
}
$('#accExam').onchange = ()=>{
  const v=$('#accExam').value;
  if(v) LS.set(EXAM_KEY, v); else LS.del(EXAM_KEY);
  renderAccExam();
  if(typeof flushRemoteSync==='function') flushRemoteSync();
};
/* On the home screen: the number, and what is still untouched next to it. A countdown on its
   own is pressure; a countdown beside the work left is a plan. */
function renderExamPill(){
  const host=$('#examPill'); if(!host) return;
  const e=examDays();
  if(!e || e.days < 0 || e.days > 400){ host.classList.add('hidden'); return; }
  const c=classify('global');
  const left=c.fresh+c.weak;
  host.innerHTML = e.days===0
    ? `<b>היום</b><span>המבחן היום. <em>בהצלחה.</em></span>`
    : `<b>${e.days}</b><span>ימים למבחן · <em>${left}</em> מילים עוד לא יושבות`
      + (e.days>0 ? ` · <em>${Math.ceil(left/e.days)}</em> ביום וסיימת` : '') + `</span>`;
  host.classList.remove('hidden');
}
$('#accAdmin').onclick = ()=>openAdmin();
$('#accInstall').onclick = ()=>promptInstall(true);

/* Where am I — answered on the settings page, not only inside a language. Hidden entirely when
   no language has been entered yet: zeros across the board on a first visit read as a broken
   screen, not as a starting point. */
/* A ring per language, not one strip for whichever language happens to be open.
   The old version read classify('global'), which only ever sees the ACTIVE language — so
   someone who had learned 244 Hebrew words and 300 English ones was shown 244 and no hint
   that the other half existed. Both are always drawn now, and the one you are not in is
   still a live button into it.

   SVG and not a div-bar: the arc has to show three quantities at once (solid, working,
   untouched) and stay legible at 120px on a phone. A stroke-dasharray on two concentric
   circles does that in eight lines and animates for free. */
function langRing(lang, s, active){
  const R=52, C=2*Math.PI*R;
  const solid = s.total? s.learned/s.total : 0;
  const met   = s.total? (s.learned+s.weak)/s.total : 0;
  const name  = lang==='en' ? 'אנגלית' : 'עברית';
  const pct   = Math.round(solid*100);
  return `<button class="lp-card${active?' on':''}" data-lang="${lang}">
    <div class="lp-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="lp-bg" cx="60" cy="60" r="${R}"/>
        <circle class="lp-met" cx="60" cy="60" r="${R}"
                stroke-dasharray="${(met*C).toFixed(1)} ${C.toFixed(1)}"/>
        <circle class="lp-sol" cx="60" cy="60" r="${R}"
                stroke-dasharray="${(solid*C).toFixed(1)} ${C.toFixed(1)}"/>
      </svg>
      <div class="lp-mid"><b>${pct}<i>%</i></b><span>${name}</span></div>
    </div>
    <div class="lp-legend">
      <span><i class="s"></i>${s.learned} בשליטה</span>
      <span><i class="w"></i>${s.weak} לחיזוק</span>
      <span><i class="n"></i>${s.fresh} לא פגשת</span>
    </div>
    <div class="lp-foot">${s.total} מילים${active?' · אתה כאן':' · לחץ למעבר'}</div>
  </button>`;
}
function renderAccProgress(){
  const host=$('#accProg'); if(!host) return;
  const he=langSummary('he'), en=langSummary('en');
  if(!he.total && !en.total){ host.classList.add('hidden'); host.innerHTML=''; return; }
  const st=streakInfo();
  const days = st.week.map(d=>`<i class="${d.on?'on':''}${d.today?' today':''}"><em>${d.label}</em></i>`).join('');
  host.innerHTML =
    `<div class="lp-grid">${langRing('he',he,LANG==='he')}${langRing('en',en,LANG==='en')}</div>` +
    `<div class="lp-streak"><b>${st.n||0}</b><span>ימים ברצף</span><div class="lp-week">${days}</div></div>`;
  host.classList.remove('hidden');
  host.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{
    const l=b.dataset.lang;
    if(l===LANG){ goto('home'); return; }
    enterLang(l);
  });
  const weak = (LANG==='en'?en:he).weak;
  const sub=$('#accSheetSub');
  if(sub) sub.textContent = weak>=8
    ? `${weak} מילים לחיזוק מכל היחידות, כדף אחד להדפסה או ל-PDF`
    : 'צריך לפחות 8 מילים לחיזוק כדי לבנות דף';
}

/* The reminder row states its own status instead of just offering. "Denied" is the state that
   matters most: the browser will never ask again, and a row that keeps offering something it
   cannot deliver is worse than one that says where the switch actually is. */
function renderAccNotif(){
  const sub=$('#accNotifSub'), st=$('#accNotifState'), row=$('#accNotif');
  if(!sub||!row) return;
  if(!NOTIF.supported()){
    row.classList.add('hidden'); return;
  }
  row.classList.remove('hidden');
  if(NOTIF.granted()){
    sub.textContent='פעילה — תזכורת קצרה בבוקר עם ההתקדמות שלך';
    st.textContent='✓'; st.style.color='#3f7a4a'; row.disabled=true;
  } else if(NOTIF.askable()){
    sub.textContent='הודעה קצרה בבוקר שמזכירה לתרגל';
    st.textContent='‹'; st.style.color=''; row.disabled=false;
  } else {
    // permission is 'denied', or iOS in a tab where the API would throw
    sub.textContent = isIOS() && !isStandalone()
      ? 'זמינה אחרי שתתקין את האפליקציה למסך הבית'
      : 'חסומה בדפדפן — אפשר להחזיר דרך הגדרות האתר בדפדפן';
    st.textContent='—'; st.style.color=''; row.disabled=true;
  }
}
$('#accNotif').onclick = async ()=>{
  if(!NOTIF.askable()) return;
  const ok=await NOTIF.ask();
  renderAccNotif();
  toast(ok ? 'מעולה — תקבל תזכורת בבוקר' : 'אפשר להפעיל דרך הגדרות האתר בדפדפן');
};

/* ===== deleting the account =====
   Two things this must not be: a confirm() that the same reflex dismisses, and a button that
   only clears the DATA. The first is why the gate is typing your own address; the second is
   why it goes through an Edge Function — see store.deleteMyAccount. */
$('#accDelete').onclick = ()=>{
  const mail=(currentUser&&currentUser.email)||'';
  if(!mail){ toast('צריך להיות מחובר'); return; }
  $('#delMail').textContent=mail;
  $('#delInput').value='';
  $('#delGo').disabled=true;
  $('#delMsg').classList.add('hidden');
  show($('#delAsk'));
  setTimeout(()=>$('#delInput').focus(),60);
};
$('#delInput').oninput = ()=>{
  const mail=((currentUser&&currentUser.email)||'').trim().toLowerCase();
  $('#delGo').disabled = $('#delInput').value.trim().toLowerCase() !== mail || !mail;
};
const closeDel = ()=>hide($('#delAsk'));
$('#delCancel').onclick = closeDel;
$('#delAsk').onclick = e=>{ if(e.target===$('#delAsk')) closeDel(); };
$('#delGo').onclick = async ()=>{
  const btn=$('#delGo'), m=$('#delMsg');
  btn.disabled=true; m.className='au-msg'; m.textContent='מוחק…'; m.classList.remove('hidden');
  const r = await Store.deleteMyAccount();
  if(!r.ok){
    m.className='au-msg err';
    m.textContent = r.notDeployed
      ? 'המחיקה האוטומטית עוד לא פעילה. כתוב אליי ל-admin@800-plus.com ואמחק ידנית תוך יום.'
      : (r.error && r.error.message) || 'המחיקה נכשלה — נסה שוב.';
    btn.disabled=false; return;
  }
  /* The account is gone on the server. Everything local must go too, and the session with it —
     leaving a stale token behind means the next load tries to use an identity that no longer
     exists, and the error that comes back is unreadable. */
  try{ await Store.signOut(); }catch(e){}
  try{ localStorage.clear(); }catch(e){}
  closeDel();
  document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;'
    + 'justify-content:center;padding:32px;background:#f7f2e8;color:#2c2620;text-align:center;'
    + 'font-family:Heebo,system-ui,sans-serif">'
    + '<div><div style="font:700 30px/1 Georgia,serif;color:#c9962f" dir="ltr">800+</div>'
    + '<p style="margin-top:18px;font-size:1.05rem;line-height:1.8">החשבון נמחק.<br>'
    + 'לא נשאר אצלנו שום מידע עליך.</p>'
    + '<p style="margin-top:14px;font-size:.85rem;color:#8d8274">בהצלחה במבחן.</p></div></div>';
};
// the account screen's own sheet is the cross-unit one; per-unit sheets live inside a unit
$('#accSheet').onclick = ()=>{
  if(LANG!=='he' && LANG!=='en'){ toast('בחר קודם שפה'); return; }
  printSheet('weak');
};

/* The survey's biggest finding was that eight capabilities people asked for ALREADY EXIST and
   nobody knows about them. They are listed on the landing page — which is shown once, to people
   who do not have an account yet, and is unreachable forever after. Every existing user signed
   up before it existed and has never seen it. So the page is not missing; the way back to it is.
   Reached while signed in, its two sign-up CTAs make no sense — hidden, with a way back instead. */
function openWhatItDoes(){
  hide($('#introCta'));
  show($('#introTop'));
  goto('intro');
}
$('#accWhat').onclick = openWhatItDoes;
$('#introBack').onclick = ()=>{ hide($('#introTop')); openAccount(); };

/* Reset asks twice, and the second time it asks you to TYPE something. A single confirm on an
   irreversible action is a mis-tap away from erasing months of work. */
$('#accReset').onclick = async ()=>{
  if(!confirm('לאפס את כל ההתקדמות שלך בשתי השפות? מילים שלמדת, ציוני מבחנים ורצף הימים יימחקו. אין דרך לבטל.')) return;
  const typed=prompt('כדי לאשר, הקלד: איפוס');
  if((typed||'').trim()!=='איפוס'){ toast('לא אופס'); return; }
  const btn=$('#accReset'); btn.disabled=true;
  try{
    /* The cloud row is emptied FIRST. Clearing the device and then failing to reach the server
       would leave the old progress in the cloud, and the next sync would pull it all back —
       a reset that silently undoes itself is worse than one that fails loudly. */
    for(const lang of ['he','en'])
      await Store.pushProgress(lang, {assoc:{}, stats:{words:{},sessions:[]}, deleted:[], added:[],
                                      dir:DEFAULT_DIR, extras:{}});
    wipeAccountKeys();
    if(window.caches) try{ await caches.delete('hw-data'); }catch(e){}
    toast('ההתקדמות אופסה');
    setTimeout(()=>location.reload(), 700);
  }catch(e){ btn.disabled=false; toast('האיפוס נכשל — ההתקדמות שלך לא נגעה'); }
};

/* ===== daily reminder =====
   Asked for at the right moment and never twice. A denied permission is permanent in the
   browser and cannot be re-requested, so the prompt only appears when it can actually
   succeed AND the user has shown they use the app.

   Platform reality, stated plainly because it shapes the whole design:
   - iOS grants Notification only to a PWA added to the home screen (16.4+). In Safari the
     API is absent, so we must not ask.
   - Reliable delivery while the app is CLOSED needs either periodicSync (Chrome, installed)
     or a push server holding VAPID keys. There is no push server yet, so the third path is
     the app itself: on open, if it is morning and today has no practice, remind. */
const NOTIF = {
  supported(){ return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; },
  askable(){
    if(!this.supported()) return false;
    if(Notification.permission !== 'default') return false;   // granted or denied — both final
    if(isIOS() && !isStandalone()) return false;              // Safari tab: the API would throw
    return true;
  },
  granted(){ return this.supported() && Notification.permission === 'granted'; },

  async ask(){
    if(!this.askable()) return false;
    let p='denied';
    try{ p = await Notification.requestPermission(); }catch(e){ return false; }
    LS.set('hw_notifAsked', 1);
    if(p==='granted'){ await this.registerPeriodic(); await this.cacheMessage(); }
    return p==='granted';
  },

  /* Chrome only, and only for an installed PWA. Silently unavailable elsewhere — that is
     expected, not an error, so it never surfaces to the user. */
  async registerPeriodic(){
    try{
      const reg = await navigator.serviceWorker.ready;
      if(!('periodicSync' in reg)) return false;
      const st = await navigator.permissions.query({ name:'periodic-background-sync' });
      if(st.state !== 'granted') return false;
      await reg.periodicSync.register('daily-study', { minInterval: 20*60*60*1000 });
      return true;
    }catch(e){ return false; }
  },

  /* The service worker wakes up with no access to localStorage, so the message it should
     show is written into the cache while the page is alive. */
  /* Caches FACTS, not a finished sentence.
     It used to cache the composed text, and only at the moment permission was granted — so the
     worker went on announcing "3 ימים ברצף" months after the streak had ended, and a learner
     who had been away for a week was greeted as though they had practised yesterday. The
     numbers are written after every round now, and the wording is decided when it fires. */
  async cacheMessage(){
    try{
      const c = await caches.open('hw-data');
      await c.put('daily-msg', new Response(JSON.stringify(this.facts()),
        { headers:{'Content-Type':'application/json'} }));
    }catch(e){}
  },

  facts(){
    const he=langSummary('he'), en=langSummary('en');
    /* Straight off the session log. practiceDays() returns dayKey strings like "2026-8-1",
       and Date.parse on an unpadded string is implementation-dependent — the raw `t` is
       already a millisecond number, so there is nothing to parse. */
    let last=0, weak=0;
    for(const key of ['hw_stats','hw_stats_en']){
      const s=LS.get(key,{});
      if(!isObj(s)) continue;
      const arr=Array.isArray(s.sessions)?s.sessions:[];
      for(const x of arr){ const t=Number(isObj(x)&&x.t); if(t>last) last=t; }
      const w=isObj(s.words)?s.words:{};
      // weak = met, not yet solid, and not a level-test skip — the same rule the app uses
      for(const r of Object.values(w))
        if(isObj(r) && r.src!=='lv' && int0(r.seen)>0 && int0(r.level)<3) weak++;
    }
    return { streak: streakInfo().n, learned: he.learned+en.learned, weak, last };
  },

  /* Progress, not nagging: the message states what the learner actually did. */
  compose(f){
    const d = f || this.facts();
    const DAY=864e5;
    const away = d.last ? Math.floor((Date.now()-d.last)/DAY) : -1;
    // The gap decides the words. Someone two days out does not need a streak reminder —
    // they need a reason to come back and a job small enough to say yes to.
    if(away >= 14) return { title:'המילים מחכות לך',
      body: d.learned ? `${d.learned} מילים שלמדת עדיין כאן. סבב אחד מחזיר אותך לקצב.`
                      : 'עוד לא התחלת באמת. עשר מילים זה חמש דקות.' };
    if(away >= 2)  return { title:'יומיים בלי תרגול',
      body: d.weak ? `${d.weak} מילים עדיין לא יושבות. עשר דקות והן נסגרות.`
                   : 'סבב קצר היום שומר על מה שכבר למדת.' };
    if(d.streak>=3) return { title:'זמן ללמוד מילים',
      body:`${d.streak} ימים ברצף. חמש דקות היום שומרות על הרצף.` };
    return { title:'זמן ללמוד מילים',
      body: d.learned>0 ? `למדת כבר ${d.learned} מילים. עוד עשר היום?`
                        : 'תרגול קצר של חמש דקות מספיק כדי להתחיל.' };
  },

  /* The path that works on iOS: the app reminds when opened in the morning with no
     practice logged today. Fires once per day at most. */
  openTimeNudge(){
    if(!this.granted()) return;
    const h = new Date().getHours();
    if(h < 6 || h > 12) return;
    const today = dayKey(Date.now());
    if(LS.get('hw_notifDay','') === today) return;
    if(streakInfo().today) return;                 // already practised — nothing to nudge
    /* The day is marked only once the notification has actually been shown. Marking it first
       and swallowing the rejection meant a failure — the worker not ready yet on a cold open,
       or permission revoked at OS level — burned the day silently and there was no way to
       tell the path had stopped working at all. */
    const m = this.compose();
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(m.title, {
        body: m.body, dir:'rtl', lang:'he',
        icon:'./icon-192.png', badge:'./icon-192.png', tag:'daily-study',
        data:{ url:'./' }
      }))
      .then(()=>{ LS.set('hw_notifDay', today); })
      .catch(()=>{});
  }
};

/* One switch decides whether the product is free. Everything else reads it. */
const FREE_PHASE = true;

/* ===== subscription gate =====
   Fails OPEN on purpose. If migrations/5.sql has not run the columns do not exist, and a gate
   that assumed the worst would lock every existing user out of an app they already paid
   nothing for. Only an explicit blocked state closes the door. */
async function accessOk(){
  let p=null;
  try{ p=await Store.myProfile(); }catch(e){ return true; }
  /* Deliberately fail-open: a missing profile means the subscription columns aren't deployed
     yet, or the sign-up trigger did not fire — locking a paying learner out over our own
     infrastructure fault is worse than a free day. The one path that USED to manufacture a
     missing profile on purpose (adminDeleteUserData) now clears the row instead of deleting it. */
  if(!p || p.sub_status===undefined) return true;
  if(p.role==='admin') return true;
  /* FREE PHASE. There is no payment mechanism yet and the app is deliberately free while it
     collects users. A brand-new account is created with sub_status='none' (the column default),
     so WITHOUT this line every tester who confirms their email lands straight on the locked
     screen — which reads as "your email is blocked" and ends their session there.
     'none' means "never paid", not "was cut off": past_due and canceled are explicit decisions
     by you and stay locked. Flip this to false the day billing goes live. */
  if(FREE_PHASE && p.sub_status==='none') return true;
  if(hasAccess(p)) return true;      // one definition, shared with the admin badge
  showLocked(p);
  return false;
}
function showLocked(p){
  const why = p.sub_status==='past_due' ? 'החיוב האחרון לא עבר.'
            : p.sub_status==='canceled' ? 'המנוי בוטל.'
            : p.sub_until               ? 'המנוי הסתיים.'
            : 'אין מנוי פעיל לחשבון הזה.';
  $('#lockWhy').textContent = why;
  $('#lockMail').textContent = (currentUser && currentUser.email) || '';
  hide($('#fbFab'));
  goto('locked');
}

/* ===== admin dashboard — who signed up, when, how far they got.
   Deliberately has no way to reveal a password: none is stored in readable form. ===== */
let isAdmin=false;
async function showAdminIfAllowed(){
  isAdmin=false;
  try{ const p=await Store.myProfile(); isAdmin = !!(p && p.role==='admin'); }catch(e){}
  $('#adminBtn').classList.toggle('hidden', !isAdmin);
  $('#adminBtn2').classList.toggle('hidden', !isAdmin);
  if(isAdmin) refreshFbBadge();
}

/* ===== the open-reports badge =====
   There is no email notification: a report lands in the feedback table and waits there silently.
   So the count has to travel to where the eye already goes — the "בקרה" button on the topbar,
   which is on screen every time the app opens. Zero means no badge at all; an empty circle
   would train the eye to ignore it, and then a real report would be ignored with it. */
async function refreshFbBadge(){
  if(!isAdmin) return;
  const n=await Store.countOpenFeedback();
  if(n===null) return;                       // table missing or offline — leave the last known count
  for(const id of ['#adminBtn','#adminBtn2']){
    const b=$(id); if(!b) continue;
    let s=b.querySelector('.adm-badge');
    if(!n){ if(s) s.remove(); continue; }
    if(!s){ s=document.createElement('span'); s.className='adm-badge'; b.appendChild(s); }
    s.textContent = n>99 ? '99+' : n;
    s.title = n+' דיווחים שלא סומנו כטופלו';
  }
}
/* A tester reports at 21:40 while the app is open in another tab. Without this the badge would
   still read yesterday's number. Re-checking on tab focus costs one count query and means the
   number is right whenever it is actually being looked at. */
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) refreshFbBadge(); });
const fmtDate = t => t ? new Date(t).toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'2-digit'})
                        +' '+new Date(t).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}) : '—';

/* Users are fetched once per visit and kept here; search / sort / filter all run
   in memory over this array, so typing never hits the network. Session-only state
   by design — nothing is persisted to localStorage. */
let admUsers=[];
let admView={ q:'', sort:'new', filter:'all' };
const ADM_DAY=864e5;

function admFilterSort(){
  const q=admView.q.trim().toLowerCase();
  const cut=Date.now()-7*ADM_DAY;
  let out=admUsers.filter(r=>{
    if(q && !((r.username||'').toLowerCase().includes(q) || (r.email||'').toLowerCase().includes(q))) return false;
    switch(admView.filter){
      case 'active7': return !!r.lastTs && r.lastTs>=cut;
      case 'never':   return !r.lastTs;
      case 'admins':  return r.role==='admin';
      default:        return true;
    }
  });
  const t=v=>{ const n=v?Date.parse(v):NaN; return isNaN(n)?0:n; };
  const cmp={
    new:  (a,b)=>t(b.created_at)-t(a.created_at),
    old:  (a,b)=>t(a.created_at)-t(b.created_at),
    last: (a,b)=>(b.lastTs||0)-(a.lastTs||0),
    words:(a,b)=>b.learnedTotal-a.learnedTotal
  }[admView.sort]||((a,b)=>0);
  return out.sort(cmp);
}

function renderAdminUsers(){
  const list=$('#admUserList'), count=$('#admCount');
  if(!list) return;
  const shown=admFilterSort();
  const filtering = !!admView.q.trim() || admView.filter!=='all';
  if(count) count.innerHTML = filtering
    ? `מציג <b>${shown.length}</b> מתוך ${admUsers.length} משתמשים`
    : `${admUsers.length} משתמשים`;
  if(!shown.length){
    list.innerHTML='<p class="msg" style="color:var(--ink-soft)">אין משתמשים התואמים לסינון.</p>';
    return;
  }
  list.innerHTML=shown.map(r=>`<div class="adm-row">
      <div class="adm-top"><b>${esc(r.username||'—')}</b>
        <span class="mail">${esc(r.email||'')}</span>
        ${r.role==='admin'?'<span class="adm-tag">אדמין</span>':''}</div>
      <div class="adm-meta">
        <span>נרשם <i>${fmtDate(r.created_at)}</i></span>
        <span>פעילות אחרונה <i>${r.lastTs?fmtDate(r.last):'לא נכנס מעולם'}</i></span>
        <span>תרגל <i>${r.practised}</i> מילים ב-<i>${r.rounds}</i> סבבים</span>
        <span>יודע <i>${r.learnedHe}</i> עברית · <i>${r.learnedEn}</i> אנגלית</span>
        ${r.skipped?`<span style="opacity:.7">דילג במבחן רמה <i>${r.skipped}</i></span>`:''}
      </div>
      <div class="adm-sub ${subClass(r)}">${subLabel(r)}</div>
      <div class="adm-acts">
        ${r.email?`<button data-reset="${esc(r.email)}">✉ אפס סיסמה</button>`:''}
        <button data-sub="${r.id}" data-st="active">✓ הפעל מנוי</button>
        <button data-sub="${r.id}" data-st="past_due">⏸ חיוב נכשל</button>
        <button data-sub="${r.id}" data-st="canceled">✕ בטל מנוי</button>
        ${r.role==='admin'?'':`<button class="danger" data-del="${r.id}" data-mail="${esc(r.email||'')}">🗑 מחק נתונים</button>`}
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{
    const mail=b.dataset.reset; if(!mail) return;
    b.disabled=true; b.textContent='שולח…';
    try{ await Store.adminSendReset(mail); b.textContent='✓ נשלח קישור איפוס'; }
    catch(e){ b.textContent='שגיאה — נסה שוב'; b.disabled=false; }
  });

  list.querySelectorAll('[data-sub]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.sub, st=b.dataset.st;
    const u=admUsers.find(x=>x.id===id); if(!u) return;
    let until;
    if(st==='active'){
      const months = confirm('שלושה חודשים? (ביטול = חודש אחד)') ? 3 : 1;
      const d=new Date(); d.setMonth(d.getMonth()+months);
      until=d.toISOString();
      u.plan = months===3 ? 'quarter' : 'monthly';
    }
    b.disabled=true;
    const { ok, error } = await Store.adminSetSubscription(id,
      { status: st, until, plan: u.plan, note: null });
    b.disabled=false;
    if(!ok){ toast('לא נשמר: '+(error&&error.message||'')); return; }
    u.sub_status=st; if(until!==undefined) u.sub_until=until;
    renderAdminUsers();
  });

  /* Deletion asks for the ADMIN'S OWN password and the target's email.
     The password proves who is asking; the email proves which row was meant. */
  list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.del, mail=b.dataset.mail;
    const typed=prompt('מחיקת נתוני משתמש היא בלתי הפיכה. הקלד את המייל של המשתמש לאישור: '+mail);
    if(typed===null) return;
    if(typed.trim().toLowerCase()!==String(mail).trim().toLowerCase()){ toast('המייל אינו תואם — לא נמחק'); return; }
    const pw=prompt('הקלד את סיסמת החשבון שלך כדי לאשר:');
    if(!pw) return;
    b.disabled=true; b.textContent='מאמת…';
    if(!await Store.verifyMyPassword(pw)){ toast('סיסמה שגויה — לא נמחק'); b.disabled=false; b.textContent='🗑 מחק נתונים'; return; }
    b.textContent='מוחק…';
    const { ok, error } = await Store.adminDeleteUserData(id);
    if(!ok){ toast('לא נמחק: '+(error&&error.message||'')); b.disabled=false; b.textContent='🗑 מחק נתונים'; return; }
    admUsers = admUsers.filter(x=>x.id!==id);
    renderAdminUsers();
    toast('הנתונים נמחקו. את החשבון עצמו מוחקים בסופאבייס → Authentication → Users');
  });
}

/* One place decides whether access is live, so the badge and the gate never disagree. */
/* ===== one definition of "has access", used by the gate AND by the admin badge =====
   There were two implementations and a comment claiming there was one. Both got the same two
   things wrong, and both would have cost money the day billing goes live:

   · CANCELED locked the account the instant it was set. Someone who cancels on day 2 of a month
     they already paid for lost the other 28 days. That is not a design choice, it is a refund
     claim — and under חוק הגנת הצרכן, over-charging or cutting service short carries statutory
     damages with no proof of loss required.
   · PAST_DUE locked immediately too. A declined card is usually an expired card or a bank
     blocking an unfamiliar merchant, not a decision to stop paying. Locking the app before the
     retry has even run turns a bank glitch into a churned customer.

   The model the whole system now shares: `sub_until` is PAID THROUGH, `sub_status` is the
   billing state. Access follows the date; the status only decides how the date is read. */
const PAST_DUE_GRACE_DAYS = 3;
function hasAccess(r){
  if(!r) return true;                                  // no profile row — fail open, as before
  if(r.role==='admin') return true;
  if(r.sub_status===undefined) return true;            // columns not deployed
  if(FREE_PHASE && r.sub_status==='none') return true;
  /* A `sub_until` that Date cannot parse used to evaluate as "expired" and lock the account.
     That is the wrong direction for a fault we caused: a provider changing its date format
     would lock EVERY active subscriber at once, silently, with nothing in the UI to explain it.
     An unreadable end date is treated as no end date — the same fail-open rule the rest of this
     gate follows, because a free day costs less than a paying learner shut out by our own bug. */
  let until = r.sub_until ? new Date(r.sub_until) : null;
  if(until && isNaN(until.getTime())){
    console.error('sub_until לא ניתן לפענוח: '+r.sub_until+' — הגישה נשארת פתוחה');
    until = null;
  }
  const paidThrough = until ? until > new Date() : false;
  switch(r.sub_status){
    case 'active':
    case 'grace':    return !until || paidThrough;      // no end date = open-ended access
    case 'canceled': return paidThrough;                // cancelled, but the period was paid for
    case 'past_due': return paidThrough ||
      (!!until && (Date.now() - until.getTime()) < PAST_DUE_GRACE_DAYS*864e5);
    default:         return false;                      // 'none' outside the free phase
  }
}
function subActive(r){ return hasAccess(r); }
function subClass(r){
  if(r.role==='admin') return 'ok';
  if(r.sub_status==='past_due') return 'due';
  if(!hasAccess(r)) return 'off';
  return 'ok';
}
/* The label has to agree with the gate. It used to say "הגישה חסומה" for past_due and
   "המנוי בוטל" for canceled regardless of the date — while hasAccess() correctly still lets
   both in, one for the 3 grace days and the other through the period already paid for. The
   same string is shown to the user on their own account screen, so it was telling paying
   people they were cut off while they were not. */
function subLabel(r){
  if(r.role==='admin') return 'אדמין · גישה מלאה';
  const until = r.sub_until ? ' · עד '+fmtDate(r.sub_until).split(' ')[0] : '';
  const live = hasAccess(r);
  switch(r.sub_status){
    case 'active':   return live ? 'מנוי פעיל'+until : 'המנוי פג'+until;
    case 'grace':    return 'גישה ידנית'+until;
    case 'past_due': return live ? 'חיוב נכשל — הגישה פתוחה עוד מעט'+until
                                 : 'חיוב נכשל — הגישה חסומה';
    case 'canceled': return live ? 'בוטל — פעיל'+until : 'המנוי בוטל';
    default:         return FREE_PHASE ? 'שלב חינמי · גישה פתוחה' : 'ללא מנוי';
  }
}

async function openAdmin(){
  goto('admin');
  const body=$('#adminBody');
  body.innerHTML='<p class="msg" style="color:var(--ink-soft)">טוען…</p>';
  const { users, error } = await Store.adminListUsers();
  if(error){
    body.innerHTML=`<p class="msg err">לא ניתן לטעון: ${esc(error.message)}</p>`+
      `<p class="msg" style="color:var(--ink-soft)">אם חסרות עמודות — הרץ את המיגרציות שבתיקיית migrations.</p>`;
    return;
  }
  if(!users.length){ admUsers=[]; body.innerHTML='<p class="msg" style="color:var(--ink-soft)">עדיין אין משתמשים רשומים.</p>'; return; }

  admUsers=await Promise.all(users.map(async u=>{
    /* "למד" used to count every record with level>=3 — including the ones the LEVEL TEST
       writes for words it decides the learner already knows (src:'lv'). A single level test
       marks thousands at once, so the number said 2,477 for someone who had practised twice,
       and it never moved afterwards. It measured a test, not learning.
       Practised and skipped are now two separate numbers, because they answer two questions. */
    let learnedHe=0, learnedEn=0, skipped=0, rounds=0, practised=0, last=u.last_seen, lastRound=0;
    try{
      for(const p of await Store.adminUserProgress(u.id)){
        const st=(p.data&&p.data.stats)||{};
        const w=st.words||{};
        let solid=0;
        for(const r of Object.values(w)){
          if(!r) continue;
          if(r.src==='lv'){ skipped++; continue; }
          if(Number(r.seen)>0) practised++;
          if(Number(r.level)>=3) solid++;
        }
        if(p.lang==='en') learnedEn=solid; else learnedHe=solid;
        const ses=Array.isArray(st.sessions)?st.sessions:[];
        rounds+=ses.length;
        // session.t is Date.now() — a number. Date.parse() on it returns NaN and every round
        // would have looked like it never happened.
        for(const s of ses){ const t=Number(s&&s.t); if(t>lastRound) lastRound=t; }
        if(!last || (p.updated_at && p.updated_at>last)) last=p.updated_at;
      }
    }catch(e){}
    const ts=last?Date.parse(last):NaN;
    return { id:u.id, username:u.username||'', email:u.email||'', role:u.role,
             created_at:u.created_at, last, lastTs:isNaN(ts)?0:ts,
             learnedHe, learnedEn, learnedTotal:learnedHe+learnedEn,
             skipped, rounds, practised, lastRound };
  }));

  /* The morning glance. The list below answers "who is this person"; this answers the only
     question worth asking every day — is anybody actually practising. Rounds, not logins:
     signing up and confirming an email is a small effort, and opening the app and answering
     a round is a different one. Conflating them is how a dead product looks alive. */
  const DAY=864e5, now=Date.now();
  const roundIn = d => admUsers.filter(u=>u.lastRound && now-u.lastRound < d*DAY).length;
  const glance = {
    today: roundIn(1), week: roundIn(7),
    never: admUsers.filter(u=>!u.rounds).length,
    words: admUsers.reduce((n,u)=>n+u.practised,0),
    rounds: admUsers.reduce((n,u)=>n+u.rounds,0),
  };
  const gcard = (n, label, hint, warn) =>
    `<div class="adm-g${warn&&n?' warn':''}"><b>${n}</b><span>${label}</span>`+
    (hint?`<i>${hint}</i>`:'')+`</div>`;

  body.innerHTML=`<div class="adm-glance">
      ${gcard(glance.today,'תרגלו היום','')}
      ${gcard(glance.week,'תרגלו השבוע','')}
      ${gcard(glance.never,'נרשמו ולא תרגלו','אף פעם',true)}
      ${gcard(glance.rounds,'סבבים בסך הכול','')}
      ${gcard(glance.words,'מילים שתורגלו','בלי מבחן רמה')}
    </div>
    <div class="adm-tools">
      <input class="adm-search" id="admSearch" type="search" inputmode="search"
             placeholder="חיפוש לפי מייל או שם" value="${esc(admView.q)}" aria-label="חיפוש משתמשים">
      <select id="admSort" aria-label="מיון">
        <option value="new">הצטרפו — חדש→ישן</option>
        <option value="old">הצטרפו — ישן→חדש</option>
        <option value="last">פעילות אחרונה</option>
        <option value="words">כמות מילים שנלמדו</option>
      </select>
      <select id="admFilter" aria-label="סינון">
        <option value="all">הכול</option>
        <option value="active7">פעילים ב-7 ימים</option>
        <option value="never">לא נכנסו מעולם</option>
        <option value="admins">אדמינים</option>
      </select>
    </div>
    <p class="adm-count" id="admCount"></p>
    <div id="admUserList"></div>
    <div class="section-t" style="margin-top:30px">דיווחי באגים ומשוב</div><div id="admFb">
        <p class="msg" style="color:var(--ink-soft)">טוען…</p></div>`;

  const sortSel=$('#admSort'), filtSel=$('#admFilter');
  sortSel.value=admView.sort; filtSel.value=admView.filter;
  $('#admSearch').oninput=e=>{ admView.q=e.target.value; renderAdminUsers(); };
  sortSel.onchange=e=>{ admView.sort=e.target.value; renderAdminUsers(); };
  filtSel.onchange=e=>{ admView.filter=e.target.value; renderAdminUsers(); };

  renderAdminUsers();
  renderAdminFeedback();
}

const FB_KIND_HE={bug:'🐞 באג',idea:'💡 רעיון',other:'💬 אחר'};
async function renderAdminFeedback(){
  const host=$('#admFb'); if(!host) return;
  const { rows, error }=await Store.adminListFeedback();
  if(error){
    host.innerHTML=`<p class="msg" style="color:var(--ink-soft)">אין עדיין טבלת דיווחים — הרץ את
      <b>migrations/4.sql</b> ב-SQL Editor. עד אז דיווחים נשלחים אליך במייל.</p>`;
    return;
  }
  refreshFbBadge();                          // the list is open; make sure the badge agrees with it
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
$('#adminBtn2').onclick=openAdmin;
$('#notifCta').onclick=async()=>{
  const ok=await NOTIF.ask();
  $('#notifCta').classList.add('hidden');
  toast(ok ? 'מעולה — תקבל תזכורת בבוקר' : 'אפשר להפעיל התראות מאוחר יותר בהגדרות הדפדפן');
};
$('#lockContact').onclick=()=>{
  const mail=(currentUser&&currentUser.email)||'';
  location.href='mailto:03hagay@gmail.com?subject='+encodeURIComponent('חידוש מנוי — 800+')
    +'&body='+encodeURIComponent('החשבון שלי: '+mail);
};

/* ===== preview =====
   The survey's clearest finding was that a mandatory account is the first wall people hit.
   Preview opens unit 1 and the level test with no sign-up. Progress is real and kept locally
   under its own owner key, so the moment an account is created nothing has to be discarded —
   and a preview session can never leak into a real account's cache. */
function startPreview(){
  PREVIEW = true;
  bindCacheToUser('preview');
  show($('#pvBar'));
  hide($('#fbFab'));
  LANG = null;
  renderWelcome();
}
/* Leaving the preview no longer throws the work away on the way to the sign-up form.
   A visitor who tapped "create account" and then changed their mind landed on a screen with
   no way back, with everything they had practised already deleted. The data now stays under
   owner='preview'; bindCacheToUser clears it only once a real account actually takes over. */
function endPreview(){
  PREVIEW = false;
  hide($('#pvBar'));
  setAuthMode('signup'); buildAuthDrift(); goto('auth');
}
function backFromAuth(){
  if(currentUser) return;                       // signed in: nothing behind this screen
  if(LS.get('hw_owner',null)==='preview'){ PREVIEW=true; show($('#pvBar')); renderWelcome(); }
  else goto('intro');
}

$('#introTry').onclick  = ()=>{ LS.set('hw_seenIntro',1); startPreview(); };
$('#introAuth').onclick = ()=>{ LS.set('hw_seenIntro',1); setAuthMode('signin'); buildAuthDrift(); goto('auth'); };
// lands on the sign-up tab already open, so the decision the visitor already made is not re-asked
$('#introSignup').onclick = ()=>{ LS.set('hw_seenIntro',1); setAuthMode('signup'); buildAuthDrift(); goto('auth'); };
$('#pvSignup').onclick  = ()=>endPreview();
$('#authBack').onclick   = backFromAuth;

/* Does this device hold a Supabase session? Answerable SYNCHRONOUSLY, straight off localStorage,
   long before the network round trip that validates it. That one fact is the difference between
   "רגע…" and a login form: a returning user must never be shown a password field on the way in.
   Only used to word the splash — the real decision still waits for currentSession(). */
function looksSignedIn(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  }catch(e){}
  return false;
}

async function checkSessionAndBoot(){
  const t0=Date.now();
  $('#bootMsg').textContent = looksSignedIn() ? 'מחזיר אותך פנימה…' : 'רגע…';
  let sess=null;
  /* Raced against a timeout. A hung request used to mean a login form appeared "eventually";
     now it would mean a spinner forever, which is worse. Six seconds, then decide without it. */
  try{
    sess=await Promise.race([
      Store.currentSession(),
      new Promise(r=>setTimeout(()=>r(null), 6000))
    ]);
  }catch(e){}
  /* Below ~400ms the splash reads as a flicker, which is its own kind of ugly. Above it, it
     reads as the app starting. Only ever waits on a FAST answer — a slow one is already past. */
  const wait=400-(Date.now()-t0);
  if(wait>0) await new Promise(r=>setTimeout(r, wait));
  if(sess && sess.user){ currentUser=sess.user; await afterAuthed(false); }
  else {
    // a stranger meets the landing page, not a password field: the survey's clearest finding
    setAuthMode('signin'); buildAuthDrift(); hide($('#fbFab'));
    goto(LS.get('hw_seenIntro',0) ? 'auth' : 'intro');
  }
  try{
    /* This used to read `if(s && s.user && !currentUser)` — it reacted to "nobody was signed in
       yet" instead of to "who is signed in changed". A second account signing in on a page that
       already had a session was therefore ignored completely: the screen kept the FIRST user's
       name and local cache while every request went out with the SECOND user's token, and the
       next save wrote one account's progress into the other's row.
       Supabase can hand us a different user without any click here — a confirmation or
       reset link opened in this tab carries its own session. Compare identity, not emptiness. */
    Store.onAuthChange((s)=>{
      const uid = s && s.user && s.user.id;
      if(uid){
        if(uid !== (currentUser && currentUser.id)){ currentUser=s.user; afterAuthed(false); }
      } else {
        currentUser=null;
      }
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
  /* Watchdog. The splash is now the first paint, so anything that hangs after it — a profile
     read, the progress pull — would leave a spinner on screen with no way out. Twelve seconds,
     then route by the one fact we can establish locally and let the user get on with it. */
  setTimeout(()=>{
    if($('#boot') && !$('#boot').classList.contains('hidden')){
      console.warn('[boot] הכניסה לא הסתיימה בזמן — ממשיך בלי המתנה');
      /* Latch it. Only currentSession() is raced against a timeout; myProfile() and
         pullAccountState() are not. If one of them was merely slow rather than dead, it wakes
         up minutes later and afterAuthed carries on to its goto() — dragging the learner out of
         a screen they had already started working in. From here on, afterAuthed may finish its
         work but must not navigate. */
      bootTimedOut=true;
      if(looksSignedIn() && currentUser){ renderWelcome(); goto('welcome'); }
      else fallbackToAuth();
    }
  }, 12000);
  try{ Promise.resolve(checkSessionAndBoot()).catch(fallbackToAuth); }
  catch(e){ fallbackToAuth(); }
})();
