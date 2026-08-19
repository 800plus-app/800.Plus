'use strict';
/* שיניים לשער הנרדפות · שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות.
 *
 * זה קרה בפרויקט הזה שלוש פעמים (CLAUDE.md §בדיקות): שער שבדק את הדבר הלא נכון,
 * תנאי שקרס לשקר תמיד, ושער שירה דגלים שקריים. לכן הבדיקה כאן אינה "האם הלקסיקון
 * נקי" אלא "האם השער בכלל מסוגל לדחות":
 *
 *   1. קבוצה שתולה **רעה** · שתי מילים שהן בפועל הפירושים של שני ערכים שונים במאגר.
 *      החלפה ביניהן מוחקת את ההבדל בין שני הערכים, והשער חייב לדחות אותה **בשמם**.
 *   2. קבוצה שתולה **בטוחה** · חייבת לעבור, ו**חייבת לגעת במאגר**. קבוצה שעוברת רק
 *      מפני שאף מילה שלה אינה מופיעה באף פירוש היא בדיקה ריקה: היא הייתה עוברת גם
 *      אם השער היה `return true`. לכן נבדק במפורש שהקנוניזציה שינתה מקטע אמיתי.
 *
 * בנוסף · תקינות הלקסיקון עצמו, שהיא תנאי מקדים לכל מדידה: JSON חוקי, שתי מילים
 * לפחות בקבוצה, ומילה אחת בקבוצה אחת בלבד. כפילות מילה בין קבוצות היא באג שקט:
 * שתי קבוצות היו נמזגות בפועל לקבוצה אחת גדולה, השער היה בודק אותן בנפרד, ומה שנבדק
 * לא היה מה שרץ.
 */

const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const G = require('./gate_synonyms.js');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log(`  ✓ ${label}`); return true; }
  failures++;
  console.log(`  ✗ ${label}${detail ? '\n      ' + detail : ''}`);
  return false;
}

/* האם הקבוצה בכלל נוגעת במאגר · כמה מקטעים משנים צורה תחתיה. */
function touchCount(group) {
  let n = 0;
  for (const lang of ['he', 'en']) {
    const m = G.bankModel(lang);
    const map = G.canonMapOf([group], m.ctx.norm);
    if (!map) continue;
    for (const e of m.entries) for (const s of e.segs) if (G.canonText(s, map) !== s) n++;
  }
  return n;
}

console.log('# selfcheck_syn · שיניים לשער הנרדפות');
console.log('');

/* ===== 1 · הקבוצה השתולה הרעה ===== */
console.log('1. קבוצה שתולה רעה · "מעט" ו"קצת" הם הפירושים של שני ערכים שונים');

/* המקרה אינו מומצא: קוֹרֶט מפורש "מעט, כמות קטנה" ו-שַׁבְרִיר מפורש בין השאר "קצת".
   מיזוג שתי המילים מוחק את האבחנה בין שני הערכים · בדיוק מה שהווטו קיים בשבילו. */
const BAD = { id: -1, words: ['מעט', 'קצת'], pos: 'adv', note: 'שתולה · חייבת להידחות' };
const badRes = G.runGate([BAD]).results[0];
ok(!badRes.pass, 'השער דחה את הקבוצה הרעה', 'עבר, כלומר השער עיוור');
ok(badRes.hits.length > 0, `נמצאו התנגשויות (${badRes.hits.length})`);
const named = badRes.hits.map(h => h.victimTerm + '|' + h.intruderTerm).join(' ');
ok(/קוֹרֶט/.test(named) && /שַׁבְרִיר/.test(named),
  'ההתנגשות נקובה בשם הזוג הנכון (קוֹרֶט מול שַׁבְרִיר)', named.slice(0, 200));
if (badRes.hits[0]) console.log(`      ${G.describe(badRes.hits[0])}`);

/* ===== 2 · הקבוצה השתולה הבטוחה ===== */
console.log('');
console.log('2. קבוצה שתולה בטוחה · "מחדש / שוב / שנית"');
const SAFE = { id: -2, words: ['מחדש', 'שוב', 'שנית'], pos: 'adv', note: 'שתולה · חייבת לעבור' };
const safeRes = G.runGate([SAFE]).results[0];
const safeTouch = touchCount(SAFE);
ok(safeRes.pass, 'השער אישר את הקבוצה הבטוחה',
  safeRes.hits[0] ? G.describe(safeRes.hits[0]) : '');
ok(safeTouch > 0, `הקבוצה באמת נוגעת במאגר (${safeTouch} מקטעים משתנים תחתיה)`,
  'אפס מקטעים · הקבוצה עברה כי לא בדקה כלום');

/* בקרת-שפיות שלישית: קבוצה שכל מילותיה מומצאות חייבת לעבור **ולא לגעת בכלום**.
   אם היא נוגעת במשהו, canonMapOf או norm שבורים. */
console.log('');
console.log('3. בקרת שפיות · קבוצה של מילים שאינן במאגר');
const INERT = { id: -3, words: ['זזזא', 'זזזב'], pos: 'test', note: 'שתולה · אינרטית' };
ok(G.runGate([INERT]).results[0].pass, 'קבוצה אינרטית עוברת');
ok(touchCount(INERT) === 0, 'קבוצה אינרטית אינה נוגעת באף מקטע');

/* ===== 4 · תקינות הלקסיקון ===== */
console.log('');
console.log('4. תקינות הלקסיקון');
let lex = null;
try { lex = G.loadLexicon(); ok(true, 'synonyms.json נטען ו-JSON חוקי'); }
catch (e) { ok(false, 'synonyms.json נטען ו-JSON חוקי', e.message); }

if (lex) {
  const ctx = getCtx('he');
  ok(lex.version === 1, `version = 1 (נמצא ${lex.version})`);
  ok(lex.groups.length > 0, `יש קבוצות (${lex.groups.length})`);

  const small = lex.groups.filter(g => !Array.isArray(g.words) || g.words.length < 2);
  ok(small.length === 0, 'אין קבוצה עם פחות משתי מילים',
    small.map(g => g.id).join(', '));

  const ids = lex.groups.map(g => g.id);
  ok(new Set(ids).size === ids.length, 'כל המזהים ייחודיים');

  const seen = new Map();
  const dup = [];
  for (const g of lex.groups) for (const w of (g.words || [])) {
    const k = ctx.norm(w);
    if (!k) { dup.push(`"${w}" (קבוצה ${g.id}) מתנרמל לריק`); continue; }
    if (seen.has(k)) dup.push(`"${w}" בקבוצות ${seen.get(k)} ו-${g.id}`);
    else seen.set(k, g.id);
  }
  ok(dup.length === 0, 'אף מילה אינה מופיעה בשתי קבוצות (אחרי norm)', dup.join(' · '));

  const badStatus = lex.groups.filter(g => !['pending', 'approved', 'rejected'].includes(g.status));
  ok(badStatus.length === 0, 'לכל קבוצה status חוקי', badStatus.map(g => g.id).join(', '));

  const noReason = lex.groups.filter(g => g.status === 'rejected' && !g.reason);
  ok(noReason.length === 0, 'לכל קבוצה שנדחתה יש reason', noReason.map(g => g.id).join(', '));

  /* הלקסיקון שכבר עבר את השער חייב להישאר נקי · אחרת מישהו ערך status ביד. */
  const approved = lex.groups.filter(g => g.status === 'approved');
  if (approved.length) {
    const still = G.newCollisions(approved);
    ok(still.length === 0,
      `כל ${approved.length} הקבוצות המאושרות יחד · אפס התנגשויות חדשות`,
      still.slice(0, 3).map(G.describe).join(' | '));
  }
}

/* ===== פסק דין ===== */
console.log('');
if (failures === 0 && !badRes.pass && safeRes.pass && safeTouch > 0) {
  console.log('לשער יש שיניים');
  console.log('');
  process.exit(0);
}
console.log(`נכשל · ${failures} בדיקות אדומות`);
process.exit(1);
