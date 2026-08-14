'use strict';
/* "היום" חייב להיות אותו יום בכל האפליקציה.
 *
 * הבאג
 * ----
 * wcToday היה Math.floor(Date.now()/86400000) · יום UTC. הרצף, לעומתו, משתמש ב-dayKey,
 * שהוא יום קלנדרי מקומי, ו-11-time.test.js טורח במיוחד לקבע אותו לאזור הזמן של ישראל.
 *
 * שתי הגדרות שונות של "היום" באותה אפליקציה מייצרות שני כשלים שנראים אקראיים:
 *   · מילת היום מתחלפת ב-02:00 או 03:00 בלילה ולא בחצות.
 *   · ✕ שסוגר את הכרטיס "להיום" ב-23:30 נפתח מחדש שעתיים וחצי אחר כך · באותו לילה.
 *
 * המשתמש היחיד שיבחין בזה יסיק שהכפתור לא עובד, וזה בדיוק סוג התקלה שלא מדווחים עליה.
 *
 * TZ נקבע לפני כל דבר אחר: ב-UTC שני החישובים זהים, ובדיקה שרצה ב-UTC הייתה עוברת
 * בירוק גם עם הבאג במקומו.
 */
process.env.TZ = 'Asia/Jerusalem';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { appSource } = require('./_harness/sandbox.js');
const { extractAll } = require('./_harness/extract.js');
const vm = require('vm');

/* שעון נשלט. Date.now ו-new Date() חייבים לזוז יחד · wcToday קורא את שניהם. */
function at(iso) {
  const fixed = new Date(iso).getTime();
  const ctx = { Math, JSON };
  ctx.Date = class extends Date {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
  vm.createContext(ctx);
  for (const { name, code } of extractAll(appSource(), ['wcToday']))
    vm.runInContext(code, ctx, { filename: `app.js:${name}` });
  return ctx.wcToday();
}

describe('wcToday · יום מקומי, לא יום UTC', () => {

  test('23:30 ו-00:30 באותו לילה הם שני ימים שונים', () => {
    /* זה הגבול האמיתי. מי שסוגר את הכרטיס בלילה מצפה שיחזור מחר. */
    const before = at('2026-08-02T23:30:00+03:00');
    const after  = at('2026-08-03T00:30:00+03:00');
    assert.strictEqual(after, before + 1,
      `חצות מקומית לא הזיזה את היום: ${before} → ${after}`);
  });

  test('הגבול הוא חצות מקומית · 23:59 ו-00:01 נחלקים', () => {
    /* שתי דקות זו מזו, ושני ימים. זה מה שמבטיח שכרטיס שנסגר בלילה חוזר בבוקר
       ולא באמצע אותו לילה. */
    const a = at('2026-08-02T23:59:00+03:00');
    const b = at('2026-08-03T00:01:00+03:00');
    assert.strictEqual(b, a + 1,
      `חצות מקומית לא חילקה בין 23:59 ל-00:01: ${a} / ${b}`);
  });

  test('כל שעות הערב הן יום אחד', () => {
    /* הצד השני של אותו גבול. אם היום מתחלף ב-21:00 (UTC-3 היה עושה זאת), מילת
       היום מתחלפת בערב · וזו אותה תקלה מהכיוון ההפוך. */
    const t = ['18:00','20:00','21:00','22:00','23:59']
      .map(h => at(`2026-08-02T${h}:00+03:00`));
    assert.strictEqual(new Set(t).size, 1,
      `היום התחלף במהלך הערב: ${JSON.stringify(t)}`);
  });

  test('היום אינו מתחלף ב-02:00 ובשעה 03:00', () => {
    /* שלוש נקודות אחרי חצות מקומית ולפני הבוקר. כולן אותו יום. אם אחת מהן קופצת,
       חצות UTC חזרה. */
    const t = ['01:00', '02:00', '03:00', '04:00']
      .map(h => at(`2026-08-03T${h}:00+03:00`));
    assert.strictEqual(new Set(t).size, 1,
      `היום התחלף באמצע הלילה: ${JSON.stringify(t)}`);
  });

  test('מספר שלם ועולה', () => {
    /* wcPick עושה pool[(day+offset) % pool.length]. ערך לא שלם או שלילי היה מייצר
       אינדקס NaN והכרטיס היה נעלם בלי הודעה. */
    const d = at('2026-08-02T12:00:00+03:00');
    assert.ok(Number.isInteger(d) && d > 0, 'wcToday אינו מספר שלם חיובי: ' + d);
    assert.ok(at('2026-08-03T12:00:00+03:00') > d, 'היום אינו עולה');
  });
});
