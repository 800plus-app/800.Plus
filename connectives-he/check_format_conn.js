'use strict';
/* שער הפורמט של יחידת מילות הקישור.
 *
 *   node connectives-he/check_format_conn.js
 *   node connectives-he/check_format_conn.js --selftest
 *
 * מה הוא בודק
 * -----------
 * את המבנה בלבד · השדות קיימים, המערכים באורך 4, `a` הוא 0, `w` הוא הצורה
 * החשופה של `o[0]`, במשפט יש בדיוק חריץ `___` אחד, ואין מקף ארוך.
 *
 * ⛔ מה הוא **אינו** בודק, ונאמר כאן כדי שאיש לא יקרא ירוק שלו כאישור תוכן:
 * אם המשפט באמת מחייב את הכיוון שהוצהר, אם המסיחים קרובים מספיק, ואם ההסבר
 * נכון. אלה שיפוט אנושי ופותרים עצמאיים, ולא ביטוי רגולרי.
 *
 * ⭐ ‏`--selftest` מריץ את **אותה** `checkItem` על עותקים מורעלים של פריט אמיתי
 * ומוכיח שכל אחד משישה פגמים נתפס, ושהפריט התקין עובר. זה שונה מהתקדים
 * ב-`sentence-completion/check_explain.js`, שם הבדיקה העצמית משכפלת את הלוגיקה
 * בתוכה · שכפול כזה יכול לעבור בזמן שהשער עצמו מת, וזה בדיוק מה שאסור.
 */
const L = require('./lib_conn.js');

/* ── השוואת `w` ל-`o[0]` ─────────────────────────────────────────────────
   ⚠ ההשוואה היא **אחרי הסרת ניקוד**, ולא זהות תווים. הסכימה מגדירה את
   האפשרויות כמנוקדות ואת `w` כחשופה (`"אַף עַל פִּי כֵן"` מול `"אף על פי כן"`),
   ולכן זהות תווים הייתה פוסלת את הדוגמה שבתוכנית עצמה. בנוסף נדרש ש-`w`
   **לא** תהיה מנוקדת · אחרת שני השדות היו יכולים להיות אותו דבר בדיוק
   וההפרדה בין הצורה המוצגת לצורה המפתחית הייתה מתבטלת בשקט. */
const HAS_NIQ = /[֑-ׇ]/;                        /* ⚠ בלי דגל g · `test` על ביטוי גלובלי משנה מצב בין קריאות */

const FIELDS = ['s', 'o', 'a', 'k', 'd', 'w', 'slot', 'flip', 'g', 'r'];
const OF4 = ['o', 'd', 'g', 'r'];

/**
 * מחזיר מערך ממצאים לפריט אחד. מערך ריק = הפריט תקין.
 * ⭐ זו הפונקציה שגם הריצה הרגילה, גם `--selftest` וגם `assemble_conn.js`
 * קוראים לה. אין שני עותקים של הכללים.
 */
function checkItem(it, id) {
  const F = [], add = m => F.push(`${id} · ${m}`);
  if (!it || typeof it !== 'object') { add('אינו אובייקט'); return F; }

  /* 1 · שדות קיימים */
  for (const f of FIELDS) if (it[f] === undefined || it[f] === null) add(`שדה חסר: ${f}`);
  if (F.length) return F;                     // בלי השדות אין מה למדוד הלאה

  /* 2 · מערכים באורך 4 */
  for (const f of OF4) {
    if (!Array.isArray(it[f])) { add(`${f} אינו מערך`); continue; }
    if (it[f].length !== 4) add(`${f} באורך ${it[f].length} ולא 4`);
  }
  if (!Array.isArray(it.flip)) add('flip אינו מערך');
  if (Array.isArray(it.o) && it.o.some(x => typeof x !== 'string' || !x.trim()))
    add('אפשרות ריקה או שאינה מחרוזת ב-o');

  /* 3 · a === 0 · המגיש מערבב, ולכן התשובה תמיד ראשונה במקור */
  if (it.a !== 0) add(`a הוא ${JSON.stringify(it.a)} ולא 0`);

  /* 4 · w === o[0] אחרי הסרת ניקוד */
  if (Array.isArray(it.o) && typeof it.o[0] === 'string') {
    if (L.strip(it.w) !== L.strip(it.o[0])) add(`w ("${it.w}") אינו o[0] ("${it.o[0]}")`);
  }
  if (typeof it.w === 'string' && HAS_NIQ.test(it.w)) add(`w מנוקד ("${it.w}") — w היא הצורה החשופה`);

  /* 5 · בדיוק חריץ אחד */
  if (typeof it.s !== 'string') add('s אינו מחרוזת');
  else {
    const n = (it.s.match(/___/g) || []).length;
    if (n !== 1) add(`במשפט ${n} חריצי ___ ולא אחד`);
  }

  /* 6 · בלי מקף ארוך · בכל טקסט שהלומד רואה */
  const texts = [['s', it.s]]
    .concat((it.o || []).map((x, i) => [`o[${i}]`, x]))
    .concat((it.g || []).map((x, i) => [`g[${i}]`, x]))
    .concat((it.r || []).map((x, i) => [`r[${i}]`, x]));
  for (const [w, t] of texts) if (typeof t === 'string' && L.LONG_DASH.test(t)) add(`מקף ארוך ב-${w}`);

  return F;
}

module.exports = { checkItem, FIELDS };

/* ⛔ כל מה שמתחת רץ **רק** כשהקובץ הופעל ישירות. `assemble_conn.js` דורש את
   ‏`checkItem` מכאן, ושורת `process.exit` שהייתה רצה בזמן `require` הייתה
   הורגת את המאחד בשקט באמצע הבנייה. */
if (require.main !== module) return;

/* ── הוכחת שיניים ────────────────────────────────────────────────────────
   שישה פגמים, כל אחד על **עותק של פריט אמיתי מהמנה**, ועוד הפריט התקין עצמו.
   ⛔ אם אחד הפגמים עובר, או שהתקין נופל, השער אינו עדות ואין להסתמך על שום
   ריצה שלו. */
if (process.argv.includes('--selftest')) {
  const { items, broken } = L.loadBatches();
  broken.forEach(b => console.log('⛔ ' + b));
  const base = items.find(x => !checkItem(x, 'x').length);
  if (!base) {
    console.log('⛔ אין במנות אף פריט תקין שאפשר להרעיל — הבדיקה העצמית חסרת ערך.');
    process.exit(2);
  }
  const clone = () => JSON.parse(JSON.stringify(base));
  const cases = [
    { name: 'שדה חסר (k)',    mut: x => { delete x.k; },                              want: 'נופל' },
    { name: 'o באורך 3',      mut: x => { x.o = x.o.slice(0, 3); },                   want: 'נופל' },
    { name: 'a אינו 0',       mut: x => { x.a = 2; },                                 want: 'נופל' },
    { name: 'w שאינו o[0]',   mut: x => { x.w = 'ברם'; },                             want: 'נופל' },
    { name: 'שני חריצי ___',  mut: x => { x.s = x.s.replace('___', '___ ואז ___'); }, want: 'נופל' },
    { name: 'מקף ארוך',       mut: x => { x.s = x.s.replace('___', '— ___'); },       want: 'נופל' },
    { name: 'הפריט התקין',    mut: () => {},                                          want: 'עובר' },
  ];
  let fail = 0;
  console.log(L.BAR);
  console.log(`הוכחת שיניים · הרעלה על ${base.src}`);
  console.log(L.BAR);
  for (const c of cases) {
    const x = clone(); c.mut(x);
    const F = checkItem(x, base.src);
    const got = F.length ? 'נופל' : 'עובר';
    const ok = got === c.want;
    if (!ok) fail++;
    const why = F[0] ? '· ' + F[0].split(' · ').slice(1).join(' · ') : '';
    console.log(`${ok ? '✓' : '⛔'} ${got.padEnd(5)} ${c.name.padEnd(18)} ${why}`);
  }
  console.log(L.BAR);
  console.log(fail
    ? `⛔ ${fail} מקרים לא התנהגו כצפוי — אין להסתמך על השער`
    : '✅ לשער יש שיניים. שישה פגמים נתפסו והפריט התקין עבר.');
  console.log(L.BAR);
  process.exit(fail ? 1 : 0);
}

/* ── ריצה רגילה ──────────────────────────────────────────────────────────*/
{
  const { items, files, broken, dir } = L.loadBatches();
  const findings = broken.slice();
  for (const it of items) findings.push(...checkItem(it, it.src));

  process.exit(L.verdict('שער הפורמט · מילות קישור', items.length, findings, [
    `מנות: ${files.join(', ') || '(אין)'} · ${dir}`,
    '⚠ נבדק מבנה בלבד. אם המשפט מחייב את הכיוון, אם המסיחים קרובים, ואם ההסבר',
    '   נכון — אינם נמדדים כאן. זה שיפוט אנושי ופותרים עצמאיים.',
  ]));
}
