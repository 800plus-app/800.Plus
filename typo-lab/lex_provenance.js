'use strict';
/* מאיפה הגיעו המילים שבלקסיקון הנשלח · typo-lab/lex_provenance.js
 *
 * הממצא שהוליד את הקובץ: ‏`typo-lex.js` הנשלח מכיל ‎29,516 מילים עבריות ו-6,375
 * אנגליות, ואילו `build_runtime_lexicon.js` — גם היום וגם **בעץ העבודה של הקומיט
 * שבו הנכס נכתב לאחרונה** (‏e43f1c1) — מייצר ‎29,296 ו-5,928. הפרש של ‎667 מילים
 * שאין להן מסלול ייצור בריפו.
 *
 * ‏CLAUDE.md · כלל החשיפה המשפטית: אסור שייכנס לפרויקט חומר שאינו חוקי לשימוש, וכל
 * ספק נעצר ומוצג. שלושה קבצים הוחרגו במפורש מהלקסיקון בגלל פרובננס הפוך
 * (‏`manifest.runtimeLexicon.excludedSources`). השאלה הישירה: האם 667 המילים
 * העודפות הן מהם.
 *
 * איך נמדד · מסנן Bloom אינו ניתן למניית-חברות, אבל **כן** ניתן לשאילתה:
 *
 *   1. בונים את הקבוצה המדויקת שהבנאי מייצר היום (‏exactSets).
 *   2. אוספים מילים מקובץ מקור, מנרמלים באותו נרמול בדיוק.
 *   3. שומרים רק את אלה ש**אינן** בקבוצה המדויקת · אלה מילים שהבנאי לא הכניס.
 *   4. שואלים עליהן את המסנן הנשלח.
 *
 * אם המקור לא תרם ללקסיקון, שיעור הפגיעות שלו חייב להיות שווה ל-FPR של המסנן
 * (‏~0.5%). שיעור גבוה משמעותית = המילים האלה **בפנים**, כלומר המקור תרם.
 *
 * בקרות · בלעדיהן המספר חסר משמעות:
 *   · אי-מילים אקראיות · מודדות את ה-FPR בפועל על אותו מסנן ובאותה הרצה.
 *   · מקור **נסרק** (למשל sentence-completion) · מילותיו שמחוץ לקבוצה המדויקת
 *     נובעות רק מחיסור צורות המאגר, ולכן הוא בקרה חיובית חלשה.
 *
 * הקובץ הזה **קורא בלבד**. הוא אינו כותב, אינו משנה נכס, ואינו מכריע · הכרעה על
 * חומר שהוחרג משפטית היא של חגי.
 */

const fs = require('fs');
const path = require('path');

const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');

const BR = require('./build_runtime_lexicon.js');
const { getCtx } = require('./lib/ctx.js');
const { MIN } = require('./lib/lexicon.js');

const NIQQUD = /[֑-ׇ]/g;
const HE_WORD = /[א-ת]+/g;
const EN_WORD = /[A-Za-z]+/g;

/* המסנן הנשלח · הקובץ שיושב בשורש ונטען בדפדפן, לא זה של המעבדה. */
function shippedLex() {
  const p = path.join(ROOTD, 'typo-lex.js');
  const api = require(p);
  if (!api || typeof api.lookup !== 'function') throw new Error('typo-lex.js בלי lookup');
  return api;
}

function wordsOf(text) {
  const he = getCtx('he'), en = getCtx('en');
  const t = String(text).replace(NIQQUD, '');
  const H = new Set(), E = new Set();
  const hm = t.match(HE_WORD);
  if (hm) for (const w of hm) { const n = he.norm(w); if (n && n.length >= MIN) H.add(n); }
  const em = t.match(EN_WORD);
  if (em) for (const w of em) { const n = en.normEn(w); if (n && n.length >= MIN) E.add(n); }
  return { he: H, en: E };
}

function readMany(patterns) {
  const out = [];
  for (const pat of patterns) {
    if (pat.includes('*')) {
      const dir = path.join(ROOTD, path.dirname(pat));
      const rx = new RegExp('^' + path.basename(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      let ents = [];
      try { ents = fs.readdirSync(dir); } catch (e) { continue; }
      for (const e of ents.sort()) if (rx.test(e)) out.push(path.join(dir, e));
    } else {
      const f = path.join(ROOTD, pat);
      if (fs.existsSync(f)) out.push(f);
    }
  }
  return out;
}

/* אי-מילים · אותה שיטה של הבנאי, כדי שה-FPR הנמדד כאן יהיה בר-השוואה. */
const HE_A = 'אבגדהוזחטיכלמנסעפצקרשת';
const EN_A = 'abcdefghijklmnopqrstuvwxyz';
function nonWords(lang, exact, n, lens) {
  let s = 0x2f6e2b1 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const alpha = lang === 'en' ? EN_A : HE_A;
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const L = lens[Math.floor(rnd() * lens.length)];
    let w = '';
    for (let i = 0; i < L; i++) w += alpha[Math.floor(rnd() * alpha.length)];
    if (!exact.has(w)) out.push(w);
  }
  return out;
}

function rate(api, lang, words) {
  let hit = 0;
  for (const w of words) if (api.lookup(w, lang)) hit++;
  return { n: words.length, hit, pct: words.length ? hit / words.length : 0 };
}

function main() {
  const api = shippedLex();
  say('# פרובננס הלקסיקון הנשלח');
  say('');

  const ex = BR.exactSets();
  const EX = { he: new Set(ex.sets.he), en: new Set(ex.sets.en) };
  say(`הקבוצה שהבנאי מייצר היום · עברית ${EX.he.size} · אנגלית ${EX.en.size}`);
  say('');

  /* בקרה · ה-FPR בפועל, על אותו מסנן ובאותה הרצה. */
  const lensHe = Array.from(EX.he).slice(0, 5000).map(w => w.length);
  const lensEn = Array.from(EX.en).slice(0, 5000).map(w => w.length);
  const fprHe = rate(api, 'he', nonWords('he', EX.he, 60000, lensHe));
  const fprEn = rate(api, 'en', nonWords('en', EX.en, 60000, lensEn));
  say('## בקרה · FPR של המסנן הנשלח');
  say(`עברית ${(100 * fprHe.pct).toFixed(3)}% (${fprHe.hit}/${fprHe.n}) · אנגלית ${(100 * fprEn.pct).toFixed(3)}% (${fprEn.hit}/${fprEn.n})`);
  say('');

  const GROUPS = [
    { name: 'מוחרג · 01-גלם.tsv', pats: ['דוחות/מאגר-נקי/01-גלם.tsv'] },
    { name: 'מוחרג · 19-צירופים-מהרשת.tsv', pats: ['דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv'] },
    { name: 'מוחרג · pipeline_output/*.json', pats: ['pipeline_output/*.json'] },
    { name: 'בקרה · נסרק (sentence-completion)', pats: ['sentence-completion/sentences-en-v3.js'] },
  ];

  say('## שיעור פגיעה · מילים שהבנאי **אינו** מכניס');
  say('');
  say('| מקור | קבצים | עברית מחוץ לקבוצה | פגיעה | אנגלית מחוץ לקבוצה | פגיעה |');
  say('|---|---|---|---|---|---|');

  const findings = [];
  for (const g of GROUPS) {
    const files = readMany(g.pats);
    const H = new Set(), E = new Set();
    for (const f of files) {
      let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
      const w = wordsOf(t);
      for (const x of w.he) if (!EX.he.has(x)) H.add(x);
      for (const x of w.en) if (!EX.en.has(x)) E.add(x);
    }
    const rh = rate(api, 'he', Array.from(H));
    const re = rate(api, 'en', Array.from(E));
    say(`| ${g.name} | ${files.length} | ${rh.n} | **${(100 * rh.pct).toFixed(2)}%** (${rh.hit}) | ${re.n} | **${(100 * re.pct).toFixed(2)}%** (${re.hit}) |`);
    findings.push({ group: g.name, files: files.length, he: rh, en: re });
  }

  say('');
  say('## קריאה');
  say('');
  say(`רף הרעש הוא ה-FPR שנמדד למעלה · עברית ${(100 * fprHe.pct).toFixed(3)}% · אנגלית ${(100 * fprEn.pct).toFixed(3)}%.`);
  say('שיעור פגיעה שאינו נבדל ממנו = המקור **לא** תרם. שיעור גבוה ממנו בסדר גודל = תרם.');
  say('');
  for (const f of findings) {
    const hOver = fprHe.pct > 0 ? f.he.pct / fprHe.pct : 0;
    const eOver = fprEn.pct > 0 ? f.en.pct / fprEn.pct : 0;
    say(`· ${f.group} · עברית ×${hOver.toFixed(1)} מהרעש · אנגלית ×${eOver.toFixed(1)} מהרעש`);
  }

  fs.writeFileSync(path.join(__dirname, 'out', 'lex-provenance.json'),
    JSON.stringify({ exact: { he: EX.he.size, en: EX.en.size }, fpr: { he: fprHe, en: fprEn }, findings }, null, 1));
  say('');
  say('נכתב out/lex-provenance.json');
}

if (require.main === module) main();
