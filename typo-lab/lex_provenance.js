'use strict';
/* מאיפה הגיעו המילים שבלקסיקון הנשלח · typo-lab/lex_provenance.js
 *
 * הממצא שהוליד את הקובץ: `typo-lex.js` הנשלח מכיל 29,516 מילים עבריות ו-6,375
 * אנגליות, ואילו `build_runtime_lexicon.js` — גם היום וגם בעץ העבודה של הקומיט
 * שבו הנכס נכתב לאחרונה (e43f1c1) — מייצר 29,296 ו-5,928. הפרש של 667 מילים
 * שאין להן מסלול ייצור בריפו.
 *
 * CLAUDE.md · כלל החשיפה המשפטית: אסור שייכנס לפרויקט חומר שאינו חוקי לשימוש, וכל
 * ספק נעצר ומוצג. שלושה קבצים הוחרגו במפורש מהלקסיקון בגלל פרובננס הפוך
 * (`manifest.runtimeLexicon.excludedSources`). השאלה הישירה: האם 667 המילים
 * העודפות הן מהם.
 *
 * איך נמדד · מסנן Bloom אינו ניתן למניית-חברות, אבל כן ניתן לשאילתה:
 *
 *   1. בונים את הקבוצה המדויקת שהבנאי מייצר היום (exactSets).
 *   2. אוספים מילים מקובץ מקור, מנרמלים באותו נרמול בדיוק.
 *   3. שומרים רק את אלה שאינן בקבוצה המדויקת · אלה מילים שהבנאי לא הכניס.
 *   4. שואלים עליהן את המסנן הנשלח.
 *
 * ===========================================================================
 * שני ליקויים שנמצאו בכלי הזה עצמו ב-29.8.2026 · ומה נעשה בכל אחד
 * ===========================================================================
 *
 * [א] הוא דיווח «נקי» כשהוא כלל לא בדק. קובצי ההשוואה יושבים תחת `דוחות/`,
 * שמסוננת מגיט. בעץ שאין בו אותם `readMany` דילג עליהם בשקט, הקבוצה יצאה ריקה,
 * והשורה הודפסה 0.00% — שנקרא «נקי». זה כבר הטעה בפועל: דווח ששני מקורות נקיים,
 * ואחרי שהקבצים הועתקו ידנית שניהם הראו ערכים.
 * התיקון: כל דפוס שאינו מתרגם לקובץ אחד לפחות = כשל מפורש ויציאה 1. אין מסלול
 * שבו «לא בדקתי» מודפס כמספר. גם קריאה שנכשלת על קובץ שקיים היא כשל ולא
 * `continue` שקט. וגם מדגם קטן מדי (MIN_N) מודפס כ«לא נמדד», לא כאפס.
 *
 * [ב] חוק הקריאה לא התקיים אפילו על הבקרה של הכלי. הכלי כתב «שיעור גבוה מרף
 * הרעש בסדר גודל = תרם», והשווה הכול מול ה-FPR של מחרוזות אקראיות (~0.6%).
 * זה הבסיס השגוי: מילים עבריות אמיתיות שמחוץ לקבוצה המדויקת פוגעות במסנן הנשלח
 * פי 3 עד 5 מזה, בלי קשר לשאלה אם המקור שלהן תרם.
 * מה שנמדד: טקסט עברי בריפו שאינו ברשימת המקורות של הבנאי (privacy.html,
 * METHODOLOGY.md, STATE.md ...) פוגע ב-2.09% עד 2.95% — כלומר x3.5 עד x4.9 מרף
 * המחרוזות האקראיות. שלושת המוחרגים יושבים על 1.44% עד 2.35%, כלומר מתחת לרצפה
 * של מקור שידוע שלא תרם, והבקרה החיובית יושבת על 2.49%, בתוך אותה רצפה.
 * התיקון: רף הרעש הוא עכשיו בקרה שלילית של מילים אמיתיות ולא מחרוזות אקראיות,
 * והפרדה נטענת רק אם הבקרה החיובית עוברת את הרצפה בפועל. כשהיא לא עוברת, הכלי
 * מדפיס «המדידה אינה מפרידה בטווח הזה» ואינו מדביק תווית «תרם» או «לא תרם» לאף
 * מקור. FPR המחרוזות עדיין מודפס, מסומן במפורש כמאפיין של המסנן ולא כרף.
 *
 * הקובץ הזה קורא בלבד. הוא אינו כותב נכס, אינו משנה נכס, ואינו מכריע · הכרעה על
 * חומר שהוחרג משפטית היא של חגי.
 */

const fs = require('fs');
const path = require('path');

const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');
const die = s => { process.stdout.write(s + '\n'); process.exit(1); };

const BR = require('./build_runtime_lexicon.js');
const { getCtx } = require('./lib/ctx.js');
const { MIN, fileList } = require('./lib/lexicon.js');

const NIQQUD = /[֑-ׇ]/g;
const HE_WORD = /[א-ת]+/g;
const EN_WORD = /[A-Za-z]+/g;

/* מתחת לזה שיעור אינו שיעור. 28 מילים אנגליות שכולן החטיאו אינן «0.00% נקי»,
   הן מדגם שאינו יכול להראות דבר. */
const MIN_N = 400;

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

/* ליקוי א · כאן היה ה«נקי» העיוור. כל דפוס מחזיר גם את הקבצים וגם את הסיבה
   שבגללה הוא לא החזיר כלום. דפוס בלי אף קובץ אינו קבוצה ריקה — הוא כשל. */
function readMany(patterns) {
  const files = [], missing = [];
  for (const pat of patterns) {
    if (pat.includes('*')) {
      const dir = path.join(ROOTD, path.dirname(pat));
      const rx = new RegExp('^' + path.basename(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      let ents = null;
      try { ents = fs.readdirSync(dir); } catch (e) { missing.push(pat + ' · אין תיקייה (' + e.code + ')'); continue; }
      const before = files.length;
      for (const e of ents.sort()) if (rx.test(e)) files.push(path.join(dir, e));
      if (files.length === before) missing.push(pat + ' · התיקייה קיימת, אף קובץ לא תואם');
    } else {
      const f = path.join(ROOTD, pat);
      if (fs.existsSync(f)) files.push(f); else missing.push(pat + ' · קובץ חסר');
    }
  }
  return { files, missing };
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

/* מלכודת שנתפסה כאן ב-29.8.2026 · Node v24.16.0 · אל תחזיר שבר מהפונקציה הזאת.
   כשהאובייקט המוחזר החזיק שדה `pct` שהוא שבר, הקריאה **הבאה** ל-rate דרסה את
   הערך של הקריאה הקודמת: הקבוצה השלישית קיבלה pct=0 עם hit=223 ו-n=10072,
   כלומר הודפס «0.00%» על 223 פגיעות — עוד «נקי» שקרי, בדיוק הליקוי שהקובץ הזה
   בא לתקן. שני שדות שלמים אינם נדרסים, ולכן השבר מחושב בנקודת השימוש. */
function rate(api, lang, words) {
  let hit = 0;
  for (const w of words) if (api.lookup(w, lang)) hit++;
  return { n: words.length, hit, ok: words.length >= MIN_N };
}

/* השיעור · תמיד מחושב מחדש משני שלמים, לעולם לא נשמר. */
const P = r => (r && r.n ? r.hit / r.n : 0);
const pctOf = r => r.ok ? (100 * P(r)).toFixed(2) + '% (' + r.hit + ')' : 'לא נמדד · n=' + r.n + ' < ' + MIN_N;

/* === הקבוצות ===
   kind: test = הנבדק · pos = בקרה חיובית (מקור שהבנאי סורק) ·
   neg = בקרה שלילית (טקסט עברי אמיתי שאינו ברשימת המקורות של הבנאי).
   ה-neg הוא התיקון של ליקוי ב · הוא הרצפה שמולה נמדד הכול. */
const GROUPS = [
  { kind: 'test', name: 'מוחרג · 01-גלם.tsv', pats: ['דוחות/מאגר-נקי/01-גלם.tsv'] },
  { kind: 'test', name: 'מוחרג · 19-צירופים-מהרשת.tsv', pats: ['דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv'] },
  { kind: 'test', name: 'מוחרג · pipeline_output/*.json', pats: ['pipeline_output/*.json'] },
  { kind: 'pos', name: 'בקרה חיובית · נסרק (sentence-completion)', pats: ['sentence-completion/sentences-en-v3.js'] },
  { kind: 'neg', name: 'בקרה שלילית · טקסט ממשק שאינו נסרק', pats: ['privacy.html', 'deletion.html', 'accessibility.html'] },
  { kind: 'neg', name: 'בקרה שלילית · תיעוד הפרויקט שאינו נסרק', pats: ['METHODOLOGY.md', 'STATE.md', 'CLAUDE.md', 'README.txt', 'DEPLOY.md'] },
];

/* שיניים לבקרה השלילית · אם מישהו יוסיף מחר אחד מהקבצים האלה לרשימת המקורות של
   הבנאי, הוא יפסיק להיות בקרה שלילית — והכלי חייב ליפול, לא להמשיך למדוד. */
function assertNegAreNotSources(resolved) {
  const src = new Set(fileList().map(f => path.resolve(f)));
  const bad = [];
  for (const g of GROUPS) {
    if (g.kind !== 'neg') continue;
    for (const f of resolved.get(g.name).files) if (src.has(path.resolve(f))) bad.push(f);
  }
  if (bad.length) die('[עצירה] בקרה שלילית פסולה · הקבצים האלה כן ברשימת המקורות של הבנאי:\n· ' + bad.join('\n· '));
}

function main() {
  const api = shippedLex();
  say('# פרובננס הלקסיקון הנשלח');
  say('');

  /* ליקוי א · שער הקלט. קודם מוודאים שיש מה למדוד, ורק אחר כך מודדים. */
  const resolved = new Map();
  const missing = [];
  for (const g of GROUPS) {
    const r = readMany(g.pats);
    resolved.set(g.name, r);
    for (const m of r.missing) missing.push(g.name + '  <--  ' + m);
  }
  if (missing.length) {
    die('[עצירה] קובץ חסר · הבדיקה לא רצה.\n\n· ' + missing.join('\n· ') +
        '\n\nזה אינו «0.00%» ואינו «נקי» — לא נמדד דבר על המקורות האלה.' +
        '\nקובצי `דוחות/` מסוננים מגיט; מי שמריץ בעץ נקי חייב להביא אותם ידנית.');
  }
  assertNegAreNotSources(resolved);

  const ex = BR.exactSets();
  const EX = { he: new Set(ex.sets.he), en: new Set(ex.sets.en) };
  say(`הקבוצה שהבנאי מייצר היום · עברית ${EX.he.size} · אנגלית ${EX.en.size}`);
  say('');

  /* מאפיין של המסנן · לא רף להשוואה מול מילים אמיתיות. ראה ליקוי ב. */
  const lensHe = Array.from(EX.he).slice(0, 5000).map(w => w.length);
  const lensEn = Array.from(EX.en).slice(0, 5000).map(w => w.length);
  const fprHe = rate(api, 'he', nonWords('he', EX.he, 60000, lensHe));
  const fprEn = rate(api, 'en', nonWords('en', EX.en, 60000, lensEn));
  say('## מאפיין המסנן · FPR על מחרוזות אקראיות');
  say(`עברית ${(100 * P(fprHe)).toFixed(3)}% (${fprHe.hit}/${fprHe.n}) · אנגלית ${(100 * P(fprEn)).toFixed(3)}% (${fprEn.hit}/${fprEn.n})`);
  say('אזהרה: זה שיעור של מחרוזות אקראיות. מילים אמיתיות פוגעות הרבה מעליו גם כשהמקור לא תרם, ולכן זה אינו הרף.');
  say('');

  say('## שיעור פגיעה · מילים שהבנאי אינו מכניס');
  say('');
  say('| מקור | קבצים | עברית מחוץ לקבוצה | פגיעה | אנגלית מחוץ לקבוצה | פגיעה |');
  say('|---|---|---|---|---|---|');

  const findings = [];
  for (const g of GROUPS) {
    const files = resolved.get(g.name).files;
    const H = new Set(), E = new Set();
    for (const f of files) {
      /* הקובץ כבר אומת כקיים · קריאה שנכשלת כאן היא תקלה אמיתית, לא דילוג. */
      const t = fs.readFileSync(f, 'utf8');
      const w = wordsOf(t);
      for (const x of w.he) if (!EX.he.has(x)) H.add(x);
      for (const x of w.en) if (!EX.en.has(x)) E.add(x);
    }
    const rh = rate(api, 'he', Array.from(H));
    const re = rate(api, 'en', Array.from(E));
    say(`| ${g.name} | ${files.length} | ${rh.n} | **${pctOf(rh)}** | ${re.n} | **${pctOf(re)}** |`);
    findings.push({ group: g.name, kind: g.kind, files: files.length, he: rh, en: re });
  }

  /* שער עקביות · אם שדה נדרס, המספרים מפסיקים להיות עקביים ואנחנו נופלים כאן. */
  for (const f of findings) for (const L of ['he', 'en'])
    if (!(f[L].hit >= 0 && f[L].hit <= f[L].n)) die('[עצירה] מספרים לא עקביים ב-' + f.group + ' · ' + L + ' · ' + JSON.stringify(f[L]));

  /* === הקריאה · ליקוי ב === */
  const negs = findings.filter(f => f.kind === 'neg');
  const poss = findings.filter(f => f.kind === 'pos');
  const floor = L => {
    const v = negs.filter(f => f[L].ok).map(f => P(f[L]));
    return v.length ? Math.max.apply(null, v) : NaN;
  };
  const flHe = floor('he'), flEn = floor('en');

  say('');
  say('## קריאה');
  say('');
  say('הרצפה היא הבקרה השלילית — מילים אמיתיות ממקור שאינו ברשימת הסריקה של הבנאי:');
  say(`עברית ${Number.isFinite(flHe) ? (100 * flHe).toFixed(2) + '%' : 'לא נמדדה'} · אנגלית ${Number.isFinite(flEn) ? (100 * flEn).toFixed(2) + '%' : 'לא נמדדה'}.`);
  say('');

  /* הכלל בקוד, לא בפרוזה: הפרדה נטענת רק אם הבקרה החיובית עוברת את הרצפה. */
  const sep = {
    he: poss.some(p => p.he.ok && Number.isFinite(flHe) && P(p.he) > flHe),
    en: poss.some(p => p.en.ok && Number.isFinite(flEn) && P(p.en) > flEn)
  };

  for (const L of ['he', 'en']) {
    const label = L === 'he' ? 'עברית' : 'אנגלית';
    const fl = L === 'he' ? flHe : flEn;
    if (!sep[L]) {
      const p = poss[0];
      const pv = p && p[L].ok ? (100 * P(p[L])).toFixed(2) + '%' : 'לא נמדדה';
      say(`[${label}] המדידה אינה מפרידה בטווח הזה. הבקרה החיובית (${pv}) אינה עוברת את הרצפה` +
          `${Number.isFinite(fl) ? ' (' + (100 * fl).toFixed(2) + '%)' : ''}, ולכן שיעור שנמצא מתחתיה או סביבה אינו ראיה לכאן ולכאן.`);
      say(`[${label}] ואין כאן תווית «תרם» או «לא תרם» לאף מקור. שלילה תדרוש מדידה שמפרידה, לא את זו.`);
    } else {
      say(`### ${label} · המדידה מפרידה · מעל הרצפה = תרם`);
      for (const f of findings.filter(x => x.kind === 'test')) {
        if (!f[L].ok) { say(`· ${f.group} · ${label} · מדגם קטן מדי (n=${f[L].n}) · לא נמדד`); continue; }
        say(`· ${f.group} · ${label} ${(100 * P(f[L])).toFixed(2)}% · ${P(f[L]) > fl ? 'מעל הרצפה · תרם' : 'ברצפה או מתחתיה · לא נבדל'}`);
      }
    }
    say('');
  }

  say('### המספרים כפי שהם · שיעור ביחס לרצפת הבקרה השלילית');
  for (const f of findings) {
    const h = f.he.ok && flHe > 0 ? 'x' + (P(f.he) / flHe).toFixed(2) : 'לא נמדד';
    const e = f.en.ok && Number.isFinite(flEn) && flEn > 0 ? 'x' + (P(f.en) / flEn).toFixed(2) : 'לא נמדד';
    say(`· ${f.group} · עברית ${h} · אנגלית ${e}`);
  }

  fs.writeFileSync(path.join(__dirname, 'out', 'lex-provenance.json'),
    JSON.stringify({
      exact: { he: EX.he.size, en: EX.en.size },
      randomStringFpr: { he: { n: fprHe.n, hit: fprHe.hit, pct: +P(fprHe).toFixed(6) }, en: { n: fprEn.n, hit: fprEn.hit, pct: +P(fprEn).toFixed(6) } },
      realWordFloor: { he: Number.isFinite(flHe) ? flHe : null, en: Number.isFinite(flEn) ? flEn : null },
      separates: sep,
      findings: findings.map(f => ({
        group: f.group, kind: f.kind, files: f.files,
        he: { n: f.he.n, hit: f.he.hit, ok: f.he.ok, pct: +P(f.he).toFixed(6) },
        en: { n: f.en.n, hit: f.en.hit, ok: f.en.ok, pct: +P(f.en).toFixed(6) }
      }))
    }, null, 1));
  say('');
  say('נכתב out/lex-provenance.json');
}

if (require.main === module) main();
