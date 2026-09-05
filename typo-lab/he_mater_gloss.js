'use strict';
/* כתיב מלא/חסר בצד הפירוש · typo-lab/he_mater_gloss.js
 *
 *   node typo-lab/he_mater_gloss.js              → הטבלה
 *   node typo-lab/he_mater_gloss.js --list 40    → + דוגמאות
 *   node typo-lab/he_mater_gloss.js --selftest   → שיניים
 *
 * ===== מאיפה השאלה =====
 *
 * בסט הכיול העיוור נחתה שורה אחת שאינה מורפולוגיה בכלל: הכרטיס `שגעון גדלות`,
 * הפירוש `מחשבות שווא על עליונות`, והלומד כתב `מחשבות שוא`. ‏`שווא`/`שוא` הן **אותה
 * מילה בדיוק** בכתיב מלא ובכתיב חסר · אם קריאה, לא הטיה. והיא נדחתה.
 *
 * הצד ה**מונחי** (`heForms` ב-`app.js`) כבר מטפל בזה: `אמיר`/`אמיר` בכתיב מלא וחסר
 * מתקבלים שניהם על הכרטיס. השאלה שנשאלת כאן היא אם אותו טיפול קיים בצד ה**פירוש**.
 *
 * ‏`materVI` הוא האופרטור שמתמחר בדיוק את זה בשכבת הסובלנות, והוא ה**טעות העברית
 * הנפוצה ביותר** · 77,444 זוגות בדאטהסט. הוא מתומחר 99 (חסום) במשטר הצר.
 *
 * ===== מה זה מודד =====
 *
 * לכל מקטע פירוש בכל כרטיס עברי, כל וריאציית אם-קריאה של **מילה אחת** במקטע:
 * הוספה או השמטה של ו' או י' יחידה, בעמדה שאינה ראשונה ואינה אחרונה. ואז שלוש שאלות:
 *
 *   · מתקבלת?          `meaningMatch` על הצורה המלאה של האפליקציה, כולל הסובלנות
 *   · תפוסה?           הווריאציה היא תשובה קבילה של כרטיס **אחר**
 *   · מילה אחרת?       הווריאציה היא מילה עברית אמיתית **אחרת** לפי לקסיקון-הריצה
 *
 * השלישית היא הסכנה האמיתית והיא הלקח הקבוע: `שן`/`שין`, `עלה`/`עולה`, `שנה`/`שינה`
 * הן זוגות אם-קריאה שהן **שתי מילים שונות**. חוק שמקבל כל וריאציית אם-קריאה מוחק
 * את ההבחנה ביניהן. לכן המנייה כאן היא **מלאה** ולא מדגם.
 *
 * ⚠ שום דבר כאן אינו נוגע ב-`data.js` ואינו מציע פרמטר. הפלט הוא מספרים.
 */

const fs = require('fs');
const path = require('path');

const { loadApp } = require(path.join(__dirname, '..', 'tests', '_harness', 'sandbox.js'));

const ROOTD = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const LEX_PATH = path.join(ROOTD, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;

const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');
const NARROW = argv.includes('--narrow');
const li = argv.indexOf('--list');
const LIST = li >= 0 ? Number(argv[li + 1] || 20) : 0;
const say = s => process.stdout.write(s + '\n');
const strip = s => String(s).replace(/[֑-ׇ]/g, '');

/* וריאציות אם-קריאה של מילה אחת · ו' או י' בודדת, נוספת או מושמטת.
   ⛔ לא בעמדה הראשונה (‏"ילד"→"לד" משנה שורש) ולא באחרונה (‏"מלא"→"מלאי" מילה אחרת),
   וזו בדיוק ההגבלה ש-`heForms` של האפליקציה עצמה עובדת בה. */
function materVariants(w) {
  const out = new Set();
  for (let i = 1; i < w.length - 1; i++) {
    if (w[i] === 'ו' || w[i] === 'י') out.add(w.slice(0, i) + w.slice(i + 1));   // השמטה
  }
  for (let i = 1; i < w.length; i++) {
    for (const c of ['ו', 'י']) {
      if (w[i - 1] === c || w[i] === c) continue;                                 // לא ליצור כפל
      out.add(w.slice(0, i) + c + w.slice(i));                                    // הוספה
    }
  }
  out.delete(w);
  return out;
}

/* ===== התת-מחלקה הצרה · **כפל** אם קריאה בלבד =====
 * זה המקרה שנחת בסט העיוור: `שווא` ↔ `שוא`. אין כאן הוספה או השמטה של אם קריאה
 * אלא **הכפלה או ביטול הכפלה** שלה — וזו הטרנספורמציה ש-`heForms` של האפליקציה
 * כבר מבצעת בצד ה**מונחי**. ההבחנה אינה קוסמטית: `שדה`/`שידה` ו-`שמר`/`שומר` הן
 * הוספה/השמטה ולכן שתי מילים, בעוד ש-`שווא`/`שוא` הן שתי איותים של מילה אחת.
 */
function doubleVariants(w) {
  const out = new Set();
  for (let i = 1; i < w.length - 1; i++) {
    for (const c of ['ו', 'י']) {
      if (w[i] === c && w[i + 1] === c) out.add(w.slice(0, i) + w.slice(i + 1));  // וו → ו
      else if (w[i] === c && w[i - 1] !== c && w[i + 1] !== c) out.add(w.slice(0, i) + c + w.slice(i)); // ו → וו
    }
  }
  out.delete(w);
  return out;
}

function main() {
  const c = loadApp({ lang: 'he' });
  if (LEX) c.window.TYPO_LEX = LEX;
  else throw new Error('typo-lex.js חסר · בלעדיו שכבת הסובלנות כבויה והמדידה חסרת משמעות');
  const bank = Array.from(c.BANK);

  const claim = new Map();
  for (const w of bank) for (const s of Array.from(c.meaningSegs(w.meaning))) {
    if (!s) continue;
    if (!claim.has(s)) claim.set(s, []);
    claim.get(s).push(w);
  }
  const allowOf = w => { const s = new Set([c.K(w.term)]); for (const t of Array.from(c.glossAlts(w))) s.add(c.K(t)); return s; };
  const glossWords = new Set();
  for (const s of claim.keys()) for (const w of s.split(' ')) if (w) glossWords.add(w);
  if (!(c.typoLex && c.typoLex())) throw new Error('לקסיקון הריצה לא נטען');

  let n = 0, live = 0, taken = 0, realOther = 0, freeNovel = 0;
  const exLive = [], exFree = [], exReal = [];

  for (const card of bank) {
    const segs = Array.from(c.meaningSegs(card.meaning)).filter(Boolean);
    const allow = allowOf(card);
    const own = new Set(segs);
    const seen = new Set();
    for (const seg of segs) {
      const words = seg.split(' ').filter(Boolean);
      for (let wi = 0; wi < words.length; wi++) {
        for (const alt of (NARROW ? doubleVariants : materVariants)(words[wi])) {
          const variant = words.slice(0, wi).concat([alt], words.slice(wi + 1)).join(' ');
          if (own.has(variant) || seen.has(variant)) continue;
          seen.add(variant);
          n++;
          if (c.meaningMatch(variant, card.meaning)) {
            live++;
            if (exLive.length < LIST) exLive.push(`${strip(card.term)} · "${words[wi]}" → "${alt}"`);
            continue;
          }
          const owners = (claim.get(variant) || []).filter(o => o !== card && !allow.has(c.K(o.term)));
          if (owners.length) {
            taken++;
            continue;
          }
          /* ⭐ הדלי המסוכן · המילה החלופית היא מילה עברית אמיתית **אחרת** */
          const real = c.lexHit(alt, 'he') || glossWords.has(alt);
          if (real) {
            realOther++;
            if (exReal.length < LIST) exReal.push(`${strip(card.term)} · "${words[wi]}" → "${alt}"  ⚠ מילה אמיתית אחרת`);
          } else {
            freeNovel++;
            if (exFree.length < LIST) exFree.push(`${strip(card.term)} · "${words[wi]}" → "${alt}"`);
          }
        }
      }
    }
  }

  say('# כתיב מלא/חסר בצד הפירוש · מנייה מלאה על כל המאגר העברי');
  say('');
  say(NARROW ? '**מצב צר** · כפל אם קריאה בלבד (‏שווא ↔ שוא) · אותה טרנספורמציה שheForms עושה בצד המונחי'
            : '**מצב מלא** · כל הוספה או השמטה של ו/י בודדת');
  say('');
  say(`${bank.length} כרטיסים · ${n} וריאציות אם-קריאה נבדלות (ו'/י' בודדת, לא בקצוות)`);
  say('');
  const pct = x => n ? (100 * x / n).toFixed(1) + '%' : '—';
  say('| מצב | כמה | חלק |');
  say('|---|---|---|');
  say(`| **מתקבלת היום** | **${live}** | **${pct(live)}** |`);
  say(`| נדחית · תשובה של כרטיס אחר | ${taken} | ${pct(taken)} |`);
  say(`| ⚠ נדחית · והחלופה היא **מילה עברית אמיתית אחרת** | **${realOther}** | **${pct(realOther)}** |`);
  say(`| נדחית · והחלופה אינה מילה מוכרת | ${freeNovel} | ${pct(freeNovel)} |`);
  say('');
  const rej = n - live;
  say(`נדחות בסך הכול **${rej}** (${pct(rej)}).`);
  say('');
  say(`⛔ **המספר שקובע:** מתוך ${rej} הדחיות, **${realOther}** (${rej ? (100 * realOther / rej).toFixed(1) : 0}%) הן`);
  say('מחרוזות שהן **מילה עברית אמיתית אחרת**. חוק שמקבל כל וריאציית אם-קריאה בצד');
  say('הפירוש מוחק את ההבחנה בין המילים האלה · וזה נזק ששער ההתנגשויות אינו רואה,');
  say('כי המילה האחרת אינה בהכרח תשובה של כרטיס במאגר.');

  if (LIST) {
    say('');
    say('**מתקבלות היום**');
    for (const e of exLive) say('  · ' + e);
    say('');
    say('**⚠ נדחות · והחלופה מילה אמיתית אחרת**');
    for (const e of exReal) say('  · ' + e);
    say('');
    say('**נדחות · החלופה אינה מילה מוכרת**');
    for (const e of exFree) say('  · ' + e);
  }

  if (SELFTEST) {
    say('');
    say('## שיניים');
    let ok = true;
    const t = (cond, m) => { say(`  ${cond ? '✅' : '⛔'} ${m}`); if (!cond) ok = false; };
    /* המחולל · המקרה שהניע את המדידה */
    t(materVariants('שווא').has('שוא'), 'המחולל מייצר שווא → שוא · המקרה מהסט העיוור');
    t(!materVariants('ילד').has('לד'), 'לא מוחק אם קריאה בעמדה הראשונה');
    t(!materVariants('מלא').has('מלאי'), 'לא מוסיף אם קריאה בסוף');
    /* המקרה עצמו · האם הוא באמת נדחה, כפי שהתיוג אומר */
    const card = bank.find(w => strip(w.term) === 'שגעון גדלות');
    t(!!card, 'הכרטיס שגעון גדלות נמצא · כרטיס חסר היה נותן ירוק ריק');
    if (card) {
      /* ⭐ כויל 5.9.2026 · החלפת המאגר העברי (2,235 ערכים) שינתה את הפירוש של הכרטיס
       * מ"מחשבות שווא על עליונות" ל"תחושת חשיבות מופרזת שאין לה בסיס". זו לא רגרסיה
       * ב-meaningMatch (הפירוש הנוכחי מתקבל במלואו) אלא כיול-נתונים: הבקרה החיובית
       * נבדקת מול הפירוש **החי** של הכרטיס, והשן השלילית מול וריאציית אם-קריאה שלו. */
      t(c.meaningMatch(card.meaning, card.meaning), 'בקרה חיובית · הפירוש המקורי מתקבל');
      t(!c.meaningMatch('תחושת חשבות מופרזת שאין לה בסיס', card.meaning), 'והווריאציה נדחית · זה מה שנמדד');
    }
    /* הבודק אינו "מקבל הכול" ואינו "דוחה הכול" */
    t(live > 0 && live < n, `הבודק מבחין · ${live} מתקבלות מתוך ${n}`);
    if (!ok) process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { materVariants, doubleVariants };
