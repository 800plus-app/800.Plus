'use strict';
/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');
const esc = s => String(s==null?'':s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
/* משפטי הדוגמה מגיעים מהמחולל עם <b> סביב המילה הנלמדת ועם תרגום שבו מודגשת
   המילה המתורגמת. הזרקה גולמית הייתה עובדת, אבל היא מסתמכת על שער שרץ **בצד שני**
   של הפרויקט: נבנה בפייתון, נצרך בדפדפן. כאן בורחים מהכול ואז מחזירים <b> ו-</b>
   בלבד, ולכן שום תג אחר אינו יכול להגיע למסך גם אם הקובץ ייערך ביד. */
const exBold = s => esc(s).replace(/&lt;(\/?)b&gt;/g, '<$1b>');
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),1900); }

/* ===== persistence (all local) ===== */
/* Storage is the app's only source of truth, so every write is defensive:
   a full disk / Safari private mode must never throw mid-round and lose a session. */
let storageWarned = false;
const LS = {
  get(k,d){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } },
  set(k,v,opts){
    let payload;
    try{ payload = JSON.stringify(v); }catch(e){ return false; }
    /* ⚠ כתיבה מתכלה · `LS.set(k,v,{expendable:true})`.
       יומן האבחון הוא הכותב היחיד שמשתמש בזה, ושתי הפעולות שכתיבה רגילה עושה
       כשאין מקום אסורות עליו:
         · shedStorage · הוא גוזם את היסטוריית הסבבים של הלומד. לתת ליומן מדידה
           לקנות לעצמו מקום במחיר התקדמות אמיתית הופך כלי אבחון לנזק.
         · פס ההתראה · הוא אומר "ההתקדמות שלך לא נשמרת", וכשמה שנפל הוא רשומת
           אבחון זה פשוט לא נכון.
       כתיבה כזאת נופלת בשקט, וזו ההתנהגות הנכונה עבורה.
       וגם בהצלחה היא אינה מורידה את הפס: רשומה בת 80 בתים שנכנסה אינה מוכיחה
       שהבלוב של הסטטיסטיקה נכנס, והורדת הפס הייתה אות שקט כוזב. */
    const cheap = !!(opts && opts.expendable);
    try{ localStorage.setItem(k, payload); if(storageBarOn && !cheap) hideStorageBar(); return true; }
    catch(e){
      if(cheap) return false;
      /* quota exceeded (or storage disabled) -- shed the least valuable data and retry once.
         The retry must re-serialize: shedStorage trims stats.sessions in memory, and `v` is
         usually that very object, so re-sending the payload built above would write back
         exactly what did not fit and undo the shedding in the same breath. */
      if(shedStorage()){
        try{ payload = JSON.stringify(v); }catch(e4){}
        try{ localStorage.setItem(k, payload); hideStorageBar(); return true; }catch(e2){}
      }
      /* A toast lasts under two seconds and then this fails in total silence for the rest of
         the session, while every later round is quietly lost. A learner deserves to know the
         app has stopped remembering -- and to know whether the cloud still has them. */
      if(!storageWarned){ storageWarned=true; try{ toast('אין מקום פנוי בדפדפן. חלק מההתקדמות לא נשמרה'); }catch(e3){} }
      try{ showStorageBar(); }catch(e5){}
      return false;
    }
  },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
/* A bar, not a toast: it stays until a write succeeds, because the condition stays until then
   too. The wording changes with the one fact that decides how bad this is -- whether there is a
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
    ? 'הזיכרון של הדפדפן מלא. ההתקדמות ממשיכה להישמר בחשבון שלך, אבל לא במכשיר הזה. פנה מקום כדי לחזור לעבודה רגילה.'
    : '⚠ הזיכרון של הדפדפן מלא וההתקדמות שלך <b>לא נשמרת</b>. פתח חשבון או פנה מקום בדפדפן.';
  bar.classList.remove('hidden');
}
function hideStorageBar(){
  if(!storageBarOn) return;
  storageBarOn=false;
  const bar=document.getElementById('stgBar');
  if(bar) bar.classList.add('hidden');
}
/* מפתח יומן האבחון. מוצהר כאן, למעלה, ולא יחד עם שאר הסעיף שלו · shedStorage
   זורק אותו ראשון וחייב להכיר את השם. הסעיף המלא נמצא מיד אחריו. */
const DIAG_KEY = 'hw_diag_log';
/* Sessions history is the only unbounded-ish store; drop the old tail first.
   The live `stats` object is trimmed FIRST and from memory, because it holds the round that
   just ended -- the one that triggered the overflow and is not on disk yet. Reading the disk
   copy and assigning it back over stats.sessions threw that round away. */
function shedStorage(){
  let freed=false;
  /* ⭐ יומן האבחון נזרק ראשון, לפני שנוגעים בהיסטוריה של הלומד · והוא נזרק גם
     כשגיזום הסבבים לבדו היה מספיק. הוא כלי מדידה של חגי ואפשר לייצר אותו שוב
     בסבב תרגול אחד; סבב שנגזם אבוד לתמיד. הסדר כאן הוא כל ההבדל.
     ⚠ בלי `return` באמצע: ל-LS.set יש ניסיון חוזר אחד בלבד, ולכן שחרור חלקי
     שמסתפק ביומן היה מפיל כתיבה שגיזום הסבבים כן היה מציל. שני השלבים רצים. */
  try{
    if(localStorage.getItem(DIAG_KEY)!=null){ localStorage.removeItem(DIAG_KEY); freed=true; }
  }catch(e){}
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

/* ===== מונה דחיות · כבוי כברירת מחדל, מקומי בלבד =====
 *
 * למה הוא קיים
 * -------------
 * חמישה צילומי מסך של דחיות מעצבנות שחגי שלח לימדו יותר מ-115,881 שורות
 * סינתטיות שיוצרו, כי הן אמיתיות. האפליקציה מעולם לא שמרה **מה הוקלד**, ולכן
 * ברגע שהצילום נסגר לא נשאר ממנו כלום ואין ממה ללמוד. כאן זה נשמר.
 *
 * ⭐ ושני דברים נרשמים, לא אחד: הדחייה עצמה, ולחיצה על "בעצם ידעתי" שמסמנת
 * אותה כשגויה בדיעבד. היחס ביניהן הוא `override rate` · המדד שהמחקר הצביע
 * עליו כנכון יותר מ-recall, כי הוא מודד את הבודק ולא את הלומד.
 *
 * ⛔ ארבעה גבולות. כל אחד מהם נבדק ב-tests/75, ולכל בדיקה הוכחו שיניים
 * ---------------------------------------------------------------------
 * 1. **כבוי כברירת מחדל, ולחלוטין.** בלי הדגל `hw_diag`, diagLog יוצא בשורה
 *    הראשונה ואינו נוגע באחסון כלל · אפס כתיבות, אפס אחסון, אפס נתונים אצל
 *    כל מי שאינו חגי. איסוף מידע על נרשמים אמיתיים דורש גילוי והסכמה, ואלה
 *    אינם קיימים כאן, ולכן ברירת המחדל אינה "כמעט כלום" אלא כלום.
 * 2. **מקומי בלבד.** אין בסעיף הזה `fetch` ואין `sb.from`. המפתח `hw_diag_log`
 *    גם אינו נאסף לענן בדרך עקיפה: collectExtras סורק את התחילית `hw_exam:`
 *    בלבד, והבלוב המסונכרן בנוי מ-assoc/stats/deleted/added/dir/extras. חגי
 *    מייצא ביד.
 * 3. **תקרה קשיחה של 500 רשומות**, מעגלית, והישנה נזרקת ראשונה.
 * 4. **נכתב דרך LS.set**, ככתיבה מתכלה. הוא לעולם אינו גוזם התקדמות אמיתית
 *    ולעולם אינו מרים את פס ההתראה. ראה את ההערה ב-LS.set ואת הסדר בתוך
 *    shedStorage · שם היומן הוא הראשון שנזרק.
 *
 * ⚠ החלפת חשבון מכבה את המונה. wipeAccountKeys מוחק כל מפתח `hw_` שאינו
 * ברשימת ההיתר, ולכן כניסה או יציאה מוחקות גם את הדגל וגם את היומן. זה נכון
 * ומכוון · היומן מחזיק את מה שאדם הקליד, ואין להעביר אותו לחשבון של אדם אחר.
 * המחיר: אחרי החלפת חשבון צריך להדליק שוב.
 */
const DIAG_FLAG = 'hw_diag';     // המתג. חגי מדליק ביד, ואף קוד אינו מדליק אותו
const DIAG_MAX  = 500;           // התקרה הקשיחה
const DIAG_COLS = ['id','ts','lang','dir','term','typed','why','near','dist','ovr'];
let diagSeq = 0;                 // מזהה רץ, בתוך חיי טעינה אחת

function diagOn(){
  /* קריאה בלבד. מפתח חסר אינו נכתב, ולכן עצם הבדיקה אינה מייצרת אחסון אצל
     מי שלא הדליק · וזו בדיוק הדרישה. `'1'` מתקבל לצד `1` כי חגי עשוי להקליד
     `localStorage['hw_diag']='1'` ישירות, וזה שומר מחרוזת גולמית. */
  try{ const v = LS.get(DIAG_FLAG, 0); return v===1 || v==='1'; }catch(e){ return false; }
}
/* המתג הגלובלי. `hwDiag()` בלי ארגומנט מחזיר את המצב בלי לשנות אותו. */
function hwDiag(on){
  if(on===undefined) return diagOn();
  if(on) LS.set(DIAG_FLAG, 1);
  else { LS.del(DIAG_FLAG); LS.del(DIAG_KEY); }   // כיבוי מוחק גם את מה שנאסף
  return diagOn();
}
function diagRead(){
  try{ const v = LS.get(DIAG_KEY, []); return Array.isArray(v) ? v : []; }catch(e){ return []; }
}
function diagLog(row){
  try{
    if(!diagOn()) return 0;                       // ⛔ השער. לפני כל נגיעה באחסון
    const log = diagRead();
    row.id = ++diagSeq;
    log.push(row);
    /* slice ולא הסרה של אחד: אם היומן שעל הדיסק כבר ארוך מהתקרה · קובץ שנערך
       ביד, או תקרה שהורדה בגרסה חדשה · הסרת רשומה אחת לא הייתה מחזירה אותו
       אל מתחת לגבול, והחריגה הייתה נשארת לנצח. */
    const kept = log.length>DIAG_MAX ? log.slice(log.length-DIAG_MAX) : log;
    /* מזהה מוחזר רק אם הרשומה באמת ירדה לדיסק. כתיבה מתכלה נופלת בשקט כשאין
       מקום, ומזהה לרשומה שאינה קיימת היה שולח את diagMark לחפש אותה לשווא. */
    return LS.set(DIAG_KEY, kept, {expendable:true}) ? row.id : 0;
  }catch(e){ return 0; }                          // אבחון לעולם אינו מפיל תרגול
}
/* סימון "בעצם ידעתי" על רשומה קיימת. מתג ולא פעולה חד-כיוונית, בדיוק כמו
   הכפתור עצמו · ביטול הלחיצה חייב להחזיר את הרשומה ל-0, אחרת override rate
   סופר לחיצות שבוטלו. */
function diagMark(id, on){
  try{
    if(!id || !diagOn()) return false;
    const log = diagRead();
    /* מהסוף להתחלה: diagSeq מתאפס בכל טעינת עמוד ולכן מזהה יכול לחזור על עצמו
       בין טעינות. הרשומה שנכתבה לפני רגע היא האחרונה שנושאת את המזהה הזה. */
    for(let i=log.length-1;i>=0;i--){
      if(log[i] && log[i].id===id){
        log[i].ovr = on?1:0;
        LS.set(DIAG_KEY, log, {expendable:true});
        return true;
      }
    }
    return false;
  }catch(e){ return false; }
}
/* למה נדחתה · נגזר בדיעבד, מאותן פונקציות שהכריעו, בלי לגעת באף אחת מהן.
   מוחזרת שלישייה ולא תווית אחת, כי תווית לבדה אינה ניתנת לבדיקה חוזרת:
   `near` היא התשובה הקבילה הקרובה ביותר ו-`dist` הוא מרחק העריכה אליה, ולכן
   אפשר לחלוק על הסיווג בלי לאבד את הנתון. */
function diagWhy(w, typed, w2m){
  const out = { why:'', near:'', dist:'' };
  try{
    const a = w2m ? norm(typed) : K(typed);
    if(!a){ out.why='empty'; return out; }
    let targets = w2m
      ? (meaningSegs(w.meaning)||[]).slice()
      : [w.term].concat(glossAlts(w)||[]).map(t=>K(t));
    if(w2m && !targets.length) targets = [norm(w.meaning)];
    targets = targets.filter(Boolean);
    if(!targets.length){ out.why='no-target'; return out; }
    let best='', bd=Infinity;
    for(const t of targets){ const d=editDist(a,t); if(d<bd){ bd=d; best=t; } }
    out.near=best; out.dist=bd;
    /* אותו סף שבו creditSense מזכה · שליש מאורך הפירוש, לפחות 1. מתחתיו זו
       שגיאת כתיב ולא פירוש אחר, וזו בדיוק הדחייה שחגי צילם. */
    const tol = Math.max(1, Math.floor(best.length/3));
    if(bd===0)        out.why='exact';    // ⚠ התאמה מדויקת שנדחתה. ממצא בפני עצמו
    else if(bd<=tol)  out.why='typo';
    /* התשובה נמצאת בתוך הפירוש המלא אבל אינה פירוש קביל · כמעט תמיד מילה
       שנשלפה מתוך הסוגריים המסבירים, ש-meaningSegs מסירה במכוון. */
    else if(w2m && String(w.meaning).indexOf(String(typed).trim())>=0) out.why='in-gloss';
    else              out.why='other';
  }catch(e){ out.why='err'; }
  return out;
}
/* רשומת דחייה אחת. נקראת מ-finishCard בענף "לא נכון" בלבד.
   ⚠ דילוג אינו דחייה · הלומד לא ענה, אין מחרוזת שהוקלד, וספירתו הייתה
   מדללת את override rate במכנה שאין לו מונה. */
function diagReject(w, typed, w2m){
  if(!diagOn()) return 0;
  const r = diagWhy(w, typed, w2m);
  return diagLog({
    ts: new Date().toISOString(),
    lang: LANG||'', dir: w2m?'w2m':'m2w',
    term: w.term, typed: String(typed==null?'':typed),
    why: r.why, near: r.near, dist: r.dist, ovr: 0
  });
}
/* TSV ולא JSON · חגי מעתיק את הפלט לצ'אט וצריך שיהיה קריא בעין ובטבלה.
   טאב או שורה חדשה בתוך מה שהוקלד היו שוברים את הרשת, ולכן הם הופכים לרווח. */
function hwDiagTsv(){
  const cell = v => String(v==null?'':v).replace(/[\t\r\n]+/g,' ');
  return [DIAG_COLS.join('\t')]
    .concat(diagRead().map(r => DIAG_COLS.map(c=>cell(r&&r[c])).join('\t')))
    .join('\n');
}
function diagCountText(n){
  /* "1 רשומות" אינו עברית. אותו כלל שחל על שורת הספירה למבחן. */
  if(n===0) return 'אין עדיין רשומות';
  if(n===1) return 'רשומה אחת';
  if(n===2) return 'שתי רשומות';
  return n+' רשומות';
}
/* העתקה מהמסך. הורדת קובץ אוטומטית אינה תמיד עובדת, ולכן הדרך הראשית היא
   textarea מסומן שאפשר להעתיק ממנו · ו-`copy(hwDiagTsv())` בקונסול נשאר
   כדרך שנייה, בלתי תלויה בזו. */
function hwDiagShow(){
  const rows = diagRead();
  const box = document.createElement('div');
  const old = document.getElementById('diagBox'); if(old) old.remove();
  box.id='diagBox';
  box.style.cssText='position:fixed;inset:6vh 4vw;z-index:99999;background:#fff;color:#111;'
    +'border:2px solid #333;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px';
  const h=document.createElement('div');
  h.textContent='יומן דחיות · '+(diagOn()?diagCountText(rows.length):'המונה כבוי · hwDiag(true) להדלקה');
  h.style.cssText='direction:rtl;font-weight:700';
  const ta=document.createElement('textarea');
  ta.value=hwDiagTsv(); ta.readOnly=true;
  ta.style.cssText='flex:1;width:100%;direction:ltr;white-space:pre;font-family:monospace;font-size:12px';
  const tip=document.createElement('div');
  tip.textContent='הטקסט מסומן · Ctrl+C להעתקה';
  tip.style.cssText='direction:rtl;font-size:13px;opacity:.75';
  const btn=document.createElement('button');
  btn.textContent='סגור'; btn.onclick=()=>box.remove();
  btn.style.cssText='align-self:flex-start;padding:6px 18px';
  box.appendChild(h); box.appendChild(ta); box.appendChild(tip); box.appendChild(btn);
  document.body.appendChild(box);
  ta.focus(); ta.select();
  return rows.length;
}
/* מונגשים במפורש ל-window · חגי מפעיל אותם מהקונסול. הצהרה מפורשת ולא הסתמכות
   על כך שהצהרת פונקציה בקובץ קלאסי נוחתת על window ממילא. */
try{ window.hwDiag=hwDiag; window.hwDiagTsv=hwDiagTsv; window.hwDiagShow=hwDiagShow; }catch(e){}

/* ---- language layer: Hebrew keeps the ORIGINAL keys so existing progress is never lost ---- */
let LANG = LS.get('hw_lang', null);            // 'he' | 'en' | null (not chosen yet)
if(LANG!=='he' && LANG!=='en') LANG=null;
/* declared here, not next to startPreview(): buildBank() reads it and runs long before
   that block would execute, which would throw on the temporal dead zone */
let PREVIEW = false;
const PREVIEW_UNIT = '1';
/* הגדר המקביל להשלמת משפטים. המילים נפתחות ביחידה הראשונה בלבד, והמשפטים ברצועה
   הראשונה בלבד · אותו היגיון, אותה מידה: 22 מתוך 204 הם 11%, ו-395 מתוך 3,946 הם
   10%. ⚠ עד 11.8.2026 המשפטים היו **פתוחים לגמרי** בהצצה, לא מתוך החלטה אלא מפני
   ש-PREVIEW מסנן יחידות והמשפטים אינם בנויים ביחידות. כל עוד התרגול לא היה קיים
   במסך זה לא הורגש; מסך בחירת התרגול הפך אותו לאחת משתי אפשרויות שוות-מעמד במסך
   הראשון שאדם רואה, אחת מגודרת ואחת פתוחה. */
const PREVIEW_BAND = 'בסיס';
const SUF = () => (LANG==='en' ? '_en' : '');  // Hebrew = legacy keys, English = *_en keys
const KEY = base => base + SUF();

const DEFAULT_DIR = 'w2m';        // the exam shows the word and asks the meaning -- so do we
let assoc={}, stats={words:{},sessions:[]}, deleted=new Set(), added=[], direction=DEFAULT_DIR;

/* Anything read back from localStorage may be corrupt, hand-edited, or written by an
   older build. Coerce it into the exact shape the rest of the app assumes -- otherwise a
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
     that was taken by the wrong person -- the incident this field was added for. */
  if(r.src) out.src=String(r.src).slice(0,8);
  /* הרמה שהייתה לפני שהלומד סימן "ידעתי", כדי שביטול הסימון יחזיר אותה במקום לאפס.
     בלי השדה הזה ביטול היה מוחק היסטוריית תרגול אמיתית · וזה בדיוק מה שהמאגר נזהר ממנו. */
  if(r.k0!==undefined) out.k0=int0(r.k0);
  /* מתי המילה **נלמדה** · הרגע שבו הלומד נפגש בה בפעם הראשונה ולא ידע אותה.
     נוכחות t0 היא ההגדרה עצמה: אין דגל נפרד, כי "יש תאריך למידה" ו"נלמדה דרך טעות"
     הם אותה עובדה, ושני שדות שאמורים להסכים תמיד הם שני שדות שיום אחד לא יסכימו.
     ⚠ זה אינו last. last הוא "תורגלה לאחרונה" וזז קדימה בכל סבב · t0 נכתב פעם אחת
     ולעולם לא זז, כי הוא היסטוריה ולא מצב. */
  if(r.t0!==undefined) out.t0=int0(r.t0);
  /* אילו פירושים של המילה הלומד כבר כתב, כאינדקסים לתוך meaningSegs. משתמש דיווח שהוא
     עונה פירוש אחד מתוך כמה, מקבל "נכון", ושוכח את השאר · האפליקציה אישרה לו שהוא יודע
     את המילה בזמן שידע שליש ממנה.
     מערך ולא מונה: צריך לדעת אילו, לא כמה, אחרת אותו פירוש ייענה שלוש פעמים וייחשב לשלושה.
     תקרה של 8 כי מעבר לזה זה כבר לא מילה אלא ערך מילוני, ורשומה חייבת להישאר קטנה · היא
     נדחפת לענן בכל סבב. */
  if(Array.isArray(r.sens)){
    /* אין slice כאן. int0(x,7) חוסם כל ערך ב-7, ואחרי הסרת כפילויות יש לכל היותר שמונה
       ערכים שונים · התקרה נובעת מהחסימה עצמה. slice נוסף היה נראה כהגנה ולא היה יכול
       לרוץ אף פעם, וזה בדיוק סוג השורה שמישהו מסיר בעתיד ולא קורה כלום, ולומד ממנה
       שהתקרה לא חשובה. התקרה שכן נושאת משקל היא זו שב-noteSense. */
    const s=[...new Set(r.sens.map(x=>int0(x,7)))].sort((x,y)=>x-y);
    if(s.length) out.sens=s;
  }
  return out;
}
/* ⭐ שחזור t0 להיסטוריה שנצברה לפני שהשדה קיים · **קירוב מוצהר, לא שחזור אמיתי.**
   מה שנכנס: מילה שנפגשו בה, מעולם לא ענו עליה נכון בניסיון ראשון, וטעו בה לפחות
   פעם אחת. זו תת-קבוצה **נקייה** · אם first===0 ומספר הטעויות חיובי, אז בהכרח גם
   המפגש הראשון לא היה נכון-בניסיון-ראשון, כי אין לאן להסתיר מפגש מוצלח.
   ⚠ מה שלא נכנס, ואי אפשר להחזיר: מילה שנלמדה דרך טעות ואז נשלטה. אחרי ששלטו בה
   first עולה, והמונים חסרי סדר · אין שום דרך להבדיל בינה לבין מילה שידעו מיד.
   הן פשוט חסרות מהרשימה עד שיטעו בהן שוב.
   ⚠ והתאריך אינו התאריך. last הוא "תורגלה לאחרונה", וזה מה שיש · לכן הסדר בין
   הוותיקות מקורב, ומתייצב מעצמו ככל שנצברות מילים עם t0 אמיתי.
   src==='lv' יוצא: מבחן הרמה כותב רשומה מלאה בלי שהלומד נפגש במילה בכלל.
   idempotent · t0 קיים ⇒ דילוג, ולכן אין צורך בדגל מיגרציה והרצה חוזרת אינה מזיזה
   דבר. מחזיר כמה שוחזרו, כדי שיהיה מה לבדוק בלי DOM. */
function backfillT0(words){
  let n=0;
  for(const k in words){
    const r=words[k];
    if(!isObj(r) || r.t0) continue;
    /* ⛔ התנאי היה `first===0 && wrong>0`, כלומר "מעולם לא ידע אותה בניסיון ראשון".
       זה פסל כל מילה שנלמדה דרך טעות **ואז נשלטה**, כי שליטה מעלה את `first`.
       אצל חגי זה החזיר מילה אחת בזמן שמסך הסטטיסטיקה הציג 31 מילים "שטעית בהן
       בעבר וכבר יודע". כלומר הנתון היה שם כל הזמן.
       ⭐ `wrong` הוא מונה מצטבר שאינו מתאפס לעולם, וזה בדיוק האות ש-`renderStats`
       משתמש בו (`settled`). היחידה מיושרת עכשיו למסך: מה שהמסך סופר כמילה שטעית
       בה, נכנס לחזרות. */
    if(r.seen>0 && r.wrong>0 && r.src!=='lv'){ r.t0 = r.last || Date.now(); n++; }
  }
  return n;
}
/* כמה פירושים נפרדים יש למילה, וכמה מהם הלומד כבר כתב. שניהם נגזרים מאותו meaningSegs
   שמכריע אם תשובה נכונה, ולכן אי אפשר שהמונה יימדד על חלוקה אחת והבדיקה על אחרת. */
function senseCount(meaning){ return meaningSegs(meaning).length; }
function sensesLeft(term, meaning){
  const n=senseCount(meaning);
  if(n<2) return 0;                       // מילה עם פירוש אחד · אין מה לדרוש
  const r=stats.words[K(term)];
  const got=(r && Array.isArray(r.sens)) ? r.sens.filter(i=>i<n).length : 0;
  return Math.max(0, Math.min(n,2) - got);   // דורשים שניים, לא את כולם
}
/* Has loadLangState() actually moved this language's progress from localStorage into the
   globals above? Until it has, `stats`/`assoc`/`deleted` hold their declared defaults -- an
   EMPTY state that looks exactly like a brand-new device.
   This matters because the welcome screen never calls loadLangState(): langSummary() reads
   localStorage directly, so the screen shows correct numbers over an empty memory. pullIfStale()
   fires on visibilitychange/online/focus and only checks `currentUser` and `LANG` -- and LANG is
   read from localStorage on the first line of this file, so it is already 'he'. The merge then
   ran with an empty left-hand side, the cloud won every record by default, saveStats() wrote
   that over the good disk copy, and pushProgress sent it back up.
   Measured on a real device on 2.8.2026: a full offline session -- 18 words, a practice round,
   the streak and two word deletions -- was gone after closing and reopening the app.
   A merge whose local side was never loaded is not a merge. It is an overwrite. */
let langLoaded=false;
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
  backfillT0(words);
  const srcS=isObj(s)&&Array.isArray(s.sessions)?s.sessions:[];
  stats={ words, sessions: srcS.filter(isObj).slice(-MAX_SESSIONS) };

  const d=LS.get(KEY('hw_deleted'), []);
  deleted=new Set(Array.isArray(d)?d.filter(x=>typeof x==='string'):[]);

  const ad=LS.get(KEY('hw_added'), []);
  added = Array.isArray(ad)
    ? ad.filter(p=>Array.isArray(p)&&typeof p[0]==='string'&&typeof p[1]==='string'&&p[0].trim()&&p[1].trim())
    : [];

  /* DEFAULT_DIR is w2m -- word first, meaning second -- because that is the direction the
     psychometric exam itself asks in. Someone who never opens this setting should be
     practising the way they will be tested, not the other way round. It is only a default:
     a saved choice always wins, so nobody's existing setting moves. */
  const dir=LS.get(KEY('hw_dir'), DEFAULT_DIR);
  direction = (dir==='m2w'||dir==='w2m'||dir==='mixed') ? dir : DEFAULT_DIR;
  langLoaded=true;                      // from here on the globals mirror the disk
}
/* ===== two tabs =====
   Every save writes the WHOLE object, so a second tab silently overwrote the first one's round:
   measured at 20 words practised and 10 stored, with none of the first tab's surviving.
   The `storage` event fires only in the OTHER tabs, so it is exactly the signal needed. It is
   not acted on immediately -- reloading state under a running round would swap the deck out from
   under the learner. It raises a flag, and the next save reconciles before it writes.
   The merge is mergeProgress(), the same function the cloud sync uses: counts take the max,
   level comes from whichever record was written last, sessions dedupe on their own fields.
   Reusing it matters -- a second merge written by hand here would drift from that one. */
let diskAhead=false;
let bootTimedOut=false;   // the boot watchdog fired: afterAuthed may finish, but must not navigate
/* "ידעתי" · המצב שבאמצע בין מחיקה לתרגול.
 *
 * דיווח משתמשת: "יצא לי לחפש האם יש אפשרות לסמן מילים שמכירים מתוך המאגר... כי אני כן רוצה
 * לתרגל אותם אבל לא ללמוד מחדש".
 *
 * מחיקה מוציאה את המילה מהמאגר לגמרי · היא לא תופיע בשום סבב ולא בשום מבחן. זה יותר מדי.
 * מה שנדרש הוא להוציא אותה מרשימת החיזוק ומ"מילים שעוד לא תרגלת", ולהשאיר אותה זמינה
 * ב"תרגל הכל" וב"מילים שלמדתי".
 *
 * הסימון הוא src:'known', באותה שיטה שבה מבחן הרמה מסמן src:'lv' · כך הוא ניתן לזיהוי,
 * לספירה ולביטול. הרמה הקודמת נשמרת ב-k0 ומוחזרת בביטול, כדי שסימון בטעות לא ימחק
 * היסטוריית תרגול אמיתית.
 *
 * למה כן נספרת כ"בשליטה": הלומד הצהיר במפורש שהוא יודע אותה. זה שונה ממילה שמבחן הרמה
 * דילג עליה על סמך הערכה סטטיסטית · ולכן wasSkipped נשאר מוגבל ל-'lv' בלבד. */
const isKnown = term => { const r=stats.words[K(term)]; return !!(r && r.src==='known'); };
function markKnown(term){
  const r=rec(term);
  if(r.src==='known') return false;
  r.k0=int0(r.level);
  r.src='known'; r.seen=Math.max(1,int0(r.seen)); r.level=3; r.last=Date.now();
  return true;
}
function unmarkKnown(term){
  const r=stats.words[K(term)];
  if(!r || r.src!=='known') return false;
  r.level=int0(r.k0); delete r.k0; delete r.src;
  return true;
}
/* Keys the user explicitly restored. Persisted, because the deletion it reverses is persisted
   too -- a log that lived only in memory would let the next page load re-delete the word. An
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
    toast('מאגר האסוציאציות מלא. קצר או מחק אסוציאציות ישנות');
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
/* Did the migrated stats actually reach the disk? Read it back rather than trusting the three
   save() return values, because what the next boot will see is the disk, not a boolean. */
/* Did all three migrated stores actually reach the disk?
 *
 * ONE gate, not two. The first version of this checked the three save() return values AND read
 * the disk back -- and a mutation run showed the read-back could be gutted without a single test
 * noticing, because the booleans were already answering. Two overlapping guards mean the weaker
 * one is never exercised, which is the same thing as not having it. The disk is what the next
 * boot will read, so the disk is the only thing asked.
 *
 * And it compares KEYS, not counts. The migration renames without changing how many there are -- 
 * 60 raw keys become 60 normalised ones -- so a disk still holding the old names has exactly the
 * count memory has, and a count check calls that "landed". That is not a hypothetical: it is what
 * the first draft of this function did, and the storage suite caught it. */
function migrationLanded(){
  const dS=LS.get(KEY('hw_stats'), null);
  if(!isObj(dS) || !isObj(dS.words)) return false;
  for(const k in stats.words) if(!(k in dS.words)) return false;
  if(Object.keys(dS.words).length !== Object.keys(stats.words).length) return false;
  // assoc and deleted are migrated by the same pass; a stamp that ignores them lets pruneOrphans
  // delete whichever of the two did not land. Defaults cover the never-written-because-empty case.
  const dA=LS.get(KEY('hw_assoc'), {});
  if(!isObj(dA)) return false;
  for(const k in assoc) if(!(k in dA)) return false;
  const dD=LS.get(KEY('hw_deleted'), []);
  if(!Array.isArray(dD)) return false;
  for(const k of deleted) if(!dD.includes(k)) return false;
  return true;
}
function migrateStores(){
  /* THE STAMP IS THE LAST THING WRITTEN, AND ONLY IF THE DATA IS REALLY THERE.
     It used to be written unconditionally. saveStats() returns false when the write failed, and
     `hw_migr` is nine bytes against a stats blob of tens of KB -- so on a nearly full disk the
     small write succeeds precisely when the large one did not. The result was the worst possible
     pair of states: OLD KEYS ON DISK, plus "the migration is finished".
     Next boot then reads the old keys, skips the migration because the stamp says 8, and
     pruneOrphans -- which cannot tell an un-migrated key from a word that left the bank -- deletes
     every one of them. Permanently, silently, and written straight back to disk.
     Leaving the stamp unwritten costs one repeated migration. Writing it costs the account. */
  if(LS.get(KEY('hw_migr'),0)===7){
    remapHyphenKeys();
    if(migrationLanded()) LS.set(KEY('hw_migr'),8);
    return;
  }
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
  if(migrationLanded()) LS.set(KEY('hw_migr'),8);
  else console.error('migrateStores: הכתיבה לא הושלמה. החותמת לא נרשמה, המיגרציה תרוץ שוב באתחול הבא');
}

/* Housekeeping: drop records/associations/deletions for words that no longer exist in the
   bank at all. Without this, every data refresh leaves permanent orphans in localStorage. */
function pruneOrphans(){
  const data=(LANG==='en'?window.UNIT_DATA_EN:window.UNIT_DATA)||{};
  const live=new Set();
  for(const u in data) for(const p of data[u]){ const k=K(p[0]); if(k) live.add(k); }
  for(const p of added){ const k=K(p[0]); if(k) live.add(k); }
  /* THE GUARD THAT WAS MISSING. `<script src="data.js">` has no onerror and nothing verified
     that the bank actually arrived -- and the service worker installs the data files
     best-effort. One failed fetch plus an offline launch therefore produced an EMPTY bank,
     and everything below read that as "every word the learner has is an orphan": all records,
     all associations, deleted permanently, silently, and written straight to disk.
     A bank this small is never a real state. Refuse to prune instead of trusting it. */
  if(live.size < 50){
    console.error('pruneOrphans בוטל: המאגר נטען חלקית ('+live.size+' מילים) · לא נמחק דבר');
    return;
  }
  /* ⛔ נמצא בבדק בית 3: הרצפה שמעל מגנה מפני מאגר **ריק**, לא מפני מאגר **חצי**.
     מאגר שהגיע עם 200 מילים מתוך 3,000 עובר אותה בנוחות, וכל שאר הרשומות
     נמחקות · ו-saveStats() גוררת queueRemoteSync(), כלומר האובדן נדחף גם לענן
     ואין ממנו חזרה. אותה משפחת כשל שההערה שמעל מתארת, רק בדרגה אחת פחות קיצונית,
     ולכן היא חמקה מהשומר שנכתב בדיוק בשבילה.
     הכלל היחסי: מחיקה שמוחקת את **רוב** רשומות הלומד אינה תחזוקה אלא תאונה.
     המינימום נדרש כדי שהכלל לא יתפוס לומד עם שתי רשומות שאחת מהן באמת יתומה,
     וזה מצב תקין לגמרי · ראו tests/06. */
  const recs=Object.keys(stats.words);
  const doomed=recs.filter(k=>!live.has(k));
  if(recs.length >= 20 && doomed.length > recs.length/2){
    console.error('pruneOrphans בוטל: '+doomed.length+' מתוך '+recs.length+
                  ' רשומות היו נמחקות · המאגר כנראה נטען חלקית');
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
/* אינדקס הבעלות של המונחים · מפתח מנורמל -> קבוצת הבעלים. נבנה בתוך buildBank ולא
   במעבר נוסף. הוא מה שהופך קבלה של מילת-מאגר-אחרת לבלתי אפשרית **מבנית**: סף מרחק,
   כמה שיהיה הדוק, הוא הבטחה הסתברותית שנשברת ברגע שנוסף למאגר זוג קרוב חדש.
   כולל את `added` של המשתמש, כי מילה שהוא הוסיף היא מילה תפוסה בדיוק כמו כל אחרת. */
let TERM_VETO = new Map();
const UNIT_IDS = ['1','2','3','4','5','6','7','8','9','10'];
/* INVARIANT: after buildBank(), BANK holds each normalized key AT MOST ONCE -- within a unit,
   across units, and across personal words. Everything downstream (counts, quizzes, stats)
   relies on this, so it is enforced here rather than trusted from the data files. */
function buildBank(){
  BANK = [];
  TERM_VETO = new Map();
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
    /* בעלות, לא פסילה. כל מפתח שהריצה מקבלת עבור הערך הזה · המילה עצמה וכל כתיב מלא
       שלה · הוא מפתח תפוס מנקודת המבט של **כל ערך אחר**. מה שהערך עצמו מקבל היום
       גובר תמיד (nearMatch פוטר מפתח שנמצא במועמדים שלו). */
    vetoPut(TERM_VETO, k, k);
    if(LANG!=='en') for(const v of heForms(term)) vetoPut(TERM_VETO, K(v), k);
  };
  for(const uid of Object.keys(data)){
    const rows = Array.isArray(data[uid]) ? data[uid] : [];
    for(const pair of rows){ if(Array.isArray(pair)) add(pair[0], pair[1], uid); }
  }
  for(const pair of added) add(pair[0], pair[1], 'custom');   // unit copy always wins
  buildGlossIndex();
  fullVetoPass();
}

/* ⛔ 16.8.2026 · הווטו במצב הצצה היה קטן פי עשרה, וזה נמדד ולא הונח.
 *
 * `PREVIEW` מסנן את הנתונים ליחידה 1 לפני שהלולאה מעליה רצה · וזה **נכון** עבור
 * `BANK`, כי מה שמתרגלים באמת הוא יחידה 1. אבל הווטו נבנה מאותה לולאה, והוא אינו
 * רשימת "מה מתרגלים" אלא רשימת **"מה תפוס בשפה"**. הצמצום שלו אינו החלטה · הוא
 * תופעת לוואי.
 *
 * מה שנמדד על כל 395 כרטיסי יחידה 1, מנייה מלאה ולא דגימה:
 *   · TERM_VETO ‏3,946 → 395 ‏(10.0%) · SEG_VETO ‏4,695 → 578 ‏(12.3%)
 *   · **17,345 מחרוזות** מתקבלות אצל אורח ונדחות אצל משתמש רשום.
 *   · מהן **10 הן תשובה קבילה של ערך אחר** · כלומר לומד חדש מקבל "נכון" על מילה
 *     שהוא לא התכוון אליה:
 *       monkey על money · crash על cash · though על through · resident על president
 *       farther על father · latter על later · joint על join · enter על center
 *       mistaken על mistake · probable על probably
 *
 * ⚠ והערוץ העיקרי הפתיע: לא הווטו עצמו (‏618) אלא **`far`** (‏16,727). `nearestOther`
 * נבנה מהווטו, ובשכונה דלילה ה-gap גדול, המשטר הצר אינו נדלק, וההכרעה עוברת
 * לספים הרפויים. כלומר הווטו קובע הרבה מעבר לפסילה הישירה.
 *
 * ⭐ למה מעבר נוסף ולא הרחבת הלולאות הקיימות: `buildGlossIndex` בונה `SEG_VETO`
 * ו-`GLOSS_ALT` יחד, ולשתיהן דרישות **הפוכות** · הווטו הוא גלובלי, ו-`GLOSS_ALT`
 * ("שני ערכים חולקים פירוש") חייב להישאר צמוד ל-`BANK`. הרחבה משותפת נמדדה כמוסיפה
 * **212 פטורי-נרדפות** לכרטיסי יחידה 1 (‏`able` היה מקבל `capable`) · כלומר קבלה
 * **רחבה יותר** לאורח, בדיוק ההפך מהמטרה.
 *
 * ואף תשובה נכונה אינה נפגעת: `acceptsToday` נבדקת ראשונה, ו-`isVetoedTerm` פוטרת
 * כל צורה של הכרטיס עצמו. כל 17,345 הן מחרוזות שאינן מתקבלות בשכבה המדויקת.
 * המחיר, מדוד: **+17ms חד-פעמי · ~1.5MB · אפס רשת** · `data-en.js` נטען ממילא. */
function fullVetoPass(){
  if(!PREVIEW) return;                       // no-op למשתמש רשום · הלולאות כבר מלאות
  const all = (LANG==='en' ? window.UNIT_DATA_EN : window.UNIT_DATA) || {};
  for(const uid of Object.keys(all)){
    const rows = Array.isArray(all[uid]) ? all[uid] : [];
    for(const pair of rows){
      if(!Array.isArray(pair)) continue;
      const term=pair[0], meaning=pair[1];
      if(typeof term!=='string' || !term.trim()) continue;
      const k=K(term);
      if(!k || deleted.has(k)) continue;
      vetoPut(TERM_VETO, k, k);
      if(LANG!=='en') for(const v of heForms(term)) vetoPut(TERM_VETO, K(v), k);
      for(const s of glossSenses(typeof meaning==='string' ? meaning : '')) vetoPut(SEG_VETO, s, k);
    }
  }
}

/* ===== words that share a gloss =====
   401 English entries and 47 Hebrew ones carry a gloss that is byte-identical to another
   entry's. In the default direction the gloss IS the question, so "ענף" can only be answered
   with זַלְזַל even though פֹּארָה is exactly as correct · and the learner who knows both is
   told they are wrong. The exam already accepted every word carrying the same gloss, but only
   within one unit and only in the exam; practice, where people spend their time, accepted one.
   Built once per bank build: a scan per keystroke over 5,619 entries is not free. */
let GLOSS_ALT = new Map();
/* הצד השני של הווטו · מקטע פירוש מנורמל -> קבוצת הבעלים. נבנה בתוך buildGlossIndex,
   שכבר עובר על אותם מקטעים בדיוק, ולכן בלי מעבר נוסף. */
let SEG_VETO = new Map();
function vetoPut(map, key, owner){
  if(!key) return;
  let s=map.get(key);
  if(!s){ s=new Set(); map.set(key,s); }
  s.add(owner);
}
function glossKey(g){
  return String(g||'').replace(/\s*\([^)]*\)/g,'')      // examples are not part of the meaning
    .replace(/\s+/g,' ').replace(/[.,;·]+$/,'').trim().toLowerCase();
}
/* הפירושים הבודדים של ערך, ולא המחרוזת כולה.
   glossKey השווה מחרוזות שלמות, ולכן תפס accurate/precise (שניהם "מדויק") אבל פספס את
   colossal="עצום" מול vast="עצום, נרחב, רחב ידיים" · 163 זוגות ביחידות 6-10 באנגלית
   לבדן, מול 20 שנתפסו. שני הערכים חולקים פירוש שלם, והלומד נשאל עליו פעמיים.
   meaningSegs הוא אותו פיצול שמחליט אילו תשובות מתקבלות, ולכן "שני ערכים חולקים
   פירוש" ו"אותה תשובה מתקבלת לשניהם" נשארים בהכרח אותו דבר. מקור אמת אחד. */
function glossSenses(g){
  /* בלי סינון אורך. הגרסה הראשונה כאן דרשה שני תווים לפחות · כמו הבדיקה הישנה על
     המחרוזת המלאה · אבל norm מסיר את המקף, ולכן הפירוש "מ-" הצטמצם לתו אחד ונזרק.
     התוצאה: from ו-than הפסיקו להיחשב חולקי פירוש, ושניהם הוצגו באותו סבב עם אותו
     פרומפט בדיוק. בדיקה 44 תפסה.
     נמדד: ארבעה פירושים באורך תו אחד בכל המאגר, וכולם מיליות עברית אמיתיות ·
     "מ" (from/of/than) · "ש" (that/which/who) · "ב" (at/in) · "ו" (and). אלה בדיוק
     המקרים שחייבים להיתפס, לא להיזרק.
     meaningSegs כבר מסנן ריקים ומילות קישור, ולכן אין כאן מה להוסיף. */
  return meaningSegs(g);
}
function buildGlossIndex(){
  GLOSS_ALT=new Map();
  SEG_VETO=new Map();
  for(const w of BANK){
    for(const s of glossSenses(w.meaning)){
      let arr=GLOSS_ALT.get(s); if(!arr){ arr=[]; GLOSS_ALT.set(s,arr); }
      if(!arr.includes(w.term)) arr.push(w.term);   // ערך עם אותו פירוש פעמיים לא נספר פעמיים
      vetoPut(SEG_VETO, s, K(w.term));
    }
  }
  for(const [s,arr] of GLOSS_ALT) if(arr.length<2) GLOSS_ALT.delete(s);
}
/* In the m2w direction the PROMPT is the gloss · so two entries sharing a gloss pose the same
 * question twice. "מתחת" is below, beneath, under and underneath, all four of them in unit 1;
 * 186 English glosses and 22 Hebrew ones serve more than one entry. A learner reported it as
 * "מלא מילים שחוזרות על עצמן", which is exactly how it looks from the other side of the screen.
 *
 * Nothing was ever scored against them · isCorrect falls through to glossAlts() and accepts any
 * word carrying the same gloss. The prompt was simply unanswerable as posed.
 *
 * The duplicate is FLIPPED, not dropped: `cards` arrives already capped, so dropping would
 * shorten the round the learner asked for. In w2m the prompt is the word itself, which is
 * unambiguous by construction, and the entry stays in the round.
 *
 * Only m2w cards claim a gloss. A w2m card poses its own word as the question, so letting it
 * reserve the gloss would flip an m2w card for a collision that does not exist. */
function oneCardPerGloss(cards){
  /* כרטיס תופס את *כל* הפירושים שלו, ומתהפך אם אחד מהם כבר נתפס.
     קודם הושווה הפירוש המלא, ולכן colossal="עצום" ו-vast="עצום, נרחב" נחשבו שונים
     ושני הפרומפטים הוצגו · למרות ש"עצום" הוא התשובה לשניהם. */
  const taken=new Set();
  for(const c of cards){
    if(c._dir!=='m2w') continue;
    const senses=glossSenses(c.meaning);
    if(!senses.length) continue;      // nothing but an example: not a key, and never shared
    if(senses.some(s=>taken.has(s))) c._dir='w2m';
    else senses.forEach(s=>taken.add(s));
  }
  return cards;
}
/* Every OTHER word that means the same thing as this card. */
function glossAlts(card){
  /* איחוד על פני כל הפירושים של הכרטיס, ולא רק על המחרוזת המלאה.
     זה הצד השני של אותו תיקון: אם הפרומפט "עצום" מוצג עבור vast, גם colossal היא
     תשובה נכונה · ובלי האיחוד היא נדחתה, כי מחרוזות הפירוש אינן זהות.
     הדחייה הזאת היא הפגיעה האמיתית: הלומד נתן מילה נרדפת נכונה וסומן כטועה. */
  const own=K(card && card.term);
  const out=new Set();
  for(const s of glossSenses(card && card.meaning)){
    const arr=GLOSS_ALT.get(s); if(!arr) continue;
    for(const t of arr) if(K(t)!==own) out.add(t);
  }
  return [...out];
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
//   יודע  = level>=1 (got it right first-try at least once, net) · stays only in "תרגל הכל"
// counter (level): +1 per correct-first-try, -1 per wrong; a clean first sight jumps to 3.
//   חדשות = counter 0 (never-seen, or got it wrong and not yet re-learned)
//   חלשות = counter 1-2 (knew it 1-2 times, on the way to mastery)
//   שלמדתי = counter >=3 (mastered / knew it on first sight)
const lvl = term => (stats.words[K(term)]||{}).level || 0;
const lastOf = term => (stats.words[K(term)]||{}).last || 0;
/* A word skipped after the level test is stored at level 3 so the practice queue leaves it
   alone · but it is not a word anyone learned here, and counting it under "שלמדתי" is the same
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
   the 30 come back · both ones he got right and ones he got wrong.
   The cause was that "new" was defined as `level < 1`, and `level` is a STRENGTH counter, not a
   record of having met the word. A word answered wrong is decremented and floors at 0; a word
   answered right but not on the first try is ALSO decremented. Both land back on 0, which the
   old rule read as "never seen".
   `seen` is the field that actually answers "have I met this word", so it is the one the button
   labelled "מילים שעוד לא תרגלתי" now uses. A practised word that is still weak belongs in
   לחיזוק · which is exactly what that button is for. */
const seenCount = term => { const r=stats.words[K(term)]; return r ? int0(r.seen) : 0; };
function newCards(scope){ return uniqScope(scope).filter(w=>seenCount(w.term)===0); }
function weakCards(scope){
  const arr=uniqScope(scope).filter(w=>seenCount(w.term)>0 && lvl(w.term)<3);
  arr.sort((a,b)=>lastOf(a.term)-lastOf(b.term));
  return arr;
}
/* ⭐ המילים שנרכשו דרך טעות · תור מעגלי, הפחות־שתורגלה־לאחרונה ראשונה.
   `t0` קובע **מי** ביחידה: t0 קיים ⇒ המילה נלמדה דרך טעות (ראה saneRec).
   `last` קובע **מתי** היא תופיע · אותו מיון בדיוק כמו weakCards למעלה.
   ⚠ אין כאן סינון level. מילה שנלמדה ואז נשלטה **נשארת** ברשימה, כי כל הרעיון הוא
   חזרה על מה שנרכש · "בשליטה" היום אינו "בשליטה בעוד חודש", וזו בדיוק השכחה
   שחגי תיאר. מי שרוצה רק את החלשות, זה כבר הכפתור "המילים שאתה עדיין מפספס".
   קריאה ישירה ל-stats.words ולא דרך rec(): rec יוצר רשומה ריקה לכל מילה שנבדקת,
   כלומר סלקטור היה מנפח את המאגר בכל רינדור. זה הדפוס של seenCount למעלה. */
const t0Of = term => { const r=stats.words[K(term)]; return r ? int0(r.t0) : 0; };
function acquiredCards(scope){
  const arr=uniqScope(scope).filter(w=>t0Of(w.term)>0 && !wasSkipped(w.term));
  /* ⭐ תור מעגלי · הפחות־שתורגלה־לאחרונה ראשונה.
     ⛔ המיון היה לפי `t0`, ו-`t0` הוא **רגע הלמידה ואינו זז לעולם**. כלומר הסדר היה
     קבוע: עם 198 מילים ביחידה וסבב של 20, אותן 20 הוותיקות חזרו בכל פעם, והמילה
     ה-21 לא הייתה מוצגת לעולם. יחידת חזרות שמראה תמיד את אותן מילים אינה חזרה.
     `last` הוא "תורגלה לאחרונה" ומתעדכן על כל כרטיס בסבב (commitSession), ולכן מילה
     שתורגלה שוקעת לתחתית התור וחוזרת רק אחרי שכל השאר עברו. זה המעגל.
     ⚠ ההגדרה נשארת `t0` · הוא קובע **מי** ביחידה. `last` קובע **מתי** היא תופיע. */
  arr.sort((a,b)=>lastOf(a.term)-lastOf(b.term));
  return arr;
}
/* `wasSkipped` guards were added to `classify` and `langSummary` today and NOT here, so the same
   screen showed the legend "שלמדתי 0" beside a button reading "מילים שלמדתי 1,725" · and that
   button drilled exactly the words the level test had promised would stop appearing.
   Skipped words come back through "ניהול מילים" ← "שחזר מחיקות", which is the honest route. */
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
/* U+05BE MAQAF · the Hebrew hyphen · sits inside the niqqud block, so the old single range
   DELETED it: norm("בֵּית־סֵפֶר") gave "ביתספר" while the same term with an ASCII hyphen gave
   "בית ספר". Two spellings of one word, two different keys. Excluded here and handled as the
   separator it is, exactly like "-" already was. No term in the bank uses it today, so no
   stored key moves · this closes the door before someone types it. */
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
   Nobody types that · they type כופר · while כפר, a different word entirely, was accepted.
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
    /* A holam male is already a vav · the mark sits ON it, so the letter comes BEFORE the mark.
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
   inside a word · סייס, מניין, קניין, עיניים, צרכנייה · and stripping niqqud leaves one yod,
   so a learner typing the ordinary modern spelling was marked wrong. 64 terms in the bank.
   Again the niqqud decides rather than a guess: a yod carrying a vowel or a dagesh is a
   consonant; a bare yod after a hiriq is a mater lectionis and is left alone.

   Deliberately permissive. The rule over-applies to a handful of conventional spellings
   (היה, עין), so those get accepted in both forms · and accepting one extra spelling costs
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
   בֵּרֵךְ is written מירט / בירך, so accepting that spelling looked right · but measured against
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
   132 Hebrew glosses name the very word they define · literally (תְּלוּלִית :: ערימה קטנה,
   תלולית), through an inflection (לַהַק :: ...להקה), or inside the example that makes the gloss
   worth reading (בְּאִיבּוֹ :: בראשית דרכו (נקטף באיבו)). Rewriting all of them would have
   thrown away the examples and etymologies, so the word is hidden at the moment it is used as
   a PROMPT instead · and the full text is shown again in the feedback, where it teaches.
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
     כפוף · the כ and the ש each read as a prefix and both reduce to פופ · which is not a
     giveaway at all, just two unrelated words with a shared tail. */
  /* Function words are never 'the answer'. Blanking אין inside אֵין יָדוֹ מַשֶּׂגֶת turned
     the prompt into its own opposite. */
  const FUNC=new Set(['אינ','אינו','בינ','ממנו','אלא','אשר','כמו','לפי','אתה','הוא','היא','זה','זאת','של','את','על','לא','כל','גמ','אמ','כי']);
  const hits = w => { const b=norm(w);
    if(FUNC.has(b)) return false;
    return tStems.has(b) || heStems(w).some(s=>tBase.has(s)); };
  /* A parenthetical is an EXAMPLE of the word in use. Blanking the word inside it leaves
     "(מכת ־־־ ־־־)" · noise, not a hint · so the whole aside is dropped from the prompt
     instead. It comes back in the feedback, where the example is the point. */
  const noAside=String(meaning).replace(/\s*\([^)]*\)/g, m => (m.match(/[֐-׿]+/g)||[]).some(hits) ? '' : m);
  const tidy = s => s.replace(/\s{2,}/g,' ').replace(/^[\s,;]+|[\s,;]+$/g,'');
  let out=tidy(noAside.replace(/[֐-׿]+/g, w => hits(w) ? '־־־' : w));
  /* An unanswerable prompt is worse than a hint. "אֲלוּמָּת אוֹר :: קרן אור" masks down to
     "קרן ־־־", which asks the learner to guess from three letters · so when blanking leaves
     too little to work with, the giveaway is accepted and the original gloss is shown.
     Dropping a circular example never triggers this: what remains is a clean definition. */
  /* Two guards, because letter-count alone was not enough. "נֶחָמָה פּוּרְתָּא :: נחמה כלשהי,
     נחמה מועטה" masked BOTH heads and left "־־־ כלשהי, ־־־ מועטה" · ten letters, comfortably
     over the threshold, and completely unanswerable. When two or more words are hidden and only
     a couple of content words survive, what is left is modifiers with nothing to modify. */
  const hidden=(out.match(/־־־/g)||[]).length;
  const rest=(out.replace(/־־־/g,' ').match(/[֐-׿]{2,}/g)||[]).length;
  if(out.includes('־־־') &&
     (out.replace(/־־־/g,'').replace(/[^֐-׿]/g,'').length < 6 || (hidden>=2 && rest<=2) || hidden>=3))
    out = tidy(noAside);
  return /[֐-׿]/.test(out) ? out : meaning;
}
/* ===== סובלנות איות · שכבת זמן הריצה =====
 *
 * הפרמטרים הופקו במעבדה הלא-מקוונת (`typo-lab/`) ולא נבחרו ביד: אלגוריתם גנטי על
 * 89,375 וריאציות מתויגות, 5-fold CV ו-holdout של 15% שלא נגע באבולוציה.
 *   ריצת ה-GA   typo-lab/evolve/v1 · 14.8.2026
 *   הדאטהסט     typo-lab/dataset/v3 · 89,375 שורות
 *               dataset-he.jsonl sha256 ff64ae144f8a1bcdbc58a2148ae2682387a15bebf69de651cfb4b63c35b83e81
 *               dataset-en.jsonl sha256 d91cffc0b38fcddb94a3cce8b6fb58784a7f3e1ab4975426443c5c99d51eba28
 *   הלקסיקון    typo-lab/runtime-lexicon/v2 · typo-lex.js · 69,324 בתים
 *               sha256 3b155bc66ba00c59fa0b4235fd587017d308df6c8cc1058e85dba9b61c00b951
 *               35,891 מילים · FPR נמדד 0.519% עברית / 0.554% אנגלית · אפס
 *               negative שגוי, נבדק ממצה על כל 35,891 ולא במדגם
 *   שער השילוח  he-word 0 קבלות-שווא · recall 18.10% (ריצה ראשית 17.44%)
 *               en-word 0 קבלות-שווא · recall 49.73%
 *               gloss   0 קבלות-שווא · recall 0% (רדום · ראה למטה)
 *   טביעת אצבע  fp מתחת · נבדקת מול הארטיפקט בכל ריצת בדיקות
 *
 * ✅ שער המאגר ירוק (15.8.2026). `typo-lab/bank_gate.js` על הפרמטרים האלה:
 * **אפס התנגשויות חדשות**, 5,663 ערכים, 4,241,769 זוגות מחושבים, EFF=3. הריצה
 * הראשונה נפלה שם על 138 התנגשויות ("caughtt" על bought, "110th" על
 * "1st - first"), כי האופטימיזציה ניקדה כל וריאציה מול הכרטיס שלה בלבד ולא מול
 * 5,662 האחרים. האילוץ החוצה-כרטיסים נכנס לתוך פונקציית הכושר, ומאז הוא מה
 * שמחזיק את המספר על אפס.
 *
 * ⛔ **צד הפירוש רדום · לא נמצאה לו נקודה בטוחה, ולא "בלתי אפשרי".** כל שתים-עשרה
 * רצועות הסף ב-gloss הן 0, ולכן שום מרחק אינו נכנס לסף ואף התנגשות חדשה אינה
 * נפתחת. הניסוח חשוב: זו תוצאת חיפוש ולא הוכחה. שתים-עשרה הפעלות עצמאיות
 * (אוכלוסייה 90, 160 דורות, זרעים טריים) התכנסו כולן לאותה נקודה · 11.61% holdout
 * עם 2 קבלות-שווא · ו**לא נמצאה** נקודה בצד הפירוש שהיא מעל 0% ועם אפס
 * קבלות-שווא. בתקציב היא קיימת (12.38% ב-1/10,000), באפס-תקציב לא נמצאה.
 * מה שהשער מצא, ומה שעדיין נכון: שתי התנגשויות ("רסיס עצ" על אֵגֶל, בבעלות שבב ·
 * "משא כבד" על יָצוּעַ, בבעלות עול), ושתיהן הגיעו דרך תוצרי ההרחבה של B1. תוצר
 * הרחבה אינו מקטע פירוש גולמי, ולכן הוא שקוף גם לשולי הדו-משמעות וגם לקבוצת
 * האילוץ החוצה-כרטיסים · שתי השכבות שאמורות לתפוס בדיוק את זה. זו גם דרך
 * ההחזרה: להזרים את צורות ההרחבה של B1 לתוך בנאי האילוץ החוצה-כרטיסים, לא
 * להרפות סף.
 * **זה אינו מכבה את מחלקה B1 עצמה** · היא פעילה, ירוקה, ופותרת את שני המקרים
 * שנבנתה בשבילם.
 *
 * ‏enabled הוא מתג הכיבוי: false מחזיר את התנהגות היום **בדיוק**, ותקלה בייצור
 * מטופלת בעריכת קבוע אחד ובהעלאת REV, בלי revert. tests/71 מוכיח זאת על מדגם.
 *
 * ‏fp הוא טביעת האצבע של הפרמטרים עצמם. ‏ver זהה בכל ריצה ולכן אינו מזהה, ובלי
 * טביעת אצבע אפשר לערוך משקל כאן ולשכוח את הארטיפקט (או להפך) בלי שאיש ידע.
 * ‏tests/71 מחשב אותה מחדש משני הצדדים ומסרב לרוץ על טבלת זהב שאינה תואמת.
 *
 * ‏dir אינו מגיע מה-GA · הוא מסמן לאיזה כיוון הסט שייך, כי שומר הנטיות רץ בכיוון
 * המונח בלבד (מקטע פירוש אינו נוטה).
 * ⚠ הערכים מועתקים מילה במילה מבלוק `params` שבארטיפקט, בארבע ספרות. זו הדיוק
 * שממנו הופקה טבלת הזהב, ולכן ההשוואה ב-tests/71 היא זהות ולא סובלנות. */
/* ⚖ הכרעת חגי · 15.8 · `W.sub` הועלה מ-1 ל-2 בשני סטי המילים.
   מה שהיא מתקנת: הקלדה עם אות **שרירותית** במקום הנכונה · `zngry` על angry ·
   התקבלה ב-43.2% ממילות המאגר האנגלי וב-7.5% מהעברי. זה נמצא רק כשסוכן ישב
   והקליד באתר עצמו, ולא באף שער.
   ⚠ למה שום שער לא תפס את זה: אילוץ אפס-הקבלות-שווא קונס קבלה של **מילת מאגר
   אחרת** (הווטו) ושל **מילה אמיתית של השפה** (הלקסיקון). ‏`zngry` אינו אף אחד
   משניהם · הוא אינו מילה כלל · ולכן שום שכבה לא עצרה אותו, והוא נזקף ללומד
   כידיעה. הפער היה בפונקציית המטרה, לא בכיול.
   המחיר, מדוד: אנגלית 71.71% → 70.38% ו-43.2% → 25.4%; עברית 23.53% → 22.93%
   ו-7.5% → 1.4%. **אפס קבלות-שווא בשתיהן**, ושער המאגר ירוק.
   הידוק אינו יכול לייצר התנגשות חדשה · הוא רק מסיר קבלות · והשער רץ בכל זאת,
   כי "מובטח מטיעון" הוא בדיוק מה שהפרויקט הזה לא סומך עליו. */
const TYPO_PARAMS = {
  enabled: true,
  ver: 'typo-lab/evolve/v1',
  fp: '6099a5c8',
  /* ‏השוליים המדורגים בעברית · 18.10% → 23.73% ב-holdout.
     ⚠ **המשטר הצר העברי אינו המשטר הצר האנגלי, וזה נמדד ולא הונח.** באנגלית שורדות
     כל העריכות המאריכות (transpose · ins · doubleLetter); בעברית שורדים **רק שניים**
     · `transpose` ו-`doubleLetter`. ‏`ins` נופל, ואיתו `materVI` (כתיב מלא/חסר,
     ‏77,444 זוגות · הטעות העברית הנפוצה ביותר) ו-`homophone` (ת/ט · כ/ק · א/ע).
     הניסוח הנכון צר יותר מהאנגלי: בפער צר מתקבלת רק טעות **מוטורית**, לא טעות
     **כתיב**. הסיבה מבנית · בעברית `vetoMargin` שנשלח היה 1, ולכן שורות gap=1
     מתקבלות כבר היום; הגן כאן **מפריד אוכלוסייה קיימת** במקום לפתוח קבוצה חסומה.
     ⚠ הרווח **אינו פארטו**: אורך 6 קופץ 0.34%→20.54%, אבל אורכים 4, 9 ו-10 יורדים.
     שער המאגר: ‏10,165,462 זוגות · אפס התנגשויות חדשות · חמשת זוגות הצירה נשארו
     דחויים. שיניים: ‏`typo-rules.HE-REDGRADED.json` → **38 התנגשויות** (`תוכוחה`
     על תּוּגָה, `בליבו` על בְּאִיבּוֹ).
     ⚠ **הסייג שנמדד ולא נבלע:** האפס של הנקודה הזאת נספר על כל השורות, ולכן הוא
     מבנה ולא הכללה. אימות צולב של הפרוצדורה: בלי הגן 13 קבלות-שווא מחוץ למדגם,
     איתו 14 · כלומר הגן קונה 4.95 נקודות recall במחיר קבלת-שווא אחת מחוץ למדגם,
     כולן מדלי `real-word` (מילה עברית אמיתית שאינה התשובה) ואף אחת חוצת-כרטיסים.
     החזרה היא עריכת קבוע אחד + `fp`. */
  'he-word': { dir:'word', minLen:0, vetoMargin:1, marginHard:1, marginSoft:3, useLexicon:true,
    bands:[{maxLen:1,t:0},{maxLen:2,t:0},{maxLen:3,t:0},{maxLen:4,t:0.3},{maxLen:5,t:0.9},{maxLen:6,t:0},{maxLen:7,t:0.9},{maxLen:8,t:0},{maxLen:9,t:1.4},{maxLen:10,t:0.9},{maxLen:11,t:1.1},{maxLen:12,t:0},{maxLen:13,t:0},{maxLen:14,t:1},{maxLen:15,t:1.9},{maxLen:16,t:1},{maxLen:17,t:1},{maxLen:18,t:1.8},{maxLen:null,t:1}],
    bandsTight:[{maxLen:1,t:0},{maxLen:2,t:0},{maxLen:3,t:1.4},{maxLen:4,t:1.4},{maxLen:5,t:1.7},{maxLen:6,t:1.7},{maxLen:7,t:1.7},{maxLen:8,t:1.7},{maxLen:9,t:1.7},{maxLen:10,t:1.7},{maxLen:11,t:1.7},{maxLen:12,t:0},{maxLen:13,t:0},{maxLen:14,t:0},{maxLen:15,t:0},{maxLen:16,t:0},{maxLen:17,t:0},{maxLen:18,t:0},{maxLen:null,t:0}],
    W:{sub:2,adjSub:2,transpose:2.7953,ins:1.8144,del:0.6004,doubleLetter:0.2105,materVI:1.7155,homophone:1.1389},
    WTight:{sub:99,adjSub:99,transpose:1.695,ins:99,del:99,doubleLetter:1.333,materVI:99,homophone:99} },
  /* ‏השוליים המדורגים · הגן היחיד שפתח את האנגלית הקצרה.
     מה שהיה חסום: ‏`vetoMargin:2` דחה כל הקלדה שהמרחק שלה ממילת מאגר זרה גדול
     ממרחקה מהמילה שלה בפחות מ-2 · **לפני** שמישהו הסתכל על סף מרחק בכלל. באנגלית
     ‏96%-98% משורות ה-accept באורך 3-4 נמצאות בדיוק ב-gap 1, ולכן כמעט כל הקצר מת
     שם. פתיחת הספים לא הזיזה את זה (‏+0 באורך 3): השכבה שחוסמת רצה לפניהם.
     מה שהוחלף: ‏`marginHard` (‏1 · מתחתיו נדחה תמיד, זו הכרעת חגי ואין עליה גן)
     ו-`marginSoft` (‏2). ‏gap שיושב בין השניים נכנס ל**משטר צר** · אותו סדר שכבות
     בדיוק, עם `bandsTight` ו-`WTight` משלו. זהו **הידוק ולא הרפיה**: המשטר הצר
     מתמחר sub/adjSub/del/materVI/homophone ב-99 ומתיר בפועל רק עריכות **מאריכות**
     (‏transpose · ins · doubleLetter). המכניקה: ב-gap 1 הכנסה או הכפלת אות כמעט
     אף פעם לא נוחתות על מילת מאגר אחרת, בעוד שהחלפה ומחיקה כן · fought/bought,
     speak/speck, tenth/tent. זה ההבדל בין "שכחתי אות" לבין "התכוונתי לשנייה".
     ‏holdout 49.73% → 69.09%, וכיסוי המאגר 2,795 → 3,621 מתוך 3,946. מ-6 אותיות
     ומעלה · 100%. אורך 5 נשאר הרצועה החלשה (44.7%) וזו התוצאה הכנה.
     ⚠ אנגלית בלבד. על עברית אותו גן עולה קבלת-שווא אחת ולכן אינו נשלח שם.
     שער המאגר על הנקודה הזאת: ‏10,165,462 זוגות · אפס התנגשויות חדשות. השיניים
     הודגמו על `typo-rules.REDGRADED.json` · אותו גנום עם משטר צר פרוץ · 102
     התנגשויות חדשות (fougght→bought, knew→new, teenth→teeth). */
  'en-word': { dir:'word', minLen:0, vetoMargin:1, marginHard:1, marginSoft:2, useLexicon:true,
    aFirst:0, aShare:3, aFirstTight:0.2, aShareTight:1.5,
    bands:[{maxLen:1,t:0},{maxLen:2,t:0},{maxLen:3,t:1.05},{maxLen:4,t:2.1},{maxLen:5,t:1.95},{maxLen:6,t:1.9},{maxLen:7,t:1.85},{maxLen:8,t:3.35},{maxLen:9,t:3.25},{maxLen:10,t:1.45},{maxLen:11,t:3.15},{maxLen:12,t:1.65},{maxLen:13,t:1.65},{maxLen:14,t:1.6},{maxLen:15,t:1},{maxLen:16,t:1.55},{maxLen:17,t:1.55},{maxLen:18,t:0},{maxLen:19,t:0},{maxLen:20,t:0},{maxLen:null,t:1.5}],
    bandsTight:[{maxLen:1,t:0},{maxLen:2,t:0},{maxLen:3,t:1.75},{maxLen:4,t:0.85},{maxLen:5,t:0.7},{maxLen:6,t:1.25},{maxLen:7,t:1.15},{maxLen:8,t:1.65},{maxLen:9,t:1.65},{maxLen:10,t:1.4},{maxLen:11,t:1.4},{maxLen:12,t:1.4},{maxLen:13,t:2.4},{maxLen:14,t:0.95},{maxLen:15,t:0},{maxLen:16,t:0},{maxLen:17,t:0},{maxLen:18,t:0},{maxLen:19,t:0},{maxLen:20,t:0},{maxLen:null,t:0}],
    W:{sub:1.8,adjSub:1.35,transpose:1,ins:1.1296,del:0.3,doubleLetter:0.3,materVI:0.3821,homophone:1.7916},
    WTight:{sub:2.4,adjSub:99,transpose:0.1,ins:0.8,del:1.8,doubleLetter:0.45,materVI:99,homophone:99} },
  /* ‏gloss אינו מגיע מריצת ה-GA · ראה glossProvenance בארטיפקט. האפס שהיה כאן לא
     היה תוצאה אלא **כשל חיפוש**: שורת שכבה-1 יחידה ("כל" מתקבל על הפירוש "כלל",
     via=exact, מתקבלת היום בלי קשר לשום פרמטר) נפלה בסט האימון של חמש מתוך שש
     הרצות ה-GA. היא מעניקה לכל גנום את אותו עונש מוות ‎-1e6‎, נוף הכושר משתטח,
     ‏sinceImprove מטפס עד patience ו-ההרצה נעצרת בדור 23 · הגנום המוחזר הוא מנצח
     דור 0, כלומר גנום הזריעה של אפס-סובלנות. הלוג מראה את זה במפורש:
     ‏gloss/fold1 (היחיד שהשורה נפלה אצלו בוולידציה) רץ 130 דורות והגיע ל-bestEver
     חיובי; כל השאר נעצרו בדור 23 על ‎-1000000‎ בדיוק, כלומר fa=1 ולעולם לא 2.
     ‏11.61% ב-holdout, אפס קבלות-שווא שהגנום גורם. הספים ממוזערים לקורת המינימום
     ששומרת על סט ההחלטות ביט-אחר-ביט · אין כאן רצועה שיושבת בתקרה "כי אף שורה לא
     מגבילה אותה", וזו הייתה גרסה קודמת שנפסלה.
     ⚠ הגרסה ההיא **נכשלה בשער המאגר** עם שתי התנגשויות · "רסיס עצ" על אֵגֶל
     (שייך ל-שבב) ו-"משא כבד" על יָצוּעַ (שייך ל-עול). שתיהן תוצרי ההרחבה של חוק
     B1, שאינם מקטעי פירוש גולמיים ולכן היו שקופים גם למרווח הדו-משמעות וגם לקבוצה
     חוצת-הכרטיסים. התיקון היה להזרים את expandOf(B1-union) לתוך האילוץ · לא להרפות
     ולא להדק סף ביד · ורצועת maxLen 4 ירדה מ-2.2 ל-0.4, שזה בדיוק מה שמוציא את
     dist 0.6 של שלוש המחיקות. ‏holdout לא זז בכלל. */
  gloss: { dir:'gloss', minLen:6, vetoMargin:2, useLexicon:true,
    bands:[{maxLen:1,t:0},{maxLen:2,t:0},{maxLen:3,t:1.8},{maxLen:4,t:0.4},{maxLen:5,t:0},{maxLen:6,t:0},{maxLen:7,t:0.4},{maxLen:8,t:0.4},{maxLen:9,t:0},{maxLen:10,t:0.5},{maxLen:11,t:1.8},{maxLen:12,t:0.5},{maxLen:13,t:0.5},{maxLen:14,t:1.9},{maxLen:15,t:1.8},{maxLen:16,t:1.1},{maxLen:17,t:2},{maxLen:18,t:2},{maxLen:19,t:2},{maxLen:20,t:0.6},{maxLen:null,t:0}],
    W:{sub:1,adjSub:1.9,transpose:1.9,ins:2,del:0.2,doubleLetter:0.2,materVI:0.6,homophone:0.5} },
};
/* שכנות מקלדת והומופונים · אלה בדיוק הטבלאות שהמעבדה מדדה עליהן (typo-lab/lib/wdist.js,
   taxonomy-he/en). ההומופונים נגזרו שם מהאופרטור עצמו ולא הועתקו, וכאן הם מודבקים
   כתוצאה: מקור אמת אחד במעבדה, ארטיפקט אחד בריצה, וטבלת הזהב מוכיחה שהם לא נפרדו. */
const TYPO_ADJ_HE = {"ק":"גדר","ר":"אגכק","א":"טכער","ט":"אויע","ו":"חטינ","נ":"הוחילמע","מ":"חיכלנפצ","פ":"כמצ","ש":"דז","ד":"גזסקש","ג":"בדכסקר","כ":"אבגהלמעפצרת","ע":"אהטיכנ","י":"וחטמנע","ח":"וילמנצ","ל":"חכמנצת","ז":"דסש","ס":"בגדז","ב":"גהכס","ה":"בכנע","צ":"חכלמפת","ת":"כלצ"};
const TYPO_ADJ_EN = {"q":"aw","w":"aeqs","e":"drsw","r":"deft","t":"fgry","y":"ghtu","u":"hijy","i":"jkou","o":"iklp","p":"lo","a":"qswz","s":"adewxz","d":"cefrsx","f":"cdgrtv","g":"bfhtvy","h":"bgjnuy","j":"hikmnu","k":"ijlmo","l":"kop","z":"asx","x":"cdsz","c":"dfvx","v":"bcfg","b":"ghnv","n":"bhjm","m":"jkn"};
const TYPO_HOMO = {"א":"עה","ע":"א","ה":"א","ב":"ו","ו":"ב","ח":"כ","כ":"חק","ט":"ת","ת":"ט","ק":"כ","ס":"ש","ש":"ס"};
const TYPO_OPS = ['sub','adjSub','transpose','ins','del','doubleLetter','materVI','homophone'];
/* תקרת הפעולות · קבוע קשיח ולא גן. בלעדיה ה-GA מצא את הפרצה תוך דורות ספורים: הוריד
   את מחיר ההכנסה והמחיקה ל-0.2, והמסלול הזול הפך ל"למחוק הכול ולכתוב מחדש" ·
   "kqvv" התקבל כטעות הקלדה של "late". שלוש עריכות גולמיות, לא ארבע.
   MAX_CANDS · לכל היותר שמונת המועמדים הקרובים בסדר קבוע, כדי שהמעבדה והריצה יבחנו
   את אותה קבוצה בדיוק ולא קבוצה שתלויה בסדר של Set. */
const TYPO_MAX_OPS = 3, TYPO_MAX_CANDS = 8;
/* רדיוס אינדקס השכנים, והאורך שמעליו הוא מצטמצם לעומק 1 · זהים ל-gen_dataset.js,
   שם נמדדה הדו-משמעות שהפרמטרים כוילו מולה. */
const TYPO_RADIUS = 2, TYPO_LONG = 45, TYPO_LEX_MIN = 2;
const TYPO_HE_RANGE = /[֐-׿]/;

/* הלקסיקון · typo-lex.js. חסר (אופליין, חסימה, טעינה שנכשלה) = השכבה כולה כבויה,
   וזה הכיוון הבטוח: נמדד שבלי הלקסיקון אותם פרמטרים פותחים 1/15/6 קבלות-שווא. */
function typoLex(){ return (typeof window!=='undefined' && window.TYPO_LEX) || null; }
/* אסימון הוא "מילה אמיתית" אם המסנן מכיר אותו **או** שהוא צורה קבילה במאגר, בשני
   הכיוונים. שני הפערים שהמדידה תפסה, ושניהם היו קבלות-שווא: "on particular" מול
   "in particular" ("on" הוא מפתח מונח ולכן הוחסר מהמסנן, אבל המחרוזת השלמה אינה
   מונח ולכן וטו המאגר לא נורה · פער אסימון-מול-מחרוזת) · "מעניינ" מול "מיניינ"
   ("מעניינ" הוא מקטע פירוש, והווטו בכיוון המונח בודק מונחים בלבד · פער
   חוצה-כיוונים). התיקון הוא הפרדיקט, לא הנכס. */
function lexHit(token, lang){
  if(!token || token.length < TYPO_LEX_MIN) return false;
  const L=typoLex();
  if(L && L.lookup(token, lang==='en'?'en':'he')) return true;
  return TERM_VETO.has(token) || SEG_VETO.has(token);
}
function typoTokens(cands){
  const s=new Set();
  for(const c of cands) for(const p of String(c).split(' ')) if(p) s.add(p);
  return s;
}
/* כשמספר המילים זהה נבדקות רק המילים שהשתנו, אחרת כולן · זהה בדיוק לבנאי הלקסיקון
   במעבדה (0 פערים על 89,375 שורות). אסימון של הכרטיס עצמו אינו מילה זרה. */
function typoLexWhole(typedKey, srcKey, lang, ownTok){
  if(!typedKey) return false;
  const parts=String(typedKey).split(' ').filter(Boolean);
  if(!parts.length) return false;
  let check=parts;
  if(srcKey!=null){
    const src=String(srcKey).split(' ').filter(Boolean);
    if(src.length===parts.length){
      check=parts.filter((p,i)=>p!==src[i]);
      if(!check.length) return false;
    }
  }
  for(const p of check){
    if(ownTok && ownTok.has(p)) return false;
    if(!lexHit(p, lang)) return false;
  }
  return true;
}
/* **any** על פני המועמדים ולא all, ובכוונה: הריצה אינה יודעת מאיזו צורה הלומד יצא,
   ולכן היא שואלת "האם קיימת צורה קבילה שביחס אליה זו מילה אמיתית אחרת". השורה
   הראשונה היא החוק שאין עליו ויכוח · צורה קבילה של הכרטיס אינה נדחית לעולם. */
function typoLexBlocked(typedKey, cands, lang, ownTok){
  for(const c of cands) if(c===typedKey) return false;
  for(const c of cands) if(typoLexWhole(typedKey, c, lang, ownTok)) return true;
  return false;
}
function typoTables(a,b){
  return (TYPO_HE_RANGE.test(a)||TYPO_HE_RANGE.test(b))
    ? {adj:TYPO_ADJ_HE, homo:TYPO_HOMO, mater:true}
    : {adj:TYPO_ADJ_EN, homo:null, mater:false};
}
function typoSubKind(ca,cb,T){
  if(T.homo && (T.homo[ca]||'').indexOf(cb)>=0) return 'homophone';
  if((T.adj[ca]||'').indexOf(cb)>=0) return 'adjSub';
  return 'sub';
}
/* ו/י כפולה בעברית היא תופעת כתיב מלא ולא אצבע שנתקעה, וזה ההסבר הנכון לה. */
function typoInsKind(b,j,T){
  const c=b[j-1];
  if(T.mater && (c==='ו'||c==='י')) return 'materVI';
  if((j>=2 && b[j-2]===c) || (j<b.length && b[j]===c)) return 'doubleLetter';
  return 'ins';
}
function typoDelKind(a,i,T){
  const c=a[i-1];
  if(T.mater && (c==='ו'||c==='י')) return 'materVI';
  if((i>=2 && a[i-2]===c) || (i<a.length && a[i]===c)) return 'doubleLetter';
  return 'del';
}
/* כל וקטורי ספירת-הפעולות של יישורים בעד maxOps פעולות, מנוקים מווקטורים נשלטים.
   חישוב שמתמחר יישור אחד קבוע מראש הוא חסם עליון בלבד, ולכן הוא יכול להראות "אפס
   קבלות-שווא" בזמן שהמסלול המדויק מקבל · זה נמדד ("uuuf" מול "unit"). */
/* ‏המניין · שיקוף מדויק של typo-lab/features.js:alignments, והסדר אינו רשות.
   כל יישור נושא איתו את **המיקום המוקדם ביותר** שבו נפלה פעולה (אינדקס במחרוזת
   המוקלדת), כי זו המחרוזת שהלומד הקליד ועליה נשאלת השאלה "היכן טעית".
   הסדר: איחוד לפי מפתח-ספירה עם שמירת ה-pos המוקדם, **ואז** ניקוי שליטה על הספירה
   בלבד. הפוך היה נותן את אותה קבוצת ווקטורים אבל pos אחר, ואז המעבדה והריצה היו
   מתמחרות אותו יישור בשני מחירים.
   ⚠ pos מוגדר **לא-מנייתי** בכוונה: הצורה המנייתית של הווקטור היא החוזה שלו (שמונה
   מפתחות אופרטור), ושלושת הקוראים החיצוניים (tests/71, he_miss_anatomy, he_sanity)
   קוראים רק v[k]. מפתח מנייתי חדש היה משנה JSON.stringify אצל אחד מהם. */
function typoVectors(a,b,maxOps){
  const A=String(a==null?'':a), B=String(b==null?'':b);
  const m=A.length, n=B.length, cap=maxOps==null?TYPO_MAX_OPS:maxOps;
  const T=typoTables(A,B);
  const found=[];
  const zero=()=>{ const v={}; for(const k of TYPO_OPS) v[k]=0; return v; };
  const walk=(i,j,budget,vec,firstPos)=>{
    while(i<m && j<n && A[i]===B[j]){ i++; j++; }
    if(i===m && j===n){ found.push({v:Object.assign({},vec), pos:firstPos}); return; }
    if(budget<=0) return;
    if(Math.abs((m-i)-(n-j))>budget) return;
    const fp = firstPos<0 ? i : firstPos;
    const spend=(kind,ni,nj)=>{ vec[kind]++; walk(ni,nj,budget-1,vec,fp); vec[kind]--; };
    if(i+1<m && j+1<n && A[i]===B[j+1] && A[i+1]===B[j]) spend('transpose',i+2,j+2);
    if(i<m && j<n) spend(typoSubKind(A[i],B[j],T),i+1,j+1);
    if(i<m) spend(typoDelKind(A,i+1,T),i+1,j);
    if(j<n) spend(typoInsKind(B,j+1,T),i,j+1);
  };
  walk(0,0,cap,zero(),-1);
  const byKey=new Map();
  for(const f of found){
    const key=TYPO_OPS.map(k=>f.v[k]).join(',');
    const hit=byKey.get(key);
    if(!hit) byKey.set(key,f);
    else if(f.pos>=0 && (hit.pos<0 || f.pos<hit.pos)) hit.pos=f.pos;
  }
  const uniq=Array.from(byKey.values());
  const out=[];
  for(const f of uniq){
    let dominated=false;
    for(const g of uniq){
      if(g===f) continue;
      let le=true, lt=false;
      for(const k of TYPO_OPS){ if(g.v[k]>f.v[k]){ le=false; break; } if(g.v[k]<f.v[k]) lt=true; }
      if(le&&lt){ dominated=true; break; }
    }
    if(dominated) continue;
    Object.defineProperty(f.v,'pos',{value:f.pos, enumerable:false, writable:false, configurable:true});
    out.push(f.v);
  }
  return out;
}
/* יחס התווים המשותפים · שיקוף מדויק של typo-lab/features.js:shareRatio.
   מפת ריבוי, מכנה הוא האורך הגדול מהשניים, ואפס כשהמכנה אפס. */
function typoShare(a,b){
  const m=new Map();
  for(const c of a) m.set(c,(m.get(c)||0)+1);
  let shared=0;
  for(const c of b){ const v=m.get(c); if(v>0){ shared++; m.set(c,v-1); } }
  const d=Math.max(a.length,b.length);
  return d ? shared/d : 0;
}
/* ‏aFirst/aShare בסוף ועם ברירת מחדל 0, כדי שקורא קיים לא ישתנה. כששניהם 0 זהו
   **בדיוק** הלולאה שרצה כאן קודם · לא "שקולה לה" · ולכן הוספתם אינה יכולה להזיז
   החלטה קיימת. שיקוף של typo-lab/lib/checker.js:featureCost.
   ⚠ סדר הסכימה חייב להישאר זהה לשם: off, ואז קנס האות הראשונה, ואז צבירה על
   TYPO_OPS. חיבור בסדר אחר נבדל ב-ULP, וזה מספיק כדי לפצל החלטה שיושבת בדיוק על
   הסף · נמדד בפועל על "differejce"~"difference" (עלות 0.4 מול סף 0.4). */
function typoWDist(a,b,W,cap,maxOps,aFirst,aShare){
  const C=(cap==null||!isFinite(cap))?Infinity:cap;
  const aF=aFirst||0, aS=aShare||0;
  let best=Infinity;
  if(!(aF>0) && !(aS>0)){
    for(const v of typoVectors(a,b,maxOps)){
      let s=0; for(const k of TYPO_OPS) s+=v[k]*W[k];
      if(s<best) best=s;
    }
    return best<=C?best:Infinity;
  }
  const off = aS>0 ? aS*(1-typoShare(String(a),String(b))) : 0;
  for(const v of typoVectors(a,b,maxOps)){
    let s=off+(v.pos===0?aF:0);
    for(const k of TYPO_OPS) s+=v[k]*W[k];
    if(s<best) best=s;
  }
  return best<=C?best:Infinity;
}
/* ברירות מחדל שמרניות · סט חסר-שדה אינו נופל לסובלנות רחבה בשקט. */
const TYPO_PN = new WeakMap();
function typoNorm(P){
  let n=TYPO_PN.get(P);
  if(n) return n;
  const p=P||{};
  const UNIT={sub:1,adjSub:1,transpose:2,ins:1,del:1,doubleLetter:1,materVI:1,homophone:1};
  const nb=bs=>bs.map(b=>({maxLen:b.maxLen==null?Infinity:b.maxLen, t:b.t==null?0:b.t}))
    .sort((x,y)=>x.maxLen-y.maxLen);
  const W=Object.assign({}, UNIT, p.W||{});
  const bands=nb((Array.isArray(p.bands)&&p.bands.length)?p.bands.slice():[{maxLen:Infinity,t:0}]);
  const vetoMargin=p.vetoMargin==null?1:p.vetoMargin;
  /* השוליים המדורגים · הירושה היא בכיוון אחד בלבד, ולכן פרמטרים ישנים אינם יכולים
     לקבל משטר צר בטעות: בלי marginSoft הוא שווה ל-marginHard, והתנאי שמדליק את
     המשטר (soft > hard) כבוי מבנית. זהה מילה-במילה ל-typo-lab/lib/checker.js. */
  const marginHard=p.marginHard==null?vetoMargin:p.marginHard;
  const marginSoft=p.marginSoft==null?marginHard:p.marginSoft;
  if(marginSoft<marginHard) throw new Error('typoNorm: marginSoft ('+marginSoft+') is below marginHard ('+marginHard+') · negative window');
  const bandsTight=(Array.isArray(p.bandsTight)&&p.bandsTight.length)?nb(p.bandsTight.slice()):bands;
  const WTight=p.WTight?Object.assign({}, UNIT, p.WTight):W;
  /* מקדמי התכונה · ברירת מחדל 0 = ההתנהגות של אתמול, ביט-אחר-ביט. הצר יורש מהרגיל
     כשהוא חסר · אותו כיוון-ירושה חד-כיווני של bandsTight/WTight, ולכן גנום ישן מקבל
     בדיוק את מה שהיה לו. זהה מילה-במילה ל-typo-lab/lib/checker.js:normalizeParams.
     ⛔ מקדם שלילי הופך את חסם העלות ללא-תקף (וגם את effOps ב-bank_gate, שממנו נגזר
     עומק אינדקס-המחיקות) · זריקה, לא השלמה שקטה. */
  const num=(v,d)=>v==null?d:v;
  const aFirst=num(p.aFirst,0), aShare=num(p.aShare,0);
  const aFirstTight=num(p.aFirstTight,aFirst), aShareTight=num(p.aShareTight,aShare);
  for(const [k,v] of [['aFirst',aFirst],['aShare',aShare],['aFirstTight',aFirstTight],['aShareTight',aShareTight]]){
    if(!(v>=0)) throw new Error('typoNorm: '+k+' = '+v+' · מקדם שלילי הופך את חסם העלות ללא-תקף');
  }
  n={ dir:p.dir==='gloss'?'gloss':'word', minLen:p.minLen==null?0:p.minLen,
      vetoMargin, marginHard, marginSoft,
      useLexicon:p.useLexicon!==false, bands, W, bandsTight, WTight,
      aFirst, aShare, aFirstTight, aShareTight,
      graded:marginSoft>marginHard };
  TYPO_PN.set(P,n);
  return n;
}
const typoLetters = s => String(s==null?'':s).replace(/ /g,'').length;
/* סיומות שומר הנטיות. הרשימה זהה לזו שהמעבדה ייצרה ממנה את שורות הנטייה, ו-
   isCorrect('כפרים','כֹּפֶר') חייב להישאר false · זה מקובע ב-tests/05.
   למה זה לא יכול להיות משקל: המשקלים אינם יודעים **היכן** נפלה הפעולה, והוספת ה"א
   בסוף מילה ובאמצעה הן אותה פעולה בדיוק בווקטור הספירה · הראשונה נטייה, השנייה
   טעות אמיתית שאנחנו רוצים לקבל. הכיוון אדיטיבי בלבד: מוקלד = מועמד ועוד סיומת. */
function typoSuffixes(lang){ return lang==='en' ? ['s','es','ed','ing','ly'] : ['ימ','ות','ה','י','יות']; }
function typoInflection(typedKey, cands, lang){
  /* השם `sufs` ולא `SUF` · app.js כבר מצהיר SUF ברמה העליונה, וארגז החול מחלץ
     הצהרות לפי שם. שם כפול הופך את החילוץ לדו-משמעי ומפיל בדיקה אחרת לגמרי. */
  const sufs=typoSuffixes(lang);
  for(const c of cands){
    if(typedKey.length<=c.length || !typedKey.startsWith(c)) continue;
    if(sufs.indexOf(typedKey.slice(c.length))>=0) return true;
  }
  return false;
}
/* אינדקס השכנים · שתי מחרוזות במרחק ≤d חולקות מחרוזת בסביבת-המחיקות בעומק d, ולכן
   מאנדקסים את כל תוצאות המחיקה של כל מפתח ושואלים באותה סביבה. נבנה בעצלתיים
   בהחלטה הפאזית הראשונה ולא בבניית המאגר: מי שאינו טועה אינו משלם עליו.
   נמדד על המאגר העברי: ‏59ms לאינדקס המונחים, ‏472ms לאינדקס המקטעים, פעם אחת
   לכל בניית מאגר. ההחלטה עצמה 0.2-0.4ms. אם הבנייה תורגש כשמחלקה A תידלק, המקום
   לטפל בו הוא כאן (בנייה בזמן סרק) ולא בהחלטה. */
const TYPO_IX = new WeakMap();
function typoDeletions(s,d){
  const all=new Set([s]);
  let cur=[s];
  for(let step=0; step<d; step++){
    const nxt=[];
    for(const x of cur) for(let i=0;i<x.length;i++){
      const y=x.slice(0,i)+x.slice(i+1);
      if(!all.has(y)){ all.add(y); nxt.push(y); }
    }
    cur=nxt;
  }
  return all;
}
function typoIndex(vetoMap){
  let ix=TYPO_IX.get(vetoMap);
  if(ix) return ix;
  const keys=Array.from(vetoMap.keys());
  const del=new Map();
  for(let i=0;i<keys.length;i++)
    for(const v of typoDeletions(keys[i], keys[i].length>TYPO_LONG?1:TYPO_RADIUS)){
      let a=del.get(v); if(!a){ a=[]; del.set(v,a); }
      a.push(i);
    }
  ix={keys, del};
  TYPO_IX.set(vetoMap, ix);
  return ix;
}
/* המרחק למפתח הקרוב ביותר במאגר ששייך לערך אחר. אינסוף = אין כזה ברדיוס שהאינדקס
   מכסה, וזה מספיק: השאלה היחידה שנשאלת עליו היא ההשוואה מול dOwn שכבר קטן מ-3.
   המרחק כאן הוא editDist ולא המרחק הממושקל, ובכוונה: "האם הקלדת משהו ששייך למילה
   אחרת" אינו תלוי בכמה נוח היה להקליד אותו. */
function typoNearestOther(typed, vetoMap, allowOwners){
  const ix=typoIndex(vetoMap);
  const seen=new Set();
  let best=Infinity;
  for(const v of typoDeletions(typed, typed.length>TYPO_LONG?1:TYPO_RADIUS)){
    const a=ix.del.get(v);
    if(!a) continue;
    for(const i of a){
      if(seen.has(i)) continue;
      seen.add(i);
      const k=ix.keys[i];
      let other=false;
      for(const o of vetoMap.get(k)) if(!allowOwners.has(o)){ other=true; break; }
      if(!other) continue;
      const d=editDist(k, typed);
      if(d<best) best=d;
      if(best===0) return 0;
    }
  }
  return best;
}
/* ===== הפונקציה הטהורה שהמעבדה כיילה =====
 * סדר השכבות, וכל אחת נושאת במשקל:
 *   1. וטו מבני · המחרוזת היא מילת מאגר של ערך אחר. הכרעת חגי, בלי סף ובלי גן,
 *      ולפני כל חישוב מרחק כדי שאף צירוף משקלים לא יוכל לעקוף אותה.
 *   2. וטו הלקסיקון · המחרוזת היא מילה אמיתית של השפה שאינה צורה של הכרטיס.
 *      בלי השכבה הזאת 1,164 מתוך 1,167 שורות "מילה אמיתית" התקבלו ו-recall העברית
 *      נחנקה ל-2.49% · היא מה שהופך את הפרמטרים לחוקיים (+6.85/+30.66/+5.32 נקודות,
 *      נמדד בריצה נגדית).
 *   3. שער אורך · מתחת ל-minLen אין סובלנות בכלל.
 *   4. שומר הנטיות · הפרש שהוא סיומת טהורה הוא נטייה, לא טעות הקלדה.
 *   5. מרחק ממושקל מול סף רצועת האורך.
 *   6. שולי הדו-משמעות · קבלה שרחוקה ממילה אחרת בדיוק כמו משלך היא הימור בין שני
 *      ערכים. אחרי המרחק ולא לפניו: ההכרעה זהה בשני הסדרים, אבל הודעת ההתנגשות
 *      צריכה להופיע רק כשבאמת עמדנו לקבל.
 *
 * vetoSet הוא TERM_VETO או SEG_VETO (מפתח -> בעלים) · ownSet הוא קבוצת הבעלים
 * שאינם "ערך אחר": הכרטיס עצמו, ובכיוון הפירוש גם מי שחולק איתו פירוש.
 * candidates מנורמלים כבר, וסדרם אינו משפיע (כל השכבות הן מינימום או "קיים").
 * הפונקציה טהורה: אותה כניסה, אותה יציאה, בלי מצב ובלי תופעות לוואי. */
function nearMatch(a, candidates, lang, P, vetoSet, ownSet){
  const off={ok:false, why:null, dist:null};
  if(!TYPO_PARAMS.enabled || !a || !P) return off;
  const p=typoNorm(P);
  if(p.useLexicon && !typoLex()) return off;          // אין לקסיקון = אין סובלנות
  const cands=candidates||[];
  const owners=vetoSet && vetoSet.get(a);
  if(owners && owners.size && cands.indexOf(a)<0){
    for(const o of owners) if(!ownSet || !ownSet.has(o)) return {ok:false, why:'collision', dist:null};
  }
  const L = lang==='en' ? 'en' : 'he';
  if(p.useLexicon && typoLexBlocked(a, cands, L, typoTokens(cands))) return {ok:false, why:'real-word', dist:null};
  if(typoLetters(a) < p.minLen) return {ok:false, why:'short', dist:null};
  if(!cands.length) return {ok:false, why:'far', dist:null};
  if(p.dir==='word' && typoInflection(a, cands, L)) return {ok:false, why:'inflection', dist:null};
  const scored=[];
  let dOwn=Infinity;
  for(const c of cands){
    const raw=editDist(a,c);
    if(raw<dOwn) dOwn=raw;
    if(raw<=TYPO_MAX_OPS) scored.push({c, raw, len:typoLetters(c)});
  }
  if(!scored.length) return {ok:false, why:'far', dist:null};
  scored.sort((x,y)=>x.raw-y.raw || x.len-y.len || (x.c<y.c?-1:x.c>y.c?1:0));
  /* הפער נחשב **לפני** לולאת המרחק, כי הוא זה שבוחר את המשטר; הפסילה הקשה עצמה
     נשארת אחרי הלולאה כדי שהודעת ההתנגשות תופיע רק כשבאמת עמדנו לקבל.
     מחרוזת שרחוקה מהכול צריכה להיפסל על מרחק, לא על "הקלדת מילה אחרת". */
  let hardReject=false, tight=false;
  if((p.marginHard>0 || p.graded) && vetoSet){
    const gap=typoNearestOther(a, vetoSet, ownSet||new Set()) - dOwn;
    if(p.marginHard>0 && gap<p.marginHard) hardReject=true;
    tight = p.graded && gap<p.marginSoft;
  }
  const tBands = tight ? p.bandsTight : p.bands;
  const tW = tight ? p.WTight : p.W;
  /* מקדמי התכונה לפי המשטר · בדיוק כמו ב-makeChecker. */
  const aF = tight ? p.aFirstTight : p.aFirst;
  const aS = tight ? p.aShareTight : p.aShare;
  let best=Infinity;
  for(const s of scored.slice(0,TYPO_MAX_CANDS)){
    let t=tBands[tBands.length-1].t;
    for(const b of tBands) if(s.len<=b.maxLen){ t=b.t; break; }
    if(!(t>0)) continue;                               // אפס סובלנות ברצועה הזו
    const d=typoWDist(a, s.c, tW, t, TYPO_MAX_OPS, aF, aS);
    if(d<best) best=d;
    if(best===0) break;
  }
  if(!isFinite(best)) return {ok:false, why:'far', dist:null};
  if(hardReject) return {ok:false, why:'collision', dist:null};
  return {ok:true, why:null, dist:best};
}
/* כל המפתחות שהערך מקבל היום · אותן ארבע שכבות של isCorrect למטה, באותו סדר.
   הן חייבות להישאר זהות: מפתח שנספר כאן ואינו מתקבל שם היה מסתיר פסילה אמיתית. */
function typoKeysOf(term){
  if(term==null) return [];
  const out=new Set();
  const add=k=>{ if(k) out.add(k); };
  const he=LANG!=='en';
  add(K(term));
  if(he) for(const v of heForms(term)) add(K(v));
  const alts=String(term).split(/[\/|,]|\s-\s/).flatMap(x=>he?heForms(x):[x])
                 .map(x=>K(x)).filter(Boolean);
  for(const a of alts){ add(a); add(String(a).replace(/\s+/g,'')); }
  return [...out];
}
/* הבעלים שאינם "ערך אחר" בכיוון הפירוש · הכרטיס עצמו וכל מי שחולק איתו פירוש
   (בדיוק פטור-הנרדפות של glossAlts). בלי הפטור הזה מקטע משותף היה נחשב התנגשות,
   וזו רגרסיה על 401 הערכים באנגלית ו-47 בעברית שחולקים פירוש. */
function typoOwners(meaning, card){
  const own=new Set();
  if(card && card.term) own.add(K(card.term));
  for(const s of meaningSegs(meaning)){
    const arr=GLOSS_ALT.get(s);
    if(arr) for(const t of arr) own.add(K(t));
  }
  return own;
}
function isCorrect(input, term){
  const a=K(input); if(!a) return false;
  if(a===K(term)) return true;
  if(LANG!=='en' && heForms(term).some(v=>K(v)===a)) return true;   // כופר for כֹּפֶר, סייס for סַיָּס
  // accept slash/comma alternatives ("1st - first", "raise / lift")
  const alts=term.split(/[\/|,]|\s-\s/).flatMap(x=>LANG==='en'?[x]:heForms(x))
                 .map(x=>K(x)).filter(Boolean);
  if(alts.includes(a)) return true;
  /* Compounds get written both ways · best-seller / bestseller, and in Hebrew a learner who
     types בית ספר as one word. This ran for English only, so 163 English terms were protected
     and the 380 multi-word Hebrew terms were not. Extended to both after measuring the risk:
     squashing spaces produces ZERO new collisions across all 1,719 Hebrew terms, neither
     between two terms nor onto an existing single-word key. Like the plene-spelling rules,
     this only ever ADDS an accepted form and can never reject one. */
  const squash=x=>String(x).replace(/\s+/g,'');
  if(alts.some(x=>squash(x)===squash(a))) return true;
  /* השכבה הפאזית אחרונה, תמיד. כל מה שמעליה מדויק, ולכן אין פרמטר שיכול לשבור קבלה
     קיימת · וממילא אין ריצת GA שיכולה לייצר רגרסיה. הדגל נדלק רק כשהפסילה נגרמה
     מהתנגשות עם ערך אחר, כי רק לה יש מה להגיד ללומד. */
  const r=nearMatch(a, typoKeysOf(term), LANG==='en'?'en':'he',
                    TYPO_PARAMS[LANG==='en'?'en-word':'he-word'], TERM_VETO, new Set([K(term)]));
  if(r.why==='collision') typoVeto=true;
  return r.ok;
}

/* ===== screens ===== */
const SCREENS=['auth','welcome','level','home','scope','quiz','results','stats','manage','add','exam','admin','locked','intro','account','boot','sent','mode'];
/* Heavy lists left in hidden screens keep thousands of nodes alive for the whole session;
   drop them on the way out -- they are always rebuilt when the screen is opened again. */
const HEAVY = {stats:'#statsBody', manage:'#manageList', results:'#reviewList'};

/* ===== "אחורה" של המערכת =====
   באנדרואיד "אחורה" הוא כפתור מערכת, ובלי היסטוריה פנימית לחיצה עליו סוגרת את
   האפליקציה · גם באמצע סבב.

   לכל מסך עומק. כניסה למסך עמוק יותר דוחפת רשומת היסטוריה; מעבר לאותו עומק או רדוד
   יותר מחליף אותה. כך "אחורה" יורד שלב אחד בכל לחיצה, וברמה 0 יוצא מהאפליקציה כמצופה.

   המפתח הוא ש-goBack · שאליו מחוברים כפתורי החזרה שבתוך האפליקציה · צורך את הרשומה
   במקום להשאיר אותה. הגרסה הראשונה לא עשתה זאת, ולכן אחרי יציאה מסבב דרך ✕ נשארה
   רשומה תלויה, ולחיצת "אחורה" הבאה נבלעה בלי שקרה כלום. */
/* ⚠ `mode` בעומק 0, כמו welcome ו-home
   ------------------------------------
   העומק כאן משרת את כפתור "אחורה" של אנדרואיד בלבד. שלושת המסכים האלה הם מסכי
   בסיס: מ-home לחיצת "אחורה" יוצאת מהאפליקציה, וזו ההתנהגות הקיימת. אילו הצבתי
   את mode בעומק 1, כניסה ל-home הייתה **מחליפה** את הרשומה במקום לדחוף אחת, ואז
   "אחורה" מ-home היה יוצא מהאפליקציה מבלי לעבור דרך בחירת התרגול · כלומר שינוי
   התנהגות בלי שביקשו אותו. ההיררכיה בין שלושת המסכים נעשית בכפתורים שבתוך
   האפליקציה, ולא בהיסטוריית הדפדפן. */
const NAV_DEPTH = { boot:0, intro:0, auth:0, welcome:0, locked:0, home:0, mode:0,
                    scope:1, account:1, level:1, admin:1,
                    quiz:2, results:2, exam:2, stats:2, manage:2, add:2, sent:2 };
const navDepth = id => NAV_DEPTH[id] || 0;
let navPop = false;   // אמת בזמן טיפול ב-popstate: הדפדפן כבר הזיז את ההיסטוריה
/* ⛔ נמצא בבדק בית 3: "→ בית" השאיר רשומה תלויה, ולחיצת "אחורה" אחת נבלעה ·
   בדיוק הרגרסיה שההערה מעל NAV_DEPTH מתארת, רק מדלת אחרת.
   התיקון הנאיבי · history.go(-navDepth(current)) · **שגוי ומסוכן**: עומק אינו
   מספר הרשומות שנדחפו. כניסה לאנגלית עוברת mode (עומק 0) → sent (עומק 2)
   ודוחפת **רשומה אחת**, ו-go(-2) היה מוציא את המשתמש מהאפליקציה.
   לכן המונה נשמר בתוך רשומת ההיסטוריה עצמה: הוא שורד רענון, והוא נכון גם
   כשקופצים כמה רשומות בבת אחת. */
const navN = () => (history.state && history.state.n) || 0;
let navHome = false;      // "→ בית" ממתין לגלישה חזרה אל הבסיס
let navHomeT = null;      // רשת ביטחון: היסטוריה קצרה מהצפוי לא תשאיר כפתור מת

function goto(id){
  SCREENS.forEach(s=>{
    if(s!==id && HEAVY[s] && !$('#'+s).classList.contains('hidden')){ const el=$(HEAVY[s]); if(el) el.innerHTML=''; }
    hide($('#'+s));
  });
  show($('#'+id)); window.scrollTo(0,0);
  if(!navPop){
    const cur = history.state && history.state.scr;
    try{
      const n = navN();
      if(navDepth(id) > navDepth(cur)) history.pushState({scr:id, n:n+1}, '');
      else history.replaceState({scr:id, n}, '');
    }catch(e){}
  }
  if(id==='intro'){
    /* The same screen serves two audiences. A visitor with no session must always get the two
       CTAs back, even if a signed-in session on this device previously opened it read-only. */
    if(!currentUser){ show($('#introCta')); hide($('#introTop')); }
    countUpIntro();
    // if the reveal animation has not finished by now it is never going to -- show everything
    setTimeout(()=>{ const el=$('#intro'); if(el) el.classList.add('anim-done'); }, 1500);
  }
}
/* The landing page states the size of the bank. A number that arrives already finished reads as
   a claim; one that runs up reads as a count. Eased, so it decelerates into the real figure -- 
   and it never invents one: the target is the two banks as actually loaded. */
let countedIntro=false;
function countUpIntro(){
  const el=$('#introCount'); if(!el || countedIntro) return;
  /* Both banks must be present. A failed <script> for one of them is silent -- no console error,
     no exception -- and the headline then announced 3,694 instead of 5,413, which is worse than
     announcing nothing: a broken load was presented as a plausible fact. */
  const he=window.UNIT_DATA, en=window.UNIT_DATA_EN;
  const cnt=o=>Object.values(o||{}).reduce((a,b)=>a+b.length,0);
  const n=cnt(he)+cnt(en);
  if(!cnt(he) || !cnt(en)){ el.textContent='–'; return; }
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
  /* requestAnimationFrame does not advance in a tab that is not compositing -- a background tab,
     a battery-saver throttle. Without this the headline number sits on "0", which reads as a
     broken page rather than a slow one. If no frame has arrived, show the real figure. */
  /* The guard asks whether the count FINISHED, not whether a frame ever ran -- one frame and
     then a stall used to leave the number frozen half way. */
  setTimeout(()=>{ if(!done) el.textContent=n.toLocaleString('en-US'); }, DUR+400);
}

/* ===== HOME ===== */
function renderHome(){
  const total=BANK.length;
  const uniqTerms=new Set(BANK.map(w=>w.term)).size;
  /* Was `1717 מילים · 1717 ייחודיות` · the same number twice, and "ייחודיות" explains nothing
     to someone who has just arrived. The second half only ever differs when a duplicate slips
     in, which is a thing for ME to see, not the learner. What they want to know is how much of
     it is theirs. */
  const done = classify('global');
  $('#totalPill').textContent = done.strong
    ? `${done.strong} מתוך ${total} מילים כבר בשליטה`
    : `${total} מילים · טרם התחלת`;
  /* Weak words across the WHOLE language, ignoring units -- the survey's top request by a wide
     margin. Hidden rather than shown empty: on day one nothing is weak yet, and an offer to
     drill zero words is a worse first impression than no offer at all. */
  renderExamPill();
  const weakAll = weakCards('global');
  const cta = $('#homeWeak');
  /* "1 מילים לחיזוק" אינו עברית, והוא נחשף ברגע שהסף ירד ל-1. פונקציה נפרדת ולא ביטוי
   בתוך renderHome, כדי שיהיה מה לבדוק בלי DOM שלם. */
/* ⭐ המספר יצא מהתת־כותרת והפך לאלמנט משלו (.wc-n). הנימוק נמדד באפליקציה
   החיה: הכותרת הקבועה 17.92px משקל 900, המספר המשתנה 13.12px משקל 400 · מה
   שזהה בכל כניסה היה גדול ב-37% וכבד בהרבה מהסיבה היחידה ללחוץ.
   הפונקציות מחזירות את הכיתוב הקבוע בלבד, ולכן אין בהן עוד ענף יחיד/רבים:
   "1 מילים" אינו יכול להיווצר כשהספרה עומדת לבדה. */
const weakCtaText = () => 'מכל יחידות הלימוד';
const acquiredCtaText = () => 'כל מילה שלא הכרת';
/* הסף היה 4, בלי נימוק רשום: מי שנשארו לו שתיים־שלוש מילים לחיזוק לא ראה אותן,
     וזה בדיוק הרגע שבו סבב קצר סוגר את הפער. הנימוק שכן נרשם · "לא להציע לתרגל אפס" ·
     מכוסה בסף 1. askSize מדלג על שאלת הגודל כשהרשימה קטנה מכל הקיצורים, ולכן
     סבב של מילה אחת נפתח ישר בלי דיאלוג מיותר. */
  if(cta){
    cta.classList.toggle('hidden', !weakAll.length);
    $('#homeWeakN').textContent = weakAll.length;
    $('#homeWeakSub').textContent = weakCtaText();
  }
  /* יחידת החזרות · אותו דפוס בדיוק: מוסתר ברשימה ריקה, ופונקציית נוסח נפרדת כדי
     שאפשר יהיה לבדוק את היחיד/רבים בלי DOM. ⚠ "הישנות קודם" ברבים בלבד · במילה
     אחת אין "קודם" ממה, וזו אותה משפחה של "1 מילים" שנתפסה כאן פעם. */
  const acqAll = acquiredCards('global');
  const acqCta = $('#homeAcquired');
  if(acqCta){
    acqCta.classList.toggle('hidden', !acqAll.length);
    $('#homeAcquiredN').textContent = acqAll.length;
    $('#homeAcquiredSub').textContent = acquiredCtaText();
  }
  renderDirSegs();
  renderWordCard();
  /* השלמת משפטים · אנגלית בלבד. הקורפוס אנגלי, ובצד העברי הכפתור היה מוביל
     לתרגול בשפה אחרת מזו שנפתחה.
     ⚠ המספר על הכפתור מוצג רק אחרי שקובץ הנתונים נטען, ולא לפניו: הצגתו מיד
     הייתה מחייבת להוריד 190KB בכל עליית דף, גם למי שלא נוגע בתרגול. עד אז
     הכפתור נושא ‹›, בדיוק כמו שאר הכפתורים שמובילים למסך. */
  const sentOn = LANG==='en';
  $('#sentSectionT')?.classList.toggle('hidden', !sentOn);
  $('#sentBands')?.classList.toggle('hidden', !sentOn);
  if(sentOn && window.SENT_EN){
    const q = sentSummary(null);
    /* ⚠ היה `q.left || q.total`, וזה הציג את **המספר המלא** דווקא כשהרצועה הושלמה:
       "כל 204 המשפטים נפתרו" ולידו תג `204`, שנקרא כמו 204 שנותרו. נמצא בציד
       ב-11.8, והוא הגיע לכל לומד שסיים רצועה. `✓` אומר את מה שקרה. */
    $('#cntSent').textContent = q.left ? q.left : '✓';
    $('#pbSentSub').textContent = q.left
      ? `${q.left} משפטים שטרם פתרת · ${okN(q.ok)} מתוך ${q.total}`
      : `כל ${q.total} המשפטים נפתרו · ${okN(q.ok)}`;
  }
  const grid=$('#unitGrid'); grid.innerHTML='';
  /* עשרה אריחים זהים, ואין שום סימן מאיפה מתחילים. הבחירה נופלת על הלומד ברגע שבו הוא
     יודע הכי פחות, וזה הרגע שבו אנשים סוגרים את הלשונית.
     "הבאה בתור" היא היחידה הראשונה שנותרו בה מילים חדשות · כלומר ההמשך הטבעי של מה
     שכבר נעשה, ולא המלצה שנשלפה מהאוויר. אם כל היחידות התחילו, אין תג: תג על הכול הוא
     תג על כלום. */
  const nextUid = UNIT_IDS.find(u=>{
    const cc=classify('unit:'+u);
    return cc.total>0 && cc.fresh===cc.total;          // עוד לא נגעו בה בכלל
  }) ?? UNIT_IDS.find(u=>{
    const cc=classify('unit:'+u);
    return cc.total>0 && cc.fresh>0;                   // התחילה אבל לא נגמרה
  });
  UNIT_IDS.forEach(uid=>{
    const c=classify('unit:'+uid);
    if(c.total===0) return;
    const pct=n=>c.total?(100*n/c.total):0;
    const el=document.createElement('button');
    el.className='tile'+(uid===nextUid?' next':'');
    /* התג "מומלץ להתחיל כאן" הוסר. הוא ישב מעל האריח, נחתך בקצה המסך בטלפון, וחזר על
       מידע שהמסגרת הצבעונית כבר מוסרת בשקט. המסגרת נשארת · היא מסמנת את אותו אריח
       בלי לתפוס שורה ובלי להיחתך. */
    el.innerHTML=`<div class="num">${uid}</div><div class="lbl">${c.total} מילים</div>
      <div class="mini"><i class="s" style="width:${pct(c.strong)}%"></i><i class="w" style="width:${pct(c.weak)}%"></i><i class="n" style="width:${pct(c.fresh)}%"></i><i class="k" style="width:${pct(c.skipped||0)}%"></i></div>`;
    el.onclick=()=>openScope('unit:'+uid);
    grid.appendChild(el);
  });
}

/* ===== כרטיס המילה במסך הבית =====
   שתי משתמשות ביקשו "ג'אדג'ט", וההגדרה היא: הצעה למילה עם הפירוש שלה, אינטראקטיבית.
   מה שזה פותר בפועל אינו קישוט · עשרה אריחים זהים דורשים מהלומד לבחור ברגע שבו הוא יודע
   הכי פחות, וזה הרגע שבו נסגרת הלשונית. הכרטיס הוא הדבר האחד שאפשר ללחוץ עליו מיד.

   הבחירה אינה אקראית. קודם מילה שכבר נפגשה ולא נקנתה · היא זו שעומדת ליפול מהזיכרון ·
   ורק אם אין כזו, מילה חדשה. אקראי גמור היה מציע מילה שהלומד כבר יודע, וזה מלמד אותו
   להתעלם מהכרטיס.

   האינדקס נגזר מהיום ולא מ-Math.random: מילה שמתחלפת בכל רענון אינה "מילת היום" אלא רעש,
   ואי אפשר לחזור אליה. הלחצן "מילה אחרת" הוא הדרך המכוונת להחליף, והוא סופר קדימה · כך
   שגם מי שמדלג מגיע למילים חדשות ולא מסתובב במעגל. */
let wcOffset=0;
/* ✕ סוגר את הכרטיס להיום ולא לתמיד. סגירה קבועה הייתה מוחקת את נקודת הכניסה היחידה
   במסך הבית על סמך לחיצה אחת, ובלי מסך הגדרות שמחזיר אותה · וזו לחיצה שאי אפשר לבטל.
   נשמר מספר היום, ולכן הכרטיס חוזר מחר עם מילה אחרת ממילא. */
/* יום קלנדרי מקומי, לא יום UTC.
   Math.floor(Date.now()/86400000) מתחלף בחצות UTC · כלומר ב-02:00 או 03:00 בישראל.
   שתי תוצאות: "מילת היום" התחלפה באמצע הלילה, וסגירת הכרטיס ב-23:30 נפתחה מחדש
   שעתיים וחצי אחר כך באותו לילה עצמו. קיזוז אזור הזמן מיישר את זה לאותו יום שבו
   dayKey (app.js: הרצף) כבר משתמש · שתי הגדרות שונות של "היום" באותה אפליקציה הן
   באג שמחכה לקרות. */
function wcToday(){ const d=new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset()*60000)/86400000); }
/* מפתח לכל שפה, לא מפתח אחד משותף.
   הכרטיס מציג מילה מהמאגר של השפה הפעילה · wcPick נשען על weakCards/newCards,
   שקוראים את BANK · ולכן "מילת היום" בעברית ובאנגלית הן שתי מילים שונות. אבל
   הסגירה נשמרה במפתח גולמי אחד, בלי KEY(), וכך לחיצה על ✕ בעברית סגרה להיום גם
   את הכרטיס האנגלי: מילה שהלומד לא ראה, בכרטיס שלא הספיק להיפתח.
   KEY() משאיר את עברית על 'wcHide' ונותן לאנגלית 'wcHide_en', בדיוק כמו שאר
   מפתחות ההתקדמות · כלומר סגירות קיימות של משתמשים עברים ממשיכות לתפוס. */
function wcDismissed(){
  try{ return Number(localStorage.getItem(KEY('wcHide'))) === wcToday(); }catch(e){ return false; }
}
function wcDismiss(){
  try{ localStorage.setItem(KEY('wcHide'), String(wcToday())); }catch(e){}
}
function wcPool(){
  const weak=weakCards('global');
  return weak.length ? weak : newCards('global');
}
function wcPick(){
  const pool=wcPool();
  if(!pool.length) return null;
  const day=wcToday();   // אותו יום מקומי שהסגירה משתמשת בו
  return { w: pool[(day+wcOffset)%pool.length], weak: weakCards('global').length>0, size: pool.length };
}
function renderWordCard(){
  const card=$('#wordCard');
  if(!card) return;
  const p=wcPick();
  /* אין מאגר, או שהכול נלמד · אין מה להציע, והכרטיס נעלם במקום להציג ריק. */
  if(!p || !p.w || wcDismissed()){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('#wcKicker').textContent = p.weak ? 'מילה לחיזוק' : 'מילה חדשה להיום';
  /* התווית נגזרת ממה שהכרטיס באמת הציג. "תרגל חולשות" על מילה חדשה היה מבטיח סבב
     חיזוק ופותח סבב של מילים שטרם נפגשו · כפתור ששמו אינו מה שהוא עושה. */
  $('#wcPractice').textContent = p.weak ? 'תרגל חולשות' : 'תרגל מילים שטרם תרגלת';
  $('#wcTerm').textContent   = p.w.term;
  /* אותו סימון שכבר נעשה ל-#qText ול-#lvWord: בלעדיו קורא מסך מבטא מילה אנגלית בהגייה
     עברית, והמילה מיושרת לכיוון ההפוך. */
  $('#wcTerm').lang = LANG==='en' ? 'en' : 'he';
  $('#wcTerm').dir  = LANG==='en' ? 'ltr' : 'rtl';
  /* הרמקול, בדיוק כמו בתרגול: בלי alwaysEn, כדי ש-bindSay יסתיר אותו לבדו במאגר העברי.
     המילה כאן כבר גלויה · הפירוש הוא שמוסתר · ולכן ההקראה אינה מוסרת תשובה. */
  bindSay('#wcSay', p.w.term);
  $('#wcMean').textContent   = p.w.meaning || '–';
  /* חוזר למצב מכוסה בכל רינדור: מסך בית שנטען עם הפירוש פתוח מלמד לדלג על הניחוש. */
  $('#wcMean').classList.add('hidden');
  $('#wcActs').classList.add('hidden');
  $('#wcReveal').classList.remove('hidden');
}

/* ===== SCOPE ===== */
/* A per-unit "X% appear in real exams" tag was built from the NITE measurement and then
   removed on sight. The numbers are true -- 47% down to 23% -- but on a tile they read as
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
    `<div><i class="s"></i> למדתי <b>${c.strong}</b></div>
     <div><i class="w"></i> לחיזוק <b>${c.weak}</b></div>
     <div><i class="n"></i> שטרם תרגלתי <b>${c.fresh}</b></div>`+
    (c.skipped ? `<div title="דילגת עליהן אחרי מבחן הרמה. ניתן להחזיר ב&quot;ניהול מילים&quot; ← &quot;שחזר מחיקות&quot;"><i class="k"></i>
       דילגתי <b>${c.skipped}</b></div>` : '');
  const nc=newCards(scope).length, wc=weakCards(scope).length, lc=learnedCards(scope).length;
  $('#cntNew').textContent=nc; $('#cntWeak').textContent=wc; $('#cntLearned').textContent=lc;
  $('#pbNew').disabled = nc===0;
  $('#pbWeak').disabled = wc===0;
  $('#pbLearned').disabled = lc===0;
  /* The end-of-round card tells you where the round left you. This tells you where you are
     BEFORE you start -- same numbers, same place in the flow, so the two agree by construction. */
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
// NOTE: new/learned are shuffled BEFORE the cap -- otherwise slicing an ordered list hands
// back the very same 20 words every round, which reads as "the app keeps repeating itself".
// the list is built ONCE, up front, so the sheet can show its size and the callback caps the
// very same list -- building it twice would let a background sync change it in between
// same round as כל המאגר ← מילים לחיזוק, minus the two taps in between
$('#homeWeak').onclick = ()=>{
  curScope='global';
  const l=weakCards('global');
  if(!l.length){ toast('אין כרגע מילים לחיזוק. תרגל סבב ומילים שתטעה בהן יופיעו כאן'); return; }
  askSize(l.length, n=> startRound(capSampled(l,n), 'global', 'weak'));
};
$('#homeAcquired').onclick = ()=>{
  curScope='global';
  const l=acquiredCards('global');
  if(!l.length){ toast('אין עדיין מילים לחזרה. תרגל סבב ונראה'); return; }
  askSize(l.length, n=>{
    /* ⛔ slice ולא capSampled. capSampled מדגים חלון של 2n ומערבב אותו בכוונה, כדי
       שאותן מילים לא יחזרו · שם זה נכון, כאן זה הורס את הפיצ'ר. "הישנות קודם" הוא
       כל התכן, ולכן חותכים את n הראשונות **בסדרן**. */
    const pick=l.slice(0, n||l.length);
    if(pick.length<l.length) toast(`מתרגל ${pick.length} מתוך ${l.length}`);
    startRound(pick, 'global', 'acquired');
    /* ⭐ הערבוב של startRound **נשאר**, וזה מכוון. הבחירה כבר עשתה את העבודה:
       `pick` הוא n המילים שהכי מזמן לא תורגלו. בתוך הסבב הסדר אקראי, וזה מה
       שמונע מהיחידה להיקרא כרשימה משוננת. חגי: "מסודרות בסדר אקראי".
       ⛔ כאן היה `deck.sort` לפי t0 שהחזיר סדר קבוע · הוא הוסר. */
    idx=0; renderCard();
  });
};
$('#pbWeak').onclick    = ()=>{ const l=weakCards(curScope);    askSize(l.length, n=> startRound(capSampled(l,n), curScope, 'weak')); };
$('#pbNew').onclick     = ()=>{ const l=newCards(curScope);     askSize(l.length, n=> startRound(cap(shuffle(l),n), curScope, 'new')); };
$('#pbLearned').onclick = ()=>{ const l=learnedCards(curScope); askSize(l.length, n=> startRound(cap(shuffle(l),n), curScope, 'learned')); };
$('#pbExam').onclick=()=>{ if(curScope.startsWith('unit:')) openExam(curScope.slice(5)); };
$('#pbSheet').onclick=()=>{ if(curScope.startsWith('unit:')) printSheet(curScope.slice(5)); };
$('#pbStats').onclick   = ()=> openStats(curScope);
function cap(list,n){ if(n && list.length>n){ toast(`מתרגל ${n} מתוך ${list.length}`); return list.slice(0,n);} return list; }
/* A survey respondent put it exactly: the same words keep coming back. shuffle() is a correct
   Fisher-Yates, and that was never the problem -- the SET was deterministic. weakCards is sorted
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
  /* A preset that is not smaller than the list caps nothing -- picking it gives the same round
     as picking everything. When none of them is smaller, the sheet has one real answer, and
     asking a question with one answer is just a tap the learner has to spend. Start the round. */
  const usable = SIZES.filter(n => n < sizeTotal);
  if(!usable.length){ sizeCb=null; cb(0); return; }
  sizeCb=cb;
  const last=LS.get(KEY('hw_size'), 20);
  const custom = last>0 && SIZES.indexOf(last)<0 && last<sizeTotal ? last : 0;   // a typed number
  // "כל היחידה" is only true inside a unit · כל המאגר and אקראי are not units.
  const allLabel = (curScope==='global'||curScope==='random' ? 'הכול' : 'כל היחידה')
                 + (sizeTotal ? ' · '+sizeTotal : '');
  // only the presets that actually narrow the list -- 50 beside a list of 12 is noise
  const opts = usable.map(n=>({n, label:String(n)}))
      .concat([{n:-1, label: custom ? 'אחר · '+custom : 'אחר'}, {n:0, label:allLabel}]);
  // when the saved size no longer fits, "everything" is what a tap would actually do -- say so
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
// Enter inside the field is the same as pressing התחל · on a phone that is the keyboard's own key
$('#sizeCustomN').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); customGo(); } });
$('#sizeCancel').onclick=()=>{ sizeCb=null; hide($('#sizeCustom')); hide($('#sizeAsk')); };
$('#sizeAsk').onclick=e=>{ if(e.target===$('#sizeAsk')){ sizeCb=null; hide($('#sizeCustom')); hide($('#sizeAsk')); } };

/* ===== QUIZ ENGINE ===== */
let deck=[], idx=0, correct=0, missed=[], answered=false;
let session=new Map(), sessionScope='global', sessionMode='all', committed=false;
/* Which words of the CURRENT round have already been written to stats, and which log row this
   round owns. Both exist because commitSession can now legitimately run several times per
   round -- visibilitychange fires every time a notification pulls the learner away. */
let committedKeys=new Set(), sessionRowId=null;

/* committed מסמן "אין עבודה שלא נשמרה". הוא קיבל true בשני מקומות והתאפס במקום אחד בלבד ·
   תחילת סבב · ולכן אחרי ההפרעה הראשונה (נעילת מסך, התראה שקפצה) הוא נשאר true לכל אורך
   הסבב. שבעת אתרי הקומיט ששואלים `if(!committed && session.size>0)` דילגו, וכל מה שנענה
   אחרי ההפרעה נזרק: 20 מילים, הפרעה אחרי 3, ורק 3 נשמרות.
   ההערה שמעל commitSession מתארת בדיוק את התרחיש ומכריזה שהוא נסגר · מה שנבנה בפועל היה
   committedKeys, שמגן מפני קומיט כפול של אותה מילה. הגנה נכונה, על בעיה אחרת.
   האיפוס כאן בטוח בזכותה: קריאה נוספת על מילה שכבר נשמרה אינה מוסיפה לה דבר. */
function sess(w){ const k=K(w.term); if(!session.has(k)){ session.set(k,{w,attempts:0,mastered:false,firstTry:false}); committed=false; } return session.get(k); }

let isRetryRound=false;
function startRound(cards, scope, mode, retry){
  if(!Array.isArray(cards) || cards.length===0){ toast('אין מילים לתרגול כאן'); return; }
  if(!committed && session.size>0) commitSession();
  session=new Map(); committed=false; committedKeys=new Set(); sessionRowId=null;
  sessionScope=scope; sessionMode=mode;
  // last line of defence: the same word can never appear twice inside one round
  const uniq=[], ks=new Set();
  for(const c of cards){ const k=K(c.term); if(k && !ks.has(k)){ ks.add(k); uniq.push(c); } }
  deck=oneCardPerGloss(shuffle(uniq).map(c=>({...c, _dir: direction==='mixed' ? (Math.random()<0.5?'m2w':'w2m') : direction})));
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
  /* הכרטיס נרשם ברגע שהוא מוצג, ולא רק כשעונים עליו.
     session היה מתמלא ב-finishCard בלבד, ולכן הכרטיס שהיה על המסך ברגע שהלומד יצא לא נספר
     כלל · ו-newCards, שמסננת לפי seen===0, החזירה אותו כ"מילה שעוד לא תרגלתי". סימולציה של
     סבבי תרגול אמיתיים (scratchpad/practice_sim.js) מדדה אפס חזרות בסבב שהושלם מול 60 חזרות
     כשהסבב ננטש · הפרש של כרטיס אחד בדיוק לכל סבב, וזה הכרטיס הזה.
     commitSession מבדילה בין רשומה כזאת (attempts===0) לבין תשובה, ולכן הרישום כאן אינו
     מחשיב אותה טעות. */
  sess(w);
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
    $('#qText').lang = en ? 'en' : 'he';   // קורא מסך יבטא את המילה בשפה הנכונה
    inp.placeholder = en ? 'התרגום…' : 'הפירוש…';
    inp.dir='rtl';
    bindSay('#qSay', w.term);
  }else{                // show the MEANING (Hebrew), type the word
    $('#qKind').textContent = en ? 'כתוב את המילה באנגלית' : 'כתוב את המילה לפי הפירוש';
    // the gloss becomes the question here, so the answer must not be inside it
    $('#qText').textContent = maskTerm(w.meaning, w.term);
    $('#qText').dir='rtl';
    $('#qText').lang='he';   // הפירוש תמיד עברי, בשני מאגרי השפה
    // The English word IS the answer here, so it can only be read out after the card is
    // answered -- otherwise the speaker button just gives it away.
    bindSay('#qSay', null);
    inp.placeholder = en ? 'the word…' : 'המילה…';
    inp.dir = en ? 'ltr' : 'rtl';
  }
  /* ONE announcement per card, built from the three things the audit measured as silent: where
     the learner is in the round, what they are being asked to do, and the word itself. Read off
     the elements that were just set rather than rebuilt from `w`, so the announcement can never
     drift from what is on screen (masking, direction, language all already applied).
     Deliberately one write and not more: a live region that fires on every DOM touch is a reader
     that never stops talking, and noise is worse than silence. renderCard runs once per card and
     holds the only write to #cardLive in the whole file. */
  $('#cardLive').textContent = `${$('#qCount').textContent} · ${$('#qKind').textContent} · ${$('#qText').textContent}`;
  clearTimeout(focusT);
  focusT=setTimeout(()=>{ if(!$('#quiz').classList.contains('hidden') && !answered) inp.focus(); },30);
}
/* הפרמטר השלישי הוא הכרטיס, והוא רשות · בלעדיו פטור-הנרדפות נגזר מ-GLOSS_ALT בלבד
   ולכן צר יותר, כלומר מחמיר יותר. אף קורא קיים לא נשבר: שתי השכבות החדשות רק
   מוסיפות קבלות, ומי שקורא בלי כרטיס מקבל את ההתנהגות הזהירה. */
function meaningMatch(input, meaning, card){
  // the "meaning" side is Hebrew in both languages → always use the Hebrew normalizer
  const a=norm(input); if(!a) return false;
  if(a===norm(meaning)) return true;
  // …and the same answer without the explanatory parenthesis, which nobody types
  if(a===norm(String(meaning).replace(/\([^)]*\)/g,' '))) return true;
  const segs=meaningSegs(meaning);
  if(segs.includes(a)) return true;
  /* A single word from ANYWHERE in the gloss used to pass · including from inside a
     parenthetical example. "יגור :: פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)"
     accepted "קרה", a different word entirely, and promoted the item to level 3.
     One whole listed sense is still enough; a word lifted out of an example is not. */
  /* תחילית אחת אינה פירוש אחר. "נרתיק החרב" מול "נרתיק לחרב", "עובד בבית המרחץ" מול
     "עובד בבית מרחץ" · אותה תשובה בדיוק, ורק ה"א הידיעה או אות יחס מבדילה. ראה
     particleMatch להסבר למה זו השוואה סובלנית ולא גזירה. */
  if(segs.some(s=>particleMatch(a, s))) return true;
  /* שלוש השכבות החדשות, והפאזית אחרונה תמיד. שתי הראשונות מדויקות (מנייה סופית של
     חלופות, וקנוניזציה של נרדפות) ולכן הן זולות וחסינות; השלישית היא היחידה שמודדת
     דמיון, ולכן היא רצה רק אחרי שכולן נכשלו. */
  const own=typoOwners(meaning, card);
  const blocked=typoSegBlocked(a, segs, own);
  if(TYPO_GLOSS_RULES.splitOr && !blocked && typoSplitOr(segs).has(a)) return true;
  /* צירוף מקטעים חלקי · המקרה של חגי מ-16.8: `cosmopolitan` מחזיק שלושה מקטעים,
     הוא כתב שניים מהם ברצף · "קוסמופוליטי רב תרבותי" · ונדחה כ-`far`.
     ⚠ למה זו שכבה ולא כלום: `norm` מסירה את הפסיק, ולכן צירוף **כל** המקטעים
     בסדרם שווה ל-`norm(meaning)` ומתקבל כבר בשורה הראשונה. צירוף **חלקי** אינו
     שווה לכלום, ואף שכבה לא הגיעה אליו · 293 שורות בקורפוס, אפס מתקבלות.
     רצופים ובסדרם בלבד (C1). ‏C2 (לא רצופים) אינו קונה דבר מעליה, ו-C3 (כל סדר)
     מכפיל את שטח הפנים פי 17 וגדל פקטוריאלית · כרטיס בן 8 מקטעים מייצר מעל
     100,000 מחרוזות. שניהם נמדדו ונדחו.
     ‏`!blocked` כמו בשתי השכבות שמעל · הווטו נבדק על המחרוזת הזאת כמו על כל
     אחרת, אחרת השכבה עוקפת בדיוק את מה שהיא יושבת מעליו. */
  if(TYPO_GLOSS_RULES.segConcat && !blocked && typoSegConcat(segs, card).has(a)) return true;
  if(TYPO_GLOSS_RULES.synonyms && !blocked){
    const c=typoCanon(a);
    if(segs.some(s=>typoCanon(s)===c)) return true;
  }
  const r=nearMatch(a, segs, 'he', TYPO_PARAMS.gloss, SEG_VETO, own);
  if(r.why==='collision') typoVeto=true;
  return r.ok;
}
/* מילות יחס וקישור עצמאיות. הן אינן נושאות מידע כשהן מילה שלמה, ו"נרתיק של חרב" מול
   "נרתיק חרב" הוא אותו פירוש. נזרקות משני הצדדים כאחד. */
const PARTICLE_STOP=new Set(['של','את','עם','על','אל','מן','כל','זה','זאת','הוא','היא','אשר','או','גם','לפי']);
/* השוואה סובלנית לתחילית אחת · **לא** גזירה של כל מילה.
 *
 * ההבדל הזה נמדד ואינו סגנוני. גזירה גורפת של ב/ל/כ/מ/ש הופכת את "מרחץ" ל"רחץ",
 * ולכן דווקא *שוברת* את "עובד בבית המרחץ" מול "עובד בבית מרחץ" · ההתאמה שהיא באה
 * לאפשר. השוואה סובלנית נוגעת רק בזוג המילים שנבדק ואינה מייצרת אף גזע חדש.
 *
 * מה שנמדד על כל 1,717 המילים בעברית (5.8.2026): פותר 2 מתוך 24 מקרים אמיתיים
 * שחגי צילם, **אפס** מיזוג בין שני פירושים של אותו כרטיס, ו-10 זוגות פירושים בכל
 * המאגר שהופכים לניתנים להחלפה · כולם, בשמם, אותו פירוש עם תחילית ובלעדיה
 * ("שקט"/"בשקט", "החריף"/"חריף", "מראה"/"המראה"). אפס קבלות שגויות.
 *
 * להשוואה, הכלל המורפולוגי שנשקל ונדחה (גזירה לשלד עיצורי) קיפל 61.7% מאוצר המילים
 * לגזעים מתנגשים ו-918 זוגות פירושים. ראה דוחות/סיכומים/מדידת-כלל-מורפולוגי.md.
 *
 * הסף length>3: "לב", "בו", "כן" הן מילים שלמות, ולא תחילית ועוד אות. */
function particleMatch(a, seg){
  const PARTICLE='הלבכו';
  const cut=s=>String(s).split(/\s+/).filter(x=>x && !PARTICLE_STOP.has(x));
  const A=cut(a), B=cut(seg);
  if(!A.length || A.length!==B.length) return false;
  const peel=w=>(w.length>3 && PARTICLE.includes(w[0])) ? w.slice(1) : null;
  const eq=(x,y)=> x===y || peel(x)===y || x===peel(y) || (!!peel(x) && peel(x)===peel(y));
  const used=B.map(()=>false);
  return A.every(x=>{
    const j=B.findIndex((y,i)=>!used[i] && eq(x,y));
    if(j<0) return false;
    used[j]=true; return true;
  });
}
/* ===== שני חוקי צד-הפירוש שעברו את שער אפס-ההתנגשויות =====
 *
 * שניהם נמדדו ב-typo-lab על שני המאגרים, ושניהם דלוקים: 0 התנגשויות חדשות בכל אחד.
 * מה שנמדד ו**נדחה** ואינו כאן: ראש-מקטע (34 התנגשויות ששרדו את הווטו), מילה עודפת
 * (מילת עוצמה היא ההבדל בין ערכים · "כעס" מול "כעס מאוד"), מילת יחס רופפת
 * (particleMatch כבר מכסה, וכל הרחבה הוסיפה 95+ התנגשויות), וכל 28 וריאנטי
 * המורפולוגיה (typo-lab/out/morph-report.md). */
const TYPO_GLOSS_RULES = { splitOr: true, synonyms: true, segConcat: true };
/* תקרה על מספר המקטעים שנכנסים לצירוף · ראה typoSegConcat. */
const TYPO_SEG_CONCAT_MAX = 5;
/* ⛔ החריג היחיד · נתון ליד המנגנון, לא `if` בתוך הלוגיקה.
   הכרטיס `tie` מחזיק [לקשור | קשר | עניבה]. הצירוף הצמוד של שני הראשונים מייצר
   **ניב** · "לקשור קשר" במובן להתחבר בקנוניה · שהוא הפירוש הרשום של `plot`.
   הצירוף התמים חוצה משמעות, וזו בדיוק ההתנגשות היחידה שהמנגנון ייצר על כל
   המאגר: שער המאגר החזיר 1 בלעדיו ו-0 איתו. */
const TYPO_SEG_CONCAT_EXCEPT = [{ term: 'tie', typed: 'לקשור קשר' }];
/* B1 · פיצול "או" מחלק. meaningSegs מפצל על פסיק, נקודה-פסיק, קו ונקודתיים · ולא על
 * "או", ולכן "בעל שיניים או בעל צורה של שיניים" הוא מקטע אחד והקלדת "בעל שיניים"
 * נדחתה. ה"או" מחבר לרוב רק **חלק** מהמקטע והשאר משותף לשתי החלופות: "אסף עצים או
 * קש למדורה" = "אסף עצים למדורה" / "אסף קש למדורה", ולכן המנייה היא על כל תחילית
 * וסיומת משותפות ולא פיצול ישיר.
 * השומרים הם איחוד ולא AND · כל אחד לבדו מפיל מקרה שהשני פותר (7 מְשֻׁנָּן מול
 * 15 קוֹשֵׁשׁ), ובתצורה המשולבת שניהם נפתרים:
 *   ליבה ≥ 2 מילים   חוסם "או" שמחבר בתוך צירוף ("שפת נהר או נחל")
 *   חלופה ≥ 3 מילים  חוסם תוצאה בת מילה אחת, שהיא לרוב הפירוש המלא של ערך אחר
 * נמדד: 659 קבלות חדשות, אפס התנגשויות ששורדות את וטו המקטעים · הווטו **נדרש**. */
const TYPO_OR_GUARDS = [{minSide:2, minAlt:1}, {minSide:1, minAlt:3}];
function typoSplitOr(segs){
  const all=new Set();
  const words=s=>String(s).split(/\s+/).filter(Boolean);
  for(const g of TYPO_OR_GUARDS){
    for(const seg of segs){
      const W=words(seg);
      if(W.length<3) continue;                 // "או" בקצה, או מקטע שהוא "או" לבדו
      const ors=[];
      for(let i=1;i<W.length-1;i++) if(W[i]==='או') ors.push(i);
      if(!ors.length) continue;
      const n=W.length;
      const add=a=>{ if(a.length>=g.minAlt) all.add(a.join(' ')); };
      for(const i of ors)
        for(let pre=0; pre<=i-1; pre++)
          for(let suf=0; suf<=n-i-2; suf++){
            /* הליבות הן החלופות עצמן · minSide נמדד עליהן ולא על התוצאה, שהתחילית
               והסיומת המשותפות מנפחות. */
            const leftCore=W.slice(pre,i), rightCore=W.slice(i+1,n-suf);
            if(leftCore.length<g.minSide || rightCore.length<g.minSide) continue;
            const tail=W.slice(n-suf,n);
            const alt1=W.slice(0,i).concat(tail);
            const alt2=W.slice(0,pre).concat(rightCore, tail);
            if(alt1.length) add(alt1);
            if(alt2.length) add(alt2);
          }
    }
  }
  for(const s of segs) all.delete(s);           // מקטע קיים אינו קבלה חדשה
  return all;
}
/* E · נרדפות. 55 קבוצות מתוך 102 שנכתבו, אחרי שער אפס-התנגשויות על שני המאגרים
 * (typo-lab/out/synonym-gate.md). ⛔ המקור הוא אוצר המילים של הפירושים במאגר עצמו,
 * נכתב בפרויקט הזה · אין כאן ויקימילון, WordNet עברי, האקדמיה ולא שום מקור CC BY-SA.
 * 47 הקבוצות שנדחו נדחו כולן על התנגשות מדודה, לא על טעם.
 * ההשוואה היא קנוניזציה מילה-מילה לנציג הקבוצה, בדיוק כמו בשער · לא גזירה ולא
 * דמיון: מילה שאינה בקבוצה נשארת כמות שהיא. */
const TYPO_SYN = [
  ["לפני","טרם"],["בערך","בקירוב","לערך"],["לעיתים","לעתים","לפעמים"],["במהירות","מהר"],
  ["מחדש","שוב","שנית"],["למרות","חרף"],["מראש","מלכתחילה"],["בעזרת","באמצעות"],
  ["אדם","איש"],["לאדם","לאיש"],["כוח","עוצמה"],["ספק","פקפוק"],["ערך","שווי"],
  ["באופן","בצורה"],["תוצאה","תולדה"],["סיבה","עילה"],["רעש","שאון"],["דעה","השקפה"],
  ["מתנה","שי"],["מעשה","פעולה"],["שכבה","רובד"],["חור","נקב"],["בד","אריג"],
  ["עץ","אילן"],["זמן","עת"],["אדמה","קרקע"],["האדמה","הקרקע"],["הוצאת","הסרת","עקירת"],
  ["אונייה","אוניה","ספינה"],["ארוך","ממושך"],["חלש","רפה"],["מוזר","משונה"],
  ["מיוחד","ייחודי"],["מיוחדת","ייחודית"],["בולט","ניכר"],["ברור","נהיר"],
  ["קבוע","תמידי"],["מתאים","תואם"],["שניתן","שאפשר"],["שאינו","שלא"],["שיש","שקיים"],
  ["ערוך","מסודר"],["יכול","מסוגל"],["קרוב","סמוך"],["חשף","גילה"],["להתאים","להלום"],
  ["להעריך","לאמוד"],["לעשות","לבצע"],["עשה","ביצע"],["לשים","להניח"],
  ["מניחים","מעמידים","שמים"],["לשבח","להלל","לפאר"],["להבחין","להבדיל"],
  ["כתב","רשם"],["כלל","כל"]
];
let TYPO_SYN_MAP=null;
function typoSynMap(){
  if(TYPO_SYN_MAP) return TYPO_SYN_MAP;
  TYPO_SYN_MAP=new Map();
  for(const g of TYPO_SYN){
    const ws=g.map(norm).filter(Boolean);
    if(!ws.length) continue;
    for(const w of ws) TYPO_SYN_MAP.set(w, ws[0]);     // הנציג הוא הראשונה בקבוצה
  }
  return TYPO_SYN_MAP;
}
function typoCanon(s){
  const m=typoSynMap();
  let touched=false;
  const out=String(s).split(' ').map(w=>{
    const r=m.get(w);
    if(r===undefined || r===w) return w;
    touched=true; return r;
  });
  return touched ? out.join(' ') : s;
}
/* וטו המקטעים · מה ש-isVetoedSeg עשה במעבדה. מקטע שהוא פירוש של ערך אחר נפסל תמיד,
   ופטור הנרדפות נשמר: מי שחולק פירוש עם הכרטיס אינו "ערך אחר". */
function typoSegBlocked(a, segs, own){
  const owners=SEG_VETO.get(a);
  if(!owners || !owners.size) return false;
  if(segs.indexOf(a)>=0) return false;
  for(const o of owners) if(!own.has(o)) return true;
  return false;
}
/* צירופים חלקיים של מקטעים סמוכים · רצופים ובסדרם בלבד.
   הצירוף **המלא** אינו נכנס: הוא כבר שווה ל-norm(meaning) ומתקבל בשורה הראשונה
   של meaningMatch, והכנסתו לכאן הייתה כפילות שמסתירה מה השכבה באמת מוסיפה.
   TYPO_SEG_CONCAT_MAX חוסם את הפיצוץ · בלי תקרה, כרטיס בן 8 מקטעים מייצר עשרות
   אלפי מחרוזות, וזה נמדד כ-OOM אמיתי בסבב שבו זה נבנה. */
function typoSegConcat(segs, card){
  const use=segs.slice(0, TYPO_SEG_CONCAT_MAX), out=new Set();
  if(use.length<2) return out;
  const full=segs.join(' ');
  for(let i=0;i<use.length;i++) for(let j=i+1;j<use.length;j++){
    const s=use.slice(i,j+1).join(' ');
    if(s!==full) out.add(s);
  }
  const own=K(card && card.term);
  for(const e of TYPO_SEG_CONCAT_EXCEPT) if(K(e.term)===own) out.delete(norm(e.typed));
  return out;
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
  /* מילות קישור שמקדימות פירוש נוסף ואינן תשובה בעצמן. אחרי הפיצול על ":" הן נשארות
     כמקטע נפרד, ובלי הסינון הזה הקלדת "וגם" הייתה נחשבת תשובה נכונה.
     בתוך הפונקציה ולא כקבוע חיצוני: ארגז החול של הבדיקות מרים פונקציות בודדות, וקבוע
     שמוגדר מחוץ לפונקציה אינו נמצא בהיקף שלה כשהיא מורמת. */
  const MARKER=/^(?:ו?גם|ו?בפרט|ו?בהשאלה|וכן|כגון|לדוגמה|למשל|להיפך|או)$/;
  /* הפיצול כולל נקודה ונקודתיים, ולא רק פסיק ונקודה-פסיק.
     נמדד על 5,662 הפירושים: 40 מכילים ":" ו-13 מכילים ".", והם נשאו פירוש שני אחרי
     מילת קישור · "חלול, ריק. בהשאלה: ריקני, שטחי". בלי הפיצול המקטע היה
     "ריק בהשאלה ריקני", ולכן גם "ריק" וגם "ריקני" נדחו למרות ששניהם נכונים.
     ב"תַּתְרָן :: נטול חוש ריח. בהשאלה: חסר חוש הבחנה" נדחו *שתי* התשובות האפשריות,
     כלומר המילה לא הייתה ניתנת לענייה בכלל. זו התלונה של חגי: "כתבתי תשובה נכונה
     אבל היה צריך לכתוב פסיק ולהוסיף עוד מילה".
     הנקודה מפוצלת רק כשהיא בודדת: (?<!\.)\.(?!\.) משאיר "..." שלם, שאם לא כן
     "גם... וגם..." (הפירוש של both... and...) היה מתפרק.
     מה שלא השתנה: הסוגריים עדיין נמחקות לפני הפיצול, ולכן "(להיפך: נדיר)" אינו הופך
     את הניגוד לתשובה קבילה · וגם לא מתקבלת מילה בודדת שנשלפה מתוך פירוש ארוך. */
  const parts=String(meaning).replace(/\([^)]*\)/g,' ')
    .split(/[,;/|]|\s-\s|(?<!\.)\.(?!\.)|:/)
    .map(s=>s.trim()).filter(Boolean);
  /* מילת קישור נזרקת רק כשנשאר פירוש אחר מלבדה.
     בלי התנאי הזה נשברו שש מילים באנגלית שהפירוש שלהן *הוא* מילת הקישור עצמה ·
     also→"גם", or→"או", vice versa→"להיפך", for example→"לדוגמה" · והן הפכו לחסרות
     תשובה לחלוטין. בדיקה 28 ("כל ערך במאגר ניתן למענה") היא שתפסה את זה.
     המסקנה: "וגם" הוא רעש כשהוא מקדים פירוש, והוא התשובה כשהוא לבדו. ההקשר מכריע,
     לא המילה. */
  const kept=parts.filter(s=>!MARKER.test(s));
  return (kept.length?kept:parts).map(norm).filter(Boolean);
}
/* אותה חלוקה בדיוק, אבל בטקסט המקורי ולא מנורמל · לתצוגה בלבד.
   האינדקסים חייבים להיות זהים לאלה של meaningSegs, כי r.sens שומר אינדקסים שלה: פירוש
   שיוצג ירוק במקום הלא נכון גרוע מאין צבע בכלל. הזהות נאכפת ב-tests/63 על כל המאגר,
   ולא נשמרת בזכות תשומת לב. `.filter(s=>norm(s))` הוא בן הזוג של `.filter(Boolean)` למעלה. */
function meaningSegsRaw(meaning){
  const MARKER=/^(?:ו?גם|ו?בפרט|ו?בהשאלה|וכן|כגון|לדוגמה|למשל|להיפך|או)$/;
  const parts=String(meaning).replace(/\([^)]*\)/g,' ')
    .split(/[,;/|]|\s-\s|(?<!\.)\.(?!\.)|:/)
    .map(s=>s.trim()).filter(Boolean);
  const kept=parts.filter(s=>!MARKER.test(s));
  return (kept.length?kept:parts).filter(s=>norm(s));
}
/* כמה פירושים הלומד כבר נתן. sensesLeft מחזיר כמה חסר עד התקרה; זה החצי השני. */
function sensesGot(term, meaning){
  const n=senseCount(meaning); if(n<2) return 0;
  const r=stats.words[K(term)];
  return (r && Array.isArray(r.sens)) ? r.sens.filter(i=>i<n).length : 0;
}
/* הפירושים כשרשרת, מה שכבר נכתב בירוק והחסר בשחור.
   זו התשובה ל"למה המילה הזאת עדיין ברשימת החיזוק" בלי לפתוח קטגוריה חדשה: רשימת
   המילים כבר עמוסה, והצבע נושא את המידע במקום עוד תווית. מילה עם פירוש אחד מוחזרת
   כטקסט רגיל · אין שם מה לצבוע, וצבע בלי משמעות מלמד להתעלם ממנו. */
function senseChips(term, meaning){
  const raw=meaningSegsRaw(meaning);
  if(raw.length<2) return esc(meaning);
  const r=stats.words[K(term)];
  const got=(r && Array.isArray(r.sens)) ? r.sens : [];
  return raw.map((s,i)=>`<span class="sns${got.includes(i)?' got':''}">${esc(s)}</span>`)
            .join('<span class="snsep">·</span>');
}
/* הדרישה לשני פירושים, מוצגת **גם על תשובה שגויה** · וזה כל החידוש.
   עד עכשיו היא הייתה עטופה ב-`ok`, כלומר מי שטעה לא ראה אותה אף פעם. ובדיוק הוא זה
   שהמילה שלו נתקעת: 64.5% מהמילים בעברית ו-43% באנגלית נושאות שני פירושים ומעלה,
   וביחידה 1 בעברית זה 113 מתוך 190. הלומד ראה מילים חוזרות לחיזוק בלי שום הסבר.

   ההסבר המלא מוצג פעם אחת בלבד. חזרה עליו בכל כרטיס הופכת אותו לרעש שמדלגים עליו,
   וזה גם מה שמייתר את הפעם הראשונה. */
function senseNeedBlock(w){
  /* ⚠ מיידע, ואינו דורש (7.8.2026). הנוסח הקודם התנה את שליטת הלומד במילה במסירת
     פירוש שני, וזו הבטחה שכבר אינה נכונה מאז שתקרת הרמה בוטלה ב-commitSession.
     טקסט שמתאר מנגנון שבוטל גרוע מאין טקסט.
     (הניסוח כאן נמנע מהמחרוזת שהבדיקה ב-tests/63 אוסרת · היא נבדקת על כל גוף
     הפונקציה, ולכן גם הערה שמצטטת את הנוסח הישן הייתה מפילה אותה.) */
  const n=senseCount(w.meaning);
  if(n<2) return '';
  const line=`למילה הזאת ${n} פירושים`;
  let intro='';
  if(!LS.get('hw_sense_intro2', false)){
    LS.set('hw_sense_intro2', true);
    intro='<div class="sense-intro">די בפירוש אחד נכון. <b>הירוק</b> הוא מה שכבר נתת</div>';
  }
  return `<div class="also sense-need" id="senseNeed">${line}${intro}</div>`;
}
/* רושם את הפירוש שנכתב. saveStats לא נקרא כאן · commitSession שומר בסוף הסבב ממילא,
   ושמירה לכל תשובה הייתה כותבת לדיסק עשרים פעם בסבב. */
function noteSense(w, typed){
  const segs=meaningSegs(w.meaning);
  if(segs.length<2) return;
  const a=norm(typed);
  /* נופל חזרה על אותה סובלנות לתחילית ש-meaningMatch מקבלת. בלי זה נוצר בדיוק הבאג
     שתוקן ב-tests/62 מהכיוון השני: התשובה מתקבלת כנכונה, אבל אף פירוש אינו מזוכה,
     ולכן sensesLeft נשאר גדול מאפס והמילה נשארת ברשימת החיזוק לנצח. מה שמתקבל
     כנכון חייב להיות מזוכה. */
  let i=segs.indexOf(a);
  if(i<0) i=segs.findIndex(s=>particleMatch(a, s));
  /* שיקוף חובה של שלוש השכבות ש-meaningMatch הוסיפה. זה אינו ייעול אלא האינווריאנט
     של tests/62: מה שמתקבל כנכון חייב להיות מזוכה. תשובה שהתקבלה ולא זוכתה משאירה
     את sensesLeft גדול מאפס, והמילה נתקעת ברשימת החיזוק לנצח · בדיוק הבאג שדווח.
     אותם פרמטרים ואותו nearMatch, כדי שהקבלה והזיכוי יחשבו את אותו אינדקס. */
  if(i<0 && TYPO_GLOSS_RULES.splitOr && typoSplitOr(segs).has(a))
    i=segs.findIndex(s=>typoSplitOr([s]).has(a));
  if(i<0 && TYPO_GLOSS_RULES.synonyms){
    const c=typoCanon(a);
    i=segs.findIndex(s=>typoCanon(s)===c);
  }
  if(i<0 && nearMatch(a, segs, 'he', TYPO_PARAMS.gloss, SEG_VETO, typoOwners(w.meaning, w)).ok){
    /* הפירוש הקרוב ביותר במרחק לא-ממושקל. nearMatch מכריעה **אם** מקבלים, וזה מכריע
       **את מי** מזכים · אותה שאלה שיש לה תשובה אחת רק כשמודדים אותה באותה יחידה. */
    let bd=Infinity;
    segs.forEach((s,k)=>{ const d=editDist(a,s); if(d<bd){ bd=d; i=k; } });
  }
  if(i<0) return;                          // נכון, אבל לא כאחד הפירושים הרשומים
  const r=rec(w.term);
  const s=Array.isArray(r.sens)?r.sens:[];
  if(!s.includes(i)){ s.push(i); r.sens=s.slice(0,8); }
}
/* מרחק עריכה, על שני מיתרים קצרים בלבד · הפירושים של ערך אחד. */
function editDist(a,b){
  if(a===b) return 0;
  const m=a.length, n=b.length;
  if(!m||!n) return m||n;
  let prev=Array.from({length:n+1},(_,j)=>j), cur=new Array(n+1);
  for(let i=1;i<=m;i++){
    cur[0]=i;
    for(let j=1;j<=n;j++)
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    [prev,cur]=[cur,prev];
  }
  return prev[n];
}
/* הזיכוי שמאחורי "בעצם ידעתי".
 *
 * noteSense מזכה רק בהתאמה מדויקת, ולכן שגיאת כתיב לא זוכתה לעולם. עבור 43% מהמילים
 * באנגלית ו-65% בעברית · אלה שנושאות יותר מפירוש אחד · התקרה ב-commitSession נשארה 2,
 * weakCards דורש 3, והמילה נתקעה ברשימת החיזוק לצמיתות. זה בדיוק מה שדווח: "לא יורד
 * לאחר 3-4 פעמים למרות שכביכול אני כבר שולט בה".
 *
 * שלושה שלבים, מהמדויק למקל:
 *   1. התאמה מדויקת · כמו noteSense.
 *   2. הפירוש הקרוב ביותר במרחק עריכה, עד שליש מאורכו. הסיכון להתאמה שגויה זניח כאן
 *      ולא כמו ברעיון "כמעט נכון" שנפסל בזמנו: המועמדים אינם המאגר כולו אלא שניים עד
 *      ארבעה פירושים של אותו ערך.
 *   3. אין קרבה · הפירוש הראשון שטרם זוכה. הלומד הצהיר שידע; לא לזכות אותו בכלום פירושו
 *      לכלוא את המילה בלי שום מוצא, וזה הבאג עצמו.
 *
 * התקרה עצמה נשארת. מי שיודע פירוש אחד מתוך שלושה אינו שולט במילה · זו הייתה בקשה מפורשת. */
function creditSense(w, typed){
  const segs=meaningSegs(w.meaning);
  if(segs.length<2) return;
  const r=rec(w.term);
  const s=Array.isArray(r.sens)?r.sens.slice():[];
  const a=norm(typed||'');
  let i=segs.indexOf(a);
  if(i<0 && a){
    let best=-1, bd=Infinity;
    segs.forEach((seg,k)=>{ const d=editDist(a,seg); if(d<bd){ bd=d; best=k; } });
    if(best>=0 && bd<=Math.max(1, Math.floor(segs[best].length/3))) i=best;
  }
  /* אין שלב שלישי, ובכוונה. הגרסה הראשונה של הפונקציה הזאת זיכתה בפירוש הראשון שטרם ניתן
     כשהטקסט לא התאים לאף פירוש · ומדידה הראתה שזה יוצר מצב הפוך לגמרי מהכוונה: לומד
     שכותב שוב את הפירוש שהוא יודע אינו מזוכה בכלום (הפירוש כבר זוכה), ומי שכותב שטויות
     כן מזוכה (שטויות אינן מתאימות לאף פירוש ולכן נפלו לשלב ההוא).
     התיקון הנכון אינו לזכות גם על חזרה · שתי לחיצות היו פותחות את התקרה, והתקרה קיימת
     בדיוק כדי שידיעת פירוש אחד לא תיחשב שליטה. זו הייתה בקשה מפורשת.
     מי שיודע את המילה ורוצה שיפסיקו לשאול אותו עליה · יש לו "ידעתי" בניהול מילים (v147),
     שמסמן ישירות ולא דרך ניחוש איזה פירוש התכוון אליו.
     מה שנשאר כאן הוא הבאג המקורי בלבד: noteSense מזכה רק בהתאמה מדויקת, ולכן תשובה נכונה
     עם שגיאת כתיב לא זוכתה לעולם. שלב 2 סוגר בדיוק את זה. */
  if(i<0) return;
  if(!s.includes(i)){ s.push(i); r.sens=s.slice(0,8); }
}
let acceptedAlt=null;      // set when the answer was a different word with the same gloss
/* נדלק כשהשכבה הפאזית פסלה בגלל התנגשות · המוקלד הוא מילה אחרת במאגר.
   הסמנטיקה מדויקת ומצומצמת בכוונה: הדגל משמעותי רק כשהפסק הסופי שגוי. בלולאת
   glossAlts מועמד מוקדם יכול להדליק אותו ומועמד מאוחר להתקבל, ואז הוא נבלע ·
   ההודעה מרונדרת רק בענף השגוי. איפוס ב-check, קרא-ונקה ב-finishCard: skip והמבחן
   עוקפים את check לגמרי, ודגל שנשאר דלוק מהם היה מרנדר הודעה על כרטיס אחר. */
let typoVeto=false;
function check(){
  if(answered||!deck[idx]) return;
  const w=deck[idx], v=$('#answerInput').value;
  /* שדה ריק אינו תשובה. Enter מוחזק לחוץ: ההקשה הראשונה עונה, השנייה מגיעה ל-#nextBtn
     שקיבל פוקוס ועוברת לכרטיס הבא, והשלישית נוחתת על #answerInput שהוחזר לו פוקוס אחרי
     30ms · ומסמנת כרטיס כשגוי בלי שהלומד ראה אותו. isCorrect('') מחזיר false, ולא היה
     שום שער לפניו. החזקת Enter שרפה כך חצי מהחפיסה. */
  if(!String(v).trim()) return;
  acceptedAlt=null;
  typoVeto=false;
  if(w._dir==='w2m'){
    const ok=meaningMatch(v, w.meaning, w);
    /* נרשם כאן ולא ב-commitSession: כאן יש את מה שהלומד הקליד. commitSession רואה רק
       "נכון/לא נכון", ומשם אי אפשר לדעת איזה פירוש הוא נתן. */
    if(ok) noteSense(w, v);
    finishCard(ok, false); return;
  }
  if(isCorrect(v, w.term)){ finishCard(true, false); return; }
  /* Same meaning, different word. Accepted -- and the card's own word is named in the feedback,
     because the point of the round is still to learn THIS entry. */
  const alt=glossAlts(w).find(t=>isCorrect(v, t));
  if(alt){ acceptedAlt=alt; finishCard(true, false); return; }
  finishCard(false, false);
}
function skip(){ if(answered||!deck[idx]) return; finishCard(false, true); }

/* משפט הדוגמה · שלוש שורות: תווית · המשפט באנגלית · התרגום.
   מוצג רק אחרי שהכרטיס נסגר: בכיוון פירוש→מילה המשפט מכיל את התשובה, ולכן לפני
   המענה הוא היה מסגיר אותה. bdi+dir כי משפט אנגלי בתוך מסך RTL. הערך הוא
   [משפט, תרגום], ובשניהם המילה הנלמדת עטופה ב-<b> על ידי המחולל. */
function exSentHtml(term){
  const r = (window.EX_SENT_EN||{})[term];
  if(!r) return '';
  return `<div class="also ex-sent"><span class="ex-lbl">משפט לדוגמה</span>`
    + `<span class="ex-en"><bdi lang="en" dir="ltr">${exBold(r[0])}</bdi></span>`
    + `<span class="ex-he">${exBold(r[1])}</span></div>`;
}

/* ⛔ הבאג שזה מתקן, ומשתמש דיווח עליו: "לא לכל מילה יש משפט, אבל להרוב".
   הדאטה שלמה · 3,946 מתוך 3,946 · ולא חסרה בה אף מילה. מה שחסר היה **הזמן**:
   `data-en-sentences.js` הוא 706KB שנטענים ברקע בכניסה לאנגלית (fire-and-forget),
   וההגשה בדקה את `window.EX_SENT_EN` **סינכרונית**. מי שענה על הכרטיסים הראשונים
   לפני שהקובץ ירד לא ראה משפט, והכרטיס לא רונדר מחדש כשהוא הגיע. לכן זה נראה
   כמו חור בתוכן, והיה מירוץ רשת · ומספר המילים "החסרות" השתנה לפי מהירות הקו.
   ⚠ ההערה הקודמת כאן העריכה את הקובץ ב-300KB. הוא 706KB, יותר מפי שניים.

   התיקון לא חוסם את ההגשה על הרשת: הכרטיס נפתח מיד, ומוזרק לו עוגן ריק. כשהקובץ
   מגיע, `fillExSent` ממלא את העוגן · אבל רק אם הלומד עדיין על אותו כרטיס, ולכן
   `data-term` נבדק מול המילה הנוכחית ולא רק נוכחות האלמנט. */
function exSentBlock(term){
  if(LANG!=='en') return '';
  if(window.EX_SENT_EN) return exSentHtml(term);
  return `<div id="exSentSlot" data-term="${esc(term)}"></div>`;
}
function fillExSent(term){
  if(LANG!=='en' || window.EX_SENT_EN) return;
  loadExSentData().then(()=>{
    const slot = document.getElementById('exSentSlot');
    if(slot && slot.dataset.term === term) slot.outerHTML = exSentHtml(term);
  });
}

function finishCard(ok, skipped){
  const w=deck[idx]; if(!w) return;
  /* קרא-ונקה, ובשורה הראשונה: skip() והמבחן מגיעים לכאן בלי לעבור ב-check, ולכן
     דגל שלא נוקה כאן היה נשאר דלוק לכרטיס הבא. */
  const vetoed=typoVeto; typoVeto=false;
  answered=true;
  const w2m = w._dir==='w2m';
  $('#answerInput').disabled=true; hide($('#answerActions'));
  $('#hintBtn').classList.add('hidden'); $('#hintBox').classList.add('hidden');
  // The card is over, so the English word can be read out in either direction now.
  bindSay('#qSay', w.term);
  const e=sess(w); e.attempts++;
  if(ok){ correct++; e.mastered=true; if(e.attempts===1)e.firstTry=true; }
  else { missed.push(w); }
  /* מונה הדחיות · כבוי כברירת מחדל, ואצל כל מי שלא הדליק diagReject יוצא לפני
     שהוא נוגע באחסון. נרשמת רק דחייה של תשובה שהוקלדה: דילוג אינו דחייה.
     המזהה נשמר כאן כי הכפתור "בעצם ידעתי", שנקשר בהמשך הפונקציה, מסמן בעזרתו
     בדיוק את הרשומה הזאת. */
  const diagId = (!ok && !skipped) ? diagReject(w, $('#answerInput').value, w2m) : 0;
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
       if(!rest.length) return '';
       /* השורה השנייה קיימת כי הראשונה לבדה לא עבדה. "גם: X · Y" הוצג, הלומד קרא וסגר,
          והמילה נספרה כנלמדה · בדיוק התלונה שהגיעה ממשתמש. עכשיו נאמר במפורש שהיא לא
          נספרה, וכמה חסר. המספר הוא מה שהופך את זה מהערה לדרישה. */
       /* שורת הדרישה עצמה עברה ל-senseNeedBlock, כי כאן היא הייתה עטופה ב-ok · כלומר
          הלומד שטעה, בדיוק זה שהמילה שלו נתקעת תחת התקרה, לא ראה אותה מעולם. */
       return `<div class="also">גם: <b>${esc(rest.join(' · '))}</b></div>`;
     })() : '')+
    /* Answered with a different word that carries the same gloss. Counting it wrong would be
       false; counting it silently right would leave the card's own word unlearned. */
    (ok && acceptedAlt
      ? `<div class="also">גם <b><bdi>${esc(acceptedAlt)}</bdi></b> נכון לפירוש הזה.
         הכרטיס הזה הוא <b><bdi>${esc(w.term)}</bdi></b>.</div>` : '')+
    /* בכיוון מילה→פירוש התשובה הנכונה היא רשימת הפירושים, ולכן היא נצבעת: מה שכבר נתת
       ירוק, מה שחסר שחור. בכיוון ההפוך התשובה היא מילה אחת ואין מה לפצל. */
    (!ok?`<div class="reveal">${label}: <b><bdi>${w2m?senseChips(w.term,answer):esc(answer)}</bdi></b></div>`:'')+
    /* הפסילה הזאת אינה "לא מדויק" סתם: המוקלד מתאים לערך אחר, ולכן הסובלנות אינה
       יכולה לקבל אותו בלי להמר בין שתי מילים. הלומד שידע צריך לדעת שיש לו מוצא,
       ולכן ההודעה מפנה לכפתור שכבר קיים מתחתיה. לא בדילוג ולא על תשובה נכונה. */
    (!ok && !skipped && vetoed
      ? `<div class="also typo-veto">מה שכתבת מתאים למילה אחרת במאגר.
         אם ידעת, לחץ "בעצם ידעתי · סמן כנכון"</div>` : '')+
    (w2m ? senseNeedBlock(w) : '')+
    /* The prompt hid the word inside its own gloss, and in this direction the gloss is never
       shown again -- so the example that made it worth reading would have been lost. Now that
       the card is over it can only teach, so it is restored in full. */
    (!w2m && maskTerm(w.meaning,w.term)!==w.meaning
      ? `<div class="also">הפירוש המלא: <b>${esc(w.meaning)}</b></div>` : '')+
    /* מוצג רק כאן, אחרי שהכרטיס נסגר: בכיוון פירוש→מילה המשפט מכיל את התשובה,
       ולכן לפני המענה הוא היה מסגיר אותה. bdi+dir כי משפט אנגלי בתוך מסך RTL.
       הערך הוא [משפט, תרגום], ובשניהם המילה הנלמדת עטופה ב-<b> על ידי המחולל.
       שלוש שורות ולא שורה אחת מתגלגלת: תווית · המשפט באנגלית · התרגום. בגרסה
       הקודמת התווית והמשפט האנגלי חלקו שורה, ובמסך צר האנגלית נשברה באמצע. */
    exSentBlock(w.term)+
    (!ok?`<button class="was-right" id="wasRight">בעצם ידעתי · סמן כנכון</button>`:'')+
    `<div class="assoc">
       <label>💡 האסוציאציה שלי ל"${esc(w.term)}"</label>
       <textarea id="assocInput" rows="2" placeholder="קישור/תמונה שיעזרו לזכור…">${esc(assoc[K(w.term)]||'')}</textarea>
       <div class="assoc-bar"><button id="assocSave">שמירה</button>
         <label class="shr"><input type="checkbox" id="assocShare"> שתף עם לומדים אחרים</label>
         <span class="st" id="assocSt"></span></div>
       <button class="assoc-peek" id="assocPeek">👀 מה אחרים כתבו על המילה הזאת</button>
       <div class="assoc-others hidden" id="assocOthers"></div>
     </div>
     <button class="del-live" id="delLive">🗑 אני מכיר את המילה · מחק מהמאגר</button>
     <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="nextBtn">${idx+1<deck.length?'הבא ←':'לסיכום'}</button></div>`;
  fb.classList.remove('hidden');
  fillExSent(w.term);   // ⛔ אחרי ההצגה, לא לפניה · הכרטיס לא ממתין לרשת
  /* The line above disabled #answerInput while it held the focus, and HTML says focus on an
     element that becomes disabled falls back to <body>. Measured: 6 Tab presses to get from
     <body> back to "הבא ←", every one of them passing over 🗑 "מחק מהמאגר" on the way · a
     destructive control standing between the learner and the only way forward, 20 times a round.
     WHY #nextBtn AND NOT #feedback: the usual advice is to focus the container of the new
     content so it gets read. Here that buys nothing · #feedback is already role="status"
     aria-live="polite", and the audit verified in Chromium that the verdict reaches the
     accessibility tree through it whether or not focus is inside. So the verdict is spoken
     either way, and the focus can go where it is actually useful: the one control that
     continues the round. Tab count drops from 6 to 0, "בעצם ידעתי" and the delete button move
     BEHIND the caret (Shift+Tab) instead of in front of it, and Enter-Enter becomes the whole
     loop. Enter cannot skip the feedback by accident: the keydown that submitted the answer was
     preventDefault-ed on the input (app.js, #answerInput keydown), so it never reaches here. */
  $('#nextBtn').focus();
  let shareKnown=false;        // has the share state been read back successfully?
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
         out" -- and acting on it deleted a share nobody asked to delete. */
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
       had shared · while the UI said "נשמר ✓". Exactly the bug pullProgress already had. */
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
    if(!r.ok){ box.textContent='לא ניתן לטעון כרגע. בדוק את החיבור לרשת ונסה שוב'; return; }
    box.innerHTML = r.rows.length
      ? r.rows.map(x=>`<div class="oth">${esc(x.text)}</div>`).join('')
      : '<div class="oth empty">אין עדיין אסוציאציות משותפות כאן. שתף את שלך.</div>';
  };

  /* "בעצם ידעתי" הוא מתג, לא פעולה חד-כיוונית.
     קודם הוא עשה wr.remove() · לחיצה אחת ונעלם, ומי שלחץ בטעות (או הבין רגע אחרי
     שדווקא לא ידע) נשאר עם כרטיס מסומן כנכון בלי שום דרך לחזור. מסך הסיכום כבר איפשר
     לתקן דרך .rev-chip, אבל רק אחרי שהסבב נגמר · והטעות קורית כאן.
     הביטול חייב להחזיר את כל מה שהלחיצה שינתה, ולא רק את הטקסט:
       · correct ו-missed · אחרת הניקוד על המסך והרשימה "מה פספסתי" מתפצלים מהאמת.
       · e.mastered / e.firstTry · הם מה ש-commitSession קורא בפועל.
       · r.sens · creditSense כותב לזיכרון הקבוע מיד, ולכן שומרים עותק לפני ומשחזרים
         אותו. בלי זה ביטול היה משאיר פירוש מזוכה שהלומד מעולם לא נתן, והמילה הייתה
         מטפסת לעבר "נלמדה" על סמך לחיצה שבוטלה. */
  const wr=$('#wasRight');
  if(wr){
    const vd=document.querySelector('.verdict');
    const vdText=vd?vd.textContent:'', vdClass=vd?vd.className:'verdict no';
    let marked=false, sensBefore=null;
    wr.onclick=()=>{
      marked=!marked;
      diagMark(diagId, marked);        // מדד ה-override rate · ראה "מונה דחיות"
      if(marked){
        correct++;
        const i=missed.indexOf(w); if(i>=0) missed.splice(i,1);
        e.mastered=true; e.firstTry=(e.attempts===1);
        /* הצהרת ידיעה מפורשת. commitSession מרים בזכותה את תקרת הפירושים · creditSense
           לבדו אינו מספיק, כי הוא מזכה רק בהתאמה מדויקת או קרובה, ותשובה "נכונה אבל
           אחרת" נופלת מחוץ לסף. ראה tests/62. */
        e.declared=true;
        /* בלי זה מילה רב-משמעית נשארת ברשימת החיזוק לצמיתות: התקרה ב-commitSession היא 2
           כל עוד sensesLeft>0, ו-weakCards דורש 3. ראה tests/35. */
        if(w._dir==='w2m'){
          sensBefore=(rec(w.term).sens||[]).slice();
          creditSense(w, $('#answerInput').value);
        }
        wr.textContent='סומן כנכון ✓ · לחץ לביטול';
        wr.classList.add('on');
        /* מרגע ההצהרה התקרה הוסרה (ראה commitSession), ולכן "נדרשים שני פירושים" הפך
           לשקר. להשאיר אותו על המסך היה סותר בדיוק את מה שהלחיצה עשתה. */
        { const sn=$('#senseNeed'); if(sn) hide(sn); }
        if(vd){ vd.textContent='סומן כנכון ✓'; vd.className='verdict ok'; }
      } else {
        correct=Math.max(0, correct-1);
        if(!missed.includes(w)) missed.push(w);
        e.mastered=false; e.firstTry=false; e.declared=false;
        if(sensBefore){ rec(w.term).sens=sensBefore.slice(); sensBefore=null; }
        wr.textContent='בעצם ידעתי · סמן כנכון';
        wr.classList.remove('on');
        { const sn=$('#senseNeed'); if(sn) show(sn); }
        if(vd){ vd.textContent=vdText; vd.className=vdClass; }
      }
      $('#qLive').textContent=`✓ ${correct}`;
    };
  }
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
  maybeAskWtp();
}

/* ===== where this round leaves you in the unit =====
   The score alone answers "how did I do just now" and says nothing about "how far am I". A
   learner could practise the same unit for a month without ever being told they had covered it.
   Language-agnostic on purpose: classify() and scopeWords() already work off LANG, so Hebrew
   and English get this from the same code and can never drift apart.
   Counted BEFORE commitSession runs on this screen? No -- commitSession has already run by the
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
  /* הניסוח שחגי ביקש (5.8.2026): "בסבב הזה היו X מילים חדשות שלא תרגלת לפני.
     ב-X אתה כבר שולט."
     "שולט" ולא "עלו לחוזק מלא" · "בשליטה" הוא המונח שהאפליקציה משתמשת בו בכל מקום אחר
     (up-keys ממש מתחת), ומונח נרדף מחייב את הקורא לתרגם.
     שלוש הרכבות ולא צירוף אחד: "בסבב הזה ב-3 אתה כבר שולט" אינו משפט, ולכן כשאין מילים
     חדשות המשפט נבנה אחרת לגמרי במקום להידבק לרישא.
     וצורת היחיד נכתבת במפורש · "1 מילים חדשות" הוא בדיוק ההבדל בין הודעה אישית
     להודעה אוטומטית. */
  let gainHtml='';
  const newTxt   = newlyMet===1   ? 'מילה חדשה אחת שלא תרגלת לפני'
                                  : `<b>${newlyMet}</b> מילים חדשות שלא תרגלת לפני`;
  const solidTxt = newlySolid===1 ? 'במילה אחת אתה כבר שולט'
                                  : `ב-<b>${newlySolid}</b> אתה כבר שולט`;
  const opener = newlyMet===1 ? 'בסבב הזה הייתה ' : 'בסבב הזה היו ';
  if(newlyMet && newlySolid) gainHtml = opener + newTxt + ' · ' + solidTxt;
  else if(newlyMet)          gainHtml = opener + newTxt;
  else if(newlySolid)        gainHtml = newlySolid===1
    ? 'בסבב הזה מילה אחת עלתה לשליטה'
    : `בסבב הזה <b>${newlySolid}</b> מילים עלו לשליטה`;

  /* ציון דרך. הסבב מספר כמה ידעת עכשיו, והפס מספר כמה נשאר · אבל אף אחד מהם לא אומר
     "עברת נקודה שלא עברת קודם". זה מה שהופך שלושה חודשים של תרגול לרצף של רגעים ולא
     לפס שזז לאט.
     נבדק על המספר שלפני הסבב ואחריו, ולכן הוא נאמר פעם אחת בדיוק: מי שחצה 50 היום לא
     יראה את זה שוב מחר. וזה נגזר מהמצב האמיתי · אין מונה נפרד שיכול לצאת מסנכרון עם
     מה שהלומד באמת יודע.
     בכוונה בתוך הכרטיס הקיים ולא כמסך חדש: מסך שקופץ באמצע נסגר מהר וגם מפריע. */
  const solidNow=c.strong, solidBefore=c.strong-newlySolid;
  const STEPS=[10,25,50,100,200,400,800];
  const crossed=STEPS.filter(n=>solidBefore<n && solidNow>=n).pop();

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
      ${crossed?`<div class="up-mile">🏅 <b>${crossed} מילים בשליטה</b> · עברת את הרף הזה עכשיו</div>`:''}
      ${gainHtml?`<div class="up-gain">${gainHtml}</div>`:''}
      ${allSolid ? `<div class="up-done">🎉 סיימת את ${esc(title)} · כל המילים בשליטה</div>`
        : allMet ? `<div class="up-done">✓ פגשת את כל ${c.total} המילים ב${esc(title)}. נשארו ${c.weak} לחזק.</div>`
        : ''}
    </div>`;

  /* Closing a whole unit is the biggest thing that happens in this app, and until now it was a
     line of text inside a card the learner had to notice. Once -- the first time a unit turns
     solid -- it gets the screen. Never again for that unit: a celebration that repeats every
     visit stops being one, and starts being something to dismiss. */
  if(allSolid) celebrateUnit(scope, title, c.total);
}

/* Written in the app's own palette rather than the usual confetti primaries: gold, rust and the
   deep green the "בשליטה" key already uses. Fired from the two lower corners, the way real
   fireworks are seen · from below. */
const CHEERS = [
  ['יחידה שלמה.', 'כל המילים ביחידה בשליטה.'],
  ['סגרת אותה.', 'עברת את כל המילים ביחידה.'],
  ['הכול בשליטה.', 'היחידה כולה תורגלה.'],
  ['נגמרה היחידה.', 'אפשר לעבור ליחידה הבאה.'],
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
    // one burst every ~16 frames, then let the last shell fall and STOP -- this is a moment,
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
  /* מה שטעית בו · למעלה.
     הרשימה הוצגה בסדר החפיסה, כלומר בסדר אקראי, והמילים שדורשות תשומת לב היו מפוזרות
     בין עשרים שורות. בסבב של 20 מילים עם 3 טעויות, השלוש האלה הן כל תוכן המסך ·
     והן היו יכולות לשבת בשורות 7, 12 ו-19.
     הסדר נקבע פעם אחת, כאן, ולא מתעדכן בלחיצה על .rev-chip: שורה שקופצת ממקומה בזמן
     שהאצבע עליה היא בדיוק הדרך לגרום למישהו ללחוץ על השורה הלא נכונה. הצבע משתנה
     במקום, המיקום נשאר. */
  const ordered=[...deck].sort((a,b)=>(verdictOf(a.term)?1:0)-(verdictOf(b.term)?1:0));
  /* רמקול על מה שנטעה. הבקשה הייתה "שיהיה אפשר לשמוע את המילים שטעית בהן", ולכן הוא
     נתלה רק על שורות שגויות: 20 רמקולים על 20 שורות היו מטביעים את השלוש שחשובות,
     בדיוק כמו שהסדר האקראי הטביע אותן לפני שמוינו כאן.
     LANG==='en' ולא TTS.available() לבדו · TTS.pick בוחר קול אנגלי בלבד, ובמאגר העברי
     כפתור כזה היה מבטא מילה עברית באנגלית. אותו נימוק שכבר כתוב מעל bindSay.
     כמו הסדר, גם הרמקול נקבע כאן פעם אחת ואינו זז בלחיצה על ה-chip. ראה tests/65. */
  const canSay = LANG==='en' && TTS.available();
  list.innerHTML=ordered.map(w=>{
    const ok=verdictOf(w.term);
    return `<div class="rev-row ${ok?'':'wrong'}" data-t="${esc(w.term)}">
      <div class="rev-w"><b>${esc(w.term)}</b><span>${senseChips(w.term, w.meaning)}</span></div>
      ${canSay && !ok ? '<button class="say rev-say" title="השמע את המילה" aria-label="השמע את המילה">🔊</button>' : ''}
      <button class="rev-chip ${ok?'ok':'no'}">${ok?'✓ ידעתי':'✗ לא ידעתי'}</button></div>`;
  }).join('');
  list.querySelectorAll('.rev-say').forEach(btn=>{
    btn.onclick=(e)=>{ e.preventDefault(); TTS.say(btn.closest('.rev-row').dataset.t, btn); };
  });
  list.querySelectorAll('.rev-chip').forEach(chip=>{
    chip.onclick=()=>{
      const row=chip.closest('.rev-row'); const term=row.dataset.t;
      const e=session.get(K(term)); if(!e) return;
      const nowOk=!e.mastered;
      /* אותה הצהרה בדיוק כמו "בעצם צדקתי", רק מהדלת השנייה · מסך הסיכום. בלי e.declared
         כאן, תיקון שנעשה מכאן היה משאיר את המילה תחת תקרת הפירושים והיא הייתה חוזרת
         לחיזוק, כלומר אותו באג עם שער אחר. ראה tests/62. */
      e.mastered=nowOk; e.firstTry=nowOk; e.declared=nowOk; if(nowOk && e.attempts<1) e.attempts=1;
      row.classList.toggle('wrong', !nowOk);
      chip.className='rev-chip '+(nowOk?'ok':'no');
      chip.textContent=nowOk?'✓ ידעתי':'✗ לא ידעתי';
      refreshResultCounts();
    };
  });
}
/* `committed` used to be a one-way latch, cleared only in startRound. But visibilitychange
   commits mid-round -- so on a phone, the first incoming notification committed the 3 words
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
    /* הוצג ולא נענה. הלומד נפגש עם המילה · ולכן seen עלה למעלה · אבל הוא לא ענה תשובה
       שגויה, הוא לא ענה בכלל. לרשום כאן wrong ולהוריד level היה מעניש אותו על סגירת
       האפליקציה ודוחף את המילה לרשימת החיזוק בלי שום ראיה שהיא חלשה. */
    if(e.attempts===0){ r.last=now; return; }
    /* ⭐ רגע הלמידה · המפגש הראשון שבו הלומד **ענה** ולא ידע.
       virgin ולא wasNew: wasNew נשען על seen, ו-seen עולה גם על כרטיס שהוצג ונסגרה
       האפליקציה · כלומר מילה שהלומד מעולם לא ענה עליה כבר אינה "חדשה". שלושת מוני
       המענה הם מה שבאמת אומר "אף פעם לא ענית על זה".
       התנאי מגיע **אחרי** ה-return של attempts===0, ולכן דילוג-בלי-מענה אינו למידה ·
       אבל "לא יודע" כן: skip() קורא ל-finishCard שמעלה attempts. זו ההכרעה הנכונה,
       "לא יודע" הוא בדיוק ההודאה שהמילה לא ידועה.
       sticky · נכתב פעם אחת. בלי זה כל טעות חוזרת הייתה מאפסת את התאריך והרשימה
       הייתה מסודרת לפי הטעות האחרונה במקום לפי הלמידה הראשונה. */
    if(!r.t0 && (r.first + r.ever + r.wrong) === 0 && !(e.mastered && e.firstTry)) r.t0 = now;
    if(e.mastered && e.firstTry){                     // knew it (correct on first attempt of the round)
      r.first++; r.ever++;
      // a retry of a word just missed proves short-term recall, not knowledge: credit it, but
      // never let it climb past where the word already stood before the round began
      /* ⚠ תקרת שני הפירושים בוטלה (7.8.2026, הכרעת חגי).
         מה שהיה: מילה עם כמה פירושים נחסמה ברמה 2 עד שנמסר פירוש שני, ולכן לא נחשבה
         נלמדה. הכוונה הייתה למנוע "עונים פירוש אחד ושוכחים את השאר".
         מה שקרה בפועל: **64.5% מהמילים בעברית נושאות שני פירושים ומעלה**, וביחידה 1
         זה 113 מתוך 190 · כלומר רוב המאגר נתקע ברמה 2 וחזר לחיזוק שוב ושוב.
         חגי: "זה מאוד מאוד מקשה על ללמוד את המילים ולהתקדם".
         מה שהוחלט: **תשובה נכונה בפעם הראשונה מספיקה כדי שהמילה תיחשב נלמדה**, גם
         כשיש לה כמה פירושים. שאר הפירושים ממשיכים להיות **מוצגים** · otherSenses
         אחרי תשובה נכונה, ו-senseChips ברשימה · אבל אינם **נדרשים**.
         כלומר: המידע נשמר, החובה ירדה. */
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
  /* THE ROW IS FOUND BY ID, NOT BY POSITION.
     This used to hold a numeric index into stats.sessions -- and mergeProgress rebuilds that array
     from scratch: it concatenates both sides, dedupes, SORTS by time and slices to the cap. A sync
     landing mid-round therefore moved the row out from under the pointer, and the next commit of
     the same round grew SOMEBODY ELSE'S round: adding today's answers to it and dragging its date
     to today. One practice day vanishes from the log and the streak breaks -- on a single device
     with a perfectly correct clock. Two independent passes of house-check 2 found this.

     `rid` is the first commit's timestamp plus the scope and mode, so it is derived rather than
     random: deterministic for tests, stable across a merge, and unique in practice because a
     round takes seconds and cannot start twice in the same millisecond under the same scope. */
  const rid=sessionRowId;
  const row=rid ? stats.sessions.find(s=>isObj(s) && s.rid===rid) : null;
  if(row){
    row.t=now; row.total+=entries.length; row.correct+=c;
    row.firstTry+=ft; row.struggled+=st; row.newCount+=nw;
  } else {
    /* No row, either because this is the round's first commit or because the round's row has
       already been trimmed out of history. Starting a fresh one is the honest answer to both:
       the alternative -- reviving an index -- is what pointed at a stranger. */
    sessionRowId=now+'|'+sessionScope+'|'+sessionMode;
    stats.sessions.push({rid:sessionRowId, t:now, scope:sessionScope, mode:sessionMode,
                         total:entries.length, correct:c, firstTry:ft, struggled:st, newCount:nw});
  }
  // no index to repair afterwards: the trim can drop whatever it likes and the lookup still holds
  if(stats.sessions.length>MAX_SESSIONS) stats.sessions=stats.sessions.slice(-MAX_SESSIONS);
  saveStats();
  /* The end of a round is the moment real progress exists, and the one moment worth spending a
     round trip on. Pushing here is what lets the per-answer debounce be long: a phone killed by
     the OS without firing pagehide loses at most the round in progress, never a finished one. */
  flushRemoteSync();
  /* Refresh the numbers the reminder is built from. Written after every round rather than once
     when permission was granted -- otherwise the worker keeps announcing a streak that ended and
     the "two days away" rule can never fire, because `last` never moves. */
  // guarded: committing a round is core, notifications are peripheral, and core must not throw
  // because a peripheral is missing -- which is exactly what happened to every bucket test
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
$('#hintBtn').onclick=()=>{ const w=deck[idx]; if(!w) return; const a=assoc[K(w.term)]; const b=$('#hintBox'); b.textContent=a?('💡 '+a):'עדיין לא כתבת אסוציאציה למילה הזו. תוכל להוסיף אחרי שתענה.'; b.classList.remove('hidden'); };
/* שמירת הסבב עברה ל-navTo, שהוא המסלול שכל יציאה עוברת בו · כך "אחורה" של המערכת
   וה-✕ שומרים בדיוק אותו דבר, ואי אפשר לתקן אחד ולשכוח את השני. */
$('#quitQuiz').onclick=()=>goBack();
/* Retrying the words you just missed must not undo the miss. startRound commits the (corrected)
   session first, so the retry begins with attempts===1 and counted as "knew it first try" -- 
   handing back the level the mistake had just taken away, ten seconds after the answer was
   shown on screen. The round is now flagged so the retry can restore at most what was lost. */
$('#retryMissedBtn').onclick=()=>startRound(missed.slice(), sessionScope, sessionMode, true);
$('#resBackBtn').onclick=()=>goBack();
$('#resScope').onclick=()=>goBack();
/* מעבר למסך שהיסטוריית הדפדפן מצביעה עליו, עם כל הניקוי ששייך למסך שעוזבים.
   זהו המסלול היחיד שדרכו יוצאים ממסך עמוק · גם ב"אחורה" של המערכת וגם בכפתורי
   החזרה שבאפליקציה · ולכן שמירת הסבב נמצאת כאן, פעם אחת, ולא בכל כפתור בנפרד. */
function navTo(id){
  /* מבחן שהתחיל ולא הושלם הוא הדבר היחיד שיציאה ממנו מאבדת לגמרי, ולכן זו הפעם היחידה
     שנעצור לשאול. התנאי הוא #exQuiz ולא #exam: הכפתור ✕ יושב ב-topbar, מחוץ ל-#exQuiz,
     ולכן הוא נלחץ גם ממסך התוצאות · ושם המבחן כבר נשמר, והשאלה הייתה מטעה.
     ביטלו? מחזירים את רשומת ההיסטוריה שנצרכה, ונשארים במקום. */
  if(!$('#exQuiz').classList.contains('hidden') &&
     !confirm('לצאת מהמבחן? רק מבחן שהושלם נכנס להיסטוריית הציונים. מבחן שנעצר באמצע יתחיל מחדש בפעם הבאה.')){
    if(!navPop) return;                       // לחיצה על כפתור: ההיסטוריה לא זזה
    try{ history.pushState({scr:'exam'}, ''); }catch(e){}
    return;
  }
  if(!$('#quiz').classList.contains('hidden') || !$('#results').classList.contains('hidden')){
    if(!committed && session.size>0) commitSession();
  }
  if(!$('#exam').classList.contains('hidden')) clearTimeout(exTimer);
  if(!$('#level').classList.contains('hidden')) clearTimeout(lvTimer);
  if(id==='scope'){ openScope(curScope||sessionScope); return; }
  if(id==='home'){ renderHome(); goto('home'); return; }
  /* ⛔ באג שנמדד בדפדפן ב-11.8: מסך בחירת התרגול נוחת דרך "אחורה" של המערכת ומציג
     מספרים ישנים. `mode` הוא מסך **מונים** · כמה נפתרו, כמה נכונים · וכל מסך כזה
     חייב להיבנות מחדש בכניסה, בדיוק כמו `home` ו-`scope` שקיבלו את הטיפול הזה
     לפניו. השחזור: אנגלית → בחירת התרגול → סבב של עשר שאלות → "אחורה". התוצאה
     הייתה "0 נפתרו · 0%" אחרי שעשרה כן נפתרו, כלומר האפליקציה הכחישה את העבודה
     שהלומד בדיוק עשה. */
  if(id==='mode'){ renderMode(); goto('mode'); return; }
  goto(id);
}
/* כפתור "חזרה" שבתוך האפליקציה עושה בדיוק מה ש"אחורה" של המערכת עושה: צורך את רשומת
   ההיסטוריה. אם הוא רק היה מצייר את המסך הקודם, הרשומה הייתה נשארת תלויה · והלחיצה
   הבאה על "אחורה" הייתה נבלעת בלי שקרה כלום. */
function goBack(){
  if(navDepth(history.state && history.state.scr) > 0) history.back();
  else { renderHome(); goto('home'); }
}
window.addEventListener('popstate', e=>{
  navPop = true;
  try{
    /* חזרנו מ-"→ בית": הרשומות שנדחפו כבר נצרכו, ועכשיו מציירים בית ומקבעים
       את הבסיס על n=0. בלי navPop=false כאן, goto לא היה מעדכן את הרשומה
       והמצב היה מכריז על מסך אחר מזה שרואים. */
    if(navHome){
      navHome = false; clearTimeout(navHomeT);
      navPop = false; renderHome(); goto('home'); return;
    }
    navTo((e.state && e.state.scr) || 'home');
  }
  finally{ navPop = false; }
});
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
  // Only words actually practiced -- a list of words you have never met says nothing about
  // your strength. Weakest first, then the middle, then the ones you know.
  const all=[...byTerm.values()];
  /* Words skipped after the level test carry seen:1 so the practice queue leaves them alone · 
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
     than folded into "עוד לא נפגשתם" · which would have been the same lie in a quieter place. */
  const skippedN=all.filter(w=>wasSkipped(w.term)).length;
  const untouched=all.length-arr.length-skippedN;
  /* ⭐ נבנה מחדש 21.8.2026, לפי הכרעת חגי: "לא משנה כמה הוא צדק · משנה במה הוא
     טעה ומה הוא לא יודע".
     מה שירד, ולמה:
     · ⛔ גרף שמונת הסבבים. `.trend` גבוה 84px והתווית אוכלת 19, ולכן **כל אחוז
       מ-77 ומעלה צייר עמודה זהה** · אצל חגי שבע מתוך שמונה יצאו 64.66px, כולל
       82% ו-80%. הגרף היה עיוור בדיוק בטווח שבו לומד לפני מבחן נמצא.
       ובנוסף הוא ערבב סוגי סבבים: `mode` נכתב על כל שורה ומעולם לא סונן, ולכן
       סבב חיזוק ב-60% הוצג לצד מבחן עצמי ב-100% כאילו השני עבודה טובה יותר.
     · ⛔ כרטיס "16/16 נכונים". ציון של עבודה שנגמרה אינו פעולה.
     · ⛔ "ידעת מיד: N". מונה מילים שמעולם לא טעית בהן, כלומר גדל כשלא עושים
       את העבודה הקשה.
     מה שנשאר הוא מה שנותר לעשות, וכפתור שמתחיל אותו. */
  const cls=classify(scope);
  const ex=examDays();
  let html='';
  const lines=[];
  if(untouched) lines.push(`<em>${untouched}</em> מילים שטרם תרגלת`);
  if(ex && ex.days>=0) lines.push(ex.days===0 ? 'המבחן <em>היום</em>'
    : ex.days===1 ? 'המבחן <em>מחר</em>'
    : ex.days===2 ? 'נשארו <em>יומיים</em>' : `נשארו <em>${ex.days}</em> ימים`);
  const shown=cls.strong+cls.weak+cls.fresh;
  const pc=n=>shown? (100*n/shown).toFixed(1) : 0;
  html+=`<div class="section-t">מה עכשיו</div><div class="nx">`
    + (lines.length?`<div class="nx-line">${lines.join(' · ')}</div>`:'')
    + `<div class="statebar" role="img" aria-label="בשליטה ${cls.strong} · לחיזוק ${cls.weak} · טרם תורגלו ${cls.fresh}">
         <i class="sb-a" style="width:${pc(cls.strong)}%"></i>
         <i class="sb-b" style="width:${pc(cls.weak)}%"></i>
         <i class="sb-c" style="width:${pc(cls.fresh)}%"></i></div>
       <div class="sb-legend">
         <span><i class="dot sb-a"></i>בשליטה ${cls.strong}</span>
         <span><i class="dot sb-b"></i>לחיזוק ${cls.weak}</span>
         <span><i class="dot sb-c"></i>טרם תורגלו ${cls.fresh}</span></div>`
    + (cls.fresh?`<button class="btn btn-primary btn-block" id="drillFresh">תרגל ${Math.min(cls.fresh,20)} מילים שטרם תרגלת ←</button>`:'')
    + `</div>`;
  /* ===== the word cloud =====
     The old screen was a flat list, weakest first, every row the same size -- so the eleven words
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

  /* ⭐ רשימה ולא ענן. חגי: "המילים זה אחלה אבל לא כעננים · זה קצת מוזר · אולי כרשימה".
     ושתי שגיאות שהיו בענן ואינן יכולות לחזור כאן:
     · ⛔ הכיתוב אמר "ככל שמילה גדולה יותר כך טעית בה יותר", בזמן שהגודל נגזר מ-
       `wrong − first` והמספר שהוצג היה `wrong` לבדו · המילה הגדולה נשאה 3 והקטנה 5.
       ברשימה יש ציר אחד, והמיון והמספר הם אותו נתון.
     · ⛔ המשקל לא נשא מידע: Heebo נחתך ב-700 ב-@font-face שלו, ולכן `t3` במשקל 800
       ו-`t2` במשקל 700 רונדרו זהים. נמדד ברוחב גליפים.
     ⭐ ו-`last` מוצג לראשונה. הוא יושב בכל רשומה ושימש רק למיון · "לא תרגלת 12 ימים"
     הוא מה שמסביר למה טעית, ולא רק שטעית. */
  const DAY=864e5;
  const sinceText=d=> d<=0 ? 'תרגלת היום' : d===1 ? 'לא תרגלת מאתמול'
    : d===2 ? 'לא תרגלת יומיים' : `לא תרגלת ${d} ימים`;
  const missed=[...fight,...nearly].sort((a,b)=>{
    const wa=int0(stats.words[K(a.term)].wrong), wb=int0(stats.words[K(b.term)].wrong);
    if(wa!==wb) return wb-wa;
    return int0(stats.words[K(a.term)].last)-int0(stats.words[K(b.term)].last);
  });
  const LIST_CAP=12;
  const row=w=>{ const r=stats.words[K(w.term)];
    const n=int0(r.wrong), d=Math.round((Date.now()-int0(r.last))/DAY);
    /* ארבע דרגות עוצמה על הפס הצדדי · ערוץ שקט שאינו משנה את גודל הטקסט */
    const t=n>=5?3:n>=3?2:n>=2?1:0;
    return `<button class="wrow" data-w="${esc(w.term)}" aria-expanded="false">
      <i class="wbar b${t}" aria-hidden="true"></i>
      <span class="ww"><b><bdi>${esc(w.term)}</bdi></b><span>${sinceText(d)}</span></span>
      <span class="wn">${n===1?'טעות אחת':`${n} טעויות`}</span></button>`; };

  html+=`<div class="section-t">המילים שטעית בהן</div>`;
  if(!arr.length){
    html+=`<p class="msg" style="color:var(--ink-soft)">עדיין לא תרגלת מילים בתחום הזה. תרגל סבב אחד והתמונה תופיע כאן.</p>`;
  }else if(!missed.length){
    html+=`<p class="msg" style="color:var(--ink-soft)">אין כרגע מילים שטעית בהן ולא סגרת</p>`;
  }else{
    html+=`<div class="wlist" id="missList">`
      + missed.slice(0,LIST_CAP).map(row).join('')
      + (missed.length>LIST_CAP?`<button class="wmore" id="missMore">הצג עוד ${missed.length-LIST_CAP} ←</button>`:'')
      + `</div>`
      + `<button class="btn btn-primary btn-block" id="drillFight" style="margin:12px 0 4px">תרגל בדיוק את ${Math.min(missed.length,30)} המילים האלה ←</button>`;
  }
  if(settled.length||untouched||skippedN){
    html+=`<div class="quiet-line" style="margin-top:16px">`
      + (settled.length?`<div>טעית וכבר בשליטה: <b>${settled.length}</b> מילים</div>`:'')
      + (untouched?`<div style="margin-top:6px">טרם תרגלת: <b>${untouched}</b> מילים</div>`:'')
      + (skippedN?`<div style="margin-top:6px">דילגת אחרי מבחן הרמה: <b>${skippedN}</b> מילים
           <span style="opacity:.75">ניתן להחזיר ב"ניהול מילים" ← "שחזר מחיקות"</span></div>`:'')
      + `</div>`;
  }
  body.innerHTML=html;
  /* לחיצה על שורה פותחת את הפירוש מתחתיה, ולחיצה שנייה סוגרת · אותה התנהגות
     שהייתה בענן. tooltip אינו נגיש בטלפון, וזה המכשיר של רוב הלומדים. */
  const bind=()=>body.querySelectorAll('.wrow').forEach(b=>b.onclick=()=>{
    const nx=b.nextElementSibling;
    if(nx && nx.classList.contains('wmean')){ nx.remove(); b.setAttribute('aria-expanded','false'); return; }
    const w=byTerm.get(K(b.dataset.w)); if(!w) return;
    b.insertAdjacentHTML('afterend', `<div class="wmean">${esc(w.meaning)}</div>`);
    b.setAttribute('aria-expanded','true');
  });
  bind();
  const more=$('#missMore');
  if(more) more.onclick=()=>{
    more.insertAdjacentHTML('beforebegin', missed.slice(LIST_CAP).map(row).join(''));
    more.remove(); bind();
  };
  const drill=$('#drillFight');
  if(drill) drill.onclick=()=>startRound(missed.slice(0,30), scope, 'weak');
  const fresh=$('#drillFresh');
  if(fresh) fresh.onclick=()=>{
    const list=uniqScope(scope).filter(w=>!wasSkipped(w.term) && seenCount(w.term)===0);
    if(list.length) startRound(capSampled(list,20), scope, 'new');
  };
  goto('stats');
}
$('#statsBack').onclick=()=>goBack();

/* ===== MANAGE ===== */
/* markDeletedAgain אינו קישוט, והיעדרו כאן היה באג שקט.
   markRestored כותב רשומה קבועה ב-hw_undeleted, ו-mergeProgress מסנן בדיוק את המפתחות
   האלה מרשימת המחוקים · כך שמילה ששוחזרה פעם אחת ואז נמחקה מתוך סבב, נמחקה מקומית
   וחזרה בסנכנון הבא. גם הרשומה ב-stats.words שבה, כי מיזוג-מקסימום יכול להסיר רשומה
   רק כשהצד המקומי אומר שהיא נמחקה מחדש.
   מחיקה בכמות (app.js: mDelete) עשתה את זה נכון מהיום הראשון; הכפתור שבתוך הסבב לא. */
function deleteWord(term){ const k=K(term); deleted.add(k); markDeletedAgain(k); saveDeleted(); delete assoc[k]; saveAssoc(); delete stats.words[k]; saveStats(); buildBank(); }
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
/* היחידה היחידה שמוצגת, כשנכנסים לניהול מהיחידה עצמה. null = כל המאגר.
   קודם היחידה רק נפתחה (mOpen) ושאר תשע נשארו על המסך מקופלות · ומחיקה היא פעולה
   שנעשית בסימון תיבות, כך שמספיק גלגל אחד של האצבע כדי לסמן מילה מיחידה אחרת.
   חגי: "צריך שאראה רק את המילים של היחידה שלא אמחק בטעות מילים אחרות". */
let mOnly=null;
/* Grouped by unit and collapsed by default. The old screen was one flat alphabetical list
   cut at `slice(0,400)` -- so 3,500 of 3,900 words simply were not there, with nothing on
   screen saying so. Sections keep the DOM small without hiding anything. */
/* הסדר בתוך יחידה. קודם מה שחלש, אחר כך מה שנלמד, ואז מה שטרם נפגש · אלה בדיוק שלוש
   הקבוצות של classify(), ובאותו כלל: מילה שטעית בה אינה מילה שלא פגשת. הנגישות היא כל
   הנקודה, כי המילים הקשות היו מפוזרות בין 190 שורות לפי סדר המאגר.
   מילה שנמחקה יורדת לסוף · היא כבר לא בתרגול ורק תופסת מקום למעלה.

   ⚠ "ידעתי" יורדת מתחת לכולן (12.8.2026, בקשת חגי: "תמיד המילים שלא ידעתי למעלה
   שאוכל להוריד אותם בנוחות"). זה לא היה כך, וההפך היה נכון: markKnown כותב level=3,
   ולכן מילה שסומנה נמנתה כ"נלמדה" וצפה מעל מילים שהלומד מעולם לא פגש. המסך הראה
   מסומנות ולא-מסומנות משולבות זו בזו, ומי שעובר על היחידה כדי לסמן נאלץ לדלג שוב
   ושוב על מה שכבר סגר. הדירוג נשען על src==='known' ולא על הרמה, כי הרמה היא תוצר
   לוואי של הסימון ולא הסיבה לו. */
const manageRank = w =>
    w.gone            ? 4
  : isKnown(w.term)   ? 3
  : lvl(w.term) >= 3  ? 1
  : seenCount(w.term) ? 0
  : 2;
function renderManage(filter){
  const list=$('#manageList');
  const raw=String(filter||'').trim();
  const f=norm(raw);
  const all=manageItems();
  const hit=w=>!f || norm(w.term).includes(f) ||
    (w.meaning && w.meaning.replace(NIQ,'').includes(raw));
  /* mOnly חוסם לפני החיפוש ולא אחריו: גם חיפוש בתוך יחידה לא יגרור מילים מיחידות אחרות
     אל המסך, ולכן שום תיבת סימון שאינה של היחידה הזאת אינה קיימת בכלל. */
  const items=all.filter(w=>(!mOnly || String(w.unit)===String(mOnly)) && hit(w));
  const byUnit=new Map();
  for(const w of items){ if(!byUnit.has(w.unit)) byUnit.set(w.unit,[]); byUnit.get(w.unit).push(w); }
  for(const ws of byUnit.values()) ws.sort((a,b)=>manageRank(a)-manageRank(b));
  /* Searching opens the units it found; CLEARING the box has to close them again. Without the
     else branch the expansion survived, so search-then-clear rendered all 3,900 rows at once -- 
     exactly the DOM this screen was rebuilt to stop producing. */
  if(raw) mOpen=new Set(byUnit.keys());
  else if(mSearching) mOpen=new Set();
  mSearching=!!raw;

  if(!items.length){
    list.innerHTML='<p class="msg" style="color:var(--ink-soft)">לא נמצאו מילים</p>';
    $('#mCount').textContent=`${mSel.size===1 ? "אחת נבחרה" : mSel.size+" נבחרו"}`;
    return;
  }
  const rowHtml=w=>`<label class="m-row${w.gone?' is-gone':''}">
      <input type="checkbox" data-term="${esc(w.term)}" ${mSel.has(w.term)?'checked':''} ${w.gone?'disabled':''}>
      <b>${esc(w.term)}</b><span>${esc(w.meaning)}</span>
      ${w.gone?`<button class="m-undo" data-undo="${esc(w.term)}" title="החזר מילה זו">↺ החזר</button>`
             :`<button class="m-known${isKnown(w.term)?' on':''}" data-known="${esc(w.term)}"
                 title="${isKnown(w.term)?'בטל את הסימון · המילה תחזור לחיזוק'
                                        :'מוציא מ"מילים לחיזוק", והמילה נשארת במאגר לתרגול'}"
                 >${isKnown(w.term)?'✓ ידעתי':'ידעתי'}</button>`}</label>`;

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
    $('#mCount').textContent=`${mSel.size===1 ? "אחת נבחרה" : mSel.size+" נבחרו"}`;
  });
  /* Per-word restore. "שחזר מחיקות" is all-or-nothing, which is the wrong tool when you
     deleted forty words on purpose and one of them by mistake. */
  list.querySelectorAll('[data-undo]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const uk=K(b.dataset.undo); deleted.delete(uk); markRestored(uk);
    saveDeleted(); buildBank(); renderManage($('#mSearch').value); renderHome();
    toast('הוחזרה: '+b.dataset.undo);
  });
  /* הכפתור יושב בתוך <label>, ולכן לחיצה עליו הייתה מסמנת את תיבת המחיקה שלצדו ·
     preventDefault הוא מה שמפריד בין "אני יודע את המילה" ל"מחק אותה". */
  list.querySelectorAll('[data-known]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const t=b.dataset.known;
    const on=isKnown(t) ? !unmarkKnown(t) : markKnown(t);
    saveStats(); queueRemoteSync();
    renderManage($('#mSearch').value); renderHome();
    toast(on ? `"${t}" סומנה כידועה` : `"${t}" חזרה לתרגול`);
  });
  $('#mCount').textContent=`${mSel.size===1 ? "אחת נבחרה" : mSel.size+" נבחרו"}`;
}
/* פותח את ניהול המילים על יחידה אחת בלבד. בלי זה המסך נפתח סגור על כל עשר היחידות,
   ומי שהגיע מיחידה 7 צריך לזכור לאיזו. */
function openManage(unit){
  mSel=new Set(); $('#mSearch').value=''; $('#mMsg').classList.add('hidden');
  mOpen = unit ? new Set([String(unit)]) : new Set();
  /* חייב להתאפס כשנכנסים מ"ניהול מילים" הכללי. בלי ההשמה ל-null, מי שנכנס פעם אחת
     מיחידה 7 היה נשאר נעול עליה לתמיד · גם אחרי יציאה וכניסה מחדש מהמסך הראשי. */
  mOnly = unit ? String(unit) : null;
  mSearching=false;
  renderManage(''); goto('manage');
}
$('#manageBtn').onclick=()=>openManage(null);
/* מהיחידה · נפתח על היחידה הזאת בלבד. curScope הוא 'unit:7' או 'global'/'random'. */
$('#pbManage').onclick=()=>openManage(curScope.startsWith('unit:') ? curScope.slice(5) : null);
$('#mSearch').oninput=e=>renderManage(e.target.value);
$('#mDelete').onclick=()=>{
  const m=$('#mMsg'); m.classList.remove('hidden'); m.className='msg';
  if(mSel.size===0){ m.textContent='סמן מילים ברשימה ואז לחץ "מחק נבחרות".'; return; }
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
   מילים" and wrote a src:'lv' marker for exactly that purpose · and then nothing ever read it.
   The undo was designed and never built, so the promise on that screen was false. */
$('#mRestore').onclick=()=>{
  const skipped=Object.keys(stats.words||{}).filter(k=>stats.words[k] && stats.words[k].src==='lv');
  if(deleted.size===0 && !skipped.length){ toast('אין מה לשחזר'); return; }
  const parts=[];
  if(deleted.size) parts.push(`${deleted.size===1 ? "מילה אחת שנמחקה" : deleted.size+" מילים שנמחקו"}`);
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
  if(t.length>120||mn.length>400){ m.className='msg err'; m.textContent='המילה עד 120 תווים, הפירוש עד 400.'; return; }
  const k=K(t);
  if(!k){ m.className='msg err'; m.textContent='לא ניתן להוסיף את המילה הזאת. בדוק שהיא מכילה אותיות ונסה שוב'; return; }
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
   welcome screen -- so "back" used to land on a home screen with no units, no counts and every
   button disabled. Go back to where the user actually came from. */
document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{
  if(!committed && session.size>0) commitSession();
  if(!BANK.length || (LANG!=='he' && LANG!=='en')){ renderWelcome(); return; }
  /* צורכים את הרשומות שנדחפו במקום להחליף את העליונה בלבד. בלי זה נשארת רשומה
     תלויה ולחיצת "אחורה" הבאה נבלעת · ראו ההערה על navN למעלה. */
  const n = navN();
  if(n > 0){
    navHome = true;
    /* אם ההיסטוריה קצרה מ-n (רענון שקיצץ אותה, או פתיחה מקישור) · go אינו
       מפעיל popstate כלל, והכפתור היה נראה מת. נופלים חזרה לציור ישיר. */
    clearTimeout(navHomeT);
    navHomeT = setTimeout(()=>{ if(navHome){ navHome=false; renderHome(); goto('home'); } }, 250);
    history.go(-n); return;
  }
  renderHome(); goto('home');
});
document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>openScope(b.dataset.scope));

/* ===== PWA ===== */
/* ===== staying up to date =====
   Registering the worker was the whole update story, and it is not enough: a page that stays
   open never asks again, so a learner could sit on a build from days ago while the footer
   quietly suggested they reload. Three parts now -- ask again on every return to the app,
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
/* The app pushed to the cloud but never pulled again after the language was entered -- there is
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
   waits for a tap -- deliberately NOT applied automatically when the round ends, because that
   moment is the results screen and reloading would erase what they are reading. */
function updateSafeNow(){
  /* ⛔ `'sent'` נוסף ב-11.8 אחרי ציד באגים, וזה היה כשל אמיתי בכל דיפלוי.
     המסך החדש לא היה ברשימה, ולכן `location.reload()` רץ **באמצע סבב** של השלמת
     משפטים: שוחזר בדפדפן · שאלה 1 מתוך 10 עם הסבר פתוח, ואחרי הרענון `sentQ`
     ריק, בלי פס, בלי אזהרה, ובלי דרך לדעת מה קרה. עד פעמיים ב-15 דקות אחרי כל
     העלאת גרסה, כלומר בדיוק בשעה שבה אני מעלה שינויים.
     ⚠ התנאי השני בשורה למטה שומר על תרגול המילים דרך `session`, ולמודול המשפטים
     אין `session` · הוא אינו נשען על אותו מנגנון. לכן שם המסך הוא ההגנה היחידה
     שלו, וזו הסיבה שהשמטה כאן הייתה שקטה לחלוטין. */
  /* ⛔ `'results'` נוסף בבדק בית 3. ההערה שמעל הפונקציה כותבת במפורש שהעדכון
     "deliberately NOT applied automatically when the round ends, because that moment
     is the results screen" · אבל המסך לא היה ברשימה. וגם התנאי השני אינו מכסה
     אותו: finishRound כבר הריצה commitSession, ולכן `committed` אמת והביטוי כבוי.
     כלומר הפונקציה החזירה "בטוח לרענן" בדיוק במסך שההערה מגינה עליו, ורענון שם
     מוחק גם את מה שהלומד קורא וגם תיקוני "בעצם ידעתי" שטרם נשמרו. */
  const busy=['quiz','exam','level','sent','results'];
  return !busy.includes(currentScreenId()) && !(typeof session!=='undefined' && session.size>0 && !committed);
}
/* May this tab reload itself right now?
   The first version remembered only the LAST version it tried, which two real situations
   defeat outright. Two builds alternating -- GitHub Pages serves index.html with max-age=600 and
   different edges can disagree for minutes after a deploy, and a rollback does the same -- bounce
   A→B→A→B forever, because each reload sees a version different from the one remembered. And
   when sessionStorage cannot be written at all (Safari private mode, iOS Lockdown), the empty
   catch meant nothing was ever remembered and EVERY call reloaded.
   So: count reloads in a window instead of remembering one version, and read the counter back
   to prove the write actually stuck. If it cannot be counted, do not reload -- show the bar. */
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
   stays inside a language after a deploy therefore had no path back to a fresh build at all -- 
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
  bar.innerHTML=`גרסה ${rev} מוכנה · לחץ לרענון`;
  bar.classList.remove('hidden');
  document.body.classList.add('has-upd');   // lift the bug-report button clear of the bar
}

/* ===== התקנה למסך הבית =====
   כרום/אנדרואיד נותן לנו את אירוע ההתקנה ואפשר לפתוח את החלון בלחיצה.
   אייפון לא מאפשר זאת תכנותית · שם מציגים הדרכה. */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; LS.set('hw_installed', 1); });

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

/* שורת הכתובת של ספארי מרחפת מעל תחתית הדף ומכסה את הכפתור התחתון בתרגול. היא אינה
   נכללת ב-safe-area-inset-bottom כשהיא מוצגת, ולכן ה-CSS לבדו אינו יכול לדעת עליה.
   הסימון נעשה פעם אחת על <body>, וה-CSS (body.ios-web .wrap) מוסיף רווח גלילה.
   רק כשהאפליקציה פתוחה כאתר: באפליקציה מותקנת אין שורת כתובת, ורווח נוסף שם הוא סתם
   חור בתחתית המסך. */
if (isIOS() && !isStandalone()) document.body.classList.add('ios-web');

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
     of "מילים חדשות", but it was never practised here and must NOT be counted as learned · 
     that is what made the dashboard jump by thousands after one placement test and report a
     number nobody had earned. */
  let learned=0, practised=0, weak=0, skipped=0;
  keys.forEach(k=>{ const r=words[k]; if(!isObj(r)) return;
    if(r.src==='lv'){ skipped++; return; }
    if(int0(r.seen)>0) practised++;
    if(int0(r.level)>=3) learned++;
    else if(int0(r.seen)>0) weak++;      // met, not yet solid -- the same rule classify() uses
  });
  return {total:keys.size, learned, practised, weak, skipped,
          fresh: Math.max(0, keys.size-practised-skipped),
          pct: keys.size? Math.round(100*learned/keys.size):0};
}
/* ===== streak =====
   Derived from the session log rather than a counter of its own, so it can't drift out of
   sync with reality and it rides the existing cross-device merge for free. Both languages
   count: a day of Hebrew is a day of practice.
   Local calendar days, not 24h windows -- practising at 23:50 and again at 00:10 is two days,
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
  const now=Date.now();
  /* "The previous day" is a CALENDAR step, not 86,400,000ms. Israel moves its clock twice a
     year, so one day is 23 hours long and one is 25, and subtracting a fixed day either jumps
     clean over a date or lands on the same one twice. In March that read as a broken streak -- 
     someone who practised on the transition day and opened the app that night saw 0 -- and in
     October it counted a day twice and claimed a streak one longer than it was.
     setDate() knows about the transition; the anchor is midday so that even a transition at
     midnight could not slide the date under it. */
  const noon=new Date(now); noon.setHours(12,0,0,0);
  const back=i=>{ const d=new Date(noon); d.setDate(d.getDate()-i); return d; };
  // today doesn't break a streak that ran through yesterday -- it just hasn't been extended yet
  let start = days.has(dayKey(now)) ? 0 : (days.has(dayKey(back(1))) ? 1 : -1);
  let n=0;
  if(start>=0) for(let i=start;;i++){ if(!days.has(dayKey(back(i)))) break; n++; }
  // the last seven days, each carrying its weekday letter so the strip explains itself:
  // five filled bars next to a streak of 1 looks like a contradiction until you see WHERE the gap is
  const HE_DAY=['א','ב','ג','ד','ה','ו','ש'];
  const week=[];
  for(let i=6;i>=0;i--){
    const t=back(i);
    week.push({on: days.has(dayKey(t)), label: HE_DAY[t.getDay()], today: i===0});
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
  const days = n => n===1 ? 'יום ברצף' : 'ימים ברצף';
  $('#dStreak').textContent=st.n;
  $('#dStreakLbl').textContent=days(st.n);
  $('#dWeek').innerHTML=st.week.map(d=>
    `<i class="${d.on?'on':''}${d.today?' now':''}"><em>${d.label}</em></i>`).join('');
  $('#greetSub').textContent =
    st.n===0   ? 'מוכן להתחיל? בחר שפה'
  : st.today   ? `כבר תרגלת היום · ${st.n} ${days(st.n)}. כל הכבוד.`
               : `${st.n} ${days(st.n)}. תרגול קצר היום שומר על הרצף.`;
  renderBuildTag();
  renderPayCountdown();
  maybeOfferWhatsapp();
  maybeOfferTutorial();
  goto('welcome');
}
/* קבוצת הוואטסאפ: הזמנה חד-פעמית שקופצת בכניסה למסך השפות · המסך שכל משתמש רואה בכל
   כניסה, ולכן ההזמנה מגיעה גם למי שכבר מחובר ולא נרשם מחדש. hw_waOffered נכתב ברגע ההצגה,
   כך שהיא מופיעה פעם אחת בלבד ולא משנה איך סוגרים אותה. הדגל שמור מהניקוי בהחלפת חשבון
   (wipeAccountKeys), בדיוק כמו הזמנת ההתקנה · הצטרפות לקבוצה היא פעולת מכשיר, לא נתון חשבון.
   הכרטיס הקבוע במסך (#waCta) נשאר תמיד; זו רק ההופעה הקופצת. */
/* היום שבו האפליקציה עוברת לתשלום. זה הערך היחיד לעדכן.
   1.9 ולא 30.8: המייל שיצא ל-17 נרשמים ב-5.8 והסטורי אומרים "פתוח וחינם עד ה-30.08".
   ספירה שנגמרת ב-30.8 בעוד התשלום מתחיל ב-1.9 הייתה משאירה את 31.8 כיום שאיש לא יודע
   מה דינו. הכיוון הנכון להכריע בו הוא לטובת מי שכבר קיבל הבטחה: חינם עד סוף 31.8,
   תשלום מ-1.9. ההבטחה שנשלחה נשארת נכונה, ואפילו בעודף יום. */
const PAY_FROM='2026-09-01';

/* הספירה לסיום התקופה החינמית.
   שני דברים שהיא חייבת לעשות נכון, ושניהם נכשלים בשקט אם לא שמים לב:
   1. עברית תקינה למספר. "1 ימים" הוא בדיוק ההבדל בין תזכורת אישית לבאנר אוטומטי,
      ולכן היום האחרון, יומיים והיום עצמו מקבלים ניסוח משלהם.
   2. כשהתאריך עובר הפס נעלם לגמרי. "נשארו 3- ימים" הוא המשפט שגורם לאדם להפסיק
      להאמין לשאר המספרים על המסך.
   ההשוואה היא בין תאריכים בלבד (setHours 0) ולא בין רגעים: אחרת "נשארו 5 ימים" היה
   הופך ל-4 בצהריים, באמצע היום, בלי שקרה כלום. */
function renderPayCountdown(){
  const bar=$('#payBar'); if(!bar) return;
  const end=new Date(PAY_FROM+'T00:00:00');
  const now=new Date(); now.setHours(0,0,0,0);
  const days=Math.round((end-now)/864e5);
  if(days<0){ bar.classList.add('hidden'); bar.innerHTML=''; return; }
  const head = days===0 ? 'היום מתחיל התשלום'
             : days===1 ? 'מחר מתחיל התשלום'
             : days===2 ? 'עוד יומיים מתחיל התשלום'
             : `<b>${days}</b> ימים עד המעבר לתשלום`;
  bar.innerHTML = head + '<span>עד אז כל אוצר המילים פתוח</span>';
  bar.classList.remove('hidden');
}

/* כתובת סרטון ההדרכה. זה הערך היחיד לעדכן · ברגע שיש כתובת, הפופאפ מתחיל לקפוץ.
   ריק בכוונה: סרטון ההדרכה הקיים (שיווק/סרטונים/סרטון-הדרכה-בודקים.mp4) אינו מועלה
   לגיטהאב (‎.gitignore חוסם mp4 בתיקיית השיווק) ולכן אין לו כתובת חיה. פופאפ שמפנה
   לקישור שבור גרוע מאין פופאפ, ולכן כל עוד המחרוזת ריקה הוא פשוט אינו מוצג. */
const TUTORIAL_URL='';

/* סרטון ההדרכה · אותה מכניקה של הזמנת הוואטסאפ, ובכוונה: המשתמש כבר למד מה עושה
   חלון כזה, וכפילות של דפוס עדיפה על המצאת דפוס שני.
   hw_vidOffered נכתב ברגע ההצגה, כך שכל דרך סגירה סוגרת אותו לתמיד · וחגי ביקש
   במפורש שהכפתור יגיד "אל תראה לי את זה יותר", כלומר ההבטחה כתובה ולכן חייבת להתקיים.
   הדגל שמור מ-wipeAccountKeys מאותו נימוק כמו hw_waOffered: צפייה בסרטון הדרכה היא
   פעולת מכשיר, לא נתון של החשבון. */
function maybeOfferTutorial(){
  if(!TUTORIAL_URL) return;                                  // אין כתובת, אין הזמנה
  if(LS.get('hw_vidOffered',0)) return;
  setTimeout(()=>{
    if(LS.get('hw_vidOffered',0)) return;
    if($('#welcome').classList.contains('hidden')) return;
    if(document.querySelector('.ask:not(.hidden)')) return;  // לא לערום על דיאלוג פתוח
    LS.set('hw_vidOffered',1);
    const a=$('#vidAskGo'); if(a) a.href=TUTORIAL_URL;
    show($('#vidAsk'));
  }, 1500);
}
function maybeOfferWhatsapp(){
  if(LS.get('hw_waOffered',0)) return;
  setTimeout(()=>{
    if(LS.get('hw_waOffered',0)) return;                     // נפתח בינתיים ממסלול אחר
    if($('#welcome').classList.contains('hidden')) return;   // המשתמש כבר עזב את מסך הכניסה
    if(document.querySelector('.ask:not(.hidden)')) return;  // לא לערום על דיאלוג אחר שפתוח
    LS.set('hw_waOffered',1);
    show($('#waAsk'));
  }, 900);
}
/* גג להמתנה שלמטה. מעבר שפה אינו פעולה שהלומד מוכן לחכות לה, ורשת סלולרית גרועה
   יכולה למתוח pull+push לשניות רבות. אחרי הגג ממשיכים בלי לחכות · וזה בטוח, כי הסבב
   כבר על הדיסק ו-syncPending נשאר דלוק, כלומר המצב הגרוע ביותר כאן זהה בדיוק להתנהגות
   שהייתה כאן קודם. */
const LANG_SWITCH_FLUSH_MS = 4000;
async function enterLang(lang){
  if(!committed && session.size>0) commitSession();   // never lose an in-flight round
  if(lang!=='he' && lang!=='en') return;
  /* הדחיפה של הסבב האחרון בוטלה בשקט לפני התיקון הזה.
     commitSession מסיים ב-flushRemoteSync() בלי await, וזו נעצרת על pullProgress. בזמן
     ההמתנה הזאת enterLang המשיך וקבע LANG=lang סינכרונית · ולכן הגארד `lang!==LANG`
     (app.js:3601) תפס את ה-flush בחזרתו והחזיר false. הגארד עצמו נכון וחייב להישאר:
     loadLangState כבר החליף את assoc/stats/deleted/added לשפה החדשה, וכתיבה בנקודה הזאת
     הייתה מעתיקה את נתוני השפה החדשה לשורה של הישנה.
     לכן הדחיפה חייבת להסתיים *לפני* שהגלובלים מתחלפים, וזה מחייב await.
     הנתונים לא אבדו גם קודם · syncPending נשאר דלוק וההתנתקות כבר לא מוחקת (app.js:4298).
     מה שכן קרה: הענן נשאר מיושן עד שהלומד יחזור לשפה הזאת על המכשיר הזה. */
  if(currentUser && lang!==LANG && syncPending[LANG]){
    await Promise.race([
      flushRemoteSync().catch(()=>false),
      new Promise(res=>setTimeout(res, LANG_SWITCH_FLUSH_MS))
    ]);
  }
  /* אותו איפוס בדיוק ש-startRound עושה (app.js:1141), ומאותה סיבה: מכאן והלאה הגלובלים
     שייכים לשפה אחרת. בלעדיו נשאר "סשן רפאים" · ה-Map של השפה הקודמת עם size>0 · עד
     שהלומד יתחיל סבב חדש.
     מה זה שובר בפועל: המאזין ב-storage (app.js:264) מאמץ עבודה מלשונית אחרת רק כאשר
     `session.size===0`. סשן הרפאים מחזיק את התנאי הזה כוזב, ולכן טאב שני שסיים סבב מרים
     את diskAhead ו-absorbDisk לא רץ · מסך הבית של השפה החדשה ממשיך להציג מספרים ישנים.
     deck מתאפס יחד איתם. הוא נבנה מחדש בכל startRound ולכן איש אינו קורא אותו בינתיים,
     אבל הוא מחזיק את אובייקטי הקלפים של השפה הקודמת · והדרישה כאן היא הפרדה מלאה.
     sessionRowId נכלל כי הוא חלק מאותה יחידת מצב; הוא לבדו אינו באג, שכן startRound מאפס
     אותו לפני כל שימוש, ו-commitSession יוצא מוקדם על entries ריק (app.js:1854). */
  session=new Map(); committed=false; committedKeys=new Set(); sessionRowId=null; deck=[];
  LANG=lang; LS.set('hw_lang',lang);
  loadLangState();
  migrateStores();
  pruneOrphans();
  buildBank();
  document.documentElement.lang = 'he';
  $('#homeTitle').textContent = lang==='en' ? 'פסיכומטרי · אנגלית' : 'פסיכומטרי · עברית';
  $('#homeSub').textContent   = lang==='en' ? 'English vocabulary · 10 יחידות' : 'המילון הרשמי · 10 יחידות';
  /* ⚠ באנגלית נעצרים על מסך בחירת התרגול, ובעברית לא
     ------------------------------------------------
     יש שני תרגולים באנגלית ואחד בעברית, ולכן מסך בחירה בעברית היה מסך עם אפשרות
     אחת. בעברית הזרימה נשארת בדיוק כפי שהייתה: בחירת שפה ואז דף הבית.
     ⚠ renderHome נקרא בשני המקרים, גם כשאנחנו הולכים ל-mode: מסך הבית נבנה
     מהמצב שנטען הרגע, וכשהלומד יבחר "תרגול מילים" הוא צריך להיות מוכן ולא
     להיבנות תוך כדי המעבר. */
  renderHome();
  if(lang==='en'){ renderMode(); goto('mode'); }
  else goto('home');
  if(lang==='en') loadExSentData();   // fire-and-forget: ready before the first feedback
  syncWithRemote(lang);   // fire-and-forget: pulls any progress from another device and merges it in
}
document.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>enterLang(b.dataset.lang));
/* "🏠 חזרה" בדף הבית. באנגלית הוא עולה שלב אחד, לבחירת התרגול; בעברית הוא עולה
   לבחירת השפה, כמו שהיה. */
$('#switchLang').onclick=()=>{
  if(!committed && session.size>0) commitSession();
  if(LANG==='en'){ renderMode(); goto('mode'); } else renderWelcome();
};

/* ===== מסך בחירת התרגול · אנגלית בלבד ===== */
async function renderMode(){
  const s = langSummary('en');
  $('#mWordsPct').textContent      = s.pct+'%';
  $('#mWordsLearned').textContent  = s.learned;
  $('#mWordsPract').textContent    = s.practised;
  $('#mWordsCount').textContent    = 'מתוך '+s.total;
  $('#mWordsProg').style.width     = s.pct+'%';
  $('#mWordsProg').parentElement.title = `למדת ${s.learned} מתוך ${s.total}`;
  $('#userBadgeM').textContent = $('#userBadge')?.textContent || '';
  /* ⚠ המספרים של המשפטים דורשים את קובץ הנתונים, ששוקל 191KB. עד שהוא נטען
     מוצג " · " ולא אפס: אפס הוא טענה שהלומד לא פתר כלום, ו" · " אומר שהמספר עדיין
     לא ידוע. /HEB §5 · מספר אמיתי, או שאין מספר. */
  const paint = () => {
    const q = sentSummary(null);
    $('#mSentPct').textContent    = q.pct+'%';
    $('#mSentSolved').textContent = q.solved;
    $('#mSentOk').textContent     = q.ok;
    $('#mSentCount').textContent  = 'מתוך '+q.total;
    $('#mSentProg').style.width   = q.pct+'%';
    $('#mSentProg').parentElement.title = `${okN(q.ok)} מתוך ${q.total} משפטים`;
  };
  if(window.SENT_EN) paint();
  else {
    $('#mSentPct').textContent='–'; $('#mSentSolved').textContent='–';
    $('#mSentOk').textContent='–';  $('#mSentCount').textContent='';
    /* ⚠ טעינה ברקע **רק למי שכבר תרגל משפטים**, ולא לכולם.
       נמצא בציד ב-11.8: הגרסה הראשונה טענה את קובץ הנתונים (191KB) בכל כניסה
       לאנגלית, גם למי שבא לתרגל מילים ולא נוגע במשפטים לעולם. באפליקציה שבה
       sw.js מנמק במפורש למה לא לתלות פונטים ב-REV כדי לא להוריד 152KB מחדש, זה
       היה רגרסיה בעלות ולא שיפור בחוויה.
       ההכרעה: מי שיש לו התקדמות רוצה לראות את המספר שלו ולכן שווה לו ההורדה; מי
       שאין לו רואה " · " עד שהוא לוחץ, וזה בדיוק המידע הנכון · עוד לא התחיל. */
    const hasHistory = Object.keys(sentProg()).length > 0;
    if(hasHistory)
      loadSentData().then(ok => { if(ok && !$('#mode').classList.contains('hidden')) paint(); });
    else
      $('#mSentCount').textContent = 'טרם התחלת';
  }
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=async ()=>{
  if(b.dataset.mode==='words'){ renderHome(); goto('home'); return; }
  b.disabled = true;
  const ok = await loadSentData();
  b.disabled = false;
  if(!ok){ toast('לא ניתן לטעון את המשפטים. בדוק את החיבור לרשת ונסה שוב'); return; }
  openSentPick(); goto('sent');
});
$('#modeBack').onclick = ()=> renderWelcome();
$('#setBtnM').onclick  = ()=> openAccount('settings');
/* ⛔ באג שנמצא בציד ב-11.8: `#userBadge4` נשא `title` ו-`aria-label` "החשבון שלי"
   **ובלי מאזין**. קורא מסך הכריז לחצן, המשתמש לחץ, ולא קרה כלום. זה גרוע מכפתור
   חסר: כפתור חסר אינו מבטיח דבר. `userBadge2` ו-`userBadge3` תמיד היו מחוברים,
   וזה נשכח כאן. */
$('#userBadge4').onclick = ()=> openAccount('profile');

/* ===== level test =====
   Estimates where the learner already knows the vocabulary, so the app can stop showing
   them words they mastered years ago. Result is advisory: nothing is marked as "learned"
   without the user explicitly agreeing on the result screen. */
const LV_BANDS=[['A1','בסיסי'],['A2','יסודי'],['B1','בינוני'],['B2','בינוני+'],['C1','מתקדם'],['C2','אקדמי']];
const LV_LABEL={A1:'רמה בסיסית',A2:'רמה יסודית',B1:'רמה בינונית',B2:'רמה בינונית-גבוהה',C1:'רמה מתקדמת',C2:'רמה אקדמית'};
/* ===== adaptive ladder =====
   The old test ran all 30 items and promoted on 60% per band -- 3 of 5, where blind guessing
   already returns 25%. Two lucky guesses in a five-item band were enough to climb it, so the
   result drifted upward and topped out at C2 for people with real gaps.
   Now each band is a BLOCK of 6 items and promotion needs 5 of them. Guessing your way to
   5/6 on four-option items is a ~4% event, so a level has to be earned. We start in the
   middle and walk toward the edge that keeps failing, which also keeps the test short:
   a typical run is 12–18 items instead of a flat 30. */
const LV_ORDER=LV_BANDS.map(b=>b[0]);
const LV_BLOCK=5, LV_PASS=4, LV_START='B1';
let lvDeck=[], lvIdx=0, lvAns=[];
let lvBand=LV_START, lvBlock=[], lvBlockOk=0, lvPassed=null, lvFailedUp=false, lvSeen=new Set();

/* The test exists in both languages and writes to two different keys, but this gate read only
   the English one -- so a learner who finished the Hebrew test was sent back to the level screen
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
  if(!lvPool(LV_START).length){ toast('מבחן הרמה לא נטען. בדוק את החיבור לרשת ונסה שוב'); return; }
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
   direction would reverse -- that boundary IS the level. */
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
  /* המילה במבחן הרמה היא באנגלית או בעברית לפי LV_LANG. ה-HTML קובע dir="ltr" כברירת מחדל,
     ובמבחן העברי זה הפוך · מכאן הקביעה הדינמית, גם ל-dir וגם ל-lang לקורא מסך. */
  $('#lvWord').dir = LV_LANG==='en' ? 'ltr' : 'rtl';
  $('#lvWord').lang = LV_LANG;
  bindSay('#lvSay', LV_LANG==='en' ? it.w : null, true);
  $('#lvOpts').innerHTML=it.opts.map((o,i)=>`<button data-i="${i}">${esc(o)}</button>`).join('');
  const opts=$('#lvOpts').querySelectorAll('button');
  opts.forEach(b=>{
    b.onclick=()=>lvPick(it.opts[+b.dataset.i], b);
  });
  /* innerHTML הורס את הכפתורים ובונה חדשים, ולכן הפוקוס נופל ל-<body> בכל שאלה.
     מי שעונה בעכבר לא מרגיש; מי שעונה במקלדת מאבד את מקומו ונאלץ ללחוץ Tab מחדש
     בכל שאלה מאפס. נמדד: document.activeElement היה BODY אחרי כל רינדור.

     הפוקוס מוחזר **רק אם הוא כבר היה בין האפשרויות** · כלומר רק למי שניווט במקלדת.
     בלי התנאי הזה כל לחיצת עכבר הייתה גוררת פוקוס לכפתור הראשון, קורא מסך היה מכריז
     אותו בקול בכל שאלה, ומשתמש מגע היה מקבל טבעת פוקוס שלא ביקש. */
  if(lvKeyboardNav && opts.length) opts[0].focus();
  lvKeyboardNav=false;
  $('#lvDunno').disabled=false;
}
/* נקבע ב-lvPick לפני הרינדור הבא, ורק כשהבחירה עצמה הגיעה מהמקלדת. */
let lvKeyboardNav=false;
function lvPick(choice, btn){
  const it=lvDeck[lvIdx];
  const ok = choice===it.a;
  /* :focus-visible אמת רק כשהדפדפן עצמו הכריע שהאינטראקציה הייתה מקלדתית · הוא כבר
     מבחין בין Enter/רווח לבין קליק, ואין טעם לנחש את זה מחדש. */
  if(btn && btn.matches && btn.matches(':focus-visible')) lvKeyboardNav=true;
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
  /* Store the id, exactly like lvPick() above: an unstored timer is a timer nothing can cancel.
     clearTimeout(lvTimer) in #lvExit is the only thing standing between "left the test" and a
     tick that walks into lvFinish() and writes hw_level -- see app.js:2445-2448. */
  lvTimer=setTimeout(()=>{ lvIdx++; lvRender(); }, 900);
};

/* The level is the highest band that cleared 5/6 -- nothing is inferred from bands we
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
    /* נגזר מהקבועים ולא כתוב כמספר. v141 הוריד את הבלוק מ-6/5 ל-5/4, עדכן את index.html
       ושכח את המחרוזת הזאת · והמסך אמר "5 מתוך 6" בזמן שהטבלה שורה מתחתיו הדפיסה "4/5 ✓".
       הכיול הבא לא יוכל להשאיר את המסך משקר. */
    ? LV_LABEL[level]+` · הרמה הגבוהה ביותר שעברת בה ${LV_PASS} מתוך ${LV_BLOCK}.`
    : 'נתחיל מהבסיס. היחידות הראשונות בנויות בדיוק לרמה הזאת.';
  $('#lvBands').innerHTML=LV_BANDS.map(([b,name])=>{
    const p=per[b]||{n:0,ok:0};
    if(!p.n) return `<div class="lv-band" style="opacity:.42"><b>${b}</b><span class="lbl">${name}</span>
      <span class="bar"></span><span class="pc">לא נבדק</span></div>`;
    const pc=Math.round(100*p.ok/p.n);
    const mark=p.ok>=LV_PASS?' ✓':'';
    return `<div class="lv-band"><b>${b}</b><span class="lbl">${name}</span>
      <span class="bar"><i style="width:${pc}%"></i></span><span class="pc">${p.ok}/${p.n}${mark}</span></div>`;
  }).join('');

  // offer to skip words below the tested level -- only with explicit consent.
  // hide() first: without it a previous run's offer stays on screen with a stale count.
  hide($('#lvOffer'));
  /* ההצעה הייתה חסומה לגמרי לכל חשבון עם 10+ מילים שתורגלו. החסימה נוספה אחרי שחשבון
     אמיתי איבד 2,470 רשומות, וזו הייתה הסיבה הנכונה · אבל הכלי היה גס מדי: מי שנכנס
     להגדרות ועושה מבחן רמה בשנית לא קיבל הצעה בכלל, גם כשהיו לו מאות מילים מתחת לרמתו
     שמעולם לא נגע בהן.
     מה שמגן באמת הוא הסינון לכל מילה, והוא כבר קיים בשני המקומות שסופרים ומחילים:
     lvCountKnown פוסל מילה עם רשומת סטטיסטיקה או מחיקה, ו-lvApplyKnown חוזר על אותו
     תנאי לפני שהוא כותב ("any history at all · leave it alone"). כלומר מילה שכבר למדת
     אינה יכולה להיכנס להצעה מלכתחילה · לא לספירה ולא לכתיבה.
     לכן החסימה הרחבה יורדת, והשמירה נשארת: ההצעה מדברת מעכשיו רק על מילים שמעולם לא
     נגעת בהן, וזה בדיוק "לשלב את המילים שכבר למדת לפני ההמלצה".
     הדירוגים קיימים רק באנגלית, ולכן עברית לעולם אינה מגיעה לכאן. */
  const skippable = (LV_LANG==='en') ? lvCountKnown(level) : 0;
  /* דווח פעמיים ("אין סינון כלשהו של המילים" · "לא קיבלתי סלקציה ונאלצתי לבצע אותה לבד"):
     הענף השלישי לא נכתב מעולם. אנגלית עם פחות מ-40 מילים לדילוג נפלה בין ההצעה לבין
     ההסבר בעברית, והפאנל נשאר מוסתר · מסך תוצאה ששותק. ברמות A1/A2 הסף הוא 0, ולכן
     כל לומד אנגלית מתחיל נפל לשם בכל מבחן. עכשיו לכל מצב יש מסר. */
  if(lvOfferKind(LV_LANG, skippable, LV_CUT[level]||0)!=='offer'){
    show($('#lvOffer'));
    $('#lvOfferText').innerHTML=lvOfferNote(lvOfferKind(LV_LANG, skippable, LV_CUT[level]||0));
    $('#lvApply').classList.add('hidden');
    $('#lvNoApply').textContent='הבנתי';      // there is nothing here to decline
    $('#lvNoApply').onclick=()=>hide($('#lvOffer'));
    return;
  }
  if(skippable>=40){
    show($('#lvOffer'));
    $('#lvOfferText').innerHTML=`מצאתי <b>${skippable}</b> מילים באנגלית שנמצאות הרבה מתחת לרמה שהדגמת
      עכשיו, ולכן כמעט בוודאי כבר מוכרות לך.
      <br><span style="color:var(--ink-soft);font-size:.86rem">מה זה עושה בפועל: המילים האלה יוצאות
      מ"מילים שטרם תרגלת" ולא יגיעו אליך בתרגול, כדי שתתחיל ישר במה שבאמת חסר לך. הן <b>לא</b> נמחקות
      ו<b>לא</b> נספרות כמילים שלמדת. מספר הנלמדות שלך נשאר כפי שהוא.
      <br><b>מילים שכבר תרגלת אינן נכללות כאן</b>, וההתקדמות שלהן אינה נוגעת.
      ניתן להחזיר אותן ב"ניהול מילים" ← "שחזר מחיקות".</span>`;
    $('#lvApply').onclick=()=>{ const n=lvApplyKnown(level); hide($('#lvOffer'));
      toast(`${n} מילים הוצאו מהתרגול · ניתן להחזיר ב"ניהול מילים"`); };
    $('#lvApply').classList.remove('hidden');
    $('#lvNoApply').textContent='לא, אתרגל הכל';
    $('#lvNoApply').onclick=()=>hide($('#lvOffer'));
  }
}
/* Only English has frequency ranks, so the skip offer applies to the English bank.
   The cut sits TWO bands below where the learner tested. One band below was too greedy:
   a C2 result cleared 20000, which is every ranked word in the bank -- the app offered to
   mark 3175 of 3694 words known off the back of a single test. Skipping should only ever
   cover words that are far easier than the ceiling that was actually demonstrated. */
const LV_CUT={A1:0, A2:0, B1:600, B2:2000, C1:5000, C2:10000};
/* מה מסך התוצאה אומר. פונקציה נפרדת ולא שרשרת if בתוך הרינדור, כי זו ההכרעה שנפלה
   בין הכיסאות: היה ענף להצעה וענף לעברית, ולא היה ענף לאנגלית בלי מספיק מילים.
   ארבעה מצבים, וכל אחד מהם אומר משהו · אין מצב שבו המסך שותק. */
const LV_INTRO_BASE = 'מבחן קצר ואדפטיבי: 10–20 מילים, 2–3 דקות. המבחן מתחיל ברמה בינונית '
  + 'ומתאים את עצמו לפי התשובות שלך. בסיום מתקבלת הערכה של רמת אוצר המילים.';
const lvOfferKind = (lang, skippable, cut) =>
    lang !== 'en'      ? 'he'        // אין דירוג שכיחות בעברית, ולכן אין דילוג
  : skippable >= 40    ? 'offer'
  : cut                ? 'few'       // יש סף, אבל לא נמצאו מספיק מילים מתחתיו
  : 'basic';                         // A1/A2: הסף הוא 0, אין מה לדלג עליו מלכתחילה
const LV_SUB = 'color:var(--ink-soft);font-size:.86rem';
const lvOfferNote = kind => ({
  he:    `התוצאה נשמרה ומשמשת את האפליקציה מכאן והלאה.
          <br><span style="${LV_SUB}">בעברית אין עדיין דילוג אוטומטי על מילים שאתה כבר יודע.
          הדילוג באנגלית נשען על דירוג שכיחות, ולעברית אין מקור כזה. עד שיהיה, אפשר להוציא
          מילים מוכרות ידנית דרך ניהול מילים.</span>`,
  few:   `התוצאה נשמרה ומשמשת את האפליקציה מכאן והלאה.
          <br><span style="${LV_SUB}">לא נמצאו מספיק מילים שנמצאות הרבה מתחת לרמה שהדגמת,
          ולכן כל המילים נשארות בתרגול.</span>`,
  basic: `התוצאה נשמרה ומשמשת את האפליקציה מכאן והלאה.
          <br><span style="${LV_SUB}">ברמה הזו אין דילוג: כל המילים במאגר עדיין רלוונטיות לך,
          ולכן כולן נשארות בתרגול.</span>`,
}[kind] || '');
/* שתי צורות, כי המפה והנרמול נבנו בנפרד: מפתחות enrank.js נכתבו עם רווחים
   ומקפים **מוסרים** (`povertystricken`), ואילו normEn הופך מקף לרווח ומשאיר
   אותו (`poverty stricken`). שש רשומות נפלו בין הכיסאות · begin an un ·
   best seller · self confidence · department store · old fashioned ·
   poverty stricken · וקיבלו undefined.
   זה לא נראה כשגיאה בשום מקום: הקוראים עושים `if(!(r && r<=cut)) continue`,
   כלומר ערך בלי דירוג פשוט נעלם ממאגר מבחן הרמה ומ-lvCountKnown, בשקט.
   הנפילה־אחורה כאן ולא תיקון של enrank.js: הקובץ הוא דאטה שנבנה בצינור נפרד,
   ולוגיקת חיפוש שסובלת את שתי הכתיבות עמידה גם לבנייה הבאה. */
function lvRankOf(term){
  const m=window.EN_RANK; if(!m) return null;
  const k=normEn(term);
  const hit=m[k];
  if(hit!=null) return hit;
  const squashed=k.replace(/[\s-]/g,'');
  return squashed!==k ? m[squashed] : hit;
}
/* Counts what will ACTUALLY be marked, which is not the same as what is below the cut.
   The old version counted every ranked word under the cut across the whole bank and ignored
   history and deletions -- so it advertised 2,470 while lvApplyKnown, which skips any word that
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
   1. An existing record is NEVER touched -- not even a weak one. History outranks a guess.
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
    if(stats.words[k]) continue;                       // any history at all -- leave it alone
    stats.words[k]={seen:1,first:1,ever:1,wrong:0,level:3,last:stamp,src:'lv'};
    n++;
  }
  saveStats();
  /* saveStats only SCHEDULES a push, 1500ms out -- and LANG is restored on the next line, so by
     the time it fired it was pushing the other language's row. The 40+ words just marked as
     known never reached the cloud, and on a second device the learner met them as new.
     Pushed here, while the English state is still the loaded one -- and only after a confirmed
     read, so a dropped request can't overwrite a real English row with this partial snapshot. */
  if(currentUser && window.Store){
    const snap={assoc, stats, deleted:[...deleted], added, dir:direction, extras:collectExtras('en')};
    /* אותה סיבה כמו ב-syncWithRemoteInner: בין ה-pull ל-push החשבון יכול להתחלף, וזה
       מסלול רקע ארוך במיוחד · הוא נפתח אחרי מבחן רמה ורץ בזמן שהמשתמש כבר ממשיך. */
    const uid=currentUser.id;
    (async()=>{
      try{
        const res=await Store.pullProgress('en');
        if(!res || res.ok!==true) return;
        let m=snap;
        if(res.data){
          /* mergeProgress keys `added` through K(), which reads the CURRENT language -- and by
             the time this resolves LANG is back to Hebrew. Pin it for the merge itself. */
          const here=LANG; LANG='en';
          try{ m=mergeProgress(snap, res.data); } finally { LANG=here; }
          applyExtras('en', res.data.extras);
        }
        await Store.pushProgress('en', {...m, extras:collectExtras('en')}, uid);
      }catch(e){}
    })();
  }
  LANG=wasLang; loadLangState(); buildBank();
  return n;
}
$('#lvStart').onclick=startLevelTest;
const lvStart = lang => { LV_LANG=lang;
  $('#lvIntroLang').textContent = lang==='he' ? 'עברית' : 'אנגלית';
  /* דווח פעמיים: "היה אמור לחסוך לי מילים". ההבטחה הגיעה מכאן · הפתיח הבטיח "המלצה
     לתרגול" לשתי השפות, בעוד שהדילוג נשען על דירוג שכיחות שקיים רק באנגלית. ההבטחה
     מנוסחת עכשיו לפי מה שהשפה שנבחרה באמת מספקת. */
  $('#lvIntroSub').textContent = LV_INTRO_BASE
    + (lang==='he' ? '' : ' אם יימצאו מילים הרבה מתחת לרמה שלך, תוצע גם דילוג עליהן.');
  hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); };
/* ===== הכניסה למבחן הרמה =====
   שני הכפתורים ישבו במסך בחירת השפה · המסך שנפתח בכל כניסה · ופתחו את המבחן בלחיצה אחת.
   המבחן אינו פעולה ניטרלית: lvFinish() כותב את הרמה החדשה על הקודמת ודוחף אותה לענן,
   ובמסלול האנגלי הוא גם המקום היחיד שמציע להוציא מילים מהתרגול. לכן הם עברו להגדרות,
   ולכן הלחיצה פותחת את #lvAsk ולא את המבחן: lvStart רץ רק מ-#lvAskGo.
   השפה נשמרת על ה-dataset של הדיאלוג ולא במשתנה מודול · כך כפתור האישור קורא את מה
   שבאמת נפתח, וריצה שנייה אינה יורשת את השפה של הקודמת. */
function lvAskOpen(lang){
  const box=$('#lvAsk'); if(!box) return;
  const name = lang==='he' ? 'עברית' : 'אנגלית';
  box.dataset.lang=lang;
  $('#lvAskLang').textContent=name;
  $('#lvAskLang2').textContent=name;
  // ההצעה להוציא מילים מהתרגול קיימת רק באנגלית · ראה lvFinish. אין מה להזהיר מפניה בעברית.
  $('#lvAskEn').classList.toggle('hidden', lang!=='en');
  show(box);
}
$('#accLevelHe').onclick=()=>lvAskOpen('he');
$('#accLevelEn').onclick=()=>lvAskOpen('en');
const lvAskClose=()=>hide($('#lvAsk'));
$('#lvAskNo').onclick=lvAskClose;
$('#lvAsk').onclick=e=>{ if(e.target===$('#lvAsk')) lvAskClose(); };
$('#lvAskGo').onclick=()=>{
  const lang=$('#lvAsk').dataset.lang==='he' ? 'he' : 'en';
  lvAskClose();
  lvStart(lang);
};
$('#lvSkip').onclick=()=>{ LS.set(lvKey(),'skipped'); renderWelcome(); };
/* ✕ יציאה יושב ב-topbar, מחוץ ל-#lvQuiz · כלומר הוא על המסך גם אחרי ש-lvFinish() כבר
   כתב את הרמה ודחף אותה לענן. "התוצאות לא יישמרו" היה שקר בדיוק ברגע שבו הלומד הכי צריך
   לסמוך על המשפט. הנוסח כאן אומר את הכלל עצמו, ולכן הוא נכון משלושת המסכים: מסך הפתיחה,
   אמצע המבחן, ומסך התוצאות. */
$('#lvExit').onclick=()=>{ if(confirm('לצאת ממבחן הרמה? רק מבחן שהושלם נשמר. מבחן שנעצר באמצע יתחיל מחדש בפעם הבאה.')){ clearTimeout(lvTimer); renderWelcome(); } };
$('#lvDone').onclick=()=>renderWelcome();

/* ===== הקראה קולית =====
   Web Speech API · מובנה בדפדפן. אין תלות חוץ, אין קריאת רשת, ולכן ה-CSP לא נוגע בזה.
   מוקרא רק הצד האנגלי: הקראת עברית בקול אנגלי היא רעש, והקראת הפירוש בעברית תיתן
   ללומד את התשובה במקום לבחון אותה.

   ⚠ 7.8.2026 · נבנה כאן ענף עברי ובוטל בהוראת חגי: "לא צריך רמקול לעברי, אנגלית".
   ההכרעה היא שלו, ולא נובעת ממחסום טכני: קול he-IL קיים והניקוד אינו שובר אותו. */
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
  /* מה שנשלח למנוע ההקראה אינו בהכרח מה שכתוב על הכרטיס.
     נמדד על 3,945 המילים באנגלית: 20 ערכים מכילים תווים שמנוע ההקראה מבטא כרעש.
       · 10 ערכי סדר בצורה "1st - first" · המנוע קורא את המקף, ואת "1st" הוא מבטא
         "one-st". מה שרוצים לשמוע הוא הצורה המילולית שאחרי המקף, ולכן היא נבחרת.
       · 9 ערכי ריבוי בצורה "knife (knives)" · הסוגריים הופכים לפסיק, כך שנשמעות שתי
         הצורות עם הפסקה טבעית ביניהן במקום "פתח סוגריים".
       · ערך אחד עם לוכסנים, "begin/an/un".
     18 הערכים עם פסיק ("fight, fought") נשארים כמו שהם · שם הפסיק הוא הכוונה, ושתי
     הצורות אמורות להישמע.
     מוחל רק על ההקראה. הטקסט שעל המסך אינו משתנה: הלומד צריך לראות "1st - first". */
  speakable(text){
    let s=String(text||'');
    const dash=s.split(' - ');
    if(dash.length===2 && /\d/.test(dash[0])) s=dash[1];   // "1st - first" → "first"
    s=s.replace(/\s*\(([^)]*)\)\s*/g, ', $1')              // "knife (knives)" → "knife, knives"
       .replace(/\s*\/\s*/g, ', ')                          // "begin/an/un" → "begin, an, un"
       .replace(/\s{2,}/g,' ').trim();
    return s;
  },
  say(text, btn){
    if(!this.available() || !text) return false;
    try{
      speechSynthesis.cancel();                       // never let two words overlap
      const u=new SpeechSynthesisUtterance(this.speakable(text));
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
/* Wire one speaker button to whatever English text is on screen. Hidden -- not disabled -- 
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
      /* ⚠ 15.8.2026 · כאן עמד שומר `const had=!!TTS.voice; … && !had` שנועד לדלג על
         שחזור מיותר. הוא נמדד כשבור: `TTS.voice` נקבע כ**תופעת לוואי** של
         `TTS.available()`, ו-`available()` נקראת גם מ-`renderReview`, מ-`TTS.say`,
         ומ-`bindSay` של מסך **אחר**. כלומר כל מסך שהצליח להדליק רמקול אחרי שמסך
         קודם נכשל היה מכבה בכך את השחזור של הקודם · והאירוע היחיד שיכול היה להציל
         אותו דילג עליו. נמדד בדפדפן: אותו voiceschanged בדיוק, ההבדל היחיד קריאה
         אחת ל-available() באמצע, hidden:false מול hidden:true. ראה tests/74.
         מה שנשאר הוא הערכה מחדש בלי תנאי. `bindSay` אידמפוטנטית · היא קוראת את
         הטקסט העדכני מ-`sayBound` ומכריעה מחדש · ולכן ניגון חוזר כשדבר לא השתנה
         אינו עושה דבר, וכשקול **נעלם** הוא מסתיר כפתור שכבר אינו יודע להגות. */
      TTS.voice=null; TTS.pick();
      sayBound.forEach((v,sel)=>bindSay(sel, v[0], v[1]));
      /* ⚠ sayBound היא מפה לפי **סלקטור**, ולכן היא מכסה רק כפתורים סטטיים.
         הרמקולים של השלמת המשפטים נבנים לכל שאלה מחדש ואינם בה. ראה
         sentSayRefresh. ה-try כאן כי הפונקציה נוגעת ב-`sentQ`, שמוצהר בהמשך
         הקובץ ב-let · האירוע אמנם מגיע אחרי שהסקריפט הסתיים, אבל כשל כאן
         היה מפיל גם את שחזור הכפתורים הסטטיים שכבר רץ. */
      try{ sentSayRefresh(); }catch(e){}
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
     recognise -- word → meaning, 4 options
     retrieve -- meaning → word, 4 options
     produce -- meaning → write the word yourself (no options to lean on) */
const EX_LEN=20, EX_MIX=[0.4,0.3,0.3];
/* כמה שאלות במבחן היחידה · בקשת חגי: "כמו שאנחנו בוחרים כמה מילים לתרגל".
 *
 * 0 פירושו "כל היחידה", ולא "אפס" · כך אותה בחירה נשארת נכונה גם אחרי שהיחידה גדלה או
 * קטנה, במקום לשמור מספר שיהפוך יום אחד לחלקי. הרצפה היא 8 כי exBuild מסרב לבנות מבחן
 * מפחות מזה, והתקרה היא גודל היחידה עצמה · אין מאיפה לקחת עוד. */
const EX_SIZES=[10,20,30,50];
const exLenKey = () => 'hw_exLen'+(LANG==='en'?'_en':'');
/* טהורה בכוונה · הקריאה מהאחסון נעשית אצל הקורא. פונקציה שקוראת בעצמה מ-LS אינה ניתנת
   לבדיקה בלי לזייף את שכבת האחסון, וכלל החיתוך הוא בדיוק מה שצריך להיבדק. */
function exTake(poolLen, want){
  const w=int0(want);
  return Math.max(8, Math.min(w>0 ? w : poolLen, poolLen));
}
const exChosen = poolLen => exTake(poolLen, LS.get(exLenKey(), EX_LEN));   // למסך בלבד
let exQ=[], exI=0, exUnit=null, exAns=[];

/* Not every dictionary entry can be a test item. Some entries are fine to learn from and
   impossible to test: sentence templates ("either... or..."), and glosses that are a bare
   grammatical prefix · than, from and of are all "מ-" in the bank, so no option list built
   from them has one right answer. They stay in the practice bank and stay out of exams. */
function exTestable(term, meaning){
  if(/\.\.\.|…/.test(term) || /\.\.\.|…/.test(meaning)) return false;
  if(/^[א-ת]{1,2}-?$/.test(meaning)) return false;         // מ- · ש- · ו-
  if(meaning.replace(/[^א-ת]/g,'').length < 3) return false;
  return true;
}
/* Loan words are glossed by transliteration · drastic/דרסטי, organic/אורגני, strategy/אסטרטגיה.
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
   be "obviously from somewhere else". Anything that overlaps the real answer is discarded -- 
   two options that are both defensible make the item unanswerable, not hard. */
function exDistract(pool, item, field, taken, wider){
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
  // Prefer distractors that aren't another item's answer -- reusing one hands out that item's
  // solution a question early. In a unit small enough that the paper covers most of it there
  // is nothing else to draw on, so relax rather than fail to build the question at all.
  let ok=pool.filter(o=>usable(o) && !taken.has(norm(o[field])));
  /* שכבת ביניים, שנוספה אחרי v148. ההקלה שמתחת נכתבה ליחידות קטנות שהמבחן מכסה כמעט
     במלואן · אבל בורר "כל היחידה" הפך אותה לברירת המחדל בכל שאלה בכל יחידה: taken מכיל
     אז את כל הבריכה, ולכן השורה הראשונה תמיד ריקה. נמדד: בגודל 20 · 0 מתוך 56 מסיחים הם
     תשובה של שאלה אחרת; ב"כל היחידה" · 178 מתוך 532.
     wider הוא שאר השפה, ולכן מסיח משם עדיין באותה שפה ובאותו סוג מילה, והוא אינו תשובה
     של שום שאלה בטופס. רק כשגם הוא ריק חוזרים להקלה המקורית. */
  if(ok.length<3 && Array.isArray(wider) && wider.length){
    const seen=new Set(pool.map(o=>o.k));
    ok=ok.concat(wider.filter(o=>!seen.has(o.k) && usable(o) && !taken.has(norm(o[field]))));
  }
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
/* `want` הוא כמה שאלות. הוא מגיע כפרמטר ולא נקרא מהאחסון בפנים, כדי ש-exBuild תישאר
   פונקציה של הקלט שלה · הבדיקות מריצות אותה על כל יחידה בשתי השפות, ופונקציה שקוראת
   מ-LS הייתה מחייבת אותן לזייף את שכבת האחסון כדי לבדוק את בחירת המילים. */
function exBuild(uid, want){
  const pool=exWords(uid);
  if(pool.length<8) return [];
  const n=exTake(pool.length, want===undefined ? EX_LEN : want);
  // Keep morphological relatives out of the same paper. "evaluate" and "evaluation" are two
  // distinct entries, so nothing here counts them as a duplicate -- but sitting side by side
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
  const glossTaken=new Set();
  for(const c of shuffle(pool)){
    if(picked.length>=n) break;
    if(picked.some(p=>related(p.term,c.term))) continue;
    // אותו פירוש בשתי שאלות = אותה שאלה פעמיים. המקבילה ל-oneCardPerGloss שבתרגול.
    const g=glossKey(c.meaning);
    if(g.length>=2 && glossTaken.has(g)) continue;
    if(g.length>=2) glossTaken.add(g);
    picked.push(c);
  }
  if(picked.length<n) picked=shuffle(pool).slice(0,n);   // tiny unit / "כל היחידה" · coverage beats polish
  const nRec=Math.round(n*EX_MIX[0]), nRet=Math.round(n*EX_MIX[1]);
  // Write-in items ask for the word with no options to lean on, so put the single-word terms
  // in those slots. Expecting someone to type a three-word idiom letter-perfect measures
  // typing, not vocabulary.
  const oneWord=t=>!/\s/.test(String(t).replace(/\s*\/\s*/g,'/'));
  /* A one-word gloss that is itself a word in the bank makes an unfair write-in: "בד" is a
     defensible answer to the prompt "בד", and the item was after אָרִיג. Seven of them ·
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
  /* בריכת הגיבוי: שאר מילות השפה, מחוץ ליחידה הזאת. נבנית פעם אחת למבחן ולא לכל שאלה. */
  const nk=LANG==='en'?normEn:norm;
  const inUnit=new Set(pool.map(o=>o.k));
  const wider=[];
  for(const w of BANK){
    const k=nk(w.term);
    if(!k || inUnit.has(k) || !w.meaning) continue;
    if(!exTestable(w.term, w.meaning)) continue;
    wider.push({term:w.term, meaning:w.meaning, k});
  }
  // Every answer in the paper, so no distractor can leak one.
  const taken=new Set(picked.map(it=>norm(it.term)).concat(picked.map(it=>norm(it.meaning))));
  return picked.map((it,i)=>{
    const kind = i<nRec ? 'recognise' : i<nRec+nRet ? 'retrieve' : 'produce';
    if(kind==='recognise'){
      const d=exDistract(pool,it,'meaning',taken,wider);
      return d.length<3 ? null : {kind, it, prompt:it.term, answer:it.meaning, opts:shuffle([it.meaning,...d])};
    }
    if(kind==='retrieve'){
      const d=exDistract(pool,it,'term',taken,wider);
      return d.length<3 ? null : {kind, it, prompt:maskTerm(it.meaning,it.term), answer:it.term, opts:shuffle([it.term,...d])};
    }
    // A write-in has no options to disambiguate it, so if two words in the unit share a gloss
    // the prompt genuinely has two right answers · the unit lists both זלזל and פארה as "ענף".
    // Accept all of them. Marking someone wrong for the synonym they happened to recall is the
    // exact failure this whole audit was about.
    const accept=pool.filter(o=>norm(o.meaning)===norm(it.meaning)).map(o=>o.term);
    return {kind, it, prompt:maskTerm(it.meaning,it.term), answer:it.term, opts:null, accept};
  }).filter(Boolean);
}
const EX_KIND={recognise:'מה הפירוש?', retrieve:'איזו מילה מתאימה לפירוש?', produce:'כתוב את המילה'};
const exKey = uid => 'hw_exam'+(LANG==='en'?'_en':'')+':'+uid;

/* הבורר, והפירוט שמתחתיו. שניהם מצוירים יחד כי הפירוט נגזר מהבחירה · לצייר אותם בנפרד
   היה מאפשר להם להיפרד: מסך שמראה "20 שאלות" מעל בורר שעומד על 50. */
function renderExSize(poolLen){
  const chosen=exChosen(poolLen);
  // רק גדלים שבאמת מקטינים. "50" ליד יחידה של 30 הוא אותה בחירה בשם אחר
  const opts=EX_SIZES.filter(n=>n>=8 && n<poolLen).map(n=>({n,label:String(n)}))
             .concat([{n:0, label:'כל היחידה · '+poolLen}]);
  $('#exSizeSeg').innerHTML=opts.map(o=>{
    const on = o.n===0 ? chosen===poolLen : o.n===chosen;
    return `<button data-n="${o.n}" class="${on?'active':''}">${esc(o.label)}</button>`;
  }).join('');
  $('#exSizeSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    LS.set(exLenKey(), +b.dataset.n);
    renderExSize(poolLen);
  });

  const nRec=Math.round(chosen*EX_MIX[0]), nRet=Math.round(chosen*EX_MIX[1]);
  $('#exSub').textContent=`${chosen} שאלות מתוך ${poolLen} מילים ביחידה, בהגרלה חדשה בכל פעם. `+
    `המבחן מודד את ההתקדמות שלך בלבד.`;
  $('#exParts').innerHTML=
    `<div class="ex-part"><b>${nRec}</b><span>זיהוי · מילה ← פירוש, ארבע אפשרויות</span></div>
     <div class="ex-part"><b>${nRet}</b><span>שליפה · פירוש ← מילה, ארבע אפשרויות</span></div>
     <div class="ex-part"><b>${chosen-nRec-nRet}</b><span>כתיבה · פירוש ← לכתוב את המילה בעצמך</span></div>`;
}
function openExam(uid){
  exUnit=uid;
  const pool=exWords(uid);
  $('#exTitle').textContent='יחידה '+uid;
  if(pool.length<8){
    $('#exSub').textContent='ביחידה הזאת פחות מ-8 מילים, ואין ממה לבנות מבחן.';
    $('#exParts').innerHTML=''; $('#exStart').disabled=true;
  }else{
    renderExSize(pool.length);
    $('#exStart').disabled=false;
  }
  const hist=LS.get(exKey(uid),[]);
  const last=Array.isArray(hist)&&hist.length?hist[hist.length-1]:null;
  const best=Array.isArray(hist)&&hist.length?Math.max(...hist.map(h=>int0(h.pct))):null;
  $('#exKicker').textContent = last
    ? `מבחן יחידה · אחרון ${last.pct}% · שיא ${best}%` : 'מבחן יחידה';
  /* הפס והמונה יושבים ב-topbar, מחוץ ל-#exQuiz, ולכן הם גלויים גם כאן. בלי איפוס, מסך
     הפתיחה מציג את ההתקדמות של מבחן קודם שננטש. מאפסים לפני שמציגים אותו. */
  $('#exBar').style.width='0%'; $('#exCount').textContent='';
  hide($('#exQuiz')); hide($('#exResult')); show($('#exIntro'));
  goto('exam');
}
function startExam(){
  exQ=exBuild(exUnit, LS.get(exLenKey(), EX_LEN)); exI=0; exAns=[];
  if(!exQ.length){ toast('לא ניתן לבנות מבחן ליחידה הזאת. בחר יחידה אחרת'); return; }
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
   marked wrong · and that score is stored. Same question, two verdicts, and the stricter one
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

const EX_GRADE=[[90,'שליטה מלאה'],[75,'שליטה טובה'],[60,'בסיס קיים'],[40,'חצי הדרך · כדאי לתרגל את היחידה'],[0,'היחידה טרם נלמדה']];
function exFinish(){
  const n=exAns.length, ok=exAns.filter(a=>a.ok).length;
  const pct=n?Math.round(100*ok/n):0;
  $('#exBar').style.width='100%'; $('#exCount').textContent='';
  hide($('#exQuiz')); show($('#exResult'));
  $('#exScore').textContent=pct+'%';
  $('#exVerdict').textContent=`${ok} מתוך ${n} · ${(EX_GRADE.find(g=>pct>=g[0])||EX_GRADE[EX_GRADE.length-1])[1]}`;
  const per={recognise:[0,0], retrieve:[0,0], produce:[0,0]};
  exAns.forEach(a=>{ const p=per[a.kind]; if(!p) return; p[1]++; if(a.ok) p[0]++; });
  const NAMES={recognise:'זיהוי (מילה ← פירוש)', retrieve:'שליפה (פירוש ← מילה)', produce:'כתיבה עצמאית'};
  $('#exBreak').innerHTML=Object.keys(per).filter(k=>per[k][1]).map(k=>
    `<div class="ex-row"><span class="nm">${NAMES[k]}</span><span class="sc">${per[k][0]}/${per[k][1]}</span></div>`).join('');
  const missed=exAns.filter(a=>!a.ok);
  $('#exMissed').innerHTML = missed.length
    ? missed.map(a=>`<div class="ex-miss"><b>${esc(a.term)}</b> · ${esc(a.meaning)}`+
        (a.given?`<div class="yours">כתבת: ${esc(a.given)}</div>`:'')+`</div>`).join('')
    : '<div class="ex-miss">ידעת את כל המילים במבחן הזה. 🎯</div>';
  // history is capped: a score log that grows without bound is the kind of thing that
  // silently eats the localStorage quota months later
  const hist=LS.get(exKey(exUnit),[]);
  const arr=(Array.isArray(hist)?hist:[]).concat([{t:Date.now(), pct, n}]).slice(-20);
  LS.set(exKey(exUnit), arr);
  // exam history is part of the account's progress, but nothing ever asked for it to be sent -- 
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
$('#exCancel').onclick=()=>goBack();
$('#exDone').onclick=()=>goBack();
/* confirm() blocks the queue but does not cancel timers: answering the LAST question and then
   confirming "leave, the result will not be saved" let the pending tick fire, reach exFinish()
   and save the score anyway -- and in the level test it wrote hw_level, which is the gate that
   decides whether the test is ever offered again. */
let exTimer=null, lvTimer=null;
/* אותו דבר כאן: ✕ יציאה ב-topbar, מחוץ ל-#exQuiz, ולכן הוא נלחץ גם ממסך התוצאות ·
   ושם exFinish() כבר הוסיף את הציון ל-exKey() וקרא ל-queueRemoteSync(). התנאי
   !exAns.length מדלג על השאלה כשאין מה לאבד, אבל ממסך התוצאות יש תשובות, ולכן הוא לא
   הציל מהמשפט השקרי. */
/* השאלה עצמה עברה ל-navTo · נקודת היציאה היחידה · כדי ש"אחורה" של המערכת וה-✕
   ישאלו אותו דבר. כאן נשאר רק המעבר. */
$('#exExit').onclick=()=>goBack();

/* ===== printable sheet =====
   No PDF library: the CSP allows scripts from this origin only, and pulling in a bundler-sized
   dependency to draw text on a page would be the wrong trade anyway. The browser's own
   "print → save as PDF" produces a better sheet, works on every platform, and prints directly. */
/* The footer claims rights in what we actually made · the sheet, its layout and the app · 
   and grants personal/classroom use. It deliberately does NOT claim ownership of the
   vocabulary itself: the word lists came from published psychometric material, and an
   "all rights reserved" over someone else's content is both false and the kind of claim
   that invites the wrong letter. See the note in משימות.md. */
const SHEET_YEAR = new Date().getFullYear();
const SHEET_RIGHTS = `© ${SHEET_YEAR} <bdi>800+</bdi> · עיצוב הדף והאפליקציה · כל הזכויות שמורות · `+
  `מותר לשימוש אישי ולימודי · אין למכור או להפיץ בתשלום`;

/* size=0 means the whole unit. A full English unit is ~380 words, which is a real worksheet
   rather than a quiz, so those sheets go two-up: the answer is a single short word and two
   columns halve the page count. Hebrew sheets stay single-column -- you cannot write a
   definition on half a line. */
/* `uid` is normally a unit number. It can also be the string 'weak', which builds the same
   sheet from the words the learner is still getting wrong ACROSS all units -- the survey's top
   request, and the one case where a printable page is worth more than a unit sheet: it is
   exactly the list you would otherwise copy out by hand. */
/* שלושה סוגי דף, ולא שניים: יחידה · מילים לחיזוק · מילים שנלמדו. השלישי נוסף כי משתמש
   ביקש לחזור על מה שכבר ידע, ודף חזרה הוא בדיוק אותו מבנה · שאלה, שורה, ודף פתרונות. */
function sheetPool(uid){
  return uid==='weak' ? weakCards('global')
       : uid==='learned' ? learnedCards('global')
       : exWords(uid);
}
function buildSheet(uid, size){
  const isWeak = uid === 'weak';
  const isLearned = uid === 'learned';
  const pool = sheetPool(uid);
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
  // meaning is given and the English word is written -- matching how each side is actually tested.
  const askTerm = LANG!=='en';
  const q = it => askTerm ? it.term : it.meaning;
  const a = it => askTerm ? it.meaning : it.term;
  $('#sheet').innerHTML=`
    <div class="sh-page">
      <h1><bdi>800+</bdi> · ${isWeak?`מילים לחיזוק · ${langName}`:isLearned?`מילים שלמדתי · ${langName}`:`מבחן ${langName}, יחידה ${uid}`}</h1>
      <div class="sh-meta">${isWeak
        ? `${n} מילים לחיזוק, מכל יחידות הלימוד`
        : isLearned
        ? `${n} מילים שכבר בשליטה, מכל יחידות הלימוד`
        : (n===pool.length?`כל ${n} מילות היחידה`:`${n} מילים מתוך ${pool.length}`)} · ${date} · <bdi>800+</bdi></div>
      <div class="sh-fill"><span>שם:</span><span>תאריך:</span><span>ציון: ____ / ${n}</span></div>
      <div class="sh-inst">${askTerm
        ? 'כתוב את הפירוש של כל מילה. תשובה חלקית שמעבירה את המשמעות מזכה בנקודה מלאה.'
        : 'כתוב את המילה באנגלית שמתאימה לפירוש. איות מדויק נדרש.'}</div>
      <ol${askTerm?'':' class="two"'}>${items.map(it=>`<li><span class="sh-q${askTerm?ltr:''}">${esc(q(it))}</span>
        <span class="sh-line"></span></li>`).join('')}</ol>
      <div class="sh-foot">דף הפתרונות בסוף<br>${SHEET_RIGHTS}</div>
    </div>
    <div class="sh-page">
      <h1>דף פתרונות · ${isWeak?`מילים לחיזוק · ${langName}`:isLearned?`מילים שלמדתי · ${langName}`:`${langName}, יחידה ${uid}`}</h1>
      <div class="sh-meta">אותה הגרלה, אותו סדר · ${n} מילים</div>
      <div class="sh-key">${items.map((it,i)=>
        `<div>${i+1}. <b${askTerm?ltr:''}>${esc(q(it))}</b> · ${esc(a(it))}</div>`).join('')}</div>
      <div class="sh-foot">${SHEET_RIGHTS}</div>
    </div>`;
  return true;
}
const SHEET_SIZES=[25,50,100,0];      // 0 = the whole unit
function printSheet(uid){
  const isWeak = uid === 'weak';
  const isLearned = uid === 'learned';
  const total = sheetPool(uid).length;
  if(total<8){ toast(isWeak ? 'צריך לפחות 8 מילים לחיזוק כדי לבנות דף'
                    : isLearned ? 'צריך לפחות 8 מילים בשליטה כדי לבנות דף'
                    : 'ביחידה הזאת אין מספיק מילים לדף מבחן'); return; }
  const opts=SHEET_SIZES.filter(n=>!n || n<total);
  $('#sheetOpts').innerHTML=opts.map(n=>
    `<button data-n="${n}">${n||((isWeak||isLearned)?'כולן · ':'כל היחידה · ')+total}</button>`).join('');
  $('#sheetAskSub').textContent = (isWeak
    ? `${total} מילים לחיזוק מכל היחידות. `
    : isLearned
    ? `${total} מילים בשליטה מכל יחידות הלימוד. `
    : `ביחידה ${total} מילים. `) + 'הדף נפתח בחלון ההדפסה, ומשם אפשר להדפיס או לשמור כ-PDF.';
  sheetUid=uid;
  show($('#sheetAsk'));
}
let sheetUid=null;
$('#sheetOpts').onclick=e=>{
  const b=e.target.closest('button[data-n]'); if(!b||!sheetUid) return;
  const uid=sheetUid, n=+b.dataset.n;
  hide($('#sheetAsk')); sheetUid=null;
  if(!buildSheet(uid,n)){ toast('לא ניתן לבנות את הדף. נסה שוב, ואם זה חוזר בחר יחידה אחרת'); return; }
  // give the browser a frame to lay the sheet out before it snapshots the page
  setTimeout(()=>{ try{ window.print(); }catch(e){ toast('חלון ההדפסה לא נפתח. בדוק שחלונות קופצים אינם חסומים בדפדפן ונסה שוב'); } }, 80);
};
$('#sheetCancel').onclick=()=>{ sheetUid=null; hide($('#sheetAsk')); };
$('#sheetAsk').onclick=e=>{ if(e.target===$('#sheetAsk')){ sheetUid=null; hide($('#sheetAsk')); } };

/* ===== account -- every screen above this line requires a signed-in user =====
   This is the ONLY place app.js touches Store; everything else stays pure UI. */
let currentUser=null, syncTimer=null;

/* Progress is more than hw_stats. The level-test result, the unit-exam history and the round
   size were written to localStorage only, so "one account and your progress follows you"
   stopped being true at the language gate: a second device sent the learner back through a
   level test they had already finished, and their exam scores were simply absent. The keys are
   per-language, so they are collected under the language the row is keyed by -- never the
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
  // exam is per PERSON, not per language -- it rides both rows and whichever syncs first wins
  const out = { level:LS.get(levelKeyFor(lang),null), size:LS.get(sizeKeyFor(lang),null), exams,
                exam:LS.get(EXAM_KEY,null) };
  /* השלמת משפטים · אנגלית בלבד, ולכן רק על השורה של אנגלית.
     ⭐ נוסע בבלוב הקיים ולא בטבלה חדשה: ישות חדשה ב-Supabase דורשת סכימה, RLS
     ומיגרציה, והבלוב הזה כבר מסונכרן, כבר מוגן ב-RLS, וכבר ממוזג additively. */
  if(lang==='en'){ const p = LS.get(SENT_PROG, null); if(isObj(p)) out.sent = p; }
  return out;
}
/* Same rule as mergeProgress: additive only. A local value already present is never replaced,
   so a device that is ahead can't be pulled backwards by an older row. */
function applyExtras(lang, ex){
  if(!isObj(ex)) return;
  if(ex.level && !LS.get(levelKeyFor(lang),null)) LS.set(levelKeyFor(lang), ex.level);
  if(ex.size!=null && LS.get(sizeKeyFor(lang),null)==null) LS.set(sizeKeyFor(lang), ex.size);
  if(ex.exam && !LS.get(EXAM_KEY,null)) LS.set(EXAM_KEY, ex.exam);
  /* השלמת משפטים · מיזוג **מונוטוני** לכל פריט בנפרד, ולא "אם אין מקומי אז קח".
     ⚠ החוק כאן שונה מהשדות שלמעלה, ובכוונה: level ו-size הם ערך אחד שמכשיר אחד
     קובע, ואילו זו מפה שבה **שני מכשירים יכולים להתקדם במקביל** בפריטים שונים.
     "אם אין מקומי" היה מוחק את מה שהמכשיר הזה פתר. מקסימום על n ועל ok אינו יכול
     לרדת, ולכן מכשיר שמאחר לא גורר אחורה מכשיר שקדם לו. */
  if(lang==='en' && isObj(ex.sent)){
    const loc = sentProg();          // כולל את ההגירה מהמבנה הישן
    let changed = false;
    for(const src of Object.keys(ex.sent)){
      const r = ex.sent[src]; if(!isObj(r)) continue;
      const l = loc[src] || { n:0, ok:0, last:0 };
      const n = Math.max(Number(l.n)||0, Number(r.n)||0);
      const ok = Math.max(Number(l.ok)||0, Number(r.ok)||0);
      /* ok לא יכול לחרוג מ-n. שורה מהענן עם ok גדול מ-n היא שורה פגומה, והחסימה
         כאן מונעת אחוז שליטה מעל 100 שנראה כמו באג בחישוב ולא כמו נתון שבור. */
      const fixed = Math.min(ok, n);
      if(n!==(l.n||0) || fixed!==(l.ok||0)){
        loc[src] = { n, ok:fixed, last: l.n ? l.last : (Number(r.last)?1:0) };
        changed = true;
      }
    }
    if(changed) LS.set(SENT_PROG, loc);
  }
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

/* אחד לכל שפה, ולא דגל יחיד. flushRemoteSync דוחף תמיד שפה אחת בלבד (`lang` למטה), ולכן
   דגל משותף נוקה על ידי שפה שלא הייתה זו שממתינה: סבב עברית שהדחיפה שלו נכשלה נשאר על
   הדיסק בלבד, ואז flush מוצלח של אנגלית הכריז "אין מה לשמור". signOutNow קורא בדיוק את
   התשובה הזאת לפני localStorage.clear() · כלומר הסבב העברי נמחק כאילו הגיע לענן. */
const syncPending={he:false, en:false};
/* Returns TRUE only when there is nothing left unsaved -- either the write landed, or there was
   nothing to write. Every bail-out returns FALSE, because signOutNow awaits this and then runs
   localStorage.clear(): a flush that quietly failed used to look identical to one that
   succeeded, and the only remaining copy of the session was erased a line later. */
async function flushRemoteSync(){
  if(!currentUser || !syncPending[LANG]) return true;
  // same reason as syncWithRemoteInner: this path merges and writes too (app.js:2714)
  if(!langLoaded) return false;
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
    syncPending[LANG]=false;
    /* Deliberately NOT bindCacheToUser here. That call can run wipeAccountKeys() and set
       LANG=null -- and this runs from a debounced background timer, so it could blank the
       language underneath a learner mid-round. Refusing the write is the whole job; the owner
       stamp is re-established on the next boot, and the `storage` listener already reloads the
       page when hw_owner actually changes elsewhere. */
    return false;
  }
  const lang=LANG;
  /* pushProgress is a whole-row upsert, so EVERY write must be preceded by a read. An earlier
     version merged once per language and then wrote blind for the rest of the page's life -- 
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
         built from exactly those two. syncWithRemoteInner rebuilds; this path never did -- and
         since commitSession now flushes at the end of EVERY round, it is the common path.
         A word deleted on the phone stayed in the deck on the laptop until the next reload. */
      /* Prune AFTER the merge, exactly as syncWithRemoteInner does (app.js:2766) -- this path had
         no prune at all, and it is the COMMON one: commitSession flushes at the end of every
         round. The merge is max-based, so every orphan the cloud still holds came straight back
         and was pushed out again by the write below, which is what made them immortal. */
      pruneOrphans();
      buildBank();
      if(!$('#home').classList.contains('hidden')) renderHome();
      /* mergeProgress covers stats/assoc/deleted/added -- it knows nothing about extras. Without
         this, collectExtras below read a device that had never seen the other one's exam
         history and pushed right over it. applyExtras is additive, so this only ever adds. */
      applyExtras(lang, res.data.extras);
    }
  }
  /* THE WRITE, AND WHY ITS RESULT IS READ
     Store.pushProgress reports a refused write by RETURNING false, not by throwing (store.js:64).
     This used to `await` it inside a try/catch and `return true` regardless, so only a thrown
     error counted as failure -- and a network error, an RLS refusal or an expired token all
     return false. signOutNow (app.js:3132) reads that answer and runs localStorage.clear() on
     it, erasing the only remaining copy of everything done since the last good sync. One word.

     syncPending is cleared only once the write has actually landed. Clearing it before the
     write -- as this did -- meant the one failure that can still lose data was also the one
     failure nothing ever retried. Every path that returns false now leaves the save queued. */
  let ok=false;
  try{
    /* The owner check at the top of this function ran BEFORE the read. Passing the id here makes
       store.js check it again immediately before the write, which is the only place that can
       catch a session changing while the read was in flight. */
    ok = await Store.pushProgress(lang, {assoc, stats, deleted:[...deleted], added, dir:direction,
                                         extras:collectExtras(lang)}, currentUser.id) === true;
  }catch(e){ ok=false; }
  if(ok) syncPending[lang]=false;   // `lang`, not LANG: this is the row that was actually written
  return ok;
}
/* 1,500ms was shorter than the gap between two answers, so every single answer produced a full
   round trip -- and pushProgress is a whole-row upsert preceded by a whole-row read. A learner
   with real history carries a ~51KB row, so one answer moved ~100KB. Thirty testers practising
   for an hour would have moved on the order of a gigabyte, against a 5GB monthly egress budget:
   the ceiling here is bandwidth, not requests.
   Twelve seconds instead. Nothing is risked by waiting: the save is already forced at every
   point where the page can lose it -- round end (commitSession), tab hidden, pagehide, language
   switch and sign-out -- and a queued save survives every early return in flushRemoteSync. */
const SYNC_DEBOUNCE_MS = 12000;
function queueRemoteSync(){
  if(!currentUser) return;
  if(LANG!=='he' && LANG!=='en') return;        // nothing to key the row by yet
  syncPending[LANG]=true;
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
   Now that every push reads and merges first, this cannot always complete inside a pagehide -- 
   and that is accepted: the data is already in localStorage and syncs on the next open. The one
   path that MUST complete is sign-out, because it erases localStorage, and that one awaits. */
window.addEventListener('pagehide', flushRemoteSync);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushRemoteSync(); });

/* Merge is max-based, never subtractive -- the same rule migrateStores already uses -- so a
   sync race between two devices can only make progress look better than it is, never erase it. */
function mergeProgress(local, remote){
  if(!remote || !isObj(remote)) return local;
  const words={};
  const lw=isObj(local.stats)&&isObj(local.stats.words)?local.stats.words:{};
  const rw=isObj(remote.stats)&&isObj(remote.stats.words)?remote.stats.words:{};
  /* Same failure as the deletions above, one layer down: restoring level-test skips DELETES the
     local record, and a union over both key sets brought it straight back from the cloud. A
     record can never be removed by a max-merge, so the restore has to be stated, not inferred -- 
     inferring it from "absent locally" would wipe every skip the first time a new device synced. */
  const restoredStats=isObj(local.undeleted)?local.undeleted:{};
  /* `last` is whatever Date.now() said on the device that wrote it, and nothing validates it. A
     phone whose clock runs two days fast does not just win one conflict: max(last) below keeps its
     stamp IN the record, so it goes on beating every honest answer until real time catches up -- a
     word the learner keeps failing stays pinned at level 3, counts as learned, and leaves the
     practice queue. So a stamp is not allowed to rank above the present. Clamped, never discarded:
     the record still arrives whole, it just stops outranking now.
     Five minutes of slack, and it has to be non-zero. Honest clocks drift, the cloud copy was
     itself stamped by ANOTHER device's clock, and the sync round trip takes real time -- at zero
     margin this would start losing writes that were perfectly valid. Five minutes covers all of
     that while capping the damage from a lying clock at five minutes instead of two days. */
  const stampCap=Date.now()+300000;
  for(const k of new Set([...Object.keys(lw),...Object.keys(rw)])){
    if(!lw[k] && rw[k] && rw[k].src==='lv' && restoredStats[k]) continue;   // explicitly un-skipped
    const a=saneRec(lw[k]), b=saneRec(rw[k]);
    a.last=Math.min(a.last,stampCap); b.last=Math.min(b.last,stampCap);
    /* The record that was written LAST wins. Taking Math.max per field looked safe but was not:
       a downgrade after a wrong answer could never survive, because the older copy still held
       the higher level -- so a word the learner had just failed stayed marked as known. Counts
       still take the max, since they only ever grow.
       But "written last" is only a question when both sides actually WROTE something. saneRec
       turns a missing record into a fully zeroed one, and that placeholder used to enter the
       comparison as if it were data and win the tie at 0 -- so a remote-only record stamped
       last:0 arrived at level 0 while the mirror image kept its level. Presence first, then
       timestamps: a side that does not hold the word at all does not get a vote. */
    const hasA=isObj(lw[k]), hasB=isObj(rw[k]);
    const newer = hasA!==hasB ? (hasA ? a : b) : (a.last >= b.last) ? a : b;
    words[k]={ seen:Math.max(a.seen,b.seen), first:Math.max(a.first,b.first), ever:Math.max(a.ever,b.ever),
               wrong:Math.max(a.wrong,b.wrong), level:newer.level, last:Math.max(a.last,b.last) };
    if(newer.src) words[k].src=newer.src;
    /* ⛔ t0 · min, לא max. הנימוק ב-saneRec. חיוביים בלבד: 0 הוא רשומה חסרה. */
    const t0s=[int0(a.t0), int0(b.t0)].filter(x=>x>0);
    if(t0s.length) words[k].t0=Math.min(...t0s);
    /* saneRec ו-mergeProgress הן שתי רשימות לבנות נפרדות, ושדה שנוסף לאחת ולא לשנייה נמחק
       בשקט בסנכרון הבא. כך אבדו כאן `sens` ו-`k0` · ולא בהתנגשות בין מכשירים, אלא בכל
       סבב: flushRemoteSync ממזג בסופו, ו-absorbDisk ממזג בין שתי לשוניות.
       הנזק היה שהמיזוג ביטל שני תיקונים שכבר נעשו · sens החזיר כל מילה רב-משמעית ל"לחיזוק"
       לצמיתות, ו-k0 שנמחק בעוד src:'known' שרד הפך את ביטול הסימון למחיקת היסטוריה.
       איחוד ל-sens, כי פירוש שנכתב במכשיר אחד נכתב; מקסימום ל-k0, כי הוא היסטוריה
       ולהעדיף את הנמוך פירושו שסנכרון יכול להוריד רמה שהלומד השיג. */
    const sens=[...new Set([...(Array.isArray(a.sens)?a.sens:[]), ...(Array.isArray(b.sens)?b.sens:[])])]
                 .map(x=>int0(x,7)).sort((p,q)=>p-q);
    if(sens.length) words[k].sens=[...new Set(sens)];
    if(a.k0!==undefined || b.k0!==undefined) words[k].k0=Math.max(int0(a.k0), int0(b.k0));
  }
  const ls=Array.isArray(local.stats&&local.stats.sessions)?local.stats.sessions:[];
  const rs=Array.isArray(remote.stats&&remote.stats.sessions)?remote.stats.sessions:[];
  /* Sessions carry no id, and the local list is the one that was pushed to the server -- so a
     plain concat re-added every round the device already had. Each return to a language
     doubled the history (3 -> 6 -> 12 -> 24) until the 200 cap filled with copies and real
     practice days fell out, shrinking the streak. Dedupe on the round's own fields, and sort,
     because the two lists are not necessarily in chronological order. */
  /* Rows carry `rid` since 2.8.2026, and it is preferred over the composite key -- but only when
     BOTH sides have one, so a row written by an older build still dedupes the way it always did.
     KEEPING THE FIRST COPY IS NOT ENOUGH once ids exist. The same round can be present on both
     sides at different stages: the phone has 8 answers of it, the cloud copy has 5. They share a
     rid, and dropping whichever arrives second would throw away three real answers half the time.
     The fuller copy wins -- more answers recorded is strictly more of what happened. */
  const bySess=new Map(); const seenSess=new Set();
  for(const x of [...rs,...ls].filter(isObj)){
    if(!x.rid){                                          // legacy row: the old behaviour, unchanged
      const id=[x.t,x.scope,x.total,x.correct].join('|');
      if(seenSess.has(id)) continue;
      seenSess.add(id); bySess.set('legacy:'+id, x); continue;
    }
    const k='r:'+x.rid, prev=bySess.get(k);
    if(!prev){ bySess.set(k,x); continue; }
    const better=(int0(x.total)!==int0(prev.total)) ? (int0(x.total)>int0(prev.total) ? x : prev)
                                                   : (int0(x.t)>=int0(prev.t) ? x : prev);
    bySess.set(k,better);
  }
  const sessions=[...bySess.values()]
    .sort((x,y)=>(Number(x.t)||0)-(Number(y.t)||0))
    .slice(-MAX_SESSIONS);
  const mergedAssoc={...(isObj(remote.assoc)?remote.assoc:{}), ...(isObj(local.assoc)?local.assoc:{})};
  /* Deletions merged as a plain union, which meant a RESTORE could never survive: the user
     brought a word back, the cloud copy still listed it as deleted, and the next sync put it
     straight back in the bin. "ניתן לשחזר" was true for about ninety seconds.
     A union cannot express "this was un-deleted" · it has no way to tell a deletion this device
     has not heard of yet from one it has deliberately reversed. So restores are recorded
     explicitly and subtracted after the union.
     Scope, stated honestly: the restore log is per-device. Another device that still lists the
     word keeps its own copy deleted until it syncs its own restore. Making that symmetric needs
     per-key deletion timestamps · tombstones · which is a change to the stored shape and a
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
  /* THE GUARD. Everything below merges the globals with the cloud and then writes the result to
     BOTH. If loadLangState() has not run, those globals are empty and this silently replaces a
     full device with an older cloud copy. Refusing costs a sync that had nothing to contribute;
     not refusing cost a real learner a full offline session. */
  if(!langLoaded){
    console.warn('sync skipped: the language state has not been loaded into memory yet');
    return;
  }
  /* מי אנחנו לפני הקריאה. store.js:142 מקבל את זה בדיוק בשביל החלון שבין ה-pull ל-push:
     החשבון יכול להתחלף באמצע (קישור אישור שנפתח באותה לשונית, טוקן שהתרענן לחשבון אחר),
     והכתיבה למטה נושאת את המצב שמוזג מהחשבון הקודם. RLS לא רואה את זה · היא מאשרת כתיבה
     חוקית לחלוטין לשורה של החשבון החדש. רק הקורא יודע עם מי הוא התחיל. */
  const uid = currentUser && currentUser.id;
  let res=null;
  try{ res=await Store.pullProgress(lang); }catch(e){ return; }
  /* A failed read used to look exactly like an empty cloud, and the push below then wrote the
     local state over it. On a fresh device the local state is EMPTY -- one dropped request was
     enough to erase everything the account had. Only a confirmed read may be followed by a write. */
  if(!res || res.ok!==true) return;
  const remote=res.data;
  if(remote) applyExtras(lang, remote.extras);   // level / exams / size are not language-loaded state
  if(remote && lang===LANG){
    const before = added.length;
    /* undeleted חסר כאן והיה קיים בשני מסלולי המיזוג האחרים. בלעדיו mergeProgress אינו יכול
       לחסר את מה שהלומד שחזר, האיחוד מחזיר את המחיקה מהענן, saveDeleted כותב אותה לדיסק
       ו-pushProgress דוחף אותה בחזרה · ואז המסלול הבא, שכן מעביר את היומן, משחזר שוב.
       המילה מהבהבת פנימה והחוצה לפי מי סנכרן אחרון. pullIfStale רץ על focus, כך שמעבר
       ללשונית אחרת וחזרה הספיק. */
    const merged=mergeProgress({assoc,stats,deleted:[...deleted],added,dir:direction,undeleted:restoredMap()}, remote);
    assoc=merged.assoc; stats=merged.stats; deleted=new Set(merged.deleted); added=merged.added; direction=merged.dir;
    /* Prune AFTER the merge, not only before it. enterLang() prunes and then syncs -- and the
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
                            extras:collectExtras(lang)}, uid).catch(()=>{});
}

function translateAuthError(err){
  const m=(err&&err.message)||'';
  if(/already registered|already exists/i.test(m)) return 'כבר יש חשבון עם המייל הזה. נסה להתחבר.';
  /* Not just "wrong": the second sentence is the way out. Whoever let the browser generate a
     password never saw it, so "נסה שוב" is advice they cannot act on · the reset link is the
     only real path back in, and it has to be named here or it will not be found. */
  if(/invalid login credentials/i.test(m))
    return 'אימייל או סיסמה שגויים. אם הדפדפן יצר לך סיסמה ואינך יודע אותה, לחץ "שכחתי סיסמה" למטה.';
  if(/password.*(least|short|weak)/i.test(m)) return 'הסיסמה חייבת להיות לפחות 8 תווים.';
  if(/email.*invalid/i.test(m)) return 'כתובת אימייל לא תקינה.';
  if(/rate limit|too many/i.test(m)) return 'המערכת עמוסה כרגע. נסה שוב בעוד כמה דקות.';
  if(/confirm|not confirmed/i.test(m)) return 'צריך לאשר את מייל האימות לפני ההתחברות. אם הוא לא הגיע, בדוק בספאם.';
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
  // cache:'no-store' -- asking the network, not the copy this device already holds
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
  if(!sv) return;                                   // offline -- say nothing rather than guess
  if(sv===BUILD){ el.innerHTML=`גרסה <b>${BUILD}</b> · מסונכרן ✓`; return; }
  /* This used to be a sentence. A sentence asking the user to perform a browser action is not
     a fix -- it is a note. The same detection now offers the action itself. */
  el.innerHTML=`גרסה <b>${BUILD}</b> · <span class="stale">יש גרסה ${sv}</span>`;
  applyUpdate(sv);
}

/* ===== bug reports =====
   A report without context is unusable, so the screen / language / build / device are captured
   automatically. If the feedback table isn't created yet, fall back to email rather than
   silently swallowing what the user just wrote. */
/* The product's own address, not the owner's personal Gmail. Switched only after inbound mail
   to admin@800-plus.com was confirmed arriving -- this is the fallback that carries a bug report
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
    lang: LANG||'–',
    build: (v.match(/v=(\d+)/)||[])[1] || '?',
    level: LS.get('hw_level',null) || LS.get('hw_level_he',null),
    standalone: isStandalone(),
    viewport: innerWidth+'×'+innerHeight,
    ua: navigator.userAgent.slice(0,160)
  };
}

/* One plain-Hebrew name per field fbContext() sends. The privacy policy says these are "shown to
   you in the form before sending", and for a while that was true of three of them: the screen,
   the language and the build. The device string and the window size were collected and not
   mentioned. Both are genuinely needed -- a fault that only happens on an iPhone looks nothing
   like the same fault on a desktop -- so the answer was to name them, not to stop sending them.
   The map is keyed by the payload's own keys and the sentence is built by walking the payload,
   so adding a field to fbContext() without a label here cannot hide it: the raw key shows up in
   the line, ugly and visible, instead of quietly going undisclosed. */
const FB_CTX_LABELS={
  screen:'המסך שהיית בו',
  lang:'שפת התרגול',
  build:'גרסת האפליקציה',
  level:'הרמה שלך',
  standalone:'אם פתחת כאפליקציה מותקנת',
  viewport:'גודל החלון',
  ua:'סוג הדפדפן והמכשיר'
};
function fbCtxSentence(ctx){
  const parts=Object.keys(ctx).map(k=>FB_CTX_LABELS[k]||k);
  const last=parts.pop();
  return 'נשלח יחד עם הדיווח: '+parts.join(', ')+', ו'+last+'.';
}
function openFeedback(){
  fbKind='bug';
  $('#fbKinds').querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.k==='bug'));
  $('#fbBody').value='';
  $('#fbMsg').classList.add('hidden');
  /* The diagnostic line used to sit in the dialog in monospace, and a tester asked what it was.
     Fair question: `screen:results · lang:en · build:100 · 393×793` means nothing to her, and a
     form that shows you something you cannot understand reads as a form you might be breaking.
     It still travels with every report -- it is what makes a report reproducible -- it is just no
     longer shown as raw values. One plain sentence takes its place, because silently attaching
     device details would be worse than showing them.
     The sentence that replaced it named three of the seven fields, which is how the privacy
     policy came to promise a disclosure the form did not make. It is now GENERATED from the
     payload, so the two cannot drift apart again. */
  $('#fbCtx').textContent=fbCtxSentence(fbContext());
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
  const lines=[body,'','· הקשר אוטומטי ·',...Object.entries(ctx).map(([k,v])=>`${k}: ${v}`)];
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
    if(r.missingTable){ msg.className='msg'; msg.textContent='נפתח לך מייל עם הדיווח. נשאר רק לשלוח.'; fbMailto(body,ctx); return; }
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
  /* The age declaration belongs to sign-up alone. Leaving it visible on the sign-in tab would
     block someone who already has an account with a box about a threshold they crossed long ago.
     The tick is cleared on every mode change, not only on leaving: a declaration that survives a
     tab switch is one the NEXT person on a shared device inherits without ever making it. */
  if(!keepMsg) $('#authMsg').classList.add('hidden');   // keepMsg: don't wipe a message we just wrote
}
document.querySelectorAll('#authTabs button').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.tab));
/* The local cache belongs to exactly one account. A session can end without a click on
   "יציאה" (token expiry, cleared cookies, shared device) · and then the next person to sign
   in here would have the previous user's progress merged into THEIR account. So the cache is
   stamped with its owner, and any mismatch wipes it before a single byte is read. */
/* Every hw_* key belongs to whoever was signed in when it was written. The old list was
   hand-maintained and did not know about keys built at runtime -- hw_exam:3, hw_exam_en:7,
   hw_level_he -- so exam scores and level results survived a change of account and were shown
   to the next person. Sweeping by prefix cannot fall behind a new key again. */
function wipeAccountKeys(){
  const doomed=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && k.startsWith('hw_') && k!=='hw_owner' && k!=='hw_seenIntro' && k!=='hw_instDismissed' && k!=='hw_waOffered' && k!=='hw_vidOffered')
      doomed.push(k);
  }
  doomed.forEach(k=>LS.del(k));
  return doomed.length;
}
/* `adopt` is the preview handover. A visitor practises under owner='preview', and the landing
   page tells them their progress is kept -- but a brand-new account is still an owner change,
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
   Two screens read straight out of localStorage -- the welcome dashboard (langSummary) and the
   level-test gate -- and on a fresh device localStorage is empty. A returning learner with 188
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
       syncWithRemote when that language is actually entered -- with its own normaliser
       loaded, which is what `added` has to be keyed by. Merging it from here would key it
       with the wrong one. */
    if(hasProgressIn(lang)>0) continue;
    const sk = lang==='en' ? '_en' : '';
    /* Each key is filled only if it is EMPTY here. An earlier version keyed the whole decision
       off the stats side, so a visitor who had added or deleted words without practising yet
       had that work overwritten by the cloud copy. */
    const empty = (k,isArr) => { const v=LS.get(k, null);
      return v==null || (isArr ? (!Array.isArray(v) || !v.length) : !Object.keys(isObj(v)?v:{}).length); };
    /* יומן התרגול נספר כהתקדמות, בדיוק כמו המילים.
       hasProgressIn סופרת רק מילים עם seen>0, ולכן היא מחזירה 0 גם למי שיש לו יומן
       תרגול מלא · והשורה הזאת הייתה היחידה כאן בלי בדיקת empty, כך שהיומן נדרס.
       המצב הזה אינו תיאורטי: מחיקה בכמות מוחקת את stats.words ואינה נוגעת ב-sessions.
       מי שתרגל יחידה ואז מחק את המילים שלה נשאר בדיוק כך · יומן בלי מילים · והחיבור
       הבא היה מוחק לו את ימי התרגול ואת הרצף.
       כשיש יומן מקומי לא ממלאים כאן כלום: syncWithRemote תמזג כשנכנסים לשפה, וזה
       הנתיב שיודע למזג באמת במקום להחליף צד אחד בשני. */
    const lsRaw = LS.get('hw_stats'+sk, null);
    const hasLog = isObj(lsRaw) && Array.isArray(lsRaw.sessions) && lsRaw.sessions.length>0;
    if(isObj(d.stats) && !hasLog)  LS.set('hw_stats'+sk,   d.stats);
    if(isObj(d.assoc)   && empty('hw_assoc'+sk,false))   LS.set('hw_assoc'+sk,   d.assoc);
    if(Array.isArray(d.deleted) && empty('hw_deleted'+sk,true)) LS.set('hw_deleted'+sk, d.deleted);
    if(Array.isArray(d.added)   && empty('hw_added'+sk,true))   LS.set('hw_added'+sk,   d.added);
    if(d.dir && LS.get('hw_dir'+sk,null)==null) LS.set('hw_dir'+sk, d.dir);
    if(lang===LANG) loadLangState();          // the active language is already in memory
  }
  /* Accounts created before the extras field have no stored test result to restore -- but a
     learner with real history plainly does not need a placement test. */
  if(!levelDone()) for(const lang of ['en','he'])
    if(hasProgressIn(lang)>=10){ LS.set(levelKeyFor(lang),'skipped'); break; }
}

/* The name appears on two screens and both are the way into the account page, so they are
   written together -- a badge that says one thing on the welcome screen and another on the home
   screen is how "which account am I actually in" becomes a question. */
function setBadges(text){
  const t=text||'';
  /* ⚠ `#userBadgeM` נוסף ב-11.8. התיעוד שלמעלה אומר במפורש שכל התגים נכתבים יחד,
     ומסך בחירת התרגול הגיע עם תג משלו שלא נכנס לרשימה · ולכן הוא נשאר ריק אחרי
     שינוי שם. נמדד בציד: `userBadge='NEWNAME'` מול `userBadgeM=''`. */
  ['#userBadge','#userBadgeW','#userBadgeM'].forEach(id=>{ const el=$(id); if(el) el.textContent=t; });
}

async function afterAuthed(justSignedUp){
  bindCacheToUser(currentUser.id, justSignedUp);   // a fresh account inherits the preview it came from
  /* השם נקרא מהרשת, ולכן במצב טיסה הוא לא הגיע והוחלף בכתובת המייל · נמדד בטלפון
     ב-2.8. זה נראה כאילו נכנסת לחשבון אחר, וזו ההרגשה הכי גרועה שאפשר לתת למי שפתח
     את האפליקציה בלי רשת.
     hw_name כבר נשמר כאן מאז ומעולם; פשוט אף אחד לא קרא אותו במסלול הכישלון. */
  const cachedName = () => { const n=LS.get('hw_name',''); return (typeof n==='string' && n) ? n : ''; };
  try{
    const { profile:p }=await Store.myProfile();
    if(p && p.username){
      setBadges(p.username);
      LS.set('hw_name', p.username);  // the dashboard greets by name before any network call returns
    } else {
      /* אין פרופיל ואין שגיאה · משתמש חדש לפני שנוצרה לו שורה. השם השמור עדיף על
         המייל, והמייל עדיף על ריק. */
      setBadges(cachedName() || currentUser.email || '');
    }
  }
  catch(e){ setBadges(cachedName() || currentUser.email || ''); }
  await showAdminIfAllowed();
  /* BEFORE the subscription gate: a locked user can still press "יציאה", and sign-out writes to
     the cloud. Reaching that write with a device that never fetched the account meant the locked
     screen's own promise · "שום מילה שלמדת לא נמחקת" · was false. */
  await pullAccountState();
  if(!(await accessOk())) return;      // subscription lapsed -- the gate owns the screen from here
  show($('#fbFab'));            // reporting a bug must never be more than one tap away
  /* The level test was being forced on EVERY sign-in. Signing out runs localStorage.clear(),
     and the cloud copy of the result is only read by syncWithRemote -- which needs a language,
     which is chosen AFTER this gate. So the gate always read an empty local key and sent the
     learner back through a test they had already finished. The result is now fetched before
     the gate decides, and only a confirmed read counts. */
  // First run: offer the level test once. Everything else lands on the language picker.
  if(bootTimedOut){ renderWelcome(); }        // the watchdog already placed the user; do not move them
  else if(!levelDone()){ hide($('#lvQuiz')); hide($('#lvResult')); show($('#lvIntro')); goto('level'); }
  else renderWelcome();
  // With email confirmation on, sign-up never yields a session -- so the install offer has to
  // ride on the first successful sign-in, not on the sign-up call.
  if(justSignedUp || !LS.get('hw_instOffered',0)){ LS.set('hw_instOffered',1); setTimeout(()=>promptInstall(false),600); }
  /* שני דברים שונים, ולכן שני תנאים שונים.
     ה-CTA הוא כפתור באפליקציה. לחיצה עליו היא מה שפונה לדפדפן, ולכן הצגתו למי שנכנס
     היום אינה מסכנת כלום · מי שלא מעוניין פשוט לא לוחץ. קודם הוא הוסתר עד יומיים של
     תרגול, וזה בדיוק מה שהוליד את הדיווח "לא ידעתי שיש התראות": התכונה הייתה קיימת
     ובלתי נראית לכל מי שעדיין לא צבר רצף.
     הדיאלוג (למטה) הוא ההפך · הוא שואל ביוזמתו, ותשובה שלילית בדפדפן היא לצמיתות.
     הוא נשאר מאחורי יומיים. */
  setTimeout(()=>{ if(NOTIF.askable()) $('#notifCta').classList.remove('hidden'); }, 1200);
  /* וגם, פעם אחת בלבד: דיאלוג ולא כפתור שורה. משתמשת שתרגלה שבועות דיווחה שלא ידעה
     שיש התראות · ה-CTA קיים, אבל מי שכבר התרגל למסך מפסיק לסרוק אותו. התנאי זהה
     (askable + שני ימי תרגול), כך שהיגיון "לא לשאול זר" נשמר; מה שמשתנה הוא רק
     שהשאלה נשאלת פעם אחת במקום להמתין שיבחינו בה. */
  setTimeout(()=>{
    if(NOTIF.askable() && streakInfo().total>=2 && !LS.get('hw_notifOffered',0)){
      LS.set('hw_notifOffered',1);
      show($('#notifAsk'));
    }
  }, 2000);
  /* Refresh the cached reminder on every sign-in. It used to be written once, while asking for
     permission, and then never again -- so the background worker kept announcing a streak the
     learner had left behind months earlier. */
  if(NOTIF.granted()) NOTIF.cacheMessage();
  NOTIF.openTimeNudge();
}

$('#authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('#authEmail').value.trim(), pw=$('#authPassword').value, uname=$('#authUsername').value.trim();
  /* This used to un-hide the message element BEFORE writing to it · so the text left over from
     the previous attempt was revealed and sat there for the whole round trip. Signing up with a
     fresh address flashed "אימייל או סיסמה שגויים" for a second before the real answer arrived.
     Never reveal the box without also replacing what is in it. */
  const msg=$('#authMsg'); msg.className='au-msg';
  msg.textContent = authMode==='signup' ? 'יוצר חשבון…' : 'מתחבר…';
  msg.classList.remove('hidden');
  const btn=$('#authSubmit'); btn.disabled=true;
  try{
    if(authMode==='signup'){
      /* תיבת הצהרת הגיל הוסרה ביוזמת בעל המוצר: היא אינה ניתנת לאכיפה, ותיבה שאיש
         אינו קורא היא חיכוך בהרשמה בתמורה לכלום. סף הגיל נשאר בתנאי השימוש §2. */
      const r=await Store.signUp(email,pw,uname);
      if(r.error){ msg.className='au-msg err'; msg.textContent=translateAuthError(r.error); return; }
      if(!r.session){                                    // email confirmation required before login
        setAuthMode('signin', true);
        /* Not a promise. The mail is genuinely sent and genuinely delivered -- and twice now it
           landed in spam and was never seen, while this line assured the learner it was on the
           way. Say where to look, in the same breath as "we sent it". */
        msg.className='au-msg ok'; msg.textContent='אשר את המייל, ואז התחבר כאן. אם הוא לא הגיע תוך דקה, בדוק בספאם.';
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
  /* ⛔ נמצא בבדק בית 3: כאן היה try{…} finally בלי catch. כל זריקה · רשת שנופלת
     באמצע, או store.js שלא נטען ו-Store אינו מוגדר · עברה מעל ההודעה והשאירה את
     "מתחבר…" על המסך. הכפתור אמנם השתחרר, אבל הטקסט המשיך להבטיח שמשהו קורה,
     והמשתמש נשאר מול מסך שמשקר לו. §10: הודעת שגיאה חייבת לומר מה עכשיו. */
  }catch(err){
    console.error('כשל בהתחברות', err);
    msg.className='au-msg err';
    msg.textContent='ההתחברות נכשלה. בדוק את החיבור לרשת ונסה שוב';
  } finally { btn.disabled=false; }
});
$('#cheerOk').onclick=()=>hide($('#cheer'));
$('#cheer').onclick=e=>{ if(e.target===$('#cheer')) hide($('#cheer')); };
$('#mailAskOk').onclick=()=>hide($('#mailAsk'));
$('#mailAsk').onclick=e=>{ if(e.target===$('#mailAsk')) hide($('#mailAsk')); };
/* The way out of the dead end. Supabase rate-limits resend per address, so the button is
   disabled for the whole round trip and re-enabled only on failure -- a success that re-enabled
   it would invite the second tap that gets refused, and the learner would read the refusal as
   "it is broken" rather than "it is already on its way". */
$('#mailAskResend').onclick=async e=>{
  const to=$('#mailAskTo').textContent.trim(), m=$('#mailAskMsg');
  if(!to) return;
  e.target.disabled=true;
  m.className='au-msg'; m.textContent='שולח…'; m.classList.remove('hidden');
  const r=await Store.resendConfirmation(to);
  if(r.ok){
    m.className='au-msg ok';
    m.textContent='נשלח שוב. אם הוא לא מופיע, חפש בספאם ובקידומי מכירות את השולח noreply@800-plus.com.';
  }else{
    m.className='au-msg err';
    /* The routine failure is the per-address interval, and "try again later" is the one thing
       that actually helps. Anything else is reported plainly rather than guessed at. */
    const raw=(r.error && r.error.message) || '';
    m.textContent = /security purposes|rate|429|only request this after/i.test(raw)
      ? 'נשלח לאחרונה ממש עכשיו. המתן דקה ונסה שוב. בינתיים בדוק בספאם.'
      : 'לא הצלחנו לשלוח כרגע. נסה שוב בעוד רגע, או בקש קישור לאיפוס סיסמה למטה.';
    e.target.disabled=false;
  }
};
$('#mailAskExisting').onclick=async e=>{
  const to=$('#mailAskTo').textContent.trim(), m=$('#mailAskMsg');
  if(!to) return;
  e.target.disabled=true;
  m.className='au-msg'; m.textContent='שולח…'; m.classList.remove('hidden');
  try{ await Store.resetPasswordFor(to); m.className='au-msg ok';
       m.textContent='נשלח. אם הכתובת רשומה, יישלח אליה קישור לבחירת סיסמה חדשה.'; }
  catch(err){ m.className='au-msg err'; m.textContent='שגיאה בשליחה. נסה שוב בעוד רגע.';
              e.target.disabled=false; }
};
$('#authForgot').onclick=async ()=>{
  const email=$('#authEmail').value.trim();
  const msg=$('#authMsg'); msg.classList.remove('hidden');
  if(!email){ msg.className='au-msg err'; msg.textContent='הזן קודם את כתובת האימייל בשדה "אימייל".'; return; }
  msg.className='msg'; msg.textContent='שולח…';
  try{ await Store.resetPasswordFor(email); msg.className='au-msg ok'; msg.textContent='אם הכתובת רשומה, נשלח אליה קישור לאיפוס סיסמה.'; }
  catch(e){ msg.className='au-msg err'; msg.textContent='שגיאה בשליחה. נסה שוב.'; }
};
/* The welcome screen is now a real landing page, so sign-out and the admin panel
   have to be reachable from it too -- not only from inside a language. */
const signOutNow = async ()=>{
  if(!committed && session.size>0) commitSession();
  /* The local copy is about to be erased, and a debounced push may still be pending -- or an
     earlier one may have failed silently, since pushProgress returns false instead of throwing
     and nothing retried it. Flush once, wait for it, and only then clear. */
  /* This used to push straight to the cloud with no read and no merge -- the single most
     destructive moment to do that, since localStorage.clear() below removes the only other
     copy. Routed through flushRemoteSync, which reads and merges first when this language has
     not been reconciled yet, and refuses to write at all after a failed read. */
  /* If the save did not land, the device holds the ONLY copy -- so it is not erased. Keeping it
     is safe: bindCacheToUser() wipes the cache the moment a different account signs in, so the
     next user still cannot see it, while this user keeps the round they just finished. */
  /* בלי חשבון אין עותק בענן, ולכן אין מה "לשמור" לפני מחיקה · ו-localStorage.clear() למטה
     הוא אובדן נקי. `saved` התחיל כ-true, ומצב הצצה מדלג על ה-if שמתחתיו, ולכן לחיצה על
     "התנתקות" במסך ההגדרות מחקה בדיוק את ההתקדמות שהפס הזהוב מבטיח שתעבור לחשבון ·
     בלי שאלה ובלי דרך חזרה.
     ה-else שכבר קיים למטה הוא התשובה הנכונה: מכשיר שמחזיק את העותק היחיד אינו נמחק. */
  let saved=!!currentUser;
  try{
    if(currentUser && (LANG==='he' || LANG==='en')){
      syncPending[LANG]=true;
      saved=await flushRemoteSync();
      /* ועכשיו השפה השנייה.
         flushRemoteSync דוחפת תמיד את LANG בלבד, ולכן עבודה ממתינה בשפה השנייה הייתה
         *חוסמת* את הניקוי למטה בלי להיפתר לעולם: הבדיקה `!syncPending.he && !syncPending.en`
         שומרת עליה מפני מחיקה · וזה נכון · אבל היא נשארה תקועה על המכשיר הזה בלבד, בלתי
         נראית לכל מכשיר אחר, והמטמון של חשבון שהתנתקנו ממנו נשאר שוכב עליו.
         כאן זה המקום היחיד שבו מותר להחליף את LANG ולטעון מצב אחר מתחת לרגליים, כי השורה
         האחרונה בפונקציה היא location.reload() · אין קוד שימשיך לרוץ על הגלובלים האלה.
         ה-try הפנימי בולע: כישלון כאן אינו הופך את saved לכוזב, כי saved עונה על שאלה
         אחרת (האם השפה הפעילה נשמרה). הכישלון מטופל ממילא בשער שלמטה · syncPending[other]
         נשאר דלוק, ולכן המטמון לא יימחק, בדיוק כמו קודם.
         זה כן מרחיב את המקרים שבהם המחיקה כן קורית, וזו הכוונה: flushRemoteSync מחזירה
         true רק אחרי ש-Store.pushProgress אישרה שהכתיבה נחתה. */
      const other = LANG==='he' ? 'en' : 'he';
      if(syncPending[other]){
        LANG=other;
        loadLangState();
        try{ await flushRemoteSync(); }catch(e){}
      }
    }
  }catch(e){ saved=false; }
  try{ await Store.signOut(); }catch(e){}
  hide($('#fbFab'));
  // the cached reminder names the previous learner's streak -- it is account data, not an asset
  try{ if(window.caches) await caches.delete('hw-data'); }catch(e){}
  /* flushRemoteSync דוחף את השפה הפעילה בלבד, אבל localStorage.clear() מוחק את שתיהן ·
     ולכן "נשמר" של שפה אחת מעולם לא היה רישיון למחוק את השנייה. התרחיש שנצפה בקוד:
     סבב עברית שדחיפתו נכשלה (או בוטלה במעבר שפה, כשהגארד `lang!==LANG` עוצר אותה),
     מעבר לאנגלית, ואז התנתקות · ה-flush האנגלי מצליח, `saved` הופך ל-true, והעותק
     היחיד של הסבב העברי נמחק. הכלל שכבר כתוב כאן, "מכשיר שמחזיק את העותק היחיד אינו
     נמחק", חייב לחול על **שתי** השפות ולא רק על הפעילה. */
  if(saved && !syncPending.he && !syncPending.en) localStorage.clear(); // the cache belongs to this account; never let it bleed into the next login
  else console.warn('sign-out: יש עבודה שלא הגיעה לענן. המטמון המקומי נשמר כדי לא לאבד אותה');
  location.reload();
};
/* מוקד אחד להתנתקות, באזור המסוכן שבהגדרות. קודם היו ארבעה כפתורי "יציאה" בארבע
   שורות עליונות · ליד "בקרה" ו"החלף שפה", כלומר בין כפתורי ניווט, ובמרחק לחיצה אחת
   בטעות ממסך התחברות. */
$('#accSignOut').onclick = signOutNow;

/* ===== account screen =====
   Tapping your own name opens it. For an admin the same tap opens the control centre instead -- 
   an admin has no use for "install the app" and every use for the list of who signed up. */
async function openAccount(tab){
  /* הדלת קובעת את הלשונית: לחיצה על השם פותחת בפרופיל, ⚙ פותח בהגדרות. מי שלא ציין ·
     נשאר במה שהיה פתוח, כדי שחזרה למסך לא תזרוק אותו ללשונית אחרת. */
  if(tab==='profile'||tab==='settings') accTab=tab;
  /* Admins used to be bounced straight to the control panel, which meant the owner could never
     reach his own settings -- no reminder toggle, no progress, no weak-words sheet. He practises
     too. The panel is now one row inside this screen instead of a redirect away from it. */
  $('#accAdmin').classList.toggle('hidden', !isAdmin);
  const mail=(currentUser&&currentUser.email)||'–';
  $('#accName').textContent = (LS.get('hw_name','')||'').trim() || 'החשבון שלי';
  $('#accMail').textContent = mail;
  $('#accMail2').textContent = mail;
  $('#accUser').textContent = (LS.get('hw_name','')||'–');
  $('#accSince').textContent = '–';
  $('#accSub').textContent = 'טוען…';
  /* Install is pointless once the app IS installed. Unlike the home-screen CTA this one is NOT
     hidden after a dismissal -- the whole point of moving it here is that a settings page is
     where you go looking for something you said "not now" to. */
  $('#accInstall').classList.toggle('hidden', isStandalone() || LS.get('hw_installed',0)===1);
  renderAccNotif();
  renderAccProgress();
  renderAccExam();
  goto('account');
  try{
    const { ok, profile:p }=await Store.myProfile();
    if(p){
      if(p.username){ $('#accUser').textContent=p.username; $('#accName').textContent=p.username; }
      if(p.created_at) $('#accSince').textContent=fmtDate(p.created_at).split(' ')[0];
      $('#accSub').textContent = FREE_PHASE && p.sub_status==='none' ? 'פתוח · שלב חינמי' : subLabel(p);
    /* ⛔ "פתוח" only when the read actually came back. It used to print here on a failed
       read too, which is a claim about somebody's subscription made without checking it. */
    } else $('#accSub').textContent = ok ? 'פתוח' : 'לא ידוע';
  }catch(e){ $('#accSub').textContent='לא ידוע'; }
}
/* ===== כרטיס המילה · חיווט ===== */
$('#wcReveal').onclick=()=>{
  $('#wcReveal').classList.add('hidden');
  $('#wcMean').classList.remove('hidden');
  $('#wcActs').classList.remove('hidden');
};
$('#wcNext').onclick=()=>{ wcOffset++; renderWordCard(); };
$('#wcClose').onclick=()=>{ wcDismiss(); renderWordCard(); };
/* "תרגל מילים כאלה" פותח סבב מאותו סוג שהכרטיס הציג · חלשות אם הוא הציג חלשה, חדשות
   אם חדשה. סבב של מילה בודדת אינו תרגול, והכרטיס הוא הזמנה ולא היעד. */
$('#wcPractice').onclick=()=>{
  const pool=wcPool();
  if(!pool.length) return;
  const p=wcPick();
  /* המילה שעל המסך ראשונה בחפיסה: מי שלחץ עליה מצפה לפגוש אותה, ולא לגלות סבב שאין בו
     שום קשר למה שהסתכל עליו רגע קודם. */
  const rest=pool.filter(x=>x!==p.w);
  startRound(cap([p.w, ...shuffle(rest)], 20), 'global', 'wcard');
  /* startRound מערבב את החפיסה תמיד (app.js:977), ובצדק · סדר קבוע מלמד את הסדר במקום
     את המילים. אבל מי שלחץ על מילה מסוימת מצפה לפגוש אותה, ולא סבב אקראי שאין לו קשר
     נראה לעין למה שהסתכל עליו רגע קודם. במקום לשנות את startRound ולשבור את הערבוב לכל
     המסלולים האחרים, המילה מוקפצת לראש החפיסה אחרי הערבוב · שינוי מקומי לנתיב הזה בלבד. */
  const at=deck.findIndex(c=>K(c.term)===K(p.w.term));
  if(at>0){ deck.unshift(deck.splice(at,1)[0]); idx=0; renderCard(); }
};
/* ===== דיאלוג ההתראות ===== */
/* "לא עכשיו" סוגר בלי לבקש הרשאה. זה מכוון: לחיצה על "לא" בדפדפן היא דחייה קבועה שאי
   אפשר לבטל מהקוד, ולכן עדיף שהתשובה השלילית תישאר בתוך האפליקציה · ה-CTA במסך הבית
   נשאר זמין למי שישנה את דעתו. */
$('#notifAskNo').onclick=()=>hide($('#notifAsk'));
$('#notifAsk').onclick=e=>{ if(e.target===$('#notifAsk')) hide($('#notifAsk')); };
$('#notifAskYes').onclick=async()=>{
  hide($('#notifAsk'));
  try{ await NOTIF.ask(); }catch(e){}
  if(NOTIF.granted()){ NOTIF.cacheMessage(); toast('נהדר. נזכיר לך מחר בבוקר'); $('#notifCta').classList.add('hidden'); }
};
/* ===== דיאלוג קבוצת הוואטסאפ ===== */
/* הדגל hw_waOffered כבר נכתב ברגע ההצגה (maybeOfferWhatsapp), ולכן כל מסלול סגירה · X,
   "לא עכשיו", לחיצה מחוץ לתיבה, או Escape · פשוט מסתיר בלי לגעת בדגל. הכפתור הראשי הוא
   קישור <a> שפותח את הוואטסאפ מעצמו; ה-onclick רק סוגר את השכבה שמאחוריו. */
$('#vidAskNo').onclick=()=>hide($('#vidAsk'));
$('#vidAskX').onclick=()=>hide($('#vidAsk'));
$('#vidAskGo').onclick=()=>hide($('#vidAsk'));
$('#vidAsk').onclick=e=>{ if(e.target===$('#vidAsk')) hide($('#vidAsk')); };
$('#waAskNo').onclick=()=>hide($('#waAsk'));
$('#waAskX').onclick=()=>hide($('#waAsk'));
$('#waAskGo').onclick=()=>hide($('#waAsk'));
$('#waAsk').onclick=e=>{ if(e.target===$('#waAsk')) hide($('#waAsk')); };
$('#userBadge2').onclick = ()=>openAccount('profile');
$('#userBadge3').onclick = ()=>openAccount('profile');
/* הדלת השנייה. הראשונה · לחיצה על השם · נשארת, כי מי שכבר מצא אותה לא צריך ללמוד מחדש;
   היא פשוט הפסיקה להיות היחידה. משתמשת דיווחה שלא ידעה שיש הגדרות באפליקציה בכלל. */
$('#setBtn').onclick  = ()=>openAccount('settings');
$('#setBtnW').onclick = ()=>openAccount('settings');
/* ⚠ `goBack` ולא `goto('home')` כשיש היסטוריה.
   נמדד בציד ב-11.8: ⚙ ממסך בחירת התרגול → חשבון → "חזרה" נחת בדף הבית, בזמן
   ש"אחורה" של אנדרואיד מאותה נקודה חזר לבחירת התרגול. שני כפתורי חזרה ושני יעדים
   הם בדיוק מה שגורם לאדם לאבד את המקום שלו. `goBack` צורך את הרשומה ולכן שניהם
   מתלכדים; כשאין רשומה (עומק 0) הוא נופל לדף הבית, וזו ההתנהגות הקודמת. */
$('#accBack').onclick = ()=>{
  if(LANG!=='he' && LANG!=='en'){ renderWelcome(); goto('welcome'); return; }
  goBack();
};
/* ===== the exam date =====
   Stored per ACCOUNT, not per language -- a person sits one psychometric exam. Kept in the
   extras blob so it rides the existing cross-device sync instead of needing a column. */
const EXAM_KEY='hw_examDate';
const examDays = ()=>{
  const v=LS.get(EXAM_KEY,'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y,m,d]=v.split('-').map(Number);
  /* A difference of CALENDAR days, not of milliseconds. Math.ceil over the fraction of a day
     left until 23:59 of the exam date reported 1 all through the exam day itself and 0 on the
     day after -- the banner said "the exam is today" twenty-four hours late, every time.
     Both ends are pinned to local midnight and rounded, so the 23- and 25-hour days that
     daylight saving produces cannot push the answer off by one either. */
  const t0=new Date(); t0.setHours(0,0,0,0);
  const t=new Date(y,m-1,d); t.setHours(0,0,0,0);
  return { date:v, days: Math.round((t.getTime()-t0.getTime())/864e5) };
};
/* ציון הדרך: מה עושים בטווח הזה, לא כמה נשאר · המספרים כבר אומרים את זה.
   הניסוח נשען על הלקסיקון של המסך ("מילים שטרם תרגלת", "לחיזוק", "בשליטה") כדי
   שלא ייווצר מונח חדש למושג קיים. הטווחים הם אלה שנקבעו: 30+ · 14–30 · 7–13 · 1–6 · 0. */
const examTip = d =>
    d >= 31 ? 'יש זמן לסבב מלא על כל המאגר'
  : d >= 14 ? 'הזמן להתמקד במילים שטרם תרגלת'
  : d >= 7  ? 'השבוע האחרון · חיזוק המילים שאינך שולט בהן'
  : d >= 1  ? 'הימים האחרונים · חזרה על מה שכבר בשליטה'
  : '';
function renderAccExam(){
  const inp=$('#accExam'), sub=$('#accExamSub');
  if(!inp) return;
  const e=examDays();
  inp.value = e ? e.date : '';
  const today=new Date();
  inp.min = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'
          + String(today.getDate()).padStart(2,'0');
  /* תקרה של שנתיים: מעבר לזה זו טעות הקלדה בשנה, לא מועד מבחן, וספירה לאחור
     בת 30 אלף ימים היא שורה שנראית שבורה במסך הבית. */
  const max=new Date(today.getFullYear()+2, today.getMonth(), today.getDate());
  inp.max = max.getFullYear()+'-'+String(max.getMonth()+1).padStart(2,'0')+'-'
          + String(max.getDate()).padStart(2,'0');
  sub.textContent = !e ? 'נוסיף ספירה לאחור למסך הבית'
    : e.days === 0 ? 'המבחן היום. בהצלחה.'
    : e.days === 1 ? 'המבחן מחר'
    : e.days === 2 ? 'נשארו יומיים'
    : e.days > 0 ? `נשארו ${e.days} ימים`
    : 'התאריך עבר. אפשר לעדכן למועד הבא';
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
  host.onclick=null; host.classList.remove('exam-past');
  const e=examDays();
  if(!e || e.days > 400){ host.classList.add('hidden'); return; }
  /* התאריך עבר: קודם השורה פשוט נעלמה, וזה קרא כאילו האפליקציה שכחה את המועד שהוגדר.
     נבחנים ניגשים שוב, ולכן זו הזמנה לעדכן · ולחיצה פותחת את ההגדרות במקום לשלוח לחפש. */
  if(e.days < 0){
    host.innerHTML = '<span>מועד המבחן שהגדרת עבר · לחץ לעדכון המועד הבא</span>';
    host.onclick = ()=>openAccount();
    host.classList.add('exam-past');
    host.classList.remove('hidden');
    return;
  }
  const c=classify('global');
  const left=c.fresh+c.weak;
  /* "1 ימים" אינו עברית, וזה ההבדל בין ספירה אישית לבין מחרוזת שהורכבה במכונה · ביום
     שלפני המבחן, הרגע הכי טעון. שורת "תרגול N מילים ביום" נעלמת ביום ובמחר: היא מחלקת
     במספר הימים, וביום אחד היא מחזירה את כל המאגר ליום · ערך אבסורדי, ולכן אין שורה. */
  const soon = e.days===0 ? `המבחן <em>היום</em> · בהצלחה`
             : e.days===1 ? `המבחן <em>מחר</em> · <em>${left}</em> מילים שטרם תרגלת`
             : null;
  /* ציון הדרך יורד לשורה נפרדת ושקטה: הוא מדבר על אופן העבודה, לא על המספרים,
     ואילו נדחס לאותה שורה הוא היה חלק רביעי בשרשרת שכבר ארוכה. ביום המבחן אין טיפ ·
     "בהצלחה" הוא כל מה שיש לומר. */
  const tip=examTip(e.days);
  host.innerHTML = (soon ? `<span>${soon}</span>`
    : `<span>` + (e.days===2 ? `נשארו <em>יומיים</em> עד המבחן`
                             : `<em>${e.days}</em> ימים עד המבחן`)
      + ` · <em>${left}</em> מילים שטרם תרגלת`
      + ` · תרגול <em>${Math.ceil(left/e.days)}</em> מילים ביום עד המבחן</span>`)
    + (tip ? `<span class="pill-tip">${tip}</span>` : '');
  host.classList.remove('hidden');
}
$('#accAdmin').onclick = ()=>openAdmin();
$('#accInstall').onclick = ()=>promptInstall(true);

/* Where am I -- answered on the settings page, not only inside a language. Hidden entirely when
   no language has been entered yet: zeros across the board on a first visit read as a broken
   screen, not as a starting point. */
/* A ring per language, not one strip for whichever language happens to be open.
   The old version read classify('global'), which only ever sees the ACTIVE language -- so
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
  /* langSummary מחזיר `learned`, לא `strong`. השדה השני קיים ב-classify() ולא כאן,
     והבלבול ביניהם החזיר undefined בשקט · הכפתור הציג "עדיין אין מילים בשליטה"
     ללומד עם 30 מילים. נתפס במדידה בדפדפן, לא בקריאה. */
  const solid = (LANG==='en'?en:he).learned;
  const rn=$('#accReviewN'); if(rn) rn.textContent = solid || '‹';
  const rsub=$('#accReviewSub');
  if(rsub) rsub.textContent = solid
    ? `${solid} מילים בשליטה · תרגול חוזר מכל יחידות הלימוד`
    : 'עדיין אין מילים בשליטה';
  const lsub=$('#accLearnedSub');
  if(lsub) lsub.textContent = solid>=8
    ? `${solid} מילים בשליטה כדף אחד להדפסה או ל-PDF`
    : 'צריך לפחות 8 מילים בשליטה כדי לבנות דף';
  renderAccTab();
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
    sub.textContent='פעילה · תזכורת קצרה בבוקר עם ההתקדמות שלך';
    st.textContent='✓'; st.style.color='#3f7a4a'; row.disabled=true;
  } else if(NOTIF.askable()){
    sub.textContent='הודעה קצרה בבוקר שמזכירה לתרגל';
    st.textContent='‹'; st.style.color=''; row.disabled=false;
  } else {
    // permission is 'denied', or iOS in a tab where the API would throw
    sub.textContent = isIOS() && !isStandalone()
      ? 'זמינה אחרי שתתקין את האפליקציה למסך הבית'
      : 'חסומה. ניתן להחזיר דרך הגדרות האתר בדפדפן';
    st.textContent='–'; st.style.color=''; row.disabled=true;
  }
}
$('#accNotif').onclick = async ()=>{
  if(!NOTIF.askable()) return;
  const ok=await NOTIF.ask();
  renderAccNotif();
  toast(ok ? 'מעולה. תקבל תזכורת בבוקר' : 'אפשר להפעיל דרך הגדרות האתר בדפדפן');
};

/* ===== deleting the account =====
   Two things this must not be: a confirm() that the same reflex dismisses, and a button that
   only clears the DATA. The first is why the gate is typing your own address; the second is
   why it goes through an Edge Function -- see store.deleteMyAccount. */
$('#accDelete').onclick = ()=>{
  const mail=(currentUser&&currentUser.email)||'';
  if(!mail){ toast('צריך להתחבר כדי למחוק את החשבון. התחבר ונסה שוב'); return; }
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
      ? 'המחיקה האוטומטית עוד לא פעילה. כתוב אליי ל-admin@800-plus.com ואמחק ידנית בתוך שלושה ימי עסקים.'
      : (r.error && r.error.message) || 'המחיקה נכשלה. נסה שוב.';
    btn.disabled=false; return;
  }
  /* The account is gone on the server. Everything local must go too, and the session with it -- 
     leaving a stale token behind means the next load tries to use an identity that no longer
     exists, and the error that comes back is unreadable. */
  try{ await Store.signOut(); }catch(e){}
  try{ localStorage.clear(); }catch(e){}
  /* טקסט התזכורת האישי נכתב ל-Cache Storage תחת 'hw-data', לא ל-localStorage. בלי השורה
     הזאת הוא שורד את המחיקה, ו-"הנתונים שלך נמחקו" הופך לשקר. */
  if(window.caches) try{ await caches.delete('hw-data'); }catch(e){}
  closeDel();
  document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;'
    + 'justify-content:center;padding:32px;background:#f7f2e8;color:#2c2620;text-align:center;'
    + 'font-family:Heebo,system-ui,sans-serif">'
    + '<div><div style="font:700 30px/1 Georgia,serif;color:#c9962f" dir="ltr">800+</div>'
    + '<p style="margin-top:18px;font-size:1.05rem;line-height:1.8">החשבון נמחק.<br>'
    + 'הנתונים שלך נמחקו מהשרת.</p>'
    + '<p style="margin-top:14px;font-size:.85rem;color:#8d8274">בהצלחה במבחן.</p></div></div>';
};

/* ===== willingness-to-pay survey =====
   Asked once per learner, ever, two seconds after the first round they finish. Everything here
   is written to fail closed: any error, any missing table, anybody signed out, and the card
   simply never appears. A survey is worth nothing next to a practice screen that breaks. */
let wtpPrice = null, wtpShown = false;
function maybeAskWtp(){
  if(wtpShown) return;                      // once per page load, whatever else happens
  if(!currentUser) return;                  // signed out: there is no row to write
  wtpShown = true;
  setTimeout(async ()=>{
    /* Still on the results screen? Two seconds is enough time to press "חזרה", and a dialog
       that opens over a screen the learner has already left is pure interruption. */
    if($('#results').classList.contains('hidden')) return;
    let asked = true;
    try{ asked = await Store.wtpAsked(); }catch(e){}
    if(asked) return;
    if($('#results').classList.contains('hidden')) return;   // re-checked after the await
    wtpPrice = null;
    document.querySelectorAll('#wtpPrices button').forEach(b=>b.classList.remove('active'));
    $('#wtpHelped').value=''; $('#wtpStop').value='';
    $('#wtpGo').disabled = true;
    show($('#wtpAsk'));
  }, 2000);
}
/* ⚠ הכפתור נפתח על **כל** שדה שמולא, לא רק על המחיר.
   עד 11.8.2026 הוא היה נעול עד בחירת סכום, כי שאלת הכסף הייתה ראשונה וחובה.
   מאז ששאלת הכסף ירדה לסוף והפכה לרשות, התנאי הישן היה כולא: מי שכותב תשובה
   מילולית ולא בוחר סכום לא היה יכול לשלוח כלום, וזו בדיוק התשובה שהכי שווה לנו. */
function wtpSyncGo(){
  const any = wtpPrice || $('#wtpHelped').value.trim() || $('#wtpStop').value.trim();
  $('#wtpGo').disabled = !any;
}
if($('#wtpAsk')){
  $('#wtpHelped').oninput = wtpSyncGo;
  $('#wtpStop').oninput   = wtpSyncGo;
  document.querySelectorAll('#wtpPrices button').forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll('#wtpPrices button').forEach(o=>o.classList.remove('active'));
      b.classList.add('active');
      wtpPrice = b.dataset.v;
      wtpSyncGo();
    };
  });
  /* ✕ counts as "asked" and is written as dismissed:true. It is a data point of its own -- how
     many people did not want the question at all -- and it is also what stops the card coming
     back on the next round. Closing must never block the screen, so the write is not awaited. */
  const closeWtp = ()=>{
    hide($('#wtpAsk'));
    try{ Store.wtpSave({ dismissed:true }); }catch(e){}
  };
  $('#wtpX').onclick = closeWtp;
  $('#wtpAsk').onclick = e=>{ if(e.target===$('#wtpAsk')) closeWtp(); };
  $('#wtpGo').onclick = async ()=>{
    const btn=$('#wtpGo');
    btn.disabled=true; btn.textContent='שולח…';
    let ok=false;
    try{
      const r = await Store.wtpSave({
        price_bucket: wtpPrice,
        what_helped: $('#wtpHelped').value.trim(),
        what_would_stop: $('#wtpStop').value.trim()
      });
      ok = r && r.ok;
    }catch(e){}
    hide($('#wtpAsk'));
    btn.textContent='שלח תשובה';
    /* Thanked either way. A learner who answered honestly should not be told the write failed --
       there is nothing they can do about it, and the round they just finished is the screen
       they came back to. The failure is ours to see in the empty table, not theirs. */
    toast(ok ? 'תודה · זה עוזר לי מאוד' : 'תודה');
  };
}
// the account screen's own sheet is the cross-unit one; per-unit sheets live inside a unit
/* חזרה חוצת-יחידות. הכפתור בתוך יחידה מתרגל את מילות אותה יחידה בלבד, ומי שלמד לאורך
   עשר יחידות לא יכול היה לחזור על הכול. אותו startRound ואותו askSize כמו כל שאר
   המסלולים · סבב חזרה אינו סוג אחר של תרגול. */
/* ===== שתי הלשוניות של מסך החשבון =====
   הרשימות הן מקור האמת היחיד, ולא מחלקה שמפוזרת על עשרה אלמנטים ב-HTML. אלמנט שנוסף
   למסך ולא נרשם כאן נשאר גלוי בשתי הלשוניות · נראה לעין מיד, ולא נעלם בשקט.
   תאריך המבחן שייך לפרופיל ולא להגדרות: הוא נתון על הלמידה, לא העדפה. */
const ACC_TABS = {
  profile:  ['accProg','accReview','accLearnedSheet','accSheet','accExamRow'],
  /* מבחן הרמה נרשם כאן ולא בפרופיל: הוא פעולה שמשנה נתון, לא תצוגה שלו · ובעיקר, זו
     הבקשה עצמה. שורה שלא נרשמת ברשימה הזאת נשארת גלויה בשתי הלשוניות. */
  settings: ['accNotif','accInstall','accWhat','accLevelHe','accLevelEn','accAdmin',
             'accSignOut','accReset','accDelete'],
};
let accTab='profile';
function renderAccTab(){
  for(const [tab, ids] of Object.entries(ACC_TABS))
    for(const id of ids){
      const el=$('#'+id); if(!el) continue;
      /* accProg ו-accAdmin מוסתרים מסיבות משלהם · ריק ולא-אדמין. הלשונית לא מבטלת את
         ההסתרה הזאת, היא רק מוסיפה עליה. */
      el.classList.toggle('tab-off', tab!==accTab);
    }
  /* אזור מסוכן למי שאין לו חשבון. במצב הצצה PREVIEW מסנן את היחידות בלבד · כל השאר פתוח,
     כולל "התנתקות", "אפס התקדמות" ו"מחק חשבון", למי שאין לו חשבון למחוק. שלושתם רק מוחקים
     מקומית, ולכן הם לא פעולה שהוא יכול לרצות. */
  if(PREVIEW) for(const id of ['accSignOut','accReset','accDelete'])
    { const el=$('#'+id); if(el) el.classList.add('tab-off'); }
  const th=$('#accToolsH'); if(th) th.textContent = accTab==='profile' ? 'הלמידה שלי' : 'כלים והגדרות';
  $('#accSeg').querySelectorAll('button').forEach(b=>{
    const on = b.dataset.tab===accTab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
$('#accSeg').onclick=e=>{
  const b=e.target.closest('button[data-tab]'); if(!b) return;
  accTab=b.dataset.tab; renderAccTab();
};
$('#accReview').onclick = ()=>{
  if(LANG!=='he' && LANG!=='en'){ toast('בחר קודם שפה'); return; }
  const l=learnedCards('global');
  if(!l.length){ toast('עדיין אין מילים בשליטה לחזור עליהן'); return; }
  askSize(l.length, n=> startRound(cap(shuffle(l),n), 'global', 'review'));
};
$('#accLearnedSheet').onclick = ()=>{
  if(LANG!=='he' && LANG!=='en'){ toast('בחר קודם שפה'); return; }
  printSheet('learned');
};
$('#accSheet').onclick = ()=>{
  if(LANG!=='he' && LANG!=='en'){ toast('בחר קודם שפה'); return; }
  printSheet('weak');
};

/* The survey's biggest finding was that eight capabilities people asked for ALREADY EXIST and
   nobody knows about them. They are listed on the landing page -- which is shown once, to people
   who do not have an account yet, and is unreachable forever after. Every existing user signed
   up before it existed and has never seen it. So the page is not missing; the way back to it is.
   Reached while signed in, its two sign-up CTAs make no sense -- hidden, with a way back instead. */
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
       would leave the old progress in the cloud, and the next sync would pull it all back -- 
       a reset that silently undoes itself is worse than one that fails loudly. */
    /* The return value is READ. pushProgress reports a refusal by returning false, not by
       throwing, so the catch below could never fire on the failure that matters: the device was
       wiped while the cloud still held everything, the toast said "ההתקדמות אופסה", and the next
       sync pulled it all back. A reset that silently undoes itself is worse than one that fails
       loudly · which is the same reasoning the comment above already gives for the ordering. */
    for(const lang of ['he','en']){
      const ok = await Store.pushProgress(lang, {assoc:{}, stats:{words:{},sessions:[]}, deleted:[], added:[],
                                                 dir:DEFAULT_DIR, extras:{}}, currentUser && currentUser.id);
      if(ok!==true) throw new Error('reset: the cloud refused the write for ' + lang);
    }
    wipeAccountKeys();
    if(window.caches) try{ await caches.delete('hw-data'); }catch(e){}
    toast('ההתקדמות אופסה');
    setTimeout(()=>location.reload(), 700);
  }catch(e){ btn.disabled=false; toast('האיפוס נכשל. ההתקדמות שלך נשמרה כפי שהייתה. נסה שוב'); }
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
/* applicationServerKey חייב להיות בתים גולמיים. מחרוזת base64url נבלעת בלי שגיאה
   בחלק מהדפדפנים ומייצרת מנוי שלעולם לא יקבל דבר · כשל שקט, ולכן ההמרה מפורשת. */
function urlB64ToBytes(s){
  const p = String(s).replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}

const NOTIF = {
  supported(){ return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; },
  askable(){
    if(!this.supported()) return false;
    if(Notification.permission !== 'default') return false;   // granted or denied -- both final
    if(isIOS() && !isStandalone()) return false;              // Safari tab: the API would throw
    return true;
  },
  granted(){ return this.supported() && Notification.permission === 'granted'; },

  async ask(){
    if(!this.askable()) return false;
    let p='denied';
    try{ p = await Notification.requestPermission(); }catch(e){ return false; }
    LS.set('hw_notifAsked', 1);
    if(p==='granted'){ await this.registerPeriodic(); await this.subscribePush(); await this.cacheMessage(); }
    return p==='granted';
  },

  /* Web Push · הערוץ היחיד שמגיע לאייפון כשהאפליקציה סגורה.
     periodicSync למעלה הוא Chrome/אנדרואיד בלבד, ולכן על iOS ההתראה הגיעה עד היום רק
     כשהאפליקציה נפתחה · כלומר רק למי שכבר חזר, ולא למי שהפסיק.

     נכשל בשקט בכוונה: אין מפתח VAPID, אין רשת, הדפדפן אינו תומך · כל אלה אינם תקלה
     שהלומד יכול לעשות איתה משהו, וההתראה עדיין תעבוד דרך שני הערוצים האחרים. */
  async subscribePush(){
    try{
      if(!window.VAPID_PUBLIC || !currentUser) return false;
      const reg = await navigator.serviceWorker.ready;
      if(!reg.pushManager) return false;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToBytes(window.VAPID_PUBLIC)
      });
      const j = sub.toJSON ? sub.toJSON() : null;
      if(!j || !j.keys) return false;
      return await Store.savePushSub(j.endpoint, j.keys.p256dh, j.keys.auth);
    }catch(e){ return false; }
  },

  /* Chrome only, and only for an installed PWA. Silently unavailable elsewhere -- that is
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
     It used to cache the composed text, and only at the moment permission was granted · so the
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
       and Date.parse on an unpadded string is implementation-dependent -- the raw `t` is
       already a millisecond number, so there is nothing to parse. */
    let last=0, weak=0;
    for(const key of ['hw_stats','hw_stats_en']){
      const s=LS.get(key,{});
      if(!isObj(s)) continue;
      const arr=Array.isArray(s.sessions)?s.sessions:[];
      for(const x of arr){ const t=Number(isObj(x)&&x.t); if(t>last) last=t; }
      const w=isObj(s.words)?s.words:{};
      // weak = met, not yet solid, and not a level-test skip -- the same rule the app uses
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
    // The gap decides the words. Someone two days out does not need a streak reminder -- 
    // they need a reason to come back and a job small enough to say yes to.
    if(away >= 14) return { title:'מילים לחיזוק',
      body: d.learned ? `${d.learned} מילים שלמדת עדיין כאן. סבב אחד מחזיר אותך לקצב.`
                      : 'טרם התחלת. סבב אחד מכסה עד 20 מילים.' };
    if(away >= 2)  return { title:'יומיים בלי תרגול',
      body: d.weak ? `${d.weak} מילים לחיזוק. סבב קצר היום מקדם אותן.`
                   : 'סבב קצר היום שומר על מה שכבר למדת.' };
    if(d.streak>=3) return { title:'זמן ללמוד מילים',
      body:`${d.streak} ימים ברצף. סבב אחד היום שומר על הרצף.` };
    return { title:'זמן ללמוד מילים',
      body: d.learned>0 ? `למדת כבר ${d.learned} מילים. עוד עשר היום?`
                        : 'סבב אחד מכסה עד 20 מילים.' };
  },

  /* The path that works on iOS: the app reminds when opened in the morning with no
     practice logged today. Fires once per day at most. */
  openTimeNudge(){
    if(!this.granted()) return;
    const h = new Date().getHours();
    if(h < 6 || h > 12) return;
    const today = dayKey(Date.now());
    if(LS.get('hw_notifDay','') === today) return;
    if(streakInfo().today) return;                 // already practised -- nothing to nudge
    /* The day is marked only once the notification has actually been shown. Marking it first
       and swallowing the rejection meant a failure -- the worker not ready yet on a cold open,
       or permission revoked at OS level -- burned the day silently and there was no way to
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
/* ===== ההכרעה של השרת =====
   hasAccess() משווה את sub_until ל-Date.now(), כלומר לשעון של הטלפון. מי שמזיז את
   השעון אחורה מאריך לעצמו את המנוי. כל עוד אין תשלום זו בעיה תיאורטית; ביום שיהיה,
   זו דלת פתוחה. my_entitlement() (migrations/11.sql) חותכת את זה בשרת ומחזירה גם
   offline_until · **השרת אומר בעצמו** כמה זמן מותר לסמוך על התשובה בלי רשת.

   שלושה ערכים ולא שניים. null אינו "אין גישה" אלא "לשרת אין תשובה עכשיו", ואז
   חוזרים ל-hasAccess הקיימת. זה מהותי: השער הזה נכשל־פתוח בכוונה, והאפליקציה היא
   PWA שחייבת לעבוד באוטובוס. שער שנועל מפני שאין רשת הוא בדיוק התקלה שכל ההערות
   כאן מזהירות מפניה. ראה tests/67. */
const ENT_KEY='hw_entitlement';
function entVerdict(ent, now){
  if(!ent || typeof ent.access!=='boolean') return null;
  if(ent.offline_until){
    const t=new Date(ent.offline_until).getTime();
    /* תאריך שאי אפשר לפענח אינו נועל · אותו כלל שכבר חל על sub_until למטה. */
    if(!isNaN(t) && now > t) return null;
  }
  return ent.access;
}
/* מושכת את התשובה מהשרת ושומרת אותה. נכשלת בשקט בכוונה: אין רשת, או שהפונקציה עוד
   לא נפרסה (42883) · בשני המקרים המסלול הישן ממשיך לעבוד כאילו לא קרה דבר. */
async function refreshEntitlement(){
  try{
    const ent = await Store.myEntitlement();
    if(ent && typeof ent.access==='boolean'){
      /* ⚠ אסימטרי בכוונה, ולא סתם LS.set.
         כשהדיסק מלא הכתיבה נכשלת בשקט, והמטמון הקודם נשאר. אם השרת **שלל**
         גישה והכתיבה לא עברה, נשאר על הדיסק {access:true} מלפני כן · ובטעינה
         הבאה entVerdict מחזיר true והגישה חוזרת. כלומר שלילה אינה נדבקת על
         מכשיר במצוקת מכסה, וזה בדיוק המכשיר שיש בו shedStorage מפני שזה קורה.
         לכן: כתיבה שנכשלה על שלילה **מוחקת** את המטמון. בטעינה הבאה entVerdict
         מחזיר null, נופלים למסלול המקומי שבודק את הפרופיל, וזו האמת.
         כשהשרת מתיר והכתיבה נכשלת · המטמון נשאר. מחיקה שם הייתה שוללת גישה
         ממי שיש לו אותה, במכשיר שכבר במצוקה. */
      if(!LS.set(ENT_KEY, ent) && ent.access===false) LS.del(ENT_KEY);
      return ent;
    }
  }catch(e){}
  return LS.get(ENT_KEY, null);
}
async function accessOk(){
  /* השרת קודם. רק אם אין לו תשובה תקפה · נופלים למסלול המקומי שמתחת. */
  const ent = await refreshEntitlement();
  const verdict = entVerdict(ent, Date.now());
  if(verdict===true) return true;
  if(verdict===false){
    /* השרת הכריע. showLocked צריכה שדות מהפרופיל לניסוח הסיבה, ולכן היא עדיין
       נמשכת · אבל היא כבר לא זו שמכריעה. */
    let pr=null; try{ pr=(await Store.myProfile()).profile; }catch(e){}
    showLocked(pr || { sub_status: ent && ent.status, sub_until: ent && ent.until });
    return false;
  }
  let p=null;
  /* Fail-open on a failed read, stated rather than inferred: `ok:false` now means "we did not
     manage to ask", and locking somebody out over our own outage is the one outcome this gate
     must never produce. Same verdict as before · the reason is just no longer a guess. */
  try{ const r=await Store.myProfile(); if(!r.ok) return true; p=r.profile; }catch(e){ return true; }
  /* Deliberately fail-open: a missing profile means the subscription columns aren't deployed
     yet, or the sign-up trigger did not fire -- locking a paying learner out over our own
     infrastructure fault is worse than a free day. The one path that USED to manufacture a
     missing profile on purpose (adminDeleteUserData) now clears the row instead of deleting it. */
  if(!p || p.sub_status===undefined) return true;
  if(p.role==='admin') return true;
  /* FREE PHASE. There is no payment mechanism yet and the app is deliberately free while it
     collects users. A brand-new account is created with sub_status='none' (the column default),
     so WITHOUT this line every tester who confirms their email lands straight on the locked
     screen -- which reads as "your email is blocked" and ends their session there.
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

/* ===== admin dashboard -- who signed up, when, how far they got.
   Deliberately has no way to reveal a password: none is stored in readable form. ===== */
let isAdmin=false;
async function showAdminIfAllowed(){
  /* ⛔ This used to start with `isAdmin=false` and then set it from a read that could fail
     silently, so a single dropped request took the control-centre button away until reload.
     A failed read now changes nothing · the previous answer stands. It can only ever KEEP an
     answer already earned, never invent one, and the panel behind the button is protected by
     RLS in any case, so the button is an affordance and not the permission. */
  const wasAdmin=isAdmin;
  try{
    const { ok, profile:p }=await Store.myProfile();
    isAdmin = ok ? !!(p && p.role==='admin') : wasAdmin;
  }catch(e){ isAdmin=wasAdmin; }
  $('#adminBtn').classList.toggle('hidden', !isAdmin);
  $('#adminBtn2').classList.toggle('hidden', !isAdmin);
  if(isAdmin) refreshFbBadge();
}

/* ===== the open-reports badge =====
   There is no email notification: a report lands in the feedback table and waits there silently.
   So the count has to travel to where the eye already goes · the "בקרה" button on the topbar,
   which is on screen every time the app opens. Zero means no badge at all; an empty circle
   would train the eye to ignore it, and then a real report would be ignored with it. */
async function refreshFbBadge(){
  if(!isAdmin) return;
  const n=await Store.countOpenFeedback();
  if(n===null) return;                       // table missing or offline -- leave the last known count
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
                        +' '+new Date(t).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}) : '–';

/* ⛔ יום מקומי, לא הפרש של 24 שעות · שתי חותמות באותו יממה קלנדרית מקומית.
   ההבדל אינו תיאורטי: הרשמה ב-23:50 וסבב ב-00:10 הם הפרש של 20 דקות ובכל
   זאת **שני ימים**, וזה הדין הנכון למדד "תרגל ביום שנרשם". השוואה בהפרש
   שעות הייתה סופרת אותו כהצלחה, ומנפחת בדיוק את המספר שאמור לקבוע החלטה.
   getFullYear/getMonth/getDate הן מקומיות, ולכן אזור הזמן של הצופה נלקח
   בחשבון מעצמו בלי חישוב היסט. */
const sameLocalDay = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear()===y.getFullYear() && x.getMonth()===y.getMonth() && x.getDate()===y.getDate();
};

/* Users are fetched once per visit and kept here; search / sort / filter all run
   in memory over this array, so typing never hits the network. Session-only state
   by design -- nothing is persisted to localStorage. */
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
      <div class="adm-top"><b>${esc(r.username||'–')}</b>
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
    catch(e){ b.textContent='שגיאה. נסה שוב'; b.disabled=false; }
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
    if(typed.trim().toLowerCase()!==String(mail).trim().toLowerCase()){ toast('המייל אינו תואם. החשבון לא נמחק'); return; }
    const pw=prompt('הקלד את סיסמת החשבון שלך כדי לאשר:');
    if(!pw) return;
    b.disabled=true; b.textContent='מאמת…';
    if(!await Store.verifyMyPassword(pw)){ toast('סיסמה שגויה. החשבון לא נמחק'); b.disabled=false; b.textContent='🗑 מחק נתונים'; return; }
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
     claim · and under חוק הגנת הצרכן, over-charging or cutting service short carries statutory
     damages with no proof of loss required.
   · PAST_DUE locked immediately too. A declined card is usually an expired card or a bank
     blocking an unfamiliar merchant, not a decision to stop paying. Locking the app before the
     retry has even run turns a bank glitch into a churned customer.

   The model the whole system now shares: `sub_until` is PAID THROUGH, `sub_status` is the
   billing state. Access follows the date; the status only decides how the date is read. */
const PAST_DUE_GRACE_DAYS = 3;
function hasAccess(r){
  if(!r) return true;                                  // no profile row -- fail open, as before
  if(r.role==='admin') return true;
  if(r.sub_status===undefined) return true;            // columns not deployed
  if(FREE_PHASE && r.sub_status==='none') return true;
  /* A `sub_until` that Date cannot parse used to evaluate as "expired" and lock the account.
     That is the wrong direction for a fault we caused: a provider changing its date format
     would lock EVERY active subscriber at once, silently, with nothing in the UI to explain it.
     An unreadable end date is treated as no end date -- the same fail-open rule the rest of this
     gate follows, because a free day costs less than a paying learner shut out by our own bug. */
  let until = r.sub_until ? new Date(r.sub_until) : null;
  if(until && isNaN(until.getTime())){
    console.error('sub_until לא ניתן לפענוח: '+r.sub_until+' · הגישה נשארת פתוחה');
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
   "המנוי בוטל" for canceled regardless of the date · while hasAccess() correctly still lets
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
    case 'past_due': return live ? 'חיוב נכשל. הגישה פתוחה עוד מעט'+until
                                 : 'חיוב נכשל. הגישה חסומה';
    case 'canceled': return live ? 'בוטל · פעיל'+until : 'המנוי בוטל';
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
      `<p class="msg" style="color:var(--ink-soft)">אם חסרות עמודות, הרץ את המיגרציות שבתיקיית migrations.</p>`;
    return;
  }
  if(!users.length){ admUsers=[]; body.innerHTML='<p class="msg" style="color:var(--ink-soft)">עדיין אין משתמשים רשומים.</p>'; return; }

  admUsers=await Promise.all(users.map(async u=>{
    /* "למד" used to count every record with level>=3 · including the ones the LEVEL TEST
       writes for words it decides the learner already knows (src:'lv'). A single level test
       marks thousands at once, so the number said 2,477 for someone who had practised twice,
       and it never moved afterwards. It measured a test, not learning.
       Practised and skipped are now two separate numbers, because they answer two questions. */
    let learnedHe=0, learnedEn=0, skipped=0, rounds=0, practised=0, last=u.last_seen, lastRound=0;
    /* ⛔ readFailed is not bookkeeping, it is the difference between "this learner never
       practised" and "we did not manage to ask". Before it existed both looked identical
       on screen, and the second one silently inflated the "never practised" card. */
    let readFailed=false;
    /* ⭐ הנתון היחיד שמפריד פער-מוצר מפער-שיווק: האם האדם הזה תרגל **ביום שנרשם**.
       מי שנרשם ולא פתח באותו יום כמעט אף פעם לא חוזר, ולכן זה לא "עוד מדד" אלא
       המספר שאומר אם להשקיע בהבאת משתמשים או בשעה הראשונה שלהם.
       ⚠ ההשוואה היא ביום מקומי ולא בהפרש שעות · מי שנרשם ב-23:50 ותרגל ב-00:10
       תרגל **למחרת**, וזה הדין הנכון: זה כבר לא אותו רגע של כוונה. */
    const createdTs = u.created_at ? Date.parse(u.created_at) : NaN;
    let firstDayRound = false;
    try{
      const { rows, error: pErr } = await Store.adminUserProgress(u.id);
      if(pErr) readFailed=true;
      for(const p of rows){
        /* `stats` arrives as its own field: adminUserProgress projects it out of the jsonb and
           deliberately never pulls the rest of the blob, so p.data does not exist here. */
        const st=(p&&p.stats)||{};
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
        // session.t is Date.now() -- a number. Date.parse() on it returns NaN and every round
        // would have looked like it never happened.
        for(const s of ses){
          const t=Number(s&&s.t); if(t>lastRound) lastRound=t;
          if(!firstDayRound && t>0 && !isNaN(createdTs) && sameLocalDay(t, createdTs)) firstDayRound=true;
        }
        if(!last || (p.updated_at && p.updated_at>last)) last=p.updated_at;
      }
    }catch(e){ readFailed=true; }
    const ts=last?Date.parse(last):NaN;
    return { id:u.id, username:u.username||'', email:u.email||'', role:u.role,
             created_at:u.created_at, last, lastTs:isNaN(ts)?0:ts,
             learnedHe, learnedEn, learnedTotal:learnedHe+learnedEn,
             skipped, rounds, practised, lastRound, readFailed, firstDayRound };
  }));

  /* The morning glance. The list below answers "who is this person"; this answers the only
     question worth asking every day -- is anybody actually practising. Rounds, not logins:
     signing up and confirming an email is a small effort, and opening the app and answering
     a round is a different one. Conflating them is how a dead product looks alive. */
  /* ⛔ "היום" and "השבוע" used to be rolling windows · now-lastRound < 1 day, < 7 days.
     So at 09:00 a round from 23:00 last night still counted as today, and "this week"
     meant "the last 168 hours" and never started over on Sunday. The labels promised a
     calendar and the code measured a stopwatch, which is why the numbers looked wrong
     to somebody reading them as "today". Both now start at local midnight. */
  const midnight = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
  const startOfToday = midnight().getTime();
  const startOfWeek  = (() => { const d=midnight(); d.setDate(d.getDate()-d.getDay()); return d.getTime(); })();
  const since = from => admUsers.filter(u=>u.lastRound && u.lastRound >= from).length;
  /* ⚠ "סבבים בסך הכול" ו"מילים שתורגלו" הוסרו מהלוח (בקשת חגי, 14.8.2026): מדד
     מצטבר שרק עולה אינו אומר מה קרה השבוע, ולכן אי אפשר להחליט לפיו כלום.
     הסכימה עצמה הוסרה ולא רק התצוגה. שדה מחושב שאיש אינו קורא הוא עבודה
     שרצה על כל משתמש בכל טעינה של הלוח, בלי שאף אחד רואה את התוצאה. */
  const glance = {
    today: since(startOfToday),
    week:  since(startOfWeek),
    /* ⛔ A learner whose progress could not be read is NOT counted here. That was the bug:
       a dropped request became a person who "never practised". They are counted in
       `failed` instead, and the panel says so out loud. */
    never: admUsers.filter(u=>!u.readFailed && !u.rounds).length,
    failed: admUsers.filter(u=>u.readFailed).length,
    /* ⭐ המדד שקובע איפה להשקיע. `known` הוא המכנה, ומכיל **רק** את מי שהקריאה
       עליו הצליחה · אחרת כישלון רשת היה מוריד את האחוז ונראה כמו בעיית מוצר. */
    dayOne: admUsers.filter(u=>!u.readFailed && u.firstDayRound).length,
    known:  admUsers.filter(u=>!u.readFailed).length,
  };
  /* ⚠ 0 נרשמים ידועים אינו 0 אחוז · הוא "אין מה לחשב". חלוקה באפס כאן הייתה
     מדפיסה NaN%, ומספר שבור על לוח נראה כמו מוצר שבור. */
  const dayOnePct = glance.known ? Math.round(glance.dayOne / glance.known * 100) : null;
  const gcard = (n, label, hint, warn) =>
    `<div class="adm-g${warn&&n?' warn':''}"><b>${n}</b><span>${label}</span>`+
    (hint?`<i>${hint}</i>`:'')+`</div>`;

  /* ⚠ The one line that makes the three numbers checkable. Without it a failed read is
     invisible and the cards look authoritative while being short a few people. */
  const failNote = glance.failed
    ? `<p class="msg err">הנתונים של ${glance.failed===1?'משתמש אחד':glance.failed+' משתמשים'} `
      + `לא נטענו. המספרים כאן אינם כוללים אותם.</p>`
    : '';

  body.innerHTML=failNote+`<div class="adm-glance">
      ${gcard(glance.today,'תרגלו היום','מחצות')}
      ${gcard(glance.week,'תרגלו השבוע','מיום ראשון')}
      ${gcard(glance.never,'נרשמו ולא תרגלו','לא השלימו סבב',true)}
      ${gcard(dayOnePct===null ? '–' : dayOnePct+'%', 'תרגלו ביום שנרשמו',
              dayOnePct===null ? 'אין נתונים' : `${glance.dayOne} מתוך ${glance.known}`)}
    </div>
    <div class="adm-tools">
      <input class="adm-search" id="admSearch" type="search" inputmode="search"
             placeholder="חיפוש לפי מייל או שם" value="${esc(admView.q)}" aria-label="חיפוש משתמשים">
      <select id="admSort" aria-label="מיון">
        <option value="new">הצטרפו · חדש→ישן</option>
        <option value="old">הצטרפו · ישן→חדש</option>
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
/* שם פרטי בלבד, ורק אם מה שיש בשדה הוא באמת שם.
   שני שערים, ושניהם נדרשים:
   · כתובת מייל בשדה השם היא באג מוכר במערכת הזאת ("השם שלי הפך למייל", נספח FIXBUG).
     "שלום dana@example.com," גרוע מ"שלום," · הוא מכריז שהמייל אוטומטי.
   · מחרוזת בלי אף אות (ספרות, אמוג'י, רווחים) אינה שם.
   HEB §6: שם פרטי בלבד. "שלום דני כהן," קורא כמו מכתב מחברת ביטוח. */
function firstNameOf(v){
  const s=String(v||'').trim();
  if(!s || s.includes('@')) return '';
  const w=s.split(/\s+/)[0];
  return /[A-Za-zא-ת]/.test(w) ? w : '';
}
async function renderAdminFeedback(){
  const host=$('#admFb'); if(!host) return;
  const { rows, error }=await Store.adminListFeedback();
  if(error){
    host.innerHTML=`<p class="msg" style="color:var(--ink-soft)">אין עדיין טבלת דיווחים. הרץ את
      <b>migrations/4.sql</b> ב-SQL Editor. עד אז דיווחים נשלחים אליך במייל.</p>`;
    return;
  }
  refreshFbBadge();                          // the list is open; make sure the badge agrees with it
  if(!rows.length){ host.innerHTML='<p class="msg" style="color:var(--ink-soft)">אין דיווחים.</p>'; return; }
  /* שם פרטי אמיתי למדווח. לטבלת הדיווחים אין שדה שם · רק כתובת · ולכן השם נשלף
     מ-profiles לפי הכתובת. שאילתה אחת בפתיחת הפאנל, ל-30 שורות.
     נכשל בשקט בכוונה: אם profiles אינה נגישה, הפנייה תהיה "שלום," וזו פנייה תקינה.
     מייל שלא נמצא ברשימה (מדווח שמחק את חשבונו) נופל לאותה ברירת מחדל. */
  const fbNames=new Map();
  try{
    const { users }=await Store.adminListUsers();
    for(const u of (users||[])){
      const mail=String(u.email||'').trim().toLowerCase();
      const n=firstNameOf(u.username);
      if(mail && n) fbNames.set(mail, n);
    }
  }catch(e){}
  const open=rows.filter(r=>r.status!=='done').length;
  host.innerHTML=`<p style="font-size:.82rem;color:var(--ink-soft);margin-bottom:10px">
      ${rows.length} דיווחים · <b style="color:var(--accent)">${open}</b> פתוחים</p>`
    + rows.map(r=>{
      const c=r.context||{};
      return `<div class="adm-row"${r.status==='done'?' style="opacity:.55"':''}>
        <div class="adm-top"><b>${FB_KIND_HE[r.kind]||esc(r.kind)}</b>
          <span class="mail">${esc(r.email||'–')}</span>
          ${r.status==='done'?'<span class="adm-tag">טופל</span>':''}</div>
        <p style="font-size:.94rem;line-height:1.55;margin:6px 0 8px;white-space:pre-wrap">${esc(r.body)}</p>
        <div class="fb-ctx">${esc(`${fmtDate(r.created_at)} · screen:${c.screen||'?'} · lang:${c.lang||'?'} · build:${c.build||'?'} · ${c.viewport||''} ${c.standalone?'· PWA':''}`)}</div>
        <div class="adm-acts"><button data-fb="${r.id}" data-st="${r.status==='done'?'new':'done'}">
          ${r.status==='done'?'↩ החזר לפתוח':'✓ סמן כטופל'}</button>
          ${r.status==='done' && r.email
            ? `<button class="adm-reply" data-reply="${r.id}">✉ השב למדווח</button>` : ''}</div>
      </div>`;
    }).join('');
  host.querySelectorAll('[data-fb]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    if(await Store.adminMarkFeedback(+b.dataset.fb, b.dataset.st)) renderAdminFeedback();
    else { b.disabled=false; toast('העדכון נכשל. נסה שוב'); }
  });
  /* מענה למדווח.
   *
   * למה mailto ולא שליחה מהאפליקציה: מפתח Resend יושב רק בצד השרת, ובדפדפן הוא היה
   * גלוי לכל מי שפותח את קוד המקור. mailto גם הופך את "רק אני שולח" למילולי · ההודעה
   * נפתחת בתיבה של חגי והוא לוחץ שלח בעצמו. אותו דפוס כמו #lockContact.
   *
   * מוצג רק על דיווח שכבר סומן "טופל", כי הנוסח מבטיח "בדקתי, מצאתי ותיקנתי" ·
   * הבטחה כזאת על דיווח פתוח היא שקר, וזה הסוג שגורם למישהו להפסיק לדווח.
   *
   * "שלום," בלי שם: לטבלת הדיווחים אין שדה שם, ורק כתובת. לגזור שם פרטי מהכתובת היה
   * מייצר "שלום paz123" · וזה גרוע מפנייה כללית תקינה (HEB §6). */
  host.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{
    const r=rows.find(x=>String(x.id)===b.dataset.reply); if(!r) return;
    /* הנושא הוא ציטוט קצר של מה שהוא עצמו כתב · זה מה שיגרום לו לזהות במבט אחד על מה
       מדובר, במקום "באג" שאינו אומר כלום שבועיים אחרי. */
    const topic=String(r.body||'').split('\n')[0].trim().slice(0,50);
    const subject='הדיווח שלך ב-800+ טופל';
    const name=fbNames.get(String(r.email||'').trim().toLowerCase())||'';
    const body=[
      name ? 'שלום '+name+',' : 'שלום,','',
      'הדיווח שלך על "'+topic+'" התקבל!',
      'בדקתי, מצאתי ותיקנתי, והגרסה כבר עודכנה.','',
      'תודה על הפידבק, תמשיך לדווח ❤️','',
      'https://800-plus.com'
    ].join('\n');
    location.href='mailto:'+encodeURIComponent(r.email)
      +'?subject='+encodeURIComponent(subject)
      +'&body='+encodeURIComponent(body);
  });
}
$('#adminBtn').onclick=openAdmin;
$('#adminBtn2').onclick=openAdmin;
$('#notifCta').onclick=async()=>{
  const ok=await NOTIF.ask();
  $('#notifCta').classList.add('hidden');
  toast(ok ? 'מעולה. תקבל תזכורת בבוקר' : 'אפשר להפעיל התראות מאוחר יותר בהגדרות הדפדפן');
};
$('#lockContact').onclick=()=>{
  const mail=(currentUser&&currentUser.email)||'';
  location.href='mailto:admin@800-plus.com?subject='+encodeURIComponent('חידוש מנוי · 800+')
    +'&body='+encodeURIComponent('החשבון שלי: '+mail);
};

/* ===== השלמת משפטים =====
   תרגול שני באפליקציה, לצד תרגול המילים. הלומד מקבל משפט אנגלי עם חסר וארבע
   אפשרויות, וכשהוא עונה נפתח ההסבר בפורמט שנקבע: פירוש ארבע האפשרויות, תרגום
   המשפט לעברית כשהתשובה מושלמת ומודגשת, ואז נימוק לבחירה שלו ולתשובה הנכונה.
   הפירוט המלא של הפורמט והנימוק לכל חלק בו: sentence-completion/FORMAT-BRIEF.md.

   ⚠ הנתונים נטענים **בהשהיה**, ולא מ-index.html
   -------------------------------------------
   data-sent-en.js שוקל מעל 190KB, ורוב הכניסות לאפליקציה אינן נוגעות בתרגול הזה.
   טעינה בתג <script> קבוע הייתה מוסיפה את המשקל הזה לכל עלייה של כל משתמש. לכן
   הוא נטען בכניסה למסך, פעם אחת לסשן, וה-service worker מטמן אותו לפי דרישה
   (הוא אינו ב-ASSETS, וזה מכוון: sw.js מנמק שם שכל מה שאינו ליבה נשלף on demand).
   ⚠ המשמעות: מי שלא נכנס לתרגול הזה בעודו מחובר לרשת, לא יקבל אותו באופליין.

   ⚠ ההתקדמות מקומית בלבד (LS), ואין לה טבלה בבסיס הנתונים. זו החלטה מכוונת
   לגרסה הראשונה: ישות חדשה ב-Supabase דורשת סכימה, RLS ומיגרציה, וזה סיכון גדול
   בהרבה מהתועלת של שמירת התקדמות בין מכשירים בתרגול שרק עולה לאוויר. מה שכן
   נשמר: אילו פריטים נענו, כדי שסבב חדש יעדיף פריטים שטרם נראו. */
const SENT_ROUND = 10;                       // פריטים בסבב
const SENT_KEY   = 'hw_sent_done';           // ⚠ המבנה הישן: מערך מזהים בלבד
const SENT_PROG  = 'hw_sent_prog';           // המבנה הנוכחי: מזהה → {n, ok, last}
let sentQ = [], sentI = 0, sentOk = 0, sentAnswered = false, sentBand = '';
let sentSaveFailed = false;   // נדלק כשכתיבה ל-localStorage נכשלה. ראה sentRecord.

/* ===== מעקב ההתקדמות =====
 * לפריט: n נסיונות · ok כמה מהם היו נכונים · last התוצאה האחרונה.
 *
 * ⚠ למה זה החליף את המערך הקודם
 * -----------------------------
 * הגרסה הראשונה שמרה `hw_sent_done` · מערך מזהים של פריטים ש**נענו**, בלי לדעת
 * אם נכון. זה הספיק כדי לא לחזור על שאלה, ולא הספיק לשום דבר אחר: אי אפשר היה
 * להציג אחוז שליטה, אי אפשר היה להעדיף פריט שנכשל בו, ואי אפשר היה לומר ללומד
 * מה הוא יודע. המבנה החדש הוא מפה, והוא נושא גם את הצלחות וגם את הכשלים.
 *
 * ⭐ הסנכרון בין מכשירים נעשה דרך `collectExtras`/`applyExtras`, כלומר בתוך הבלוב
 * שכבר קיים בטבלת progress. **אין טבלה חדשה ואין מיגרציה** · ישות חדשה ב-Supabase
 * דורשת סכימה ו-RLS, וזה סיכון גדול מהתועלת כשהבלוב הקיים עושה את העבודה.
 *
 * המיזוג הוא **מונוטוני** ולעולם אינו יורד: n ו-ok נלקחים כמקסימום בין המקומי
 * לענן. אותו כלל בדיוק שמנחה את mergeProgress ו-applyExtras, ומאותה סיבה: מכשיר
 * שמאחר לא יגרור אחורה מכשיר שקדם לו. */
/* רשומה תקינה, מנורמלת. **קורא אחד** שמנקה, ולא הגנה בכל אתר שימוש בנפרד.
   ⚠ נגזר מציד באגים ב-11.8, ששני ממצאים שלו נבעו מאותו שורש: רשומה עם `n` שלילי
   או שאינו מספר לא נכנסה לאף אחת משלוש הקבוצות ב-`startSentRound` · לא לחדשים, לא
   לנכשלים ולא לידועים · ולכן הפריט **יצא מהרוטציה לנצח** והוצג כאילו נענה. ורשומה
   עם `ok` גדול מ-`n` הפיקה `100%`. הענן היה חסום, המקומי לא.
   כאן זה נחסם פעם אחת, בקריאה, ולכן כל מי שקורא מקבל נתון שפוי. */
function saneSentRec(r){
  if (!isObj(r)) return null;
  const n = Math.max(0, Math.floor(Number(r.n) || 0));
  const ok = Math.min(n, Math.max(0, Math.floor(Number(r.ok) || 0)));
  return { n, ok, last: Number(r.last) ? 1 : 0 };
}
function sentProg(){
  const raw = LS.get(SENT_PROG, null);
  if (isObj(raw)) {
    /* מנרמל בכל קריאה. זה זול (מאות מפתחות) והוא מבטל מחלקה שלמה של באגים. */
    const out = {};
    for (const k of Object.keys(raw)) { const r = saneSentRec(raw[k]); if (r) out[k] = r; }
    return out;
  }
  /* הגירה חד-פעמית מהמערך הישן. הפריטים האלה נענו, ואין לנו את התוצאה · ולכן
     n=1 ו-ok=0. זה מציג אותם כ"נפתרו אך לא נכונים", והוא הכיוון השמרני: הוא
     מחזיר אותם לתרגול במקום להצהיר על שליטה שלא נמדדה. */
  const old = LS.get(SENT_KEY, null);
  const out = {};
  if (Array.isArray(old)) old.forEach(src => { if (src) out[src] = { n: 1, ok: 0, last: 0 }; });
  /* המקור נמחק **רק** אחרי שהיעד נכתב בהצלחה. LS.set מחזיר בוליאני בדיוק בשביל
     זה: מחיקה בלי התנאי הזה מוחקת את העותק היחיד כשהדיסק מלא · וזו כל ההתקדמות.
     ובלי המחיקה בכלל, hw_sent_done נשאר לנצח כנתונים מתים שאיש כבר לא קורא
     (המבנה החדש גובר עליו למעלה) ותופס מכסה באפליקציה שיש בה shedStorage שלם
     מפני שהמכסה נגמרת בפועל. */
  if (Object.keys(out).length && LS.set(SENT_PROG, out)) LS.del(SENT_KEY);
  return out;
}
function sentRecord(src, right){
  const p = sentProg();
  /* ⛔ באג שנמצא בציד ב-11.8, והוא הרג את הסבב בלחיצה.
     `sentProg` הגן על **המפה** ובדק שהיא אובייקט, ולא על **הרשומות** שבתוכה.
     רשומה פגומה · מחרוזת, מספר, null · הגיעה לכאן, ו-`e.n++` על מחרוזת זורק
     במצב strict. הזריקה קרתה מתוך `answerSent` **לפני** סימון התשובה ולפני פתיחת
     ההסבר, ולכן הלחיצה לא עשתה כלום והלומד נתקע. שוחזר: `Cannot create property
     'n' on string 'oops'`.
     מאיפה רשומה פגומה מגיעה: הבלוב מהענן, טאב אחר, עריכה ידנית, או גרסה עתידית
     שתשנה את המבנה. ⚠ ההגנה הזאת כבר קיימת ב-`applyExtras` · היא נשכחה כאן, וזה
     בדיוק סוג הפער שנופל על המשתמש ולא על המפתח. */
  const e = saneSentRec(p[src]) || { n: 0, ok: 0, last: 0 };
  e.n++; if (right) e.ok++;
  if (e.ok > e.n) e.ok = e.n;      // רשומה שהגיעה פגומה לא תפיק אחוז מעל 100
  e.last = right ? 1 : 0;
  p[src] = e;
  /* ⚠ `LS.set` מחזיר false כשהמכסה מלאה. נמצא בציד: התשובה לא נאבדה בשקט (יש
     toast ופס קבוע), אבל **מסך הסיום הכחיש את עצמו** · "10 מתוך 10" ומיד מתחת
     "0 נכונים · 0%". הדגל הזה גורם לסיכום לומר שההתקדמות לא נשמרה, במקום להציג
     שני מספרים שסותרים זה את זה ולתת ללומד להחליט למי להאמין. */
  sentSaveFailed = !LS.set(SENT_PROG, p) || sentSaveFailed;
  /* אותו מנגנון בדיוק של תרגול המילים: מדליק את הדגל ומתזמן דחיפה מושהית.
     ⚠ לא דחיפה מיידית לכל תשובה. queueRemoteSync משהה 12 שניות ומאחד, ובסבב של
     עשר שאלות זו דחיפה אחת במקום עשר. הדחיפה נכפית בכל נקודה שבה הדף עלול לאבד
     אותה, כולל סוף סבב, מעבר שפה, והסתרת הלשונית. */
  queueRemoteSync();
}
/* סיכום לרצועה אחת או לכל הקורפוס. `ok` נמדד כפריט שנענה נכון **לפחות פעם אחת**,
   ולא כאחוז מהנסיונות: הלומד שחזר על שאלה וענה נכון יודע אותה.
   ⚠ ולכן התווית היא "נכונים" ולא "נכונים בראשונה". הגרסה הראשונה כתבה "נכונות
   בראשונה" וזו הייתה **טענה שאינה נמדדת**: פריט עם `{n:2, ok:1}` נספר כנכון, אף
   שהנסיון הראשון בו נכשל. נתפס בציד ב-11.8. */
/* עברית תקינה למספר. "1 נכונים" אינו עברית, וזה בדיוק ההבדל בין מספר שנמסר
   ללומד לבין פלט של מכונה. /HEB §5. */
const okN = n => n === 1 ? 'נכון אחד' : `${n} נכונים`;
/* ⭐ **קורא אחד** לקורפוס, ולא `window.SENT_EN` בשבעה מקומות נפרדים.
   זה בדיוק הדפוס של `buildBank`: שם הגידור נעשה בשורה אחת על `data`, ולא בכל אתר
   שימוש. גידור שמפוזר על פני שבעה קוראים הוא גידור שאחד מהם יפספס, ומספיק קורא
   אחד שאינו מסונן כדי שמי שבהצצה יראה בדיוק את מה שגודר. */
function sentBank(){
  const S = window.SENT_EN || {};
  if(!PREVIEW) return S;
  return S[PREVIEW_BAND] ? { [PREVIEW_BAND]: S[PREVIEW_BAND] } : {};
}
function sentSummary(band){
  const S = sentBank();
  const arr = band ? (S[band] || []) : Object.values(S).flat();
  const p = sentProg();
  let solved = 0, ok = 0;
  for (const it of arr){
    const e = p[it.src];
    if (!e || !e.n) continue;
    solved++; if (e.ok > 0) ok++;
  }
  const total = arr.length;
  return { total, solved, ok, left: total - solved,
           pct: total ? Math.round(100 * ok / total) : 0 };
}

/* ‏המרכאות נוספו ב-14.8.2026. sEsc מאושרת ב-ESCAPERS של tests/73 · כלומר השער
   מאשר כל מה שהיא עוטפת, **בכל הקשר, כולל בתוך מאפיין**. בלי בריחה ממרכאות
   `<div title="${sEsc(v)}">` נשבר החוצה מהמאפיין והשער שותק. בפועל כל אתרי
   הקריאה היום הם טקסט ו-SENT_EN הוא תוכן פנימי, ולכן לא הייתה חשיפה חיה; זה
   נסגר כדי שהאישור הגורף שב-ESCAPERS יהיה נכון ולא רק נכון-במקרה.
   בהקשר טקסט `&quot;` מוצג כ-" · הרינדור אינו משתנה. */
const sEsc = s => String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/* `**…**` הוא סימון ההדגשה בשדה t. נהפך ל-<b> **אחרי** ההחלטה, ולכן ההחלטה חלה
   על התוכן והתג נוסף בסוף. */
const sBold = s => sEsc(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
const sLabel = o => Array.isArray(o) ? o.join(' + ') : String(o);
/* ⚠ מה שנשמע אינו מה שכתוב. `sLabel` מחבר פריט זוג ב-" + " כי על המסך הפלוס הוא
   שאומר "שתי המילים ביחד", אבל מנוע ההקראה מבטא אותו "plus" ומה שנשמע הוא
   "collect plus pass". פסיק נותן בדיוק את ההפסקה הטבעית שבין שתי מילים, וזו אותה
   הכרעה שכבר עשה TTS.speakable על "knife (knives)". */
const sSpeak = o => Array.isArray(o) ? o.join(', ') : String(o);
/* התווית נגזרת מהפריט ולא קבועה: פריט זוג הוא שתי מילים, ו"השמע את המילה" עליו
   אינו עברית תקינה. /HEB §5 · התאמת מספר היא חלק מהניסוח, לא קישוט. */
const sSayLbl = o => (Array.isArray(o) && o.length > 1) ? 'השמע את המילים' : 'השמע את המילה';
/* כפתור רמקול לאפשרות אחת. נבנה בקוד ולא במחרוזת HTML כי הוא נדרש בשני מקומות
   (שורת האפשרות ושורת ההסבר) ובשני תזמונים (רינדור, ואז הגעת קול מאוחרת).
   ⚠ שני דברים שנראים מיותרים ואינם:
     · העטיפה `.s-optrow` קיימת כי `<button>` בתוך `<button>` אינו HTML חוקי ·
       הדפדפן מפרק את העץ ומוציא את הפנימי החוצה. הרמקול הוא **אח** של `.s-opt`.
     · `stopPropagation` לצד `preventDefault`. היום הרמקול אח ולא צאצא, ולכן
       הלחיצה ממילא אינה מגיעה ל-`.s-opt`. זו הגנה על **מחר**: ברגע שמישהו יתלה
       מטפל על השורה עצמה (טפיחה על השורה = בחירה), לחיצה על הרמקול תענה על
       השאלה, וזה כשל שקשה לייחס. */
function sentSayBtn(o){
  const s = document.createElement('button');
  s.className = 'say s-say'; s.type = 'button';
  s.textContent = '🔊';
  const lbl = sSayLbl(o);
  s.title = lbl; s.setAttribute('aria-label', lbl);
  s.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); TTS.say(sSpeak(o), s); };
  return s;
}
/* הקולות מגיעים אסינכרונית, ולעתים קרובות אחרי שהשאלה כבר על המסך. `sayBound`
   משחזרת רק כפתורים **סטטיים** לפי סלקטור, והרמקולים כאן נבנים בקוד לכל שאלה
   מחדש · כלומר הם אינם שם ולא היו משוחזרים. בלי הפונקציה הזאת השאלה הראשונה
   בסבב הייתה יוצאת בלי רמקולים, והם היו מופיעים רק בשאלה הבאה.
   ⚠ הזרקה **מוסיפה** ולא רינדור מחדש, וזו הכרעה: רינדור מחדש של שורות האפשרויות
   היה מוחק את ה-✓/✗, את `is-right/is-wrong` ואת `disabled` שכבר נקבעו · כלומר
   שאלה שכבר נענתה הייתה נפתחת לתשובה שנייה בגלל הגעת קול. */
function sentSayRefresh(){
  if(!(LANG==='en' && TTS.available())) return;
  const card = $('#sentCard');
  if(!card || card.classList.contains('hidden')) return;
  const it = sentQ[sentI]; if(!it || !Array.isArray(it.o)) return;
  const hang = (row, j)=>{
    if(row && !row.querySelector('.s-say') && it.o[j] !== undefined) row.appendChild(sentSayBtn(it.o[j]));
  };
  const box = $('#sentOpts');
  if(box) box.querySelectorAll('.s-opt').forEach((b,j)=> hang(b.parentElement, j));
  const exp = $('#sentExp');
  if(exp && !exp.classList.contains('hidden')) exp.querySelectorAll('.s-g').forEach(hang);
}

/* גרסת הבנייה נשלפת מתג הסקריפט של app.js עצמו, ולא נכתבת ביד: מספר גרסה כתוב
   ביד הוא מספר גרסה שיישכח בדיפלוי הבא, והקובץ היה נשלף מהמטמון לנצח. */
function sentBuildV(){
  const src = Array.from(document.scripts).map(x=>x.src||'').find(x=>/app\.js\?v=/.test(x));
  return (src && src.match(/[?&]v=(\d+)/) || [])[1] || '';
}
let sentLoading = null;
function loadSentData(){
  if(window.SENT_EN) return Promise.resolve(true);
  if(sentLoading) return sentLoading;
  sentLoading = new Promise(res=>{
    const el = document.createElement('script');
    const v = sentBuildV();
    el.src = './data-sent-en.js' + (v ? '?v='+v : '');
    el.onload  = ()=> res(!!window.SENT_EN);
    /* ⚠ מאפסים את ההבטחה בכשל. בלי זה נסיון שני היה מקבל את ההבטחה הכבויה
       ומחזיר false לנצח, גם אחרי שהרשת חזרה. */
    el.onerror = ()=>{ sentLoading = null; res(false); };
    document.head.appendChild(el);
  });
  return sentLoading;
}

/* משפטי הדוגמה של הפידבק (EX_SENT_EN). אותו דפוס בדיוק כמו loadSentData ומאותה
   סיבה: 300KB שנטענים בכל עליית דף היו מס על מי שמתרגל רק עברית. נטען בכניסה
   לאנגלית; אם הפידבק הראשון מקדים את הטעינה · המשפט פשוט לא מוצג לכרטיס ההוא. */
let exSentLoading = null;
function loadExSentData(){
  if(window.EX_SENT_EN) return Promise.resolve(true);
  if(exSentLoading) return exSentLoading;
  exSentLoading = new Promise(res=>{
    const el = document.createElement('script');
    const v = sentBuildV();
    el.src = './data-en-sentences.js' + (v ? '?v='+v : '');
    el.onload  = ()=> res(!!window.EX_SENT_EN);
    el.onerror = ()=>{ exSentLoading = null; res(false); };
    document.head.appendChild(el);
  });
  return exSentLoading;
}

/* ⚠ `sentDone` ו-`markSentDone` הוסרו. הם החזיקו מערך מזהים בלבד, וזה היה מקור
   אמת שני לצד מפת ההתקדמות · שני מקורות שיכולים להיפרד. עכשיו יש אחד:
   `sentProg()`, ו-`sentRecord()` הוא הכותב היחיד אליו. */

/* ===== בורר הרצועות ===== */
function renderSentPick(){
  const list = $('#sentPickList'); if(!list) return;
  const S = sentBank();
  list.innerHTML = '';
  /* ⛔ נמצא בציד ב-11.8: `loadSentData` מחזירה `!!window.SENT_EN`, ואובייקט ריק
     הוא truthy · כלומר "הצליח". התוצאה הייתה **מסך לבן** עם ✕ וכותרת בלבד, בלי
     הודעה ובלי toast. עכשיו נאמר מה קרה ומה לעשות. /HEB §10. */
  if(!Object.keys(S).some(b => Array.isArray(S[b]) && S[b].length)){
    list.innerHTML = '<p class="s-sum">לא נטענו משפטים. חזור למסך הקודם ונסה שוב, '
      + 'ואם זה חוזר בדוק את החיבור לרשת.</p>';
    return;
  }
  const IC = {'בסיס':'🌱','בינוני':'📗','מתקדם':'📘','אקדמי':'🎓'};
  Object.keys(S).forEach(band=>{
    const all = S[band] || [];
    const b = document.createElement('button');
    b.className = 'pbtn';
    /* §5: מספר אמיתי. "נותרו" הוא מה שבאמת נשאר, ואחרי סיום הרצועה השורה אומרת
       שהיא הושלמה ולא מציגה 0.
       ⚠ ומה שנוסף עם המעקב: כמה מהם **נכונים**. "12 נפתרו" לבדו אינו אומר ללומד
       אם הוא יודע את הרצועה, ורק שהוא עבר בה. */
    const q = sentSummary(band);
    const sub = q.left
      ? `${q.left} משפטים שטרם פתרת · מתוך ${q.total}` + (q.solved ? ` · ${okN(q.ok)}` : '')
      : `הושלמה · ${okN(q.ok)} מתוך ${q.total}`;
    b.innerHTML = `<div class="ic">${IC[band]||'✍️'}</div><div class="tx"><b>${sEsc(band)}</b>`
      + `<span>${sub}</span></div>`
      + `<div class="cnt">${q.left ? q.left : '✓'}</div>`;
    b.onclick = ()=> startSentRound(band);
    list.appendChild(b);
  });
  $('#sentBrand').textContent = 'השלמת משפטים';
  $('#sentCount').textContent = '';
  $('#sentScore').textContent = '';
  $('#sentBar').style.width = '0%';
}

/* ===== סבב ===== */
function startSentRound(band){
  /* פריטים שבורים מסוננים לפני כל השאר. ⚠ אם **כולם** נפלו, אין סבב: מסך ריק
     עם כפתור "סבב נוסף" שאינו עושה דבר הוא לופ שהלומד לא יכול לצאת ממנו. */
  const all = (sentBank()[band] || []).filter(sentItemOk);
  if(!all.length){
    toast('אין משפטים זמינים ברצועה הזאת. בחר רצועה אחרת');
    openSentPick();
    return;
  }
  const p = sentProg();
  /* ⭐ שלוש קבוצות, בסדר הזה, וזו התועלת המרכזית של המעקב:
       1. פריטים שטרם נפתרו.
       2. פריטים שנפתרו ו**לא** נענו נכון אף פעם · הם החוליה החלשה.
       3. השאר, לחזרה.
     הגרסה הקודמת ידעה רק "נענה או לא", ולכן פריט שנכשל בו חזר באותה סבירות
     כמו פריט שידע. הסדר כאן מביא קודם את מה שלא נשלט. */
  const fresh  = all.filter(it => !p[it.src] || !p[it.src].n);
  const failed = all.filter(it => p[it.src] && p[it.src].n && !p[it.src].ok);
  const known  = all.filter(it => p[it.src] && p[it.src].ok > 0);
  /* ⭐ בתוך "ידועים", מי שהתשובה **האחרונה** שלו הייתה שגויה קודם. זה מה שהופך את
     השדה `last` לחי: פריט שנענה נכון פעם ואחר כך נשכח אינו זהה לפריט שנענה נכון
     בפעם האחרונה, ובלי זה `last` היה נשמר ואף אחד לא היה קורא אותו. */
  const slipped = shuffle(known.filter(it => p[it.src].last === 0));
  const solid   = shuffle(known.filter(it => p[it.src].last !== 0));
  let pool = shuffle(fresh.slice());
  if(pool.length < SENT_ROUND) pool = pool.concat(shuffle(failed.slice()));
  if(pool.length < SENT_ROUND) pool = pool.concat(slipped, solid);
  /* מערבבים גם את סדר הפריטים וגם את סדר האפשרויות **בתוך** כל פריט. */
  /* ⚠ **בלי shuffle נוסף כאן.** הגרסה הראשונה של סדר העדיפות ערבבה את pool כולו
     בשורה הזאת, וזה ביטל בשקט את כל הסדר שנבנה למעלה: פריט שנכשל בו חזר לאותה
     סבירות כמו פריט שידע. הקבוצות מעורבבות **בתוכן** בנפרד, וזה מספיק. */
  sentQ = pool.slice(0, Math.min(SENT_ROUND, all.length)).map(sentShuffled);
  sentI = 0; sentOk = 0; sentBand = band;
  $('#sentPick').classList.add('hidden');
  $('#sentDone').classList.add('hidden');
  $('#sentCard').classList.remove('hidden');
  renderSentCard();
}

/* ⛔ הבאג החוסם שנתפס בבדיקה בדפדפן, לפני העלייה
   -------------------------------------------
   **כל 204 הפריטים נשמרים עם `a:0`.** זה מכוון בקורפוס · הכותבים מציבים את
   התשובה ראשונה וההסבר נכתב מולה · ו-assemble.js אף מזהיר על כך בכותרת הקובץ:
   "המגיש חייב לערבב". השערים החיצוניים אכן ערבבו (blind_export.js), אבל
   האפליקציה **היא** מגיש, ובגרסה הראשונה שלה כאן היא לא ערבבה. התוצאה: התשובה
   הנכונה הייתה תמיד הכפתור הראשון, ולומד היה מגלה את זה בשאלה השלישית ומפסיק
   לקרוא את המשפטים.
   ⚠ הערבוב חייב למפות מחדש **שלושה** מערכים יחד: o, g ו-r. מיפוי של o בלבד היה
   מצמיד לכל מילה את הפירוש והנימוק של מילה אחרת, וזה כשל גרוע מהמקורי כי הוא
   שקט. */
/* ⛔ שער תקינות לפריט, נגזר מציד באגים ב-11.8. שלושה ממצאים נפרדים באו מכאן:
     · `a` מחוץ לטווח → `idx.indexOf` החזיר -1, אף כפתור לא סומן נכון, כל בחירה
       נחשבה שגויה, ובהסבר נכתב "התשובה: undefined".
     · `g` או `r` קצרים מ-`o` → "המילים" הציג פירוש אחד ושלוש שורות ריקות,
       והנימוק שויך למילה אחרת. **בלי שום שגיאה.**
     · `t` ריק → כותרת "המשפט" עם גוף ריק.
   ⚠ שלושתם היו **שקטים**, וזה מה שהופך אותם למסוכנים: הלומד היה רואה מסך שנראה
   תקין ומלמד אותו דבר שגוי. פריט שאינו עומד בשער נפסל מהסבב, ולא מוצג שבור. */
function sentItemOk(it){
  return isObj(it) && typeof it.s === 'string' && /_{2,}/.test(it.s)
    && Array.isArray(it.o) && it.o.length >= 2
    && Number.isInteger(it.a) && it.a >= 0 && it.a < it.o.length
    && Array.isArray(it.g) && it.g.length === it.o.length && it.g.every(x => !!x)
    && Array.isArray(it.r) && it.r.length === it.o.length && it.r.every(x => !!x)
    && typeof it.t === 'string' && it.t.trim().length > 0;
}
function sentShuffled(it){
  const idx = shuffle(it.o.map((_,i)=>i));
  return {
    ...it,
    o: idx.map(i=>it.o[i]),
    g: (it.g||[]).length ? idx.map(i=>it.g[i]) : it.g,
    r: (it.r||[]).length ? idx.map(i=>it.r[i]) : it.r,
    a: idx.indexOf(it.a),
  };
}

/* המשפט המלא באנגלית, כשהתשובה הנכונה יושבת במקום החסר ומודגשת. עד כה ההסבר הציג
   את התרגום לעברית בלבד, והמשפט האנגלי נשאר עם `___` בכרטיס שמעל · כלומר הלומד
   מעולם לא ראה את המשפט השלם שהוא אמור לזכור. שלוש שורות באותו סדר בכל האפליקציה:
   תווית · המשפט באנגלית · המשפט בעברית.
   ⚠ בפריט זוג `o[a]` הוא מערך של שתי מילים ובמשפט שני חסרים, והסדר קובע: המילה
   הראשונה לחסר הראשון. `min` מגן על פריט שבו יש יותר חסרים מחלקים, שאינו אמור
   להתקיים אבל היה מייצר `undefined` על המסך במקום להיעדר בשקט. */
function sentFull(it){
  const parts = Array.isArray(it.o[it.a]) ? it.o[it.a] : [it.o[it.a]];
  let k = 0;
  return sEsc(it.s).replace(/_{2,}/g, () =>
    `<b>${sEsc(parts[Math.min(k++, parts.length - 1)])}</b>`);
}

function renderSentCard(){
  const it = sentQ[sentI]; if(!it) return finishSentRound();
  sentAnswered = false;
  $('#sentBrand').textContent = sentBand;
  $('#sentCount').textContent = `שאלה ${sentI+1} מתוך ${sentQ.length}`;
  $('#sentScore').textContent = sentOk ? `✓ ${sentOk}` : '';
  $('#sentBar').style.width = (100*sentI/sentQ.length)+'%';
  /* ⚠ בפריט זוג שני החסרים נראים **זהים**, והאפשרות היא "align + differ" · כלומר
     הסדר קובע, והכרטיס לא אמר מה לאיפה. נמצא בציד ב-11.8. מספור החסרים אומר את
     זה בלי מילים, ו-`aria-hidden` מונע מקורא מסך להקריא ספרה בתוך המשפט. */
  let nBlank = 0;
  const twin = (it.s.match(/_{2,}/g) || []).length > 1;
  $('#sentText').innerHTML = sEsc(it.s).replace(/_{2,}/g, () => {
    nBlank++;
    return twin
      ? `<span class="bl">___<sup aria-hidden="true">${nBlank}</sup></span>`
      : '<span class="bl">___</span>';
  });
  const box = $('#sentOpts'); box.innerHTML = '';
  /* LANG==='en' ולא TTS.available() לבדו · TTS.pick בוחר קול אנגלי בלבד. אותו נימוק
     שכבר כתוב מעל bindSay ובמסך הסיכום: כפתור שאינו יודע להגות את מה שכתוב עליו
     גרוע מהיעדרו, ולכן הוא לא מוזרק בכלל ולא מוזרק מושבת.
     ⚠ המסך הזה קיים רק במצב אנגלית (`sentOn`), כך שהתנאי אינו אמור להיכשל כאן.
     הוא נשאר מפורש כדי שהכלל יהיה קריא באתר אחד עם שאר הרמקולים באפליקציה. */
  const canSay = LANG==='en' && TTS.available();
  it.o.forEach((o,j)=>{
    const row = document.createElement('div');
    row.className = 's-optrow';
    const b = document.createElement('button');
    b.className = 's-opt'; b.type = 'button';
    b.textContent = sLabel(o);
    b.onclick = ()=> answerSent(j);
    row.appendChild(b);
    if(canSay) row.appendChild(sentSayBtn(o));
    box.appendChild(row);
  });
  $('#sentExp').classList.add('hidden');
  $('#sentActions').classList.add('hidden');
  $('#sentLive').textContent = `שאלה ${sentI+1} מתוך ${sentQ.length}. ${it.s.replace(/_{2,}/g,'חסר')}`;
}

function answerSent(pick){
  if(sentAnswered) return;                   // הגנה מהקלקה כפולה
  sentAnswered = true;
  const it = sentQ[sentI];
  const right = pick === it.a;
  if(right) sentOk++;
  sentRecord(it.src, right);
  /* ⚠ `.s-opt` ולא `.children`. הילדים של `#sentOpts` הם היום `.s-optrow` · עטיפות
     שנוספו כדי שהרמקול יוכל להיות אח של הכפתור ולא צאצא שלו. עם `.children`
     ה-✓/✗ היו נשתלים בתוך העטיפה ולא בכפתור, `is-right` היה נוחת על ה-div
     (שאין לו כזה כלל ב-CSS), ו-`disabled` על div אינו עושה דבר · כלומר אפשר היה
     לענות פעמיים על אותה שאלה. נבדק ב-tests/73.
     ⭐ ומכאן גם התשובה לדרישה "הרמקול נשאר פעיל אחרי מענה": הוא פשוט אינו בלולאה.
     אח של `.s-opt`, ולא ילד · ולכן `disabled` אינו נוגע בו. */
  $('#sentOpts').querySelectorAll('.s-opt').forEach((b,j)=>{
    b.disabled = true;
    if(j === it.a){ b.classList.add('is-right'); b.insertAdjacentHTML('afterbegin','<span class="mk">✓</span>'); }
    else if(j === pick){ b.classList.add('is-wrong'); b.insertAdjacentHTML('afterbegin','<span class="mk">✗</span>'); }
  });
  $('#sentScore').textContent = sentOk ? `✓ ${sentOk}` : '';

  /* ההסבר, בשלושת החלקים ובסדר שנקבע. הלומד רואה **שני** נימוקים בלבד: של
     הבחירה שלו ושל התשובה הנכונה. הצגת כל הארבעה היא בדיוק מה שהתבקש לקצר. */
  /* רמקול גם כאן, ולא רק בשאלה. זה הרגע שבו הלומד באמת רוצה לשמוע: הוא כבר יודע
     מה התשובה, והשאלה שנשארה היא איך הוגים אותה.
     ⚠ מה שמושמע הוא `it.o[j]` ולא `it.g[j]`. `it.g[j]` הוא מחרוזת תצוגה בצורה
     "pay = לשלם" · מנוע ההקראה האנגלי היה מבטא בה גם את סימן השוויון וגם את
     העברית. המקור הנקי הוא `it.o[j]`, ומשם גם הרמקול בשאלה שואב. */
  const canSay = LANG==='en' && TTS.available();
  const g = (it.g||[]).map((x,j)=>
    `<div class="s-g${j===it.a?' key':''}"><span class="s-gt">${j===it.a?'✓ ':''}${sEsc(x)}</span></div>`).join('');
  const r = it.r || [];
  const why = right
    ? `<p class="vd ok">בחרת <code>${sEsc(sLabel(it.o[pick]))}</code> וצדקת</p><p>${sEsc(r[pick]||'')}</p>`
    : `<p class="vd bad">בחרת <code>${sEsc(sLabel(it.o[pick]))}</code></p><p>${sEsc(r[pick]||'')}</p>`
      + `<p class="vd ok">התשובה: <code>${sEsc(sLabel(it.o[it.a]))}</code></p><p>${sEsc(r[it.a]||'')}</p>`;
  $('#sentExp').innerHTML =
      `<section><h4>המילים</h4>${g}</section>`
    + `<section><h4>המשפט</h4><p class="s-en"><bdi lang="en" dir="ltr">${sentFull(it)}</bdi></p>`
      + `<p class="s-tr">${sBold(it.t)}</p></section>`
    + `<section class="s-why"><h4>${right?'למה זה נכון':'למה הבחירה שלך אינה נכונה'}</h4>${why}</section>`;
  /* הרמקולים נתלים אחרי ה-innerHTML ולא בתוכו: מטפל שנכתב כמחרוזת חייב להיות
     `onclick="..."` גלובלי, וה-CSP של הפרויקט חוסם inline script. אותו דפוס בדיוק
     כמו `.rev-say` במסך הסיכום. */
  if(canSay) $('#sentExp').querySelectorAll('.s-g').forEach((row,j)=>
    row.appendChild(sentSayBtn(it.o[j])));
  $('#sentExp').classList.remove('hidden');
  $('#sentNext').textContent = (sentI+1 >= sentQ.length) ? 'סיום ←' : 'הבא ←';
  $('#sentActions').classList.remove('hidden');
}

function finishSentRound(){
  $('#sentCard').classList.add('hidden');
  $('#sentBar').style.width = '100%';
  const n = sentQ.length;
  const q = sentSummary(sentBand), all = sentSummary(null);
  /* המספר הגדול הוא ציון הסבב, ומתחתיו ההתקדמות המצטברת. שני מדדים שונים ולומד
     צריך את שניהם: כמה הצלחתי עכשיו, ואיפה אני עומד בסך הכול. */
  $('#sentDone').innerHTML =
      `<div class="num">${sentOk}</div><div>מתוך ${n} משפטים</div>`
    + `<p class="s-sum">ברצועת ${sEsc(sentBand)}: ${okN(q.ok)} מתוך ${q.total}`
    + (q.left ? ` · נותרו ${q.left}` : ' · הרצועה הושלמה') + '</p>'
    /* ⚠ כשהכתיבה לדיסק נכשלה, הסיכום המצטבר **סותר** את ציון הסבב: "10 מתוך 10"
       ומיד מתחת "0 נכונים · 0%". נמצא בציד ב-11.8. במקום שני מספרים שמכחישים זה
       את זה, נאמר מה קרה. /HEB §10 · הודעה חייבת לומר מה עכשיו. */
    + (sentSaveFailed
        ? `<p class="s-sum">⚠ ההתקדמות לא נשמרה במכשיר הזה, כי אחסון הדפדפן מלא. `
          + `פנה מקום ונסה שוב, או המשך לתרגל בלי מעקב</p>`
        : `<p class="s-sum">בסך הכול: ${all.ok} מתוך ${all.total} · ${all.pct}%</p>`)
    + `<div class="actions" style="margin-top:22px;justify-content:center">`
    + `<button class="btn btn-primary" id="sentAgain">סבב נוסף</button>`
    + `<button class="btn btn-ghost" id="sentBack">בחירת רצועה</button></div>`;
  $('#sentDone').classList.remove('hidden');
  $('#sentAgain').onclick = ()=> startSentRound(sentBand);
  $('#sentBack').onclick  = ()=> openSentPick();
  renderHome();                               // הכפתור בבית מציג את מה שנותר
  /* ⚠ דחיפה כפויה בסוף סבב, בדיוק כמו commitSession. queueRemoteSync משהה 12
     שניות, וסוף סבב הוא נקודה שבה הלומד עלול לסגור את הלשונית · ואז ההשהיה
     הייתה מאבדת את הסבב מהענן עד הכניסה הבאה על אותו מכשיר. */
  if(currentUser) flushRemoteSync().catch(()=>{});
}

function openSentPick(){
  $('#sentCard').classList.add('hidden');
  $('#sentDone').classList.add('hidden');
  $('#sentPick').classList.remove('hidden');
  renderSentPick();
}

/* ⚠ נמצא בציד ב-11.8: שתי לחיצות על "הבא" באותו tick קידמו את `sentI` פעמיים,
   המונה דילג ל"שאלה 3 מתוך 10", ו**שאלה שלמה לא הוצגה בכלל**. בפועל הכפתור נעלם
   מיד אחרי הלחיצה הראשונה ולכן הקשה פיזית שנייה לא פוגעת בו, אבל מקלדת, קורא מסך,
   או לחיצה כפולה מהירה כן מגיעים לשם. `sentAnswered` הוא בדיוק הדגל שאומר "שאלה
   זו נענתה"; הוא מתאפס ב-renderSentCard, ולכן שימוש בו כאן חוסם את הלחיצה השנייה
   בלי מצב חדש. */
$('#sentNext').onclick = ()=>{
  if(!sentAnswered) return;
  sentAnswered = false;
  sentI++; renderSentCard();
};
$('#sentExit').onclick = ()=>{ goBack(); };

$('#pbSent').onclick = async ()=>{
  const btn = $('#pbSent'), sub = $('#pbSentSub'), was = sub.textContent;
  btn.disabled = true; sub.textContent = 'טוען את המשפטים…';
  const ok = await loadSentData();
  btn.disabled = false; sub.textContent = was;
  /* §10: הודעת שגיאה חייבת לומר מה עכשיו. */
  if(!ok){ toast('לא ניתן לטעון את המשפטים. בדוק את החיבור לרשת ונסה שוב'); return; }
  openSentPick();
  goto('sent');
};

/* ===== preview =====
   The survey's clearest finding was that a mandatory account is the first wall people hit.
   Preview opens unit 1 and the level test with no sign-up. Progress is real and kept locally
   under its own owner key, so the moment an account is created nothing has to be discarded -- 
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
   Only used to word the splash · the real decision still waits for currentSession(). */
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
  /* פסק הזמן אינו "אין הפעלה". getSession() יוצאת לרשת כשה-token פג, ולכן רשת איטית,
     מצב טיסה, או Supabase שמאחר · כל אחד מהם החזיר null, והאפליקציה הסיקה שהמשתמש
     התנתק. זה מה שהוציא אנשים שוב ושוב ממכשירים שמעולם לא התנתקו בהם, וזה גם מה שהחליף
     את השם במייל במצב טיסה: בלי הפעלה אין פרופיל לקרוא ממנו את השם.
     ההפעלה השמורה נקראת מהדיסק בלי רשת. token שפג עדיין אומר מי המשתמש, וזה כל מה
     שנדרש כדי לפתוח את החשבון הנכון ולטעון את ההתקדמות המקומית. */
  if(!(sess && sess.user)){
    const cached = (typeof Store.cachedSession==='function') ? Store.cachedSession() : null;
    if(cached){ sess = cached; console.warn('session restored from disk -- the network answer did not arrive'); }
  }
  /* Below ~400ms the splash reads as a flicker, which is its own kind of ugly. Above it, it
     reads as the app starting. Only ever waits on a FAST answer -- a slow one is already past. */
  const wait=400-(Date.now()-t0);
  if(wait>0) await new Promise(r=>setTimeout(r, wait));
  if(sess && sess.user){ currentUser=sess.user; await afterAuthed(false); }
  else {
    // a stranger meets the landing page, not a password field: the survey's clearest finding
    setAuthMode('signin'); buildAuthDrift(); hide($('#fbFab'));
    goto(LS.get('hw_seenIntro',0) ? 'auth' : 'intro');
  }
  try{
    /* This used to read `if(s && s.user && !currentUser)` -- it reacted to "nobody was signed in
       yet" instead of to "who is signed in changed". A second account signing in on a page that
       already had a session was therefore ignored completely: the screen kept the FIRST user's
       name and local cache while every request went out with the SECOND user's token, and the
       next save wrote one account's progress into the other's row.
       Supabase can hand us a different user without any click here -- a confirmation or
       reset link opened in this tab carries its own session. Compare identity, not emptiness. */
    Store.onAuthChange((s, evt)=>{
      const uid = s && s.user && s.user.id;
      if(uid){
        if(uid !== (currentUser && currentUser.id)){ currentUser=s.user; afterAuthed(false); }
      } else if(evt === 'SIGNED_OUT' || evt === 'USER_DELETED'){
        /* רק התנתקות מפורשת מנקה את המשתמש. קודם כל הפעלה ריקה עשתה זאת, ו-supabase-js
           משדרת INITIAL_SESSION עם null בכל פעם שלא הצליחה לקרוא הפעלה · כלומר בכל
           טעינה בלי רשת. התוצאה הייתה שהאתחול שחזר את המשתמש מהדיסק, והאירוע הזה מחק
           אותו מיד אחר כך. */
        currentUser=null;
      }
    });
  }catch(e){}
}

/* ===== boot ===== */
(function boot(){
  try{
    // The install CTA only makes sense when the app isn't installed yet -- otherwise it's noise.
    const el=$('#installHint2');
    if(el && !isStandalone() && !LS.get('hw_installed',0)){
      show(el);
      el.onclick=()=>promptInstall(true);
    }
  }catch(e){}
  // The auth screen is the only way in, so it must appear even if the session lookup throws.
  // checkSessionAndBoot is async -- a plain try/catch would never see its rejection.
  const fallbackToAuth = ()=>{ SCREENS.forEach(s=>{const el=$('#'+s); if(el) hide(el);}); show($('#auth')); setAuthMode('signin'); };
  /* Watchdog. The splash is now the first paint, so anything that hangs after it -- a profile
     read, the progress pull -- would leave a spinner on screen with no way out. Twelve seconds,
     then route by the one fact we can establish locally and let the user get on with it. */
  setTimeout(()=>{
    if($('#boot') && !$('#boot').classList.contains('hidden')){
      console.warn('[boot] הכניסה לא הסתיימה בזמן. ממשיך בלי המתנה');
      /* Latch it. Only currentSession() is raced against a timeout; myProfile() and
         pullAccountState() are not. If one of them was merely slow rather than dead, it wakes
         up minutes later and afterAuthed carries on to its goto() -- dragging the learner out of
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
