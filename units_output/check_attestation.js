'use strict';
/* שער טבלאות ההוכחה · units_output/check_attestation.js
 *
 *   node units_output/check_attestation.js            → פסק דין
 *   node units_output/check_attestation.js --selftest → הזרקת שורות מורעלות ובדיקה שהוא נופל
 *
 * ===== למה השער הזה נכתב =====
 *
 * ⛔ `check_all.py` אינו מזכיר `attestation` אף פעם, ואף בדיקה ב-`tests/` לא קראה
 * את הקבצים האלה. שלושה שינויים רצופים בהם עברו על ירוק מלא · **ירוק אמיתי,
 * ועיוור לגמרי לקובץ.** שער שאיש לא מריץ עליו הוא בדיוק המקום שבו שגיאה שורדת.
 *
 * ===== מה הוא תופס =====
 *
 *   1. **שורה בלי מקור** · עמודת המקור או הרפרנס ריקה. הוכחה שאין לה מקור אינה הוכחה.
 *   2. **מקור אסור** לפי כלל א5: ויקימילון · האקדמיה ללשון · Quizlet · Campus IL ·
 *      Hebrew WordNet · חומרי הכנה מסחריים · מבחני עבר.
 *   3. **רישיון שאינו נחלת הכלל/CC0** בטבלת ה-299, שבה ההבטחה היא «נחלת הכלל בלבד».
 *      ⚠ ‏`CC-BY-SA` הוא הכשל הריאלי כאן: זו **ברירת המחדל של ספריא** לפסוקי תנ"ך,
 *      ומי שמושך בלי לציין גרסה מקבל אותו בלי לשים לב.
 *   4. **הפניה ללקסמה שהיא מילה אחרת** · שלוש שכבר נתפסו ידנית, ננעצות כאן כדי
 *      שלא יחזרו: `L217076` (שם התואר «פעמי») · `L204788` (הפועל «אימת») ·
 *      `L219805` (הפועל «שפל»).
 *
 * ===== מה הוא **לא** תופס, במכוון =====
 *
 * ⛔ הוא **אינו** יוצא לרשת ואינו מאמת שהרפרנס קיים. שער שתלוי ברשת נכשל כשהרשת
 * נופלת, ואז מכבים אותו. האימות מול המקור החי הוא עבודת סבב, לא שער.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'attestation');
const SELFTEST = process.argv.includes('--selftest');

/* ===== מפת העמודות · ולמה היא נדרשת =====
 *
 * ⛔ הגרסה הראשונה קראה **רק** `attestation/*.tsv`, והניחה שהמילה יושבת בעמודה 1,
 * המקור ב-3 והרפרנס ב-4. ‏`gloss-phase/gloss-status.tsv` בנוי אחרת לגמרי — המילה
 * בעמודה 4, המקור בעמודה 6 («מוצא») והרפרנס בעמודה 10 — ולכן הוא היה **בלתי נראה
 * לשער לחלוטין**, ו-38 הפרות ישבו בו בזמן שהשער החזיר ירוק.
 * ⭐ **שער שעיוור בדיוק במקום שבו נמצאה ההפרה אינו שער.**
 *
 * ⚠ ולכן העמודות מוצהרות לכל קובץ במפורש, ולא נלקחות מברירת מחדל: קובץ שנוסף
 * בלי הצהרה ייקרא בעמודות הלא נכונות ויחזיר «אפס ממצאים» — כלומר ירוק מזויף. */
const LAYOUT = {                       /* קובץ → { word, source, ref } · 1-based */
  'gloss-status.tsv': { word: 4, source: 6, ref: 10 },
  '*':                { word: 1, source: 3, ref: 4 },
};
/* הקבצים שהשער קורא · מחוץ ל-attestation/ צריך נתיב מלא */
const EXTRA = [path.join(__dirname, 'gloss-phase', 'gloss-status.tsv')];
/* אזכורי מקור אסור מחוץ לעמודת המקור · נספרים, לא מפילים */
let NOTE = [];

/* כלל א5 · המקורות האסורים, בכתיב שמופיע בפועל בקבצים */
const FORBIDDEN = [
  /ויקימילון/, /wiktionary/i,
  /האקדמיה ללשון/, /academy of the hebrew/i,
  /quizlet/i, /campus\s*il/i, /קמפוס\s*il/i,
  /hebrew\s*wordnet/i, /wordnet העברי/,
  /מבחני עבר/, /חומרי הכנה/,
];
/* רישיונות שאינם נחלת הכלל · CC-BY-SA הוא ברירת המחדל של ספריא ולכן הוא הסכנה */
const BAD_LICENSE = [/CC[-\s]?BY[-\s]?SA/i, /CC[-\s]?BY[-\s]?NC/i, /all rights reserved/i, /כל הזכויות שמורות/];
/* לקסמות שכבר נתפסו כמפנות למילה אחרת */
const BAD_LEXEME = { L217076: 'שם התואר «פעמי»', L204788: 'הפועל «אימת»', L219805: 'הפועל «שפל»' };

function rows(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  const head = lines.shift().split('\t');
  return { head, lines: lines.map((l, i) => ({ n: i + 2, c: l.split('\t'), raw: l })) };
}

function check(file, txtOverride) {
  const out = [];
  const name = path.basename(file);
  const is299 = /299/.test(name);
  let data;
  if (txtOverride !== undefined) {
    const lines = txtOverride.split(/\r?\n/).filter(l => l.trim());
    const head = lines.shift().split('\t');
    data = { head, lines: lines.map((l, i) => ({ n: i + 2, c: l.split('\t'), raw: l })) };
  } else data = rows(file);

  const L = LAYOUT[name] || LAYOUT['*'];
  for (const r of data.lines) {
    const word = (r.c[L.word - 1] || '').trim();
    const source = (r.c[L.source - 1] || '').trim();
    const ref = (r.c[L.ref - 1] || '').trim();
    if (!word) continue;

    if (!source) out.push(`${name}:${r.n} · «${word}» · ⛔ אין מקור`);
    if (!ref) out.push(`${name}:${r.n} · «${word}» · ⛔ אין רפרנס`);

    /* ⭐ הבדיקה על **עמודת המקור בלבד** · היא הטענה מאיפה ההוכחה נלקחה.
     * ⚠ הגרסה שבדקה את השורה כולה ירתה 1,662 ממצאים ברגע ש-`gloss-status.tsv` נוסף,
     * וכולם מעמודה 8 «מקורות» — יומן עבודה שאסור לי לגעת בו לפי התיבה. שער שיורה
     * 1,662 ביום הראשון מכבים אותו, ואז הוא לא מגן גם על עמודת המקור. */
    for (const re of FORBIDDEN)
      if (re.test(source)) { out.push(`${name}:${r.n} · «${word}» · ⛔ מקור אסור לפי כלל א5 · ${re}`); break; }
    /* ⚠ אזכור בעמודה אחרת נספר בנפרד ומדווח כמספר · לא מפיל, אבל גם לא נעלם */
    for (const re of FORBIDDEN)
      if (!re.test(source) && re.test(r.raw)) { NOTE.push(`${name}|${re}`); break; }

    /* הרישיון נבדק רק בטבלת ה-299, שם ההבטחה היא נחלת הכלל בלבד */
    if (is299) for (const re of BAD_LICENSE)
      if (re.test(r.raw)) { out.push(`${name}:${r.n} · «${word}» · ⛔ רישיון שאינו נחלת הכלל · ${re}`); break; }

    /* ⚠ רק בעמודת הרפרנס · אזכור בהערה הוא תיעוד ההחלפה ולא הפניה */
    if (/^L\d+$/.test(ref) && BAD_LEXEME[ref])
      out.push(`${name}:${r.n} · «${word}» · ⛔ מפנה ל-${ref}, שהוא ${BAD_LEXEME[ref]}`);
  }
  return out;
}

function run(overrides) {
  NOTE = [];
  /* ⭐ `attestation/*.tsv` **וגם** הקבצים המוצהרים ב-EXTRA · אחרת הנקודה העיוורת חוזרת */
  const paths = fs.readdirSync(DIR).filter(f => f.endsWith('.tsv')).sort().map(f => path.join(DIR, f))
    .concat(EXTRA.filter(p => fs.existsSync(p)));
  const files = paths.map(p => path.basename(p));
  let all = [], n = 0;
  for (const p of paths) {
    const f = path.basename(p);
    const o = overrides && overrides[f];
    const res = check(p, o);
    n += (o !== undefined ? o : fs.readFileSync(p, 'utf8')).split(/\r?\n/).filter(l => l.trim()).length - 1;
    all = all.concat(res);
  }
  return { files, rows: n, findings: all };
}

if (SELFTEST) {
  /* ⛔ שער שלא ראית נופל אינו עדות · ארבע שורות מורעלות, אחת לכל כלל */
  const base = fs.readFileSync(path.join(DIR, 'attestation-299-worth.tsv'), 'utf8');
  const POISON = [
    ['שורה בלי מקור', 'בְּדִיקָה\t1\t\t\tאין מקור'],
    ['מקור אסור', 'בְּדִיקָה\t1\tויקימילון\tsome-ref\tלקוח מוויקימילון'],
    ['רישיון CC-BY-SA', 'בְּדִיקָה\t1\tספריא · Miqra according to the Masorah (CC-BY-SA)\tPsalms 1:1\t'],
    ['לקסמה שגויה', 'בְּדִיקָה\t1\tויקינתונים (CC0)\tL217076\tפעמי'],
  ];
  /* ⛔ הגרסה הראשונה של הבדיקה הזאת בדקה `findings.length > 0` · והיא עברה תמיד,
     כי יש 76 ממצאי בסיס. כל ארבע השורות דיווחו «נפל» והציגו ממצא ישן שאין לו
     קשר להזרקה. **בדיקה שלא ראית נופלת על הדבר הנכון אינה עדות.**
     כאן: ההפרש מול הריצה הנקייה, וחייבת להופיע בו **המילה שהזרקתי**. */
  /* ⭐ מקרה חמישי · על `gloss-status.tsv`, שעמודותיו שונות (מילה 4, מקור 6).
   * ⛔ בלעדיו, מפת עמודות שגויה מחזירה «אפס ממצאים» וזה נראה בדיוק כמו ירוק אמיתי.
   * זה מה שקרה בפועל: הקובץ היה מחוץ לשער, 38 הפרות ישבו בו, והשער היה ירוק. */
  const GS = path.join(__dirname, 'gloss-phase', 'gloss-status.tsv');
  const gsBase = fs.existsSync(GS) ? fs.readFileSync(GS, 'utf8') : null;
  if (gsBase) POISON.push(['מקור אסור · gloss-status',
    '1\t999\tבְּדִיקָה\tבדיקה\tבדק\tויקימילון · CC BY-SA\tאומת\t\t\tערך: בדיקה', GS]);

  let ok = true;
  const beforeSet = new Set(run().findings);
  console.log('בקרה · ממצאים לפני ההזרקה: ' + beforeSet.size);
  for (const [name, line, target] of POISON) {
    const key = target ? path.basename(target) : 'attestation-299-worth.tsv';
    const src = target ? gsBase : base;
    const r = run({ [key]: src.trimEnd() + '\n' + line });
    const delta = r.findings.filter(f => !beforeSet.has(f));
    /* ⚠ ההשוואה בלי ניקוד · ב-`gloss-status.tsv` עמודת המילה חסרת ניקוד, והשוואה
     * ל-«בְּדִיקָה» דיווחה «עבר» למרות שהממצא אכן נורה ואפילו הודפס לידה. */
    const nk = x => String(x).replace(/[֑-ׇ]/g, '');
    const caught = delta.some(f => nk(f).includes('בדיקה'));
    console.log((caught ? '✓ נפל   ' : '⛔ עבר   ') + name.padEnd(26) +
      (delta.length ? delta[0].slice(0, 95) : '(אפס ממצאים חדשים)'));
    if (!caught) ok = false;
  }
  console.log(ok ? '\n⭐ לשער יש שיניים · כל ' + POISON.length + ' השורות המורעלות נתפסו'
                 : '\n⛔ השער אינו תופס את מה שהוא טוען');
  process.exit(ok ? 0 : 1);
}

/* ===== קו הבסיס · ולמה הוא אינו «בליעה» =====
 *
 * בהרצה הראשונה השער ירה **76 ממצאים אמיתיים**, ו-66 מהם חוב ידוע ומתועד:
 * שורות שמקורן ויקימילון · חשיפה משפטית פתוחה שממתינה להכרעה של חגי.
 *
 * ⛔ שער שנופל ביום הראשון על חוב שאי אפשר לסגור היום · מכבים אותו, והוא מפסיק
 * להגן גם על מה שכן אפשר. ⭐ לכן הידועים **נספרים ומודפסים בכל הרצה**, והשער
 * נופל על **כל ממצא חדש**. הוא אינו בולע · הוא מקבע תקרה.
 *
 * ⚠ המפתח הוא קובץ+מילה+סוג ולא מספר שורה: מספרי שורה זזים בכל עריכה, וקו-בסיס
 * שנשען עליהם מתפוצץ על שינוי שאינו קשור אליו. */
const BASELINE = path.join(DIR, '_known-findings.txt');
const keyOf = f => {
  const m = f.match(/^([^:]+):\d+ · «([^»]*)» · ⛔ ([^·]+)/);
  return m ? m[1] + '|' + m[2] + '|' + m[3].trim() : f;
};

const r = run();
console.log('קבצים: ' + r.files.join(' · '));
console.log('שורות שנבדקו: ' + r.rows);

const known = fs.existsSync(BASELINE)
  ? new Set(fs.readFileSync(BASELINE, 'utf8').split(/\r?\n/).filter(l => l.trim() && l[0] !== '#'))
  : new Set();

if (process.argv.includes('--write-baseline')) {
  const keys = [...new Set(r.findings.map(keyOf))].sort();
  fs.writeFileSync(BASELINE,
    '# ממצאים ידועים · חוב מתועד שהשער אינו נופל עליו, אבל סופר ומדפיס בכל הרצה.\n' +
    '# ⛔ אין להוסיף שורה כאן כדי להשתיק ממצא חדש. נכתב פעם אחת, 26.8.2026.\n' +
    keys.join('\n') + '\n', 'utf8');
  console.log('קו בסיס נכתב · ' + keys.length + ' ממצאים ידועים');
  process.exit(0);
}

const fresh = r.findings.filter(f => !known.has(keyOf(f)));
const gone = [...known].filter(k => !r.findings.some(f => keyOf(f) === k));
console.log('ממצאים ידועים (חוב מתועד): ' + (r.findings.length - fresh.length));
if (gone.length) console.log('⭐ נסגרו מאז שנכתב קו הבסיס: ' + gone.length);
if (NOTE.length) {
  const by = {};
  NOTE.forEach(k => { const [f] = k.split('|'); by[f] = (by[f] || 0) + 1; });
  const list = Object.entries(by).map(([f, n]) => f + ' ' + n).join(' · ');
  console.log('');
  console.log('⚠ ' + NOTE.length + ' שורות מזכירות מקור אסור **מחוץ לעמודת המקור**: ' + list);
  console.log('   ⛔ השער אינו נופל עליהן · התיבה אוסרת לגעת בעמודה הזאת. **הן חשיפה משפטית פתוחה.**');
}

if (fresh.length) {
  console.log('\n⛔ ' + fresh.length + ' ממצאים **חדשים**:');
  fresh.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('\n✅ אפס ממצאים חדשים');
if (r.findings.length) {
  const a5 = r.findings.filter(f => /כלל א5/.test(f)).length;
  console.log('⚠ ' + r.findings.length + ' ממצאים ידועים ממתינים להכרעה · מתוכם ' + a5 +
    ' מקור אסור (ויקימילון), שהוא חשיפה משפטית פתוחה ולא חוב טכני.');
}
