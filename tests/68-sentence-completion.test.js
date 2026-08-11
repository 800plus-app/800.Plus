'use strict';
/* השלמת משפטים — הקורפוס, קובץ הייצור, והחיווט לאפליקציה.
 *
 * הבדיקות כאן לא נכתבו מראש. כל אחת מהן מקבעת כשל **שקרה בפועל** בזמן בניית
 * התרגול הזה, וזה מה שמצדיק אותה:
 *
 * 1. `a:0` בכל 204 הפריטים. זה מכוון בקורפוס — הכותב מציב את התשובה ראשונה
 *    וההסבר נכתב מולה — ו-assemble.js מזהיר על כך בכותרת. אבל הגרסה הראשונה של
 *    המסך באפליקציה **לא ערבבה**, ולכן התשובה הנכונה הייתה תמיד הכפתור הראשון.
 *    נתפס בבדיקה בדפדפן לפני העלייה, ולא בקריאת קוד.
 * 2. הערבוב חייב למפות מחדש `o`, `g` ו-`r` **יחד**. מיפוי של `o` בלבד מצמיד לכל
 *    מילה את הפירוש של מילה אחרת, וזה כשל שקט וגרוע מהמקורי.
 * 3. קובץ הייצור נבנה מהקורפוס. שני צעדים שצריך לזכור להריץ בסדר הם צעד אחד
 *    שיישכח, ולכן assemble.js קורא ל-build_ship.js, וכאן נבדק שהם מסונכרנים.
 * 4. הפורמט שאושר דורש `g` ו-`t` ו-`r` בכל פריט. פריט חסר היה מציג מסך הסבר ריק.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');

/* ⚠ מנרמל סופי שורה של חלונות.
   הבדיקות כאן חותכות גוף פונקציה לפי רצף של ירידת שורה ואחריה סוגר מסולסל. בקובץ
   עם CRLF הרצף הוא CR ואז LF ואז הסוגר, ולכן חיפוש "LF סוגר LF" אינו נמצא כלל:
   indexOf מחזיר מינוס אחת, והחיתוך יוצא באורך שני תווים. שתי בדיקות נכשלו כך על
   קוד תקין לחלוטין, וזה כשל בבדיקה ולא בקוד. */
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n');

const load = rel => {
  const g = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(g.window);
  return g.window;
};

const SHIP = load('data-sent-en.js').SENT_EN;
const items = Object.values(SHIP).flat();
const words = o => Array.isArray(o) ? o : [o];
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (txt, o) => words(o).some(w =>
  new RegExp('(^|[^A-Za-z])' + esc(w) + '([^A-Za-z]|$)', 'i').test(String(txt || '')));

describe('השלמת משפטים · קובץ הייצור', () => {
  test('נטען ומכיל את ארבע הרצועות', () => {
    assert.deepStrictEqual(Object.keys(SHIP), ['בסיס', 'בינוני', 'מתקדם', 'אקדמי']);
    assert.ok(items.length >= 200, `${items.length} פריטים בלבד`);
  });

  test('כל פריט נושא g · t · r שלמים', () => {
    const bad = items.filter(it =>
      !it.t || !Array.isArray(it.g) || it.g.length !== it.o.length ||
      !Array.isArray(it.r) || it.r.length !== it.o.length || it.r.some(x => !x));
    assert.strictEqual(bad.length, 0,
      `פריטים חסרי פורמט: ${bad.map(x => x.src).join(', ')}. מסך ההסבר היה יוצא ריק.`);
  });

  test('שדה e אינו נשלח לדפדפן', () => {
    const withE = items.filter(it => it.e !== undefined);
    assert.strictEqual(withE.length, 0,
      'e הוא ההסבר בפורמט הישן, אינו מוצג ללומד, ומשקלו 62KB. build_ship.js מסיר אותו.');
  });

  test('ההדגשה בתרגום היא עברית, ומספרה כמספר החסרים', () => {
    const bad = [];
    for (const it of items) {
      const bold = String(it.t).match(/\*\*([^*]+)\*\*/g) || [];
      if (bold.length !== words(it.o[it.a]).length) bad.push(`${it.src} · ${bold.length} הדגשות`);
      if (bold.some(b => !/[֐-׿]/.test(b))) bad.push(`${it.src} · הדגשה שאינה עברית`);
      if (/_{2,}/.test(it.t)) bad.push(`${it.src} · נשאר חסר בתרגום`);
    }
    assert.strictEqual(bad.length, 0, bad.join(' | '));
  });

  test('אין מקף ארוך באף שדה שהלומד רואה', () => {
    const bad = [];
    for (const it of items) {
      const fields = [it.s, it.t, ...(it.g || []), ...(it.r || [])];
      if (fields.some(x => /[—–]/.test(String(x)))) bad.push(it.src);
    }
    assert.strictEqual(bad.length, 0, `מקף ארוך (HEB §3א) ב: ${bad.join(', ')}`);
  });

  test('פירוש ונימוק מזכירים את המילה שהם שייכים לה', () => {
    const bad = [];
    for (const it of items) it.o.forEach((o, j) => {
      if (!mentions(it.g[j], o)) bad.push(`${it.src} g[${j}]`);
      if (!mentions(it.r[j], o)) bad.push(`${it.src} r[${j}]`);
    });
    assert.strictEqual(bad.length, 0, bad.slice(0, 10).join(' | '));
  });

  test('מספר החסרים במשפט תואם את צורת האפשרות', () => {
    const bad = [];
    for (const it of items) {
      const blanks = (String(it.s).match(/_{2,}/g) || []).length;
      if (blanks !== words(it.o[0]).length) bad.push(`${it.src} · ${blanks} חסרים`);
    }
    assert.strictEqual(bad.length, 0, bad.join(' | '));
  });
});

describe('השלמת משפטים · הערבוב באפליקציה', () => {
  /* ⚠ `app` ולא `src`: שם זהה לעוזר הקורא היה מצליל אותו בתוך ה-describe הזה,
     וההצללה נופלת עוד לפני שהבדיקה רצה. */
  const app = src('app.js');

  test('הקורפוס אכן מגיע עם התשובה באינדקס אחד — ולכן ערבוב הוא חובה', () => {
    const idx = new Set(items.map(it => it.a));
    assert.strictEqual(idx.size, 1,
      'אם הקורפוס כבר מעורבב, הנימוק לקיום sentShuffled השתנה ויש לעדכן את ההערה בקוד.');
    assert.strictEqual([...idx][0], 0);
  });

  test('sentShuffled קיים ומופעל בבניית הסבב', () => {
    assert.match(app, /function sentShuffled\s*\(/, 'פונקציית הערבוב נעלמה מ-app.js');
    assert.match(app, /\.map\(sentShuffled\)/,
      'הסבב נבנה בלי ערבוב — התשובה הנכונה תהיה תמיד הכפתור הראשון.');
  });

  test('הערבוב ממפה מחדש o · g · r · a יחד', () => {
    const fn = app.slice(app.indexOf('function sentShuffled'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    for (const k of ['o:', 'g:', 'r:', 'a:'])
      assert.ok(body.includes(k), `sentShuffled אינו ממפה ${k} — הפירוש יוצמד למילה אחרת.`);
    assert.match(body, /idx\.indexOf\(it\.a\)/, 'a אינו מחושב מחדש לפי הערבוב.');
  });

  /* אותה לוגיקה, מורצת כאן כדי לאמת התנהגות ולא רק נוכחות טקסט. */
  test('הערבוב שומר על ההצמדה בין מילה, פירוש ונימוק', () => {
    let rnd = 12345;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const sentShuffled = it => {
      const idx = shuffle(it.o.map((_, i) => i));
      return { ...it, o: idx.map(i => it.o[i]), g: idx.map(i => it.g[i]), r: idx.map(i => it.r[i]), a: idx.indexOf(it.a) };
    };
    const seen = new Set();
    for (const it of items) {
      const s = sentShuffled(it);
      seen.add(s.a);
      assert.deepStrictEqual(s.o[s.a], it.o[it.a], `${it.src}: התשובה זזה בערבוב`);
      s.o.forEach((o, j) => {
        assert.ok(mentions(s.g[j], o), `${it.src}: פירוש הוצמד למילה אחרת אחרי ערבוב`);
        assert.ok(mentions(s.r[j], o), `${it.src}: נימוק הוצמד למילה אחרת אחרי ערבוב`);
      });
    }
    assert.ok(seen.size >= 3, `התשובה נחתה ב-${seen.size} מקומות בלבד — הערבוב אינו מפזר.`);
  });
});

describe('השלמת משפטים · החיווט', () => {
  const app = src('app.js');
  const html = src('index.html');

  test('המסך רשום ב-SCREENS ובעומק הניווט', () => {
    assert.match(app, /const SCREENS=\[[^\]]*'sent'/, "'sent' אינו ב-SCREENS — המסך לא יוסתר במעבר.");
    assert.match(app, /sent:2/, "'sent' אינו ב-NAV_DEPTH — כפתור 'אחורה' של אנדרואיד יסגור את האפליקציה.");
  });

  test('כל מזהה שה-JS מחפש קיים ב-HTML', () => {
    const ids = ['sent', 'sentExit', 'sentBrand', 'sentBar', 'sentCount', 'sentScore', 'sentLive',
      'sentPick', 'sentPickList', 'sentCard', 'sentText', 'sentOpts', 'sentExp', 'sentActions',
      'sentNext', 'sentDone', 'sentSectionT', 'sentBands', 'pbSent', 'pbSentSub', 'cntSent'];
    const missing = ids.filter(id => !html.includes(`id="${id}"`));
    assert.strictEqual(missing.length, 0, `מזהים חסרים ב-index.html: ${missing.join(', ')}`);
  });

  test('קובץ הנתונים נטען בהשהיה ולא מתג סקריפט קבוע', () => {
    assert.ok(!/<script[^>]+data-sent-en\.js/.test(html),
      'data-sent-en.js בתג קבוע — 190KB בכל עליית דף, גם למי שלא נוגע בתרגול.');
    assert.match(app, /data-sent-en\.js/, 'app.js אינו טוען את קובץ הנתונים כלל.');
  });

  test('התרגול מוצג באנגלית בלבד', () => {
    assert.match(app, /const sentOn = LANG==='en'/,
      'המקטע אינו תלוי בשפה — בצד העברי הוא היה מוביל לתרגול באנגלית.');
  });
});

/* ===== בחירת התרגול ומעקב ההתקדמות =====
 * שני אלה נוספו לפי בקשה מפורשת: בחירה בין תרגול מילים להשלמת משפטים אחרי
 * בחירת אנגלית, ומעקב התקדמות על המשפטים.
 */
describe('השלמת משפטים · מסך בחירת התרגול', () => {
  const app = src('app.js');
  const html = src('index.html');

  test('המסך רשום ובעומק ניווט 0, כמו welcome ו-home', () => {
    assert.match(app, /const SCREENS=\[[^\]]*'mode'/, "'mode' אינו ב-SCREENS.");
    assert.match(app, /mode:0/,
      "'mode' חייב עומק 0. בעומק 1 כניסה ל-home הייתה מחליפה רשומת היסטוריה, " +
      "ו'אחורה' מ-home היה יוצא מהאפליקציה בלי לעבור דרך בחירת התרגול.");
  });

  test('כל מזהה שה-JS מחפש קיים ב-HTML', () => {
    const ids = ['mode', 'modeBack', 'setBtnM', 'userBadgeM',
      'mWordsPct', 'mWordsProg', 'mWordsLearned', 'mWordsPract', 'mWordsCount',
      'mSentPct', 'mSentProg', 'mSentSolved', 'mSentOk', 'mSentCount'];
    const missing = ids.filter(id => !html.includes(`id="${id}"`));
    assert.strictEqual(missing.length, 0, `מזהים חסרים: ${missing.join(', ')}`);
    assert.ok(/data-mode="words"/.test(html) && /data-mode="sent"/.test(html),
      'שני כרטיסי הבחירה חייבים לשאת data-mode.');
  });

  test('אנגלית עוצרת על הבחירה, ועברית ממשיכה ישר לדף הבית', () => {
    assert.match(app, /if\(lang==='en'\)\{\s*renderMode\(\);\s*goto\('mode'\);\s*\}\s*\n?\s*else goto\('home'\)/,
      'הניתוב אינו מפריד בין השפות. בעברית אין קורפוס משפטים, ומסך בחירה שם הוא ' +
      'מסך עם אפשרות אחת.');
  });

  test('navTo מצייר את מסך הבחירה מחדש — הוא מסך מונים', () => {
    /* ⛔ באג שנמדד בדפדפן ב-11.8: אנגלית → בחירת תרגול → סבב של עשר → "אחורה"
       של המערכת, והמסך הציג "0 נפתרו · 0%" אחרי שעשרה נפתרו. `navTo` צייר מחדש
       רק `home` ו-`scope`, ו-`mode` נפל דרך ל-goto בלי ציור.
       ⚠ אף שער לא תפס את זה: הבדיקות בדקו שהמסך קיים ושהניתוב מגיע אליו, ולא
       שהוא **מעודכן** כשמגיעים אליו דרך ההיסטוריה. */
    const fn = app.slice(app.indexOf('function navTo('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /id==='mode'.*renderMode\(\)/s,
      "navTo אינו מצייר מחדש את mode. חזרה דרך 'אחורה' תציג מספרים ישנים.");
  });

  test('"חזרה" מדף הבית עולה שלב אחד באנגלית', () => {
    const fn = app.slice(app.indexOf("$('#switchLang').onclick"));
    const body = fn.slice(0, fn.indexOf('};') + 2);
    assert.match(body, /LANG==='en'/,
      "כפתור החזרה אינו תלוי בשפה — באנגלית הוא צריך להוביל לבחירת התרגול ולא לבחירת השפה.");
  });
});

describe('השלמת משפטים · מעקב ההתקדמות', () => {
  const app = src('app.js');

  test('המקור היחיד הוא מפת ההתקדמות, והמערך הישן הוסר', () => {
    assert.ok(!/const sentDone = \(\)=>/.test(app),
      'sentDone הוחזר. מערך מזהים לצד מפת ההתקדמות הוא מקור אמת שני, והם יכולים להיפרד.');
    assert.ok(!/function markSentDone/.test(app), 'markSentDone הוחזר.');
    assert.match(app, /function sentRecord\(/, 'sentRecord הוא הכותב היחיד למפה.');
  });

  test('קיימת הגירה מהמבנה הישן, והיא שמרנית', () => {
    const fn = app.slice(app.indexOf('function sentProg('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /SENT_KEY/, 'sentProg אינו קורא את המבנה הישן — התקדמות קיימת תאבד.');
    assert.match(body, /n: 1, ok: 0/,
      'ההגירה חייבת לסמן את הפריטים כנפתרו-ולא-נכונים: התוצאה לא נשמרה, ולהצהיר ' +
      'על שליטה שלא נמדדה זה הכיוון הלא נכון.');
  });

  test('הסבב מביא קודם חדשים, אחריהם נכשלים, ורק אז ידועים', () => {
    const fn = app.slice(app.indexOf('function startSentRound('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    for (const k of ['fresh', 'failed', 'known', 'slipped', 'solid'])
      assert.ok(body.includes(k), `סדר העדיפות אינו שלם — חסר ${k}.`);
    const iF = body.indexOf('concat(shuffle(failed'), iK = body.indexOf('concat(slipped');
    assert.ok(iF > 0 && iK > iF, 'נכשלים חייבים להצטרף לפני ידועים.');
    /* ⛔ הבאג שהיה כאן: shuffle על pool כולו אחרי בניית הסדר, וזה ביטל אותו בשקט. */
    assert.ok(!/sentQ = shuffle\(pool/.test(body),
      'ערבוב pool כולו מבטל את סדר העדיפות שנבנה מעליו.');
  });

  test('הסנכרון נוסע בבלוב הקיים, בלי טבלה חדשה', () => {
    assert.match(app, /if\(lang==='en'\)\{ const p = LS\.get\(SENT_PROG, null\)/,
      'collectExtras אינו כולל את התקדמות המשפטים — היא לא תעבור בין מכשירים.');
    assert.match(app, /if\(lang==='en' && isObj\(ex\.sent\)\)/,
      'applyExtras אינו קורא אותה בחזרה.');
  });

  test('המיזוג מונוטוני, ו-ok נחסם ל-n', () => {
    const fn = app.slice(app.indexOf('function applyExtras('));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 3);
    assert.match(body, /Math\.max\(Number\(l\.n\)\|\|0, Number\(r\.n\)\|\|0\)/,
      'n אינו מקסימום — מכשיר שמאחר יוכל לגרור אחורה מכשיר שקדם לו.');
    assert.match(body, /Math\.min\(ok, n\)/,
      'ok אינו נחסם ל-n. שורה פגומה מהענן הייתה מפיקה אחוז שליטה מעל 100.');
  });

  test('רשומה פגומה אינה מפילה את הסבב', () => {
    /* ⛔ באג שנמצא בציד ב-11.8 והרג את הסבב בלחיצה: `sentProg` הגן על המפה ולא על
       הרשומות שבתוכה, ולכן `e.n++` על מחרוזת זרק במצב strict — מתוך `answerSent`,
       **לפני** סימון התשובה ולפני פתיחת ההסבר. הלומד לחץ, ולא קרה כלום.
       ההגנה הזאת כבר הייתה קיימת ב-applyExtras ונשכחה כאן. */
    const fn = app.slice(app.indexOf('function sentRecord('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /saneSentRec\(p\[src\]\)/,
      'sentRecord אינו מנרמל את הרשומה. רשומה פגומה תזרוק ותקפיא את הסבב.');
    assert.match(body, /if \(e\.ok > e\.n\) e\.ok = e\.n/,
      'ok אינו נחסם ל-n גם בכתיבה המקומית.');
    /* ⛔ והכי חשוב כאן: **השם**. `saneRec` כבר קיים ב-app.js ומנקה את רשומות
       המילים (seen/first/ever/wrong/level). הכרזה שנייה באותו שם דורסת אותו בזמן
       ריצה, וכל רשומת מילה הייתה עוברת דרך המנקה של המשפטים ומאבדת את כל שדותיה.
       חבילת הבדיקות היא שתפסה את זה ("declares function saneRec 2 times"), ולא
       קריאת קוד. */
    assert.strictEqual((app.match(/^function saneRec\(/gm) || []).length, 1,
      'saneRec מוכרז יותר מפעם אחת. ההכרזה השנייה דורסת את הראשונה ומוחקת את ' +
      'נירמול רשומות המילים.');
    assert.match(app, /function saneSentRec\(/,
      'המנקה של המשפטים חייב שם נפרד מזה של המילים.');
  });

  test('רשומה שאינה שפויה מנורמלת בקריאה, ולא בכל אתר שימוש', () => {
    /* ⚠ שני ממצאי ציד נבעו מאותו שורש: רשומה עם n שלילי או שאינו מספר לא נכנסה
       לאף אחת משלוש קבוצות העדיפות, ולכן הפריט **יצא מהרוטציה לנצח** והוצג כאילו
       נענה; ורשומה עם ok גדול מ-n הפיקה 100%. */
    const fn = app.slice(app.indexOf('function saneSentRec('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /Math\.max\(0/, 'n אינו נחסם מלמטה — ערך שלילי ישרוד.');
    assert.match(body, /Math\.min\(n/, 'ok אינו נחסם ל-n.');
    const pf = app.slice(app.indexOf('function sentProg('));
    assert.match(pf.slice(0, 900), /saneSentRec\(raw\[k\]\)/,
      'sentProg מחזיר את המפה בלי לנרמל את הרשומות שבתוכה.');
  });

  test('כל תג המשתמש נכתב יחד, כולל זה של מסך הבחירה', () => {
    /* ⚠ נמצא בציד: setBadges עדכן שני תגים משלושה, ותג מסך הבחירה נשאר ריק אחרי
       שינוי שם. התיעוד שם אומר במפורש שהם נכתבים יחד. */
    const fn = app.slice(app.indexOf('function setBadges('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    for (const id of ['#userBadge', '#userBadgeW', '#userBadgeM'])
      assert.ok(body.includes(id), `setBadges אינו מעדכן ${id}.`);
  });

  test('כל כפתור במסך הבחירה מחובר', () => {
    /* ⛔ נמצא בציד: #userBadge4 נשא aria-label "החשבון שלי" ובלי מאזין. קורא מסך
       הכריז לחצן, הלחיצה לא עשתה כלום. גרוע מכפתור חסר, שאינו מבטיח דבר. */
    for (const id of ['modeBack', 'setBtnM', 'userBadge4'])
      assert.match(app, new RegExp(`\\$\\('#${id}'\\)\\.onclick`),
        `#${id} מופיע ב-HTML ואין לו מאזין ב-app.js.`);
  });

  test('קובץ הנתונים נטען ברקע רק למי שכבר תרגל', () => {
    /* ⚠ נמצא בציד: הגרסה הראשונה הורידה 191KB בכל כניסה לאנגלית, גם למי שבא
       לתרגל מילים בלבד. */
    const fn = app.slice(app.indexOf('async function renderMode('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /hasHistory/,
      'renderMode טוען את קובץ הנתונים לכל נכנס — 191KB למי שלא נוגע בתרגול.');
  });

  test('התשובה נרשמת ומתוזמנת לסנכרון, בלי דחיפה לכל תשובה', () => {
    const fn = app.slice(app.indexOf('function sentRecord('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.match(body, /queueRemoteSync\(\)/, 'התשובה אינה מסומנת לסנכרון כלל.');
    assert.ok(!/flushRemoteSync/.test(body),
      'דחיפה מיידית לכל תשובה — עשר קריאות רשת בסבב אחד במקום אחת.');
    /* ⚠ היה `slice(0, 1400)` — מספר קסם. הוספת בלוק לתוך הפונקציה דחפה את הקריאה
       מעבר לחלון והבדיקה נכשלה על קוד תקין. חיתוך גוף הפונקציה אינו תלוי באורך. */
    const fin = app.slice(app.indexOf('function finishSentRound('));
    assert.match(fin.slice(0, fin.indexOf('\n}') + 2), /flushRemoteSync/,
      'סוף סבב חייב לכפות דחיפה: זו נקודה שבה הלומד עלול לסגור את הלשונית.');
  });
});
