'use strict';
/* ⭐ המורה · typo-lab/teacher.js
 *
 *   node typo-lab/teacher.js --build-calib          → out/teacher/calib.jsonl  (‏40+24 פריטי כיול)
 *   node typo-lab/teacher.js --build-neg            → out/teacher/neg24.jsonl  (‏24 שליליים במבנה)
 *   node typo-lab/teacher.js --emit --set calib     → out/teacher/batch/*.tsv  (הקלט לשופטים)
 *   node typo-lab/teacher.js --ingest --set calib   → קורא out/teacher/verdict/*.tsv → הפנקס
 *   node typo-lab/teacher.js --calib                → טבלת הכיול מול 40 התיוגים ו-24 המקרים
 *   node typo-lab/teacher.js --negtest              → ⛔ הבקרה השלילית · האוכלוסייה שהייתה חסרה
 *   node typo-lab/teacher.js --ablate               → מה כל עדשה מוסיפה · על שני הסטים
 *   node typo-lab/teacher.js --agree --set calib    → הסכמה בין העדשות
 *   node typo-lab/teacher.js --cost  --set calib    → עלות לפריט והערכה לעשרות אלפים
 *   node typo-lab/teacher.js --selftest             → שיניים · יוצא 1 כשקלט שאמור להיפסל עובר
 *
 * ‏שרשרת מלאה מאפס:  --build-calib && --build-neg && --emit --set calib && --emit --set neg24
 *                    → מריצים את השופטים → --ingest לכל סט → --calib && --negtest && --ablate
 *
 * ===== מה זה =====
 *
 * ‏judge({lang, term, gloss, typed, direction}) → { verdict, why }
 *
 * השאלה שהמורה עונה עליה היא **"האם מי שכתב את זה ידע את המילה"** — לא "האם זה
 * מאויית נכון" ולא "האם זה במאגר". זה בדיוק מה ששער ההתנגשויות עיוור לו מהגדרתו:
 * הוא שואל "האם המחרוזת הזאת היא תשובה של כרטיס אחר", והוא מחזיר ירוק על
 * `זבן`→`מכור בחנות` כי אף כרטיס אחר אינו תובע את המחרוזת. המורה שואל משמעות.
 *
 * המורה **אינו נשלח**. הוא מעבדה. הפלט שלו הוא סט פסקים שהתלמיד הדטרמיניסטי
 * ב-`app.js` לומד לחקות · אפס עלות לכל תשובה, אפס השהיה, עובד אופליין.
 *
 * ===== למה זה חוקי =====
 *
 * תוכן שנכתב על ידי LLM מותר וזה הדפוס של הפרויקט (`METHODOLOGY.md`). אף מקור
 * מהרשימה האסורה (`CLAUDE.md`) אינו נוגע בזה: אין כאן ויקימילון, אין WordNet,
 * אין לקסיקון AGPL. השופט קורא **רק** את ה-TSV שנשלח לו.
 *
 * ===== דטרמיניזם · זה מה שמאפשר עשרות אלפים =====
 *
 * מפתח הפריט הוא ‏SHA-256 של הקלט המקנוני (`lang|direction|term|gloss|written|typed`).
 * כל פסק נשמר בפנקס לפי אותו מפתח. הרצה חוזרת על אותו פריט **אינה משלמת שוב** —
 * `--emit` מדלג על מה שכבר יש בפנקס. בלי זה, "עשרות אלפי תשובות" הוא לא תוכנית.
 * פסק סותר על אותו מפתח **זורק** ולא דורס · זה הבאג שהפיל את `semantic_panel.js`
 * בגלגול הראשון (‏recall השתנה פי שלושה לפי סדר `readdirSync`).
 *
 * ===== ארבע עדשות · למה לא אותה שאלה ארבע פעמים =====
 *
 * ידוע מהסבב הקודם: פאנל **סמנטי** הסכים פה-אחד ב-51.9% בלבד, ואילו שאלה
 * **דקדוקית** ("האם זו מילה · האם זה פועל") הגיעה ל-99.6%. מסקנה מבצעית:
 * לפרק שאלה מעורפלת לכמה חדות, ולהעדיף שאלות שאפשר לענות עליהן אמין.
 * ⚠ זה **נבדק כאן שוב ואושר**: העדשה שכן שאלה את השאלה המלאה (‏T1) יצאה 46.9%.
 *
 *   T2 · דיוק    — האם יש בתשובה **מילה שגויה** · דיוק ולא שלמות
 *   T3 · הגדרה   — קרא **רק** את התשובה ואמור לאיזו מילה היא מובילה · הפוך
 *   T4 · דקדוק   — חלק הדיבר של המילה שהשתנתה · רק כשהשתנתה מילה אחת
 *   T5 · מילה    — לקסיקלי טהור · האם כל מחרוזת היא מילה עברית קיימת
 *
 * ‏T4 היא העדשה שעושה את העבודה על שינויי מילה, וזה נמדד: מתוך 29 הדחיות בתיוג העיוור,
 * הרוב אינן סחיפה סמנטית אלא **ניתוח דקדוקי שגוי** — `צבר`, `כלל`, `חור`, `דבר`
 * ואפילו מילת היחס `אחר` זוהו כפועל בעבר והוטו. `הרג`→`הורג` התקבל, `צבר`→`צובר`
 * נדחה, ואותה צורת שטח בדיוק מפרידה ביניהם: חלק הדיבר בהקשר.
 * ‏T2 ו-T3 הן שעושות את העבודה על תשובה חופשית — שם T4 אינה חלה כלל.
 *
 * ⚠ ‏T5 **לא קנתה אף החלטה** בשני הסטים (‏50 קבלות-שווא לבדה · 0 תרומה שולית).
 * היא נשארת כי היא מייצרת את המספר ש-`המשך-מכאן.md` דורש לכל מועמד — "כמה
 * מהמתקבלות אינן מילה כלל" — ולא כי היא משפרת את השער. זה מדווח ולא מוסתר.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐⛔ **הלקח המרכזי של הקובץ הזה · והוא על בניית סטים, לא על עדשות**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **סט כיול יכול להפעיל רק את מחלקות הכשל שהמחולל שלו מייצר.**
 * עדשה ששאלתה **אינה מוגדרת** על קלט שהמחולל לעולם אינו מייצר — תיראה מושלמת.
 *
 * מה שקרה כאן, בדיוק:
 *
 *   ‏40 שורות הכיול העברי נוצרו כולן על ידי **מחולל מוטציות מורפולוגיות**.
 *   לכן בכל שורה בסט, ההבדל בין `written` ל-`typed` היה ניסיון הטיה — ולכן
 *   השאלה של `T4` ("האם Y היא צורה של X") הייתה **תמיד מוגדרת**. ‏T4 יצאה
 *   ‏95.3% ואפס קבלות-שווא, ונרשמה כ"העדשה שעושה את העבודה".
 *
 *   ואז הגיע סט אנגלי שנבנה ממחולל **אחר** — שגיאות הקלדה ונרדפות. שם אותה
 *   שאלה **אינה מוגדרת**: `abacus`→`abavus` אינו ניסיון הטיה, ו-`ל` שמחזירה
 *   עליו T4 אינו תשובה אלא **רעש**. התוצאה: ‏19 דחיות-שווא מתוך 19 החטאות.
 *   ‏100% מהכשל באנגלית מקורו בעדשה אחת שנמדדה כמצוינת בעברית.
 *
 * ⭐ **הכלל הנגזר · לכל סט כיול עתידי בפרויקט הזה:**
 *   ‏1. שאל **מי ייצר את השורות**, ומה מחלקות הכשל שהמחולל הזה **אינו** מסוגל
 *      לייצר. הרשימה השנייה היא הגבול האמיתי של המדידה, והיא לא מופיעה באף
 *      טבלת תוצאות.
 *   ‏2. ציון גבוה של רכיב על סט חד-מחוללי אינו עדות לאיכות הרכיב — הוא עדות
 *      להתאמה בין הרכיב למחולל.
 *   ‏3. לפני שסומכים על רכיב, בדוק אותו על סט **ממחולל אחר**. זה מה שחשף את
 *      T4, וזה מה שחשף גם את חור התשובה-החופשית (‏`neg24`) ואת הטאוטולוגיה
 *      (‏`NN16`) — שלושה כשלים, שלושה מחוללים שונים, אף אחד מהם לא נראה
 *      בסט שקדם לו.
 *
 * ⚠ זהו מקרה פרטי של הכלל הוותיק בפרויקט — "אפס התנגשויות אינו אפס נזק" —
 * בלבוש של אוכלוסיית בדיקה: **אפס שגיאות על אוכלוסייה חסרה אינו אפס שגיאות.**
 *
 * ===== חוק ההכרעה · נקבע מראש =====
 *
 *   accept  ⟺ כל העדשות ה**חלות** אמרו `כ`   (ולפחות שלוש חלות ונשפטו)
 *   reject  ⟺ ולו עדשה חלה אחת אמרה `ל`
 *   unsure  ⟺ כל השאר (`?` כלשהו · פסק חסר)
 *
 * ⛔ **רק `accept` הוא קבלה.** `unsure` נחשב דחייה בכל שימוש במורד הזרם. הסיבה
 * שהוא בכל זאת ערך נפרד ולא מקופל ל-reject: המאמן של התלמיד צריך לדעת את ההבדל
 * בין "המורה אמר לא" לבין "המורה לא ידע" · לאמן על השני כשלילי זה ללמד רעש.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TDIR = path.join(OUT, 'teacher');
const BATCH = path.join(TDIR, 'batch');
const VERD = path.join(TDIR, 'verdict');

const argv = process.argv.slice(2);
const say = s => process.stdout.write(s + '\n');
const has = f => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const num = (f, d) => { const v = arg(f, null); return v === null ? d : Number(v); };

/* ===================== 1 · הפריט והמפתח ===================== */

const LABELS = ['כ', 'ל', '?'];

/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐ **הכרעת חגי · 16.8.2026 · שם-פעולה מול פועל · תלוי כיוון**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   כיוון `word`  · הלומד מקליד את **המילה עצמה**  ⇒ ⛔ **לדחות**
 *                   צריך את הצורה המדויקת · זה בדיוק מה שנבחן במסך הזה.
 *   כיוון `gloss` · הלומד מקליד את **הפירוש**      ⇒ ✅ **לקבל**
 *                   שם הוא ממילא מנסח בלשונו, והצורה אינה הנשאלת.
 *
 * הנימוק שהוצג לו והוא בחר בו: **המסך שואל שתי שאלות שונות**, ולכן חוק אחיד
 * היה טועה באחת מהן בהכרח.
 *
 * מה שההכרעה סוגרת · המחלקה שחזרה בשתי השפות:
 *   אנגלית · `E38/E39/E40` · `להחליט`→`החלטה` · `להרוס`→`הרס` · `להגיע`→`הגעה`
 *   עברית  · `M1116.1676` (טיפש→טיפשות) · `M145.228` (חסר→חוסר) · ועוד שתיים
 *
 * ⚠ **היסטוריה · אל תחזיר אותה.** עד ההכרעה `--calib` הדפיס **שני** ניקודים
 * זה לצד זה (‏"?"=ל ו-"?"=כ) כי לא היה מותר להכריע. עכשיו יש הכרעה, ושני
 * מספרים היו הופכים לרעש שמטעה את הסוכן הבא. מודפס ניקוד **אחד**.
 * הניקוד השני נשמר בהיסטוריית הגיט ובהערה הזאת בלבד.
 *
 * ⚠⚠ **הנעילה קדמה להכרעה.** ‏`teacher.js` ננעל בקומיט `95c4448` **לפני**
 * שחגי הכריע, ולכן החוק שהמורה ננעל עליו **אינו כולל** את ההכרעה הזאת.
 * לסט `en-blind2` יש מזה משמעות ישירה — ראה `EN2_CAVEAT` למטה.
 */
const RULING_Q = it => (it.direction === 'gloss' ? 'כ' : 'ל');

/* ⛔ **הסייג על הסט החוץ-מדגמי · לא לבלוע אותו.**
 * ‏`en-blind2` נדגם אחרי הנעילה כדי לבחון חוק שננעל לפניו. ההכרעה של חגי
 * נכנסה **אחרי** הנעילה וגם אחרי הדגימה. לכן:
 *   · אם התוצאה על `en-blind2` **אינה** מושפעת מההכרעה — הוא נשאר בדיקה
 *     חוץ-מדגמית נקייה של החוק הנעול.
 *   · אם היא **כן** מושפעת (יש בו שורות מהמחלקה הזאת) — הוא בוחן חוק
 *     שנערך אחרי שננעל, ומעמדו כבדיקה חוץ-מדגמית **נחלש**. זה צריך להיאמר
 *     במפורש בדוח, לא להיבלע.
 * המדידה עצמה תיעשה רק אחרי שיחזרו התיוגים. */
const EN2_CAVEAT = 'הנעילה 95c4448 קדמה להכרעת 16.8 · ראה RULING_Q';

/* הקנוניזציה היא **חלק מהחוזה**. שינוי כאן מבטל את כל הפנקס, ולכן היא מינימלית:
   רווחים מנורמלים, קצוות נחתכים. אין הסרת ניקוד ואין נרמול אותיות סופיות —
   אלה שינויי משמעות פוטנציאליים והמורה צריך לראות בדיוק את מה שהאפליקציה ראתה. */
const canon = s => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

function itemOf(o) {
  const it = {
    lang: canon(o.lang || 'he'),
    direction: canon(o.direction || 'gloss'),
    term: canon(o.term),
    gloss: canon(o.gloss),
    written: canon(o.written || o.gloss),
    typed: canon(o.typed),
  };
  if (it.lang !== 'he' && it.lang !== 'en') throw new Error(`itemOf: lang must be he|en, got "${it.lang}"`);
  if (it.direction !== 'gloss' && it.direction !== 'word') throw new Error(`itemOf: direction must be gloss|word, got "${it.direction}"`);
  if (!it.term || !it.typed) throw new Error('itemOf: term ו-typed חובה · ' + JSON.stringify(o));
  it.h = crypto.createHash('sha256')
    .update([it.lang, it.direction, it.term, it.gloss, it.written, it.typed].join(''), 'utf8')
    .digest('hex');
  it.k = it.h.slice(0, 12);            /* מפתח האצווה · 48 ביט · התנגשות נבדקת ב-emit */
  return it;
}

/* ===================== 2 · העדשות ===================== */

const LENSES = [
  { id: 'T2', he: 'דיוק', short: 'האם יש במה שנכתב מילה שגויה' },
  { id: 'T3', he: 'הגדרה', short: 'קרא רק את התשובה — לאיזו מילה היא מובילה' },
  { id: 'T4', he: 'דקדוק', short: 'חלק הדיבר של המילה שהשתנתה' },
  { id: 'T5', he: 'מילה', short: 'האם כל מה שנכתב הוא מילה קיימת בעברית' },
];
const LENS_IDS = LENSES.map(l => l.id);

/* ⛔⛔ עדשות שפרשו · הפסקים שלהן נשארים בפנקס בכוונה.
 *
 * ═══ הדפוס · לא מקרה. נמצא **פעמיים**, בשני סבבים, בשני קבצים ═══
 *
 *   סבב קודם · `semantic_panel.js` · עדשה `L1` = *"האם לומד שכתב את זה ידע את
 *   המילה?"* — העדשה ה"אינטואיטיבית", זו שנשמעת הכי נכונה. הפאנל שהיא ישבה בו
 *   הסכים פה-אחד ב-**51.9%** בלבד.
 *
 *   סבב זה · `teacher.js` · עדשה `T1` = **אותה שאלה בדיוק**, נוסחה מחדש בתום לב
 *   בלי לדעת שהיא כבר נוסתה. התוצאה: **46.9% דיוק · 33 קבלות-שווא מתוך 33
 *   אפשריות** — כלומר היא אמרה `כ` לכל דחייה בסט. חותמת גומי מושלמת.
 *
 * ⭐ **המסקנה שצריכה לשרוד את הקובץ הזה:** השאלה "האם הלומד ידע את המילה" היא
 * המטרה שאנחנו מודדים — ו**אסור לשאול אותה ישירות את השופט**. שופט שנשאל את
 * שאלת המטרה במלוא עמימותה מחזיר `כ`. מה שעובד הוא לפרק אותה לשאלות שאפשר
 * לענות עליהן אמין (`T4` דקדוק · 95.3% · אפס קבלות-שווא), ולהרכיב את התשובה
 * מהן. מי שיציע בסבב הבא "בוא פשוט נשאל את המודל אם הלומד ידע" — זה נוסה
 * פעמיים ונכשל פעמיים, וזה כתוב כאן בדיוק בשביל הרגע ההוא.
 *
 * מוחקים את הפסקים? לא. פסק של עדשה שנכשלה הוא **עדות**, והוא מה שמונע את
 * ההצעה השלישית. הוא נקרא מהפנקס, מדווח, ואינו משתתף בהכרעה. */
const RETIRED = [
  { id: 'T1', he: 'לומד', why: '46.9% דיוק · 33/33 קבלות-שווא · חותמת גומי' },
];
const ALL_IDS = LENS_IDS.concat(RETIRED.map(r => r.id));

const words = s => canon(s).split(' ').filter(Boolean);

/* ⭐ מתי T4 חלה · בדיוק כשהשתנתה מילה אחת ואפשר להצביע עליה.
   כשהתשובה חופשית (נרדפות · תשובה חלקית) אין "מילה שהשתנתה", והשאלה הדקדוקית
   פשוט לא קיימת. אז היא **אינה חלה** — לא "חסרה" ולא "?" — וחוק ההכרעה מדלג
   עליה. זה ההבדל בין עדשה שלא נשאלה לבין עדשה שלא ידעה. */
function wordDiff(it) {
  const a = words(it.written), b = words(it.typed);
  if (a.length !== b.length) return null;
  let at = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (at >= 0) return null; at = i; }
  return at < 0 ? null : { from: a[at], to: b[at], at };
}
/* ⛔⛔ **התנאי שהיה שגוי, ועלה 19 דחיות-שווא מתוך 19 החטאות באנגלית.**
 *
 * ‏T4 שואלת *"האם Y היא צורה נטויה של X"*. השאלה הזאת **מניחה ש-Y יוצרה כהטיה**.
 * כשההבדל הוא רעש מקלדת (`abacus`→`abavus`) או מילה אחרת לגמרי (`עצומ`→`ענק`),
 * השאלה אינה מוגדרת — והתשובה `ל` שהיא מחזירה **אינה אומרת דבר** על השאלה
 * "האם הלומד ידע". בעברית זה לא התגלה כי סט הכיול היה כולו מוטציות מורפולוגיות
 * מעצם בנייתו, ולכן השאלה תמיד הייתה מוגדרת. באנגלית היא נשאלה על 38 שורות
 * ורק על 6 מהן הייתה מוגדרת.
 *
 * התיקון: באנגלית T4 חלה **רק כשההבדל הוא הדבקת סיומת תקנית** — כלומר רק
 * כשמישהו באמת ניסה להטות. זה ניתן לזיהוי מבני, בלי לקסיקון. בעברית אי אפשר
 * לזהות את זה בלי לקסיקון (‏AGPL · אסור), ולכן שם התנאי נשאר כשהיה. */
const EN_SUFFIX = ['s', 'es', 'ed', 'd', 'ing'];
function isMorphPair(a, b) {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (EN_SUFFIX.some(x => l === s + x)) return true;
  if (/e$/.test(s) && l === s.slice(0, -1) + 'ing') return true;
  if (/[^aeiou]y$/.test(s) && (l === s.slice(0, -1) + 'ies' || l === s.slice(0, -1) + 'ied')) return true;
  return false;
}
const lc = s => String(s).toLowerCase().trim();

function appliesTo(lens, it) {
  if (lens !== 'T4') return true;
  if (!wordDiff(it)) return false;
  if (it.lang !== 'en') return true;
  const d = wordDiff(it);
  return isMorphPair(lc(d.from), lc(d.to));
}
const applicable = it => LENS_IDS.filter(l => appliesTo(l, it));

/* ===================== 3 · חוק ההכרעה ===================== */

/* ⭐⛔ **כיוון `word` אינו אותה שאלה, ולכן אינו אותו חוק.**
 *
 * חוק פה-אחד מניח שכל עדשה היא **עדות בעד קבלה** — `כ` מכולן ⇒ accept. ההנחה
 * הזאת נכונה בכיוון `gloss`, ו**שקרית בכיוון `word`**: שם T5 ("האם זו מילה")
 * מצביעה **הפוך**. מחרוזת שאינה מילה היא שגיאת הקלדה ⇒ הלומד ידע. מחרוזת
 * שכן מילה היא מילה **אחרת** ⇒ הלומד לא ידע. זה נמדד:
 *
 *   כיוון word · 24 שורות · פילוח לפי "האם התוצאה מילה"
 *     אינה מילה → אמת `כ` 12 · אמת `ל` 2
 *     כן מילה   → אמת `כ`  4 · אמת `ל` 6
 *
 * שלושת הענפים למטה הם **מבנה, לא מקדמים**: תשובה בכיוון `word` נכשלת רק אם
 * היא מציינת מילה אחרת, או אם היא צורה שאינה קיימת.
 *
 * ⚠⚠ **ההתאמה כאן היא בתוך-מדגם ולא אומתה מחוצה לו.** מבנה החוק נגזר תוך
 * הסתכלות על אותן 24 שורות שהוא מנוקד עליהן, והוא מגיע שם ל-24/24. **אין
 * להסיק מזה הכללה.** נדרש סט אנגלי שני, שנבנה ותויג בלי לראות את החוק הזה,
 * לפני שמאמנים עליו משהו. זה כתוב כאן ולא בדוח כי הדוח נזרק והקוד נשאר. */
/* ⭐ אכיפת הכרעת חגי בכיוון `word` · שם-פעולה נדחה.
 *
 * גזירה **נומינלית** (פועל→שם פעולה) מזוהה מבנית: גזע משותף באורך ≥4 ואחד
 * הצדדים נושא סיומת שם-פעולה שהשני אינו נושא. `decide`→`decision` ·
 * `arrive`→`arrival` · `destroy`→`destruction`.
 *
 * ⚠ **זה עובד באנגלית בלבד.** בעברית שם-פעולה נגזר בתבנית ולא בסיומת
 * (`להסית`→`הסתה`), וזיהוי שלו דורש לקסיקון — שאסור כאן משפטית (‏AGPL ·
 * `המשך-מכאן.md §1`). לכן בעברית ההכרעה נאכפת ב**ניקוד** (`RULING_Q`) ולא
 * בהתנהגות, ואין למורה דרך מבנית לקבל את המחלקה הזאת בכיוון `word` העברי.
 * ‏⚠ אין היום אף פריט כיול בכיוון `word` בעברית, ולכן זה גם לא נמדד. */
const EN_NOMINAL = ['ation', 'ition', 'tion', 'sion', 'ment', 'ance', 'ence', 'ure', 'al', 'age', 'ity', 'ness'];
function isNominalization(a, b) {
  const x = lc(a), y = lc(b);
  if (x === y) return false;
  const stem = (() => { let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++; return i; })();
  if (stem < 4) return false;
  /* ⛔ הבדיקה היא על **הזנב שנבדל**, לא על המילה השלמה.
     הבאג שה-selftest תפס: `bandage` **מסתיימת** ב-`age` במקרה, ולכן בדיקה על
     המילה השלמה סיווגה את `bandage`→`bandages` — ריבוי רגיל — כגזירה נומינלית,
     ובכיוון `word` זה היה הופך קבלה נכונה לדחייה. מה שקובע הוא מה **נוסף**. */
  const nomTail = s => s.length > 0 && EN_NOMINAL.some(suf => s === suf || s.endsWith(suf));
  return nomTail(x.slice(stem)) !== nomTail(y.slice(stem));
}



/* ⛔ **וטו הטאוטולוגיה · תשובה שחוזרת על המונח עצמה אינה עדות לידיעה.**
 *
 * נמצא ב-`NN16`: הכרטיס `בֵּין הַעַרְבַּיִם`, והלומד הקליד «בין ערביים». שלוש
 * עדשות אמרו `כ` **ובצדק לפי השאלה שלהן** — אין שם מילה שגויה (T2), הטקסט אכן
 * מצביע על המונח (T3), וכולן מילים עבריות (T5). ובכל זאת התשובה ריקה: היא
 * מגדירה את המונח בעצמו.
 *
 * ⭐ ההצדקה אינה סטטיסטית אלא **הגדרתית**: המשימה היא "האם הלומד ידע את
 * המשמעות", וחזרה על המונח אינה משמעות. לכן זה וטו בקוד ולא עדשה — הוא דטרמיניסטי,
 * חינם, ואינו דורש שופט.
 * ⚠ נמצא על **שורה אחת**. ההיגיון עומד בפני עצמו, אבל התועלת בפועל לא נמדדה.
 * ⚠ חל על כיוון `gloss` בלבד · בכיוון `word` התשובה **אמורה** להיות המונח. */
/* ⚠ הנרמול כאן חייב לגשר על **שני** הבדלים שאינם משמעות, ובגרסה הראשונה הוא
   גישר רק על אחד ולכן ירה על אפס שורות — כולל על NN16 עצמה, השורה שהולידה אותו:
   ‏(א) המונח בכרטיס **מנוקד** (`בֵּין הַעַרְבַּיִם`) והתשובה אינה;
   ‏(ב) התשובה עברה נרמול אותיות סופיות (`ערביימ`) והמונח לא.
   שער שיורה על אפס שורות תמיד "עובר", וזה בדיוק הכשל שהפרויקט תיעד שלוש פעמים. */
const bare = s => String(s)
  .replace(/[֑-ׇ]/g, '')                 /* ניקוד וטעמים */
  .replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ך/g, 'כ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
  .toLowerCase();
/* ⚠ ההשוואה היא על **שלד עיצורי** ולא על האותיות עצמן, כי המונח בכרטיס מנוקד
   וכתוב חסר (`הַעַרְבַּיִם`, יו"ד אחת) והתשובה אינה מנוקדת וכתובה מלא (`ערביימ`,
   שתי יו"דים). השוואת אותיות פשוטה מחמיצה בדיוק את השורה שהולידה את הכלל.
   ⚠ שלד עיצורי הוא השוואה **אגרסיבית** — הוא משווה `שן`/`שנה`/`ישן`. כאן הוא
   בטוח כי הוא מושווה מול **המונח של אותו כרטיס בלבד** ולא מול המאגר. נמדד:
   יורה על 1 שורה מתוך 152 בארבעת הסטים, ‏0 דחיות-שווא חדשות. */
const skelHe = w => bare(w).replace(/^ה(?=.{2,})/, '').replace(/[אוהי]/g, '');
function isTautology(it) {
  if (it.direction !== 'gloss') return false;
  const norm = s => bare(s).split(/[\s,;·()\/]+/).filter(Boolean).map(skelHe).filter(Boolean).sort().join(' ');
  const t = norm(it.term), y = norm(it.typed);
  return !!t && t === y;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⛔ **ביטול העקיפה · `decideWordDir` הוסרה · 16.8.2026**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * כאן עמדה שורה אחת שעקפה את הפאנל כולו בכיוון `word`:
 *
 *     if (it.lang === 'en' && it.direction === 'word') return decideWordDir(it, v);
 *
 * ‏`decideWordDir` הכריעה לפי `T5` לבדה בשני ענפים — `אינה מילה ⇒ accept`
 * ו-`ניסיון הטיה ⇒ T5 מכריעה`. **שניהם אותו שורש בשני סימנים:** הם התייחסו
 * ל-`isRealWord` כאל עדות דו-כיוונית, והיא אינה כזאת באף כיוון.
 *
 * מה שהפיל אותה · `en-blind2`, סט חוץ-מדגמי שנבנה במיוחד לבחון אותה:
 *
 *   | | דיוק | קבלות-שווא |
 *   |---|---|---|
 *   | ‏`decideWordDir` | 72.5% | **3** |
 *   | ‏T3 לבדה         | **100%** | **0** |
 *
 * ⭐ ובשלוש קבלות-השווא (`X20` `X21` `X27`) **כל שלוש העדשות אמרו `ל`**,
 * והענף `if (notWord) return 'accept'` החזיר accept **בלי להתייעץ באף אחת מהן**.
 * זה לא קיצור דרך — זו עקיפה של המנגנון. הפאנל ידע; החוק זרק את הידע.
 *
 * ⚠ **מה שנשאר, ולמה:** הכרעת חגי (שם-פעולה בכיוון `word` נדחה) **אינה** חלק
 * מהעקיפה — היא החלטת מוצר שלו, והיא **וטו בלבד**: היא יכולה רק לדחות, לעולם
 * לא לקבל. לכן היא עברה לכאן, לצד וטו הטאוטולוגיה, ואינה עוקפת את הפאנל.
 *
 * ⛔ **ולא כוונן שום דבר מעבר לזה.** לא נבחרו עדשות, לא נוסף תנאי מרחק, ולא
 * תוקן `isNominalization` — למרות ש**ידוע** שהוא יורה שקרית על `X32`
 * (`advantage`→`advantwge`). תיקון שנעשה על סמך סט שכבר נראה הופך אותו
 * לבתוך-מדגם. הבאג מתועד וממתין לסט השלישי.
 */
function decide(it, v) {
  if (!v) return 'unsure';
  if (isTautology(it)) return 'reject';
  /* הכרעת חגי 16.8 · כיוון `word` דורש את הצורה המדויקת · **וטו, לא ענף קבלה** */
  if (it.direction === 'word' && isNominalization(it.term, it.typed)) return 'reject';
  const app = applicable(it);
  const got = app.filter(l => v[l]);
  if (app.some(l => v[l] === 'ל')) return 'reject';
  if (got.length < 3) return 'unsure';                       /* היעדר פסק אינו קבלה */
  if (got.length !== app.length) return 'unsure';
  return app.every(l => v[l] === 'כ') ? 'accept' : 'unsure';
}
/* לצורך מדידת המחיר של דרישת פה-אחד · לא בשימוש בהחלטה */
function majority(it, v) {
  const app = applicable(it).filter(l => v && v[l]);
  if (app.length < 3) return 'unsure';
  const yes = app.filter(l => v[l] === 'כ').length;
  return yes * 2 > app.length ? 'accept' : 'reject';
}

/* ===================== 4 · הפנקס ===================== */

const ledgerPath = set => path.join(TDIR, `ledger.${set}.jsonl`);

function loadLedger(set) {
  const p = ledgerPath(set);
  const m = new Map();                                        /* h → { T1:{v,why}, ... } */
  if (!fs.existsSync(p)) return m;
  const txt = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  let n = 0;
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    n++;
    let r;
    try { r = JSON.parse(line); } catch (e) { throw new Error(`פנקס פגום · ${path.basename(p)} שורה ${n} · ${e.message}`); }
    if (!r.h || !ALL_IDS.includes(r.lens) || !LABELS.includes(r.v)) throw new Error(`פנקס פגום · ${path.basename(p)} שורה ${n} · ${line.slice(0, 120)}`);
    if (!m.has(r.h)) m.set(r.h, {});
    const cur = m.get(r.h);
    /* ⛔ פסק סותר על אותו מפתח **זורק**. זה הבאג שהפיל את הפאנל הקודם: דריסה
       שקטה שינתה recall פי שלושה לפי סדר הקבצים בתיקייה. */
    if (cur[r.lens] !== undefined && cur[r.lens] !== r.v) {
      throw new Error(`פסק כפול וסותר · ${r.h.slice(0, 12)} ${r.lens} · "${cur[r.lens]}" מול "${r.v}" · הפנקס אינו קובע לבד מי צודק`);
    }
    cur[r.lens] = r.v;
    if (r.why) (cur.why || (cur.why = {}))[r.lens] = r.why;
  }
  return m;
}

function appendLedger(set, rows) {
  fs.mkdirSync(TDIR, { recursive: true });
  fs.appendFileSync(ledgerPath(set), rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

/* ===================== 5 · הסטים ===================== */

const setPath = set => path.join(TDIR, `${set}.jsonl`);

function loadSet(set) {
  const p = setPath(set);
  if (!fs.existsSync(p)) throw new Error(`חסר ${path.relative(ROOT, p)} · הרץ קודם  node typo-lab/teacher.js --build-calib`);
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map(l => itemOf(JSON.parse(l)));
}

/* ---- בניית סט הכיול · שני המקורות, נגזרים מהקובץ ולא מועתקים ביד ---- */

/* מקור א · 40 התיוגים העיוורים.
   ⚠ **תויגו על ידי הסשן הראשי, לא על ידי חגי.** חגי מעולם לא תייג אותם. זה עדיין
   ground truth תקף — הוא נקבע **לפני** שהשופטים רצו ובלי לראות את הפסקים — אבל
   לקרוא לו "חגי" מנפח את מעמדו, וזה תוקן בכל מקום בקובץ.
   ⚠ הטקסט בעמודות "מה כתוב במאגר"/"מה הלומד כתב" עבר את הנרמול של האפליקציה,
   ולכן אותיות סופיות מופיעות כרגילות (`חיידקימ`, `דברימ`, `ככ`). זה **אינו**
   שגיאת כתיב של הלומד וחייב להיאמר לשופט, אחרת הוא פוסל את כל 40 השורות. */
function buildFromBlind() {
  const p = path.join(OUT, 'semantic-blind.tsv');
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1);
  return lines.map(l => {
    const c = l.split('\t');
    return { src: 'blind40', id: c[0], lang: 'he', direction: 'gloss', term: c[1], gloss: c[2], written: c[3], typed: c[4] };
  });
}

/* מקור ב · 24 המקרים האמיתיים שחגי צילם ממשתמשים.
   נגזרים מהטבלה ב-`דוחות/מדידת-כלל-מורפולוגי.md`. עמודות "תופס" ו"קטגוריה"
   **אינן** נכנסות לפריט: שופט שרואה "נרדפות" מדרג את התווית ולא את התשובה. */
function buildFromReal24() {
  const p = path.join(ROOT, 'דוחות', 'מדידת-כלל-מורפולוגי.md');
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const c = line.split('|').slice(1, -1).map(x => x.trim());
    if (c.length < 6 || !/^\d+$/.test(c[0])) continue;
    out.push({
      src: 'real24', id: 'R' + c[0], lang: 'he', direction: 'gloss',
      term: c[1], gloss: c[2], written: c[2], typed: c[3],
      _cat: c[5],                    /* לדיווח מקומי בלבד · לעולם לא נשלח לשופט */
    });
  }
  return out;
}

function buildCalib() {
  const a = buildFromBlind(), b = buildFromReal24();
  if (a.length !== 40) throw new Error(`סט עיוור · ציפיתי 40 שורות, קיבלתי ${a.length}`);
  if (b.length !== 24) throw new Error(`מקרים אמיתיים · ציפיתי 24 שורות, קיבלתי ${b.length}`);
  fs.mkdirSync(TDIR, { recursive: true });
  const all = a.concat(b);
  fs.writeFileSync(setPath('calib'), all.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  const items = all.map(itemOf);
  const t4 = items.filter(i => wordDiff(i)).length;
  say(`סט הכיול · ${all.length} פריטים (‏${a.length} תיוגים עיוורים + ${b.length} מקרים אמיתיים)`);
  say(`‏T4 (דקדוק) חלה על ${t4} · שינוי מילה אחת · על ${items.length - t4} התשובה חופשית ולכן היא אינה חלה`);
  say(`נכתב · ${path.relative(ROOT, setPath('calib'))}`);
}

/* ---- ⭐ סט הבקרה השלילי · החור שהאבלציה חשפה ----
 *
 * ⛔ הממצא שמחייב את הקובץ הזה: **כל 29 הדחיות בתיוג העיוור יושבות באוכלוסייה אחת** —
 * שינוי מילה אחת. באוכלוסיית התשובה החופשית (נרדפות · תשובה חלקית) יש 21 פריטים
 * ו-**אפס שליליים**. כלומר "אפס קבלות-שווא" שם אינו הישג אלא **טאוטולוגיה**:
 * אין מה לקבל בטעות. זה בדיוק הדפוס שהפיל שלושה סבבים בפרויקט הזה בצורות אחרות
 * (`אפס התנגשויות אינו אפס נזק`), והפעם הוא לובש צורה של אוכלוסיית בדיקה חסרה.
 *
 * התיקון בלי לדרוש סבב תיוג אנושי נוסף: **אמת מידה במבנה.** לוקחים את התשובה שהוקלדה
 * בכרטיס j ומצמידים אותה לכרטיס i≠j. מי שכתב את זה **לא** ידע את המילה של כרטיס i —
 * זה נכון בהכרח, בלי שיפוט אנושי. ‏24 שליליים ודאיים באוכלוסייה שלא היו בה.
 *
 * ההיסט קבוע (‏+7) כדי שהסט יהיה דטרמיניסטי. ‏7 ו-24 זרים, ולכן ההיסט הוא מחזור
 * יחיד ואף כרטיס אינו מקבל את התשובה של עצמו. */
const NEG_SHIFT = 7;

function buildNeg() {
  const base = buildFromReal24();
  const n = base.length;
  if (n !== 24) throw new Error(`מקרים אמיתיים · ציפיתי 24, קיבלתי ${n}`);
  const out = base.map((r, i) => {
    const donor = base[(i + NEG_SHIFT) % n];
    if (donor.id === r.id) throw new Error('היסט שלילי החזיר את הכרטיס לעצמו');
    return {
      src: 'neg24', id: `N${r.id.slice(1)}<${donor.id.slice(1)}`, lang: 'he', direction: 'gloss',
      term: r.term, gloss: r.gloss, written: r.gloss, typed: donor.typed,
      _cat: 'בקרה שלילית · תשובה של כרטיס אחר',
    };
  });
  fs.mkdirSync(TDIR, { recursive: true });
  fs.writeFileSync(setPath('neg24'), out.map(x => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  const t4 = out.map(itemOf).filter(wordDiff).length;
  say(`סט הבקרה השלילי · ${out.length} פריטים · היסט +${NEG_SHIFT} · אמת המידה: כולם **ל** במבנה`);
  say(`‏T4 חלה על ${t4} מהם · השאר תשובה חופשית — וזו בדיוק האוכלוסייה שהייתה בלי שליליים`);
  say(`⚠ אלה שליליים **רחוקים** (תשובה של כרטיס אחר לגמרי). שלילי **קרוב** — נרדפת של`);
  say(`  מילה שכנה — קשה יותר, ואין לו מקור בסט הזה. קבלת-שווא כאן היא כשל חמור;`);
  say(`  אפס קבלות-שווא כאן **אינו** מוכיח עמידה בשלילי קרוב.`);
  say(`נכתב · ${path.relative(ROOT, setPath('neg24'))}`);
}

/* ---- הסטים העיוורים שממתינים לתיוג · נכרו ב-calib_mine.js ----
 *
 * שניהם סוגרים פערים שהדוח הקודם **הצהיר עליהם** ולא כיסה:
 *   `nearneg24` · שלילי **קרוב** בעברית — נרדפת של מילה שכנה, מילת-על, אותו
 *                 שדה. זו האוכלוסייה שבה קבלת-שווא הכי מסוכנת כי היא נשמעת
 *                 נכון. הבקרה המבנית (`neg24`) כיסתה רק שליליים **רחוקים**.
 *   `en40`     · אנגלית, שני הכיוונים. למורה היה **אפס כיול אנגלי**, וזה
 *                בדיוק החלק שחגי ביקש לשפר (`en-word` 69.09%).
 *
 * ⚠ לשניהם **אין עדיין אמת מידה.** `--calib` לא ינקד אותם עד שתגיע עמודת
 * תווית מלאה. הם נשפטים עכשיו כדי שהפסקים יהיו בפנקס ולא נשלם עליהם פעמיים. */
/* התוויות חוזרות בקובץ **נפרד** (`*.labeled.tsv` · id · תווית · הערה) ולא
   בעמודה האחרונה של הקובץ שנשלח — אותו דפוס כמו `semantic-blind`. הקורא לא
   מניח עמודה קבועה: התווית היא העמודה הראשונה אחרי המזהה שהיא כ/ל/?. */
function loadLabels(base) {
  const p = path.join(OUT, base + '.labeled.tsv');
  const m = new Map(), note = new Map();
  if (!fs.existsSync(p)) return { m, note };
  for (const l of fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1)) {
    const c = l.split('\t');
    const lab = c.slice(1).map(x => (x || '').trim()).find(x => LABELS.includes(x));
    if (lab) { m.set(c[0], lab); note.set(c[0], (c[c.length - 1] || '').trim()); }
  }
  return { m, note };
}

function loadBlindTsv(file, hasDir) {
  const p = path.join(OUT, file);
  if (!fs.existsSync(p)) throw new Error(`חסר ${file} · הרץ  node typo-lab/calib_mine.js`);
  const base = file.replace(/\.tsv$/, '');
  const { m: lab, note } = loadLabels(base);
  /* ⚠ שורות `#` הן **פרובננס ולא נתונים** — `en-blind2.tsv` נושא בראשו את hash
     הנעילה. סינון לפני ה-`slice(1)`, אחרת שורת ההערה נבלעת ככותרת ושורת
     הכותרת האמיתית נקראת כנתון. זה שינוי ב**קורא** בלבד · אינו נוגע ב-`decide()`. */
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#')).slice(1);
  return lines.map(l => {
    const c = l.split('\t');
    const o = hasDir
      ? { id: c[0], direction: c[1] === 'word' ? 'word' : 'gloss', term: c[2], gloss: c[3], written: c[4], typed: c[5], label: (c[6] || '').trim() }
      : { id: c[0], direction: 'gloss', term: c[1], gloss: c[2], written: c[3], typed: c[4], label: (c[5] || '').trim() };
    if (!o.label && lab.has(o.id)) { o.label = lab.get(o.id); o.note = note.get(o.id) || ''; }
    return Object.assign(o, { src: file.replace('-blind.tsv', ''), lang: hasDir ? 'en' : 'he' });
  });
}
const BLIND_SETS = {
  nearneg24: () => loadBlindTsv('near-neg-blind.tsv', false),
  en40: () => loadBlindTsv('en-blind.tsv', true),
  en2: () => loadBlindTsv('en-blind2.tsv', true),
};

function buildBlind(name) {
  const rows = BLIND_SETS[name]();
  fs.mkdirSync(TDIR, { recursive: true });
  fs.writeFileSync(setPath(name), rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  const items = rows.map(itemOf);
  const labelled = rows.filter(r => LABELS.includes(r.label)).length;
  say(`סט ${name} · ${rows.length} פריטים · T4 חלה על ${items.filter(wordDiff).length}`);
  const dirs = {}; for (const r of rows) dirs[r.direction] = (dirs[r.direction] || 0) + 1;
  say(`כיוונים · ${Object.entries(dirs).map(([k, v]) => k + '=' + v).join(' · ')}`);
  say(labelled ? `✅ ${labelled}/${rows.length} מתויגים · אפשר לנקד` : `⚠ **אין תיוגים** · הסט נשפט אבל לא ינוקד עד שתגיע עמודת התווית`);
  say(`נכתב · ${path.relative(ROOT, setPath(name))}`);
}

/* ---- אמת המידה האנושית ---- */

function humanTruth() {
  const t = new Map(), note = new Map();
  /* 40 · התוויות בקובץ נפרד. העמודה הראשונה היא המזהה, התווית היא הראשונה
     אחריה שהיא כ/ל/? · קורא שמניח עמודה קבועה החזיר פעם "אין תיוגים" על קובץ מלא. */
  const bp = path.join(OUT, 'semantic-blind.labeled.tsv');
  for (const l of fs.readFileSync(bp, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1)) {
    const c = l.split('\t');
    const lab = c.slice(1).map(x => (x || '').trim()).find(x => LABELS.includes(x));
    if (lab) { t.set(c[0], lab); note.set(c[0], (c[c.length - 1] || '').trim()); }
  }
  /* 24 · "בכל 24 המקרים חגי הבין את המילה" (‏מדידת-כלל-מורפולוגי.md §שלושת המספרים,
     סעיף 3: «כמה "שונה באמת" — הכלל לא צריך לתפוס: 0»). כלומר כולם `כ`. */
  for (const r of buildFromReal24()) { t.set(r.id, 'כ'); note.set(r.id, r._cat); }
  /* 24 בקרה שלילית · `ל` **במבנה** ולא בשיפוט · התשובה שייכת לכרטיס אחר. */
  if (fs.existsSync(setPath('neg24'))) {
    for (const l of fs.readFileSync(setPath('neg24'), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const r = JSON.parse(l); t.set(r.id, 'ל'); note.set(r.id, r._cat);
    }
  }
  /* הסטים העיוורים החדשים · התווית נקראת מהקובץ עצמו כשהיא מלאה */
  for (const name of Object.keys(BLIND_SETS)) {
    if (!fs.existsSync(setPath(name))) continue;
    for (const l of fs.readFileSync(setPath(name), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const r = JSON.parse(l);
      if (LABELS.includes(r.label)) { t.set(r.id, r.label); note.set(r.id, ''); }
    }
  }
  return { t, note };
}

/* ===================== 6 · ייצוא אצוות ===================== */

/* ⛔ `dir` הוא עמודה ולא הסקה.
 * הבאג שזה מונע · בסט האנגלי יש **שני כיוונים מעורבבים**: ב-`word` הלומד הקליד
 * מילה אנגלית, ב-`gloss` הוא הקליד פירוש **בעברית** (המאגר האנגלי מוסבר בעברית).
 * בלי העמודה השופט צריך לנחש מהאלפבית של `typed` מה בכלל נשאל ממנו — וזו בדיוק
 * ההסקה השקטה שהופכת פסק לרעש. בעברית הכיוון אחיד ולכן זה לא הורגש. */
const HDR = 'k\tdir\tterm\tgloss\twritten\ttyped';

function tsvRow(it) {
  /* `written` זהה ל-`gloss` בתשובה חופשית · נשלח בכל זאת כדי שהפורמט יהיה קבוע
     ולא ידרוש מהשופט להסיק כמה עמודות יש. */
  return [it.k, it.direction, it.term, it.gloss, it.written, it.typed].join('\t');
}

function emit(set, batchSize) {
  const items = loadSet(set);
  const led = loadLedger(set);
  fs.mkdirSync(BATCH, { recursive: true });
  for (const f of fs.readdirSync(BATCH)) if (f.startsWith(set + '.')) fs.unlinkSync(path.join(BATCH, f));

  const seen = new Map();
  for (const it of items) {
    if (seen.has(it.k) && seen.get(it.k) !== it.h) throw new Error(`התנגשות מפתח אצווה · ${it.k} · הגדל את אורך המפתח`);
    seen.set(it.k, it.h);
  }
  say(`# אצוות · סט ${set} · ${items.length} פריטים`);
  say('');
  say('| עדשה | חלה על | כבר בפנקס | לשליחה | אצוות |');
  say('|---|---|---|---|---|');
  let totalSend = 0;
  for (const L of LENSES) {
    const pool = items.filter(it => appliesTo(L.id, it));
    const todo = pool.filter(it => !(led.get(it.h) || {})[L.id]);
    const n = Math.ceil(todo.length / batchSize);
    for (let b = 0; b < n; b++) {
      const slice = todo.slice(b * batchSize, (b + 1) * batchSize);
      fs.writeFileSync(path.join(BATCH, `${set}.${L.id}.${b + 1}.tsv`),
        [HDR].concat(slice.map(tsvRow)).join('\n') + '\n', 'utf8');
    }
    totalSend += todo.length;
    say(`| ${L.id} · ${L.he} | ${pool.length} | ${pool.length - todo.length} | **${todo.length}** | ${n} |`);
  }
  say('');
  say(`סה"כ ${totalSend} פסקים לשליחה · המטמון חסך ${LENSES.reduce((a, L) => a + items.filter(it => appliesTo(L.id, it)).length, 0) - totalSend}`);
  say(`נכתב ל-${path.relative(ROOT, BATCH)} · הפסקים חוזרים ל-${path.relative(ROOT, VERD)}/<set>.<lens>.<n>.tsv`);
}

/* ===================== 7 · קליטת פסקים · שער קשיח ===================== */

/* ⛔ אין "טקסט חופשי". שורה שאינה `key<TAB>verdict[<TAB>why]` עם תווית מתוך
   {כ,ל,?} ומפתח שנשלח בפועל — **זורקת**. שופט שהחזיר פסקה יפה במקום TSV
   ייתפס כאן ולא ייבלע כ-0 פסקים או, גרוע מזה, כדחיות. */
function ingest(set, { dry = false, quiet = false } = {}) {
  const emit_ = quiet ? () => {} : say;
  const items = loadSet(set);
  const byK = new Map(items.map(it => [it.k, it]));
  const led = loadLedger(set);
  if (!fs.existsSync(VERD)) throw new Error(`אין תיקיית פסקים · ${path.relative(ROOT, VERD)}`);
  const files = fs.readdirSync(VERD).filter(f => new RegExp(`^${set}\\.(T\\d+)\\.\\d+\\.tsv$`).test(f)).sort();
  if (!files.length) throw new Error(`אין קובצי פסק לסט ${set} ב-${path.relative(ROOT, VERD)}`);

  const fresh = [];
  const inRun = new Map();                                   /* k+lens → v · תופס סתירה בתוך אותה קליטה */
  let dup = 0;
  for (const f of files) {
    const lens = /\.(T\d+)\./.exec(f)[1];
    if (!LENS_IDS.includes(lens)) throw new Error(`⛔ ${f} · העדשה ${lens} אינה פעילה · פסק חדש לעדשה שפרשה אינו נקלט`);
    const lines = fs.readFileSync(path.join(VERD, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const c = line.split('\t');
      if (c[0] === 'k' || c[0] === 'key') continue;           /* כותרת */
      if (c.length < 2) throw new Error(`⛔ ${f}:${i + 1} · שורה פגומה (${c.length} עמודות) · «${line.slice(0, 100)}»`);
      const k = c[0].trim(), v = c[1].trim(), why = (c[2] || '').trim();
      if (!LABELS.includes(v)) throw new Error(`⛔ ${f}:${i + 1} · תווית לא חוקית «${v}» · מותר רק כ / ל / ?`);
      const it = byK.get(k);
      if (!it) throw new Error(`⛔ ${f}:${i + 1} · מפתח «${k}» אינו בסט ${set} · השופט המציא שורה או ערבב אצוות`);
      if (!appliesTo(lens, it)) throw new Error(`⛔ ${f}:${i + 1} · ${lens} אינה חלה על ${k} · לא היה אמור להישלח`);
      const ik = k + lens;
      /* ⚠ סדר הבדיקות אינו שרירותי · הפנקס **קודם**. שתי הבדיקות תופסות את אותה
         סתירה, אבל ההודעה של הפנקס אומרת מול מה הסתירה, וזה מה שמאפשר להכריע
         איזה משני הפסקים לבטל. הסדר ההפוך היה מחזיר "כפול בתוך אותה קליטה" גם
         כשהסתירה היא מול פסק ישן — תופס נכון, מדווח מטעה. */
      const old = (led.get(it.h) || {})[lens];
      if (old !== undefined) {
        if (old !== v) throw new Error(`⛔ ${f}:${i + 1} · סותר את הפנקס · ${k} ${lens} · «${old}» מול «${v}»`);
        dup++; continue;
      }
      if (inRun.has(ik)) {
        if (inRun.get(ik) !== v) throw new Error(`⛔ ${f}:${i + 1} · פסק כפול וסותר בתוך אותה קליטה · ${k} ${lens} · «${inRun.get(ik)}» מול «${v}»`);
        dup++; continue;
      }
      inRun.set(ik, v);
      fresh.push({ h: it.h, k, lens, v, why: why.slice(0, 300) });
    }
  }
  /* כיסוי · מה נשלח ולא חזר */
  const missing = [];
  for (const it of items) for (const L of applicable(it)) {
    if (!(led.get(it.h) || {})[L] && !inRun.has(it.k + L)) missing.push(`${it.k}/${L}`);
  }
  emit_(`קליטה · ${files.length} קבצים · ${fresh.length} פסקים חדשים · ${dup} חזרות זהות · ${missing.length} חסרים`);
  if (missing.length) emit_('⚠ חסרים: ' + missing.slice(0, 20).join(' ') + (missing.length > 20 ? ` … (+${missing.length - 20})` : ''));
  if (!dry && fresh.length) appendLedger(set, fresh);
  return { fresh: fresh.length, dup, missing: missing.length };
}

/* ===================== 8 · ה-API ===================== */

/* ‏judge · מחפש בפנקס. אינו קורא לרשת ואינו יכול — המורה הוא תהליך אצווה
   שהאדם/הסוכן מריץ, וזה בדיוק העניין: הפלט הוא נכס דטרמיניסטי שאפשר לבדוק. */
function judge(o, opts = {}) {
  const it = itemOf(o);
  const led = opts.ledger || loadLedger(opts.set || 'calib');
  const v = led.get(it.h);
  const verdict = decide(it, v);
  const app = applicable(it);
  const why = !v
    ? 'אין פסק · הפריט לא נשלח לשופטים'
    : app.map(l => `${l}=${v[l] || '—'}${v.why && v.why[l] ? ` (${v.why[l]})` : ''}`).join(' · ');
  return { verdict, why, key: it.k, hash: it.h, lenses: app, votes: v || null };
}

/* ===================== 9 · הכיול ===================== */

function calib() {
  const items = loadSet('calib');
  const raw = new Map(fs.readFileSync(setPath('calib'), 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => JSON.parse(l)).map(r => [itemOf(r).h, r]));
  const led = loadLedger('calib');
  const { t: human, note } = humanTruth();

  const rows = items.map(it => {
    const r = raw.get(it.h);
    return { it, id: r.id, src: r.src, cat: r._cat || '', human: human.get(r.id), v: led.get(it.h) || {}, };
  });
  const covered = rows.filter(r => applicable(r.it).every(l => r.v[l]));

  say('# כיול המורה');
  say('');
  /* ⚠ מקור אמת המידה מודפס בכל הרצה ולא נשאר בהערה בקוד. הדוח הקודם ייחס את
     40 התיוגים ל**חגי** — הם של הסשן הראשי. הייחוס השגוי לא שינה מספר, אבל
     הוא ניפח את מעמד הסט: תיוג של סוכן ותיוג של בעל המוצר אינם אותה עדות. */
  say('| סט | מקור אמת המידה | תוקף |');
  say('|---|---|---|');
  say('| blind40 | **תיוג עיוור של הסשן הראשי** · לא של חגי | נקבע לפני שהשופטים רצו ⇒ תקף ככיול |');
  say('| real24 | **חגי** · הוא הקליד את התשובות והוא צילם אותן | תשובות אמיתיות של משתמש |');
  say('');
  say(`| סט | פריטים | עם פסק מלא | כ | ל | ? |`);
  say('|---|---|---|---|---|---|');
  for (const s of ['blind40', 'real24']) {
    const g = rows.filter(r => r.src === s);
    const c = covered.filter(r => r.src === s);
    const h = { 'כ': 0, 'ל': 0, '?': 0 };
    for (const r of g) h[r.human]++;
    say(`| ${s} | ${g.length} | ${c.length} | ${h['כ']} | ${h['ל']} | ${h['?']} |`);
  }
  if (!covered.length) { say(''); say('⛔ אין פסקים · המורה אינו עדות עד שיכויל'); process.exitCode = 1; return; }

  /* ⛔ **ניקוד אחד, לא שניים.** עד 16.8 הודפסו כאן שני ניקודים ("?"=ל ו-"?"=כ)
     כי המחלקה הייתה פתוחה ואסור היה להכריע אותה. חגי הכריע (`RULING_Q`), ומאותו
     רגע שני מספרים זה לצד זה אינם זהירות אלא **רעש שמטעה את הסוכן הבא** — הוא
     יצטרך לנחש איזה מהם התקף. הניקוד השני נשמר בהיסטוריית הגיט.
     ⛔ אל תחזיר את הלולאה הכפולה בלי הכרעה חדשה של חגי. */
  let redFA = 0;
  {
    for (const [rn, fn] of [['פה אחד', decide], ['רוב', majority]]) {
      let tp = 0, fp = 0, tn = 0, fnn = 0; const bad = [];
      for (const r of covered) {
        const p = fn(r.it, r.v) === 'accept';
        const lab = r.human === '?' ? RULING_Q(r.it) : r.human;
        const h = lab === 'כ';
        if (p && h) tp++; else if (p && !h) fp++; else if (!p && !h) tn++; else fnn++;
        if (p !== h) bad.push(r);
      }
      const tot = tp + tn + fp + fnn;
      const nq = covered.filter(r => r.human === '?').length;
      say('');
      say(`## חוק **${rn}** · הכרעת חגי 16.8 · ה-"?" בכיוון \`gloss\` = **כ**${nq ? ` (${nq} שורות)` : ''}`);
      say('');
      say('| | אמת המידה: כ | אמת המידה: ל |');
      say('|---|---|---|');
      say(`| המורה מקבל | **${tp}** | **${fp}**${fp ? ' ⛔' : ' ✅'} |`);
      say(`| המורה דוחה | ${fnn} | ${tn} |`);
      say('');
      say(`דיוק ${(100 * (tp + tn) / tot).toFixed(1)}% · precision ${tp + fp ? (100 * tp / (tp + fp)).toFixed(1) + '%' : '—'} · recall ${tp + fnn ? (100 * tp / (tp + fnn)).toFixed(1) + '%' : '—'}`);
      if (rn === 'פה אחד') {
        redFA = fp;
        say('');
        say('### כל אי-ההתאמות · אחת-אחת');
        say('');
        /* העמודות נגזרות מ-LENS_IDS ולא כתובות ביד · טבלה שמקובעת לשמות עדשות
           ממשיכה להציג עדשה שפרשה, ומחביאה עדשה חדשה. זה קרה כאן פעם אחת. */
        say(`| מזהה | מילה | נכתב → הוקלד | אמת המידה | המורה | ${LENS_IDS.join(' | ')} | הערה |`);
        say('|---|---|---|---|---|' + LENS_IDS.map(() => '---|').join('') + '---|');
        for (const r of bad) {
          const d = wordDiff(r.it);
          const mv = d ? `${d.from} → ${d.to}` : `«${r.it.typed}»`;
          const cells = LENS_IDS.map(l => appliesTo(l, r.it) ? (r.v[l] || '·') : '–').join(' | ');
          const lab = r.human === '?' ? `${RULING_Q(r.it)}←?` : r.human;
          say(`| ${r.id} | ${r.it.term} | ${mv} | **${lab}** | ${fn(r.it, r.v)} | ${cells} | ${note.get(r.id) || ''} |`);
        }
        if (!bad.length) say('| — | — | — | — | — |' + LENS_IDS.map(() => ' — |').join('') + ' אין |');
      }
    }
  }

  /* פירוק recall לפי סוג המקרה · 24 המקרים האמיתיים */
  const r24 = covered.filter(r => r.src === 'real24');
  if (r24.length) {
    const g = new Map();
    for (const r of r24) {
      const key = /נרדפות/.test(r.cat) ? 'נרדפות' : /מורפולוגיה/.test(r.cat) ? 'מורפולוגיה'
        : /חלקית/.test(r.cat) ? 'תשובה חלקית' : /עודפת|שגויה/.test(r.cat) ? 'מילה עודפת' : 'אחר';
      if (!g.has(key)) g.set(key, { n: 0, acc: 0, ids: [] });
      const b = g.get(key); b.n++;
      if (decide(r.it, r.v) === 'accept') b.acc++; else b.ids.push(r.id);
    }
    say('');
    say('## ‏recall על 24 המקרים האמיתיים · לפי סוג');
    say('');
    say('| סוג | מקרים | התקבלו | שיעור | מי נדחה |');
    say('|---|---|---|---|---|');
    for (const [k, b] of g) say(`| ${k} | ${b.n} | ${b.acc} | ${(100 * b.acc / b.n).toFixed(0)}% | ${b.ids.join(' ') || '—'} |`);
    say('');
    say('⚠ בסט הכיול **אין אף שורת INF חיובית** (שם פעולה מול שם פועל · `הסתה`/`להסית`).');
    say('זה תועד ב-`מדידת-כלל-מורפולוגי.md §ממצא נלווה` · אין לטעון כיסוי למחלקה הזאת.');
  }

  /* הסכמת כל עדשה בנפרד · זה מה שמבדיל "מורה טוב" מ"מורה שרק מחמיר" */
  say('');
  say('## כל עדשה בנפרד מול אמת המידה · "?" = ל');
  say('');
  say('| עדשה | חלה | מסכימה | דיוק | קבלות-שווא |');
  say('|---|---|---|---|---|');
  for (const L of LENSES) {
    let ok = 0, n = 0, fa = 0;
    for (const r of covered) {
      if (!appliesTo(L.id, r.it) || !r.v[L.id]) continue;
      n++; const p = r.v[L.id] === 'כ', h = r.human === 'כ';
      if (p === h) ok++; if (p && !h) fa++;
    }
    say(`| ${L.id} · ${L.he} | ${n} | ${ok}/${n} | ${n ? (100 * ok / n).toFixed(1) : 0}% | **${fa}** |`);
  }

  say('');
  if (redFA > 0) {
    say(`⛔ **${redFA} קבלות-שווא מול הדחיות בסט הכיול. הרף הוא 0. אין להריץ אצווה גדולה.**`);
    process.exitCode = 1;
  } else {
    say('✅ אפס קבלות-שווא מול הדחיות בסט הכיול.');
  }
}

/* ===================== 9ג · ניקוד כללי · כל סט מתויג =====================
 *
 * ‏`--calib` קשור לסט אחד. זה מנקד **כל** סט שיש לו תוויות, כולל פילוח לפי
 * כיוון ולפי מחלקת התכן, ובדיקת עדשה-בודדת שעונה על השאלה: האם יש כאן תכונה
 * אחת שמכריעה את רוב האוכלוסייה לבדה. */
function scoreSet(name) {
  const items = loadSet(name);
  const raw = new Map(fs.readFileSync(setPath(name), 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => JSON.parse(l)).map(r => [itemOf(r).h, r]));
  const led = loadLedger(name);
  const dp = path.join(OUT, name === 'en40' ? 'en-blind.design.json' : name === 'en2' ? 'en-blind2.design.json' : 'near-neg-blind.design.json');
  const design = fs.existsSync(dp) ? new Map(JSON.parse(fs.readFileSync(dp, 'utf8')).rows.map(r => [r.id, r])) : new Map();

  const rows = items.map(it => {
    const r = raw.get(it.h);
    return { it, id: r.id, dir: r.direction, label: r.label, note: r.note || '', cls: (design.get(r.id) || {}).cls || '', v: led.get(it.h) || {} };
  }).filter(r => LABELS.includes(r.label));
  if (!rows.length) { say(`⛔ אין תוויות לסט ${name}`); process.exitCode = 1; return; }

  const hist = { 'כ': 0, 'ל': 0, '?': 0 }; for (const r of rows) hist[r.label]++;
  say(`# ניקוד · סט ${name} · ${rows.length} פריטים מתויגים`);
  say('');
  say(`אמת המידה · כ=${hist['כ']} · ל=${hist['ל']} · ?=${hist['?']} · מקור: תיוג עיוור של הסשן הראשי`);

  const table = (sub, title) => {
    if (!sub.length) return;
    say(''); say(`## ${title} · ${sub.length} פריטים`); say('');
    /* ניקוד אחד · ה-"?" מוכרע לפי `RULING_Q` (הכרעת חגי 16.8) · ראה ההערה ב-calib */
    {
      let tp = 0, fp = 0, tn = 0, fn = 0;
      for (const r of sub) {
        const p = decide(r.it, r.v) === 'accept';
        const h = (r.label === '?' ? RULING_Q(r.it) : r.label) === 'כ';
        if (p && h) tp++; else if (p && !h) fp++; else if (!p && !h) tn++; else fn++;
      }
      const tot = tp + fp + tn + fn;
      const nq = sub.filter(r => r.label === '?').length;
      const lbl = nq ? ` · ה-"?" מוכרע לפי כיוון (${nq} שורות)` : '';
      say(`**חוק פה אחד**${lbl}`);
      say('');
      say('| | אמת המידה: כ | אמת המידה: ל |');
      say('|---|---|---|');
      say(`| המורה מקבל | **${tp}** | **${fp}**${fp ? ' ⛔' : ' ✅'} |`);
      say(`| המורה דוחה | ${fn} | ${tn} |`);
      say('');
      say(`דיוק ${(100 * (tp + tn) / tot).toFixed(1)}% · precision ${tp + fp ? (100 * tp / (tp + fp)).toFixed(1) + '%' : '—'} · recall ${tp + fn ? (100 * tp / (tp + fn)).toFixed(1) + '%' : '—'}`);
      say('');
    }
  };
  table(rows, 'הכול');
  for (const d of ['word', 'gloss']) {
    const sub = rows.filter(r => r.dir === d);
    if (sub.length && sub.length !== rows.length) table(sub, `כיוון \`${d}\``);
  }

  say('## כל עדשה בנפרד מול אמת המידה · "?" = ל');
  say('');
  say('| עדשה | חלה | מסכימה | דיוק | קבלות-שווא | דחיות-שווא |');
  say('|---|---|---|---|---|---|');
  for (const L of LENSES) {
    let ok = 0, n = 0, fa = 0, fr = 0;
    for (const r of rows) {
      if (!appliesTo(L.id, r.it) || !r.v[L.id]) continue;
      n++; const p = r.v[L.id] === 'כ', h = (r.label === '?' ? RULING_Q(r.it) : r.label) === 'כ';
      if (p === h) ok++; if (p && !h) fa++; if (!p && h) fr++;
    }
    if (n) say(`| ${L.id} · ${L.he} | ${n} | ${ok}/${n} | **${(100 * ok / n).toFixed(1)}%** | ${fa} | ${fr} |`);
  }

  const g = new Map();
  for (const r of rows) {
    const k = r.cls.split('·').slice(0, 2).join('·') || '—';
    if (!g.has(k)) g.set(k, { n: 0, ok: 0, miss: [] });
    const b = g.get(k); b.n++;
    const p = decide(r.it, r.v) === 'accept';
    const lab = r.label === '?' ? RULING_Q(r.it) : r.label;
    if (p === (lab === 'כ')) b.ok++; else b.miss.push(r.id + (lab === 'כ' ? '(נדחה)' : '(התקבל)'));
  }
  say('');
  say('## לפי מחלקת התכן · "?" = ל');
  say('');
  say('| מחלקה | פריטים | נכון | מי החטיא |');
  say('|---|---|---|---|');
  for (const k of [...g.keys()].sort()) { const b = g.get(k); say(`| ${k} | ${b.n} | ${b.ok} | ${b.miss.join(' ') || '—'} |`); }

  say('');
  say('## כל אי-ההתאמות · אחת-אחת');
  say('');
  say(`| מזהה | כיוון | כרטיס | הוקלד | אמת | המורה | ${LENS_IDS.join(' | ')} | הערת המתייג |`);
  say('|---|---|---|---|---|---|' + LENS_IDS.map(() => '---|').join('') + '---|');
  let bad = 0;
  for (const r of rows) {
    const p = decide(r.it, r.v) === 'accept';
    const lab = r.label === '?' ? RULING_Q(r.it) : r.label;
    if (p === (lab === 'כ')) continue;
    bad++;
    const cells = LENS_IDS.map(l => appliesTo(l, r.it) ? (r.v[l] || '·') : '–').join(' | ');
    say(`| ${r.id} | ${r.dir} | ${r.it.term} | «${r.it.typed}» | **${lab}${r.label==="?"?"←?":""}** | ${decide(r.it, r.v)} | ${cells} | ${r.note.slice(0, 55)} |`);
  }
  if (!bad) say('| — | — | — | — | — | — |' + LENS_IDS.map(() => ' — |').join('') + ' אין |');
}

/* ===================== 9א · הבקרה השלילית =====================
 *
 * ⛔ **הבדיקה שהסט האנושי אינו יכול להריץ.** ב-`--calib` כל 29 הדחיות יושבות
 * באוכלוסיית "שינוי מילה אחת"; באוכלוסיית התשובה החופשית יש 21 פריטים ואפס
 * שליליים, ולכן "אפס קבלות-שווא" שם הוא טאוטולוגיה. כאן יש 24 שליליים ודאיים
 * **באותה אוכלוסייה חופשית** · אמת המידה מובנית ולא שפוטה. */
function negtest() {
  const items = loadSet('neg24');
  const raw = new Map(fs.readFileSync(setPath('neg24'), 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => JSON.parse(l)).map(r => [itemOf(r).h, r]));
  const led = loadLedger('neg24');
  say('# בקרה שלילית · 24 תשובות ששייכות לכרטיס אחר');
  say('');
  say('אמת המידה: **כל 24 הם `ל`** · לא לפי שיפוט אלא לפי מבנה. מי שכתב את התשובה');
  say('של כרטיס אחר לא ידע את המילה של הכרטיס הזה.');
  say('');
  let acc = 0, rej = 0, uns = 0; const bad = [];
  for (const it of items) {
    const v = led.get(it.h) || {};
    const d = decide(it, v);
    if (d === 'accept') { acc++; bad.push({ it, r: raw.get(it.h), v }); } else if (d === 'reject') rej++; else uns++;
  }
  say('| | |');
  say('|---|---|');
  say(`| נשפטו | ${items.length} |`);
  say(`| נדחו נכון | ${rej} |`);
  say(`| unsure | ${uns} |`);
  say(`| **קבלות-שווא** | **${acc}**${acc ? ' ⛔' : ' ✅'} |`);
  if (bad.length) {
    say('');
    say('| מזהה | מילה | הוקלד | T2 | T3 | T5 |');
    say('|---|---|---|---|---|---|');
    for (const b of bad) say(`| ${b.r.id} | ${b.it.term} | ${b.it.typed} | ${b.v.T2 || '·'} | ${b.v.T3 || '·'} | ${b.v.T5 || '·'} |`);
  }
  say('');
  say('| עדשה | תפסה | פספסה |');
  say('|---|---|---|');
  for (const L of LENSES) {
    const pool = items.filter(it => appliesTo(L.id, it) && (led.get(it.h) || {})[L.id]);
    if (!pool.length) { say(`| ${L.id} · ${L.he} | — | אינה חלה על אף פריט |`); continue; }
    const caught = pool.filter(it => led.get(it.h)[L.id] === 'ל').length;
    say(`| ${L.id} · ${L.he} | ${caught}/${pool.length} | ${pool.length - caught} |`);
  }
  say('');
  say('⚠ **אלה שליליים רחוקים.** התשובה שייכת לכרטיס אחר לגמרי, ולכן היא קלה לזיהוי.');
  say('השלילי ה**קרוב** — נרדפת של מילה שכנה, מילת-על שמתאימה גם לכרטיס אחר — קשה');
  say('בהרבה, ואין לו מקור באף אחד משני הסטים. אפס כאן **אינו** מוכיח אפס שם.');
  if (acc) process.exitCode = 1;
}

/* ===================== 9ב · אבלציה · איזו עדשה מרוויחה את מקומה =====================
 *
 * ⭐ פאנל אינו טוב כי יש בו ארבע עדשות. הוא טוב אם כל עדשה **מוסיפה** משהו.
 * המצב שצריך לתפוס: עדשה שאומרת `כ` כמעט תמיד היא חותמת גומי — היא לא משנה
 * אף החלטה, היא עולה כסף, והיא **מייצרת אשליה של פאנל**. המצב ההפוך גם קיים:
 * עדשה שדוחה את הדבר הלא נכון וגורמת לכל ה-recall שאבד.
 *
 * הפלט: לכל תת-קבוצה של עדשות — קבלות-שווא ו-recall תחת חוק פה-אחד. */
/* ⛔ **האבלציה חייבת לרוץ על שני הסטים.** על `calib` לבדו היא מכריזה ש-T2 ו-T3
 * "מזיקות" — וזה שקר שנובע מהחור: ב-`calib` אין אף שלילי חופשי, ולכן העדשות
 * היחידות שתופסות שלילי חופשי נראות כאילו הן רק עולות recall. בבקרה השלילית
 * הן תופסות 24/24 ו-T5 תופסת 0/24. מדידה על חצי אוכלוסייה מייצרת המלצה הפוכה
 * מהאמת · זה השיעור, והוא נכתב כאן כדי שלא יילמד שוב. */
function ablate() {
  const sets = (arg('--sets', 'calib,neg24')).split(',').filter(s => fs.existsSync(setPath(s)));
  const rows = [];
  for (const s of sets) {
    const raw = new Map(fs.readFileSync(setPath(s), 'utf8').split(/\r?\n/).filter(Boolean)
      .map(l => JSON.parse(l)).map(r => [itemOf(r).h, r]));
    const led = loadLedger(s);
    const { t: human } = humanTruth();
    for (const it of loadSet(s)) rows.push({ it, set: s, id: raw.get(it.h).id, human: human.get(raw.get(it.h).id), v: led.get(it.h) || {} });
  }
  say(`_מקורות: ${sets.join(' + ')} · ${rows.length} פריטים · ${rows.filter(r => r.human === 'כ').length} חיוביים · ${rows.filter(r => r.human !== 'כ').length} שליליים_`);
  say('');

  const run = subset => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const r of rows) {
      const app = subset.filter(l => appliesTo(l, r.it));
      const got = app.filter(l => r.v[l]);
      const acc = app.length > 0 && got.length === app.length && app.every(l => r.v[l] === 'כ');
      const h = r.human === 'כ';
      if (acc && h) tp++; else if (acc && !h) fp++; else if (!acc && !h) tn++; else fn++;
    }
    return { tp, fp, fn, tn, rec: tp + fn ? 100 * tp / (tp + fn) : 0 };
  };

  say('# אבלציה · מה כל עדשה מוסיפה · חוק פה-אחד · "?" = ל');
  say('');
  say('| עדשות | קבלות-שווא | recall | דיוק |');
  say('|---|---|---|---|');
  const subsets = [];
  for (let m = 1; m < (1 << LENS_IDS.length); m++) {
    const s = LENS_IDS.filter((_, i) => m & (1 << i));
    subsets.push(s);
  }
  subsets.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
  for (const s of subsets) {
    const r = run(s);
    const tot = r.tp + r.fp + r.fn + r.tn;
    say(`| ${s.join('+')} | ${r.fp === 0 ? '**0** ✅' : `${r.fp} ⛔`} | ${r.rec.toFixed(1)}% | ${(100 * (r.tp + r.tn) / tot).toFixed(1)}% |`);
  }
  say('');
  say('## מה כל עדשה מוסיפה מעל השאר · הסרה מהפאנל המלא');
  say('');
  say(`| מוסרים | קבלות-שווא אחרי | recall אחרי | פסק |`);
  say('|---|---|---|---|');
  const full = run(LENS_IDS);
  for (const L of LENS_IDS) {
    const r = run(LENS_IDS.filter(x => x !== L));
    /* ⚠ הניסוח כאן היה פעם "מזיקה", וזה היה שגוי. עדשה שהסרתה אינה מוסיפה
       קבלות-שווא אינה מזיקה — היא **עודפת בהינתן השאר, על האוכלוסייה שנמדדה**.
       שתי הסתייגויות שאסור לבלוע: (א) עודפות נמדדת מול השליליים שיש, ואם
       האוכלוסייה חסרה מחלקה שלמה של שליליים, העודפות מדומה; (ב) עדשה עודפת
       היא גם **גיבוי** — היא מה שתופס כשעדשה אחרת נכשלת על קלט חדש. */
    const verdict = r.fp > full.fp ? `**מונעת ${r.fp - full.fp} קבלות-שווא** · חיונית`
      : r.rec > full.rec ? `עודפת בהינתן השאר · הסרתה תחזיר ${(r.rec - full.rec).toFixed(1)} נק' recall`
        : 'אינה משנה אף החלטה · אינה קונה כלום כאן';
    const solo = run([L]);
    say(`| ${L} | ${r.fp} | ${r.rec.toFixed(1)}% | ${verdict} · לבדה: ${solo.fp} ק"ש |`);
  }
}

/* ===================== 10 · הסכמה בין השופטים ===================== */

function agree(set) {
  const items = loadSet(set);
  const led = loadLedger(set);
  say(`# הסכמה בין השופטים · סט ${set}`);
  say('');
  say('| זוג עדשות | נשפטו יחד | הסכימו | שיעור |');
  say('|---|---|---|---|');
  for (let i = 0; i < LENS_IDS.length; i++) for (let j = i + 1; j < LENS_IDS.length; j++) {
    const A = LENS_IDS[i], B = LENS_IDS[j];
    let n = 0, ok = 0;
    for (const it of items) {
      const v = led.get(it.h) || {};
      if (!v[A] || !v[B]) continue;
      n++; if (v[A] === v[B]) ok++;
    }
    if (n) say(`| ${A}–${B} | ${n} | ${ok} | ${(100 * ok / n).toFixed(1)}% |`);
  }
  say('');
  say('| קבוצה | פריטים | פה אחד | שיעור |');
  say('|---|---|---|---|');
  for (const [lbl, sel] of [['שלוש הסמנטיות (‏T2·T3·T5)', ['T2', 'T3', 'T5']], ['כל העדשות החלות', null]]) {
    let n = 0, ok = 0;
    for (const it of items) {
      const v = led.get(it.h) || {};
      const ls = (sel || applicable(it)).filter(l => v[l]);
      if (ls.length < (sel ? sel.length : applicable(it).length)) continue;
      n++; if (ls.every(l => v[l] === v[ls[0]])) ok++;
    }
    if (n) say(`| ${lbl} | ${n} | ${ok} | **${(100 * ok / n).toFixed(1)}%** |`);
  }
  say('');
  say('⭐ ידוע מהסבב הקודם · פאנל סמנטי הסכים פה-אחד ב-51.9%, שאלה דקדוקית ב-99.6%.');
  say('עדשה עם הסכמה נמוכה אינה עדשה רעה בהכרח — אבל היא אומרת שהשאלה מעורפלת וצריך לפרק אותה.');
  say('');
  say('⚠ **הסכמה נמוכה בין שתי עדשות אורתוגונליות אינה כשל.** ‏T5 שואלת "האם זו מילה",');
  say('‏T4 שואלת "האם זו אותה מילה" · הן **אמורות** להיחלק. הסכמה נמוכה היא סימן אזהרה');
  say('רק בין עדשות ששואלות את **אותה** שאלה מזוויות שונות (‏T2 מול T3).');
}

/* ===================== 11 · עלות ===================== */

/* ⭐⛔ **מדוד, לא מוערך · והפעם הראשונה הייתה שגויה פי 26.**
 *
 * הגרסה הראשונה של הפונקציה הזאת גזרה טוקנים מגודל ה-TSV בבתים והחזירה
 * **1.2M** ל-10,000 פריטים. המדידה בפועל, על 8 קריאות שופט אמיתיות, החזירה
 * **58M** — פי ~48 על ההערכה המלאה, פי ~26 לפריט בודד.
 *
 * ⚠ הפער אינו טעות חשבון אלא **טעות מודל**, ולכן הוא חוזר: רוב הטוקנים אינם
 * הנתונים אלא הפרומפט של השופט, ההקשר שלו, וה**חשיבה** שלו לכל שורה. גזירה
 * מגודל הקלט מתעלמת משלושתם, והיא תמיד תיראה סבירה בזמן שהיא מחטיאה בסדר גודל.
 *
 * ⭐ **הכלל שנגזר:** אין לתקצב עבודת-שופט מגודל הקלט. מודדים קריאה אחת אמיתית,
 * ומודדים **שתי** אצוות בגדלים שונים כדי להפריד קבוע ממשתנה. עלות שלא נמדדה
 * כך אינה הערכה אלא ניחוש — וההחלטה שהיא מזינה (אצווה מלאה מול סינון מקדים)
 * היא החלטת התכן הגדולה ביותר בצינור הזה.
 *
 * המדידה · 8 קריאות שופט אמיתיות בסשן הזה (‏subagent_tokens מדווח):
 *
 *   עדשה  אצווה 64      אצווה 24      ⇒ שיפוע (לפריט)   חותך (קבוע לקריאה)
 *   T2    108,343       69,155          980              45,600
 *   T3    104,999       69,453          889              48,100
 *   T5     88,953       68,789          504              56,700
 *   T4     84,354 (43 פריטים · נקודה אחת בלבד)
 *
 * שתי נקודות לכל עדשה ⇒ רגרסיה ליניארית פשוטה. ‏T4 בעלת נקודה אחת ומקבלת את
 * הממוצע. ⚠ שתי נקודות הן המינימום שמאפשר הפרדה בין קבוע למשתנה, וזו הערכה
 * גסה של השיפוע — לא מדידה מדויקת שלו. */
const TOK_PER_ITEM = 791;                 /* ממוצע השיפועים · טוקנים לפריט לעדשה */
const TOK_FIXED_CALL = 50100;             /* ממוצע החותכים · פרומפט + הקשר לכל קריאה */
const SEC_PER_ITEM = 7.6;                 /* ‏590ש' ל-64 · 69ש' ל-24 ⇒ ~13ש'/פריט; שמרני */
const SEC_FIXED_CALL = 40;

function cost(set, batchSize) {
  const items = loadSet(set);
  const bytes = it => Buffer.byteLength(tsvRow(it) + '\n', 'utf8');
  const avgB = items.reduce((a, it) => a + bytes(it), 0) / items.length;
  const jobs = LENSES.reduce((a, L) => a + items.filter(it => appliesTo(L.id, it)).length, 0);
  const perItem = jobs / items.length;
  say(`# עלות · סט ${set} · **מספרים מדודים**`);
  say('');
  say('| | |');
  say('|---|---|');
  say(`| פריטים | ${items.length} |`);
  say(`| פסקי-עדשה (‏= יחידת העבודה) | ${jobs} · ${perItem.toFixed(2)} לפריט |`);
  say(`| שורת TSV | ${avgB.toFixed(0)} בתים ≈ ${(avgB / 2.2 / 2.4).toFixed(0)} טוקני קלט |`);
  say(`| **בפועל לפסק-עדשה** | **≈ ${TOK_PER_ITEM} טוקנים** · פי ~${(TOK_PER_ITEM / (avgB / 2.2 / 2.4)).toFixed(0)} מגודל ה-TSV |`);
  say(`| קבוע לכל קריאת שופט | ≈ ${(TOK_FIXED_CALL / 1000).toFixed(0)}K · פרומפט והקשר |`);
  say('');
  say('⚠ **הפער הזה הוא הלקח.** הטוקנים אינם ה-TSV, הם החשיבה של השופט לכל שורה.');
  say('הערכה שנגזרת מגודל הקלט תחטיא את התקציב בסדר גודל.');
  say('');
  say('## הערכה לעשרות אלפים · חוק ההכרעה הנוכחי');
  say('');
  say(`| פריטים | פסקי-עדשה | אצוות של ${batchSize} | טוקנים | זמן טורי | זמן ב-8 במקביל |`);
  say('|---|---|---|---|---|---|');
  for (const N of [1000, 10000, 30000, 50000]) {
    const j = Math.round(N * perItem);
    const b = Math.ceil(j / batchSize);
    const tok = (j * TOK_PER_ITEM + b * TOK_FIXED_CALL) / 1e6;
    const sec = j * SEC_PER_ITEM + b * SEC_FIXED_CALL;
    const hr = x => x < 1 ? (x * 60).toFixed(0) + ' דק\'' : x.toFixed(0) + ' שע\'';
    say(`| ${N.toLocaleString('en')} | ${j.toLocaleString('en')} | ${b} | **${tok.toFixed(0)}M** | ${hr(sec / 3600)} | ${hr(sec / 3600 / 8)} |`);
  }
  say('');
  say('## שלוש הדרכים להוריד את זה · לפי גודל ההשפעה');
  say('');
  say('| מה | חיסכון | מה זה עולה |');
  say('|---|---|---|');
  say(`| **המטמון** · פריט נשפט פעם אחת בלבד | הכול, בכל הרצה חוזרת | כלום · כבר בנוי |`);
  say(`| **T5 החוצה** · לא קנתה אף החלטה | ${(100 / perItem).toFixed(0)}% מהפסקים | מאבדים את מניית "אינה מילה" |`);
  say(`| **סינון מקדים** · לשלוח רק מה שהתלמיד מסופק לגביו | תלוי · פוטנציאלית 90% | צריך תלמיד שיודע לומר "לא בטוח" |`);
  say('');
  say('⭐ **הסינון המקדים הוא התשובה האמיתית לעשרות אלפים.** אצווה מלאה על כל');
  say('הקורפוס אינה נדרשת: המורה צריך לשפוט את מה שהתלמיד **חלוק** עליו, לא את מה');
  say('שהוא כבר מכריע נכון. זו החלטה של הסוכן שבונה את התלמיד, לא שלי.');
  say('');
  say('⚠ הזמן נמדד על סוכנים שרצו במקביל בסשן הזה · תלוי עומס ואינו התחייבות.');
}

/* ===================== 12 · שיניים ===================== */

function selftest() {
  let ok = true;
  const t = (c, m) => { say(`  ${c ? '✅' : '⛔'} ${m}`); if (!c) ok = false; };
  const mk = o => itemOf(Object.assign({ lang: 'he', direction: 'gloss', term: 'עקר', gloss: 'חיטא', written: 'הרג חיידקימ', typed: 'הורג חיידקימ' }, o));

  say('## א · מפתח דטרמיניסטי');
  t(mk().h === mk().h, 'אותו קלט → אותו מפתח');
  t(mk().h !== mk({ typed: 'הורג חיידקים' }).h, 'תו אחד שונה → מפתח אחר');
  t(mk({ typed: ' הורג   חיידקימ ' }).h === mk().h, 'רווחים מנורמלים · אותו מפתח');
  t(mk({ direction: 'word' }).h !== mk().h, 'כיוון אחר → מפתח אחר');
  let threw = false; try { itemOf({ lang: 'fr', term: 'a', typed: 'b' }); } catch (e) { threw = true; }
  t(threw, 'שפה לא נתמכת זורקת');

  say('## ב · חוק ההכרעה · ⛔ קלט שאמור להיפסל');
  const it3 = mk(), it4 = mk({ written: 'הרג חיידקימ בכלי', typed: 'הורג חיידקימ בכלי' });
  t(applicable(it4).includes('T4'), 'שינוי מילה אחת ⇒ T4 חלה');
  t(!applicable(mk({ written: 'צרור קיסמימ בוערימ', typed: 'כובע' })).includes('T4'), 'תשובה חופשית ⇒ T4 אינה חלה');
  /* ⚠ ההצבעות נבנות מ-`applicable` ולא נכתבות ביד. הגרסה הידנית נשברה בדיוק פעם
     אחת — כשעדשה פרשה ואחרת נכנסה, הבקרה החיובית המשיכה להצביע לשמות ישנים,
     נפלה ל-unsure, וה-selftest האדים על עצמו ולא על באג. בדיקה שמקובעת לשמות
     עדשות מודדת את רשימת השמות, לא את חוק ההכרעה. */
  const vote = (it, over = {}) => Object.fromEntries(applicable(it).map(l => [l, over[l] || 'כ']));
  const one = applicable(it3)[applicable(it3).length - 1];      /* עדשה חלה כלשהי לחלוק עליה */
  t(applicable(it3).length >= 3, `לפריט יש ${applicable(it3).length} עדשות חלות · הפאנל אינו מתחת לשלוש`);
  t(decide(it3, vote(it3)) === 'accept', 'פה אחד מתקבל · הבקרה החיובית');
  t(decide(it3, vote(it3, { [one]: 'ל' })) === 'reject', `⛔ מתנגד בודד (${one}) ⇒ reject · ולא accept`);
  t(decide(it3, vote(it3, { [one]: '?' })) === 'unsure', '⛔ "?" בודד אינו קבלה');
  t(decide(it3, { [applicable(it3)[0]]: 'כ' }) === 'unsure', '⛔ פסק חסר אינו קבלה');
  t(decide(it3, {}) === 'unsure', '⛔ אפס פסקים אינו קבלה');
  t(decide(it3, undefined) === 'unsure', '⛔ undefined אינו קבלה');
  t(majority(it3, vote(it3, { [one]: 'ל' })) === 'accept', 'ורוב **היה** מקבל אותו · לכן מחיר פה-אחד נמדד ולא מונח');
  /* ⛔ עדשה שפרשה אינה מצביעה · פסק T1 בפנקס לא יחזיר פריט ל-accept */
  t(!applicable(it3).includes('T1'), 'עדשה שפרשה אינה ברשימת החלות');
  t(decide(it3, Object.assign(vote(it3, { [one]: 'ל' }), { T1: 'כ' })) === 'reject', '⛔ "כ" של עדשה שפרשה אינו מבטל "ל" של עדשה פעילה');

  say('## ב2 · וטו הטאוטולוגיה · ⛔ תשובה שחוזרת על המונח');
  const taut = o => itemOf(Object.assign({ lang: 'he', direction: 'gloss', gloss: 'x', written: 'x' }, o));
  const allY = i => Object.fromEntries(applicable(i).map(l => [l, 'כ']));
  const t16 = taut({ term: 'בֵּין הַעַרְבַּיִם', typed: 'בינ ערביימ' });
  t(isTautology(t16), '⛔ «בינ ערביימ» על «בֵּין הַעַרְבַּיִם» מזוהה כטאוטולוגיה · חרף ניקוד וכתיב מלא/חסר');
  t(decide(t16, allY(t16)) === 'reject', '⛔ ואפילו כשכל העדשות אמרו "כ" ⇒ **reject** · הווטו גובר');
  const ok1 = taut({ term: 'אוֹצֵר', typed: 'הממונה על המוצגימ במוזיאונ' });
  t(!isTautology(ok1), 'תשובה אמיתית אינה מזוהה כטאוטולוגיה · הווטו אינו "דוחה הכול"');
  t(decide(ok1, allY(ok1)) === 'accept', 'ואותה שורה עם פה-אחד ⇒ accept');
  const wdir = itemOf({ lang: 'en', direction: 'word', term: 'abacus', gloss: 'חשבונייה', written: 'abacus', typed: 'abacus' });
  t(!isTautology(wdir), '⛔ בכיוון word התשובה **אמורה** להיות המונח · הווטו אינו חל שם');

  say('## ב3 · כיוון word באנגלית · **הפאנל הוחזר** · אין עוד חוק נפרד');
  const en = (term, typed) => itemOf({ lang: 'en', direction: 'word', term, gloss: 'g', written: term, typed });
  /* ⭐ הבדיקה שמוכיחה שהעקיפה הוסרה · זה בדיוק המקרה שהפיל אותה:
     שלוש עדשות אמרו `ל`, והחוק הישן החזיר accept בלי להתייעץ. עכשיו `ל` אחת דוחה. */
  t(decide(en('notwithstanding', 'awfagivlffawwvs'), { T2: 'ל', T3: 'ל', T5: 'ל' }) === 'reject',
    '⭐ ⛔ שלוש עדשות אמרו "ל" ⇒ **reject** · X20 · העקיפה החזירה כאן accept');
  t(decide(en('blend', 'bend'), { T2: 'ל', T3: 'ל', T5: 'כ' }) === 'reject', '⛔ מילה אנגלית אחרת ⇒ reject');
  t(decide(en('bandage', 'bandages'), { T2: 'כ', T3: 'כ', T4: 'כ', T5: 'כ' }) === 'accept', 'פה אחד ⇒ accept · הפאנל אינו "דוחה הכול" (T4 חלה כאן · הדבקת סיומת)');
  t(decide(en('abacus', 'abavus'), { T5: 'ל' }) === 'reject', '⛔ פסק חלקי עם "ל" ⇒ reject · T5 לבדה אינה מקבלת עוד');
  t(decide(en('abacus', 'abavus'), { T2: 'כ', T3: 'כ' }) === 'unsure', '⛔ שתי עדשות בלבד ⇒ unsure · פחות משלוש אינו קבלה');
  /* ⚠ החולשה הידועה שההחזרה מחזירה איתה · מתועדת ולא מתוקנת */
  t(decide(en('abacus', 'abavus'), { T2: 'כ', T3: 'כ', T5: 'ל' }) === 'reject',
    '⚠ שגיאת הקלדה שאינה מילה ⇒ **reject** · T5 וטו · זו החולשה שהסט השלישי אמור לכמת');
  /* הכרעת חגי · שרדה את ההחזרה, כי היא וטו ולא ענף קבלה */
  t(decide(en('decide', 'decision'), { T2: 'כ', T3: 'כ', T5: 'כ' }) === 'reject',
    '⭐ הכרעת חגי שרדה · שם-פעולה בכיוון word ⇒ reject גם בפה אחד "כ"');
  t(!appliesTo('T4', en('abacus', 'abavus')), '⛔ T4 אינה חלה על רעש מקלדת באנגלית · השאלה שלה אינה מוגדרת שם');
  t(appliesTo('T4', en('bandage', 'bandages')), 'T4 כן חלה על הדבקת סיומת · שם השאלה מוגדרת');

  say('## ב4 · הכרעת חגי 16.8 · שם-פעולה תלוי כיוון');
  const enW = (term, typed) => itemOf({ lang: 'en', direction: 'word', term, gloss: 'g', written: term, typed });
  const enG = (term, gloss, typed) => itemOf({ lang: 'en', direction: 'gloss', term, gloss, written: gloss, typed });
  t(isNominalization('decide', 'decision'), 'decide/decision מזוהה כגזירה נומינלית');
  t(isNominalization('arrive', 'arrival'), 'arrive/arrival מזוהה');
  t(isNominalization('govern', 'government'), 'govern/government מזוהה');
  t(!isNominalization('bandage', 'bandages'), '⛔ bandage/bandages **אינה** גזירה נומינלית · הטיה רגילה');
  t(!isNominalization('blend', 'bend'), '⛔ blend/bend אינה גזירה · גזע משותף קצר מדי');
  t(!isNominalization('abacus', 'abavus'), '⛔ שגיאת הקלדה אינה גזירה');
  /* ⛔ הענף שההכרעה קובעת · כיוון word דוחה, כיוון gloss מקבל */
  t(decide(enW('decide', 'decision'), { T5: 'כ', T3: 'כ', T2: 'כ' }) === 'reject',
    '⛔ כיוון word · שם-פעולה ⇒ **reject** · גם כשכל העדשות אמרו "כ"');
  const g1 = enG('decide', 'להחליט', 'החלטה');
  t(decide(g1, Object.fromEntries(applicable(g1).map(l => [l, 'כ']))) === 'accept',
    '✅ כיוון gloss · שם-פעולה ⇒ **accept** · אותה מחלקה, הכרעה הפוכה');
  t(RULING_Q(g1) === 'כ' && RULING_Q(enW('decide', 'decision')) === 'ל',
    'ניקוד ה-"?" עצמו תלוי כיוון · gloss=כ · word=ל');
  t(decide(enW('bandage', 'bandages'), { T2: 'כ', T3: 'כ', T4: 'כ', T5: 'כ' }) === 'accept',
    'והטיה רגילה בכיוון word עדיין מתקבלת · ההכרעה לא בלעה מחלקה אחרת');

  say('## ג · שער הקליטה · ⛔ פלט פגום של שופט');
  const tmpSet = 'selftest';
  const sp = setPath(tmpSet), lp = ledgerPath(tmpSet);
  fs.mkdirSync(TDIR, { recursive: true }); fs.mkdirSync(VERD, { recursive: true }); fs.mkdirSync(BATCH, { recursive: true });
  const born = [
    { src: 'x', id: 'S1', lang: 'he', direction: 'gloss', term: 'עקר', gloss: 'חיטא', written: 'הרג חיידקימ', typed: 'הורג חיידקימ' },
    { src: 'x', id: 'S2', lang: 'he', direction: 'gloss', term: 'אשכול', gloss: 'צבר פירות', written: 'צבר פירות', typed: 'צובר פירות' },
  ];
  const K = born.map(b => itemOf(b).k);
  const vf = n => path.join(VERD, `${tmpSet}.T2.${n}.tsv`);
  const clean = () => { for (const p of [sp, lp, vf(1), vf(2)]) if (fs.existsSync(p)) fs.unlinkSync(p); for (const f of fs.readdirSync(BATCH)) if (f.startsWith(tmpSet + '.')) fs.unlinkSync(path.join(BATCH, f)); };
  try {
    clean();
    fs.writeFileSync(sp, born.map(b => JSON.stringify(b)).join('\n') + '\n', 'utf8');
    const bad = (content, why) => {
      fs.writeFileSync(vf(1), content, 'utf8');
      let e = null; try { ingest(tmpSet, { dry: true, quiet: true }); } catch (x) { e = x; }
      t(!!e, `⛔ ${why} ⇒ זורק${e ? '' : ' · ⚠ נבלע בשקט!'}`);
    };
    bad(`k\tv\n${K[0]}\tyes\n`, 'תווית באנגלית ("yes")');
    bad(`k\tv\n${K[0]}\tכן\n`, 'תווית "כן" במקום "כ"');
    bad(`k\tv\nZZZZZZZZZZZZ\tכ\n`, 'מפתח שלא נשלח');
    bad(`k\tv\n${K[0]}\n`, 'שורה בעמודה אחת');
    bad(`k\tv\nהשופט ענה בפסקה יפה ולא ב-TSV\n`, 'טקסט חופשי במקום TSV');
    bad(`k\tv\n${K[0]}\tכ\n${K[0]}\tל\n`, 'פסק כפול וסותר באותו קובץ');
    /* פסק תקין כן נקלט · שער שדוחה הכול אינו שער */
    fs.writeFileSync(vf(1), `k\tv\twhy\n${K[0]}\tכ\tנימוק\n${K[1]}\tל\tנימוק\n`, 'utf8');
    const r = ingest(tmpSet, { dry: false, quiet: true });
    t(r.fresh === 2, `פסק תקין נקלט (${r.fresh}/2) · השער אינו "דוחה הכול"`);
    /* סתירה מול הפנקס · זה הבאג שהפיל את הפאנל הקודם */
    fs.writeFileSync(vf(2), `k\tv\n${K[0]}\tל\n`, 'utf8');
    let e2 = null; try { ingest(tmpSet, { dry: true, quiet: true }); } catch (x) { e2 = x; }
    t(!!e2 && /סותר את הפנקס/.test(e2.message), '⛔ קובץ שני שסותר את הפנקס ⇒ זורק · לא דורס בשקט');
    fs.unlinkSync(vf(2));
    /* ה-API */
    const j = judge(born[0], { set: tmpSet });
    t(j.verdict === 'unsure', `⛔ פריט עם עדשה אחת בלבד ⇒ ${j.verdict} · לא accept`);
    const j2 = judge(born[1], { set: tmpSet });
    t(j2.verdict === 'reject', `עדשה אחת אמרה "ל" ⇒ reject (${j2.verdict})`);
    t(judge({ lang: 'he', term: 'לא', gloss: 'קיים', typed: 'בכלל' }, { set: tmpSet }).verdict === 'unsure', 'פריט שמעולם לא נשפט ⇒ unsure · לא accept');
  } finally { clean(); }

  say('## ד · השן האמיתית · הכיול עצמו יודע להאדים');
  /* ⛔ זו הבדיקה שמוכיחה שהשער אינו קישוט: מזריקים פסק "כ" פה-אחד לשורה
     שתויגה `ל` בסט העיוור, ומוודאים ש-`--calib` סופר אותה כקבלת-שווא. שער שלא נראה
     אדום אף פעם אינו עדות · זה קרה שלוש פעמים בפרויקט הזה. */
  try {
    const poisonId = 'M1070.1593';                            /* דלוח · "לא צלול"→"לא צולל" · תויג ל */
    const src = buildFromBlind().find(r => r.id === poisonId);
    t(!!src, `שורת ההרעלה ${poisonId} קיימת בסט העיוור`);
    if (src) {
      const pit = itemOf(src);
      const app = applicable(pit);
      const fake = new Map([[pit.h, Object.fromEntries(app.map(l => [l, 'כ']))]]);
      const isFA = decide(pit, fake.get(pit.h)) === 'accept';
      t(isFA, `⛔ פסק פה-אחד "כ" על שורה שתויגה ל ⇒ decide=accept · כלומר הכיול **יספור** אותה כקבלת-שווא`);
      const clean2 = decide(pit, Object.fromEntries(app.map(l => [l, 'ל'])));
      t(clean2 === 'reject', 'ואותה שורה עם "ל" ⇒ reject · הכיול אינו מדווח אדום תמיד');
    }
  } catch (e) { t(false, 'בדיקת ההרעלה קרסה · ' + e.message); }

  say('');
  say(ok ? '✅ כל השיניים נשכו' : '⛔ שן שבורה · יציאה 1');
  if (!ok) process.exitCode = 1;
}

/* ===================== CLI ===================== */

if (require.main === module) {
  const set = arg('--set', 'calib');
  try {
    if (has('--build-calib')) buildCalib();
    else if (has('--build-neg')) buildNeg();
    else if (has('--build-blind')) buildBlind(set);
    else if (has('--emit')) emit(set, num('--batch', 250));
    else if (has('--ingest')) ingest(set, { dry: has('--dry') });
    else if (has('--calib')) calib();
    else if (has('--agree')) agree(set);
    else if (has('--ablate')) ablate();
    else if (has('--negtest')) negtest();
    else if (has('--score')) scoreSet(set);
    else if (has('--cost')) cost(set, num('--batch', 250));
    else if (has('--selftest')) { say('# שיניים · teacher.js'); say(''); selftest(); }
    else say('שימוש: --build-calib | --emit | --ingest | --calib | --agree | --ablate | --cost | --selftest   [--set NAME] [--batch N]');
  } catch (e) { say('⛔ ' + e.message); process.exitCode = 1; }
}

module.exports = { judge, isTautology, isNominalization, isMorphPair, ablate, negtest, scoreSet, buildBlind, BLIND_SETS, buildNeg, RETIRED, ALL_IDS, itemOf, decide, majority, applicable, appliesTo, wordDiff, LENSES, LENS_IDS, loadLedger, ingest, emit, loadSet, humanTruth };
