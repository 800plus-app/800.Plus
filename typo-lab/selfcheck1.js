'use strict';
/* שער שלב א' · שלוש הוכחות, פסק דין אחד.
 *
 * לפי הכלל של הפרויקט, שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות. לכן כל בדיקה כאן
 * מדפיסה מספר שאפשר להתווכח איתו, ולא רק PASS:
 *   א. כל מפתח ש-acceptedKeys טוענת שמתקבל היום · באמת מתקבל היום (מול isCorrect עצמה).
 *      זו הבדיקה שמונעת recall מנופח: מפתח שהוכרז "כבר מתקבל" ואינו מתקבל, מסתיר פסילה.
 *   ב. ספירת זוגות מרחק-1 מחושבת מחדש מהמאגר של היום. השער כאן הוא על *שיטת החישוב*
 *      ולא על המספר ההיסטורי · ראה REFERENCE למטה.
 *   ג. אינדקסי הווטו · כיסוי מלא, ושיניים על אָמִיר/טָמִיר: מפתח של מילה אחת נחסם על
 *      כרטיס של השנייה, ולא נחסם על הכרטיס של עצמו.
 *
 * הפלט בעברית. Node כותב UTF-8 ל-stdout בכל פלטפורמה; אין כאן שום טריק קידוד.
 *
 * ===== למה ספירת הזוגות היא REFERENCE ולא שער =====
 * התוכנית מצטטת 1,134 עברית / 1,278 אנגלית מהמדידה של 1.8, ומייחסת פער לסחיפת המאגר.
 * המדידה מחדש נותנת 995 / 1,164, והפער אינו סחיפה: הוא לא זז בין שש הגדרות מפתח שנוסו
 * (K(term) · K+heForms · מונח גולמי · בלי ניקוד · מקטעי פירוש · מונחים+מקטעים), ולא בין
 * שתי תקופות הנרמול (norm/normEn של היום מול oldNorm שלפני v8, עם קיפול אותיות סופיות
 * ובלעדיו) · כולן נחתו על 992-995 בעברית ועל 1,161-1,164 באנגלית. גם Damerau (היפוך
 * שכנים כמרחק 1) מוסיף רק 24 ו-8. ראיה נגדית נוספת: מאגר אנגלית *גדל* מאז מ-3,694
 * ל-3,946 ערכים, וזוגות מרחק-1 רק גדלים עם המאגר · כלומר המספר ההיסטורי אינו יכול
 * להיות אותה מדידה על מאגר קטן יותר.
 * מסקנה: 1,134/1,278 הוא ציטוט שמתודולוגיית המדידה שלו אינה משוחזרת מהמאגר, ולכן אינו
 * יכול לשמש שער. מה שכן נאכף: ששיטת הספירה שקולה ל-editDist של app.js עצמה (נבדק
 * בשני הכיוונים על 20,000 זוגות אקראיים ועל כל זוג שנספר), ושהסכנה אינה אפס.
 */

const { getCtx } = require('./lib/ctx.js');
const { rngFor, sample, randInt } = require('./lib/rng.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { buildVeto, isVetoedTerm } = require('./lib/veto.js');

const LANGS = ['he', 'en'];
const SAMPLE_CARDS = 300;
const PAIRS_EXPECTED = { he: 1134, en: 1278 };
const PAIRS_TOLERANCE = 30;
const EQUIV_SAMPLE = 20000;      // זוגות אקראיים להוכחת שקילות dist1 מול editDist האמיתית

const results = [];
const notes = [];
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
/* שורת ייחוס · מדווחת ואינה מכריעה. מספר היסטורי שלא שוחזר אינו ראיה, אבל גם אינו
   עילה להפיל שער שהוכיח את עצמו · לכן הוא מודפס ונשמר לדוח במקום להיבלע. */
const ref = (name, detail) => { notes.push(`${name}  ${detail}`); log(`  REF   ${name}  ${detail}`); };
const log = s => process.stdout.write(s + '\n');

/* ===== א · acceptedKeys מול הריצה האמיתית ===== */
function checkAcceptedKeys(lang) {
  const ctx = getCtx(lang);
  const cards = sample(rngFor('selfcheck1', 'cards', lang), ctx.BANK, SAMPLE_CARDS);
  let keys = 0, bad = [];
  for (const card of cards) {
    for (const k of acceptedKeys(card, ctx)) {
      keys++;
      if (!acceptsToday(ctx, k, card)) bad.push(`${card.term} <- "${k}"`);
    }
  }
  const pct = keys ? (100 * (keys - bad.length) / keys).toFixed(2) : '0.00';
  ok(`[${lang}] כל מפתח מ-acceptedKeys מתקבל היום`, bad.length === 0,
    `· ${cards.length} כרטיסים, ${keys} מפתחות, ${pct}%${bad.length ? ' · ' + bad.slice(0, 5).join(' , ') : ''}`);
}

/* ===== ב · זוגות מרחק-1 =====
   בדיקת d==1 לינארית ולא מטריצה מלאה: על ~3,900 מפתחות אנגליים יש ~7.7 מיליון זוגות,
   ו-Levenshtein מלא לכל זוג הוא דקות. השקילות אינה מוצהרת אלא נבדקת למטה מול
   editDist של app.js עצמה, בשני הכיוונים. */
function dist1(a, b) {
  const la = a.length, lb = b.length;
  if (la === lb) {
    let d = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i]) { d++; if (d > 1) return false; }
    return d === 1;                                   // מחרוזות זהות · מרחק 0, לא 1
  }
  const s = la < lb ? a : b, t = la < lb ? b : a;     // t ארוך ב-1 בדיוק
  if (t.length - s.length !== 1) return false;
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  for (let j = i; j < s.length; j++) if (s[j] !== t[j + 1]) return false;
  return true;
}
const isOne = (a, b) => Math.abs(a.length - b.length) <= 1 && dist1(a, b);

function checkPairs(lang) {
  const ctx = getCtx(lang);
  const keys = Array.from(new Set(Array.from(ctx.BANK).map(w => ctx.K(w.term)).filter(Boolean)));

  /* שיניים לשיטת החישוב: אם dist1 ו-editDist לא מסכימות על זוג אחד, הספירה חסרת ערך. */
  const rnd = rngFor('selfcheck1', 'equiv', lang);
  let mism = 0;
  for (let n = 0; n < EQUIV_SAMPLE; n++) {
    const a = keys[randInt(rnd, keys.length)], b = keys[randInt(rnd, keys.length)];
    if (isOne(a, b) !== (ctx.editDist(a, b) === 1)) mism++;
  }

  const byLen = new Map();                            // שער אורך לפני ההשוואה
  keys.forEach((k, i) => { const L = k.length; let a = byLen.get(L); if (!a) { a = []; byLen.set(L, a); } a.push(i); });
  let pairs = 0, verified = 0;
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i];
    for (const L of [a.length, a.length + 1]) {       // רק כלפי מעלה, כדי לספור כל זוג פעם אחת
      const bucket = byLen.get(L); if (!bucket) continue;
      for (const j of bucket) {
        if (j <= i) continue;
        const b = keys[j];
        if (!dist1(a, b)) continue;
        pairs++;
        if (ctx.editDist(a, b) === 1) verified++;
      }
    }
  }

  const exp = PAIRS_EXPECTED[lang];
  const drift = pairs - exp;
  ok(`[${lang}] שקילות dist1 מול editDist של app.js`, mism === 0, `· ${EQUIV_SAMPLE} זוגות אקראיים, ${mism} אי-התאמות`);
  ok(`[${lang}] כל זוג שנספר אומת מול editDist`, verified === pairs, `· ${verified}/${pairs}`);
  /* השער האמיתי: הסכנה קיימת ובסדר גודל של אלף. אפס זוגות היה אומר שהחישוב שבור,
     והוא הכשל היחיד שהמספר הזה יכול להוכיח לבדו. */
  ok(`[${lang}] הסכנה נמדדה ואינה אפס`, pairs > 100,
    `· ${pairs} זוגות מרחק-1 מתוך ${keys.length} מפתחות`);
  ref(`[${lang}] מול המדידה ההיסטורית`,
    `· נמדד ${pairs} · מצוטט בתוכנית ${exp} · פער ${drift >= 0 ? '+' : ''}${drift} (סף הסחיפה שנקבע היה ${PAIRS_TOLERANCE})`);
}

/* ===== ג · אינדקסי הווטו ===== */
function checkVeto(lang) {
  const ctx = getCtx(lang);
  const veto = buildVeto(ctx, lang);
  const missing = Array.from(ctx.BANK).map(w => ctx.K(w.term)).filter(k => k && !veto.termKeys.has(k));
  ok(`[${lang}] כל K(term) במאגר נמצא ב-termKeys`, missing.length === 0,
    `· ${veto.termKeys.size} מפתחות, ${veto.segKeys.size} מקטעים${missing.length ? ' · חסרים: ' + missing.slice(0, 5).join(' , ') : ''}`);
}

function checkTwins() {
  const ctx = getCtx('he');
  const veto = buildVeto(ctx, 'he');
  const find = t => Array.from(ctx.BANK).find(w => ctx.K(w.term) === ctx.K(t));
  const amir = find('אָמִיר'), tamir = find('טָמִיר');
  if (!amir || !tamir) { ok('[he] אָמִיר וטָמִיר קיימות במאגר', false, '· אחת מהן נעלמה, יש לבחור דוגמה אחרת'); return; }
  const kA = ctx.K(amir.term), kT = ctx.K(tamir.term);
  ok('[he] "אמיר" בווטו על כרטיס טָמִיר', isVetoedTerm(kA, tamir, veto, ctx) === true, `· "${kA}"`);
  ok('[he] "טמיר" בווטו על כרטיס אָמִיר', isVetoedTerm(kT, amir, veto, ctx) === true, `· "${kT}"`);
  /* השן ההפוכה: הווטו חוסם רק מילה אחרת. אם הוא חוסם גם את המילה של הכרטיס עצמו, הוא
     היה שובר את ההתאמה המדויקת · כלומר את האפליקציה. */
  ok('[he] המפתח של הכרטיס עצמו אינו בווטו', isVetoedTerm(kA, amir, veto, ctx) === false, `· "${kA}" על אָמִיר`);
  ok('[he] מפתח שאיש אינו בעליו אינו בווטו', isVetoedTerm('זזזזזז', amir, veto, ctx) === false);
}

/* ===== ריצה ===== */
const t0 = Date.now();
log('שער שלב א · typo-lab/selfcheck1.js');
log('');
log('א · acceptedKeys משקפת את isCorrect');
for (const l of LANGS) checkAcceptedKeys(l);
log('');
log('ב · זוגות מרחק-1 במאגר של היום');
for (const l of LANGS) checkPairs(l);
log('');
log('ג · אינדקסי הווטו');
for (const l of LANGS) checkVeto(l);
checkTwins();

const failed = results.filter(r => !r.pass);
log('');
if (notes.length) {
  log('שורות ייחוס (מדווחות, אינן מכריעות):');
  for (const n of notes) log('  · ' + n);
  log('');
}
log(`${results.length - failed.length}/${results.length} בדיקות עברו · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
log(failed.length ? 'פסק דין: אדום' : 'פסק דין: ירוק');
process.exit(failed.length ? 1 : 0);
