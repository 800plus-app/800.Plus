/* זורע את שדות הפורמט החדש בכל מנות הכתיבה, מכני בלבד.
 *
 *   node sentence-completion/seed_explain.js --dry
 *   node sentence-completion/seed_explain.js
 *
 * הפורמט שחגי אישר (10.8.2026), בשלושה חלקים בסדר הזה:
 *   1. `g[]` — פירוש של **כל ארבע** האפשרויות.
 *   2. `t`   — תרגום מלא של המשפט לעברית, כשהחסר **מושלם** בתשובה הנכונה
 *              והיא מודגשת ב-`**…**`.
 *   3. `r[]` — נימוק לכל אפשרות: למה מה שבחרתי שגוי, או למה נכון.
 *
 * ⚠ מה הסקריפט **לא** עושה: הוא לא כותב עברית. הוא רק חוסך לכותבים את העבודה
 * המכנית — שולף את פירוש הבנק כנקודת פתיחה ומפצל את `e` הקיים לנימוקים.
 * הקיצור לפי הקשר (הכרעה א׳) והתרגום (הכרעה ב׳) הם עבודת יד.
 *
 * למה הפיצול אפשרי בכלל: נמדד ב-audit_e.js — **201 מ-204** ההסברים הקיימים
 * מזכירים את כל ארבע האפשרויות בשמן. הנימוקים כבר כתובים, הם רק דחוסים לפסקה
 * אחת שחציונה 302 תווים. זה פיצול, לא כתיבה מאפס.
 */
const fs = require('fs'), path = require('path');
const DRY = process.argv.includes('--dry');
const dir = path.join(__dirname, 'batches');

/* ---- פירושי הבנק ---- */
if (!global.window) global.window = {};
require(path.join(__dirname, '..', 'data-en.js'));
const D = global.window.UNIT_DATA_EN;
const norm = s => String(s).normalize('NFKC').toLowerCase().trim()
  .replace(/^(to|a|an|the)\s+/, '').replace(/[-–—/|]/g, ' ')
  .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const GLOSS = {};
for (const u of Object.keys(D)) for (const [en, he] of D[u]) {
  const put = k => { if (k && !GLOSS[k]) GLOSS[k] = he; };
  put(norm(en));
  /* אותו פיצול צורות חלופיות כמו ב-bands.js — אחרת פעלים חריגים חסרי פירוש. */
  String(en).split(/[,\/]/).map(x => x.trim())
    .filter(x => x.length >= 3 && !/\s/.test(x)).forEach(a => put(norm(a)));
}

/* ---- פיצול `e` לנימוק לכל אפשרות ---- */
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = o => Array.isArray(o) ? o : [o];
const hasWord = (txt, w) => new RegExp('(^|[^A-Za-z])' + esc(w) + '([^A-Za-z]|$)', 'i').test(txt);

/* חיתוך למשפטים. עברית מסתיימת בנקודה, אבל נקודה מופיעה גם בתוך `a clause is
   amended.` בסוגריים — ולכן לא חותכים בתוך סוגריים. */
function sentences(e) {
  const out = []; let buf = '', depth = 0;
  for (const ch of String(e)) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    buf += ch;
    if (ch === '.' && depth === 0) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/* משפט מוקצה לאפשרות שהוא מזכיר. מזכיר כמה — הולך לפי המילה הראשונה שמופיעה בו,
   כי בעברית שלנו הנושא נפתח במילה הנידונה ("spend חל על כסף ש..."). */
function splitReasons(it) {
  const r = it.o.map(() => []);
  const spare = [];
  for (const s of sentences(it.e || '')) {
    let best = -1, at = Infinity;
    it.o.forEach((o, i) => {
      for (const w of wordsOf(o)) {
        if (!hasWord(s, w)) continue;
        const p = s.search(new RegExp('(^|[^A-Za-z])' + esc(w) + '([^A-Za-z]|$)', 'i'));
        if (p >= 0 && p < at) { at = p; best = i; }
      }
    });
    if (best >= 0) r[best].push(s); else spare.push(s);
  }
  /* משפט כללי שלא הזכיר אף אפשרות שייך להסבר התשובה הנכונה. */
  if (spare.length) r[it.a] = r[it.a].concat(spare);
  return r.map(x => x.join(' ').trim());
}

let items = 0, gMissing = [], rEmpty = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  const p = path.join(dir, f);
  const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  arr.forEach((it, i) => {
    const src = `${f}#${i + 1}`;
    it.g = it.o.map(o => wordsOf(o).map(w => {
      const he = GLOSS[norm(w)];
      if (!he) gMissing.push(`${src} :: ${w}`);
      return he ? `${w} = ${he}` : `${w} = ⛔`;
    }).join(' · '));
    const r = splitReasons(it);
    r.forEach((x, j) => { if (!x) rEmpty.push(`${src} :: ${wordsOf(it.o[j]).join('+')}`); });
    it.r = r;
    if (it.t === undefined) it.t = '';          // ⚠ נכתב ביד, לא נזרע
    items++;
  });
  if (!DRY) fs.writeFileSync(p, JSON.stringify(arr, null, 1), 'utf8');
}

console.log(`נזרעו ${items} פריטים${DRY ? '  (ריצה יבשה — לא נכתב)' : ''}`);
console.log(`  g — פירוש גולמי מהבנק · חסרים: ${gMissing.length}`);
gMissing.slice(0, 10).forEach(x => console.log('     ' + x));
console.log(`  r — נימוק שנחלץ מ-e · ריקים שדורשים כתיבה: ${rEmpty.length}`);
rEmpty.slice(0, 20).forEach(x => console.log('     ' + x));
console.log(`  t — תרגום · 0 מתוך ${items} נכתבו (כולם עבודת יד)`);
