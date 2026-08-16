'use strict';
/* he_search_probe.js · מרחב התכן העברי · חמש ההשערות, במדידה
 *
 * מריץ את nearMatch **המורמת מ-app.js** (לא מימוש שני) עם הלקסיקון מוזרק, בדיוק
 * כמו graded_runtime_probe. כל מספר כאן הוא של הריצה האמיתית.
 *
 *   node typo-lab/he_search_probe.js --stage 0     · אוריינטציה · ניקוד, נרמול, לקסיקון
 *   node typo-lab/he_search_probe.js --stage 1     · יקום ההקלדות + שארית מלאה לגנום נתון
 *   node typo-lab/he_search_probe.js --stage 5     · מונה הדו-משמעות
 */

const fs = require('fs');
const path = require('path');
const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const STAGE = val('--stage', '0');

const { loadApp } = require(path.join(ROOTD, 'tests', '_harness', 'sandbox.js'));
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');

const LEX_PATH = path.join(ROOTD, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;

function appCtx(lang) {
  const c = loadApp({ lang });
  if (LEX) c.window.TYPO_LEX = LEX;
  return c;
}

const HE_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

/* ===== שלב 0 · אוריינטציה ===== */
function stage0() {
  const ctx = getCtx('he');
  const app = appCtx('he');
  const cards = Array.from(ctx.BANK);
  say(`מאגר עברי · ${cards.length} ערכים`);
  say(`לקסיקון · ${LEX ? 'נטען' : '⛔ חסר'} · TYPO_LEX ב-app = ${!!app.window.TYPO_LEX}`);

  /* ניקוד · האם המונחים מנוקדים, ומה K עושה להם */
  const NIQQUD = /[֑-ׇ]/;
  let pointed = 0;
  for (const c of cards) if (NIQQUD.test(String(c.term))) pointed++;
  say(`מונחים שיש בהם ניקוד/טעמים: ${pointed} / ${cards.length} (${(100 * pointed / cards.length).toFixed(1)}%)`);

  /* האם K מסיר ניקוד משני הצדדים */
  const probes = ['מְגֻבָּב', 'מגובב', 'מגבב', 'אָמִיר', 'אמיר', 'שָׁוְא', 'שווא', 'שוא'];
  say('');
  say('K() על מחרוזות מנוקדות ולא-מנוקדות:');
  for (const p of probes) say(`   "${p}" → "${app.K(p)}"`);

  /* ניקוד חלקי / שגוי מצד הלומד */
  const card0 = cards.find(c => NIQQUD.test(String(c.term)));
  say('');
  say(`דוגמה · ${card0.term} · K=${app.K(card0.term)}`);
  const bare = String(card0.term).replace(/[֑-ׇ]/g, '');
  const partial = String(card0.term).replace(/[֑-ׇ]/, '');   // הסרת סימן אחד
  const wrong = String(card0.term).replace(/[֑-ׇ]/, 'ָ'); // קמץ במקום מה שהיה
  for (const [name, s] of [['בלי ניקוד', bare], ['ניקוד חלקי', partial], ['ניקוד שגוי', wrong]]) {
    say(`   ${name.padEnd(12)} "${s}" → K="${app.K(s)}" · isCorrect=${app.isCorrect(s, card0.term)}`);
  }

  /* כמה מהמאגר נורמלי אחרי K · התפלגות אורך */
  const lens = new Map();
  for (const c of cards) {
    const k = app.K(c.term);
    const L = String(k).replace(/ /g, '').length;
    lens.set(L, (lens.get(L) || 0) + 1);
  }
  say('');
  say('התפלגות אורך המפתח (אחרי K, בלי רווחים):');
  const ks = Array.from(lens.keys()).sort((a, b) => a - b);
  say('   ' + ks.map(k => `${k}:${lens.get(k)}`).join(' · '));

  /* לקסיקון · כיסוי בפועל על מפתחות המאגר ועל אי-מילים */
  let inLex = 0;
  for (const c of cards) { if (LEX && LEX.lookup(app.K(c.term), 'he')) inLex++; }
  say('');
  say(`מפתחות מאגר שהלקסיקון מכיר: ${inLex} / ${cards.length}`);
  const junk = [];
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 5000; i++) {
    let w = '';
    const L = 3 + Math.floor(rnd() * 5);
    for (let j = 0; j < L; j++) w += HE_LETTERS[Math.floor(rnd() * HE_LETTERS.length)];
    junk.push(w);
  }
  let fp = 0;
  for (const w of junk) if (LEX && LEX.lookup(w, 'he')) fp++;
  say(`FPR נמדד על 5,000 מחרוזות אקראיות: ${(100 * fp / junk.length).toFixed(3)}%`);
}

/* ===== יקום ההקלדות ===== */
/* לכל מפתח · כל וריאציה בעריכה אחת, מסווגת לפי מחלקת האופרטור של app.js.
   המחלקות זהות ל-typoInsKind/typoDelKind/typoSubKind כדי שהשיוך לא יסטה. */
function variantsOf(key, HOMO, ADJ) {
  const out = [];      // {v, op}
  const a = String(key);
  const seen = new Set();
  const push = (v, op) => {
    if (!v || v === a) return;
    if (/^\s|\s$|\s\s/.test(v)) return;
    const t = op + '|' + v;
    if (seen.has(t)) return;
    seen.add(t);
    out.push({ v, op });
  };
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === ' ') continue;
    // מחיקה · mater אם ו/י, doubleLetter אם שכן זהה, אחרת del
    const del = a.slice(0, i) + a.slice(i + 1);
    let dk = 'del';
    if (c === 'ו' || c === 'י') dk = 'materVI';
    else if (a[i - 1] === c || a[i + 1] === c) dk = 'doubleLetter';
    push(del, dk);
    // הכפלה
    push(a.slice(0, i) + c + a.slice(i), 'doubleLetter');
    // transpose
    if (i + 1 < a.length && a[i + 1] !== ' ' && a[i + 1] !== c) push(a.slice(0, i) + a[i + 1] + c + a.slice(i + 2), 'transpose');
    // החלפות
    for (const x of HE_LETTERS) {
      if (x === c) continue;
      const v = a.slice(0, i) + x + a.slice(i + 1);
      let sk = 'sub';
      if ((HOMO[c] || '').indexOf(x) >= 0) sk = 'homophone';
      else if ((ADJ[c] || '').indexOf(x) >= 0) sk = 'adjSub';
      push(v, sk);
    }
  }
  // הכנסות · ו/י = materVI, אחרת ins
  for (let i = 0; i <= a.length; i++) {
    for (const x of HE_LETTERS) {
      const v = a.slice(0, i) + x + a.slice(i);
      if (v === a) continue;
      let ik = 'ins';
      if (x === 'ו' || x === 'י') ik = 'materVI';
      else if (a[i - 1] === x || a[i] === x) ik = 'doubleLetter';
      push(v, ik);
    }
  }
  return out;
}

module.exports = { variantsOf, appCtx, HE_LETTERS, LEX };

if (require.main === module) {
  if (STAGE === '0') stage0();
  else { say('שלב לא מוכר'); process.exit(2); }
}
