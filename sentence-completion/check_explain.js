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
        wordsOf(it.o[j]).forEach(w => {
          if (!hasWord(g, w)) { E(`g[${j}] אינו מציג את "${w}"`); ok = false; }
          const bank = GLOSS[norm(w)];
          if (!bank) return;
          /* כל מילת תוכן בקיצור חייבת להיות מהפירוש בבנק. */
          const bankStems = new Set(heWords(bank).map(stem));
          for (const hw of heWords(g)) {
            if (!bankStems.has(stem(hw)) && !wordsOf(it.o[j]).some(x => hasWord(w, x))) {
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
