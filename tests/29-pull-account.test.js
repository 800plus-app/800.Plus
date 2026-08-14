'use strict';
/* יומן התרגול הוא התקדמות, וההתחברות דרסה אותו.
 *
 * הראיה
 * ------
 * pullAccountState ממלאת צד ריק מהענן. כל שדה נבדק שם ב-empty() · assoc, deleted, added,
 * dir · חוץ מאחד: `if(isObj(d.stats)) LS.set('hw_stats'+sk, d.stats)`, בלי תנאי.
 *
 * מה שהחזיק את זה הוא השומר שלמעלה, `if(hasProgressIn(lang)>0) continue`. אבל
 * hasProgressIn סופרת אך ורק מילים עם seen>0 · היא אינה יודעת דבר על stats.sessions.
 *
 * ולכן קיים מצב שבו יש יומן תרגול מלא והשומר מחזיר 0. הוא לא תיאורטי:
 * מחיקה בכמות (app.js: mDelete) מוחקת את stats.words ואינה נוגעת ב-sessions. מי שתרגל
 * יחידה ואז מחק את המילים שלה נשאר בדיוק כך.
 *
 * ההפסד הוא ימי התרגול והרצף · הדבר היחיד באפליקציה שנצבר לאורך חודשים ואי אפשר
 * לשחזר אותו בשום דרך.
 *
 * מה נבדק כאן
 * ------------
 * הכלל עצמו, על שלושת הענפים שלו, ולא רק המקרה שנשבר: יומן קיים → לא נוגעים · אין יומן
 * → ממלאים מהענן · אין ענן → לא מוחקים.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');

/* הכלל הועתק לכאן במכוון ולא הורם מ-app.js: הוא יושב בתוך לולאה בתוך פונקציית async
   שמדברת עם Supabase, ולא ניתן להרים אותו בלי לזייף את כל שכבת הרשת. מה שכן נבדק מול
   app.js הוא שהכלל שם עדיין זה · הבדיקה האחרונה בקובץ. */
function fillStats(local, remote) {
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const hasLog = isObj(local) && Array.isArray(local.sessions) && local.sessions.length > 0;
  return (isObj(remote) && !hasLog) ? remote : local;
}

const LOG = { words: {}, sessions: [{ t: 1754000000000, total: 10 }] };
const CLOUD = { words: { a: { seen: 3, level: 2 } }, sessions: [{ t: 1, total: 1 }] };

describe('התחברות אינה מוחקת יומן תרגול מקומי', () => {

  test('יומן בלי מילים · לא נדרס', () => {
    /* בדיוק המצב שמחיקה בכמות משאירה, והמצב שבו hasProgressIn מחזירה 0. */
    const out = fillStats(LOG, CLOUD);
    assert.deepStrictEqual(out, LOG,
      'היומן המקומי הוחלף בעותק מהענן — ימי התרגול והרצף אבדו');
  });

  test('גם יומן של יום אחד נחשב', () => {
    /* סף כלשהו ("לפחות שלושה ימים") היה מחזיר את אותו באג בקנה מידה קטן יותר. */
    const one = { words: {}, sessions: [{ t: 1754000000000, total: 4 }] };
    assert.deepStrictEqual(fillStats(one, CLOUD), one);
  });

  test('מכשיר חדש באמת · כן מתמלא מהענן', () => {
    /* הצד השני, וחשוב לא פחות: תיקון שמפסיק למלא הופך התחברות במכשיר חדש למסך ריק. */
    assert.deepStrictEqual(fillStats(null, CLOUD), CLOUD, 'מכשיר חדש לא קיבל את הענן');
    assert.deepStrictEqual(fillStats({ words: {}, sessions: [] }, CLOUD), CLOUD,
      'יומן ריק אינו יומן — היה צריך להתמלא');
    assert.deepStrictEqual(fillStats({}, CLOUD), CLOUD);
  });

  test('אין ענן · לא מוחקים את המקומי', () => {
    assert.deepStrictEqual(fillStats(LOG, null), LOG);
    assert.deepStrictEqual(fillStats(LOG, undefined), LOG);
  });

  test('הכלל הזה הוא באמת מה שרץ ב-app.js', () => {
    /* בלי זה כל האמור למעלה בודק פונקציה שקיימת רק בקובץ הבדיקה. */
    const { appSource } = require('./_harness/sandbox.js');
    const app = appSource();
    const at = app.indexOf("LS.set('hw_stats'+sk");
    assert.ok(at > 0, "השורה שכותבת hw_stats ב-pullAccountState לא נמצאה — שונתה או הוסרה");
    const line = app.slice(app.lastIndexOf('\n', at) + 1, app.indexOf('\n', at));
    assert.ok(/hasLog|!\s*hasLog/.test(line),
      'הכתיבה ל-hw_stats חזרה להיות בלי תנאי — יומן תרגול מקומי נדרס שוב:\n  ' + line.trim());

    /* ושהתנאי באמת נגזר מ-sessions ולא ממשהו שרק נראה דומה. */
    const win = app.slice(Math.max(0, at - 500), at);
    assert.ok(/sessions/.test(win) && /Array\.isArray/.test(win),
      'hasLog אינו נגזר מ-stats.sessions');
  });
});
