'use strict';
/* שער חלק-הדיבר · typo-lab/he_verb_gate.js
 *
 *   node typo-lab/he_verb_gate.js --emit          → out/panel/vg-*.tsv   (קלט לתיוג)
 *   node typo-lab/he_verb_gate.js --score         → השארית המלאה, עם ובלי השער
 *   node typo-lab/he_verb_gate.js --selftest      → שיניים
 *
 * ===== מאיפה החוק הזה =====
 *
 * חגי תייג 40 זוגות בעיוור ואז מיין את 29 הדחיות לפי **סיבת** הדחייה:
 *   22 · הכלל החיל מורפולוגיה של פועל על מילה שאינה פועל, או ייצר לא-מילה
 *    7 · שינוי בניין אמיתי בין שני פעלים, שמשנה משמעות
 * כלומר הבעיה המרכזית **אינה** סחיפה סמנטית אלא **ניתוח דקדוקי שגוי**: הכלל מזהה
 * את `צבר`, `כלל`, `חור`, `דבר` ואפילו את מילת היחס `אחר` כפועל בעבר, ומטה אותם.
 *
 * ומכאן החוק שנמדד כאן, והוא הצר ביותר שנשאר על השולחן:
 *
 *     **`pa-act` (‏עבר ↔ בינוני, אותו בניין) · ורק כשמילת המקור היא פועל.**
 *
 * ‏5 מתוך 7 התיוגים החיוביים של חגי הם בדיוק הצורה הזאת (‏הרג→הורג, צרב→צורב,
 * רשם→רושם, עקב→עוקב, ערך→עורך). אף אחד מ-29 הדחיות אינו.
 *
 * ===== למה שער חלק-דיבר ולא שער סמנטי =====
 *
 * ‏"האם `צבר` הוא פועל כאן" היא שאלה **שאינה תלויה במאגר**, ולכן היא שורדת את
 * החלפת המאגר בספטמבר. ‏"האם הזוג הזה משנה משמעות" תלוי בזוג, ורשימת זוגות שנגזרה
 * מהפירושים של היום תפוג. שני השערים נמדדים כאן **בנפרד** · כמה כל אחד תופס לבד,
 * וכמה נשאר אחרי שניהם.
 *
 * ===== שלב 6 · השארית נמנית במלואה =====
 *
 * ⚠ זה הסעיף שהפיל את הסבב הקודם. לא סופרים כמה נפסלו — סופרים **את כל מה שהחוק
 * מקבל**, כולל מחרוזות שאינן מילה כלל, וכולל מילים עבריות אמיתיות שאף ווטו אינו
 * רואה. הפילטר `plausible` של `he_morph_split` **אינו** בשימוש כאן בכוונה: הוא
 * מתאר מה לומד יכתוב, לא מה החוק מקבל, ובלבול ביניהם הוא בדיוק הכשל של אתמול.
 */

const fs = require('fs');
const path = require('path');

const { loadApp } = require(path.join(__dirname, '..', 'tests', '_harness', 'sandbox.js'));
const M = require('./lib/morphrules.js');

const ROOTD = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PANEL = path.join(OUT, 'panel');
const LEX_PATH = path.join(ROOTD, 'typo-lex.js');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const numArg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
const say = s => process.stdout.write(s + '\n');
const strip = s => String(s).replace(/[֑-ׇ]/g, '');

const PARAMS = { pairs: ['pa-act'], strictRoot: false };
const LANGS = ['he', 'en'];

let LEX = null;
try { LEX = require(path.join(OUT, 'runtime-lexicon.js')); } catch (e) { LEX = null; }

function ctxFor(lang) {
  const c = loadApp({ lang });
  /* ⛔ ‏catch ריק כאן היה מכבה את שכבת הסובלנות בשקט, מנפח את "אינו מתקבל היום",
     ומשאיר את השיניים ירוקות · המבקר תפס את זה. נופל בשמו. */
  c.window.TYPO_LEX = require(LEX_PATH);
  return c;
}

/* ===== מנייה מלאה של מה שהחוק מקבל =====
   לכל כרטיס בשתי השפות, לכל מקטע פירוש בן מילה אחת שהחוק מתאים לו — הצורה השנייה.
   בלי שום פילטר סבירות. */
function enumerateAll() {
  const rows = [];
  for (const lang of LANGS) {
    const c = ctxFor(lang);
    const bank = Array.from(c.BANK);
    /* יקום התביעה · מקטע מנורמל → כרטיסים שהוא תשובה קבילה שלהם, ומפתחות המונחים */
    const claim = new Map();
    const termKeys = new Map();
    for (const w of bank) {
      for (const s of Array.from(c.meaningSegs(w.meaning))) {
        if (!s) continue;
        if (!claim.has(s)) claim.set(s, []);
        claim.get(s).push(w);
      }
      const k = c.K(w.term);
      if (k) { if (!termKeys.has(k)) termKeys.set(k, []); termKeys.get(k).push(w); }
    }
    const allowOf = w => { const s = new Set([c.K(w.term)]); for (const t of Array.from(c.glossAlts(w))) s.add(c.K(t)); return s; };

    for (let ci = 0; ci < bank.length; ci++) {
      const card = bank[ci];
      const segs = Array.from(c.meaningSegs(card.meaning)).filter(Boolean);
      const own = new Set(segs);
      const allow = allowOf(card);
      for (const seg of segs) {
        if (seg.split(' ').filter(Boolean).length !== 1) continue;
        for (const v of M.binyanPair.expand([seg], c, PARAMS)) {
          if (own.has(v)) continue;
          if (!M.binyanPair.accepts(v, segs, c, PARAMS)) continue;
          if (c.meaningMatch(v, card.meaning)) continue;                 // כבר מתקבל היום
          const owners = (claim.get(v) || []).filter(o => o !== card && !allow.has(c.K(o.term)));
          const asTerm = (termKeys.get(v) || []).filter(o => o !== card && !allow.has(c.K(o.term)));
          rows.push({
            key: lang[0].toUpperCase() + ci + '.' + seg,
            lang, term: strip(card.term), meaning: String(card.meaning),
            word: seg, typed: v,
            collide: owners.length ? strip(owners[0].term) : '',
            termTaken: asTerm.length ? strip(asTerm[0].term) : '',
            real: LEX ? !!LEX.lookup(v, 'he') : null,
          });
        }
      }
    }
  }
  return rows;
}

/* ===== קריאת תיוגי חלק-הדיבר ===== */
function readPos() {
  const out = new Map();                          // key → { A, B, VG }
  if (!fs.existsSync(PANEL)) return out;
  for (const f of fs.readdirSync(PANEL)) {
    const m = /^(?:pos-verdict-([AB])|vg-verdict)-\d+\.tsv$/.exec(f);
    if (!m) continue;
    const who = m[1] || 'VG';
    for (const line of fs.readFileSync(path.join(PANEL, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [k, t] = line.split('\t');
      if (!k || k === 'key') continue;
      const v = String(t || '').trim();
      if (!v || !'פשתא'.includes(v)) continue;
      /* ⛔ שני מרחבי מפתחות לאותו דבר · `P<idx>.<word>` (שופטי A/B) מול
         `H<idx>.<word>` (שופט VG). שניהם ממופתחים על **אותו** אינדקס במאגר העברי,
         ובלי האיחוד הזה 354 התיוגים של A/B לא התאימו לאף שורה, וכל 131 החלטות
         השער נשענו על שופט יחיד — כשענף "אי-הסכמה חוסמת" בשיניים מעולם לא רץ.
         המבקר תפס את זה. ‏`E…` (אנגלית) נשאר כשלעצמו · אין לו תאום ב-P. */
      for (const kk of (k[0] === 'P' ? ['P' + k.slice(1), 'H' + k.slice(1)] : [k])) {
        if (!out.has(kk)) out.set(kk, {});
        out.get(kk)[who] = v;
      }
    }
  }
  return out;
}
/* השער · פועל, ובספק — חסום. שני שופטים שאינם מסכימים = ספק. */
const isVerb = tags => {
  if (!tags) return false;
  const vals = ['A', 'B', 'VG'].map(k => tags[k]).filter(Boolean);
  if (!vals.length) return false;
  return vals.every(v => v === 'פ');
};

function emit(batchSize) {
  const rows = enumerateAll();
  const seen = new Set(); const items = [];
  for (const r of rows) { if (seen.has(r.key)) continue; seen.add(r.key); items.push(r); }
  fs.mkdirSync(PANEL, { recursive: true });
  for (const f of fs.readdirSync(PANEL)) if (/^vg-\d+\.tsv$/.test(f)) fs.unlinkSync(path.join(PANEL, f));
  const n = Math.ceil(items.length / batchSize);
  for (let b = 0; b < n; b++) {
    const sl = items.slice(b * batchSize, (b + 1) * batchSize);
    fs.writeFileSync(path.join(PANEL, `vg-${b + 1}.tsv`),
      ['key\tterm\tmeaning\tword'].concat(sl.map(x => [x.key, x.term, x.meaning.replace(/[\t\n]/g, ' '), x.word].join('\t'))).join('\n') + '\n', 'utf8');
  }
  say(`‏pa-act · יקום הקבלה המלא · ${items.length} מחרוזות · ${n} אצוות של עד ${batchSize}`);
  say(`פילוח שפה · he ${items.filter(x => x.lang === 'he').length} · en ${items.filter(x => x.lang === 'en').length}`);
}

function score() {
  const rows = enumerateAll();
  const P = readPos();
  const line = (name, sel) => {
    const s = rows.filter(sel);
    const col = s.filter(r => r.collide).length;
    const tt = s.filter(r => !r.collide && r.termTaken).length;
    const rest = s.filter(r => !r.collide && !r.termTaken);
    const real = rest.filter(r => r.real).length;
    return { name, n: s.length, col, tt, rest: rest.length, real, restRows: rest };
  };
  const all = line('כל היקום · בלי שער', () => true);
  /* ⚠ ההשוואה חייבת להיות על **אותה** תת-קבוצה. ‏1,246 מול N-מתויגות-ופועל אינה
     מדידה של השער אלא של כמה תייגנו · וזה בדיוק סוג הירוק שנובע מאי-בדיקה. */
  const subAll = line('התת-קבוצה המתויגת · בלי שער', r => P.has(r.key));
  const gated = line('אותה תת-קבוצה · **עם** שער חלק-דיבר', r => isVerb(P.get(r.key)));
  const tagged = subAll.n;

  say('# ‏pa-act · השארית המלאה · שלב 6');
  say('');
  say(`יקום הקבלה: **${all.n}** מחרוזות שהחוק מקבל ואינן מתקבלות היום.`);
  say(`מתויגות בחלק-דיבר: **${tagged}** (‏he במלואו + חלק מ-en) · השאר לא נמדד, ולכן חסום.`);
  say('');
  say('| | מחרוזות | התנגשות-פירוש | מונח תפוס | **שארית** | **מילים עבריות אמיתיות בשארית** |');
  say('|---|---|---|---|---|---|');
  for (const x of [all, subAll, gated]) {
    say(`| ${x.name} | ${x.n} | ${x.col} | ${x.tt} | **${x.rest}** | **${x.real}** (${x.rest ? (100 * x.real / x.rest).toFixed(1) : 0}%) |`);
  }
  say('');
  say(`**מה השער קונה, על אותה תת-קבוצה:** שארית ${subAll.rest} → ${gated.rest} · מילים אמיתיות ${subAll.real} → ${gated.real}.`);
  say('');
  say('⚠ **"מילה אמיתית" הוא חסם תחתון.** לקסיקון-הריצה בנוי מהטקסטים שלנו פחות כל צורה');
  say('קבילה במאגר, ולכן הוא מחזיר `false` גם על מילים אמיתיות שהמאגר משתמש בהן.');
  say('כל מחרוזת בשארית שאינה מילה כלל היא **גם** קבלה שגויה — היא פשוט לא נספרת כאן.');
  say('');
  say('## המילים האמיתיות ששורדות את שער חלק-הדיבר · כל אחת בשמה');
  say('');
  const surv = gated.restRows.filter(r => r.real);
  for (const r of surv) say(`  · [${r.lang}] ${r.term} ← "${r.typed}"  (מקור "${r.word}") · ${r.meaning.slice(0, 60)}`);
  if (!surv.length) say('  (אין)');

  fs.writeFileSync(path.join(OUT, 'verb-gate.json'), JSON.stringify({
    generated: 'typo-lab/he_verb_gate.js --score', rule: 'pa-act + verb-gate',
    all: { n: all.n, collide: all.col, termTaken: all.tt, rest: all.rest, real: all.real },
    gated: { n: gated.n, collide: gated.col, termTaken: gated.tt, rest: gated.rest, real: gated.real },
    tagged, survivors: surv.map(r => ({ lang: r.lang, term: r.term, typed: r.typed, from: r.word })),
    accepts: gated.restRows.map(r => ({ lang: r.lang, term: r.term, typed: r.typed, real: r.real })),
  }, null, 0), 'utf8');
  say('');
  say('נכתב · out/verb-gate.json');
}

function selftest() {
  let ok = true;
  const t = (c, m) => { say(`  ${c ? '✅' : '⛔'} ${m}`); if (!c) ok = false; };
  t(!!LEX, 'לקסיקון-הריצה נטען · בלעדיו עמודת "מילה אמיתית" ריקה והמדידה חסרת ערך');
  /* השער · ספק חוסם */
  t(isVerb({ A: 'פ', B: 'פ' }), 'שני שופטים "פועל" ⇒ עובר');
  t(!isVerb({ A: 'פ', B: 'ש' }), 'אי-הסכמה ⇒ חסום · ספק אינו קבלה');
  t(!isVerb({ A: 'ש', B: 'ש' }), 'שניהם "שם עצם" ⇒ חסום');
  t(!isVerb(undefined), 'מילה בלי תיוג ⇒ חסומה · היעדר מדידה אינו היתר');
  /* ⭐ הענף שמעולם לא רץ · השיניים היו ירוקות עליו כי אף שורה לא הגיעה אליו */
  const P = readPos();
  const sig = new Map();
  for (const v of P.values()) { const s2 = ['A', 'B', 'VG'].filter(x => v[x]).join('+'); sig.set(s2, (sig.get(s2) || 0) + 1); }
  const multi = Array.from(sig.entries()).filter(([k2]) => k2.includes('+')).reduce((n, [, v]) => n + v, 0);
  t(multi > 0, `יש מפתחות עם יותר משופט אחד · ${multi} · חתימות: ${Array.from(sig.entries()).map(([a, b2]) => a + '=' + b2).join(' ')}`);
  /* המחולל · הזוג המתועד */
  const c = ctxFor('he');
  const g = M.binyanPair.expand(['עקב'], c, PARAMS);
  t(g.has('עוקב'), 'המחולל מייצר עקב → עוקב · אחד מחמשת התיוגים החיוביים של חגי');
  const g2 = M.binyanPair.expand(['צבר'], c, PARAMS);
  t(g2.has('צובר'), 'והוא מייצר גם צבר → צובר · שחגי פסל, כי צבר כאן שם עצם');
  say('  ℹ שתי השורות למעלה הן בדיוק מה שהשער אמור להפריד · אותו מחולל, פסק הפוך');
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  if (has('--emit')) emit(numArg('--batch', 130));
  else if (has('--score')) score();
  else if (has('--selftest')) { say('## שיניים · שער חלק-הדיבר'); selftest(); }
  else say('שימוש: --emit | --score | --selftest');
}
module.exports = { enumerateAll, readPos, isVerb, PARAMS };
