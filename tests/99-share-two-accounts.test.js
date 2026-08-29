'use strict';
/* שיתוף אסוציאציה בין שני חשבונות · פיקסטורה, בלי רשת ובלי דפדפן.
 *
 * הרקע (ביקורת/משימות/2026-08-17-ביקורת-המשך-5d91a706.md · "תוצאת בדיקת השיתוף התקבלה
 * בתמונה ובלי שובל")
 * -------------------------------------------------------------------------------------
 * שלושת המספרים שסגרו את בדיקת השיתוף בין שני משתמשים הגיעו כצילום מסך של שאילתת SQL
 * שרצה ישירות מול Supabase (supabase/rls-isolation-all-tables.sql, supabase/assoc-admin-
 * check.sql) -- אי אפשר להריץ אותה שוב מכאן, ואין שובל שמוכיח מתי היא רצה ובאיזה חלון.
 * המשימה הזאת אסורה במפורש לגעת ב-supabase/** ולהריץ שאילתות מול Supabase, ולכן מה
 * שאפשר לשחזר כאן הוא לא הבידוד ברמת ה-DB (RLS אמיתי) אלא מה שהצד שאנחנו כן שולטים
 * בו -- store.js -- מבטיח בפועל בצומת שבו שני חשבונות נפגשים.
 *
 * מה אמור להתקיים (store.js:333-371, ההערות שכבר שם)
 * -----------------------------------------------------
 * קריאה חוצה חשבון בכוונה: מה שמשתמש א שיתף חייב להופיע אצל משתמש ב, ולהפך -- זו
 * ההגדרה של "שיתוף". כתיבה לעולם לא חוצה חשבון: shareAssoc ו-unshareAssoc שואבים את
 * הזהות אך ורק מ-sb.auth.getUser() של הקורא, ואף פעם לא ממה שהקורא מוסר בפרמטרים --
 * כך שאין דרך לכתוב או למחוק בשם חשבון אחר. ואיש לא רואה את מזהה המשתמש (user_id)
 * של האחר: הטקסט משותף, הזהות לא.
 *
 * מה זה *לא*: לא בדיקת RLS מול Postgres אמיתי, ולא הוכחה ש-migrations/9.sql רץ בפועל
 * מול הנתונים החיים. זה נשאר פער פתוח (ראה "מה לא נבדק" בדוח). מה שכן: גייט שנופל
 * באמת אם מישהו יזיז את הקו הזה ב-store.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { plain, expectNone } = require('./_harness/sandbox.js');
const { loadStore } = require('./_harness/fakeSupabase.js');

const none = (list, msg) => expectNone(assert, list, msg);

describe('שיתוף אסוציאציה בין שני חשבונות · א ↔ ב', () => {
  /* "השרת" הבדוי: כל צד מקבל בחזרה בדיוק את מה ש-RPC אמיתי (shared_assoc, SECURITY
     DEFINER) אמור להחזיר לו -- שתי השורות, עם is_mine מחושב מנקודת המבט שלו, ובלי
     עמודת user_id בכלל. זה בדיוק הצורה שהתגלית בביקורת קבעה שחייבת להתקיים. */
  const rowsAsSeenByA = [
    { text: 'רעיון של א', is_mine: true },
    { text: 'רעיון של ב', is_mine: false },
  ];
  const rowsAsSeenByB = [
    { text: 'רעיון של א', is_mine: false },
    { text: 'רעיון של ב', is_mine: true },
  ];

  test('מה שמשתמש א שיתף מופיע אצל משתמש ב', async () => {
    const b = loadStore({ user: { id: 'u-B' }, respond: { 'rpc.shared_assoc': { data: rowsAsSeenByB } } });
    const r = await b.Store.listSharedAssoc('he', 'k');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(plain(r.rows).map(x => x.text), ['רעיון של א'],
      'משתמש ב לא רואה את מה שמשתמש א שיתף -- השיתוף לא חוצה חשבון');
  });

  test('מה שמשתמש ב שיתף מופיע אצל משתמש א · ואותה בדיקה בכיוון ההפוך', async () => {
    const a = loadStore({ user: { id: 'u-A' }, respond: { 'rpc.shared_assoc': { data: rowsAsSeenByA } } });
    const r = await a.Store.listSharedAssoc('he', 'k');
    assert.deepStrictEqual(plain(r.rows).map(x => x.text), ['רעיון של ב'],
      'משתמש א לא רואה את מה שמשתמש ב שיתף -- השיתוף לא חוצה חשבון');
    assert.strictEqual(r.mine, true, 'משתמש א לא זיהה שהשורה שלו-עצמו נמצאת ברשימה');
  });

  test('אף צד לא רואה את מזהה המשתמש (user_id) של האחר', async () => {
    const a = loadStore({ user: { id: 'u-A' }, respond: { 'rpc.shared_assoc': { data: rowsAsSeenByA } } });
    const b = loadStore({ user: { id: 'u-B' }, respond: { 'rpc.shared_assoc': { data: rowsAsSeenByB } } });
    const ra = await a.Store.listSharedAssoc('he', 'k');
    const rb = await b.Store.listSharedAssoc('he', 'k');
    none(plain(ra.rows).filter(x => 'user_id' in x), 'user_id דלף לצד א:');
    none(plain(rb.rows).filter(x => 'user_id' in x), 'user_id דלף לצד ב:');
  });

  test('שיתוף נכתב תמיד בשם המשתמש המחובר · אי אפשר לשתף בשם חשבון אחר', async () => {
    const a = loadStore({ user: { id: 'u-A' }, respond: { 'assoc_shared.upsert': {} } });
    await a.Store.shareAssoc('he', 'k', 'w', 'רעיון ארוך מספיק לשיתוף');
    const row = a.fake.of('assoc_shared', 'upsert')[0].row;
    assert.strictEqual(row.user_id, 'u-A', 'הכתיבה לא ננעלה לזהות המשתמש המחובר');
  });

  test('ביטול שיתוף נמחק רק מתחת לחשבון שביצע אותו · לא של חשבון אחר', async () => {
    const a = loadStore({ user: { id: 'u-A' }, respond: { 'assoc_shared.delete': {} } });
    await a.Store.unshareAssoc('he', 'k');
    const del = a.fake.of('assoc_shared', 'delete')[0];
    assert.deepStrictEqual(del.filters.find(f => f[1] === 'user_id'), ['eq', 'user_id', 'u-A'],
      'המחיקה לא מסוננת לפי המשתמש המחובר -- חשבון אחד יכול היה למחוק שורה של אחר');
  });
});
