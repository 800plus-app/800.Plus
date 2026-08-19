'use strict';
/* לקסיקון · שכבת הווטו השנייה.
 *
 * הבעיה שהוא פותר: הווטו הראשון (lib/veto.js) חוסם רק מחרוזות שהן *מילת מאגר*. אבל
 * המאגר מכיל 1,717 מילים עבריות ו-3,946 אנגליות, והשפה מכילה הרבה יותר. וריאציה כמו
 * כבש→כובש, חמה→חממה, נסיקה→נשיקה או harm→ham אינה במאגר, ולכן עברה את הווטו וקיבלה
 * תווית accept · תווית שגויה, כי המחרוזת היא מילה אחרת לגמרי ולא שגיאת כתיב.
 *
 * ⛔ גבול הרישיון · הכלל העומד של הפרויקט (CLAUDE.md §חשיפה משפטית)
 * -------------------------------------------------------------
 * אסור לייבא לכאן מילון חיצוני: ויקימילון (CC BY-SA), WordNet עברי, האקדמיה ללשון,
 * וכל רשימת מילים שהמקור החיצוני הוא זה שבחר מה נכנס בה. מה שמותר הוא **הטקסט שאנחנו
 * עצמנו כתבנו** · משפטי השלמת המשפטים, הפירושים של המאגר, מסמכי היחידות, התרגומים
 * העבריים של המשפטים באנגלית. אלה מקורות פנימיים, נוצרו בפרויקט הזה, ואין בהם צד שלישי.
 *
 * שלושה מקורות נבדקו ו**נפסלו** במפורש · אל תחזיר אותם בלי הכרעה של חגי:
 *   · דוחות/מאגר-נקי/01-גלם.tsv     · דאמפ לקסמות עם עמודות lid/L91/Q1084, כלומר רשימת
 *                                     ויקינתונים שהיא זו שבוחרת אילו מילים ייכנסו · בדיוק
 *                                     היפוך הסדר ש-CLAUDE.md אוסר ("בוחרים את המילה כי
 *                                     אנחנו צריכים אותה, ואז מחפשים לה דירוג").
 *   · דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv · צירופים שנאספו מהרשת, מקור לא מתועד.
 *   · pipeline_output/*.json         · מועמדים שנבחרו מרשימת לקסמות חיצונית (lid/Q), וחלקם
 *                                     נגזר מקובצי מבחני עבר · שני מקורות אסורים.
 * שלושתם יחד היו מוסיפים ‎~22,000 טיפוסים עבריים. הם לא שווים את החשיפה.
 *
 * ⚠ קובצי units_output/attestation/*.tsv כן נכללים, וההבחנה מכוונת: שם **המילים שלנו**
 * (מונחי המאגר) ולצדן עמודת ראיה חיצונית. אנחנו בחרנו את המילה ואז חיפשנו לה הוכחה ·
 * הסדר הנכון. שם, לא רשימה חיצונית שמכתיבה תוכן.
 *
 * ⚠ מה הלקסיקון **אינו**: הוכחה. מילה שאינה בו אינה "לא מילה" · היא מילה שלא נכתבה
 * באף אחד מהטקסטים שלנו. לכן הוא מכריע רק בכיוון אחד (נמצא ⇒ מילה אמיתית ⇒ דחייה),
 * ובכיוון השני הוא מחזיר "לא ידוע", וה-gen מסמן את השורה trusted:false במקום להעמיד
 * פנים שהיא ודאית.
 *
 * דטרמיניזם: הסריקה ממוינת בכל רמה, ואין תלות בסדר שמערכת הקבצים מחזירה.
 */

const fs = require('fs');
const path = require('path');
const { getCtx, ROOT } = require('./ctx.js');

/* תיקיות נסרקות, וסיומות · שתיהן חלק מהחוזה: הוספת סיומת משנה את גודל הלקסיקון ולכן
   את התוויות, ולכן היא שינוי מדיד ולא ניואנס. */
const DIRS = [
  { dir: 'sentence-completion', ext: /\.(json|md|txt|tsv|js)$/ },
  { dir: 'units_output', ext: /\.(md|tsv|txt)$/ },
  { dir: 'sentences', ext: /\.(json|md|txt|js)$/ },
];
const FILES = [
  'data-en-sentences.js',
  'data-sent-en.js',
  path.join('typo-lab', 'out', 'gloss-vocab.json'),
];

const NIQQUD = /[֑-ׇ]/g;
const HE_WORD = /[א-ת]+/g;
const EN_WORD = /[A-Za-z]+/g;

/* מילה באות אחת נזרקת: אחרי norm היא תמיד תחילית תלושה (ו, ב, ה) ולא מילה. */
const MIN = 2;

function walk(dir, ext, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

function fileList() {
  const out = [];
  for (const s of DIRS) walk(path.join(ROOT, s.dir), s.ext, out);
  for (const f of FILES) out.push(path.join(ROOT, f));
  return out;
}

let cached = null;

function buildLexicon() {
  if (cached) return cached;

  const he = getCtx('he');
  const en = getCtx('en');
  const heSet = new Set();
  const enSet = new Set();
  let bytes = 0, read = 0;

  const eat = text => {
    const t = String(text).replace(NIQQUD, '');
    const hm = t.match(HE_WORD);
    if (hm) for (const w of hm) { const n = he.norm(w); if (n && n.length >= MIN) heSet.add(n); }
    const em = t.match(EN_WORD);
    if (em) for (const w of em) { const n = en.normEn(w); if (n && n.length >= MIN) enSet.add(n); }
  };

  for (const f of fileList()) {
    let t;
    try { t = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    read++; bytes += t.length;
    eat(t);
  }

  /* שני המאגרים · המונחים והפירושים. הפירושים עבריים בשני המאגרים, ולכן שניהם תורמים
     גם לצד העברי. זה מוסיף מעט מאוד מעל הטקסטים (המאגר קטן), אבל הוא המקור שהתוויות
     נמדדות מולו ולכן הוא חייב להיות בפנים במפורש ולא במקרה. */
  for (const L of ['he', 'en']) {
    const ctx = getCtx(L);
    for (const card of Array.from(ctx.BANK)) eat(String(card.term || '') + ' ' + String(card.meaning || ''));
  }

  cached = {
    he: heSet, en: enSet,
    stats: { files: read, bytes, heTypes: heSet.size, enTypes: enSet.size }
  };
  return cached;
}

/* lang כאן הוא שפת ה*מחרוזת*, לא שפת המאגר: צד הפירוש עברי גם במאגר האנגלי.
 *
 * srcKey · המפתח שממנו נגזרה המחרוזת. כשהוא נמסר ומספר המילים זהה, נבדקות **רק המילים
 * שהשתנו**, וזו ההבחנה שמונעת הצפה: כל אופרטור כאן משחית מילה אחת בתוך הצירוף, ושאר
 * המילים הן הטקסט המקורי. בדיקת הצירוף כולו הייתה שואלת "האם שאר הפירוש כתוב במקורות
 * שלנו" · שאלה אחרת לגמרי, שמפילה שורות תקינות בגלל מילה נדירה שלא נגענו בה.
 */
function inLexicon(word, lang, srcKey) {
  if (!word) return false;
  const lex = buildLexicon();
  const set = lang === 'en' ? lex.en : lex.he;
  const parts = String(word).split(' ').filter(Boolean);
  if (!parts.length) return false;

  let check = parts;
  if (srcKey != null) {
    const src = String(srcKey).split(' ').filter(Boolean);
    if (src.length === parts.length) {
      check = parts.filter((p, i) => p !== src[i]);
      if (!check.length) return false;                 // לא השתנה דבר · אין מה לאמת
    }
  }
  for (const p of check) if (p.length < MIN || !set.has(p)) return false;
  return true;
}

module.exports = { buildLexicon, inLexicon, fileList, DIRS, FILES, MIN };
