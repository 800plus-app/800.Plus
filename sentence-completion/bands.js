/* נגזרת הרצועה להשלמת משפטים — **ממספר היחידה בבנק שלנו, לא מרשימה חיצונית.**
 *
 * למה לא EN_RANK, וזו הכרעה משפטית לפני שהיא הנדסית
 * --------------------------------------------------
 * `enrank.js` נגזר מ-FrequencyWords תחת **CC BY-SA 4.0** — רישיון עם שיתוף-זהה.
 * חגי קבע ב-10.8.2026 שלא נשארת חשיפה משפטית בשום נכס (CLAUDE.md, "כלל עומד").
 * הדרך לאפס חשיפה אינה רישיון מתירני יותר אלא **אפס תלות**: מספר היחידה ב-`data-en.js`
 * נקבע על ידינו, הוא חלק מהמוצר, ואין עליו רישיון של אף אחד אחר.
 *
 * ⭐ וזה גם עדיף לגופו, לפי מדידה ולא לפי הנחה (10.8.2026):
 *
 *   חציון דירוג חיצוני לפי יחידה:
 *     1:600  2:2178  3:2303  4:4825  5:5078  6:4917  7:9642  8:10021  9:12545  10:16230
 *
 *   · עולה מ-600 ל-16,230. **היפוך אחד בלבד** (6 מול 5, פער 161 מתוך 20,000 = 3%) — רעש.
 *   · **כיסוי:** לרשימה החיצונית חסרות 776 מ-3,945 המילים. ביחידה 10 היא מדרגת
 *     88 מתוך 390 — **23%**. כלומר היא חלשה בדיוק ברצועה האקדמית, כי מילה נדירה
 *     אינה מופיעה בקורפוס כתוביות. למספר היחידה יש **100% כיסוי**.
 *
 * ⚠ מה שאבד במעבר: רזולוציה. עשר יחידות במקום 20,000 דרגות, ולכן אין מיון עדין
 *   *בתוך* רצועה. §4 בתוכנית מבקש "סדר קושי עולה בתוך סבב" — עם עשר מדרגות זה
 *   ניתן ברמת הרצועה ולא ברמת הפריט. זה מחיר אמיתי, והוא נאמר ולא מוסתר.
 */
const path = require('path');

/* data-en.js הוא נכס שלנו. הוא נטען לתוך window כמו בדפדפן. */
function load() {
  if (!global.window) global.window = {};
  if (!global.window.UNIT_DATA_EN) require(path.join(__dirname, '..', 'data-en.js'));
  return global.window.UNIT_DATA_EN;
}

/* מועתק מ-app.js:303. אותו נירמול, אחרת המפתחות לא נפגשים. */
function normEn(s) {
  return (s == null ? '' : String(s)).normalize('NFKC').toLowerCase()
    .trim().replace(/^(to|a|an|the)\s+/, '')
    .replace(/[-–—/|]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/* term → מספר יחידה. מילה שמופיעה בכמה יחידות נספרת ביחידה **הגבוהה** ביותר:
   הרצועה נקבעת לפי המסיח הקשה ביותר, ולכן גם כאן הקושי הוא המקסימום ולא הראשון.
 *
 * ⛔ באג שנתפס ב-10.8.2026, והוא שקט ומזיק
 * -----------------------------------------
 * הבנק מחזיק פעלים חריגים כ**צורות חלופיות מופרדות בפסיק או בלוכסן**:
 *   "fight, fought" · "know, knew" · "run, ran" · "saw, see" · "catch, caught" ·
 *   "freeze, froze" · "speak, spoke" · "think, thought" · "begin/an/un"
 * `normEn` מוחק את הפסיק ומשאיר מפתח אחד — `"fight fought"` — ולכן
 * `unitOf("fight")` החזיר **null**, כאילו המילה אינה בבנק כלל.
 *
 * ⚠ הנזק: כלל 2 בתדריך פוסל מסיח שאין לו יחידה, ולכן ~10 מהפעלים **השכיחים ביותר
 * באנגלית** נעלמו מבררת המסיחים — ודווקא ברצועת הבסיס, שכל הקושי בה הוא למצוא
 * ארבע מילים שכיחות. הכותב של מנה 1 נתקל בזה ודיווח; אומת כאן מול הבנק.
 *
 * התיקון: מפצלים את המונח **המקורי** על `,` ו-`/` ומרשמים כל צורה בנפרד.
 * ⚠ **לא מפצלים על רווח.** רווח מסמן צירוף אמיתי (`in other words`, `adjacent to`),
 * והמונח שם הוא הצירוף כולו. פיצול על רווח היה ממפה את `word` ליחידה של
 * `in other words` — כלומר ממציא ערך שאינו בבנק.
 * ומסננים חלקים מתחת ל-3 תווים, כדי ש-`begin/an/un` לא יכניס `an` ו-`un`.
 */
let MAP = null;
function unitMap() {
  if (MAP) return MAP;
  const D = load();
  MAP = new Map();
  const put = (k, n) => { if (k) MAP.set(k, Math.max(MAP.get(k) || 0, n)); };
  for (const u of Object.keys(D)) {
    const n = parseInt(u, 10);
    if (!Number.isFinite(n)) continue;
    for (const entry of D[u]) {
      const raw = String(entry[0]);
      put(normEn(raw), n);                       // המונח כפי שהוא — תמיד
      const parts = raw.split(/[,/]/).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) for (const p of parts) {
        const k = normEn(p);
        if (k.length >= 3 && !k.includes(' ')) put(k, n);
      }
    }
  }
  return MAP;
}

const unitOf = w => { const v = unitMap().get(normEn(w)); return typeof v === 'number' ? v : null; };

/* סורק טקסט חופשי ומחזיר את היחידות שנמצאו בו, **בהתאמת הצירוף הארוך ביותר**.
 *
 * ⛔ הבאג שזה מתקן (10.8.2026), והוא אותה מחלה כמו באג הפסיקים: החיפוש לא תאם את
 * הדרך שבה הבנק מאחסן. בדיקת מילות הנשיאה פירקה את המשפט למילים בודדות, ולכן:
 *     "even though"  הוא ערך **יחידה 2** בבנק  →  התפרק ל-even=4 + though=4
 *     "in addition"  הוא ערך יחידה 4          →  התפרק ל-addition=5
 * התוצאה: הכלל החדש לרצועת הבסיס פסל כמעט כל מילת קישור שהתדריך עצמו מבקש
 * (`even so`, `moreover`, `unless`, `however`), והכותב נחסם מלכתוב פריט בסיסי תקין.
 *
 * חלון של עד 3 מילים, ארוך לפני קצר. מילה שנבלעה בצירוף אינה נבדקת שוב לבד —
 * זו כל הנקודה: הבנק דירג את הצירוף, ולא את רכיביו. */
/* ⭐ הומוגרפים שהבנק מדרג לפי **המובן הנדיר**, ולכן חוסמים את המובן השכיח במילות נשיאה.
 * ארבעתם אומתו מול הבנק ב-10.8, וסדר הפירוש מוכיח שהמובן הנדיר הוא הנלמד:
 *     wind  · יחידה 9  · "למתוח; רוח"                ← "למתוח" ראשון
 *     saw   · יחידה 9  · "מסור"                       (ו-"saw, see" ביחידה 1)
 *     keep  · יחידה 10 · "לשמור; חלק מהמצודה"
 *     well  · יחידה 10 · "באר; טוב, היטב; בריא"
 *
 * ⚠ ההחרגה חלה **על בדיקת מילות הנשיאה בלבד**, ולא על גזירת הרצועה מהמסיחים.
 * ההבדל מהותי: מסיח נבחן, ולכן שם המובן הנדיר הוא בדיוק העניין ו-`wind` הוא באמת
 * חומר אקדמי. מילת נשיאה אינה נבחנת — היא רק צריכה להיות מובנת, ומשפט בסיסי
 * שכותב "the wind broke the roof" משתמש במובן של יחידה 1.
 *
 * ⛔ זו רשימה מפורשת ולא היוריסטיקה, כי הכללה אוטומטית ("מילה קצרה ושכיחה") היא
 * בדיוק סוג הקירוב שכבר טעה כאן פעמיים. כל תוספת דורשת אימות מול הפירוש בבנק.
 * נתפס ע"י כותב רצועת הבסיס: `wind` ביחידה 9 הפך את מזג האוויר לבלתי-כתיב שם.
 * וכותב הבסיס השני הוסיף:
 *     fast  · יחידה 9  · "צום; מהיר"                 ← "צום" ראשון
 */
const CARRIER_EXEMPT = new Set(['wind', 'saw', 'keep', 'well', 'fast']);

const MAXW = 3;
function scanUnits(text, { exempt = false } = {}) {
  const words = String(text || '').split(/[^A-Za-z']+/).filter(Boolean);
  const map = unitMap(), hits = [];
  for (let i = 0; i < words.length;) {
    let matched = 0;
    for (let n = Math.min(MAXW, words.length - i); n >= 1; n--) {
      const k = normEn(words.slice(i, i + n).join(' '));
      const v = map.get(k);
      if (typeof v === 'number') {
        if (!(exempt && CARRIER_EXEMPT.has(k))) hits.push({ term: k, unit: v, n });
        matched = n; break;
      }
    }
    i += matched || 1;
  }
  return hits;
}
/* exempt:true — מילות הנשיאה בלבד. ראה CARRIER_EXEMPT מעל. */
const carrierMaxOf = text => {
  const h = scanUnits(text, { exempt: true });
  return h.length ? h.reduce((a, x) => (x.unit > a.unit ? x : a)) : null;
};

/* עשר יחידות → ארבע רצועות. הגבולות נבחרו לפי חציוני הדירוג שמעל, כדי שהמעבר
   מ-EN_RANK לא יזיז את הרצועות: 1–2 ≈ עד 2,000 · 3–5 ≈ עד 5,000 · 6–8 ≈ עד 10,000. */
const BANDS = [
  { name: 'בסיס', lo: 1, hi: 2 },
  { name: 'בינוני', lo: 3, hi: 5 },
  { name: 'מתקדם', lo: 6, hi: 8 },
  { name: 'אקדמי', lo: 9, hi: 10 },
];
const bandOfUnit = u => (BANDS.find(b => u >= b.lo && u <= b.hi) || { name: '?' }).name;
const bandIdx = name => BANDS.findIndex(b => b.name === name);

module.exports = { normEn, unitOf, unitMap, bandOfUnit, bandIdx, BANDS, scanUnits, carrierMaxOf };
