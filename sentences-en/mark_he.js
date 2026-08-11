/* מסמן את המילה המתורגמת בתוך תרגום משפט הדוגמה, ב-`**…**`.
 *
 *   node sentences-en/mark_he.js            מסמן, כותב, מדווח
 *   node sentences-en/mark_he.js --selftest הוכחת שיניים
 *
 * למה בכלל צריך כלי, ולא סימון ביד
 * ---------------------------------
 * 3,946 תרגומים. הסימון הוא הכרעה מכנית ברוב המקרים: הפירוש של המילה מ-`data-en.js`
 * מופיע בתרגום בצורה נטויה, ומה שנדרש הוא למצוא אותו. מה שאינו מכני נשאר בקובץ
 * `he-bold-todo.tsv` ומטופל בנפרד, ולא מנוחש.
 *
 * ⛔ הכלל שמחזיק את כל הכלי: **מוסיפים סימון, לא נוגעים בטקסט.** אחרי הסרת
 * הכוכביות התרגום חייב להיות זהה לתו לתרגום המקורי, וזה נבדק על כל שורה. הסיבה
 * שזה נאמר כאן ולא בהערה בסוף: תרגום ששוכתב בלי שאיש ביקש הוא שינוי תוכן שעבר
 * בלי ביקורת, וקובץ התרגומים הוא תוצר שנבדק ידנית בסבבים.
 *
 * ⚠ למה **לא** השתמשתי ב-`related` של `check_explain.js`
 * -----------------------------------------------------
 * הוא מתיר בכוונה: שם התפקיד שלו הוא לא להטריד כותב על נטייה לגיטימית, ומחיר
 * טעות הוא דגל מיותר. כאן מחיר טעות הוא **הדגשת המילה הלא נכונה בפני הלומד**,
 * וזה בדיוק ההיפך. נמדד עליו: `שני` ו-`השנה` יוצאים "קרובים" אצלו, מפני ששניהם
 * נשחקים ל-`נ` אחרי הסרת אותיות השימוש והאותיות הנופלות. לכן ההתאמה כאן היא
 * צורנית ומוגבלת: תחילית מוכרת, סופית נטייה מוכרת, וגרעין של שלוש אותיות לפחות.
 */
const fs = require('fs'), path = require('path');
const HERE = __dirname, ROOT = path.join(HERE, '..');

/* --- אותיות שימוש וסופיות נטייה. רשימה סגורה ומוצהרת, ולא ניחוש רגולרי --- */
const PRE  = ['כשה', 'שה', 'וה', 'לה', 'מה', 'בה', 'כה', 'ול', 'וב', 'ומ', 'וש',
              'ה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש'];
const SUF  = ['ותיה', 'ותיו', 'יהם', 'יהן', 'תיים', 'ים', 'ות', 'יה', 'יו', 'נו',
              'תי', 'תם', 'תן', 'כם', 'כן', 'הם', 'הן', 'ה', 'ת', 'י', 'ו', 'ם', 'ן'];
/* מילות תפקוד: גם אם התאמה צורנית עוברת עליהן, הדגשה שלהן חסרת ערך ומטעה. */
const STOP = new Set(['של', 'את', 'על', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן', 'אני',
  'אתה', 'את', 'לא', 'כל', 'יש', 'אין', 'גם', 'אבל', 'או', 'כי', 'אם', 'עם', 'כמו',
  'אחרי', 'לפני', 'בין', 'מאוד', 'רק', 'כבר', 'עוד', 'היה', 'הייתה', 'היו', 'להיות',
  'אז', 'שם', 'כאן', 'מה', 'מי', 'איך', 'למה', 'שלו', 'שלה', 'שלי', 'שלהם', 'ולא']);

/* ⚠ הגרסה הראשונה קילפה תחיליות **גם ממילת הפירוש**, ובגללה `שלישי` נשחק ל-`ליש`
   (ה-ש נחשבה אות שימוש) ולא נפגש עם `השלישית`. מילת פירוש היא לקסמה ואין בה אות
   שימוש; היחיד שכן, ה-ל של שם הפועל, מטופל במפורש. הקילוף חל על **המילה שבמשפט**. */
const cut = (w, list) => {
  const out = [w];
  for (const p of list) {
    if (list === PRE && w.startsWith(p) && w.length - p.length >= 3) { out.push(w.slice(p.length)); break; }
    if (list === SUF && w.endsWith(p)   && w.length - p.length >= 3) { out.push(w.slice(0, -p.length)); break; }
  }
  return out;
};
const gForms = g => {
  const s = new Set([g]);
  if (g.startsWith('ל') && g.length >= 4) s.add(g.slice(1));   // שם פועל
  [...s].forEach(x => cut(x, SUF).forEach(y => s.add(y)));
  return s;
};
const tForms = t => {
  const s = new Set();
  cut(t, PRE).forEach(x => cut(x, SUF).forEach(y => s.add(y)));
  return s;
};
/* גרעין ללא א/ו/י: מגשר בין בניינים (לאחד ↔ איחדה). שלוש אותיות לפחות, אחרת שתי
   מילים שאינן קשורות נפגשות על שני עצורים. */
const bare = w => { const b = w.replace(/[אוי]/g, ''); return b.length >= 3 ? b : null; };

/* ⚠ מחלקת כשל שנמדדה, ולכן היא כלל ולא הערה: מילות מספר. הפירוש `לאחד` נפגש
   צורנית עם **המספר** `אחד` שבתרגום ("למטה מרכזי אחד"), והפועל האמיתי `איחדה` לא
   נפגש איתו בכלל — כלומר הכלי היה מדגיש ללומד את המילה הלא נכונה, בביטחון מלא.
   מילת מספר מודגשת רק כשהפירוש **עצמו** הוא מילת מספר, וזה המצב ב-`2nd - second`. */
const NUMS = new Set(['אחד', 'אחת', 'שני', 'שתי', 'שניים', 'שתיים', 'שלוש', 'שלושה',
  'ארבע', 'ארבעה', 'חמש', 'חמישה', 'שש', 'שישה', 'שבע', 'שבעה', 'שמונה', 'תשע',
  'תשעה', 'עשר', 'עשרה', 'עשרים', 'שלושים', 'מאה', 'אלף', 'מיליון']);

/* דרגת ההתאמה בין מילת פירוש למילה בתרגום. null = אין התאמה.
   `inPhrase` מרפה את חסימת מילות התפקוד: בתוך צירוף רצוף `כל` היא רכיב לגיטימי. */
function level(gloss, tok, inPhrase) {
  if (!inPhrase && STOP.has(tok)) return null;
  if (!inPhrase && NUMS.has(tok) && !NUMS.has(gloss)) return null;
  if (gloss === tok) return 'exact';
  const G = gForms(gloss), T = tForms(tok);
  for (const g of G) if (g.length >= 3 && T.has(g)) return 'form';
  for (const g of G) { const bg = bare(g); if (!bg) continue;
    for (const t of T) if (bare(t) === bg) return 'root'; }
  return null;
}
const RANK = { exact: 0, form: 1, root: 2 };

/* מחזיר {start, end, how} או null. `he` הוא התרגום, `gl` מחרוזת הפירוש מ-data-en.js */
function findSpan(gl, he) {
  const toks = [...he.matchAll(/[א-ת]+/g)].map(m => ({ w: m[0], s: m.index, e: m.index + m[0].length }));
  if (!toks.length) return null;
  /* משמעויות לפי הסדר בבנק: הראשית ראשונה. `;` ו-`,` שניהם מפרידים כאן, מפני
     שהפירוש עשוי להיות "ליד, בערך; אודות" והמשמעות שבמשפט יכולה להיות כל אחת. */
  const senses = gl.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  const cand = [];
  senses.forEach((sense, si) => {
    const gw = sense.split(/\s+/).filter(x => /[א-ת]/.test(x) && x.length >= 2);
    if (!gw.length) return;
    if (gw.length > 1) {                       // צירוף: רצף מילים סמוכות בתרגום
      for (let i = 0; i + gw.length <= toks.length; i++) {
        /* ⚠ בתוך צירוף מותרת גם מילת תפקוד. בגרסה הראשונה `STOP` חסם את `כל`,
           ולכן `כל הזמן` (constantly) לא נמצא כצירוף — ובמקומו סומנה `הזמן`
           לבדה, שפירושה "the time". שער שנועד למנוע סימון של מילת תפקוד גרם
           בדיוק לסימון של מילת תפקוד. */
        const lv = gw.map((g, j) => level(g, toks[i + j].w, true));
        if (lv.every(Boolean))
          cand.push({ start: toks[i].s, end: toks[i + gw.length - 1].e, si, words: gw.length,
                      how: lv.reduce((a, b) => RANK[a] >= RANK[b] ? a : b) });
      }
    }
    /* ⛔ מילה בודדת מתוך צירוף — רק אם היא **המילה הראשונה** בצירוף.
       נמדד על 180 פריטים בביקורת עצמאית: 4 שגיאות, וכל ארבעתן אותה מחלקה בדיוק —
       `כספים` במקום `לגיוס` (fundraiser) · `חורף` במקום `שנת חורף` (hibernate) ·
       `הזמן` במקום `כל הזמן` (constantly) · `לשניים` במקום `תחלק` (halve).
       בכל ארבעתן המילה שסומנה היא רכיב מהצירוף שאינו הגרעין, והגרעין בעברית הוא
       ראש הצירוף, כלומר המילה הראשונה (סמיכות, ופועל+מושא). רכיב שאינו ראש הצירוף
       אינו מועמד, ואם לא נשאר מועמד — הפריט עובר לטיפול נפרד ולא מנוחש. */
    gw.forEach((g, gi) => { if (gw.length > 1 && gi > 0) return;
      toks.forEach(t => {
        const lv = level(g, t.w);
        if (lv) cand.push({ start: t.s, end: t.e, si, words: 1, how: lv });
      });
    });
  });
  if (!cand.length) return null;
  /* סדר העדפה: כמה ממילות הפירוש כוסו · דרגת ההתאמה · סדר המשמעות בבנק (הראשית
     ראשונה) · אורך המקטע. סדר המשמעות הוא מה שמכריע כששתי משמעויות נמצאות במשפט. */
  cand.sort((a, b) => b.words - a.words || RANK[a.how] - RANK[b.how] ||
                      a.si - b.si || (b.end - b.start) - (a.end - a.start));
  const best = cand[0];
  /* ⛔ כלל אי-ההכרעה, והוא הלב של הכלי. נמדד על `לאחד`: בתרגום "החברה **איחדה**
     שלושה משרדים למטה מרכזי **אחד**" יש שני מועמדים במקומות שונים — המספר `אחד`
     בהתאמה צורנית והפועל `איחדה` בהתאמת שורש. הצורנית מנצחת בדירוג, כלומר הכלי
     היה מדגיש ללומד את המילה הלא נכונה. כשההתאמה אינה מדויקת ויש מועמד נוסף
     במקום אחר — **לא מנחשים**, והפריט עובר לטיפול נפרד. */
  if (best.how !== 'exact') {
    const apart = cand.some(c => c.end <= best.start || c.start >= best.end);
    if (apart) return null;
  }
  return best;
}

/* ------------------------------- הוכחת שיניים ------------------------------- */
if (process.argv.includes('--selftest')) {
  const T = [
    ['מסוגל, יכול', 'אחרי האימונים, הוא היה מסוגל להרים משקולות כבדות.', 'מסוגל', 'exact'],
    ['ליד, בערך; אודות', 'הפגישה תתחיל בעוד בערך שעה, אז תתכונן עכשיו.', 'בערך', 'exact'],
    /* ⛔ אי-הכרעה: `אחד` המספר מול `איחדה` הפועל. עדיף בלי סימון מסימון שגוי. */
    ['לאחד', 'החברה איחדה שלושה משרדים למטה מרכזי אחד.', null, null],
    ['שלישי', 'בפעם השלישית שהוא התקשר, היא ענתה לטלפון.', 'השלישית', 'form'],
    /* ⛔ המקרה שחייב **להיכשל**: `שני` מול `השנה` הוא בדיוק מה ש-`related` מתיר.
       אם הוא עובר כאן, המחיר הוא הדגשה של המילה הלא נכונה. */
    ['שני', 'השנה הייתה טובה מאוד לכולם ברחבי המדינה.', null, null],
    /* ⛔ מילת תפקוד לא מודגשת גם כשהיא זהה לפירוש. */
    ['על', 'הספר נמצא על השולחן במטבח הקטן שלנו.', null, null],
    /* צירוף סמוך מודגש כמקטע אחד. */
    ['להוציא כסף', 'הוא הוציא כסף על דברים שלא היה צריך בכלל.', 'הוציא כסף', 'form'],
  ];
  let bad = 0;
  T.forEach(([gl, he, want, how]) => {
    const r = findSpan(gl, he);
    const got = r ? he.slice(r.start, r.end) : null;
    const ok = got === want && (!want || r.how === how);
    if (!ok) { bad++; console.log(`⛔ "${gl}" → צפוי ${want} (${how}) · קיבל ${got} (${r && r.how})`); }
    else console.log(`✅ "${gl}" → ${want === null ? 'לא סומן, כנדרש' : `${got} (${how})`}`);
  });
  console.log(bad ? `\n⛔ ${bad} מתוך ${T.length}` :
    `\n🟢 ${T.length}/${T.length} · לשער יש שיניים: הוא מסמן מה שצריך **ומסרב** לסמן` +
    '\n   את `השנה` מול `שני` ואת מילות התפקוד.');
  process.exit(bad ? 1 : 0);
}

/* --------------------------------- ההרצה ---------------------------------- */
const gloss = (() => {
  const w = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'data-en.js'), 'utf8'))(w);
  const m = new Map();
  Object.values(w.UNIT_DATA_EN).flat().forEach(([term, g]) => m.set(term, g));
  return m;
})();
const rows = fs.readFileSync(path.join(HERE, 'sentences-en.tsv'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
const hemap = new Map(fs.readFileSync(path.join(HERE, 'sentences-en-he.tsv'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => l.split('\t')).map(([w, h]) => [w, h]));
/* ⛔ סימון ידני, וזה **הקובץ היחיד** שנקרא כקלט.
   ⚠ הגרסה הראשונה קראה את קובץ הפלט של עצמה כ"אל תדרוס סימון קיים", ולכן כשתיקנתי
   את מחלקת הכשל שהביקורת מצאה — ארבע השגיאות **נשארו במקומן**, ורק 23 פריטים חדשים
   חושבו. תיקון שנראה כאילו הוא לא עשה כלום. אותה מלכודת בדיוק ששער השלמת המשפטים
   נפל בה: קלט שהוא תוצר של הריצה הקודמת. הפלט מחושב מאפס בכל הרצה. */
const prevFile = path.join(HERE, 'sentences-en-he-bold.tsv');
const manFile  = path.join(HERE, 'he-bold-manual.tsv');
const prev = new Map(fs.existsSync(manFile)
  ? fs.readFileSync(manFile, 'utf8').split(/\r?\n/).filter(Boolean)
      .map(l => l.split('\t')).map(([w, h]) => [w, h]) : []);

/* פריטים שנפסלו ידנית: אין בהם מילה שמתרגמת את המילה הנלמדת, ולכן גם ההתאמה
   האוטומטית עליהם אינה קבילה. בלי הכיבוד הזה, הרצה הבאה הייתה מחזירה סימון שנפסל. */
const skipSet = new Set(fs.existsSync(path.join(HERE, 'he-bold-skip.tsv'))
  ? fs.readFileSync(path.join(HERE, 'he-bold-skip.tsv'), 'utf8').split(/\r?\n/).filter(Boolean) : []);

const out = [], todo = [], stat = { exact: 0, form: 0, root: 0, kept: 0, none: 0, skip: 0 };
for (const [term] of rows) {
  const he = hemap.get(term);
  if (!he) { todo.push([term, '', 'אין תרגום']); stat.none++; continue; }
  if (skipSet.has(term)) { stat.skip++; continue; }
  const keep = prev.get(term);
  if (keep && keep.replace(/\*\*/g, '') === he && /\*\*[^*]+\*\*/.test(keep)) {
    out.push([term, keep]); stat.kept++; continue;
  }
  const sp = findSpan(gloss.get(term) || '', he);
  if (!sp) { todo.push([term, he, gloss.get(term) || '']); stat.none++; continue; }
  const marked = he.slice(0, sp.start) + '**' + he.slice(sp.start, sp.end) + '**' + he.slice(sp.end);
  /* ⛔ האינווריאנטה, על כל שורה ולא במדגם. */
  if (marked.replace(/\*\*/g, '') !== he)
    throw new Error('הסימון שינה את הטקסט: ' + term);
  out.push([term, marked]); stat[sp.how]++;
}

fs.writeFileSync(prevFile, out.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(HERE, 'he-bold-todo.tsv'),
  todo.map(r => r.join('\t')).join('\n') + (todo.length ? '\n' : ''), 'utf8');

const tot = rows.length;
console.log('='.repeat(60));
console.log(`${tot} משפטים · סומנו ${out.length} · נותרו ${todo.length}`);
console.log(`  זהה לפירוש:      ${stat.exact}`);
console.log(`  נטייה של הפירוש: ${stat.form}`);
console.log(`  אותו שורש:       ${stat.root}   ← הדרגה הרחבה, לדגימה ידנית`);
console.log(`  סימון ידני:      ${stat.kept}`);
console.log(`  נפסל ידנית:      ${stat.skip}   ← אין בתרגום מילה מתאימה`);
console.log(`  ללא סימון:       ${stat.none}   → he-bold-todo.tsv`);
console.log('='.repeat(60));
console.log(`כיסוי: ${(out.length / tot * 100).toFixed(1)}%`);
