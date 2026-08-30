'use strict';
/* שער מקורות אסורים · האם מקור שהוחרג משפטית נמצא במה שנשלח ללומדים
 * ==================================================================
 *
 * ⭐ **מה השער טוען.** אף אחד משמונת המקורות שכלל א5 ב-`CLAUDE.md` אוסר אינו
 * מופיע **בתוכן שהלומד רואה**, ואף אחד מהאתרים שלהם אינו מוזכר בכתובת בשום
 * קובץ שהדפדפן מוריד.
 *
 * ⛔ **ומה הוא במפורש אינו טוען** — ראה «מה השער אינו תופס» בתחתית הקובץ.
 * שער שלא כתוב לו מה הוא מפספס נקרא כאילו הוא מכסה הכול, וזה בדיוק הכשל
 * שהתרחש כאן שלוש פעמים לפי `CLAUDE.md`.
 *
 * שתי שכבות, ולמה דווקא שתיים
 * ----------------------------
 * **‏1 · תוכן (`BANK`).** תשעת קובצי המאגר נטענים ב-`vm` והתוכן **המפוענח**
 * נסרק — כל מפתח וכל מחרוזת, לעומק. ⭐ זו הנקודה שהופכת את השער לאמין:
 * הערת קוד אינה תוכן. הקבצים האלה נושאים כותרת הצהרת-מקור שמזכירה את
 * המקורות האסורים **בשלילה** («⛔ אפס שימוש ב-Wiktionary · Quizlet …»),
 * וסריקת טקסט גולמי הייתה נופלת עליה. סריקה על המבנה המפוענח לא רואה
 * הערות בכלל, ולכן אין כאן לא רשימת היתר ולא מפענח הערות שאפשר לשבור.
 *
 * **‏2 · כתובות (`SHIPPED`).** כל קובץ שהדפדפן מוריד נסרק כטקסט גולמי, אבל
 * **רק אחרי דומיינים**. כתובת של ויקימילון או של קוויזלט אינה לגיטימית גם
 * בתוך הערה — ההצהרות בפרויקט מזכירות מקורות בשם, לעולם לא בכתובת.
 *
 * ⛔ למה תבניות עבריות «ברורות» הוצאו מכאן
 * -----------------------------------------
 * מדידה רחבה על המאגר הנשלח (30.8.2026) החזירה **38 שורות**, וכולן שקריות.
 * שמות המותג של חומרי ההכנה המסחריים הם **מילים עבריות רגילות**, והן נמצאות
 * במאגר בתור אוצר מילים אמיתי:
 *
 *   `כידון`  → data.js: «כידון המחובר לחבל ומשמש לציד ימי»   (= רומח, לא מותג)
 *   `קידום`  → data-en.js: «קידום; מבצע»                     (= promotion)
 *   `הישגים` → נמצא כתת-מחרוזת בתוך «ההישגים»
 *   `ברוש`   → נמצא כתת-מחרוזת בתוך «עכברוש»
 *   `מאגרים` → privacy.html: «מאגרים שמחוץ לגבולות המדינה»    (= databases)
 *   `קמפוס`  → משפטי דוגמה באנגלית עם המילה campus
 *
 * ⭐ ולכן: מותג שהוא גם מילה עברית **אינו** נכנס כאסימון בודד. הוא נכנס רק
 * כדומיין או כצירוף רב-מילים. שער שיורה על «קידום» היה מסמן פירוש אמיתי
 * כהפרה משפטית, וזה גרוע יותר מאשר לא לבדוק.
 *
 * ⚠ **וגבול מילה עברית אינו `\b`.** ‏`\b` ב-JavaScript מוגדר על תווי ASCII
 * בלבד, ולכן `/\bברוש\b/` **אינו** מונע את ההתאמה בתוך «עכברוש». הגבול
 * העברי נבנה כאן ב-`heb()` דרך lookaround על טווח האותיות.
 *
 * הרצה עצמאית:  node units_output/check_sources.js            (יוצא 1 אם נמצא)
 *               node units_output/check_sources.js --selftest (מוכיח שיניים)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* גבול מילה עברי אמיתי — ראה ההסבר על `\b` למעלה. */
const HEB = 'א-ת';
const heb = w => new RegExp(`(?<![${HEB}])${w}(?![${HEB}])`);

/* ── קובצי המאגר · נטענים ונסרקים כתוכן מפוענח ─────────────────────────── */
const BANK = [
  { file: 'data.js', global: 'UNIT_DATA' },
  { file: 'data-en.js', global: 'UNIT_DATA_EN' },
  { file: 'data-sent-en.js', global: 'SENT_EN' },
  { file: 'data-en-sentences.js', global: 'EX_SENT_EN' },
  { file: 'sentence-completion/sent-lex.js', global: 'SENT_LEX' },
  { file: 'enrank.js', global: 'EN_RANK' },
  { file: 'typo-lex.js', global: 'TYPO_LEX' },
  { file: 'leveltest.js', global: 'LEVEL_TEST' },
  { file: 'leveltest-he.js', global: 'LEVEL_TEST_HE' },
];

/* ── כל מה שהדפדפן מוריד · נסרק אחרי דומיינים בלבד ─────────────────────── */
const SHIPPED = [
  'index.html', 'app.js', 'config.js', 'store.js', 'sw.js',
  'data.js', 'data-en.js', 'data-sent-en.js', 'data-en-sentences.js',
  'sentence-completion/sent-lex.js',
  'enrank.js', 'typo-lex.js', 'leveltest.js', 'leveltest-he.js',
  'supabase.min.js', 'manifest.webmanifest',
  'accessibility.html', 'deletion.html', 'privacy.html', 'terms.html',
];

/* ── שמונת המקורות של כלל א5 ────────────────────────────────────────────
 * `content` — נבדק מול התוכן המפוענח של המאגר.
 * `domain`  — נבדק מול הטקסט הגולמי של כל קובץ נשלח.
 * `probe`   — מחרוזת שחייבת להיתפס. בלעדיה אי אפשר לדעת שהתבנית חיה. */
const SOURCES = [
  {
    name: 'Quizlet',
    content: [/quizlet/i, heb('קוויזלט'), heb('קויזלט')],
    domain: [/quizlet\.com/i, /quizlet\.net/i],
    probe: 'taken from Quizlet set 12',
    probeDomain: 'https://quizlet.com/il/123/set',
  },
  {
    name: 'Campus IL',
    content: [/campus[\s._-]?il\b/i, /קמפוס[\s-]?IL/i],
    domain: [/campus\.gov\.il/i, /campus\.org\.il/i],
    probe: 'CampusIL course glossary',
    probeDomain: 'https://campus.gov.il/course/x',
  },
  {
    name: 'Wiktionary / ויקימילון',
    content: [/wiktionary/i, /wikimilon/i, heb('ויקימילון'), heb('ויקימלון')],
    domain: [/wiktionary\.org/i, /wikt\.org/i],
    probe: 'לפי ויקימילון',
    probeDomain: 'https://he.wiktionary.org/wiki/x',
  },
  {
    name: 'Hebrew WordNet',
    content: [/wordnet/i, /word[\s._-]net\b/i, heb('וורדנט'), heb('ורדנט')],
    domain: [/wordnet\.[a-z]{2,}/i, /hebrewwordnet\.[a-z]{2,}/i],
    probe: 'synset from Hebrew WordNet',
    probeDomain: 'http://wordnet.cs.technion.ac.il/',
  },
  {
    name: 'האקדמיה ללשון',
    content: [
      /hebrew[\s._-]?academy/i, /academy of the hebrew language/i,
      /ה?אקדמיה ללשון/,
      /מונחי האקדמיה/,
      /מילון האקדמיה/,
    ],
    domain: [/hebrew-academy\.org\.il/i, /maagarim\.hebrew-academy/i, /terms\.hebrew-academy/i],
    probe: 'לפי האקדמיה ללשון העברית',
    probeDomain: 'https://hebrew-academy.org.il/keyword/x',
  },
  {
    name: 'מילון קליין',
    content: [
      /מילון קליין/,
      /קליין['׳’]?ס/,
      /klein['’]s comprehensive/i, /ernest klein/i, /klein.{0,20}etymological/i,
    ],
    domain: [/kleindictionary\.[a-z]{2,}/i],
    probe: "Ernest Klein's Comprehensive Etymological Dictionary",
    probeDomain: 'https://kleindictionary.com/x',
  },
  {
    name: 'חומרי הכנה מסחריים',
    content: [
      /חומרי הכנה מסחריים/,
      /ספר הכנה של/, /קורס הכנה של/,
      heb('אנקורי'), /\bankori\b/i, /high[\s-]?q\b/i,
    ],
    domain: [/kidum\.co\.il/i, /ankori\.co\.il/i, /high[\s-]?q\.co\.il/i, /psychometry\.co\.il/i],
    probe: 'מתוך ספר הכנה של המכון',
    probeDomain: 'https://www.kidum.co.il/vocab',
  },
  {
    name: 'מבחני עבר של המכון',
    content: [
      /מבחני עבר/, /מבחן עבר/,
      /שאלות ממבחני/,
      /המכון הארצי לבחינות/,
      /המרכז הארצי לבחינות/,
      /מאל["״']ו/, /\bNITE\b/,
    ],
    domain: [/nite\.org\.il/i],
    probe: 'שאלות ממבחני עבר',
    probeDomain: 'https://www.nite.org.il/psychometric',
  },
];

/* ── טעינת המאגר ────────────────────────────────────────────────────────── */
function loadBank() {
  const out = [];
  for (const b of BANK) {
    const p = path.join(ROOT, b.file);
    const w = {};
    vm.runInNewContext(fs.readFileSync(p, 'utf8'), { window: w, console, Math, Date, JSON });
    if (w[b.global] === undefined) {
      throw new Error(`${b.file}: הגלובל ${b.global} לא נוצר — עדכן את BANK`);
    }
    out.push({ file: b.file, global: b.global, data: w[b.global] });
  }
  return out;
}

/* כל מחרוזת בעץ — מפתחות **וגם** ערכים. מפתח הוא מילת המאגר עצמה. */
function walkStrings(node, visit, trail = '') {
  if (typeof node === 'string') { visit(node, trail); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => walkStrings(v, visit, `${trail}[${i}]`)); return; }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      visit(k, `${trail}.<key>`);
      walkStrings(node[k], visit, `${trail}.${k}`);
    }
  }
}

/* איחוד תבניות מקור לביטוי אחד — מהיר, ואת התבנית המדויקת שולפים רק בפגיעה. */
const union = regs => new RegExp(regs.map(r => r.source).join('|'), regs.some(r => r.flags.includes('i')) ? 'i' : '');

/* ── השכבות ─────────────────────────────────────────────────────────────── */
function scanContent(bank = loadBank()) {
  const hits = [];
  let strings = 0;
  const merged = SOURCES.map(s => ({ s, re: union(s.content) }));
  for (const b of bank) {
    walkStrings(b.data, (str, trail) => {
      strings++;
      for (const { s, re } of merged) {
        if (!re.test(str)) continue;
        const which = s.content.find(r => r.test(str));
        hits.push({ source: s.name, file: b.file, where: `${b.global}${trail}`,
          pattern: which ? which.source : re.source, text: str.slice(0, 140) });
      }
    });
  }
  return { hits, strings };
}

function scanDomains() {
  const hits = [];
  let bytes = 0;
  for (const f of SHIPPED) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) { hits.push({ source: '(קובץ חסר)', file: f, line: 0, pattern: '-', text: `${f} לא נמצא — עדכן את SHIPPED` }); continue; }
    const src = fs.readFileSync(p, 'utf8');
    bytes += src.length;
    const lines = src.split('\n');
    for (const s of SOURCES) {
      for (const re of s.domain) {
        lines.forEach((line, i) => {
          if (re.test(line)) hits.push({ source: s.name, file: f, line: i + 1, pattern: re.source, text: line.trim().slice(0, 140) });
        });
      }
    }
  }
  return { hits, bytes };
}

function scanAll() {
  const c = scanContent();
  const d = scanDomains();
  return { hits: c.hits.concat(d.hits), strings: c.strings, bytes: d.bytes, content: c.hits, domains: d.hits };
}

/* ── שיניים · הוכחה שהתבניות חיות ─────────────────────────────────────────
 * כל מקור חייב לתפוס את ה-probe שלו. אם תבנית נשברת בעריכה עתידית, זה נופל
 * כאן — במקום להמשיך להחזיר «אפס פגיעות» על מאגר שכבר נגוע. */
function selftest() {
  const bad = [];
  for (const s of SOURCES) {
    if (!union(s.content).test(s.probe)) bad.push(`${s.name}: התבנית לא תפסה את «${s.probe}»`);
    if (!union(s.domain).test(s.probeDomain)) bad.push(`${s.name}: הדומיין לא נתפס — «${s.probeDomain}»`);
  }
  /* והשלמה: התוכן המפוענח באמת נסרק לעומק, כולל מפתחות. */
  const planted = { 'אבג': { sub: ['clean', 'copied from Quizlet'] } };
  let seen = 0, caught = false;
  walkStrings(planted, str => { seen++; if (/quizlet/i.test(str)) caught = true; });
  if (seen < 4) bad.push(`walkStrings לא הגיע לכל המחרוזות (${seen})`);
  if (!caught) bad.push('walkStrings לא הגיע למחרוזת מקוננת');
  /* וגבול המילה העברי באמת חוסם תת-מחרוזת. */
  if (heb('ברוש').test('עכברוש')) bad.push('heb() אינו חוסם תת-מחרוזת');
  if (!heb('ברוש').test('עץ ברוש גבוה')) bad.push('heb() חוסם גם מילה שלמה');
  return bad;
}

/* ── CLI ────────────────────────────────────────────────────────────────── */
if (require.main === module) {
  if (process.argv.includes('--selftest')) {
    const bad = selftest();
    if (bad.length) { console.error('SELFTEST נכשל:\n' + bad.join('\n')); process.exit(1); }
    console.log(`SELFTEST עבר — ${SOURCES.length} מקורות, כל אחד תופס את ה-probe שלו.`);
    process.exit(0);
  }
  const r = scanAll();
  const w = Math.max(...SOURCES.map(s => s.name.length));
  console.log(`נסרקו: ${r.strings.toLocaleString()} מחרוזות תוכן · ${SHIPPED.length} קבצים נשלחים (${(r.bytes / 1024).toFixed(0)} KB)\n`);
  for (const s of SOURCES) {
    const n = r.hits.filter(h => h.source === s.name).length;
    console.log(`  ${n === 0 ? '✓' : '✗'} ${s.name.padEnd(w)}  ${n}`);
  }
  const other = r.hits.filter(h => !SOURCES.some(s => s.name === h.source));
  other.forEach(h => console.log(`  ! ${h.text}`));
  console.log(`\nסה"כ: ${r.hits.length}`);
  if (r.hits.length) {
    console.log('\nפגיעות:');
    r.hits.slice(0, 40).forEach(h => console.log(`  [${h.source}] ${h.file} ${h.where || ':' + h.line}\n      /${h.pattern}/  ←  ${h.text}`));
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { SOURCES, BANK, SHIPPED, ROOT, loadBank, walkStrings, scanContent, scanDomains, scanAll, selftest, union, heb };

/* ── ⛔ מה השער אינו תופס ─────────────────────────────────────────────────
 * ‏1 · **העתקה בלי שם.** פירוש שהועתק ממקור אסור ולא נושא את שמו או את
 *      כתובתו — עובר. זיהוי כזה הוא השוואת דמיון מול המקור, לא grep, והוא
 *      בדיוק מה שהכלי הסטטיסטי ניסה לעשות ונכשל בו (שורת הבקרה שלו הגיעה
 *      ל-2.49% כשהחוק שלו עצמו דורש פי 10 מרף הרעש).
 * ‏2 · **הערות קוד.** שכבת התוכן אינה רואה אותן במכוון (שם יושבות הצהרות
 *      «אפס שימוש ב-…»). שכבת הדומיינים כן סורקת אותן.
 * ‏3 · **מותג שהוא מילה עברית רגילה** — `קידום` · `כידון` · `הישגים` · `ברוש`.
 *      הוצאו בכוונה אחרי שנמדדו כפירושים אמיתיים במאגר. חומרי הכנה מסחריים
 *      הם לכן הקטגוריה החלשה כאן, ומכוסים בעיקר בדומיינים.
 * ‏4 · **`supabase.min.js`** נסרק אחרי דומיינים בלבד ככל קובץ נשלח; הוא
 *      ספרייה חיצונית ואינו מאגר תוכן.
 * ‏5 · **קובץ שנוסף למאגר ולא נרשם ב-`BANK`/`SHIPPED`** לא ייסרק. הבדיקה
 *      ב-`tests/` מאמתת שכל קובץ ברשימות קיים, אך אינה יכולה לדעת על קובץ
 *      חדש שאיש לא רשם. */
