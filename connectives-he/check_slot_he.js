'use strict';
/* ⭐ שער החריץ התחבירי · השער הקריטי של היחידה.
 *
 *   node connectives-he/check_slot_he.js
 *   node connectives-he/check_slot_he.js --require-words
 *
 * למה בלעדיו היחידה חסרת ערך
 * ---------------------------
 * ארבע האפשרויות חייבות להיות באותו **חריץ תחבירי**. אם אחת מהן היא מילית
 * משעבדת («משום ש-») ושלוש הן תוארי קישור («לפיכך»), הלומד פוסל שלוש מהן
 * מדקדוק בלבד · הוא רואה שאחריהן צריכה לבוא פסוקית ואחרי האחרות משפט שלם,
 * ומסמן את הנכונה **בלי לקרוא את המשפט**. זה בדיוק הכשל שנמדד בגרסה האנגלית
 * של השלמת המשפטים, והוא הסיבה שהשער הזה נכתב לפני שנכתבו הפריטים ולא אחריהם.
 *
 * שלוש שכבות, בסדר יורד של חוזק
 * -----------------------------
 *   1. **צורה** · מילית משעבדת בעברית נגמרת בטוקן `ש` או `ו` נפרד («משום ש»,
 *      «הואיל ו»). ⭐ זו עובדה משטחית שאפשר למדוד בלי שום מקור חיצוני, ולכן
 *      השכבה הזאת עובדת מהיום הראשון. הכלל: **או שכל ארבע האפשרויות נגמרות כך,
 *      או שאף אחת** · תערובת היא ממצא.
 *   2. **עקביות בין פריטים** · מילה שהוצהרה `adverb` בפריט אחד ו-`preposition`
 *      באחר סותרת את עצמה, ואחת משתי ההצהרות שגויה.
 *   3. **`words.json` כשהוא קיים** · המקור המוסמך לחריץ של כל מילה. ⛔ הוא אינו
 *      משוכפל לכאן; הוא נקרא בזמן ריצה.
 *
 * ⚠ ומה **אינו** נבדק היום, בפירוש: ההפרדה בין `adverb` ל-`preposition` לפריט
 * שכל ארבע מילותיו ייחודיות לו. אין לה סימן משטחי, והיא נסגרת רק כשמפת
 * ‏`words.json` נכנסת או כשהמילה חוזרת בפריט אחר. השורה «מילים מאומתות-הצלבה»
 * בפלט אומרת כמה מילים באמת נבדקו, ובלעדיה «0 ממצאים» היה יכול להיות ריק.
 */
const L = require('./lib_conn.js');

const { items, files, broken, dir } = L.loadBatches();
const words = L.loadWords();
const requireWords = process.argv.includes('--require-words');

const findings = broken.slice();
const notes = [`מנות: ${files.join(', ') || '(אין)'} · ${dir}`];

if (words.present) notes.push(`מפת המילים: ${words.byWord.size} מילים מ-words.json`);
else {
  notes.push(`ℹ words.json אינו בשימוש (${words.reason}) · שכבות הצורה וההצלבה בלבד.`);
  if (requireWords) {
    console.log(notes.join('\n'));
    console.log(`\n⛔ הופעל --require-words ו-${words.path} אינו קריא. אין מפה מוסמכת.`);
    process.exit(1);
  }
}

/** האם המילה נגמרת בטוקן כבול נפרד · `ש` או `ו`. «אף על פי ש», «הואיל ו». */
const isBound = w => {
  const t = L.tokens(w);
  return t.length > 1 && (t[t.length - 1] === 'ש' || t[t.length - 1] === 'ו');
};
/* החריצים שמותר לצורה כבולה לשבת בהם · אחריה באה פסוקית ולא צירוף שמני. */
const BOUND_OK = new Set(['conj', 'phrase']);

const byWordSlot = new Map();                  // מפתח קנוני → { slot, src }
const evidence = new Map();                    // מפתח קנוני → מספר פריטים שמצהירים עליה
const absent = new Set();                      // מילים שאינן ברשימת המילים · מידע, לא ממצא
const slotCount = {};

for (const it of items) {
  const add = m => findings.push(`${it.src} · ${m}`);
  const o = Array.isArray(it.o) ? it.o : [];
  if (!(it.slot in L.SLOTS)) add(`slot שאינו בקבוצה הסגורה: "${it.slot}"`);
  slotCount[it.slot] = (slotCount[it.slot] || 0) + 1;
  if (o.length !== 4) { add(`o באורך ${o.length} — אי אפשר להשוות חריצים`); continue; }

  /* ── שכבה 1 · צורה ─────────────────────────────────────────────────── */
  const bound = o.map(isBound);
  const nb = bound.filter(Boolean).length;
  if (nb !== 0 && nb !== 4) {
    const mixed = o.filter((_, i) => bound[i]).map(L.key).join(', ');
    const other = o.filter((_, i) => !bound[i]).map(L.key).join(', ');
    add(`חריצים מעורבים · צורה כבולה: ${mixed} · צורה חופשית: ${other}`);
  } else if (nb === 4 && !BOUND_OK.has(it.slot)) {
    add(`כל ארבע האפשרויות בצורה כבולה אך slot="${it.slot}"`);
  } else if (nb === 0 && it.slot === 'conj' && o.every(x => L.tokens(x).length === 1 && !/^ש/.test(L.key(x)))) {
    /* «שכן», «אולם», «ברם» הן מילות חיבור בלי טוקן `ש` נפרד · ולכן רק פריט
       שכל אפשרויותיו מילים בודדות שאינן פותחות ב-ש הוא חשוד מספיק לדיווח. */
    add('slot="conj" אך אף אפשרות אינה נושאת סימן חיבור');
  }

  /* ── שכבות 2 ו-3 · הצלבה ───────────────────────────────────────────── */
  for (const opt of o) {
    const kk = L.key(opt);
    if (!kk) continue;
    evidence.set(kk, (evidence.get(kk) || 0) + 1);
    const prev = byWordSlot.get(kk);
    if (prev && prev.slot !== it.slot)
      findings.push(`${it.src} · "${kk}" בחריץ "${it.slot}" כאן ו-"${prev.slot}" ב-${prev.src}`);
    else if (!prev) byWordSlot.set(kk, { slot: it.slot, src: it.src });

    if (words.present) {
      const rec = words.byWord.get(kk);
      /* ⚠ **היעדר אינו סתירה** · מסיח לגיטימי יכול להיות מחוץ לרשימת הלימוד
         של היחידה. הוא נספר ומדווח, ואינו צובע את השער אדום. */
      if (!rec) absent.add(kk);
      else if (rec.slot && rec.slot !== it.slot)
        findings.push(`${it.src} · "${kk}" בחריץ "${it.slot}" · ברשימת המילים הוא "${rec.slot}"`);
    }
  }
}

/* ── בקרה חיובית ─────────────────────────────────────────────────────────*/
/* מילה נחשבת מאומתת אם החריץ שלה נתמך במקור שני · פריט נוסף או רשימת המילים. */
const verified = [...evidence.entries()].filter(([w, n]) => n >= 2 || (words.present && !absent.has(w)));
const lone = [...evidence.keys()].filter(w => !verified.some(([v]) => v === w));
notes.push('חריצים: ' + Object.entries(slotCount).sort((a, b) => b[1] - a[1])
  .map(([s, n]) => `${L.SLOTS[s] || s} ${n}`).join(' · '));
notes.push(`מילים שהחריץ שלהן הוצלב למקור שני: ${verified.length} מתוך ${evidence.size}`);
if (lone.length)
  notes.push(`⚠ נשען על פריט יחיד בלי הצלבה: ${lone.slice(0, 12).join(', ')}` +
    (lone.length > 12 ? ` ועוד ${lone.length - 12}` : ''));
if (absent.size)
  notes.push(`ℹ מסיחים שאינם ברשימת המילים (לגיטימי): ${[...absent].join(', ')}`);
notes.push('⚠ ההפרדה בין תואר קישור למילת יחס אינה נמדדת מהצורה. היא נסגרת רק');
notes.push('   על ידי רשימת המילים או על ידי חזרת המילה בפריט אחר.');

process.exit(L.verdict('שער החריץ התחבירי · מילות קישור', items.length, findings, notes));
