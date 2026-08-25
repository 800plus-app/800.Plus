'use strict';
/* enrank.js — דירוגי התדירות שמזינים את מבחן הרמה.
 *
 * למה הקובץ הזה קיים
 * -------------------
 * 3,175 דירוגים שנטענים ב-index.html בכל עלייה, ואין עליהם **אף בדיקה**.
 * `lvRankOf` לא הייתה ניתנת לבדיקה כלל עד 11.8.2026 — היא לא הייתה ב-SYMBOLS,
 * ו-`enrank.js` לא נטען לארגז החול. שניהם תוקנו כדי שהקובץ הזה יוכל להתקיים.
 *
 * מה תלוי בזה
 * ------------
 * `lvCountKnown` ובחירת המסיחים במבחן הרמה עושות `if(!(r && r<=cut)) continue;`
 * — כלומר ערך **בלי דירוג פשוט נעלם מהמאגר** של המבחן, בשקט ובלי שגיאה.
 * דירוג פגום או חסר אינו מפיל כלום; הוא מעוות את המבחן בלי להשאיר עקבות.
 *
 * ⚠ הדאטה עצמו נסרק ב-11.8.2026 ונמצא **נקי**: 3,175 ערכים, כל הדירוגים שלמים
 * בטווח 8–19987, כל המפתחות מנורמלים, אפס מפתחות ריקים. הבדיקות כאן מקבעות
 * את זה. הממצא היחיד הוא אי-התאמת הנרמול, ומסומן ⭐.
 *
 * הערת רישוי (CLAUDE.md)
 * -----------------------
 * העמדה של הפרויקט נשענת על כך שה**בחירה** אילו מילים לדרג היא שלנו ונגזרה
 * מ-data-en.js, ומ-FrequencyWords נלקחו המספרים בלבד. בדיקת ה"יתומים" למטה
 * שומרת על הסדר הזה: מפתח ב-enrank שאין לו ערך ב-data-en.js הוא סימן שהרשימה
 * החיצונית התחילה לבחור מה נכנס — וזה שימוש אחר לגמרי. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, banks, expectNone } = require('./_harness/sandbox.js');

const ctx = loadApp({ lang: 'en' });
const RANK = banks().rank;
const KEYS = Object.keys(RANK || {});

/* אותה כיווץ שמפתחות enrank עברו: רווחים ומקפים מוסרים. */
const squash = s => String(s).replace(/[\s-]/g, '');

/* כל הערכים ב-data-en.js, במפתח שבו lvRankOf מחפש. */
function bankTerms() {
  const en = banks().en, out = new Set();
  for (const unit of Object.keys(en)) for (const pair of en[unit]) out.add(ctx.normEn(pair[0]));
  return out;
}

describe('enrank.js — צורת הדאטה', () => {
  test('נטען, ואינו ריק', () => {
    assert.ok(RANK && typeof RANK === 'object', 'window.EN_RANK לא הוגדר');
    assert.ok(KEYS.length > 3000, `רק ${KEYS.length} דירוגים — הקובץ נחתך?`);
  });

  test('כל דירוג הוא מספר שלם חיובי', () => {
    const bad = KEYS.filter(k => {
      const v = RANK[k];
      return typeof v !== 'number' || !Number.isInteger(v) || v < 1;
    }).map(k => `${k} = ${JSON.stringify(RANK[k])}`);
    expectNone(assert, bad, 'דירוגים שאינם מספר שלם חיובי — lvRankOf משווה אותם ל-cut');
  });

  test('הדירוגים בתוך התקרה המוצהרת (20k)', () => {
    /* הכותרת בקובץ אומרת "capped at 20k". דירוג מעליה הוא סימן שהבנייה
       שינתה מקור או תקרה בלי שההערה עודכנה. */
    const over = KEYS.filter(k => RANK[k] > 20000).map(k => `${k} = ${RANK[k]}`);
    expectNone(assert, over, 'דירוג מעל התקרה שהקובץ מצהיר עליה');
  });

  test('המפתחות מנורמלים ואינם ריקים', () => {
    const bad = KEYS.filter(k => !k || k !== k.toLowerCase().trim());
    expectNone(assert, bad, 'מפתחות שאינם באותיות קטנות/גזומים — lvRankOf לעולם לא ימצא אותם');
  });
});

describe('lvRankOf — החיפוש עצמו', () => {
  test('מוצא ערך שקיים במפה', () => {
    const k = KEYS[0];
    assert.strictEqual(ctx.lvRankOf(k), RANK[k]);
  });

  test('מילה שאינה במפה אינה מחזירה דירוג', () => {
    assert.ok(!ctx.lvRankOf('zzz-not-a-real-word'),
      'ערך שאינו במפה חייב להיות falsy — הקוראים עושים if(!(r && r<=cut))');
  });

  test('⭐ ערך שיש לו דירוג במפה — נמצא, גם כשהנרמול נכתב אחרת', () => {
    /* ממצא 11.8.2026. מפתחות enrank.js נבנו עם רווחים ומקפים **מוסרים**
       (`povertystricken`), ואילו normEn הופך מקף לרווח ומשאיר אותו
       (`poverty stricken`). שש רשומות נופלות בין הכיסאות:
         begin an un · best seller · self confidence
         department store · old fashioned · poverty stricken
       ל-lvRankOf הן מחזירות undefined, ולכן `if(!(r && r<=cut)) continue`
       מדלג עליהן — הן לעולם אינן מופיעות כמסיחות במבחן הרמה, ואינן נספרות
       ב-lvCountKnown. בשקט מוחלט.

       הבדיקה מנוסחת על הדאטה ולא על רשימה קשיחה של שש: כל ערך שהמפה מכירה
       בצורתו המכווצת חייב להימצא. כך היא תופסת גם את המקרה השביעי. */
    const missed = [];
    for (const term of bankTerms()) {
      if (ctx.lvRankOf(term)) continue;
      const sq = squash(term);
      if (sq !== term && RANK[sq] != null) missed.push(`${term} → enrank has "${sq}" = ${RANK[sq]}`);
    }
    expectNone(assert, missed,
      'ערכים שיש להם דירוג ב-enrank אבל lvRankOf אינו מוצא אותם — הם נעלמים ממבחן הרמה');
  });
});

describe('enrank מול data-en.js — הסדר שהרישוי נשען עליו', () => {
  test('אין מפתח ב-enrank שאין לו ערך ב-data-en.js', () => {
    /* CLAUDE.md: "בוחרים את המילה כי אנחנו צריכים אותה → ואז מחפשים לה דירוג.
       אם הרשימה החיצונית בוחרת אילו מילים ייכנסו, היא הופכת למקור שממנו נגזר
       התוכן, וזה שימוש אחר לגמרי."
       יתום — מפתח שקיים רק ב-enrank — הוא בדיוק הסימן להיפוך הסדר הזה.
       ⚠ שש הרשומות שנמצאו ב-11.8 אינן היפוך סדר אלא אותה אי-התאמת נרמול
       שלמעלה; לכן ההשוואה כאן נעשית על הצורה המכווצת משני הצדדים. */
    const terms = bankTerms();
    const squashed = new Set([...terms].map(squash));
    const orphans = KEYS.filter(k => !terms.has(k) && !squashed.has(squash(k)));
    expectNone(assert, orphans,
      'מפתחות שקיימים ב-enrank.js ואין להם ערך ב-data-en.js');
  });

  test('הכיסוי לא צנח — רוב המאגר עדיין מדורג', () => {
    /* 3,175 מתוך 3,946 (80%) נכון ל-11.8.2026. הפער לגיטימי: לא לכל ערך יש
       דירוג בקורפוס מתחת לתקרה. הבדיקה שומרת מפני צניחה, לא דורשת 100%. */
    const terms = bankTerms();
    let ranked = 0;
    for (const t of terms) if (ctx.lvRankOf(t)) ranked++;
    const pct = Math.round(100 * ranked / terms.size);
    assert.ok(pct >= 75,
      `רק ${pct}% מהערכים מדורגים (${ranked}/${terms.size}) — מבחן הרמה מאבד מאגר`);
  });
});
