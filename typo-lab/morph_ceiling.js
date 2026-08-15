'use strict';
/* typo-lab/morph_ceiling.js · החסם העליון · האם בכלל **קיים** פתרון
 *
 *   node typo-lab/morph_ceiling.js              ריצה מלאה · 24 המקרים
 *   node typo-lab/morph_ceiling.js --selftest   הוכחת שיניים בלבד
 *   node typo-lab/morph_ceiling.js --case 4     מקרה בודד
 *
 * ===== השאלה, וההבדל בינה לבין מה שהמעבדה שאלה עד היום =====
 *
 * שאר המעבדה מחפשת **חוק** — כלל מכליל שמוסיף קבוצת קבלות ונמדד על כל המאגר. הקובץ
 * הזה שואל את השאלה שמתחת: נניח שאנחנו לא מכלילים כלום, ורק מקבעים בטבלה את הזוג
 * (כרטיס, מחרוזת) המדויק הזה. **האם גם זה מתנגש?**
 *
 * זה החסם התחתון המוחלט של העלות. חוק, כמה צר שיהיה, מכיל בהכרח את הרשומה המקובעת
 * שלו; ולכן אם הרשומה המקובעת מתנגשת — **שום** חוק לא יפתור את המקרה, והוא מת מבנית.
 * ואם היא נקייה — המקרה בר-פתרון עקרונית, והשאלה היחידה שנשארת היא כמה צר החוק, וזו
 * שאלה אחרת לגמרי.
 *
 * ===== שלוש השאלות, אחת-לאחת =====
 *
 *   1. זהות · האם המחרוזת היא **בעצמה** תשובה קבילה של ערך אחר, בלי שום סף מרחק.
 *   2. סובלנות · האם היא נופלת בטווח של ערך אחר **בפרמטרים שנשלחים היום**.
 *   3. אילוצים קשיחים · tests/05, חמשת זוגות הצירה, שומר הנטיות.
 *
 * ===== למה ההכרעה היא meaningMatch/isCorrect ולא שכבות מפורקות =====
 *
 * אלה שתי הפונקציות ש-`check()` קוראת להן (app.js:2110 בכיוון w2m, app.js:2115
 * בכיוון m2w). כל פירוק אחר הוא מימוש שני שייסחף. הפירוק שכן יש כאן משמש **רק**
 * לשיוך השכבה בדוח, והוא נבדק מול ההכרעה עצמה: אי-התאמה נרשמת כ-`?` ואינה נבלעת.
 *
 * ===== ⚠ הלקסיקון · המלכודת שהורגת את כל המדידה בשקט =====
 *
 * `lib/ctx.js` **אינו** מזריק את `typo-lex.js`, ולכן `typoLex()` מחזיר null,
 * ולכן `nearMatch` יוצאת בשורה הראשונה (`p.useLexicon && !typoLex()`) ו**שכבת
 * הסובלנות כולה כבויה**. הקשר כזה מחזיר "נקי" על כל שאלה 2 — לא כי אין התנגשות
 * אלא כי לא נבדקה אחת. הזרקת הלקסיקון כאן היא בדיוק כמו index.html ו-tests/71:45.
 * ה-calibrate למטה רץ ב**כל** הפעלה ולא רק ב---selftest, כדי שהקשר שאיבד את
 * הלקסיקון ייפול בקול ולא ידווח ירוק ריק.
 *
 * ===== מה הקובץ הזה **אינו** =====
 *
 * הוא אינו מייצר מועמד, אינו כותב ל-out/typo-rules.json, ואינו מריץ את bank_gate.
 * הוא מודד תקרה. קבלה שהוא מסמן "נקייה" עדיין חייבת לעבור את שער המאגר ביום שבו
 * מישהו יממש אותה — פשוט מפני שהמימוש עשוי להיות רחב מהרשומה שנמדדה כאן.
 */

const fs = require('fs');
const path = require('path');

const { getCtx, ROOT } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const MG = require('./measure_gloss.js');     // CASES24
const MM = require('./measure_morph.js');     // resolveCases · האיתור האמיתי, לא העתק

const OUT = path.join(__dirname, 'out');
const MD_PATH = path.join(OUT, 'morph-ceiling-report.md');
const LEX_PATH = path.join(ROOT, 'typo-lex.js');

const say = s => process.stdout.write(s + '\n');
const md = [];
const p = s => md.push(s);

/* ===== מודל שפה ===== */

function model(L) {
  const ctx = getCtx(L);
  /* הזרקת הלקסיקון · אותה הזרקה של הדפדפן ושל tests/71. בלעדיה שכבת הסובלנות כבויה. */
  if (!ctx.typoLex()) {
    if (!fs.existsSync(LEX_PATH)) throw new Error('typo-lex.js חסר מהשורש · אי אפשר למדוד את שכבת הסובלנות');
    ctx.window.TYPO_LEX = require(LEX_PATH);
  }
  if (!ctx.typoLex()) throw new Error(`הלקסיקון לא נטען ל-${L} · nearMatch תחזיר off על הכול והמדידה תהיה ירוק ריק`);
  if (!ctx.TYPO_PARAMS || ctx.TYPO_PARAMS.enabled === false) throw new Error('TYPO_PARAMS.enabled=false · אין מה למדוד');

  const cards = Array.from(ctx.BANK).map(w => {
    const own = ctx.typoOwners(w.meaning, w);
    return {
      w, key: ctx.K(w.term), term: w.term, unit: String(w.unit),
      segs: ctx.meaningSegs(w.meaning), own,
      meanNorm: ctx.norm(w.meaning),
      meanBare: ctx.norm(String(w.meaning).replace(/\([^)]*\)/g, ' ')),
    };
  });
  return { L, ctx, cards };
}

/* ===== שיוך שכבה · צד הפירוש ===== */
/* אותו סדר של meaningMatch (app.js:1750-1778), אחד לאחד. משמש לדוח בלבד. */
function whyMeaning(M, a, B) {
  const ctx = M.ctx;
  if (!a) return null;
  if (a === B.meanNorm) return { layer: 'פירוש מלא', dist: null };
  if (a === B.meanBare) return { layer: 'פירוש בלי סוגריים', dist: null };
  if (B.segs.includes(a)) return { layer: 'מקטע', dist: null };
  if (B.segs.some(s => ctx.particleMatch(a, s))) return { layer: 'particleMatch', dist: null };
  const blocked = ctx.typoSegBlocked(a, B.segs, B.own);
  if (ctx.TYPO_GLOSS_RULES.splitOr && !blocked && ctx.typoSplitOr(B.segs).has(a)) return { layer: 'B1 · פיצול "או"', dist: null };
  if (ctx.TYPO_GLOSS_RULES.synonyms && !blocked) {
    const c = ctx.typoCanon(a);
    if (B.segs.some(s => ctx.typoCanon(s) === c)) return { layer: 'נרדפות', dist: null };
  }
  const r = ctx.nearMatch(a, B.segs, 'he', ctx.TYPO_PARAMS.gloss, ctx.SEG_VETO, B.own);
  if (r.ok) return { layer: 'סובלנות', dist: r.dist };
  return null;
}

/* ===== שיוך שכבה · צד המונח ===== */
/* acceptedKeys הוא השיקוף המוכח של ארבע השכבות המדויקות של isCorrect
   (measure_morph.validateTerm · 0 אי-התאמות ב-120,000 זוגות), והפאזית אחריו. */
function whyTerm(M, s, B) {
  const ctx = M.ctx;
  const k = ctx.K(s);
  if (!k) return null;
  if (acceptedKeys(B.w, ctx).has(k)) return { layer: 'מפתח קביל', dist: null };
  const set = M.L === 'en' ? 'en-word' : 'he-word';
  const r = ctx.nearMatch(k, ctx.typoKeysOf(B.term), M.L === 'en' ? 'en' : 'he',
    ctx.TYPO_PARAMS[set], ctx.TERM_VETO, new Set([ctx.K(B.term)]));
  if (r.ok) return { layer: 'סובלנות', dist: r.dist };
  return null;
}

/* ===== הסריקה · רשומה מקובעת אחת מול כל המאגר, בשתי השפות ובשני הכיוונים ===== */
/* allowed · המפתחות שאינם "ערך אחר": הכרטיס עצמו (כולל אותה מילה ביחידה אחרת)
   וכל נרדפת שחולקת איתו פירוש. בדיוק פטור glossAlts של bank_gate (`e.allowed`).
 *
 * ⚠ ‏`homeLang` · ההפרדה שקובעת את הפסק, והיא אינה מוסכמה שלי.
 * ‏`bank_gate.main` מריץ ‏`termSweep`/`glossSweep` **בנפרד** על ‏`models.he` ועל
 * ‏`models.en`, ו-`sweep` בונה את מפת הבעלים מ-`M.info` של אותה שפה בלבד. כלומר
 * ההגדרה של "התנגשות" בפרויקט היא **בתוך שפה**. וזה נכון מבנית ולא רק בשער:
 * ‏`LANG` הוא משתנה מודול ב-`app.js`, ‏`BANK`/`SEG_VETO`/`TERM_VETO`/`GLOSS_ALT`
 * נבנים לכל שפה בנפרד, ו-`check()` מכריע מול `deck[idx]` של החפיסה הפעילה · שתי
 * החפיסות אינן נפגשות בשום הכרעה.
 * ולכן פגיעה במאגר של השפה השנייה נספרת ומדווחת **בשמה**, אבל אינה קובעת פסק.
 * הסריקה על שתי השפות בכל זאת, כי "אין" שנמדד עדיף על "אין" שהונח. */
function probe(models, homeLang, ownerKey, allowed, S) {
  const same = [], cross = [];
  for (const M of models) {
    const ctx = M.ctx;
    const a = ctx.norm(S);   // צד הפירוש הוא עברית בשתי השפות · app.js:1751
    const isHome = M.L === homeLang;
    for (const B of M.cards) {
      if (isHome && (B.key === ownerKey || allowed.has(B.key))) continue;
      /* ההכרעה עצמה · הפונקציות ש-check() קוראת להן. */
      const mm = ctx.meaningMatch(S, B.w.meaning, B.w);
      const ic = ctx.isCorrect(S, B.term);
      if (!mm && !ic) continue;
      const bag = isHome ? same : cross;
      if (mm) {
        const w = whyMeaning(M, a, B);
        bag.push({ lang: M.L, dir: 'פירוש', card: B.term, unit: B.unit, meaning: B.w.meaning,
          layer: w ? w.layer : '?', dist: w ? w.dist : null, agree: !!w });
      }
      if (ic) {
        const w = whyTerm(M, S, B);
        bag.push({ lang: M.L, dir: 'מונח', card: B.term, unit: B.unit, meaning: B.w.meaning,
          layer: w ? w.layer : '?', dist: w ? w.dist : null, agree: !!w });
      }
    }
  }
  return { same, cross };
}

/* ===== שאלה 3 · האילוצים הקשיחים ===== */

/* א · הזוגות ש-tests/05 מקבע כ**נדחים**. רשומים בשמם עם מספר השורה, ו-verifyPinned
   מוודא בזמן ריצה שכל אחד מהם באמת נדחה היום · רשימה שלא נבדקה אינה אילוץ. */
const T05 = [
  { lang: 'en', dir: 'מונח', term: 'house', typed: '!!!', line: 53 },
  { lang: 'he', dir: 'מונח', term: 'כֹּפֶר', typed: '...', line: 54 },
  { lang: 'he', dir: 'מונח', term: 'כֹּפֶר', typed: '״', line: 55 },
  { lang: 'en', dir: 'מונח', term: 'dog', typed: 'cat', line: 59 },
  { lang: 'he', dir: 'מונח', term: 'כֹּפֶר', typed: 'שולחן', line: 60 },
  { lang: 'en', dir: 'מונח', term: 'truck, lorry', typed: 'van', line: 83 },
  { lang: 'en', dir: 'מונח', term: '1st - first', typed: 'second', line: 84 },
  { lang: 'en', dir: 'מונח', term: 'a lot', typed: 'all otter', line: 107 },
  { lang: 'en', dir: 'מונח', term: 'cat', typed: 'cathouse', line: 108 },
  { lang: 'he', dir: 'מונח', term: 'כֹּפֶר', typed: 'כפרים', line: 128, note: 'שומר הנטיות' },
  { lang: 'he', dir: 'מונח', term: 'כֹּפֶר', typed: 'ספר', line: 129 },
  { lang: 'en', dir: 'מונח', term: 'house', typed: 'elephant', line: 192 },
  { lang: 'he', dir: 'פירוש', meaning: 'פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)', typed: 'קרה', line: 215,
    note: 'מילה מתוך דוגמה בסוגריים' },
];

/* ב · חמשת זוגות הצירה. הם רשומים ב-app.js:711 כנימוק לביטול כלל הצירה, ובאותה
   צורה ב-bank_gate.js:665. מועתקים כאן ולא מיובאים כדי לא לתלות את המדידה בקובץ
   שסוכן אחר עורך במקביל · ו-verifyTsere מוודא שכל עשר ההכרעות באמת דחייה היום. */
const TSERE = [
  ['רְדִיד', 'רִדֵּד'], ['הִגִיר', 'הִגֵּר'], ['נִיכָּר', 'נֵכַר'],
  ['גִּבֵּן', 'גָבִין'], ['גִּלְעֵן', 'גַּלְעִין'],
];

function verifyPinned(models) {
  const rows = [];
  for (const t of T05) {
    const M = models.find(m => m.L === t.lang);
    const ctx = M.ctx;
    let live;
    if (t.dir === 'מונח') {
      const B = M.cards.find(c => c.term === t.term);
      live = B ? (ctx.isCorrect(t.typed, B.term) || ctx.glossAlts(B.w).some(x => ctx.isCorrect(t.typed, x)))
        : ctx.isCorrect(t.typed, t.term);
    } else {
      live = ctx.meaningMatch(t.typed, t.meaning, null);
    }
    rows.push({ t, ok: live === false, live });
  }
  return rows;
}

function verifyTsere(he) {
  const ctx = he.ctx;
  const byKey = new Map();
  for (const c of he.cards) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const rows = [];
  for (const [a, b] of TSERE) {
    const ea = byKey.get(ctx.K(a)), eb = byKey.get(ctx.K(b));
    if (!ea || !eb) { rows.push({ a, b, ok: false, note: !ea ? `"${a}" אינו במאגר` : `"${b}" אינו במאגר`, decisions: [] }); continue; }
    const decisions = [];
    const one = (from, onCard) => {
      for (const k of acceptedKeys(from.w, ctx)) {
        if (!k) continue;
        const v = ctx.isCorrect(k, onCard.term);
        decisions.push({ typed: k, card: onCard.term, accepted: v });
      }
    };
    one(ea, eb); one(eb, ea);
    const bad = decisions.filter(d => d.accepted);
    rows.push({ a, b, ok: bad.length === 0, note: bad.length ? bad.map(d => `${d.typed} → ${d.card}`).join(' · ') : `${decisions.length} הכרעות, כולן דחייה`, decisions });
  }
  return rows;
}

/* ג · שומר הנטיות · האם המחרוזת היא סיומת טהורה על מועמד של הכרטיס עצמו. */
function inflectionOf(he, C, S) {
  const ctx = he.ctx;
  const a = ctx.norm(S), k = ctx.K(S);
  const segs = C.segs;
  const keys = ctx.typoKeysOf(C.term);
  return {
    gloss: ctx.typoInflection(a, segs, 'he'),
    term: !!k && ctx.typoInflection(k, keys, 'he'),
  };
}

/* האם הרשומה המקובעת (כרטיס, מחרוזת) היא בדיוק אחת ההכרעות שאילוץ קשיח מקבע כדחייה. */
function hardHits(models, he, C, S) {
  const ctx = he.ctx;
  const out = [];
  for (const t of T05) {
    if (t.dir === 'מונח') {
      if (t.lang !== 'he') continue;
      if (ctx.K(t.term) === C.key && ctx.K(t.typed) === ctx.K(S)) out.push(`tests/05:${t.line} · ${t.typed} → ${t.term}`);
    } else {
      if (t.meaning === C.w.meaning && ctx.norm(t.typed) === ctx.norm(S)) out.push(`tests/05:${t.line} · ${t.typed} → הפירוש של ${C.term}`);
    }
  }
  const byKey = new Map();
  for (const c of he.cards) if (!byKey.has(c.key)) byKey.set(c.key, c);
  for (const [a, b] of TSERE) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (ctx.K(y) !== C.key) continue;
      const ex = byKey.get(ctx.K(x));
      if (ex && acceptedKeys(ex.w, ctx).has(ctx.K(S))) out.push(`זוג צירה · "${S}" הוא צורה קבילה של ${x}, והכרטיס הוא ${y}`);
    }
  }
  return out;
}

/* ===== כיול · השיניים · רץ בכל הפעלה =====
 * שער שלא הודגם אדום אינו עדות. כאן ההדגמה היא דו-כיוונית: הרתמה חייבת להסכים
 * עם כל הכרעה מתועדת, גם החיובית וגם השלילית. אחת מהן בלבד הייתה מאשרת רתמה
 * שאומרת "לא" על הכול (או "כן" על הכול).
 */
function calibrate(models) {
  const he = models.find(m => m.L === 'he').ctx;
  const en = models.find(m => m.L === 'en').ctx;
  const gl = 'פוחד, חושש (אשר יגורתי בא - הדבר ממנו חששתי קרה)';
  const T = [
    ['סובלנות עברית חיה · אמירר על אָמִיר', () => he.isCorrect('אמירר', 'אָמִיר'), true, 'STATE 02:50 · dist 0.2105'],
    ['⛔ התנגשות · טמיר על אָמִיר', () => he.isCorrect('טמיר', 'אָמִיר'), false, 'STATE 02:50 · collision'],
    ['⛔ מילה אמיתית · אמיד על אָמִיר', () => he.isCorrect('אמיד', 'אָמִיר'), false, 'STATE 02:50 · real-word'],
    ['סובלנות עברית חיה · מיכמוררת על מִכְמוֹרֶת', () => he.isCorrect('מיכמוררת', 'מִכְמוֹרֶת'), true, 'STATE 01:00 · dist 0.4423'],
    ['⛔ התנגשות · מכמונת על מִכְמוֹרֶת', () => he.isCorrect('מכמונת', 'מִכְמוֹרֶת'), false, 'STATE 01:00'],
    ['⛔ שומר הנטיות · כפרים על כֹּפֶר', () => he.isCorrect('כפרים', 'כֹּפֶר'), false, 'tests/05:128'],
    ['⛔ מילה מסוגריים · קרה על יגור', () => he.meaningMatch('קרה', gl, null), false, 'tests/05:215'],
    ['מקטע אמיתי · חושש על יגור', () => he.meaningMatch('חושש', gl, null), true, 'tests/05:216'],
    ['⛔ אנגלית · fought על bought', () => en.isCorrect('fought', 'bought'), false, 'STATE 10:30'],
    ['⛔ אנגלית · caughtt על bought', () => en.isCorrect('caughtt', 'bought'), false, 'STATE 01:00 · תוקן'],
  ];
  const rows = T.map(([name, fn, want, src]) => {
    let got; try { got = fn(); } catch (e) { got = 'ERR:' + e.message; }
    return { name, want, got, ok: got === want, src };
  });
  return rows;
}

/* ‏שן נוספת · הסריקה עצמה חייבת לדעת להגיד "מתנגש". שלוש רשומות מקובעות שנבנו כדי
   להתנגש (זהות, סובלנות, אילוץ קשיח) ואחת שנבנתה כדי להיות נקייה. */
function probeTeeth(models, he) {
  const ctx = he.ctx;
  const byKey = new Map();
  for (const c of he.cards) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const C = t => byKey.get(ctx.K(t));
  const owner = c => ({ key: c.key, allowed: c.own });
  const cases = [
    { name: 'זהות · "טמיר" מקובע על אָמִיר', card: C('אָמִיר'), typed: 'טמיר', want: 'מתנגש' },
    { name: 'סובלנות · "אמירר" מקובע על מִכְמוֹרֶת', card: C('מִכְמוֹרֶת'), typed: 'אמירר', want: 'מתנגש' },
    { name: 'זהות בצד הפירוש · "נסתר" מקובע על אָמִיר', card: C('אָמִיר'), typed: 'נסתר', want: 'מתנגש' },
    { name: 'נקי · "זזזזזזזז" מקובע על אָמִיר', card: C('אָמִיר'), typed: 'זזזזזזזז', want: 'נקי' },
  ];
  return cases.map(t => {
    if (!t.card) return Object.assign({}, t, { got: 'הכרטיס לא במאגר', ok: false, hits: [] });
    const o = owner(t.card);
    const r = probe(models, 'he', o.key, o.allowed, t.typed);
    const got = r.same.length ? 'מתנגש' : 'נקי';
    return Object.assign({}, t, { got, ok: got === t.want, hits: r.same, cross: r.cross });
  });
}

/* ===== ראשי ===== */

function main() {
  const T0 = Date.now();
  const argv = process.argv.slice(2);
  const selftest = argv.includes('--selftest');
  const only = argv.includes('--case') ? Number(argv[argv.indexOf('--case') + 1]) : null;

  say('=== החסם העליון · רשומה מקובעת מול כל המאגר ===');

  const he = model('he'), en = model('en');
  const models = [he, en];
  say(`מאגר: ${he.cards.length} עברית · ${en.cards.length} אנגלית · לקסיקון טעון בשתי השפות`);

  /* --- כיול --- */
  const cal = calibrate(models);
  const calBad = cal.filter(r => !r.ok);
  say('');
  say('— כיול · הרתמה מול הכרעות מתועדות —');
  for (const r of cal) say(`  ${r.ok ? '✅' : '❌'} ${r.name} · צפוי ${r.want}, התקבל ${r.got}   [${r.src}]`);
  if (calBad.length) {
    say(`⛔ ${calBad.length} אי-התאמות בכיול · המדידה אינה מודדת את מה שהיא חושבת. עוצר.`);
    process.exit(2);
  }

  /* --- שיניים של הסריקה --- */
  const teeth = probeTeeth(models, he);
  say('');
  say('— שיניים · הסריקה חייבת להאדים כשצריך, ולהישאר ירוקה כשצריך —');
  for (const t of teeth) {
    const ex = t.hits.length ? ` · ${t.hits[0].card} (${t.hits[0].layer})` : '';
    say(`  ${t.ok ? '✅' : '❌'} ${t.name} · צפוי ${t.want}, התקבל ${t.got}${ex}`);
  }
  const teethBad = teeth.filter(t => !t.ok);
  if (teethBad.length) { say('⛔ הסריקה אינה מבחינה · עוצר.'); process.exit(2); }

  /* --- האילוצים הקשיחים, מאומתים --- */
  const pinned = verifyPinned(models);
  const pinBad = pinned.filter(r => !r.ok);
  const tsere = verifyTsere(he);
  const tsereBad = tsere.filter(r => !r.ok);
  say('');
  say(`— אילוצים קשיחים —`);
  say(`  ${pinBad.length ? '❌' : '✅'} tests/05 · ${pinned.length} זוגות מקובעים, ${pinned.length - pinBad.length} נדחים היום כנדרש`);
  for (const r of pinBad) say(`     ❌ ${r.t.typed} → ${r.t.term || 'פירוש'} · מתקבל היום (tests/05:${r.t.line})`);
  const tsereDec = tsere.reduce((n, r) => n + r.decisions.length, 0);
  say(`  ${tsereBad.length ? '❌' : '✅'} זוגות הצירה · ${tsere.length} זוגות, ${tsereDec} הכרעות, כולן דחייה`);
  for (const r of tsereBad) say(`     ❌ ${r.a} ~ ${r.b} · ${r.note}`);

  if (selftest) {
    say('');
    say(`✅ selftest · כיול ${cal.length}/${cal.length} · שיניים ${teeth.length}/${teeth.length} · ${((Date.now() - T0) / 1000).toFixed(1)}ש`);
    return;
  }

  /* --- 24 המקרים --- */
  const resolved = MM.resolveCases({ ctx: he.ctx, cards: he.cards });
  const byW = new Map();
  for (const c of he.cards) byW.set(c.w, c);

  const results = [];
  say('');
  say('— 24 המקרים · רשומה מקובעת אחת לכל אחד —');
  for (const { c, card } of resolved) {
    if (only != null && c.n !== only) continue;
    const C = byW.get(card.w) || he.cards.find(x => x.key === he.ctx.K(card.w.term));
    const t1 = Date.now();
    const already = he.ctx.meaningMatch(c.typed, C.w.meaning, C.w);
    const r = probe(models, 'he', C.key, C.own, c.typed);
    const hits = r.same, cross = r.cross;
    const hard = hardHits(models, he, C, c.typed);
    const infl = inflectionOf(he, C, c.typed);
    const q1 = hits.filter(h => h.layer !== 'סובלנות');
    const q2 = hits.filter(h => h.layer === 'סובלנות');
    const verdict = already ? 'מתקבל היום' : (hits.length || hard.length) ? '⛔ מת מבנית' : '✅ נקי';
    results.push({ c, C, already, hits, cross, q1, q2, hard, infl, verdict, ms: Date.now() - t1 });
    const detail = hits.length
      ? ' · ' + hits.slice(0, 3).map(h => `${h.card}/${h.layer}`).join(' · ') + (hits.length > 3 ? ` ועוד ${hits.length - 3}` : '')
      : (hard.length ? ' · ' + hard[0] : (cross.length ? ` (חוצה-שפה בלבד: ${cross.map(h => h.card).join(', ')})` : ''));
    say(`  ${String(c.n).padStart(2)} ${c.term.padEnd(14)} "${c.typed}" → ${verdict}${detail}`);
  }

  /* --- הדוח --- */
  writeReport({ he, en, cal, teeth, pinned, tsere, results, secs: (Date.now() - T0) / 1000 });

  const dead = results.filter(r => r.verdict === '⛔ מת מבנית');
  const clean = results.filter(r => r.verdict === '✅ נקי');
  const today = results.filter(r => r.already);
  say('');
  say(`סיכום · ${clean.length} ניתנים לפתרון עקרונית · ${dead.length} מתים מבנית · ${today.length} מתקבלים כבר היום · מתוך ${results.length}`);
  say(`הדוח: ${path.relative(ROOT, MD_PATH)} · ${((Date.now() - T0) / 1000).toFixed(1)}ש`);
}

function writeReport(R) {
  const ctx = R.he.ctx;
  p('# החסם העליון · האם קיים פתרון בכלל');
  p('');
  p('נוצר על ידי `typo-lab/morph_ceiling.js`. השאלה כאן אינה "איזה חוק", אלא **האם**');
  p('רשומה מקובעת אחת — הזוג (כרטיס, מחרוזת) המדויק, בלי שום כלל מכליל — מתנגשת.');
  p('חוק צר ככל שיהיה מכיל את הרשומה שלו, ולכן רשומה שמתנגשת פירושה **מקרה מת מבנית**:');
  p('שום חוק לא יפתור אותו. רשומה נקייה פירושה שהמקרה בר-פתרון עקרונית, והשאלה שנשארת');
  p('היא רק כמה צר החוק — וזו שאלה אחרת.');
  p('');
  p('ההכרעה היא `meaningMatch` ו-`isCorrect` של `app.js` דרך ארגז החול · שתי הפונקציות');
  p('ש-`check()` קוראת להן (app.js:2110, 2115). הסריקה היא על **כל** המאגר בשתי השפות');
  p(`(${R.he.cards.length} עברית · ${R.en.cards.length} אנגלית) ובשני הכיוונים, ולא על מדגם.`);
  p('');
  p('## ⚠ הלקסיקון · מלכודת ששוברת כל מדידה שעוברת דרך `lib/ctx.js`');
  p('');
  p('`lib/ctx.js` **אינו** מזריק את `typo-lex.js`, ולכן `typoLex()` מחזיר `null` ו-`nearMatch`');
  p('יוצאת בשורה הראשונה (`p.useLexicon && !typoLex()`). כלומר **שכבת הסובלנות כולה כבויה**');
  p('בכל הקשר שנטען כך, וכל שאלה על "האם זה בטווח של ערך אחר" מקבלת שם "לא" — לא כי אין');
  p('התנגשות אלא כי לא נבדקה אחת. הקובץ הזה מזריק את הלקסיקון בעצמו, כמו `index.html`');
  p('וכמו `tests/71:45`, ומוודא בכל הפעלה שהוא נטען.');
  p('');
  p('⚠ **הבדיקה הזאת חלה גם על `measure_morph.js` ו-`measure_gloss.js`** · שניהם קוראים');
  p('ל-`ctx.meaningMatch` דרך אותו `lib/ctx.js` בלי הזרקה. זה **אינו** ממצא על מה שנשלח,');
  p('ולא נבדק כאן מה ההשפעה על המספרים שלהם · זה דגל שנמסר, לא מסקנה.');
  p('');
  p('## ⭐ ארבעת המקרים הפתוחים · התשובה');
  p('');
  p('| # | הכרטיס | הוקלד | פסק | במה |');
  p('|---|---|---|---|---|');
  for (const n of [4, 8, 14, 23]) {
    const r = R.results.find(x => x.c.n === n);
    if (!r) continue;
    const why = r.hits.length
      ? r.hits.map(h => `**${h.card}** «${h.meaning}» · ${h.layer}`).join(' · ')
      : (r.cross.length ? `אין התנגשות בעברית. חוצה-שפה בלבד: ${r.cross.map(h => `${h.card} [en] «${h.meaning}»`).join(' · ')}` : 'אין');
    p(`| ${n} | ${r.c.term} | ${r.c.typed} | ${r.already ? 'מתקבל היום' : r.verdict} | ${why} |`);
  }
  p('');
  p('**‏2 מתים · 2 נקיים.** ‏8 ו-14 מתים מפני שהמחרוזת היא **מקטע פירוש שלם** של כרטיס');
  p('עברי אחר שאינו נרדף שחולק פירוש · כלומר היא כבר התשובה הנכונה לכרטיס ההוא, בדיוק');
  p('מה שכלל אפס-ההתנגשויות קיים כדי לחסום. ‏4 ו-23 נקיים לחלוטין בעברית.');
  p('');
  p('## כיול · הרתמה מול הכרעות מתועדות');
  p('');
  p('שער שלא הודגם אדום אינו עדות. הכיול דו-כיווני בכוונה: רתמה שאומרת "נדחה" על הכול');
  p('הייתה עוברת בדיקה חד-כיוונית ומדווחת "נקי" על כל 24 המקרים. **רץ בכל הפעלה.**');
  p('');
  p('| # | ההכרעה | צפוי | התקבל | מקור |');
  p('|---|---|---|---|---|');
  R.cal.forEach((r, i) => p(`| ${i + 1} | ${r.name} | ${r.want} | ${r.ok ? '✅ ' : '❌ '}${r.got} | ${r.src} |`));
  p('');
  p('## שיניים · הסריקה עצמה');
  p('');
  p('| הרשומה המקובעת | צפוי | התקבל | מי תפס |');
  p('|---|---|---|---|');
  for (const t of R.teeth) {
    const ex = t.hits.length ? `${t.hits[0].card} · ${t.hits[0].layer}${t.hits[0].dist != null ? ` (dist ${t.hits[0].dist.toFixed(4)})` : ''}` : '—';
    p(`| ${t.name} | ${t.want} | ${t.ok ? '✅ ' : '❌ '}${t.got} | ${ex} |`);
  }
  p('');
  p('## אילוצים קשיחים · מאומתים בזמן ריצה');
  p('');
  p(`**tests/05** · ${R.pinned.length} זוגות שהבדיקה מקבעת כנדחים. כל אחד נבדק בפועל:`);
  p('');
  p('| שורה | המחרוזת | הכרטיס | נדחה היום |');
  p('|---|---|---|---|');
  for (const r of R.pinned) p(`| ${r.t.line} | \`${r.t.typed}\` | ${r.t.term || '(פירוש של יגור)'} | ${r.ok ? '✅' : '❌ מתקבל'} |`);
  p('');
  p('**זוגות הצירה** · חמישה זוגות, שני כיוונים, כל צורה קבילה ולא רק המנוקדת:');
  p('');
  p('| זוג | הכרעות | תוצאה |');
  p('|---|---|---|');
  for (const r of R.tsere) p(`| ${r.a} ~ ${r.b} | ${r.decisions.length} | ${r.ok ? '✅ כולן דחייה' : '❌ ' + r.note} |`);
  p('');
  p('## מה נספר כהתנגשות · ולמה חוצה-שפה אינו');
  p('');
  p('`bank_gate.main` מריץ `termSweep`/`glossSweep` **בנפרד** על `models.he` ועל `models.en`,');
  p('ו-`sweep` בונה את מפת הבעלים מ-`M.info` של אותה שפה בלבד. ההגדרה של "התנגשות"');
  p('בפרויקט היא **בתוך שפה**, וזה נכון מבנית ולא רק בשער: `LANG` הוא משתנה מודול,');
  p('`BANK`/`SEG_VETO`/`TERM_VETO`/`GLOSS_ALT` נבנים לכל שפה בנפרד, ו-`check()` מכריע');
  p('מול `deck[idx]` של החפיסה הפעילה. שתי החפיסות אינן נפגשות באף הכרעה.');
  p('');
  p('הסריקה כאן רצה בכל זאת על **שתי** השפות, ופגיעה במאגר האנגלי מדווחת בשמה בטור');
  p('נפרד — אבל **אינה** קובעת פסק. "אין" שנמדד עדיף על "אין" שהונח.');
  p('');
  p('## 24 המקרים');
  p('');
  p('| # | הכרטיס | המחרוזת | פסק | מי מתנגש, בשמו | חוצה-שפה (לא קובע) |');
  p('|---|---|---|---|---|---|');
  for (const r of R.results) {
    const names = r.hits.length
      ? r.hits.map(h => `**${h.card}** · ${h.dir} · ${h.layer}${h.dist != null ? ` · dist ${h.dist.toFixed(4)}` : ''}`).join(' <br> ')
      : (r.hard.length ? r.hard.join(' <br> ') : '—');
    const xs = r.cross.length ? r.cross.map(h => `${h.card} [en] · ${h.layer}`).join(' <br> ') : '—';
    p(`| ${r.c.n} | ${r.c.term} | ${r.c.typed} | ${r.already ? 'מתקבל היום' : r.verdict} | ${names} | ${xs} |`);
  }
  p('');
  const dead = R.results.filter(r => r.verdict === '⛔ מת מבנית');
  const clean = R.results.filter(r => r.verdict === '✅ נקי');
  const today = R.results.filter(r => r.already);
  p(`**${clean.length} ניתנים לפתרון עקרונית · ${dead.length} מתים מבנית · ${today.length} מתקבלים כבר היום.**`);
  p('');
  p(`### ⚠ ‏${today.length} מתקבלים היום, לא 2`);
  p('');
  p('`דוחות/מדידת-כלל-מורפולוגי.md` (5.8) ו-`typo-lab/STATE.md` רושמים ש**שניים** מתוך 24');
  p('מתקבלים כבר היום (13 בַּלָּן, 20 נָדָן), ו-`measure_morph` עדיין מחסיר 2 מכל ספירת תועלת.');
  p(`נמדד כאן על \`app.js\` של היום: **${today.length}** — ${today.map(r => `${r.c.n} ${r.c.term}`).join(' · ')}.`);
  p('');
  p('ההפרש אינו סתירה אלא **התיישנות**: מאז נשלחו שני חוקי צד-הפירוש (`TYPO_GLOSS_RULES`),');
  p('ו-`STATE.md` עצמו מייחס להם בדיוק את ארבעת המקרים האלה — B1 פותר 7 ו-15, הנרדפות');
  p('פותרות 1 ו-3. כלומר המספר "2" נכון לגרסה שבה נמדד ואינו נכון להיום.');
  p('');
  p('**ההשלכה:** כל ספירת "כמה מ-24 החוק פותר" שמחסירה 2 סופרת ארבעה מקרים שכבר סגורים.');
  p('נמסר כדגל · לא נגעתי בקוד של אף אחד.');
  p('');
  p('### ⚠ מקרה 18 · למה זה **אינו** סותר את דוח 5.8, וזו בדיוק הנקודה של הקובץ הזה');
  p('');
  p('`דוחות/מדידת-כלל-מורפולוגי.md` §א רושם שמקרה 18 (מִצְנֶפֶת · "כובע") מייצר **2 קבלות');
  p('שגויות** — תִּיתוֹרָה ומִגְבַּעַת. כאן הוא יוצא **נקי**, ושתי הקביעות נכונות:');
  p('');
  p('| | מה נמדד | התוצאה |');
  p('|---|---|---|');
  p('| דוח 5.8 | הכלל **המקל** (כל מילות התשובה נמצאות בפירוש) | ⛔ תופס גם את מִגְבַּעַת «כובע רחב שוליים» ואת תִּיתוֹרָה «שולי הכובע» |');
  p('| כאן | **רשומה מקובעת** · הזוג המדויק בלבד | ✅ "כובע" נדחה היום על שני הכרטיסים · הוא אינו מקטע שלם של אף אחד מהם |');
  p('');
  p('נבדק שורה-שורה על חמשת הכרטיסים העבריים שהמילה "כובע" מופיעה בהם:');
  p('`meaningMatch("כובע", …) = false` בכל אחד מהם. כלומר **החוק** מתנגש והרשומה לא —');
  p('וזה בדיוק ההבדל שהקובץ הזה נבנה כדי למדוד. התקרה נקייה, המימוש המכליל אינו.');
  p('');
  p('### פירוט מלא לכל מקרה');
  p('');
  for (const r of R.results) {
    p(`#### ${r.c.n} · ${r.c.term} · "${r.c.typed}"`);
    p('');
    p(`- הפירוש במאגר: ${r.C.w.meaning}`);
    p(`- מקטעים: ${r.C.segs.map(s => `\`${s}\``).join(' · ')}`);
    p(`- מנורמל: \`${ctx.norm(r.c.typed)}\``);
    p(`- **שאלה 1 · זהות** (צורה קבילה של ערך אחר, בלי סף): ${r.q1.length ? `⛔ ${r.q1.length}` : '✅ אין'}`);
    for (const h of r.q1) p(`  - **${h.card}**${h.lang === 'en' ? ' [en]' : ''} (יחידה ${h.unit}) · כיוון ${h.dir} · שכבה ${h.layer} · «${h.meaning}»`);
    p(`- **שאלה 2 · סובלנות** (בפרמטרים שנשלחים היום): ${r.q2.length ? `⛔ ${r.q2.length}` : '✅ אין'}`);
    for (const h of r.q2) p(`  - **${h.card}** (יחידה ${h.unit}) · כיוון ${h.dir} · dist ${h.dist == null ? '—' : h.dist.toFixed(4)} · «${h.meaning}»`);
    p(`- **שאלה 3 · אילוצים קשיחים**: ${r.hard.length ? '⛔ ' + r.hard.join(' · ') : '✅ אין'}`);
    p(`  - שומר הנטיות: צד הפירוש ${r.infl.gloss ? '⚠ סיומת טהורה' : 'לא'} · צד המונח ${r.infl.term ? '⚠ סיומת טהורה' : 'לא'}`);
    p(`- חוצה-שפה (מדווח, אינו קובע): ${r.cross.length ? `${r.cross.length}` : 'אין'}`);
    for (const h of r.cross) p(`  - **${h.card}** [en] (יחידה ${h.unit}) · כיוון ${h.dir} · שכבה ${h.layer} · «${h.meaning}»`);
    p('');
  }
  p('---');
  p('');
  p('## למה שלוש השאלות ממצות · ערוצי ההשפעה של רשומה מקובעת');
  p('');
  p('רשומה מקובעת על כרטיס C יכולה לשנות הכרעה של כרטיס **אחר** רק דרך מצב משותף.');
  p('קריאה של שתי הפונקציות המכריעות מראה שהמצב המשותף היחיד הוא שלוש מפות:');
  p('');
  p('- `isCorrect(input, term)` · קורא `typoKeysOf(term)` (מקומי) ו-`TERM_VETO` (משותף).');
  p('- `meaningMatch(input, meaning, card)` · קורא `meaningSegs` (מקומי), `typoOwners`');
  p('  (דרך `GLOSS_ALT`), `typoSegBlocked` ו-`nearMatch` (דרך `SEG_VETO`). `typoSplitOr`');
  p('  ו-`typoCanon` הם טבלאות סטטיות ואינם תלויים במאגר.');
  p('');
  p('מכאן שתי מסקנות, ושתיהן חשובות להערכת העלות:');
  p('');
  p('1. **רשומה מקובעת שאינה נכנסת ל-`SEG_VETO`/`TERM_VETO`/`GLOSS_ALT`** — כלומר רשימת');
  p('   היתר נבדקת בנקודת ההכרעה של הכרטיס עצמו — **אינה משנה אף הכרעה של אף כרטיס אחר**.');
  p('   זה מבני ולא הסתברותי.');
  p('2. **רשומה שכן נכנסת לווטו** מוסיפה בעלים למחרוזת. הוספת בעלים יכולה רק **להדק**');
  p('   (יותר `collision`, פער `typoNearestOther` קטן יותר) ולעולם לא ליצור קבלה חדשה.');
  p('   הסיכון שם הוא **רגרסיה** — קבלה קיימת שנעלמת — ולא קבלת-שווא.');
  p('');
  p('ולכן שאלת הבטיחות של רשומה מקובעת נחתכת במלואה על ידי שלוש השאלות למעלה.');
  p('');
  p('## מה המדידה הזאת **אינה** מוכיחה');
  p('');
  p('1. **"נקי" אינו אישור משלוח.** הוא אומר שהזוג המדויק הזה אינו מתנגש. כל מימוש');
  p('   אמיתי רחב מרשומה אחת, ולכן חייב לעבור את `bank_gate` בעצמו.');
  p('2. **התקרה היא על הבטיחות ולא על העלות.** מקרה "בר-פתרון עקרונית" עדיין יכול');
  p('   לדרוש חוק שאין לו ניסוח סביר · זו בדיוק השאלה שהסוכנים האחרים עונים עליה.');
  p('3. **הסריקה היא על המאגר של היום.** ערך חדש שייכנס מחר יכול להפוך רשומה נקייה');
  p('   למתנגשת · זה נכון לכל שכבה בפרויקט, ונאמר כאן במפורש.');
  p('');
  p(`_${R.secs.toFixed(1)} שניות._`);

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(MD_PATH, md.join('\n') + '\n', 'utf8');
}

if (require.main === module) main();
module.exports = { model, probe, whyMeaning, whyTerm, calibrate, T05, TSERE };
