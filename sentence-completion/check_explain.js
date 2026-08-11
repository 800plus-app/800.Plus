/* שער הפורמט החדש של ההסבר. רץ על מנות הכתיבה, לא על הקורפוס המורכב.
 *
 *   node sentence-completion/check_explain.js              כל המנות
 *   node sentence-completion/check_explain.js base.json    מנה אחת
 *
 * הפורמט (אושר 10.8.2026): g = פירוש ארבע האפשרויות · t = תרגום המשפט לעברית
 * כשהחסר מושלם בתשובה הנכונה ומודגש · r = נימוק לכל אפשרות.
 *
 * ⛔ השער החשוב כאן הוא **נאמנות לבנק**
 * ------------------------------------
 * הכותבים מקצרים את פירוש הבנק להקשר ("להציל; לחסוך, לחסוך מ-; לשמור" → "לחסוך"),
 * ולכן הסיכון הוא שיכתבו פירוש **חדש** במקום לקצר. פירוש חדש = סתירה בין מה
 * שהלומד רואה במשפטים לבין מה שהוא רואה ביחידות, וגם חשיפה: פירוש שאינו מהבנק
 * שלנו אינו מאומת. לכן כל מילת תוכן בפירוש המקוצר חייבת להופיע בפירוש הבנק.
 *
 * ⚠ מה שהשער **לא** בודק: אם הפירוש שנבחר הוא באמת המשמעות הרלוונטית. מילה
 * שלגיטימי לקצר ל"לשמור" ובהקשר צריך "לחסוך" תעבור. זו שיפוט אנושי בדגימה.
 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'batches');
const only = process.argv[2];

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
  String(en).split(/[,\/]/).map(x => x.trim())
    .filter(x => x.length >= 3 && !/\s/.test(x)).forEach(a => put(norm(a)));
}

const wordsOf = o => Array.isArray(o) ? o : [o];
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (t, w) => new RegExp('(^|[^A-Za-z])' + esc(w) + '([^A-Za-z]|$)', 'i').test(t);
/* מילות תוכן עבריות בלבד; מילות קישור וכינויים מותרים בקיצור. */
const STOP = new Set(['של', 'את', 'עם', 'או', 'גם', 'לא', 'אל', 'על', 'מן', 'כי',
  'זה', 'מה', 'הוא', 'היא', 'אין', 'יש', 'כך', 'רק', 'אך', 'ו', 'ל', 'ב', 'מ', 'ה']);
const heWords = s => (String(s).match(/[֐-׿]+/g) || []).filter(w => !STOP.has(w));
/* גרעין המילה — הבנק כותב "לחסוך, לחסוך מ-" והכותב עשוי לכתוב "חיסכון".
   משווים בלי אותיות שימוש פותחות, כדי לא לפסול נטייה לגיטימית. */
const stem = w => w.replace(/^[להומשוכב]{1,2}/, '').slice(0, 3);

/* ⚠ תוקן ב-11.8 אחרי שכותב מנת בינוני דיווח שהשער פוסל נטיות לגיטימיות.
   הדוגמה שהוא הביא הייתה שגויה (`להתפשט` ו-`התפשטות` **כן** נפגשים), אבל **הטענה
   נכונה ואף חמורה ממה שהוא תיאר**. נמדד על שמונה זוגות פועל↔שם-עצם של אותו שורש:
       לחסוך/חיסכון  להגן/הגנה  לשמור/שמירה  להעביר/העברה  לכנס/כינוס  להפריך/הפרכה
   **שישה מתוך שמונה נפלו.** `stem` חותך שלוש אותיות אחרי הסרת אות שימוש אחת או
   שתיים, והאותיות ה"נופלות" בבניין שם-הפעולה (י, ו) מזיזות את החלון.
   ⚠ הנזק אינו כשל אלא **הטיה שקטה**: הכותב מקבל דגל על ניסוח נכון, וכדי להישאר
   ב-"0 דגלים" הוא בוחר מילה גרועה יותר. אחד הכותבים באמת נטש מילת מפתח בגלל זה.

   ⭐ התיקון **מתיר בלבד ואינו מחמיר**: הוא נוסף כחלופה ל-`stem`, ולכן הוא יכול רק
   להסיר דגלים ולא להוסיף. זו הסיבה שהיה בטוח להחיל אותו באמצע סבב שבו ארבעה
   כותבים עובדים — שינוי מחמיר היה מציף דגלים על 258 פריטים בבת אחת.

   ההשוואה: מסירים אותיות שימוש פותחות **וגם** את א/ו/י/ה הנופלות בתוך המילה, ואז
   דורשים רצף של שלוש אותיות משותף. שלוש עצורים משותפים הם שורש, ולא צירוף מקרים. */
const skel = w => w.replace(/^[להומשוכב]{1,2}/, '').replace(/[אוהי]/g, '');
const related = (a, b) => {
  if (stem(a) === stem(b)) return true;
  const x = skel(a), y = skel(b);
  if (x.length < 3 || y.length < 3) return x === y && x.length > 0;
  return x.includes(y.slice(0, 3)) || y.includes(x.slice(0, 3));
};

/* ⛔ הוכחת שיניים. השער הראשון כאן דיווח "0 דגלים" בזמן שהתנאי שלו קרס לשקר
   תמיד, וחמש מנות נבדקו לשווא. מכאן שכל טענת "נקי" מחייבת קודם הדגמה שהשער
   **כן** יורה על מקרה שאמור להיפסל.

     node sentence-completion/check_explain.js --selftest

   שותלים שלושה פירושים פסולים על פריט אמיתי ובודקים שכל אחד נתפס. אם אחד מהם
   עובר, השער שבור ואין להסתמך על שום ריצה שלו. */
/* נטייה מלאכותית לצורך הוכחת השיניים: פועל בשם המקור → שם פעולה. `לחסוך` → `חיסכון`.
   אינה חלק מהשער, ומשמשת רק כדי לייצר מקרה בדיקה של אותו שורש בצורה אחרת. */
const inflect = g => {
  const w = (String(g).match(/[֐-׿]+/g) || [])[0] || '';
  return w.replace(/^ל/, '').replace(/^ה/, '') + 'ה';
};
if (process.argv.includes('--selftest')) {
  const first = JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf8'))[0];
  const w = wordsOf(first.o[0])[0], bank = GLOSS[norm(w)];
  const cases = [
    { name: 'פירוש מומצא שאינו בבנק', g: `${w} = לרקוד בגשם`, want: 'flag' },
    { name: 'מקף ארוך', g: `${w} = ${bank} — הסבר`, want: 'err' },
    { name: 'אינו מציג את המילה', g: `= ${bank}`, want: 'err' },
    { name: 'פירוש הבנק עצמו', g: `${w} = ${bank}`, want: 'clean' },
    /* ⭐ שני המקרים שנוספו ב-11.8 עם תיקון ההשוואה. הראשון מוכיח שהתיקון **מתיר**
       נטייה של אותו שורש, והשני מוכיח שהוא לא נהפך למתיר-הכול — בלעדיו התיקון היה
       יכול לבטל את השער בשקט וזה גרוע מהבאג המקורי. */
    { name: 'נטיית שורש מהבנק', g: `${w} = ${inflect(bank)}`, want: 'clean' },
    { name: 'שורש זר לגמרי', g: `${w} = לרקוד בגשם`, want: 'flag' },
  ];
  let fail = 0;
  for (const c of cases) {
    const e = [], f = [];
    if (/[—–]/.test(c.g)) e.push('מקף');
    if (!hasWord(c.g, w)) e.push('חסרה המילה');
    if (bank) {
      const bw = heWords(bank);
      for (const hw of heWords(c.g)) if (!bw.some(x => related(hw, x))) { f.push(hw); break; }
    }
    const got = e.length ? 'err' : (f.length ? 'flag' : 'clean');
    const ok = got === c.want;
    if (!ok) fail++;
    console.log(`${ok ? '✅' : '⛔'} ${c.name.padEnd(28)} ציפייה ${c.want} · קיבל ${got}`);
  }
  console.log(fail ? `\n⛔ ${fail} מקרים נכשלו — אין להסתמך על השער` : '\n✅ לשער יש שיניים. המקרים הפסולים נתפסו והתקין עבר.');
  process.exit(fail ? 1 : 0);
}

const err = [], flag = [];
let n = 0, doneT = 0, doneR = 0, doneG = 0;
const files = fs.readdirSync(dir).filter(x => x.endsWith('.json')).filter(f => !only || f === only);

for (const f of files) {
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).forEach((it, i) => {
    const id = `${f}#${i + 1}`;
    const E = m => err.push(`${id} · ${m}`), F = m => flag.push(`${id} · ${m}`);
    n++;
    const key = wordsOf(it.o[it.a]);

    /* ---- g ---- */
    if (!Array.isArray(it.g) || it.g.length !== it.o.length) E('g אינו מערך בן ' + it.o.length);
    else {
      let ok = true;
      it.g.forEach((g, j) => {
        if (!g || /⛔/.test(g)) { E(`g[${j}] ריק או חסר פירוש בבנק`); ok = false; return; }
        if (/[—–]/.test(g)) { E(`g[${j}] מקף ארוך (HEB §3א)`); ok = false; }
        /* ⛔ תוקן ב-10.8, אחרי שהריצה הראשונה של השער המתוקן הפיקה 184 דגלים
           ו**רובם היו שקריים**. בפריט זוג `g[j]` מחזיק שני פירושים מופרדים ב-`·`:
               "yield = להפיק · harvest = לקצור"
           הגרסה הקודמת בדקה כל מילה עברית בכל המחרוזת מול הפירוש של **כל אחת**
           מהמילים לחוד, ולכן הכריזה ש"לקצור" אינו בפירוש של `yield` — נכון, והוא
           שייך ל-`harvest`. כל מילה נבדקת עכשיו מול המקטע שלה בלבד.
           ⚠ הלקח חוזר בפעם השלישית באותו פרויקט: שער שיורה אינו שער שצודק. */
        const segs = String(g).split('·').map(x => x.trim());
        wordsOf(it.o[j]).forEach(w => {
          if (!hasWord(g, w)) { E(`g[${j}] אינו מציג את "${w}"`); ok = false; }
          const bank = GLOSS[norm(w)];
          if (!bank) return;
          /* המקטע של המילה הזאת. פירוש בודד — המחרוזת כולה.
             ⚠ **משתנה מקומי, לא דריסה של `g`.** הגרסה הראשונה של התיקון כתבה
             `g = seg`, וזה היה מצמצם את `g` כבר במילה הראשונה של הזוג ומשאיר את
             השנייה נבדקת מול המקטע הלא שלה. */
          const seg = segs.find(s => hasWord(s, w));
          if (!seg) return;
          /* כל מילת תוכן בקיצור חייבת להיות מהפירוש בבנק.
           *
           * ⛔ תוקן ב-10.8 אחרי שכותב רצועת האקדמיה קרא את השער ולא הסתמך עליו.
           * הגרסה הראשונה נשאה איבר שני שמעולם לא היה יכול להיות אמת:
           *     !wordsOf(it.o[j]).some(x => hasWord(w, x))
           * `w` הוא תמיד חבר ב-`wordsOf(it.o[j])`, ולכן `hasWord(w, w)` אמת,
           * `.some` אמת, והשלילה שקר. התנאי כולו קרס לשקר תמיד ו**הדגל מעולם לא
           * נורה**. חמש מנות דיווחו "0 דגלים" והמספר הזה לא העיד על דבר.
           *
           * ⚠ זה אותו כשל שכבר תועד ב-fix_dashes.js: שער שנראה עובד, מדווח נקי,
           * ולא בודק את מה שהוא מצהיר עליו. מכאן שכל שער חדש חייב **הוכחת
           * שיניים** — הרצה על פירוש שתול שאמור להיפסל. ראה `--selftest`.
           *
           * האיבר המחוק היה מיותר מלכתחילה: `heWords` מסנן לאותיות עבריות בלבד,
           * ולכן המילה האנגלית עצמה כלל אינה נכנסת ללולאה. */
          const bankWords = heWords(bank);
          for (const hw of heWords(seg)) {
            if (!bankWords.some(bw => related(hw, bw))) {
              F(`g[${j}] "${hw}" אינו בפירוש הבנק של ${w} ("${bank}")`); break;
            }
          }
        });
        if (g.length > 80) F(`g[${j}] ארוך (${g.length} תווים) — קיצור להקשר, לא העתקה`);
      });
      if (ok) doneG++;
    }

    /* ---- t ---- */
    if (!it.t) { /* טרם נכתב */ }
    else {
      doneT++;
      if (/_{2,}/.test(it.t)) E('t עדיין מכיל חסר — ההכרעה היא להשלים בעברית');
      if (/[—–]/.test(it.t)) E('t מקף ארוך (HEB §3א)');
      const bold = it.t.match(/\*\*([^*]+)\*\*/g) || [];
      if (bold.length !== key.length)
        E(`t מדגיש ${bold.length} מילים, והתשובה היא ${key.length}`);
      if (/[A-Za-z]/.test(it.t.replace(/\*\*[^*]*\*\*/g, '')))
        F('t מכיל אנגלית מחוץ להדגשה');
      /* ההדגשה חייבת להיות עברית — היא התרגום, לא המילה האנגלית. */
      bold.forEach(b => { if (!/[֐-׿]/.test(b)) E(`t מדגיש "${b}" שאינו עברית`); });
    }

    /* ---- r ---- */
    if (!Array.isArray(it.r) || it.r.length !== it.o.length) E('r אינו מערך בן ' + it.o.length);
    else {
      const filled = it.r.filter(Boolean).length;
      if (filled === it.o.length) doneR++;
      it.r.forEach((x, j) => {
        if (!x) return;
        if (/[—–]/.test(x)) E(`r[${j}] מקף ארוך (HEB §3א)`);
        if (!wordsOf(it.o[j]).some(w => hasWord(x, w)))
          F(`r[${j}] אינו מזכיר את "${wordsOf(it.o[j]).join('+')}" בשמה`);
        if (x.length > 220) F(`r[${j}] ארוך (${x.length} תווים)`);
      });
      /* נימוק התשובה הנכונה הוא היחיד שחייב תמיד להיות חיובי ולא שלילה. */
      if (it.r[it.a] && /^\s*(לא|אין|אינו|אינה)\b/.test(it.r[it.a]))
        F('r של התשובה הנכונה נפתח בשלילה');
    }
  });
}

const pct = x => `${x}/${n} (${Math.round(x / n * 100)}%)`;
console.log('='.repeat(60));
console.log(`${n} פריטים · g מוכן ${pct(doneG)} · t נכתב ${pct(doneT)} · r מלא ${pct(doneR)}`);
if (err.length) { console.log(`\n⛔ ${err.length} כשלים:`); err.slice(0, 40).forEach(x => console.log('  ' + x)); if (err.length > 40) console.log(`  ... ועוד ${err.length - 40}`); }
if (flag.length) { console.log(`\n⚠ ${flag.length} דגלים (שיפוט, לא כשל):`); flag.slice(0, 30).forEach(x => console.log('  ' + x)); if (flag.length > 30) console.log(`  ... ועוד ${flag.length - 30}`); }
console.log('\n' + (err.length ? '⛔ השער נכשל' : (doneT === n && doneR === n ? '✅ השער עבר והפורמט שלם' : '⏳ השער עבר על מה שנכתב, הפורמט עדיין חלקי')));
console.log('='.repeat(60));
