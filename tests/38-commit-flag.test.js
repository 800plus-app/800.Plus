'use strict';
/* התשובות שנענו אחרי הפרעה · ולמה הן נזרקו.
 *
 * מה שנמצא
 * --------
 * `committed` מקבל true בשני מקומות (commitSession), ומתאפס ל-false במקום אחד בלבד:
 * תחילת סבב חדש. אין שום מקום שמחזיר אותו ל-false כשהלומד עונה על עוד מילה.
 *
 * שבעה אתרי קומיט שואלים `if(!committed && session.size>0)` · היציאה מהסבב, pagehide,
 * visibilitychange, כפתור הבית, מעבר שפה והתנתקות. אחרי ההפרעה הראשונה · נעילת מסך,
 * התראה שקפצה, מעבר לאפליקציה אחרת · כולם מדלגים.
 *
 * התוצאה, בצעדים: פותחים סבב של 20, עונים 3, המסך ננעל (commitSession רץ, committed=true),
 * חוזרים ועונים עוד 7, לוחצים "✕ יציאה". שבע התשובות האחרונות אינן נשמרות.
 *
 * ההערה שמעל commitSession מתארת בדיוק את התרחיש הזה ומכריזה שהוא נסגר · "answering more
 * words makes it a new state". אף אחד לא סימן את המצב החדש. מה שנבנה בפועל היה
 * committedKeys, שמגן מפני קומיט כפול של אותה מילה · הגנה נכונה, אבל על בעיה אחרת.
 *
 * התיקון
 * ------
 * הדגל מסומן false ברגע שנכנסת עבודה חדשה ל-session. זהו בדיוק המשמעות שההערה מייחסת לו,
 * והוא בטוח כי commitSession כבר idempotent דרך committedKeys: קריאה נוספת על מילה שנשמרה
 * אינה מוסיפה לה דבר.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');

const app = appSource();

/* מימוש מקביל למשמעות הדגל. commitSession נוגעת ב-Store, ב-LS וב-DOM ואינה ניתנת להרמה,
   ולכן הכלל נבדק כאן על מודל, והבדיקות בסוף מוודאות שהכלל אכן כתוב ב-app.js. */
function model() {
  return {
    session: new Map(), committedKeys: new Set(), committed: false, saved: [],
    answer(k) { this.session.set(k, k); this.committed = false; },   // ← התיקון
    commit(guarded) {
      if (guarded && (this.committed || !this.session.size)) return;
      for (const k of this.session.keys())
        if (!this.committedKeys.has(k)) { this.committedKeys.add(k); this.saved.push(k); }
      this.committed = true;
    },
  };
}

describe('סבב שהופרע באמצע', () => {

  test('תשובות שנענו אחרי ההפרעה נשמרות', () => {
    const m = model();
    ['a', 'b', 'c'].forEach(k => m.answer(k));
    m.commit(true);                        // נעילת מסך · visibilitychange
    ['d', 'e', 'f', 'g'].forEach(k => m.answer(k));
    m.commit(true);                        // "✕ יציאה"
    assert.deepStrictEqual(m.saved, ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      'התשובות שאחרי ההפרעה נזרקו — זה הבאג');
  });

  test('שתי הפרעות ברצף אינן מצטברות לאובדן', () => {
    const m = model();
    m.answer('a'); m.commit(true);
    m.answer('b'); m.commit(true);
    m.answer('c'); m.commit(true);
    assert.deepStrictEqual(m.saved, ['a', 'b', 'c']);
  });

  test('מילה שנשמרה אינה נשמרת פעמיים', () => {
    /* הצד השני: הדגל אינו תחליף ל-committedKeys. בלי הבידוק הזה תיקון הדגל היה מכפיל
       את הספירה לכל מילה בכל הפרעה · הלומד היה מקבל קרדיט על אותה תשובה חמש פעמים. */
    const m = model();
    m.answer('a'); m.commit(true); m.commit(true); m.commit(true);
    assert.deepStrictEqual(m.saved, ['a']);
  });

  test('קומיט על סבב ריק אינו עושה דבר', () => {
    const m = model();
    m.commit(true);
    assert.deepStrictEqual(m.saved, []);
  });
});

describe('הכלל כתוב ב-app.js', () => {

  test('committed מתאפס כשנכנסת עבודה חדשה ל-session', () => {
    const at = app.indexOf('function sess(');
    assert.ok(at > 0, 'sess נעלמה');
    /* עד סוף השורה. sess היא פונקציה בת שורה אחת, ולכן כל חלון רחב יותר גולש לפונקציה
       הבאה · startRound מכיל committed=false, ושתי גרסאות קודמות של הבדיקה הזאת עברו
       בירוק אחרי שהסרתי את התיקון מ-sess. מדדתי את זה: הסרתי, והבדיקה לא נפלה. */
    const body = app.slice(at, app.indexOf('\n', at));
    assert.ok(/committed\s*=\s*false/.test(body),
      'הדגל אינו מתאפס כשנכנסת מילה חדשה — כל מה שנענה אחרי הפרעה ייזרק');
  });

  test('שומרי ה-!committed עדיין שם · הדגל הוא אופטימיזציה, לא ההגנה', () => {
    /* אם מישהו "יתקן" את זה בהסרת השומרים, כל מעבר מסך יכתוב לדיסק ויסנכרן לענן. */
    const n = (app.match(/!committed\s*&&\s*session\.size>0/g) || []).length;
    assert.ok(n >= 5, `נמצאו ${n} שומרים בלבד — צפויים לפחות 5`);
  });

  test('commitSession עדיין מסננת לפי committedKeys', () => {
    const at = app.indexOf('function commitSession');
    const body = app.slice(at, at + 500);
    assert.ok(/committedKeys\.has\(k\)/.test(body),
      'ההגנה מפני קומיט כפול נעלמה — מילה תיספר שוב בכל הפרעה');
  });
});

describe('תשובה ריקה', () => {
  test('check מסרבת לרשום תשובה על שדה ריק', () => {
    /* Enter מוחזק לחוץ: ההקשה הראשונה עונה, השנייה מגיעה ל-#nextBtn שקיבל פוקוס ועוברת
       לכרטיס הבא, והשלישית נוחתת על #answerInput שהוחזר לו פוקוס אחרי 30ms · ומסמנת את
       הכרטיס כשגוי בלי שהלומד ראה אותו. isCorrect('') מחזיר false, ואין שום שער לפניו. */
    const at = app.indexOf('function check()');
    assert.ok(at > 0, 'check נעלמה');
    const body = app.slice(at, at + 900);
    /* מכסה את שלוש הצורות הסבירות של אותו שער · `!v`, `!v.trim()`, `!String(v).trim()` · 
       ולא נעול על מימוש אחד, כי מה שנבדק כאן הוא הכלל ולא הניסוח שלו. */
    assert.ok(/!\s*(String\(\s*v\s*\)|v)\s*(\.trim\(\))?\s*\)\s*return/.test(body),
      'אין שער על שדה ריק — החזקת Enter תסמן חצי מהחפיסה כשגויה');
  });
});
