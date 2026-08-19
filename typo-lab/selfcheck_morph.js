'use strict';
/* השער של מחלקת המורפולוגיה · שיניים מוכחות, לא "עבר".
 *
 * הכלל של הפרויקט (CLAUDE.md): שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות. לכן
 * הקובץ הזה שותל מקרים ומוכיח שהמדידה מגיבה להם:
 *
 *   א. וריאנט **מתירני בכוונה** (שלד ≥2, כל התחיליות מקולפות) · ספירת ההתנגשויות
 *      חייבת לחזור גדולה מאוד, בתוך יחידת תרגול, ועם דוגמה בשמה.
 *   ב. וריאנט **ריק** · התועלת חייבת לחזור 0 והקבלות החדשות 0.
 *   ג. וריאנט **תמים שמקבל משהו** · קבלות חדשות גדול מאפס **וגם** אפס התנגשויות.
 *      בלי הבדיקה הזאת, שער שמכריז "התנגשות" על הכול היה עובר את א' ואת ב' והיה חסר
 *      ערך · זהו בדיוק דפוס 184 הדגלים השקריים שכבר קרה בפרויקט הזה.
 *   ד. **שיקוף meaningMatch/isCorrect** · 120,000 זוגות לכל שפה לכל כיוון, ועוד
 *      הוכחה שהבדיקה הזאת בכלל מסוגלת לצעוק: יקום מקולקל בכוונה חייב להיתפס.
 *   ה. **אותיות סופיות מקופלות** · הבאג האמיתי שנתפס בבנייה: norm מקפלת ם→מ ו-ן→נ,
 *      ורשימת סיומות שנכתבה בצורה הסופית פשוט לא מוצאת כלום · בשקט, בלי שגיאה.
 *   ו. **כיבוי לכל חוק בנפרד** · מקרה שרק M3 פותר נדחה כשרק M1 דלוק.
 *   ז. **סדר השכבות** · שער הווטו חוסם את התוספת ולא את meaningMatch.
 *
 * המדידה שנבדקת כאן היא בדיוק זו שמייצרת את הדוח · measure_morph.js מיובא ולא משוכפל.
 * שער שבודק העתק של הקוד אינו בודק את הקוד.
 */

const MM = require('./measure_morph.js');
const M = require('./lib/morphrules.js');
const { buildVeto } = require('./lib/veto.js');
const { rngFor, randInt } = require('./lib/rng.js');

const log = s => process.stdout.write(s + '\n');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const t0 = Date.now();
log('שער מחלקת המורפולוגיה · typo-lab/selfcheck_morph.js');
log('');

const he = MM.loadLang('he');
const resolved = MM.resolveCases(he);
ok('כל 24 המקרים אותרו במאגר', resolved.length === 24, `· ${resolved.length}/24`);

/* ===== החוקים השתולים · נרשמים רק כאן ===== */

/* ריק · מוכיח שאפס תועלת באמת מדווח כאפס. אם המדידה "מוצאת" תועלת לחוק שאינו מקבל
   דבר, כל מספר תועלת אחר בדוח חסר ערך. */
const noop = {
  id: 'Z0', name: 'noopPlant', cls: 'M', kind: 'gen', he: 'חוק שתול שאינו מקבל דבר',
  defaults: {},
  keysTyped() { return new Set(); },
  keysSeg() { return new Set(); },
  expand() { return new Set(); },
  accepts() { return false; },
};

/* תמים · מקבל רשימה קבועה של מילים אמיתיות מהמאגר שהוכח שאינן תשובה קבילה של אף
   כרטיס ואינן מונח. הן נבחרות מתוך VOCAB אחרי חיסור SINGLE ו-termKeys, כלומר לפי
   ה**מדידה** ולא לפי ניחוש · ולכן "אפס התנגשויות" כאן הוא התוצאה הנכונה, ושער
   שמחזיר עליהן התנגשות הוא שער שבור. */
const benignPool = (() => {
  const cand = [];
  for (const w of he.VOCAB) {
    if (he.SINGLE.has(w)) continue;
    if (he.veto.termKeys.has(w)) continue;
    if (w.length < 4) continue;
    cand.push(w);
  }
  cand.sort();
  const rnd = rngFor('selfcheck_morph', 'benign');
  const out = [];
  for (let i = 0; i < 5 && cand.length; i++) out.push(cand[randInt(rnd, cand.length)]);
  return Array.from(new Set(out));
})();
const benignSet = new Set(benignPool);
const benignKeys = new Set(benignPool.map(w => 'BENIGN:' + w));
const benign = {
  id: 'Z1', name: 'benignPlant', cls: 'M', kind: 'scan',
  he: 'חוק שתול שמקבל מילים אמיתיות שאינן תשובה של אף כרטיס',
  defaults: {},
  keysTyped(typed) { return benignSet.has(typed) ? new Set(['BENIGN:' + typed]) : new Set(); },
  keysSeg(segs) { return segs.length ? benignKeys : new Set(); },
  accepts(typed, segs) { return segs.length > 0 && benignSet.has(typed); },
};

for (const r of [noop, benign]) { M.RULES.push(r); M.BY_NAME.set(r.name, r); }

const PLANT_LOOSE = { key: 'PLANT-loose', rule: 'skeletonSingle', params: { minSkel: 2, peelSuffix: true, peelPrefix: true }, label: 'שתול · שלד ≥2, כל התחיליות מקולפות' };
const PLANT_NOOP = { key: 'PLANT-noop', rule: 'noopPlant', params: {}, label: 'שתול · חוק ריק' };
const PLANT_BENIGN = { key: 'PLANT-benign', rule: 'benignPlant', params: {}, label: 'שתול · חוק תמים שמקבל משהו' };

/* ===== א · הווריאנט המתירני השתול ===== */
log('');
log('א · וריאנט מתירני שתול (שלד ≥2, כל התחיליות) · המדידה חייבת לתפוס אותו');
const loose = MM.measureRisk(he, PLANT_LOOSE);
ok('ההתנגשויות בתוך יחידת תרגול גדולות מאוד', loose.sameUnit > 1000,
  `· ${loose.sameUnit} התנגשויות באותה יחידה מתוך ${loose.newAccepts} קבלות חדשות`);
ok('גם אחרי שער הווטו נשארות התנגשויות ביחידה', loose.gatedSame > 0,
  `· ${loose.gatedSame} שורדות את הווטו`);
ok('ההתנגשות מגיעה עם שם ולא רק עם מספר', loose.exSame.length > 0, `· לדוגמה ${loose.exSame[0] || '(אין)'}`);
const looseConf = MM.measureConflation(he, PLANT_LOOSE);
ok('קיפול אוצר המילים מדווח וגדול', looseConf.folded / looseConf.vocab > 0.5,
  `· ${looseConf.folded}/${looseConf.vocab} מילים · ${(100 * looseConf.folded / looseConf.vocab).toFixed(1)}%`);

/* ===== ב · הווריאנט הריק השתול ===== */
log('');
log('ב · חוק ריק שתול · המדידה חייבת לדווח אפס תועלת ואפס סיכון');
const noopBen = MM.measureBenefit(he, PLANT_NOOP, resolved);
const noopRisk = MM.measureRisk(he, PLANT_NOOP);
ok('אפס מקרים נפתרים', noopBen.solved.length === 0, `· ${noopBen.solved.length} מתוך 24`);
ok('אפס קבלות חדשות', noopRisk.newAccepts === 0, `· ${noopRisk.newAccepts}`);
ok('אפס התנגשויות', noopRisk.sameUnit + noopRisk.otherUnit + noopRisk.termSame + noopRisk.termOther === 0);
ok('ואפס רגרסיה', noopRisk.regress === 0);

/* ===== ג · חוק תמים שמקבל משהו ===== */
log('');
log('ג · חוק תמים שמקבל משהו · המדידה חייבת להבחין, לא להדליק על הכול');
const benRisk = MM.measureRisk(he, PLANT_BENIGN);
ok('נבחרו מילים תמימות מהמאגר', benignPool.length > 0, `· ${benignPool.join(', ')}`);
ok('החוק אכן מוסיף קבלות', benRisk.newAccepts > 0, `· ${benRisk.newAccepts} קבלות חדשות`);
ok('ובכל זאת אפס התנגשויות', benRisk.sameUnit + benRisk.otherUnit + benRisk.termSame + benRisk.termOther === 0,
  `· ${benRisk.sameUnit}/${benRisk.otherUnit}/${benRisk.termSame}/${benRisk.termOther} · ${benRisk.benign} תמימות`);

/* ===== ד · שיקוף meaningMatch ו-isCorrect ===== */
log('');
log('ד · השיקוף מול הפונקציות האמיתיות · ועם הוכחה שהבדיקה מסוגלת לצעוק');
const en = MM.loadLang('en');
for (const L of [he, en]) {
  const nm = L.lang === 'he' ? 'עברית' : 'אנגלית';
  ok(`${nm} · שיקוף meaningMatch שקול`, L.fastMismatch === 0,
    `· 0 אי-התאמות מתוך ${MM.FAST_SAMPLE.toLocaleString('en-US')} זוגות · יקום ${L.SINGLE.size} מחרוזות`);
  ok(`${nm} · שיקוף isCorrect שקול`, L.termMismatch === 0,
    `· 0 אי-התאמות מתוך ${MM.TERM_SAMPLE.toLocaleString('en-US')} זוגות`);
}
/* השן האמיתית: שיקוף שקול הוא חסר ערך אם הבדיקה לא הייתה תופסת שיקוף שבור. מקלקלים
   את היקום בשתי הדרכים שבהן אפשר באמת לטעות בו, ודורשים שאותה השוואה בדיוק תזעק:
 *   חסר · בלי ההרחבה של particleMatch (ענף 4) · זו הטעות הסבירה ביותר, והיא היחידה
 *          שאינה טריוויאלית לגזירה. יקום חסר היה **מסתיר** התנגשויות אמיתיות.
 *   עודף · עם מילה מתוך מקטע רב-מילי · יקום מנופח היה **ממציא** התנגשויות.
 * שתי הבדיקות רצות דרך sampleMismatch של measure_morph, לא דרך העתק שלו.
 */
const CUT = s => String(s).split(/\s+/).filter(x => x && !he.st.has(x));
const missCache = new Map(), extraCache = new Map();
function missingSingles(c) {
  let s = missCache.get(c); if (s) return s;
  s = new Set();
  if (String(c.meanNorm).split(/\s+/).length === 1) s.add(c.meanNorm);
  if (String(c.meanBare).split(/\s+/).length === 1) s.add(c.meanBare);
  for (const g of c.segs) if (String(g).split(/\s+/).length === 1) s.add(g);
  missCache.set(c, s); return s;                     // בלי ענף particleMatch
}
function extraSingles(c) {
  let s = extraCache.get(c); if (s) return s;
  s = new Set(c.singles);
  for (const g of c.segs) { const w = CUT(g); if (w.length > 1) s.add(w[0]); }
  extraCache.set(c, s); return s;                    // מילה שאינה תשובה שלמה
}
const N_PROBE = 40000;
const missBad = MM.sampleMismatch(he, missingSingles, N_PROBE, 'probe-miss').bad;
ok('יקום חסר (בלי ענף particleMatch) נתפס', missBad > 0, `· ${missBad} אי-התאמות מתוך ${N_PROBE.toLocaleString('en-US')}`);
const extraBad = MM.sampleMismatch(he, extraSingles, N_PROBE, 'probe-extra').bad;
ok('יקום מנופח (מילה מתוך מקטע רב-מילי) נתפס', extraBad > 0, `· ${extraBad} אי-התאמות מתוך ${N_PROBE.toLocaleString('en-US')}`);
const cleanBad = MM.sampleMismatch(he, c => c.singles, N_PROBE, 'probe-clean').bad;
ok('ואותה השוואה שותקת על היקום התקין', cleanBad === 0, `· ${cleanBad} אי-התאמות`);

/* ===== ה · אותיות סופיות מקופלות ===== */
log('');
log('ה · norm מקפלת אותיות סופיות · רשימות שנכתבו בצורה הסופית לא מוצאות כלום, בשקט');
const FINALS = 'ךםןףץ';
const badSuf = M.SUFFIXES.filter(s => s.split('').some(c => FINALS.includes(c)));
ok('אף סיומת אינה כתובה בצורה סופית', badSuf.length === 0, `· ${M.SUFFIXES.join(', ')}`);
const badTpl = M.BINYAN_PAIRS.filter(p => (p.a + p.b).split('').some(c => FINALS.includes(c)));
ok('אף תבנית משקל אינה כתובה בצורה סופית', badTpl.length === 0, `· ${M.BINYAN_PAIRS.length} זוגות`);
/* לא מספיק שהרשימה "נראית נכון" · צריך שהיא באמת תירה על המאגר האמיתי. */
let sufFired = 0;
const P_SUF = { minWordLen: 3, minSkel: 3, peelSuffix: true, peelPrefix: false };
const P_NONE = { minWordLen: 3, minSkel: 3, peelSuffix: false, peelPrefix: false };
for (const w of he.VOCAB) if (M.skelKeysOfWord(w, P_SUF).size > M.skelKeysOfWord(w, P_NONE).size) sufFired++;
ok('קילוף הסיומת אכן יורה על מילים אמיתיות במאגר', sufFired > 100, `· ${sufFired} מילים מתוך ${he.VOCAB.size}`);
ok('ובאמת פותר את המקרה שהוא נבנה בשבילו', MM.measureBenefit(he, { key: 'x', rule: 'skeletonSingle', params: { peelSuffix: true, minSkel: 3 } }, resolved).solved.includes(4),
  '· מקרה 4 · סוֹרֵר ← "מורד" מול "מרדן"');

/* ===== ו · כיבוי לכל חוק בנפרד ===== */
log('');
log('ו · כל חוק ניתן לכיבוי בנפרד');
const c4 = resolved.find(r => r.c.n === 4);
const typed4 = he.ctx.norm(c4.c.typed);
const onlyM3 = M.makeMorphChecker(he.ctx, { binyanPair: { on: true, params: { conservative: true, strictRoot: true } } });
const onlyM2 = M.makeMorphChecker(he.ctx, { skeletonInSeg: { on: true, params: { headMode: 'first' } } });
ok('"מורד" מתקבל כשרק M3 דלוק', onlyM3(typed4, c4.card.w).by === 'binyanPair', `· ${c4.c.term}`);
ok('"מורד" נדחה כשרק M2 דלוק', onlyM2(typed4, c4.card.w).ok === false, `· ${c4.c.term}`);

/* ===== ז · סדר השכבות מול שער הווטו ===== */
log('');
log('ז · שער הווטו חוסם את התוספת ולא את ההתאמה של היום');
const veto = buildVeto(he.ctx, 'he');
const gatedM1 = M.makeMorphChecker(he.ctx, { skeletonSingle: { on: true, params: { minSkel: 2, peelPrefix: true }, veto } });
let ownBad = 0, ownSeen = 0;
for (const card of he.cards) for (const s of card.segs) { ownSeen++; const v = gatedM1(s, card.w); if (!v.ok || v.by !== 'today') ownBad++; }
ok('כל מקטע במאגר עדיין מתקבל כשהווטו דלוק', ownBad === 0, `· ${ownSeen - ownBad}/${ownSeen} מקטעים`);
let vetoFired = 0;
for (const card of he.cards.slice(0, 400)) {
  for (const x of he.SINGLE.keys()) {
    if (card.singles.has(x)) continue;
    const v = gatedM1(x, card.w);
    if (v.veto) { vetoFired++; break; }
  }
}
ok('והווטו אכן יורה על התוספת', vetoFired > 0, `· ${vetoFired} כרטיסים מתוך 400 שבהם הווטו חסם קבלה חדשה`);

/* ===== פסק דין ===== */
const failed = results.filter(r => !r.pass);
log('');
const teethLoose = loose.sameUnit > 1000 && loose.gatedSame > 0 && loose.exSame.length > 0;
const teethNoop = noopBen.solved.length === 0 && noopRisk.newAccepts === 0 &&
  noopRisk.sameUnit + noopRisk.otherUnit + noopRisk.termSame + noopRisk.termOther === 0;
const teethBenign = benRisk.newAccepts > 0 && benRisk.sameUnit + benRisk.otherUnit + benRisk.termSame + benRisk.termOther === 0;
const teethMirror = he.fastMismatch === 0 && en.fastMismatch === 0 && he.termMismatch === 0 && en.termMismatch === 0 &&
  missBad > 0 && extraBad > 0 && cleanBad === 0;
const teeth = teethLoose && teethNoop && teethBenign && teethMirror;
if (teeth) log('לשער יש שיניים');
else log('⚠ לשער אין שיניים · מקרה שתול לא התנהג כצפוי');
log('');
log(`${results.length - failed.length}/${results.length} בדיקות עברו · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
log(failed.length || !teeth ? 'פסק דין: אדום' : 'פסק דין: ירוק');
process.exit(failed.length || !teeth ? 1 : 0);
