'use strict';
/* הקראה לכרטיס המילה שבמסך הבית.
 *
 * הרעיון, ממשתמש (3.8.2026)
 * --------------------------
 * "להוסיף אופציה לשמע למילים במסך הבית". הצילום שצורף מראה את הכרטיס עם המילה `gene` —
 * מילה שדובר עברית אינו יודע לבטא, ובלי הרמקול אין לו מאיפה ללמוד.
 *
 * למה זה נבנה, ולא נדחה כרעיון של אדם אחד
 * ----------------------------------------
 * הרמקול כבר קיים בשלושה מסכים — תרגול (#qSay), מבחן רמה (#lvSay) ומבחן יחידה (#exSay).
 * כלומר האפליקציה כבר מלמדת שלמילה יש רמקול, וכרטיס הבית הוא המקום היחיד ששובר את
 * הדפוס. זו אי-עקביות, לא תכונה חדשה, והיא נוגעת בכל מי שראה את הכרטיס — לא באחד שביקש.
 *
 * ולמה זה לא חושף תשובה
 * ----------------------
 * בתרגול, bindSay מקבל במכוון null כשהמילה היא התשובה (app.js, renderCard) — הקראה שם
 * הייתה מוסרת את הפתרון. בכרטיס הבית המילה כבר גלויה על המסך והפירוש הוא זה שמוסתר מאחורי
 * "גלה את הפירוש", ולכן הקראתה אינה מגלה דבר.
 *
 * הארגומנט השלישי (alwaysEn) לא מועבר — בדיוק כמו בתרגול. כך bindSay מסתיר את הכפתור
 * לבדו במאגר העברי, שבו אין הקראה בשום מקום אחר.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('כרטיס המילה — הקראה', () => {

  test('קיים כפתור רמקול בכרטיס, עם אותו עיצוב כמו שאר המסכים', () => {
    const m = html.match(/<button[^>]*id="wcSay"[^>]*>/);
    assert.ok(m, 'אין #wcSay ב-index.html');
    assert.match(m[0], /class="[^"]*\bsay\b/, '#wcSay אינו נושא את המחלקה say');
    assert.match(m[0], /\bhidden\b/,
      '#wcSay אינו מתחיל מוסתר — הוא יהבהב לפני ש-bindSay מכריע אם יש קול בכלל');
  });

  test('renderWordCard מקריא את המילה שהכרטיס מציג', () => {
    const at = app.indexOf('function renderWordCard');
    assert.ok(at > 0, 'renderWordCard נעלמה');
    const body = app.slice(at, at + 1100);
    assert.match(body, /bindSay\(\s*'#wcSay'\s*,\s*p\.w\.term\s*\)/,
      'renderWordCard אינו קורא ל-bindSay עם המילה שהוא בדיוק הציג');
  });

  test('לא מועבר alwaysEn — במאגר העברי הכפתור נעלם מעצמו', () => {
    const at = app.indexOf('function renderWordCard');
    const body = app.slice(at, at + 1100);
    const call = body.match(/bindSay\(\s*'#wcSay'[^)]*\)/)[0];
    assert.ok(!/,\s*true\s*\)/.test(call),
      'הועבר alwaysEn — הרמקול יופיע גם על מילים עבריות, שבהן אין הקראה בשום מסך אחר');
  });

  test('המילה מסומנת בשפה ובכיוון שלה', () => {
    /* אותו תיקון שכבר נעשה ל-#qText ול-#lvWord: בלעדיו קורא מסך מבטא מילה אנגלית
       בהגייה עברית, ובמאגר האנגלי המילה מיושרת לצד ההפוך. */
    const at = app.indexOf('function renderWordCard');
    const body = app.slice(at, at + 1100);
    assert.match(body, /#wcTerm'\)\.lang\s*=/, '#wcTerm אינו מקבל lang');
    assert.match(body, /#wcTerm'\)\.dir\s*=/, '#wcTerm אינו מקבל dir');
  });

  test('כל כפתורי ההקראה נושאים אותה תווית', () => {
    /* לקסיקון: מונח אחד לכל מושג. שניים אמרו "השמע" ואחד "השמע את המילה"; כפתור רביעי
       חייב היה להכריע, וההכרעה היא הניסוח שאומר לקורא המסך גם על מה מדובר. */
    const labels = [...html.matchAll(/id="(?:wc|q|lv|ex)Say"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]);
    assert.strictEqual(labels.length, 4, 'לא נמצאו ארבעת כפתורי ההקראה');
    assert.strictEqual(new Set(labels).size, 1,
      'כפתורי ההקראה נושאים תוויות שונות: ' + [...new Set(labels)].join(' · '));
  });
});
