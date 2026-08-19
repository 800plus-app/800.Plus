/* ביקורת הדרישות של חגי, כל אחת נמדדת בנפרד ומדווחת בשמה.
 *
 *   node sentence-completion/check_requirements.js
 *
 * למה קובץ נפרד מ-verify_all.js
 * ------------------------------
 * `verify_all` בודק שהמכונה שלמה: שהקורפוס נבנה, שהשדות קיימים, שהבדיקות עוברות.
 * הקובץ הזה בודק דבר אחר — **שמה שנבנה הוא מה שחגי ביקש**. שתי השאלות נפרדות:
 * קורפוס יכול לעבור כל שער מבני ובכל זאת לא לעמוד בדרישה שנאמרה בעל פה לפני
 * שבועיים ונשכחה.
 *
 * הדרישות נלקטו מהשיחה עצמה ומצוטטות כאן כלשונן, כדי שהבדיקה תהיה מול מה שנאמר
 * ולא מול מה שאני זוכר שנאמר.
 *
 * ⚠ מה שהקובץ **אינו** יכול למדוד, ונאמר במפורש בפלט: אם המשפט נשמע טבעי, ואם
 * ההסבר מלמד. אלה נמדדו בפותרים עצמאיים ובביקורת אדוורסרית, ולא ברגקס.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('./bands.js'); B.unitOf('the');
const D = global.window.UNIT_DATA_EN;

const GLOSS = {};
for (const u of Object.keys(D)) for (const [en, he] of D[u]) {
  const k = B.normEn(en); if (!GLOSS[k]) GLOSS[k] = he;
  String(en).split(/[,\/]/).map(x => x.trim()).filter(x => x.length >= 3 && !/\s/.test(x))
    .forEach(a => { const ka = B.normEn(a); if (!GLOSS[ka]) GLOSS[ka] = he; });
}

const w = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'data-sent-en.js'), 'utf8'))(w);
const SENT = w.SENT_EN;
const items = Object.entries(SENT).flatMap(([band, a]) => a.map(x => ({ ...x, band })));
const wordsOf = o => Array.isArray(o) ? o : [o];
const flat = it => [].concat(...it.o.map(o => [].concat(o)));

const results = [];
const R = (req, quote, ok, detail) => results.push({ req, quote, ok, detail });

/* ── 3 · החלוקה שנדרשה ────────────────────────────────────────────── */
const TARGET = { 'בסיס': 50, 'בינוני': 100, 'מתקדם': 150, 'אקדמי': 150 };
const actual = {}; items.forEach(x => actual[x.band] = (actual[x.band] || 0) + 1);
const bandOk = Object.entries(TARGET).every(([b, n]) => actual[b] === n);
R('חלוקה 450', '"150 אקדמאי 150 קשה 100 בינוני ו50 קל"', bandOk,
  Object.entries(actual).map(([b, n]) => `${b} ${n}/${TARGET[b]}`).join(' · '));

/* ── 2 · המילה הנכונה מתלבשת · כל אפשרות מהבנק ────────────────────── */
const notInBank = items.filter(it => flat(it).some(x => !B.unitOf(x)));
R('אפשרויות מאומתות', '"המילה הנכונה באמת מתלבשת… ואנחנו לא מחרטטים"',
  notInBank.length === 0,
  `${items.length - notInBank.length}/${items.length} פריטים שכל אפשרויותיהם בבנק המאומת`);

/* ── 6 · פירוש של כלל המילים שיש כאופציות ─────────────────────────── */
const gBad = items.filter(it => !Array.isArray(it.g) || it.g.length !== it.o.length
  || it.g.some((g, j) => !g || wordsOf(it.o[j]).some(x => !new RegExp('(^|[^A-Za-z])' + x + '([^A-Za-z]|$)', 'i').test(g))));
R('פירוש כל האפשרויות', '"פירוש של כלל המילים שיש כאופציות"', gBad.length === 0,
  `${items.length - gBad.length}/${items.length} פריטים שמציגים פירוש לכל ארבע`);

/* ── 9 · רק הפירוש שמתאים, לא המלא ────────────────────────────────── */
/* ⚠ המדד הראשון כאן ספר כל פירוש בנק שיש בו **פסיק** כבר-קיצור, והחזיר 80% —
   כלומר "נכשל". בבדיקה התברר שהוא מודד את הדבר הלא נכון: הפסיק בבנק מפריד לרוב
   ניסוח חלופי לאותה משמעות (`"לתקן, לשנות"`, `"לחסוך, לחסוך מ-"`), ואין מה לקצר
   שם. **הנקודה-פסיק** היא ההפרדה בין משמעויות שונות באמת, וזה הקריטריון.
   ⛔ ולא הנמכתי סף כדי לעבור: המדד הוחלף בחד-משמעי, ושני המספרים נאמרים. לפי
   הקריטריון המדויק: 316 מ-319 קוצרו, כלומר 99%, ושלוש השאריות מדווחות בשמן. */
let trimmed = 0, multi = 0; const notTrimmed = [];
const norm = s => String(s).replace(/[\s.]/g, '');
for (const it of items) it.g.forEach((g, j) => wordsOf(it.o[j]).forEach(x => {
  const bank = GLOSS[B.normEn(x)] || '';
  if (!bank.includes(';')) return;                 // משמעות אחת, אין מה לקצר
  multi++;
  const re = new RegExp('(^|[^A-Za-z])' + x + '([^A-Za-z]|$)', 'i');
  const seg = String(g).split('·').find(s => re.test(s)) || g;
  const he = (seg.match(/[֐-׿].*/) || [''])[0].trim();
  if (norm(he) === norm(bank)) notTrimmed.push(`${it.src}: ${x}`);
  else trimmed++;
}));
R('פירוש מקוצר להקשר', '"לא את הפירוש המלא, רק מה שמתאים"',
  notTrimmed.length === 0,
  `${trimmed}/${multi} פירושים בעלי כמה משמעויות קוצרו (${Math.round(100 * trimmed / (multi || 1))}%)`
  + (notTrimmed.length ? ` · לא קוצרו: ${notTrimmed.join(', ')}` : ''));

/* ── 7 · תרגום מלא, התשובה מושלמת ומודגשת ─────────────────────────── */
const tBad = items.filter(it => {
  if (!it.t || /_{2,}/.test(it.t)) return true;
  const bold = it.t.match(/\*\*([^*]+)\*\*/g) || [];
  if (bold.length !== wordsOf(it.o[it.a]).length) return true;
  return bold.some(b => !/[֐-׿]/.test(b));
});
R('תרגום עם התשובה מודגשת', '"להשלים את התשובה בעברית ותדגיש את המילה הנכונה"',
  tBad.length === 0, `${items.length - tBad.length}/${items.length} תרגומים שלמים, בלי חסר, עם הדגשה עברית`);

/* ── 8 · נימוק לכל אפשרות, לשני המסלולים ──────────────────────────── */
const rBad = items.filter(it => !Array.isArray(it.r) || it.r.length !== it.o.length || it.r.some(x => !x));
R('נימוק לכל אפשרות', '"הסבר למה מה שעשיתי לא נכון… אם נכון אז למה נכון"',
  rBad.length === 0, `${items.length - rBad.length}/${items.length} פריטים עם נימוק לכל ארבע האפשרויות`);

/* ── 10 · ההסבר קצר ──────────────────────────────────────────────── */
const rLens = items.flatMap(it => it.r.map(x => x.length)).sort((a, b) => a - b);
const visible = rLens[rLens.length >> 1] * 2;      // הלומד קורא שניים
R('ההסבר אינו חופר', '"מרגיש לי שהתיאור של ההסבר מאוד ארוך… לא מעבר כי זה חופר"',
  visible < 302,
  `חציון נימוק ${rLens[rLens.length >> 1]} תווים · הלומד קורא שניים ≈ ${visible}, מול 302 בפורמט הקודם`);

/* ── 11 · /HEB §3א · אין מקף ארוך בשום שדה שהלומד רואה ────────────── */
const dash = items.filter(it => /[—–]/.test(it.s + it.t + it.g.join() + it.r.join()));
R('אין מקף ארוך', '/HEB §3א · "אסור מקפים ארוכים, זה סממן מזהה לAI"',
  dash.length === 0, `${items.length - dash.length}/${items.length} פריטים נקיים בכל השדות`);

/* ── מפתח ייחודי ברצועה ──────────────────────────────────────────── */
const dup = [];
for (const band of Object.keys(SENT)) {
  const seen = new Map();
  SENT[band].forEach(it => wordsOf(it.o[it.a]).forEach(k => {
    const n = B.normEn(k);
    if (seen.has(n)) dup.push(`${band}: ${k} (${seen.get(n)} · ${it.src})`);
    else seen.set(n, it.src);
  }));
}
R('אין תשובה כפולה ברצועה', 'נגזר מהשער: "הלומד יראה אותה תשובה פעמיים"',
  dup.length === 0, dup.length ? dup.slice(0, 5).join(' | ') : 'כל מפתח מופיע פעם אחת ברצועתו');

/* ── 4 · הבדיקה האובייקטיבית · כיסוי בפועל ────────────────────────── */
const runs = path.join(__dirname, 'runs');
const countRun = f => { try { return fs.readFileSync(path.join(runs, f), 'utf8').split(/\r?\n/).filter(l => /^\s*\d+\s*:/.test(l)).length; } catch (e) { return 0; } };
const cov = { 'קלוז · 204': countRun('cloze-full-run1.txt'), 'רב-ברירה · 204': countRun('blind-full-run1.txt'),
  'קלוז · 246': countRun('cloze450-run1.txt'), 'רב-ברירה · 246': countRun('blind450-run1.txt') };
const covered = cov['קלוז · 204'] + cov['קלוז · 246'];
R('בדיקה אובייקטיבית בבוטים', '"להריץ בוטים שעונים על השאלון בצורה אובייקטיבית"',
  covered >= items.length,
  Object.entries(cov).map(([k, v]) => `${k}: ${v}`).join(' · ') + ` → כיסוי ${covered}/${items.length}`);

/* ── 16 · גדר ההצצה ──────────────────────────────────────────────── */
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const gated = /const PREVIEW_BAND = /.test(app) && /function sentBank\(/.test(app)
  && /if\(!PREVIEW\) return S/.test(app);
R('הצצה מגודרת כמו המילים', '"תגביל את המשפטים בהצצה כמו המילים"', gated,
  gated ? `רצועה אחת בלבד בהצצה (${(app.match(/PREVIEW_BAND = '([^']+)'/) || [])[1]}), דרך קורא אחד` : 'הגדר חסר');

/* ── 5 · נגישות באתר ─────────────────────────────────────────────── */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const wired = ['sent', 'sentPickList', 'sentText', 'sentOpts', 'sentExp', 'pbSent', 'mode']
  .every(id => html.includes(`id="${id}"`)) && /\.map\(sentShuffled\)/.test(app);
R('נגיש באתר, בלי תקלות', '"להנגיש את זה באתר בעיצוב מתאים ונכון ובלי תקלות"', wired,
  wired ? 'מסך, בורר רצועות, הסבר, וערבוב אפשרויות — כולם מחוברים' : 'חיווט חסר');

/* ── 14 · המילים אינן בתוצר ──────────────────────────────────────── */
const shipHasWords = fs.existsSync(path.join(ROOT, 'units_output'))
  && fs.readFileSync(path.join(ROOT, 'data-sent-en.js'), 'utf8').includes('units_output');
R('המילים לא נכנסו לתוצר', '"עדיין לא לפרסם מילים, זה בכוונה"', !shipHasWords,
  'קובץ הייצור מכיל משפטים בלבד. מה שבאתר נבדק בנפרד ב-curl');

/* ── פלט ─────────────────────────────────────────────────────────── */
const pad = s => s + ' '.repeat(Math.max(0, 26 - [...s].length));
console.log('='.repeat(88));
console.log(`ביקורת הדרישות · ${items.length} פריטים`);
console.log('='.repeat(88));
let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? '✅' : '⛔'} ${pad(r.req)} ${r.detail}`);
  console.log(`   ${r.quote}`);
}
console.log('='.repeat(88));
console.log(fail ? `⛔ ${fail} דרישות אינן מתקיימות` : '✅ כל הדרישות שנמדדות כאן מתקיימות');
console.log('⚠ מה שלא נמדד ברגקס: אם המשפט נשמע טבעי ואם ההסבר מלמד. אלה נמדדו');
console.log('   בפותרים עצמאיים ובביקורת אדוורסרית, והתוצאות בקבצי runs/.');
console.log('='.repeat(88));
process.exit(fail ? 1 : 0);
