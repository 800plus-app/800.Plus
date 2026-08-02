'use strict';
/* מחיקה מתוך סבב לא ביטלה את סימון השחזור, והמילה חזרה.
 *
 * הראיה
 * ------
 * markRestored (app.js:206) כותב רשומה קבועה ב-hw_undeleted, ו-mergeProgress מסנן בדיוק
 * את המפתחות האלה מרשימת המחוקים. זה נכון וזה מכוון: מי ששחזר מילה במפורש לא רוצה שמכשיר
 * אחר, עם רשימת מחיקות ישנה, ימחק אותה שוב.
 *
 * המשמעות היא ש-hw_undeleted חייב להתנקות ברגע שהמילה נמחקת מחדש — אחרת "נמחק" ו"שוחזר"
 * נכונים שניהם בו-זמנית, והמיזוג בוחר בשחזור. מחיקה בכמות עשתה את זה. deleteWord, הכפתור
 * שבתוך הסבב, לא.
 *
 * התסריט המלא, ושלושתם קרו למשתמש אחד
 * ------------------------------------
 *   1. מוחקים מילה · 2. משחזרים אותה דרך ניהול מילים · 3. מוחקים אותה שוב מתוך סבב
 *   → הסנכרון הבא מחזיר אותה, וגם את רשומת ההתקדמות שנמחקה איתה.
 *
 * זה לא נראה כתקלה אלא כמילה עקשנית, ולכן איש לא מדווח עליו.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, plain } = require('./_harness/sandbox.js');

/* הרמת deleteWord דורשת את שכבת האחסון: markDeletedAgain ו-markRestored כותבים
   ל-localStorage דרך LS. הארגז הבסיסי אינו טוען אותה, ולכן נבנית כאן קטנה ומספיקה. */
function withStorage() {
  const he = loadApp({ lang: 'he' });
  const disk = {};
  he.localStorage = {
    getItem: k => (k in disk ? disk[k] : null),
    setItem: (k, v) => { disk[k] = String(v); },
    removeItem: k => { delete disk[k]; },
  };
  he.LS = {
    get(k, d) { try { const v = he.localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { he.localStorage.setItem(k, JSON.stringify(v)); return true; },
    del(k) { he.localStorage.removeItem(k); },
  };
  he.KEY = n => n;
  return { he, disk };
}

const SYMS = ['undeletedKey', 'markRestored', 'markDeletedAgain', 'restoredMap', 'deleteWord'];

function lift(ctx) {
  const { appSource } = require('./_harness/sandbox.js');
  const { extractAll } = require('./_harness/extract.js');
  const vm = require('vm');
  for (const { name, code } of extractAll(appSource(), SYMS))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
}

describe('deleteWord מבטל את סימון השחזור', () => {

  test('מחיקה אחרי שחזור מנקה את hw_undeleted', () => {
    const { he } = withStorage();
    lift(he);
    const term = 'אִיחוּי';
    const k = he.K(term);

    he.markRestored(k);
    assert.ok(he.restoredMap()[k], 'ההכנה נכשלה — markRestored לא כתב דבר');

    he.deleteWord(term);

    assert.ok(!he.restoredMap()[k],
      'deleteWord השאיר את המילה מסומנת כמשוחזרת — mergeProgress יחזיר אותה בסנכרון הבא');
  });

  test('אותה התנהגות בדיוק כמו מחיקה בכמות', () => {
    /* שני מסלולי מחיקה שמתנהגים שונה הם באג שממתין: הראשון שיתוקן ישאיר את השני מאחור.
       הבדיקה משווה תוצאה מול תוצאה ולא קוד מול קוד. */
    const a = withStorage(); lift(a.he);
    const b = withStorage(); lift(b.he);
    const term = 'גַּנְזָךְ', k = a.he.K(term);

    a.he.markRestored(k); a.he.deleteWord(term);

    // מסלול הכמות, כפי שהוא כתוב ב-app.js
    b.he.markRestored(k);
    b.he.deleted.add(k); b.he.markDeletedAgain(k);
    delete b.he.assoc[k]; delete b.he.stats.words[k];

    assert.deepStrictEqual(plain(a.he.restoredMap()), plain(b.he.restoredMap()),
      'שני מסלולי המחיקה משאירים את hw_undeleted במצב שונה');
    assert.deepStrictEqual([...a.he.deleted], [...b.he.deleted],
      'שני מסלולי המחיקה משאירים רשימת מחוקים שונה');
  });

  test('מילה שנמחקת בלי שחזור קודם אינה נשברת', () => {
    /* markDeletedAgain על מפתח שאינו ברשימה חייב להיות no-op. אם הוא כותב מפתח ריק,
       הרשימה תופחת בכל מחיקה ותידחף לענן בכל סבב. */
    const { he } = withStorage();
    lift(he);
    he.deleteWord('מַזְלֵף');
    assert.deepStrictEqual(plain(he.restoredMap()), {},
      'מחיקה רגילה יצרה רשומה ב-hw_undeleted');
  });
});
