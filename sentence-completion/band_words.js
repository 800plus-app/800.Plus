/* מייצר לכל רצועה את **רשימת המילים החוקיות** שלה, עם הפירוש מהבנק.
 *
 *   node sentence-completion/band_words.js
 *   → sentence-completion/words/<רצועה>.md
 *
 * למה זה הכלי החשוב ביותר בסבב ההרחבה
 * ------------------------------------
 * שני הכשלים הגדולים של סבב 204 הפריטים הראשונים היו שניהם **כשלי אספקה**, ולא
 * כשלי כתיבה:
 *
 * 1. **מילים שאינן בבנק.** הכותבים רצו `infer`, `corroborate`, `brittle`, `stop`,
 *    `diligent` ועוד כארבעים, גילו זאת רק בשער, ואז נאלצו לשנות את גוף המשפט או
 *    להתפשר על מילה פחות טבעית. ב-`adv3#9` זה הוליד פריט **שגוי עובדתית** שנשאר
 *    בקורפוס עד שקורא עוין תפס אותו.
 * 2. **סחיפה בין רצועות.** הרצועה **נגזרת** מ-max מספר היחידה של ארבע האפשרויות,
 *    ולא מהצהרת הכותב. כותב שהתבקש "בינוני" ובחר מסיח מיחידה 9 קיבל פריט אקדמי,
 *    וההרכבה העבירה אותו. כך יצא שרצועת הבסיס נשארה עם 22 פריטים ורצועת אקדמי
 *    קיבלה 69.
 *
 * ⭐ רשימה סגורה פותרת את שניהם במקור: כל מילה ברשימה נמצאת בבנק **וגם** ביחידות
 * של הרצועה, ולכן פריט שכל ארבע אפשרויותיו מהרשימה ייגזר בהכרח לרצועה הנכונה.
 *
 * מה שמסונן מהרשימה:
 *   · מילים שכבר משמשות **מפתח** באותה רצועה — השער פוסל מפתח כפול ברצועה.
 *   · ערכי צירוף (רווח) ומילים בנות שני תווים — אינם נוחים כאפשרות.
 * ⚠ מה ש**לא** מסונן: מילה שמשמשת כבר כמסיח. זה מותר ואף רצוי, והשער רק מדגיש.
 */
const fs = require('fs'), path = require('path');
const B = require('./bands.js');
B.unitOf('the');                       // מאלץ טעינת הבנק לתוך window
const D = global.window.UNIT_DATA_EN;

const BANDS = B.BANDS;                 // [{name, lo, hi}, ...]
const dir = path.join(__dirname, 'batches');
const outDir = path.join(__dirname, 'words');
fs.mkdirSync(outDir, { recursive: true });

/* מפתחות בשימוש, לפי הרצועה **הנגזרת** של הפריט. */
const usedKeys = {}, usedAsDistractor = {};
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).forEach(it => {
    const flat = [].concat(...it.o.map(o => [].concat(o)));
    const band = B.bandOfUnit(Math.max(...flat.map(w => B.unitOf(w) || 0)));
    (usedKeys[band] = usedKeys[band] || new Set());
    (usedAsDistractor[band] = usedAsDistractor[band] || new Set());
    [].concat(it.o[it.a]).forEach(k => usedKeys[band].add(B.normEn(k)));
    flat.forEach(w => usedAsDistractor[band].add(B.normEn(w)));
  });

const report = [];
for (const band of BANDS) {
  const rows = [];
  for (const u of Object.keys(D)) {
    const unit = +u;
    if (unit < band.lo || unit > band.hi) continue;
    for (const [en, he] of D[u]) {
      if (/\s/.test(en) || en.length < 3) continue;      // צירופים וקצרצרים
      const k = B.normEn(en);
      if ((usedKeys[band.name] || new Set()).has(k)) continue;
      /* ⛔ תוקן ב-11.8 אחרי שכותב רצועת הבסיס תפס פריט שנגזר לרצועה הלא נכונה.
         `lie` מופיע בבנק **בשתי יחידות** — 1 וגם 8 — ו-`unitOf` מחזירה את
         ה**מקסימום**, כי הרצועה נקבעת לפי הקושי הגבוה ביותר. הגרסה הראשונה של
         הכלי הזה רשמה כל מילה לפי היחידה שבה היא **מופיעה כרגע בלולאה**, ולכן
         `lie` נכנסה לרשימת בסיס — ופריט שהשתמש בה נגזר למתקדם.
         ⚠ והנזק היה **שקט**: `assemble.js` מתריע על פער בין רצועה מוצהרת לנגזרת
         רק כששם המנה הוא base/mid/adv/aca, ו-`base4` אינו אף אחד מהם.
         נמדד: ארבע מילים בכל הבנק (`lie`, `seek`, `spring`, `arise`). מעט, ואחת
         מהן הספיקה. הרשימה נבנית עכשיו לפי `unitOf` — אותו קורא שההרכבה משתמשת בו. */
      const real = B.unitOf(en);
      if (real && B.bandOfUnit(real) !== band.name) continue;
      rows.push({ en, he, unit: real || unit, dist: (usedAsDistractor[band.name] || new Set()).has(k) });
    }
  }
  rows.sort((a, b) => a.unit - b.unit || a.en.localeCompare(b.en));

  const lines = [
    `# מילים חוקיות · רצועת ${band.name}`,
    '',
    `יחידות ${band.lo} עד ${band.hi} · **${rows.length} מילים**`,
    '',
    '⛔ **אלה כל המילים שמותר להשתמש בהן בפריט של הרצועה הזאת.** כל ארבע האפשרויות',
    'בכל פריט חייבות לבוא מהרשימה, וזה מה שמבטיח שהפריט ייגזר לרצועה הנכונה.',
    'הרצועה **נגזרת** מ-max מספר היחידה של ארבע האפשרויות ולא מהצהרה שלך: מסיח אחד',
    'מיחידה גבוהה מעביר את הפריט כולו לרצועה אחרת.',
    '',
    '⚠ הפירוש כאן הוא **פירוש הבנק המלא**. בשדה `g` מקצרים אותו למשמעות הרלוונטית,',
    'ומוציאים משמעויות בלבד — לא מוסיפים מילים משלכם.',
    '',
    'מילים שכבר משמשות **מפתח** ברצועה הזאת הוסרו מהרשימה: השער פוסל מפתח כפול.',
    'מילה המסומנת `·מסיח·` כבר שימשה כמסיח כאן; זה מותר, ואפשר להשתמש בה גם כמפתח.',
    '',
    '| מילה | יחידה | פירוש הבנק |',
    '|---|---|---|',
  ];
  rows.forEach(r => lines.push(
    `| \`${r.en}\`${r.dist ? ' ·מסיח·' : ''} | ${r.unit} | ${r.he} |`));
  fs.writeFileSync(path.join(outDir, `${band.name}.md`), lines.join('\n') + '\n', 'utf8');
  report.push({ band: band.name, words: rows.length, keysUsed: (usedKeys[band.name] || new Set()).size });
}

console.log('='.repeat(58));
console.log('רצועה     מילים חוקיות   מפתחות שכבר בשימוש');
console.log('='.repeat(58));
report.forEach(r => console.log(
  r.band.padEnd(10) + String(r.words).padEnd(15) + r.keysUsed));
console.log('='.repeat(58));

/* ⛔ הוכחת שיניים: כל מילה בכל רשימה חייבת להיגזר לרצועה של הרשימה שהיא בה.
   בלי הבדיקה הזאת הכלי יכול לחזור לשגות בשקט, וכותב יגלה זאת רק אם יבדוק את
   הפיזור ידנית — כמו שקרה בפועל. */
let leak = 0;
for (const band of BANDS) {
  const txt = fs.readFileSync(path.join(outDir, `${band.name}.md`), 'utf8');
  for (const m of txt.matchAll(/^\| `([^`]+)`/gm)) {
    const u = B.unitOf(m[1]);
    if (u && B.bandOfUnit(u) !== band.name) {
      console.log(`⛔ ${band.name}: "${m[1]}" נגזרת ל-${B.bandOfUnit(u)} (יחידה ${u})`);
      leak++;
    }
  }
}
console.log(leak
  ? `⛔ ${leak} מילים דולפות בין רצועות — אל תמסור את הרשימות לכותבים`
  : '✅ כל מילה בכל רשימה נגזרת לרצועה שלה. אומת מול unitOf, אותו קורא שההרכבה משתמשת בו.');
console.log('נכתב ל-sentence-completion/words/');
