'use strict';
/* שדות שהמיזוג מוחק בשקט · ומבטל תיקונים שכבר נעשו.
 *
 * שני סוכנים שלא ראו זה את זה הגיעו לאותו ממצא, מכיוונים שונים: אחד דרך הסנכרון, אחד דרך
 * אי-השוויונות בנתונים. זה מה שהעלה אותו מהשערה לעובדה.
 *
 * מה קורה
 * -------
 * saneRec היא רשימה לבנה, ויש לה שתי רשומות שנוספו לאחרונה: `sens` (אילו פירושים הלומד
 * כבר כתב, v146) ו-`k0` (הרמה שהייתה לפני סימון "ידעתי", v147). שתיהן שורדות טעינה.
 *
 * mergeProgress בונה כל רשומה **מחדש** · `{seen,first,ever,wrong,level,last}` ועוד `src`.
 * שתי הרשימות הלבנות אינן מסונכרנות זו לזו, ולכן `sens` ו-`k0` נמחקים בכל מיזוג.
 *
 * וזה לא תרחיש של שני מכשירים: flushRemoteSync ממזג בסוף כל סבב, ו-absorbDisk ממזג בין
 * שתי לשוניות. כלומר זה קורה למשתמש יחיד, כל 12 שניות.
 *
 * הנזק, בשרשרת
 * -------------
 *   sens נמחק → sensesLeft חוזר ל-2 → התקרה ב-commitSession נשארת 2 → weakCards דורש 3
 *   → מילה רב-משמעית לא יכולה לצאת מ"לחיזוק" לעולם.
 * וזו בדיוק התלונה שבגללה נכתב creditSense. התיקון היה נכון; המיזוג ביטל אותו.
 *
 *   k0 נמחק אך src:'known' שורד → unmarkKnown עושה level=int0(undefined)=0
 *   → ביטול "ידעתי" מאפס היסטוריית תרגול אמיתית, בדיוק מה ש-k0 נוסף כדי למנוע.
 *
 * ולמה max ולא "החדש מנצח"
 * -------------------------
 * `sens` הוא קבוצה של פירושים שהלומד כתב בפועל. פירוש שנכתב במכשיר אחד נכתב, נקודה · 
 * ואיחוד הוא הדבר היחיד שלא מאבד ידע אמיתי. `k0` הוא היסטוריה, ולכן הגבוה שורד: להעדיף
 * את הנמוך פירושו שסנכרון יכול להוריד רמה שהלומד השיג.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');
const { loadApp, appSource } = require('./_harness/sandbox.js');

const app = appSource();

/* ⛔ גבול הפונקציה נמדד מהסוגריים, לא ממספר קבוע.
 *
 * שלושה חלונות באורך קבוע ישבו בקובץ הזה, וכל אחד מהם שיקר לכיוון אחר:
 *
 *   · **קצר מדי** → קוד שלא נסרק, ושער שמכריז ירוק על מה שלא ראה. `mergeProgress` נסרקה
 *     בחלון של 4,000 תווים בזמן ש-`k0` ישב ב-4005 · מחוץ לחלון · והבדיקה עברה רק בזכות
 *     הערה שהזכירה את השם. תוקן ב-21.8.2026, אבל **רק בצד אחד של אותה טענה**: `saneRec`
 *     המשיכה להיקרא בחלון של 1,400 תווים בעוד אורכה 2,074, ולכן `sens` · שיושב ב-2,040 ·
 *     מעולם לא נכנס לרשימה שהשער בודק. השער הצהיר "כל שדה ש-saneRec שומר" ופסח על אחד.
 *
 *   · **ארוך מדי** → החלון בולע את הפונקציות שאחריו, והשער מוצא את מה שהוא מחפש אצל השכן.
 *     `absorbDisk` ארוכה 734 תווים והחלון קרא 6,000 · 5,266 מהם קוד זר. החלון על
 *     `mergeProgress` חרג ב-3,891 תווים, ו-`level` ו-`first` מופיעים שם ממילא · כלומר
 *     מחיקה שלהם מהמיזוג עצמו הייתה נבלעת.
 *
 * ⭐ `fnBody` מחזירה בדיוק את הפונקציה · לא פחות ולא יותר · **ומאמתת את הגבול בכך שהיא
 * מקמפלת את מה שחתכה.** סוגר שנספר בטעות בתוך מחרוזת ייפול כאן ברעש, ולא יקצר את החלון
 * בשקט. זה מה שהופך את הגבול לנמדד ולא למוצהר. */
function fnBody(name, src = app) {
  let at = src.indexOf('function ' + name);
  if (at < 0) return null;
  /* ⚠ ‏`async` נמצא **לפני** המילה function, ולכן חיתוך שמתחיל ב-function מנתק אותו
     מהגוף ו-`await` שבפנים נהיה שגיאת תחביר. flushRemoteSync ו-syncWithRemoteInner שתיהן
     async · הקימפול הוא זה שתפס את זה, והחלונות הקבועים שהיו כאן פספסו אותו בשקט. */
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      const body = src.slice(at, i + 1);
      /* מקמפל בלבד · vm.Script לא מריצה כלום. הגבול נכון רק אם מה שנחתך הוא פונקציה שלמה,
         והקימפול הוא ההוכחה לכך · הוא זורק על חיתוך באמצע. */
      new vm.Script('(' + body + ')');
      return body;
    }
  }
  return null;
}

/* השער בודק נוכחות של **שם** שדה, ולכן הערה שמזכירה אותו הספיקה כדי לצבוע אותו ירוק ·
   וזו בדיוק הדרך שבה `k0` עבר. ההערות יורדות לפני הבדיקה, ונשאר קוד. */
const codeOf = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/* ⭐ חישוב השער כולו במקום אחד, על מקור נתון · כדי ששן-ההוכחה למטה תריץ **את אותו
   שער בדיוק** על מקור מוטנטי, ולא העתק שיכול לסטות ממנו בשקט. */
function missingFields(src) {
  const sane = fnBody('saneRec', src);
  const fields = [...sane.matchAll(/out\.(\w+)\s*=/g)].map(m => m[1])
    .concat([...sane.matchAll(/\b(\w+)\s*:\s*int0\(r\./g)].map(m => m[1]));
  /* ⛔ הגוף בלבד · החלון הקודם חרג ב-3,891 תווים אל הפונקציות שאחרי, ו-`level` ו-`first`
     מופיעים שם ממילא · מחיקה שלהם מהמיזוג עצמו הייתה נמצאת אצל השכן ונבלעת.
     ו-codeOf כי נוכחות בהערה אינה העברה של שדה · כך בדיוק `k0` עבר. */
  const mp = codeOf(fnBody('mergeProgress', src));
  return [...new Set(fields)].filter(f => !new RegExp('\\b' + f + '\\b').test(mp));
}
const ctx = loadApp({ lang: 'he', bank: false });
const K = ctx.K;
const rec = o => ({ seen: 5, first: 2, ever: 3, wrong: 1, level: 3, last: 100, ...o });
const side = (term, o) => ({ stats: { words: { [K(term)]: rec(o) }, sessions: [] },
                             assoc: {}, deleted: [], added: [], dir: 'm2w' });
const merged = (a, b, term) => ctx.mergeProgress(a, b).stats.words[K(term)];

describe('sens שורד מיזוג', () => {

  test('פירוש שנכתב במכשיר אחד אינו נמחק', () => {
    const out = merged(side('x', { sens: [0, 1] }), side('x', {}), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []), [0, 1],
      'sens נמחק -- המילה תיתקע ב"לחיזוק" לנצח, וזה מבטל את creditSense');
  });

  test('פירושים משני הצדדים מתאחדים', () => {
    /* פירוש שנכתב במכשיר אחד נכתב. איחוד הוא הדבר היחיד שלא מאבד ידע אמיתי. */
    const out = merged(side('x', { sens: [0] }), side('x', { sens: [2] }), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []).sort(), [0, 2]);
  });

  test('בלי כפילויות, ועם התקרה', () => {
    const out = merged(side('x', { sens: [0, 1, 2] }), side('x', { sens: [1, 2, 3] }), 'x');
    const s = Array.from(out.sens || []);
    assert.deepStrictEqual(s.sort((p, q) => p - q), [0, 1, 2, 3]);
    assert.ok(s.length <= 8, 'התקרה של saneRec נשברה');
  });

  test('צד בלי sens אינו מוחק את הצד שיש לו', () => {
    const out = merged(side('x', {}), side('x', { sens: [1] }), 'x');
    assert.deepStrictEqual(Array.from(out.sens || []), [1]);
  });
});

describe('k0 שורד מיזוג', () => {

  test('הרמה השמורה עוברת יחד עם הסימון', () => {
    const out = merged(side('x', { src: 'known', k0: 2 }), side('x', {}), 'x');
    assert.strictEqual(out.src, 'known');
    assert.strictEqual(out.k0, 2,
      'k0 נמחק בעוד src שרד -- ביטול "ידעתי" יאפס היסטוריית תרגול אמיתית');
  });

  test('כששני הצדדים מחזיקים · הגבוה שורד', () => {
    /* להעדיף את הנמוך פירושו שסנכרון יכול להוריד רמה שהלומד השיג. */
    assert.strictEqual(merged(side('x', { src: 'known', k0: 1 }), side('x', { src: 'known', k0: 3 }), 'x').k0, 3);
  });

  test('מילה בלי סימון אינה מקבלת k0 יש מאין', () => {
    const out = merged(side('x', {}), side('x', {}), 'x');
    assert.ok(out.k0 === undefined, 'נוסף k0 למילה שלא סומנה מעולם');
  });
});

describe('שלושת מסלולי המיזוג מעבירים את יומן השחזורים', () => {
  /* mergeProgress מחסר את המשוחזרים אחרי האיחוד. מסלול שלא מעביר את היומן מחזיר את
     המחיקה מהענן, כותב אותה לדיסק ודוחף אותה בחזרה · ואז המסלול הבא, שכן מעביר, משחזר
     שוב. המילה מהבהבת פנימה והחוצה לפי מי סנכרן אחרון. */
  const sites = ['absorbDisk', 'flushRemoteSync', 'syncWithRemoteInner'];
  for (const fn of sites) {
    test(`${fn} מעביר undeleted`, () => {
      /* ⛔ הגוף ולא חלון · absorbDisk ארוכה 734 תווים והחלון הקודם קרא 6,000. פונקציה
         שאיבדה את המיזוג שלה מצאה אותו אצל השכנה שנבלעה בחלון, והשער נצבע ירוק. */
      const body = fnBody(fn);
      assert.ok(body, fn + ' נעלמה');
      const call = body.indexOf('mergeProgress(');
      assert.ok(call > 0, fn + ' אינה ממזגת בכלל');
      assert.ok(/undeleted\s*:/.test(body.slice(call, call + 320)),
        fn + ' ממזגת בלי יומן השחזורים -- מילה ששוחזרה תימחק שוב');
    });
  }
});

describe('שתי הרשימות הלבנות מסונכרנות', () => {
  test('כל שדה ש-saneRec שומר, mergeProgress מעביר', () => {
    /* זה הכלל שהיה חסר. saneRec ו-mergeProgress הן שתי רשימות לבנות נפרדות, ושדה חדש
       שנוסף לאחת ולא לשנייה נמחק בשקט בסנכרון הבא · בלי שאף בדיקה תראה. */
    /* ⚠ **שני הצדדים נמדדים, ושניהם היו שבורים.**
       הצד של mergeProgress תוקן ב-21.8.2026 (חלון 4,000 → סוף הפונקציה), אבל הצד של
       saneRec נשאר על 1,400 תווים קבועים בעוד אורכה 2,074 · ‏`sens` יושב ב-2,040 ולכן
       **מעולם לא נכנס ל-fields**, והשער שהצהיר "כל שדה" בדק תשעה מתוך עשרה. ‏`t0` ישב
       ב-1,147, ‏253 תווים מהקצה · כלומר ההערה הבאה שנוספה ל-saneRec הייתה מפילה גם אותו
       החוצה, בלי שאף בדיקה תאדים. */
    const missing = missingFields(app);
    assert.deepStrictEqual(missing, [],
      'saneRec שומר שדות ש-mergeProgress מוחק: ' + missing.join(', '));
  });

  test('הרשימה שנקראה היא הרשימה השלמה', () => {
    /* ⭐ הבדיקה שלמעלה יכולה לעבור גם כשהיא עיוורת · רשימה חסרה מייצרת `missing` ריק,
       וזה נראה בדיוק כמו הצלחה. לכן הכיסוי עצמו נטען כאן במפורש: כל שדה ש-saneRec כותבת
       ל-out חייב להופיע ברשימה שהשער בונה. זה מה שהיה תופס את `sens` ב-2,040. */
    const sane = fnBody('saneRec');
    const written = [...new Set([...sane.matchAll(/out\.(\w+)\s*=/g)].map(m => m[1])
      .concat([...sane.matchAll(/\b(\w+)\s*:\s*int0\(r\./g)].map(m => m[1])))];
    assert.ok(written.includes('sens') && written.includes('t0') && written.includes('k0'),
      'הרשימה איבדה שדה שכן קיים ב-saneRec: ' + written.join(', '));
    assert.ok(written.length >= 10, 'saneRec כותבת יותר שדות ממה שנקרא · ' + written.length);
  });

  test('הגבול הוא סוף הפונקציה, לא מספר', () => {
    /* ⛔ זו הרגרסיה שחזרה כאן שלוש פעמים באותו קובץ: מישהו כותב `app.slice(at, at + N)`,
       הבדיקה ירוקה, והקוד שמעבר ל-N שקט. השער הזה הופך את הדפוס עצמו לאדום.
       ‏`fnBody` חותכת ב-`i + 1` · חד-ספרתי, ולכן אינו נתפס · וזה ההבדל בין גבול שנמדד
       מהסוגריים לבין חלון שהוצהר במספר. */
    /* ⚠ הניסוח הראשון כאן היה `[^)]*?` · והוא לא הצליח לחצות את הסוגר של
       `app.indexOf('function mergeProgress')`, כלומר **פספס בדיוק את הצורה ההיסטורית**
       שהוא נכתב כדי לתפוס. נמצא בהזרקה חוזרת של החלון. הגבול הוא השורה, לא הסוגריים. */
    const self = codeOf(fs.readFileSync(__filename, 'utf8'));
    const windows = [...self.matchAll(/app\.slice\([^\n]*\+\s*(\d{3,})/g)].map(m => m[1]);
    assert.deepStrictEqual(windows, [],
      'חזר חלון סריקה באורך קבוע: ' + windows.join(', ') + ' · השתמש ב-fnBody');
  });

  /* ⭐ הוכחת השיניים של השער עצמו · זה המדד שנרשם ב-21.8: "בדיקה שמוסיפה שדה
     פיקטיבי ל-saneRec, מזכירה אותו רק בהערה ב-mergeProgress, ומצפה שהשער יאדים".
     המוטציה נעשית על **מחרוזת** של המקור · הקובץ עצמו אינו נגוע, ואותו שער בדיוק
     (missingFields) רץ עליה. שני הכיוונים נבדקים, כי שן שתופסת הכול אינה שן. */
  test('שן · שדה חדש ב-saneRec שמוזכר רק בהערה במיזוג — השער מאדים', () => {
    const saneOld = fnBody('saneRec');
    const mpOld = fnBody('mergeProgress');
    const saneNew = saneOld.replace('{', '{ out.zzTooth = 1;');
    const mutated = app.replace(saneOld, saneNew)
      .replace(mpOld, mpOld.replace('{', '{ /* zzTooth */'));
    assert.ok(missingFields(mutated).includes('zzTooth'),
      'השער נשאר ירוק על שדה שקיים רק בהערה · התאמת-מחרוזת חזרה, ראה codeOf');
  });

  test('שן · אותו שדה כשהוא מועבר בקוד אמיתי — השער ירוק', () => {
    /* בקרה חיובית · בלעדיה השן שלמעלה יכולה לעבור גם אם השער החל להאדים על הכול. */
    const saneOld = fnBody('saneRec');
    const mpOld = fnBody('mergeProgress');
    const saneNew = saneOld.replace('{', '{ out.zzTooth = 1;');
    const mutated = app.replace(saneOld, saneNew)
      .replace(mpOld, mpOld.replace('{', '{ var zzTooth;'));
    assert.ok(!missingFields(mutated).includes('zzTooth'),
      'השער מאדים גם על שדה שכן מועבר בקוד · הוא מחמיר מדי ויוחלף בהתעלמות');
  });
});
