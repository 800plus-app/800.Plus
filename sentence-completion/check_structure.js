/* שער מבני: פריטים שאפשר לפתור **בלי לדעת את אוצר המילים**.
 *
 *   node sentence-completion/check_structure.js
 *
 * שני הכשלים כאן נמצאו בידי הקורא העוין במדידת 450 (11.8.2026), ושניהם מבניים
 * ולכן ניתנים למדידה מכנית — בדיוק מה שאסור להשאיר לשיפוט אנושי חוזר.
 *
 * ⛔ 1 · פריט זוג שמצטמצם לשאלה של מילה אחת
 * -----------------------------------------
 * בפריט דו-חסרי, אם שתי אפשרויות חולקות את אותה מילה באותו חריץ, החריץ הזה מפסיק
 * להפריד ביניהן והפריט כולו הופך לשאלה על החריץ השני. הראיה שהקורא הביא:
 *   80:  enlist + undertake  מול  enlist + undergo   ← שתי הקולוקציות אמיתיות
 *   207: cover  + deliver    מול  carry  + deliver   ← ו-carry אף טבעי מהמפתח
 * הפריט תוכנן כשאלה על שני צירים ובפועל נשאל על ציר אחד, וזה הציר שאיש לא בדק.
 *
 * ⚠ מה שהשער **לא** קובע: שהפריט פסול. פריט זוג שבו הזוג ההפוך הוא המסיח (הדפוס
 * הרגיל אצלנו) חולק בהכרח מילים, וזה תקין — שם השאלה היא **הסדר**. השער מדגיש רק
 * כשהצמצום הוא לזוג נרדפים, כלומר כששתי אפשרויות נבדלות במילה אחת בלבד **ואינן
 * היפוך זו של זו**.
 *
 * ⛔ 2 · תווית שמכריעה לפני שהמשמעות מכריעה
 * ------------------------------------------
 * `must be an ___` פוסל כל אפשרות שאינה נפתחת בתנועה, בלי לדעת מה המילה אומרת.
 * הקורא מצא שבפריט 37 זה חיסל את שלושת המסיחים, ובפריט 68 דווקא את המסיח החזק
 * היחיד. גם `a`/`one` לפני שם עצם בלתי-נמנה נופל לכאן.
 */
/* ⛔ תוקן מיד אחרי הריצה הראשונה, והכשל שלי כאן שווה תיעוד: הגרסה הראשונה דגלה
   על **כל** זוג אפשרויות שנבדל במילה אחת, והפיקה 78 "כשלים". זה **התכנון התקין**
   של פריט זוג אצלנו:
       A = X+Y (נכון) · B = Y+X (היפוך) · C = X+Z · D = W+Y
   כלומר כל מסיח נבדל מהמפתח במילה אחת **בכוונה**, כדי לבודד חריץ אחד.
   ⚠ זו הפעם השלישית בפרויקט שבניתי שער שיורה על הדבר הלא נכון, ולכן הכלל שנרשם
   ב-CLAUDE.md אינו עצה אלא ניסיון: שער חדש מגיע עם הרצה, והמספר הראשון שהוא מפיק
   נבדק לגופו לפני שמסתמכים עליו.
   הטענה האמיתית של הקורא העוין הייתה צרה: הפגם קיים רק כששתי המילים הנבדלות הן
   **נרדפות** (`undertake`/`undergo`, `cover`/`carry`), ואז ההפרדה שנשארה היא שיפוט
   נרדפות ולא ידיעת אוצר מילים. הפרוקסי האובייקטיבי לכך הוא **פירוש בנק חופף** —
   אותו מבחן שהכותבים עצמם החילו ביד. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'batches');
const B = require('./bands.js'); B.unitOf('the');
const D = global.window.UNIT_DATA_EN;
const GLOSS = {};
for (const u of Object.keys(D)) for (const [en, he] of D[u]) {
  const k = B.normEn(en); if (!GLOSS[k]) GLOSS[k] = he;
  String(en).split(/[,\/]/).map(x => x.trim()).filter(x => x.length >= 3 && !/\s/.test(x))
    .forEach(a => { const ka = B.normEn(a); if (!GLOSS[ka]) GLOSS[ka] = he; });
}
/* מילות תוכן עבריות בפירוש, בלי מילות שימוש. */
const senses = w => new Set((String(GLOSS[B.normEn(w)] || '').match(/[֐-׿]+/g) || [])
  .filter(x => x.length > 2));
/* חופפים = חולקים לפחות משמעות אחת שלמה. זה אינו "נרדפים" מושלם, אבל הוא מדיד,
   והוא בדיוק המבחן שהכותבים דיווחו שהם מחילים ("שני תאי g זהים"). */
const overlap = (a, b) => {
  const A = senses(a), Bs = senses(b);
  if (!A.size || !Bs.size) return false;
  for (const x of A) if (Bs.has(x)) return true;
  return false;
};

const items = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    .forEach((it, i) => items.push({ ...it, src: `${f.replace(/\.json$/, '')}#${i + 1}` }));

const err = [], flag = [];
let pairs = 0, articled = 0;

for (const it of items) {
  const isPair = Array.isArray(it.o[0]);

  /* ---- 1 · צמצום בפריט זוג ---- */
  if (isPair) {
    pairs++;
    for (let a = 0; a < it.o.length; a++) for (let b = a + 1; b < it.o.length; b++) {
      const A = it.o[a], B = it.o[b];
      if (A.length !== B.length) continue;
      const diff = A.map((w, i) => w !== B[i] ? i : -1).filter(i => i >= 0);
      if (diff.length !== 1) continue;                     // נבדלות ביותר ממילה
      /* היפוך הוא הדפוס התקין: שם השאלה היא הסדר ולא המשמעות. */
      const reversed = A.length === 2 && A[0] === B[1] && A[1] === B[0];
      if (reversed) continue;
      const which = diff[0];
      /* ⭐ ההבדל בין תכנון תקין לפגם: האם שתי המילים הנבדלות חולקות משמעות בבנק.
         נבדלות במילה אחת = בידוד חריץ, וזה רצוי. נבדלות במילה אחת **שנרדפת לה** =
         הפריט הפך לשיפוט נרדפות. */
      if (!overlap(A[which], B[which])) continue;
      const involvesKey = (a === it.a || b === it.a);
      const msg = `${it.src} · חריץ ${which + 1}: "${A[which]}" ו-"${B[which]}" חולקים משמעות בבנק `
        + `(${[...senses(A[which])].filter(x => senses(B[which]).has(x)).join(', ')}) `
        + `— ההפרדה שנשארה היא שיפוט נרדפות`;
      (involvesKey ? err : flag).push(msg);
    }
  }

  /* ---- 2 · תווית שמכריעה ---- */
  const flat = [].concat(...it.o.map(o => [].concat(o)));
  /* התווית שלפני החסר. נבדק רק החסר הראשון: `an ___` הוא המקרה המעשי. */
  const m = String(it.s).match(/\b(an?|one)\s+_{2,}/i);
  if (m) {
    articled++;
    const art = m[1].toLowerCase();
    const vowel = w => /^[aeiou]/i.test(String(w).trim());
    const first = it.o.map(o => [].concat(o)[0]);
    const ok = first.filter(w => art === 'an' ? vowel(w) : (art === 'a' ? !vowel(w) : true));
    if (art !== 'one' && ok.length < it.o.length) {
      const killed = first.filter(w => !ok.includes(w));
      const keyAlive = ok.includes([].concat(it.o[it.a])[0]);
      const msg = `${it.src} · התווית "${art}" פוסלת ${killed.length} אפשרויות בלי משמעות `
        + `(${killed.join(', ')})${keyAlive ? '' : ' ⚠ והיא פוסלת את המפתח'}`;
      (ok.length <= 1 ? err : flag).push(msg);
    }
  }
}

console.log('='.repeat(70));
console.log(`${items.length} פריטים · ${pairs} פריטי זוג · ${articled} עם תווית לפני החסר`);
console.log('='.repeat(70));
console.log(`\n⛔ ${err.length} כשלים — הפריט פתיר בלי אוצר מילים, או שהמפתח עצמו בצמצום:`);
err.forEach(x => console.log('   ' + x));
console.log(`\n⚠ ${flag.length} דגלים — צמצום בין שני מסיחים, או תווית שפוסלת חלק:`);
flag.slice(0, 25).forEach(x => console.log('   ' + x));
if (flag.length > 25) console.log(`   ... ועוד ${flag.length - 25}`);
console.log('\n' + (err.length ? '⛔ יש כשלים' : '✅ אין כשל מבני'));
console.log('='.repeat(70));
process.exit(err.length ? 1 : 0);
