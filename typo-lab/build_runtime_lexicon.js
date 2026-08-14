'use strict';
/* בניית לקסיקון-הריצה · typo-lab/build_runtime_lexicon.js
 *
 * ===== למה הקובץ הזה קיים =====
 * המדידה שהכריעה: 1,167 שורות he-word · 123 en-word · 694 gloss נושאות why:"real-word",
 * כלומר המחרוזת שהוקלדה היא **מילה אמיתית של השפה שאינה צורה קבילה של הכרטיס**. בגנום
 * מתירני לחלוטין ‏1,164 מתוך 1,167 העבריות מתקבלות. הן יושבות בדיוק באותו מרחק עריכה
 * כמו שגיאות כתיב אמיתיות, ולכן **אין סף שמפריד ביניהן**: כל ניסיון להפריד בסף אחד דחף
 * את כל הספים לאפס, וה-recall של המילה העברית ירד ל-2.49% ושער המשלוח נפל.
 *
 * המסקנה הארכיטקטונית: הבודק בזמן ריצה חייב לשאת **לקסיקון**, לא רק את המאגר. הווטו
 * הקיים יודע לומר "זו מילת מאגר אחרת"; מה שחסר הוא "זו מילה של השפה שאינה המילה הזאת".
 * הקובץ הזה מייצר את הנכס שמאפשר את זה בדפדפן: מסנן Bloom דחוס, base64, בקובץ נתונים
 * בצורה של שאר קובצי הנתונים בפרויקט (window.TYPO_LEX).
 *
 * ===== ⛔ גבול הרישיון · אותו גבול בדיוק כמו lib/lexicon.js =====
 * המקורות הם **הטקסטים שאנחנו עצמנו כתבנו**: משפטי השלמת המשפטים, הפירושים של המאגר,
 * מסמכי היחידות, התרגומים העבריים. אין כאן שום מילון חיצוני · לא ויקימילון (CC BY-SA),
 * לא WordNet עברי, לא האקדמיה ללשון, ולא שום רשימת מילים שהמקור החיצוני הוא זה שבחר
 * מה נכנס בה.
 *
 * שלושת המקורות שנפסלו נשארים בחוץ, ולהלן הסיבה · אל תחזיר אותם בלי הכרעה של חגי:
 *   · דוחות/מאגר-נקי/01-גלם.tsv          · דאמפ לקסמות עם עמודות lid/L91/Q1084, כלומר
 *                                          רשימת ויקינתונים שהיא זו שבוחרת אילו מילים
 *                                          קיימות · היפוך הסדר ש-CLAUDE.md אוסר.
 *   · דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv · צירופים שנאספו מהרשת, מקור לא מתועד.
 *   · pipeline_output/*.json              · מועמדים שנבחרו מרשימת לקסמות חיצונית (lid/Q),
 *                                          וחלקם נגזר מקובצי מבחני עבר · שני מקורות אסורים.
 * שלושתם יחד היו מוסיפים ‎~22,000 טיפוסים עבריים. ההדרה עלתה בכיסוי ונבחרה כדרך הבטוחה.
 * ⚠ הנכס הזה נשלח לדפדפן של כל משתמש · החשיפה כאן גדולה מזו של קובץ מעבדה פנימי,
 * ולכן ההדרה מחייבת כאן אפילו יותר.
 *
 * ===== החיסור · מה **לא** נכנס למסנן =====
 * כל צורה קבילה של כל ערך במאגר יורדת מהמסנן. מילה שהמאגר כבר מלמד אינה "איזו מילה
 * אחרת של השפה", והווטו של המאגר (isVetoedTerm/isVetoedSeg) כבר מטפל בה עם פטור-הכרטיס
 * הנכון · הוא יודע מיהו הכרטיס, ולקסיקון-הריצה אינו יודע. השארת המילה במסנן הייתה
 * מייצרת פסילה חסרת-פטור על בדיוק המקרה שהמאגר קיים בשבילו.
 *
 * ⚠ החיסור הוא ברמת **הטוקן**, כי lookup() עובד ברמת הטוקן: יורדות צורות קבילות שהן
 * מילה אחת. צורה רב-מילית ("בית ספר") אינה יכולה להיות ערך במסנן מלכתחילה, ואת המילים
 * שבתוכה **אין** לחסר · "ספר" לבדה אינה תשובה שהמאגר מלמד עבור "בית ספר", היא תשובה
 * חלקית, ומחיקתה הייתה מחלישה את המסנן בלי להרוויח שום פטור.
 *
 * ===== למה Bloom, ומה מחיר הטעות =====
 * ‏positive שגוי כאן = הבודק טוען "המחרוזת שהוקלדה היא מילה אמיתית" על מחרוזת שאינה,
 * כלומר **דוחה שגיאת כתיב אמיתית**. המחיר הוא recall, לא בטיחות: אין מצב שבו טעות של
 * המסנן מייצרת קבלת-שווא. הכיוון השני חסום מבנית · ל-Bloom אין false negative, ולכן
 * מילה אמיתית שיושבת במסנן תמיד תיתפס. זו בדיוק החלוקה הנכונה: הצד שיכול לטעות הוא
 * הצד שעולה recall, והצד שאסור לו לטעות אינו יכול.
 *
 * דטרמיניזם: אין Math.random · הדגימות נגזרות מ-rngFor, והפלט זהה ביט-אחר-ביט בין ריצות.
 *
 * שימוש:
 *   node build_runtime_lexicon.js                 · בונה out/runtime-lexicon.js ב-FPR הנבחר
 *   node build_runtime_lexicon.js --report        · טבלת גודל/FPR/מחיר-recall בלי לכתוב
 *   node build_runtime_lexicon.js --fpr=0.01
 *   node build_runtime_lexicon.js --broken=size   · מסנן קטן פי 8 · לשיניים של השער
 *   node build_runtime_lexicon.js --broken=bits   · ביטים מאופסים · מייצר false negative
 *   node build_runtime_lexicon.js --broken=nosub  · בלי חיסור צורות המאגר
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { buildLexicon } = require('./lib/lexicon.js');
const { acceptedKeys, acceptedSegs } = require('./lib/keys.js');
const { rngFor, randInt } = require('./lib/rng.js');

const OUT_DIR = path.join(__dirname, 'out');
const OUT_FILE = path.join(OUT_DIR, 'runtime-lexicon.js');

/* ה-FPR הנבחר · ההנמקה נמדדת ולא מוצהרת, ראה --report והדוח בסוף הקובץ.
   ‏0.5% הוא הנקודה שבה מחיר ה-recall כבר קטן מהרעש של הדאטהסט, וההכפלה של הגודל
   מ-1% ל-0.5% עולה ‎~11KB בלבד. מתחת לזה הגודל גדל מהר והתועלת שטוחה. */
const DEFAULT_FPR = 0.005;

const MIN = 2;                     // זהה ל-lib/lexicon.js · מילה באות אחת אינה מילה אחרי norm
const SAMPLE_N = 200000;           // דגימת אי-מילים לכל שפה למדידת FPR אמפירי
const HE_ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשת';
const EN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/* ============================================================================
 * שתי הפונקציות הבאות נפלטות **כטקסט מקור** אל תוך הנכס (ראה emit). זו הסיבה שהן
 * כתובות ב-ES5 ובלי תלות חיצונית: הבנאי כאן והדפדפן שם מריצים את אותו קוד בדיוק
 * ולא שני מימושים שעלולים להיפרד. selfcheck2b מאמת את ההסכמה על 200,000 מילים.
 * ==========================================================================*/

/* fnv1a 32 ביט · Math.imul ולא כפל רגיל: כפל רגיל עובר ל-double אחרי 2^53 ומאבד
   ביטים נמוכים, ואז הגיבוב מפסיק להיות אותו גיבוב על מחרוזות ארוכות.
 *
 * ⚠ הזנב (fmix32 של murmur3) אינו קישוט · הוא נמדד. בלעדיו ה-FPR האמפירי חרג מהיעד
 * ב-15% ב-k=7 וב-22% ב-k=6: ל-fnv1a אין ערבול מספיק בביטים הנמוכים, ושתי הכתובות
 * שנגזרות ממנו (h1, h2) יצאו מתואמות, כך ש-k כתובות התנהגו כמו פחות מ-k. אחרי הזנב
 * הסטייה יורדת לרעש הדגימה. */
function TL_hash(str, seed) {
  var s = String(str);
  var h = seed >>> 0;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/* כתובות הביטים · Kirsch-Mitzenmacher: שני גיבובים בלבד מספיקים ל-k כתובות בלי
   הידרדרות מדידה ב-FPR. ‏h2 מאולץ לאי-זוגי כדי שלא ייווצר מחזור קצר מול m.
   ‏lang נכנס לגיבוב עצמו · שתי השפות חולקות מערך ביטים אחד, ומילה עברית לא תיתפס
   כאנגלית. הכפל i*h2 נשאר מתחת ל-2^53 (k ≤ 20), ולכן % מדויק בלי Math.imul. */
function TL_idx(word, lang, m, k, out) {
  var key = lang + '' + word;
  var h1 = TL_hash(key, 0x811c9dc5);
  var h2 = (TL_hash(key, 0x9e3779b1) | 1) >>> 0;
  for (var i = 0; i < k; i++) out[i] = (h1 + i * h2) % m;
  return out;
}

/* ===== קבוצות המקור ===== */

const single = s => String(s).indexOf(' ') < 0;

/* כל הצורות הקבילות של כל ערך בשני המאגרים · קבוצת החיסור.
   צד הפירוש עברי בשני המאגרים (meaningMatch מנרמל ב-norm העברי תמיד), ולכן מקטעי
   הפירוש נכנסים לצד העברי גם כשהמאגר אנגלי. */
function bankForms() {
  const he = new Set(), en = new Set();
  for (const L of ['he', 'en']) {
    const ctx = getCtx(L);
    const words = L === 'en' ? en : he;
    for (const card of Array.from(ctx.BANK)) {
      for (const k of Array.from(acceptedKeys(card, ctx))) if (k && single(k) && k.length >= MIN) words.add(k);
      for (const s of Array.from(acceptedSegs(card, ctx))) if (s && single(s) && s.length >= MIN) he.add(s);
    }
  }
  return { he, en };
}

/* הקבוצות המדויקות שהמסנן אמור לייצג · אחרי החיסור, ממוינות (דטרמיניזם).
   ‏noSub מדלג על החיסור · לשיניים של השער בלבד, זה בדיוק המצב השבור. */
function exactSets(noSub) {
  const lex = buildLexicon();
  const bank = bankForms();
  const out = {};
  let removed = { he: 0, en: 0 };
  for (const L of ['he', 'en']) {
    const src = L === 'en' ? lex.en : lex.he;
    const drop = L === 'en' ? bank.en : bank.he;
    const keep = [];
    for (const w of Array.from(src)) {
      if (!noSub && drop.has(w)) { removed[L]++; continue; }
      if (w.length < MIN) continue;
      keep.push(w);
    }
    keep.sort();
    out[L] = keep;
  }
  return { sets: out, removed, bank, lexStats: lex.stats };
}

/* ===== המסנן ===== */

function bloomParams(n, p) {
  const raw = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const bytes = Math.max(1, Math.ceil(raw / 8));
  const m = bytes * 8;                                  // מעוגל לבייט שלם · כך base64 יוצא נקי
  const k = Math.max(1, Math.min(20, Math.round((m / Math.max(1, n)) * Math.LN2)));
  return { n, p, m, bytes, k };
}

function buildFilter(words, lang, p, broken) {
  const n = words.length;
  const par = bloomParams(n, p);
  if (broken === 'size') { par.bytes = Math.max(1, Math.ceil(par.bytes / 8)); par.m = par.bytes * 8; }
  const bits = new Uint8Array(par.bytes);
  const idx = new Array(par.k);
  for (const w of words) {
    TL_idx(w, lang, par.m, par.k, idx);
    for (let i = 0; i < par.k; i++) bits[idx[i] >>> 3] |= (1 << (idx[i] & 7));
  }
  /* שיניים · איפוס ביטים דטרמיניסטי מייצר false negative, מה שמסנן תקין אינו יכול לייצר. */
  if (broken === 'bits') {
    const rnd = rngFor('runtime-lexicon', 'broken-bits', lang);
    for (let t = 0; t < Math.ceil(par.bytes / 20); t++) bits[randInt(rnd, par.bytes)] = 0;
  }
  return { par, bits };
}

/* ===== מדידה ===== */

/* דגימת אי-מילים · מחרוזות אקראיות באלפבית ובאורך של מילים אמיתיות, שאינן בקבוצה
   המדויקת. מחרוזת אקראית באורך ‎≥3 באלפבית עברי היא אי-מילה בהסתברות שקרובה ל-1,
   וההסתננות היחידה האפשרית מסוננת במפורש מול הקבוצה. */
function nonWords(lang, exactSet, howMany) {
  const alpha = lang === 'en' ? EN_ALPHABET : HE_ALPHABET;
  const rnd = rngFor('runtime-lexicon', 'sample', lang);
  const out = [];
  let guard = 0;
  while (out.length < howMany && guard++ < howMany * 4) {
    const len = 3 + randInt(rnd, 6);                    // 3..8 · תחום האורך של מילה מנורמלת
    let s = '';
    for (let i = 0; i < len; i++) s += alpha[randInt(rnd, alpha.length)];
    if (exactSet.has(s)) continue;
    out.push(s);
  }
  return out;
}

function measureFPR(lookup, lang, exactSet, howMany) {
  const sample = nonWords(lang, exactSet, howMany);
  let hit = 0;
  for (const w of sample) if (lookup(w, lang)) hit++;
  return { n: sample.length, hit, fpr: sample.length ? hit / sample.length : 0 };
}

/* ===== מחיר ה-recall =====
 * שיקוף מדויק של inLexicon (lib/lexicon.js:129) · אותה סמנטיקת srcKey: כשמספר המילים
 * זהה נבדקות רק המילים שהשתנו. זו הסמנטיקה שהריצה תשתמש בה, ולכן היא זו שנמדדת. */
function lexHit(typed, lang, srcKey, lookup) {
  if (!typed) return false;
  const parts = String(typed).split(' ').filter(Boolean);
  if (!parts.length) return false;
  let check = parts;
  if (srcKey != null) {
    const src = String(srcKey).split(' ').filter(Boolean);
    if (src.length === parts.length) {
      check = parts.filter((p, i) => p !== src[i]);
      if (!check.length) return false;
    }
  }
  for (const p of check) if (p.length < MIN || !lookup(p, lang)) return false;
  return true;
}

function loadRows(dir) {
  const out = [];
  for (const f of ['dataset-he.jsonl', 'dataset-en.jsonl']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) if (line) out.push(JSON.parse(line));
  }
  return out;
}

const glossLang = row => (row.set === 'gloss' ? 'he' : row.lang);

/* כמה שורות accept היו נדחות בטעות · מפולח לפי סט, כי המחיר אינו אחיד:
   סט gloss מקליד צירופים ולכן יש בו יותר מ-lookup אחד לשורה. */
function recallCost(rows, lookup) {
  const per = {};
  for (const r of rows) {
    if (r.label !== 'accept') continue;
    const b = per[r.set] || (per[r.set] = { accept: 0, lost: 0, lostTrusted: 0, trusted: 0 });
    b.accept++;
    if (r.trusted) b.trusted++;
    if (lexHit(r.typed, glossLang(r), r.key, lookup)) { b.lost++; if (r.trusted) b.lostTrusted++; }
  }
  let accept = 0, lost = 0, trusted = 0, lostTrusted = 0;
  for (const k of Object.keys(per)) { accept += per[k].accept; lost += per[k].lost; trusted += per[k].trusted; lostTrusted += per[k].lostTrusted; }
  return { per, accept, lost, trusted, lostTrusted, rate: accept ? lost / accept : 0 };
}

/* ===== הכיסוי · הצד השני של אותו מטבע =====
 * מחיר ה-FPR חסר משמעות בלי המספר שהוא נקנה בו: כמה מתוך שורות ה-real-word · אלה
 * שהמדידה הראתה שאין סף שמפריד אותן משגיאת כתיב · לקסיקון-הריצה באמת תופס.
 * ‏bankOnly הוא הפער המובנה: מחרוזת שהיא צורה קבילה של כרטיס **אחר** תויגה real-word
 * (כי היא אינה צורה של הכרטיס הזה), אבל היא ירדה מהמסנן בחיסור. היא אינה אובדת ·
 * הווטו של המאגר תופס אותה, ושם הפטור הוא לפי כרטיס וזה בדיוק המקום הנכון. */
function coverage(rows, lookup, bank) {
  const per = {};
  for (const r of rows) {
    if (r.why !== 'real-word') continue;
    const b = per[r.set] || (per[r.set] = { total: 0, caught: 0, bankOnly: 0, missed: 0 });
    b.total++;
    const lang = glossLang(r);
    if (lexHit(r.typed, lang, r.key, lookup)) b.caught++;
    else {
      const drop = lang === 'en' ? bank.en : bank.he;
      const parts = String(r.typed).split(' ').filter(Boolean);
      if (parts.some(p => drop.has(p))) b.bankOnly++; else b.missed++;
    }
  }
  return per;
}

/* ===== הנכס ===== */

function b64(bits) { return Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength).toString('base64'); }

function emit(built, meta) {
  const L = [];
  L.push('/* lookup(word, lang) -> bool · האם המחרוזת המנורמלת היא מילה אמיתית של השפה');
  L.push(' * שאינה צורה קבילה של אף ערך במאגר. נבנה על ידי typo-lab/build_runtime_lexicon.js ·');
  L.push(' * אל תערוך ביד. ההנמקה, גבול הרישיון וההנמקה ל-FPR נמצאים בראש הבנאי.');
  L.push(' *');
  L.push(' * ⛔ רישיון · המקורות הם טקסטים שנכתבו בפרויקט הזה בלבד. אין כאן שום מילון חיצוני.');
  L.push(' *   מודרים במפורש: דוחות/מאגר-נקי/01-גלם.tsv · דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv ·');
  L.push(' *   pipeline_output/*.json · שלושתם רשימות שהמקור החיצוני בחר את תוכנן.');
  L.push(' *');
  L.push(' * ⚠ המבנה הוא מסנן Bloom · positive שגוי אפשרי ומחירו recall (דחיית שגיאת כתיב');
  L.push(' *   אמיתית), ‏negative שגוי בלתי אפשרי מבנית. הקלט חייב להיות **מנורמל כבר**');
  L.push(' *   (norm לעברית, normEn לאנגלית), מילה אחת בלי רווחים.');
  L.push(' */');
  L.push('(function (root) {');
  L.push("  'use strict';");
  L.push('');
  L.push('  var TL = ' + JSON.stringify(meta.head, null, 2).split('\n').join('\n  ') + ';');
  L.push('');
  for (const lang of ['he', 'en']) {
    L.push('  TL.' + lang + '.b64 = ' + JSON.stringify(b64(built[lang].bits)) + ';');
  }
  L.push('');
  L.push('  function TL_b64(s) {');
  L.push("    if (typeof atob === 'function') {");
  L.push('      var bin = atob(s), a = new Uint8Array(bin.length), i;');
  L.push('      for (i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);');
  L.push('      return a;');
  L.push('    }');
  L.push("    var b = Buffer.from(s, 'base64');");
  L.push('    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);');
  L.push('  }');
  L.push('');
  /* ‏toString של הפונקציות עצמן · הבנאי והדפדפן מריצים את אותו קוד ולא שני מימושים. */
  L.push('  ' + TL_hash.toString().split('\n').join('\n  '));
  L.push('');
  L.push('  ' + TL_idx.toString().split('\n').join('\n  '));
  L.push('');
  L.push('  var BITS = { he: null, en: null };');
  L.push('  var SCRATCH = [];');
  L.push('');
  L.push('  function lookup(word, lang) {');
  L.push("    var L = lang === 'en' ? 'en' : 'he';");
  L.push('    var cfg = TL[L];');
  L.push('    if (!word || word.length < cfg.min) return false;');
  L.push('    var bits = BITS[L] || (BITS[L] = TL_b64(cfg.b64));');
  L.push('    TL_idx(word, L, cfg.m, cfg.k, SCRATCH);');
  L.push('    for (var i = 0; i < cfg.k; i++) {');
  L.push('      var p = SCRATCH[i];');
  L.push('      if (!(bits[p >>> 3] & (1 << (p & 7)))) return false;');
  L.push('    }');
  L.push('    return true;');
  L.push('  }');
  L.push('');
  L.push('  TL.lookup = lookup;');
  L.push('  TL.has = lookup;');
  L.push('  root.TYPO_LEX = TL;');
  L.push('  /* אותו אובייקט בדיוק גם ל-require של המעבדה · השער מאמת שהחיפוש שנמדד כאן');
  L.push('     הוא החיפוש שרץ בדפדפן, ולא מימוש מקביל שנכתב פעמיים. */');
  L.push("  if (typeof module === 'object' && module.exports) module.exports = TL;");
  L.push("})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));");
  return L.join('\n') + '\n';
}

/* ===== הרכבה ===== */

function build(opts) {
  const o = opts || {};
  const p = o.fpr || DEFAULT_FPR;
  const ex = exactSets(o.broken === 'nosub');
  const built = {};
  const head = { version: 'typo-lab/runtime-lexicon/v1', fprTarget: p, he: {}, en: {} };
  for (const lang of ['he', 'en']) {
    const f = buildFilter(ex.sets[lang], lang, p, o.broken);
    built[lang] = f;
    head[lang] = { n: f.par.n, m: f.par.m, k: f.par.k, bytes: f.par.bytes, min: MIN, b64: '' };
  }
  const text = emit(built, { head });
  return { text, built, exact: ex, fpr: p, head };
}

/* טוען את הנכס עצמו ומחזיר את lookup שלו · לא מימוש מקביל. */
function loadArtifact(text, file) {
  const Module = require('module');
  const m = new Module(file || OUT_FILE, null);
  m.filename = file || OUT_FILE;
  m.paths = [];
  m._compile(text, m.filename);
  return m.exports;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = n => { const a = argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
  const out = s => process.stdout.write(s + '\n');
  const report = argv.includes('--report');
  const broken = arg('broken');
  const fpr = arg('fpr') ? Number(arg('fpr')) : DEFAULT_FPR;
  const dest = arg('out') ? path.resolve(__dirname, arg('out')) : OUT_FILE;

  const ex = exactSets();
  out('# לקסיקון-הריצה');
  out(`מקור · ${ex.lexStats.heTypes} טיפוסים עבריים · ${ex.lexStats.enTypes} אנגליים · ${ex.lexStats.files} קבצים · ${(ex.lexStats.bytes / 1e6).toFixed(1)}MB`);
  out(`חיסור צורות המאגר · עברית ‎-${ex.removed.he} · אנגלית ‎-${ex.removed.en}`);
  out(`אחרי חיסור · עברית ${ex.sets.he.length} · אנגלית ${ex.sets.en.length} · סה"כ ${ex.sets.he.length + ex.sets.en.length}`);
  out('');

  const rowsDir = path.join(__dirname, 'out');
  const rows = loadRows(rowsDir);
  const heSet = new Set(ex.sets.he), enSet = new Set(ex.sets.en);

  if (report) {
    out('## מחיר ה-FPR · גודל מול recall');
    out('');
    out('| FPR מבוקש | k | ביטים | בייטים גולמיים | base64 | FPR אמפירי he | FPR אמפירי en | שורות accept שנדחות | מחיר recall |');
    out('|---|---|---|---|---|---|---|---|---|');
    for (const p of [0.001, 0.005, 0.01, 0.02]) {
      const b = build({ fpr: p });
      const api = loadArtifact(b.text, path.join(OUT_DIR, `.probe-${p}.js`));
      const fHe = measureFPR(api.lookup, 'he', heSet, SAMPLE_N);
      const fEn = measureFPR(api.lookup, 'en', enSet, SAMPLE_N);
      const rc = rows.length ? recallCost(rows, api.lookup) : { lost: 0, accept: 0, rate: 0 };
      const raw = b.built.he.par.bytes + b.built.en.par.bytes;
      out(`| ${(p * 100).toFixed(1)}% | ${b.built.he.par.k}/${b.built.en.par.k} | ${b.built.he.par.m + b.built.en.par.m} | ${(raw / 1024).toFixed(1)}KB | ${(Buffer.byteLength(b.text, 'utf8') / 1024).toFixed(1)}KB | ${(fHe.fpr * 100).toFixed(3)}% | ${(fEn.fpr * 100).toFixed(3)}% | ${rc.lost} / ${rc.accept} | ${(rc.rate * 100).toFixed(3)}% |`);
    }
    out('');
    out('‏positive שגוי = דחיית שגיאת כתיב אמיתית. אין כיוון שבו טעות של המסנן מייצרת קבלת-שווא.');
    return;
  }

  const b = build({ fpr, broken });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, b.text, 'utf8');
  const api = loadArtifact(b.text, dest);
  const fHe = measureFPR(api.lookup, 'he', heSet, SAMPLE_N);
  const fEn = measureFPR(api.lookup, 'en', enSet, SAMPLE_N);
  const rc = rows.length ? recallCost(rows, api.lookup) : null;
  const sha = crypto.createHash('sha256').update(b.text, 'utf8').digest('hex');

  out(`## נכתב · ${dest}`);
  out(`‏FPR מבוקש ${(fpr * 100).toFixed(2)}%${broken ? ` · ⚠ broken=${broken}` : ''}`);
  out(`עברית · n=${b.built.he.par.n} m=${b.built.he.par.m} k=${b.built.he.par.k} · ${b.built.he.par.bytes} בייט`);
  out(`אנגלית · n=${b.built.en.par.n} m=${b.built.en.par.m} k=${b.built.en.par.k} · ${b.built.en.par.bytes} בייט`);
  out(`גודל הקובץ · ${Buffer.byteLength(b.text, 'utf8')} בייט (${(Buffer.byteLength(b.text, 'utf8') / 1024).toFixed(1)}KB) · sha256 ${sha.slice(0, 16)}…`);
  out(`‏FPR אמפירי · עברית ${(fHe.fpr * 100).toFixed(3)}% (${fHe.hit}/${fHe.n}) · אנגלית ${(fEn.fpr * 100).toFixed(3)}% (${fEn.hit}/${fEn.n})`);
  let cov = null;
  if (rc) {
    out(`מחיר recall · ${rc.lost} מתוך ${rc.accept} שורות accept (${(rc.rate * 100).toFixed(3)}%)`);
    for (const k of Object.keys(rc.per).sort()) out(`  · ${k} · ${rc.per[k].lost}/${rc.per[k].accept}`);
    cov = coverage(rows, api.lookup, b.exact.bank);
    out('כיסוי · שורות real-word שהמסנן תופס:');
    for (const k of Object.keys(cov).sort()) {
      const c = cov[k];
      out(`  · ${k} · ${c.caught}/${c.total} (${((c.caught / c.total) * 100).toFixed(1)}%) · צורת-מאגר אחרת ${c.bankOnly} · נותר פתוח ${c.missed}`);
    }
  }

  /* ===== המניפסט =====
   * הנכס נרשם לתוך אותו manifest.json של הדאטהסט, כי שניהם נגזרים מאותו לקסיקון ומאותם
   * מקורות · מניפסט שמתאר רק חצי מהתוצר אינו מתאר את התוצר.
   * ⚠ סדר · gen_dataset.js כותב את המניפסט מאפס, ולכן הבנייה הזו חייבת לרוץ **אחריו**.
   * זו אינה הסתמכות על זיכרון: selfcheck2b משווה את ה-sha שנרשם כאן לקובץ שעל הדיסק,
   * ולכן מניפסט שנדרס יוצא אדום בשער במקום להישאר לא-נכון בשקט. */
  if (!broken && dest === OUT_FILE) {
    const mf = path.join(OUT_DIR, 'manifest.json');
    if (fs.existsSync(mf)) {
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      m.runtimeLexicon = {
        file: path.basename(dest),
        bytes: Buffer.byteLength(b.text, 'utf8'),
        sha256: sha,
        fprTarget: fpr,
        he: { n: b.built.he.par.n, m: b.built.he.par.m, k: b.built.he.par.k, bytes: b.built.he.par.bytes },
        en: { n: b.built.en.par.n, m: b.built.en.par.m, k: b.built.en.par.k, bytes: b.built.en.par.bytes },
        removedBankForms: b.exact.removed,
        empiricalFPR: { he: Number(fHe.fpr.toFixed(5)), en: Number(fEn.fpr.toFixed(5)), sample: SAMPLE_N },
        recallCost: rc ? { lost: rc.lost, accept: rc.accept, rate: Number(rc.rate.toFixed(5)) } : null,
        coverage: cov,
        /* מודר במפורש · ראה את ראש הקובץ ואת lib/lexicon.js. */
        excludedSources: [
          'דוחות/מאגר-נקי/01-גלם.tsv',
          'דוחות/מאגר-נקי/19-צירופים-מהרשת.tsv',
          'pipeline_output/*.json'
        ]
      };
      fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n', 'utf8');
      out(`מניפסט · ${mf} עודכן`);
    }
  }
}

module.exports = {
  build, buildFilter, bloomParams, exactSets, bankForms, emit, loadArtifact,
  measureFPR, nonWords, recallCost, coverage, lexHit, loadRows,
  TL_hash, TL_idx, OUT_FILE, DEFAULT_FPR, MIN, SAMPLE_N
};

if (require.main === module) main();
