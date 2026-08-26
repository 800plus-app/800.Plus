'use strict';
/* שער החתימה של billing-webhook — מורץ, לא נקרא.
 *
 * למה השער הזה קיים
 * -------------------
 * ‏`billing-webhook` נמדד ב-19.8 כ-**404, לא פרוסה**. ברגע שתיפרס היא הופכת
 * לנקודת קצה **ציבורית שמשנה חיוב** — `verify_jwt=false` ב-`config.toml`,
 * כלומר Supabase לא מגן עליה והאימות היחיד הוא זה שבקוד.
 *
 * ⚠ **למה לא regex בלבד.** הבדיקות הקיימות ל-Edge Functions (`tests/72`) טוענות
 * על **טקסט המקור**. זה תופס מחיקה, אבל לא תופס פונקציה ששונתה ועדיין נראית
 * נכון — בדיוק הדפוס ש-`sEsc` נפל בו: היא ישבה ברשימת העוטפים המאושרים
 * וקיבלה אישור גורף בלי שאיש הריץ אותה. כאן שתי הפונקציות הקריטיות
 * **מחולצות מהמקור ומורצות**, מול וקטור בדיקה ידוע.
 *
 * ⛔ **מה השער אינו מוכיח:** שהפונקציה הפרוסה דוחה בקשה אמיתית. זה נמדד רק
 * מול נקודת קצה חיה, ואי אפשר לפני פריסה. המדד שנשאר פתוח: בקשה עם חתימה
 * שגויה מחזירה 4xx ו-`billing_events` נשארת ללא שינוי.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(
  path.join(ROOT, 'supabase/functions/billing-webhook/index.ts'), 'utf8');

const NL_BRACE = String.fromCharCode(10) + '}';

/* חילוץ פונקציה מהמקור והסרת הערות הטיפוס בלבד, כדי שתרוץ ב-Node.
   איתור לפי אינדקס ולא לפי תבנית: הגוף מכיל תווי בריחה, וכל ניסוח מחדש
   שלהם בתבנית הוא הזדמנות לשגיאה שקטה. הגוף עצמו אינו נוגע — מה שרץ כאן
   הוא הקוד שלהם. */
function lift(name) {
  const head = SRC.indexOf('function ' + name + '(');
  assert.ok(head > 0, name + ' לא נמצאה ב-index.ts — עדכן את השער');
  const from = SRC.slice(head - 6, head) === 'async ' ? head - 6 : head;
  const close = SRC.indexOf(NL_BRACE, head);
  assert.ok(close > from, name + ' — לא נמצא סוף הפונקציה');
  return SRC.slice(from, close + 2)
    .split(': Promise<string>').join('')
    .split(': string').join('')
    .split(': number').join('')
    .split(': boolean').join('');
}

const ctx = { crypto, TextEncoder, enc: new TextEncoder(), console };
vm.createContext(ctx);
vm.runInContext(lift('hmacHex') + String.fromCharCode(10) + lift('safeEq'), ctx,
  { filename: 'billing-webhook/index.ts' });

describe('hmacHex — HMAC אמיתי, לא פונקציה שמחזירה משהו', () => {
  test('וקטור בדיקה ידוע של HMAC-SHA256', async () => {
    /* וקטור מוכר. אם מישהו יחליף את הגוף בגיבוב אחר, יקצר אותו, או יחזיר
       ערך קבוע — המספר הזה ישתנה, והשער יאדים. */
    const got = await ctx.hmacHex('key', 'The quick brown fox jumps over the lazy dog');
    assert.strictEqual(got,
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
      'hmacHex אינו HMAC-SHA256 תקני — כל חתימה שתיבדק מולו חסרת ערך');
  });

  test('סוד שונה → חתימה שונה', async () => {
    const a = await ctx.hmacHex('secret-A', 'body');
    const b = await ctx.hmacHex('secret-B', 'body');
    assert.notStrictEqual(a, b, 'הסוד אינו משפיע על התוצאה');
    assert.strictEqual(a.length, 64, 'אורך hex של SHA-256 הוא 64');
  });

  test('גוף שונה → חתימה שונה', async () => {
    const a = await ctx.hmacHex('s', '{"amount":10}');
    const b = await ctx.hmacHex('s', '{"amount":9999}');
    assert.notStrictEqual(a, b, 'שינוי בסכום החיוב אינו משנה את החתימה');
  });
});

describe('safeEq — השוואה שאינה מדליפה תו-תו', () => {
  test('שווים → true · שונים → false', () => {
    assert.strictEqual(ctx.safeEq('abc', 'abc'), true);
    assert.strictEqual(ctx.safeEq('abc', 'abd'), false);
  });

  test('אורך שונה → false, בלי לזרוק', () => {
    assert.strictEqual(ctx.safeEq('abc', 'abcd'), false);
    assert.strictEqual(ctx.safeEq('', 'a'), false);
    assert.strictEqual(ctx.safeEq('', ''), true);
  });

  test('הבדל בתו הראשון ובתו האחרון — שניהם false', () => {
    /* ‏`===` היה מחזיר false בשניהם גם כן. מה שנבדק כאן הוא שהמימוש לא
       "מתקן" את עצמו לאחד המקרים. הטענה על עמידות לתזמון היא על המבנה
       (XOR מצטבר על כל התווים) ונבדקת בשער המבני למטה. */
    assert.strictEqual(ctx.safeEq('Xbc', 'abc'), false);
    assert.strictEqual(ctx.safeEq('abX', 'abc'), false);
  });
});

describe('נכשל-סגור — המבנה, עם בקרה שהטענה יכולה ליפול', () => {
  /* אלה טענות על המקור ולא על התנהגות, כי הן תלויות ב-Deno.env שאינו קיים
     כאן. לכל אחת מוצמדת בקרה: מוטציה בזיכרון שחייבת להפיל אותה. שער מבני
     בלי בקרה כזאת כבר עבר בשקט בפרויקט הזה שלוש פעמים. */
  const claims = [
    { name: 'ברירת המחדל היא hmac ולא none',
      has: s => /BILLING_VERIFY_MODE'\)\s*\?\?\s*'hmac'/.test(s),
      bust: s => s.split("?? 'hmac'").join("?? 'none'") },

    { name: 'בלי סוד — דחייה, לא מעבר',
      has: s => /if\s*\(\s*!SECRET\s*\)\s*return\s*\{\s*ok:\s*false/.test(s),
      bust: s => s.split('if (!SECRET) return { ok: false').join('if (false) return { ok: false') },

    { name: 'ההשוואה היא safeEq ולא ===',
      has: s => /ok:\s*safeEq\(\s*await\s+hmacHex\(/.test(s),
      bust: s => s.split('ok: safeEq(await hmacHex(').join('ok: (await hmacHex(') },

    { name: 'חותמת זמן מחוץ לחלון נדחית',
      has: s => /Number\(ts\)\)\s*>\s*TOLERANCE/.test(s),
      bust: s => s.split('> TOLERANCE').join('> Infinity') },
  ];

  for (const c of claims) {
    test(c.name, () => {
      assert.ok(c.has(SRC), c.name + ' — לא נמצא ב-index.ts');
      const broken = c.bust(SRC);
      assert.notStrictEqual(broken, SRC, 'המוטציה לא שינתה כלום — הבקרה עצמה שבורה');
      assert.ok(!c.has(broken),
        'הטענה "' + c.name + '" עוברת גם על קוד שבור — היא חסרת שיניים');
    });
  }

  test('verify_jwt=false מתועד — הפונקציה חשופה בכוונה, והאימות הוא שלה', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
    assert.match(toml, /billing-webhook[\s\S]{0,200}verify_jwt\s*=\s*false/,
      'ההגדרה השתנתה — אם verify_jwt כבר לא false, השער הזה מתאר מציאות אחרת');
  });
});
