/* מייצר `widget.json` — נקודת הקצה היחידה שכל גאדג'ט קורא ממנה.
 *
 * למה קובץ סטטי ולא Supabase: גאדג'ט הוא **קריאה בלבד, בלי משתמש מחובר**. קובץ
 * סטטי נטען מה-CDN, לא דורש מפתח, לא עובר RLS, ואי אפשר לדלוף דרכו נתוני משתמש.
 * ⛔ המילה נבחרת מ-`data.js` — המאגר ש**כבר** באתר — ולא מהמאגר החדש. פרסום
 *   מילים חדשות מוקפא עד הוראה מחגי.
 *
 * ⭐ הבחירה דטרמיניסטית לפי התאריך: כל המשתמשים רואים את אותה מילה באותו יום.
 * זה מה שהופך את זה למילת-היום ולא לרעש, וזה גם מה שמאפשר לבנות סביבה שיווק.
 *
 * הרצה: node widget/build_widget_json.js [YYYY-MM-DD] [--days N]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const UNITS = global.window.UNIT_DATA;

/* רשימה שטוחה ויציבה: סדר היחידות ואז סדר הפריטים. שינוי בסדר משנה את הבחירה,
   ולכן הוא חייב להיות מוגדר ולא תלוי במפתחות של אובייקט. */
const FLAT = [];
for (let u = 1; u <= 10; u++)
  (UNITS[String(u)] || []).forEach(([term, gloss], i) => FLAT.push({ u, i, term, gloss }));

/* ⚠ הגרסה הראשונה גיבבה את התאריך לאינדקס, ומדדתי: **33 חזרות ב-365 ימים.**
   זו בעיית יום ההולדת ולא באג — אבל "מילת היום" שחוזרת פעמיים בחודשיים נראית
   כמו תקלה למשתמש. במקום זה: **תמורה דטרמיניסטית** של כל המאגר בזרע קבוע,
   וקידום ביום. אפס חזרות עד שהמאגר נגמר — 1,717 יום, כלומר 4.7 שנים. */
const SEED = 800;
function shuffled() {
  const a = FLAT.slice();
  let s = SEED >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const ORDER = shuffled();
const EPOCH = Date.UTC(2026, 0, 1) / 86400000;
function pick(dateStr) {
  const day = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000) - EPOCH;
  return ORDER[((day % ORDER.length) + ORDER.length) % ORDER.length];
}

const NIQ = /[֑-ׇ]/g;
/* ⚠ ערך רב-וריאנטי (`בּוּרְסְקִי / בּוּרְסְקַאי / בּוּרְסִי`) נראה כמו תקלה בגאדג'ט קטן.
   לתצוגה נלקח הווריאנט הראשון; `term` המלא נשאר בקובץ למי שרוצה אותו. */
const display = t => t.split('/')[0].trim();
function entry(dateStr) {
  const w = pick(dateStr);
  const show = display(w.term);
  return {
    date: dateStr,
    term: w.term,
    show,
    plain: show.normalize('NFKC').replace(NIQ, ''),
    gloss: w.gloss,
    unit: w.u,
    /* ⚠ קישור לאתר בלבד, ולא `?w=<מילה>`. בדקתי: `app.js` אינו קורא
       URLSearchParams / location.search / location.hash כלל, ולכן קישור עמוק
       למילה **אינו עובד**. לשלוח קישור שמרמז על יכולת שאין זה באג, לא תכונה.
       ברגע שיתווסף ניתוב — כאן המקום להחזיר את הפרמטר. */
    url: 'https://800-plus.com',
  };
}

const arg = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null;
const di = process.argv.indexOf('--days');
const days = di > -1 ? Number(process.argv[di + 1]) || 1 : 1;
const base = arg ? new Date(arg + 'T00:00:00Z') : new Date();

const upcoming = [];
for (let d = 0; d < days; d++) {
  const dt = new Date(base.getTime() + d * 86400000);
  upcoming.push(entry(dt.toISOString().slice(0, 10)));
}

const out = {
  app: '800+',
  site: 'https://800-plus.com',
  generated: upcoming[0].date,
  bank: FLAT.length,
  today: upcoming[0],
  upcoming: upcoming.slice(1),
};
fs.writeFileSync(path.join(__dirname, 'widget.json'), JSON.stringify(out, null, 1), 'utf8');

/* ⚠ שער: אותו תאריך חייב לתת אותה מילה בכל הרצה, אחרת "מילת היום" משתנה
   באמצע היום וכל המשתמשים רואים דברים שונים. */
const a = entry('2026-08-14').term, b = entry('2026-08-14').term;
if (a !== b) { console.log('⛔ הבחירה אינה דטרמיניסטית'); process.exit(1); }
/* ושער שני: ימים סמוכים לא נותנים את אותה מילה */
if (entry('2026-08-14').term === entry('2026-08-15').term) {
  console.log('⛔ שני ימים רצופים נתנו אותה מילה'); process.exit(1);
}

console.log('='.repeat(56));
console.log(`מאגר חי: ${FLAT.length} מילים · נכתב widget.json`);
console.log(`היום (${out.today.date}): ${out.today.term} — ${out.today.gloss} [י${out.today.unit}]`);
upcoming.slice(1, 5).forEach(e => console.log(`   ${e.date}: ${e.term} — ${e.gloss}`));
console.log('='.repeat(56));
console.log('✓ דטרמיניסטי · ✓ ימים סמוכים שונים');
