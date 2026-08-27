'use strict';
/* שתי התוספות למסך השלמת המשפטים · פירוש בהקשה, ובוחן קצר.
 *
 * ‏1 · **פירוש בהקשה על מילה.** הלומד שנתקע במילה שאינו מכיר היה צריך לנחש או
 *      לצאת. עכשיו כל מילה במשפט היא כפתור, וההקשה מציגה את הפירוש מהמאגר.
 *      ⛔ **כל מילה, לא רק אלה שיש להן ערך** · הקשה על מילה שאין לה פירוש
 *      מחזירה תשובה מפורשת. הקשה שלא עושה כלום נקראת כתקלה.
 *
 * ‏2 · **בוחן אחרי כל חמש השלמות.** מוצע ואינו נכפה, ושואל על המילים שהלומד
 *      פגש בחמש השאלות האחרונות · חזרה על מה שקרה, לא נושא חדש.
 *
 * ⛔ מה שנבדק כאן ומה שלא
 * -----------------------
 * ‏`sentWordGloss` · `sqBuild` · `sqMeaning` הן פונקציות טהורות, ולכן הן
 * **מורצות** כאן מול המאגר האמיתי. ‏`renderSentCard` נוגעת ב-DOM ואינה ניתנת
 * להרמה · המבנה שהיא מייצרת נבדק ב-`tests/73`, ו-`sentTextHtml` נבדקת כאן
 * ישירות כי היא מחזירה מחרוזת.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource } = require('./_harness/sandbox.js');
const { extractFunction, extractDecl, codeMask } = (() => {
  const e = require('./_harness/extract.js');
  const s = require('./_harness/scan.js');
  return { extractFunction: e.extractFunction, extractDecl: e.extractDecl, codeMask: s.codeMask };
})();

const שורש = path.join(__dirname, '..');
const SRC = appSource();
const MASK = codeMask(SRC);

/* המאגר האמיתי · לא פיקסטורה. ⭐ בדיקה של חיפוש מילים מול מילון מומצא בודקת
   את המילון, לא את החיפוש. */
function bankEn() {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(שורש, 'data-en.js'), 'utf8'), { window: w });
  return w.UNIT_DATA_EN;
}

function ctxWith(names, extra) {
  const ctx = Object.assign({ console, Math, JSON, Set, Map, Array, Object, String, Number, RegExp }, extra);
  vm.createContext(ctx);
  for (const n of names) {
    const code = extractFunction(SRC, n, MASK) || extractDecl(SRC, n, MASK);
    assert.ok(code, `לא נמצא ב-app.js: ${n}`);
    vm.runInContext(code, ctx, { filename: 'app.js:' + n });
  }
  return ctx;
}

const לקסיקון = () => ctxWith(
  ['NIQ', 'normEn', 'SENT_SUFF', 'sentLex', 'sentWordGloss', 'sEsc', 'sentTextHtml'],
  { window: { UNIT_DATA_EN: bankEn() }, sentLexMap: null });

/* ─────────────────── 1 · הפירוש ─────────────────── */
describe('פירוש בהקשה על מילה', () => {

  test('המילון נבנה מהמאגר האמיתי ואינו ריק', () => {
    const ctx = לקסיקון();
    const n = ctx.sentLex().size;
    /* ⭐ בקרה · אם המבנה של data-en.js ישתנה, המפה תצא ריקה וכל הבדיקות
       שאחריה יעברו מהסיבה הלא נכונה. */
    assert.ok(n > 3000, `המילון מחזיק ${n} ערכים · ציפיתי לאלפים`);
  });

  test('מילה שקיימת במאגר מקבלת את הפירוש שלה', () => {
    const ctx = לקסיקון();
    const hit = ctx.sentWordGloss('pay');
    assert.ok(hit, 'המילה "pay" לא נמצאה');
    assert.ok(/[א-ת]/.test(hit.gloss), `הפירוש אינו בעברית: ${hit.gloss}`);
  });

  /* ⭐ זו התועלת האמיתית · במשפט המילים מוטות, ובמאגר הן בצורת הבסיס. */
  test('צורות מוטות נפתרות לצורת הבסיס', () => {
    const ctx = לקסיקון();
    const נבדקו = [];
    for (const w of ['paying', 'payed', 'pays', 'stopped', 'studies', 'quickly', 'used']) {
      const hit = ctx.sentWordGloss(w);
      if (hit) נבדקו.push(`${w}→${hit.form}`);
    }
    /* ⛔ לא כל השבע חייבות להיפתר · המאגר אינו מילון מלא. אבל אם **אף אחת**
       לא נפתרת, שכבת הסיומות אינה עובדת והבדיקה הזאת היא כל מה שיתפוס את זה. */
    assert.ok(נבדקו.length >= 3,
      `רק ${נבדקו.length} צורות מוטות נפתרו (${נבדקו.join(', ')}) · שכבת הסיומות אינה עובדת`);
  });

  test('מילה שאינה במאגר מחזירה null ולא ניחוש', () => {
    const ctx = לקסיקון();
    assert.strictEqual(ctx.sentWordGloss('zzqwxvb'), null);
    assert.strictEqual(ctx.sentWordGloss(''), null);
    assert.strictEqual(ctx.sentWordGloss(null), null);
  });

  test('הסיומות מסודרות מהארוכה לקצרה', () => {
    const ctx = לקסיקון();
    const i = ctx.SENT_SUFF.findIndex(x => x[0] === 'ies');
    const j = ctx.SENT_SUFF.findIndex(x => x[0] === 's');
    assert.ok(i >= 0 && j >= 0, 'חסרה סיומת מהרשימה');
    assert.ok(i < j, '"s" נבדקת לפני "ies" · "studies" ייחתך ל-"studie" ולא יימצא');
  });

  describe('המשפט שנבנה', () => {
    const html = () => לקסיקון().sentTextHtml({
      s: 'She had to ___ the bill before leaving.', o: ['pay'], a: 0
    });

    test('כל מילה היא כפתור', () => {
      const n = (html().match(/class="s-w/g) || []).length;
      assert.strictEqual(n, 7, `נמצאו ${n} כפתורי מילה, ציפיתי ל-7`);
    });

    test('החסר נשאר חסר ואינו הופך לכפתור', () => {
      const h = html();
      assert.ok(/<span class="bl">___<\/span>/.test(h), 'החסר אבד');
      assert.ok(!/class="s-w[^"]*">___/.test(h), 'החסר הפך לכפתור');
    });

    /* ⛔ המילה אינה נכתבת ל-attribute · `sEsc` אינו בורח מגרשיים. */
    test('אין data-w · הטקסט של הכפתור הוא המילה', () => {
      assert.ok(!/data-w=/.test(html()),
        'המילה נכתבת ל-attribute · sEsc אינו מגן על גרשיים והתלות שקטה');
    });

    test('מספור החסרים נשמר כשיש שניים', () => {
      const h = לקסיקון().sentTextHtml({ s: 'A ___ and a ___ here.', o: ['x'], a: 0 });
      assert.ok(/<sup aria-hidden="true">1<\/sup>/.test(h), 'חסר מספור 1');
      assert.ok(/<sup aria-hidden="true">2<\/sup>/.test(h), 'חסר מספור 2');
    });

    test('פיסוק וסימנים אינם נבלעים', () => {
      const h = לקסיקון().sentTextHtml({ s: 'Yes, ___ it & go.', o: ['x'], a: 0 });
      assert.ok(h.includes(','), 'הפסיק נעלם');
      assert.ok(h.includes('&amp;'), 'הסימן & לא הוגן');
      assert.ok(h.includes('.'), 'הנקודה נעלמה');
    });

    /* ⭐ הקו המקווקו מסמן איפה **יש** פירוש · אחרת ההקשה היא ניחוש. */
    test('מילים שיש להן פירוש מסומנות ב-has', () => {
      const n = (html().match(/class="s-w has"/g) || []).length;
      assert.ok(n >= 1, 'אף מילה לא סומנה כבעלת פירוש · הסימון אינו עובד');
    });
  });
});

/* ─────────────────── 2 · הבוחן ─────────────────── */
describe('בוחן קצר אחרי חמש השלמות', () => {

  const בוחן = () => ctxWith(
    ['NIQ', 'normEn', 'sLabel', 'sqMeaning', 'shuffle', 'sqBuild'],
    { Math });

  const פריט = (t, m) => ({ o: [t, 'x', 'y', 'z'], a: 0, g: [`${t} = ${m}`, 'x = א', 'y = ב', 'z = ג'] });
  const חמישה = () => [פריט('pay','לשלם'), פריט('halt','לעצור'), פריט('vivid','חי'),
                       פריט('scarce','נדיר'), פריט('yield','להניב')];

  test('sqMeaning מחזיר את הצד העברי בלבד', () => {
    const ctx = בוחן();
    assert.strictEqual(ctx.sqMeaning('pay = לשלם'), 'לשלם');
    assert.strictEqual(ctx.sqMeaning('לשלם'), 'לשלם');   // בלי סימן שוויון
    assert.strictEqual(ctx.sqMeaning(null), '');
  });

  test('חמישה פריטים מייצרים חמש שאלות', () => {
    const q = בוחן().sqBuild(חמישה());
    assert.strictEqual(q.length, 5, `נבנו ${q.length} שאלות`);
  });

  test('לכל שאלה יש תשובה נכונה אחת, והיא במקום שעליו a מצביע', () => {
    const ctx = בוחן();
    for (const q of ctx.sqBuild(חמישה())) {
      assert.ok(q.a >= 0 && q.a < q.opts.length, `a=${q.a} מחוץ לטווח`);
      assert.ok(q.opts[q.a], 'התשובה הנכונה ריקה');
      const n = q.opts.filter(o => o === q.opts[q.a]).length;
      assert.strictEqual(n, 1, `התשובה "${q.opts[q.a]}" מופיעה ${n} פעמים`);
    }
  });

  test('עד ארבע אפשרויות, ואין כפילויות', () => {
    for (const q of בוחן().sqBuild(חמישה())) {
      assert.ok(q.opts.length <= 4, `${q.opts.length} אפשרויות`);
      assert.strictEqual(new Set(q.opts).size, q.opts.length, 'יש אפשרות כפולה');
    }
  });

  /* ⛔ מילה בלי פירוש הייתה מייצרת שאלה שאין לה תשובה נכונה, בשקט. */
  test('פריט בלי פירוש נזרק ואינו מייצר שאלה', () => {
    const ctx = בוחן();
    const bad = { o: ['ghost','x','y','z'], a: 0, g: ['', 'x = א', 'y = ב', 'z = ג'] };
    const q = ctx.sqBuild(חמישה().concat([bad]));
    assert.ok(!q.some(x => x.term === 'ghost'), 'פריט בלי פירוש נכנס לבוחן');
  });

  test('מילה כפולה נשאלת פעם אחת', () => {
    const ctx = בוחן();
    const q = ctx.sqBuild(חמישה().concat([פריט('pay','לשלם')]));
    assert.strictEqual(q.filter(x => x.term === 'pay').length, 1, 'המילה נשאלה פעמיים');
  });

  /* ⭐ שאלה עם אפשרות אחת אינה שאלה · היא הצגה של התשובה. */
  test('פריט בודד אינו מייצר בוחן', () => {
    assert.strictEqual(בוחן().sqBuild([פריט('pay','לשלם')]).length, 0);
    assert.strictEqual(בוחן().sqBuild([]).length, 0);
  });
});

/* ─────────────────── 3 · החיווט ─────────────────── */
describe('החיווט במסך', () => {
  const app = () => SRC;
  const html = () => fs.readFileSync(path.join(שורש, 'index.html'), 'utf8');

  test('הסף הוא חמש, והמנה מתאפסת עם הסבב', () => {
    assert.ok(/SQ_EVERY\s*=\s*5\b/.test(app()), 'הסף אינו 5');
    const st = SRC.slice(SRC.indexOf('function startSentRound'), SRC.indexOf('function sentFull'));
    assert.ok(/sqBatch\s*=\s*\[\]/.test(st),
      'startSentRound אינו מאפס את המנה · הלומד יישאל על מילים מסבב קודם');
  });

  /* ⛔ הפריט נצבר ב-"הבא" ולא במענה · אחרת משפט שנעזב באמצע נספר. */
  test('הפריט נצבר במעבר לשאלה הבאה', () => {
    const nx = SRC.slice(SRC.indexOf("$('#sentNext').onclick"));
    const blk = nx.slice(0, nx.indexOf('};') + 2);
    assert.ok(/sqBatch\.push/.test(blk), 'הפריט אינו נצבר במעבר לשאלה הבאה');
    assert.ok(/sqOfferIfDue\(/.test(blk), 'הבוחן אינו מוצע');
  });

  test('הבוחן אינו נכפה · יש כפתור המשך', () => {
    assert.ok(/id="sqNo"/.test(html()), 'אין כפתור "המשך בסבב"');
    assert.ok(/\$\('#sqNo'\)\.onclick/.test(app()), 'כפתור ההמשך אינו מחווט');
    assert.ok(/\$\('#sqYes'\)\.onclick/.test(app()), 'כפתור התרגול אינו מחווט');
  });

  test('כל האלמנטים החדשים קיימים ב-index.html', () => {
    const h = html();
    for (const id of ['sentGloss','sentGlossW','sentGlossM','sentGlossX','sentHint',
                      'sqAsk','sqYes','sqNo','sqCard','sqTerm','sqOpts','sqNext','sqCount'])
      assert.ok(new RegExp(`id="${id}"`).test(h), `חסר #${id}`);
  });

  test('הפירוש נסגר ונפתח מחדש עם כל כרטיס', () => {
    const rc = SRC.slice(SRC.indexOf('function renderSentCard'), SRC.indexOf('function answerSent'));
    assert.ok(/hideSentGloss\(\)/.test(rc),
      'הפירוש של המילה הקודמת נשאר פתוח על השאלה הבאה');
  });
});

/* ─────────────────── 4 · אורך הסבב · 5 או 10 ─────────────────── */
describe('בורר אורך הסבב', () => {

  const אורך = () => ctxWith(['SENT_LENS', 'SENT_LEN_KEY', 'sentRoundLen'],
    { LS: { _v: undefined, get(k, d){ return this._v === undefined ? d : this._v; }, set(){} } });

  test('שני ערכים בדיוק · 5 ו-10', () => {
    const ctx = אורך();
    /* ⛔ `Array.from` ולא `.slice()` · מערך שנוצר בתוך ה-vm שייך לריאלם אחר,
       ו-`deepStrictEqual` נכשל על ה**פרוטוטיפ** בזמן שהתוכן זהה. המלכודת הזאת
       מתועדת ב-`_harness/sandbox.js` › `plain`, והיא תפסה גם כאן. */
    assert.deepStrictEqual(Array.from(ctx.SENT_LENS), [5, 10],
      'הערכים אינם [5,10] · חגי ביקש שניים, בלי "אחר"');
  });

  test('ברירת המחדל היא 10', () => {
    assert.strictEqual(אורך().sentRoundLen(), 10);
  });

  test('ערך שמור תקין מוחזר', () => {
    for (const v of [5, 10, '5', '10']) {
      const ctx = אורך(); ctx.LS._v = v;
      assert.strictEqual(ctx.sentRoundLen(), Number(v), `הערך ${JSON.stringify(v)} לא הוחזר`);
    }
  });

  /* ⛔ localStorage ניתן לעריכה ביד. ערך שאינו ברשימה היה מייצר סבב באורך
     שרירותי · או NaN, שחותך את החפיסה לאפס פריטים ומייצר מסך ריק. */
  test('ערך שאינו ברשימה נופל חזרה ל-10', () => {
    for (const v of [77, 0, -1, 'abc', null, {}, []]) {
      const ctx = אורך(); ctx.LS._v = v;
      assert.strictEqual(ctx.sentRoundLen(), 10, `הערך ${JSON.stringify(v)} לא נדחה`);
    }
  });

  test('startSentRound חותך לפי הבורר ולא לפי קבוע', () => {
    const st = SRC.slice(SRC.indexOf('function startSentRound'), SRC.indexOf('function sentFull'));
    assert.ok(/sentRoundLen\(\)/.test(st), 'startSentRound אינו קורא ל-sentRoundLen');
    assert.ok(!/SENT_ROUND/.test(st), 'נשאר שימוש ב-SENT_ROUND הקבוע');
    assert.ok(!/SENT_ROUND/.test(SRC), 'SENT_ROUND עדיין קיים בקובץ');
  });

  test('הבחירה נשמרת ל-localStorage ולא למשתנה', () => {
    const rl = SRC.slice(SRC.indexOf('function renderSentLen'), SRC.indexOf('function renderSentPick'));
    assert.ok(/LS\.set\(\s*SENT_LEN_KEY/.test(rl),
      'הבחירה אינה נשמרת · היא לא תשרוד רענון');
    assert.ok(/renderSentPick\(\)\s*\{\s*renderSentLen\(\)/.test(SRC),
      'מסך בחירת הרצועה אינו מצייר את הבורר');
  });

  test('הבורר קיים ב-index.html עם שני הערכים', () => {
    const h = fs.readFileSync(path.join(שורש, 'index.html'), 'utf8');
    assert.ok(/id="sentLenSeg"/.test(h), 'חסר הבורר');
    assert.ok(/data-n="5"/.test(h) && /data-n="10"/.test(h), 'חסר אחד הערכים');
    assert.ok(!/data-n="20"|אחר/.test(h.slice(h.indexOf('id="sentLenSeg"'), h.indexOf('id="sentLenSeg"') + 400)),
      'נוסף ערך שלישי · חגי ביקש שניים');
  });
});

/* ─────────────────── 5 · איפה הבוחן מוצע ─────────────────── */
describe('ההצעה אינה נופלת על מסך הסיום', () => {

  /* ⭐ ההכרעה: חלונית באמצע הסבב · כפתור במסך הסיכום. ההנמקה המלאה מעל
     `sqOfferIfDue` ב-app.js. השער כאן הוא מה שמונע חזרה לשתי חלוניות ברצף. */
  test('sqOfferIfDue אינו מציג חלונית כשהסבב נגמר', () => {
    const f = SRC.slice(SRC.indexOf('function sqOfferIfDue'), SRC.indexOf('function sqStart'));
    assert.ok(/function sqOfferIfDue\(\s*over\s*\)/.test(f),
      'sqOfferIfDue אינו יודע אם הסבב נגמר');
    assert.ok(/if\(over\)\s*return false;/.test(f),
      'החלונית נפתחת גם בסיום · שתי הצעות ברצף, ואדם לוחץ "לא" על שתיהן');
  });

  test('הקריאה מעבירה את מצב הסיום, ולפני הציור', () => {
    const nx = SRC.slice(SRC.indexOf("$('#sentNext').onclick"));
    const blk = nx.slice(0, nx.indexOf('};') + 2);
    assert.ok(/sqOfferIfDue\(sentI >= sentQ\.length\)/.test(blk),
      'מצב הסיום אינו מועבר');
    /* ⛔ לפני הציור · הציור קורא ל-finishSentRound, ואם השאלות עדיין לא נבנו
       מסך הסיכום אינו יודע שיש בוחן.
       ⚠ וההערות יורדות קודם: ההערה שמעל הקריאה **מזכירה** את שם פונקציית הציור,
       והשוואת מיקומים על טקסט עם הערות מדדה את ההערה במקום את הקוד. */
    const code = blk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(code.indexOf('sqOfferIfDue') < code.indexOf('renderSentCard'),
      'הבוחן נבנה אחרי הציור · מסך הסיכום לא יציג את הכפתור');
  });

  test('מסך הסיכום מציג כפתור בוחן רק כשיש מה לשאול', () => {
    const fr = SRC.slice(SRC.indexOf('function finishSentRound'), SRC.indexOf('function openSentPick'));
    assert.ok(/sqQ\.length >= 2/.test(fr), 'הכפתור מוצג בלי תנאי · יהיה כפתור מת');
    assert.ok(/id="sentQuizBtn"/.test(fr), 'אין כפתור בוחן במסך הסיכום');
    assert.ok(/sentQuizBtn'\)\)\s*\$\('#sentQuizBtn'\)\.onclick/.test(fr.replace(/\s+/g, ' ').replace(/ /g, '')) ||
              /\$\('#sentQuizBtn'\)\.onclick/.test(fr), 'הכפתור אינו מחווט');
  });
});
