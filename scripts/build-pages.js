'use strict';
/* בונה את התיקייה שמתפרסמת לאתר — ורק אותה.
 *
 * הבעיה שהקובץ הזה סוגר
 * ----------------------
 * האתר יושב על GitHub Pages במצב «פרסום מענף», ובמצב הזה **כל** קובץ במאגר
 * מוגש בכתובת הפומבית. נמדד ב-3.9.2026: 2,442 קבצים, ובתוכם טבלאות המילים
 * הקריאות (`יחידות/יחידה-01.md`), רשימות המילים הגולמיות (`שפות/עברית/words.txt`),
 * פלט הצינור (`units_output/`), חבילת הבדיקות, קובצי ה-SQL ותיעוד השיטה.
 * כולם החזירו 200 בלי חשבון ובלי תשלום.
 *
 * מה שהוא עושה
 * -------------
 * מעתיק ל-`_site/` **רשימה סגורה** של מה שהדפדפן באמת מבקש, ותו לא. מה שלא
 * ברשימה פשוט לא מגיע לשרת, ולכן מחזיר 404. שום קובץ אינו נמחק מהמאגר —
 * המאגר נשאר כמות שהוא, רק חדל להיות אתר.
 *
 * ⛔ מה שהוא **אינו** עושה, וחשוב שייאמר: `data.js` ו-`data-en.js` נשארים
 * ברשימה, מפני שהאפליקציה טוענת אותם בדפדפן. אפליקציית PWA סטטית **חייבת**
 * למסור לדפדפן כל מה שהיא מציגה, ולכן המאגר המהודר נשאר בר-הורדה. ההגנה כאן
 * חלקית במפורש: היא מסירה את העותקים שאיש אינו צריך, לא את זה שהמוצר רץ עליו.
 *
 * הרצה:  node scripts/build-pages.js [יעד]     (ברירת מחדל: _site)
 * ⭐ הרשימה נבדקת ב-tests/105-pages-payload.test.js מול מה שהדף באמת מבקש,
 *    ולכן קובץ חדש שנטען ונשכח כאן מפיל את חבילת הבדיקות ולא את המשתמשים.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

/* קבצים בודדים בשורש. כל אחד כאן נטען בפועל: תגית ב-index.html, רשומה
   ב-ASSETS של sw.js, טעינה דינמית ב-app.js, או ניווט של המשתמש. */
const FILES = [
  /* תשתית הפרסום עצמה */
  '.nojekyll',
  'CNAME',
  /* הדף והמניפסט */
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  /* הדפים המשפטיים — נפתחים בניווט ישיר מתוך האפליקציה */
  'terms.html',
  'privacy.html',
  'deletion.html',
  'accessibility.html',
  /* קוד */
  'app.js',
  'config.js',
  'store.js',
  'supabase.min.js',
  /* מאגר — נטען לדפדפן, ולכן חייב להיות מוגש. ראה ההסתייגות בראש הקובץ. */
  'data.js',
  'data-en.js',
  'data-en-sentences.js',
  'data-sent-en.js',
  'enrank.js',
  'leveltest.js',
  'leveltest-he.js',
  'typo-lex.js',
  /* SEO — מפת אתר ועמודי מילה לניסוי האינדקס של גוגל */
  'robots.txt',
  'sitemap.xml',
  /* אייקונים של המניפסט */
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

/* תיקיות שנכנסות במלואן. שתיהן קטנות ואין בהן חומר מקור. */
const DIRS = [
  'fonts',            /* @font-face ב-index.html */
  '.well-known',      /* security.txt — תקן RFC 9116, אמור להיות נגיש */
];

/* קבצים בודדים בתוך תיקיות מקור. ⚠ שאר התיקייה **אינו** מתפרסם.
   הראשונים נטענים בזמן ריצה מ-app.js ומופיעים גם ב-sw.js. */
const NESTED = [
  /* עמודי מילה — ניסוי SEO, שני עמודים לפני ייצור המוני */
  'word/he-אמתלה.html',
  'word/en-meticulous.html',
  'sentence-completion/sent-lex.js',
  'connectives-he/data-conn-he.js',
  /* נקודת הקצה שגאדג'ט האייפון קורא ממנה — 800-plus.com/widget/widget.json.
     ⚠ רק הקובץ הזה. ה-README ותסריט הבנייה שלידו הם מקור ואינם מתפרסמים. */
  'widget/widget.json',
];

/* מחזירה את רשימת הקבצים המלאה, יחסית לשורש המאגר, ממוינת. */
function resolve(repo = REPO) {
  const out = new Set(FILES.concat(NESTED));
  for (const d of DIRS) {
    const abs = path.join(repo, d);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      const p = path.join(abs, name);
      if (fs.statSync(p).isFile()) out.add(d + '/' + name);
    }
  }
  return Array.from(out).sort();
}

function build(dest, repo = REPO) {
  fs.rmSync(dest, { recursive: true, force: true });
  const list = resolve(repo);
  const missing = [];
  for (const rel of list) {
    const src = path.join(repo, rel);
    if (!fs.existsSync(src)) { missing.push(rel); continue; }
    const dst = path.join(dest, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  /* ⛔ נכשל רועש. רשימה שמצביעה על קובץ שאיננו פירושה שהאתר יעלה חסר,
     וזה בדיוק הכשל שצריך לעצור את הפריסה ולא להתגלות אצל המשתמש. */
  if (missing.length) {
    console.error('חסרים קבצים שהרשימה מחייבת:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  return list.length - missing.length;
}

if (require.main === module) {
  const dest = path.resolve(process.argv[2] || path.join(REPO, '_site'));
  const n = build(dest);
  console.log(`_site נבנה: ${n} קבצים → ${dest}`);
}

module.exports = { FILES, DIRS, NESTED, resolve, build, REPO };
