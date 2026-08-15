'use strict';
/* המימוש הקנוני של ההכרעה · typo-lab/lib/checker.js
 *
 * זו הפונקציה שבשלב ב' תודבק ל-app.js בשם nearMatch. כל עוד היא חיה כאן, המעבדה מודדת
 * בדיוק את מה שהריצה תעשה · וטבלת הזהב (out/golden.jsonl) היא ההוכחה לכך שהיא לא סטתה.
 *
 * ===== סדר השכבות · נושא במשקל =====
 *
 *   1. **החוק של היום.** acceptsToday / meaningMatch. מה שמתקבל היום מתקבל, נקודה. אין
 *      פרמטר שיכול לשבור קבלה קיימת, ולכן אין ריצת GA שיכולה לייצר רגרסיה.
 *   2. **וטו מבני.** isVetoedTerm / isVetoedSeg · המחרוזת היא מילת מאגר אחרת. זו הכרעת
 *      חגי ואין לה סף ואין לה גן. היא רצה לפני כל חישוב מרחק, כדי שאף שילוב משקלים
 *      לא יוכל לעקוף אותה.
 *   2ב. **וטו הלקסיקון.** המחרוזת היא מילה אמיתית של השפה שאינה צורה קבילה של הכרטיס
 *      הזה · out/runtime-lexicon.js. אותה סמנטיקה בדיוק של שכבה 2 ובאותו מקום, ולכן
 *      אותו נימוק: היא רצה לפני כל חישוב מרחק ואין לה גן.
 *   3. **שער אורך.** minLen · מתחת לזה אין סובלנות בכלל.
 *   4. **מרחק ממושקל** מול המפתחות שהכרטיס מקבל, מול הסף של רצועת האורך.
 *
 * ===== 4ב · שולי הדו-משמעות (vetoMargin), ולמה הוא אחרי ולא לפני =====
 *
 * הווטו בשלב 2 חוסם מחרוזת ש**היא** מילה אחרת. הוא אינו חוסם מחרוזת שאינה מילה אבל
 * קרובה למילה אחרת בדיוק כמו שהיא קרובה לשלך · "אמיר" מול "טמיר"/"תמיר". קבלה כזו היא
 * הימור בין שני ערכים, וזה בדיוק מה שהתיוג בדאטהסט קורא לו ambiguous (25,432 שורות
 * ב-v2, יותר ממחצית מהשליליות). בלי בדיקה כזו אין שום צירוף ספים עם אפס קבלות-שווא
 * וסובלנות שאינה אפס · זו מדידה, לא הערכה.
 *
 * ‏v2 · תיקון F7 · הדו-משמעות נמדדת מהצורה **המקובלת הקרובה ביותר** של הכרטיס, כלומר
 * מ-dOwn שהוא מינימום על כל המפתחות המקובלים, וזה בדיוק המדד שהריצה מחשבת כאן. קודם
 * לכן הדאטהסט מדד אותו ממפתח המונח בלבד, ולכן 302 שורות (301 עברית, 1 אנגלית, כולן
 * היפוך) תויגו reject בזמן שהבודק היה מקבל אותן · הן שאילצו את הריצה הקודמת ל-שוליים 2.
 *
 * ההגדרה: dOwn = מרחק לוונשטיין למפתח הקרוב ביותר של הכרטיס, dOther = מרחק למפתח הקרוב
 * ביותר ב**מאגר** ששייך לערך אחר. נפסל כאשר dOther - dOwn < vetoMargin. לכן:
 *   vetoMargin = 0 · פוסל רק כשהמילה האחרת קרובה **יותר**
 *   vetoMargin = 1 · פוסל גם בתיקו · בדיוק הקריטריון שתייג את הדאטהסט
 *   vetoMargin = 2 · פוסל גם כשהמילה האחרת רחוקה באחד · שמרני יותר מהתיוג
 *
 * המרחק כאן הוא editDist של app.js עצמה ולא המרחק הממושקל, ובכוונה: השאלה "האם הקלדת
 * משהו ששייך למילה אחרת" אינה תלויה בכמה נוח היה להקליד אותו.
 *
 * והמיקום · אחרי חישוב המרחק ולא לפניו: ההכרעה זהה בשני הסדרים (פסילה היא פסילה), אבל
 * הנימוק אינו. הודעת ההתנגשות ("הקלדת מילה אחרת · בעצם ידעתי") צריכה להופיע רק כשבאמת
 * עמדנו לקבל. מחרוזת שרחוקה מהכול תיפסל בגלל מרחק, וזה מה שהיא צריכה להגיד.
 *
 * ===== 3ב · שומר הנטיות · אילוץ קשיח, לא גן =====
 *
 * ‏isCorrect('כפרים','כֹּפֶר') חייב להישאר false · זה מקובע ב-tests/05 ומופיע בתוכנית
 * כאילוץ קשיח על ה-GA. ההפרש שם הוא **סיומת טהורה**, כלומר המוקלד הוא בדיוק המפתח ועוד
 * ‏ים/ות/ה, וזו נטייה ולא טעות הקלדה: הלומד כתב מילה אחרת, נכון, ובכוונה.
 *
 * למה זה לא יכול להיות משקל ב-W: המשקלים אינם יודעים **היכן** נפלה הפעולה. הוספת ה"א
 * בסוף מילה והוספת ה"א באמצעה הן אותה פעולה בדיוק בווקטור הספירה, והראשונה היא נטייה
 * בעוד השנייה היא טעות אמיתית שאנחנו רוצים לקבל. נמדד: בלי השומר הזה, שורות neg/inflection
 * במרחק 1 שורדות את כל שכבות ההתנגשות, ולכן כל סף חיובי מייצר קבלות-שווא · וה-GA היה
 * נאלץ לרדת לאפס סובלנות בעברית כדי לספק את עונש המוות. עם השומר, אותן שורות נופלות
 * מבנית והספים משוחררים לעבוד על טעויות אמיתיות.
 *
 * הכיוון אדיטיבי בלבד (מוקלד = מועמד + סיומת). ההפך · מוקלד = מועמד פחות סיומת · הוא
 * השמטת אות רגילה, וזו כן טעות הקלדה. וכיוון המונח בלבד, כי שם נופלת ההכרעה שהאילוץ
 * מדבר עליה; מקטע פירוש אינו נוטה.
 */

const { wEditDist } = require('./wdist.js');
const { acceptedKeys, acceptedSegs, acceptsToday } = require('./keys.js');
const { isVetoedTerm, isVetoedSeg } = require('./veto.js');
const { buildIndex } = require('../gen_dataset.js');

const letters = s => String(s == null ? '' : s).replace(/ /g, '').length;

/* ===== תקרת הפעולות · קבוע קשיח, לא גן, ולמה זה חובה =====
 *
 * מועמד נכנס לחישוב רק אם מרחק העריכה ה**גולמי** אליו (editDist של app.js, בלי משקלים)
 * אינו עולה על 3. המשקלים מפלים בתוך החלון הזה · הם אינם פותחים אותו.
 *
 * זה לא קישוט. בריצת GA הראשונה, בלי התקרה, האלגוריתם מצא את הפרצה תוך דורות ספורים:
 * הוא הוריד את מחיר ההכנסה והמחיקה ל-0.2, ואז **כל** מחרוזת קרובה לכל מחרוזת · הרצועה
 * של המרחק החסום נפתחת ל-cap/0.2 והמסלול הזול הוא פשוט למחוק הכול ולכתוב מחדש. הפלט
 * המדויק היה ‎"kqvv" ~ "late" במרחק 1.2 ו-"מחסנ תבנ" ~ "אסמ" במרחק 0.74 · זבל אקראי
 * שהתקבל כטעות הקלדה. אילוץ אפס-קבלות-שווא לא תפס את זה כי הקירוב המהיר של evolve כבר
 * מגביל את עצמו ל-3 פעולות, ולכן ה-GA "ראה" נוף נקי בזמן שהמסלול המדויק דלף.
 *
 * שלושה, ולא ארבעה: מעל שלוש עריכות גולמיות אין הבחנה בין טעות הקלדה למילה אחרת · לא
 * מבחינת המדידה ולא מבחינת השכל הישר.
 *
 * ‏MAX_CANDS · לכל היותר שמונת המועמדים הקרובים ביותר נבחנים, בסדר קבוע (מרחק, אורך,
 * ואז לקסיקוגרפית). לא כדי לחסוך זמן אלא כדי שהמעבדה והריצה יבחנו את **אותה** קבוצה:
 * "כל המפתחות" הוא סדר שתלוי במימוש של Set, וטבלת הזהב הייתה מתפוצצת עליו.
 */
const MAX_OPS = 3;
const MAX_CANDS = 8;

/* ===== שכבה 2ב · וטו הלקסיקון =====
 *
 * מה שהמדידה על v2 הראתה, ובגללו השכבה הזאת קיימת: 1,167 שורות he-word ו-694 שורות
 * gloss תויגו real-word · המוקלד הוא מילה אמיתית של השפה שאינה צורה של הכרטיס · והן
 * היו **בלתי נראות לכל שכבה קיימת**. הווטו של המאגר רואה מילות מאגר; שולי הדו-משמעות
 * מודדים מרחק למפתחות מאגר; מילה עברית שאינה במאגר אינה נתפסת באף אחד מהם. בגנום
 * המתירני 1,164 מתוך 1,167 התקבלו, כלומר אין סף שמפריד אותן משגיאת כתיב אמיתית ·
 * ולכן ה-GA נאלץ לרדת ל-2.49% recall כדי לספק את אילוץ אפס-קבלות-השווא. השכבה הזאת
 * היא מה שמחזיר את ההפרדה: היא שואלת שאלה שהמאגר לבדו אינו יכול לענות עליה.
 *
 * ‏out/runtime-lexicon.js הוא מסנן Bloom · negative שגוי בלתי אפשרי מבנית, positive
 * שגוי אפשרי ב-0.5%. הכיוון הזה הוא הנכון עבורנו: טעות של המסנן עולה recall (דחיית
 * שגיאת כתיב אמיתית) ולעולם אינה מייצרת קבלת-שווא.
 *
 * **הוא אינו גן.** אותו נימוק בדיוק כמו שומר הנטיות: אילוץ שהוא לרעת הכושר חייב להיות
 * מחוץ להישג ידו של ה-GA, אחרת הוא יכבה אותו בדור הראשון. useLexicon קיים כדי שאפשר
 * יהיה **למדוד** את תרומתו (הריצה הנגדית), לא כדי שאפשר יהיה לכבות אותו בייצור.
 *
 * ‏lexHit הוא שיקוף מדויק של inLexicon ב-lib/lexicon.js ושל lexHit בבנאי · אותה
 * סמנטיקת srcKey: כשמספר המילים זהה נבדקות רק המילים שהשתנו, אחרת כולן. בלי הזהות
 * הזאת הריצה הייתה מכיילת את עצמה מול תוויות שנוצרו בכלי אחר · וזה בדיוק הכשל שתיקון
 * ‏F7 נועד לסגור, ואין טעם לפתוח אותו מחדש מהצד השני.
 */
let LEX = null;
try { LEX = require('../out/runtime-lexicon.js'); } catch (e) { LEX = null; }
const LEX_MIN = 2;

/* ===== החזרת החיסור · למה המסנן לבדו אינו מספיק =====
 *
 * הבנאי מחסיר מהמסנן **כל** צורה קבילה של כל ערך במאגר, כדי שהוא לעולם לא יפסול מילה
 * שהמאגר עצמו מלמד. ההנחה הייתה שהחור שנפער נסגר על ידי וטו המאגר. נמדד שהיא אינה
 * מתקיימת: מתוך 2,019 שורות real-word, המסנן תופס 1,356, וטו המאגר תופס **0**, ו-663
 * אינן נתפסות באף אחד מהם. הסיבה היא ש-coverage בבנאי בדק "האם **אסימון** כלשהו הוא
 * צורת מאגר" בעוד שהווטו בודק "האם **כל המחרוזת** היא צורת מאגר של ערך אחר". שני
 * מבחנים שונים, ורק הראשון נכון לצירופים.
 *
 * שתי הבריחות שנמדדו בפועל, שתיהן קבלות-שווא:
 *   ‏"on particular" ~ "in particular" · "on" הוא מפתח מונח (הכרטיס on|1) ולכן הוחסר
 *     מהמסנן, אבל המחרוזת השלמה אינה מונח ולכן הווטו אינו נורה · פער אסימון-מול-מחרוזת.
 *   ‏"מעניינ" ~ "מיניינ" · "מעניינ" הוא מקטע פירוש של עָסִיסִי|2 ולכן הוחסר, אבל בכיוון
 *     המונח הווטו בודק termKeys בלבד · פער חוצה-כיוונים.
 *
 * התיקון אינו לשנות את הנכס אלא להשלים את הפרדיקט: אסימון הוא "מילה אמיתית" אם המסנן
 * מכיר אותו **או** שהוא צורה קבילה במאגר (שני הכיוונים). זו בדיוק רשימת המילים לפני
 * החיסור, בלי לגעת בקובץ. והפטור נשאר במקומו הנכון · אסימון ששייך לכרטיס **הזה** אינו
 * נחשב מילה זרה, ולכן צורה של הכרטיס לעולם אינה נדחית.
 */
function bankHasToken(veto, tok) {
  if (!veto) return false;
  return veto.termKeys.has(tok) || veto.segKeys.has(tok);
}

/* מטמון על מערך המועמדים עצמו · הבודק ו-evolve שניהם מגישים מערך מוחזק-במטמון לכל
   כרטיס, ולכן זה נפתר פעם אחת לכרטיס ולא פעם אחת להחלטה. */
const OWN_TOKENS = new WeakMap();
function ownTokensOf(cands) {
  let s = OWN_TOKENS.get(cands);
  if (!s) {
    s = new Set();
    for (const c of cands) for (const p of String(c).split(' ')) if (p) s.add(p);
    OWN_TOKENS.set(cands, s);
  }
  return s;
}

function makeRealToken(lang, veto, own) {
  return tok => {
    if (!tok || tok.length < LEX_MIN) return false;
    if (own && own.has(tok)) return false;
    if (LEX && LEX.lookup(tok, lang)) return true;
    return bankHasToken(veto, tok);
  };
}

/* ‏real אופציונלי · בלעדיו הפרדיקט הוא המסנן בלבד, וזו הצורה שנבדקת מול lexHit של
   הבנאי (‏0 פערים על 89,375 שורות). עם veto הוא הפרדיקט השלם שהריצה משתמשת בו. */
function lexHit(typedKey, srcKey, lang, real) {
  const isReal = real || makeRealToken(lang, null, null);
  if (!typedKey) return false;
  const parts = String(typedKey).split(' ').filter(Boolean);
  if (!parts.length) return false;
  let check = parts;
  if (srcKey != null) {
    const src = String(srcKey).split(' ').filter(Boolean);
    if (src.length === parts.length) {
      check = parts.filter((p, i) => p !== src[i]);
      if (!check.length) return false;
    }
  }
  for (const p of check) if (!isReal(p)) return false;
  return true;
}

/* ‏**any** על פני המועמדים, ולא all · ובכוונה. הריצה אינה יודעת מאיזו צורה הלומד יצא,
   ולכן היא חייבת לשאול "האם קיימת צורה קבילה שביחס אליה זו מילה אמיתית אחרת". ‏all
   היה מפספס שורות שהתיוג סימן real-word בכל פעם שמועמד אחר במקרה אינו מפעיל את
   הכלל · חור בטיחות. ‏any הוא על-קבוצה של התיוג ולכן אינו יכול לפספס; מחירו הוא
   recall, והוא נמדד ומדווח ולא מוערך.
   השורה הראשונה היא החוק שאין עליו ויכוח: צורה קבילה של הכרטיס הזה אינה נדחית לעולם,
   ולא משנה מה הלקסיקון חושב עליה. */
function lexVetoed(typedKey, cands, lang, veto) {
  if (!LEX) return false;
  for (const c of cands) if (c === typedKey) return false;
  const real = makeRealToken(lang, veto, ownTokensOf(cands));
  for (const c of cands) if (lexHit(typedKey, c, lang, real)) return true;
  return false;
}

/* אינדקס השכנים הוא של הווטו, לא של הגנום · הוא נבנה פעם אחת לכל הקשר ומשותף לכל
   הגנומים שה-GA יבחן. buildIndex מיובאת מ-gen_dataset ולא נכתבת מחדש: המדד שמכריע
   דו-משמעות במעבדה חייב להיות **אותו** מדד שתייג את הדאטהסט, אחרת ה-GA מכייל את עצמו
   מול תוויות שנוצרו בכלי אחר. */
const INDEX_CACHE = new WeakMap();
function indexesFor(veto) {
  let hit = INDEX_CACHE.get(veto);
  if (!hit) {
    hit = { term: buildIndex(veto.termKeys), seg: buildIndex(veto.segKeys) };
    INDEX_CACHE.set(veto, hit);
  }
  return hit;
}

/* המרחק למפתח הקרוב ביותר במאגר ששייך לערך אחר. אינסוף = אין כזה ברדיוס שהאינדקס
   מכסה (‏2). זה מספיק: השאלה היחידה שנשאלת עליו היא השוואה מול dOwn שכבר קטן מ-3. */
function nearestOther(typed, index, allowOwners, ctx, radius) {
  let best = Infinity;
  for (const i of index.near(typed, radius == null ? 2 : radius)) {
    const k = index.keys[i];
    let other = false;
    for (const o of index.owners[i]) if (!allowOwners.has(o)) { other = true; break; }
    if (!other) continue;
    const d = ctx.editDist(k, typed);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/* הסיומות של שומר הנטיות. הרשימה זהה לזו ש-gen_dataset מייצרת ממנה את שורות
   neg/inflection, והזהות הזאת **נבדקת ולא מוצהרת**: selfcheck34 מריץ את הבודק על כל
   שורות הנטייה בדאטהסט ודורש שאף אחת לא תתקבל. אם מישהו יוסיף סיומת שם ולא כאן, השער
   ייפול · וזה בדיוק מה שצריך לקרות.
   הן מנורמלות דרך ctx.norm כי ההשוואה נעשית על מפתחות מנורמלים (ים -> ימ). */
function suffixesFor(ctx) {
  const raw = ctx.LANG === 'en' ? ['s', 'es', 'ed', 'ing', 'ly'] : ['ים', 'ות', 'ה', 'י', 'יות'];
  const out = [];
  for (const s of raw) {
    const k = ctx.LANG === 'en' ? s : ctx.norm(s);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/* ברירות מחדל שמרניות · גנום חסר-גן אינו נופל לסובלנות רחבה בשקט. */
function normalizeParams(params) {
  const p = params || {};
  const W = Object.assign({ sub: 1, adjSub: 1, transpose: 2, ins: 1, del: 1, doubleLetter: 1, materVI: 1, homophone: 1 }, p.W || {});
  let bands = Array.isArray(p.bands) && p.bands.length ? p.bands.slice() : [{ maxLen: Infinity, t: 0 }];
  bands = bands.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t == null ? 0 : b.t }))
    .sort((a, b) => a.maxLen - b.maxLen);
  return {
    minLen: p.minLen == null ? 0 : p.minLen,
    vetoMargin: p.vetoMargin == null ? 1 : p.vetoMargin,
    /* ברירת המחדל היא **דלוק**. פרמטרים ישנים שנטענים מהדיסק בלי השדה הזה מקבלים את
       השכבה, ולא מאבדים אותה בשקט · זה הכיוון הבטוח מבין השניים. */
    useLexicon: p.useLexicon !== false,
    bands, W
  };
}

function makeChecker(params, ctx, veto, lang) {
  const L = lang || ctx.LANG;
  if (L !== ctx.LANG) throw new Error(`makeChecker: lang "${L}" does not match the context's LANG "${ctx.LANG}"`);
  if (veto.lang !== ctx.LANG) throw new Error(`makeChecker: the veto was built for "${veto.lang}" and the context is "${ctx.LANG}"`);
  const P = normalizeParams(params);
  const IX = indexesFor(veto);

  const thresholdFor = len => {
    for (const b of P.bands) if (len <= b.maxLen) return b.t;
    return P.bands[P.bands.length - 1].t;
  };

  /* acceptedKeys/acceptedSegs נקראות שוב ושוב על אותם כרטיסים (גם מתוך veto.js), והן
     בונות Set מחדש בכל קריאה. מטמון לכל בודק · אינו משנה תוצאה, רק זמן. */
  const keyCache = new Map(), segCache = new Map(), allowCache = new Map();
  const cardId = card => String(card && card.term) + ' ' + String(card && card.unit);
  const keysOf = card => {
    const id = cardId(card);
    let v = keyCache.get(id);
    if (!v) { v = Array.from(acceptedKeys(card, ctx)).filter(Boolean); keyCache.set(id, v); }
    return v;
  };
  const segsOf = card => {
    const id = cardId(card);
    let v = segCache.get(id);
    if (!v) { v = Array.from(acceptedSegs(card, ctx)).filter(Boolean); segCache.set(id, v); }
    return v;
  };
  /* מי אינו "ערך אחר". בכיוון המונח · הכרטיס בלבד. בכיוון הפירוש · גם נרדפות שחולקות
     איתו פירוש, בדיוק כמו פטור-הנרדפות של isVetoedSeg. אותה הבחנה בדיוק שגן_דאטהסט
     עשה בין allowTerm ל-allowSeg. */
  const allowOf = card => {
    const id = cardId(card);
    let v = allowCache.get(id);
    if (!v) {
      const term = new Set([ctx.K(card && card.term)]);
      const seg = new Set(term);
      for (const t of Array.from(ctx.glossAlts(card))) seg.add(ctx.K(t));
      v = { term, seg };
      allowCache.set(id, v);
    }
    return v;
  };

  const SUF = suffixesFor(ctx);
  const isInflection = (typedKey, cands) => {
    for (const c of cands) {
      if (typedKey.length <= c.length || !typedKey.startsWith(c)) continue;
      const tail = typedKey.slice(c.length);
      if (SUF.includes(tail)) return true;
    }
    return false;
  };

  /* הליבה המשותפת לשני הכיוונים · הכל זהה חוץ מאיזה וטו, אילו מועמדים, ואיזה אינדקס. */
  function decide(typedKey, cands, vetoed, index, allow, inflect, lexLang) {
    if (vetoed) return { ok: false, why: 'collision' };
    /* ‏2ב · אותו מקום בדיוק כמו וטו המאגר, ומאותה סיבה: לפני כל חישוב מרחק, כדי שאף
       צירוף משקלים לא יוכל לעקוף אותו. נימוק נפרד ולא 'collision', כי זו התנגשות עם
       **השפה** ולא עם המאגר, וההודעה ללומד שונה. */
    if (P.useLexicon && lexVetoed(typedKey, cands, lexLang, veto)) return { ok: false, why: 'real-word' };
    if (letters(typedKey) < P.minLen) return { ok: false, why: 'short' };
    if (!cands.length) return { ok: false, why: 'far' };
    if (inflect && isInflection(typedKey, cands)) return { ok: false, why: 'inflection' };

    /* מרחק גולמי לכל מועמד · משמש גם לתקרת הפעולות וגם ל-dOwn של שולי הדו-משמעות. */
    const scored = [];
    let dOwn = Infinity;
    for (const c of cands) {
      const raw = ctx.editDist(typedKey, c);
      if (raw < dOwn) dOwn = raw;
      if (raw <= MAX_OPS) scored.push({ c, raw, len: letters(c) });
    }
    if (!scored.length) return { ok: false, why: 'far' };
    scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));

    let best = Infinity;
    for (const s of scored.slice(0, MAX_CANDS)) {
      const t = thresholdFor(s.len);
      if (!(t > 0)) continue;                                  // אפס סובלנות ברצועה הזו · אין מה לחשב
      const d = wEditDist(typedKey, s.c, P.W, t, MAX_OPS);
      if (d < best) best = d;
      if (best === 0) break;
    }
    if (!isFinite(best)) return { ok: false, why: 'far' };

    if (P.vetoMargin > 0) {
      const dOther = nearestOther(typedKey, index, allow, ctx);
      if (dOther - dOwn < P.vetoMargin) return { ok: false, why: 'collision' };
    }
    return { ok: true, via: 'typo', dist: best };
  }

  function acceptWord(typed, card) {
    if (acceptsToday(ctx, typed, card)) return { ok: true, via: 'exact' };
    const key = ctx.K(typed);
    if (!key) return { ok: false, why: 'far' };
    return decide(key, keysOf(card), isVetoedTerm(key, card, veto, ctx), IX.term, allowOf(card).term, true, ctx.LANG);
  }

  function acceptGloss(typed, card) {
    if (ctx.meaningMatch(typed, card && card.meaning)) return { ok: true, via: 'exact' };
    const seg = ctx.norm(typed);
    if (!seg) return { ok: false, why: 'far' };
    /* ‏'he' תמיד · מקטע פירוש הוא עברית גם כשהמאגר אנגלי, וזו אותה הבחנה שפה-**וסט**
       שהמטמון של הבודק עושה. לקסיקון אנגלי על "כר דשא" היה שכבה מתה. */
    return decide(seg, segsOf(card), isVetoedSeg(seg, card, veto, ctx), IX.seg, allowOf(card).seg, false, 'he');
  }

  return { acceptWord, acceptGloss, params: P, thresholdFor, suffixes: SUF };
}

module.exports = { makeChecker, normalizeParams, nearestOther, indexesFor, letters, suffixesFor, lexHit, lexVetoed, LEX_AVAILABLE: !!LEX, MAX_OPS, MAX_CANDS };
