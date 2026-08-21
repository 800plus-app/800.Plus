'use strict';
/* כמה מ-550 ממצאי הביקורת באמת פוסלים לומד שיודע את המילה — היום, באפליקציה.
 *
 * לכל ממצא: מחלצים את **המקטעים שההצעה מוסיפה** מעל הפירוש הקיים, ובודקים כל
 * אחד מהם דרך נתיב התשובה האמיתי (meaningMatch + glossAlts, בדיוק כמו app.js:2263).
 *
 * ⚠ למה זה נמדד ולא מונח: שכבת הנרדפות (`glossAlts`) כבר מקבלת חלק מהמובנים
 * החסרים דרך מילה אחרת שחולקת פירוש. ממצא כזה הוא שיפור בניסוח, לא תיקון של
 * פסילה. בדקתי 6 ידנית ואחד מהם (`acclaim`) כבר עבר — ולכן צריך למדוד את כולם.
 *
 *   node typo-lab/measure_audit_impact.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { loadApp } = require(path.join(ROOT, 'tests/_harness/sandbox.js'));

const c = loadApp({ lang: 'en' });
const w = c.window || c; w.Buffer = Buffer;
try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'typo-lex.js'), 'utf8'), w); } catch (e) {}

const card = t => c.BANK.find(x => c.K(x.term) === c.K(t));
/* הנתיב האמיתי · app.js:2260-2264 */
const accepted = (cd, typed) => {
  if (c.meaningMatch(typed, cd.meaning, cd)) return true;
  return (c.glossAlts(cd) || []).some(alt => c.isCorrect(typed, alt));
};
/* מקטעי פירוש · הפונקציה של האפליקציה עצמה, לא פיצול משלי */
const segs = g => c.meaningSegs(String(g));
/* ⛔ הנרמול חייב להיות `norm` ולא `K`. במצב אנגלית `K` מרוקן כל מחרוזת עברית
   למחרוזת ריקה — K('עושר')==K('שפע')=='' — ולכן הגרסה הראשונה של הכלי הזה
   דיווחה "אין תוספת" ב-550 מתוך 550. המספר 0% הוא שחשף את זה. */
const nk = s => c.norm(String(s));

const L = fs.readFileSync(path.join(ROOT, 'typo-lab/out/gloss-audit.tsv'), 'utf8').split(/\r?\n/).filter(Boolean);
const head = L.shift().split('\t');
const rows = L.map(l => { const p = l.split('\t'), o = {}; head.forEach((h, i) => o[h] = p[i]); return o; });

const stat = { strong: { n: 0, blocked: 0, ok: 0, none: 0 }, med: { n: 0, blocked: 0, ok: 0, none: 0 } };
const examples = [];
let noCard = 0;

for (const r of rows) {
  const term = (r['מילה'] || '').trim(), prop = (r['ההצעה'] || '').trim();
  const cd = card(term);
  if (!cd) { noCard++; continue; }
  const bucket = (r['חוזק'] || '').trim() === 'חזק' ? stat.strong : stat.med;
  bucket.n++;
  const have = new Set(segs(cd.meaning).map(nk));
  const added = segs(prop).filter(s => !have.has(nk(s)));
  if (!added.length) { bucket.none++; continue; }
  /* נחסם = **לפחות מקטע אחד** שההצעה מוסיפה נפסל היום */
  const blockedSegs = added.filter(s => !accepted(cd, s));
  if (blockedSegs.length) {
    bucket.blocked++;
    if (bucket === stat.strong && examples.length < 12)
      examples.push({ term, now: cd.meaning, blocked: blockedSegs.join(' · ') });
  } else bucket.ok++;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '—';
console.log('=== האם התיקון פותח תשובה שנפסלת היום? ===');
console.log('  קבוצה'.padEnd(12) + 'ממצאים'.padStart(8) + 'פוסל היום'.padStart(13) + 'כבר מתקבל'.padStart(13) + 'אין תוספת'.padStart(12));
for (const [k, s] of [['חזק (3/3)', stat.strong], ['בינוני (2/3)', stat.med]])
  console.log('  ' + k.padEnd(12) + String(s.n).padStart(8) +
    (s.blocked + ' (' + pct(s.blocked, s.n) + ')').padStart(13) +
    (s.ok + ' (' + pct(s.ok, s.n) + ')').padStart(13) + String(s.none).padStart(12));
const T = stat.strong.blocked + stat.med.blocked, N = stat.strong.n + stat.med.n;
console.log('  ' + '-'.repeat(58));
console.log('  ⭐ סה"כ ממצאים שפותחים תשובה שנפסלת היום: ' + T + ' מתוך ' + N + ' (' + pct(T, N) + ')');
if (noCard) console.log('  ⚠ ' + noCard + ' ממצאים ללא כרטיס במאגר — לא נמדדו');
console.log();
console.log('=== דוגמאות · מה נפסל היום ===');
examples.forEach(e => console.log('  ' + e.term.padEnd(16) + '"' + e.now + '"'.padEnd(2) + '  ⛔ נפסל: ' + e.blocked));
