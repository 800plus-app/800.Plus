'use strict';
/* משפט הדוגמה: ההדגשה בשני המשפטים, והפריסה לשלוש שורות.
 *
 * מה מקבעות הבדיקות כאן, וכל אחת מכשל שקרה או שהיה קורה:
 *
 * 1. **התרגום לא שוכתב.** ההדגשה בעברית נוספה על 3,946 תרגומים בכלי אוטומטי
 *    ובהשלמה של סוכנים. הסכנה האמיתית אינה סימון שגוי אלא **שכתוב שקט**: מילה
 *    ש"שופרה" תוך כדי הסימון היא שינוי תוכן שנכנס למאגר בלי ביקורת. הבדיקה
 *    משווה את התרגום שבקובץ הייצור, אחרי הסרת התגים, למקור ב-`sentences-en-he.tsv`.
 * 2. **אין תג מלבד <b>.** שני המשפטים מוזרקים ל-DOM, ולכן הם נבדקים כאן ולא
 *    "נסמכים על המחולל" — המחולל רץ בפייתון בצד אחר של הפרויקט.
 * 3. **הסימון אינו באמצע מילה.** `ה**זמן**` נראה תקין בקובץ ושבור על המסך.
 * 4. **שלוש שורות.** בגרסה הקודמת התווית והמשפט האנגלי חלקו שורה עם `<br>` אחד,
 *    ובמסך צר האנגלית נשברה באמצע. הבקשה הייתה מפורשת: תווית · אנגלית · עברית.
 * 5. **`sentFull` ממלא את החסר.** עד כה מסך ההסבר של השלמת המשפטים הציג תרגום
 *    בלבד, והמשפט האנגלי נשאר עם `___` — הלומד לא ראה את המשפט השלם מעולם.
 *    בפריט זוג יש שני חסרים ושתי מילים, והסדר קובע.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./_harness/sandbox.js');
/* מסכת קוד · כדי שבדיקת מקור לא תתאים למחרוזת שיושבת בתוך הערה */
const { codeMask, codeMatches } = require('./_harness/scan.js');

const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n');
const load = rel => {
  const w = {};
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(w);
  return w;
};

const EX = load('data-en-sentences.js').EX_SENT_EN;
const entries = Object.entries(EX);
const heSrc = new Map(src('sentences-en/sentences-en-he.tsv')
  .split('\n').filter(Boolean).map(l => l.split('\t')).map(([w, h]) => [w, h]));
const strip = s => String(s).replace(/<\/?b>/g, '');

describe('משפט הדוגמה · שלמות הנתונים', () => {
  /* ⚠ הבדיקה הראשונה דרשה הדגשה **אחת בדיוק** ונכשלה על תשעה פריטים תקינים:
     מפתח מרובה-חלקים (`both... and...`, `best-seller`) מודגש בכמה מקטעים, וזה
     התכנון. הדרישה האמיתית היא שיש הדגשה, ושהיא אינה ריקה. */
  test('כל משפט אנגלי נושא הדגשה', () => {
    const bad = entries.filter(([, [en]]) => !/<b>[^<]+<\/b>/.test(en));
    assert.strictEqual(bad.length, 0, `${bad.length} משפטים בלי הדגשה: ${bad.slice(0, 5).map(e => e[0])}`);
  });

  test('⛔ אף תרגום לא שוכתב · הסרת התגים מחזירה את המקור תו-בתו', () => {
    const bad = entries.filter(([w, [, he]]) => heSrc.has(w) && strip(he) !== heSrc.get(w));
    assert.strictEqual(bad.length, 0,
      `${bad.length} תרגומים שונו ולא רק סומנו: ${bad.slice(0, 5).map(e => e[0]).join(', ')}`);
  });

  test('אין תג מלבד <b> ואין & בשני המשפטים', () => {
    const bad = entries.filter(([, [en, he]]) => /<(?!\/?b>)/.test(en + he) || /&/.test(en + he));
    assert.strictEqual(bad.length, 0, `${bad.length} פריטים עם תג אחר: ${bad.slice(0, 5).map(e => e[0])}`);
  });

  /* ⚠ הבדיקה דרשה מקטע **אחד**, וזו הייתה הדרישה הלא נכונה לצירוף מתאם: ב-`not
     only... but also...` האנגלית מדגישה שני מקומות, ובעברית `אלא גם` נשאר בלי
     הדגשה. עד ארבעה מקטעים מותרים, וכל מקטע נבדק לגופו. */
  test('הדגשה בעברית: כל מקטע לא ריק, בגבול מילה, ועד ארבעה', () => {
    const bad = [];
    entries.forEach(([w, [, he]]) => {
      const spans = [...he.matchAll(/<b>([^<]*)<\/b>/g)];
      const opens = (he.match(/<b>/g) || []).length;
      if (!opens) return;                              // בלי הדגשה זה מצב מותר
      if (spans.length !== opens) return bad.push([w, 'תג שלא נסגר']);
      if (spans.length > 4) return bad.push([w, `${spans.length} מקטעים`]);
      spans.forEach((m, k) => {
        if (!m[1].trim()) return bad.push([w, `מקטע ${k + 1} ריק`]);
        if (m[1] !== m[1].trim()) return bad.push([w, `רווח בקצה מקטע ${k + 1}`]);
        const i = m.index, j = i + m[0].length;
        if (/[א-ת]/.test(he[i - 1] || '')) bad.push([w, `מקטע ${k + 1} מתחיל באמצע מילה`]);
        if (/[א-ת]/.test(he[j] || '')) bad.push([w, `מקטע ${k + 1} נגמר באמצע מילה`]);
      });
    });
    assert.strictEqual(bad.length, 0, bad.slice(0, 6).map(b => b.join(': ')).join(' · '));
  });

  /* ⛔ הצירוף המתאם: אם באנגלית מודגשים שני מקומות, בעברית חייבים שניים. פריט אחד
     כזה נמצא באוויר עם חצי סימון, והלומד ראה `לא רק` בלי `אלא גם`. */
  test('צירוף מתאם מודגש בשני מקומות גם בעברית', () => {
    const gap = entries.filter(([, [en, he]]) => {
      const groups = en.split(/\s+/).reduce((n, tok, i, a) =>       // קבוצות רצף של <b>
        /<b>/.test(tok) && !/<b>/.test(a[i - 1] || '') ? n + 1 : n, 0);
      return groups > 1 && /<b>/.test(he) && (he.match(/<b>/g) || []).length < 2;
    });
    assert.strictEqual(gap.length, 0,
      `${gap.length} פריטים עם חצי סימון: ${gap.map(e => e[0]).join(' · ')}`);
  });

  /* ⚠ רצפה ולא מספר מדויק. מספר מקובע נכשל ברגע שהמאגר גדל — זה קרה בשער אחר
     בפרויקט הזה, והוא דיווח "אין להעלות" על הצלחה. הרצפה מגנה מפני **נסיגה**:
     סבב שיוריד את הכיסוי ייתפס, וסבב שישפר אותו לא ייענש. */
  test('כיסוי ההדגשה בעברית אינו נסוג', () => {
    const marked = entries.filter(([, [, he]]) => /<b>/.test(he)).length;
    const pct = marked / entries.length * 100;
    assert.ok(marked >= 3900,
      `רק ${marked} מ-${entries.length} תרגומים מודגשים (${pct.toFixed(1)}%). ` +
      'הרצפה היא 3,900. ריצה: node sentences-en/mark_he.js ואז gen_sent_js.py');
  });
});

/* ⛔ כיסוי · לכל מילה במאגר האנגלי יש משפט.
 *
 * למה זה שער ולא הנחה: עד עכשיו אף בדיקה לא אכפה את זה. הקובץ הזה בדק הדגשה,
 * בריחת תגים ופריסה · כולם על המשפטים ש**קיימים** · ואיש לא בדק שהם קיימים לכולם.
 * מילה שנוספת ל-`data-en.js` בלי משפט הייתה נכנסת בשקט, ומופיעה ללומד ככרטיס
 * בלי משפט דוגמה. נמדד ב-20.8: 3,946 מתוך 3,946, אפס חסרות.
 *
 * ⚠ ו"יש מפתח" אינו "יש משפט". חמש הדרישות נבדקות בנפרד כי כל אחת נשברת לבד
 * ונראית ללומד אותו דבר · כרטיס בלי משפט:
 *   קיים · מערך של שניים · אנגלית לא ריקה · תרגום לא ריק · המילה מודגשת
 * בלי התרגום השורה השלישית בכרטיס ריקה; בלי ההדגשה הלומד לא יודע איזו מילה שלו.
 */
describe('משפט הדוגמה · כיסוי מלא של המאגר האנגלי', () => {
  const bank = load('data-en.js').UNIT_DATA_EN;
  const words = [];
  for (const rows of Object.values(bank)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const w = Array.isArray(r) ? r[0] : r;
      if (typeof w === 'string' && w.trim()) words.push(w);
    }
  }
  const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;
  const show = list => list.slice(0, 8).join(' · ') + (list.length > 8 ? ` (ועוד ${list.length - 8})` : '');

  test('לכל מילה במאגר יש ערך בקובץ המשפטים', () => {
    const missing = words.filter(w => EX[w] === undefined);
    assert.deepStrictEqual(missing, [],
      `${missing.length} מ-${words.length} מילים בלי משפט דוגמה: ${show(missing)}`);
  });

  test('כל ערך הוא [משפט, תרגום] · ושניהם אינם ריקים', () => {
    const badShape = words.filter(w => EX[w] !== undefined && (!Array.isArray(EX[w]) || EX[w].length < 2));
    assert.deepStrictEqual(badShape, [], `צורה שגויה: ${show(badShape)}`);
    const emptyEn = words.filter(w => Array.isArray(EX[w]) && !nonEmpty(EX[w][0]));
    assert.deepStrictEqual(emptyEn, [], `משפט אנגלי ריק: ${show(emptyEn)}`);
    const emptyHe = words.filter(w => Array.isArray(EX[w]) && !nonEmpty(EX[w][1]));
    assert.deepStrictEqual(emptyHe, [],
      `תרגום עברי ריק · השורה השלישית בכרטיס תופיע ריקה: ${show(emptyHe)}`);
  });

  test('בכל משפט אנגלי המילה הנלמדת מודגשת', () => {
    const noBold = words.filter(w => Array.isArray(EX[w]) && !/<b>[^<]+<\/b>/.test(String(EX[w][0])));
    assert.deepStrictEqual(noBold, [],
      `בלי הדגשה · הלומד לא יידע איזו מילה במשפט היא שלו: ${show(noBold)}`);
  });

  /* הכיוון ההפוך · משפט למילה שאינה במאגר הוא סימן שהמאגר השתנה והמשפטים לא
     עודכנו איתו. בעברית זה בדיוק מה שקרה: 1,188 משפטים נכתבו למילים שיצאו. */
  test('אין משפטים יתומים · לכל משפט יש מילה במאגר', () => {
    const inBank = new Set(words);
    const orphans = Object.keys(EX).filter(k => !inBank.has(k));
    assert.deepStrictEqual(orphans, [],
      `${orphans.length} משפטים למילים שאינן במאגר · המאגר השתנה והמשפטים לא: ${show(orphans)}`);
  });
});

describe('משפט הדוגמה · התצוגה', () => {
  const app = src('app.js');
  const html = src('index.html');

  test('exBold מחזיר <b> בלבד ובורח מכל תג אחר', () => {
    const m = app.match(/^const exBold = ([^\n]+);$/m);
    assert.ok(m, 'exBold אינו מוגדר ב-app.js');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"'`]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
    const exBold = new Function('esc', 'return ' + m[1])(esc);
    assert.strictEqual(exBold('he was <b>able</b> to'), 'he was <b>able</b> to');
    assert.strictEqual(exBold('הוא היה <b>מסוגל</b> להרים'), 'הוא היה <b>מסוגל</b> להרים');
    /* התג שאסור שיעבור. זו כל הסיבה שהפונקציה קיימת ולא הזרקה גולמית. */
    assert.ok(!/<img/.test(exBold('<img src=x onerror=alert(1)>')));
    assert.ok(!/<i>/.test(exBold('<i>נטוי</i>')));
  });

  test('שלוש שורות: תווית · אנגלית · עברית', () => {
    assert.ok(app.includes('class="ex-lbl">משפט לדוגמה<'), 'התווית אינה בשורה נפרדת');
    assert.ok(/class="ex-en"/.test(app) && /class="ex-he"/.test(app), 'חסרה שורת אנגלית או עברית');
    assert.ok(!/משפט לדוגמה: /.test(app),
      'התווית עדיין באותה שורה עם המשפט. זו הפריסה שהוחלפה.');
    ['.ex-sent .ex-lbl{display:block', '.ex-sent .ex-en{display:block',
     '.ex-sent .ex-he{display:block'].forEach(sel =>
      assert.ok(html.includes(sel), `חסר ב-CSS: ${sel}. בלי display:block הכול נשפך לשורה אחת`));
  });

  /* ⚠ נצמד ל-`exBold(` ולא ל-`exBold(window.EX_SENT_EN`. הדרישה היא שהתרגום
     יעבור דרך exBold; מאיפה נשלף הערך אינו הדרישה, וההצמדה לשם המשתנה הפילה
     את השער על ריפקטור שהתנהגותו זהה. מה שהשער חייב לתפוס · esc במקום exBold ·
     עדיין נתפס, וזה נבדק בשלילה מפורשת. */
  test('התרגום עובר דרך exBold ולא דרך esc', () => {
    const line = app.split('\n').find(l => l.includes('class="ex-he"'));
    assert.ok(line, 'שורת ex-he אינה קיימת');
    assert.ok(/exBold\(/.test(line),
      'התרגום מוצג עם esc, ולכן ההדגשה תופיע כטקסט &lt;b&gt; על המסך');
    assert.ok(!/\besc\(/.test(line), 'התרגום עובר דרך esc · ההדגשה תיראה כטקסט');
  });

  /* ⛔ הבאג שמשתמש דיווח עליו: "לא לכל מילה יש משפט אבל להרוב". הדאטה שלמה
     (3,946/3,946) · מה שנכשל היה התזמון. הקובץ 706KB נטען ברקע, וההגשה בדקה
     אותו סינכרונית, ולכן הכרטיסים הראשונים נפתחו בלי משפט ולא רונדרו מחדש.
     שלוש הדרישות שמונעות את חזרתו, וכל אחת נבדקה על קוד שבור בכוונה. */
  test('כרטיס שנפתח לפני שקובץ המשפטים ירד מקבל את המשפט כשהוא מגיע', () => {
    assert.ok(/function fillExSent\(/.test(app),
      'fillExSent הוסרה · כרטיס שהקדים את הטעינה יישאר בלי משפט לתמיד');
    assert.ok(/id="exSentSlot"/.test(app),
      'אין עוגן להזרקה · אין לאן למלא את המשפט כשהקובץ מגיע');
    /* בלי בדיקת המילה, לומד שהספיק לעבור כרטיס יקבל את המשפט של הקודם */
    const fn = app.slice(app.indexOf('function fillExSent('));
    assert.ok(/dataset\.term\s*===/.test(fn.slice(0, 400)),
      'fillExSent אינה מוודאת שהלומד עדיין על אותו כרטיס');
    /* וההגשה לא ממתינה לרשת: המילוי קורה אחרי שהפאנל כבר הוצג.
       ⛔ דרך `codeMask` ולא `indexOf` גולמי. הגרסה הראשונה של הבדיקה הזאת עברה
       גם כשהקריאה הייתה `//fillExSent(w.term);` · המחרוזת נמצאת גם בתוך הערה,
       וזה בדיוק הכשל ש-`CLAUDE.md` מונה: שער שבודק את הדבר הלא נכון. */
    const mask = codeMask(app);
    const shown = codeMatches(app, /fb\.classList\.remove\('hidden'\)/, mask);
    assert.ok(shown.length, "לא נמצאה הצגת הפאנל בקוד ממשי");
    const at = shown[0].index;
    const calls = codeMatches(app, /fillExSent\(/, mask).filter(h => h.index > at && h.index - at < 200);
    assert.ok(calls.length,
      'fillExSent אינה נקראת בקוד ממשי מיד אחרי הצגת הפאנל · כרטיס שהקדים את הטעינה יישאר ריק');
  });
});

describe('השלמת משפטים · המשפט המלא באנגלית', () => {
  const app = src('app.js');
  /* מחלץ את `sentFull` ואת `sEsc` מהמקור ומריץ אותם באמת: בדיקה שמחפשת מחרוזת
     בקוד מאשרת שהקוד נכתב, ולא שהוא עושה את הדבר הנכון. */
  const pick = name => {
    const i = app.indexOf(`function ${name}(`);
    assert.ok(i > 0, `${name} אינו קיים`);
    const j = app.indexOf('\n}', i);
    return app.slice(i, j + 2);
  };
  const mSEsc = app.match(/^const sEsc = ([\s\S]*?);$/m);
  const sentFull = new Function('sEsc', pick('sentFull') + '; return sentFull;')(
    new Function('return ' + mSEsc[1])());

  test('החסר מתמלא בתשובה ומודגש', () => {
    const out = sentFull({ s: 'The team ___ the plan quickly.', o: ['adopted', 'x'], a: 0 });
    assert.strictEqual(out, 'The team <b>adopted</b> the plan quickly.');
  });

  test('פריט זוג: שתי המילים לפי סדר החסרים', () => {
    const out = sentFull({ s: 'They ___ on goals but ___ on method.', o: [['align', 'differ']], a: 0 });
    assert.strictEqual(out, 'They <b>align</b> on goals but <b>differ</b> on method.');
  });

  test('התשובה הנכונה נלקחת מ-a ולא מהראשונה', () => {
    const out = sentFull({ s: 'She ___ the offer.', o: ['refused', 'accepted'], a: 1 });
    assert.strictEqual(out, 'She <b>accepted</b> the offer.');
  });

  test('הסבר השלמת משפטים מציג אנגלית מעל עברית', () => {
    const i = app.indexOf('<h4>המשפט</h4>');
    assert.ok(i > 0, 'מקטע המשפט אינו קיים בהסבר');
    const seg = app.slice(i, i + 400);
    assert.ok(seg.indexOf('s-en') < seg.indexOf('s-tr'),
      'התרגום מופיע לפני המשפט באנגלית. הסדר שנקבע: אנגלית ואז עברית');
    const html = src('index.html');
    assert.ok(html.includes('.s-en{direction:ltr'), 'חסר CSS ל-.s-en');
    /* ⚠ ניגודיות: var(--green) נמדד 4.27:1 על רקע הכרטיס, מתחת לסף 4.5, וטקסט
       מודגש ב-16px אינו "טקסט גדול". הצבע החזק חייב להישאר. */
    assert.ok(/\.s-en b, \.s-tr b\{color:#3f6a3f/.test(html),
      'המילה המודגשת חזרה לירוק החלש (4.27:1)');
  });
});
