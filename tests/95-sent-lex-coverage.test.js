'use strict';
/* כל מילה בכל משפט מקבלת פירוש · ואין דרך להוסיף משפט שמפר את זה.
 *
 * ⛔ למה זה שער ולא בדיקה חד־פעמית
 * --------------------------------
 * חגי הכריע (27.8.2026) להסיר את הקו המקווקו שסימן אילו מילים ניתנות להקשה.
 * ⭐ **ומרגע שאין סימון, ההקשה היא הימור** · לומד שמקיש על מילה ומקבל
 * «אין פירוש» לומד שהפיצ'ר לא עובד, ומפסיק להקיש. הכיסוי חייב להיות 100%,
 * ומשפט חדש שמכניס מילה לא מוכרת חייב להפיל את החבילה · לא להישאר חור שקט.
 *
 * ⭐ הבדיקה מריצה את הפונקציות **האמיתיות** מ-`app.js` מול הקורפוס האמיתי.
 * ⚠ הגרסה הראשונה של המדידה כתבה נרמול משלה במקום `normEn`, ו-`father's`
 * נספר כחסר בזמן שהאפליקציה כן מוצאת אותו. **מודד שאינו הקוד אינו מודד את הקוד.**
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource } = require('./_harness/sandbox.js');
const { extractFunction, extractDecl } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');

const שורש = path.join(__dirname, '..');
const SRC = appSource();
const MASK = codeMask(SRC);

function load(rel) {
  const w = {};
  new Function('window', fs.readFileSync(path.join(שורש, rel), 'utf8'))(w);
  return w;
}

/** הפונקציות האמיתיות, מול המאגר האמיתי ומילון העזר האמיתי. */
function engine(withExtra = true) {
  const bank = {};
  vm.runInNewContext(fs.readFileSync(path.join(שורש, 'data-en.js'), 'utf8'), { window: bank });
  const lex = load('sentence-completion/sent-lex.js').SENT_LEX;
  const ctx = {
    window: { UNIT_DATA_EN: bank.UNIT_DATA_EN, SENT_LEX: withExtra ? lex : {} },
    sentLexMap: null, Map, Set, String, Number, Object, console,
  };
  vm.createContext(ctx);
  for (const n of ['normEn', 'SENT_SUFF', 'REPAIR', 'sentLex', 'sentWordGloss']) {
    const code = extractFunction(SRC, n, MASK) || extractDecl(SRC, n, MASK);
    assert.ok(code, `לא נמצא ב-app.js: ${n}`);
    vm.runInContext(code, ctx, { filename: 'app.js:' + n });
  }
  return ctx;
}

const מילים = s => [...String(s).matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map(m => m[0]);
const קורפוס = () => Object.values(load('data-sent-en.js').SENT_EN).flat();

describe('כיסוי הפירושים בהשלמת המשפטים', () => {

  /* ⭐ בקרה חיובית · בלי מילון העזר הכיסוי חייב להיות **חלקי**.
     בלעדיה, בדיקת ה-100% הייתה עוברת גם אם המנוע מחזיר פירוש לכל מחרוזת. */
  test('בלי מילון העזר הכיסוי חלקי · הבקרה', () => {
    const ctx = engine(false);
    const all = new Set();
    for (const it of קורפוס()) for (const w of מילים(it.s)) all.add(w.toLowerCase());
    const miss = [...all].filter(w => !ctx.sentWordGloss(w));
    assert.ok(miss.length > 100,
      `בלי המילון חסרות רק ${miss.length} מילים · המנוע מחזיר פירוש למה שאין לו, ` +
      'ובדיקת ה-100% שאחריה חסרת ערך');
  });

  test('⭐ כל מילה בכל משפט מקבלת פירוש', () => {
    const ctx = engine();
    const holes = [];
    for (const it of קורפוס()) {
      const miss = מילים(it.s).filter(w => !ctx.sentWordGloss(w));
      if (miss.length) holes.push(`${it.src}: ${miss.join(' ')}`);
    }
    assert.strictEqual(holes.length, 0,
      `⛔ ${holes.length} משפטים מכילים מילה בלי פירוש. אין סימון ויזואלי על המילים, ` +
      'ולכן הקשה שמחזירה «אין פירוש» נקראת כתקלה:\n  ' + holes.slice(0, 12).join('\n  '));
  });

  test('גם האפשרויות עצמן מקבלות פירוש', () => {
    const ctx = engine();
    const bad = [];
    for (const it of קורפוס())
      for (const o of it.o || [])
        for (const w of מילים(Array.isArray(o) ? o.join(' ') : o))
          if (!ctx.sentWordGloss(w)) bad.push(`${it.src}: ${w}`);
    assert.strictEqual(bad.length, 0,
      `⛔ ${bad.length} מילים באפשרויות בלי פירוש:\n  ` + bad.slice(0, 10).join('\n  '));
  });
});

describe('תקינות מילון העזר', () => {

  const lex = () => load('sentence-completion/sent-lex.js').SENT_LEX;

  test('כל ערך אינו ריק ויש בו עברית', () => {
    const bad = Object.entries(lex()).filter(([, v]) => !v || !/[א-ת]/.test(String(v)));
    assert.strictEqual(bad.length, 0,
      `${bad.length} ערכים ריקים או בלי עברית: ` + bad.slice(0, 8).map(x => x[0]).join(' '));
  });

  /* ⛔ מפתח כפול ב-object literal אינו שגיאה ב-JavaScript · האחרון פשוט מנצח,
     בשקט. הבדיקה קוראת את **הטקסט** ולא את האובייקט, כי באובייקט הכפילות
     כבר נעלמה. */
  test('אין מפתח כפול בקובץ', () => {
    const txt = fs.readFileSync(path.join(שורש, 'sentence-completion/sent-lex.js'), 'utf8');
    const keys = [...txt.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(m => m[1]);
    const seen = new Set(), dup = [];
    for (const k of keys) { if (seen.has(k)) dup.push(k); seen.add(k); }
    assert.strictEqual(dup.length, 0, 'מפתחות כפולים: ' + dup.join(' '));
  });

  /* ⛔ המאגר הראשי עבר ביקורת אנושית · העזר לא. ערך שקיים בשניהם חייב לקבל
     את זה של המאגר, אחרת פירוש שנכתב במודל דורס פירוש מאושר. */
  test('מילון העזר אינו דורס את המאגר הראשי', () => {
    const ctx = engine();
    const bank = {};
    vm.runInNewContext(fs.readFileSync(path.join(שורש, 'data-en.js'), 'utf8'), { window: bank });
    const extra = lex();
    const stomped = [];
    for (const u in bank.UNIT_DATA_EN)
      for (const p of bank.UNIT_DATA_EN[u] || []) {
        const k = ctx.normEn(String(p[0]).split(/\s+-\s+/)[0]);
        if (!k) continue;
        const got = ctx.sentWordGloss(k);
        if (extra[k] !== undefined && got && got.gloss === extra[k] && extra[k] !== p[1])
          stomped.push(k);
      }
    assert.strictEqual(stomped.length, 0,
      `${stomped.length} מילים מקבלות את פירוש העזר במקום את המאגר: ` + stomped.slice(0, 8).join(' '));
  });

  test('הקובץ נטען לצד המשפטים', () => {
    assert.ok(/sentence-completion\/sent-lex\.js/.test(SRC),
      'app.js אינו טוען את מילון העזר · הכיסוי יהיה חלקי בדפדפן גם אם הקובץ קיים');
    assert.ok(/window\.SENT_LEX/.test(SRC), 'sentLex אינו קורא את המילון');
  });
});

/* ─────────── ששת התיקונים מביקורת הממשק · שלא יחזרו ─────────── */
describe('ההתנהגות שנקבעה בביקורת', () => {

  const html = () => fs.readFileSync(path.join(שורש, 'index.html'), 'utf8');

  /* ⛔ הבועה הייתה **מעל** המשפט, וההערה טענה שזה שומר עליו במקומו · נמדד
     שהיא דחפה את המשפט, את האפשרויות ואת המילה שהוקשה 60px למטה. */
  test('בועת הפירוש יושבת מתחת למשפט', () => {
    const h = html();
    assert.ok(h.indexOf('id="sentText"') < h.indexOf('id="sentGloss"'),
      'הבועה חזרה מעל המשפט · היא תדחוף אותו למטה בכל הקשה');
  });

  /* ⛔ `padding:11px 38px 11px 14px` שמר 38px בימין, ו-`inset-inline-end`
     ב-RTL מציב את ה-✕ בשמאל · 10.7% מהפירושים נכתבו מתחתיו ב-375px. */
  test('הריפוד לכפתור הסגירה נשמר בצד שאינו תלוי כיוון', () => {
    const rule = html().slice(html().indexOf('.s-gloss{'), html().indexOf('.s-gloss.hidden'));
    assert.ok(/padding-inline-end:\s*\d+px/.test(rule),
      'הריפוד חזר לערך שתלוי בצד · ה-✕ ידרוס את הטקסט ב-RTL');
    assert.ok(!/padding:\s*\d+px\s+3[0-9]px/.test(rule), 'חזר ריפוד ימני קשיח');
  });

  test('יעדי המגע של המילים אינם קטנים מ-24px', () => {
    const rule = html().slice(html().indexOf('.s-w{'), html().indexOf('.s-w:active'));
    assert.ok(/min-width:\s*24px/.test(rule), 'הוסר min-width · מילים כמו "a" יורדות ל-10px');
    const pad = rule.match(/padding:\s*(\d+)px/);
    assert.ok(pad && Number(pad[1]) >= 6,
      'הריפוד האנכי קטן מ-6px · הכפתור יורד מתחת ל-24px גובה');
  });

  /* ⛔ מחווני המצב נמדדו 1.22:1 ו-1.28:1 מול 3:1 שדורש WCAG 1.4.11, ובלי
     רשת ביטחון · `-webkit-tap-highlight-color:transparent` על ה-body. */
  test('מחוון המצב אינו נשען על צבע בלבד', () => {
    const h = html();
    for (const sel of ['.s-w:active', '.s-w.on']) {
      const rule = h.slice(h.indexOf(sel + '{'), h.indexOf('}', h.indexOf(sel + '{')));
      assert.ok(/box-shadow:\s*inset/.test(rule),
        `${sel} נשען על רקע בלבד · על רקע בהיר זה אינו מגיע ל-3:1`);
    }
  });

  test('הקשה שנייה סוגרת, ויש מוצא במקלדת', () => {
    assert.ok(/classList\.contains\('on'\)\)\{\s*hideSentGloss\(\);\s*return;/.test(SRC),
      'אין toggle · המוצא היחיד הוא ✕ בגודל 30×30');
    assert.ok(/e\.key === 'Escape'[\s\S]{0,120}hideSentGloss/.test(SRC),
      'אין יציאה ב-Escape');
  });

  test('הבועה נסגרת עם המענה, והרמז יורד', () => {
    const as = SRC.slice(SRC.indexOf('function answerSent'), SRC.indexOf('function finishSentRound'));
    assert.ok(/hideSentGloss\(\)/.test(as), 'הבועה נשארת פתוחה מעל ההסבר');
    assert.ok(/sentHint'\)\.classList\.add\('hidden'\)/.test(as),
      'הרמז «הקש על מילה» נשאר אחרי שהמשפט נפתר');
  });

  test('החסר עונה, ולמילים יש שם נגיש', () => {
    assert.ok(/aria-label', 'פירוש של '/.test(SRC),
      'לכפתורי המילים אין שם נגיש · קורא מסך ישמע "such, button"');
    assert.ok(/'המילה החסרה/.test(SRC),
      'הקשה על ___ אינה עושה דבר · והוא הדבר היחיד המסומן במשפט');
  });
});
