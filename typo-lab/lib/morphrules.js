'use strict';
/* חוקי מורפולוגיה **צרים** · המשך ישיר לדוח שדחה את הכלל הכללי.
 *
 * ===== מה כבר נמדד ונדחה, ולמה זה לא נמדד כאן שוב =====
 * `דוחות/סיכומים/מדידת-כלל-מורפולוגי.md` מדד גזירה לשלד עיצורי על **כל מילות התוכן של שני
 * הצדדים**, והתוצאה: 61.7% מאוצר המילים (3,011 מתוך 4,883) נופלים ל-869 קבוצות גזע
 * מתנגשות, ו-918 זוגות פירושים נבדלים הופכים לניתנים להחלפה. הכלל ההוא נדחה, והוא
 * אינו מוצע כאן מחדש בשום צורה.
 *
 * ===== ההשערה הצרה שנמדדת כאן =====
 * הנזק של הכלל הכללי בא מכך שהוא קיפל **פירוש רב-מילי שלם**: ברגע שכל מילה בפירוש
 * נגזרת, מספר צירופי הגזעים גדל כפולה, וכל מילת תוכן שקרסה גוררת איתה את המקטע כולו.
 * ההשערה: הגבלה ל**מילה בודדת מול מילה בודדת** חותכת בדיוק את המנגנון הזה · המכפלה
 * נעלמת, ומה שנשאר הוא זוג מילים אחד שאפשר למנות אותו בשמו.
 *
 * ההשערה נמדדת. היא אינה מונחת.
 *
 * ===== החוזה של כל חוק · זהה לזה של glossrules.js =====
 *   id, name, cls, he, kind
 *   defaults                        אף ערך אינו מנוחש · כולם נמדדים
 *   keysTyped(typed, ctx, p)        קבוצת המפתחות שצד ה**תשובה** מייצר
 *   keysSeg(segs, ctx, p)           קבוצת המפתחות שצד ה**פירוש** מייצר
 *   accepts(typed, segs, ctx, p)    חיתוך לא ריק · **מוגדר דרך המפתחות ולא במקביל להם**
 *   expand(segs, ctx, p)            לחוקי 'gen' בלבד · קבוצת הקבלות המלאה
 *
 * ===== למה מפתחות ולא פרדיקט לבדו =====
 * שתי סיבות, ושתיהן מדידה ולא סגנון:
 *   1. accepts מוגדר כ"החיתוך אינו ריק", ולכן אי אפשר שהאינדקס שהמדידה בונה והפרדיקט
 *      שמכריע ייפרדו · הם אותו קוד. זו אותה הכרעה בדיוק כמו gen/expand ב-glossrules.
 *   2. המדידה חייבת לסרוק יקום של עשרות אלפי מחרוזות מול אלפי כרטיסים. בלי אינדקס לפי
 *      מפתח זו מכפלה של מאות מיליוני קריאות, וריצה שלא מסתיימת אינה מדידה.
 *
 * ===== צד התשובה הוא **תמיד מילה אחת** · וזה מה שהופך את המדידה למלאה =====
 * שלושת החוקים דורשים ש-typed יהיה טוקן יחיד. לכן יקום ההתנגשות אינו "כל מחרוזת"
 * אלא **כל מחרוזת בת מילה אחת שאיזשהו כרטיס מקבל היום**, וזו קבוצה סופית שאפשר למנות
 * אותה במלואה מתוך meaningMatch (ראה measure_morph.js). כלומר לחוקים האלה אין שארית
 * "לא נמדדה" בכיוון הפירוש · ולא בגלל הנחה, אלא בגלל המנייה.
 *
 * הכל טהור: אין מצב מודול, אין Math.random, אותה כניסה מחזירה אותה יציאה.
 */

const wordsOf = s => String(s).split(/\s+/).filter(Boolean);

/* PARTICLE_STOP של האפליקציה עצמה · אותה הגדרת "מילת תוכן" שבה glossrules משתמש.
   הועתקה דרך ctx ולא דרך רשימה משלנו, כי רשימה משלנו הייתה סופרת מילים אחרת
   מ-particleMatch וכל ספירת "מילה אחת" הייתה מודדת דבר אחר. */
const stopCache = new WeakMap();
function stopOf(ctx) {
  let s = stopCache.get(ctx);
  if (!s) {
    if (!ctx.PARTICLE_STOP) throw new Error('morphrules: ctx.PARTICLE_STOP חסר · ארגז החול לא הרים אותו');
    s = new Set(Array.from(ctx.PARTICLE_STOP));
    stopCache.set(ctx, s);
  }
  return s;
}
const contentOf = (ws, ctx) => { const st = stopOf(ctx); return ws.filter(w => !st.has(w)); };

/* ===== השלד העיצורי =====
 * אותה גזירה של הדוח הדחוי, ובכוונה: אם צורה מרוככת שלה נכשלת גם היא, הממצא חזק יותר.
 * א/ה/ו/י נופלות · הן אמות קריאה, וכתיב מלא וחסר מבדילים בהן בלי להבדיל במילה.
 * ⚠ המחיר ידוע ונמדד: כשאחת מהן היא אות שורשית (עיפ, אכל, ידע) השלד מאבד אות אמיתית.
 */
const MATRES = 'אהוי';
function skel(w) {
  let o = '';
  for (let i = 0; i < w.length; i++) if (!MATRES.includes(w[i])) o += w[i];
  return o;
}

/* אותיות תחילית שמופיעות בנטיית הפועל ובשם הפועל. י' ממילא נופלת בשלד ונשארת ברשימה
   רק כדי שהתיעוד יתאר את הכוונה ולא את מה שנשאר ממנה. */
const PRE_LETTERS = 'מתני';
/* סיומות · מסודרות מהארוכה לקצרה כדי ש-'ות' ייקלף לפני 'ה'.
   ⚠ בצורה ה**מקופלת**: norm מקפלת אותיות סופיות (ם→מ, ן→נ), ולכן "ילדים" מגיע לכאן
   כ-"ילדימ" ו-"מרדן" כ-"מרדנ". רשימה שנכתבה בצורה הסופית ('ים', 'ן') פשוט לא הייתה
   מוצאת כלום · ובשקט, בלי שגיאה. זה קרה בפועל בגרסה הראשונה, והשער בודק את זה עכשיו. */
const SUFFIXES = ['ות', 'ימ', 'ה', 'נ'];

/* כמה אותיות חייבות להישאר אחרי קילוף. 2 ולא 1: מילה בת אות אחת אינה בסיס, והיא
   מייצרת שלד שמתאים לכל דבר. */
const MIN_KEEP = 2;

/* כל הצורות שמילה מייצרת · המילה עצמה, בלי סיומת, בלי תחילית, ובלי שתיהן.
   הקילוף סימטרי בשני הצדדים בכוונה: "מרדן" מול "מורד" חייב להתאים בלי לדעת מי מהם
   הוא הצורה הבסיסית. */
function formsOf(word, p) {
  const out = new Set([word]);
  if (p.peelSuffix) {
    for (const s of SUFFIXES) {
      if (word.length - s.length >= MIN_KEEP && word.endsWith(s)) out.add(word.slice(0, -s.length));
    }
  }
  return out;
}

/* קילוף התחילית נעשה על ה**שלד** ולא על המילה, וזה לא פרט טכני: אותיות התחילית של
   הִתְפַּעֵל הן "הת", וה-ה' נופלת בשלד ממילא. קילוף על המילה היה בודק את ה-ה' ולא מוצא
   אות תחילית · "התפשט" היה נשאר "תפשט" ולא מתאים ל"פשט". על השלד הקילוף עובד:
   התפשט → תפשט → פשט. הסיומות, לעומת זאת, נקלפות מהמילה כי הן מכילות אמות קריאה
   ("ות", "ימ") שהשלד כבר בלע. */
function skelKeysOfWord(word, p) {
  const out = new Set();
  if (!word || word.length < p.minWordLen) return out;
  for (const f of formsOf(word, p)) {
    const k = skel(f);
    if (k.length >= p.minSkel) out.add(k);
    if (p.peelPrefix && k.length - 1 >= p.minSkel && PRE_LETTERS.includes(k[0])) out.add(k.slice(1));
  }
  return out;
}

const intersects = (a, b) => { for (const x of a) if (b.has(x)) return true; return false; };

/* ===== M1 · שלד מילה בודדת מול מקטע בן מילה בודדת =====
 * המקרים שהחוק נבנה בשבילם:
 *   #4  סוֹרֵר · הפירוש "מרדן, סרבן, חסר משמעת" · הוקלד "מורד"   (מרדן ← מרד ← מורד)
 *   #8  לֵאוּת · הפירוש "יגעות, עייפות, תשישות" · הוקלד "עייף"   (עייפות ← עייפ ← עייף)
 *
 * שני הצדדים חייבים להיות **טוקן יחיד**. זה השומר המרכזי, והוא זה שמבדיל את החוק הזה
 * מהכלל שנדחה: אין כאן שום קיפול של פירוש רב-מילי, ולכן אין מכפלת גזעים.
 *
 * פרמטרים · כולם נמדדים, אף אחד לא נבחר מראש:
 *   minWordLen   אורך מילה מינימלי (אחרי norm) משני הצדדים
 *   minSkel      אורך שלד מינימלי · **הפרמטר המסוכן**. שלד בן 2 מתאים להמון מילים
 *   peelSuffix   קילוף ות/ים/ה/ן לפני השלד
 *   peelPrefix   קילוף מ/ת/נ/י לפני השלד · הרפיה נוספת מעל הקודמת
 */
const skeletonSingle = {
  id: 'M1', name: 'skeletonSingle', cls: 'M', kind: 'scan',
  he: 'התשובה והפירוש הם אותה מילה במשקל אחר · שתיהן מילה בודדת',
  defaults: { minWordLen: 3, minSkel: 3, peelSuffix: true, peelPrefix: false },
  keysTyped(typed, ctx, p) {
    const W = wordsOf(typed);
    if (W.length !== 1) return new Set();
    return skelKeysOfWord(W[0], p);
  },
  keysSeg(segs, ctx, p) {
    const out = new Set();
    for (const seg of segs) {
      const W = wordsOf(seg);
      if (W.length !== 1) continue;
      for (const k of skelKeysOfWord(W[0], p)) out.add(k);
    }
    return out;
  },
  accepts(typed, segs, ctx, p) {
    const a = this.keysTyped(typed, ctx, p);
    if (!a.size) return false;
    return intersects(a, this.keysSeg(segs, ctx, p));
  },
};

/* ===== M2 · שלד מילה בודדת מול מילת-ראש בתוך מקטע רב-מילי =====
 * המקרה שהחוק נבנה בשבילו:
 *   #14 הִתְעַרְטֵל · "פשט את בגדיו" · הוקלד "התפשט"   (פשט ← התפשט, ראש המקטע)
 *
 * ⚠ החוק הזה הוא מחלקה B2 (ראש מקטע) ועוד שכבת שלד מעליה · כלומר הוא **מצטבר** על
 * חוק שכבר נמדד ונמצא מתנגש. הוא נמדד בכל זאת כדי שהמספר יהיה מדוד ולא משוער.
 *
 * "מילה שנושאת את משמעות המקטע" אינה מונחת · נמדדות שתי הגדרות:
 *   headMode 'first'    מילת התוכן הראשונה
 *   headMode 'longest'  מילת התוכן הארוכה ביותר (שוויון · הראשונה)
 *   headMode 'any'      כל מילת תוכן · חסם עליון, כדי שיהיה ברור מה הגבלת הראש קונה
 */
const skeletonInSeg = {
  id: 'M2', name: 'skeletonInSeg', cls: 'M', kind: 'scan',
  he: 'התשובה היא מילת הראש של מקטע רב-מילי, במשקל אחר',
  defaults: { minWordLen: 3, minSkel: 3, peelSuffix: true, peelPrefix: false, headMode: 'first' },
  headsOf(seg, ctx, p) {
    const C = contentOf(wordsOf(seg), ctx);
    if (C.length < 2) return [];                       // מקטע בן מילת תוכן אחת · תפקידו של M1
    if (p.headMode === 'any') return C;
    if (p.headMode === 'longest') {
      let best = C[0];
      for (const w of C) if (w.length > best.length) best = w;
      return [best];
    }
    return [C[0]];
  },
  keysTyped(typed, ctx, p) {
    const W = wordsOf(typed);
    if (W.length !== 1) return new Set();
    return skelKeysOfWord(W[0], p);
  },
  keysSeg(segs, ctx, p) {
    const out = new Set();
    for (const seg of segs) for (const h of this.headsOf(seg, ctx, p)) for (const k of skelKeysOfWord(h, p)) out.add(k);
    return out;
  },
  accepts(typed, segs, ctx, p) {
    const a = this.keysTyped(typed, ctx, p);
    if (!a.size) return false;
    return intersects(a, this.keysSeg(segs, ctx, p));
  },
};

/* ===== M3 · טבלת משקלים כתובה ביד =====
 *
 * ⛔ מקור: **נכתבה כאן, מהידע שלנו על העברית**. לא ויקימילון, לא WordNet עברי, לא
 * האקדמיה ללשון, לא שום מקור CC BY-SA · הכלל העומד ב-CLAUDE.md אוסר את כולם. תוכן
 * שאנחנו כותבים בעצמנו מותר ומוכר כדפוס הפרויקט (METHODOLOGY.md).
 *
 * ההבדל המהותי מ-M1: כאן אין גזירה לשלד ואין קיפול אוצר מילים. כל תבנית היא **תבנית
 * מלאה באורך קבוע** שממנה נחלץ שורש, ולכל זוג תבניות המרה **אחת ויחידה**. לכן:
 *   · קבוצת הקבלות **סופית וקטנה** · מקטע בן מילה אחת מייצר לכל היותר מחרוזת אחת לכל
 *     זוג שהוא מתאים לו, ולכן החוק ניתן למנייה מלאה (kind 'gen').
 *   · שתי מילים אינן מתאימות רק כי הן חולקות שורש · הן חייבות לשבת בדיוק על שני צדי
 *     אותו זוג. "מרד" ו-"מרדן" אינם מתאימים ישירות, כי אין ביניהן זוג בטבלה.
 *
 * הכתיב הוא הכתיב **המלא** של המאגר (הפירושים אינם מנוקדים), ולכן התבניות כתובות
 * בכתיב מלא: "לפשוט" ולא "לפשט".
 *
 * סימון: הספרות 1-4 הן אותיות השורש לפי סדר, כל שאר התווים הם אותיות ממש.
 */
const BINYAN_PAIRS = [
  /* פָּעַל ↔ הִתְפַּעֵל · "פשט" ↔ "התפשט" · המקרה של הִתְעַרְטֵל בגרסת מילה-מול-מילה */
  { id: 'pa-hit', a: '123', b: 'הת123', he: 'פעל ↔ התפעל' },
  /* פָּעַל ↔ שם הפועל · "פשט" ↔ "לפשוט" */
  { id: 'pa-inf', a: '123', b: 'ל12ו3', he: 'פעל ↔ שם הפועל' },
  /* הִתְפַּעֵל ↔ שם הפועל שלו · "התפשט" ↔ "להתפשט" */
  { id: 'hit-inf', a: 'הת123', b: 'להת123', he: 'התפעל ↔ שם הפועל שלו' },
  /* שם פעולה ↔ שם פועל · "פשיטה" ↔ "לפשוט" · זה הזוג שהניע את הכלל המקורי (הסתה/להסית) */
  { id: 'act-inf', a: '1י23ה', b: 'ל12ו3', he: 'שם פעולה ↔ שם פועל' },
  /* שם פעולה ↔ הפועל · "מרידה" ↔ "מרד" */
  { id: 'act-pa', a: '1י23ה', b: '123', he: 'שם פעולה ↔ הפועל' },
  /* קוֹטֵל ↔ קָטוּל · "שומר" ↔ "שמור" */
  { id: 'act-pass', a: '1ו23', b: '12ו3', he: 'קוטל ↔ קטול' },
  /* קוֹטֵל ↔ קַטְלָן · "מורד" ↔ "מרדן" · המקרה של סוֹרֵר */
  { id: 'act-agent', a: '1ו23', b: '123נ', he: 'קוטל ↔ קטלן' },
  /* פָּעַל ↔ קוֹטֵל · "מרד" ↔ "מורד" */
  { id: 'pa-act', a: '123', b: '1ו23', he: 'פעל ↔ קוטל' },
  /* תואר ↔ שם מופשט · "עייף" ↔ "עייפות" · המקרה של לֵאוּת */
  { id: 'adj-abs', a: '1י23', b: '1י23ות', he: 'תואר ↔ שם מופשט' },
  /* הִפְעִיל ↔ הַפְעָלָה · "הפליג" ↔ "הפלגה" */
  { id: 'hif-act', a: 'ה12י3', b: 'ה123ה', he: 'הפעיל ↔ הפעלה' },
  /* נִפְעַל ↔ פָּעַל · "נשבר" ↔ "שבר" */
  { id: 'nif-pa', a: 'נ123', b: '123', he: 'נפעל ↔ פעל' },
];

/* תת-קבוצה "שמרנית" · רק זוגות שבהם שני הצדדים נושאים את **אותה** משמעות מילונית.
   act-pass ("שומר" מול "שמור") ו-pa-act ("מרד" מול "מורד") אינם כאלה: פעיל מול סביל
   ותואר-פועל מול פועל אינם אותה תשובה, והם מוצאים מהתת-קבוצה בכוונה. */
const CONSERVATIVE = new Set(['pa-hit', 'hit-inf', 'act-inf', 'act-pa', 'act-agent', 'adj-abs', 'hif-act']);

/* norm מקפלת אותיות סופיות (ן→נ, ם→מ), ולכן התבניות חייבות להיכתב בצורה המקופלת ·
   '123נ' ולא '123ן'. תבנית שנכתבה בצורה הסופית לא הייתה מתאימה לשום מילה במאגר,
   ובשקט: היא פשוט לא הייתה מוצאת כלום. השער בודק את זה במפורש. */
const FINAL_FORMS = 'ךםןףץ';

function matchTemplate(word, tpl, strictRoot) {
  if (word.length !== tpl.length) return null;
  const slot = {};
  let n = 0;
  for (let i = 0; i < tpl.length; i++) {
    const t = tpl[i];
    if (t >= '1' && t <= '4') {
      const d = Number(t);
      if (slot[d] !== undefined) { if (slot[d] !== word[i]) return null; }
      else { slot[d] = word[i]; if (d > n) n = d; }
    } else if (t !== word[i]) return null;
  }
  let root = '';
  for (let d = 1; d <= n; d++) {
    if (slot[d] === undefined) return null;
    /* strictRoot · אות שורש שהיא אם קריאה (שורש חסר או ל"ה) מוציאה את המילה מהטבלה.
       זה חוסם את החלשים, ובכללם "עיפ" של המקרה #8 · לכן הוא פרמטר שנמדד, לא ברירה. */
    if (strictRoot && MATRES.includes(slot[d])) return null;
    root += slot[d];
  }
  return root;
}

function fillTemplate(tpl, root) {
  let out = '';
  for (let i = 0; i < tpl.length; i++) {
    const t = tpl[i];
    if (t >= '1' && t <= '4') {
      const c = root[Number(t) - 1];
      if (c === undefined) return null;
      out += c;
    } else out += t;
  }
  return out;
}

/* p.pairs · רשימת מזהים מפורשת. קיימת כדי שאפשר יהיה למדוד **כל זוג לבדו**: תצורה
   מצרפית שנדחית אינה אומרת אילו זוגות אשמים, ובלי הפירוק היה נשאר פתח ל"אולי זוג אחד
   בכל זאת נקי". השער נשען על הפירוק הזה בדיוק. */
function pairsOf(p) {
  if (p.pairs && p.pairs.length) {
    const want = new Set(p.pairs);
    const sel = BINYAN_PAIRS.filter(x => want.has(x.id));
    if (sel.length !== want.size) throw new Error('morphrules: זוג לא מוכר ברשימת pairs · ' + p.pairs.join(','));
    return sel;
  }
  return p.conservative ? BINYAN_PAIRS.filter(x => CONSERVATIVE.has(x.id)) : BINYAN_PAIRS;
}

const binyanPair = {
  id: 'M3', name: 'binyanPair', cls: 'M', kind: 'gen',
  he: 'התשובה והפירוש הם שני צדדים של זוג משקלים כתוב · שתיהן מילה בודדת',
  defaults: { conservative: false, strictRoot: false },
  PAIRS: BINYAN_PAIRS, CONSERVATIVE,
  keysOfWord(word, p) {
    const out = new Set();
    if (!word) return out;
    for (const pr of pairsOf(p)) {
      for (const side of ['a', 'b']) {
        const r = matchTemplate(word, pr[side], p.strictRoot);
        if (r) out.add(pr.id + ':' + r);
      }
    }
    return out;
  },
  keysTyped(typed, ctx, p) {
    const W = wordsOf(typed);
    if (W.length !== 1) return new Set();
    return this.keysOfWord(W[0], p);
  },
  keysSeg(segs, ctx, p) {
    const out = new Set();
    for (const seg of segs) {
      const W = wordsOf(seg);
      if (W.length !== 1) continue;
      for (const k of this.keysOfWord(W[0], p)) out.add(k);
    }
    return out;
  },
  /* המנייה המלאה · לכל מקטע בן מילה אחת, לכל זוג שהמילה יושבת על צד אחד שלו, הצד
     השני עם אותו שורש. זהו וזה הכל · קבוצה סופית, קטנה, וניתנת להצגה בשמה. */
  expand(segs, ctx, p) {
    const out = new Set();
    for (const seg of segs) {
      const W = wordsOf(seg);
      if (W.length !== 1) continue;
      const w = W[0];
      for (const pr of pairsOf(p)) {
        for (const [from, to] of [['a', 'b'], ['b', 'a']]) {
          const r = matchTemplate(w, pr[from], p.strictRoot);
          if (!r) continue;
          const v = fillTemplate(pr[to], r);
          if (v && !FINAL_FORMS.split('').some(c => v.includes(c))) out.add(v);
        }
      }
    }
    for (const s of segs) out.delete(s);
    return out;
  },
  accepts(typed, segs, ctx, p) {
    const a = this.keysTyped(typed, ctx, p);
    if (!a.size) return false;
    return intersects(a, this.keysSeg(segs, ctx, p));
  },
};

const RULES = [skeletonSingle, skeletonInSeg, binyanPair];
const BY_ID = new Map(RULES.map(r => [r.id, r]));
const BY_NAME = new Map(RULES.map(r => [r.name, r]));

/* ===== השילוב · אותו חוזה בדיוק של makeGlossChecker =====
 * תוספתי בלבד ומובנה: meaningMatch של האפליקציה קודם, החוקים אחריה. שער הווטו חוסם
 * **רק את התוספת**, לעולם לא את meaningMatch · ווטו שיוחל על ההכרעה כולה היה פוסל
 * מקטע שהכרטיס עצמו מקבל היום ברגע שערך אחר חולק אותו, כלומר רגרסיה. הסדר נאכף
 * אמפירית על כל מקטע בכל המאגר בעמודת הרגרסיה של measure_morph.
 */
function makeMorphChecker(ctx, cfg) {
  const { isVetoedSeg } = require('./veto.js');
  const active = [];
  let veto = null;
  for (const r of RULES) {
    const c = cfg && (cfg[r.name] || cfg[r.id]);
    if (!c || c.on === false) continue;
    if (c.veto) veto = c.veto;
    active.push({ rule: r, params: Object.assign({}, r.defaults, c.params) });
  }
  return function (typed, card) {
    const a = ctx.norm(typed);
    if (!a) return { ok: false, by: null };
    if (ctx.meaningMatch(a, card.meaning)) return { ok: true, by: 'today' };
    const segs = Array.from(ctx.meaningSegs(card.meaning));
    for (const { rule, params } of active) {
      if (!rule.accepts(a, segs, ctx, params)) continue;
      if (veto && isVetoedSeg(a, card, veto, ctx)) return { ok: false, by: null, veto: true };
      return { ok: true, by: rule.name };
    }
    return { ok: false, by: null };
  };
}

module.exports = {
  RULES, BY_ID, BY_NAME, skeletonSingle, skeletonInSeg, binyanPair,
  makeMorphChecker, wordsOf, contentOf, stopOf, skel, skelKeysOfWord, formsOf,
  matchTemplate, fillTemplate, BINYAN_PAIRS, CONSERVATIVE, MATRES, PRE_LETTERS, SUFFIXES, MIN_KEEP,
};
