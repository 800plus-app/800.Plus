'use strict';
/* ⭐ הזיקוק · typo-lab/distill.js · **המורה מלמד את התלמיד, באמת**
 *
 *   node --max-old-space-size=8192 typo-lab/distill.js --plan            · סבב חדש → אצוות לשופטים
 *   node typo-lab/distill.js --ingest                                    · קליטת הפסקים לפנקס
 *   node --max-old-space-size=8192 typo-lab/distill.js --report          · עקומת הלמידה + המועמד
 *   node typo-lab/distill.js --selftest                                  · שיניים
 *
 * הרצף: `--plan` → שופטים → `--ingest` → `--plan` → … → `--report`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ מה זה, ומה **היה** קודם
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ‏`en-word` עלה מ-67.93% ל-74.63% ונשלח — ⛔ **בלי המורה**. התלמיד אומן על
 * **תוויות הדאטהסט** כמורה זמני, וזה כתוב במפורש ב-`typo-rules.json`:
 * *"⚠ זמני · תיוגי הדאטהסט. המורה האמיתי (teacher.js) טרם חובר ללולאה"*.
 * הקובץ הזה מחבר אותו.
 *
 * ‏`makeTeacher` ב-`loop.js` מקבל עכשיו `oracle` אופציונלי. בלעדיו — ההתנהגות
 * זהה למה שהיה. איתו — הפסק מגיע מהפנקס של `teacher.js`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔⛔ **החור שנמצא לפני שנקנה ולו פסק אחד · כיוון `word`**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * המורה מכויל ל**אפס קבלות-שווא** על ארבעה סטים · וזה נכון ומאומת. אבל אותה
 * מדידה, מפוצלת לפי **כיוון**, מראה שהוא כמעט אינו יכול ללמד את `en-word`:
 *
 *   ‏en40 · `gloss` · דיוק 100.0% · recall 100.0%
 *   ‏en40 · `word`  · דיוק  50.0% · recall  **25.0%**
 *   ‏en2  · `word`  · דיוק  34.8% · recall   **0.0%**
 *
 * המנגנון גלוי בפנקס. על **כל** שגיאת הקלדה אנגלית שתי העדשות שהשאלה שלהן
 * מוגדרת אומרות `כ` — ‏T2 (אין מילה שגויה) ו-T3 (הטקסט מוביל למונח) — ואילו
 * ‏T5 ("האם זו מילה קיימת") אומרת `ל`, כי `abavus` **באמת אינה מילה**. חוק
 * פה-אחד הופך כל `ל` לדחייה, ולכן המורה דוחה 12 מתוך 12:
 *
 *   ‏E01 abacus→abavus   T2=כ T3=כ T5=ל  ⇒ reject   (אמת המידה: **כ**)
 *   ‏E12 community→sommunity  T2=כ T3=כ T5=ל ⇒ reject (אמת המידה: **כ**)
 *
 * ⭐ **וזה כתוב ב-`teacher.js` עצמו**, בהערה שמעל `decide`: *"בכיוון `word` …
 * שם T5 מצביעה **הפוך**. מחרוזת שאינה מילה היא שגיאת הקלדה ⇒ הלומד ידע."*
 * הקובץ ניסח את העיקרון, בנה עליו את `decideWordDir`, וב-16.8 **הסיר** אותה
 * (בצדק — היא עקפה את הפאנל וקיבלה 3 שורות שבהן כל העדשות אמרו `ל`).
 * ‏T5 נשארה מצביעה בכיוון `word`, **ולזה אין נימוק כתוב באף מקום.**
 *
 * לכן שני חוקים נמדדים כאן, ושניהם מדווחים · `typo-lab/teacher_rule_probe.js`:
 *
 *   ‏R0 · החוק הנעול · כמו ש-`teacher.js` מכריע היום
 *   ‏R2 · ‏T5 **אינה חלה** בכיוון `word` + מכסת 2 עדשות שם
 *
 * ⛔ **הסייג, ושלוש שכבות שלו — אסור לבלוע:**
 *   ‏1. ‏R2 נבחר אחרי שראיתי את הסטים ⇒ **בתוך-מדגם**. ‏`teacher.js` כותב את
 *      זה על עצמו: *"תיקון שנעשה על סמך סט שכבר נראה הופך אותו לבתוך-מדגם."*
 *   ‏2. מה שכן מחזיק מחוץ למדגם הוא ה**מבנה**: ‏R2 אינו עוקף את הפאנל אלא
 *      מוציא עדשה אחת מההצבעה. שלוש קבלות-השווא של `decideWordDir`
 *      (‏X20/X21/X27) **נשארות דחויות** תחת R2, כי T2 ו-T3 אמרו `ל`. נבדק.
 *   ‏3. ‏R2 מוותר על מכסת שלוש העדשות בכיוון `word`. במדגם T5 לא קנתה שם אף
 *      דחייה — כל דחייה נכונה נתפסה גם ב-T2/T3 — אבל n קטן.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ שלושת האילוצים שאינם ניתנים למשא ומתן
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   ‏1. **מחלקת `zngry` נאכפת מבנית** · 145,668 שליליות שנמנו מהמאגר, אפס
 *      תקציב מורה. ⚠ ‏`loop.js main()` **לא** טען אותן, ולכן כל מספר בעקומה
 *      הקודמת נמדד תחת אילוץ חלש יותר. כאן הן בפנים תמיד.
 *   ‏2. **‏holdout · 24+5 המקרים · הסטים העיוורים** · נמדדים, לעולם לא מאומנים.
 *      הבריכה היא `sp.train` בלבד, ואין שום מסלול שמכניס אליה שורת holdout.
 *   ‏3. **אנגלית בלבד** · `en-word`. עברית ירדה מהשולחן בהכרעת חגי.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ התור המדורג · מה הוא כן ומה הוא לא
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ‏`out/teacher-queue.jsonl` נבנה מעל **קורפוס אחר** (`answers-*.jsonl`,
 * ‏`gen_answers.js`) מזה שהתלמיד מאומן עליו (`dataset-*.jsonl`). נמדד:
 *
 *   ‏44,485 שורות `en/word/train` בתור · **6,951 מהן נוחתות על שורת תלמיד**
 *   כלומר **15.6%**. ‏37,534 שורות תור אינן קיימות בקורפוס של התלמיד בכלל.
 *
 * ⭐ המסקנה אינה "התור חסר ערך" אלא **מה כל אחד טוב אליו**:
 *   · **סבב 0** · התור, בסדר הדירוג שלו, מסונן ל-`purpose==='train'` ולשורות
 *     שנוחתות. הוא נושא את ה**שזירה** — פריסה על פני מחלקות שגיאה — וזה בדיוק
 *     מה שאין לפונקציית רכישה שמסתכלת רק על מרחק.
 *   · **סבבים 1+** · `acquire()` על ‎S‎ מול המודל **הנוכחי**. רק היא יכולה
 *     למצוא "היכן התלמיד חולק על המורה", כי רק היא יודעת מה התלמיד חושב עכשיו.
 */

const fs = require('fs');
const path = require('path');
const FIT = require('./fit.js');
const LOOP = require('./loop.js');
const T = require('./teacher.js');
const { decideBy, RULES } = require('./teacher_rule_probe.js');

const OUT = path.join(__dirname, 'out');
const TDIR = path.join(OUT, 'teacher');
const SET = 'distill-en-word';
const STATE = path.join(OUT, 'distill-state.json');
const say = s => process.stdout.write(s + '\n');
const pct = x => (100 * x).toFixed(2) + '%';
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const num = (f, d) => { const v = arg(f, null); return v === null ? d : Number(v); };

/* ===================== 1 · הקורפוס של התלמיד ===================== */

/* ⛔ `zngry` נטענת לתוך אותו `pack` · אילוץ מבני, בדיוק כמו ב-`fit.js main()`.
   ⚠ נמדד בפרויקט מה קורה בלעדיה: המועמד "עלה" ל-80.96% והחמיר את המחלקה
   מ-46.5% ל-63.4%. השיפור היה מזויף במלואו. */
function loadS() {
  const zrecs = FIT.loadZngry();
  const recs = FIT.loadCache('en-word');
  if (!zrecs) throw new Error('⛔ אין מטמון zngry · האילוץ המבני לא ייאכף · הרץ zngry_negatives.js');
  const S = FIT.pack(recs.concat(zrecs));
  S.nBase = recs.length;
  return S;
}

/* פירוש הכרטיס · לא במטמון התכונות. נגזר מ-`answers-en.jsonl` (קריאה בלבד). */
let GLOSS = null;
function glossOf(term) {
  if (!GLOSS) {
    GLOSS = new Map();
    for (const l of fs.readFileSync(path.join(OUT, 'answers-en.jsonl'), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      const r = JSON.parse(l);
      if (!GLOSS.has(r.card_term)) GLOSS.set(r.card_term, r.card_gloss);
    }
  }
  return GLOSS.get(term) || '';
}

/* ⭐ מה שמוגש למורה · ו**מה שבכוונה אינו מוגש**.
 * ⛔ אין כאן `label`, אין `why`, אין `margin`, אין `today`. מורה שרואה מה
 * האלגוריתם חושב מעגן את עצמו במה שאנחנו מנסים לשפר — זה כתוב ב-`teacher_queue.js`
 * וזה נאכף כאן על ידי כך שהשדות פשוט אינם נבנים. */
function itemFor(S, i) {
  const r = S.recs[i];
  return T.itemOf({
    lang: 'en', direction: 'word',
    term: r.term, gloss: glossOf(r.term),
    written: r.key, typed: r.typed,
  });
}

/* ===================== 2 · המורה כאורקל ===================== */

function makeOracle(S, rule, ledger, hashOf) {
  const led = ledger || T.loadLedger(SET);
  const f = i => {
    const h = hashOf(i);
    const v = led.get(h);
    if (!v) return 'unsure';                    /* לא נשלח / לא חזר · אינו קבלה ואינו שלילי */
    return decideBy(rule, itemFor(S, i), v);
  };
  f.source = `teacher.js · פנקס ${SET} · חוק ${rule === RULES.R0 ? 'R0 (נעול)' : 'R2 (T5 יוצאת ב-word)'}`;
  return f;
}

/* ===================== 3 · הבריכה, והסדר שבו קונים ===================== */

/* ⭐ סבב 0 · התור המדורג. ‏`purpose==='train'` בלבד — `ceiling` הוא מדידת תקרה
   ולתלמיד אין תכונה שמבטאת אותו. ⚠ נמדד ש-`en/word` הוא **100% `train`**
   (‏44,485 מתוך 44,485 · אפס `ceiling`), כלומר הסינון הוא no-op כאן בדיוק —
   והאזהרה על 11,424 הפריטים המבוזבזים נוגעת ל-`gloss` ולא לנו. */
function queueOrder(S, poolSet) {
  const byTT = new Map();
  for (const i of poolSet) {
    const r = S.recs[i];
    const k = r.term + '' + r.typed;
    let a = byTT.get(k); if (!a) { a = []; byTT.set(k, a); }
    a.push(i);
  }
  const out = [], seen = new Set();
  let qn = 0, qhit = 0;
  for (const l of fs.readFileSync(path.join(OUT, 'teacher-queue.jsonl'), 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const q = JSON.parse(l);
    if (q.lang !== 'en' || q.direction !== 'word') continue;
    if (q.purpose !== 'train') continue;                 /* ⛔ ceiling ו-external אינם מתאמנים */
    qn++;
    const a = byTT.get(q.card_term + '' + q.typed);
    if (!a) continue;
    qhit++;
    for (const i of a) if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return { order: out, queueRows: qn, joined: qhit };
}

/* ===================== 4 · מצב הריצה ===================== */

function readState() {
  if (!fs.existsSync(STATE)) return { rounds: [], labeled: [] };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}
function writeState(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); }

const setFile = () => path.join(TDIR, SET + '.jsonl');
function readSetRows() {
  const p = setFile();
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

/* ===================== 5 · --plan · סבב חדש ===================== */

function plan() {
  const K = num('--k', 250);
  const S = loadS();
  const sp = FIT.splits(S);
  const st = readState();
  const already = new Set(st.labeled);

  const shipped = FIT.fromAppParams(FIT.shippedParams('en-word'));
  const crossNeg = sp.cross.filter(i => S.isAcc[i] !== 1);
  const zNeg = sp.zngry.filter(i => S.isAcc[i] !== 1);
  const structuralNeg = crossNeg.concat(zNeg);

  say(`קורפוס · ${S.N} שורות · אימון ${sp.train.length} · holdout ${sp.holdout.length} · חוצות ${crossNeg.length} · zngry ${zNeg.length}`);
  say(`⛔ שליליות מבניות · ${structuralNeg.length} · אפס תקציב מורה`);

  let picked, how;
  if (!st.rounds.length) {
    /* סבב 0 · התור המדורג */
    const q = queueOrder(S, sp.train);
    say(`התור · ${q.queueRows} שורות en/word/train · ${q.joined} נוחתות על שורת תלמיד (${(100 * q.joined / q.queueRows).toFixed(1)}%) · ${q.order.length} שורות תלמיד נבדלות`);
    picked = q.order.filter(i => !already.has(i)).slice(0, K);
    how = 'תור מדורג · rank order · purpose=train';
  } else {
    /* סבבים 1+ · `acquire` מול המודל הנוכחי · כאן כל הערך */
    const rule = has('--r0') ? RULES.R0 : RULES.R2;
    const hashOf = buildHashMap(S, st);
    const oracle = makeOracle(S, rule, null, hashOf);
    /* ⛔ **העיגון ולא `fitOn`, וזה לא פרט.** ‏`FIT.solveThresholds` מאפס כל רצועה
       בלי חיובית מתויגת (ראה §5ב), ולכן מודל שנבנה מ-250 תוויות הוא כמעט-ריק —
       ורכישה שרצה מולו מודדת מרחק מגבול שאינו קיים. העיגון נותן את המודל שהתלמיד
       באמת מחזיק עכשיו, וזה מה ש"היכן התלמיד חולק על המורה" אמור להימדד מולו. */
    const model = anchoredModel(S, shipped, st.labeled, oracle, structuralNeg);
    const M = FIT.modelCoef(model);
    const rest = sp.train.filter(i => !already.has(i));
    picked = LOOP.acquire(S, rest, M, K);
    how = 'acquire · מרחק מהגבול מול המודל הנוכחי';
    say(`המודל הנוכחי · אומן על ${model.trainedOn.pos} חיוביות · ${model.trainedOn.negLabeled} שליליות מתויגות · ${model.trainedOn.unsure} unsure הושמטו`);
  }

  if (!picked.length) { say('⚠ אין מה לרכוש · הבריכה מוצתה'); return; }

  /* כתיבת הסט · אדיטיבי בלבד. `emit` ידלג על מה שכבר בפנקס. */
  const rows = picked.map(i => {
    const r = S.recs[i], it = itemFor(S, i);
    return { _i: i, id: `D${i}`, lang: 'en', direction: 'word', term: r.term, gloss: glossOf(r.term), written: r.key, typed: r.typed, h: it.h, k: it.k };
  });
  fs.appendFileSync(setFile(), rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  st.rounds.push({ round: st.rounds.length, how, asked: rows.length, at: new Date().toISOString() });
  st.labeled = st.labeled.concat(picked);
  writeState(st);

  say(`\nסבב ${st.rounds.length - 1} · ${rows.length} פריטים · ${how}`);
  say(`סה"כ בתקציב · ${st.labeled.length} פסקים`);
  say('');
  T.emit(SET, num('--batch', 125));
}

function fitOpts(shipped) {
  return { cuts: [2], seedW: shipped.regimes.map(g => g.W) };
}

/* מפת שורה→hash · נבנית מקובץ הסט כדי שלא נחשב SHA לכל שורה בכל קריאה */
function buildHashMap(S, st) {
  const m = new Map();
  for (const r of readSetRows()) m.set(r._i, r.h);
  return i => {
    let h = m.get(i);
    if (h == null) { h = itemFor(S, i).h; m.set(i, h); }
    return h;
  };
}

/* ===================== 5ב · ⭐ העיגון · והבאג שהוא עוקף =====================
 *
 * ⛔⛔ **‏`FIT.solveThresholds` הורג כל רצועה שאין בה חיובית מתויגת.** שלוש שורות:
 *
 *     if (posMax[c] === -Infinity) t[c] = 0;            // אף חיובית · הרצועה מתה
 *     else t[c] = Math.min(t[c], snapBelow(posMax[c] + GRID));
 *
 * ⭐ **בהתאמה מלאה זה נכון**, וההערה שם מסבירה למה: ‏24,000 חיוביות מכסות כמעט כל
 * תא ‎(משטר, רצועה)‎, וסף שאף חיובית אינה צריכה הוא בדיוק "רצועה שיושבת בתקרה כי
 * הדאטה שותק שם" — הצורה שנפסלה בסבב ה-gloss.
 *
 * ⛔ **בלמידה פעילה זה קטלני, והוא נכשל בשקט.** ‏162 חיוביות מתפרסות על 42 תאים,
 * רוב התאים נשארים ריקים, וכל אחד מהם מקבל סף **0**. המודל לא "לא השתפר" — הוא
 * נמחק. ‏R0 הוא המקרה הקיצוני: ‏34 הקבלות שלו כולן שורות `gated` (הטיות), הלולאה
 * מדלגת עליהן, ולכן **כל** הספים אופסו ו-recall יצא **0.00%** בדיוק.
 *
 * ⭐ זה בדיוק הדפוס שהפרויקט הזה מוצא שוב ושוב: **שומר שנכון באוכלוסייה אחת
 * והרסני באחרת, ונופל בלי להרים דגל** — המספר פשוט נראה כמו "המורה לא עזר".
 *
 * ===== מה שהעיגון עושה במקומו =====
 *
 * הסמנטיקה הנכונה לזיקוק אינה "בנה מודל מאפס מ-162 תוויות" אלא **"קח את מה
 * שנשלח, ותן למורה לתקן אותו היכן שיש לו עדות"**:
 *
 *     t[תא] = min( גבול_הבטיחות[תא] , max( הסף_הנשלח[תא] , מה_שהמורה_דורש[תא] ) )
 *
 *   · **המורה שותק בתא** ⇒ הסף הנשלח נשאר. אין הידוק ואין הרפיה.
 *   · **המורה קיבל** שורה שנדחית היום ⇒ הסף עולה, עד גבול הבטיחות ולא מעבר.
 *   · **המורה דחה** שורה שמתקבלת היום ⇒ גבול הבטיחות יורד מתחת לנשלח ⇒ הידוק.
 *
 * ⭐ **והשן שמוכיחה שזה לא קסם:** באפס תוויות מורה, העיגון מחזיר את המודל הנשלח
 * **ביט-אחר-ביט על מפת ההחלטות המלאה** — כי המודל הנשלח כבר מקיים אפס קבלות-שווא
 * מול השליליות המבניות, ולכן גבול הבטיחות שלהן אינו נמוך מהסף הנשלח באף תא.
 * ⚠ זו אינה טענה · היא נבדקת ב-`--selftest` על הקורפוס האמיתי, וזורקת על הפרש אחד.
 */

const GRID = FIT.GRID;
const snapBelow = v => {
  if (!isFinite(v)) return Infinity;
  return Math.max(0, Math.round(Math.floor((v - 1e-9) / GRID) * GRID * 1e6) / 1e6);
};
const snapAtLeast = v => Math.max(0, Math.round(Math.ceil((v - 1e-9) / GRID) * GRID * 1e6) / 1e6);

function anchoredModel(S, shipped, labeled, verdictOf, structuralNeg) {
  const M = FIT.modelCoef(shipped);
  const cuts = shipped.cuts, NB = FIT.NBAND;
  const NR = cuts.length + 1, CELLS = NR * NB;
  const minLen = shipped.minLen || 0;
  const usable = i => !(S.gated[i] || FIT.hardGated(S, i, M.marginHard) || S.tLen[i] < minLen);

  const pos = [], neg = (structuralNeg || []).slice();
  let unsure = 0;
  for (const i of labeled) {
    const v = verdictOf(i);
    if (v === 'accept') pos.push(i);
    else if (v === 'reject') neg.push(i);
    else unsure++;
  }

  /* גבול הבטיחות · העלות הזולה ביותר של שלילית בכל תא */
  const negMin = new Float64Array(CELLS).fill(Infinity);
  for (const i of neg) {
    if (!usable(i)) continue;
    const R = FIT.regimeOf(S.gap[i], cuts), g = M.per[R], hi = S.off[i + 1];
    for (let p = S.off[i]; p < hi; p++) {
      const c = FIT.pairCost(S, p, g.wv, g.aFirst, g.aShare);
      const cell = R * NB + S.pBand[p];
      if (c < negMin[cell]) negMin[cell] = c;
    }
  }
  const bound = new Float64Array(CELLS);
  for (let c = 0; c < CELLS; c++) bound[c] = snapBelow(negMin[c]);

  /* מה שהמורה דורש · לכל קבלה, הזוג **הזול ביותר שגבול הבטיחות מרשה** */
  const need = new Float64Array(CELLS).fill(-Infinity);
  let opened = 0, unreachable = 0;
  for (const i of pos) {
    if (!usable(i)) continue;
    const R = FIT.regimeOf(S.gap[i], cuts), g = M.per[R], hi = S.off[i + 1];
    let bc = Infinity, bcell = -1;
    for (let p = S.off[i]; p < hi; p++) {
      const c = FIT.pairCost(S, p, g.wv, g.aFirst, g.aShare);
      const cell = R * NB + S.pBand[p];
      if (c <= bound[cell] && c < bc) { bc = c; bcell = cell; }
    }
    if (bcell < 0) { unreachable++; continue; }   /* ⚠ קבלת מורה שהבטיחות אוסרת · נספרת ומדווחת */
    const want = snapAtLeast(bc);
    if (want > need[bcell]) need[bcell] = want;
    if (want > M.t[bcell]) opened++;
  }

  const out = JSON.parse(JSON.stringify(shipped));
  let raised = 0, lowered = 0;
  for (let R = 0; R < NR; R++) {
    for (let b = 0; b < NB; b++) {
      const cell = R * NB + b, t0 = M.t[cell];
      const want = need[cell] === -Infinity ? t0 : Math.max(t0, need[cell]);
      const tf = Math.min(bound[cell], want);
      out.regimes[R].bands[b].t = isFinite(tf) ? tf : t0;
      if (out.regimes[R].bands[b].t > t0) raised++;
      if (out.regimes[R].bands[b].t < t0) lowered++;
    }
  }
  out.trainedOn = { pos: pos.length, negLabeled: neg.length - (structuralNeg || []).length,
    negStructural: (structuralNeg || []).length, unsure, raised, lowered, opened, unreachable };
  return out;
}

/* ===================== 6 · --report · עקומת הלמידה ===================== */

function report() {
  const S = loadS();
  const sp = FIT.splits(S);
  const st = readState();
  const shipped = FIT.fromAppParams(FIT.shippedParams('en-word'));
  const o = fitOpts(shipped);

  const crossNeg = sp.cross.filter(i => S.isAcc[i] !== 1);
  const zNeg = sp.zngry.filter(i => S.isAcc[i] !== 1);
  const structuralNeg = crossNeg.concat(zNeg);
  const hashOf = buildHashMap(S, st);

  const base = FIT.evalModel(S, sp.holdout, shipped);
  const bM = FIT.modelCoef(shipped);
  let bFA = 0;
  for (const i of sp.trainNeg.concat(sp.holdNeg, structuralNeg)) if (FIT.decideModel(S, i, bM)) bFA++;
  say(`# עקומת הלמידה · פסקי מורה **אמיתיים**`);
  say('');
  say(`בסיס · מה שנשלח היום · holdout **${pct(base.recall)}** · ‏FA על כל השליליות ${bFA}`);
  say('');

  /* התקרה · אותו מתאים על **כל** תוויות הדאטהסט · זו הנקודה שהעקומה שואפת אליה */
  const ceilM = FIT.fitStudent(S, sp.trainNeg.concat(structuralNeg), sp.trainPos, o);
  const ceil = FIT.evalModel(S, sp.holdout, ceilM);
  say(`תקרה · כל ${sp.train.length} תוויות הדאטהסט · holdout **${pct(ceil.recall)}**`);
  say('');

  const out = { set: 'en-word', baseline: base.recall, baselineFA: bFA, ceiling: ceil.recall, rows: [] };

  /* ⭐ שער העיגון · באפס תוויות הוא **חייב** להחזיר את הנשלח, על מפת ההחלטות המלאה. */
  const noop = anchoredModel(S, shipped, [], () => 'unsure', structuralNeg);
  const nM = FIT.modelCoef(noop);
  let diff = 0;
  for (const i of sp.all) if (FIT.decideModel(S, i, nM) !== FIT.decideModel(S, i, bM)) diff++;
  if (diff) throw new Error(`⛔ העיגון אינו no-op באפס תוויות · ${diff} החלטות נבדלות`);
  say(`✅ שער העיגון · אפס תוויות ⇒ ${S.N} החלטות זהות למודל הנשלח, ביט-אחר-ביט`);
  say('');

  const evalRow = (tag, rk, B, m, lab) => {
    const M = FIT.modelCoef(m);
    const h = FIT.evalModel(S, sp.holdout, m);
    const labSet = new Set(lab);
    let fa = 0;
    for (const i of sp.trainNeg) if (!labSet.has(i) && FIT.decideModel(S, i, M)) fa++;
    for (const i of sp.holdNeg.concat(structuralNeg)) if (FIT.decideModel(S, i, M)) fa++;
    const res = FIT.residue(S, sp.train.concat(sp.holdout, sp.cross), m, shipped);
    const d = h.recall - base.recall;
    out.rows.push({ mode: tag, rule: rk, budget: B, ...m.trainedOn, holdoutRecall: h.recall, faUnseen: fa, residue: res });
    say(`| ${tag} | ${rk} | ${B} | ${m.trainedOn.pos} | ${m.trainedOn.negLabeled} | ${pct(h.recall)} | ${fa === 0 ? '**0** ✅' : '**' + fa + '** ⛔'} | ${d >= 0 ? '+' : ''}${(100 * d).toFixed(2)} | ${res.accepted} · ${res.realWord} · ${res.notAWord} |`);
  };

  say('| שיטה | חוק | פסקים | קבלות | דחיות | holdout | ⛔ FA לא-נראה | מול 74.63% | שארית · מילים · לא-מילה |');
  say('|---|---|---:|---:|---:|---:|---:|---|---|');
  for (const rk of ['R0', 'R2', 'R3']) {
    const oracle = makeOracle(S, RULES[rk], null, hashOf);
    for (const B of budgets(st)) {
      const lab = st.labeled.slice(0, B);
      evalRow('עיגון', rk, B, anchoredModel(S, shipped, lab, oracle, structuralNeg), lab);
      evalRow('חיפוש', rk, B, LOOP.fitOn(S, lab, o, structuralNeg, oracle), lab);
    }
  }
  fs.writeFileSync(path.join(OUT, 'distill-curve.json'), JSON.stringify(out, null, 1));
  say('');
  say('נכתב · out/distill-curve.json');
  return out;
}

function budgets(st) {
  const N = st.labeled.length;
  return [250, 500, 750, 1000, 1500, 2000].filter(b => b <= N).concat(N && ![250, 500, 750, 1000, 1500, 2000].includes(N) ? [N] : []);
}

/* ===================== 7 · שיניים ===================== */

function selftest() {
  let bad = 0;
  const ok = (c, m) => { say((c ? '  ✅ ' : '  ⛔ ') + m); if (!c) bad++; };

  say('## א · פריט המורה · מה נשלח ומה **לא**');
  const fake = { recs: [{ term: 'abacus', key: 'abacus', typed: 'abavus', label: 'accept', why: 'novel' }] };
  const it = T.itemOf({ lang: 'en', direction: 'word', term: 'abacus', gloss: 'חשבונייה', written: 'abacus', typed: 'abavus' });
  const tsv = [it.k, it.direction, it.term, it.gloss, it.written, it.typed].join('\t');
  ok(!/accept|reject|novel|margin|today/.test(tsv), 'הפריט אינו נושא פסק אלגוריתם · אין label/why/margin');
  ok(it.h === T.itemOf({ lang: 'en', direction: 'word', term: 'abacus', gloss: 'חשבונייה', written: 'abacus', typed: 'abavus' }).h, 'המפתח דטרמיניסטי');
  void fake;

  say('## ב · ‏unsure אינו שלילי · והשן היא שהוא **משנה** את המודל');
  const Sx = { N: 4, isAcc: [1, 0, 0, 1] };
  const seen = [];
  const stub = { fitStudent: (S, neg, pos) => { seen.push({ neg: neg.slice(), pos: pos.slice() }); return {}; } };
  const orig = FIT.fitStudent;
  FIT.fitStudent = stub.fitStudent;
  try {
    LOOP.fitOn(Sx, [0, 1, 2, 3], {}, [9], i => (i === 0 ? 'accept' : i === 1 ? 'reject' : 'unsure'));
  } finally { FIT.fitStudent = orig; }
  const g = seen[0];
  ok(g.pos.length === 1 && g.pos[0] === 0, 'קבלה אחת נכנסה כחיובית');
  ok(g.neg.length === 2 && g.neg.includes(9) && g.neg.includes(1), 'שלילית מבנית + דחיית מורה · ו-unsure **אינו** שם');
  ok(!g.neg.includes(2) && !g.neg.includes(3), '⛔ שתי שורות unsure לא נכנסו כשליליות');

  say('## ג · ‏makeTeacher · ברירת המחדל לא זזה, והאורקל כן');
  const S2 = { N: 3, isAcc: [1, 0, 1] };
  const t0 = LOOP.makeTeacher(S2);
  ok(t0.ask(0) === 'accept' && t0.ask(1) === 'reject', 'בלי oracle · תוויות הדאטהסט, כמו שהיה');
  ok(t0.count === 2, 'המונה סופר פריטים נבדלים');
  ok(t0.ask(0) === 'accept' && t0.count === 2, 'שאלה חוזרת אינה משלמת שוב');
  const orc = i => (i === 0 ? 'reject' : 'unsure'); orc.source = 'בדיקה';
  const t1 = LOOP.makeTeacher(S2, orc);
  ok(t1.ask(0) === 'reject', '⭐ עם oracle · הפסק מגיע מהמורה ולא מהדאטהסט');
  ok(t1.ask(2) === 'unsure', 'ו-unsure עובר כמו שהוא');
  let threw = false;
  try { LOOP.makeTeacher(S2, () => 'maybe').ask(0); } catch (e) { threw = true; }
  ok(threw, '⛔ פסק לא חוקי זורק · לא נבלע');

  say('## ד · ⛔ ‏holdout ו-zngry לעולם אינם בבריכה');
  const S3 = { N: 6, isAcc: [1, 0, 1, 0, 1, 0], hold: [0, 0, 1, 1, 0, 0], cross: [0, 0, 0, 0, 1, 0], zngry: [0, 0, 0, 0, 0, 1] };
  const sp3 = FIT.splits(S3);
  ok(!sp3.train.includes(2) && !sp3.train.includes(3), 'שורות holdout אינן ב-train');
  ok(!sp3.train.includes(5) && sp3.zngry.includes(5), 'שורת zngry אינה ב-train');
  ok(!sp3.train.includes(4) && sp3.cross.includes(4), 'שורה חוצת-כרטיסים אינה ב-train');

  say('## ה · חוקי ההכרעה · ‏R0 מול R2 על פריט אמיתי מהפנקס');
  const led40 = T.loadLedger('en40');
  const e01 = T.loadSet('en40').find(x => x.typed === 'abavus');
  const v = led40.get(e01.h);
  ok(decideBy(RULES.R0, e01, v) === 'reject', 'R0 · `abacus`→`abavus` ⇒ reject (זה החור)');
  ok(decideBy(RULES.R2, e01, v) === 'accept', '⭐ R2 · אותה שורה ⇒ accept');
  ok(v.T2 === 'כ' && v.T3 === 'כ' && v.T5 === 'ל', 'והסיבה בפנקס · T2=כ T3=כ **T5=ל**');

  say('');
  if (bad) { say(`⛔ ${bad} שיניים לא נשכו`); process.exitCode = 1; }
  else say('✅ כל השיניים נשכו');
}

/* ===================== 8 · CLI ===================== */

if (require.main === module) {
  try {
    if (has('--plan')) plan();
    else if (has('--ingest')) T.ingest(SET, { dry: has('--dry') });
    else if (has('--report')) report();
    else if (has('--selftest')) { say('# שיניים · distill.js'); say(''); selftest(); }
    else say('שימוש: --plan [--k N] [--batch N] | --ingest | --report | --selftest');
  } catch (e) { say('⛔ ' + e.message); say(e.stack); process.exitCode = 1; }
}

module.exports = { loadS, itemFor, makeOracle, queueOrder, plan, report, anchoredModel, SET };
