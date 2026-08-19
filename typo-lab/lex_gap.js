'use strict';
/* ⭐ הפער הלקסיקלי · typo-lab/lex_gap.js
 *
 *   node --max-old-space-size=6144 typo-lab/lex_gap.js            · המנייה → out/lexgap-universe.json
 *   node typo-lab/lex_gap.js --selftest                           · שיניים
 *
 * ===== השאלה =====
 *
 * ‏"האם קיימת מחרוזת שהיא **מילה אנגלית אמיתית**, שהאלגוריתם פוגש ליד מילת מאגר,
 * ושהפרדיקט של הריצה **אינו** מזהה כמילה?" אם כן — היא עולה לנו, בשני כיוונים:
 *
 *   ‏`accepted` · הבודק **מקבל** אותה → קבלת-שווא שקטה. אף שכבה אינה רואה אותה.
 *   ‏`rejected` · הבודק **דוחה** אותה → היא נכנסת לשליליות של `zngry_negatives.js`
 *                 כ"אינה מילה", מהדקת את הספים, ו**עולה recall**. זה הכיוון שממנו
 *                 חוזרות הנקודות: מילה שהלקסיקון מכיר יוצאת מהאילוץ המבני.
 *
 * ===== ⛔ הפרדיקט הנכון · זו הטעות שהפילה את התדריך =====
 *
 * הפרדיקט של הריצה **אינו** מסנן ה-Bloom לבדו. ‏`app.js:951 lexHit()`:
 *
 *     lexHit(token) = TYPO_LEX.lookup(token, lang) || TERM_VETO.has(token) || SEG_VETO.has(token)
 *
 * ובנאי הלקסיקון **מחסר במפורש** כל צורה קבילה של כל ערך במאגר, כי צורת מאגר אסור
 * לה להידחות לעולם. לכן `advice` **חייבת** להיות חסרה מה-Bloom — היא מונח מאגר
 * (יחידה 4), והצד השני של האיחוד הוא זה שעונה עליה. מדידה מול ה-Bloom לבדו מחזירה
 * "חסרה" על 3,946 מילות המאגר האנגלי כולן, וזה ארטיפקט ולא ממצא.
 *
 * ⚠ ובמצב PREVIEW (`app.js:453`) ‏`buildBank` טוען **יחידה 1 בלבד**, ולכן TERM_VETO
 * מכיל 395 מפתחות במקום 3,946. שם, ורק שם, `advice` יוצאת false ו-`angry` true.
 *
 * ===== המרחב · סגור, ולכן ניתן למנייה מלאה =====
 *
 * הבודק משווה מחרוזת מוקלדת לצורות הקבילות של הכרטיס. לכן מרחב הסכנה הוא כדור
 * מרחק-עריכה סביב כל מפתח מאגר. ‏`zngry_negatives.js` מונה **החלפה אחת באות
 * הראשונה או האחרונה בלבד** — וזה מפספס בדיוק את הצורות שהתדריך שאל עליהן
 * (‏advise→advice היא החלפה במקום 4; ‏genius→genus היא **מחיקה**). כאן נמנה
 * **כדור מרחק-1 מלא**: החלפה בכל מקום · הוספה בכל מקום · מחיקה בכל מקום ·
 * החלפת סדר של שתי אותיות סמוכות.
 *
 * ‏`--radius2` מוסיף כדור מרחק-2 **מדגמי** (‏`--sample=N` כרטיסים), כדי לתת גודל
 * לשארית שמעבר למרחק 1 בלי למנות 10^9 מחרוזות.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { getCtx, ROOT } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { makeChecker } = require('./lib/checker.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const MINLEN = 3;

/* ===== הלקסיקון הנשלח · אותו קובץ שהדפדפן טוען, ולא בנייה חוזרת ===== */
function loadShippedLex() {
  const sb = { window: {}, module: { exports: {} }, Buffer, console };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'typo-lex.js'), 'utf8'), sb, { filename: 'typo-lex.js' });
  const L = sb.window.TYPO_LEX || sb.module.exports;
  if (!L || typeof L.lookup !== 'function') throw new Error('lex_gap: typo-lex.js לא נטען');
  return L;
}

/* ===== כדור מרחק-עריכה 1 · מלא ===== */
function ball1(k) {
  const out = new Set();
  const n = k.length;
  for (let i = 0; i < n; i++) {                        // החלפה
    for (const c of ALPHA) if (c !== k[i]) out.add(k.slice(0, i) + c + k.slice(i + 1));
  }
  for (let i = 0; i <= n; i++) {                       // הוספה
    for (const c of ALPHA) out.add(k.slice(0, i) + c + k.slice(i));
  }
  for (let i = 0; i < n; i++) out.add(k.slice(0, i) + k.slice(i + 1));            // מחיקה
  for (let i = 0; i + 1 < n; i++) {                                              // החלפת סדר
    if (k[i] !== k[i + 1]) out.add(k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2));
  }
  out.delete(k);
  return out;
}

function shippedParams() {
  return JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8')).params['en-word'];
}

/* ===== המנייה ===== */
function enumerate(opts) {
  const o = opts || {};
  const ctx = getCtx('en');
  const veto = buildVeto(ctx, 'en');
  const LEX = loadShippedLex();
  const ck = makeChecker(o.params || shippedParams(), ctx, veto, 'en');

  /* ⛔ הפרדיקט של הריצה, במלואו · `app.js:951`. שינוי אחד כאן מזייף את כל המספר. */
  const inBank = t => veto.termKeys.has(t) || veto.segKeys.has(t);
  const inBloom = t => t.length >= 2 && LEX.lookup(t, 'en');
  const known = t => inBloom(t) || inBank(t);

  const cards = Array.from(ctx.BANK);
  const pick = o.sample ? cards.filter((_, i) => i % Math.ceil(cards.length / o.sample) === 0) : cards;

  /* מחרוזת → {acc:[כרטיסים שמקבלים אותה], rej:[כרטיסים שדוחים אותה]} · ייחודיות היא
     מה שנספר, כי מילה נוספת ללקסיקון פעם אחת ולא פעם לכל כרטיס. */
  const uni = new Map();
  let generated = 0, dropOwn = 0, dropBank = 0, dropBloom = 0, dropToday = 0, dropShort = 0;

  for (const card of pick) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= MINLEN);
    if (!keys.length) continue;
    const own = new Set(Array.from(acceptedKeys(card, ctx)).filter(Boolean));
    const seen = new Set();
    for (const k of keys) {
      for (const s of ball1(k)) {
        generated++;
        if (s.length < MINLEN) { dropShort++; continue; }
        if (own.has(s)) { dropOwn++; continue; }
        if (seen.has(s)) continue;
        seen.add(s);
        if (inBank(s)) { dropBank++; continue; }
        if (inBloom(s)) { dropBloom++; continue; }
        if (acceptsToday(ctx, s, card)) { dropToday++; continue; }
        const ok = ck.acceptWord(s, card).ok;
        let e = uni.get(s);
        if (!e) { e = { acc: [], rej: [] }; uni.set(s, e); }
        const tag = String(card.term) + '|' + card.unit + '|' + k;
        if (ok) { if (e.acc.length < 4) e.acc.push(tag); e.nAcc = (e.nAcc || 0) + 1; }
        else { if (e.rej.length < 4) e.rej.push(tag); e.nRej = (e.nRej || 0) + 1; }
      }
    }
  }

  const accepted = [], rejected = [];
  for (const [s, e] of uni) (e.nAcc ? accepted : rejected).push(s);

  return {
    ctx, veto, LEX, ck, known, inBank, inBloom, uni,
    cards: pick.length,
    counts: { generated, dropShort, dropOwn, dropBank, dropBloom, dropToday, unique: uni.size, accepted: accepted.length, rejected: rejected.length },
    accepted, rejected,
  };
}

function main() {
  const t0 = Date.now();
  const sampleArg = (process.argv.find(a => a.startsWith('--sample=')) || '').split('=')[1];
  const r = enumerate({ sample: sampleArg ? Number(sampleArg) : 0 });
  const c = r.counts;

  say(`מנייה · ${r.cards} כרטיסים · כדור מרחק-1 מלא · ${(Date.now() - t0) / 1000 | 0}ש`);
  say(`  נוצרו                       ${c.generated}`);
  say(`  קצרות מ-${MINLEN}                   ${c.dropShort}`);
  say(`  צורה של הכרטיס עצמו         ${c.dropOwn}`);
  say(`  ⭐ מילת מאגר (TERM/SEG_VETO) ${c.dropBank}      ← הפרדיקט מזהה אותן כמילה`);
  say(`  ⭐ במסנן ה-Bloom             ${c.dropBloom}      ← הפרדיקט מזהה אותן כמילה`);
  say(`  מתקבלות כבר בשכבה המדויקת   ${c.dropToday}`);
  say(`  ⛔ נשארות · הפרדיקט אינו מכיר אותן · ${c.unique} מחרוזות ייחודיות`);
  say(`      מהן הבודק **מקבל**  ${c.accepted}   ← קבלת-שווא בכוח`);
  say(`      מהן הבודק **דוחה**  ${c.rejected}   ← נכנסות לאילוץ ומהדקות ספים`);

  const dump = a => a.slice().sort();
  fs.writeFileSync(path.join(OUT, 'lexgap-universe.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    predicate: 'TYPO_LEX.lookup(t,"en") || TERM_VETO.has(t) || SEG_VETO.has(t)  ·  app.js:951',
    lexicon: 'typo-lex.js הנשלח · sha3b155bc6 · en.n=6375',
    radius: 1, minLen: MINLEN, cards: r.cards, counts: c,
    accepted: dump(r.accepted), rejected: dump(r.rejected),
  }));
  say(`\nנכתב · out/lexgap-universe.json`);
  return r;
}

/* ===== שיניים ===== */
function selftest() {
  let fail = 0;
  const t = (name, cond, extra) => { say((cond ? '✅ ' : '⛔ ') + name + (extra ? ' · ' + extra : '')); if (!cond) fail++; };

  const b = ball1('cat');
  t('ball1 · החלפה', b.has('bat') && b.has('cot') && b.has('cab'));
  t('ball1 · הוספה', b.has('cart') && b.has('scat') && b.has('cats'));
  t('ball1 · מחיקה', b.has('at') && b.has('ct') && b.has('ca'));
  t('ball1 · החלפת סדר', ball1('form').has('from'));
  t('ball1 · אינו מכיל את עצמו', !b.has('cat'));
  /* השן שסופרת · הכדור המלא **חייב** להכיל צורות שהמנייה הישנה (ראשונה/אחרונה בלבד)
     מפספסת. בלי זה אין הצדקה לקובץ הזה. */
  t('ball1 ⊃ מה שהמנייה הישנה מפספסת', ball1('advise').has('advice') && ball1('genius').has('genus'),
    'advise→advice (החלפה במקום 4) · genius→genus (מחיקה)');

  const ctx = getCtx('en');
  const veto = buildVeto(ctx, 'en');
  const LEX = loadShippedLex();
  const known = s => (s.length >= 2 && LEX.lookup(s, 'en')) || veto.termKeys.has(s) || veto.segKeys.has(s);
  t('הפרדיקט המלא מזהה את שש הדוגמאות של התדריך',
    ['advice', 'angry', 'genus', 'wing', 'evoke', 'part'].every(known),
    'כולן מונחי מאגר · חסרות מה-Bloom בכוונה');
  t('הפרדיקט אינו מזהה מחרוזת שאינה מילה', !known('zngry') && !known('qgainst'));
  /* שן על ה-Bloom · אם מישהו יחליף אותו בקובץ ריק, זה יאדים */
  t('ה-Bloom הנשלח חי', LEX.lookup('water', 'en') && LEX.lookup('table', 'en') && !LEX.lookup('zzzqx', 'en'));

  say(fail ? `\n⛔ ${fail} כשלים` : '\n✅ כל השיניים');
  process.exit(fail ? 1 : 0);
}

if (require.main === module) { if (process.argv.includes('--selftest')) selftest(); else main(); }
module.exports = { enumerate, ball1, loadShippedLex, shippedParams, main };
