'use strict';
/* מקור שהוחרג משפטית אינו נמצא במאגר שנשלח ללומדים.
 *
 * מה נמדד ב-30.8.2026
 * --------------------
 * מדידה ישירה על **המאגר הנשלח בפועל** — 41,324 מחרוזות תוכן בתשעה קובצי
 * מאגר, ועוד 20 קבצים שהדפדפן מוריד — החזירה **אפס** לכל אחד משמונת המקורות
 * של כלל א5. ⭐ **זו הראיה**, ולא דוח קודם.
 *
 * ⚠ **הרקע, כי הוא משנה איך קוראים את הבדיקה הזאת.** דוח סטטיסטי קודם טען
 * ששלושה מקורות שהוחרגו «חזרו למאגר». הטענה **נמשכה בחזרה על ידי מי שכתב
 * אותה**: הכלי שהפיק אותה אינו יודע להפריד מקור שתרם ממקור שלא, ושורת הבקרה
 * שלו — מקור שידוע שתרם — הגיעה ל-2.49% בלבד, פי 4.1 מרף הרעש, בזמן שהחוק
 * בכלי עצמו דורש פי 10. ⛔ ולכן הבדיקה כאן אינה «מאשרת רגרסיה» ואינה מניחה
 * שהייתה כזאת. היא מודדת ישירות, ומקבעת את התוצאה.
 *
 * למה זה שער ולא מדידה חד-פעמית
 * ------------------------------
 * החשיפה המשפטית היא הכלל שקודם לכל שיקול אחר ב-`CLAUDE.md`, והמאגר נוצר
 * אוטומטית מצינור. מדידה שרצה פעם אחת מוכיחה על הרגע שבו רצה; שער רץ בכל
 * קומיט. ⭐ והוא מכוון לרגע הנכון — **לפני** שתוכן נכנס למאגר ציבורי, כי
 * חומר שנכנס לשם אי אפשר לבטל.
 *
 * ⛔ ומה השער הזה **אינו** טוען: העתקה בלי ייחוס אינה נתפסת כאן. הרשימה
 * המלאה של מה שהוא מפספס נמצאת בתחתית `units_output/check_sources.js`, ויש
 * לקרוא אותה לפני שמסתמכים על ירוק כאן.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const G = require('../units_output/check_sources.js');
const { SOURCES, BANK, SHIPPED, ROOT } = G;

describe('מקורות אסורים · המאגר הנשלח ללומדים', () => {

  /* ── קודם כול: שהשער בכלל קורא משהו ──────────────────────────────────
     שער שסורק רשימה ריקה מחזיר «אפס פגיעות» וזה חסר ערך. */

  test('כל קובץ שנשלח לדפדפן קיים ואינו ריק — אחרת השער סורק על ריק', () => {
    const bad = [];
    for (const f of SHIPPED) {
      const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) { bad.push(`${f} לא נמצא`); continue; }
      if (fs.statSync(p).size < 100) bad.push(`${f} ריק מדי (${fs.statSync(p).size} בתים)`);
    }
    assert.deepStrictEqual(bad, [], 'עדכן את SHIPPED ב-units_output/check_sources.js:\n' + bad.join('\n'));
  });

  test('כל קובץ מאגר נטען ומייצר את הגלובל שלו', () => {
    const loaded = G.loadBank();
    assert.strictEqual(loaded.length, BANK.length);
    for (const b of loaded) {
      assert.ok(b.data && typeof b.data === 'object', `${b.file}: ${b.global} אינו אובייקט`);
      assert.ok(Object.keys(b.data).length > 0, `${b.file}: ${b.global} ריק`);
    }
  });

  test('הסריקה עוברת על עשרות אלפי מחרוזות — לא על אוסף ריק', () => {
    const { strings } = G.scanContent();
    assert.ok(strings > 30000,
      `נסרקו ${strings} מחרוזות בלבד. נמדדו 41,324 ב-30.8.2026 — ירידה חדה ` +
      `אומרת שהמאגר לא נטען, ולא שהוא נקי.`);
  });

  /* ── המדידה עצמה ─────────────────────────────────────────────────────── */

  for (const s of SOURCES) {
    test(`${s.name} — אינו מופיע בתוכן שהלומד רואה`, () => {
      const { hits } = G.scanContent();
      const mine = hits.filter(h => h.source === s.name)
        .map(h => `${h.file} · ${h.where}\n    /${h.pattern}/  ←  ${h.text}`);
      assert.deepStrictEqual(mine, [],
        `«${s.name}» הוא מקור אסור לפי כלל א5 ב-CLAUDE.md, והוא נמצא בתוכן שנשלח.\n` +
        `⛔ אל תסיר את התוכן ביד — קובצי המאגר נוצרים אוטומטית. אתר את הצינור ` +
        `שהכניס אותו ותקן שם.\n` + mine.join('\n'));
    });
  }

  test('אף קובץ שנשלח לדפדפן אינו מכיל כתובת של מקור אסור', () => {
    const { hits } = G.scanDomains();
    const lines = hits.map(h => `[${h.source}] ${h.file}:${h.line}  /${h.pattern}/  ←  ${h.text}`);
    assert.deepStrictEqual(lines, [],
      'כתובת של מקור אסור נשלחת לדפדפן. זה נכון גם בתוך הערה — ' +
      'ההצהרות בפרויקט מזכירות מקורות בשם, לא בכתובת.\n' + lines.join('\n'));
  });

  /* ── שיניים · שער ירוק שלא נראה אדום אינו שער ────────────────────────── */

  test('הבקרה · כל תבנית מקור באמת יורה על מחרוזת שאמורה להיפסל', () => {
    assert.deepStrictEqual(G.selftest(), []);
  });

  test('הבקרה · שתילה במאגר סינתטי נתפסת דרך אותו מסלול קוד שרץ על האמיתי', () => {
    for (const s of SOURCES) {
      const planted = [{
        file: 'שתילה.js', global: 'PLANTED',
        data: { 'מילה': { פירוש: 'תקין לגמרי', מקור: s.probe } },
      }];
      const { hits } = G.scanContent(planted);
      const mine = hits.filter(h => h.source === s.name);
      assert.strictEqual(mine.length, 1,
        `שתילה של «${s.name}» לא נתפסה — השער חסר שיניים עבור המקור הזה`);
      assert.match(mine[0].where, /PLANTED/);
    }
  });

  test('הבקרה · שתילה ב**מפתח** נתפסת, לא רק בערך', () => {
    const planted = [{ file: 'שתילה.js', global: 'PLANTED', data: { 'copied from Quizlet': 'x' } }];
    const { hits } = G.scanContent(planted);
    assert.strictEqual(hits.filter(h => h.source === 'Quizlet').length, 1,
      'מפתח אינו נסרק — מילת המאגר עצמה היא מפתח, ולכן זו נקודה עיוורת אמיתית');
  });

  /* ── והצד השני של השיניים: שהשער שותק על תוכן לגיטימי ─────────────────
     ⚠ הפגיעות השקריות אינן היפותטיות. מדידה רחבה ב-30.8.2026 החזירה 38
     שורות, **כולן שקריות**, ואלה השורות עצמן מהמאגר. שער שיורה עליהן היה
     מסמן פירוש אמיתי כהפרה משפטית. */

  test('הבקרה ההפוכה · מילים עבריות אמיתיות שמתנגשות בשמות מותג אינן מסומנות', () => {
    const real = [
      ['כידון המחובר לחבל ומשמש לציד ימי', 'רומח — לא מותג חומרי הכנה'],
      ['קידום; מבצע', 'promotion'],
      ['עכברוש', '«ברוש» כתת-מחרוזת'],
      ['עלה ארוך וצר של אורן או ברוש', 'עץ'],
      ['ההישגים האקדמיים שלו השתפרו', '«הישגים» כתת-מחרוזת'],
      ['מאגרים שמחוץ לגבולות המדינה', 'databases'],
      ['Prospective students can tour the campus on Saturday', 'המילה campus'],
      ['הוא ביקש קידום בעבודה שלו', 'promotion'],
    ];
    const planted = real.map((r, i) => ({
      file: `לגיטימי-${i}.js`, global: `OK${i}`, data: { [`k${i}`]: r[0] },
    }));
    const { hits } = G.scanContent(planted);
    const lines = hits.map(h => `${h.text}  ←  /${h.pattern}/ (${h.source})`);
    assert.deepStrictEqual(lines, [],
      'השער יורה על אוצר מילים אמיתי. תבנית שמסמנת פירוש לגיטימי כהפרה משפטית ' +
      'גרועה מאי-בדיקה — היא שולחת אותנו למחוק תוכן תקין.\n' + lines.join('\n'));
  });

  test('הבקרה ההפוכה · הצהרת «אפס שימוש» בהערת קוד אינה נספרת כהפרה', () => {
    /* קובצי המאגר נושאים כותרת שמזכירה את המקורות האסורים בשלילה. סריקת טקסט
       גולמי הייתה נופלת עליה — ולכן שכבת התוכן סורקת מבנה מפוענח, לא טקסט. */
    const f = 'sentence-completion/sent-lex.js';
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, /אפס שימוש/, 'ההצהרה נעלמה מהקובץ — עדכן את הבדיקה הזאת');

    /* ‏1 · הטקסט הגולמי באמת מזכיר מקורות אסורים בשמם, ולכן סריקה גולמית
       **הייתה** נופלת כאן. בלי הקביעה הזאת הבדיקה מוכיחה רק שהקובץ נקי. */
    const quizlet = SOURCES.find(s => s.name === 'Quizlet');
    assert.ok(G.union(quizlet.content).test(src),
      'הטקסט הגולמי כבר אינו מזכיר מקור אסור — הבדיקה הזאת אינה מוכיחה עוד כלום');

    /* ‏2 · והתוכן המפוענח של אותו קובץ עצמו נקי. */
    const only = G.loadBank().filter(b => b.file === f);
    assert.strictEqual(only.length, 1, `${f} אינו ב-BANK`);
    const lines = G.scanContent(only).hits.map(h => `${h.source} ← ${h.text}`);
    assert.deepStrictEqual(lines, [],
      'ההערה נספרה כהפרה — שכבת התוכן קוראת טקסט גולמי בטעות\n' + lines.join('\n'));
  });
});
