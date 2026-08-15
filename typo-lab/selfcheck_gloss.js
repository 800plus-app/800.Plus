'use strict';
/* השער של חוקי צד-הפירוש · שיניים מוכחות, לא "עבר".
 *
 * הכלל של הפרויקט (CLAUDE.md): שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות. זה כבר
 * קרה כאן שלוש פעמים · שער שבדק את הדבר הלא נכון, תנאי שקרס לשקר תמיד, ושער שירה
 * 184 דגלים שרובם שקריים. לכן הקובץ הזה שותל מקרים ומוכיח שהמדידה מגיבה להם:
 *
 *   א. חוק **מתירני בכוונה** (ראש מקטע · N=1, X=0%) · ספירת ההתנגשויות חייבת לחזור
 *      גדולה מאפס, ובתוך יחידת תרגול, ועם דוגמה בשמה.
 *   ב. חוק **ריק** (מקבל כלום) · התועלת חייבת לחזור 0 והקבלות החדשות 0.
 *   ג. חוק **נקי שמקבל משהו** (B1 עם חלופה בת 3 מילים) · קבלות חדשות גדול מאפס
 *      **וגם** אפס התנגשויות. בלי הבדיקה הזאת, שער שמכריז "התנגשות" על הכול היה
 *      עובר את א' ואת ב' והיה חסר ערך · זהו בדיוק דפוס 184 הדגלים השקריים.
 *   ד. **כיבוי לכל חוק בנפרד** · מקרה שרק ראש-מקטע פותר נדחה כשרק B1 דלוק.
 *   ה. **סדר השכבות** · שער הווטו חוסם את התוספת ולא את meaningMatch.
 *
 * המדידה שנבדקת כאן היא בדיוק זו שמייצרת את הדוח · measure_gloss.js מיובא ולא משוכפל.
 * שער שבודק העתק של הקוד אינו בודק את הקוד.
 */

const M = require('./measure_gloss.js');
const G = require('./lib/glossrules.js');
const { buildVeto } = require('./lib/veto.js');

const log = s => process.stdout.write(s + '\n');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* חוק ריק · נרשם רק כאן, ורק כדי להוכיח שאפס תועלת באמת מדווח כאפס. אם המדידה
   "מוצאת" תועלת לחוק שאינו מקבל דבר, כל מספר תועלת אחר בדוח חסר ערך. */
const noop = {
  id: 'Z0', name: 'noopPlant', cls: 'B', kind: 'gen',
  he: 'חוק שתול שאינו מקבל דבר',
  defaults: {},
  expand() { return new Set(); },
  accepts() { return false; },
};
G.BY_NAME.set(noop.name, noop);

const PLANT_LOOSE = { key: 'PLANT-loose', rule: 'headOfSegment', params: { minWords: 1, minFrac: 0, headMode: 'any' }, label: 'שתול · ראש מקטע N=1 X=0%' };
const PLANT_NOOP = { key: 'PLANT-noop', rule: 'noopPlant', params: {}, label: 'שתול · חוק ריק' };
const CLEAN = { key: 'CLEAN-B1', rule: 'splitOr', params: { mode: 'distributive', minAlt: 3 }, label: 'ביקורת · פיצול "או", חלופה בת 3 מילים' };

const t0 = Date.now();
log('שער חוקי צד-הפירוש · typo-lab/selfcheck_gloss.js');
log('');

const he = M.loadLang('he');
const resolved = M.resolveCases(he);
ok('כל 24 המקרים אותרו במאגר', resolved.length === 24, `· ${resolved.length}/24`);
ok('שיקוף meaningMatch נבדק ונמצא שקול', he.fastMismatch === 0, `· 0 אי-התאמות מתוך 200,000 זוגות`);

/* ===== א · החוק המתירני השתול ===== */
log('');
log('א · חוק מתירני שתול · המדידה חייבת לתפוס אותו');
const loose = M.measureRisk(he, PLANT_LOOSE);
const looseEx = loose.exSame[0] || loose.exFree[0] || '(אין)';
ok('ההתנגשויות בתוך יחידת תרגול גדולות מאפס', loose.sameUnit > 0,
  `· ${loose.sameUnit} התנגשויות · לדוגמה ${looseEx}`);
ok('גם אחרי שער הווטו נשארות התנגשויות', loose.freeCollisions > 0,
  `· ${loose.freeCollisions} מתוך ${loose.freeChecked} מחרוזות שאינן מקטע באף ערך`);
ok('ההתנגשות מגיעה עם שם ולא רק עם מספר', loose.exSame.length > 0, `· ${loose.exSame.length} דוגמאות נשמרו`);

/* ===== ב · החוק הריק השתול ===== */
log('');
log('ב · חוק ריק שתול · המדידה חייבת לדווח אפס תועלת ואפס סיכון');
const noopBen = M.measureBenefit(he, PLANT_NOOP, resolved);
const noopRisk = M.measureRisk(he, PLANT_NOOP);
ok('אפס מקרים נפתרים', noopBen.solved.length === 0, `· ${noopBen.solved.length} מתוך 24`);
ok('אפס קבלות חדשות', noopRisk.newAccepts === 0 && noopRisk.freeChecked === 0,
  `· ${noopRisk.newAccepts} ביקום, ${noopRisk.freeChecked} מחוצה לו`);
ok('אפס התנגשויות', noopRisk.sameUnit + noopRisk.otherUnit + noopRisk.freeCollisions === 0);

/* ===== ג · חוק נקי שמקבל משהו ===== */
log('');
log('ג · חוק נקי שמקבל משהו · המדידה חייבת להבחין, לא להדליק על הכול');
const clean = M.measureRisk(he, CLEAN);
const cleanBen = M.measureBenefit(he, CLEAN, resolved);
ok('החוק אכן מוסיף קבלות', clean.newAccepts + clean.freeChecked > 0,
  `· ${clean.newAccepts} ביקום, ${clean.freeChecked} מחוצה לו`);
ok('ובכל זאת אפס התנגשויות', clean.sameUnit + clean.otherUnit + clean.freeCollisions === 0,
  `· ${clean.sameUnit}/${clean.otherUnit}/${clean.freeCollisions}`);
/* ⚠ הבדיקה הזאת דרשה `cleanBen.solved.length > 0`, והיא נכתבה כש-B1 **טרם נשלח**.
   מאז הוא חי ב-app.js, ו-`measureBenefit` סופר תועלת **תוספתית** בלבד: שורה 374
   שם מדלגת על כל מקרה ש-`meaningMatch` כבר מקבל היום. לכן חוק-B1 שתול מוסיף
   בהכרח 0 · האפס הוא המדידה הנכונה, והדרישה היא שהתיישנה.
   מה שהתוצאה כן צריכה להוכיח, וזה מה שנבדק כאן: שהאפס נובע מכך שהמקרים **כבר
   פתורים**, ולא מכך שהמדידה עיוורת. מטרייה עיוורת לא הייתה מראה אף אחד משני
   הצדדים. ‏24 המקרים שנפתרים היום: 1, 3 (נרדפות) · 7, 15 (‏B1) · 13, 20 (צד
   הפירוש). המספר מקובע · ירידה בו היא רגרסיה אמיתית. */
const today24 = M.alreadyToday(he, resolved);
ok('שישה מקרים אמיתיים כבר נפתרים היום', today24.join(',') === '1,3,7,13,15,20', `· ${today24.join(', ')}`);
ok('ולכן חוק B1 שתול אינו מוסיף תועלת תוספתית', cleanBen.solved.length === 0 && today24.includes(7) && today24.includes(15),
  `· תוספתי ${cleanBen.solved.length} · 7 ו-15 כבר בפנים`);

/* ===== ד · כיבוי לכל חוק בנפרד ===== */
log('');
log('ד · כל חוק ניתן לכיבוי בנפרד');
const nicham = resolved.find(r => r.c.n === 16);
const typed16 = he.ctx.norm(nicham.c.typed);
const onlyB1 = G.makeGlossChecker(he.ctx, { splitOr: { on: true, params: { mode: 'distributive', minAlt: 3 } } });
const onlyB2 = G.makeGlossChecker(he.ctx, { headOfSegment: { on: true, params: { minWords: 1, minFrac: 0 } } });
ok('"התחרט" נדחה כשרק B1 דלוק', onlyB1(typed16, nicham.card.w).ok === false, `· ${nicham.c.term}`);
ok('"התחרט" מתקבל כשרק B2 דלוק', onlyB2(typed16, nicham.card.w).by === 'headOfSegment', `· ${nicham.c.term}`);

/* ===== ה · סדר השכבות מול שער הווטו ===== */
log('');
log('ה · שער הווטו חוסם את התוספת ולא את ההתאמה של היום');
const veto = buildVeto(he.ctx, 'he');
const gatedB2 = G.makeGlossChecker(he.ctx, { headOfSegment: { on: true, params: { minWords: 1, minFrac: 0 }, veto } });
const v16 = gatedB2(typed16, nicham.card.w);
ok('"התחרט" נחסם על ידי הווטו', v16.ok === false && v16.veto === true,
  '· בבעלות נְקָפוֹ לִבּוֹ, הִכָּה עַל חֵטְא, נִמְלַךְ בְּדַעְתּוֹ');
let ownBad = 0, ownSeen = 0;
for (const card of he.cards) for (const s of card.segs) { ownSeen++; const v = gatedB2(s, card.w); if (!v.ok || v.by !== 'today') ownBad++; }
ok('כל מקטע במאגר עדיין מתקבל כשהווטו דלוק', ownBad === 0, `· ${ownSeen - ownBad}/${ownSeen} מקטעים`);

/* ===== פסק דין ===== */
const failed = results.filter(r => !r.pass);
log('');
const teeth = loose.sameUnit > 0 && loose.freeCollisions > 0 &&
  noopBen.solved.length === 0 && noopRisk.newAccepts === 0 && noopRisk.freeChecked === 0 &&
  clean.newAccepts + clean.freeChecked > 0 && clean.sameUnit + clean.otherUnit + clean.freeCollisions === 0;
if (teeth) log('לשער יש שיניים');
else log('⚠ לשער אין שיניים · מקרה שתול לא התנהג כצפוי');
log('');
log(`${results.length - failed.length}/${results.length} בדיקות עברו · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
log(failed.length || !teeth ? 'פסק דין: אדום' : 'פסק דין: ירוק');
process.exit(failed.length || !teeth ? 1 : 0);
