/* מחיל תיקוני תרגום שנמצאו בסבב שלמות התרגום, אחרי שער.
 *
 *   node sentences-en/apply_trans_fix.js <קובץ out> [עוד...]
 *   node sentences-en/apply_trans_fix.js --selftest
 *
 * הקלט: `מילה \t התרגום המתוקן \t מה היה חסר`.
 *
 * ⛔ למה שער ולא העתקה: כאן, בשונה מהדגשה, **התוכן עצמו משתנה.** התרגומים עברו
 * סבב כתיבה וסבב אימות, ותיקון נקודתי הוא בדיוק הדבר שיכול לשכתב משפט שלם בלי
 * שאיש שם לב. לכן שלוש דרישות שנבדקות על כל שורה:
 *   1. עברית תקינה לפי אותם כללים של check_trans.py — בלי לטינית, בלי ניקוד, בלי
 *      מקף ארוך, אורך 10 עד 140, נגמר בסימן סוף משפט.
 *   2. **תיקון מינימלי.** לפחות מחצית ממילות התרגום המקורי נשארות. שכתוב מלא נדחה
 *      גם אם הוא עברית טובה: תרגום חדש לגמרי הוא לא מה שהתבקש כאן.
 *   3. שינוי בפועל. שורה שזהה למקור אינה תיקון, והיא נספרת בנפרד ולא "עוברת".
 *
 * ⚠ תופעת לוואי מכוונת: כל מילה שתרגומה שונה **נמחקת מהסימון הידני**, כי הסימון
 * הצביע על הטקסט הקודם. mark_he יסמן אותה מחדש, ומה שלא יצליח יגיע ל-todo. בלי
 * המחיקה הזאת שער ההדגשה היה דוחה אותה לנצח בטענה ש"התרגום שונה".
 */
const fs = require('fs'), path = require('path');
const HERE = __dirname;

const HEB = /[א-ת]/, LAT = /[A-Za-z]/, NIQ = /[֑-ׇ]/;
function bad(he) {
  const p = [];
  if (!he) return ['ריק'];
  if (!HEB.test(he)) p.push('אין עברית');
  if (LAT.test(he)) p.push('אותיות לטיניות');
  if (he.includes('—')) p.push('מקף ארוך');
  if (he.includes('·')) p.push('·');
  if (NIQ.test(he)) p.push('ניקוד');
  if (he.includes('  ')) p.push('רווח כפול');
  if (he.includes('**')) p.push('סימון הדגשה בתוך התרגום');
  if (he.length < 10 || he.length > 140) p.push(`אורך ${he.length}`);
  if (!'.?!'.includes(he.slice(-1))) p.push('בלי סוף משפט');
  return p;
}
/* שיעור מילות המקור שנשמרו. תיקון מינימלי משמר את רוב המשפט. */
function kept(orig, next) {
  const a = orig.match(/[א-ת]+/g) || [], b = new Set(next.match(/[א-ת]+/g) || []);
  if (!a.length) return 1;
  return a.filter(w => b.has(w)).length / a.length;
}
const MIN_KEPT = 0.5;

function check(orig, next) {
  if (orig == null) return { ok: false, why: 'מילה שאינה במאגר' };
  if (next === orig) return { ok: false, why: 'זהה למקור, אין תיקון', same: true };
  const p = bad(next);
  if (p.length) return { ok: false, why: p.join('; ') };
  const k = kept(orig, next);
  if (k < MIN_KEPT) return { ok: false, why: `שכתוב מלא (${Math.round(k * 100)}% מהמקור נשמר)` };
  return { ok: true, k };
}

if (process.argv.includes('--selftest')) {
  const orig = 'השחקן התלבש כראוי לאירוע הערב הרשמי.';
  const T = [
    ['תיקון מינימלי',       'השחקן התלבש כראוי לגאלה הרשמית של הערב.', true],
    ['⛔ זהה למקור',         orig, false],
    ['⛔ אות לטינית',        'השחקן התלבש כראוי לאירוע gala הרשמי.', false],
    ['⛔ מקף ארוך',          'השחקן התלבש כראוי — לאירוע הגאלה הרשמי.', false],
    ['⛔ בלי סוף משפט',      'השחקן התלבש כראוי לאירוע הגאלה הרשמי', false],
    ['⛔ שכתוב מלא',         'הוא הגיע בלבוש מתאים לחגיגה הגדולה שנערכה באותו לילה.', false],
    ['⛔ ניקוד',             'הַשחקן התלבש כראוי לאירוע הגאלה הרשמי.', false],
    /* ⚠ המחרוזת הראשונה שכתבתי כאן הייתה 115 תווים, כלומר **בתוך** הטווח, והשער
       קיבל אותה בצדק. הבדיקה הייתה שגויה ולא השער. עכשיו היא מעל 140. */
    ['⛔ ארוך מדי',          'השחקן התלבש כראוי לאירוע הגאלה הרשמי של הערב שנערך באולם הגדול שבמרכז העיר בנוכחות אורחים רבים מאוד מכל רחבי הארץ ומחוצה לה, וגם צלמים רבים היו שם.', false],
  ];
  let f = 0;
  T.forEach(([name, next, want]) => {
    const r = check(orig, next);
    if (r.ok !== want) { f++; console.log(`⛔ ${name}: קיבל ${r.ok} (${r.why || ''})`); }
    else console.log(`✅ ${name}${r.ok ? '' : ' → נדחה: ' + r.why}`);
  });
  console.log(f ? `\n⛔ ${f}/${T.length}` :
    `\n🟢 ${T.length}/${T.length} · לשער יש שיניים: הוא מקבל תיקון מינימלי **ודוחה**` +
    '\n   שכתוב מלא, לטינית, ניקוד, מקף ארוך, חוסר סוף משפט, ואורך חריג.');
  process.exit(f ? 1 : 0);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('נדרש קובץ פלט אחד לפחות'); process.exit(2); }
const heFile = path.join(HERE, 'sentences-en-he.tsv');
const he = new Map(fs.readFileSync(heFile, 'utf8').split(/\r?\n/).filter(Boolean)
  .map(l => l.split('\t')).map(([w, h]) => [w, h]));

let ok = 0, same = 0; const rej = [], done = [];
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split('\t');
    const word = c[0].trim(), next = (c[1] || '').trim(), why = (c[2] || '').trim();
    const r = check(word, next) && check(he.get(word), next);
    if (!r.ok) { if (r.same) same++; else rej.push([word, r.why, next.slice(0, 50)]); continue; }
    done.push([word, he.get(word), next, why]); he.set(word, next); ok++;
  }
}
if (ok) {
  fs.writeFileSync(heFile, [...he].map(e => e.join('\t')).join('\n') + '\n', 'utf8');
  /* מחיקת הסימון הידני של מה שהשתנה, כדי ש-mark_he יסמן מחדש על הטקסט החדש. */
  const manFile = path.join(HERE, 'he-bold-manual.tsv');
  if (fs.existsSync(manFile)) {
    const changed = new Set(done.map(d => d[0]));
    const rows = fs.readFileSync(manFile, 'utf8').split(/\r?\n/).filter(Boolean)
      .filter(l => !changed.has(l.split('\t')[0]));
    fs.writeFileSync(manFile, rows.join('\n') + '\n', 'utf8');
  }
}
console.log(`תוקנו ${ok} תרגומים · ${same} זהים למקור · ${rej.length} נדחו`);
done.forEach(([w, before, after, why]) =>
  console.log(`  ✏ ${w} (${why})\n     לפני: ${before}\n     אחרי: ${after}`));
rej.forEach(([w, why, v]) => console.log(`  ⛔ ${w}: ${why} | ${v}`));
if (ok) console.log('\nהצעד הבא: node sentences-en/mark_he.js  ואז  python sentences-en/gen_sent_js.py');
process.exit(rej.length ? 1 : 0);
