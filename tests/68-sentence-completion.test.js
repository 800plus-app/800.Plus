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
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  test('הקורפוס אכן מגיע עם התשובה באינדקס אחד — ולכן ערבוב הוא חובה', () => {
    const idx = new Set(items.map(it => it.a));
    assert.strictEqual(idx.size, 1,
      'אם הקורפוס כבר מעורבב, הנימוק לקיום sentShuffled השתנה ויש לעדכן את ההערה בקוד.');
    assert.strictEqual([...idx][0], 0);
  });

  test('sentShuffled קיים ומופעל בבניית הסבב', () => {
    assert.match(src, /function sentShuffled\s*\(/, 'פונקציית הערבוב נעלמה מ-app.js');
    assert.match(src, /\.map\(sentShuffled\)/,
      'הסבב נבנה בלי ערבוב — התשובה הנכונה תהיה תמיד הכפתור הראשון.');
  });

  test('הערבוב ממפה מחדש o · g · r · a יחד', () => {
    const fn = src.slice(src.indexOf('function sentShuffled'));
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
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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
