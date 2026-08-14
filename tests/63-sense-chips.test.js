'use strict';
/* "יש לה עוד פירוש" · צבע במקום קטגוריה.
 *
 * מה חגי ביקש (5.8.2026)
 * -----------------------
 * "אני לא רוצה לפתוח עוד קטגוריה חדשה למילים כי זה עמוס כבר · אפשר לעשות את זה מאחורי
 * הקלעים? בוא נצבע את הפירוש שנתנו כבר בירוק, והפירושים החסרים יישארו שחורים. וגם הסבר
 * קצר על כך שחייב לכתוב שני פירושים כדי שמילה תיחשב נלמדה."
 *
 * למה זה היה נחוץ · נמדד
 * ------------------------
 * 1,107 מתוך 1,717 המונחים בעברית (64.5%) ו-1,695 מתוך 3,945 באנגלית (43%) נושאים שני
 * פירושים ומעלה, כלומר כפופים לתקרה. ביחידה 1 בעברית: 113 מתוך 190. זה רוב התרגול ולא
 * מקרה קצה · ולכן "המילים חוזרות ואני לא מבין למה" היה בלתי נמנע.
 *
 * הממצא שקבע את התיקון
 * ----------------------
 * ההסבר כבר היה קיים בקוד · "נדרש פירוש נוסף כדי שהמילה תיחשב נלמדה" · אבל הוא היה
 * עטוף ב-`ok && w2m`, כלומר הוצג **רק כשהתשובה נכונה.** מי שטעה, ובדיוק הוא זה שהמילה
 * שלו נתקעת, לא ראה אותו מעולם. הבעיה לא הייתה שההסבר קטן; הוא לא היה שם.
 *
 * הבדיקה שנושאת את כל המשקל
 * ---------------------------
 * `r.sens` שומר **אינדקסים** של `meaningSegs`, והצביעה קוראת את `meaningSegsRaw`. אם
 * החלוקה של השתיים תיפרד אי־פעם · פסיק אחד, סוגר אחד, מילת קישור אחת · הירוק יסמן את
 * הפירוש הלא נכון, והלומד ילמד שהוא יודע משהו שלא נתן. זה כשל שקט לחלוטין: שום דבר לא
 * ייראה שבור. לכן ההתאמה נאכפת על **כל 5,662 המונחים בשתי השפות** ולא על דוגמאות.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { loadApp, appSource } = require('./_harness/sandbox.js');

const app = appSource();

describe('meaningSegsRaw · אותה חלוקה בדיוק, בטקסט המקורי', () => {

  for (const lang of ['he', 'en']) {
    test(`התאמת אינדקסים על כל המאגר (${lang})`, () => {
      const ctx = loadApp({ lang });
      let checked = 0, multi = 0;
      for (const w of (ctx.BANK || [])) {
        const segs = ctx.meaningSegs(w.meaning);
        const raw = ctx.meaningSegsRaw(w.meaning);
        assert.strictEqual(raw.length, segs.length,
          `אורך שונה ב-"${w.term}" :: ${w.meaning}\n  segs=${JSON.stringify(segs)}\n  raw=${JSON.stringify(raw)}`);
        for (let i = 0; i < segs.length; i++)
          assert.strictEqual(ctx.norm(raw[i]), segs[i],
            `אינדקס ${i} אינו מתאים ב-"${w.term}" — הירוק היה מסמן פירוש אחר`);
        checked++;
        if (segs.length >= 2) multi++;
      }
      assert.ok(checked > 1000, `נבדקו רק ${checked} מונחים — המאגר לא נטען`);
      assert.ok(multi > 100, 'אין מספיק מילים רב-משמעיות במדגם — הבדיקה אינה בודקת את המקרה');
    });
  }
});

describe('senseChips · ירוק למה שנתת, שחור למה שחסר', () => {

  const ctx = loadApp({ lang: 'he' });
  const W = { term: 'בדיקה', meaning: 'ניסיון, מבחן' };

  const chips = sens => {
    ctx.stats = { words: {}, sessions: [] };
    if (sens) ctx.stats.words[ctx.K(W.term)] = { sens };
    return ctx.senseChips(W.term, W.meaning);
  };

  test('הפירוש שנתת ירוק, השני לא', () => {
    const html = chips([0]);
    assert.match(html, /<span class="sns got">ניסיון<\/span>/, 'הפירוש שנתת אינו מסומן');
    assert.match(html, /<span class="sns">מבחן<\/span>/, 'הפירוש החסר סומן בטעות');
  });

  test('כשלא נתת כלום · שניהם שחורים', () => {
    const html = chips(null);
    assert.ok(!/sns got/.test(html), 'סומן פירוש שלא ניתן');
  });

  test('מילה עם פירוש אחד מוחזרת כטקסט רגיל', () => {
    /* צבע בלי משמעות מלמד להתעלם מהצבע. אין כאן מה לצבוע ולכן אין spans. */
    ctx.stats = { words: {}, sessions: [] };
    const html = ctx.senseChips('שלום', 'ברכה');
    assert.ok(!/class="sns/.test(html), 'מילה חד-משמעית קיבלה צביעה');
  });

  test('הטקסט מוברח', () => {
    /* הפירושים מגיעים מהמאגר, אבל senseChips מוזרק כ-HTML ולכן ההברחה אינה אופציונלית. */
    ctx.stats = { words: {}, sessions: [] };
    const html = ctx.senseChips('x', '<img src=x onerror=1>, שני');
    assert.ok(!/<img/.test(html), 'תגית עברה בלי הברחה');
  });
});

describe('הדרישה מוצגת איפה שהיא נחוצה', () => {

  test('senseNeedBlock נקרא מחוץ לתנאי ok · זה כל התיקון', () => {
    /* אם מישהו יחזיר אותו לתוך `ok && w2m`, הבאג חוזר במלואו והכול ייראה תקין.
       העיגון הוא על אתר הקריאה ולא על `senseNeedBlock(w)` בלבד · המחרוזת ההיא מופיעה
       כבר בשורת ההגדרה, שקודמת בקובץ, ולכן indexOf היה מוצא אותה ולא את הקריאה. */
    const call = "(w2m ? senseNeedBlock(w) : '')";
    assert.ok(app.includes(call),
      'הקריאה אינה מותנית בכיוון בלבד — אם היא חזרה לתוך `ok && w2m`, מי שטועה לא יראה אותה');
    /* והפונקציה עצמה אינה יודעת אם התשובה הייתה נכונה · אין לה ממה להתנות. */
    const at = app.indexOf('function senseNeedBlock');
    assert.ok(!/\bok\b/.test(app.slice(at, app.indexOf('}', app.indexOf('return `', at)))),
      'senseNeedBlock מתייחסת לנכונות התשובה — היא אמורה להיות עיוורת לה');
  });

  test('התשובה שמוצגת על טעות נצבעת', () => {
    const at = app.indexOf('<div class="reveal">');
    const line = app.slice(at, at + 160);
    assert.match(line, /w2m\?senseChips\(w\.term,answer\):esc\(answer\)/,
      'הפירוש המוצג על טעות אינו מפוצל לפירושים צבועים');
  });

  test('"בעצם ידעתי" מסתיר את הדרישה, והביטול מחזיר', () => {
    /* מרגע ההצהרה התקרה הוסרה (tests/62), ולכן המשפט הפך לשקר. */
    const at = app.indexOf('wr.onclick=()=>{');
    const body = app.slice(at, at + 1700);
    assert.match(body, /const sn=\$\('#senseNeed'\); if\(sn\) hide\(sn\)/,
      'הדרישה נשארת על המסך אחרי ההצהרה — סותרת את מה שהלחיצה עשתה');
    assert.match(body, /const sn=\$\('#senseNeed'\); if\(sn\) show\(sn\)/,
      'הביטול אינו מחזיר את הדרישה');
  });

  test('ההסבר המלא מוצג פעם אחת בלבד', () => {
    const at = app.indexOf('function senseNeedBlock');
    const src = app.slice(at, at + 900);
    /* ⚠ הדגל הוא hw_sense_intro2 ולא hw_sense_intro (7.8.2026). ההסבר עצמו השתנה
       כשתקרת שני הפירושים בוטלה, ומי שכבר ראה את ההסבר הישן חייב לראות את החדש · 
       אחרת הוא נשאר עם כלל שכבר אינו קיים. מפתח חדש = הצגה מחדש לכולם. */
    assert.match(src, /LS\.get\('hw_sense_intro2', false\)/, 'אין דגל לפעם הראשונה');
    assert.match(src, /LS\.set\('hw_sense_intro2', true\)/, 'הדגל אינו נשמר — ההסבר יחזור בכל כרטיס');
  });

  test('הניסוח מיידע ואינו דורש', () => {
    /* ⚠ שוכתב 7.8.2026. הנוסח הקודם · "נדרשים שני פירושים כדי שהמילה תיחשב נלמדה" · 
       תיאר תקרה שבוטלה ב-commitSession. **טקסט שמבטיח מנגנון שאינו קיים גרוע מאין
       טקסט**: הלומד היה ממשיך לחפש פירוש שני שכבר אינו נדרש.
       הכלל החדש: לספר שיש עוד פירושים, בלי להתנות בהם. */
    const at = app.indexOf('function senseNeedBlock');
    const src = app.slice(at, at + 900);
    assert.ok(!/תיחשב נלמדה/.test(src),
      'הניסוח עדיין מבטיח תקרה שבוטלה — הלומד יחפש פירוש שני שאינו נדרש');
    assert.match(src, /פירושים/, 'הניסוח אינו מזכיר בכלל שיש עוד פירושים');
    assert.match(src, /די בפירוש אחד/, 'ההסבר אינו אומר שפירוש אחד מספיק');
    assert.ok(!/—/.test(src.slice(src.indexOf('const line'), src.indexOf('return `'))),
      'מקף ארוך בניסוח שמוצג למשתמש — HEB §3א');
  });

  test('יש סגנון לירוק ולדרישה', () => {
    const fs = require('fs'), path = require('path');
    const { ROOT } = require('./_harness/sandbox.js');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    /* לא var(--green) · הוא נמדד בדפדפן 4.27:1 על רקע הכרטיס #f6f1e7, מתחת לסף 4.5,
       והטקסט ברשימת הסיכום הוא 0.8rem כך שפטור "טקסט גדול" אינו חל. #3f6a3f נמדד 5.58.
       הצבע הזה נושא מידע · הוא ההבדל בין "נתת" ל"חסר" · ולכן חייב להיקרא. */
    assert.match(html, /\.sns\.got\{color:#3f6a3f/, 'הירוק אינו הגוון שנמדד מעל הסף');
    assert.ok(!/\.sns\.got\{[^}]*var\(--green\)/.test(html),
      'חזרה ל-var(--green) — 4.27:1, מתחת לסף הנגישות');
    assert.match(html, /\.sense-need\{[^}]*font-weight:600/,
      'הדרישה אינה בולטת מ-.also הרגיל — זו הייתה הבקשה');
  });
});
