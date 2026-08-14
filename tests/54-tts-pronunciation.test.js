'use strict';
/* הגיית המילים באנגלית · מה שנשלח למנוע ההקראה.
 *
 * מה חגי ביקש (5.8.2026, חשוב ודחוף 5): "לוודא הגייה בשמע של המילים באנגלית."
 *
 * מה נמצא באימות
 * ---------------
 * מנוע ההקראה עצמו היה תקין: TTS.pick מסנן ל-en-*, מעדיף en-US, מציב גם voice וגם lang,
 * ומאט ל-0.9. הפגם לא היה במנוע אלא ב*טקסט* שנשלח אליו. סריקה של כל 3,945 הערכים
 * באנגלית מצאה 20 שנקראים כרעש:
 *   · 10 ערכי סדר בצורה "1st - first". מנוע ההקראה מבטא את המקף, ואת "1st" הוא קורא
 *     "one-st" · כלומר המילה שהלומד בא לשמוע נאמרת אחרי ג'יבריש.
 *   · 9 ערכי ריבוי בצורה "knife (knives)" · הסוגריים נקראים או יוצרים עצירה מוזרה.
 *   ·  1 ערך עם לוכסנים, "begin/an/un".
 *
 * מה במכוון לא נגענו בו
 * ----------------------
 * 18 הערכים עם פסיק ("fight, fought") נשארים. שם הפסיק הוא הכוונה · אלה זוגות פעלים
 * חריגים, ושתי הצורות אמורות להישמע.
 * וגם: הטקסט על המסך אינו משתנה. הלומד צריך לראות "1st - first" ולשמוע "first".
 *
 * שער הספרה
 * ----------
 * חיתוך ב-" - " מותנה בכך שיש ספרה בצד השמאלי. בלעדיו כל ערך עם מקף מוקף רווחים היה
 * מאבד את חציו הראשון · הבדיקה על "well - being" היא זו שמחזיקה את השער הזה במקום.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();

/* מרים את speakable מהמקור. הוא יושב על אובייקט TTS שנשען על speechSynthesis, ולכן
   אי אפשr להרים אותו דרך ארגז החול · אבל הפונקציה עצמה היא טקסט טהור בלי תלויות. */
function speakable() {
  const at = app.indexOf('  speakable(text){');
  assert.ok(at > 0, 'TTS.speakable נעלמה');
  const end = app.indexOf('  say(text, btn){', at);
  assert.ok(end > at, 'לא נמצא סוף speakable');
  const body = app.slice(at, end)
    .replace(/^\s*speakable\(text\)\{/, '')
    .replace(/\}\s*,\s*$/, '');
  return new Function('text', body);
}

function englishTerms() {
  const g = { window: {} };
  g.window.window = g.window;
  const prev = global.window;
  global.window = g.window;
  try {
    delete require.cache[require.resolve(path.join(ROOT, 'data-en.js'))];
    require(path.join(ROOT, 'data-en.js'));
    const U = global.window.UNIT_DATA_EN;
    const out = [];
    for (const k of Object.keys(U)) for (const r of U[k]) out.push(r[0]);
    return out;
  } finally { global.window = prev; }
}

describe('הגייה · הטקסט שנשלח למנוע ההקראה', () => {

  test('say משתמש ב-speakable ולא בטקסט הגולמי', () => {
    const at = app.indexOf('  say(text, btn){');
    const body = app.slice(at, at + 400);
    assert.match(body, /new SpeechSynthesisUtterance\(this\.speakable\(text\)\)/,
      'ההקראה עדיין מקבלת את הטקסט הגולמי — "1st - first" יישמע "one-st dash first"');
  });

  test('ערך סדר נקרא בצורה המילולית בלבד', () => {
    const S = speakable();
    assert.strictEqual(S('1st - first'), 'first');
    assert.strictEqual(S('10th - tenth'), 'tenth');
    assert.strictEqual(S('9th - ninth'), 'ninth');
  });

  test('סוגריים ולוכסנים הופכים לפסיק', () => {
    const S = speakable();
    assert.strictEqual(S('knife (knives)'), 'knife, knives');
    assert.strictEqual(S('mouse (mice)'), 'mouse, mice');
    assert.strictEqual(S('begin/an/un'), 'begin, an, un');
  });

  test('מקף בלי ספרה אינו נחתך', () => {
    /* השער שמונע מהכלל לבלוע ערכים תקינים. בלעדיו "well - being" היה נהגה "being". */
    const S = speakable();
    assert.strictEqual(S('well - being'), 'well - being');
  });

  test('זוגות עם פסיק נשארים כמו שהם · הפסיק הוא הכוונה', () => {
    const S = speakable();
    assert.strictEqual(S('fight, fought'), 'fight, fought');
    assert.strictEqual(S('know, knew'), 'know, knew');
  });

  test('מילה רגילה ומטבע לשון אינם משתנים כלל', () => {
    const S = speakable();
    for (const t of ['elaborate', 'give rise to', 'concede', 'in spite of'])
      assert.strictEqual(S(t), t, `"${t}" השתנה בלי סיבה`);
  });

  test('על כל המאגר: אף ערך אינו הופך לריק, ולא נשאר תו שנקרא כרעש', () => {
    /* זו הבדיקה שמגינה מפני כלל נורמליזציה עתידי שנראה תמים ומוחק מילים. */
    const S = speakable();
    const terms = englishTerms();
    assert.ok(terms.length > 3000, 'המאגר האנגלי לא נטען');

    const empty = terms.filter(t => !String(S(t)).trim());
    assert.strictEqual(empty.length, 0, 'ערכים שהפכו לריקים: ' + JSON.stringify(empty.slice(0, 5)));

    const noisy = terms.filter(t => /[()\/]/.test(S(t)));
    assert.strictEqual(noisy.length, 0,
      'נשארו סוגריים/לוכסן בטקסט המוקרא: ' + JSON.stringify(noisy.slice(0, 5)));

    const changed = terms.filter(t => S(t) !== t);
    assert.strictEqual(changed.length, 20,
      `צפויים 20 ערכים מנורמלים, נמצאו ${changed.length} — המאגר השתנה או שהכלל התרחב`);
  });
});
