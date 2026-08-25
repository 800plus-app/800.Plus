'use strict';
/* "אחורה" יורד שלב אחד בכל לחיצה, ולעולם אינו נבלע.
 *
 * מה היה
 * ------
 * הגרסה הראשונה דחפה רשומת היסטוריה אחת (hwDeep) בכניסה ל-quiz/exam בלבד. היא מנעה את
 * הכשל החמור · האפליקציה נסגרת באמצע סבב · אבל השאירה שארית: יציאה מסבב דרך ✕ לא צרכה
 * את הרשומה, ולכן לחיצת "אחורה" הבאה במסך היחידה נבלעה בלי שקרה כלום. נמדד בדפדפן:
 * אחרי ✕, `history.state.hwDeep` נשאר true והמסך לא השתנה בלחיצה.
 *
 * המודל
 * ------
 * לכל מסך עומק. כניסה למסך עמוק יותר דוחפת רשומה; מעבר לאותו עומק או רדוד יותר מחליף
 * אותה. כפתור "חזרה" שבתוך האפליקציה קורא ל-goBack, שצורך את הרשומה במקום להשאירה · 
 * וכך "אחורה" של המערכת ו"חזרה" של האפליקציה הם אותה פעולה בדיוק, ולא שני מסלולים
 * שנפרדים. ברמה 0 "אחורה" יוצא מהאפליקציה, כמצופה באנדרואיד.
 *
 * navPop הוא מה שמונע לולאה: בזמן טיפול ב-popstate הדפדפן כבר הזיז את ההיסטוריה, ו-goto
 * אסור שייגע בה שוב.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();

describe('מודל הניווט', () => {

  test('לכל מסך מוגדר עומק', () => {
    const m = app.match(/const\s+NAV_DEPTH\s*=\s*\{([\s\S]*?)\}/);
    assert.ok(m, 'NAV_DEPTH לא נמצא');
    const listed = [...m[1].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
    const screens = (app.match(/const\s+SCREENS=\[([^\]]*)\]/) || [])[1]
      .split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    const missing = screens.filter(s => !listed.includes(s));
    assert.deepStrictEqual(missing, [],
      'מסכים בלי עומק מוגדר -- "אחורה" מהם יתנהג כמו מסך שורש: ' + missing.join(', '));
  });

  test('הסבב עמוק ממסך היחידה, ומסך היחידה עמוק מהבית', () => {
    const m = app.match(/const\s+NAV_DEPTH\s*=\s*\{([\s\S]*?)\}/)[1];
    const d = k => Number((m.match(new RegExp(k + '\\s*:\\s*(\\d+)')) || [])[1]);
    assert.strictEqual(d('home'), 0, 'הבית אינו שורש -- "אחורה" ממנו לא יצא מהאפליקציה');
    assert.ok(d('scope') > d('home'), 'מסך היחידה אינו עמוק מהבית');
    assert.ok(d('quiz') > d('scope'), 'הסבב אינו עמוק ממסך היחידה');
    assert.ok(d('exam') > d('scope'), 'המבחן אינו עמוק ממסך היחידה');
  });

  test('goto דוחף רק כשיורדים פנימה, ומחליף אחרת', () => {
    const at = app.indexOf('function goto');
    const body = app.slice(at, at + 1100);
    assert.ok(/navDepth\(id\)\s*>\s*navDepth\(/.test(body),
      'goto אינו משווה עומקים -- כל מעבר מסך יבנה תור היסטוריה');
    assert.ok(/pushState/.test(body) && /replaceState/.test(body),
      'goto חייב גם לדחוף וגם להחליף');
  });

  test('goto אינו נוגע בהיסטוריה בזמן טיפול ב-popstate', () => {
    const at = app.indexOf('function goto');
    const body = app.slice(at, at + 1100);
    assert.ok(/if\s*\(\s*!\s*navPop\s*\)/.test(body),
      'בלי navPop, טיפול ב-popstate ידחוף רשומה חדשה ויצור לולאה');
  });

  test('goBack צורך את הרשומה במקום להשאיר אותה', () => {
    const at = app.indexOf('function goBack');
    assert.ok(at > 0, 'goBack לא קיימת');
    const body = app.slice(at, at + 400);
    assert.ok(/history\.back\(\)/.test(body),
      'goBack אינו קורא ל-history.back -- הרשומה נשארת והלחיצה הבאה תיבלע');
  });

  test('כפתורי החזרה של הסבב, המבחן והסטטיסטיקה עוברים דרך goBack', () => {
    for (const id of ['quitQuiz', 'resBackBtn', 'resScope', 'exExit', 'exCancel', 'exDone', 'statsBack']) {
      /* דווקא ה-onclick: כמה מהמזהים האלה מופיעים קודם גם כ-textContent, וחלון מהמופע
         הראשון היה בודק את השורה הלא נכונה ונכשל על קוד תקין. */
      const at = app.indexOf(`$('#${id}').onclick`);
      assert.ok(at > 0, id + ' -- לא נמצא מאזין onclick');
      assert.ok(/goBack\(\)/.test(app.slice(at, at + 260)),
        id + ' אינו קורא ל-goBack -- הוא ישאיר רשומת היסטוריה תלויה');
    }
  });

  test('קיים מאזין popstate, והוא מנתב דרך navTo', () => {
    /* בלי המאזין אין מה שיקלוט את "אחורה" של המערכת, והאפליקציה נסגרת באמצע סבב · 
       הכשל המקורי שכל המודל הזה קיים בשבילו. */
    const at = app.search(/addEventListener\(\s*['"]popstate['"]/);
    assert.ok(at > 0, 'אין מאזין popstate');
    /* ⚠ כאן היה חלון של 300 תווים, והוא נשבר ב-11.8 על **קוד תקין**: הערה
       שנוספה בתוך המאזין דחפה את navTo אל מחוץ לחלון. זה בדיוק סוג הכשל
       ש-א2 של הסבב הזה מנה — חלון-קסם שמודד מרחק במקום מבנה.
       הגבול עכשיו הוא סוף המאזין עצמו. */
    const close = app.indexOf('\n});', at);
    assert.ok(close > at, 'לא נמצא סוף המאזין popstate');
    const body = app.slice(at, close);
    assert.ok(/navTo\(/.test(body), 'המאזין אינו מנתב דרך navTo');
    assert.ok(/navPop\s*=\s*true/.test(body) && /navPop\s*=\s*false/.test(body),
      'המאזין אינו מרים ומוריד את navPop -- goto ידחוף רשומה חדשה ויצור לולאה');
  });

  test('מונה הרשומות נשמר בתוך ההיסטוריה, לא נגזר מהעומק', () => {
    /* ⛔ נמצא בבדק בית 3. "→ בית" החליף את הרשומה העליונה במקום לצרוך את מה
       שנדחף, ולכן לחיצת "אחורה" הבאה נבלעה.
       התיקון הנאיבי — history.go(-navDepth(current)) — נפסל אחרי **מדידה
       בדפדפן**, לא בהשערה: מבית (עומק 0) אל סטטיסטיקה (עומק 2) נדחפת רשומה
       **אחת**, ו-navDepth היה מחזיר 2. כלומר go(-2) היה מדלג רשומה אחת יותר
       מדי ומוציא את המשתמש מהאפליקציה — כשל חמור בהרבה מהבאג המקורי.
       לכן המונה נשמר ברשומה עצמה. הוא שורד רענון, והוא נכון גם בקפיצה של
       שתי רמות בבת אחת. */
    assert.match(app, /history\.pushState\(\{\s*scr:\s*id,\s*n:\s*n\s*\+\s*1\s*\}/,
      'pushState אינו שומר מונה — אין דרך לדעת כמה רשומות לצרוך');
    assert.match(app, /history\.replaceState\(\{\s*scr:\s*id,\s*n\s*\}/,
      'replaceState אינו משמר את המונה — החלפה הייתה מאפסת אותו');
    const at = app.indexOf("querySelectorAll('[data-home]')");
    assert.ok(at > 0, 'לא נמצא מטפל data-home');
    const body = app.slice(at, app.indexOf('\n});', at));
    assert.ok(/history\.go\(-\s*n\s*\)/.test(body),
      '"→ בית" אינו צורך את הרשומות שנדחפו — לחיצת "אחורה" הבאה תיבלע');
    /* רק קוד חי, דרך codeMask. ההערה שמעל navN מצטטת את התיקון שנפסל בשמו —
       וזו בדיוק הסיבה שהיא שם. שער שסופר גם הערות היה אוסר לתעד למה משהו
       נפסל, כלומר מעניש את התיעוד הטוב. ⚠ סינון שורות לפי תחילית אינו מספיק:
       שורות ההמשך בהערת בלוק אינן מתחילות בכוכבית. */
    const { codeMask, codeMatches } = require('./_harness/scan.js');
    assert.strictEqual(codeMatches(app, /history\.go\(-\s*navDepth/, codeMask(app)).length, 0,
      'go(-navDepth) הוא התיקון שנפסל: עומק אינו מספר הרשומות, והוא מוציא מהאפליקציה');
    assert.ok(/setTimeout/.test(body),
      'אין רשת ביטחון: היסטוריה קצרה מהמונה לא מפעילה popstate, והכפתור ייראה מת');
  });

  test('navTo מחזיר למסך היחידה ולבית', () => {
    const at = app.indexOf('function navTo');
    const body = app.slice(at, at + 1400);
    assert.ok(/openScope\(/.test(body), 'navTo אינו יודע לחזור למסך היחידה');
    assert.ok(/renderHome\(\)/.test(body), 'navTo אינו יודע לחזור לבית');
  });

  test('הסבב שבאוויר נשמר בכל מסלול יציאה', () => {
    const at = app.indexOf('function navTo');
    assert.ok(at > 0, 'navTo לא קיימת');
    const body = app.slice(at, at + 1400);
    assert.ok(/commitSession\(\)/.test(body),
      'navTo אינו שומר את הסבב -- "אחורה" באמצע תרגול יאבד אותו');
  });
});
