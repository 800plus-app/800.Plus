'use strict';
/* עזרי הצינור של יחידת מילות הקישור · מה שכל חמשת השערים חולקים.
 *
 * למה מודול משותף ולא העתקה בכל שער
 * ----------------------------------
 * שלושה דברים כאן מוכרחים להיות **בדיוק אותו דבר** בכל השערים: הסרת הניקוד,
 * קריאת המנות, וקבוצת הכיוונים הסגורה. שער שמסיר ניקוד קצת אחרת משער אחר יסתור
 * אותו בשקט, ואז «עבר» באחד ו«נפל» בשני יראה כמו באג בנתונים במקום כמו באג
 * בכלים. הכללים עצמם נשארים כל אחד בקובץ שלו · רק ההגדרות המשותפות כאן.
 *
 * ⛔ מה **אין** כאן, במכוון: רשימת המילים. היא נכס נפרד
 * (`connectives-he/words.json`, נכתב בצינור אחר) והעתקה שלה לכאן הייתה מייצרת
 * שני מקורות אמת שנפרדים בשקט. `loadWords()` קוראת אותה בזמן ריצה אם היא קיימת,
 * ואומרת במפורש כשאיננה.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;

/* ── ניקוד ───────────────────────────────────────────────────────────────
   האפשרויות מנוקדות, המשפט אינו · ולכן כל השוואה בין `w` (הצורה החשופה)
   לבין `o[0]` (הצורה המנוקדת) חייבת לעבור דרך ההסרה הזאת. הטווח כולל טעמים
   ומקף מקראי, כי מנוקד שהודבק ממקור אחר עשוי לגרור אותם. */
const NIQ = /[֑-ׇ]/g;
/** מסיר ניקוד, מנרמל רווחים, ומאחד גרשיים · הצורה שכל השוואת מילים נעשית בה. */
const strip = s => String(s == null ? '' : s)
  .replace(NIQ, '')
  .replace(/[‘’׳]/g, "'")
  .replace(/[“”״]/g, '"')
  .replace(/־/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

/* ── קבוצות סגורות ───────────────────────────────────────────────────────
   ⛔ כיוון או חריץ שאינם ברשימות האלה הם **ממצא**, לא ערך חדש. קבוצה פתוחה
   הופכת שגיאת כתיב בשדה (`concesion`) לקטגוריה חדשה בת פריט אחד, והשער
   מדווח «0 ממצאים» על נתון שבור. */
const DIRECTIONS = {
  contrast:       'ניגוד',
  concession:     'ויתור',
  cause:          'סיבה',
  result:         'תוצאה',
  counterfactual: 'תנאי בטל',
  condition:      'תנאי',
  hedge:          'הסתייגות',
  addition:       'הוספה',
  clarify:        'הבהרה',
  purpose:        'תכלית',
  time:           'זמן',
  exception:      'הוצאה מן הכלל',
  comparison:     'השוואה',
};

/* ⭐ שמות החריצים הם **בדיוק** אלה של `words.json`, ולא סט מקביל משלנו.
   שני סטים שמתארים את אותו דבר במילים אחרות הם התנגשות שמחכה לקרות · אחד
   מהם ישתנה, איש לא יעדכן את השני, וההצלבה תדווח «אי-התאמה» על נתון תקין. */
const SLOTS = {
  /* תואר פועל של המשפט כולו · אחריו משפט שלם. «לפיכך», «אף על פי כן». */
  adverb: 'תואר קישור',
  /* ניצבת בראש פסוקית ומחברת שתי פסוקיות. «אף ש־», «משום ש־», «שכן». */
  conj:   'מילת חיבור',
  /* שולטת בצירוף שמני ולא בפסוקית. «בשל», «חרף», «למעט». */
  prep:   'מילת יחס',
  /* צירוף שדורש פסוקית שלמה אחריו ואינו מילת חיבור פשוטה. «ספק אם». */
  phrase: 'צירוף',
};

/* תרגום הקטגוריה של `words.json` (עברית) לכיוון של הפריט (אנגלית).
   ⚠ שני הצדדים נקבעו בשתי משבצות בתוכנית · טבלת המילים בשלב 0 בעברית,
   וסכימת הפריט בשלב 1 באנגלית. הגשר יושב **כאן בלבד**; עותק שני שלו הוא
   בדיוק הדפוס שכבר נשמט פעם בשקט בפרויקט הזה.
   ⛔ «הופכות כיוון» אינה כיוון אלא חתך רוחב · היא ממופה ל-null בכוונה,
   ומילה שנושאת אותה אינה נבדקת מול `d`. */
const CAT_HE = {
  'ניגוד': 'contrast', 'ויתור': 'concession', 'סיבה': 'cause', 'תוצאה': 'result',
  'תנאי בטל': 'counterfactual', 'הסתייגות': 'hedge', 'הוספה': 'addition',
  'הבהרה': 'clarify', 'הופכות כיוון': null,
};

/* ── קריאת המנות ─────────────────────────────────────────────────────────
   `CONN_BATCHES` מאפשר לבדיקות להצביע על תיקייה אחרת · בלעדיו אי אפשר להוכיח
   שהשער מסרב לרוץ על תיקייה ריקה, וזו בקרה חיובית שכל שער כאן צריך. */
const batchesDir = () => process.env.CONN_BATCHES
  ? path.resolve(process.env.CONN_BATCHES)
  : path.join(DIR, 'batches');

/**
 * קורא את כל `batches/*.json` ומחזיר `{ items, files, broken }`.
 * `broken` הוא JSON שלא נפרס · הוא **אינו** מושתק, כל קורא חייב להציג אותו.
 * לכל פריט נקבע `src` = `<שם המנה>#<מספר השורה במנה>`, ואם הפריט כבר נושא
 * ‏`src` הוא נשמר.
 */
function loadBatches() {
  const dir = batchesDir();
  const out = { dir, items: [], files: [], broken: [] };
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); }
  catch (e) { out.broken.push(`אין תיקיית מנות: ${dir}`); return out; }
  for (const f of names) {
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { out.broken.push(`${f} :: JSON שבור — ${e.message}`); continue; }
    if (!Array.isArray(arr)) { out.broken.push(`${f} :: אינו מערך`); continue; }
    out.files.push(f);
    arr.forEach((it, i) => {
      const src = (it && it.src) || `${path.basename(f, '.json')}#${i + 1}`;
      out.items.push({ ...it, src });
    });
  }
  return out;
}

/* ── רשימת המילים · נקראת, לא משוכפלת ────────────────────────────────────
   הצורה בפועל (נמדדה מול הקובץ שנמסר, ולא הונחה):
     { "w": "אף ש־", "nikud": "אַף שֶׁ־", "k": "ויתור", "slot": "conj", ... }
   ⚠ ‏`w` נושאת מקף עברי (U+05BE) בצורות הכבולות, והמנות כותבות רווח · ולכן
   המפתח הוא `key()` ולא המחרוזת. מפתוח לפי המחרוzה היה מחמיץ **כל** מילה
   כבולה ומדווח «אינה ברשימה» על נתון תקין לגמרי.
   ⚠ הקורא מקבל גם צורות אחרות, ואומר במפורש כשהוא לא מזהה · ניחוש שקט על
   מבנה של קובץ שצינור אחר כותב הוא הדרך לקבל «0 ממצאים» ממפה ריקה. */
function loadWords() {
  const p = process.env.CONN_WORDS ? path.resolve(process.env.CONN_WORDS) : path.join(DIR, 'words.json');
  if (!fs.existsSync(p)) return { present: false, reason: 'הקובץ טרם קיים', path: p, byWord: new Map() };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { present: false, reason: 'JSON שבור — ' + e.message, path: p, byWord: new Map() }; }

  const byWord = new Map();
  const put = (rec, ...forms) => {
    const cat = rec.k || rec.dir || rec.direction || rec.cat || rec.category || rec['כיוון'] || null;
    const val = {
      cat,
      /* ⭐ `dir` הוא `null` גם למילה שקיימת אך הקטגוריה שלה אינה כיוון
         («הופכות כיוון»), וגם לקטגוריה לא מוכרת · שני המקרים אינם ניתנים
         להשוואה מול `d`, ומי שיבדוק `dir` בלבד לא יטעה. */
      dir: cat && cat in CAT_HE ? CAT_HE[cat] : (cat && cat in DIRECTIONS ? cat : null),
      slot: rec.slot || rec['חריץ'] || rec['חריץ תחבירי'] || null,
      flip: rec.flip === true,
    };
    for (const f of forms) { const k = key(f); if (k) byWord.set(k, val); }
  };
  if (Array.isArray(raw)) {
    for (const rec of raw) {
      if (!rec || typeof rec !== 'object') continue;
      put(rec, rec.w, rec.word, rec['מילה'], rec.nikud, rec.nq, rec.form);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, rec] of Object.entries(raw)) {
      if (rec && typeof rec === 'object') put(rec, rec.w || rec.word || rec['מילה'] || k, rec.nikud);
      else if (typeof rec === 'string') put({ k: rec }, k);
    }
  }
  if (!byWord.size)
    return { present: false, reason: 'המבנה לא זוהה · אף מילה לא נקראה', path: p, byWord };
  return { present: true, reason: '', path: p, byWord };
}

/* ── פירוק המשפט למילים ──────────────────────────────────────────────────
   ⚠ ל-JS אין `\b` שעובד על עברית · `\b` בנוי על `\w` שהוא ASCII, ולכן
   ‏`/\bלא\b/` **אינו** תופס «לא» בעברית כמילה שלמה ותופס אותה גם בתוך
   «לאחר». כאן מפרקים לטוקנים ומשווים טוקן לטוקן. */
const HE_TOKEN = /[֐-׿']+/g;
const tokens = s => (strip(s).match(HE_TOKEN) || []);

/**
 * ⭐ המפתח הקנוני של מילת קישור · **כל** חיפוש של מילה במפה עובר דרכו.
 * הוא מנטרל שלושה הבדלים שכולם מופיעים בפועל בין המנות לרשימת המילים:
 * ניקוד (`אַף שֶׁ־` מול `אף ש`), מקף עברי (`אף ש־` מול `אף ש`), וריווח.
 * ⛔ מפתוח לפי המחרוזת החשופה החמיץ **כל** צורה כבולה ודיווח «אינה ברשימה»
 * על נתון תקין — וזה בדיוק סוג ה«ממצא» שגורם לכבות שער אמיתי.
 */
function key(s) { return tokens(s).join(' '); }

/** האם רצף המילים `phrase` מופיע **מילולית** כרצף טוקנים בתוך `text`. */
function phraseIn(text, phrase) {
  const t = tokens(text), p = tokens(phrase);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= t.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length; j++) if (t[i + j] !== p[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/* ── מקף ארוך ────────────────────────────────────────────────────────────
   ‏`—` ו-`–` אסורים בכל טקסט שמוצג ללומד · זו החלטה קיימת בפרויקט, והיא
   נאכפת בשער ולא בזיכרון של הכותב. */
const LONG_DASH = /[–—]/;

/* ── פלט אחיד ────────────────────────────────────────────────────────────
   ⭐ הפורמט חייב להיות זהה בכל השערים, כי `verify_all_conn.js` מזהה מעבר
   לפי ביטוי · ניסוח שמשתנה משער לשער הוא בדיוק מה שהופך שער אדום לירוק
   בלי שאיש שינה כלום. */
const BAR = '='.repeat(70);

/**
 * מדפיס פסק דין ומחזיר קוד יציאה.
 * ⛔ `n === 0` הוא **קוד 2**, לא 0: שער שסרק אפס פריטים ומדווח «0 ממצאים»
 * הוא הכשל שהמערכת הזאת נבנתה נגדו.
 */
function verdict(title, n, findings, notes) {
  console.log(BAR);
  console.log(`${title} · ${n} פריטים נסרקו`);
  console.log(BAR);
  (notes || []).forEach(x => console.log(x));
  if (!n) {
    console.log('\n⛔ אפס פריטים נסרקו — השער מסרב לדווח על ריק.');
    console.log(BAR);
    return 2;
  }
  console.log(`\n${findings.length ? '⛔ ' : ''}${findings.length} ממצאים`);
  findings.forEach(x => console.log('   ' + x));
  console.log(findings.length ? '\n⛔ השער נפל' : '\n✅ השער עבר');
  console.log(BAR);
  return findings.length ? 1 : 0;
}

module.exports = {
  DIR, NIQ, strip, key, DIRECTIONS, SLOTS, CAT_HE, LONG_DASH, BAR,
  batchesDir, loadBatches, loadWords, tokens, phraseIn, verdict,
};
