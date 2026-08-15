'use strict';
/* רמקול על ארבע האפשרויות בהשלמת משפטים — בשאלה ובהסבר.
 *
 * הבקשה (חגי, 15.8.2026)
 * -----------------------
 * "כפתור השמעה ליד כל אחת מארבע האפשרויות, גם בשאלה וגם בהסבר שאחרי התשובה".
 *
 * ⭐ למה הבדיקה הזאת קיימת בכלל · השורה שהשינוי הזה שבר
 * -----------------------------------------------------
 * `<button>` בתוך `<button>` אינו HTML חוקי, ולכן הרמקול חייב להיות **אח** של
 * `.s-opt` בתוך עטיפה — `.s-optrow`. ברגע שנוספה העטיפה, השורה הזאת ב-answerSent
 * הפכה לשגויה בשקט:
 *
 *     Array.from($('#sentOpts').children).forEach((b,j)=>{ b.disabled = true; … })
 *
 * `children` של `#sentOpts` הם היום ה-**עטיפות**, לא הכפתורים. הכשל שהיא מייצרת
 * אינו נראה לעין ואינו זורק שגיאה:
 *   · `disabled = true` על `<div>` הוא תכונה חסרת משמעות — הכפתור נשאר לחיץ,
 *     כלומר אפשר לענות פעמיים על אותה שאלה.
 *   · `is-right` / `is-wrong` נוחתים על ה-div, שאין לו כלל כללי CSS כאלה —
 *     כלומר אין ירוק ואין אדום.
 *   · ה-✓/✗ נשתלים בתוך העטיפה ולא בכפתור.
 * כל השלושה הם "המסך פשוט לא מגיב", וזה בדיוק סוג הכשל שמיוחס למשהו אחר.
 *
 * הבדיקה הורצה מול הקוד השבור לפני שנכתב התיקון, ונפלה על שלושת הסעיפים.
 *
 * למה ארגז חול מקומי ולא tests/_harness/sandbox.js
 * -------------------------------------------------
 * `renderSentCard` ו-`answerSent` נוגעות ב-DOM, ולכן אינן ברשימת SYMBOLS. הן
 * מורמות כאן בשמן דרך אותו extract.js, ורצות מול DOM מזערי שנבנה בקובץ הזה —
 * מספיק בדיוק כדי לבדוק לאן נוחתים הסימונים. סטאב רחב יותר היה הופך לתחזוקה
 * בפני עצמה, וזה בדיוק מה ש-sandbox.js מסביר למעלה שלא עושים.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { appSource } = require('./_harness/sandbox.js');
const { extractFunction, extractDecl } = require('./_harness/extract.js');
const { codeMask } = require('./_harness/scan.js');

const SRC = appSource();
const MASK = codeMask(SRC);

function lift(name) {
  const code = extractFunction(SRC, name, MASK) || extractDecl(SRC, name, MASK);
  if (!code) {
    throw new Error(
      `app.js no longer declares ${name}.\n` +
      'tests/73 lifts it by name. If it was renamed or moved into a closure, update this\n' +
      'test — do NOT delete it. It guards the ✓/✗/disabled targeting in answerSent.');
  }
  return code;
}

/* ===== DOM מזערי =====
   רק מה ש-renderSentCard ו-answerSent באמת נוגעות בו. `innerHTML` מקבל מפרש
   שטוח שהופך כל תג עם class לילד — די כדי ש-querySelectorAll('.s-g') ימצא את
   ארבע שורות ההסבר, ולא יותר מזה. */
function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.parentElement = null;
  this._cls = new Set();
  this._attrs = {};
  this.style = {};
  this.disabled = false;
  this.textContent = '';
  this.type = '';
  this.title = '';
  this.onclick = null;
  this.inserted = [];            // כל insertAdjacentHTML שנחת על האלמנט הזה
  this._html = '';
}
Object.defineProperty(El.prototype, 'className', {
  get() { return [...this._cls].join(' '); },
  set(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
});
Object.defineProperty(El.prototype, 'classList', {
  get() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      contains: c => s.has(c),
      toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; on ? s.add(c) : s.delete(c); return on; },
    };
  },
});
Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) {
    this._html = String(v);
    this.children = [];
    const re = /<(\w+)[^>]*\sclass="([^"]*)"/g;
    let m;
    while ((m = re.exec(this._html))) {
      const el = new El(m[1]);
      el.className = m[2];
      el.parentElement = this;
      this.children.push(el);
    }
  },
});
El.prototype.appendChild = function (c) { c.parentElement = this; this.children.push(c); return c; };
El.prototype.insertAdjacentHTML = function (pos, html) { this.inserted.push(pos + ':' + html); };
El.prototype.setAttribute = function (k, v) { this._attrs[k] = v; };
El.prototype.getAttribute = function (k) { return this._attrs[k]; };
El.prototype._all = function (out) { for (const c of this.children) { out.push(c); c._all(out); } return out; };
El.prototype.querySelectorAll = function (sel) {
  const cls = String(sel).replace(/^\./, '');
  return this._all([]).filter(e => e._cls.has(cls));
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

const IDS = ['sentBrand', 'sentCount', 'sentScore', 'sentBar', 'sentText',
             'sentOpts', 'sentExp', 'sentActions', 'sentNext', 'sentLive', 'sentCard'];

/* פריט אמיתי בצורתו: ארבע אפשרויות, שלישית נכונה, אחת מהן זוג. */
function item() {
  return {
    src: 'x1',
    s: 'She had to ___ the bill before leaving.',
    o: ['pay', 'delay', ['collect', 'pass'], 'refuse'],
    a: 2,
    g: ['pay = לשלם', 'delay = לעכב', 'collect + pass = לאסוף ולמסור', 'refuse = לסרב'],
    r: ['נימוק 1', 'נימוק 2', 'נימוק 3', 'נימוק 4'],
    t: 'היא הייתה צריכה **לאסוף ולמסור** את החשבון.',
  };
}

/* בונה סביבה חיה עם הפונקציות האמיתיות מ-app.js. */
function build(opts = {}) {
  const els = {};
  IDS.forEach(id => { els[id] = new El('div'); });
  const spoken = [];
  const ctx = {
    LANG: opts.lang || 'en',
    document: { createElement: t => new El(t) },
    $: sel => els[String(sel).replace(/^#/, '')] || null,
    TTS: {
      available: () => opts.voice !== false,
      say: (t, b) => { spoken.push(t); return true; },
    },
    sentQ: [item()], sentI: 0, sentOk: 0, sentAnswered: false, sentBand: 'רצועה',
    sentRecord: () => {},
    finishSentRound: () => { throw new Error('finishSentRound נקראה — הפריט לא נמצא'); },
    console,
  };
  vm.createContext(ctx);
  for (const n of ['sEsc', 'sBold', 'sLabel', 'sSpeak', 'sSayLbl',
                   'sentSayBtn', 'sentSayRefresh', 'sentFull',
                   'renderSentCard', 'answerSent']) {
    vm.runInContext(lift(n), ctx, { filename: 'app.js:' + n });
  }
  return { ctx, els, spoken };
}

describe('רמקול על האפשרויות · השלמת משפטים', () => {

  describe('⭐ השורה הקריטית — הסימונים נוחתים על הכפתור, לא על העטיפה', () => {

    test('disabled נוחת על ארבעת כפתורי .s-opt', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      const opts = els.sentOpts.querySelectorAll('.s-opt');
      assert.strictEqual(opts.length, 4, 'לא נמצאו ארבעה כפתורי .s-opt');
      opts.forEach((b, j) => assert.strictEqual(b.disabled, true,
        `הכפתור ${j} לא ננעל. אם הלולאה רצה על .children היא נעלה את ה-div ` +
        'ולא את הכפתור — ואז אפשר לענות פעמיים על אותה שאלה'));
    });

    test('is-right ו-✓ נוחתים על כפתור התשובה הנכונה', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);                                   // it.a === 2
      const opts = els.sentOpts.querySelectorAll('.s-opt');
      assert.ok(opts[2].classList.contains('is-right'),
        'is-right לא על כפתור התשובה הנכונה — כנראה נחת על העטיפה, שאין לה CSS כזה');
      assert.ok(opts[2].inserted.some(x => x.includes('✓')),
        'ה-✓ לא נשתל בתוך כפתור התשובה הנכונה');
    });

    test('is-wrong ו-✗ נוחתים על הכפתור שנבחר', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      const opts = els.sentOpts.querySelectorAll('.s-opt');
      assert.ok(opts[0].classList.contains('is-wrong'),
        'is-wrong לא על הכפתור שנבחר');
      assert.ok(opts[0].inserted.some(x => x.includes('✗')),
        'ה-✗ לא נשתל בתוך הכפתור שנבחר');
      assert.ok(!opts[1].classList.contains('is-wrong') && !opts[3].classList.contains('is-wrong'),
        'סומנו אפשרויות שלא נבחרו');
    });

    test('שום סימון לא נשתל בעטיפה', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      els.sentOpts.querySelectorAll('.s-optrow').forEach((row, j) => {
        assert.strictEqual(row.inserted.length, 0,
          `סימון נשתל בעטיפה ${j} במקום בכפתור`);
        assert.ok(!row.classList.contains('is-right') && !row.classList.contains('is-wrong'),
          `is-right/is-wrong נחתו על העטיפה ${j}`);
      });
    });
  });

  describe('מבנה השורה', () => {

    test('הרמקול הוא אח של הכפתור ולא צאצא שלו', () => {
      /* button בתוך button הוא HTML לא חוקי; הדפדפן מפרק את העץ. */
      const { ctx, els } = build();
      ctx.renderSentCard();
      const rows = els.sentOpts.querySelectorAll('.s-optrow');
      assert.strictEqual(rows.length, 4, 'לא נבנו ארבע עטיפות .s-optrow');
      rows.forEach((row, j) => {
        const opt = row.children.find(c => c._cls.has('s-opt'));
        const say = row.children.find(c => c._cls.has('s-say'));
        assert.ok(opt && say, `שורה ${j} חסרה כפתור או רמקול`);
        assert.strictEqual(say.parentElement, row,
          `הרמקול בשורה ${j} אינו אח של .s-opt — button בתוך button`);
        assert.strictEqual(opt.querySelectorAll('.s-say').length, 0,
          `הרמקול הוזרק **בתוך** כפתור האפשרות ${j}`);
      });
    });

    test('ארבעה רמקולים בשאלה', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 4);
    });

    test('הרמקול נשאר פעיל אחרי מענה', () => {
      /* בדיוק אז הלומד רוצה לשמוע. אם הוא היה בלולאת הנעילה הוא היה ננעל איתה. */
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      els.sentOpts.querySelectorAll('.s-say').forEach((s, j) => {
        assert.strictEqual(s.disabled, false, `הרמקול ${j} ננעל יחד עם האפשרויות`);
        assert.strictEqual(typeof s.onclick, 'function', `הרמקול ${j} איבד את המטפל`);
      });
    });
  });

  describe('לחיצה על הרמקול אינה עונה על השאלה', () => {

    test('preventDefault וגם stopPropagation', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      const say = els.sentOpts.querySelectorAll('.s-say')[0];
      let pd = 0, sp = 0;
      say.onclick({ preventDefault: () => pd++, stopPropagation: () => sp++ });
      assert.strictEqual(pd, 1, 'preventDefault לא נקרא');
      assert.strictEqual(sp, 1, 'stopPropagation לא נקרא — לחיצה תטפס ותענה על השאלה');
    });

    test('הלחיצה אינה מסמנת ואינה נועלת', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      els.sentOpts.querySelectorAll('.s-say').forEach(s =>
        s.onclick({ preventDefault: () => {}, stopPropagation: () => {} }));
      assert.strictEqual(ctx.sentAnswered, false, 'הרמקול ענה על השאלה');
      els.sentOpts.querySelectorAll('.s-opt').forEach((b, j) => {
        assert.strictEqual(b.disabled, false, `האפשרות ${j} ננעלה מלחיצה על רמקול`);
        assert.ok(!b.classList.contains('is-right') && !b.classList.contains('is-wrong'),
          `האפשרות ${j} סומנה מלחיצה על רמקול`);
        assert.strictEqual(b.inserted.length, 0, `✓/✗ נשתל מלחיצה על רמקול באפשרות ${j}`);
      });
      assert.ok(els.sentExp.classList.contains('hidden') !== false || els.sentExp._html === '',
        'ההסבר נפתח מלחיצה על רמקול');
    });
  });

  describe('מה נשמע', () => {

    test('מילה בודדת נשמעת כמו שהיא', () => {
      const { ctx, els, spoken } = build();
      ctx.renderSentCard();
      els.sentOpts.querySelectorAll('.s-say')[0]
        .onclick({ preventDefault: () => {}, stopPropagation: () => {} });
      assert.deepStrictEqual(spoken, ['pay']);
    });

    test('פריט זוג נשמע בפסיק, לא ב-" + "', () => {
      /* sLabel מציג "collect + pass" כי הפלוס אומר "שתיהן". מנוע ההקראה מבטא
         אותו "plus", ומה שנשמע הוא "collect plus pass". */
      const { ctx, els, spoken } = build();
      ctx.renderSentCard();
      els.sentOpts.querySelectorAll('.s-say')[2]
        .onclick({ preventDefault: () => {}, stopPropagation: () => {} });
      assert.deepStrictEqual(spoken, ['collect, pass']);
      assert.ok(!spoken[0].includes('+'), 'הפלוס נשלח למנוע ההקראה');
    });
  });

  describe('רמקול בהסבר', () => {

    test('רמקול על כל אחת מארבע שורות "המילים"', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      const rows = els.sentExp.querySelectorAll('.s-g');
      assert.strictEqual(rows.length, 4, 'אין ארבע שורות .s-g בהסבר');
      rows.forEach((r, j) => assert.strictEqual(r.querySelectorAll('.s-say').length, 1,
        `שורת ההסבר ${j} בלי רמקול`));
    });

    test('מושמעת המילה האנגלית, לא "pay = לשלם"', () => {
      /* it.g[j] הוא מחרוזת תצוגה עם סימן שוויון ועם עברית. המקור הנקי הוא it.o[j]. */
      const { ctx, els, spoken } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      els.sentExp.querySelectorAll('.s-g').forEach(r =>
        r.querySelectorAll('.s-say')[0].onclick({ preventDefault: () => {}, stopPropagation: () => {} }));
      assert.deepStrictEqual(spoken, ['pay', 'delay', 'collect, pass', 'refuse']);
    });

    test('הטקסט עטוף ב-.s-gt כדי שהרמקול לא יזוז בין השורות', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      assert.strictEqual(els.sentExp.querySelectorAll('.s-gt').length, 4);
    });
  });

  describe('כשאין קול אנגלי — אין כפתור, לא כפתור מושבת', () => {

    test('אין רמקולים בלי קול', () => {
      const { ctx, els } = build({ voice: false });
      ctx.renderSentCard();
      ctx.answerSent(0);
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 0);
      assert.strictEqual(els.sentExp.querySelectorAll('.s-say').length, 0);
      assert.ok(!/s-say/.test(els.sentExp.innerHTML), 'שרד רמקול במחרוזת ההסבר');
    });

    test('אין רמקולים במאגר העברי', () => {
      const { ctx, els } = build({ lang: 'he' });
      ctx.renderSentCard();
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 0,
        'רמקול אנגלי נתלה במאגר העברי');
    });

    test('העטיפה והכפתורים קיימים גם בלי קול', () => {
      const { ctx, els } = build({ voice: false });
      ctx.renderSentCard();
      ctx.answerSent(0);
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-optrow').length, 4);
      els.sentOpts.querySelectorAll('.s-opt').forEach(b =>
        assert.strictEqual(b.disabled, true, 'הנעילה נשברת כשאין רמקולים'));
    });
  });

  describe('קול שמגיע אחרי שהשאלה כבר על המסך', () => {

    test('sentSayRefresh תולה רמקולים על שאלה פתוחה', () => {
      const { ctx, els } = build({ voice: false });
      ctx.renderSentCard();
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 0);
      ctx.TTS.available = () => true;                       // הקול הגיע
      ctx.sentSayRefresh();
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 4,
        'הרמקולים לא נתלו אחרי הגעת הקול — sayBound מכסה סלקטורים בלבד');
    });

    test('הגעת קול אינה מבטלת מענה שכבר נרשם', () => {
      /* ⭐ הנימוק להזרקה מוסיפה במקום רינדור מחדש: רינדור היה מוחק את ✓/✗
         ואת disabled, כלומר פותח את השאלה לתשובה שנייה. */
      const { ctx, els } = build({ voice: false });
      ctx.renderSentCard();
      ctx.answerSent(0);
      ctx.TTS.available = () => true;
      ctx.sentSayRefresh();
      const opts = els.sentOpts.querySelectorAll('.s-opt');
      opts.forEach((b, j) => assert.strictEqual(b.disabled, true,
        `האפשרות ${j} נפתחה מחדש בגלל הגעת קול`));
      assert.ok(opts[2].classList.contains('is-right'), 'סימון התשובה נמחק בהגעת קול');
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 4);
      assert.strictEqual(els.sentExp.querySelectorAll('.s-say').length, 4,
        'שורות ההסבר לא קיבלו רמקול אחרי הגעת הקול');
    });

    test('קריאה כפולה אינה מכפילה רמקולים', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.sentSayRefresh(); ctx.sentSayRefresh();
      assert.strictEqual(els.sentOpts.querySelectorAll('.s-say').length, 4,
        'נוצרו רמקולים כפולים');
    });

    test('onvoiceschanged באמת קורא ל-sentSayRefresh', () => {
      /* בלי החוליה הזאת כל מה שלמעלה נכון ולא רץ אף פעם. */
      const hook = SRC.slice(SRC.indexOf('speechSynthesis.onvoiceschanged'),
                             SRC.indexOf('/* ===== unit exams'));
      assert.match(hook, /sentSayRefresh\(\)/,
        'onvoiceschanged אינו קורא ל-sentSayRefresh — רמקולים דינמיים לא ישוחזרו');
    });
  });

  describe('נגישות', () => {

    test('לכל רמקול aria-label ו-title', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      ctx.answerSent(0);
      const all = els.sentOpts.querySelectorAll('.s-say')
        .concat(els.sentExp.querySelectorAll('.s-say'));
      assert.strictEqual(all.length, 8);
      all.forEach((s, j) => {
        assert.ok(s.getAttribute('aria-label'), `רמקול ${j} בלי aria-label`);
        assert.strictEqual(s.title, s.getAttribute('aria-label'),
          `רמקול ${j} — title ו-aria-label אינם זהים`);
      });
    });

    test('התווית מותאמת למספר: זוג מקבל "המילים"', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      const say = els.sentOpts.querySelectorAll('.s-say');
      assert.strictEqual(say[0].getAttribute('aria-label'), 'השמע את המילה');
      assert.strictEqual(say[2].getAttribute('aria-label'), 'השמע את המילים',
        '"השמע את המילה" על פריט של שתי מילים אינו עברית תקינה');
    });

    test('הרמקול הוא type=button ולא שולח טופס', () => {
      const { ctx, els } = build();
      ctx.renderSentCard();
      els.sentOpts.querySelectorAll('.s-say').forEach(s =>
        assert.strictEqual(s.type, 'button'));
    });
  });

  describe('ה-CSS קיים בפועל', () => {
    const fs = require('fs');
    const path = require('path');
    const { ROOT } = require('./_harness/sandbox.js');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    test('לעטיפה ולרמקול יש כללים', () => {
      /* מחלקה שנוצרת בקוד ואין לה CSS = שורה שבורה על המסך, בלי שגיאה. */
      assert.match(html, /\.s-optrow\s*\{/, 'אין כלל CSS ל-.s-optrow');
      assert.match(html, /\.s-say\s*\{/, 'אין כלל CSS ל-.s-say');
      assert.match(html, /\.s-gt\s*\{/, 'אין כלל CSS ל-.s-gt');
    });

    test('יעד המגע אינו קטן מ-44px', () => {
      const rule = html.slice(html.indexOf('.s-say{'), html.indexOf('.s-say{') + 160);
      const w = (rule.match(/min-width:(\d+)px/) || [])[1];
      const h = (rule.match(/min-height:(\d+)px/) || [])[1];
      assert.ok(+w >= 44 && +h >= 44, `יעד המגע של הרמקול הוא ${w}×${h}, מתחת ל-44`);
    });

    test('.s-opt מקבל flex:1 כדי שהרמקולים יהיו על קו אחד', () => {
      assert.match(html, /\.s-optrow\s+\.s-opt\s*\{[^}]*flex:\s*1/,
        'בלי flex:1 רוחב האפשרות משתנה לפי הטקסט והרמקול קופץ בין השורות');
    });
  });
});
