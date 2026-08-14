/* בונה תמונת פוסט להשלמת משפטים · 1080×1350.
 *
 *   node "שיווק/תמונות/בונה-פוסט-משפטים.js" <band> <index> <out.html>
 *
 * למה סקריפט ולא העתקת HTML: הפורמט הזה הוכיח את עצמו, ואנחנו נרצה עוד
 * ממנו. העתקה ידנית מזמינה בדיוק את הטעויות שכבר עלו — סדר אפשרויות
 * שמתהפך ב-RTL, וכיתוב שנשאר מנכס קודם. כאן הפריט נשלף מהקורפוס החי,
 * ולכן אי אפשר להמציא משפט שאינו באפליקציה.
 *
 * ⚠ התשובה **אינה** מוצגת. התמונה היא מבחן, לא הכרזה, וזו הסיבה שאנשים
 *   עוצרים עליה. מי שרוצה לדעת אם צדק נכנס לאתר.
 */
const fs = require('fs'), path = require('path');

const [band, idxRaw, out] = process.argv.slice(2);
if (!band || idxRaw === undefined || !out) {
  console.error('שימוש: node בונה-פוסט-משפטים.js <רצועה> <אינדקס> <פלט.html>');
  process.exit(1);
}

/* הקורפוס החי מ-origin/main, לא מעותק מקומי שעלול להתיישן. */
global.window = global;
require(path.join(__dirname, '..', '..', 'data-sent-en.js'));
const items = SENT_EN[band];
if (!items) { console.error('רצועה לא קיימת:', Object.keys(SENT_EN).join(' · ')); process.exit(1); }
const it = items[Number(idxRaw)];
if (!it) { console.error('אין פריט', idxRaw, 'ברצועה', band, '· יש', items.length); process.exit(1); }

/* ⚠ פריט דו-חסר מגיע כ**מערך** של שתי מילים, לא כמחרוזת עם פסיק.
   בדיקת `includes(',')` על מערך תמיד נכשלת בשקט ומדפיסה "a,b" עם פסיק
   דבוק. נתפס בהרצה ראשונה. מציגים עם מפריד כדי שהעין תקרא שתי מילים. */
const show = o =>
  Array.isArray(o) ? o.join(' · ')
  : (typeof o === 'string' && o.includes(',')) ? o.split(',').map(s => s.trim()).join(' · ')
  : o;

/* ⚠ הקורפוס שומר את התשובה הנכונה במקומה המקורי, ובפריט הצבא היא `it.a === 0`.
   האפליקציה מערבבת בזמן ריצה, התמונה לא — ולכן התמונה הראשונה שהופקה הציגה את
   התשובה הנכונה במשבצת הראשונה. זה רמז לא מכוון: מי שסורק פוסט בוחר את הראשון,
   והפריט מפסיק להיות מבחן. כאן מסובבים את המערך כך שהנכונה נוחתת במשבצת 3
   (שמאל-למטה ברשת ה-LTR) — לא ראשונה ולא אחרונה. סיבוב ולא ערבוב, כדי שאותה
   פקודה תפיק תמיד את אותה תמונה. נתפס ב-PNG המרונדר, לא בקוד. */
const SLOT = 2;
const shift = (it.a - SLOT + it.o.length) % it.o.length;
const opts = it.o.map((_, i) => show(it.o[(i + shift) % it.o.length]));
const answer = show(it.o[it.a]) + `  (משבצת ${SLOT + 1} מתוך ${it.o.length})`;
const blanks = (it.s.match(/___/g) || []).length;

/* ⚠ שבירת השורות מפורשת, ומחושבת לפי **רוחב** ולא לפי מספר מילים.
   הגרסה הראשונה חילקה את המילים לשלושה חלקים שווים, ויצאה שורה עם
   המילה "only" לבדה: `___` נראה כשלושה תווים בקוד אבל נצבע כפס של
   170px, כלומר כתשעה תווים. נתפס בתמונה המרונדרת, לא בקוד. */
const CHAR = 9;                       // ___ שקול לתשעה תווים ברוחב
const cost = w => w.replace(/___/g, 'x'.repeat(CHAR)).length;
const words = it.s.split(' ');
const total = words.reduce((a, w) => a + cost(w) + 1, 0);
const target = Math.ceil(total / 3);  // שלוש שורות מאוזנות ברוחבן

const lines = [];
let cur = [], len = 0;
for (const w of words) {
  const c = cost(w) + 1;
  /* השורה נסגרת רק אם היא כבר מלאה **ואינה האחרונה** — אחרת המילים
     האחרונות נדחסות לשורה רביעית ומתקבלת בדיוק אותה יתמות. */
  if (len + c > target && lines.length < 2 && cur.length) { lines.push(cur.join(' ')); cur = []; len = 0; }
  cur.push(w); len += c;
}
if (cur.length) lines.push(cur.join(' '));
/* ⚠ סימן פיסוק שצמוד ל-`___` נעטף איתו ב-nowrap. בלי זה הפס תופס 150px,
   הדפדפן שובר אחריו, והנקודה הסופית נוחתת לבדה בשורה רביעית — נתפס
   בתמונה המרונדרת של `deliberate`. */
const body = lines
  .map(l => l.replace(/___([.,;:!?]*)/g,
    (_, p) => `<span class="bw"><span class="blank"></span>${p}</span>`))
  .join('<br>\n      ');
const longest = Math.max(...lines.map(cost));

const BANDS = { 'בסיס': 'רמת בסיס', 'בינוני': 'רמה בינונית', 'מתקדם': 'רמה מתקדמת', 'אקדמי': 'רמה אקדמית' };

fs.writeFileSync(out, `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@300;500;900&family=Heebo:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
/* נוצר על ידי בונה-פוסט-משפטים.js · ${band} #${idxRaw} · אל תערוך ביד */
:root{--paper:#f6f1e7;--card:#fffdf8;--ink:#2c2620;--soft:#736a5c;
      --gold:#c9962f;--accent:#b5482e;--line:#e3d8c4}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;position:relative;overflow:hidden;
  background-color:var(--paper);
  background-image:radial-gradient(circle at 16% 12%, rgba(201,150,47,.16), transparent 44%),
                   radial-gradient(circle at 86% 86%, rgba(181,72,46,.11), transparent 48%);
  font-family:'Heebo',sans-serif;direction:rtl;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:0 78px;text-align:center}
.mark{position:absolute;top:64px;font-family:'Frank Ruhl Libre',serif;font-weight:900;
  font-size:46px;color:var(--gold);direction:ltr;letter-spacing:-.03em}
.kicker{font-size:30px;color:var(--gold);font-weight:700;letter-spacing:.2em;margin-bottom:26px}
h1{font-family:'Frank Ruhl Libre',serif;font-weight:900;font-size:78px;color:var(--ink);
  line-height:1.08;margin-bottom:46px}
.card{background:var(--card);border:1px solid var(--line);border-radius:26px;
  padding:52px 46px;width:100%}
.sent{direction:ltr;font-family:'Frank Ruhl Libre',serif;font-weight:500;
  font-size:${longest > 52 ? 36 : longest > 44 ? 40 : 44}px;line-height:1.5;color:var(--ink);text-align:left}
.blank{display:inline-block;width:150px;border-bottom:6px solid var(--accent);
  vertical-align:.12em;margin:0 6px}
.bw{white-space:nowrap}
/* ⚠ direction:ltr על הגריד. בלעדיו המסגרת ה-RTL הופכת את סדר התאים. */
.opts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:40px;direction:ltr}
.opt{direction:ltr;background:var(--paper);border:1.5px solid var(--line);border-radius:999px;
  padding:20px 0;font-size:${opts.some(o => o.length > 14) ? 30 : 40}px;font-weight:500;
  color:var(--ink);font-family:'Frank Ruhl Libre',serif}
.foot{position:absolute;bottom:62px}
.cta{background:var(--accent);color:#fff;border-radius:999px;padding:22px 56px;
  font-size:40px;font-weight:700;direction:ltr;letter-spacing:.03em}
</style>
</head>
<body>
  <div class="mark">800+</div>
  <div class="kicker">השלמת משפטים · ${BANDS[band] || band}</div>
  <h1>${blanks > 1 ? 'אילו מילים נכנסות?' : 'איזו מילה נכנסת?'}</h1>

  <div class="card">
    <div class="sent">
      ${body}
    </div>
    <div class="opts">
${opts.map(o => `      <div class="opt">${o}</div>`).join('\n')}
    </div>
  </div>

  <div class="foot"><div class="cta">800-plus.com</div></div>
</body>
</html>
`, 'utf8');

console.log('נוצר:', out);
console.log('המשפט:', it.s);
console.log('התשובה (לא מוצגת בתמונה):', answer);
