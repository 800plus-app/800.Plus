'use strict';
/* המיזוג שרץ לפני שהמצב נטען מהדיסק · ומוחק אותו.
 *
 * הראיה
 * ------
 * 2.8.2026, מכשיר אמיתי, v118. הרצף המדויק, במספרים שנצפו על המסך:
 *
 *   10:28  אונליין   נלמדו 245 · תורגלו 266 · מתוך 1711 · רצף 1
 *   10:34  מצב טיסה  נלמדו 263 · תורגלו 263 · מתוך 1709 · רצף 2   ← תרגל 18 מילים
 *   10:35  אונליין   נלמדו 263 · "מסונכרן ✓"
 *   10:45  סגר ופתח  נלמדו 244 · תורגלו 265 · מתוך 1711 · רצף 1   ← הכול התגלגל אחורה
 *
 * גם התרגול, גם הרצף, וגם שתי מחיקות מילים חזרו. לוח הבקרה הראה 244 · כלומר גם הענן.
 *
 * המנגנון
 * --------
 * `loadLangState()` · הפונקציה שמעבירה את התקדמות השפה מ-localStorage לזיכרון · נקראת רק
 * מתוך `enterLang()`. מסך הבית אינו קורא לה: `langSummary()` קורא את המספרים ישירות
 * מ-localStorage (app.js:1791), ולכן המסך מציג נתונים נכונים בזמן ש-`stats` בזיכרון עדיין
 * שווה לברירת המחדל שלו, `{words:{},sessions:[]}`.
 *
 * `pullIfStale()` (app.js:1671) רץ על visibilitychange, online ו-focus · שלושת הרגעים של
 * "חזרתי לאפליקציה" · ובודק רק `currentUser` ו-`LANG`. `LANG` נקרא מ-localStorage בשורה
 * הראשונה של app.js, ולכן הוא 'he' מיד, הרבה לפני שנטען משהו. התוצאה:
 *
 *     mergeProgress({stats ריק בזיכרון}, {הענן})  →  הענן
 *     saveStats()                                  →  הענן נכתב על הדיסק הטוב
 *     pushProgress()                               →  והמצב המוקטן נדחף חזרה למעלה
 *
 * המיזוג עצמו תקין. הוא פשוט קיבל צד שמאל ריק שמעולם לא היה אמור להגיע אליו.
 *
 * הכלל שנשבר: מיזוג שמקורו בזיכרון שלא נטען אינו מיזוג · הוא דריסה.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadSyncLayer } = require('./_harness/fakeSupabase.js');

const NEW = 1754126040000;   // 10:34 · התרגול במצב טיסה
const OLD = 1754125680000;   // 10:28 · מה שהענן הספיק לקלוט

/* מילים אמיתיות מהמאגר. חייבות להיות אמיתיות: pruneOrphans מוחק כל רשומה שאין לה מילה
   חיה, ומילת דמה הייתה נמחקת מסיבה אחרת לגמרי ומסתירה את מה שנבדק כאן. */
const WORDS = ['אָבְנַיִים', 'אוֹצֵר', 'אָחוּ'];

/* מה שהיה על הדיסק אחרי התרגול האופליין: שלוש מילים בשליטה, וסבב אחד שהתרחש. */
function diskAfterOfflinePractice(K) {
  const words = {};
  for (const w of WORDS) words[K(w)] = { seen: 4, first: 3, ever: 4, wrong: 1, level: 3, last: NEW };
  return {
    hw_stats: { words, sessions: [{ rid: NEW + '|all|w2m', t: NEW, scope: 'all', mode: 'w2m',
                                    total: 18, correct: 16, firstTry: 14, struggled: 2, newCount: 0 }] },
    hw_deleted: ['מילה-שמחקתי-אופליין'],
    hw_assoc: {}, hw_added: [], hw_dir: 'w2m',
  };
}

/* מה שהענן החזיק: אותן מילים, בשלב מוקדם יותר, בלי הסבב. */
function cloudBeforePractice(K) {
  const words = {};
  for (const w of WORDS) words[K(w)] = { seen: 1, first: 0, ever: 1, wrong: 1, level: 1, last: OLD };
  return { assoc: {}, stats: { words, sessions: [] }, deleted: [], added: [], dir: 'w2m' };
}

describe('סנכרון לפני טעינה · אסור שייכתב דבר', () => {

  /* מסך הבית: הדיסק מלא, הזיכרון בברירת המחדל שלו, ו-langLoaded עדיין false · 
     בדיוק כפי ש-app.js מגדיר אותם לפני ש-enterLang() נקרא. */
  function atWelcomeScreen() {
    const probe = loadSyncLayer({});
    const K = probe.ctx.K;
    const disk = diskAfterOfflinePractice(K);
    const s = loadSyncLayer({
      disk,
      respond: { 'progress.select': { data: { user_id: 'u-1', lang: 'he', data: cloudBeforePractice(K), updated_at: '2026-08-02T07:28:00Z' }, error: null } },
      lift: ['syncWithRemoteInner', 'flushRemoteSync'],
    });
    s.ctx.LANG = 'he';                            // נקרא מ-localStorage בשורה הראשונה של app.js
    /* ה-harness מריץ את קוד האתחול של app.js, ולכן הדגל כבר דלוק אצלו. מכבים אותו
       במפורש כדי לשחזר את מסך הבית. ערך ההכרזה עצמו נבדק בנפרד למטה. */
    s.ctx.langLoaded = false;
    s.ctx.assoc = {};
    s.ctx.stats = { words: {}, sessions: [] };    // ברירות המחדל של המודול
    s.ctx.deleted = new Set();
    s.ctx.added = [];
    s.ctx.direction = 'w2m';
    return { s, K };
  }

  const pushesOf = s => s.calls.filter(c => c.table === 'progress' && (c.verb === 'upsert' || c.verb === 'insert' || c.verb === 'update'));

  test('המיזוג לא רץ בכלל · הזיכרון נשאר ריק', async () => {
    const { s } = atWelcomeScreen();
    await s.ctx.syncWithRemoteInner('he');
    assert.deepStrictEqual(Object.keys(s.ctx.stats.words), [],
      'הזיכרון התמלא ברשומות מהענן. saveStats() כותב בדיוק את זה על הדיסק — ' +
      'ומכאן ההתקדמות האמיתית אבודה גם מקומית וגם בענן.');
    assert.deepStrictEqual(s.ctx.stats.sessions, [], 'היסטוריית הסבבים הוחלפה בזו של הענן');
  });

  test('שום דבר לא נדחף לענן', async () => {
    const { s } = atWelcomeScreen();
    await s.ctx.syncWithRemoteInner('he');
    await new Promise(r => setImmediate(r));      // הדחיפה היא fire-and-forget (app.js:2921)
    assert.strictEqual(pushesOf(s).length, 0,
      'המצב הריק שבזיכרון נדחף לענן ודרס את ההתקדמות האמיתית. זה החלק הבלתי הפיך: ' +
      'ברגע שהענן קיבל את המצב המוקטן, גם מכשיר אחר שמסנכרן יקבל אותו.');
  });

  test('הדיסק לא נגע · ההתקדמות, הסבב והמחיקה נשארים', async () => {
    const { s, K } = atWelcomeScreen();
    await s.ctx.syncWithRemoteInner('he');
    const d = s.disk.get('hw_stats');
    assert.strictEqual(d.words[K('אוֹצֵר')].level, 3, 'רמת המילה נדרסה בעותק הישן של הענן');
    assert.strictEqual(d.sessions.length, 1, 'שורת הסבב נמחקה, ואיתה הרצף (נצפה יורד מ-2 ל-1)');
    assert.ok((s.disk.get('hw_deleted') || []).includes('מילה-שמחקתי-אופליין'),
      'המחיקה בוטלה (נצפה: המאגר חזר מ-1709 ל-1711)');
  });

  test('גם הנתיב השני, flushRemoteSync, מסרב', async () => {
    const { s } = atWelcomeScreen();
    s.ctx.syncPending = { he: true, en: true };
    const ok = await s.ctx.flushRemoteSync();
    await new Promise(r => setImmediate(r));
    assert.strictEqual(ok, false, 'חייב לדווח כישלון: signOutNow מריץ localStorage.clear() על תשובה חיובית');
    assert.strictEqual(pushesOf(s).length, 0, 'flushRemoteSync דחף מצב שלא נטען');
  });

  /* הצד השני של המטבע. בלי זה, "לסרב תמיד" היה עובר בשלוש הבדיקות שלמעלה · ושובר
     את הסנכרון בין מכשירים לגמרי. */
  test('אחרי loadLangState · הסנכרון עובד כרגיל', async () => {
    const { s, K } = atWelcomeScreen();
    const d = s.disk.get('hw_stats');
    s.ctx.stats = { words: Object.assign({}, d.words), sessions: d.sessions.slice() };
    s.ctx.deleted = new Set(s.disk.get('hw_deleted'));
    s.ctx.langLoaded = true;                      // ← זה מה שהטעינה מדליקה

    await s.ctx.syncWithRemoteInner('he');
    /* הדחיפה בסוף syncWithRemoteInner היא fire-and-forget (app.js:2921) · היא לא מומתנת,
       ולכן היא נרשמת אצל המזויף רק אחרי שהתור הנוכחי מתרוקן. */
    await new Promise(r => setImmediate(r));
    const rec = s.ctx.stats.words[K('אוֹצֵר')];
    assert.strictEqual(rec.level, 3, 'המיזוג התקין נשבר');
    assert.strictEqual(rec.seen, 4, 'המונים נלקחים ב-max — 4 מקומי מול 1 בענן');
    assert.ok(pushesOf(s).length > 0, 'אחרי טעינה תקינה הסנכרון חייב גם לדחוף');
  });

  /* הדגל חייב להיוולד כבוי. אם ההכרזה תשתנה ל-true, כל הבדיקות שלמעלה יעברו · הן
     מכבות אותו בעצמן · והבאג יחזור בשקט מוחלט. לכן זה נקרא מהמקור. */
  test('הדגל מוכרז כבוי', () => {
    const src = require('fs').readFileSync(require('path').join(require('./_harness/sandbox.js').ROOT, 'app.js'), 'utf8');
    const m = src.match(/let\s+langLoaded\s*=\s*(\w+)\s*;/);
    assert.ok(m, 'ההכרזה של langLoaded נעלמה מ-app.js');
    assert.strictEqual(m[1], 'false',
      'דגל שנולד דלוק שווה לאין דגל: הסנכרון ירוץ שוב מול זיכרון שלא נטען');
  });

  test('loadLangState עצמו הוא מה שמדליק את הדגל', () => {
    const s = loadSyncLayer({ disk: { hw_stats: { words: {}, sessions: [] } }, lift: ['loadLangState'] });
    s.ctx.langLoaded = false;
    s.ctx.loadLangState();
    assert.strictEqual(s.ctx.langLoaded, true,
      'אם הטעינה מפסיקה להדליק את הדגל, הסנכרון נכבה לצמיתות ושום התקדמות לא תעבור בין מכשירים');
  });
});
