'use strict';
/* שער מקור הניקוד · אותה מילה, כתיבה אחת בלבד.
 *
 *   node connectives-he/check_nikud_source.js
 *   node connectives-he/check_nikud_source.js --selftest
 *
 * מה השער חוסם
 * ------------
 * ‏`words.json` היא רשימת המילים המאושרת של היחידה, וה-`nikud` שבה הוא **הצורה
 * שהלומד אמור לראות**. מנה שכותבת את אותה מילה בניקוד אחר יוצרת מצב שבו לומד
 * פוגש את «לנוכח» פעם כ-`לְנֹכַח` ופעם כ-`לְנוֹכַח`, ואין לו דרך לדעת מה נכון.
 *
 * ⛔ **הכשל שאפשר את זה:** כל חמשת השערים הקיימים בודקים עקביות **בתוך הפריט**
 * (ש-`w` תואם ל-`o[0]` אחרי הסרת ניקוד) או **בין הפריטים** (שאותה מילה לא
 * הוצהרה בשני כיוונים). אף אחד מהם לא משווה את **מחרוזת הניקוד עצמה** מול
 * הרשימה המאושרת · ולכן מנה שהחליטה לבד איך לנקד עברה על ירוק מלא.
 * זה נמדד בפועל: `bt2` נמסרה עם `אִילוּלֵא` ו-`לְנוֹכַח` והשערים לא זעו.
 *
 * הכלל
 * ----
 * כל אחת מארבע האפשרויות ב-`o` חייבת להיות **זהה תו-בתו** ל-`nikud` של אחת
 * המילים ברשימה. הודעת הממצא נושאת את המחרוזת הנכונה, ולא רק את העובדה שיש
 * בעיה · שער שאומר «משהו לא בסדר» מחזיר את הכותב לחיפוש שהשער כבר עשה.
 *
 * ⚠ **היעדר מהרשימה אינו ממצא**, וזו הכרעה קיימת בצינור הזה ולא חידוש שלי ·
 * ‏`check_direction_he.js` מנסח אותה במפורש: «מסיח לגיטימי יכול להיות מחוץ
 * לרשימת הלימוד של היחידה (כדי ש, לשם), ודיווח על כל אחד כזה כממצא היה צובע
 * את השער אדום על נתון תקין». הרשימה מכסה תשע קטגוריות, וסט הכיוונים של
 * הסכימה מונה שלוש עשרה · מסיחי «תכלית» ו«זמן» אין להם ולא יכול להיות להם
 * גיבוי ברשימה. היעדר נספר ומוצג כשורת מידע · **סתירה** היא ממצא.
 *
 * ⚠ מה השער **אינו** בודק: אם הניקוד שברשימה עצמה נכון (זה `check_words.js`),
 * אם האפשרות מתאימה למשפט, ואם היא מסיח טוב. אלה שאלות אחרות.
 *
 * ⛔ ובלי `words.json` השער **אינו רץ**. שער שמאבד את מקור האמת שלו וממשיך
 * לדווח «0 ממצאים» הוא בדיוק הירוק המזויף שהיחידה הזאת נבנתה נגדו · ולכן
 * היעדר הקובץ הוא קוד יציאה 2 ולא 0.
 */
const fs = require('fs');
const path = require('path');
const L = require('./lib_conn.js');

const WORDS_PATH = process.env.CONN_WORDS
  ? path.resolve(process.env.CONN_WORDS)
  : path.join(L.DIR, 'words.json');

const MAQAF = /[־-]/g;                 // מקף עברי ומקף ASCII
const NIKUD_MARK = /[֑-ׇ]/;       // ניקוד וטעמים · **לא** גלובלי, כדי שלא ייגרר lastIndex

/* ── הרשימה המאושרת ──────────────────────────────────────────────────────
   ⛔ נקראת כאן ישירות ולא דרך `L.loadWords()` · אותה פונקציה בונה מפה
   **אחרי** הסרת ניקוד, ולכן מחרוזת הניקוד המדויקת, שהיא כל מה שהשער הזה
   מודד, נזרקת בדרך. שתי קריאות לאותו קובץ, שתי שאלות שונות. */
function loadApproved() {
  if (!fs.existsSync(WORDS_PATH)) throw new Error(`רשימת המילים אינה קיימת: ${WORDS_PATH}`);
  const raw = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
  if (!Array.isArray(raw) || !raw.length) throw new Error('רשימת המילים אינה מערך מלא');

  const exact = new Set();       // מחרוזות הניקוד המאושרות, כמות שהן
  const byKey = new Map();       // מפתח קנוני → { nikud, w }
  const clash = [];

  for (const rec of raw) {
    if (!rec || typeof rec !== 'object') continue;
    if (typeof rec.nikud !== 'string' || !rec.nikud.trim()) continue;
    exact.add(rec.nikud);
    /* ⭐ ממפתחים גם לפי `nikud` וגם לפי `w` · **וזה הצירוף שנותן לשער את
       הערך שלו.** ‏26 מ-91 המילים כתובות מלא בצורה החשופה וחסר במנוקדת
       (`לנוכח` מול `לְנֹכַח`), וזה תקין ומכוון. מנה ש«תיקנה» לכתיב מלא
       מנוקד (`לְנוֹכַח`) אינה מגיעה למפתח של הצורה המנוקדת כלל · רק
       המפתח של הצורה החשופה מוצא אותה, ורק הוא יכול לומר מה הצורה הנכונה. */
    for (const form of [rec.nikud, rec.w]) {
      const k = L.key(form);
      if (!k) continue;
      const prev = byKey.get(k);
      if (prev && prev.nikud !== rec.nikud) {
        clash.push(`"${k}" מוביל גם ל-"${prev.nikud}" וגם ל-"${rec.nikud}"`);
        continue;
      }
      byKey.set(k, { nikud: rec.nikud, w: rec.w });
    }
  }
  return { exact, byKey, clash, count: raw.length };
}

/* ── למה זה נפל ──────────────────────────────────────────────────────────
   ⭐ התיוג אינו קישוט · הוא מה שאומר לכותב אם הוא כתב מילה אחרת, שכח לנקד,
   או רק השמיט את המקף של הצורה הכבולה. שלושה תיקונים שונים לגמרי. */
function why(found, want) {
  if (found.replace(MAQAF, '') === want.replace(MAQAF, '')) return 'הפרש מקף בלבד';
  if (!NIKUD_MARK.test(found)) return 'האפשרות אינה מנוקדת';
  return 'ניקוד שונה';
}

/** סורק פריטים מול הרשימה. מוחזר `{ findings, checked, exactHits, absent }`. */
function scan(items, A) {
  const findings = [];
  const absent = new Set();
  let checked = 0, exactHits = 0;

  for (const it of items) {
    const src = (it && it.src) || '(ללא src)';
    const o = it && it.o;
    if (!Array.isArray(o)) { findings.push(`${src} · o אינו מערך`); continue; }
    o.forEach((opt, i) => {
      if (typeof opt !== 'string' || !opt.trim()) {
        findings.push(`${src} · o[${i}] ריק או אינו מחרוזת`);
        return;
      }
      checked++;
      if (A.exact.has(opt)) { exactHits++; return; }
      const rec = A.byKey.get(L.key(opt));
      /* מחוץ לרשימת הלימוד · שורת מידע, לא ממצא (ראה הכותרת) */
      if (!rec) { absent.add(opt); return; }
      findings.push(`${src} · o[${i}] "${opt}" ⟵ הצורה ברשימה היא "${rec.nikud}" · ${why(opt, rec.nikud)}`);
    });
  }
  return { findings, checked, exactHits, absent };
}

/* ── הוכחת שיניים ────────────────────────────────────────────────────────
   ⭐ הפגמים נגזרים מהרשימה עצמה ולא מועתקים לכאן ביד · פגם שתול שמועתק
   קופא, והיום שבו הרשימה תשנה ניקוד הוא היום שבו הבדיקה העצמית תבדוק מילה
   שאינה קיימת ותעבור על שקר. שני הראשונים הם חריגה אמיתית שנמסרה ב-`bt2`,
   והם נשארים כרגרסיה. */
function selftest(A) {
  const pick = k => {
    const r = A.byKey.get(k);
    if (!r) throw new Error(`הבדיקה העצמית נשענת על מילה שאינה ברשימה: "${k}"`);
    return r.nikud;
  };

  const planted = [
    { name: 'כתיב מלא מנוקד במקום הכתיב שברשימה (רגרסיה · bt2 כפי שנמסרה)',
      bad: 'לְנוֹכַח', want: pick('לנוכח') },
    { name: 'כתיב מלא מנוקד במקום הכתיב שברשימה (רגרסיה · bt2 כפי שנמסרה)',
      bad: 'אִילוּלֵא', want: pick('אילולא') },
    { name: 'תנועה שונה מזו שברשימה (סגול ⟵ צירה)',
      bad: pick('חרף').replace('ֶ', 'ֵ'), want: pick('חרף') },
    { name: 'מקף הצורה הכבולה נשמט',
      bad: pick('משום ש').replace(MAQAF, ''), want: pick('משום ש') },
    { name: 'אפשרות בלי ניקוד כלל',
      bad: pick('בשל').replace(/[֑-ׇ]/g, ''), want: pick('בשל') },
  ];

  const filler = [pick('חרף'), pick('לרבות'), pick('כגון')];
  let bad = 0;
  const say = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? '✅' : '⛔'} ${msg}`); };

  for (const p of planted) {
    say(!A.exact.has(p.bad),
      `הפגם השתול אינו מחרוזת מאושרת: "${p.bad}"`);
    const r = scan([{ src: 'selftest', o: [p.bad, ...filler] }], A);
    say(r.findings.length === 1, `${p.name} · ${r.findings.length} ממצאים (צפוי 1)`);
    say(r.findings.length === 1 && r.findings[0].includes(p.want),
      `   ההודעה נושאת את הצורה הנכונה "${p.want}"`);
  }

  /* ⛔ בקרה שלילית · בלעדיה שער שמדפיס ממצא על **כל** אפשרות היה עובר את
     כל הבדיקות למעלה בהצלחה מלאה. */
  const clean = scan([{ src: 'selftest', o: [pick('בשל'), ...filler] }], A);
  say(clean.findings.length === 0, `פריט תקין לגמרי · ${clean.findings.length} ממצאים (צפוי 0)`);

  /* ⛔ ובקרה שנייה · מסיח מחוץ לרשימת הלימוד אינו ממצא, אחרת השער היה נופל
     על «כדי ש» ו«לשם» שהם נתון תקין, ומישהו היה מכבה אותו בצדק. */
  const outside = scan([{ src: 'selftest', o: ['לְשֵׁם', ...filler] }], A);
  say(outside.findings.length === 0 && outside.absent.has('לְשֵׁם'),
    `מסיח שאינו ברשימה · ${outside.findings.length} ממצאים (צפוי 0) ומדווח כשורת מידע`);

  console.log(L.BAR);
  console.log(bad ? `⛔ הבדיקה העצמית נכשלה · ${bad} טענות` : '✅ לשער יש שיניים');
  console.log(L.BAR);
  return bad ? 1 : 0;
}

/* ── הרצה ────────────────────────────────────────────────────────────────*/
let A;
try { A = loadApproved(); }
catch (e) {
  console.log(L.BAR);
  console.log('שער מקור הניקוד · מילות קישור');
  console.log(L.BAR);
  console.log(`\n⛔ ${e.message}`);
  console.log('⛔ בלי הרשימה המאושרת אין מול מה להשוות · השער מסרב לדווח ירוק.');
  console.log(L.BAR);
  process.exit(2);
}

if (process.argv.includes('--selftest')) process.exit(selftest(A));

const { items, files, broken, dir } = L.loadBatches();
const { findings, checked, exactHits, absent } = scan(items, A);
findings.unshift(...broken);
/* ⚠ מפתח קנוני שמוביל לשתי מחרוזות ניקוד הוא פגם ברשימה עצמה, ואז השער
   אינו יכול לומר «הצורה הנכונה היא» · הוא אומר את זה ולא בולע. */
A.clash.forEach(c => findings.push(`רשימת המילים · ${c} · אין צורה קנונית אחת`));

const notes = [
  `מנות: ${files.join(', ') || '(אין)'} · ${dir}`,
  `הרשימה המאושרת: ${A.count} מילים · ${A.byKey.size} מפתחות · ${WORDS_PATH}`,
  `אפשרויות שנבדקו: ${checked} · זהות תו-בתו לרשימה: ${exactHits}`,
];
/* ⛔ בקרה חיובית · «0 ממצאים» על אפס אפשרויות אינו ירוק, וזה קרה בפרויקט הזה. */
if (!checked) notes.push('⚠ אף אפשרות לא נבדקה — השער עבר על ריק, וזה אינו כיסוי.');
if (absent.size)
  notes.push(`ℹ אפשרויות שאינן ברשימת הלימוד (מסיח חיצוני · לגיטימי, לא נוצלב): ${[...absent].join(', ')}`);
notes.push('⚠ נבדקה זהות מול הרשימה בלבד. אם הניקוד שברשימה עצמה נכון —');
notes.push('   זה check_words.js. אם האפשרות מתאימה למשפט — קריאה אנושית.');

process.exit(L.verdict('שער מקור הניקוד · מילות קישור', items.length, findings, notes));
