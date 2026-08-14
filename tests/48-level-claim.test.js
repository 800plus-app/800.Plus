'use strict';
/* כמה מילים במבחן הרמה · המספר שבמסך חייב להיגזר מהקבוע שבקוד.
 *
 * מה שנמצא (3.8.2026, בביקורת על שינוי משימה ב')
 * -----------------------------------------------
 * LV_BLOCK ירד מ-6 ל-5 (ו-LV_PASS מ-5 ל-4). מסך הפתיחה של מבחן הרמה עודכן ל-"10–20 מילים",
 * אבל שני הכפתורים במסך החשבון · "מבחן רמה בעברית" ו-"מבחן רמה באנגלית" · נשארו על
 * "12–24 מילים", המספר של בלוקים של 6. שלוש הצהרות על אותה תכונה, שתיים מהן שקריות.
 *
 * הטווח האמיתי, מתוך הסולם עצמו
 * ------------------------------
 * lvNextBand הולך מונוטונית מ-B1 ועוצר ברגע שהכיוון היה מתהפך:
 *   · עלייה מלאה   B1→B2→C1→C2  = 4 בלוקים  ← המקסימום
 *   · עלייה ונפילה B1→B2         = 2 בלוקים  ← המינימום
 *   · ירידה מלאה   B1→A2→A1      = 3 בלוקים
 * כלומר 2 עד 4 בלוקים, ומכאן LV_BLOCK*2 עד LV_BLOCK*4.
 *
 * למה בדיקה ולא רק תיקון
 * -----------------------
 * זו הפעם השנייה שהמספר הזה נשבר בעקבות שינוי בקבוע. הבדיקה גוזרת את הטווח מ-LV_BLOCK
 * ודורשת שכל הצהרה במסך תסכים איתו · כך ששינוי עתידי של הקבוע ייפול כאן ולא אצל משתמש.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appSource, ROOT } = require('./_harness/sandbox.js');

const app = appSource();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const LV_BLOCK = Number((app.match(/const\s+LV_BLOCK\s*=\s*(\d+)/) || [])[1]);
const MIN_BLOCKS = 2, MAX_BLOCKS = 4;   // נגזר מ-lvNextBand, ראה ההסבר למעלה

describe('מבחן הרמה · הטווח שבמסך תואם לקוד', () => {

  test('LV_BLOCK נקרא מהקוד', () => {
    assert.ok(Number.isInteger(LV_BLOCK) && LV_BLOCK > 0,
      'LV_BLOCK אינו קבוע מספרי פשוט יותר — עדכן את הבדיקה');
  });

  test('כל טווח "N–M מילים" במסך שווה ל-LV_BLOCK×2 עד LV_BLOCK×4', () => {
    const want = `${LV_BLOCK * MIN_BLOCKS}–${LV_BLOCK * MAX_BLOCKS}`;
    // כל הצהרה בתבנית "מספר–מספר מילים" (מקף עברי או רגיל)
    const found = [...html.matchAll(/(\d+)[–-](\d+)\s*מילים/g)].map(m => `${m[1]}–${m[2]}`);
    assert.ok(found.length > 0, 'לא נמצאה אף הצהרה על מספר מילים — האם הניסוח השתנה?');
    const wrong = found.filter(r => r !== want);
    assert.deepStrictEqual(wrong, [],
      `הצהרות שאינן תואמות ל-LV_BLOCK=${LV_BLOCK} (הטווח הנכון ${want}): ${wrong.join(', ')}`);
  });

  test('שלושת המקומות מצהירים אותו דבר', () => {
    /* מסך הפתיחה + שני הכפתורים במסך החשבון. שלושתם מתארים את אותה תכונה. */
    const found = [...html.matchAll(/(\d+)[–-](\d+)\s*מילים/g)].map(m => `${m[1]}–${m[2]}`);
    assert.strictEqual(new Set(found).size, 1,
      'המסך מצהיר יותר מטווח אחד על אותה תכונה: ' + [...new Set(found)].join(' · '));
  });
});
