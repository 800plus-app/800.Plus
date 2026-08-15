'use strict';
/* האם המנגנון המורפולוגי עובד בעברית · typo-lab/he_morph_30.js
 *
 *   node typo-lab/he_morph_30.js            → 30 כרטיסים
 *   node typo-lab/he_morph_30.js --n 120    → מדגם גדול יותר
 *   node typo-lab/he_morph_30.js --selftest → שיניים
 *
 * ===== למה הקובץ הזה קיים, ולמה הוא **אינו** מייצר מועמד =====
 *
 * חגי מחליף את המאגר העברי בספטמבר. לכן כל סף, כל חוק וכל לקסיקון שמכוילים היום מול
 * המאגר הזה **יפוגו**. השאלה שיש טעם לשאול אינה "איזה חוק לשלוח" אלא:
 *
 *     כשלומד עברית כותב את הפירוש בהטיה אחרת — כמה פעמים זה נכשל, ומה חוסם?
 *
 * ולכן הפלט כאן הוא **שני מספרים ותו לא**: כמה מהווריאציות נדחות היום, וכמה מהדחיות
 * נובעות מכך שהמחרוזת היא תשובה של כרטיס אחר. הראשון הוא גודל הבעיה; השני הוא מה
 * שיישתנה כשהמאגר יוחלף.
 *
 * ⚠ שום דבר כאן אינו נוגע ב-`data.js`, ואינו כותב ארטיפקט, ואינו מציע פרמטר.
 *
 * ===== מאיפה הווריאציות =====
 *
 * ‏11 משפחות המשקלים של `lib/morphrules.js` — אותה טבלה שהמדידה הקודמת השתמשה בה,
 * ולא טבלה חדשה. כל משפחה מוחלת לשני הכיוונים על כל מילת תוכן בפירוש. זה **חסם
 * עליון** על מה שלומד יכתוב: לומד אמיתי כותב הטיה אחת, לא את כולן.
 *
 * ===== ההבחנה שכל הקובץ קיים בשבילה =====
 *
 *   · **נדחה · פנוי**   — הווריאציה נדחית, ואף כרטיס אחר אינו תובע אותה.
 *                          זה מה שחוק היה יכול לפתוח, והוא **אינו** תלוי במאגר הספציפי.
 *   · **נדחה · תפוס**   — הווריאציה היא תשובה קבילה של כרטיס אחר. חוק שיפתח אותה
 *                          יאמר לשני לומדים הפוכים שצדקו. **זה** תלוי במאגר, וישתנה.
 *
 * היחס בין השניים הוא התשובה: אם רוב הדחיות פנויות — המנגנון עובד בעברית וכדאי
 * לחזור אליו אחרי ההחלפה. אם רובן תפוסות — הצפיפות היא החסם, והיא תחזור.
 */

const fs = require('fs');
const path = require('path');

const { loadApp } = require(path.join(__dirname, '..', 'tests', '_harness', 'sandbox.js'));
const { BINYAN_PAIRS } = require('./lib/morphrules.js');

const ROOTD = path.join(__dirname, '..');
const LEX_PATH = path.join(ROOTD, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;

const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');
const ni = argv.indexOf('--n');
const N = ni >= 0 && argv[ni + 1] ? Number(argv[ni + 1]) : 30;
const say = s => process.stdout.write(s + '\n');

/* ===== התבניות · '123' הן אותיות השורש ===== */
function fit(word, pat) {
  /* מחלץ שורש מ-word לפי תבנית pat, ומחזיר null אם אינו מתאים. */
  const before = pat.split('1')[0];
  const idx = [pat.indexOf('1'), pat.indexOf('2'), pat.indexOf('3')];
  if (idx.some(i => i < 0)) return null;
  const lit = [];
  lit.push(pat.slice(0, idx[0]));
  lit.push(pat.slice(idx[0] + 1, idx[1]));
  lit.push(pat.slice(idx[1] + 1, idx[2]));
  lit.push(pat.slice(idx[2] + 1));
  let p = 0;
  const root = [];
  for (let k = 0; k < 4; k++) {
    if (!word.startsWith(lit[k], p)) return null;
    p += lit[k].length;
    if (k < 3) { if (p >= word.length) return null; root.push(word[p]); p += 1; }
  }
  if (p !== word.length) return null;
  return root;
}
const build = (root, pat) => pat.replace('1', root[0]).replace('2', root[1]).replace('3', root[2]);

/* ===== הקשר ===== */
function ctx() {
  const c = loadApp({ lang: 'he' });
  if (LEX) c.window.TYPO_LEX = LEX;
  else throw new Error('typo-lex.js חסר · בלעדיו שכבת הסובלנות כבויה והמדידה חסרת משמעות');
  return c;
}

function main() {
  const c = ctx();
  const bank = Array.from(c.BANK);
  const strip = s => String(s).replace(/[֑-ׇ]/g, '');

  /* יקום התשובות · מקטע מנורמל → הכרטיסים שהוא תשובה קבילה שלהם */
  const claim = new Map();
  for (const w of bank) for (const s of Array.from(c.meaningSegs(w.meaning))) {
    if (!s) continue;
    if (!claim.has(s)) claim.set(s, []);
    claim.get(s).push(w);
  }
  /* קבוצת ההיתר · הכרטיס עצמו וכל מי שחולק איתו פירוש */
  const allowOf = w => { const s = new Set([c.K(w.term)]); for (const t of Array.from(c.glossAlts(w))) s.add(c.K(t)); return s; };

  /* אוצר המילים שמופיע בפועל בפירושי המאגר · הצד השני של בוחן הסבירות */
  const glossWords = new Set();
  for (const s of claim.keys()) for (const w of s.split(' ')) if (w) glossWords.add(w);

  /* בוחן הסבירות · האם לומד היה יכול לכתוב את המילה הזאת בכלל */
  const lex = c.typoLex && c.typoLex();
  if (!lex) throw new Error('לקסיקון הריצה לא נטען · בלעדיו אין בוחן סבירות והמדידה חסרת ערך');
  const plausible = w => glossWords.has(w) || c.lexHit(w, 'he');

  /* מדגם דטרמיניסטי · פרוס על כל המאגר ולא 30 הראשונים, שכולם מיחידה אחת */
  const step = Math.max(1, Math.floor(bank.length / N));
  const sample = [];
  for (let i = 0; i < bank.length && sample.length < N; i += step) sample.push(bank[i]);

  let nVar = 0, accepted = 0, freeRej = 0, takenRej = 0;
  const freeEx = [], takenEx = [];
  /* בקרה חיובית · הפירוש **עצמו**, בלי שינוי, חייב להתקבל על הכרטיס שלו.
     בלעדיה "‏100% נדחות" יכול להיות גם ממצא וגם בודק מקולקל, ואי אפשר להבחין.
     בגלגול הקודם השן הזאת נדלקה אדומה בדיוק כאן, ולכן היא כאן. */
  let ctrl = 0, ctrlOk = 0;

  for (const card of sample) {
    const segs = Array.from(c.meaningSegs(card.meaning)).filter(Boolean);
    const allow = allowOf(card);
    const seen = new Set();
    for (const seg of segs) { ctrl++; if (c.meaningMatch(seg, card.meaning)) ctrlOk++; }
    for (const seg of segs) {
      const words = seg.split(' ').filter(Boolean);
      for (let wi = 0; wi < words.length; wi++) {
        for (const pr of BINYAN_PAIRS) {
          for (const [from, to] of [[pr.a, pr.b], [pr.b, pr.a]]) {
            const root = fit(words[wi], from);
            if (!root) continue;
            const alt = build(root, to);
            if (alt === words[wi]) continue;
            /* ⛔ המסנן שבלעדיו כל המדידה חסרת ערך.
               התבניות מוחלות על **כל** מילת תוכן, כולל שמות עצם, ולכן הן מייצרות
               בעיקר אי-מילים: `כלי`→`לכלוי`, `חרס`→`נחרס`, `כלי`→`כיליה`. גלגול
               ראשון של הקובץ הזה ספר 183 ווריאציות ודיווח **98.9% פנויות** — כלומר
               מדד מרחב ריק וקרא לו הזדמנות. אף לומד לא יכתוב "לחרוס".
               הבוחן הוא לקסיקון הריצה: הוא בנוי מהטקסטים שלנו ומכריע רק בכיוון אחד
               (נמצא ⇒ מילה אמיתית). כאן זה בדיוק הכיוון הדרוש. מילה שאינה בו ואינה
               מופיעה באף פירוש במאגר — אינה קלט של לומד, ואינה נספרת. */
            if (!plausible(alt)) continue;
            const variant = words.slice(0, wi).concat([alt], words.slice(wi + 1)).join(' ');
            if (seen.has(variant)) continue;
            seen.add(variant);
            nVar++;
            if (c.meaningMatch(variant, card.meaning)) { accepted++; continue; }
            /* נדחתה · האם כרטיס אחר תובע אותה? */
            const owners = (claim.get(variant) || []).filter(o => o !== card && !allow.has(c.K(o.term)));
            if (owners.length) {
              takenRej++;
              if (takenEx.length < 8) takenEx.push(`${strip(card.term)} ← "${variant}"  (תפוס: ${strip(owners[0].term)})`);
            } else {
              freeRej++;
              if (freeEx.length < 8) freeEx.push(`${strip(card.term)} ← "${variant}"  (${pr.he})`);
            }
          }
        }
      }
    }
  }

  say(`# האם המנגנון המורפולוגי עובד בעברית · מדגם ${sample.length} כרטיסים`);
  say('');
  say(`ווריאציות שנוצרו · ${nVar}   (‏11 משפחות משקלים, שני כיוונים, כל מילת תוכן בפירוש)`);
  say('');
  say('| מצב | כמה | חלק |');
  say('|---|---|---|');
  const pct = x => nVar ? (100 * x / nVar).toFixed(1) + '%' : '—';
  say(`| מתקבלת כבר היום | ${accepted} | ${pct(accepted)} |`);
  say(`| **נדחית · ואף כרטיס אחר אינו תובע אותה** | **${freeRej}** | **${pct(freeRej)}** |`);
  say(`| נדחית · תשובה של כרטיס אחר | ${takenRej} | ${pct(takenRej)} |`);
  say('');
  const rej = freeRej + takenRej;
  if (rej) {
    say(`מתוך ${rej} הדחיות · **${(100 * freeRej / rej).toFixed(1)}% פנויות** ו-${(100 * takenRej / rej).toFixed(1)}% תפוסות.`);
    say('');
    say('הפנויות הן מה שחוק **היה** יכול לפתוח, והן אינן תלויות במאגר הספציפי.');
    say('התפוסות הן צפיפות המאגר · הזוגות ישתנו בהחלפה, השיעור צפוי לחזור.');
  }
  say('');
  say('**דוגמאות · נדחות ופנויות**');
  for (const e of freeEx) say('  · ' + e);
  say('');
  say('**דוגמאות · נדחות ותפוסות**');
  for (const e of takenEx) say('  · ' + e);

  if (SELFTEST) {
    say('');
    say('## שיניים');
    /* 1 · המחולל מייצר את הזוג המתועד */
    const r = fit('מורד', '1ו23');
    const ok1 = r && build(r, '123נ') === 'מרדנ';
    say(`  ${ok1 ? '✅' : '⛔'} המחולל מייצר מורד → מרדנ (‏act-agent)`);
    /* 2 · הבודק אינו עונה "לא" על הכול · הבקרה החיובית */
    const any = ctrl > 0 && ctrlOk === ctrl;
    say(`  ${any ? '✅' : '⛔'} בקרה חיובית · ${ctrlOk}/${ctrl} מהפירושים המקוריים מתקבלים · בודק שעונה "לא" תמיד היה נופל כאן`);
    /* 3 · יקום התביעה אינו ריק */
    say(`  ${claim.size > 1000 ? '✅' : '⛔'} יקום התשובות נבנה · ${claim.size} מקטעים`);
    /* 4 · הלקסיקון באמת מוזרק · בלעדיו שכבת הסובלנות כבויה והמספרים משקרים */
    const amir = bank.find(w => strip(w.term) === 'אמיר');
    const ok4 = amir ? c.isCorrect('אמירר', amir.term) : false;
    say(`  ${ok4 ? '✅' : '⛔'} שכבת הסובלנות פעילה בהקשר (אמירר ~ אָמִיר)`);
    if (!(ok1 && any && ok4)) process.exitCode = 1;
  }
}

if (require.main === module) main();
