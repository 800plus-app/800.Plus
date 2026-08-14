'use strict';
/* אופרטורי טעות עבריים · על המפתח המנורמל, לא על המילה הכתובה.
 *
 * למה על המפתח: ההכרעה באפליקציה נופלת אחרי K(), כלומר אחרי norm. norm מסירה ניקוד,
 * מסירה פיסוק, ומקפלת אותיות סופיות (ךםןףץ). וריאציה שנבנית על המילה המנוקדת תיבלע
 * בנרמול ולא תגיע להכרעה כלל, ולכן כל אופרטור כאן עובד בדיוק במרחב שבו ההתאמה מתבצעת.
 *
 * מסקנה ישירה מזה: **אין אופרטור אותיות סופיות.** norm כבר מקפלת ן→נ ם→מ ך→כ ף→פ ץ→צ,
 * ולכן "מיםׂ" מול "מים" הוא אותו מפתח בדיוק · טעות שאינה קיימת מנקודת המבט של ההכרעה.
 * מה שכן נשמר: שכנות המקלדת מחושבת על הפריסה **הפיזית**, כולל הסופיות, ורק התוצאה
 * מקופלת. אחרת ו לא הייתה מקבלת את נ כשכנה (ן יושבת לידה במקלדת), וזו טעות אמיתית ונפוצה.
 *
 * חוזה אופרטור: { name, class, weight, apply(key, rng) -> string[] }
 * apply מחזירה את **כל** הווריאציות, מסוננות מכפילויות, בסדר שנקבע מה-rng בלבד. הבורר
 * (gen_dataset) לוקח את הראשונות · כך אותו זרע נותן אותה בחירה, ובלי לוגיקת דגימה בכל אופרטור.
 *
 * מפתח יכול להכיל רווח (380 מונחים עבריים הם רב-מיליים, וגם מקטעי פירוש). כל אופרטור
 * פועל **בתוך מילה** ומרכיב את המפתח מחדש: השחתה שחוצה גבול מילה אינה טעות הקלדה אלא
 * מחרוזת אחרת.
 */

/* ===== מקלדת עברית תקנית (ישראלית) ===== */
/* כל תו בגרשיים משלו ולא כמחרוזת אחת: מחרוזת מעורבת עברית/פיסוק מוצגת בסדר ויזואלי
   בעורך, והסדר הלוגי · שהוא הקובע · הופך לבלתי ניתן לביקורת בעין. */
const ROWS = [
  ['/', "'", 'ק', 'ר', 'א', 'ט', 'ו', 'ן', 'ם', 'פ'],
  ['ש', 'ד', 'ג', 'כ', 'ע', 'י', 'ח', 'ל', 'ך', 'ף'],
  ['ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת', 'ץ']
];

/* קיפול הסופיות · בדיוק זה של norm ב-app.js:630. */
const FINAL_FOLD = { 'ן': 'נ', 'ם': 'מ', 'ך': 'כ', 'ף': 'פ', 'ץ': 'צ' };
const fold = c => FINAL_FOLD[c] || c;

const HE_LETTER = /[א-ת]/;

/* השכנות: אופקית משני הצדדים, ובשורות מעל ומתחת שני המקשים הקרובים ביותר.
   ההיסט של המקלדת הוא כמו QWERTY · השורה התחתונה מוסטת ימינה ביחס לעליונה, ולכן מקש
   בעמודה c נוגע בעמודות c ו-c+1 שמעליו ובעמודות c-1 ו-c שמתחתיו. */
function buildAdj() {
  const map = new Map();
  const add = (a, b) => {
    if (!HE_LETTER.test(a) || !HE_LETTER.test(b)) return;      // / ו-' אינן אותיות
    const A = fold(a), B = fold(b);
    if (A === B) return;                                        // ך ליד ל, אבל ך מקופלת ל-כ
    let s = map.get(A);
    if (!s) { s = new Set(); map.set(A, s); }
    s.add(B);
  };
  for (let r = 0; r < ROWS.length; r++) {
    for (let c = 0; c < ROWS[r].length; c++) {
      const k = ROWS[r][c];
      add(k, ROWS[r][c - 1]); add(k, ROWS[r][c + 1]);
      if (r > 0) { add(k, ROWS[r - 1][c]); add(k, ROWS[r - 1][c + 1]); }
      if (r < ROWS.length - 1) { add(k, ROWS[r + 1][c - 1]); add(k, ROWS[r + 1][c]); }
    }
  }
  const out = new Map();
  for (const [k, s] of map) out.set(k, Array.from(s).sort());   // מיון · דטרמיניזם בלי תלות בסדר הכנסה
  return out;
}
const ADJ = buildAdj();

/* ===== תשתית ===== */

/* ערבוב Fisher-Yates זרוע. הרשימה המלאה נבנית דטרמיניסטית, וה-rng קובע רק את הסדר · כך
   שאותו (מפתח, אופרטור, חריץ) נותן תמיד אותה בחירה. */
function shuffled(arr, rng) {
  const a = Array.from(new Set(arr));
  a.sort();                                                     // בסיס יציב לפני הערבוב
  if (!rng) return a;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* עוטף מחולל-וריאציות-של-מילה-בודדת למחולל על מפתח שלם, מילה-מילה. */
function perWord(gen) {
  return function (key) {
    const words = String(key).split(' ');
    const out = [];
    for (let w = 0; w < words.length; w++) {
      const src = words[w];
      if (!src) continue;
      for (const v of gen(src)) {
        if (!v || v === src) continue;
        const c = words.slice(); c[w] = v;
        out.push(c.join(' '));
      }
    }
    return out;
  };
}

const op = (name, cls, weight, gen, why) => ({
  name, class: cls, weight,
  apply: (key, rng) => shuffled(perWord(gen)(key), rng),
  why: why || (() => name)
});

/* ===== האופרטורים ===== */

/* שכנות מקלדת · האופרטור הכבד ביותר במציאות, ולכן גם המשקל הגבוה ביותר בדגימה. */
const genAdj = w => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const n = ADJ.get(w[i]); if (!n) continue;
    for (const c of n) out.push(w.slice(0, i) + c + w.slice(i + 1));
  }
  return out;
};

/* היפוך שכנים. במרחק לוונשטיין רגיל זה 2 ולא 1 · עובדה שחשובה לבדיקת הדו-משמעות
   למטה, שמשווה מרחקים ולא ספירת פעולות. */
const genTranspose = w => {
  const out = [];
  for (let i = 0; i + 1 < w.length; i++) {
    if (w[i] === w[i + 1]) continue;
    out.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  return out;
};

const genDrop = w => {
  const out = [];
  if (w.length <= 2) return out;                                // מילה בת שתי אותיות שאיבדה אות אינה טעות אלא רעש
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i) + w.slice(i + 1));
  return out;
};

const genDouble = w => {
  const out = [];
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1));
  return out;
};

/* אימות קריאה · כתיב מלא/חסר.
 * ההיגיון לקוח מ-fold() של units_output/check_dup.py:52: כפולות וו/יי מתקפלות לבודדת,
 * ו-ו/י פנימיות (לא ראשונה ולא אחרונה) נמחקות. שם זה שימש לאיתור כפילויות; כאן זה
 * הכיוון ההפוך · לייצר בדיוק את הווריאציות שהקיפול הזה מאחד.
 *
 * מה שהאופרטור **לא** צריך להבטיח: שהתוצאה אינה כבר מתקבלת. heForms מצילה חלק גדול
 * מהכתיב המלא (כֹּפֶר -> כופר), ו-gen_dataset מסננת כל מועמד שהריצה מקבלת היום · כך
 * שמה שנשאר הוא בדיוק הטעויות שמעבר להצלה הקיימת, בלי לשכפל כאן את הלוגיקה של heForms.
 */
const MATRES = ['ו', 'י'];

/* ⛔ הבינוני · הכשל שהאופרטור הזה ייצר בגרסה הראשונה.
 * הוספת ו אחרי העיצור הראשון של שורש תלת-עיצורי אינה שגיאת כתיב · היא **נטיית הבינוני
 * הפועל** של בניין קל: כבש→כובש, משל→מושל, כעס→כועס, זקן→זוקן. התוצאה היא מילה עברית
 * תקינה ואחרת לגמרי, והיא קיבלה תווית accept ב-58 שורות he-word ועוד 22 שורות פירוש.
 * הצורה נחסמת כאן ולא בתיוג, כי אופרטור שמייצר מילה אחרת אינו "טעות שהתגלתה כמילה" ·
 * הוא פשוט לא טעות. הבדיקה נשארת ניתנת לייבוא כדי ש-selfcheck2b יאשר אותה עצמאית. */
function isParticipleShape(src, out) {
  const a = String(src), b = String(out);
  /* השורש חייב להיות **עיצורי**: ב-נוֹחַ, בּוֹר, רוּחַ ו-עוֹר יש כבר ו במקום השני, והוספת
     ו שם אינה בינוני אלא הכפלת אם קריאה (נוח→נווח) · שגיאת כתיב מלא לגיטימית לגמרי.
     בלי התנאי הזה הבדיקה תפסה 21 שורות תקינות ופסלה כתיב מלא אמיתי. */
  if (a[1] === 'ו') return false;
  return a.length === 3 && b.length === 4 && b[1] === 'ו' && b[0] === a[0] && b.slice(2) === a.slice(1);
}

const genMater = w => {
  const out = [];
  if (w.length < 3) return out;
  for (let i = 1; i < w.length - 1; i++) {
    if (MATRES.includes(w[i])) out.push(w.slice(0, i) + w.slice(i + 1));   // מחיקת אם קריאה פנימית
    for (const m of MATRES) {
      const v = w.slice(0, i) + m + w.slice(i);                            // הוספת אם קריאה פנימית
      if (isParticipleShape(w, v)) continue;
      out.push(v);
    }
  }
  for (const m of MATRES) {
    if (w.includes(m + m)) out.push(w.split(m + m).join(m));               // וו -> ו , יי -> י
    let i = w.indexOf(m);
    while (i >= 0) {
      if (i > 0 && i < w.length - 1) {
        const v = w.slice(0, i) + m + w.slice(i);
        if (!isParticipleShape(w, v)) out.push(v);
      }
      i = w.indexOf(m, i + 1);
    }
  }
  return out;
};

/* הומופונים · אותיות שנשמעות זהה בעברית מודרנית וזו הטעות שכותבים באמת עושים.
   ה↔א רק בסוף מילה: "קרא" מול "קרה" הוא בלבול אמיתי, "אמר" מול "המר" אינו אותו דבר. */
const HOMO = [['ת', 'ט'], ['כ', 'ק'], ['א', 'ע'], ['ס', 'ש'], ['ח', 'כ'], ['ב', 'ו']];
const HOMO_FINAL = [['ה', 'א']];
const genHomophone = w => {
  const out = [];
  const swap = (pairs, from, to) => {
    for (const [x, y] of pairs) {
      if (from === x) out.push(w.slice(0, to) + y + w.slice(to + 1));
      if (from === y) out.push(w.slice(0, to) + x + w.slice(to + 1));
    }
  };
  for (let i = 0; i < w.length; i++) swap(HOMO, w[i], i);
  if (w.length >= 3) swap(HOMO_FINAL, w[w.length - 1], w.length - 1);
  return out;
};

/* המשקלים הם סדר הדגימה, לא הסתברות: gen_dataset בונה תור round-robin שבו כל אופרטור
   מופיע weight פעמים, ולכן הם מסתכמים בדיוק לתקציב המועמדים החיוביים לכל מפתח (7).
   ‏adj קיבל 2 ולא 3 אחרי מדידה: במשקל 3 הוא ייצר 69% מכלל השורות החיוביות, כלומר סט
   אימון שהוא כמעט-כולו שכנות מקלדת · והספים היו מכוילים לטעות אחת מתוך שש. */
const OPS = [
  op('adj', 'keyboard', 2, genAdj),
  op('transpose', 'order', 1, genTranspose),
  op('drop', 'omission', 1, genDrop),
  op('double', 'duplication', 1, genDouble),
  op('mater', 'spelling', 1, genMater),
  op('homophone', 'phonetic', 1, genHomophone)
];

module.exports = { OPS, ADJ, ROWS, shuffled, perWord, FINAL_FOLD, isParticipleShape, MATRES };
