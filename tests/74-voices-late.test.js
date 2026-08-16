'use strict';
/* הרמקול שלא הופיע · שחזור הבינדינג כשהקולות מגיעים באיחור.
 *
 * הדיווח (משתמשת, בעל פה, 15.8.2026)
 * -----------------------------------
 * "הרמקול לא הופיע לה". בלי screen, בלי lang, בלי ua — כלומר אי אפשר לדעת אם זה הבאג
 * הזה. מה שכן נמדד הוא שהמנגנון שאמור להחזיר את הרמקול נכשל בתרחיש אמיתי, וזה מה
 * שנבדק כאן.
 *
 * המנגנון
 * --------
 * `getVoices()` מחזירה מערך ריק בטעינה הראשונה כמעט תמיד, ולכן `bindSay` מסתיר את
 * הכפתור. השחזור נשען כולו על אירוע `voiceschanged`: כשהוא נורה, כל הבינדינגים
 * ב-`sayBound` מנוגנים מחדש והכפתור מופיע.
 *
 * הכשל שנמדד
 * -----------
 * השומר היה `const had=!!TTS.voice` — "אם כבר יש קול, כנראה כבר שוחזר". אלא ש-`TTS.voice`
 * נקבע כ**תופעת לוואי** של `TTS.available()`, ו-`available()` נקראת משלושה מקומות שאינם
 * `bindSay`: `renderReview`, `TTS.say`, ו-`bindSay` של מסך **אחר**. כלומר כל מסך שהצליח
 * להדליק רמקול אחרי שמסך קודם נכשל — מכבה בכך את השחזור של הקודם.
 *
 * נמדד בדפדפן (localhost:8787, SW מבוטל ו-caches נוקו), A/B עם משתנה אחד:
 *   ביקורת  — bind בלי קול → voiceschanged → hidden:false, onclick:true   ✔ שוחזר
 *   וריאנט  — bind בלי קול → TTS.available() → voiceschanged → hidden:true, onclick:false  ✘
 * אותו אירוע בדיוק. ההבדל היחיד הוא קריאה אחת ל-available() באמצע.
 *
 * המסלול החי שבו זה נוגע: מסך הבית נטען בלי קולות → #wcSay מוסתר → הלומד נכנס לתרגול,
 * הקולות כבר הגיעו, bindSay של #qSay מצליח ומדליק את TTS.voice → voiceschanged נורה →
 * השחזור מדולג → #wcSay נשאר מוסתר עד שמסך הבית ייבנה מחדש.
 *
 * למה vm ולא ארגז החול הרגיל
 * ---------------------------
 * המטפל אינו פונקציה בעלת שם ואינו `.onclick` — extractFunction ו-extractHandler אינם
 * מגיעים אליו. הוא מורם כאן כמו ב-tests/20 (`authSubmitHandler`): התאמה אחת בדיוק, ואז
 * הליכה לסוף המשפט. `TTS` עצמו מורם כמו שהוא — הבדיקה מריצה את הקוד שנשלח, לא העתק שלו.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { appSource } = require('./_harness/sandbox.js');
const { extractDecl } = require('./_harness/extract.js');
const { codeMask, codeMatches, statementEnd } = require('./_harness/scan.js');

const app = appSource();
const mask = codeMask(app);

/* המטפל של voiceschanged, כטקסט. התאמה אחת בדיוק או נפילה בשם — סמל שנעלם לא יהפוך
   לבדיקה שעוברת כי לא בדקה כלום. */
function voicesChangedHandler() {
  const hits = codeMatches(app, /speechSynthesis\.onvoiceschanged\s*=/, mask);
  assert.strictEqual(hits.length, 1,
    `app.js מקצה את speechSynthesis.onvoiceschanged ${hits.length} פעמים — ההרמה דו-משמעית`);
  const end = statementEnd(app, hits[0].index, mask);
  assert.ok(end > 0, 'לא נמצא סופו של המטפל של voiceschanged');
  return app.slice(hits[0].index, end + 1);
}

const ttsDecl = extractDecl(app, 'TTS', mask);
assert.ok(ttsDecl, 'app.js אינו מצהיר עוד על TTS — עדכן את ההרמה, אל תמחק את הבדיקה');

const EN = [{ lang: 'en-US', name: 'Samantha' }];

/* קול מגיע באיחור, ואף אחד לא ירה voiceschanged עדיין. `probe` הוא הקריאה ל-available()
   שנוחתת באמצע — בדיוק מה ש-renderReview ו-TTS.say עושים. */
function scenario({ probe }) {
  let fleet = [];
  const rebound = [];
  const ctx = vm.createContext({
    speechSynthesis: { getVoices: () => fleet, onvoiceschanged: null },
    SpeechSynthesisUtterance: function () {},
    sayBound: new Map(),
    bindSay: (sel, text, alwaysEn) => rebound.push(sel),
    sentSayRefresh: () => {},
  });
  vm.runInContext(ttsDecl, ctx, { filename: 'app.js:TTS' });
  vm.runInContext(voicesChangedHandler(), ctx, { filename: 'app.js:onvoiceschanged' });

  // מסך נבנה בזמן שלמכשיר עוד אין קול — bindSay הסתיר את הכפתור ורשם אותו
  assert.strictEqual(ctx.TTS.available(), false, 'ההכנה שגויה: יש קול כבר בהתחלה');
  ctx.sayBound.set('#wcSay', ['gene', undefined]);

  fleet = EN;                                   // הקולות הגיעו, בשקט
  if (probe) ctx.TTS.available();               // מסך אחר נגע ב-TTS לפני האירוע
  ctx.speechSynthesis.onvoiceschanged();        // ורק עכשיו האירוע נורה

  return { rebound, voice: ctx.TTS.voice };
}

describe('קול שמגיע באיחור · שחזור הרמקול', () => {

  test('⭐ הרמקול משוחזר גם כשמסך אחר כבר נגע ב-TTS.available לפני האירוע', () => {
    /* זה הבאג. `available()` קובעת את TTS.voice כתופעת לוואי, והשומר הישן קרא בזה
       "כבר שוחזר" — כך שהאירוע היחיד שיכול היה להציל את #wcSay דילג עליו. */
    const { rebound } = scenario({ probe: true });
    assert.deepStrictEqual(rebound, ['#wcSay'],
      'voiceschanged לא ניגן מחדש את הבינדינג של #wcSay אחרי שקריאה ל-TTS.available() ' +
      'נחתה בין הבינדינג לאירוע — הרמקול יישאר מוסתר עד שהמסך ייבנה מחדש');
  });

  test('וגם במסלול הנקי, שבו איש לא נגע ב-TTS באמצע', () => {
    /* ביקורת. היא עוברת גם לפני התיקון, וזה בדיוק תפקידה: "תיקון" שפשוט מוחק את
       השחזור יפיל אותה, ולכן אי אפשר להוריד את הראשונה לירוק על ידי ויתור. */
    const { rebound } = scenario({ probe: false });
    assert.deepStrictEqual(rebound, ['#wcSay'],
      'voiceschanged אינו מנגן מחדש את הבינדינגים כלל — השחזור נמחק');
  });

  test('אחרי האירוע יש קול אנגלי בפועל, ולא רק בינדינג ששוחזר', () => {
    /* שחזור בלי קול היה מציג כפתור שאינו יודע להגות — בדיוק מה שההערה מעל bindSay
       אומרת שגרוע מהיעדרו. */
    for (const probe of [true, false]) {
      const { voice } = scenario({ probe });
      assert.ok(voice && /^en(-|_|$)/i.test(voice.lang),
        `אחרי voiceschanged אין קול אנגלי נבחר (probe=${probe})`);
    }
  });
});
