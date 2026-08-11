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
  /* ⚠ עד 4 מקטעים, ולא אחד. הדרישה "מקטע אחד" הייתה נכונה למילה בודדת ושגויה
     לצירוף מתאם: ב-`not only... but also...` האנגלית מדגישה **ארבע** מילים בשני
     מקומות, ובעברית סומן `לא רק` בלבד — כלומר `אלא גם` נשאר בלי הדגשה, וחצי
     הצירוף נעלם מהלומד. נמצא בבדיקה על הנתונים החיים, על תשעה פריטים כאלה. */
  if (n < 2 || n > 8 || n % 2) return { ok: false, why: `${n} כוכביות · נדרש מספר זוגי, עד 4 מקטעים` };
  /* גבול מילה: אות עברית מיד לפני או אחרי מקטע פירושה סימון של חצי מילה. */
  let pos = 0;
  for (let k = 0; k < n / 2; k++) {
    const i = val.indexOf('**', pos), j = val.indexOf('**', i + 2);
    const span = val.slice(i + 2, j);
    if (!span.trim()) return { ok: false, why: `מקטע ${k + 1} ריק` };
    if (span !== span.trim()) return { ok: false, why: `רווח בקצה מקטע ${k + 1}` };
    if (!/[א-ת]/.test(span)) return { ok: false, why: `מקטע ${k + 1} בלי עברית` };
    if (/[א-ת]/.test(val[i - 1] || '')) return { ok: false, why: `מקטע ${k + 1} מתחיל באמצע מילה` };
    if (/[א-ת]/.test(val[j + 2] || '')) return { ok: false, why: `מקטע ${k + 1} נגמר באמצע מילה` };
    pos = j + 2;
  }
  return { ok: true };
}

if (process.argv.includes('--selftest')) {
  const orig = 'הוא בדק את הטלפון שלו כל הזמן, מדי דקה.';
  const T = [
    ['תקין',                'הוא בדק את הטלפון שלו **כל הזמן**, מדי דקה.', true],
    ['SKIP',                'SKIP', true],
    ['⛔ מילה שונתה',        'הוא בדק את המכשיר שלו **כל הזמן**, מדי דקה.', false],
    ['⛔ פיסוק שונה',        'הוא בדק את הטלפון שלו **כל הזמן** מדי דקה.', false],
    /* שני מקטעים מותרים: צירוף מתאם מודגש בשני מקומות. */
    ['שני מקטעים',          'הוא **בדק** את הטלפון שלו **כל** הזמן, מדי דקה.', true],
    ['⛔ מספר אי-זוגי',      'הוא בדק את הטלפון שלו **כל הזמן, מדי דקה.', false],
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
    `\n🟢 ${T.length}/${T.length} · לשער יש שיניים: הוא מקבל סימון תקין ושני מקטעים ` +
    'לצירוף מתאם, **ודוחה** שכתוב של מילה, שכתוב של פיסוק, סימון שלא נסגר, ' +
    '\n   וסימון שמתחיל באמצע מילה.');
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
    /* ⚠ וגם ההיפך: סימון שנקלט חייב לצאת מרשימת הדילוג. `mark_he` בודק את הדילוג
       **לפני** הסימון הידני, ולכן פריט שנפסל פעם ואחר כך סומן היה נשאר בלי הדגשה
       והסימון החדש היה נשמט בשקט. נתפס על `either`/`whether`/`neither`, שנפסלו
       כשהכלל התיר מקטע אחד ונסמנו ברגע שהותרו שניים. */
    man.set(word, val); skip.delete(word); ok++;
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
