'use strict';
/* איזו מחלקת טרנספורמציה נוגעת ב-24 המקרים האמיתיים · typo-lab/he_cases_by_class.js
 *
 *   node typo-lab/he_cases_by_class.js
 *   node typo-lab/he_cases_by_class.js --selftest
 *
 * ===== למה זה השאלה הראשונה ולא האחרונה =====
 *
 * ‏24 הצילומים של חגי (`דוחות/מדידת-כלל-מורפולוגי.md`) הם ה-benchmark החיצוני
 * **היחיד** בפרויקט שאינו מעגלי · כל שאר המדידות רצות על מרחב שאנחנו ייצרנו.
 * ולכן שאלת ההכרעה על כל מחלקה אינה "כמה בטוחה היא" אלא **"מה היא קונה"**.
 *
 * הקובץ מצליב את שתי השאלות: לכל מחלקה, כמה מ-24 היא פותחת, ובאיזה מחיר.
 * מחלקה בטוחה שפותחת אפס מקרים אינה שיפור · היא רק סיכון קטן יותר על כלום.
 *
 * ⚠ אסור לכייל על 24 המקרים. הם מדווחים, לא ממוטבים.
 */

const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'tests', '_harness', 'sandbox.js'));
const M = require('./lib/morphrules.js');
const MM = require('./measure_morph.js');
const { CASES24 } = require('./measure_gloss.js');

const say = s => process.stdout.write(s + '\n');
const strip = s => String(s).replace(/[֑-ׇ]/g, '');
const SELFTEST = process.argv.includes('--selftest');

const CLASSES = ['C-INF', 'C-PART', 'C-ACTNOUN', 'C-ABSNOUN', 'C-AGENT', 'C-VOICE', 'C-BINYAN'];
/* שיעור שימור-המשמעות שהפאנל מדד לכל מחלקה · פה אחד משלוש עדשות.
   ⚠ מוזן כאן כמחרוזת ואינו מחושב מחדש · המקור הוא `semantic_panel.js --score`,
   והמספרים האלה **זזו כבר פעם** (‏PART 46.4%→47.7% אחרי תיקון באג הדריסה).
   מי שמריץ את הפאנל מחדש חייב לעדכן את השורה הזאת. */
const SAFE = { 'C-INF': '64.9%', 'C-PART': '47.7%', 'C-ACTNOUN': '1.7%', 'C-ABSNOUN': '0.0% (0/4)', 'C-AGENT': '5.6% (1/18)', 'C-VOICE': '2.0%', 'C-BINYAN': '3.2%' };

function main() {
  const c = loadApp({ lang: 'he' });
  try { c.window.TYPO_LEX = require(path.join(__dirname, '..', 'typo-lex.js')); } catch (e) { }
  const bank = Array.from(c.BANK);
  const byKey = new Map();
  for (const w of bank) { const k = c.K(w.term); if (k && !byKey.has(k)) byKey.set(k, w); }

  /* איתור הכרטיס · לפי מפתח מנורמל, ובנפילה לפי הפירוש. שלושה מונחים אינם נמצאים
     לפי המפתח בגלל כתיב מלא/חסר בתעתיק, וזה מתועד בדוח המקורי. */
  const findCard = cs => byKey.get(c.K(cs.term)) ||
    bank.find(w => String(w.meaning) === cs.meaning) ||
    bank.find(w => c.K(strip(w.term)) === c.K(strip(cs.term)));

  const rows = [];
  for (const cs of CASES24) {
    const card = findCard(cs);
    const r = { n: cs.n, term: cs.term, typed: cs.typed, cat: cs.cat, found: !!card, today: false, hits: [] };
    if (card) {
      r.today = c.meaningMatch(c.norm(cs.typed), card.meaning) || c.isCorrect(cs.typed, card.term);
      const segs = Array.from(c.meaningSegs(card.meaning)).filter(Boolean);
      const a = c.norm(cs.typed);
      for (const key of CLASSES) {
        const cfg = MM.CLASS_CONFIGS.find(x => x.key === key);
        const p = Object.assign({}, M.binyanPair.defaults, cfg.params);
        if (M.binyanPair.accepts(a, segs, c, p)) r.hits.push(key.slice(2));
      }
    }
    rows.push(r);
  }

  say('# מה כל מחלקה קונה · מול 24 המקרים האמיתיים');
  say('');
  say('| # | מילה | הוקלד | קטגוריה | מתקבל היום | מחלקות שפותחות אותו |');
  say('|---|---|---|---|---|---|');
  for (const r of rows) {
    say(`| ${r.n} | ${r.term} | ${r.typed} | ${r.cat.split(' ')[0]} | ${r.today ? '✅' : '—'} | ${r.hits.length ? '**' + r.hits.join(', ') + '**' : '—'}${r.found ? '' : ' ⛔ כרטיס לא נמצא'} |`);
  }
  say('');
  const tally = new Map(CLASSES.map(k => [k.slice(2), []]));
  for (const r of rows) if (!r.today) for (const h of r.hits) tally.get(h).push(r.n);
  say('## הסיכום שמכריע');
  say('');
  say('| מחלקה | מקרים שהיא פותחת (מתוך 24) | אילו | שימור משמעות · פה אחד |');
  say('|---|---|---|---|');
  for (const k of CLASSES) {
    const t = tally.get(k.slice(2));
    say(`| ${k.slice(2)} | **${t.length}** | ${t.length ? t.join(', ') : '—'} | ${SAFE[k]} |`);
  }
  say('');
  const solvedToday = rows.filter(r => r.today).length;
  const missing = rows.filter(r => !r.found).length;
  say(`מתקבלים כבר היום · ${solvedToday} מתוך 24${missing ? ` · ⛔ ${missing} כרטיסים לא נמצאו` : ''}`);

  if (SELFTEST) {
    say('');
    say('## שיניים');
    let ok = true;
    const t = (cond, m) => { say(`  ${cond ? '✅' : '⛔'} ${m}`); if (!cond) ok = false; };
    t(rows.length === 24, `כל 24 המקרים נטענו · ${rows.length}`);
    t(missing === 0, `כל 24 הכרטיסים נמצאו במאגר · חיפוש שנכשל היה מדווח "אף מחלקה" בשקט`);
    t(solvedToday > 0, `הבודק אינו "לא" תמיד · ${solvedToday} מתקבלים היום`);
    t(solvedToday < 24, 'והוא אינו "כן" תמיד');
    /* המחלקה שפותחת את מקרה 4 חייבת להיות AGENT · זה הזוג המתועד מורד→מרדן */
    const c4 = rows.find(r => r.n === 4);
    t(c4 && c4.hits.includes('AGENT'), 'מקרה 4 (סורר ← מורד) נפתח על ידי AGENT · הזוג המתועד');
    if (!ok) process.exitCode = 1;
  }
}

if (require.main === module) main();
