'use strict';
/* כתובת אישית לא נשלחת לדפדפן של המשתמש.
 *
 * מה נמדד ב-19.8.2026
 * --------------------
 * סריקת PII על כל ההיסטוריה (627 קומיטים · 889,262 שורות שנוספו) מצאה אפס
 * `user_id` ואפס מפתחות. המייל האישי של חגי כן נמצא — ומתוך כל המקומות, אחד
 * בלבד **נשלח לדפדפן של כל משתמש**: `mailto:` בכפתור חידוש המנוי ב-app.js.
 *
 * למה זה שער ולא תיקון חד-פעמי
 * ------------------------------
 * `admin@800-plus.com` היא כתובת הקשר של המוצר בכל מקום אחר — מדיניות פרטיות,
 * צור קשר, List-Unsubscribe, VAPID_SUBJECT. ‏`mailto` אישי הוא חריגה שנוצרה
 * בשקט, וללא שער היא תיווצר שוב בכפתור הבא.
 *
 * ⚠ מה השער הזה **אינו** טוען: שהכתובת אינה פומבית. היא שדה המחבר של 626 מתוך
 * 627 הקומיטים, וזה בלתי הפיך. הטענה כאן צרה: היא לא נשלחת ללקוח. */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

/* הקבצים שהדפדפן מוריד. לא workflows ולא Edge Functions — שם הכתובת לגיטימית:
   ב-uptime.yml היא נמען התראות תקלה, וב-delete-account היא שער דחייה שמונע
   מחיקה של חשבון הניהול (והמייל שם מגיע מ-getUser המאומת, לא מהקורא). */
const SHIPPED = ['app.js', 'store.js', 'index.html', 'sw.js', 'config.js'];

const PERSONAL = /[A-Za-z0-9._%+-]+@gmail\.com/gi;

describe('כתובת אישית אינה נשלחת ללקוח', () => {
  test('הבדיקה באמת קוראת את הקבצים — אחרת היא עוברת על ריק', () => {
    for (const f of SHIPPED) {
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), `${f} לא נמצא — עדכן את SHIPPED`);
      assert.ok(fs.readFileSync(p, 'utf8').length > 100, `${f} ריק מדי`);
    }
  });

  for (const f of SHIPPED) {
    test(`${f} — בלי כתובת gmail`, () => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const hits = [];
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const m = line.match(PERSONAL);
        if (m) hits.push(`${f}:${i + 1}  ${m.join(', ')}  →  ${line.trim().slice(0, 70)}`);
      });
      assert.deepStrictEqual(hits, [],
        'כתובת gmail אישית נשלחת לדפדפן של כל משתמש.\n' +
        'כתובת הקשר של המוצר היא admin@800-plus.com — להשתמש בה.\n' +
        hits.join('\n'));
    });
  }

  test('הבקרה: התבנית באמת יורה על כתובת gmail', () => {
    const probe = 'location.href="mailto:someone@gmail.com"';
    assert.ok(PERSONAL.test(probe), 'התבנית אינה תופסת gmail — השער חסר שיניים');
  });
});
