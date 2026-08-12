/* מחפש תרגומים שהשמיטו מילת תוכן מהמשפט האנגלי.
 *
 *   node sentences-en/check_omissions.js [כמה]      מדפיס את החשודים
 *   node sentences-en/check_omissions.js --selftest  הוכחת שיניים
 *
 * הרקע: מדגם עצמאי על 60 תרגומים מצא שניים שבהם מילה מהמשפט האנגלי אינה בתרגום
 * (`baby boy` → `תינוק`, `gala event` → `אירוע`). שניים מ-60 הם שיעור שאי אפשר
 * להתעלם ממנו ואי אפשר גם לבדוק ידנית על 3,946 פריטים, ולכן צריך מסננת.
 *
 * ⚠ מה הכלי **אינו**: הוא אינו מכריע אם מילה הושמטה. עברית קצרה מאנגלית מטבעה —
 * מילות היחס דבוקות, אין `a`/`the`, והפועל נושא את הגוף. לכן יחס מילים נמוך הוא
 * **חשד ולא ממצא**, והכלי רק מסדר את 3,946 לפי חשד כדי שהבדיקה האנושית תרוץ על
 * הקצה הנכון של הרשימה. הכרעה נעשית בקריאה, ובנפרד.
 */
const fs = require('fs'), path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..');

/* מילות תפקוד באנגלית: אין להן מקבילה נפרדת בעברית, ולכן הן אינן נספרות. */
const EN_STOP = new Set(('a an the of to in on at by for with from into onto upon within ' +
  'and or but so as that than then there here is are was were be been being am ' +
  'do does did done have has had having will would shall should can could may might must ' +
  'this these those it its his her their our your my me him them us you i we they he she ' +
  'not no very just also too only own about after before during while when where who whom ' +
  'which what how why all any some each every both either neither one two ' +
  'up down out off over under again more most such same other another every').split(' '));

const words = s => (String(s).replace(/<\/?b>/g, '').match(/[A-Za-z']+/g) || [])
  .map(x => x.toLowerCase()).filter(x => !EN_STOP.has(x) && x.length > 2);
const heWords = s => (String(s).replace(/<\/?b>/g, '').match(/[א-ת]+/g) || [])
  .filter(x => x.length > 1);

/* יחס: מילות תוכן עבריות מול מילות תוכן אנגליות. פחות מ-1 פירושו שהעברית מכסה
   פחות מילים ממה שהאנגלית אומרת, וזה המקום שבו השמטה מסתתרת. */
function ratio(en, he) {
  const e = words(en).length, h = heWords(he).length;
  return { e, h, r: e ? h / e : 1 };
}

/* ⭐ המסננת האמיתית, ולא יחס המילים: **הבנק עצמו הוא מילון.** `data-en.js` מחזיק
   3,946 מילים אנגליות עם הפירוש העברי שלהן, ולכן לכל מילת תוכן במשפט האנגלי שהיא
   ערך בבנק אפשר לשאול שאלה מדויקת: האם הפירוש שלה מופיע בתרגום? אם לא — המילה
   כנראה הושמטה. מילה שאינה בבנק אינה נבדקת, וזה נאמר במספרים בפלט ולא נבלע.
   ⚠ יחס המילים נשאר, אבל רק כדי לדרג. ההכרעה היא של המסננת הזאת. */
const glossMap = (() => {
  const g = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'data-en.js'), 'utf8'))(g);
  const m = new Map();
  Object.values(g.UNIT_DATA_EN).flat().forEach(([term, gl]) => {
    /* מפתח בעל צורה אחת בלבד: `1st - first` ו-`as long as` אינם מילה במשפט. */
    if (/[-/,()]|\s/.test(term) || /\d/.test(term)) return;
    m.set(term.toLowerCase(), gl);
  });
  return m;
})();
const PRE = ['כשה', 'שה', 'וה', 'לה', 'מה', 'בה', 'כה', 'ה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש'];
const SUF = ['ותיה', 'ותיו', 'יהם', 'ים', 'ות', 'יה', 'יו', 'נו', 'תי', 'ה', 'ת', 'י', 'ו', 'ם', 'ן'];
const shed = (x, list) => { for (const p of list) {
  if (list === PRE && x.startsWith(p) && x.length - p.length >= 3) return x.slice(p.length);
  if (list === SUF && x.endsWith(p) && x.length - p.length >= 3) return x.slice(0, -p.length);
} return x; };
/* ⚠ הגרסה הראשונה קילפה תחיליות **גם ממילת הפירוש**, ולכן `שיטפון` לא נפגש עם
   `השיטפון`: ה-ש נחשבה אות שימוש, הגרעין נשחק ל-`טפ`, וההשוואה נפלה. זו בדיוק
   השגיאה שכבר תוקנה ב-mark_he.js, וחזרה כאן. מילת פירוש היא לקסמה: מסירים ממנה
   רק סופית נטייה ואת ה-ל של שם הפועל. הקילוף המלא חל על המילה שבמשפט. */
/* ⚠ אותיות סופיות. בלי הנרמול הזה `קיום` ו-`קיומם` אינם נפגשים — ם מול מ הם שני
   תווים שונים לגמרי — וכל שם עצם ברבים או בנטייה נראה כמו מילה שהושמטה. זה היה
   מקור לחלק גדול מהדגלים השקריים בהרצה הראשונה. */
const fin = x => x.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
  .replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
const skel = x => fin(x).replace(/[אוהי]/g, '');
const gForms = g => { const s = new Set([g, shed(g, SUF)]);
  if (g.startsWith('ל') && g.length >= 4) { s.add(g.slice(1)); s.add(shed(g.slice(1), SUF)); }
  return [...s]; };
const tForms = t => { const a = shed(t, PRE);
  return [...new Set([t, a, shed(t, SUF), shed(a, SUF)])]; };
const near = (g, t) => gForms(g).some(gf => tForms(t).some(tf => {
  if (fin(gf) === fin(tf)) return true;
  const x = skel(gf), y = skel(tf);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || (x.length >= 3 && y.includes(x)) || (y.length >= 3 && x.includes(y));
}));

/* מחזיר את מילות התוכן האנגליות שהפירוש שלהן אינו בתרגום, ואת מספר הנבדקות. */
function missing(en, he) {
  const hw = heWords(he);
  const out = []; let checked = 0;
  for (const word of new Set(words(en))) {
    const gl = glossMap.get(word);
    if (!gl) continue;                       // אינה בבנק, אין מול מה לבדוק
    checked++;
    const gws = gl.split(/[;,]/).flatMap(s => s.trim().split(/\s+/))
      .filter(x => /[א-ת]/.test(x) && x.length >= 2);
    if (!gws.length) continue;
    if (!gws.some(g => hw.some(h => near(g, h)))) out.push(`${word}(${gl})`);
  }
  return { out, checked };
}

if (process.argv.includes('--selftest')) {
  /* ⛔ הוכחת שיניים למסננת המילונית: המילה שהושמטה בפועל חייבת לצוף, ותרגום מלא
     חייב לא לצוף. `boy` הוא ערך בבנק, ולכן השאלה כאן מדויקת ולא סטטיסטית. */
  const D = [
    ['She gave birth to a healthy baby <b>boy</b> last week.',
     'היא ילדה תינוק בריא בשבוע שעבר.', true],
    ['The <b>third</b> time he called, she answered the phone.',
     'בפעם השלישית שהוא התקשר, היא ענתה לטלפון.', false],
    ['The keys are <b>in</b> the drawer next to my bed.',
     'המפתחות נמצאים במגירה ליד המיטה שלי.', false],
  ];
  let dbad = 0;
  D.forEach(([en, he, want]) => {
    const { out, checked } = missing(en, he);
    const got = out.length > 0;
    if (got !== want) { dbad++; console.log(`⛔ מילונית: צפוי ${want} · קיבל ${out.join(' ')||'כלום'} · ${he}`); }
    else console.log(`✅ מילונית: ${want ? 'צף — ' + out.join(' ') : 'לא צף'} (${checked} מילים נבדקו)`);
  });
  if (dbad) { console.log(`\n⛔ המסננת המילונית: ${dbad}/${D.length}`); process.exit(1); }
  const T = [
    /* ⛔ מקרה שחייב לצוף: מילה שהושמטה בפועל, מהמדגם העצמאי. */
    ['She gave birth to a healthy baby <b>boy</b> last week.',
     'היא ילדה תינוק בריא בשבוע שעבר.', 'חשוד'],
    ['The actor dressed <b>appropriately</b> for the formal evening gala event.',
     'השחקן התלבש כראוי לאירוע הערב הרשמי.', 'חשוד'],
    /* ✅ מקרה שחייב **לא** לצוף: תרגום מלא ותקין. */
    ['The <b>third</b> time he called, she answered the phone.',
     'בפעם השלישית שהוא התקשר, היא ענתה לטלפון.', 'תקין'],
    ['Many animals sleep through winter when food becomes <b>scarce</b>.',
     'חיות רבות ישנות במהלך החורף כשהמזון נהיה נדיר.', 'תקין'],
  ];
  /* ⚠ הסף כאן כויל על שני התרגומים החסרים שנמצאו בפועל (0.86) מול תרגומים מלאים
     (1.00 ומעלה). כיול על ארבע דוגמאות אינו מדע, ולכן היחס משמש **לדירוג בלבד**,
     וההכרעה נשארת אצל המסננת המילונית שלמעלה ואצל הקריאה. */
  let bad = 0;
  T.forEach(([en, he, want]) => {
    const { e, h, r } = ratio(en, he);
    const got = r < 0.95 ? 'חשוד' : 'תקין';
    if (got !== want) { bad++; console.log(`⛔ צפוי ${want} · קיבל ${got} (${h}/${e}=${r.toFixed(2)}) · ${he}`); }
    else console.log(`✅ ${want} (${h}/${e}=${r.toFixed(2)}) · ${he}`);
  });
  console.log(bad ? `\n⛔ ${bad}/${T.length}` :
    `\n🟢 ${T.length}/${T.length} · למסננת יש שיניים: שני התרגומים שנמצאו בפועל ` +
    'חסרים צפים, ושני תרגומים מלאים אינם צפים.\n' +
    '⚠ ועדיין: יחס נמוך הוא חשד, וההכרעה בקריאה.');
  process.exit(bad ? 1 : 0);
}

const w = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'data-en-sentences.js'), 'utf8'))(w);
const rows = Object.entries(w.EX_SENT_EN)
  .map(([k, [en, he]]) => {
    const m = missing(en, he);
    return { k, en, he, ...ratio(en, he), miss: m.out, checked: m.checked };
  })
  .sort((a, b) => b.miss.length - a.miss.length || a.r - b.r);
const flagged = rows.filter(r => r.miss.length);
const N = Number(process.argv[2]) || flagged.length;

if (process.argv.includes('--tsv')) {
  rows.slice(0, N).forEach(r =>
    console.log([r.k, r.en, r.he, r.miss.join(' ')].join('\t')));
  process.exit(0);
}
const totChecked = rows.reduce((a, r) => a + r.checked, 0);
console.log('='.repeat(70));
console.log(`${rows.length} תרגומים · ${totChecked} מילים נבדקו מול הבנק ` +
  `(ממוצע ${(totChecked / rows.length).toFixed(1)} לפריט)`);
console.log(`⚠ מה שלא נבדק: מילה שאינה ערך בבנק, כמו \`gala\`. עליה אין מילון, והיא`);
console.log('   נשארת לקריאה ולא נספרת כתקינה.');
console.log(`חשודים בהשמטה: **${flagged.length}** (${(flagged.length / rows.length * 100).toFixed(1)}%)`);
console.log('='.repeat(70));
flagged.slice(0, N).forEach(r =>
  console.log(`■ ${r.k}  ← חסר: ${r.miss.join(' · ')}\n   EN: ${r.en.replace(/<\/?b>/g, '')}\n   HE: ${r.he.replace(/<\/?b>/g, '')}`));
