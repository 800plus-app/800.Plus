'use strict';
/* he_delta_residue.js · השארית ה**נוספת** של מועמד · הדלי היחיד שמעניין
 *
 * לא "מה המועמד מקבל" אלא "מה הוא מקבל שהיום נדחה". זה הדלי שאפשר לשפוט: כל השאר
 * כבר נשלח וכבר חי אצל משתמשים.
 *
 * ⚠ מסונן למפתחות **מילה אחת** בלבד. יקום הצירופים מייצר מחרוזות כמו
 * "אווטווביווגרפיהי" שאף לומד לא יקליד, והן מרעילות כל דגימה לפאנל.
 *
 *   node typo-lab/he_delta_residue.js --tag OP-homo [--sample 300]
 */
const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const { appCtx, variantsOf, LEX } = require('./he_search_probe.js');
const say = s => process.stdout.write(s + '\n');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAG = val('--tag', 'OP-homo');
const NS = parseInt(val('--sample', '300'), 10);

const ctx = getCtx('he'), app = appCtx('he');
const cards = Array.from(ctx.BANK);
const HOMO = app.TYPO_HOMO, ADJ = app.TYPO_ADJ_HE;
const BASE = JSON.parse(JSON.stringify(app.TYPO_PARAMS['he-word']));

const V = {
  'OP-homo': P => { P.WTight.homophone = 1.7; return P; },
  'OP-mater': P => { P.WTight.materVI = 1.7; return P; },
  'OP-adjSub': P => { P.WTight.adjSub = 1.7; return P; },
  'BAND0-safe': P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 0.65 } : b)); return P; },
  'BAND0-mater': P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 1.8 } : b)); return P; },
  COMBO: P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 1.8 } : b)); P.WTight.homophone = 1.7; P.WTight.materVI = 1.7; return P; },
};
const CAND = V[TAG](JSON.parse(JSON.stringify(BASE)));

const keyOwners = new Map();
for (const c of cards) for (const k of acceptedKeys(c, ctx)) {
  let s = keyOwners.get(k); if (!s) { s = new Set(); keyOwners.set(k, s); }
  s.add(app.K(c.term));
}

const delta = [];
let nBank = 0, nLex = 0;
for (const card of cards) {
  const forms = Array.from(acceptedKeys(card, ctx));
  const fset = new Set(forms);
  const own = new Set([app.K(card.term)]);
  const seen = new Set();
  for (const f of forms) {
    if (String(f).includes(' ')) continue;                 // ⚠ מילה אחת בלבד
    for (const { v, op } of variantsOf(f, HOMO, ADJ)) {
      if (fset.has(v) || seen.has(v)) continue;
      seen.add(v);
      const b = app.nearMatch(v, forms, 'he', BASE, app.TERM_VETO, own).ok;
      if (b) continue;                                     // כבר מתקבל היום
      const c = app.nearMatch(v, forms, 'he', CAND, app.TERM_VETO, own).ok;
      if (!c) continue;
      const owners = keyOwners.get(v);
      const isBank = owners && Array.from(owners).some(o => o !== app.K(card.term));
      const isLex = LEX.lookup(v, 'he');
      if (isBank) nBank++; if (isLex) nLex++;
      delta.push({ v, term: card.term, op, bank: !!isBank, lex: !!isLex });
    }
  }
}
say(`${TAG} · שארית נוספת על מפתחות מילה-אחת: ${delta.length.toLocaleString()}`);
say(`   מהן מפתח מאגר אחר: ${nBank} · מהן מילה בלקסיקון: ${nLex}`);
const byOp = new Map();
for (const d of delta) byOp.set(d.op, (byOp.get(d.op) || 0) + 1);
say('   לפי אופרטור גנרטיבי: ' + Array.from(byOp).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o}:${n}`).join(' · '));

let s = 777001;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pool = delta.filter(d => !d.bank && !d.lex).map(d => d.v);
const samp = [];
const p2 = pool.slice();
for (let i = 0; i < NS && p2.length; i++) samp.push(p2.splice(Math.floor(rnd() * p2.length), 1)[0]);
const OUT = path.join(__dirname, 'out');
fs.writeFileSync(path.join(OUT, `he-delta.${TAG}.json`), JSON.stringify(delta, null, 0));
fs.writeFileSync(path.join(OUT, `he-delta-sample.${TAG}.txt`), samp.join('\n'));
say(`   דגימה לפאנל: ${samp.length} מתוך ${pool.length} (‏אחרי סינון מאגר+לקסיקון) → out/he-delta-sample.${TAG}.txt`);
say('   ראשונות: ' + samp.slice(0, 15).join(' · '));
