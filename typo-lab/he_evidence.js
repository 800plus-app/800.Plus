'use strict';
/* he_evidence.js · מודל שגיאות אמפירי לעברית, נמדד על המאגר העברי האמיתי.
 *
 * השאלה: ‏23.73% ה-recall של he-word נמדד מול הטקסונומיה הסינתטית שאנחנו כתבנו
 * (lib/taxonomy-he.js). המדידה כאן שוברת את המעגליות: היא מגדירה מחלקות שגיאה
 * מ**מכניקת ההקלדה** (פריסת מקלדת פיזית, אימות קריאה, ניקוד, רווחים, מיתוג מקלדת),
 * מייצרת אותן על כל 1,719 ערכי המאגר, ומודדת לכל מחלקה בנפרד:
 *
 *   today  · מתקבל כבר לפני שכבת הסובלנות  (acceptsToday · TYPO_PARAMS.enabled=false)
 *   live   · מתקבל בהתנהגות המלאה של האפליקציה (acceptsLive · כולל nearMatch + לקסיקון)
 *   veto   · המחרוזת היא מילת מאגר של ערך אחר · חייבת להידחות לנצח
 *   lex    · המחרוזת היא מילה עברית אמיתית שאינה התשובה · חייבת להידחות
 *   free   · נדחית, ואף אחד לא תובע אותה · **זו השארית, וזה מה שאפשר לפתוח**
 *
 * ⚠ הזרקת typo-lex.js חובה. בלעדיה typoLex() מחזירה null, nearMatch יוצאת בשורה
 *   הראשונה, ו-acceptsLive הוא שקר. יש כאן שער-שיניים שנופל אם ההזרקה לא עשתה כלום.
 *
 * שימוש:  node typo-lab/he_evidence.js [--json out/he-evidence.json]
 */

const fs = require('fs');
const path = require('path');
const { getCtx, ROOT } = require('./lib/ctx.js');
const { acceptedKeys, acceptsToday, acceptsLive } = require('./lib/keys.js');
const { buildVeto, isVetoedTerm } = require('./lib/veto.js');
const TAX = require('./lib/taxonomy-he.js');

/* ===== הקשר ריצה ===== */
const ctx = getCtx('he');
const LEX = require(path.join(ROOT, 'typo-lex.js'));
ctx.window.TYPO_LEX = LEX;                       // בלי זה השכבה כבויה · ראה שער השיניים למטה
const veto = buildVeto(ctx, 'he');

const K = s => ctx.K(s);
const NIQ = /[֑-ֽֿ-ׇ]/g;
const HE = /[א-ת]/;
const stripNiq = s => String(s).normalize('NFKC').replace(NIQ, '');

/* ===== מיפוי המקלדת · פריסה ישראלית תקנית, מקש-מול-מקש עם QWERTY ===== */
/* q w e r t y u i o p / a s d f g h j k l ; / z x c v b n m , . */
const EN_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.']
];
const HE2EN = new Map(), EN2HE = new Map();
for (let r = 0; r < TAX.ROWS.length; r++)
  for (let c = 0; c < TAX.ROWS[r].length; c++) {
    const h = TAX.ROWS[r][c], e = EN_ROWS[r][c];
    if (!HE.test(h)) continue;
    HE2EN.set(h, e); EN2HE.set(e, h);
  }

/* ===== עזרים ===== */
const TOFIN = { 'נ': 'ן', 'מ': 'ם', 'כ': 'ך', 'פ': 'ף', 'צ': 'ץ' };
const FROMFIN = TAX.FINAL_FOLD;
const letters = s => (String(s).match(/[א-ת]/g) || []).length;

/* ⛔ הבסיס · הטעות שהגרסה הראשונה עשתה, והיא נתפסה בדוגמאות ולא בהנחה.
   נבחרה "הצורה הארוכה ביותר ש-heForms מייצרת", והיא נתנה `אווטווביווגרפייה` עבור
   אוֹטוֹבִּיוֹגְרַפְיָה: `pleneVav` מכפילה גם ו שנושאת חולם, והיא **מכוונת להיות מתירנית**
   (הערת app.js:686) — כלומר צורה שמתקבלת, לא צורה שמקלידים. בסיס כזה מנפח את
   השארית הפנויה ומייצר טעויות שאיש אינו מקליד.
   הבסיס הנכון הוא הכתיב המלא התקני: `fullSpelling` משחזרת אמות קריאה מהניקוד עצמו,
   ו-`pleneYod` מכפילה יוד עיצורית (סייס, מניין). ‏`pleneVav` **אינה** נכנסת לבסיס. */
const firstAlt = t => String(t).split(/[\/|,]|\s-\s/)[0].trim() || String(t);
function typedForm(term) {
  let t = firstAlt(term);
  try { t = ctx.pleneYod(t); } catch (e) { }
  try { t = ctx.fullSpelling(t); } catch (e) { }
  return t;
}
/* צורת התצוגה · מה שהלומד מקליד: כתיב מלא, בלי ניקוד, עם אותיות סופיות. */
function displayForm(term) { return stripNiq(typedForm(term)).replace(/[־]/g, '-').replace(/\s+/g, ' ').trim(); }
/* מפתח הבסיס · אותה צורה, מנורמלת (סופיות מקופלות, פיסוק מוסר). */
function baseKeyOf(card) { return K(displayForm(card.term)); }

const perWord = TAX.perWord;
const opGen = name => { const o = TAX.OPS.find(x => x.name === name); return o; };

/* ===== המחוללים · מחלקה = מנגנון הקלדה אחד ===== */

/* מכניקה מוטורית */
const genAdj = perWord(w => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const n = TAX.ADJ.get(w[i]); if (!n) continue;
    for (const c of n) out.push(w.slice(0, i) + c + w.slice(i + 1));
  }
  return out;
});
const genTranspose = perWord(w => {
  const out = [];
  for (let i = 0; i + 1 < w.length; i++) if (w[i] !== w[i + 1]) out.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  return out;
});
const genDrop = perWord(w => {
  const out = []; if (w.length <= 2) return out;
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i) + w.slice(i + 1));
  return out;
});
const genDouble = perWord(w => {
  const out = [];
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1));
  return out;
});
/* אות שכנה שנדחפה פנימה · האצבע פגעה בשני מקשים */
const genInsAdj = perWord(w => {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const n = TAX.ADJ.get(w[i]); if (!n) continue;
    for (const c of n) { out.push(w.slice(0, i) + c + w.slice(i)); out.push(w.slice(0, i + 1) + c + w.slice(i + 1)); }
  }
  return out;
});

/* אימות קריאה · שתי מחלקות נפרדות, כי הן לא אותה טעות */
const M = ['ו', 'י'];
const genMaterDel = perWord(w => {
  const out = []; if (w.length < 3) return out;
  for (let i = 1; i < w.length - 1; i++) if (M.includes(w[i])) out.push(w.slice(0, i) + w.slice(i + 1));
  for (const m of M) if (w.includes(m + m)) out.push(w.split(m + m).join(m));
  return out;
});
const genMaterAdd = perWord(w => {
  const out = []; if (w.length < 3) return out;
  for (let i = 1; i < w.length - 1; i++) for (const m of M) {
    const v = w.slice(0, i) + m + w.slice(i);
    if (TAX.isParticipleShape(w, v)) continue;                 // כבש→כובש אינו טעות אלא מילה אחרת
    out.push(v);
  }
  for (const m of M) { let i = w.indexOf(m); while (i >= 0) { if (i > 0 && i < w.length - 1) { const v = w.slice(0, i) + m + w.slice(i); if (!TAX.isParticipleShape(w, v)) out.push(v); } i = w.indexOf(m, i + 1); } }
  return out;
});

/* הומופונים · לפי זוג, כדי שנדע איזה זוג עולה כמה */
const HOMO = [['ת', 'ט'], ['כ', 'ק'], ['א', 'ע'], ['ס', 'ש'], ['ח', 'כ'], ['ב', 'ו']];
const genHomo = perWord(w => {
  const out = [];
  for (let i = 0; i < w.length; i++) for (const [x, y] of HOMO) {
    if (w[i] === x) out.push(w.slice(0, i) + y + w.slice(i + 1));
    if (w[i] === y) out.push(w.slice(0, i) + x + w.slice(i + 1));
  }
  if (w.length >= 3) { const L = w.length - 1; if (w[L] === 'ה') out.push(w.slice(0, L) + 'א'); if (w[L] === 'א') out.push(w.slice(0, L) + 'ה'); }
  return out;
});

/* ===== המחלקות ===== */
/* base: 'key' = מפתח מנורמל · 'disp' = צורת התצוגה עם סופיות · 'raw' = המונח כפי שנשמר */
const CLASSES = [
  { id: 'KB-ADJ', he: 'מקש שכן · החלפה', base: 'key', gen: genAdj },
  { id: 'KB-INS', he: 'מקש שכן · אות נדחפה', base: 'key', gen: genInsAdj },
  { id: 'KB-TRANS', he: 'היפוך שתי אותיות', base: 'key', gen: genTranspose },
  { id: 'KB-DROP', he: 'אות נשמטה', base: 'key', gen: genDrop },
  { id: 'KB-DOUBLE', he: 'אות הוקלדה פעמיים', base: 'key', gen: genDouble },
  { id: 'SP-MATER-DEL', he: 'כתיב חסר · ו/י נמחקה', base: 'key', gen: genMaterDel },
  { id: 'SP-MATER-ADD', he: 'כתיב מלא · ו/י נוספה', base: 'key', gen: genMaterAdd },
  { id: 'SP-HOMO', he: 'הומופון · ת/ט כ/ק א/ע ס/ש ח/כ ב/ו', base: 'key', gen: genHomo },

  /* מחלקות שהטקסונומיה הסינתטית **אינה מכילה כלל** */
  {
    id: 'FIN-FORM', he: 'אות סופית שגויה (מ/ם נ/ן כ/ך פ/ף צ/ץ)', base: 'disp',
    gen: d => {
      const out = [];
      const words = String(d).split(' ');
      for (let w = 0; w < words.length; w++) {
        const s = words[w]; if (!s) continue;
        const vs = [];
        const last = s[s.length - 1];
        if (FROMFIN[last]) vs.push(s.slice(0, -1) + FROMFIN[last]);         // סופית → רגילה בסוף
        if (TOFIN[last]) vs.push(s.slice(0, -1) + TOFIN[last]);             // רגילה → סופית בסוף
        for (let i = 0; i < s.length - 1; i++) if (TOFIN[s[i]]) vs.push(s.slice(0, i) + TOFIN[s[i]] + s.slice(i + 1)); // סופית באמצע
        for (const v of vs) { const c = words.slice(); c[w] = v; out.push(c.join(' ')); }
      }
      return out;
    }
  },
  {
    id: 'NIQ-FULL', he: 'הוקלד עם הניקוד המלא', base: 'raw',
    gen: t => [String(t)]
  },
  {
    id: 'NIQ-PART', he: 'הוקלד עם ניקוד חלקי', base: 'raw',
    gen: t => {
      const s = String(t).normalize('NFKC'); let n = 0;
      const half = s.replace(/[֑-ֽֿ-ׇ]/g, m => (n++ % 2 === 0 ? m : ''));
      const first = s.replace(/[֑-ֽֿ-ׇ]/g, (m, o) => (o < s.length / 2 ? m : ''));
      return [half, first];
    }
  },
  {
    id: 'NIQ-WRONG', he: 'הוקלד עם ניקוד שגוי', base: 'raw',
    gen: t => {
      const s = String(t).normalize('NFKC');
      const SWAP = { 'ַ': 'ָ', 'ָ': 'ַ', 'ִ': 'ֵ', 'ֵ': 'ִ', 'ֶ': 'ֵ', 'ֹ': 'ֻ', 'ֻ': 'ֹ', 'ְ': 'ֶ' };
      return [s.replace(/[֑-ֽֿ-ׇ]/g, m => SWAP[m] || m)];
    }
  },
  {
    id: 'SPC-JOIN', he: 'ביטוי רב-מילתי הודבק בלי רווח', base: 'disp',
    gen: d => String(d).includes(' ') ? [String(d).replace(/\s+/g, '')] : []
  },
  {
    id: 'SPC-SPLIT', he: 'רווח נדחף לתוך מילה אחת', base: 'disp',
    gen: d => {
      const s = String(d); if (s.includes(' ') || letters(s) < 4) return [];
      const out = []; for (let i = 2; i < s.length - 1; i++) out.push(s.slice(0, i) + ' ' + s.slice(i));
      return out;
    }
  },
  {
    id: 'SPC-DASH', he: 'מקף / מקף עברי במקום רווח', base: 'disp',
    gen: d => String(d).includes(' ') ? ['-', '־', ' - '].map(x => String(d).replace(/\s+/g, x)) : []
  },
  {
    id: 'PUNCT', he: 'גרש · גרשיים · נקודה · רווח עודף', base: 'disp',
    gen: d => {
      const s = String(d); const out = [s + '.', s + '׳', ' ' + s + ' ', s + '"'];
      if (s.length > 2) out.push(s.slice(0, -1) + '״' + s.slice(-1));
      return out;
    }
  },
  {
    id: 'LAYOUT', he: 'המקלדת נשארה באנגלית · ג׳יבריש לטיני', base: 'disp',
    gen: d => {
      let out = '';
      for (const c of String(d)) { if (c === ' ') { out += ' '; continue; } const e = HE2EN.get(c); if (!e) return []; out += e; }
      return out ? [out] : [];
    }
  },
];

/* ===== המדידה ===== */
/* איזו שכבה דוחה · נלקח מ-nearMatch עצמה ולא משוחזר. זה מה שהופך את השארית מ"מספר"
   ל"רשימת יעדים": `far` = סף הרצועה · `short` = שער האורך · `collision` = שולי
   הדו-משמעות · `inflection` = שומר הנטיות · `real-word` = הלקסיקון. */
function whyRejected(card, typed) {
  try {
    const r = ctx.nearMatch(K(typed), ctx.typoKeysOf(card.term), 'he',
      ctx.TYPO_PARAMS['he-word'], ctx.TERM_VETO, new Set([K(card.term)]));
    return r.ok ? 'ok' : (r.why || 'far');
  } catch (e) { return 'err:' + e.message.slice(0, 30); }
}

/* ===== קונטרה-פקטואל · מה כל שחרור קונה, ומה הוא משלם =====
   כל מועמד רץ דרך `nearMatch` **האמיתית** עם עותק של הפרמטרים ששונה בגן אחד.
   ⚠ שכבות הווטו והלקסיקון יושבות בתוך nearMatch ולפני חישוב המרחק, ולכן הן ממשיכות
   לחסום גם בקונטרה-פקטואל · "קבלת-שווא" כאן פירושה מחרוזת שהן **פספסו**. */
const BASE_P = ctx.TYPO_PARAMS['he-word'];
const clone = o => JSON.parse(JSON.stringify(o));
const CF = [
  { id: 'CF-homo', he: 'הומופון זול · W.homophone 1.14→0.5', p: (() => { const p = clone(BASE_P); p.W.homophone = 0.5; p.WTight.homophone = 0.5; return p; })() },
  { id: 'CF-mater', he: 'כתיב מלא/חסר זול · W.materVI 1.72→0.5', p: (() => { const p = clone(BASE_P); p.W.materVI = 0.5; p.WTight.materVI = 0.5; return p; })() },
  { id: 'CF-adj', he: 'מקש שכן זול · W.adjSub 2→0.5', p: (() => { const p = clone(BASE_P); p.W.adjSub = 0.5; p.WTight.adjSub = 0.5; return p; })() },
  { id: 'CF-bands', he: 'כל רצועה ≥1.0 (בלי לגעת במשקלים)', p: (() => { const p = clone(BASE_P); for (const b of p.bands) if (b.t < 1) b.t = 1; return p; })() },
];
function cfAccept(k, C, P) {
  try { return ctx.nearMatch(k, C.cands, 'he', P, ctx.TERM_VETO, C.own).ok; } catch (e) { return false; }
}
/* מדד הסיכון של קבלה חדשה · המרחק לערך **אחר** במאגר פחות המרחק לערך שלך.
   ‏gap 1 = הימור בין שני כרטיסים · ‏marginHard ששולח היום דוחה רק gap<1. */
function gapOf(k, C) {
  let dOwn = Infinity;
  for (const c of C.cands) { const d = ctx.editDist(k, c); if (d < dOwn) dOwn = d; }
  const other = ctx.typoNearestOther(k, ctx.TERM_VETO, C.own);
  if (!isFinite(other)) return Infinity;
  return other - dOwn;
}

function bucketOf(card, typed, C) {
  if (acceptsToday(ctx, typed, card)) return 'today';
  if (acceptsLive(ctx, typed, card)) return 'gain';
  const k = K(typed);
  if (!k) return 'empty';
  if (isVetoedTerm(k, card, veto, ctx)) return 'veto';
  /* ‏שכבת הלקסיקון · **הפונקציה של האפליקציה עצמה**, לא שכפול. הגרסה הראשונה כאן
     סימנה "מילה אמיתית" אם **אסימון אחד** מהמחרוזת נמצא בלקסיקון, ולכן צבעה
     "אלומת אור" כמילה אמיתית בגלל "אור". ‏`typoLexWhole` בודקת רק את האסימונים
     ש**השתנו**, פוטרת אסימוני-כרטיס, ודורשת שכולם יהיו מילים · זה ההבדל בין
     ‏5,083 "קבלות-שווא" מדומות לבין המספר האמיתי. */
  if (ctx.typoLexBlocked(k, C.cands, 'he', ctx.typoTokens(C.cands))) return 'lex';
  return 'free';
}

function run() {
  const cards = Array.from(ctx.BANK);
  const stats = new Map();
  for (const c of CLASSES) stats.set(c.id, { id: c.id, he: c.he, cards: 0, n: 0, today: 0, gain: 0, veto: 0, lex: 0, free: 0, empty: 0, why: {}, byLen: {}, samples: { gain: [], free: [], veto: [] } });
  const homoPair = new Map();   // איזה זוג הומופונים עולה כמה
  const cfStats = {};

  let done = 0;
  for (const card of cards) {
    const key = baseKeyOf(card);
    if (!key) continue;
    const disp = displayForm(card.term);
    const accKeys = acceptedKeys(card, ctx);
    const C = { cands: ctx.typoKeysOf(card.term), own: new Set([K(card.term)]) };
    for (const cl of CLASSES) {
      const src = cl.base === 'key' ? key : cl.base === 'disp' ? disp : firstAlt(card.term);
      let variants;
      try { variants = cl.gen(src) || []; } catch (e) { variants = []; }
      const uniq = Array.from(new Set(variants)).filter(v => v && v !== src).sort();
      if (!uniq.length) continue;
      const S = stats.get(cl.id);
      S.cards++;
      for (const v of uniq) {
        const b = bucketOf(card, v, C);
        S.n++; S[b]++;
        if (b === 'free') { const w = whyRejected(card, v); S.why[w] = (S.why[w] || 0) + 1; }
        if (b === 'free' || b === 'veto' || b === 'lex') {
          const k = K(v);
          for (const cf of CF) if (cfAccept(k, C, cf.p)) {
            const e = cfStats[cf.id] || (cfStats[cf.id] = { per: {}, gap: {}, veto: 0, lex: 0, free: 0, ex: [] });
            e[b]++;
            const q = e.per[cl.id] || (e.per[cl.id] = 0); e.per[cl.id] = q + 1;
            if (b === 'free') {
              const g = gapOf(k, C);
              const key = !isFinite(g) ? '∞' : g <= 1 ? '≤1' : g === 2 ? '2' : '≥3';
              e.gap[key] = (e.gap[key] || 0) + 1;
              if (key === '≤1' && e.ex.length < 5) e.ex.push(`${v} → ${card.term}`);
            }
          }
        }
        if (cl.id === 'SP-HOMO') {
          const pair = pairOf(src, v);
          if (pair) { let p = homoPair.get(pair); if (!p) { p = { n: 0, live: 0, veto: 0, lex: 0, free: 0 }; homoPair.set(pair, p); } p.n++; p[b === 'today' || b === 'gain' ? 'live' : b]++; }
        }
        /* רצועת אורך · הרצועות הן הגן שנשלט, ולכן השארית חייבת להיות ממופה אליהן */
        if (b === 'free' || b === 'gain') { const L = Math.min(letters(v), 15); const e = S.byLen[L] || (S.byLen[L] = { free: 0, gain: 0 }); e[b]++; }
        if ((b === 'gain' || b === 'free' || b === 'veto') && S.samples[b].length < 6) S.samples[b].push(`${v} → ${card.term}`);
      }
    }
    if (++done % 400 === 0) process.stderr.write(`  ${done}/${cards.length}\n`);
  }
  return { cards: cards.length, stats: Array.from(stats.values()), homoPair, cfStats };
}

/* איזה זוג הומופונים הוחלף · מושווה תו-מול-תו, ואם יש יותר מהפרש אחד — null */
function pairOf(a, b) {
  if (a.length !== b.length) return null;
  let idx = -1;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (idx >= 0) return null; idx = i; }
  if (idx < 0) return null;
  const x = a[idx], y = b[idx];
  return [x, y].sort().join('/');
}

/* ===== שער שיניים · ההזרקה חייבת לשנות משהו ===== */
function teeth() {
  const cards = Array.from(ctx.BANK).slice(0, 400);
  const count = () => {
    let n = 0;
    for (const card of cards) {
      const key = baseKeyOf(card); if (!key) continue;
      for (const v of Array.from(new Set(genDouble(key))).slice(0, 4))
        if (v !== key && !acceptsToday(ctx, v, card) && acceptsLive(ctx, v, card)) n++;
    }
    return n;
  };
  const withLex = count();
  ctx.window.TYPO_LEX = null;
  const withoutLex = count();
  ctx.window.TYPO_LEX = LEX;
  const back = count();
  const ok = withLex > 0 && withoutLex === 0 && back === withLex;
  console.log(`שער שיניים · הזרקת הלקסיקון:  עם=${withLex}  בלי=${withoutLex}  חזרה=${back}  ${ok ? '✅' : '⛔'}`);
  if (!ok) { console.error('⛔ ההזרקה לא הוכיחה שיניים · acceptsLive אינו ההתנהגות המלאה. עוצר.'); process.exit(2); }
}

/* ===== פלט ===== */
function pct(a, b) { return b ? (100 * a / b).toFixed(2) : '—'; }

function main() {
  teeth();
  console.log(`\nמאגר עברי: ${ctx.BANK.length} ערכים · לקסיקון ריצה: ${LEX.n ? JSON.stringify(LEX.n) : 'טעון'}\n`);
  const t0 = Date.now();
  const R = run();
  const rows = R.stats.filter(s => s.n > 0);

  console.log('\n=== מחלקות שגיאה · נמדד על המאגר העברי המלא ===\n');
  const hdr = ['מחלקה', 'ערכים', 'וריאציות', 'today', 'gain', 'live%', 'novel-live%', 'veto', 'lex', 'free', 'free%'];
  const data = rows.map(s => {
    const live = s.today + s.gain;
    const novel = s.n - s.today;
    return [s.id, s.cards, s.n, s.today, s.gain, pct(live, s.n), pct(s.gain, novel), s.veto, s.lex, s.free, pct(s.free, s.n)];
  });
  const W = hdr.map((h, i) => Math.max(String(h).length, ...data.map(r => String(r[i]).length)));
  const line = r => r.map((x, i) => String(x).padEnd(W[i])).join(' | ');
  console.log(line(hdr)); console.log(W.map(w => '-'.repeat(w)).join('-+-'));
  for (const r of data) console.log(line(r));

  console.log('\n=== מי דוחה את השארית · ישירות מ-nearMatch ===');
  for (const s of rows) {
    if (!s.free) continue;
    const w = Object.entries(s.why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, s.free)}%`).join(' · ');
    console.log(`  ${s.id.padEnd(13)} free=${String(s.free).padEnd(6)} ${w}`);
  }

  console.log('\n=== קונטרה-פקטואל · מה כל שחרור פותח, ומה הוא מפספס ===');
  console.log('  (free = נפתח לטובה · veto/lex = מחרוזת שהיה **אסור** לקבל וששכבות ההגנה פספסו)');
  for (const cf of CF) {
    const e = R.cfStats[cf.id] || { per: {}, gap: {}, veto: 0, lex: 0, free: 0, ex: [] };
    const per = Object.entries(e.per).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, q]) => `${k} +${q}`).join(' · ');
    const gap = Object.entries(e.gap).sort().map(([k, v]) => `gap ${k}: ${v}`).join(' · ');
    console.log(`  ${cf.id.padEnd(10)} ${cf.he}`);
    console.log(`     נפתח: ${e.free}  ·  ⛔ וטו שפוספס: ${e.veto}  ·  ⛔ מילה אמיתית שפוספסה: ${e.lex}  ·  ${per}`);
    console.log(`     סיכון הקבלות החדשות · ${gap}`);
    if (e.ex.length) console.log(`     ‏gap≤1 (הימור בין שני כרטיסים): ${e.ex.slice(0, 3).join(' · ')}`);
  }

  console.log('\n=== הומופונים · לפי זוג ===');
  const hp = Array.from(R.homoPair.entries()).sort((a, b) => b[1].n - a[1].n);
  console.log('  זוג   | וריאציות | live | veto | lex  | free | free%');
  for (const [k, v] of hp) console.log(`  ${k.padEnd(5)} | ${String(v.n).padEnd(8)} | ${String(v.live).padEnd(4)} | ${String(v.veto).padEnd(4)} | ${String(v.lex).padEnd(4)} | ${String(v.free).padEnd(4)} | ${pct(v.free, v.n)}`);

  console.log('\n=== דוגמאות ===');
  for (const s of rows) {
    if (s.samples.gain.length) console.log(`  ${s.id} · נפתח היום: ${s.samples.gain.slice(0, 3).join(' · ')}`);
    if (s.samples.free.length) console.log(`  ${s.id} · שארית פנויה: ${s.samples.free.slice(0, 3).join(' · ')}`);
    if (s.samples.veto.length) console.log(`  ${s.id} · וטו: ${s.samples.veto.slice(0, 3).join(' · ')}`);
  }

  /* אגרגט לפי משקלי הדגימה של הטקסונומיה הסינתטית · המספר שה-GA רדף אחריו */
  const WSYN = { 'KB-ADJ': 2, 'KB-TRANS': 1, 'KB-DROP': 1, 'KB-DOUBLE': 1, 'SP-MATER-DEL': 0.5, 'SP-MATER-ADD': 0.5, 'SP-HOMO': 1 };
  let wn = 0, wl = 0, wg = 0, wnov = 0;
  for (const s of rows) { const w = WSYN[s.id]; if (!w) continue; wn += w * s.n; wl += w * (s.today + s.gain); wg += w * s.gain; wnov += w * (s.n - s.today); }
  console.log(`\nאגרגט במשקלי הטקסונומיה הסינתטית (6 האופרטורים בלבד):`);
  console.log(`  live על כל הווריאציות = ${pct(wl, wn)}%   ·   gain על ה-novel בלבד = ${pct(wg, wnov)}%  ← זה מה ש-23.73% מודד`);

  let an = 0, al = 0, ag = 0, anov = 0;
  for (const s of rows) { an += s.n; al += s.today + s.gain; ag += s.gain; anov += s.n - s.today; }
  console.log(`אגרגט על **כל** המחלקות (כולל אלה שהטקסונומיה לא מכילה):`);
  console.log(`  live = ${pct(al, an)}%   ·   gain על novel = ${pct(ag, anov)}%`);

  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} שניות)`);

  const out = process.argv.indexOf('--json');
  if (out > 0 && process.argv[out + 1]) {
    fs.writeFileSync(path.join(__dirname, process.argv[out + 1]), JSON.stringify({ bank: R.cards, rows }, null, 1));
    console.log(`נכתב: typo-lab/${process.argv[out + 1]}`);
  }
}

if (require.main === module) main();
module.exports = { CLASSES, HE2EN, EN2HE, displayForm, baseKeyOf };
