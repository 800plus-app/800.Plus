'use strict';
/* store.js לא רץ בלי supabase.min.js — ולכן supabase.min.js חייב להיות ב-CORE.
 *
 * הרקע
 * -----
 * ל-sw.js שתי רשימות. ASSETS היא כל מה שהאפליקציה עשויה לבקש; CORE היא תת-הקבוצה שבלעדיה
 * ההתקנה נכשלת. ההבחנה מכוונת ונכונה: install מחכה רק ל-CORE, והשאר נטען best-effort כדי
 * שנכס אחד רעוע לא יפיל את ההתקנה כולה (הנימוק כתוב ב-sw.js עצמו).
 *
 * אבל store.js — שנמצא ב-CORE — טוען את Supabase דרך supabase.min.js. אם supabase.min.js
 * נכשל בטעינה, install עדיין מצליח (הוא best-effort), האפליקציה מותקנת, ובאופליין store.js
 * מפיל אותה. קובץ שקובץ-ליבה תלוי בו הוא בעצמו ליבה.
 *
 * למה בדיקה על טקסט המקור ולא על התנהגות
 * ---------------------------------------
 * install מצריך CacheStorage, fetch ו-Request אמיתיים — סטאב שלהם יסטה. הרשימה CORE היא
 * מערך מחרוזות סטטי; מה שצריך להישמר הוא שהמחרוזת נמצאת בו, וזה נבדק ישירות על המקור.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const coreLine = (src.match(/const CORE\s*=\s*\[([^\]]*)\]/) || [])[1] || '';

describe('sw — CORE מכיל כל מה שהאפליקציה לא עולה בלעדיו', () => {

  test('CORE הוא מערך שנמצא ב-sw.js', () => {
    assert.ok(coreLine.length > 0, 'לא נמצאה הגדרת CORE ב-sw.js — האם היא שונתה?');
  });

  test('supabase.min.js נמצא ב-CORE', () => {
    assert.ok(/supabase\.min\.js/.test(coreLine),
      'supabase.min.js אינו ב-CORE. store.js — שכן ב-CORE — לא רץ בלעדיו, ולכן\n' +
      'התקנה שבה supabase.min.js נכשל תעבור, והאפליקציה תישבר באופליין.');
  });

  test('app.js, store.js ו-config.js — שלושתם עדיין ב-CORE', () => {
    /* אם מישהו יצמצם את CORE, הבדיקה הזו שומרת על שאר קבצי הליבה. */
    for (const f of ['app.js', 'store.js', 'config.js', 'supabase.min.js'])
      assert.ok(new RegExp(f.replace('.', '\\.')).test(coreLine), f + ' נעלם מ-CORE');
  });

  test('כל מה שב-CORE מופיע גם ב-ASSETS', () => {
    /* CORE הוא תת-קבוצה של ASSETS. קובץ ליבה שאינו ב-ASSETS לא ייטען בכלל. */
    const assetsBlock = (src.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
    for (const f of ['app.js', 'store.js', 'config.js', 'supabase.min.js'])
      assert.ok(new RegExp(f.replace('.', '\\.')).test(assetsBlock), f + ' ב-CORE אך לא ב-ASSETS');
  });
});
