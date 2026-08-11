/* מחיל סימוני הדגשה שנכתבו ידנית על `he-bold-manual.tsv`, אחרי שער.
 *
 *   node sentences-en/apply_he_bold.js <קובץ פלט> [עוד...]
 *   node sentences-en/apply_he_bold.js --selftest
 *
 * הקלט: שורות `מילה \t תרגום עם **סימון**`, או `מילה \t SKIP`.
 *
 * ⛔ למה יש כאן שער ולא רק העתקה: הסימון נכתב על ידי גורם שאינו הכלי, והדבר שאסור
 * שיקרה הוא **שכתוב שקט של התרגום**. תרגום שעבר ביקורת ידנית בסבבים, ומישהו "שיפר"
 * בו מילה תוך כדי הסימון, הוא שינוי תוכן שנכנס למאגר בלי שאיש בדק אותו. לכן כל שורה
 * נבדקת מול התרגום המקורי: הסרת הכוכביות חייבת להחזיר אותו תו-בתו, ואם לא — השורה
 * נדחית ונרשמת, ולא "כמעט מתקבלת".
 */
const fs = require('fs'), path = require('path');
const HERE = __dirname;

const HE = f => new Map(fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
  .map(l => l.split('\t')).map(([w, h]) => [w, h]));

/* בודק שורה אחת. מחזיר {ok:true} או {ok:false, why}. */
function check(word, val, orig) {
  if (orig == null) return { ok: false, why: 'מילה שאינה במאגר' };
  if (val === 'SKIP') return { ok: true, skip: true };
  if (val.replace(/\*\*/g, '') !== orig) return { ok: false, why: 'התרגום שונה, לא רק סומן' };
  const n = (val.match(/\*\*/g) || []).length;
  if (n !== 2) return { ok: false, why: `${n} כוכביות · נדרש מקטע אחד` };
  const m = val.match(/\*\*([^*]*)\*\*/);
  const span = m[1];
  if (!span.trim()) return { ok: false, why: 'מקטע ריק' };
  if (span !== span.trim()) return { ok: false, why: 'רווח בקצה המקטע' };
  if (!/[א-ת]/.test(span)) return { ok: false, why: 'מקטע בלי עברית' };
  /* גבול מילה: אות עברית מיד לפני או אחרי המקטע פירושה סימון של חצי מילה. */
  const i = val.indexOf('**'), j = val.indexOf('**', i + 2);
  const before = val[i - 1], after = val[j + 2];
  if (before && /[א-ת]/.test(before)) return { ok: false, why: 'המקטע מתחיל באמצע מילה' };
  if (after && /[א-ת]/.test(after)) return { ok: false, why: 'המקטע נגמר באמצע מילה' };
  return { ok: true };
}

if (process.argv.includes('--selftest')) {
  const orig = 'הוא בדק את הטלפון שלו כל הזמן, מדי דקה.';
  const T = [
    ['תקין',                'הוא בדק את הטלפון שלו **כל הזמן**, מדי דקה.', true],
    ['SKIP',                'SKIP', true],
    ['⛔ מילה שונתה',        'הוא בדק את המכשיר שלו **כל הזמן**, מדי דקה.', false],
    ['⛔ פיסוק שונה',        'הוא בדק את הטלפון שלו **כל הזמן** מדי דקה.', false],
    ['⛔ שני מקטעים',        'הוא **בדק** את הטלפון שלו **כל** הזמן, מדי דקה.', false],
    ['⛔ באמצע מילה',        'הוא בדק את הטלפון שלו כל ה**זמן**, מדי דקה.', false],
    ['⛔ רווח בקצה',         'הוא בדק את הטלפון שלו ** כל הזמן**, מדי דקה.', false],
    ['⛔ בלי סימון בכלל',    orig, false],
  ];
  let bad = 0;
  T.forEach(([name, val, want]) => {
    const r = check('x', val, orig);
    if (r.ok !== want) { bad++; console.log(`⛔ ${name}: קיבל ${r.ok} (${r.why || ''})`); }
    else console.log(`✅ ${name}${r.ok ? '' : ' → נדחה: ' + r.why}`);
  });
  console.log(bad ? `\n⛔ ${bad}/${T.length}` :
    `\n🟢 ${T.length}/${T.length} · לשער יש שיניים: הוא מקבל סימון תקין **ודוחה** ` +
    'שכתוב של מילה, של פיסוק, שני מקטעים, וסימון באמצע מילה.');
  process.exit(bad ? 1 : 0);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('נדרש קובץ פלט אחד לפחות'); process.exit(2); }
const hemap = HE(path.join(HERE, 'sentences-en-he.tsv'));
const manFile  = path.join(HERE, 'he-bold-manual.tsv');
const skipFile = path.join(HERE, 'he-bold-skip.tsv');
const man  = fs.existsSync(manFile)  ? HE(manFile)  : new Map();
const skip = new Set(fs.existsSync(skipFile)
  ? fs.readFileSync(skipFile, 'utf8').split(/\r?\n/).filter(Boolean) : []);

let ok = 0, sk = 0, rej = [];
for (const f of files) {
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [word, ...rest] = line.split('\t');
    const val = (rest[0] || '').trim();
    const r = check(word, val, hemap.get(word));
    if (!r.ok) { rej.push([word, r.why, val.slice(0, 60)]); continue; }
    /* ⚠ SKIP חייב גם **למחוק** סימון קיים. בגרסה הראשונה הוא רק הוסיף לרשימת
       הדילוג, ולכן סימון שנפסל ידנית נשאר בקובץ הידני והמשיך להופיע על המסך —
       פעולת ביטול שלא ביטלה דבר. נתפס על `and`, שסימונו `ותה` כלל את המילה `תה`. */
    if (r.skip) { skip.add(word); man.delete(word); sk++; continue; }
    man.set(word, val); ok++;
  }
}
fs.writeFileSync(manFile, [...man].map(e => e.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync(skipFile, [...skip].join('\n') + (skip.size ? '\n' : ''), 'utf8');

console.log(`נקלטו ${ok} סימונים · ${sk} SKIP · נדחו ${rej.length}`);
rej.slice(0, 25).forEach(([w, why, v]) => console.log(`  ⛔ ${w}: ${why} | ${v}`));
if (rej.length > 25) console.log(`  ... ועוד ${rej.length - 25}`);
console.log(`\nהקבצים: he-bold-manual.tsv (${man.size}) · he-bold-skip.tsv (${skip.size})`);
console.log('הצעד הבא: node sentences-en/mark_he.js  ואז  python sentences-en/gen_sent_js.py');
process.exit(rej.length ? 1 : 0);
